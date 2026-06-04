// src/widget/migrationBackupGc.ts
//
// Phase 21 Plan 21-04 — 30-day TTL cleanup of v1.2 → v1.3 migration backup
// folders. Fire-and-forget microtask invoked from `Plugin.onload()` (per
// D-backup-03). Runs UNCONDITIONALLY regardless of `useInlineWidget` —
// backups exist on disk regardless of the current widget setting (a user
// who toggles `useInlineWidget=OFF` for testing must not lose their backup
// retention semantics).
//
// Decision references (locked per .planning/phases/21-v1-2-migration/21-CONTEXT.md):
//   D-backup-03 — fire-and-forget microtask in Plugin.onload; lists backup
//                 folders, parses ISO timestamp, deletes those older than
//                 30 days. Runs unconditionally.
//   MIGRATE-05  — 30-day TTL backup cleanup as a release requirement.
//
// Threats mitigated (per .planning/phases/21-v1-2-migration/21-04-PLAN.md +
//                    .planning/phases/21-v1-2-migration/21-06-PLAN.md):
//   T-21-gc       — strict folder-name regex (Plan 21-04) rejects any non-backup
//                   folder under the plugin directory; non-backup folders (e.g.
//                   `data`, `cache`) are NEVER deleted by this routine.
//                   Tightened in Plan 21-06 (CR-03) to require LC-slug shape
//                   `[a-z0-9][a-z0-9-]*[a-z0-9]` — non-LC-shape folders
//                   (uppercase, mixed-case, single-char, leading/trailing
//                   hyphen) are guaranteed NEVER to match.
//   T-21-pitfall-4 — adapter.list rejection (likely first-install: plugin
//                    folder does not yet exist) caught + debug-logged + return.
//                    Plugin onload NEVER blocks on a missing-directory throw.
//   T-21-pitfall-5 — TTL math direction is `now - parsed > TTL_MS`. A 29-day-
//                    old folder remains; a 31-day-old folder is deleted. The
//                    direction is verified by Test 2 + Test 3 in the unit
//                    suite.
//   T-21-load     — fire-and-forget microtask via Promise.resolve().then(...);
//                    NEVER awaited; NEVER setTimeout. Keeps cleanup inside
//                    the same tick but off the critical-path of plugin
//                    initialization.
//
// Pattern S-05 (silent-on-failure best-effort wrapper): every adapter.list
// + adapter.rmdir call is wrapped in its own try/catch with logger.debug.
// Errors NEVER surface as a Notice; the user is never disturbed by a
// background-cleanup failure.

import type { App } from 'obsidian';
import { logger } from '../shared/logger';

/**
 * Plugin folder under the vault config dir. Backup folders live as siblings.
 *
 * Built from `app.vault.configDir` (NOT a hardcoded `.obsidian/`) — Obsidian
 * users may configure a non-default config folder via the launch flag
 * `--config-dir`, and the rule `obsidianmd/hardcoded-config-path` requires
 * code to honour that. The plugin id `obsidian-leetcode` IS hardcoded —
 * it's literally this plugin's id.
 */
function pluginBackupRoot(app: App): string {
  return `${app.vault.configDir}/plugins/obsidian-leetcode`;
}

/**
 * Strict folder-name regex (T-21-gc mitigation). Captures:
 *   group 1 — the LC slug (LC-slug-shape: lowercase alphanumeric + hyphens;
 *             starts AND ends with [a-z0-9]; minimum 2 characters)
 *   group 2 — the sanitized ISO timestamp (`YYYY-MM-DDTHH-MM-SSZ` — `:` was
 *             replaced with `-` for cross-OS filesystem safety per
 *             D-backup-01).
 *
 * Anything that doesn't match — e.g. `data`, `cache`, `migration-backup-foo`
 * (no ISO), `migration-backup-foo-2026-06-01` (no time), `migration-backup-FOO-...`
 * (uppercase), `migration-backup-a-...` (single char), `migration-backup--leading-...`
 * (leading hyphen) — is skipped. The routine NEVER deletes a folder that
 * does not match this regex.
 *
 * EXPORTED — single source of truth (Plan 21-06 CR-02). Reused by
 * `src/widget/fenceMigrator.ts:backupAlreadyExistsForSlug` to verify
 * the partial-failure retry path's pre-existence check uses the SAME
 * shape constraint that the GC sweep enforces. NO regex literal duplication.
 *
 * Tightened in Plan 21-06 (CR-03):
 *   from /^migration-backup-(.+)-(\d{4}-...)Z$/  (greedy, no char class)
 *   to   /^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{4}-...)Z$/
 * The slug character class `[a-z0-9]...[a-z0-9]` enforces the LC slug
 * convention (per leetcode.com — slugs are lowercase alphanumeric + hyphens,
 * 2+ chars, no leading/trailing hyphen). Multi-segment slugs (`foo-bar-baz`)
 * still match because the body class `[a-z0-9-]*` accepts hyphens internally.
 */
export const BACKUP_FOLDER_RE =
  /^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/;

/** 30 days in milliseconds (T-21-pitfall-5 — direction is `now - parsed > TTL_MS`). */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Plan 21-06 WR-05 — module-level concurrency lock.
 *
 * Second concurrent call to `runMigrationBackupGc` returns immediately at
 * debug level; the lock is reset in `finally` so transient errors don't
 * permanently disable the GC. The lock is module-scoped (not instance-
 * scoped) because there is at most one cleanup routine across the plugin
 * lifetime — a single in-flight sweep is sufficient to satisfy MIGRATE-05's
 * TTL contract.
 *
 * On plugin reload (module re-import), the lock resets to `false` naturally
 * — no leak.
 */
let gcRunning = false;

/**
 * Test-only helper. Resets the module-level `gcRunning` lock to `false`.
 * Used by vitest `beforeEach` / `afterEach` to ensure hermeticity between
 * tests (the lock is module-scoped, so a test that holds it open must not
 * bleed into the next test).
 *
 * NOT for production use. Production code MUST NOT call this — the lock
 * is reset automatically by the `finally` block in `runMigrationBackupGc`.
 *
 * Plan 21-06 WR-05.
 */
export function __resetGcRunningForTesting(): void {
  gcRunning = false;
}

/**
 * Reverse the `:` → `-` substitution in the captured ISO suffix so
 * `Date.parse(iso)` succeeds. The captured suffix has shape
 *   `YYYY-MM-DDTHH-MM-SSZ`
 * Reconstruct
 *   `YYYY-MM-DDTHH:MM:SSZ`
 * by replacing the time-portion `-` with `:` (only the two `-` after the
 * `T`). Date.parse returns NaN if the string is malformed; callers handle
 * that.
 */
function parseSanitizedIso(captured: string): number {
  const iso = captured.replace(
    /T(\d{2})-(\d{2})-(\d{2})Z$/,
    'T$1:$2:$3Z',
  );
  return Date.parse(iso);
}

/**
 * Run the 30-day TTL backup cleanup. Fire-and-forget microtask owned by
 * `Plugin.onload()`. Never throws to caller (silent-on-failure per
 * Pattern S-05); never blocks plugin readiness.
 *
 * Steps:
 *   1. List `pluginBackupRoot(app)` via `adapter.list`. On rejection (likely
 *      first-install vault — plugin folder does not yet exist), debug-log
 *      and return.
 *   2. For each folder under that base dir, strip the prefix to get the
 *      bare folder name; skip if it doesn't match the strict regex.
 *   3. Parse the ISO timestamp from the regex match; skip on NaN.
 *   4. If `Date.now() - parsed > TTL_MS`, delete via `adapter.rmdir(path,
 *      true)` inside its own try/catch.
 *
 * Pure side-effect surface: logger.debug + adapter.list + adapter.rmdir.
 * No registered events, no global state, no Date dependency outside of
 * `Date.now()` (so tests can mock the system clock via `vi.useFakeTimers`
 * + `vi.setSystemTime`).
 */
export async function runMigrationBackupGc(app: App): Promise<void> {
  // Plan 21-06 WR-05 — module-level concurrency lock. Entry guard before any
  // I/O so a re-entry during the `adapter.list` await also short-circuits.
  if (gcRunning) {
    logger.debug('migrationBackupGc: skipping concurrent invocation', {});
    return;
  }
  gcRunning = true;

  try {
    const baseDir = pluginBackupRoot(app);

    // Step 1 — defensive list. First-install vaults reject here (Pitfall 4).
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await app.vault.adapter.list(baseDir);
    } catch (err) {
      logger.debug(
        'migrationBackupGc: adapter.list failed (likely first-install)',
        err,
      );
      return;
    }

    const now = Date.now();

    // Step 2 — iterate folders.
    for (const folderFull of listing.folders ?? []) {
      // Strip the baseDir prefix to get the bare folder name.
      // adapter.list returns paths relative to the vault root, e.g.
      //   '<configDir>/plugins/obsidian-leetcode/migration-backup-two-sum-...'
      // We want just 'migration-backup-two-sum-...' for regex matching.
      const prefix = `${baseDir}/`;
      const folderName = folderFull.startsWith(prefix)
        ? folderFull.slice(prefix.length)
        : folderFull;

      const m = BACKUP_FOLDER_RE.exec(folderName);
      if (!m) continue; // T-21-gc mitigation — strict regex skips non-backups.

      // Step 3 — parse ISO timestamp.
      const captured = m[2] ?? '';
      const ts = parseSanitizedIso(captured);
      if (Number.isNaN(ts)) continue;

      // Step 4 — TTL check (T-21-pitfall-5 direction).
      if (now - ts > TTL_MS) {
        try {
          await app.vault.adapter.rmdir(folderFull, true);
        } catch (err) {
          logger.debug('migrationBackupGc: rmdir failed', err);
          // Continue iterating — partial cleanup failure must not abort
          // the remaining sweep.
        }
      }
    }
  } finally {
    // Plan 21-06 WR-05 — reset lock so transient errors don't permanently
    // disable the GC. The inner try/catches around adapter.list +
    // adapter.rmdir already implement Pattern S-05; this outer try/finally
    // exists ONLY to reset the lock (no `catch` here).
    gcRunning = false;
  }
}
