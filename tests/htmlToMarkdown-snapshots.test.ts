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

  // GAP-2c smoke check — catches silent reversion of the lc-sup rule.
  it('two-sum snapshot renders <sup> as $^{...}$ math (GAP-2c smoke check)', () => {
    const md = htmlToMarkdown(fx('lc-two-sum.html'));
    expect(md).toContain('10$^{4}$');
    expect(md).toContain('10$^{9}$');
    expect(md).not.toMatch(/<sup>|<\/sup>/);
  });
});
