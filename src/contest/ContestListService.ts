// src/contest/ContestListService.ts
// Pure-logic service — no DOM. Consumed by ProblemBrowserView (contest mode).
//
// Responsibilities (Phase 10 Plan 01 Task 2):
//   - refresh()    : CONTEST-01 — fetch LC past contests with pagination,
//                    cache in PluginData, honor 24h TTL.
//   - search()     : CONTEST-01 — in-memory case-insensitive title substring.
//   - surpriseMe() : CONTEST-02 — pick random, validate via getContestQuestions,
//                    retry up to 3 times on failure.
//
// Mirrors src/browse/ProblemListService.ts (TTL, single-flight, search patterns).
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore } from '../settings/SettingsStore';
import type { CachedContest, ContestIndex } from './types';

export const CONTEST_INDEX_TTL_MS = 24 * 60 * 60 * 1000; // 24h TTL (same as problemIndex)

/** Derive contest type from the titleSlug prefix. LC contest slugs are always
 *  'weekly-contest-NNN' or 'biweekly-contest-NNN'. */
export function inferContestType(titleSlug: string): 'weekly' | 'biweekly' {
  if (titleSlug.startsWith('biweekly-contest-')) return 'biweekly';
  return 'weekly';
}

export class ContestListService {
  // WR-03 pattern: single-flight guard prevents duplicate concurrent fetches.
  private refreshPromise: Promise<CachedContest[]> | null = null;

  constructor(
    private readonly client: LeetCodeClient,
    private readonly settings: SettingsStore,
  ) {}

  /**
   * Return cached contest index if fresh (<24h); otherwise page
   * LeetCodeAdvanced.getPastContests() until all contests fetched,
   * persist to data.json, and return.
   *
   * CONTEST-01: paginated fetch with limit=100.
   * WR-03: concurrent calls share the same in-flight promise.
   * @param force When true, bypass the TTL check and always re-fetch.
   */
  async refresh(force = false): Promise<CachedContest[]> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this._doRefresh(force).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async _doRefresh(force: boolean): Promise<CachedContest[]> {
    const cached = this.settings.getContestIndex();
    if (!force && cached && Date.now() - cached.fetchedAt < CONTEST_INDEX_TTL_MS) {
      return cached.contests;
    }

    const PAGE_SIZE = 100;
    const all: CachedContest[] = [];
    let skip = 0;
    let totalNum = Infinity;

    while (skip < totalNum) {
      const resp = await this.client.getPastContests({ limit: PAGE_SIZE, skip });
      totalNum = resp.totalNum;
      for (const c of resp.contests) {
        all.push({
          slug: c.titleSlug,
          title: c.title,
          startTime: c.startTime,
          duration: c.duration,
          type: inferContestType(c.titleSlug),
        });
      }
      skip += PAGE_SIZE;
      // Short page means no more data (defensive against totalNum drift).
      if (resp.contests.length < PAGE_SIZE) break;
    }

    const index: ContestIndex = { fetchedAt: Date.now(), contests: all };
    await this.settings.setContestIndex(index);
    return all;
  }

  /**
   * CONTEST-01: case-insensitive title substring match.
   * Empty / whitespace-only term returns input unchanged.
   */
  search(contests: CachedContest[], term: string): CachedContest[] {
    const q = term.trim().toLowerCase();
    if (!q) return contests;
    return contests.filter((c) => c.title.toLowerCase().includes(q));
  }

  /**
   * CONTEST-02: pick a random contest, validate it has 4 fetchable questions.
   * Retries up to 3 times on getContestQuestions failure (per RESEARCH Pitfall 5).
   * Returns null if all retries exhausted or cache is empty.
   */
  async surpriseMe(): Promise<CachedContest | null> {
    const contests = await this.refresh();
    if (contests.length === 0) return null;

    const maxAttempts = Math.min(3, contests.length);
    const tried = new Set<number>();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Pick a random index not yet tried (avoid re-picking the same contest).
      let idx: number;
      do {
        idx = Math.floor(Math.random() * contests.length);
      } while (tried.has(idx));
      tried.add(idx);

      const contest = contests[idx];
      try {
        const questions = await this.client.getContestQuestions(contest.slug);
        if (questions.questions.length >= 4) {
          return contest;
        }
        // Less than 4 questions — skip this contest, try another.
      } catch {
        // getContestQuestions failed (404, network, etc.) — skip and retry.
      }
    }

    return null;
  }
}
