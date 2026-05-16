// tests/ai/AIClient.invokeStream.test.ts
//
// Phase 08 Plan 02 Task 2 — AIClient.invokeStream covers:
//   - "throws 'No AI provider configured' when active provider is null"
//   - "fires disclosure gate when disclosureAcknowledged === false; persists ack"
//   - "throws 'AI call cancelled' verbatim when disclosure returns false"
//   - "stream path returns { kind: 'stream', result, abortController }"
//   - "fallback path returns { kind: 'buffered', text, abortController } when stream throws"
//   - "fallback path returns buffered when req.stream is undefined / false"
//   - "external req.signal cascades to internal abortController on abort"
//   - "abortController.abort() invocation does NOT throw"

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveAdapterMock = vi.fn();

vi.mock('../../src/ai/providers', () => ({
  resolveAdapter: (...args: unknown[]) => resolveAdapterMock(...args),
}));

// obsidianFetch — we want to control whether 'stream' or 'request' modes
// throw, so mock the export and let each test set the return value or throw.
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

describe('Phase 08 AIClient.invokeStream — provider/null check', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
  });

  it('throws "No AI provider configured" when active provider is null', async () => {
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: null });
    const client = new AIClient(settings as never);
    await expect(
      client.invokeStream({ prompt: 'hi', stream: true } as never),
    ).rejects.toThrow(/No AI provider configured/);
  });
});

describe('Phase 08 AIClient.invokeStream — disclosure gate', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
  });

  it('fires disclosure gate when disclosureAcknowledged === false; persists ack on Continue', async () => {
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));
    const streamInvokeMock = vi.fn(() => ({
      textStream: (async function* () {})(),
    }));
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: streamInvokeMock,
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      active: 'anthropic',
      startingCfg: { ...DEFAULT_CFG, disclosureAcknowledged: false },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure as never);

    await client.invokeStream({ prompt: 'hi', stream: true } as never);
    expect(requireDisclosure).toHaveBeenCalledTimes(1);
    expect(settings.setProviderConfig).toHaveBeenCalledTimes(1);
    expect(settings.setProviderConfig).toHaveBeenCalledWith('anthropic', {
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      disclosureAcknowledged: true,
    });
  });

  it('throws "AI call cancelled" verbatim when disclosure returns false', async () => {
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      active: 'anthropic',
      startingCfg: { ...DEFAULT_CFG, disclosureAcknowledged: false },
    });
    const requireDisclosure = vi.fn(async () => false);
    const client = new AIClient(settings as never, requireDisclosure as never);

    await expect(
      client.invokeStream({ prompt: 'hi', stream: true } as never),
    ).rejects.toThrow('AI call cancelled');
    expect(settings.setProviderConfig).not.toHaveBeenCalled();
  });
});

describe('Phase 08 AIClient.invokeStream — stream/fallback paths', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
  });

  it('stream path returns { kind: "stream", result, abortController } when stream is available', async () => {
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));
    const streamResult = { textStream: (async function* () {})() };
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(() => streamResult),
      bufferedInvoke: vi.fn(),
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
  });

  it('fallback path returns { kind: "buffered", text, abortController } when obsidianFetch("stream") throws', async () => {
    obsidianFetchMock.mockImplementation((mode: string) => {
      if (mode === 'stream') {
        throw new Error('loadElectronNet failed');
      }
      return () => Promise.resolve(new Response(''));
    });
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: 'fallback-text' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi', stream: true } as never);
    expect(handle.kind).toBe('buffered');
    if (handle.kind === 'buffered') {
      expect(handle.abortController).toBeInstanceOf(AbortController);
      const text = await handle.text;
      expect(text).toBe('fallback-text');
    }
  });

  it('fallback path returns buffered when req.stream is undefined', async () => {
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: 'no-stream-text' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi' } as never);
    expect(handle.kind).toBe('buffered');
    if (handle.kind === 'buffered') {
      expect(await handle.text).toBe('no-stream-text');
    }
  });

  it('fallback path returns buffered when req.stream is false', async () => {
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: 'explicit-false' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi', stream: false } as never);
    expect(handle.kind).toBe('buffered');
  });
});

describe('Phase 08 AIClient.invokeStream — AbortController cascade', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
  });

  it('external req.signal cascades to internal abortController on abort', async () => {
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));
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

  it('abortController.abort() invocation does NOT throw', async () => {
    obsidianFetchMock.mockReturnValue(() => Promise.resolve(new Response('')));
    const streamResult = { textStream: (async function* () {})() };
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(() => streamResult),
      bufferedInvoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: 'openai' });
    const client = new AIClient(settings as never);

    const handle = await client.invokeStream({ prompt: 'hi', stream: true } as never);
    if (handle.kind !== 'stream') throw new Error('expected stream');
    expect(() => handle.abortController.abort()).not.toThrow();
  });
});
