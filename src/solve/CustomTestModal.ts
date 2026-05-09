// src/solve/CustomTestModal.ts
//
// Phase 3 — tabbed custom-input modal (D-17, D-18, D-19, D-20). Persists
// cases to `## Custom Tests` section on close via customTestStore.writeCasesToVault.
// Pattern: createEl / createDiv / createSpan; Obsidian Modal lifecycle
// (onOpen / onClose). Run button is the primary CTA (mod-cta accent).
//
// UI-SPEC contracts (locked):
//   - Title `Custom test input`
//   - Tabs have role="tab", aria-selected; tablist container has role="tablist"
//   - Textarea has role="tabpanel"; placeholder `Enter test input (one value per line)`
//   - Tab remove (×) only visible on hover when >1 case (CSS rule)
//   - Run is the sole mod-cta; persists cases BEFORE invoking onRun to keep
//     state safe across thrown callbacks
//   - Persist-on-close: Escape / outside-click fire onClose → persist() once
//     (didPersist guard prevents double-write when Run → close() cascades).
//
// CF-06: persist path uses vault.process via writeCasesToVault; never uses
// the banned mutator API. CF-07: every DOM node built via createEl equivalents.

import { Modal, type App, type TFile } from 'obsidian';
import { writeCasesToVault, type CustomTestCase } from './customTestStore';
import { logger } from '../shared/logger';

export interface CustomTestModalArgs {
  file: TFile;
  /** Pre-populated cases (first-open seed is the caller's responsibility). */
  initialCases: string[];
  /** Called with the active tab's input when Run is clicked. */
  onRun: (input: string) => void;
}

export class CustomTestModal extends Modal {
  private cases: CustomTestCase[] = [];
  private activeTab = 0;
  private tabsEl!: HTMLElement;
  private textareaEl!: HTMLTextAreaElement;
  private didPersist = false;
  private readonly args: CustomTestModalArgs;

  constructor(app: App, args: CustomTestModalArgs) {
    super(app);
    this.args = args;
    // First-open seeding: if caller passes at least one case, adopt; else
    // start with a single empty case so the tab row is never headless.
    this.cases = args.initialCases.length > 0
      ? args.initialCases.map((input) => ({ input }))
      : [{ input: '' }];
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    clear(contentEl);
    addClass(contentEl, 'leetcode-custom-test');
    if (titleEl) titleEl.textContent = 'Custom test input';

    this.tabsEl = appendEl(contentEl, 'div', 'leetcode-custom-test-tabs');
    this.tabsEl.setAttribute('role', 'tablist');
    this.renderTabs();

    const textarea = appendEl(contentEl, 'textarea', 'leetcode-custom-test-textarea') as HTMLTextAreaElement;
    textarea.setAttribute('role', 'tabpanel');
    textarea.setAttribute('rows', '10');
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('placeholder', 'Enter test input (one value per line)');
    textarea.value = this.cases[this.activeTab]?.input ?? '';
    textarea.addEventListener('input', () => {
      const c = this.cases[this.activeTab];
      if (c) c.input = textarea.value;
    });
    this.textareaEl = textarea;

    const footer = appendEl(contentEl, 'div', 'leetcode-custom-test-footer');
    const runBtn = appendEl(footer, 'button', 'mod-cta');
    runBtn.textContent = 'Run';
    runBtn.addEventListener('click', () => {
      this.syncActiveFromTextarea();
      // Send all non-empty cases as a single newline-joined data_input blob —
      // matches LC's web UI, which runs every case in one interpret call.
      const input = this.cases
        .map((c) => c.input.trim())
        .filter((s) => s.length > 0)
        .join('\n');
      // Persist first — if onRun throws, cases are already safe in the note.
      void this.persist();
      try {
        this.args.onRun(input);
      } finally {
        this.close();
      }
    });

    if (typeof (textarea as unknown as { focus?: () => void }).focus === 'function') {
      try { textarea.focus(); } catch { /* headless */ }
    }
  }

  onClose(): void {
    // Persist-on-close (UI-SPEC §Interaction Contract): Escape / outside
    // click should still save the user's in-progress edits. The guard
    // prevents double-persist when Run → close() cascades (Run already
    // called persist() before close()).
    if (!this.didPersist) {
      this.syncActiveFromTextarea();
      void this.persist();
    }
    clear(this.contentEl);
  }

  // ── Tab rendering + actions ─────────────────────────────────────────

  private renderTabs(): void {
    clear(this.tabsEl);
    this.cases.forEach((_, i) => {
      const tab = appendEl(this.tabsEl, 'button',
        'leetcode-custom-test-tab' + (i === this.activeTab ? ' is-active' : ''),
      );
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === this.activeTab));
      tab.textContent = `Case ${i + 1}`;
      tab.addEventListener('click', () => this.switchTab(i));
      // `×` remove affordance only when more than one case exists.
      if (this.cases.length > 1) {
        const remove = appendEl(tab, 'span', 'leetcode-custom-test-tab-remove');
        remove.textContent = '×';
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeCase(i);
        });
      }
    });
    const addBtn = appendEl(this.tabsEl, 'button',
      'leetcode-custom-test-tab leetcode-custom-test-tab-add',
    );
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => this.addCase());
  }

  private switchTab(i: number): void {
    this.syncActiveFromTextarea();
    this.activeTab = i;
    this.textareaEl.value = this.cases[i]?.input ?? '';
    this.renderTabs();
    try { this.textareaEl.focus(); } catch { /* headless */ }
  }

  private addCase(): void {
    this.syncActiveFromTextarea();
    this.cases.push({ input: '' });
    this.activeTab = this.cases.length - 1;
    this.textareaEl.value = '';
    this.renderTabs();
    try { this.textareaEl.focus(); } catch { /* headless */ }
  }

  private removeCase(i: number): void {
    if (this.cases.length <= 1) return;
    this.cases.splice(i, 1);
    if (this.activeTab >= this.cases.length) {
      this.activeTab = this.cases.length - 1;
    } else if (this.activeTab > i) {
      this.activeTab--;
    } else if (this.activeTab === i && i > 0) {
      this.activeTab = i - 1;
    }
    this.textareaEl.value = this.cases[this.activeTab]?.input ?? '';
    this.renderTabs();
    try { this.textareaEl.focus(); } catch { /* headless */ }
  }

  private syncActiveFromTextarea(): void {
    const c = this.cases[this.activeTab];
    if (c) c.input = this.textareaEl.value;
  }

  private async persist(): Promise<void> {
    this.didPersist = true;
    try {
      await writeCasesToVault(this.app, this.args.file, this.cases);
    } catch (err) {
      logger.debug('solve.customTestModal.persist: non-fatal failure', err);
    }
  }
}

// ── Local helpers ────────────────────────────────────────────────────────

function clear(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const maybe = el as unknown as { empty?: () => void };
  if (typeof maybe.empty === 'function') {
    maybe.empty();
  } else {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
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
