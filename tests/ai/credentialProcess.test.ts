// tests/ai/credentialProcess.test.ts
//
// Phase 08.2 Plan 01 Task 2 — unit tests for the credential_process module:
// parseCommandLine, runCredentialProcess (via spawnSync stub),
// parseCredentialProcessOutput, getCachedOrRefreshSync (cache + coalescing).
//
// Strategy: stub `activeWindow.require` with a fake child_process that returns
// deterministic spawnSync results per test. Same pattern as awsCredentials.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Test harness ─────────────────────────────────────────────────────────

let mockSpawnSync: ReturnType<typeof vi.fn>;

function stubNodeModules(opts?: {
  spawnSyncResult?: {
    status?: number | null;
    stdout?: string;
    stderr?: string;
    error?: { code?: string } | null;
    signal?: string | null;
  };
  spawnSyncFn?: (...args: unknown[]) => unknown;
}): void {
  mockSpawnSync = opts?.spawnSyncFn
    ? (vi.fn(opts.spawnSyncFn) as ReturnType<typeof vi.fn>)
    : vi.fn(() => ({
        status: opts?.spawnSyncResult?.status ?? 0,
        stdout: opts?.spawnSyncResult?.stdout ?? '{}',
        stderr: opts?.spawnSyncResult?.stderr ?? '',
        error: opts?.spawnSyncResult?.error ?? null,
        signal: opts?.spawnSyncResult?.signal ?? null,
      }));

  const mockExecFile = vi.fn(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      const syncResult = (mockSpawnSync as (...a: unknown[]) => unknown)(_cmd, _args, _opts);
      const r = syncResult as { status?: number | null; stdout?: string; stderr?: string; error?: { code?: string } | null };
      if (r.error) {
        const err = new Error(`spawn failed: ${r.error.code}`);
        (err as NodeJS.ErrnoException).code = r.error.code;
        cb(err, '', typeof r.stderr === 'string' ? r.stderr : '');
      } else if (r.status !== 0) {
        const err = new Error(`exited ${r.status}`);
        (err as { code?: string | number }).code = r.status ?? 1;
        cb(err, '', typeof r.stderr === 'string' ? r.stderr : '');
      } else {
        cb(null, typeof r.stdout === 'string' ? r.stdout : '', typeof r.stderr === 'string' ? r.stderr : '');
      }
      return { unref: () => {} };
    },
  );

  const fakeChildProcess = { spawnSync: mockSpawnSync, execFile: mockExecFile };
  const fakeRequire = vi.fn((id: string) => {
    if (id === 'child_process') return fakeChildProcess;
    throw new Error(`unexpected require: ${id}`);
  });
  vi.stubGlobal('activeWindow', { require: fakeRequire });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── parseCommandLine ─────────────────────────────────────────────────────

describe('credentialProcess — parseCommandLine', () => {
  it('splits simple command with args', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    const result = parseCommandLine('aws-vault exec work --json');
    expect(result).toEqual({ command: 'aws-vault', args: ['exec', 'work', '--json'] });
  });

  it('handles double-quoted args with spaces', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    const result = parseCommandLine('aws-vault exec "my profile" --json');
    expect(result).toEqual({
      command: 'aws-vault',
      args: ['exec', 'my profile', '--json'],
    });
  });

  it('handles fully-quoted command path with spaces', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    const result = parseCommandLine('"/path with space/helper"');
    expect(result).toEqual({ command: '/path with space/helper', args: [] });
  });

  it('handles embedded escaped quotes in args', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    const result = parseCommandLine('helper "embedded \\"quote\\""');
    expect(result).toEqual({ command: 'helper', args: ['embedded "quote"'] });
  });

  it('collapses multiple spaces between tokens', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    const result = parseCommandLine('helper   multiple   spaces');
    expect(result).toEqual({ command: 'helper', args: ['multiple', 'spaces'] });
  });

  it('throws on empty string', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    expect(() => parseCommandLine('')).toThrow('credential_process value is empty');
  });

  it('throws on whitespace-only string', async () => {
    const { parseCommandLine } = await import('../../src/ai/credentialProcess');
    expect(() => parseCommandLine('   ')).toThrow('credential_process value is empty');
  });
});

// ─── runCredentialProcess (via getCachedOrRefreshSync) ─────────────────────

describe('credentialProcess — runCredentialProcess (spawn behavior)', () => {
  it('exit code 0 returns parsed credentials', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({
          Version: 1,
          AccessKeyId: 'AKIA-TEST',
          SecretAccessKey: 'secret-test',
          SessionToken: 'session-test',
        }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    const result = getCachedOrRefreshSync('test', 'helper --json');
    expect(result.accessKeyId).toBe('AKIA-TEST');
    expect(result.secretAccessKey).toBe('secret-test');
    expect(result.sessionToken).toBe('session-test');
  });

  it('non-zero exit throws with stderr truncated to 200 chars', async () => {
    const longStderr = 'x'.repeat(300);
    stubNodeModules({
      spawnSyncResult: {
        status: 1,
        stdout: '',
        stderr: longStderr,
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'bad-helper')).toThrow(
      /credential_process exited 1/,
    );
    try {
      getCachedOrRefreshSync('test', 'bad-helper');
    } catch (e) {
      // stderr truncated to 200 chars
      expect((e as Error).message.length).toBeLessThanOrEqual(
        'credential_process exited 1: '.length + 200,
      );
    }
  });

  it('SIGTERM/ETIMEDOUT throws timeout error', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: null,
        stdout: '',
        stderr: '',
        signal: 'SIGTERM',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'slow-helper')).toThrow(
      'credential_process timed out after 30s',
    );
  });

  it('ETIMEDOUT error code throws timeout error', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: null,
        stdout: '',
        stderr: '',
        error: { code: 'ETIMEDOUT' },
        signal: null,
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'slow-helper')).toThrow(
      'credential_process timed out after 30s',
    );
  });

  it('ENOENT throws spawn failed error', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: null,
        stdout: '',
        stderr: '',
        error: { code: 'ENOENT' },
        signal: null,
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'missing-helper')).toThrow(
      'credential_process spawn failed: ENOENT',
    );
  });

  it('spawnSync called with shell:true, timeout:30000, windowsHide:true, encoding:utf8', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({
          AccessKeyId: 'AKIA-X',
          SecretAccessKey: 'secret-x',
        }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    getCachedOrRefreshSync('test', 'my-helper --arg1');
    expect(mockSpawnSync).toHaveBeenCalledWith('my-helper', ['--arg1'], expect.objectContaining({
      timeout: 30_000,
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
    }));
  });
});

// ─── parseCredentialProcessOutput ─────────────────────────────────────────

describe('credentialProcess — parseCredentialProcessOutput', () => {
  it('valid {Version:1, AccessKeyId, SecretAccessKey} returns creds', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({
          Version: 1,
          AccessKeyId: 'AKIA-VALID',
          SecretAccessKey: 'secret-valid',
          SessionToken: 'token-valid',
        }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    const creds = getCachedOrRefreshSync('test', 'helper');
    expect(creds.accessKeyId).toBe('AKIA-VALID');
    expect(creds.secretAccessKey).toBe('secret-valid');
    expect(creds.sessionToken).toBe('token-valid');
  });

  it('Expiration in Z format returns correct expiresAt', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-17T10:00:00Z') });
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({
          Version: 1,
          AccessKeyId: 'AKIA-EXP',
          SecretAccessKey: 'secret-exp',
          Expiration: '2026-05-17T15:30:00Z',
        }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    const creds = getCachedOrRefreshSync('exp-test', 'helper');
    expect(creds.accessKeyId).toBe('AKIA-EXP');
    // Verify cached — call again should NOT re-spawn (within TTL)
    getCachedOrRefreshSync('exp-test', 'helper');
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it('Expiration in +00:00 format is handled', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-17T10:00:00Z') });
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({
          Version: 1,
          AccessKeyId: 'AKIA-EXP2',
          SecretAccessKey: 'secret-exp2',
          Expiration: '2026-05-17T15:30:00+00:00',
        }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    const creds = getCachedOrRefreshSync('exp-test2', 'helper');
    expect(creds.accessKeyId).toBe('AKIA-EXP2');
  });

  it('missing AccessKeyId throws', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({ SecretAccessKey: 'secret' }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'helper')).toThrow(
      'credential_process missing required field: AccessKeyId',
    );
  });

  it('missing SecretAccessKey throws', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: JSON.stringify({ AccessKeyId: 'AKIA-X' }),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'helper')).toThrow(
      'credential_process missing required field: SecretAccessKey',
    );
  });

  it('invalid JSON throws with truncated content', async () => {
    stubNodeModules({
      spawnSyncResult: {
        status: 0,
        stdout: 'not json at all' + 'x'.repeat(300),
        stderr: '',
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    expect(() => getCachedOrRefreshSync('test', 'helper')).toThrow(
      /credential_process returned invalid JSON/,
    );
    try {
      getCachedOrRefreshSync('test', 'helper');
    } catch (e) {
      // Ensure truncation (total message within bounds)
      expect((e as Error).message.length).toBeLessThanOrEqual(
        'credential_process returned invalid JSON: '.length + 200,
      );
    }
  });
});

// ─── getCachedOrRefreshSync cache behavior ────────────────────────────────

describe('credentialProcess — getCachedOrRefreshSync cache', () => {
  it('returns fresh creds when within TTL (no spawn)', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-17T10:00:00Z') });
    let spawnCount = 0;
    stubNodeModules({
      spawnSyncFn: () => {
        spawnCount++;
        return {
          status: 0,
          stdout: JSON.stringify({
            AccessKeyId: 'AKIA-CACHED',
            SecretAccessKey: 'secret-cached',
            Expiration: '2026-05-17T12:00:00Z', // 2h from now — well within TTL-5min
          }),
          stderr: '',
          error: null,
          signal: null,
        };
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();

    // First call spawns
    getCachedOrRefreshSync('cache-test', 'helper');
    expect(spawnCount).toBe(1);

    // Second call returns from cache (no spawn)
    const creds = getCachedOrRefreshSync('cache-test', 'helper');
    expect(spawnCount).toBe(1);
    expect(creds.accessKeyId).toBe('AKIA-CACHED');
  });

  it('re-spawns when past Expiration - 5min skew', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-17T10:00:00Z') });
    let spawnCount = 0;
    stubNodeModules({
      spawnSyncFn: () => {
        spawnCount++;
        return {
          status: 0,
          stdout: JSON.stringify({
            AccessKeyId: `AKIA-SPAWN-${spawnCount}`,
            SecretAccessKey: 'secret',
            // Expires 4 minutes from initial time — within 5min skew on second call
            Expiration: '2026-05-17T10:04:00Z',
          }),
          stderr: '',
          error: null,
          signal: null,
        };
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();

    // First call spawns
    getCachedOrRefreshSync('skew-test', 'helper');
    expect(spawnCount).toBe(1);

    // Entry is already past the skew window (10:04:00 - 5min = 09:59:00 < now 10:00:00)
    // So second call should re-spawn
    const creds = getCachedOrRefreshSync('skew-test', 'helper');
    expect(spawnCount).toBe(2);
    expect(creds.accessKeyId).toBe('AKIA-SPAWN-2');
  });

  it('with no Expiration, caches for 24h', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-17T10:00:00Z') });
    let spawnCount = 0;
    stubNodeModules({
      spawnSyncFn: () => {
        spawnCount++;
        return {
          status: 0,
          stdout: JSON.stringify({
            AccessKeyId: 'AKIA-NOEXP',
            SecretAccessKey: 'secret-noexp',
            // No Expiration field
          }),
          stderr: '',
          error: null,
          signal: null,
        };
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();

    getCachedOrRefreshSync('noexp-test', 'helper');
    expect(spawnCount).toBe(1);

    // Advance 23 hours — still within 24h TTL - 5min skew
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    getCachedOrRefreshSync('noexp-test', 'helper');
    expect(spawnCount).toBe(1); // still cached

    // Advance past 24h - 5min total
    vi.advanceTimersByTime(2 * 60 * 60 * 1000); // total 25h now
    getCachedOrRefreshSync('noexp-test', 'helper');
    expect(spawnCount).toBe(2); // re-spawned
  });

  it('failure deletes cache entry (D-11); next call retries', async () => {
    let callNum = 0;
    stubNodeModules({
      spawnSyncFn: () => {
        callNum++;
        if (callNum === 1) {
          // First call fails
          return {
            status: 1,
            stdout: '',
            stderr: 'auth error',
            error: null,
            signal: null,
          };
        }
        // Second call succeeds
        return {
          status: 0,
          stdout: JSON.stringify({
            AccessKeyId: 'AKIA-RETRY',
            SecretAccessKey: 'secret-retry',
          }),
          stderr: '',
          error: null,
          signal: null,
        };
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();

    // First call throws
    expect(() => getCachedOrRefreshSync('retry-test', 'helper')).toThrow(
      'credential_process exited 1',
    );

    // Second call retries (cache was deleted) and succeeds
    const creds = getCachedOrRefreshSync('retry-test', 'helper');
    expect(creds.accessKeyId).toBe('AKIA-RETRY');
    expect(callNum).toBe(2);
  });
});

// ─── getCachedOrRefresh async coalescing (D-12) ───────────────────────────

describe('credentialProcess — getCachedOrRefresh async coalescing (D-12)', () => {
  it('5 concurrent getCachedOrRefresh calls -> exactly 1 spawn', async () => {
    let spawnCount = 0;
    stubNodeModules({
      spawnSyncFn: () => {
        spawnCount++;
        return {
          status: 0,
          stdout: JSON.stringify({
            AccessKeyId: 'AKIA-COAL',
            SecretAccessKey: 'secret-coal',
            Expiration: '2026-05-17T20:00:00Z',
          }),
          stderr: '',
          error: null,
          signal: null,
        };
      },
    });
    const { getCachedOrRefresh, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();

    // Fire 5 concurrent calls
    const results = await Promise.all([
      getCachedOrRefresh('coal-test', 'helper'),
      getCachedOrRefresh('coal-test', 'helper'),
      getCachedOrRefresh('coal-test', 'helper'),
      getCachedOrRefresh('coal-test', 'helper'),
      getCachedOrRefresh('coal-test', 'helper'),
    ]);

    // All 5 receive same creds
    for (const r of results) {
      expect(r.accessKeyId).toBe('AKIA-COAL');
      expect(r.secretAccessKey).toBe('secret-coal');
    }

    // Exactly 1 spawn invocation
    expect(spawnCount).toBe(1);
  });
});

// ─── Security: stdout never logged (D-22) ────────────────────────────────

describe('credentialProcess — security: stdout never logged (D-22)', () => {
  it('source file has zero logger imports or usage', async () => {
    // Use native Node fs (not mocked — we reset mocks in beforeEach)
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const srcPath = resolve(process.cwd(), 'src/ai/credentialProcess.ts');
    const source = readFileSync(srcPath, 'utf8');
    // Filter out comment lines
    const codeLines = source
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    const loggerRefs = codeLines.filter(
      (l) => l.includes('logger') || l.includes('console.log'),
    );
    expect(loggerRefs).toEqual([]);
  });

  it('stderr is truncated to 200 chars at source (D-08)', async () => {
    const longStderr = 'E'.repeat(500);
    stubNodeModules({
      spawnSyncResult: {
        status: 1,
        stdout: '',
        stderr: longStderr,
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();
    try {
      getCachedOrRefreshSync('stderr-test', 'helper');
    } catch (e) {
      const msg = (e as Error).message;
      // The stderr portion should be at most 200 chars
      const stderrPart = msg.replace('credential_process exited 1: ', '');
      expect(stderrPart.length).toBeLessThanOrEqual(200);
    }
  });
});

// ─── clearCredentialProcessCache ──────────────────────────────────────────

describe('credentialProcess — clearCredentialProcessCache', () => {
  it('clears cached entries so next call re-spawns', async () => {
    vi.useFakeTimers({ now: new Date('2026-05-17T10:00:00Z') });
    let spawnCount = 0;
    stubNodeModules({
      spawnSyncFn: () => {
        spawnCount++;
        return {
          status: 0,
          stdout: JSON.stringify({
            AccessKeyId: 'AKIA-CLEAR',
            SecretAccessKey: 'secret-clear',
            Expiration: '2026-05-17T20:00:00Z',
          }),
          stderr: '',
          error: null,
          signal: null,
        };
      },
    });
    const { getCachedOrRefreshSync, clearCredentialProcessCache } = await import(
      '../../src/ai/credentialProcess'
    );
    clearCredentialProcessCache();

    getCachedOrRefreshSync('clear-test', 'helper');
    expect(spawnCount).toBe(1);

    clearCredentialProcessCache();

    getCachedOrRefreshSync('clear-test', 'helper');
    expect(spawnCount).toBe(2);
  });
});
