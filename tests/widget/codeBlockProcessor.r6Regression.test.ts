// tests/widget/codeBlockProcessor.r6Regression.test.ts
//
// R6 regression test — Plan 21.1-01 (MIGRATE-FLICKER-01) fix.
//
// Verifies that opening a fresh problem note for the first time mounts the
// widget correctly (ctx.addChild called) without requiring the
// delete-and-reopen workaround.
//
// Root cause (bug introduced by 1a8a140):
//   The attempt-once Set gate added in 1a8a140 marks the path as attempted
//   BEFORE awaiting migrate/repair. When repairFrontmatterIfNeeded returned
//   true (fresh note: metadataCache race — lc-language not yet indexed), the
//   old `if (repaired)` branch did a bounded cache poll then fell through to
//   addChild. In practice the widget silently failed to mount for the
//   freshly-opened note.
//
// Fix (Plan 21.1-01 follow-up):
//   The `if (repaired)` branch now mirrors the `if (migrated)` branch:
//     rerenderReadingModePanes → renderStaticFallback → return.
//   The second invocation (triggered by rerenderReadingModePanes) hits
//   Set.has(path)=true, short-circuits migrate/repair, and falls through
//   to addChild with a fresh metadataCache snapshot.
//
// Two scenarios are exercised:
//   R6-A: metadataCache already has lc-slug AND lc-language when the
//         processor fires (applyFrontmatter indexed fast). Both migrate and
//         repair return false. Widget mounts on first invocation.
//   R6-B: metadataCache has lc-slug but lc-language is NOT yet indexed
//         when the processor fires (metadataCache race). repair returns true.
//         First invocation → rerenderReadingModePanes + renderStaticFallback.
//         Second invocation (simulated) → Set.has=true → falls through →
//         addChild → widget mounts.

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

const {
  migrateSpy,
  repairSpy,
} = vi.hoisted(() => ({
  migrateSpy: vi.fn(async () => false),
  repairSpy: vi.fn(async () => false),
}));

vi.mock('../../src/widget/fenceMigrator', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/widget/fenceMigrator')
  >('../../src/widget/fenceMigrator');
  return {
    ...actual,
    migrateLegacyFenceIfNeeded: migrateSpy,
    repairFrontmatterIfNeeded: repairSpy,
    isMigrationCandidate: vi.fn(() => false),
  };
});

vi.mock('../../src/widget/legacyFenceBanner', () => ({
  mountLegacyFenceBanner: vi.fn(),
}));

const rerenderSpy = vi.fn();
vi.mock('../../src/main/readingModeMigrationHook', () => ({
  rerenderReadingModePanes: rerenderSpy,
}));

vi.mock('../../src/shared/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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
  containerEl?: HTMLElement;
}

function makeCtx(sourcePath: string, info: FakeSectionInfo | null = null): ProcessorCtx {
  return {
    sourcePath,
    getSectionInfo: () => info,
    addChild: vi.fn(),
    containerEl: document.createElement('div'),
  };
}

function makeHost(): HTMLElement {
  return document.createElement('div');
}

interface FakeSettings {
  getUseInlineWidget?: () => boolean;
  getAutoMigrateOnOpen?: () => boolean;
  getDefaultLanguage?: () => string;
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
    clearAllCodeBlockProcessorAttempted?: () => void;
  };
  const obs = await import('obsidian');
  const TFile = (obs as unknown as { TFile: new (path: string) => unknown }).TFile;
  (plugin.app as unknown as { vault?: unknown }).vault = {
    getAbstractFileByPath: (p: string) => new TFile(p),
  };
  (plugin as unknown as { lcSettings: FakeSettings }).lcSettings = settings;
  return {
    processor: mod.leetCodeBlockProcessor(plugin),
    clearAllAttempted: mod.clearAllCodeBlockProcessorAttempted,
  };
}

// Fresh v1.3 note body shape from buildNoteBody(useInlineWidget=true).
const FRESH_V13_FENCE_BODY = 'class Solution:\n    def twoSum(self, nums, target):\n        return []\n';
const FILE_PATH = 'LeetCode/0001-two-sum.md';

// Section info with a v1.3 leetcode-solve fence (no frontmatter in body —
// applyFrontmatter adds frontmatter via processFrontMatter after vault.create).
const V13_SECTION: FakeSectionInfo = {
  text: [
    '---',
    'lc-slug: two-sum',
    'lc-language: python3',
    '---',
    '',
    '## Code',
    '',
    '```leetcode-solve',
    FRESH_V13_FENCE_BODY.trim(),
    '```',
  ].join('\n'),
  lineStart: 7,
  lineEnd: 9,
};

describe('R6 regression — fresh problem note first open mounts widget (Plan 21.1-01 fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    migrateSpy.mockResolvedValue(false);
    repairSpy.mockResolvedValue(false);
    rerenderSpy.mockReset();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // R6-A: metadataCache has lc-slug AND lc-language on first invocation.
  // migrate=false, repair=false → widget mounts directly (addChild on first
  // invocation, no intermediate static fallback).
  // ──────────────────────────────────────────────────────────────────────────
  it('R6-A: fresh note with lc-slug + lc-language already in metadataCache → addChild on first invocation', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'python3',
    };

    const { processor, clearAllAttempted } = await getProcessor(plugin, settings);
    clearAllAttempted?.();

    migrateSpy.mockResolvedValue(false);
    repairSpy.mockResolvedValue(false);

    const el = makeHost();
    const ctx = makeCtx(FILE_PATH, V13_SECTION);
    await processor(FRESH_V13_FENCE_BODY, el, ctx);

    // Widget mounts on first invocation.
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
    // No static fallback DOM was injected.
    expect(el.querySelector('pre code')).toBeNull();
    // No intermediate rerender hop needed.
    expect(rerenderSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // R6-B: metadataCache race — lc-slug present but lc-language NOT yet indexed
  // when processor fires. repair=true. First invocation must NOT mount widget
  // (renderStaticFallback + rerenderReadingModePanes); second invocation
  // (simulated — Set.has=true path) must mount widget via addChild.
  // ──────────────────────────────────────────────────────────────────────────
  it('R6-B: metadataCache race — lc-language missing in cache when processor fires → repair=true → renderStaticFallback + rerenderReadingModePanes on first invocation, addChild on second', async () => {
    const metadataCache = createFakeMetadataCache();
    // lc-slug present but lc-language missing (metadataCache race).
    metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      // lc-language intentionally absent — simulates stale metadataCache
    });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'python3',
    };

    const { processor, clearAllAttempted } = await getProcessor(plugin, settings);
    clearAllAttempted?.();

    // First invocation: repair returns true (lc-language missing in cache).
    migrateSpy.mockResolvedValue(false);
    repairSpy.mockResolvedValue(true);

    const el1 = makeHost();
    const ctx1 = makeCtx(FILE_PATH, V13_SECTION);
    await processor(FRESH_V13_FENCE_BODY, el1, ctx1);

    // First invocation: static fallback rendered (no widget yet).
    expect(ctx1.addChild).not.toHaveBeenCalled();
    expect(el1.querySelector('pre code')).not.toBeNull();
    // rerenderReadingModePanes fired — will trigger second invocation.
    expect(rerenderSpy).toHaveBeenCalledTimes(1);
    expect(rerenderSpy.mock.calls[0]?.[1]).toBe(FILE_PATH);

    // Simulate second invocation triggered by rerenderReadingModePanes.
    // metadataCache now has lc-language (frontmatter indexed after the
    // processFrontMatter write from repair).
    metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });
    // Reset spies — second invocation should NOT call migrate/repair (Set guard).
    vi.clearAllMocks();

    const el2 = makeHost();
    const ctx2 = makeCtx(FILE_PATH, V13_SECTION);
    await processor(FRESH_V13_FENCE_BODY, el2, ctx2);

    // Second invocation: Set.has(path)=true → short-circuits → addChild fires.
    expect(ctx2.addChild).toHaveBeenCalledTimes(1);
    // migrate and repair were NOT called (attempt-once gate preserved R10 fix).
    expect(migrateSpy).not.toHaveBeenCalled();
    expect(repairSpy).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // R6-C: delete-and-reopen workaround path — Set.has=true skips migrate/repair
  // and goes directly to addChild. This is the pre-fix workaround that proved
  // the bug was in the first-invocation path.
  // ──────────────────────────────────────────────────────────────────────────
  it('R6-C: Set already has path (simulates delete+reopen workaround) → addChild fires without calling migrate/repair', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'python3',
    };

    const { processor, clearAllAttempted } = await getProcessor(plugin, settings);
    clearAllAttempted?.();

    // Pre-populate the Set by doing a first invocation (migrate=false, repair=false).
    migrateSpy.mockResolvedValue(false);
    repairSpy.mockResolvedValue(false);
    await processor(FRESH_V13_FENCE_BODY, makeHost(), makeCtx(FILE_PATH, V13_SECTION));
    vi.clearAllMocks();

    // Second invocation with Set already populated.
    const el = makeHost();
    const ctx = makeCtx(FILE_PATH, V13_SECTION);
    await processor(FRESH_V13_FENCE_BODY, el, ctx);

    // Widget mounts — migrate/repair were NOT called (Set.has=true short-circuit).
    expect(ctx.addChild).toHaveBeenCalledTimes(1);
    expect(migrateSpy).not.toHaveBeenCalled();
    expect(repairSpy).not.toHaveBeenCalled();
  });
});
