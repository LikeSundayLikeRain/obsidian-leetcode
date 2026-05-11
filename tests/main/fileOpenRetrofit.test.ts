// tests/main/fileOpenRetrofit.test.ts
//
// Phase 5.2 Plan 04 — D-06 file-open auto-insert hook.
//
// Contract (from PLAN):
//   - workspace.on('file-open') handler gates on `lc-slug` frontmatter
//     (isValidSlug + metadataCache.getFileCache).
//   - When the gate passes: calls retrofit(app, file, detail, settings)
//     silent-on-failure (swallows rejections via .catch).
//   - When the gate fails (no file, no frontmatter, invalid slug):
//     retrofit is NOT invoked.
//   - retrofit is idempotent (RESEARCH Pitfall 5) — double-fire on the
//     same file with starter already in place leaves the body unchanged.
//
// The handler factory is extracted into src/main/fileOpenHook.ts so tests
// can drive it without spinning up a full Obsidian Plugin lifecycle.

import { describe, it, expect, vi } from 'vitest';
import { makeFileOpenHandler } from '../../src/main/fileOpenHook';
import type { DetailCacheEntry } from '../../src/settings/SettingsStore';

interface FakeFile {
  path: string;
}

function makeApp(fmMap: Record<string, Record<string, unknown>> = {}) {
  return {
    metadataCache: {
      getFileCache: (f: FakeFile | null) => {
        if (!f) return null;
        const fm = fmMap[f.path];
        return fm ? { frontmatter: fm } : null;
      },
    },
  } as unknown as import('obsidian').App;
}

function makeSettings(
  detail: Partial<DetailCacheEntry> | null = null,
  defaultLang = 'python3',
) {
  return {
    getProblemDetail: vi.fn(
      (_slug: string): DetailCacheEntry | null =>
        detail as DetailCacheEntry | null,
    ),
    getDefaultLanguage: vi.fn((): string => defaultLang),
  };
}

describe('file-open retrofit hook (D-06)', () => {
  it('calls retrofit when file has a valid lc-slug frontmatter', async () => {
    const retrofit = vi.fn(async () => undefined);
    const app = makeApp({
      'LeetCode/1-two-sum.md': { 'lc-slug': 'two-sum' },
    });
    const settings = makeSettings({ codeSnippets: [] });
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    const file: FakeFile = { path: 'LeetCode/1-two-sum.md' };
    handler(file as never);
    // Give any .catch() microtasks time to settle.
    await Promise.resolve();

    expect(retrofit).toHaveBeenCalledTimes(1);
    expect(retrofit).toHaveBeenCalledWith(app, file, { codeSnippets: [] }, settings);
  });

  it('no-op when file is null', async () => {
    const retrofit = vi.fn(async () => undefined);
    const app = makeApp({});
    const settings = makeSettings();
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    handler(null);
    await Promise.resolve();

    expect(retrofit).not.toHaveBeenCalled();
  });

  it('no-op when file has no frontmatter', async () => {
    const retrofit = vi.fn(async () => undefined);
    const app = makeApp({}); // no fm registered
    const settings = makeSettings();
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    handler({ path: 'LeetCode/plain.md' } as never);
    await Promise.resolve();

    expect(retrofit).not.toHaveBeenCalled();
  });

  it('no-op when lc-slug is missing', async () => {
    const retrofit = vi.fn(async () => undefined);
    const app = makeApp({
      'LeetCode/other.md': { tag: 'misc' },
    });
    const settings = makeSettings();
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    handler({ path: 'LeetCode/other.md' } as never);
    await Promise.resolve();

    expect(retrofit).not.toHaveBeenCalled();
  });

  it('no-op when lc-slug is malformed (uppercase / whitespace)', async () => {
    const retrofit = vi.fn(async () => undefined);
    const app = makeApp({
      'LeetCode/bad.md': { 'lc-slug': 'Two Sum' },
      'LeetCode/bad2.md': { 'lc-slug': '' },
      'LeetCode/bad3.md': { 'lc-slug': 123 },
    });
    const settings = makeSettings();
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    handler({ path: 'LeetCode/bad.md' } as never);
    handler({ path: 'LeetCode/bad2.md' } as never);
    handler({ path: 'LeetCode/bad3.md' } as never);
    await Promise.resolve();

    expect(retrofit).not.toHaveBeenCalled();
  });

  it('swallows retrofit rejections silently (D-09 silent-on-failure)', async () => {
    const retrofit = vi.fn(async () => {
      throw new Error('boom');
    });
    const app = makeApp({
      'LeetCode/1-two-sum.md': { 'lc-slug': 'two-sum' },
    });
    const settings = makeSettings();
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    // MUST not throw synchronously or asynchronously.
    expect(() => handler({ path: 'LeetCode/1-two-sum.md' } as never)).not.toThrow();
    // Let the rejected promise settle — if .catch was missing, this would
    // surface as an unhandled rejection (vitest converts some of these to
    // test failures depending on config).
    await new Promise((r) => setTimeout(r, 0));

    expect(retrofit).toHaveBeenCalledTimes(1);
  });

  it('passes cached detail from settings.getProblemDetail through to retrofit', async () => {
    const retrofit = vi.fn(async () => undefined);
    const cached = {
      codeSnippets: [{ lang: "Python3", langSlug: "python3", code: "starter" }],
    };
    const app = makeApp({
      'LeetCode/1-two-sum.md': { 'lc-slug': 'two-sum' },
    });
    const settings = makeSettings(cached);
    const handler = makeFileOpenHandler({ app, settings, retrofit });

    handler({ path: 'LeetCode/1-two-sum.md' } as never);
    await Promise.resolve();

    expect(settings.getProblemDetail).toHaveBeenCalledWith('two-sum');
    const call = retrofit.mock.calls[0] as unknown as [unknown, unknown, unknown, unknown];
    expect(call[2]).toBe(cached);
  });
});
