// tests/graph/onAccepted.optOut.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-05 (opt-out skips ## Techniques + stubs).
// Target: src/graph/KnowledgeGraphWriter.ts (Wave 1).
//
// D-20 + D-21: autoBacklinksEnabled=false gates the body write (step 2) and
// stub creation (step 3), but NEVER gates the frontmatter write (step 1).
// `lc/{topic-slug}` tags still fire because they are lightweight graph fuel.

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

describe('KnowledgeGraphWriter.onAccepted — opt-out (GRAPH-05)', () => {
  it('opt-out skips ## Techniques and stubs', async () => {
    const deps = makeFakeKnowledgeGraphDeps({
      autoBacklinksEnabled: false,
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Notes\n\n' },
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
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-id': 1, 'lc-slug': 'two-sum' });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    // Frontmatter writes still fire — lc-* keys AND lc/{topic-slug} tags.
    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm['lc-status']).toBe('accepted');
    const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
    expect(tags).toEqual(expect.arrayContaining(['lc/hash-table', 'lc/array']));

    // ## Techniques body write SKIPPED — no call to vault.process for the body
    // change (processFrontMatter is allowed; that's the frontmatter path).
    expect(deps.vault.spies.process).not.toHaveBeenCalled();
    const body = deps.vault.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).not.toContain('## Techniques');

    // Stub creation SKIPPED — no vault.create calls for technique stubs.
    expect(deps.vault.spies.create).not.toHaveBeenCalled();
  });
});
