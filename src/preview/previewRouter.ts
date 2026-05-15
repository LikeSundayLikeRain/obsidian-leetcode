// src/preview/previewRouter.ts
//
// Phase 06 Plan 03 — tab-reuse router for the Preview view. Two consecutive
// previews of different slugs MUST share the same `leetcode-preview` leaf —
// `workspace.getLeavesOfType('leetcode-preview')` returns ≤ 1 entry at any
// time (06-PLAN must_have: "Two consecutive previews use the SAME leaf").
//
// Pattern (06-RESEARCH §Pattern 2 + 06-PATTERNS.md §previewRouter):
//   1. Look up existing leaves of type PREVIEW_VIEW_TYPE.
//   2. If one exists, swap its content in place via setViewState({ type,
//      active, state: { slug } }) — Obsidian re-runs the view's setState
//      with the new slug and we re-render.
//   3. Otherwise open a new center tab via getLeaf('tab') + setViewState.
//   4. Either branch finishes with revealLeaf so the user actually sees it.
//
// `WorkspaceLeaf.openIfExtant` does NOT exist on obsidian@1.12.x (verified by
// grep against the bundled obsidian.d.ts; 06-RESEARCH §Open Q9). The
// getLeavesOfType + setViewState combo is the canonical primitive.

import type LeetCodePlugin from '../main';
import { PREVIEW_VIEW_TYPE } from './ProblemPreviewView';

/**
 * Open a preview leaf for `slug`, or reuse the existing preview leaf if one is
 * already open. Either way the leaf is revealed (focused) on completion.
 *
 * Contract:
 *   - Awaits the underlying setViewState + revealLeaf so the caller can chain
 *     onto a deterministic "preview is now visible" promise (used by the
 *     `open-in-preview` palette command in main.ts).
 *   - Never throws on routine workspace state — workspace.getLeaf('tab')
 *     always returns a leaf in stock Obsidian. If a downstream subsystem
 *     rejects (e.g., setViewState fails on a corrupt persisted leaf),
 *     the rejection propagates to the caller's await chain.
 */
export async function openOrReusePreview(
  plugin: LeetCodePlugin,
  slug: string,
): Promise<void> {
  const { workspace } = plugin.app;
  const existing = workspace.getLeavesOfType(PREVIEW_VIEW_TYPE);
  if (existing.length > 0 && existing[0]) {
    const leaf = existing[0];
    await leaf.setViewState({
      type: PREVIEW_VIEW_TYPE,
      active: true,
      state: { slug },
    });
    await workspace.revealLeaf(leaf);
    return;
  }
  const leaf = workspace.getLeaf('tab');
  await leaf.setViewState({
    type: PREVIEW_VIEW_TYPE,
    active: true,
    state: { slug },
  });
  await workspace.revealLeaf(leaf);
}
