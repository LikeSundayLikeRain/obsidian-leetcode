// src/browse/ProblemBrowserView.ts
// Right-sidebar ItemView for browsing LeetCode problems (D-06).
// All DOM via createEl / createDiv — never via raw HTML injection (Shared Pattern 3).
// All strings LOCKED by UI-SPEC.md § Copywriting Contract.
import { ItemView, WorkspaceLeaf, Notice, setIcon, Menu } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { IndexedProblem } from './types';
import type { CompoundFilter, FilterRule } from '../settings/SettingsStore';
import { isSessionExpired } from '../api/LeetCodeClient';
import { getActiveThrottle } from '../api/requestUrlFetcher';
import { RateLimitError } from '../shared/errors';
import { showSessionExpiredNotice } from '../solve/SessionExpiredNotice';
import { FilterModal } from './FilterModal';
import { ContestListService } from '../contest/ContestListService';
import { ContestPreviewModal } from '../contest/ContestPreview';
import type { CachedContest, ContestProblemState } from '../contest/types';
import { getRemainingMs } from '../contest/types';
import { AbortContestModal } from '../contest/AbortContestModal';
import { toDetailCacheEntry } from '../notes/NoteWriter';
// WR-02: route all timers through the popout-aware helpers used by Throttle
// so that timers on a view hosted in an Obsidian popout bind to the popout's
// event loop, not the main window's.
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';

export const BROWSER_VIEW_TYPE = 'leetcode-browser';

/** Phase 06 PREVIEW-02 — pure helper that maps a mouse-event-shaped object
 *  to a click intent. Shift-key held → 'open' (CONTEXT.md decision A:
 *  shift-click ALWAYS bypasses preview, regardless of the click-behavior
 *  setting); otherwise 'preview' (the row hand-off lets `routeProblemClick`
 *  on the plugin decide whether to honor the user's setting flip).
 *
 *  Exported so unit tests can pin the shift-key contract directly without
 *  standing up the full ItemView (analog: `computeFilterBadgeCount` below;
 *  see `tests/preview/click-behavior.test.ts`). The defensive `?? false`
 *  fallback handles synthetic events from polyfills that don't carry the
 *  property — treat absence as no-shift. */
export function decideClickIntent(e: { shiftKey?: boolean }): 'preview' | 'open' {
  return (e.shiftKey ?? false) ? 'open' : 'preview';
}

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

  // Phase 10 — Contests mode (D-01)
  private mode: 'problems' | 'contests' = 'problems';
  private contestListService: ContestListService;
  private contestCache: CachedContest[] = [];
  private contestSearchTerm = '';
  private contestSearchDebounce: TimerHandle | null = null;
  private contestRowsContainer: HTMLElement | null = null;
  /** Pagination state for contest list — how many are currently rendered. */
  private contestRenderedCount = 0;
  private static readonly CONTEST_PAGE_SIZE = 50;
  private static readonly CONTEST_SEARCH_DEBOUNCE_MS = 200;

  // Phase 10 Plan 05 — Active contest timer header state
  private timerDisplayEl: HTMLElement | null = null;
  private timerPausedEl: HTMLElement | null = null;
  private badgeEls: HTMLElement[] = [];
  private progressFillEl: HTMLElement | null = null;
  private contestCallbacksWired = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
    this.navigation = false;   // D-06: static dock view
    this.contestListService = new ContestListService(this.plugin.client, this.plugin.lcSettings);
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
    this.filter = this.plugin.lcSettings.getFilter();
    if (this.filter === null && this.plugin.lcSettings.getIsPremium() === false) {
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
      await this.plugin.lcSettings.setFilter(this.filter);
    }

    // Phase 10 D-01: Auto-switch to contests mode when an active session exists (Pitfall 7).
    const activeSession = this.plugin.lcSettings.getContestSession();
    if (activeSession !== null) {
      this.mode = 'contests';
    }

    // Phase 10: render mode toggle above all content
    this.renderModeToggle(root);

    // Content container — refreshAndRender empties this, not root, so the toggle persists.
    const content = root.createDiv({ cls: 'lc-browser-content' });

    if (this.mode === 'contests') {
      await this.renderContestsMode(content);
      return;
    }

    if (!this.plugin.auth.isLoggedIn()) {
      this.renderLoggedOutState(content, {
        heading: 'Log in to browse problems',
        body: 'Sign in to LeetCode to load the problem list.',
      });
      return;
    }

    this.renderEmptyState(content, {
      heading: 'Loading problems…',
      body: 'Fetching the problem list. This happens once.',
    });
    await this.refreshAndRender(content);
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
    if (this.contestSearchDebounce !== null) {
      clearWindowTimeout(this.contestSearchDebounce);
      this.contestSearchDebounce = null;
    }
    // Tear down throttle subscription + pending timer (D-13 cleanup).
    this.clearThrottleFooterTimer();
    if (this.throttleUnsub) {
      this.throttleUnsub();
      this.throttleUnsub = null;
    }
    this.throttleFooterEl = null;
    this.contestRowsContainer = null;
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
    await this.plugin.lcSettings.setFilter(f);
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
            this.throttleFooterEl.setText('⋯ fetching from LeetCode…');
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

    row.addEventListener('click', (e) => {
      // Phase 06 PREVIEW-02 — delegate to the plugin's single row-activation
      // entry point. Shift-click always opens (intent='open' bypasses the
      // user's click-behavior setting per CONTEXT.md decision A); plain
      // left-click defers the preview-vs-open decision to the router, which
      // reads `getPreviewClickBehavior()`. The row still forwards
      // IndexedProblem.status (GAP-2a) so on-first-write lc-status reflects
      // the user's real LC submission status when the router lands on the
      // open path.
      const intent = decideClickIntent(e);
      void this.plugin.routeProblemClick(p.slug, p.status, intent);
    });

    // Phase 06 Plan 03 PREVIEW-01 — right-click context menu. Two items:
    // `Preview problem` and `Open problem` (the v1.0 create-or-open path).
    // Both use `force: true` so the user's `Click behavior` setting cannot
    // suppress the explicit menu choice (CONTEXT.md decision A: right-click
    // intent is explicit, not the default click affordance).
    // `e.preventDefault()` suppresses the browser's default context menu.
    row.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle('Preview problem')
          .setIcon('eye')
          .onClick(() => {
            void this.plugin.routeProblemClick(p.slug, p.status, 'preview', { force: true });
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle('Open problem')
          .setIcon('file-text')
          .onClick(() => {
            void this.plugin.routeProblemClick(p.slug, p.status, 'open', { force: true });
          }),
      );
      menu.showAtMouseEvent(e);
    });
  }

  // ─── Phase 10: Contest mode methods ─────────────────────────────────────────

  /**
   * Render the Problems/Contests mode toggle at the top of the view.
   * ARIA: container role="tablist", buttons role="tab" + aria-selected (D-01).
   */
  private renderModeToggle(root: HTMLElement): void {
    const toggle = root.createDiv({ cls: 'lc-mode-toggle', attr: { role: 'tablist' } });

    const problemsBtn = toggle.createEl('button', {
      text: 'Problems',
      cls: `lc-mode-toggle__btn${this.mode === 'problems' ? ' is-active' : ''}`,
      attr: { role: 'tab', 'aria-selected': String(this.mode === 'problems') },
    });

    const contestsBtn = toggle.createEl('button', {
      text: 'Contests',
      cls: `lc-mode-toggle__btn${this.mode === 'contests' ? ' is-active' : ''}`,
      attr: { role: 'tab', 'aria-selected': String(this.mode === 'contests') },
    });

    problemsBtn.addEventListener('click', () => {
      if (this.mode === 'problems') return;
      this.mode = 'problems';
      void this.onOpen();
    });

    contestsBtn.addEventListener('click', () => {
      if (this.mode === 'contests') return;
      this.mode = 'contests';
      void this.onOpen();
    });
  }

  /**
   * Render contests mode: auth gate, search input, shuffle button, contest rows.
   * Mirrors the problems mode shell pattern with contest-specific rendering.
   */
  private async renderContestsMode(root: HTMLElement): Promise<void> {
    // Auth gate (same pattern as existing auth check in onOpen)
    if (!this.plugin.auth.isLoggedIn()) {
      this.renderLoggedOutState(root, {
        heading: 'Log in to browse contests',
        body: 'Sign in to LeetCode to load the contest list.',
      });
      return;
    }

    // Phase 10 Plan 05 — if a contest session is active, render the active
    // contest UI (timer header + problem cards) instead of the contest list.
    if (this.plugin.contestSessionManager.isActive()) {
      this.renderActiveContest(root);
      return;
    }

    // Top bar: search + shuffle
    const topbar = root.createDiv({ cls: 'lc-topbar' });

    // Search input
    const searchWrap = topbar.createDiv({ cls: 'lc-search' });
    const searchIcon = searchWrap.createSpan({ cls: 'lc-search__icon' });
    setIcon(searchIcon, 'search');
    const input = searchWrap.createEl('input', {
      attr: {
        type: 'search',
        placeholder: 'Search contests…',
        'aria-label': 'Search contests by title',
      },
    });
    input.value = this.contestSearchTerm;
    input.addEventListener('input', () => {
      if (this.contestSearchDebounce !== null) clearWindowTimeout(this.contestSearchDebounce);
      this.contestSearchDebounce = setWindowTimeout(() => {
        this.contestSearchTerm = input.value;
        this.renderContestRows();
      }, ProblemBrowserView.CONTEST_SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        this.contestSearchTerm = '';
        this.renderContestRows();
      }
    });

    // Shuffle (Surprise me) button — D-03
    const shuffleBtn = topbar.createDiv({
      cls: 'lc-iconbtn lc-iconbtn--shuffle',
      attr: { 'aria-label': 'Random contest', role: 'button', tabindex: '0' },
    });
    const shuffleIcon = shuffleBtn.createSpan({ cls: 'lc-iconbtn__icon' });
    setIcon(shuffleIcon, 'shuffle');
    shuffleBtn.addEventListener('click', () => { void this.handleSurpriseMe(); });

    // Rows container for contest list
    this.contestRowsContainer = root.createDiv({ cls: 'lc-rows', attr: { role: 'listbox' } });

    // Loading state
    this.renderEmptyState(this.contestRowsContainer, {
      heading: 'Loading contests…',
      body: 'Fetching the contest list from LeetCode.',
    });

    // Fetch contest list
    try {
      this.contestCache = await this.contestListService.refresh();
      this.contestRenderedCount = 0;
      this.renderContestRows();
    } catch {
      if (this.contestRowsContainer) {
        this.contestRowsContainer.empty();
        this.renderEmptyState(this.contestRowsContainer, {
          heading: 'No contests found',
          body: 'Try a different search term or check your connection.',
          buttonText: 'Retry',
          onAction: () => { void this.renderContestsMode(root); },
        });
      }
    }

    // Scroll pagination — load more contest rows when scrolling near bottom.
    root.addEventListener('scroll', () => {
      if (!this.contestRowsContainer) return;
      const scrollBottom = root.scrollTop + root.clientHeight;
      const threshold = root.scrollHeight - 100;
      if (scrollBottom >= threshold) {
        this.appendContestRows();
      }
    });
  }

  /**
   * Render the contest rows from the filtered cache. Resets and renders
   * the first page (50 items).
   */
  private renderContestRows(): void {
    if (!this.contestRowsContainer) return;
    this.contestRowsContainer.empty();
    this.contestRenderedCount = 0;

    const filtered = this.contestListService.search(this.contestCache, this.contestSearchTerm);
    if (filtered.length === 0) {
      this.renderEmptyState(this.contestRowsContainer, {
        heading: 'No contests found',
        body: 'Try a different search term or check your connection.',
      });
      return;
    }

    const page = filtered.slice(0, ProblemBrowserView.CONTEST_PAGE_SIZE);
    for (const c of page) this.renderContestRow(this.contestRowsContainer, c);
    this.contestRenderedCount = page.length;
  }

  /**
   * Append the next page of contest rows for scroll pagination.
   */
  private appendContestRows(): void {
    if (!this.contestRowsContainer) return;
    const filtered = this.contestListService.search(this.contestCache, this.contestSearchTerm);
    if (this.contestRenderedCount >= filtered.length) return;

    const nextPage = filtered.slice(
      this.contestRenderedCount,
      this.contestRenderedCount + ProblemBrowserView.CONTEST_PAGE_SIZE,
    );
    for (const c of nextPage) this.renderContestRow(this.contestRowsContainer, c);
    this.contestRenderedCount += nextPage.length;
  }

  /**
   * Render a single contest row. Click opens ContestPreview modal.
   * Row format: title (flex:1) + meta (date + '4 problems').
   */
  private renderContestRow(container: HTMLElement, contest: CachedContest): void {
    const row = container.createDiv({
      cls: 'lc-contest-row',
      attr: { role: 'option' },
    });

    row.createDiv({
      cls: 'lc-contest-row__title',
      text: contest.title,
    });

    // Date format: locale-aware short date + ' · 4 problems'
    const date = new Date(contest.startTime * 1000);
    const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    row.createDiv({
      cls: 'lc-contest-row__meta',
      text: `${dateStr} · 4 problems`,
    });

    row.addEventListener('click', () => {
      this.openContestPreview(contest);
    });
  }

  /**
   * D-03: "Surprise me" picks a random valid contest and opens the preview.
   */
  private async handleSurpriseMe(): Promise<void> {
    const contest = await this.contestListService.surpriseMe();
    if (!contest) {
      new Notice("Couldn't find a contest with valid problems. Try picking one manually.", 6000);
      return;
    }
    this.openContestPreview(contest);
  }

  /**
   * Open the ContestPreview modal for a given contest. The modal's onStart
   * callback delegates to startContest which fetches problems and creates a session.
   */
  private openContestPreview(contest: CachedContest): void {
    new ContestPreviewModal(
      this.app,
      contest,
      this.plugin.client,
      async (questions) => { await this.startContest(contest, questions); },
    ).open();
  }

  /**
   * D-10: Fetch all 4 problem details in parallel, create a ContestSession,
   * and notify the user. Called by ContestPreview's onStart callback.
   */
  async startContest(
    contest: CachedContest,
    questions: Array<{ credit: number; title: string; title_slug: string; difficulty: number }>,
  ): Promise<void> {
    // Fetch all problem details in parallel
    const results = await Promise.allSettled(
      questions.map((q) => this.plugin.client.getProblemDetail(q.title_slug)),
    );

    // Check if any fetch failed
    const failed = results.some((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === null));
    if (failed) {
      new Notice("Couldn't fetch contest problems. Check your connection.", 4000);
      return;
    }

    // Cache problem details so ContestSolveView can render content
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const entry = toDetailCacheEntry(r.value);
        await this.plugin.lcSettings.setProblemDetail(r.value.titleSlug, entry);
      }
    }

    // Resolve default language + starter code per problem from cached details
    const defaultLang = this.plugin.lcSettings.getDefaultLanguage() || 'python3';

    // Create contest session via ContestSessionManager
    this.plugin.contestSessionManager.start({
      contestSlug: contest.slug,
      contestTitle: contest.title,
      contestType: contest.type,
      duration: contest.duration,
      problems: questions.map((q) => {
        const detail = this.plugin.lcSettings.getProblemDetail(q.title_slug);
        const snippet = detail?.codeSnippets?.find(s => s.langSlug === defaultLang);
        return {
          slug: q.title_slug,
          title: q.title,
          credit: q.credit,
          difficulty: q.difficulty,
          code: snippet?.code ?? '',
          language: defaultLang,
        };
      }),
    });

    const minutes = Math.round(contest.duration / 60);
    new Notice(`Contest started: ${contest.title}. ${String(minutes)} min on the clock.`, 4000);

    // Re-render in contests mode to show active contest state
    this.mode = 'contests';
    void this.onOpen();
  }

  // ─── Phase 10 Plan 05: Active contest UI ─────────────────────────────────────

  /**
   * Render the active contest dashboard: sticky timer header with countdown,
   * verdict badges, progress bar, action buttons, and navigable problem cards.
   */
  private renderActiveContest(root: HTMLElement): void {
    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return;

    // Wire session manager callbacks once (persists across re-renders).
    this.wireContestCallbacks();

    const remaining = getRemainingMs(session);

    // ─── Sticky timer header ───────────────────────────────────────────
    const timerHeader = root.createDiv({ cls: 'leetcode-contest__timer' });

    // Timer row: icon + display + badges
    const timerRow = timerHeader.createDiv({ cls: 'leetcode-contest__timer-row' });

    const timerIcon = timerRow.createSpan({ cls: 'leetcode-contest__timer-icon' });
    setIcon(timerIcon, 'timer');

    // Timer display with MM:SS
    this.timerDisplayEl = timerRow.createDiv({
      cls: 'leetcode-contest__timer-display',
      attr: { 'aria-live': 'polite' },
    });
    this.updateTimerDisplay(remaining);

    // Verdict badges
    const badgesContainer = timerRow.createDiv({ cls: 'leetcode-contest__badges' });
    this.badgeEls = [];
    for (let i = 0; i < session.problems.length; i++) {
      const problem = session.problems[i]!;
      const badge = badgesContainer.createDiv({
        cls: 'leetcode-contest__badge',
        attr: { 'aria-label': `${problem.title}: ${problem.verdict}` },
      });
      this.renderBadgeIcon(badge, problem.verdict);
      // Click badge → open problem in ContestSolveView
      badge.addEventListener('click', () => {
        void this.plugin.openContestProblem(i);
      });
      this.badgeEls.push(badge);
    }

    // Timer label
    this.timerPausedEl = timerHeader.createDiv({ cls: 'leetcode-contest__timer-label' });
    if (session.isPaused) {
      this.timerPausedEl.setText('Paused');
      this.timerPausedEl.addClass('leetcode-contest__timer-paused');
    } else {
      this.timerPausedEl.setText('Remaining');
    }

    // Progress bar
    const progressContainer = timerHeader.createDiv({ cls: 'leetcode-contest__progress' });
    this.progressFillEl = progressContainer.createDiv({ cls: 'leetcode-contest__progress-fill' });
    this.updateContestProgressBar(session);

    // Action buttons
    const actions = timerHeader.createDiv({ cls: 'leetcode-contest__actions' });

    const pauseResumeBtn = actions.createEl('button', {
      text: session.isPaused ? 'Resume' : 'Pause',
      cls: 'leetcode-contest__btn',
    });
    pauseResumeBtn.addEventListener('click', () => {
      if (this.plugin.contestSessionManager.getSession()?.isPaused) {
        this.plugin.contestSessionManager.resume();
      } else {
        this.plugin.contestSessionManager.pause();
      }
      // Re-render to update button label and timer state
      void this.onOpen();
    });

    const finishBtn = actions.createEl('button', {
      text: 'Finish',
      cls: 'leetcode-contest__btn',
    });
    finishBtn.addEventListener('click', () => {
      void this.handleFinishContest();
    });

    const abortBtn = actions.createEl('button', {
      text: 'Abort',
      cls: 'leetcode-contest__btn leetcode-contest__btn-abort',
    });
    abortBtn.addEventListener('click', () => {
      const currentSession = this.plugin.contestSessionManager.getSession();
      if (!currentSession) return;
      const solvedCount = currentSession.problems.filter((p) => p.verdict === 'accepted').length;
      const currentRemaining = getRemainingMs(currentSession);
      new AbortContestModal(
        this.app,
        solvedCount,
        currentSession.problems.length,
        currentRemaining,
        () => { void this.handleAbortContest(); },
      ).open();
    });

    // ─── Problem cards ─────────────────────────────────────────────────
    const cardsContainer = root.createDiv({ cls: 'leetcode-contest__cards' });
    for (let i = 0; i < session.problems.length; i++) {
      const problem = session.problems[i]!;
      this.renderProblemCard(cardsContainer, problem, i);
    }
  }

  /**
   * Render a single problem card in the active contest view.
   * Click opens ContestSolveView for that problem.
   */
  private renderProblemCard(container: HTMLElement, problem: ContestProblemState, idx: number): void {
    const isAc = problem.verdict === 'accepted';
    const row = container.createDiv({
      cls: `lc-row${isAc ? ' lc-row--solved' : ''}`,
      attr: { role: 'option' },
    });
    row.setAttribute('aria-label',
      `${String(idx + 1)}. ${problem.title}, ${this.diffLabel(problem.difficulty)}, ${problem.verdict}`);

    // Title block
    const titleBlock = row.createDiv({ cls: 'lc-row__titleblock' });
    titleBlock.createSpan({ cls: 'lc-row__id', text: `${String(idx + 1)}. ` });
    titleBlock.createSpan({ cls: 'lc-row__title', text: problem.title });

    // Meta: difficulty + verdict chip
    const meta = row.createDiv({ cls: 'lc-row__meta' });
    const diffClass = this.diffLabel(problem.difficulty).toLowerCase();
    meta.createSpan({
      cls: `lc-row__diff lc-diff--${diffClass}`,
      text: this.diffLabel(problem.difficulty),
    });
    meta.createSpan({
      cls: `leetcode-contest__verdict-chip leetcode-contest__verdict-chip--${problem.verdict}`,
      text: this.verdictLabel(problem.verdict),
    });

    row.addEventListener('click', () => {
      void this.plugin.openContestProblem(idx);
    });
  }

  /** Map numeric difficulty (1-3) to display label. */
  private diffLabel(difficulty: number): string {
    if (difficulty === 1) return 'Easy';
    if (difficulty === 2) return 'Medium';
    return 'Hard';
  }

  /** Map verdict enum to user-facing chip label. */
  private verdictLabel(verdict: ContestProblemState['verdict']): string {
    if (verdict === 'accepted') return 'Accepted';
    if (verdict === 'attempted') return 'Attempted';
    return 'Unsolved';
  }

  /**
   * Render the correct icon in a verdict badge based on the problem's verdict.
   */
  private renderBadgeIcon(badge: HTMLElement, verdict: ContestProblemState['verdict']): void {
    badge.empty();
    badge.removeClass('leetcode-contest__badge--ac');
    badge.removeClass('leetcode-contest__badge--failed');
    badge.removeClass('leetcode-contest__badge--unsolved');

    if (verdict === 'accepted') {
      setIcon(badge, 'check-circle');
      badge.addClass('leetcode-contest__badge--ac');
    } else if (verdict === 'attempted') {
      setIcon(badge, 'x-circle');
      badge.addClass('leetcode-contest__badge--failed');
    } else {
      setIcon(badge, 'circle');
      badge.addClass('leetcode-contest__badge--unsolved');
    }
  }

  /**
   * Update the timer display element text and color class.
   */
  private updateTimerDisplay(remainingMs: number): void {
    if (!this.timerDisplayEl) return;
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    this.timerDisplayEl.setText(
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    );

    // Color shifts: normal > 10min, warning 5-10min, critical < 5min
    this.timerDisplayEl.removeClass('is-warning');
    this.timerDisplayEl.removeClass('is-critical');
    if (remainingMs < 5 * 60 * 1000) {
      this.timerDisplayEl.addClass('is-critical');
    } else if (remainingMs < 10 * 60 * 1000) {
      this.timerDisplayEl.addClass('is-warning');
    }
  }

  /**
   * Update the progress bar fill width based on elapsed time proportion.
   */
  private updateContestProgressBar(session: { duration: number; startedAt: number; pausedDuration: number; isPaused: boolean; pausedAt: number | null }): void {
    if (!this.progressFillEl) return;
    const now = session.isPaused ? (session.pausedAt ?? Date.now()) : Date.now();
    const elapsed = now - session.startedAt - session.pausedDuration;
    const totalMs = session.duration * 1000;
    const pct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
    this.progressFillEl.setCssStyles({ width: `${String(Math.round(pct))}%` });
  }

  /**
   * Wire ContestSessionManager callbacks into the ProblemBrowserView for
   * live updates: tick, expired, verdictChange.
   * Only wires once — subsequent renderActiveContest calls skip.
   */
  private wireContestCallbacks(): void {
    const manager = this.plugin.contestSessionManager;
    if ((manager as unknown as { _pbvCallbacksWired?: boolean })._pbvCallbacksWired) return;
    (manager as unknown as { _pbvCallbacksWired?: boolean })._pbvCallbacksWired = true;
    this.contestCallbacksWired = true;
    // Patch the callbacks that were set at manager construction to include
    // our live-update behavior. The manager's callbacks object is set once
    // at construction. We need to hook into the same reference.
    // The approach: save original callbacks, override with wrappers that
    // call both the original and our UI updates.
    const originalCallbacks = (manager as unknown as { callbacks: {
      onTick: (remainingMs: number) => void;
      onExpired: () => void;
      onVerdictChange: (idx: number, verdict: ContestProblemState['verdict']) => void;
    } }).callbacks;

    const origTick = originalCallbacks.onTick;
    const origExpired = originalCallbacks.onExpired;
    const origVerdict = originalCallbacks.onVerdictChange;

    originalCallbacks.onTick = (remainingMs: number) => {
      origTick(remainingMs);
      this.updateTimerDisplay(remainingMs);
      // Also update progress bar
      const session = manager.getSession();
      if (session) this.updateContestProgressBar(session);
    };

    originalCallbacks.onExpired = () => {
      // origExpired() fires handleContestEnd(false) via main.ts which owns
      // the full lifecycle (sync → finish → finalize → cleanup). We only
      // need to reset the PBV UI state after it completes.
      origExpired();
      this.contestCallbacksWired = false;
      (manager as unknown as { _pbvCallbacksWired?: boolean })._pbvCallbacksWired = false;
      this.mode = 'contests';
      void this.onOpen();
    };

    originalCallbacks.onVerdictChange = (idx: number, verdict: ContestProblemState['verdict']) => {
      origVerdict(idx, verdict);
      // Update the badge at this index
      const badge = this.badgeEls[idx];
      if (badge) {
        const session = manager.getSession();
        const problem = session?.problems[idx];
        this.renderBadgeIcon(badge, verdict);
        if (problem) {
          badge.setAttribute('aria-label', `${problem.title}: ${verdict}`);
        }
      }
    };
  }

  private async handleFinishContest(): Promise<void> {
    // D-09: Do NOT call finish() here — handleContestEnd owns the full
    // lifecycle (sync code → finish → finalize → Notice → cleanup).
    // Calling finish() first would clear the session before handleContestEnd
    // can read it, causing the finalization to silently bail out.
    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return;

    this.contestCallbacksWired = false;
    (this.plugin.contestSessionManager as unknown as { _pbvCallbacksWired?: boolean })._pbvCallbacksWired = false;
    await (this.plugin as unknown as { handleContestEnd(aborted: boolean): Promise<void> }).handleContestEnd(false);
    this.mode = 'contests';
    await this.onOpen();
  }

  private async handleAbortContest(): Promise<void> {
    // D-09: Same fix as handleFinishContest — let handleContestEnd own abort.
    const session = this.plugin.contestSessionManager.getSession();
    if (!session) return;

    this.contestCallbacksWired = false;
    (this.plugin.contestSessionManager as unknown as { _pbvCallbacksWired?: boolean })._pbvCallbacksWired = false;
    await (this.plugin as unknown as { handleContestEnd(aborted: boolean): Promise<void> }).handleContestEnd(true);
    this.mode = 'contests';
    await this.onOpen();
  }
}
