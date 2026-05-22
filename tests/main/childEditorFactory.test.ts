// Phase 13 — ChildEditorFactory unit tests.
// Verifies createChildEditor() produces a properly-configured EditorView
// with Python LanguageSupport, history, bracket matching, theme, and lineWrapping.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// All mocks must be defined inside the vi.mock factory to avoid hoisting issues.

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    destroy = vi.fn();
    static theme = vi.fn().mockReturnValue('mock-theme-extension');
    static lineWrapping = 'mock-line-wrapping';
    static instances: MockEditorView[] = [];
    opts: unknown;
    constructor(opts: unknown) {
      this.opts = opts;
      MockEditorView.instances.push(this);
    }
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn().mockReturnValue('mock-keymap') },
    drawSelection: vi.fn().mockReturnValue('mock-draw-selection'),
    highlightActiveLine: vi.fn().mockReturnValue('mock-highlight-active-line'),
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn().mockReturnValue({ doc: 'mock-state' }) },
}));

vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: vi.fn().mockReturnValue('mock-syntax-highlighting'),
  defaultHighlightStyle: { style: 'default' },
  bracketMatching: vi.fn().mockReturnValue('mock-bracket-matching'),
  indentUnit: { of: vi.fn().mockReturnValue('mock-indent-unit') },
}));

vi.mock('@codemirror/commands', () => ({
  history: vi.fn().mockReturnValue('mock-history-extension'),
  indentWithTab: { key: 'Tab', run: vi.fn() },
  defaultKeymap: [{ key: 'mock-default' }],
  historyKeymap: [{ key: 'mock-history' }],
}));

vi.mock('@codemirror/lang-python', () => ({
  python: vi.fn().mockReturnValue('mock-python-extension'),
}));

vi.mock('../../src/main/childEditorSync', () => ({
  createScrollIntoViewExtension: vi.fn().mockReturnValue('mock-scroll-into-view-extension'),
}));

// Import module under test and mocked modules AFTER vi.mock declarations
import { createChildEditor } from '../../src/main/childEditorFactory';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentUnit } from '@codemirror/language';
import { history, indentWithTab, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { createScrollIntoViewExtension } from '../../src/main/childEditorSync';

describe('createChildEditor', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parent = document.createElement('div');
  });

  it('returns an EditorView instance', () => {
    const result = createChildEditor('print("hello")', parent);
    expect(result).toBeDefined();
    expect(result.dom).toBeInstanceOf(HTMLElement);
  });

  it('calls EditorState.create with the content string as doc', () => {
    const content = 'class Solution:\n    pass';
    createChildEditor(content, parent);

    expect(EditorState.create).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.doc).toBe(content);
  });

  it('creates EditorView with the state and parent element', () => {
    const result = createChildEditor('code', parent);

    // Class-based mock stores constructor args on instance
    const viewInstance = result as unknown as { opts: { state: unknown; parent: HTMLElement } };
    expect(viewInstance.opts).toBeDefined();
    expect(viewInstance.opts.state).toEqual({ doc: 'mock-state' });
    expect(viewInstance.opts.parent).toBe(parent);
  });

  it('includes python() LanguageSupport in extensions', () => {
    createChildEditor('code', parent);

    expect(python).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-python-extension');
  });

  it('includes syntaxHighlighting with defaultHighlightStyle', () => {
    createChildEditor('code', parent);

    expect(syntaxHighlighting).toHaveBeenCalledWith(defaultHighlightStyle);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-syntax-highlighting');
  });

  it('includes bracketMatching extension', () => {
    createChildEditor('code', parent);

    expect(bracketMatching).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-bracket-matching');
  });

  it('includes history() extension', () => {
    createChildEditor('code', parent);

    expect(history).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-history-extension');
  });

  it('includes drawSelection and highlightActiveLine extensions', () => {
    createChildEditor('code', parent);

    expect(drawSelection).toHaveBeenCalledOnce();
    expect(highlightActiveLine).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-draw-selection');
    expect(createArgs.extensions).toContain('mock-highlight-active-line');
  });

  it('includes EditorView.theme in extensions', () => {
    createChildEditor('code', parent);

    expect((EditorView as unknown as { theme: ReturnType<typeof vi.fn> }).theme).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-theme-extension');
  });

  it('includes EditorView.lineWrapping in extensions', () => {
    createChildEditor('code', parent);

    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain(EditorView.lineWrapping);
  });

  it('includes keymap with defaultKeymap and historyKeymap', () => {
    createChildEditor('code', parent);

    expect(keymap.of).toHaveBeenCalled();
    const keymapArgs = (keymap.of as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(keymapArgs).toEqual(expect.arrayContaining(defaultKeymap as []));
    expect(keymapArgs).toEqual(expect.arrayContaining(historyKeymap as []));
  });

  it('includes indentWithTab as first entry in keymap (D-05 priority)', () => {
    createChildEditor('code', parent);

    expect(keymap.of).toHaveBeenCalled();
    const keymapArgs = (keymap.of as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // indentWithTab must be the FIRST entry for priority (before defaultKeymap spread)
    expect(keymapArgs[0]).toBe(indentWithTab);
  });

  it('includes indentUnit.of with 4 spaces (INDENT-04)', () => {
    createChildEditor('code', parent);

    expect(indentUnit.of).toHaveBeenCalledWith('    ');
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-indent-unit');
  });

  it('includes createScrollIntoViewExtension in extensions (D-14)', () => {
    createChildEditor('code', parent);

    expect(createScrollIntoViewExtension).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-scroll-into-view-extension');
  });
});
