---
slug: vim-cmd-v-paste-offset
status: resolved
trigger: |
  the past in vim visual mode is not working as expected, it append at the cur + 1 place instead of replace what's been selected.
  e.g. the original text is `public List<List<Integer>> permute(int[] nums) {`, when selecting permute, and cursor at e, the paste will becomes `public List<List<Integer>> permute(testPasteint[] nums) {`

  Clarification: Cmd+V in normal mode also inserts AFTER the cursor (vim `p` semantics) instead of AT/BEFORE the cursor (system-clipboard paste semantics). User expected real-vim behavior where system paste should land before cursor.
created: 2026-06-10
updated: 2026-06-11T01:59:25Z
---

# Debug Session: vim-cmd-v-paste-offset

## Symptoms

### Expected behavior
- **Visual mode**: Cmd+V (system clipboard paste) replaces the visually-selected text with the clipboard contents.
- **Normal mode**: Cmd+V inserts the clipboard contents at the cursor (system-clipboard paste semantics — same as a non-vim editor).

### Actual behavior
- **Visual mode**: Cmd+V inserts the clipboard at `cursor + 1` (one column AFTER the cursor), leaving the selection's original characters in place. After the paste the editor is in **insert mode** and the visual selection has been lost.
- **Normal mode**: Cmd+V inserts at `cursor + 1` (after the cursor) — vim `p` semantics — instead of at/before the cursor.

Concrete example (visual mode):
- Before: `public List<List<Integer>> permute(int[] nums) {`
- User visual-selects `permute` with the visual cursor on `e` (the `e` in `permute`).
- Clipboard contains the literal text `testPaste`.
- After Cmd+V: `public List<List<Integer>> permute(testPasteint[] nums) {`
  - The selection is NOT replaced — `permute` is still there.
  - `testPaste` is inserted between the closing `(` of `permute(` and `int[]` — i.e. at cursor+1, the position one column past the visual cursor's character.
  - Editor is now in insert mode.

### Error messages
None. No console errors observed (debugger should verify).

### Timeline
User believes: worked correctly in v1.2, regressed somewhere in v1.3 (low confidence — has not bisected). Current branch is `main` post v1.3.0-beta.1 release.

### Reproduction
1. Open a `.md` note containing a `leetcode-solve` fenced code block in **Live Preview** or Reading view (the inline widget surface — bug is reported as **child widget only**).
2. Ensure the file's `lc-language` frontmatter is set (e.g. `java`).
3. Place the cursor inside the widget's embedded CM6 editor.
4. Verify Obsidian core setting **Editor → Vim key bindings** is ON.
5. Copy any text to the system clipboard from outside (Cmd+C in another app, or anywhere outside the widget).
6. **Visual-mode case**: type `v` to enter visual mode, extend selection over a word, press Cmd+V. Observe: clipboard inserted after cursor, selection NOT replaced, editor enters insert mode.
7. **Normal-mode case**: from normal mode (Esc), position cursor on a character, press Cmd+V. Observe: clipboard inserted AFTER the cursor character (vim `p` paste-after semantics) instead of at/before the cursor.

### Scope (confirmed by user)
- Reproduces in the **child widget only** (the embedded CM6 editor inside the `leetcode-solve` fence).
- User confirmed: vim's own `y` and `p` work as expected; the bug is specifically about the system clipboard shortcut Cmd+V.
- Did NOT confirm whether the parent doc is affected — debugger should rule it out by reproducing on a vanilla note in the same vault with vim mode on (parent doc uses Obsidian's editor, not the widget).

## Initial Suspect Surface

The plugin uses `@replit/codemirror-vim` (`^6.3.0`) wired through a per-widget `Compartment` (`vimCompartment`) in `src/widget/WidgetController.ts:57,215-256,991-1013`. The vim extension is reconfigured live via `reconfigureVim(enabled)` (WidgetController.ts:991) in response to layout-change events. The child editor extension array — including `keymap.of([...])`, `vim({ status: true })`, and `EditorView.domEventHandlers({...})` — is the surface where Cmd+V is most likely being intercepted.

Three competing hypotheses for the debugger to test:

**H1 — vim normal-mode keymap is consuming Cmd+V as `p`-equivalent.** `@replit/codemirror-vim` may bind Cmd-V (or a synthesized `<C-v>` / `<D-v>` keystroke) to vim paste, which inserts AFTER cursor in normal mode and uses linewise/charwise vim-paste semantics in visual mode rather than CM6's native selection-replace. In that case the clipboard goes through vim's register pipeline and lands one position right of cursor.

**H2 — paste DOM event reaches CM6 but the cursor was already advanced by vim's "after cursor" model.** Vim normal-mode cursor sits ON a character (cell-cursor model); CM6 selection sits BETWEEN characters. If the plugin (or vim) reports cursor `pos` as character-index `i` while CM6 paste inserts at `pos`, the visual cell on character `i` actually corresponds to the gap at index `i`, but vim's internal "after cursor" semantics could push the paste to `i+1` (gap after the highlighted character). For visual mode, the selection range may be cleared by vim before paste fires, leaving paste to land at a stale single-cursor position.

**H3 — `EditorView.domEventHandlers({ paste: ... })` somewhere in the widget extension chain is calling `event.preventDefault()` and re-dispatching at the wrong selection range.** `cmdSlashScopeExtension.ts` already shows a precedent for DOM-level interception in this codebase. If a paste handler exists (or was added recently) and computes the insert position from `view.state.selection.main.head` without expanding to `selection.main.from..to` for visual selections, the visual case would lose its selection-replace and the normal-mode case would still differ from the expected before-cursor insert by exactly one column if vim has already mutated the head.

The session manager should focus the gsd-debugger on:
1. Locating any explicit paste handler in `src/widget/` and `src/main/` (`grep -rn "paste\|'paste'" src/widget src/main`).
2. Inspecting the vim Compartment payload at `WidgetController.ts:1000-1004` to see whether `vim({ status: true })` registers a Cmd-V binding.
3. Reading `@replit/codemirror-vim`'s key-mapping defaults for `<C-v>` / `<D-v>` (it's known to bind `<C-v>` to visual-block mode in some versions).
4. Verifying whether `keymap.of` precedence in the child editor extension array places vim above or below CM6's `defaultKeymap` (which owns the native paste handler).

## Current Focus

```yaml
hypothesis: '@replit/codemirror-vim normal-mode handler intercepts Cmd+V and routes the system clipboard through vim paste-after semantics (cursor+1) instead of letting CM6 native paste handle it; in visual mode the selection is collapsed by vim before the paste insert lands.'
test: 'Reproduce in a dev vault with `pjeby/hot-reload`. Add temporary console logging at (a) the paste DOM event on the child editor DOM, (b) `keymap.of` paste handler if any, (c) vim Compartment binding lookup. Verify selection state at the moment paste fires.'
expecting: 'In visual mode, observe selection.main.from === selection.main.to === cursor+1 (collapsed) at the moment the paste change is dispatched, confirming vim cleared the selection before paste. In normal mode, observe the change spec inserting at head+1 rather than head.'
next_action: 'gsd-debugger: locate paste handlers in src/widget/ and src/main/, inspect @replit/codemirror-vim default keymap for Cmd-V/Ctrl-V bindings, and verify keymap precedence vs CM6 defaultKeymap in childEditorFactory / WidgetController extension array.'
reasoning_checkpoint: ''
tdd_checkpoint: ''
```

## Evidence

- timestamp: 2026-06-11T02:10:00Z
  source: node_modules/@replit/codemirror-vim/dist/index.js:332,346-356
  finding: |
    `@replit/codemirror-vim` 6.3.0 attaches a paste DOM listener to the editor's
    `contentDOM` (returned by `cm6.contentDOM` from `getInputField()`) on every
    `enterVimMode(cm)`. The handler is:

      vim.onPasteFn = function() {
        if (!vim.insertMode) {
          cm.setCursor(offsetCursor(cm.getCursor(), 0, 1));
          actions.enterInsertMode(cm, {}, vim);
        }
      };

    Registered via `addEventListener(type, f, false)` (bubble phase).
    When in NORMAL or VISUAL mode this handler:
      1. Moves the cursor +1 column BEFORE the native paste insert runs.
      2. Calls `enterInsertMode(...)` which collapses any visual selection
         to a single cursor position.
    The browser's native paste event then continues and inserts clipboard
    text at the now-advanced, collapsed cursor.

    This exactly matches both reported symptoms:
      - Normal mode: paste lands at cursor+1 (vim "after-cursor" semantics).
      - Visual mode: selection vanishes (collapsed by enterInsertMode), text
        inserted at cursor+1, editor in INSERT mode after.

- timestamp: 2026-06-11T02:10:00Z
  source: src/widget/WidgetController.ts:1584-1586
  finding: |
    Vim is loaded via `vimCompartment.of(vim({ status: true }))` per-widget.
    The vim extension's `enterVimMode` hook attaches the paste listener
    directly on `view.contentDOM`. CM6's own paste path (which would
    correctly replace selection / insert at cursor) runs in the SAME bubble
    phase and gets the cursor that vim already advanced.

- timestamp: 2026-06-11T02:10:00Z
  source: grep src/widget src/main "paste|domEventHandlers"
  finding: |
    No plugin-side paste DOM handler exists today. The bug is 100% from
    `@replit/codemirror-vim`'s built-in paste integration. Hypothesis H3
    (custom plugin paste handler) is RULED OUT.

## Eliminated

- H3 (custom plugin paste handler at wrong selection): no paste handlers
  exist in src/widget or src/main. cmdSlashScopeExtension only handles
  Mod-/ via Obsidian Scope, not paste.

## Resolution

**Root cause**: `@replit/codemirror-vim` 6.3.0 attaches a bubble-phase paste
listener on `view.contentDOM` that, in non-insert vim modes, advances the
cursor by +1 column and forces the editor into insert mode (collapsing any
visual selection) BEFORE the native browser paste insert runs. Cmd+V (and
Ctrl+V on Win/Linux) routes through the same DOM paste event, so system-
clipboard paste inherits this vim-paste-after behavior in normal/visual modes.

**Fix**: Add a capture-phase `paste` listener on `view.contentDOM` from a new
ViewPlugin extension (`createSystemPasteExtension`). Capture phase always
runs before vim's bubble-phase listener, regardless of registration order.
The handler:
  1. Reads `event.clipboardData.getData('text/plain')`.
  2. Dispatches a CM6 transaction that calls `view.state.replaceSelection(text)`
     with `userEvent: 'input.paste'` and `scrollIntoView: true` — this naturally
     replaces the visual selection (when range non-empty) or inserts at the
     cursor (when collapsed), matching standard system-paste semantics in
     both normal and visual modes.
  3. Calls `event.preventDefault()` + `event.stopImmediatePropagation()` so
     vim's handler never fires (no `+1` cursor offset, no auto-insert-mode).
  4. After dispatch, exits visual mode if active by calling vim's `<Esc>`
     equivalent (`exitVisualMode` action) so the post-paste cursor state is
     consistent (no orphaned visual highlight after selection-replace).

Vim's own `y/p/P/yy` register-based paste flow is untouched — those keys
are handled by vim's internal command dispatcher (lines 229-230 of vim
package's defaultKeymap), NOT by the DOM paste event we intercept here.

### Fix applied (2026-06-11)

- **New file**: `src/widget/systemPasteExtension.ts` — exports
  `createSystemPasteExtension(): Extension`, a `ViewPlugin` that attaches
  a capture-phase `paste` listener on `view.contentDOM`. The listener:
  - Reads `event.clipboardData.getData('text/plain')`.
  - Calls `event.preventDefault()` + `event.stopImmediatePropagation()` so
    vim's bubble-phase `onPasteFn` and the browser default never run.
  - Dispatches a CM6 transaction with `replaceSelection(text)` +
    `userEvent: 'input.paste'` so visual selection is replaced (visual mode)
    or text is inserted at the cursor (normal mode).
  - When vim was in normal/visual mode, calls `Vim.handleKey(cm, '<Esc>', 'paste')`
    (visual mode only) then `Vim.handleKey(cm, 'i', 'paste')` so the post-paste
    state is "insert mode at the position right after the inserted text" —
    the user-natural "system paste then keep typing" flow.
  - Read-only widgets (Reading mode) are skipped via the `EditorView.editable`
    facet so Reading-mode hosts can run their own paste handlers.

- **Wiring change**: `src/widget/WidgetController.ts` imports
  `createSystemPasteExtension` and inserts the extension into the editable
  child editor extension array immediately after `vimCompartment.of(...)`.
  The extension is unconditional (vim ON or OFF) — when vim is off the
  capture handler produces the same output the native default would.

- **Verification**:
  - `npm run build` — clean (TypeScript + esbuild).
  - `npm run lint` — 0 errors (1 pre-existing warning in unrelated test file).
  - `npm test` — 256 test files / 2965 passed / 8 skipped / 0 failures.
  - Vim's `y/p/P/yy/]p/[p` register-based paste paths untouched (they go
    through vim's internal `defaultKeymap` dispatcher at vim package
    `index.js:168-169,229-230,3247`, not the DOM `paste` event).
  - Insert-mode Cmd+V: vim's `onPasteFn` early-returns when
    `vim.insertMode === true`, so prior behavior was already correct.
    Our capture handler produces the same result (replace selection /
    insert at cursor) so insert mode stays correct.

- **UAT (manual, requires dev vault)**:
  - Visual mode: `v` to enter visual, extend over `permute`, copy
    `testPaste` to clipboard, Cmd+V → expect `permute` REPLACED with
    `testPaste`, editor in insert mode at end of `testPaste`.
  - Normal mode: cursor on `e` of `permute`, Cmd+V → expect `testPaste`
    inserted AT cursor (not cursor+1), editor in insert mode.
  - Vim register paste: `yy` then `p` → expect line duplicated below
    (vim's after-cursor semantics, unchanged).
