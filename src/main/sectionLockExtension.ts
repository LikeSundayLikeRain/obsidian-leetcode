// Phase 05.5 (POLISH) — Section Locking for lc-slug Notes.
//
// Hard read-only enforcement on plugin-owned regions of `lc-slug` notes via
// `EditorState.changeFilter` + `EditorView.atomicRanges` per CONTEXT D-04.
// Reuses `findCodeFence` from `codeActionsEditorExtension.ts` per Phase 5.3
// D-13 SSoT invariant; reuses heading literals from `NoteTemplate.ts` per
// Phase 2 D-03 SSoT invariant.
//
// Per-section semantics (CONTEXT D-03 + D-08 + D-09):
//   ## Problem    : heading + entire body locked (read-only).
//   ## Code       : heading line locked. Fence opener line + closing fence
//                   locked. Body BETWEEN opener and closer remains editable
//                   (the SOLVE-01 surface; chevron is the only language path).
//                   D-09 fall-through: when findCodeFence returns null
//                   (malformed/unterminated fence), only the heading is locked.
//   ## Techniques : heading line locked. Body editable (future AI-driven path
//                   writes here; user may add manual `[[Wikilinks]]`).
//   ## Notes      : heading line locked. Body editable (Phase 2 D-08 user-owned
//                   surface).
//   ## Custom Tests : NEVER locked (Phase 5 D-08 / Phase 05.5 D-03).
//
// D-08 nuance: heading-line lock spans line.from → nextLine.from (inclusive of
// the trailing \n) so selecting the heading line + Backspace cannot delete the
// newline and orphan the body underneath (RESEARCH Pitfall 3).
//
// D-04 escape hatch (RESEARCH Pitfall 5): plugin-side `cm.dispatch` callsites
// (e.g., the Phase 5.3 chevron switch which writes the fence opener — a
// locked range under D-09) MUST set a `userEvent: 'leetcode.*'` annotation;
// the changeFilter checks this first and threads such transactions through
// unfiltered. Without this bypass the chevron silently breaks.
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
  CODE_HEADING_LINE,
  NOTES_HEADING_LINE,
  PROBLEM_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
} from '../notes/NoteTemplate';
import { findCodeFence } from './codeActionsEditorExtension';

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
type HeadingKind = 'problem' | 'code' | 'techniques' | 'notes';

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
    if (text === PROBLEM_HEADING_LINE) {
      headings.push({ kind: 'problem', line: i });
    } else if (text === CODE_HEADING_LINE) {
      headings.push({ kind: 'code', line: i });
    } else if (text === TECHNIQUES_HEADING_LINE) {
      headings.push({ kind: 'techniques', line: i });
    } else if (text === NOTES_HEADING_LINE) {
      headings.push({ kind: 'notes', line: i });
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
      // Heading line locked unconditionally (D-08).
      out.push(headFrom, headTo);
      // D-09: locate the fence opener + closer via the Phase 5.1 SSoT
      // detector. When it returns null (malformed / unterminated), skip the
      // opener and closer pushes — body falls through to editable.
      const fence = findCodeFence(state);
      if (fence) {
        const opener = state.doc.line(fence.openerLine);
        const closer = state.doc.line(fence.closerLine);
        const openerTo =
          fence.openerLine < total
            ? state.doc.line(fence.openerLine + 1).from
            : opener.to;
        out.push(opener.from, openerTo);
        const closerTo =
          fence.closerLine < total
            ? state.doc.line(fence.closerLine + 1).from
            : closer.to;
        out.push(closer.from, closerTo);
      }
    } else {
      // techniques | notes — heading line only (D-03). Body editable.
      out.push(headFrom, headTo);
    }
  }

  return out;
}

/**
 * Build a RangeSet over the same locked ranges so `EditorView.atomicRanges`
 * can skip cursor over them on arrow-key motion (RESEARCH Pattern 3). The
 * decoration class is internal-only — atomicRanges only consults the
 * `[from, to]` bounds; the class string lets a future styles.css polish
 * pass dim the locked ranges if/when Plan 04 chooses to enable visual dim.
 */
function buildAtomicRangeSet(state: EditorStateType): DecorationSet {
  const ranges = computeLockedRanges(state);
  const b = new RangeSetBuilder<Decoration>();
  for (let i = 0; i < ranges.length; i += 2) {
    const from = ranges[i] as number;
    const to = ranges[i + 1] as number;
    if (from < to) {
      b.add(
        from,
        to,
        Decoration.mark({ class: 'leetcode-section-locked-atomic' }),
      );
    }
  }
  return b.finish();
}

/**
 * Phase 05.5 D-04 (planner discretion / RESEARCH Open Q4 recommendation):
 * visual-dim Decoration.mark over each locked range so users discover the
 * lock by SEEING that plugin-owned regions look different — without it,
 * users only learn the lock exists by typing into a locked region and
 * seeing nothing happen. The class `leetcode-section-locked` is the user-
 * facing class targeted by `styles.css`'s `.cm-editor .leetcode-section-locked`
 * rule (which sets `background: var(--background-secondary)` per CONTEXT
 * D-04 + Phase 5.4 D-06 — Obsidian semantic CSS variables only, no
 * hardcoded colors). The class is distinct from the atomic-only
 * `leetcode-section-locked-atomic` class above so future styling decisions
 * can target either layer independently.
 */
function buildLockedDecorations(state: EditorStateType): DecorationSet {
  const ranges = computeLockedRanges(state);
  const b = new RangeSetBuilder<Decoration>();
  for (let i = 0; i < ranges.length; i += 2) {
    const from = ranges[i] as number;
    const to = ranges[i + 1] as number;
    if (from < to) {
      b.add(
        from,
        to,
        Decoration.mark({ class: 'leetcode-section-locked' }),
      );
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
export function buildSectionLockExtension(plugin: Plugin): Extension {
  return [
    EditorState.changeFilter.of((tr) => {
      // Gate 1 — D-04 + Pitfall 5: plugin-side dispatches with userEvent
      // starting `'leetcode.'` bypass the lock so the chevron switch
      // (Phase 5.3) and any future plugin-driven CM6 dispatch keeps working.
      // Cheapest check — do this first to avoid the metadataCache lookup
      // on every plugin-internal transaction.
      const ev = tr.annotation(Transaction.userEvent);
      if (typeof ev === 'string' && ev.startsWith('leetcode.')) {
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
      const ranges = computeLockedRanges(tr.startState);
      return ranges.length === 0 ? true : ranges;
    }),
    // RESEARCH Pattern 3 — atomicRanges for cursor-skip on arrow-key motion.
    // Mouse clicks still land anywhere; only keyboard motion glides past
    // the locked region. This pairs with the changeFilter above: cursor can
    // enter a locked range via click, but keystrokes drop silently.
    EditorView.atomicRanges.of((view) => buildAtomicRangeSet(view.state)),
    // Phase 05.5 D-04 (planner discretion / RESEARCH Open Q4 recommendation):
    // visual-dim locked ranges for discoverability. CSS in styles.css uses
    // var(--background-secondary). Without this, users only learn the lock
    // exists by typing into a locked region and seeing nothing happen.
    EditorView.decorations.of((view) => buildLockedDecorations(view.state)),
  ];
}
