// src/graph/buildKgPrompt.ts
//
// Phase 11 Plan 01 Task 1 — Pure prompt-assembly helper for AI Knowledge Graph
// classification.
//
// Purity contract (mirrors `src/ai/buildReviewPrompt.ts` posture):
//   - Only import is SEED_PATTERNS from patternTaxonomy (SSoT constant).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same args -> byte-identical output across calls (locked test asserts
//     determinism over 100 iterations).
//
// Locked structure (11-CONTEXT D-03):
//   - Prompt input = problem statement + user's code (no LC topic tags).
//   - AI classifies into one of 22 seed patterns or creates a new name.
//   - Returns structured JSON with pattern, variants (0-2), lookAhead (0-2).

import { SEED_PATTERNS } from './patternTaxonomy';

export interface BuildKgPromptArgs {
  /** Markdown of the problem statement (full statement + examples + constraints). */
  problemMd: string;
  /** The user's accepted solution code (fence body). */
  code: string;
  /** Fence info-string ('python3', 'java', 'cpp', etc.). */
  language: string;
}

/**
 * Pure prompt assembler. Returns the AI Knowledge Graph classification prompt
 * string built from problem markdown + user code + selected language.
 * Determinism: same args -> byte-identical output.
 */
export function buildKgPrompt(args: BuildKgPromptArgs): string {
  const patternList = SEED_PATTERNS.map((p) => `- ${p}`).join('\n');

  return [
    'You are an expert algorithm instructor classifying a LeetCode solution by its PRIMARY algorithmic technique.',
    '',
    'Known patterns:',
    patternList,
    '',
    '## Classification rules',
    '',
    '1. Identify the core technique(s) that make the solution work — the algorithmic insight, not supporting scaffolding. Sorting, Arrays & Hashing, and Prefix Sum are frequently enabling steps, not the primary insight — select one as the PRIMARY only when the ordering/hashing itself is the entire algorithmic insight with no downstream technique consuming it (e.g. 3Sum\'s primary is Two Pointers, with sorting as scaffolding; Merge Intervals\' primary is Intervals).',
    '2. Be SPECIFIC over generic. When a more specific pattern exists, use it instead of a broad category. Examples: "Rolling Hash" not "Arrays & Hashing" for polynomial hashing; "Segment Tree" not "Trees" for range queries; "Topological Sort" not "Graphs" for dependency ordering.',
    '2a. CAREFUL: "Monotonic Stack" and "Monotonic Queue" are DISTINCT techniques and must not be confused. Use "Monotonic Queue" (deque-based; push at one end, pop expired elements from the front) for sliding-window min/max problems and any deque-of-indices pattern (e.g. LC 239 Sliding Window Maximum, LC 862, LC 1438, LC 1696, LC 2398). Use "Monotonic Stack" (LIFO; pop while top violates monotonicity) for next-greater-element / previous-smaller-element / largest-rectangle-in-histogram patterns (e.g. LC 496, LC 84, LC 739). If the solution maintains a deque AND advances a window, the primary pattern is "Monotonic Queue" — "Sliding Window" is supporting scaffolding and should only appear as a secondary pattern when the window logic is itself non-trivial.',
    '3. Use 2 patterns when the solution combines two distinct non-trivial techniques (e.g., "Binary Search" + "Rolling Hash" for binary-search-on-length with rolling hash verification; "Binary Search" + "Greedy" for binary-search-on-answer with a greedy feasibility check). Use 1 pattern when one technique dominates and the other is trivial scaffolding (e.g., don\'t add "Arrays & Hashing" just because a hash map stores results). Emit a second pattern ONLY if removing it would make the solution incorrect or asymptotically worse (e.g. LRU Cache = Linked List + Arrays & Hashing, both load-bearing). A technique that merely appears — a tree happens to be involved, a sort precedes the real work — is NOT a second pattern. When in doubt, emit one pattern.',
    '4. If no pattern above fits, create a new concise pattern name (e.g., "Sparse Table", "Mo\'s Algorithm", "Heavy-Light Decomposition"). Do NOT force-fit into an approximate match.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## Accepted ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## Output',
    '',
    'Respond with ONLY a JSON object (no markdown fences, no explanation):',
    '{',
    '  "pattern": "<primary algorithmic technique>",',
    '  "patterns": ["<primary>", "<secondary if genuinely needed>"],',
    '  "variants": [',
    '    { "slug": "<problem-slug>", "reason": "<1-sentence structural similarity>" }',
    '  ],',
    '  "lookAhead": [',
    '    { "slug": "<harder-problem-slug>", "reason": "<why this is a natural next step>" }',
    '  ]',
    '}',
    '',
    'Constraints:',
    '- "pattern": the single most important technique. Always required.',
    '- "patterns": array with 1 or 2 entries. Use 2 ONLY when two distinct techniques are genuinely essential. Most solutions should have just 1. Omit this field entirely if only 1 pattern.',
    '- "variants": 0-2 problems that use a DIFFERENT primary pattern but share structural similarity (cross-cluster links). Omit if none.',
    '- "lookAhead": 0-2 problems that use the SAME pattern at higher difficulty. Omit if none.',
    '- All slugs must be valid LeetCode problem slugs (lowercase, hyphenated, e.g. "two-sum").',
    '- Output pattern names EXACTLY as written in the Known patterns list — verbatim capitalization and punctuation (e.g. "1-D Dynamic Programming", not "1-d"; "Union-Find", not "Union-find"). Do not re-case, pluralize, or abbreviate. If you create a new pattern (rule 4), use Title Case and avoid the characters / \\ : * ? " < > |.',
  ].join('\n');
}
