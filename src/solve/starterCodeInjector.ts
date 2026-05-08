// src/solve/starterCodeInjector.ts
//
// Phase 3 starter-code retrofit + on-demand injection
// (SOLVE-02, CONTEXT D-06 / D-07 / D-08 / D-09).
//
// Three public functions:
//   1. `injectCodeSection` — pure, idempotent. Skips when a recognized-langSlug
//      block is already present (D-07 retrofit contract).
//   2. `forceInjectCodeSection` — pure, forced. Unconditionally replaces the
//      first recognized-langSlug fenced block under `## Code`. Used by Plan 07's
//      "Insert starter code" command. (Plan 03 checker Blocker 2 — shipped here
//      so Plan 07 only imports.)
//   3. `retrofit` — side-effect wrapper calling `vault.process` + debug log on
//      failure (D-09 silent-on-failure). The ONLY non-pure function in this file.
//
// Design notes:
//   - sectionHasRecognizedFence uses the `resolveLangSlug(tag, '__x__')`
//     sentinel trick: if resolution falls back to the sentinel, the tag is
//     unknown; if resolution returns a real slug in LC_LANG_SLUGS, the tag is
//     a recognized language.
//   - forceInjectCodeSection uses the same sentinel detection to find the
//     first recognized block and swap it via stripFirstRecognizedCodeBlock.
//   - vault.process is the ONLY vault mutation primitive used here (CF-06).
//   - No Notice is ever emitted from this module — D-09 mandates silent behavior
//     on retrofit failure (debug-level log only; user retains the on-demand
//     Insert starter code command as manual recovery).

import type { App, TFile } from 'obsidian';
import {
  PROBLEM_HEADING_LINE,
  NOTES_HEADING_LINE,
  CODE_HEADING_LINE,
  codeBlockFor,
} from '../notes/NoteTemplate';
import { LC_LANG_SLUGS, resolveLangSlug } from './languages';
import { logger } from '../shared/logger';
import type { DetailCacheEntry } from '../settings/SettingsStore';

const FENCE_OPEN = /^```([a-zA-Z0-9_+#-]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const H2 = /^## /;

export interface InjectOptions {
  starterCode: string;
  langSlug: string;
}

/**
 * Pure string transform. Idempotent when `## Code` already contains a fenced
 * block whose tag is a recognized LC langSlug (D-07). Inserts starter BEFORE
 * existing unrecognized blocks (Pitfall 6).
 */
export function injectCodeSection(current: string, opts: InjectOptions): string {
  const lines = current.split('\n');
  const codeStart = indexOfLine(lines, CODE_HEADING_LINE);
  const notesStart = indexOfLine(lines, NOTES_HEADING_LINE);
  const problemStart = indexOfLine(lines, PROBLEM_HEADING_LINE);

  const starterBlock = codeBlockFor(opts.langSlug, opts.starterCode);

  if (codeStart >= 0) {
    const codeEnd = findSectionEnd(lines, codeStart);
    if (sectionHasRecognizedFence(lines, codeStart + 1, codeEnd)) {
      return current; // idempotent
    }
    // Insert starter immediately after heading, preserving the rest of the body.
    const before = lines.slice(0, codeStart + 1);
    const sectionBody = lines.slice(codeStart + 1, codeEnd);
    const after = lines.slice(codeEnd);
    const insertion = ['', ...starterBlock.split('\n'), ''];
    return [...before, ...insertion, ...sectionBody, ...after].join('\n');
  }

  // No ## Code heading — insert between ## Problem and ## Notes.
  const insertAt = notesStart >= 0
    ? notesStart
    : (problemStart >= 0 ? findSectionEnd(lines, problemStart) : lines.length);

  const insertion = [CODE_HEADING_LINE, ...starterBlock.split('\n'), ''];
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);

  // Ensure blank line before insertion.
  const needsLeadingBlank = before.length > 0 && before[before.length - 1] !== '';
  if (needsLeadingBlank) before.push('');
  return [...before, ...insertion, ...after].join('\n');
}

/**
 * Pure string transform. UNCONDITIONALLY replaces the first recognized-langSlug
 * fenced block under `## Code` with the new starter (drops the idempotency guard).
 *
 * Contract:
 *   - If `## Code` doesn't exist → behave like injectCodeSection (insert fresh section)
 *   - If `## Code` exists with a recognized-langSlug fenced block → replace that block
 *     with the new starter (preserving surrounding text + additional blocks)
 *   - If `## Code` exists with no recognized-langSlug block → insert starter at the
 *     top of the section (same as injectCodeSection's Pitfall-6 path)
 *   - Pure; safe inside vault.process retry
 */
export function forceInjectCodeSection(current: string, opts: InjectOptions): string {
  const lines = current.split('\n');
  const codeStart = indexOfLine(lines, CODE_HEADING_LINE);

  if (codeStart < 0) {
    // No ## Code section — delegate to injectCodeSection to create one.
    return injectCodeSection(current, opts);
  }

  const codeEnd = findSectionEnd(lines, codeStart);
  const starterBlock = codeBlockFor(opts.langSlug, opts.starterCode);

  const stripped = stripFirstRecognizedCodeBlock(lines, codeStart + 1, codeEnd);
  if (stripped === null) {
    // No recognized block — insert starter at top of section.
    const before = lines.slice(0, codeStart + 1);
    const sectionBody = lines.slice(codeStart + 1, codeEnd);
    const after = lines.slice(codeEnd);
    const insertion = ['', ...starterBlock.split('\n'), ''];
    return [...before, ...insertion, ...sectionBody, ...after].join('\n');
  }

  // Insert the new starter at the original block's position.
  const before = lines.slice(0, codeStart + 1);
  const after = lines.slice(codeEnd);
  const replacedBody = [
    ...stripped.before,
    ...starterBlock.split('\n'),
    ...stripped.after,
  ];
  const leadingBlank = replacedBody[0] === '' ? [] : [''];
  return [...before, ...leadingBlank, ...replacedBody, ...after].join('\n');
}

/**
 * Side-effect wrapper: runs injectCodeSection via vault.process.
 * Silent on success; debug-log on failure. Never Notices (D-09).
 */
export async function retrofit(
  app: App,
  file: TFile,
  detail: DetailCacheEntry | null,
  settings: { getDefaultLanguage(): string },
): Promise<void> {
  try {
    const defaultLang = settings.getDefaultLanguage();
    const starter = resolveStarter(detail, defaultLang);
    await app.vault.process(file, (current) =>
      injectCodeSection(current, { starterCode: starter, langSlug: defaultLang }),
    );
  } catch (err) {
    logger.debug('solve.retrofit: non-fatal failure', err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function indexOfLine(lines: string[], needle: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === needle) return i;
  }
  return -1;
}

function findSectionEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (H2.test(lines[i] ?? '')) return i;
  }
  return lines.length;
}

function sectionHasRecognizedFence(lines: string[], from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const m = FENCE_OPEN.exec(lines[i] ?? '');
    if (!m) continue;
    const tag = (m[1] ?? '').toLowerCase();
    // Sentinel trick: resolveLangSlug returns the sentinel only when the tag
    // is unknown. Any other return value means the tag resolved to an LC slug.
    if (tag && resolveLangSlug(tag, '__x__') !== '__x__' &&
        LC_LANG_SLUGS.has(resolveLangSlug(tag, '__x__'))) {
      // Ensure there's a closing fence somewhere in the section.
      for (let j = i + 1; j < to; j++) {
        if (FENCE_CLOSE.test(lines[j] ?? '')) return true;
      }
    }
  }
  return false;
}

/**
 * Returns the section body split around the first recognized-langSlug fenced
 * block, with that block removed. Returns null if no such block was present.
 */
function stripFirstRecognizedCodeBlock(
  lines: string[],
  from: number,
  to: number,
): { before: string[]; after: string[] } | null {
  for (let i = from; i < to; i++) {
    const m = FENCE_OPEN.exec(lines[i] ?? '');
    if (!m) continue;
    const tag = (m[1] ?? '').toLowerCase();
    if (!tag) continue;
    const resolved = resolveLangSlug(tag, '__x__');
    if (resolved === '__x__' || !LC_LANG_SLUGS.has(resolved)) continue;
    // Find the matching close fence.
    for (let j = i + 1; j < to; j++) {
      if (FENCE_CLOSE.test(lines[j] ?? '')) {
        return {
          before: lines.slice(from, i),
          after: lines.slice(j + 1, to),
        };
      }
    }
  }
  return null;
}

function resolveStarter(detail: DetailCacheEntry | null, langSlug: string): string {
  const snippets = detail?.codeSnippets ?? [];
  const hit = snippets.find((s) => s.langSlug === langSlug);
  return hit?.code ?? '';
}
