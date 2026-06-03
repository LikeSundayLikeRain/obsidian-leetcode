// Phase 19 Plan 01 — Pure fence-locator helpers.
//
// Lifts findCodeFence from src/main/codeActionsEditorExtension.ts:177-212
// (verbatim) and extractFenceBody from src/main/nestedEditorExtension.ts:168-176
// (verbatim). Adds new computeFenceIndex per RESEARCH §"Specific Findings §2".
//
// Phase 22 deletes the original v1.2 modules; this file is the long-term home
// for these pure helpers. The original tests (tests/main/codeActionsEditorExtension.test.ts)
// continue to pass against the v1.2 source until Phase 22.
//
// Widening note: the same FENCE_RE that the v1.2 source uses (/^\s*```/) is
// preserved for line detection. After locating the opener line, we inspect its
// text to tag the result with `kind: 'leetcode-solve' | 'legacy'` so callers
// can route — Phase 19 widget mounts on `kind === 'leetcode-solve'`,
// Phase 21 migrator handles `kind === 'legacy'`.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import type { EditorState } from '@codemirror/state';

export interface FenceLocation {
  openerLine: number;
  closerLine: number;
  kind: 'leetcode-solve' | 'legacy';
}

/**
 * Locate the first fenced code block under a `## Code` H2 heading.
 *
 * Lifted verbatim from src/main/codeActionsEditorExtension.ts:177-212. Same
 * FENCE_RE / H2_CODE_RE / H2_ANY_RE; only addition is the post-find tag
 * inspection that fills in `kind`.
 */
export function findCodeFence(
  state: EditorState,
  opts: { preferLeetCodeSolve?: boolean } = {},
): FenceLocation | null {
  // RESEARCH Pitfall 8: state.doc.line(1) throws on an empty doc.
  if (state.doc.lines === 0) return null;

  const FENCE_RE = /^\s*```/;
  const LC_OPENER_RE = /^\s*```leetcode-solve\b/;
  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;

  let inCodeSection = false;
  const total = state.doc.lines;

  // Phase 20 Plan 20-09 — when `preferLeetCodeSolve` is true, the loop
  // SKIPS legacy (non-leetcode-solve) opener fences in the same ## Code
  // section and keeps scanning for a leetcode-solve fence. This handles
  // notes where a stray ```text/```javascript fence (e.g., from
  // recovery/repair tooling) sits before the leetcode-solve fence under
  // ## Code. The default (false) preserves the original first-fence
  // behavior for sectionProtectionExtension.
  let i = 1;
  while (i <= total) {
    const text = state.doc.line(i).text;

    if (H2_CODE_RE.test(text)) {
      inCodeSection = true;
      i++;
      continue;
    }
    if (H2_ANY_RE.test(text)) {
      inCodeSection = false;
      i++;
      continue;
    }
    if (inCodeSection && FENCE_RE.test(text)) {
      // Determine the fence kind from the opener tag. `^\s*```leetcode-solve\b`
      // tags this as a v1.3 widget fence; anything else is a v1.2 legacy fence.
      const kind: 'leetcode-solve' | 'legacy' = LC_OPENER_RE.test(text)
        ? 'leetcode-solve'
        : 'legacy';

      // Walk forward for matching closer.
      let closerLine = -1;
      for (let j = i + 1; j <= total; j++) {
        if (FENCE_RE.test(state.doc.line(j).text)) {
          closerLine = j;
          break;
        }
      }
      if (closerLine < 0) return null; // unterminated fence

      // Phase 20 Plan 20-09 — skip legacy fences when caller asked for
      // a leetcode-solve fence specifically. Continue scanning AFTER
      // the closer line (so we don't re-match nested fence content).
      if (opts.preferLeetCodeSolve && kind === 'legacy') {
        i = closerLine + 1;
        continue;
      }

      return { openerLine: i, closerLine, kind };
    }
    i++;
  }
  return null;
}

/**
 * Extract the body text between fence opener and closer (exclusive of both).
 * Returns empty string if closerLine - openerLine <= 1 (empty fence).
 *
 * Lifted verbatim from src/main/nestedEditorExtension.ts:168-176.
 */
export function extractFenceBody(
  state: EditorState,
  fence: { openerLine: number; closerLine: number },
): string {
  if (fence.closerLine - fence.openerLine <= 1) return '';
  const from = state.doc.line(fence.openerLine + 1).from;
  const to = state.doc.line(fence.closerLine - 1).to;
  return state.doc.sliceString(from, to);
}

/**
 * Count the number of `\`\`\`leetcode-solve` openers that appear in `fileText`
 * BEFORE the line at `fenceLineStart0Based`. Used to compute the per-fence
 * registry key suffix (CONTEXT D-01: `${file.path}::${fenceIndex}`).
 *
 * Pure string scan; CRLF-tolerant via /\r?\n/. Only counts `leetcode-solve`
 * openers, NOT legacy langslug fences — the registry key must be invariant
 * under the v1.2→v1.3 fence-tag migration on the SAME note's other fences.
 */
export function computeFenceIndex(
  fileText: string,
  fenceLineStart0Based: number,
): number {
  const lines = fileText.split(/\r?\n/);
  let count = 0;
  const limit = Math.min(fenceLineStart0Based, lines.length);
  for (let i = 0; i < limit; i++) {
    if (/^\s*```leetcode-solve\b/.test(lines[i] ?? '')) count++;
  }
  return count;
}

/**
 * Phase 20 Plan 20-10 (gap-closure T9 underlying / T10 — DATA CORRUPTION) —
 * caller-ergonomics alias for `computeFenceIndex`. Same primitive, named so
 * call-sites that ask "is there a leetcode-solve fence in this text?" read
 * cleanly. Pass `Number.MAX_SAFE_INTEGER` (or `fileText.length`, whichever is
 * larger) as the second argument and check `> 0` for the existence predicate.
 *
 * Used by:
 *   - src/solve/starterCodeInjector.ts (kind-aware short-circuit gate)
 *   - src/main.ts resolveFenceKind closure (T10 fence-kind resolver)
 *   - src/graph/copyToCode.ts (kind-threading wiring for retrieve path)
 *
 * SSoT discipline: alias only — DO NOT inline a separate scan loop in callers.
 * The Plan 19-04 closer-resolution rule and CRLF tolerance live here.
 */
export const countLeetCodeSolveFenceOpeners = computeFenceIndex;
