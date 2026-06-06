// Phase 19 Plan 01 — Live-Preview ViewPlugin contributing parent→child
// sync push and the migration fire-and-forget trigger. As of Plan 21-11
// Task 2 the Decoration.replace emission has moved into separate
// StateFields (src/widget/liveModeBannerStateField.ts) — CM6's contract
// requires line-break-spanning Decoration.replace to come from a
// StateField (transaction-time), not a ViewPlugin (build-time). See
// .planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md for the
// scope decision (fix BOTH the legacy banner AND the v1.3 widget).
//
// CONTEXT references:
//   - C-02: ViewPlugin + Decoration.replace WAS the Live-Preview mount
//     path; Plan 21-11 moves this onto StateFields.
//   - C-05: EditorView.atomicRanges Facet contribution prevents the
//     parent cursor from entering the fence range — now contributed via
//     each StateField's `provide` hook.
//   - C-10: lc-slug frontmatter gate (only mount on LC notes) — same
//     gate, now applied inside the StateField build helpers.
//
// What the ViewPlugin still owns post-Plan-21-11:
//   1. parent → child sync push (Plan 20-09 Task 7) — pushes parent doc
//      changes into the embedded child editor when the change came from
//      somewhere other than a 'leetcode.*' userEvent.
//
// What moved out (now in liveModeBannerStateField.ts):
//   - legacy-kind decoration build (AutoMigratingBannerWidget +
//     ManualPromptBannerWidget — built into legacyBannerStateField).
//   - v1.3 leetcode-solve decoration build (LeetCodeFenceWidget — built
//     into leetCodeWidgetStateField).
//   - atomicRanges contribution (now from each StateField's provide
//     hook).
//   - The fire-and-forget migration trigger for the legacy fence under
//     autoMigrateOnOpen=ON — moved into buildLegacyBannerDecorations
//     where it stays as a side-effect of the StateField build (see
//     liveModeBannerStateField.ts for justification).

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  ChangeSet,
  EditorSelection,
  Transaction,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  ViewPlugin,
  type ViewUpdate,
  EditorView,
} from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import { findCodeFence, extractFenceBody } from './fenceLocator';
import type { WidgetMountHost } from './WidgetController';
import { syncAnnotation } from './childParentSync';
import {
  leetCodeFenceStateFields,
  type StateFieldPluginHost,
} from './liveModeBannerStateField';

type PluginHost = Plugin & WidgetMountHost & {
  settings: WidgetMountHost['settings'] & {
    getAutoMigrateOnOpen?(): boolean;
    getDefaultLanguage?(): string;
  };
  migrateInFlight: Set<string>;
};

/**
 * Phase 21 Plan 21-11 — the ViewPlugin retains ONLY the parent→child
 * sync push. Decoration.replace emission and atomicRanges contribution
 * are now hosted by the two StateFields in liveModeBannerStateField.ts.
 */
class LeetCodeLiveViewPlugin {
  constructor(_view: EditorView, private readonly plugin: PluginHost) {}

  update(update: ViewUpdate): void {
    // Phase 20 Plan 20-09 Task 7 — parent → child sync push.
    //
    // When the parent CM6 receives a docChange that is NOT a child→parent
    // echo (i.e., not carrying our own `'leetcode.child-sync'` userEvent),
    // the change came from somewhere else — external Obsidian Sync, manual
    // edit in source mode, the language-switch dispatch, the ConflictModal
    // "Keep external" path, etc. The child editor inside the widget needs
    // to receive that change so its in-memory state matches what the
    // parent now holds.
    //
    // We push the new fence body into the child via a single dispatch
    // annotated with `syncAnnotation.of(true)` so the child's
    // updateListener (createChildParentSyncExtension) treats this as a
    // parent→child echo and skips re-propagation back to the parent.
    if (!update.docChanged) return;
    // Skip parent→child push for ANY plugin-origin transaction (anything
    // with a 'leetcode.*' userEvent). Pushing back into the child after
    // our own writes would corrupt the redo stack — the child already has
    // the canonical state; a second dispatch with addToHistory.of(false)
    // (inside pushParentToChild) would invalidate any redo entries the
    // user had built up in the child editor.
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
  const file = view.state.field(editorInfoField, false)?.file;
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
    const candidate = ctl as {
      file?: { path?: string };
      view?: EditorView;
      writer?: { hasPending?: () => boolean };
      syncHandle?: { hasPending?: () => boolean; flushSync?: () => void };
    };
    if (candidate.file?.path !== file.path) continue;
    const childView = candidate.view;
    if (!childView) continue;

    // BL-05 (review-fix) — active-typing gate. Skip the parent→child
    // push when the widget's debounced disk writer has a pending flush.
    if (candidate.writer?.hasPending?.() === true) continue;

    // Rollback-prevention gate (debug session
    // vim-cursor-jumps-to-widget-start follow-up). When the child→parent
    // sync has a pending flush, the child holds typing the parent has
    // not yet absorbed. Pushing the current parent body into the child
    // would discard those un-synced characters. Skip the push — the
    // child is the source of truth during the 300ms debounce window;
    // the next child→parent flush will bring them back into sync. We
    // cannot run flushSync() synchronously here because pushParentToChild
    // executes inside the parent's ViewPlugin.update() and CM6 throws on
    // re-entrant view.dispatch() during an update.
    if (candidate.syncHandle?.hasPending?.() === true) continue;

    // No-op when child already matches parent.
    const childDoc = childView.state.doc.toString();
    const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    if (norm(childDoc) === norm(newBody)) continue;

    // Compute a minimal ChangeSpec (longest common prefix + suffix) and map
    // the child's current selection forward through it. A full-doc replace
    // (`from: 0, to: childDoc.length`) collapses every selection coordinate
    // to offset 0 — visible to the user as the cursor jumping to the
    // top-left of the widget mid-typing whenever the parent CM6 reflows
    // (e.g., Obsidian's editor auto-save fires while the child has typing
    // ahead of the last 300ms child→parent flush).
    //
    // Mirrors WidgetController.applyPeerSync (Plan 21-17): same LCP/LCS +
    // ChangeSet.mapPos(forward-bias) shape that already handles the
    // analogous case for split-pane peers.
    const oldLen = childDoc.length;
    const newLen = newBody.length;
    let prefixLen = 0;
    const maxPrefix = Math.min(oldLen, newLen);
    while (
      prefixLen < maxPrefix &&
      childDoc.charCodeAt(prefixLen) === newBody.charCodeAt(prefixLen)
    ) {
      prefixLen++;
    }
    let suffixLen = 0;
    const maxSuffix = Math.min(oldLen - prefixLen, newLen - prefixLen);
    while (
      suffixLen < maxSuffix &&
      childDoc.charCodeAt(oldLen - 1 - suffixLen) ===
        newBody.charCodeAt(newLen - 1 - suffixLen)
    ) {
      suffixLen++;
    }
    const spec = {
      from: prefixLen,
      to: oldLen - suffixLen,
      insert: newBody.slice(prefixLen, newLen - suffixLen),
    };

    let mappedSelection: EditorSelection;
    try {
      const changes = ChangeSet.of(spec, oldLen);
      const ranges = childView.state.selection.ranges.map((r) =>
        EditorSelection.range(
          changes.mapPos(r.anchor, 1),
          changes.mapPos(r.head, 1),
        ),
      );
      mappedSelection = EditorSelection.create(
        ranges,
        childView.state.selection.mainIndex,
      );
    } catch {
      // Aborting is strictly safer than slamming the cursor to
      // prefixLen — when divergence starts at byte 0 (e.g. the very
      // first char of the fence body changed), prefixLen=0 collapses
      // every selection coordinate to offset 0 and the user sees the
      // cursor jump to the top-left of the widget mid-typing. The next
      // sync trigger will reconcile; one skipped iteration is invisible
      // and a ChangeSet.of throw implies malformed spec geometry where
      // dispatching anyway is also wrong.
      continue;
    }

    try {
      childView.dispatch({
        changes: spec,
        selection: mappedSelection,
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
 * Phase 19 Plan 01 / Phase 21 Plan 21-11 — Live-Preview Extension factory.
 *
 * Returns an Extension array that installs:
 *   1. `legacyBannerStateField` (v1.2 banner; PHASE_22_DELETE_WITH_V1_2_PATH).
 *   2. `leetCodeWidgetStateField` (permanent v1.3 widget host).
 *   3. The ViewPlugin owning the parent→child sync push.
 *
 * The two StateFields contribute to BOTH `EditorView.decorations` and
 * `EditorView.atomicRanges` Facets via their `provide` hooks. The
 * ViewPlugin no longer publishes decorations directly; that's why CM6's
 * "line-break-spanning Decoration.replace must come from a StateField"
 * contract is now satisfied (Plan 21-11 Task 1 investigation, UAT 4b).
 *
 * Order matters: StateFields appear BEFORE the ViewPlugin so transaction
 * processing applies StateField updates first; the ViewPlugin's
 * docChanged detection in update() then fires AFTER the StateFields have
 * absorbed the same transaction.
 */
export function leetCodeFenceViewPlugin(plugin: PluginHost): Extension {
  return [
    ...leetCodeFenceStateFields(plugin as StateFieldPluginHost),
    ViewPlugin.define((view) => new LeetCodeLiveViewPlugin(view, plugin)),
  ];
}
