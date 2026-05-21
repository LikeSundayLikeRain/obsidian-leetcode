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
    'You are a competitive programming coach reviewing an Accepted LeetCode solution. Focus on algorithmic insight, not code style.',
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
    'For ### Approach: Is this the best algorithm for this problem? If a fundamentally better approach exists (better time complexity class), explain the insight and show it in a code fence. If the approach is already optimal, say so briefly and explain WHY it works (the key insight).',
    '',
    'For ### Efficiency: State time and space complexity. Compare to the theoretical optimum. If the solution is optimal, just confirm it concisely. If sub-optimal, explain what complexity is achievable and how.',
    '',
    'For ### Code Style: Focus ONLY on things that matter for competitive programming:',
    '- Actual bugs that WILL fail on valid inputs (not hypothetical "might" scenarios)',
    '- Cleaner implementations: if the same logic can be expressed in fewer lines or with a more elegant idiom in this language, show it in a short code snippet. Examples: replacing manual loops with built-in functions, using destructuring, simplifying conditionals, removing redundant variables.',
    '- Real off-by-one or overflow risks with concrete failing inputs',
    '',
    'DO NOT:',
    '- Raise a concern then immediately dismiss it ("X could... actually no, it can\'t"). If it\'s not a real issue, don\'t mention it.',
    '- Comment on naming, access modifiers, collection sizing, or enterprise patterns',
    '- Suggest micro-optimizations that don\'t change the complexity class',
    '- Qualify correct code with "Good." or "Fine as is." — just omit it entirely',
    '',
    'Be concise and direct. If a section has nothing meaningful to say, write just "Optimal." or "No issues." — do not fill space with non-issues. Do not restate the problem. Do not congratulate.',
  ].join('\n');
}
