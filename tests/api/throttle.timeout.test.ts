// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-02 D-20 — 10s Promise.race timeout on every non-polling
// `requestUrl` call; opts.timeoutMs override honored.
// Turns green when Plan 03 ships the timeout race wrapper in
// src/api/throttle.ts (or src/api/requestUrlFetcher.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('Phase 5 throttle — 10s timeout (D-20)', () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('call that never resolves rejects with TimeoutError after 10_000ms', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    installRequestUrlFetcher();
    // Simulate a request that hangs forever — the timeout race must reject.
    requestUrlMock.mockImplementation(() => new Promise(() => {
      /* never resolves */
    }));

    const pending = throttledRequestUrl({
      url: 'https://leetcode.com/graphql',
      method: 'POST',
    } as never);

    // Race the real promise against a "did we see a rejection within this
    // test tick?" marker. With fake timers advanced to 10s, the production
    // impl must have rejected by now; if the field isn't set the stub
    // fails with a clear assertion instead of a vitest test-timeout.
    let rejectedErr: unknown;
    let resolved = false;
    pending.then(
      () => {
        resolved = true;
      },
      (e) => {
        rejectedErr = e;
      },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    // Flush microtasks so the .then handlers above get a chance to run.
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(rejectedErr).toBeInstanceOf(Error);
    expect((rejectedErr as Error | undefined)?.name).toBe('TimeoutError');
  });

  it('opts.timeoutMs override keeps the call alive past the default 10_000ms', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    installRequestUrlFetcher();
    // Simulate a request that takes 15s; with override=20_000 it should NOT
    // reject at 10_000.
    let resolveIt: (v: unknown) => void = () => undefined;
    requestUrlMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveIt = res as (v: unknown) => void;
        }),
    );

    const pending = throttledRequestUrl({
      url: 'https://leetcode.com/graphql',
      method: 'POST',
      timeoutMs: 20_000,
    } as never);

    // After 10s, the default timeout would have fired; assert the promise
    // is still pending (no rejection yet).
    await vi.advanceTimersByTimeAsync(10_000);
    let settled = false;
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    // Now resolve the underlying request so the test exits cleanly.
    resolveIt({
      status: 200,
      text: '{}',
      json: {},
      headers: {},
    });
    await pending;
  });
});
