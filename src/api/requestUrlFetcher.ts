// src/api/requestUrlFetcher.ts
// Replaces @leetnotion/leetcode-api's module-level `fetcher.fetch` (from @fetch-impl/fetcher)
// with an Obsidian `requestUrl`-backed implementation that also enforces D-12 throttling.
// MUST be called before any `new Credential()` / `new LeetCode()` (RESEARCH.md Pitfall 1).
//
// W4: Throttle is instantiated INSIDE installRequestUrlFetcher so hot-reload / plugin
// disable-enable cycles do not leak waiters or timers across plugin-load boundaries.
// A module-scoped `activeThrottle` reference is kept ONLY to let Plan 06's footer
// indicator subscribe via `getActiveThrottle()`; the reference is replaced on each install.
//
// D-14: On HTTP 429 from LC we throw RateLimitError(retryAfterMs). The retry-after header
// is honored here at the fetcher level (seconds -> ms, default 10_000ms if missing). The
// one-shot Notice ("LeetCode rate-limited - slowing down.") is emitted by Plan 06 where
// it catches this error; Plan 02's job is just the throw + parsing. Full 429-handling
// polish (backoff ladder, multiple-Notice suppression) lives in POLISH-02.
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
// eslint-disable-next-line import/no-extraneous-dependencies -- @fetch-impl/fetcher is a transitive module-singleton that we ALSO patch for completeness, though the primary patch target is @leetnotion/leetcode-api's re-exported `fetcher`
import { fetcher as externalFetcher } from '@fetch-impl/fetcher';
// The library bundles its OWN `fetcher = new Fetcher()` at module scope and
// re-exports it. This is the instance `_fetch` / `fetch_default` / every
// `fetch_default(...)` call inside the library actually routes through. We
// MUST mutate THIS instance — the external @fetch-impl/fetcher singleton is
// a different object post-bundling.
import { fetcher as leetcodeFetcher } from '@leetnotion/leetcode-api';
import { Throttle } from './throttle';
import { RateLimitError, TimeoutError } from '../shared/errors';

// Phase 5 Wave 2 (D-18) — 429 single-retry cooldown. Locked to 5_000ms so the
// user perceives "slight hiccup" rather than a hang; orchestrator-level retry
// is forbidden (Pitfall 8 / T-05-03-02) — this is the single retry ceiling.
const RATE_LIMIT_RETRY_MS = 5_000;

// Phase 5 Wave 2 (D-20) — default 10s Promise.race timeout for every
// non-polling requestUrl call. Corrected per RESEARCH §Pitfall 3 —
// RequestUrlParam.timeout does not exist, so we implement the cap ourselves.
// Callers on the polling path override with opts.timeoutMs: 20_000 (Pitfall 13
// carve-out — the outer 30s wall-clock cap governs the whole poll sequence).
const DEFAULT_TIMEOUT_MS = 10_000;

let activeThrottle: Throttle | null = null;

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer } | undefined;

export function installRequestUrlFetcher(): void {
  // Idempotent AND hot-reload-safe: if already installed, drop the old throttle
  // (which may be mid-queue from a previous plugin-load cycle) and install a fresh one.
  const throttle = new Throttle({ capacity: 20, refillMs: 10_000, maxConcurrent: 2 });
  activeThrottle = throttle;

  const shim = async (input: unknown, init?: FetchInit): Promise<Response> => {
    await throttle.acquire();
    try {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      const res = await requestUrl({
        url,
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
        throw: false, // IMPORTANT: let the library see 4xx/5xx for GraphQL error parsing.
      });

      // D-14: HTTP 429 -> throw RateLimitError with retry-after (seconds -> ms; default 10s).
      // Plan 06 catches this and surfaces the locked Notice ('LeetCode rate-limited - slowing down.').
      if (res.status === 429) {
        const retryAfter = res.headers['retry-after'] ?? res.headers['Retry-After'];
        const retryMs = retryAfter
          ? (Number.isFinite(+retryAfter) ? +retryAfter * 1000 : 10_000)
          : 10_000;
        throw new RateLimitError(retryMs);
      }

      return new Response(res.text, {
        status: res.status,
        statusText: '',
        headers: res.headers as HeadersInit,
      });
    } finally {
      throttle.release();
    }
  };

  // Primary patch target: the library's internal `fetcher` instance.
  // @leetnotion/leetcode-api bundles `fetcher = new Fetcher()` at module scope
  // and routes every `fetch_default(...)` call through `leetcodeFetcher.fetch`.
  // We overwrite its .fetch with our shim so the library's CSRF bootstrap,
  // GraphQL queries, and submission calls all go through requestUrl + throttle.
  (leetcodeFetcher as unknown as { fetch: typeof shim }).fetch = shim;

  // Defence in depth: also patch the external @fetch-impl/fetcher singleton
  // so any third-party code that somehow resolves the shared singleton path
  // (e.g., during tests or future library updates) gets the same shim.
  (externalFetcher as unknown as { fetch: typeof shim }).fetch = shim;
}

/**
 * Returns the Throttle instance the most recent `installRequestUrlFetcher()` call created.
 * Returns null if not yet installed. Consumed by Plan 06 for the D-13 footer indicator.
 *
 * Note: callers should subscribe via `onQueueChange()` and store the unsubscribe handle
 * so they can unsubscribe on `onClose()` / `onunload()` to prevent leaks across hot-reload.
 */
export function getActiveThrottle(): Throttle | null {
  return activeThrottle;
}

/**
 * Phase 3 — direct requestUrl access routed through the same throttle bucket
 * Phase 1 uses for GraphQL. REST callers (src/solve/leetcodeRest.ts in Plan 04)
 * use this instead of the fetch-compatible `shim` so they get raw `res.json` /
 * `res.status` / `res.headers` with no fetch `Response` wrapper in the way.
 *
 * Semantics:
 *   - Reuses the same module-scoped `activeThrottle` (D-25 — single 20 req/10 s
 *     bucket + max-2 concurrent limit across GraphQL and REST).
 *   - Passes `throw: false` so the caller sees every status code (REST verdict
 *     flow needs 4xx for session-expiry disambiguation, CF-04).
 *   - Parses `Retry-After` (seconds) into ms and throws `RateLimitError` on 429;
 *     Plan 06's one-shot Notice is wired the same way as the GraphQL path.
 *   - Releases the throttle on every exit path (success, 429, thrown network
 *     error) — no leaked token on exception.
 *
 * Phase 5 Wave 2 (POLISH-02) additions:
 *   - D-18: on the FIRST 429 we wait RATE_LIMIT_RETRY_MS (5s) and redrive the
 *     raw request ONCE. A second 429 re-throws RateLimitError (no third
 *     attempt — Pitfall 8 forbids orchestrator-level retry composition).
 *   - D-20: the whole (acquire → raw request → 429-retry) chain races against
 *     a Promise.race timeout. Default 10s; callers may override via
 *     opts.timeoutMs (polling carve-out passes 20_000 so the outer 30s
 *     wall-clock cap governs the full poll sequence — Pitfall 13).
 *
 * Throws:
 *   - Error('throttledRequestUrl: fetcher not installed') if the throttle has
 *     not been wired yet (plugin startup race — Plan 05 guards this).
 *   - RateLimitError on 429 responses that survived the single retry.
 *   - TimeoutError when the request exceeds opts.timeoutMs (default 10_000ms).
 */
export async function throttledRequestUrl(
  params: RequestUrlParam & { timeoutMs?: number },
  opts: { timeoutMs?: number } = {},
): Promise<RequestUrlResponse> {
  const throttle = activeThrottle;
  if (!throttle) {
    throw new Error('throttledRequestUrl: fetcher not installed');
  }
  // Accept timeoutMs from either the opts arg (plan-canonical) or inline on
  // params (Wave 0 RED test convenience). The opts arg wins when both are set.
  const { timeoutMs: inlineTimeoutMs, ...cleanParams } = params;
  const timeoutMs = opts.timeoutMs ?? inlineTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  return raceWithTimeout(runWith429Retry(throttle, cleanParams as RequestUrlParam), timeoutMs);
}

// --- Internal helpers (Phase 5 Wave 2) --------------------------------------

/** Delay without blocking the event loop. Routes through `activeWindow` so the
 *  same path works in popouts and in vitest's happy-dom env (vi.useFakeTimers
 *  patches the active window's timer functions). */
function delay(ms: number): Promise<void> {
  return new Promise((r) => { window.setTimeout(r, ms); });
}

/** Race a promise against a TimeoutError. Clears the pending timer in `finally`
 *  so the event loop doesn't stay alive after the race settles. */
function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => { reject(new TimeoutError()); }, ms);
  });
  return Promise.race<T>([p, timeout]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

/** Core throttle-acquire + raw requestUrl + 429 parse. Throws RateLimitError
 *  on 429; all other status codes pass through as a normal RequestUrlResponse. */
async function doRawRequest(
  throttle: Throttle,
  params: RequestUrlParam,
): Promise<RequestUrlResponse> {
  await throttle.acquire();
  try {
    const res = await requestUrl({ ...params, throw: false });
    if (res.status === 429) {
      const retryAfter = res.headers['retry-after'] ?? res.headers['Retry-After'];
      const retryMs = retryAfter
        ? (Number.isFinite(+retryAfter) ? +retryAfter * 1000 : 10_000)
        : 10_000;
      throw new RateLimitError(retryMs);
    }
    return res;
  } finally {
    throttle.release();
  }
}

/** D-18 — single-retry wrapper around `doRawRequest`. On RateLimitError, wait
 *  RATE_LIMIT_RETRY_MS and retry ONCE. The second failure re-throws (no third
 *  attempt). Any non-RateLimitError propagates immediately. */
async function runWith429Retry(
  throttle: Throttle,
  params: RequestUrlParam,
): Promise<RequestUrlResponse> {
  try {
    return await doRawRequest(throttle, params);
  } catch (err) {
    if (err instanceof RateLimitError) {
      await delay(RATE_LIMIT_RETRY_MS);
      // Second failure: propagate the second RateLimitError (no third attempt).
      return await doRawRequest(throttle, params);
    }
    throw err;
  }
}
