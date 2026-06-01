// src/graph/SubmissionHistoryStore.ts
//
// Phase 4 Plan 05 — Submission history coordinator (D-02, D-07 carry-forward).
//
// Bridges two surfaces that both want submission history for a slug:
//   1. On-note-open refetch (D-02): NoteWriter fires a fire-and-forget prefetch
//      after reveal so the picker is instant if the user opens it shortly after.
//   2. `LeetCode: View past submissions` picker (D-03): consumes whatever the
//      store has cached or falls through to a live fetch.
//
// No data.json persistence (D-07). The store is pure in-memory and scoped to a
// single plugin session — plugin unload drops everything on the floor. The
// LC-experience rationale: the user's local view must always reflect LC's
// server-of-truth; stale cache → picker shows a stale list after the user
// submitted from the web. D-07 explicitly rules this out.
//
// Concurrency model:
//   - Per-slug in-flight promise dedupe — two callers racing for the same slug
//     share one network hop rather than firing two requests against LC's
//     throttle (CF-09 — 20 req/10s ceiling).
//   - TTL is very short (60 s) and matches the "opened note + immediately
//     opened picker" UX. After 60 s the store refetches — this is close enough
//     to live for LC-experience parity without spamming the throttle on rapid
//     picker re-opens.
//   - `invalidate(slug)` lets the on-AC pipeline (or any mutator that knows a
//     new submission was made) drop the cached entry so the next picker open
//     refetches.
//
// No network layer is imported at the module level — the dependency is injected
// as `deps.fetchHistory(slug)` so tests can script success/error/session-expired
// branches without stubbing GraphQL. In production wiring this comes from a
// lambda that closes over current auth cookies.
//
// Error posture: `fetchHistory` throws SessionExpiredError / generic Error;
// those propagate through `prefetch` (fire-and-forget callers silently swallow
// via `.catch`) and through `get` (awaited callers decide how to surface).

import type { SubmissionRow } from './submissionHistoryClient';

const DEFAULT_FRESHNESS_MS = 60 * 1000;  // 60 s — matches "just-opened the note" UX.

/**
 * Phase 20 Plan 20-10 (gap-closure T9 surface layer) — short TTL on empty
 * results. Empty `rows[]` arrays cache for only 5 seconds (vs 60 s for
 * non-empty), bounding the documented 60-second blackout window after the
 * D-02 prefetch race at src/main.ts:449. The 5 s floor still bounds the
 * per-note-open prefetch fetch storm to at most 1 LC API call per slug per
 * 5 s — LC's 20 req / 10 s throttle is preserved even when the user opens
 * many unsubmitted problems in rapid succession.
 *
 * See .planning/debug/widget-plugin-handoff-cluster.md T9 surface layer.
 */
const EMPTY_TTL_MS = 5 * 1000;

/** Network shim — production wires this to
 *  `(slug) => listSubmissionsForSlug(slug, cookies)`. Tests pass a vi.fn. */
export type SubmissionHistoryFetcher =
  (slug: string) => Promise<SubmissionRow[]>;

export interface SubmissionHistoryStoreDeps {
  fetchHistory: SubmissionHistoryFetcher;
  /** Optional — override the in-memory freshness window. Defaults to 60s.
   *  Tests pass `0` to force refetch on every call; production uses the default. */
  freshnessMs?: number;
  /** Optional — clock injection for deterministic tests. */
  now?: () => number;
}

interface CachedEntry {
  fetchedAt: number;
  rows: SubmissionRow[];
  /**
   * Phase 20 Plan 20-10 (gap-closure T9) — empty-result flag drives the
   * short-TTL gate. `true` → entry expires after EMPTY_TTL_MS; `false` →
   * entry expires after the standard freshnessMs (60 s).
   */
  isEmpty: boolean;
}

export class SubmissionHistoryStore {
  private readonly fetchHistory: SubmissionHistoryFetcher;
  private readonly freshnessMs: number;
  private readonly now: () => number;

  /** Per-slug completed snapshots. Evicted by `invalidate(slug)` and by TTL
   *  during read. */
  private readonly cache = new Map<string, CachedEntry>();

  /** In-flight fetch promises keyed by slug. Dedupes concurrent calls so
   *  a prefetch + picker-open for the same slug shares one network hop. */
  private readonly inflight = new Map<string, Promise<SubmissionRow[]>>();

  constructor(deps: SubmissionHistoryStoreDeps) {
    this.fetchHistory = deps.fetchHistory;
    this.freshnessMs = deps.freshnessMs ?? DEFAULT_FRESHNESS_MS;
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Kick off a background fetch for `slug`. Returns the in-flight promise for
   * callers that want to await it (tests) but production invokes this as
   * `void store.prefetch(slug)` from NoteWriter.openProblem's post-reveal hook.
   *
   * Semantics:
   *   - Fresh cache hit (< freshnessMs) → resolves immediately with cached rows;
   *     no network.
   *   - In-flight for same slug → returns the same promise (shared fetch).
   *   - Stale or absent → new network hop; result populates cache on success;
   *     failures propagate to the returned promise but the cache stays untouched
   *     so the next call retries.
   *
   * Errors propagate — fire-and-forget callers must attach a `.catch` to avoid
   * unhandled-rejection warnings.
   */
  prefetch(slug: string): Promise<SubmissionRow[]> {
    return this.getOrFetch(slug);
  }

  /**
   * Return submission rows for `slug`. Picker path uses this on open — the
   * semantics are identical to `prefetch`, just surfaced as a return value.
   *
   * Throws whatever `fetchHistory` throws (SessionExpiredError, generic Error);
   * callers (picker) translate those into UI states per D-06.
   */
  get(slug: string): Promise<SubmissionRow[]> {
    return this.getOrFetch(slug);
  }

  /**
   * Drop the cached snapshot for `slug`. Invoked by callers that know the
   * truth has changed (e.g., on successful submit — though Phase 4 does not
   * currently wire this; the 60s freshness window handles AC-then-open flows).
   * Does not cancel in-flight fetches — if a prefetch is mid-flight, its
   * eventual resolution still populates the cache (with a post-invalidate
   * timestamp). Callers that truly need a clean slate can call `invalidate`
   * then `prefetch`.
   */
  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  /**
   * Drop every cached snapshot. No-op on in-flight fetches. Exposed for
   * plugin-unload teardown — the caller is NOT required to invoke it because
   * the store itself is GC'd with the plugin instance.
   */
  clear(): void {
    this.cache.clear();
  }

  private async getOrFetch(slug: string): Promise<SubmissionRow[]> {
    // 1. Fresh cache hit — return immediately, no network.
    //
    // Phase 20 Plan 20-10 (gap-closure T9) — empty results use the short
    // EMPTY_TTL_MS (5 s); non-empty results keep the existing freshnessMs
    // (60 s default). Closes the 60-second blackout window after a
    // transient empty fetch (D-02 prefetch race / throttle blip / auth
    // not yet wired) without amplifying per-note-open prefetch into a
    // fetch storm against LC's 20 req / 10 s throttle.
    const cached = this.cache.get(slug);
    if (cached) {
      const ttl = cached.isEmpty ? EMPTY_TTL_MS : this.freshnessMs;
      if (this.now() - cached.fetchedAt < ttl) {
        return cached.rows;
      }
    }

    // 2. In-flight for same slug — share the promise.
    const inflight = this.inflight.get(slug);
    if (inflight) return inflight;

    // 3. Fire a new fetch.
    const promise = (async () => {
      try {
        const rows = await this.fetchHistory(slug);
        this.cache.set(slug, {
          fetchedAt: this.now(),
          rows,
          isEmpty: rows.length === 0,
        });
        return rows;
      } finally {
        this.inflight.delete(slug);
      }
    })();
    this.inflight.set(slug, promise);
    return promise;
  }
}
