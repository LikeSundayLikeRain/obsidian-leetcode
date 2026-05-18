// src/ai/buildReviewPrompt.ts
//
// Phase 09 Plan 01 Task 1 — Pure prompt-assembly helper for AI Review.
//
// Purity (mirrors `src/ai/buildDebugPrompt.ts` posture):
//   - No imports (zero external deps).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same args → byte-identical output across calls (locked test asserts
//     determinism over 100 iterations).
//
// Locked structure (09-RESEARCH + 09-CONTEXT D-01/D-02/D-04):
//   - System instruction: reviewing an Accepted LC solution, constructive
//     feedback in three sections.
//   - `## Problem` heading + problemMd.trim()
//   - `## Accepted {language} solution` heading + fenced code block
//   - `## Review instructions` heading + three sub-headings:
//     - `### Approach`: evaluate algorithm choice; code fence ONLY for
//       fundamentally different approach (D-04)
//     - `### Efficiency`: time/space complexity analysis
//     - `### Code Style`: readability, naming, edge-case, idiomatic usage
//   - Final instruction: concise, no restatement, no congratulation.
//
// `## Notes` is NEVER sent (09-CONTEXT decision — locked v1.1 posture).

export interface BuildReviewPromptArgs {
  /** Markdown of the problem statement (full statement + examples + constraints). */
  problemMd: string;
  /** The user's accepted solution code (fence body). */
  code: string;
  /** Fence info-string ('python3', 'java', 'cpp', etc.). */
  language: string;
}

/**
 * Pure prompt assembler. Returns the AI Review prompt string built from
 * problem markdown + user code + selected language.
 * Determinism: same args → byte-identical output.
 */
export function buildReviewPrompt(args: BuildReviewPromptArgs): string {
  return [
    'You are reviewing an Accepted LeetCode solution. Provide constructive feedback in three sections.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## Accepted ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## Review instructions',
    '',
    'Write your review using EXACTLY these three markdown headings (triple-hash, not double):',
    '',
    '```',
    '### Approach',
    '### Efficiency',
    '### Code Style',
    '```',
    '',
    'For ### Approach: Evaluate the algorithm choice. If a fundamentally different algorithm exists with better complexity, include a code fence showing the alternative. Do NOT include code for minor style tweaks.',
    'For ### Efficiency: Analyze time and space complexity. Compare to the optimal known complexity for this problem.',
    'For ### Code Style: Evaluate readability, naming conventions, edge-case handling, and idiomatic usage for the language.',
    '',
    'Be concise. Do not restate the problem. Do not congratulate.',
  ].join('\n');
}
