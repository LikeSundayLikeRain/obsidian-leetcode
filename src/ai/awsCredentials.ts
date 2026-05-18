// src/ai/awsCredentials.ts
//
// Phase 08.2 Plan 01 — AWS credentials resolver implementing the canonical
// credential chain: env vars -> profile resolution -> file reads ->
// credential_process delegation.
//
// Owned by the plugin because @aws-sdk/credential-providers does NOT bundle
// in esbuild (RESEARCH §Pitfall 5 — pulls node:fs/crypto/os/path/child_process,
// 9 unresolved imports). Used by the bedrock adapter's 'default-chain' and
// 'sso-profile' auth modes.
//
// Node-require shim mirrors src/auth/BrowserWindowLogin.ts:12-22 byte-for-byte
// (S2 shared pattern in 08.1-PATTERNS.md). The project's
// `@typescript-eslint/no-require-imports` lint rule forbids a literal
// `require(...)` call site, so we look up Node's own require via
// `activeWindow.require` / `module.require` / `__webpack_require__` fallbacks.
//
// All filesystem reads are wrapped in try/catch and collapse to an empty
// object on any error (T-08.1-03 mitigation — never leak raw file bytes or
// exception messages; never throw out of the parser). The bedrock adapter
// treats the empty object as "credentials unavailable" and the SDK probe
// surfaces the failure as a connectivity error.
//
// credential_process failures HARD-FAIL (D-05) — they propagate as thrown
// errors. probeBedrock's try/catch collapses them to {ok:false, errorMessage}.

import { getCachedOrRefreshSync, getCachedOrRefresh } from './credentialProcess';

type CjsRequire = (id: string) => unknown;
declare const __webpack_require__: CjsRequire | undefined;

/**
 * Look up Node's `require` from the Electron renderer without typing a
 * literal `require(...)` call. Mirrors src/auth/BrowserWindowLogin.ts:12-22
 * and src/ai/obsidianFetch.ts:43-58 — the only other files in the project
 * that bridge to Node from renderer.
 *
 * Returns undefined (NOT throw) when no require shim is available — callers
 * must handle the missing-runtime case (mobile / sandboxed renderer / etc.).
 */
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Read env-var credentials. Returns null when both required vars are absent.
 */
function readEnvCredentials(): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} | null {
  const e = (typeof process !== 'undefined' ? process.env : {}) as Record<
    string,
    string | undefined
  >;
  if (e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: e.AWS_ACCESS_KEY_ID,
      secretAccessKey: e.AWS_SECRET_ACCESS_KEY,
      sessionToken: e.AWS_SESSION_TOKEN,
    };
  }
  return null;
}

/**
 * Resolve the effective profile name from env vars or literal "default".
 * D-17 step 2: AWS_PROFILE -> AWS_DEFAULT_PROFILE -> "default".
 */
function resolveProfileName(): string {
  const e = (typeof process !== 'undefined' ? process.env : {}) as Record<
    string,
    string | undefined
  >;
  return e.AWS_PROFILE || e.AWS_DEFAULT_PROFILE || 'default';
}

/**
 * Resolve the credentials file path honoring AWS_SHARED_CREDENTIALS_FILE.
 */
function resolveCredentialsPath(): string | null {
  const e = (typeof process !== 'undefined' ? process.env : {}) as Record<
    string,
    string | undefined
  >;
  if (e.AWS_SHARED_CREDENTIALS_FILE) return e.AWS_SHARED_CREDENTIALS_FILE;
  const path = nodeRequire<typeof import('path')>('path');
  const os = nodeRequire<typeof import('os')>('os');
  if (!path || !os) return null;
  return path.join(os.homedir(), '.aws', 'credentials');
}

/**
 * Resolve the config file path honoring AWS_CONFIG_FILE.
 */
function resolveConfigPath(): string | null {
  const e = (typeof process !== 'undefined' ? process.env : {}) as Record<
    string,
    string | undefined
  >;
  if (e.AWS_CONFIG_FILE) return e.AWS_CONFIG_FILE;
  const path = nodeRequire<typeof import('path')>('path');
  const os = nodeRequire<typeof import('os')>('os');
  if (!path || !os) return null;
  return path.join(os.homedir(), '.aws', 'config');
}

/**
 * Safely read a file. Returns empty string on any error (D-18).
 */
export function safeReadFile(filePath: string): string {
  const fs = nodeRequire<typeof import('fs')>('fs');
  if (!fs) return '';
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

interface ParsedSection {
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_session_token?: string;
  credential_process?: string;
  region?: string;
  [key: string]: string | undefined;
}

/**
 * Merge config-file and credentials-file sections per D-17 step 5:
 * - Config wins on `region`
 * - Credentials wins on static keys (aws_access_key_id, aws_secret_access_key, aws_session_token)
 * - `credential_process` can appear in either; credentials-file value takes precedence if both present
 */
function mergeProfileSettings(
  cfgSection: ParsedSection,
  credSection: ParsedSection,
): ParsedSection {
  return {
    // Static keys: credentials file wins
    aws_access_key_id: credSection.aws_access_key_id || cfgSection.aws_access_key_id,
    aws_secret_access_key:
      credSection.aws_secret_access_key || cfgSection.aws_secret_access_key,
    aws_session_token: credSection.aws_session_token || cfgSection.aws_session_token,
    // Region: config wins
    region: cfgSection.region || credSection.region,
    // credential_process: credentials file wins if present in both
    credential_process: credSection.credential_process || cfgSection.credential_process,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve AWS credentials for the bedrock adapter.
 *
 *   source: 'env-or-default-profile'
 *     - first reads process.env.AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
 *       (+ optional AWS_SESSION_TOKEN); returns those when both env vars
 *       are present.
 *     - otherwise resolves profile name via AWS_PROFILE / AWS_DEFAULT_PROFILE /
 *       "default", reads both ~/.aws/credentials and ~/.aws/config, merges
 *       per profile, and either delegates to credential_process or returns
 *       static keys.
 *
 *   source: 'profile' (with profile name)
 *     - skips env vars entirely; reads files for the named profile.
 *
 * Returns an empty object on any failure (missing file, missing fields,
 * Node require unavailable). The empty object collapses to "no credentials"
 * at the SDK call site — Bedrock's probe surfaces it as a connectivity error.
 *
 * credential_process failures HARD-FAIL (D-05) — they propagate as thrown
 * errors. probeBedrock's try/catch collapses them to {ok:false, errorMessage}.
 */
export function resolveAwsCredentials(
  opts:
    | { source: 'env-or-default-profile' }
    | { source: 'profile'; profile: string },
): { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string } {
  // 1. Env vars first (default-chain only — D-17 step 1).
  if (opts.source === 'env-or-default-profile') {
    const envCreds = readEnvCredentials();
    if (envCreds) return envCreds;
  }

  // 2. Profile name resolution (D-17 step 2).
  const profileName =
    opts.source === 'profile' ? opts.profile : resolveProfileName();

  // 3. Read credentials file (D-17 step 3).
  const credPath = resolveCredentialsPath();
  const credText = credPath ? safeReadFile(credPath) : '';
  const credSection = parseIniSection(credText, profileName, 'credentials');

  // 4. Read config file (D-17 step 4).
  const cfgPath = resolveConfigPath();
  const cfgText = cfgPath ? safeReadFile(cfgPath) : '';
  const cfgSection = parseIniSection(cfgText, profileName, 'config');

  // 5. Merge (D-17 step 5).
  const merged = mergeProfileSettings(cfgSection, credSection);

  // 6. Per-profile resolution (D-17 step 6).
  if (merged.credential_process) {
    // credential_process present -> delegate to sync cache+spawn helper.
    // Hard-fails on error (D-05); probeBedrock's try/catch collapses it.
    const result = getCachedOrRefreshSync(profileName, merged.credential_process);
    return {
      accessKeyId: result.accessKeyId,
      secretAccessKey: result.secretAccessKey,
      sessionToken: result.sessionToken,
    };
  }

  // Static keys fallback.
  return {
    accessKeyId: merged.aws_access_key_id,
    secretAccessKey: merged.aws_secret_access_key,
    sessionToken: merged.aws_session_token,
  };
}

/**
 * Async version of resolveAwsCredentials — uses execFile (non-blocking)
 * for credential_process instead of spawnSync. Does not freeze the UI.
 */
export async function resolveAwsCredentialsAsync(
  opts:
    | { source: 'env-or-default-profile' }
    | { source: 'profile'; profile: string },
): Promise<{ accessKeyId?: string; secretAccessKey?: string; sessionToken?: string }> {
  if (opts.source === 'env-or-default-profile') {
    const envCreds = readEnvCredentials();
    if (envCreds) return envCreds;
  }
  const profileName =
    opts.source === 'profile' ? opts.profile : resolveProfileName();
  const credPath = resolveCredentialsPath();
  const credText = credPath ? safeReadFile(credPath) : '';
  const credSection = parseIniSection(credText, profileName, 'credentials');
  const cfgPath = resolveConfigPath();
  const cfgText = cfgPath ? safeReadFile(cfgPath) : '';
  const cfgSection = parseIniSection(cfgText, profileName, 'config');
  const merged = mergeProfileSettings(cfgSection, credSection);

  if (merged.credential_process) {
    const result = await getCachedOrRefresh(profileName, merged.credential_process);
    return {
      accessKeyId: result.accessKeyId,
      secretAccessKey: result.secretAccessKey,
      sessionToken: result.sessionToken,
    };
  }
  return {
    accessKeyId: merged.aws_access_key_id,
    secretAccessKey: merged.aws_secret_access_key,
    sessionToken: merged.aws_session_token,
  };
}

/**
 * Parse an INI section from either a credentials file or config file.
 *
 * Credentials file uses bare `[<name>]` headers.
 * Config file uses `[profile <name>]` headers, with the exception that
 * the default profile uses bare `[default]` (not `[profile default]`).
 */
function parseIniSection(
  text: string,
  profile: string,
  fileType: 'credentials' | 'config',
): ParsedSection {
  if (!text) return {};
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const out: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const name = trimmed.slice(1, -1).trim();
      if (fileType === 'credentials') {
        // Credentials file: bare [<name>]
        inSection = name === profile;
      } else {
        // Config file: [profile <name>] or bare [default] for default profile
        if (profile === 'default') {
          inSection = name === 'default' || name === 'profile default';
        } else {
          inSection = name === `profile ${profile}`;
        }
      }
      continue;
    }
    if (inSection) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
  }
  return out;
}

/**
 * Minimal INI parser scoped to a single profile section. Handles both
 * bare-name section headers (the canonical credentials-file format) and
 * `[profile <name>]` headers (the config-file format). Comments via `#` or
 * `;` and blank lines are ignored. Values are trimmed.
 *
 * Exported for unit testing — production callers go through
 * `resolveAwsCredentials`.
 */
export function parseIniProfile(
  text: string,
  profile: string,
): { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string; credential_process?: string; region?: string } {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const out: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const name = trimmed.slice(1, -1).trim();
      inSection = name === profile || name === `profile ${profile}`;
      continue;
    }
    if (inSection) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
  }
  return {
    accessKeyId: out.aws_access_key_id,
    secretAccessKey: out.aws_secret_access_key,
    sessionToken: out.aws_session_token,
    credential_process: out.credential_process,
    region: out.region,
  };
}
