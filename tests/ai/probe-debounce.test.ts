// tests/ai/probe-debounce.test.ts
//
// Phase 07 Plan 04 Task 1 — testActiveAIConnection() coverage.
//
// Drives `LeetCodePlugin.prototype.testActiveAIConnection` against a minimal
// fake instance (settings + aiClient + aiProbeInflight) so we can:
//   - capture every Notice instantiation (text + duration)
//   - replace AIClient.probe with a vi.fn() returning controlled ProbeResults
//   - verify the single-in-flight Map debounces concurrent clicks
//
// Mirrors tests/ai/aiClient.test.ts: vi.mock('obsidian') exposes a Notice
// that records every constructor call into the shared `noticeCalls` array;
// vi.mock('../../src/ai/AIClient') so importing main.ts doesn't drag in the
// full AI SDK runtime + every provider adapter (which we don't need to test
// here — the adapters have their own files).
//
// We import LeetCodePlugin via dynamic `await import(...)` AFTER `vi.mock`
// declarations so the mocks intercept the LeetCodePlugin module's deps.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIProvider, ProbeResult, ProviderConfig } from '../../src/ai/types';

// ────────────────────────────────────────────────────────────────────────────
//   Notice mock — captures every (text, duration) pair into noticeCalls.
// ────────────────────────────────────────────────────────────────────────────
const noticeCalls: Array<{ text: string; duration?: number }> = [];

// Use the project-wide obsidian-stub (covers Modal, Setting, Vault, etc.)
// + override `Notice` so we can capture every (text, duration) pair. This
// matches the pattern from tests/preview/router.test.ts so the dynamic
// `import('../../src/main')` succeeds without crashing on missing exports
// from the deep transitive graph (FilterModal -> obsidian.Modal etc.).
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class Notice {
    constructor(public readonly message: string, public readonly timeout?: number) {
      noticeCalls.push({ text: message, duration: timeout });
    }
  }
  return { ...actual, Notice };
});

// We don't actually want to construct an AIClient — testActiveAIConnection
// only calls `this.aiClient.probe(...)`. The fake plugin sets `aiClient` to
// an object with a vi.fn() probe.

// ────────────────────────────────────────────────────────────────────────────
//   Fake LeetCodePlugin instance — minimum surface testActiveAIConnection
//   reads. We import LeetCodePlugin lazily inside each test so the mocks
//   are in place before module evaluation.
// ────────────────────────────────────────────────────────────────────────────
function makeProviderConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    apiKey: '',
    baseUrl: 'https://api.example.com/v1',
    model: 'm',
    disclosureAcknowledged: true,
    ...overrides,
  };
}

interface FakePluginShape {
  settings: {
    getActiveAIProvider: () => AIProvider | null;
    getProviderConfig: (p: AIProvider) => ProviderConfig;
  };
  aiClient: {
    probe: (p: AIProvider) => Promise<ProbeResult>;
  };
  aiProbeInflight: Map<AIProvider, Promise<ProbeResult>>;
}

function makeFake(opts: {
  active: AIProvider | null;
  cfg?: ProviderConfig;
  probe?: (p: AIProvider) => Promise<ProbeResult>;
}): FakePluginShape {
  return {
    settings: {
      getActiveAIProvider: () => opts.active,
      getProviderConfig: (_p: AIProvider) => opts.cfg ?? makeProviderConfig(),
    },
    aiClient: {
      probe: opts.probe ?? (async () => ({ ok: true, modelCount: null })),
    },
    aiProbeInflight: new Map(),
  };
}

async function callTestActiveAIConnection(fake: FakePluginShape): Promise<void> {
  const mod = await import('../../src/main');
  const LeetCodePlugin = mod.default;
  // Bind the prototype method onto the fake — `this` resolves to the fake.
  await (LeetCodePlugin.prototype.testActiveAIConnection as () => Promise<void>).call(fake);
}

// ────────────────────────────────────────────────────────────────────────────
//   Tests
// ────────────────────────────────────────────────────────────────────────────
describe('LeetCodePlugin.testActiveAIConnection — Plan 07-04 Task 1', () => {
  beforeEach(() => {
    noticeCalls.length = 0;
  });

  it('emits "Pick an AI provider first." Notice (3000ms) when active provider is null', async () => {
    const fake = makeFake({ active: null });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({ text: 'Pick an AI provider first.', duration: 3000 });
  });

  it('emits empty-key Notice for Anthropic and does NOT call probe', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: null } as ProbeResult));
    const fake = makeFake({ active: 'anthropic', cfg: makeProviderConfig({ apiKey: '' }), probe });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({
      text: 'Enter an API key for Anthropic first.',
      duration: 3000,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('emits empty-key Notice for OpenAI and does NOT call probe', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 5 } as ProbeResult));
    const fake = makeFake({ active: 'openai', cfg: makeProviderConfig({ apiKey: '' }), probe });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls[0]).toEqual({
      text: 'Enter an API key for OpenAI first.',
      duration: 3000,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('emits empty-key Notice for OpenRouter and does NOT call probe', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 5 } as ProbeResult));
    const fake = makeFake({ active: 'openrouter', cfg: makeProviderConfig({ apiKey: '' }), probe });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls[0]).toEqual({
      text: 'Enter an API key for OpenRouter first.',
      duration: 3000,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('Ollama empty key does NOT block — probe runs', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 2 } as ProbeResult));
    const fake = makeFake({
      active: 'ollama',
      cfg: makeProviderConfig({ apiKey: '', baseUrl: 'http://localhost:11434/v1' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith('ollama');
  });

  it('Custom empty key does NOT block — probe runs', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 1 } as ProbeResult));
    const fake = makeFake({
      active: 'custom',
      cfg: makeProviderConfig({ apiKey: '', baseUrl: 'https://your-host/v1' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith('custom');
  });

  // ──────────────────────────────────────────────────────────────────────
  //   Plan 07-07 Task 2 — CR-02 empty-baseUrl guard
  //
  //   testActiveAIConnection must block the empty-baseUrl path for custom
  //   AND ollama with a Notice — symmetric with the existing apiKey guard
  //   for the cloud providers. Defense-in-depth: the probe-side guards
  //   (probeCustom + probeOllama) close the bug, but the main.ts guard
  //   surfaces a friendlier 'Enter a Base URL for X first.' Notice and
  //   skips the aiClient.probe call entirely (no aiProbeInflight churn).
  // ──────────────────────────────────────────────────────────────────────

  it('Custom empty baseUrl blocks with Notice and does NOT call probe (CR-02 main.ts guard)', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: null } as ProbeResult));
    const fake = makeFake({
      active: 'custom',
      cfg: makeProviderConfig({ apiKey: '', baseUrl: '' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({
      text: 'Enter a Base URL for Custom (OpenAI-compatible) first.',
      duration: 3000,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(fake.aiProbeInflight.size).toBe(0);
  });

  it('Ollama empty baseUrl blocks with Notice and does NOT call probe (CR-02 main.ts guard)', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: null } as ProbeResult));
    const fake = makeFake({
      active: 'ollama',
      cfg: makeProviderConfig({ apiKey: '', baseUrl: '' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls).toHaveLength(1);
    expect(noticeCalls[0]).toEqual({
      text: 'Enter a Base URL for Ollama first.',
      duration: 3000,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(fake.aiProbeInflight.size).toBe(0);
  });

  it('concurrent calls deduplicate via the in-flight Map (probe called once)', async () => {
    // Pre-resolve the LeetCodePlugin import so calls into the bound method
    // are fully synchronous — without this, both p1 and p2 await the same
    // dynamic import and neither has reached the probe() call site by the
    // time the test tries to resolve the probe.
    const mod = await import('../../src/main');
    const LeetCodePlugin = mod.default;
    // Wrap the prototype method so the call-site uses an explicitly-bound
    // form (eslint @typescript-eslint/unbound-method requires it).

    const method = function (this: unknown): Promise<void> {
      return (LeetCodePlugin.prototype.testActiveAIConnection as () => Promise<void>).call(this);
    };

    let resolveProbe: ((r: ProbeResult) => void) | null = null;
    const probe = vi.fn(
      () =>
        new Promise<ProbeResult>((res) => {
          resolveProbe = res;
        }),
    );
    const fake = makeFake({
      active: 'openai',
      cfg: makeProviderConfig({ apiKey: 'sk-test' }),
      probe,
    });
    // First call — synchronously enters the method, sets the in-flight Map
    // entry, and parks on the unresolved probe promise.
    const p1 = method.call(fake);
    // Second call IMMEDIATELY — hits the in-flight gate and returns before
    // calling probe again.
    const p2 = method.call(fake);
    expect(resolveProbe).not.toBeNull();
    resolveProbe!({ ok: true, modelCount: 5 });
    await Promise.all([p1, p2]);
    // Only ONE probe call — second invocation hit the in-flight gate.
    expect(probe).toHaveBeenCalledTimes(1);
    // Only ONE success Notice — the second call returned early without
    // emitting anything.
    const successNotices = noticeCalls.filter((n) => n.text.includes('OK'));
    expect(successNotices).toHaveLength(1);
  });

  it('after a probe resolves, the in-flight Map is cleared so the next call goes through', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 3 } as ProbeResult));
    const fake = makeFake({
      active: 'openai',
      cfg: makeProviderConfig({ apiKey: 'sk-test' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    await callTestActiveAIConnection(fake);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(fake.aiProbeInflight.size).toBe(0);
  });

  it('Anthropic success — modelCount=null fires the Anthropic-specific Notice (4000ms)', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: null } as ProbeResult));
    const fake = makeFake({
      active: 'anthropic',
      cfg: makeProviderConfig({ apiKey: 'sk-ant-test' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls[0]).toEqual({
      text: 'AI provider connection OK (Anthropic)',
      duration: 4000,
    });
  });

  it('OpenAI success with 5 models fires the standard "(OpenAI, 5 models available)" Notice', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 5 } as ProbeResult));
    const fake = makeFake({
      active: 'openai',
      cfg: makeProviderConfig({ apiKey: 'sk-test' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls[0]?.text).toBe('AI provider connection OK (OpenAI, 5 models available)');
    expect(noticeCalls[0]?.duration).toBe(4000);
  });

  it('Ollama with 0 models fires the special pull-suggestion Notice (6000ms)', async () => {
    const probe = vi.fn(async () => ({ ok: true, modelCount: 0 } as ProbeResult));
    const fake = makeFake({
      active: 'ollama',
      cfg: makeProviderConfig({ apiKey: '', baseUrl: 'http://localhost:11434/v1' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls[0]?.text).toContain('ollama pull llama3.2');
    expect(noticeCalls[0]?.text).toContain('Ollama reachable');
    expect(noticeCalls[0]?.duration).toBe(6000);
  });

  it('failure Notice combines the brand prefix and vendor message, truncated to 200 chars total', async () => {
    const longMessage = 'A'.repeat(300);
    const probe = vi.fn(async () => ({ ok: false, errorMessage: longMessage } as ProbeResult));
    const fake = makeFake({
      active: 'openai',
      cfg: makeProviderConfig({ apiKey: 'sk-bogus' }),
      probe,
    });
    await callTestActiveAIConnection(fake);
    expect(noticeCalls).toHaveLength(1);
    const notice = noticeCalls[0];
    expect(notice?.text.length).toBe(200);
    expect(notice?.text.startsWith('OpenAI: ')).toBe(true);
    expect(notice?.duration).toBe(6000);
  });
});
