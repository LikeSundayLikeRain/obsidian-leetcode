// src/ai/types.ts
// Phase 07 Plan 01 — AI provider domain types. Locked schema per CONTEXT
// decision A (Vercel AI SDK shape: apiKey + baseUrl + model) and 07-PATTERNS
// §"src/ai/types.ts". The string-union order for AIProvider is intentional
// (D-04 reuse precedent: browse/types.ts `'Easy' | 'Medium' | 'Hard'`) — do
// NOT reorder; downstream consumers iterate it for deterministic UI.

/**
 * The five AI providers supported in v1.1. Locked union — anything outside
 * this set must collapse to the safe default at the SettingsStore shape-guard
 * layer (Plan 07-01 Task 2: `isValidProviderId`).
 */
// Single-line union (locked grep target for plan acceptance criteria).
export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom';

/**
 * Per-provider credential + endpoint config. Persisted in
 * `PluginData.providerConfigs[provider]`. Switching `activeAIProvider`
 * preserves prior providers' values byte-for-byte (T-07-01 / AIPROV-01).
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  disclosureAcknowledged: boolean;
}

/**
 * Daily AI cost tally. Stored in `PluginData.aiCostLedger`. `addCostLedger`
 * (Plan 07-01 Task 2) does day-rollover-on-read: when local-day differs from
 * `date`, ledger resets to `{ date: today, usdToday: 0 }` BEFORE adding.
 * No cap enforcement, no UI in Phase 07 (D-F).
 */
export interface AICostLedger {
  /** Local-day identifier in YYYY-MM-DD form. */
  date: string;
  /** Cumulative USD spent on AI calls today. Always >= 0. */
  usdToday: number;
}

/**
 * Connectivity probe result returned by Plan 07-04's `probeProvider()`. `ok`
 * is the only required field; `modelCount` populates when the probe is able
 * to enumerate models, `errorMessage` populates on failure.
 */
export interface ProbeResult {
  ok: boolean;
  modelCount?: number | null;
  errorMessage?: string;
}

/**
 * Phase 08 Plan 01 — locked field set per 08-CONTEXT decision E. Replaces the
 * Phase 07 empty-but-named placeholder. AIClient.invoke (and Phase 08 Plan 02's
 * invokeStream) consume `prompt`, optional `maxTokens`, optional `stream`
 * (routes through `obsidianFetch('stream')` when true) and optional `signal`
 * (propagated into Vercel AI SDK's `streamText({ abortSignal })`).
 */
export interface AIRequest {
  /** Single-shot prompt assembled by `buildDebugPrompt(...)` (Plan 08-03). */
  prompt: string;
  /** Optional: provider-side max tokens. Default: provider-specific cheap-tier value. */
  maxTokens?: number;
  /** When true, route through `obsidianFetch('stream')`. When false/undefined, requestUrl. */
  stream?: boolean;
  /** AbortController.signal — propagated into `streamText({ abortSignal })`. */
  signal?: AbortSignal;
}

/**
 * Phase 08 Plan 01 — locked field set per 08-CONTEXT decision E. Used by
 * non-streaming `AIClient.invoke` consumers (Plan 07-04 testActiveAIConnection
 * already routes through probe(), but Phase 09 will consume invoke() for the
 * AI Review write).
 */
export interface AIResponse {
  /** Full assistant text. */
  text: string;
  /** USD cost added to the daily ledger; zero on Ollama / unknown. */
  usdCost: number;
  /** Optional usage object for diagnostics. */
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Phase 07 Plan 04 — single source of truth for provider display names.
 * Locked verbatim from 07-UI-SPEC §"Copywriting Contract" (Provider display
 * names table). Imported by main.ts (testActiveAIConnection Notice copy) and
 * by SettingsTab.ts (renderAIProviderForm) — both surfaces must render the
 * exact same brand string. Adding a new provider id requires extending this
 * switch first; the union exhaustiveness check then surfaces every other
 * call site that needs an update.
 */
export function prettyName(p: AIProvider): string {
  switch (p) {
    case 'anthropic': return 'Anthropic';
    case 'openai': return 'OpenAI';
    case 'openrouter': return 'OpenRouter';
    case 'ollama': return 'Ollama';
    case 'custom': return 'Custom (OpenAI-compatible)';
  }
}
