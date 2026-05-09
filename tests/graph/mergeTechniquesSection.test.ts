// tests/graph/mergeTechniquesSection.test.ts
//
// Phase 4 Wave 0 — TDD red stub for GRAPH-03 / D-13 / D-25.
// Target: src/graph/mergeTechniquesSection.ts (created in Wave 1).
//
// Describe-block names are copied VERBATIM from 04-RESEARCH.md §Validation
// Architecture → Phase Requirements → Test Map so the Wave 1 gatekeeper's
// grep assertions pass.
//
// While src/graph/mergeTechniquesSection.ts does not exist yet, this file
// red-fails at the import line (TS2307 "Cannot find module"). That is the
// intended Wave 0 state: every Phase 4 behavior has a stub marking territory.

import { describe, it, expect } from 'vitest';
// Target — does not exist until Wave 1 ships it. Keeps the test red.
import { mergeTechniquesSection } from '../../src/graph/mergeTechniquesSection';

describe('mergeTechniquesSection (GRAPH-03, D-13)', () => {
  it('appends ## Techniques after ## Notes when section is absent', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const tags = [{ name: 'Two Pointers', slug: 'two-pointers' }];
    const out = mergeTechniquesSection(body, tags);
    expect(out).toContain('## Techniques');
    expect(out).toContain('- [[Two Pointers]]');
    // Insertion after ## Notes — Techniques heading must follow Notes in the text.
    expect(out.indexOf('## Notes')).toBeLessThan(out.indexOf('## Techniques'));
  });

  it('writes wikilink per topic tag', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const tags = [
      { name: 'Two Pointers', slug: 'two-pointers' },
      { name: 'Hash Table', slug: 'hash-table' },
      { name: 'Sliding Window', slug: 'sliding-window' },
    ];
    const out = mergeTechniquesSection(body, tags);
    expect(out).toContain('- [[Two Pointers]]');
    expect(out).toContain('- [[Hash Table]]');
    expect(out).toContain('- [[Sliding Window]]');
  });

  it('insertion after ## Notes', () => {
    const body = [
      '## Problem',
      'desc',
      '',
      '## Code',
      '```python3',
      'x = 1',
      '```',
      '',
      '## Notes',
      'my thoughts',
      '',
      '## Custom Tests',
      '### Case 1',
      '```text',
      '[1,2]',
      '```',
      '',
    ].join('\n');
    const tags = [{ name: 'Arrays', slug: 'arrays' }];
    const out = mergeTechniquesSection(body, tags);
    // Must land BETWEEN ## Notes and ## Custom Tests, not at EOF.
    const notesIdx = out.indexOf('## Notes');
    const techIdx = out.indexOf('## Techniques');
    const customIdx = out.indexOf('## Custom Tests');
    expect(notesIdx).toBeGreaterThan(-1);
    expect(techIdx).toBeGreaterThan(-1);
    expect(customIdx).toBeGreaterThan(-1);
    expect(notesIdx).toBeLessThan(techIdx);
    expect(techIdx).toBeLessThan(customIdx);
  });

  it('preserves user-added wikilinks', () => {
    // User has their own non-LC technique link — must survive a plugin write.
    const body = [
      '## Notes',
      'notes body',
      '',
      '## Techniques',
      '',
      '- [[Two Pointers]]',
      '- [[My Own Custom Tag]]',
      '',
    ].join('\n');
    const tags = [{ name: 'Two Pointers', slug: 'two-pointers' }];
    const out = mergeTechniquesSection(body, tags);
    expect(out).toContain('- [[Two Pointers]]');
    expect(out).toContain('- [[My Own Custom Tag]]');
  });

  it('idempotent', () => {
    const body = '## Notes\nbar\n';
    const tags = [
      { name: 'Two Pointers', slug: 'two-pointers' },
      { name: 'Hash Table', slug: 'hash-table' },
    ];
    const once = mergeTechniquesSection(body, tags);
    const twice = mergeTechniquesSection(once, tags);
    expect(twice).toBe(once);
  });

  it('no-ops when topicTags is empty and section does not exist', () => {
    // D-25: problems without any topic tags leave the body untouched.
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const out = mergeTechniquesSection(body, []);
    expect(out).toBe(body);
  });

  it('tolerates * and + bullets as link markers', () => {
    // D-13: LINK_RE recognises `-`, `*`, `+` bullets. User-chosen bullet style
    // must count as an existing plugin-derived link on idempotence checks.
    const body = [
      '## Notes',
      'x',
      '',
      '## Techniques',
      '',
      '* [[Two Pointers]]',
      '+ [[Hash Table]]',
      '',
    ].join('\n');
    const tags = [
      { name: 'Two Pointers', slug: 'two-pointers' },
      { name: 'Hash Table', slug: 'hash-table' },
    ];
    const out = mergeTechniquesSection(body, tags);
    // Both existing links recognised → neither re-added.
    const twoPointerHits = (out.match(/\[\[Two Pointers\]\]/g) ?? []).length;
    const hashHits = (out.match(/\[\[Hash Table\]\]/g) ?? []).length;
    expect(twoPointerHits).toBe(1);
    expect(hashHits).toBe(1);
  });
});
