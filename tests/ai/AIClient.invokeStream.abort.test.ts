// tests/ai/AIClient.invokeStream.abort.test.ts
//
// Phase 08.1 Plan 01 Task 2 — AbortController propagation across the new
// TIER 1 native-fetch tier covers:
//   - "An already-aborted req.signal cascades to the abortController BEFORE
//      resolveAdapter is invoked for TIER 1"
//   - "An external req.signal aborting AFTER invokeStream returns kind:stream
//      cascades into the internal abortController across the new tier"
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

describe('Phase 08.1 AIClient.invokeStream — AbortController propagation through TIER 1', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('already-aborted req.signal cascades to abortController BEFORE TIER 1 streamInvoke', async () => {
    vi.stubGlobal('window', { ...window, fetch: vi.fn(async () => new Response('')) });

    // Capture the signal that resolveAdapter -> streamInvoke sees on the TIER
    // 1 path so we can assert it was already aborted at call time.
    let observedSignalAtCall: AbortSignal | null = null;
    const streamResult = { textStream: (async function* () {})() };
    resolveAdapterMock.mockImplementation(() => ({
      probe: vi.fn(),
      streamInvoke: vi.fn((_p: string, signal: AbortSignal) => {
        observedSignalAtCall = signal;
        return streamResult;
      }),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    }));

    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const externalCtrl = new AbortController();
    externalCtrl.abort();
    const handle = await client.invokeStream({
      prompt: 'hi',
      stream: true,
      signal: externalCtrl.signal,
    } as never);
    expect(handle.kind).toBe('stream');
    if (handle.kind === 'stream') {
      expect(handle.abortController.signal.aborted).toBe(true);
    }
    expect(observedSignalAtCall).not.toBeNull();
    expect(observedSignalAtCall!.aborted).toBe(true);
  });

  it('external req.signal aborting AFTER kind:stream returns cascades through TIER 1 into the internal abortController', async () => {
    vi.stubGlobal('window', { ...window, fetch: vi.fn(async () => new Response('')) });

    const streamResult = { textStream: (async function* () {})() };
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(() => streamResult),
      bufferedInvoke: vi.fn(),
    });

    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const externalCtrl = new AbortController();
    const handle = await client.invokeStream({
      prompt: 'hi',
      stream: true,
      signal: externalCtrl.signal,
    } as never);
    if (handle.kind !== 'stream') throw new Error('expected stream handle');

    expect(handle.abortController.signal.aborted).toBe(false);
    externalCtrl.abort();
    // Cascade is event-driven; give the listener a microtask tick.
    await new Promise((r) => window.setTimeout(r, 0));
    expect(handle.abortController.signal.aborted).toBe(true);
  });
});
