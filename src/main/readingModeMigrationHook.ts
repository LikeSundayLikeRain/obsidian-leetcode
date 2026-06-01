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
import { MarkdownView } from 'obsidian';

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
  /**
   * Phase 21 Plan 21-08 (Gap 1) — invoked AFTER migrate(...) resolves with
   * `migrated === true` to force a Reading-mode pane re-render so the v1.3
   * widget mounts on the SAME open. Production wires the
   * `rerenderReadingModePanes(app, path)` helper which walks
   * `getLeavesOfType('markdown')` and calls `view.previewMode.rerender(true)`
   * on matching preview-mode leaves. No-op for false / rejection / OFF.
   */
  rerenderPreviewLeaves: (path: string) => void;
  /**
   * Phase 21 Plan 21-09 (UAT Gap 2) — DI for `repairFrontmatterIfNeeded`.
   * Invoked AFTER `migrate(...)` resolves with `migrated === false` (i.e.,
   * not a v1.2-shape migration candidate). Targets the asymmetric "v1.3
   * body + missing lc-language" shape: the note already has
   * ```leetcode-solve as the fence opener but `lc-language` is missing,
   * so the migrator's idempotency clause 5 short-circuits without
   * filling frontmatter. The repair path injects
   * `lc-language: <defaultLanguage>` via processFrontMatter BEFORE the
   * widget mount path emits the Python+Notice fallback.
   *
   * Pattern S-05 silent-on-failure: rejection logs at debug + skips
   * rerender. Inner gate (D-edge-04) preserves any non-empty existing
   * lc-language race-set between the outer predicate and the callback.
   */
  repair: (
    app: App,
    file: TFile,
    opts: {
      autoMigrateOnOpen?: boolean;
      defaultLanguage?: string;
      force?: boolean;
    },
  ) => Promise<boolean>;
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
      // Phase 21 Plan 21-08 (Gap 1) — capture the resolved `migrated`
      // boolean and force a Reading-mode pane re-render iff the migration
      // actually rewrote the fence. Ordering note (per G1.4):
      //   1. .then captures `migrated`.
      //   2. .catch handles rejection (rerender skipped).
      //   3. .finally clears the in-flight lock UNCONDITIONALLY.
      //   4. AFTER .finally, a trailing .then() observes the captured
      //      `migrated` value and fires rerenderPreviewLeaves so a
      //      re-entrant post-processor → file-open echo would NOT see the
      //      dedupe lock held. Inner try/catch swallows rerender throws so
      //      the .finally has already run regardless.
      let migratedFlag = false;
      // Plan 21-09 — when migrate resolves false (not a v1.2-shape
      // candidate), chain a repair attempt for the asymmetric "v1.3
      // body + missing lc-language" shape. `repairedFlag` is captured
      // alongside `migratedFlag` so the trailing rerender hop fires
      // when EITHER write actually changed the file.
      let repairedFlag = false;
      const defaultLanguage =
        deps.settings.getDefaultLanguage?.() ?? 'python3';
      void deps
        .migrate(deps.app, file, {
          autoMigrateOnOpen: true,
          defaultLanguage,
        })
        .then(async (migrated) => {
          migratedFlag = migrated === true;
          if (migratedFlag) return;
          // Migrator already injected lc-language (Step 5) on its true
          // branch; only fall through to repair when the migrator
          // bailed out (predicate false / orchestrator failure). Any
          // throw from repair is captured by the outer .catch so the
          // .finally still clears the in-flight lock.
          const repaired = await deps.repair(deps.app, file, {
            autoMigrateOnOpen: true,
            defaultLanguage,
          });
          repairedFlag = repaired === true;
        })
        .catch((err) => {
          migratedFlag = false;
          repairedFlag = false;
          deps.logDebug(
            'migration.fileOpenHook: non-fatal failure',
            err,
          );
        })
        .finally(() => {
          deps.migrateInFlight.delete(file.path);
        })
        .then(() => {
          if (!migratedFlag && !repairedFlag) return;
          try {
            deps.rerenderPreviewLeaves(file.path);
          } catch (err) {
            deps.logDebug(
              'migration.fileOpenHook: rerenderPreviewLeaves threw (non-fatal)',
              err,
            );
          }
        });
      // Note: no separate handling needed below — the trailing .then is
      // attached above. The else branch follows for the OFF path.
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

/**
 * Phase 21 Plan 21-08 (Gap 1) — Reading-mode pane rerender helper.
 *
 * Walks `app.workspace.getLeavesOfType('markdown')`, filters to leaves
 * whose `view.file?.path === path` AND `view.getMode() === 'preview'`,
 * and calls `view.previewMode.rerender(true)` on each match. The `true`
 * argument forces a full rerender (vs. shallow); this is the same API
 * Obsidian's plugin reload path uses.
 *
 * Why this exists: Reading mode has no equivalent of CM6's reactive
 * `ViewPlugin.update(docChanged)`. After `migrateLegacyFenceIfNeeded`
 * rewrites the fence opener via `vault.process`, no mechanism asks
 * Obsidian's preview to re-run post-processors. Without this rerender
 * the v1.3 widget does not mount on the same file-open — the user has
 * to close and reopen the note. Test 1 of 21-HUMAN-UAT.md gap.
 *
 * Live Preview is unaffected (its CM6 ViewPlugin updates reactively on
 * docChanged) so the filter explicitly excludes non-preview leaves.
 *
 * Defensive: outer + inner try/catch swallow undefined-method, throwing
 * `rerender`, and any unexpected workspace shape so a failure never
 * propagates back to the migrate orchestrator. logger.debug records
 * non-fatal failures at debug level.
 *
 * Threat-model + write-path hygiene check: this code path performs ZERO
 * writes (no fence body, no frontmatter, no CM6 dispatch). It only
 * triggers Obsidian's preview rerender via a documented API. The
 * CLAUDE.md "Phase 17 D-05 canonical write-path pattern" does not
 * apply (no write). The Phase 05.5 `'leetcode.*'` userEvent annotation
 * rule does not apply (no CM6 dispatch).
 */
export function rerenderReadingModePanes(app: App, path: string): void {
  try {
    const leaves = app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = (leaf as { view?: unknown }).view;
      if (!(view instanceof MarkdownView)) continue;
      // Narrow once we have an actual MarkdownView.
      const v = view as unknown as {
        file?: { path?: string } | null;
        getMode?: () => string;
        previewMode?: { rerender?: (full: boolean) => void };
      };
      if (v.file?.path !== path) continue;
      if (typeof v.getMode !== 'function' || v.getMode() !== 'preview') {
        continue;
      }
      try {
        v.previewMode?.rerender?.(true);
      } catch {
        // Inner: swallow per-leaf rerender exception so subsequent
        // matching leaves still get their rerender. No log here — the
        // outer catch handles the wider failure mode if it surfaces.
      }
    }
  } catch {
    // Outer: an unexpected workspace API shape (e.g., getLeavesOfType
    // missing) must NOT propagate to the migrate orchestrator.
  }
}
