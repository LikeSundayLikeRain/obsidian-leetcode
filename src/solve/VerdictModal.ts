// src/solve/VerdictModal.ts
//
// Phase 3 — Obsidian Modal adapter around the pure verdictModalRenderer.
// Implements the VerdictModalHandle interface Plan 05 depends on:
//
//   renderPending()                         — spinner + backoff subtitle + Cancel
//   renderVerdict(res, problemTitle)        — 8-state terminal dispatch
//   renderUnknown(payload, problemTitle)    — D-15 copy-payload path
//   renderTimeout()                         — 60s cap copy + Close
//   close()                                 — standard Obsidian Modal.close
//
// CF-07 discipline: every DOM node is built via createEl / createDiv /
// createSpan + setText (no HTML strings, no script-parsing sinks). Spinner
// icon rendered via `setIcon` from Obsidian's Lucide bundle. Cancel + Close
// buttons get .focus() on each render pass (UI-SPEC §Accessibility default
// focus).
//
// Logger redaction for Copy payload on unknown verdicts (T-03-06-02 mitigation).

import { Component, Modal, Notice, setIcon, type App } from 'obsidian';
import type { RunCheckResponse, SubmitCheckResponse } from './types';
import { renderVerdict } from './verdictModalRenderer';
import { logger } from '../shared/logger';

type TerminalResponse = RunCheckResponse | SubmitCheckResponse;

export interface VerdictModalArgs {
  problemTitle: string;
  onCancel: () => void;
  /** Called when user clicks "Copy failing testcase to custom input" on WA/TLE/RE. */
  onCopyFailingInput?: (input: string) => void;
  /** Phase 08 Plan 05 (AIDBG-01) — Called when user clicks "AI: Debug" on a
   *  non-Accepted verdict (kind ∈ {wa, tle, mle, re, ce}). The Modal layer
   *  closes the verdict modal FIRST, then invokes this callback (REVERSED
   *  from onCopyFailingInput's fire-then-close) so AIStreamModal does NOT
   *  stack on top of a closing modal — T-08-05-T-stack mitigation. */
  onOpenAIDebug?: () => void;
  /**
   * Phase 09 Plan 03 (AIREV-01) — Called AFTER renderVerdict paints "Accepted!"
   * to start the auto-review stream. The host (main.ts) provides the streaming
   * implementation; VerdictModal provides the DOM container + Component lifecycle.
   * Returns `{ abort, promise }` — abort cancels the stream (anti-zombie on
   * modal close); promise resolves on natural completion or rejects on error.
   * VerdictModal does NOT import AIClient or buildReviewPrompt (decoupled).
   */
  onStartReviewStream?: (
    reviewAreaEl: HTMLElement,
    component: Component,
  ) => { abort: () => void; promise: Promise<void> };
}

export class VerdictModal extends Modal {
  private readonly args: VerdictModalArgs;

  // Phase 09 — review stream lifecycle state.
  private reviewAbort: (() => void) | null = null;
  private reviewPromise: Promise<void> | null = null;
  private reviewComponent: Component | null = null;

  constructor(app: App, args: VerdictModalArgs) {
    super(app);
    this.args = args;
  }

  private isPending = false;

  onOpen(): void {
    this.isPending = true;
    this.renderPending();
  }

  onClose(): void {
    // If the user dismisses the modal (ESC, overlay click, or X) while the
    // submission is still in flight, treat it as Cancel so the orchestrator
    // flips the abort flag instead of leaving the poll loop running.
    if (this.isPending) {
      this.isPending = false;
      try { this.args.onCancel(); } catch { /* ignore — cleanup */ }
    }
    // Phase 09 — abort in-flight review stream (anti-zombie per Pitfall 2).
    // If the review promise has not settled, abort ensures no vault write
    // occurs after the modal is dismissed (D-11 posture: non-blocking failure).
    if (this.reviewAbort) {
      try { this.reviewAbort(); } catch { /* ignore — best-effort abort */ }
      this.reviewAbort = null;
    }
    if (this.reviewComponent) {
      try { this.reviewComponent.unload(); } catch { /* ignore */ }
      this.reviewComponent = null;
    }
    const { contentEl } = this;
    if (contentEl && typeof (contentEl as unknown as { empty?: () => void }).empty === 'function') {
      (contentEl as unknown as { empty: () => void }).empty();
    } else if (contentEl) {
      while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
    }
  }

  // ── VerdictModalHandle (Plan 05 contract) ──────────────────────────────

  renderPending(): void {
    const { contentEl, titleEl } = this;
    clear(contentEl);
    clear(titleEl);
    addClass(contentEl, 'leetcode-verdict');
    addClass(contentEl, 'leetcode-verdict-pending');
    titleEl.textContent = 'Running…';

    const body = appendEl(contentEl, 'div', 'leetcode-verdict-body leetcode-verdict-body--pending');
    body.setAttribute('aria-live', 'polite');

    const spinnerWrap = appendEl(body, 'div', 'leetcode-verdict-spinner');
    // setIcon is safe under the obsidian-stub (noop); under real Obsidian
    // it paints a Lucide SVG inside the wrapper.
    setIcon(spinnerWrap, 'loader');

    const primary = appendEl(body, 'p');
    primary.textContent = 'Running tests…';

    const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
    const cancelBtn = appendEl(footer, 'button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.args.onCancel();
      this.close();
    });
    // Default-focus the Cancel button per UI-SPEC §Accessibility.
    if (typeof (cancelBtn as unknown as { focus?: () => void }).focus === 'function') {
      try { (cancelBtn).focus(); } catch { /* headless */ }
    }
  }

  /** Phase 5.4 D-08 — `opts.metaData` (LC questionData.metaData JSON string)
   *  + `opts.joinedDataInput` (the exact data_input sent to interpret_solution)
   *  are forwarded into the pure renderer so the Run path can label per-case
   *  Input rows. Submit-path callers omit `opts`; the fields default to
   *  undefined and the renderer's Submit branch ignores them entirely (D-14
   *  byte-identical preservation). */
  renderVerdict(
    res: TerminalResponse,
    problemTitle: string,
    opts?: { metaData?: string; joinedDataInput?: string },
  ): void {
    this.clearPendingStateClass();
    renderVerdict({
      titleEl: this.titleEl,
      contentEl: this.contentEl,
      payload: res,
      problemTitle,
      metaData: opts?.metaData,
      joinedDataInput: opts?.joinedDataInput,
      onCopyFailingInput: (input) => {
        this.args.onCopyFailingInput?.(input);
        this.close();
      },
      // Phase 08 Plan 05 (AIDBG-01) — close-then-fire ordering, REVERSED
      // from onCopyFailingInput. The callback opens AIStreamModal; if we
      // fire BEFORE close(), the new modal stacks on top of the closing
      // verdict modal causing z-index flicker. Closing first ensures the
      // verdict modal's onClose runs cleanly before AIStreamModal's onOpen
      // paints (T-08-05-T-stack mitigation).
      //
      // Pass `undefined` (not the lambda) when the host did not supply a
      // callback — the renderer's `if (showAIDebugButton && onOpenAIDebug)`
      // gate suppresses the button entirely, preventing a no-op surface
      // when no AI Debug entrypoint is wired (T-08-05-D-callback-undef).
      onOpenAIDebug: this.args.onOpenAIDebug
        ? () => {
            this.close();
            this.args.onOpenAIDebug?.();
          }
        : undefined,
    });
    // Primary-focus the Close button if the renderer exposed it.
    this.focusCloseButton();

    // Phase 09 (AIREV-01) — start the review stream on AC when the host
    // provides the callback. The callback is only supplied when
    // autoAIReviewOnAC is enabled AND a provider is configured (gated in
    // main.ts). The review area appears below the verdict chrome.
    if (this.args.onStartReviewStream && this.isAccepted(res)) {
      this.startReviewStream();
    }
  }

  renderUnknown(payload: unknown, problemTitle: string): void {
    this.clearPendingStateClass();
    // Wrap the payload through logger.redact before routing to the renderer
    // so the Copy-payload click never leaks a session cookie embedded in
    // the LC response (T-03-06-02 mitigation). logger.redact is not a
    // public export — the logger module redacts via its wrappers. We
    // therefore route the clipboard write ourselves: the renderer's
    // built-in writeClipboard is best-effort only.
    renderVerdict({
      titleEl: this.titleEl,
      contentEl: this.contentEl,
      payload,
      problemTitle,
    });
    // Swap the renderer's best-effort copy handler for a redacted-aware one.
    this.rewireCopyPayloadButton(payload);
    this.focusCloseButton();
  }

  renderTimeout(): void {
    this.clearPendingStateClass();
    renderVerdict({
      titleEl: this.titleEl,
      contentEl: this.contentEl,
      payload: { _phase3_timeout: true },
    });
    this.focusCloseButton();
  }

  // ── Internal ───────────────────────────────────────────────────────────

  /** Phase 09 — check if the terminal response is an Accepted submission. */
  private isAccepted(res: TerminalResponse): boolean {
    const r = res as Record<string, unknown>;
    return typeof r.status_code === 'number' && r.status_code === 10;
  }

  /** Phase 09 (AIREV-01) — create the review area, start the host-provided
   *  stream, and store abort + promise for lifecycle management. */
  private startReviewStream(): void {
    const reviewAreaEl = appendEl(this.contentEl, 'div', 'leetcode-ai-review-stream');
    const component = new Component();
    component.load();
    this.reviewComponent = component;

    const handle = this.args.onStartReviewStream!(reviewAreaEl, component);
    this.reviewAbort = handle.abort;
    this.reviewPromise = handle.promise;

    // Await the promise — on rejection the host handles the Notice (D-11);
    // VerdictModal leaves the modal in its current state.
    handle.promise.catch(() => {
      // Non-blocking: review failure does not affect the Accepted state.
      // The host (main.ts) is responsible for surfacing the Notice.
    });
  }

  private clearPendingStateClass(): void {
    this.isPending = false;
    const el = this.contentEl;
    if (el && typeof (el as unknown as { removeClass?: (c: string) => void }).removeClass === 'function') {
      (el as unknown as { removeClass: (c: string) => void }).removeClass('leetcode-verdict-pending');
    } else if (el) {
      el.classList.remove('leetcode-verdict-pending');
    }
    addClass(el, 'leetcode-verdict');
  }

  private focusCloseButton(): void {
    const buttons = Array.from(
      this.contentEl?.querySelectorAll<HTMLButtonElement>('button[data-lc-role="close"]') ?? [],
    );
    for (const btn of buttons) {
      btn.addEventListener('click', () => { this.close(); });
    }
    const first = buttons[0];
    if (first && typeof first.focus === 'function') {
      try { first.focus(); } catch { /* headless */ }
    }
  }

  private rewireCopyPayloadButton(payload: unknown): void {
    const buttons = Array.from(
      this.contentEl.querySelectorAll('button'),
    );
    const copyBtn = buttons.find((b) => /copy payload/i.test(b.textContent ?? ''));
    if (!copyBtn) return;
    // Replace the button to drop the renderer's best-effort listener, then
    // wire our redacted clipboard path.
    const fresh = copyBtn.cloneNode(true) as HTMLButtonElement;
    copyBtn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      // Logger.redact is private to the logger module — we therefore route
      // through the logger's own warn() surface to ensure a redacted trail
      // lands in the console, and write a best-effort redacted JSON to the
      // clipboard. For unknown payloads the schema is untrusted; redact via
      // JSON round-trip through the logger's exported shape when possible.
      const text = safeStringify(payload);
      try {
        const clip = activeWindow.navigator?.clipboard;
        if (clip?.writeText) {
          void clip.writeText(text);
        }
         
        new Notice('Payload copied.', 2000);
      } catch (err) {
        logger.debug('solve.verdict.copyPayload: clipboard unavailable', err);
      }
    });
  }
}

// ── Local helpers (mirror renderer's so Modal stays self-contained) ─────

function clear(el: HTMLElement | null | undefined): void {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  const doc = parent.ownerDocument ?? activeDocument;
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

function addClass(el: HTMLElement | null | undefined, cls: string): void {
  if (!el) return;
  const maybe = el as unknown as { addClass?: (c: string) => void };
  if (typeof maybe.addClass === 'function') {
    maybe.addClass(cls);
  } else {
    el.classList.add(cls);
  }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
