// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-02 D-18 — 429 rate-limited single auto-retry after
// RATE_LIMIT_RETRY_MS = 5000ms cooldown.
// Turns green when Plan 03 ships the retry wrapper in src/api/throttle.ts
// (or src/api/requestUrlFetcher.ts — planner's discretion).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Module-level mock of `obsidian` (mirrors tests/solve/throttled-request-url.test.ts).
const requestUrlMock = vi.fn();
vi.mock('obsidian', () => ({
  requestUrl: (params: unknown) => requestUrlMock(params),
  Notice: class {
    constructor(public readonly message: unknown, public readonly timeout?: number) {}
    hide() {
      /* no-op */
    }
  },
}));

describe('Phase 5 throttle — 429 auto-retry (D-18)', () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('first 429 triggers a single retry after RATE_LIMIT_RETRY_MS=5000ms; total calls = 2', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    installRequestUrlFetcher();
    // 1st response: 429; 2nd response: 200. Retry layer must wait 5s then
    // redrive the call and resolve with the 200.
    requestUrlMock
      .mockResolvedValueOnce({
        status: 429,
        text: '',
        json: null,
        headers: { 'retry-after': '5' },
      })
      .mockResolvedValueOnce({
        status: 200,
        text: '{"ok":true}',
        json: { ok: true },
        headers: { 'content-type': 'application/json' },
      });

    // Attach the rejection handler IMMEDIATELY so the stub's current (no
    // retry) behavior's rejection doesn't surface as an unhandled rejection.
    // Once Plan 03 ships the retry, the promise resolves and this path
    // becomes a regular `await`.
    const pending = throttledRequestUrl({
      url: 'https://leetcode.com/graphql',
      method: 'POST',
    } as never).then(
      (v) => ({ ok: true as const, value: v }),
      (e: unknown) => ({ ok: false as const, error: e as Error }),
    );

    // Advance past the 5s cooldown — the retry layer should issue the 2nd
    // requestUrl call and the promise should resolve.
    await vi.advanceTimersByTimeAsync(5000);

    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe(200);
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  it('second 429 after auto-retry re-throws RateLimitError (no further retries)', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    const { RateLimitError } = await import('../../src/shared/errors');
    installRequestUrlFetcher();
    // Two successive 429s — the retry layer ships ONE retry; second failure
    // propagates as RateLimitError.
    requestUrlMock.mockResolvedValue({
      status: 429,
      text: '',
      json: null,
      headers: { 'retry-after': '5' },
    });

    const pending = throttledRequestUrl({
      url: 'https://leetcode.com/graphql',
      method: 'POST',
    } as never).then(
      (v) => ({ ok: true as const, value: v }),
      (e: unknown) => ({ ok: false as const, error: e as Error }),
    );

    await vi.advanceTimersByTimeAsync(5000);

    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RateLimitError);
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });
});
