# Phase 15: Focus, Undo & Cursor - Research

**Researched:** 2026-05-21
**Domain:** CM6 nested editor UX — focus management, keyboard routing, undo isolation, auto-grow & scroll
**Confidence:** HIGH

## Summary

Phase 15 delivers seamless user experience for the nested child CM6 editor introduced in Phase 13-14. The core work involves: (1) adding `indentWithTab` keymap binding so Tab/Shift-Tab indent/dedent code instead of focus-navigating, (2) annotating child-to-parent sync dispatches with `Transaction.addToHistory.of(false)` to isolate undo stacks, (3) CSS + extension configuration to make the child editor auto-grow without an inner scrollbar, and (4) scroll-into-view logic so the parent note auto-scrolls when typing at the bottom of the code area.

All four changes are well-supported by existing CM6 APIs and require only additive modifications to `childEditorFactory.ts`, `childEditorSync.ts`, `codeBlockButtonRow.ts`, and `styles.css`. No new npm packages are needed — `indentWithTab` is already exported from `@codemirror/commands@6.10.3` (installed). The `Transaction.addToHistory` annotation is part of `@codemirror/state` (installed). `EditorView.scrollIntoView` is a standard effect from `@codemirror/view` (installed).

**Primary recommendation:** This phase is purely additive extension configuration + CSS. No architectural changes, no new dependencies. Implementation should take 3-4 focused tasks modifying existing files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Browser-native blur handles focus exit from the child editor. No custom focus management needed for click-out.
- **D-02:** Run/Submit buttons do NOT steal focus from the child editor. Buttons act on click but the child retains focus. Implementation: `event.preventDefault()` on mousedown or `tabindex="-1"` on button elements.
- **D-03:** No Escape key exit hatch. Escape does nothing in the child editor.
- **D-04:** The existing transactionFilter cursor-redirect (Phase 13 D-06) handles focus INTO the child. This phase does not modify that behavior.
- **D-05:** `indentWithTab` keymap added to the child editor. Tab always indents, Shift-Tab always dedents. No conditional behavior.
- **D-06:** Multi-line indent (select lines then Tab) registers as a single undo operation. CM6's `indentMore`/`indentLess` already groups this naturally.
- **D-07:** Cmd-A in the child selects all child content only (not the entire note). Standard `selectAll` from `defaultKeymap` provides this.
- **D-08:** All global Obsidian shortcuts (Cmd-P, Cmd-O, Cmd-E, Cmd-N, Cmd-W, Cmd-S, Cmd-Shift-F) bubble to Obsidian normally.
- **D-09:** Cmd-/ (comment toggle) is deferred to Phase 16.
- **D-10:** Child undo is isolated. Cmd-Z in the child undoes the last child edit only.
- **D-11:** Child-sync dispatches to parent carry `addToHistory: false`. Parent's undo history does NOT include child-sync changes.
- **D-12:** Copy to Code (vault.process) remains undo-able in the child.
- **D-13:** Child editor grows unbounded — height equals content height, always. No inner scrollbar, no max-height cap.
- **D-14:** Auto-scroll into view when typing causes cursor to go below viewport.
- **D-15:** Height recalculation happens on every child document change.

### Claude's Discretion
- Scroll-into-view implementation approach (CM6's `scrollIntoView` effect translated to parent coordinates, or direct `scrollIntoView()` DOM API on the cursor element, or `requestMeasure` + manual scroll calculation)
- Whether auto-grow uses CSS `height: auto` on the child's `.cm-editor` wrapper or explicit height calculation via `requestMeasure`
- How to prevent the child's own `scrollDOM` from scrolling (overflow: hidden vs. removing scroll listener)

### Deferred Ideas (OUT OF SCOPE)
- Theme-aware syntax highlighting (Phase 16)
- Vim mode support (Phase 17)
- Modular panel layout / solving mode (v1.3+)
- Cmd-/ comment toggle (Phase 16)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INDENT-01 | User can press Tab inside the code fence body to indent the current line | `indentWithTab` keymap binding dispatches `indentMore` which inserts `indentUnit` at line start; already confirmed in `@codemirror/commands@6.10.3` |
| INDENT-02 | User can press Shift-Tab inside the code fence body to dedent the current line | `indentWithTab` binding maps Shift-Tab to `indentLess` which removes one indent unit |
| INDENT-03 | User can select multiple lines and Tab/Shift-Tab to indent/dedent all as single undo step | `indentMore` uses `changeBySelectedLine` + single `state.update()` dispatch = single transaction = single undo step; verified in source |
| INDENT-04 | Indent unit respects the active language (e.g., 4 spaces for Java/Python/C++, 2 for JS/TS) | `indentMore` reads `state.facet(indentUnit)` — currently uses CM6 default (2 spaces); language-specific override deferred to Phase 16 per REQUIREMENTS.md traceability |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab/Shift-Tab indent | Child CM6 EditorView (keymap) | -- | Child owns its own keybindings; parent never sees Tab events from child |
| Focus transitions (click-in/click-out) | Browser (native blur/focus) | Parent transactionFilter | Browser handles blur natively; Phase 13 transactionFilter handles cursor-redirect into child |
| Undo isolation | Child CM6 history() + Parent dispatch annotation | -- | Child has its own history(); parent sync annotated `addToHistory: false` |
| Auto-grow | CSS (child `.cm-scroller` overflow) | -- | Pure CSS solution; child DOM naturally grows with content |
| Scroll into view | Child EditorView updateListener | Parent scroll container DOM | Child detects cursor position change, translates to parent viewport coords |
| Run/Submit focus retention | Button DOM (`mousedown preventDefault`) | -- | Buttons prevent focus steal via standard DOM event handling |

## Standard Stack

### Core (already installed — no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@codemirror/commands` | 6.10.3 | `indentWithTab`, `indentMore`, `indentLess` | Official CM6 keybinding; already in project dependencies |
| `@codemirror/state` | (peer of obsidian) | `Transaction.addToHistory` annotation | Standard CM6 undo-isolation mechanism |
| `@codemirror/view` | (peer of obsidian) | `EditorView.scrollIntoView`, `EditorView.updateListener` | Standard CM6 scroll effect |

### Supporting
No additional libraries needed. All required APIs are already available in the project's installed dependencies.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS overflow:hidden for auto-grow | `requestMeasure` + explicit height | CSS is simpler and sufficient; explicit height adds complexity for no benefit when content determines height |
| DOM `element.scrollIntoView()` for parent scroll | `EditorView.scrollIntoView` effect on parent | DOM API is simpler but less precise (no margin control); CM6 effect provides `yMargin` option |
| `tabindex="-1"` on buttons | `mousedown` preventDefault | Both prevent focus steal; mousedown approach is already established in `codeBlockButtonRow.ts` |

## Architecture Patterns

### System Architecture Diagram

```
User Input (keyboard/mouse)
         |
         v
+------------------+          +------------------+
| Parent CM6       |  click   | Child CM6        |
| EditorView       | -------> | EditorView       |
| (note editor)    |          | (code editor)    |
+------------------+          +------------------+
         |                             |
         | transactionFilter           | updateListener
         | (cursor redirect)           | (child->parent sync)
         |                             |
         v                             v
+------------------+          +------------------+
| Parent Document  | <------> | Child Document   |
| (full .md note)  |  sync    | (fence body)     |
+------------------+          +------------------+
         |                             |
         v                             v
  Parent undo history           Child undo history
  (excludes child-sync)        (isolated, complete)
         |
         v
+------------------+
| Parent Scroll    |
| Container        | <-- scroll-into-view triggered
| (.cm-scroller)   |     by child cursor changes
+------------------+
```

### Recommended Project Structure (modifications only)
```
src/main/
├── childEditorFactory.ts    # ADD: indentWithTab keymap, auto-grow CSS/extensions
├── childEditorSync.ts       # ADD: Transaction.addToHistory.of(false) on parent dispatch
├── codeBlockButtonRow.ts    # ADD: mousedown preventDefault on buttons (focus retention)
styles.css                   # ADD: .lc-nested-editor .cm-scroller overflow rules
```

### Pattern 1: indentWithTab Keymap Integration
**What:** Add `indentWithTab` to the child editor's keymap so Tab always indents and Shift-Tab always dedents.
**When to use:** Always — the child editor is a code editor where Tab must produce indentation.
**Example:**
```typescript
// Source: @codemirror/commands source (verified in node_modules)
import { indentWithTab } from '@codemirror/commands';

// In createChildEditor extensions array:
keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])
// indentWithTab MUST come first to win priority over any lower-precedence Tab bindings
```

### Pattern 2: Undo Isolation via addToHistory Annotation
**What:** Prevent child-sync dispatches from polluting the parent's undo stack.
**When to use:** Every child-to-parent sync dispatch.
**Example:**
```typescript
// Source: @codemirror/state Transaction.addToHistory (verified in node_modules/dist/index.d.ts:1009)
import { Transaction } from '@codemirror/state';

// In propagateChildChanges (childEditorSync.ts):
parentView.dispatch({
  changes: parentChanges,
  annotations: [
    Transaction.userEvent.of('leetcode.child-sync'),
    Transaction.addToHistory.of(false),  // D-11: isolate parent undo
  ],
});
```

### Pattern 3: Auto-Grow via CSS (No Inner Scrollbar)
**What:** Make the child editor's scroll container not scroll independently, letting the parent handle all scrolling.
**When to use:** Always — the child is embedded in a parent scrolling document.
**Example:**
```css
/* Disable child's own scrolling — parent scroll container handles it */
.cm-editor .lc-nested-editor .cm-scroller {
  overflow: visible !important;
}
```

### Pattern 4: Scroll Into View via DOM API
**What:** After a child edit that moves the cursor downward, scroll the parent viewport to keep the cursor visible.
**When to use:** On every child document change where cursor position changes.
**Example:**
```typescript
// In an updateListener on the child editor:
EditorView.updateListener.of((update) => {
  if (!update.docChanged && !update.selectionSet) return;
  // Get the cursor DOM element in the child
  const cursorRect = update.view.coordsAtPos(update.state.selection.main.head);
  if (!cursorRect) return;
  // Find parent scroll container and check if cursor is below viewport
  const scroller = update.view.dom.closest('.cm-scroller');
  if (!scroller) return;
  const scrollerRect = scroller.getBoundingClientRect();
  if (cursorRect.bottom > scrollerRect.bottom - 20) {
    // Scroll parent to bring cursor into view
    const cursorEl = update.view.domAtPos(update.state.selection.main.head);
    cursorEl.node.parentElement?.scrollIntoView({ block: 'nearest' });
  }
});
```

### Pattern 5: Button Focus Retention via mousedown
**What:** Prevent Run/Submit buttons from stealing focus when clicked.
**When to use:** All action buttons adjacent to the child editor.
**Example:**
```typescript
// In codeBlockButtonRow.ts — add to each button:
btn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // Prevents focus transfer on click
});
// Click handler fires separately and acts without stealing focus
```

### Anti-Patterns to Avoid
- **Custom focus management for click-out:** Browser-native blur is sufficient (D-01). Adding focusout handlers or manual `parentView.focus()` calls introduces race conditions and flicker.
- **Escape key exit:** Matches neither Obsidian nor LeetCode web behavior (D-03). Users click to move focus.
- **Wrapping undo across child/parent boundary:** Creates confusing UX where Cmd-Z in one editor affects the other. Keep stacks isolated (D-10, D-11).
- **Fixed height + inner scrollbar on child:** Creates "scroll within scroll" confusion. Always auto-grow (D-13).
- **Debouncing scroll-into-view:** Causes visible lag when typing fast. Fire synchronously on each update.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tab-to-indent | Custom keydown handler with indent logic | `indentWithTab` from `@codemirror/commands` | Handles Tab, Shift-Tab, multi-line selection, indent-unit facet, read-only check — all in 3 lines of source |
| Undo isolation | Custom undo stack or undo-command interception | `Transaction.addToHistory.of(false)` annotation | Standard CM6 mechanism; the `history()` extension already respects this annotation |
| Multi-line indent as single undo | `isolateHistory` or custom grouping | `indentMore` already dispatches a single transaction | It uses `state.update(changeBySelectedLine(...))` — one transaction = one undo step by design |

**Key insight:** All four capabilities in this phase (indent, undo isolation, auto-grow, scroll) are solved by standard CM6 APIs with minimal configuration. No custom algorithms needed.

## Common Pitfalls

### Pitfall 1: indentWithTab Keymap Priority
**What goes wrong:** If `indentWithTab` is placed after `defaultKeymap` in the keymap array, another binding might consume Tab first (e.g., `acceptCompletion` from autocomplete extensions).
**Why it happens:** CM6 keymaps are checked in array order within a `keymap.of([...])` call, but higher-precedence extension wins across calls.
**How to avoid:** Place `indentWithTab` BEFORE `defaultKeymap` in the keymap.of() call: `keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap])`. Since the child editor has no autocomplete, this is sufficient.
**Warning signs:** Tab moves focus out of editor or does nothing instead of indenting.

### Pitfall 2: addToHistory Annotation on Repair Dispatches
**What goes wrong:** The `repairFenceStructure` path in `childEditorSync.ts` also dispatches to parent — if that dispatch lacks `addToHistory: false`, fence repairs pollute the parent undo stack.
**Why it happens:** Only the main `propagateChildChanges` path is obviously a sync dispatch; the repair and retry paths are less obvious.
**How to avoid:** Audit ALL `parentView.dispatch()` calls in `childEditorSync.ts`. Every dispatch that originates from child behavior must carry both `Transaction.userEvent.of('leetcode.child-sync')` AND `Transaction.addToHistory.of(false)`.
**Warning signs:** Cmd-Z in parent unexpectedly reverts fence repair or child-sync changes.

### Pitfall 3: Child .cm-scroller Overflow Conflicts with CM6 Internals
**What goes wrong:** Setting `overflow: visible` on `.cm-scroller` may break CM6's viewport rendering (CM6 uses scroll position to determine which lines to render in the viewport).
**Why it happens:** CM6's line-virtualization relies on `.cm-scroller` having `overflow: auto` so it can detect scroll position and only render visible lines.
**How to avoid:** For short documents (under ~1000 lines), CM6 renders all lines anyway (no virtualization). LeetCode solutions are typically under 200 lines. If issues arise, use `overflow-y: hidden` (still prevents scrollbar) rather than `overflow: visible`, and ensure the child has no `height` or `max-height` constraint so `.cm-scroller` never actually needs to scroll.
**Warning signs:** Long code solutions render blank lines or flicker when scrolling the parent.

### Pitfall 4: Scroll-Into-View Firing on Parent-to-Child Sync
**What goes wrong:** When external writes (vault.process / Copy to Code) sync content INTO the child, the scroll-into-view listener fires and scrolls the parent to the child's cursor (which may be at position 0 after a full-replace).
**Why it happens:** The updateListener fires on ALL doc changes, including sync-originated ones.
**How to avoid:** Gate the scroll-into-view logic: only fire when the update is user-originated (not annotated with `syncAnnotation`). Check `update.transactions.some(tr => tr.annotation(syncAnnotation))` and skip.
**Warning signs:** Opening a note or "Copy to Code" unexpectedly scrolls the viewport to the code section.

### Pitfall 5: Button mousedown.preventDefault Breaking Text Selection
**What goes wrong:** Adding `mousedown` preventDefault on buttons may accidentally prevent text selection if applied to the wrong container element.
**Why it happens:** preventDefault on mousedown prevents the default "start selection" behavior for ANY element under the listener.
**How to avoid:** Apply `mousedown` preventDefault ONLY on the button elements themselves, not on any parent container. The existing `click` handlers in `codeBlockButtonRow.ts` already call `e.preventDefault()` + `e.stopPropagation()` — the mousedown handler is additive, specifically targeting focus prevention.
**Warning signs:** Cannot select text near the button row; clicking near buttons does nothing.

## Code Examples

### Complete indentWithTab Integration
```typescript
// Source: childEditorFactory.ts modification (verified APIs from @codemirror/commands@6.10.3)
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';

// In extensions array:
keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
```

### Complete addToHistory Integration
```typescript
// Source: childEditorSync.ts modification (verified Transaction.addToHistory from @codemirror/state)
import { Transaction } from '@codemirror/state';

// In propagateChildChanges, replace the existing dispatch:
parentView.dispatch({
  changes: parentChanges,
  annotations: [
    Transaction.userEvent.of('leetcode.child-sync'),
    Transaction.addToHistory.of(false),
  ],
});

// ALSO in the repair-retry path (lines ~108-113):
parentView.dispatch({
  changes: { from: bodyStart, to: bodyEnd, insert: update.view.state.doc.toString() },
  annotations: [
    Transaction.userEvent.of('leetcode.child-sync'),
    Transaction.addToHistory.of(false),
  ],
});
```

### Complete Auto-Grow CSS
```css
/* Source: CM6 architecture — .cm-scroller is the scroll container */
/* Prevent child editor from scrolling independently */
.cm-editor .lc-nested-editor .cm-scroller {
  overflow: visible !important;
}

/* Ensure no height constraints create inner scrolling */
.cm-editor .lc-nested-editor .cm-editor {
  height: auto !important;
  max-height: none !important;
}
```

### Complete Scroll-Into-View Extension
```typescript
// Source: EditorView.updateListener + DOM scrollIntoView (verified APIs)
import { EditorView } from '@codemirror/view';
import { syncAnnotation } from './childEditorSync';

function createScrollIntoViewExtension(): Extension {
  return EditorView.updateListener.of((update) => {
    // Only fire on user-originated changes (not sync-from-parent)
    if (!update.docChanged && !update.selectionSet) return;
    if (update.transactions.some(tr => tr.annotation(syncAnnotation))) return;
    
    // Get cursor coordinates in viewport
    const head = update.state.selection.main.head;
    const coords = update.view.coordsAtPos(head);
    if (!coords) return;
    
    // Find the PARENT's scroll container (not the child's)
    const parentScroller = update.view.dom.closest('.cm-editor')
      ?.closest('.cm-editor')?.querySelector('.cm-scroller');
    if (!parentScroller) return;
    
    const scrollerRect = parentScroller.getBoundingClientRect();
    const margin = 40; // px of breathing room below cursor
    
    if (coords.bottom > scrollerRect.bottom - margin) {
      // Cursor below visible area — scroll down
      parentScroller.scrollTop += (coords.bottom - scrollerRect.bottom + margin);
    }
  });
}
```

### Button Focus Retention
```typescript
// Source: codeBlockButtonRow.ts modification (standard DOM API)
const btn = doc.createElement('button');
btn.addEventListener('mousedown', (e) => {
  e.preventDefault(); // Prevent focus transfer to button
});
btn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  void plugin.runFromActive();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No Tab handling (focus escapes) | `indentWithTab` keymap binding | CM6 v0.19+ (2021) | Standard way to capture Tab in code editors |
| Manual undo grouping | Single-transaction dispatch via `changeBySelectedLine` | CM6 design (since inception) | One dispatch = one undo entry by design |
| Custom scroll sync | `EditorView.scrollIntoView` effect | CM6 v6 (stable) | Official effect for scroll management |
| `scrollPastEnd()` extension | NOT used here (it's for standalone editors) | -- | Would conflict with auto-grow; designed for editors that "take the size of their content" |

**Deprecated/outdated:**
- `scrollPastEnd()`: Documentation explicitly says "should not be enabled in editors that take the size of their content" — which is exactly what our auto-growing child editor does.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CM6 line virtualization is disabled for documents under ~1000 lines, so `overflow: visible` on `.cm-scroller` won't break rendering | Pitfall 3 | If virtualization activates on shorter docs, blank lines may appear; fallback is `overflow-y: hidden` |
| A2 | The parent's `.cm-scroller` is the correct scroll target for scroll-into-view | Code Examples | If Obsidian wraps the editor in another scroll container, the DOM traversal needs adjustment |
| A3 | `mousedown` preventDefault on buttons is sufficient to prevent focus steal across all platforms | Pattern 5 | If some browsers handle focus differently, `tabindex="-1"` is the backup approach |

## Open Questions

1. **Exact parent scroll container selector**
   - What we know: The parent CM6 editor has `.cm-scroller` as its scroll container. Obsidian may wrap this in additional containers.
   - What's unclear: Whether `.cm-scroller` of the PARENT editor is the right target, or if Obsidian's workspace pane `.workspace-leaf-content` is the actual scrolling ancestor.
   - Recommendation: During implementation, empirically test by logging `update.view.dom.closest('.cm-scroller')` chain. If the immediate `.cm-scroller` belongs to the child, traverse up past `.lc-nested-editor` to find the parent's scroller.

2. **INDENT-04 (language-specific indent unit)**
   - What we know: Per REQUIREMENTS.md traceability, INDENT-04 is assigned to Phase 16. However, Phase 15 success criteria lists INDENT-04.
   - What's unclear: Whether Phase 15 should set a default indent unit (4 spaces) or leave CM6's default (2 spaces).
   - Recommendation: Set `indentUnit.of("    ")` (4 spaces) as default in Phase 15 — this covers Python/Java/C++ (the most common LC languages). Phase 16 will make it dynamic per-language.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run tests/main/childEditorFactory.test.ts tests/main/childEditorSync.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INDENT-01 | Tab inserts indent in child | unit | `npm test -- --run tests/main/childEditorFactory.test.ts -t "indentWithTab"` | Partial (factory test exists, needs indent assertion) |
| INDENT-02 | Shift-Tab removes indent in child | unit | `npm test -- --run tests/main/childEditorFactory.test.ts -t "indentWithTab"` | Partial |
| INDENT-03 | Multi-line indent is single undo step | unit | `npm test -- --run tests/main/childEditorSync.test.ts -t "undo"` | No (new test needed) |
| INDENT-04 | Indent respects language (4 spaces default) | unit | `npm test -- --run tests/main/childEditorFactory.test.ts -t "indentUnit"` | No (new test) |
| D-11 | Child-sync dispatch has addToHistory:false | unit | `npm test -- --run tests/main/childEditorSync.test.ts -t "addToHistory"` | No (new test) |
| D-02 | Buttons don't steal focus | unit | `npm test -- --run tests/main/codeBlockButtonRow.test.ts -t "focus"` | No (new test) |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/main/childEditorFactory.test.ts tests/main/childEditorSync.test.ts tests/main/codeBlockButtonRow.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/main/childEditorFactory.test.ts` — add assertions for `indentWithTab` in keymap, `indentUnit` facet
- [ ] `tests/main/childEditorSync.test.ts` — add assertion that parent dispatch carries `Transaction.addToHistory.of(false)`
- [ ] `tests/main/codeBlockButtonRow.test.ts` — add assertion that buttons have mousedown preventDefault handler

## Security Domain

> This phase involves no network calls, no user data handling, no authentication changes, and no dynamic code execution. The changes are purely editor configuration (keymaps, CSS, scroll behavior).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | -- |
| V3 Session Management | no | -- |
| V4 Access Control | no | -- |
| V5 Input Validation | no | -- |
| V6 Cryptography | no | -- |

No security concerns for this phase. All changes are local editor behavior configuration.

## Sources

### Primary (HIGH confidence)
- `@codemirror/commands@6.10.3` source in `node_modules/` — `indentWithTab` implementation, `indentMore`/`indentLess` behavior, `changeBySelectedLine` grouping [VERIFIED: npm registry + source inspection]
- `@codemirror/state` type definitions — `Transaction.addToHistory` annotation type at line 1009 of `dist/index.d.ts` [VERIFIED: npm registry + source inspection]
- `@codemirror/view` type definitions — `EditorView.scrollIntoView` at line 1070, `scrollPastEnd` at line 1593 [VERIFIED: npm registry + source inspection]
- `src/main/childEditorFactory.ts` — current child editor extension array (lines 38-68) [VERIFIED: codebase]
- `src/main/childEditorSync.ts` — current sync dispatch pattern (lines 108-113, 149-160) [VERIFIED: codebase]
- `src/main/codeBlockButtonRow.ts` — current button handlers with `preventDefault`+`stopPropagation` on click [VERIFIED: codebase]
- `styles.css` lines 1885-1918 — current nested editor CSS [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — Pitfall 9 (Tab key), Pitfall 11 (undo), Pitfall 12 (focus), Pitfall 15 (scroll) [VERIFIED: project documentation]
- CM6 Tab handling example pattern (codemirror.net/examples/tab/) — referenced in pitfalls doc [CITED: codemirror.net/examples/tab/]

### Tertiary (LOW confidence)
- None — all claims verified from installed source code or project documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all APIs verified in installed node_modules type definitions and source
- Architecture: HIGH - purely additive changes to existing, working files
- Pitfalls: HIGH - derived from prior pitfalls research + verified CM6 behavior

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (stable — CM6 APIs are mature, no breaking changes expected)
