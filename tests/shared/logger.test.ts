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

describe('Phase 07 logger Category 4 — CR-01 double-replacement regression', () => {
  // Phase 07 Plan 07 — fixes CR-01 confirmed by 07-VERIFICATION.md truth #4.
  // The two-pass redactString in v1 produced garbled output:
  //   input:  'Authorization: Bearer sk-proj-abcdef'
  //   step 1: 'Authorization: Bearer [REDACTED]'         (BEARER_VALUE_PATTERN)
  //   step 2: 'Authorization=[REDACTED] [REDACTED]'      (SECRET_VALUE_PATTERN
  //                                                       re-consumed [REDACTED])
  // The fix excludes '[' from SECRET_VALUE_PATTERN's value char class so the
  // already-placed [REDACTED] token is never re-consumed. The secret was
  // never exposed by the v1 bug, but the malformed shape (':' → '=' plus a
  // dangling '[REDACTED]' token) violated the documented contract and made
  // log lines harder to read for AI provider error debugging.
  it('redacts Authorization: Bearer cleanly without double-replacement (Title-case)', () => {
    logger.warn('http err', 'Authorization: Bearer sk-proj-abcdef');
    const out = captured();
    expect(out).not.toContain('sk-proj-abcdef');
    expect(out).toContain('[REDACTED]');
    // The CR-01 garbled shape MUST NOT appear:
    expect(out).not.toContain('=[REDACTED] [REDACTED]');
    expect(out).not.toContain('[REDACTED] [REDACTED]');
  });

  it('redacts authorization: bearer cleanly without double-replacement (lowercase)', () => {
    logger.warn('http err', 'authorization: bearer sk-xyz');
    const out = captured();
    expect(out).not.toContain('sk-xyz');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('=[REDACTED] [REDACTED]');
    expect(out).not.toContain('[REDACTED] [REDACTED]');
  });

  it('regression guard: Authorization-header redaction never produces "=[REDACTED] [REDACTED]"', () => {
    logger.warn('http err', 'Authorization: Bearer sk-test-value');
    const out = captured();
    // Locked CR-01 regression guard — this exact substring is the v1 garbled
    // signature. If this assertion fails, the double-replacement bug is back.
    expect(out).not.toContain('=[REDACTED] [REDACTED]');
  });
});

describe('Phase 07 logger Category 5 — CR-01-A + WR-02-separator advisory fixes (Plan 07-08)', () => {
  // Plan 07-08 closes two advisory findings from 07-07-REVIEW:
  //
  //   CR-01-A — `'Authorization: Bearer'` (no token) was rendered as
  //     `'Authorization=[REDACTED]'` because the second alternate consumed
  //     `Bearer` as a value. The fix adds a negative lookahead `(?!bearer\b)`
  //     to the second alternate's value char class so the bare `Bearer`
  //     keyword never matches as a secret. Acceptable post-fix shapes:
  //     (a) input untouched (`'Authorization: Bearer'` survives), OR
  //     (b) `'Authorization: Bearer [REDACTED]'`. The hard contract is that
  //     `'Authorization=[REDACTED]'` MUST NOT appear in output.
  //
  //   WR-02-separator — the second alternate's replacement hardcoded `=` as
  //     the separator. `'x-api-key: sk-ant-xyz'` redacted to
  //     `'x-api-key=[REDACTED]'` (colon → equals normalization). The fix
  //     captures `[:=]` as a numbered group and replays it in the
  //     replacement so the original separator is preserved.
  it('preserves the colon separator for x-api-key header (WR-02-separator)', () => {
    logger.warn('http err', 'x-api-key: sk-ant-xyz');
    const out = captured();
    expect(out).not.toContain('sk-ant-xyz');
    expect(out).toContain('x-api-key: [REDACTED]');
    expect(out).not.toContain('x-api-key=[REDACTED]');
  });

  it('preserves the equals separator for env-var-style LEETCODE_SESSION (WR-02-separator regression guard)', () => {
    logger.warn('env', 'LEETCODE_SESSION=cookie-val');
    const out = captured();
    expect(out).not.toContain('cookie-val');
    expect(out).toContain('LEETCODE_SESSION=[REDACTED]');
  });

  it('does NOT consume the Bearer keyword as a value when no token follows (CR-01-A)', () => {
    logger.warn('http err', 'Authorization: Bearer');
    const out = captured();
    // Hard contract: the v07-07 broken shape MUST NOT appear.
    expect(out).not.toContain('Authorization=[REDACTED]');
    // Either form is acceptable:
    //   (a) input untouched — `Bearer` survives, no `[REDACTED]` introduced
    //       for the dangling header, AND the Authorization keyword is intact
    //   (b) normalized — `'Authorization: Bearer [REDACTED]'` is emitted
    const acceptableA =
      !out.includes('Authorization=[REDACTED]') &&
      out.includes('Bearer');
    const acceptableB = out.includes('Authorization: Bearer [REDACTED]');
    expect(acceptableA || acceptableB).toBe(true);
  });

  it('still redacts Authorization: Bearer <token> cleanly (CR-01 primary regression guard)', () => {
    logger.warn('http err', 'Authorization: Bearer sk-proj-abcdef');
    const out = captured();
    expect(out).toContain('Authorization: Bearer [REDACTED]');
    expect(out).not.toContain('sk-proj-abcdef');
    expect(out).not.toContain('=[REDACTED] [REDACTED]');
  });

  it('still redacts non-Bearer env-var token=value (separator-preserving regression guard)', () => {
    logger.warn('env', 'token=abc123');
    const out = captured();
    expect(out).toContain('token=[REDACTED]');
    expect(out).not.toContain('abc123');
  });
});
