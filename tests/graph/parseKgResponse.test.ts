// tests/graph/parseKgResponse.test.ts
//
// Phase 11 Plan 01 Task 1 — parseKgResponse defensive parser tests.
//
// Verifies (per 11-01-PLAN.md acceptance criteria):
//   - Valid JSON string returns parsed KgClassification
//   - JSON wrapped in markdown fences parses successfully
//   - JSON embedded in explanatory text is extracted via regex
//   - Malformed input returns fallback { pattern: 'OTHER', variants: [], lookAhead: [] }
//   - variants array capped at 2
//   - lookAhead array capped at 2
//   - pattern name is normalized via normalizePatternName

import { describe, it, expect } from 'vitest';
import { parseKgResponse } from '../../src/graph/parseKgResponse';
import type { KgClassification } from '../../src/graph/parseKgResponse';

describe('Phase 11 Plan 01 — parseKgResponse defensive parser', () => {
  it('valid JSON string returns parsed KgClassification', () => {
    const json = JSON.stringify({
      pattern: 'Two Pointers',
      variants: [{ slug: 'three-sum', reason: 'same shrink pattern' }],
      lookAhead: [{ slug: 'container-with-most-water', reason: 'similar approach' }],
    });
    const result = parseKgResponse(json);
    expect(result.pattern).toBe('Two Pointers');
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].slug).toBe('three-sum');
    expect(result.lookAhead).toHaveLength(1);
    expect(result.lookAhead[0].slug).toBe('container-with-most-water');
  });

  it('JSON wrapped in markdown fences parses successfully', () => {
    const input = '```json\n{"pattern": "Sliding Window", "variants": [], "lookAhead": []}\n```';
    const result = parseKgResponse(input);
    expect(result.pattern).toBe('Sliding Window');
    expect(result.variants).toEqual([]);
    expect(result.lookAhead).toEqual([]);
  });

  it('JSON embedded in explanatory text is extracted via regex', () => {
    const input = `Here is my classification:

{"pattern": "Binary Search", "variants": [{"slug": "search-in-rotated-sorted-array", "reason": "same binary search variant"}], "lookAhead": []}

I classified it as Binary Search because the solution uses a divide and conquer approach.`;
    const result = parseKgResponse(input);
    expect(result.pattern).toBe('Binary Search');
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].slug).toBe('search-in-rotated-sorted-array');
  });

  it('malformed input returns fallback { pattern: OTHER, variants: [], lookAhead: [] }', () => {
    const result = parseKgResponse('This is not JSON at all, just rambling text without braces');
    expect(result.pattern).toBe('OTHER');
    expect(result.variants).toEqual([]);
    expect(result.lookAhead).toEqual([]);
  });

  it('variants array capped at 2', () => {
    const json = JSON.stringify({
      pattern: 'Greedy',
      variants: [
        { slug: 'a', reason: 'r1' },
        { slug: 'b', reason: 'r2' },
        { slug: 'c', reason: 'r3' },
        { slug: 'd', reason: 'r4' },
      ],
      lookAhead: [],
    });
    const result = parseKgResponse(json);
    expect(result.variants).toHaveLength(2);
    expect(result.variants[0].slug).toBe('a');
    expect(result.variants[1].slug).toBe('b');
  });

  it('lookAhead array capped at 2', () => {
    const json = JSON.stringify({
      pattern: 'Stack',
      variants: [],
      lookAhead: [
        { slug: 'x', reason: 'r1' },
        { slug: 'y', reason: 'r2' },
        { slug: 'z', reason: 'r3' },
      ],
    });
    const result = parseKgResponse(json);
    expect(result.lookAhead).toHaveLength(2);
    expect(result.lookAhead[0].slug).toBe('x');
    expect(result.lookAhead[1].slug).toBe('y');
  });

  it('pattern name is normalized via normalizePatternName', () => {
    const json = JSON.stringify({
      pattern: '  two   pointers  ',
      variants: [],
      lookAhead: [],
    });
    const result = parseKgResponse(json);
    expect(result.pattern).toBe('Two Pointers');
  });

  it('missing variants/lookAhead fields default to empty arrays', () => {
    const json = JSON.stringify({ pattern: 'Trees' });
    const result = parseKgResponse(json);
    expect(result.pattern).toBe('Trees');
    expect(result.variants).toEqual([]);
    expect(result.lookAhead).toEqual([]);
  });

  it('invalid variant entries (missing slug/reason) are filtered out', () => {
    const json = JSON.stringify({
      pattern: 'Graphs',
      variants: [
        { slug: 'valid-slug', reason: 'valid reason' },
        { notASlug: 'bad' },
        'not-an-object',
      ],
      lookAhead: [
        { slug: 'good', reason: 'ok' },
        null,
      ],
    });
    const result = parseKgResponse(json);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].slug).toBe('valid-slug');
    expect(result.lookAhead).toHaveLength(1);
    expect(result.lookAhead[0].slug).toBe('good');
  });
});
