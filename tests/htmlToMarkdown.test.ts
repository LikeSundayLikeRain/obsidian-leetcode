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
