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
});
