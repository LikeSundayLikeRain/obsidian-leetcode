// tests/ai/providers/bedrock.test.ts
//
// Phase 08.1 Plan 02 — Bedrock provider adapter shape coverage. Mirrors
// tests/ai/providers/abortSignal.test.ts (the only sibling provider test) +
// tests/ai/probe-anthropic.test.ts (probe shape parity).
//
// Mocks @ai-sdk/amazon-bedrock and 'ai' so model construction does not
// actually validate AWS credentials at import time. Each test asserts the
// args shape the AI SDK receives.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BedrockProviderConfig } from '../../../src/ai/types';
import type { FetchFn } from '../../../src/ai/obsidianFetch';

const streamTextSpy = vi.fn();
const generateTextSpy = vi.fn();
const createAmazonBedrockSpy = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextSpy(...args),
  generateText: (...args: unknown[]) => generateTextSpy(...args),
}));

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  // The factory returns a callable that returns a stub model object.
  // createAmazonBedrockSpy captures the constructor opts.
  createAmazonBedrock: (opts: unknown) => {
    createAmazonBedrockSpy(opts);
    return (modelId: string) => ({ provider: 'bedrock-stub', modelId });
  },
}));

vi.mock('obsidian', async () => await import('../../helpers/obsidian-stub'));

// awsCredentials is mocked to a deterministic stub so default-chain /
// sso-profile tests don't depend on the real Node-require shim.
const resolveAwsCredentialsSpy = vi.fn();
vi.mock('../../../src/ai/awsCredentials', () => ({
  resolveAwsCredentials: (opts: unknown) => resolveAwsCredentialsSpy(opts),
  resolveAwsCredentialsAsync: (opts: unknown) => Promise.resolve(resolveAwsCredentialsSpy(opts)),
}));

const fetcher = vi.fn() as unknown as FetchFn;

function makeBedrockCfg(overrides: Partial<BedrockProviderConfig> = {}): BedrockProviderConfig {
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
    ...overrides,
  };
}

beforeEach(() => {
  streamTextSpy.mockReset();
  generateTextSpy.mockReset();
  createAmazonBedrockSpy.mockReset();
  resolveAwsCredentialsSpy.mockReset();
  resolveAwsCredentialsSpy.mockReturnValue({}); // empty creds by default
});

describe('Phase 08.1 createBedrockModel — SDK construction', () => {
  it('passes region from cfg into createAmazonBedrock opts', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(makeBedrockCfg({ region: 'eu-west-1' }), fetcher);
    expect(createAmazonBedrockSpy).toHaveBeenCalledTimes(1);
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { region: string };
    expect(opts.region).toBe('eu-west-1');
  });

  it("falls back to 'us-east-1' when cfg.region is empty", async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(makeBedrockCfg({ region: '' }), fetcher);
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { region: string };
    expect(opts.region).toBe('us-east-1');
  });

  it('passes the caller-supplied fetcher into createAmazonBedrock opts', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(makeBedrockCfg(), fetcher);
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { fetch: unknown };
    expect(opts.fetch).toBe(fetcher);
  });

  it('uses cfg.modelId verbatim when calling provider(modelId)', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    const model = createBedrockModel(
      makeBedrockCfg({ modelId: 'us.anthropic.claude-haiku-4-5' }),
      fetcher,
    ) as { modelId: string };
    expect(model.modelId).toBe('us.anthropic.claude-haiku-4-5');
  });

  it("falls back to default modelId when cfg.modelId is empty", async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    const model = createBedrockModel(makeBedrockCfg({ modelId: '' }), fetcher) as {
      modelId: string;
    };
    expect(model.modelId).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
  });
});

describe('Phase 08.1 streamBedrock + invokeBedrockBuffered — abort + prompt forwarding', () => {
  it('streamBedrock passes prompt and abortSignal into streamText', async () => {
    streamTextSpy.mockReturnValue({ textStream: (async function* () {})() });
    const { streamBedrock } = await import('../../../src/ai/providers/bedrock');
    const ctrl = new AbortController();
    streamBedrock(makeBedrockCfg(), fetcher, 'hello-bedrock', ctrl.signal);
    expect(streamTextSpy).toHaveBeenCalledTimes(1);
    const args = streamTextSpy.mock.calls[0]![0] as {
      abortSignal: AbortSignal;
      prompt: string;
    };
    expect(args.prompt).toBe('hello-bedrock');
    expect(args.abortSignal).toBe(ctrl.signal);
  });

  it('invokeBedrockBuffered passes prompt and abortSignal into generateText', async () => {
    generateTextSpy.mockResolvedValue({ text: 'pong', usage: undefined });
    const { invokeBedrockBuffered } = await import('../../../src/ai/providers/bedrock');
    const ctrl = new AbortController();
    await invokeBedrockBuffered(makeBedrockCfg(), fetcher, 'hi', ctrl.signal);
    expect(generateTextSpy).toHaveBeenCalledTimes(1);
    const args = generateTextSpy.mock.calls[0]![0] as {
      abortSignal: AbortSignal;
      prompt: string;
    };
    expect(args.prompt).toBe('hi');
    expect(args.abortSignal).toBe(ctrl.signal);
  });

  it('invokeBedrockBuffered returns { text, usage } when usage is present', async () => {
    generateTextSpy.mockResolvedValue({
      text: 'response',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const { invokeBedrockBuffered } = await import('../../../src/ai/providers/bedrock');
    const result = await invokeBedrockBuffered(
      makeBedrockCfg(),
      fetcher,
      'hi',
      new AbortController().signal,
    );
    expect(result).toEqual({
      text: 'response',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
  });

  it('invokeBedrockBuffered omits usage when SDK returns undefined usage', async () => {
    generateTextSpy.mockResolvedValue({ text: 'response', usage: undefined });
    const { invokeBedrockBuffered } = await import('../../../src/ai/providers/bedrock');
    const result = await invokeBedrockBuffered(
      makeBedrockCfg(),
      fetcher,
      'hi',
      new AbortController().signal,
    );
    expect(result.text).toBe('response');
    expect(result.usage).toBeUndefined();
  });
});

describe('Phase 08.1 probeBedrock — never-throw + 1-token chat completion', () => {
  it('calls generateText with maxOutputTokens: 1, prompt: "ping"', async () => {
    generateTextSpy.mockResolvedValueOnce({
      text: 'pong',
      usage: { inputTokens: 5, outputTokens: 1 },
    });
    const { probeBedrock } = await import('../../../src/ai/providers/bedrock');
    const result = await probeBedrock(makeBedrockCfg(), fetcher);
    expect(generateTextSpy).toHaveBeenCalledTimes(1);
    const args = generateTextSpy.mock.calls[0]![0] as {
      prompt: string;
      maxOutputTokens: number;
    };
    expect(args.prompt).toBe('ping');
    expect(args.maxOutputTokens).toBe(1);
    expect(result).toEqual({ ok: true, modelCount: null });
  });

  it('returns { ok: false, errorMessage } on SDK throw — NEVER throws', async () => {
    generateTextSpy.mockRejectedValueOnce(new Error('Invalid AWS credentials'));
    const { probeBedrock } = await import('../../../src/ai/providers/bedrock');
    const result = await probeBedrock(makeBedrockCfg(), fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Invalid AWS credentials');
  });

  it('truncates long SDK error messages to 200 chars (S5 shared pattern)', async () => {
    const longMsg = 'B'.repeat(400);
    generateTextSpy.mockRejectedValueOnce(new Error(longMsg));
    const { probeBedrock } = await import('../../../src/ai/providers/bedrock');
    const result = await probeBedrock(makeBedrockCfg(), fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage!.length).toBe(200);
  });
});
