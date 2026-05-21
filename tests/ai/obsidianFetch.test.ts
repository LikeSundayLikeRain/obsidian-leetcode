// tests/ai/obsidianFetch.test.ts
// Phase 07 Plan 02 Task 2 — obsidianFetch(mode) bridge tests.
//
// Verifies:
//   - request mode: bridges requestUrl → Fetch-API Response, status passthrough
//   - stream mode:  delegates to electron.net.fetch with credentials: 'omit'
//   - Both branches enforce credentials: 'omit' (T-07-02 cookie-leak mitigation)
//   - URL input handling for string / URL / Request

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const requestUrlMock = vi.fn();

vi.mock('obsidian', () => ({
  requestUrl: (params: unknown) => requestUrlMock(params),
  Notice: class {
    constructor(public readonly message: string, public readonly timeout?: number) {}
  },
}));

describe('Phase 07 obsidianFetch — request mode', () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
    vi.resetModules();
  });

  it('bridges requestUrl and returns a Fetch-API Response', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: '{"hello":1}',
      headers: { 'content-type': 'application/json' },
    });
    const { obsidianFetch } = await import('../../src/ai/obsidianFetch');
    const fetcher = obsidianFetch('request');
    const res = await fetcher('https://example.com/x', {
      method: 'POST',
      body: 'hi',
    });
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hello: 1 });
  });

  it("does NOT pass `credentials` field through to requestUrl (requestUrl ignores it; documents T-07-02)", async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: '{}',
      headers: {},
    });
    const { obsidianFetch } = await import('../../src/ai/obsidianFetch');
    const fetcher = obsidianFetch('request');
    await fetcher('https://example.com', { method: 'GET', credentials: 'include' });
    const callArg = (requestUrlMock.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect('credentials' in callArg).toBe(false);
  });

  it('passes through non-OK status codes without throwing', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 401,
      text: '{"error":"unauthorized"}',
      headers: { 'content-type': 'application/json' },
    });
    const { obsidianFetch } = await import('../../src/ai/obsidianFetch');
    const fetcher = obsidianFetch('request');
    const res = await fetcher('https://example.com', { method: 'GET' });
    expect(res.status).toBe(401);
    expect(res.ok).toBe(false);
  });

  it('resolves URL from string, URL, and Request input variants', async () => {
    requestUrlMock.mockResolvedValue({ status: 200, text: '{}', headers: {} });
    const { obsidianFetch } = await import('../../src/ai/obsidianFetch');
    const fetcher = obsidianFetch('request');

    await fetcher('https://example.com/string', { method: 'GET' });
    await fetcher(new URL('https://example.com/url'), { method: 'GET' });
    await fetcher(new Request('https://example.com/request'), { method: 'GET' });

    const calls = requestUrlMock.mock.calls.map((c) => (c[0] as { url: string }).url);
    expect(calls).toContain('https://example.com/string');
    expect(calls).toContain('https://example.com/url');
    expect(calls).toContain('https://example.com/request');
  });
});

describe('Phase 07 obsidianFetch — stream mode (T-07-02)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delegates to electron.net.fetch and FORCES credentials: omit even when caller passes include', async () => {
    type NetFetch = (input: string | Request, init?: RequestInit) => Promise<Response>;
    const netFetchMock = vi.fn<NetFetch>(async () => new Response('streamed'));
    // Stub the renderer-side require shim that obsidianFetch uses to access
    // electron — `activeWindow.require('electron')` is the canonical pattern
    // from src/auth/BrowserWindowLogin.ts (the one file that touches electron).
    const fakeRequire = vi.fn((id: string) => {
      if (id === 'electron') return { net: { fetch: netFetchMock } };
      throw new Error(`unexpected require: ${id}`);
    });
    vi.stubGlobal('activeWindow', { require: fakeRequire });

    const { obsidianFetch } = await import('../../src/ai/obsidianFetch');
    const fetcher = obsidianFetch('stream');
    const res = await fetcher('https://example.com', {
      method: 'GET',
      credentials: 'include', // caller tries to send cookies
    });
    expect(res).toBeInstanceOf(Response);
    expect(netFetchMock).toHaveBeenCalledTimes(1);
    const callArgs = netFetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(callArgs[1].credentials).toBe('omit');
  });

  it("sets credentials: 'omit' when caller passes no init", async () => {
    type NetFetch = (input: string | Request, init?: RequestInit) => Promise<Response>;
    const netFetchMock = vi.fn<NetFetch>(async () => new Response('streamed'));
    const fakeRequire = vi.fn(() => ({ net: { fetch: netFetchMock } }));
    vi.stubGlobal('activeWindow', { require: fakeRequire });

    const { obsidianFetch } = await import('../../src/ai/obsidianFetch');
    await obsidianFetch('stream')('https://example.com');
    const callArgs = netFetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(callArgs[1].credentials).toBe('omit');
  });
});
