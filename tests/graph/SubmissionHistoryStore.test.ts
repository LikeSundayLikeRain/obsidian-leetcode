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
