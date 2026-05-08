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

  describe('codeBlockFor', () => {
    it('renders a fenced block with langSlug tag', () => {
      const result = codeBlockFor('python3', 'def solve():\n    pass');
      expect(result).toBe('```python3\ndef solve():\n    pass\n```');
    });

    it('trims starter code whitespace (pure, deterministic)', () => {
      const result = codeBlockFor('java', '  \n  class Solution { }  \n  ');
      expect(result).toBe('```java\nclass Solution { }\n```');
    });

    it('handles empty starter code', () => {
      const result = codeBlockFor('cpp', '');
      expect(result).toBe('```cpp\n\n```');
    });

    it('is pure — identical input returns identical output', () => {
      const a = codeBlockFor('rust', 'fn main() {}');
      const b = codeBlockFor('rust', 'fn main() {}');
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

    it('defaults langSlug to `python3` when omitted (backward-compat for Phase 2 callers)', () => {
      const body = buildNoteBody({ problemMarkdown: 'X' });
      expect(body).toContain('```python3');
    });

    it('accepts explicit langSlug', () => {
      const body = buildNoteBody({ problemMarkdown: 'X', langSlug: 'java' });
      expect(body).toContain('```java');
    });

    it('accepts explicit starterCode', () => {
      const body = buildNoteBody({
        problemMarkdown: 'X',
        langSlug: 'python3',
        starterCode: 'def solve():\n    pass',
      });
      expect(body).toContain('def solve():');
    });

    it('renders an empty fenced block when starterCode is omitted', () => {
      const body = buildNoteBody({ problemMarkdown: 'X', langSlug: 'python3' });
      expect(body).toContain('```python3\n\n```');
    });

    it('problem markdown is trimmed', () => {
      const body = buildNoteBody({ problemMarkdown: '   Problem statement.   ' });
      expect(body).toContain('Problem statement.');
      expect(body).not.toContain('   Problem statement.');
    });
  });
});
