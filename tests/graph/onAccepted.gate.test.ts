// tests/graph/onAccepted.gate.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-23 (unknown/non-AC guard).
// Target: src/graph/KnowledgeGraphWriter.ts (Wave 1).
//
// The writer's onAccepted() method MUST short-circuit when the terminal
// status_code is anything other than 10 (Accepted). No frontmatter writes,
// no body writes, no stub creation.

import { describe, it, expect } from 'vitest';
import { makeFakeKnowledgeGraphDeps } from './mocks/fakeKnowledgeGraphDeps';
// Target — does not exist until Wave 1 ships it.
import { KnowledgeGraphWriter } from '../../src/graph/KnowledgeGraphWriter';

describe('KnowledgeGraphWriter.onAccepted — gate (D-23)', () => {
  it('unknown verdict skips pipeline', async () => {
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\nlc-status: attempted\n---\n' },
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
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-status': 'attempted',
    });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };

    // Unknown status_code (-1 isn't in statusMap).
    await writer.onAccepted(
      ctx as never,
      {
        state: 'SUCCESS',
        status_code: -1,
        status_msg: 'Unknown',
        lang: 'python3',
      } as never,
    );

    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm['lc-status']).toBe('attempted'); // unchanged
    expect(fm['lc-solved-date']).toBeUndefined();
    expect(deps.vault.spies.processFrontMatter).not.toHaveBeenCalled();
    expect(deps.vault.spies.process).not.toHaveBeenCalled();
    expect(deps.vault.spies.create).not.toHaveBeenCalled();
  });

  it('non-AC verdict skips pipeline', async () => {
    // status_code 11 is Wrong Answer. Writer must not fire.
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\nlc-status: attempted\n---\n' },
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
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-status': 'attempted',
    });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };

    await writer.onAccepted(
      ctx as never,
      {
        state: 'SUCCESS',
        status_code: 11, // Wrong Answer
        status_msg: 'Wrong Answer',
        lang: 'python3',
      } as never,
    );

    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm['lc-status']).toBe('attempted');
    expect(deps.vault.spies.processFrontMatter).not.toHaveBeenCalled();
    expect(deps.vault.spies.process).not.toHaveBeenCalled();
    expect(deps.vault.spies.create).not.toHaveBeenCalled();
  });
});
