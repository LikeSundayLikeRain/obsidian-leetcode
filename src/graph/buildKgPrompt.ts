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
    'You are classifying a LeetCode solution into an algorithmic pattern.',
    '',
    'Choose from these canonical patterns:',
    patternList,
    '',
    'If none of these fits, create a new concise pattern name.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## Accepted ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## Instructions',
    '',
    'Respond with ONLY a JSON object (no markdown fences, no explanation):',
    '{',
    '  "pattern": "<exact pattern name from the list above, or a new name>",',
    '  "variants": [',
    '    { "slug": "<problem-slug>", "reason": "<1-sentence structural reason>" }',
    '  ],',
    '  "lookAhead": [',
    '    { "slug": "<unsolved-problem-slug>", "reason": "<why this helps>" }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- "variants": exactly 0-2 problems from a DIFFERENT pattern that are structural twins. Omit if none.',
    '- "lookAhead": exactly 0-2 unsolved problems that build on the same pattern. Omit if none.',
    '- All slugs must be valid LeetCode problem slugs (lowercase, hyphenated).',
  ].join('\n');
}
