---
phase: 13-nested-editor-foundation
plan: 02
subsystem: editor-infrastructure
tags: [codemirror, nested-editor, widget, decoration, cursor-redirect]
dependency_graph:
  requires: [ChildEditorRegistry, createChildEditor, findCodeFence]
  provides: [buildNestedEditorExtension, NestedEditorWidget, buildNestedDecorations, extractFenceBody]
  affects: [main.ts, styles.css]
tech_stack:
  added: []
  patterns: [block-widget-with-registry-lifecycle, css-line-hiding, cursor-redirect-transactionFilter]
key_files:
  created:
    - src/main/nestedEditorExtension.ts
    - tests/main/nestedEditorExtension.test.ts
  modified:
    - tests/helpers/obsidian-stub.ts
decisions:
  - Widget decoration placed at openerLine.to (after opener line-hide deco) to satisfy RangeSetBuilder sorted-order requirement
  - EditorState imported as value (not type-only) because transactionFilter.of is a static method call
metrics:
  duration: 294s
  completed: 2026-05-21T18:37:19Z
  tasks_completed: 1
  tasks_total: 1
  test_count: 19
  files_created: 2
  files_modified: 1
---

# Phase 13 Plan 02: Nested Editor Extension Summary

CM6 StateField producing CSS-hide line decorations on all fence lines plus a NestedEditorWidget block widget mounting a child EditorView, with a cursor-redirect transactionFilter that snaps focus to the child when the parent cursor enters the hidden zone.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | Failing tests for nested editor extension | b7bbabe | tests/main/nestedEditorExtension.test.ts |
| 1 (GREEN) | Implement nested editor extension | 9400cdb | src/main/nestedEditorExtension.ts, tests/helpers/obsidian-stub.ts |
| 1 (FIX) | Type import fix for EditorState | 6af09ed | src/main/nestedEditorExtension.ts |

## Implementation Details

### NestedEditorWidget (WidgetType subclass)
- `eq()` compares ONLY `filePath` for stable identity across doc edits (D-13)
- `toDOM()` creates `div.lc-nested-editor`, attaches child from registry or creates new via factory
- `destroy()` detaches child `.cm-editor` DOM from container — does NOT destroy the EditorView
- `ignoreEvent()` returns false — child receives all pointer/keyboard events
- `estimatedHeight` returns `Math.max(lineCount * 20, 60)`

### buildNestedDecorations
- Three-gate system: editorInfoField file, lc-slug frontmatter, findCodeFence
- Produces `Decoration.line({ class: 'lc-fence-hidden' })` on every fence line (opener through closer)
- Produces `Decoration.widget({ block: true, side: 1 })` at openerLine.to
- Decorations emitted in sorted position order (RangeSetBuilder requirement)

### extractFenceBody
- Returns `state.doc.sliceString(from, to)` for body lines between opener and closer (exclusive)
- Returns empty string for empty fences (closerLine - openerLine <= 1)

### buildNestedEditorExtension
- Returns `[StateField, transactionFilter]`
- StateField: `create` calls buildNestedDecorations; `update` rebuilds on docChanged, else maps old through changes
- transactionFilter: detects collapsed cursor in hidden fence zone, snaps to boundary, calls `queueMicrotask(() => childView.focus())`

### Test Helper Enhancement
- Added `sliceString(from, to)` to `makeStateForLockTests` fake doc (was missing, needed by extractFenceBody)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RangeSetBuilder sorted-order violation**
- **Found during:** Task 1 GREEN phase
- **Issue:** Widget decoration at `openerLine.to` was added AFTER line decorations for subsequent lines, violating RangeSetBuilder's ascending-position requirement
- **Fix:** Restructured to emit: opener line-hide, then widget at openerLine.to, then remaining line-hides
- **Files modified:** src/main/nestedEditorExtension.ts
- **Commit:** 9400cdb

**2. [Rule 1 - Bug] EditorState imported as type-only but used as value**
- **Found during:** Task 1 type-check verification
- **Issue:** `EditorState.transactionFilter.of(...)` requires EditorState as a value import, not `type EditorState`
- **Fix:** Changed `type EditorState` to `EditorState` in the import statement
- **Files modified:** src/main/nestedEditorExtension.ts
- **Commit:** 6af09ed

**3. [Rule 3 - Blocking] makeStateForLockTests missing sliceString**
- **Found during:** Task 1 GREEN phase
- **Issue:** The test helper's fake doc object lacked `sliceString()`, causing extractFenceBody to throw
- **Fix:** Added `sliceString(from, to)` delegating to `opts.body.slice(from, to)`
- **Files modified:** tests/helpers/obsidian-stub.ts
- **Commit:** 9400cdb

## Decisions Made

1. **Decoration ordering** — Widget placed between opener line-hide and body line-hides to satisfy RangeSetBuilder's sorted-order invariant. Opener line-hide at `.from`, widget at `.to`, subsequent line-hides at their `.from` positions.

2. **Spread operator in transactionFilter return** — Used `{ ...tr, selection }` pattern for conciseness. The existing sectionLockExtension uses explicit field copies; both are valid CM6 TransactionSpec patterns.

## Known Stubs

None — the extension is fully implemented with no placeholder values.

## Test Results

```
Test Files  1 passed (1)
Tests       19 passed (19)
```

Full suite regression check: 1494 passed, 0 failed.

## TDD Gate Compliance

- [x] RED gate: `test(13-02)` commit b7bbabe (failing tests committed before implementation)
- [x] GREEN gate: `feat(13-02)` commit 9400cdb (implementation makes tests pass)
- [x] Additional fix: `fix(13-02)` commit 6af09ed (type-only import correction)

## Self-Check: PASSED

- [x] src/main/nestedEditorExtension.ts exists
- [x] tests/main/nestedEditorExtension.test.ts exists
- [x] Commit b7bbabe exists
- [x] Commit 9400cdb exists
- [x] Commit 6af09ed exists
