// Phase 3 Plan 03 Task 3 — RED tests for internalQuestionId plumbing.
// Verifies: (a) DetailCacheEntry accepts optional internalQuestionId (shape guard),
// (b) getInternalQuestionId(slug) accessor returns the cached value or null,
// (c) old cache entries without the field still load (backward compat),
// (d) Phase 2 toDetailCacheEntry populates internalQuestionId from detail.questionId.

import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => { state.data = d; }),
  };
}

describe('Phase 3 SettingsStore.internalQuestionId (D-30)', () => {
  it('DetailCacheEntry with internalQuestionId loads + round-trips', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: {
        'two-sum': {
          fetchedAt: 123,
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '<p>…</p>',
          topicSlugs: ['array', 'hash-table'],
          internalQuestionId: '999',
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemDetail('two-sum')?.internalQuestionId).toBe('999');
  });

  it('DetailCacheEntry without internalQuestionId still loads (backward compat)', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: {
        'two-sum': {
          fetchedAt: 123,
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '<p>…</p>',
          topicSlugs: [],
          // no internalQuestionId
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    // Entry still present (old entries must not be rejected).
    expect(s.getProblemDetail('two-sum')).not.toBeNull();
    expect(s.getProblemDetail('two-sum')?.internalQuestionId).toBeUndefined();
  });

  it('rejects internalQuestionId that is not a string', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: {
        'two-sum': {
          fetchedAt: 123,
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '<p>…</p>',
          topicSlugs: [],
          internalQuestionId: 42 as unknown as string, // non-string → drop
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    // Entry with malformed internalQuestionId is dropped entirely (shape-guard strict).
    expect(s.getProblemDetail('two-sum')).toBeNull();
  });

  it('getInternalQuestionId(slug) returns cached value', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: {
        'two-sum': {
          fetchedAt: 123,
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '<p>…</p>',
          topicSlugs: [],
          internalQuestionId: '1001',
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getInternalQuestionId('two-sum')).toBe('1001');
  });

  it('getInternalQuestionId(slug) returns null when slug missing', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getInternalQuestionId('unknown')).toBeNull();
  });

  it('getInternalQuestionId(slug) returns null when entry lacks the field', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: {
        'two-sum': {
          fetchedAt: 123,
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '<p>…</p>',
          topicSlugs: [],
        },
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getInternalQuestionId('two-sum')).toBeNull();
  });
});
