// tests/ai/probe-anthropic.test.ts
//
// Phase 07 Plan 04 Task 2 — Anthropic probe SDK shape coverage.
//
// Anthropic exposes no public model-list endpoint, so the probe is a 1-token
// chat completion: `generateText({ model, prompt: 'ping', maxOutputTokens: 1 })`.
// Cost ~$0.0001/click.
//
// We mock the `ai` package so generateText is a vi.fn(), and assert the call
// shape directly. The fetcher arg is required by the probe signature but
// never directly invoked here (the AI SDK uses it internally; we don't need
// to exercise that path because it's covered by the SDK's own tests).

import { describe, it, expect, vi } from 'vitest';

const generateTextMock = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

import { probeAnthropic } from '../../src/ai/providers/anthropic';
import type { ProviderConfig } from '../../src/ai/types';
import type { FetchFn } from '../../src/ai/obsidianFetch';

const fetcher = vi.fn() as unknown as FetchFn;

const baseCfg: ProviderConfig = {
  apiKey: 'sk-ant-test',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-haiku-4-5',
  disclosureAcknowledged: true,
};

describe('probeAnthropic — Plan 07-04 Task 2', () => {
  it('calls generateText with prompt: "ping" and maxOutputTokens: 1', async () => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValueOnce({
      text: 'pong',
      usage: { inputTokens: 5, outputTokens: 1 },
    });

    const result = await probeAnthropic(baseCfg, fetcher);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const call = generateTextMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(call[0].prompt).toBe('ping');
    expect(call[0].maxOutputTokens).toBe(1);
    expect(call[0].model).toBeTruthy();
    expect(result).toEqual({ ok: true, modelCount: null });
  });

  it('returns errorMessage on SDK throw', async () => {
    generateTextMock.mockReset();
    generateTextMock.mockRejectedValueOnce(new Error('Invalid API key'));

    const result = await probeAnthropic(baseCfg, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toBe('Invalid API key');
  });

  it('truncates long SDK error messages to 200 chars', async () => {
    generateTextMock.mockReset();
    const longMsg = 'Z'.repeat(400);
    generateTextMock.mockRejectedValueOnce(new Error(longMsg));

    const result = await probeAnthropic(baseCfg, fetcher);
    expect(result.ok).toBe(false);
    expect(result.errorMessage!.length).toBe(200);
  });
});
