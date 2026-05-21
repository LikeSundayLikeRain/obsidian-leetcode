// src/preview/previewExistingNote.ts
//
// Phase 06 Plan 03 — pure helper for the Start Problem vs Open Problem button
// branch in ProblemPreviewView. Mirrors the existing-note detection chain used
// by NoteWriter.openProblem at src/notes/NoteWriter.ts:218-225 (cache lookup
// → buildNotePath → vault lookup → TFile narrow), but does NOT do any side
// effects. The preview view is read-only (no vault.create / openLinkText) so
// this helper just answers "does the note exist?" — the caller decides which
// button to render.
//
// Purity contract: no awaits, no logging, no Notice. Three function calls and
// a type narrow. Importable from tests without standing up a full plugin.
//
// 06-RESEARCH §3 + 06-PATTERNS.md §previewExistingNote — exact contract.

import { TFile, type App } from 'obsidian';
import type { DetailCacheEntry } from '../notes/types';
import { buildNotePath } from '../notes/NoteTemplate';

/** Settings facade — only the two getters this helper needs. Structural shape
 *  so tests can pass `{ getProblemsFolder: () => 'LeetCode', getProblemDetail:
 *  () => null }` without standing up a full SettingsStore. */
export interface PreviewSettingsFacade {
  getProblemsFolder(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
}

/** Result shape returned by `detectExistingNote`. The optional `file` is
 *  populated only when `fileExists` is true (so the caller can pass it
 *  straight to `app.workspace.openLinkText` without a second lookup). The
 *  optional `id` is the LC question id from the cache entry (when available);
 *  callers can use it for the action-button aria-label. */
export interface ExistingNoteState {
  fileExists: boolean;
  file?: TFile;
  id?: number;
}

/**
 * Pure helper: does the user already have a note for this slug?
 *
 * Implementation chain (06-PATTERNS.md §previewExistingNote, copied from
 * NoteWriter.openProblem's existing-note check at src/notes/NoteWriter.ts:218-225):
 *
 *   1. const cached = settings.getProblemDetail(slug);
 *      → null when no cache entry → return `{ fileExists: false }`.
 *      We can't compute the canonical filename without `cached.id` (D-16
 *      filename pattern is `{id}-{slug}.md`), so missing cache short-circuits.
 *   2. const path = buildNotePath(folder, cached.id, slug);
 *      Pure helper from src/notes/NoteTemplate.ts:137 — strips trailing
 *      slashes from the folder and joins with the unpadded filename.
 *   3. const f = app.vault.getAbstractFileByPath(path);
 *      Returns `TAbstractFile | null`. Synchronous; reads from Obsidian's
 *      in-memory file index. No I/O.
 *   4. If `f instanceof TFile` → return `{ fileExists: true, file: f, id: cached.id }`.
 *      Else → return `{ fileExists: false, id: cached.id }`.
 *
 * The `instanceof TFile` check matches Obsidian's runtime; for tests, the
 * obsidian-stub's TFile class is used so well-shaped fakes pass through (see
 * tests/preview/existing-note-detection.test.ts).
 */
export function detectExistingNote(
  app: App,
  settings: PreviewSettingsFacade,
  slug: string,
): ExistingNoteState {
  const cached = settings.getProblemDetail(slug);
  if (!cached) return { fileExists: false };
  const folder = settings.getProblemsFolder();
  const path = buildNotePath(folder, cached.id, slug);
  const f = app.vault.getAbstractFileByPath(path);
  if (f instanceof TFile) {
    return { fileExists: true, file: f, id: cached.id };
  }
  return { fileExists: false, id: cached.id };
}
