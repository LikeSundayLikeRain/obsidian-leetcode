// src/ai/pricing.ts
//
// Phase 07 Plan 02 — hardcoded per-token rates for the four locked default
// models (CONTEXT decision F + 07-PATTERNS §"src/ai/pricing.ts").
//
// Sources verified 2026-05-15:
//   - Anthropic Haiku 4.5: $1/M input, $5/M output (anthropic.com/pricing)
//   - OpenAI gpt-5-mini: $0.25/M input, $2/M output (openai.com/api/pricing)
//   - OpenRouter anthropic/claude-haiku-4.5: passthrough Anthropic rate
//   - Ollama llama3.2 (local): $0/M (no provider fee for local execution)
//
// ROT CAVEAT: vendor pricing changes; rates here are point-in-time. Phase 09
// polishes the cap UI; this table is the static fallback. Unknown models
// return 0 from `estimateCostUsd` (safe default — corrupt costs are worse
// than zero costs).
//
// LOCKED REGRESSION: OpenRouter slug uses DOT (`anthropic/claude-haiku-4.5`)
// not dash. RESEARCH Assumption A4. Tests in tests/ai/pricing.test.ts pin
// this — do NOT silently rewrite.

export interface ModelRate {
  /** USD per input token (e.g. 1e-6 = $1/M tokens). */
  input: number;
  /** USD per output token (e.g. 5e-6 = $5/M tokens). */
  output: number;
}

export const PRICING: Record<string, ModelRate> = {
  'claude-haiku-4-5': { input: 1e-6, output: 5e-6 },
  'gpt-5-mini': { input: 0.25e-6, output: 2e-6 },
  'anthropic/claude-haiku-4.5': { input: 1e-6, output: 5e-6 },
  'llama3.2': { input: 0, output: 0 },
};

/**
 * Compute USD cost for a single AI call. Returns 0 for unknown models —
 * accumulating fake numbers under a guess is worse than reporting nothing
 * (CONTEXT decision F: "we can't price, so don't accumulate fake numbers").
 */
export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  return rate.input * usage.inputTokens + rate.output * usage.outputTokens;
}
