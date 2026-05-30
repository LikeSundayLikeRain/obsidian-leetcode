// Phase 20 Plan 20-09 Task 2 — child→parent CM6 sync.
//
// The v1.3 widget hosts a child EditorView inside a Decoration.replace
// widget. Previously, child keystrokes accumulated in the child's own state
// and a debouncedWriter wrote to disk via vault.process every 400ms. Obsidian
// then reloaded the parent CM6 from disk, which transiently detached the
// widget DOM during line reflow and forced blur on the child's contentDOM →
// the user lost focus mid-typing.
//
// This module replaces that pipeline with the Tasks-plugin pattern:
// every child docChange dispatches a range-remapped change directly onto
// the parent CM6 doc. The parent stays in sync with the child in real time;
// disk persistence is handled by Obsidian's standard editor auto-save on
// the parent. No vault.process from the typing path → no disk-driven parent
// reload → no widget DOM detach → focus stays.
//
// Bidirectional echo prevention:
//   - Child→Parent: dispatch carries `userEvent: 'leetcode.child-sync'`.
//     The widget's ViewPlugin update sees this transaction but can't act on
//     it (the parent doc already matches the child).
//   - Parent→Child: when the parent dispatches a change to push content
//     INTO the child (e.g., language-switch body-swap, external-edit
//     reload), the dispatch carries `syncAnnotation.of(true)`. The child's
//     updateListener checks for this annotation and skips re-propagation.
//
// Simplified vs v1.2's createChildSyncExtension:
//   - No fence repair (v1.2 had `repairFenceStructure` for malformed
//     fences). v1.3's section-protection extension preserves fence
//     structure; if the fence goes missing mid-edit, we abort silently and
//     wait for the next real fence to mount.
//   - No multi-tab dual-CM6 coordination — CONTEXT L10 single-active-per-file
//     means we only ever sync one child to one parent at a time.
//   - No chevron-effect propagation; chevron updates flow through
//     metadataCache.on('changed') (Plan 20-08).

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Annotation,
  Transaction,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
import type { FenceLocation } from './fenceLocator';

/**
 * Annotation carried on parent→child dispatches so the child's
 * updateListener (the one this module installs) can detect the echo and
 * skip re-propagation back to the parent.
 *
 * Callers that push content INTO the child (language-switch body-swap,
 * external-edit reload) MUST attach `syncAnnotation.of(true)` to their
 * dispatch's annotations array.
 */
export const syncAnnotation = Annotation.define<boolean>();

/**
 * Build the child→parent sync extension.
 *
 * @param parentView - the parent EditorView (the MarkdownView's editor).
 * @param getFence   - closure that re-derives the leetcode-solve fence's
 *                     opener/closer line numbers from the parent's CURRENT
 *                     state. Called fresh on every child docChange because
 *                     prior child→parent dispatches may have shifted the
 *                     parent doc and offsets need to be recomputed.
 *                     Returns null when the fence is missing/malformed
 *                     (mid-edit) — the dispatch aborts silently and the
 *                     child's edit lives only in child state until the
 *                     fence is restored.
 */
export function createChildParentSyncExtension(
  parentView: EditorView,
  getFence: () => FenceLocation | null,
): Extension {
  return EditorView.updateListener.of((update) => {
    // Only fire on document changes.
    if (!update.docChanged) return;

    // Echo prevention: skip if any transaction in this update came from the
    // parent (carries syncAnnotation). Otherwise we'd re-dispatch the
    // parent's content right back into the parent on every external edit.
    if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;

    // Re-derive fence offsets from the parent's CURRENT state. Prior
    // child→parent dispatches may have shifted the leetcode-solve fence's
    // line numbers in the parent doc, so a stale closure-captured offset
    // would corrupt the parent.
    const fence = getFence();
    if (!fence) return; // fence missing/malformed — abort silently

    const parentDoc = parentView.state.doc;

    // Defensive bounds check — parent must be large enough to address the
    // fence's body range. If not (race during teardown), abort.
    if (
      fence.openerLine < 1 ||
      fence.closerLine > parentDoc.lines ||
      fence.closerLine - fence.openerLine < 1
    ) {
      return;
    }

    // Fence body span: [openerLine.to + 1, closerLine.from)
    //   - openerLine.to is the position at the end of the opener's text
    //     (before its trailing newline); +1 skips the newline so we land
    //     at the start of body line 1.
    //   - closerLine.from is the position at the start of the closer line.
    const bodyStart = parentDoc.line(fence.openerLine).to + 1;
    const bodyEnd = parentDoc.line(fence.closerLine).from;

    // Safety: empty fence body (closerLine immediately follows openerLine
    // with no body lines) — bodyStart can equal bodyEnd. Allow that;
    // remapped changes will still land at a valid offset.
    if (bodyStart > bodyEnd) return;

    // Remap child changes to parent offsets. The child's offsets are 0-based
    // within the child's doc; parent offsets = child offset + bodyStart.
    // Clamp to the fence body bounds defensively.
    const parentChanges: Array<{
      from: number;
      to: number;
      insert: string | import('@codemirror/state').Text;
    }> = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      const mappedFrom = Math.min(Math.max(fromA + bodyStart, bodyStart), bodyEnd);
      const mappedTo = Math.min(Math.max(toA + bodyStart, bodyStart), bodyEnd);
      parentChanges.push({
        from: mappedFrom,
        to: mappedTo,
        insert: inserted,
      });
    });

    if (parentChanges.length === 0) return;

    // Dispatch to the parent. Annotations:
    //   - userEvent 'leetcode.child-sync': allows the section-protection
    //     transactionFilter and the ViewPlugin to identify this as an
    //     internal sync (Phase 17 D-05 + CLAUDE.md `'leetcode.*'` bypass).
    //
    // NOTE (Plan 20-09 UAT bug-fix): we INTENTIONALLY do NOT carry
    // `Transaction.addToHistory.of(false)` here. Obsidian's auto-save
    // heuristic is tied to the parent CM6's history integration —
    // bypassing history with addToHistory.of(false) prevents auto-save
    // from firing, which means the child's typed edits never reach
    // disk. The Tasks plugin's canonical pattern (LivePreviewExtension.ts)
    // dispatches without ANY annotations and auto-save fires correctly
    // ~250 ms later. Under v1.3's "parent CM6 = in-memory editing
    // surface" architecture (Plan 20-09 amendment), the parent's undo
    // stack IS the canonical record for fence-body edits, so Cmd-Z on
    // the parent legitimately reverses the child's typing. The child
    // editor's own history Compartment still services in-widget Cmd-Z
    // for the user (separate undo stack inside the child).
    try {
      parentView.dispatch({
        changes: parentChanges,
        annotations: [Transaction.userEvent.of('leetcode.child-sync')],
      });
    } catch {
      // Defensive — parent view may be in teardown mid-update.
    }
  });
}
