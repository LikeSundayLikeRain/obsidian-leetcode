// tests/graph/copyToCode.confirm.test.ts
//
// Phase 5.2 Plan 04 — D-10: SubmissionDetailModal confirm gate removed.
// Reset command confirm gate is tested in tests/main/resetCommand.test.ts.
// Silent-overwrite behavior is tested in
// tests/graph/SubmissionDetailModal.silent-copy.test.ts.
//
// This file survives as lightweight coverage for the `hasExistingCodeBlock`
// predicate — still exported from `src/graph/copyToCode.ts` and still used by
// `resetCodeWithConfirm` (the destructive Reset command path).

import { describe, it, expect } from 'vitest';
import { hasExistingCodeBlock } from '../../src/graph/copyToCode';

describe('hasExistingCodeBlock', () => {
  it('returns false for whitespace-only fence', () => {
    const emptyFence = '## Problem\nfoo\n\n## Code\n```python3\n\n```\n';
    expect(hasExistingCodeBlock(emptyFence)).toBe(false);

    const whitespaceFence = '## Code\n```python3\n   \n   \n```\n';
    expect(hasExistingCodeBlock(whitespaceFence)).toBe(false);

    const noCodeSection = '## Problem\nfoo\n\n## Notes\nbar\n';
    expect(hasExistingCodeBlock(noCodeSection)).toBe(false);
  });

  it('returns true for non-empty fence', () => {
    const withCode = '## Code\n```python3\nclass Solution:\n    pass\n```\n';
    expect(hasExistingCodeBlock(withCode)).toBe(true);

    const oneLiner = '## Code\n```java\nclass S {}\n```\n';
    expect(hasExistingCodeBlock(oneLiner)).toBe(true);
  });
});
