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

  // Test 9 — Combined <sup> + LC example-block fixture must be deterministic
  // across 100 runs. Both new rules (lc-sup, lc-example-block) cooperate with
  // the singleton cache without per-call mutable state (D-20).
  it('produces byte-identical output across 100 runs for combined <sup> + example-block input', () => {
    const html = [
      '<p>Complexity: O(n<sup>2</sup>) with 10<sup>9</sup> ceiling.</p>',
      '<p><strong class="example">Example 1:</strong></p>',
      '<pre><strong>Input:</strong> nums = [2,7,11,15], target = 9\n<strong>Output:</strong> [0,1]</pre>',
      '<p>Constraint: a<sub>n-1</sub> &lt;= 10<sup>4</sup>.</p>',
    ].join('\n');
    const first = htmlToMarkdown(html);
    // Sanity: new rules actually fired (guards against a future regression where
    // the determinism test passes because both outputs are equally wrong).
    expect(first).toContain('$^{2}$');
    expect(first).toContain('$^{9}$');
    expect(first).toContain('$^{4}$');
    expect(first).toContain('$_{n-1}$');
    expect(first).toMatch(/```text[\s\S]*```/);
    for (let i = 0; i < 100; i++) {
      expect(htmlToMarkdown(html)).toBe(first);
    }
  });
});
