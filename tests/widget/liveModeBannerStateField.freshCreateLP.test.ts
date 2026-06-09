// tests/widget/liveModeBannerStateField.freshCreateLP.test.ts
//
// R6 LP regression — fresh-create metadataCache race in Live Preview.
//
// Root cause (Plan 21.1-01 follow-up):
//   In LP mode, `leetCodeWidgetStateField.create(state)` fires when
//   Obsidian constructs the CM6 EditorState for the newly-opened file.
//   At that moment `metadataCache.getFileCache(file)?.frontmatter` may
//   return null/undefined because Obsidian's metadata indexer hasn't
//   processed the `applyFrontmatter` processFrontMatter write yet.
//   The StateField stores `Decoration.none`.
//
//   The two-rAF dispatch from NoteWriter.fireRerenderAfterNoteWritten
//   fires `leetcodeRefreshAnnotation` ~32ms after `openLinkText`.  If
//   metadataCache hasn't indexed by then, `buildLeetCodeWidgetDecorations`
//   still returns `Decoration.none` on the update pass.  When
//   `metadataCache.changed` fires (the definitive "frontmatter indexed"
//   signal), nothing in main.ts dispatched `leetcodeRefreshAnnotation`
//   for the v1.3 LP StateField path — only `nestedEditorRebuildEffect`
//   (v1.2 path) was dispatched.  The widget was permanently stuck at
//   `Decoration.none` until the user closed and reopened the tab.
//
// Fix (Plan 21.1-01 — R6 LP follow-up):
//   In the `metadataCache.on('changed')` handler in main.ts, when
//   `useInlineWidget=ON` and `lc-slug` is present in the just-changed
//   cache, dispatch `leetcodeRefreshAnnotation` to all LP/source-mode
//   leaves for the changed file path via
//   `dispatchLeetcodeRefreshToLivePreviewLeaves(this.app, file.path)`.
//
// Tests in this file:
//
//   StateField mechanism (exercises liveModeBannerStateField.ts directly):
//     LP-R6-A: EditorState created with empty metadataCache →
//               StateField returns Decoration.none initially. After
//               metadataCache is populated and leetcodeRefreshAnnotation
//               is dispatched, StateField recomputes and returns a
//               non-empty DecorationSet (widget range present).
//     LP-R6-B: EditorState created WITH populated metadataCache →
//               StateField returns non-empty DecorationSet immediately
//               (regression guard — existing happy path must not break).
//
//   main.ts handler behaviour (exercises the metadataCache.on('changed')
//   fix via the extracted `handleMetadataCacheChangedForLP` helper):
//     LP-R6-C: handler calls dispatchLeetcodeRefreshToLivePreviewLeaves
//               when useInlineWidget=ON and lc-slug present.
//     LP-R6-D: handler does NOT call dispatchLeetcodeRefreshToLivePreviewLeaves
//               when useInlineWidget=OFF (master gate respected).
//     LP-R6-E: handler does NOT call dispatchLeetcodeRefreshToLivePreviewLeaves
//               when lc-slug absent (non-LC note guard respected).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── LP-R6-C/D/E: mock dispatchLeetcodeRefreshToLivePreviewLeaves ────────────
// Must be hoisted before the SUT import so vitest's mock registry resolves it.
const dispatchSpy = vi.hoisted(() => vi.fn());
vi.mock('../../src/main/readingModeMigrationHook', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/main/readingModeMigrationHook')
  >('../../src/main/readingModeMigrationHook');
  return {
    ...actual,
    dispatchLeetcodeRefreshToLivePreviewLeaves: dispatchSpy,
  };
});

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');

  const cm = await import('@codemirror/state');
  const editorInfoField = cm.StateField.define<{ file: { path: string } | null }>({
    create: () => ({ file: { path: 'LeetCode/0001-two-sum.md' } }),
    update: (v) => v,
  });
  return { ...actual, editorInfoField };
});

vi.mock('../../src/widget/fenceMigrator', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/widget/fenceMigrator')
  >('../../src/widget/fenceMigrator');
  return {
    ...actual,
    migrateLegacyFenceIfNeeded: vi.fn(async () => false),
    repairFrontmatterIfNeeded: vi.fn(async () => false),
  };
});


import { EditorState } from '@codemirror/state';

import {
  createFakePlugin,
  createFakeMetadataCache,
} from '../solve/mocks/fakeWorkspace';
import { leetCodeFenceViewPlugin } from '../../src/widget/liveModeViewPlugin';
import {
  leetCodeWidgetStateField,
  leetcodeRefreshAnnotation,
} from '../../src/widget/liveModeBannerStateField';
import LeetCodePlugin from '../../src/main';

const FILE_PATH = 'LeetCode/0001-two-sum.md';

const NOTE_WITH_LC_SOLVE_FENCE = [
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

function makePlugin(metadataCache: ReturnType<typeof createFakeMetadataCache>) {
  const fakePlugin = createFakePlugin({ metadataCache });
  return {
    app: fakePlugin.app as never,
    lcSettings: {
      getUseInlineWidget: () => true,
      getAutoMigrateOnOpen: () => true,
      getDefaultLanguage: () => 'java',
    },
    migrateInFlight: new Set<string>(),
    widgetRegistry: { values: () => [] },
  };
}

// ─── StateField mechanism tests ───────────────────────────────────────────────

describe('R6 LP regression — StateField mechanism (liveModeBannerStateField)', () => {
  // LP-R6-A: core mechanism — StateField created with empty metadataCache →
  // Decoration.none, then annotation dispatch with populated cache →
  // non-empty DecorationSet. This proves the StateField correctly responds
  // to the annotation dispatch that the main.ts fix adds.
  it('LP-R6-A: empty metadataCache at create time → Decoration.none; after annotation dispatch with populated cache → decoration range present', async () => {
    const metadataCache = createFakeMetadataCache();
    // metadataCache is EMPTY — simulates the fresh-create race where
    // applyFrontmatter hasn't been indexed yet at LP EditorState.create time.

    const plugin = makePlugin(metadataCache);
    const { editorInfoField } = await import('obsidian');

    const state = EditorState.create({
      doc: NOTE_WITH_LC_SOLVE_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    // StateField.create with empty metadataCache: slug check fails → Decoration.none.
    const initialDecos = state.field(leetCodeWidgetStateField, false);
    expect(initialDecos).toBeDefined();
    let initialCount = 0;
    initialDecos!.between(0, state.doc.length, () => { initialCount++; });
    expect(initialCount).toBe(0);

    // Simulate metadataCache.changed firing (frontmatter now indexed).
    metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      'lc-language': 'java',
    });

    // Dispatch leetcodeRefreshAnnotation (what the main.ts fix does via
    // dispatchLeetcodeRefreshToLivePreviewLeaves when metadataCache.changed fires).
    const tr = state.update({
      annotations: [leetcodeRefreshAnnotation.of(true)],
    });
    const next = tr.state;
    expect(tr.docChanged).toBe(false);

    // StateField recomputes: now finds slug + fence → Decoration.replace range.
    const afterDecos = next.field(leetCodeWidgetStateField, false);
    expect(afterDecos).toBeDefined();
    let afterCount = 0;
    afterDecos!.between(0, next.doc.length, () => { afterCount++; });
    expect(afterCount).toBeGreaterThanOrEqual(1);
    expect(afterDecos).not.toBe(initialDecos);
  });

  // LP-R6-B: regression guard — populated metadataCache at create time →
  // non-empty DecorationSet immediately (happy path must not break).
  it('LP-R6-B: metadataCache populated at create time → non-empty DecorationSet immediately', async () => {
    const metadataCache = createFakeMetadataCache();
    metadataCache.setFrontmatter(FILE_PATH, {
      'lc-slug': 'two-sum',
      'lc-language': 'java',
    });

    const plugin = makePlugin(metadataCache);
    const { editorInfoField } = await import('obsidian');

    const state = EditorState.create({
      doc: NOTE_WITH_LC_SOLVE_FENCE,
      extensions: [
        editorInfoField as unknown as import('@codemirror/state').Extension,
        leetCodeFenceViewPlugin(plugin as never),
      ],
    });

    const decos = state.field(leetCodeWidgetStateField, false);
    expect(decos).toBeDefined();
    let count = 0;
    decos!.between(0, state.doc.length, () => { count++; });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── main.ts handler behaviour tests ─────────────────────────────────────────
// These tests exercise the metadataCache.on('changed') handler via
// LeetCodePlugin.handleMetadataCacheChangedForLP — the extracted helper that
// the fix adds so the LP-specific dispatch logic is unit-testable without
// spinning up a full plugin instance.
//
// Strategy mirrors tests/main/fmReactivity.test.ts: invoke the extracted
// helper via helper.call(fakePlugin, file, cache) with a minimal fake plugin
// context. The dispatchLeetcodeRefreshToLivePreviewLeaves import is mocked
// (see dispatchSpy above) so we can assert call shape without real workspace
// traversal.

describe('R6 LP regression — main.ts metadataCache.on(changed) handler', () => {
  beforeEach(() => {
    dispatchSpy.mockClear();
  });

  function makeHandlerPlugin(useInlineWidget: boolean) {
    return {
      lcSettings: {
        getUseInlineWidget: () => useInlineWidget,
      },
      app: {},
    };
  }

  // LP-R6-C: useInlineWidget=ON + lc-slug present → dispatch fires.
  it('LP-R6-C: useInlineWidget=ON and lc-slug present → dispatchLeetcodeRefreshToLivePreviewLeaves called with correct path', () => {
    const helper = (LeetCodePlugin.prototype as unknown as Record<string, unknown>)
      .handleMetadataCacheChangedForLP as
      | ((file: { path: string }, cache: { frontmatter?: Record<string, unknown> }) => void)
      | undefined;

    // If the helper doesn't exist yet, the test should fail (RED state
    // before fix, GREEN after the helper is added in main.ts).
    expect(helper).toBeDefined();

    const fakePlugin = makeHandlerPlugin(true);
    const fakeFile = { path: FILE_PATH };
    const cache = { frontmatter: { 'lc-slug': 'two-sum', 'lc-language': 'java' } };

    helper!.call(fakePlugin, fakeFile, cache);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(fakePlugin.app, FILE_PATH);
  });

  // LP-R6-D: REMOVED in Phase 22 v1.2 path removal.
  //   The `useInlineWidget` master-gate setting was deleted along with the
  //   v1.2 nested-editor path — the widget is now the only path. The handler
  //   no longer reads `getUseInlineWidget()`, so this dead-branch test is gone.

  // LP-R6-E: lc-slug absent → dispatch must NOT fire (non-LC note guard).
  it('LP-R6-E: lc-slug absent → dispatchLeetcodeRefreshToLivePreviewLeaves NOT called', () => {
    const helper = (LeetCodePlugin.prototype as unknown as Record<string, unknown>)
      .handleMetadataCacheChangedForLP as
      | ((file: { path: string }, cache: { frontmatter?: Record<string, unknown> }) => void)
      | undefined;
    expect(helper).toBeDefined();

    const fakePlugin = makeHandlerPlugin(true);
    const fakeFile = { path: FILE_PATH };
    const cache = { frontmatter: { tags: ['scratch'] } };

    helper!.call(fakePlugin, fakeFile, cache);

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
