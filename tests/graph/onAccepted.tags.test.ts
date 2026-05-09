// tests/graph/onAccepted.tags.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-03 (topic-tag frontmatter union)
// + Phase 2 D-05 carry (topic tags on first AC).
// Target: src/graph/KnowledgeGraphWriter.ts (Wave 1).

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

describe('KnowledgeGraphWriter.onAccepted — tags (GRAPH-03, Phase 2 D-05 carry)', () => {
  it('topic tags union-merge', async () => {
    // D-11 + Phase 2 D-10: existing user tags (e.g. #revisit) + difficulty tag
    // must survive when plugin adds lc/{topic-slug}. No user-owned content lost.
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\ntags: [revisit, lc/easy]\n---\n' },
      problemDetails: {
        'two-sum': {
          fetchedAt: Date.now(),
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '',
          topicSlugs: ['hash-table', 'array'],
          topicTags: [
            { name: 'Hash Table', slug: 'hash-table' },
            { name: 'Array', slug: 'array' },
          ],
          exampleTestcases: '',
          codeSnippets: [],
        },
      },
    });
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      tags: ['revisit', 'lc/easy'],
    });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
    expect(tags).toEqual(expect.arrayContaining(['revisit', 'lc/easy', 'lc/hash-table', 'lc/array']));
  });

  it('writes topic tags on first AC', async () => {
    // Phase 2 D-05 deferred work lands HERE: first-Accepted write adds the
    // lc/{topic-slug} tags to the frontmatter. Starting from a note that has
    // no topic tags yet.
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\ntags: [lc/easy]\n---\n' },
      problemDetails: {
        'two-sum': {
          fetchedAt: Date.now(),
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '',
          topicSlugs: ['two-pointers'],
          topicTags: [{ name: 'Two Pointers', slug: 'two-pointers' }],
          exampleTestcases: '',
          codeSnippets: [],
        },
      },
    });
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      tags: ['lc/easy'],
    });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
    expect(tags).toContain('lc/two-pointers');
    // Pre-existing difficulty tag untouched.
    expect(tags).toContain('lc/easy');
  });
});
