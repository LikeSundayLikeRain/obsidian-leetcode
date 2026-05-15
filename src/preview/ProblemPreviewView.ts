// src/preview/ProblemPreviewView.ts
//
// Phase 06 Plan 03 — Preview ItemView for `leetcode-preview` view type.
// Sticky header (title + difficulty pill + topic chips + Start/Open action
// button) over a body region rendered via `MarkdownRenderer.render`. The
// view is READ-ONLY — it never calls vault.create, never calls
// workspace.openLinkText, never dispatches CM6 transactions. Action buttons
// delegate to the existing `plugin.openProblem(slug, status)` v1.0 path,
// then schedule `setWindowTimeout(() => this.leaf.detach(), 100)` so the
// preview tab disappears once the note tab takes focus.
//
// Architecture references:
//   - 06-CONTEXT.md decision B (one preview tab; setViewState + revealLeaf;
//     post-Start setWindowTimeout(100ms) then leaf.detach())
//   - 06-CONTEXT.md decision C (header content: title + difficulty pill +
//     topic chips + Start/Open button; tab icon `eye`)
//   - 06-RESEARCH §A2 (LeetCodeClient.getProblemDetail does NOT auto-persist
//     into SettingsStore — the cache-miss path here MUST call
//     `setProblemDetail(slug, toDetailCacheEntry(fetched))` after fetch)
//   - 06-UI-SPEC §Layout / §Copywriting Contract / §Acceptance grep gates
//   - 06-PATTERNS.md §`src/preview/ProblemPreviewView.ts`
//
// MarkdownRenderer.render signature pin (06-RESEARCH §Pattern 3, also
// src/graph/SubmissionDetailModal.ts:124-143 analog):
//   MarkdownRenderer.render(this.app, markdown, body, '', this)
// `this` is the ItemView instance — `ItemView extends View extends Component`,
// so passing the view satisfies the obsidianmd/no-plugin-as-component rule.
// We pass `''` for sourcePath (no real file backs the preview).

import {
  ItemView,
  MarkdownRenderer,
  Notice,
  type ViewStateResult,
  type WorkspaceLeaf,
} from 'obsidian';
import type LeetCodePlugin from '../main';
import type { DetailCacheEntry } from '../notes/types';
import type { NoteWriterDetail } from '../notes/NoteWriter';
import { toDetailCacheEntry } from '../notes/NoteWriter';
import { htmlToMarkdown } from '../notes/htmlToMarkdown';
import {
  setWindowTimeout,
  clearWindowTimeout,
  type TimerHandle,
} from '../shared/timers';
import { logger } from '../shared/logger';
import { detectExistingNote } from './previewExistingNote';

/** Locked view-type string — must match the workspace `getLeavesOfType` /
 *  `setViewState` calls in `previewRouter.ts`. Persisted by Obsidian into
 *  the workspace JSON when the user has the preview tab open at unload, so
 *  changing it would orphan persisted leaves on existing installs. */
export const PREVIEW_VIEW_TYPE = 'leetcode-preview';

/** Locked copy from 06-UI-SPEC §Copywriting — surfaced as constants here so
 *  the regression-grep test (Task 3) can grep for them and so future copy
 *  edits land in exactly one place. */
const COPY = {
  loadingHeading: 'Loading problem…',
  loadingBodyTpl: (display: string): string =>
    `Fetching ${display} from LeetCode.`,
  fetchFailHeading: "Couldn't load problem",
  fetchFailBody: 'Check your internet connection and try again.',
  retryButton: 'Retry',
  startProblem: 'Start Problem',
  openProblem: 'Open Problem',
  starting: 'Starting…',
  opening: 'Opening…',
  fetchFailNoticeTpl: (display: string): string =>
    `Couldn't fetch ${display}. Check your connection.`,
  // 06-UI-SPEC § Notice messages — note-creation failure surface.
  createFailNoticeTpl: (reason: string): string =>
    `Couldn't create note. ${reason}.`,
} as const;

const NOTICE_DURATIONS = {
  fetchFail: 4000,
  createFail: 6000,
} as const;

/** Post-Start detach delay (CONTEXT.md decision B). 100ms gives the note tab
 *  time to render and take focus before the preview leaf goes away. */
const POST_ACTION_DETACH_MS = 100;

/** State shape persisted by Obsidian when the preview tab is open at unload.
 *  setState receives this back on plugin reload; we re-resolve from cache /
 *  re-fetch as needed. */
interface PreviewViewState {
  slug: string | null;
}

/**
 * Public for testing — Task 1's tests/preview/header-render.test.ts calls
 * this directly without standing up the full view. Renders the sticky header
 * (title + chip row with difficulty pill + topic chips + Start/Open action
 * button) into the supplied container. Returns the action button so callers
 * can wire its click handler.
 *
 * Contract:
 *   - container is emptied before render (idempotent re-render is the
 *     caller's responsibility — header-only).
 *   - Difficulty pill class is `lc-diff lc-diff--{difficulty.toLowerCase()}`
 *     so the existing UI-SPEC `color-mix` background rules apply.
 *   - Topic chips are plain `<span class="lc-preview__topic">` — non-
 *     interactive in v1.1 base ship (CONTEXT.md decision C).
 *   - Action button receives `lc-preview__action.is-primary` iff
 *     `noteExists === false` (Start Problem is the accent CTA; Open Problem
 *     is neutral). Locked by 06-UI-SPEC § Color "Accent reserved EXCLUSIVELY
 *     for Start Problem".
 *
 * The function does NOT wire the click handler — the caller (renderForSlug)
 * handles disable + label transition + openProblem await + post-action
 * detach. This keeps the header pure for testing.
 */
export function renderHeader(
  container: HTMLElement,
  detail: DetailCacheEntry,
  noteExists: boolean,
): HTMLButtonElement {
  container.empty();
  container.addClass('leetcode-preview__header');
  container.addClass('is-sticky');

  // Title row — `<h2 class="lc-preview__title">{id}. {title}</h2>`
  const titleText = `${String(detail.id)}. ${detail.title}`;
  container.createEl('h2', {
    cls: 'lc-preview__title',
    text: titleText,
  });

  // Chip row — pill, topic chips, action button.
  const chipRow = container.createDiv({ cls: 'lc-preview__chips' });

  const difficulty = detail.difficulty;
  const difficultyClass = `lc-diff lc-diff--${difficulty.toLowerCase()}`;
  chipRow.createSpan({
    cls: difficultyClass,
    text: difficulty,
  });

  for (const topic of detail.topicSlugs ?? []) {
    chipRow.createSpan({
      cls: 'lc-preview__topic',
      text: topicSlugToDisplay(topic),
    });
  }

  // Action button — Start Problem (accent) when no note exists, Open Problem
  // (neutral) otherwise. The class application and `is-primary` decision is
  // the ONE place 06-UI-SPEC §Acceptance allows the accent class to land.
  const actionLabel = noteExists ? COPY.openProblem : COPY.startProblem;
  const actionCls = noteExists
    ? 'lc-preview__action'
    : 'lc-preview__action is-primary';
  const button = chipRow.createEl('button', {
    cls: actionCls,
    text: actionLabel,
  });
  // Aria-label for screen readers — 06-UI-SPEC §Accessibility.
  const verb = noteExists ? 'Open' : 'Start';
  button.setAttribute(
    'aria-label',
    `${verb} problem ${String(detail.id)}: ${detail.title}`,
  );
  return button;
}

/** Convert a topic slug ('hash-table') into a display label ('Hash Table').
 *  Matches the convention used in v1.0's filter modal topic chips. Pure
 *  function. */
function topicSlugToDisplay(slug: string): string {
  return slug
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The Preview ItemView itself.
 *
 * Lifecycle (06-PATTERNS.md §`src/preview/ProblemPreviewView.ts`):
 *   onOpen      → initialize root container; if state already populated via
 *                 setState, render for that slug. Else show empty state.
 *   setState    → record the new slug, kick off renderForSlug.
 *   renderForSlug → cache hit → renderHeader + body via MarkdownRenderer;
 *                   cache miss → renderLoading → fetch via plugin.client →
 *                                  persist via toDetailCacheEntry +
 *                                  setProblemDetail → renderHeader + body.
 *                   On fetch reject → renderError with [Retry].
 *   onClose     → clear any pending detach timer + abort in-flight fetch
 *                 awareness flag.
 */
export class ProblemPreviewView extends ItemView {
  private slug: string | null = null;
  private detachHandle: TimerHandle | null = null;
  /** Bumped every time renderForSlug starts — discards the result of any
   *  in-flight fetch when the user previews a different slug or closes the
   *  view in between (avoids late-resolving fetches painting stale DOM). */
  private renderToken = 0;
  private rootEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LeetCodePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return PREVIEW_VIEW_TYPE;
  }

  getIcon(): string {
    // CONTEXT.md decision C — `eye` is the locked tab icon. `book-open` is
    // the documented fallback if Obsidian's Lucide set drops `eye` in a
    // future version, but `eye` is in the standard 1.12.x set per UI-SPEC.
    return 'eye';
  }

  getDisplayText(): string {
    if (this.slug == null) return 'Preview';
    const cached = this.plugin.settings.getProblemDetail(this.slug);
    if (cached) {
      return `Preview: ${String(cached.id)}. ${cached.title}`;
    }
    return `Preview: ${this.slug}`;
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('leetcode-preview');
    this.rootEl = root;
    if (this.slug != null) {
      await this.renderForSlug(this.slug);
    } else {
      // No state yet — defer first render to setState. Show a minimal
      // placeholder so the tab isn't blank if Obsidian opens us without
      // setState (e.g., split-from-context-menu).
      this.renderEmpty(root, 'Preview');
    }
  }

  async onClose(): Promise<void> {
    // Cancel any pending detach timer; clear the in-flight render token so
    // late-resolving fetches no-op when they arrive.
    if (this.detachHandle != null) {
      clearWindowTimeout(this.detachHandle);
      this.detachHandle = null;
    }
    this.renderToken += 1;
    this.rootEl = null;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const next = (state && typeof state === 'object'
      ? (state as Partial<PreviewViewState>)
      : {});
    const slug = typeof next.slug === 'string' && next.slug.length > 0
      ? next.slug
      : null;
    this.slug = slug;
    if (this.rootEl && slug != null) {
      await this.renderForSlug(slug);
    }
    // Trigger Obsidian to refresh the tab title from getDisplayText().
    // ViewStateResult.history is the only public hook; we call back via
    // the parent class's super to keep behavior aligned with other ItemViews.
    await super.setState(state, result);
  }

  getState(): { slug: string | null } {
    return { slug: this.slug };
  }

  /**
   * Cache-then-fetch render path (06-RESEARCH §A2 contract).
   *
   *   1. Try the cache via `settings.getProblemDetail(slug)`.
   *   2. Cache hit → render the header + body straight away.
   *   3. Cache miss → render loading state synchronously, then await
   *      `plugin.client.getProblemDetail(slug)`. On resolve with non-empty
   *      content: persist via `toDetailCacheEntry` + `setProblemDetail`
   *      (RESEARCH §A2 — LeetCodeClient does NOT auto-persist, so this view
   *      must do it itself or the next preview of the same slug re-fetches),
   *      then re-read the freshly-persisted entry and render.
   *      On reject: render the error state with [Retry].
   *
   *   `renderToken` is bumped on every entry; late-resolving fetches whose
   *   token doesn't match the current view state are discarded (the user
   *   navigated away or closed the tab).
   */
  private async renderForSlug(slug: string): Promise<void> {
    if (!this.rootEl) return;
    const root = this.rootEl;
    this.renderToken += 1;
    const myToken = this.renderToken;

    const cached = this.plugin.settings.getProblemDetail(slug);
    if (cached) {
      this.renderRendered(root, slug, cached);
      return;
    }

    // Cache miss → loading state + parallel fetch.
    this.renderLoading(root, slug);
    let fetched: NoteWriterDetail | null = null;
    try {
      fetched = await this.plugin.client.getProblemDetail(slug);
    } catch (err) {
      logger.debug('preview.renderForSlug: getProblemDetail rejected', err);
      if (myToken !== this.renderToken) return;
      this.renderError(root, slug);
      return;
    }
    if (myToken !== this.renderToken) return;
    if (!fetched || !fetched.content) {
      // Treat null / empty content as a fetch failure for UX purposes —
      // user sees the locked "Couldn't load problem" copy + Retry button.
      this.renderError(root, slug);
      return;
    }
    // RESEARCH §A2 — persist through SettingsStore so the next preview hits
    // the cache instead of re-fetching. setProblemDetail mutates in place
    // and persists; the `getProblemDetail(slug)` re-read below picks up the
    // fresh entry.
    try {
      const entry = toDetailCacheEntry(fetched);
      await this.plugin.settings.setProblemDetail(slug, entry);
    } catch (err) {
      // Persistence failure shouldn't block render — log and fall through
      // to render with the in-flight detail. The next preview of the same
      // slug will re-fetch (no harm beyond a second network hop).
      logger.debug('preview.renderForSlug: setProblemDetail rejected', err);
    }
    if (myToken !== this.renderToken) return;
    const persisted = this.plugin.settings.getProblemDetail(slug)
      ?? toDetailCacheEntry(fetched);
    this.renderRendered(root, slug, persisted);
  }

  /**
   * Render the loading state into `root`. Reuses the `.lc-empty` class shape
   * from ProblemBrowserView.renderEmptyState (06-UI-SPEC §Layout — empty/
   * loading/error states reuse the existing token).
   */
  private renderLoading(root: HTMLElement, slug: string): void {
    root.empty();
    const cached = this.plugin.settings.getProblemDetail(slug);
    const display = cached
      ? `${String(cached.id)}. ${cached.title}`
      : slug;
    const wrap = root.createDiv({ cls: 'lc-empty' });
    wrap.createEl('h3', { text: COPY.loadingHeading });
    wrap.createEl('p', {
      cls: 'lc-empty__body',
      text: COPY.loadingBodyTpl(display),
    });
  }

  /**
   * Render the fetch-failure state into `root`. Surfaces a locked Notice for
   * actionability and a `[Retry]` button that re-enters renderForSlug.
   */
  private renderError(root: HTMLElement, slug: string): void {
    root.empty();
    const cached = this.plugin.settings.getProblemDetail(slug);
    const display = cached
      ? `${String(cached.id)}. ${cached.title}`
      : slug;
    const wrap = root.createDiv({ cls: 'lc-empty' });
    wrap.createEl('h3', { text: COPY.fetchFailHeading });
    wrap.createEl('p', {
      cls: 'lc-empty__body',
      text: COPY.fetchFailBody,
    });
    const btn = wrap.createEl('button', {
      text: COPY.retryButton,
      cls: 'lc-empty__btn',
    });
    btn.addEventListener('click', () => {
      void this.renderForSlug(slug);
    });
    new Notice(COPY.fetchFailNoticeTpl(display), NOTICE_DURATIONS.fetchFail);
  }

  /** Helper for the no-state-yet placeholder (rare). */
  private renderEmpty(root: HTMLElement, heading: string): void {
    root.empty();
    const wrap = root.createDiv({ cls: 'lc-empty' });
    wrap.createEl('h3', { text: heading });
  }

  /**
   * Render the cache-hit / post-fetch happy path: sticky header + body via
   * MarkdownRenderer. Wires the action button click handler to delegate to
   * `plugin.openProblem(slug, status)` then schedule the post-action detach.
   */
  private renderRendered(
    root: HTMLElement,
    slug: string,
    detail: DetailCacheEntry,
  ): void {
    root.empty();

    // Existing-note state drives the action button: Start (accent) vs Open
    // (neutral). detectExistingNote is the pure helper from
    // src/preview/previewExistingNote.ts.
    const noteState = detectExistingNote(this.app, this.plugin.settings, slug);
    const noteExists = noteState.fileExists;

    // Header — render via the exported helper so tests can drive it
    // independently. Returns the action button so we can wire its click.
    const headerEl = root.createDiv();
    const actionBtn = renderHeader(headerEl, detail, noteExists);

    // Body — MarkdownRenderer.render(this.app, md, body, '', this).
    // RESEARCH §Pattern 3 — `this` is the ItemView, satisfying
    // obsidianmd/no-plugin-as-component (the rule rejects passing the
    // plugin as Component; ItemView extends Component so passing the view
    // is the canonical pattern).
    const body = root.createDiv({ cls: 'leetcode-preview__body' });
    const md = htmlToMarkdown(detail.contentHtml);
    void MarkdownRenderer.render(this.app, md, body, '', this);

    // Action button click — delegate to plugin.openProblem then schedule
    // post-action detach. CONTEXT.md decision B locks the 100ms window.
    actionBtn.addEventListener('click', () => {
      this.handleActionClick(actionBtn, slug, noteExists, detail);
    });
  }

  /**
   * Action button handler — disabled during the in-flight openProblem await
   * to prevent double-fire; restored on failure so the user can retry.
   * Schedules `setWindowTimeout(() => this.leaf.detach(), 100)` on success.
   */
  private handleActionClick(
    button: HTMLButtonElement,
    slug: string,
    noteExists: boolean,
    detail: DetailCacheEntry,
  ): void {
    void (async () => {
      const originalLabel = button.textContent ?? '';
      button.disabled = true;
      button.textContent = noteExists ? COPY.opening : COPY.starting;
      try {
        // Status hint: detail entries don't carry submission status (the
        // browser row does — but the preview state only persists slug).
        // Pass `undefined` so NoteWriter falls back to its 'untouched'
        // default; D-04 non-downgrade in applyFrontmatter ensures an
        // existing 'accepted' is never clobbered.
        await this.plugin.openProblem(slug, undefined);
      } catch (err) {
        button.disabled = false;
        button.textContent = originalLabel;
        const reason = err instanceof Error ? err.message : 'Unknown error';
        new Notice(
          COPY.createFailNoticeTpl(reason),
          NOTICE_DURATIONS.createFail,
        );
        return;
      }
      // Cancel any prior detach timer (defense — only fires if the user
      // double-clicks across the await boundary). Then schedule the new one.
      if (this.detachHandle != null) {
        clearWindowTimeout(this.detachHandle);
        this.detachHandle = null;
      }
      this.detachHandle = setWindowTimeout(() => {
        try {
          this.leaf.detach();
        } catch (err) {
          logger.debug('preview.handleActionClick: leaf.detach threw', err);
        }
        this.detachHandle = null;
      }, POST_ACTION_DETACH_MS);
      // `detail` reference retained for symmetry with future telemetry; not
      // used in the click path beyond what `detectExistingNote` already saw.
      void detail;
    })();
  }
}
