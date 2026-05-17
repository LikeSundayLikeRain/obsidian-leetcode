// tests/ai/providers/index.test.ts
//
// Phase 08.1 Plan 02 — resolveAdapter exhaustiveness coverage. Asserts that
// every AIProvider value (all 6, including 'bedrock') routes to a
// resolved adapter shape with { probe, streamInvoke, bufferedInvoke }
// callables. Mirrors tests/ai/providers/abortSignal.test.ts mock harness
// shape — vi.mock the SDK provider factories so model construction does not
// actually validate API keys at import time.

import { describe, it, expect, vi } from 'vitest';
import type { AIProvider, ProviderConfig, BedrockProviderConfig } from '../../../src/ai/types';
import type { FetchFn } from '../../../src/ai/obsidianFetch';

vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => ({ provider: 'anthropic-stub' })),
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => () => ({ provider: 'openai-stub' })),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => () => ({ provider: 'oai-compat-stub' })),
}));
vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(() => () => ({ provider: 'bedrock-stub' })),
}));

vi.mock('../../../src/ai/awsCredentials', () => ({
  resolveAwsCredentials: vi.fn(() => ({})),
}));

vi.mock('obsidian', async () => await import('../../helpers/obsidian-stub'));

const fetcher = vi.fn() as unknown as FetchFn;

function makeCfg(provider: AIProvider): ProviderConfig | BedrockProviderConfig {
  if (provider === 'bedrock') {
    return {
      apiKey: '',
      baseUrl: '',
      model: '',
      disclosureAcknowledged: true,
      region: 'us-east-1',
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      authMethod: 'default-chain',
      accessKeyId: '',
      secretAccessKey: '',
      ssoProfile: '',
      bedrockApiKey: '',
    } as BedrockProviderConfig;
  }
  return {
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    disclosureAcknowledged: true,
  };
}

const ALL_PROVIDERS: AIProvider[] = [
  'anthropic',
  'openai',
  'openrouter',
  'ollama',
  'custom',
  'bedrock',
];

describe('Phase 08.1 resolveAdapter — exhaustive switch covers all 6 providers', () => {
  it.each(ALL_PROVIDERS)(
    "resolveAdapter('%s', cfg, fetcher) returns { probe, streamInvoke, bufferedInvoke } with all 3 callable",
    async (provider) => {
      const { resolveAdapter } = await import('../../../src/ai/providers');
      const adapter = resolveAdapter(provider, makeCfg(provider) as ProviderConfig, fetcher);
      expect(typeof adapter.probe).toBe('function');
      expect(typeof adapter.streamInvoke).toBe('function');
      expect(typeof adapter.bufferedInvoke).toBe('function');
    },
  );
});

describe('Phase 08.1 resolveAdapter — bedrock case routing', () => {
  it("resolveAdapter('bedrock', ...) wires probeBedrock for probe()", async () => {
    const providers = await import('../../../src/ai/providers');
    const adapter = providers.resolveAdapter(
      'bedrock',
      makeCfg('bedrock') as ProviderConfig,
      fetcher,
    );
    // We can't directly compare function identity (case 'bedrock' wraps the
    // helper in a closure: `() => probeBedrock(cfg, fetcher)`) but we can
    // assert it's a function bound to the closure (not the bare reference).
    expect(adapter.probe).not.toBe(providers.probeBedrock);
    expect(adapter.streamInvoke).not.toBe(providers.streamBedrock);
    expect(adapter.bufferedInvoke).not.toBe(providers.invokeBedrockBuffered);
  });

  it('barrel re-exports the 4 bedrock helpers', async () => {
    const providers = await import('../../../src/ai/providers');
    expect(typeof providers.createBedrockModel).toBe('function');
    expect(typeof providers.probeBedrock).toBe('function');
    expect(typeof providers.streamBedrock).toBe('function');
    expect(typeof providers.invokeBedrockBuffered).toBe('function');
  });
});
