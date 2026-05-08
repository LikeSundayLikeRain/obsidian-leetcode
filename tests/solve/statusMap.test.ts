// tests/solve/statusMap.test.ts
// RED baseline (Wave 0) — will fail to import until Plan 02 ships
// src/solve/statusMap.ts with dispatchStatusCode / VerdictKind.
//
// Contracts under test:
//   D-15: integer status_code → canonical VerdictKind mapping
//   Known codes (from leetcode-cli helper.js status table):
//     10 = Accepted
//     11 = Wrong Answer
//     12 = Memory Limit Exceeded
//     13 = Output Limit Exceeded
//     14 = Time Limit Exceeded
//     15 = Runtime Error
//     16 = Internal Error
//     20 = Compile Error
//     21 = Unknown Error
//   Unknown integer → { kind: 'unknown', displayName: 'Unrecognized status N' }
//
// Pure function; no Obsidian dependencies.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 02
import { dispatchStatusCode } from '../../src/solve/statusMap';

describe('statusMap.dispatchStatusCode (D-15)', () => {
  it('maps each known integer to the expected displayName', () => {
    // Canonical table per D-15 + leetcode-cli helper.js.
    const table: Array<[number, string]> = [
      [10, 'Accepted'],
      [11, 'Wrong Answer'],
      [12, 'Memory Limit Exceeded'],
      [13, 'Output Limit Exceeded'],
      [14, 'Time Limit Exceeded'],
      [15, 'Runtime Error'],
      [16, 'Internal Error'],
      [20, 'Compile Error'],
      [21, 'Unknown Error'],
    ];
    for (const [code, name] of table) {
      const v = dispatchStatusCode(code);
      expect(v.displayName).toBe(name);
    }
  });

  it('returns kind: "unknown" for an unrecognized integer (code 99)', () => {
    const v = dispatchStatusCode(99);
    expect(v.kind).toBe('unknown');
  });

  it('uses a fallback displayName for missing msg (Unrecognized status {N})', () => {
    const v = dispatchStatusCode(99);
    expect(v.displayName).toContain('99');
    expect(v.displayName.toLowerCase()).toContain('unrecognized');
  });
});
