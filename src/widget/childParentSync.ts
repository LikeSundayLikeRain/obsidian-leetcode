// Phase 20 Plan 20-09 (amended) — debounced child→parent CM6 sync.
//
// Architecture:
//   - Child EditorView holds the source of truth during active typing.
//   - Every 300ms of idle, the full child doc is compared to the parent's
//     fence body. If they differ, the parent fence body is replaced in a
//     single dispatch. This batches per-burst instead of per-keystroke,
//     so Obsidian's codeblock post-processor only re-fires once per typing
//     pause — and the registry-based survival in LeetCodeWidgetRenderChild
//     handles that re-fire without destroying the widget.
//   - Disk persistence is still handled by Obsidian's editor auto-save on
//     the parent (~2s after last parent docChange — well after our 300ms).
//
// Bidirectional echo prevention:
//   - Child→Parent: dispatch carries `userEvent: 'leetcode.child-sync'`.
//   - Parent→Child: dispatch carries `syncAnnotation.of(true)`.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Annotation,
  Transaction,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
import type { FenceLocation } from './fenceLocator';

export const syncAnnotation = Annotation.define<boolean>();

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Handle returned by createChildParentSyncExtension. Exposes `flushSync()`
 * for imperative callers (flush-on-unload, flush-on-leaf-change, Cmd-Q)
 * and `cancel()` for teardown.
 */
export interface ChildParentSyncHandle {
  flushSync(): void;
  cancel(): void;
}

/**
 * Build the debounced child→parent sync extension.
 *
 * Returns both the CM6 Extension (to install on the child) and a handle
 * with `flushSync()` / `cancel()` for imperative lifecycle callers.
 */
export function createChildParentSyncExtension(
  parentView: EditorView,
  getFence: () => FenceLocation | null,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): { extension: Extension; handle: ChildParentSyncHandle } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let childView: EditorView | null = null;

  function doFlush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!childView) return;

    const fence = getFence();
    if (!fence) return;

    const parentDoc = parentView.state.doc;
    if (
      fence.openerLine < 1 ||
      fence.closerLine > parentDoc.lines ||
      fence.closerLine - fence.openerLine < 1
    ) {
      return;
    }

    const bodyStart = parentDoc.line(fence.openerLine).to + 1;
    const bodyEnd = parentDoc.line(fence.closerLine).from;
    if (bodyStart > bodyEnd) return;

    const childDoc = childView.state.doc.toString();
    // The parent body range [bodyStart, bodyEnd) spans from after the opener's
    // newline to the start of the closer line — this INCLUDES the trailing \n
    // that separates the body from the closer. The child editor does NOT hold
    // that trailing newline in its doc (the codeblock processor's `source`
    // parameter strips it). We must append \n when inserting so the closer
    // stays on its own line.
    const childInsert = childDoc.endsWith('\n') ? childDoc : childDoc + '\n';
    const parentBody = parentDoc.sliceString(bodyStart, bodyEnd);

    if (childInsert === parentBody) return;

    try {
      parentView.dispatch({
        changes: { from: bodyStart, to: bodyEnd, insert: childInsert },
        annotations: [Transaction.userEvent.of('leetcode.child-sync')],
      });
    } catch {
      // Defensive — parent may be in teardown.
    }
  }

  function scheduleFlush(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(doFlush, debounceMs);
  }

  const handle: ChildParentSyncHandle = {
    flushSync: doFlush,
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      childView = null;
    },
  };

  const extension = EditorView.updateListener.of((update) => {
    childView = update.view;

    if (!update.docChanged) return;

    // Echo prevention: skip if this change came from parent→child push.
    if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;

    scheduleFlush();
  });

  return { extension, handle };
}
