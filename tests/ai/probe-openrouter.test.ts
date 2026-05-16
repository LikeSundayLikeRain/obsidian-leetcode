// tests/ai/probe-openrouter.test.ts
//
// Phase 07 Plan 04 Task 2 — OpenRouter probe HTTP shape coverage.
//
// Locks the wire format Plan 07-02's `probeOpenRouter` produces:
//   GET {baseUrl}/models  with NO Authorization header
//
// OpenRouter's public model list is anonymous-friendly per RESEARCH §"Code
// Examples" Example 2 — sending Bearer would still work but is unnecessary
// and would leak the key in vendor logs for a probe that does not need it.

import { describe, it, expect, vi } from 'vitest';
import { probeOpenRouter } from '../../src/ai/providers/openaiCompatible';
import { mockResponse, type FetchFn } from './helpers/mockProvider';
import type { ProviderConfig } from '../../src/ai/types';

const baseCfg: ProviderConfig = {
  apiKey: 'sk-or-v1-test',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-haiku-4.5',
  disclosureAcknowledged: true,
};

describe('probeOpenRouter — Plan 07-04 Task 2', () => {
  it('sends GET /api/v1/models with NO Authorization header', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ data: [{ id: 'anthropic/claude-haiku-4.5' }] }, { status: 200 }),
    );

    const result = await probeOpenRouter(baseCfg, fetcher);

    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://openrouter.ai/api/v1/models');
    expect(call[1]?.method).toBe('GET');
    // Either no headers field, or an object that does NOT contain Authorization.
    const headers = (call[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(result).toEqual({ ok: true, modelCount: 1 });
  });

  it('returns ok=true with modelCount on 200 with multiple entries', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse(
        { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] },
        { status: 200 },
      ),
    );
    const result = await probeOpenRouter(baseCfg, fetcher);
    expect(result).toEqual({ ok: true, modelCount: 4 });
  });

  it('returns errorMessage on non-OK response', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ error: { message: 'Service unavailable' } }, { status: 503 }),
    );
    const result = await probeOpenRouter(baseCfg, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Service unavailable');
  });
});
