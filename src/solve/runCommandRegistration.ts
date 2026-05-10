// src/solve/runCommandRegistration.ts
//
// Phase 5 POLISH-07 (D-01) — the single `run` command registration. Replaces
// Phase 3's two separate commands (`run-sample` + `run-custom`) with one
// unified entry point that opens RunModal. The command ID is bare (`run`);
// Obsidian auto-prefixes the manifest id at registration time per the
// community plugin "Submission requirements" (RESEARCH §State of the Art).
//
// This helper exists so the Wave 0 stub `tests/solve/run-command-registration.test.ts`
// can unit-test the command set change without spinning up the whole plugin
// wiring in main.ts. Production main.ts calls `registerRunCommand(this, ...)`
// from within `onload()` alongside the other `addCommand` sites.
//
// The helper does NOT own the RunModal open / run pipeline — that lives on
// the plugin class as `runFromActive()` so it can reach interpretSolution +
// error-routing branches. The deps bag exposed here is only what the command
// gate needs: `settings` (for the slug → default-language path if we ever
// need it at registration time) and a single-callable `openRun()` hook the
// plugin wires to its own `runFromActive()` method.

import type { Plugin } from 'obsidian';
import { isValidSlug } from './slugGuard';

/** Minimal plugin surface consumed by `registerRunCommand`. We accept
 *  anything Plugin-shaped so the Wave 0 tests can pass a plain fake (see
 *  `tests/solve/mocks/fakeWorkspace.ts` → `FakePlugin`). */
export interface RunCommandPluginLike {
  addCommand: Plugin['addCommand'];
  app: Plugin['app'];
}

/** Deps bag. `openRun` is the production hook; when absent (as in the Wave 0
 *  unit test) the gate still registers the command but the `editorCheckCallback`
 *  no-ops on invocation. */
export interface RunCommandDeps {
  settings: unknown;
  openRun?: () => void | Promise<void>;
}

/** Register the single `LeetCode: Run` command. */
export function registerRunCommand(
  plugin: RunCommandPluginLike,
  deps: RunCommandDeps,
): void {
  plugin.addCommand({
    id: 'run',
    name: 'Run',
    editorCheckCallback: (checking, _editor, view) => {
      const file = view.file;
      if (!file) return false;
      const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      if (!isValidSlug(fm?.['lc-slug'])) return false;
      if (!checking) {
        if (deps.openRun) {
          void deps.openRun();
        }
      }
      return true;
    },
  });
}
