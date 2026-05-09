// src/graph/SubmissionPickerModal.ts
//
// Phase 4 Plan 04 — Submission picker modal (D-03, D-05, D-06).
//
// Opens as the response to the `LeetCode: View past submissions` command.
// Lists every submission LC returns for the active problem (AC + WA + TLE +
// CE + RE + MLE per D-05). Row click hands off to SubmissionDetailModal for
// the read-only code viewer.
//
// Render states:
//   1. Loading    — "Loading submissions..." placeholder while fetchHistory resolves.
//   2. Populated  — one row per submission, sorted newest-first (LC default).
//   3. Empty      — "No submissions yet." placeholder (D-06).
//   4. Error      — inline "Couldn't load submissions. Check your connection."
//                   message in the modal body (NOT a Notice, per D-06).
//   5. Session expired — SessionExpiredError escape: locked Phase 1 Notice +
//                        immediately close the modal (D-06, CF-04, CF-19).
//
// DOM discipline (CF-07): every element built via createElement + textContent;
// no innerHTML, no HTML-string sinks. Verdict chip classes mirror the Phase 3
// `.leetcode-verdict-{ac|wa|...}` convention so we reuse their colors.
//
// Data source: `fetchHistory(slug)` is injected so tests can script list/empty/
// error/session-expired branches without a network. In main.ts wiring this
// will be `(slug) => listSubmissionsForSlug(slug, cookies)`.
//
// `openDetailModal` is likewise injected — production wires to a lambda that
// constructs SubmissionDetailModal + calls .open(). Keeps the picker testable
// without pulling in the detail modal's dependencies.

import { Modal, Notice, type App, type TFile } from 'obsidian';
import { SessionExpiredError } from '../shared/errors';
import { classifyStatus } from '../solve/statusMap';
import type { SubmissionRow } from './submissionHistoryClient';
import type { SubmissionHistoryStore } from './SubmissionHistoryStore';

/** Row passed to the detail-modal-open callback. The picker opens the detail
 *  modal without needing to understand its construction — the caller (main.ts)
 *  provides a factory lambda that knows how to build SubmissionDetailModal
 *  from a picker row (fetching the full detail via detailForSubmission).
 *
 *  Phase 4 Plan 05 — `submissionHistoryStore` is the preferred data source when
 *  supplied. The store coordinates the D-02 on-open prefetch with the picker
 *  so repeat opens don't round-trip to LC unnecessarily (and still respect
 *  D-07: no persistence, just ephemeral in-session memoisation). When BOTH
 *  `submissionHistoryStore` and `fetchHistory` are provided, the store wins.
 *  When only `fetchHistory` is provided, the picker falls back to it directly
 *  (preserves the Wave 2 test contract — existing tests pass `fetchHistory`
 *  without knowing about the store). */
export interface SubmissionPickerDeps {
  file: TFile;
  slug: string;
  title: string;
  /** Async fetcher — returns the picker's display rows. Errors propagate.
   *  Either this OR `submissionHistoryStore` must be set; if both, the store
   *  wins. Kept for backward-compat with existing Wave 2 tests. */
  fetchHistory?: (slug: string) => Promise<SubmissionRow[]>;
  /** Preferred data source — coordinator between on-open prefetch and picker
   *  open. Production wiring in main.ts passes a singleton store; tests can
   *  pass either this or `fetchHistory`. */
  submissionHistoryStore?: SubmissionHistoryStore;
  /** Open the detail modal for a given row. Production wires through
   *  detailForSubmission → SubmissionDetailModal; tests pass a spy. */
  openDetailModal: (row: SubmissionRow) => void;
}

// Notice timeout — matches Phase 1 / Phase 3 session-expired Notice convention.
const SESSION_EXPIRED_NOTICE_MS = 8000;

export class SubmissionPickerModal extends Modal {
  private readonly deps: SubmissionPickerDeps;
  /** Real Obsidian Modal stores app on `this.app`; the test-mode Modal stub
   *  does not — we store an explicit ref so both contexts work. */
  public app!: App;
  /** The test suite reads modal.contentEl directly; production Obsidian Modal
   *  sets this in its constructor. The test-mode Modal stub does not — we
   *  initialise the element defensively so both contexts work. */
  public contentEl!: HTMLElement;
  public titleEl!: HTMLElement;

  constructor(app: App, deps: SubmissionPickerDeps) {
    super(app);
    this.app = app;
    this.deps = deps;
    this.ensureDomContainers();
  }

  onOpen(): void {
    this.ensureDomContainers();
    addClass(this.contentEl, 'leetcode-submissions');
    addClass(this.contentEl, 'leetcode-submissions-picker');
    if (this.titleEl) {
      setText(this.titleEl, `Past submissions — ${this.deps.title}`);
    }
    void this.loadAndRender();
  }

  onClose(): void {
    clear(this.contentEl);
  }

  /**
   * Single entry point exercised by both onOpen and the tests. Loads the
   * history and renders whatever state applies. NEVER throws — session-expiry
   * closes the modal; other errors render inline.
   */
  async loadAndRender(): Promise<void> {
    this.ensureDomContainers();
    this.renderLoading();
    let rows: SubmissionRow[];
    try {
      rows = await this.resolveRows();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        // CF-04, CF-19, D-06 — locked copy, immediate close.
        fireSessionExpiredNotice();
        this.safeClose();
        return;
      }
      this.renderError();
      return;
    }

    if (rows.length === 0) {
      this.renderEmpty();
      return;
    }

    this.renderRows(rows);
  }

  /**
   * Resolve submission rows from whichever data source was injected. The store
   * wins when present (Plan 05 wiring); otherwise fall through to fetchHistory
   * (Wave 2 test contract). Throws if neither is set — loud, not silent, so a
   * wiring bug in main.ts surfaces immediately rather than rendering "No
   * submissions yet." forever.
   */
  private async resolveRows(): Promise<SubmissionRow[]> {
    if (this.deps.submissionHistoryStore) {
      return this.deps.submissionHistoryStore.get(this.deps.slug);
    }
    if (this.deps.fetchHistory) {
      return this.deps.fetchHistory(this.deps.slug);
    }
    throw new Error(
      'SubmissionPickerModal: neither submissionHistoryStore nor fetchHistory was provided',
    );
  }

  // ── Render states ─────────────────────────────────────────────────────

  private renderLoading(): void {
    clear(this.contentEl);
    const body = appendEl(this.contentEl, 'div', 'leetcode-submissions-body');
    body.setAttribute('aria-live', 'polite');
    const p = appendEl(body, 'p', 'leetcode-submissions-loading');
    setText(p, 'Loading submissions…');
  }

  private renderEmpty(): void {
    clear(this.contentEl);
    const body = appendEl(this.contentEl, 'div', 'leetcode-submissions-body');
    body.setAttribute('aria-live', 'polite');
    const p = appendEl(body, 'p', 'leetcode-submissions-empty');
    // D-06 locked copy — UI-SPEC §Notice strings.
    setText(p, 'No submissions yet.');
  }

  private renderError(): void {
    clear(this.contentEl);
    const body = appendEl(this.contentEl, 'div', 'leetcode-submissions-body');
    body.setAttribute('aria-live', 'polite');
    const p = appendEl(body, 'p', 'leetcode-submissions-error');
    // D-06: inline error, not a Notice. Copy locked by UI-SPEC.
    setText(p, "Couldn't load submissions. Check your connection.");
  }

  private renderRows(rows: SubmissionRow[]): void {
    clear(this.contentEl);
    const body = appendEl(this.contentEl, 'div', 'leetcode-submissions-body');
    body.setAttribute('aria-live', 'polite');
    const list = appendEl(body, 'div', 'leetcode-submissions-list');
    list.setAttribute('role', 'list');

    // LC returns newest-first (D-05); if a wire-shape ever changes that, sort
    // defensively so the picker's top row is always the latest.
    const sorted = [...rows].sort((a, b) => b.timestamp - a.timestamp);

    for (const row of sorted) {
      list.appendChild(this.renderRow(row));
    }
  }

  private renderRow(row: SubmissionRow): HTMLElement {
    // eslint-disable-next-line obsidianmd/prefer-active-doc -- happy-dom fallback for tests
    const el = (this.contentEl.ownerDocument ?? document).createElement('div');
    el.className = 'leetcode-submissions-row';
    el.setAttribute('role', 'listitem');
    el.setAttribute('tabindex', '0');

    // Verdict chip — mirrors Phase 3's .leetcode-verdict-{kind} colour set.
    const info = classifyStatus(row.status, row.statusDisplay);
    const chip = appendEl(el, 'span',
      `leetcode-submissions-chip leetcode-submissions-chip--${info.kind}`);
    setText(chip, info.displayName);

    // Runtime + memory.
    const metrics = appendEl(el, 'span', 'leetcode-submissions-metrics');
    const parts: string[] = [];
    if (row.runtime && row.runtime.length > 0 && row.runtime !== 'N/A') {
      parts.push(row.runtime);
    }
    if (row.memory && row.memory.length > 0 && row.memory !== 'N/A') {
      parts.push(row.memory);
    }
    setText(metrics, parts.length > 0 ? parts.join(' · ') : '—');

    // Submitted-at — ISO-8601 local-tz (D-03). Defensive: LC's timestamp is
    // unix seconds; multiply to ms before new Date().
    const when = appendEl(el, 'span', 'leetcode-submissions-when');
    setText(when, formatDate(row.timestamp));

    // Language chip (right-aligned per UI-SPEC).
    const lang = appendEl(el, 'span', 'leetcode-submissions-lang');
    setText(lang, row.langName || row.lang || '');

    // Row click opens the detail modal (D-03).
    el.addEventListener('click', () => {
      try {
        this.deps.openDetailModal(row);
      } catch {
        // openDetailModal failure shouldn't tear down the picker. Inline-safe.
      }
    });
    el.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        try {
          this.deps.openDetailModal(row);
        } catch {
          /* swallow */
        }
      }
    });

    return el;
  }

  /**
   * Safe `close()` — production Obsidian Modal exposes `close()` that
   * detaches the overlay; the test-mode Modal stub does not. Guard the call
   * so test paths exercising the session-expired branch don't crash on the
   * missing method.
   */
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

  // ── DOM scaffolding ───────────────────────────────────────────────────

  /**
   * Ensure `contentEl` / `titleEl` exist. Real Obsidian Modal sets these in
   * its own constructor; the test-mode `class Modal {}` stub does not. We
   * therefore initialise defensively on first use. Idempotent — repeated
   * calls don't clobber existing elements.
   */
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

/** Format LC's unix-seconds timestamp as an ISO-8601 local-tz display. Picker
 *  rows want a compact readable date; this renders `YYYY-MM-DD HH:mm` in the
 *  host's local timezone (D-10 rationale — the user's solve date should beat
 *  in their own clock, not UTC). */
function formatDate(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '';
  const d = new Date(unixSeconds * 1000);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${String(yyyy)}-${mm}-${dd} ${hh}:${min}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** Fire the CF-04/CF-19 session-expired Notice. Copy is LOCKED per UI-SPEC
 *  §Notice strings — sentence case, terminal period. */
function fireSessionExpiredNotice(): void {
  // Accept both the real `Notice` class (from `obsidian`) and any Notice
  // constructor the test suite wires onto globalThis. Production: `new Notice`
  // from the obsidian module. Tests: globalThis.Notice spy.
  // eslint-disable-next-line obsidianmd/prefer-active-doc -- test-suite spy hook
  const NoticeGlobal = (globalThis as { Notice?: unknown }).Notice;
  if (typeof NoticeGlobal === 'function') {
    try {
      const Ctor = NoticeGlobal as unknown as new (msg: string, timeout: number) => unknown;
      new Ctor('LeetCode session expired. Log in again.', SESSION_EXPIRED_NOTICE_MS);
      return;
    } catch {
      // Some test spies are plain functions (not constructors). Try calling it
      // directly before falling through to the module-level Notice.
      try {
        (NoticeGlobal as (msg: string, timeout: number) => unknown)(
          'LeetCode session expired. Log in again.',
          SESSION_EXPIRED_NOTICE_MS,
        );
        return;
      } catch {
        /* fall through to the module-level Notice */
      }
    }
  }
  // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC locked copy
  new Notice('LeetCode session expired. Log in again.', SESSION_EXPIRED_NOTICE_MS);
}
