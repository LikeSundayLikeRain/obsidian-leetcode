// Phase 18 Plan 01 — VIM-INTERACTION-01 / closes UAT Test 17 / VIM-01 (backlog 999.2).
//
// Source-level + behavioral assertions for the new Vim Scope intercept module
// at `src/main/childEditorVimScope.ts`. Mirrors the source-inspection pattern
// established by the `cmd-slash-not-reaching-child regression` describe block
// at `tests/main/childEditorFactory.test.ts:394-434` (the original D-32
// precedent). The shape is identical: read the module source via
// `fs.readFileSync`, then regex-match the expected idioms.
//
// CONTEXT.md D-32 (locked decision): the fix MUST be a Scope-based intercept
// pushed onto `app.keymap` on contentDOM focus and popped on blur — NOT a
// DOM-level keydown listener. Obsidian's app-level vim handler runs in the
// Scope-managed pipeline, so DOM keydown interception cannot reliably win.
// This test file codifies the locked shape so a future contributor cannot
// regress to the DOM-keydown approach without also rewriting these tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- matches existing source-inspection pattern in childEditorFactory.test.ts
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- matches existing source-inspection pattern in childEditorFactory.test.ts
const path = require('path');

// ----------------------------------------------------------------------------
// Source-level describe block — mirrors childEditorFactory.test.ts:394-434.
// All assertions FAIL on current main because the module does not exist yet.
// They flip GREEN after Task 2 (createVimScopeExtension implementation).
// ----------------------------------------------------------------------------

describe('childEditorVimScope module — source-level (Phase 18 Plan 01 / VIM-INTERACTION-01)', () => {
  const modulePath = path.join(__dirname, '../../src/main/childEditorVimScope.ts');

  it('module exists at src/main/childEditorVimScope.ts (closes UAT Test 17 / VIM-01)', () => {
    // D-32: the fix lives in its own module so childEditorFactory.ts stays legible.
    expect(fs.existsSync(modulePath)).toBe(true);
  });

  it('imports the runtime Scope constructor from \'obsidian\' (D-32 — same shape as factory.ts:165)', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    // Either an `import { ... Scope ... } from 'obsidian'` OR a runtime
    // `require('obsidian')` destructure — match both shapes (the factory.ts
    // precedent uses the runtime require because Scope is also a value).
    expect(source).toMatch(/from 'obsidian'|require\('obsidian'\)/);
    expect(source).toMatch(/\bScope\b/);
  });

  it('uses ViewPlugin.define lifecycle (mirrors createCmdSlashScopeExtension at factory.ts:154 — D-32)', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/ViewPlugin\.define/);
  });

  it('pushes a Scope on focus and pops on blur via app.keymap (D-32 — locked Scope-based intercept)', () => {
    // UAT Test 17 / VIM-01: focus is correct (document.activeElement IS in
    // .lc-nested-editor) but vim keys still leak. Fix is Scope-based push/pop
    // on contentDOM focus/blur — same mechanism as the cmd-slash precedent.
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/app\.keymap\.pushScope/);
    expect(source).toMatch(/app\.keymap\.popScope/);
    expect(source).toMatch(/contentDOM\.addEventListener\('focus'/);
    expect(source).toMatch(/contentDOM\.addEventListener\('blur'/);
  });

  it('registers vim navigation/edit keys inside the Scope (j/k/d/o appear — D-32)', () => {
    // UAT Test 17 / VIM-01 reproduction: pressing j/dd/o leaks to parent.
    // The Scope must register these vim keys so they route to the child's
    // vim instance instead. Tolerate either per-key `scope.register` calls
    // or an array-driven loop that lists the literals.
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/scope\.register/);
    expect(source).toMatch(/'j'/);
    expect(source).toMatch(/'k'/);
    expect(source).toMatch(/'d'/);
    expect(source).toMatch(/'o'/);
  });

  it('does NOT use DOM-level keydown interception (D-32 explicit prohibition)', () => {
    // D-32: a capture-phase or bubble-phase DOM keydown listener was tried and
    // shown insufficient (the original cmd-slash debug session — iteration 2).
    // Only Scope-based intercept reliably wins. Regression guard.
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).not.toMatch(/addEventListener\('keydown'/);
    expect(source).not.toMatch(/addEventListener\("keydown"/);
  });

  it('routes intercepted keys into the child vim instance via @replit/codemirror-vim public API', () => {
    // The Scope handler MUST forward the keystroke to the child's vim. Public
    // API options from the package: `Vim.handleKey(cm, key, origin)` OR
    // dispatching a synthetic KeyboardEvent on the child contentDOM. Either
    // shape is acceptable per the planner's assumption #1 — the test tolerates
    // both by matching either token. (UAT Test 17 / VIM-01 closure.)
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/Vim\.handleKey|handleKey\(|dispatchEvent\(/);
  });

  it('registers :set nu / :set nonu ex-aliases via Vim.defineEx (bonus — VIM-01 secondary finding)', () => {
    // UAT Test 17 / VIM-01 secondary: `:set nu` errors with "unknown option:
    // nu" because @replit/codemirror-vim only ships full `:set number`. Fix:
    // register `Vim.defineEx('set', 'se', handler)` that parses 'nu' / 'nonu'
    // and toggles the gutter. The literals 'set', 'se', 'nu', 'nonu' must
    // appear in the file even if the registration shape is dictionary-driven.
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/defineEx/);
    expect(source).toMatch(/'set'/);
    expect(source).toMatch(/'se'/);
    expect(source).toMatch(/'nu'/);
    expect(source).toMatch(/'nonu'/);
  });

  it('cleans up Scope and listeners on ViewPlugin destroy (mirrors factory.ts:188-197 — D-32)', () => {
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/destroy\(\)/);
    expect(source).toMatch(/removeEventListener\('focus'/);
    expect(source).toMatch(/removeEventListener\('blur'/);
  });

  it('guards Vim.defineEx idempotency across mounts (try/catch OR module-scoped flag)', () => {
    // PITFALL: Vim.defineEx may throw on duplicate registration across module
    // re-evaluation. Guard with a module-scoped flag like `aliasesRegistered`
    // OR wrap the call in try/catch. (UAT Test 17 / VIM-01 idempotency.)
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/aliasesRegistered|try\s*\{[\s\S]*?defineEx|defineEx[\s\S]*?\}\s*catch/);
  });

  it('citations in source: D-32 and Plan 18-01 / VIM-01 referenced in comments', () => {
    // Future contributors must see the locked-decision context inline.
    const source = fs.readFileSync(modulePath, 'utf8');
    expect(source).toMatch(/D-32|18-01|VIM-01|VIM-INTERACTION-01/);
  });
});

// ----------------------------------------------------------------------------
// Wiring describe block — assert childEditorFactory.ts imports and conditionally
// spreads `createVimScopeExtension` adjacent to the existing
// `createCmdSlashScopeExtension(app)` spread, gated on `app && vimEnabled`.
// ----------------------------------------------------------------------------

describe('childEditorFactory wiring — createVimScopeExtension spread (Phase 18 Plan 01)', () => {
  const factoryPath = path.join(__dirname, '../../src/main/childEditorFactory.ts');

  it('imports createVimScopeExtension from ./childEditorVimScope', () => {
    const source = fs.readFileSync(factoryPath, 'utf8');
    expect(source).toMatch(/from '\.\/childEditorVimScope'/);
    expect(source).toMatch(/createVimScopeExtension/);
  });

  it('conditionally spreads createVimScopeExtension when app && vimEnabled (D-32)', () => {
    // Locked design (D-32): plain (non-vim) child editors NEVER push a vim
    // Scope onto app.keymap. The conditional MUST gate on vimEnabled.
    const source = fs.readFileSync(factoryPath, 'utf8');
    // Match either order: `app && vimEnabled` or `vimEnabled && app`.
    expect(source).toMatch(
      /(app\s*&&\s*vimEnabled|vimEnabled\s*&&\s*app)\s*\?\s*\[\s*createVimScopeExtension/,
    );
  });

  it('createVimScopeExtension wiring lives next to createCmdSlashScopeExtension spread', () => {
    // Placement convention from CONTEXT.md plan: adjacent to the existing
    // cmd-slash Scope spread at factory.ts:315 — both share the "push Scope
    // on focus" lifecycle, so they cluster for readability.
    const source = fs.readFileSync(factoryPath, 'utf8');
    const cmdSlashIdx = source.indexOf('createCmdSlashScopeExtension(app)');
    const vimScopeIdx = source.indexOf('createVimScopeExtension');
    expect(cmdSlashIdx).toBeGreaterThan(-1);
    expect(vimScopeIdx).toBeGreaterThan(-1);
    // Within ~400 chars (a handful of lines + the conditional spread).
    expect(Math.abs(vimScopeIdx - cmdSlashIdx)).toBeLessThan(400);
  });
});

// ----------------------------------------------------------------------------
// Behavioral describe block — load the new module under mocked 'obsidian' +
// '@replit/codemirror-vim' and exercise the focus/blur Scope lifecycle plus
// the registered key handler routing.
// ----------------------------------------------------------------------------

interface RegisteredHandler {
  modifiers: string[];
  key: string;
  handler: (event: KeyboardEvent) => boolean | undefined;
}

vi.mock('obsidian', () => {
  // Mock Scope records all `register` calls so the test can introspect
  // which keys/modifiers were registered and invoke the handlers directly.
  class MockScope {
    parent: unknown;
    handlers: RegisteredHandler[] = [];
    constructor(parent: unknown) {
      this.parent = parent;
    }
    register(modifiers: string[], key: string, handler: (event: KeyboardEvent) => boolean | undefined): void {
      this.handlers.push({ modifiers, key, handler });
    }
  }
  return { Scope: MockScope };
});

vi.mock('@replit/codemirror-vim', () => {
  // Stand-in for the Vim namespace and getCM extractor. We don't need a real
  // CodeMirror wrapper — the handler should pass *something* identifiable to
  // Vim.handleKey so the test can confirm the route happened.
  const handleKey = vi.fn();
  const defineEx = vi.fn();
  return {
    Vim: {
      handleKey,
      defineEx,
    },
    getCM: vi.fn().mockReturnValue({ __mockCm: true }),
    // The factory imports `vim()` for the extension; harmless stub.
    vim: vi.fn().mockReturnValue('mock-vim-extension'),
  };
});

vi.mock('@codemirror/view', async () => {
  // Capture the ViewPlugin.define factory so the test can invoke it directly
  // with a mock view (matches the cmd-slash test pattern in spirit).
  const captured: { factory: ((view: unknown) => unknown) | null } = { factory: null };
  return {
    ViewPlugin: {
      define: vi.fn((factory: (view: unknown) => unknown) => {
        captured.factory = factory;
        return { __viewPluginSentinel: true, factory };
      }),
    },
    EditorView: class MockEditorView {},
    __captured: captured,
  };
});

// Helper — load the module under test via runtime require so the test file
// can still parse + run source-level assertions even when the source module
// does not exist yet (RED state). Vitest's static import-analysis fails at
// parse-time on missing imports; CommonJS `require` is dynamic and only fails
// at the moment of invocation.
function loadModule(): { createVimScopeExtension: (app: unknown, getCm: (view: unknown) => unknown) => unknown } {
  const sourcePath = path.resolve(__dirname, '../../src/main/childEditorVimScope.ts');
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`childEditorVimScope module missing at ${sourcePath} (RED — Task 2 not yet shipped)`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../src/main/childEditorVimScope');
}

describe('createVimScopeExtension — behavioral (Phase 18 Plan 01 / D-32)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pushScope on contentDOM focus, popScope on blur — D-32 lifecycle', async () => {
    const { createVimScopeExtension } = loadModule();

    const pushScope = vi.fn();
    const popScope = vi.fn();
    const mockApp = {
      scope: { __sentinelScope: 'app' },
      keymap: { pushScope, popScope },
    };

    const contentDOM = document.createElement('div');
    const mockView = { contentDOM, cm: { __mockCm: true } };

    createVimScopeExtension(mockApp as never, () => mockView.cm);

    // Pull the captured ViewPlugin.define factory and invoke it with the mock view.
    const cmView = await import('@codemirror/view');
    const captured = (cmView as unknown as { __captured: { factory: ((v: unknown) => unknown) | null } }).__captured;
    expect(captured.factory).not.toBeNull();
    const plugin = captured.factory!(mockView) as { destroy: () => void };

    // Simulate focus → pushScope fires.
    contentDOM.dispatchEvent(new Event('focus'));
    expect(pushScope).toHaveBeenCalledTimes(1);
    expect(popScope).not.toHaveBeenCalled();

    // Simulate blur → popScope fires.
    contentDOM.dispatchEvent(new Event('blur'));
    expect(popScope).toHaveBeenCalledTimes(1);

    // destroy cleans up.
    plugin.destroy();
  });

  it('registered j-handler returns false (stops Obsidian dispatch) and routes to child vim', async () => {
    // UAT Test 17 / VIM-01: the closing assertion. When the user presses j with
    // the child focused, the Scope handler MUST stop Obsidian's app-level
    // dispatch (return false) AND route the keystroke into the child's vim.
    const { createVimScopeExtension } = loadModule();
    const obsidianMock = (await import('obsidian')) as unknown as {
      Scope: new (parent: unknown) => { handlers: RegisteredHandler[] };
    };
    const vimMock = (await import('@replit/codemirror-vim')) as unknown as {
      Vim: { handleKey: ReturnType<typeof vi.fn> };
    };

    const pushScope = vi.fn((scope: { handlers: RegisteredHandler[] }) => {
      // pushScope receives the Scope; surface it so we can introspect handlers.
      registeredScope = scope;
    });
    let registeredScope: { handlers: RegisteredHandler[] } | null = null;

    const mockApp = {
      scope: { __sentinelScope: 'app' },
      keymap: { pushScope, popScope: vi.fn() },
    };

    const contentDOM = document.createElement('div');
    const childCm = { __mockCm: 'child' };
    const mockView = { contentDOM, cm: childCm };

    createVimScopeExtension(mockApp as never, () => childCm);

    const cmView = await import('@codemirror/view');
    const captured = (cmView as unknown as { __captured: { factory: ((v: unknown) => unknown) | null } }).__captured;
    captured.factory!(mockView);

    // Trigger focus to register the scope.
    contentDOM.dispatchEvent(new Event('focus'));
    expect(registeredScope).not.toBeNull();
    expect(obsidianMock.Scope).toBeDefined();

    // Find the handler for 'j'.
    const jEntry = registeredScope!.handlers.find((h) => h.key === 'j');
    expect(jEntry).toBeDefined();

    // Invoke the handler — it MUST return false (stops Obsidian dispatch).
    const fakeEvent = { key: 'j' } as KeyboardEvent;
    const result = jEntry!.handler(fakeEvent);
    expect(result).toBe(false);

    // It MUST route the key into the child vim's handleKey.
    expect(vimMock.Vim.handleKey).toHaveBeenCalled();
    const call = vimMock.Vim.handleKey.mock.calls[0];
    expect(call).toBeDefined();
    expect(call[0]).toBe(childCm);
    expect(call[1]).toBe('j');
  });

  it('Vim.defineEx is called for the set/se ex-alias on first mount (idempotency-safe)', async () => {
    // UAT Test 17 / VIM-01 secondary finding: `:set nu` / `:set nonu` aliases.
    const { createVimScopeExtension } = loadModule();
    const vimMock = (await import('@replit/codemirror-vim')) as unknown as {
      Vim: { defineEx: ReturnType<typeof vi.fn> };
    };

    const mockApp = {
      scope: { __sentinelScope: 'app' },
      keymap: { pushScope: vi.fn(), popScope: vi.fn() },
    };

    const contentDOM = document.createElement('div');
    const mockView = { contentDOM, cm: { __mockCm: true } };

    createVimScopeExtension(mockApp as never, () => mockView.cm);
    const cmView = await import('@codemirror/view');
    const captured = (cmView as unknown as { __captured: { factory: ((v: unknown) => unknown) | null } }).__captured;
    captured.factory!(mockView);

    // Trigger focus so any focus-time registration fires.
    contentDOM.dispatchEvent(new Event('focus'));

    // Vim.defineEx must have been called with 'set' as the canonical name and
    // 'se' as the prefix (the @replit/codemirror-vim signature is
    // defineEx(name, prefix, func)).
    expect(vimMock.Vim.defineEx).toHaveBeenCalled();
    const calls = vimMock.Vim.defineEx.mock.calls;
    const setCall = calls.find(
      (c: unknown[]) => c[0] === 'set' && c[1] === 'se' && typeof c[2] === 'function',
    );
    expect(setCall).toBeDefined();
  });
});
