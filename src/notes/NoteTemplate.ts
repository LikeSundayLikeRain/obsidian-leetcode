// src/notes/NoteTemplate.ts
// Schema single source of truth for Phase 2 note creation (D-03).
//
// NO OTHER MODULE may hardcode:
//   - `lc-` prefixed frontmatter key names (PLUGIN_LC_KEYS)
//   - the `lc/` tag namespace (LC_TAG_PREFIX)
//   - the `{id}-{slug}.md` filename pattern (buildNoteFilename)
//   - the two-heading body layout (`## Problem` + `## Notes`) (buildNoteBody)
//
// Phase 2 writes exactly 7 lc-* keys + aliases + the difficulty tag. Phase 4 will
// extend the tag policy to include topic tags AND will write solve-time lc-*
// keys (lc-solved-date, lc-runtime-ms, lc-memory-mb) and flip lc-status to
// 'accepted' — see D-04 / D-05 / D-10 for the boundary.

import type { App, TFile } from 'obsidian';
import type { DetailCacheEntry } from './types';

/** The 7 lc-* frontmatter keys Phase 2 writes. Ordered to match D-03 YAML. */
export const PLUGIN_LC_KEYS = [
  'lc-id',
  'lc-slug',
  'lc-title',
  'lc-difficulty',
  'lc-url',
  'lc-status',
  'lc-language',
] as const;

/** Canonical tag namespace prefix. All LC-derived tags begin with this. */
export const LC_TAG_PREFIX = 'lc/' as const;

export interface NoteTemplateInput {
  id: number;
  slug: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  /** Per NOTE-09: read from SettingsStore.getDefaultLanguage() at the caller site. */
  language: string;
  /**
   * The plugin's current-pass tag set.
   * Phase 2: `[lc/{difficulty.toLowerCase()}]` (difficulty only per D-05).
   * Phase 4 will extend to include topic tags. Union-merge with existing tags
   * happens INSIDE applyFrontmatter's processFrontMatter callback.
   */
  pluginTags: string[];
}

/** D-16: unpadded filename like `1-two-sum.md`, `10-regular-expression-matching.md`, `100-same-tree.md`. */
export function buildNoteFilename(id: number, slug: string): string {
  return `${id}-${slug}.md`;
}

/** Strip trailing slashes from the folder, join with the unpadded filename. */
export function buildNotePath(folder: string, id: number, slug: string): string {
  const trimmed = folder.replace(/[\\/]+$/, '');
  return `${trimmed}/${buildNoteFilename(id, slug)}`;
}

/**
 * D-01: Phase 2 writes exactly two headings on first write.
 * `## Solution` and `## Techniques` are added by Phase 4 on first Accepted submission.
 */
export function buildNoteBody(input: { problemMarkdown: string }): string {
  return `## Problem\n${input.problemMarkdown.trim()}\n\n## Notes\n\n`;
}

/**
 * Build the frontmatter input from a cached detail entry + user's default language.
 * D-05: Phase 2 derives pluginTags from difficulty only. Phase 4 will rebuild this
 * with difficulty + topic tags derived from detail.topicSlugs.
 */
export function buildFrontmatterInput(
  detail: DetailCacheEntry,
  defaultLanguage: string,
): NoteTemplateInput {
  const slug = slugFromUrl(detail.url, detail.title);
  return {
    id: detail.id,
    slug,
    title: detail.title,
    difficulty: detail.difficulty,
    url: detail.url,
    language: defaultLanguage,
    pluginTags: [`${LC_TAG_PREFIX}${detail.difficulty.toLowerCase()}`],
  };
}

/**
 * Recover the slug from the detail.url (preferred) or fall back to a title-derived slug
 * if url is empty. detail.url matches `https://leetcode.com/problems/{slug}/`.
 */
function slugFromUrl(url: string, titleFallback: string): string {
  const m = /\/problems\/([^/]+)\/?/.exec(url);
  if (m && m[1]) return m[1];
  // Fallback — rare; only when cache entry lacks a url (shouldn't happen post-Plan 04).
  return titleFallback.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Atomic frontmatter write. All mutations happen INSIDE the callback — this is
 * the only safe shape (CONTEXT.md D-10 + RESEARCH.md Pitfall 1: processFrontMatter
 * does NOT auto-union arrays; union lives in the callback).
 *
 * Semantics (D-10):
 *   lc-* keys       → plugin OVERWRITES every pass, with ONE exception:
 *                     lc-status is NEVER downgraded from an existing non-'untouched'
 *                     value back to 'untouched' (D-04 + Phase 4 respects Phase 2
 *                     re-opens).
 *   aliases         → union of plugin entries [title, String(id)] and existing user entries
 *   tags            → union of plugin's current-pass set (input.pluginTags) and existing tags
 *   other user keys → untouched (callback simply doesn't mutate them)
 */
export async function applyFrontmatter(
  app: App,
  file: TFile,
  input: NoteTemplateInput,
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    // 1. Plugin-owned lc-* keys.
    fm['lc-id'] = input.id;
    fm['lc-slug'] = input.slug;
    fm['lc-title'] = input.title;
    fm['lc-difficulty'] = input.difficulty;
    fm['lc-url'] = input.url;
    // D-04: lc-status defaults to 'untouched' on first write. Never DOWNGRADE a
    // non-untouched value (Phase 4 writes 'accepted' — a Phase 2 re-open must
    // not clobber that).
    if (typeof fm['lc-status'] !== 'string' || fm['lc-status'] === '' || fm['lc-status'] === 'untouched') {
      fm['lc-status'] = 'untouched';
    }
    fm['lc-language'] = input.language;

    // 2. aliases — union-merge (D-06 + D-10). String(id) per Pitfall 9.
    const pluginAliases = [input.title, String(input.id)];
    const priorAliases = Array.isArray(fm.aliases)
      ? (fm.aliases as unknown[]).map(String).filter((s) => typeof s === 'string' && s.length > 0)
      : [];
    const mergedAliases = Array.from(new Set<string>([...pluginAliases, ...priorAliases]));
    fm.aliases = mergedAliases;

    // 3. tags — union-merge (D-10). Plugin's current-pass set + existing tags, deduped.
    const priorTags = Array.isArray(fm.tags)
      ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const mergedTags = Array.from(new Set<string>([...priorTags, ...input.pluginTags]));
    fm.tags = mergedTags;

    // 4. Non-lc-* user keys: untouched. The callback does not mutate anything
    //    else on fm; Obsidian preserves them verbatim.
  });
}
