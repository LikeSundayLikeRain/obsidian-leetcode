// src/ai/AIClient.ts
//
// Phase 07 Plan 02 — thin facade over @ai-sdk/* providers. All AI HTTP flows
// through `obsidianFetch(mode)` injected at adapter construction. leetcode.com
// calls NEVER touch this module — they remain on installRequestUrlFetcher's
// path (CONTEXT canonical_refs invariant; AIPROV-05 grep gate enforces).
//
// Phase 07 Plan 05 (this commit) wires the disclosure gate at the AIClient
// seam: BOTH `probe()` and `invoke()` consult `ProviderConfig.disclosureAck-
// nowledged` BEFORE issuing any HTTP. When the flag is false, the injected
// `requireDisclosure(provider, cfg)` helper opens the AIDisclosureModal and
// awaits the user's choice; Continue persists `disclosureAcknowledged: true`
// via SettingsStore.setProviderConfig and the call proceeds; Cancel either
// returns `{ ok: false, errorMessage: 'AI call cancelled' }` (probe — Plan
// 07-04 testActiveAIConnection's Notice flow renders this as
// `'<provider name>: AI call cancelled'`) or throws
// `Error('AI call cancelled')` (invoke — Phase 08 callers can catch + branch).
// The default `requireDisclosure` is `async () => true` — a no-op that keeps
// Plan 07-02's tests green and lets Phase-internal callers that don't need
// the gate (none in v1.1, but the seam stays open for Phase 11+) opt out
// explicitly. Production wiring lives in `src/main.ts:requireAIDisclosure`.
//
// Mirrors LeetCodeClient: ctor takes SettingsStore, methods are stateless,
// `probe` follows fetchUsername never-throw posture, `invoke` follows
// getProblemDetail re-throw posture so Phase 08 callers can branch on
// disclosure-cancel vs network vs cap exceeded.
//
// T-07-03-bypass mitigation: the gate lives at the AIClient boundary, NOT
// at the call site. Future callers that bypass AIClient by importing
// `resolveAdapter` directly defeat the gate; the JSDoc + 07-RESEARCH §
// Security threat #5 document the contract; eslint-plugin-obsidianmd has
// no rule for this and the AIPROV-05 LC-isolation gate doesn't catch it
// — community-plugin review is the human safety net.
import type { SettingsStore } from '../settings/SettingsStore';
import type { AIProvider, AIRequest, AIResponse, ProbeResult, ProviderConfig } from './types';
import { obsidianFetch } from './obsidianFetch';
import { resolveAdapter } from './providers';
import type { StreamTextResult } from 'ai';

/**
 * Phase 08 Plan 02 — discriminated tuple returned by AIClient.invokeStream.
 * The modal (Plan 08-03) consumes one of two body strategies depending on
 * `kind`:
 *   - 'stream': iterate `result.textStream` for incremental render.
 *   - 'buffered': await `text` once and render the full response in one
 *     pass; UI shows 'Thinking…' + mm:ss counter while the Promise is
 *     unresolved (RESEARCH §"F-Refinement").
 *
 * Both variants own an `abortController` whose `signal` was already passed
 * through to the underlying fetch via `streamText({ abortSignal })` /
 * `generateText({ abortSignal })`. Caller can `abortController.abort()`
 * to short-circuit the in-flight call.
 */
export type InvokeStreamResult =
  | {
      kind: 'stream';
      result: StreamTextResult<Record<string, never>, never>;
      abortController: AbortController;
    }
  | {
      kind: 'buffered';
      text: Promise<string>;
      abortController: AbortController;
    };

/**
 * Disclosure helper signature. Returns true on Continue (the AI call may
 * proceed), false on Cancel (the call must short-circuit). The implementation
 * lives on `LeetCodePlugin.requireAIDisclosure` (src/main.ts) — it opens
 * AIDisclosureModal and resolves on the user's button click. The signature
 * is exported so test files can construct typed spies.
 */
export type RequireDisclosureFn = (
  provider: AIProvider,
  cfg: ProviderConfig,
) => Promise<boolean>;

export class AIClient {
  private settings: SettingsStore;
  private requireDisclosure: RequireDisclosureFn;

  constructor(
    settings: SettingsStore,
    requireDisclosure: RequireDisclosureFn = async () => true,
  ) {
    this.settings = settings;
    this.requireDisclosure = requireDisclosure;
  }

  /**
   * Connectivity probe for the given provider. NEVER throws — wraps adapter
   * exceptions and returns `{ ok: false, errorMessage }`. The adapters
   * themselves also never throw, but the wrapper guarantee is contract-
   * ratifying for callers that expect a Result-shaped return regardless of
   * adapter discipline drift.
   *
   * Disclosure gate (Phase 07 Plan 05): when
   * `cfg.disclosureAcknowledged === false` the gate opens the modal via
   * `requireDisclosure(provider, cfg)`. Cancel returns
   * `{ ok: false, errorMessage: 'AI call cancelled' }` — preserves the
   * ProbeResult shape so testActiveAIConnection's Notice flow renders the
   * cancellation as `'<provider name>: AI call cancelled'`. Continue
   * persists `disclosureAcknowledged: true` via setProviderConfig BEFORE
   * the adapter probe — re-reading cfg after persist guarantees the
   * adapter sees the post-sanitize state.
   *
   * Routes through `obsidianFetch('request')` — connectivity probes never
   * stream.
   */
  async probe(provider: AIProvider): Promise<ProbeResult> {
    try {
      let cfg = this.settings.getProviderConfig(provider);
      if (!cfg.disclosureAcknowledged) {
        const ack = await this.requireDisclosure(provider, cfg);
        if (!ack) {
          return { ok: false, errorMessage: 'AI call cancelled' };
        }
        await this.settings.setProviderConfig(provider, {
          ...cfg,
          disclosureAcknowledged: true,
        });
        // Re-read after persist — sanitizeProviderConfig may have
        // normalized the cfg (e.g. baseUrl trimming) and the adapter must
        // see the post-sanitize state.
        cfg = this.settings.getProviderConfig(provider);
      }
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
   * Disclosure gate (Phase 07 Plan 05): when
   * `cfg.disclosureAcknowledged === false` the gate opens the modal via
   * `requireDisclosure(provider, cfg)`. Cancel throws
   * `Error('AI call cancelled')` — re-throw posture matches the
   * LeetCodeClient.getProblemDetail re-throw so Phase 08 callers can catch
   * + branch (the 'AI call cancelled' string is locked verbatim). The
   * empty-provider check fires BEFORE the disclosure gate so a missing
   * provider surfaces as a configuration error rather than as a stuck
   * modal.
   *
   * Routes through `obsidianFetch(req.stream ? 'stream' : 'request')` — Phase
   * 08 Plan 01 expanded the AIRequest interface so `req.stream` is type-clean
   * here without an inline cast.
   */
  async invoke(req: AIRequest): Promise<AIResponse> {
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      throw new Error('No AI provider configured');
    }
    let cfg = this.settings.getProviderConfig(provider);
    if (!cfg.disclosureAcknowledged) {
      const ack = await this.requireDisclosure(provider, cfg);
      if (!ack) {
        throw new Error('AI call cancelled');
      }
      await this.settings.setProviderConfig(provider, {
        ...cfg,
        disclosureAcknowledged: true,
      });
      cfg = this.settings.getProviderConfig(provider);
    }
    const wantStream = req.stream === true;
    const fetcher = obsidianFetch(wantStream ? 'stream' : 'request');
    const adapter = resolveAdapter(provider, cfg, fetcher);
    // Phase 07 Plan 07 — WR-01 fix. The `await` is contract-load-bearing:
    // the JSDoc above promises 're-throws on adapter error (mirrors
    // LeetCodeClient.getProblemDetail) so feature-layer callers in
    // Phase 08/09 can branch on the error type'. Without await, a future
    // maintainer wrapping this body in try/catch would be silently
    // betrayed — the rejection would bubble out as the returned promise's
    // rejection rather than entering the synchronous catch.
    //
    // Phase 08 Plan 02 — adapter.invoke is gone; the buffered live-call
    // path now lives at adapter.bufferedInvoke(prompt, signal). When the
    // caller doesn't supply a signal, we mint a fresh AbortController so
    // the adapter call stays sync-cancellable. Cost is added by the
    // caller (Phase 08 Plan 03's modal owns onFinish) — invoke() returns
    // text + usage and a usdCost of 0 to preserve the AIResponse shape.
    const signal = req.signal ?? new AbortController().signal;
    const r = await adapter.bufferedInvoke(req.prompt, signal);
    return {
      text: r.text,
      usdCost: 0,
      ...(r.usage ? { usage: r.usage } : {}),
    };
  }

  /**
   * Phase 08 Plan 02 — streaming live-call entrypoint. Returns a discriminated
   * tuple the modal (Plan 08-03) switches body strategy on. Mirrors
   * `invoke`'s disclosure-gate prologue VERBATIM (provider-null check, ack
   * persist via setProviderConfig, re-read cfg) — every existing invoke()
   * disclosure-gate test case has an analog here (T-08-02-EoP mitigation).
   *
   * Stream-first posture: when `req.stream === true`, we try
   * `obsidianFetch('stream')` (electron.net.fetch) FIRST. If
   * `loadElectronNet()` throws (renderer can't access Node require — mobile
   * or sandbox edge), we catch and fall through to the buffered path
   * (`obsidianFetch('request')` + adapter.bufferedInvoke). The discriminated
   * `kind` makes the path explicit at the modal layer.
   *
   * AbortController cascade: AIClient.invokeStream OWNS the inner
   * AbortController (passed into the SDK's `streamText({ abortSignal })`).
   * If the caller supplies `req.signal`, we register an `abort` listener so
   * an external abort cascades through. The caller can also abort via
   * `result.abortController.abort()` directly.
   *
   * 'AI call cancelled' (verbatim) on disclosure-cancel — locked Phase 07-05
   * contract; 'No AI provider configured' (verbatim) on null active provider.
   */
  async invokeStream(req: AIRequest): Promise<InvokeStreamResult> {
    const provider = this.settings.getActiveAIProvider();
    if (provider === null) {
      throw new Error('No AI provider configured');
    }
    let cfg = this.settings.getProviderConfig(provider);
    if (!cfg.disclosureAcknowledged) {
      const ack = await this.requireDisclosure(provider, cfg);
      if (!ack) {
        throw new Error('AI call cancelled');
      }
      await this.settings.setProviderConfig(provider, {
        ...cfg,
        disclosureAcknowledged: true,
      });
      cfg = this.settings.getProviderConfig(provider);
    }

    // Mint the inner AbortController. If the caller supplies their own
    // signal (e.g. modal's external controller), cascade aborts into ours.
    const abortController = new AbortController();
    if (req.signal) {
      if (req.signal.aborted) {
        abortController.abort();
      } else {
        req.signal.addEventListener('abort', () => abortController.abort(), { once: true });
      }
    }

    // Stream-first path: only attempt if caller asked for streaming. If
    // obsidianFetch('stream') throws (loadElectronNet failure), fall
    // through to the buffered path.
    if (req.stream === true) {
      try {
        const fetcher = obsidianFetch('stream');
        const adapter = resolveAdapter(provider, cfg, fetcher);
        const result = adapter.streamInvoke(req.prompt, abortController.signal);
        return { kind: 'stream', result, abortController };
      } catch {
        // Fall through to buffered path. The catch is intentionally broad
        // because loadElectronNet() throws an Error on Node-require
        // unavailability; we don't care about the inner cause — Phase 08's
        // contract is "stream if you can, buffer if you can't".
      }
    }

    // Buffered path (either req.stream !== true or stream-init threw).
    const fetcher = obsidianFetch('request');
    const adapter = resolveAdapter(provider, cfg, fetcher);
    const text = adapter
      .bufferedInvoke(req.prompt, abortController.signal)
      .then((r) => r.text);
    return { kind: 'buffered', text, abortController };
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
