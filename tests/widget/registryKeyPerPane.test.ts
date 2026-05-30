// Phase 20 Plan 20-05 — regression test for the per-pane registry key shape.
//
// Pins the production multi-pane mount path against the registry-key collision
// that produced the multi-pane Take-Over CTA asymmetry (gap 3) and
// widget-thrash-on-type (gap 4) blockers reported in 20-HUMAN-UAT.md Test 4.
//
// Test A: mountLeetCodeWidget invoked twice with identical (file, fenceIndex)
//         but different host elements wired to different `.workspace-leaf`
//         ancestors registers TWO controllers in widgetRegistry.
// Test B: Two mountLeetCodeWidget calls into the SAME leafEl ancestor
//         (single pane, sequential remount) result in registry.size === 1
//         (the second clobbers — same physical pane is allowed to overwrite,
//         matching the v1.2 behavior; only different leaves must coexist).
// Test C: resolveLeafId(host) returns a stable id for the same .workspace-leaf
//         ancestor across calls.
// Test D: resolveLeafId(detachedHost) (no .workspace-leaf ancestor) returns
//         DIFFERENT ids on two calls (UUID fallback — distinct mounts get
//         distinct keys even in test envs).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirror the mock topology used by tests/widget/WidgetController.test.ts so
// the heavy CM6 + childEditor* dependencies don't try to set up real syntax
// trees and obsidian-stub's StateField/RangeSetBuilder imports resolve.

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = document.createElement('div');
    state: { doc: { toString: () => string } } = { doc: { toString: () => '' } };
    destroy = vi.fn();
    requestMeasure = vi.fn();
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
    ViewPlugin: {
      define: vi.fn().mockReturnValue('mock-view-plugin'),
      fromClass: vi.fn().mockReturnValue('mock-view-plugin-from-class'),
    },
    Decoration: {
      mark: vi.fn().mockReturnValue({ range: vi.fn().mockReturnValue({}) }),
      line: vi.fn().mockReturnValue({}),
      replace: vi.fn().mockReturnValue({ range: vi.fn().mockReturnValue({}) }),
      widget: vi.fn().mockReturnValue({ range: vi.fn().mockReturnValue({}) }),
      none: 'mock-decoration-none',
    },
    WidgetType: class {},
  };
});

vi.mock('@codemirror/state', () => ({
  Annotation: { define: () => ({ of: (v: unknown) => ({ value: v }) }) },
  EditorSelection: { cursor: vi.fn((n: number) => ({ head: n })) },
  EditorState: {
    create: vi.fn((opts: { extensions: unknown }) => ({
      doc: { toString: () => '', length: 0, lineAt: () => ({ from: 0, number: 1 }) },
      selection: { main: { head: 0 } },
      extensions: opts.extensions,
    })),
  },
  Transaction: { addToHistory: { of: vi.fn((b: boolean) => `mock-history-${b}`) } },
  Compartment: class { of(ext: unknown) { return ['mock-compartment-of', ext]; } reconfigure(ext: unknown) { return ['mock-compartment-reconfigure', ext]; } },
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
  languageCompartment: { of: vi.fn().mockReturnValue('mock-lang-compartment'), reconfigure: vi.fn() },
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
  const debounce = (cb: (...a: unknown[]) => unknown) => {
    const fn = () => cb();
    return Object.assign(fn, { run: fn, cancel: () => fn });
  };
  return { ...actual, TFile, debounce };
});

import {
  mountLeetCodeWidget,
  resolveLeafId,
} from '../../src/widget/WidgetController';
import { WidgetRegistry } from '../../src/widget/widgetRegistry';

interface FakePlugin {
  app: {
    vault: { getConfig: ReturnType<typeof vi.fn> };
    metadataCache: { getFileCache: ReturnType<typeof vi.fn> };
  };
  settings: {
    getIndentSizeOverride: () => 'auto';
    getShowRelativeLineNumbers: () => boolean;
  };
  widgetRegistry: WidgetRegistry;
}

function makePlugin(): FakePlugin {
  return {
    app: {
      vault: { getConfig: vi.fn(() => false) },
      metadataCache: {
        getFileCache: vi.fn(() => ({ frontmatter: { 'lc-language': 'python3' } })),
      },
    },
    settings: {
      getIndentSizeOverride: () => 'auto',
      getShowRelativeLineNumbers: () => false,
    },
    widgetRegistry: new WidgetRegistry(),
  };
}

describe('Phase 20 Plan 20-05 — per-pane registry key', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('Test A: two panes on same (file, fenceIndex) coexist in registry (size === 2)', () => {
    const plugin = makePlugin();
    const file = { path: 'LeetCode/0001-two-sum.md' };

    const leafA = document.createElement('div');
    leafA.classList.add('workspace-leaf');
    document.body.appendChild(leafA);
    const hostA = document.createElement('div');
    leafA.appendChild(hostA);

    const leafB = document.createElement('div');
    leafB.classList.add('workspace-leaf');
    document.body.appendChild(leafB);
    const hostB = document.createElement('div');
    leafB.appendChild(hostB);

    const ctlA = mountLeetCodeWidget(hostA, 'src', file as never, plugin as never, false, 0);
    const ctlB = mountLeetCodeWidget(hostB, 'src', file as never, plugin as never, false, 0);

    expect(plugin.widgetRegistry.size).toBe(2);
    expect(ctlA.registryKey).not.toBe(ctlB.registryKey);
    expect(ctlA.persistenceKey).toBe(ctlB.persistenceKey); // pane-blind by design
    expect(ctlA.registryKey.startsWith(`${file.path}::0::`)).toBe(true);
    expect(ctlB.registryKey.startsWith(`${file.path}::0::`)).toBe(true);
  });

  it('Test B: two mounts on the SAME leafEl (sequential remount) clobber → size === 1', () => {
    const plugin = makePlugin();
    const file = { path: 'LeetCode/0001-two-sum.md' };

    const leafEl = document.createElement('div');
    leafEl.classList.add('workspace-leaf');
    document.body.appendChild(leafEl);

    const host1 = document.createElement('div');
    leafEl.appendChild(host1);
    const ctl1 = mountLeetCodeWidget(host1, 'src', file as never, plugin as never, false, 0);

    const host2 = document.createElement('div');
    leafEl.appendChild(host2);
    const ctl2 = mountLeetCodeWidget(host2, 'src', file as never, plugin as never, false, 0);

    // Same leaf → same leafId → same registryKey → second clobbers first.
    expect(ctl1.registryKey).toBe(ctl2.registryKey);
    expect(plugin.widgetRegistry.size).toBe(1);
  });

  it('Test C: resolveLeafId returns stable id for two hosts in the same leaf', () => {
    const leafEl = document.createElement('div');
    leafEl.classList.add('workspace-leaf');
    document.body.appendChild(leafEl); // CRITICAL — closest() requires DOM attachment.

    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    leafEl.appendChild(hostA);
    leafEl.appendChild(hostB);

    const idA = resolveLeafId(hostA);
    const idB = resolveLeafId(hostB);

    expect(idA).toBe(idB);
    expect(typeof idA).toBe('string');
    expect(idA.length).toBeGreaterThan(0);
  });

  it('Test D: resolveLeafId(detachedHost) → distinct ids on two calls (UUID fallback)', () => {
    const detached1 = document.createElement('div');
    const detached2 = document.createElement('div');
    // NOT attached to body — closest('.workspace-leaf') returns null.

    const id1 = resolveLeafId(detached1);
    const id2 = resolveLeafId(detached2);

    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
  });
});
