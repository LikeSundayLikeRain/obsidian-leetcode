// tests/graph/SubmissionHistoryStore.test.ts
//
// Phase 4 Plan 05 Task 2 — SubmissionHistoryStore contract tests.
//
// Locks:
//   - D-02: prefetch fires the fetchHistory dep; repeat within TTL reuses cache.
//   - D-07: no persistence — store is in-memory only (exercised by construction
//     + no data.json read in unit tests).
//   - CF-09: per-slug in-flight dedupe — two concurrent callers share one network hop.
//   - invalidate(slug) drops the cached entry so the next call refetches.
//   - TTL expiry triggers refetch.

import { describe, it, expect, vi } from 'vitest';
import { SubmissionHistoryStore } from '../../src/graph/SubmissionHistoryStore';
import type { SubmissionRow } from '../../src/graph/submissionHistoryClient';

function makeRow(id: string): SubmissionRow {
  return {
    id,
    title: 'Two Sum',
    titleSlug: 'two-sum',
    status: 10,
    statusDisplay: 'Accepted',
    lang: 'python3',
    langName: 'Python3',
    runtime: '12 ms',
    timestamp: 1746800000,
    url: `/submissions/detail/${id}/`,
    memory: '14.2 MB',
    hasNotes: false,
    notes: '',
    flagType: 'WHITE',
    frontendId: 1,
    topicTags: [],
  };
}

describe('SubmissionHistoryStore', () => {
  it('prefetch populates cache and avoids a second network hop within TTL', async () => {
    const rows = [makeRow('1')];
    const fetchHistory = vi.fn(async () => rows);
    const store = new SubmissionHistoryStore({
      fetchHistory,
      freshnessMs: 60_000,
      now: () => 1000,
    });

    await store.prefetch('two-sum');
    const second = await store.get('two-sum');

    expect(fetchHistory).toHaveBeenCalledTimes(1);
    expect(second).toBe(rows);
  });

  it('two concurrent callers share one in-flight promise (dedupe)', async () => {
    let resolve!: (v: SubmissionRow[]) => void;
    const inflight = new Promise<SubmissionRow[]>((r) => { resolve = r; });
    const fetchHistory = vi.fn(async () => inflight);
    const store = new SubmissionHistoryStore({ fetchHistory });

    const a = store.prefetch('two-sum');
    const b = store.get('two-sum');
    resolve([makeRow('1')]);
    const [ra, rb] = await Promise.all([a, b]);

    expect(fetchHistory).toHaveBeenCalledTimes(1);
    expect(ra).toBe(rb);
  });

  it('invalidate drops the cached snapshot and the next call refetches', async () => {
    const fetchHistory = vi.fn(async () => [makeRow('1')]);
    const store = new SubmissionHistoryStore({
      fetchHistory,
      freshnessMs: 60_000,
      now: () => 1000,
    });

    await store.prefetch('two-sum');
    store.invalidate('two-sum');
    await store.get('two-sum');

    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('TTL expiry triggers refetch', async () => {
    const fetchHistory = vi.fn(async () => [makeRow('1')]);
    let currentTime = 1000;
    const store = new SubmissionHistoryStore({
      fetchHistory,
      freshnessMs: 60_000,
      now: () => currentTime,
    });

    await store.prefetch('two-sum');
    currentTime += 120_000;  // advance 2 minutes, past TTL.
    await store.get('two-sum');

    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('rejection leaves cache empty so next call retries', async () => {
    const fetchHistory = vi
      .fn<(slug: string) => Promise<SubmissionRow[]>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([makeRow('1')]);

    const store = new SubmissionHistoryStore({ fetchHistory });

    await expect(store.prefetch('two-sum')).rejects.toThrow('boom');
    const rows = await store.get('two-sum');

    expect(rows).toHaveLength(1);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  // ===========================================================================
  // Phase 20 Plan 20-10 (gap-closure T9 surface layer) — short TTL on empty
  // results. Empty rows[] cache for 5 seconds (vs 60 s for non-empty). Closes
  // the documented 60-second blackout window after the D-02 prefetch race
  // without amplifying per-note-open prefetch into a fetch storm against
  // LC's 20 req / 10 s throttle.
  // ===========================================================================
  it('T9: empty rows[] cache uses short EMPTY_TTL_MS (5 s); refetches after 6 s', async () => {
    const fetchHistory = vi.fn<(slug: string) => Promise<SubmissionRow[]>>(
      async () => [],
    );
    let currentTime = 1000;
    const store = new SubmissionHistoryStore({
      fetchHistory,
      freshnessMs: 60_000,
      now: () => currentTime,
    });

    // First call — populates cache with empty rows.
    const r1 = await store.get('two-sum');
    expect(r1).toEqual([]);
    expect(fetchHistory).toHaveBeenCalledTimes(1);

    // Within 5 s — cache hit, no refetch.
    currentTime += 1_000;
    const r2 = await store.get('two-sum');
    expect(r2).toEqual([]);
    expect(fetchHistory).toHaveBeenCalledTimes(1);

    // After 6 s total — cache expired, refetch fires.
    currentTime += 5_000;
    const r3 = await store.get('two-sum');
    expect(r3).toEqual([]);
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('T9: non-empty rows[] keep the standard 60-s TTL (no regression)', async () => {
    const rows = [makeRow('1')];
    const fetchHistory = vi.fn<(slug: string) => Promise<SubmissionRow[]>>(
      async () => rows,
    );
    let currentTime = 1000;
    const store = new SubmissionHistoryStore({
      fetchHistory,
      freshnessMs: 60_000,
      now: () => currentTime,
    });

    await store.prefetch('two-sum');
    expect(fetchHistory).toHaveBeenCalledTimes(1);

    // 30 s later — within 60 s TTL, cache hit.
    currentTime += 30_000;
    await store.get('two-sum');
    expect(fetchHistory).toHaveBeenCalledTimes(1);

    // 70 s total — past 60 s TTL, refetch.
    currentTime += 40_000;
    await store.get('two-sum');
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('T9: empty → non-empty refresh — empty result expires fast and is replaced by populated rows', async () => {
    // Simulates the documented D-02 prefetch race: first fetch returns
    // empty (auth not yet wired / throttle blip), then 6 s later the user
    // clicks Retrieve and gets fresh rows from LC.
    let attempt = 0;
    const fetchHistory = vi.fn<(slug: string) => Promise<SubmissionRow[]>>(
      async () => {
        attempt++;
        return attempt === 1 ? [] : [makeRow('99')];
      },
    );
    let currentTime = 1000;
    const store = new SubmissionHistoryStore({
      fetchHistory,
      freshnessMs: 60_000,
      now: () => currentTime,
    });

    const first = await store.get('two-sum');
    expect(first).toEqual([]);

    currentTime += 6_000; // past EMPTY_TTL_MS
    const second = await store.get('two-sum');
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe('99');
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('SubmissionPickerModal accepts the store via submissionHistoryStore field', async () => {
    // Integration check — the picker's resolveRows path prefers the store when
    // both store and fetchHistory are present. Lock the Plan 05 field name.
    const rows = [makeRow('1')];
    const fetchHistory = vi.fn(async () => rows);
    const store = new SubmissionHistoryStore({ fetchHistory });

    const { SubmissionPickerModal } = await import(
      '../../src/graph/SubmissionPickerModal'
    );
    const modal = new SubmissionPickerModal({} as never, {
      file: { path: 'x', name: 'x', extension: 'md', parent: null } as never,
      slug: 'two-sum',
      title: 'Two Sum',
      submissionHistoryStore: store,
      openDetailModal: () => undefined,
    });
    await (modal as unknown as { loadAndRender(): Promise<void> }).loadAndRender();

    expect(fetchHistory).toHaveBeenCalledWith('two-sum');
    const contentEl = (modal as unknown as { contentEl: { textContent: string } }).contentEl;
    // Row rendered — verdict chip displays "Accepted".
    expect(contentEl.textContent).toContain('Accepted');
  });
});
