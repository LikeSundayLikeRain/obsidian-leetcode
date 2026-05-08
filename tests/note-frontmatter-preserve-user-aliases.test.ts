import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { applyFrontmatter } from '../src/notes/NoteTemplate';

describe('applyFrontmatter alias union (D-10, D-06)', () => {
  it('union-merges plugin aliases with user-added aliases', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '' });
    m.seedFrontmatter('LeetCode/1-two-sum.md', {
      aliases: ['Two Sum', '1', 'My Favorite Problem'],
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm.aliases).toEqual(expect.arrayContaining(['Two Sum', '1', 'My Favorite Problem']));
  });

  it('writes lc-id as a number BUT aliases entry as string "1" (D-06 + Pitfall 9)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm['lc-id']).toBe(1);
    expect(fm.aliases).toContain('1');  // string, not number
    expect(fm.aliases).not.toContain(1);
  });
});
