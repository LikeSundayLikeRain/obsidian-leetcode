---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 10
status: completed
completed_at: 2026-05-31
gap_closure: true
closes_gaps:
  - language-switch-silent          # T3
  - run-submit-no-code-block        # T7
  - retrieve-no-submission          # T9
  - reset-fence-corruption          # T10 — DATA CORRUPTION
  - action-row-dom-hierarchy        # T8 — cosmetic
---

# Plan 20-10 — Gap closure for Phase 20 UAT (T3, T7, T8, T9, T10)

## Outcome

All five UAT-discovered gaps closed end-to-end and signed off via the 24-step UAT replay. Three additional follow-up bugs surfaced during dev-vault verification and were fixed in-line as hotfix patches; three minor issues were deferred to Phase 22 polish.

## Files Created / Modified

### New files

- `tests/main/switchLanguageFromWidget.test.ts` — 12 cases covering registered-child dispatch, multi-pane, popout, registry-vs-widget.view discrimination
- `tests/main/runFromWidget.test.ts` — 9 cases covering Run/Submit code-resolution from widget body

### Modified files

| File | Change | Driver |
|------|--------|--------|
| `src/widget/fenceSerialization.ts` | JSDoc only — REUSES existing `rewriteFenceBody` | Task 1 |
| `src/solve/starterCodeInjector.ts` | `fenceKind?: 'leetcode-solve' \| 'legacy'` option; short-circuit to `rewriteFenceBody` when `countLeetCodeSolveFenceOpeners > 0` | Task 1 |
| `src/notes/NoteTemplate.ts` | JSDoc only — points readers to upstream short-circuit | Task 1 |
| `src/solve/resetCodeWithConfirm.ts` | Async `resolveFenceKind` seam in `ResetCodeWithConfirmDeps` | Task 2 |
| `src/main.ts` | resetCode wires async resolver via `vault.read + countLeetCodeSolveFenceOpeners`; `switchLanguageFromWidget` dispatches via `childEditorRegistry.get` (PRIMARY) with widget.view fallback + `userEvent: 'leetcode.lang-switch'`; runFromWidget/submitFromWidget supply `currentCode` / `getCurrentCode`; `runInterpretedInput` accepts `ctx.currentCode`; `retrieveLastSubmissionWithSlug` invalidates cache before fetch | Tasks 2, 4, 5, hotfix 5 |
| `src/graph/SubmissionHistoryStore.ts` | `EMPTY_TTL_MS = 5_000`; non-empty TTL preserved | Task 3 |
| `src/graph/copyToCode.ts` | Reuses `countLeetCodeSolveFenceOpeners` to thread `fenceKind` | Task 3 |
| `src/solve/submissionOrchestrator.ts` | `getCurrentCode?: () => string` deps option; widget path skips extractFirstFencedBlock; **TODO Phase 22** marker at deletion site | Task 5 |
| `src/widget/WidgetController.ts` | Inner `.leetcode-widget-codeblock` wrapper; EditorView mounts inside the wrapper; metadataCache 'changed' listener uses 3rd-arg cache; smart Tab handler with vim-aware fall-through and cursor-position-aware insert/indent | Task 6, hotfix 3, hotfix 6/7 |
| `src/widget/widgetActionRow.test.ts` | DOM hierarchy + paint-invariant assertions (CSS-text-level) | Task 6 |
| `src/main/languageChevronWidget.ts` | Per-item click handler compares against live `mountedSlug` instead of closure-captured `currentSlug` | hotfix 4 |
| `src/solve/SessionExpiredNotice.ts` | Use top-level `createFragment()`; build via `frag.createSpan / frag.createEl` (auto-append on the fragment, not the document) | hotfix 1 + 2 |
| `src/graph/SubmissionPickerModal.ts` | Same as above on the test-stub auth path | hotfix 1 + 2 |
| `src/types/obsidian-globals.d.ts` | `createFragment` declared as top-level global; `Node extends DomCreateHelpers` so `DocumentFragment.createSpan/createEl` typecheck; bogus `Document.createFragment` ambient removed | hotfix 1 + 2 |
| `tests/helpers/setup.ts` | Polyfill global `createFragment`; install `createEl/createDiv/createSpan` on `DocumentFragment.prototype` in append-mode | hotfix 1 + 2 |
| `styles.css` | Grey paint moved off `.cm-editor .lc-nested-editor` onto `.cm-editor .lc-nested-editor .leetcode-widget-codeblock`; defensive transparent-bg reset on action-row sibling | Task 6 |
| Test fixtures | `resetCommand.test.ts`, `resetCommand.childDispatch.test.ts`, `starterCodeInjector.forced.test.ts`, `copyToCode.test.ts`, `SubmissionHistoryStore.test.ts`, `switchLanguageFromWidget.test.ts`, `runFromWidget.test.ts`, `widgetActionRow.test.ts`, `WidgetController.test.ts` — fence-kind fixtures, multi-file/popout/null-active-view scenarios, paint-invariant CSS check, mocked `@codemirror/commands` extended | All tasks |

## Test counts

- **New cases:** 21 (12 in switchLanguageFromWidget.test.ts + 9 in runFromWidget.test.ts) plus ~14 fixture additions across resetCommand / starterCodeInjector / copyToCode / SubmissionHistoryStore / widgetActionRow.
- **Total suite:** 2123 tests / 240 files.
- **Failures:** 5 pre-existing environmental timeout flakes (probe-debounce, reset-disclosures-command, preview/router) unrelated to plan 20-10 — all pass in isolation.

## Key decisions made during execution

1. **T7 fix shape:** Refactor `runInterpretedInput` / `submissionOrchestrator.submit` to accept `currentCode` / `getCurrentCode` directly (option (c) from the debug doc). Synthetic-fence wrap (option (b)) was rejected because it becomes dead code after Phase 22 deletes the `*FromActive` legacy path.
2. **SSoT discipline (BLOCKER #1):** Reused the existing `rewriteFenceBody` (`fenceSerialization.ts:141`) for kind-aware body replace instead of introducing a duplicate `replaceLeetCodeSolveFenceBody`. The Plan 19-04 nested-triple-backticks property tests are load-bearing and a duplicate scanner would have regressed them silently.
3. **Anti-pattern avoidance (BLOCKER #3):** Reset's fence-kind resolver uses `vault.read + countLeetCodeSolveFenceOpeners`, NOT `getActiveViewOfType(MarkdownView)`. The active-view-bail was the exact silent-bail anti-pattern that root-caused T3 in 20-09; mirroring it in T10 would have re-corrupted the leetcode-solve fence in popout / multi-pane / cross-pane command-palette scenarios.
4. **Canonical write-path (BLOCKER #2):** `switchLanguageFromWidget` dispatches via `childEditorRegistry.get(file.path)` (PRIMARY) with `widget.view` as a fallback, matching the Phase 17 D-05 convention. Asserting `widget.view === registeredChild` without verification is the same class of error 20-09 made.
5. **Submission-history TTL:** `EMPTY_TTL_MS = 5s` (short-TTL-on-empty), not "never cache empty". Never-cache amplifies the D-02 prefetch race into a per-note-open LC API call and could trip LC's 20 req / 10 sec throttle when users open many unsubmitted problems in succession.
6. **Run/Submit empty-body Notice copy:** "Add code to your solution before running." — wording stays appropriate post-Phase-22 when the widget body is the only code source.

## Architectural notes (verbatim from plan must_haves)

- **Fence-kind body-replace REUSES `rewriteFenceBody`** (`src/widget/fenceSerialization.ts:141`) — no duplicate helper introduced. Property tests in `tests/widget/fenceSerialization.property.test.ts` cover the regression-prone closer-resolution rule (Plan 19-04 nested-triple-backticks).
- **Legacy-vs-v1.3 detection REUSES `countLeetCodeSolveFenceOpeners`** (`src/widget/fenceLocator.ts:118-138`) across reset, retrieve, and copyToCode — SSoT discipline.
- **`switchLanguageFromWidget` dispatches via `childEditorRegistry.get(file.path)`** with `widget.view` fallback — matches CLAUDE.md §Conventions canonical write-path. Multi-pane / popout work without silent-bail.
- **`resetCode`'s fence-kind resolver is async + uses text-scan** — NOT `getActiveViewOfType` (T3 silent-bail anti-pattern). T10 holds in popout / non-active-pane / command-palette-from-other-file scenarios.
- **SubmissionHistoryStore caches empty rows[] with EMPTY_TTL_MS = 5s** — closes the 60s blackout window without amplifying D-02 prefetch into a fetch storm against LC's 20 req / 10 sec throttle.
- **`runInterpretedInput` + `submissionOrchestrator` accept code directly** — decouples the widget path from the v1.2 markdown-body assumption. **TODO Phase 22** markers at both deletion sites (`src/main.ts:3805`, `src/solve/submissionOrchestrator.ts:253`).

## Hotfix series (UAT follow-ups)

UAT exposed bugs that the test suite had masked because the test polyfills shared the same incorrect assumptions as the production code. Each hotfix is a small atomic commit:

| # | Commit | Symptom | Root cause |
|---|--------|---------|------------|
| 1 | `a7b65f1` | `TypeError: activeDocument.createFragment is not a function` on Run/Submit when no auth cookies | Obsidian's `createFragment` is a top-level global, not a `Document` method. Bogus ambient declaration claimed otherwise; test polyfill hid the bug. |
| 2 | `424e02c` | `DOMException: Only one element on document allowed` after the createFragment fix | Obsidian's `Node.createSpan / createEl` create AND append in one call — calling them on `activeDocument` appended to the Document itself. Fixed by calling on the fragment. |
| 3 | `5a5c620` | One-cycle parser-swap lag (chevron switch updates body but parser stays on prior slug) | `metadataCache 'changed'` listener re-read `getFileCache(...)` instead of using the event's 3rd-arg cache. Defensive backstop now; superseded by hotfix 5. |
| 4 | `fff3b72` | "Can't switch back to the mount-time language" | Per-item click handler in `buildLanguageChevron` compared `slug === currentSlug` against the closure-captured slug instead of the live `mountedSlug`. |
| 5 | `4cfa60e` | One-cycle parser-swap lag (still present after hotfix 3) | Obsidian fires `'changed'` with the prior frontmatter on the very tick the new write lands. `switchLanguageFromWidget` now dispatches `languageCompartment.reconfigure` inline alongside the body change; the metadataCache listener is a defensive backstop. |
| 6 | `54c0647` | Tab inside widget moved focus instead of inserting indentation | The widget's keymap omitted `indentWithTab`. Added it (later replaced in hotfix 7). |
| 7 | `981cc91` | Tab indented whole lines regardless of cursor position; Tab fired in vim Normal mode | Replaced `indentWithTab` with explicit Tab/Shift-Tab handlers: `getCM(view).state.vim.insertMode` gate falls through to vim outside Insert mode; empty selection routes to `insertTab` (cursor-position aware); non-empty selection routes to `indentMore`/`indentLess`. |

## Deferred to Phase 22 polish

Three minor cosmetic items surfaced during UAT and were added to Phase 22's success criteria (#7, #8, #9 in the ROADMAP entry):

- **Vim-Tab cursor-marker sync** — vim's CM5-style block-cursor marker visually lags after Tab in Insert mode (typing lands at the right offset, the marker doesn't update). Fix: route Insert-mode Tab through vim's input pipeline (`Vim.handleKey` or `CodeMirror.signal` on `getCM(view)`).
- **Widget hover border** — Obsidian's default `.cm-editor:hover` outline bleeds through the widget surface. Fix: scoped CSS override on `.lc-nested-editor .cm-editor:hover` that doesn't suppress legitimate cursor / focus styles.
- **Action-row font** — chevron + button labels currently inherit `var(--font-monospace)` from the widget's `.cm-content` theme rule. Fix: explicit `font-family: var(--font-text)` on `.leetcode-code-actions` so controls read as UI chrome.

## Verification gates passed

- `npm run build` — clean
- `npx tsc --noEmit --skipLibCheck` — clean
- `npm test` — all suites green except 5 pre-existing environmental flakes
- All grep-verification checks from `<verification>` block: TODO Phase 22 markers (×2), leetcode-solve test fixtures (×4), childEditorRegistry primary dispatch, EMPTY_TTL_MS / isEmpty flag, countLeetCodeSolveFenceOpeners SSoT (both copyToCode + main.ts), leetcode-widget-codeblock (source + CSS + test), rewriteFenceBody reuse in starterCodeInjector
- 24-step UAT replay: all pass (user signoff 2026-05-31)

## Phase 22 readiness

The `*FromWidget` surface is the canonical path. Phase 22's mechanical sweep:

1. Delete `*FromActive` methods from `src/main.ts`.
2. Rename `*FromWidget` → `*FromActive`.
3. Delete the `extractFirstFencedBlock` fall-through branches in `runInterpretedInput` (marked `// TODO Phase 22:` at line 3805) and `submissionOrchestrator.submit` (marked at line 253).
4. Remove `ProblemContext.currentBody` (only legacy callers used it).

Both deletion sites carry explicit comment markers identifying themselves as Phase 22 cleanup, so a future executor sees exactly which branch to remove.
