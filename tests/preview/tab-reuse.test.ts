// tests/preview/tab-reuse.test.ts
//
// Phase 06 Plan 03 — locks the must_have:
//   "Two consecutive previews use the SAME leaf —
//    `getLeavesOfType('leetcode-preview')` returns one entry, never two."
//
// We exercise `openOrReusePreview(plugin, slug)` against a stub workspace.
// First call: leaf list is empty → workspace.getLeaf('tab') is invoked once,
// the new leaf gets setViewState. Second call: leaf list has one entry →
// workspace.getLeaf('tab') is NOT invoked again, instead the existing leaf
// is re-stated via setViewState (different slug).

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { openOrReusePreview } from '../../src/preview/previewRouter';
import { PREVIEW_VIEW_TYPE } from '../../src/preview/ProblemPreviewView';

interface FakeLeaf {
  setViewState: ReturnType<typeof vi.fn>;
}

function makeStubWorkspace() {
  // Minimal workspace shape: getLeavesOfType returns the running list of
  // preview leaves; getLeaf('tab') appends a fresh leaf to it.
  const previewLeaves: FakeLeaf[] = [];
  const getLeavesOfType = vi.fn((type: string) => {
    if (type === PREVIEW_VIEW_TYPE) return previewLeaves;
    return [];
  });
  const getLeaf = vi.fn((_kind: string) => {
    const leaf: FakeLeaf = {
      setViewState: vi.fn(async () => undefined),
    };
    previewLeaves.push(leaf);
    return leaf;
  });
  const revealLeaf = vi.fn(async () => undefined);
  return {
    workspace: {
      getLeavesOfType,
      getLeaf,
      revealLeaf,
    },
    previewLeaves,
    getLeavesOfTypeSpy: getLeavesOfType,
    getLeafSpy: getLeaf,
    revealLeafSpy: revealLeaf,
  };
}

describe('openOrReusePreview tab-reuse contract (Phase 06 Plan 03)', () => {
  it('first invocation opens a NEW center tab via getLeaf("tab") + setViewState', async () => {
    const ws = makeStubWorkspace();
    const plugin = { app: { workspace: ws.workspace } } as unknown as Parameters<typeof openOrReusePreview>[0];
    await openOrReusePreview(plugin, 'two-sum');
    expect(ws.getLeafSpy).toHaveBeenCalledTimes(1);
    expect(ws.getLeafSpy).toHaveBeenCalledWith('tab');
    expect(ws.previewLeaves).toHaveLength(1);
    expect(ws.previewLeaves[0]?.setViewState).toHaveBeenCalledTimes(1);
    expect(ws.previewLeaves[0]?.setViewState).toHaveBeenCalledWith({
      type: PREVIEW_VIEW_TYPE,
      active: true,
      state: { slug: 'two-sum' },
    });
    expect(ws.revealLeafSpy).toHaveBeenCalledTimes(1);
  });

  it('second invocation REUSES the existing leaf — getLeaf("tab") is NOT called again', async () => {
    const ws = makeStubWorkspace();
    const plugin = { app: { workspace: ws.workspace } } as unknown as Parameters<typeof openOrReusePreview>[0];
    await openOrReusePreview(plugin, 'two-sum');
    await openOrReusePreview(plugin, 'add-two-numbers');

    expect(ws.getLeafSpy).toHaveBeenCalledTimes(1); // only the FIRST call
    expect(ws.previewLeaves).toHaveLength(1);
    const leaf = ws.previewLeaves[0];
    expect(leaf?.setViewState).toHaveBeenCalledTimes(2);
    expect(leaf?.setViewState).toHaveBeenLastCalledWith({
      type: PREVIEW_VIEW_TYPE,
      active: true,
      state: { slug: 'add-two-numbers' },
    });
    expect(ws.revealLeafSpy).toHaveBeenCalledTimes(2);
  });

  it('after two consecutive calls, getLeavesOfType returns exactly one leaf', async () => {
    const ws = makeStubWorkspace();
    const plugin = { app: { workspace: ws.workspace } } as unknown as Parameters<typeof openOrReusePreview>[0];
    await openOrReusePreview(plugin, 'a');
    await openOrReusePreview(plugin, 'b');
    expect(ws.workspace.getLeavesOfType(PREVIEW_VIEW_TYPE)).toHaveLength(1);
  });

  it('uses the locked view type string "leetcode-preview" (PREVIEW_VIEW_TYPE)', async () => {
    expect(PREVIEW_VIEW_TYPE).toBe('leetcode-preview');
    const ws = makeStubWorkspace();
    const plugin = { app: { workspace: ws.workspace } } as unknown as Parameters<typeof openOrReusePreview>[0];
    await openOrReusePreview(plugin, 'two-sum');
    expect(ws.getLeavesOfTypeSpy).toHaveBeenCalledWith('leetcode-preview');
  });
});
