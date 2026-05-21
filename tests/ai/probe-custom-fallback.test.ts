// tests/ai/probe-custom-fallback.test.ts
//
// Phase 07 Plan 04 Task 2 — Custom (OpenAI-compatible) probe matrix.
//
// Plan 07-02 ships `probeCustom` with a two-step matrix locked by
// CONTEXT decision E:
//   1. GET {baseUrl}/models with optional Bearer (only if apiKey is set).
//   2. On 200 -> return modelCount.
//   3. On 404 / 405 / 501 -> fall back to a 1-token chat completion.
//   4. On any other non-OK -> return errorMessage verbatim (no fallback).
//
// Custom backends often proxy chat-only endpoints that respond
// 405 Method Not Allowed for /models — the fallback path keeps the probe
// useful without requiring users to understand which endpoints their proxy
// implements.

import { describe, it, expect, vi } from 'vitest';

const generateTextMock = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

import { probeCustom } from '../../src/ai/providers/openaiCompatible';
import { mockResponse, type FetchFn } from './helpers/mockProvider';
import type { ProviderConfig } from '../../src/ai/types';

const baseCfg: ProviderConfig = {
  apiKey: 'sk-custom-test',
  baseUrl: 'https://my-proxy.example.com/v1',
  model: 'gpt-5-mini',
  disclosureAcknowledged: true,
};

describe('probeCustom — Plan 07-04 Task 2', () => {
  it('GET /models 200 returns modelCount; no fallback to chat', async () => {
    generateTextMock.mockReset();
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ data: [{ id: 'gpt-5-mini' }, { id: 'gpt-4o' }] }, { status: 200 }),
    );
    const result = await probeCustom(baseCfg, fetcher);
    expect(result).toEqual({ ok: true, modelCount: 2 });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('falls back to 1-token chat on 404 (endpoint missing)', async () => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValueOnce({ text: 'pong' });
    const fetcher = vi.fn<FetchFn>(async () => new Response('', { status: 404 }));
    const result = await probeCustom(baseCfg, fetcher);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, modelCount: null });
  });

  it('falls back to 1-token chat on 405 (method not allowed)', async () => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValueOnce({ text: 'pong' });
    const fetcher = vi.fn<FetchFn>(async () => new Response('', { status: 405 }));
    const result = await probeCustom(baseCfg, fetcher);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, modelCount: null });
  });

  it('falls back to 1-token chat on 501 (not implemented)', async () => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValueOnce({ text: 'pong' });
    const fetcher = vi.fn<FetchFn>(async () => new Response('', { status: 501 }));
    const result = await probeCustom(baseCfg, fetcher);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, modelCount: null });
  });

  it('does NOT fall back on 500 — surfaces error verbatim', async () => {
    generateTextMock.mockReset();
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ error: { message: 'Internal error' } }, { status: 500 }),
    );
    const result = await probeCustom(baseCfg, fetcher);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Internal error');
  });

  it('does NOT fall back on 401 — surfaces error verbatim', async () => {
    generateTextMock.mockReset();
    const fetcher = vi.fn<FetchFn>(async () =>
      mockResponse({ error: { message: 'Unauthorized' } }, { status: 401 }),
    );
    const result = await probeCustom(baseCfg, fetcher);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Unauthorized');
  });

  it('GET /models 404 then chat fallback throws — surfaces SDK error', async () => {
    generateTextMock.mockReset();
    generateTextMock.mockRejectedValueOnce(new Error('Invalid API key'));
    const fetcher = vi.fn<FetchFn>(async () => new Response('', { status: 404 }));
    const result = await probeCustom(baseCfg, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Invalid API key');
  });
});
