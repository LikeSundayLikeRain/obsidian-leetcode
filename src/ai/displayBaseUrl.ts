// src/ai/displayBaseUrl.ts
//
// Phase 08.1 Plan 02 — per-provider display URL for the disclosure modal +
// any future surface that renders "the host the plugin will contact".
//
// Anthropic / OpenAI / OpenRouter / Ollama / Custom return `cfg.baseUrl`
// verbatim (the same string the user configured or the locked default).
// Bedrock substitutes `cfg.region` into the regional endpoint format —
// `https://bedrock-runtime.{region}.amazonaws.com` — because Bedrock has
// no per-instance baseUrl; the endpoint is region-derived.
//
// Mirrors prettyName's per-provider switch shape (src/ai/types.ts:94-102)
// and inherits the same exhaustive-switch invariant: extending AIProvider
// surfaces every site that needs a new branch via TS exhaustiveness check
// (S4 shared pattern in 08.1-PATTERNS.md).
//
// T-08.1-04 mitigation: ONLY `cfg.region` flows into the format string;
// no other config field appears in the rendered URL. Default 'us-east-1'
// covers the empty-region case so the modal never shows a malformed URL.
import type { AIProvider, ProviderConfig, BedrockProviderConfig } from './types';

/**
 * Per-provider display base URL. Used by `src/ai/disclosure.ts` to render
 * the "Active provider: <Name> — <baseUrl>" modal line.
 *
 * Returns:
 *   - bedrock                                → 'https://bedrock-runtime.{region}.amazonaws.com'
 *   - anthropic | openai | openrouter | ollama | custom → cfg.baseUrl verbatim
 */
export function getDisplayBaseUrl(provider: AIProvider, cfg: ProviderConfig): string {
  switch (provider) {
    case 'bedrock': {
      const region = (cfg as BedrockProviderConfig).region || 'us-east-1';
      return `https://bedrock-runtime.${region}.amazonaws.com`;
    }
    case 'anthropic':
    case 'openai':
    case 'openrouter':
    case 'ollama':
    case 'custom':
      return cfg.baseUrl;
  }
}
