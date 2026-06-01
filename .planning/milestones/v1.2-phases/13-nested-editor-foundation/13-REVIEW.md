---
phase: 13-nested-editor-foundation
reviewed: 2026-05-21T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/main/childEditorRegistry.ts
  - src/main/childEditorFactory.ts
  - src/main/nestedEditorExtension.ts
  - src/main.ts
  - styles.css
findings:
  critical: 4
  warning: 3
  info: 3
  total: 10
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-21
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 13 introduces a nested CM6 `EditorView` inside the `## Code` fence region via a `WidgetType`, an LRU `ChildEditorRegistry`, and a `transactionFilter` that redirects cursor entry into the hidden zone. The infrastructure is architecturally sound and the registry lifecycle (create, evict, destroyAll on unload) is correctly wired. However, four blockers were found: the child editor content is never synced back from parent-doc edits (permanent stale-content divergence), `destroy()` uses a fragile DOM query instead of the cached view reference (silent orphan risk on CM6 upgrades), the `StateField` update path does not force a rebuild on file-switch transactions (wrong child displayed after navigation), and moving the `EditorView` DOM between containers via `appendChild` is not supported by CM6 (layout/event-listener corruption). Three warnings cover a hardcoded font size that ignores user settings, duplicated gate logic, and a missing user-event bypass in the update handler.

---

## Critical Issues

### CR-01: Child editor content permanently diverges from vault after any doc edit

**File:** `src/main/nestedEditorExtension.ts:70-73`
**Issue:** `NestedEditorWidget.eq()` returns `true` whenever `filePath` matches, explicitly ignoring `fenceContent`. CM6 only calls `toDOM()` on widget rebuild; once the widget is stable, the child `EditorView` is never updated with new fence content. Any vault-layer write (e.g., `app.vault.process(...)`, `app.fileManager.processFrontMatter(...)`, or the `copyToCode.ts` path mentioned in CLAUDE.md) modifies the parent document but cannot reach the child editor. The child editor becomes the authoritative display but its content silently diverges from the vault file. Users editing in the child editor also have no path to flush edits back to the parent doc (no `updateListener` dispatching back to the parent `EditorView`).
**Category:** bug
**Fix:** Add a content-sync `updateListener` to the child editor that writes changes back to the parent doc via `app.vault.process()`, and add a mechanism to push parent-doc fence content into the child editor when the parent doc changes (e.g., call `childView.dispatch({ changes: { from: 0, to: childView.state.doc.length, insert: newFenceContent } })` with a `'leetcode.sync'` userEvent annotation when `buildNestedDecorations` detects the fence content has changed). Without this bidirectional sync, the nested editor is a cosmetic overlay that can corrupt user data.

---

### CR-02: Moving EditorView DOM via appendChild is unsupported by CM6 — layout and event corruption

**File:** `src/main/nestedEditorExtension.ts:85-88`
**Issue:** The re-attach path in `toDOM()` calls `container.appendChild(childView.dom)` to move the cached child `EditorView` DOM into a new container element. CM6's `EditorView` does not support reparenting its root DOM node after construction — the view holds internal references to its DOM geometry (bounding rects, scroll positions, ResizeObserver registrations, and MutationObserver callbacks) that are computed relative to the original mount point. After `appendChild` moves the DOM, the view's internal layout cache is stale, scroll synchronization breaks, and MutationObserver/ResizeObserver callbacks may fire against a detached parent. Additionally, CM6 registers event listeners on the view's DOM root; moving the DOM severs the connection to the parent editor's event dispatch chain, so keyboard events in the child may not propagate correctly.
**Category:** bug
**Fix:** Instead of moving the DOM, always destroy and recreate the child editor on each `toDOM()` call — or restructure the lifecycle so the registry stores both the `EditorView` and a stable wrapper `<div>` that stays attached to the parent CM6 widget tree. The stable-wrapper approach: store `{ view, mount: HTMLDivElement }` in the registry; `toDOM()` returns the same `mount` div; CM6 keeps the same DOM node across widget-eq checks. This requires restructuring `ChildEditorRegistry` to store the mount element alongside the view.

---

### CR-03: `destroy()` uses querySelector('.cm-editor') — silently orphans child on class rename or nested editors

**File:** `src/main/nestedEditorExtension.ts:92-96`
**Issue:** `NestedEditorWidget.destroy()` finds the child editor DOM via `dom.querySelector('.cm-editor')`. This is wrong in two ways. First, the widget holds `this.registry` and `this.filePath` — it can look up `childView` directly and reference `childView.dom`. Second, any future CM6 version that renames the root class (already versioned: CM5 used `CodeMirror`, CM6 uses `cm-editor`) will silently skip the `removeChild`, leaving a detached container with a live `EditorView` still processing events and consuming memory. Third, if the `## Code` fence contains sub-fences or the child editor itself renders nested CM6 widgets, `querySelector` returns the first `.cm-editor` descendant which may not be the child root.
**Category:** bug
**Fix:**
```typescript
destroy(dom: HTMLElement): void {
  // Use the cached view reference directly — do NOT query by class name.
  const childView = this.registry.get(this.filePath);
  if (childView && childView.dom.parentElement === dom) {
    dom.removeChild(childView.dom);
  }
}
```

---

### CR-04: StateField.update does not rebuild on file switch — wrong child editor displayed after navigation

**File:** `src/main/nestedEditorExtension.ts:201-206`
**Issue:** The `StateField` update handler returns `old.map(tr.changes)` for all transactions where `tr.docChanged` is false. When a user navigates to a different file in the same editor leaf, Obsidian replaces the CM6 state; this triggers a reconfiguration transaction where `tr.reconfigured` is `true` but `tr.docChanged` may be `false`. In that case the stale `DecorationSet` from the previous file is carried forward via `.map()`. The previous file's `lc-fence-hidden` line decorations and child editor widget are applied to a document that is a different file, causing: (a) the wrong lines being hidden, (b) the child editor for the previous file's path being re-displayed, and (c) the `transactionFilter`'s `file.path` registry lookup hitting the old file path and focusing the wrong child editor.
**Category:** bug
**Fix:**
```typescript
update(old, tr) {
  // Force rebuild on reconfiguration (file switch) or doc change.
  if (tr.docChanged || tr.reconfigured) {
    return buildNestedDecorations(tr.state, plugin, registry);
  }
  return old.map(tr.changes);
},
```

---

## Warnings

### WR-01: Hardcoded `fontSize: '14px'` in childEditorFactory.ts ignores user font-size setting

**File:** `src/main/childEditorFactory.ts:53`
**Issue:** `EditorView.theme()` sets `'.cm-content': { fontSize: '14px' }`. CLAUDE.md §Conventions requires all theme values to use Obsidian CSS variables. A user who has configured a larger code font size in Obsidian settings will see the nested editor render at a fixed 14px instead of their preferred size. The CSS file correctly uses `var(--font-monospace)` (styles.css:1908) for the same selector, but the JS-injected theme rule competes with it and wins for `font-size` because `EditorView.theme()` generates a scoped class with higher specificity than the plain `.cm-editor .lc-nested-editor .cm-content` selector in the stylesheet.
**Fix:** Remove `fontSize` from the `EditorView.theme()` call entirely and rely on the CSS rule at `styles.css:1907-1910`, or replace it with `fontSize: 'var(--code-font-size, var(--font-ui-small))'`.

---

### WR-02: `lc-slug` gate logic copy-pasted in two places — divergence risk

**File:** `src/main/nestedEditorExtension.ts:149-155` and `src/main/nestedEditorExtension.ts:217-222`
**Issue:** The pattern:
```typescript
const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const slug = fm?.['lc-slug'];
if (typeof slug !== 'string' || slug.length === 0) return ...;
```
is copy-pasted verbatim into both `buildNestedDecorations` and the `transactionFilter` closure. Any future change to the gate condition (e.g., adding a second required frontmatter key, or changing the slug field name) must be applied in both places. The existing `codeActionsEditorExtension.ts` (line ~222) has a third copy of this same pattern.
**Fix:** Extract into a module-level helper:
```typescript
function isLcSlugNote(file: { path: string }, plugin: PluginHost): boolean {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown> | undefined;
  const slug = fm?.['lc-slug'];
  return typeof slug === 'string' && slug.length > 0;
}
```

---

### WR-03: StateField rebuilds full decoration set on every keystroke — no userEvent bypass

**File:** `src/main/nestedEditorExtension.ts:201-205`
**Issue:** Every `docChanged` transaction — including single-character keystrokes typed inside the child editor — triggers a complete re-run of `buildNestedDecorations`, which calls `findCodeFence` (full O(n) document scan) and `metadataCache.getFileCache`. Since the child editor dispatches its own transactions that propagate through the parent editor's state (or via the `updateListener` path once added per CR-01), this creates an O(n) scan per character typed. CLAUDE.md §Conventions notes that `'leetcode.*'` userEvent annotations are the bypass convention for plugin-internal CM6 dispatches.
**Fix:** Short-circuit on plugin-internal transactions:
```typescript
update(old, tr) {
  if (tr.docChanged || tr.reconfigured) {
    // Skip rebuild for plugin-internal syncs to avoid O(n) per keystroke.
    const userEvent = tr.annotation(Transaction.userEvent);
    if (typeof userEvent === 'string' && userEvent.startsWith('leetcode.')) {
      return old.map(tr.changes);
    }
    return buildNestedDecorations(tr.state, plugin, registry);
  }
  return old.map(tr.changes);
},
```

---

## Info

### IN-01: Hard-coded capacity `5` passed at call site with no named constant

**File:** `src/main.ts:788`
**Issue:** `new ChildEditorRegistry(5)` embeds the LRU cap as a magic literal. Users who work with more than 5 LeetCode problem notes in split panes will experience silent EditorView evictions mid-session. The default `cap = 5` in the constructor is also a magic number.
**Fix:** Define `const CHILD_EDITOR_REGISTRY_CAP = 5;` as a module-level constant in `childEditorRegistry.ts` and export it, then import it at the `main.ts` call site.

---

### IN-02: `estimatedHeight` uses fixed 20px per line regardless of user font size

**File:** `src/main/nestedEditorExtension.ts:99-103`
**Issue:** `return Math.max(lines * 20, 60)` assumes a 20px line height. Obsidian users with larger fonts or tighter line spacing will see incorrect initial scroll estimates, causing layout jank when the widget first renders.
**Fix:** The CM6-correct approach is to let the block widget report `-1` (unknown height) and rely on CM6's layout measurement pass. Alternatively, read `getComputedStyle` on a sample element, but that couples layout to measurement. Returning `-1` is the safest default until a measured value is available.

---

### IN-03: Redundant background declaration between JS theme and CSS file

**File:** `src/main/childEditorFactory.ts:45-48` and `styles.css:1899-1906`
**Issue:** `childEditorFactory.ts` applies `background: 'var(--code-background, var(--background-secondary))'` to the `&` (root) selector via `EditorView.theme()`. `styles.css` lines 1899-1903 apply the same `background` value to `.cm-editor .lc-nested-editor` and then override the inner `.cm-editor` to `transparent` at line 1904. The JS-theme background on the EditorView root (which also has class `cm-editor`) and the CSS background on the container `.lc-nested-editor` wrapper both paint the same region. The JS theme's scoped class typically wins over the CSS class due to specificity, so the CSS rule at line 1899 is effectively dead for the outer container when the EditorView theme is active.
**Fix:** Remove the `'&': { background: ... }` block from `EditorView.theme()` in `childEditorFactory.ts` and rely solely on `styles.css`. The JS theme should only contain editor-internal overrides (`.cm-content`, `.cm-gutters`) that cannot be targeted from outside the EditorView's shadow scope.

---

_Reviewed: 2026-05-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
