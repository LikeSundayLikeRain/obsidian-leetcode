// Phase 19 Plan 01 + Plan 04 — Embed-context detection (CONTEXT C-15 / EMBED-03).
//
// THREE independent signals — any one returns true (RESEARCH §3 + Pitfall 19-D):
//   1. DOM ancestor walk for `.markdown-embed` / `.internal-embed` (host-DOM).
//   2. ctx.sourcePath !== targetFile.path (Obsidian re-renders an embedded
//      fence in a deferred context with a stripped embed wrapper class).
//   3. Plan 19-04 — `info === null` (Pitfall 19-D treatment): null
//      MarkdownSectionInformation is the regular state of an embed-rendered
//      `![[lc-note#Code]]` section transclusion. Treat as embed-likely.
//
// Pure boolean — no side effects. Used by codeBlockProcessor to gate
// editable vs. read-only widget mount.

import type {
  MarkdownPostProcessorContext,
  MarkdownSectionInformation,
  TFile,
} from 'obsidian';

export function isEmbedContext(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  targetFile: TFile,
  info?: MarkdownSectionInformation | null,
): boolean {
  // Plan 19-04 — Pitfall 19-D treatment: null section info is embed-likely.
  // The optional fourth argument lets the caller (codeBlockProcessor) thread
  // its already-resolved `getSectionInfo(el)` result through without
  // re-fetching. When the argument isn't supplied (legacy three-arg call),
  // we skip this check (callers may rely on signals 1+2 alone).
  if (info === null) return true;

  // Signal 1: DOM ancestor walk for the embed wrapper classes Obsidian
  // applies to transcluded blocks (`![[note]]`, `![[note#section]]`).
  let node: HTMLElement | null = el;
  while (node) {
    if (
      node.classList?.contains('markdown-embed') ||
      node.classList?.contains('internal-embed')
    ) {
      return true;
    }
    node = node.parentElement;
  }
  // Signal 2: sourcePath mismatch — Obsidian renders the embedded fence in
  // the host's pipeline; ctx.sourcePath is the host path, while
  // targetFile.path is the embed-target (the LC note). When they differ we
  // know we're in an embed context regardless of DOM wrapper.
  if (ctx.sourcePath !== targetFile.path) return true;
  return false;
}
