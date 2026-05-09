// tests/solve/unknownVerdictGuard.test.ts
//
// GAP 2 — T-03-04-05: submitFromActive throws UnknownVerdictError on unknown
// status_code values returned by the LC judge.
//
// Security contract: any terminal check response whose status_code falls outside
// the KNOWN map (10–21) must surface as UnknownVerdictError carrying the raw
// payload verbatim, so the modal's D-15 "Copy payload" affordance can expose it
// for bug-report filing. Known codes must never throw — they proceed to renderVerdict.
//
// Tests are against the extracted pure helper assertKnownVerdictOrThrow()
// (src/solve/verdictGuard.ts) which is imported verbatim by main.ts.

import { describe, it, expect } from 'vitest';
import { assertKnownVerdictOrThrow } from '../../src/solve/verdictGuard';
import { UnknownVerdictError } from '../../src/shared/errors';
import type { SubmitCheckResponse } from '../../src/solve/types';

/** Build a minimal SubmitCheckResponse for a given status_code. */
function makeTerminal(status_code: number, status_msg?: string): SubmitCheckResponse {
  return {
    state: 'SUCCESS',
    status_code,
    status_msg,
  };
}

// ── Unknown status_code values — must throw UnknownVerdictError ───────────

describe('assertKnownVerdictOrThrow — unknown status_code throws (T-03-04-05)', () => {
  it('throws UnknownVerdictError for status_code 99 (unassigned future code)', () => {
    const terminal = makeTerminal(99, 'Future Status');
    expect(() => assertKnownVerdictOrThrow(terminal)).toThrow(UnknownVerdictError);
  });

  it('throws UnknownVerdictError for status_code 999 (far-future code)', () => {
    const terminal = makeTerminal(999);
    expect(() => assertKnownVerdictOrThrow(terminal)).toThrow(UnknownVerdictError);
  });

  it('throws UnknownVerdictError for status_code 0 (below all known codes)', () => {
    const terminal = makeTerminal(0);
    expect(() => assertKnownVerdictOrThrow(terminal)).toThrow(UnknownVerdictError);
  });

  it('throws UnknownVerdictError for status_code 17 (gap between ie=16 and ce=20)', () => {
    const terminal = makeTerminal(17, 'Some New Error');
    expect(() => assertKnownVerdictOrThrow(terminal)).toThrow(UnknownVerdictError);
  });

  it('throws UnknownVerdictError for status_code 22 (just above unknown-lc=21)', () => {
    const terminal = makeTerminal(22);
    expect(() => assertKnownVerdictOrThrow(terminal)).toThrow(UnknownVerdictError);
  });
});

// ── Unknown verdict error carries original payload verbatim ───────────────

describe('assertKnownVerdictOrThrow — UnknownVerdictError.payload is the original terminal object', () => {
  it('error.payload is the exact terminal object passed in (same reference)', () => {
    const terminal = makeTerminal(99, 'Future Status');
    let caught: unknown;
    try {
      assertKnownVerdictOrThrow(terminal);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownVerdictError);
    expect((caught as UnknownVerdictError).payload).toBe(terminal);
  });

  it('error.payload preserves all fields of the terminal response (modal copy-payload path)', () => {
    const terminal: SubmitCheckResponse = {
      state: 'SUCCESS',
      status_code: 99,
      status_msg: 'Future Status',
      lang: 'python3',
      submission_id: '12345',
      total_correct: 0,
      total_testcases: 59,
    };
    let caught: unknown;
    try {
      assertKnownVerdictOrThrow(terminal);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownVerdictError);
    const payload = (caught as UnknownVerdictError).payload as SubmitCheckResponse;
    expect(payload.status_code).toBe(99);
    expect(payload.status_msg).toBe('Future Status');
    expect(payload.submission_id).toBe('12345');
    expect(payload.total_testcases).toBe(59);
  });

  it('UnknownVerdictError.name is "UnknownVerdictError" (discriminates across bundle boundaries)', () => {
    const terminal = makeTerminal(99);
    let caught: unknown;
    try {
      assertKnownVerdictOrThrow(terminal);
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).name).toBe('UnknownVerdictError');
  });
});

// ── Known status_code values — must NOT throw ─────────────────────────────

describe('assertKnownVerdictOrThrow — known status_codes do not throw', () => {
  const KNOWN_CODES: Array<[number, string]> = [
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

  for (const [code, label] of KNOWN_CODES) {
    it(`does not throw for status_code ${code} (${label})`, () => {
      const terminal = makeTerminal(code, label);
      expect(() => assertKnownVerdictOrThrow(terminal)).not.toThrow();
    });
  }
});

// ── Return value contract ─────────────────────────────────────────────────

describe('assertKnownVerdictOrThrow — return value for known codes', () => {
  it('returns undefined (void) for a known code — caller proceeds to renderVerdict', () => {
    const terminal = makeTerminal(10, 'Accepted');
    const result = assertKnownVerdictOrThrow(terminal);
    expect(result).toBeUndefined();
  });
});
