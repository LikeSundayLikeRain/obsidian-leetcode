// src/notes/NoteTemplate.ts
// Schema single source of truth for Phase 2 note creation (D-03).
//
// NO OTHER MODULE may hardcode:
//   - `lc-` prefixed frontmatter key names (PLUGIN_LC_KEYS)
//   - the `lc/` tag namespace (LC_TAG_PREFIX)
//   - the `lc-status` value vocabulary (LC_STATUS_VALUES)
//   - the `{id}-{slug}.md` filename pattern (buildNoteFilename)
//   - the two-heading body layout (`## Problem` + `## Notes`) (buildNoteBody)
//
// Phase 2 writes exactly 7 lc-* keys + aliases + the difficulty tag. Phase 4 will
// extend the tag policy to include topic tags AND will write solve-time lc-*
// keys (lc-solved-date, lc-runtime-ms, lc-memory-mb) and flip lc-status to
// 'accepted' — see D-04 / D-05 / D-10 for the boundary.
//
// GAP-2a closure: this module also owns the IndexedProblem.status →
// lc-status mapping (see `mapStatusDisplay`). Callers pass the internal
// vocabulary ('solved' | 'attempted' | 'untouched'); we return the
// frontmatter vocabulary ('accepted' | 'attempted' | 'untouched').

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

// Schema SSoT for every plugin-owned H2 heading across Phases 2, 3, and 4.
// Canonical anchor order in problem notes (Phase 4 D-14):
//   ## Problem → ## Code → ## Notes → ## Techniques → ## Custom Tests
// Phase 2 canonical headings:
/** Plugin-owned H2 where the problem markdown lives (rewriteProblemSection target). */
export const PROBLEM_HEADING_LINE = '## Problem' as const;
/** User-owned H2 immediately after `## Problem`; plugin never writes into this region. */
export const NOTES_HEADING_LINE = '## Notes' as const;
// Phase 3 heading extensions (CONTEXT D-06, D-20).
/** Plugin-owned H2 under which the user's solution fenced block lives. */
export const CODE_HEADING_LINE = '## Code' as const;
/** Plugin-owned H2 under which persisted `### Case N` subheadings live. Lazy-created (D-18). */
export const CUSTOM_TESTS_HEADING_LINE = '## Custom Tests' as const;
/** Prefix for each custom-test subheading. Trailing space matches `### Case 1` (D-18). */
export const CASE_HEADING_PREFIX = '### Case ' as const;
// Phase 4 heading extension (Plan 04-02, D-14).
/** Plugin-owned H2 housing `[[Technique]]` wikilinks, union-merged with user
 *  additions on every Accepted submission (D-13). Inserted immediately after
 *  `## Notes` when absent (D-14). */
export const TECHNIQUES_HEADING_LINE = '## Techniques' as const;

/**
 * Renders a fenced code block with the given langSlug tag + starter code.
 * Caller appends trailing newline as needed.
 */
export function codeBlockFor(langSlug: string, starterCode: string): string {
  const code = starterCode.trim();
  return '```' + langSlug + '\n' + code + '\n```';
}

/**
 * Vocabulary for the `lc-status` frontmatter field. Single source of truth (D-03).
 * Phase 2 writes 'untouched' or 'attempted' on first open; Phase 4 will flip to
 * 'accepted' on first Accepted submission. GAP-2a lets Phase 2 also write
 * 'accepted' or 'attempted' on first open when the user's LC submission history
 * already reflects that status.
 */
export const LC_STATUS_VALUES = ['accepted', 'attempted', 'untouched'] as const;
export type LcStatus = typeof LC_STATUS_VALUES[number];

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
  /**
   * Caller-supplied hint for the on-first-write value of `lc-status` (GAP-2a).
   * D-04 preservation: applyFrontmatter NEVER downgrades an existing 'accepted'
   * value, regardless of this hint. Use `mapStatusDisplay` to derive this from
   * an IndexedProblem row's internal vocabulary.
   * Undefined → default to 'untouched' (back-compat).
   */
  initialStatus?: LcStatus;
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
 * Map IndexedProblem.status → lc-status frontmatter value (GAP-2a SSoT).
 *   'solved'    → 'accepted'   (LC's `ac` means Accepted)
 *   'attempted' → 'attempted'
 *   'untouched' → 'untouched'
 *   undefined   → 'untouched'  (no hint from caller; safe default)
 *
 * This is the ONE place that translates the internal IndexedProblem vocabulary
 * to the on-disk lc-status vocabulary. D-03 bans any other module from
 * hardcoding these literals.
 */
export function mapStatusDisplay(
  indexStatus: 'solved' | 'attempted' | 'untouched' | undefined,
): LcStatus {
  if (indexStatus === 'solved') return 'accepted';
  if (indexStatus === 'attempted') return 'attempted';
  return 'untouched';
}

/**
 * Phase 3 D-06: Body layout is `## Problem` → `## Code` → `## Notes`.
 * `## Solution` and `## Techniques` are added by Phase 4 on first Accepted submission.
 * `## Custom Tests` is a legacy Phase 3 section; Phase 5 ignores it on read and write (POLISH-07 D-08).
 *
 * Backward-compat: `langSlug` is optional and defaults to `'python3'` so Phase 2
 * callers that pass only `{ problemMarkdown }` continue to compile and render
 * the same shape (with an additional `## Code` section containing an empty
 * python3 fenced block).
 */
export function buildNoteBody(input: {
  problemMarkdown: string;
  langSlug?: string;
  starterCode?: string;
}): string {
  const langSlug = input.langSlug ?? 'python3';
  const starter = input.starterCode ?? '';
  const codeBlock = codeBlockFor(langSlug, starter);
  return `## Problem\n${input.problemMarkdown.trim()}\n\n${CODE_HEADING_LINE}\n${codeBlock}\n\n## Notes\n\n`;
}

/**
 * Build the frontmatter input from a cached detail entry + user's default language.
 * D-05: Phase 2 derives pluginTags from difficulty only. Phase 4 will rebuild this
 * with difficulty + topic tags derived from detail.topicSlugs.
 *
 * GAP-2a: optional 3rd arg `initialStatus` is the already-mapped lc-status
 * vocabulary (use `mapStatusDisplay` to translate from IndexedProblem.status).
 * When omitted, applyFrontmatter defaults the on-disk value to 'untouched' per
 * D-04 back-compat.
 */
export function buildFrontmatterInput(
  detail: DetailCacheEntry,
  defaultLanguage: string,
  initialStatus?: LcStatus,
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
    initialStatus,
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
    // D-04 + GAP-2a: on first write (or when the existing value is empty /
    // 'untouched'), adopt the caller's `initialStatus` hint (defaulting to
    // 'untouched' when the caller didn't supply one). NEVER downgrade from an
    // existing 'accepted' — Phase 4 writes 'accepted' on first Accepted
    // submission, and a Phase 2 re-open must not clobber that. Rows whose
    // status is 'attempted' are also preserved (we only upgrade from empty /
    // 'untouched'); callers who want to flip 'attempted' → 'accepted' must
    // go through Phase 4's solve-time writer.
    const existingStatus = fm['lc-status'];
    const existingIsEmpty = typeof existingStatus !== 'string'
      || existingStatus === ''
      || existingStatus === 'untouched';
    if (existingIsEmpty) {
      fm['lc-status'] = input.initialStatus ?? 'untouched';
    }
    // else: keep existing ('accepted' or 'attempted') — never downgrade.
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

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 Plan 03 — solve-time frontmatter writer (GRAPH-02, D-10, D-11, D-20)
// ─────────────────────────────────────────────────────────────────────────
//
// On an Accepted submission, KnowledgeGraphWriter.onAccepted flips five
// lc-* frontmatter fields (lc-status='accepted', lc-solved-date ISO-8601,
// lc-runtime-ms, lc-memory-mb, lc-language) and union-merges `lc/{topic-slug}`
// tags (D-11). `applyFrontmatter` above drives the open/refresh path; this
// solve-time variant is intentionally separate because:
//   - It writes FIVE lc-* keys, not seven (aliases + problem-identity fields
//     are already persisted on note creation).
//   - It has a non-downgrade contract in the OPPOSITE direction from D-04:
//     here we ALWAYS upgrade to 'accepted', never preserve an existing
//     'attempted' status.
//   - Runtime/memory parse may return undefined — the writer must still
//     flip status + date + language in that case (T-04-03-01 threat mitigation).
//
// Purity contract: same as applyFrontmatter — all mutations happen INSIDE
// the processFrontMatter callback. `solvedAt` is captured by the caller
// (KnowledgeGraphWriter) so the helper is safe to retry.
//
// Tag union-merge: any `lc/{topic-slug}` tag present on disk is preserved.
// Plugin-contributed tags are `currentPassTags` (the solve-time union of
// problem-detail topicSlugs + any other tags the caller wants to contribute).
// Non-lc tags ('revisit', 'todo-review', etc.) are preserved.

/** Input for the solve-time frontmatter writer. */
export interface SolveTimeFrontmatterInput {
  /** Solve timestamp as a captured Date (caller owns the clock for retry-safety). */
  solvedAt: Date;
  /** Parsed runtime in milliseconds. Undefined when LC returns "N/A". */
  runtimeMs: number | undefined;
  /** Parsed memory in MB. Undefined when LC returns "N/A". */
  memoryMb: number | undefined;
  /** LC langSlug the submission used (python3, java, cpp, …). */
  language: string;
  /** Plugin-derived tags to union into the frontmatter's tags array — e.g.
   *  ['lc/hash-table', 'lc/array']. Caller maps topic slugs → `lc/{slug}`. */
  currentPassTags: string[];
}

/** ISO-8601 local-tz formatter. Matches src/graph/dateFormat.ts (Plan 04-02).
 *  Duplicated here as a private local rather than creating a new import —
 *  keeps NoteTemplate.ts's import surface unchanged (SSoT module already owns
 *  formatting concerns; Plan 04-02's exported helper is available to
 *  KnowledgeGraphWriter for non-frontmatter paths). */
function formatIsoLocalTz(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = Math.floor(abs / 60);
  const om = abs % 60;
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    sign + pad(oh) + ':' + pad(om)
  );
}

/**
 * Solve-time frontmatter writer (GRAPH-02, Phase 2 D-05 carry).
 *
 * Called from KnowledgeGraphWriter.onAccepted step 1 (D-09). Semantics:
 *
 *   lc-status: 'accepted' — overwrites any existing status including
 *              'accepted' itself (re-AC case; D-24 keeps frontmatter reflective
 *              of the latest submission).
 *   lc-solved-date — ISO-8601 local-tz (D-10). Always written.
 *   lc-runtime-ms — written only when input.runtimeMs is a finite number.
 *                   When undefined (LC returned "N/A"), the key is left
 *                   untouched if previously set, or absent if never set.
 *                   We do NOT explicitly write `undefined` — YAML serializers
 *                   differ on how they handle undefined keys, and the test
 *                   contract accepts "undefined or absent".
 *   lc-memory-mb — same posture as runtime.
 *   lc-language — overwrites with the submission's language (D-24: reflect
 *                 latest, not best; the user may have switched languages).
 *   tags — union-merge input.currentPassTags with existing tags. Preserves
 *          user tags ('revisit') and existing `lc/{slug}` tags.
 *
 * Non-lc-* user keys: untouched.
 */
export async function applySolveTimeFrontmatter(
  app: App,
  file: TFile,
  input: SolveTimeFrontmatterInput,
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    // Status — always 'accepted' on AC. D-24: re-AC still fires this.
    fm['lc-status'] = 'accepted';
    // Solved date — ISO-8601 local-tz (D-10). Always written.
    fm['lc-solved-date'] = formatIsoLocalTz(input.solvedAt);
    // Runtime — D-24 semantic: frontmatter reflects the LATEST AC, not
    // best-ever. When LC returns "N/A" (parse failure → undefined input),
    // explicitly clear the field so the frontmatter doesn't carry stale
    // data from a prior AC. Test contract accepts undefined || absent || null
    // — Obsidian's processFrontMatter serializes `undefined` as an erased key.
    if (typeof input.runtimeMs === 'number' && Number.isFinite(input.runtimeMs)) {
      fm['lc-runtime-ms'] = input.runtimeMs;
    } else {
      fm['lc-runtime-ms'] = undefined;
    }
    if (typeof input.memoryMb === 'number' && Number.isFinite(input.memoryMb)) {
      fm['lc-memory-mb'] = input.memoryMb;
    } else {
      fm['lc-memory-mb'] = undefined;
    }
    // Language — overwrites (D-24).
    fm['lc-language'] = input.language;

    // Tags union-merge. Phase 2 D-10 semantics: preserve existing + add
    // plugin-contributed. Dedup via Set.
    const priorTags = Array.isArray(fm.tags)
      ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const merged = Array.from(new Set<string>([...priorTags, ...input.currentPassTags]));
    fm.tags = merged;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 Plan 02 extensions (GRAPH-03, GRAPH-04, D-12, D-16, D-17)
// ─────────────────────────────────────────────────────────────────────────
//
// All three helpers are pure string builders with ZERO new imports:
//  - buildTechniquesBlock → `## Techniques` body content (D-12)
//  - buildTechniqueStubBody → frontmatter-only stub note body (D-16)
//  - buildTechniqueFilename → vault-safe filename (D-17)
//
// SSoT invariant preserved: heading literals come from TECHNIQUES_HEADING_LINE;
// no other module hardcodes `## Techniques`.

/**
 * Emits the plugin's canonical `## Techniques` block body (D-12). Format:
 *   "## Techniques\n\n- [[Name1]]\n- [[Name2]]\n..."
 *
 * Ordering follows LC's natural `topicTags` order (D-12) — caller passes the
 * tags in the desired order (no sort here). Empty tag array returns just the
 * heading + blank line (callers should skip the write when topicTags is empty
 * per D-25; see KnowledgeGraphWriter Plan 03 guard).
 */
export function buildTechniquesBlock(
  topicTags: ReadonlyArray<{ name: string }>,
): string {
  const bullets = topicTags.map((t) => `- [[${t.name}]]`).join('\n');
  return `${TECHNIQUES_HEADING_LINE}\n\n${bullets}`;
}

/**
 * Emits the frontmatter-only stub technique note body (D-16). Exactly three
 * frontmatter fields, empty body after the closing fence:
 *   ---
 *   lc-technique: <slug>
 *   aliases:
 *     - <name>
 *   tags:
 *     - lc/technique/<slug>
 *   ---
 *   <empty body — cursor lands here when user opens the note>
 *
 * Caller is responsible for never-overwrite discipline (D-18) — see
 * StubNoteCreator.createStubIfMissing in src/graph/StubNoteCreator.ts.
 */
export function buildTechniqueStubBody(slug: string, name: string): string {
  return `---\nlc-technique: ${slug}\naliases:\n  - ${name}\ntags:\n  - lc/technique/${slug}\n---\n\n`;
}

/**
 * Normalize a LC topic-tag name into a vault-safe filename (D-17).
 * Replaces vault-forbidden chars (`/`, `\\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
 * with `-`. Preserves `+` for the C++ case (RESEARCH §A1 — filesystem-legal
 * on all target OSes). Appends the `.md` extension. Does NOT path-join —
 * caller provides the folder.
 *
 * Defensive posture: LC's real topic-tag names are alphanumeric + spaces +
 * hyphens in practice (checked against live LC 2026-05), but this helper
 * protects against future drift and against malicious `name` values that
 * could trigger path-traversal (T-04-02-01 — e.g. `'../evil'` collapses to
 * `'-.-.-evil.md'` which stays inside the Techniques folder).
 */
export function buildTechniqueFilename(name: string): string {
  const safe = name.replace(/[/\\:*?"<>|]/g, '-');
  return `${safe}.md`;
}
