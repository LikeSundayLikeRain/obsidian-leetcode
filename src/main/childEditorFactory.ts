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
import { EditorState } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';

/**
 * Create a child EditorView with Python syntax highlighting and standard editing extensions.
 * The EditorView is mounted into the provided parent HTMLElement.
 *
 * @param content - Initial document content for the editor
 * @param parent - HTMLElement to mount the editor into
 * @returns The created EditorView instance
 */
export function createChildEditor(content: string, parent: HTMLElement): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [
      python(),
      syntaxHighlighting(defaultHighlightStyle),
      bracketMatching(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          background: 'var(--code-background, var(--background-secondary))',
          borderRadius: '4px',
          padding: '8px 0',
        },
        '.cm-content': {
          fontFamily: 'var(--font-monospace)',
          fontSize: '14px',
        },
        '.cm-gutters': {
          background: 'transparent',
          borderRight: 'none',
        },
      }),
    ],
  });

  return new EditorView({ state, parent });
}
