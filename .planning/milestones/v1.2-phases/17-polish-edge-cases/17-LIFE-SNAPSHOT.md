## Build Under Test

Commit: 94f7a0e (v1.2 ship gate — Phase 18 plans 01/02/03 + review fixes + tab dedup)
Date: 2026-05-26
Branch: gsd/v1.2-code-editor-experience

## Procedure (D-23 arm b)

1. Reload Obsidian fresh (Cmd-R)
2. Open DevTools → Memory tab
3. Take Snapshot 1 (baseline)
4. Open and close 5 different LeetCode problem notes
5. Force GC (trash can icon)
6. Take Snapshot 2
7. Comparison view: Snapshot 2 vs Snapshot 1
8. Repeat: take Snapshot 3, open/close 5 more notes, GC, take Snapshot 4
9. Comparison view: Snapshot 4 vs Snapshot 3

## Results

### Cycle 1 (Snapshot 2 vs Snapshot 1 — includes one-time init)

| Constructor | # New | # Deleted | # Delta | Size Delta |
|-------------|-------|-----------|---------|------------|
| Detached InternalNode | 10,893 | 14 | +10,879 | 0 |
| (array) | 4,941 | 162 | +4,779 | +566,780 |
| Detached EventListener | 2,541 | 0 | +2,541 | +182,952 |
| Detached HTMLDivElement | 1,213 | 4 | +1,209 | +145,332 |

Note: Cycle 1 includes Obsidian's one-time plugin/view initialization overhead (tab creation, CM6 parent editor hydration, metadata cache population). These are NOT per-note leaks.

### Cycle 2 (Snapshot 4 vs Snapshot 3 — steady state)

| Constructor | # New | # Deleted | # Delta | Size Delta |
|-------------|-------|-----------|---------|------------|
| (compiled code) | 13,698 | 7,010 | +6,688 | +1,120,808 |
| (string) | 1,712 | 573 | +1,139 | +123,876 |
| Object | 4,244 | 2,712 | +1,532 | +43,304 |
| HTMLDivElement | 75 | 57 | +18 | +2,484 |
| e (minified) | 1,021 | 871 | +150 | +3,800 |

Key: No "Detached EventListener" or "Detached HTMLDivElement" entries in Cycle 2 top entries. The Cycle 1 Detached growth was one-time initialization, confirmed by its absence in Cycle 2.

## Phase 18 Module-Specific Scrutiny

| Module | Risk Surface | Finding |
|--------|-------------|---------|
| `createVimIsolationExtension` (childEditorFactory.ts) | ViewPlugin with keydown listeners | **PASS** — wrapped in ViewPlugin with `destroy()` that calls `removeEventListener`. No Detached EventListener growth in Cycle 2. |
| `registerVaultModifyRepairTrigger` (childEditorSync.ts) | vault.on('modify') listener | **PASS** — registered via `plugin.registerEvent()` which auto-detaches on plugin unload. Not a per-note concern (singleton listener, not per-child). |
| `childLanguageTracker` WeakMap (main.ts) | Retained entries after child GC | **PASS** — WeakMap entries are auto-collected when the key (EditorView) is GC'd. No manual deletion needed. The LRU registry eviction calls `view.destroy()` which makes the view eligible for GC. |
| `nestedEditorRebuildEffect` StateEffect (nestedEditorExtension.ts) | Dispatched on file-open | **PASS** — stateless StateEffect, no retained references. |
| Mousedown listener on view.dom (childEditorFactory.ts) | Retained after view destroy | **LOW RISK** — listener is on `view.dom` which is owned by the EditorView. When the EditorView is destroyed (LRU eviction), the DOM is detached and both become eligible for GC. No explicit cleanup needed since the listener doesn't reference external state. |

## Verdict

**PASS** — No retained EditorView leak detected. Cycle 2 (steady-state, after initialization) shows only minor incremental growth from V8 JIT compilation and normal CM6/Obsidian operation (+18 HTMLDivElement, +150 minified class instances). The Detached EventListener / HTMLDivElement growth observed in Cycle 1 is confirmed as one-time initialization overhead (absent in Cycle 2).

Phase 18 additions (ViewPlugin with destroy(), singleton vault.on listener, WeakMap tracker) do not introduce detectable memory leaks across 10 total open/close cycles.
