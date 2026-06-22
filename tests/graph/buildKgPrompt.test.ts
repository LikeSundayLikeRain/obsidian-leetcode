// tests/graph/buildKgPrompt.test.ts
//
// Phase 11 Plan 01 Task 1 — buildKgPrompt pure-helper tests.
//
// Verifies (per 11-01-PLAN.md acceptance criteria):
//   - Output contains all seed pattern names from SEED_PATTERNS (39 patterns)
//   - Output contains `## Problem` section with the problemMd content trimmed
//   - Output contains a fenced code block with the language tag and code content trimmed
//   - Output contains JSON schema instructions (pattern, variants, lookAhead)
//   - Determinism: same args produces byte-identical output across 100 calls
//   - Empty code string does not throw — produces valid prompt with empty fence
//   - Output never contains `## Notes` (locked — Notes is never sent to AI per D-03)

import { describe, it, expect } from 'vitest';
import { buildKgPrompt } from '../../src/graph/buildKgPrompt';
import { SEED_PATTERNS } from '../../src/graph/patternTaxonomy';

describe('Phase 11 Plan 01 — buildKgPrompt pure helper', () => {
  it('output contains all seed pattern names', () => {
    const out = buildKgPrompt({
      problemMd: 'Two Sum problem statement.',
      code: 'def twoSum(nums, target):\n    return []',
      language: 'python3',
    });
    expect(SEED_PATTERNS).toHaveLength(40);
    for (const pattern of SEED_PATTERNS) {
      expect(out).toContain(pattern);
    }
  });

  it('output contains ## Problem section with the problemMd content trimmed', () => {
    const out = buildKgPrompt({
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
    const out = buildKgPrompt({
      problemMd: 'Some problem.',
      code: '  def foo():\n    pass  ',
      language: 'python3',
    });
    expect(out).toContain('```python3');
    expect(out).toContain('def foo():\n    pass');
    expect(out).toContain('```');
  });

  it('output contains JSON schema instructions with pattern, variants, lookAhead fields', () => {
    const out = buildKgPrompt({
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    });
    expect(out).toContain('"pattern"');
    expect(out).toContain('"variants"');
    expect(out).toContain('"lookAhead"');
    expect(out).toContain('"slug"');
    expect(out).toContain('"reason"');
  });

  it('determinism: same args produces byte-identical output across 100 calls', () => {
    const args = {
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    };
    const first = buildKgPrompt(args);
    for (let i = 0; i < 100; i++) {
      expect(buildKgPrompt(args)).toBe(first);
    }
  });

  it('empty code string does not throw — produces valid prompt with empty fence', () => {
    expect(() =>
      buildKgPrompt({
        problemMd: 'Some problem.',
        code: '',
        language: 'python3',
      }),
    ).not.toThrow();
    const out = buildKgPrompt({
      problemMd: 'Some problem.',
      code: '',
      language: 'python3',
    });
    expect(out).toContain('```python3');
    expect(out).toContain('## Problem');
  });

  it('output never contains the string `## Notes` (locked decision — Notes is never sent to AI per D-03)', () => {
    const out = buildKgPrompt({
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    });
    expect(out).not.toContain('## Notes');
  });

  it('output lists "Monotonic Queue" as a distinct seed (regression — bug 260607-yyx)', () => {
    const out = buildKgPrompt({
      problemMd: 'Sliding window maximum.',
      code: 'def maxSlidingWindow(nums, k): pass',
      language: 'python3',
    });
    // Both monotonic variants must be in the seed taxonomy presented to the model.
    expect(out).toContain('- Monotonic Queue');
    expect(out).toContain('- Monotonic Stack');
    // Sanity: the deque-vs-stack disambiguation rule is in the prompt so the
    // model can tell sliding-window-min/max apart from next-greater-element.
    expect(out).toContain('Monotonic Queue');
    expect(out).toMatch(/deque/i);
    expect(out).toContain('LC 239');
  });

  it('prompt carries the three classifier-tuning edits (260622-00d)', () => {
    const out = buildKgPrompt({
      problemMd: 'Some problem.',
      code: 'def foo(): pass',
      language: 'python3',
    });
    // Edit #1 — verbatim-names constraint
    expect(out).toContain('verbatim capitalization and punctuation');
    expect(out).toContain('"1-D Dynamic Programming", not "1-d"');
    // Edit #2 — demote enabling steps (appended to rule 1)
    expect(out).toContain('frequently enabling steps, not the primary insight');
    // Edit #3 — tighten the second-pattern bar (appended to rule 3)
    expect(out).toContain('both load-bearing');
    expect(out).toContain('When in doubt, emit one pattern.');
  });
});
