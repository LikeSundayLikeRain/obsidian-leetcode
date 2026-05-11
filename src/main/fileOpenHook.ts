// src/main/fileOpenHook.ts
//
// Phase 5.2 Plan 04 — D-06 auto-insert starter code on file-open.
//
// Extracted factory so tests can drive the handler without instantiating a
// full Obsidian Plugin. The handler:
//   1. No-ops when file is null / lacks frontmatter / lc-slug missing / slug malformed.
//   2. Otherwise calls `retrofit(app, file, detail, settings)` and swallows
//      rejections silently (D-09 silent-on-failure — `retrofit` logs via
//      `logger.debug`; this wrapper only keeps the unhandled-rejection from
//      escaping the event handler).
//
// The handler is idempotent per call because `starterCodeInjector.injectCodeSection`
// returns the input string unchanged when `## Code` already contains a
// recognized-langSlug fence (RESEARCH Pitfall 5).

import type { App, TFile } from 'obsidian';
import type { DetailCacheEntry } from '../settings/SettingsStore';
import { isValidSlug } from '../solve/slugGuard';

export interface FileOpenHookDeps {
  app: App;
  settings: {
    getProblemDetail(slug: string): DetailCacheEntry | null;
    getDefaultLanguage(): string;
  };
  /** Injected for testability — `src/solve/starterCodeInjector::retrofit` in prod. */
  retrofit: (
    app: App,
    file: TFile,
    detail: DetailCacheEntry | null,
    settings: { getDefaultLanguage(): string },
  ) => Promise<void>;
}

/**
 * Factory: returns a `(file: TFile | null) => void` handler suitable for
 * `workspace.on('file-open', ...)`. Never throws; swallows retrofit
 * rejections per D-09.
 */
export function makeFileOpenHandler(
  deps: FileOpenHookDeps,
): (file: TFile | null) => void {
  return (file: TFile | null): void => {
    if (!file) return;
    const fm = deps.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const slug = fm?.['lc-slug'];
    if (!isValidSlug(slug)) return;
    const cached = deps.settings.getProblemDetail(slug);
    void deps.retrofit(deps.app, file, cached, deps.settings).catch(() => undefined);
  };
}
