import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProblemListService, PAGE_SIZE, INDEX_TTL_MS } from '../src/browse/ProblemListService';
import type { ProblemIndex } from '../src/browse/types';

function makeMockQuestion(
  n: number,
  diff: 'Easy' | 'Medium' | 'Hard' = 'Easy',
  status: 'ac' | 'notac' | null = null,
) {
  return {
    questionFrontendId: String(n),
    titleSlug: `problem-${n}`,
    title: `Problem ${n}`,
    difficulty: diff,
    isPaidOnly: false,
    status,
  };
}

function makeMockClient(pages: number[]) {
  const problems = vi.fn(async ({ offset }: { limit: number; offset: number }) => {
    const pageIdx = offset / PAGE_SIZE;
    const count = pages[pageIdx] ?? 0;
    const start = offset + 1;
    // Rotate statuses to assert mapping logic covers all three buckets.
    const rot: Array<'ac' | 'notac' | null> = ['ac', 'notac', null];
    return {
      questions: Array.from({ length: count }, (_, i) =>
        makeMockQuestion(start + i, 'Easy', rot[(start + i) % 3])),
    };
  });
  return { lc: { problems } };
}

function makeMockSettings(initial: ProblemIndex | null = null) {
  let index: ProblemIndex | null = initial;
  return {
    getProblemIndex: vi.fn(() => index),
    setProblemIndex: vi.fn(async (i: ProblemIndex) => { index = i; }),
  };
}

describe('ProblemListService.refresh (BROWSE-02)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('paginates 50/50/7 → 107 items total, stops after short page', async () => {
    const client = makeMockClient([50, 50, 7]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(true);

    expect(result).toHaveLength(107);
    expect(client.lc.problems).toHaveBeenCalledTimes(3);
    expect(client.lc.problems).toHaveBeenNthCalledWith(1, { limit: PAGE_SIZE, offset: 0 });
    expect(client.lc.problems).toHaveBeenNthCalledWith(2, { limit: PAGE_SIZE, offset: 50 });
    expect(client.lc.problems).toHaveBeenNthCalledWith(3, { limit: PAGE_SIZE, offset: 100 });
  });

  it('persists the fetched index via SettingsStore, with status populated on every row', async () => {
    const client = makeMockClient([50, 7]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    await svc.refresh(true);

    expect(settings.setProblemIndex).toHaveBeenCalledTimes(1);
    const firstCall = settings.setProblemIndex.mock.calls[0];
    if (!firstCall) throw new Error('setProblemIndex was not called');
    const call = firstCall[0];
    expect(call.problems).toHaveLength(57);
    expect(call.fetchedAt).toBeGreaterThan(0);
    // Every row must have a defined status in the canonical vocabulary.
    for (const p of call.problems) {
      expect(['solved', 'attempted', 'untouched']).toContain(p.status);
    }
    // At least one of each bucket should be present given our rotating mock.
    const uniq = new Set(call.problems.map((p) => p.status));
    expect(uniq.has('solved')).toBe(true);
    expect(uniq.has('attempted')).toBe(true);
    expect(uniq.has('untouched')).toBe(true);
  });

  it('returns cached index when fresh (<24h) without calling network', async () => {
    const fresh: ProblemIndex = {
      fetchedAt: Date.now() - 1000,
      problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false }],
    };
    const client = makeMockClient([50]);
    const settings = makeMockSettings(fresh);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(result).toEqual(fresh.problems);
    expect(client.lc.problems).toHaveBeenCalledTimes(0);
  });

  it('re-fetches when cache is stale (>24h)', async () => {
    const stale: ProblemIndex = {
      fetchedAt: Date.now() - INDEX_TTL_MS - 1000,
      problems: [{ id: 999, slug: 'stale', title: 'Stale', diff: 'Easy', paid: false }],
    };
    const client = makeMockClient([10]);
    const settings = makeMockSettings(stale);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(client.lc.problems).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(10);
  });

  it('fetches on first run when no cache exists (non-force)', async () => {
    const client = makeMockClient([3]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(client.lc.problems).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });
});
