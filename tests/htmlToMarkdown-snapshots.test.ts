import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToMarkdown } from '../src/notes/htmlToMarkdown';

function fx(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
}

describe('htmlToMarkdown fixture snapshots (NOTE-02)', () => {
  it('two-sum fixture produces stable Markdown', () => {
    expect(htmlToMarkdown(fx('lc-two-sum.html'))).toMatchSnapshot();
  });
  it('median fixture produces stable Markdown', () => {
    expect(htmlToMarkdown(fx('lc-median.html'))).toMatchSnapshot();
  });
  it('regex fixture produces stable Markdown with fenced Python block', () => {
    const md = htmlToMarkdown(fx('lc-regex.html'));
    expect(md).toMatchSnapshot();
    expect(md).toContain('```python');
  });

  // GAP-2b smoke check — a future refactor that silently reverts the
  // lc-example-block rule would leave **Input:** / **Output:** flat
  // paragraphs in the two-sum output. This guard fails loudly in that case
  // without requiring snapshot inspection.
  it('two-sum snapshot contains a ```text fence block (GAP-2b smoke check)', () => {
    const md = htmlToMarkdown(fx('lc-two-sum.html'));
    expect(md).toContain('```text');
    expect(md).not.toContain('**Input:**');
  });

  // GAP-2c / GAP-2c-2 smoke check — the two-sum fixture wraps every constraint
  // expression in <code>...<sup>...</sup>...</code>, so after GAP-2c-2 those
  // reach the snapshot as literal HTML passthrough (<code>...10<sup>4</sup>...</code>)
  // rather than backtick-wrapped `10$^{4}$` math. Both paths preserve the
  // superscript — passthrough renders it in Obsidian reading view; the old
  // backtick path suppressed it. This guard catches silent reversion of
  // EITHER the lc-code-with-children rule (would lose the literal <code>)
  // or the lc-sup rule (would leave bare <sup> elsewhere).
  it('two-sum snapshot preserves <sup> inside <code> as literal HTML (GAP-2c-2 smoke check)', () => {
    const md = htmlToMarkdown(fx('lc-two-sum.html'));
    // Constraints are all wrapped in <code>...<sup>...</sup>...</code>, so
    // they stay as literal HTML passthrough (GAP-2c-2).
    expect(md).toContain('<code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code>');
    expect(md).toContain('<sup>9</sup>');
    // Final output must not contain any lc-sup-generated math *outside* a
    // <code> passthrough — there are no bare <sup> elements in two-sum.
    expect(md).not.toContain('10$^{4}$');
    expect(md).not.toContain('10$^{9}$');
  });
});
