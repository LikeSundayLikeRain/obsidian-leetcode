import { describe, it, expect } from 'vitest';
import { extractFirstFencedBlock } from '../../src/solve/codeExtractor';

describe('extractFirstFencedBlock (SOLVE-01, SOLVE-09)', () => {
  it('returns null for an empty body', () => {
    expect(extractFirstFencedBlock('')).toBeNull();
  });

  it('returns null when no fenced block is present', () => {
    const body = '## Problem\nA problem.\n\n## Notes\nJust text.\n';
    expect(extractFirstFencedBlock(body)).toBeNull();
  });

  it('extracts the first fenced block with a language tag', () => {
    const body = '## Code\n```python3\ndef solve():\n    pass\n```\n';
    const result = extractFirstFencedBlock(body);
    expect(result).not.toBeNull();
    expect(result?.lang).toBe('python3');
    expect(result?.code).toBe('def solve():\n    pass');
  });

  it('returns lang=null for untagged fence (bare ```)', () => {
    const body = '```\nprint("hi")\n```';
    const result = extractFirstFencedBlock(body);
    expect(result).not.toBeNull();
    expect(result?.lang).toBeNull();
    expect(result?.code).toBe('print("hi")');
  });

  it('only returns the first block when multiple are present', () => {
    const body = [
      '```python3',
      'first = 1',
      '```',
      '',
      '```java',
      'class Second {}',
      '```',
    ].join('\n');
    const result = extractFirstFencedBlock(body);
    expect(result?.lang).toBe('python3');
    expect(result?.code).toBe('first = 1');
  });

  it('returns null for an unclosed fence', () => {
    const body = '```python3\ndef solve():\n    pass\n';
    expect(extractFirstFencedBlock(body)).toBeNull();
  });

  it('allows `c++` and `c#` tags through the regex (caller normalizes)', () => {
    const a = extractFirstFencedBlock('```c++\nint x;\n```');
    expect(a?.lang).toBe('c++');
    const b = extractFirstFencedBlock('```c#\nint y;\n```');
    expect(b?.lang).toBe('c#');
  });

  it('preserves blank lines inside the code block', () => {
    const body = '```python3\na = 1\n\nb = 2\n```';
    const result = extractFirstFencedBlock(body);
    expect(result?.code).toBe('a = 1\n\nb = 2');
  });

  it('is pure — same input returns same output', () => {
    const input = '```ts\nconst x = 1;\n```';
    const a = extractFirstFencedBlock(input);
    const b = extractFirstFencedBlock(input);
    expect(a).toEqual(b);
  });

  it('handles a fence tag with trailing whitespace', () => {
    const body = '```python3   \nx = 1\n```';
    const result = extractFirstFencedBlock(body);
    expect(result?.lang).toBe('python3');
    expect(result?.code).toBe('x = 1');
  });

  it('scopes to ## Code section — ignores fences inside ## Problem (Phase 3 UAT regression)', () => {
    const body = [
      '## Problem',
      '',
      'Example 1:',
      '```',
      'Input: nums = [2,7,11,15], target = 9',
      'Output: [0,1]',
      '```',
      '',
      '## Code',
      '',
      '```java',
      'class Solution {',
      '    public int[] twoSum(int[] nums, int target) {',
      '        return new int[]{0, 1};',
      '    }',
      '}',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const result = extractFirstFencedBlock(body);
    expect(result?.lang).toBe('java');
    expect(result?.code).toContain('class Solution');
    expect(result?.code).not.toContain('Input:');
  });

  it('falls back to body-first fence when no ## Code heading exists', () => {
    const body = '```python3\nx = 1\n```';
    const result = extractFirstFencedBlock(body);
    expect(result?.lang).toBe('python3');
    expect(result?.code).toBe('x = 1');
  });

  it('returns null when ## Code heading exists but section has no fence (Phase 3 UAT regression)', () => {
    // User has a `## Code` heading declaring intent but hasn't pasted code yet.
    // Must NOT fall back to example fences inside ## Problem — silent wrong-
    // answer submits to LC are worse than a clear "no code block" Notice.
    const body = [
      '## Problem',
      '',
      'Example:',
      '```',
      'Input: l1 = [2,4,3], l2 = [5,6,4]',
      'Output: [7,0,8]',
      '```',
      '',
      '## Code',
      '',
      '## Notes',
      '',
    ].join('\n');
    const result = extractFirstFencedBlock(body);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-03 Task 1 — frontmatter-source dispatch (D-extract-01).
//
// When the located fence is ```leetcode-solve, frontmatter['lc-language'] is
// the source of truth for the language slug. When the located fence is any
// other tag (legacy LC fence, ```text, ```bash, …), behavior is preserved
// verbatim — the fence tag wins regardless of frontmatter.
//
// Phase 22 deletes the legacy fence-tag branch (it becomes unreachable once
// `useInlineWidget=ON` is the default and all notes have migrated to v1.3).
// ─────────────────────────────────────────────────────────────────────────
describe('extractFirstFencedBlock — frontmatter-source dispatch (Plan 21-03, D-extract-01)', () => {
  const V13_BODY = '## Code\n\n```leetcode-solve\nbody\n```\n';
  const LEGACY_BODY = '## Code\n\n```python\nbody\n```\n';
  const NON_LC_BODY = '## Code\n\n```bash\necho hi\n```\n';

  it('frontmatter-source — Branch A: leetcode-solve fence + lc-language=java → lang=java', () => {
    const result = extractFirstFencedBlock(V13_BODY, { 'lc-language': 'java' });
    expect(result).not.toBeNull();
    expect(result?.lang).toBe('java');
    expect(result?.code).toBe('body');
  });

  it('frontmatter-source — Branch B: leetcode-solve fence + missing lc-language → lang=null (caller resolves)', () => {
    const result = extractFirstFencedBlock(V13_BODY, {});
    expect(result).not.toBeNull();
    expect(result?.lang).toBeNull();
    expect(result?.code).toBe('body');
  });

  it('frontmatter-source — Branch B alt: leetcode-solve fence + empty lc-language → lang=null', () => {
    const result = extractFirstFencedBlock(V13_BODY, { 'lc-language': '' });
    expect(result).not.toBeNull();
    expect(result?.lang).toBeNull();
    expect(result?.code).toBe('body');
  });

  it('frontmatter-source — Branch C: legacy ```python fence + lc-language=java → lang=python (transition contract)', () => {
    // CRITICAL: legacy fence tags ignore frontmatter so unmigrated notes keep
    // working until they're migrated by fenceMigrator. After migration, the
    // fence becomes `leetcode-solve` and frontmatter takes over.
    const result = extractFirstFencedBlock(LEGACY_BODY, { 'lc-language': 'java' });
    expect(result).not.toBeNull();
    expect(result?.lang).toBe('python');
    expect(result?.code).toBe('body');
  });

  it('frontmatter-source — undefined frontmatter falls through to legacy behavior', () => {
    // Backward-compat: callers that haven't been updated to pass the second arg
    // continue to get the legacy 1-arg path.
    const result = extractFirstFencedBlock(LEGACY_BODY, undefined);
    expect(result).not.toBeNull();
    expect(result?.lang).toBe('python');
    expect(result?.code).toBe('body');
  });

  it('frontmatter-source — non-LC fence (```bash) ignores lc-language', () => {
    // The frontmatter-source dispatch ONLY fires for the leetcode-solve opener.
    // Non-LC fences keep their tag — same as legacy fence behavior.
    const result = extractFirstFencedBlock(NON_LC_BODY, { 'lc-language': 'java' });
    expect(result).not.toBeNull();
    expect(result?.lang).toBe('bash');
    expect(result?.code).toBe('echo hi');
  });

  it('frontmatter-source — leetcode-solve fence with no ## Code heading still applies frontmatter dispatch', () => {
    const body = '```leetcode-solve\nx = 1\n```\n';
    const result = extractFirstFencedBlock(body, { 'lc-language': 'rust' });
    expect(result).not.toBeNull();
    expect(result?.lang).toBe('rust');
    expect(result?.code).toBe('x = 1');
  });
});
