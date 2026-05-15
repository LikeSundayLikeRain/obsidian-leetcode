// src/ai/providers/index.ts
//
// Phase 07 Plan 02 — barrel + dispatch for the five provider adapters.
//
// Exports:
//   - shared helpers `extractFromJson` / `extractProviderError` (RESEARCH §OQ5)
//   - per-provider `create*Model` + `probe*` re-exports
//   - `resolveAdapter(provider, cfg, fetcher)` — exhaustive switch dispatch
//
// Phase 08 will replace the `invoke` stub with real call shapes; the signature
// is shipped today so AIClient.invoke compiles.
import type { AIProvider, ProviderConfig, AIRequest, AIResponse, ProbeResult } from '../types';
import type { FetchFn } from '../obsidianFetch';

import { createAnthropicModel, probeAnthropic } from './anthropic';
import { createOpenAIModel, probeOpenAI } from './openai';
import {
  createOpenAICompatibleModel,
  probeOpenRouter,
  probeCustom,
} from './openaiCompatible';
import { createOllamaModel, probeOllama } from './ollama';

export {
  createAnthropicModel,
  probeAnthropic,
  createOpenAIModel,
  probeOpenAI,
  createOpenAICompatibleModel,
  probeOpenRouter,
  probeCustom,
  createOllamaModel,
  probeOllama,
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

interface ResolvedAdapter {
  probe: () => Promise<ProbeResult>;
  invoke: (req: AIRequest) => Promise<AIResponse>;
}

/**
 * Per-provider dispatch. Mirrors LeetCodeClient.isSessionExpired's exhaustive
 * switch posture (LeetCodeClient.ts:159-181) — one branch per known case, no
 * default fall-through, every branch typed identically.
 *
 * Phase 07 invoke stub: throws `AIClient.invoke: Phase 08 wires the real call`.
 * Phase 08 replaces with the real generateText / streamText calls.
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
        invoke: () => {
          throw new Error('AIClient.invoke: Phase 08 wires the real call');
        },
      };
    case 'openai':
      return {
        probe: () => probeOpenAI(cfg, fetcher),
        invoke: () => {
          throw new Error('AIClient.invoke: Phase 08 wires the real call');
        },
      };
    case 'openrouter':
      return {
        probe: () => probeOpenRouter(cfg, fetcher),
        invoke: () => {
          throw new Error('AIClient.invoke: Phase 08 wires the real call');
        },
      };
    case 'ollama':
      return {
        probe: () => probeOllama(cfg, fetcher),
        invoke: () => {
          throw new Error('AIClient.invoke: Phase 08 wires the real call');
        },
      };
    case 'custom':
      return {
        probe: () => probeCustom(cfg, fetcher),
        invoke: () => {
          throw new Error('AIClient.invoke: Phase 08 wires the real call');
        },
      };
  }
}
