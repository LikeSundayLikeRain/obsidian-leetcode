// Phase 19 Plan 01 — Embed-context detection (CONTEXT C-15 / EMBED-03).
//
// Two independent signals — both required, OR'd. Per RESEARCH §"Specific
// Findings §3":
//   1. DOM ancestor walk for `.markdown-embed` / `.internal-embed` (catches
//      the host-DOM case)
//   2. ctx.sourcePath !== targetFile.path (catches the case where Obsidian
//      re-renders an embedded fence in a deferred context with a stripped
//      embed wrapper class)
//
// Pure boolean — no side effects. Used by codeBlockProcessor to gate
// editable vs. read-only widget mount.

import type { MarkdownPostProcessorContext, TFile } from 'obsidian';

export function isEmbedContext(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  targetFile: TFile,
): boolean {
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
