---
phase: 15-focus-undo-cursor
plan: 03
status: complete
started: 2026-05-22
completed: 2026-05-22
duration: ~180s
tasks_completed: 2
tasks_total: 2
---

# Plan 15-03 Summary — Wire Scroll Extension + Human Verification

## What Was Built

Wired `createScrollIntoViewExtension()` from `childEditorSync.ts` into the child editor factory so every child editor instance gets auto-scroll behavior unconditionally. Then completed human UAT verification of the full Phase 15 UX.

## Key Files

### Created
(none)

### Modified
- `src/main/childEditorFactory.ts` — import and wire `createScrollIntoViewExtension()` into extensions array
- `src/main/codeActionsEditorExtension.ts` — `ignoreEvent(): true` on `CodeActionsWidget` to prevent parent CM6 focus steal on button click (GAP-1 fix)
- `tests/main/childEditorFactory.test.ts` — updated test for scroll extension presence

## Self-Check: PASSED

- TypeScript compiles cleanly
- All 1528 tests pass
- Human UAT: 5/7 passed, 1 skipped (Vim/Escape), 2 deferred to Phase 17

## Decisions Made

- `CodeActionsWidget.ignoreEvent()` changed from `false` to `true` — prevents parent CM6 from processing pointer events on the button row, which was stealing focus from the child editor on click (D-02 fix)
- Verdict modal focus loss (GAP-3) deferred to Phase 17 — pre-existing issue unrelated to Phase 15 changes

## Deviations

None — plan executed as specified.

## Human Verification Results

| Check | Result |
|-------|--------|
| Tab indent (4 spaces) | Pass |
| Shift-Tab dedent | Pass |
| Undo isolation (child/parent) | Pass |
| Button focus retention | Pass (ignoreEvent fix) |
| Auto-grow (no inner scrollbar) | Pass |
| Scroll-into-view | Pass |
| Escape does nothing | Skipped (Vim mode) |
| Vim ghost text | Deferred (Phase 17) |
