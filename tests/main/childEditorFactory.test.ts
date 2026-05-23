// Phase 13/16 — ChildEditorFactory unit tests.
// Verifies createChildEditor() produces a properly-configured EditorView
// with the Phase 16 Compartment-based language wiring (lang Compartment +
// closeBracketsKeymap top-level), plus history, bracket matching, theme,
// and lineWrapping. The hardcoded `python()` and `indentUnit.of('    ')`
// from Phase 13 have been removed in 16-03.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// All mocks must be defined inside the vi.mock factory to avoid hoisting issues.

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    destroy = vi.fn();
    static theme = vi.fn().mockReturnValue('mock-theme-extension');
    static lineWrapping = 'mock-line-wrapping';
    static domEventHandlers = vi.fn().mockReturnValue('mock-dom-event-handlers');
    static instances: MockEditorView[] = [];
    opts: unknown;
    constructor(opts: unknown) {
      this.opts = opts;
      MockEditorView.instances.push(this);
    }
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn().mockReturnValue('mock-keymap') },
    drawSelection: vi.fn().mockReturnValue('mock-draw-selection'),
    highlightActiveLine: vi.fn().mockReturnValue('mock-highlight-active-line'),
    ViewPlugin: { define: vi.fn().mockReturnValue('mock-view-plugin') },
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn().mockReturnValue({ doc: 'mock-state' }) },
}));

// Phase 16: indentUnit no longer used by the factory — only syntaxHighlighting,
// defaultHighlightStyle, and bracketMatching remain.
vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: vi.fn().mockReturnValue('mock-syntax-highlighting'),
  defaultHighlightStyle: { style: 'default' },
  bracketMatching: vi.fn().mockReturnValue('mock-bracket-matching'),
}));

vi.mock('@codemirror/commands', () => ({
  history: vi.fn().mockReturnValue('mock-history-extension'),
  indentWithTab: { key: 'Tab', run: vi.fn() },
  defaultKeymap: [{ key: 'mock-default' }],
  historyKeymap: [{ key: 'mock-history' }],
  toggleLineComment: vi.fn().mockReturnValue(true),
}));

// Phase 16: factory consumes 16-01's exports instead of importing python() directly.
vi.mock('../../src/main/childEditorLanguage', () => ({
  languageCompartment: { of: vi.fn().mockReturnValue('mock-lang-compartment') },
  buildLanguageExtensions: vi.fn().mockReturnValue(['mock-lang-extensions']),
}));

// Phase 16: closeBracketsKeymap is wired top-level (Pitfall D — Backspace
// priority over defaultKeymap).
vi.mock('@codemirror/autocomplete', () => ({
  closeBracketsKeymap: [{ key: 'mock-close-brackets-key' }],
}));

vi.mock('../../src/main/childEditorSync', () => ({
  createScrollIntoViewExtension: vi.fn().mockReturnValue('mock-scroll-into-view-extension'),
}));

// Import module under test and mocked modules AFTER vi.mock declarations
import { createChildEditor } from '../../src/main/childEditorFactory';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { history, indentWithTab, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { languageCompartment, buildLanguageExtensions } from '../../src/main/childEditorLanguage';
import { closeBracketsKeymap } from '@codemirror/autocomplete';
import { createScrollIntoViewExtension } from '../../src/main/childEditorSync';

describe('createChildEditor', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parent = document.createElement('div');
  });

  it('returns an EditorView instance', () => {
    const result = createChildEditor('print("hello")', parent, 'python3', 'auto');
    expect(result).toBeDefined();
    expect(result.dom).toBeInstanceOf(HTMLElement);
  });

  it('calls EditorState.create with the content string as doc', () => {
    const content = 'class Solution:\n    pass';
    createChildEditor(content, parent, 'python3', 'auto');

    expect(EditorState.create).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.doc).toBe(content);
  });

  it('creates EditorView with the state and parent element', () => {
    const result = createChildEditor('code', parent, 'python3', 'auto');

    // Class-based mock stores constructor args on instance
    const viewInstance = result as unknown as { opts: { state: unknown; parent: HTMLElement } };
    expect(viewInstance.opts).toBeDefined();
    expect(viewInstance.opts.state).toEqual({ doc: 'mock-state' });
    expect(viewInstance.opts.parent).toBe(parent);
  });

  it('includes syntaxHighlighting with defaultHighlightStyle', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(syntaxHighlighting).toHaveBeenCalledWith(defaultHighlightStyle);
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-syntax-highlighting');
  });

  it('includes bracketMatching extension (HIGHLIGHT-01 / D-15 preserved)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    // Explicit regression guard — bracketMatching() MUST NOT be removed during
    // the 16-03 Compartment refactor. HIGHLIGHT-01 is unchanged from Phase 13.
    expect(bracketMatching).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-bracket-matching');
  });

  it('includes history() extension', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(history).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-history-extension');
  });

  it('includes drawSelection and highlightActiveLine extensions', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(drawSelection).toHaveBeenCalledOnce();
    expect(highlightActiveLine).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-draw-selection');
    expect(createArgs.extensions).toContain('mock-highlight-active-line');
  });

  it('includes EditorView.theme in extensions', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect((EditorView as unknown as { theme: ReturnType<typeof vi.fn> }).theme).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-theme-extension');
  });

  it('includes EditorView.lineWrapping in extensions', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain(EditorView.lineWrapping);
  });

  it('includes keymap with defaultKeymap and historyKeymap (main keymap)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(keymap.of).toHaveBeenCalled();
    // Main keymap is the keymap.of call that contains defaultKeymap + historyKeymap.
    // The closeBracketsKeymap call is a separate top-level keymap.of invocation.
    const allCalls = (keymap.of as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const mainKeymap = allCalls.find(
      (arr: unknown) =>
        Array.isArray(arr) && arr.some((entry: unknown) => entry === indentWithTab),
    );
    expect(mainKeymap).toBeDefined();
    expect(mainKeymap).toEqual(expect.arrayContaining(defaultKeymap as []));
    expect(mainKeymap).toEqual(expect.arrayContaining(historyKeymap as []));
  });

  it('includes indentWithTab as first entry in main keymap (Phase 15 priority)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(keymap.of).toHaveBeenCalled();
    const allCalls = (keymap.of as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const mainKeymap = allCalls.find(
      (arr: unknown) =>
        Array.isArray(arr) && arr.some((entry: unknown) => entry === indentWithTab),
    ) as unknown[] | undefined;
    expect(mainKeymap).toBeDefined();
    // indentWithTab must be the FIRST entry for priority (before defaultKeymap spread)
    expect(mainKeymap![0]).toBe(indentWithTab);
  });

  it('includes createScrollIntoViewExtension in extensions (D-14)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(createScrollIntoViewExtension).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-scroll-into-view-extension');
  });
});

describe('createChildEditor — language Compartment wiring (Phase 16)', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parent = document.createElement('div');
  });

  it('passes initialSlug and indentOverride to buildLanguageExtensions', () => {
    createChildEditor('code', parent, 'java', 4);

    expect(buildLanguageExtensions).toHaveBeenCalledOnce();
    expect(buildLanguageExtensions).toHaveBeenCalledWith('java', 4);
  });

  it('passes initialSlug and indentOverride to buildLanguageExtensions (auto override)', () => {
    createChildEditor('code', parent, 'golang', 'auto');

    expect(buildLanguageExtensions).toHaveBeenCalledOnce();
    expect(buildLanguageExtensions).toHaveBeenCalledWith('golang', 'auto');
  });

  it('wraps the buildLanguageExtensions return value in languageCompartment.of', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(languageCompartment.of).toHaveBeenCalledOnce();
    // The mock returns ['mock-lang-extensions'] from buildLanguageExtensions;
    // languageCompartment.of must be called with that exact value.
    expect(languageCompartment.of).toHaveBeenCalledWith(['mock-lang-extensions']);

    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-lang-compartment');
  });

  it('includes closeBracketsKeymap via top-level keymap.of (Pitfall D — Backspace priority)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    // closeBracketsKeymap must be wrapped in keymap.of at the top level
    // (outside the Compartment) so its Backspace handler is consulted before
    // defaultKeymap's. The mock for keymap.of returns the same sentinel for
    // every call, but we can verify a keymap.of call received closeBracketsKeymap.
    const allCalls = (keymap.of as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(allCalls).toContainEqual(closeBracketsKeymap);
  });

  it('places closeBracketsKeymap BEFORE the main keymap in the extensions array (Pitfall D)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    // Track keymap.of call order: each invocation returns a distinct sentinel
    // string in this test so we can verify ordering inside the extensions array.
    const keymapMock = keymap.of as ReturnType<typeof vi.fn>;
    keymapMock.mockReset();
    let kCallIdx = 0;
    const sentinels: string[] = [];
    keymapMock.mockImplementation((arg: unknown) => {
      const s = `mock-keymap-${kCallIdx}`;
      sentinels.push(s);
      // Track which call corresponds to which input by stashing on the sentinel.
      (sentinels as unknown as Record<string, unknown>)[s] = arg;
      kCallIdx += 1;
      return s;
    });

    createChildEditor('code', parent, 'python3', 'auto');

    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    const extensions = createArgs.extensions as unknown[];

    // Find the index of the closeBracketsKeymap sentinel and the main keymap sentinel
    // in the extensions array. closeBrackets must come BEFORE main.
    const cbCallIdx = (keymap.of as ReturnType<typeof vi.fn>).mock.calls
      .findIndex((c) => c[0] === closeBracketsKeymap);
    const mainCallIdx = (keymap.of as ReturnType<typeof vi.fn>).mock.calls
      .findIndex(
        (c) => Array.isArray(c[0]) && (c[0] as unknown[]).includes(indentWithTab),
      );
    expect(cbCallIdx).toBeGreaterThanOrEqual(0);
    expect(mainCallIdx).toBeGreaterThanOrEqual(0);

    const cbSentinel = `mock-keymap-${cbCallIdx}`;
    const mainSentinel = `mock-keymap-${mainCallIdx}`;
    const cbPos = extensions.indexOf(cbSentinel);
    const mainPos = extensions.indexOf(mainSentinel);

    expect(cbPos).toBeGreaterThanOrEqual(0);
    expect(mainPos).toBeGreaterThanOrEqual(0);
    expect(cbPos).toBeLessThan(mainPos);
  });

  it('places languageCompartment as the FIRST extension', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const extensions = createArgs.extensions as unknown[];
    expect(extensions[0]).toBe('mock-lang-compartment');
  });
});

// Source-level regression test for debug session `cmd-slash-not-reaching-child`.
// Obsidian's Scope-based hotkey for `editor:toggle-comments` intercepts Cmd-/
// at the document level and dispatches to the parent MarkdownView's editor,
// inserting `%% %%` at the parent's stale selection in `## Notes`. The fix
// adds an EditorView.domEventHandlers keydown listener to the child editor
// that intercepts Mod-/ at the contentDOM keydown phase, runs
// toggleLineComment on the child directly, and stops propagation so
// Obsidian's hotkey is never reached.
describe('cmd-slash-not-reaching-child regression', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- matches existing source-inspection pattern in childEditorSync.test.ts
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- matches existing source-inspection pattern in childEditorSync.test.ts
  const path = require('path');
  const factorySource = fs.readFileSync(
    path.join(__dirname, '../../src/main/childEditorFactory.ts'),
    'utf8',
  );

  it('imports toggleLineComment from @codemirror/commands', () => {
    expect(factorySource).toMatch(/toggleLineComment/);
    expect(factorySource).toMatch(/from '@codemirror\/commands'/);
  });

  it('uses a ViewPlugin lifecycle for Mod-/ Scope intercept', () => {
    expect(factorySource).toMatch(/ViewPlugin\.define/);
  });

  it('pushes an Obsidian Scope on focus and pops on blur', () => {
    expect(factorySource).toMatch(/app\.keymap\.pushScope/);
    expect(factorySource).toMatch(/app\.keymap\.popScope/);
    expect(factorySource).toMatch(/contentDOM\.addEventListener\('focus'/);
    expect(factorySource).toMatch(/contentDOM\.addEventListener\('blur'/);
  });

  it('registers Mod-/ inside the Scope to run toggleLineComment', () => {
    expect(factorySource).toMatch(/scope\.register\(\['Mod'\], '\/'/);
    expect(factorySource).toMatch(/runComment\(view\)/);
  });

  it('runs toggleLineComment on the child view via cast', () => {
    expect(factorySource).toMatch(/toggleLineComment as unknown as/);
  });

  it('cleans up Scope and listeners on ViewPlugin destroy', () => {
    expect(factorySource).toMatch(/destroy\(\)/);
    expect(factorySource).toMatch(/removeEventListener\('focus'/);
    expect(factorySource).toMatch(/removeEventListener\('blur'/);
  });
});
