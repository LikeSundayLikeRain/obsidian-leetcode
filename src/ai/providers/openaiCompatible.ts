// src/ai/providers/openaiCompatible.ts
//
// Phase 07 Plan 02 — OpenAI-compatible provider adapter (covers OpenRouter
// and Custom). One factory + three probes:
//   - createOpenAICompatibleModel(cfg, fetcher, name) — SDK construction
//   - probeOpenRouter(cfg, fetcher) — public model list, no Bearer required
//   - probeCustom(cfg, fetcher) — GET /models first, fall back to 1-token chat
//   - probeViaOneTokenChat(cfg, fetcher) — shared chat-fallback helper
//
// Phase 08 Plan 02 — adds streaming + buffered live-call helpers:
//   - streamOpenAICompatible(cfg, fetcher, prompt, signal) — streamText
//   - invokeOpenAICompatibleBuffered(cfg, fetcher, prompt, signal) — generateText
// Both helpers accept the cfg directly and route through the shared
// createOpenAICompatibleModel factory — the baseUrl carried in cfg picks
// openrouter / custom (resolveAdapter dispatches the right cfg per provider
// case at the call site).
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, generateText } from 'ai';
import type { StreamTextResult } from 'ai';
import type { ProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';
import { extractFromJson, extractProviderError } from './index';

export function createOpenAICompatibleModel(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  name = 'custom',
) {
  const provider = createOpenAICompatible({
    name,
    apiKey: cfg.apiKey || 'placeholder',
    baseURL: cfg.baseUrl,
    fetch: fetcher,
  });
  return provider(cfg.model || 'gpt-5-mini');
}

export async function probeOpenRouter(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  try {
    const baseUrl = cfg.baseUrl.replace(/\/$/, '');
    // OpenRouter's public model list does not require auth.
    const res = await fetcher(`${baseUrl}/models`, { method: 'GET' });
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
 * Custom (OpenAI-compatible self-hosted / proxied) probe. The matrix here
 * (D-E) is "GET /models first; on 404/405/501 fall back to 1-token chat" —
 * some custom endpoints proxy chat-only and return method-not-allowed for
 * the model list. The fallback is the same 1-token completion the Anthropic
 * probe uses, just routed through the OpenAI-compatible SDK.
 */
export async function probeCustom(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  // Phase 07 Plan 07 — CR-02 BLOCKER fix. When cfg.baseUrl === '' (the
  // default for the freshly-selected Custom provider), constructing a
  // fetch URL via `'' + '/models' = '/models'` produces a relative URL
  // that requestUrl cannot resolve. Early-return with a clean error
  // message so the caller surfaces a friendly Notice instead of a
  // confusing requestUrl exception. The fetcher is NEVER invoked in
  // this path — asserted by tests/ai/probes.test.ts CR-02 fixture.
  //
  // Phase 07 Plan 08 — WR-03-whitespace tightens this from `!cfg.baseUrl`
  // (falsy) to `!cfg.baseUrl?.trim()` so single-space, tab, and mixed-
  // whitespace inputs are also rejected — symmetric with main.ts
  // testActiveAIConnection and probeOllama.
  if (!cfg.baseUrl?.trim()) {
    return { ok: false, errorMessage: 'Base URL is required for Custom provider.' };
  }
  try {
    const baseUrl = cfg.baseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {};
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const res = await fetcher(`${baseUrl}/models`, { method: 'GET', headers });
    if (res.ok) {
      const json = (await res.json()) as { data?: unknown };
      const modelCount = Array.isArray(json.data) ? json.data.length : null;
      return { ok: true, modelCount };
    }
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      // Endpoint doesn't expose /models — fall back to a 1-token chat probe.
      return probeViaOneTokenChat(cfg, fetcher);
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

/** Shared chat-fallback helper for custom endpoints that lack /models. */
export async function probeViaOneTokenChat(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  try {
    await generateText({
      model: createOpenAICompatibleModel(cfg, fetcher, 'custom'),
      prompt: 'ping',
      maxOutputTokens: 1,
    });
    return { ok: true, modelCount: null };
  } catch (err) {
    return { ok: false, errorMessage: extractProviderError(err).slice(0, 200) };
  }
}

/**
 * Streaming live-call path for openai-compatible providers (OpenRouter +
 * Custom + Ollama all route here at resolveAdapter time — only the cfg
 * differs between branches). See anthropic.ts for the contract.
 */
export function streamOpenAICompatible(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
  name = 'custom',
): StreamTextResult<Record<string, never>, never> {
  return streamText({
    model: createOpenAICompatibleModel(cfg, fetcher, name),
    prompt,
    abortSignal: signal,
  });
}

/**
 * Non-streaming buffered live-call path. See anthropic.ts for the contract.
 */
export async function invokeOpenAICompatibleBuffered(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
  name = 'custom',
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: createOpenAICompatibleModel(cfg, fetcher, name),
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
