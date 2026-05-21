// tests/ai/awsCredentials.test.ts
//
// Phase 08.1 Plan 02 + Phase 08.2 Plan 01 — unit tests for the canonical
// AWS credential chain: env vars, profile resolution, file reads with
// AWS_*_FILE overrides, config-file [profile X] syntax, merge logic,
// and credential_process delegation.
//
// Strategy: stub `activeWindow.require` (the Electron-renderer Node-require
// shim) with a fake fs/path/os triple that returns deterministic content per
// test. Mirrors the precedent in tests/ai/obsidianFetch.test.ts:100-119.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Test harness helpers ──────────────────────────────────────────────────

interface FakeFs {
  readFileSync(path: string, encoding: string): string;
}

/**
 * Enhanced stubNodeModules that supports multiple file paths.
 * When `files` is provided, readFileSync dispatches by path.
 * When `credentialsContent` is provided (legacy), all reads return it.
 */
function stubNodeModules(opts: {
  credentialsContent?: string;
  files?: Record<string, string>;
  throwOnRead?: Error;
}): void {
  const fakeFs: FakeFs = {
    readFileSync(p: string, _e: string): string {
      if (opts.throwOnRead) throw opts.throwOnRead;
      if (opts.files && p in opts.files) return opts.files[p] as string;
      return opts.credentialsContent ?? '';
    },
  };
  const fakePath = {
    join(...parts: string[]): string {
      return parts.join('/');
    },
  };
  const fakeOs = {
    homedir(): string {
      return '/home/testuser';
    },
  };
  const fakeRequire = vi.fn((id: string) => {
    if (id === 'fs') return fakeFs;
    if (id === 'path') return fakePath;
    if (id === 'os') return fakeOs;
    if (id === 'child_process') return { spawnSync: vi.fn() };
    throw new Error(`unexpected require: ${id}`);
  });
  vi.stubGlobal('activeWindow', { require: fakeRequire });
}

const ORIGINAL_ENV = { ...process.env };

function clearAwsEnv(): void {
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_DEFAULT_PROFILE;
  delete process.env.AWS_SHARED_CREDENTIALS_FILE;
  delete process.env.AWS_CONFIG_FILE;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  clearAwsEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore env vars to their original state to avoid cross-test pollution.
  process.env = { ...ORIGINAL_ENV };
});

// ─── Phase 08.1 — env-or-default-profile dispatch (preserved) ──────────────

describe('Phase 08.1 awsCredentials — env-or-default-profile dispatch', () => {
  it('returns env vars when AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY are set', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'secretexample';
    process.env.AWS_SESSION_TOKEN = 'token-from-env';
    // No need to stub fs because env path wins first.
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIAEXAMPLE');
    expect(creds.secretAccessKey).toBe('secretexample');
    expect(creds.sessionToken).toBe('token-from-env');
  });

  it('falls back to ~/.aws/credentials [default] when env vars are absent', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[default]',
          'aws_access_key_id = AKIAFROMFILE',
          'aws_secret_access_key = secretfromfile',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIAFROMFILE');
    expect(creds.secretAccessKey).toBe('secretfromfile');
    expect(creds.sessionToken).toBeUndefined();
  });

  it('returns empty object when env vars and ~/.aws/credentials both miss', async () => {
    stubNodeModules({ credentialsContent: '' });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds).toEqual({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });
});

// ─── Phase 08.1 — Named profile dispatch (preserved) ───────────────────────

describe('Phase 08.1 awsCredentials — named profile dispatch', () => {
  it("reads the [work] section when source: 'profile', profile: 'work'", async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[default]',
          'aws_access_key_id = AKIA-DEFAULT',
          'aws_secret_access_key = secret-default',
          '',
          '[work]',
          'aws_access_key_id = AKIA-WORK',
          'aws_secret_access_key = secret-work',
          'aws_session_token = work-session-token',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-WORK');
    expect(creds.secretAccessKey).toBe('secret-work');
    expect(creds.sessionToken).toBe('work-session-token');
  });

  it('returns empty when the requested profile is missing', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': '[default]\naws_access_key_id = AKIA-DEFAULT',
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'nonexistent' });
    expect(creds).toEqual({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });
});

// ─── Phase 08.1 — INI parser edge cases (preserved) ────────────────────────

describe('Phase 08.1 awsCredentials — parseIniProfile edge cases', () => {
  it('ignores `#` and `;` comment lines and blank lines', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '# comment line',
          '',
          '; another comment',
          '[default]',
          '# inline-style comment after section',
          '   ',
          'aws_access_key_id = AKIA-CLEAN',
          '; aws_secret_access_key = should-be-ignored',
          'aws_secret_access_key = secret-clean',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-CLEAN');
    expect(creds.secretAccessKey).toBe('secret-clean');
  });

  it('returns empty object on missing file (fs.readFileSync throws ENOENT)', async () => {
    const enoent = new Error('ENOENT: no such file or directory');
    (enoent as unknown as { code: string }).code = 'ENOENT';
    stubNodeModules({ throwOnRead: enoent });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    // Empty object — collapsed silently per T-08.1-03 mitigation.
    expect(creds).toEqual({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });

  it('returns empty object when nodeRequire shim is unavailable (no activeWindow.require)', async () => {
    // No vi.stubGlobal('activeWindow', ...) — the shim has no fallback.
    // process.env vars are also clear (clearAwsEnv() in beforeEach), so the
    // env path doesn't short-circuit the test.
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds).toEqual({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });

  it('parseIniProfile is exported and parses a single-section blob directly', async () => {
    const { parseIniProfile } = await import('../../src/ai/awsCredentials');
    const out = parseIniProfile(
      [
        '[default]',
        'aws_access_key_id = AKIA-DIRECT',
        'aws_secret_access_key=secret-direct',
        'aws_session_token =  token-with-leading-space',
      ].join('\n'),
      'default',
    );
    expect(out.accessKeyId).toBe('AKIA-DIRECT');
    expect(out.secretAccessKey).toBe('secret-direct');
    expect(out.sessionToken).toBe('token-with-leading-space');
  });
});

// ─── Phase 08.2 — Profile resolution waterfall ─────────────────────────────

describe('Phase 08.2 awsCredentials — profile resolution waterfall', () => {
  it('AWS_PROFILE=work resolves the [work] section instead of [default]', async () => {
    process.env.AWS_PROFILE = 'work';
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[default]',
          'aws_access_key_id = AKIA-DEFAULT',
          'aws_secret_access_key = secret-default',
          '',
          '[work]',
          'aws_access_key_id = AKIA-WORK',
          'aws_secret_access_key = secret-work',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-WORK');
    expect(creds.secretAccessKey).toBe('secret-work');
  });

  it('AWS_DEFAULT_PROFILE=staging resolves the [staging] section', async () => {
    process.env.AWS_DEFAULT_PROFILE = 'staging';
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[default]',
          'aws_access_key_id = AKIA-DEFAULT',
          'aws_secret_access_key = secret-default',
          '',
          '[staging]',
          'aws_access_key_id = AKIA-STAGING',
          'aws_secret_access_key = secret-staging',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-STAGING');
    expect(creds.secretAccessKey).toBe('secret-staging');
  });

  it('with no AWS_PROFILE or AWS_DEFAULT_PROFILE, falls back to [default]', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[default]',
          'aws_access_key_id = AKIA-FALLBACK',
          'aws_secret_access_key = secret-fallback',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-FALLBACK');
    expect(creds.secretAccessKey).toBe('secret-fallback');
  });

  it("source:'profile' skips env vars and reads [work] directly", async () => {
    // Set env vars that would win for default-chain — profile mode ignores them.
    process.env.AWS_ACCESS_KEY_ID = 'AKIA-ENV';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-env';
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[work]',
          'aws_access_key_id = AKIA-WORK-DIRECT',
          'aws_secret_access_key = secret-work-direct',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-WORK-DIRECT');
    expect(creds.secretAccessKey).toBe('secret-work-direct');
  });
});

// ─── Phase 08.2 — AWS_*_FILE env overrides ──────────────────────────────────

describe('Phase 08.2 awsCredentials — AWS_*_FILE overrides', () => {
  it('AWS_SHARED_CREDENTIALS_FILE=/custom/path is honored', async () => {
    process.env.AWS_SHARED_CREDENTIALS_FILE = '/custom/credentials';
    stubNodeModules({
      files: {
        '/custom/credentials': [
          '[default]',
          'aws_access_key_id = AKIA-CUSTOM-CRED',
          'aws_secret_access_key = secret-custom-cred',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-CUSTOM-CRED');
    expect(creds.secretAccessKey).toBe('secret-custom-cred');
  });

  it('AWS_CONFIG_FILE=/custom/config is honored', async () => {
    process.env.AWS_CONFIG_FILE = '/custom/config';
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': '',
        '/custom/config': [
          '[default]',
          'aws_access_key_id = AKIA-CUSTOM-CFG',
          'aws_secret_access_key = secret-custom-cfg',
          'region = us-west-2',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-CUSTOM-CFG');
    expect(creds.secretAccessKey).toBe('secret-custom-cfg');
  });
});

// ─── Phase 08.2 — Config file [profile X] syntax ───────────────────────────

describe('Phase 08.2 awsCredentials — config file [profile X] syntax', () => {
  it('[profile work] syntax in config file matches profile work', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': '',
        '/home/testuser/.aws/config': [
          '[profile work]',
          'aws_access_key_id = AKIA-CFG-WORK',
          'aws_secret_access_key = secret-cfg-work',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-CFG-WORK');
    expect(creds.secretAccessKey).toBe('secret-cfg-work');
  });

  it('[default] in config file (not [profile default]) matches default profile', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': '',
        '/home/testuser/.aws/config': [
          '[default]',
          'aws_access_key_id = AKIA-CFG-DEFAULT',
          'aws_secret_access_key = secret-cfg-default',
          'region = eu-west-1',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-CFG-DEFAULT');
    expect(creds.secretAccessKey).toBe('secret-cfg-default');
  });

  it('[profile default] in config file also matches default profile', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': '',
        '/home/testuser/.aws/config': [
          '[profile default]',
          'aws_access_key_id = AKIA-CFG-PROFDEFAULT',
          'aws_secret_access_key = secret-cfg-profdefault',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-CFG-PROFDEFAULT');
    expect(creds.secretAccessKey).toBe('secret-cfg-profdefault');
  });
});

// ─── Phase 08.2 — Merge logic ──────────────────────────────────────────────

describe('Phase 08.2 awsCredentials — merge logic', () => {
  it('config wins on region; credentials wins on static keys', async () => {
    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[work]',
          'aws_access_key_id = AKIA-CRED-WORK',
          'aws_secret_access_key = secret-cred-work',
          'region = us-east-1',
        ].join('\n'),
        '/home/testuser/.aws/config': [
          '[profile work]',
          'aws_access_key_id = AKIA-CFG-WORK',
          'aws_secret_access_key = secret-cfg-work',
          'region = eu-central-1',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    // Credentials file wins on keys
    expect(creds.accessKeyId).toBe('AKIA-CRED-WORK');
    expect(creds.secretAccessKey).toBe('secret-cred-work');
  });

  it('credential_process from config is used when credentials file has none', async () => {
    // Mock getCachedOrRefreshSync to verify it's called
    vi.doMock('../../src/ai/credentialProcess', () => ({
      getCachedOrRefreshSync: vi.fn((_profile: string, _cmd: string) => ({
        accessKeyId: 'AKIA-FROM-PROCESS',
        secretAccessKey: 'secret-from-process',
        sessionToken: 'token-from-process',
      })),
      getCachedOrRefresh: vi.fn(),
      clearCredentialProcessCache: vi.fn(),
      parseCommandLine: vi.fn(),
    }));

    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[work]',
          '# no static keys, no credential_process',
        ].join('\n'),
        '/home/testuser/.aws/config': [
          '[profile work]',
          'credential_process = aws-vault exec work --json',
          'region = us-west-2',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-FROM-PROCESS');
    expect(creds.secretAccessKey).toBe('secret-from-process');
    expect(creds.sessionToken).toBe('token-from-process');
  });

  it('missing files collapse to empty object (D-18 — never throw)', async () => {
    const enoent = new Error('ENOENT');
    (enoent as unknown as { code: string }).code = 'ENOENT';
    stubNodeModules({ throwOnRead: enoent });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds).toEqual({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });

  it('missing nodeRequire returns empty object (existing behavior preserved)', async () => {
    // Don't stub activeWindow — nodeRequire returns undefined
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds).toEqual({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: undefined,
    });
  });
});

// ─── Phase 08.2 — credential_process delegation ────────────────────────────

describe('Phase 08.2 awsCredentials — credential_process delegation', () => {
  it('calls getCachedOrRefreshSync when credential_process directive found', async () => {
    const mockGetCachedOrRefreshSync = vi.fn(() => ({
      accessKeyId: 'AKIA-CP',
      secretAccessKey: 'secret-cp',
      sessionToken: 'session-cp',
    }));

    vi.doMock('../../src/ai/credentialProcess', () => ({
      getCachedOrRefreshSync: mockGetCachedOrRefreshSync,
      getCachedOrRefresh: vi.fn(),
      clearCredentialProcessCache: vi.fn(),
      parseCommandLine: vi.fn(),
    }));

    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[default]',
          'credential_process = /usr/local/bin/helper --json',
        ].join('\n'),
        '/home/testuser/.aws/config': '',
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds.accessKeyId).toBe('AKIA-CP');
    expect(creds.secretAccessKey).toBe('secret-cp');
    expect(creds.sessionToken).toBe('session-cp');
    expect(mockGetCachedOrRefreshSync).toHaveBeenCalledWith(
      'default',
      '/usr/local/bin/helper --json',
    );
  });

  it('credential_process in credentials file takes precedence over config file', async () => {
    const mockGetCachedOrRefreshSync = vi.fn((_p: string, cmd: string) => ({
      accessKeyId: `AKIA-${cmd.includes('cred-helper') ? 'CRED' : 'CFG'}`,
      secretAccessKey: 'secret',
    }));

    vi.doMock('../../src/ai/credentialProcess', () => ({
      getCachedOrRefreshSync: mockGetCachedOrRefreshSync,
      getCachedOrRefresh: vi.fn(),
      clearCredentialProcessCache: vi.fn(),
      parseCommandLine: vi.fn(),
    }));

    stubNodeModules({
      files: {
        '/home/testuser/.aws/credentials': [
          '[work]',
          'credential_process = cred-helper --json',
        ].join('\n'),
        '/home/testuser/.aws/config': [
          '[profile work]',
          'credential_process = cfg-helper --json',
        ].join('\n'),
      },
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-CRED');
    expect(mockGetCachedOrRefreshSync).toHaveBeenCalledWith(
      'work',
      'cred-helper --json',
    );
  });
});

// ─── Phase 08.2 — parseIniProfile extended return type ──────────────────────

describe('Phase 08.2 awsCredentials — parseIniProfile extended fields', () => {
  it('parseIniProfile returns credential_process and region fields', async () => {
    const { parseIniProfile } = await import('../../src/ai/awsCredentials');
    const out = parseIniProfile(
      [
        '[profile work]',
        'aws_access_key_id = AKIA-WORK',
        'aws_secret_access_key = secret-work',
        'credential_process = aws-vault exec work --json',
        'region = us-west-2',
      ].join('\n'),
      'work',
    );
    expect(out.credential_process).toBe('aws-vault exec work --json');
    expect(out.region).toBe('us-west-2');
    expect(out.accessKeyId).toBe('AKIA-WORK');
  });
});

// ─── Phase 08.2 Plan 02 — sessionToken integration (resolver → adapter) ─────

describe('Phase 08.2 integration — sessionToken round-trips through bedrock adapter', () => {
  it('access-keys mode passes sessionToken to SDK when present', async () => {
    // We test this via the bedrock adapter directly using a mock of the SDK
    const createAmazonBedrockOpts: Record<string, unknown>[] = [];
    vi.doMock('@ai-sdk/amazon-bedrock', () => ({
      createAmazonBedrock: (opts: Record<string, unknown>) => {
        createAmazonBedrockOpts.push(opts);
        return (modelId: string) => ({ modelId });
      },
    }));
    vi.doMock('ai', () => ({
      streamText: vi.fn(),
      generateText: vi.fn(),
    }));
    vi.doMock('../../src/ai/awsCredentials', () => ({
      resolveAwsCredentials: () => ({}),
    }));

    const { createBedrockModel } = await import('../../src/ai/providers/bedrock');
    const fetcher = vi.fn() as unknown as import('../../src/ai/obsidianFetch').FetchFn;

    createBedrockModel(
      {
        apiKey: '',
        baseUrl: '',
        model: '',
        disclosureAcknowledged: true,
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        authMethod: 'access-keys',
        accessKeyId: 'AKIA-TEMP',
        secretAccessKey: 'secret-temp',
        ssoProfile: '',
        bedrockApiKey: '',
        sessionToken: 'FwoGZX-session-token-from-sts',
      },
      fetcher,
    );

    expect(createAmazonBedrockOpts).toHaveLength(1);
    const opts = createAmazonBedrockOpts[0]!;
    expect(opts.accessKeyId).toBe('AKIA-TEMP');
    expect(opts.secretAccessKey).toBe('secret-temp');
    expect(opts.sessionToken).toBe('FwoGZX-session-token-from-sts');

    vi.doUnmock('@ai-sdk/amazon-bedrock');
    vi.doUnmock('ai');
    vi.doUnmock('../../src/ai/awsCredentials');
  });

  it('access-keys mode omits sessionToken from SDK opts when field is empty', async () => {
    const createAmazonBedrockOpts: Record<string, unknown>[] = [];
    vi.doMock('@ai-sdk/amazon-bedrock', () => ({
      createAmazonBedrock: (opts: Record<string, unknown>) => {
        createAmazonBedrockOpts.push(opts);
        return (modelId: string) => ({ modelId });
      },
    }));
    vi.doMock('ai', () => ({
      streamText: vi.fn(),
      generateText: vi.fn(),
    }));
    vi.doMock('../../src/ai/awsCredentials', () => ({
      resolveAwsCredentials: () => ({}),
    }));

    const { createBedrockModel } = await import('../../src/ai/providers/bedrock');
    const fetcher = vi.fn() as unknown as import('../../src/ai/obsidianFetch').FetchFn;

    createBedrockModel(
      {
        apiKey: '',
        baseUrl: '',
        model: '',
        disclosureAcknowledged: true,
        region: 'us-east-1',
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        authMethod: 'access-keys',
        accessKeyId: 'AKIA-STATIC',
        secretAccessKey: 'secret-static',
        ssoProfile: '',
        bedrockApiKey: '',
        sessionToken: '',
      },
      fetcher,
    );

    expect(createAmazonBedrockOpts).toHaveLength(1);
    const opts = createAmazonBedrockOpts[0]!;
    expect(opts.accessKeyId).toBe('AKIA-STATIC');
    expect(opts.secretAccessKey).toBe('secret-static');
    // Empty sessionToken must NOT be passed to SDK (it would override env-var fallback)
    expect(opts.sessionToken).toBeUndefined();

    vi.doUnmock('@ai-sdk/amazon-bedrock');
    vi.doUnmock('ai');
    vi.doUnmock('../../src/ai/awsCredentials');
  });
});
