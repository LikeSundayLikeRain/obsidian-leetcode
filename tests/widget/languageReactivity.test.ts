// Phase 20 Plan 20-02 Task 2 — per-widget metadataCache reactivity test.
//
// Covers ACTION-03 (Behavior 8 of Plan 20-02 Task 2):
//   - When metadataCache.on('changed', file, ...) fires for the widget's
//     file path, the widget's view receives a Compartment.reconfigure
//     dispatch with `buildLanguageExtensions(newSlug, indent)`.
//   - The EditorView is NOT rebuilt (view reference preserved).
//   - Cross-file metadata changes are no-ops (T-20-02-03 mitigation).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = document.createElement('div');
    state: { doc: { toString: () => string } } = { doc: { toString: () => '' } };
    destroy = vi.fn();
    dispatch = vi.fn();
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
    GutterMarker: class {
      eq() {
        return false;
      }
      toDOM() {
        return document.createTextNode('');
      }
    },
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
  Annotation: { define: () => ({ of: (v: unknown) => ({ value: v }) }) },
  EditorState: { create: vi.fn().mockReturnValue({ doc: 'mock-state' }) },
  Compartment: class {
    of(ext: unknown) {
      return ['mock-compartment-of', ext];
    }
    reconfigure(ext: unknown) {
      return { __reconfigureEffect: true, ext };
    }
  },
  StateField: { define: vi.fn(() => 'mock-state-field') },
  RangeSetBuilder: class {
    add(_f: number, _t: number, _v: unknown) {
      /* no-op */
    }
    finish() {
      return 'mock-range-set';
    }
  },
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
  languageCompartment: {
    of: vi.fn().mockReturnValue('mock-lang-compartment'),
    reconfigure: vi.fn((ext: unknown) => ({ __langReconfigure: true, ext })),
  },
  buildLanguageExtensions: vi.fn((slug: string, indent: unknown) => [
    'mock-lang-ext',
    slug,
    indent,
  ]),
}));

vi.mock('../../src/main/childEditorTheme', () => ({
  createThemedHighlight: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/main/childEditorSemanticClasses', () => ({
  obsidianSemanticClasses: 'mock-semantic-classes',
}));

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  return { ...actual, TFile };
});

import { mountLeetCodeWidget } from '../../src/widget/WidgetController';
import { languageCompartment, buildLanguageExtensions } from '../../src/main/childEditorLanguage';

interface MetadataChangeHandler {
  name: 'changed';
  cb: (file: { path: string }) => void;
}

function makeFakePlugin(opts: { language?: string } = {}) {
  const handlers: MetadataChangeHandler[] = [];
  type FmCache = { frontmatter: Record<string, unknown> } | null;
  return {
    app: {
      vault: { getConfig: vi.fn<(k: string) => unknown>(() => false) },
      metadataCache: {
        getFileCache: vi.fn<() => FmCache>(() => ({
          frontmatter: {
            'lc-slug': 'two-sum',
            'lc-language': opts.language ?? 'python3',
          } as Record<string, unknown>,
        })),
        on: vi.fn<(name: 'changed', cb: (file: { path: string }) => void) => unknown>(
          (name, cb) => {
            handlers.push({ name, cb });
            return { __ref: handlers.length };
          },
        ),
        offref: vi.fn<(ref: unknown) => void>(),
      },
      keymap: { pushScope: vi.fn(), popScope: vi.fn() },
      scope: undefined,
    },
    settings: {
      getUseInlineWidget: vi.fn<() => boolean>(() => true),
      getWidgetSyncDebounceMs: vi.fn<() => number>(() => 400),
      getIndentSizeOverride: vi.fn<() => number | 'auto'>(() => 4),
      getShowRelativeLineNumbers: vi.fn<() => boolean>(() => false),
    },
    widgetRegistry: {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn<() => boolean>(() => false),
      delete: vi.fn(),
    },
    // The host adapter provided by the production plugin — we wire stubs
    // here so mountLeetCodeWidget's hasFromWidgetSurface gate passes.
    runFromWidget: vi.fn(),
    submitFromWidget: vi.fn(),
    aiSolutionFromWidget: vi.fn(),
    resetFromWidget: vi.fn(),
    retrieveLastSubmissionFromWidget: vi.fn(),
    switchLanguageFromWidget: vi.fn(),
    __metadataChangeHandlers: handlers,
  };
}

describe('Per-widget metadataCache.on(changed) reactivity (ACTION-03)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });

  it('mountLeetCodeWidget registers metadataCache.on(changed) for editable widgets', () => {
    const plugin = makeFakePlugin();
    mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, false);

    expect(plugin.app.metadataCache.on).toHaveBeenCalledWith(
      'changed',
      expect.any(Function),
    );
  });

  it('does NOT register metadataCache.on for read-only widgets', () => {
    const plugin = makeFakePlugin();
    mountLeetCodeWidget(host, 'src', { path: 'LeetCode/two-sum.md' } as never, plugin as never, true);

    expect(plugin.app.metadataCache.on).not.toHaveBeenCalled();
  });

  it('cross-file metadata change is a no-op (filtered by file.path)', () => {
    const plugin = makeFakePlugin();
    const ctl = mountLeetCodeWidget(
      host,
      'src',
      { path: 'LeetCode/two-sum.md' } as never,
      plugin as never,
      false,
    );

    // Simulate a metadataCache change for a DIFFERENT file.
    const handler = plugin.__metadataChangeHandlers[0]!;
    handler.cb({ path: 'LeetCode/three-sum.md' });

    // Compartment.reconfigure should NOT have been called for the cross-file case.
    expect(languageCompartment.reconfigure).not.toHaveBeenCalled();
    // View dispatch should not have been called either.
    expect((ctl.view as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch)
      .not.toHaveBeenCalled();
  });

  it('matching-file metadata change dispatches Compartment.reconfigure with the new slug', () => {
    const plugin = makeFakePlugin({ language: 'python3' });
    const file = { path: 'LeetCode/two-sum.md' };
    const ctl = mountLeetCodeWidget(host, 'src', file as never, plugin as never, false);
    const viewBefore = ctl.view;

    // Simulate frontmatter changing to java.
    plugin.app.metadataCache.getFileCache = vi.fn(() => ({
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    }));

    const handler = plugin.__metadataChangeHandlers[0]!;
    handler.cb({ path: 'LeetCode/two-sum.md' });

    expect(buildLanguageExtensions).toHaveBeenCalledWith('java', 4);
    expect(languageCompartment.reconfigure).toHaveBeenCalled();
    // EditorView reference NOT rebuilt — same instance after dispatch.
    expect(ctl.view).toBe(viewBefore);
    // Effects-only dispatch (no `changes` / no `selection`).
    const dispatchSpy = (ctl.view as unknown as { dispatch: ReturnType<typeof vi.fn> }).dispatch;
    expect(dispatchSpy).toHaveBeenCalled();
    const dispatchArgs = dispatchSpy.mock.calls[0]![0];
    expect(dispatchArgs).toHaveProperty('effects');
    expect(dispatchArgs).not.toHaveProperty('changes');
    expect(dispatchArgs).not.toHaveProperty('selection');
  });

  it('falls back to python3 when frontmatter lc-language becomes missing on change', () => {
    const plugin = makeFakePlugin({ language: 'python3' });
    const file = { path: 'LeetCode/two-sum.md' };
    mountLeetCodeWidget(host, 'src', file as never, plugin as never, false);

    plugin.app.metadataCache.getFileCache = vi.fn(() => ({
      frontmatter: { 'lc-slug': 'two-sum' }, // no lc-language
    }));

    const handler = plugin.__metadataChangeHandlers[0]!;
    handler.cb({ path: 'LeetCode/two-sum.md' });

    expect(buildLanguageExtensions).toHaveBeenCalledWith('python3', 4);
  });

  it('reads indent override from settings.getIndentSizeOverride at dispatch time', () => {
    const plugin = makeFakePlugin();
    const file = { path: 'LeetCode/two-sum.md' };
    mountLeetCodeWidget(host, 'src', file as never, plugin as never, false);

    // Before dispatch, change the indent override so the listener picks up
    // the new value (live-applied per Phase 16 Plan 02 D-06).
    plugin.settings.getIndentSizeOverride = vi.fn(() => 2);
    plugin.app.metadataCache.getFileCache = vi.fn(() => ({
      frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'cpp' },
    }));

    const handler = plugin.__metadataChangeHandlers[0]!;
    handler.cb({ path: 'LeetCode/two-sum.md' });

    expect(buildLanguageExtensions).toHaveBeenCalledWith('cpp', 2);
  });
});
