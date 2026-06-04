// Phase 19 Plan 01 — Vim conditional mount unit tests (VIM-01, VIM-04).
//
// Mirrors the childEditorFactory.test.ts vim-mount conditional block.
// Verifies app.vault.getConfig('vimMode') gates whether the vim() extension
// is appended to the EditorState extensions array.

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
    static scrollHandler = { of: vi.fn(() => 'mock-scroll-handler') };
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

describe('Vim conditional mount (VIM-01)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });

  // Phase 20 Plan 20-01 (VIM-02) — vim is now wrapped in a per-widget
  // `vimCompartment.of(vim())` so reconfigureVim can swap live without
  // rebuilding the EditorView. The mocked Compartment in this file (lines
  // 47-50) renders `Compartment.of(ext)` as `['mock-compartment-of', ext]`,
  // so assertions look for the wrapped tuple containing 'mock-vim-extension'
  // rather than the bare string.
  function flatExtensionsContains(exts: unknown, marker: string): boolean {
    if (!Array.isArray(exts)) return false;
    for (const e of exts) {
      if (e === marker) return true;
      if (Array.isArray(e) && e.includes(marker)) return true;
    }
    return false;
  }

  it('vimMode=true → vim() invoked and vim extension included in extensions array', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(true) as never, false);
    expect(vim).toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    // Phase 20 — vim is wrapped in vimCompartment.of(vim()); assert via the
    // wrapped tuple shape produced by the test's mock Compartment.
    expect(flatExtensionsContains(createArgs.extensions, 'mock-vim-extension')).toBe(true);
  });

  it('vimMode=false → vim() NOT invoked and vim extension absent', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(false) as never, false);
    expect(vim).not.toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(flatExtensionsContains(createArgs.extensions, 'mock-vim-extension')).toBe(false);
  });

  it('reads vimMode via app.vault.getConfig at mount time (VIM-04 / CONTEXT C-14)', () => {
    const plugin = makeFakePlugin(true);
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, plugin as never, false);
    expect(plugin.app.vault.getConfig).toHaveBeenCalledWith('vimMode');
  });

  it('vimMode=true but readOnly=true -> vim() NOT called (gap-closure UAT BLOCKER 1)', () => {
    mountLeetCodeWidget(host, 'pass', { path: 'a.md' } as never, makeFakePlugin(true) as never, true);
    expect(vim).not.toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(flatExtensionsContains(createArgs.extensions, 'mock-vim-extension')).toBe(false);
  });
});
