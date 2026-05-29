// Phase 19 Plan 01 — fenceSerialization round-trip property tests (CONTEXT D-09).
//
// Verifies extractFenceBody / rewriteFenceBody are inverses on the
// SHELLS × HOSTILE_BODIES corpus from 19-RESEARCH.md lines 572-605.
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

// SHELLS × HOSTILE_BODIES corpus — verbatim from 19-RESEARCH.md §"Property-test
// seeds" (lines 572-605). The third shell has TWO leetcode-solve fences; the
// target index for tests using shell #2 is 1 (the second fence).
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

describe('fence body round-trip property tests (CONTEXT D-09)', () => {
  // Build the cartesian product. For shell index 2 (multi-fence), the body lives
  // at fenceIndex=1; for shells 0 and 1, fenceIndex=0.
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
