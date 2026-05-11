// Phase 5.3 (POLISH-09 / D-06) — whitespace-copy indent fallback.
// RED-state unit tests pinning Wave 1's `src/main/whitespaceCopyIndent.ts`
// behavioral contract: pure `computeWhitespaceCopyIndent(state, pos)`
// function that returns the column count to indent a new line by, derived
// from the leading whitespace of the most-recent non-empty preceding line.
// Tabs are normalised to 2 spaces (per PATTERNS line 234).
//
// `whitespaceCopyIndentExtension` is a CM6 `indentService.of(...)` Extension
// that wraps `computeWhitespaceCopyIndent`; tests target the pure function
// directly per PATTERNS Option A so we can assert column-math without
// constructing a real EditorView.
//
// WAVE 0 LINT NOTE: same as the codeFenceLanguageExtension RED tests — the
// `no-unsafe-*` cascade fires solely because the SUT module does not yet
// exist; Wave 1 (Plan 02) adds typed exports and these disables can be
// removed.
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion -- Wave 0 RED-state scaffolding; removed when Wave 1 ships the implementation module */

import { describe, it, expect } from 'vitest';

// MUST fail to resolve at Wave 0 time; becomes resolvable when Wave 1
// (Plan 02) ships `src/main/whitespaceCopyIndent.ts`.
import {
  computeWhitespaceCopyIndent,
  whitespaceCopyIndentExtension,
} from '../../src/main/whitespaceCopyIndent';

// --- Minimal fake state ---------------------------------------------------
// `computeWhitespaceCopyIndent` reads `state.doc.lineAt(pos).number` and
// `state.doc.line(n).text` per PATTERNS lines 496–504. Build a fake state
// from a `text` string by splitting on '\n' and tracking 1-indexed line
// offsets — sufficient for column-count math without real CM6 internals.
function makeFakeState(text: string) {
  const lines = text.split('\n');
  return {
    doc: {
      get lines() {
        return lines.length;
      },
      line(n: number) {
        return { number: n, text: lines[n - 1] ?? '' };
      },
      lineAt(pos: number) {
        let acc = 0;
        for (let n = 1; n <= lines.length; n++) {
          const lineLen = (lines[n - 1] ?? '').length;
          if (acc + lineLen >= pos) {
            return { number: n, text: lines[n - 1] ?? '' };
          }
          acc += lineLen + 1;
        }
        return { number: lines.length, text: lines[lines.length - 1] ?? '' };
      },
    },
  };
}

/** Compute the byte-offset of the start of `lineNumber` (1-indexed). */
function lineStart(text: string, lineNumber: number): number {
  const lines = text.split('\n');
  let acc = 0;
  for (let n = 1; n < lineNumber; n++) {
    acc += (lines[n - 1] ?? '').length + 1;
  }
  return acc;
}

// =========================================================================
// computeWhitespaceCopyIndent — 6 cases per RESEARCH §Wave 0 Gaps + PATTERNS
// §Test cases (lines 511–519)
// =========================================================================

describe('computeWhitespaceCopyIndent', () => {
  it('first line (line.number === 1) returns 0', () => {
    const text = 'def foo():\n    pass\n';
    const state = makeFakeState(text);
    // pos 0 → line 1, no preceding line.
    expect(computeWhitespaceCopyIndent(state as never, 0)).toBe(0);
  });

  it('previous non-empty line has 4 leading spaces → returns 4', () => {
    const text = 'def foo():\n    pass\n';
    const state = makeFakeState(text);
    // pos at the start of line 3 (the blank line after "    pass\n").
    const pos = lineStart(text, 3);
    expect(computeWhitespaceCopyIndent(state as never, pos)).toBe(4);
  });

  it('previous non-empty line has 2 leading tabs → returns 4 (tab→2-space)', () => {
    const text = 'def foo():\n\t\tpass\n';
    const state = makeFakeState(text);
    const pos = lineStart(text, 3);
    expect(computeWhitespaceCopyIndent(state as never, pos)).toBe(4);
  });

  it('previous non-empty line has mixed `\\t  ` (1 tab + 2 spaces) → returns 4', () => {
    const text = 'def foo():\n\t  pass\n';
    const state = makeFakeState(text);
    const pos = lineStart(text, 3);
    expect(computeWhitespaceCopyIndent(state as never, pos)).toBe(4);
  });

  it('all preceding lines empty → returns 0', () => {
    const text = '\n\n\n';
    const state = makeFakeState(text);
    // pos at the start of the (4th) line — all preceding lines empty.
    const pos = lineStart(text, 4);
    expect(computeWhitespaceCopyIndent(state as never, pos)).toBe(0);
  });

  it('skips empty intermediate lines to find the most-recent non-empty line', () => {
    // Line 1: `    real indent` (4 spaces leading)
    // Line 2: `` (empty)
    // Line 3: `` (empty)
    // Line 4: caret here — should walk back past lines 3 + 2 to line 1.
    const text = '    real indent\n\n\n';
    const state = makeFakeState(text);
    const pos = lineStart(text, 4);
    expect(computeWhitespaceCopyIndent(state as never, pos)).toBe(4);
  });

  it('extension export is a truthy CM6 Extension value', () => {
    // Sanity-check the Extension export so Wave 1 cannot ship the module
    // without exposing the indentService-wrapped extension. The actual
    // indentService callback wiring is exercised by integration tests with
    // a real EditorView; here we only pin the public-API shape.
    expect(whitespaceCopyIndentExtension).toBeTruthy();
  });
});
