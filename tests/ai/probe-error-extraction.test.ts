// tests/ai/probe-error-extraction.test.ts
//
// Phase 07 Plan 04 Task 2 — coverage for the two shared error-extraction
// helpers in `src/ai/providers/index.ts`:
//
//   extractFromJson(body): tries OpenAI / Anthropic / shaped-string envelopes
//                          and falls back to a 200-char raw-body slice.
//   extractProviderError(err): handles Error / string / unknown.
//
// These helpers are the locked seam: every provider adapter funnels its
// vendor error through one of them so the Notice text in main.ts is
// consistent regardless of which provider failed.

import { describe, it, expect } from 'vitest';
import { extractFromJson, extractProviderError } from '../../src/ai/providers/index';

describe('extractFromJson — Plan 07-04 Task 2', () => {
  it('extracts error.message from the OpenAI envelope shape', () => {
    const body = JSON.stringify({
      error: { message: 'Incorrect API key', type: 'invalid_request_error', code: 'invalid_api_key' },
    });
    expect(extractFromJson(body)).toBe('Incorrect API key');
  });

  it('extracts error.message from the Anthropic envelope shape', () => {
    const body = JSON.stringify({
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
    expect(extractFromJson(body)).toBe('invalid x-api-key');
  });

  it('falls back to error string when shape is { error: "literal" }', () => {
    const body = JSON.stringify({ error: 'rate limit exceeded' });
    expect(extractFromJson(body)).toBe('rate limit exceeded');
  });

  it('falls back to top-level message field when no error wrapper', () => {
    const body = JSON.stringify({ message: 'plain message' });
    expect(extractFromJson(body)).toBe('plain message');
  });

  it('returns truncated raw body when JSON parse fails', () => {
    const raw = 'X'.repeat(500);
    const result = extractFromJson(raw);
    expect(result.length).toBe(200);
    expect(result.startsWith('X')).toBe(true);
  });

  it('returns truncated raw body when JSON has no recognized shape', () => {
    // Valid JSON but no error/message/error.message field — falls through to
    // body.slice(0, 200).
    const body = JSON.stringify({ data: [1, 2, 3] });
    expect(extractFromJson(body)).toBe(body.slice(0, 200));
  });
});

describe('extractProviderError — Plan 07-04 Task 2', () => {
  it('handles Error instances by returning .message', () => {
    expect(extractProviderError(new Error('boom'))).toBe('boom');
  });

  it('handles plain string inputs verbatim', () => {
    expect(extractProviderError('literal error')).toBe('literal error');
  });

  it('handles non-Error non-string inputs (object, null) -> "Unknown error"', () => {
    expect(extractProviderError({ unknown: 'shape' })).toBe('Unknown error');
    expect(extractProviderError(null)).toBe('Unknown error');
  });
});
