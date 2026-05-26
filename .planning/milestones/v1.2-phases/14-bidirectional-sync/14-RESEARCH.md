# Phase 14: Bidirectional Sync — Research

**Researched:** 2026-05-21
**Confidence:** HIGH (based on CM6 split-view architecture, existing codebase analysis, CONTEXT decisions D-01 through D-10)

---

## 1. Architecture Overview

Phase 14 implements the CM6 split-view sync pattern between the child EditorView (mounted inside the NestedEditorWidget) and the parent document's fence body region. Two data flows:

- **Child→Parent:** Every child transaction dispatches the equivalent change to the parent document at the correct fence body offset
- **Parent→Child:** External writes (vault.process from copyToCode, AI review) that modify the fence body dispatch a replacement into the child

Echo loops are prevented by annotations: each side checks for origin markers before propagating.

---

## 2. Child→Parent Sync Implementation

### Entry Point: `ViewPlugin` or `updateListener` on Child

The child EditorView needs a listener that fires on every document change. Two CM6 patterns:

**Pattern A — `EditorView.updateListener`:**
```typescript
EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  if (update.transactions.some(tr => tr.annotation(syncAnnotation))) return; // from parent
  // propagate to parent
})
```

**Pattern B — `ViewPlugin`:**
```typescript
ViewPlugin.define(view => ({
  update(update) { /* same logic */ }
}))
```

**Decision:** Pattern A (`updateListener`) is simpler and sufficient. The child doesn't need DOM lifecycle hooks — it only needs to observe state changes. This aligns with how the CM6 split-view example works.

### Offset Derivation (D-10)

Before dispatching to parent, always call `findCodeFence(parentState)` to get fresh fence boundaries:

```typescript
const fence = findCodeFence(parentView.state);
if (!fence) return; // degraded — fence structure broken
const bodyStart = parentView.state.doc.line(fence.openerLine).to + 1; // char after opener \n
const bodyEnd = parentView.state.doc.line(fence.closerLine).from;     // char before closer line
```

### Change Mapping

Child changes are relative to the child document (offset 0 = first char of fence body). Parent document offsets are `childOffset + bodyStart`. The child's `ChangeSet` must be remapped:

```typescript
// For each change in the child transaction:
update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
  parentChanges.push({
    from: fromA + bodyStart,
    to: toA + bodyStart,
    insert: inserted
  });
});
```

### Section Lock Compatibility (D-02, Success Criterion 5)

The parent dispatch MUST use `userEvent: 'leetcode.child-sync'`. The section lock's Gate 0 checks:
```typescript
const isUserInput = typeof ev === 'string' && (ev.startsWith('input.') || ev.startsWith('delete.') || ...);
if (!isUserInput) return true; // <-- 'leetcode.child-sync' hits this path → passes through
```

This is confirmed safe: `'leetcode.child-sync'` does NOT start with `input.` or `delete.`, so Gate 0 returns `true` (allow). Additionally, the nested editor StateField's `update()` method has a fast path:
```typescript
if (userEvent && userEvent.startsWith('leetcode.')) {
  return old.map(tr.changes); // map decorations, skip rebuild
}
```

This means child-sync dispatches won't trigger a full `buildNestedDecorations` rebuild — only a position map. Correct and performant.

---

## 3. Parent→Child Sync Implementation

### Detection: Where to Hook

The parent's nested editor StateField `update()` method already runs on every transaction. This is the ideal hook point for detecting external changes to the fence body:

```typescript
update(old, tr) {
  // Existing: early-return for 'leetcode.*' dispatches
  const userEvent = tr.annotation(Transaction.userEvent);
  if (userEvent && userEvent.startsWith('leetcode.')) {
    return old.map(tr.changes);
  }
  
  // NEW: detect external fence-body changes
  if (tr.docChanged && !userEvent?.startsWith('leetcode.')) {
    // Check if change overlaps fence body range
    detectExternalFenceChange(tr, plugin, registry);
  }
  
  // Existing rebuild logic...
}
```

### External Change Classification

Not all parent docChanged transactions require child updates:
- **Fence body changed** (vault.process copyToCode) → dispatch replacement to child
- **Content above/below fence changed** (user edits `## Notes`, AI writes `## AI Review`) → offsets shift but child content unchanged; `findCodeFence()` re-derives offsets on next child→parent sync (D-04)
- **Fence structure destroyed** (rare: user deletes closer line via external tool) → degradation mode (D-05)

Detection uses `tr.changes.iterChangedRanges()` to check if any change overlaps `[bodyStart, bodyEnd]`.

### Dispatching to Child (D-03)

When an external change replaces the fence body:
```typescript
const newFenceContent = extractFenceBody(tr.state, fence);
const childView = registry.get(filePath);
if (childView) {
  childView.dispatch({
    changes: { from: 0, to: childView.state.doc.length, insert: newFenceContent },
    annotations: syncAnnotation.of(true), // prevent echo back
  });
}
```

Key: uses `dispatch()` NOT `setState()`, preserving undo history (D-03).

---

## 4. Echo Loop Prevention (D-09)

### Annotation Design

CM6's `Annotation` type is the cleanest approach given the existing `Transaction.userEvent` convention:

```typescript
import { Annotation } from '@codemirror/state';
export const syncAnnotation = Annotation.define<boolean>();
```

**Child→Parent path:**
- Child updateListener fires
- Checks: does any transaction carry `syncAnnotation`? If yes → came from parent, skip
- If no → user edit in child, propagate to parent with `userEvent: 'leetcode.child-sync'`

**Parent→Child path:**
- Parent StateField update fires
- Checks: does `tr.annotation(Transaction.userEvent)` start with `'leetcode.'`? If yes → came from child, skip (existing fast path)
- If no → external change, check if it overlaps fence body, propagate to child with `syncAnnotation.of(true)`

### Why Two Different Markers

- **Child→Parent uses `Transaction.userEvent`** (string `'leetcode.child-sync'`): because the section lock and nested editor StateField already check `userEvent` first. Using the existing convention avoids adding new check paths.
- **Parent→Child uses custom `syncAnnotation`** (boolean): because the child has no section lock or existing annotation convention — a simple boolean annotation is cleanest.

---

## 5. Degradation & Auto-Recovery (D-05, D-06, D-07)

### When `findCodeFence()` Returns Null

The fence structure is broken (opener or closer missing). Child→parent sync cannot proceed safely.

**Detection algorithm (D-07):**
1. Find `## Code` heading (section-lock-protected, always present)
2. Find next `## ` heading or EOF — this defines the Code section boundaries
3. Scan within that range for opener (`/^\s*```/`) and closer
4. Determine which is missing: opener only, closer only, or both

**Repair strategy (D-05):**
- Re-insert the missing fence marker(s) at the correct position via parent dispatch with `userEvent: 'leetcode.fence-repair'`
- The `'leetcode.fence-repair'` userEvent passes Gate 0 of section lock (not `input.*`)
- After repair, child editor resumes normal sync automatically
- The repair dispatch is undo-able (D-06) — standard CM6 history handles this

### Implementation Location

A new function `repairFenceStructure(parentView, state)` in the sync module. Called when `findCodeFence()` returns null during a child→parent sync attempt. Returns `true` if repair succeeded (caller retries sync), `false` if repair impossible (child enters read-only degraded state).

---

## 6. Integration Points with Existing Code

### childEditorFactory.ts — Extension Array

The sync `updateListener` must be added to the child's extensions at creation time. Modify `createChildEditor()` to accept an optional `syncExtensions: Extension[]` parameter:

```typescript
export function createChildEditor(
  content: string,
  parent: HTMLElement,
  syncExtensions?: Extension[],
): EditorView {
  // ... existing extensions ...
  extensions: [
    // existing: python(), syntaxHighlighting, etc.
    ...(syncExtensions ?? []),
  ],
}
```

The sync module creates the `updateListener` extension with a closure over the parent EditorView reference.

### nestedEditorExtension.ts — Widget `toDOM()`

Currently `toDOM()` calls `createChildEditor(fenceContent, container)` without sync extensions. After Phase 14, it needs the parent view reference to wire sync. Two approaches:

**Approach A:** Pass `parentView` into the widget constructor → passed to `createChildEditor` with sync extensions.

**Approach B:** Wire sync AFTER creation via the registry. `toDOM(view)` already receives the parent `EditorView` as `view`. After creating/retrieving the child, wire sync if not already wired.

**Decision: Approach B** — avoids modifying the widget constructor (which would break `eq()` stability). The `toDOM(view)` parameter IS the parent EditorView. Wire sync there.

### NestedEditorWidget.toDOM() — Parent View Access

`toDOM(view: EditorView)` — the `view` parameter is the parent EditorView that contains the widget. This is the reference needed for child→parent dispatch. Store it or use it directly to set up the sync listener.

### Registry — Tracking Sync State

The registry needs a way to know if a child already has sync wired (to avoid double-wiring on widget re-attach). Options:
- A `Set<string>` of file paths with active sync (simplest)
- A property on the child EditorView's state (CM6 StateField in the child)
- A WeakMap from EditorView to sync metadata

Simplest: a `Set<string>` on the sync module, checked in `toDOM()`.

---

## 7. File Structure

New files:
- `src/main/childEditorSync.ts` — Core sync logic: child→parent listener, parent→child detection, echo prevention, fence repair

Modified files:
- `src/main/childEditorFactory.ts` — Accept optional `syncExtensions` parameter
- `src/main/nestedEditorExtension.ts` — Wire sync in `toDOM()`, detect external changes in StateField `update()`

---

## 8. Testing Strategy

### Unit-Testable Logic
- Offset derivation: given a parent state, verify `bodyStart`/`bodyEnd` computation
- Change remapping: given child changes + bodyStart offset, verify parent change specs
- External change detection: given a transaction and fence range, verify overlap detection
- Fence repair: given a document with missing fence markers, verify repair produces valid structure

### Integration-Testable Behavior
- Type in child → parent doc changes at correct offset
- vault.process replaces fence body → child updates without corruption
- Edit `## Notes` in parent → child content unchanged, offsets correct on next sync
- Rapid typing in child → no echo loops (annotation check)
- findCodeFence returns null → auto-repair fires, sync resumes

### Manual Verification (Human)
- Open lc-slug note, type in child editor, Ctrl-S saves correctly
- Use "Copy to Code" from submission → child updates immediately
- Ctrl-Z after Copy to Code → previous code returns (undo preserved)
- Type rapidly in child → no visual glitches, no offset corruption

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Echo loop (infinite dispatch) | LOW (annotations prevent) | HIGH (browser freeze) | syncAnnotation + userEvent check; defensive `depth` counter as failsafe |
| Offset corruption on concurrent edits | MEDIUM | HIGH (document corruption) | Always re-derive via findCodeFence; never cache offsets |
| Child→parent dispatch during parent StateField rebuild | LOW | MEDIUM (dropped change) | Use `queueMicrotask` or next animation frame if needed; validate with rapid-typing test |
| Widget `eq()` instability causing child recreation | LOW (Phase 13 already fixed) | HIGH (state loss) | eq() compares only filePath — stable across content changes |
| Fence repair inserting at wrong position | LOW | MEDIUM | Bound repair to `## Code` section; validate heading exists |

---

## 10. Performance Considerations

- **Per-keystroke cost:** One `findCodeFence()` scan (~30 lines for typical note) + one parent dispatch. Both are O(n) where n is document lines, but notes are small (~50-200 lines). Acceptable.
- **No debouncing (D-01):** Real-time sync. Same cost profile as normal Obsidian typing in the parent editor.
- **StateField early-return:** The `'leetcode.*'` fast path in the nested editor StateField ensures child-sync dispatches only `map()` decorations (O(decorations)) rather than rebuilding (O(document lines)). This is critical for keystroke performance.
- **Parent→child detection:** Only runs when `tr.docChanged && !userEvent.startsWith('leetcode.')` — filters out the majority of transactions (selection changes, focus, etc.)

---

## Validation Architecture

### Critical Invariants to Verify
1. **No echo loop:** A single user keystroke in child produces exactly one parent change and no back-propagation
2. **Offset correctness:** After editing `## Notes`, child→parent sync still writes to correct fence body position
3. **External write round-trip:** vault.process → parent sync → child update → no corruption
4. **Undo preservation:** After parent→child dispatch, Ctrl-Z in child restores previous state
5. **Section lock pass-through:** All child-sync dispatches pass Gate 0 without being dropped

### Test Commands
```bash
npm test -- --grep "childEditorSync"
npm run build && echo "bundle OK"
```
