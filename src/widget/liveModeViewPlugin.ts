// Phase 19 Plan 01 — Live-Preview ViewPlugin contributing both Decoration.replace
// (the widget rendering) AND EditorView.atomicRanges (parent-cursor exclusion).
//
// CONTEXT references:
//   - C-02: ViewPlugin + Decoration.replace is the Live-Preview mount path
//   - C-05: EditorView.atomicRanges Facet contribution prevents the parent
//     cursor from entering the fence range (WIDGET-02 / load-bearing)
//   - C-10: lc-slug frontmatter gate (only mount on LC notes)
//
// PATTERNS reference: 19-PATTERNS.md lines 116-194 (template) + RESEARCH Pattern 3
// (the ViewPlugin.fromClass shape with `provide` hook).
//
// CRITICAL: the SAME RangeSet is shared between `decorations` and the
// atomicRanges Facet contribution. Drift between the two would let the parent
// cursor land in the widget range while the visual decoration still shows
// the widget — a load-bearing invariant per RESEARCH Pattern 3 (lines 247-272).
//
// Phase 19-01 SCOPE NARROWING: this ViewPlugin does NOT subscribe to
// metadataCache.on('changed') — that's deferred to Phase 20 per CONTEXT
// deferred_ideas + PATTERNS line 192. Updates fire only on
// `update.docChanged || update.viewportChanged`.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { RangeSetBuilder, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { editorInfoField, type Plugin, type TFile } from 'obsidian';
import { findCodeFence, extractFenceBody, computeFenceIndex } from './fenceLocator';
import { LeetCodeFenceWidget } from './LeetCodeFenceWidget';
import { djb2 } from './hash';
import type { WidgetMountHost } from './WidgetController';

type PluginHost = Plugin & WidgetMountHost;

/**
 * Build the RangeSet covering each `\`\`\`leetcode-solve` fence in the
 * visible doc. Used by BOTH the decorations field and the atomicRanges Facet
 * contribution — same RangeSet, no drift (RESEARCH Pattern 3 lines 263-272).
 *
 * Phase 20 Plan 20-06 — return shape widened to include the computed
 * `sourceHash` and `filePath` so `LeetCodeLiveViewPlugin.update()` can
 * peek the suppression map without re-deriving them. Both fields are null
 * when no LC widget mounts (no file, missing slug, missing/non-leetcode
 * fence).
 */
interface BuildResult {
  set: DecorationSet;
  sourceHash: string | null;
  filePath: string | null;
}

function buildLeetCodeFenceRanges(
  view: EditorView,
  plugin: PluginHost,
): BuildResult {
  const builder = new RangeSetBuilder<Decoration>();
  const file = view.state.field(editorInfoField, false)?.file as TFile | null | undefined;
  if (!file) return { set: builder.finish(), sourceHash: null, filePath: null };

  // C-10: lc-slug frontmatter gate. Use metadataCache (consistent with v1.2
  // callsites at codeActionsEditorExtension.ts:248-251), NOT ctx.frontmatter
  // (loose-typed `any | null | undefined`).
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return { set: builder.finish(), sourceHash: null, filePath: null };
  }

  const fence = findCodeFence(view.state);
  if (!fence || fence.kind !== 'leetcode-solve') {
    return { set: builder.finish(), sourceHash: null, filePath: null };
  }

  const from = view.state.doc.line(fence.openerLine).from;
  const to = view.state.doc.line(fence.closerLine).to;
  const source = extractFenceBody(view.state, fence);
  // Compute fenceIndex from the file text — equals 0 for single-fence LC notes
  // (the common case) but generalizes to multi-fence corner per CONTEXT D-01.
  const fileText = view.state.doc.toString();
  const openerLine0 = fence.openerLine - 1;
  const fenceIndex = computeFenceIndex(fileText, openerLine0);

  // Plan 19-04 — synchronous identity hash (Pitfall 19-F). The ViewPlugin
  // computes djb2(source) once per build; the widget receives the hash
  // explicitly so eq() comparison stays content-aware. Cross-instance
  // hash equality means CM6 reuses the existing DOM (no remount thrash).
  const sourceHash = djb2(source);
  builder.add(
    from,
    to,
    Decoration.replace({
      widget: new LeetCodeFenceWidget(plugin, file, fenceIndex, sourceHash, source),
      // Phase 20 Plan 20-07 — `block: true` makes CM6 treat the multi-line
      // widget as a single visual block. Vertical motion via coordsAtPos
      // (cursorLineUp/Down) skips the widget as a unit instead of landing
      // mid-range; atomicRanges does not consistently govern screen-
      // coordinate-based vertical motion through a multi-line inline
      // replace. Same primitive used by `src/main/codeActionsEditorExtension.ts:294`
      // for the v1.2 action-row block widget.
      // See .planning/debug/atomicranges-cursor-edge-cases.md.
      block: true,
      // The replace decoration takes over the entire fence range; the
      // parent's cursor-skip behavior is enforced by the atomicRanges
      // Facet (below).
    }),
  );

  return { set: builder.finish(), sourceHash, filePath: file.path };
}

/**
 * The inner ViewPlugin class. Stores the SAME RangeSet under both
 * `decorations` (consumed by EditorView.decorations.from) and `ranges`
 * (consumed by the atomicRanges Facet via the `provide` hook below).
 */
class LeetCodeLiveViewPlugin {
  decorations: DecorationSet;
  ranges: DecorationSet;

  constructor(view: EditorView, private readonly plugin: PluginHost) {
    const { set } = buildLeetCodeFenceRanges(view, plugin);
    this.decorations = set;
    this.ranges = set;
  }

  update(update: ViewUpdate): void {
    if (!(update.docChanged || update.viewportChanged)) return;

    const { set, sourceHash, filePath } = buildLeetCodeFenceRanges(
      update.view,
      this.plugin,
    );

    // Phase 20 Plan 20-06 — provenance gate (gap-closure for
    // self-write-remount-cycle, UAT Test 6).
    //
    // When the parent doc transition was caused by OUR own
    // debouncedWriter.flush(), the suppression map will hold an armed
    // entry whose expectedHash equals the rebuilt sourceHash. KEEP
    // `this.decorations` reference-stable for this transaction so CM6
    // does NOT call destroy() on the widget's host DOM. The next
    // genuine keystroke will rebuild normally; eq()-hardening in
    // LeetCodeFenceWidget makes that next rebuild also reuse the DOM
    // via the suppression-map clause while the entry is still armed.
    // See .planning/debug/self-write-remount-cycle.md.
    //
    // Plan 20-06 revision Blocker #2 — viewport gate is INTENTIONALLY
    // omitted from the condition. CM6 reflows the viewport on doc
    // changes routinely; gating on `!update.viewportChanged` would
    // bypass this whenever docChanged + viewportChanged are both true
    // (the exact scenario after a flush). The condition fires on
    // `update.docChanged` alone.
    //
    // Multi-fence safety: `sourceHash` is null when the file has more
    // than zero/one LC fences with a missing slug — the gate falls
    // through to rebuild in those cases (Pitfall 19-E drift detection
    // in debouncedWriter is the load-bearing path there).
    //
    // Blocker #1 — DO NOT mutate the on-screen widget's sourceHash.
    // The field is `public readonly` per LeetCodeFenceWidget.ts:40 and
    // its identity contract is content-hash-based (RESEARCH Pitfall
    // 19-F). Reference-stability of `this.decorations` is the only
    // mechanism this gate uses for the echo transaction.
    if (
      update.docChanged &&
      sourceHash !== null &&
      filePath !== null &&
      this.plugin.selfWriteSuppression
    ) {
      const peeked = this.plugin.selfWriteSuppression.peekExpectedHash(filePath);
      if (peeked !== null && peeked === sourceHash) {
        // Self-write echo — reuse on-screen DecorationSet by skipping
        // the assignment. `this.decorations` and `this.ranges` retain
        // their existing references, so CM6 sees no DecorationSet
        // change for THIS transaction and never calls widget.destroy().
        return;
      }
    }

    this.decorations = set;
    this.ranges = set;
  }
}

/**
 * Phase 19 Plan 01 — Live-Preview ViewPlugin factory.
 *
 * Returns an Extension that:
 *   1. Renders the leetcode-solve fence as a Decoration.replace widget
 *      (mounting the embedded EditorView via toDOM).
 *   2. Contributes the SAME RangeSet to EditorView.atomicRanges so the
 *      parent cursor cannot enter the widget range (WIDGET-02 / C-05).
 */
export function leetCodeFenceViewPlugin(plugin: PluginHost): Extension {
  return ViewPlugin.define(
    (view) => new LeetCodeLiveViewPlugin(view, plugin),
    {
      decorations: (v) => v.decorations,
      // CRITICAL: the SAME ranges set is exposed to atomicRanges so the
      // parent cursor can't land where the decoration replaces.
      provide: (pl) =>
        EditorView.atomicRanges.of((view) => {
          const inst = view.plugin(pl) as { ranges?: DecorationSet } | null;
          return inst?.ranges ?? Decoration.none;
        }),
    },
  );
}

