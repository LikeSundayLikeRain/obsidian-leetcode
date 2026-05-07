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
import { requestUrl } from 'obsidian';
// eslint-disable-next-line import/no-extraneous-dependencies -- @fetch-impl/fetcher is a transitive module-singleton exposed by @leetnotion/leetcode-api; we intentionally mutate its .fetch
import { fetcher } from '@fetch-impl/fetcher';
import { Throttle } from './throttle';
import { RateLimitError } from '../shared/errors';

let activeThrottle: Throttle | null = null;

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string | ArrayBuffer } | undefined;

export function installRequestUrlFetcher(): void {
  // Idempotent AND hot-reload-safe: if already installed, drop the old throttle
  // (which may be mid-queue from a previous plugin-load cycle) and install a fresh one.
  const throttle = new Throttle({ capacity: 20, refillMs: 10_000, maxConcurrent: 2 });
  activeThrottle = throttle;

  (fetcher as unknown as { fetch: (input: unknown, init?: FetchInit) => Promise<Response> }).fetch = async (input, init) => {
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
