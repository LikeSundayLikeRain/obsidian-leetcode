// src/graph/ConfirmOverwriteModal.ts
//
// Phase 4 Plan 04 Task 2 — Confirm-overwrite dialog for Copy-to-## Code
// (D-04 gate).
//
// Opened by `SubmissionDetailModal.askConfirm()` when the target note's
// ## Code block currently has a NON-EMPTY fenced block. Resolves with:
//   true  — user clicked "Overwrite" → SubmissionDetailModal proceeds with
//           copyToCode.
//   false — user clicked "Cancel" OR dismissed the modal (ESC / overlay
//           click / close button in chrome) → SubmissionDetailModal
//           aborts the copy with no vault mutation.
//
// Tests exercise SubmissionDetailModal via the `confirmOverwriteForTest`
// injection hook; this module is the production fallback. UI-SPEC §Modal
// strings locks the copy.
//
// DOM discipline (CF-07): createElement + textContent only; no innerHTML.

import { Modal, type App } from 'obsidian';

export class ConfirmOverwriteModal extends Modal {
  public contentEl!: HTMLElement;
  public titleEl!: HTMLElement;
  private readonly resolver: (result: boolean) => void;
  /** Defensive guard — ensure the promise resolves exactly once even if the
   *  user clicks a button AND the modal's onClose fires. */
  private settled = false;

  constructor(app: App, onResult: (result: boolean) => void) {
    super(app);
    this.resolver = onResult;
    this.ensureDomContainers();
  }

  onOpen(): void {
    this.ensureDomContainers();
    addClass(this.contentEl, 'leetcode-submissions');
    addClass(this.contentEl, 'leetcode-submissions-confirm');
    this.render();
  }

  onClose(): void {
    // If the user dismissed without clicking a button, treat as cancel.
    this.settle(false);
    clear(this.contentEl);
  }

  private render(): void {
    clear(this.contentEl);
    if (this.titleEl) {
      setText(this.titleEl, 'Overwrite current code?');
    }
    const body = appendEl(this.contentEl, 'div', 'leetcode-submissions-confirm-body');
    const p = appendEl(body, 'p');
    setText(p,
      'Your current ## Code block will be replaced with this submission. Continue?');

    const footer = appendEl(this.contentEl, 'div',
      'leetcode-submissions-footer leetcode-submissions-action-row');

    const cancelBtn = appendEl(footer, 'button');
    setText(cancelBtn, 'Cancel');
    cancelBtn.addEventListener('click', () => {
      this.settle(false);
      this.close();
    });
    // Default-focus Cancel — destructive actions must not be auto-confirmed
    // (UI-SPEC §Accessibility default focus).
    try {
      (cancelBtn as HTMLButtonElement).focus();
    } catch {
      /* headless */
    }

    const overwriteBtn = appendEl(footer, 'button', 'mod-warning');
    setText(overwriteBtn, 'Overwrite');
    overwriteBtn.addEventListener('click', () => {
      this.settle(true);
      this.close();
    });
  }

  private settle(result: boolean): void {
    if (this.settled) return;
    this.settled = true;
    try {
      this.resolver(result);
    } catch {
      /* resolver is already best-effort; swallow to avoid cascading errors */
    }
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
