// src/ai/mergeAIReviewSection.ts
//
// Phase 09 Plan 01 Task 2 — Idempotent vault-write transform for ## AI Review.
//
// Purity contract (mirrors `src/graph/mergeTechniquesSection.ts` posture):
//   - Only import is NOTES_HEADING_LINE from NoteTemplate (SSoT constant).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same (body, reviewContent) input → same string output.
//   - Safe inside `vault.process` retry semantics (D-17/D-18/D-20).
//
// Invariants:
//   - Idempotent: merge(merge(body, content), content) === merge(body, content)
//   - First write (D-17/D-18): appends ## AI Review after existing content at EOF
//   - Replacement (D-20): replaces from ## AI Review heading to EOF with new content
//   - Output ends with exactly one trailing newline
//   - Never mutates input string (returns new string)

import { AI_REVIEW_HEADING_LINE } from '../notes/NoteTemplate';

export { AI_REVIEW_HEADING_LINE };

/**
 * Idempotent vault-write transform. Inserts or replaces `## AI Review` in the
 * note body.
 *
 * @param body          — full note body (same contract as `vault.process` callbacks)
 * @param reviewContent — the AI-generated review text (may be empty)
 * @returns new body with ## AI Review section inserted/replaced at EOF
 */
export function mergeAIReviewSection(body: string, reviewContent: string): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines);

  if (headingIdx >= 0) {
    // Replacement path (D-20): discard from heading to EOF, insert new content.
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    return before + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
  }

  // First-write path (D-17/D-18): append after all existing content.
  const trimmedBody = body.replace(/\n+$/, '');
  return trimmedBody + '\n\n' + AI_REVIEW_HEADING_LINE + '\n\n' + reviewContent + '\n';
}

/**
 * Find the line index that is an EXACT literal match for AI_REVIEW_HEADING_LINE.
 * Not a regex/prefix match — '## AI Reviews' must NOT match.
 */
function findExactHeading(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === AI_REVIEW_HEADING_LINE) return i;
  }
  return -1;
}
