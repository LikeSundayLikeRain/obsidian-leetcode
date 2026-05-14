// tests/graph/onAccepted.frontmatter.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-02 (frontmatter writes) + GRAPH-01
// (no ## Code mutation) + Pitfall 1 (non-downgrade survives).
// Target: src/graph/KnowledgeGraphWriter.ts (created in Wave 1).
//
// Mirrors the DI + makeMockVaultApp pattern from
// tests/note-frontmatter-write.test.ts (Phase 2 analog).

import { describe, it, expect } from 'vitest';
import { makeFakeKnowledgeGraphDeps } from './mocks/fakeKnowledgeGraphDeps';
// Target — does not exist until Wave 1 ships it.
import { KnowledgeGraphWriter } from '../../src/graph/KnowledgeGraphWriter';

// Minimal shape of the terminal SUBMIT check payload the AC branch receives.
// Mirrors SubmitCheckResponse in src/solve/types.ts.
const acceptedTerminal = {
  state: 'SUCCESS' as const,
  status_code: 10,
  status_msg: 'Accepted',
  status_runtime: '12 ms',
  status_memory: '14.2 MB',
  runtime_percentile: 85.4,
  memory_percentile: 78.1,
  total_correct: 58,
  total_testcases: 58,
  lang: 'python3',
  submission_id: 987654,
};

describe('KnowledgeGraphWriter.onAccepted — frontmatter (GRAPH-02)', () => {
  it('on AC writes frontmatter fields', async () => {
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\nlc-status: attempted\n---\n\n## Code\n```python3\n```\n' },
      problemDetails: {
        'two-sum': {
          fetchedAt: Date.now(),
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          url: 'https://leetcode.com/problems/two-sum/',
          contentHtml: '<p>x</p>',
          topicSlugs: ['hash-table'],
          topicTags: [{ name: 'Hash Table', slug: 'hash-table' }],
          exampleTestcases: '[1,2]\n3',
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
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm).toBeDefined();
    expect(fm!['lc-status']).toBe('accepted');
    // Phase 5.3 D-01/D-02: solve-time runtime/memory frontmatter writes removed.
    // UAT 2026-05-13: lc-solved-date write removed alongside runtime/memory —
    // no production reader; staleness risk. Past Submissions modal renders
    // submittedAt fresh from LC GraphQL.
    expect(fm!['lc-solved-date']).toBeUndefined();
    expect(fm!['lc-language']).toBe('python3');
  });

  // Phase 5.3 D-01/D-02: previous "parses runtime/memory" test deleted —
  // those frontmatter writes are no longer emitted; display path uses fresh
  // GraphQL via SubmissionDetailModal.runtimeDisplay.

  it('on AC does not modify ## Code', async () => {
    // GRAPH-01 revised (D-01): the on-AC pipeline must never touch ## Code.
    const initial =
      '---\nlc-id: 1\nlc-slug: two-sum\n---\n\n## Code\n```python3\nmy untouched code\n```\n\n## Notes\nx\n';
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': initial },
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

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };
    await writer.onAccepted(ctx as never, acceptedTerminal as never);

    const body = deps.vault.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('my untouched code');
    expect(body).toContain('## Code');
    expect(body).not.toContain('## Solution'); // D-01: never created
  });
});
