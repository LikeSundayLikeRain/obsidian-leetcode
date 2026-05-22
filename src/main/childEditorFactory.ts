// Phase 13 — Child EditorView factory.
// Creates a properly-configured child EditorView with Python syntax highlighting.
// The child editor is mounted into a provided parent HTMLElement.

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
  indentUnit,
} from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { history, indentWithTab, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { createScrollIntoViewExtension } from './childEditorSync';

/**
 * Create a child EditorView with Python syntax highlighting and standard editing extensions.
 * The EditorView is mounted into the provided parent HTMLElement.
 *
 * @param content - Initial document content for the editor
 * @param parent - HTMLElement to mount the editor into
 * @param syncExtensions - Optional array of sync-related extensions (e.g., updateListener for child->parent sync)
 * @returns The created EditorView instance
 */
export function createChildEditor(
  content: string,
  parent: HTMLElement,
  syncExtensions?: Extension[],
): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [
      python(),
      syntaxHighlighting(defaultHighlightStyle),
      bracketMatching(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      indentUnit.of("    "),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
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
      createScrollIntoViewExtension(),
      ...(syncExtensions ?? []),
    ],
  });

  return new EditorView({ state, parent });
}
