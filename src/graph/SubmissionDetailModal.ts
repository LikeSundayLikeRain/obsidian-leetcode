// src/graph/SubmissionDetailModal.ts
//
// Phase 4 Plan 04 — Read-only submission detail modal (D-04).
//
// Renders a single past submission's code + metadata. Two user actions:
//   - Copy to ## Code (primary) — confirms overwrite if ## Code currently has
//     a non-empty fenced block, then rewrites via vault.process. The
//     replacement fence's language tag = submitted language (not the existing
//     fence's tag). NEVER creates a ## Solution heading (D-01, GRAPH-01 revised).
//   - Close (secondary) — dismisses the modal.
//
// DOM discipline (CF-07): createElement + textContent only; no innerHTML, no
// HTML-string sinks. Code body is rendered inside a <pre><code> element with
// the `language-{slug}` class so Obsidian's reading-mode code styling applies
// when the modal's content root is treated as markdown — no MarkdownRenderer
// dependency at test time (keeps the unit test deterministic) and no raw HTML
// injection.
//
// Confirm-overwrite gate: when ## Code currently has a non-empty fenced block
// the modal opens `ConfirmOverwriteModal` (Task 2 in this plan). Tests pass
// `confirmOverwriteForTest` so they exercise the overwrite path without
// stubbing the confirm modal.
//
// This module MUST NOT import from `./SubmissionPickerModal` — the picker
// opens the detail modal via an injected factory callback (see
// SubmissionPickerDeps.openDetailModal) so the two modules stay decoupled.

import { Modal, type App, type TFile } from 'obsidian';
import { copyToCode, hasExistingCodeBlock } from './copyToCode';

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
  /** Test hook — short-circuits the ConfirmOverwriteModal. Production callers
   *  omit this and the modal delegates to the real confirm dialog.
   *
   *  Returns `true` to proceed with the overwrite, `false` to cancel. */
  confirmOverwriteForTest?: () => Promise<boolean>;
}

export class SubmissionDetailModal extends Modal {
  private readonly deps: SubmissionDetailDeps;
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

  onOpen(): void {
    this.ensureDomContainers();
    addClass(this.contentEl, 'leetcode-submissions');
    addClass(this.contentEl, 'leetcode-submissions-detail');
    this.render();
  }

  onClose(): void {
    clear(this.contentEl);
  }

  private render(): void {
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

    // Code body. We render a <pre><code class="language-{lang}"> node and
    // textContent the code onto it — Obsidian's reading-mode CSS will pick up
    // the language-* class and apply syntax highlighting when the modal's
    // parent applies markdown styling. Tests only assert textContent / classes.
    const pre = appendEl(this.contentEl, 'pre', 'leetcode-submissions-code');
    const code = appendEl(pre, 'code',
      `language-${this.deps.lang || 'text'}`);
    setText(code, this.deps.code);

    // Footer — primary Copy, secondary Close.
    const footer = appendEl(this.contentEl, 'div',
      'leetcode-submissions-footer leetcode-submissions-action-row');

    const copyBtn = appendEl(footer, 'button', 'mod-cta');
    setText(copyBtn, 'Copy to ## Code');
    copyBtn.addEventListener('click', () => {
      void this.handleCopyToCode();
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
   * Copy-to-code entry point. Consults the confirm gate when there's an
   * existing non-empty fenced block; no-op on user cancel; otherwise delegates
   * to `performCopy`. This is the method the copy-button calls, and the one
   * the tests exercise through `handleCopyToCode`.
   */
  async handleCopyToCode(): Promise<void> {
    // Read current body to decide whether we need to confirm. Both the mock
    // vault and production Obsidian expose `vault.read(file)` → Promise<string>.
    const current = await readCurrentBody(this.app, this.deps.file);
    if (hasExistingCodeBlock(current)) {
      const proceed = await this.askConfirm();
      if (!proceed) return;
    }
    await this.performCopy();
  }

  /**
   * Writes the submitted code into the ## Code fenced block. Called by
   * handleCopyToCode after the confirm gate (if any) has passed, and directly
   * by the `copy does not create ## Solution` test.
   */
  async performCopy(): Promise<void> {
    await copyToCode(this.app, this.deps.file, this.deps.code, this.deps.lang);
    this.safeClose();
  }

  /**
   * Delegate to the test hook when provided; otherwise construct the real
   * ConfirmOverwriteModal and return whatever the user clicks. Production
   * path uses the modal; tests inject `confirmOverwriteForTest` so the gate
   * resolves deterministically.
   */
  private async askConfirm(): Promise<boolean> {
    if (this.deps.confirmOverwriteForTest) {
      return this.deps.confirmOverwriteForTest();
    }
    // Deferred require — the test suite doesn't exercise this path, and
    // importing ConfirmOverwriteModal at module load would pull the real
    // Obsidian Modal chrome into the test runner. Safe because this branch is
    // reached only under production use.
    const { ConfirmOverwriteModal } = await import('./ConfirmOverwriteModal');
    return new Promise<boolean>((resolve) => {
      const modal = new ConfirmOverwriteModal(this.app, resolve);
      modal.open();
    });
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

/**
 * Read the current body of a TFile via `app.vault.read(file)`. Both the mock
 * vault's and production Obsidian's vault expose this method.
 */
async function readCurrentBody(app: App, file: TFile): Promise<string> {
  const vault = (app as unknown as { vault?: { read?: (f: TFile) => Promise<string> } }).vault;
  if (vault?.read) {
    return vault.read(file);
  }
  return '';
}
