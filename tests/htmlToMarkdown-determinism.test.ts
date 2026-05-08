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
    // GAP-2c-3: Unicode superscript/subscript characters, not math-form `$^{X}$`.
    expect(first).toContain('O(n²)');
    expect(first).toContain('10⁹');
    expect(first).toContain('10⁴');
    expect(first).toContain('aₙ₋₁');
    expect(first).toMatch(/```text[\s\S]*```/);
    for (let i = 0; i < 100; i++) {
      expect(htmlToMarkdown(html)).toBe(first);
    }
  });

  // Test 10 — GAP-2c-3: combined inline-<code>-with-<sup>/<sub> + bare <sup> +
  // example block in a single fixture. All rules (lc-sup, lc-sub,
  // lc-example-block) inspect only the current node — no per-call counters or
  // shared accumulators — so 100 invocations on the mixed fixture produce
  // identical bytes. This is the canonical byte-equality regression gate for
  // the Unicode sup/sub rewrite.
  it('produces byte-identical output across 100 runs for combined inline <code><sup> + bare <sup> + example block', () => {
    const html = [
      '<p>Complexity <code>O(n<sup>2</sup>)</code> with 10<sup>9</sup> ceiling.</p>',
      '<ul>',
      '  <li><code>a<sub>i</sub> &lt;= 10<sup>4</sup></code></li>',
      '  <li>bare superscript: x<sup>k+1</sup></li>',
      '</ul>',
      '<p><strong class="example">Example 1:</strong></p>',
      '<pre><strong>Input:</strong> n = 5\n<strong>Output:</strong> 25</pre>',
    ].join('\n');
    const first = htmlToMarkdown(html);
    // Sanity: both new+existing rules fired (guards against a regression where
    // both outputs are equally wrong).
    // GAP-2c-3: <code> with nested <sup> uses backticks + Unicode (clean).
    expect(first).toContain('`O(n²)`');
    expect(first).toContain('`aᵢ <= 10⁴`');
    // Bare <sup>/<sub> outside <code> → Unicode form.
    expect(first).toContain('10⁹');
    expect(first).toContain('xᵏ⁺¹');
    // Example block fenced cleanly.
    expect(first).toMatch(/```text[\s\S]*```/);
    for (let i = 0; i < 100; i++) {
      expect(htmlToMarkdown(html)).toBe(first);
    }
  });

  // Test 11 — GAP-2b-2: combined Shape A (<pre>) + Shape B (<p><strong>) example
  // blocks in a single fixture. Both paths land in the same ```text fence shape
  // via independent code paths (turndown rule for A, post-processing for B).
  // The post-processor is a pure string→string function — 100 runs over the
  // same mixed input must produce identical bytes (D-20).
  it('produces byte-identical output across 100 runs for combined Shape A + Shape B examples', () => {
    const html = [
      // Shape A — <pre>-wrapped (Two Sum style).
      '<p><strong class="example">Example 1:</strong></p>',
      '<pre><strong>Input:</strong> nums = [2,7,11,15]\n<strong>Output:</strong> [0,1]</pre>',
      // Shape B — flat <p> paragraphs (Problem 65 style).
      '<p><strong>Example 2:</strong></p>',
      '<p><strong>Input:</strong> s = "0"</p>',
      '<p><strong>Output:</strong> true</p>',
      // Shape B with Explanation — three-label run.
      '<p><strong>Example 3:</strong></p>',
      '<p><strong>Input:</strong> s = "e"</p>',
      '<p><strong>Output:</strong> false</p>',
      '<p><strong>Explanation:</strong> not a valid number.</p>',
      // Regression guard content that must NOT be collapsed.
      '<p><strong>Note:</strong> stray bolded label left verbatim.</p>',
    ].join('\n');
    const first = htmlToMarkdown(html);
    // Sanity: all three example heads survive.
    expect(first).toContain('**Example 1:**');
    expect(first).toContain('**Example 2:**');
    expect(first).toContain('**Example 3:**');
    // Three fenced blocks — Shape A + two Shape B runs.
    expect((first.match(/```text/g) ?? []).length).toBe(3);
    // Shape B label-stripping worked.
    expect(first).toContain('Input: s = "0"');
    expect(first).toContain('Output: true');
    expect(first).toContain('Explanation: not a valid number.');
    // Regression guard fired — stray **Note:** preserved.
    expect(first).toContain('**Note:**');
    // Byte-equality across 100 runs (D-20 determinism gate).
    for (let i = 0; i < 100; i++) {
      expect(htmlToMarkdown(html)).toBe(first);
    }
  });
});
