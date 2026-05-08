// src/notes/HeadingRegion.ts
// Pure string transform for rewriting the `## Problem` region of a problem note.
//
// Ownership model (D-08):
//   - Plugin owns ONLY the `## Problem` body — from the `## Problem` heading line
//     to the line before the NEXT `## ` heading (same-level H2 only — H3 doesn't
//     close the region) or EOF.
//   - If `## Problem` is renamed or missing, the plugin re-inserts a fresh
//     `## Problem` block at the TOP of the body (above the first `## `
//     heading if any — typically `## Notes`; otherwise at EOF). The user's
//     renamed section is left untouched (D-09 clarified).
//
// Purity (Pitfall 4):
//   - No captured mutable state.
//   - Same (current, newMarkdown) → same return value.
//   - Safe to pass as the callback to Obsidian's `vault.process`, which may
//     silently retry the callback on a write conflict.
//
// This module imports NOTHING — it is a string-in/string-out helper. The caller
// owns the Obsidian integration.

/** Exact string the rewriter searches for. MUST match buildNoteBody() output. */
export const PROBLEM_HEADING_LINE = '## Problem' as const;

/**
 * Replace the `## Problem` section with the fresh Markdown, preserving everything else.
 *
 * @param current - full file body (between frontmatter delimiters is already stripped by
 *                  Obsidian's `vault.process`; `current` here is the post-frontmatter body
 *                  OR the entire file depending on the caller). This function is agnostic —
 *                  it line-scans for `## Problem` wherever it appears.
 * @param newMarkdown - the fresh Markdown body (without the heading — the function
 *                      emits `## Problem\n${newMarkdown}` itself).
 * @returns rewritten content.
 */
export function rewriteProblemSection(current: string, newMarkdown: string): string {
  const lines = current.split('\n');

  // Step 1: locate the `## Problem` heading, if present.
  let problemStart = -1;
  let problemEnd = lines.length;  // exclusive upper bound (EOF sentinel)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === PROBLEM_HEADING_LINE) {
      problemStart = i;
      // Find next H2 heading to close the region (H3/H4/H5 do NOT close it).
      problemEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^## /.test(lines[j] ?? '')) {
          problemEnd = j;
          break;
        }
      }
      break;
    }
  }

  const trimmedNew = newMarkdown.trim();
  const newBlock = `${PROBLEM_HEADING_LINE}\n${trimmedNew}\n\n`;

  if (problemStart >= 0) {
    // Heading found — splice out the old region, insert the new block in place.
    const before = lines.slice(0, problemStart).join('\n');
    const after = lines.slice(problemEnd).join('\n');
    // Glue logic: if `before` is empty, no leading newline; if `before` ends
    // mid-line (rare), ensure a newline.
    const leadingGlue = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    return `${before}${leadingGlue}${newBlock}${after}`;
  }

  // Heading missing (or renamed — D-09 treats rename identically to missing):
  // insert the `## Problem` block ABOVE the first `## ` heading if any (typically
  // `## Notes` or the user's renamed section), else at the top of the body
  // (skipping any leading frontmatter delimiters the caller might have left in).

  let insertAt = 0;

  // Skip past a leading frontmatter block if present.
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        insertAt = i + 1;
        break;
      }
    }
  }

  // Skip leading blank lines.
  while (insertAt < lines.length && (lines[insertAt] ?? '').trim() === '') {
    insertAt++;
  }

  // Find the first same-level H2 to insert BEFORE.
  let insertionPoint = lines.length;
  for (let i = insertAt; i < lines.length; i++) {
    if (/^## /.test(lines[i] ?? '')) {
      insertionPoint = i;
      break;
    }
  }

  const head = lines.slice(0, insertionPoint).join('\n').replace(/\s*$/, '');
  const tail = lines.slice(insertionPoint).join('\n');
  const glue = head.length > 0 ? '\n\n' : '';
  return `${head}${glue}${newBlock}${tail}`;
}
