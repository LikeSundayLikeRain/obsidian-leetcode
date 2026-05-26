---
phase: 16-language-packs-switching
plan: 04
subsystem: editor
tags: [codemirror, language-switch, compartment, chevron, child-editor, lang-01]

# Dependency graph
requires:
  - phase: 16-language-packs-switching
    plan: 01
    provides: "languageCompartment singleton + buildLanguageExtensions(slug, override) builder"
  - phase: 16-language-packs-switching
    plan: 02
    provides: "SettingsStore.getIndentSizeOverride(): 'auto' | 2 | 4 | 8"
  - phase: 13-nested-editor-foundation
    provides: "ChildEditorRegistry.get(filePath) lookup + child EditorView lifecycle"
  - phase: 14-bidirectional-sync
    provides: "childEditorSync.ts:89 docChanged guard — effects-only transactions skip child→parent sync"
provides:
  - "switchFenceLanguage Step B′: dispatches Compartment.reconfigure on the child editor when present (LANG-01, D-12)"
  - "LeetCodePlugin.dispatchChildLanguageReconfigure(filePath, newSlug): private helper extracted for unit testability (option (b) per plan)"
affects:
  - "16-05 (UAT — chevron-driven language switch is now end-to-end visible: parent fence-tag flips and child reparses in lock-step)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Effects-only Compartment.reconfigure dispatch on the child carries userEvent 'leetcode.lang-switch' — childEditorSync.ts:89 docChanged guard makes it a no-op for child→parent propagation; the parent's nestedEditor StateField never sees it (dispatch goes to child)"
    - "Helper extraction pattern: complex method bodies that need unit-test coverage are extracted into private methods on the LeetCodePlugin class so tests can invoke them via `LeetCodePlugin.prototype.helper.call(fakePlugin, ...)` without standing up the full plugin"
    - "Defensive try/catch around child dispatch matches childEditorSync.ts:115 convention — child may be in teardown when chevron handler fires"

key-files:
  created:
    - "tests/main/switchFenceLanguage.test.ts (185 lines): 8 unit tests covering the dispatchChildLanguageReconfigure helper"
  modified:
    - "src/main.ts: +1 import (languageCompartment, buildLanguageExtensions); JSDoc on switchFenceLanguage extended with Step B′ description; new Step B′ call site between parent dispatch and processFrontMatter; new private helper dispatchChildLanguageReconfigure"

key-decisions:
  - "Adopted plan option (b): extract the dispatch logic into a private LeetCodePlugin method dispatchChildLanguageReconfigure(filePath, newSlug). Reason: switchFenceLanguage has many irreducibly complex collaborators (workspace, metadataCache, client, processFrontMatter, parent CM EditorView), making full-method tests very heavy. Extracting the new logic gives focused, fast tests for the LANG-01 dispatch invariants without losing coverage of the parent-side flow (covered structurally by acceptance grep checks + existing Phase 5.3 tests)."
  - "Kept the dispatch effects-only (no `changes`, no `selection`) per D-12 + RESEARCH §5/§6. Verified by an explicit test that asserts 'changes' and 'selection' keys are NOT present on the dispatch spec."
  - "Optional-chain on `this.childEditorRegistry?.get(...)` (not just plain access). Defensive: while registry is non-null in production after onload, the helper may be invoked during teardown windows; the optional-chain matches the existing convention at src/main.ts:939 (`this.childEditorRegistry?.destroyAll()` in onunload)."
  - "Kept the existing parent-side Step B (cm.dispatch with changes + languageRefreshEffect + userEvent) untouched. Only added Step B′ AFTER it. Order rationale per plan: parent fence-tag flips visibly first, then child reparses; both are synchronous within one JS frame so neither is observable as a separate paint."

patterns-established:
  - "Step B′ insertion position: between Step B's parent dispatch (line ~2393) and Step C's await processFrontMatter (line ~2417). The child dispatch is synchronous so no microtask runs between B and B′ — the two dispatches land in one JS frame."

requirements-completed: [LANG-01]

# Metrics
duration: ~10 min
completed: 2026-05-22
---

# Phase 16 Plan 04: Chevron-driven Child Language Reconfigure Summary

**Atomic Compartment.reconfigure dispatch on the child editor in `switchFenceLanguage` Step B′ — lock-steps the child's parser, indent unit, closeBrackets, and Cmd-/ keymap with the visible parent fence-tag flip, completing LANG-01.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-22T19:48Z (executor spawn)
- **Completed:** 2026-05-22T19:59Z
- **Tasks:** 2 (combined into one TDD cycle: RED test → GREEN impl → REFACTOR for lint)
- **Commits:** 2 (RED + GREEN)
- **Files changed:** 2 (1 created, 1 modified)

## What Was Built

**Task 1 — `src/main.ts` (commit `8e65d2a`, GREEN):**

- Added import:
  ```ts
  import { languageCompartment, buildLanguageExtensions } from './main/childEditorLanguage';
  ```
  Placed adjacent to the existing `findCodeFence, languageRefreshEffect` import (line 100) for locality.

- Extended JSDoc on `switchFenceLanguage` with a new Step B′ paragraph documenting LANG-01 / D-12, the effects-only invariant, and the rationale for placement between Step B and Step C.

- Inserted Step B′ call site between the parent `cm.dispatch({...})` (line ~2393) and the `await app.fileManager.processFrontMatter(...)` (line ~2417):
  ```ts
  this.dispatchChildLanguageReconfigure(file.path, newSlug);
  ```

- Added new private helper method `dispatchChildLanguageReconfigure(filePath, newSlug): void` placed after `switchFenceLanguage` and before `switchLanguage`:
  ```ts
  private dispatchChildLanguageReconfigure(filePath: string, newSlug: string): void {
    const childView = this.childEditorRegistry?.get(filePath);
    if (!childView) return; // silent no-op
    const indentOverride = this.settings.getIndentSizeOverride();
    try {
      childView.dispatch({
        effects: languageCompartment.reconfigure(
          buildLanguageExtensions(newSlug, indentOverride),
        ),
        userEvent: 'leetcode.lang-switch',
      });
    } catch {
      // child may be in teardown — silent per project convention
    }
  }
  ```

**Task 2 — `tests/main/switchFenceLanguage.test.ts` (commits `9f7f500` RED, `8e65d2a` GREEN):**

- 8 unit tests under `describe('dispatchChildLanguageReconfigure (LANG-01, D-12)')`:
  1. Dispatches a Compartment.reconfigure effect on the child when registry returns a view
  2. Passes `(newSlug, getIndentSizeOverride())` into `buildLanguageExtensions`
  3. Re-reads the override on each call (no caching)
  4. Silent no-op when `registry.get()` returns `undefined`
  5. Catches dispatch errors silently (child in teardown)
  6. Uses `userEvent: 'leetcode.lang-switch'` (CLAUDE.md convention)
  7. Effects-only — no `changes`, no `selection` (T-16-04-01 mitigation: child sync's docChanged guard at `childEditorSync.ts:89` skips it)
  8. Looks up the child by the provided file path

- Mocking strategy: `vi.mock('../../src/main/childEditorLanguage')` returns sentinel mocks for `languageCompartment.reconfigure` and `buildLanguageExtensions`. The helper is invoked via `LeetCodePlugin.prototype.dispatchChildLanguageReconfigure.call(fakePlugin, ...)` — no need to instantiate the full plugin or its dependencies.

## Test Coverage Matrix

| Behavior | Test | Result |
| -------- | ---- | ------ |
| Dispatch shape: `effects` + `userEvent` | dispatch shape check | PASS |
| `buildLanguageExtensions(newSlug, override)` invocation | spy assertion | PASS |
| Override re-read on every call | `mockReturnValueOnce` check across 2 calls | PASS |
| Silent no-op when child registry empty | `not.toHaveBeenCalled()` checks | PASS |
| try/catch swallows dispatch throws | `not.toThrow()` + dispatch invocation count | PASS |
| `userEvent: 'leetcode.lang-switch'` exact match | string equality | PASS |
| Effects-only — `changes` + `selection` absent | property `in` check | PASS |
| Registry.get called with correct file path | spy assertion | PASS |

8/8 tests pass. Full suite: 1577 passed, 3 skipped — no regressions.

## Verification Results

| Check | Result |
| ----- | ------ |
| `npm run build` (tsc strict + esbuild production) | PASS — exit 0 |
| `npx vitest run tests/main/switchFenceLanguage.test.ts` | PASS — 8/8 |
| `npx vitest run` (full suite) | PASS — 1577 passed, 3 skipped, 0 failures |
| `grep -c "languageCompartment.reconfigure" src/main.ts` | 3 (1 in code call + 2 in JSDoc) — meets "≥ 1 in switchFenceLanguage" |
| `grep -n "childEditorRegistry?.get" src/main.ts` | matches at line 2463 inside the helper — within the 2280–2470 range |
| `grep -c "userEvent: 'leetcode.lang-switch'" src/main.ts` | 5 (2 in code calls + 3 in comments/JSDoc) — meets "≥ 2" |
| `grep -c "buildLanguageExtensions(newSlug" src/main.ts` | 1 — meets "= 1" |
| `grep "from './main/childEditorLanguage'" src/main.ts` | matches once — meets "= 1" |
| Step B′ position between B and C | VERIFIED via line read — `cm.dispatch({...})` (Step B) → `this.dispatchChildLanguageReconfigure(...)` (Step B′) → `await this.app.fileManager.processFrontMatter(...)` (Step C) |
| `npm run lint` clean on new files | YES — `tests/main/switchFenceLanguage.test.ts` and `src/main.ts` (the parts touched) report 0 new errors |
| `npm run lint` overall exit 0 | NO — 56 pre-existing baseline errors elsewhere remain (out of scope; same baseline reported in 16-01 and 16-02 SUMMARYs) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Lint discipline] `@typescript-eslint/unbound-method` errors in new test file (commit `8e65d2a`)**

- **Found during:** Task 2 verification (`npm run lint`).
- **Issue:** `eslint-plugin-typescript-eslint`'s `unbound-method` rule flagged two references in `tests/main/switchFenceLanguage.test.ts`:
  - The `helper` extraction off `LeetCodePlugin.prototype.dispatchChildLanguageReconfigure` (line 73 — flagged because the prototype property is a method that uses `this`, but the test always invokes it via `helper.call(fakePlugin, ...)` which provides explicit binding).
  - The `expect(languageCompartment.reconfigure).not.toHaveBeenCalled()` assertion (line 133 — flagged because the rule treats vi.fn() references as unbound; benign in test code).
- **Fix:** Added `// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional; bound via .call` directives with explicit justifications. Both directives mirror similar precedents in the existing test suite (e.g., `tests/main/childEditorFactory.test.ts` flagged-as-deferred in 16-01 SUMMARY's "Deferred Issues" section).
- **Files modified:** `tests/main/switchFenceLanguage.test.ts`.
- **Why this is a Rule 3 (auto-fix blocking, no user permission) and not architectural:** The lint errors were caused directly by the new test file; they block clean lint output. The fix is a documented suppression directive — no logic change, no test behavior change. The 8 tests still all pass after the directive is applied.

**No bugs auto-fixed (Rule 1):** None.
**No critical missing functionality auto-added (Rule 2):** None.

### Threat Model Mitigations

| Threat ID | Disposition | Implementation Verification |
|-----------|-------------|----------------------------|
| T-16-04-01 (echo loop via child sync) | mitigate | Test "emits an effects-only transaction" asserts dispatch has no `changes` field. Combined with the verified `childEditorSync.ts:89` `docChanged` guard, child→parent propagation skips the reconfigure. |
| T-16-04-02 (section lock blocks child reconfigure) | mitigate | Section lock is a parent-only `EditorState.changeFilter`. The dispatch goes to the CHILD, not the parent — structurally separate. No code path traverses the parent's filter. |
| T-16-04-03 (child throws on dispatch during teardown) | mitigate | Test "catches dispatch errors silently" asserts the helper does not propagate exceptions. The try/catch matches `childEditorSync.ts:115` defensive convention. |
| T-16-04-04 (stale indent override) | accept | Per plan threat register; override is read at dispatch time via `this.settings.getIndentSizeOverride()` so the freshest value is used. Verified by test "passes the freshly-read override on each call (not a cached value)". |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The dispatch is a plugin-internal CM6 transaction targeting an EditorView already owned by the plugin; the `'leetcode.lang-switch'` userEvent annotation is the existing CLAUDE.md convention. No threat flags.

## Deferred Issues

- **56 pre-existing lint errors elsewhere in the repo** (unchanged from the 16-01/16-02 baseline). These pre-date this plan and are explicitly out of scope per the SCOPE BOUNDARY clause. Largest cluster remains `@typescript-eslint/unbound-method` errors in `tests/main/childEditorFactory.test.ts` and `import/no-extraneous-dependencies` errors flagging `@codemirror/view` / `@codemirror/state` (which are correctly external in `esbuild.config.mjs`). Cleanup tracked for a future Phase 17 hygiene plan.
- **CM6 core duplicate** (`@codemirror/state` 6.5.0 + 6.6.0 dual resolution) inherited from 16-01. Documented in 16-01 SUMMARY's Deferred Issues and not introduced by this plan.

## Self-Check: PASSED

- `[ -f src/main.ts ]` — FOUND (modified)
- `[ -f tests/main/switchFenceLanguage.test.ts ]` — FOUND (created)
- Commit `9f7f500` (RED test) — FOUND in `git log --oneline`
- Commit `8e65d2a` (GREEN impl + lint fixes) — FOUND in `git log --oneline`
- Build: `npm run build` exits 0
- New tests: `npx vitest run tests/main/switchFenceLanguage.test.ts` — 8/8 passing
- Full suite: 1577 passed, 3 skipped, 0 failures
- Acceptance criteria all-task verification:
  - Task 1 (impl): import added once, `languageCompartment.reconfigure` once in code (inside `switchFenceLanguage`/helper), `childEditorRegistry?.get(filePath)` once in the helper, `userEvent: 'leetcode.lang-switch'` >= 2 in code, `buildLanguageExtensions(newSlug` exactly once, Step B′ positioned between Step B and Step C
  - Task 2 (tests): 8 tests passing (>= 6 required); userEvent literal-string equality test present (item 6); buildLanguageExtensions slug+override test present (item 2); registry-undefined silent-no-op test present (item 4); dispatch-throws silent path test present (item 5); full suite green
- Plan-level success criteria: extended switchFenceLanguage with Step B′ (D-12), effects-only + userEvent invariant preserved, silent no-op when registry empty, try/catch defensive convention, all tests green, no Phase 5.3 chevron regressions

## Next Phase Readiness

- Wave 2 done: 16-04 dispatch helper is wired and tested; 16-03 (factory wiring of `languageCompartment` into the child editor's extensions array) lands in parallel and provides the receiving end of this dispatch.
- 16-05 (UAT) will exercise the end-to-end chevron switch: parent fence-tag flips visibly, child reparses with new language pack, indent unit changes per D-05/D-06, Cmd-/ comment toggle uses the new language's tokens, and bracket-pair behavior follows the new languageData. The dispatch is now in place to be exercised live.

---
*Phase: 16-language-packs-switching*
*Plan: 04 — Chevron-driven Child Language Reconfigure*
*Completed: 2026-05-22*
