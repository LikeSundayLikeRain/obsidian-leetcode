// Phase 20 Plan 20-01 — canonical reader for the undocumented Obsidian
// `app.vault.getConfig('vimMode')` boolean. Encapsulates the v1.2 cast
// pattern (originally inlined at WidgetController.ts:264 and
// childEditorFactory.ts:268). Future call sites — including the plugin-side
// `workspace.on('layout-change')` dispatcher in src/main.ts and the
// per-widget `reconfigureVim` flow — MUST import this helper rather than
// re-cast `getConfig` inline.
//
// Type discipline (PLAN Step 4): this file is the single canonical cast
// site for the undocumented internal API. The defensive `getConfig?.(...)`
// pattern matches Phase 19 C-14 (mount-time read) and survives test
// fixtures that omit the method.
//
// Returns:
//   true  → user has vim mode enabled in Obsidian Settings → Editor → Vim
//           key bindings.
//   false → vim disabled OR getConfig is unavailable (test fixtures /
//           future Obsidian where the internal is removed).

import type { Plugin } from 'obsidian';

/**
 * Read the Obsidian core `vimMode` setting from the plugin's `Vault`
 * instance. The cast threads through `unknown` rather than `any` so
 * `eslint-plugin-obsidianmd` lint rules stay green (the same shape v1.2
 * uses at `childEditorFactory.ts:262-274`).
 *
 * The structural type narrows just enough to access the optional method
 * without forcing the broader Vault type to declare the internal.
 */
export function readVimModeFromVault(plugin: Plugin): boolean {
  const getConfig = (
    plugin.app.vault as unknown as {
      getConfig?: (key: string) => unknown;
    }
  ).getConfig;
  if (typeof getConfig !== 'function') return false;
  return (getConfig.call(plugin.app.vault, 'vimMode') as boolean | undefined) === true;
}
