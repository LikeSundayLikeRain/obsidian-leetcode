/**
 * Logger that redacts any object key matching /session|csrf|cookie|token/i.
 * MUST be used for any contextual logging that might carry auth objects.
 * Direct `console.*` calls with auth values are forbidden (enforced by grep gate).
 *
 * Note: this file is the canonical logging wrapper — the obsidianmd/no-console
 * rule is intentionally disabled here because the whole point of the module is
 * to funnel console output through a redacting facade.
 */
/* eslint-disable obsidianmd/rule-custom-message */
const REDACT = /session|csrf|cookie|token/i;
// Value-level redaction pattern: auth-ish kv pairs embedded in error messages,
// stack traces, or config/request/response strings. e.g. "LEETCODE_SESSION=xyz"
// or "Cookie: csrftoken=abc". We redact the value while keeping the key visible
// for debugging context (AUTH-06 — cookies never logged in plaintext).
const SECRET_VALUE_PATTERN = /\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization)\s*[=:]\s*[^\s;,"'&}\]]+/gi;

function redactString(s: string): string {
  return s.replace(SECRET_VALUE_PATTERN, (_m, key: string) => `${key}=[REDACTED]`);
}

function redact(obj: unknown, depth = 0): unknown {
  // Bound recursion depth to prevent runaway walks on pathologically deep or
  // cyclic payloads. Three levels is enough to reach err.config.headers.Cookie
  // without turning logging into a perf hazard.
  if (depth > 3) return obj;
  if (typeof obj === 'string') return redactString(obj);
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  // Unwrap Error so its enumerable-equivalent message/stack surface for redaction.
  // `Error` properties (message, stack, name) are non-enumerable, so a naive
  // Object.entries(err) returns [] and the Error passes through unredacted.
  const isError = obj instanceof Error;
  const plain: Record<string, unknown> = isError
    ? {
        name: obj.name,
        message: obj.message,
        stack: obj.stack,
        ...(obj as unknown as Record<string, unknown>),
      }
    : (obj as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plain)) {
    if (REDACT.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      out[k] = redactString(v);
    } else if (v && typeof v === 'object') {
      out[k] = redact(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const logger = {
  debug: (msg: string, ctx?: unknown): void => {
    console.debug(`[leetcode] ${msg}`, ctx !== undefined ? redact(ctx) : '');
  },
  info: (msg: string, ctx?: unknown): void => {
    console.info(`[leetcode] ${msg}`, ctx !== undefined ? redact(ctx) : '');
  },
  warn: (msg: string, ctx?: unknown): void => {
    console.warn(`[leetcode] ${msg}`, ctx !== undefined ? redact(ctx) : '');
  },
  error: (msg: string, err?: unknown): void => {
    // Route through redact to satisfy AUTH-06; error objects carry request configs
    // that may include Authorization / Cookie headers, and error messages sometimes
    // embed raw cookie strings (e.g. "request failed: LEETCODE_SESSION=xyz").
    console.error(`[leetcode] ${msg}`, err !== undefined ? redact(err) : '');
  },
};
