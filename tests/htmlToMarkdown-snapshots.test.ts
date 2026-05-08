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
});
