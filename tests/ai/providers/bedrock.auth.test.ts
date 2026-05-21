// tests/ai/providers/bedrock.auth.test.ts
//
// Phase 08.1 Plan 02 — auth-method dispatch unit tests for createBedrockModel.
// Each of the 4 auth modes (default-chain / access-keys / sso-profile /
// api-key) maps onto a different set of constructor options for
// createAmazonBedrock. We mock the SDK + awsCredentials so the test can
// inspect the final options without real network or filesystem access.
//
// The Pitfall 10 invariant — switching authMethod must NOT clear inactive
// secret fields — is the persistence-side contract; this file covers the
// adapter-side contract (only the relevant secret per authMethod flows
// into createAmazonBedrock).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BedrockProviderConfig } from '../../../src/ai/types';
import type { FetchFn } from '../../../src/ai/obsidianFetch';

const createAmazonBedrockSpy = vi.fn();
const resolveAwsCredentialsSpy = vi.fn();

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: (opts: unknown) => {
    createAmazonBedrockSpy(opts);
    return (modelId: string) => ({ modelId });
  },
}));

vi.mock('ai', () => ({
  // No-ops — these tests don't invoke streamText / generateText, only
  // createBedrockModel which calls createAmazonBedrock.
  streamText: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock('../../../src/ai/awsCredentials', () => ({
  resolveAwsCredentials: (opts: unknown) => resolveAwsCredentialsSpy(opts),
  resolveAwsCredentialsAsync: (opts: unknown) => Promise.resolve(resolveAwsCredentialsSpy(opts)),
}));

vi.mock('obsidian', async () => await import('../../helpers/obsidian-stub'));

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
  createAmazonBedrockSpy.mockReset();
  resolveAwsCredentialsSpy.mockReset();
});

describe('Phase 08.2 createBedrockModel — default-chain auth (lazy credentialProvider)', () => {
  it('sets credentialProvider as an async function (no eager resolve)', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(makeBedrockCfg({ authMethod: 'default-chain' }), fetcher);
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { credentialProvider?: () => PromiseLike<unknown> };
    expect(typeof opts.credentialProvider).toBe('function');
    expect(resolveAwsCredentialsSpy).not.toHaveBeenCalled();
  });

  it('credentialProvider resolves to credentials when called', async () => {
    resolveAwsCredentialsSpy.mockReturnValue({
      accessKeyId: 'AKIA-FROM-CHAIN',
      secretAccessKey: 'secret-from-chain',
      sessionToken: 'session-from-chain',
    });
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(makeBedrockCfg({ authMethod: 'default-chain' }), fetcher);
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { credentialProvider: () => PromiseLike<unknown> };
    const creds = await opts.credentialProvider();
    expect(creds).toEqual({
      accessKeyId: 'AKIA-FROM-CHAIN',
      secretAccessKey: 'secret-from-chain',
      sessionToken: 'session-from-chain',
    });
    expect(resolveAwsCredentialsSpy).toHaveBeenCalledWith({ source: 'env-or-default-profile' });
  });
});

describe('Phase 08.1 createBedrockModel — access-keys auth', () => {
  it('passes cfg.accessKeyId and cfg.secretAccessKey directly into opts', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({
        authMethod: 'access-keys',
        accessKeyId: 'AKIA-EXPLICIT',
        secretAccessKey: 'secret-explicit',
      }),
      fetcher,
    );
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as {
      accessKeyId?: string;
      secretAccessKey?: string;
    };
    expect(opts.accessKeyId).toBe('AKIA-EXPLICIT');
    expect(opts.secretAccessKey).toBe('secret-explicit');
  });

  it('does NOT call resolveAwsCredentials (env / file are not consulted)', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({
        authMethod: 'access-keys',
        accessKeyId: 'AKIA-X',
        secretAccessKey: 'secret-X',
      }),
      fetcher,
    );
    expect(resolveAwsCredentialsSpy).not.toHaveBeenCalled();
  });
});

describe('Phase 08.2 createBedrockModel — sso-profile auth (lazy credentialProvider)', () => {
  it('sets credentialProvider that resolves with profile name', async () => {
    resolveAwsCredentialsSpy.mockReturnValue({});
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({ authMethod: 'sso-profile', ssoProfile: 'work' }),
      fetcher,
    );
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { credentialProvider: () => PromiseLike<unknown> };
    expect(typeof opts.credentialProvider).toBe('function');
    await opts.credentialProvider();
    expect(resolveAwsCredentialsSpy).toHaveBeenCalledWith({ source: 'profile', profile: 'work' });
  });

  it('passes empty profile string when cfg.ssoProfile is undefined', async () => {
    resolveAwsCredentialsSpy.mockReturnValue({});
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({ authMethod: 'sso-profile', ssoProfile: undefined }),
      fetcher,
    );
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { credentialProvider: () => PromiseLike<unknown> };
    await opts.credentialProvider();
    expect(resolveAwsCredentialsSpy).toHaveBeenCalledWith({ source: 'profile', profile: '' });
  });
});

describe('Phase 08.1 createBedrockModel — api-key auth', () => {
  it('passes cfg.bedrockApiKey directly into opts.apiKey', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({ authMethod: 'api-key', bedrockApiKey: 'bedrock-bearer-12345' }),
      fetcher,
    );
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as { apiKey?: string };
    expect(opts.apiKey).toBe('bedrock-bearer-12345');
  });

  it('does NOT call resolveAwsCredentials (env / file are not consulted)', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({ authMethod: 'api-key', bedrockApiKey: 'bedrock-bearer' }),
      fetcher,
    );
    expect(resolveAwsCredentialsSpy).not.toHaveBeenCalled();
  });

  it('does NOT pass accessKeyId/secretAccessKey when authMethod is api-key', async () => {
    const { createBedrockModel } = await import('../../../src/ai/providers/bedrock');
    createBedrockModel(
      makeBedrockCfg({
        authMethod: 'api-key',
        // These exist in cfg (Pitfall 10 — preserved across mode switch) but
        // MUST NOT flow into the SDK constructor when api-key is active.
        accessKeyId: 'AKIA-INACTIVE',
        secretAccessKey: 'secret-inactive',
        bedrockApiKey: 'bearer-active',
      }),
      fetcher,
    );
    const opts = createAmazonBedrockSpy.mock.calls[0]![0] as {
      accessKeyId?: string;
      secretAccessKey?: string;
      apiKey?: string;
    };
    expect(opts.accessKeyId).toBeUndefined();
    expect(opts.secretAccessKey).toBeUndefined();
    expect(opts.apiKey).toBe('bearer-active');
  });
});
