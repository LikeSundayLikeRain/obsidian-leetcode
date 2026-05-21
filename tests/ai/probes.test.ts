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

// ────────────────────────────────────────────────────────────────────────────
//   Plan 07-07 Task 2 — CR-02 empty-baseUrl guards
//
//   probeCustom + probeOllama must return a clean ProbeResult when baseUrl
//   is empty WITHOUT issuing any network call (a relative '/models' fetch
//   blows up requestUrl). The fetcher mock asserts zero calls in the guard
//   path; happy-path regression guards confirm the guard is empty-only,
//   not always-on.
// ────────────────────────────────────────────────────────────────────────────

describe('CR-02 empty-baseUrl guards — Plan 07-07 Task 2', () => {
  const emptyCfg: ProviderConfig = {
    apiKey: 'sk-test',
    baseUrl: '',
    model: 'm1',
    disclosureAcknowledged: true,
  };

  it('probeCustom returns clean error when baseUrl is empty (no fetcher call)', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeCustom(emptyCfg, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toMatch(/Base URL is required/i);
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeOllama returns clean error when baseUrl is empty (no fetcher call)', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeOllama({ ...emptyCfg, apiKey: '' }, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toMatch(/Base URL is required/i);
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeCustom with non-empty baseUrl still calls the fetcher (regression guard)', async () => {
    const fetcherSpy = vi.fn<FetchFn>(async () =>
      mockResponse({ data: [{ id: 'm1' }] }, { status: 200 }),
    );
    const r = await probeCustom(
      { ...emptyCfg, baseUrl: 'https://example.com/v1' },
      fetcherSpy,
    );
    expect(r.ok).toBe(true);
    expect(fetcherSpy).toHaveBeenCalledTimes(1);
  });

  it('probeOllama with non-empty baseUrl still calls the fetcher (regression guard)', async () => {
    const fetcherSpy = vi.fn<FetchFn>(async () =>
      mockResponse({ models: [{ name: 'llama3.2' }] }, { status: 200 }),
    );
    const r = await probeOllama(
      { ...emptyCfg, apiKey: '', baseUrl: 'http://localhost:11434/v1' },
      fetcherSpy,
    );
    expect(r.ok).toBe(true);
    expect(fetcherSpy).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
//   Plan 07-08 Task 2 — WR-03-whitespace empty-baseUrl guards
//
//   The CR-02 guards from Plan 07-07 used `cfg.baseUrl === ''` (main.ts) and
//   `!cfg.baseUrl` (probeCustom + probeOllama). Both leaked whitespace-only
//   inputs (' ', '\t', '   \t  ') through the guard, then constructed a
//   relative-looking URL ('  /models') that would fail at the fetcher layer.
//   Plan 07-08 standardizes all three sites on `!cfg.baseUrl?.trim()`. Tests
//   below cover whitespace-only inputs at the two probe-side guards; the
//   main.ts guard is covered in tests/ai/probe-debounce.test.ts.
// ────────────────────────────────────────────────────────────────────────────

describe('WR-03-whitespace empty-baseUrl guards — Plan 07-08 Task 2', () => {
  const emptyCfg: ProviderConfig = {
    apiKey: 'sk-test',
    baseUrl: '',
    model: 'm1',
    disclosureAcknowledged: true,
  };

  it('probeCustom rejects single-space baseUrl with no fetcher call', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeCustom({ ...emptyCfg, baseUrl: ' ' }, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe('Base URL is required for Custom provider.');
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeCustom rejects tab-only baseUrl with no fetcher call', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeCustom({ ...emptyCfg, baseUrl: '\t' }, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe('Base URL is required for Custom provider.');
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeCustom rejects mixed-whitespace baseUrl with no fetcher call', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeCustom({ ...emptyCfg, baseUrl: '  \t  ' }, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe('Base URL is required for Custom provider.');
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeOllama rejects single-space baseUrl with no fetcher call', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeOllama({ ...emptyCfg, apiKey: '', baseUrl: ' ' }, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe('Base URL is required for Ollama provider.');
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeOllama rejects mixed-whitespace baseUrl with no fetcher call', async () => {
    const fetcherSpy = vi.fn<FetchFn>();
    const r = await probeOllama({ ...emptyCfg, apiKey: '', baseUrl: '\t \t' }, fetcherSpy);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe('Base URL is required for Ollama provider.');
    expect(fetcherSpy).toHaveBeenCalledTimes(0);
  });

  it('probeCustom with leading/trailing whitespace around a real URL STILL calls the fetcher (regression guard)', async () => {
    // The guard rejects all-whitespace only — not "any whitespace". A user
    // who pastes ' https://example.com/v1 ' has a malformed URL but a
    // non-empty trimmed value, so the guard lets it through. URL trimming
    // is a separate concern (Settings sanitization), out of scope here.
    const fetcherSpy = vi.fn<FetchFn>(async () =>
      mockResponse({ data: [{ id: 'm1' }] }, { status: 200 }),
    );
    const r = await probeCustom(
      { ...emptyCfg, baseUrl: ' https://example.com/v1 ' },
      fetcherSpy,
    );
    expect(r.ok).toBe(true);
    expect(fetcherSpy).toHaveBeenCalledTimes(1);
  });
});
