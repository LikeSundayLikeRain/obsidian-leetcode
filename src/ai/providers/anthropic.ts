// src/ai/providers/anthropic.ts
//
// Phase 07 Plan 02 — Anthropic provider adapter (per CONTEXT D-B "per-provider
// adapter files, not strategy table"). Each provider exports two functions:
//   - createAnthropicModel(cfg, fetcher) — SDK construction
//   - probeAnthropic(cfg, fetcher) — connectivity probe (D-E)
//
// Phase 08 Plan 02 — adds streaming + buffered live-call helpers:
//   - streamAnthropic(cfg, fetcher, prompt, signal) — Vercel AI SDK streamText
//   - invokeAnthropicBuffered(cfg, fetcher, prompt, signal) — generateText
//
// Probe semantics: Anthropic has NO public models endpoint. Probe is a 1-token
// chat completion via `generateText({ model, prompt: 'ping', maxOutputTokens: 1 })`.
// Cost ~$0.0001/click — documented in README §"Cost expectations".
//
// All probe paths are NEVER-THROW (mirrors LeetCodeClient.fetchUsername). On
// any error, return `{ ok: false, errorMessage: ... }`. Errors truncated to
// 200 chars via shared `extractProviderError` helper.
//
// Stream/buffered call paths re-throw — caller (AIClient.invokeStream / the
// modal) is responsible for distinguishing AbortError vs network error via
// `signal.aborted` (RESEARCH §Pitfall 2).
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText } from 'ai';
import type { StreamTextResult } from 'ai';
import type { ProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';
import { extractProviderError } from './index';

export function createAnthropicModel(cfg: ProviderConfig, fetcher: FetchFn) {
  const provider = createAnthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    fetch: fetcher,
  });
  return provider(cfg.model || 'claude-haiku-4-5');
}

export async function probeAnthropic(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  try {
    await generateText({
      model: createAnthropicModel(cfg, fetcher),
      prompt: 'ping',
      maxOutputTokens: 1,
    });
    // Anthropic exposes no model-list endpoint; modelCount = null signals
    // "probe succeeded but the count is unavailable".
    return { ok: true, modelCount: null };
  } catch (err) {
    return { ok: false, errorMessage: extractProviderError(err).slice(0, 200) };
  }
}

/**
 * Streaming live-call path. Synchronous return (streamText returns the
 * StreamTextResult immediately; the actual HTTP fires when the consumer
 * iterates `result.textStream` / awaits `result.usage` / etc.). Caller owns
 * the AbortController whose signal is forwarded into the underlying fetch.
 */
export function streamAnthropic(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): StreamTextResult<Record<string, never>, never> {
  return streamText({
    model: createAnthropicModel(cfg, fetcher),
    prompt,
    maxOutputTokens: 8192,
    abortSignal: signal,
  });
}

/**
 * Non-streaming buffered live-call path. Used by the fallback branch of
 * AIClient.invokeStream (electron.net.fetch unavailable) and by the existing
 * AIClient.invoke method. Returns text + usage; cost-USD math happens at the
 * AIClient layer (no pricing logic in adapters per Phase 07 §"D-Pricing").
 */
export async function invokeAnthropicBuffered(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: createAnthropicModel(cfg, fetcher),
    prompt,
    maxOutputTokens: 8192,
    abortSignal: signal,
  });
  return {
    text: result.text,
    ...(result.usage
      ? { usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } }
      : {}),
  };
}
