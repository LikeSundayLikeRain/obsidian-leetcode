// Phase 20 Plan 20-04 (THEME-04) — Live theme retheme listener.
//
// Single global subscription to `app.workspace.on('css-change')` that fans
// out to every registered widget via `widgetRegistry.values()`, calling
// `ctl.cssRetheme()` on each. Each controller's `cssRetheme()` body is
// `this.view.requestMeasure()` — a NO-OP layout reflow that lets CM6 pick
// up the new theme's CSS variables on the next animation frame. NO
// EditorView rebuild; cursor + scroll + undo state preserved.
//
// Verified primitive: `Workspace.on('css-change', () => any): EventRef` at
// `obsidian.d.ts:7137` (since 0.9.7). MutationObserver fallback is
// documented in 20-RESEARCH §"Pattern 7" lines 642-649 but NOT shipped here
// — `css-change` is verified to exist in obsidian@1.12.3.
//
// Why a single listener instead of per-widget: every Obsidian theme change
// is a single global event. Subscribing per-widget would multiply the cost
// linearly with widget count for zero benefit. The fan-out via the registry
// iterator (added in Plan 20-01) is the canonical Phase 20 pattern (mirrors
// the layout-change vim dispatcher at `src/main.ts:~1018-1027`).
//
// CASCADE CONTRACT (CONTEXT discretion + 20-UI-SPEC §4):
//   The widget container's class chain — `lc-nested-editor` +
//   `HyperMD-codeblock` + `childEditorSemanticClasses` Lezer→CSS-class
//   outputs — already inherits Obsidian's `var(--code-keyword)`,
//   `var(--code-string)`, `var(--background-primary)`, `var(--text-normal)`,
//   etc. A theme swap repaints these variables via Obsidian's normal
//   stylesheet replace; the widgets don't need to be told the new values.
//   `requestMeasure()` exists only to force CM6 to recompute layout-affected
//   metrics (line height, scroll offsets) AFTER the new computed styles
//   apply. The cascade is THE retheme path; this listener is only the
//   reflow nudge.

import type { Plugin, EventRef } from 'obsidian';

/**
 * Plugin shape required by this listener. Structurally typed (rather than
 * importing the concrete `LeetCodePlugin` class) so unit tests can pass plain
 * fixtures. Production `LeetCodePlugin` instances satisfy this contract via
 * the `widgetRegistry` field declared on `LeetCodePlugin` at
 * `src/main.ts:~289` (instantiated only when `useInlineWidget=ON`).
 */
interface ThemeListenerHost {
  app: {
    workspace: {
      on(name: 'css-change', callback: () => unknown): EventRef;
    };
  };
  registerEvent(ref: EventRef): void;
  widgetRegistry?: {
    values(): IterableIterator<{
      cssRetheme?: () => void;
    }>;
  };
}

/**
 * Subscribe a single global `css-change` listener that, on every theme
 * transition, walks the plugin's `widgetRegistry` and calls `cssRetheme`
 * on every registered controller. Auto-unregisters via
 * `plugin.registerEvent(ref)` so plugin unload cleans up.
 *
 * Defensively skips controllers without a `cssRetheme` method (test
 * fixtures using the minimal `WidgetControllerLike` shape may omit it).
 *
 * Caller is responsible for invoking ONLY when `useInlineWidget=ON` —
 * widgets do not exist on the v1.2 path, so the listener would have
 * nothing to fan out to. See `src/main.ts:~933` for the canonical gating
 * block.
 */
export function registerThemeListener(plugin: Plugin & ThemeListenerHost): void {
  const ref = plugin.app.workspace.on('css-change', () => {
    const registry = plugin.widgetRegistry;
    if (!registry) return;
    for (const ctl of registry.values()) {
      // Optional method — defensively skip when missing (test fixtures).
      if (typeof ctl.cssRetheme === 'function') {
        try {
          ctl.cssRetheme();
        } catch {
          // Defensive — a single widget's reflow failure must not block
          // peers' retheme. Production CM6 `requestMeasure` rarely throws.
        }
      }
    }
  });
  plugin.registerEvent(ref);
}
