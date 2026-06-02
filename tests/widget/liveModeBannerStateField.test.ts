// tests/widget/liveModeBannerStateField.test.ts
//
// Phase 21 Plan 21-11 Task 2 (RED) — StateField hosts the legacy banner +
// v1.3 widget Decoration.replace so the multi-line span no longer violates
// CM6's contract that line-break-spanning Decoration.replace must be
// supplied via a StateField, not a ViewPlugin.
//
// Tests asserted (TDD behavior block, plan 21-11 lines 110-121):
//   1. Multi-line legacy fence: legacyBannerStateField mounts the
//      AutoMigratingBannerWidget without throwing the CM6 RangeError
//      'Decorations that replace line breaks may not be specified via
//      plugins'. (Bug repro from UAT Test 4b.)
//   2. Multi-line legacy fence with autoMigrateOnOpen=OFF: the
//      manual-prompt banner mounts without RangeError.
//   3. v1.3 fence: leetCodeWidgetStateField contributes its
//      Decoration.replace; LeetCodeFenceWidget mounts.
//   4. atomicRanges Facet still includes the leetcode-solve range AND
//      the legacy fence range.
//   5. StateField recomputes on docChanged (migration rewrites legacy
//      opener → leetcode-solve; banner unmounts, widget mounts).
//   6. StateField rebuilds when the doc replaces with a non-LC note
//      (no lc-slug); RangeSet collapses to empty.
//   7. Header-marker lock test (scope = "fix both" per Task 1):
//      - file's first non-empty line MUST NOT contain
//        PHASE_22_DELETE_WITH_V1_2_PATH (mixed module);
//      - the line block immediately preceding `export const
//        legacyBannerStateField` MUST contain the marker;
//      - the line block immediately preceding `export const
//        leetCodeWidgetStateField` MUST NOT contain the marker.
//
// CM6 + obsidian module mocks reuse the atomicRanges.test.ts pattern:
// real @codemirror/state + @codemirror/view; obsidian's editorInfoField
// is replaced with a StateField that returns {file: {path}} so the
// build helpers can read the active file at update time.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// Plan 21-14 — mock fenceMigrator so the post-repair fire-and-forget chain
// is observable without invoking the real processFrontMatter write. R2.LP
// tests below override `migrateLegacyFenceIfNeeded` and
// `repairFrontmatterIfNeeded` per-test via vi.mocked(...).mockResolvedValue.
const { migrateLegacyFenceSpy, repairFrontmatterSpy } = vi.hoisted(() => ({
  migrateLegacyFenceSpy: vi.fn(async () => false),
  repairFrontmatterSpy: vi.fn(async () => false),
}));

vi.mock('../../src/widget/fenceMigrator', async () => {
  // Preserve real exports for the helpers (isMigrationCandidate etc.) we
  // don't override; only stub the two async writers.
  const actual = await vi.importActual<
    typeof import('../../src/widget/fenceMigrator')
  >('../../src/widget/fenceMigrator');
  return {
    ...actual,
    migrateLegacyFenceIfNeeded: migrateLegacyFenceSpy,
    repairFrontmatterIfNeeded: repairFrontmatterSpy,
  };
});

// Stub child editor mocking surfaces — the LeetCodeFenceWidget toDOM
// path eventually calls into mountLeetCodeWidget which wires up an
// embedded EditorView. We do not exercise that DOM here; the StateField
// only needs to *build* the Decoration.replace ranges. Because we never
// mount an EditorView with a parent (we only call EditorState.create
// and inspect facets), the widget's toDOM is never invoked.

import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian
import { EditorState } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian
import { EditorView, Decoration } from '@codemirror/view';

import { leetCodeFenceViewPlugin } from '../../src/widget/liveModeViewPlugin';
import {
  legacyBannerStateField,
  leetCodeWidgetStateField,
  leetcodeRefreshAnnotation,
} from '../../src/widget/liveModeBannerStateField';

const FILE_PATH = 'LeetCode/0001-two-sum.md';

const NOTE_WITH_LEGACY_FENCE = [
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

const NOTE_WITH_LC_SOLVE_FENCE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
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

const NOTE_WITHOUT_LC_SLUG = [
  '---',
  'tags: [scratch]',
  '---',
  '',
  '# Random note',
  '',
  'No fences here.',
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
  widgetRegistry: { values(): Iterable<unknown> };
}

function makePlugin(opts: {
  fmPath?: string;
  fm?: Record<string, unknown> | null;
  useInlineWidget?: boolean;
  autoMigrateOnOpen?: boolean;
} = {}): PluginShape {
  const metadataCache = createFakeMetadataCache();
  if (opts.fm !== null) {
    metadataCache.setFrontmatter(
      opts.fmPath ?? FILE_PATH,
      opts.fm ?? { 'lc-slug': 'two-sum', 'lc-language': 'java' },
    );
  }
  const fakePlugin = createFakePlugin({ metadataCache });
  return {
    app: fakePlugin.app as never,
    settings: {
      getUseInlineWidget: () => opts.useInlineWidget ?? true,
      getAutoMigrateOnOpen: () => opts.autoMigrateOnOpen ?? true,
      getDefaultLanguage: () => 'python3',
    },
    migrateInFlight: new Set<string>(),
    widgetRegistry: { values: () => [] },
  };
}

describe('Plan 21-11 Task 2 — legacyBannerStateField + leetCodeWidgetStateField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1 — Multi-line legacy fence + autoMigrateOnOpen=ON: no RangeError.
  // ─────────────────────────────────────────────────────────────────────────
  it('multi-line legacy fence with autoMigrateOnOpen=ON: StateField mounts AutoMigratingBannerWidget without CM6 RangeError', async () => {
    const plugin = makePlugin({ useInlineWidget: true, autoMigrateOnOpen: true });
    const { editorInfoField } = await import('obsidian');
    expect(() => {
      EditorState.create({
        doc: NOTE_WITH_LEGACY_FENCE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });
    }).not.toThrow();
    // The decoration set provided via legacyBannerStateField must contain
    // a single Decoration.replace covering the legacy fence range. We can
    // observe this by reading the StateField off the constructed state.
    const state = EditorState.create({
      doc: NOTE_WITH_LEGACY_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    const decos = state.field(legacyBannerStateField, false);
    expect(decos).toBeDefined();
    let found = 0;
    decos!.between(0, state.doc.length, () => {
      found++;
    });
    expect(found).toBeGreaterThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2 — Multi-line legacy fence + autoMigrateOnOpen=OFF: no RangeError.
  // The manual-prompt banner mounts as a Decoration.replace from the legacy
  // banner StateField.
  // ─────────────────────────────────────────────────────────────────────────
  it('multi-line legacy fence with autoMigrateOnOpen=OFF: StateField builds without CM6 RangeError', async () => {
    const plugin = makePlugin({ useInlineWidget: true, autoMigrateOnOpen: false });
    const { editorInfoField } = await import('obsidian');
    expect(() => {
      EditorState.create({
        doc: NOTE_WITH_LEGACY_FENCE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });
    }).not.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3 — v1.3 fence still mounts.
  // ─────────────────────────────────────────────────────────────────────────
  it('multi-line leetcode-solve fence: leetCodeWidgetStateField contributes a Decoration.replace covering the fence range', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { editorInfoField } = await import('obsidian');
    const state = EditorState.create({
      doc: NOTE_WITH_LC_SOLVE_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    const widgetDecos = state.field(leetCodeWidgetStateField, false);
    expect(widgetDecos).toBeDefined();
    let found = 0;
    widgetDecos!.between(0, state.doc.length, () => {
      found++;
    });
    expect(found).toBeGreaterThanOrEqual(1);
    // And the legacy StateField returns the empty set on a v1.3 note.
    const legacyDecos = state.field(legacyBannerStateField, false);
    expect(legacyDecos).toBeDefined();
    let legacyFound = 0;
    legacyDecos!.between(0, state.doc.length, () => {
      legacyFound++;
    });
    expect(legacyFound).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4 — atomicRanges contribution still covers the leetcode-solve range.
  // ─────────────────────────────────────────────────────────────────────────
  it('atomicRanges Facet contains the leetCodeWidgetStateField contribution for v1.3 fences', async () => {
    const plugin = makePlugin({
      fm: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
    });
    const { editorInfoField } = await import('obsidian');
    const state = EditorState.create({
      doc: NOTE_WITH_LC_SOLVE_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    const facetEntries = state.facet(EditorView.atomicRanges);
    expect(Array.isArray(facetEntries)).toBe(true);
    expect(facetEntries.length).toBeGreaterThanOrEqual(2); // legacy + widget StateField each contribute
    expect(facetEntries.every((f) => typeof f === 'function')).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5 — atomicRanges contribution covers the legacy fence range too.
  // ─────────────────────────────────────────────────────────────────────────
  it('atomicRanges Facet contains the legacyBannerStateField contribution for legacy fences', async () => {
    const plugin = makePlugin({ useInlineWidget: true, autoMigrateOnOpen: true });
    const { editorInfoField } = await import('obsidian');
    const state = EditorState.create({
      doc: NOTE_WITH_LEGACY_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    const facetEntries = state.facet(EditorView.atomicRanges);
    expect(facetEntries.length).toBeGreaterThanOrEqual(2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6 — StateField recomputes on docChanged. Replace legacy doc with a
  // leetcode-solve doc; legacy StateField becomes empty, widget StateField
  // gets a range.
  // ─────────────────────────────────────────────────────────────────────────
  it('StateField recomputes on docChanged: legacy → leetcode-solve fence transition', async () => {
    const plugin = makePlugin({ useInlineWidget: true, autoMigrateOnOpen: true });
    const { editorInfoField } = await import('obsidian');
    let state = EditorState.create({
      doc: NOTE_WITH_LEGACY_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    // Pre-state: legacy StateField has at least one range; widget has none.
    let legacyCount = 0;
    state.field(legacyBannerStateField, false)!.between(0, state.doc.length, () => {
      legacyCount++;
    });
    expect(legacyCount).toBeGreaterThanOrEqual(1);

    // Re-seed metadata for the new note (lc-language=python3) so the v1.3
    // gate matches.
    plugin.app.metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });

    // Apply a docChange replacing the entire doc with the leetcode-solve note.
    const tr = state.update({
      changes: { from: 0, to: state.doc.length, insert: NOTE_WITH_LC_SOLVE_FENCE },
    });
    state = tr.state;

    let widgetCount = 0;
    state.field(leetCodeWidgetStateField, false)!.between(0, state.doc.length, () => {
      widgetCount++;
    });
    expect(widgetCount).toBeGreaterThanOrEqual(1);

    let legacyCountAfter = 0;
    state.field(legacyBannerStateField, false)!.between(0, state.doc.length, () => {
      legacyCountAfter++;
    });
    expect(legacyCountAfter).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7 — StateField collapses to empty when doc replaces with a non-LC note.
  // ─────────────────────────────────────────────────────────────────────────
  it('StateField collapses to empty when doc replaces with a non-LC note (no lc-slug)', async () => {
    const plugin = makePlugin({ useInlineWidget: true, autoMigrateOnOpen: true });
    const { editorInfoField } = await import('obsidian');
    let state = EditorState.create({
      doc: NOTE_WITH_LEGACY_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    // Drop frontmatter from the metadata cache so the lc-slug gate fails.
    plugin.app.metadataCache.setFrontmatter(FILE_PATH, null);
    const tr = state.update({
      changes: { from: 0, to: state.doc.length, insert: NOTE_WITHOUT_LC_SLUG },
    });
    state = tr.state;

    let legacyCount = 0;
    state.field(legacyBannerStateField, false)!.between(0, state.doc.length, () => {
      legacyCount++;
    });
    let widgetCount = 0;
    state.field(leetCodeWidgetStateField, false)!.between(0, state.doc.length, () => {
      widgetCount++;
    });
    expect(legacyCount).toBe(0);
    expect(widgetCount).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 8 — Header-marker lock test (scope = "fix both" per Task 1).
  // ─────────────────────────────────────────────────────────────────────────
  it('PHASE_22_DELETE_WITH_V1_2_PATH marker placement: file-wide marker absent; legacy export preceded by marker; v1.3 export NOT preceded by marker', () => {
    const repoRoot = join(__dirname, '..', '..');
    const stateFieldFile = join(
      repoRoot,
      'src',
      'widget',
      'liveModeBannerStateField.ts',
    );
    const text = readFileSync(stateFieldFile, 'utf-8');
    const lines = text.split(/\r?\n/);

    // (a) First non-empty line must NOT contain the marker.
    const firstNonEmpty = lines.find((l) => l.trim() !== '') ?? '';
    expect(firstNonEmpty).not.toMatch(/PHASE_22_DELETE_WITH_V1_2_PATH/);

    // (b) Block immediately preceding `export const legacyBannerStateField`
    //     must contain the marker.
    const legacyExportIdx = lines.findIndex((l) =>
      /export\s+(const|function)\s+legacyBannerStateField\b/.test(l),
    );
    expect(legacyExportIdx).toBeGreaterThan(0);
    // Walk upward through contiguous comment lines (// ... or /* ... */)
    // and assert the marker appears in that contiguous block.
    let i = legacyExportIdx - 1;
    let blockText = '';
    while (i >= 0) {
      const line = lines[i];
      if (line === undefined) break;
      const trimmed = line.trim();
      if (trimmed === '' && blockText !== '') break;
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        blockText = line + '\n' + blockText;
        i--;
        continue;
      }
      // Skip blank lines BEFORE we've found any comment line.
      if (trimmed === '') {
        i--;
        continue;
      }
      break;
    }
    expect(blockText).toMatch(/PHASE_22_DELETE_WITH_V1_2_PATH/);

    // (c) Block immediately preceding `export const leetCodeWidgetStateField`
    //     must NOT contain the marker.
    const widgetExportIdx = lines.findIndex((l) =>
      /export\s+(const|function)\s+leetCodeWidgetStateField\b/.test(l),
    );
    expect(widgetExportIdx).toBeGreaterThan(0);
    let j = widgetExportIdx - 1;
    let widgetBlockText = '';
    while (j >= 0) {
      const line = lines[j];
      if (line === undefined) break;
      const trimmed = line.trim();
      if (trimmed === '' && widgetBlockText !== '') break;
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        widgetBlockText = line + '\n' + widgetBlockText;
        j--;
        continue;
      }
      if (trimmed === '') {
        j--;
        continue;
      }
      break;
    }
    expect(widgetBlockText).not.toMatch(/PHASE_22_DELETE_WITH_V1_2_PATH/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 9 — Decoration.none sentinel never throws when the state lacks the
  // gate inputs (defensive: `state.field(legacyBannerStateField, false)`
  // returns a usable RangeSet).
  // ─────────────────────────────────────────────────────────────────────────
  it('legacyBannerStateField returns Decoration.none for a non-LC doc', async () => {
    const plugin = makePlugin({ fm: null });
    const { editorInfoField } = await import('obsidian');
    const state = EditorState.create({
      doc: NOTE_WITHOUT_LC_SLUG,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });
    const decos = state.field(legacyBannerStateField, false);
    expect(decos).toBeDefined();
    expect(decos === Decoration.none || decos!.size === 0).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Plan 21-14 — R2 (UAT re-test gap closure): post-repair StateField
  // recompute. After repairFrontmatterIfNeeded resolves with `repaired ===
  // true`, dispatch a sentinel annotation against each EditorView leaf for
  // the file path so the leetCodeWidgetStateField recomputes against the
  // post-repair frontmatter on the SAME open — without requiring docChange.
  // ───────────────────────────────────────────────────────────────────────
  describe('R2 — post-repair StateField recompute (Plan 21-14)', () => {
    const NOTE_MISSING_LC_LANGUAGE = [
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

    beforeEach(() => {
      migrateLegacyFenceSpy.mockReset();
      repairFrontmatterSpy.mockReset();
      migrateLegacyFenceSpy.mockResolvedValue(false);
      repairFrontmatterSpy.mockResolvedValue(false);
    });

    async function flushMicrotasks(): Promise<void> {
      // Flush enough ticks to pump .then → .catch → .finally chain.
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }

    // Test R2.LP.1
    it('leetcodeRefreshAnnotation is exported and is a CM6 Annotation', () => {
      expect(leetcodeRefreshAnnotation).toBeDefined();
      expect(typeof leetcodeRefreshAnnotation.of).toBe('function');
      // Annotations expose `.of(value)` returning an opaque Annotation
      // object that StateField update can read via tr.annotation(...).
      const ann = leetcodeRefreshAnnotation.of(true);
      expect(ann).toBeDefined();
    });

    // Test R2.LP.2
    it('leetCodeWidgetStateField recomputes on a transaction carrying leetcodeRefreshAnnotation even when tr.docChanged is false', async () => {
      const plugin = makePlugin({
        fm: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      });
      const { editorInfoField } = await import('obsidian');
      const state = EditorState.create({
        doc: NOTE_WITH_LC_SOLVE_FENCE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });

      // Initial widget StateField — should already contain a range.
      const initialDecos = state.field(leetCodeWidgetStateField, false);
      expect(initialDecos).toBeDefined();

      // Dispatch annotation-only transaction (NO doc change).
      const tr = state.update({
        annotations: [leetcodeRefreshAnnotation.of(true)],
      });
      const next = tr.state;
      expect(tr.docChanged).toBe(false);

      // The StateField recomputed — even though docChanged=false, the
      // sentinel annotation widened the predicate. The new DecorationSet
      // is a freshly built object (NOT referentially equal to the prior).
      const nextDecos = next.field(leetCodeWidgetStateField, false);
      expect(nextDecos).toBeDefined();
      // After recompute on the same fm, the range count is still >= 1.
      let found = 0;
      nextDecos!.between(0, next.doc.length, () => {
        found++;
      });
      expect(found).toBeGreaterThanOrEqual(1);
      // Referential check — recompute means the new value is a freshly
      // built RangeSet, NOT the cached `value` returned by the early-return
      // bail-out branch. CM6's RangeSet.empty is a sentinel; a fresh
      // Decoration.set(...) call returns a new instance.
      expect(nextDecos).not.toBe(initialDecos);
    });

    // Test R2.LP.3
    it('leetCodeWidgetStateField does NOT recompute on a doc-empty transaction WITHOUT the annotation (regression check)', async () => {
      const plugin = makePlugin({
        fm: { 'lc-slug': 'two-sum', 'lc-language': 'python3' },
      });
      const { editorInfoField } = await import('obsidian');
      const state = EditorState.create({
        doc: NOTE_WITH_LC_SOLVE_FENCE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });
      const initialDecos = state.field(leetCodeWidgetStateField, false);

      // Dispatch a doc-empty transaction with NO annotation.
      const tr = state.update({});
      const next = tr.state;
      expect(tr.docChanged).toBe(false);

      // The StateField bailed out — value is referentially equal.
      const nextDecos = next.field(leetCodeWidgetStateField, false);
      expect(nextDecos).toBe(initialDecos);
    });

    // Test R2.LP.4
    it('legacyBannerStateField also recomputes on the annotation (parity — both StateFields share the widened predicate)', async () => {
      const plugin = makePlugin({
        useInlineWidget: true,
        autoMigrateOnOpen: true,
      });
      const { editorInfoField } = await import('obsidian');
      const state = EditorState.create({
        doc: NOTE_WITH_LEGACY_FENCE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });
      const initialDecos = state.field(legacyBannerStateField, false);
      expect(initialDecos).toBeDefined();

      // Dispatch annotation-only transaction.
      const tr = state.update({
        annotations: [leetcodeRefreshAnnotation.of(true)],
      });
      const next = tr.state;
      expect(tr.docChanged).toBe(false);

      const nextDecos = next.field(legacyBannerStateField, false);
      // Recomputed (new RangeSet instance).
      expect(nextDecos).not.toBe(initialDecos);
      let found = 0;
      nextDecos!.between(0, next.doc.length, () => {
        found++;
      });
      expect(found).toBeGreaterThanOrEqual(1);
    });

    // Test R2.LP.5
    it('post-repair scheduled dispatch fires leetcodeRefreshAnnotation against each known EditorView for the file path', async () => {
      const plugin = makePlugin({
        fm: { 'lc-slug': 'two-sum' },
        useInlineWidget: true,
        autoMigrateOnOpen: true,
      });
      // Add repairInFlight Set + a workspace.getLeavesOfType returning
      // a matching + a non-matching fake leaf.
      const matchingDispatch = vi.fn();
      const otherDispatch = vi.fn();
      const matchingLeaf = {
        view: {
          file: { path: FILE_PATH },
          editor: { cm: { dispatch: matchingDispatch } },
        },
      };
      const otherLeaf = {
        view: {
          file: { path: 'LeetCode/other.md' },
          editor: { cm: { dispatch: otherDispatch } },
        },
      };
      (plugin as unknown as { repairInFlight: Set<string> }).repairInFlight =
        new Set<string>();
      const app = plugin.app as unknown as {
        workspace: { getLeavesOfType: (t: string) => unknown[] };
      };
      app.workspace = {
        ...((plugin.app as unknown as { workspace?: object }).workspace ??
          {}),
        getLeavesOfType: (t: string) =>
          t === 'markdown' ? [matchingLeaf, otherLeaf] : [],
      } as never;

      // repair resolves true → dispatch should fire on the matching leaf.
      repairFrontmatterSpy.mockResolvedValueOnce(true);

      const { editorInfoField } = await import('obsidian');
      EditorState.create({
        doc: NOTE_MISSING_LC_LANGUAGE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });

      await flushMicrotasks();

      // (a) repair was invoked.
      expect(repairFrontmatterSpy).toHaveBeenCalledTimes(1);
      // (b) matching EditorView received exactly one dispatch carrying the
      // sentinel annotation; non-matching leaf received zero.
      expect(matchingDispatch).toHaveBeenCalledTimes(1);
      expect(otherDispatch).not.toHaveBeenCalled();
      const firstCall = matchingDispatch.mock.calls[0] as
        | unknown[]
        | undefined;
      expect(firstCall).toBeDefined();
      const dispatchArg = (firstCall as unknown[])[0] as {
        annotations?: unknown;
        changes?: unknown;
      };
      // Inspect annotations — should be a single-element array containing
      // an Annotation produced by leetcodeRefreshAnnotation.of(true).
      expect(dispatchArg).toBeDefined();
      const anns = Array.isArray(dispatchArg.annotations)
        ? dispatchArg.annotations
        : [dispatchArg.annotations];
      expect(anns.length).toBe(1);
      // (c) repairInFlight was cleared via the .finally.
      const repairInFlight = (
        plugin as unknown as { repairInFlight: Set<string> }
      ).repairInFlight;
      expect(repairInFlight.has(FILE_PATH)).toBe(false);
    });

    // Test R2.LP.6
    it('post-repair scheduled dispatch is NOT fired when repairFrontmatterIfNeeded resolves false', async () => {
      const plugin = makePlugin({
        fm: { 'lc-slug': 'two-sum' },
        useInlineWidget: true,
        autoMigrateOnOpen: true,
      });
      const matchingDispatch = vi.fn();
      (plugin as unknown as { repairInFlight: Set<string> }).repairInFlight =
        new Set<string>();
      const app = plugin.app as unknown as {
        workspace: { getLeavesOfType: (t: string) => unknown[] };
      };
      app.workspace = {
        ...((plugin.app as unknown as { workspace?: object }).workspace ??
          {}),
        getLeavesOfType: (t: string) =>
          t === 'markdown'
            ? [
                {
                  view: {
                    file: { path: FILE_PATH },
                    editor: { cm: { dispatch: matchingDispatch } },
                  },
                },
              ]
            : [],
      } as never;

      // repair resolves false → no dispatch should fire.
      repairFrontmatterSpy.mockResolvedValueOnce(false);

      const { editorInfoField } = await import('obsidian');
      EditorState.create({
        doc: NOTE_MISSING_LC_LANGUAGE,
        extensions: [
          editorInfoField as unknown as import('@codemirror/state').Extension,
          leetCodeFenceViewPlugin(plugin as never),
        ],
      });

      await flushMicrotasks();

      expect(repairFrontmatterSpy).toHaveBeenCalledTimes(1);
      expect(matchingDispatch).not.toHaveBeenCalled();
      const repairInFlight = (
        plugin as unknown as { repairInFlight: Set<string> }
      ).repairInFlight;
      expect(repairInFlight.has(FILE_PATH)).toBe(false);
    });

    // Test R2.LP.7
    it('post-repair scheduled dispatch is NOT fired when repairFrontmatterIfNeeded rejects', async () => {
      const plugin = makePlugin({
        fm: { 'lc-slug': 'two-sum' },
        useInlineWidget: true,
        autoMigrateOnOpen: true,
      });
      const matchingDispatch = vi.fn();
      (plugin as unknown as { repairInFlight: Set<string> }).repairInFlight =
        new Set<string>();
      const app = plugin.app as unknown as {
        workspace: { getLeavesOfType: (t: string) => unknown[] };
      };
      app.workspace = {
        ...((plugin.app as unknown as { workspace?: object }).workspace ??
          {}),
        getLeavesOfType: (t: string) =>
          t === 'markdown'
            ? [
                {
                  view: {
                    file: { path: FILE_PATH },
                    editor: { cm: { dispatch: matchingDispatch } },
                  },
                },
              ]
            : [],
      } as never;

      // repair rejects.
      repairFrontmatterSpy.mockRejectedValueOnce(new Error('repair boom'));

      const { editorInfoField } = await import('obsidian');
      // Construction must not throw — the .catch swallows the rejection.
      expect(() => {
        EditorState.create({
          doc: NOTE_MISSING_LC_LANGUAGE,
          extensions: [
            editorInfoField as unknown as import('@codemirror/state').Extension,
            leetCodeFenceViewPlugin(plugin as never),
          ],
        });
      }).not.toThrow();

      await flushMicrotasks();

      expect(repairFrontmatterSpy).toHaveBeenCalledTimes(1);
      expect(matchingDispatch).not.toHaveBeenCalled();
      // The .finally still cleared the in-flight lock.
      const repairInFlight = (
        plugin as unknown as { repairInFlight: Set<string> }
      ).repairInFlight;
      expect(repairInFlight.has(FILE_PATH)).toBe(false);
    });
  });
});
