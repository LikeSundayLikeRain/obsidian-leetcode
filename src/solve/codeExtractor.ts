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
//
// Phase 21 Plan 21-03 (D-extract-01) — frontmatter-source dispatch:
//   When the located fence opener is ```leetcode-solve, the lang field is
//   sourced from the optional `frontmatter['lc-language']` arg (the v1.3
//   canonical SSoT). When the located fence is any other tag (legacy LC
//   fence, ```text, ```bash, …), behavior is preserved verbatim — the
//   fence tag wins regardless of frontmatter.
//
//   This makes codeExtractor the SINGLE codepath that reads language for
//   Run/Submit/AI-Debug/AI-Review (D-extract-02). Phase 22 deletes the
//   legacy fence-tag branch when `useInlineWidget=ON` becomes the default
//   and all production notes use the v1.3 fence opener.

const FENCE_OPEN = /^```([a-zA-Z0-9_+#-]*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const CODE_HEADING = /^## Code\s*$/;
const SECTION_BOUNDARY = /^## \S/;

/**
 * Phase 21 Plan 21-03 — matches the v1.3 fence opener exactly. Mirrors
 * `LC_OPENER_RE` in `src/widget/fenceSerialization.ts` (kept inline here to
 * keep this module dependency-free per the purity contract). Used to
 * dispatch between the frontmatter-sourced lang (Branch A/B) and the
 * legacy fence-tag lang (Branch C).
 */
const LC_OPENER_TAG = 'leetcode-solve';

export interface ExtractedCode {
  lang: string | null;
  code: string;
}

/**
 * Extracts the first fenced code block within the note.
 *
 * Preference order:
 *   1. If a `## Code` heading exists, extract the first fenced block between
 *      that heading and the next `## ` section heading (or EOF). If no fence
 *      is found in that section, return null — the `## Code` heading declares
 *      intent, and we must NOT fall back to fences inside other sections
 *      (e.g., ```text example blocks in `## Problem`).
 *   2. If no `## Code` heading exists, fall back to the first fence anywhere
 *      in the body — preserves compatibility with notes that don't use the
 *      standard schema.
 *
 * Phase 21 Plan 21-03 (D-extract-01) three-branch dispatch:
 *   - Branch A — fence tag === 'leetcode-solve' AND
 *               `frontmatter['lc-language']` is a non-empty string →
 *               return { lang: frontmatter['lc-language'], code }.
 *   - Branch B — fence tag === 'leetcode-solve' AND `lc-language` missing/
 *               empty → return { lang: null, code }. Caller's
 *               `resolveLangSlug(null, defaultLang)` handles the fallback.
 *   - Branch C — fence tag !== 'leetcode-solve' (legacy LC fence, non-LC
 *               fence, untagged ``` opener) → return
 *               { lang: fenceTag ?? null, code }. Verbatim legacy behavior;
 *               frontmatter is ignored on non-leetcode-solve fences. This
 *               preserves Run/Submit on unmigrated v1.0/v1.1/v1.2 notes
 *               during the v1.3 transition window.
 *
 * The `frontmatter` arg is OPTIONAL — undefined falls through to Branch C
 * for full backward compatibility with callers that haven't been updated.
 *
 * Per D-extract-02, this is the SINGLE codepath for Run/Submit language
 * derivation in v1.3. No consumer should add a parallel
 * `metadataCache.getFileCache(file)?.frontmatter?.['lc-language']` shortcut
 * for code-execution dispatch (chevron + frontmatter-write paths are
 * separate concerns and out of scope).
 */
export function extractFirstFencedBlock(
  noteBody: string,
  frontmatter?: { 'lc-language'?: string },
): ExtractedCode | null {
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
    return extractFromRange(lines, codeHeadingIdx + 1, sectionEnd, frontmatter);
  }
  return extractFromRange(lines, 0, lines.length, frontmatter);
}

function extractFromRange(
  lines: string[],
  start: number,
  end: number,
  frontmatter: { 'lc-language'?: string } | undefined,
): ExtractedCode | null {
  let i = start;
  while (i < end) {
    const openMatch = FENCE_OPEN.exec(lines[i] ?? '');
    if (openMatch) {
      const fenceTag = openMatch[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < end && !FENCE_CLOSE.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      if (i >= end) return null; // unclosed fence within range
      const code = codeLines.join('\n');
      // Phase 21 Plan 21-03 (D-extract-01) — three-branch dispatch.
      if (fenceTag === LC_OPENER_TAG) {
        // Branches A + B: leetcode-solve fence; frontmatter is the SSoT.
        const fmLang = frontmatter?.['lc-language'];
        const lang = typeof fmLang === 'string' && fmLang.length > 0 ? fmLang : null;
        return { lang, code };
      }
      // Branch C: legacy fence / non-LC fence / untagged. Verbatim behavior —
      // frontmatter is ignored to preserve transition-window correctness on
      // unmigrated notes (legacy ```python keeps lang='python' even when the
      // user has manually set lc-language to a different value via the
      // chevron; the fence-tag remains the SSoT until migration runs).
      return { lang: fenceTag.length > 0 ? fenceTag : null, code };
    }
    i++;
  }
  return null;
}
