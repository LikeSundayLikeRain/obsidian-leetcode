// src/ai/providers/ollama.ts
//
// Phase 07 Plan 02 — Ollama provider adapter (local OpenAI-compatible).
//
// Phase 08 Plan 02 — adds streaming + buffered live-call helpers:
//   - streamOllama(cfg, fetcher, prompt, signal) — Vercel AI SDK streamText
//   - invokeOllamaBuffered(cfg, fetcher, prompt, signal) — generateText
//
// Probe semantics (D-E): strip trailing `/v1` from baseUrl and GET
// `${baseHost}/api/tags`. Ollama's /api/tags returns `{ models: [{name, ...}] }`
// — modelCount = models.length on 200. Network errors here are "Ollama not
// reachable on this host" (most common: user hasn't started the daemon).
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, generateText } from 'ai';
import type { StreamTextResult } from 'ai';
import type { ProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';

export function createOllamaModel(cfg: ProviderConfig, fetcher: FetchFn) {
  const provider = createOpenAICompatible({
    name: 'ollama',
    apiKey: cfg.apiKey || 'ollama',
    baseURL: cfg.baseUrl,
    fetch: fetcher,
  });
  return provider(cfg.model || 'llama3.2');
}

export async function probeOllama(
  cfg: ProviderConfig,
  fetcher: FetchFn,
): Promise<ProbeResult> {
  // Phase 07 Plan 07 — CR-02 mirror guard. probeOllama has the same
  // empty-baseUrl shape as probeCustom: a relative '/api/tags' URL
  // when cfg.baseUrl === ''. Mirror the early-return guard for
  // symmetry and so tests/ai/probes.test.ts CR-02 fixture can assert
  // zero fetcher calls in the empty-baseUrl path.
  //
  // Phase 07 Plan 08 — WR-03-whitespace tightens this from `!cfg.baseUrl`
  // (falsy) to `!cfg.baseUrl?.trim()` so single-space, tab, and mixed-
  // whitespace inputs are also rejected — symmetric with main.ts
  // testActiveAIConnection and probeCustom.
  if (!cfg.baseUrl?.trim()) {
    return { ok: false, errorMessage: 'Base URL is required for Ollama provider.' };
  }
  try {
    const baseHost = cfg.baseUrl.replace(/\/v1\/?$/, '');
    const url = `${baseHost}/api/tags`;
    const res = await fetcher(url, { method: 'GET' });
    if (!res.ok) {
      return { ok: false, errorMessage: `Ollama not reachable (HTTP ${res.status})` };
    }
    const json = (await res.json()) as { models?: unknown };
    const modelCount = Array.isArray(json.models) ? json.models.length : 0;
    return { ok: true, modelCount };
  } catch {
    return { ok: false, errorMessage: 'Ollama not reachable on this host' };
  }
}

/**
 * Streaming live-call path. See anthropic.ts for the contract.
 */
export function streamOllama(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): StreamTextResult<Record<string, never>, never> {
  return streamText({
    model: createOllamaModel(cfg, fetcher),
    prompt,
    abortSignal: signal,
  });
}

/**
 * Non-streaming buffered live-call path. See anthropic.ts for the contract.
 */
export async function invokeOllamaBuffered(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: createOllamaModel(cfg, fetcher),
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
