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
//     The new `lc-sup` / `lc-sub` / `lc-example-block` rules emit Unicode
//     superscript/subscript characters and fence delimiters (```` ``` ````)
//     that this identity escape preserves verbatim.
//   - Custom `lc-image` rule: emit `![alt](src)` for <img>. No download; LC CDN
//     URLs are left as-is (offline-degrades — tracked as deferred for Phase 5).
//   - Custom `lc-sup` / `lc-sub` rules (GAP-2c-3): convert `<sup>X</sup>` /
//     `<sub>X</sub>` to Unicode superscript / subscript characters
//     (U+00B2, U+2070..2079, U+2080..2089, etc.) via character-by-character
//     mapping. If ANY character in the content is not in the map, the whole
//     string falls back to a plain-text `^{X}` / `_{X}` form so readers still
//     see the intent. Unicode form renders identically in Obsidian edit view,
//     reading view, and inside inline `<code>`/`` ` `` — unlike the prior
//     `$^{X}$` math form, which didn't render inside backticks, and unlike
//     the prior `<code>…<sup>…</sup></code>` HTML passthrough, which Obsidian
//     stripped in both edit and reading modes.
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

/**
 * GAP-2c-3: Unicode superscript mapping. Covers digits, arithmetic operators,
 * parentheses, and the lowercase letters that have a defined Unicode
 * superscript glyph. Letters without a glyph (notably 'q') fall off the edge
 * and trigger the fallback branch in `mapScript`. Uppercase input is
 * lowercased before lookup so `<sup>A</sup>` still maps to `ᴬ` via the
 * lowercase `a` → `ᵃ` entry (LC never uses uppercase superscripts in
 * practice; lowercase is safe).
 */
const SUP_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
  'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
  'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
  'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
};

/**
 * GAP-2c-3: Unicode subscript mapping. Smaller than SUP_MAP because several
 * Latin letters (b, c, d, f, g, q, w, y, z) have no defined Unicode subscript
 * glyph. Any unmappable character triggers the fallback branch.
 */
const SUB_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

/**
 * Map every character in `content` through `table`. If any character is
 * missing from the table, return the plain-text fallback `{prefix}{content}`
 * (e.g. `^{foo_bar}` or `_{q}`). All-or-nothing posture so a mixed string
 * never half-renders: either all characters get their Unicode glyph, or the
 * entire string is wrapped in the fallback braces.
 *
 * Determinism: pure function of `content` + `table` + `fallbackPrefix`; no
 * shared state.
 */
function mapScript(
  content: string,
  table: Record<string, string>,
  fallbackPrefix: string,
): string {
  const mapped: string[] = [];
  for (const ch of content) {
    const lower = ch.toLowerCase();
    const m = table[lower] ?? table[ch];
    if (m === undefined) return `${fallbackPrefix}{${content}}`;
    mapped.push(m);
  }
  return mapped.join('');
}

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
  // the lc-sub / lc-sup custom rules below (GAP-2c-3).
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

  // GAP-2c-3: <sup>X</sup> → Unicode superscript characters (e.g. `²`, `ⁱ⁺¹`).
  // Empty <sup></sup> collapses to empty string for readability. Unmappable
  // content (e.g. `<sup>foo_bar</sup>` — `_` has no superscript glyph) falls
  // back to `^{foo_bar}` plain text.
  //
  // Why Unicode over the prior `$^{X}$` math form: Obsidian renders `$^{2}$`
  // as superscript ONLY outside inline code. Inside `` `O(n<sup>2</sup>)` ``
  // the math source would leak through verbatim because Markdown's inline-code
  // rule suppresses nested formatting. Unicode characters are plain text — no
  // delimiters, no rendering mode, same visual in edit view, reading view, and
  // inside backticks.
  service.addRule('lc-sup', {
    filter: 'sup',
    replacement: (content) => {
      const inner = content.trim();
      if (!inner) return '';
      return mapScript(inner, SUP_MAP, '^');
    },
  });

  // GAP-2c-3: <sub>X</sub> → Unicode subscript characters (e.g. `₂`, `ᵢ`).
  service.addRule('lc-sub', {
    filter: 'sub',
    replacement: (content) => {
      const inner = content.trim();
      if (!inner) return '';
      return mapScript(inner, SUB_MAP, '_');
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
 * GAP-2b-2: Reshape "Shape B" LC example blocks in the post-turndown Markdown.
 *
 * Background: LC serves example blocks in two HTML shapes. "Shape A" wraps the
 * labels in a single <pre> — handled by the lc-example-block turndown rule
 * above. "Shape B" (observed on Problem 65 "Valid Number") uses flat <p>
 * paragraphs with inline <strong> labels, no <pre> wrapper:
 *
 *     <p><strong>Example 1:</strong></p>
 *     <p><strong>Input:</strong> s = "0"</p>
 *     <p><strong>Output:</strong> true</p>
 *
 * Turndown converts this straightforwardly to:
 *
 *     **Example 1:**
 *
 *     **Input:** s = "0"
 *
 *     **Output:** true
 *
 * …which is a different visual treatment than Shape A's fenced ```text block.
 * This helper rewrites Shape B into Shape A's fenced form so both LC shapes
 * render identically in Obsidian:
 *
 *     **Example 1:**
 *
 *     ```text
 *     Input: s = "0"
 *     Output: true
 *     ```
 *
 * Detection is tight — we only collapse a run of 2+ consecutive lines matching
 * `**{Input|Output|Explanation}:** rest` separated only by blank lines. Stray
 * bolded text elsewhere (e.g. `**Note:** ...`) is left untouched. The
 * `**Example N:**` heading above the run stays intact as bold text outside the
 * fence (matches Shape A's visual convention).
 *
 * Why post-processing instead of a turndown rule: a single <p>-level turndown
 * rule cannot inspect following sibling <p> tags to know whether the run
 * qualifies as a Shape B example. Post-processing the full Markdown string
 * sees the full structure and avoids a heavy custom traversal.
 *
 * Determinism (D-20): pure string → string function. No RNG, no state, no
 * date/time, no iteration order dependence — byte-identical across any number
 * of calls with identical input.
 */
function reshapeShapeBExamples(md: string): string {
  // Matches ONE Shape B label line: `**{Label}:** value`, where Label is
  // exactly Input, Output, or Explanation (colon inside the bold, value on
  // the same line). Anchored at line-start, non-greedy to EOL.
  const LABEL_LINE = /^\*\*(Input|Output|Explanation):\*\*([^\n]*)$/;

  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i] ?? '';
    // Try to detect a run starting at line i.
    if (LABEL_LINE.test(current)) {
      // Collect consecutive label lines, allowing blank lines between them.
      const labelLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const candidate = lines[j] ?? '';
        const m = candidate.match(LABEL_LINE);
        if (m) {
          labelLines.push(`${m[1]}:${m[2]}`);
          j++;
          // Consume blank lines after a label line.
          while (j < lines.length && (lines[j] ?? '').trim() === '') j++;
          continue;
        }
        break;
      }

      // A run of 2+ labels qualifies as Shape B. `j` currently points past
      // trailing blank lines following the final label; we need to emit the
      // fence and then resume processing from `j`. Preserve ONE trailing blank
      // line after the closing fence so downstream block boundaries are sane
      // (markdown paragraph separation).
      if (labelLines.length >= 2) {
        out.push('```text');
        for (const line of labelLines) out.push(line);
        out.push('```');
        out.push(''); // single blank separator after the fence
        i = j;
        continue;
      }
      // Single stray label — leave it as plain bolded text (regression guard).
    }

    out.push(current);
    i++;
  }

  // Collapse at-most-one trailing blank line introduced by our emitter above
  // when the run already sat at end-of-input, to avoid drifting output length.
  while (
    out.length > 0 &&
    out[out.length - 1] === '' &&
    (out.length < 2 || out[out.length - 2] === '')
  ) {
    out.pop();
  }

  return out.join('\n');
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
    const raw = getService().turndown(html);
    return reshapeShapeBExamples(raw).trim();
  } catch {
    return '';
  }
}
