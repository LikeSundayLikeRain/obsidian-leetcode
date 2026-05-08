// src/settings/SettingsStore.ts
// Async wrapper over plugin.loadData() / plugin.saveData().
// All feature code reads/writes data.json through this class.
// Cookies NEVER leave data.json (CF-03, AUTH-06).
import type { Plugin } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { IndexedProblem, ProblemIndex } from '../browse/types';
import { logger } from '../shared/logger';

// CF-03 compliance: contentHtml is LC public problem content — non-sensitive. Only
// auth.LEETCODE_SESSION (a sibling in PluginData) is a secret; logger.ts redaction
// patterns target that field. contentHtml is safely persisted in data.json without redaction.
/** Per-problem detail cache entry persisted in data.json.
 *  Schema locked by CONTEXT.md D-14. Keyed by slug inside PluginData.problemDetails.
 *  ~10–50 KB per entry; 7-day TTL enforced by callers (NoteWriter.CACHE_TTL_MS). */
export interface DetailCacheEntry {
  fetchedAt: number;
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  contentHtml: string;
  topicSlugs: string[];
  exampleTestcases?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  /** Phase 3 D-30 — LC's internal `questionId` (distinct from `questionFrontendId`
   *  for some problems, e.g., premium variants). Used as the `question_id` REST
   *  body field by Plan 04's leetcodeRest.ts. Optional: Phase 2 cache entries
   *  written before this field existed remain valid. */
  internalQuestionId?: string;
}

export interface PluginData {
  version: 1;
  auth: AuthCookies | null;
  username: string | null;
  /** Whether the signed-in user has LC Premium. Controls the default-hide-premium
   *  behavior in the filter modal (if null → unknown, treat as non-premium). */
  isPremium: boolean | null;
  problemsFolder: string;  // D-10: default 'LeetCode' (stored without trailing slash)
  defaultLanguage: string; // D-10: default 'python3' (LC's Python slug)
  problemIndex: ProblemIndex | null;
  /** Compound filter rules from the filter modal. Null = no filter active.
   *  Persisted so filter survives plugin reload / Obsidian restart. */
  filter: CompoundFilter | null;
  /** Per-slug problem-detail cache. Populated on first problem open; refreshed
   *  by NoteWriter on re-open after a 7-day TTL. Malformed entries dropped at
   *  load time. D-14. */
  problemDetails: Record<string, DetailCacheEntry>;
  /** GAP-6 migration flag: set to true after the one-time "your LeetCode.base
   *  may need to be regenerated" Notice fires, so subsequent plugin loads do
   *  not spam the user. Checked against the v0.1.0 broken signature in
   *  src/notes/BaseFile.ts. */
  legacyBaseNoticeShown: boolean;
}

/** Compound filter matching LC's "Match All/Any of the following" UI. Each
 *  rule targets a single field with an operator; the top-level `match` field
 *  decides AND vs OR across rules. */
export interface CompoundFilter {
  match: 'all' | 'any';
  rules: FilterRule[];
}

export type FilterRule =
  | { field: 'status'; op: 'is' | 'is-not'; values: string[] }
  | { field: 'difficulty'; op: 'is' | 'is-not'; values: string[] }
  | { field: 'topics'; op: 'is' | 'is-not'; values: string[] }
  | { field: 'question-id'; op: 'range'; min: number | null; max: number | null }
  | { field: 'acceptance'; op: 'range'; min: number | null; max: number | null }
  | { field: 'premium'; op: 'is'; value: 'premium' | 'non-premium' | null };

const DEFAULT_DATA: PluginData = {
  version: 1,
  auth: null,
  username: null,
  isPremium: null,
  problemsFolder: 'LeetCode',
  defaultLanguage: 'python3',
  problemIndex: null,
  filter: null,
  problemDetails: {},
  legacyBaseNoticeShown: false,
};

const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const VALID_STATUSES = new Set(['solved', 'attempted', 'untouched']);

/** Shape-guard for AuthCookies; rejects non-string fields that would flow into
 *  Credential.init() as non-strings and silently fail all subsequent API calls. */
function isValidAuthCookies(v: unknown): v is AuthCookies {
  if (v === null || typeof v !== 'object') return false;
  const a = v as Partial<AuthCookies>;
  return typeof a.LEETCODE_SESSION === 'string' && typeof a.csrftoken === 'string';
}

/** Strip trailing slashes; reject path-traversal segments and absolute paths so a
 *  corrupt/malicious data.json can't steer vault writes outside the configured folder.
 *  Returns the default value if input is unsafe. */
function sanitizeFolder(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DATA.problemsFolder;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_DATA.problemsFolder;
  // Reject absolute paths (Unix + Windows).
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return DEFAULT_DATA.problemsFolder;
  // Reject any `..` segment anywhere in the path.
  const segments = trimmed.split(/[\\/]+/);
  if (segments.some((s) => s === '..')) return DEFAULT_DATA.problemsFolder;
  return trimmed.replace(/[\\/]+$/, '');
}

/** Shape-guard for a single IndexedProblem row. WR-04: if any row is missing a
 *  required field (especially `diff`), ProblemBrowserView.renderRow crashes on
 *  p.diff.toLowerCase() — so we force a clean re-fetch rather than load partial data. */
function isValidIndexedProblem(v: unknown): v is IndexedProblem {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<IndexedProblem>;
  return (
    typeof p.id === 'number' &&
    typeof p.slug === 'string' &&
    typeof p.title === 'string' &&
    typeof p.diff === 'string' && VALID_DIFFICULTIES.has(p.diff) &&
    typeof p.paid === 'boolean' &&
    (p.status === undefined || (typeof p.status === 'string' && VALID_STATUSES.has(p.status))) &&
    (p.acRate === undefined || (typeof p.acRate === 'number' && p.acRate >= 0 && p.acRate <= 100)) &&
    (p.topics === undefined ||
      (Array.isArray(p.topics) && p.topics.every((t) => typeof t === 'string')))
  );
}

function isValidProblemIndex(v: unknown): v is ProblemIndex {
  if (!v || typeof v !== 'object') return false;
  const idx = v as Partial<ProblemIndex>;
  if (typeof idx.fetchedAt !== 'number' || !Array.isArray(idx.problems)) return false;
  return idx.problems.every(isValidIndexedProblem);
}

/** Shape-guard for persisted compound filter. Rejects unknown field names /
 *  operator values so a corrupt data.json can't inject a filter rule that
 *  crashes the evaluator. */
function isValidCompoundFilter(v: unknown): v is CompoundFilter {
  if (!v || typeof v !== 'object') return false;
  const f = v as Partial<CompoundFilter>;
  if (f.match !== 'all' && f.match !== 'any') return false;
  if (!Array.isArray(f.rules)) return false;
  return f.rules.every((r: unknown) => {
    if (!r || typeof r !== 'object') return false;
    const rule = r as Record<string, unknown>;
    const multiValueFields = new Set(['status', 'difficulty', 'topics']);
    const rangeFields = new Set(['question-id', 'acceptance']);
    if (typeof rule.field !== 'string') return false;
    if (multiValueFields.has(rule.field)) {
      return (rule.op === 'is' || rule.op === 'is-not') &&
        Array.isArray(rule.values) &&
        rule.values.every((x) => typeof x === 'string');
    }
    if (rangeFields.has(rule.field)) {
      return rule.op === 'range' &&
        (rule.min === null || typeof rule.min === 'number') &&
        (rule.max === null || typeof rule.max === 'number');
    }
    if (rule.field === 'premium') {
      return rule.op === 'is' &&
        (rule.value === null || rule.value === 'premium' || rule.value === 'non-premium');
    }
    return false;
  });
}

/** Shape-guard for a single DetailCacheEntry; same posture as isValidIndexedProblem. */
function isValidDetailCacheEntry(v: unknown): v is DetailCacheEntry {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<DetailCacheEntry>;
  if (typeof d.fetchedAt !== 'number') return false;
  if (typeof d.id !== 'number') return false;
  if (typeof d.title !== 'string') return false;
  if (typeof d.difficulty !== 'string' || !VALID_DIFFICULTIES.has(d.difficulty)) return false;
  if (typeof d.url !== 'string') return false;
  if (typeof d.contentHtml !== 'string') return false;
  if (!Array.isArray(d.topicSlugs) || !d.topicSlugs.every((s) => typeof s === 'string')) return false;
  if (d.exampleTestcases !== undefined && typeof d.exampleTestcases !== 'string') return false;
  if (d.codeSnippets !== undefined) {
    if (!Array.isArray(d.codeSnippets)) return false;
    if (!d.codeSnippets.every((c) =>
      c && typeof c === 'object' &&
      typeof (c as { lang?: unknown }).lang === 'string' &&
      typeof (c as { langSlug?: unknown }).langSlug === 'string' &&
      typeof (c as { code?: unknown }).code === 'string'
    )) return false;
  }
  // Phase 3 D-30 — internalQuestionId optional string. Old entries without
  // the field remain valid (Phase 2 backward compat); malformed non-string
  // rejects the whole entry (T-03-03-03 threat mitigation).
  if (d.internalQuestionId !== undefined && typeof d.internalQuestionId !== 'string') return false;
  return true;
}

/** Filter incoming problemDetails down to valid entries; drop the rest. */
function sanitizeProblemDetails(raw: unknown): Record<string, DetailCacheEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DetailCacheEntry> = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (typeof slug === 'string' && slug.length > 0 && isValidDetailCacheEntry(entry)) {
      out[slug] = entry;
    }
  }
  return out;
}

export class SettingsStore {
  private constructor(private plugin: Plugin, private data: PluginData) {}

  static async load(plugin: Plugin): Promise<SettingsStore> {
    // Treat data.json as untrusted — anyone (or a broken prior version) could
    // have written it. Validate every field before accepting it into PluginData
    // (CR-02). Falls back to DEFAULT_DATA per-field on validation failure.
    const rawUnknown: unknown = (await plugin.loadData()) ?? {};
    const raw = (rawUnknown && typeof rawUnknown === 'object')
      ? (rawUnknown as Record<string, unknown>)
      : {};
    const data: PluginData = {
      version: 1,
      auth: isValidAuthCookies(raw.auth) ? raw.auth : DEFAULT_DATA.auth,
      username: typeof raw.username === 'string' ? raw.username : DEFAULT_DATA.username,
      isPremium: typeof raw.isPremium === 'boolean' ? raw.isPremium : DEFAULT_DATA.isPremium,
      problemsFolder: sanitizeFolder(raw.problemsFolder),
      defaultLanguage: (typeof raw.defaultLanguage === 'string' && raw.defaultLanguage.trim())
        ? raw.defaultLanguage
        : DEFAULT_DATA.defaultLanguage,
      problemIndex: isValidProblemIndex(raw.problemIndex) ? raw.problemIndex : DEFAULT_DATA.problemIndex,
      filter: isValidCompoundFilter(raw.filter) ? raw.filter : DEFAULT_DATA.filter,
      problemDetails: sanitizeProblemDetails(raw.problemDetails),
      legacyBaseNoticeShown: raw.legacyBaseNoticeShown === true,
    };
    // Warn without leaking values so a user whose disk file is corrupt knows
    // why they unexpectedly see a logged-out state or a fresh index refetch.
    if (raw.auth !== undefined && raw.auth !== null && !isValidAuthCookies(raw.auth)) {
      logger.warn('settings.load: ignoring malformed auth; reverting to logged-out state');
    }
    if (raw.problemIndex !== undefined && raw.problemIndex !== null && !isValidProblemIndex(raw.problemIndex)) {
      logger.warn('settings.load: ignoring malformed problemIndex; will re-fetch');
    }
    if (typeof raw.problemsFolder === 'string' && raw.problemsFolder.trim() &&
        sanitizeFolder(raw.problemsFolder) === DEFAULT_DATA.problemsFolder &&
        raw.problemsFolder.trim().replace(/[\\/]+$/, '') !== DEFAULT_DATA.problemsFolder) {
      logger.warn('settings.load: rejected unsafe problemsFolder; reverted to default');
    }
    if (raw.problemDetails !== undefined && raw.problemDetails !== null) {
      const rawMap = raw.problemDetails;
      const inputKeys = rawMap && typeof rawMap === 'object' ? Object.keys(rawMap).length : 0;
      const keptKeys = Object.keys(data.problemDetails).length;
      if (inputKeys !== keptKeys) {
        logger.warn(`settings.load: dropped ${inputKeys - keptKeys} malformed problemDetails entries`);
      }
    }
    return new SettingsStore(plugin, data);
  }

  getAuthCookies(): AuthCookies | null { return this.data.auth; }
  async setAuthCookies(c: AuthCookies | null): Promise<void> {
    this.data.auth = c;
    await this.persist();
  }

  getProblemsFolder(): string { return this.data.problemsFolder; }
  async setProblemsFolder(v: string): Promise<void> {
    this.data.problemsFolder = v;
    await this.persist();
  }

  getDefaultLanguage(): string { return this.data.defaultLanguage; }
  async setDefaultLanguage(v: string): Promise<void> {
    this.data.defaultLanguage = v;
    await this.persist();
  }

  getProblemIndex(): ProblemIndex | null { return this.data.problemIndex; }
  async setProblemIndex(i: ProblemIndex): Promise<void> {
    this.data.problemIndex = i;
    await this.persist();
  }

  getUsername(): string | null { return this.data.username; }
  async setUsername(u: string | null): Promise<void> {
    this.data.username = u;
    await this.persist();
  }

  getIsPremium(): boolean | null { return this.data.isPremium; }
  async setIsPremium(v: boolean | null): Promise<void> {
    this.data.isPremium = v;
    await this.persist();
  }

  getFilter(): CompoundFilter | null { return this.data.filter; }
  async setFilter(f: CompoundFilter | null): Promise<void> {
    this.data.filter = f;
    await this.persist();
  }

  /** Read the cached detail for a slug. D-15. Returns null if missing. */
  getProblemDetail(slug: string): DetailCacheEntry | null {
    return this.data.problemDetails[slug] ?? null;
  }

  /** Persist a detail cache entry. D-15. Mutates in place + persists. */
  async setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void> {
    this.data.problemDetails[slug] = detail;
    await this.persist();
  }

  /** Phase 3 D-30 — read the internal LC questionId for a slug, if cached.
   *  Returns null if the slug has no cached detail or the detail pre-dates
   *  Phase 3 (no internalQuestionId field). Plan 05's SubmissionOrchestrator
   *  falls back to a live fetch when this returns null. */
  getInternalQuestionId(slug: string): string | null {
    const entry = this.getProblemDetail(slug);
    return entry?.internalQuestionId ?? null;
  }

  /** GAP-6: has the one-time "regenerate LeetCode.base" Notice fired yet?
   *  Checked by main.ts on every plugin load — returns true once the Notice
   *  has been shown so we don't spam the user on subsequent loads. */
  hasShownLegacyBaseNotice(): boolean {
    return this.data.legacyBaseNoticeShown === true;
  }

  /** GAP-6: mark the one-time "regenerate LeetCode.base" Notice as shown and
   *  persist so subsequent plugin loads skip the notice path. */
  async markLegacyBaseNoticeShown(): Promise<void> {
    this.data.legacyBaseNoticeShown = true;
    await this.persist();
  }

  /** Remove cache entries older than `maxAgeMs`. Returns pruned count.
   *  Opportunistic; called at caller's discretion (D-15). */
  async pruneProblemDetails(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [slug, entry] of Object.entries(this.data.problemDetails)) {
      if (entry.fetchedAt < cutoff) {
        delete this.data.problemDetails[slug];
        pruned++;
      }
    }
    if (pruned > 0) await this.persist();
    return pruned;
  }

  private async persist(): Promise<void> {
    await this.plugin.saveData(this.data);
  }
}
