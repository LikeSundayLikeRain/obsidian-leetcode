// src/graph/StubNoteCreator.ts
//
// Phase 4 Plan 02 — stub technique note creator (GRAPH-04, D-15, D-18).
//
// Two exports:
//   - ensureTechniquesFolder(app, folder)
//       Idempotent folder creation via pre-check + try/catch. Handles
//       concurrent-create races (RESEARCH §Pitfall 6).
//   - createStubIfMissing(app, path, body)
//       Never-overwrite discipline (D-18). If the file exists, no-op
//       (silent). If missing, vault.create with body. Race (another
//       flow created between check + create) → silent per D-18; next AC
//       retries the check.
//
// Divergence from Phase 2 BaseFile (D-18): stubs DO get re-created when
// the user deletes them AND a new problem re-references the technique —
// a dangling `[[Two Pointers]]` wikilink is worse UX than an empty stub
// reappearing. The creation function itself is identical; the difference
// is KnowledgeGraphWriter (Plan 03) calls createStubIfMissing on every
// AC, so a deleted stub is recreated on next AC.
//
// Forbidden inside this module (Plan 04-02 L516):
//   - vault.modify  — grep gate scripts/grep-no-vault-modify.sh enforces
//   - vault.process — D-18: never touch existing stubs
//   - processFrontMatter — D-16: body-embedded frontmatter only; single I/O
//
// Callers: KnowledgeGraphWriter.onAccepted step 3 (Plan 03) loops over
// topicTags, calling createStubIfMissing for each missing stub. Per D-19,
// per-stub failures are silent; the overall on-AC pipeline continues.

import type { App } from 'obsidian';
import { logger } from '../shared/logger';

/**
 * Create the Techniques folder if missing. Idempotent on concurrent races.
 *
 * Trims trailing slashes to match SettingsStore.sanitizeFolder's canonical
 * form (Phase 1 D-10) — `'LeetCode/Techniques/'` and `'LeetCode/Techniques'`
 * both resolve to the same canonical path.
 */
export async function ensureTechniquesFolder(app: App, folder: string): Promise<void> {
  const trimmed = folder.replace(/[\\/]+$/, '');
  if (app.vault.getAbstractFileByPath(trimmed)) return;
  try {
    await app.vault.createFolder(trimmed);
  } catch (err) {
    // Concurrent-create race (Pitfall 6) → subsequent stub writes will succeed.
    logger.debug('graph.ensureTechniquesFolder: concurrent create', err);
  }
}

/**
 * Create a stub note at `path` with `body` if and only if the path is absent.
 *
 * Never-overwrite discipline (D-18): existing files are NEVER modified, even
 * if the user has edited them since the original stub was created.
 *
 * Caller is responsible for providing a body built via
 * `NoteTemplate.buildTechniqueStubBody(slug, name)` (D-16).
 */
export async function createStubIfMissing(
  app: App,
  path: string,
  body: string,
): Promise<void> {
  // D-18: never overwrite existing stubs.
  if (app.vault.getAbstractFileByPath(path)) return;
  try {
    await app.vault.create(path, body);
  } catch (err) {
    // Race (another flow created between check + create) → silent per D-18.
    logger.debug('graph.createStubIfMissing: concurrent create', { path, err });
  }
}
