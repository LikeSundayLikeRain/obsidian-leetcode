// tests/notes/htmlToMarkdown-fenced.test.ts
//
// Phase 06 Plan 05 (gap closure) — Locks the fenced-code-block contract for
// the LC HTML → Markdown pipeline. The pipeline is ALREADY correct
// (`codeBlockStyle: 'fenced'`, `lc-example-block` rule, `reshapeShapeBExamples`
// post-pass) — this test is purely a regression guard that fails CI if any
// future executor flips the contract back to `indented` or removes the
// LC-specific Shape A / Shape B handling.
//
// Why it matters: the preview tab's reading-mode parity (06-UAT.md gap #1)
// depends on examples rendering as fenced grey code blocks instead of bare
// prose. Test-only — `src/notes/htmlToMarkdown.ts` is byte-identical pre-
// and post-plan.
//
// Mirrors the import shape of tests/notes/NoteWriter.starter-retrofit.test.ts
// minus the Obsidian mock: `htmlToMarkdown` imports ONLY from 'turndown' per
// the source file header comment, so no vi.mock('obsidian', ...) is needed.

import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../../src/notes/htmlToMarkdown';

describe('htmlToMarkdown — fenced code-block contract (gap closure 06-05)', () => {
  it('Shape A LC example wraps the example body in a ```text fenced block', () => {
    // Real LC example shape (Two Sum). The body is wrapped in a single <pre>
    // with bold Input:/Output:/Explanation: labels.
    const html = [
      '<p><strong class="example">Example 1:</strong></p>',
      '<pre><strong>Input:</strong> nums = [2,7,11,15], target = 9\n',
      '<strong>Output:</strong> [0,1]\n',
      '<strong>Explanation:</strong> Because nums[0] + nums[1] == 9, we return [0, 1].</pre>',
    ].join('');

    const md = htmlToMarkdown(html);

    // The example body must live inside a fenced ```text ... ``` block —
    // anchoring loosely via a regex because surrounding bold text and
    // whitespace are out of scope for this contract.
    expect(md).toMatch(/```text\n[\s\S]+?\n```/);
    expect(md).toContain('Input: nums = [2,7,11,15], target = 9');
    expect(md).toContain('Output: [0,1]');
    // Locks the absence of the four-space indented form (the historical
    // turndown default that breaks Obsidian's reading-mode parity).
    expect(md).not.toMatch(/^ {4}Input:/m);
  });

  it('Real-language fenced block (<code class="language-python">) emits ```python (defers to fencedCodeBlock)', () => {
    // The lc-example-block rule's filter must DEFER to the built-in
    // fencedCodeBlock rule when the <pre> wraps a <code class="language-X">
    // — otherwise we'd accidentally double-fence Python code in `text`.
    const html = '<pre><code class="language-python">def f():\n    pass</code></pre>';

    const md = htmlToMarkdown(html);

    expect(md).toMatch(/```python\n[\s\S]*?def f\(\):[\s\S]*?\n```/);
    // Must NOT have been routed through the lc-example-block rule.
    expect(md).not.toMatch(/```text\n[\s\S]*?def f/);
  });

  it('LC <pre> output never begins with four spaces (locks codeBlockStyle: "fenced")', () => {
    // Defensive — if a future executor flips the turndown ctor option back
    // to the default `indented` style, every LC example would leak
    // four-space prose. This is the explicit regression guard.
    const html = '<pre>just a one-line example</pre>';

    const md = htmlToMarkdown(html);

    // The output for any <pre> content must start with ``` (or surrounding
    // newlines + ```) — never four spaces of indentation.
    expect(md.trimStart()).toMatch(/^```/);
    expect(md).not.toMatch(/^ {4}just a one-line/m);
  });

  it('Shape B LC examples (consecutive bold label paragraphs) collapse into a single ```text block', () => {
    // Shape B is the post-turndown collapse handled by reshapeShapeBExamples
    // — there is no <pre> in the source HTML, just consecutive <p> tags
    // with inline <strong> labels (observed on Problem 65 "Valid Number").
    const html = [
      '<p><strong>Example 1:</strong></p>',
      '<p><strong>Input:</strong> s = "0"</p>',
      '<p><strong>Output:</strong> true</p>',
    ].join('');

    const md = htmlToMarkdown(html);

    // A single fenced text block must contain BOTH the Input and Output
    // labels (collapsed by the post-pass).
    expect(md).toMatch(/```text\n[\s\S]*?Input: s = "0"[\s\S]*?Output: true[\s\S]*?\n```/);
    // The bold "Example 1:" heading stays as bold text outside the fence.
    expect(md).toContain('**Example 1:**');
  });
});
