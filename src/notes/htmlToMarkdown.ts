// src/notes/htmlToMarkdown.ts
// Pure HTML → Markdown transform for LC problem content.
//
// Design invariants (D-20, D-21, D-02):
//   - Determinism: identical input → byte-identical output across any number of
//     invocations. Module-scoped singleton is safe because TurndownService has
//     no per-call mutable state once configured.
//   - codeBlockStyle: 'fenced' (NOT the default 'indented' — see Pitfall 2).
//     Turndown's built-in fencedCodeBlock rule already extracts the `language-X`
//     class from nested <code>, so LC's <pre><code class="language-python"> → ```python.
//   - `service.escape = (text) => text`: disable turndown's default escape pass
//     (assumption A2). LC content flows INTO a Markdown file, not INTO the DOM —
//     there is no XSS vector, and turndown's default escapes mangle LaTeX `\(…\)`
//     sequences that Obsidian would otherwise render correctly (D-20 LaTeX rule).
//   - Custom `lc-image` rule: emit `![alt](src)` for <img>. No download; LC CDN
//     URLs are left as-is (offline-degrades — tracked as deferred for Phase 5).
//   - `keep(['sub','sup','kbd','var'])`: pass-through LC's occasional inline
//     HTML for math/superscripts/subscripts so they reach the file verbatim.
//
// CRITICAL: This module imports ONLY from 'turndown'. No Obsidian imports, no
// logger import. The caller (NoteWriter, Plan 03) logs a debug warning on empty
// output per D-21.

import TurndownService from 'turndown';

let cachedService: TurndownService | null = null;

function getService(): TurndownService {
  if (cachedService) return cachedService;

  const service = new TurndownService({
    codeBlockStyle: 'fenced',
    fence: '```',
    headingStyle: 'atx',
    bulletListMarker: '-',
    hr: '---',
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  // Pass through LC's sub/sup/kbd/var inline HTML so exponents like `10<sup>9</sup>`
  // survive the conversion verbatim. Obsidian renders raw inline HTML inside
  // Markdown without trouble.
  service.keep(['sub', 'sup', 'kbd', 'var']);

  // Custom <img> handler — LC content includes diagram images with CDN URLs.
  // Emit `![alt](src)` and skip <img> entirely if src is empty.
  service.addRule('lc-image', {
    filter: 'img',
    replacement: (_content, node) => {
      // `node` is typed as `Node` by turndown's d.ts but is a real Element at runtime.
      const el = node as unknown as {
        getAttribute: (name: string) => string | null;
      };
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      if (!src) return '';
      return `![${alt}](${src})`;
    },
  });

  // Disable turndown's default escape pass. See D-20 LaTeX preservation + A2 in
  // the Assumptions Log. The escape pass otherwise turns `\(` into `\\(`, which
  // breaks Obsidian's MathJax rendering. Output flows to a file (not the DOM)
  // so there is no XSS concern.
  service.escape = (text: string) => text;

  cachedService = service;
  return service;
}

/**
 * Convert a string of HTML to Markdown.
 *
 * Empty / whitespace-only input → empty string (D-21: don't crash).
 * Turndown throwing → empty string (D-21: write what we got; caller decides to
 * log / retry / surface).
 */
export function htmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || html.trim() === '') return '';
  try {
    return getService().turndown(html).trim();
  } catch {
    return '';
  }
}
