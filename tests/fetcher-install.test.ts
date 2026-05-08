import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitError } from '../src/shared/errors';

// Mock obsidian.requestUrl — individual tests override with mockImplementation.
// Typed as a generic record so later mocks can swap headers / body shape freely.
interface MockRequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
  arrayBuffer: ArrayBuffer;
}
const mockRequestUrl = vi.fn<(arg: unknown) => Promise<MockRequestUrlResponse>>(async () => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  text: '{"data":{"hello":"world"}}',
  json: { data: { hello: 'world' } },
  arrayBuffer: new ArrayBuffer(0),
}));
vi.mock('obsidian', () => ({ requestUrl: mockRequestUrl }));

// Shared mutable fetcher singleton (simulates both @fetch-impl/fetcher and
// @leetnotion/leetcode-api's re-exported `fetcher`). The real leetcode-api
// bundles its own `new Fetcher()` instance and re-exports it; the production
// fetcher installer mutates both the external singleton and the library's
// re-exported instance. In tests we point both mocks at the SAME object so
// a single `fetcherMock.fetch` assertion confirms both patches landed.
const fetcherMock: { fetch: (input: unknown, init?: unknown) => Promise<unknown> } = {
  fetch: vi.fn(),
};
vi.mock('@fetch-impl/fetcher', () => ({ fetcher: fetcherMock }));
vi.mock('@leetnotion/leetcode-api', () => ({ fetcher: fetcherMock }));

describe('installRequestUrlFetcher (FND-04)', () => {
  beforeEach(() => {
    mockRequestUrl.mockClear();
    // Reset to the 200 OK default between tests.
    mockRequestUrl.mockImplementation(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: '{"data":{"hello":"world"}}',
      json: { data: { hello: 'world' } },
      arrayBuffer: new ArrayBuffer(0),
    }));
  });

  it('replaces fetcher.fetch with our shim', async () => {
    const { installRequestUrlFetcher } = await import('../src/api/requestUrlFetcher');
    const before = fetcherMock.fetch;
    installRequestUrlFetcher();
    expect(fetcherMock.fetch).not.toBe(before);
  });

  it('calling replaced fetch invokes requestUrl with throw:false', async () => {
    const { installRequestUrlFetcher } = await import('../src/api/requestUrlFetcher');
    installRequestUrlFetcher();
    const res = (await fetcherMock.fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"query":"{}"}',
    })) as Response;
    expect(mockRequestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://leetcode.com/graphql',
        method: 'POST',
        throw: false,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('hello');
  });

  it('is idempotent (install twice does not throw)', async () => {
    const { installRequestUrlFetcher } = await import('../src/api/requestUrlFetcher');
    installRequestUrlFetcher();
    expect(() => installRequestUrlFetcher()).not.toThrow();
  });

  it('exposes getActiveThrottle() for Plan 06 footer wiring', async () => {
    const { installRequestUrlFetcher, getActiveThrottle } = await import('../src/api/requestUrlFetcher');
    installRequestUrlFetcher();
    const t = getActiveThrottle();
    expect(t).not.toBeNull();
    expect(t?.getQueueDepth()).toBe(0);
  });
});

describe('installRequestUrlFetcher 429 handling (D-14)', () => {
  beforeEach(() => {
    mockRequestUrl.mockClear();
  });

  it('throws RateLimitError with retryAfterMs from retry-after header (seconds)', async () => {
    mockRequestUrl.mockImplementation(async () => ({
      status: 429,
      headers: { 'retry-after': '5' },
      text: '',
      json: null,
      arrayBuffer: new ArrayBuffer(0),
    }));
    const { installRequestUrlFetcher } = await import('../src/api/requestUrlFetcher');
    installRequestUrlFetcher();
    await expect(
      fetcherMock.fetch('https://leetcode.com/graphql', { method: 'POST' })
    ).rejects.toBeInstanceOf(RateLimitError);
    await expect(
      fetcherMock.fetch('https://leetcode.com/graphql', { method: 'POST' })
    ).rejects.toMatchObject({ retryAfterMs: 5000 });
  });

  it('throws RateLimitError with default 10000ms when retry-after is missing', async () => {
    mockRequestUrl.mockImplementation(async () => ({
      status: 429,
      headers: {},
      text: '',
      json: null,
      arrayBuffer: new ArrayBuffer(0),
    }));
    const { installRequestUrlFetcher } = await import('../src/api/requestUrlFetcher');
    installRequestUrlFetcher();
    await expect(
      fetcherMock.fetch('https://leetcode.com/graphql', { method: 'POST' })
    ).rejects.toMatchObject({ retryAfterMs: 10_000 });
  });
});
