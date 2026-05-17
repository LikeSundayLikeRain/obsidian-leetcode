// tests/ai/AIClient.invokeStream.fetch-primary.test.ts
//
// Phase 08.1 Plan 01 Task 2 — TIER 1 native-fetch primary tier covers:
//   - "TIER 1 native fetch wins when fetch is available; obsidianFetch('stream') never consulted"
//   - "TIER 1 fetcher passes credentials: 'omit' (T-07-02 cookie-leak parity)"
//
// Mirrors the mock harness from tests/ai/AIClient.invokeStream.test.ts
// lines 14-65. Uses vi.stubGlobal('window', {fetch: ...}) to control the
// native-fetch surface inside AIClient.invokeStream.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FetchFn } from '../../src/ai/obsidianFetch';

const resolveAdapterMock = vi.fn();

vi.mock('../../src/ai/providers', () => ({
  resolveAdapter: (...args: unknown[]) => resolveAdapterMock(...args),
}));

const obsidianFetchMock = vi.fn();
vi.mock('../../src/ai/obsidianFetch', () => ({
  obsidianFetch: (...args: unknown[]) => obsidianFetchMock(...args),
}));

vi.mock('obsidian', () => ({
  requestUrl: vi.fn(),
  Notice: class {
    constructor(public readonly message: string, public readonly timeout?: number) {}
  },
}));

interface MockSettings {
  getActiveAIProvider: () => string | null;
  getProviderConfig: (p: string) => Record<string, unknown>;
  setProviderConfig: (p: string, cfg: Record<string, unknown>) => Promise<void>;
  addCostLedger: (usd: number) => Promise<void>;
}

const DEFAULT_CFG: Record<string, unknown> = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5-mini',
  disclosureAcknowledged: true,
};

function makeMockSettings(opts: {
  startingCfg?: Record<string, unknown>;
  active?: string | null;
  overrides?: Partial<MockSettings>;
} = {}): MockSettings {
  const cfgs = new Map<string, Record<string, unknown>>();
  const setProviderConfigDefault = vi.fn(async (provider: string, next: Record<string, unknown>) => {
    cfgs.set(provider, next);
  });
  const base: MockSettings = {
    getActiveAIProvider: () => (opts.active === undefined ? 'openai' : opts.active),
    getProviderConfig: (p: string) => cfgs.get(p) ?? (opts.startingCfg ?? DEFAULT_CFG),
    setProviderConfig: setProviderConfigDefault,
    addCostLedger: vi.fn(async () => {}),
  };
  return { ...base, ...(opts.overrides ?? {}) };
}

describe('Phase 08.1 AIClient.invokeStream — TIER 1 native fetch primary', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('TIER 1 native fetch wins when fetch is available; obsidianFetch("stream") never consulted', async () => {
    // Stub window.fetch so AIClient's TIER 1 fetcher composition succeeds.
    const nativeFetchMock = vi.fn(async () => new Response('streamed'));
    vi.stubGlobal('window', { ...window, fetch: nativeFetchMock });

    const streamResult = { textStream: (async function* () {})() };
    const streamInvokeMock = vi.fn(() => streamResult);
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: streamInvokeMock,
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });

    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi', stream: true } as never);
    expect(handle.kind).toBe('stream');
    if (handle.kind === 'stream') {
      expect(handle.result).toBe(streamResult);
      expect(handle.abortController).toBeInstanceOf(AbortController);
    }

    // TIER 2 must NEVER have been consulted on the success path.
    expect(obsidianFetchMock).not.toHaveBeenCalledWith('stream');
    // resolveAdapter was called exactly once (TIER 1) — TIER 2 / TIER 3 never reached.
    expect(resolveAdapterMock).toHaveBeenCalledTimes(1);
    // streamInvoke fired with the abort signal threaded through the new tier.
    expect(streamInvokeMock).toHaveBeenCalledTimes(1);
    const [prompt, signal] = streamInvokeMock.mock.calls[0] as unknown as [string, AbortSignal];
    expect(prompt).toBe('hi');
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('TIER 1 fetcher composes credentials: "omit" (T-07-02 cookie-leak parity)', async () => {
    // Capture the FetchFn passed into resolveAdapter so we can call it and
    // observe the init that's forwarded to window.fetch.
    const nativeFetchMock = vi.fn(async () => new Response('streamed'));
    vi.stubGlobal('window', { ...window, fetch: nativeFetchMock });

    let capturedFetcher: FetchFn | null = null;
    resolveAdapterMock.mockImplementation((_p, _c, fetcher) => {
      capturedFetcher = fetcher as FetchFn;
      return {
        probe: vi.fn(),
        streamInvoke: vi.fn(() => ({ textStream: (async function* () {})() })),
        bufferedInvoke: vi.fn(async () => ({ text: '' })),
      };
    });

    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);
    await client.invokeStream({ prompt: 'hi', stream: true } as never);

    expect(capturedFetcher).not.toBeNull();
    // Drive the captured fetcher with a caller-supplied credentials:'include'
    // and verify the AIClient layer overrides it to 'omit' (security boundary
    // contract — mirrors src/ai/obsidianFetch.ts:97-98).
    const callerInit: RequestInit = { method: 'POST', credentials: 'include' };
    await capturedFetcher!('https://api.example.com/v1/chat', callerInit);

    expect(nativeFetchMock).toHaveBeenCalledTimes(1);
    const [, forwardedInit] = nativeFetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(forwardedInit.credentials).toBe('omit');
    // Method etc still propagate.
    expect(forwardedInit.method).toBe('POST');
  });
});
