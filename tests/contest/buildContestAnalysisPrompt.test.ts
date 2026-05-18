// tests/contest/buildContestAnalysisPrompt.test.ts
// Phase 10 Plan 02 Task 2 — Unit tests for contest analysis prompt builder.

import { describe, it, expect } from 'vitest';
import {
  buildContestAnalysisPrompt,
  type BuildContestAnalysisPromptArgs,
} from '../../src/contest/buildContestAnalysisPrompt';

/** Standard args for tests. */
const STANDARD_ARGS: BuildContestAnalysisPromptArgs = {
  contestTitle: 'Weekly Contest 400',
  contestType: 'weekly',
  durationMin: 85,
  problems: [
    {
      slug: 'minimum-number-of-chairs',
      difficulty: 'Easy',
      verdict: 'accepted',
      timeToSolveMin: 5,
      code: 'class Solution:\n    def solve(self): pass',
      language: 'python3',
    },
    {
      slug: 'find-the-maximum-sum-of-node-values',
      difficulty: 'Medium',
      verdict: 'accepted',
      timeToSolveMin: 22,
      code: 'class Solution {\n    public int solve() { return 0; }\n}',
      language: 'java',
    },
    {
      slug: 'count-paths-with-given-xor',
      difficulty: 'Medium',
      verdict: 'attempted',
      timeToSolveMin: null,
      code: 'def attempt(): pass',
      language: 'python3',
    },
    {
      slug: 'find-subarray-with-bitwise-and',
      difficulty: 'Hard',
      verdict: 'unsolved',
      timeToSolveMin: null,
      code: '',
      language: 'python3',
    },
  ],
};

describe('buildContestAnalysisPrompt', () => {
  it('output contains system instruction about contest performance', () => {
    const output = buildContestAnalysisPrompt(STANDARD_ARGS);

    expect(output).toContain('virtual LeetCode contest performance');
    expect(output).toContain('holistic debrief');
    expect(output).toContain('technique gaps');
  });

  it('each problem appears with slug, difficulty, verdict, code block', () => {
    const output = buildContestAnalysisPrompt(STANDARD_ARGS);

    // Problem 1
    expect(output).toContain('minimum-number-of-chairs');
    expect(output).toContain('Difficulty: Easy');
    expect(output).toContain('Verdict: accepted');
    expect(output).toContain('```python3');
    expect(output).toContain('class Solution:\n    def solve(self): pass');

    // Problem 2
    expect(output).toContain('find-the-maximum-sum-of-node-values');
    expect(output).toContain('Difficulty: Medium');
    expect(output).toContain('```java');

    // Problem 4 (no code — should not have a code block)
    expect(output).toContain('find-subarray-with-bitwise-and');
    expect(output).toContain('Difficulty: Hard');
    expect(output).toContain('Verdict: unsolved');
  });

  it('time-to-solve renders as "{N} min" when provided', () => {
    const output = buildContestAnalysisPrompt(STANDARD_ARGS);

    expect(output).toContain('Time: 5 min');
    expect(output).toContain('Time: 22 min');
  });

  it('time-to-solve renders as "Did not solve" when null', () => {
    const output = buildContestAnalysisPrompt(STANDARD_ARGS);

    // Problems 3 and 4 have null timeToSolveMin
    const matches = output.match(/Time: Did not solve/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  it('empty problems array produces valid prompt (edge case)', () => {
    const args: BuildContestAnalysisPromptArgs = {
      contestTitle: 'Biweekly Contest 150',
      contestType: 'biweekly',
      durationMin: 0,
      problems: [],
    };

    const output = buildContestAnalysisPrompt(args);

    expect(output).toContain('virtual LeetCode contest performance');
    expect(output).toContain('Biweekly Contest 150');
    expect(output).toContain('No problems attempted');
    // Should still be a valid string (no crash)
    expect(output.length).toBeGreaterThan(0);
  });

  it('includes contest metadata (title, type, duration)', () => {
    const output = buildContestAnalysisPrompt(STANDARD_ARGS);

    expect(output).toContain('Weekly Contest 400');
    expect(output).toContain('weekly');
    expect(output).toContain('85 min');
  });

  it('is deterministic (same args produce identical output)', () => {
    const output1 = buildContestAnalysisPrompt(STANDARD_ARGS);
    const output2 = buildContestAnalysisPrompt(STANDARD_ARGS);

    expect(output1).toBe(output2);
  });

  it('does not include code block for problems with empty code', () => {
    const output = buildContestAnalysisPrompt(STANDARD_ARGS);
    const lines = output.split('\n');

    // Find the "find-subarray-with-bitwise-and" section
    const hardProbIdx = lines.findIndex((l) => l.includes('find-subarray-with-bitwise-and'));
    expect(hardProbIdx).toBeGreaterThan(-1);

    // Next section starts at next "## " line (or analysis instructions)
    const nextSectionIdx = lines.findIndex(
      (l, i) => i > hardProbIdx && l.startsWith('## '),
    );

    // Between the hard problem header and next section, there should be no code fence
    const sectionSlice = lines.slice(hardProbIdx, nextSectionIdx).join('\n');
    expect(sectionSlice).not.toContain('```python3');
  });
});
