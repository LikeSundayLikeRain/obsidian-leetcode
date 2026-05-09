// tests/graph/onAccepted.missingTopicTags.test.ts
//
// Phase 4 Wave 0 — TDD red stub for Pitfall 10 (missing topicTags cache)
// + D-19 (stub failure does not block body write).
// Target: src/graph/KnowledgeGraphWriter.ts (Wave 1).
//
// Pre-Phase-4 cache entries have `topicSlugs: string[]` but NO `topicTags`.
// The writer must skip the ## Techniques body write + stub creation when
// detail.topicTags is undefined/empty, without crashing; frontmatter still
// writes. Next AC (after Phase 2 D-11 background-refresh populates topicTags)
// fires the full pipeline.

import { describe, it, expect } from 'vitest';
import { makeFakeKnowledgeGraphDeps } from './mocks/fakeKnowledgeGraphDeps';
// Target — does not exist until Wave 1 ships it.
import { KnowledgeGraphWriter } from '../../src/graph/KnowledgeGraphWriter';

const acceptedTerminal = {
  state: 'SUCCESS' as const,
  status_code: 10,
  status_msg: 'Accepted',
  status_runtime: '12 ms',
  status_memory: '14.2 MB',
  lang: 'python3',
  submission_id: 987654,
};

describe('KnowledgeGraphWriter.onAccepted — missing topicTags cache (Pitfall 10)', () => {
  it('stub failure does not block section write', async () => {
    // D-19: if a stub create throws mid-loop, the ## Techniques body write
    // still completes (body write happens BEFORE the stub loop). Even if the
    // downstream stub write rejects, frontmatter + body are durable.
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Notes\n\n' },
      problemDetails: {
        'two-sum': {
          fetchedAt: Date.now(),
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '',
          topicSlugs: ['hash-table'],
          topicTags: [{ name: 'Hash Table', slug: 'hash-table' }],
          exampleTestcases: '',
          codeSnippets: [],
        },
      },
    });
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-id': 1, 'lc-slug': 'two-sum' });

    // Force the stub-create spy to reject — simulate disk-full / sync race.
    deps.vault.spies.create.mockImplementationOnce(async () => {
      throw new Error('ENOSPC stub create failed');
    });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    // Frontmatter wrote.
    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm['lc-status']).toBe('accepted');

    // Body wrote — ## Techniques present despite downstream stub failure.
    const body = deps.vault.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('## Techniques');
    expect(body).toContain('[[Hash Table]]');
  });

  it('skips ## Techniques write when detail.topicTags is undefined', async () => {
    // Pre-Phase-4 cache entry — topicSlugs present, topicTags missing.
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Notes\n\n' },
      problemDetails: {
        'two-sum': {
          fetchedAt: Date.now(),
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '',
          topicSlugs: ['hash-table'],
          // topicTags omitted on purpose (optional field on DetailCacheEntry).
          exampleTestcases: '',
          codeSnippets: [],
        },
      },
    });
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-id': 1, 'lc-slug': 'two-sum' });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };
    // Must NOT throw despite missing topicTags.
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    // Frontmatter still wrote.
    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm['lc-status']).toBe('accepted');

    // No ## Techniques body added.
    const body = deps.vault.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).not.toContain('## Techniques');
    expect(deps.vault.spies.create).not.toHaveBeenCalled();
  });
});
