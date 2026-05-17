// tests/ai/AIClient.invokeStream.fetch-primary.test.ts
//
// Phase 08.1 Plan 01 Task 1 — Wave 0 scaffold for the TIER 1 native-fetch
// primary tier. Bodies fill in Task 2 (TDD).
//
// Mirrors the mock harness from tests/ai/AIClient.invokeStream.test.ts
// lines 14-65 verbatim.

import { describe, it, vi, beforeEach } from 'vitest';

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

// MockSettings interface + DEFAULT_CFG + makeMockSettings — same fixture
// pattern Task 2 will consume. Kept inline here so the harness is symmetric
// across all three new invokeStream test files. (Symbols may appear unused
// at the scaffold gate — Task 2 references them.)
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

// Suppress unused-symbol lint at the scaffold gate without using `it(` (which
// would violate Task 1 AC: scaffold MUST be it.todo only).
void DEFAULT_CFG;
void makeMockSettings;

describe('Phase 08.1 AIClient.invokeStream — TIER 1 native fetch primary', () => {
  beforeEach(() => {
    resolveAdapterMock.mockReset();
    obsidianFetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it.todo('TIER 1 native fetch wins when fetch is available');
});
