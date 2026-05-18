// tests/graph/clusterHubWriter.test.ts
//
// Phase 11 Plan 02 Task 1 — TDD tests for ClusterHubWriter + mergeTechniquesSectionAI.
// Target: src/graph/ClusterHubWriter.ts, src/graph/mergeTechniquesSection.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { mergeTechniquesSectionAI } from '../../src/graph/mergeTechniquesSection';
import { ClusterHubWriter } from '../../src/graph/ClusterHubWriter';
import type { HubEntry } from '../../src/graph/ClusterHubWriter';

// ─── mergeTechniquesSectionAI ─────────────────────────────────────────────────

describe('mergeTechniquesSectionAI (D-09 full replacement)', () => {
  it('replaces all link items with single AI cluster wikilink', () => {
    const body = [
      '## Notes',
      'my notes',
      '',
      '## Techniques',
      '',
      '- [[Hash Table]]',
      '- [[Array]]',
      '- [[Two Pointers]]',
      '',
    ].join('\n');
    const result = mergeTechniquesSectionAI(body, 'Sliding Window');
    expect(result).toContain('- [[Sliding Window]]');
    expect(result).not.toContain('[[Hash Table]]');
    expect(result).not.toContain('[[Array]]');
    expect(result).not.toContain('[[Two Pointers]]');
  });

  it('preserves free items (user-added lines)', () => {
    const body = [
      '## Notes',
      'notes',
      '',
      '## Techniques',
      '',
      '- [[Hash Table]]',
      '- [[Array]]',
      'My custom observation about this problem',
      '- [[Stack]]',
      '',
    ].join('\n');
    const result = mergeTechniquesSectionAI(body, 'Two Pointers');
    expect(result).toContain('- [[Two Pointers]]');
    expect(result).toContain('My custom observation about this problem');
    expect(result).not.toContain('[[Hash Table]]');
    expect(result).not.toContain('[[Array]]');
    expect(result).not.toContain('[[Stack]]');
  });

  it('inserts new Techniques section when absent', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const result = mergeTechniquesSectionAI(body, 'Binary Search');
    expect(result).toContain('## Techniques');
    expect(result).toContain('- [[Binary Search]]');
  });

  it('is idempotent', () => {
    const body = [
      '## Notes',
      'notes',
      '',
      '## Techniques',
      '',
      '- [[Sliding Window]]',
      '',
    ].join('\n');
    const once = mergeTechniquesSectionAI(body, 'Sliding Window');
    const twice = mergeTechniquesSectionAI(once, 'Sliding Window');
    expect(twice).toBe(once);
  });

  it('handles mixed bullet styles (* and +) as link items to remove', () => {
    const body = [
      '## Notes',
      'x',
      '',
      '## Techniques',
      '',
      '* [[Hash Table]]',
      '+ [[Array]]',
      '- [[Stack]]',
      '',
    ].join('\n');
    const result = mergeTechniquesSectionAI(body, 'Greedy');
    expect(result).toContain('- [[Greedy]]');
    expect(result).not.toContain('[[Hash Table]]');
    expect(result).not.toContain('[[Array]]');
    expect(result).not.toContain('[[Stack]]');
  });
});

// ─── ClusterHubWriter ─────────────────────────────────────────────────────────

describe('ClusterHubWriter', () => {
  const problemsFolder = 'LeetCode';

  it('ensureHub creates hub note at {problemsFolder}/Patterns/{pattern}.md', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', difficulty: 'Easy', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    expect(m.spies.create).toHaveBeenCalled();
    const createCall = m.spies.create.mock.calls[0];
    expect(createCall[0]).toBe('LeetCode/Patterns/Two Pointers.md');
    const body = createCall[1] as string;
    expect(body).toContain('lc-pattern-hub: true');
    expect(body).toContain('pattern: "Two Pointers"');
    expect(body).toContain('### Easy');
    expect(body).toContain('### Medium');
    expect(body).toContain('### Hard');
    expect(body).toContain('[[Two Sum]]');
  });

  it('ensureHub no-ops when hub file already exists', async () => {
    const m = makeMockVaultApp({
      'LeetCode/Patterns/Two Pointers.md': '---\nlc-pattern-hub: true\n---\n# Two Pointers\n',
    });
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', difficulty: 'Easy', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    expect(m.spies.create).not.toHaveBeenCalled();
  });

  it('appendEntry adds table row to correct difficulty section', async () => {
    const hubBody = [
      '---',
      'lc-pattern-hub: true',
      'pattern: "Two Pointers"',
      '---',
      '',
      '# Two Pointers',
      '',
      '### Easy',
      '',
      '| Problem | Date Solved |',
      '| ------- | ----------- |',
      '| [[Two Sum]] | 2026-05-01 |',
      '',
      '### Medium',
      '',
      '| Problem | Date Solved |',
      '| ------- | ----------- |',
      '',
      '### Hard',
      '',
      '| Problem | Date Solved |',
      '| ------- | ----------- |',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/Patterns/Two Pointers.md': hubBody });
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: '3Sum', difficulty: 'Medium', solvedDate: '2026-05-18' };
    await writer.appendEntry('Two Pointers', entry);
    expect(m.spies.process).toHaveBeenCalled();
    const content = m.getContent('LeetCode/Patterns/Two Pointers.md')!;
    // The row should appear in the Medium section
    expect(content).toContain('[[3Sum]]');
    expect(content).toContain('2026-05-18');
  });

  it('appendEntry is idempotent (skips duplicate)', async () => {
    const hubBody = [
      '---',
      'lc-pattern-hub: true',
      'pattern: "Two Pointers"',
      '---',
      '',
      '# Two Pointers',
      '',
      '### Easy',
      '',
      '| Problem | Date Solved |',
      '| ------- | ----------- |',
      '| [[Two Sum]] | 2026-05-01 |',
      '',
      '### Medium',
      '',
      '| Problem | Date Solved |',
      '| ------- | ----------- |',
      '',
      '### Hard',
      '',
      '| Problem | Date Solved |',
      '| ------- | ----------- |',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/Patterns/Two Pointers.md': hubBody });
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', difficulty: 'Easy', solvedDate: '2026-05-01' };
    await writer.appendEntry('Two Pointers', entry);
    const content = m.getContent('LeetCode/Patterns/Two Pointers.md')!;
    // Should still have exactly 1 occurrence of [[Two Sum]]
    const matches = content.match(/\[\[Two Sum\]\]/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('reconcile rebuilds hubs from frontmatter scan', async () => {
    // Seed files with lc-pattern frontmatter
    const m = makeMockVaultApp({
      'LeetCode/two-sum.md': '# Two Sum\n',
      'LeetCode/3sum.md': '# 3Sum\n',
      'LeetCode/valid-anagram.md': '# Valid Anagram\n',
    });
    // Seed frontmatter so metadataCache returns it
    m.seedFrontmatter('LeetCode/two-sum.md', {
      'lc-pattern': 'Two Pointers',
      'lc-difficulty': 'Easy',
      'lc-solved-date': '2026-05-01',
    });
    m.seedFrontmatter('LeetCode/3sum.md', {
      'lc-pattern': 'Two Pointers',
      'lc-difficulty': 'Medium',
      'lc-solved-date': '2026-05-10',
    });
    m.seedFrontmatter('LeetCode/valid-anagram.md', {
      'lc-pattern': 'Arrays & Hashing',
      'lc-difficulty': 'Easy',
      'lc-solved-date': '2026-05-15',
    });

    // Mock getMarkdownFiles to return all files in the vault
    const mockFiles = [
      { path: 'LeetCode/two-sum.md', basename: 'Two Sum', name: 'two-sum.md', extension: 'md', stat: { ctime: 0 } },
      { path: 'LeetCode/3sum.md', basename: '3Sum', name: '3sum.md', extension: 'md', stat: { ctime: 0 } },
      { path: 'LeetCode/valid-anagram.md', basename: 'Valid Anagram', name: 'valid-anagram.md', extension: 'md', stat: { ctime: 0 } },
    ];
    (m.app.vault as unknown as Record<string, unknown>).getMarkdownFiles = vi.fn(() => mockFiles);

    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    await writer.reconcile();

    // Should have created 2 hub notes (Two Pointers + Arrays & Hashing)
    expect(m.spies.create).toHaveBeenCalledTimes(2);
    const createPaths = m.spies.create.mock.calls.map((c: unknown[]) => c[0]);
    expect(createPaths).toContain('LeetCode/Patterns/Two Pointers.md');
    expect(createPaths).toContain('LeetCode/Patterns/Arrays & Hashing.md');

    // Two Pointers hub should have entries from both files
    const tpBody = m.getContent('LeetCode/Patterns/Two Pointers.md')!;
    expect(tpBody).toContain('[[Two Sum]]');
    expect(tpBody).toContain('[[3Sum]]');
  });

  it('ensureHub creates the Patterns folder if missing', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', difficulty: 'Easy', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    // Should attempt to create the Patterns folder
    expect(m.spies.createFolder).toHaveBeenCalledWith('LeetCode/Patterns');
  });

  it('buildHubNoteBody renders correct structure with frontmatter and difficulty tables', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Container With Most Water', difficulty: 'Medium', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    const body = m.spies.create.mock.calls[0][1] as string;
    // Check frontmatter
    expect(body).toMatch(/^---\n/);
    expect(body).toContain('lc-pattern-hub: true');
    expect(body).toContain('pattern: "Two Pointers"');
    // Check heading
    expect(body).toContain('# Two Pointers');
    // Check difficulty sections with tables
    expect(body).toContain('### Easy');
    expect(body).toContain('### Medium');
    expect(body).toContain('### Hard');
    // The entry should be in the Medium section
    expect(body).toContain('| [[Container With Most Water]] | 2026-05-18 |');
  });
});
