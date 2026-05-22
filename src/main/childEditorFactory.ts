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
import { languageCompartment, buildLanguageExtensions } from './childEditorLanguage';
import { createScrollIntoViewExtension } from './childEditorSync';

// Phase 16 / debug session `cmd-slash-not-reaching-child`:
// Obsidian registers Mod-/ as the app-level `editor:toggle-comments` hotkey
// via its Scope-based KeymapEventHandler. The handler dispatches to
// `app.workspace.activeEditor` (always the parent MarkdownView in our nested
// editor world). Even when DOM focus is on the child's .cm-content, Obsidian
// still routes the command to the parent, which inserts `%% %%` at the
// parent's stale selection in `## Notes`.
//
// Fix: register a CAPTURE-phase keydown listener on `document` for the
// child editor's lifetime. Capture phase fires before any bubble-phase
// listener (CM6's domEventHandlers, Obsidian's hotkey listener if it's
// bubble-phase). We gate by checking that `event.target` is inside this
// view's contentDOM, then preventDefault + stopImmediatePropagation +
// invoke toggleLineComment on the child directly. The ViewPlugin lifecycle
// guarantees cleanup on view.destroy().
function isMod(event: KeyboardEvent): boolean {
  // macOS uses metaKey for Cmd; Win/Linux use ctrlKey for Ctrl.
  return event.metaKey || event.ctrlKey;
}

const cmdSlashIntercept = ViewPlugin.define((view): PluginValue => {
  const handler = (event: KeyboardEvent): void => {
    if (event.key !== '/' || !isMod(event)) return;
    // Only intercept if focus is in THIS child editor's contentDOM.
    const target = event.target;
    if (!(target instanceof Node) || !view.contentDOM.contains(target)) return;
    // Stop Obsidian's hotkey + any other listeners from running.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    // Run the language-aware comment toggle on the child directly.
    const runComment = toggleLineComment as unknown as (v: EditorView) => boolean;
    runComment(view);
  };
  // Capture phase = true ensures we run BEFORE any bubble-phase or
  // capture-phase-after-us listeners. Obsidian's Scope handler attaches at
  // document level; we beat it by running on the same target at capture phase
  // and using stopImmediatePropagation. Use the document the editor is
  // mounted in (supports popout windows / multi-window vaults).
  const doc = view.dom.ownerDocument ?? document;
  doc.addEventListener('keydown', handler, true);
  return {
    destroy(): void {
      doc.removeEventListener('keydown', handler, true);
    },
  };
});

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
 * @param syncExtensions - Optional array of sync-related extensions
 *   (e.g., updateListener for child→parent sync)
 * @returns The created EditorView instance
 */
export function createChildEditor(
  content: string,
  parent: HTMLElement,
  initialSlug: string,
  indentOverride: 'auto' | 2 | 4 | 8,
  syncExtensions?: Extension[],
): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [
      // 1. Language Compartment (D-11): owns LanguageSupport, indentUnit,
      //    closeBrackets, and the Cmd-/ comment binding. Reconfigured by the
      //    chevron in 16-04 via `languageCompartment.reconfigure(...)`.
      languageCompartment.of(buildLanguageExtensions(initialSlug, indentOverride)),
      // 2a. Mod-/ document-level capture-phase intercept — see debug session
      //     `cmd-slash-not-reaching-child.md`. Bubble-phase domEventHandlers
      //     loses to Obsidian's Scope hotkey, so we install at capture phase
      //     on the document and gate by event.target ∈ this view's
      //     contentDOM. ViewPlugin lifecycle handles cleanup.
      cmdSlashIntercept,
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
