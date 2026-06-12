---
status: diagnosed
trigger: "Phase 20 UAT T8 cosmetic — v1.3 widget action row renders inside the grey-backgrounded codeblock container instead of as a sibling below the code editor"
created: 2026-05-31
updated: 2026-05-31
goal: find_root_cause_only
---

## Current Focus

hypothesis: confirmed — `mountActionRow` appends `.leetcode-code-actions` to `ctl.container` (the same element painted grey by `.cm-editor .lc-nested-editor { background: var(--code-background, ...) }`); to escape the grey region the action row must be a sibling of an *inner* wrapper that owns the grey paint, not a sibling of `.cm-editor` inside the painted container.
test: read DOM construction, CSS rule, and v1.2 reference path
expecting: confirm hierarchy mismatch and identify exact line numbers
next_action: hand diagnosis to executor; do not patch in this session

## Symptoms

expected: action row floats below the grey codeblock on the parent note background (matches v1.2 Reading-Mode where `.leetcode-code-actions` sits AFTER `<pre>` as a sibling — `pre + .leetcode-code-actions` in CSS)
actual: action row sits INSIDE the grey-backgrounded `.lc-nested-editor` container, painted on the grey surface
errors: none — purely visual regression
reproduction: open a LeetCode `lc-slug` note in v1.3 widget mode (`useInlineWidget=true`); the action row visibly shares the codeblock's grey background instead of floating below it
started: Phase 20 Plan 20-02 (ACTION-01) when widget mount factory began appending `mountActionRow(...)` directly into the same element that wears the grey-background CSS

## Eliminated

(no hypotheses eliminated — single linear DOM/CSS chain; first hypothesis confirmed by direct file reads)

## Evidence

- timestamp: 2026-05-31 (read)
  checked: src/widget/widgetActions.ts:145
  found: `ctl.container.appendChild(row);` — the action row is appended to the SAME element passed in as `ctl.container`.
  implication: action row becomes a child of whichever element is `ctl.container`, not a sibling of any sub-wrapper.

- timestamp: 2026-05-31 (read)
  checked: src/widget/WidgetController.ts:929-937 + 1002
  found: `const container = document.createElement('div'); container.className = 'lc-nested-editor HyperMD-codeblock lc-leetcode-solve'; ... host.appendChild(container);` then `const view = new EditorView({ state, parent: container });`. There is NO intermediate wrapper — the `.cm-editor` is appended directly into the `.lc-nested-editor` container.
  implication: in the resulting DOM, `.cm-editor` and `.leetcode-code-actions` are SIBLINGS, both children of `.lc-nested-editor`. The two siblings share the grey background paint that `.lc-nested-editor` carries (see styles.css:1934).

- timestamp: 2026-05-31 (read)
  checked: src/widget/WidgetController.ts:1209-1227
  found: `mountLeetCodeWidget` calls `mountActionRow(ctl, file, ctl.currentSlug, ownerDoc)` and stores `mounted.row` on `ctl.actionRow`. The `ctl.container` passed in is the `.lc-nested-editor` div from line 929.
  implication: confirms the row's append target is the painted container.

- timestamp: 2026-05-31 (read)
  checked: styles.css:1931-1938
  found: the EXACT grey-background selector — `.cm-editor .lc-nested-editor { background: var(--code-background, var(--background-secondary)); border-radius: 4px; padding: 8px 0; }`
  implication: this is the load-bearing grey paint. Any direct child of `.lc-nested-editor` (when its ancestor is `.cm-editor`, i.e. Live Preview) will visually sit on the grey surface.

- timestamp: 2026-05-31 (read)
  checked: styles.css:943-955 + 1145-1154
  found: action row's own rules are layout-only (`display: flex; justify-content: space-between; margin-top: 10px; margin-bottom: 8px; width: 100%`). No `background: transparent` reset. The row inherits whatever surface its parent renders.
  implication: there is no defensive transparent-bg rule to compensate; the row will read whatever surface the parent paints. Fix needs to either move the row out of the painted region OR move the paint off `ctl.container`.

- timestamp: 2026-05-31 (read)
  checked: src/main/codeActionsPostProcessor.ts:17-23 (v1.2 Reading-Mode reference)
  found: `pre.insertAdjacentElement('afterend', row);` — v1.2 Reading mode places the row as `<pre>`'s NEXT SIBLING (the `<pre>` is what carries the codeblock background; the row sits beside it on the note's normal background). Reinforced by the dedicated CSS rule at styles.css:1152 — `.markdown-rendered pre + .leetcode-code-actions { margin-top: -4px; }` which only matches when the row is a direct sibling of `<pre>`.
  implication: v1.2 visual contract IS "row floats outside the codeblock surface"; the v1.3 widget mount accidentally violated it by appending to the painted container.

- timestamp: 2026-05-31 (read)
  checked: src/main/codeBlockButtonRow.ts:33-99 (shared row factory)
  found: factory creates `<div class="leetcode-code-actions">…</div>` with no background of its own. It is reused VERBATIM by both v1.2 reading-mode path and v1.3 widget path (per widgetActions.ts:3-5 reuse contract).
  implication: the row element is innocent — the bug is purely about WHERE the widget mount appends it. The factory itself does not need to change.

- timestamp: 2026-05-31 (read)
  checked: src/main/nestedEditorExtension.ts:114
  found: the v1.2 nested-editor path also constructs `container.className = 'lc-nested-editor HyperMD-codeblock'` — but in v1.2 Live Preview the action row is supplied by a SEPARATE CodeActionsWidget (`src/main/codeActionsEditorExtension.ts`) decorated as a *block widget below* the fence, not as a child of the nested-editor container. v1.3 collapsed those two surfaces into one container without preserving the sibling separation.
  implication: this is a Phase 20 architectural carry-over miss — the v1.2 design isolated "fence body container" from "action row mount point"; v1.3's mountLeetCodeWidget conflated them.

- timestamp: 2026-05-31 (read)
  checked: WidgetController buildExtensions theme block (src/widget/WidgetController.ts:837-851)
  found: the inner CM6 EditorView already declares `'&': { background: 'var(--code-background, var(--background-secondary))', borderRadius: '4px', padding: '8px 0' }` — i.e., the `.cm-editor` ROOT itself paints grey from a CM6 theme. AND `.cm-editor .lc-nested-editor .cm-editor { background: transparent }` (styles.css:1939-1942) explicitly resets that to transparent INSIDE the nested-editor wrapper, deferring the paint to `.lc-nested-editor` instead.
  implication: the grey paint is intentionally lifted UP from `.cm-editor` to `.lc-nested-editor` in v1.2's design. To fix T8, the paint must be lifted DOWN one level — from `.lc-nested-editor` to a NEW inner wrapper that sits between `.lc-nested-editor` and `.cm-editor`. The action row stays a child of the outer `.lc-nested-editor` and ends up as a sibling of (not inside) the newly-painted inner wrapper.

## Resolution

### root_cause

Two coupled facts produce the regression:

1. **DOM construction.** `mountLeetCodeWidget` (src/widget/WidgetController.ts:929-1002) creates ONE container — `<div class="lc-nested-editor HyperMD-codeblock lc-leetcode-solve">` — and appends BOTH the `.cm-editor` (line 1002, via `new EditorView({ parent: container })`) AND the `.leetcode-code-actions` row (line 1211 `mountActionRow(ctl, …)` → widgetActions.ts:145 `ctl.container.appendChild(row)`) into that same container.

2. **CSS paint location.** styles.css:1934 — `.cm-editor .lc-nested-editor { background: var(--code-background, var(--background-secondary)); border-radius: 4px; padding: 8px 0; }` — paints the grey background ON the container itself (not on a child wrapper). `.cm-editor .lc-nested-editor .cm-editor { background: transparent }` at styles.css:1939 then resets the inner `.cm-editor` to transparent so it adopts the parent's grey.

The action row inherits the same grey surface because it is a sibling of `.cm-editor` inside the painted `.lc-nested-editor`.

The v1.2 visual target (Reading-Mode path at src/main/codeActionsPostProcessor.ts:17-23) instead inserts the row as `<pre>`'s `afterend` sibling — outside the codeblock paint surface entirely.

### fix

**Recommended approach: introduce an inner `.leetcode-widget-codeblock` wrapper around `.cm-editor`, move the grey paint to that wrapper, and let `mountActionRow` continue to append to the outer `.lc-nested-editor` (which becomes a transparent shell).**

Target DOM after fix:

```
<div class="lc-nested-editor HyperMD-codeblock lc-leetcode-solve" data-pane-state="active">
  <div class="leetcode-widget-codeblock">         <!-- NEW wrapper, owns grey paint -->
    <div class="cm-editor">…</div>                <!-- existing CM6 view -->
  </div>
  <div class="leetcode-code-actions">…</div>      <!-- sibling of inner wrapper, on note bg -->
</div>
```

Why this shape (over alternatives):

- **Why not append the row OUTSIDE `ctl.container`?** The `.lc-nested-editor` has `data-pane-state` styling, lives inside the post-processor's `containerEl`, and is the unit Obsidian re-renders. Moving the row outside breaks the parking-lot lifecycle (LeetCodeWidgetRenderChild parks `controller.container` — the action row would be orphaned) and the multi-pane overlay anchoring (the overlay is positioned `absolute; inset:0` against the container; pulling the row out doesn't help because the overlay would still cover only the part that contains the editor).
- **Why not just swap the paint selector to a child class?** Same target DOM — the inner wrapper is the cleanest expression of that swap.
- **Why not make `.leetcode-code-actions` declare `background: transparent`?** Defeats the visual goal. The row should sit on the NOTE background (light/dark theme `--background-primary`), not on a transparent overlay over grey.

### specific_code_changes

**A. `src/widget/WidgetController.ts:929-937` — DOM construction in `mountLeetCodeWidget`**

Current:
```ts
const container = document.createElement('div');
container.className = 'lc-nested-editor HyperMD-codeblock lc-leetcode-solve';
container.setAttribute('data-pane-state', 'active');
host.appendChild(container);
```

Add an inner wrapper between `container` and the `EditorView` mount. Sketch:
```ts
const container = document.createElement('div');
container.className = 'lc-nested-editor HyperMD-codeblock lc-leetcode-solve';
container.setAttribute('data-pane-state', 'active');
host.appendChild(container);

const codeblockWrap = document.createElement('div');
codeblockWrap.className = 'leetcode-widget-codeblock';
container.appendChild(codeblockWrap);
```

**B. `src/widget/WidgetController.ts:1002` — `EditorView` parent**

Current: `const view = new EditorView({ state, parent: container });`
Change parent to the new inner wrapper: `parent: codeblockWrap`.

**C. `styles.css:1934-1938` — grey-paint selector**

Current:
```css
.cm-editor .lc-nested-editor {
  background: var(--code-background, var(--background-secondary));
  border-radius: 4px;
  padding: 8px 0;
}
```

Move paint + radius + padding to the new inner wrapper, and clear `.lc-nested-editor` to transparent so the action row falls onto the note background:
```css
.cm-editor .lc-nested-editor {
  /* shell — transparent so .leetcode-code-actions sits on note background */
  background: transparent;
}
.cm-editor .lc-nested-editor .leetcode-widget-codeblock {
  background: var(--code-background, var(--background-secondary));
  border-radius: 4px;
  padding: 8px 0;
}
```

The descendant selectors immediately below — `.cm-editor .lc-nested-editor .cm-editor`, `.cm-content`, `.cm-gutters`, `.cm-activeLine`, `.cm-scroller` (styles.css:1939-1960) — keep matching because `.cm-editor` is now a grandchild of `.lc-nested-editor` rather than a child. **Verify those selectors still resolve** — they use the descendant combinator (space), so the depth change is benign. No edit needed there.

**D. `styles.css:2107-2126` — multi-pane overlay anchoring**

The peer-overlay rule `.lc-nested-editor[data-pane-state="peer"] > .lc-takeover-overlay { position: absolute; inset: 0; … }` anchors the overlay to `.lc-nested-editor`. After the fix, the outer `.lc-nested-editor` will be taller than the painted region (it now includes the action row as a child too). UAT-acceptable behavior is for the overlay to cover the codeblock + action row together (the user takes over the whole widget surface). **Confirm visually** — but no code change is required; the overlay `inset: 0` continues to span the full container.

**E. `src/widget/widgetActions.ts:145` — `mountActionRow` append target**

NO CHANGE. The function still appends to `ctl.container` (the OUTER `.lc-nested-editor`), which after the fix is the transparent shell. The row naturally lands as a sibling of `.leetcode-widget-codeblock`.

**F. Optional — defensive `.leetcode-code-actions` reset**

If a community theme paints `.lc-nested-editor` from outside, add a belt-and-suspenders rule near styles.css:943:
```css
.lc-nested-editor > .leetcode-code-actions {
  background: transparent;
}
```
Not load-bearing — only matters if a downstream theme rule overrides. Skip unless QA finds a theme regression.

### v1.2_reference

The visual target is v1.2 Reading-Mode (src/main/codeActionsPostProcessor.ts:17-23). DOM there:
```
<div class="markdown-rendered">
  …<pre><code>…</code></pre>
  <div class="leetcode-code-actions">…</div>   <!-- sibling AFTER <pre> -->
  …
</div>
```
The `<pre>` carries the codeblock paint; the row floats on the note background. Confirmed by the dedicated negative-margin compensator at styles.css:1152 — `.markdown-rendered pre + .leetcode-code-actions { margin-top: -4px; }` which is only valid when the row is a direct sibling of `<pre>`.

The v1.3 widget after this fix mirrors that hierarchy structurally:
- v1.2 Reading: `<pre>` (painted) + `.leetcode-code-actions` (transparent, sibling).
- v1.3 widget: `.leetcode-widget-codeblock` (painted) + `.leetcode-code-actions` (transparent, sibling), wrapped together inside `.lc-nested-editor` (transparent shell).

### files_changed

(diagnosis-only — no code touched in this session)

Recommended touch list for the implementing executor:
- src/widget/WidgetController.ts:929-937, 1002 — DOM construction + EditorView parent
- styles.css:1934-1938 — grey-paint selector swap
- (optional) styles.css:943 area — defensive transparent reset on `.lc-nested-editor > .leetcode-code-actions`

### verification

(empty — diagnosis-only)
