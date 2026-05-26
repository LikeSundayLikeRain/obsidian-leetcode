# Phase 13: Nested Editor Foundation - Research

**Researched:** 2026-05-21
**Domain:** CM6 nested EditorView inside Obsidian plugin block widget
**Confidence:** HIGH

## Summary

Phase 13 introduces a child CM6 `EditorView` rendered inside the `## Code` fence region of `lc-slug` notes, providing Python syntax highlighting via `@codemirror/lang-python` (Lezer-based). The child editor is mounted via `Decoration.widget({ block: true })` with parent fence lines hidden via CSS `Decoration.line` decorations. A plugin-level LRU registry (`Map<string, EditorView>`) manages child lifecycle across note switches and widget rebuilds, decoupling EditorView lifespan from widget DOM destruction.

The critical architectural insight is that the widget's `destroy()` call must NOT destroy the child EditorView — it merely detaches the DOM. True destruction happens only on LRU eviction, explicit file close, or plugin unload. This pattern, combined with stable `eq()` identity (comparing only immutable file path), prevents the state-loss-on-parent-transaction bug (Pitfall 1 from NESTED-EDITOR-PITFALLS.md).

**Primary recommendation:** Follow the existing `CodeActionsWidget` block-widget pattern exactly (Decoration.widget + StateField + provide), adding CSS line-hiding decorations in a separate DecorationSet layer, with child EditorView lifecycle fully decoupled from widget lifecycle via a plugin-instance registry keyed by `TFile.path`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Child editor is editable from Phase 13 — edits live in child state only; no parent sync until Phase 14
- D-02: No warning or visual cue about unsaved state
- D-03: Child editor pre-populated with current fence body content from parent document on creation
- D-04: Entire fence hidden — opener, body lines, and closer; nested editor replaces full visual area
- D-05: Darker background matching Obsidian's existing fenced code block styling
- D-06: Cursor entering hidden fence zone redirects focus to child (transactionFilter-based, not atomicRanges skip)
- D-07: Target both Source Mode + Live Preview; Source Mode is non-negotiable
- D-08: Separate StateField in new `nestedEditorExtension.ts`
- D-09: Widget in fence body area (anchored at opener line end); button row stays at fence closer below
- D-10: No pin/sticky for button row in Phase 13
- D-11: Registry key is `TFile.path`
- D-12: LRU cache cap of 5
- D-13: Widget `destroy()` detaches DOM but keeps EditorView alive in registry

### Claude's Discretion
- Widget + code-actions coexistence approach (separate StateFields chosen)

### Deferred Ideas (OUT OF SCOPE)
- Sticky/pinned button row for long code — Phase 17 polish
- Live Preview handling if excessive scope — Phase 17
- Split-view (same note in two panes) proper handling — future
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (Foundation) | Enables all 16 v1.2 requirements | This phase provides the nested EditorView infrastructure. No individual REQ-IDs are directly satisfied — they depend on Phase 14+ (sync, focus, language packs) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Child EditorView rendering | Editor Extension (CM6 widget) | — | Block widget mounts in parent's decoration layer |
| Fence line hiding | Editor Extension (CM6 line decoration) | CSS | Decoration.line adds class; CSS rule hides |
| Python syntax highlighting | Bundled lang-python (Lezer parser) | @codemirror/language (external, runtime) | Parser bundled; language infra provided by Obsidian host |
| EditorView lifecycle | Plugin instance (registry Map) | Widget (attach/detach DOM) | Registry outlives widget; widget is just a DOM attachment point |
| Cursor redirect | Editor Extension (transactionFilter) | — | Rewrites selection when cursor lands in hidden zone |
| Styling | CSS (styles.css) | — | Theme-variable-based code block background |

## Standard Stack

### Core (already available — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@codemirror/state` | runtime (external) | EditorState for child | Provided by Obsidian host at runtime |
| `@codemirror/view` | runtime (external) | EditorView, WidgetType, Decoration | Provided by Obsidian host at runtime |
| `@codemirror/language` | runtime (external) | syntaxHighlighting, LanguageSupport infra | Provided by Obsidian host at runtime |
| `@codemirror/commands` | runtime (external) | defaultKeymap for child | Provided by Obsidian host at runtime |
| `@lezer/common` | runtime (external) | Parser infrastructure | Provided by Obsidian host at runtime |
| `@lezer/highlight` | runtime (external) | Highlight tag system | Provided by Obsidian host at runtime |
| `@codemirror/autocomplete` | runtime (external) | Peer dep of lang-python | Provided by Obsidian host at runtime |
| `@codemirror/lang-python` | 6.2.1 (bundled) | Python LanguageSupport for child editor | Already in package.json dependencies; esbuild bundles it (NOT external) |
| `@lezer/python` | 1.1.18 (bundled, transitive) | Python Lezer grammar | Transitive dep of lang-python; bundled by esbuild |

### No New Dependencies Required
All packages needed for Phase 13 are already in `package.json`. No `npm install` needed.

**Bundle size impact:** `@codemirror/lang-python` (~13KB) + `@lezer/python` (~44KB) = ~57KB added to bundle. Current bundle: 1,220KB. New total: ~1,277KB. Well under the 1.5MB ceiling accepted by the user. [VERIFIED: filesystem check of node_modules]

## Architecture Patterns

### System Architecture Diagram

```
Parent EditorView (Obsidian's CM6 instance)
    |
    +-- nestedEditorExtension (NEW)
    |     |
    |     +-- StateField<DecorationSet> [CSS-hide line decorations + widget]
    |     |     |
    |     |     +-- Decoration.line({ class: 'lc-fence-hidden' }) on fence lines
    |     |     +-- Decoration.widget({ block: true }) at opener.to (side: 1)
    |     |           |
    |     |           +-- NestedEditorWidget.toDOM()
    |     |                 |
    |     |                 +-- Attaches childView.dom from registry (or creates new)
    |     |
    |     +-- transactionFilter [cursor redirect]
    |           |
    |           +-- If selection lands in hidden zone -> childView.focus()
    |
    +-- codeActionsEditorExtension (EXISTING, unchanged)
    |     |
    |     +-- StateField<DecorationSet> [button row widget at closer.to]
    |
    +-- sectionLockExtension (EXISTING, unchanged)
          |
          +-- changeFilter [drops edits to locked ranges]
          +-- transactionFilter [snaps cursor out of locked ranges]

Plugin Instance
    |
    +-- childEditorRegistry: Map<string, RegistryEntry>
    |     key: TFile.path
    |     value: { view: EditorView, lastAccess: number }
    |     cap: 5 (LRU eviction)
    |
    +-- onunload() -> destroy all entries
```

### Recommended Project Structure
```
src/
├── main/
│   ├── nestedEditorExtension.ts    # StateField + NestedEditorWidget + transactionFilter
│   ├── childEditorRegistry.ts      # LRU Map<string, RegistryEntry>, create/get/evict/destroyAll
│   ├── childEditorFactory.ts       # Creates a new EditorView with Python LanguageSupport
│   └── (existing files unchanged)
│       ├── codeActionsEditorExtension.ts
│       └── sectionLockExtension.ts
├── main.ts                         # Adds registerEditorExtension call
└── ...
styles.css                          # New .lc-fence-hidden CSS rule
```

### Pattern 1: Block Widget with Registry-Backed Lifecycle

**What:** A WidgetType subclass whose `toDOM()` attaches an existing child EditorView from the registry (or creates one), and whose `destroy()` merely detaches the DOM without destroying the EditorView.

**When to use:** Any widget that wraps a stateful object (like EditorView) that must survive widget rebuild cycles.

**Example:**
```typescript
// Source: Derived from CodeActionsWidget pattern + NESTED-EDITOR-PITFALLS.md Pitfall 1
class NestedEditorWidget extends WidgetType {
  constructor(
    readonly filePath: string,
    readonly registry: ChildEditorRegistry,
    readonly fenceContent: string,  // initial content for creation only
  ) { super(); }

  eq(other: NestedEditorWidget): boolean {
    // STABLE identity — only compare immutable file path
    // Do NOT compare fenceContent (changes every edit, would cause rebuild)
    return other.filePath === this.filePath;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lc-nested-editor';

    // Get or create child EditorView from registry
    let childView = this.registry.get(this.filePath);
    if (!childView) {
      childView = createChildEditor(this.fenceContent, container);
      this.registry.set(this.filePath, childView);
    } else {
      // Re-attach existing child DOM to new container
      container.appendChild(childView.dom);
    }
    return container;
  }

  destroy(dom: HTMLElement): void {
    // DETACH only — do NOT destroy the child EditorView
    // The child lives in the registry until LRU eviction or plugin unload
    const childDom = dom.querySelector('.cm-editor');
    if (childDom) dom.removeChild(childDom);
  }

  get estimatedHeight(): number {
    // Approximate: lineCount * lineHeight. Better than -1.
    const lines = this.fenceContent.split('\n').length;
    return Math.max(lines * 20, 60); // 20px per line, minimum 60px
  }

  ignoreEvent(): boolean {
    // Let ALL events pass through to the child editor
    return false;
  }
}
```

### Pattern 2: CSS Line-Hiding via Decoration.line

**What:** Apply `Decoration.line({ class: 'lc-fence-hidden' })` to each fence line (opener, body lines, closer). CSS sets `height: 0; overflow: hidden; opacity: 0` on those lines. The content remains in the document (findable, undoable) but is visually hidden.

**When to use:** When you need to hide lines visually while keeping them in the document model (unlike Decoration.replace which changes cursor behavior).

**Example:**
```typescript
// Source: Pattern from sectionLockExtension.ts buildLockedDecorations()
function buildHideDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const fence = findCodeFence(state);
  if (!fence) return builder.finish();

  const hideLine = Decoration.line({ class: 'lc-fence-hidden' });

  // Hide all fence lines: opener through closer (inclusive)
  for (let i = fence.openerLine; i <= fence.closerLine; i++) {
    builder.add(state.doc.line(i).from, state.doc.line(i).from, hideLine);
  }
  return builder.finish();
}
```

**CSS:**
```css
/* Hide fence lines — content stays in doc model */
.cm-editor .lc-fence-hidden {
  height: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  line-height: 0 !important;
}
```

### Pattern 3: Child EditorView Creation with Python LanguageSupport

**What:** Create a standalone EditorView with minimal extensions for code editing.

**When to use:** When the registry needs a new child editor for a file not yet in the cache.

**Example:**
```typescript
// Source: CM6 split-view example + @codemirror/lang-python docs
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';

function createChildEditor(content: string, parent: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [
      python(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      drawSelection(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      // Theme: darker background matching Obsidian code blocks
      EditorView.theme({
        '&': {
          backgroundColor: 'var(--code-background, var(--background-secondary))',
          borderRadius: '4px',
          padding: '8px 0',
        },
        '.cm-content': {
          fontFamily: 'var(--font-monospace)',
          fontSize: '14px',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          borderRight: 'none',
        },
      }),
    ],
  });

  return new EditorView({ state, parent });
}
```

### Pattern 4: Cursor Redirect via TransactionFilter

**What:** A transactionFilter on the parent EditorView that detects when the cursor lands in the hidden fence zone and redirects focus to the child editor.

**When to use:** D-06 — user arrow-down from above fence should smoothly enter child editor.

**Example:**
```typescript
// Source: Modeled on sectionLockExtension.ts transactionFilter
EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr;
  const sel = tr.selection;
  if (!sel.ranges.every(r => r.head === r.anchor)) return tr; // only collapsed

  const fence = findCodeFence(tr.state);
  if (!fence) return tr;

  const fenceFrom = tr.state.doc.line(fence.openerLine).from;
  const fenceTo = tr.state.doc.line(fence.closerLine).to;
  const head = sel.main.head;

  if (head >= fenceFrom && head <= fenceTo) {
    // Cursor landed in hidden fence zone — redirect to child
    const childView = registry.get(filePath);
    if (childView) {
      // Defer focus to next microtask (avoid re-entrancy in filter)
      queueMicrotask(() => childView.focus());
    }
    // Snap cursor to just before the fence (prevent it resting in hidden zone)
    const prevHead = tr.startState.selection.main.head;
    const snapTarget = prevHead < fenceFrom ? fenceFrom - 1 : fenceTo + 1;
    return {
      ...tr,
      selection: EditorSelection.cursor(Math.max(0, snapTarget)),
    };
  }
  return tr;
});
```

### Pattern 5: LRU Registry with Cleanup

**What:** A Map-based cache with LRU eviction at cap=5 and full cleanup on plugin unload.

**Example:**
```typescript
// Source: Standard LRU pattern
interface RegistryEntry {
  view: EditorView;
  lastAccess: number;
}

class ChildEditorRegistry {
  private readonly cache = new Map<string, RegistryEntry>();
  private readonly cap: number;

  constructor(cap = 5) { this.cap = cap; }

  get(key: string): EditorView | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    entry.lastAccess = Date.now();
    return entry.view;
  }

  set(key: string, view: EditorView): void {
    this.cache.set(key, { view, lastAccess: Date.now() });
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.cap) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.lastAccess < oldestTime) {
          oldestTime = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const entry = this.cache.get(oldestKey)!;
        entry.view.destroy();
        this.cache.delete(oldestKey);
      }
    }
  }

  destroyAll(): void {
    for (const [, entry] of this.cache) {
      entry.view.destroy();
    }
    this.cache.clear();
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.view.destroy();
      this.cache.delete(key);
    }
  }
}
```

### Anti-Patterns to Avoid

- **Comparing fenceContent in `eq()`:** Causes widget rebuild on every parent doc change. Widget identity must be STABLE (file path only). [CITED: NESTED-EDITOR-PITFALLS.md Pitfall 1]
- **Destroying child EditorView in widget `destroy()`:** Loses cursor/scroll/undo state whenever parent rebuilds decorations (any docChanged transaction). [CITED: NESTED-EDITOR-PITFALLS.md Pitfall 1]
- **Using `Decoration.replace` instead of widget+CSS:** Live Preview "unfolds" replace decorations when cursor approaches — causes thrashing. [CITED: NESTED-EDITOR-PITFALLS.md Pitfall 5, CONTEXT.md D-04]
- **Creating child EditorView without `@codemirror/language` external:** The `python()` function imports from `@codemirror/language` which is external — it MUST resolve from Obsidian's runtime. Verify esbuild config keeps it external. [VERIFIED: esbuild.config.mjs]
- **Setting `parent` on child EditorView at creation then re-parenting:** Create with `parent` set to the widget container directly in `toDOM()`. For re-attach, just `container.appendChild(childView.dom)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Python syntax highlighting | Custom regex-based highlighter | `python()` from `@codemirror/lang-python` | Lezer grammar handles all edge cases; ~57KB bundled; already in deps |
| Syntax highlight styling | Custom CSS class mapping | `syntaxHighlighting(defaultHighlightStyle)` from `@codemirror/language` | Uses Obsidian's runtime-provided highlight infrastructure; theme-aware |
| Code fence detection | New fence finder | `findCodeFence()` from `codeActionsEditorExtension.ts` | SSoT established in Phase 5.1; reused by section lock; proven reliable |
| Line decoration pattern | Manual DOM hiding | `Decoration.line({ class })` + CSS | Proven pattern from `sectionLockExtension.ts:buildLockedDecorations()` |
| Key bindings for child | Custom keydown handler | `keymap.of([...defaultKeymap, ...historyKeymap])` | CM6 standard keymap covers all basic editing; add `indentWithTab` in Phase 15 |

## Common Pitfalls

### Pitfall 1: Widget Destruction Loses Child State
**What goes wrong:** CM6 destroys and recreates widget DOM on any parent docChanged transaction when `eq()` returns false or `updateDOM()` is unavailable/returns false.
**Why it happens:** The StateField calls `buildDecorations()` on every doc change. If the new widget differs from old (per `eq()`), CM6 tears down old DOM.
**How to avoid:** Make `eq()` compare ONLY `filePath` (immutable). Implement `destroy()` to detach DOM but NOT destroy the EditorView. Store child views in plugin-level registry.
**Warning signs:** Typing in `## Notes` causes code editor to lose cursor/scroll position.

### Pitfall 2: CSS Line Hiding in Live Preview
**What goes wrong:** Live Preview may render differently — line decorations might not fully hide content if Obsidian's Live Preview CSS overrides them.
**Why it happens:** Live Preview has its own rendering pipeline that can inject additional elements or override `height` properties on `.cm-line`.
**How to avoid:** Test in both Source Mode and Live Preview. Use `!important` on the CSS hide rule. If Live Preview proves problematic, it can slip to Phase 17 per CONTEXT.md deferred items. Source Mode is non-negotiable.
**Warning signs:** Fence lines visible as thin slivers or with leftover spacing.

### Pitfall 3: Extension Registration Order
**What goes wrong:** The nested editor extension's transactionFilter conflicts with section lock's transactionFilter if ordered incorrectly.
**Why it happens:** Both filters inspect selection. If section lock snaps cursor BEFORE nested editor sees it, the redirect never fires.
**How to avoid:** Register nested editor extension BETWEEN code-actions and section-lock (per CONTEXT canonical_refs). The nested editor's filter must process first within the fence zone.
**Warning signs:** Arrow-down into fence zone snaps cursor PAST the fence instead of redirecting to child.

### Pitfall 4: `@codemirror/language` Resolution at Runtime
**What goes wrong:** `python()` imports `syntaxHighlighting`, `LRLanguage`, etc. from `@codemirror/language`. If esbuild somehow bundles a second copy instead of using the external, there are runtime errors (duplicate state keys, incompatible objects).
**Why it happens:** `@codemirror/language` is in the external list in `esbuild.config.mjs`. But if `@codemirror/lang-python`'s `import from '@codemirror/language'` isn't resolved as external, esbuild may inline it.
**How to avoid:** Verify esbuild treats transitive imports from bundled packages as external when the target is in the external list. Test with `npm run build` and grep `main.js` for duplicate `@codemirror/language` symbols.
**Warning signs:** Build output includes `@codemirror/language` code; runtime error about facet not found.

### Pitfall 5: Focus/Click Routing
**What goes wrong:** Clicking inside the child editor may not gain focus if the parent EditorView intercepts the mousedown event.
**Why it happens:** The child editor DOM is inside the parent's widget. The parent's event handling may prevent child from receiving focus.
**How to avoid:** `ignoreEvent()` returns `false` on the widget — this tells the parent CM6 to NOT ignore events from the widget DOM. Also ensure the child DOM has proper tabindex.
**Warning signs:** Clicking in child editor doesn't show cursor; child never gains focus.

### Pitfall 6: Memory Leak on File Close
**What goes wrong:** User closes a note tab but the child EditorView remains in registry with event listeners and DOM references.
**Why it happens:** No event listener for file-close removes the registry entry.
**How to avoid:** Listen for `workspace.on('file-close')` or check during `file-open` if the previous file's entry should be preserved (LRU handles this naturally). Plugin `onunload()` calls `registry.destroyAll()`.
**Warning signs:** Memory profiler shows growing EditorView count over time.

## Code Examples

### Complete StateField with Two Decoration Layers

```typescript
// Source: Derived from codeActionsEditorExtension.ts buildCodeActionsEditorExtension()
import { StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { findCodeFence } from './codeActionsEditorExtension';

// Two DecorationSets combined: line-hide + block widget
export function buildNestedEditorExtension(plugin: PluginHost): Extension {
  const registry = plugin.childEditorRegistry;

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildNestedDecorations(state, plugin, registry);
    },
    update(old, tr) {
      if (tr.docChanged || /* mode flip */ false) {
        return buildNestedDecorations(tr.state, plugin, registry);
      }
      return old.map(tr.changes);
    },
    provide(f) {
      return EditorView.decorations.from(f);
    },
  });

  return [field, /* transactionFilter for cursor redirect */];
}

function buildNestedDecorations(
  state: EditorState,
  plugin: PluginHost,
  registry: ChildEditorRegistry,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Gate: lc-slug frontmatter
  const file = state.field(editorInfoField)?.file;
  if (!file) return builder.finish();
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  if (!fm?.['lc-slug']) return builder.finish();

  const fence = findCodeFence(state);
  if (!fence) return builder.finish();

  // 1. Line-hide decorations (must come first — lower position in RangeSet)
  const hideLine = Decoration.line({ class: 'lc-fence-hidden' });
  for (let i = fence.openerLine; i <= fence.closerLine; i++) {
    builder.add(state.doc.line(i).from, state.doc.line(i).from, hideLine);
  }

  // 2. Block widget anchored at opener line end (side: 1 = renders after)
  const fenceContent = extractFenceBody(state, fence);
  const anchor = state.doc.line(fence.openerLine).to;
  builder.add(anchor, anchor, Decoration.widget({
    widget: new NestedEditorWidget(file.path, registry, fenceContent),
    block: true,
    side: 1,
  }));

  return builder.finish();
}

function extractFenceBody(
  state: EditorState,
  fence: { openerLine: number; closerLine: number },
): string {
  // Body = lines between opener and closer (exclusive of both)
  if (fence.closerLine - fence.openerLine <= 1) return '';
  const from = state.doc.line(fence.openerLine + 1).from;
  const to = state.doc.line(fence.closerLine - 1).to;
  return state.doc.sliceString(from, to);
}
```

### Registration in main.ts

```typescript
// Between code-actions and section-lock (per CONTEXT canonical_refs)
// Step 6f — code actions
this.registerEditorExtension(buildCodeActionsEditorExtension(this));
// Step 6f-nested — NEW: nested editor
this.registerEditorExtension(buildNestedEditorExtension(this));
// Step 6f-bis — section lock
this.registerEditorExtension(buildSectionLockExtension(this));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Decoration.replace for widget embedding | Decoration.widget + CSS hide | Phase 13 architecture (NESTED-EDITOR-PITFALLS.md) | Avoids Live Preview "unfold" storms |
| Widget owns child lifecycle | Registry decouples lifecycle from widget | Phase 13 architecture | Prevents state loss on parent transaction |
| Heuristic keymaps in parent (Path A) | Nested EditorView (Path B) | v1.2 roadmap rewrite 2026-05-21 | Full LanguageSupport instead of regex heuristics |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Decoration.line` with `height: 0` CSS effectively hides lines in both Source Mode and Live Preview | Architecture Patterns, Pattern 2 | Lines may show as thin slivers in Live Preview; need empirical test. Fallback: `display: none` or `max-height: 0` |
| A2 | `@codemirror/language` imported transitively from bundled `@codemirror/lang-python` resolves to the external (Obsidian-provided) instance | Pitfall 4 | Duplicate symbols at runtime; fix by verifying esbuild output |
| A3 | `ignoreEvent() { return false }` is sufficient for child EditorView to receive focus/click events | Pitfall 5 | Child may not gain focus; fix with explicit event stopPropagation |
| A4 | Obsidian's `HyperMD-codeblock-bg` class provides the darker background color via `var(--code-background)` | Styling | Wrong variable name; inspect Obsidian DOM at runtime to confirm |
| A5 | `queueMicrotask` in transactionFilter is safe for deferring `childView.focus()` | Pattern 4 | May cause flicker; alternative: use `requestAnimationFrame` |

## Open Questions

1. **CSS line-hiding effectiveness in Live Preview**
   - What we know: Source Mode applies Decoration.line classes reliably (proven by section lock heading hide). Live Preview has its own rendering pipeline.
   - What's unclear: Whether `height: 0` on `.cm-line` works in Live Preview's widget rendering context.
   - Recommendation: Implement for Source Mode first (non-negotiable). Test Live Preview empirically. If broken, defer LP fix to Phase 17.

2. **Child EditorView `parent` vs DOM re-attach**
   - What we know: `new EditorView({ parent: container })` appends `view.dom` to `container`. For re-attach, `container.appendChild(view.dom)` works.
   - What's unclear: Whether a previously-mounted EditorView's DOM survives `removeChild` + `appendChild` without losing internal state (MutationObserver callbacks).
   - Recommendation: Test empirically. CM6's EditorView is designed for DOM mobility (the split-view example creates views without parent).

3. **Widget anchor position for hiding + widget coexistence**
   - What we know: CodeActionsWidget anchors at `closerLine.to` with `side: 1`. The nested editor widget should anchor at `openerLine.to` with `side: 1` to render after the opener line.
   - What's unclear: Whether two widgets from different StateFields at different anchor positions render in correct visual order when fence lines are hidden.
   - Recommendation: Build ordering ensures consistency. If problematic, use `Decoration.set([...], true)` with explicit ordering.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@codemirror/lang-python` | Child editor Python highlighting | Yes | 6.2.1 | — |
| `@lezer/python` | Transitive (Python Lezer grammar) | Yes | 1.1.18 | — |
| `@codemirror/language` (external) | syntaxHighlighting, LanguageSupport | Yes (runtime) | Per Obsidian host | — |
| `@codemirror/view` (external) | EditorView, WidgetType, Decoration | Yes (runtime) | Per Obsidian host | — |
| `@codemirror/state` (external) | EditorState, StateField | Yes (runtime) | Per Obsidian host | — |
| `@codemirror/commands` (external) | defaultKeymap, history | Yes (runtime) | Per Obsidian host | — |
| vitest | Unit tests | Yes | 4.1.5 | — |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/main/nestedEditorExtension.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | Python fence renders child EditorView with syntax highlighting | manual (needs Obsidian runtime) | — | N/A |
| SC-2 | Widget mounted via Decoration.widget({ block: true }) + CSS line hide | unit | `npx vitest run tests/main/nestedEditorExtension.test.ts -t "decoration"` | Wave 0 |
| SC-3 | Registry preserves child state across note switches | unit | `npx vitest run tests/main/childEditorRegistry.test.ts` | Wave 0 |
| SC-4 | Fresh editor on reopen; clean destroy on unload | unit | `npx vitest run tests/main/childEditorRegistry.test.ts -t "destroy"` | Wave 0 |
| SC-5 | Section lock + code-actions + nested editor coexist | integration (Obsidian) | — | N/A |

### Wave 0 Gaps
- [ ] `tests/main/nestedEditorExtension.test.ts` — covers decoration building, fence-hide logic, widget eq() stability
- [ ] `tests/main/childEditorRegistry.test.ts` — covers LRU eviction, get/set/delete, destroyAll
- [ ] `tests/main/childEditorFactory.test.ts` — covers EditorView creation with correct extensions

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | Child editor is local-only; no network input |
| V6 Cryptography | No | — |

No security concerns for Phase 13 — the child editor is entirely local (no network, no eval, no innerHTML). Content is user-authored code in vault files.

## Sources

### Primary (HIGH confidence)
- CM6 official docs: WidgetType API (`toDOM`, `destroy`, `eq`, `updateDOM`, `estimatedHeight`, `ignoreEvent`) — codemirror.net/docs/ref/#view.WidgetType
- CM6 official docs: EditorView constructor (state, parent, dispatch) — codemirror.net/docs/ref/#view.EditorView.constructor
- CM6 split-view example: syncAnnotation pattern, shared document — codemirror.net/examples/split/
- CM6 official docs: LanguageSupport class, python() return type — codemirror.net/docs/ref/#language.LanguageSupport
- Codebase: `src/main/codeActionsEditorExtension.ts` — CodeActionsWidget block widget pattern, findCodeFence SSoT, StateField architecture
- Codebase: `src/main/sectionLockExtension.ts` — Decoration.line pattern, transactionFilter cursor-snap, changeFilter gates
- Codebase: `src/main.ts:787-797` — Extension registration order
- Codebase: `esbuild.config.mjs` — External list (confirms `@codemirror/language`, `@codemirror/autocomplete`, `@lezer/common`, `@lezer/highlight` are runtime-provided)
- Codebase: `package.json` — `@codemirror/lang-python@^6.2.1` already in dependencies
- `.planning/research/NESTED-EDITOR-PITFALLS.md` — 18 pitfalls analyzed; Option B (widget+CSS) recommended

### Secondary (MEDIUM confidence)
- CM6 docs: syntaxHighlighting + defaultHighlightStyle setup — codemirror.net/docs/ref/#language.syntaxHighlighting
- Obsidian CSS convention: `var(--code-background)` for fenced code block background — inferred from Obsidian theming docs and community plugins

### Tertiary (LOW confidence)
- Obsidian Live Preview rendering behavior for Decoration.line CSS overrides — needs empirical verification [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in node_modules and esbuild config
- Architecture: HIGH — derived from proven codebase patterns + official CM6 docs
- Pitfalls: HIGH — exhaustive analysis in NESTED-EDITOR-PITFALLS.md already completed
- CSS hiding in Live Preview: MEDIUM — Source Mode proven; LP needs empirical test

**Research date:** 2026-05-21
**Valid until:** 2026-06-21 (stable — CM6 API is mature; Obsidian plugin API rarely changes)
