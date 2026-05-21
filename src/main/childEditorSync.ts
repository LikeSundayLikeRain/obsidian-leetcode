// Phase 14 Plan 01 — Bidirectional sync between child EditorView and parent document.
//
// Implements the CM6 split-view pattern:
//   - Child→Parent: user edits in child dispatch remapped changes to parent fence body
//   - Parent→Child: external writes (vault.process) dispatch replacement to child
//   - Echo prevention: syncAnnotation (parent→child), userEvent (child→parent)
//   - Fence repair: auto-recovers broken fence structure (undo-able)
//
// Depends on:
//   - findCodeFence (from codeActionsEditorExtension.ts — SSoT for fence detection)
//   - extractFenceBody (from nestedEditorExtension.ts — fence body extraction)
//   - ChildEditorRegistry (from childEditorRegistry.ts — lifecycle cache)

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Annotation,
  StateEffect,
  Transaction,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import { EditorView } from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import { findCodeFence } from './codeActionsEditorExtension';
import { extractFenceBody } from './nestedEditorExtension';
import { ChildEditorRegistry } from './childEditorRegistry';

/**
 * Structural type for the plugin host required by detectAndPropagateExternalChange.
 * Minimal surface — only what's needed for the lc-slug frontmatter gate.
 */
type PluginHost = Plugin & {
  childEditorRegistry: ChildEditorRegistry;
  app: {
    metadataCache: {
      getFileCache(file: { path: string }): { frontmatter?: Record<string, unknown> } | null;
    };
  };
};

// ────────────────────────────────────────────────────────────────────────
// Sync Annotation (D-09 echo prevention)
// ────────────────────────────────────────────────────────────────────────

/**
 * Annotation used on parent→child dispatches to prevent echo back to parent.
 * The child's updateListener checks for this annotation and skips propagation
 * when present.
 */
export const syncAnnotation = Annotation.define<boolean>();

// ────────────────────────────────────────────────────────────────────────
// Module-level state for tracking wired sync paths
// ────────────────────────────────────────────────────────────────────────

/**
 * Tracks file paths with active sync wiring (idempotency guard).
 * Exposed via class wrapper so plugin onunload can clear it without
 * relying on module-scope persistence across Obsidian plugin reload cycles (CR-01).
 */
export class SyncWiringState {
  private static paths = new Set<string>();
  static has(p: string) { return this.paths.has(p); }
  static add(p: string) { this.paths.add(p); }
  static delete(p: string) { this.paths.delete(p); }
  static clear() { this.paths.clear(); }
}

// ────────────────────────────────────────────────────────────────────────
// Child→Parent Sync Extension (D-01, D-02, D-09, D-10)
// ────────────────────────────────────────────────────────────────────────

/**
 * Creates an EditorView.updateListener extension for the child editor that
 * propagates document changes to the parent at the correct fence body offset.
 *
 * Per D-01: No debouncing — real-time sync.
 * Per D-02: Dispatches use userEvent 'leetcode.child-sync'.
 * Per D-09: Skips if transaction carries syncAnnotation (from parent).
 * Per D-10: Offsets always re-derived via findCodeFence at sync time.
 */
export function createChildSyncExtension(
  parentView: EditorView,
  _filePath: string,
  _registry: ChildEditorRegistry,
): Extension {
  return EditorView.updateListener.of((update) => {
    // Only fire on document changes
    if (!update.docChanged) return;

    // Echo prevention (D-09): skip if this update came from parent
    if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;

    // D-10: Always re-derive offsets via findCodeFence (never cached)
    const fence = findCodeFence(parentView.state);
    if (!fence) {
      // Attempt fence repair before giving up
      const repaired = repairFenceStructure(parentView);
      if (!repaired) return; // degraded — cannot sync
      // CR-04 fix: after repair, dispatch full-replace of child content to parent
      // rather than mapping incremental changes (repair shifted offsets)
      const fenceRetry = findCodeFence(parentView.state);
      if (!fenceRetry) return;
      const bodyStart = parentView.state.doc.line(fenceRetry.openerLine).to + 1;
      const bodyEnd = parentView.state.doc.line(fenceRetry.closerLine).from;
      if (bodyStart > bodyEnd) return;
      try {
        parentView.dispatch({
          changes: { from: bodyStart, to: bodyEnd, insert: update.view.state.doc.toString() },
          annotations: Transaction.userEvent.of('leetcode.child-sync'),
        });
      } catch { /* editor teardown */ }
      return;
    }

    propagateChildChanges(update, parentView, fence);
  });
}

/**
 * Internal helper: remaps child changes to parent offsets and dispatches.
 */
function propagateChildChanges(
  update: { changes: import('@codemirror/state').ChangeSet },
  parentView: EditorView,
  fence: { openerLine: number; closerLine: number },
): void {
  // D-10: derive bodyStart from fresh state
  const bodyStart = parentView.state.doc.line(fence.openerLine).to + 1;
  const bodyEnd = parentView.state.doc.line(fence.closerLine).from;

  // Defensive guard: validate offsets
  if (bodyStart > bodyEnd || bodyStart < 0 || bodyEnd > parentView.state.doc.length) {
    return;
  }

  // Remap child changes to parent offsets (WR-01: clamp to fence body bounds)
  const parentChanges: Array<{ from: number; to: number; insert: string | import('@codemirror/state').Text }> = [];
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

  // Dispatch to parent with 'leetcode.child-sync' userEvent (D-02)
  // Section lock Gate 0 passes this through (not input.*/delete.*/undo/redo)
  // NestedEditorExtension StateField fast-path maps decorations without rebuild
  try {
    parentView.dispatch({
      changes: parentChanges,
      annotations: Transaction.userEvent.of('leetcode.child-sync'),
    });
  } catch {
    // Silently ignore — the editor may be in teardown (defensive per project convention)
  }
}

// ────────────────────────────────────────────────────────────────────────
// Parent→Child Detection (D-03, D-04, D-08, D-09)
// ────────────────────────────────────────────────────────────────────────

/**
 * Detect external changes to the fence body in a parent transaction and
 * propagate them to the child editor.
 *
 * Called from the parent's nested editor StateField update when:
 *   tr.docChanged && !userEvent.startsWith('leetcode.')
 *
 * Per D-03: Uses dispatch (not setState) to preserve undo history.
 * Per D-04: Editing outside the fence does not corrupt child content.
 * Per D-08: Sync covers fence BODY only — extractFenceBody excludes markers.
 * Per D-09: Parent→child dispatches carry syncAnnotation.of(true).
 */
export function detectAndPropagateExternalChange(
  tr: Transaction,
  plugin: PluginHost,
  registry: ChildEditorRegistry,
): void {
  // lc-slug frontmatter gate (same pattern as nestedEditorExtension.ts:153-159)
  const file = tr.state.field(editorInfoField)?.file;
  if (!file) return;

  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) return;

  // Get fence in NEW state (post-transaction)
  const fence = findCodeFence(tr.state);
  if (!fence) return;

  // Compute fence body range in the NEW document
  const bodyStart = tr.state.doc.line(fence.openerLine).to + 1;
  const bodyEnd = tr.state.doc.line(fence.closerLine).from;

  // Check if any changed range overlaps with the fence body
  // We check in the NEW document positions (post-change)
  let overlaps = false;
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    // fromB/toB are positions in the NEW document
    if (fromB < bodyEnd && toB > bodyStart) {
      overlaps = true;
    }
  });

  if (!overlaps) return;

  // Get child from registry
  const childView = registry.get(file.path);
  if (!childView) return;

  // Extract new fence body content (D-08: excludes markers)
  const newContent = extractFenceBody(tr.state, fence);

  // Dispatch full replacement to child (D-03: preserves undo history)
  try {
    childView.dispatch({
      changes: {
        from: 0,
        to: childView.state.doc.length,
        insert: newContent,
      },
      annotations: syncAnnotation.of(true), // D-09: prevent echo back
    });
  } catch {
    // Silently ignore — child may be in teardown
  }
}

// ────────────────────────────────────────────────────────────────────────
// Sync Wiring (idempotent)
// ────────────────────────────────────────────────────────────────────────

/**
 * Wire the sync extension on a child editor if not already wired.
 * Idempotent — second call for the same filePath is a no-op.
 *
 * Uses StateEffect.appendConfig to add the updateListener extension
 * to the child's configuration without destroying its state.
 */
export function wireSyncIfNeeded(
  parentView: EditorView,
  childView: EditorView,
  filePath: string,
  registry: ChildEditorRegistry,
): void {
  if (SyncWiringState.has(filePath)) return;

  const syncExt = createChildSyncExtension(parentView, filePath, registry);

  try {
    childView.dispatch({
      effects: StateEffect.appendConfig.of(syncExt),
    });
  } catch {
    // Silently ignore — child may be in teardown
    return;
  }

  SyncWiringState.add(filePath);
}

/**
 * Remove a file path from the wired set, allowing re-wiring.
 * Called on registry eviction or explicit file close.
 *
 * Special key '__all__' clears all wired paths (for testing).
 */
export function unwireSync(filePath: string): void {
  if (filePath === '__all__') {
    SyncWiringState.clear();
    return;
  }
  SyncWiringState.delete(filePath);
}

// ────────────────────────────────────────────────────────────────────────
// Fence Repair (D-05, D-06, D-07)
// ────────────────────────────────────────────────────────────────────────

/**
 * Attempt to repair broken fence structure when findCodeFence returns null.
 *
 * Per D-07: Scans for ## Code heading, determines section boundaries.
 * Per D-05: Repair dispatches use userEvent 'leetcode.fence-repair' (undo-able).
 * Per D-06: Standard CM6 history handles undo of repairs.
 *
 * @returns true if repair succeeded (fence structure restored), false if
 * ## Code heading not found or fence is already intact.
 */
export function repairFenceStructure(parentView: EditorView): boolean {
  const state = parentView.state;
  const doc = state.doc;
  const total = doc.lines;

  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;
  const FENCE_RE = /^\s*```/;

  // Step 1: Find ## Code heading
  let codeHeadingLine = -1;
  for (let i = 1; i <= total; i++) {
    if (H2_CODE_RE.test(doc.line(i).text)) {
      codeHeadingLine = i;
      break;
    }
  }
  if (codeHeadingLine === -1) return false;

  // Step 2: Find section end (next ## heading or EOF)
  let sectionEndLine = total;
  for (let i = codeHeadingLine + 1; i <= total; i++) {
    if (H2_ANY_RE.test(doc.line(i).text)) {
      sectionEndLine = i - 1;
      break;
    }
  }

  // Step 3: Scan for fence opener and closer within the Code section
  let openerLine = -1;
  let closerLine = -1;
  for (let i = codeHeadingLine + 1; i <= sectionEndLine; i++) {
    if (FENCE_RE.test(doc.line(i).text)) {
      if (openerLine === -1) {
        openerLine = i;
      } else {
        closerLine = i;
        break;
      }
    }
  }

  // If both are present, fence is intact — nothing to repair
  if (openerLine !== -1 && closerLine !== -1) return false;

  // Step 4: Determine what's missing and repair
  const changes: Array<{ from: number; insert: string }> = [];

  if (openerLine === -1) {
    // Missing opener — insert at start of code section body (line after heading)
    const insertPos = doc.line(codeHeadingLine).to + 1;
    changes.push({ from: insertPos, insert: '```\n' });
  }

  if (closerLine === -1) {
    // Missing closer — insert at end of code section
    if (openerLine !== -1) {
      // Opener exists, closer missing — insert before section end
      const insertPos = doc.line(sectionEndLine).to;
      changes.push({ from: insertPos, insert: '\n```' });
    } else {
      // Both missing — insert opener + empty body + closer as a single change
      changes.push({ from: doc.line(codeHeadingLine).to + 1, insert: '```\n\n```\n' });
    }
  }

  if (changes.length === 0) return false;

  // Dispatch repair with 'leetcode.fence-repair' userEvent (D-05)
  try {
    parentView.dispatch({
      changes,
      annotations: Transaction.userEvent.of('leetcode.fence-repair'),
    });
  } catch {
    // Silently ignore — editor may be in teardown
    return false;
  }

  return true;
}
