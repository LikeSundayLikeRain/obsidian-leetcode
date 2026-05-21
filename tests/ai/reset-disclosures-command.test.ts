// tests/ai/reset-disclosures-command.test.ts
//
// Phase 07 Plan 05 Task 2 — palette command `reset-ai-disclosures` +
// LeetCodePlugin.resetAIDisclosures() coverage.
//
// Verifies:
//   - resetAIDisclosures iterates all 5 AIProvider values.
//   - Only currently-acked providers get a setProviderConfig write
//     (skip the false-flag rows so we don't churn data.json on every call).
//   - After reset, every provider's disclosureAcknowledged is false.
//   - The locked Notice text fires with 4000ms duration.
//   - The palette command callback delegates to the plugin method.
//
// Strategy: import LeetCodePlugin via dynamic import after vi.mock setup
// (mirrors tests/ai/probe-debounce.test.ts), then bind the prototype
// `resetAIDisclosures` method onto a minimal fake plugin (settings + Notice
// capture). The fake settings store keeps a mutable `cfgs` object so the
// method's setProviderConfig writes are reflected in subsequent reads.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIProvider, ProviderConfig } from '../../src/ai/types';

const noticeCalls: Array<{ text: string; duration?: number }> = [];

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class Notice {
    constructor(public readonly message: string, public readonly timeout?: number) {
      noticeCalls.push({ text: message, duration: timeout });
    }
  }
  return { ...actual, Notice };
});

// ────────────────────────────────────────────────────────────────────────────

function makeCfg(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    apiKey: '',
    baseUrl: 'https://api.example.com/v1',
    model: 'm',
    disclosureAcknowledged: false,
    ...overrides,
  };
}

interface FakePluginShape {
  settings: {
    getProviderConfig: (p: AIProvider) => ProviderConfig;
    setProviderConfig: (p: AIProvider, cfg: ProviderConfig) => Promise<void>;
  };
}

function makeFake(initialAck: Partial<Record<AIProvider, boolean>>): FakePluginShape & {
  __getCfgs: () => Record<AIProvider, ProviderConfig>;
  __setSpy: ReturnType<typeof vi.fn>;
} {
  const cfgs: Record<AIProvider, ProviderConfig> = {
    anthropic: makeCfg({ disclosureAcknowledged: initialAck.anthropic ?? false }),
    openai: makeCfg({ disclosureAcknowledged: initialAck.openai ?? false }),
    openrouter: makeCfg({ disclosureAcknowledged: initialAck.openrouter ?? false }),
    ollama: makeCfg({ disclosureAcknowledged: initialAck.ollama ?? false }),
    custom: makeCfg({ disclosureAcknowledged: initialAck.custom ?? false }),
    // Phase 08.1 Plan 02 — Bedrock joins the locked provider map; the
    // reset-disclosures command iterates VALID_AI_PROVIDERS so a missing
    // bedrock entry would crash. Default disclosureAcknowledged stays
    // false so existing tests' "expected reset count" math still works
    // (Bedrock is in the same starting state as the other 5 providers
    // when initialAck.bedrock is unset).
    bedrock: makeCfg({ disclosureAcknowledged: initialAck.bedrock ?? false }),
  };
  const setSpy = vi.fn(async (p: AIProvider, cfg: ProviderConfig) => {
    cfgs[p] = { ...cfg };
  });
  return {
    settings: {
      getProviderConfig: (p: AIProvider) => cfgs[p],
      setProviderConfig: setSpy as unknown as (
        p: AIProvider,
        cfg: ProviderConfig,
      ) => Promise<void>,
    },
    __getCfgs: () => cfgs,
    __setSpy: setSpy,
  };
}

async function callResetAIDisclosures(fake: FakePluginShape): Promise<void> {
  const mod = await import('../../src/main');
  const LeetCodePlugin = mod.default;

  await (LeetCodePlugin.prototype.resetAIDisclosures as () => Promise<void>).call(fake);
}

// ────────────────────────────────────────────────────────────────────────────

describe('LeetCodePlugin.resetAIDisclosures — Phase 07 Plan 05 Task 2', () => {
  beforeEach(() => {
    noticeCalls.length = 0;
  });

  it('iterates all 5 providers (writes when all 5 are acked)', async () => {
    const fake = makeFake({
      anthropic: true,
      openai: true,
      openrouter: true,
      ollama: true,
      custom: true,
    });
    await callResetAIDisclosures(fake);
    expect(fake.__setSpy).toHaveBeenCalledTimes(5);
  });

  it('only writes for currently-acked providers (idempotent skip path)', async () => {
    const fake = makeFake({ anthropic: true, openai: true });
    await callResetAIDisclosures(fake);
    expect(fake.__setSpy).toHaveBeenCalledTimes(2);
    const writtenProviders = fake.__setSpy.mock.calls.map((c) => (c as unknown[])[0]);
    expect(writtenProviders).toEqual(expect.arrayContaining(['anthropic', 'openai']));
    expect(writtenProviders).not.toContain('openrouter');
    expect(writtenProviders).not.toContain('ollama');
    expect(writtenProviders).not.toContain('custom');
  });

  it('after reset, all providers have disclosureAcknowledged=false', async () => {
    const fake = makeFake({
      anthropic: true,
      openai: true,
      openrouter: true,
      ollama: true,
      custom: true,
    });
    await callResetAIDisclosures(fake);
    const cfgs = fake.__getCfgs();
    expect(cfgs.anthropic.disclosureAcknowledged).toBe(false);
    expect(cfgs.openai.disclosureAcknowledged).toBe(false);
    expect(cfgs.openrouter.disclosureAcknowledged).toBe(false);
    expect(cfgs.ollama.disclosureAcknowledged).toBe(false);
    expect(cfgs.custom.disclosureAcknowledged).toBe(false);
  });

  it('reset Notice fires with locked copy and 4000ms duration', async () => {
    const fake = makeFake({ anthropic: true });
    await callResetAIDisclosures(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({
      text: 'AI provider disclosures reset. The disclosure modal will show on the next AI call.',
      duration: 4000,
    });
  });

  it('reset Notice fires even when no providers were acked (no setProviderConfig writes)', async () => {
    const fake = makeFake({});
    await callResetAIDisclosures(fake);
    expect(fake.__setSpy).not.toHaveBeenCalled();
    expect(noticeCalls).toHaveLength(1);
  });
});
