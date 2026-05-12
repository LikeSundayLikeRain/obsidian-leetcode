// src/graph/SubmissionDetailModal.ts
//
// Phase 4 Plan 04 — Read-only submission detail modal (D-04).
// Phase 5 Plan 05 (D-31) — code body now renders via MarkdownRenderer.render
// with a Component lifecycle so Obsidian's CM6 syntax highlighter lights up.
// Pitfall 6: `this.component.load()` MUST be called BEFORE the first
// MarkdownRenderer.render invocation; `this.component.unload()` is called
// from onClose() to dispose CM6 child components.
// Phase 5.2 Plan 04 (D-10): the confirm-overwrite gate is REMOVED from the
// Copy-to-Code path. The modal overwrites the existing ## Code fence silently,
// matching the Run/Submit click-through precedent shipped in Phase 5 Plan 05.
// Confirm-on-destructive now lives exclusively on the Reset code command
// (src/solve/resetCodeWithConfirm.ts).
//
// Renders a single past submission's code + metadata. Two user actions:
//   - Copy to ## Code (primary) — silently rewrites via vault.process. The
//     replacement fence's language tag = submitted language (not the existing
//     fence's tag). NEVER creates a ## Solution heading (D-01, GRAPH-01 revised).
//   - Close (secondary) — dismisses the modal.
//
// DOM discipline (CF-07): createElement + textContent only; no innerHTML, no
// HTML-string sinks. The code body is wrapped in a fenced Markdown block and
// handed to MarkdownRenderer.render, which emits CM6-highlighted DOM into the
// container element.
//
// This module MUST NOT import from `./SubmissionPickerModal` — the picker
// opens the detail modal via an injected factory callback (see
// SubmissionPickerDeps.openDetailModal) so the two modules stay decoupled.

import {
  Component,
  MarkdownRenderer,
  Modal,
  type App,
  type TFile,
} from 'obsidian';
import { copyToCode } from './copyToCode';

export interface SubmissionDetailDeps {
  file: TFile;
  problemTitle: string;
  verdictDisplay: string;
  code: string;
  lang: string;
  /** Optional chrome metadata — runtime, memory, submitted-at ISO string.
   *  Picker-launched invocations supply these after detailForSubmission lands. */
  runtimeDisplay?: string;
  memoryDisplay?: string;
  submittedAt?: string;
  /** G-PICKER-MODAL-NOCLOSE-ON-COPY (Plan 05.3-09) — optional success-only
   *  callback invoked after a successful Copy-to-Code click resolves AND
   *  the modal's own safeClose has fired (via performCopy). The callback
   *  fires from the click-handler IIFE AFTER `await this.handleCopyToCode()`
   *  resolves with no rejection — same success-only posture as the existing
   *  G-COPY-MODAL-NOCLOSE contract (T-05.3.06-04 disposition).
   *
   *  Use case: a composing parent modal (e.g., the outer past-submission
   *  picker) can subscribe and dismiss itself in response, so a single Copy
   *  click chains both modals closed. The callback is intentionally generic
   *  `() => void` — the detail modal does NOT know about its parent; the
   *  decoupling header at lines 26–28 forbids importing the picker. */
  onSuccess?: () => void;
}

export class SubmissionDetailModal extends Modal {
  private readonly deps: SubmissionDetailDeps;
  /** D-31 Pitfall 6 — owns the CM6 render lifecycle. `load()` is called in
   *  onOpen BEFORE the first MarkdownRenderer.render; `unload()` fires in
   *  onClose so child components (CM6 editors, token streams) dispose. */
  private readonly component: Component = new Component();
  /** Obsidian's real Modal stores the app on `this.app` from its constructor.
   *  The test stub (class Modal {}) does not — we store an explicit ref so
   *  both contexts work. */
  public app!: App;
  public contentEl!: HTMLElement;
  public titleEl!: HTMLElement;

  constructor(app: App, deps: SubmissionDetailDeps) {
    super(app);
    this.app = app;
    this.deps = deps;
    this.ensureDomContainers();
  }

  async onOpen(): Promise<void> {
    // D-31 Pitfall 6 — Component.load() MUST be called before any
    // MarkdownRenderer.render invocation or child components will leak.
    this.component.load();
    this.ensureDomContainers();
    addClass(this.contentEl, 'leetcode-submissions');
    addClass(this.contentEl, 'leetcode-submissions-detail');
    await this.render();
  }

  onClose(): void {
    // Dispose CM6 child components owned by the markdown renderer.
    this.component.unload();
    clear(this.contentEl);
  }

  private async render(): Promise<void> {
    clear(this.contentEl);
    if (this.titleEl) {
      setText(this.titleEl,
        `${this.deps.verdictDisplay} · ${this.deps.problemTitle}`,
      );
    }

    // Metadata row — runtime · memory · language · submitted-at.
    const meta = appendEl(this.contentEl, 'div', 'leetcode-submissions-meta');
    const metaParts: string[] = [];
    if (this.deps.runtimeDisplay && this.deps.runtimeDisplay.length > 0) {
      metaParts.push(`Runtime: ${this.deps.runtimeDisplay}`);
    }
    if (this.deps.memoryDisplay && this.deps.memoryDisplay.length > 0) {
      metaParts.push(`Memory: ${this.deps.memoryDisplay}`);
    }
    metaParts.push(`Language: ${this.deps.lang}`);
    if (this.deps.submittedAt && this.deps.submittedAt.length > 0) {
      metaParts.push(`Submitted: ${this.deps.submittedAt}`);
    }
    setText(meta, metaParts.join(' · '));

    // D-31 — Code body rendered via MarkdownRenderer.render so Obsidian's
    // CM6 syntax highlighter lights up the fenced block. The container is a
    // <div> wrapper styled under .leetcode-submissions-code (NOT a raw <pre>)
    // so Obsidian's rendered <pre><code> sits inside our scoped block.
    // Pitfall 6: component.load() was called in onOpen before this runs.
    const codeContainer = appendEl(
      this.contentEl,
      'div',
      'leetcode-submissions-code',
    );
    const fenced =
      '```' + (this.deps.lang || 'text') + '\n' + this.deps.code + '\n```\n';
    await MarkdownRenderer.render(
      this.app,
      fenced,
      codeContainer,
      this.deps.file.path,
      this.component,
    );

    // Footer — primary Copy, secondary Close.
    const footer = appendEl(this.contentEl, 'div',
      'leetcode-submissions-footer leetcode-submissions-action-row');

    const copyBtn = appendEl(footer, 'button', 'mod-cta');
    setText(copyBtn, 'Copy to ## Code');
    copyBtn.addEventListener('click', () => {
      // G-COPY-MODAL-NOCLOSE: safeClose() is called inside performCopy() after
      // copyToCode resolves successfully — calling it again here would invoke
      // close() twice on the same modal, which Obsidian interprets as
      // detach-then-reattach (modal flickers and stays open).
      //
      // G-PICKER-MODAL-NOCLOSE-ON-COPY (Plan 05.3-09): after the await
      // resolves successfully (which includes performCopy's internal
      // safeClose), invoke deps.onSuccess?.() so any composing parent modal
      // (e.g., the outer SubmissionPickerModal) can chain its own dismissal.
      // Success-only by design — if handleCopyToCode rejects, control jumps
      // to the catch block and onSuccess never fires (mirrors the existing
      // T-05.3.06-04 success-only disposition).
      void (async () => {
        try {
          await this.handleCopyToCode();
          this.deps.onSuccess?.();
        } catch (err) {
          console.error('[leetcode] copy-to-code failed:', err);
        }
      })();
    });

    const closeBtn = appendEl(footer, 'button');
    setText(closeBtn, 'Close');
    closeBtn.setAttribute('data-lc-role', 'close');
    closeBtn.addEventListener('click', () => {
      this.safeClose();
    });
    // Default-focus the Close button per UI-SPEC §Accessibility — copy is the
    // consequential action so it must not be auto-focused.
    try {
      (closeBtn as HTMLButtonElement).focus();
    } catch {
      /* headless */
    }
  }

  /**
   * Copy-to-code entry point. Phase 5.2 D-10: silent overwrite — the
   * previous confirm gate is removed to match the Run/Submit click-through
   * precedent. Users who need a deliberate destructive reset use the
   * Reset code command (src/solve/resetCodeWithConfirm.ts).
   *
   * G-COPY-MODAL-NOCLOSE (gap-closure post-Plan 06): on successful copy,
   * the modal auto-dismisses so the user lands back on the note immediately
   * after the fence body + lc-language frontmatter sync (Plan 06). If the
   * copy throws (vault lock, processFrontMatter rejection, etc.) the modal
   * STAYS OPEN so the user can see the error context and retry / close
   * manually — the close is success-only by design.
   *
   * G-PICKER-MODAL-NOCLOSE-ON-COPY (Plan 05.3-09): the click handler that
   * calls this method ALSO invokes `deps.onSuccess?.()` after the await
   * resolves so a composing parent modal (the outer SubmissionPickerModal)
   * can chain its dismissal. Same success-only contract — onSuccess never
   * fires on rejection.
   */
  async handleCopyToCode(): Promise<void> {
    await this.performCopy();
  }

  /**
   * Writes the submitted code into the ## Code fenced block. Called by
   * handleCopyToCode and directly by the `copy does not create ## Solution`
   * test.
   *
   * G-COPY-MODAL-NOCLOSE: `safeClose()` runs ONLY after `copyToCode`
   * resolves successfully. If `copyToCode` throws (vault lock,
   * processFrontMatter rejection from Plan 06's lang-sync write, etc.) the
   * rejection propagates to `handleCopyToCode`'s caller and the modal
   * stays open — the user keeps the failure context and can retry or close
   * via the Close button / Esc / outside click.
   *
   * G-PICKER-MODAL-NOCLOSE-ON-COPY (Plan 05.3-09): the click handler that
   * awaits this method invokes `deps.onSuccess?.()` AFTER the await
   * resolves. Rejection here propagates and onSuccess never fires — the
   * outer picker stays open with the failure context, parity with the
   * detail modal's own stay-open behavior.
   */
  async performCopy(): Promise<void> {
    await copyToCode(this.app, this.deps.file, this.deps.code, this.deps.lang);
    // Success-only auto-dismiss. If the await above rejected, control never
    // reaches here — modal stays open and the rejection bubbles up.
    this.safeClose();
  }

  private ensureDomContainers(): void {
    // eslint-disable-next-line obsidianmd/prefer-active-doc -- happy-dom fallback for tests
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    if (!this.contentEl) {
      this.contentEl = doc.createElement('div');
    }
    if (!this.titleEl) {
      this.titleEl = doc.createElement('div');
    }
  }

  /** Production Obsidian Modal exposes `close()`; the test-mode stub does not.
   *  Guard the call so test paths don't crash on the missing method. */
  private safeClose(): void {
    const maybeClose = (this as unknown as { close?: () => void }).close;
    if (typeof maybeClose === 'function') {
      try {
        maybeClose.call(this);
      } catch {
        /* swallow — close failures shouldn't cascade */
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function clear(el: HTMLElement | null | undefined): void {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendEl(parent: HTMLElement, tag: string, cls?: string): HTMLElement {
  // eslint-disable-next-line obsidianmd/prefer-active-doc -- happy-dom fallback for tests
  const doc = parent.ownerDocument ?? document;
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  parent.appendChild(el);
  return el;
}

function setText(el: HTMLElement, text: string): void {
  el.textContent = text;
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
