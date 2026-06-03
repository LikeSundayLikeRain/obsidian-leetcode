import { describe, it, expect } from 'vitest';
import {
  CODE_HEADING_LINE,
  CUSTOM_TESTS_HEADING_LINE,
  CASE_HEADING_PREFIX,
  codeBlockFor,
  buildNoteBody,
} from '../../src/notes/NoteTemplate';

describe('NoteTemplate Phase 3 schema additions (CONTEXT D-06, D-18, D-20)', () => {
  it('exports CODE_HEADING_LINE as the canonical `## Code` string', () => {
    expect(CODE_HEADING_LINE).toBe('## Code');
  });

  it('exports CUSTOM_TESTS_HEADING_LINE as the canonical `## Custom Tests` string', () => {
    expect(CUSTOM_TESTS_HEADING_LINE).toBe('## Custom Tests');
  });

  it('exports CASE_HEADING_PREFIX with trailing space (matches `### Case 1`)', () => {
    expect(CASE_HEADING_PREFIX).toBe('### Case ');
  });

  describe('codeBlockFor (Phase 22 v1.3 single-emitter)', () => {
    it('emits a ```leetcode-solve fence with the starter body', () => {
      const result = codeBlockFor('def solve():\n    pass');
      expect(result).toBe('```leetcode-solve\ndef solve():\n    pass\n```');
    });

    it('trims leading/trailing whitespace, preserves internal whitespace', () => {
      const result = codeBlockFor('  \n  class Solution { }  \n  ');
      expect(result).toBe('```leetcode-solve\nclass Solution { }\n```');
    });

    it('handles empty starter (round-trips to empty fence body)', () => {
      const result = codeBlockFor('');
      expect(result).toBe('```leetcode-solve\n\n```');
    });

    it('takes NO langSlug arg — language lives in lc-language frontmatter (D-emit-01)', () => {
      // The emitter signature is (starter: string) only. The fence opener is
      // fixed at ```leetcode-solve regardless of language.
      const a = codeBlockFor('a');
      const b = codeBlockFor('a');
      expect(a).toBe(b);
      expect(a).not.toContain('python');
      expect(a).not.toContain('java');
    });

    it('is pure — identical input returns identical output', () => {
      const a = codeBlockFor('fn main() {}');
      const b = codeBlockFor('fn main() {}');
      expect(a).toBe(b);
    });
  });

  describe('buildNoteBody', () => {
    it('emits `## Problem` → `## Code` → `## Notes` in order (D-06)', () => {
      const body = buildNoteBody({ problemMarkdown: 'A problem.' });
      const problemIdx = body.indexOf('## Problem');
      const codeIdx = body.indexOf('## Code');
      const notesIdx = body.indexOf('## Notes');
      expect(problemIdx).toBeGreaterThanOrEqual(0);
      expect(codeIdx).toBeGreaterThan(problemIdx);
      expect(notesIdx).toBeGreaterThan(codeIdx);
    });

    // Phase 22 D-polish-08 regression guard — `## Code` heading must be
    // followed by a blank line before the fence opener. The v1.3 emitter
    // rewrite (Phase 21 D-emit-01) collapsed this gap; this test pins the
    // convention so future emitter changes don't silently regress the
    // spacing.
    it('emits a blank line between `## Code` heading and the fence opener', () => {
      const body = buildNoteBody({ problemMarkdown: 'X' });
      expect(body).toContain('## Code\n\n```leetcode-solve');
    });

    it('emits a ```leetcode-solve fence regardless of langSlug (Phase 22 v1.3)', () => {
      const body = buildNoteBody({ problemMarkdown: 'X', langSlug: 'python3' });
      expect(body).toContain('```leetcode-solve\n');
      // The v1.3 emitter MUST NOT emit a langSlug fence opener — language
      // metadata moved to `lc-language` frontmatter.
      expect(body).not.toMatch(/^```python\s*$/m);
      expect(body).not.toMatch(/^```java\s*$/m);
      expect(body).not.toMatch(/^```cpp\s*$/m);
    });

    it('accepts explicit starterCode', () => {
      const body = buildNoteBody({
        problemMarkdown: 'X',
        starterCode: 'def solve():\n    pass',
      });
      expect(body).toContain('def solve():');
    });

    it('renders an empty fenced block when starterCode is omitted', () => {
      const body = buildNoteBody({ problemMarkdown: 'X' });
      expect(body).toContain('```leetcode-solve\n\n```');
    });

    it('problem markdown is trimmed', () => {
      const body = buildNoteBody({ problemMarkdown: '   Problem statement.   ' });
      expect(body).toContain('Problem statement.');
      expect(body).not.toContain('   Problem statement.');
    });
  });
});
