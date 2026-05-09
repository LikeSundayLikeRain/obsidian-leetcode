// tests/graph/copyToCode.confirm.test.ts
//
// Phase 4 Wave 0 — TDD red stub for ConfirmOverwriteModal gate.
// Target: src/graph/copyToCode.ts (Wave 2) — exports hasExistingCodeBlock.
//
// The confirm modal fires only when ## Code has a NON-EMPTY fenced block.
// An empty fenced block (starter code cleared by the user) is treated as
// "nothing to preserve" → copy proceeds without the confirm modal.

import { describe, it, expect } from 'vitest';
// Target — does not exist until Wave 2 ships it.
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
