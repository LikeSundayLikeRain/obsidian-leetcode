// src/main/readingModeMigrationHook.ts
//
// Phase 21 Plan 21-05 Task 2 (CR-01) — Reading-mode auto-migration trigger
// for legacy v1.2 notes.
//
// Extracted factory so tests (tests/main/readingModeMigrationTrigger.test.ts)
// can drive the handler without instantiating a full Obsidian Plugin. The
// handler closes the verifier-confirmed gap that
// `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` only fires
// for the v1.3 fence tag — legacy v1.2 notes (``` ```python /``` ```java`/etc.)
// never invoke the Reading-mode post-processor and so the inline
// migration gate at codeBlockProcessor.ts:142-194 is dead code in
// Reading mode. This factory provides the L5-compliant per-file lazy
// trigger fired by user navigation.
//
// L5 invariant preserved: Obsidian fires `file-open` per-file by user
// navigation, NEVER during `Plugin.onload()`. The existing Phase 5.2
// D-06 + Phase 18 file-open hooks rely on this property and have shipped
// without regression.
//
// WR-01 dedupe: `migrateInFlight` is a per-Plugin-instance Set shared
// with the Live Preview ViewPlugin (src/widget/liveModeViewPlugin.ts).
// Both consumers contend for the same per-file lock so a Reading-mode
// trigger and a Live Preview trigger for the same file path do not race.
//
// Branches:
//   - autoMigrateOnOpen=ON:  fire-and-forget migrateLegacyFenceIfNeeded
//                            with the user's defaultLanguage; .catch +
//                            .finally clears the dedupe entry. Pattern
//                            S-05 silent-on-failure.
//   - autoMigrateOnOpen=OFF: read note text + isMigrationCandidate; on
//                            candidate, logger.debug acknowledging the
//                            documented Reading-mode banner-mount-on-OFF
//                            limitation. No Notice (D-edge-01 strict-
//                            matching contract). The keyboard escape
//                            hatch (`LeetCode: Migrate current note`
//                            command palette) remains the workaround.

import type { App, TFile } from 'obsidian';

export interface ReadingModeMigrationHookDeps {
  app: App;
  settings: {
    getUseInlineWidget(): boolean;
    getAutoMigrateOnOpen(): boolean;
    getDefaultLanguage?(): string;
  };
  /** Per-Plugin-instance dedupe Set (WR-01). Shared with Live Preview. */
  migrateInFlight: Set<string>;
  /** DI for testability — `migrateLegacyFenceIfNeeded` in prod. */
  migrate: (
    app: App,
    file: TFile,
    opts: {
      autoMigrateOnOpen?: boolean;
      defaultLanguage?: string;
      force?: boolean;
    },
  ) => Promise<boolean>;
  /** DI for testability — `isMigrationCandidate` in prod. */
  isMigrationCandidate: (
    text: string,
    fm: Record<string, unknown> | undefined,
  ) => boolean;
  /** DI for testability — production wires `logger.debug`. */
  logDebug: (msg: string, ...args: unknown[]) => void;
}

/**
 * Factory: returns a `(file: TFile | null) => void` handler suitable for
 * `workspace.on('file-open', ...)`. Never throws; swallows promise
 * rejections per Pattern S-05.
 *
 * The handler self-gates on:
 *   1. file !== null               (workspace transition guard)
 *   2. settings.getUseInlineWidget (master gate, L9)
 *   3. fm['lc-slug'] non-empty     (per-note gate)
 *   4. !migrateInFlight.has(path)  (cross-mode dedupe; WR-01)
 *
 * After gates pass, branches on settings.getAutoMigrateOnOpen.
 */
export function makeReadingModeMigrationHandler(
  deps: ReadingModeMigrationHookDeps,
): (file: TFile | null) => void {
  return (file: TFile | null): void => {
    // 1. Workspace transition with no active file (Obsidian fires
    //    file-open with null when the user closes the last leaf).
    if (!file) return;
    // 2. Master gate (L9). useInlineWidget=OFF ⇒ Phase 21 is a no-op.
    if (!deps.settings.getUseInlineWidget()) return;
    // 3. Per-note gate (lc-slug presence).
    const fm = deps.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return;
    // 4. Cross-mode dedupe (WR-01).
    if (deps.migrateInFlight.has(file.path)) return;

    if (deps.settings.getAutoMigrateOnOpen()) {
      // Auto-path. Claim BEFORE firing the async migrator; clear in
      // .finally so a Live-Preview retrigger after this completes can
      // re-evaluate (idempotency in the orchestrator makes the second
      // pass a no-op).
      deps.migrateInFlight.add(file.path);
      void deps
        .migrate(deps.app, file, {
          autoMigrateOnOpen: true,
          defaultLanguage:
            deps.settings.getDefaultLanguage?.() ?? 'python3',
        })
        .catch((err) => {
          deps.logDebug(
            'migration.fileOpenHook: non-fatal failure',
            err,
          );
        })
        .finally(() => {
          deps.migrateInFlight.delete(file.path);
        });
    } else {
      // autoMigrateOnOpen=OFF Reading-mode path. The Live Preview
      // ViewPlugin gates the manual-prompt banner mount on
      // autoMigrateOnOpen=ON only (per Plan 21-02), and the Reading-
      // mode post-processor binding is `'leetcode-solve'`-only — so a
      // Reading-mode user with autoMigrateOnOpen=OFF on a legacy note
      // sees Obsidian's stock language-tagged fence with NO banner.
      //
      // Per Plan 21-05 behavior block: the keyboard escape hatch
      // (`LeetCode: Migrate current note` command palette, registered
      // unconditionally elsewhere) remains the documented workaround.
      // Reading-mode banner-on-OFF is acknowledged as a follow-up
      // enhancement (NOT a Phase 21 BLOCKER) per VERIFICATION.md.
      void deps.app.vault
        .read(file)
        .then((text) => {
          if (!deps.isMigrationCandidate(text, fm)) return;
          deps.logDebug(
            'migration.fileOpenHook: autoMigrateOnOpen=OFF; ' +
              'banner is served by Live Preview pane or command palette',
            { path: file.path },
          );
        })
        .catch((err) => {
          deps.logDebug(
            'migration.fileOpenHook: vault.read failed (non-fatal)',
            err,
          );
        });
    }
  };
}
