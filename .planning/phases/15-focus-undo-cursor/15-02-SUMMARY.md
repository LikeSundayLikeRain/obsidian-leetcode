---
phase: 15-focus-undo-cursor
plan: 02
subsystem: child-editor-ux
tags: [focus-retention, auto-grow, scroll-into-view, css, mousedown]
dependency_graph:
  requires: [phase-13-nested-editor, phase-14-bidirectional-sync, 15-01]
  provides: [button-focus-retention, auto-grow-css, scroll-into-view-extension]
  affects: [codeBlockButtonRow, childEditorSync, styles]
tech_stack:
  added: []
  patterns: [mousedown-preventDefault-focus-retention, overflow-visible-auto-grow, updateListener-scroll-into-view]
key_files:
  created: []
  modified:
    - src/main/codeBlockButtonRow.ts
    - src/main/childEditorSync.ts
    - styles.css
    - tests/main/codeBlockButtonRow.test.ts
decisions:
  - "mousedown preventDefault chosen over tabindex=-1 for focus retention (aligns with existing click handler pattern)"
  - "overflow:visible on .cm-scroller (not overflow:hidden) — allows natural height growth without breaking CM6 rendering for short docs"
  - "Parent scroller detection via closest('.cm-editor') chain with workspace-leaf-content fallback"
metrics:
  duration: 139s
  completed: 2026-05-22T01:37:02Z
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 15 Plan 02: Focus Retention, Auto-Grow & Scroll Summary

**One-liner:** mousedown preventDefault on all action buttons + CSS auto-grow with overflow:visible + createScrollIntoViewExtension for parent viewport tracking

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Add mousedown preventDefault to all action buttons | `7f120d7` | mousedown handlers on aiSolBtn, runBtn, submitBtn; 3 new tests |
| 2 | Add auto-grow CSS and scroll-into-view extension | `bead23d` | overflow:visible + height:auto CSS; createScrollIntoViewExtension in childEditorSync.ts |

## Requirements Delivered

| Req ID | Description | Status |
|--------|-------------|--------|
| INDENT-01 | Tab inserts indentation in child editor | Delivered (15-01) |
| INDENT-02 | Shift-Tab removes indentation in child editor | Delivered (15-01) |
| INDENT-03 | Multi-line indent is single undo step | Delivered (15-01, CM6 native) |
| INDENT-04 | Indent unit defaults to 4 spaces | Partial (dynamic per-language in Phase 16) |

## Decisions Made

1. **mousedown preventDefault (D-02):** Applied to all three action buttons (AI Solution, Run, Submit). Chosen over `tabindex="-1"` because the pattern aligns with existing `click` event handler style in the file.
2. **overflow:visible for auto-grow (D-13):** Used `overflow: visible !important` on `.cm-scroller` rather than `overflow-y: hidden`. For LeetCode solutions (typically under 200 lines), CM6 does not virtualize, so visible overflow is safe.
3. **Parent scroller detection (D-14):** Traverses DOM via `.closest('.cm-editor')?.parentElement?.closest('.cm-editor')?.querySelector(':scope > .cm-scroller')` with fallback to `.workspace-leaf-content`. Empirical validation needed at runtime.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- Task 1: RED confirmed (3 failing mousedown tests), GREEN confirmed (all 11 tests pass)
- Task 2: Non-TDD task (CSS + extension code verified via TypeScript compilation + existing test suite)

## Verification Results

- All 11 codeBlockButtonRow tests pass (3 new mousedown + 8 existing)
- All 28 childEditorSync tests pass (no regression)
- `grep -c "mousedown" src/main/codeBlockButtonRow.ts` = 3
- `grep -c "createScrollIntoViewExtension" src/main/childEditorSync.ts` = 1 (exported function)
- `npx tsc --noEmit --skipLibCheck` exits 0 (no compilation errors)
- CSS contains `.cm-editor .lc-nested-editor .cm-scroller { overflow: visible !important; }`
- CSS contains `height: auto !important; max-height: none !important;` on `.cm-editor .lc-nested-editor .cm-editor`

## Known Stubs

None - all functionality is fully wired.

## Self-Check: PASSED

- src/main/codeBlockButtonRow.ts exists and contains 3 mousedown handlers
- src/main/childEditorSync.ts exists and exports createScrollIntoViewExtension
- styles.css exists with auto-grow rules
- tests/main/codeBlockButtonRow.test.ts exists with focus retention tests
- Commit 7f120d7 found in git log
- Commit bead23d found in git log
