// tests/ai/clearKey.test.ts
//
// Phase 07 Plan 06 Task 1 — palette command `clear-ai-key` +
// LeetCodePlugin.clearActiveAIKey() coverage (AIPROV-06).
//
// Verifies:
//   - When activeAIProvider is null: empty-state Notice fires; no
//     setProviderConfig write.
//   - When activeAIProvider is set: setProviderConfig is called EXACTLY ONCE
//     for the active provider with apiKey wiped to '' and every other field
//     PRESERVED (baseUrl, model, disclosureAcknowledged).
//   - Success Notice text uses prettyName() of the active provider with
//     duration 3000ms (07-UI-SPEC §"Notice copy" — locked verbatim).
//   - Custom provider's success Notice uses 'Custom (OpenAI-compatible)'.
//   - Other providers' configs are NOT mutated (active-only scope —
//     T-07-06-other-keys mitigation).
//   - disclosureAcknowledged is NOT cleared (separate semantic from
//     reset-ai-disclosures; T-07-06-disclosure mitigation).
//
// Strategy mirrors tests/ai/reset-disclosures-command.test.ts: vi.mock
// 'obsidian' with a Notice-capturing class, then bind the prototype
// `clearActiveAIKey` method onto a minimal fake plugin (settings + Notice
// capture). The fake settings store keeps a mutable `cfgs` object so the
// method's setProviderConfig writes are reflected in subsequent reads.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
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
  lcSettings: {
    getActiveAIProvider: () => AIProvider | null;
    getProviderConfig: (p: AIProvider) => ProviderConfig;
    setProviderConfig: (p: AIProvider, cfg: ProviderConfig) => Promise<void>;
  };
}

function makeFake(opts: {
  active: AIProvider | null;
  cfgs?: Partial<Record<AIProvider, ProviderConfig>>;
}): FakePluginShape & {
  __getCfgs: () => Record<AIProvider, ProviderConfig>;
  __setSpy: ReturnType<typeof vi.fn>;
} {
  const cfgs: Record<AIProvider, ProviderConfig> = {
    anthropic: opts.cfgs?.anthropic ?? makeCfg(),
    openai: opts.cfgs?.openai ?? makeCfg(),
    openrouter: opts.cfgs?.openrouter ?? makeCfg(),
    ollama: opts.cfgs?.ollama ?? makeCfg(),
    custom: opts.cfgs?.custom ?? makeCfg(),
    // Phase 08.1 Plan 02 — Bedrock joins the locked provider map. The
    // BedrockProviderConfig superset is structurally compatible with
    // ProviderConfig (the inherited 4 fields are all present); the
    // Bedrock-only fields are additive.
    bedrock: opts.cfgs?.bedrock ?? makeCfg(),
  };
  const setSpy = vi.fn(async (p: AIProvider, cfg: ProviderConfig) => {
    cfgs[p] = { ...cfg };
  });
  return {
    lcSettings: {
      getActiveAIProvider: () => opts.active,
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

async function callClearActiveAIKey(fake: FakePluginShape): Promise<void> {
  const mod = await import('../../src/main');
  const LeetCodePlugin = mod.default;
  // Bind the prototype method onto the fake — `this` resolves to the fake.
  // Wrap in an explicit function expression to satisfy
  // @typescript-eslint/unbound-method (matches probe-debounce.test.ts).

  const method = function (this: unknown): Promise<void> {
    return (LeetCodePlugin.prototype.clearActiveAIKey as () => Promise<void>).call(this);
  };
  await method.call(fake);
}

// ────────────────────────────────────────────────────────────────────────────

describe('LeetCodePlugin.clearActiveAIKey — Phase 07 Plan 06 Task 1', () => {
  beforeEach(() => {
    noticeCalls.length = 0;
  });

  it('no active provider emits Notice and does NOT mutate settings', async () => {
    const fake = makeFake({ active: null });
    await callClearActiveAIKey(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({
      text: 'No active AI provider — nothing to clear.',
      duration: 3000,
    });
    expect(fake.__setSpy).not.toHaveBeenCalled();
  });

  it('clears active provider apiKey via setProviderConfig (every other field preserved)', async () => {
    const fake = makeFake({
      active: 'anthropic',
      cfgs: {
        anthropic: {
          apiKey: 'sk-ant-real',
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'claude-haiku-4-5',
          disclosureAcknowledged: true,
        },
      },
    });
    await callClearActiveAIKey(fake);
    expect(fake.__setSpy).toHaveBeenCalledTimes(1);
    expect(fake.__setSpy).toHaveBeenCalledWith('anthropic', {
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-haiku-4-5',
      disclosureAcknowledged: true,
    });
  });

  it('success Notice contains prettyName of active provider (Anthropic) at 3000ms', async () => {
    const fake = makeFake({
      active: 'anthropic',
      cfgs: { anthropic: makeCfg({ apiKey: 'sk-ant-real' }) },
    });
    await callClearActiveAIKey(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({
      text: 'Cleared AI key for Anthropic',
      duration: 3000,
    });
  });

  it('success Notice for OpenAI uses prettyName "OpenAI"', async () => {
    const fake = makeFake({
      active: 'openai',
      cfgs: { openai: makeCfg({ apiKey: 'sk-test' }) },
    });
    await callClearActiveAIKey(fake);
    expect(noticeCalls[0]?.text).toBe('Cleared AI key for OpenAI');
  });

  it('success Notice for Custom uses prettyName "Custom (OpenAI-compatible)"', async () => {
    const fake = makeFake({
      active: 'custom',
      cfgs: { custom: makeCfg({ apiKey: 'sk-custom' }) },
    });
    await callClearActiveAIKey(fake);
    expect(noticeCalls[0]?.text).toBe('Cleared AI key for Custom (OpenAI-compatible)');
  });

  it('does NOT clear other providers when active is anthropic', async () => {
    const fake = makeFake({
      active: 'anthropic',
      cfgs: {
        anthropic: makeCfg({ apiKey: 'sk-ant-active' }),
        openai: makeCfg({ apiKey: 'sk-openai-keep' }),
        openrouter: makeCfg({ apiKey: 'sk-or-keep' }),
        ollama: makeCfg({ apiKey: 'ollama-key-keep' }),
        custom: makeCfg({ apiKey: 'sk-custom-keep' }),
      },
    });
    await callClearActiveAIKey(fake);
    expect(fake.__setSpy).toHaveBeenCalledTimes(1);
    const writtenProviders = fake.__setSpy.mock.calls.map((c) => (c as unknown[])[0]);
    expect(writtenProviders).toEqual(['anthropic']);
    // Other providers' apiKeys remain intact in the fake's cfgs map.
    const cfgs = fake.__getCfgs();
    expect(cfgs.openai.apiKey).toBe('sk-openai-keep');
    expect(cfgs.openrouter.apiKey).toBe('sk-or-keep');
    expect(cfgs.ollama.apiKey).toBe('ollama-key-keep');
    expect(cfgs.custom.apiKey).toBe('sk-custom-keep');
  });

  it('does NOT clear disclosureAcknowledged (preserved as true)', async () => {
    const fake = makeFake({
      active: 'openrouter',
      cfgs: {
        openrouter: {
          apiKey: 'sk-or-real',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'anthropic/claude-haiku-4.5',
          disclosureAcknowledged: true,
        },
      },
    });
    await callClearActiveAIKey(fake);
    const cfgs = fake.__getCfgs();
    expect(cfgs.openrouter.apiKey).toBe('');
    expect(cfgs.openrouter.disclosureAcknowledged).toBe(true);
    expect(cfgs.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(cfgs.openrouter.model).toBe('anthropic/claude-haiku-4.5');
  });

  it('palette command callback delegates to clearActiveAIKey()', () => {
    // Verify the addCommand callback wiring by reading the source — the
    // command id 'clear-ai-key' is registered in onload() and its callback
    // must invoke `this.clearActiveAIKey()`. We assert the source contains
    // the wiring rather than spawning a full plugin onload (which would
    // require Obsidian's full Plugin lifecycle harness).
    const mainSrc = readFileSync(path.resolve(__dirname, '../../src/main.ts'), 'utf8');
    // Cluster: id, name, callback delegation must all be present.
    expect(mainSrc).toContain("id: 'clear-ai-key'");
    expect(mainSrc).toContain("name: 'Clear AI key'");
    // Callback must call clearActiveAIKey() on `this`.
    expect(mainSrc).toMatch(/callback:\s*\(\)\s*=>\s*\{\s*void\s+this\.clearActiveAIKey\(\);?\s*\}/);
  });
});
