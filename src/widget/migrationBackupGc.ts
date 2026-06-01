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
// Threats mitigated (per .planning/phases/21-v1-2-migration/21-04-PLAN.md):
//   T-21-gc       — strict folder-name regex `^migration-backup-(.+)-\d{4}-\d{2}-
//                   \d{2}T\d{2}-\d{2}-\d{2}Z$` rejects any non-backup folder
//                   under the plugin directory; non-backup folders (e.g.
//                   `data`, `cache`) are NEVER deleted by this routine.
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

/** Plugin folder under the vault root. Backup folders live as siblings. */
const BASE_DIR = '.obsidian/plugins/obsidian-leetcode';

/**
 * Strict folder-name regex (T-21-gc mitigation). Captures:
 *   group 1 — the slug (anything that doesn't contain the trailing ISO suffix)
 *   group 2 — the sanitized ISO timestamp (`YYYY-MM-DDTHH-MM-SSZ` — `:` was
 *             replaced with `-` for cross-OS filesystem safety per
 *             D-backup-01).
 *
 * Anything that doesn't match — e.g. `data`, `cache`, `migration-backup-foo`
 * (no ISO), `migration-backup-foo-2026-06-01` (no time) — is skipped. The
 * routine NEVER deletes a folder that does not match this regex.
 */
const BACKUP_FOLDER_RE =
  /^migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/;

/** 30 days in milliseconds (T-21-pitfall-5 — direction is `now - parsed > TTL_MS`). */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
 *   1. List `BASE_DIR` via `adapter.list`. On rejection (likely first-install
 *      vault — plugin folder does not yet exist), debug-log and return.
 *   2. For each folder under `BASE_DIR`, strip the prefix to get the
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
  // Step 1 — defensive list. First-install vaults reject here (Pitfall 4).
  let listing: { files: string[]; folders: string[] };
  try {
    listing = await app.vault.adapter.list(BASE_DIR);
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
    // Strip the BASE_DIR prefix to get the bare folder name.
    // adapter.list returns paths relative to the vault root, e.g.
    //   '.obsidian/plugins/obsidian-leetcode/migration-backup-two-sum-...'
    // We want just 'migration-backup-two-sum-...' for regex matching.
    const prefix = `${BASE_DIR}/`;
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
        // Continue iterating — partial cleanup failure must not abort the
        // remaining sweep.
      }
    }
  }
}
