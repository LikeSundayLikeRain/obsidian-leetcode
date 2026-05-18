// tests/ai/buildReviewPrompt.test.ts
//
// Phase 09 Plan 01 Task 1 — buildReviewPrompt pure-helper tests.
//
// Verifies (per 09-01-PLAN.md acceptance criteria):
//   - Output contains `### Approach`, `### Efficiency`, `### Code Style` as three distinct headings
//   - Output contains `## Problem` section with the problemMd content trimmed
//   - Output contains a fenced code block with the language tag and code content trimmed
//   - Output includes instruction about not including code for minor style tweaks (D-04)
//   - Output never contains `## Notes` (locked — Notes is never sent to AI)
//   - Determinism: same args → byte-identical output across 100 calls
//   - Empty code string does not throw — produces valid prompt with empty fence

import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../../src/ai/buildReviewPrompt';

describe('Phase 09 Plan 01 — buildReviewPrompt pure helper', () => {
  it('output contains ### Approach, ### Efficiency, ### Code Style as three distinct headings', () => {
    const out = buildReviewPrompt({
      problemMd: 'Two Sum problem statement.',
      code: 'def twoSum(nums, target):\n    return []',
      language: 'python3',
    });
    expect(out).toContain('### Approach');
    expect(out).toContain('### Efficiency');
    expect(out).toContain('### Code Style');
    // Exactly 3 H3 headings
    const h3Matches = out.match(/^### /gm);
    expect(h3Matches).toHaveLength(3);
  });

  it('output contains ## Problem section with the problemMd content trimmed', () => {
    const out = buildReviewPrompt({
      problemMd: '  Two Sum problem with whitespace.  ',
      code: 'def foo(): pass',
      language: 'python3',
    });
    expect(out).toContain('## Problem');
    expect(out).toContain('Two Sum problem with whitespace.');
    // Verify trimming — no leading/trailing whitespace around the problem content
    expect(out).not.toContain('  Two Sum problem with whitespace.  ');
  });

  it('output contains a fenced code block with the language tag and code content trimmed', () => {
    const out = buildReviewPrompt({
      problemMd: 'Some problem.',
      code: '  def foo():\n    pass  ',
      language: 'python3',
    });
    expect(out).toContain('```python3');
    expect(out).toContain('def foo():\n    pass');
    expect(out).toContain('```');
  });

  it('output includes instruction "Do NOT include code for minor style tweaks" (D-04 enforcement)', () => {
    const out = buildReviewPrompt({
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    });
    expect(out.toLowerCase()).toContain('do not include code');
  });

  it('output never contains the string `## Notes` (locked decision — Notes is never sent to AI)', () => {
    const out = buildReviewPrompt({
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    });
    expect(out).not.toContain('## Notes');
  });

  it('determinism: same args produces byte-identical output across 100 calls', () => {
    const args = {
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    };
    const first = buildReviewPrompt(args);
    for (let i = 0; i < 100; i++) {
      expect(buildReviewPrompt(args)).toBe(first);
    }
  });

  it('empty code string does not throw — produces valid prompt with empty fence', () => {
    expect(() =>
      buildReviewPrompt({
        problemMd: 'Some problem.',
        code: '',
        language: 'python3',
      }),
    ).not.toThrow();
    const out = buildReviewPrompt({
      problemMd: 'Some problem.',
      code: '',
      language: 'python3',
    });
    expect(out).toContain('```python3');
    expect(out).toContain('### Approach');
  });
});
