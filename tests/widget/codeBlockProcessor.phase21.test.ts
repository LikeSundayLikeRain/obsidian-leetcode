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
const { migrateSpy, candidateSpy, bannerSpy } = vi.hoisted(() => ({
  migrateSpy: vi.fn(async () => true),
  candidateSpy: vi.fn(() => true),
  bannerSpy: vi.fn(),
}));

vi.mock('../../src/widget/fenceMigrator', () => ({
  migrateLegacyFenceIfNeeded: migrateSpy,
  isMigrationCandidate: candidateSpy,
}));

vi.mock('../../src/widget/legacyFenceBanner', () => ({
  mountLegacyFenceBanner: bannerSpy,
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
    migrateSpy.mockResolvedValue(true);
    candidateSpy.mockReturnValue(true);
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
});
