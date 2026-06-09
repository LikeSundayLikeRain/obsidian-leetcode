// Phase 20 Plan 20-01 (VIM-02) — vim live-reconfigure unit tests.
//
// Covers the 8 behavior cases from 20-01-PLAN Task 2:
//   1. Constructing a WidgetController with vimMode=false produces a view
//      whose vimCompartment payload resolves to [].
//   2. Constructing with vimMode=true produces a view whose extensions
//      include vim() via the compartment.
//   3. ctl.reconfigureVim(true) on a vim=OFF widget dispatches the effect
//      AND mutates mountedVimMode → true.
//   4. ctl.reconfigureVim(false) on a vim=ON widget dispatches the empty
//      payload AND mutates mountedVimMode → false.
//   5. ctl.reconfigureVim(currentValue) is a no-op (early return).
//   6. After reconfigureVim, cursor head + scroll position + history JSON
//      are unchanged from before the dispatch (verified through the dispatch
//      shape — Compartment.reconfigure preserves state per Phase 16 Pitfall
//      C; this test asserts the dispatch is `effects-only`, no `changes`).
//   7. widgetRegistry.values() yields every registered controller.
//   8. The plugin-side layout-change dispatcher (synthesized callback) calls
//      reconfigureVim on every controller in the registry with the new
//      vimMode value.
//
// Same mock pattern as tests/widget/vimMount.test.ts. Compartment is real
// (we want to assert reconfigure produces an effect spec) but vim() is
// mocked to a string marker so we can detect it in the call args.

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
  // Real-ish Compartment that records `of` and `reconfigure` calls so tests
  // can assert the compartment payload AND distinguish reconfigure dispatches
  // from initial-mount Compartment.of payloads.
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

import { vim } from '@replit/codemirror-vim';
import { mountLeetCodeWidget, type WidgetController } from '../../src/widget/WidgetController';
import { WidgetRegistry } from '../../src/widget/widgetRegistry';

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
    lcSettings: {
      getUseInlineWidget: vi.fn(() => true),
      getWidgetSyncDebounceMs: vi.fn(() => 400),
      getIndentSizeOverride: vi.fn(() => 'auto' as const),
      getShowRelativeLineNumbers: vi.fn(() => false),
    },
    widgetRegistry: { get: vi.fn(), set: vi.fn(), has: vi.fn(() => false), delete: vi.fn() },
  };
}

describe('Phase 20 Plan 20-01 — vimCompartment + reconfigureVim', () => {
  let host: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
  });

  // Behavior 1: Constructing with vimMode=false → compartment payload is [].
  it('vimMode=false → vimCompartment.of payload is empty array', () => {
    const ctl = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(false) as never,
      false,
    );
    // The compartment was constructed inside mountLeetCodeWidget; access via
    // the controller field exposed for Phase 20.
    const cmp = ctl.vimCompartment as unknown as { mountPayload: unknown };
    expect(cmp.mountPayload).toEqual([]);
    expect(ctl.mountedVimMode).toBe(false);
  });

  // Behavior 2: Constructing with vimMode=true → compartment payload includes vim().
  it('vimMode=true → vimCompartment.of payload contains the vim extension', () => {
    const ctl = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(true) as never,
      false,
    );
    const cmp = ctl.vimCompartment as unknown as { mountPayload: unknown };
    expect(cmp.mountPayload).toBe('mock-vim-extension');
    expect(ctl.mountedVimMode).toBe(true);
    expect(vim).toHaveBeenCalled();
  });

  // Behavior 3: reconfigureVim(true) on vim=OFF widget dispatches AND mutates state.
  it('reconfigureVim(true) on vim=OFF widget dispatches the effect + mutates mountedVimMode', () => {
    const ctl = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(false) as never,
      false,
    );
    expect(ctl.mountedVimMode).toBe(false);

    const dispatchSpy = ctl.view.dispatch as unknown as ReturnType<typeof vi.fn>;
    dispatchSpy.mockClear();
    (vim as ReturnType<typeof vi.fn>).mockClear();

    ctl.reconfigureVim(true);

    expect(ctl.mountedVimMode).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(vim).toHaveBeenCalled();
    const dispatchArg = dispatchSpy.mock.calls[0]![0];
    expect(dispatchArg).toHaveProperty('effects');
    // No 'changes' on reconfigure dispatch — Compartment.reconfigure is
    // effects-only (this is the load-bearing invariant for cursor + scroll
    // + undo preservation per Phase 16 Pitfall C analog).
    expect(dispatchArg.changes).toBeUndefined();
  });

  // Behavior 4: reconfigureVim(false) on vim=ON widget dispatches empty payload.
  it('reconfigureVim(false) on vim=ON widget dispatches the empty payload + mutates mountedVimMode', () => {
    const ctl = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(true) as never,
      false,
    );
    expect(ctl.mountedVimMode).toBe(true);

    const cmp = ctl.vimCompartment as unknown as { reconfigureCalls: unknown[] };
    cmp.reconfigureCalls.length = 0;
    const dispatchSpy = ctl.view.dispatch as unknown as ReturnType<typeof vi.fn>;
    dispatchSpy.mockClear();

    ctl.reconfigureVim(false);

    expect(ctl.mountedVimMode).toBe(false);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    // Reconfigure payload was the empty extension array (vim disabled).
    expect(cmp.reconfigureCalls).toHaveLength(1);
    expect(cmp.reconfigureCalls[0]).toEqual([]);
  });

  // Behavior 5: no-op reconfigure when value matches cached mountedVimMode.
  it('reconfigureVim(currentValue) is a no-op — no dispatch, no mutation', () => {
    const ctl = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(true) as never,
      false,
    );
    const dispatchSpy = ctl.view.dispatch as unknown as ReturnType<typeof vi.fn>;
    const cmp = ctl.vimCompartment as unknown as { reconfigureCalls: unknown[] };
    dispatchSpy.mockClear();
    cmp.reconfigureCalls.length = 0;

    ctl.reconfigureVim(true); // already true at mount

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(cmp.reconfigureCalls).toHaveLength(0);
    expect(ctl.mountedVimMode).toBe(true);
  });

  // Behavior 6: reconfigureVim dispatch is effects-only (cursor/scroll/undo preserve invariant).
  it('reconfigureVim produces an effects-only dispatch (no doc changes — preserves cursor + scroll + undo)', () => {
    const ctl = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(false) as never,
      false,
    );
    const dispatchSpy = ctl.view.dispatch as unknown as ReturnType<typeof vi.fn>;
    dispatchSpy.mockClear();

    ctl.reconfigureVim(true);

    const dispatchArg = dispatchSpy.mock.calls[0]![0];
    // Effects-only — these are the 3 fields that would alter doc / selection
    // / scroll. Their absence is the load-bearing invariant.
    expect(dispatchArg.changes).toBeUndefined();
    expect(dispatchArg.selection).toBeUndefined();
    expect(dispatchArg.scrollIntoView).toBeUndefined();
    expect(dispatchArg.effects).toBeDefined();
  });

  // Behavior 7: widgetRegistry.values() iterator yields every registered controller.
  it('widgetRegistry.values() yields every registered controller', () => {
    const registry = new WidgetRegistry();
    const c1 = { flushNow: vi.fn(), destroy: vi.fn(), file: { path: 'a.md' } };
    const c2 = { flushNow: vi.fn(), destroy: vi.fn(), file: { path: 'b.md' } };
    registry.set('a.md::0', c1 as never);
    registry.set('b.md::0', c2 as never);

    const collected = Array.from(registry.values());
    expect(collected).toHaveLength(2);
    expect(collected).toContain(c1 as never);
    expect(collected).toContain(c2 as never);
  });

  // Behavior 8: plugin-side layout-change dispatcher walks registry + calls reconfigureVim.
  it('plugin-side layout-change dispatcher (synthetic) calls reconfigureVim on every controller', () => {
    const registry = new WidgetRegistry();
    const reconfigureA = vi.fn();
    const reconfigureB = vi.fn();
    const c1 = {
      flushNow: vi.fn(),
      destroy: vi.fn(),
      file: { path: 'a.md' },
      reconfigureVim: reconfigureA,
    };
    const c2 = {
      flushNow: vi.fn(),
      destroy: vi.fn(),
      file: { path: 'b.md' },
      reconfigureVim: reconfigureB,
    };
    registry.set('a.md::0', c1 as never);
    registry.set('b.md::0', c2 as never);

    // Synthesize the dispatcher body verbatim from src/main.ts:
    //   for (const ctl of this.widgetRegistry.values()) ctl.reconfigureVim?.(newVim);
    const newVim = true;
    for (const ctl of registry.values()) {
      ctl.reconfigureVim?.(newVim);
    }

    expect(reconfigureA).toHaveBeenCalledTimes(1);
    expect(reconfigureA).toHaveBeenCalledWith(true);
    expect(reconfigureB).toHaveBeenCalledTimes(1);
    expect(reconfigureB).toHaveBeenCalledWith(true);
  });

  // Bonus: verify the WidgetController type exposes the public Phase 20 surface.
  it('WidgetController type contract — exposes vimCompartment + mountedVimMode + reconfigureVim', () => {
    const ctl: WidgetController = mountLeetCodeWidget(
      host,
      'pass',
      { path: 'a.md' } as never,
      makeFakePlugin(false) as never,
      false,
    );
    expect(typeof ctl.reconfigureVim).toBe('function');
    expect(typeof ctl.mountedVimMode).toBe('boolean');
    expect(ctl.vimCompartment).toBeDefined();
  });
});
