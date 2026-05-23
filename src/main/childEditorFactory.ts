// Phase 13 — Child EditorView factory.
// Creates a properly-configured child EditorView mounted into a provided
// parent HTMLElement.
//
// Phase 16 — Language is now Compartment-driven (D-11). The hardcoded
// `python()` LanguageSupport and `indentUnit.of('    ')` from Phase 13 have
// been replaced with `languageCompartment.of(buildLanguageExtensions(slug,
// override))` (16-01). The Compartment payload owns LanguageSupport,
// indentUnit, closeBrackets, and the Cmd-/ comment binding (D-11).
//
// Pitfall D (RESEARCH §12): `closeBracketsKeymap` is wired at the TOP LEVEL
// (outside the Compartment) and placed BEFORE the main keymap so its
// Backspace handler is consulted first. The keymap is language-agnostic so
// it does not need to live inside the Compartment.
//
// Pitfall B (RESEARCH §12): `closeBracketsKeymap` is imported from the
// `@codemirror/autocomplete` package root only — never a deep subpath.
//
// HIGHLIGHT-01 / D-15: `bracketMatching()` from Phase 13 is unchanged —
// don't remove or duplicate it.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  ViewPlugin,
  type Command,
  type PluginValue,
} from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, type Extension } from '@codemirror/state';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentUnit,
} from '@codemirror/language';
import {
  history,
  indentMore,
  indentLess,
  defaultKeymap,
  historyKeymap,
  toggleLineComment,
} from '@codemirror/commands';
import { closeBracketsKeymap } from '@codemirror/autocomplete';
import type { App, Scope } from 'obsidian';
import { languageCompartment, buildLanguageExtensions } from './childEditorLanguage';
import { createScrollIntoViewExtension } from './childEditorSync';

// Phase 16 / debug session `cmd-slash-not-reaching-child`:
// Obsidian registers Mod-/ as `editor:toggle-comments` via its Scope-based
// keymap manager (app.keymap, app.scope). The hotkey is dispatched through
// Obsidian's internal queue, NOT a DOM event — DOM-level keydown listeners
// (capture phase on window/document/contentDOM) cannot prevent it.
//
// Fix: push an Obsidian Scope onto app.keymap when the child editor gains
// focus, with Mod-/ registered to run toggleLineComment on the child. Pop
// the scope on blur. This is the same mechanism Obsidian's Modal class
// uses to override hotkeys when modals are open. Returns false from the
// Scope handler tells Obsidian "I handled it, don't dispatch further."
function isMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

// Phase 17 Plan 03 (D-11/D-12) — Custom Tab handler that branches on cursor
// position. Replaces the bare `indentWithTab` keymap entry from Phase 15:
//
//   - Multi-line selection (sel spans >1 line) → ALWAYS indent all lines as
//     a single transaction (CM6 indentMore is single-tx → preserves the
//     Phase 15 INDENT-03 single-undo invariant).
//   - Cursor at or before first non-whitespace of line → indent the line
//     (delegates to indentMore — INDENT-01 preserved).
//   - Mid-line cursor (after at least one non-whitespace char) → insert
//     the indentUnit facet's string at cursor (D-11 NEW).
//
// IMPORTANT (Rule 1 deviation from RESEARCH.md): CM6's `insertTab` from
// `@codemirror/commands` HARDCODES a real `\t` character — it does NOT read
// the `indentUnit` facet. Verified by inspecting the bundled source:
//   `dispatch(state.update(state.replaceSelection("\t"), ...))`
// To honor INDENT-04 (4 spaces for Java/Python, 2 for JS, real \t for Go —
// per the per-language indentUnit map in childEditorLanguage.ts), we read
// the `indentUnit` facet ourselves and dispatch a replaceSelection with the
// right string. Single transaction → single undo step preserved.
//
// `indentMore` and `indentLess` are `StateCommand`-typed (target =
// {state, dispatch}). EditorView is a structural superset (has `state` and
// `dispatch`), so passing `view` directly to them works at runtime — but
// the duplicate `@codemirror/state` resolution (root @6.6.0 vs
// @codemirror/commands' transitive @6.5.0) makes the `state` types
// nominally distinct under tsc. We cast through the looser StateCommand
// signature to bypass the structural-equality TS2345 noise without leaving
// runtime behavior touched (same workaround used in Phase 16 behavioral
// test — see tests/main/childEditorLanguage.behavioral.test.ts §50-57).
//
// Phase 15 priority invariant: this command MUST be bound BEFORE
// defaultKeymap in keymap.of(...) so it takes precedence over CM6's stock
// Tab handler (which would otherwise trigger focus navigation per the Phase
// 15 D-05 cm-z scope isolation work).
type LooseStateCommand = (target: {
  state: EditorState;
  dispatch: (tr: ReturnType<EditorState['update']>) => void;
}) => boolean;
const indentMoreLoose = indentMore as unknown as LooseStateCommand;
const indentLessLoose = indentLess as unknown as LooseStateCommand;

export const customTabCommand: Command = (view) => {
  const { state } = view;
  const sel = state.selection.main;
  // Multi-line selection → always indent (preserves INDENT-03 single-undo).
  // We test by line number, not raw offsets, so a selection that ends right
  // at a line boundary (`\n` index) is still treated correctly.
  if (
    !sel.empty &&
    state.doc.lineAt(sel.from).number !== state.doc.lineAt(sel.to).number
  ) {
    return indentMoreLoose(view);
  }
  // Cursor at or before first non-whitespace of line → indent the line.
  const line = state.doc.lineAt(sel.head);
  const beforeCursor = line.text.slice(0, sel.head - line.from);
  if (/^\s*$/.test(beforeCursor)) {
    return indentMoreLoose(view);
  }
  // Mid-line → insert the indentUnit facet's string at cursor (real \t for
  // Go, N spaces otherwise). One dispatch → one undo entry.
  const unit = state.facet(indentUnit);
  view.dispatch(
    state.update(state.replaceSelection(unit), {
      scrollIntoView: true,
      userEvent: 'input',
    }),
  );
  return true;
};

// Shift-Tab dedents the current line (or all selected lines for multi-line
// selections) regardless of cursor position. Simple delegation to indentLess
// preserves the Phase 15 INDENT-02 invariant.
export const customShiftTabCommand: Command = (view) => indentLessLoose(view);

/**
 * ViewPlugin that pushes an Obsidian Scope on focus and pops on blur.
 * The Scope intercepts Mod-/ for the child editor and runs the language-
 * aware comment toggle. Without this, Obsidian's app-level
 * `editor:toggle-comments` hotkey wins and inserts `%% %%` into the parent.
 *
 * Returns the ViewPlugin extension. Pass `app` from the plugin instance via
 * the factory.
 */
function createCmdSlashScopeExtension(app: App): Extension {
  return ViewPlugin.define((view): PluginValue => {
    let activeScope: Scope | null = null;

    const runComment = toggleLineComment as unknown as (v: EditorView) => boolean;

    const onFocus = (): void => {
      if (activeScope !== null) return;
      // Obsidian's Scope class is a runtime construct exported from 'obsidian'.
      // We construct one with app.scope as parent so app-level hotkeys other
      // than our overrides still work as expected.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Scope } = require('obsidian') as typeof import('obsidian');
      const scope = new Scope(app.scope);
      // Register Mod-/ inside our scope. Returning false stops further
      // dispatch (Obsidian's app-level handler doesn't run).
      scope.register(['Mod'], '/', (event) => {
        if (!isMod(event as KeyboardEvent)) return true;
        runComment(view);
        return false;
      });
      app.keymap.pushScope(scope);
      activeScope = scope;
    };

    const onBlur = (): void => {
      if (activeScope === null) return;
      app.keymap.popScope(activeScope);
      activeScope = null;
    };

    view.contentDOM.addEventListener('focus', onFocus);
    view.contentDOM.addEventListener('blur', onBlur);
    if (document.activeElement === view.contentDOM) onFocus();

    return {
      destroy(): void {
        view.contentDOM.removeEventListener('focus', onFocus);
        view.contentDOM.removeEventListener('blur', onBlur);
        if (activeScope !== null) {
          app.keymap.popScope(activeScope);
          activeScope = null;
        }
      },
    };
  });
}

/**
 * Create a child EditorView with language-aware syntax highlighting and
 * standard editing extensions. The EditorView is mounted into the provided
 * parent HTMLElement.
 *
 * Phase 16 (D-07/D-11): the language pack, indent unit, closeBrackets, and
 * Cmd-/ comment binding are produced by `buildLanguageExtensions(slug,
 * override)` and wrapped in `languageCompartment.of(...)`. The chevron's
 * `Compartment.reconfigure` dispatch in 16-04 lands on this Compartment
 * key — no remount, no widget rebuild.
 *
 * Pitfall D: `closeBracketsKeymap` is registered at the top level BEFORE the
 * main keymap so its Backspace handler wins over `defaultKeymap`'s.
 *
 * @param content - Initial document content for the editor
 * @param parent - HTMLElement to mount the editor into
 * @param initialSlug - Canonical LC language slug for the initial language
 *   pack (e.g. 'python3', 'java', 'golang'). Drives `getLanguageSupport`
 *   inside `buildLanguageExtensions`. Unknown slugs fall back to Python (D-04).
 * @param indentOverride - User's `indentSizeOverride` setting from
 *   `SettingsStore` (16-02). `'auto'` defers to the per-language map (D-05);
 *   2/4/8 forces that many spaces, except for Go which always uses tab (D-06).
 * @param app - Obsidian App instance (used for Scope-based Mod-/ intercept;
 *   see debug session `cmd-slash-not-reaching-child.md`).
 * @param syncExtensions - Optional array of sync-related extensions
 *   (e.g., updateListener for child→parent sync)
 * @returns The created EditorView instance
 */
export function createChildEditor(
  content: string,
  parent: HTMLElement,
  initialSlug: string,
  indentOverride: 'auto' | 2 | 4 | 8,
  app?: App,
  syncExtensions?: Extension[],
): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [
      // 1. Language Compartment (D-11): owns LanguageSupport, indentUnit,
      //    closeBrackets, and the Cmd-/ comment binding. Reconfigured by the
      //    chevron in 16-04 via `languageCompartment.reconfigure(...)`.
      languageCompartment.of(buildLanguageExtensions(initialSlug, indentOverride)),
      // 2a. Mod-/ Obsidian Scope intercept — see debug session
      //     `cmd-slash-not-reaching-child.md`. Pushes a Scope on focus to
      //     override `editor:toggle-comments` for this child editor only.
      //     `app` is optional only to keep test fixtures simple — runtime
      //     callers MUST pass plugin.app or COMMENT-01 will silently regress.
      ...(app ? [createCmdSlashScopeExtension(app)] : []),
      // 2b. closeBracketsKeymap — top level, BEFORE main keymap (Pitfall D —
      //    Backspace handler wins over defaultKeymap). Language-agnostic so
      //    it lives outside the Compartment.
      keymap.of(closeBracketsKeymap),
      // 3. Syntax highlighting + bracket matching (HIGHLIGHT-01 / D-15
      //    unchanged from Phase 13).
      syntaxHighlighting(defaultHighlightStyle),
      bracketMatching(),
      // 4. Editing primitives.
      history(),
      drawSelection(),
      highlightActiveLine(),
      // 5. Main keymap. customTabCommand MUST be first — branches on cursor
      //    position per Phase 17 D-11 (line-start → indent line; mid-line →
      //    insert indentUnit at cursor; multi-line selection → indent all
      //    lines as one undo step). Phase 15 priority preserved (Tab does
      //    NOT trigger focus-nav).
      keymap.of([
        { key: 'Tab', run: customTabCommand, shift: customShiftTabCommand },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      // 6. Visual extensions.
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          background: 'var(--code-background, var(--background-secondary))',
          borderRadius: '4px',
          padding: '8px 0',
        },
        '.cm-content': {
          fontFamily: 'var(--font-monospace)',
          fontSize: 'var(--font-text-size)',
        },
        '.cm-gutters': {
          background: 'transparent',
          borderRight: 'none',
        },
      }),
      // 7. Sync helpers (Phase 13/14).
      createScrollIntoViewExtension(),
      ...(syncExtensions ?? []),
    ],
  });

  return new EditorView({ state, parent });
}
