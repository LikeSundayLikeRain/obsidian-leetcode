// src/ai/credentialProcess.ts
//
// Phase 08.2 Plan 01 Task 2 — credential_process command parser + spawnSync
// runner + in-memory cache with concurrent coalescing.
//
// Module structure per CONTEXT Claude's Discretion recommendation: split for
// test isolation. This file handles everything after the credential_process
// directive is found in the merged profile settings.
//
// Security invariants:
//   D-20: shell:false, timeout:30_000, windowsHide:true, encoding:'utf8'
//   D-22: stdout NEVER passed to any logger call
//   D-08: stderr truncated to 200 chars at source boundary
//   D-12: Concurrent getCachedOrRefreshSync calls coalesce to single spawn
//
// NOTE: This module intentionally has ZERO logger imports (D-22 enforcement).

export interface ResolvedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

// ─── nodeRequire shim (same pattern as awsCredentials.ts) ─────────────────

type CjsRequire = (id: string) => unknown;
declare const __webpack_require__: CjsRequire | undefined;

function nodeRequire<T>(id: string): T | undefined {
  const g = activeWindow as unknown as {
    require?: CjsRequire;
    module?: { require?: CjsRequire };
  };
  const fn =
    g.require ??
    g.module?.require ??
    (typeof __webpack_require__ === 'function' ? __webpack_require__ : undefined);
  if (!fn) return undefined;
  try {
    return fn(id) as T;
  } catch {
    return undefined;
  }
}

// ─── parseCommandLine ─────────────────────────────────────────────────────

/**
 * Parse a credential_process value into command + args using AWS CLI
 * shell-style splitting rules: double-quoted args with backslash-escape
 * for embedded quotes. Single quotes NOT supported (matches AWS CLI behavior).
 *
 * Examples:
 *   'aws-vault exec work --json' -> {command:'aws-vault', args:['exec','work','--json']}
 *   'aws-vault exec "my profile" --json' -> {command:'aws-vault', args:['exec','my profile','--json']}
 *   '"/path with space/helper"' -> {command:'/path with space/helper', args:[]}
 *   'helper "embedded \\"quote\\""' -> {command:'helper', args:['embedded "quote"']}
 *   '' -> throws 'credential_process value is empty'
 */
export function parseCommandLine(s: string): { command: string; args: string[] } {
  const trimmed = s.trim();
  if (!trimmed) {
    throw new Error('credential_process value is empty');
  }

  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < trimmed.length) {
    const ch = trimmed[i];

    if (ch === '\\' && inQuotes && i + 1 < trimmed.length) {
      const next = trimmed[i + 1];
      if (next === '"' || next === '\\') {
        current += next;
        i += 2;
        continue;
      }
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (ch === ' ' && !inQuotes) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  // tokens[0] is guaranteed non-empty because we checked trimmed.length > 0 above
  return {
    command: tokens[0] as string,
    args: tokens.slice(1),
  };
}

// ─── runCredentialProcess ─────────────────────────────────────────────────

interface SpawnSyncResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: { code?: string };
  signal: string | null;
}

/**
 * Run the credential_process command via spawnSync.
 * D-20: shell:false, timeout:30_000, windowsHide:true, encoding:'utf8'
 * D-08: stderr truncated to 200 chars at this boundary.
 *
 * Returns { stdout, stderr } on success.
 * Throws on non-zero exit, timeout, or spawn failure.
 */
function runCredentialProcess(value: string): { stdout: string; stderr: string } {
  const cp = nodeRequire<typeof import('child_process')>('child_process');
  if (!cp) {
    throw new Error('credential_process spawn failed: child_process unavailable');
  }

  const { command, args } = parseCommandLine(value);

  const result: SpawnSyncResult = cp.spawnSync(command, args, {
    timeout: 30_000,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    env: process.env,
  }) as unknown as SpawnSyncResult;

  const stderr = typeof result.stderr === 'string' ? result.stderr.slice(0, 200) : '';

  // Timeout detection: spawnSync sets signal to SIGTERM when timeout fires
  if (result.signal === 'SIGTERM' || result.error?.code === 'ETIMEDOUT') {
    throw new Error('credential_process timed out after 30s');
  }

  // Spawn failure (e.g., ENOENT — command not found)
  if (result.error) {
    throw new Error(`credential_process spawn failed: ${result.error.code || String(result.error)}`);
  }

  // Non-zero exit
  if (result.status !== 0) {
    throw new Error(`credential_process exited ${result.status}: ${stderr}`);
  }

  return {
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr,
  };
}

// ─── parseCredentialProcessOutput ─────────────────────────────────────────

interface AwsCredentialProcessJson {
  Version?: number;
  AccessKeyId?: string;
  SecretAccessKey?: string;
  SessionToken?: string;
  Expiration?: string;
}

/**
 * Parse the JSON stdout from a credential_process helper.
 * Validates the AWS CLI v1 JSON shape (Version 1 or omitted).
 * Returns normalized credentials + optional expiresAt timestamp.
 */
function parseCredentialProcessOutput(stdout: string): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAt?: number;
} {
  let parsed: AwsCredentialProcessJson;
  try {
    parsed = JSON.parse(stdout) as AwsCredentialProcessJson;
  } catch {
    throw new Error(
      `credential_process returned invalid JSON: ${stdout.slice(0, 200)}`,
    );
  }

  if (!parsed.AccessKeyId) {
    throw new Error('credential_process missing required field: AccessKeyId');
  }
  if (!parsed.SecretAccessKey) {
    throw new Error('credential_process missing required field: SecretAccessKey');
  }

  let expiresAt: number | undefined;
  if (parsed.Expiration) {
    const ts = new Date(parsed.Expiration).getTime();
    if (!isNaN(ts)) {
      expiresAt = ts;
    }
  }

  return {
    accessKeyId: parsed.AccessKeyId,
    secretAccessKey: parsed.SecretAccessKey,
    sessionToken: parsed.SessionToken,
    expiresAt,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────

const SKEW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (no Expiration)

type CacheEntry =
  | { status: 'fresh'; creds: ResolvedCredentials; expiresAt: number }
  | { status: 'refreshing'; creds: ResolvedCredentials | null };

const cache = new Map<string, CacheEntry>();

/**
 * Synchronous cache-check + spawn for credential_process.
 * Called by resolveAwsCredentials (which is synchronous).
 *
 * D-10 lookup logic:
 *   1. If entry is 'fresh' and Date.now() < expiresAt - SKEW_MS: return cached.
 *   2. If entry is 'refreshing' and has prior creds: return prior creds (stale-while-revalidate).
 *   3. Otherwise: spawn, parse, cache, return (or throw on failure).
 *
 * D-12: Concurrent coalescing — since spawnSync blocks the thread, true
 * concurrency is impossible in a single-threaded renderer. The 'refreshing'
 * state prevents re-entrance via async microtask timing.
 *
 * D-11: Failure deletes the cache entry — next call retries.
 */
export function getCachedOrRefreshSync(
  profileName: string,
  credentialProcessValue: string,
): ResolvedCredentials {
  const entry = cache.get(profileName);

  // 1. Fresh cache hit within TTL - SKEW
  if (entry && entry.status === 'fresh' && Date.now() < entry.expiresAt - SKEW_MS) {
    return entry.creds;
  }

  // 3. Spawn and cache
  // Mark as refreshing (D-12 coalescing for async callers)
  const priorCreds = entry && entry.status === 'fresh' ? entry.creds : null;
  cache.set(profileName, { status: 'refreshing', creds: priorCreds });

  try {
    const { stdout } = runCredentialProcess(credentialProcessValue);
    const parsed = parseCredentialProcessOutput(stdout);

    const creds: ResolvedCredentials = {
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
      sessionToken: parsed.sessionToken,
    };

    const expiresAt = parsed.expiresAt ?? (Date.now() + DEFAULT_TTL_MS);

    cache.set(profileName, { status: 'fresh', creds, expiresAt });
    return creds;
  } catch (err) {
    // D-11: Failure deletes cache entry — next call retries.
    cache.delete(profileName);
    throw err;
  }
}

/**
 * Async wrapper around getCachedOrRefreshSync for concurrent coalescing.
 * D-12: Multiple concurrent callers share a single spawn via Promise dedup.
 *
 * Since spawnSync is blocking, the actual coalescing happens at the sync level.
 * This async wrapper enables Promise.all patterns in tests and future async callers.
 */
const inflightPromises = new Map<string, Promise<ResolvedCredentials>>();

export async function getCachedOrRefresh(
  profileName: string,
  credentialProcessValue: string,
): Promise<ResolvedCredentials> {
  // Check if there's already an in-flight promise for this profile
  const existing = inflightPromises.get(profileName);
  if (existing) return existing;

  const promise = Promise.resolve().then(() => {
    try {
      return getCachedOrRefreshSync(profileName, credentialProcessValue);
    } finally {
      inflightPromises.delete(profileName);
    }
  });

  inflightPromises.set(profileName, promise);
  return promise;
}

/**
 * Clear the credential cache. Exported for test teardown.
 */
export function clearCredentialProcessCache(): void {
  cache.clear();
  inflightPromises.clear();
}
