// tests/contest/ContestListService.test.ts
// Phase 10 Plan 01 Task 2 — unit tests for ContestListService.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContestListService, CONTEST_INDEX_TTL_MS, inferContestType } from '../../src/contest/ContestListService';
import type { CachedContest, ContestIndex } from '../../src/contest/types';

// --- Mocks ---

function makeMockClient(opts?: {
  getPastContestsResults?: Array<{ totalNum: number; contests: Array<{ titleSlug: string; title: string; startTime: number; duration: number; totalQuestions: number }> }>;
  getContestQuestionsResult?: { questions: Array<{ credit: number; title: string; title_slug: string; category_slug: string; difficulty: number }> };
  getContestQuestionsError?: boolean;
}) {
  let callIdx = 0;
  const defaultPage = {
    totalNum: 2,
    contests: [
      { titleSlug: 'weekly-contest-380', title: 'Weekly Contest 380', startTime: 1700000000, duration: 5400, totalQuestions: 4 },
      { titleSlug: 'biweekly-contest-121', title: 'Biweekly Contest 121', startTime: 1699000000, duration: 5400, totalQuestions: 4 },
    ],
  };

  return {
    getPastContests: vi.fn(async () => {
      if (opts?.getPastContestsResults) {
        return opts.getPastContestsResults[callIdx++] ?? opts.getPastContestsResults[opts.getPastContestsResults.length - 1];
      }
      return defaultPage;
    }),
    getContestQuestions: vi.fn(async () => {
      if (opts?.getContestQuestionsError) throw new Error('Network error');
      return opts?.getContestQuestionsResult ?? {
        questions: [
          { credit: 3, title: 'Problem A', title_slug: 'problem-a', category_slug: 'algorithms', difficulty: 1 },
          { credit: 4, title: 'Problem B', title_slug: 'problem-b', category_slug: 'algorithms', difficulty: 2 },
          { credit: 5, title: 'Problem C', title_slug: 'problem-c', category_slug: 'algorithms', difficulty: 2 },
          { credit: 6, title: 'Problem D', title_slug: 'problem-d', category_slug: 'algorithms', difficulty: 3 },
        ],
      };
    }),
  } as unknown as import('../../src/api/LeetCodeClient').LeetCodeClient;
}

function makeMockSettings(cached?: ContestIndex | null) {
  let contestIndex: ContestIndex | null = cached ?? null;
  return {
    getContestIndex: vi.fn(() => contestIndex),
    setContestIndex: vi.fn(async (idx: ContestIndex | null) => { contestIndex = idx; }),
  } as unknown as import('../../src/settings/SettingsStore').SettingsStore;
}

// --- Tests ---

describe('inferContestType', () => {
  it('classifies weekly-contest-380 as weekly', () => {
    expect(inferContestType('weekly-contest-380')).toBe('weekly');
  });

  it('classifies biweekly-contest-121 as biweekly', () => {
    expect(inferContestType('biweekly-contest-121')).toBe('biweekly');
  });

  it('classifies unknown prefix as weekly (fallback)', () => {
    expect(inferContestType('special-contest-1')).toBe('weekly');
  });
});

describe('ContestListService', () => {
  let client: ReturnType<typeof makeMockClient>;
  let settings: ReturnType<typeof makeMockSettings>;
  let service: ContestListService;

  beforeEach(() => {
    client = makeMockClient();
    settings = makeMockSettings();
    service = new ContestListService(client, settings);
  });

  describe('refresh()', () => {
    it('fetches from API when no cache exists', async () => {
      const result = await service.refresh();
      expect(client.getPastContests).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0]!.slug).toBe('weekly-contest-380');
      expect(result[0]!.type).toBe('weekly');
      expect(result[1]!.slug).toBe('biweekly-contest-121');
      expect(result[1]!.type).toBe('biweekly');
      expect(settings.setContestIndex).toHaveBeenCalled();
    });

    it('returns cache when within TTL', async () => {
      const cached: ContestIndex = {
        fetchedAt: Date.now() - 1000, // 1 second ago — well within TTL
        contests: [{ slug: 'weekly-contest-1', title: 'Weekly 1', startTime: 100, duration: 5400, type: 'weekly' }],
      };
      const settingsWithCache = makeMockSettings(cached);
      const svc = new ContestListService(client, settingsWithCache);

      const result = await svc.refresh();
      expect(client.getPastContests).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]!.slug).toBe('weekly-contest-1');
    });

    it('refetches when cache is stale (beyond TTL)', async () => {
      const cached: ContestIndex = {
        fetchedAt: Date.now() - CONTEST_INDEX_TTL_MS - 1000, // beyond TTL
        contests: [{ slug: 'weekly-contest-1', title: 'Weekly 1', startTime: 100, duration: 5400, type: 'weekly' }],
      };
      const settingsWithCache = makeMockSettings(cached);
      const svc = new ContestListService(client, settingsWithCache);

      const result = await svc.refresh();
      expect(client.getPastContests).toHaveBeenCalled();
      expect(result).toHaveLength(2); // fresh data from API
    });

    it('refresh(force=true) always fetches regardless of TTL', async () => {
      const cached: ContestIndex = {
        fetchedAt: Date.now() - 1000, // fresh cache
        contests: [{ slug: 'weekly-contest-1', title: 'Weekly 1', startTime: 100, duration: 5400, type: 'weekly' }],
      };
      const settingsWithCache = makeMockSettings(cached);
      const svc = new ContestListService(client, settingsWithCache);

      const result = await svc.refresh(true);
      expect(client.getPastContests).toHaveBeenCalled();
      expect(result).toHaveLength(2); // fresh from API
    });

    it('single-flight guard deduplicates concurrent refresh calls', async () => {
      // Call refresh twice concurrently — should share the same promise.
      const p1 = service.refresh();
      const p2 = service.refresh();
      const [r1, r2] = await Promise.all([p1, p2]);
      // Only one API call should have been made.
      expect(client.getPastContests).toHaveBeenCalledTimes(1);
      expect(r1).toBe(r2); // same reference
    });

    it('paginates when totalNum exceeds page size', async () => {
      // Build 150 contests across 2 pages (100 + 50).
      const page1Contests = Array.from({ length: 100 }, (_, i) => ({
        titleSlug: `weekly-contest-${i + 1}`,
        title: `Weekly Contest ${i + 1}`,
        startTime: 1700000000 - i * 1000,
        duration: 5400,
        totalQuestions: 4,
      }));
      const page2Contests = Array.from({ length: 50 }, (_, i) => ({
        titleSlug: `weekly-contest-${i + 101}`,
        title: `Weekly Contest ${i + 101}`,
        startTime: 1700000000 - (i + 100) * 1000,
        duration: 5400,
        totalQuestions: 4,
      }));

      const paginatedClient = makeMockClient({
        getPastContestsResults: [
          { totalNum: 150, contests: page1Contests },
          { totalNum: 150, contests: page2Contests },
        ],
      });
      const svc = new ContestListService(paginatedClient, settings);
      const result = await svc.refresh();
      expect(paginatedClient.getPastContests).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(150);
    });
  });

  describe('search()', () => {
    const contests: CachedContest[] = [
      { slug: 'weekly-contest-380', title: 'Weekly Contest 380', startTime: 1700000000, duration: 5400, type: 'weekly' },
      { slug: 'biweekly-contest-121', title: 'Biweekly Contest 121', startTime: 1699000000, duration: 5400, type: 'biweekly' },
      { slug: 'weekly-contest-379', title: 'Weekly Contest 379', startTime: 1699500000, duration: 5400, type: 'weekly' },
    ];

    it('returns all contests for empty term', () => {
      expect(service.search(contests, '')).toEqual(contests);
      expect(service.search(contests, '   ')).toEqual(contests);
    });

    it('filters by case-insensitive substring', () => {
      const result = service.search(contests, 'biweekly');
      expect(result).toHaveLength(1);
      expect(result[0]!.slug).toBe('biweekly-contest-121');
    });

    it('filters by partial number', () => {
      const result = service.search(contests, '380');
      expect(result).toHaveLength(1);
      expect(result[0]!.slug).toBe('weekly-contest-380');
    });

    it('returns empty array for no match', () => {
      expect(service.search(contests, 'nonexistent')).toEqual([]);
    });
  });

  describe('surpriseMe()', () => {
    it('returns a random contest that has 4 valid questions', async () => {
      const result = await service.surpriseMe();
      expect(result).not.toBeNull();
      expect(result!.slug).toMatch(/^(weekly|biweekly)-contest-/);
      expect(client.getContestQuestions).toHaveBeenCalled();
    });

    it('retries on getContestQuestions failure (max 3)', async () => {
      // Need at least 3 contests so maxAttempts = 3.
      const threeContestsClient = makeMockClient({
        getPastContestsResults: [{
          totalNum: 3,
          contests: [
            { titleSlug: 'weekly-contest-380', title: 'Weekly Contest 380', startTime: 1700000000, duration: 5400, totalQuestions: 4 },
            { titleSlug: 'weekly-contest-379', title: 'Weekly Contest 379', startTime: 1699500000, duration: 5400, totalQuestions: 4 },
            { titleSlug: 'weekly-contest-378', title: 'Weekly Contest 378', startTime: 1699000000, duration: 5400, totalQuestions: 4 },
          ],
        }],
      });
      // First 2 calls fail, third succeeds.
      let callCount = 0;
      (threeContestsClient.getContestQuestions as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) throw new Error('Network error');
        return {
          questions: [
            { credit: 3, title: 'A', title_slug: 'a', category_slug: 'alg', difficulty: 1 },
            { credit: 4, title: 'B', title_slug: 'b', category_slug: 'alg', difficulty: 2 },
            { credit: 5, title: 'C', title_slug: 'c', category_slug: 'alg', difficulty: 2 },
            { credit: 6, title: 'D', title_slug: 'd', category_slug: 'alg', difficulty: 3 },
          ],
        };
      });
      const svc = new ContestListService(threeContestsClient, settings);
      const result = await svc.surpriseMe();
      expect(result).not.toBeNull();
      expect(callCount).toBe(3);
    });

    it('returns null after 3 failures (max retries exhausted)', async () => {
      // Need at least 3 contests so maxAttempts = 3.
      const threeContestsFailClient = makeMockClient({
        getPastContestsResults: [{
          totalNum: 3,
          contests: [
            { titleSlug: 'weekly-contest-380', title: 'Weekly Contest 380', startTime: 1700000000, duration: 5400, totalQuestions: 4 },
            { titleSlug: 'weekly-contest-379', title: 'Weekly Contest 379', startTime: 1699500000, duration: 5400, totalQuestions: 4 },
            { titleSlug: 'weekly-contest-378', title: 'Weekly Contest 378', startTime: 1699000000, duration: 5400, totalQuestions: 4 },
          ],
        }],
        getContestQuestionsError: true,
      });
      const svc = new ContestListService(threeContestsFailClient, settings);
      const result = await svc.surpriseMe();
      expect(result).toBeNull();
      expect(threeContestsFailClient.getContestQuestions).toHaveBeenCalledTimes(3);
    });

    it('returns null when cache is empty', async () => {
      // Client returns no contests.
      const emptyClient = makeMockClient({
        getPastContestsResults: [{ totalNum: 0, contests: [] }],
      });
      const svc = new ContestListService(emptyClient, settings);
      const result = await svc.surpriseMe();
      expect(result).toBeNull();
    });

    it('skips contests with fewer than 4 questions', async () => {
      // First call returns only 2 questions, second returns 4.
      let callCount = 0;
      const mixedClient = makeMockClient();
      (mixedClient.getContestQuestions as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { questions: [
            { credit: 3, title: 'A', title_slug: 'a', category_slug: 'alg', difficulty: 1 },
            { credit: 4, title: 'B', title_slug: 'b', category_slug: 'alg', difficulty: 2 },
          ] };
        }
        return { questions: [
          { credit: 3, title: 'A', title_slug: 'a', category_slug: 'alg', difficulty: 1 },
          { credit: 4, title: 'B', title_slug: 'b', category_slug: 'alg', difficulty: 2 },
          { credit: 5, title: 'C', title_slug: 'c', category_slug: 'alg', difficulty: 2 },
          { credit: 6, title: 'D', title_slug: 'd', category_slug: 'alg', difficulty: 3 },
        ] };
      });
      const svc = new ContestListService(mixedClient, settings);
      const result = await svc.surpriseMe();
      expect(result).not.toBeNull();
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
