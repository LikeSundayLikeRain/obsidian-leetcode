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
 * Phase 08 expands this — see Phase 07 plan_hints. Phase 07 ships an
 * empty-but-named interface so Plan 07-02's
 * `AIClient.invoke(req: AIRequest): Promise<AIResponse>` signature
 * type-checks without speculative fields. Empty-interface lint suppression
 * is intentional: a `type X = object` alias would not preserve the named
 * brand that downstream plans import.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AIRequest {}

/**
 * Phase 08 expands this — see Phase 07 plan_hints. Phase 07 ships an
 * empty-but-named interface so Plan 07-02's
 * `AIClient.invoke(req: AIRequest): Promise<AIResponse>` signature
 * type-checks without speculative fields. Empty-interface lint suppression
 * is intentional: a `type X = object` alias would not preserve the named
 * brand that downstream plans import.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AIResponse {}

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
