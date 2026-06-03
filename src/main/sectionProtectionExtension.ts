// Phase 20 — Section Protection (forked from sectionLockExtension at v1.3 per
// D-protect-04). Drops fence-opener and fence-closer body lock; preserves
// Problem body / Code heading + blank-line pocket / Techniques heading +
// 'leetcode.*' userEvent bypass + boundary fix + malformed-note path.
//
// Hard read-only enforcement on plugin-owned regions of `lc-slug` notes via
// `EditorState.changeFilter` + `EditorView.atomicRanges` per CONTEXT D-04.
// Reuses `findCodeFence` from `codeActionsEditorExtension.ts` per Phase 5.3
// D-13 SSoT invariant; reuses heading literals from `NoteTemplate.ts` per
// Phase 2 D-03 SSoT invariant.
//
// Per-section semantics (Phase 20 D-protect-01 narrowing — diff from v1.2):
//   ## Code       : heading + blank-line pocket + opener-line locked
//                   (cosmetic heading lock). Fence body and CLOSER no longer
//                   locked — widget owns the range via `atomicRanges`
//                   (`liveModeViewPlugin.ts`, Phase 19 C-05).
//   ## Problem / ## Techniques / ## Notes / ## Custom Tests : unchanged from v1.2.
//
// D-08 nuance: heading-line lock spans line.from → nextLine.from (inclusive of
// the trailing \n) so selecting the heading line + Backspace cannot delete the
// newline and orphan the body underneath (RESEARCH Pitfall 3).
//
// In v1.3 the section-protection extension does NOT filter on userEvent:
// the v1.2 'leetcode.*' bypass convention has been retired (Phase 22). The
// narrow v1.3 protection covers the `## Problem` body and `## Techniques`
// heading only — fence opener/closer protection is moot because the inline
// widget owns the fence. Plugin-side dispatches no longer need to carry any
// userEvent annotation to thread through.
//
// Filter inputs use `tr.startState` (NEVER the post-transaction state) per
// RESEARCH Pitfall 2 — reading the post-transaction state inside the filter
// forces creation of a state that's about to be discarded.
// @codemirror/state + @codemirror/view are transitive peers of obsidian@1.12.3;
// both are marked external in esbuild.config.mjs and supplied by the Obsidian
// host at runtime. They are not declared in package.json dependencies — the
// lint rule reports this as a false-positive for the transitive-peer case.
// Same suppression pattern as src/main/codeActionsEditorExtension.ts.
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  Transaction,
  type EditorState as EditorStateType,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import {
  AI_REVIEW_HEADING_LINE,
  CODE_HEADING_LINE,
  NOTES_HEADING_LINE,
  PROBLEM_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
} from '../notes/NoteTemplate';
// Phase 20 Plan 20-07 — switched to the kind-aware findCodeFence from
// fenceLocator.ts so the `## Code` lock branch can route on
// `fence.kind === 'leetcode-solve'` (widget-mounted fence) vs. 'legacy'
// (any other ```lang``` block in the note). Both functions share
// (openerLine, closerLine) shape; fenceLocator widens the return with
// `kind`, which is what we need to widen the snap target only for
// widget-mounted fences without regressing legacy fence behavior.
import { findCodeFence } from '../widget/fenceLocator';

/**
 * Re-export of the SSoT tuple from `src/notes/NoteTemplate.ts` (Phase 2 D-03
 * SSoT invariant). The lock extension does NOT redeclare the four heading
 * strings — it imports them via this re-export so any future change lands in
 * exactly one place.
 */
export { LOCKED_HEADINGS } from '../notes/NoteTemplate';

/**
 * Heading kinds tracked by `computeLockedRanges`. The string discriminator
 * lets each kind branch into its own per-section range emission rule
 * (see the second pass in `computeLockedRanges` below).
 */
type HeadingKind = 'title' | 'problem' | 'code' | 'techniques' | 'notes' | 'ai-review';

interface HeadingHit {
  readonly kind: HeadingKind;
  readonly line: number;
}

/**
 * Pure helper. Line-scans `state.doc` for the four canonical headings and
 * emits a flat `[from, to, from, to, ...]` suppression-range list per
 * CONTEXT D-03 + D-08 + D-09.
 *
 * Returns an empty array when the document is empty or contains none of the
 * four headings (the `## Custom Tests` heading is intentionally never matched
 * — Pitfall 4).
 *
 * Heading detection is literal-line equality (`text === PROBLEM_HEADING_LINE`
 * etc.) — no regex, no trimming. Matches the SSoT discipline.
 *
 * D-08 nuance: heading-line ranges span `line.from → nextLine.from` (or
 * `line.to` at EOF) so the trailing newline is part of the suppressed range,
 * preventing line-delete via Backspace.
 *
 * D-09 nuance: when `findCodeFence(state)` returns null (unterminated fence,
 * malformed note), only the `## Code` heading line is locked — the opener
 * and closer ranges are skipped and the body falls through to "everything
 * else editable."
 */
export function computeLockedRanges(
  state: EditorStateType,
): readonly number[] {
  const out: number[] = [];
  if (state.doc.lines === 0) return out;

  // Pass 1: enumerate every canonical heading line in document order.
  const headings: HeadingHit[] = [];
  const total = state.doc.lines;
  for (let i = 1; i <= total; i++) {
    const text = state.doc.line(i).text;
    if (text.startsWith('# ') && !text.startsWith('## ') && !headings.some(h => h.kind === 'title')) {
      headings.push({ kind: 'title', line: i });
    } else if (text === PROBLEM_HEADING_LINE) {
      headings.push({ kind: 'problem', line: i });
    } else if (text === CODE_HEADING_LINE) {
      headings.push({ kind: 'code', line: i });
    } else if (text === TECHNIQUES_HEADING_LINE) {
      headings.push({ kind: 'techniques', line: i });
    } else if (text === NOTES_HEADING_LINE) {
      headings.push({ kind: 'notes', line: i });
    } else if (text === AI_REVIEW_HEADING_LINE) {
      headings.push({ kind: 'ai-review', line: i });
    }
    // The legacy `## Custom Tests` heading is intentionally NOT matched
    // (Phase 5 D-08; CONTEXT D-03; Pitfall 4) — leaving it editable.
  }

  // Pass 2: for each heading, emit its locked range(s). The shared
  // `headFrom..headTo` range is the D-08 trailing-newline lock — it spans
  // line.from to the start of the NEXT line so the \n is included.
  for (let h = 0; h < headings.length; h++) {
    const cur = headings[h] as HeadingHit;
    const headLine = state.doc.line(cur.line);
    const headFrom = headLine.from;
    const headTo =
      cur.line < total ? state.doc.line(cur.line + 1).from : headLine.to;

    if (cur.kind === 'problem') {
      // ## Problem locks the heading PLUS the entire body until the next
      // canonical heading line in document order (or end-of-doc when
      // ## Problem is the last heading present — defensive, mid-edit case).
      const nextHeadingLine =
        h + 1 < headings.length
          ? (headings[h + 1] as HeadingHit).line
          : total + 1; // sentinel = past-end-of-doc
      const bodyTo =
        nextHeadingLine <= total
          ? state.doc.line(nextHeadingLine).from
          : state.doc.line(total).to;
      out.push(headFrom, bodyTo);
    } else if (cur.kind === 'code') {
      // Phase 20 Plan 20-07 — gap-closure for atomicRanges cursor-edge cases
      // (UAT Test 2, .planning/debug/atomicranges-cursor-edge-cases.md).
      //
      // SUPERSEDES the original D-protect-01 narrowing decision for
      // `leetcode-solve` fences. D-protect-01 originally narrowed the
      // `## Code` lock to the heading + blank-line pocket + opener line
      // ONLY, on the rationale that "the v1.3 widget owns the fence range
      // via atomicRanges." That rationale was empirically wrong: the
      // transactionFilter snap target lands at `lockTo`, which under the
      // narrow lock equals the FIRST CHARACTER OF FENCE BODY LINE 1 —
      // INSIDE the widget's Decoration.replace([openerLine.from,
      // closerLine.to]) range. atomicRanges governs cursor motion via
      // CM6's intrinsic mechanics but is BYPASSED by the
      // transactionFilter's authoritative SelectionRange rewrite (the
      // filter sets the head directly; atomicRanges does not get a vote
      // on the rewritten transaction). Live Preview's selection-overlap
      // detector then strips the widget and reveals raw source.
      //
      // PLAN 20-07 RESOLUTION: for `leetcode-solve` fences specifically,
      // widen the lock upper bound to PAST the closer line so the snap
      // target is GUARANTEED to land outside the widget's replace range.
      // For non-leetcode-solve fences (any other ```lang``` block in the
      // note — possible when the user authors extra code blocks), keep
      // the narrow D-protect-01 lock so the cursor can land at body line 1
      // (those fences are NOT widget-mounted, so no overlap concern).
      //
      // Malformed-fence path preserved verbatim from D-protect-04.
      const fence = findCodeFence(state);
      if (fence) {
        if (fence.kind === 'leetcode-solve') {
          // Widen to past-closer-line (or end-of-doc when closer is the
          // last line — defensive, mid-edit case). Lock spans:
          //   headFrom .. closerNextFrom
          // where closerNextFrom is the start of the line AFTER the closer.
          // The transactionFilter snaps a forward-cursor to this position
          // which is GUARANTEED to be outside the widget's
          // [openerLine.from, closerLine.to] replace range.
          const closer = state.doc.line(fence.closerLine);
          const closerNextFrom =
            fence.closerLine < total
              ? state.doc.line(fence.closerLine + 1).from
              : closer.to;
          out.push(headFrom, closerNextFrom);
        } else {
          // Non-leetcode-solve fence — keep narrow lock (v1.2 / D-protect-01
          // behavior).
          const opener = state.doc.line(fence.openerLine);
          const openerTo =
            fence.openerLine < total
              ? state.doc.line(fence.openerLine + 1).from
              : opener.to;
          out.push(headFrom, openerTo);
        }
      } else {
        // Malformed fence — only heading locked.
        out.push(headFrom, headTo);
      }
    } else if (cur.kind === 'title') {
      // H1 title: lock from line above (blank after frontmatter) through to next heading.
      const lockFrom = cur.line > 1 ? state.doc.line(cur.line - 1).from : headFrom;
      const nextHeadingLine =
        h + 1 < headings.length
          ? (headings[h + 1] as HeadingHit).line
          : total + 1;
      const lockTo =
        nextHeadingLine <= total
          ? state.doc.line(nextHeadingLine).from
          : state.doc.line(total).to;
      out.push(lockFrom, lockTo);
    } else {
      // techniques | notes | ai-review — heading line only (D-03/D-19). Body editable.
      out.push(headFrom, headTo);
    }
  }

  return out;
}

/**
 * Phase 20 — Canonical alias for the v1.3 protection surface (Step 3 of
 * 20-01-PLAN). Internal helpers / production code keep using
 * `computeLockedRanges` (the shape utility name); the test fork imports
 * the canonical Phase 20 name without forcing a wider rename.
 */
export { computeLockedRanges as computeProtectedRanges };

/**
 * Coalesce a flat `[from, to, from, to, ...]` range list (the shape
 * `computeLockedRanges` returns) into a sorted list of disjoint
 * `[from, to]` tuples. Adjacent ranges (where `from <= last.to`) are
 * merged into a single tuple.
 *
 * Pure helper; exported for testing. The transactionFilter snap logic
 * relies on the merged shape so that snapping past a locked cluster
 * lands on a position guaranteed to be outside ALL locks (without this
 * step, snapping past `## Problem` would land at the start of `## Code`
 * heading lock, requiring another snap pass).
 */
export function mergeLockedRanges(
  flatRanges: readonly number[],
): ReadonlyArray<readonly [number, number]> {
  const merged: Array<[number, number]> = [];
  for (let i = 0; i < flatRanges.length; i += 2) {
    const from = flatRanges[i] as number;
    const to = flatRanges[i + 1] as number;
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) {
      last[1] = Math.max(last[1], to);
    } else {
      merged.push([from, to]);
    }
  }
  return merged;
}

/**
 * Compute the snap target for a cursor that landed inside `lockFrom..lockTo`.
 * Pure helper; exported for testing.
 *
 * Decision tree (UAT 2026-05-13 derived):
 * - `prevHead < lockFrom` → forward motion FROM before the lock; snap to
 *   `lockTo` (escape past the cluster).
 * - `prevHead >= lockTo` → backward motion FROM after the lock; try to
 *   snap to `lockFrom - 1` if that position is itself editable. If
 *   not (e.g., it's inside another cluster or before doc-start), the
 *   user is "trapped" — return `prevHead` so the cursor stays put
 *   instead of teleporting to an unreachable pocket.
 * - else (`prevHead` is INSIDE `[lockFrom, lockTo)` — typically a click
 *   on the heading itself with no prior editable cursor) → snap forward.
 *
 * `merged` is the full list of merged locked clusters; `backTarget`
 * editability is checked against ALL clusters and against doc-start.
 */
export function computeSnapTarget(
  prevHead: number,
  lockFrom: number,
  lockTo: number,
  merged: ReadonlyArray<readonly [number, number]>,
): number {
  if (prevHead < lockFrom) {
    return lockTo;
  }
  if (prevHead >= lockTo) {
    const backTarget = lockFrom - 1;
    const backTargetUnreachable =
      backTarget < 0 ||
      merged.some(([f, t]) => backTarget >= f && backTarget < t) ||
      // First-cluster guard: if this cluster is at the start of the
      // merged list, anything before it is unreachable (frontmatter
      // pocket above ## Problem in our layout).
      (merged.length > 0 && merged[0]?.[0] === lockFrom);
    return backTargetUnreachable ? prevHead : backTarget;
  }
  // prevHead INSIDE the cluster — escape forward by default.
  return lockTo;
}

/**
 * Phase 05.5 — heading-line decoration for marker hiding.
 *
 * Emits `Decoration.line` ranges over each canonical heading line in the
 * document. `styles.css` uses `.leetcode-locked-heading-line` to hide the
 * Obsidian `cm-formatting-header` tokens (the `## ` prefix) on those lines
 * so locked headings render parity with Reading Mode regardless of cursor
 * position. The lock makes editing impossible anyway; hiding the marker
 * removes the only visual cue that suggested otherwise.
 *
 * Decoration.line REQUIRES emitting a zero-length range at the line's
 * start position (`line.from`). Decoration.line ranges that span any
 * extent throw at runtime in CM6.
 */
function buildLockedDecorations(state: EditorStateType): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const total = state.doc.lines;
  if (total === 0) return b.finish();
  const lineDeco = Decoration.line({ class: 'leetcode-locked-heading-line' });
  for (let i = 1; i <= total; i++) {
    const text = state.doc.line(i).text;
    if (
      text === PROBLEM_HEADING_LINE ||
      text === CODE_HEADING_LINE ||
      text === TECHNIQUES_HEADING_LINE ||
      text === NOTES_HEADING_LINE ||
      text === AI_REVIEW_HEADING_LINE
    ) {
      b.add(state.doc.line(i).from, state.doc.line(i).from, lineDeco);
    }
  }
  return b.finish();
}

/**
 * Composed CM6 Extension = `[changeFilter, atomicRanges]`.
 *
 * The `changeFilter` callback evaluates four gates in order; the first hit
 * short-circuits to `return true` (no suppression) so the cheap checks
 * (userEvent bypass, file presence) run before the metadataCache lookup:
 *
 *   1. **Pitfall 5 plugin-event escape hatch** — `tr.annotation(Transaction.userEvent)`;
 *      when the value starts with `'leetcode.'`, return true. Phase 5.3's
 *      chevron switch (`src/main.ts:switchFenceLanguage`) writes the fence
 *      opener line — a locked range under D-09 — and depends on this bypass.
 *   2. **D-06 file gate** — `tr.startState.field(editorInfoField)?.file`;
 *      no file → return true. Reading Mode never invokes CM6 transaction
 *      filters at all (D-07 verified-by-absence), but this gate also covers
 *      the no-active-file edge case in test fixtures.
 *   3. **D-06 frontmatter gate** — `metadataCache.getFileCache(file)?.frontmatter['lc-slug']`;
 *      missing or non-string → return true. Non-LC notes keep full editor
 *      freedom; only `lc-slug`-tagged notes pay the lock cost.
 *   4. **Compute + return** — `computeLockedRanges(tr.startState)`; empty
 *      array → return true (nothing to lock); otherwise return the flat
 *      `[from, to, from, to, ...]` suppression-range array. CM6 documents
 *      this as the granular "drop changes touching these ranges" form;
 *      selection moves and other transactions pass through unchanged.
 *
 * `tr.startState` (NOT the post-transaction state) is mandatory per RESEARCH
 * Pitfall 2 — the post-transaction state would force creation of a state
 * about to be discarded.
 *
 * The `atomicRanges` facet wraps the same locked ranges as a `RangeSet<Decoration>`
 * so arrow-key cursor motion glides past locked regions (mouse clicks still
 * land anywhere — matches CONTEXT D-04 "user can click anywhere; their
 * keystrokes drop").
 */
export function buildSectionProtectionExtension(plugin: Plugin): Extension {
  return [
    EditorState.changeFilter.of((tr) => {
      const ev = tr.annotation(Transaction.userEvent);

      // Gate 0 — UAT 2026-05-13 regression fix (vault-sync corruption):
      // ONLY suppress changes for known user-input categories. CM6 + Obsidian
      // dispatch many programmatic transactions WITHOUT a `userEvent` (vault
      // file-sync reloads triggered by `vault.process` / external file
      // changes; structural rewrites; collab merges; etc.). The previous
      // filter blocked these too, which corrupted the buffer when copyToCode
      // wrote the file and Obsidian's sync dispatch tried to splice the new
      // content in — overlapping changes were dropped, leaving the buffer
      // mid-merge and producing duplicated/missing sections.
      //
      // CM6's documented user-input userEvents are 'input.type', 'input.paste',
      // 'input.drop', 'delete.backward', 'delete.forward', 'delete.selection',
      // 'delete.cut', and 'undo' / 'redo'. We only fire the lock when the
      // transaction matches one of these prefixes — programmatic dispatches
      // (no userEvent, or annotations like 'sync', 'load', etc.) pass through
      // unchanged.
      const isUserInput =
        typeof ev === 'string' &&
        (ev.startsWith('input.') ||
          ev.startsWith('delete.') ||
          ev === 'undo' ||
          ev === 'redo');
      if (!isUserInput) return true;

      // Gate 1 — D-04 + Pitfall 5: plugin-side dispatches with userEvent
      // starting `'leetcode.'` bypass the lock so the chevron switch
      // (Phase 5.3) and any future plugin-driven CM6 dispatch keeps working.
      // (Currently unreachable because Gate 0 already exits on non-input
      // userEvents, but kept as defense-in-depth — a future plugin path
      // might dispatch with a 'leetcode.*'-prefixed input userEvent.)
      if (ev.startsWith('leetcode.')) {
        return true;
      }

      // Gate 2 — D-06 file gate. Pitfall 2: read tr.startState (NEVER the
      // post-transaction state) so the filter doesn't force creation of a
      // state about to be discarded.
      const file = tr.startState.field(editorInfoField)?.file;
      if (!file) return true;

      // Gate 3 — D-06 frontmatter gate. Verbatim Phase 5.1 cast pattern;
      // the lock applies only to notes with a non-empty `lc-slug` string.
      const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const slug = fm?.['lc-slug'];
      if (typeof slug !== 'string' || slug.length === 0) {
        return true;
      }

      // Gate 4 — compute + return. Empty array means no locked headings
      // are present in the document (e.g., a brand-new note before
      // NoteWriter populates the canonical sections). Returning the flat
      // number[] is the documented CM6 suppression form per
      // @codemirror/state JSDoc.
      //
      // Boundary fix (UAT 2026-05-13): CM6's changeFilter is exclusive at
      // boundaries — a pure insertion at position `lockFrom` does not
      // strictly overlap `[lockFrom, lockTo]` so the change passes through.
      // This let users place the cursor at the start of `## Problem` and
      // type before the `##`. Extending each lock's `from` backward by 1
      // (clamped at 0) makes such boundary insertions fall strictly inside
      // the suppressed range. Insertions at the END of a lock (e.g., start
      // of the editable fence body) remain allowed because the upstream
      // boundary stays exclusive.
      const ranges = computeLockedRanges(tr.startState);
      if (ranges.length === 0) return true;
      const expanded: number[] = [];
      for (let i = 0; i < ranges.length; i += 2) {
        expanded.push(Math.max(0, (ranges[i] as number) - 1));
        expanded.push(ranges[i + 1] as number);
      }
      return expanded;
    }),
    // UAT 2026-05-13: atomicRanges removed in favor of the
    // transactionFilter below. atomicRanges performs CM6-internal cursor
    // adjustment that doesn't always thread through user-space filters,
    // resulting in the cursor "settling" at lockFrom on the first arrow
    // keypress and only snapping out on the second. The transactionFilter
    // alone covers all motions (arrow, click, column-step, word-step)
    // because it runs on every selection-changing transaction.
    // UAT 2026-05-13 — selection-snap transaction filter.
    //
    // CM6's atomicRanges only governs *some* cursor motions; it does NOT
    // prevent click-to-position or column-step arrow keys from landing
    // inside a locked range. This filter inspects every transaction that
    // moves the selection and, when the resulting selection head lands
    // inside a locked range, rewrites the transaction to snap the cursor
    // to the boundary outside the range (forward when motion came from
    // before, backward when from after).
    //
    // Returns a transaction-spec array on rewrite. CM6 reapplies filters
    // to the rewritten output, but our snap target is always OUTSIDE all
    // locked ranges so the second pass is a no-op (no infinite loop).
    EditorState.transactionFilter.of((tr) => {
      if (!tr.selection) return tr;

      // Snap ONLY on pure selection moves. Vault-sync / programmatic dispatches
      // (processFrontMatter, vault.process) carry an explicit selection too, so
      // they reach this filter — rewriting their snapped cursor corrupts the
      // buffer (Gate 0 in the changeFilter guards the same class). Bailing here
      // also keeps `tr.state.doc === tr.startState.doc` for the read below.
      if (tr.docChanged) return tr;

      const file = tr.startState.field(editorInfoField)?.file;
      if (!file) return tr;
      const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const slug = fm?.['lc-slug'];
      if (typeof slug !== 'string' || slug.length === 0) return tr;

      const flatRanges = computeLockedRanges(tr.state);
      if (flatRanges.length === 0) return tr;

      // Merge adjacent / overlapping locked ranges so snap doesn't
      // ping-pong between them. ## Problem body ends at the same offset
      // ## Code heading begins; without merging, snapping past Problem
      // lands inside Code lock and snapping back lands inside Problem.
      const merged = mergeLockedRanges(flatRanges);

      const prevHead = tr.startState.selection.main.head;
      const sel = tr.selection;

      // UAT 2026-05-13: only snap on cursor (collapsed) selections.
      // When the user is selecting (head !== anchor — shift-arrow,
      // drag-select), we leave the selection alone so they can copy
      // locked text. The changeFilter still prevents edits to the
      // selection if they try to type — selection-only is harmless.
      const isCollapsedCursor = sel.ranges.every((r) => r.head === r.anchor);
      if (!isCollapsedCursor) return tr;

      let needsRewrite = false;
      const newHeads: number[] = [];

      for (const r of sel.ranges) {
        const head = r.head;
        let snappedHead = head;
        for (const [lockFrom, lockTo] of merged) {
          // Inside or at the upstream boundary. UAT: clicking at column 0
          // of a locked heading lands head === lockFrom; visually that's
          // "on the heading," so we snap. The downstream boundary
          // (head === lockTo) is the natural transition into the next
          // editable line — leaving it as a valid resting position.
          if (head >= lockFrom && head < lockTo) {
            needsRewrite = true;
            snappedHead = computeSnapTarget(prevHead, lockFrom, lockTo, merged);
            break;
          }
        }
        newHeads.push(snappedHead);
      }

      if (!needsRewrite) return tr;

      // Use the main range's snapped head for both anchor and head
      // (collapse selection on snap — preserves no-op for non-locked
      // selections, drops any unintentional shift-select INTO the lock).
      const mainHead = newHeads[sel.mainIndex] ?? newHeads[0] ?? 0;
      // Returning a TransactionSpec rewrites the current transaction with
      // the snapped selection. We carry over the original transaction's
      // changes/effects so we don't drop user input or annotations.
      return {
        changes: tr.changes,
        selection: EditorSelection.cursor(mainHead),
        effects: tr.effects,
        scrollIntoView: tr.scrollIntoView,
      };
    }),
    // Phase 05.5 D-04 (planner discretion / RESEARCH Open Q4 recommendation):
    // visual-dim locked ranges for discoverability. CSS in styles.css uses
    // var(--background-secondary). Without this, users only learn the lock
    // exists by typing into a locked region and seeing nothing happen.
    EditorView.decorations.of((view) => buildLockedDecorations(view.state)),
  ];
}
