// Phase 19 Plan 05 — Read-only mount behavioral assertions (WIDGET-07 / UAT Test 1 BLOCKER 1).
//
// Regression guard: when readOnly=true, vim MUST NOT mount (regardless of
// Obsidian's vimMode setting), and EditorView.editable.of(false) MUST be
// present in the extensions array. vim()'s internal editable behavior wins by
// extension order over EditorView.editable.of(!readOnly), so gating vim on
// `!readOnly` is the only correct fix for read-only mounts.
//
// Covers all four cells of the (readOnly x vimMode) matrix.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = document.createElement('div');
    state: { doc: { toString: () => string } } = { doc: { toString: () => '' } };
    destroy = vi.fn();
    static instances: MockEditorView[] = [];
    static theme = vi.fn().mockReturnValue('mock-theme-extension');
    static editable = { of: vi.fn((b: boolean) => `mock-editable-${b}`) };
    static lineWrapping = 'mock-line-wrapping';
    static updateListener = { of: vi.fn(() => 'mock-update-listener') };
    opts: { state: unknown; parent: HTMLElement };
    constructor(opts: { state: unknown; parent: HTMLElement }) {
      this.opts = opts;
      MockEditorView.instances.push(this);
      opts.parent.appendChild(this.dom);
    }
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn().mockReturnValue('mock-keymap') },
    drawSelection: vi.fn().mockReturnValue('mock-draw-selection'),
    highlightActiveLine: vi.fn().mockReturnValue('mock-highlight-active-line'),
    lineNumbers: vi.fn().mockReturnValue('mock-line-numbers'),
    gutter: vi.fn().mockReturnValue('mock-gutter'),
    GutterMarker: class { eq() { return false; } toDOM() { return document.createTextNode(''); } },
    ViewPlugin: { define: vi.fn().mockReturnValue('mock-view-plugin'), fromClass: vi.fn().mockReturnValue('mock-view-plugin-from-class') },
    Decoration: {
      mark: vi.fn().mockReturnValue({ range: vi.fn().mockReturnValue({}) }),
      line: vi.fn().mockReturnValue({}),
      widget: vi.fn().mockReturnValue({}),
      replace: vi.fn().mockReturnValue({}),
      none: 'mock-decoration-none',
    },
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn().mockReturnValue({ doc: 'mock-state' }) },
  Compartment: class { of(ext: unknown) { return ['mock-compartment-of', ext]; } },
  StateField: { define: vi.fn(() => 'mock-state-field') },
  RangeSetBuilder: class { add(_f: number, _t: number, _v: unknown) { /* no-op */ } finish() { return 'mock-range-set'; } },
}));

vi.mock('@codemirror/language', () => ({
  bracketMatching: vi.fn().mockReturnValue('mock-bracket-matching'),
  indentUnit: { of: vi.fn().mockReturnValue('mock-indent-unit-extension') },
}));

vi.mock('@codemirror/commands', () => ({
  history: vi.fn().mockReturnValue('mock-history-extension'),
  indentMore: vi.fn(),
  indentLess: vi.fn(),
  defaultKeymap: [],
  historyKeymap: [],
  toggleLineComment: vi.fn(),
}));

vi.mock('@codemirror/autocomplete', () => ({
  closeBracketsKeymap: [],
}));

vi.mock('@replit/codemirror-vim', () => ({
  vim: vi.fn().mockReturnValue('mock-vim-extension'),
  getCM: vi.fn(() => ({ state: { vim: null } })),
}));

vi.mock('../../src/main/childEditorLanguage', () => ({
  languageCompartment: { of: vi.fn().mockReturnValue('mock-lang-compartment') },
  buildLanguageExtensions: vi.fn().mockReturnValue(['mock-lang-extensions']),
}));

vi.mock('../../src/main/childEditorTheme', () => ({
  createThemedHighlight: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/main/childEditorSemanticClasses', () => ({
  obsidianSemanticClasses: 'mock-semantic-classes',
}));

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile { path: string; constructor(path: string) { this.path = path; } }
  return { ...actual, TFile };
});

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';
import { mountLeetCodeWidget } from '../../src/widget/WidgetController';

function makeFakePlugin(vimMode: boolean) {
  return {
    app: {
      vault: { getConfig: vi.fn((k: string) => (k === 'vimMode' ? vimMode : false)) },
      metadataCache: {
        getFileCache: vi.fn(() => ({ frontmatter: { 'lc-language': 'python3' } })),
      },
      keymap: { pushScope: vi.fn(), popScope: vi.fn() },
      scope: undefined,
    },
    settings: {
      getUseInlineWidget: vi.fn(() => true),
      getWidgetSyncDebounceMs: vi.fn(() => 400),
      getIndentSizeOverride: vi.fn(() => 'auto' as const),
      getShowRelativeLineNumbers: vi.fn(() => false),
    },
    widgetRegistry: { get: vi.fn(), set: vi.fn(), has: vi.fn(() => false), delete: vi.fn() },
  };
}

describe('Read-only mount behavioral assertions (WIDGET-07 / UAT BLOCKER 1)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });

  it('readOnly=true, vimMode=true -> vim() NOT called; editable.of(false) present', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(true) as never, true);
    // vim must NOT mount in read-only mode
    expect(vim).not.toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).not.toContain('mock-vim-extension');
    // EditorView.editable.of(false) must be present
    expect(EditorView.editable.of).toHaveBeenCalledWith(false);
    expect(createArgs.extensions).toContain('mock-editable-false');
  });

  it('readOnly=true, vimMode=false -> no vim(); editable.of(false) present', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(false) as never, true);
    expect(vim).not.toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).not.toContain('mock-vim-extension');
    expect(EditorView.editable.of).toHaveBeenCalledWith(false);
    expect(createArgs.extensions).toContain('mock-editable-false');
  });

  it('readOnly=false, vimMode=true -> vim() IS called; editable.of(true) present', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(true) as never, false);
    expect(vim).toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-vim-extension');
    expect(EditorView.editable.of).toHaveBeenCalledWith(true);
    expect(createArgs.extensions).toContain('mock-editable-true');
  });

  it('readOnly=false, vimMode=false -> no vim(); editable.of(true) present', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(false) as never, false);
    expect(vim).not.toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).not.toContain('mock-vim-extension');
    expect(EditorView.editable.of).toHaveBeenCalledWith(true);
    expect(createArgs.extensions).toContain('mock-editable-true');
  });
});
