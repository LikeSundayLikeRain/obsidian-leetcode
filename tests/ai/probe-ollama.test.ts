// tests/ai/probe-ollama.test.ts
//
// Phase 07 Plan 04 Task 2 — Ollama probe HTTP shape coverage.
//
// Locks the wire format Plan 07-02's `probeOllama` produces:
//   1. Strip any trailing /v1 (with or without trailing slash) from baseUrl.
//   2. GET {baseHost}/api/tags
//   3. modelCount := json.models.length (default 0 when missing/empty).
//
// Ollama's `/api/tags` is the canonical local-model-list endpoint and is
// distinct from the OpenAI-compatible /v1/* surface — locking the URL
// transformation here defends against a future planner accidentally
// proxying the call through the /v1 prefix and missing the local server.

import { describe, it, expect, vi } from 'vitest';
import { probeOllama } from '../../src/ai/providers/ollama';
import { mockResponse, type FetchFn } from './helpers/mockProvider';
import type { ProviderConfig } from '../../src/ai/types';

function cfg(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    disclosureAcknowledged: true,
    ...overrides,
  };
}

describe('probeOllama — Plan 07-04 Task 2', () => {
  it('strips /v1 suffix and queries /api/tags', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ models: [{ name: 'llama3.2' }] }, { status: 200 }),
    );
    await probeOllama(cfg({ baseUrl: 'http://localhost:11434/v1' }), fetcher);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://localhost:11434/api/tags');
  });

  it('strips /v1/ (with trailing slash) suffix and queries /api/tags', async () => {
    const fetcher = vi.fn<FetchFn>(async () => mockResponse({ models: [] }, { status: 200 }));
    await probeOllama(cfg({ baseUrl: 'http://localhost:11434/v1/' }), fetcher);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://localhost:11434/api/tags');
  });

  it('works without /v1 suffix (raw host)', async () => {
    const fetcher = vi.fn<FetchFn>(async () => mockResponse({ models: [] }, { status: 200 }));
    await probeOllama(cfg({ baseUrl: 'http://localhost:11434' }), fetcher);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://localhost:11434/api/tags');
  });

  it('returns modelCount from json.models[]', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse(
        { models: [{ name: 'llama3.2' }, { name: 'mistral' }] },
        { status: 200 },
      ),
    );
    const result = await probeOllama(cfg(), fetcher);
    expect(result).toEqual({ ok: true, modelCount: 2 });
  });

  it('returns 0 modelCount when models[] is missing or empty', async () => {
    const fetcher = vi.fn<FetchFn>(async () => mockResponse({}, { status: 200 }));
    const result = await probeOllama(cfg(), fetcher);
    expect(result).toEqual({ ok: true, modelCount: 0 });
  });

  it('returns ok=false with reachability message on non-200', async () => {
    const fetcher = vi.fn<FetchFn>(async () =>
      new Response('Service unavailable', { status: 503 }),
    );
    const result = await probeOllama(cfg(), fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('Ollama not reachable (HTTP 503)');
  });

  it('returns ok=false on network throw with this-host message', async () => {
    const fetcher = vi.fn<FetchFn>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await probeOllama(cfg(), fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('Ollama not reachable on this host');
  });
});
