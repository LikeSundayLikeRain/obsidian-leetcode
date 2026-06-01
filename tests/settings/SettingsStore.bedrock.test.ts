// tests/settings/SettingsStore.bedrock.test.ts
//
// Phase 08.1 Plan 02 — SettingsStore Bedrock-specific shape-guard + load
// hydration tests. Mirrors tests/ai/settingsStore.test.ts shape (mock-plugin
// loadData/saveData spies; one `it()` per malformed-input → default-fallback
// case).
//
// The Pitfall 10 invariant — switching `authMethod` mid-edit MUST NOT clear
// secret fields in inactive modes — is the load-bearing assertion in this
// suite. The Settings UI test (Task 3) covers the rendering side; this file
// covers the persistence side.

import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../../src/settings/SettingsStore';
import type { BedrockProviderConfig } from '../../src/ai/types';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => {
      state.data = d;
    }),
    state,
  };
}

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_MODEL_ID = 'us.anthropic.claude-sonnet-4-6';

describe('Phase 08.1 SettingsStore — bedrock defaults (T-08.1-shape-guard)', () => {
  it('load: missing providerConfigs.bedrock hydrates with locked defaults', async () => {
    const plugin = makeMockPlugin({});
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.region).toBe(DEFAULT_REGION);
    expect(cfg.modelId).toBe(DEFAULT_MODEL_ID);
    expect(cfg.authMethod).toBe('default-chain');
    // All 4 secret fields default to empty strings.
    expect(cfg.accessKeyId).toBe('');
    expect(cfg.secretAccessKey).toBe('');
    expect(cfg.ssoProfile).toBe('');
    expect(cfg.bedrockApiKey).toBe('');
    // Inherited ProviderConfig fields default to empty strings (unused for Bedrock).
    expect(cfg.apiKey).toBe('');
    expect(cfg.disclosureAcknowledged).toBe(false);
  });

  it('load: completely null providerConfigs.bedrock collapses to defaults', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        bedrock: null,
      },
    });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.region).toBe(DEFAULT_REGION);
    expect(cfg.modelId).toBe(DEFAULT_MODEL_ID);
    expect(cfg.authMethod).toBe('default-chain');
  });

  it('load: non-object providerConfigs.bedrock collapses to defaults', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        bedrock: 'definitely not an object',
      },
    });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.region).toBe(DEFAULT_REGION);
  });
});

describe('Phase 08.1 SettingsStore — bedrock authMethod shape-guard', () => {
  it('load: unknown authMethod string collapses to default-chain', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        bedrock: {
          region: 'us-west-2',
          modelId: 'meta.llama3-70b',
          authMethod: 'magic-method', // not in VALID_BEDROCK_AUTH_METHODS
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.authMethod).toBe('default-chain');
    // region + modelId still preserved (only authMethod fell back).
    expect(cfg.region).toBe('us-west-2');
    expect(cfg.modelId).toBe('meta.llama3-70b');
  });

  it('load: non-string authMethod (number) collapses to default-chain', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        bedrock: { authMethod: 42 },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.authMethod).toBe('default-chain');
  });

  it.each(['default-chain', 'access-keys', 'sso-profile', 'api-key'] as const)(
    'load: valid authMethod %s round-trips byte-clean',
    async (authMethod) => {
      const plugin = makeMockPlugin({
        providerConfigs: {
          bedrock: {
            region: 'us-east-1',
            modelId: 'm',
            authMethod,
          },
        },
      });
      const s = await SettingsStore.load(plugin as never);
      const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
      expect(cfg.authMethod).toBe(authMethod);
    },
  );
});

describe('Phase 08.1 SettingsStore — bedrock secret-field preservation (Pitfall 10)', () => {
  // The load-bearing invariant: switching authMethod must NEVER clear inactive
  // mode's secret fields. The Settings UI changes which rows RENDER; the
  // persistence layer keeps every secret intact regardless of authMethod.
  it('load: preserves all 4 secret fields when authMethod is access-keys', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: {
        bedrock: {
          region: 'us-east-1',
          modelId: 'm',
          authMethod: 'access-keys',
          accessKeyId: 'AKIA-A',
          secretAccessKey: 'secret-A',
          ssoProfile: 'sso-profile-A',
          bedrockApiKey: 'bedrock-bearer-A',
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.accessKeyId).toBe('AKIA-A');
    expect(cfg.secretAccessKey).toBe('secret-A');
    expect(cfg.ssoProfile).toBe('sso-profile-A');
    expect(cfg.bedrockApiKey).toBe('bedrock-bearer-A');
  });

  it('setProviderConfig: switching authMethod from access-keys to api-key preserves accessKeyId + secretAccessKey', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    // Initial: write access-keys with values.
    await s.setProviderConfig('bedrock', {
      apiKey: '',
      baseUrl: '',
      model: '',
      disclosureAcknowledged: false,
      region: 'us-east-1',
      modelId: 'm',
      authMethod: 'access-keys',
      accessKeyId: 'AKIA-PRESERVED',
      secretAccessKey: 'secret-PRESERVED',
      ssoProfile: '',
      bedrockApiKey: '',
    } as BedrockProviderConfig);
    // Switch to api-key — must NOT clear accessKeyId or secretAccessKey.
    const current = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    await s.setProviderConfig('bedrock', {
      ...current,
      authMethod: 'api-key',
      bedrockApiKey: 'bedrock-bearer-NEW',
    });
    const after = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(after.authMethod).toBe('api-key');
    expect(after.accessKeyId).toBe('AKIA-PRESERVED');
    expect(after.secretAccessKey).toBe('secret-PRESERVED');
    expect(after.bedrockApiKey).toBe('bedrock-bearer-NEW');
  });

  it('setProviderConfig: switching authMethod back-and-forth preserves all 4 secret fields byte-clean', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    const seed: BedrockProviderConfig = {
      apiKey: '',
      baseUrl: '',
      model: '',
      disclosureAcknowledged: false,
      region: 'us-east-1',
      modelId: 'm',
      authMethod: 'access-keys',
      accessKeyId: 'AKIA-X',
      secretAccessKey: 'secret-X',
      ssoProfile: 'profile-X',
      bedrockApiKey: 'bearer-X',
    };
    await s.setProviderConfig('bedrock', seed);
    // access-keys → sso-profile → api-key → access-keys. Same starting cfg
    // each step (preservation must not depend on per-call narrowing).
    for (const m of ['sso-profile', 'api-key', 'access-keys'] as const) {
      const cur = s.getProviderConfig('bedrock') as BedrockProviderConfig;
      await s.setProviderConfig('bedrock', { ...cur, authMethod: m });
    }
    const after = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(after.accessKeyId).toBe('AKIA-X');
    expect(after.secretAccessKey).toBe('secret-X');
    expect(after.ssoProfile).toBe('profile-X');
    expect(after.bedrockApiKey).toBe('bearer-X');
  });
});

describe('Phase 08.1 SettingsStore — bedrock activeAIProvider', () => {
  it("load: 'bedrock' is a valid activeAIProvider value", async () => {
    const plugin = makeMockPlugin({ activeAIProvider: 'bedrock' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getActiveAIProvider()).toBe('bedrock');
  });
});

describe('Phase 08.1 SettingsStore — bedrock load round-trip', () => {
  it('well-formed bedrock blob round-trips byte-for-byte', async () => {
    const blob = {
      apiKey: '',
      baseUrl: '',
      model: '',
      disclosureAcknowledged: true,
      region: 'eu-west-1',
      modelId: 'us.anthropic.claude-haiku-4-5',
      authMethod: 'access-keys',
      accessKeyId: 'AKIA-RT',
      secretAccessKey: 'secret-RT',
      ssoProfile: 'rt-profile',
      bedrockApiKey: 'rt-bearer',
    };
    const plugin = makeMockPlugin({ providerConfigs: { bedrock: blob } });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.region).toBe(blob.region);
    expect(cfg.modelId).toBe(blob.modelId);
    expect(cfg.authMethod).toBe(blob.authMethod);
    expect(cfg.accessKeyId).toBe(blob.accessKeyId);
    expect(cfg.secretAccessKey).toBe(blob.secretAccessKey);
    expect(cfg.ssoProfile).toBe(blob.ssoProfile);
    expect(cfg.bedrockApiKey).toBe(blob.bedrockApiKey);
    expect(cfg.disclosureAcknowledged).toBe(true);
  });

  it('malformed bedrock blob (string) collapses to defaults', async () => {
    const plugin = makeMockPlugin({
      providerConfigs: { bedrock: 'corrupt' },
    });
    const s = await SettingsStore.load(plugin as never);
    const cfg = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(cfg.region).toBe(DEFAULT_REGION);
    expect(cfg.authMethod).toBe('default-chain');
    expect(cfg.accessKeyId).toBe('');
  });
});
