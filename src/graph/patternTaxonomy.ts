// src/graph/patternTaxonomy.ts
//
// Phase 11 Plan 01 Task 1 — 22 seed patterns + name normalization.
//
// Purity contract:
//   - No imports (zero external deps).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same input -> same output.
//
// The 22 seed patterns are the 18 NeetCode patterns + 4 additions
// (Prefix Sum, Monotonic Stack, Topological Sort, Union-Find) per D-02.
// These are a SEED, not a ceiling — AI can create new pattern names
// when no seed pattern fits.

/**
 * Canonical 22-pattern seed taxonomy. AI is free to create new pattern
 * names when none of these fits — new patterns auto-create hub notes
 * with no user confirmation (D-02).
 */
export const SEED_PATTERNS: readonly string[] = [
  // Core data structures
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window',
  'Stack',
  'Monotonic Stack',
  'Monotonic Queue',
  'Linked List',
  'Trees',
  'Tries',
  'Heap / Priority Queue',
  'Graphs',
  'Advanced Graphs',
  // Search & sort
  'Binary Search',
  'Sorting',
  // Dynamic programming
  '1-D Dynamic Programming',
  '2-D Dynamic Programming',
  'Digit DP',
  'Bitmask DP',
  // Greedy & intervals
  'Greedy',
  'Intervals',
  'Sweep Line',
  // String algorithms
  'String Matching',
  'Rolling Hash',
  // Math & number theory
  'Math & Geometry',
  'Number Theory',
  'Combinatorics',
  'Bit Manipulation',
  // Prefix/range techniques
  'Prefix Sum',
  'Segment Tree',
  'Binary Indexed Tree',
  // Graph algorithms
  'Topological Sort',
  'Union-Find',
  'Shortest Path',
  'Minimum Spanning Tree',
  // Backtracking & recursion
  'Backtracking',
  'Divide & Conquer',
  // Advanced
  'Matrix Exponentiation',
  'Meet In The Middle',
  'Game Theory',
  'Simulation',
] as const;

/**
 * Normalize a pattern name. Seed-aware and capital-preserving:
 *   1. Trim and collapse internal whitespace to single spaces.
 *   2. Empty / whitespace-only input returns '' (never throws).
 *   3. If the collapsed name case-insensitively matches a SEED_PATTERN,
 *      return that seed VERBATIM (canonicalizes case variants to the seed).
 *   4. Otherwise (AI-invented name) capitalize the first char of each word
 *      WITHOUT lowercasing the remainder, preserving interior capitals.
 *
 * Examples:
 *   '  two   pointers  '          -> 'Two Pointers'        (seed canonicalization)
 *   '1-d dynamic programming'     -> '1-D Dynamic Programming' (seed, verbatim)
 *   'union-find'                  -> 'Union-Find'          (seed, verbatim)
 *   "Mo's Algorithm"              -> "Mo's Algorithm"      (invented, interior caps kept)
 *   'Heavy-Light Decomposition'   -> 'Heavy-Light Decomposition' (invented)
 */
export function normalizePatternName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return '';

  const lower = trimmed.toLowerCase();
  for (const seed of SEED_PATTERNS) {
    if (seed.toLowerCase() === lower) return seed;
  }

  return trimmed
    .split(' ')
    .map((word) => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
