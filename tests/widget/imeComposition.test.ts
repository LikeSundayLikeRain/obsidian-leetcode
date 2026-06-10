// Phase 22 Wave 3 C6c — IME composition gate regression test.
// See AUDIT C6c; the listener pair on view.contentDOM keeps childDirty TRUE
// throughout an IME candidate-menu window so the C6d safety timer cannot
// drain a mid-compose dirty entry and an external sync cannot clobber an
// in-flight composition.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks (verbatim from tests/widget/WidgetController.test.ts) -----------

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
  defaultKeymap: [{ key: 'mock-default' }],
  historyKeymap: [{ key: 'mock-history' }],
  insertTab: vi.fn().mockReturnValue(true),
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
  const debounce = (cb: (...a: unknown[]) => unknown) => {
    const fn = () => cb();
    return Object.assign(fn, { run: fn, cancel: () => fn });
  };
  return { ...actual, TFile, debounce };
});

import { mountLeetCodeWidget } from '../../src/widget/WidgetController';
import { SELF_WRITE_SUPPRESSION_TTL_MS } from '../../src/widget/selfWriteSuppression';

// ---------------------------------------------------------------------------

interface FakePlugin {
  app: {
    vault: {
      getConfig: (key: string) => unknown;
      read?: ReturnType<typeof vi.fn>;
      process?: ReturnType<typeof vi.fn>;
    };
    metadataCache: { getFileCache: (file: { path: string }) => { frontmatter?: Record<string, unknown> } | null };
    workspace?: unknown;
    keymap?: unknown;
    scope?: unknown;
  };
  lcSettings: {
    getUseInlineWidget?: () => boolean;
    getWidgetSyncDebounceMs?: () => number;
    getIndentSizeOverride: () => 'auto' | 2 | 4 | 8;
    getShowRelativeLineNumbers: () => boolean;
  };
  widgetRegistry?: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; has: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  selfWriteSuppression?: { arm: ReturnType<typeof vi.fn>; tryConsume: ReturnType<typeof vi.fn> };
}

function makeFakePlugin(opts: { withWriter?: boolean } = {}): FakePlugin {
  const base: FakePlugin = {
    app: {
      vault: {
        getConfig: vi.fn((key: string) => {
          if (key === 'vimMode') return false;
          return undefined;
        }),
      },
      metadataCache: {
        getFileCache: vi.fn(() => ({
          frontmatter: { 'lc-language': 'python3' },
        })),
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
    widgetRegistry: {
      get: vi.fn(() => undefined),
      set: vi.fn(),
      has: vi.fn(() => false),
      delete: vi.fn(),
    },
  };
  if (opts.withWriter) {
    base.app.vault.read = vi.fn(async () => '');
    base.app.vault.process = vi.fn(async () => '');
    base.selfWriteSuppression = { arm: vi.fn(), tryConsume: vi.fn() };
  }
  return base;
}

/** Dispatch a composition event on an element.
 *  happy-dom may or may not implement CompositionEvent constructor — fall back
 *  to a generic Event with the same type string if construction throws. Either
 *  way, `dispatchEvent` invokes addEventListener-registered handlers directly. */
function dispatchCompositionEvent(target: EventTarget, type: 'compositionstart' | 'compositionend'): void {
  let evt: Event;
  try {
    evt = new CompositionEvent(type, { bubbles: true, cancelable: false });
  } catch {
    evt = new Event(type, { bubbles: true, cancelable: false });
  }
  target.dispatchEvent(evt);
}

// ---------------------------------------------------------------------------

describe('C6c — IME composition gate', () => {
  let host: HTMLElement;
  let file: { path: string };

  beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement('div');
    file = { path: 'LeetCode/0001-two-sum.md' };
  });

  // -------------------------------------------------------------------------
  // Test 1: compositionstart flips _childComposing → childDirty becomes TRUE
  // -------------------------------------------------------------------------
  it('compositionstart sets _childComposing → childDirty becomes TRUE', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false);

    // Pre-condition: no writer activity, no composition.
    expect(ctl.childDirty).toBe(false);

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');

    expect(ctl.childDirty).toBe(true);
    // Defense-in-depth: check the internal field directly.
    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 2: compositionend clears _childComposing → childDirty returns FALSE
  // -------------------------------------------------------------------------
  it('compositionend clears _childComposing → childDirty returns to FALSE', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false);

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');
    expect(ctl.childDirty).toBe(true);

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionend');

    expect(ctl.childDirty).toBe(false);
    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 3: composing flag composes with writer.hasPending()
  // -------------------------------------------------------------------------
  it('childDirty stays TRUE after compositionend when writer is mid-flight', () => {
    const plugin = makeFakePlugin({ withWriter: true });
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, plugin as never, /*readOnly=*/false);

    // Stub hasPending to return true (writer has a pending flush).
    if (ctl.writer) {
      vi.spyOn(ctl.writer, 'hasPending').mockReturnValue(true);
    }

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');
    expect(ctl.childDirty).toBe(true);

    // End composition — but writer is still pending.
    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionend');

    // childDirty must remain TRUE because writer.hasPending() is still true.
    expect(ctl.childDirty).toBe(true);
    // But the composing flag itself is cleared.
    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 4: multiple compositionstart without compositionend (cancelled compose)
  // -------------------------------------------------------------------------
  it('multiple compositionstart events are idempotent; single compositionend clears', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false);

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');
    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');
    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');

    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(true);
    expect(ctl.childDirty).toBe(true);

    // A single end clears regardless of how many starts fired.
    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionend');

    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(false);
    expect(ctl.childDirty).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 5: destroy() removes listeners — post-destroy compositionstart is no-op
  // -------------------------------------------------------------------------
  it('destroy() removes listeners — post-destroy compositionstart does NOT touch controller', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false);
    // Hold a reference to the contentDOM before destroy (it may be nulled).
    const contentDOM = ctl.view.contentDOM;

    ctl.destroy();

    // Dispatch after destroy — the listener should have been removed.
    dispatchCompositionEvent(contentDOM, 'compositionstart');

    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(false);
    expect(ctl.childDirty).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 6: read-only mount does NOT register composition listeners
  // -------------------------------------------------------------------------
  it('read-only mount — compositionstart on contentDOM is a no-op (gate stays FALSE)', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/true);

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');

    expect(ctl.childDirty).toBe(false);
    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 7: CompositionEvent constructor fallback documentation
  // -------------------------------------------------------------------------
  it('event constructor fallback — generic Event drives the same listener wiring', () => {
    const ctl = mountLeetCodeWidget(host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false);

    // Explicitly use generic Event (the fallback path in dispatchCompositionEvent).
    ctl.view.contentDOM.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    expect(ctl.childDirty).toBe(true);

    ctl.view.contentDOM.dispatchEvent(new Event('compositionend', { bubbles: true }));
    expect(ctl.childDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lens 2 IME regression — compositionstart holds childDirty TRUE past the
// C6d safety-timer TTL.
//
// The naive design (C6a only, no C6c): the C6d safety timer would fire after
// WIDGET_DIRTY_SAFETY_TTL_MS of idle and clear _childDirty, even during an
// active IME composition window (Pinyin, Kanji, etc. produce NO docChanged
// events between compositionstart and compositionend). A reload-silent during
// that window would clobber the in-progress candidate text.
//
// The revised design (C6c): _childComposing=true causes the childDirty getter
// to return true regardless of _childDirty or the safety timer. The safety
// timer's auto-clear only affects _childDirty, not _childComposing; the getter
// ORs both. The composition guard is only cleared by compositionend.
// ---------------------------------------------------------------------------

describe('C6c — IME composition holds childDirty past safety-timer TTL (Lens 2 regression)', () => {
  let host: HTMLElement;
  let file: { path: string };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    host = document.createElement('div');
    file = { path: 'LeetCode/0001-two-sum.md' };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('compositionstart keeps childDirty TRUE past the 2s safety TTL', () => {
    const ctl = mountLeetCodeWidget(
      host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false,
    );

    // Start IME composition.
    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');
    expect(ctl.childDirty).toBe(true);
    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(true);

    // Advance clock well past the safety TTL (C6d would have cleared _childDirty).
    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS + 2000); // e.g. 4000ms

    // childDirty MUST remain true — _childComposing keeps the getter returning true
    // even though the safety timer may have cleared _childDirty in the background.
    expect(ctl.childDirty).toBe(true);

    // The internal _childComposing flag is the reason.
    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(true);
  });

  it('compositionend clears _childComposing; childDirty resolves to FALSE when no other dirty source', () => {
    const ctl = mountLeetCodeWidget(
      host, 'pass', file as never, makeFakePlugin() as never, /*readOnly=*/false,
    );

    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionstart');
    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS + 2000);
    expect(ctl.childDirty).toBe(true);

    // End composition.
    dispatchCompositionEvent(ctl.view.contentDOM, 'compositionend');

    expect((ctl as unknown as { _childComposing: boolean })._childComposing).toBe(false);
    // With no writer and no _childDirty (safety timer cleared it), childDirty is false.
    expect(ctl.childDirty).toBe(false);
  });
});
