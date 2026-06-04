// Phase 19 Plan 04 Task 1 — languageFallback unit tests (RED).
//
// VALIDATION row 19-04-03 / WIDGET-06.
//
// Verifies the `lc-language` frontmatter resolution path emits a Notice
// exactly once per mount when:
//   - frontmatter is missing entirely, OR
//   - frontmatter is set to a value not in the KNOWN_SLUGS allowlist.
// Notice text includes the offending value and the word 'Python' (the
// fallback target).
//
// Per VALIDATION row 19-04-03, "exactly once per mount" means each mount call
// emits a Notice; remounts (separate mountLeetCodeWidget invocations) emit
// their own Notice. Cross-mount deduplication is explicitly NOT a goal.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const noticeSpy = vi.fn();

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
  // Spy-capable Notice — every `new Notice(msg, timeout)` records into noticeSpy.
  class Notice {
    constructor(public message: string, public timeout?: number) {
      noticeSpy(message, timeout);
    }
  }
  const debounce = (cb: (...a: unknown[]) => unknown) => {
    const fn = () => cb();
    return Object.assign(fn, { run: fn, cancel: () => fn });
  };
  return { ...actual, TFile, Notice, debounce };
});

import { mountLeetCodeWidget } from '../../src/widget/WidgetController';

interface FakePlugin {
  app: {
    vault: {
      getConfig: (key: string) => unknown;
      read?: (file: unknown) => Promise<string>;
      process?: (file: unknown, fn: (body: string) => string) => Promise<string>;
    };
    metadataCache: {
      getFileCache: (file: { path: string }) => { frontmatter?: Record<string, unknown> } | null;
    };
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

function makeFakePlugin(opts: { lcLanguage?: string | null }): FakePlugin {
  const fm: Record<string, unknown> = { 'lc-slug': 'foo' };
  if (opts.lcLanguage !== undefined && opts.lcLanguage !== null) {
    fm['lc-language'] = opts.lcLanguage;
  }
  return {
    app: {
      vault: { getConfig: vi.fn(() => false) },
      metadataCache: {
        getFileCache: vi.fn(() => ({ frontmatter: fm })),
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

describe('Language fallback Notice (Plan 19-04 / WIDGET-06)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    vi.clearAllMocks();
    noticeSpy.mockClear();
    host = document.createElement('div');
  });

  it('lc-language=python3 (known) → NO Notice emitted', () => {
    const plugin = makeFakePlugin({ lcLanguage: 'python3' });
    mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      plugin as never,
      false,
    );
    expect(noticeSpy).not.toHaveBeenCalled();
  });

  it('lc-language=kotlin (unknown) → exactly one Notice with text containing "kotlin" and "Python"', () => {
    const plugin = makeFakePlugin({ lcLanguage: 'kotlin' });
    mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      plugin as never,
      false,
    );
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    const msg = String(noticeSpy.mock.calls[0]![0]);
    expect(msg.toLowerCase()).toContain('kotlin');
    expect(msg).toMatch(/Python/);
  });

  it('lc-language missing → exactly one Notice referencing missing/lc-language and Python', () => {
    const plugin = makeFakePlugin({ lcLanguage: null });
    mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      plugin as never,
      false,
    );
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    const msg = String(noticeSpy.mock.calls[0]![0]);
    expect(msg).toMatch(/lc-language/);
    // Sentence-case lint rule (obsidianmd/ui/sentence-case) requires the
    // word after the `;` to be lowercase: "...falling back to python." —
    // case-insensitive match keeps the test robust if copy changes again.
    expect(msg).toMatch(/python/i);
  });

  it('separate mounts each emit their own Notice (per-mount semantics — VALIDATION 19-04-03)', () => {
    const plugin = makeFakePlugin({ lcLanguage: 'kotlin' });
    const host1 = document.createElement('div');
    const host2 = document.createElement('div');
    mountLeetCodeWidget(host1, 'pass', { path: 'a.md' } as never, plugin as never, false);
    mountLeetCodeWidget(host2, 'pass', { path: 'a.md' } as never, plugin as never, false);
    expect(noticeSpy).toHaveBeenCalledTimes(2);
  });

  it('read-only mount with missing lc-language ALSO emits Notice (mount happens regardless of readOnly)', () => {
    // The fallback resolves at mount; readOnly affects editing but not the
    // language pack selection or its Notice. (UAT covers user-visible behavior;
    // unit test just confirms the fallback path is exercised.)
    const plugin = makeFakePlugin({ lcLanguage: null });
    mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      plugin as never,
      true,
    );
    expect(noticeSpy).toHaveBeenCalledTimes(1);
  });
});
