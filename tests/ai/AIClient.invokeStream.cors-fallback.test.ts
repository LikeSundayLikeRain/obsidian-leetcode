// tests/ai/AIClient.invokeStream.cors-fallback.test.ts
//
// Phase 08.1 Plan 01 Task 2 — TIER 1 → TIER 2 → TIER 3 fall-through covers:
//   - "TIER 1 throws -> TIER 2 used"
//   - "TIER 1+2 throw -> TIER 3 buffered"
//
// Mirrors the mock harness from tests/ai/AIClient.invokeStream.test.ts
// lines 14-65.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('Phase 08.1 AIClient.invokeStream — CORS fallback decision tree', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('TIER 1 throws -> TIER 2 used (obsidianFetch("stream") streams)', async () => {
    // Stub window.fetch so the TIER 1 composition itself doesn't fail on
    // missing globals; the simulated CORS rejection is driven by
    // resolveAdapter throwing on the FIRST call (TIER 1) only.
    vi.stubGlobal('window', { ...window, fetch: vi.fn(async () => new Response('')) });

    const tier2StreamResult = { textStream: (async function* () {})() };
    const tier2StreamInvoke = vi.fn(() => tier2StreamResult);

    let callCount = 0;
    resolveAdapterMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Simulate CORS TypeError surfacing synchronously inside TIER 1's
        // resolveAdapter -> streamInvoke composition.
        throw new TypeError('CORS rejection');
      }
      return {
        probe: vi.fn(),
        streamInvoke: tier2StreamInvoke,
        bufferedInvoke: vi.fn(async () => ({ text: 'unused' })),
      };
    });
    // TIER 2 obsidianFetch('stream') succeeds.
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));

    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi', stream: true } as never);
    expect(handle.kind).toBe('stream');
    if (handle.kind === 'stream') {
      expect(handle.result).toBe(tier2StreamResult);
    }
    // resolveAdapter was called twice — TIER 1 (threw) + TIER 2 (won).
    expect(resolveAdapterMock).toHaveBeenCalledTimes(2);
    expect(obsidianFetchMock).toHaveBeenCalledWith('stream');
  });

  it('TIER 1+2 throw -> TIER 3 buffered (obsidianFetch("request"))', async () => {
    vi.stubGlobal('window', { ...window, fetch: vi.fn(async () => new Response('')) });

    let callCount = 0;
    const tier3BufferedInvoke = vi.fn(async () => ({ text: 'tier-3-buffered' }));
    resolveAdapterMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // TIER 1 throws (simulate native-fetch CORS reject).
        throw new TypeError('CORS rejection');
      }
      // TIER 3 path returns the buffered adapter (TIER 2 throws BEFORE
      // resolveAdapter is reached for it — see obsidianFetchMock below).
      return {
        probe: vi.fn(),
        streamInvoke: vi.fn(() => ({ textStream: (async function* () {})() })),
        bufferedInvoke: tier3BufferedInvoke,
      };
    });

    // TIER 2 obsidianFetch('stream') throws (eager-probe simulating
    // electron.net.fetch unavailable on contextIsolation:true). TIER 3
    // obsidianFetch('request') succeeds.
    obsidianFetchMock.mockImplementation((mode: string) => {
      if (mode === 'stream') throw new Error('loadElectronNet: contextIsolation');
      return () => Promise.resolve(new Response(''));
    });

    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi', stream: true } as never);
    expect(handle.kind).toBe('buffered');
    if (handle.kind === 'buffered') {
      expect(handle.abortController).toBeInstanceOf(AbortController);
      expect(await handle.text).toBe('tier-3-buffered');
    }
    // resolveAdapter calls: TIER 1 (threw) + TIER 3 (buffered) = 2.
    expect(resolveAdapterMock).toHaveBeenCalledTimes(2);
    // obsidianFetch was tried for 'stream' (threw) and 'request' (succeeded).
    expect(obsidianFetchMock).toHaveBeenCalledWith('stream');
    expect(obsidianFetchMock).toHaveBeenCalledWith('request');
  });
});
