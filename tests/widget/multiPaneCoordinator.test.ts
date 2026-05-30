// Phase 20 Plan 20-04 (multi-pane "Take over" affordance) — coordinator unit tests.
//
// Covers the behavior cases from 20-04-PLAN Task 2:
//   Coord Test 1: registerMultiPaneCoordinator(plugin) registers
//                 workspace.on('active-leaf-change', cb) via plugin.registerEvent
//                 (and the layout-change companion).
//   Coord Test 2: Two widgets, same file, different .workspace-leaf ancestors
//                 — active leaf A → widget-A `active`, widget-B `peer`.
//   Coord Test 3: Single widget on file → always active (no peer).
//   Coord Test 4: Active view has no LC widget for the file → every widget back
//                 to active (accept-the-no-op per UI-SPEC §3 line 322).
//   setPaneState 1: 'peer' sets data-pane-state='peer' AND mounts overlay+CTA.
//   setPaneState 2: 'active' clears data-pane-state and removes overlay.
//   setPaneState 3: Embed widgets always remain active (gate enforced).
//   Click promote: clicking the overlay calls app.workspace.setActiveLeaf with
//                  the widget's owning leaf.
//   Listener cleanup: registerEvent passes the EventRef so plugin.onunload
//                     auto-unregisters.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  registerMultiPaneCoordinator,
  reconcileFocus,
} from '../../src/widget/multiPaneCoordinator';
import { WidgetController } from '../../src/widget/WidgetController';
import { WidgetRegistry } from '../../src/widget/widgetRegistry';
import { MarkdownView } from '../helpers/obsidian-stub';

interface FakeView {
  containerEl: HTMLElement;
  file: { path: string } | null;
}

interface CapturedHandler {
  name: string;
  cb: () => void;
}

interface FakePlugin {
  app: {
    workspace: {
      on: ReturnType<typeof vi.fn>;
      getActiveViewOfType: ReturnType<typeof vi.fn>;
      setActiveLeaf: ReturnType<typeof vi.fn>;
      getLeavesOfType: ReturnType<typeof vi.fn>;
    };
  };
  widgetRegistry: WidgetRegistry;
  registerEvent: ReturnType<typeof vi.fn>;
  __captured: CapturedHandler[];
  __activeView: FakeView | null;
}

function makeFakePlugin(): FakePlugin {
  const captured: CapturedHandler[] = [];
  const onSpy = vi.fn((name: string, cb: () => void) => {
    captured.push({ name, cb });
    return { __eventRef: name } as unknown;
  });
  const plugin: FakePlugin = {
    app: {
      workspace: {
        on: onSpy,
        getActiveViewOfType: vi.fn(() => plugin.__activeView),
        setActiveLeaf: vi.fn(),
        getLeavesOfType: vi.fn(() => []),
      },
    },
    widgetRegistry: new WidgetRegistry(),
    registerEvent: vi.fn(),
    __captured: captured,
    __activeView: null,
  };
  // Ensure the active view appears as a MarkdownView instance to
  // getActiveViewOfType (the call passes MarkdownView as the type token).
  return plugin;
}

/**
 * Build a fake widget controller with a container nested inside a fake
 * .workspace-leaf div. Returns the controller stub + the leaf div so tests
 * can wire it to the active-view's containerEl.
 */
function makeFakeCtl(
  filePath: string,
  opts: { isEmbed?: boolean } = {},
): {
  ctl: WidgetController;
  container: HTMLDivElement;
  leafEl: HTMLDivElement;
  setPaneStateSpy: ReturnType<typeof vi.fn>;
} {
  const leafEl = document.createElement('div');
  leafEl.classList.add('workspace-leaf');
  const container = document.createElement('div');
  container.className = 'lc-nested-editor HyperMD-codeblock lc-leetcode-solve';
  container.setAttribute('data-pane-state', 'active');
  leafEl.appendChild(container);
  // Attach to body so closest('.workspace-leaf') works.
  document.body.appendChild(leafEl);

  const ctl = Object.create(WidgetController.prototype) as WidgetController;
  Object.assign(ctl, {
    container,
    file: { path: filePath },
    fenceIndex: 0,
    isEmbed: opts.isEmbed ?? false,
    paneState: 'active',
    takeoverOverlay: undefined,
    plugin: {
      app: {
        workspace: {
          getLeavesOfType: vi.fn(() => []),
          setActiveLeaf: vi.fn(),
        },
      },
    },
  });

  // Spy on setPaneState while still allowing it to do real DOM work (so the
  // overlay/attribute mount paths get exercised end-to-end).
  const realSetPaneState = WidgetController.prototype.setPaneState.bind(ctl);
  const setPaneStateSpy = vi.fn((state: 'active' | 'peer') =>
    realSetPaneState(state),
  );
  Object.assign(ctl, { setPaneState: setPaneStateSpy });

  return { ctl, container, leafEl, setPaneStateSpy };
}

function makeFakeView(filePath: string): FakeView {
  const containerEl = document.createElement('div');
  const leafEl = document.createElement('div');
  leafEl.classList.add('workspace-leaf');
  leafEl.appendChild(containerEl);
  document.body.appendChild(leafEl);
  // Force `instanceof MarkdownView` to behave by setting the prototype.
  const view = Object.create(MarkdownView.prototype) as FakeView;
  Object.assign(view, { containerEl, file: { path: filePath } });
  return view;
}

describe('Phase 20 Plan 20-04 — registerMultiPaneCoordinator (multi-pane affordance)', () => {
  let plugin: FakePlugin;

  beforeEach(() => {
    document.body.innerHTML = '';
    plugin = makeFakePlugin();
  });

  // Coord Test 1
  it('subscribes to active-leaf-change AND layout-change, threads EventRefs through registerEvent', () => {
    registerMultiPaneCoordinator(plugin as never);
    const names = plugin.__captured.map((c) => c.name).sort();
    expect(names).toEqual(['active-leaf-change', 'layout-change']);
    expect(plugin.registerEvent).toHaveBeenCalledTimes(2);
  });

  // Coord Test 2 — two widgets same file, active leaf flips correctly.
  it('two widgets same file, different leaves — active leaf A → A active, B peer', () => {
    const a = makeFakeCtl('foo.md');
    const b = makeFakeCtl('foo.md');
    plugin.widgetRegistry.set('foo.md::0:a', a.ctl as never);
    plugin.widgetRegistry.set('foo.md::0:b', b.ctl as never);

    // Active view's leaf == a's leaf.
    const activeView = makeFakeView('foo.md');
    // Move activeView's leafEl to be the same as a.leafEl by stuffing the
    // containerEl into a.leafEl.
    a.leafEl.appendChild(activeView.containerEl);
    plugin.__activeView = activeView;

    registerMultiPaneCoordinator(plugin as never);
    // Fire active-leaf-change.
    const handler = plugin.__captured.find((c) => c.name === 'active-leaf-change')!.cb;
    handler();

    expect(a.setPaneStateSpy).toHaveBeenCalledWith('active');
    expect(b.setPaneStateSpy).toHaveBeenCalledWith('peer');
    expect(b.container.getAttribute('data-pane-state')).toBe('peer');
    expect(a.container.getAttribute('data-pane-state')).toBe('active');
    // Verify overlay was mounted on B and NOT on A.
    expect(b.container.querySelector('.lc-takeover-overlay')).not.toBeNull();
    expect(a.container.querySelector('.lc-takeover-overlay')).toBeNull();
  });

  // Coord Test 3 — single widget on file → always active.
  it('single widget on file — always active (no peer)', () => {
    const a = makeFakeCtl('foo.md');
    plugin.widgetRegistry.set('foo.md::0', a.ctl as never);

    const activeView = makeFakeView('foo.md');
    a.leafEl.appendChild(activeView.containerEl);
    plugin.__activeView = activeView;

    registerMultiPaneCoordinator(plugin as never);
    const handler = plugin.__captured.find((c) => c.name === 'active-leaf-change')!.cb;
    handler();

    expect(a.setPaneStateSpy).toHaveBeenLastCalledWith('active');
    expect(a.container.getAttribute('data-pane-state')).toBe('active');
  });

  // Coord Test 4 — active view has no widget for the file path.
  it('active view on a different file — every widget back to active', () => {
    const a = makeFakeCtl('foo.md');
    const b = makeFakeCtl('foo.md');
    plugin.widgetRegistry.set('foo.md::0:a', a.ctl as never);
    plugin.widgetRegistry.set('foo.md::0:b', b.ctl as never);

    const activeView = makeFakeView('OTHER.md');
    plugin.__activeView = activeView;

    registerMultiPaneCoordinator(plugin as never);
    const handler = plugin.__captured.find((c) => c.name === 'active-leaf-change')!.cb;
    handler();

    expect(a.setPaneStateSpy).toHaveBeenLastCalledWith('active');
    expect(b.setPaneStateSpy).toHaveBeenLastCalledWith('active');
  });

  // Coord Test 4b — no active view at all (e.g., user focused settings tab).
  it('no active markdown view — every widget back to active', () => {
    const a = makeFakeCtl('foo.md');
    const b = makeFakeCtl('foo.md');
    plugin.widgetRegistry.set('foo.md::0:a', a.ctl as never);
    plugin.widgetRegistry.set('foo.md::0:b', b.ctl as never);
    plugin.__activeView = null;

    registerMultiPaneCoordinator(plugin as never);
    const handler = plugin.__captured.find((c) => c.name === 'active-leaf-change')!.cb;
    handler();

    expect(a.setPaneStateSpy).toHaveBeenLastCalledWith('active');
    expect(b.setPaneStateSpy).toHaveBeenLastCalledWith('active');
  });

  // setPaneState 1+2 — overlay mount / unmount on transition.
  it('setPaneState transitions: peer mounts overlay+CTA; active removes it', () => {
    const a = makeFakeCtl('foo.md');
    // Use the real method (not the spy) for direct method assertions.
    const real = WidgetController.prototype.setPaneState.bind(a.ctl);

    real('peer');
    const overlay = a.container.querySelector('.lc-takeover-overlay');
    expect(overlay).not.toBeNull();
    const cta = overlay!.querySelector('.lc-takeover-cta') as HTMLButtonElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toBe('Click to take over');
    expect(cta.getAttribute('title')).toContain('take over');
    expect(a.container.getAttribute('data-pane-state')).toBe('peer');

    real('active');
    expect(a.container.querySelector('.lc-takeover-overlay')).toBeNull();
    expect(a.container.getAttribute('data-pane-state')).toBe('active');
  });

  // setPaneState 1 — idempotent: calling 'peer' twice doesn't double-mount.
  it('setPaneState is idempotent — repeated peer does not double-mount overlay', () => {
    const a = makeFakeCtl('foo.md');
    const real = WidgetController.prototype.setPaneState.bind(a.ctl);
    real('peer');
    real('peer');
    const overlays = a.container.querySelectorAll('.lc-takeover-overlay');
    expect(overlays.length).toBe(1);
  });

  // setPaneState 3 — embed widgets always remain active.
  it('embed widgets always remain active (defense-in-depth gate)', () => {
    const a = makeFakeCtl('foo.md', { isEmbed: true });
    const b = makeFakeCtl('foo.md');
    plugin.widgetRegistry.set('foo.md::0:embed', a.ctl as never);
    plugin.widgetRegistry.set('foo.md::0:real', b.ctl as never);

    const activeView = makeFakeView('foo.md');
    // Active leaf == B's leaf (so A would become 'peer' if not gated).
    b.leafEl.appendChild(activeView.containerEl);
    plugin.__activeView = activeView;

    registerMultiPaneCoordinator(plugin as never);
    const handler = plugin.__captured.find((c) => c.name === 'active-leaf-change')!.cb;
    handler();

    // Coordinator filter calls setPaneState('active') on the embed widget;
    // the controller's own gate ALSO enforces this (defense-in-depth).
    expect(a.container.getAttribute('data-pane-state')).toBe('active');
    expect(a.container.querySelector('.lc-takeover-overlay')).toBeNull();
    expect(b.container.getAttribute('data-pane-state')).toBe('active');
  });

  // Click promote — overlay click calls setActiveLeaf with the widget's leaf.
  it('clicking the peer overlay promotes the pane (calls setActiveLeaf)', () => {
    const b = makeFakeCtl('foo.md');
    const real = WidgetController.prototype.setPaneState.bind(b.ctl);

    // Wire setActiveLeaf on the controller's plugin handle.
    const setActiveLeafSpy = vi.fn();
    const fakeLeaf = { containerEl: b.leafEl, view: { file: { path: 'foo.md' } } };
    Object.assign((b.ctl as unknown as { plugin: object }).plugin, {
      app: {
        workspace: {
          getLeavesOfType: vi.fn(() => [fakeLeaf]),
          setActiveLeaf: setActiveLeafSpy,
        },
      },
    });

    real('peer');
    const overlay = b.container.querySelector('.lc-takeover-overlay') as HTMLDivElement;
    expect(overlay).not.toBeNull();

    // Simulate click.
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(setActiveLeafSpy).toHaveBeenCalledTimes(1);
    expect(setActiveLeafSpy.mock.calls[0]![0]).toBe(fakeLeaf);
  });

  // reconcileFocus pure function — exposed for direct testing without the
  // active-leaf-change subscription wrapper.
  it('reconcileFocus is a pure function over the registry (callable without registering)', () => {
    const a = makeFakeCtl('foo.md');
    plugin.widgetRegistry.set('foo.md::0', a.ctl as never);
    const activeView = makeFakeView('foo.md');
    a.leafEl.appendChild(activeView.containerEl);
    reconcileFocus(activeView as never, plugin as never);
    expect(a.setPaneStateSpy).toHaveBeenCalledWith('active');
  });
});
