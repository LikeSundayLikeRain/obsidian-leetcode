// src/ai/AIClient.ts
//
// Phase 07 Plan 02 — thin facade over @ai-sdk/* providers. All AI HTTP flows
// through `obsidianFetch(mode)` injected at adapter construction. leetcode.com
// calls NEVER touch this module — they remain on installRequestUrlFetcher's
// path (CONTEXT canonical_refs invariant; AIPROV-05 grep gate enforces).
//
// Mirrors LeetCodeClient: ctor takes SettingsStore, methods are stateless,
// `probe` follows fetchUsername never-throw posture, `invoke` follows
// getProblemDetail re-throw posture so Phase 08 callers can branch on
// disclosure-cancel vs network vs cap exceeded.
//
// Phase 07-05 will wrap probe/invoke with the disclosure gate; Phase 08 will
// replace the invoke stub with real call shapes. The signatures are stable
// today so downstream plans compile.
import type { SettingsStore } from '../settings/SettingsStore';
import type { AIProvider, AIRequest, AIResponse, ProbeResult } from './types';
import { obsidianFetch } from './obsidianFetch';
import { resolveAdapter } from './providers';

export class AIClient {
  private settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.settings = settings;
  }

  /**
   * Connectivity probe for the given provider. NEVER throws — wraps adapter
   * exceptions and returns `{ ok: false, errorMessage }`. The adapters
   * themselves also never throw, but the wrapper guarantee is contract-
   * ratifying for callers that expect a Result-shaped return regardless of
   * adapter discipline drift.
   *
   * Routes through `obsidianFetch('request')` — connectivity probes never
   * stream.
   */
  async probe(provider: AIProvider): Promise<ProbeResult> {
    try {
      const cfg = this.settings.getProviderConfig(provider);
      const fetcher = obsidianFetch('request');
      const adapter = resolveAdapter(provider, cfg, fetcher);
      return await adapter.probe();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, errorMessage: message.slice(0, 200) };
    }
  }

  /**
   * Invoke the active provider. Throws `Error('No AI provider configured')`
   * if `activeAIProvider` is null. Re-throws on adapter error (mirrors
   * LeetCodeClient.getProblemDetail) so feature-layer callers in Phase 08/09
   * can branch on the error type.
   *
   * Routes through `obsidianFetch(req.stream ? 'stream' : 'request')` — the
   * AIRequest interface from 07-01 is empty for now; cast inline so the
   * `stream?: boolean` field is read without type-system gymnastics. Phase 08
   * expands AIRequest and removes the cast.
   */
  async invoke(req: AIRequest): Promise<AIResponse> {
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      throw new Error('No AI provider configured');
    }
    const cfg = this.settings.getProviderConfig(provider);
    const wantStream = (req as { stream?: boolean }).stream === true;
    const fetcher = obsidianFetch(wantStream ? 'stream' : 'request');
    const adapter = resolveAdapter(provider, cfg, fetcher);
    return adapter.invoke(req);
  }

  /**
   * Add a USD cost amount to the daily ledger. Delegates to
   * `SettingsStore.addCostLedger` which performs day-rollover-on-write
   * (Plan 07-01 decision F). No cap enforcement here — Phase 09 polishes.
   */
  async addCost(usd: number): Promise<void> {
    await this.settings.addCostLedger(usd);
  }
}
