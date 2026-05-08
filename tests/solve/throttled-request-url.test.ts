// Phase 3 Plan 03 Task 2 — RED test for throttledRequestUrl.
// Verifies: (a) throws if fetcher not installed, (b) throws RateLimitError on 429,
// (c) returns raw RequestUrlResponse (has .json / .headers / .status), (d) reuses
// the Phase 1 throttle (acquire + release are called once per call).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 'obsidian' before importing the module under test so requestUrl is
// intercepted consistently with the existing fetcher-install.test.ts pattern.
const requestUrlMock = vi.fn();
vi.mock('obsidian', () => ({
  requestUrl: (params: unknown) => requestUrlMock(params),
}));

describe('Phase 3 throttledRequestUrl (D-25, D-28)', () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('throws "fetcher not installed" when called before installRequestUrlFetcher', async () => {
    const { throttledRequestUrl } = await import('../../src/api/requestUrlFetcher');
    await expect(
      throttledRequestUrl({ url: 'https://leetcode.com/submit/', method: 'POST' } as never),
    ).rejects.toThrowError(/fetcher not installed/);
  });

  it('returns raw RequestUrlResponse (json/status/headers) when installed', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    installRequestUrlFetcher();
    const fakeResp = {
      status: 200,
      text: '{"interpret_id":"abc"}',
      json: { interpret_id: 'abc' },
      headers: { 'content-type': 'application/json' },
    };
    requestUrlMock.mockResolvedValue(fakeResp);
    const res = await throttledRequestUrl({
      url: 'https://leetcode.com/problems/two-sum/interpret_solution/',
      method: 'POST',
      body: '{}',
    } as never);
    expect(res).toBe(fakeResp);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ interpret_id: 'abc' });
  });

  it('throws RateLimitError with retry-after seconds on 429', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    const { RateLimitError } = await import('../../src/shared/errors');
    installRequestUrlFetcher();
    requestUrlMock.mockResolvedValue({
      status: 429,
      text: '',
      json: null,
      headers: { 'retry-after': '7' },
    });
    await expect(
      throttledRequestUrl({ url: 'https://leetcode.com/submit/', method: 'POST' } as never),
    ).rejects.toBeInstanceOf(RateLimitError);
    try {
      await throttledRequestUrl({ url: 'https://leetcode.com/submit/', method: 'POST' } as never);
    } catch (err) {
      if (err instanceof RateLimitError) {
        expect(err.retryAfterMs).toBe(7000);
      }
    }
  });

  it('falls back to 10_000 ms if retry-after missing', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    const { RateLimitError } = await import('../../src/shared/errors');
    installRequestUrlFetcher();
    requestUrlMock.mockResolvedValue({
      status: 429,
      text: '',
      json: null,
      headers: {},
    });
    await expect(
      throttledRequestUrl({ url: 'https://leetcode.com/submit/', method: 'POST' } as never),
    ).rejects.toMatchObject({ retryAfterMs: 10_000 });
  });

  it('passes throw:false to requestUrl (caller sees all status codes)', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl } = await import(
      '../../src/api/requestUrlFetcher'
    );
    installRequestUrlFetcher();
    requestUrlMock.mockResolvedValue({ status: 500, text: 'oops', json: null, headers: {} });
    const res = await throttledRequestUrl({
      url: 'https://leetcode.com/submit/',
      method: 'POST',
    } as never);
    expect(res.status).toBe(500); // 500 comes through, not thrown
    const callArg = requestUrlMock.mock.calls[0]?.[0] as { throw?: boolean } | undefined;
    expect(callArg?.throw).toBe(false);
  });

  it('releases the throttle even when the underlying requestUrl rejects', async () => {
    const { installRequestUrlFetcher, throttledRequestUrl, getActiveThrottle } = await import(
      '../../src/api/requestUrlFetcher'
    );
    installRequestUrlFetcher();
    requestUrlMock.mockRejectedValue(new Error('network'));
    await expect(
      throttledRequestUrl({ url: 'https://leetcode.com/submit/', method: 'POST' } as never),
    ).rejects.toThrowError(/network/);
    // After release, a follow-up call should not be blocked.
    const throttle = getActiveThrottle();
    expect(throttle?.getQueueDepth()).toBe(0);
  });
});
