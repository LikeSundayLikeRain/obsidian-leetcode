// tests/ai/aiClient.test.ts
// Phase 07 Plan 02 Task 2 — AIClient facade tests.
//
// Verifies:
//   - probe(provider) routes through resolveAdapter with request-mode fetcher
//   - probe never throws (mirrors LeetCodeClient.fetchUsername never-throw posture)
//   - invoke throws when activeAIProvider is null
//   - addCost delegates to settings.addCostLedger

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveAdapterMock = vi.fn();

vi.mock('../../src/ai/providers', () => ({
  resolveAdapter: (...args: unknown[]) => resolveAdapterMock(...args),
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
  addCostLedger: (usd: number) => Promise<void>;
}

function makeMockSettings(overrides: Partial<MockSettings> = {}): MockSettings {
  return {
    getActiveAIProvider: () => 'openai',
    getProviderConfig: () => ({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      disclosureAcknowledged: true,
    }),
    addCostLedger: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('Phase 07 AIClient — probe', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
  });

  it('probe(provider) routes through resolveAdapter with a request-mode fetcher', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 5 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      invoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings();
    const client = new AIClient(settings as never);
    const result = await client.probe('openai' as never);

    expect(resolveAdapterMock).toHaveBeenCalledTimes(1);
    const callArgs = resolveAdapterMock.mock.calls[0] as unknown as [string, Record<string, unknown>, unknown];
    const [provider, cfg, fetcher] = callArgs;
    expect(provider).toBe('openai');
    expect(cfg).toEqual({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
      disclosureAcknowledged: true,
    });
    expect(typeof fetcher).toBe('function');
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, modelCount: 5 });
  });

  it('probe never throws even when adapter throws — returns ok=false with errorMessage', async () => {
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(async () => {
        throw new Error('boom-network-down');
      }),
      invoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings();
    const client = new AIClient(settings as never);
    const result = await client.probe('anthropic' as never);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/boom-network-down/);
  });
});

describe('Phase 07 AIClient — invoke', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
  });

  it('invoke throws when activeAIProvider is null', async () => {
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      invoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ getActiveAIProvider: () => null });
    const client = new AIClient(settings as never);
    await expect(client.invoke({} as never)).rejects.toThrow(/No AI provider configured/);
  });

  // Plan 07-07 Task 3 — WR-01 fix. AIClient.invoke must `await` the
  // adapter.invoke() promise so adapter rejections propagate as a
  // rejected promise with the original error message preserved. The v1
  // code returned the unawaited promise — the JSDoc contract documented
  // re-throw semantics, but a future maintainer wrapping the body in
  // try/catch would be silently betrayed because the rejection bubbles
  // out of the async function without ever entering the catch.
  it('invoke awaits adapter.invoke so adapter rejections propagate as rejected promise with original message preserved', async () => {
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      invoke: vi.fn(async () => {
        throw new Error('adapter-boom');
      }),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings();
    const client = new AIClient(settings as never);
    await expect(client.invoke({} as never)).rejects.toThrow(/adapter-boom/);
  });
});

describe('Phase 07 AIClient — addCost', () => {
  it('delegates to settings.addCostLedger', async () => {
    const ledgerSpy = vi.fn(async () => {});
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ addCostLedger: ledgerSpy });
    const client = new AIClient(settings as never);
    await client.addCost(0.5);
    expect(ledgerSpy).toHaveBeenCalledTimes(1);
    expect(ledgerSpy).toHaveBeenCalledWith(0.5);
  });
});
