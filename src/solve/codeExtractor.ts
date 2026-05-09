// src/solve/codeExtractor.ts
//
// Pure string transform: given a note body, returns the FIRST fenced code
// block's language tag + content, or null.
//
// Purity:
//   - No captured state.
//   - Same input → same output.
//   - No imports (beyond types if any).
//   - Safe inside `vault.process` retry.
//
// Contract (CONTEXT D-01, D-04, RESEARCH § "First-fenced-block extraction"):
//   - "First" means the topmost ``` fence anywhere in the body — not scoped to
//     a heading. This matches the retrofit / on-demand insertion target
//     (under `## Code`) without depending on heading presence, and keeps
//     extraction tolerant of note edits.
//   - Unclosed fences return null (treat as no valid block).
//   - An empty fence tag ('```') returns lang: null — caller resolves the
//     default via languages.ts resolveLangSlug(null, defaultLang).
//   - Fence tag may contain [a-zA-Z0-9_+#-] to support `c++`, `c#` — caller
//     normalizes to LC's canonical slugs.

const FENCE_OPEN = /^```([a-zA-Z0-9_+#-]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const CODE_HEADING = /^## Code\s*$/;
const SECTION_BOUNDARY = /^## \S/;

export interface ExtractedCode {
  lang: string | null;
  code: string;
}

/**
 * Extracts the first fenced code block within the note.
 *
 * Preference order:
 *   1. If a `## Code` heading exists, extract the first fenced block between
 *      that heading and the next `## ` section heading (or EOF). This scopes
 *      extraction to the user's solution, not to fenced examples inside the
 *      `## Problem` description (Phase 3 UAT fix).
 *   2. Fall back to the first fenced block anywhere in the body, preserving
 *      compatibility with notes that don't have a `## Code` heading yet.
 */
export function extractFirstFencedBlock(noteBody: string): ExtractedCode | null {
  const lines = noteBody.split('\n');
  const codeHeadingIdx = lines.findIndex((ln) => CODE_HEADING.test(ln));
  if (codeHeadingIdx >= 0) {
    let sectionEnd = lines.length;
    for (let j = codeHeadingIdx + 1; j < lines.length; j++) {
      if (SECTION_BOUNDARY.test(lines[j] ?? '')) {
        sectionEnd = j;
        break;
      }
    }
    const scoped = extractFromRange(lines, codeHeadingIdx + 1, sectionEnd);
    if (scoped) return scoped;
  }
  return extractFromRange(lines, 0, lines.length);
}

function extractFromRange(lines: string[], start: number, end: number): ExtractedCode | null {
  let i = start;
  while (i < end) {
    const openMatch = FENCE_OPEN.exec(lines[i] ?? '');
    if (openMatch) {
      const lang = openMatch[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < end && !FENCE_CLOSE.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      if (i >= end) return null; // unclosed fence within range
      return { lang: lang.length > 0 ? lang : null, code: codeLines.join('\n') };
    }
    i++;
  }
  return null;
}
