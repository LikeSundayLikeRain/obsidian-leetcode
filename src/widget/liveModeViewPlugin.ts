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
import { Transaction, type Extension } from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  ViewPlugin,
  type ViewUpdate,
  EditorView,
} from '@codemirror/view';
import { editorInfoField, type Plugin, type TFile } from 'obsidian';
import { findCodeFence, extractFenceBody } from './fenceLocator';
import type { WidgetMountHost } from './WidgetController';
import { syncAnnotation } from './childParentSync';
import {
  leetCodeFenceStateFields,
  type StateFieldPluginHost,
} from './liveModeBannerStateField';

type PluginHost = Plugin & WidgetMountHost & {
  settings: WidgetMountHost['settings'] & {
    getUseInlineWidget?(): boolean;
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
    // push when the widget's debounced disk writer has a pending flush.
    if (candidate.writer?.hasPending?.() === true) continue;

    // No-op when child already matches parent.
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
