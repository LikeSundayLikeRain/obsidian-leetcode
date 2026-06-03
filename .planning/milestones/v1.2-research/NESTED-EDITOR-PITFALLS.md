# Nested CM6 EditorView in Obsidian: Pitfalls Analysis

**Domain:** Embedding a child CM6 EditorView inside a parent markdown editor's fenced code block (Decoration.replace widget)
**Researched:** 2026-05-21
**Overall confidence:** HIGH (based on CM6 official docs, Obsidian API docs, existing codebase analysis, and CM6 split-view example architecture)

---

## Architecture Context

The proposed approach:
1. Use `Decoration.replace({ widget: new FenceEditorWidget(...), block: true })` covering the fence body range (opener+1 through closer-1)
2. The widget's `toDOM()` instantiates a child `EditorView` with full `LanguageSupport` (python(), java(), etc.)
3. Edits in the child are synced back to the parent document via dispatched changes
4. External writes (vault.process) that change the fence content must propagate into the child

---

## CRITICAL PITFALLS (Severity: Catastrophic / High probability)

### Pitfall 1: Widget Destruction on Parent Transaction — Child State Loss

**What breaks:** CM6's decoration system can destroy and recreate widget DOM elements on ANY parent document transaction. When `eq()` returns `false` and `updateDOM()` returns `false` (or isn't implemented), CM6 calls `destroy()` on the old DOM and `toDOM()` to create a fresh element. The child EditorView's entire state — cursor position, scroll offset, undo history, unsaved mid-edit text, selection — is lost.

**How it happens in this codebase:** The existing `CodeActionsWidget.eq()` compares `plugin`, `file`, and `currentSlug`. If ANY of these change, the widget rebuilds. For the nested editor, even more triggers exist:
- Parent `docChanged` transactions (user edits `## Notes` below) trigger the StateField's `update()` method, which calls `buildDecorations()`. If the new DecorationSet has a widget at the same position but with different constructor args (e.g., different fence content hash), `eq()` returns false.
- `languageRefreshEffect` dispatches force a full `buildDecorations()` rebuild.
- `editorLivePreviewField` flip (Cmd-E) triggers a rebuild.

**Detection:** Child editor loses cursor/scroll on every keystroke in any other section of the note. User types in `## Notes`, and the code editor resets.

**Prevention strategy:**
1. **Decouple child EditorView lifecycle from widget lifecycle.** Maintain a `Map<string, EditorView>` (keyed by file path + fence identity) on the plugin instance. The widget's `toDOM()` attaches an existing child view to the new DOM container rather than creating one fresh.
2. **Implement `updateDOM()` returning `true`.** When `eq()` returns false but the child editor exists in the map, `updateDOM()` re-parents the child's `dom` element into the new container and returns `true`, preventing `destroy()` + `toDOM()` cycle.
3. **Make `eq()` stable.** The widget identity should compare only immutable properties (file path, fence structural identity) — NOT content hashes that change on every edit.
4. **Implement `destroy(dom)` to DETACH but not DESTROY the child.** Remove the child's DOM from the container but keep the EditorView alive in the map. Only truly destroy it on file close / plugin unload.

**Implementation phase:** Phase 1 (foundation) — this is the single most important architectural decision.

---

### Pitfall 2: Document Offset Drift — Sync Position Corruption

**What breaks:** The child editor operates on a document fragment (fence body only). The parent document has the full note. When text is inserted/deleted ABOVE the fence (user edits `## Notes` which is above `## Code` in the note... wait, `## Notes` is below `## Code` in this plugin's layout). More realistically: frontmatter changes, `## Problem` content changes from vault sync, or title edits all shift the absolute offset of the fence body within the parent doc.

If the child-to-parent sync uses hardcoded offsets captured at widget creation time, any shift means the sync writes to the WRONG position in the parent, corrupting the document.

**How it happens in this codebase:** `vault.process` writes (AI review, copyToCode) can insert/remove text anywhere in the note. When Obsidian's file-sync transaction lands on the parent EditorView, the fence body offsets shift. If the child editor then dispatches a sync change using stale offsets, corruption occurs.

**Detection:** After vault.process writes, the next keystroke in the child editor inserts characters at the wrong position — typically merging the code with an adjacent section heading.

**Prevention strategy:**
1. **Always re-derive offsets at sync time.** Before dispatching child changes to parent, call `findCodeFence(parentState)` to get the current opener/closer lines, then compute `bodyStart = openerLine.to + 1` fresh.
2. **Use the parent's `ChangeSet` to map offsets.** When the parent transaction changes, map the stored `bodyStart`/`bodyEnd` through `tr.changes.mapPos()` before using them.
3. **Validate offset sanity.** If the mapped offset lands outside the document or the fence is no longer found, suppress sync and mark the child editor as "detached" (read-only until re-anchored).
4. **Consider a StateEffect-based notification.** When the parent processes a docChanged transaction, emit a custom effect to the child editor with the updated offsets / content delta.

**Implementation phase:** Phase 1 (foundation) — offset management is the core sync primitive.

---

### Pitfall 3: Vault Sync Conflicts — vault.process vs Child Editor State

**What breaks:** `app.vault.process()` writes update the file atomically BELOW CM6. Obsidian then dispatches a sync transaction to the parent EditorView to reconcile the buffer. This transaction has NO `userEvent` annotation (the section lock's Gate 0 correctly allows it through — see `sectionLockExtension.ts:370-376`). But the child editor doesn't know about this update. Two failure modes:

A) **Content divergence:** vault.process rewrites the fence body (e.g., `copyToCode` pastes a new submission). The parent EditorView absorbs the sync transaction and its document now has new fence content. But the child EditorView still shows the OLD content. The user sees stale code.

B) **Conflicting edits:** The user is mid-edit in the child when vault.process fires (e.g., AI review writes to `## AI Review` section — not the fence, but the parent doc changes). The parent's sync transaction shifts offsets. If the child immediately syncs its pending edit using pre-shift offsets, the parent document corrupts.

**Detection:** After "Copy to Code" from SubmissionDetailModal, the inline code editor shows the old solution instead of the newly copied one. Or: user types in child editor while an AI review write completes, and the note scrambles.

**Prevention strategy:**
1. **Listen for parent docChanged transactions that touch the fence range.** In the parent's StateField update, detect whether the change overlaps the fence body. If it does AND the change didn't originate from the child sync, dispatch a "content replaced" effect to the child.
2. **On external fence replacement, reset child state.** `childView.dispatch({ changes: { from: 0, to: childDoc.length, insert: newFenceContent } })`. This loses child undo history but preserves correctness.
3. **Debounce child-to-parent sync.** Don't sync on every keystroke — batch with a 50-100ms debounce. This creates a window where vault.process can land cleanly.
4. **Add a "sync origin" annotation** (similar to CM6 split-view's `syncAnnotation`). Tag child-originated parent dispatches so the parent StateField doesn't echo them back as external changes.

**Implementation phase:** Phase 2 (sync layer) — after the basic lifecycle is stable.

---

### Pitfall 4: Section Lock Interaction — Double-Gating or Bypass Failure

**What breaks:** The section lock (`sectionLockExtension.ts`) drops user-input transactions (`input.*`, `delete.*`, `undo`, `redo`) that touch locked ranges. The fence body is explicitly UNLOCKED (the lock covers heading + opener + closer, body remains editable). However, the child-to-parent sync dispatches changes to the fence body region. These sync transactions need to pass through the lock cleanly.

**Scenario analysis:**

| Transaction source | userEvent | Gate 0 (isUserInput) | Gate 1 (leetcode.*) | Result |
|---|---|---|---|---|
| User types in child editor | (none on parent dispatch) | `false` → return true | N/A | PASSES - correct |
| Child sync with `userEvent: 'leetcode.sync'` | `'leetcode.sync'` | Not `input.*` / `delete.*` → `false` → return true | N/A | PASSES - correct |
| User types directly in parent fence body (should not happen if Decoration.replace covers it) | `'input.type'` | `true` | N/A | Passes if in unlocked body range - correct |

**The actual risk:** If the Decoration.replace is not working (e.g., Source Mode doesn't render the replace decoration — see Pitfall 8), the user can type directly in the parent's fence body. Both the direct parent edit AND the child-to-parent sync could fire, creating conflicting transactions. The section lock won't prevent this because the fence body is intentionally unlocked.

**Additionally:** If child sync dispatches with `userEvent: 'input.type'` (accidentally inheriting the child's userEvent), the section lock evaluates it as user input. The fence body is unlocked, so it passes — but this is fragile. If the fence structure is momentarily malformed (closer not found), `findCodeFence` returns null, and the lock falls back to "only heading locked." The body range isn't explicitly protected, so the transaction passes. Correct but by accident.

**Detection:** Duplicate characters appear in the fence when both child and parent accept the same keystroke. Or: section lock incorrectly drops a sync transaction if the fence is momentarily in a malformed state during a multi-change transaction.

**Prevention strategy:**
1. **Never inherit child userEvent on parent sync.** Always dispatch parent sync with NO userEvent or with `userEvent: 'leetcode.child-sync'` (which Gate 0 will pass through because it's not `input.*`/`delete.*`).
2. **Decoration.replace MUST cover the full fence body in all modes.** If Source Mode doesn't render the replace decoration, add a separate mechanism (e.g., the existing section lock expanded to cover the body) to prevent direct parent edits to the replaced range.
3. **Add a StateEffect-based guard.** Before applying child sync, verify the parent's fence content matches what the child believes it last synced. If not, abort sync and re-derive from parent (external write landed first).

**Implementation phase:** Phase 2 (sync layer) — tight coupling with the sync dispatch design.

---

### Pitfall 5: Live Preview Re-render Storms — Unmount/Remount Thrashing

**What breaks:** Obsidian's Live Preview mode aggressively processes decorations. When the cursor moves near a decoration, Live Preview can "unfold" it (remove the replace decoration and show raw markdown). For `Decoration.replace` covering the fence body, moving the cursor INTO the fence region may cause Live Preview to remove the replace decoration, revealing raw markdown, destroying the child editor's DOM mount point.

**How it happens:** The existing `CodeActionsWidget` uses `Decoration.widget({ block: true })` (an additive widget, not replace). A `Decoration.replace` behaves differently — Live Preview has special handling for replace decorations near the cursor. The CM6 `inclusive` flag and cursor proximity logic determine whether the decoration "opens up" when the cursor enters.

**Specific trigger in this plugin:** The child editor has focus (cursor is inside the replaced range). Live Preview detects cursor inside a replace decoration. It may attempt to remove the decoration to show "source" — but the source IS the code that the child editor is showing. This creates a visual flash or complete unmount.

**Detection:** Clicking into the nested code editor causes a visual flash. Or: the nested editor appears, disappears, and reappears as the cursor enters the region.

**Prevention strategy:**
1. **Use `inclusive: false` on the Decoration.replace.** This tells CM6 that insertions at the boundaries do NOT extend the decoration. Combined with cursor handling, this MAY prevent Live Preview from unfolding it.
2. **Consider a hybrid approach:** Instead of Decoration.replace, use `Decoration.widget({ block: true })` as the current button row does, and SEPARATELY hide the fence body via CSS (`.cm-line` within the fence range gets `display: none`). The child editor widget renders below/instead. This sidesteps replace-decoration cursor interaction entirely.
3. **Test with `editorLivePreviewField` false (Source Mode).** Source Mode doesn't process decorations the same way. The behavior may differ and needs separate handling.
4. **Override cursor entry behavior.** Use `EditorView.atomicRanges` for the replaced range so the cursor skips over it in the parent, never "entering" the replace decoration.

**Implementation phase:** Phase 1 (foundation) — the decoration type choice is architectural.

---

## HIGH-SEVERITY PITFALLS (Severity: Major / Medium probability)

### Pitfall 6: Memory Leaks — Orphaned EditorView Instances

**What breaks:** Each child `EditorView` allocates:
- A DOM tree with event listeners
- CM6 internal state (document, extensions, facets, plugins)
- LanguageSupport Lezer parser instances
- Any registered intervals or subscriptions

If the widget is destroyed (note closed, decoration removed, mode switch) without calling `childView.destroy()`, all of these leak. Over a session with many note opens/closes, memory grows unbounded.

**How it happens in this codebase:**
- User opens a problem note → child editor created
- User opens a different note in the same leaf → first note's widget is removed from DOM (decoration disappears), but if the child EditorView reference lives only inside the widget DOM, it's GC'd... eventually. Except DOM event listeners prevent GC if they reference the plugin.
- File rename/delete while the child editor exists
- Plugin unload without explicit child cleanup

**Detection:** Memory profiler shows increasing `EditorView` instances over time. DOM node count grows. Eventually Obsidian becomes sluggish.

**Prevention strategy:**
1. **Centralized child EditorView registry on the plugin instance.** `Map<string, { view: EditorView, lastAccess: number }>` keyed by `filePath:fenceId`.
2. **Explicit lifecycle hooks:**
   - Widget `destroy()` → detach child DOM but keep EditorView in registry (for re-attach on rebuild)
   - File close event → destroy child EditorView and remove from registry
   - Plugin `onunload()` → iterate registry, destroy all children
   - LRU eviction: if registry exceeds N entries (e.g., 5), destroy least-recently-used
3. **Use `plugin.register(() => childView.destroy())` pattern.** Obsidian's `Component.register` ensures cleanup on unload.

**Implementation phase:** Phase 1 (foundation) — registry is part of the lifecycle architecture.

---

### Pitfall 7: Read/Source Mode Transitions (Cmd-E) — Complete Widget Teardown

**What breaks:** Pressing Cmd-E in Obsidian toggles between Source Mode (with Live Preview) and Reading Mode. Reading Mode is a completely different renderer — it does NOT use CM6. All CM6 extensions, decorations, and widgets are destroyed when switching to Reading Mode. The child EditorView's DOM is removed from the document.

Switching BACK to Source/Live Preview recreates the entire CM6 EditorView (the parent). All StateFields reinitialize via `create()`. All decorations are rebuilt from scratch. The widget's `toDOM()` fires again.

**How it happens:** The existing codebase handles this via `editorLivePreviewField` detection in the StateField update. But the transition to/from Reading Mode is more severe — the entire CM6 instance is torn down and rebuilt. The `buildCodeActionsEditorExtension` StateField's `create()` runs fresh.

**Additionally:** Within Edit Mode, toggling between Source Mode and Live Preview (`editorLivePreviewField` flip) does NOT destroy the CM6 instance — it just changes rendering behavior. But `Decoration.replace` may behave differently in Source vs Live Preview (Source Mode may not render replace decorations, showing raw markdown instead).

**Detection:** Pressing Cmd-E to enter Reading Mode and back: child editor loses all state (cursor, undo, scroll). Source Mode shows raw markdown instead of the nested editor.

**Prevention strategy:**
1. **Registry-based persistence (same as Pitfall 6).** When the widget is recreated after mode switch, `toDOM()` checks the registry and re-attaches the existing child EditorView.
2. **Save child state on detach.** Before the mode switch destroys the widget, serialize cursor position, scroll offset, and optionally undo history to the registry entry.
3. **Handle Source Mode separately.** If `Decoration.replace` doesn't work in Source Mode (empirical test needed), the child editor may need to be Source-Mode-only with a CSS-based approach (hide parent fence lines, overlay child editor).
4. **Accept the tradeoff:** Reading Mode → Source Mode transition WILL reset child undo history. Document this as expected behavior (undo is per-editing-session, not persistent).

**Implementation phase:** Phase 1 (foundation) — affects decoration type choice.

---

### Pitfall 8: Paste/Clipboard Edge Cases — Event Interception

**What breaks:** Pasting into the child EditorView should work normally (system clipboard → child CM6 input handling). However, Obsidian intercepts clipboard events at the document/window level for features like:
- Pasting URLs as markdown links
- Pasting images (auto-save to vault)
- Smart paste (converting HTML to markdown)
- Plugin-registered paste handlers

These interceptors fire on `paste` events bubbling up from the child editor's DOM. If Obsidian's paste handler catches the event first, it may:
- Transform the pasted text (add markdown formatting)
- Redirect the paste into the PARENT editor instead of the child
- Prevent the default paste entirely

**Detection:** Pasting code into the child editor produces markdown-formatted text instead of raw code. Or: pasted text appears in the parent document at the wrong position.

**Prevention strategy:**
1. **Stop paste event propagation on the child editor's DOM.** Add an event listener on the child's root element: `childDom.addEventListener('paste', (e) => e.stopPropagation(), true)` (capture phase).
2. **Use `ignoreEvent()` returning `false` on the parent widget.** This tells the parent CM6 to NOT ignore events from the widget — but this controls parent editor behavior, not Obsidian's global handlers.
3. **Test empirically.** CM6's own paste handling (`input.paste` userEvent) may already handle this correctly if the child has focus. The risk is Obsidian's workspace-level paste interceptors.
4. **Override `EditorView.clipboardInputFilter`** on the child to strip any markdown transformations.

**Implementation phase:** Phase 3 (polish) — needs empirical testing after basic editing works.

---

### Pitfall 9: Tab Key Routing — Indent vs Focus Navigation

**What breaks:** Tab in the child editor should indent code (or insert a tab character). But:
- Obsidian may intercept Tab for accessibility (focus navigation between panes)
- The parent editor may have `indentWithTab` or its own Tab handling
- CM6's default behavior (no Tab handling) allows focus to escape to the next element
- If the child editor doesn't have `indentWithTab` in its keymap, Tab moves focus OUT of the child editor entirely

**Specific concern:** CM6 deliberately does NOT bind Tab by default (WCAG accessibility — "no keyboard trap"). The child editor needs `keymap.of([indentWithTab])` to capture Tab. But if Obsidian's workspace-level keymap processes Tab BEFORE the child's keymap (capture phase at document level), the child never sees it.

**Detection:** Pressing Tab in the code editor moves focus to the next UI element instead of indenting. Or: pressing Tab indents in the PARENT editor (if it somehow receives the event).

**Prevention strategy:**
1. **Include `indentWithTab` in child editor extensions.** This is the primary fix.
2. **Use `Prec.highest(keymap.of([indentWithTab]))` for priority.** Ensure the child's Tab binding wins over any lower-priority interceptors.
3. **stopPropagation on keydown for Tab.** On the child editor's DOM container, add a capture-phase keydown listener that stops propagation for Tab/Shift-Tab so Obsidian's workspace handlers never see it.
4. **Preserve Escape-then-Tab escape hatch.** Follow CM6's accessibility pattern: Escape exits the child editor (returns focus to parent), THEN Tab navigates normally.

**Implementation phase:** Phase 2 (editing features) — after basic lifecycle is working.

---

### Pitfall 10: IME/CJK Input in Child Editor — Composition Boundary Issues

**What breaks:** Chinese/Japanese/Korean input methods (IME) use composition events (`compositionstart`, `compositionupdate`, `compositionend`). CM6 handles these natively in a standalone editor. However, in a nested context:
- The parent CM6 may also receive composition events (bubbling up)
- Obsidian may interfere with composition tracking
- If the child editor is briefly detached from DOM during a composition (widget rebuild mid-input), the IME session breaks — producing duplicate characters or lost input

**Known CM6 issue context:** CM6 has historically had edge cases with composition in complex DOM structures. The `EditorView.composing` property tracks whether composition is active. If the DOM element is replaced during composition, CM6 may not correctly end the composition session.

**Detection:** Chinese/Japanese input produces garbled characters, duplicate inputs, or prematurely commits the composition buffer. Particularly: if a parent transaction triggers widget rebuild while the user is mid-composition in the child.

**Prevention strategy:**
1. **Never rebuild the child editor DOM during composition.** In the widget's `eq()` or `updateDOM()`, check if the child EditorView is in a composing state (`childView.composing !== 0`). If so, always return `true` from `eq()` (or `updateDOM()`) to prevent DOM replacement.
2. **Debounce child-to-parent sync during composition.** Don't sync mid-composition — wait for `compositionend`.
3. **Stop composition events from propagating to parent.** `childDom.addEventListener('compositionstart', e => e.stopPropagation())` etc.
4. **Test with actual CJK input methods** (macOS Chinese Pinyin, Japanese Romaji, Windows IME).

**Implementation phase:** Phase 3 (polish) — after basic editing and sync are stable.

---

## MODERATE PITFALLS (Severity: Significant / Lower probability)

### Pitfall 11: Undo/Redo History Divergence — Two Undo Stacks

**What breaks:** The child EditorView has its own `history()` extension with its own undo stack. The parent EditorView has a separate undo stack. When the child syncs changes to the parent, the parent's undo history records those changes as a single "external" entry. Pressing Cmd-Z in the child undoes one child transaction; pressing Cmd-Z in the parent (with focus outside the child) undoes the entire batch of synced changes.

**User confusion:** User types 5 characters in child → child has 5 undo entries. Sync dispatches 5 parent transactions (or 1 batched). Parent has 1-5 undo entries for the same text. If user presses Cmd-Z while focus is ambiguous, behavior is unpredictable.

**Prevention strategy (follow CM6 split-view pattern):**
1. **Only ONE undo history.** Install `history()` on the child editor ONLY. The parent does NOT have history for the fence body range (already effectively true — the parent's undo likely covers vault.process writes which are separate).
2. **Alternatively:** Install history on both but sync undo COMMANDS (not changes). When user presses Cmd-Z in parent and the last parent change was a child sync, forward the undo to the child.
3. **Simplest approach:** Accept that the child has its own undo. Clearly delineate: focus in child → child undo; focus outside → parent undo. Don't attempt cross-boundary undo.

**Implementation phase:** Phase 2 (editing features).

---

### Pitfall 12: Focus Management — Parent vs Child vs Obsidian

**What breaks:** Three levels of focus compete:
- Obsidian workspace focus (which pane/leaf is active)
- Parent EditorView focus (CM6's `.cm-focused` class, cursor blink)
- Child EditorView focus

When the user clicks in the child editor, the child gains focus. But does the parent lose focus? If so:
- Parent cursor disappears (expected)
- Obsidian may consider the leaf "unfocused" (unexpected — could disable leaf-level keybindings)
- `editorCallback` commands (Run, Submit) check for active editor — may fail if they look at parent focus

When the user clicks outside the child (e.g., in `## Notes`), the child loses focus. But event listeners on the child (e.g., for auto-save) may not fire cleanup.

**Detection:** Run/Submit buttons stop working when cursor is in child editor. Or: clicking in child editor deactivates the Obsidian leaf's keyboard shortcuts.

**Prevention strategy:**
1. **Proxy focus events.** When child gains focus, keep the parent leaf marked as active. Add `view.dom.classList.add('cm-focused')` on the parent when child is focused (hack but may be necessary).
2. **Test `plugin.app.workspace.getActiveViewOfType(MarkdownView)` with child focus.** If it returns the correct MarkdownView, Run/Submit dispatch works regardless of parent editor focus state.
3. **On child blur, explicitly return focus to parent** (or at least to the leaf). Use `parentView.focus()` when child loses focus to a non-child target.
4. **Route Run/Submit through the child's keybindings too.** Add Cmd-Enter (or whatever hotkey) to child keymap that calls `plugin.runFromActive()`.

**Implementation phase:** Phase 2 (editing features).

---

### Pitfall 13: Plugin Review Risk — Community Plugin Guidelines

**What breaks:** Obsidian's community plugin review has specific rules:
- No `innerHTML` with user data
- No `eval()` or dynamic code
- Resource cleanup (all event listeners via `registerEvent`)
- Use `this.app` not global `app`

A nested EditorView is not explicitly forbidden. However:
- Creating CM6 instances manually (outside Obsidian's management) is unusual
- The reviewer may flag it as "complex DOM manipulation"
- If the child editor leaks event listeners or DOM nodes, it violates cleanup requirements
- Importing `@codemirror/state` and `@codemirror/view` directly (not via `obsidian` re-export) may raise questions, though this is already done in the codebase

**Detection:** Plugin rejected during review with "complex unmanaged DOM" or "potential memory leak" feedback.

**Prevention strategy:**
1. **Document in README:** "This plugin creates an embedded code editor for language-aware editing inside fenced code blocks."
2. **Ensure all child EditorViews are destroyed on plugin unload.** Add explicit cleanup in `onunload()`.
3. **Use Obsidian's CM6 peer deps (mark external in esbuild).** Already done — `@codemirror/state` and `@codemirror/view` are external.
4. **Avoid `innerHTML`.** Use `createEl()` / CM6's own DOM for any surrounding chrome.
5. **Keep the child editor simple.** No dynamic extension loading, no eval, no network calls from the editor itself.

**Implementation phase:** Phase 4 (pre-submission polish).

---

### Pitfall 14: Bundle Size Impact — Language Packs Redux

**What breaks:** Full LanguageSupport for 8 LC languages requires `@codemirror/lang-*` packages. Phase 5.3 ALREADY rejected this approach (added ~370 KB). The nested editor approach needs these same packages back.

| Package | Size (approx) |
|---------|---------------|
| `@codemirror/lang-python` | ~45 KB |
| `@codemirror/lang-java` | ~40 KB |
| `@codemirror/lang-javascript` | ~90 KB (includes TS) |
| `@codemirror/lang-cpp` | ~50 KB |
| `@codemirror/lang-rust` | ~45 KB |
| `@codemirror/language` | ~50 KB (already peer-external?) |
| Total new | ~270-370 KB |

Current bundle: 1.155 MB. Ceiling: 1.2 MB. This does NOT fit without either raising the ceiling or implementing dynamic loading.

**Prevention strategy:**
1. **Lazy-load language packs.** Use dynamic `import()` — esbuild with code-splitting (BUT: esbuild in CJS-no-splitting mode for Obsidian plugins... this may not work).
2. **Load packs at child editor creation time only.** Don't bundle them into main.js — load from a separate chunk file in the plugin directory.
3. **Evaluate: do we need full LanguageSupport or just indent rules?** If only indent + bracket-close are needed (not Lezer highlighting — parent's markdown nested parser already does that), a custom lightweight indent extension (~2 KB) may suffice.
4. **Raise bundle ceiling.** If the language packs are the ONLY way to get proper indent, accept 1.5 MB ceiling. Document the increase.

**Implementation phase:** Phase 1 (architecture decision) — affects the entire approach viability.

---

### Pitfall 15: Scroll Synchronization — Child Editor Height

**What breaks:** The child EditorView has its own scroll viewport. If the code is longer than the visible area, the child editor needs to scroll. But:
- If the child has a fixed height, long code requires scrolling WITHIN the child (nested scroll inside the parent scroll). This is confusing UX.
- If the child auto-grows (no max-height), it expands the parent document's height dynamically. CM6's line-height calculations for the parent may not account for the child's variable height.
- Widget `estimatedHeight` is used by CM6 for layout BEFORE the widget renders. If the estimate is wrong, the parent viewport jumps when the child renders.

**Detection:** Scrolling through the note causes jumps. Or: the code section has a tiny scrollbar inside the parent page's scrollbar. Or: the parent editor's line-number gutter misaligns with content after the child.

**Prevention strategy:**
1. **Auto-grow the child editor (no fixed height).** CSS: `min-height: 3em; max-height: none; overflow: visible`. The child grows with content.
2. **Report accurate `estimatedHeight`.** Override `WidgetType.estimatedHeight` to return `lineCount * lineHeight` (approximate but better than -1).
3. **Disable child scrolling.** Set the child's scroll parent to null or use `EditorView.scrollPastEnd.of(false)`. Let the PARENT handle all scrolling.
4. **Update parent layout on child height change.** After child content changes, call `parentView.requestMeasure()` to recalculate layout.

**Implementation phase:** Phase 2 (editing features) — after basic rendering works.

---

## MINOR PITFALLS (Severity: Annoying / Low probability)

### Pitfall 16: Selection Highlight Conflict — Two Active Selections

**What breaks:** When the child editor has focus and a selection, the parent editor may still show its own stale selection (ghosted blue highlight). Two visible selections confuse the user about which editor is active.

**Prevention:** Clear parent selection when child gains focus. Or: CSS `.cm-selectionBackground` opacity reduction on the parent when child is focused.

**Implementation phase:** Phase 3 (polish).

---

### Pitfall 17: Find/Replace (Cmd-F) Scope Confusion

**What breaks:** Obsidian's Cmd-F opens a search bar that searches the parent document. It won't find text inside the child editor (the child's content is in a separate EditorState, not in the parent's doc at the matched position — the parent has the content in its doc, but it's hidden by Decoration.replace).

Wait — with Decoration.replace, the parent document STILL contains the fence body text (replace only hides it visually). So Cmd-F WILL find matches in the hidden parent text. But clicking "next match" positions the cursor inside the replaced range, which may cause the replace decoration to "unfold" (Live Preview) or behave unexpectedly.

**Prevention:** Accept this as a limitation. Or: add a custom search handler that routes found-in-fence matches to the child editor's search.

**Implementation phase:** Phase 4 (future enhancement) — low priority.

---

### Pitfall 18: Mobile/API Future Compatibility

**What breaks:** If Obsidian mobile ever supports CM6 (currently it uses a different editor on mobile), the nested EditorView approach would need to work there too. Mobile has:
- No Electron (no `require('electron')`)
- Different keyboard handling (virtual keyboard)
- Touch input instead of mouse
- Performance constraints

**Current safety:** The plugin is `isDesktopOnly: true`. Mobile is out of scope per PROJECT.md constraints.

**Prevention:** The approach is inherently desktop-only due to CM6's DOM requirements. If mobile ever becomes in-scope, the nested editor may need replacement with a simpler solution (or mobile could use Obsidian's native fence editing if that improves).

**Implementation phase:** N/A — no action needed for v1.2.

---

## Phase-Specific Warnings

| Implementation Phase | Critical Pitfall | Must Solve Before Proceeding |
|---|---|---|
| Phase 1: Foundation (decoration + lifecycle) | P1 (widget destruction), P5 (Live Preview storms), P6 (memory), P14 (bundle size) | Decoration type choice (replace vs widget+CSS); child registry architecture; bundle budget decision |
| Phase 2: Sync Layer | P2 (offset drift), P3 (vault sync), P4 (section lock), P9 (Tab), P11 (undo), P12 (focus), P15 (scroll) | Bidirectional sync protocol; offset derivation strategy; focus model |
| Phase 3: Polish | P8 (paste), P10 (IME), P16 (selection) | Event propagation boundaries; composition guards |
| Phase 4: Ship | P13 (plugin review), P17 (find/replace) | Cleanup verification; documentation |

---

## Key Architectural Decision: Decoration.replace vs Decoration.widget + CSS Hide

The analysis above surfaces a fork in the road:

**Option A: Decoration.replace (conceptually clean)**
- Hides the fence body range and shows the child editor widget in its place
- Cursor cannot enter the hidden range (atomic)
- BUT: Live Preview may "unfold" it (P5), Find/Replace is confusing (P17), Source Mode behavior unknown

**Option B: Decoration.widget (block: true) + CSS-hidden fence lines**
- The existing button row already uses this pattern successfully
- Fence body lines get `display: none` via line decorations
- Child editor widget renders as a block below the opener (or replacing the hidden lines)
- Cursor in parent skips the hidden range (atomicRanges)
- Less interaction with Live Preview's replace-decoration unfolding logic
- BUT: CSS hiding is fragile (need to re-apply on every doc change); parent text still there (undo/find see it)

**Recommendation: Option B** (widget + CSS hide + atomicRanges). It avoids the most dangerous Live Preview interaction (P5) and aligns with the proven pattern in this codebase. The existing `CodeActionsWidget` (block widget at fence closer) already works perfectly in both Source and Live Preview modes. Extending this pattern is lower risk than introducing Decoration.replace in a context Obsidian may not handle well.

---

## Sources

- CM6 Reference: `WidgetType` class (codemirror.net/docs/ref/#view.WidgetType) — HIGH confidence
- CM6 Split View Example (codemirror.net/examples/split/) — HIGH confidence (official pattern for shared-doc EditorViews)
- CM6 Mixed Language Example (codemirror.net/examples/mixed-language/) — HIGH confidence (confirms parseMixed is the official nested-language approach, NOT nested EditorViews)
- CM6 Tab Handling (codemirror.net/examples/tab/) — HIGH confidence (WCAG considerations)
- CM6 Decoration.replace docs (codemirror.net/docs/ref/#view.Decoration.replace) — HIGH confidence
- Obsidian Developer Docs: editorLivePreviewField, MarkdownView modes — MEDIUM confidence (limited detail on mode transition internals)
- Codebase analysis: `sectionLockExtension.ts`, `codeActionsEditorExtension.ts`, `copyToCode.ts`, `main.ts:switchFenceLanguage` — HIGH confidence (direct source)
- Phase 05.3 CONTEXT (deferred nested EditorView analysis) — HIGH confidence (first-hand empirical findings)
