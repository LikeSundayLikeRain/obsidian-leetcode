// Phase 19 Plan 01 — Theme integration unit tests (THEME-01..03).
//
// Asserts the WidgetController container carries both theme classes and the
// semantic-classes ViewPlugin + themed highlight extensions are attached.
// Mocks mirror tests/widget/WidgetController.test.ts so both test files can
// run in the same suite without conflicts.

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
  Annotation: { define: () => ({ of: (v: unknown) => ({ value: v }) }) },
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
  indentMore: vi.fn().mockReturnValue(true),
  indentLess: vi.fn().mockReturnValue(true),
  defaultKeymap: [],
  historyKeymap: [],
  toggleLineComment: vi.fn().mockReturnValue(true),
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
  createThemedHighlight: vi.fn().mockReturnValue(['mock-themed-highlight-1', 'mock-themed-highlight-2']),
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
import { mountLeetCodeWidget } from '../../src/widget/WidgetController';
import { createThemedHighlight } from '../../src/main/childEditorTheme';

function makeFakePlugin() {
  return {
    app: {
      vault: { getConfig: vi.fn(() => false) },
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

describe('Theme integration (THEME-01..03)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });

  it('container carries lc-nested-editor (THEME-02 carry-over)', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin() as never, false);
    expect(ctl.container.classList.contains('lc-nested-editor')).toBe(true);
  });

  it('container carries HyperMD-codeblock (THEME-02 carry-over)', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin() as never, false);
    expect(ctl.container.classList.contains('HyperMD-codeblock')).toBe(true);
  });

  it('createThemedHighlight() invoked exactly once during mount (THEME-01)', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin() as never, false);
    expect(createThemedHighlight).toHaveBeenCalledTimes(1);
  });

  it('themed highlight extensions spread into the EditorState extensions array', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin() as never, false);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-themed-highlight-1');
    expect(createArgs.extensions).toContain('mock-themed-highlight-2');
  });

  it('obsidianSemanticClasses ViewPlugin in the extensions array (THEME-03)', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin() as never, false);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-semantic-classes');
  });
});
