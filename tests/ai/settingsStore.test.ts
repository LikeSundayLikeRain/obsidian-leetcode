// tests/ai/settingsStore.test.ts
// Phase 07 Plan 01 Task 2 — SettingsStore AI fields, shape-guards, getters /
// setters, day-rollover ledger.
//
// Mirrors the established `tests/settings-store.test.ts` mock-plugin pattern
// (loadData/saveData spies). Each malformed-input → default-fallback case is
// its own `it()` block (no consolidation) per CONTEXT decision T-07-01.

import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => {
      state.data = d;
    }),
  };
}

const ANTHROPIC_DEFAULT_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5';

describe('Phase 07 SettingsStore — activeAIProvider load (T-07-01)', () => {
  it('load: missing activeAIProvider falls back to null', async () => {
    const plugin = makeMockPlugin({});
    const s = await SettingsStore.load(plugin as never);
    expect(s.getActiveAIProvider()).toBeNull();
  });

  it('load: invalid activeAIProvider string falls back to null', async () => {
    const plugin = makeMockPlugin({ activeAIProvider: 'gemini' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getActiveAIProvider()).toBeNull();
  });
});

describe('Phase 07 SettingsStore — providerConfigs hydration (T-07-01)', () => {
  it('load: missing providerConfigs hydrates with all 5 defaults', async () => {
    const plugin = makeMockPlugin({});
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProviderConfig('anthropic').baseUrl).toBe(ANTHROPIC_DEFAULT_BASE);
    expect(s.getProviderConfig('openai').baseUrl).toBe('https://api.openai.com/v1');
    expect(s.getProviderConfig('openrouter').baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(s.getProviderConfig('ollama').baseUrl).toBe('http://localhost:11434/v1');
    expect(s.getProviderConfig('custom').baseUrl).toBe('');
    // Models too — locked schema covers all four required fields per provider.
    expect(s.getProviderConfig('anthropic').model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(s.getProviderConfig('openrouter').model).toBe('anthropic/claude-haiku-4.5');
  });

  it('load: malformed providerConfigs.anthropic.apiKey (number) collapses to empty string', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        anthropic: {
          apiKey: 42,
          baseUrl: 'https://x',
          model: 'm',
          disclosureAcknowledged: true,
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProviderConfig('anthropic').apiKey).toBe('');
  });

  it('load: non-https baseUrl falls back to provider default', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        anthropic: {
          apiKey: 'k',
          baseUrl: 'ftp://evil',
          model: 'm',
          disclosureAcknowledged: true,
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProviderConfig('anthropic').baseUrl).toBe(ANTHROPIC_DEFAULT_BASE);
  });

  it('load: http://localhost is accepted (Ollama)', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        ollama: {
          apiKey: '',
          baseUrl: 'http://localhost:11434/v1',
          model: 'm',
          disclosureAcknowledged: false,
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProviderConfig('ollama').baseUrl).toBe('http://localhost:11434/v1');
  });

  it('load: disclosureAcknowledged accepts only literal true', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        anthropic: {
          apiKey: 'k',
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'm',
          disclosureAcknowledged: 'yes',
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProviderConfig('anthropic').disclosureAcknowledged).toBe(false);
  });
});

describe('Phase 07 SettingsStore — aiCostLedger shape-guard (T-07-01, D-F)', () => {
  it('load: malformed aiCostLedger.date falls back to today (and resets usdToday)', async () => {
    const plugin = makeMockPlugin({
      aiCostLedger: { date: 'yesterday', usdToday: 5 },
    });
    const s = await SettingsStore.load(plugin as never);
    const today = new Date().toISOString().slice(0, 10);
    const led = s.getAICostLedger();
    expect(led.date).toBe(today);
    expect(led.usdToday).toBe(0);
  });

  it('load: negative usdToday falls back to 0', async () => {
    const plugin = makeMockPlugin({
      aiCostLedger: { date: '2026-05-15', usdToday: -1 },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAICostLedger().usdToday).toBe(0);
  });
});

describe('Phase 07 SettingsStore — addCostLedger day-rollover-on-read (D-F)', () => {
  it('addCostLedger same day accumulates', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const plugin = makeMockPlugin({
      aiCostLedger: { date: today, usdToday: 1.0 },
    });
    const s = await SettingsStore.load(plugin as never);
    await s.addCostLedger(0.5);
    expect(s.getAICostLedger().usdToday).toBeCloseTo(1.5, 6);
  });

  it('addCostLedger different day rolls over before adding', async () => {
    const plugin = makeMockPlugin({
      aiCostLedger: { date: '2020-01-01', usdToday: 999 },
    });
    const s = await SettingsStore.load(plugin as never);
    await s.addCostLedger(0.1);
    const led = s.getAICostLedger();
    const today = new Date().toISOString().slice(0, 10);
    expect(led.date).toBe(today);
    expect(led.usdToday).toBeCloseTo(0.1, 6);
  });

  it('addCostLedger non-finite usd is silently ignored', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const plugin = makeMockPlugin({
      aiCostLedger: { date: today, usdToday: 2.5 },
    });
    const s = await SettingsStore.load(plugin as never);
    await s.addCostLedger(NaN);
    expect(s.getAICostLedger().usdToday).toBeCloseTo(2.5, 6);
    await s.addCostLedger(-1);
    expect(s.getAICostLedger().usdToday).toBeCloseTo(2.5, 6);
  });
});

describe('Phase 07 SettingsStore — provider switch preserves prior keys (AIPROV-01)', () => {
  it('switching activeAIProvider preserves prior provider apiKey', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    // Set anthropic key explicitly.
    await s.setProviderConfig('anthropic', {
      apiKey: 'sk-ant',
      baseUrl: ANTHROPIC_DEFAULT_BASE,
      model: ANTHROPIC_DEFAULT_MODEL,
      disclosureAcknowledged: true,
    });
    await s.setActiveAIProvider('openai');
    await s.setActiveAIProvider('anthropic');
    expect(s.getProviderConfig('anthropic').apiKey).toBe('sk-ant');
    // disclosureAcknowledged also preserved (T-07-01 invariant).
    expect(s.getProviderConfig('anthropic').disclosureAcknowledged).toBe(true);
  });
});
