// src/ai/providers/openai.ts
//
// Phase 07 Plan 02 — OpenAI provider adapter.
//
// Phase 08 Plan 02 — adds streaming + buffered live-call helpers:
//   - streamOpenAI(cfg, fetcher, prompt, signal) — Vercel AI SDK streamText
//   - invokeOpenAIBuffered(cfg, fetcher, prompt, signal) — generateText
//
// Probe semantics (D-E): GET {baseUrl}/models with `Authorization: Bearer
// {apiKey}`. On 200, parse `data: [{id, ...}]` and return `modelCount`.
// On non-OK, extract message from JSON error envelope (truncated 200 chars).
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';
import type { StreamTextResult } from 'ai';
import type { ProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';
import { extractFromJson } from './index';

export function createOpenAIModel(cfg: ProviderConfig, fetcher: FetchFn) {
  const provider = createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    fetch: fetcher,
  });
  return provider(cfg.model || 'gpt-5-mini');
}

export async function probeOpenAI(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  try {
    const baseUrl = cfg.baseUrl.replace(/\/$/, '');
    const res = await fetcher(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: unknown };
      const modelCount = Array.isArray(json.data) ? json.data.length : null;
      return { ok: true, modelCount };
    }
    const body = await res.text();
    return { ok: false, errorMessage: extractFromJson(body).slice(0, 200) };
  } catch (err) {
    return {
      ok: false,
      errorMessage: (err instanceof Error ? err.message : 'Network error').slice(0, 200),
    };
  }
}

/**
 * Streaming live-call path. See anthropic.ts for the contract.
 */
export function streamOpenAI(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): StreamTextResult<Record<string, never>, never> {
  return streamText({
    model: createOpenAIModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
}

/**
 * Non-streaming buffered live-call path. See anthropic.ts for the contract.
 */
export async function invokeOpenAIBuffered(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: createOpenAIModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
  return {
    text: result.text,
    ...(result.usage
      ? { usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } }
      : {}),
  };
}
