// tests/graph/onAccepted.reAccepted.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-24 (re-AC reflects latest, not best).
// Target: src/graph/KnowledgeGraphWriter.ts (Wave 1).
//
// On the second AC of the same problem the pipeline re-fires the surviving
// solve-time writes (lc-status, lc-solved-date, lc-language) and union-merges
// tags. Phase 5.3 D-01/D-02 removed the legacy runtime/memory frontmatter
// writes — display reads those fresh from LC GraphQL.

import { describe, it, expect } from 'vitest';
import { makeFakeKnowledgeGraphDeps } from './mocks/fakeKnowledgeGraphDeps';
// Target — does not exist until Wave 1 ships it.
import { KnowledgeGraphWriter } from '../../src/graph/KnowledgeGraphWriter';

describe('KnowledgeGraphWriter.onAccepted — re-AC (D-24)', () => {
  it('re-AC reflects latest not best', async () => {
    const deps = makeFakeKnowledgeGraphDeps({
      files: { 'LeetCode/1-two-sum.md': '---\nlc-id: 1\nlc-slug: two-sum\n---\n' },
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
    // Seed with prior accepted state.
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-status': 'accepted',
      'lc-language': 'python3',
    });

    const writer = new KnowledgeGraphWriter({ app: deps.app as never, settings: deps.settings });
    const ctx = {
      file: deps.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!,
      slug: 'two-sum',
      title: 'Two Sum',
    };

    // Second AC — WORSE runtime (24 ms) and memory (15.8 MB), but switched to Java.
    await writer.onAccepted(
      ctx as never,
      {
        state: 'SUCCESS',
        status_code: 10,
        status_msg: 'Accepted',
        status_runtime: '24 ms',
        status_memory: '15.8 MB',
        lang: 'java',
        submission_id: 1234567,
      } as never,
    );

    const fm = deps.vault.getFrontmatter('LeetCode/1-two-sum.md')!;
    // D-24: overwrite the surviving fields with latest. Phase 5.3 D-01/D-02:
    // legacy runtime/memory frontmatter writes are no longer emitted.
    // UAT 2026-05-13: lc-solved-date write removed — no production reader.
    expect(fm['lc-language']).toBe('java');
    expect(fm['lc-status']).toBe('accepted');
    expect(fm['lc-solved-date']).toBeUndefined();
  });
});
