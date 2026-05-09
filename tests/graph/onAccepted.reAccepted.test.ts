// tests/graph/onAccepted.reAccepted.test.ts
//
// Phase 4 Wave 0 — TDD red stub for D-24 (re-AC reflects latest, not best).
// Target: src/graph/KnowledgeGraphWriter.ts (Wave 1).
//
// On the second AC of the same problem the pipeline re-fires all five writes.
// lc-runtime-ms and lc-memory-mb OVERWRITE with the new submission's values
// even when they're worse. The picker is where best-ever lives.

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
    // Seed with prior best-ever: 8 ms, 13.1 MB — already "accepted" note state.
    deps.vault.seedFrontmatter('LeetCode/1-two-sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-status': 'accepted',
      'lc-runtime-ms': 8,
      'lc-memory-mb': 13.1,
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
    // D-24: overwrite with latest, even though it's worse.
    expect(fm['lc-runtime-ms']).toBe(24);
    expect(fm['lc-memory-mb']).toBe(15.8);
    expect(fm['lc-language']).toBe('java');
    expect(fm['lc-status']).toBe('accepted');
    expect(fm['lc-solved-date']).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });
});
