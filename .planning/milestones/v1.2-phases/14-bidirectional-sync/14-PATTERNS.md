# Phase 14: Bidirectional Sync - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 3 (1 new, 2 modified)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main/childEditorSync.ts` | service | event-driven | `src/main/codeActionsEditorExtension.ts` | role-match (StateEffect/Annotation pattern, updateListener convention) |
| `src/main/childEditorFactory.ts` | utility | transform | `src/main/childEditorFactory.ts` (self — additive change only) | exact |
| `src/main/nestedEditorExtension.ts` | middleware | event-driven | `src/main/nestedEditorExtension.ts` (self — extending StateField.update + toDOM) | exact |

---

## Pattern Assignments

### `src/main/childEditorSync.ts` (new — service, event-driven)

**Primary analog:** `src/main/codeActionsEditorExtension.ts`
**Secondary analog:** `src/main/sectionLockExtension.ts`

**Imports pattern** — copy the eslint-disable comment block exactly; all CM6 imports are transitive peers marked external in esbuild (`codeActionsEditorExtension.ts` lines 41-55):

```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Annotation,
  Transaction,
  type EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
import { findCodeFence } from './codeActionsEditorExtension';
import { extractFenceBody } from './nestedEditorExtension';
import { ChildEditorRegistry } from './childEditorRegistry';
```

**Annotation definition pattern** — follow `languageRefreshEffect` (`codeActionsEditorExtension.ts` line 112) but use `Annotation.define` instead of `StateEffect.define`:

```typescript
// src/main/codeActionsEditorExtension.ts:112
export const languageRefreshEffect = StateEffect.define<string | undefined>();

// Phase 14 equivalent — Annotation (not StateEffect) because the child
// has no existing StateField to receive effects; a boolean annotation is sufficient
export const syncAnnotation = Annotation.define<boolean>();
```

**userEvent annotation convention** — copy exactly from `src/main.ts:2386-2393`:

```typescript
cm.dispatch({
  changes: [...],
  effects: languageRefreshEffect.of(newSlug),
  userEvent: 'leetcode.lang-switch',   // <-- convention to copy
});

// Phase 14 equivalent for child→parent dispatches:
parentView.dispatch({
  changes: [...],
  annotations: Transaction.userEvent.of('leetcode.child-sync'),
});
```

**Gate 0 userEvent check pattern** — copy from `sectionLockExtension.ts` lines 375-381 and 389. This is the exact check the child-sync dispatch must pass:

```typescript
// sectionLockExtension.ts:375-381 — Gate 0 (ONLY fires for user-input categories)
const isUserInput =
  typeof ev === 'string' &&
  (ev.startsWith('input.') ||
    ev.startsWith('delete.') ||
    ev === 'undo' ||
    ev === 'redo');
if (!isUserInput) return true;  // 'leetcode.child-sync' exits HERE → passes through

// sectionLockExtension.ts:389 — Gate 1 (defence-in-depth)
if (ev.startsWith('leetcode.')) {
  return true;
}
```

**StateField fast-path pattern** — copy from `nestedEditorExtension.ts` lines 208-210. This is the existing fast path that child-sync dispatches will follow:

```typescript
// nestedEditorExtension.ts:208-210
const userEvent = tr.annotation(Transaction.userEvent);
if (userEvent && userEvent.startsWith('leetcode.')) {
  return old.map(tr.changes);   // map only, no rebuild — keeps keystroke cost minimal
}
```

**updateListener extension pattern** — the child's sync listener must use `EditorView.updateListener.of(...)`. There is no existing analog in this codebase; the CM6 split-view pattern is:

```typescript
// Pattern: EditorView.updateListener (simpler than ViewPlugin for doc-change-only)
EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  // Check: did this update come FROM the parent (echo prevention)?
  if (update.transactions.some(tr => tr.annotation(syncAnnotation))) return;
  // Propagate to parent...
})
```

**Defensive try/catch pattern** — copy from `codeActionsEditorExtension.ts` lines 352-363. All dispatch callsites in this project wrap in try/catch with a silent ignore for teardown states:

```typescript
// codeActionsEditorExtension.ts:352-363
try {
  // ... dispatch
} catch {
  // Silently ignore — the editor may be in teardown, the active view
  // may not be a MarkdownView, or `editor.cm` may be missing in test
  // contexts. The next docChanged transaction will rebuild anyway.
}
```

**findCodeFence usage pattern** — copy from `codeActionsEditorExtension.ts` lines 177-212. Always called with fresh state; result checked for null before use:

```typescript
// codeActionsEditorExtension.ts:256
const fence = findCodeFence(state);
if (!fence) return builder.finish();   // null guard is mandatory

// Phase 14 equivalent:
const fence = findCodeFence(parentView.state);
if (!fence) { /* attempt repair or return */ }
```

**Offset derivation convention** (D-10 — never cache, always re-derive):

```typescript
// From RESEARCH.md §2 — derive bodyStart/bodyEnd at sync time, not stored anywhere
const fence = findCodeFence(parentView.state);
if (!fence) return;
const bodyStart = parentView.state.doc.line(fence.openerLine).to + 1;
const bodyEnd = parentView.state.doc.line(fence.closerLine).from;
```

---

### `src/main/childEditorFactory.ts` (modify — utility, transform)

**Analog:** `src/main/childEditorFactory.ts` (self, additive only)

**Current signature** (line 32):

```typescript
export function createChildEditor(content: string, parent: HTMLElement): EditorView {
```

**Target signature** — add optional third parameter, spread into extensions array:

```typescript
export function createChildEditor(
  content: string,
  parent: HTMLElement,
  syncExtensions?: Extension[],  // NEW — optional, defaults to []
): EditorView {
```

**Extension array spread pattern** — copy the existing extensions block (lines 35-60) and append the spread at the end. The `...(syncExtensions ?? [])` pattern is standard TypeScript; no existing analog needed:

```typescript
// childEditorFactory.ts:35-60 (existing block, abridged)
extensions: [
  python(),
  syntaxHighlighting(defaultHighlightStyle),
  bracketMatching(),
  history(),
  drawSelection(),
  highlightActiveLine(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
  EditorView.lineWrapping,
  EditorView.theme({ /* ... */ }),
  // NEW: spread sync extensions last
  ...(syncExtensions ?? []),
],
```

**Import to add** — `Extension` type from `@codemirror/state`. The file currently imports from `@codemirror/view` and `@codemirror/state` separately; add `type Extension` to the state import. Follow the eslint-disable comment pattern already in the file (lines 5-22).

---

### `src/main/nestedEditorExtension.ts` (modify — middleware, event-driven)

**Analog:** `src/main/nestedEditorExtension.ts` (self — two surgical additions)

**Addition 1: toDOM() — wire sync after child attach**

Current `toDOM` signature (line 77):

```typescript
toDOM(_view: EditorView): HTMLElement {
```

The `_view` parameter IS the parent EditorView (underscore-prefixed because it was unused). Phase 14 removes the underscore and uses it:

```typescript
// BEFORE (nestedEditorExtension.ts:77)
toDOM(_view: EditorView): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lc-nested-editor';
  let childView = this.registry.get(this.filePath);
  if (!childView) {
    childView = createChildEditor(this.fenceContent, container);
    this.registry.set(this.filePath, childView);
  } else {
    container.appendChild(childView.dom);
    if (typeof childView.requestMeasure === 'function') childView.requestMeasure();
  }
  return container;
}

// AFTER — use `view` (parent EditorView) to wire sync
toDOM(view: EditorView): HTMLElement {
  // ... existing create/re-attach logic unchanged ...
  // NEW: wire sync if not already wired (idempotent)
  wireSyncIfNeeded(view, childView, this.filePath);
  return container;
}
```

`wireSyncIfNeeded` is a function exported from `childEditorSync.ts`. It checks a module-level `Set<string>` of already-wired file paths (RESEARCH.md §6 "Tracking Sync State — simplest: a Set<string>").

**Addition 2: StateField.update() — detect external fence-body changes**

Current update block (lines 207-215):

```typescript
// nestedEditorExtension.ts:207-215 (existing)
update(old, tr) {
  const userEvent = tr.annotation(Transaction.userEvent);
  if (userEvent && userEvent.startsWith('leetcode.')) {
    return old.map(tr.changes);  // fast path: child-sync dispatches exit here
  }
  if (tr.docChanged || tr.reconfigured) {
    return buildNestedDecorations(tr.state, plugin, registry);
  }
  return old.map(tr.changes);
},
```

After Phase 14, insert external-change detection AFTER the `leetcode.*` fast path and BEFORE the rebuild:

```typescript
update(old, tr) {
  const userEvent = tr.annotation(Transaction.userEvent);
  if (userEvent && userEvent.startsWith('leetcode.')) {
    return old.map(tr.changes);  // fast path unchanged — child-sync exits here
  }
  // NEW: detect external fence-body changes (vault.process, AI review, etc.)
  if (tr.docChanged) {
    detectAndPropagateExternalChange(tr, plugin, registry);
  }
  if (tr.docChanged || tr.reconfigured) {
    return buildNestedDecorations(tr.state, plugin, registry);
  }
  return old.map(tr.changes);
},
```

`detectAndPropagateExternalChange` is a function exported from `childEditorSync.ts`. It checks change overlap with `[bodyStart, bodyEnd]` using `tr.changes.iterChangedRanges()` and dispatches to the child with `syncAnnotation.of(true)`.

**Import to add** in `nestedEditorExtension.ts`:

```typescript
import { wireSyncIfNeeded, detectAndPropagateExternalChange } from './childEditorSync';
```

---

## Shared Patterns

### userEvent bypass (`'leetcode.*'` prefix)

**Source:** `src/main/sectionLockExtension.ts` lines 357-381, `src/main/nestedEditorExtension.ts` lines 208-210

**Apply to:** All dispatches from `childEditorSync.ts` targeting the parent document

The convention: any plugin-originated CM6 dispatch that writes into a locked range (or that should skip decoration rebuild) MUST include `userEvent: 'leetcode.<verb>'`. The section lock's Gate 0 only fires for `input.*`/`delete.*`/`undo`/`redo` events; `'leetcode.*'` dispatches pass through Gate 0 (`!isUserInput → return true`) and are also short-circuited by the nestedEditorExtension's StateField fast path.

Established verbs: `'leetcode.lang-switch'` (src/main.ts:2392), `'leetcode.child-sync'` (D-02, pre-declared). New verbs for Phase 14: `'leetcode.fence-repair'` (D-05).

```typescript
// Pattern: all plugin dispatches that write into locked ranges
parentView.dispatch({
  changes: [...],
  annotations: Transaction.userEvent.of('leetcode.child-sync'),
  // OR: userEvent: 'leetcode.child-sync' (shorthand)
});
```

### Null-guard before any fence operation

**Source:** `src/main/codeActionsEditorExtension.ts` line 256, `src/main/nestedEditorExtension.ts` line 163

**Apply to:** Every function in `childEditorSync.ts` that calls `findCodeFence()`

```typescript
const fence = findCodeFence(state);
if (!fence) return; // or: trigger repairFenceStructure()
```

### eslint-disable comment for CM6 transitive peer imports

**Source:** `src/main/codeActionsEditorExtension.ts` lines 41-55, `src/main/childEditorFactory.ts` lines 5-22

**Apply to:** Every new import block in `childEditorSync.ts` that imports from `@codemirror/*`

```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { ... } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { ... } from '@codemirror/view';
```

### lc-slug frontmatter gate

**Source:** `src/main/codeActionsEditorExtension.ts` lines 245-254, `src/main/nestedEditorExtension.ts` lines 153-159

**Apply to:** `detectAndPropagateExternalChange` in `childEditorSync.ts` — only propagate when the note is an lc-slug note

```typescript
const file = state.field(editorInfoField)?.file;
if (!file) return;
const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const slug = fm?.['lc-slug'];
if (typeof slug !== 'string' || slug.length === 0) return;
```

### vault.process as only mutation primitive

**Source:** `src/graph/copyToCode.ts` lines 72-78, file header comment (CF-06 convention)

**Apply to:** `repairFenceStructure` in `childEditorSync.ts` — fence repair is a CM6 parent dispatch, NOT a vault.process call. Vault writes belong to `copyToCode.ts`-style callers. The repair goes through the CM6 editor (parent dispatch with `userEvent: 'leetcode.fence-repair'`), never through `app.vault.process`.

---

## No Analog Found

All three files have analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/main/`, `src/graph/`, `src/main.ts`
**Files scanned:** 5 (codeActionsEditorExtension.ts, sectionLockExtension.ts, nestedEditorExtension.ts, childEditorFactory.ts, copyToCode.ts + main.ts switchFenceLanguage block)
**Pattern extraction date:** 2026-05-21
