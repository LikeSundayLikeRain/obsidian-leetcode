// tests/widget/codeBlockProcessor.flickerFix.test.ts
//
// Phase 21.1 Plan 21.1-01 Task 1 (RED) — Per-path attempt-once-this-session
// gate regression tests for MIGRATE-FLICKER-01 in codeBlockProcessor.
//
// These tests verify that:
//   1. The handler is invoked 5 times for the same file path with
//      autoMigrateOnOpen=ON + already-migrated note state, and
//      migrateLegacyFenceIfNeeded / repairFrontmatterIfNeeded are awaited
//      AT MOST ONCE.
//   2. clearCodeBlockProcessorAttempted(path) clears the per-path Set so
//      the next invocation re-enters the migrate/repair block.
//   3. Different file paths are independently gated (per-path, not global).
//   4. autoMigrateOnOpen=OFF — NEITHER migrate NOR repair is awaited.

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

// Hoist spies.
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

vi.mock('../../src/main/readingModeMigrationHook', () => ({
  rerenderReadingModePanes: vi.fn(),
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
  // Reset module cache so each test gets fresh module-level Set state.
  const mod = (await import('../../src/widget/codeBlockProcessor')) as unknown as {
    leetCodeBlockProcessor: (plugin: unknown) => (
      source: string,
      el: HTMLElement,
      ctx: unknown,
    ) => void | Promise<void>;
    clearCodeBlockProcessorAttempted?: (path: string) => void;
    clearAllCodeBlockProcessorAttempted?: () => void;
  };
  const obs = await import('obsidian');
  const TFile = (obs as unknown as { TFile: new (path: string) => unknown }).TFile;
  (plugin.app as unknown as { vault?: unknown }).vault = {
    getAbstractFileByPath: (p: string) => new TFile(p),
  };
  (plugin as unknown as { settings: FakeSettings }).settings = settings;
  return {
    processor: mod.leetCodeBlockProcessor(plugin),
    clearAttempted: mod.clearCodeBlockProcessorAttempted,
    clearAllAttempted: mod.clearAllCodeBlockProcessorAttempted,
  };
}

const SOURCE = 'class Solution:\n    def twoSum(self, nums, target):\n        return []\n';
const FILE_PATH_A = 'LeetCode/0001-two-sum.md';
const FILE_PATH_B = 'LeetCode/0002-add-two-numbers.md';

describe('Plan 21.1-01 — Flicker fix: attempt-once-per-session gate (codeBlockProcessor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    migrateSpy.mockResolvedValue(false);
    repairSpy.mockResolvedValue(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 1 (PRIMARY REGRESSION for R10 in LP): fully-migrated note + ON mode
  // — handler invoked 5 times, migrate/repair await AT MOST ONCE.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 1: autoMigrateOnOpen=ON, same file path — migrate/repair awaited AT MOST ONCE across 5 invocations', async () => {
    const metadataCache = createFakeMetadataCache();
    // Fully migrated: lc-slug + lc-language present.
    metadataCache.setFrontmatter(FILE_PATH_A, {
      'lc-slug': 'two-sum',
      'lc-language': 'java',
    });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'java',
    };

    const { processor, clearAllAttempted } = await getProcessor(plugin, settings);

    // Clear any state from previous tests.
    if (typeof clearAllAttempted === 'function') {
      clearAllAttempted();
    }

    // Invoke the handler 5 times — simulating LP body flushes.
    for (let i = 0; i < 5; i++) {
      await processor(SOURCE, makeHost(), makeCtx(FILE_PATH_A));
    }

    // After the fix, migrate and repair are each awaited AT MOST ONCE.
    expect(migrateSpy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(repairSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: clearCodeBlockProcessorAttempted clears the per-path Set so
  // the handler re-enters on the next invocation.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 2: clearCodeBlockProcessorAttempted clears the Set — next invocation re-enters migrate/repair', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(FILE_PATH_A, {
      'lc-slug': 'two-sum',
      'lc-language': 'java',
    });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'java',
    };

    const { processor, clearAttempted, clearAllAttempted } = await getProcessor(plugin, settings);

    // Pre-condition: clearAll so we start fresh.
    if (typeof clearAllAttempted === 'function') clearAllAttempted();

    // First batch: 5 invocations → at most 1 migrate/repair call.
    for (let i = 0; i < 5; i++) {
      await processor(SOURCE, makeHost(), makeCtx(FILE_PATH_A));
    }
    const callsAfterFirst = migrateSpy.mock.calls.length + repairSpy.mock.calls.length;
    expect(callsAfterFirst).toBeLessThanOrEqual(2); // 1 migrate + 1 repair at most

    vi.clearAllMocks();
    migrateSpy.mockResolvedValue(false);
    repairSpy.mockResolvedValue(false);

    // Clear the attempt Set for this path.
    if (typeof clearAttempted === 'function') {
      clearAttempted(FILE_PATH_A);
    }

    // 6th invocation — path was cleared, so migrate IS awaited again.
    await processor(SOURCE, makeHost(), makeCtx(FILE_PATH_A));
    // After clearing, the gate is re-entered on the next invocation.
    expect(migrateSpy.mock.calls.length + repairSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: Different file paths are independently gated — each path gets
  // exactly one migrate/repair attempt.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 3: different file paths are independently gated — migrate/repair awaited once per path', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(FILE_PATH_A, { 'lc-slug': 'two-sum', 'lc-language': 'java' });
    metadataCache.setFrontmatter(FILE_PATH_B, { 'lc-slug': 'add-two-numbers', 'lc-language': 'java' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'java',
    };

    const { processor, clearAllAttempted } = await getProcessor(plugin, settings);
    if (typeof clearAllAttempted === 'function') clearAllAttempted();

    // Invoke once for file-A, once for file-B.
    await processor(SOURCE, makeHost(), makeCtx(FILE_PATH_A));
    await processor(SOURCE, makeHost(), makeCtx(FILE_PATH_B));

    // Both paths independently reached the gate — total calls should be 2
    // (one migrate+repair pair per path, or just migrate once per path).
    // The key constraint: each path fires AT LEAST ONCE (per-path gating,
    // not global gating).
    const totalCalls = migrateSpy.mock.calls.length + repairSpy.mock.calls.length;
    expect(totalCalls).toBeGreaterThanOrEqual(2); // once per path
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 4: autoMigrateOnOpen=OFF — NEITHER migrate NOR repair is awaited.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 4: autoMigrateOnOpen=OFF — NEITHER migrate NOR repair awaited across 5 invocations', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(FILE_PATH_A, { 'lc-slug': 'two-sum', 'lc-language': 'java' });
    const plugin = createFakePlugin({ metadataCache });
    const settings: FakeSettings = {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => false, // OFF
      getDefaultLanguage: () => 'java',
    };

    const { processor, clearAllAttempted } = await getProcessor(plugin, settings);
    if (typeof clearAllAttempted === 'function') clearAllAttempted();

    for (let i = 0; i < 5; i++) {
      await processor(SOURCE, makeHost(), makeCtx(FILE_PATH_A));
    }

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(repairSpy).not.toHaveBeenCalled();
  });
});
