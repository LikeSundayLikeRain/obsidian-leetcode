// src/solve/resolveStarterCode.ts
//
// Failure B (Phase 22 follow-up) — resolve a LeetCode starter snippet for a
// (slug, langSlug) pair via cache-first + live-fetch fallback. Used by
// switchLanguageFromWidget so the language-switch chevron can swap the fence
// body to the new language's starter (restoring v1.2 contract within v1.3's
// inline-widget architecture).
//
// Pure helper — no Obsidian or app dependencies. Dependency-injected for
// straightforward unit testing. Co-located with src/solve/ because the
// starter-snippet read sits alongside the run/submit dispatchers that consume
// the same DetailCacheEntry shape.
//
// Contract — return shape `{ code, reason }`:
//   - 'ok'          : code is a non-empty string (cache hit, fresh fetch, OR
//                     usable stale-cache after network failure).
//   - 'network'     : cache empty AND fetch failed (offline). Caller surfaces
//                     an offline Notice; user retries when online.
//   - 'unavailable' : fetch succeeded (or cache is fresh) but no codeSnippets
//                     entry for langSlug exists. LC genuinely has no starter
//                     for this language on this problem.
//
// 7-day TTL via CACHE_TTL_MS reused from src/notes/NoteWriter.ts. Pre-Phase-2
// cache entries (codeSnippets undefined per Pitfall 10) trigger a live-fetch
// regardless of fetchedAt freshness so we never return stale-by-shape data.
//
// Network failures are caught: if cache holds a usable code we return it with
// reason 'ok' (graceful degradation — the alternative is forcing the user
// offline-stuck). If cache is empty we return { null, 'network' }. An
// empty-string snippet from LC is treated as { null, 'unavailable' } —
// LC has been observed to return zero-length code for a few langs/problems
// and a literal empty buffer is not useful as a "starter".

import type { DetailCacheEntry } from '../settings/SettingsStore';
import type { LeetCodeProblemDetail } from '../api/LeetCodeClient';
import { CACHE_TTL_MS, toDetailCacheEntry } from '../notes/NoteWriter';

export type ResolveStarterReason = 'ok' | 'network' | 'unavailable';

export interface ResolveStarterResult {
  code: string | null;
  reason: ResolveStarterReason;
}

/**
 * Structural settings shape — mirrors `NoteWriterSettings` (a subset). Only
 * the two methods used here are declared so tests can pass plain objects.
 */
export interface ResolveStarterSettings {
  getProblemDetail(slug: string): DetailCacheEntry | null;
  setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>;
}

/**
 * Structural client shape — mirrors `NoteWriterClient`. The widget pipeline
 * passes `LeetCodeClient.getProblemDetail` directly; tests pass a stub.
 */
export interface ResolveStarterClient {
  getProblemDetail(slug: string): Promise<LeetCodeProblemDetail | null>;
}

export interface ResolveStarterDeps {
  settings: ResolveStarterSettings;
  client: ResolveStarterClient;
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Resolve the LC starter snippet `code` for (slug, langSlug). See module
 * header for the `{ code, reason }` contract.
 */
export async function resolveStarterCode(
  deps: ResolveStarterDeps,
  slug: string,
  langSlug: string,
): Promise<ResolveStarterResult> {
  const now = (deps.now ?? Date.now)();
  let entry = deps.settings.getProblemDetail(slug);
  const stale = !entry || now - entry.fetchedAt > CACHE_TTL_MS;
  // Pitfall 10 — pre-Phase-2 cache entries lack codeSnippets entirely; force a
  // live-fetch so we don't return null forever for old slugs.
  const needsFetch = stale || !entry?.codeSnippets;
  let networkFailed = false;
  if (needsFetch) {
    try {
      const fresh = await deps.client.getProblemDetail(slug);
      if (fresh) {
        // Map to canonical cache shape, persist for future calls.
        entry = toDetailCacheEntry({
          questionFrontendId: fresh.questionFrontendId,
          questionId: fresh.questionId ?? null,
          titleSlug: fresh.titleSlug,
          title: fresh.title,
          content: fresh.content,
          difficulty: fresh.difficulty,
          isPaidOnly: fresh.isPaidOnly,
          topicTags: fresh.topicTags,
          exampleTestcases: fresh.exampleTestcases,
          metaData: fresh.metaData,
          sampleTestCase: fresh.sampleTestCase,
          codeSnippets: fresh.codeSnippets,
        });
        await deps.settings.setProblemDetail(slug, entry);
      }
    } catch {
      networkFailed = true;
    }
  }
  const snippet = entry?.codeSnippets?.find((s) => s.langSlug === langSlug)?.code;
  if (typeof snippet === 'string' && snippet.length > 0) {
    return { code: snippet, reason: 'ok' };
  }
  // No usable snippet. Disambiguate offline vs LC-has-no-starter so the
  // caller can surface the right Notice copy.
  if (networkFailed && !entry?.codeSnippets) {
    return { code: null, reason: 'network' };
  }
  return { code: null, reason: 'unavailable' };
}
