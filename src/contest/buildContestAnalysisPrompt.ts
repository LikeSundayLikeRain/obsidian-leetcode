// src/contest/buildContestAnalysisPrompt.ts
// Phase 10 Plan 02 Task 2 — Pure prompt assembly for contest AI analysis.
//
// Purity contract (mirrors src/ai/buildReviewPrompt.ts posture):
//   - Zero imports (no external deps).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same args -> byte-identical output across calls (deterministic).
//
// Locked structure (10-CONTEXT D-19):
//   - System instruction: analyzing virtual contest performance
//   - Per-problem section: slug, difficulty, verdict, time-to-solve, code
//   - Instructions: holistic patterns, technique gaps, what to practice next
//   - Per-problem commentary kept to 1-2 sentences (NOT full code review)
//
// D-22: ## Notes is NEVER sent (same convention as Phase 09 AI Review).

/**
 * Arguments for building a contest analysis prompt.
 */
export interface BuildContestAnalysisPromptArgs {
  /** Contest title (e.g., "Weekly Contest 400"). */
  contestTitle: string;
  /** Contest type for context. */
  contestType: 'weekly' | 'biweekly';
  /** Total actual solving time in minutes (excludes paused time). */
  durationMin: number;
  /** Per-problem data for analysis. */
  problems: Array<{
    slug: string;
    difficulty: string;
    verdict: string;
    /** Minutes to solve (null = did not solve). */
    timeToSolveMin: number | null;
    code: string;
    language: string;
  }>;
}

/**
 * Pure prompt assembler for contest AI analysis.
 * Returns the complete prompt string built from contest results + user code.
 * Determinism: same args -> byte-identical output.
 */
export function buildContestAnalysisPrompt(args: BuildContestAnalysisPromptArgs): string {
  const sections: string[] = [];

  // System instruction
  sections.push(
    'You are analyzing a virtual LeetCode contest performance. Provide:',
    '1) A holistic debrief: time allocation patterns, technique gaps, what to practice next.',
    '2) Brief per-problem commentary (1-2 sentences each, NOT a full code review).',
    '',
    'Format your response in Markdown with clear headings.',
    '',
  );

  // Contest metadata
  sections.push(
    `## Contest: ${args.contestTitle}`,
    `Type: ${args.contestType} | Total solving time: ${args.durationMin} min`,
    '',
  );

  // Per-problem sections
  if (args.problems.length === 0) {
    sections.push('No problems attempted in this contest.', '');
  } else {
    for (const p of args.problems) {
      const timeStr = p.timeToSolveMin !== null ? `${p.timeToSolveMin} min` : 'Did not solve';
      sections.push(
        `## ${p.slug}`,
        `Difficulty: ${p.difficulty} | Verdict: ${p.verdict} | Time: ${timeStr}`,
        '',
      );
      if (p.code.trim()) {
        sections.push(
          '```' + p.language,
          p.code.trim(),
          '```',
          '',
        );
      }
    }
  }

  // Final instructions
  sections.push(
    '## Analysis Instructions',
    '',
    'Focus on PATTERNS across problems:',
    '- Time allocation: did the solver spend too long on early problems? Rush later ones?',
    '- Technique gaps: which algorithmic patterns were missing or weak?',
    '- What to practice next: specific topics or problem types to drill.',
    '',
    'Per-problem commentary should be 1-2 sentences max. This is a contest debrief, not an individual code review.',
  );

  return sections.join('\n');
}
