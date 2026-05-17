// tests/shared/logger.bedrock.test.ts
//
// Phase 08.1 Plan 02 — extends logger redaction coverage to AWS Bedrock
// secret field names + value-pattern matches. Mirrors tests/shared/logger.test.ts
// shape. Tests run independently (no shared state) so they can interleave
// with the Phase 07 logger suite without ordering surprises.
//
// Two layers exercised here:
//   1. REDACT regex (object-key match) — covers field-name redaction inside
//      logged objects (e.g. logger.warn('ctx', { accessKeyId: '...' })).
//   2. SECRET_VALUE_PATTERN (value alternation) — covers `key=value` /
//      `key: value` substrings in stringified messages (e.g. error toString
//      output that embedded a credential).

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
  return JSON.stringify(warnSpy.mock.calls);
}

// ─── REDACT regex — object-key match for Bedrock fields ─────────────────────

describe('Phase 08.1 logger Bedrock — REDACT object-key match', () => {
  it('redacts a top-level accessKeyId field (camelCase)', () => {
    logger.warn('ctx', { accessKeyId: 'AKIAEXAMPLE' });
    const out = captured();
    expect(out).not.toContain('AKIAEXAMPLE');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_access_key_id (snake_case env-var form)', () => {
    logger.warn('ctx', { aws_access_key_id: 'AKIA-SNAKE' });
    const out = captured();
    expect(out).not.toContain('AKIA-SNAKE');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts secretAccessKey (camelCase)', () => {
    logger.warn('ctx', { secretAccessKey: 'secret-camel' });
    const out = captured();
    expect(out).not.toContain('secret-camel');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_secret_access_key (snake_case)', () => {
    logger.warn('ctx', { aws_secret_access_key: 'secret-snake' });
    const out = captured();
    expect(out).not.toContain('secret-snake');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_session_token (env-var form)', () => {
    logger.warn('ctx', { aws_session_token: 'session-token-xyz' });
    const out = captured();
    expect(out).not.toContain('session-token-xyz');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_bearer_token_bedrock (env-var form)', () => {
    logger.warn('ctx', { aws_bearer_token_bedrock: 'bedrock-bearer-secret' });
    const out = captured();
    expect(out).not.toContain('bedrock-bearer-secret');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts bedrockApiKey (camelCase)', () => {
    logger.warn('ctx', { bedrockApiKey: 'bedrock-bearer-camel' });
    const out = captured();
    expect(out).not.toContain('bedrock-bearer-camel');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts ssoProfile field name (profile name may carry customer identity)', () => {
    logger.warn('ctx', { ssoProfile: 'customer-prod-account' });
    const out = captured();
    expect(out).not.toContain('customer-prod-account');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts deeply nested providerConfigs.bedrock.accessKeyId', () => {
    logger.warn('ctx', {
      providerConfigs: {
        bedrock: { accessKeyId: 'AKIA-DEEP', secretAccessKey: 'secret-deep' },
      },
    });
    const out = captured();
    expect(out).not.toContain('AKIA-DEEP');
    expect(out).not.toContain('secret-deep');
    expect(out).toContain('[REDACTED]');
  });

  it('does NOT redact bedrock region (not a secret)', () => {
    logger.warn('ctx', { region: 'us-east-1' });
    const out = captured();
    expect(out).toContain('us-east-1');
  });

  it('does NOT redact modelId (not a secret)', () => {
    logger.warn('ctx', { modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0' });
    const out = captured();
    expect(out).toContain('anthropic.claude-3-5-sonnet-20241022-v2:0');
  });
});

// ─── SECRET_VALUE_PATTERN — value alternation for Bedrock fields ───────────

describe('Phase 08.1 logger Bedrock — SECRET_VALUE_PATTERN value redaction', () => {
  it('redacts an aws_access_key_id=AKIA... pair embedded in a log message', () => {
    logger.warn('config error', 'aws_access_key_id=AKIAEMBEDDED');
    const out = captured();
    expect(out).not.toContain('AKIAEMBEDDED');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_session_token=token... value', () => {
    logger.warn('config', 'aws_session_token=session-token-leaked');
    const out = captured();
    expect(out).not.toContain('session-token-leaked');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_bearer_token_bedrock=bedrock-... value', () => {
    logger.warn('env', 'aws_bearer_token_bedrock=bedrock-bearer-secret');
    const out = captured();
    expect(out).not.toContain('bedrock-bearer-secret');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts aws_secret_access_key=secret... value', () => {
    logger.warn('env', 'aws_secret_access_key=secret-string');
    const out = captured();
    expect(out).not.toContain('secret-string');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts bedrockApiKey: <token> header-style', () => {
    // Note: the value MUST NOT start with the literal word `bearer` because
    // the SECRET_VALUE_PATTERN's second alternation has a `(?!bearer\b)`
    // negative lookahead that exempts the bearer scheme keyword (Plan 07-08
    // CR-01-A invariant — Bearer is not a secret value, the token AFTER it
    // is). Use a non-bearer token shape.
    logger.warn('headers', 'bedrockApiKey: secret-from-header');
    const out = captured();
    expect(out).not.toContain('secret-from-header');
    expect(out).toContain('[REDACTED]');
  });
});

// ─── Phase 07 regression — existing patterns must still redact ──────────────

describe('Phase 08.1 logger Bedrock — Phase 07 regression guard', () => {
  it('still redacts LEETCODE_SESSION (v1.0)', () => {
    logger.warn('ctx', { LEETCODE_SESSION: 'cookie-from-v1' });
    const out = captured();
    expect(out).not.toContain('cookie-from-v1');
    expect(out).toContain('[REDACTED]');
  });

  it('still redacts csrftoken value-pattern (v1.0)', () => {
    logger.warn('cookie err', 'csrftoken=abc123');
    const out = captured();
    expect(out).not.toContain('abc123');
    expect(out).toContain('[REDACTED]');
  });

  it('still redacts apiKey (Phase 07)', () => {
    logger.warn('ctx', { apiKey: 'sk-ant-phase07' });
    const out = captured();
    expect(out).not.toContain('sk-ant-phase07');
    expect(out).toContain('[REDACTED]');
  });

  it('still redacts Authorization: Bearer cleanly (Phase 07 CR-01 regression)', () => {
    logger.warn('http err', 'Authorization: Bearer sk-ant-bearer');
    const out = captured();
    expect(out).not.toContain('sk-ant-bearer');
    expect(out).toContain('[REDACTED]');
    // Locked CR-01 regression guard — the v1 garbled shape MUST NOT appear.
    expect(out).not.toContain('=[REDACTED] [REDACTED]');
  });

  it('still preserves x-api-key colon separator (Phase 07 WR-02-separator)', () => {
    logger.warn('http err', 'x-api-key: sk-ant-xyz');
    const out = captured();
    expect(out).not.toContain('sk-ant-xyz');
    expect(out).toContain('x-api-key: [REDACTED]');
    expect(out).not.toContain('x-api-key=[REDACTED]');
  });
});
