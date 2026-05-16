// src/ai/AIStreamModal.ts
//
// Phase 08 Plan 03 Task 2 — AIStreamModal: live-render AI Debug response
// modal with debounced MarkdownRenderer.render, mm:ss counter on the
// fallback path, AbortController-owned Cancel UX (AIDBG-03), and
// Copy-to-clipboard footer.
//
// Composite analog (08-PATTERNS):
//   - VerdictModal scaffolding + onClose anti-zombie + clipboard Notice
//   - ProblemPreviewView MarkdownRenderer.render call shape (markdown-rendered
//     co-class on the body so reading-mode CSS cascade applies)
//   - AIDisclosureModal lifecycle posture (acknowledged/decided guards)
//   - shared/timers setWindowTimeout for the 100ms debounce ring buffer +
//     the mm:ss counter
//
// Locked grep targets (08-PLAN.md acceptance_criteria):
//   - RENDER_DEBOUNCE_MS = 100
//   - COUNTER_TICK_MS = 1000
//   - this.abortController.signal.aborted (Pitfall 2 — signal-first check)
//   - addCost(0) on cancel branch (Pitfall 6)
//   - MarkdownRenderer.render(this.app, ... (Phase 06 precedent + this-as-Component)
//   - Verbatim copy: 'AI response copied.', 'Clipboard unavailable.',
//     'Cancelled — partial response below.', 'AI call cancelled.',
//     "Couldn't reach <provider>." (apostrophe is U+2019)
//
// Logging discipline (Pitfall 10): NEVER log full prompts/responses. Log
// only metadata: provider, model, promptCharCount, duration, ok/err. The
// no-prompt-logging.test.ts grep gate (Plan 08-02) enforces this.

import {
  Component,
  MarkdownRenderer,
  Modal,
  Notice,
  type App,
} from 'obsidian';
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';
import { logger } from '../shared/logger';
import type { AIClient, InvokeStreamResult } from './AIClient';
import { prettyName, type AIProvider } from './types';
import { estimateCostUsd } from './pricing';

/**
 * Locked debounce window (08-RESEARCH §"Pitfall 1" Tier 1). 100ms batches
 * 3-5 streaming chunks at typical Anthropic rate (~30 tokens/sec) before
 * each MarkdownRenderer.render call — enough to mostly close half-fences
 * before paint while remaining visually responsive.
 */
const RENDER_DEBOUNCE_MS = 100;

/**
 * Locked counter cadence (08-UI-SPEC §"Typography" + §"Behavior Contract").
 * 1000ms ticks render `Thinking… mm:ss`. Counter freezes on first stream
 * chunk; clamps at `99:59+` defensively (Phase 09 cap pre-empts in practice).
 */
const COUNTER_TICK_MS = 1000;

/** mm:ss counter clamp (defensive — Phase 09's cost cap should pre-empt). */
const COUNTER_CLAMP_SEC = 99 * 60 + 59;

/** Vendor error message truncation per 08-UI-SPEC §"Body states". */
const ERROR_MSG_MAX_LEN = 200;

export interface AIStreamModalArgs {
  /** Active AI provider — drives modal title via prettyName(). */
  provider: AIProvider;
  /** Pre-assembled prompt (Plan 08-04 calls buildDebugPrompt and passes it in). */
  prompt: string;
  /** AIClient seam (disclosure gate fires automatically inside invokeStream). */
  aiClient: AIClient;
  /** Active provider's model identifier (drives estimateCostUsd lookup). */
  model?: string;
  /**
   * Phase 08 Plan 04 — feature-specific disclosure copy threaded by the
   * caller. The actual disclosure gate is owned by AIClient (via the
   * plugin-injected `requireAIDisclosure` factory in src/main.ts), so this
   * field is informational / forward-compat: it documents which feature
   * bullet was composed for the call. Plan 08-04 callers MUST pass
   * `withDebugBullet(DISCLOSURE_BASE_COPY)` so the key-link contract from
   * 08-04-PLAN.md (`from: src/main.ts:openAIDebug to: new AIStreamModal(...,
   * { ..., disclosureCopy: withDebugBullet(...) })`) is satisfied. The
   * modal does not currently render this copy itself — the disclosure
   * modal opened by `requireAIDisclosure` reads `DISCLOSURE_BASE_COPY`
   * directly. Future phases (e.g. AI Review in Phase 09) may surface the
   * extended copy in a confirm-before-send strip; until then the field is
   * a contract anchor that prevents future regressions where a caller
   * forgets the feature bullet.
   */
  disclosureCopy?: { willSend: readonly string[]; neverSends: readonly string[] };
}

/**
 * Live-streaming AI Debug response modal. Opens immediately with `Thinking…`
 * placeholder + counter; switches to debounced MarkdownRenderer.render once
 * the first chunk arrives; supports mid-stream Cancel via AbortController +
 * a Copy-to-clipboard footer post-completion.
 *
 * Lifecycle:
 *   - `onOpen()` paints title + body (Thinking…) + footer (Cancel default-focus);
 *     starts the mm:ss counter; calls aiClient.invokeStream().
 *   - On `kind === 'stream'`: for-await consumes textStream; first chunk
 *     replaces Thinking…, stops counter, scheduleRender per chunk; on natural
 *     stream-end, addCost(estimate) and swap footer to [Copy response] [Close].
 *   - On `kind === 'buffered'`: counter keeps ticking until the text Promise
 *     resolves; single MarkdownRenderer.render runs on the full text; addCost(0)
 *     because usage isn't exposed on the buffered fallback Promise (modal
 *     receives just `text: Promise<string>`).
 *   - Cancel: abortController.abort() → for-await throws → signal.aborted check
 *     → addCost(0) → swap footer to Cancelled.
 *   - Modal-dismiss while in flight: onClose() aborts via the same controller.
 */
export class AIStreamModal extends Modal {
  private buffer = '';
  private bodyEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private renderTimer: TimerHandle | null = null;
  private counterTimer: TimerHandle | null = null;
  private elapsedSec = 0;
  private readonly abortController = new AbortController();
  private completed = false;
  private cancelled = false;
  private startMs = 0;
  /**
   * Owns the MarkdownRenderer.render Component lifecycle. Mirrors
   * `src/graph/SubmissionDetailModal.ts:70` (D-31 Pitfall 6) — `load()` fires
   * in onOpen BEFORE the first MarkdownRenderer.render call; `unload()` fires
   * in onClose so CM6 children dispose cleanly. Passing `this.component` (a
   * real Component instance) as the 5th MarkdownRenderer.render arg also
   * satisfies the obsidianmd/no-plugin-as-component lint rule.
   */
  private readonly component: Component = new Component();

  constructor(
    app: App,
    private readonly args: AIStreamModalArgs,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    // D-31 Pitfall 6 — Component.load() MUST be called before any
    // MarkdownRenderer.render invocation or child components will leak.
    this.component.load();

    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-ai-stream');
    titleEl.setText(`AI Debug — ${prettyName(this.args.provider)}`);

    this.bodyEl = contentEl.createDiv({
      cls: 'leetcode-ai-stream-body markdown-rendered',
    });
    this.bodyEl.setAttribute('aria-live', 'polite');

    // Initial Thinking… placeholder — visible during the disclosure-gate
    // round-trip and pre-first-chunk window. Counter ticks via setWindowTimeout.
    this.bodyEl.createEl('p', {
      cls: 'leetcode-ai-stream-thinking',
      text: 'Thinking…',
    });

    this.footerEl = contentEl.createDiv({ cls: 'leetcode-ai-stream-footer' });
    this.renderCancelFooter();

    this.startCounter();
    this.startMs = Date.now();

    // Logger discipline (Pitfall 10): metadata only, never the prompt body.
    logger.debug('ai-stream.start', {
      provider: this.args.provider,
      model: this.args.model ?? '(unknown)',
      promptCharCount: this.args.prompt.length,
    });

    let handle: InvokeStreamResult;
    try {
      handle = await this.args.aiClient.invokeStream({
        prompt: this.args.prompt,
        stream: true,
        signal: this.abortController.signal,
      });
    } catch (err) {
      // The disclosure-cancel path throws Error('AI call cancelled') from
      // AIClient.invokeStream. Surface it as the disclosure-cancelled body
      // state per 08-UI-SPEC §"Body states".
      this.handleInvokeError(err);
      return;
    }

    if (handle.kind === 'stream') {
      await this.consumeStream(handle.result);
    } else {
      await this.renderBuffered(handle.text);
    }
  }

  onClose(): void {
    // AIDBG-03 anti-zombie: if the user dismissed mid-flight (Esc / X /
    // overlay-click), abort via the same controller the Cancel button uses.
    if (!this.completed && !this.cancelled) {
      this.cancelled = true;
      try {
        this.abortController.abort();
      } catch {
        /* ignore — best-effort abort during teardown */
      }
    }
    if (this.renderTimer != null) {
      clearWindowTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.stopCounter();
    // Dispose CM6 child components owned by the markdown renderer.
    this.component.unload();
    this.contentEl.empty();
  }

  // ── Stream / buffered consumers ────────────────────────────────────────

  private async consumeStream(
    result: Extract<InvokeStreamResult, { kind: 'stream' }>['result'],
  ): Promise<void> {
    let firstChunkSeen = false;
    try {
      // The result object exposes `textStream: AsyncIterableStream<string>`
      // (Vercel AI SDK 6.x). Each chunk is a delta — append to buffer.
      const textStream = (
        result as unknown as {
          // eslint-disable-next-line no-undef -- AsyncIterable is a TS lib type
          textStream: AsyncIterable<string>;
        }
      ).textStream;
      for await (const chunk of textStream) {
        // Pitfall 2 — signal-first cancel check (the SDK may wrap AbortError
        // as APICallError; aborting AND consuming the next chunk both throw,
        // but the catch branch reads signal.aborted regardless).
        if (this.abortController.signal.aborted) {
          throw new Error('aborted');
        }
        // Assumption A3 guard — zero-length chunks are no-ops.
        if (typeof chunk !== 'string' || chunk.length === 0) continue;
        if (!firstChunkSeen) {
          firstChunkSeen = true;
          this.bodyEl.empty();
          this.stopCounter();
        }
        this.buffer += chunk;
        this.scheduleRender();
      }
      // Stream ended naturally — flush final render + cost ledger.
      this.completed = true;
      await this.flushRender();
      let cost = 0;
      try {
        const usage = await (
          result as unknown as {
            usage: PromiseLike<{ inputTokens?: number; outputTokens?: number }>;
          }
        ).usage;
        if (usage) {
          cost = estimateCostUsd(this.args.model ?? '', {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          });
        }
      } catch {
        // result.usage rejects on mid-stream abort (Pitfall 6) — but we
        // only reach here on natural end. Defensive catch in case the SDK
        // surfaces an error after the for-await loop closed cleanly.
        cost = 0;
      }
      await this.args.aiClient.addCost(cost);
      this.swapToCompletionFooter();
      logger.debug('ai-stream.finish', {
        provider: this.args.provider,
        durationMs: Date.now() - this.startMs,
        ok: true,
      });
    } catch (err) {
      // Pitfall 2: check signal.aborted FIRST. The SDK may wrap AbortError as
      // APICallError, so inspecting err.name is unreliable.
      if (this.abortController.signal.aborted) {
        this.cancelled = true;
        // Pitfall 6: do NOT await result.usage in the abort path — it
        // rejects on stream-error. Add 0 to the cost ledger.
        await this.args.aiClient.addCost(0);
        this.swapToCancelledFooter();
        logger.debug('ai-stream.abort', {
          provider: this.args.provider,
          durationMs: Date.now() - this.startMs,
        });
        return;
      }
      this.handleStreamError(err);
    }
  }

  private async renderBuffered(textPromise: Promise<string>): Promise<void> {
    // Pitfall 3: requestUrl has no abort. The pending Promise is wrapped in
    // a swallowing catch so an aborted-then-resolved request doesn't surface
    // as an unhandled rejection. The signal-aborted check inside the try
    // block ensures we don't render after the modal closed.
    try {
      const text = await textPromise;
      if (this.cancelled || this.abortController.signal.aborted) {
        // Modal already closed (or Cancel clicked) — silently swallow.
        return;
      }
      this.completed = true;
      this.stopCounter();
      this.bodyEl.empty();
      this.buffer = text;
      // 5th arg is `this.component` (a Component instance owned by this
      // modal). Phase 06 PreviewView precedent + obsidianmd/no-plugin-as-component.
      await MarkdownRenderer.render(this.app, this.buffer, this.bodyEl, '', this.component);
      // Buffered path: cost ledger gets 0 because usage isn't exposed by
      // AIClient.invokeStream's buffered shape (text: Promise<string> only).
      // Phase 09 may revisit if buffered usage becomes available.
      await this.args.aiClient.addCost(0);
      this.swapToCompletionFooter();
      logger.debug('ai-stream.finish', {
        provider: this.args.provider,
        durationMs: Date.now() - this.startMs,
        ok: true,
      });
    } catch (err) {
      if (this.abortController.signal.aborted || this.cancelled) {
        // Pitfall 3 — swallow Promise rejection on aborted fallback path.
        return;
      }
      this.handleStreamError(err);
    }
  }

  // ── Render scheduling (100ms debounce ring buffer) ─────────────────────

  private scheduleRender(): void {
    if (this.renderTimer != null) return;
    this.renderTimer = setWindowTimeout(() => {
      this.renderTimer = null;
      void this.flushRender();
    }, RENDER_DEBOUNCE_MS);
  }

  private async flushRender(): Promise<void> {
    if (this.renderTimer != null) {
      clearWindowTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    // Empty + re-render is the simplest correct strategy (Pattern 4 from
    // 08-RESEARCH). The 100ms debounce keeps the call rate bounded.
    this.bodyEl.empty();
    // 5th arg is `this.component` (a Component instance owned by this modal).
    await MarkdownRenderer.render(this.app, this.buffer, this.bodyEl, '', this.component);
  }

  // ── mm:ss counter ──────────────────────────────────────────────────────

  private startCounter(): void {
    this.counterTimer = setWindowTimeout(() => this.tick(), COUNTER_TICK_MS);
  }

  private tick(): void {
    if (this.counterTimer == null) return;
    this.elapsedSec += 1;
    const labelEl = this.bodyEl.querySelector('.leetcode-ai-stream-thinking');
    if (labelEl) {
      labelEl.textContent =
        this.elapsedSec >= COUNTER_CLAMP_SEC
          ? // NBSP between word and digits — locked per 08-UI-SPEC.
            'Thinking…\u00A099:59+'
          : `Thinking…\u00A0${pad(Math.floor(this.elapsedSec / 60))}:${pad(this.elapsedSec % 60)}`;
    }
    if (this.elapsedSec >= COUNTER_CLAMP_SEC) {
      // Defensive clamp — freeze the counter at 99:59+.
      this.stopCounter();
      return;
    }
    this.counterTimer = setWindowTimeout(() => this.tick(), COUNTER_TICK_MS);
  }

  private stopCounter(): void {
    if (this.counterTimer != null) {
      clearWindowTimeout(this.counterTimer);
      this.counterTimer = null;
    }
  }

  // ── Footer state machine ───────────────────────────────────────────────

  private renderCancelFooter(): void {
    this.footerEl.empty();
    const cancelBtn = this.footerEl.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.handleCancel());
    // Default-focus per 08-UI-SPEC §Accessibility.
    if (typeof cancelBtn.focus === 'function') {
      try {
        cancelBtn.focus();
      } catch {
        /* headless test env — focus may throw */
      }
    }
  }

  private swapToCompletionFooter(): void {
    this.footerEl.empty();
    const copyBtn = this.footerEl.createEl('button', { text: 'Copy response' });
    copyBtn.addEventListener('click', () => this.handleCopy());
    const closeBtn = this.footerEl.createEl('button', { text: 'Close' });
    closeBtn.addEventListener('click', () => this.close());
    if (typeof closeBtn.focus === 'function') {
      try {
        closeBtn.focus();
      } catch {
        /* headless */
      }
    }
  }

  private swapToCancelledFooter(): void {
    // Prepend the cancelled indicator above the existing rendered body — per
    // 08-UI-SPEC §"Body states" (Cancelled mid-stream).
    const cancelledEl = this.bodyEl.ownerDocument.createElement('p');
    cancelledEl.className = 'leetcode-ai-stream-cancelled';
    cancelledEl.textContent = 'Cancelled — partial response below.';
    this.bodyEl.insertBefore(cancelledEl, this.bodyEl.firstChild);
    this.swapToCompletionFooter();
  }

  private swapToErrorFooter(): void {
    this.footerEl.empty();
    const closeBtn = this.footerEl.createEl('button', { text: 'Close' });
    closeBtn.addEventListener('click', () => this.close());
    if (typeof closeBtn.focus === 'function') {
      try {
        closeBtn.focus();
      } catch {
        /* headless */
      }
    }
  }

  // ── Click handlers ─────────────────────────────────────────────────────

  private handleCancel(): void {
    if (this.completed || this.cancelled) return;
    this.cancelled = true;
    try {
      this.abortController.abort();
    } catch {
      /* ignore */
    }
    this.stopCounter();
    // The for-await catch (or renderBuffered's try/catch) will swap the
    // footer once the rejection lands; for the buffered fast-path Cancel
    // (no partial output exists), close the modal immediately.
    if (this.buffer.length === 0 && this.counterTimer == null) {
      // Defensive: this branch is unreachable on the buffered path because
      // counterTimer is non-null until resolution; left in place to make
      // the modal-close fallback explicit.
    }
  }

  private handleCopy(): void {
    try {
      const clip = activeWindow.navigator?.clipboard;
      if (clip?.writeText) {
        void clip.writeText(this.buffer);
      }
      new Notice('AI response copied.', 2000);
    } catch (err) {
      logger.debug('ai-stream.copy: clipboard unavailable', err);
      new Notice('Clipboard unavailable.', 4000);
    }
  }

  // ── Error rendering ────────────────────────────────────────────────────

  private handleInvokeError(err: unknown): void {
    // Disclosure-cancel path: AIClient.invokeStream throws Error('AI call cancelled').
    const message = err instanceof Error ? err.message : String(err);
    this.stopCounter();
    if (message === 'AI call cancelled') {
      this.cancelled = true;
      this.bodyEl.empty();
      const p = this.bodyEl.ownerDocument.createElement('p');
      p.textContent = 'AI call cancelled.';
      this.bodyEl.appendChild(p);
      this.swapToErrorFooter();
      return;
    }
    this.handleStreamError(err);
  }

  private handleStreamError(err: unknown): void {
    this.stopCounter();
    const message = err instanceof Error ? err.message : String(err);
    this.bodyEl.empty();
    // Apostrophe is U+2019 right-single-quote per UI-SPEC §"Body states".
    const heading = this.bodyEl.ownerDocument.createElement('h3');
    heading.textContent = `Couldn’t reach ${prettyName(this.args.provider)}.`;
    this.bodyEl.appendChild(heading);
    const detail = this.bodyEl.ownerDocument.createElement('p');
    detail.className = 'leetcode-ai-stream-error';
    detail.textContent = message.slice(0, ERROR_MSG_MAX_LEN);
    this.bodyEl.appendChild(detail);
    this.swapToErrorFooter();
    logger.debug('ai-stream.finish', {
      provider: this.args.provider,
      durationMs: Date.now() - this.startMs,
      ok: false,
    });
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
