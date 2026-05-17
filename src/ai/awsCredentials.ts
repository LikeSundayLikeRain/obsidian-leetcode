// src/ai/awsCredentials.ts
//
// Phase 08.1 Plan 02 — AWS credentials INI-file reader.
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

/**
 * Resolve AWS credentials for the bedrock adapter.
 *
 *   source: 'env-or-default-profile'
 *     - first reads process.env.AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
 *       (+ optional AWS_SESSION_TOKEN); returns those when both env vars
 *       are present.
 *     - otherwise parses ~/.aws/credentials [default] section.
 *
 *   source: 'profile' (with profile name)
 *     - parses ~/.aws/credentials [<name>] section (or [profile <name>]
 *       config-file syntax).
 *
 * Returns an empty object on any failure (missing file, missing fields,
 * Node require unavailable). The empty object collapses to "no credentials"
 * at the SDK call site — Bedrock's probe surfaces it as a connectivity error.
 */
export function resolveAwsCredentials(
  opts:
    | { source: 'env-or-default-profile' }
    | { source: 'profile'; profile: string },
): { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string } {
  // 1. Env vars first (default-chain only).
  if (opts.source === 'env-or-default-profile') {
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
  }
  // 2. ~/.aws/credentials INI parse.
  const fs = nodeRequire<typeof import('fs')>('fs');
  const path = nodeRequire<typeof import('path')>('path');
  const os = nodeRequire<typeof import('os')>('os');
  if (!fs || !path || !os) return {};
  try {
    const credPath = path.join(os.homedir(), '.aws', 'credentials');
    const text = fs.readFileSync(credPath, 'utf8');
    const profile = opts.source === 'profile' ? opts.profile : 'default';
    return parseIniProfile(text, profile);
  } catch {
    return {};
  }
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
): { accessKeyId?: string; secretAccessKey?: string; sessionToken?: string } {
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
  };
}
