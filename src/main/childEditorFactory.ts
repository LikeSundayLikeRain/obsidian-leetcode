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
} from '@codemirror/view';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorState, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { history, indentWithTab, defaultKeymap, historyKeymap } from '@codemirror/commands';
// eslint-disable-next-line import/no-extraneous-dependencies -- external in esbuild; runtime-provided by Obsidian
import { closeBracketsKeymap } from '@codemirror/autocomplete';
import { languageCompartment, buildLanguageExtensions } from './childEditorLanguage';
import { createScrollIntoViewExtension } from './childEditorSync';

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
      // 2. closeBracketsKeymap — top level, BEFORE main keymap (Pitfall D —
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
