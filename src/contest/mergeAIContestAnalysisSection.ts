// src/contest/mergeAIContestAnalysisSection.ts
// Phase 10 Plan 02 Task 2 — Idempotent vault-write transform for ## AI Analysis.
//
// Purity contract (mirrors src/ai/mergeAIReviewSection.ts posture):
//   - Only import is the heading constant (SSoT).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same (body, analysisContent) input -> same string output.
//   - Safe inside `vault.process` retry semantics.
//
// Invariants:
//   - Idempotent: merge(merge(body, c1), c2) replaces c1 with c2 cleanly
//   - First write (D-17): inserts ## AI Analysis before ## Notes
//   - Replacement (D-21): replaces from ## AI Analysis heading to next H2 or EOF
//   - Fallback: appends at EOF if no ## Notes found
//   - Output ends with exactly one trailing newline
//   - Never mutates input string (returns new string)
//   - T-10-04 mitigation: heading match is exact string equality (===), not regex

// Heading constant — SSoT for the contest analysis section.
// Plan 01 adds this to NoteTemplate.ts; defined here as well for self-containment
// during parallel execution. The orchestrator reconciles at merge time.
export const AI_ANALYSIS_HEADING_LINE = '## AI Analysis' as const;

/** The heading line for the user's notes section (must match NoteTemplate SSoT). */
const NOTES_HEADING_LINE = '## Notes';

/**
 * Idempotent vault-write transform. Inserts or replaces `## AI Analysis` in the
 * contest summary note body.
 *
 * Placement rules (D-17, D-21):
 *   - First write: insert before `## Notes` (Results -> AI Analysis -> Notes)
 *   - Replacement: discard from heading to next H2 or EOF, insert new content
 *   - Fallback: append at EOF if no `## Notes` found
 *
 * @param body             — full note body (same contract as `vault.process` callbacks)
 * @param analysisContent  — the AI-generated analysis text (may be empty)
 * @returns new body with ## AI Analysis section inserted/replaced
 */
export function mergeAIContestAnalysisSection(body: string, analysisContent: string): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines, AI_ANALYSIS_HEADING_LINE);

  if (headingIdx >= 0) {
    // Replacement path (D-21): discard from heading to next H2 or EOF, insert new content.
    const nextH2 = lines.findIndex((l, i) => i > headingIdx && /^## /.test(l));
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    const after = nextH2 >= 0
      ? '\n\n' + lines.slice(nextH2).join('\n').replace(/\n+$/, '')
      : '';
    return before + '\n\n' + AI_ANALYSIS_HEADING_LINE + '\n\n' + analysisContent + after + '\n';
  }

  // First write: insert before ## Notes (per D-17: Results -> AI Analysis -> Notes)
  const notesIdx = findExactHeading(lines, NOTES_HEADING_LINE);
  if (notesIdx >= 0) {
    const before = lines.slice(0, notesIdx).join('\n').replace(/\n+$/, '');
    const after = '\n\n' + lines.slice(notesIdx).join('\n').replace(/\n+$/, '');
    return before + '\n\n' + AI_ANALYSIS_HEADING_LINE + '\n\n' + analysisContent + after + '\n';
  }

  // Fallback: append at EOF
  return body.replace(/\n+$/, '') + '\n\n' + AI_ANALYSIS_HEADING_LINE + '\n\n' + analysisContent + '\n';
}

/**
 * Find the line index that is an EXACT literal match for the given heading.
 * Not a regex/prefix match — T-10-04 mitigation prevents injection of fake headings.
 */
function findExactHeading(lines: string[], heading: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === heading) return i;
  }
  return -1;
}
