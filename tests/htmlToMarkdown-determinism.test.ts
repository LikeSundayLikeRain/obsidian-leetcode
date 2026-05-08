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

  // Test 10 — GAP-2c-2: combined <code>-with-nested-<sup> + bare <sup> in a
  // paragraph must be byte-deterministic. The lc-code-with-children rule and
  // the lc-sup rule both inspect only the current node (outerHTML, trimmed
  // textContent) — no per-call counters or shared accumulators — so 100
  // invocations on the same mixed fixture produce identical bytes.
  it('produces byte-identical output across 100 runs for combined <code><sup> + bare <sup> input', () => {
    const html = [
      '<p>Complexity <code>O(n<sup>2</sup>)</code> with 10<sup>9</sup> ceiling.</p>',
      '<ul>',
      '  <li><code>a<sub>i</sub> &lt;= 10<sup>4</sup></code></li>',
      '  <li>bare superscript: x<sup>k+1</sup></li>',
      '</ul>',
    ].join('\n');
    const first = htmlToMarkdown(html);
    // Sanity: both new+existing rules fired (guards against a regression where
    // both outputs are equally wrong).
    // <code> with children → literal HTML passthrough.
    expect(first).toContain('<code>O(n<sup>2</sup>)</code>');
    expect(first).toContain('<code>a<sub>i</sub> &lt;= 10<sup>4</sup></code>');
    // Bare <sup>/<sub> outside <code> → math form.
    expect(first).toContain('10$^{9}$');
    expect(first).toContain('x$^{k+1}$');
    for (let i = 0; i < 100; i++) {
      expect(htmlToMarkdown(html)).toBe(first);
    }
  });
});
