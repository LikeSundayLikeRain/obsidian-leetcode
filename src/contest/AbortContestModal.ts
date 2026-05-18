// src/contest/AbortContestModal.ts
// Phase 10 Plan 07 — Confirmation modal for aborting a contest (D-07).
//
// Shows "Are you sure? You've solved X/4 problems, Y min remaining."
// On confirm: calls the onConfirm callback which triggers handleContestEnd(true).
// Pattern precedent: src/solve/VerdictModal.ts (Modal pattern).

import { Modal, Setting, type App } from 'obsidian';
import type { ContestSession } from './types';
import { getRemainingMs } from './types';

export class AbortContestModal extends Modal {
  constructor(
    app: App,
    private readonly session: ContestSession,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const solvedCount = this.session.problems.filter(
      (p) => p.verdict === 'accepted',
    ).length;
    const totalCount = this.session.problems.length;
    const remainingMin = Math.ceil(getRemainingMs(this.session) / 60000);

    contentEl.createEl('h2', { text: 'Abort contest?' });
    contentEl.createEl('p', {
      text: `You've solved ${String(solvedCount)}/${String(totalCount)} problems, ${String(remainingMin)} min remaining.`,
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText('Cancel').onClick(() => {
          this.close();
        }),
      )
      .addButton((b) =>
        b
          .setButtonText('Abort contest')
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
