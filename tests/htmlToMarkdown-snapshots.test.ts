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

  // GAP-2b-2 — Problem 65 "Valid Number" exercises Shape B example blocks
  // (flat <p> paragraphs with inline <strong> labels, no <pre> wrapper).
  // The snapshot locks in the post-processor output: `**Example N:**` heading
  // followed by a ```text-fenced block with Input:/Output: lines stripped of
  // bold. A regression in reshapeShapeBExamples would produce stray
  // **Input:**/**Output:** paragraphs and fail the guard assertions below.
  it('valid-number fixture produces stable Markdown with Shape B ```text blocks', () => {
    const md = htmlToMarkdown(fx('lc-valid-number.html'));
    expect(md).toMatchSnapshot();
    // Three Shape B examples in this fixture — each must collapse to its own
    // fenced text block.
    expect((md.match(/```text/g) ?? []).length).toBe(3);
    // Bold label stripping worked — no **Input:** / **Output:** bold leaking.
    expect(md).not.toContain('**Input:**');
    expect(md).not.toContain('**Output:**');
    // Example headings preserved as bold.
    expect(md).toContain('**Example 1:**');
    expect(md).toContain('**Example 2:**');
    expect(md).toContain('**Example 3:**');
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

  // GAP-2c-3 smoke check — two-sum's constraint expressions are wrapped in
  // <code>...<sup>...</sup>...</code>. Under GAP-2c-3, the <sup> maps to a
  // Unicode superscript character BEFORE the backtick wrap, so the final
  // output contains backtick-wrapped Unicode (e.g. `10⁴`) rather than either
  // literal HTML passthrough (the GAP-2c-2 approach, which Obsidian stripped)
  // or `$^{X}$` math (the GAP-2c approach, which suppressed inside backticks).
  //
  // This guard catches silent reversion of the lc-sup rule — any regression
  // would either leave literal `<sup>` tags (filter broken) or re-emit the
  // `$^{X}$` math form.
  it('two-sum snapshot emits Unicode superscript inside backticks (GAP-2c-3 smoke check)', () => {
    const md = htmlToMarkdown(fx('lc-two-sum.html'));
    // Constraints are wrapped in <code>...<sup>...</sup>...</code>.
    // With Unicode sup/sub, <code> with only text+Unicode children uses the
    // default backtick conversion cleanly.
    expect(md).toContain('10⁴');
    expect(md).toContain('10⁹');
    // No literal HTML leaking through.
    expect(md).not.toContain('<sup>');
    expect(md).not.toContain('<code>');
    // No math-mode form either.
    expect(md).not.toContain('$^{');
    expect(md).not.toContain('$_{');
  });
});
