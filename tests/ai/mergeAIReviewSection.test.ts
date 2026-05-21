// tests/ai/mergeAIReviewSection.test.ts
//
// Phase 09 Plan 01 Task 2 — mergeAIReviewSection vault-write transform tests.
//
// Verifies (per 09-01-PLAN.md acceptance criteria):
//   - First write: body with ## Notes but no ## AI Review → appends at EOF
//   - First write: body without ## Notes → appends at EOF
//   - Replacement: body already has ## AI Review → replaces from heading to EOF
//   - Idempotency: merge(merge(body, content), content) === merge(body, content)
//   - Heading detection is exact literal match ('## AI Review'), not regex
//   - Trailing whitespace: output ends with single \n, no double-trailing-newlines
//   - Empty reviewContent does not throw — produces heading with blank body

import { describe, it, expect } from 'vitest';
import { mergeAIReviewSection, AI_REVIEW_HEADING_LINE } from '../../src/ai/mergeAIReviewSection';

describe('Phase 09 Plan 01 — mergeAIReviewSection vault-write transform', () => {
  it('first write: body with ## Notes but no ## AI Review appends at EOF', () => {
    const body = [
      '## Problem',
      'Two Sum problem.',
      '',
      '## Notes',
      'Some user notes here.',
      '',
    ].join('\n');
    const result = mergeAIReviewSection(body, 'Great approach using hash map.');
    expect(result).toContain('## AI Review');
    expect(result).toContain('Great approach using hash map.');
    // ## AI Review should come after ## Notes content
    const notesIdx = result.indexOf('## Notes');
    const reviewIdx = result.indexOf('## AI Review');
    expect(reviewIdx).toBeGreaterThan(notesIdx);
  });

  it('first write: body without ## Notes appends at EOF', () => {
    const body = [
      '## Problem',
      'Two Sum problem.',
      '',
      '## Code',
      '```python3',
      'def twoSum(): pass',
      '```',
    ].join('\n');
    const result = mergeAIReviewSection(body, 'Nice solution.');
    expect(result).toContain('## AI Review');
    expect(result).toContain('Nice solution.');
    // Review section should be at the end
    const reviewIdx = result.indexOf('## AI Review');
    expect(reviewIdx).toBeGreaterThan(result.indexOf('## Code'));
  });

  it('replacement: body already has ## AI Review replaces from heading to EOF', () => {
    const body = [
      '## Problem',
      'Two Sum problem.',
      '',
      '## Notes',
      'User notes.',
      '',
      '## AI Review',
      '',
      'Old review content that should be replaced.',
    ].join('\n');
    const result = mergeAIReviewSection(body, 'New review content.');
    expect(result).toContain('New review content.');
    expect(result).not.toContain('Old review content that should be replaced.');
    // Other sections preserved
    expect(result).toContain('## Problem');
    expect(result).toContain('## Notes');
    expect(result).toContain('User notes.');
  });

  it('idempotency: merge(merge(body, content), content) === merge(body, content)', () => {
    const body = [
      '## Problem',
      'Some problem.',
      '',
      '## Notes',
      'Notes.',
    ].join('\n');
    const content = 'Review feedback here.';
    const once = mergeAIReviewSection(body, content);
    const twice = mergeAIReviewSection(once, content);
    expect(twice).toBe(once);
  });

  it("heading detection is exact literal match ('## AI Review'), not regex", () => {
    const body = [
      '## Problem',
      '## AI Reviews are cool',
      'Some text.',
      '',
      '## Notes',
      'Notes.',
    ].join('\n');
    // '## AI Reviews are cool' should NOT be treated as ## AI Review heading
    const result = mergeAIReviewSection(body, 'Review content.');
    // The non-matching heading should be preserved
    expect(result).toContain('## AI Reviews are cool');
    expect(result).toContain('Review content.');
  });

  it('trailing whitespace: output ends with single \\n, no double-trailing-newlines', () => {
    const body = [
      '## Problem',
      'Problem.',
      '',
      '## Notes',
      'Notes.',
    ].join('\n');
    const result = mergeAIReviewSection(body, 'Review.');
    expect(result).toMatch(/[^\n]\n$/);
    expect(result).not.toMatch(/\n\n$/);
  });

  it('empty reviewContent does not throw — produces heading with blank body', () => {
    const body = [
      '## Problem',
      'Problem.',
    ].join('\n');
    expect(() => mergeAIReviewSection(body, '')).not.toThrow();
    const result = mergeAIReviewSection(body, '');
    expect(result).toContain('## AI Review');
  });

  it('AI_REVIEW_HEADING_LINE constant is exported and equals "## AI Review"', () => {
    expect(AI_REVIEW_HEADING_LINE).toBe('## AI Review');
  });
});
