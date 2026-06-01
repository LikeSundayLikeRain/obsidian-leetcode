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
// Phase 21 Plan 21-02 Task 3 — pre-mount migration gate (D-trigger-01).
// Reading-mode handler awaits migrateLegacyFenceIfNeeded BEFORE constructing
// the widget so the v1.2 → v1.3 fence rewrite happens in the same render
// frame the user is already waiting on. autoMigrateOnOpen=OFF surfaces the
// legacyFenceBanner with a [Migrate now] CTA (D-auto-02). Master gate
// useInlineWidget=ON is consulted at every call site (L9).
import {
  isMigrationCandidate,
  migrateLegacyFenceIfNeeded,
} from './fenceMigrator';
import { mountLegacyFenceBanner } from './legacyFenceBanner';

type ProcessorHost = Plugin & WidgetMountHost & {
  app: WidgetMountHost['app'] & {
    vault: WidgetMountHost['app']['vault'] & {
      getAbstractFileByPath(path: string): unknown;
    };
  };
  // Phase 21 — settings access for the master gate + auto-migrate gate +
  // user's defaultLanguage (threaded into the migrator for D-edge-03 fill).
  settings: WidgetMountHost['settings'] & {
    getUseInlineWidget?(): boolean;
    getAutoMigrateOnOpen?(): boolean;
    getDefaultLanguage?(): string;
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
  return async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
  ): Promise<void> => {
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

    // Phase 21 Plan 21-02 Task 3 — pre-mount migration gate. Runs BEFORE
    // the existing embed/RenderChild dispatch. Two paths gated on the
    // useInlineWidget master toggle (L9):
    //
    //   - autoMigrateOnOpen=ON  → silently awaits migrateLegacyFenceIfNeeded.
    //                             If migration ran, return early; the
    //                             vault.on('modify') event re-fires the
    //                             post-processor on the rewritten fence and
    //                             the v1.3 widget mounts in that cycle.
    //   - autoMigrateOnOpen=OFF → renders the legacyFenceBanner with the
    //                             [Migrate now] CTA when the strict-match
    //                             predicate accepts the source. Click
    //                             handler dispatches with force: true.
    //
    // Gates self-return; otherwise the existing path (embed / lc-slug)
    // continues unchanged. Defensive try/catch wraps the await — migration
    // must NOT block file open (Pattern S-05 silent-on-failure).
    //
    // settings may be undefined in test fixtures that exercise mount-only
    // paths; when absent, skip both Phase 21 gates and let the existing
    // path apply (matches L9 — useInlineWidget=OFF behavior).
    const settings = plugin.settings;
    if (
      hasLcSlug &&
      settings?.getUseInlineWidget?.() === true &&
      settings?.getAutoMigrateOnOpen?.() === true
    ) {
      try {
        const migrated = await migrateLegacyFenceIfNeeded(
          plugin.app as Parameters<typeof migrateLegacyFenceIfNeeded>[0],
          file,
          {
            autoMigrateOnOpen: true,
            defaultLanguage:
              settings?.getDefaultLanguage?.() ?? 'python3',
          },
        );
        if (migrated) {
          // vault.on('modify') will trigger a fresh post-processor invocation
          // that mounts the v1.3 widget on the rewritten leetcode-solve
          // fence. This invocation has no further work — render a static
          // intermediate so the user never sees a "no widget" frame.
          renderStaticFallback(el, source);
          return;
        }
      } catch {
        // Defensive — migration failures fall through to the existing path.
      }
    }
    if (
      hasLcSlug &&
      settings?.getUseInlineWidget?.() === true &&
      settings?.getAutoMigrateOnOpen?.() !== true
    ) {
      // The strict-match predicate consults the FULL note text (it walks
      // for `## Code` heading + recognized langSlug fence). The post-
      // processor receives only the fence body in `source`; pull the full
      // note from ctx.getSectionInfo(el)?.text. When section info is null
      // (degenerate path), skip the banner — the existing render-child
      // logic below handles the embed/no-info cases gracefully.
      const sectionText = ctx.getSectionInfo(el)?.text;
      if (
        typeof sectionText === 'string' &&
        isMigrationCandidate(sectionText, fm)
      ) {
        mountLegacyFenceBanner(
          el,
          source,
          file,
          plugin as Parameters<typeof mountLegacyFenceBanner>[3],
          'manual-prompt',
        );
        return;
      }
    }

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

    // WIDGET-07 / CONTEXT C-03 + Phase 20-09 (post-mortem fix): Reading-mode
    // widgets must be read-only. `el` may be in a detached pre-render
    // fragment when the post-processor fires — meaning
    // el.closest('.markdown-reading-view') returns null even though we're
    // really in Reading mode. This caused vim+mode-switch to mount an
    // editable LP-mode widget into a Reading view (BUG 5).
    //
    // Use a three-signal OR for reliability:
    //   1. el.closest('.markdown-reading-view') — fast path, works once el
    //      is attached.
    //   2. ctx.containerEl.closest('.markdown-reading-view') —
    //      ctx.containerEl is the post-processor's containing section node,
    //      which is mode-stable from the start.
    //   3. workspace.getActiveViewOfType(MarkdownView)?.getMode() === 'preview'
    //      — authoritative for the focused leaf.
    const elReading = !!el.closest?.('.markdown-reading-view');
    const ctxContainerEl = (ctx as unknown as { containerEl?: HTMLElement }).containerEl;
    const ctxReading = !!ctxContainerEl?.closest?.('.markdown-reading-view');
    // WR-03 (review-fix) — prefer local DOM signals when the
    // ctx.containerEl is connected to the live document. The global
    // `getActiveViewOfType` reads the focused leaf, which produces
    // false positives in split view: with a Reading pane focused while
    // an LP pane re-renders, the global signal would mount the LP
    // widget as read-only.
    //
    // Trust local signals first:
    //   - `elReading` is the most specific (the host element is inside
    //     the .markdown-reading-view subtree).
    //   - `ctxReading` is the next-best (ctx.containerEl is mode-stable
    //     from the start; the post-processor's containing section node
    //     keeps its mode class even when el itself is in a detached
    //     pre-render fragment).
    // Only fall back to the global activeModeReading when neither local
    // signal is decisive AND the ctx.containerEl is detached (we have
    // no local truth to consult).
    const ctxConnected = !!ctxContainerEl?.isConnected;
    let isReadingMode: boolean;
    if (elReading || ctxReading) {
      isReadingMode = true;
    } else if (ctxConnected) {
      // Local DOM is connected and says NOT reading — trust it. Skip
      // the global probe to avoid false positives in split view.
      isReadingMode = false;
    } else {
      // ctx is detached (pre-render fragment); fall back to the global
      // active-leaf mode signal.
      let activeModeReading = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { MarkdownView } = require('obsidian') as { MarkdownView: unknown };
        const av = (plugin.app as unknown as {
          workspace?: {
            getActiveViewOfType?(t: unknown): { getMode?(): string } | null;
          };
        }).workspace?.getActiveViewOfType?.(MarkdownView);
        activeModeReading = av?.getMode?.() === 'preview';
      } catch {
        // Defensive — assume editable when probe fails.
      }
      isReadingMode = activeModeReading;
    }

    // Phase 20 Plan 20-09 — RenderChild path renders in BOTH reading
    // mode and Live Preview (Obsidian fires registerMarkdownCodeBlock-
    // Processor in both). Read-only when reading mode / embed / no
    // lc-slug. Editable in Live Preview WITH lc-slug — and the
    // child→parent sync extension installs only when we can resolve
    // the parent EditorView from the host element (the .cm-editor
    // ancestor). LeetCodeWidgetRenderChild.onload is responsible for
    // resolving it.
    const readOnly = isReadingMode || isEmbed || !hasLcSlug;
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
