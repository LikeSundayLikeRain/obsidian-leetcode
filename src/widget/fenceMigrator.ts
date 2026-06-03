// src/widget/fenceMigrator.ts
//
// Phase 21 Plan 21-09 — frontmatter repair path for the asymmetric
// "v1.3 body + missing lc-language" shape (closes UAT Gap 2 / Test 2).
//
// The original migrator (Plan 21-01) was designed for v1.0/v1.1/v1.2 → v1.3
// BODY migration; lc-language frontmatter injection was bundled in as a
// side effect of that flow. Notes that already have ` ```leetcode-solve `
// as the fence opener (body is v1.3) but `lc-language` MISSING from
// frontmatter slip through `isMigrationCandidate` clause 5 (idempotency
// short-circuit) and the widget mount path's `resolveLanguageSlug` then
// emits the Python+Notice fallback.
//
// Plan 21-09 adds two new exports:
//   - isFrontmatterRepairCandidate(noteText, fm) — sibling predicate that
//     recognizes the asymmetric shape (lc-slug + ## Code +
//     ```leetcode-solve opener + closer + lc-language missing/empty/
//     non-string).
//   - repairFrontmatterIfNeeded(app, file, opts) — orchestrator that
//     injects `lc-language: <opts.defaultLanguage>` via processFrontMatter
//     BEFORE the widget mount path fires the Python+Notice. Frontmatter-
//     only edit; NO body rewrite, NO backup needed (vault.process is
//     never called — only processFrontMatter, which is reversible via
//     Obsidian's own undo + metadataCache history). Inner-callback gate
//     mirrors migrator Step 5 / D-edge-04 — never overwrite a non-empty
//     existing lc-language.
//
// Phase 21 Plan 21-01 — v1.2 → v1.3 fence migration foundation.
// Plan 21-07 (WR-02 + WR-03) — outer needsLang check removed in
// migrateLegacyFenceIfNeeded; processFrontMatter is now invoked
// unconditionally for migration candidates and the inner callback gate is
// the single authoritative source of truth (closes the WR-02 stale-fm
// race window). New exported helper countLeetCodeSolveFenceOpenersInCodeSection
// scopes clause 5 of isMigrationCandidate to the ## Code section only,
// so stray ```leetcode-solve references in ## Notes / ## Problem no longer
// abort migration of the legacy ## Code fence (closes WR-03).
//
// Three exported functions:
//   1. isMigrationCandidate(noteText, frontmatter) — pure 5-clause strict-match
//      predicate (D-edge-01). True iff lc-slug present + `## Code` heading +
//      first fence inside has recognized LC langSlug + has closer + note
//      does NOT already contain a `\`\`\`leetcode-solve` fence.
//   2. writeBackup(app, file, slug, fileText) — async; writes a per-note
//      sidecar to .obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-
//      {ISO}/{slug}.md via app.vault.adapter.write. Returns the backup path.
//   3. migrateLegacyFenceIfNeeded(app, file, opts?) — async orchestrator.
//      6-step pipeline: settings gate → read → predicate → backup →
//      vault.process → processFrontMatter (only when lc-language is missing/
//      empty). Returns true iff migration ran.
//
// Decision references (locked per .planning/phases/21-v1-2-migration/21-CONTEXT.md):
//   L1 — canonical v1.3 fence tag = `\`\`\`leetcode-solve`; language metadata
//        lives in `lc-language` frontmatter.
//   L3 — migration + first-edit are atomic; single render-frame.
//   L4 — idempotency: re-opening a migrated note is a no-op.
//   L5 — NEVER call from Plugin.onload(). Lazy-on-first-open only.
//   L8 — vault.process is the ONLY vault mutation primitive (CF-06).
//   D-trigger-01 — orchestrator shape: file-open → strict-match gate →
//                  backup → atomic two-write.
//   D-edge-01 — 5-clause strict-match predicate (lc-slug + ## Code +
//               recognized langSlug + closer + idempotency).
//   D-edge-02 — mixed-state notes (legacy + leetcode-solve both present)
//               skip migration; idempotency wins.
//   D-edge-03 — fill `lc-language` ONLY when missing/empty; same atomic flow.
//   D-edge-04 — frontmatter NEVER overwritten when lc-language is already set.
//   D-backup-01 — backup folder: migration-backup-{slug}-{ISO} with sanitized
//                 ISO (no `:`, no millis); file inside named {slug}.md.
//   D-backup-02 — one backup per note ever; idempotency short-circuits before
//                 the backup writer runs on subsequent re-opens. Plan 21-06
//                 CR-02 — pre-existence check via `BACKUP_FOLDER_RE` per-slug
//                 match closes the partial-failure retry path: when
//                 vault.process throws AFTER writeBackup succeeded, the next
//                 re-entry must NOT write a second backup. The pre-existence
//                 helper lists `.obsidian/plugins/obsidian-leetcode/`,
//                 matches each folder against the SSoT regex, and skips
//                 writeBackup when a folder for THIS slug already exists.
//
// Threats mitigated (per .planning/phases/21-v1-2-migration/21-01-PLAN.md):
//   T-21-bytes — body byte-exact via SSoT delegation to rewriteFenceOpenerTag
//                (CRLF-tolerant; property-tested).
//   T-21-backup — backup BEFORE rewrite; if adapter.write throws, vault.process
//                 is never called.
//   T-21-atom — atomic vault.process + processFrontMatter pair; queued serially
//               per-file by Obsidian.
//   T-21-strict — exhaustive predicate clause coverage in unit tests.
//   T-21-load — pure module; NO Plugin.onload import; NO registerEvent.
//
// Pattern S-04 (`'leetcode.*'` userEvent annotation) is NOT applicable to this
// module: migration runs at the vault layer (vault.process + processFrontMatter)
// BEFORE widget mount. There is no CM6 dispatch involved — the section lock's
// changeFilter operates on CM6 transactions; vault-layer writes never hit
// the editor's transaction filter.
//
// Settings gating discipline: `useInlineWidget=ON` is the master gate (L9).
// This module does NOT inspect useInlineWidget — the gate is the caller's
// responsibility (Plan 21-02 wires it in the mount paths). The internal
// `autoMigrateOnOpen` gate is dependency-injected via opts (Pattern S-06):
// callers thread the boolean in rather than reaching into
// app.plugins.plugins['obsidian-leetcode']. Pure DI keeps the migrator
// unit-testable in isolation.

import type { App, TFile } from 'obsidian';
import { LC_LANG_SLUGS, resolveLangSlug } from '../solve/languages';
import { rewriteFenceOpenerTag } from './fenceSerialization';
import { BACKUP_FOLDER_RE } from './migrationBackupGc';
import { logger } from '../shared/logger';

/** Plugin folder under the vault root (mirrors migrationBackupGc.BASE_DIR). */
const PLUGIN_DIR = '.obsidian/plugins/obsidian-leetcode';

// Sentinel string for resolveLangSlug — fenceTag → sentinel means unknown tag.
const SLUG_SENTINEL = '__sentinel__';

const H2_CODE_RE = /^\s*##\s+Code\s*$/;
const H2_ANY_RE = /^\s*##\s+\S/;
const FENCE_OPENER_RE = /^\s*```([A-Za-z0-9_+#-]*)\s*$/;
const FENCE_CLOSER_RE = /^\s*```\s*$/;
const LC_SOLVE_OPENER_RE = /^\s*```leetcode-solve\b/;

/**
 * Plan 21-07 WR-07 — locate the FIRST `\`\`\`leetcode-solve` opener that
 * sits INSIDE the `## Code` section, and return its WHOLE-FILE fence-opener
 * index (suitable for direct consumption by `rewriteFenceBody(noteText,
 * fenceIndex, ...)`).
 *
 * `rewriteFenceBody`'s `fenceIndex` counts ONLY `\`\`\`leetcode-solve` openers
 * (not all openers — see `locateFenceByIndex` in `./fenceSerialization.ts`).
 * This helper returns the count of leetcode-solve openers that appear
 * BEFORE the target opener, so passing the result to `rewriteFenceBody`
 * targets the correct fence.
 *
 * Walks lines forward; tracks `inCodeSection` via H2_CODE_RE / H2_ANY_RE;
 * counts every `\`\`\`leetcode-solve` opener found OUTSIDE ## Code; when the
 * first IN-section leetcode-solve opener is encountered, returns the
 * accumulated count. Returns null when no in-section leetcode-solve opener
 * exists (caller falls through to the legacy path with a debug log).
 *
 * Mirrors `forceInjectCodeSection`'s ## Code-scoped discipline (Phase 20
 * Plan 20-10 lines 188-208) so multi-fence corner cases — stray
 * `\`\`\`leetcode-solve` references in `## Problem` or `## Notes` — no longer
 * cause `injectCodeSection`'s short-circuit to corrupt the wrong fence.
 *
 * Pure: no I/O; safe inside vault.process retry semantics.
 */
export function findFirstLeetCodeSolveFenceIndexInCodeSection(
  noteText: string,
): number | null {
  const lines = noteText.split(/\r?\n/);
  let inCodeSection = false;
  let lcOpenerCount = 0;
  for (const line of lines) {
    if (H2_CODE_RE.test(line)) {
      inCodeSection = true;
      continue;
    }
    if (H2_ANY_RE.test(line)) {
      inCodeSection = false;
      continue;
    }
    // Only `\`\`\`leetcode-solve` openers participate in the index — the
    // rewriteFenceBody contract counts only LC_OPENER_RE matches.
    if (LC_SOLVE_OPENER_RE.test(line)) {
      if (inCodeSection) {
        return lcOpenerCount;
      }
      lcOpenerCount++;
    }
  }
  return null;
}

/**
 * Plan 21-07 WR-03 — count `\`\`\`leetcode-solve` opener lines that fall
 * INSIDE the `## Code` section ONLY. Sibling helper to
 * `countLeetCodeSolveFenceOpeners` in `./fenceLocator.ts` (which keeps its
 * whole-note scope; other call sites depend on whole-note semantics).
 *
 * Walks lines forward; sets `inCodeSection = true` upon `H2_CODE_RE.test(line)`;
 * sets `inCodeSection = false` upon any other H2 heading. Counts only when
 * `inCodeSection === true`. CRLF-tolerant via /\r?\n/.
 *
 * Used by `isMigrationCandidate` clause 5 (idempotency check) so a
 * user-authored `\`\`\`leetcode-solve` reference in `## Notes` or `## Problem`
 * does NOT abort migration of the actual `## Code` fence.
 *
 * Multiple `## Code` headings (degenerate but possible): every `## Code`
 * region contributes — opener lines inside ANY `## Code` region count.
 *
 * Pure: no I/O; safe inside vault.process retry semantics.
 */
export function countLeetCodeSolveFenceOpenersInCodeSection(
  noteText: string,
): number {
  const lines = noteText.split(/\r?\n/);
  let inCodeSection = false;
  let count = 0;
  for (const line of lines) {
    if (H2_CODE_RE.test(line)) {
      inCodeSection = true;
      continue;
    }
    if (H2_ANY_RE.test(line)) {
      inCodeSection = false;
      continue;
    }
    if (inCodeSection && LC_SOLVE_OPENER_RE.test(line)) {
      count++;
    }
  }
  return count;
}

/**
 * Pure predicate — true iff the note is a v1.2 LC plugin-owned note that
 * MUST be migrated to the v1.3 `\`\`\`leetcode-solve` fence.
 *
 * Five clauses (D-edge-01) — ALL must hold:
 *   C1: lc-slug present in frontmatter (non-empty string).
 *   C5: idempotency — note does NOT already contain `\`\`\`leetcode-solve`.
 *       (Evaluated EARLY for cheap short-circuit; D-edge-02 mixed-state.)
 *   C2: `## Code` heading exists.
 *   C3: First fence inside `## Code` has a recognized LC langSlug
 *       (resolveLangSlug returns a value in LC_LANG_SLUGS — both base slugs
 *       and FENCE_TAG_ALIASES qualify).
 *   C4: That fence has a closer (matching `^\s*\`\`\`\s*$`) before the next
 *       `## ` heading or EOF.
 *
 * All other shapes — note without `## Code`, fence with unrecognized tag
 * (text/bash/pseudo/empty), fence with no closer, fence under `## Notes`
 * only — return false. Caller (migrateLegacyFenceIfNeeded) treats false as
 * "skip silently". No Notice; debug-level logging only at the orchestrator
 * level.
 *
 * Pure: no I/O; no captured state; safe inside vault.process retry semantics
 * (Pattern S-08).
 */
export function isMigrationCandidate(
  noteText: string,
  frontmatter: Record<string, unknown> | undefined,
): boolean {
  // Clause 1 — lc-slug present.
  const lcSlug = frontmatter?.['lc-slug'];
  if (typeof lcSlug !== 'string' || lcSlug.length === 0) return false;

  // Clause 5 — idempotency early-out (D-edge-02). Cheap short-circuit before
  // the linear scan. Plan 21-07 WR-03 — scoped to ## Code only via the new
  // sibling helper, so stray ```leetcode-solve references in ## Notes /
  // ## Problem no longer abort migration of the legacy ## Code fence.
  if (countLeetCodeSolveFenceOpenersInCodeSection(noteText) > 0) {
    return false;
  }

  // Clauses 2, 3, 4 — single forward scan.
  const lines = noteText.split(/\r?\n/);
  let inCodeSection = false;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (H2_CODE_RE.test(text)) {
      inCodeSection = true;
      continue;
    }
    if (H2_ANY_RE.test(text)) {
      inCodeSection = false;
      continue;
    }
    if (!inCodeSection) continue;
    const m = FENCE_OPENER_RE.exec(text);
    if (!m) continue;
    const tag = (m[1] ?? '').toLowerCase();
    // Clause 3 — empty tag (bare ```) is NOT a recognized langSlug.
    if (!tag) return false;
    // Sentinel-trick recognition (mirrors sectionHasRecognizedFence in
    // src/solve/starterCodeInjector.ts:251-267).
    const resolved = resolveLangSlug(tag, SLUG_SENTINEL);
    if (resolved === SLUG_SENTINEL) return false;
    if (!LC_LANG_SLUGS.has(resolved)) return false;
    // Clause 4 — scan forward for closer before next H2 / EOF.
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j] ?? '';
      if (H2_ANY_RE.test(t)) return false;
      if (FENCE_CLOSER_RE.test(t)) return true;
    }
    return false; // EOF before closer
  }
  // No fence found inside `## Code` (or no `## Code` heading at all).
  return false;
}

/**
 * Build the canonical backup folder path:
 *   .obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ts}
 * where {ts} is the current ISO timestamp sanitized for cross-OS filesystem
 * safety: `:` → `-`, milliseconds stripped (D-backup-01; Pitfall 3).
 *
 * Result regex (verified shape):
 *   /^migration-backup-(.+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/
 */
function buildBackupPaths(slug: string): { dir: string; file: string } {
  // toISOString() => '2026-06-01T14:32:08.123Z'
  // Replace `:` with `-` (Windows-illegal in filenames) and strip the
  // millisecond fragment so the regex is `\d{2}-\d{2}-\d{2}Z` not
  // `\d{2}-\d{2}-\d{2}\.\d{3}Z`.
  const ts = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z');
  const dir = `.obsidian/plugins/obsidian-leetcode/migration-backup-${slug}-${ts}`;
  const file = `${dir}/${slug}.md`;
  return { dir, file };
}

/**
 * Plan 21-06 CR-02 — pre-existence check for a backup folder belonging to
 * `slug` under the plugin directory. Returns true iff a folder matching
 * `migration-backup-{slug}-{ISO}` already exists.
 *
 * Reuses the SSoT regex `BACKUP_FOLDER_RE` (exported from
 * `./migrationBackupGc.ts`) so the per-slug filter uses the SAME
 * shape constraint that the GC sweep enforces. NO regex literal duplication.
 *
 * Pure side-effect surface: ONE `app.vault.adapter.list` call. No mutations.
 *
 * Defensive on rejection: when `adapter.list` throws (e.g. first-install vault
 * — plugin folder does not yet exist), return false so the orchestrator
 * proceeds with `writeBackup` as before. The orchestrator's outer try/catch
 * (Pattern S-05) covers any propagation; this helper's internal catch is
 * defensive layering for the common first-install case.
 *
 * Strips the `.obsidian/plugins/obsidian-leetcode/` prefix from each
 * `adapter.list` result so `BACKUP_FOLDER_RE` matches the bare folder
 * name (the regex is anchored on `^migration-backup-`, not on the prefix).
 */
async function backupAlreadyExistsForSlug(
  app: App,
  slug: string,
): Promise<boolean> {
  let listing: { files: string[]; folders: string[] };
  try {
    listing = await app.vault.adapter.list(PLUGIN_DIR);
  } catch {
    // First-install vault or transient I/O error — no backup exists; proceed.
    return false;
  }
  const prefix = `${PLUGIN_DIR}/`;
  for (const folderFull of listing.folders ?? []) {
    const folderName = folderFull.startsWith(prefix)
      ? folderFull.slice(prefix.length)
      : folderFull;
    const m = BACKUP_FOLDER_RE.exec(folderName);
    if (!m) continue;
    if (m[1] === slug) return true;
  }
  return false;
}

/**
 * Write a backup sidecar of the pre-migration note text. Used by
 * `migrateLegacyFenceIfNeeded` BEFORE any rewrite (T-21-backup invariant).
 *
 * Path shape (D-backup-01):
 *   .obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md
 *
 * Uses app.vault.adapter.write (raw filesystem) rather than app.vault.create
 * — backups are plugin-internal, NOT vault-visible. The `:` in the ISO
 * timestamp is replaced with `-` for cross-OS filesystem safety.
 *
 * Defensive mkdir wrap (Open Question §2 — adapter.mkdir contract on
 * existing dir is unclear). The folder name carries an ISO timestamp so
 * collisions are not realistic; the try/catch simply guards against any
 * platform-specific mkdir-on-existing throw.
 *
 * If adapter.write throws, the rejection propagates; the orchestrator's
 * try/catch (Pattern S-05) treats this as "no rewrite without successful
 * backup" — vault.process is never called.
 */
export async function writeBackup(
  app: App,
  _file: TFile,
  slug: string,
  fileText: string,
): Promise<string> {
  const { dir, file: backupPath } = buildBackupPaths(slug);
  // Defensive mkdir — RESEARCH Open Question §2 + Pitfall 4.
  try {
    await app.vault.adapter.mkdir(dir);
  } catch {
    // Best-effort — folder may already exist; adapter.write below is the
    // operation that MUST succeed for the backup to be valid.
  }
  await app.vault.adapter.write(backupPath, fileText);
  return backupPath;
}

/**
 * Lazy-on-open atomic migration orchestrator. Called from the widget mount
 * path (Plan 21-02 wires it). Returns Promise<boolean> — true iff migration
 * ran; false on any skip / failure (silent-on-failure per Pattern S-05).
 *
 * Six-step pipeline:
 *   0. Settings gate — when opts.force !== true AND opts.autoMigrateOnOpen
 *      !== true, return false WITHOUT side effects (no read, no backup,
 *      no write). Defensive — caller should have already gated, but this
 *      double-checks.
 *   1. Read text + frontmatter via vault.read + metadataCache.getFileCache.
 *   2. Strict-match gate — isMigrationCandidate must be true.
 *   3. Backup BEFORE rewrite (T-21-backup): writeBackup throws iff the
 *      filesystem write fails; the wrapping try/catch returns false and
 *      logs at debug level — vault.process is NEVER called when backup
 *      fails. (No rewrite without successful backup.)
 *   4. Atomic body-touching write via vault.process — SSoT delegation to
 *      rewriteFenceOpenerTag. The pure helper is property-tested
 *      (T-21-bytes mitigation).
 *   5. Fill lc-language ONLY when missing/empty (D-edge-03). The inner
 *      re-check inside the processFrontMatter callback protects against
 *      race conditions where the user (or the chevron) writes
 *      lc-language between the metadataCache read and the
 *      processFrontMatter call (Pattern 2 + Pitfall 7).
 *   6. Return true.
 *
 * Whole orchestrator wrapped in try/catch — debug-log + return false on
 * any I/O failure. NEVER throw to caller. Per Pattern S-05.
 */
export async function migrateLegacyFenceIfNeeded(
  app: App,
  file: TFile,
  opts?: {
    force?: boolean;
    defaultLanguage?: string;
    autoMigrateOnOpen?: boolean;
  },
): Promise<boolean> {
  // Step 0 — settings gate. Force bypasses autoMigrateOnOpen (D-auto-03).
  if (opts?.force !== true && opts?.autoMigrateOnOpen !== true) {
    return false;
  }
  try {
    // Step 1 — read text + frontmatter.
    const text = await app.vault.read(file);
    const fm = app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;

    // Step 2 — strict-match gate.
    if (!isMigrationCandidate(text, fm)) {
      return false;
    }

    // The predicate confirms lc-slug is a non-empty string.
    const slug = fm!['lc-slug'] as string;

    // Step 3 — backup BEFORE rewrite. Throws propagate to the outer catch;
    // when they do, vault.process is NEVER called (T-21-backup invariant).
    //
    // Plan 21-06 CR-02 — pre-existence check protects D-backup-02 invariant
    // on the partial-failure retry path. If a previous migration attempt
    // succeeded at writeBackup but failed at vault.process (vault locked,
    // plugin reload mid-write, transient I/O error), the next re-entry
    // must NOT write a SECOND backup folder. The check is cheap (one
    // `adapter.list` call) and DOES NOT abort migration on a hit — only
    // the backup write step is skipped; the orchestrator continues with
    // Step 4 (vault.process) as the retry the user implicitly requested.
    const alreadyBackedUp = await backupAlreadyExistsForSlug(app, slug);
    if (!alreadyBackedUp) {
      await writeBackup(app, file, slug, text);
    } else {
      logger.debug(
        'migration.fenceMigrator: backup folder already exists for slug; skipping (CR-02 retry path)',
        { slug },
      );
    }

    // Step 4 — atomic body-touching write via vault.process. SSoT delegation
    // to rewriteFenceOpenerTag (CRLF-tolerant; body byte-exact).
    await app.vault.process(file, (current) =>
      rewriteFenceOpenerTag(current, 'leetcode-solve'),
    );

    // Step 5 — fill lc-language ONLY when missing/empty (D-edge-03 +
    // D-edge-04). Plan 21-07 WR-02 — outer `needsLang` check using the
    // metadataCache-snapshot fm has been REMOVED; the inner re-check inside
    // the processFrontMatter callback is now the single authoritative gate.
    // processFrontMatter is invoked unconditionally for migration candidates;
    // when lc-language is already set, the inner gate short-circuits and
    // the no-op callback writes nothing (Obsidian's processFrontMatter writes
    // the file ONLY when the callback mutates the object). Closes the WR-02
    // stale-fm race window: if metadataCache had a stale snapshot but the
    // real frontmatter received by the callback already has lc-language set,
    // the inner gate correctly preserves it (no clobber).
    const defaultLang = opts?.defaultLanguage ?? 'python3';
    await app.fileManager.processFrontMatter(
      file,
      (fmObj: Record<string, unknown>) => {
        if (
          typeof fmObj['lc-language'] !== 'string' ||
          fmObj['lc-language'] === ''
        ) {
          fmObj['lc-language'] = defaultLang;
        }
      },
    );

    return true;
  } catch (err) {
    // Pattern S-05 — silent-on-failure. Migration must NEVER block file
    // open. The user retains their note unchanged (or with the fence
    // already swapped, depending on which step threw). The next file-open
    // re-runs the orchestrator; if the backup step previously succeeded
    // and vault.process previously succeeded, the idempotency clause
    // (countLeetCodeSolveFenceOpeners > 0) short-circuits.
    logger.debug('migration.fenceMigrator: non-fatal failure', err);
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-09 — frontmatter repair path (closes UAT Gap 2 / Test 2).
// Sibling to isMigrationCandidate / migrateLegacyFenceIfNeeded — same DI
// shape, same Pattern S-05 silent-on-failure discipline. NO body rewrite,
// NO backup. Frontmatter-only edit via processFrontMatter.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Pure predicate — true iff the note has the asymmetric "v1.3 body +
 * missing lc-language" shape that the original migrator's idempotency
 * clause 5 rejects.
 *
 * Five clauses (mirrors `isMigrationCandidate` in shape, with C3/C5 swapped):
 *   C1: lc-slug present (non-empty string).
 *   C2: `## Code` heading exists.
 *   C3: First fence inside `## Code` is ` ```leetcode-solve ` (NOT a
 *       langSlug — this is the post-migration shape).
 *   C4: That fence has a closer (matching `^\s*\`\`\`\s*$`) before the
 *       next `## ` heading or EOF.
 *   C5: `fm['lc-language']` is missing OR not a string OR empty string.
 *
 * Multi-`## Code` regions: the predicate accepts as long as ANY
 * `## Code` region has the leetcode-solve opener + closer (mirrors the
 * `findFirstLeetCodeSolveFenceIndexInCodeSection` permissive scan).
 *
 * Pure: no I/O; no captured state; safe inside vault.process retry semantics.
 */
export function isFrontmatterRepairCandidate(
  noteText: string,
  frontmatter: Record<string, unknown> | undefined,
): boolean {
  // Clause 1 — lc-slug present.
  const lcSlug = frontmatter?.['lc-slug'];
  if (typeof lcSlug !== 'string' || lcSlug.length === 0) return false;

  // Clause 5 — lc-language missing, non-string, or empty string.
  const lcLang = frontmatter?.['lc-language'];
  if (typeof lcLang === 'string' && lcLang.length > 0) return false;

  // Clauses 2, 3, 4 — single forward scan. Find the FIRST in-`## Code`
  // leetcode-solve opener; verify a closer exists before next H2 / EOF.
  // Mirrors `findFirstLeetCodeSolveFenceIndexInCodeSection` in scan
  // structure but inlined here so the closer-presence check shares state.
  const lines = noteText.split(/\r?\n/);
  let inCodeSection = false;
  let sawCodeHeading = false;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (H2_CODE_RE.test(text)) {
      inCodeSection = true;
      sawCodeHeading = true;
      continue;
    }
    if (H2_ANY_RE.test(text)) {
      inCodeSection = false;
      continue;
    }
    if (!inCodeSection) continue;
    if (LC_SOLVE_OPENER_RE.test(text)) {
      // Clause 4 — scan forward for closer before next H2 / EOF.
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j] ?? '';
        if (H2_ANY_RE.test(t)) return false;
        if (FENCE_CLOSER_RE.test(t)) return true;
      }
      return false; // EOF before closer
    }
    // Plan 21-09: any other fence opener inside ## Code aborts (e.g.
    // a legacy ```python fence routes through isMigrationCandidate, not
    // this repair path). The repair predicate is strict on the FIRST
    // fence being leetcode-solve.
    if (FENCE_OPENER_RE.test(text)) return false;
  }
  // No leetcode-solve opener inside any `## Code` region — caller falls
  // through silently. (sawCodeHeading retained for symmetry; result is
  // false either way.)
  void sawCodeHeading;
  return false;
}

/**
 * Lazy-on-open frontmatter repair orchestrator. Closes UAT Gap 2 — the
 * asymmetric "v1.3 body + missing lc-language" shape that
 * `migrateLegacyFenceIfNeeded` cannot handle (clause 5 idempotency
 * short-circuit). Called from the widget mount paths (Reading-mode hook,
 * Reading-mode post-processor, Live Preview ViewPlugin) AFTER the migrator
 * returns false — when the migrator already injected lc-language, the
 * repair predicate's clause C5 returns false and the orchestrator no-ops.
 *
 * Returns Promise<boolean> — true iff the repair ran (predicate accepted +
 * processFrontMatter was invoked); false on any skip / failure
 * (silent-on-failure per Pattern S-05).
 *
 * Five-step pipeline (NO backup; NO vault.process):
 *   0. Settings gate — when opts.force !== true AND opts.autoMigrateOnOpen
 *      !== true, return false WITHOUT side effects.
 *   1. Read text + frontmatter via vault.read + metadataCache.getFileCache.
 *   2. Predicate gate — isFrontmatterRepairCandidate must be true; else
 *      return false silently.
 *   3. Backup is NOT taken — frontmatter-only edit, vault.process body is
 *      NOT touched. Backup is required for body migrations (T-21-backup
 *      invariant) but frontmatter-only writes are reversible via
 *      Obsidian's own undo + metadataCache history; per CONTEXT D-edge-04
 *      the inner gate prevents clobber, so no destructive overwrite is
 *      possible.
 *   4. processFrontMatter with INNER GATE (mirrors migrator Step 5 /
 *      D-edge-04) — only assign when typeof fmObj['lc-language'] !==
 *      'string' OR fmObj['lc-language'] === ''. Inner gate is the SSoT —
 *      the metadataCache snapshot may be stale (Pattern 2 / Pitfall 7); the
 *      inner check sees the REAL frontmatter the callback receives.
 *   5. Return true.
 *
 * Whole orchestrator wrapped in try/catch — debug-log + return false on
 * any I/O failure. NEVER throw to caller.
 *
 * Threat-model + write-path hygiene: this code path performs ONE write —
 * `processFrontMatter`. Per CLAUDE.md "Phase 17 D-05 canonical write-path
 * pattern", write-paths that touch the FENCE BODY must dispatch via the
 * child editor's CM6 instance when registered. Frontmatter writes are
 * explicitly NOT covered by that rule — `processFrontMatter` is a
 * vault-layer atomic primitive that bypasses CM6 entirely. The Phase 05.5
 * `'leetcode.*'` userEvent annotation rule does not apply (no CM6
 * dispatch).
 */
export async function repairFrontmatterIfNeeded(
  app: App,
  file: TFile,
  opts?: {
    force?: boolean;
    defaultLanguage?: string;
    autoMigrateOnOpen?: boolean;
  },
): Promise<boolean> {
  // Step 0 — settings gate (mirrors migrator). Force bypasses
  // autoMigrateOnOpen (D-auto-03 parity).
  if (opts?.force !== true && opts?.autoMigrateOnOpen !== true) {
    return false;
  }
  try {
    // Step 1 — read text + frontmatter.
    const text = await app.vault.read(file);
    const fm = app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;

    // Step 2 — predicate gate.
    if (!isFrontmatterRepairCandidate(text, fm)) {
      return false;
    }

    // Step 3 — NO BACKUP. Frontmatter-only edit; vault.process body is
    // NOT touched.

    // Step 4 — inner-gate processFrontMatter (D-edge-04). The inner gate
    // is the SSoT; the outer predicate may have matched on a stale
    // metadataCache snapshot, but the callback receives the REAL
    // frontmatter so the inner check correctly preserves a non-empty
    // existing lc-language.
    const defaultLang = opts?.defaultLanguage ?? 'python3';
    await app.fileManager.processFrontMatter(
      file,
      (fmObj: Record<string, unknown>) => {
        if (
          typeof fmObj['lc-language'] !== 'string' ||
          fmObj['lc-language'] === ''
        ) {
          fmObj['lc-language'] = defaultLang;
        }
      },
    );

    // Step 5 — return true.
    return true;
  } catch (err) {
    // Pattern S-05 — silent-on-failure. Repair must NEVER block file
    // open. The widget mount path's existing Notice + Python fallback
    // remains the documented behavior for the failure case.
    logger.debug('migration.fenceMigrator.repair: non-fatal failure', err);
    return false;
  }
}
