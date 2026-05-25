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
    // Phase 17 Plan 12 (LINENUM-01) — line-number gutter conditional, mirrors
    // the D-18 vim mount pattern. The mock factory function returns a sentinel
    // string so the conditional spread inside createChildEditor's extensions
    // array can be asserted by sentinel value (parallel to drawSelection /
    // highlightActiveLine mocks above).
    lineNumbers: vi.fn().mockReturnValue('mock-line-numbers'),
    ViewPlugin: {
      define: vi.fn().mockReturnValue('mock-view-plugin'),
      // Phase 17 Plan 10 round-3 — Decoration.mark layer for Obsidian-
      // compatible semantic class names uses ViewPlugin.fromClass; mock
      // it as a sentinel so the factory build path can mount the module.
      fromClass: vi.fn().mockReturnValue('mock-view-plugin-from-class'),
    },
    Decoration: {
      mark: vi.fn().mockReturnValue({ range: vi.fn().mockReturnValue({}) }),
      line: vi.fn().mockReturnValue({}),
      widget: vi.fn().mockReturnValue({}),
    },
  };
});

vi.mock('@codemirror/state', () => ({
  EditorState: { create: vi.fn().mockReturnValue({ doc: 'mock-state' }) },
}));

// Phase 17 Plan 03: `indentUnit` is now imported by the factory itself
// (read by customTabCommand mid-line branch via state.facet). Re-exposed in
// the mock for that reason. Phase 17 Plan 05 (D-15): `syntaxHighlighting` +
// `defaultHighlightStyle` are no longer imported by childEditorFactory —
// the themed highlight + bracket-match contrast theme are now produced by
// createThemedHighlight() from src/main/childEditorTheme (mocked below).
// `bracketMatching` stays here (Pitfall 5 — bracketMatching firing logic
// remains at childEditorFactory.ts:178).
vi.mock('@codemirror/language', () => ({
  bracketMatching: vi.fn().mockReturnValue('mock-bracket-matching'),
  indentUnit: { of: vi.fn().mockReturnValue('mock-indent-unit-extension') },
}));

vi.mock('@codemirror/commands', () => ({
  history: vi.fn().mockReturnValue('mock-history-extension'),
  // Phase 17 Plan 03 (D-11/D-12): the bare `indentWithTab` keymap was
  // replaced by a customTabCommand that branches on cursor position. The
  // factory now imports `indentMore`, `indentLess` (no longer `insertTab`
  // — see RULE 1 deviation in childEditorFactory.ts: CM6's insertTab
  // hardcodes `\t` and ignores indentUnit; we read the facet ourselves).
  indentMore: vi.fn().mockReturnValue(true),
  indentLess: vi.fn().mockReturnValue(true),
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

// Phase 17 Plan 05 (D-15/D-16): childEditorTheme module owns the themed
// HighlightStyle + bracket-match contrast theme. Spread into the factory's
// extensions array as `...createThemedHighlight()`. Mock returns two sentinel
// strings so the spread is verifiable.
vi.mock('../../src/main/childEditorTheme', () => ({
  createThemedHighlight: vi
    .fn()
    .mockReturnValue(['mock-themed-syntax-highlighting', 'mock-themed-bracket-match-theme']),
}));

// Phase 18 Plan 01 — childEditorVimScope is transitively loaded via the
// factory's import. We mock the helper directly with a sentinel so the
// factory's conditional spread can be asserted without dragging in the
// real 'obsidian' Scope class or @replit/codemirror-vim package surface
// (both of which would require their own deep mocks: StateField, etc.).
vi.mock('../../src/main/childEditorVimScope', () => ({
  createVimScopeExtension: vi.fn().mockReturnValue('mock-vim-scope-extension'),
}));

// Import module under test and mocked modules AFTER vi.mock declarations
import {
  createChildEditor,
  customTabCommand,
  customShiftTabCommand,
} from '../../src/main/childEditorFactory';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  lineNumbers,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { bracketMatching } from '@codemirror/language';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { languageCompartment, buildLanguageExtensions } from '../../src/main/childEditorLanguage';
import { closeBracketsKeymap } from '@codemirror/autocomplete';
import { createScrollIntoViewExtension } from '../../src/main/childEditorSync';
import { createThemedHighlight } from '../../src/main/childEditorTheme';

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

  it('spreads createThemedHighlight() into extensions (Phase 17 D-15/D-16)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    // The factory replaces the Phase-13/16 `syntaxHighlighting(default
    // HighlightStyle)` line with `...createThemedHighlight()`. The themed
    // highlight module owns both the Lezer-tag→CSS-variable HighlightStyle
    // (D-15) and the high-contrast `.cm-matchingBracket` theme (D-16).
    // Verifies: factory invokes the theme factory exactly once, and both
    // sentinels appear in the extensions array (spread, not nested).
    expect(createThemedHighlight).toHaveBeenCalledOnce();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-themed-syntax-highlighting');
    expect(createArgs.extensions).toContain('mock-themed-bracket-match-theme');
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
    // Main keymap is the keymap.of call that contains the customTabCommand
    // KeyBinding object plus the spread defaultKeymap + historyKeymap. The
    // closeBracketsKeymap call is a separate top-level keymap.of invocation.
    const allCalls = (keymap.of as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const mainKeymap = allCalls.find(
      (arr: unknown) =>
        Array.isArray(arr) &&
        arr.some(
          (entry: unknown) =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as { run?: unknown }).run === customTabCommand,
        ),
    );
    expect(mainKeymap).toBeDefined();
    expect(mainKeymap).toEqual(expect.arrayContaining(defaultKeymap as []));
    expect(mainKeymap).toEqual(expect.arrayContaining(historyKeymap as []));
  });

  it('includes customTabCommand as first entry in main keymap (Phase 15 priority + Phase 17 D-11)', () => {
    createChildEditor('code', parent, 'python3', 'auto');

    expect(keymap.of).toHaveBeenCalled();
    const allCalls = (keymap.of as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    const mainKeymap = allCalls.find(
      (arr: unknown) =>
        Array.isArray(arr) &&
        arr.some(
          (entry: unknown) =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry as { run?: unknown }).run === customTabCommand,
        ),
    ) as unknown[] | undefined;
    expect(mainKeymap).toBeDefined();
    // The customTabCommand KeyBinding must be the FIRST entry — preserves the
    // Phase 15 D-05 priority (Tab does NOT trigger focus-nav) and lets the
    // Phase 17 D-11 cursor-position branching run before defaultKeymap.
    const first = mainKeymap![0] as { key?: string; run?: unknown; shift?: unknown };
    expect(first.key).toBe('Tab');
    expect(first.run).toBe(customTabCommand);
    expect(first.shift).toBe(customShiftTabCommand);
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
    // Phase 17 Plan 03: the main keymap's first entry is the
    // customTabCommand KeyBinding object, not the bare indentWithTab. Detect
    // by structural shape (has `run === customTabCommand`).
    const mainCallIdx = (keymap.of as ReturnType<typeof vi.fn>).mock.calls
      .findIndex(
        (c) =>
          Array.isArray(c[0]) &&
          (c[0] as unknown[]).some(
            (entry) =>
              typeof entry === 'object' &&
              entry !== null &&
              (entry as { run?: unknown }).run === customTabCommand,
          ),
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

// Phase 17 Plan 11 — Source-level regression tests for 17-UAT.md Issues 5 + 6
// (Test 17 vim Insert-mode caret render + Test 20 sibling vim mode-indicator
// panel missing). Both fixes touch the same vim mount block in
// src/main/childEditorFactory.ts:235-261 (Plan 17-06 D-18 ship-vim branch)
// and the same .lc-nested-editor CSS scope in styles.css. These tests assert
// the post-fix state via fs.readFileSync, mirroring the source-inspection
// pattern established by Plan 17-05 / 17-10 (childEditorTheme.test.ts) —
// vim()'s output is opaque CM6 Extensions, and the cursor-render bug is a
// CSS measure-pass timing issue not unit-testable through CM6 mocks.
describe('Phase 17 Plan 11 — vim panel + cursor visibility (17-UAT Issues 5 + 6)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- matches existing source-inspection pattern in childEditorSync.test.ts
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- matches existing source-inspection pattern in childEditorSync.test.ts
  const path = require('path');
  const factorySource: string = fs.readFileSync(
    path.join(__dirname, '../../src/main/childEditorFactory.ts'),
    'utf8',
  );
  const stylesSource: string = fs.readFileSync(
    path.join(__dirname, '../../styles.css'),
    'utf8',
  );

  it('vim() is called with { status: true } when vimMode is enabled — Issue 6 (cm-vim-panel)', () => {
    // Allow whitespace variation around the option-object syntax. The fix
    // replaces the Phase 17-06 bare `vim()` call with `vim({ status: true })`
    // so the @replit/codemirror-vim package adds showPanel(statusPanel) to
    // the extension array (the panel renders -- NORMAL -- / -- INSERT -- at
    // the bottom of the child editor).
    expect(factorySource).toMatch(
      /vim\(\s*\{\s*status\s*:\s*true\s*\}(?:\s*as\s+[^)]+)?\s*\)/,
    );

    // Plan 17-06 invariant — vim is still gated on vimEnabled. Extract the
    // conditional spread region with a non-greedy match that allows nested
    // square brackets inside the call args (e.g. `Parameters<typeof vim>[0]`
    // type cast — the `[0]` is INSIDE the call, not the outer ternary array).
    const conditionalMatch = factorySource.match(
      /vimEnabled\s*\?\s*\[([\s\S]*?)\]\s*:\s*\[\s*\]/,
    );
    expect(conditionalMatch).not.toBeNull();
    const inside = conditionalMatch![1];
    expect(inside).toMatch(
      /vim\(\s*\{\s*status\s*:\s*true\s*\}(?:\s*as\s+[^)]+)?\s*\)/,
    );
  });

  it('styles.css contains .cm-vim-panel rule scoped under .lc-nested-editor — Issue 6 cosmetic', () => {
    // Descendant selector under .lc-nested-editor so the panel only styles
    // inside the child editor (not Obsidian's parent or other CM6 instances).
    expect(stylesSource).toMatch(/\.lc-nested-editor[^{]*\.cm-vim-panel\s*\{/);

    // Extract the rule body and assert at least one real declaration —
    // proves it's not an empty placeholder.
    const ruleMatch = stylesSource.match(
      /\.lc-nested-editor[^{]*\.cm-vim-panel\s*\{([^}]+)\}/,
    );
    expect(ruleMatch).not.toBeNull();
    const body = ruleMatch![1];
    // Allow font-family too — the plan's reference rule sets
    // font-family/font-size/padding/background/color/border-top.
    expect(body).toMatch(/(?:font-family|font-size|padding|background|color)/);
  });

  it('styles.css forces .cm-cursor / .cm-fat-cursor visibility under .lc-nested-editor — Issue 5 cursor render', () => {
    // The fix forces opacity:1 / visibility:visible so vim's late measure-pass
    // timing cannot leave the Insert-mode caret transparent. Either rule
    // suffices to address the timing race (the plan's reference uses both).
    // Match a CSS rule whose selector chain mentions .lc-nested-editor and
    // either .cm-cursor or .cm-fat-cursor, with opacity:1 OR visibility:visible
    // in the body. The selector list may include multiple comma-separated
    // selectors — we tolerate that via a non-greedy character class.
    expect(stylesSource).toMatch(
      /\.lc-nested-editor[^{]*\.cm-(?:fat-)?cursor[^{]*\{[^}]*(?:opacity\s*:\s*1|visibility\s*:\s*visible)/,
    );

    // Both selectors should appear in the visibility-forcing rule (the
    // reference rule lists them as a comma-separated selector group).
    expect(stylesSource).toMatch(/\.cm-cursor/);
    expect(stylesSource).toMatch(/\.cm-fat-cursor/);
  });

  it('preserves Plan 17-06 D-18 conditional gating — vim only included when getConfig(vimMode) === true', () => {
    // Plan 17-06 invariant guard. Tasks 2 + 3 of this plan must NOT regress
    // the conditional spread that gates vim on Obsidian's vimMode setting.
    // Tolerate multi-line call formatting (`getConfig(\n  'vimMode',\n)` —
    // prettier wraps the long cast chain across lines).
    expect(factorySource).toMatch(/getConfig\([\s\S]{0,80}'vimMode'/);
    // The strict `=== true` check — vimMode read returns unknown; cast +
    // strict equality protects against truthy-but-non-true values. Allow
    // the call's `)` to land anywhere after the literal before `=== true`.
    expect(factorySource).toMatch(
      /getConfig\([\s\S]{0,80}'vimMode'[\s\S]{0,80}\)\s*===\s*true/,
    );
    // vimEnabled appears at minimum: const vimEnabled = ..., and the
    // conditional spread `vimEnabled ? [...] : []`. >= 2 occurrences
    // confirms both the declaration and the gate are still in use after
    // Tasks 2 + 3 land. (The plan's >= 3 estimate counted JSDoc/comment
    // refs that the actual source did not include in 17-06.)
    const vimEnabledCount = (factorySource.match(/vimEnabled/g) ?? []).length;
    expect(vimEnabledCount).toBeGreaterThanOrEqual(2);
  });
});

// Phase 17 Plan 12 — Line-numbers conditional via Obsidian's `showLineNumber`
// global setting (LINENUM-01). Mirrors the D-18 vim mount pattern from Plan
// 17-06 verbatim — read once at child mount, conditionally spread the
// lineNumbers() extension into the EditorState extensions array. No reactivity:
// toggling Obsidian's setting at runtime requires note remount (Cmd-E flip
// or close+reopen) — this is identical to vim's contract and is intentional.
describe('createChildEditor — lineNumbers conditional (Phase 17 Plan 12 / LINENUM-01)', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    parent = document.createElement('div');
  });

  it('includes lineNumbers extension when app.vault.getConfig("showLineNumber") === true at mount', () => {
    // Build the mock app shape exactly as the D-18 vim mount pattern uses it.
    // getConfig returns true ONLY for showLineNumber (so vimMode and any
    // other key resolves false → vim conditional stays OFF in this test).
    const getConfig = vi.fn((key: string) => key === 'showLineNumber');
    const mockApp = { vault: { getConfig } } as unknown as Parameters<typeof createChildEditor>[4];

    createChildEditor('code', parent, 'python3', 'auto', mockApp);

    // Assert the literal key was consulted at least once.
    expect(getConfig).toHaveBeenCalledWith('showLineNumber');

    // Assert the lineNumbers sentinel landed inside the extensions array.
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).toContain('mock-line-numbers');

    // Assert the lineNumbers factory was invoked (the conditional fired GREEN).
    expect(lineNumbers).toHaveBeenCalled();
  });

  it('excludes lineNumbers extension when app.vault.getConfig("showLineNumber") === false at mount', () => {
    // Typed argument so TS knows mock.calls entries are [string], not [].
    const getConfig = vi.fn((_key: string) => false);
    const mockApp = { vault: { getConfig } } as unknown as Parameters<typeof createChildEditor>[4];

    createChildEditor('code', parent, 'python3', 'auto', mockApp);

    // The conditional spread is `lineNumbersEnabled ? [lineNumbers()] : []` —
    // when the gate is false, lineNumbers() is never invoked.
    expect(lineNumbers).not.toHaveBeenCalled();

    // And the sentinel never appears in the extensions array.
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).not.toContain('mock-line-numbers');
  });

  it('excludes lineNumbers when app is undefined — backward-compatible test fixture path', () => {
    // The factory's existing test fixtures (lines 115-251) all call without
    // `app`. The new conditional must guard `!!app && ...` like the D-18 vim
    // gate, otherwise these legacy fixtures would crash on mockApp.vault access.
    createChildEditor('code', parent, 'python3', 'auto');

    expect(lineNumbers).not.toHaveBeenCalled();
    const createArgs = (EditorState.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArgs.extensions).not.toContain('mock-line-numbers');
  });

  it('calls app.vault.getConfig("showLineNumber") exactly once per createChildEditor call', () => {
    // Pin the read-once-at-mount semantic. Toggling the Obsidian setting
    // while a child is open does NOT take effect until the child remounts —
    // the gating must read the config exactly once per createChildEditor
    // invocation, never on a listener / metadataCache event.
    // Typed argument so TS knows mock.calls entries are [string], not [].
    const getConfig = vi.fn((_key: string) => true);
    const mockApp = { vault: { getConfig } } as unknown as Parameters<typeof createChildEditor>[4];

    createChildEditor('code', parent, 'python3', 'auto', mockApp);

    const showLineNumberCalls = getConfig.mock.calls.filter(
      (c) => c[0] === 'showLineNumber',
    ).length;
    expect(showLineNumberCalls).toBe(1);
  });
});
