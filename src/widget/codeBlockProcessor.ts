// Phase 19 Plan 01 — Reading-mode code-block processor for `\`\`\`leetcode-solve`.
//
// Registered via `Plugin.registerMarkdownCodeBlockProcessor('leetcode-solve', handler)`
// at `Plugin.onload()` (see src/main.ts wiring in Task 4 of Plan 19-01).
//
// Behavior matrix (CONTEXT C-10 / C-15 / D-04, RESEARCH Pitfall 19-D):
//
// ┌────────────────────┬────────────┬────────────────────────────────────┐
// │ lc-slug present?   │ embed?     │ Result                              │
// ├────────────────────┼────────────┼────────────────────────────────────┤
// │ NO                 │ NO         │ static <pre><code> fallback         │
// │ NO                 │ YES        │ readOnly RenderChild                │
// │ YES                │ NO         │ editable RenderChild                │
// │ YES                │ YES        │ readOnly RenderChild                │
// │ getSectionInfo nul │ —          │ static <pre><code> fallback (P19-D) │
// │ no TFile           │ —          │ static <pre><code> fallback         │
// └────────────────────┴────────────┴────────────────────────────────────┘
//
// All branches are graceful — never throws (WIDGET-05).
// CLAUDE.md: NO innerHTML — use createEl with text option.

import {
  TFile,
  type MarkdownPostProcessorContext,
  type Plugin,
} from 'obsidian';
import { isEmbedContext } from './embedDetect';
import { LeetCodeWidgetRenderChild, type WidgetMountHost } from './WidgetController';

type ProcessorHost = Plugin & WidgetMountHost & {
  app: WidgetMountHost['app'] & {
    vault: WidgetMountHost['app']['vault'] & {
      getAbstractFileByPath(path: string): unknown;
    };
  };
};

/**
 * Render a static `<pre><code>` fallback for non-LC fences and degenerate
 * paths. Uses createEl + text option per CLAUDE.md no-innerHTML rule.
 */
function renderStaticFallback(el: HTMLElement, source: string): void {
  // The host element may already contain Obsidian's pre-rendered markdown
  // representation of the fence; clear it before injecting our fallback so
  // we don't double-render.
  el.empty?.();
  if (!el.empty) {
    // Defensive — happy-dom test envs may not expose .empty(); fall back to
    // childNode removal.
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  // createEl with `text:` option renders source as TEXT (XSS-safe).
  // The Obsidian DOM helper API: HTMLElement.createEl is the canonical API
  // (added by Obsidian's runtime); when running under happy-dom we
  // gracefully degrade to document.createElement.
  type CreateElFn = (tag: string, opts?: { text?: string; cls?: string }) => HTMLElement;
  const createEl = (el as unknown as { createEl?: CreateElFn }).createEl;
  if (typeof createEl === 'function') {
    const pre = createEl.call(el, 'pre');
    (pre as unknown as { createEl: CreateElFn }).createEl('code', { text: source });
  } else {
    // happy-dom path — manual DOM. Still no innerHTML.
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = source;
    pre.appendChild(code);
    el.appendChild(pre);
  }
}

/**
 * Phase 19 Plan 01 — `Plugin.registerMarkdownCodeBlockProcessor` handler factory.
 *
 * Returns the (source, el, ctx) handler that gates on lc-slug + embed context
 * and routes to either a render child (CM6 widget mount) or a static fallback.
 */
export function leetCodeBlockProcessor(plugin: ProcessorHost) {
  return (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): void => {
    // Resolve TFile from sourcePath. Non-TFile (broken path, missing file)
    // routes to static fallback — never throws.
    const fileLike = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(fileLike instanceof TFile)) {
      renderStaticFallback(el, source);
      return;
    }
    const file = fileLike;

    // Read frontmatter via metadataCache (consistent with v1.2 callsites at
    // codeActionsEditorExtension.ts:248-251). Do NOT use ctx.frontmatter —
    // typed `any | null | undefined` per RESEARCH Anti-Patterns + Specific
    // Findings §A5.
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const lcSlug = fm?.['lc-slug'];
    const hasLcSlug = typeof lcSlug === 'string' && lcSlug.length > 0;

    // Pitfall 19-D: getSectionInfo(el) returns null in many embed contexts.
    // Plan 19-04 — pass `info` (which may be null) to isEmbedContext as the
    // third signal. The branching matrix:
    //
    //   ┌──────────┬─────────────┬────────┬──────────────────────────────────┐
    //   │ lc-slug  │ info        │ embed? │ Result                            │
    //   ├──────────┼─────────────┼────────┼──────────────────────────────────┤
    //   │ NO       │ —           │ NO     │ static <pre><code> fallback       │
    //   │ NO       │ —           │ YES    │ readOnly RenderChild (EMBED-04)   │
    //   │ YES      │ null        │ —      │ readOnly RenderChild (Pitfall D)  │
    //   │ YES      │ present     │ NO     │ editable RenderChild (LC primary) │
    //   │ YES      │ present     │ YES    │ readOnly RenderChild (EMBED-01..3)│
    //   │ —        │ null + !slug│ NO     │ static <pre><code> fallback       │
    //   │ no TFile │ —           │ —      │ static <pre><code> fallback       │
    //   └──────────┴─────────────┴────────┴──────────────────────────────────┘
    //
    // RESEARCH Pitfall 19-D: null info is REGULAR (not exceptional) in embeds;
    // routing it through isEmbedContext promotes it to embed-likely instead of
    // treating it as a degenerate fallback that loses the read-only widget.
    const info = ctx.getSectionInfo(el);
    const isEmbed = isEmbedContext(el, ctx, file, info);

    // No lc-slug AND not embed → stray fence in non-LC note (static fallback).
    // No lc-slug AND embed → readOnly RenderChild (still useful for visual).
    if (!hasLcSlug && !isEmbed) {
      renderStaticFallback(el, source);
      return;
    }

    // We need a non-null info object to construct the RenderChild because
    // computeFenceIndex consults info.text + info.lineStart. When info is
    // null but we're in an embed context, fabricate a minimal info object
    // so the RenderChild can mount with fenceIndex=0 (the dominant case for
    // embeds — the embed-target is typically the LC note's only fence).
    const renderInfo = info ?? { text: source, lineStart: 0, lineEnd: 0 };

    // Otherwise mount the render child. Embed contexts (whether LC or
    // non-LC) get readOnly=true; LC notes in their own pipeline + valid
    // section info get readOnly=false.
    const readOnly = isEmbed || !hasLcSlug;
    const child = new LeetCodeWidgetRenderChild(
      el,
      source,
      ctx,
      plugin,
      file,
      renderInfo,
      readOnly,
    );
    ctx.addChild(child);
  };
}
