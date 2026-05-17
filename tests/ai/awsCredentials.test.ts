// tests/ai/awsCredentials.test.ts
//
// Phase 08.1 Plan 02 — unit tests for the in-plugin ~/.aws/credentials INI
// parser + the resolveAwsCredentials env-vars-or-file dispatch.
//
// Strategy: stub `activeWindow.require` (the Electron-renderer Node-require
// shim) with a fake fs/path/os triple that returns deterministic content per
// test. Mirrors the precedent in tests/ai/obsidianFetch.test.ts:100-119.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Test harness helpers ──────────────────────────────────────────────────

interface FakeFs {
  readFileSync(path: string, encoding: string): string;
}

function stubNodeModules(opts: { credentialsContent?: string; throwOnRead?: Error }): void {
  const fakeFs: FakeFs = {
    readFileSync(_p: string, _e: string): string {
      if (opts.throwOnRead) throw opts.throwOnRead;
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
    throw new Error(`unexpected require: ${id}`);
  });
  vi.stubGlobal('activeWindow', { require: fakeRequire });
}

const ORIGINAL_ENV = { ...process.env };

function clearAwsEnv(): void {
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
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

// ─── env-or-default-profile dispatch ────────────────────────────────────────

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
      credentialsContent: [
        '[default]',
        'aws_access_key_id = AKIAFROMFILE',
        'aws_secret_access_key = secretfromfile',
      ].join('\n'),
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

// ─── Named profile dispatch ─────────────────────────────────────────────────

describe('Phase 08.1 awsCredentials — named profile dispatch', () => {
  it("reads the [work] section when source: 'profile', profile: 'work'", async () => {
    stubNodeModules({
      credentialsContent: [
        '[default]',
        'aws_access_key_id = AKIA-DEFAULT',
        'aws_secret_access_key = secret-default',
        '',
        '[work]',
        'aws_access_key_id = AKIA-WORK',
        'aws_secret_access_key = secret-work',
        'aws_session_token = work-session-token',
      ].join('\n'),
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-WORK');
    expect(creds.secretAccessKey).toBe('secret-work');
    expect(creds.sessionToken).toBe('work-session-token');
  });

  it('honors `[profile <name>]` config-file syntax for named profiles', async () => {
    stubNodeModules({
      credentialsContent: [
        '[profile work]',
        'aws_access_key_id = AKIA-CONFIG',
        'aws_secret_access_key = secret-config',
      ].join('\n'),
    });
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'profile', profile: 'work' });
    expect(creds.accessKeyId).toBe('AKIA-CONFIG');
    expect(creds.secretAccessKey).toBe('secret-config');
  });

  it('returns empty when the requested profile is missing', async () => {
    stubNodeModules({
      credentialsContent: '[default]\naws_access_key_id = AKIA-DEFAULT',
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

// ─── INI parser edge cases ──────────────────────────────────────────────────

describe('Phase 08.1 awsCredentials — parseIniProfile edge cases', () => {
  it('ignores `#` and `;` comment lines and blank lines', async () => {
    stubNodeModules({
      credentialsContent: [
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
    expect(creds).toEqual({});
  });

  it('returns empty object when nodeRequire shim is unavailable (no activeWindow.require)', async () => {
    // No vi.stubGlobal('activeWindow', ...) — the shim has no fallback.
    // process.env vars are also clear (clearAwsEnv() in beforeEach), so the
    // env path doesn't short-circuit the test.
    const { resolveAwsCredentials } = await import('../../src/ai/awsCredentials');
    const creds = resolveAwsCredentials({ source: 'env-or-default-profile' });
    expect(creds).toEqual({});
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
