// Phase 20 Plan 20-03 Task 1 — Pure-TS LCS line diff unit tests (RED).
//
// Covers SYNC-05 LCS diff per CONTEXT D-conflict-02. Tests the canonical
// behavior of `lineDiff(mine, ext): DiffRow[]`:
//   - identical → all 'same' rows
//   - pure add / pure delete
//   - interleaved insertions
//   - empty inputs
//   - single-line / unicode hostile inputs
//   - performance smoke test (150x150 = 22500 ops in <100ms)

import { describe, it, expect } from 'vitest';
import { lineDiff, type DiffRow } from '../../src/widget/conflictDiff';

describe('lineDiff — identical inputs', () => {
  it('identical 3-line inputs return three same rows with mine === external', () => {
    const result = lineDiff('a\nb\nc', 'a\nb\nc');
    expect(result.length).toBe(3);
    for (const r of result) {
      expect(r.kind).toBe('same');
      expect(r.mine).toBe(r.external);
    }
    expect(result[0]!.mine).toBe('a');
    expect(result[1]!.mine).toBe('b');
    expect(result[2]!.mine).toBe('c');
  });
});

describe('lineDiff — pure additions', () => {
  it('appended line on external returns three same + one external-only', () => {
    const result = lineDiff('a\nb\nc', 'a\nb\nc\nd');
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ kind: 'same', mine: 'a', external: 'a' });
    expect(result[1]).toEqual({ kind: 'same', mine: 'b', external: 'b' });
    expect(result[2]).toEqual({ kind: 'same', mine: 'c', external: 'c' });
    expect(result[3]).toEqual({ kind: 'external-only', external: 'd' });
  });
});

describe('lineDiff — pure deletions', () => {
  it('removed last line returns three same + one mine-only', () => {
    const result = lineDiff('a\nb\nc\nd', 'a\nb\nc');
    expect(result.length).toBe(4);
    // The LCS finds a, b, c as the common subsequence; d is mine-only.
    const sames = result.filter((r) => r.kind === 'same');
    const mineOnly = result.filter((r) => r.kind === 'mine-only');
    expect(sames.length).toBe(3);
    expect(mineOnly.length).toBe(1);
    expect(mineOnly[0]!.mine).toBe('d');
  });
});

describe('lineDiff — middle replacement', () => {
  it('changed middle line shows mine-only (b) and external-only (x)', () => {
    const result = lineDiff('a\nb\nc', 'a\nx\nc');
    // LCS = a, c (length 2). b is mine-only; x is external-only.
    const mineOnly = result.filter((r) => r.kind === 'mine-only');
    const extOnly = result.filter((r) => r.kind === 'external-only');
    const sames = result.filter((r) => r.kind === 'same');
    expect(sames.length).toBe(2);
    expect(mineOnly.length).toBe(1);
    expect(extOnly.length).toBe(1);
    expect(mineOnly[0]!.mine).toBe('b');
    expect(extOnly[0]!.external).toBe('x');
  });
});

describe('lineDiff — empty inputs', () => {
  it('two empty strings return [] (no diff)', () => {
    const result = lineDiff('', '');
    expect(result).toEqual([]);
  });

  it('empty mine vs single external line returns one external-only row', () => {
    const result = lineDiff('', 'only-ext');
    expect(result).toEqual([{ kind: 'external-only', external: 'only-ext' }]);
  });

  it('single mine line vs empty external returns one mine-only row', () => {
    const result = lineDiff('only-mine', '');
    expect(result).toEqual([{ kind: 'mine-only', mine: 'only-mine' }]);
  });
});

describe('lineDiff — row order matches reading order', () => {
  it('interleaved additions yield a top-to-bottom row sequence matching both inputs', () => {
    // mine = a, b, c, d
    // ext  = a, x, b, y, c, d
    // Expected: same(a), external-only(x), same(b), external-only(y), same(c), same(d)
    const result = lineDiff('a\nb\nc\nd', 'a\nx\nb\ny\nc\nd');
    expect(result.length).toBe(6);
    expect(result[0]).toEqual({ kind: 'same', mine: 'a', external: 'a' });
    expect(result[1]).toEqual({ kind: 'external-only', external: 'x' });
    expect(result[2]).toEqual({ kind: 'same', mine: 'b', external: 'b' });
    expect(result[3]).toEqual({ kind: 'external-only', external: 'y' });
    expect(result[4]).toEqual({ kind: 'same', mine: 'c', external: 'c' });
    expect(result[5]).toEqual({ kind: 'same', mine: 'd', external: 'd' });
  });
});

describe('lineDiff — performance smoke test (LCS Test 8)', () => {
  it('150x150 identical inputs run in <100ms', () => {
    const lines: string[] = [];
    for (let i = 0; i < 150; i++) lines.push(`line${i}`);
    const big = lines.join('\n');
    const start = Date.now();
    const result = lineDiff(big, big);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBe(150);
    for (const r of result) {
      expect(r.kind).toBe('same');
    }
  });
});

describe('lineDiff — full replacement', () => {
  it('completely different inputs return all mine-only + all external-only rows', () => {
    const result = lineDiff('a\nb', 'x\ny');
    // LCS = 0 (no common lines). All mine-only and all external-only.
    const mineOnly = result.filter((r) => r.kind === 'mine-only');
    const extOnly = result.filter((r) => r.kind === 'external-only');
    expect(mineOnly.length).toBe(2);
    expect(extOnly.length).toBe(2);
    expect(mineOnly.map((r) => r.mine)).toEqual(['a', 'b']);
    expect(extOnly.map((r) => r.external)).toEqual(['x', 'y']);
  });
});

describe('lineDiff — DiffRow shape contract', () => {
  it('same rows have both mine and external set; mine-only rows have only mine; external-only rows have only external', () => {
    const result: DiffRow[] = lineDiff('a\nb', 'a\nc');
    for (const r of result) {
      if (r.kind === 'same') {
        expect(r.mine).toBeDefined();
        expect(r.external).toBeDefined();
        expect(r.mine).toBe(r.external);
      } else if (r.kind === 'mine-only') {
        expect(r.mine).toBeDefined();
        expect(r.external).toBeUndefined();
      } else if (r.kind === 'external-only') {
        expect(r.external).toBeDefined();
        expect(r.mine).toBeUndefined();
      }
    }
  });
});
