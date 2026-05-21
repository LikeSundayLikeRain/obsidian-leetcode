// tests/graph/mergeRelatedVariantsSection.test.ts
//
// Phase 11 Plan 01 Task 2 — mergeRelatedVariantsSection pure transform tests.
//
// Verifies (per 11-01-PLAN.md acceptance criteria):
//   - Inserts ## Related Variants after ## Techniques when section absent
//   - Replaces existing ## Related Variants content idempotently
//   - Renders variants as `- [[slug]] — reason` format
//   - Handles missing ## Techniques (inserts before ## AI Review)
//   - Handles missing both anchors (appends at EOF)
//   - Idempotent: merge(merge(body, v), v) === merge(body, v)

import { describe, it, expect } from 'vitest';
import { mergeRelatedVariantsSection } from '../../src/graph/mergeRelatedVariantsSection';

describe('Phase 11 Plan 01 — mergeRelatedVariantsSection pure transform', () => {
  const variants = [
    { slug: 'three-sum', reason: 'same two-pointer shrink pattern on sorted input' },
    { slug: 'container-with-most-water', reason: 'similar convergent pointer technique' },
  ];

  it('inserts ## Related Variants after ## Techniques when section absent', () => {
    const body = [
      '## Problem',
      'problem text',
      '',
      '## Code',
      '```python3',
      'x = 1',
      '```',
      '',
      '## Techniques',
      '',
      '- [[Two Pointers]]',
      '',
      '## AI Review',
      '',
      'Review content here.',
      '',
    ].join('\n');

    const out = mergeRelatedVariantsSection(body, variants);
    expect(out).toContain('## Related Variants');
    expect(out).toContain('- [[three-sum]]');
    expect(out).toContain('- [[container-with-most-water]]');
    // Order: Techniques -> Related Variants -> AI Review
    const techIdx = out.indexOf('## Techniques');
    const relIdx = out.indexOf('## Related Variants');
    const aiIdx = out.indexOf('## AI Review');
    expect(techIdx).toBeLessThan(relIdx);
    expect(relIdx).toBeLessThan(aiIdx);
  });

  it('replaces existing ## Related Variants content idempotently', () => {
    const body = [
      '## Problem',
      'problem text',
      '',
      '## Techniques',
      '',
      '- [[Graphs]]',
      '',
      '## Related Variants',
      '',
      '- [[old-slug]] — old reason',
      '',
      '## AI Review',
      '',
      'Review content.',
      '',
    ].join('\n');

    const out = mergeRelatedVariantsSection(body, variants);
    expect(out).toContain('- [[three-sum]]');
    expect(out).toContain('- [[container-with-most-water]]');
    expect(out).not.toContain('old-slug');
    expect(out).not.toContain('old reason');
    // AI Review still intact
    expect(out).toContain('## AI Review');
    expect(out).toContain('Review content.');
  });

  it('renders variants as `- [[slug]] — reason` format', () => {
    const body = '## Techniques\n\n- [[Stack]]\n';
    const out = mergeRelatedVariantsSection(body, [
      { slug: 'valid-parentheses', reason: 'matching bracket pattern' },
    ]);
    expect(out).toContain('- [[valid-parentheses]] — matching bracket pattern');
  });

  it('handles missing ## Techniques (inserts before ## AI Review)', () => {
    const body = [
      '## Problem',
      'problem text',
      '',
      '## Code',
      '```python3',
      'x = 1',
      '```',
      '',
      '## Notes',
      'some notes',
      '',
      '## AI Review',
      '',
      'Review here.',
      '',
    ].join('\n');

    const out = mergeRelatedVariantsSection(body, variants);
    expect(out).toContain('## Related Variants');
    const relIdx = out.indexOf('## Related Variants');
    const aiIdx = out.indexOf('## AI Review');
    expect(relIdx).toBeLessThan(aiIdx);
    expect(out).toContain('Review here.');
  });

  it('handles missing both anchors (appends at EOF)', () => {
    const body = [
      '## Problem',
      'problem text',
      '',
      '## Code',
      '```python3',
      'x = 1',
      '```',
      '',
      '## Notes',
      'some notes',
      '',
    ].join('\n');

    const out = mergeRelatedVariantsSection(body, variants);
    expect(out).toContain('## Related Variants');
    expect(out).toContain('- [[three-sum]]');
    // Appended at end — Related Variants is last section
    const relIdx = out.indexOf('## Related Variants');
    expect(relIdx).toBeGreaterThan(out.indexOf('## Notes'));
  });

  it('idempotent: merge(merge(body, v), v) === merge(body, v)', () => {
    const body = [
      '## Problem',
      'problem',
      '',
      '## Techniques',
      '',
      '- [[Two Pointers]]',
      '',
      '## AI Review',
      '',
      'Review.',
      '',
    ].join('\n');

    const once = mergeRelatedVariantsSection(body, variants);
    const twice = mergeRelatedVariantsSection(once, variants);
    expect(twice).toBe(once);
  });

  it('empty variants array produces heading with no bullets in Related Variants section', () => {
    const body = '## Techniques\n\n- [[Trees]]\n\n## AI Review\n\nContent.\n';
    const out = mergeRelatedVariantsSection(body, []);
    expect(out).toContain('## Related Variants');
    // Only check within the Related Variants section itself (not Techniques)
    const relIdx = out.indexOf('## Related Variants');
    const afterRel = out.slice(relIdx + '## Related Variants'.length);
    const nextH2 = afterRel.indexOf('## ');
    const relContent = afterRel.slice(0, nextH2 > -1 ? nextH2 : undefined);
    expect(relContent).not.toContain('- [[');
  });
});
