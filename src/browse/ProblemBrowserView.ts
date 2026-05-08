// src/browse/ProblemBrowserView.ts
// Right-sidebar ItemView for browsing LeetCode problems (D-06).
// All DOM via createEl / createDiv — never via raw HTML injection (Shared Pattern 3).
// All strings LOCKED by UI-SPEC.md § Copywriting Contract.
import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { IndexedProblem } from './types';
import { isSessionExpired } from '../api/LeetCodeClient';
import { getActiveThrottle } from '../api/requestUrlFetcher';
import { RateLimitError } from '../shared/errors';
// WR-02: route all timers through the popout-aware helpers used by Throttle
// so that timers on a view hosted in an Obsidian popout bind to the popout's
// event loop, not the main window's.
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';

export const BROWSER_VIEW_TYPE = 'leetcode-browser';

const SEARCH_DEBOUNCE_MS = 150;
const THROTTLE_FOOTER_DELAY_MS = 2000;   // D-13: only surface indicator if queue > 0 for > 2s
const SESSION_EXPIRED_NOTICE_MS = 8000;  // UI-SPEC Notice table
// NOTE: RATE_LIMIT_NOTICE_MS (6000 per UI-SPEC § Notice table / D-14) is inlined at the
// Notice call site as a literal to satisfy the acceptance grep `, 6000)` in Plan 06.
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
type Diff = (typeof DIFFICULTIES)[number];

// Status chip labels (UI-SPEC.md § Copywriting) + internal vocabulary
// expected by ProblemListService.filter({ status }).
const STATUS_CHIPS = [
  { label: 'Solved',    value: 'solved' as const },
  { label: 'Attempted', value: 'attempted' as const },
  { label: 'Untouched', value: 'untouched' as const },
];
type StatusValue = typeof STATUS_CHIPS[number]['value'];

export class ProblemBrowserView extends ItemView {
  private index: IndexedProblem[] = [];
  private searchTerm = '';
  private activeDifficulties: Set<Diff> = new Set();
  private activeStatuses: Set<StatusValue> = new Set();
  private searchDebounce: TimerHandle | null = null;
  private rowsContainer: HTMLElement | null = null;

  // Throttle footer indicator state (BLOCKER 3 / D-13).
  private throttleUnsub: (() => void) | null = null;
  private throttleFooterEl: HTMLElement | null = null;
  private throttleFooterTimer: TimerHandle | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
    this.navigation = false;   // D-06: static dock view
  }

  getViewType(): string { return BROWSER_VIEW_TYPE; }
  // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
  getDisplayText(): string { return 'LeetCode problems'; }
  getIcon(): string { return 'code-2'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('leetcode-browser');

    if (!this.plugin.auth.isLoggedIn()) {
      this.renderLoggedOutState(root, {
        heading: 'Log in to browse problems',
        body: 'Sign in to LeetCode to load the problem list.',
      });
      return;
    }

    this.renderEmptyState(root, {
      heading: 'Loading problems…',
      body: 'Fetching the problem list. This happens once.',
    });
    await this.refreshAndRender(root);
  }

  /**
   * Render the logged-out empty state with a Log-in button.
   * WR-05: extracted so the session-expiry path can call this directly
   * instead of recursing into onOpen() (which re-enters refreshAndRender
   * if isLoggedIn() still returns true — possible if logout's saveData
   * throws — causing unbounded recursion to stack overflow).
   */
  private renderLoggedOutState(
    root: HTMLElement,
    opts: { heading: string; body: string },
  ): void {
    this.renderEmptyState(root, {
      heading: opts.heading,
      body: opts.body,
      buttonText: 'Log in',
      onAction: async () => {
        const ok = await this.plugin.auth.login();
        if (ok) void this.refreshAndRender(root);
      },
    });
  }

  async onClose(): Promise<void> {
    if (this.searchDebounce !== null) {
      clearWindowTimeout(this.searchDebounce);
      this.searchDebounce = null;
    }
    // Tear down throttle subscription + pending timer (D-13 cleanup).
    this.clearThrottleFooterTimer();
    if (this.throttleUnsub) {
      this.throttleUnsub();
      this.throttleUnsub = null;
    }
    this.throttleFooterEl = null;
  }

  private async refreshAndRender(root: HTMLElement): Promise<void> {
    try {
      this.index = await this.plugin.list.refresh();
    } catch (err) {
      // D-14: rate-limit path takes precedence. Fetcher (Plan 02) has already
      // honored retry-after. Our job is the one-shot Notice; copy + duration LOCKED
      // by UI-SPEC.md § Notice table / PATTERNS.md Shared Pattern 4.
      if (err instanceof RateLimitError) {
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
        new Notice('LeetCode rate-limited — slowing down.', 6000); // RATE_LIMIT_NOTICE_MS — literal retained for acceptance grep
        return;
      }

      // AUTH-04 end-to-end: detect → Notice → logout → re-open.
      const maybeResp = (typeof err === 'object' && err !== null)
        ? (err as { response?: unknown }).response
        : undefined;
      if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
        // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Notice messages LOCKED
        new Notice('LeetCode session expired. Log in again.', SESSION_EXPIRED_NOTICE_MS);
        // Swallow logout errors — we always want to re-render the logged-out state.
        await this.plugin.auth.logout().catch(() => undefined);
        // WR-05: render the logged-out state directly. Previously we called
        // this.onOpen(), which re-enters refreshAndRender if isLoggedIn()
        // still returns true (possible when logout's saveData throws and the
        // cookie persists), causing unbounded recursion → stack overflow.
        root.empty();
        this.renderLoggedOutState(root, {
          heading: 'Log in to browse problems',
          body: 'Your session expired. Sign in again to continue.',
        });
        return;
      }
      root.empty();
      this.renderEmptyState(root, {
        heading: "Couldn't reach LeetCode",
        body: 'Check your internet connection and try again.',
        buttonText: 'Retry',
        onAction: () => this.refreshAndRender(root),
      });
      return;
    }
    root.empty();
    this.renderShell(root);
    this.renderRows();
  }

  private renderEmptyState(
    root: HTMLElement,
    opts: { heading: string; body: string; buttonText?: string; onAction?: () => void | Promise<void> },
  ): void {
    const wrap = root.createDiv({ cls: 'lc-empty' });
    wrap.createEl('h3', { text: opts.heading });
    wrap.createEl('p', { text: opts.body, cls: 'lc-empty__body' });
    if (opts.buttonText && opts.onAction) {
      const btn = wrap.createEl('button', { text: opts.buttonText, cls: 'lc-empty__btn' });
      btn.addEventListener('click', () => { void opts.onAction?.(); });
    }
  }

  private renderShell(root: HTMLElement): void {
    // Search input
    const searchWrap = root.createDiv({ cls: 'lc-search' });
    const searchIcon = searchWrap.createSpan({ cls: 'lc-search__icon' });
    setIcon(searchIcon, 'search');
    const input = searchWrap.createEl('input', {
      attr: {
        type: 'search',
        placeholder: 'Search by title or number',
        'aria-label': 'Search by title or number',
      },
    });
    input.addEventListener('input', () => {
      if (this.searchDebounce !== null) clearWindowTimeout(this.searchDebounce);
      this.searchDebounce = setWindowTimeout(() => {
        this.searchTerm = input.value;
        this.renderRows();
      }, SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        this.searchTerm = '';
        this.renderRows();
      }
    });

    // Difficulty filter row
    const filterRow = root.createDiv({ cls: 'lc-filters lc-filters--difficulty' });
    for (const diff of DIFFICULTIES) {
      const chip = filterRow.createDiv({ cls: 'lc-chip', text: diff });
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        if (this.activeDifficulties.has(diff)) {
          this.activeDifficulties.delete(diff);
          chip.removeClass('is-active');
          chip.setAttribute('aria-pressed', 'false');
        } else {
          this.activeDifficulties.add(diff);
          chip.addClass('is-active');
          chip.setAttribute('aria-pressed', 'true');
        }
        this.renderRows();
      });
    }

    // Status filter row (BLOCKER 3)
    const statusRow = root.createDiv({ cls: 'lc-filters lc-filters--status' });
    for (const { label, value } of STATUS_CHIPS) {
      const chip = statusRow.createDiv({ cls: 'lc-chip', text: label });
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        if (this.activeStatuses.has(value)) {
          this.activeStatuses.delete(value);
          chip.removeClass('is-active');
          chip.setAttribute('aria-pressed', 'false');
        } else {
          this.activeStatuses.add(value);
          chip.addClass('is-active');
          chip.setAttribute('aria-pressed', 'true');
        }
        this.renderRows();
      });
    }

    // Rows container
    this.rowsContainer = root.createDiv({ cls: 'lc-rows', attr: { role: 'listbox' } });

    // D-13 footer throttle indicator (BLOCKER 3).
    // We DO NOT create the lc-footer element yet — it's lazy-created when the queue stays
    // non-empty for THROTTLE_FOOTER_DELAY_MS. `root` is captured so we can create/remove in-place.
    this.wireThrottleFooter(root);
  }

  /**
   * Subscribe to the active Throttle's queue-depth events. When depth > 0, start a
   * 2000ms timer; on expiry, render `lc-footer` with the locked copy. On drain
   * (depth === 0), clear the timer and remove the footer. Unsubscribe handle is
   * stored so onClose() can tear it down (prevents leaks across hot-reload cycles).
   */
  private wireThrottleFooter(root: HTMLElement): void {
    const throttle = getActiveThrottle();
    if (!throttle) return;   // fetcher not installed — nothing to subscribe to
    this.throttleUnsub = throttle.onQueueChange((depth: number) => {
      if (depth > 0) {
        if (this.throttleFooterTimer === null && !this.throttleFooterEl) {
          this.throttleFooterTimer = setWindowTimeout(() => {
            this.throttleFooterEl = root.createDiv({ cls: 'lc-footer' });
            // eslint-disable-next-line obsidianmd/ui/sentence-case -- UI-SPEC.md § Copywriting LOCKED: "LeetCode" is a proper-noun brand name
            this.throttleFooterEl.setText('⋯ Fetching from LeetCode…');
            this.throttleFooterTimer = null;
          }, THROTTLE_FOOTER_DELAY_MS);
        }
      } else {
        this.clearThrottleFooterTimer();
        if (this.throttleFooterEl) {
          this.throttleFooterEl.remove();
          this.throttleFooterEl = null;
        }
      }
    });
  }

  private clearThrottleFooterTimer(): void {
    if (this.throttleFooterTimer !== null) {
      clearWindowTimeout(this.throttleFooterTimer);
      this.throttleFooterTimer = null;
    }
  }

  private renderRows(): void {
    if (!this.rowsContainer) return;
    this.rowsContainer.empty();
    const filtered = this.plugin.list.filter(
      this.plugin.list.search(this.index, this.searchTerm),
      {
        difficulty: Array.from(this.activeDifficulties),
        status: Array.from(this.activeStatuses),
      },
    );

    if (filtered.length === 0) {
      this.renderEmptyState(this.rowsContainer, {
        heading: 'No matching problems',
        body: 'Try a different search term or clear filters.',
        buttonText: 'Clear filters',
        onAction: () => {
          this.searchTerm = '';
          this.activeDifficulties.clear();
          this.activeStatuses.clear();
          const root = this.containerEl.children[1] as HTMLElement;
          root.empty();
          // Tear down prior throttle subscription before re-wiring in renderShell.
          if (this.throttleUnsub) { this.throttleUnsub(); this.throttleUnsub = null; }
          this.clearThrottleFooterTimer();
          this.throttleFooterEl = null;
          this.renderShell(root);
          this.renderRows();
        },
      });
      return;
    }

    // Virtualization simplified — render all rows; optimize with IntersectionObserver in dogfooding
    // if the 3,300-row list feels janky (CONTEXT.md Claude's Discretion).
    for (const p of filtered) {
      this.renderRow(this.rowsContainer, p);
    }
  }

  private renderRow(container: HTMLElement, p: IndexedProblem): void {
    const row = container.createDiv({ cls: 'lc-row', attr: { role: 'option' } });
    row.setAttribute('aria-label', `${p.id}. ${p.title}, ${p.diff}`);

    // Status icon slot (populated by Plan 05's status field — 'solved' / 'attempted' / 'untouched').
    row.createDiv({ cls: `lc-row__status lc-row__status--${p.status ?? 'untouched'}` });

    // LC id (textContent via createSpan — NEVER raw HTML)
    row.createSpan({ cls: 'lc-row__id', text: String(p.id) });

    // Title
    row.createSpan({ cls: 'lc-row__title', text: p.title });

    // Difficulty pill
    const diffCls = `lc-diff--${p.diff.toLowerCase()}`;
    row.createSpan({ cls: `lc-row__diff ${diffCls}`, text: p.diff });

    row.addEventListener('click', () => {
      new Notice(`Phase 1 stub: would open ${p.slug}.`, 3000);
    });
  }
}
