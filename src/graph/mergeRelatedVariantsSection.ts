// src/graph/mergeRelatedVariantsSection.ts
//
// Phase 11 Plan 01 Task 2 — Idempotent vault-write transform for ## Related Variants.
//
// Purity contract (mirrors `src/ai/mergeAIReviewSection.ts` posture):
//   - Only imports are heading constants from NoteTemplate (SSoT).
//   - No I/O, no DOM, no Obsidian deps, no captured state.
//   - Same (body, variants) input -> same string output.
//   - Safe inside `vault.process` retry semantics.
//
// Invariants:
//   - Idempotent: merge(merge(body, v), v) === merge(body, v)
//   - First write: inserts ## Related Variants after ## Techniques (canonical anchor)
//   - Replacement: replaces from ## Related Variants heading to next H2 with new content
//   - Fallback order: after ## Techniques > before ## AI Review > EOF
//   - Output ends with exactly one trailing newline
//   - Never mutates input string (returns new string)
//
// Section ordering (per RESEARCH.md Pitfall 8):
//   ## Techniques -> ## Related Variants -> ## AI Review

import {
  TECHNIQUES_HEADING_LINE,
  AI_REVIEW_HEADING_LINE,
} from '../notes/NoteTemplate';

export const RELATED_VARIANTS_HEADING = '## Related Variants';

/**
 * Idempotent vault-write transform. Inserts or replaces `## Related Variants`
 * in the note body.
 *
 * @param body     — full note body (same contract as `vault.process` callbacks)
 * @param variants — the AI-suggested cross-cluster structural twins (capped at 2)
 * @returns new body with ## Related Variants section inserted/replaced
 */
export function mergeRelatedVariantsSection(
  body: string,
  variants: Array<{ slug: string; reason: string; linkTarget?: string; title?: string }>,
): string {
  const lines = body.split('\n');
  const headingIdx = findExactHeading(lines, RELATED_VARIANTS_HEADING);
  const content = variants
    .map((v) => {
      const link = v.linkTarget && v.title
        ? `[[${v.linkTarget}|${v.title}]]`
        : `[[${v.slug}]]`;
      return `- ${link} — ${v.reason}`;
    })
    .join('\n');

  if (headingIdx >= 0) {
    // Replacement path: discard from heading to next H2 (bounded, not EOF).
    const end = findNextH2(lines, headingIdx + 1);
    const before = lines.slice(0, headingIdx).join('\n').replace(/\n+$/, '');
    const after = lines.slice(end).join('\n').replace(/^\n+/, '');
    if (after.length > 0) {
      return before + '\n\n' + RELATED_VARIANTS_HEADING + '\n\n' + content + '\n\n' + after;
    }
    return before + '\n\n' + RELATED_VARIANTS_HEADING + '\n\n' + content + '\n';
  }

  // First write: insert after ## Techniques (canonical anchor per D-15).
  const techIdx = findExactHeading(lines, TECHNIQUES_HEADING_LINE);
  if (techIdx >= 0) {
    const techEnd = findNextH2(lines, techIdx + 1);
    const before = lines.slice(0, techEnd).join('\n').replace(/\n+$/, '');
    const after = lines.slice(techEnd).join('\n').replace(/^\n+/, '');
    if (after.length > 0) {
      return before + '\n\n' + RELATED_VARIANTS_HEADING + '\n\n' + content + '\n\n' + after;
    }
    return before + '\n\n' + RELATED_VARIANTS_HEADING + '\n\n' + content + '\n';
  }

  // Fallback: insert before ## AI Review if present.
  const aiIdx = findExactHeading(lines, AI_REVIEW_HEADING_LINE);
  if (aiIdx >= 0) {
    const before = lines.slice(0, aiIdx).join('\n').replace(/\n+$/, '');
    const after = lines.slice(aiIdx).join('\n').replace(/^\n+/, '');
    return before + '\n\n' + RELATED_VARIANTS_HEADING + '\n\n' + content + '\n\n' + after;
  }

  // Final fallback: append at EOF.
  const trimmedBody = body.replace(/\n+$/, '');
  return trimmedBody + '\n\n' + RELATED_VARIANTS_HEADING + '\n\n' + content + '\n';
}

/**
 * Find the line index that is an EXACT literal match for the given heading.
 * Not a regex/prefix match — '## Related Variants Extra' must NOT match.
 */
function findExactHeading(lines: string[], heading: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === heading) return i;
  }
  return -1;
}

/**
 * Find the next H2 heading after a given start index. Returns the line index
 * of the next `## ` heading, or `lines.length` if none found (meaning: section
 * extends to EOF).
 */
function findNextH2(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) return i;
  }
  return lines.length;
}
