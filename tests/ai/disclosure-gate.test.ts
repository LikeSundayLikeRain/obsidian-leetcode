// tests/ai/disclosure-gate.test.ts
//
// Phase 07 Plan 05 Task 2 — AIClient.probe + AIClient.invoke disclosure-gate
// regression. Verifies that BOTH probe() and invoke() consult the
// `disclosureAcknowledged` flag BEFORE issuing any HTTP, route through the
// injected `requireDisclosure` helper when the flag is false, persist
// `disclosureAcknowledged: true` on Continue, and short-circuit with the
// locked 'AI call cancelled' string on Cancel.
//
// Mocks:
//   - 'obsidian' — Notice capture (irrelevant to AIClient internals but
//     happy-dom resolution still needs it for transitive imports).
//   - '../../src/ai/providers' — resolveAdapter returns a fake adapter with
//     spy probe() / invoke() so we can assert "called" / "not called".
//
// The fake SettingsStore exposes the four methods AIClient touches:
//   - getActiveAIProvider() / getProviderConfig(provider)
//   - setProviderConfig(provider, cfg) — Promise-returning spy used to assert
//     the persist call body.
//   - addCostLedger(usd) — included for parity with aiClient.test.ts though
//     this file does not exercise addCost.
//
// Critical invariants asserted:
//   - probe() with ack=true skips requireDisclosure entirely.
//   - probe() with ack=false + Cancel returns
//     `{ ok: false, errorMessage: 'AI call cancelled' }` (preserves the
//     ProbeResult contract Plan 07-04's testActiveAIConnection consumes).
//   - probe() with ack=false + Continue persists ack=true via
//     setProviderConfig and re-reads cfg before handing to resolveAdapter.
//   - invoke() with ack=false + Cancel throws Error('AI call cancelled')
//     (re-throw posture so Phase 08 callers can branch).
//   - invoke() without active provider throws BEFORE consulting disclosure.
//   - Switching provider re-fires the gate on the new provider (per-provider
//     state, AIPROV-04 invariant).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIProvider, ProbeResult, ProviderConfig } from '../../src/ai/types';

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

// ────────────────────────────────────────────────────────────────────────────
//   Test helpers
// ────────────────────────────────────────────────────────────────────────────

function makeCfg(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.com/v1',
    model: 'm',
    disclosureAcknowledged: false,
    ...overrides,
  };
}

interface MockSettings {
  getActiveAIProvider: () => AIProvider | null;
  getProviderConfig: (p: AIProvider) => ProviderConfig;
  setProviderConfig: (p: AIProvider, cfg: ProviderConfig) => Promise<void>;
  addCostLedger: (usd: number) => Promise<void>;
}

function makeMockSettings(opts: {
  active?: AIProvider | null;
  cfgsByProvider?: Partial<Record<AIProvider, ProviderConfig>>;
} = {}): MockSettings & {
  __getMutableCfgs: () => Record<AIProvider, ProviderConfig>;
  __setProviderConfigSpy: ReturnType<typeof vi.fn>;
} {
  const cfgs: Record<AIProvider, ProviderConfig> = {
    anthropic: makeCfg(),
    openai: makeCfg(),
    openrouter: makeCfg(),
    ollama: makeCfg({ baseUrl: 'http://localhost:11434/v1' }),
    custom: makeCfg({ baseUrl: '' }),
  };
  if (opts.cfgsByProvider) {
    for (const [p, cfg] of Object.entries(opts.cfgsByProvider)) {
      if (cfg) cfgs[p as AIProvider] = cfg;
    }
  }
  const setSpy = vi.fn(async (p: AIProvider, cfg: ProviderConfig) => {
    cfgs[p] = { ...cfg };
  });
  return {
    getActiveAIProvider: () => (opts.active === undefined ? 'openai' : opts.active),
    getProviderConfig: vi.fn((p: AIProvider) => cfgs[p]) as unknown as (
      p: AIProvider,
    ) => ProviderConfig,
    setProviderConfig: setSpy as unknown as (
      p: AIProvider,
      cfg: ProviderConfig,
    ) => Promise<void>,
    addCostLedger: vi.fn(async () => {}),
    __getMutableCfgs: () => cfgs,
    __setProviderConfigSpy: setSpy,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   probe() tests
// ────────────────────────────────────────────────────────────────────────────

describe('Phase 07 Plan 05 — AIClient.probe disclosure gate', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
  });

  it('probe with disclosureAcknowledged=true skips modal and proceeds directly', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 3 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: { anthropic: makeCfg({ disclosureAcknowledged: true }) },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);
    const result = await client.probe('anthropic');
    expect(requireDisclosure).not.toHaveBeenCalled();
    expect(probeMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, modelCount: 3 });
  });

  it('probe with disclosureAcknowledged=false opens modal (calls requireDisclosure)', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 3 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: { anthropic: makeCfg({ disclosureAcknowledged: false }) },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);
    await client.probe('anthropic');
    expect(requireDisclosure).toHaveBeenCalledTimes(1);
    const callArgs = requireDisclosure.mock.calls[0] as unknown as [
      AIProvider,
      ProviderConfig,
    ];
    expect(callArgs[0]).toBe('anthropic');
    expect(callArgs[1].disclosureAcknowledged).toBe(false);
  });

  it('probe with Cancel returns ok=false errorMessage="AI call cancelled"', async () => {
    const probeMock = vi.fn(async () => ({ ok: true }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: { anthropic: makeCfg({ disclosureAcknowledged: false }) },
    });
    const requireDisclosure = vi.fn(async () => false);
    const client = new AIClient(settings as never, requireDisclosure);
    const result = await client.probe('anthropic');
    expect(result).toEqual({ ok: false, errorMessage: 'AI call cancelled' });
    // Adapter probe MUST NOT run on cancel.
    expect(probeMock).not.toHaveBeenCalled();
  });

  it('probe with Continue persists disclosureAcknowledged=true via setProviderConfig', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 5 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: { anthropic: makeCfg({ disclosureAcknowledged: false, apiKey: 'sk-x' }) },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);
    await client.probe('anthropic');
    expect(settings.__setProviderConfigSpy).toHaveBeenCalledTimes(1);
    const callArgs = settings.__setProviderConfigSpy.mock.calls[0] as unknown as [
      AIProvider,
      ProviderConfig,
    ];
    expect(callArgs[0]).toBe('anthropic');
    expect(callArgs[1].disclosureAcknowledged).toBe(true);
    expect(callArgs[1].apiKey).toBe('sk-x'); // other fields preserved
  });

  it('probe re-reads cfg after persist (so adapter sees the persisted state)', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 5 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: { anthropic: makeCfg({ disclosureAcknowledged: false }) },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);
    await client.probe('anthropic');
    // Pre-gate read + post-persist re-read = 2 calls minimum.
    const getMock = settings.getProviderConfig as unknown as ReturnType<typeof vi.fn>;
    expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('default no-op requireDisclosure preserves Plan 07-02 backward compat (probe runs)', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 5 }));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: { anthropic: makeCfg({ disclosureAcknowledged: false }) },
    });
    // No second arg — uses the default `async () => true` no-op helper.
    const client = new AIClient(settings as never);
    const result = await client.probe('anthropic');
    expect(result.ok).toBe(true);
    expect(probeMock).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
//   invoke() tests
// ────────────────────────────────────────────────────────────────────────────

describe('Phase 07 Plan 05 — AIClient.invoke disclosure gate', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
  });

  it('invoke with disclosureAcknowledged=false + Cancel throws "AI call cancelled"', async () => {
    const invokeMock = vi.fn(async () => ({}));
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: invokeMock,
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      active: 'openai',
      cfgsByProvider: { openai: makeCfg({ disclosureAcknowledged: false }) },
    });
    const requireDisclosure = vi.fn(async () => false);
    const client = new AIClient(settings as never, requireDisclosure);
    await expect(client.invoke({} as never)).rejects.toThrow('AI call cancelled');
    // Adapter invoke MUST NOT run on cancel.
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invoke with disclosureAcknowledged=false + Continue persists then proceeds', async () => {
    const invokeMock = vi.fn(async () => ({ shape: 'ok' }));
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: invokeMock,
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      active: 'openai',
      cfgsByProvider: { openai: makeCfg({ disclosureAcknowledged: false }) },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);
    await client.invoke({} as never);
    expect(settings.__setProviderConfigSpy).toHaveBeenCalledTimes(1);
    const callArgs = settings.__setProviderConfigSpy.mock.calls[0] as unknown as [
      AIProvider,
      ProviderConfig,
    ];
    expect(callArgs[1].disclosureAcknowledged).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('invoke without active provider throws BEFORE checking disclosure', async () => {
    const invokeMock = vi.fn(async () => ({}));
    resolveAdapterMock.mockReturnValue({
      probe: vi.fn(),
      streamInvoke: vi.fn(),
      bufferedInvoke: invokeMock,
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({ active: null });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);
    await expect(client.invoke({} as never)).rejects.toThrow(/No AI provider configured/);
    expect(requireDisclosure).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
//   Per-provider state (AIPROV-04 invariant)
// ────────────────────────────────────────────────────────────────────────────

describe('Phase 07 Plan 05 — switching provider re-fires gate on next call', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
  });

  it('anthropic acked + openai not-acked: probe(anthropic) skips modal, probe(openai) opens modal', async () => {
    const probeMock = vi.fn(async () => ({ ok: true, modelCount: 1 } as ProbeResult));
    resolveAdapterMock.mockReturnValue({
      probe: probeMock,
      streamInvoke: vi.fn(),
      bufferedInvoke: vi.fn(async () => ({ text: '' })),
    });
    const { AIClient } = await import('../../src/ai/AIClient');
    const settings = makeMockSettings({
      cfgsByProvider: {
        anthropic: makeCfg({ disclosureAcknowledged: true }),
        openai: makeCfg({ disclosureAcknowledged: false }),
      },
    });
    const requireDisclosure = vi.fn(async () => true);
    const client = new AIClient(settings as never, requireDisclosure);

    // First call — anthropic is acked, gate is bypassed.
    await client.probe('anthropic');
    expect(requireDisclosure).toHaveBeenCalledTimes(0);

    // Second call — openai is NOT acked, gate fires.
    await client.probe('openai');
    expect(requireDisclosure).toHaveBeenCalledTimes(1);
    const callArgs = requireDisclosure.mock.calls[0] as unknown as [AIProvider, ProviderConfig];
    expect(callArgs[0]).toBe('openai');
  });
});
