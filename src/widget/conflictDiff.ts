// Phase 20 Plan 20-03 — Pure-TS LCS line diff for ConflictModal 3-pane render.
//
// CONTEXT D-conflict-02: pure-TS line-diff (longest-common-subsequence),
// ~150 LOC, no external library dependency. Single export `lineDiff(mine, ext)`
// returns an array of `DiffRow` for the modal's Merged column.
//
// Algorithm: standard dynamic-programming LCS, O(m·n) time + space.
// For a fence body of ~150 lines, this is ~22,500 operations — instant.
// Phase 20 Plan 20-03 SUMMARY documents the complexity bound.
//
// THREAT MODEL T-20-03-04: Input is bounded by fence body size (~150 lines
// typical; 1000-line worst case). DP table is `n*m*4 bytes` = 16KB worst
// case — no DoS. ReDoS not applicable (no regex on input).
//
// Pure function — NO imports beyond the local DiffRow interface; NO DOM,
// NO I/O, NO async. Testable in isolation; the modal layer wraps the rows
// in `<span class="lc-diff-{kind}">` with `textContent` only (no innerHTML).
//
// CONTRACT — kinds emitted by basic LCS (3 of 4 in DiffRow union):
//   - 'same'         — identical line at this position in both inputs
//   - 'mine-only'    — line exists only in `mine` (deleted on disk)
//   - 'external-only'— line exists only in `ext`  (added on disk)
//   - 'changed'      — RESERVED for forward-compat; basic LCS does NOT emit
//                      this kind. A future enhancement to pair adjacent
//                      mine-only/external-only rows into a single 'changed'
//                      row may emit it. The interface declares it so callers
//                      can switch on the union without TS complaining.

/**
 * A single row of the diff output. Three kinds are emitted by the basic LCS
 * algorithm (`same` / `mine-only` / `external-only`); a fourth (`changed`) is
 * declared for forward-compatibility with a future paired-row enhancement.
 */
export interface DiffRow {
  kind: 'same' | 'mine-only' | 'external-only' | 'changed';
  mine?: string;
  external?: string;
}

/**
 * Compute a line-level diff between two strings using LCS (longest common
 * subsequence). Returns rows in natural reading order (top-to-bottom of both
 * inputs).
 *
 * @param mine — the widget's current document
 * @param ext  — the disk content (or any external input)
 * @returns array of DiffRow with `kind: 'same' | 'mine-only' | 'external-only'`
 *
 * Complexity: O(m·n) time and space, where m = lines in `mine`, n = lines
 * in `ext`. Worst case bounded by fence body size (~150 lines typical;
 * 1000-line absolute upper bound — DP table at 1000x1000x4 bytes = 4MB,
 * still well below DoS threshold).
 *
 * Edge cases:
 *   - lineDiff('', '') → []
 *   - lineDiff('only-mine', '') → [{ kind: 'mine-only', mine: 'only-mine' }]
 *   - lineDiff('', 'only-ext') → [{ kind: 'external-only', external: 'only-ext' }]
 *   - identical inputs → all 'same' rows
 */
export function lineDiff(mine: string, ext: string): DiffRow[] {
  // Special case: both empty → no rows. The split below yields [''] for
  // empty input, which would produce a spurious row; short-circuit to
  // match the documented contract.
  if (mine === '' && ext === '') return [];

  // Special-case single-empty input. split('\n') on '' gives [''] — a single
  // empty line — which we don't want to count as a "real" line. So we split
  // ONLY when the input is non-empty; otherwise treat as zero lines.
  const m: string[] = mine === '' ? [] : mine.split('\n');
  const e: string[] = ext === '' ? [] : ext.split('\n');

  // DP table: dp[i][j] = length of LCS of m[0..i-1] and e[0..j-1].
  // Initialized with zeros; size (m.length+1) x (e.length+1).
  const dp: number[][] = Array.from({ length: m.length + 1 }, () =>
    Array.from({ length: e.length + 1 }, () => 0),
  );

  for (let i = 1; i <= m.length; i++) {
    for (let j = 1; j <= e.length; j++) {
      if (m[i - 1] === e[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack from (m.length, e.length) to (0, 0). Emit rows; reverse at end.
  const out: DiffRow[] = [];
  let i = m.length;
  let j = e.length;
  while (i > 0 && j > 0) {
    if (m[i - 1] === e[j - 1]) {
      out.push({ kind: 'same', mine: m[i - 1]!, external: e[j - 1]! });
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      // Mine-only: walking up reduces LCS — i.e., m[i-1] isn't part of LCS.
      out.push({ kind: 'mine-only', mine: m[i - 1]! });
      i--;
    } else {
      // External-only: walking left reduces LCS — i.e., e[j-1] isn't part of LCS.
      out.push({ kind: 'external-only', external: e[j - 1]! });
      j--;
    }
  }
  while (i > 0) {
    out.push({ kind: 'mine-only', mine: m[i - 1]! });
    i--;
  }
  while (j > 0) {
    out.push({ kind: 'external-only', external: e[j - 1]! });
    j--;
  }

  return out.reverse();
}
