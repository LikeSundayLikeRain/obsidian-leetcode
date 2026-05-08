// src/notes/htmlToMarkdown.ts
// Pure HTML → Markdown transform for LC problem content.
//
// Design invariants (D-20, D-21, D-02):
//   - Determinism: identical input → byte-identical output across any number of
//     invocations. Module-scoped singleton is safe because TurndownService has
//     no per-call mutable state once configured. The custom rules below read
//     only from the current node (no module-level counters or accumulators).
//   - codeBlockStyle: 'fenced' (NOT the default 'indented' — see Pitfall 2).
//     Turndown's built-in fencedCodeBlock rule already extracts the `language-X`
//     class from nested <code>, so LC's <pre><code class="language-python"> → ```python.
//   - `service.escape = (text) => text`: disable turndown's default escape pass
//     (assumption A2). LC content flows INTO a Markdown file, not INTO the DOM —
//     there is no XSS vector, and turndown's default escapes mangle LaTeX `\(…\)`
//     sequences that Obsidian would otherwise render correctly (D-20 LaTeX rule).
//     The new `lc-sup` / `lc-sub` / `lc-example-block` rules emit math delimiters
//     (`$...$`) and fence delimiters (```` ``` ````) that this identity escape
//     preserves verbatim — REMOVING the identity would corrupt their output.
//   - Custom `lc-image` rule: emit `![alt](src)` for <img>. No download; LC CDN
//     URLs are left as-is (offline-degrades — tracked as deferred for Phase 5).
//   - Custom `lc-sup` / `lc-sub` rules (GAP-2c): convert `<sup>X</sup>` to
//     `$^{X}$` and `<sub>X</sub>` to `$_{X}$` (Obsidian math-mode caret /
//     underscore form). Replaces the prior `keep(['sub','sup'])` pass-through
//     so exponents like `10<sup>9</sup>` render as true superscripts in
//     Obsidian preview instead of leaking literal HTML into the source view.
//   - Custom `lc-example-block` rule (GAP-2b): detects LC's styled Input/Output
//     example pattern (`<pre>` with <strong>-wrapped labels OR any <pre> NOT
//     containing `<code class="language-*">`) and emits a fenced `text` block.
//     Filter defers to the built-in fencedCodeBlock rule for real language
//     code blocks so `<pre><code class="language-python">` stays ```python.
//   - `keep(['kbd','var'])`: pass-through LC's occasional inline HTML for
//     keyboard/variable markers verbatim. `<sub>` / `<sup>` moved to custom
//     rules above.
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

  // Pass through LC's kbd/var inline HTML verbatim. `<sub>` / `<sup>` moved to
  // the lc-sub / lc-sup custom rules below (GAP-2c).
  service.keep(['kbd', 'var']);

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

  // GAP-2c: <sup>X</sup> → $^{X}$ (Obsidian math-mode caret form).
  // D-20 posture: consistent with LaTeX preservation — caret form renders as
  // true superscript inside Obsidian's $...$ delimiters. Handles arbitrary
  // expressions (digits, letters, multi-char like `i+1`). Empty <sup></sup>
  // collapses to empty string for readability (Test 10 default).
  service.addRule('lc-sup', {
    filter: 'sup',
    replacement: (content) => {
      const inner = content.trim();
      if (!inner) return '';
      return `$^{${inner}}$`;
    },
  });

  // GAP-2c: <sub>X</sub> → $_{X}$ (Obsidian math-mode underscore form).
  service.addRule('lc-sub', {
    filter: 'sub',
    replacement: (content) => {
      const inner = content.trim();
      if (!inner) return '';
      return `$_{${inner}}$`;
    },
  });

  // GAP-2b: LC's styled example blocks (a <pre> containing <strong>Input:</strong>
  // / <strong>Output:</strong> labels, usually preceded by
  // <p><strong class="example">Example N:</strong></p>) render as flat paragraphs
  // under turndown's defaults. Emit them as fenced code blocks with the `text`
  // language hint so monospace + visual separation survive the conversion.
  //
  // Detection: any <pre> whose firstElementChild is NOT a <code> with class
  // matching /language-/. Real code blocks (e.g. lc-regex fixture's
  // <pre><code class="language-python">) fall through to the built-in
  // fencedCodeBlock rule unchanged.
  //
  // Determinism: reads only node.textContent for the current node — no shared
  // state, no per-call counters. textContent is stable for identical input.
  service.addRule('lc-example-block', {
    filter: (node) => {
      if (node.nodeName !== 'PRE') return false;
      const el = node as unknown as {
        firstElementChild: { nodeName?: string; className?: string } | null;
      };
      const child = el.firstElementChild;
      if (
        child &&
        child.nodeName === 'CODE' &&
        typeof child.className === 'string' &&
        /language-/.test(child.className)
      ) {
        return false;
      }
      return true;
    },
    replacement: (_content, node) => {
      // Read the raw text content of the <pre>. This strips all child-tag
      // structure (including <strong> wrappers around Input:/Output:/Explanation:)
      // and keeps newlines verbatim. Normalise CRLF for cross-platform
      // determinism and trim trailing whitespace so the closing fence lands on
      // its own line.
      const el = node as unknown as { textContent?: string | null };
      const text = (el.textContent ?? '').replace(/\r\n/g, '\n').trimEnd();
      if (!text) return '';
      return `\n\n\`\`\`text\n${text}\n\`\`\`\n\n`;
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
