// tests/shared/logger.test.ts
// Phase 07 Plan 01 Task 3 — extends logger redaction to cover AI key fields
// (apiKey / api_key / api-key / x-api-key) and Authorization-header values
// (Bearer tokens). T-07-05 mitigation: this test landed BEFORE Plan 07-02
// imports any provider adapter that may surface raw AI keys in error logs.
//
// v1.0 redaction tests (in tests/logger-redact.test.ts) MUST still pass —
// Category 3 below double-checks LEETCODE_SESSION + csrftoken redaction in
// the same suite to make a regression impossible to miss.

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { logger } from '../../src/shared/logger';

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

function captured(): string {
  // JSON-serialize ALL warn calls so nested objects + Error redactions are
  // visible to substring assertions. Whitespace is unimportant; we only care
  // whether secret strings survive the redaction pipeline.
  return JSON.stringify(warnSpy.mock.calls);
}

describe('Phase 07 logger Category 1 — REDACT key-name redaction', () => {
  it('redacts a top-level apiKey field', () => {
    logger.warn('ctx', { apiKey: 'sk-ant-xyz' });
    const out = captured();
    expect(out).not.toContain('sk-ant-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts a top-level api_key field (snake_case)', () => {
    logger.warn('ctx', { api_key: 'sk-snake-xyz' });
    const out = captured();
    expect(out).not.toContain('sk-snake-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts an x-api-key header object key', () => {
    logger.warn('ctx', { headers: { 'x-api-key': 'sk-ant-xyz' } });
    const out = captured();
    expect(out).not.toContain('sk-ant-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts deeply nested providerConfigs.anthropic.apiKey', () => {
    logger.warn('ctx', {
      providerConfigs: { anthropic: { apiKey: 'sk-ant-deep' } },
    });
    const out = captured();
    expect(out).not.toContain('sk-ant-deep');
    expect(out).toContain('[REDACTED]');
  });

  it('does NOT redact a model field', () => {
    logger.warn('ctx', { model: 'claude-haiku-4-5' });
    const out = captured();
    expect(out).toContain('claude-haiku-4-5');
  });

  it('does NOT redact a baseUrl field', () => {
    logger.warn('ctx', { baseUrl: 'https://api.anthropic.com/v1' });
    const out = captured();
    expect(out).toContain('https://api.anthropic.com/v1');
  });
});

describe('Phase 07 logger Category 2 — SECRET_VALUE_PATTERN value-level redaction', () => {
  // Per v1.0 convention (tests/logger-redact.test.ts), the secret-bearing
  // string is passed as the second arg `ctx` — that's the slot the redaction
  // pipeline runs over. The first arg `msg` is the wrapper prefix and is
  // never expected to carry secrets in production callsites.
  it('redacts Bearer token in Authorization header string', () => {
    logger.warn('http err', 'Authorization: Bearer sk-xyz');
    const out = captured();
    expect(out).not.toContain('sk-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts x-api-key value in stringified header', () => {
    logger.warn('http err', 'x-api-key: sk-ant-xyz');
    const out = captured();
    expect(out).not.toContain('sk-ant-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('preserves the key name on value-level redaction', () => {
    logger.warn('http err', 'Authorization: Bearer sk-xyz');
    const out = captured();
    expect(out).toContain('Authorization');
  });
});

describe('Phase 07 logger Category 3 — v1.0 regression', () => {
  it('still redacts LEETCODE_SESSION (v1.0 regression)', () => {
    logger.warn('ctx', { LEETCODE_SESSION: 'cookie-value' });
    const out = captured();
    expect(out).not.toContain('cookie-value');
    expect(out).toContain('[REDACTED]');
  });

  it('still redacts csrftoken value-level (v1.0 regression)', () => {
    // Pass the secret in ctx (v1.0 convention) — see Category 2 comment.
    logger.warn('cookie err', 'csrftoken=abc123');
    const out = captured();
    expect(out).not.toContain('abc123');
    expect(out).toContain('[REDACTED]');
  });
});
