// Phase 3 Plan 03 Task 4 — RED tests for src/solve/types.ts.
// Verifies:
//  - isTerminal narrows correctly for SUCCESS vs PENDING/STARTED
//  - Discriminated-union compiles with the expected exports
//  - Index signature on run/submit responses accepts forward-compat fields

import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  type SubmissionContext,
  type InterpretArgs,
  type SubmitArgs,
  type CheckArgs,
  type PendingCheckResponse,
  type RunCheckResponse,
  type SubmitCheckResponse,
  type CheckResponse,
} from '../../src/solve/types';

describe('Phase 3 src/solve/types.ts (D-16, D-30)', () => {
  it('isTerminal returns false for PENDING state', () => {
    const p: PendingCheckResponse = { state: 'PENDING' };
    expect(isTerminal(p as CheckResponse)).toBe(false);
  });

  it('isTerminal returns false for STARTED state', () => {
    const p: PendingCheckResponse = { state: 'STARTED' };
    expect(isTerminal(p as CheckResponse)).toBe(false);
  });

  it('isTerminal returns true for SUCCESS state (Run response)', () => {
    const r: RunCheckResponse = {
      state: 'SUCCESS',
      status_code: 10,
      code_answer: ['1'],
      expected_code_answer: ['1'],
      correct_answer: true,
    };
    expect(isTerminal(r as CheckResponse)).toBe(true);
  });

  it('isTerminal returns true for SUCCESS state (Submit response)', () => {
    const s: SubmitCheckResponse = {
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      status_runtime: '12 ms',
      status_memory: '14.2 MB',
      runtime_percentile: 98.5,
      memory_percentile: 42.0,
      total_correct: 58,
      total_testcases: 58,
    };
    expect(isTerminal(s as CheckResponse)).toBe(true);
  });

  it('RunCheckResponse accepts forward-compat fields via index signature', () => {
    const r: RunCheckResponse = {
      state: 'SUCCESS',
      status_code: 10,
      unknown_new_field_from_lc: 'surprise',
    };
    expect(r['unknown_new_field_from_lc']).toBe('surprise');
  });

  it('SubmissionContext shape compiles with required fields', () => {
    const ctx: SubmissionContext = {
      slug: 'two-sum',
      langSlug: 'python3',
      typedCode: 'class Solution:\n    pass',
      questionId: '1',
      problemTitle: 'Two Sum',
    };
    expect(ctx.slug).toBe('two-sum');
    expect(ctx.questionId).toBe('1');
  });

  it('InterpretArgs + SubmitArgs + CheckArgs shape compiles', () => {
    const cookies = { LEETCODE_SESSION: 'X', csrftoken: 'Y' };
    const interpret: InterpretArgs = {
      slug: 'two-sum',
      lang: 'python3',
      questionId: '1',
      typedCode: 'code',
      dataInput: '[2,7]\n9',
      cookies,
    };
    const submit: SubmitArgs = {
      slug: 'two-sum',
      lang: 'python3',
      questionId: '1',
      typedCode: 'code',
      cookies,
    };
    const check: CheckArgs = { id: 'submission-123', slug: 'two-sum', cookies };
    expect(interpret.dataInput).toBe('[2,7]\n9');
    expect(submit.typedCode).toBe('code');
    expect(check.slug).toBe('two-sum');
  });
});
