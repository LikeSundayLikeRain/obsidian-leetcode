// Debug session vim-cmd-v-paste-offset — capture-phase Cmd+V / Ctrl+V intercept
// for the v1.3 widget's embedded CM6 editor.
//
// Background
// ----------
// `@replit/codemirror-vim` 6.3.0 attaches a paste DOM listener directly on
// `view.contentDOM` via `enterVimMode(cm)` (`index.js:332`). The handler is
// (`index.js:346-356`):
//
//     vim.onPasteFn = function() {
//       if (!vim.insertMode) {
//         cm.setCursor(offsetCursor(cm.getCursor(), 0, 1));
//         actions.enterInsertMode(cm, {}, vim);
//       }
//     };
//
// Registered with `addEventListener(type, f, false)` — bubble phase. When
// the user is in NORMAL or VISUAL mode and presses Cmd+V (macOS) or Ctrl+V
// (Win/Linux), this handler:
//
//   1. Advances the cursor by +1 column (vim `p`-style "after-cursor"
//      semantics).
//   2. Forces the editor into insert mode, which COLLAPSES any visual
//      selection to a single cursor position.
//
// Then the browser's native paste event continues and CM6's default handler
// inserts the clipboard text at the now-advanced, collapsed cursor — so
// in visual mode the selection is NOT replaced (cursor moved off the
// selection bound and selection vanished), and in normal mode the paste
// lands one column to the right of where the user's cursor visually sat.
//
// Users expect Cmd+V / Ctrl+V to be the SYSTEM clipboard paste shortcut,
// which means: in visual mode, replace the selection; in normal mode,
// insert at the cursor. Vim's own register-based `p`/`P`/`yy` paste keys
// (which intentionally use after-cursor semantics) are handled by vim's
// internal command dispatcher (`defaultKeymap` entries `p`/`P` in
// `index.js:229-230`), NOT by the DOM paste event — those stay untouched.
//
// Solution
// --------
// Attach a CAPTURE-PHASE `paste` listener on `view.contentDOM`. Capture
// phase always runs before bubble phase regardless of registration order,
// so we pre-empt vim's `onPasteFn` reliably.
//
// The handler:
//   1. Reads `event.clipboardData.getData('text/plain')` (the same source
//      vanilla CM6 paste uses; falls through to default handling if there's
//      no clipboard data, e.g. middle-click on Linux which may use
//      'text/x-moz-place' or similar — better to defer than misfire).
//   2. Dispatches a single CM6 transaction with `replaceSelection(text)` +
//      `userEvent: 'input.paste'` + `scrollIntoView: true`. This is the
//      idiomatic CM6 paste shape and:
//        - In VISUAL mode (CM6 selection range non-empty): replaces the
//          range with the clipboard text.
//        - In NORMAL mode (selection collapsed): inserts at the cursor,
//          NOT cursor+1.
//   3. Calls `event.preventDefault()` + `event.stopImmediatePropagation()`
//      so vim's bubble-phase handler never runs and the browser doesn't
//      fire its own default paste insert.
//   4. If vim was active and NOT in insert mode, exits any visual selection
//      and enters insert mode AFTER the paste — matching the user-natural
//      "paste from system, keep typing" flow that vim's own handler was
//      trying to provide (just at the right cursor position this time).
//      We use vim's CodeMirror facade via `getCM(view)` (`@replit/codemirror-vim`'s
//      official cm5-shim handle) so this stays compatible with future
//      vim-extension upgrades that might rename internal action names.
//
// Lifecycle
// ---------
//   1. ViewPlugin.define attaches the listener at construction.
//   2. ViewPlugin destroy removes it.
//   3. No focus/blur tracking — paste only fires on the focused element,
//      and the listener is naturally bounded to this widget's contentDOM.
//
// REGRESSION GUARDS
// -----------------
//   - Vim's own `p`/`P`/`yy` register-based paste keys go through vim's
//     internal keymap (NOT the DOM paste event), so they keep working.
//     Verified by reading `node_modules/@replit/codemirror-vim/dist/index.js`
//     lines 229-230 (defaultKeymap entries) and line 3247 (paste action).
//   - Insert-mode Cmd+V was already correct (vim's `onPasteFn` early-exits
//     when `vim.insertMode === true`). Our capture handler still runs but
//     produces the same result the native CM6 default would: insert at
//     cursor. Verified mentally by walking through the conditional in
//     `getOnPasteFn`.
//   - Vim-OFF widgets: no vim handler exists, but our capture handler
//     still runs and produces the same result the native CM6 default
//     would: replace selection / insert at cursor. So enabling this
//     extension unconditionally (vim ON or OFF) is safe.
//   - Read-only widgets: `EditorView.editable.of(false)` already gates
//     dispatch — the transaction is no-op against a non-editable state.
//     Conservatively we still skip the dispatch by checking
//     `view.state.facet(EditorView.editable)` to avoid an unnecessary
//     transaction in Reading-mode mounts.
//   - Composition (IME): if `compositionstart` fired but `compositionend`
//     hasn't yet, paste during IME composition is rare but legal. The
//     dispatch carries `userEvent: 'input.paste'` which the
//     `childDirtyExtension` and IME-guard logic already handle correctly.
//
// SECURITY / NO-LEAK
// ------------------
//   - Listener is anchored to `view.contentDOM`; teardown removes it.
//   - No reference to clipboard data outside the handler closure.
//   - No persistence of the pasted text anywhere.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView as EditorViewType } from '@codemirror/view';
import { getCM, Vim } from '@replit/codemirror-vim';

/**
 * Build the system-paste capture-phase intercept. Attached to every
 * editable child widget mount alongside the vim Compartment. Returns
 * a single `Extension` (a `ViewPlugin`) so callers can splice it into
 * the extension array next to the other widget extensions.
 */
export function createSystemPasteExtension(): Extension {
  return ViewPlugin.define((view: EditorView): PluginValue => {
    const onPasteCapture = (event: ClipboardEvent): void => {
      // Defer to default handling when the clipboard is unreadable.
      // Some non-text paste sources (images, files) need CM6's full
      // pipeline; we only intercept text/plain.
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;

      // Skip when the editor is read-only (Reading-mode widgets). The
      // dispatch would be a no-op anyway, but we also leave the event
      // alone so any host-level handlers can run.
      if (!view.state.facet(EditorViewType.editable)) return;

      // Pre-empt vim's bubble-phase onPasteFn AND the browser's default
      // paste insert. Both would otherwise mutate the doc / cursor.
      event.preventDefault();
      event.stopImmediatePropagation();

      // Capture vim mode BEFORE the dispatch — replaceSelection in
      // visual mode would clear vim's visual range during apply, and
      // we want to know whether to enter insert mode AFTER.
      const cm5 = getCM(view);
      const vimState = cm5?.state.vim as
        | { insertMode?: boolean; visualMode?: boolean }
        | undefined;
      const wasNonInsertVim = !!cm5 && !vimState?.insertMode;

      // Idiomatic CM6 paste: replaceSelection handles BOTH the
      // collapsed (normal-mode) and ranged (visual-mode) cases. The
      // userEvent annotation is the CM6-canonical 'input.paste' so
      // downstream listeners (childDirtyExtension, debouncedWriter,
      // section-protection extension) treat this exactly like a
      // native paste.
      view.dispatch(
        view.state.update(view.state.replaceSelection(text), {
          scrollIntoView: true,
          userEvent: 'input.paste',
        }),
      );

      // Restore the user-natural "system paste then keep typing" flow.
      // When vim was in normal/visual mode, the user pressed Cmd+V to
      // get system-paste semantics — they don't want to be left in
      // visual mode (with a stale highlight) or normal mode (with the
      // cursor parked one position past the inserted text). Enter
      // insert mode positioned after the inserted text, mirroring what
      // a non-vim editor would do. This also matches what vim's own
      // (broken) handler was trying to achieve.
      if (wasNonInsertVim && cm5) {
        try {
          // `Vim` is the public top-level export of `@replit/codemirror-vim`
          // (see `node_modules/@replit/codemirror-vim/dist/index.d.ts:355,1089`).
          // `Vim.handleKey(cm, key, origin)` is the documented public
          // dispatch entry point used by the package's own integration
          // examples. Cast cm5 to the package's `CodeMirror` facade type
          // — `getCM` returns the same instance shape, just narrower
          // through our local imports.
          //
          // <Esc> first to drop visual mode (no-op in normal mode);
          // then 'i' to enter insert mode at the current cursor — which
          // already sits AT the position right after the inserted text
          // from replaceSelection (CM6 collapses the selection to the
          // end of the inserted range), so 'i' (insert before cursor)
          // is the correct verb.
          const handleKey = (Vim as unknown as {
            handleKey?: (cm: unknown, key: string, origin?: string) => void;
          }).handleKey;
          if (handleKey) {
            if (vimState?.visualMode) {
              handleKey(cm5, '<Esc>', 'paste');
            }
            handleKey(cm5, 'i', 'paste');
          }
        } catch {
          // Defensive — if the package's internal shape changes in a
          // future version, fall through. The paste itself already
          // landed correctly; staying in normal mode is a graceful
          // degradation, not a regression.
        }
      }
    };

    // Capture phase (third arg `true`) is the load-bearing detail.
    // Vim's own listener uses bubble phase (`addEventListener(_, _, false)`
    // in `node_modules/@replit/codemirror-vim/dist/index.js:7116-7118`),
    // so a capture-phase listener always runs first regardless of which
    // extension was constructed earlier. Do NOT "simplify" this to
    // `EditorView.domEventHandlers({ paste })` — those run in bubble
    // phase and would race with vim's listener (registration-order
    // dependent).
    view.contentDOM.addEventListener('paste', onPasteCapture, true);

    return {
      destroy(): void {
        try {
          view.contentDOM.removeEventListener(
            'paste',
            onPasteCapture,
            true,
          );
        } catch {
          /* swallow — contentDOM may already be detached on teardown */
        }
      },
    };
  });
}
