// tests/solve/codeExtractor.test.ts
// RED baseline (Wave 0) — will fail to import until Plan 02 ships
// src/solve/codeExtractor.ts with extractFirstFencedBlock.
//
// Contracts under test:
//   D-01: extract the FIRST fenced code block in the note body
//   D-02: preserve the fence tag (language) so caller can dispatch
//   D-03: untagged fence returns lang=null; caller resolves via resolveLangSlug
//   D-04: no fenced block returns null (callers surface Notice + abort)
//   purity: same input → same output (vault.process retry-safe)
//
// Requirements covered: SOLVE-01 (extraction contract), SOLVE-08
// (language plumbing), SOLVE-09 (current-content-at-submit invariant).
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED: will resolve once Plan 02 ships the module
import { extractFirstFencedBlock } from '../../src/solve/codeExtractor';

describe('codeExtractor.extractFirstFencedBlock (SOLVE-01/SOLVE-08/SOLVE-09, D-01..D-04)', () => {
  it('D-01: extracts the first fenced block and returns its language + content', () => {
    const body = [
      '## Problem',
      'text',
      '',
      '## Code',
      '',
      '```python3',
      'def solve(): pass',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    expect(extractFirstFencedBlock(body)).toEqual({
      lang: 'python3',
      code: 'def solve(): pass',
    });
  });

  it('D-02: preserves the exact fence tag (language) on the opening fence', () => {
    const body = '```cpp\nclass Solution {};\n```\n';
    expect(extractFirstFencedBlock(body)?.lang).toBe('cpp');
  });

  it('D-03: sets lang=null for an untagged fence (caller resolves via resolveLangSlug)', () => {
    const body = '```\nx = 1\n```\n';
    expect(extractFirstFencedBlock(body)).toEqual({ lang: null, code: 'x = 1' });
  });

  it('D-04: returns null when no fenced block exists (triggers "No code block found" Notice)', () => {
    expect(extractFirstFencedBlock('## Problem\nno code here\n')).toBeNull();
  });

  it('D-04: returns null for an unclosed fence (treat as no valid block)', () => {
    expect(extractFirstFencedBlock('```python3\ndef solve(): pass\n')).toBeNull();
  });

  it('returns only the FIRST of multiple fenced blocks (D-01 first-wins rule)', () => {
    const body = '```python3\nfirst\n```\n\ntext\n\n```java\nsecond\n```\n';
    expect(extractFirstFencedBlock(body)).toEqual({
      lang: 'python3',
      code: 'first',
    });
  });

  it('purity: same input gives identical output on re-invocation (vault.process retry-safe)', () => {
    const input = '```py\nx\n```\n';
    expect(extractFirstFencedBlock(input)).toEqual(extractFirstFencedBlock(input));
  });
});
