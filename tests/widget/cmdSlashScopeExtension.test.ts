// Debug session cmd-slash-widget-toggle-comment — regression tests for the
// Mod-/ Obsidian Scope intercept ported into the v1.3 widget.
//
// What we verify
// --------------
//   1. createCmdSlashScopeExtension(null) → returns [] (no-op for test
//      fixtures + read-only mounts that lack a real App).
//   2. createCmdSlashScopeExtension(app) returns a CM6 Extension that, when
//      driven by a fake EditorView lifecycle, calls
//      `app.keymap.pushScope(scope)` on contentDOM focus and
//      `app.keymap.popScope(scope)` on contentDOM blur.
//   3. The Scope is registered with `'Mod' + '/'` and the registered handler
//      runs `toggleLineComment` against the view, returning false to stop
//      Obsidian's app-level dispatch.
//   4. ViewPlugin.destroy detaches focus/blur listeners AND pops any still-
//      active scope (defensive teardown for focus-while-destroyed edge).
//   5. If contentDOM is already activeElement at construction, the focus
//      path runs immediately (parking-lot adoption / mount-then-focus race).
//
// Mocking strategy
// ----------------
// We mock the heavy `'@codemirror/view'` and `'obsidian'` modules so the
// assertions can read call args directly. `ViewPlugin.define(buildFn)` is
// implemented as the identity that exposes buildFn — the test invokes
// buildFn(view) directly and asserts on the resulting PluginValue + the
// captured side effects.

import { describe, it, expect, vi, beforeEach } from 'vitest';

type ScopeRegisterCall = {
  modifiers: string[];
  key: string;
  cb: (event: KeyboardEvent) => unknown;
};

// vi.hoisted lets us define MockScope BEFORE vi.mock runs (vi.mock is
// hoisted to the very top of the module by vitest; vi.hoisted runs even
// earlier so the factory can reference our class without an init race).
const { MockScope } = vi.hoisted(() => {
  class MockScope {
    static created: MockScope[] = [];
    parent: MockScope | undefined;
    registered: ScopeRegisterCall[] = [];
    constructor(parent?: MockScope) {
      this.parent = parent;
      MockScope.created.push(this);
    }
    register(
      modifiers: string[],
      key: string,
      cb: (event: KeyboardEvent) => unknown,
    ): unknown {
      this.registered.push({ modifiers, key, cb });
      return { _handle: this.registered.length };
    }
  }
  return { MockScope };
});
type MockScopeT = InstanceType<typeof MockScope>;

vi.mock('obsidian', () => ({
  Scope: MockScope,
}));

vi.mock('@codemirror/commands', () => ({
  toggleLineComment: vi.fn().mockReturnValue(true),
}));

vi.mock('@codemirror/view', () => ({
  ViewPlugin: {
    // Identity wrapper — the test directly invokes the build function on
    // the fake view and inspects the returned PluginValue.
    define: (buildFn: unknown) => ({ __buildFn: buildFn }),
  },
}));

import { createCmdSlashScopeExtension } from '../../src/widget/cmdSlashScopeExtension';
import { toggleLineComment } from '@codemirror/commands';

interface FakeEditorView {
  contentDOM: HTMLElement;
}

interface FakeApp {
  scope: MockScopeT;
  keymap: {
    pushScope: ReturnType<typeof vi.fn>;
    popScope: ReturnType<typeof vi.fn>;
  };
}

function makeFakeApp(): FakeApp {
  return {
    scope: new MockScope(),
    keymap: {
      pushScope: vi.fn(),
      popScope: vi.fn(),
    },
  };
}

function makeFakeView(): FakeEditorView {
  return {
    contentDOM: document.createElement('div'),
  };
}

function instantiate(
  ext: unknown,
  view: FakeEditorView,
): { destroy?: () => void } {
  // The mocked ViewPlugin.define returns `{ __buildFn: buildFn }`.
  const buildFn = (ext as { __buildFn: (v: FakeEditorView) => unknown })
    .__buildFn;
  return buildFn(view) as { destroy?: () => void };
}

beforeEach(() => {
  MockScope.created.length = 0;
  vi.clearAllMocks();
});

describe('createCmdSlashScopeExtension — null app shortcut', () => {
  it('returns an empty array when app is null', () => {
    const ext = createCmdSlashScopeExtension(null);
    expect(Array.isArray(ext)).toBe(true);
    expect((ext as unknown[]).length).toBe(0);
  });

  it('returns an empty array when app is undefined', () => {
    const ext = createCmdSlashScopeExtension(undefined);
    expect(Array.isArray(ext)).toBe(true);
    expect((ext as unknown[]).length).toBe(0);
  });
});

describe('createCmdSlashScopeExtension — focus → pushScope', () => {
  it('on contentDOM focus, constructs a Scope parented to app.scope and pushes it', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);

    // Trigger focus.
    view.contentDOM.dispatchEvent(new Event('focus'));

    // A new MockScope was constructed parented to app.scope.
    // (MockScope.created[0]! is app.scope itself; index 1 is our new one.)
    expect(MockScope.created.length).toBe(2);
    const scope = MockScope.created[1]!;
    expect(scope.parent).toBe(app.scope);

    // pushScope was called once with our new scope.
    expect(app.keymap.pushScope).toHaveBeenCalledTimes(1);
    expect(app.keymap.pushScope).toHaveBeenCalledWith(scope);
  });

  it('registers Mod-/ on the scope with a handler that runs toggleLineComment', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);
    view.contentDOM.dispatchEvent(new Event('focus'));

    const scope = MockScope.created[1]!;
    expect(scope.registered).toHaveLength(1);
    expect(scope.registered[0]!.modifiers).toEqual(['Mod']);
    expect(scope.registered[0]!.key).toBe('/');

    // Invoke the registered handler with a Mod event — toggleLineComment
    // should fire and the handler should return false (stops Obsidian
    // from continuing dispatch to its own toggle-comments handler).
    const result = scope.registered[0]!.cb({
      metaKey: true,
      ctrlKey: false,
    } as KeyboardEvent);
    expect(toggleLineComment).toHaveBeenCalledTimes(1);
    expect(result).toBe(false);
  });

  it('Scope handler returns true (passthrough) when the event has no Mod modifier', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);
    view.contentDOM.dispatchEvent(new Event('focus'));

    const scope = MockScope.created[1]!;
    const result = scope.registered[0]!.cb({
      metaKey: false,
      ctrlKey: false,
    } as KeyboardEvent);
    expect(toggleLineComment).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('does not double-push when focus fires twice without intervening blur', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);

    view.contentDOM.dispatchEvent(new Event('focus'));
    view.contentDOM.dispatchEvent(new Event('focus'));
    expect(app.keymap.pushScope).toHaveBeenCalledTimes(1);
  });
});

describe('createCmdSlashScopeExtension — blur → popScope', () => {
  it('on contentDOM blur, pops the scope it pushed on focus', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);

    view.contentDOM.dispatchEvent(new Event('focus'));
    const scope = MockScope.created[1]!;
    view.contentDOM.dispatchEvent(new Event('blur'));

    expect(app.keymap.popScope).toHaveBeenCalledTimes(1);
    expect(app.keymap.popScope).toHaveBeenCalledWith(scope);
  });

  it('blur without prior focus is a no-op (no popScope call)', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);

    view.contentDOM.dispatchEvent(new Event('blur'));
    expect(app.keymap.popScope).not.toHaveBeenCalled();
  });

  it('focus → blur → focus pushes a fresh scope each focus', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);

    view.contentDOM.dispatchEvent(new Event('focus'));
    view.contentDOM.dispatchEvent(new Event('blur'));
    view.contentDOM.dispatchEvent(new Event('focus'));

    expect(app.keymap.pushScope).toHaveBeenCalledTimes(2);
    expect(app.keymap.popScope).toHaveBeenCalledTimes(1);
    // A fresh Scope is constructed each time the focus path runs.
    // MockScope.created: [app.scope, scope1, scope2].
    expect(MockScope.created.length).toBe(3);
  });
});

describe('createCmdSlashScopeExtension — destroy', () => {
  it('destroy detaches focus/blur listeners (subsequent focus does NOT pushScope)', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    const plugin = instantiate(ext, view);

    plugin.destroy?.();

    view.contentDOM.dispatchEvent(new Event('focus'));
    expect(app.keymap.pushScope).not.toHaveBeenCalled();
  });

  it('destroy pops any still-active scope (focus-while-destroyed edge)', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    const ext = createCmdSlashScopeExtension(app as never);
    const plugin = instantiate(ext, view);

    view.contentDOM.dispatchEvent(new Event('focus'));
    expect(app.keymap.pushScope).toHaveBeenCalledTimes(1);

    plugin.destroy?.();
    expect(app.keymap.popScope).toHaveBeenCalledTimes(1);
  });
});

describe('createCmdSlashScopeExtension — initial-focus race', () => {
  it('runs the focus path immediately when contentDOM is already activeElement at construction', () => {
    const app = makeFakeApp();
    const view = makeFakeView();
    // Make contentDOM the activeElement BEFORE instantiating the plugin.
    document.body.appendChild(view.contentDOM);
    view.contentDOM.tabIndex = 0;
    view.contentDOM.focus();
    expect(document.activeElement).toBe(view.contentDOM);

    const ext = createCmdSlashScopeExtension(app as never);
    instantiate(ext, view);

    // pushScope fires immediately even though no focus event was dispatched
    // — this covers the parking-lot adoption / mount-then-focus race.
    expect(app.keymap.pushScope).toHaveBeenCalledTimes(1);

    // Cleanup.
    view.contentDOM.blur();
    view.contentDOM.remove();
  });
});
