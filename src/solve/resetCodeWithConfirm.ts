// src/solve/resetCodeWithConfirm.ts
//
// Phase 5.2 Plan 04 — D-07 Reset code helper.
//
// Extracted from main.ts so tests can exercise the confirm gate without
// instantiating a real Plugin / Modal. Production callers inject a `confirm`
// function that opens `ConfirmOverwriteModal` (D-11) and resolves with the
// user's choice; tests inject a stub resolver.
//
// Gate rules (per PATTERNS SP-4 + threat-model T-05.2-12):
//   - Non-empty fence present → open confirm; cancel aborts without any
//     vault mutation.
//   - Empty fence or no fence → skip confirm; force-inject starter directly.
//
// On successful write, fires the Notice "Code reset to starter." via the
// injected `notify` callback. Production wires `notify = (msg) => new Notice(msg, 3000)`.

import type { App, TFile } from 'obsidian';
import type { DetailCacheEntry } from '../settings/SettingsStore';
import { forceInjectCodeSection } from './starterCodeInjector';

/**
 * Phase 17 D-03 helper — slice the fence body out of a full-note string.
 *
 * Used by the production caller in `src/main.ts:resetCode` to derive the
 * body-only payload for a child-CM6 dispatch (the child's doc IS the fence
 * body, so dispatching the full note onto the child would inject the
 * surrounding markdown — frontmatter, headings, fence markers — into the
 * code editor).
 *
 * Pattern H from 17-PATTERNS.md — uses the same fence-detection SSoT
 * (`findCodeFence`) used by every other plugin path. Returns the substring
 * exclusive of opener and closer marker lines. If the fence cannot be
 * detected (defensive — should never happen since `forceInjectCodeSection`
 * just produced it), returns the input unchanged so the caller can fall
 * through to a no-op rather than corrupting the child doc.
 */
export function extractFenceBodyFromFullNote(fullNote: string): string {
  const lines = fullNote.split('\n');
  const FENCE_RE = /^\s*```/;
  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;

  let inCodeSection = false;
  let openerIdx = -1;
  let closerIdx = -1;

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
    if (inCodeSection && FENCE_RE.test(text)) {
      openerIdx = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (FENCE_RE.test(lines[j] ?? '')) {
          closerIdx = j;
          break;
        }
      }
      break;
    }
  }

  if (openerIdx < 0 || closerIdx < 0 || closerIdx <= openerIdx) {
    return fullNote;
  }
  // Body lines are (openerIdx, closerIdx) exclusive on both ends.
  return lines.slice(openerIdx + 1, closerIdx).join('\n');
}

export interface ResetCodeDispatchHandle {
  /**
   * Replace the entire ## Code fence body. The argument is the **full new
   * note string** produced by `forceInjectCodeSection(currentBody, ...)` —
   * the implementation extracts the body slice between fence markers and
   * dispatches it on the appropriate CM6 view.
   */
  replaceFullBody(next: string): void;
}

export interface ResetCodeWithConfirmDeps {
  app: App;
  file: TFile;
  slug: string;
  settings: {
    getProblemDetail(slug: string): DetailCacheEntry | null;
    getDefaultLanguage(): string;
  };
  /** Resolves to true if the user confirms overwrite; false on cancel. */
  confirm: () => Promise<boolean>;
  /** Fires the user-visible success Notice. In production, `(msg) => new Notice(msg, 3000)`. */
  notify: (message: string) => void;
  /**
   * Phase 17 D-03 / D-05 — caller-supplied seam for dispatching the Reset
   * write through the child editor's CM6 instance instead of the vault layer.
   *
   * Callers SHOULD look up the child editor first via the plugin's
   * `childEditorRegistry`. When a child is registered for `file`, return a
   * handle that dispatches on the child (the existing
   * `createChildSyncExtension` in `src/main/childEditorSync.ts:82-121`
   * automatically mirrors the change to the parent with
   * `addToHistory.of(false)`, restoring the Phase 15 D-05 cm-z scope
   * isolation invariant). When no child is registered, return `null` and the
   * helper falls back to `app.vault.process(...)` — D-04 fallback semantics
   * preserved for the no-MarkdownView path.
   *
   * The dispatch on the child must NOT carry `Transaction.addToHistory.of(false)` — Reset deserves a child
   * undo entry; the existing parent-side mirror already runs with
   * `addToHistory.of(false)` on the parent.
   *
   * Omitting the field entirely (or supplying a function that always returns
   * null) is equivalent to the legacy vault.process-only path — used by all
   * unit tests that do not exercise the child route.
   */
  getDispatchHandle?: (file: TFile) => ResetCodeDispatchHandle | null;
  /**
   * `resolveActiveLangSlug` — Phase 17 gap-closure (17-08, 17-UAT.md Issue 2
   * / Test 10) — restores the Phase 16 D-06 canonical language priority chain
   * at the post-D-03 child-dispatch site. The resolver, when supplied, returns
   * the langSlug the helper should write — implementing the canonical
   * priority order:
   *
   *   1. `lc-language` frontmatter (highest — chevron's source of truth)
   *   2. active fence opener tag (parsed from the active MarkdownView's CM6)
   *   3. `undefined` → helper falls back to `settings.getDefaultLanguage()`
   *
   * Returning a non-empty slug short-circuits the default fallback. Returning
   * `undefined` (or omitting the field entirely) preserves the legacy
   * default-only path for backward compatibility — `tests/main/resetCommand.test.ts`
   * legacy fixtures don't supply this seam and continue to work.
   *
   * Reference: `.planning/debug/reset-code-language-regression.md` (Phase 16
   * fix), `.planning/phases/17-polish-edge-cases/17-UAT.md` Test 10 (RESET-01),
   * Phase 17 D-06 CONTEXT note.
   */
  resolveActiveLangSlug?: (file: TFile) => string | undefined;

  /**
   * Phase 20 Plan 20-10 (gap-closure T10 — DATA CORRUPTION) — fence-kind seam.
   * Returns the existing fence's kind by scanning the note's text on disk
   * (NOT by consulting the active view, which is the silent-bail anti-pattern
   * that root-caused T3 and would re-corrupt T10 in popout / non-active-pane /
   * command-palette-from-other-file scenarios — see
   * .planning/debug/reset-fence-kind-corruption.md and
   * .planning/debug/widget-plugin-handoff-cluster.md).
   *
   * Async because the canonical implementation is `vault.read(file)` +
   * `countLeetCodeSolveFenceOpeners(text) > 0`. The result threads into
   * `forceInjectCodeSection`'s `fenceKind` option (Plan 20-10 Task 1) so v1.3
   * notes get the body-only replace via `rewriteFenceBody` instead of the
   * langSlug-blind legacy path.
   *
   * Returning `'legacy'` or `null` preserves the v1.2 forceInjectCodeSection
   * path verbatim. Omitting the field is equivalent to `'legacy'`/null —
   * backward compat for tests that don't exercise the v1.3 path
   * (tests/main/resetCommand.test.ts legacy fixtures continue to work).
   */
  resolveFenceKind?: (
    file: TFile,
  ) => Promise<'leetcode-solve' | 'legacy' | null>;
}

/**
 * Reset the ## Code fence to the starter snippet for the current default
 * language. Gates destructive overwrite behind `confirm` when a non-empty
 * fence is present; proceeds silently otherwise.
 */
export async function resetCodeWithConfirm(
  deps: ResetCodeWithConfirmDeps,
): Promise<void> {
  const currentBody = await readCurrentBody(deps.app, deps.file);

  const detail = deps.settings.getProblemDetail(deps.slug);
  // Phase 17 gap-closure (17-08 — restores Phase 16 D-06 priority chain at
  // the Phase 17 D-03 child-dispatch site). Caller supplies the resolver
  // implementing: lc-language fm > fence opener tag > default. When the
  // resolver returns undefined or null (or is omitted entirely), fall back
  // to the legacy default-only path so existing tests/main/resetCommand.test.ts
  // fixtures keep working without modification.
  const resolved = deps.resolveActiveLangSlug?.(deps.file);
  const langSlug =
    typeof resolved === 'string' && resolved.length > 0
      ? resolved
      : deps.settings.getDefaultLanguage();
  const starter =
    detail?.codeSnippets?.find((s) => s.langSlug === langSlug)?.code ?? '';

  // Phase 20 Plan 20-10 (gap-closure T10 — DATA CORRUPTION) — fence-kind
  // seam. Resolved BEFORE the dispatch handle lookup so both branches (child
  // dispatch + vault.process fallback) thread the same kind into
  // forceInjectCodeSection. When the resolver returns 'leetcode-solve' AND
  // the note has a v1.3 fence, forceInjectCodeSection short-circuits to
  // rewriteFenceBody (Plan 20-10 Task 1), preserving the leetcode-solve
  // opener byte-for-byte. Legacy / null / undefined → existing v1.2 path
  // runs unchanged.
  const fenceKind = (await deps.resolveFenceKind?.(deps.file)) ?? null;
  const injectOpts = {
    starterCode: starter,
    langSlug,
    ...(fenceKind === 'leetcode-solve' || fenceKind === 'legacy'
      ? { fenceKind }
      : {}),
  };

  // Phase 17 D-03 — child-CM6 dispatch path. When a child is registered for
  // this file, route the write through the child so the undo entry lands on
  // the child (Phase 15 D-05 cm-z scope isolation). The handle's caller in
  // src/main.ts looks up the child via `this.childEditorRegistry?.get(...)`.
  const handle = deps.getDispatchHandle?.(deps.file) ?? null;
  if (handle) {
    const next = forceInjectCodeSection(currentBody, injectOpts);
    handle.replaceFullBody(next);
  } else {
    // Phase 17 D-04 — vault.process fallback for the no-child path (note not
    // open in a MarkdownView). The reopen path will rebuild the child from
    // disk content.
    await deps.app.vault.process(deps.file, (body) =>
      forceInjectCodeSection(body, injectOpts),
    );
  }

  deps.notify('Code reset to starter.');
}

/** Mirror of SubmissionDetailModal's readCurrentBody — both production and
 *  mock vault expose `vault.read(file)` → Promise<string>. */
async function readCurrentBody(app: App, file: TFile): Promise<string> {
  const vault = (app as unknown as {
    vault?: { read?: (f: TFile) => Promise<string> };
  }).vault;
  if (vault?.read) return vault.read(file);
  return '';
}
