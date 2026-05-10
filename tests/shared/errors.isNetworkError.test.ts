// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-02 D-19 — isNetworkError helper classifies Chromium ERR_*
// tokens that surface when requestUrl fails due to an offline or broken
// network path.
// Turns green when Plan 03 ships `isNetworkError` in src/shared/errors.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Phase 5 D-19 — Chromium `ERR_*` tokens that indicate a transport-layer
// failure (DNS, routing, connection) rather than an HTTP 4xx/5xx. Any error
// whose .message contains one of these should classify as a network error.
const NETWORK_ERR_TOKENS = [
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_REFUSED',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK_CHANGED',
  'ERR_CONNECTION_CLOSED',
  'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_PROXY_CONNECTION_FAILED',
  'ERR_NAME_RESOLUTION_FAILED',
];

describe('Phase 5 errors — isNetworkError (D-19)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('returns true for each of the 9 Chromium ERR_* tokens', async () => {
    const mod = (await import('../../src/shared/errors')) as unknown as {
      isNetworkError?: (err: unknown) => boolean;
    };
    expect(typeof mod.isNetworkError).toBe('function');
    for (const token of NETWORK_ERR_TOKENS) {
      // LC's requestUrl typically surfaces these via Error.message =
      // `net::ERR_NAME_NOT_RESOLVED`-style text from the underlying Electron
      // net module. The helper must match the token anywhere in the message.
      const err = new Error(`net::${token} at https://leetcode.com/graphql`);
      expect(mod.isNetworkError!(err)).toBe(true);
    }
  });

  it('returns false for a plain Error with an unrelated message', async () => {
    const mod = (await import('../../src/shared/errors')) as unknown as {
      isNetworkError?: (err: unknown) => boolean;
    };
    expect(typeof mod.isNetworkError).toBe('function');
    const err = new Error('Request returned HTTP 500 Internal Server Error');
    expect(mod.isNetworkError!(err)).toBe(false);
  });

  it('returns false for non-Error values (string / null / undefined / number)', async () => {
    const mod = (await import('../../src/shared/errors')) as unknown as {
      isNetworkError?: (err: unknown) => boolean;
    };
    expect(typeof mod.isNetworkError).toBe('function');
    expect(mod.isNetworkError!('ERR_NAME_NOT_RESOLVED as a raw string')).toBe(false);
    expect(mod.isNetworkError!(null)).toBe(false);
    expect(mod.isNetworkError!(undefined)).toBe(false);
    expect(mod.isNetworkError!(42)).toBe(false);
  });
});
