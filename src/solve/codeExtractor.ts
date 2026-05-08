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

export interface ExtractedCode {
  lang: string | null;
  code: string;
}

export function extractFirstFencedBlock(noteBody: string): ExtractedCode | null {
  const lines = noteBody.split('\n');
  let i = 0;
  while (i < lines.length) {
    const openMatch = FENCE_OPEN.exec(lines[i] ?? '');
    if (openMatch) {
      const lang = openMatch[1] ?? '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      if (i >= lines.length) return null; // unclosed fence
      return { lang: lang.length > 0 ? lang : null, code: codeLines.join('\n') };
    }
    i++;
  }
  return null;
}
