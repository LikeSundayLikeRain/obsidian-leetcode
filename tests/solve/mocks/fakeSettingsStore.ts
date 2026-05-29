// tests/solve/mocks/fakeSettingsStore.ts
// In-memory SettingsStore stub for Phase 3 tests. Exposes the minimal facade
// the solve orchestrator (Plan 05) + REST client (Plan 04) + polling loop
// actually consume: getAuthCookies / getDefaultLanguage / getProblemsFolder /
// getProblemDetail / setProblemDetail / pruneProblemDetails.
//
// Modeled on makeEmptySettings() in tests/new-note-fetch-failure.test.ts
// (lines 17-28). Extracted to tests/solve/mocks/ so every test file in Wave 0
// shares one construct-and-override helper.

import type { AuthCookies } from '../../../src/auth/types';
import type { DetailCacheEntry } from '../../../src/settings/SettingsStore';

/** Minimal facade used by Phase 3 (run / submit / polling). A subset of the
 *  real SettingsStore surface — enough for tests to drive the solve path
 *  without building a full Plugin + data.json round-trip.
 *
 *  Phase 5 Wave 0 additions:
 *  - `techniquesFolderOverride` + round-trip getter/setter (D-15).
 *  - `getAutoBacklinksEnabled` + setter (D-16 consumption in Settings UI tests).
 *  - `getTechniquesFolder()` now honors override: empty string → derived
 *    default, non-empty string → override verbatim. */
export interface FakeSettings {
  getAuthCookies(): AuthCookies | null;
  getDefaultLanguage(): string;
  getProblemsFolder(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
  setProblemDetail(slug: string, entry: DetailCacheEntry): Promise<void>;
  pruneProblemDetails(maxAgeMs?: number): Promise<number>;
  // Phase 5 POLISH-01 D-15 — technique folder override round-trip.
  getTechniquesFolderOverride(): string;
  setTechniquesFolderOverride(v: string): Promise<void>;
  getTechniquesFolder(): string;
  // Phase 5 POLISH-01 D-16 — auto-backlink toggle round-trip (Settings UI).
  getAutoBacklinksEnabled(): boolean;
  setAutoBacklinksEnabled(v: boolean): Promise<void>;
  // Phase 09 AIREV-01 — auto AI review on Accepted toggle round-trip.
  getAutoAIReviewOnAC(): boolean;
  setAutoAIReviewOnAC(v: boolean): Promise<void>;
  // Phase 10 Plan 07 — auto AI contest analysis toggle round-trip.
  getAutoAIContestAnalysis(): boolean;
  setAutoAIContestAnalysis(v: boolean): Promise<void>;
  // Phase 16 INDENT-04 — indent size override.
  getIndentSizeOverride(): 'auto' | 2 | 4 | 8;
  setIndentSizeOverride(v: 'auto' | 2 | 4 | 8): Promise<void>;
  // Phase 18 Plan 03 D-35 — relative line numbers toggle.
  getShowRelativeLineNumbers(): boolean;
  setShowRelativeLineNumbers(v: boolean): Promise<void>;
  // Phase 19 vq4 — nested-editor master toggle (reload-required).
  getUseNestedEditor(): boolean;
  setUseNestedEditor(v: boolean): Promise<void>;
  // Phase 19 D-05 — inline widget master toggle (reload-required).
  getUseInlineWidget(): boolean;
  setUseInlineWidget(v: boolean): Promise<void>;
  // Phase 19 C-06 — debounced widget writer delay (5 options).
  getWidgetSyncDebounceMs(): 300 | 400 | 500 | 1000 | 2000;
  setWidgetSyncDebounceMs(v: 300 | 400 | 500 | 1000 | 2000): Promise<void>;
}

/** Optional seed values for `makeFakeSettingsStore`. Any field left undefined
 *  falls back to the Phase 2-compatible default. Pass `cookies: null` to
 *  explicitly simulate an unauthenticated state. */
export interface FakeSettingsOverrides {
  /** `null` explicitly → unauthenticated. `undefined` → default test cookies. */
  cookies?: AuthCookies | null;
  defaultLanguage?: string;
  problemsFolder?: string;
  problemDetails?: Record<string, DetailCacheEntry>;
  /** Phase 5 D-15 — seed the technique folder override. Empty string = no
   *  override (use derived default). */
  techniquesFolderOverride?: string;
  /** Phase 5 D-16 — seed the auto-backlink toggle. Default matches production
   *  default (`true`). */
  autoBacklinksEnabled?: boolean;
}

const DEFAULT_COOKIES: AuthCookies = {
  LEETCODE_SESSION: 'test-session',
  csrftoken: 'test-csrf',
};
const DEFAULT_LANGUAGE = 'python3';
const DEFAULT_FOLDER = 'LeetCode';

/**
 * Build a fake SettingsStore facade with optional seeded values.
 *
 * Call shape:
 *   const settings = makeFakeSettingsStore();                              // all defaults
 *   const noAuth = makeFakeSettingsStore({ cookies: null });               // unauth path
 *   const seeded = makeFakeSettingsStore({
 *     problemDetails: { 'two-sum': makeDetailCacheEntry() }
 *   });
 *
 * `setProblemDetail` mutates an internal Map; `getProblemDetail` reads from
 * it. `pruneProblemDetails` returns 0 by default (Wave 0 tests don't drive
 * TTL logic — that's Phase 2 territory).
 */
export function makeFakeSettingsStore(overrides: FakeSettingsOverrides = {}): FakeSettings {
  const cookies: AuthCookies | null =
    overrides.cookies === null ? null : overrides.cookies ?? DEFAULT_COOKIES;
  const defaultLanguage = overrides.defaultLanguage ?? DEFAULT_LANGUAGE;
  const problemsFolder = overrides.problemsFolder ?? DEFAULT_FOLDER;
  const details = new Map<string, DetailCacheEntry>(
    Object.entries(overrides.problemDetails ?? {})
  );
  // Phase 5 POLISH-01 — mutable state for override + toggle round-trips.
  let techniquesFolderOverride = overrides.techniquesFolderOverride ?? '';
  let autoBacklinksEnabled = overrides.autoBacklinksEnabled ?? true;

  const getProblemsFolder = (): string => problemsFolder;

  return {
    getAuthCookies() {
      return cookies;
    },
    getDefaultLanguage() {
      return defaultLanguage;
    },
    getProblemsFolder,
    getProblemDetail(slug: string) {
      return details.get(slug) ?? null;
    },
    async setProblemDetail(slug: string, entry: DetailCacheEntry) {
      details.set(slug, entry);
    },
    async pruneProblemDetails(_maxAgeMs?: number) {
      return 0;
    },
    // Phase 5 D-15 — techniquesFolderOverride round-trip.
    getTechniquesFolderOverride() {
      return techniquesFolderOverride;
    },
    async setTechniquesFolderOverride(v: string) {
      techniquesFolderOverride = v;
    },
    // Phase 5 D-15 — override-honoring getTechniquesFolder.
    // Empty override → derived default; non-empty → override verbatim.
    getTechniquesFolder() {
      const override = techniquesFolderOverride;
      return override && override.length > 0
        ? override
        : `${getProblemsFolder()}/Techniques`;
    },
    // Phase 5 D-16 — autoBacklinksEnabled round-trip.
    getAutoBacklinksEnabled() {
      return autoBacklinksEnabled;
    },
    async setAutoBacklinksEnabled(v: boolean) {
      autoBacklinksEnabled = v;
    },
    // Phase 09 AIREV-01 — autoAIReviewOnAC round-trip.
    getAutoAIReviewOnAC() {
      return false;
    },
    async setAutoAIReviewOnAC(_v: boolean) {
      // no-op in fake
    },
    // Phase 10 Plan 07 — autoAIContestAnalysis round-trip.
    getAutoAIContestAnalysis() {
      return false;
    },
    async setAutoAIContestAnalysis(_v: boolean) {
      // no-op in fake
    },
    // Phase 16 INDENT-04 — indent size override.
    getIndentSizeOverride() {
      return 'auto' as const;
    },
    async setIndentSizeOverride(_v: 'auto' | 2 | 4 | 8) {
      // no-op in fake
    },
    // Phase 18 Plan 03 D-35 — relative line numbers toggle.
    getShowRelativeLineNumbers() {
      return false;
    },
    async setShowRelativeLineNumbers(_v: boolean) {
      // no-op in fake
    },
    // Phase 19 vq4 — nested-editor master toggle. Default true mirrors the
    // production default and keeps existing tests' behavior byte-identical.
    getUseNestedEditor() {
      return true;
    },
    async setUseNestedEditor(_v: boolean) {
      // no-op in fake
    },
    // Phase 19 D-05 — inline widget master toggle. Default false mirrors the
    // production hard-gate default; existing tests render the v1.2 path.
    getUseInlineWidget() {
      return false;
    },
    async setUseInlineWidget(_v: boolean) {
      // no-op in fake
    },
    // Phase 19 C-06 — debounced widget writer delay. Default 400 mirrors prod.
    getWidgetSyncDebounceMs() {
      return 400 as const;
    },
    async setWidgetSyncDebounceMs(_v: 300 | 400 | 500 | 1000 | 2000) {
      // no-op in fake
    },
  };
}

/** Build a plausible DetailCacheEntry for Phase 3 tests. All fields populated
 *  with valid shapes so downstream code can call `.codeSnippets?.find(...)`
 *  without hitting undefined. Overrides take precedence per-field. */
export function makeDetailCacheEntry(
  overrides: Partial<DetailCacheEntry> = {}
): DetailCacheEntry {
  const base: DetailCacheEntry = {
    fetchedAt: Date.now(),
    id: 1,
    title: 'Test Problem',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/test/',
    contentHtml: '<p>Problem statement.</p>',
    topicSlugs: [],
    exampleTestcases: '[1,2]\n3',
    codeSnippets: [
      { lang: 'Python3', langSlug: 'python3', code: 'class Solution:\n    pass' },
    ],
  };
  return { ...base, ...overrides };
}
