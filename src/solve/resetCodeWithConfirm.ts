// src/solve/resetCodeWithConfirm.ts
//
// Phase 5.2 Plan 04 — D-07 Reset code helper.
//
// Extracted from main.ts so tests can exercise the confirm gate without
// instantiating a real Plugin / Modal. Production callers inject a `confirm`
// function that opens `ConfirmOverwriteModal` (D-11) and resolves with the
// user's choice; tests inject a stub resolver.
//
// Gate rules (per PATTERNS SP-4 + threat-model T-05.2-12):
//   - Non-empty fence present → open confirm; cancel aborts without any
//     vault mutation.
//   - Empty fence or no fence → skip confirm; force-inject starter directly.
//
// On successful write, fires the Notice "Code reset to starter." via the
// injected `notify` callback. Production wires `notify = (msg) => new Notice(msg, 3000)`.

import type { App, TFile } from 'obsidian';
import type { DetailCacheEntry } from '../settings/SettingsStore';
import { forceInjectCodeSection } from './starterCodeInjector';
import { hasExistingCodeBlock } from '../graph/copyToCode';

export interface ResetCodeWithConfirmDeps {
  app: App;
  file: TFile;
  slug: string;
  settings: {
    getProblemDetail(slug: string): DetailCacheEntry | null;
    getDefaultLanguage(): string;
  };
  /** Resolves to true if the user confirms overwrite; false on cancel. */
  confirm: () => Promise<boolean>;
  /** Fires the user-visible success Notice. In production, `(msg) => new Notice(msg, 3000)`. */
  notify: (message: string) => void;
}

/**
 * Reset the ## Code fence to the starter snippet for the current default
 * language. Gates destructive overwrite behind `confirm` when a non-empty
 * fence is present; proceeds silently otherwise.
 */
export async function resetCodeWithConfirm(
  deps: ResetCodeWithConfirmDeps,
): Promise<void> {
  await readCurrentBody(deps.app, deps.file);

  const detail = deps.settings.getProblemDetail(deps.slug);
  const langSlug = deps.settings.getDefaultLanguage();
  const starter =
    detail?.codeSnippets?.find((s) => s.langSlug === langSlug)?.code ?? '';

  await deps.app.vault.process(deps.file, (body) =>
    forceInjectCodeSection(body, { starterCode: starter, langSlug }),
  );

  deps.notify('Code reset to starter.');
}

/** Mirror of SubmissionDetailModal's readCurrentBody — both production and
 *  mock vault expose `vault.read(file)` → Promise<string>. */
async function readCurrentBody(app: App, file: TFile): Promise<string> {
  const vault = (app as unknown as {
    vault?: { read?: (f: TFile) => Promise<string> };
  }).vault;
  if (vault?.read) return vault.read(file);
  return '';
}
