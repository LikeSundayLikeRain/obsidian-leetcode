// tests/preview/existing-note-detection.test.ts
//
// Phase 06 Plan 03 — pure-helper test for `detectExistingNote`. Three cases:
//   1. No cache entry → `{ fileExists: false }` (cannot compute filename
//      without the cached LC question id).
//   2. Cache entry but no file at the canonical path → `{ fileExists: false,
//      id: cached.id }`.
//   3. Cache entry + file at canonical path → `{ fileExists: true, file, id }`.
//
// The helper is pure: no awaits, no side effects. We pass a stub `app`
// shape with only `vault.getAbstractFileByPath` and a stub `settings` shape
// with only the two getters.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { TFile } from 'obsidian';
import { detectExistingNote } from '../../src/preview/previewExistingNote';
import type { DetailCacheEntry } from '../../src/notes/types';

function makeCached(overrides: Partial<DetailCacheEntry> = {}): DetailCacheEntry {
  return {
    fetchedAt: 1700000000000,
    id: 1,
    title: 'Two Sum',
    difficulty: 'Easy',
    url: 'https://leetcode.com/problems/two-sum/',
    contentHtml: '<p>…</p>',
    topicSlugs: [],
    ...overrides,
  };
}

interface FakeAppOpts {
  fileAtPath?: { path: string; file: TFile };
}
function makeFakeApp(opts: FakeAppOpts = {}) {
  return {
    vault: {
      getAbstractFileByPath(path: string): TFile | null {
        if (opts.fileAtPath && opts.fileAtPath.path === path) {
          return opts.fileAtPath.file;
        }
        return null;
      },
    },
  };
}

function makeSettings(opts: {
  cached: DetailCacheEntry | null;
  folder?: string;
}) {
  return {
    getProblemsFolder: () => opts.folder ?? 'LeetCode',
    getProblemDetail: (_slug: string) => opts.cached,
  };
}

describe('detectExistingNote (Phase 06 Plan 03 pure helper)', () => {
  it('returns { fileExists: false } when there is no cache entry', () => {
    const app = makeFakeApp();
    const settings = makeSettings({ cached: null });
    const out = detectExistingNote(app as unknown as Parameters<typeof detectExistingNote>[0], settings, 'two-sum');
    expect(out.fileExists).toBe(false);
    expect(out.id).toBeUndefined();
    expect(out.file).toBeUndefined();
  });

  it('returns { fileExists: false, id } when cache hit but no file at canonical path', () => {
    const app = makeFakeApp(); // vault returns null for any path
    const cached = makeCached({ id: 42 });
    const settings = makeSettings({ cached, folder: 'LeetCode' });
    const out = detectExistingNote(app as unknown as Parameters<typeof detectExistingNote>[0], settings, 'two-sum');
    expect(out.fileExists).toBe(false);
    expect(out.id).toBe(42);
    expect(out.file).toBeUndefined();
  });

  it('returns { fileExists: true, file, id } when cache hit + file exists at canonical path', () => {
    const tFile = new TFile();
    tFile.path = 'LeetCode/1-two-sum.md';
    tFile.extension = 'md';
    const app = makeFakeApp({
      fileAtPath: { path: 'LeetCode/1-two-sum.md', file: tFile },
    });
    const cached = makeCached({ id: 1 });
    const settings = makeSettings({ cached, folder: 'LeetCode' });
    const out = detectExistingNote(app as unknown as Parameters<typeof detectExistingNote>[0], settings, 'two-sum');
    expect(out.fileExists).toBe(true);
    expect(out.id).toBe(1);
    expect(out.file).toBe(tFile);
  });

  it('strips trailing slashes on the folder before joining the canonical path', () => {
    const tFile = new TFile();
    tFile.path = 'LeetCode/1-two-sum.md';
    tFile.extension = 'md';
    const app = makeFakeApp({
      fileAtPath: { path: 'LeetCode/1-two-sum.md', file: tFile },
    });
    const cached = makeCached({ id: 1 });
    // Folder with a trailing slash — buildNotePath should normalize it.
    const settings = makeSettings({ cached, folder: 'LeetCode/' });
    const out = detectExistingNote(app as unknown as Parameters<typeof detectExistingNote>[0], settings, 'two-sum');
    expect(out.fileExists).toBe(true);
  });
});
