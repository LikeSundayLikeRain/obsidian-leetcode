// tests/solve/runArity.test.ts
//
// Phase 5.4 Plan 01 — Wave 0 unit tests for the pure helpers in
// src/solve/runArity.ts (CONTEXT D-02 arity, D-08 metaData parse,
// D-01 multi-case join/split). Mirrors the test pattern of
// tests/solve/statusMap.test.ts: no `vi.mock('obsidian')`, no DOM,
// pure-function-with-edge-cases.

import { describe, it, expect } from 'vitest';
import {
  parseMetaData,
  deriveArity,
  splitInput,
  joinCasesForRun,
  splitOutput,
  type MetaData,
} from '../../src/solve/runArity';
import runMultiCase from './fixtures/run-multi-case.json';

// LC's two-sum metaData is JSON-serialized; this is the canonical
// shape (verified against @leetnotion/leetcode-api/lib/index.d.ts:295,
// 389, 659 — `metaData: string`). 2 params → arity 2.
const TWO_SUM_META =
  '{"name":"twoSum","params":[{"name":"nums","type":"integer[]"},{"name":"target","type":"integer"}],"return":{"type":"integer[]"}}';

describe('runArity (Phase 5.4 Plan 01 — D-01 / D-02 / D-08)', () => {
  // ── parseMetaData (D-08 fallback to null on every malformed branch) ─────

  it('parseMetaData: returns null on undefined input', () => {
    expect(parseMetaData(undefined)).toBeNull();
  });

  it('parseMetaData: returns null on empty string', () => {
    expect(parseMetaData('')).toBeNull();
    expect(parseMetaData('   \n  ')).toBeNull();
  });

  it('parseMetaData: returns null on malformed JSON (never throws)', () => {
    expect(parseMetaData('{not json}')).toBeNull();
    expect(parseMetaData('[unterminated')).toBeNull();
    expect(parseMetaData('null')).toBeNull();
    expect(parseMetaData('"a string"')).toBeNull();
  });

  it('parseMetaData: returns null when params is missing or non-array', () => {
    expect(parseMetaData('{"name":"twoSum"}')).toBeNull();
    expect(parseMetaData('{"name":"twoSum","params":"oops"}')).toBeNull();
    expect(parseMetaData('{"name":"twoSum","params":null}')).toBeNull();
  });

  it('parseMetaData: parses canonical two-sum metaData JSON', () => {
    const md = parseMetaData(TWO_SUM_META);
    expect(md).not.toBeNull();
    const m = md as MetaData;
    expect(m.name).toBe('twoSum');
    expect(m.params).toHaveLength(2);
    expect(m.params[0]).toEqual({ name: 'nums', type: 'integer[]' });
    expect(m.params[1]).toEqual({ name: 'target', type: 'integer' });
    expect(m.return).toEqual({ type: 'integer[]' });
  });

  // ── deriveArity (D-02 priority: metaData → sampleTestCase → 1) ──────────

  it('deriveArity: uses metaData.params.length when present (primary path)', () => {
    expect(deriveArity(TWO_SUM_META, '[2,7,11,15]\n9')).toBe(2);
  });

  it('deriveArity: falls back to sampleTestCase line count when metaData is absent', () => {
    expect(deriveArity(undefined, '[2,7,11,15]\n9')).toBe(2);
    // 3-param fallback (e.g., a hypothetical problem with 3 inputs per case).
    expect(deriveArity(undefined, 'a\nb\nc')).toBe(3);
  });

  it('deriveArity: falls back to sampleTestCase when metaData is malformed', () => {
    expect(deriveArity('{garbage}', '[1,2,3]\n5')).toBe(2);
  });

  it('deriveArity: returns 1 when both metaData and sampleTestCase are empty (D-05 single-case minimum)', () => {
    expect(deriveArity(undefined, undefined)).toBe(1);
    expect(deriveArity('', '')).toBe(1);
    expect(deriveArity(null, null)).toBe(1);
  });

  // ── splitInput / joinCasesForRun (D-01 round-trip) ──────────────────────

  it('splitInput: returns [] on empty / whitespace input', () => {
    expect(splitInput('', 2)).toEqual([]);
    expect(splitInput('   \n  ', 2)).toEqual([]);
    expect(splitInput(undefined, 2)).toEqual([]);
  });

  it('splitInput: arity ≤ 0 returns single trimmed chunk (defensive)', () => {
    expect(splitInput('foo\nbar', 0)).toEqual(['foo\nbar']);
    expect(splitInput('foo\nbar', -1)).toEqual(['foo\nbar']);
  });

  it('splitInput: slices joined two-sum input into 2 cases at arity=2', () => {
    const joined = '[2,7,11,15]\n9\n[3,2,4]\n6';
    expect(splitInput(joined, 2)).toEqual(['[2,7,11,15]\n9', '[3,2,4]\n6']);
  });

  it('joinCasesForRun: joins per-case strings into a flat newline list, dropping empties', () => {
    const cases = ['[2,7,11,15]\n9', '[3,2,4]\n6'];
    expect(joinCasesForRun(cases, 2)).toBe('[2,7,11,15]\n9\n[3,2,4]\n6');
    // Empty + whitespace-only cases are filtered out (matches D-01 production usage).
    expect(joinCasesForRun(['a', '', '  ', 'b'], 1)).toBe('a\nb');
    expect(joinCasesForRun([], 2)).toBe('');
    expect(joinCasesForRun(undefined, 2)).toBe('');
  });

  it('splitInput / joinCasesForRun: round-trip on 2-case two-sum (D-01 + D-02)', () => {
    const cases = ['[2,7,11,15]\n9', '[3,2,4]\n6'];
    const joined = joinCasesForRun(cases, 2);
    const split = splitInput(joined, 2);
    expect(split).toEqual(cases);
  });

  // ── splitOutput (Pitfall 1 protection — pad short arrays) ───────────────

  it('splitOutput: pads short arrays with empty strings up to arity', () => {
    expect(splitOutput(['[0,1]'], 3)).toEqual(['[0,1]', '', '']);
    expect(splitOutput([], 2)).toEqual(['', '']);
    expect(splitOutput(undefined, 2)).toEqual(['', '']);
  });

  it('splitOutput: passes through code_answer array verbatim at matching arity (run-multi-case fixture oracle)', () => {
    // Oracle: tests/solve/fixtures/run-multi-case.json — A2 contract refined
    // by Phase 5.4 Plan 05 live UAT. LIVE LC pads code_answer + expected_
    // code_answer with trailing empty strings: a 3-case Run returned length-4
    // arrays with the trailing entry being ''. The renderer's arity logic
    // (verdictModalRenderer.ts) prefers total_testcases / compare_result.length
    // over array length to ignore the pad. splitOutput at arity=3 trims the
    // trailing entry; at arity=4 (matching .length) returns verbatim.
    expect(runMultiCase.code_answer).toEqual(['[0,1]', '[1,2]', '[0,1]', '']);
    expect(splitOutput(runMultiCase.code_answer, 3)).toEqual(['[0,1]', '[1,2]', '[0,1]']);
    expect(splitOutput(runMultiCase.expected_code_answer, 3)).toEqual([
      '[0,1]',
      '[1,2]',
      '[0,1]',
    ]);
    // total_testcases is the authoritative case count; compare_result encodes
    // per-case pass/fail and its length matches.
    expect(runMultiCase.total_testcases).toBe(3);
    expect(runMultiCase.compare_result).toBe('111');
  });

  it('splitOutput: normalizes single-string input to length-arity array', () => {
    expect(splitOutput('[0,1]', 1)).toEqual(['[0,1]']);
    expect(splitOutput('[0,1]', 3)).toEqual(['[0,1]', '', '']);
  });
});
