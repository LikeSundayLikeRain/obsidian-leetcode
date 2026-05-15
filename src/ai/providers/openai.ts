// src/ai/providers/openai.ts
//
// Phase 07 Plan 02 — OpenAI provider adapter.
//
// Probe semantics (D-E): GET {baseUrl}/models with `Authorization: Bearer
// {apiKey}`. On 200, parse `data: [{id, ...}]` and return `modelCount`.
// On non-OK, extract message from JSON error envelope (truncated 200 chars).
import { createOpenAI } from '@ai-sdk/openai';
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
