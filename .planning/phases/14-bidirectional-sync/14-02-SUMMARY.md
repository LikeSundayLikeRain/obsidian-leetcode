---
phase: 14-bidirectional-sync
plan: 02
subsystem: nested-editor-sync
tags: [cm6, sync, bidirectional, widget, statefield]
dependency_graph:
  requires: [14-01]
  provides: [child-parent-sync-wiring, external-change-propagation]
  affects: [childEditorFactory, nestedEditorExtension]
tech_stack:
  added: []
  patterns: [wireSyncIfNeeded-idempotent-call, detectAndPropagateExternalChange-side-effect, optional-extension-spread]
key_files:
  created: []
  modified:
    - src/main/childEditorFactory.ts
    - src/main/nestedEditorExtension.ts
decisions:
  - "syncExtensions spread placed LAST in extensions array so sync listener fires after all other extensions process"
  - "detectAndPropagateExternalChange placed BEFORE buildNestedDecorations — side-effect propagates to child before decorations rebuild"
metrics:
  duration_seconds: 98
  completed: 2026-05-21T21:16:01Z
---

# Phase 14 Plan 02: Wire Sync into Nested Editor Infrastructure Summary

**One-liner:** Bidirectional sync wiring connecting childEditorSync primitives to live editor lifecycle via toDOM and StateField update hooks.

## What Was Done

### Task 1: Modify childEditorFactory.ts (947394c)

Extended `createChildEditor` function signature to accept an optional `syncExtensions?: Extension[]` parameter. The extensions are spread as the last entry in the EditorState extensions array, maintaining full backward compatibility (existing callers pass no third argument).

**Changes:**
- Added `type Extension` to `@codemirror/state` import
- Extended function signature with optional third parameter
- Added `...(syncExtensions ?? [])` as last extensions array entry
- Updated JSDoc with `@param syncExtensions` documentation

### Task 2: Wire sync in nestedEditorExtension.ts (05b2d43)

Two surgical additions connecting the sync module to the live editor:

**Addition 1 - toDOM():** Renamed `_view` parameter to `view` (the parent EditorView provided by CM6's WidgetType.toDOM contract), then added `wireSyncIfNeeded(view, childView, this.filePath, this.registry)` call before `return container`. This wires child-to-parent sync on every widget attach (idempotent — wireSyncIfNeeded checks internally).

**Addition 2 - StateField.update():** Inserted `detectAndPropagateExternalChange(tr, plugin, registry)` within a `if (tr.docChanged)` guard, positioned after the `leetcode.*` fast-path early-return and before the `buildNestedDecorations` rebuild. This detects external vault.process writes to the fence body and propagates them to the child editor.

## Verification

- `tsc --noEmit`: 0 errors
- `npm run build`: succeeds
- `wireSyncIfNeeded` in nestedEditorExtension: 2 occurrences (import + call)
- `detectAndPropagateExternalChange` in nestedEditorExtension: 2 occurrences (import + call)
- `syncExtensions` in childEditorFactory: 3 occurrences (type, param, spread)
- `_view` in nestedEditorExtension: 0 occurrences (successfully renamed to `view`)

## Deviations from Plan

None - plan executed exactly as written.

## Data Flow (Now Operational)

```
Child keystroke
  -> updateListener (childEditorSync.ts)
  -> findCodeFence (fresh offset derivation, D-10)
  -> remap child offsets to parent offsets
  -> parent dispatch with userEvent 'leetcode.child-sync'
  -> section lock Gate 0 passes (not input.*/delete.*/undo/redo)
  -> StateField fast path maps decorations (no rebuild)

vault.process write (external)
  -> StateField.update (tr.docChanged)
  -> detectAndPropagateExternalChange
  -> overlap check with fence body range
  -> child dispatch with syncAnnotation.of(true) (echo prevention)
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 947394c | feat(14-02): accept optional syncExtensions parameter in childEditorFactory |
| 2 | 05b2d43 | feat(14-02): wire bidirectional sync in nestedEditorExtension |

## Self-Check: PASSED
