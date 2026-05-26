---
phase: 14-bidirectional-sync
plan: 01
subsystem: editor-sync
tags: [cm6, split-view, sync, annotations, fence-repair]
dependency_graph:
  requires: [childEditorRegistry, codeActionsEditorExtension, nestedEditorExtension]
  provides: [syncAnnotation, createChildSyncExtension, detectAndPropagateExternalChange, wireSyncIfNeeded, unwireSync, repairFenceStructure]
  affects: [nestedEditorExtension, childEditorFactory]
tech_stack:
  added: []
  patterns: [CM6 split-view sync, Annotation-based echo prevention, updateListener extension, fence auto-repair]
key_files:
  created:
    - src/main/childEditorSync.ts
    - tests/main/childEditorSync.test.ts
  modified: []
decisions:
  - "Used Annotation.define<boolean> (not StateEffect) for parent->child echo marker — child has no StateField to receive effects"
  - "Used EditorView.updateListener (not ViewPlugin) — simpler, no DOM lifecycle needed"
  - "Module-level Set<string> for wired-paths tracking — simplest idempotency guard"
  - "repairFenceStructure returns false (no-op) when fence already intact — only invoked on findCodeFence null"
metrics:
  duration: 309s
  completed: "2026-05-21T21:11:30Z"
  tasks: 1
  files_created: 2
  files_modified: 0
  tests_added: 10
  tests_total: 1504
---

# Phase 14 Plan 01: childEditorSync Module Summary

CM6 split-view bidirectional sync primitives with annotation-based echo prevention, real-time offset remapping, and undo-able fence auto-repair.

## Task Results

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | Failing test for childEditorSync | f452cba | tests/main/childEditorSync.test.ts |
| 1 (GREEN) | Implement childEditorSync module | edcd788 | src/main/childEditorSync.ts, tests/main/childEditorSync.test.ts |

## What Was Built

### src/main/childEditorSync.ts

Core sync module exporting 6 primitives:

1. **syncAnnotation** — `Annotation.define<boolean>()` for parent-to-child echo prevention (D-09)
2. **createChildSyncExtension** — `EditorView.updateListener.of(...)` that fires on child docChanged, skips syncAnnotation transactions, remaps changes via `findCodeFence` offsets, dispatches to parent with `'leetcode.child-sync'` userEvent (D-01, D-02, D-10)
3. **detectAndPropagateExternalChange** — Checks parent transaction overlap with fence body range via `iterChangedRanges`, dispatches full replacement to child with `syncAnnotation.of(true)` (D-03, D-04, D-08)
4. **wireSyncIfNeeded** — Idempotent wiring via module-level `Set<string>`, uses `StateEffect.appendConfig` to add sync extension to child
5. **unwireSync** — Removes path from wired set (cleanup on registry eviction)
6. **repairFenceStructure** — Scans for `## Code` heading, detects missing opener/closer, inserts with `'leetcode.fence-repair'` userEvent (D-05, D-06, D-07)

### Key Design Decisions

- **Two different echo markers (D-09):** Child-to-parent uses `Transaction.userEvent` (`'leetcode.child-sync'`) because section lock and nested editor StateField already check userEvent. Parent-to-child uses custom `syncAnnotation` because the child has no existing annotation convention.
- **Offset derivation (D-10):** Always calls `findCodeFence(parentView.state)` at sync time. bodyStart = `doc.line(fence.openerLine).to + 1`, bodyEnd = `doc.line(fence.closerLine).from`. Never cached.
- **Defensive dispatch:** All dispatch calls wrapped in try/catch per codeActionsEditorExtension.ts pattern (teardown safety).
- **Section lock compatibility:** `'leetcode.child-sync'` passes Gate 0 (not `input.*`/`delete.*`/`undo`/`redo`) and Gate 1 (`leetcode.*` prefix). The nested editor StateField fast-path maps decorations without rebuild.

## Verification

- `tsc --noEmit`: 0 errors
- `npm run build`: succeeds (bundle produced)
- 10 new tests pass (syncAnnotation, createChildSyncExtension, repairFenceStructure x4, wireSyncIfNeeded x3, detectAndPropagateExternalChange)
- Full suite: 1504 tests pass, 0 regressions
- All 5 required exports present in module (grep count: 13)
- `'leetcode.child-sync'` present (3 occurrences)
- `'leetcode.fence-repair'` present (3 occurrences)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functions are fully implemented with real logic.

## Self-Check: PASSED
