// tests/solve/submissionOrchestrator.onVerdict.test.ts
//
// Phase 08 Plan 01 Task 2 — Wave 0 RED tests for the orchestrator post-resolve
// callback `onVerdict` and the run-side capture helper
// `extractRunFailureForVerdictStore`.
//
// Submit-side contract (locked verbatim from 08-RESEARCH §"Code Examples"
// Example 6 + 08-PATTERNS §"src/solve/submissionOrchestrator.ts"):
//   - SubmissionOrchestratorDeps gains optional
//     `onVerdict?: (slug: string, verdict: LastVerdict) => void`.
//   - After pollSubmission resolves, classify via
//     `classifyStatus(terminal.status_code, terminal.status_msg)` and ONLY fire
//     `onVerdict` when `info.kind !== 'ac' && info.kind !== 'unknown' &&
//     info.kind !== 'unknown-lc'`.
//   - LastVerdict population mapping (verbatim — see decision B + RESEARCH):
//       failingInput   = terminal.input || terminal.last_testcase
//       expectedOutput = terminal.expected_output ?? asString(terminal.expected_code_answer)
//       actualOutput   = terminal.std_output ?? asString(terminal.code_output)
//       runtimeMs      = terminal.status_runtime
//       memoryMb       = terminal.status_memory
//       errorMessage   = first non-empty of [full_compile_error, compile_error,
//                                            full_runtime_error, runtime_error]
//   - Existing tests (no onVerdict supplied) MUST continue to pass — onVerdict
//     is optional to preserve Wave-0 backward compat.
//
// Run-side contract:
//   - `extractRunFailureForVerdictStore(res, joinedDataInput, metaData)` is a
//     pure helper exported from `src/solve/runArity.ts`. It reuses
//     `splitInput` / `splitOutput` to slice the FIRST failing case from
//     `compare_result` (first '0' in the mask). Returns
//     `{ failingInput?, expectedOutput?, actualOutput?, errorMessage? }`.
//   - When `compare_result` is all-pass ('111…1'), the helper returns an
//     object with `failingInput === undefined` (no actionable failing case).
//     A wrapper at the run-resolve point (main.ts) consults the kind and
//     fires onVerdict only on non-AC.

import { describe, it, expect, vi } from 'vitest';
import { makeFakeFetcher } from './mocks/fakeFetcher';
import { makeFakeSettingsStore, makeDetailCacheEntry } from './mocks/fakeSettingsStore';
import { extractRunFailureForVerdictStore } from '../../src/solve/runArity';
import type { LastVerdict } from '../../src/solve/lastVerdictStore';

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Notice: class { constructor(_msg: unknown, _ms?: number) { /* swallowed */ } },
  };
});

import { SubmissionOrchestrator } from '../../src/solve/submissionOrchestrator';

/** Drive submit() to terminal and return the captured onVerdict invocations.
 *  Each terminal-response shape is queued on the /check/ endpoint and
 *  immediately served. */
async function driveSubmitToTerminal(
  terminal: Record<string, unknown>,
): Promise<{ slugs: string[]; verdicts: LastVerdict[] }> {
  const ff = makeFakeFetcher();
  const settings = makeFakeSettingsStore({
    problemDetails: { 'two-sum': makeDetailCacheEntry() },
  });
  ff.queue(/\/submit\/$/, [{ status: 200, json: { submission_id: 42 } }]);
  ff.queue(/check\/$/, [{ status: 200, json: terminal }]);
  const slugs: string[] = [];
  const verdicts: LastVerdict[] = [];
  const orch = new SubmissionOrchestrator({
    fetcher: ff.fetcher,
    settings,
    slug: 'two-sum',
    getCurrentBody: () => '## Code\n\n```python3\nclass Solution: pass\n```\n',
    onVerdict: (slug, v) => {
      slugs.push(slug);
      verdicts.push(v);
    },
  });
  await orch.submit();
  return { slugs, verdicts };
}

describe('Phase 08 submissionOrchestrator — onVerdict callback (08-CONTEXT decision B)', () => {
  it('Accepted (status_code=10) does NOT fire onVerdict (Phase 09 territory)', async () => {
    const { verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 10,
      status_msg: 'Accepted',
      status_runtime: '52 ms',
      status_memory: '14.5 MB',
    });
    expect(verdicts).toHaveLength(0);
  });

  it('WA (status_code=11) fires onVerdict with kind=submit-failure and full LastVerdict shape', async () => {
    const { slugs, verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 11,
      status_msg: 'Wrong Answer',
      status_runtime: '88 ms',
      status_memory: '14.6 MB',
      input: '[2,7,11,15]\n9',
      expected_output: '[0,1]',
      std_output: '[1,0]',
      code_output: ['[1,0]'],
      expected_code_answer: ['[0,1]'],
    });
    expect(verdicts).toHaveLength(1);
    expect(slugs[0]).toBe('two-sum');
    const v = verdicts[0]!;
    expect(v.kind).toBe('submit-failure');
    expect(v.verdictText).toBe('Wrong Answer');
    expect(v.failingInput).toBe('[2,7,11,15]\n9');
    expect(v.expectedOutput).toBe('[0,1]');
    expect(v.actualOutput).toBe('[1,0]');
    expect(v.runtimeMs).toBe('88 ms');
    expect(v.memoryMb).toBe('14.6 MB');
    expect(v.errorMessage).toBeUndefined();
    expect(typeof v.capturedAt).toBe('number');
  });

  it('TLE (status_code=14) fires onVerdict with runtimeMs populated', async () => {
    const { verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 14,
      status_msg: 'Time Limit Exceeded',
      status_runtime: '5000 ms',
      input: 'large input',
      last_testcase: 'large input',
    });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe('submit-failure');
    expect(verdicts[0]!.verdictText).toBe('Time Limit Exceeded');
    expect(verdicts[0]!.runtimeMs).toBe('5000 ms');
    expect(verdicts[0]!.failingInput).toBe('large input');
  });

  it('MLE (status_code=12) fires onVerdict with memoryMb populated', async () => {
    const { verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 12,
      status_msg: 'Memory Limit Exceeded',
      status_memory: '256 MB',
      last_testcase: 'big',
    });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe('submit-failure');
    expect(verdicts[0]!.verdictText).toBe('Memory Limit Exceeded');
    expect(verdicts[0]!.memoryMb).toBe('256 MB');
    expect(verdicts[0]!.failingInput).toBe('big');
  });

  it('RE (status_code=15) fires onVerdict with errorMessage from runtime_error', async () => {
    const { verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 15,
      status_msg: 'Runtime Error',
      runtime_error: 'IndexError: list index out of range',
      full_runtime_error: 'Traceback (most recent call last):\n...IndexError: list index out of range',
      last_testcase: '[]',
    });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe('submit-failure');
    expect(verdicts[0]!.verdictText).toBe('Runtime Error');
    // First non-empty of [full_compile_error, compile_error, full_runtime_error, runtime_error]
    // → full_runtime_error wins (full_compile_error and compile_error absent).
    expect(verdicts[0]!.errorMessage).toContain('IndexError');
    expect(verdicts[0]!.errorMessage).toContain('Traceback');
  });

  it('CE (status_code=20) fires onVerdict with errorMessage from compile_error', async () => {
    const { verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 20,
      status_msg: 'Compile Error',
      compile_error: 'expected ; before }',
      full_compile_error: 'Line 7: error: expected ; before }',
    });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.kind).toBe('submit-failure');
    expect(verdicts[0]!.verdictText).toBe('Compile Error');
    // full_compile_error wins (highest priority in firstNonEmpty list).
    expect(verdicts[0]!.errorMessage).toBe('Line 7: error: expected ; before }');
  });

  it('Unknown status (status_code=999) does NOT fire onVerdict', async () => {
    const { verdicts } = await driveSubmitToTerminal({
      state: 'SUCCESS',
      status_code: 999,
      status_msg: 'Mystery',
    });
    expect(verdicts).toHaveLength(0);
  });

  it('deps.onVerdict undefined: orchestrator does not throw on non-AC verdict', async () => {
    const ff = makeFakeFetcher();
    const settings = makeFakeSettingsStore({
      problemDetails: { 'two-sum': makeDetailCacheEntry() },
    });
    ff.queue(/\/submit\/$/, [{ status: 200, json: { submission_id: 42 } }]);
    ff.queue(/check\/$/, [{
      status: 200,
      json: {
        state: 'SUCCESS',
        status_code: 11,
        status_msg: 'Wrong Answer',
        input: '[1]\n2',
      },
    }]);
    // No onVerdict in deps — backward compat with Wave 0 tests.
    const orch = new SubmissionOrchestrator({
      fetcher: ff.fetcher,
      settings,
      slug: 'two-sum',
      getCurrentBody: () => '## Code\n\n```python3\npass\n```\n',
    });
    await expect(orch.submit()).resolves.not.toThrow();
  });
});

describe('Phase 08 extractRunFailureForVerdictStore — run-side capture helper', () => {
  it('compare_result="110" identifies index 2 as the failing case (first 0)', () => {
    const out = extractRunFailureForVerdictStore(
      {
        state: 'SUCCESS',
        status_code: 11,
        status_msg: 'Wrong Answer',
        compare_result: '110',
        code_answer: ['[0,1]', '[1,2]', '[0,2]'],
        expected_code_answer: ['[0,1]', '[1,2]', '[1,2]'],
      },
      // joinedDataInput: 3 cases × 2 lines per case = 6 lines.
      '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
      { arity: 3, linesPerCase: 2 },
    );
    expect(out.failingInput).toBe('[3,3]\n6');
    expect(out.expectedOutput).toBe('[1,2]');
    expect(out.actualOutput).toBe('[0,2]');
    expect(out.errorMessage).toBeUndefined();
  });

  it('compare_result="111" (all-pass) returns undefined failingInput (no actionable failure)', () => {
    const out = extractRunFailureForVerdictStore(
      {
        state: 'SUCCESS',
        status_code: 10,
        status_msg: 'Accepted',
        compare_result: '111',
        code_answer: ['[0,1]', '[1,2]', '[0,2]'],
        expected_code_answer: ['[0,1]', '[1,2]', '[0,2]'],
      },
      '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
      { arity: 3, linesPerCase: 2 },
    );
    expect(out.failingInput).toBeUndefined();
    expect(out.expectedOutput).toBeUndefined();
    expect(out.actualOutput).toBeUndefined();
  });

  it('Run-mode error (compile_error present, no compare_result) returns errorMessage', () => {
    const out = extractRunFailureForVerdictStore(
      {
        state: 'SUCCESS',
        status_code: 20,
        status_msg: 'Compile Error',
        compile_error: 'expected ;',
        full_compile_error: 'Line 5: error: expected ;',
      },
      '',
      { arity: 0, linesPerCase: 1 },
    );
    expect(out.errorMessage).toBe('Line 5: error: expected ;');
    expect(out.failingInput).toBeUndefined();
    expect(out.expectedOutput).toBeUndefined();
    expect(out.actualOutput).toBeUndefined();
  });
});
