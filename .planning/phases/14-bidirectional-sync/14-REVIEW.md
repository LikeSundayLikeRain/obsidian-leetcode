---
phase: 14-bidirectional-sync
reviewed: 2026-05-21T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/main/childEditorSync.ts
  - src/main/childEditorFactory.ts
  - src/main/nestedEditorExtension.ts
findings:
  critical: 4
  warning: 3
  info: 1
  total: 8
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files implement the bidirectional sync between a child CM6 `EditorView` and
the parent Obsidian editor: `childEditorSync.ts` (core sync logic), `childEditorFactory.ts`
(child editor construction), and `nestedEditorExtension.ts` (StateField + widget).

The echo-loop prevention via `syncAnnotation` and `userEvent: 'leetcode.child-sync'` is
structurally correct. The offset derivation (`findCodeFence` re-derived on every sync) and
body bounds validation are mostly sound. However four blockers exist: two involve stale
module-level state causing sync to go permanently dark after plugin reload or LRU eviction,
one involves a CM6 architectural violation (dispatching inside `StateField.update`), and
one creates a permanent child/parent divergence after every fence-repair event.

---

## Critical Issues

### CR-01: Module-level `wiredPaths` Set survives plugin reload — sync silently disabled

**File:** `src/main/childEditorSync.ts:57`

**Issue:** `wiredPaths` is declared at module scope, not inside a plugin instance or
registry. In Obsidian, a user can disable and re-enable a plugin without reloading the
JavaScript module — the module is cached by the runtime. On re-enable, the plugin
creates a fresh `ChildEditorRegistry` and fresh child `EditorView` instances, but
`wiredPaths` still contains every path from the previous session. When `wireSyncIfNeeded`
is called for a file that was wired in the previous session, `wiredPaths.has(filePath)`
returns `true` and the function returns early without attaching the sync extension to the
new child view. The child editor runs permanently with no child→parent sync — edits in the
child editor are silently discarded and never reach the parent document.

`unwireSync('__all__')` is the only way to clear the set, but nothing in the reviewed
code calls it on plugin unload. Individual `unwireSync(filePath)` calls are only triggered
by registry eviction — which is also broken (see CR-02).

**Fix:** Move `wiredPaths` into `ChildEditorRegistry` or into a plugin-instance-scoped
object so it is cleared when the plugin is torn down. Alternatively, call
`unwireSync('__all__')` from the plugin's `onunload()` hook:

```typescript
// In plugin's onunload():
import { unwireSync } from './main/childEditorSync';
onunload() {
  unwireSync('__all__');
  this.childEditorRegistry.destroyAll();
}
```

Or, eliminate module-level state entirely by accepting a `wiredPaths` Set as a parameter
to `wireSyncIfNeeded` and storing it on `ChildEditorRegistry`.

---

### CR-02: LRU eviction does not call `unwireSync` — sync permanently disabled for evicted files

**File:** `src/main/childEditorRegistry.ts:91-108` (caller: `src/main/childEditorSync.ts:233-247`)

**Issue:** `ChildEditorRegistry.evictIfNeeded()` destroys the evicted `EditorView` and
removes the key from its internal cache, but it never calls `unwireSync(oldestKey)`. The
module-level `wiredPaths` set therefore retains the evicted path indefinitely.

When the LRU capacity (default 5) is exceeded — e.g., the user opens a sixth LeetCode
problem note — one path is evicted. The evicted path remains in `wiredPaths`. If the user
later returns to that note, `toDOM` in `NestedEditorWidget` creates a brand-new child
`EditorView` and calls `wireSyncIfNeeded`. Because the path is still in `wiredPaths`,
`wireSyncIfNeeded` does nothing. The new child editor silently operates without sync.

**Fix:** `ChildEditorRegistry` must call `unwireSync` on eviction. Since `childEditorRegistry.ts`
must not import from `childEditorSync.ts` (would create a circular dependency), pass an
eviction callback:

```typescript
// childEditorRegistry.ts
import { unwireSync } from './childEditorSync'; // or pass as callback
private evictIfNeeded(): void {
  if (this.cache.size <= this.cap) return;
  // ... find oldestKey ...
  if (oldestKey !== undefined) {
    unwireSync(oldestKey);          // <-- clear wiredPaths entry
    const entry = this.cache.get(oldestKey)!;
    entry.view.destroy();
    this.cache.delete(oldestKey);
  }
}
```

Alternatively, pass an `onEvict: (key: string) => void` callback to the `ChildEditorRegistry`
constructor and call it from `evictIfNeeded` and `delete` and `destroyAll`.

---

### CR-03: `detectAndPropagateExternalChange` dispatches to child inside `StateField.update()` — CM6 architectural violation

**File:** `src/main/nestedEditorExtension.ts:217-219`

**Issue:** CM6's `StateField.update()` must be a pure function — it receives a transaction
and returns a new field value; it must not produce side effects. The call to
`detectAndPropagateExternalChange(tr, plugin, registry)` at line 217 calls
`childView.dispatch(...)` inside `update()`. CM6 does not formally prohibit this, but
its architecture explicitly warns that dispatching from inside a StateField update can
produce re-entrant dispatch chains and unpredictable state. In practice, the child dispatch
triggers the child's updateListener, which (for user-originated child edits) would attempt
to dispatch back to the parent — all while the parent's StateField is mid-update.

The immediate symptom in this specific implementation: the child receives the new content
synchronously while the parent `update()` call has not yet returned. If the child's
updateListener fires synchronously and calls `parentView.dispatch(...)`, that parent
dispatch is queued while the parent is still computing its StateField update — a situation
CM6 may handle without crashing but which is explicitly outside the documented usage pattern.

**Fix:** Move the parent→child propagation out of `StateField.update()` and into an
`EditorView.updateListener` on the parent editor (which is the canonical CM6 location for
side effects triggered by transactions):

```typescript
// Instead of calling detectAndPropagateExternalChange inside the StateField update,
// register an updateListener on the parent view after construction:
EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  const userEvent = update.transactions[0]?.annotation(Transaction.userEvent);
  if (userEvent?.startsWith('leetcode.')) return; // skip plugin-internal
  detectAndPropagateExternalChange(
    update.transactions[0]!, // or iterate all transactions
    plugin,
    registry,
  );
}),
```

This keeps `StateField.update()` pure and places the side-effecting dispatch where CM6
expects it.

---

### CR-04: Fence-repair transactions bypass `detectAndPropagateExternalChange` — child stays out of sync after repair

**File:** `src/main/nestedEditorExtension.ts:210-213` + `src/main/childEditorSync.ts:85-94`

**Issue:** After `repairFenceStructure` succeeds, it dispatches to the parent with
`userEvent: 'leetcode.fence-repair'`. The parent's `StateField.update()` checks
`userEvent.startsWith('leetcode.')` at line 211 and takes the early-return fast-path
(`return old.map(tr.changes)`), which deliberately skips `detectAndPropagateExternalChange`.

This means the child editor is never notified of the fence repair. The parent document now
contains the newly inserted `` ``` `` markers at positions that shift `bodyStart` and
`bodyEnd`. The child's document content is unchanged. On the very next child→parent sync
(the child dispatch that triggered the repair in the first place), `propagateChildChanges`
uses `fenceRetry` (the post-repair fence positions) to compute `bodyStart`, but maps the
child's `update.changes` (which were captured in the pre-repair child state) against those
new offsets. This offset mismatch can produce corrupted parent content — changes are
applied at wrong positions.

Reproducing scenario:
1. Fence closer is deleted by the user in the parent.
2. Child receives a keystroke; `createChildSyncExtension` fires.
3. `findCodeFence` returns null. `repairFenceStructure` inserts `` '\n```' `` at end of section — parent fence is restored. `wiredPaths` fast-path means child is not updated.
4. `propagateChildChanges` is called with `fenceRetry`, but the child keystroke change
   (at child offset N) is mapped to `N + bodyStart` using the post-repair `bodyStart`.
   The repair inserted extra characters *before* the closing fence, shifting `bodyEnd` but
   not `bodyStart` in this case — so the child change lands at the correct position.
   However: if the repair inserted an opener (missing opener case), `bodyStart` shifts
   forward by the length of the inserted line, meaning the child change now targets
   `N + newBodyStart` — one line deeper than the actual fence body start. The child's
   character ends up outside the fence body.

**Fix:** After a successful `repairFenceStructure`, push the full child content to the
parent via `detectAndPropagateExternalChange` (or an equivalent full-replace dispatch)
before attempting to propagate the incremental change. Alternatively, after repair, skip
propagating the current child change (return early) and rely on the full-replace path to
reconcile state:

```typescript
// In createChildSyncExtension, after repair:
const repaired = repairFenceStructure(parentView);
if (!repaired) return;
// Push full child content to parent rather than incremental change
const fullContent = update.view.state.doc.toString();
const fenceAfterRepair = findCodeFence(parentView.state);
if (!fenceAfterRepair) return;
const newBodyStart = parentView.state.doc.line(fenceAfterRepair.openerLine).to + 1;
const newBodyEnd   = parentView.state.doc.line(fenceAfterRepair.closerLine).from;
parentView.dispatch({
  changes: { from: newBodyStart, to: newBodyEnd, insert: fullContent },
  annotations: Transaction.userEvent.of('leetcode.child-sync'),
});
```

---

## Warnings

### WR-01: Child→parent offset mapping has no upper-bound guard — can corrupt parent document

**File:** `src/main/childEditorSync.ts:119-127`

**Issue:** `propagateChildChanges` remaps each child change with `from: fromA + bodyStart`
and `to: toA + bodyStart`. There is no check that `toA + bodyStart <= bodyEnd`. If the
child's document is larger than `bodyEnd - bodyStart` — which can happen transiently when
the parent fence was externally truncated (e.g., `vault.process` removed lines) but the
child has not yet received the update — the mapped `to` position will exceed `bodyEnd` and
the dispatch will attempt to modify content beyond the fence body. CM6 will apply the
change at the out-of-bounds position, writing into the closing fence line or the section
below it.

**Fix:** Clamp the mapped positions to `[bodyStart, bodyEnd]` before dispatching:

```typescript
update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
  const mappedFrom = Math.min(fromA + bodyStart, bodyEnd);
  const mappedTo   = Math.min(toA   + bodyStart, bodyEnd);
  if (mappedFrom <= mappedTo) {
    parentChanges.push({ from: mappedFrom, to: mappedTo, insert: inserted });
  }
});
```

---

### WR-02: Dead code in `repairFenceStructure` "both missing" branch creates reader confusion

**File:** `src/main/childEditorSync.ts:337-344`

**Issue:** In the "both opener and closer are missing" branch (reachable when
`openerLine === -1` and `closerLine === -1`), the code at lines 338-340 pushes a combined
insert change onto `changes`, then immediately at line 342 calls `changes.length = 0` to
clear the array, and pushes the identical change again at line 344. The first push (lines
338-340) is dead — its result is always discarded before the dispatch. This appears to be
a refactoring artifact where the "both missing" case was consolidated from two separate
branches.

While the runtime behavior is correct (the final `changes` array contains exactly the
right single change), the dead push makes the logic look like it should produce two
changes, which it does not. This will mislead future maintainers.

**Fix:** Remove the dead push and the `changes.length = 0` reset:

```typescript
// Both missing — insert combined opener + blank body + closer
changes.push({ from: doc.line(codeHeadingLine).to + 1, insert: '```\n\n```\n' });
// Remove lines 338-343 entirely
```

---

### WR-03: `childEditorFactory.ts` hardcodes `python()` syntax — breaks multi-language support

**File:** `src/main/childEditorFactory.ts:41`

**Issue:** `createChildEditor` unconditionally installs `python()` as the language
extension. The fence language tag (e.g., `typescript`, `java`, `cpp`) is managed
separately by the `switchFenceLanguage` / `lc-language` frontmatter path, but the child
editor never reflects it. A user who sets their preferred language to TypeScript will see
Python syntax highlighting in the child editor.

The CONTEXT notes that `extractFenceBody()` excludes the language tag from the child
document, and the language tag is "managed separately by the chevron/switchFenceLanguage
pathway" (D-08). But nothing in the factory reads `lc-language` or accepts a language
parameter.

**Fix:** Accept a `language` parameter in `createChildEditor` and map it to the
appropriate CM6 language extension:

```typescript
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript'; // etc.

export function createChildEditor(
  content: string,
  parent: HTMLElement,
  language: string = 'python',
  syncExtensions?: Extension[],
): EditorView {
  const langExt = resolveLanguageExtension(language); // python(), javascript({ typescript: true }), etc.
  // ...
}
```

---

## Info

### IN-01: `_registry` parameter in `createChildSyncExtension` is unused

**File:** `src/main/childEditorSync.ts:73-75`

**Issue:** `_registry: ChildEditorRegistry` is accepted as the third parameter of
`createChildSyncExtension` but is never referenced in the function body (the underscore
prefix acknowledges this). The parameter was presumably included for future use or passed
through from `wireSyncIfNeeded` for symmetry, but it adds noise to the signature and the
import of `ChildEditorRegistry` in this file serves no purpose beyond this parameter.

**Fix:** Remove the `_registry` parameter from `createChildSyncExtension` and the
corresponding argument from `wireSyncIfNeeded`. If registry access is needed in a future
iteration, it can be re-added then.

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
