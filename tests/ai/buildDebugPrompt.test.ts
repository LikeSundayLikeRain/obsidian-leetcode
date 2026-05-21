// tests/ai/buildDebugPrompt.test.ts
//
// Phase 08 Plan 03 Task 1 — buildDebugPrompt pure-helper tests.
//
// Verifies (per 08-PLAN.md acceptance criteria):
//   - Verbatim fixture round-trip with full LastVerdict.
//   - Empty-store path emits literal 'No verdict yet — review the code as-is.'
//   - `## Notes` content NEVER appears in output (defense-in-depth).
//   - All 4 mandatory inputs present (problem, code, language, verdict-block).
//   - TLE verdict produces `Runtime: ...` line.
//   - MLE verdict produces `Memory: ...` line.
//   - RE/CE verdict produces fenced `Error:\n```\n...\n```` block.
//   - Determinism: same args → byte-identical output across 100 calls.

import { describe, it, expect } from 'vitest';
import { buildDebugPrompt } from '../../src/ai/buildDebugPrompt';
import type { LastVerdict } from '../../src/solve/lastVerdictStore';

describe('Phase 08 Plan 03 — buildDebugPrompt pure helper', () => {
  it('verbatim fixture round-trip with full LastVerdict', () => {
    const verdict: LastVerdict = {
      kind: 'submit-failure',
      capturedAt: 1234567890,
      verdictText: 'Wrong Answer',
      failingInput: '[2,7,11,15]\n9',
      expectedOutput: '[0,1]',
      actualOutput: '[1,2]',
    };
    const out = buildDebugPrompt({
      problemMd: 'Two Sum problem statement.',
      code: 'def twoSum(nums, target):\n    return []',
      language: 'python3',
      lastVerdict: verdict,
    });
    const expected = [
      'You are debugging a LeetCode solution. Be concise. Do not rewrite the entire problem.',
      '',
      '## Problem',
      'Two Sum problem statement.',
      '',
      '## My python3 solution',
      '```python3',
      'def twoSum(nums, target):\n    return []',
      '```',
      '',
      '## What happened on my last run',
      'Verdict: Wrong Answer',
      'Input: [2,7,11,15]\n9',
      'Expected output: [0,1]',
      'My output: [1,2]',
      '',
      '## Tasks',
      '1. Tell me what is wrong.',
      '2. Suggest the smallest fix that makes the failing case pass.',
      '3. Show the corrected code in a fenced block. Do not rewrite unchanged sections; show the full corrected solution only if a partial diff would be confusing.',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it("empty-store path emits literal 'No verdict yet — review the code as-is.'", () => {
    const out = buildDebugPrompt({
      problemMd: 'Some problem.',
      code: 'pass',
      language: 'python3',
    });
    expect(out).toContain('No verdict yet — review the code as-is.');
    // Defensive: the verdictBlock placeholder format ('Verdict: ') must NOT
    // appear when no verdict is present.
    expect(out).not.toContain('Verdict:');
  });

  it("`## Notes` content NEVER appears in output (defense-in-depth)", () => {
    // Even when a maintainer accidentally threads ## Notes content via the
    // `code` arg, the output must NOT carry the heading or content. The
    // helper does NOT scrub the code string itself (it's a string-pass-through),
    // but it MUST NOT introduce a `## Notes` heading anywhere on its own.
    const out = buildDebugPrompt({
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    });
    expect(out).not.toContain('## Notes');
  });

  it('all 4 mandatory inputs present (problem, code, language, verdict-block)', () => {
    const verdict: LastVerdict = {
      kind: 'submit-failure',
      capturedAt: 1234,
      verdictText: 'Wrong Answer',
    };
    const out = buildDebugPrompt({
      problemMd: 'PROBLEM_BODY_MARKER',
      code: 'CODE_BODY_MARKER',
      language: 'java',
      lastVerdict: verdict,
    });
    expect(out).toContain('PROBLEM_BODY_MARKER');
    expect(out).toContain('CODE_BODY_MARKER');
    expect(out).toContain('java');
    expect(out).toContain('Wrong Answer');
    // Section headings must all be present.
    expect(out).toContain('## Problem');
    expect(out).toContain('## My java solution');
    expect(out).toContain('## What happened on my last run');
    expect(out).toContain('## Tasks');
  });

  it('TLE verdict produces `Runtime:` line', () => {
    const verdict: LastVerdict = {
      kind: 'submit-failure',
      capturedAt: 1,
      verdictText: 'Time Limit Exceeded',
      runtimeMs: '1500 ms',
    };
    const out = buildDebugPrompt({
      problemMd: 'p',
      code: 'c',
      language: 'python3',
      lastVerdict: verdict,
    });
    expect(out).toContain('Runtime: 1500 ms');
  });

  it('MLE verdict produces `Memory:` line', () => {
    const verdict: LastVerdict = {
      kind: 'submit-failure',
      capturedAt: 1,
      verdictText: 'Memory Limit Exceeded',
      memoryMb: '256 MB',
    };
    const out = buildDebugPrompt({
      problemMd: 'p',
      code: 'c',
      language: 'python3',
      lastVerdict: verdict,
    });
    expect(out).toContain('Memory: 256 MB');
  });

  it('RE/CE verdict produces fenced Error: block', () => {
    const verdict: LastVerdict = {
      kind: 'submit-failure',
      capturedAt: 1,
      verdictText: 'Runtime Error',
      errorMessage: 'IndexError: list index out of range\n  at line 5',
    };
    const out = buildDebugPrompt({
      problemMd: 'p',
      code: 'c',
      language: 'python3',
      lastVerdict: verdict,
    });
    expect(out).toContain('Error:');
    expect(out).toContain('```');
    expect(out).toContain('IndexError: list index out of range');
  });

  it('determinism: same args → byte-identical output across 100 calls', () => {
    const args = {
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
      lastVerdict: {
        kind: 'submit-failure' as const,
        capturedAt: 1,
        verdictText: 'Wrong Answer',
        failingInput: 'abc',
      },
    };
    const first = buildDebugPrompt(args);
    for (let i = 0; i < 100; i++) {
      expect(buildDebugPrompt(args)).toBe(first);
    }
  });
});
