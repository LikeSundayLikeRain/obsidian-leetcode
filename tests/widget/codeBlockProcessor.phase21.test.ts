// tests/widget/codeBlockProcessor.phase21.test.ts
//
// Phase 21 Plan 21-02 Task 3 — Reading-mode pre-mount migration gate.
//
// Three integration cases:
//   1. useInlineWidget=ON + autoMigrateOnOpen=ON + lc-slug + v1.2-shaped
//      source → handler awaits migrateLegacyFenceIfNeeded; on success
//      returns early (renders static fallback; addChild not called).
//   2. useInlineWidget=ON + autoMigrateOnOpen=OFF + isMigrationCandidate
//      → handler calls mountLegacyFenceBanner; addChild not called.
//   3. useInlineWidget=OFF → neither migration nor banner invoked
//      (legacy useInlineWidget=OFF path preserved per L9).
//
// Mocks fenceMigrator + legacyFenceBanner so the processor wiring is
// exercised in isolation; the migrator and banner are tested elsewhere.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    parent: unknown = null;
    constructor(path: string) {
      this.path = path;
      const slash = path.lastIndexOf('/');
      this.name = slash >= 0 ? path.slice(slash + 1) : path;
      const dot = this.name.lastIndexOf('.');
      this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
      this.extension = dot >= 0 ? this.name.slice(dot + 1) : '';
    }
  }
  return { ...actual, TFile };
});

// vi.hoisted spies — must be declared inside hoisted() so vi.mock factories
// can reference them without TDZ. Mirrors the pattern in
// tests/widget/legacyFenceBanner.test.ts.
const {
  migrateSpy,
  candidateSpy,
  bannerSpy,
  repairSpy,
  repairCandidateSpy,
  rerenderReadingModePanesSpy,
} = vi.hoisted(() => ({
  migrateSpy: vi.fn(async () => true),
  candidateSpy: vi.fn(() => true),
  bannerSpy: vi.fn(),
  repairSpy: vi.fn(async () => false),
  repairCandidateSpy: vi.fn(() => false),
  rerenderReadingModePanesSpy: vi.fn(),
}));

vi.mock('../../src/widget/fenceMigrator', () => ({
  migrateLegacyFenceIfNeeded: migrateSpy,
  isMigrationCandidate: candidateSpy,
  repairFrontmatterIfNeeded: repairSpy,
  isFrontmatterRepairCandidate: repairCandidateSpy,
}));

vi.mock('../../src/widget/legacyFenceBanner', () => ({
  mountLegacyFenceBanner: bannerSpy,
}));

// Plan 21-14 — mock the rerenderReadingModePanes helper so tests can spy on
// the post-repair hand-off without invoking the real preview-rerender API.
vi.mock('../../src/main/readingModeMigrationHook', () => ({
  rerenderReadingModePanes: rerenderReadingModePanesSpy,
}));

interface FakeSectionInfo {
  text: string;
  lineStart: number;
  lineEnd: number;
}

interface ProcessorCtx {
  sourcePath: string;
  getSectionInfo: (el: HTMLElement) => FakeSectionInfo | null;
  addChild: ReturnType<typeof vi.fn>;
}

function makeCtx(sourcePath: string, info: FakeSectionInfo | null): ProcessorCtx {
  return {
    sourcePath,
    getSectionInfo: () => info,
    addChild: vi.fn(),
  };
}

function makeHost(): HTMLElement {
  return document.createElement('div');
}

interface FakeSettings {
  getUseInlineWidget?: () => boolean;
  getAutoMigrateOnOpen?: () => boolean;
  getDefaultLanguage?: () => string;
  getIndentSizeOverride?: () => 'auto' | 2 | 4 | 8;
  getShowRelativeLineNumbers?: () => boolean;
  getWidgetSyncDebounceMs?: () => number;
}

async function getProcessor(
  plugin: ReturnType<typeof createFakePlugin>,
  settings: FakeSettings,
) {
  const mod = (await import('../../src/widget/codeBlockProcessor')) as unknown as {
    leetCodeBlockProcessor: (plugin: unknown) => (
      source: string,
      el: HTMLElement,
      ctx: unknown,
    ) => void | Promise<void>;
  };
  const obs = await import('obsidian');
  const TFile = (obs as unknown as { TFile: new (path: string) => unknown }).TFile;
  (plugin.app as unknown as { vault?: unknown }).vault = {
    getAbstractFileByPath: (p: string) => new TFile(p),
  };
  (plugin as unknown as { settings: FakeSettings }).settings = settings;
  return mod.leetCodeBlockProcessor(plugin);
}

const V12_SOURCE = 'class Solution: pass';
const V12_SECTION = (() => {
  const noteText = [
    '---',
    'lc-slug: two-sum',
    '---',
    '',
    '## Code',
    '',
    '```python',
    V12_SOURCE,
    '```',
  ].join('\n');
  return { text: noteText, lineStart: 6, lineEnd: 8 };
})();

describe('Phase 21 mount-path migration', () => {
  beforeEach(() => {
    migrateSpy.mockClear();
    candidateSpy.mockClear();
    bannerSpy.mockClear();
    repairSpy.mockClear();
    repairCandidateSpy.mockClear();
    rerenderReadingModePanesSpy.mockClear();
    migrateSpy.mockResolvedValue(true);
    candidateSpy.mockReturnValue(true);
    repairSpy.mockResolvedValue(false);
    repairCandidateSpy.mockReturnValue(false);
  });

  it('Case 1: useInlineWidget=ON + autoMigrateOnOpen=ON + lc-slug → awaits migrate, renders static fallback, no addChild', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'python3',
      getIndentSizeOverride: () => 'auto',
    };
    const processor = await getProcessor(plugin, settings);
    const el = makeHost();
    const ctx = makeCtx('LeetCode/two-sum.md', V12_SECTION);

    await processor(V12_SOURCE, el, ctx as never);

    // Migration was attempted with autoMigrateOnOpen=true.
    expect(migrateSpy).toHaveBeenCalledTimes(1);
    const call = migrateSpy.mock.calls[0] as unknown as unknown[];
    const opts = call[2] as { autoMigrateOnOpen?: boolean; defaultLanguage?: string };
    expect(opts.autoMigrateOnOpen).toBe(true);
    expect(opts.defaultLanguage).toBe('python3');
    // Banner was NOT mounted (auto path silent).
    expect(bannerSpy).not.toHaveBeenCalled();
    // Migration ran (returned true) → handler returns early before addChild.
    expect(ctx.addChild).not.toHaveBeenCalled();
    // Static fallback renders.
    const code = el.querySelector('pre code');
    expect(code).not.toBeNull();
  });

  it('Case 2: useInlineWidget=ON + autoMigrateOnOpen=OFF + candidate accepts → mounts banner, no migrate, no addChild', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => false,
      getDefaultLanguage: () => 'python3',
      getIndentSizeOverride: () => 'auto',
    };
    const processor = await getProcessor(plugin, settings);
    const el = makeHost();
    const ctx = makeCtx('LeetCode/two-sum.md', V12_SECTION);

    await processor(V12_SOURCE, el, ctx as never);

    // Migrate auto-path NOT invoked (autoMigrateOnOpen=false guards it).
    expect(migrateSpy).not.toHaveBeenCalled();
    // Predicate consulted to gate the banner.
    expect(candidateSpy).toHaveBeenCalledTimes(1);
    // Banner mounted.
    expect(bannerSpy).toHaveBeenCalledTimes(1);
    const args = bannerSpy.mock.calls[0] as unknown as unknown[];
    expect(args[0]).toBe(el); // host
    expect(args[1]).toBe(V12_SOURCE); // source
    // mode argument — manual-prompt for autoMigrateOnOpen=OFF Reading path.
    expect(args[4]).toBe('manual-prompt');
    // No render child.
    expect(ctx.addChild).not.toHaveBeenCalled();
  });

  it('Case 3: useInlineWidget=OFF → neither migration nor banner invoked (legacy v1.2 path preserved)', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => false,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'python3',
      getIndentSizeOverride: () => 'auto',
    };
    const processor = await getProcessor(plugin, settings);
    const el = makeHost();
    const ctx = makeCtx('LeetCode/two-sum.md', V12_SECTION);

    await processor(V12_SOURCE, el, ctx as never);

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(bannerSpy).not.toHaveBeenCalled();
    // The original codeBlockProcessor behavior continues — for an
    // lc-slug + valid section, addChild fires (existing v1.2 path).
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Phase 21 Plan 21-09 — Reading-mode post-processor invokes repair when
  // migrate is not a candidate (post-processor only fires for the
  // 'leetcode-solve' fence tag — the body is already v1.3 — so the
  // asymmetric "missing lc-language" case must hit `repair` before mount.
  // ───────────────────────────────────────────────────────────────────────
  it('Case 5 [Plan 21-09]: useInlineWidget=ON + autoMigrateOnOpen=ON + migrate=false + repair candidate → repair invoked, static fallback rendered, no addChild', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'java',
      getIndentSizeOverride: () => 'auto',
    };
    const processor = await getProcessor(plugin, settings);
    const el = makeHost();
    const v13Section = {
      text:
        '---\nlc-slug: two-sum\n---\n\n## Code\n\n```leetcode-solve\ndef solve(): pass\n```\n',
      lineStart: 5,
      lineEnd: 7,
    };
    const ctx = makeCtx('LeetCode/two-sum.md', v13Section);

    // migrate returns false (not a v1.2-shaped candidate); repair returns true.
    migrateSpy.mockResolvedValueOnce(false);
    repairSpy.mockResolvedValueOnce(true);

    await processor(V12_SOURCE, el, ctx as never);

    expect(migrateSpy).toHaveBeenCalledTimes(1);
    expect(repairSpy).toHaveBeenCalledTimes(1);
    const repairCall = repairSpy.mock.calls[0] as unknown as unknown[];
    const repairOpts = repairCall[2] as {
      autoMigrateOnOpen?: boolean;
      defaultLanguage?: string;
    };
    expect(repairOpts.autoMigrateOnOpen).toBe(true);
    expect(repairOpts.defaultLanguage).toBe('java');
    // Repair ran → static fallback; widget remounts on the next
    // metadataCache.changed event.
    expect(ctx.addChild).not.toHaveBeenCalled();
    const code = el.querySelector('pre code');
    expect(code).not.toBeNull();
  });

  it('Case 6 [Plan 21-09]: migrate=false + repair=false → falls through to legacy mount path', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'python3',
      getIndentSizeOverride: () => 'auto',
    };
    const processor = await getProcessor(plugin, settings);
    const el = makeHost();
    const ctx = makeCtx('LeetCode/two-sum.md', V12_SECTION);

    migrateSpy.mockResolvedValueOnce(false);
    repairSpy.mockResolvedValueOnce(false);

    await processor(V12_SOURCE, el, ctx as never);

    expect(migrateSpy).toHaveBeenCalledTimes(1);
    expect(repairSpy).toHaveBeenCalledTimes(1);
    // Both false → existing mount path runs.
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  it('Case 4: useInlineWidget=ON + autoMigrateOnOpen=OFF + candidate REJECTS → no banner, falls through to legacy path', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => false,
      getDefaultLanguage: () => 'python3',
      getIndentSizeOverride: () => 'auto',
    };
    candidateSpy.mockReturnValue(false);
    const processor = await getProcessor(plugin, settings);
    const el = makeHost();
    const ctx = makeCtx('LeetCode/two-sum.md', V12_SECTION);

    await processor(V12_SOURCE, el, ctx as never);

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(bannerSpy).not.toHaveBeenCalled();
    // Falls through — existing path mounts the render child.
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-14 — R2 (UAT re-test gap closure): post-repair rerender hand-off.
  // After repairFrontmatterIfNeeded resolves with `repaired === true`, the
  // post-processor must invoke `rerenderReadingModePanes(plugin.app,
  // file.path)` so the SAME open re-runs post-processors against the just-
  // written frontmatter — without requiring a close+reopen.
  // ───────────────────────────────────────────────────────────────────────
  describe('R2 — post-repair rerender hand-off (Plan 21-14)', () => {
    const V13_SECTION = {
      text:
        '---\nlc-slug: two-sum\n---\n\n## Code\n\n```leetcode-solve\ndef solve(): pass\n```\n',
      lineStart: 5,
      lineEnd: 7,
    };

    it('Test R2.1: migrate=false + repair=true → rerenderReadingModePanes invoked exactly once with file.path AFTER renderStaticFallback', async () => {
      const metadataCache = createFakeMetadataCache();
      metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
      const plugin = createFakePlugin({ metadataCache });
      const settings: FakeSettings = {
        getUseInlineWidget: () => true,
        getAutoMigrateOnOpen: () => true,
        getDefaultLanguage: () => 'java',
        getIndentSizeOverride: () => 'auto',
      };
      const processor = await getProcessor(plugin, settings);
      const el = makeHost();
      const ctx = makeCtx('LeetCode/two-sum.md', V13_SECTION);

      migrateSpy.mockResolvedValueOnce(false);
      repairSpy.mockResolvedValueOnce(true);

      await processor(V12_SOURCE, el, ctx as never);

      expect(migrateSpy).toHaveBeenCalledTimes(1);
      expect(repairSpy).toHaveBeenCalledTimes(1);
      expect(rerenderReadingModePanesSpy).toHaveBeenCalledTimes(1);
      const [appArg, pathArg] =
        rerenderReadingModePanesSpy.mock.calls[0] as unknown as [
          unknown,
          string,
        ];
      // The helper receives plugin.app and the file's path string.
      expect(appArg).toBe(plugin.app);
      expect(pathArg).toBe('LeetCode/two-sum.md');
      // Static fallback rendered.
      expect(ctx.addChild).not.toHaveBeenCalled();
      const code = el.querySelector('pre code');
      expect(code).not.toBeNull();
    });

    it('Test R2.2: migrate=false + repair=false → rerenderReadingModePanes NOT invoked', async () => {
      const metadataCache = createFakeMetadataCache();
      metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
      const plugin = createFakePlugin({ metadataCache });
      const settings: FakeSettings = {
        getUseInlineWidget: () => true,
        getAutoMigrateOnOpen: () => true,
        getDefaultLanguage: () => 'java',
        getIndentSizeOverride: () => 'auto',
      };
      const processor = await getProcessor(plugin, settings);
      const el = makeHost();
      const ctx = makeCtx('LeetCode/two-sum.md', V13_SECTION);

      migrateSpy.mockResolvedValueOnce(false);
      repairSpy.mockResolvedValueOnce(false);

      await processor(V12_SOURCE, el, ctx as never);

      expect(repairSpy).toHaveBeenCalledTimes(1);
      expect(rerenderReadingModePanesSpy).not.toHaveBeenCalled();
    });

    it('Test R2.3: migrate=true → repair NOT called AND rerenderReadingModePanes NOT called from the repair branch', async () => {
      const metadataCache = createFakeMetadataCache();
      metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
      const plugin = createFakePlugin({ metadataCache });
      const settings: FakeSettings = {
        getUseInlineWidget: () => true,
        getAutoMigrateOnOpen: () => true,
        getDefaultLanguage: () => 'python3',
        getIndentSizeOverride: () => 'auto',
      };
      const processor = await getProcessor(plugin, settings);
      const el = makeHost();
      const ctx = makeCtx('LeetCode/two-sum.md', V12_SECTION);

      migrateSpy.mockResolvedValueOnce(true);

      await processor(V12_SOURCE, el, ctx as never);

      expect(migrateSpy).toHaveBeenCalledTimes(1);
      // Migrator returned true → early return; repair was NOT called.
      expect(repairSpy).not.toHaveBeenCalled();
      // The post-processor's repair branch never runs, so its rerender call
      // never fires. The migrate-path rerender hand-off lives in the
      // readingModeMigrationHook (Plan 21-08), NOT in this post-processor.
      expect(rerenderReadingModePanesSpy).not.toHaveBeenCalled();
    });

    it('Test R2.4: repair() rejects → rerenderReadingModePanes NOT called; no exception propagates', async () => {
      const metadataCache = createFakeMetadataCache();
      metadataCache.setFrontmatter('LeetCode/two-sum.md', { 'lc-slug': 'two-sum' });
      const plugin = createFakePlugin({ metadataCache });
      const settings: FakeSettings = {
        getUseInlineWidget: () => true,
        getAutoMigrateOnOpen: () => true,
        getDefaultLanguage: () => 'java',
        getIndentSizeOverride: () => 'auto',
      };
      const processor = await getProcessor(plugin, settings);
      const el = makeHost();
      const ctx = makeCtx('LeetCode/two-sum.md', V13_SECTION);

      migrateSpy.mockResolvedValueOnce(false);
      repairSpy.mockRejectedValueOnce(new Error('boom'));

      // Existing inner try/catch in the post-processor swallows the rejection.
      await expect(
        processor(V12_SOURCE, el, ctx as never),
      ).resolves.toBeUndefined();

      expect(repairSpy).toHaveBeenCalledTimes(1);
      expect(rerenderReadingModePanesSpy).not.toHaveBeenCalled();
    });

    it('Test R2.5: rerenderReadingModePanes is called WITH the same file.path string the post-processor received (not basename)', async () => {
      const metadataCache = createFakeMetadataCache();
      metadataCache.setFrontmatter(
        'LeetCode/0001-two-sum.md',
        { 'lc-slug': 'two-sum' },
      );
      const plugin = createFakePlugin({ metadataCache });
      const settings: FakeSettings = {
        getUseInlineWidget: () => true,
        getAutoMigrateOnOpen: () => true,
        getDefaultLanguage: () => 'java',
        getIndentSizeOverride: () => 'auto',
      };
      const processor = await getProcessor(plugin, settings);
      const el = makeHost();
      const ctx = makeCtx('LeetCode/0001-two-sum.md', V13_SECTION);

      migrateSpy.mockResolvedValueOnce(false);
      repairSpy.mockResolvedValueOnce(true);

      await processor(V12_SOURCE, el, ctx as never);

      expect(rerenderReadingModePanesSpy).toHaveBeenCalledTimes(1);
      const [, pathArg] =
        rerenderReadingModePanesSpy.mock.calls[0] as unknown as [
          unknown,
          string,
        ];
      // Tightens R2.1 — the second argument is the full vault path string,
      // not the basename and not the TFile object.
      expect(pathArg).toBe('LeetCode/0001-two-sum.md');
      expect(typeof pathArg).toBe('string');
    });
  });
});
