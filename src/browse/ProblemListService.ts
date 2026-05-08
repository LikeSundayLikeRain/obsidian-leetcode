// src/browse/ProblemListService.ts
// Pure-logic service — no DOM. Consumed by ProblemBrowserView (Plan 06).
//
// Responsibilities (Plan 05):
//   - refresh()  : BROWSE-02 — page LC.problems({ limit, offset }) with PAGE_SIZE=50
//                   until a short page, populate IndexedProblem.status from q.status,
//                   persist via SettingsStore, honor 24h TTL.
//   - search()   : BROWSE-03 — in-memory case-insensitive title substring OR id-prefix.
//   - filter()   : BROWSE-04 — in-memory multi-select on difficulty AND status.
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore } from '../settings/SettingsStore';
import type { IndexedProblem, ProblemIndex } from './types';

export const INDEX_TTL_MS = 24 * 60 * 60 * 1000; // D-07: 24h TTL
export const PAGE_SIZE = 50; // D-07: page size (anti-bulk gate)

// LC's problemsetQuestionList result shape (verified in 01-RESEARCH.md).
interface LcQuestion {
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  // User progress on this problem. 'ac' = solved, 'notac' = attempted, null = untouched.
  status?: 'ac' | 'notac' | null;
}

/** Map LC's `q.status` into the `IndexedProblem.status` vocabulary (BROWSE-04 status dim). */
function mapStatus(s: LcQuestion['status']): NonNullable<IndexedProblem['status']> {
  if (s === 'ac') return 'solved';
  if (s === 'notac') return 'attempted';
  // null, undefined, or any unrecognized future LC value → neutral 'untouched' (T-05-06).
  return 'untouched';
}

export class ProblemListService {
  constructor(
    private readonly client: LeetCodeClient,
    private readonly settings: SettingsStore,
  ) {}

  /**
   * Return cached index if fresh (<24h); otherwise page LC.problems() until a short page,
   * populate each row's `status` from q.status, persist to data.json, and return.
   *
   * BROWSE-02: never bulk-downloads — always paginated with `limit: PAGE_SIZE (50)`.
   * @param force When true, bypass the TTL check and always re-fetch.
   */
  async refresh(force = false): Promise<IndexedProblem[]> {
    const cached = this.settings.getProblemIndex();
    if (!force && cached && Date.now() - cached.fetchedAt < INDEX_TTL_MS) {
      return cached.problems;
    }
    const all: IndexedProblem[] = [];
    let offset = 0;
    // Paginate with limit=50 (D-07). LC lib param is `offset` (not `skip`).
    // Loop terminates on a short page (page.questions.length < PAGE_SIZE) — T-05-01.
    for (;;) {
      const page = (await this.client.lc.problems({
        limit: PAGE_SIZE,
        offset,
      } as unknown as Parameters<typeof this.client.lc.problems>[0])) as unknown as {
        questions: LcQuestion[];
      };
      for (const q of page.questions) {
        all.push({
          id: Number(q.questionFrontendId),
          slug: q.titleSlug,
          title: q.title,
          diff: q.difficulty,
          paid: q.isPaidOnly,
          status: mapStatus(q.status ?? null),
        });
      }
      if (page.questions.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    const index: ProblemIndex = { fetchedAt: Date.now(), problems: all };
    await this.settings.setProblemIndex(index);
    return all;
  }

  /**
   * BROWSE-03: case-insensitive title substring OR id-prefix match.
   * Empty / whitespace-only term → returns input unchanged (the view renders all rows).
   */
  search(idx: IndexedProblem[], term: string): IndexedProblem[] {
    const q = term.trim().toLowerCase();
    if (!q) return idx;
    return idx.filter((p) =>
      p.title.toLowerCase().includes(q) || String(p.id).startsWith(q),
    );
  }

  /**
   * BROWSE-04: difficulty + status multi-select.
   * Both dimensions are optional; an empty array or missing field means "no constraint".
   * Across dimensions we AND (row must satisfy every populated dimension).
   * Within a dimension we OR (row matches if its value is in the list).
   *
   * Status mapping: rows whose `status` field is `undefined` are treated as `'untouched'`
   * so legacy index entries (pre-status-population) filter consistently with newly-refreshed ones.
   */
  filter(
    idx: IndexedProblem[],
    opts: { difficulty?: string[]; status?: string[] },
  ): IndexedProblem[] {
    const diffs = opts.difficulty;
    const statuses = opts.status;
    const hasDiff = !!diffs && diffs.length > 0;
    const hasStatus = !!statuses && statuses.length > 0;
    if (!hasDiff && !hasStatus) return idx;
    return idx.filter((p) => {
      if (hasDiff && !diffs.includes(p.diff)) return false;
      if (hasStatus) {
        const effective: NonNullable<IndexedProblem['status']> = p.status ?? 'untouched';
        if (!statuses.includes(effective)) return false;
      }
      return true;
    });
  }
}
