---
phase: 13-nested-editor-foundation
plan: 01
subsystem: editor-infrastructure
tags: [codemirror, lru-cache, factory, nested-editor]
dependency_graph:
  requires: []
  provides: [ChildEditorRegistry, createChildEditor]
  affects: [nestedEditorExtension, main.ts]
tech_stack:
  added: []
  patterns: [LRU-cache-with-monotonic-tick, CM6-EditorView-factory]
key_files:
  created:
    - src/main/childEditorRegistry.ts
    - src/main/childEditorFactory.ts
    - tests/main/childEditorRegistry.test.ts
    - tests/main/childEditorFactory.test.ts
  modified: []
decisions:
  - Monotonic tick counter instead of Date.now() for LRU ordering (avoids sub-ms timing issues in tests and rapid access patterns)
  - Class-based vi.mock for EditorView constructor in tests (vi.fn mockImplementation not constructable)
metrics:
  duration: 261s
  completed: 2026-05-21T18:28:19Z
  tasks_completed: 2
  tasks_total: 2
  test_count: 25
  files_created: 4
  files_modified: 0
---

# Phase 13 Plan 01: ChildEditorRegistry + Factory Summary

LRU registry (cap=5, monotonic-tick ordering) for child EditorView lifecycle management, plus a factory function creating Python-highlighted EditorViews with full CM6 extension stack.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | ChildEditorRegistry with LRU eviction | de54935 | src/main/childEditorRegistry.ts, tests/main/childEditorRegistry.test.ts |
| 2 | ChildEditorFactory with Python LanguageSupport | c2225e0 | src/main/childEditorFactory.ts, tests/main/childEditorFactory.test.ts |

## Implementation Details

### ChildEditorRegistry (Task 1)
- LRU cache using `Map<string, RegistryEntry>` with monotonic tick counter for access ordering
- Default cap of 5 (per D-12 decision)
- Methods: `get`, `set`, `delete`, `destroyAll`, `has`, `size` getter
- Eviction iterates map to find min-lastAccess entry, calls `view.destroy()`, then removes
- Replacing an existing key destroys the old view without triggering eviction
- 14 unit tests covering all behavioral contracts

### ChildEditorFactory (Task 2)
- `createChildEditor(content, parent)` returns configured EditorView
- Extensions: python(), syntaxHighlighting(defaultHighlightStyle), bracketMatching(), history(), drawSelection(), highlightActiveLine(), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping, EditorView.theme
- Theme uses Obsidian CSS variables: `--code-background`, `--background-secondary`, `--font-monospace`
- `@codemirror/lang-python` is bundled (not external); all other `@codemirror/*` are external
- 11 unit tests verifying extension composition via module mocking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced Date.now() with monotonic tick counter**
- **Found during:** Task 1 GREEN phase
- **Issue:** `Date.now()` granularity caused LRU ordering failures when multiple operations occurred in the same millisecond
- **Fix:** Used `private tick = 0` with `++this.tick` for guaranteed unique monotonic ordering
- **Files modified:** src/main/childEditorRegistry.ts
- **Commit:** de54935

## Decisions Made

1. **Monotonic tick vs Date.now()** — Used an incrementing counter for LRU access ordering. `Date.now()` has millisecond granularity which is insufficient for rapid sequential operations. The tick guarantees unique, strictly-ordered timestamps.

2. **Class-based EditorView mock** — Vitest's `vi.fn().mockImplementation()` is not constructable with `new`. Used a class inside the `vi.mock` factory instead, with static properties for `theme` and `lineWrapping`.

## Known Stubs

None — both modules are fully implemented with no placeholder values.

## Test Results

```
Test Files  2 passed (2)
Tests       25 passed (25)
```

Full suite regression check: 1475 passed, 0 failed.

## Self-Check: PASSED

- [x] src/main/childEditorRegistry.ts exists
- [x] src/main/childEditorFactory.ts exists
- [x] tests/main/childEditorRegistry.test.ts exists
- [x] tests/main/childEditorFactory.test.ts exists
- [x] Commit de54935 exists
- [x] Commit c2225e0 exists
