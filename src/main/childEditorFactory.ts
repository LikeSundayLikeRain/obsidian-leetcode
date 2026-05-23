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
  type PluginValue,
} from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, type Extension } from '@codemirror/state';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';
import {
  history,
  indentWithTab,
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
      // 5. Main keymap. indentWithTab MUST be first (priority over
      //    defaultKeymap's Tab handling — Phase 15).
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
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
