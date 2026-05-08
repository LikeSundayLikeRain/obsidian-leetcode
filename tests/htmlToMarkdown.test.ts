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

describe('htmlToMarkdown — sup/sub (GAP-2c, NOTE-02)', () => {
  it('converts <sup>2</sup> to $^{2}$ (caret form)', () => {
    expect(htmlToMarkdown('<p>O(n<sup>2</sup>)</p>')).toBe('O(n$^{2}$)');
  });

  it('converts <sup>9</sup> in a constraint-style expression', () => {
    expect(htmlToMarkdown('<p>10<sup>9</sup></p>')).toBe('10$^{9}$');
  });

  it('handles arbitrary <sup> expressions (multi-char)', () => {
    expect(htmlToMarkdown('<p>x<sup>i+1</sup></p>')).toBe('x$^{i+1}$');
  });

  it('converts <sub>2</sub> to $_{2}$ (underscore form)', () => {
    expect(htmlToMarkdown('<p>H<sub>2</sub>O</p>')).toBe('H$_{2}$O');
  });

  it('handles arbitrary <sub> expressions (multi-char)', () => {
    expect(htmlToMarkdown('<p>a<sub>n-1</sub></p>')).toBe('a$_{n-1}$');
  });

  it('drops empty <sup></sup> (Test 10 — readability default)', () => {
    // Documented behavior: empty sup/sub is skipped rather than emitting `$^{}$`.
    expect(htmlToMarkdown('<p>x<sup></sup></p>')).toBe('x');
  });
});

describe('htmlToMarkdown — <code> with nested tags (GAP-2c-2, NOTE-02)', () => {
  // GAP-2c-2: <code> containing nested tags (e.g., <sup>) is emitted as literal
  // HTML so Obsidian reading view renders the superscript inside monospace
  // styling. The previous GAP-2c fix alone left `$^{2}$` math leaking through
  // backtick-wrapped code, where inline-code rules suppress all nested
  // formatting.
  it('lc-code-with-children: <code>O(n<sup>2</sup>)</code> → literal HTML passthrough', () => {
    const out = htmlToMarkdown('<code>O(n<sup>2</sup>)</code>');
    expect(out.trim()).toBe('<code>O(n<sup>2</sup>)</code>');
  });

  it('lc-code-with-children: <code> with only text still uses backticks (no regression)', () => {
    const out = htmlToMarkdown('<code>nums[i]</code>');
    expect(out.trim()).toBe('`nums[i]`');
  });

  it('lc-code-with-children: <code> with nested <sub>', () => {
    const out = htmlToMarkdown('<code>a<sub>i</sub></code>');
    expect(out.trim()).toBe('<code>a<sub>i</sub></code>');
  });

  it('lc-code-with-children: plain <sup> outside <code> still uses math form (no regression)', () => {
    const out = htmlToMarkdown('<p>complexity is O(n<sup>2</sup>)</p>');
    expect(out).toContain('$^{2}$');
    expect(out).not.toContain('<sup>');
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
