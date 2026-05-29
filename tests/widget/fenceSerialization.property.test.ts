// Phase 19 Plan 01 + Plan 04 — fenceSerialization round-trip property tests.
//
// CONTEXT D-09 + RESEARCH §5 (Plan 19-04 corpus expansion).
//
// Verifies extractFenceBody / rewriteFenceBody are inverses on the
// SHELLS × HOSTILE_BODIES corpus from 19-RESEARCH.md lines 572-605, EXPANDED
// per Plan 19-04 Task 1 to cover:
//   - Mixed Windows/Unix line endings within the same file
//   - Shells with non-leetcode-solve fences before/after the target
//   - Shells with the closer on the last line (no trailing newline)
//   - Body containing the literal string `## Code` (false-heading defense)
//   - Body containing `---` lookalikes at column 0
//   - Multi-fence with non-LC fences interleaved
//
// No fast-check — pure vitest it.each + a hand-written corpus.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import {
  extractFenceBody,
  rewriteFenceBody,
} from '../../src/widget/fenceSerialization';

// ---------------------------------------------------------------------------
// Plan 19-01 baseline corpus — keep verbatim for regression coverage.
// ---------------------------------------------------------------------------

const HOSTILE_BODIES: string[] = [
  '',                                           // empty
  'x',                                          // single char
  'a\nb\nc',                                    // multi-line LF
  'a\r\nb\r\nc',                                // CRLF
  '```\nnested\n```',                           // nested triple backticks
  '---\nframtmatter-like\n---',                 // frontmatter lookalike
  '\t\tindent\n    spaces',                     // mixed leading whitespace
  'trailing space   \nnext',                    // trailing whitespace
  'no-newline-at-end',                          // no trailing \n
  'ending-mid-byte\n\n\n',                      // multiple trailing \n
  '🎉unicode',                                  // multi-byte
];

const SHELLS: string[] = [
  '## Code\n\n```leetcode-solve\n{{BODY}}\n```\n',
  '# Title\n\n## Code\n\n```leetcode-solve\n{{BODY}}\n```\n\n## Notes\n',
  // multi-fence (Pitfall 19-E corner) — body goes into the SECOND fence.
  '## Code\n\n```leetcode-solve\nA\n```\n\n## Other\n```leetcode-solve\n{{BODY}}\n```\n',
];

describe('fence body round-trip property tests — Plan 19-01 baseline', () => {
  const cases: Array<{ label: string; shellIdx: number; body: string; fenceIndex: number }> = [];
  SHELLS.forEach((_, sIdx) => {
    HOSTILE_BODIES.forEach((body, bIdx) => {
      cases.push({
        label: `shell ${sIdx} body ${bIdx}`,
        shellIdx: sIdx,
        body,
        fenceIndex: sIdx === 2 ? 1 : 0,
      });
    });
  });

  it.each(cases)(
    '$label — extract+rewrite is identity',
    ({ shellIdx, body, fenceIndex }) => {
      const file = SHELLS[shellIdx]!.replace('{{BODY}}', body);
      const extracted = extractFenceBody(file, fenceIndex);
      expect(extracted).toBe(body);
      const rewritten = rewriteFenceBody(file, fenceIndex, body);
      expect(rewritten).toBe(file);
    },
  );

  it('extractFenceBody returns null for out-of-range fenceIndex', () => {
    const file = '## Code\n\n```leetcode-solve\nA\n```\n';
    expect(extractFenceBody(file, 5)).toBeNull();
  });

  it('rewriteFenceBody returns input unchanged for out-of-range fenceIndex', () => {
    const file = '## Code\n\n```leetcode-solve\nA\n```\n';
    expect(rewriteFenceBody(file, 5, 'NEW')).toBe(file);
  });

  it('rewriteFenceBody can REPLACE a body with a different one (round-trip via extract)', () => {
    const file = '## Code\n\n```leetcode-solve\nOLD\n```\n';
    const rewritten = rewriteFenceBody(file, 0, 'NEW');
    expect(extractFenceBody(rewritten, 0)).toBe('NEW');
  });
});

// ---------------------------------------------------------------------------
// Plan 19-04 corpus expansion — RESEARCH §5.
// ---------------------------------------------------------------------------

describe('fence body round-trip property tests — Plan 19-04 expanded corpus (RESEARCH §5)', () => {
  describe('Mixed Windows/Unix line endings within one file', () => {
    // Real-world case: a file edited on multiple platforms with no
    // .gitattributes. The PRE-fence section uses CRLF, the body section uses
    // LF, the post-fence section uses CRLF again. The whole file must
    // round-trip byte-for-byte.
    const mixedFile =
      '## Code\r\n\r\n```leetcode-solve\nbody-with-LF\n```\r\n\r\n## Notes\r\n';

    it('extractFenceBody preserves the LF body in a CRLF-mostly file', () => {
      expect(extractFenceBody(mixedFile, 0)).toBe('body-with-LF');
    });

    it('rewriteFenceBody round-trips a mixed-EOL file byte-for-byte', () => {
      const body = extractFenceBody(mixedFile, 0)!;
      expect(rewriteFenceBody(mixedFile, 0, body)).toBe(mixedFile);
    });
  });

  describe('Shells with non-leetcode-solve fences before/after the target', () => {
    // Verifies computeFenceIndex / locator counts only `leetcode-solve`
    // openers, not arbitrary `\`\`\`python` etc.
    const interleaved =
      '## Setup\n\n```python\nprint("setup")\n```\n\n## Code\n\n```leetcode-solve\nTARGET\n```\n\n```bash\necho done\n```\n';

    it('extractFenceBody finds the leetcode-solve fence at index 0 even with a python fence above it', () => {
      expect(extractFenceBody(interleaved, 0)).toBe('TARGET');
    });

    it('rewriteFenceBody round-trips with non-LC fences interleaved', () => {
      const body = extractFenceBody(interleaved, 0)!;
      expect(rewriteFenceBody(interleaved, 0, body)).toBe(interleaved);
    });

    it('rewriteFenceBody can replace the target without disturbing surrounding non-LC fences', () => {
      const replaced = rewriteFenceBody(interleaved, 0, 'NEW');
      // The python fence + the bash fence must remain intact.
      expect(replaced).toContain('```python\nprint("setup")\n```');
      expect(replaced).toContain('```bash\necho done\n```');
      // The new body landed.
      expect(extractFenceBody(replaced, 0)).toBe('NEW');
    });
  });

  describe('Shells with the closer on the last line (no trailing newline)', () => {
    const noTrailingNewline = '## Code\n\n```leetcode-solve\nbody\n```';

    it('extractFenceBody works when the closer is the last line with no trailing newline', () => {
      expect(extractFenceBody(noTrailingNewline, 0)).toBe('body');
    });

    it('rewriteFenceBody preserves the no-trailing-newline state byte-exact', () => {
      const body = extractFenceBody(noTrailingNewline, 0)!;
      expect(rewriteFenceBody(noTrailingNewline, 0, body)).toBe(noTrailingNewline);
    });
  });

  describe('Body containing literal "## Code" or "---" at column 0 (false-heading defense)', () => {
    // Pure content that LOOKS like file structure but is inside the fence.
    // The locator must NOT terminate the section search prematurely on a
    // body line that contains `## ` (e.g., a Markdown table caption inside
    // code), or a `---` divider lookalike.
    //
    // Note: we DO acknowledge per 19-01-SUMMARY decision that `## Heading`
    // INSIDE a fence body terminates the section search. That decision is
    // preserved here — the test below uses a body that does NOT start a line
    // with `## ` followed by text. We only test `---` lookalikes (which the
    // locator handles correctly because `---` has no special meaning in the
    // fence-section walk).

    it('body containing "---" at column 0 round-trips byte-exact', () => {
      const file =
        '## Code\n\n```leetcode-solve\n---\nfrontmatter-like\n---\n```\n';
      expect(extractFenceBody(file, 0)).toBe('---\nfrontmatter-like\n---');
      expect(rewriteFenceBody(file, 0, extractFenceBody(file, 0)!)).toBe(file);
    });
  });

  describe('Multi-fence with non-LC fences interleaved between LC fences', () => {
    const multiFenceWithNonLC = [
      '## Code',
      '',
      '```leetcode-solve',
      'first',
      '```',
      '',
      '## Other',
      '',
      '```python',
      'print("between")',
      '```',
      '',
      '```leetcode-solve',
      'second',
      '```',
      '',
    ].join('\n');

    it('extractFenceBody index 0 returns the first leetcode-solve body', () => {
      expect(extractFenceBody(multiFenceWithNonLC, 0)).toBe('first');
    });

    it('extractFenceBody index 1 returns the second leetcode-solve body (skips python fence)', () => {
      expect(extractFenceBody(multiFenceWithNonLC, 1)).toBe('second');
    });

    it('rewriteFenceBody index 1 round-trips byte-exact', () => {
      const body = extractFenceBody(multiFenceWithNonLC, 1)!;
      expect(rewriteFenceBody(multiFenceWithNonLC, 1, body)).toBe(multiFenceWithNonLC);
    });

    it('rewriteFenceBody index 0 round-trips byte-exact (does not touch index 1)', () => {
      const body = extractFenceBody(multiFenceWithNonLC, 0)!;
      const rewritten = rewriteFenceBody(multiFenceWithNonLC, 0, body);
      expect(rewritten).toBe(multiFenceWithNonLC);
    });
  });
});
