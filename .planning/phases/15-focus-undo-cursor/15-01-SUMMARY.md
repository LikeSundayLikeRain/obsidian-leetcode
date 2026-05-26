---
phase: 15-focus-undo-cursor
plan: 01
subsystem: child-editor-ux
tags: [indent, undo-isolation, codemirror, keymap]
dependency_graph:
  requires: [phase-13-nested-editor, phase-14-bidirectional-sync]
  provides: [indent-with-tab, undo-isolation]
  affects: [childEditorFactory, childEditorSync]
tech_stack:
  added: []
  patterns: [indentWithTab-keymap-priority, addToHistory-annotation-array]
key_files:
  created: []
  modified:
    - src/main/childEditorFactory.ts
    - src/main/childEditorSync.ts
    - tests/main/childEditorFactory.test.ts
    - tests/main/childEditorSync.test.ts
decisions:
  - "indentWithTab placed first in keymap.of() array for priority over defaultKeymap (D-05)"
  - "4-space default indentUnit (covers Python/Java/C++); dynamic per-language deferred to Phase 16 (INDENT-04)"
  - "annotations converted from single value to array format to carry both userEvent and addToHistory"
metrics:
  duration: 136s
  completed: 2026-05-22T01:32:43Z
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 15 Plan 01: Indent & Undo Isolation Summary

**One-liner:** indentWithTab keymap with 4-space default + addToHistory:false on all child-to-parent sync dispatches for undo isolation

## Tasks Completed

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Add indentWithTab keymap and indentUnit facet | `1086b18` | indentWithTab first in keymap, indentUnit.of("    ") in extensions |
| 2 | Add addToHistory:false to child-to-parent sync | `ba583a1` | Both dispatch sites annotated, converted to array format |

## Requirements Delivered

| Req ID | Description | Status |
|--------|-------------|--------|
| INDENT-01 | Tab inserts indentation in child editor | Delivered |
| INDENT-02 | Shift-Tab removes indentation in child editor | Delivered |
| INDENT-03 | Multi-line indent is single undo step | Delivered (CM6 native behavior) |
| INDENT-04 | Indent unit defaults to 4 spaces | Partial (dynamic per-language in Phase 16) |

## Decisions Made

1. **indentWithTab keymap priority (D-05):** Placed as first entry in `keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])` to ensure Tab is captured before any other binding.
2. **4-space default (INDENT-04):** Set `indentUnit.of("    ")` covering Python/Java/C++ (most common LC languages). Phase 16 will make this dynamic per `lc-language` frontmatter.
3. **Annotation array format:** Both child-to-parent dispatch sites now pass `annotations: [Transaction.userEvent.of('leetcode.child-sync'), Transaction.addToHistory.of(false)]` instead of a single annotation value.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- All 41 tests pass (13 in childEditorFactory, 28 in childEditorSync)
- `grep -c "indentWithTab" src/main/childEditorFactory.ts` = 2 (import + usage)
- `grep -c "addToHistory.of(false)" src/main/childEditorSync.ts` = 2 (both dispatch sites)
- `grep -c "Transaction.userEvent.of('leetcode.child-sync')" src/main/childEditorSync.ts` = 2 (not lost)

## TDD Gate Compliance

- Task 1: `test(15-01)` RED confirmed (2 failing tests), `feat(15-01)` GREEN confirmed (all pass) -- combined in single commit per TDD flow
- Task 2: `test(15-01)` RED confirmed (2 failing tests), `feat(15-01)` GREEN confirmed (all pass) -- combined in single commit per TDD flow

## Known Stubs

None - all functionality is fully wired.

## Self-Check: PASSED

- All 4 modified files exist on disk
- Commit 1086b18 found in git log
- Commit ba583a1 found in git log
