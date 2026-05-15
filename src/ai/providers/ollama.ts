// src/ai/providers/ollama.ts
//
// Phase 07 Plan 02 — Ollama provider adapter (local OpenAI-compatible).
//
// Probe semantics (D-E): strip trailing `/v1` from baseUrl and GET
// `${baseHost}/api/tags`. Ollama's /api/tags returns `{ models: [{name, ...}] }`
// — modelCount = models.length on 200. Network errors here are "Ollama not
// reachable on this host" (most common: user hasn't started the daemon).
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
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
