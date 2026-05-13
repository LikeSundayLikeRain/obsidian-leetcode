// src/solve/RunModal.ts
//
// Phase 5 POLISH-07 (D-03..D-10) — the unified Run modal. Replaces Phase 3's
// custom-test modal + case-region persistence layer entirely. IN-MEMORY ONLY:
// state lives in EphemeralTabStore; the plugin NEVER writes to
// `## Custom Tests` (D-08 — legacy section is ignored on read and write).
//
// Behavior contract (UI-SPEC §2 RunModal + D-03..D-07, updated by Phase 5.4 D-01):
//   - Title `Run`
//   - Tabs seeded from `store.getOrSeed(slug, exampleTestcases)` on open
//   - Reset button (`Reset to sample cases`, no mod-cta) → store.resetToSamples
//   - Run button (`Run`, mod-cta) → joins ALL non-empty tabs with `\n` via
//     `joinCasesForRun` and passes the joined string to `onRun`, then
//     closes the modal. Phase 5.4 D-01 supersedes Phase 5 D-07's single-
//     active-tab behavior so a Run with N tabs makes ONE batched
//     `interpret_solution` LC call (response's `code_answer[]` /
//     `expected_code_answer[]` arrays carry per-case results).
//   - `×` delete is hidden when only one tab remains (D-06 single-tab min)
//   - `+` add-tab appends an empty tab and focuses it
//   - onClose pushes current tab state back via `store.setTabs` (no I/O,
//     no vault calls — contrast with the removed Phase 3 modal which wrote
//     cases to the note via the deprecated custom-test store)
//
// CSS classes (tests/solve/RunModal.test.ts drives these exact selectors):
//   - `.leetcode-run-tab`           each tab button
//   - `.leetcode-run-tab.is-active` the active tab
//   - `.leetcode-run-tab-add`       the `+` add-tab button
//   - `.leetcode-run-tab-delete`    the `×` delete span inside a tab
//   - `.leetcode-run-reset`         the `Reset to sample cases` button (neutral)
//   - `.leetcode-run-submit`        the `Run` button (mod-cta)
//   - `.leetcode-run-textarea`      the active-tab textarea
//   - `.leetcode-run-footer`        the footer row
//   - `.leetcode-run-modal`         set on modalEl for footer layout rules
//
// CF-06 compliance: zero vault writes from this modal (D-08 ignore-legacy).
// CF-07 compliance: all DOM built via createElement / createEl; never innerHTML.

import { Modal, type App } from 'obsidian';
import type { EphemeralTabStore } from './ephemeralTabStore';
import { joinCasesForRun } from './runArity';

export interface RunModalArgs {
  slug: string;
  exampleTestcases: string;
  /** Phase 5.4 UAT fix — lines per LC sample case (typically derived from
   *  metaData.params.length or sampleTestCase.split('\n').filter(non-empty).length).
   *  When provided AND `exampleTestcases` lacks blank-line case boundaries,
   *  the seed is chunked into per-case tabs. */
  linesPerCase?: number;
  /** Phase 5.4 UAT-G4 — when set, the modal opens with this tab index
   *  active instead of defaulting to tab 0. Used by Copy-failing-testcase
   *  so the user lands directly on the just-appended failing case tab. */
  initialActiveTab?: number;
  store: EphemeralTabStore;
  onRun: (input: string) => void;
}

export class RunModal extends Modal {
  private readonly args: RunModalArgs;
  private cases: string[] = [];
  private activeTab = 0;
  private tabsEl!: HTMLElement;
  private textareaEl!: HTMLTextAreaElement;

  constructor(app: App, args: RunModalArgs) {
    super(app);
    this.args = args;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    clear(contentEl);
    addClass(contentEl, 'leetcode-run');
    const modalEl = (this as unknown as { modalEl?: HTMLElement }).modalEl;
    if (modalEl) addClass(modalEl, 'leetcode-run-modal');
    if (titleEl) titleEl.textContent = 'Run';

    // D-03: seed from store. If the user previously edited tabs in this
    // note-open session, they come back here; otherwise we get a fresh
    // split of `exampleTestcases` (or a single empty tab for no-sample
    // problems).
    const seeded = this.args.store.getOrSeed(
      this.args.slug,
      this.args.exampleTestcases,
      this.args.linesPerCase,
    );
    // Work on a local copy; `setTabs` on close pushes back.
    this.cases = [...seeded];
    // UAT-G4: opt-in initial active tab (used by Copy-failing-testcase to
    // land on the just-appended tab). Clamp to a valid range so a stale
    // index doesn't crash the renderer.
    const requested = this.args.initialActiveTab ?? 0;
    this.activeTab = Math.min(Math.max(0, requested), Math.max(0, this.cases.length - 1));

    this.tabsEl = appendEl(contentEl, 'div', 'leetcode-run-tabs');
    this.tabsEl.setAttribute('role', 'tablist');
    this.renderTabs();

    const textarea = appendEl(contentEl, 'textarea', 'leetcode-run-textarea') as HTMLTextAreaElement;
    textarea.setAttribute('role', 'tabpanel');
    textarea.setAttribute('rows', '10');
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('placeholder', 'Enter test input (one value per line)');
    textarea.value = this.cases[this.activeTab] ?? '';
    textarea.addEventListener('input', () => {
      this.cases[this.activeTab] = textarea.value;
    });
    this.textareaEl = textarea;

    // Footer — Reset (left, neutral) + Run (right, mod-cta). The
    // `.leetcode-run-footer` + `.leetcode-run-modal` class pair drives
    // the space-between flex layout in styles.css.
    const footer = appendEl(contentEl, 'div', 'leetcode-run-footer');
    const resetBtn = appendEl(footer, 'button', 'leetcode-run-reset');
    resetBtn.textContent = 'Reset to sample cases';
    resetBtn.addEventListener('click', () => {
      // D-05: wipe + re-seed from exampleTestcases (no confirmation).
      const reset = this.args.store.resetToSamples(
        this.args.slug,
        this.args.exampleTestcases,
        this.args.linesPerCase,
      );
      this.cases = [...reset];
      this.activeTab = 0;
      this.textareaEl.value = this.cases[0] ?? '';
      this.renderTabs();
    });
    const runBtn = appendEl(footer, 'button', 'leetcode-run-submit mod-cta');
    runBtn.textContent = 'Run';
    runBtn.addEventListener('click', () => {
      // Sync the textarea content into the active tab so any in-progress
      // edit is captured before we hand off to onRun. (Phase 5 D-08 /
      // CF-06: setTabs runs before the join — store-state contract.)
      this.cases[this.activeTab] = this.textareaEl.value;
      this.args.store.setTabs(this.args.slug, this.cases);
      // D-01 (Phase 5.4): join ALL non-empty tabs with `\n` so the
      // orchestrator's interpret_solution call carries every case in
      // one batched LC request (matches LC.com). Supersedes Phase 5
      // D-07's single-active-tab behavior. Arity is informational for
      // the JOIN direction (LC wants a flat newline list); cases.length
      // is a safe positive-int passthrough — runArity.ts ignores the
      // value today, reserved for future arity-aware shaping.
      const input = joinCasesForRun(this.cases, this.cases.length);
      try {
        this.args.onRun(input);
      } finally {
        this.close();
      }
    });

    // Focus the textarea so typing works immediately. Guarded because
    // happy-dom's textarea.focus can throw in headless mode.
    if (typeof (textarea as unknown as { focus?: () => void }).focus === 'function') {
      try { textarea.focus(); } catch { /* headless */ }
    }
  }

  onClose(): void {
    // D-08: in-memory-only. Push current tab state to the store so the
    // next Run in this note-open session restores the user's edits.
    // NEVER persist cases to the vault from here.
    try {
      if (this.textareaEl) {
        this.cases[this.activeTab] = this.textareaEl.value;
      }
      this.args.store.setTabs(this.args.slug, this.cases);
    } catch {
      // Best-effort: if the modal never finished onOpen (construction failure)
      // the store still has whatever getOrSeed produced.
    }
    clear(this.contentEl);
  }

  // ── Tab rendering + actions ────────────────────────────────────────────

  private renderTabs(): void {
    clear(this.tabsEl);
    this.cases.forEach((_, i) => {
      const tab = appendEl(
        this.tabsEl,
        'button',
        'leetcode-run-tab' + (i === this.activeTab ? ' is-active' : ''),
      );
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === this.activeTab));
      tab.textContent = `Case ${i + 1}`;
      tab.addEventListener('click', () => this.switchTab(i));
      // D-06: `×` visible only when >1 tab (single-tab-minimum guard).
      if (this.cases.length > 1) {
        const remove = appendEl(tab, 'span', 'leetcode-run-tab-delete');
        remove.textContent = '×';
        remove.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeCase(i);
        });
      }
    });
    const addBtn = appendEl(
      this.tabsEl,
      'button',
      'leetcode-run-tab-add',
    );
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => this.addCase());
  }

  private switchTab(i: number): void {
    // Persist current edit before switching away.
    this.cases[this.activeTab] = this.textareaEl.value;
    this.activeTab = i;
    this.textareaEl.value = this.cases[i] ?? '';
    this.renderTabs();
    try { this.textareaEl.focus(); } catch { /* headless */ }
  }

  private addCase(): void {
    this.cases[this.activeTab] = this.textareaEl.value;
    this.cases.push('');
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
    this.textareaEl.value = this.cases[this.activeTab] ?? '';
    this.renderTabs();
    try { this.textareaEl.focus(); } catch { /* headless */ }
  }
}

// ── Local DOM helpers (happy-dom-safe) ────────────────────────────────────

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
  // eslint-disable-next-line obsidianmd/prefer-active-doc -- happy-dom fallback for tests
  const doc = parent.ownerDocument ?? (globalThis as { document?: Document }).document;
  // eslint-disable-next-line obsidianmd/prefer-active-doc -- happy-dom fallback for tests
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
