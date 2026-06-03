// tests/widget/liveModeBannerStateField.flickerFix.test.ts
//
// Phase 21.1 Plan 21.1-01 Task 1 (RED) — Per-path attempt-once-this-session
// gate regression tests for MIGRATE-FLICKER-01.
//
// These tests verify that:
//   1. A fully-migrated v1.3 note (lc-language present, leetcode-solve fence)
//      does NOT call migrateLegacyFenceIfNeeded at all across 5 docChanges
//      (the legacy branch short-circuits at fence.kind !== 'legacy').
//   2. A v1.3 note with lc-language MISSING (repair candidate) calls
//      repairFrontmatterIfNeeded EXACTLY ONCE across 5 docChanges — even
//      after the in-flight Set's .finally() clears.
//   3. A v1.2-shaped note calls migrateLegacyFenceIfNeeded EXACTLY ONCE
//      across 5 docChanges.
//   4. Clearing the repairAttempted Set (simulating a rename) re-enables
//      a 6th call to repairFrontmatterIfNeeded.
//   5. An annotation-only refresh transaction does NOT re-fire migrate/repair
//      when the attempt Set already contains the path.
//   6. autoMigrateOnOpen=OFF is unchanged — NEITHER migrate NOR repair fires.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Wire the obsidian shim to provide editorInfoField as a real CM6 StateField.
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  // eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer
  const cm = await import('@codemirror/state');
  const editorInfoField = cm.StateField.define<{ file: { path: string } | null }>({
    create: () => ({ file: { path: 'LeetCode/0001-two-sum.md' } }),
    update: (v) => v,
  });
  return { ...actual, editorInfoField };
});

// Hoist spies so vi.mock factories can capture them.
const { migrateLegacyFenceSpy, repairFrontmatterSpy } = vi.hoisted(() => ({
  migrateLegacyFenceSpy: vi.fn(async () => false),
  repairFrontmatterSpy: vi.fn(async () => false),
}));

vi.mock('../../src/widget/fenceMigrator', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/widget/fenceMigrator')
  >('../../src/widget/fenceMigrator');
  return {
    ...actual,
    migrateLegacyFenceIfNeeded: migrateLegacyFenceSpy,
    repairFrontmatterIfNeeded: repairFrontmatterSpy,
  };
});

import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian
import { EditorState } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian
import { EditorView } from '@codemirror/view';

import { leetCodeFenceViewPlugin } from '../../src/widget/liveModeViewPlugin';
import {
  leetCodeWidgetStateField,
  leetcodeRefreshAnnotation,
} from '../../src/widget/liveModeBannerStateField';

const FILE_PATH = 'LeetCode/0001-two-sum.md';

// Fully-migrated v1.3 note — lc-language present, leetcode-solve fence.
const NOTE_V13_MIGRATED = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'class Solution {',
  '    public int[] twoSum(int[] nums, int target) {',
  '        return new int[0];',
  '    }',
  '}',
  '```',
  '',
].join('\n');

// v1.3 note with lc-language MISSING — asymmetric repair candidate.
const NOTE_V13_MISSING_LANG = [
  '---',
  'lc-slug: two-sum',
  '---',
  '',
  '## Code',
  '',
  '```leetcode-solve',
  'class Solution:',
  '    def twoSum(self, nums, target):',
  '        return []',
  '```',
  '',
].join('\n');

// v1.2-shaped note — langSlug fence + lc-slug present + lc-language present.
const NOTE_V12_LEGACY = [
  '---',
  'lc-slug: two-sum',
  'lc-language: java',
  '---',
  '',
  '## Code',
  '',
  '```java',
  'class Solution {',
  '    public int[] twoSum(int[] nums, int target) {',
  '        return new int[0];',
  '    }',
  '}',
  '```',
  '',
].join('\n');

interface PluginShape {
  app: { metadataCache: ReturnType<typeof createFakeMetadataCache> };
  settings: {
    getUseInlineWidget: () => boolean;
    getAutoMigrateOnOpen: () => boolean;
    getDefaultLanguage: () => string;
  };
  migrateInFlight: Set<string>;
  repairInFlight?: Set<string>;
  migrateAttempted?: Set<string>;
  repairAttempted?: Set<string>;
  widgetRegistry: { values(): Iterable<unknown> };
}

function makePlugin(opts: {
  fmPath?: string;
  fm?: Record<string, unknown> | null;
  useInlineWidget?: boolean;
  autoMigrateOnOpen?: boolean;
  withAttemptedSets?: boolean;
} = {}): PluginShape {
  const metadataCache = createFakeMetadataCache();
  if (opts.fm !== null) {
    metadataCache.setFrontmatter(
      opts.fmPath ?? FILE_PATH,
      opts.fm ?? { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    );
  }
  const fakePlugin = createFakePlugin({ metadataCache });
  const plugin: PluginShape = {
    app: fakePlugin.app as never,
    settings: {
      getUseInlineWidget: () => opts.useInlineWidget ?? true,
      getAutoMigrateOnOpen: () => opts.autoMigrateOnOpen ?? true,
      getDefaultLanguage: () => 'python3',
    },
    migrateInFlight: new Set<string>(),
    repairInFlight: new Set<string>(),
    widgetRegistry: { values: () => [] },
  };
  // Attach attempt Sets only when the GREEN implementation adds them.
  // For RED tests, these are absent (or present to simulate lifecycle).
  if (opts.withAttemptedSets) {
    plugin.migrateAttempted = new Set<string>();
    plugin.repairAttempted = new Set<string>();
  }
  return plugin;
}

async function flushMicrotasks(): Promise<void> {
  // Flush enough ticks to pump .then → .catch → .finally chain.
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/**
 * Apply N successive single-character insert transactions to the state,
 * flushing microtasks after each so async side-effects can resolve.
 * Returns the final state.
 *
 * Insert at the END of the document (before the final newline) so that
 * the fence structure (opener line = 'leetcode-solve') is never disrupted
 * by the inserts. Disrupting the opener would prevent findCodeFence from
 * matching and cause the StateField to return Decoration.none early,
 * bypassing the repair side-effect entirely.
 */
async function applyNDocChanges(
  initialState: EditorState,
  n: number,
): Promise<EditorState> {
  let state = initialState;
  for (let i = 0; i < n; i++) {
    // Insert at end of doc (doc.length - 1 keeps the trailing newline intact)
    const insertPos = Math.max(0, state.doc.length - 1);
    const tr = state.update({
      changes: { from: insertPos, insert: 'x' },
    });
    state = tr.state;
    await flushMicrotasks();
  }
  return state;
}

describe('Plan 21.1-01 — Flicker fix: attempt-once-per-session gate (liveModeBannerStateField)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    migrateLegacyFenceSpy.mockResolvedValue(false);
    repairFrontmatterSpy.mockResolvedValue(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: Fully-migrated v1.3 note — migrateLegacyFenceIfNeeded is NEVER
  // called because fence.kind !== 'legacy' exits the legacy-banner branch
  // before the migrate side-effect. This holds before AND after the fix.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 1: fully-migrated v1.3 note — migrateLegacyFenceIfNeeded called 0 times across 5 docChanges', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      withAttemptedSets: true,
    });
    const { editorInfoField } = await import('obsidian');
    const initialState = EditorState.create({
      doc: NOTE_V13_MIGRATED,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    await applyNDocChanges(initialState, 5);

    // For a fully-migrated note the legacy branch returns early (fence.kind !== 'legacy').
    expect(migrateLegacyFenceSpy).toHaveBeenCalledTimes(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2 (PRIMARY REGRESSION for R10): v1.3 note with lc-language MISSING
  // → repairFrontmatterIfNeeded called EXACTLY ONCE across 5 docChanges.
  // Pre-fix: called up to 5 times (once per docChange after .finally clears).
  // Post-fix: called exactly once (attempt Set prevents re-entry).
  // ────────────────────────────────────────────────────────────────────────
  it('Test 2: v1.3 note with lc-language MISSING — repairFrontmatterIfNeeded called EXACTLY ONCE across 5 docChanges', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum' }, // lc-language intentionally absent
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      withAttemptedSets: true,
    });
    // repair resolves true (simulates successful injection)
    repairFrontmatterSpy.mockResolvedValue(true);

    const { editorInfoField } = await import('obsidian');
    const initialState = EditorState.create({
      doc: NOTE_V13_MISSING_LANG,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    await applyNDocChanges(initialState, 5);

    // The attempt Set gate must prevent re-firing after the first attempt.
    expect(repairFrontmatterSpy).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: v1.2-shaped note (legacy fence) — migrateLegacyFenceIfNeeded
  // called EXACTLY ONCE across 5 docChanges.
  // Pre-fix: called multiple times (once per docChange after .finally clears).
  // Post-fix: called exactly once (migrateAttempted Set prevents re-entry).
  // ────────────────────────────────────────────────────────────────────────
  it('Test 3: v1.2 legacy note — migrateLegacyFenceIfNeeded called EXACTLY ONCE across 5 docChanges', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      withAttemptedSets: true,
    });

    const { editorInfoField } = await import('obsidian');
    const initialState = EditorState.create({
      doc: NOTE_V12_LEGACY,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    await applyNDocChanges(initialState, 5);

    expect(migrateLegacyFenceSpy).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 4: Clearing repairAttempted (simulating rename) re-enables repair
  // on the next docChange.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 4: clearing repairAttempted re-enables repair on the next docChange', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum' }, // lc-language intentionally absent
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      withAttemptedSets: true,
    });
    repairFrontmatterSpy.mockResolvedValue(true);

    const { editorInfoField } = await import('obsidian');
    let state = EditorState.create({
      doc: NOTE_V13_MISSING_LANG,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    // First pass: 5 docChanges → exactly 1 call.
    state = await applyNDocChanges(state, 5);
    expect(repairFrontmatterSpy).toHaveBeenCalledTimes(1);

    // Drain all pending microtasks fully (ensure .finally() clears repairInFlight).
    for (let i = 0; i < 20; i++) await Promise.resolve();

    // Simulate rename clearing the attempt Set for this path.
    plugin.repairAttempted?.delete(FILE_PATH);
    // Also clear repairInFlight in case the first round left it populated
    // (the .finally() chain may still be pending — clear explicitly to
    // simulate the post-rename state where the path is fully reset).
    plugin.repairInFlight?.delete(FILE_PATH);
    vi.clearAllMocks();
    repairFrontmatterSpy.mockResolvedValue(true);

    // 6th transaction — both attempt Set AND in-flight Set were cleared,
    // so repair IS called again.
    const insertPos6 = Math.max(0, state.doc.length - 1);
    const tr = state.update({
      changes: { from: insertPos6, insert: 'y' },
    });
    state = tr.state;
    await flushMicrotasks();

    expect(repairFrontmatterSpy).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 5: Annotation-only refresh transaction does NOT re-fire migrate/repair
  // when the attempt Set already contains the path.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 5: annotation-only refresh does NOT re-fire migrate/repair when attempt Set already populated', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum' }, // lc-language intentionally absent
      useInlineWidget: true,
      autoMigrateOnOpen: true,
      withAttemptedSets: true,
    });
    repairFrontmatterSpy.mockResolvedValue(false);

    const { editorInfoField } = await import('obsidian');
    let state = EditorState.create({
      doc: NOTE_V13_MISSING_LANG,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    // One docChange to fire the first (and only) repair attempt.
    const tr1 = state.update({
      changes: { from: Math.max(0, state.doc.length - 1), insert: 'x' },
    });
    state = tr1.state;
    await flushMicrotasks();

    // The attempt Set now contains FILE_PATH.
    const callCountAfterFirst = repairFrontmatterSpy.mock.calls.length;
    expect(callCountAfterFirst).toBeLessThanOrEqual(1);

    vi.clearAllMocks();
    repairFrontmatterSpy.mockResolvedValue(false);

    // Dispatch an annotation-only transaction (no doc change).
    const tr2 = state.update({
      annotations: [leetcodeRefreshAnnotation.of(true)],
    });
    state = tr2.state;
    expect(tr2.docChanged).toBe(false);
    await flushMicrotasks();

    // Annotation-driven recompute must NOT re-fire the side-effect.
    expect(repairFrontmatterSpy).not.toHaveBeenCalled();
    expect(migrateLegacyFenceSpy).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 6: autoMigrateOnOpen=OFF — NEITHER migrate NOR repair fires.
  // This is a regression sentinel: the fix must not change OFF behavior.
  // ────────────────────────────────────────────────────────────────────────
  it('Test 6: autoMigrateOnOpen=OFF — NEITHER migrate NOR repair called across 5 docChanges', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum', 'lc-language': 'java' },
      useInlineWidget: true,
      autoMigrateOnOpen: false, // OFF
      withAttemptedSets: true,
    });

    const { editorInfoField } = await import('obsidian');
    const initialState = EditorState.create({
      doc: NOTE_V13_MIGRATED,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    await applyNDocChanges(initialState, 5);

    expect(migrateLegacyFenceSpy).not.toHaveBeenCalled();
    expect(repairFrontmatterSpy).not.toHaveBeenCalled();
  });
});
