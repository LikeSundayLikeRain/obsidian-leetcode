// tests/graph/patternTaxonomy.test.ts
//
// Quick-260621-154 Task 1 — normalizePatternName seed-awareness + capital preservation.
//
// Verifies the corrected normalizePatternName contract:
//   - Returns every SEED_PATTERN verbatim (idempotent on all 40 seeds).
//   - Case variants of seeds canonicalize to the verbatim seed.
//   - AI-invented (rule-4) names preserve interior capitals.
//   - Empty / whitespace-only input returns '' and does not throw.
//   - Idempotent across seeds, case variants, invented names, and ''.

import { describe, it, expect } from 'vitest';
import { SEED_PATTERNS, normalizePatternName } from '../../src/graph/patternTaxonomy';

describe('Quick-260621-154 — normalizePatternName', () => {
  describe('seed identity (every seed normalizes to itself)', () => {
    for (const seed of SEED_PATTERNS) {
      it(`returns '${seed}' verbatim`, () => {
        expect(normalizePatternName(seed)).toBe(seed);
      });
    }
  });

  describe('case canonicalization to verbatim seed', () => {
    it("'1-d dynamic programming' -> '1-D Dynamic Programming'", () => {
      expect(normalizePatternName('1-d dynamic programming')).toBe('1-D Dynamic Programming');
    });
    it("'union-find' -> 'Union-Find'", () => {
      expect(normalizePatternName('union-find')).toBe('Union-Find');
    });
    it("'BINARY SEARCH' -> 'Binary Search'", () => {
      expect(normalizePatternName('BINARY SEARCH')).toBe('Binary Search');
    });
    it("'two pointers' -> 'Two Pointers'", () => {
      expect(normalizePatternName('two pointers')).toBe('Two Pointers');
    });
    it("'  heap / priority queue  ' -> 'Heap / Priority Queue'", () => {
      expect(normalizePatternName('  heap / priority queue  ')).toBe('Heap / Priority Queue');
    });
  });

  describe('invented-name interior capitals preserved', () => {
    it("\"Mo's Algorithm\" -> \"Mo's Algorithm\"", () => {
      expect(normalizePatternName("Mo's Algorithm")).toBe("Mo's Algorithm");
    });
    it("'Heavy-Light Decomposition' -> 'Heavy-Light Decomposition'", () => {
      expect(normalizePatternName('Heavy-Light Decomposition')).toBe('Heavy-Light Decomposition');
    });
    it("does not lowercase the remainder of a word ('McKenzie Sort' stays 'McKenzie Sort')", () => {
      expect(normalizePatternName('McKenzie Sort')).toBe('McKenzie Sort');
    });
    it('capitalizes the first char of a lowercase invented name', () => {
      expect(normalizePatternName('quantum annealing')).toBe('Quantum Annealing');
    });
  });

  describe('idempotence', () => {
    const samples = ['Two Pointers', '1-d dynamic programming', "Mo's Algorithm", ''];
    for (const x of samples) {
      it(`is idempotent for ${JSON.stringify(x)}`, () => {
        const once = normalizePatternName(x);
        expect(normalizePatternName(once)).toBe(once);
      });
    }
  });

  describe('empty / whitespace-only input', () => {
    it("normalizePatternName('') === '' and does not throw", () => {
      expect(() => normalizePatternName('')).not.toThrow();
      expect(normalizePatternName('')).toBe('');
    });
    it("normalizePatternName('   ') === ''", () => {
      expect(normalizePatternName('   ')).toBe('');
    });
  });
});
