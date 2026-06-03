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
    // v1.3: emitter writes only ```leetcode-solve fence, regardless of submission language.
    // Language is tracked via lc-language frontmatter, not the fence opener.
    expect(body).toContain('```leetcode-solve');
    expect(body).toContain('class Solution {}');
    expect(body).not.toContain('OLD');
    // Sibling regions preserved.
    expect(body).toContain('## Problem');
    expect(body).toContain('## Notes');
  });

  // =========================================================================
  // Phase 20 Plan 20-10 (gap-closure T9 underlying layer).
  //
  // copyToCode threads fenceKind: 'leetcode-solve' into forceInjectCodeSection
  // when the note already contains a v1.3 fence. The leetcode-solve opener
  // is preserved byte-for-byte (no sibling ```python fence grafted —
  // closes the T9 underlying layer at the retrieve+copy site).
  // =========================================================================
  it('T9 underlying: preserves leetcode-solve fence opener verbatim across copyToCode', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Problem\nfoo\n\n## Code\n```leetcode-solve\nOLD\n```\n\n## Notes\nbar\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    // Seed the frontmatter so the same-slug short-circuit can be exercised.
    m.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });

    await copyToCode(m.app as never, file as never, 'class S: pass', 'python3');

    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    // Opener preserved verbatim — no langSlug graft.
    expect(body).toMatch(/^```leetcode-solve$/m);
    expect(body).not.toMatch(/^```python\d?$/m);
    // Body replaced.
    expect(body).toContain('class S: pass');
    expect(body).not.toContain('OLD');
    // Sibling regions preserved.
    expect(body).toContain('## Problem');
    expect(body).toContain('## Notes');
    // Same-slug short-circuit: lc-language already === python3 → no
    // processFrontMatter call needed.
    expect(m.spies.processFrontMatter).not.toHaveBeenCalled();
  });

  it('T9 underlying: language-switch via copyToCode on a leetcode-solve fence — opener stays, lc-language frontmatter updates', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Problem\nfoo\n\n## Code\n```leetcode-solve\nOLD\n```\n\n## Notes\nbar\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    m.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-language': 'python3',
    });

    // User retrieved a Java submission — slug differs from current lc-language.
    await copyToCode(m.app as never, file as never, 'class Solution {}', 'java');

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    // Opener still leetcode-solve (NOT swapped to ```java).
    expect(body).toMatch(/^```leetcode-solve$/m);
    expect(body).not.toMatch(/^```java$/m);
    expect(body).toContain('class Solution {}');
    // G-COPY-TO-CODE-LANG-DRIFT: lc-language updated to java.
    expect(m.spies.processFrontMatter).toHaveBeenCalledTimes(1);
    expect(m.getFrontmatter('LeetCode/1-two-sum.md')?.['lc-language']).toBe('java');
  });
});
