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
  setProviderConfig: (p: string, cfg: Record<string, unknown>) => Promise<void>;
  addCostLedger: (usd: number) => Promise<void>;
}

const DEFAULT_CFG: Record<string, unknown> = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5-mini',
  disclosureAcknowledged: true,
};

// Plan 07-08 Task 3 — WR-01-test-gap closure. Previously MockSettings did
// not expose setProviderConfig, so any test exercising the AIClient.probe
// disclosure-gate Continue path (ack=false then user clicks Continue) would
// crash with `setProviderConfig is not a function`. This factory now
// supports a stateful in-memory cfg map so:
//   1. The persistence call shape can be asserted via setProviderConfigSpy.
//   2. After persisting ack=true, the next getProviderConfig read sees the
//      updated value — proving the gate's "skip helper on second probe"
//      behavior end-to-end at the unit level.
function makeMockSettings(opts: {
  startingCfg?: Record<string, unknown>;
  overrides?: Partial<MockSettings>;
} = {}): MockSettings {
  const cfgs = new Map<string, Record<string, unknown>>();
  const setProviderConfigDefault = vi.fn(async (provider: string, next: Record<string, unknown>) => {
    cfgs.set(provider, next);
  });
  const base: MockSettings = {
    getActiveAIProvider: () => 'openai',
    getProviderConfig: (p: string) => cfgs.get(p) ?? (opts.startingCfg ?? DEFAULT_CFG),
    setProviderConfig: setProviderConfigDefault,
    addCostLedger: vi.fn(async () => {}),
  };
  return { ...base, ...(opts.overrides ?? {}) };
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

  // ──────────────────────────────────────────────────────────────────────
  //   Plan 07-08 Task 3 — WR-01-test-gap closure.
  //
  //   These tests close the WR-01-test-gap from 07-07-REVIEW: the
  //   disclosure-gate Continue path was previously untestable because
  //   MockSettings lacked setProviderConfig. The persistence call (and
  //   the second-probe re-read that proves persistence flowed through)
  //   is now exercised at the unit level. The cancel branch is also
  //   covered to confirm setProviderConfig is NOT called when the user
  //   declines.
  // ──────────────────────────────────────────────────────────────────────

  it('disclosure-gate Continue path persists disclosureAcknowledged:true via setProviderConfig (WR-01-test-gap)', async () => {
    const probeAdapter = vi.fn(async () => ({ ok: true, modelCount: 1 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeAdapter,
      invoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const startingCfg = { ...DEFAULT_CFG, disclosureAcknowledged: false };
    const settings = makeMockSettings({ startingCfg });
    const requireDisclosureMock = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosureMock as never);

    const result = await client.probe('anthropic' as never);

    expect(result).toEqual({ ok: true, modelCount: 1 });
    // The gate fired exactly once and granted Continue.
    expect(requireDisclosureMock).toHaveBeenCalledTimes(1);
    // setProviderConfig was called with the ack:true persistence shape.
    expect(settings.setProviderConfig).toHaveBeenCalledTimes(1);
    expect(settings.setProviderConfig).toHaveBeenCalledWith('anthropic', {
      ...startingCfg,
      disclosureAcknowledged: true,
    });
    // The adapter probe was reached (the gate did not short-circuit).
    expect(probeAdapter).toHaveBeenCalledTimes(1);
  });

  it('after Continue, a second probe call does NOT re-fire the disclosure helper (WR-01-test-gap)', async () => {
    const probeAdapter = vi.fn(async () => ({ ok: true, modelCount: 1 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeAdapter,
      invoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const startingCfg = { ...DEFAULT_CFG, disclosureAcknowledged: false };
    const settings = makeMockSettings({ startingCfg });
    const requireDisclosureMock = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosureMock as never);

    // First probe — fires the gate, persists ack:true via the stateful
    // setProviderConfig (which mutates the in-memory cfg map).
    await client.probe('anthropic' as never);
    expect(requireDisclosureMock).toHaveBeenCalledTimes(1);

    // Second probe — the stateful map now returns ack:true so the gate
    // is skipped. requireDisclosure must remain at 1 invocation.
    await client.probe('anthropic' as never);
    expect(requireDisclosureMock).toHaveBeenCalledTimes(1);
    // setProviderConfig was only called once (the second probe took the
    // ack-skipping fast path).
    expect(settings.setProviderConfig).toHaveBeenCalledTimes(1);
    // Both probes still hit the adapter.
    expect(probeAdapter).toHaveBeenCalledTimes(2);
  });

  it('disclosure-gate Cancel path returns errorMessage="AI call cancelled" and does NOT persist (WR-01-test-gap)', async () => {
    const probeAdapter = vi.fn(async () => ({ ok: true, modelCount: 1 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeAdapter,
      invoke: vi.fn(),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const startingCfg = { ...DEFAULT_CFG, disclosureAcknowledged: false };
    const settings = makeMockSettings({ startingCfg });
    const requireDisclosureMock = vi.fn(async () => false);
    const client = new AIClient(settings as never, requireDisclosureMock as never);

    const result = await client.probe('anthropic' as never);

    expect(result).toEqual({ ok: false, errorMessage: 'AI call cancelled' });
    // Gate fired and was declined.
    expect(requireDisclosureMock).toHaveBeenCalledTimes(1);
    // setProviderConfig MUST NOT be called on Cancel — persistence is
    // a Continue-only side effect.
    expect(settings.setProviderConfig).toHaveBeenCalledTimes(0);
    // The adapter probe was never reached.
    expect(probeAdapter).toHaveBeenCalledTimes(0);
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
    const settings = makeMockSettings({ overrides: { getActiveAIProvider: () => null } });
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
    const settings = makeMockSettings({ overrides: { addCostLedger: ledgerSpy } });
    const client = new AIClient(settings as never);
    await client.addCost(0.5);
    expect(ledgerSpy).toHaveBeenCalledTimes(1);
    expect(ledgerSpy).toHaveBeenCalledWith(0.5);
  });
});
