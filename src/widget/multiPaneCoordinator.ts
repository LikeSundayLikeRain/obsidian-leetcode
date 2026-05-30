// Phase 20 Plan 20-04 (multi-pane "Take over" affordance) — pane focus
// coordinator.
//
// Single global subscription to `app.workspace.on('active-leaf-change')`
// (verified at obsidian.d.ts in 1.12.3) that walks `widgetRegistry.values()`
// on every focus transition and calls `ctl.setPaneState('active' | 'peer')`
// per controller.
//
// Algorithm (UI-SPEC §3, CONTEXT L10 single-active-per-file baseline):
//   1. On active-leaf-change: query `app.workspace.getActiveViewOfType(MarkdownView)`.
//   2. If no active markdown view OR it has no file: every widget gets
//      `setPaneState('active')` — there's no contention surface.
//   3. Otherwise iterate `widgetRegistry.values()`:
//        - For widgets whose `file.path !== active.file.path`: setPaneState('active')
//          (different file == no contention).
//        - For widgets matching the active file's path:
//            * Walk up `ctl.container` to find the nearest `.workspace-leaf`
//              ancestor; compare against `active.containerEl.closest('.workspace-leaf')`.
//            * Same leaf -> setPaneState('active').
//            * Different leaf -> setPaneState('peer').
//   4. Embed widgets (`ctl.isEmbed === true`) are skipped — the WidgetController.setPaneState
//      method also defends against this (belt-and-suspenders).
//
// L10 INVARIANT (single-active-per-file):
//   Phase 20 ships single-active baseline only — peer panes show CTA but do
//   NOT live-mirror typing (MULTI-01/02 are v1.4+ deferred). The greyed
//   overlay's `pointer-events: auto` captures clicks BEFORE they reach the
//   underlying CM6 editor, so a peer widget cannot accidentally accept
//   keystrokes (T-20-04-01 mitigation).
//
// CLICK -> PROMOTE (UI-SPEC §3 lines 322-329, race window ~16ms):
//   Click handler is owned by `WidgetController.setPaneState('peer')` overlay
//   mount path. It calls `app.workspace.setActiveLeaf(<this widget's leaf>)`
//   which fires `active-leaf-change` synchronously; this listener catches it
//   and flips the pane state in the same animation frame.
//
// LAYOUT-CHANGE COMPANION:
//   Following `src/solve/ephemeralTabStore.ts:42-47` precedent, we ALSO
//   subscribe to `workspace.on('layout-change')`. New panes / pane teardowns
//   don't always fire active-leaf-change cleanly; a layout-change event is
//   the safety net so a freshly-split pane gets correctly-styled widgets on
//   first paint.

import type { Plugin, EventRef, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { MarkdownView as MarkdownViewClass } from 'obsidian';

/**
 * Plugin shape required by the coordinator. Structurally typed so unit tests
 * can pass plain fixtures without spinning up a real LeetCodePlugin. Production
 * `LeetCodePlugin` instances satisfy this contract via the `widgetRegistry`
 * field (instantiated only when `useInlineWidget=ON`).
 *
 * Note: `getActiveViewOfType` is intentionally typed as a generic-free
 * accessor in this structural contract — Obsidian's `<T extends View>(type:
 * Constructor<T>) => T | null` shape is wider than what we need (we only
 * pass MarkdownView). Production callers satisfy this via simple covariant
 * substitution; unit tests pass plain `vi.fn()` fixtures whose return type
 * is `unknown`.
 */
interface MultiPaneCoordinatorHost {
  app: {
    workspace: {
      on(name: 'active-leaf-change' | 'layout-change', callback: () => unknown): EventRef;
      // Loose typing — production satisfies the wider Obsidian signature.
      getActiveViewOfType: (type: unknown) => unknown;
    };
  };
  registerEvent(ref: EventRef): void;
  widgetRegistry?: {
    values(): IterableIterator<{
      file?: { path: string };
      container?: HTMLElement;
      isEmbed?: boolean;
      setPaneState?: (state: 'active' | 'peer') => void;
    }>;
  };
}

/**
 * Resolve the `.workspace-leaf` ancestor for a DOM node. Returns `null` if
 * the node isn't attached to a workspace leaf (e.g., a popout / detached
 * widget under teardown). Encapsulated as a helper so the test file can
 * exercise the same closest-ancestor walk that production uses.
 */
function findLeafEl(node: HTMLElement | null | undefined): HTMLElement | null {
  if (!node) return null;
  // .workspace-leaf is the canonical Obsidian pane wrapper class. The
  // closest() walk is O(depth) and idempotent.
  return node.closest('.workspace-leaf') as HTMLElement | null;
}

/**
 * Reconcile pane affordance for every registered widget. Pure function over
 * the active MarkdownView + the widget registry — exposed for unit tests.
 *
 * @param activeView - currently-focused markdown view (or null if none).
 * @param plugin - the host plugin (provides widgetRegistry).
 */
export function reconcileFocus(
  activeView: MarkdownView | null,
  plugin: MultiPaneCoordinatorHost,
): void {
  const registry = plugin.widgetRegistry;
  if (!registry) return;

  const activeFile = activeView?.file ?? null;
  // The `containerEl` accessor is documented on Obsidian's `View` type but the
  // structural cast keeps unit-test fixtures flexible.
  const activeLeafEl = activeView
    ? findLeafEl(
        (activeView as unknown as { containerEl?: HTMLElement }).containerEl ?? null,
      )
    : null;

  for (const ctl of registry.values()) {
    if (typeof ctl.setPaneState !== 'function') continue;
    // Embed widgets are read-only display surfaces — never apply peer
    // affordance. The setPaneState method ALSO enforces this (defense-in-
    // depth), but skipping here avoids unnecessary work.
    if (ctl.isEmbed === true) {
      ctl.setPaneState('active');
      continue;
    }

    // No active file context (user focused a non-markdown view, settings
    // tab, etc.): no contention surface — every widget back to active.
    if (!activeFile || !activeLeafEl) {
      ctl.setPaneState('active');
      continue;
    }

    // Different file path: no contention with the focused note.
    if (!ctl.file || ctl.file.path !== activeFile.path) {
      ctl.setPaneState('active');
      continue;
    }

    // Same file path: compare leaf ancestors. Widgets in the same leaf as
    // the focused view stay active; widgets in other leaves become peers.
    const ctlLeafEl = findLeafEl(ctl.container ?? null);
    if (ctlLeafEl && ctlLeafEl === activeLeafEl) {
      ctl.setPaneState('active');
    } else {
      ctl.setPaneState('peer');
    }
  }
}

/**
 * Subscribe a single global `active-leaf-change` listener (and a sibling
 * `layout-change` listener for pane create/teardown) that, on every focus
 * transition, walks the plugin's `widgetRegistry` and updates each
 * controller's pane affordance state.
 *
 * Auto-unregisters via `plugin.registerEvent(ref)` so plugin unload cleans
 * up. Caller is responsible for invoking ONLY when `useInlineWidget=ON` —
 * widgets do not exist on the v1.2 path, so the listener would have nothing
 * to fan out to. See `src/main.ts:~933` for the canonical gating block.
 */
export function registerMultiPaneCoordinator(
  plugin: Plugin & MultiPaneCoordinatorHost,
): void {
  const handler = (): void => {
    let activeView: MarkdownView | null = null;
    try {
      activeView = (plugin.app.workspace.getActiveViewOfType(
        MarkdownViewClass,
      ) ?? null) as MarkdownView | null;
    } catch {
      // Defensive — getActiveViewOfType may throw under hostile test envs;
      // treat as "no active view" and reset every widget to active.
      activeView = null;
    }
    try {
      reconcileFocus(activeView, plugin);
    } catch {
      // Defensive — a single widget's setPaneState failure must not block
      // peer reconciliation. Production setPaneState swallows internally;
      // this catch is belt-and-suspenders for unexpected DOM teardown races.
    }
  };

  // Active-leaf-change is the primary trigger — fires on every pane focus.
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', handler));
  // Layout-change is the companion for pane create/teardown that may not
  // always emit active-leaf-change cleanly (per ephemeralTabStore precedent).
  plugin.registerEvent(plugin.app.workspace.on('layout-change', handler));
}

// Re-export the leaf-ancestor helper for test code that wants to assert
// against the same DOM walk production uses.
export { findLeafEl as __test_findLeafEl };

// Suppress unused-import warning when WorkspaceLeaf isn't referenced at
// compile time (the type is part of the structural contract documented above
// for future readers).
type _UnusedLeafTypeReference = WorkspaceLeaf;
