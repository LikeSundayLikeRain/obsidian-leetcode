import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../src/notes/htmlToMarkdown';

describe('htmlToMarkdown (NOTE-02, D-20, D-21)', () => {
  it('converts <pre><code class="language-python">...</code></pre> to a fenced ```python block', () => {
    const html = `<pre><code class="language-python">def f(): return 1</code></pre>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('```python');
    expect(md).toContain('def f(): return 1');
    expect(md).toMatch(/```[\s\S]*```/);
  });

  it('preserves <img> tags as ![alt](url)', () => {
    const html = `<p><img src="https://assets.leetcode.com/uploads/foo.png" alt="foo"></p>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('![foo](https://assets.leetcode.com/uploads/foo.png)');
  });

  it('produces empty string for empty input (D-21: write what we got)', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('   ')).toBe('');
  });

  it('does not contain any HTML tags in the output', () => {
    const html = `<p>Hello <strong>world</strong></p>`;
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/<[a-z]/i);
    expect(md).toContain('world');
  });
});

describe('htmlToMarkdown — sup/sub (GAP-2c-3, NOTE-02)', () => {
  // GAP-2c-3: <sup>/<sub> emit Unicode characters (U+00B2, U+2070..2079, etc.).
  // Chosen over the prior `$^{X}$` math form because Unicode renders identically
  // in edit view, reading view, and inside inline `<code>`/backticks —
  // whereas math-mode `$^{X}$` does not render inside backticks.
  it('converts <sup>2</sup> to Unicode superscript ²', () => {
    expect(htmlToMarkdown('<p>O(n<sup>2</sup>)</p>')).toBe('O(n²)');
  });

  it('converts <sup>9</sup> in a constraint-style expression', () => {
    expect(htmlToMarkdown('<p>10<sup>9</sup></p>')).toBe('10⁹');
  });

  it('converts multi-digit <sup>31</sup> to Unicode ³¹', () => {
    expect(htmlToMarkdown('<p>2<sup>31</sup></p>')).toBe('2³¹');
  });

  it('handles mappable multi-char <sup>i+1</sup> to Unicode ⁱ⁺¹', () => {
    expect(htmlToMarkdown('<p>x<sup>i+1</sup></p>')).toBe('xⁱ⁺¹');
  });

  it('falls back to ^{...} plain text when any character is unmappable', () => {
    // `_` has no Unicode superscript glyph — entire string falls back.
    expect(htmlToMarkdown('<p>x<sup>foo_bar</sup></p>')).toBe('x^{foo_bar}');
  });

  it('converts <sub>2</sub> to Unicode subscript ₂', () => {
    expect(htmlToMarkdown('<p>H<sub>2</sub>O</p>')).toBe('H₂O');
  });

  it('converts <sub>i</sub> to Unicode ᵢ', () => {
    expect(htmlToMarkdown('<p>a<sub>i</sub></p>')).toBe('aᵢ');
  });

  it('handles mappable multi-char <sub>n-1</sub> to Unicode ₙ₋₁', () => {
    expect(htmlToMarkdown('<p>a<sub>n-1</sub></p>')).toBe('aₙ₋₁');
  });

  it('falls back to _{...} plain text when any subscript character is unmappable', () => {
    // `b` has no Unicode subscript glyph — entire string falls back.
    expect(htmlToMarkdown('<p>x<sub>b</sub></p>')).toBe('x_{b}');
  });

  it('drops empty <sup></sup> (readability default)', () => {
    expect(htmlToMarkdown('<p>x<sup></sup></p>')).toBe('x');
  });

  it('drops empty <sub></sub> (readability default)', () => {
    expect(htmlToMarkdown('<p>x<sub></sub></p>')).toBe('x');
  });

  it('renders <code>O(n<sup>2</sup>)</code> as backtick-wrapped Unicode', () => {
    // With Unicode sup/sub the backtick path works cleanly: the superscript is
    // a literal character inside backticks, not a math-mode delimiter that
    // would leak through.
    const out = htmlToMarkdown('<code>O(n<sup>2</sup>)</code>');
    expect(out.trim()).toBe('`O(n²)`');
  });

  it('renders <code>a<sub>i</sub></code> as backtick-wrapped Unicode', () => {
    const out = htmlToMarkdown('<code>a<sub>i</sub></code>');
    expect(out.trim()).toBe('`aᵢ`');
  });

  it('<code> with only text still uses backticks (no regression)', () => {
    const out = htmlToMarkdown('<code>nums[i]</code>');
    expect(out.trim()).toBe('`nums[i]`');
  });

  it('plain <sup> outside <code> still emits Unicode (no regression)', () => {
    const out = htmlToMarkdown('<p>complexity is O(n<sup>2</sup>)</p>');
    expect(out).toContain('²');
    expect(out).not.toContain('<sup>');
    expect(out).not.toContain('$^{');
  });
});

describe('htmlToMarkdown — example blocks (GAP-2b, NOTE-02)', () => {
  it('emits an LC Input/Output <pre> block as a ```text-fenced code block', () => {
    const html =
      '<pre><strong>Input:</strong> nums = [2,7,11,15]\n<strong>Output:</strong> [0,1]</pre>';
    const md = htmlToMarkdown(html);
    // Must open with ```text and close with ```
    expect(md).toMatch(/```text[\s\S]*```/);
    // Must include the literal Input/Output labels (stripped of <strong>, no ** bold)
    expect(md).toContain('Input: nums = [2,7,11,15]');
    expect(md).toContain('Output: [0,1]');
    // No Markdown bold asterisks leaking into the fenced content
    expect(md).not.toContain('**Input:**');
    expect(md).not.toContain('**Output:**');
  });

  it('lets <pre><code class="language-python"> fall through to the built-in fenced python block', () => {
    const html = '<pre><code class="language-python">def isMatch():\n    return True</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```python');
    expect(md).not.toContain('```text');
  });

  it('does NOT fire on inline <code> — only on <pre>', () => {
    const html = '<p>Use <code>nums[i]</code> carefully.</p>';
    const md = htmlToMarkdown(html);
    expect(md).toBe('Use `nums[i]` carefully.');
    expect(md).not.toContain('```');
  });
});
