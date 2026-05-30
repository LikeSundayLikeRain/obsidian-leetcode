// Phase 20 Plan 20-04 (THEME-04) — theme listener unit tests.
//
// Covers the 5 behavior cases from 20-04-PLAN Task 1:
//   1. registerThemeListener(plugin) calls plugin.registerEvent with the
//      result of plugin.app.workspace.on('css-change', cb).
//   2. When the registered callback fires, widgetRegistry.values() is
//      iterated and ctl.cssRetheme() is called on every controller.
//   3. WidgetController.cssRetheme() calls only view.requestMeasure()
//      (no other view method — no rebuild).
//   4. Two registered widgets both receive a single cssRetheme() call
//      when one css-change event fires.
//   5. registerThemeListener registers exactly ONCE per plugin (idempotent
//      caller responsibility — but the function itself adds exactly one
//      `on` subscription per call).
//
// We mock obsidian (via the existing helpers/obsidian-stub.ts) and pass a
// fake plugin that captures the css-change callback so tests can invoke it.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { registerThemeListener } from '../../src/widget/themeListener';
import { WidgetRegistry } from '../../src/widget/widgetRegistry';

interface FakeCtl {
  flushNow: () => Promise<void>;
  destroy: () => void;
  file: { path: string };
  cssRetheme: ReturnType<typeof vi.fn>;
}

function makeFakeCtl(path: string): FakeCtl {
  return {
    flushNow: vi.fn(async () => undefined),
    destroy: vi.fn(),
    file: { path },
    cssRetheme: vi.fn(),
  };
}

interface FakePlugin {
  app: { workspace: { on: ReturnType<typeof vi.fn> } };
  widgetRegistry: WidgetRegistry;
  registerEvent: ReturnType<typeof vi.fn>;
}

function makeFakePlugin(): FakePlugin {
  // Capture the cb so tests can invoke it.
  const onSpy = vi.fn((_name: string, _cb: () => void) => {
    return { __eventRef: true } as unknown;
  });
  const registerEventSpy = vi.fn();
  return {
    app: { workspace: { on: onSpy } },
    widgetRegistry: new WidgetRegistry(),
    registerEvent: registerEventSpy,
  };
}

describe('Phase 20 Plan 20-04 — registerThemeListener (THEME-04)', () => {
  let plugin: FakePlugin;

  beforeEach(() => {
    plugin = makeFakePlugin();
  });

  // Behavior 1
  it('subscribes via plugin.app.workspace.on("css-change") and threads the EventRef through plugin.registerEvent', () => {
    registerThemeListener(plugin as never);
    expect(plugin.app.workspace.on).toHaveBeenCalledTimes(1);
    expect(plugin.app.workspace.on).toHaveBeenCalledWith('css-change', expect.any(Function));
    // The EventRef returned by `on` must be passed to registerEvent so plugin
    // unload auto-unregisters the listener.
    expect(plugin.registerEvent).toHaveBeenCalledTimes(1);
    const passedRef = plugin.registerEvent.mock.calls[0]![0];
    expect(passedRef).toEqual({ __eventRef: true });
  });

  // Behavior 2 + 4 — fan-out: a single css-change → cssRetheme on every widget.
  it('on css-change, walks widgetRegistry.values() and calls cssRetheme on every controller', () => {
    const c1 = makeFakeCtl('a.md');
    const c2 = makeFakeCtl('b.md');
    plugin.widgetRegistry.set('a.md::0', c1 as never);
    plugin.widgetRegistry.set('b.md::0', c2 as never);

    registerThemeListener(plugin as never);
    // Extract the captured callback (Behavior 1 confirmed it's the 2nd arg).
    const cb = plugin.app.workspace.on.mock.calls[0]![1] as () => void;

    // Pre-condition: cssRetheme not yet called.
    expect(c1.cssRetheme).not.toHaveBeenCalled();
    expect(c2.cssRetheme).not.toHaveBeenCalled();

    // Fire one css-change event.
    cb();

    expect(c1.cssRetheme).toHaveBeenCalledTimes(1);
    expect(c2.cssRetheme).toHaveBeenCalledTimes(1);
  });

  // Behavior 2 — empty registry: callback runs without error, no cssRetheme calls.
  it('on css-change with empty registry — no-op (no error)', () => {
    registerThemeListener(plugin as never);
    const cb = plugin.app.workspace.on.mock.calls[0]![1] as () => void;
    expect(() => cb()).not.toThrow();
  });

  // Behavior 2 — controllers without cssRetheme are skipped (defensive — test
  // fixtures may use the minimal WidgetControllerLike without the optional
  // method). The dispatcher must not crash.
  it('on css-change, controllers without cssRetheme are silently skipped', () => {
    const c1 = makeFakeCtl('a.md');
    const c2 = {
      flushNow: vi.fn(async () => undefined),
      destroy: vi.fn(),
      file: { path: 'b.md' },
      // No cssRetheme — simulates older test fixture.
    };
    plugin.widgetRegistry.set('a.md::0', c1 as never);
    plugin.widgetRegistry.set('b.md::0', c2 as never);

    registerThemeListener(plugin as never);
    const cb = plugin.app.workspace.on.mock.calls[0]![1] as () => void;

    expect(() => cb()).not.toThrow();
    expect(c1.cssRetheme).toHaveBeenCalledTimes(1);
  });

  // Behavior 3: WidgetController.cssRetheme calls ONLY view.requestMeasure
  // — verified by direct inspection of WidgetController. We construct a
  // minimal WidgetController-shaped object via the actual class.
  it('WidgetController.cssRetheme dispatches only view.requestMeasure (no rebuild)', async () => {
    // Avoid pulling the full mountLeetCodeWidget plumbing; the cssRetheme
    // method is a direct method on the controller. We unit-test it via a
    // minimal stub of EditorView with a requestMeasure spy.
    const requestMeasureSpy = vi.fn();
    const dispatchSpy = vi.fn();
    const destroySpy = vi.fn();
    const fakeView = {
      dispatch: dispatchSpy,
      destroy: destroySpy,
      requestMeasure: requestMeasureSpy,
      state: { doc: { toString: () => '' } },
      scrollDOM: { scrollTop: 0 },
    };
    // Construct a minimal WidgetController-like object that has a
    // cssRetheme method using the same body the real class exposes.
    // We exercise the real class via dynamic import so any future change
    // to cssRetheme's body fails this test.
    const { WidgetController } = await import('../../src/widget/WidgetController');
    // Bypass the full constructor chain (Compartment, file, etc.) by
    // creating an instance via Object.create + manual assignment.
    const ctl = Object.create(WidgetController.prototype) as InstanceType<typeof WidgetController>;
    Object.assign(ctl, {
      view: fakeView,
      mountedVimMode: false,
      vimCompartment: { reconfigure: vi.fn() },
    });

    ctl.cssRetheme();

    expect(requestMeasureSpy).toHaveBeenCalledTimes(1);
    // No rebuild — dispatch and destroy must NOT be called.
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(destroySpy).not.toHaveBeenCalled();
  });
});
