// tests/ai/probes.test.ts
//
// Phase 07 Plan 04 Task 2 — thin cross-provider integration roll-up.
//
// Confirms every probe function returns `{ ok: true }` on a happy path with
// a mock fetcher (or mocked SDK for Anthropic / Custom-fallback). Per-shape
// HTTP assertions live in the per-provider test files; this roll-up just
// guards the cross-provider contract — every probe must return a ProbeResult
// shape with `ok: true` when given valid mocked input.

import { describe, it, expect, vi } from 'vitest';

const generateTextMock = vi.fn(async (..._args: unknown[]) => ({ text: 'pong' }));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

import { probeOpenAI } from '../../src/ai/providers/openai';
import { probeOpenRouter, probeCustom } from '../../src/ai/providers/openaiCompatible';
import { probeOllama } from '../../src/ai/providers/ollama';
import { probeAnthropic } from '../../src/ai/providers/anthropic';
import { mockResponse, type FetchFn } from './helpers/mockProvider';
import type { ProviderConfig } from '../../src/ai/types';

const happyFetcher = vi.fn<FetchFn>(async () =>
  mockResponse({ data: [{ id: 'm1' }], models: [{ name: 'm1' }] }, { status: 200 }),
);

const baseCfg: ProviderConfig = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.example.com/v1',
  model: 'm1',
  disclosureAcknowledged: true,
};

describe('cross-provider probe roll-up — Plan 07-04 Task 2', () => {
  it('probeOpenAI returns ok=true on happy 200', async () => {
    const r = await probeOpenAI(baseCfg, happyFetcher);
    expect(r.ok).toBe(true);
  });

  it('probeOpenRouter returns ok=true on happy 200', async () => {
    const r = await probeOpenRouter(baseCfg, happyFetcher);
    expect(r.ok).toBe(true);
  });

  it('probeCustom returns ok=true on happy 200', async () => {
    const r = await probeCustom(baseCfg, happyFetcher);
    expect(r.ok).toBe(true);
  });

  it('probeOllama returns ok=true on happy 200', async () => {
    const r = await probeOllama(
      { ...baseCfg, baseUrl: 'http://localhost:11434/v1' },
      happyFetcher,
    );
    expect(r.ok).toBe(true);
  });

  it('probeAnthropic returns ok=true on happy SDK resolve', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'pong' });
    const r = await probeAnthropic(baseCfg, happyFetcher);
    expect(r.ok).toBe(true);
  });
});
