import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToMarkdown } from '../src/notes/htmlToMarkdown';

describe('htmlToMarkdown determinism (D-20)', () => {
  it('produces byte-identical output across 100 runs of the same input', () => {
    const html = readFileSync(join(__dirname, 'fixtures', 'lc-two-sum.html'), 'utf-8');
    const first = htmlToMarkdown(html);
    for (let i = 0; i < 100; i++) {
      expect(htmlToMarkdown(html)).toBe(first);
    }
  });

  it('is order-independent across module re-runs (singleton cache safety)', () => {
    const a = htmlToMarkdown('<p>foo</p>');
    const b = htmlToMarkdown('<p>bar</p>');
    const a2 = htmlToMarkdown('<p>foo</p>');
    expect(a).toBe(a2);
    expect(a).not.toBe(b);
  });
});
