// tests/graph/clusterHubWriter.test.ts
//
// Phase 11 Plan 02 Task 1 — TDD tests for ClusterHubWriter + mergeTechniquesSectionAI.
// Target: src/graph/ClusterHubWriter.ts, src/graph/mergeTechniquesSection.ts

import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { mergeTechniquesSectionAI } from '../../src/graph/mergeTechniquesSection';
import { ClusterHubWriter, sanitizeHubFilename } from '../../src/graph/ClusterHubWriter';
import type { HubEntry } from '../../src/graph/ClusterHubWriter';
import { normalizePatternName } from '../../src/graph/patternTaxonomy';

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

  // ─── Quick-260622-gkp: sanitize-driven aliased wikilinks for slash patterns ──

  const slashBody = [
    '## Notes',
    'notes',
    '',
    '## Techniques',
    '',
    '- [[Hash Table]]',
    '',
  ].join('\n');

  it('renders a slash pattern as an aliased wikilink to the sanitized hub file', () => {
    const result = mergeTechniquesSectionAI(slashBody, 'Heap / Priority Queue');
    expect(result).toContain('- [[Heap Priority Queue|Heap / Priority Queue]]');
  });

  it('renders a non-slash pattern as a plain wikilink (no alias)', () => {
    const result = mergeTechniquesSectionAI(slashBody, 'Two Pointers');
    expect(result).toContain('- [[Two Pointers]]');
    expect(result).not.toContain('Two Pointers|');
  });

  it('is idempotent for a slash pattern (alias-pipe trap)', () => {
    const once = mergeTechniquesSectionAI(slashBody, 'Heap / Priority Queue');
    const twice = mergeTechniquesSectionAI(once, 'Heap / Priority Queue');
    expect(twice).toBe(once);
  });

  it('does not duplicate or corrupt an already-aliased link on re-merge', () => {
    const seeded = [
      '## Notes',
      'notes',
      '',
      '## Techniques',
      '',
      '- [[Heap Priority Queue|Heap / Priority Queue]]',
      '',
    ].join('\n');
    const result = mergeTechniquesSectionAI(seeded, 'Heap / Priority Queue');
    const matches = result.match(/- \[\[Heap Priority Queue\|Heap \/ Priority Queue\]\]/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('array form renders plain + aliased and is idempotent', () => {
    const once = mergeTechniquesSectionAI(slashBody, ['Trees', 'Heap / Priority Queue']);
    expect(once).toContain('- [[Trees]]');
    expect(once).toContain('- [[Heap Priority Queue|Heap / Priority Queue]]');
    const twice = mergeTechniquesSectionAI(once, ['Trees', 'Heap / Priority Queue']);
    expect(twice).toBe(once);
  });
});

// ─── ClusterHubWriter ─────────────────────────────────────────────────────────

describe('ClusterHubWriter', () => {
  const problemsFolder = 'LeetCode';

  it('ensureHub creates hub note at {problemsFolder}/Patterns/{pattern}.md', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', fileBasename: '1-two-sum', difficulty: 'Easy', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    expect(m.spies.create).toHaveBeenCalled();
    const createCall = m.spies.create.mock.calls[0]!;
    expect(createCall[0]).toBe('LeetCode/Patterns/Two Pointers.md');
    const body = createCall[1]! as string;
    expect(body).toContain('lc-pattern-hub: true');
    expect(body).toContain('pattern: "Two Pointers"');
    expect(body).toContain('### Easy');
    expect(body).toContain('### Medium');
    expect(body).toContain('### Hard');
    expect(body).toContain('[[1-two-sum|Two Sum]]');
  });

  it('ensureHub no-ops when hub file already exists', async () => {
    const m = makeMockVaultApp({
      'LeetCode/Patterns/Two Pointers.md': '---\nlc-pattern-hub: true\n---\n# Two Pointers\n',
    });
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', fileBasename: '1-two-sum', difficulty: 'Easy', solvedDate: '2026-05-18' };
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
      '- [[1-two-sum|Two Sum]]',
      '',
      '### Medium',
      '',
      '',
      '### Hard',
      '',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/Patterns/Two Pointers.md': hubBody });
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: '3Sum', fileBasename: '15-3sum', difficulty: 'Medium', solvedDate: '2026-05-18' };
    await writer.appendEntry('Two Pointers', entry);
    expect(m.spies.process).toHaveBeenCalled();
    const content = m.getContent('LeetCode/Patterns/Two Pointers.md')!;
    // The bullet should appear in the Medium section
    expect(content).toContain('- [[15-3sum|3Sum]]');
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
      '- [[1-two-sum|Two Sum]]',
      '',
      '### Medium',
      '',
      '',
      '### Hard',
      '',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/Patterns/Two Pointers.md': hubBody });
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', fileBasename: '1-two-sum', difficulty: 'Easy', solvedDate: '2026-05-01' };
    await writer.appendEntry('Two Pointers', entry);
    const content = m.getContent('LeetCode/Patterns/Two Pointers.md')!;
    // Should still have exactly 1 occurrence of [[1-two-sum|Two Sum]]
    const matches = content.match(/\[\[1-two-sum\|Two Sum\]\]/g) ?? [];
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
      'lc-title': 'Two Sum',
    });
    m.seedFrontmatter('LeetCode/3sum.md', {
      'lc-pattern': 'Two Pointers',
      'lc-difficulty': 'Medium',
      'lc-solved-date': '2026-05-10',
      'lc-title': '3Sum',
    });
    m.seedFrontmatter('LeetCode/valid-anagram.md', {
      'lc-pattern': 'Arrays & Hashing',
      'lc-difficulty': 'Easy',
      'lc-solved-date': '2026-05-15',
      'lc-title': 'Valid Anagram',
    });

    // Mock getMarkdownFiles to return all files in the vault
    const mockFiles = [
      { path: 'LeetCode/two-sum.md', basename: '1-two-sum', name: 'two-sum.md', extension: 'md', stat: { ctime: 0 } },
      { path: 'LeetCode/3sum.md', basename: '15-3sum', name: '3sum.md', extension: 'md', stat: { ctime: 0 } },
      { path: 'LeetCode/valid-anagram.md', basename: '242-valid-anagram', name: 'valid-anagram.md', extension: 'md', stat: { ctime: 0 } },
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
    expect(tpBody).toContain('[[1-two-sum|Two Sum]]');
    expect(tpBody).toContain('[[15-3sum|3Sum]]');
  });

  it('ensureHub creates the Patterns folder if missing', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Two Sum', fileBasename: '1-two-sum', difficulty: 'Easy', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    // Should attempt to create the Patterns folder
    expect(m.spies.createFolder).toHaveBeenCalledWith('LeetCode/Patterns');
  });

  // ─── Quick-260621-154 FIX 2: slash/reserved-char filename sanitization ──────

  it('sanitizeHubFilename strips path separators / reserved / control chars', () => {
    expect(sanitizeHubFilename('Heap / Priority Queue')).toBe('Heap Priority Queue');
    expect(sanitizeHubFilename('A:B*C')).toBe('A B C');
    expect(sanitizeHubFilename('a\\b?c"d<e>f|g')).toBe('a b c d e f g');
    expect(sanitizeHubFilename('tab\there')).toBe('tab here');
    // Idempotent
    expect(sanitizeHubFilename(sanitizeHubFilename('Heap / Priority Queue'))).toBe('Heap Priority Queue');
  });

  it('ensureHub writes a slash-bearing pattern to a path with no "/" in the segment, content keeps display name', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Kth Largest', fileBasename: '215-kth-largest', difficulty: 'Medium', solvedDate: '2026-06-21' };
    await writer.ensureHub('Heap / Priority Queue', entry);
    expect(m.spies.create).toHaveBeenCalled();
    const createCall = m.spies.create.mock.calls[0]!;
    // Filename segment is sanitized — no "/" splitting the pattern into a subfolder.
    expect(createCall[0]).toBe('LeetCode/Patterns/Heap Priority Queue.md');
    const body = createCall[1]! as string;
    // Content keeps the unsanitized display name.
    expect(body).toContain('# Heap / Priority Queue');
    expect(body).toContain('pattern: "Heap / Priority Queue"');
  });

  it('ensureHub + appendEntry + reconcile resolve the SAME sanitized hub path (no orphan)', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const sanitizedPath = 'LeetCode/Patterns/Heap Priority Queue.md';

    const first: HubEntry = { title: 'Kth Largest', fileBasename: '215-kth-largest', difficulty: 'Medium', solvedDate: '2026-06-21' };
    await writer.ensureHub('Heap / Priority Queue', first);
    expect(m.spies.create.mock.calls[0]![0]).toBe(sanitizedPath);

    // appendEntry must find the file ensureHub created and process it (not create a second one).
    const second: HubEntry = { title: 'Last Stone Weight', fileBasename: '1046-last-stone-weight', difficulty: 'Easy', solvedDate: '2026-06-21' };
    await writer.appendEntry('Heap / Priority Queue', second);
    expect(m.spies.process).toHaveBeenCalled();
    expect(m.spies.process.mock.calls[0]![0].path).toBe(sanitizedPath);

    // Still exactly one hub file for this pattern.
    const content = m.getContent(sanitizedPath)!;
    expect(content).toContain('[[215-kth-largest|Kth Largest]]');
    expect(content).toContain('[[1046-last-stone-weight|Last Stone Weight]]');
  });

  it('reconcile derives the sanitized hub path for a slash pattern (no orphan)', async () => {
    const m = makeMockVaultApp({
      'LeetCode/kth-largest.md': '# Kth Largest\n',
    });
    m.seedFrontmatter('LeetCode/kth-largest.md', {
      'lc-pattern': 'Heap / Priority Queue',
      'lc-difficulty': 'Medium',
      'lc-solved-date': '2026-06-21',
      'lc-title': 'Kth Largest',
    });
    const mockFiles = [
      { path: 'LeetCode/kth-largest.md', basename: '215-kth-largest', name: 'kth-largest.md', extension: 'md', stat: { ctime: 0 } },
    ];
    (m.app.vault as unknown as Record<string, unknown>).getMarkdownFiles = vi.fn(() => mockFiles);

    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    await writer.reconcile();

    expect(m.spies.create).toHaveBeenCalledTimes(1);
    const createCall = m.spies.create.mock.calls[0]!;
    expect(createCall[0]).toBe('LeetCode/Patterns/Heap Priority Queue.md');
    const body = createCall[1]! as string;
    expect(body).toContain('# Heap / Priority Queue');
    expect(body).toContain('pattern: "Heap / Priority Queue"');
  });

  it('read/write transform-agreement lock: sanitizeHubFilename(normalizePatternName(...)) matches writer segment', () => {
    // The read path (main.ts getPatternHubPath) and all three writer sites must
    // produce the identical filename segment for a slash seed.
    expect(sanitizeHubFilename(normalizePatternName('Heap / Priority Queue'))).toBe('Heap Priority Queue');
    // Case variant from the AI canonicalizes then sanitizes to the same segment.
    expect(sanitizeHubFilename(normalizePatternName('  heap / priority queue  '))).toBe('Heap Priority Queue');
  });

  it('buildHubNoteBody renders correct structure with frontmatter and difficulty tables', async () => {
    const m = makeMockVaultApp({});
    const writer = new ClusterHubWriter({ app: m.app as never, problemsFolder });
    const entry: HubEntry = { title: 'Container With Most Water', fileBasename: '11-container-with-most-water', difficulty: 'Medium', solvedDate: '2026-05-18' };
    await writer.ensureHub('Two Pointers', entry);
    const body = m.spies.create.mock.calls[0]![1]! as string;
    // Check frontmatter
    expect(body).toMatch(/^---\n/);
    expect(body).toContain('lc-pattern-hub: true');
    expect(body).toContain('pattern: "Two Pointers"');
    // Check heading
    expect(body).toContain('# Two Pointers');
    // Check difficulty sections with bullet lists
    expect(body).toContain('### Easy');
    expect(body).toContain('### Medium');
    expect(body).toContain('### Hard');
    // The entry should be in the Medium section
    expect(body).toContain('- [[11-container-with-most-water|Container With Most Water]]');
  });
});
