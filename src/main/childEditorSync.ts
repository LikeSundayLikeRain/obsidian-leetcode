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
import { editorInfoField, MarkdownView, TFile, type Plugin } from 'obsidian';
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
      // Phase 17: derive activeSlug from the parent doc's `lc-language`
      // frontmatter (read directly from doc text since createChildSyncExtension
      // doesn't have a plugin/metadataCache handle); fall back to 'python3'
      // matching the convention in nestedEditorExtension.ts:216.
      // See .planning/debug/fence-auto-recovery-regression.md.
      const activeSlug = readLcLanguageFromDoc(parentView.state) ?? 'python3';
      // Attempt fence repair before giving up
      const repaired = repairFenceStructure(parentView, activeSlug);
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
          annotations: [
            Transaction.userEvent.of('leetcode.child-sync'),
            Transaction.addToHistory.of(false),
          ],
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
      annotations: [
        Transaction.userEvent.of('leetcode.child-sync'),
        Transaction.addToHistory.of(false),
      ],
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
  app?: import('obsidian').App,
): void {
  if (SyncWiringState.has(filePath)) return;

  const syncExt = createChildSyncExtension(parentView, filePath, registry);
  // Phase 17 Plan 13: parent-side repair listener — Bug 1 (runtime trigger
  // gap). Appended once per (leaf, file) pair on first widget mount so
  // parent-only fence damage (e.g., Source Mode closer deletion) gets
  // repaired WITHIN ONE PARENT TRANSACTION without requiring a child
  // dispatch or app reload. See
  // .planning/debug/fence-auto-recovery-regression-round2.md.
  const parentRepairExt = createParentRepairExtension(app);

  try {
    childView.dispatch({
      effects: StateEffect.appendConfig.of(syncExt),
    });
    parentView.dispatch({
      effects: StateEffect.appendConfig.of(parentRepairExt),
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
// Scroll Into View (D-14)
// ────────────────────────────────────────────────────────────────────────

/**
 * Creates an updateListener that scrolls the parent viewport to keep the
 * child's cursor visible when typing at the bottom of the code area.
 *
 * Gated: only fires on user-originated changes (not sync from parent via
 * syncAnnotation — Pitfall 4 prevention). Uses coordsAtPos to locate
 * the cursor in viewport coordinates and scrolls the parent scroll
 * container if the cursor falls below the visible area.
 *
 * Ref: D-14 (auto-scroll into view when typing causes cursor to go below viewport).
 */
export function createScrollIntoViewExtension(): Extension {
  return EditorView.updateListener.of((update) => {
    try {
      if (!update.docChanged && !update.selectionSet) return;

      // Echo prevention gate (Pitfall 4): skip sync-originated updates
      if (update.transactions.some((tr) => tr.annotation(syncAnnotation))) return;

      // Get cursor coordinates in viewport
      const coords = update.view.coordsAtPos(update.state.selection.main.head);
      if (!coords) return;

      // Find the PARENT scroll container (not the child's own .cm-scroller)
      // Traverse: child .cm-editor -> .lc-nested-editor -> parent .cm-editor -> parent .cm-scroller
      const parentScroller =
        update.view.dom
          .closest('.cm-editor')
          ?.parentElement?.closest('.cm-editor')
          ?.querySelector(':scope > .cm-scroller') ??
        update.view.dom.closest('.workspace-leaf-content');

      if (!parentScroller) return;

      const scrollerRect = parentScroller.getBoundingClientRect();
      const margin = 40; // px of breathing room below cursor

      if (coords.bottom > scrollerRect.bottom - margin) {
        // Cursor below visible area — scroll down to keep it in view
        parentScroller.scrollTop += (coords.bottom - scrollerRect.bottom + margin);
      }
    } catch {
      // Silently ignore — defensive per project convention
    }
  });
}

// ────────────────────────────────────────────────────────────────────────
// Parent-side Repair Trigger (Phase 17 Plan 13 — REPAIR-02 Bug 1)
// ────────────────────────────────────────────────────────────────────────

/**
 * Phase 17 Plan 13: parent-side `EditorView.updateListener` that calls
 * `repairFenceStructure` when the parent doc enters a `findCodeFence === null`
 * state due to PARENT-only damage (e.g., Source Mode keystrokes that delete
 * the fence closer line). Closes the round-2 runtime trigger gap (Bug 1) —
 * before this extension, repair was reachable only via the CHILD-side
 * updateListener in `createChildSyncExtension`, which observes child-doc
 * changes only.
 *
 * Re-entry guard: skips when any transaction in the update carries
 * `'leetcode.fence-repair'` userEvent — prevents the listener from firing
 * repair on its own dispatch (which would loop the parent-update cycle).
 *
 * Code-section gate: fires repair only when `findCodeFence(state) === null`,
 * which already implies the damage is in the Code section (the only place
 * `findCodeFence` reads). No additional Code-section overlap probe is
 * required — `findCodeFence` already encapsulates that check.
 *
 * Wired into the parent CM6 view via `wireSyncIfNeeded` (which runs once
 * per (leaf, file) pair on first widget mount via `SyncWiringState`
 * idempotency). See `wireSyncIfNeeded` for the appendConfig site.
 *
 * See .planning/debug/fence-auto-recovery-regression-round2.md.
 */
export function createParentRepairExtension(app?: import('obsidian').App): Extension {
  return EditorView.updateListener.of((update) => {
    // Only fire on document changes — selection-only / focus updates can't
    // damage the fence.
    if (!update.docChanged) return;

    // Phase 17 Plan 13: re-entry guard. Skip when this update carries our
    // own repair dispatch userEvent so we don't loop on the dispatch we
    // just emitted. Bug 2 Hyp D defense (see debug doc round-2 Hyp D
    // verdict — refuted as a within-cycle re-entry mechanism in the
    // shipped wiring, but the new parent-side listener MUST guard
    // explicitly because it now CAN observe parent-side dispatches).
    if (
      update.transactions.some(
        (tr) => tr.annotation(Transaction.userEvent) === 'leetcode.fence-repair',
      )
    ) {
      return;
    }

    // Damage gate: only fire when the parent's fence is broken.
    // findCodeFence walks the doc looking for the `## Code` section's
    // first `\`\`\`<lang>` opener and matching closer; null means the
    // fence is structurally broken (or the section doesn't exist).
    if (findCodeFence(update.state) !== null) return;

    // Phase 18: derive activeSlug from metadataCache (reliable at reload
    // time — cached from previous session). Falls back to doc-text scan.
    // The metadataCache path also gates on lc-slug presence, preventing
    // repair from firing on partially-loaded docs or non-LC notes at
    // reload time (fixes the "inserts python3 fence on reload" bug).
    let activeSlug: string | null = null;

    if (app) {
      try {
        const file = update.state.field(editorInfoField)?.file;
        if (file) {
          const fm = app.metadataCache.getFileCache(file)?.frontmatter as
            | Record<string, unknown>
            | undefined;
          if (typeof fm?.['lc-slug'] !== 'string') return;
          const lcLang = fm['lc-language'];
          if (typeof lcLang === 'string' && lcLang.length > 0) {
            activeSlug = lcLang;
          }
        }
      } catch {
        // editorInfoField not available in all contexts (e.g., tests)
      }
    }

    if (!activeSlug) {
      activeSlug = readLcLanguageFromDoc(update.state);
    }
    if (!activeSlug) return;

    // Fire repair on the parent view — the round-1 fix in
    // repairFenceStructure handles the marker-disambiguation +
    // body-aware insertion + activeSlug-aware opener tag. Round-1 fix
    // is preserved verbatim by Plan 17-13.
    repairFenceStructure(update.view, activeSlug);
  });
}

// ────────────────────────────────────────────────────────────────────────
// Fence Repair (D-05, D-06, D-07) — round-1 fix preserved verbatim
// ────────────────────────────────────────────────────────────────────────

/**
 * Phase 17: parse `lc-language` directly from the parent doc's YAML
 * frontmatter. createChildSyncExtension does not have a plugin/metadataCache
 * handle, and we want repair to use the canonical language slug so the
 * inserted opener carries the right tag (preserving the chevron / fm /
 * fence-opener 4-sources-of-truth invariant — same family as the Phase 16
 * reset-code-language-regression fix). Returns null when no frontmatter or
 * no lc-language key — caller falls back to a sensible default.
 *
 * See .planning/debug/fence-auto-recovery-regression.md "Planned Fix Scope".
 */
function readLcLanguageFromDoc(state: import('@codemirror/state').EditorState): string | null {
  const doc = state.doc;
  if (doc.lines === 0) return null;
  // Frontmatter must start at line 1 with `---` and end at the next `---`.
  if (doc.line(1).text.trim() !== '---') return null;
  const total = doc.lines;
  for (let i = 2; i <= total; i++) {
    const text = doc.line(i).text;
    if (text.trim() === '---') return null; // end of fm without lc-language
    const match = /^\s*lc-language\s*:\s*(.+?)\s*$/.exec(text);
    if (match) {
      const raw = match[1] ?? '';
      // Strip surrounding quotes if present (`"java"` or `'java'`).
      const cleaned = raw.replace(/^['"]|['"]$/g, '').trim();
      return cleaned.length > 0 ? cleaned : null;
    }
  }
  return null;
}

/**
 * Attempt to repair broken fence structure when findCodeFence returns null.
 *
 * Per D-07: Scans for ## Code heading, determines section boundaries.
 * Per D-05: Repair dispatches use userEvent 'leetcode.fence-repair' (undo-able).
 * Per D-06: Standard CM6 history handles undo of repairs.
 *
 * Phase 17 (D-06b/D-06c hypothesis a fix): repair must distinguish a surviving
 * fence OPENER (line ends with a language tag — e.g. ` ```python `) from a
 * surviving CLOSER (bare ` ``` `) so it can correctly identify which marker
 * went missing. Pre-fix, the FENCE_RE pattern matched both, the surviving
 * marker was always treated as the opener, and missing-opener / both-missing
 * inputs orphaned the user's body content outside the new fence. Pre-fix,
 * the inserted opener also lacked a language tag — breaking the chevron / fm /
 * fence-opener 4-sources-of-truth invariant. Both bugs are addressed by:
 *   1. OPENER_RE / CLOSER_RE language-tag-aware patterns
 *   2. Body-aware insertion: opener lands ABOVE the first body line; closer
 *      lands BELOW the last body line (when both are missing)
 *   3. activeSlug threaded through so inserted openers carry the right tag
 *
 * See .planning/debug/fence-auto-recovery-regression.md.
 *
 * @param parentView the parent CM6 EditorView whose doc has a damaged fence
 * @param activeSlug the language slug for the file (typically read from
 *   `lc-language` frontmatter); used as the inserted opener's tag. Caller
 *   falls back to `'python3'` when frontmatter is unavailable.
 * @returns true if repair succeeded (fence structure restored), false if
 *   ## Code heading not found or fence is already intact.
 */
export function repairFenceStructure(parentView: EditorView, activeSlug: string = 'python3'): boolean {
  const state = parentView.state;
  const doc = state.doc;
  const total = doc.lines;

  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;
  // Phase 17: language-tag awareness — opener must carry a non-empty tag,
  // closer must be bare (whitespace only after the backticks).
  const OPENER_RE = /^\s*```\S+\s*$/;
  const CLOSER_RE = /^\s*```\s*$/;

  // Step 1: Find ## Code heading
  let codeHeadingLine = -1;
  for (let i = 1; i <= total; i++) {
    if (H2_CODE_RE.test(doc.line(i).text)) {
      codeHeadingLine = i;
      break;
    }
  }
  if (codeHeadingLine === -1) return false;

  // Step 2: Find section end (next ## heading or EOF). sectionEndLine is the
  // last line BELONGING to the Code section (inclusive).
  let sectionEndLine = total;
  for (let i = codeHeadingLine + 1; i <= total; i++) {
    if (H2_ANY_RE.test(doc.line(i).text)) {
      sectionEndLine = i - 1;
      break;
    }
  }

  // Step 3: Phase 17 marker-disambiguation scan — separately track opener
  // (line with a language tag) and closer (bare backticks). A line that
  // matches OPENER_RE counts as an opener; a line matching CLOSER_RE counts
  // as a closer. If multiple openers / closers appear, the first of each
  // wins (consistent with findCodeFence's first-match-in-Code-section rule).
  let openerLine = -1;
  let closerLine = -1;
  for (let i = codeHeadingLine + 1; i <= sectionEndLine; i++) {
    const text = doc.line(i).text;
    if (openerLine === -1 && OPENER_RE.test(text)) {
      openerLine = i;
      continue;
    }
    if (closerLine === -1 && CLOSER_RE.test(text)) {
      closerLine = i;
      continue;
    }
  }

  // If both are present, fence is intact — nothing to repair
  if (openerLine !== -1 && closerLine !== -1) return false;

  // Step 4: Phase 17 — locate the user's body content inside the Code
  // section. Body lines = any line in [codeHeadingLine+1, sectionEndLine]
  // that is NOT blank and NOT a fence marker. firstBodyLine / lastBodyLine
  // are 1-indexed line numbers; -1 when the section has no body content.
  let firstBodyLine = -1;
  let lastBodyLine = -1;
  for (let i = codeHeadingLine + 1; i <= sectionEndLine; i++) {
    if (i === openerLine || i === closerLine) continue;
    const text = doc.line(i).text;
    if (text.trim() === '') continue; // skip blank lines
    if (firstBodyLine === -1) firstBodyLine = i;
    lastBodyLine = i;
  }

  // Step 5: Determine what's missing and repair, preserving the user's body
  // content INSIDE the new fence. All inserted openers carry activeSlug.
  const changes: Array<{ from: number; insert: string }> = [];
  const newOpener = '```' + activeSlug;

  if (openerLine === -1 && closerLine === -1) {
    // Both missing.
    if (firstBodyLine === -1) {
      // No body content — empty fence after `## Code` heading.
      changes.push({ from: doc.line(codeHeadingLine).to + 1, insert: newOpener + '\n\n```\n' });
    } else {
      // Insert opener IMMEDIATELY ABOVE first body line, closer
      // IMMEDIATELY BELOW last body line — body stays in place between.
      // Two separate insertions; sort applied during dispatch.
      changes.push({
        from: doc.line(firstBodyLine).from,
        insert: newOpener + '\n',
      });
      changes.push({
        from: doc.line(lastBodyLine).to,
        insert: '\n```',
      });
    }
  } else if (openerLine === -1) {
    // Missing opener only — surviving closer is at closerLine. Insert opener
    // ABOVE the first body line so the user's body is INSIDE the new fence
    // (between new opener and surviving closer). When there's no body content
    // between `## Code` and the closer, insert opener immediately above the
    // closer.
    const insertPos =
      firstBodyLine !== -1
        ? doc.line(firstBodyLine).from
        : doc.line(closerLine).from;
    changes.push({ from: insertPos, insert: newOpener + '\n' });
  } else if (closerLine === -1) {
    // Missing closer only — surviving opener is at openerLine. Insert closer
    // BELOW the last body line (or at section end when no body content).
    const insertPos =
      lastBodyLine !== -1
        ? doc.line(lastBodyLine).to
        : doc.line(sectionEndLine).to;
    changes.push({ from: insertPos, insert: '\n```' });
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

// ────────────────────────────────────────────────────────────────────────
// Phase 18 Plan 02 — vault.on('modify') runtime repair trigger (D-33)
// ────────────────────────────────────────────────────────────────────────

/**
 * Phase 18 Plan 02: minimal plugin host surface for the vault-modify repair
 * trigger. Only what's needed to (a) read the active MarkdownView, (b) read
 * frontmatter via metadataCache, (c) register an EventRef for auto-cleanup.
 */
export interface VaultModifyRepairPluginHost {
  app: import('obsidian').App;
  registerEvent(eventRef: import('obsidian').EventRef): void;
}

/**
 * Phase 18 Plan 02 — registers a `vault.on('modify')` listener that fires
 * `repairFenceStructure` for active LC problem notes when the parent CM6
 * state shows a damaged fence (`findCodeFence === null`).
 *
 * Closes the gap where vim's `dd` Normal-mode keystroke on the fence closer
 * line edits the doc via Obsidian's vault layer, bypassing CM6 transactions
 * that the existing `createParentRepairExtension` updateListener observes.
 *
 * **Three short-circuit gates** ensure the listener is surgical and never
 * fires spuriously:
 *
 * 1. **lc-slug gate (D-33):** the modified file's frontmatter must carry an
 *    `lc-slug` key — restricts the trigger to LC problem notes, never to
 *    arbitrary vault edits.
 * 2. **active-view gate:** the modified file must equal the active
 *    MarkdownView's file — repair only the editor the user is looking at,
 *    not background-loaded notes.
 * 3. **damage gate:** `findCodeFence(parentView.state) === null` — same
 *    gate as Plan 17-13's `createParentRepairExtension`. The chevron's
 *    atomic CM6 transaction at `switchFenceLanguage` (src/main.ts:2451-2458)
 *    leaves `findCodeFence` non-null at the `processFrontMatter` write that
 *    fires `vault.on('modify')`, so this gate naturally short-circuits the
 *    chevron mid-flight case (CRITICAL: prevents the chevron-blank-on-
 *    python3-c regression that the previous Phase 18 attempt produced).
 *
 * **activeSlug derivation (D-33 idempotency-preserving):** read from
 * `app.metadataCache.getFileCache(file).frontmatter['lc-language']` rather
 * than from doc text. The metadataCache is hydrated synchronously by
 * Obsidian on file load, so it reflects the canonical LC slug (`python3`,
 * `c`, etc.) — NOT the D-04-remapped fence opener tag (`python`, `cpp`).
 * This is what avoids the python3-fallback bug seen in
 * `createParentRepairExtension` (which reads from doc text via
 * `readLcLanguageFromDoc` and falls back to `'python3'`).
 *
 * **Write-path invariant (Phase 17 D-05):** repair flows through
 * `repairFenceStructure(parentView, activeSlug)` which uses
 * `parentView.dispatch` internally. NEVER calls `vault.process(...)` —
 * doing so during a `vault.on('modify')` event would corrupt CM6 state.
 *
 * **Cleanup:** uses `plugin.registerEvent(...)` so the listener auto-detaches
 * on plugin unload.
 *
 * **Decision 1 (Phase 18 redesign):** the previous attempt's
 * `checkStaleChildAndInvalidate` registry-deletion path is FORBIDDEN to
 * re-introduce. This helper does NOT compare any tracker slug against the
 * parent fence opener tag and does NOT delete from the child registry.
 * Stale-child cases are covered by Plan 17-09 (per-child language tracker
 * WeakMap), Plan 17-12 (line-number gating at mount), and Plan 17-13
 * (parent-side updateListener-based repair).
 *
 * @param plugin minimal plugin host — must expose `app` and `registerEvent`.
 *   `LeetCodePlugin` (extends Obsidian's `Plugin`) satisfies this contract.
 *
 * See `.planning/phases/18-vim-recovery-polish/18-02-PLAN.md`.
 */
export function registerVaultModifyRepairTrigger(plugin: VaultModifyRepairPluginHost): void {
  const { app } = plugin;

  plugin.registerEvent(
    app.vault.on('modify', (file) => {
      // Gate 0: file must be a TFile (defensive — Obsidian only fires modify
      // for files, but the typing allows TAbstractFile broadly).
      if (!(file instanceof TFile)) return;

      // Gate 1 (D-33): lc-slug frontmatter must be present. Restricts the
      // trigger to LC problem notes.
      const fm = app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const lcSlug = fm?.['lc-slug'];
      if (typeof lcSlug !== 'string' || lcSlug.length === 0) return;

      // Gate 2: active MarkdownView's file must equal the modified file.
      // We can only repair the editor the user is currently looking at —
      // background-loaded notes don't have a CM6 instance available.
      const activeView = app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView || activeView.file?.path !== file.path) return;

      // Defer: vault.on('modify') fires when the file is persisted, but
      // Obsidian may not have synced the new content to CM6's state yet.
      // A microtask deferral lets Obsidian's internal file→CM6 sync
      // complete before we check for fence damage. Without this, cm.state
      // still shows the old doc and findCodeFence returns non-null.
      queueMicrotask(() => {
        // Read the active CM6 EditorView. `editor.cm` is the CM6 view per
        // Obsidian's editor-cm convention (used throughout main.ts:2422 etc).
        const cm = (activeView.editor as unknown as { cm: EditorView }).cm;
        if (!cm) return;

        // Gate 3 (damage gate): only fire when the fence is structurally
        // broken. Same gate as `createParentRepairExtension`. CRITICAL — this
        // gate is what prevents the chevron-blank regression: chevron's
        // atomic CM6 transaction leaves the fence intact at the time the
        // subsequent `processFrontMatter` write fires `vault.on('modify')`.
        if (findCodeFence(cm.state) !== null) return;

        // Derive activeSlug from metadataCache (NOT from doc text). This
        // reads the canonical LC slug — `python3` / `c` — never the
        // D-04-remapped fence opener tag.
        const lcLang = app.metadataCache.getFileCache(file)?.frontmatter?.['lc-language'] as
          | string
          | undefined;
        const activeSlug =
          typeof lcLang === 'string' && lcLang.length > 0 ? lcLang : 'python3';

        // Phase 17 D-05 canonical write-path pattern: repair flows through
        // parentView.dispatch (inside repairFenceStructure). Never via
        // vault.process — that would corrupt CM6 state mid-vault-event.
        repairFenceStructure(cm, activeSlug);
      });
    }),
  );
}
