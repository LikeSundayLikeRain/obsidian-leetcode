// src/browse/ProblemBrowserView.ts
// Right-sidebar ItemView for browsing LeetCode problems (D-06).
// All DOM via createEl / createDiv — never via raw HTML injection (Shared Pattern 3).
// All strings LOCKED by UI-SPEC.md § Copywriting Contract.
import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { IndexedProblem } from './types';
import type { CompoundFilter, FilterRule } from '../settings/SettingsStore';
import { isSessionExpired } from '../api/LeetCodeClient';
import { getActiveThrottle } from '../api/requestUrlFetcher';
import { RateLimitError } from '../shared/errors';
import { showSessionExpiredNotice } from '../solve/SessionExpiredNotice';
import { FilterModal } from './FilterModal';
// WR-02: route all timers through the popout-aware helpers used by Throttle
// so that timers on a view hosted in an Obsidian popout bind to the popout's
// event loop, not the main window's.
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';

export const BROWSER_VIEW_TYPE = 'leetcode-browser';

/** Phase 5.2 D-04 — compute the user-visible filter-badge count from a
 *  compound filter. A rule counts toward the badge only when it is both:
 *   1. NOT carrying the `__autoDefault: true` marker (stamped on the
 *      first-open premium default for non-Premium users), AND
 *   2. has at least one value selected (`values.length > 0`).
 *
 *  The second condition is important after Reset: FilterModal.onOpen()
 *  pre-populates Status / Difficulty / Topics as blank rules (`values: []`)
 *  so the UI always shows those rows. Those no-op rules shouldn't inflate
 *  the badge — the user hasn't actually filtered anything.
 *
 *  Exported so unit tests can assert the contract directly without
 *  instantiating the full ItemView (see
 *  tests/browse/ProblemBrowserView.badge.test.ts Wave 0 shell). */
export function computeFilterBadgeCount(f: CompoundFilter | null): number {
  if (!f) return 0;
  return f.rules.filter((r) => {
    const marked = (r as FilterRule & { __autoDefault?: boolean }).__autoDefault;
    if (marked) return false;
    // A rule with an empty values array is a no-op (matches everything /
    // filters nothing), so shouldn't count toward the "active filter" badge.
    // Range-shaped rules (question-id, acceptance) don't have a `values`
    // array — count them as active iff at least one of min/max is set.
    if (r.field === 'question-id' || r.field === 'acceptance') {
      return r.min !== null || r.max !== null;
    }
    return Array.isArray(r.values) && r.values.length > 0;
  }).length;
}

const SEARCH_DEBOUNCE_MS = 150;
const THROTTLE_FOOTER_DELAY_MS = 2000;   // D-13: only surface indicator if queue > 0 for > 2s
// SESSION_EXPIRED_NOTICE_MS (8000ms per UI-SPEC § Notice table) is owned by
// `showSessionExpiredNotice`. RATE_LIMIT_NOTICE_MS (6000ms per UI-SPEC §
// Notice table / D-14) is inlined at the Notice call site as a literal to
// satisfy Plan 06's acceptance grep `, 6000)`.

export class ProblemBrowserView extends ItemView {
  private index: IndexedProblem[] = [];
  private searchTerm = '';
  private searchDebounce: TimerHandle | null = null;
  private rowsContainer: HTMLElement | null = null;
  private solvedCounterEl: HTMLElement | null = null;
  private filterBadgeEl: HTMLElement | null = null;
  /** The effective compound filter. Loaded from settings on open, edited via
   *  FilterModal, persisted back via settings.setFilter() on each Apply. */
  private filter: CompoundFilter | null = null;

  // Throttle footer indicator state (BLOCKER 3 / D-13).
  private throttleUnsub: (() => void) | null = null;
  private throttleFooterEl: HTMLElement | null = null;
  private throttleFooterTimer: TimerHandle | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
    this.navigation = false;   // D-06: static dock view
  }

  getViewType(): string { return BROWSER_VIEW_TYPE; }
   
  getDisplayText(): string { return 'LeetCode problems'; }
  getIcon(): string { return 'code-2'; }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('leetcode-browser');

    // Load persisted compound filter. If this is the user's first open and
    // they're not a Premium subscriber, apply a sensible default ("hide
    // Premium content") so the list isn't cluttered with locked problems.
    this.filter = this.plugin.settings.getFilter();
    if (this.filter === null && this.plugin.settings.getIsPremium() === false) {
      // Phase 5.2 D-03 + D-04 — multi-value premium shape (values: ['non-premium'])
      // plus the `__autoDefault: true` marker so updateFilterBadge excludes
      // this rule from the user-visible count on fresh install. The marker is
      // an extra property on the rule object; isValidFilterRule ignores
      // unknown fields so it survives JSON round-trip through data.json. Once
      // the user opens the filter modal and hits Apply, stripAutoDefaults
      // (FilterModal.ts) removes the marker and subsequent loads count the
      // rule normally.
      this.filter = {
        match: 'all',
        rules: [{
          field: 'premium',
          op: 'is',
          values: ['non-premium'],
          __autoDefault: true,
        } as FilterRule & { __autoDefault?: boolean }],
      };
      await this.plugin.settings.setFilter(this.filter);
    }

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
    // Progressive rendering: paint the shell first, then append rows as each
    // paginated batch lands. This replaces the prior "wait 30-60s staring at
    // 'Loading problems…' then render all 3,300 at once" UX with an incremental
    // load — rows show up every ~2s, with a progress bar pinned below the
    // filter chips. When the cached index is fresh the onProgress callback
    // still fires once with `done: true` so we can still take the same path.
    root.empty();
    // Progress bar is created BEFORE the shell so it sits at the top of the
    // view — user never has to scroll to see loading state. Sticky-positioned
    // via CSS so it stays pinned while rows grow under it.
    const progressEl = this.createProgressBar(root);
    // Reset the index before the shell is rendered so the solved-counter
    // starts at `0 / 0` instead of displaying stale totals from a prior view.
    this.index = [];
    this.renderShell(root);
    let renderedCount = 0;
    const appendBatch = (rows: IndexedProblem[]): void => {
      // Accumulate into this.index so the solved-counter (which reads it)
      // grows as pages land. The final `this.index = await …` assignment
      // replaces this with the canonical array; if that array is reference-
      // identical to ours (ProblemListService returns the same `all` array it
      // built up), the reassignment is a no-op.
      this.index.push(...rows);
      // Honor the user's current search + filter state even during initial
      // load — if they start typing or editing the filter while paging, the
      // new rows paint respecting their selection.
      const filtered = this.plugin.list.search(
        this.plugin.list.applyCompoundFilter(rows, this.filter),
        this.searchTerm,
      );
      if (!this.rowsContainer) return;
      // If the user is currently on an empty-filter-state placeholder, nuke it
      // so the first matching row replaces the placeholder cleanly.
      if (renderedCount === 0) this.rowsContainer.empty();
      for (const p of filtered) this.renderRow(this.rowsContainer, p);
      renderedCount += filtered.length;
      this.updateSolvedCounter();
    };

    try {
      this.index = await this.plugin.list.refresh(false, (p) => {
        appendBatch(p.rows);
        this.updateProgressBar(progressEl, p.loaded, p.total);
        if (p.done) this.removeProgressBar(progressEl);
      });
      // Final counter update covers the cached-index path (onProgress fires
      // once with done:true and the cached array, but appendBatch hasn't run
      // against an empty this.index yet so the counter still shows 0/0).
      this.updateSolvedCounter();
      // If the call used cached data and short-circuited before the callback
      // could be scheduled, render everything now and remove the bar.
      if (renderedCount === 0) {
        this.removeProgressBar(progressEl);
        this.renderRows();
      }
    } catch (err) {
      // D-14: rate-limit path takes precedence. Fetcher (Plan 02) has already
      // honored retry-after. Our job is the one-shot Notice; copy + duration LOCKED
      // by UI-SPEC.md § Notice table / PATTERNS.md Shared Pattern 4.
      if (err instanceof RateLimitError) {
         
        new Notice('LeetCode rate-limited — slowing down.', 6000); // RATE_LIMIT_NOTICE_MS — literal retained for acceptance grep
        return;
      }

      // AUTH-04 end-to-end: detect → Notice → logout → re-open.
      const maybeResp = (typeof err === 'object' && err !== null)
        ? (err as { response?: unknown }).response
        : undefined;
      if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
        // D-21: sticky Notice + Log in button.
        showSessionExpiredNotice(() => { void this.plugin.auth.login(); });
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
    // Shell + rows were already rendered progressively above. No trailing
    // full rerender — it would flash the list and discard the user's current
    // search/filter state at the exact moment the progress bar disappears.
  }

  /** Create the progress bar element pinned to the top of the view.
   *  Starts in indeterminate (shimmer) mode; updateProgressBar flips to
   *  determinate once LC returns a total. Cleared via removeProgressBar(). */
  private createProgressBar(root: HTMLElement): HTMLElement {
    const bar = root.createDiv({ cls: 'lc-progress is-indeterminate' });
    bar.createDiv({ cls: 'lc-progress__track' }).createDiv({ cls: 'lc-progress__fill' });
    bar.createDiv({ cls: 'lc-progress__label', text: 'Loading problems…' });
    return bar;
  }

  private updateProgressBar(
    bar: HTMLElement,
    loaded: number,
    total: number | null,
  ): void {
    const fill = bar.querySelector<HTMLElement>('.lc-progress__fill');
    const label = bar.querySelector('.lc-progress__label');
    if (total !== null && total > 0) {
      // Flip out of indeterminate shimmer mode into determinate width animation.
      bar.removeClass('is-indeterminate');
      const pct = Math.min(100, Math.round((loaded / total) * 100));
      if (fill) fill.setCssStyles({ width: `${String(pct)}%` });
      if (label) label.setText(`Loading problems… ${String(loaded)} / ${String(total)} (${String(pct)}%)`);
    } else {
      // Total unknown (first page hasn't arrived yet, or LC didn't return one).
      // Keep shimmer running; update only the label.
      if (label) label.setText(`Loading problems… ${String(loaded)} loaded`);
    }
  }

  private removeProgressBar(bar: HTMLElement): void {
    bar.remove();
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
    // Top bar layout (matches LC): pill search | filter btn | spacer | solved donut | shuffle btn
    const topbar = root.createDiv({ cls: 'lc-topbar' });

    // 1. Pill-shaped search box (flex-grow to consume left portion)
    const searchWrap = topbar.createDiv({ cls: 'lc-search' });
    const searchIcon = searchWrap.createSpan({ cls: 'lc-search__icon' });
    setIcon(searchIcon, 'search');
    const input = searchWrap.createEl('input', {
      attr: {
        type: 'search',
        placeholder: 'Search questions',
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

    // 2. Filter button — opens FilterModal. Shows a count badge when rules are active.
    const filterBtn = topbar.createDiv({
      cls: 'lc-iconbtn lc-iconbtn--filter',
      attr: { 'aria-label': 'Filter problems', role: 'button', tabindex: '0' },
    });
    const filterIcon = filterBtn.createSpan({ cls: 'lc-iconbtn__icon' });
    setIcon(filterIcon, 'filter');
    this.filterBadgeEl = filterBtn.createSpan({ cls: 'lc-iconbtn__badge' });
    this.updateFilterBadge();
    filterBtn.addEventListener('click', () => { this.openFilterModal(); });

    // 3. Solved counter donut (right side of bar)
    this.solvedCounterEl = topbar.createDiv({ cls: 'lc-counter' });
    this.updateSolvedCounter();

    // 4. Shuffle button — picks a random problem from the current filter result.
    const shuffleBtn = topbar.createDiv({
      cls: 'lc-iconbtn lc-iconbtn--shuffle',
      attr: { 'aria-label': 'Pick a random problem', role: 'button', tabindex: '0' },
    });
    const shuffleIcon = shuffleBtn.createSpan({ cls: 'lc-iconbtn__icon' });
    setIcon(shuffleIcon, 'shuffle');
    shuffleBtn.addEventListener('click', () => { this.pickRandom(); });

    // Rows container
    this.rowsContainer = root.createDiv({ cls: 'lc-rows', attr: { role: 'listbox' } });

    // D-13 footer throttle indicator (BLOCKER 3).
    // We DO NOT create the lc-footer element yet — it's lazy-created when the queue stays
    // non-empty for THROTTLE_FOOTER_DELAY_MS. `root` is captured so we can create/remove in-place.
    this.wireThrottleFooter(root);
  }

  /** Recompute the solved donut: SVG circle with an arc filled proportionally
   *  to solved/total. Reads from `this.index` (updated progressively). */
  private updateSolvedCounter(): void {
    if (!this.solvedCounterEl) return;
    const solved = this.index.filter((p) => p.status === 'solved').length;
    const total = this.index.length;
    const pct = total > 0 ? solved / total : 0;
    this.solvedCounterEl.empty();

    // SVG donut: 20x20 viewbox, radius 8, stroke-width 3, circumference 2πr.
    // Use createElementNS rather than activeDocument.createSvg — the latter is
    // Obsidian's helper that appends to document root and throws
    // "Only one element on document allowed" (the <html> element is already
    // there). createElementNS creates a detached SVG we append ourselves.
    const size = 20;
    const r = 8;
    const circumference = 2 * Math.PI * r;
    const doc = this.solvedCounterEl.ownerDocument;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'lc-counter__donut');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${String(size)} ${String(size)}`);
    // Track circle (muted background)
    const track = doc.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'lc-counter__donut-track');
    track.setAttribute('cx', String(size / 2));
    track.setAttribute('cy', String(size / 2));
    track.setAttribute('r', String(r));
    svg.appendChild(track);
    // Progress arc (green). dasharray = (solved portion, remainder). Rotated -90deg so 0 starts at top.
    const arc = doc.createElementNS(SVG_NS, 'circle');
    arc.setAttribute('class', 'lc-counter__donut-arc');
    arc.setAttribute('cx', String(size / 2));
    arc.setAttribute('cy', String(size / 2));
    arc.setAttribute('r', String(r));
    arc.setAttribute('stroke-dasharray',
      `${String(circumference * pct)} ${String(circumference * (1 - pct))}`);
    arc.setAttribute('transform', `rotate(-90 ${String(size / 2)} ${String(size / 2)})`);
    svg.appendChild(arc);
    this.solvedCounterEl.appendChild(svg);

    this.solvedCounterEl.createSpan({
      cls: 'lc-counter__label',
      text: `${String(solved)}/${String(total)} Solved`,
    });
  }

  /** Refresh the small numeric badge on the filter button to reflect the
   *  count of currently-active user rules. Hidden when no user rules.
   *
   *  Phase 5.2 D-04 — auto-applied default rules (e.g. the `premium: non-premium`
   *  rule stamped on first open for non-Premium users) carry a
   *  `__autoDefault: true` marker and are excluded from the count, so a fresh
   *  install shows no badge even though a filter is technically active. */
  private updateFilterBadge(): void {
    if (!this.filterBadgeEl) return;
    const count = computeFilterBadgeCount(this.filter);
    if (count === 0) {
      this.filterBadgeEl.removeClass('is-visible');
      this.filterBadgeEl.setText('');
    } else {
      this.filterBadgeEl.addClass('is-visible');
      this.filterBadgeEl.setText(String(count));
    }
  }

  /** Open the compound-filter modal. On Apply, persist + re-render rows. */
  private openFilterModal(): void {
    // Collect all unique topic slugs from the current cached index so the
    // Topics multi-select has real values to pick from.
    const topics = new Set<string>();
    for (const p of this.index) {
      for (const t of p.topics ?? []) topics.add(t);
    }
    const modal = new FilterModal(
      this.app,
      this.filter,
      Array.from(topics),
      (f) => { void this.applyFilter(f); },
    );
    modal.open();
  }

  private async applyFilter(f: CompoundFilter | null): Promise<void> {
    this.filter = f;
    await this.plugin.settings.setFilter(f);
    this.updateFilterBadge();
    this.renderRows();
  }

  /** Pick a random problem from the currently-visible (filtered + searched)
   *  list and fire the same row-click stub. Phase 2 replaces with note-open. */
  private pickRandom(): void {
    const visible = this.currentlyVisible();
    if (visible.length === 0) {
      new Notice('No problems match the current filter.', 3000);
      return;
    }
    const pick = visible[Math.floor(Math.random() * visible.length)];
    if (!pick) return;
    // GAP-2a: forward the row's IndexedProblem.status so the on-first-write
    // lc-status reflects the user's real LC submission status.
    void this.plugin.openProblem(pick.slug, pick.status);
  }

  /** Compute the currently-visible row set: apply compound filter then search. */
  private currentlyVisible(): IndexedProblem[] {
    const filtered = this.plugin.list.applyCompoundFilter(this.index, this.filter);
    return this.plugin.list.search(filtered, this.searchTerm);
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
    const filtered = this.currentlyVisible();

    if (filtered.length === 0) {
      this.renderEmptyState(this.rowsContainer, {
        heading: 'No matching problems',
        body: 'Try a different search term or clear filters.',
        buttonText: 'Clear filters',
        onAction: () => {
          this.searchTerm = '';
          void this.applyFilter(null);
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
    const status = p.status ?? 'untouched';
    const row = container.createDiv({
      cls: `lc-row lc-row--${status}`,
      attr: { role: 'option' },
    });
    row.setAttribute('aria-label',
      `${String(p.id)}. ${p.title}, ${p.diff}${p.paid ? ', premium' : ''}, ${status}`);

    // 1. Leading icon slot — matches LeetCode's conventions:
    //    - Premium (paid) problems: lock icon in amber, regardless of status
    //    - Solved: green check
    //    - Attempted: empty circle
    //    - Todo (untouched): no icon at all, just an empty slot for alignment
    const iconSlot = row.createDiv({ cls: `lc-row__status lc-row__status--${status}` });
    if (p.paid) {
      iconSlot.addClass('lc-row__status--paid');
      setIcon(iconSlot, 'lock');
      iconSlot.setAttribute('aria-label', 'Premium problem');
    } else if (status === 'solved') {
      setIcon(iconSlot, 'check');
    } else if (status === 'attempted') {
      setIcon(iconSlot, 'circle');
    }
    // Todo → leave the slot empty (intentional whitespace for column alignment).

    // 2. Title block — id + title on a single line (muted id prefix).
    const titleBlock = row.createDiv({ cls: 'lc-row__titleblock' });
    titleBlock.createSpan({ cls: 'lc-row__id', text: `${String(p.id)}. ` });
    titleBlock.createSpan({ cls: 'lc-row__title', text: p.title });

    // 3. Right-hand metadata: acceptance %, difficulty label.
    const meta = row.createDiv({ cls: 'lc-row__meta' });
    if (typeof p.acRate === 'number') {
      meta.createSpan({
        cls: 'lc-row__acrate',
        text: `${p.acRate.toFixed(1)}%`,
      });
    }
    const diffLabel = p.diff === 'Medium' ? 'Med.' : p.diff;
    meta.createSpan({
      cls: `lc-row__diff lc-diff--${p.diff.toLowerCase()}`,
      text: diffLabel,
    });

    row.addEventListener('click', () => {
      // GAP-2a: forward the row's IndexedProblem.status so the on-first-write
      // lc-status reflects the user's real LC submission status.
      void this.plugin.openProblem(p.slug, p.status);
    });
  }
}
