// src/browse/QuickProblemSearchModal.ts
//
// JetBrains-style quick search for LeetCode problems. Backed by the in-memory
// `IndexedProblem[]` already cached by ProblemListService — no network call on
// the hot path. Two surfaces feed into this modal:
//   1. Command palette entry `Quick search problems` (user-rebindable hotkey).
//   2. Document-level double-shift detector in main.ts (`createShiftShiftDetector`).
//
// Filtering logic is factored into a pure `filterProblems` helper so it can be
// unit-tested without instantiating a SuggestModal under happy-dom.
import { App, SuggestModal } from 'obsidian';
import type { IndexedProblem } from './types';

export const QUICK_SEARCH_LIMIT = 50;

/**
 * Rank problems against `query`. Empty/whitespace query returns the first
 * `limit` rows in their natural order (matches LC's "newest first" feel from
 * the browser view). Numeric queries prioritize exact-id then id-prefix
 * matches; otherwise we case-insensitive substring-match against
 * `${id}. ${title} ${slug}` and cap at `limit`.
 */
export function filterProblems(
  problems: readonly IndexedProblem[],
  query: string,
  limit: number = QUICK_SEARCH_LIMIT,
): IndexedProblem[] {
  const q = query.trim();
  if (q.length === 0) return problems.slice(0, limit);

  const lowered = q.toLowerCase();
  const numeric = /^\d+$/.test(q) ? Number(q) : null;

  if (numeric !== null) {
    const exact: IndexedProblem[] = [];
    const prefix: IndexedProblem[] = [];
    const rest: IndexedProblem[] = [];
    for (const p of problems) {
      if (p.id === numeric) exact.push(p);
      else if (String(p.id).startsWith(q)) prefix.push(p);
      else if (
        p.title.toLowerCase().includes(lowered) ||
        p.slug.toLowerCase().includes(lowered)
      ) {
        rest.push(p);
      }
    }
    return [...exact, ...prefix, ...rest].slice(0, limit);
  }

  const out: IndexedProblem[] = [];
  for (const p of problems) {
    if (
      p.title.toLowerCase().includes(lowered) ||
      p.slug.toLowerCase().includes(lowered)
    ) {
      out.push(p);
      if (out.length === limit) break;
    }
  }
  return out;
}

export class QuickProblemSearchModal extends SuggestModal<IndexedProblem> {
  constructor(
    app: App,
    private readonly problems: readonly IndexedProblem[],
    private readonly onChoose: (p: IndexedProblem) => void,
  ) {
    super(app);
    this.setPlaceholder('Search by ID, title, or slug…');
    this.emptyStateText =
      problems.length === 0
        ? 'Open the LeetCode problem browser at least once to populate the index.'
        : 'No matching problems.';
    this.limit = QUICK_SEARCH_LIMIT;
  }

  getSuggestions(query: string): IndexedProblem[] {
    return filterProblems(this.problems, query, QUICK_SEARCH_LIMIT);
  }

  renderSuggestion(p: IndexedProblem, el: HTMLElement): void {
    el.addClass('lc-quick-search__item');
    const title = el.createDiv({ cls: 'lc-quick-search__title' });
    title.createSpan({ cls: 'lc-quick-search__id', text: `${p.id}. ` });
    title.createSpan({ cls: 'lc-quick-search__name', text: p.title });
    const meta = el.createDiv({ cls: 'lc-quick-search__meta' });
    meta.createSpan({
      cls: `lc-quick-search__diff lc-diff--${p.diff.toLowerCase()}`,
      text: p.diff,
    });
    meta.createSpan({ cls: 'lc-quick-search__sep', text: ' · ' });
    meta.createSpan({ cls: 'lc-quick-search__slug', text: p.slug });
  }

  onChooseSuggestion(p: IndexedProblem): void {
    this.onChoose(p);
  }
}
