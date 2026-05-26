---
phase: 17-polish-edge-cases
plan: 01
subsystem: editor-write-path
tags: [reset, codemirror, cm6, child-editor, undo-isolation, section-lock]

# Dependency graph
requires:
  - phase: 13-nested-editor-foundation
    provides: ChildEditorRegistry, EditorView lifecycle (Map<filePath, EditorView>)
  - phase: 14-bidirectional-sync
    provides: createChildSyncExtension, addToHistory.of(false) mirror, syncAnnotation echo guard
  - phase: 15-keyboard-and-undo
    provides: cm-z scope isolation invariant (D-05) — child holds undo entries, parent never picks them up
  - phase: 16-language-packs-switching
    provides: dispatchChildLanguageReconfigure structural template (childEditorRegistry?.get + 'leetcode.<verb>' userEvent)
provides:
  - Reset code dispatches through the child EditorView's CM6 (when registered) with userEvent 'leetcode.reset.child'
  - vault.process fallback preserved for the no-child path (D-04)
  - extractFenceBodyFromFullNote helper — Pattern H (fence-detection SSoT) ported into resetCodeWithConfirm.ts
  - Canonical plugin write-path pattern documented in CLAUDE.md (D-05)
affects: [17-polish-edge-cases (subsequent plans 17-02..17-06), future Copy-to-Code audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern A — Plugin internal CM6 dispatch with 'leetcode.<verb>' userEvent (extended: 'leetcode.reset.child' added to audited callsites in CLAUDE.md ## Conventions)"
    - "Pattern 1 (canonical write-path) — child-first lookup via childEditorRegistry; vault.process fallback when no child registered"

key-files:
  created:
    - tests/main/resetCommand.childDispatch.test.ts
  modified:
    - src/solve/resetCodeWithConfirm.ts
    - src/main.ts
    - CLAUDE.md

key-decisions:
  - "Slice fence body from forceInjectCodeSection's full-note output via co-located extractFenceBodyFromFullNote helper rather than re-importing CM6 EditorState into the helper — keeps the helper free of @codemirror externals and matches Pattern H regex shape from codeActionsEditorExtension.findCodeFence."
  - "Child dispatch carries NO Transaction.addToHistory.of(false) — Reset is a normal child edit deserving an undo entry; the existing parent-side mirror at childEditorSync.ts:108-114 carries addToHistory.of(false) on the parent, preserving Phase 15 D-05 cm-z scope isolation."
  - "getDispatchHandle is OPTIONAL on ResetCodeWithConfirmDeps — pre-D-03 unit tests that don't exercise the child route continue to pass with the helper falling through to vault.process. No test churn beyond the new childDispatch suite."
  - "DO NOT add 'leetcode.reset.child' to ECHO_PRONE_USER_EVENTS — child→parent sync mirror MUST run for the Reset write to reach the parent doc."

patterns-established:
  - "Canonical write-path: child-first dispatch via registry lookup; vault.process fallback. The Reset path (src/main.ts:~2791-2803) is the canonical example for v1.2 forward."

requirements-completed: [INDENT-01, INDENT-02, INDENT-03, INDENT-04, ENTER-01, ENTER-02, ENTER-03, ENTER-04, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04, COMMENT-01, LANG-01]

# Metrics
duration: 10min
completed: 2026-05-23
---

# Phase 17 Plan 01: Reset Undo Refactor Summary

**Reset code now dispatches through the child EditorView's CM6 with userEvent `'leetcode.reset.child'` — Phase 15 D-05 cm-z scope isolation invariant restored for Reset, and the canonical plugin write-path pattern is now documented in CLAUDE.md.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-23T13:13:21Z
- **Completed:** 2026-05-23T13:24:01Z
- **Tasks:** 3 (1 RED test commit, 1 feat commit, 1 docs commit)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Reset write-path refactored: `src/main.ts:resetCode` now supplies a `getDispatchHandle` callback that looks up the child EditorView via `this.childEditorRegistry?.get(file.path)` and dispatches the body-only replace on the child with `userEvent: 'leetcode.reset.child'`. The existing `createChildSyncExtension` mirror at `src/main/childEditorSync.ts:108-114` propagates the change to the parent with `addToHistory.of(false)`, so the parent never picks up the Reset entry — Cmd-Z after Reset can never insert the prior solution body into adjacent sections.
- D-04 vault.process fallback preserved verbatim: when no child is registered for the file (note not open in a MarkdownView), the helper falls through to `app.vault.process(...)` per the original design.
- New regression test (`tests/main/resetCommand.childDispatch.test.ts`, 4 tests) — exercises the child dispatch route, the D-04 fallback, the no-`addToHistory.of(false)` invariant, and a source-level guard that `'leetcode.reset.child'` is NOT in `ECHO_PRONE_USER_EVENTS`.
- CLAUDE.md `## Conventions` block extended: new audited callsite for the Reset child dispatch, full canonical write-path pattern documented (D-05), explicit warning against adding `'leetcode.reset.child'` to the echo-prone set.

## Task Commits

Each task committed atomically:

1. **Task 1: Add failing regression test for Reset child-CM6 dispatch (D-03)** — `0c4c074` (test)
2. **Task 2: Refactor resetCodeWithConfirm + src/main.ts to route through child registry (D-03)** — `824f25e` (feat)
3. **Task 3: Update CLAUDE.md ## Conventions block (D-05 documentation)** — `0e4c69e` (docs)

## Files Created/Modified

- `tests/main/resetCommand.childDispatch.test.ts` (NEW) — 4 vitest specs covering Phase 17 D-03/D-04/D-05/D-06. Bootstraps with `vi.mock('obsidian')` per the established pattern at `tests/main/childEditorSync.test.ts:9-19`. Inlines `makeMockChildView` and `makeMockRegistry` mirroring the analog at `tests/main/childEditorSync.test.ts:87-109`. Source-grep guard for `ECHO_PRONE_USER_EVENTS`.
- `src/solve/resetCodeWithConfirm.ts` (MODIFIED) — Added `ResetCodeDispatchHandle` interface, optional `getDispatchHandle?` field on `ResetCodeWithConfirmDeps`, and the `extractFenceBodyFromFullNote` helper (Pattern H — same FENCE_RE / H2_CODE_RE / H2_ANY_RE shape as `findCodeFence`). The helper itself now branches on `getDispatchHandle?.(file)`: when a handle is returned, route through it; otherwise fall back to `vault.process` (D-04 preserved). Detailed JSDoc on the new field documents the canonical write-path contract.
- `src/main.ts` (MODIFIED) — `resetCode` wrapper now wires `getDispatchHandle` per the chevron-switch structural template at `dispatchChildLanguageReconfigure` (line 2462). Looks up child via `this.childEditorRegistry?.get(targetFile.path)`; when present, returns a handle that dispatches a full-body replace on the child with `userEvent: 'leetcode.reset.child'` (no `addToHistory.of(false)`). Defensive try/catch matches the project convention. `extractFenceBodyFromFullNote` imported alongside `resetCodeWithConfirm`.
- `CLAUDE.md` (MODIFIED) — `## Conventions` block extended with the new audited callsite (`src/main.ts:~2791-2803` Reset child dispatch sets `'leetcode.reset.child'`), the canonical plugin write-path pattern (D-05), and an explicit warning against adding `'leetcode.reset.child'` to `ECHO_PRONE_USER_EVENTS`.

## Decisions Made

- **Co-locate `extractFenceBodyFromFullNote` in `src/solve/resetCodeWithConfirm.ts` instead of importing it from `src/main/codeActionsEditorExtension.ts`.** Rationale: the existing `findCodeFence` consumes `EditorState` and is tightly coupled to CM6 internals; the Reset helper operates on plain strings (full-note output of `forceInjectCodeSection`). A small string-only helper preserves the helper's @codemirror-free dependency surface and is easier to unit-test. Same regex shape as `findCodeFence` for fence detection.
- **`getDispatchHandle?` is optional, not required.** Existing `tests/main/resetCommand.test.ts` (8 tests) does not supply `getDispatchHandle` and continues to pass via the vault.process fallback. No test churn outside the new childDispatch suite.
- **Child dispatch carries NO `Transaction.addToHistory.of(false)`.** This is the critical D-05 invariant: Reset deserves a child undo entry. The parent-side mirror at `childEditorSync.ts:108-114` is the side that carries `addToHistory.of(false)`, ensuring the parent never picks up the Reset entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Added `/* eslint-disable @typescript-eslint/unbound-method */` to new test file**
- **Found during:** Task 2 (lint verification after Task 1 test was added)
- **Issue:** New test introduced 3 lint errors (`unbound-method` on `expect(childView.dispatch)`) that match the same pattern already accepted as baseline in `tests/main/childEditorSync.test.ts`. Without suppression, my contribution would visibly raise the project's error count from 68 (baseline) to 71.
- **Fix:** Added a single-comment `/* eslint-disable @typescript-eslint/unbound-method */` at the top of the new test file with a JSDoc explanation referencing the established convention in `tests/main/childEditorSync.test.ts`.
- **Files modified:** `tests/main/resetCommand.childDispatch.test.ts`
- **Verification:** `npm run lint` — total count dropped from 95→92 (exactly my 3 errors suppressed). 68 baseline errors unchanged.
- **Committed in:** `824f25e` (Task 2 commit — eslint-disable was added together with the production code that turned the test GREEN, since both tasks were verified together)

---

**Total deviations:** 1 auto-fixed (1 missing critical / hygiene)
**Impact on plan:** No scope creep — followed established convention for vi.fn-spy assertions in the test suite.

## Issues Encountered

- **Bundle-size foundation tests (3 failures)** — `tests/foundations/check-bundle-size.test.ts` reports 3 failures asserting `HARD_LIMIT=1_300_000` and `SOFT_WARN=1_170_000` while the actual `scripts/check-bundle-size.mjs` already has `HARD_LIMIT=1_600_000` and `SOFT_WARN=1_440_000` (bumped at Phase 16 close). **These failures pre-date this plan** — verified by stashing my changes, checking out the test file from the base commit `7bd6ffb`, and re-running: still 3 failures. Out of scope for this plan; tracked as pre-existing v1.2 state.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 15 D-05 cm-z scope isolation invariant is now ALSO true for Reset (verifiable manually in 17-UAT.md once Plan 17-06 lands).
- The canonical plugin write-path pattern is documented in CLAUDE.md and ready for future write paths (e.g., Copy to Code audit, deferred) to follow.
- Plan 17-02 (next plan in Phase 17) can proceed without blockers.

## Self-Check: PASSED

- [x] `tests/main/resetCommand.childDispatch.test.ts` exists on disk
- [x] Commit `0c4c074` (test) found in `git log --oneline --all`
- [x] Commit `824f25e` (feat) found in `git log --oneline --all`
- [x] Commit `0e4c69e` (docs) found in `git log --oneline --all`
- [x] Plan-level verification: `npm test -- tests/main/resetCommand.childDispatch.test.ts tests/main/resetCommand.test.ts` → 12/12 GREEN
- [x] `npm run build` → exit 0
- [x] `grep -c "leetcode.reset.child" src/main.ts` → 2 (>= 1)
- [x] `grep -c "leetcode.reset'" src/main.ts` → 0
- [x] `grep -c "leetcode.reset.child" src/main/nestedEditorExtension.ts` → 0 (NOT in ECHO_PRONE_USER_EVENTS)
- [x] `grep -c "leetcode.reset.child" CLAUDE.md` → 2 (>= 2)
- [x] `grep -c "childEditorRegistry" CLAUDE.md` → 1 (>= 1)
- [x] `grep -c "addToHistory.of(false)" CLAUDE.md` → 1 (>= 1)

---
*Phase: 17-polish-edge-cases*
*Completed: 2026-05-23*
