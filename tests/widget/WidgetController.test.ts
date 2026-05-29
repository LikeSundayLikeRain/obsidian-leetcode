// Phase 19 Plan 01 — WidgetController unit tests.
//
// Verifies mountLeetCodeWidget contract:
//   - readOnly=true → CM6 state has EditorView.editable.of(false)
//   - readOnly=false → editable
//   - container className includes both 'lc-nested-editor' and 'HyperMD-codeblock'
//   - obsidianSemanticClasses ViewPlugin attached
// Uses vi.mock to substitute the heavy CM6 + childEditor* dependencies with
// sentinel values so the assertions can introspect call args without standing
// up real syntax trees.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks -----------------------------------------------------------------

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
    opts: { state: unknown; parent: HTMLElement };
    constructor(opts: { state: unknown; parent: HTMLElement }) {
      this.opts = opts;
      MockEditorView.instances.push(this);
      // Append the contentDOM-bearing dom into the parent so the test can
      // see the mount actually placed something.
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
    ViewPlugin: {
      define: vi.fn().mockReturnValue('mock-view-plugin'),
      fromClass: vi.fn().mockReturnValue('mock-view-plugin-from-class'),
    },
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
  // tests/helpers/obsidian-stub.ts:208-218 imports StateField from
  // @codemirror/state to define editorInfoField + editorLivePreviewField.
  // Provide a minimal stub so mock-resolution doesn't fail at module load.
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
  defaultKeymap: [{ key: 'mock-default' }],
  historyKeymap: [{ key: 'mock-history' }],
  toggleLineComment: vi.fn().mockReturnValue(true),
}));

vi.mock('@codemirror/autocomplete', () => ({
  closeBracketsKeymap: [{ key: 'mock-close-brackets-key' }],
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
  createThemedHighlight: vi.fn().mockReturnValue(['mock-themed-highlight']),
}));

vi.mock('../../src/main/childEditorSemanticClasses', () => ({
  obsidianSemanticClasses: 'mock-semantic-classes',
}));

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) { this.path = path; }
  }
  return { ...actual, TFile };
});

import { EditorState } from '@codemirror/state';
import { mountLeetCodeWidget } from '../../src/widget/WidgetController';

interface FakePlugin {
  app: {
    vault: { getConfig: (key: string) => unknown };
    metadataCache: { getFileCache: (file: { path: string }) => { frontmatter?: Record<string, unknown> } | null };
    workspace?: unknown;
    keymap?: unknown;
    scope?: unknown;
  };
  settings: {
    getUseInlineWidget?: () => boolean;
    getWidgetSyncDebounceMs?: () => number;
    getIndentSizeOverride: () => 'auto' | 2 | 4 | 8;
    getShowRelativeLineNumbers: () => boolean;
  };
  widgetRegistry?: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; has: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
}

function makeFakePlugin(opts: { vimMode?: boolean; lcLanguage?: string } = {}): FakePlugin {
  return {
    app: {
      vault: {
        getConfig: vi.fn((key: string) => {
          if (key === 'vimMode') return opts.vimMode === true;
          return undefined;
        }),
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({
          frontmatter: { 'lc-language': opts.lcLanguage ?? 'python3' },
        })),
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
    widgetRegistry: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      has: vi.fn(() => false),
      delete: vi.fn(),
    },
  };
}

describe('mountLeetCodeWidget', () => {
  let host: HTMLElement;
  let plugin: FakePlugin;
  let file: { path: string };

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
    plugin = makeFakePlugin();
    file = { path: 'LeetCode/0001-two-sum.md' };
  });

  it('returns a controller with view, container, file, fenceIndex, plugin', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, plugin as never, false);
    expect(ctl).toBeDefined();
    expect(ctl.file).toBe(file);
    expect(ctl.container).toBeInstanceOf(HTMLElement);
  });

  it('container className includes both lc-nested-editor and HyperMD-codeblock', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, plugin as never, false);
    expect(ctl.container.classList.contains('lc-nested-editor')).toBe(true);
    expect(ctl.container.classList.contains('HyperMD-codeblock')).toBe(true);
  });

  it('readOnly=true → extensions array contains EditorView.editable.of(false)', () => {
    mountLeetCodeWidget(host, 'pass', file as never, plugin as never, /*readOnly=*/true);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-editable-false');
  });

  it('readOnly=false → extensions array contains EditorView.editable.of(true)', () => {
    mountLeetCodeWidget(host, 'pass', file as never, plugin as never, /*readOnly=*/false);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-editable-true');
  });

  it('semantic-classes ViewPlugin attached to extensions array (THEME-03)', () => {
    mountLeetCodeWidget(host, 'pass', file as never, plugin as never, false);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-semantic-classes');
  });

  it('themed highlight spread into extensions (THEME-01)', () => {
    mountLeetCodeWidget(host, 'pass', file as never, plugin as never, false);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).toContain('mock-themed-highlight');
  });

  it('vim extension absent when getConfig("vimMode") is false', () => {
    plugin = makeFakePlugin({ vimMode: false });
    mountLeetCodeWidget(host, 'pass', file as never, plugin as never, false);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(createArgs.extensions).not.toContain('mock-vim-extension');
  });

  it('mousedown handler that stopPropagation() is registered on view.dom (CONTEXT D-02)', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, plugin as never, false);
    // Trigger a mousedown and verify the event's stopPropagation handler runs.
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(event, 'stopPropagation');
    ctl.view.dom.dispatchEvent(event);
    expect(stopProp).toHaveBeenCalled();
  });
});
