// tests/graph/copyToCode.langSync.test.ts
//
// Phase 5.3 Plan 06 — G-COPY-TO-CODE-LANG-DRIFT gap closure.
//
// Contract: copyToCode now also syncs the note's `lc-language` frontmatter
// to the submission's langSlug after the vault.process fence rewrite. The
// chevron's languageRefreshEffect listener (Plan 05) re-renders the label
// off the metadataCache 'changed' event the frontmatter write fires — no
// widget code change needed here.
//
// Five it-blocks per Plan 06 Task 1:
//   1. Different lang   → lc-language is rewritten + fence body matches.
//   2. Same lang        → vault.process still runs, processFrontMatter does NOT
//                         (same-slug short-circuit; avoid spurious vault write).
//   3. Unknown slug     → vault.process still runs, processFrontMatter does NOT
//                         (LC API dispatch contract — never write a non-canonical
//                         slug into lc-language).
//   4. Rejection        → processFrontMatter rejection propagates; the fence
//                         body has already landed (accepted divergence — same
//                         shape as switchFenceLanguage Step C).
//   5. Ordering         → vault.process runs BEFORE processFrontMatter so the
//                         metadataCache 'changed' event rebuilds the chevron
//                         against the new fence body.

import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { copyToCode } from '../../src/graph/copyToCode';

describe('copyToCode lang-sync (G-COPY-TO-CODE-LANG-DRIFT)', () => {
  it('writes lc-language frontmatter when submission language differs from note current language', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```python\nclass Solution:\n    pass\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    // Seed metadataCache + frontmatter store so the same-slug read path can
    // see the current 'lc-language' value the same way switchFenceLanguage does.
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-language': 'python3' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    await copyToCode(m.app as never, file as never, 'class Solution {}', 'java');

    expect(m.spies.process).toHaveBeenCalledTimes(1);
    expect(m.spies.processFrontMatter).toHaveBeenCalledTimes(1);

    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm?.['lc-language']).toBe('java');

    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('```java');
    expect(body).toContain('class Solution {}');
    expect(body).not.toContain('```python\nclass Solution:');
  });

  it('no-ops lc-language when submission slug matches current (same-slug short-circuit)', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```python\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-language': 'python3' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    await copyToCode(m.app as never, file as never, 'class Solution:\n    return 0', 'python3');

    // Body still rewrites (existing copyToCode contract preserved).
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('return 0');
    expect(body).not.toContain('OLD');

    // But the frontmatter write is skipped — no spurious vault touch.
    expect(m.spies.processFrontMatter).not.toHaveBeenCalled();
  });

  it('skips frontmatter write for unknown slug (defensive — LC API dispatch contract)', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```python\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-language': 'python3' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    await copyToCode(m.app as never, file as never, 'IDENTIFICATION DIVISION.', 'cobol');

    // Body still rewrites (existing copyToCode contract preserved per
    // forceInjectCodeSection — fence tag is `cobol` verbatim because
    // lcSlugToFenceTag falls through to the input for unknown slugs).
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('IDENTIFICATION DIVISION.');

    // lc-language stays at the prior canonical slug — never write 'cobol'.
    expect(m.spies.processFrontMatter).not.toHaveBeenCalled();
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm?.['lc-language']).toBe('python3');
  });

  it('propagates processFrontMatter rejection (fence body still committed first)', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```python\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-language': 'python3' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    vi.spyOn(m.app.fileManager, 'processFrontMatter').mockRejectedValueOnce(
      new Error('vault locked'),
    );

    await expect(
      copyToCode(m.app as never, file as never, 'class Solution {}', 'java'),
    ).rejects.toThrow('vault locked');

    // vault.process landed BEFORE the rejection — the fence body is committed.
    // Same accepted divergence as switchFenceLanguage Step C.
    expect(m.spies.process).toHaveBeenCalledTimes(1);
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('class Solution {}');
  });

  it('vault.process runs before processFrontMatter (ordering contract)', async () => {
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\nlc-language: python3\n---\n\n## Code\n```python\nOLD\n```\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': initial });
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-language': 'python3' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;

    const callOrder: string[] = [];
    m.spies.process.mockImplementationOnce(async (f: unknown, fn: unknown) => {
      callOrder.push('process');
      const target = f as { path: string };
      const transform = fn as (s: string) => string;
      const current = m.getContent(target.path) ?? '';
      const next = transform(current);
      m.state.contents.set(target.path, next);
      return next;
    });
    vi.spyOn(m.app.fileManager, 'processFrontMatter').mockImplementationOnce(
      async (f: unknown, fn: unknown) => {
        callOrder.push('pfm');
        const target = f as { path: string };
        const writer = fn as (fm: Record<string, unknown>) => void;
        const fm = { ...(m.getFrontmatter(target.path) ?? {}) };
        writer(fm);
        m.state.frontmatter.set(target.path, fm);
      },
    );

    await copyToCode(m.app as never, file as never, 'class Solution {}', 'java');

    expect(callOrder).toEqual(['process', 'pfm']);
  });
});
