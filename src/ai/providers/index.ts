// src/ai/providers/index.ts
//
// Phase 07 Plan 02 — barrel + dispatch for the five provider adapters.
//
// Exports:
//   - shared helpers `extractFromJson` / `extractProviderError` (RESEARCH §OQ5)
//   - per-provider `create*Model` + `probe*` re-exports
//   - per-provider `stream*` + `invoke*Buffered` re-exports (Phase 08 Plan 02)
//   - `resolveAdapter(provider, cfg, fetcher)` — exhaustive switch dispatch
//
// Phase 08 Plan 02 — replaces the Phase 07 invoke stub with real call shapes.
// resolveAdapter now exposes `streamInvoke` + `bufferedInvoke` (the old
// `invoke` is gone). AIClient consumes these from invokeStream + invoke.
import type { AIProvider, ProviderConfig, BedrockProviderConfig, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';
import type { StreamTextResult } from 'ai';

import {
  createAnthropicModel,
  probeAnthropic,
  streamAnthropic,
  invokeAnthropicBuffered,
} from './anthropic';
import {
  createOpenAIModel,
  probeOpenAI,
  streamOpenAI,
  invokeOpenAIBuffered,
} from './openai';
import {
  createOpenAICompatibleModel,
  probeOpenRouter,
  probeCustom,
  streamOpenAICompatible,
  invokeOpenAICompatibleBuffered,
} from './openaiCompatible';
import {
  createOllamaModel,
  probeOllama,
  streamOllama,
  invokeOllamaBuffered,
} from './ollama';
// Phase 08.1 Plan 02 — bedrock adapter (mirrors anthropic shape).
import {
  createBedrockModel,
  probeBedrock,
  streamBedrock,
  invokeBedrockBuffered,
} from './bedrock';

export {
  createAnthropicModel,
  probeAnthropic,
  streamAnthropic,
  invokeAnthropicBuffered,
  createOpenAIModel,
  probeOpenAI,
  streamOpenAI,
  invokeOpenAIBuffered,
  createOpenAICompatibleModel,
  probeOpenRouter,
  probeCustom,
  streamOpenAICompatible,
  invokeOpenAICompatibleBuffered,
  createOllamaModel,
  probeOllama,
  streamOllama,
  invokeOllamaBuffered,
  // Phase 08.1 Plan 02 — bedrock barrel re-exports.
  createBedrockModel,
  probeBedrock,
  streamBedrock,
  invokeBedrockBuffered,
};

/**
 * Best-effort vendor-error extraction from a raw HTTP response body. AI
 * providers typically return one of three shapes:
 *   - `{ error: { message: "..." } }` (OpenAI, Anthropic)
 *   - `{ error: "..." }` (some self-hosted endpoints)
 *   - `{ message: "..." }` (rare)
 * Anything else: return the first 200 chars of the raw body. Truncation to
 * 200 chars happens at the call site (CONTEXT decision E).
 */
export function extractFromJson(body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (j && typeof j === 'object') {
      if (j.error && typeof j.error === 'object' && typeof j.error.message === 'string') {
        return j.error.message;
      }
      if (typeof j.error === 'string') return j.error;
      if (typeof j.message === 'string') return j.message;
    }
    return body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

/** Best-effort message extraction from any thrown value. */
export function extractProviderError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}

/**
 * Resolved adapter shape. Phase 08 Plan 02 replaces the Phase 07 stub
 * `invoke` with two concrete entry points:
 *   - `streamInvoke(prompt, signal)` returns the SDK's `StreamTextResult`
 *     synchronously (the underlying HTTP fires when the consumer iterates
 *     `result.textStream` or awaits `result.usage`).
 *   - `bufferedInvoke(prompt, signal)` returns a Promise resolving to
 *     `{ text, usage? }` after a single non-streaming generateText call.
 *
 * Both entry points propagate the AbortSignal into the AI SDK call (which
 * forwards it as `init.signal` on the injected fetch). The caller is
 * responsible for distinguishing AbortError vs network error via
 * `signal.aborted` (RESEARCH §Pitfall 2).
 */
export interface ResolvedAdapter {
  probe: () => Promise<ProbeResult>;
  streamInvoke: (
    prompt: string,
    signal: AbortSignal,
  ) => StreamTextResult<Record<string, never>, never>;
  bufferedInvoke: (
    prompt: string,
    signal: AbortSignal,
  ) => Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
}

/**
 * Per-provider dispatch. Mirrors LeetCodeClient.isSessionExpired's exhaustive
 * switch posture (LeetCodeClient.ts:159-181) — one branch per known case, no
 * default fall-through, every branch typed identically.
 *
 * Phase 08 Plan 02 — wired live. The Phase 07 stub
 * (`'AIClient.invoke: Phase 08 wires the real call'` throw) is GONE. The
 * `streamInvoke`/`bufferedInvoke` calls route through Vercel AI SDK's
 * `streamText`/`generateText` with `abortSignal` propagation and the
 * caller-provided `fetcher` (obsidianFetch('stream') or 'request') injected
 * into the SDK provider factory's `fetch` field.
 *
 * The 5 provider cases route as follows:
 *   - anthropic  → @ai-sdk/anthropic + streamAnthropic / invokeAnthropicBuffered
 *   - openai     → @ai-sdk/openai + streamOpenAI / invokeOpenAIBuffered
 *   - openrouter → @ai-sdk/openai-compatible (name='openrouter') + streamOpenAICompatible
 *   - ollama     → @ai-sdk/openai-compatible (Ollama factory) + streamOllama
 *   - custom     → @ai-sdk/openai-compatible (name='custom') + streamOpenAICompatible
 *
 * Three of five branches share the openai-compatible streaming helpers; the
 * cfg's baseUrl carries the provider-specific endpoint (resolveAdapter is
 * called with the right cfg for the active provider at call time).
 */
export function resolveAdapter(
  provider: AIProvider,
  cfg: ProviderConfig,
  fetcher: FetchFn,
): ResolvedAdapter {
  switch (provider) {
    case 'anthropic':
      return {
        probe: () => probeAnthropic(cfg, fetcher),
        streamInvoke: (prompt, signal) => streamAnthropic(cfg, fetcher, prompt, signal),
        bufferedInvoke: (prompt, signal) => invokeAnthropicBuffered(cfg, fetcher, prompt, signal),
      };
    case 'openai':
      return {
        probe: () => probeOpenAI(cfg, fetcher),
        streamInvoke: (prompt, signal) => streamOpenAI(cfg, fetcher, prompt, signal),
        bufferedInvoke: (prompt, signal) => invokeOpenAIBuffered(cfg, fetcher, prompt, signal),
      };
    case 'openrouter':
      return {
        probe: () => probeOpenRouter(cfg, fetcher),
        streamInvoke: (prompt, signal) =>
          streamOpenAICompatible(cfg, fetcher, prompt, signal, 'openrouter'),
        bufferedInvoke: (prompt, signal) =>
          invokeOpenAICompatibleBuffered(cfg, fetcher, prompt, signal, 'openrouter'),
      };
    case 'ollama':
      return {
        probe: () => probeOllama(cfg, fetcher),
        streamInvoke: (prompt, signal) => streamOllama(cfg, fetcher, prompt, signal),
        bufferedInvoke: (prompt, signal) => invokeOllamaBuffered(cfg, fetcher, prompt, signal),
      };
    case 'custom':
      return {
        probe: () => probeCustom(cfg, fetcher),
        streamInvoke: (prompt, signal) =>
          streamOpenAICompatible(cfg, fetcher, prompt, signal, 'custom'),
        bufferedInvoke: (prompt, signal) =>
          invokeOpenAICompatibleBuffered(cfg, fetcher, prompt, signal, 'custom'),
      };
    // Phase 08.1 Plan 02 — Bedrock case mirrors the Anthropic shape.
    // The cfg cast widens ProviderConfig to BedrockProviderConfig — the
    // SettingsStore stores Bedrock entries as BedrockProviderConfig but
    // exposes them via getProviderConfig's ProviderConfig return type
    // (the discriminated map shape erased at the public API for ergonomics).
    case 'bedrock':
      return {
        probe: () => probeBedrock(cfg as BedrockProviderConfig, fetcher),
        streamInvoke: (prompt, signal) =>
          streamBedrock(cfg as BedrockProviderConfig, fetcher, prompt, signal),
        bufferedInvoke: (prompt, signal) =>
          invokeBedrockBuffered(cfg as BedrockProviderConfig, fetcher, prompt, signal),
      };
  }
}
