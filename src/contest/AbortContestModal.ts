// src/contest/AbortContestModal.ts
// Phase 10 Plan 05 — Confirmation modal for aborting an active contest.
// All DOM via createEl / createDiv (Shared Pattern 3, no innerHTML).

import { Modal, type App } from 'obsidian';

/**
 * Modal asking the user to confirm aborting the active contest.
 * Shows the number of solved problems and remaining time to communicate
 * the cost of aborting.
 */
export class AbortContestModal extends Modal {
  constructor(
    app: App,
    private readonly solvedCount: number,
    private readonly totalProblems: number,
    private readonly remainingMs: number,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText('Abort contest?');

    const minutes = Math.floor(this.remainingMs / 60000);
    const seconds = Math.floor((this.remainingMs % 60000) / 1000);
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    contentEl.createEl('p', {
      text: `You've solved ${String(this.solvedCount)}/${String(this.totalProblems)} problems with ${timeStr} remaining. Aborting will end the contest and write a summary note marked as aborted.`,
    });

    const actions = contentEl.createDiv({ cls: 'leetcode-contest__modal-actions' });

    const confirmBtn = actions.createEl('button', {
      text: 'Abort contest',
      cls: 'leetcode-contest__btn-abort',
    });
    confirmBtn.addEventListener('click', () => {
      this.onConfirm();
      this.close();
    });

    const cancelBtn = actions.createEl('button', {
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    // Default-focus the cancel button (safe action) per UI-SPEC accessibility.
    try { cancelBtn.focus(); } catch { /* headless */ }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
