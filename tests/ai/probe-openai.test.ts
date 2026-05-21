// tests/ai/probe-openai.test.ts
//
// Phase 07 Plan 04 Task 2 — OpenAI probe HTTP shape coverage.
//
// Locks the wire format Plan 07-02's `probeOpenAI` produces:
//   GET {baseUrl}/models  with  Authorization: Bearer {apiKey}
//
// Plus the response-handling matrix: 200 with multi-entry data[], 401 with
// vendor JSON envelope, 5xx with plain-text body, baseUrl trailing-slash
// normalization, and 200-char vendor message truncation.

import { describe, it, expect, vi } from 'vitest';
import { probeOpenAI } from '../../src/ai/providers/openai';
import { mockResponse, type FetchFn } from './helpers/mockProvider';
import type { ProviderConfig } from '../../src/ai/types';

const baseCfg: ProviderConfig = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5-mini',
  disclosureAcknowledged: true,
};

describe('probeOpenAI — Plan 07-04 Task 2', () => {
  it('sends GET /v1/models with Bearer auth header', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ data: [{ id: 'gpt-5-mini' }] }, { status: 200 }),
    );

    const result = await probeOpenAI(baseCfg, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.openai.com/v1/models');
    expect(call[1]?.method).toBe('GET');
    const headers = call[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(result).toEqual({ ok: true, modelCount: 1 });
  });

  it('returns ok=true with modelCount on 200 with multiple entries', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse(
        { data: [{ id: 'gpt-5-mini' }, { id: 'gpt-4o' }, { id: 'o1-mini' }] },
        { status: 200 },
      ),
    );
    const result = await probeOpenAI(baseCfg, fetcher);
    expect(result).toEqual({ ok: true, modelCount: 3 });
  });

  it('returns errorMessage on 401 with vendor message verbatim', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse(
        {
          error: {
            message: 'Incorrect API key provided',
            type: 'invalid_request_error',
          },
        },
        { status: 401 },
      ),
    );
    const result = await probeOpenAI({ ...baseCfg, apiKey: 'sk-bogus' }, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Incorrect API key provided');
    expect(result.errorMessage!.length).toBeLessThanOrEqual(200);
  });

  it('truncates long vendor error messages to 200 chars', async () => {
    const longMsg = 'X'.repeat(500);
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ error: { message: longMsg } }, { status: 401 }),
    );
    const result = await probeOpenAI(baseCfg, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage!.length).toBe(200);
  });

  it('handles 5xx with plain-text body fallback', async () => {
    // Non-JSON body — extractFromJson catches the parse failure and returns
    // the raw body slice.
    const fetcher = vi.fn<FetchFn>(async () =>
      new Response('Internal Server Error', { status: 500 }),
    );
    const result = await probeOpenAI(baseCfg, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('Internal Server Error');
  });

  it('strips trailing slash from baseUrl so /models has no double slash', async () => {
    const fetcher = vi.fn<FetchFn>(async () => mockResponse({ data: [] }, { status: 200 }));
    await probeOpenAI({ ...baseCfg, baseUrl: 'https://api.openai.com/v1/' }, fetcher);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.openai.com/v1/models');
  });
});
