/**
 * Logger that redacts any object key matching /session|csrf|cookie|token/i.
 * MUST be used for any contextual logging that might carry auth objects.
 * Direct `console.*` calls with auth values are forbidden (enforced by grep gate).
 */
const REDACT = /session|csrf|cookie|token/i;

function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? '[REDACTED]' : v;
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
    console.error(`[leetcode] ${msg}`, err);
  },
};
