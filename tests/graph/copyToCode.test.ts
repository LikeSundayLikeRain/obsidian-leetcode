// tests/graph/copyToCode.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-01 revised (copy-to-code helper).
// Target: src/graph/copyToCode.ts (Wave 2) — exports copyToCode + hasExistingCodeBlock.
//
// copyToCode is a thin vault.process wrapper that routes the submitted code
// through forceInjectCodeSection (Phase 3 pure transform). It rewrites the
// existing ## Code fenced block with the submitted language tag and body.

import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
// Target — does not exist until Wave 2 ships it.
import { copyToCode } from '../../src/graph/copyToCode';

describe('copyToCode (GRAPH-01 revised)', () => {
  it('overwrites ## Code fenced block via vault.process', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Problem\nfoo\n\n## Code\n```python3\nOLD\n```\n\n## Notes\nbar\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    await copyToCode(m.app as never, file as never, 'class Solution {}', 'java');

    // Went through vault.process (CF-06 discipline — NEVER vault.modify).
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    expect(m.spies.process).toHaveBeenCalledWith(file, expect.any(Function));

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('## Code');
    expect(body).toContain('```java');
    expect(body).toContain('class Solution {}');
    expect(body).not.toContain('```python3\nOLD');
    // Sibling regions preserved.
    expect(body).toContain('## Problem');
    expect(body).toContain('## Notes');
  });
});
