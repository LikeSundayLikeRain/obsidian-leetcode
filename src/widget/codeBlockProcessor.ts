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

    // Pitfall 19-D: getSectionInfo(el) returns null in many embed contexts
    // and other "deferred re-render" paths. Treat null as a graceful fallback
    // signal — render static <pre><code>, NEVER throw.
    const info = ctx.getSectionInfo(el);
    if (!info) {
      renderStaticFallback(el, source);
      return;
    }

    const isEmbed = isEmbedContext(el, ctx, file);

    // Stray fence in non-LC note (no lc-slug) AND not embed → static fallback.
    if (!hasLcSlug && !isEmbed) {
      renderStaticFallback(el, source);
      return;
    }

    // Otherwise mount the render child. Embed contexts (whether LC or
    // non-LC) get readOnly=true; LC notes in their own pipeline get
    // readOnly=false.
    const readOnly = isEmbed || !hasLcSlug;
    const child = new LeetCodeWidgetRenderChild(
      el,
      source,
      ctx,
      plugin,
      file,
      info,
      readOnly,
    );
    ctx.addChild(child);
  };
}
