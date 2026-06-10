// Indent reactivity unit tests.
//
// Covers:
//   1. WidgetController.reconfigureIndent dispatches a Compartment.reconfigure
//      effect with the correct (slug, override) pair through
//      buildLanguageExtensions.
//   2. The dispatch is effects-only (no `changes`) so cursor + scroll + undo
//      are preserved.
//   3. The slug is re-read from frontmatter at dispatch time (per the
//      `currentSlug` getter), so multi-language workspaces propagate the
//      correct payload per widget.
//   4. WidgetRegistry.applyIndentReconfigure walks every controller and calls
//      reconfigureIndent on each (parallel to applyDelay).
//
// Same mock topology as `vimReconfigure.test.ts`: the @codemirror/* packages
// are stubbed, and `buildLanguageExtensions` is asserted directly via its
// mock to confirm the (slug, override) pair without exercising real CM6.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = document.createElement('div');
    state: { doc: { toString: () => string } } = { doc: { toString: () => '' } };
    dispatch = vi.fn();
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

vi.mock('@codemirror/state', () => {
  class MockCompartment {
    static instances: MockCompartment[] = [];
    public mountPayload: unknown = null;
    public reconfigureCalls: unknown[] = [];
    constructor() { MockCompartment.instances.push(this); }
    of(ext: unknown) {
      this.mountPayload = ext;
      return ['mock-compartment-of', ext];
    }
    reconfigure(ext: unknown) {
      this.reconfigureCalls.push(ext);
      return { __reconfigureEffect: true, ext };
    }
  }
  return {
    Annotation: { define: () => ({ of: (v: unknown) => ({ value: v }) }) },
    EditorState: { create: vi.fn().mockReturnValue({ doc: 'mock-state' }) },
    Compartment: MockCompartment,
    Transaction: { userEvent: { of: vi.fn((v) => ({ __userEvent: v })) } },
    StateField: { define: vi.fn(() => 'mock-state-field') },
    RangeSetBuilder: class { add(_f: number, _t: number, _v: unknown) { /* no-op */ } finish() { return 'mock-range-set'; } },
  };
});

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

vi.mock('../../src/main/childEditorLanguage', () => {
  const reconfigureCalls: unknown[] = [];
  return {
    languageCompartment: {
      of: vi.fn().mockReturnValue('mock-lang-compartment'),
      reconfigure: vi.fn((ext: unknown) => {
        reconfigureCalls.push(ext);
        return { __langReconfigure: true, ext };
      }),
      __reconfigureCalls: reconfigureCalls,
    },
    buildLanguageExtensions: vi.fn((slug: string, indent: unknown) => ['mock-lang-ext', slug, indent]),
  };
});

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

import { mountLeetCodeWidget, type WidgetController } from '../../src/widget/WidgetController';
import { WidgetRegistry, type WidgetControllerLike } from '../../src/widget/widgetRegistry';
import { buildLanguageExtensions, languageCompartment } from '../../src/main/childEditorLanguage';

// Cast to the mock-only shape that exposes the reconfigureCalls ledger.
const langCompartmentMock = languageCompartment as unknown as {
  reconfigure: ReturnType<typeof vi.fn>;
  __reconfigureCalls: unknown[];
};

function makeFakePlugin(opts: { language?: string; indent?: 'auto' | 2 | 4 | 8 } = {}) {
  return {
    app: {
      vault: { getConfig: vi.fn<(k: string) => unknown>(() => false) },
      metadataCache: {
        getFileCache: vi.fn<() => { frontmatter: Record<string, unknown> } | null>(() => ({
          frontmatter: { 'lc-slug': 'two-sum', 'lc-language': opts.language ?? 'python3' },
        })),
        on: vi.fn<() => unknown>(() => ({ __ref: 1 })),
        offref: vi.fn<(ref: unknown) => void>(),
      },
      keymap: { pushScope: vi.fn(), popScope: vi.fn() },
      scope: undefined,
    },
    lcSettings: {
      getUseInlineWidget: vi.fn<() => boolean>(() => true),
      getWidgetSyncDebounceMs: vi.fn<() => number>(() => 400),
      getIndentSizeOverride: vi.fn<() => 'auto' | 2 | 4 | 8>(() => opts.indent ?? 'auto'),
      getShowRelativeLineNumbers: vi.fn<() => boolean>(() => false),
    },
    widgetRegistry: { get: vi.fn(), set: vi.fn(), has: vi.fn<() => boolean>(() => false), delete: vi.fn() },
    runFromWidget: vi.fn(),
    submitFromWidget: vi.fn(),
    aiSolutionFromWidget: vi.fn(),
    resetFromWidget: vi.fn(),
    retrieveLastSubmissionFromWidget: vi.fn(),
    switchLanguageFromWidget: vi.fn(),
  };
}

describe('WidgetController.reconfigureIndent', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });

  it('dispatches a languageCompartment.reconfigure with (currentSlug, newOverride) and threads the payload through to the dispatched effect', () => {
    const plugin = makeFakePlugin({ language: 'python3', indent: 'auto' });
    const ctl = mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, false) as WidgetController;

    // Clear mount-time calls so we only see the reconfigure dispatch.
    const dispatchMock = ctl.view.dispatch as unknown as ReturnType<typeof vi.fn>;
    dispatchMock.mockClear();
    (buildLanguageExtensions as unknown as ReturnType<typeof vi.fn>).mockClear();
    langCompartmentMock.reconfigure.mockClear();
    langCompartmentMock.__reconfigureCalls.length = 0;

    ctl.reconfigureIndent(2);

    // Tight assertions on call counts (mirrors vimReconfigure.test.ts pattern).
    expect(buildLanguageExtensions).toHaveBeenCalledTimes(1);
    expect(buildLanguageExtensions).toHaveBeenCalledWith('python3', 2);
    expect(langCompartmentMock.reconfigure).toHaveBeenCalledTimes(1);
    expect(langCompartmentMock.__reconfigureCalls).toHaveLength(1);

    // The reconfigure() call receives the EXACT array that buildLanguageExtensions returned.
    const reconfigureArg = langCompartmentMock.__reconfigureCalls[0];
    expect(reconfigureArg).toEqual(['mock-lang-ext', 'python3', 2]);

    // Pure-effects dispatch (preserves cursor + scroll + undo). NO body change.
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const arg = dispatchMock.mock.calls[0]![0] as {
      changes?: unknown;
      effects?: unknown;
      annotations?: unknown;
      selection?: unknown;
    };
    expect(arg.changes).toBeUndefined();
    expect(arg.selection).toBeUndefined();
    expect(arg.annotations).toBeUndefined();
    // The effect carries the marker shape returned by the mocked compartment.reconfigure.
    expect(arg.effects).toEqual({ __langReconfigure: true, ext: ['mock-lang-ext', 'python3', 2] });
  });

  it('early-returns silently when this.view is missing (no dispatch, no buildLanguageExtensions call)', () => {
    const plugin = makeFakePlugin({ language: 'python3' });
    const ctl = mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, false) as WidgetController;

    // Force-null the view to drive the !this.view guard.
    (ctl as unknown as { view: unknown }).view = null;
    (buildLanguageExtensions as unknown as ReturnType<typeof vi.fn>).mockClear();
    langCompartmentMock.reconfigure.mockClear();

    expect(() => ctl.reconfigureIndent(4)).not.toThrow();
    expect(buildLanguageExtensions).not.toHaveBeenCalled();
    expect(langCompartmentMock.reconfigure).not.toHaveBeenCalled();
  });

  it('re-reads slug from frontmatter at dispatch time (multi-language workspace)', () => {
    const plugin = makeFakePlugin({ language: 'python3', indent: 'auto' });
    const ctl = mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, false) as WidgetController;

    // Frontmatter flips to javascript between mount and the settings change.
    plugin.app.metadataCache.getFileCache = vi.fn(() => ({
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'javascript' },
    }));

    (buildLanguageExtensions as unknown as ReturnType<typeof vi.fn>).mockClear();
    ctl.reconfigureIndent(4);

    expect(buildLanguageExtensions).toHaveBeenCalledWith('javascript', 4);
  });

  it('falls back to python3 when frontmatter has no lc-language', () => {
    const plugin = makeFakePlugin({ indent: 'auto' });
    const ctl = mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, false) as WidgetController;

    plugin.app.metadataCache.getFileCache = vi.fn(() => ({ frontmatter: {} }));

    (buildLanguageExtensions as unknown as ReturnType<typeof vi.fn>).mockClear();
    ctl.reconfigureIndent(8);

    expect(buildLanguageExtensions).toHaveBeenCalledWith('python3', 8);
  });

  it('swallows dispatch errors (defensive against teardown race)', () => {
    const plugin = makeFakePlugin();
    const ctl = mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, false) as WidgetController;

    (ctl.view.dispatch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('view in teardown');
    });

    expect(() => ctl.reconfigureIndent(4)).not.toThrow();
  });
});

describe('WidgetRegistry.applyIndentReconfigure', () => {
  it('calls reconfigureIndent on every registered controller', () => {
    const reconfigureA = vi.fn();
    const reconfigureB = vi.fn();
    const a: WidgetControllerLike = {
      flushNow: vi.fn(),
      destroy: vi.fn(),
      file: { path: 'a.md' },
      reconfigureIndent: reconfigureA,
    };
    const b: WidgetControllerLike = {
      flushNow: vi.fn(),
      destroy: vi.fn(),
      file: { path: 'b.md' },
      reconfigureIndent: reconfigureB,
    };
    const reg = new WidgetRegistry();
    reg.set('a.md::0::leaf-1', a);
    reg.set('b.md::0::leaf-2', b);

    reg.applyIndentReconfigure(2);

    expect(reconfigureA).toHaveBeenCalledTimes(1);
    expect(reconfigureA).toHaveBeenCalledWith(2);
    expect(reconfigureB).toHaveBeenCalledTimes(1);
    expect(reconfigureB).toHaveBeenCalledWith(2);
  });

  it('skips controllers without reconfigureIndent (test fixtures)', () => {
    const a: WidgetControllerLike = {
      flushNow: vi.fn(),
      destroy: vi.fn(),
      file: { path: 'a.md' },
    };
    const reg = new WidgetRegistry();
    reg.set('a.md::0::leaf-1', a);

    expect(() => reg.applyIndentReconfigure('auto')).not.toThrow();
  });

  it('is a no-op on an empty registry', () => {
    const reg = new WidgetRegistry();
    expect(() => reg.applyIndentReconfigure(4)).not.toThrow();
  });

  it('forwards the override value verbatim to every controller (auto / 2 / 4 / 8)', () => {
    const reconfigure = vi.fn();
    const ctl: WidgetControllerLike = {
      flushNow: vi.fn(),
      destroy: vi.fn(),
      file: { path: 'a.md' },
      reconfigureIndent: reconfigure,
    };
    const reg = new WidgetRegistry();
    reg.set('a.md::0::leaf-1', ctl);

    reg.applyIndentReconfigure('auto');
    reg.applyIndentReconfigure(2);
    reg.applyIndentReconfigure(4);
    reg.applyIndentReconfigure(8);

    expect(reconfigure).toHaveBeenCalledTimes(4);
    expect(reconfigure.mock.calls.map((c) => c[0])).toEqual(['auto', 2, 4, 8]);
  });
});
