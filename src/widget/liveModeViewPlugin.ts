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
import { RangeSetBuilder, Transaction, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { editorInfoField, type Plugin, type TFile } from 'obsidian';
import { findCodeFence, extractFenceBody, computeFenceIndex } from './fenceLocator';
import { LeetCodeFenceWidget } from './LeetCodeFenceWidget';
import { djb2 } from './hash';
import type { WidgetMountHost } from './WidgetController';
import { syncAnnotation } from './childParentSync';
// Phase 21 Plan 21-02 Task 3 — Live Preview pre-mount migration trigger.
// Per Pitfall 6, the ViewPlugin update() is synchronous and CANNOT await
// the migrator. Fire-and-forget the migration call when fence.kind ===
// 'legacy'; vault.on('modify') re-fires update() after the migration
// completes and the v1.3 widget mounts on the rewritten fence in that
// later cycle. The legacy-kind branch returns the empty decoration set
// during the ~10–50ms migration window — a 'no widget' transitional
// state on legacy fences (ASCII fallback in the editor); per CONTEXT
// D-trigger-01 this is acceptable in Live Preview because Reading mode
// is the user-visible primary surface.
import { migrateLegacyFenceIfNeeded } from './fenceMigrator';
import { mountLegacyFenceBanner } from './legacyFenceBanner';

type PluginHost = Plugin & WidgetMountHost & {
  // Phase 21 — settings consulted by the legacy-kind fire-and-forget gate.
  // Optional methods so test fixtures that omit settings still typecheck.
  settings: WidgetMountHost['settings'] & {
    getUseInlineWidget?(): boolean;
    getAutoMigrateOnOpen?(): boolean;
    getDefaultLanguage?(): string;
  };
  // Phase 21 Plan 21-05 (WR-01) — cross-mode dedupe Set, hoisted from this
  // module to a Plugin-instance field on LeetCodePlugin (src/main.ts). Both
  // the Plan 21-05 workspace.on('file-open') Reading-mode trigger and this
  // legacy-kind Live Preview branch consume the SAME Set so a Reading-mode
  // trigger and a Live Preview trigger for the same file path do not race
  // (per-file lock, not per-mode lock). Plugin unload + reload starts with
  // a fresh empty Set on the new instance.
  migrateInFlight: Set<string>;
};

/**
 * Phase 21 Plan 21-02 Task 3 — Live Preview auto-migrating banner widget.
 *
 * Decoration.replace widget that mounts on the legacy fence range during
 * the migration window so the user never sees a 'no widget' transitional
 * state per D-trigger-01. Delegates DOM construction to
 * mountLegacyFenceBanner(... 'auto-migrating'); the banner unmounts when
 * the post-migration update() cycle replaces this decoration with the
 * v1.3 widget on the rewritten leetcode-solve fence.
 */
class AutoMigratingBannerWidget extends WidgetType {
  constructor(
    private readonly plugin: PluginHost,
    private readonly file: TFile,
    private readonly source: string,
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const host = document.createElement('div');
    host.classList.add('leetcode-migration-banner-host');
    mountLegacyFenceBanner(
      host,
      this.source,
      this.file,
      this.plugin as Parameters<typeof mountLegacyFenceBanner>[3],
      'auto-migrating',
    );
    return host;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof AutoMigratingBannerWidget &&
      other.file.path === this.file.path
    );
  }
}

/**
 * Build the RangeSet covering each `\`\`\`leetcode-solve` fence in the
 * visible doc. Used by BOTH the decorations field and the atomicRanges Facet
 * contribution — same RangeSet, no drift (RESEARCH Pattern 3 lines 263-272).
 *
 * Phase 20 Plan 20-09 — return shape collapses back to DecorationSet.
 * The Plan 20-06 widened return (sourceHash + filePath) was load-bearing
 * for the suppression-map peek gate; that gate retires in Plan 20-09
 * because real-time child→parent dispatch eliminates the parent
 * reload-from-disk echo that the gate was designed to suppress.
 */
function buildLeetCodeFenceRanges(
  view: EditorView,
  plugin: PluginHost,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const file = view.state.field(editorInfoField, false)?.file as TFile | null | undefined;
  if (!file) return builder.finish();

  // C-10: lc-slug frontmatter gate. Use metadataCache (consistent with v1.2
  // callsites at codeActionsEditorExtension.ts:248-251), NOT ctx.frontmatter
  // (loose-typed `any | null | undefined`).
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return builder.finish();
  }

  // Phase 20 Plan 20-09 — preferLeetCodeSolve skips stray legacy fences
  // (e.g., ```text/```javascript blocks added by recovery/repair tooling)
  // and finds the actual leetcode-solve fence even when it isn't the
  // first fence under ## Code.
  const fence = findCodeFence(view.state, { preferLeetCodeSolve: true });
  if (!fence) return builder.finish();

  // Phase 21 Plan 21-02 Task 3 — Live Preview pre-mount migration trigger.
  // When findCodeFence returns kind === 'legacy' AND the master gate +
  // auto-migrate gate are ON, fire-and-forget migrateLegacyFenceIfNeeded
  // (Pitfall 6 — update() is synchronous, cannot await). The
  // vault.on('modify') event re-fires update() after the migration
  // resolves; on that next pass, fence.kind will be 'leetcode-solve' and
  // the existing widget mount path takes over.
  //
  // Returns the empty decoration set during the ~10–50ms migration window;
  // the user sees raw markdown for the legacy fence briefly. CONTEXT
  // D-trigger-01 acknowledges this Live Preview tradeoff (the Reading
  // mode path is the primary user-visible surface for legacy notes).
  if (fence.kind === 'legacy') {
    const settings = plugin.settings;
    if (
      settings?.getUseInlineWidget?.() === true &&
      settings?.getAutoMigrateOnOpen?.() === true
    ) {
      // Mount the 'auto-migrating' banner widget on the legacy fence range
      // BEFORE firing the async migration. Per D-trigger-01 the user must
      // never see a 'no widget' transitional state on a legacy fence; the
      // banner is the synchronous bridge while migration runs. Banner
      // unmounts when the post-migration update() cycle sees
      // fence.kind === 'leetcode-solve' and the existing widget mount
      // path takes over.
      const legacyFrom = view.state.doc.line(fence.openerLine).from;
      const legacyTo = view.state.doc.line(fence.closerLine).to;
      const legacySource = extractFenceBody(view.state, fence);
      builder.add(
        legacyFrom,
        legacyTo,
        Decoration.replace({
          widget: new AutoMigratingBannerWidget(plugin, file, legacySource),
        }),
      );
      // Fire-and-forget migration (Pitfall 6 — synchronous update()).
      // Deduped via plugin.migrateInFlight (Phase 21 Plan 21-05 WR-01: the
      // Set is owned by the Plugin instance and shared with the
      // workspace.on('file-open') Reading-mode trigger so a Reading-mode
      // trigger and this Live Preview trigger for the same file path do
      // not race).
      if (!plugin.migrateInFlight.has(file.path)) {
        plugin.migrateInFlight.add(file.path);
        void migrateLegacyFenceIfNeeded(
          plugin.app as Parameters<typeof migrateLegacyFenceIfNeeded>[0],
          file,
          {
            autoMigrateOnOpen: true,
            defaultLanguage: settings.getDefaultLanguage?.() ?? 'python3',
          },
        )
          .catch(() => {
            // Defensive — Pattern S-05 silent-on-failure.
          })
          .finally(() => {
            plugin.migrateInFlight.delete(file.path);
          });
      }
    }
    return builder.finish();
  }
  if (fence.kind !== 'leetcode-solve') {
    return builder.finish();
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
    }),
  );

  return builder.finish();
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
    const set = buildLeetCodeFenceRanges(view, plugin);
    this.decorations = set;
    this.ranges = set;
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      const set = buildLeetCodeFenceRanges(update.view, this.plugin);
      this.decorations = set;
      this.ranges = set;
    }

    // Phase 20 Plan 20-09 Task 7 — parent → child sync push.
    //
    // When the parent CM6 receives a docChange that is NOT a child→parent
    // echo (i.e., not carrying our own `'leetcode.child-sync'` userEvent),
    // the change came from somewhere else — external Obsidian Sync, manual
    // edit in source mode, the language-switch dispatch (Task 6), the
    // ConflictModal "Keep external" path, etc. The child editor inside the
    // widget needs to receive that change so its in-memory state matches
    // what the parent now holds.
    //
    // We push the new fence body into the child via a single dispatch
    // annotated with `syncAnnotation.of(true)` so the child's
    // updateListener (createChildParentSyncExtension) treats this as a
    // parent→child echo and skips re-propagation back to the parent.
    if (!update.docChanged) return;
    // Skip parent→child push for ANY plugin-origin transaction (anything
    // with a 'leetcode.*' userEvent). Pushing back into the child after our
    // own writes would corrupt the redo stack — the child already has the
    // canonical state; a second dispatch with addToHistory.of(false)
    // (inside pushParentToChild) would invalidate any redo entries the user
    // had built up in the child editor.
    const isPluginEcho = update.transactions.some((tr) => {
      const ev = tr.annotation(Transaction.userEvent);
      return typeof ev === 'string' && ev.startsWith('leetcode.');
    });
    if (isPluginEcho) return;
    pushParentToChild(update.view, this.plugin);
  }
}

/**
 * Phase 20 Plan 20-09 Task 7 — push the current parent fence body into
 * the matching child editor (resolved via plugin.widgetRegistry by file
 * path). Aborts silently when no widget for this file is registered, when
 * the body matches the child already, or when the fence is missing/legacy.
 */
function pushParentToChild(view: EditorView, plugin: PluginHost): void {
  const file = view.state.field(editorInfoField, false)?.file as
    | TFile
    | null
    | undefined;
  if (!file) return;
  const fence = findCodeFence(view.state, { preferLeetCodeSolve: true });
  if (!fence || fence.kind !== 'leetcode-solve') return;
  const newBody = extractFenceBody(view.state, fence);

  // WR-05 (review-fix) — prefer the per-path iterator added to
  // WidgetRegistry. Falls back to the full values() walk when the
  // registry is a structural shape (test fixtures) that doesn't expose
  // valuesForPath.
  const registry = plugin.widgetRegistry as unknown as
    | {
        values(): Iterable<unknown>;
        valuesForPath?(path: string): Iterable<unknown>;
      }
    | undefined;
  if (!registry || typeof registry.values !== 'function') return;
  const iter =
    typeof registry.valuesForPath === 'function'
      ? registry.valuesForPath(file.path)
      : registry.values();

  for (const ctl of iter) {
    const candidate = ctl as unknown as {
      file?: { path?: string };
      view?: EditorView;
      writer?: { hasPending?: () => boolean };
    };
    if (candidate.file?.path !== file.path) continue;
    const childView = candidate.view;
    if (!childView) continue;

    // BL-05 (review-fix) — active-typing gate. Skip the parent→child
    // push when the widget's debounced disk writer has a pending flush
    // (writer.hasPending() === true). This guards the case where
    // Obsidian's auto-save reload races a keystroke: the auto-save
    // dispatches a parent docChange with no userEvent (so the
    // 'leetcode.*' bypass at the call site doesn't catch it), the
    // 250ms-debounced parent reload then dispatches a full-doc
    // replacement on the child with addToHistory.of(false), and CM6
    // clamps the child selection to the new doc length — vim cursor
    // jumps to end of doc.
    //
    // hasPending() is true while the user is actively typing (writer
    // armed but not yet flushed). When the writer is idle the parent
    // doc reflects the most recent on-disk content and the push is
    // safe — the child's state matches anyway, so the equality gate
    // below short-circuits in the common case.
    if (candidate.writer?.hasPending?.() === true) continue;

    // No-op when child already matches parent (avoids unnecessary
    // dispatches that pollute the child's history). Normalize trailing
    // whitespace + line endings before compare — the disk write may add a
    // trailing \n that the in-memory child doc doesn't carry.
    const childDoc = childView.state.doc.toString();
    const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    if (norm(childDoc) === norm(newBody)) continue;

    try {
      childView.dispatch({
        changes: { from: 0, to: childView.state.doc.length, insert: newBody },
        annotations: [
          syncAnnotation.of(true),
          Transaction.userEvent.of('leetcode.parent-sync'),
          Transaction.addToHistory.of(false),
        ],
      });
    } catch {
      // Defensive — child view may be in teardown.
    }
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

