// Verifies AUTH-06: logger.error() routes payloads through the same redaction
// pipeline as debug/info/warn, including Error instances (whose message and
// stack are non-enumerable and would otherwise bypass redaction).
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { logger } from '../src/shared/logger';

describe('logger redaction (AUTH-06)', () => {
  let errSpy: MockInstance<typeof console.error>;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('redacts cookie-ish object keys passed to warn()', () => {
    logger.warn('ctx', { LEETCODE_SESSION: 'plain-session', other: 'ok' });
    const args = warnSpy.mock.calls[0];
    expect(JSON.stringify(args)).not.toContain('plain-session');
    expect(JSON.stringify(args)).toContain('[REDACTED]');
  });

  it('redacts cookie-ish keys on Error instances passed to error()', () => {
    const err = new Error('boom') as Error & { config?: unknown };
    err.config = { headers: { Cookie: 'LEETCODE_SESSION=leaked-value-1' } };
    logger.error('request failed', err);
    const serialized = JSON.stringify(errSpy.mock.calls[0]);
    // Error.message / stack are non-enumerable, so the unwrapped form must show up.
    expect(serialized).toContain('boom');
    // The secret value must NOT appear anywhere.
    expect(serialized).not.toContain('leaked-value-1');
  });

  it('redacts inline kv secrets in an Error message passed to error()', () => {
    const err = new Error('request failed: LEETCODE_SESSION=abc123 csrftoken=def456');
    logger.error('network', err);
    const serialized = JSON.stringify(errSpy.mock.calls[0]);
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('def456');
    expect(serialized).toContain('[REDACTED]');
  });

  it('redacts a raw string passed as ctx', () => {
    logger.error('raw', 'LEETCODE_SESSION=secret-xyz');
    const serialized = JSON.stringify(errSpy.mock.calls[0]);
    expect(serialized).not.toContain('secret-xyz');
    expect(serialized).toContain('[REDACTED]');
  });
});
