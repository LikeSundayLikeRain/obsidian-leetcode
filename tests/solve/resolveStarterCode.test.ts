// tests/solve/resolveStarterCode.test.ts
//
// Failure B (Phase 22 follow-up) — unit coverage for the resolveStarterCode
// helper. Asserts the { code, reason } contract for every case the chevron
// language-switch path needs to differentiate (cache hit / stale refresh /
// missing-codeSnippets / network failure with cache / network failure
// without cache / snippet-not-found-for-langSlug / empty-string snippet).

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resolveStarterCode } from '../../src/solve/resolveStarterCode';
import { CACHE_TTL_MS } from '../../src/notes/NoteWriter';
import type { DetailCacheEntry } from '../../src/settings/SettingsStore';
import type { LeetCodeProblemDetail } from '../../src/api/LeetCodeClient';

interface MockSettingsStore {
  store: Map<string, DetailCacheEntry>;
  getProblemDetail: ReturnType<typeof vi.fn>;
  setProblemDetail: ReturnType<typeof vi.fn>;
}

function makeSettings(initial: Record<string, DetailCacheEntry> = {}): MockSettingsStore {
  const store = new Map(Object.entries(initial));
  const getProblemDetail = vi.fn((slug: string): DetailCacheEntry | null => {
    return store.get(slug) ?? null;
  });
  const setProblemDetail = vi.fn(async (slug: string, entry: DetailCacheEntry) => {
    store.set(slug, entry);
  });
  return { store, getProblemDetail, setProblemDetail };
}

function makeClient(detail: LeetCodeProblemDetail | null | Error) {
  const getProblemDetail = vi.fn(async (_slug: string) => {
    if (detail instanceof Error) throw detail;
    return detail;
  });
  return { getProblemDetail };
}

function freshDetail(
  slug: string,
  snippets: Array<{ lang: string; langSlug: string; code: string }>,
): LeetCodeProblemDetail {
  return {
    questionFrontendId: '1',
    questionId: '1',
    titleSlug: slug,
    title: 'Two Sum',
    content: '<p>x</p>',
    difficulty: 'Easy',
    isPaidOnly: false,
    codeSnippets: snippets,
  };
}

function entry(
  fetchedAt: number,
  snippets?: Array<{ lang: string; langSlug: string; code: string }>,
): DetailCacheEntry {
  return {
    fetchedAt,
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/two-sum/',
    contentHtml: '<p>x</p>',
    topicSlugs: [],
    codeSnippets: snippets,
  };
}

describe('resolveStarterCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fresh cache hit returns { code, reason: "ok" } and skips client', async () => {
    const settings = makeSettings({
      'two-sum': entry(Date.now(), [
        { lang: 'Python3', langSlug: 'python3', code: 'def hello(): pass' },
      ]),
    });
    const client = makeClient(null); // would throw if called
    const deps = { settings, client, now: () => Date.now() };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'python3');

    expect(res).toEqual({ code: 'def hello(): pass', reason: 'ok' });
    expect(client.getProblemDetail).not.toHaveBeenCalled();
    expect(settings.setProblemDetail).not.toHaveBeenCalled();
  });

  it('stale cache forces refresh and persists fresh entry', async () => {
    const now = Date.now();
    const stale = now - (CACHE_TTL_MS + 1000);
    const settings = makeSettings({
      'two-sum': entry(stale, [
        { lang: 'Python3', langSlug: 'python3', code: 'STALE_CODE' },
      ]),
    });
    const client = makeClient(
      freshDetail('two-sum', [{ lang: 'Python3', langSlug: 'python3', code: 'FRESH_CODE' }]),
    );
    const deps = { settings, client, now: () => now };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'python3');

    expect(client.getProblemDetail).toHaveBeenCalledTimes(1);
    expect(settings.setProblemDetail).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ code: 'FRESH_CODE', reason: 'ok' });
  });

  it('fresh cache without codeSnippets (Pitfall 10) forces refresh', async () => {
    const settings = makeSettings({
      'two-sum': entry(Date.now() /* fresh */, undefined),
    });
    const client = makeClient(
      freshDetail('two-sum', [{ lang: 'Python3', langSlug: 'python3', code: 'FRESH' }]),
    );
    const deps = { settings, client };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'python3');

    expect(client.getProblemDetail).toHaveBeenCalledTimes(1);
    expect(settings.setProblemDetail).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ code: 'FRESH', reason: 'ok' });
  });

  it('network failure with usable stale cache returns { code, reason: "ok" }', async () => {
    const settings = makeSettings({
      'two-sum': entry(Date.now() - (CACHE_TTL_MS + 100), [
        { lang: 'Python3', langSlug: 'python3', code: 'STALE_BUT_USABLE' },
      ]),
    });
    const client = makeClient(new Error('offline'));
    const deps = { settings, client };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'python3');

    // Graceful degradation — stale snippet preserved when network fails.
    expect(res).toEqual({ code: 'STALE_BUT_USABLE', reason: 'ok' });
    expect(client.getProblemDetail).toHaveBeenCalledTimes(1);
    expect(settings.setProblemDetail).not.toHaveBeenCalled();
  });

  it('network failure with empty cache returns { code: null, reason: "network" }', async () => {
    const settings = makeSettings({});
    const client = makeClient(new Error('offline'));
    const deps = { settings, client };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'python3');

    expect(res).toEqual({ code: null, reason: 'network' });
    expect(settings.setProblemDetail).not.toHaveBeenCalled();
  });

  it('snippet not in codeSnippets returns { code: null, reason: "unavailable" }', async () => {
    // Fresh cache, but no entry for 'kotlin'.
    const settings = makeSettings({
      'two-sum': entry(Date.now(), [
        { lang: 'Python3', langSlug: 'python3', code: 'def x(): pass' },
      ]),
    });
    const client = makeClient(null);
    const deps = { settings, client };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'kotlin');

    expect(res).toEqual({ code: null, reason: 'unavailable' });
  });

  it('empty-string snippet for langSlug returns { code: null, reason: "unavailable" }', async () => {
    const settings = makeSettings({
      'two-sum': entry(Date.now(), [
        { lang: 'Kotlin', langSlug: 'kotlin', code: '' },
      ]),
    });
    const client = makeClient(null);
    const deps = { settings, client };

    const res = await resolveStarterCode(deps as never, 'two-sum', 'kotlin');

    expect(res).toEqual({ code: null, reason: 'unavailable' });
  });
});
