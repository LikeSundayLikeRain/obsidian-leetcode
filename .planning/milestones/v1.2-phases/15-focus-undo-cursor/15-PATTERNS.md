# Phase 15: Focus, Undo & Cursor - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 4 (modifications to existing files)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/childEditorFactory.ts` | config/factory | request-response | Self (current state) | exact |
| `src/main/childEditorSync.ts` | service | event-driven | Self (current state) | exact |
| `src/main/codeBlockButtonRow.ts` | component | event-driven | Self (current state) | exact |
| `styles.css` (nested editor section) | config | N/A (CSS) | Self (lines 1896-1918) | exact |

## Pattern Assignments

### `src/main/childEditorFactory.ts` (config/factory, request-response)

**Analog:** Self — this is an additive modification (adding `indentWithTab` to keymap, adding `indentUnit` facet)

**Imports pattern** (lines 1-22):
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
} from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
```

**Key convention:** Each `@codemirror/*` import has the eslint-disable comment on the line above. New imports from `@codemirror/commands` (adding `indentWithTab`) must follow this pattern.

**Core keymap pattern** (line 47):
```typescript
keymap.of([...defaultKeymap, ...historyKeymap]),
```

**Modification:** `indentWithTab` must be placed FIRST in the keymap array to win priority:
```typescript
keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
```

**Extension array pattern** (lines 40-65):
```typescript
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
  ...(syncExtensions ?? []),
],
```

**Pattern for adding new extensions:** Insert new extensions before the spread of `syncExtensions` (the last element). New scroll-into-view extension should be passed via the `syncExtensions` parameter or added inline before the spread.

---

### `src/main/childEditorSync.ts` (service, event-driven)

**Analog:** Self — modification adds `Transaction.addToHistory.of(false)` annotation to existing dispatch calls

**Imports pattern** (lines 14-26):
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Annotation,
  StateEffect,
  Transaction,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import { findCodeFence } from './codeActionsEditorExtension';
import { extractFenceBody } from './nestedEditorExtension';
import { ChildEditorRegistry } from './childEditorRegistry';
```

**Note:** `Transaction` is already imported — no new import needed for `addToHistory`.

**Child-to-parent dispatch pattern (primary sync path)** (lines 155-161):
```typescript
try {
  parentView.dispatch({
    changes: parentChanges,
    annotations: Transaction.userEvent.of('leetcode.child-sync'),
  });
} catch {
  // Silently ignore — the editor may be in teardown (defensive per project convention)
}
```

**Modification:** Add `Transaction.addToHistory.of(false)` to the annotations array:
```typescript
try {
  parentView.dispatch({
    changes: parentChanges,
    annotations: [
      Transaction.userEvent.of('leetcode.child-sync'),
      Transaction.addToHistory.of(false),
    ],
  });
} catch {
  // Silently ignore — the editor may be in teardown (defensive per project convention)
}
```

**Child-to-parent dispatch pattern (fence repair retry path)** (lines 108-112):
```typescript
try {
  parentView.dispatch({
    changes: { from: bodyStart, to: bodyEnd, insert: update.view.state.doc.toString() },
    annotations: Transaction.userEvent.of('leetcode.child-sync'),
  });
} catch { /* editor teardown */ }
```

**Modification:** Same — convert `annotations` to array with `addToHistory.of(false)`:
```typescript
try {
  parentView.dispatch({
    changes: { from: bodyStart, to: bodyEnd, insert: update.view.state.doc.toString() },
    annotations: [
      Transaction.userEvent.of('leetcode.child-sync'),
      Transaction.addToHistory.of(false),
    ],
  });
} catch { /* editor teardown */ }
```

**Echo prevention gate pattern** (lines 92-93 — for scroll-into-view gating):
```typescript
// Echo prevention (D-09): skip if this update came from parent
if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;
```

**New scroll-into-view extension pattern** (to be added as a new exported function):
```typescript
/**
 * Creates an updateListener that scrolls the parent viewport to keep the
 * child's cursor visible when typing at the bottom of the code area.
 *
 * Gated: only fires on user-originated changes (not sync from parent).
 */
export function createScrollIntoViewExtension(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged && !update.selectionSet) return;
    if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;
    // ... scroll logic
  });
}
```

**Export pattern:** Module exports functions (not classes). Each exported function has a JSDoc comment. Follow the `createChildSyncExtension` naming convention: `create<Capability>Extension`.

---

### `src/main/codeBlockButtonRow.ts` (component, event-driven)

**Analog:** Self — modification adds `mousedown` preventDefault to each button

**Button creation pattern** (lines 59-66):
```typescript
const runBtn = doc.createElement('button');
runBtn.className = 'leetcode-code-action-run';
runBtn.textContent = 'Run';
runBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  void plugin.runFromActive();
});
row.appendChild(runBtn);
```

**Modification:** Add mousedown handler BEFORE the click handler on each button:
```typescript
const runBtn = doc.createElement('button');
runBtn.className = 'leetcode-code-action-run';
runBtn.textContent = 'Run';
runBtn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // Prevent focus transfer to button (D-02)
});
runBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  void plugin.runFromActive();
});
row.appendChild(runBtn);
```

**Apply to all buttons:** `aiSolBtn` (line 49), `runBtn` (line 59), `submitBtn` (line 68). Each gets the same `mousedown` handler.

---

### `styles.css` — nested editor section (CSS config)

**Analog:** Self (lines 1896-1918)

**Existing nested editor CSS** (lines 1899-1918):
```css
.cm-editor .lc-nested-editor {
  background: var(--code-background, var(--background-secondary));
  border-radius: 4px;
  padding: 8px 0;
}
.cm-editor .lc-nested-editor .cm-editor {
  background: transparent;
}
.cm-editor .lc-nested-editor .cm-content {
  font-family: var(--font-monospace);
  font-size: 14px;
}
.cm-editor .lc-nested-editor .cm-gutters {
  background: transparent;
  border-right: none;
}
.cm-editor .lc-nested-editor .cm-activeLine {
  background: var(--background-modifier-hover);
}
```

**Comment convention** (line 1896):
```css
/* Phase 13 — Nested editor container styling. Darker background matching
 * Obsidian code block rendering (D-05). Uses only CSS variables — no
 * hardcoded colors. */
```

**Modification:** Append auto-grow CSS rules after line 1918 with a Phase 15 comment:
```css
/* Phase 15 — Auto-grow: disable child's independent scrolling so parent
 * scroll container handles all scrolling. Child height tracks content. */
.cm-editor .lc-nested-editor .cm-scroller {
  overflow: visible !important;
}
.cm-editor .lc-nested-editor .cm-editor {
  height: auto !important;
  max-height: none !important;
}
```

**Note:** The `.cm-editor .lc-nested-editor .cm-editor` rule already exists (line 1904) with `background: transparent`. The new height rules should be ADDED to that same selector block (merged), not duplicated as a separate rule.

---

## Shared Patterns

### Error Handling (try/catch with silent ignore)
**Source:** `src/main/childEditorSync.ts` lines 155-161
**Apply to:** Any new dispatch call (scroll-into-view extension)
```typescript
try {
  // dispatch or DOM operation
} catch {
  // Silently ignore — the editor may be in teardown (defensive per project convention)
}
```

### Echo Prevention Gate (syncAnnotation check)
**Source:** `src/main/childEditorSync.ts` lines 92-93
**Apply to:** The new scroll-into-view updateListener (must NOT fire on parent-to-child sync)
```typescript
if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;
```

### eslint-disable for @codemirror imports
**Source:** `src/main/childEditorFactory.ts` lines 5, 12, 14, 20
**Apply to:** Any new import from `@codemirror/*` packages
```typescript
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { indentWithTab } from '@codemirror/commands';
```

**Note:** `indentWithTab` is from `@codemirror/commands` which is already imported on line 21. It can simply be added to the existing import destructure — no new eslint-disable comment needed.

### Test Pattern (vi.mock + describe/it structure)
**Source:** `tests/main/childEditorFactory.test.ts` lines 1-56
**Apply to:** New test assertions for indentWithTab, addToHistory, mousedown handlers

**Mock pattern for @codemirror/commands** (lines 40-44):
```typescript
vi.mock('@codemirror/commands', () => ({
  history: vi.fn().mockReturnValue('mock-history-extension'),
  defaultKeymap: [{ key: 'mock-default' }],
  historyKeymap: [{ key: 'mock-history' }],
}));
```

**Modification for tests:** Add `indentWithTab` to mock:
```typescript
vi.mock('@codemirror/commands', () => ({
  history: vi.fn().mockReturnValue('mock-history-extension'),
  indentWithTab: { key: 'Tab', run: vi.fn() },
  defaultKeymap: [{ key: 'mock-default' }],
  historyKeymap: [{ key: 'mock-history' }],
}));
```

**Button test pattern (mousedown event dispatch):**
Source: `tests/main/codeBlockButtonRow.test.ts` lines 88-106 (AI Solution click preventDefault test)
```typescript
it('AI Solution click preventDefault + stopPropagation', () => {
  const aiSolutionFromActive = vi.fn();
  const plugin = withHostMethods({ aiSolutionFromActive });
  const row = buildCodeBlockButtonRow(document, plugin);

  const aiBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-ai-solution')!;
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
  let defaultPrevented = false;
  const origPD = evt.preventDefault.bind(evt);
  evt.preventDefault = () => { defaultPrevented = true; origPD(); };
  aiBtn.dispatchEvent(evt);

  expect(defaultPrevented).toBe(true);
});
```

**New test should follow same pattern but use `'mousedown'` event type:**
```typescript
it('buttons have mousedown preventDefault to retain child focus (D-02)', () => {
  const plugin = withHostMethods();
  const row = buildCodeBlockButtonRow(document, plugin);

  const runBtn = row.querySelector<HTMLButtonElement>('button.leetcode-code-action-run')!;
  const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  let defaultPrevented = false;
  const origPD = evt.preventDefault.bind(evt);
  evt.preventDefault = () => { defaultPrevented = true; origPD(); };
  runBtn.dispatchEvent(evt);

  expect(defaultPrevented).toBe(true);
});
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 15 changes are additive modifications to existing files with clear self-analog patterns |

---

## Metadata

**Analog search scope:** `src/main/`, `styles.css`, `tests/main/`
**Files scanned:** 7 (3 source files, 3 test files, 1 CSS file)
**Pattern extraction date:** 2026-05-21
