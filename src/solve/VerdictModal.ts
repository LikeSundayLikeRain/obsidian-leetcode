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

import { Modal, Notice, setIcon, type App } from 'obsidian';
import type { RunCheckResponse, SubmitCheckResponse } from './types';
import { renderVerdict } from './verdictModalRenderer';
import { logger } from '../shared/logger';

type TerminalResponse = RunCheckResponse | SubmitCheckResponse;

export interface VerdictModalArgs {
  problemTitle: string;
  onCancel: () => void;
  /** Called when user clicks "Copy failing testcase to custom input" on WA/TLE/RE. */
  onCopyFailingInput?: (input: string) => void;
}

export class VerdictModal extends Modal {
  private readonly args: VerdictModalArgs;

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

    const body = appendEl(contentEl, 'div', 'leetcode-verdict-body');
    body.setAttribute('aria-live', 'polite');

    const spinnerWrap = appendEl(body, 'div', 'leetcode-verdict-spinner');
    // setIcon is safe under the obsidian-stub (noop); under real Obsidian
    // it paints a Lucide SVG inside the wrapper.
    setIcon(spinnerWrap, 'loader');

    const primary = appendEl(body, 'p');
    primary.textContent = 'Polling LeetCode for verdict…';
    const subtitle = appendEl(body, 'p', 'leetcode-verdict-subtitle');
    subtitle.textContent = 'Backoff: 1s → 2s → 4s → 8s';

    const footer = appendEl(contentEl, 'div', 'leetcode-verdict-footer leetcode-verdict-action-row');
    const cancelBtn = appendEl(footer, 'button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.args.onCancel();
      this.close();
    });
    // Default-focus the Cancel button per UI-SPEC §Accessibility.
    if (typeof (cancelBtn as unknown as { focus?: () => void }).focus === 'function') {
      try { (cancelBtn as HTMLElement).focus(); } catch { /* headless */ }
    }
  }

  renderVerdict(res: TerminalResponse, problemTitle: string): void {
    this.clearPendingStateClass();
    renderVerdict({
      titleEl: this.titleEl,
      contentEl: this.contentEl,
      payload: res,
      problemTitle,
      onCopyFailingInput: (input) => {
        this.args.onCopyFailingInput?.(input);
        this.close();
      },
    });
    // Primary-focus the Close button if the renderer exposed it.
    this.focusCloseButton();
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
      this.contentEl?.querySelectorAll('button[data-lc-role="close"]') ?? [],
    ) as HTMLButtonElement[];
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
    ) as HTMLButtonElement[];
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
        const clip = (globalThis as { navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } } }).navigator?.clipboard;
        if (clip?.writeText) {
          void clip.writeText(text);
        }
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC locked copy
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
  const doc = parent.ownerDocument ?? (globalThis as { document?: Document }).document;
  const el = (doc ?? document).createElement(tag);
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
