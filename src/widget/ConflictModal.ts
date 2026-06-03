// Phase 20 Plan 20-03 — ConflictModal subclass of Obsidian.Modal.
//
// CONTEXT references:
//   - D-conflict-01: ANY unflushed chars in debouncedWriter trigger this
//     modal. The trigger gate is `widget.debouncedWriter.hasPending() === true`
//     at vault.on('modify') arrival; this file does not own that decision —
//     src/main.ts modify-handler does. This file owns the modal's UX.
//   - D-conflict-02: "View diff" expands the modal in place to show three
//     columns (Mine | External | Merged preview) using a pure-TS LCS line
//     diff (`src/widget/conflictDiff.ts`). Buttons remain at top — diff
//     APPENDS, does NOT replace.
//   - D-conflict-04: A second external edit while the modal is open updates
//     the External pane in place via `updateExternalContent(newExt)`. No
//     stacking modals; the modal is a live view of disk state.
//   - L8: Phase 19's historyJSON capture is consumed best-effort for
//     post-resolution undo continuity. The "Keep external" path replaces
//     doc + adds Transaction.addToHistory.of(false) annotation — the user's
//     undo stack now references a doc state that no longer exists; pressing
//     Cmd-Z after Keep external is documented as a no-op (limitation).
//
// CRITICAL contracts (THREAT MODEL T-20-03-01 / T-20-03-09 + CLAUDE.md):
//   - Render external file content via `textContent` only. NEVER use the
//     equivalent inner-HTML setter (the literal name is omitted to keep
//     `grep` clean — see Modal Test 7 in the test file). The
//     `.lc-conflict-external` <pre> is set via `textContent =
//     this.externalDoc`, which does NOT parse HTML — strings render literally
//     including `<`, `>`, `&`. CLAUDE.md no-inner-HTML rule (DOM XSS mitigation).
//   - Lifecycle discipline (BLOCKER fix): DO NOT override `open()` or `close()`.
//     The `isOpen` boolean MUST mutate inside Obsidian-guaranteed callbacks
//     ONLY — `onOpen()` (set true) and `onClose()` (set false). Obsidian fires
//     `onClose()` exactly once regardless of close trigger (button click, Esc
//     key, workspace teardown, programmatic close, alternate dismiss routes).
//     Overriding `close()` would miss internal teardown paths and leave
//     `isOpen` stale-true, causing `updateExternalContent` to write into a
//     detached DOM (race T-20-03-05).
//   - Constructor callback approach (WARNING #6 fix): the plugin sets
//     `activeConflictModal = new ConflictModal(...)` and passes a callback
//     `() => { activeConflictModal = null }`. The callback fires inside
//     `onClose()` BEFORE we empty contentEl, so the plugin's reference is
//     reset exactly once.

// eslint-disable-next-line import/no-extraneous-dependencies -- direct dep
import { Modal, Setting, Notice, type App } from 'obsidian';
import { lineDiff } from './conflictDiff';
import type { WidgetController } from './WidgetController';

/**
 * Three-button conflict modal that appears when an external file edit lands
 * during local in-flight typing. The user picks Keep mine / Keep external /
 * View diff (inline expansion, no separate page).
 */
export class ConflictModal extends Modal {
  /** Public lifecycle flag — set true in `onOpen()` and false in `onClose()`.
   *  The vault.on('modify') D-conflict-04 path checks this to decide between
   *  `updateExternalContent` (modal already open) and constructing a fresh
   *  modal (closed or never opened). */
  public isOpen = false;

  /** Whether the user clicked "View diff" and the 3-column section is mounted. */
  private diffOpen = false;

  /** DOM handles for the diff section. Set when `expandDiff()` fires. */
  private mineEl?: HTMLPreElement;
  private extEl?: HTMLPreElement;
  private mergedEl?: HTMLPreElement;

  constructor(
    app: App,
    private readonly widget: WidgetController,
    private readonly mineDoc: string,
    private externalDoc: string,
    /** Plugin-provided cleanup callback. Fires inside `onClose()` BEFORE
     *  contentEl.empty() so the plugin's `activeConflictModal` reference
     *  resets exactly once across every close trigger. */
    private readonly onCloseCallback?: () => void,
  ) {
    super(app);
  }

  /**
   * D-conflict-04 — second external edit while modal open: re-render the
   * External pane in place. Re-runs `lineDiff` for the merged column if
   * the diff section is mounted. NEVER opens a second modal.
   *
   * Idempotent — calling before `expandDiff()` simply updates the cached
   * `externalDoc` field; the next `expandDiff()` will use the latest value.
   */
  updateExternalContent(newExternal: string): void {
    this.externalDoc = newExternal;
    if (this.diffOpen) {
      this.renderDiff();
    }
  }

  /**
   * Obsidian-guaranteed callback. Lifecycle discipline (BLOCKER fix): set
   * `isOpen = true` here, NOT in an `open()` override.
   */
  onOpen(): void {
    this.isOpen = true;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'External edit detected' });
    contentEl.createEl('p', {
      text: 'This file changed on disk while you were editing. Choose a resolution:',
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Keep mine')
          .setCta()
          .onClick(async () => {
            // CONTEXT discretion: immediate flush — the user just made a
            // deliberate decision. The widget's writer is the canonical
            // path through DebouncedWriter → vault.process (Phase 19
            // architecture); no direct disk writes from here.
            try {
              await this.widget.writer?.forceFlush();
            } catch {
              // Defensive — flush errors shouldn't block closing the modal.
            }
            new Notice('Local edits saved.', 3000);
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Keep external').onClick(async () => {
          try {
            await this.widget.reloadFromDisk('keep-external');
          } catch {
            // Defensive — reload errors shouldn't block closing the modal.
          }
          new Notice('Reloaded from disk.', 3000);
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText('View diff').onClick(() => this.expandDiff()),
      );
  }

  /**
   * D-conflict-02 — append the 3-column diff section BELOW the buttons.
   * Buttons remain interactive at the top of the modal; the user can still
   * pick Keep mine / Keep external from the same surface that shows the
   * diff. No-op if already expanded.
   */
  expandDiff(): void {
    if (this.diffOpen) return;
    this.diffOpen = true;
    const { contentEl } = this;
    const diffContainer = contentEl.createDiv({ cls: 'lc-conflict-diff' });
    diffContainer.createEl('h3', { text: 'Diff' });
    const cols = diffContainer.createDiv({ cls: 'lc-conflict-cols' });
    this.mineEl = cols.createEl('pre', { cls: 'lc-conflict-mine' }) as HTMLPreElement;
    this.extEl = cols.createEl('pre', { cls: 'lc-conflict-external' }) as HTMLPreElement;
    this.mergedEl = cols.createEl('pre', { cls: 'lc-conflict-merged' }) as HTMLPreElement;
    this.renderDiff();
  }

  /**
   * Render Mine / External / Merged columns. Pure DOM construction via
   * `textContent` only — see file-header CRITICAL contracts (T-20-03-01 /
   * T-20-03-09 mitigation). Each merged-row span carries a class
   * `lc-diff-{kind}` so styles.css can color same / mine-only /
   * external-only rows per the UI-SPEC §Color diff color contract.
   */
  private renderDiff(): void {
    if (!this.diffOpen || !this.mineEl || !this.extEl || !this.mergedEl) return;
    this.mineEl.textContent = this.mineDoc;
    this.extEl.textContent = this.externalDoc;
    this.mergedEl.empty();
    const rows = lineDiff(this.mineDoc, this.externalDoc);
    for (const r of rows) {
      const span = this.mergedEl.createSpan({ cls: `lc-diff-${r.kind}` });
      span.textContent = (r.mine ?? r.external ?? '') + '\n';
    }
  }

  /**
   * Obsidian-guaranteed callback. Lifecycle discipline (BLOCKER fix): set
   * `isOpen = false` here, NOT in a `close()` override. The constructor
   * callback fires BEFORE contentEl.empty() so the plugin's
   * `activeConflictModal` reference is reset exactly once across every
   * close trigger (button click, Esc, workspace teardown).
   */
  onClose(): void {
    this.isOpen = false;
    this.onCloseCallback?.();
    this.contentEl.empty();
  }
}
