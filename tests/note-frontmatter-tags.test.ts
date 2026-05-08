import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { applyFrontmatter, buildFrontmatterInput } from '../src/notes/NoteTemplate';

describe('Phase 2 tag policy (NOTE-04, D-05 difficulty-only)', () => {
  it('writes exactly [lc/{difficulty}] for Easy problems, no topic tags', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/', language: 'python3',
      pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm!.tags).toEqual(['lc/easy']);
  });

  it('writes lc/medium for Medium, lc/hard for Hard', async () => {
    for (const [diff, expected] of [['Medium', 'lc/medium'], ['Hard', 'lc/hard']] as const) {
      const m = makeMockVaultApp({ 'LeetCode/x.md': '' });
      const file = m.app.vault.getAbstractFileByPath('LeetCode/x.md')!;
      await applyFrontmatter(m.app as never, file as never, {
        id: 1, slug: 'x', title: 'X', difficulty: diff,
        url: '', language: 'python3', pluginTags: [expected],
      });
      const fm = m.getFrontmatter('LeetCode/x.md')!;
      expect(fm.tags).toContain(expected);
    }
  });

  it('buildFrontmatterInput derives pluginTags = [lc/{difficulty.toLowerCase()}] (D-05)', () => {
    const input = buildFrontmatterInput({
      fetchedAt: 0, id: 42, title: 'Trapping Rain Water', difficulty: 'Hard',
      url: 'https://leetcode.com/problems/trapping-rain-water/',
      contentHtml: '<p>...</p>', topicSlugs: ['array', 'two-pointers'],
    } as never, 'python3');
    expect(input.pluginTags).toEqual(['lc/hard']);
    // D-05: topic tags are Phase 4 work — must NOT appear in Phase 2 pluginTags.
    expect(input.pluginTags).not.toContain('lc/array');
    expect(input.pluginTags).not.toContain('lc/two-pointers');
  });
});
