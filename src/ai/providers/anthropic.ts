// src/ai/providers/anthropic.ts
//
// Phase 07 Plan 02 — Anthropic provider adapter (per CONTEXT D-B "per-provider
// adapter files, not strategy table"). Each provider exports two functions:
//   - createAnthropicModel(cfg, fetcher) — SDK construction
//   - probeAnthropic(cfg, fetcher) — connectivity probe (D-E)
//
// Probe semantics: Anthropic has NO public models endpoint. Probe is a 1-token
// chat completion via `generateText({ model, prompt: 'ping', maxOutputTokens: 1 })`.
// Cost ~$0.0001/click — documented in README §"Cost expectations".
//
// All probe paths are NEVER-THROW (mirrors LeetCodeClient.fetchUsername). On
// any error, return `{ ok: false, errorMessage: ... }`. Errors truncated to
// 200 chars via shared `extractProviderError` helper.
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
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
