// Phase 3 Plan 03 Task 1 — RED test for SubmissionError hierarchy.
// Verifies each subclass: (a) instanceof Error, (b) correct .name, (c) shape.
import { describe, it, expect } from 'vitest';
import {
  NoCodeBlockError,
  InProgressError,
  JudgeTimeoutError,
  AbortError,
  UnknownVerdictError,
} from '../../src/shared/errors';

describe('Phase 3 SubmissionError hierarchy (D-15, D-22, D-23, D-24)', () => {
  it('NoCodeBlockError has name + instanceof Error', () => {
    const e = new NoCodeBlockError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(NoCodeBlockError);
    expect(e.name).toBe('NoCodeBlockError');
    expect(typeof e.message).toBe('string');
    expect(e.message.length).toBeGreaterThan(0);
  });

  it('InProgressError has name + instanceof Error', () => {
    const e = new InProgressError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(InProgressError);
    expect(e.name).toBe('InProgressError');
  });

  it('JudgeTimeoutError has name + instanceof Error', () => {
    const e = new JudgeTimeoutError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(JudgeTimeoutError);
    expect(e.name).toBe('JudgeTimeoutError');
  });

  it('AbortError has name + instanceof Error', () => {
    const e = new AbortError();
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AbortError);
    expect(e.name).toBe('AbortError');
  });

  it('UnknownVerdictError carries payload verbatim (D-15 copy-to-clipboard)', () => {
    const payload = { state: 'SUCCESS', status_code: 99999, raw: { foo: 'bar' } };
    const e = new UnknownVerdictError(payload);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(UnknownVerdictError);
    expect(e.name).toBe('UnknownVerdictError');
    expect(e.payload).toBe(payload); // same reference — no clone
  });

  it('UnknownVerdictError.payload accepts arbitrary unknown payload shapes', () => {
    expect(new UnknownVerdictError(null).payload).toBeNull();
    expect(new UnknownVerdictError('string-payload').payload).toBe('string-payload');
    expect(new UnknownVerdictError(42).payload).toBe(42);
    const arr = [1, 2, 3];
    expect(new UnknownVerdictError(arr).payload).toBe(arr);
  });

  it('new error classes are distinct from each other', () => {
    const n = new NoCodeBlockError();
    const p = new InProgressError();
    expect(n).not.toBeInstanceOf(InProgressError);
    expect(p).not.toBeInstanceOf(NoCodeBlockError);
  });
});
