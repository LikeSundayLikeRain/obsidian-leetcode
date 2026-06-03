import { describe, it, expect } from 'vitest';
import {
  CODE_HEADING_LINE,
  CUSTOM_TESTS_HEADING_LINE,
  CASE_HEADING_PREFIX,
  codeBlockFor,
  codeBlockForV13,
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
    it('renders a fenced block with langSlug tag (Phase 5.3 D-04 remaps python3 → python)', () => {
      const result = codeBlockFor('python3', 'def solve():\n    pass');
      expect(result).toBe('```python\ndef solve():\n    pass\n```');
    });

    it('Phase 5.3 D-04 remaps the fence opener: golang → go, c → cpp, python3 → python', () => {
      expect(codeBlockFor('golang', 'package main')).toBe('```go\npackage main\n```');
      expect(codeBlockFor('c', 'int main(){}')).toBe('```cpp\nint main(){}\n```');
      expect(codeBlockFor('python3', 'pass')).toBe('```python\npass\n```');
    });

    it('Phase 5.3 D-04 passes through unsupported LC slugs verbatim (csharp)', () => {
      expect(codeBlockFor('csharp', 'class Foo {}')).toBe('```csharp\nclass Foo {}\n```');
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

    // Phase 22 D-polish-08 regression guard — `## Code` heading must be
    // followed by a blank line before the fence opener. v1.3 emitter
    // rewrite (Phase 21 D-emit-01 introducing codeBlockForV13) collapsed
    // this gap; the rest of the codebase already synthetically used
    // `## Code\n\n` in test fixtures, so production output drifted from
    // the assumed convention. This test pins the convention so future
    // emitter changes don't silently regress the spacing.
    it('emits a blank line between `## Code` heading and the fence opener', () => {
      const body = buildNoteBody({ problemMarkdown: 'X', langSlug: 'python3' });
      expect(body).toContain('## Code\n\n```');
      // Mirror with the v1.3 emitter as well — both branches must obey
      // the same convention.
      const v13Body = buildNoteBody({
        problemMarkdown: 'X',
        langSlug: 'python3',
        useInlineWidget: true,
      });
      expect(v13Body).toContain('## Code\n\n```leetcode-solve');
    });

    it('defaults langSlug to `python3` when omitted (backward-compat for Phase 2 callers)', () => {
      // Phase 5.3 D-04: the default `python3` slug is remapped to `python` at
      // the fence opener so Obsidian's lang-markdown nested parser highlights
      // the block natively in Edit Mode.
      const body = buildNoteBody({ problemMarkdown: 'X' });
      expect(body).toContain('```python');
      expect(body).not.toContain('```python3');
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

    it('renders an empty fenced block when starterCode is omitted (D-04 remap applied)', () => {
      const body = buildNoteBody({ problemMarkdown: 'X', langSlug: 'python3' });
      expect(body).toContain('```python\n\n```');
    });

    it('problem markdown is trimmed', () => {
      const body = buildNoteBody({ problemMarkdown: '   Problem statement.   ' });
      expect(body).toContain('Problem statement.');
      expect(body).not.toContain('   Problem statement.');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-03 Task 3 — codeBlockForV13 emitter + buildNoteBody
// transition gate (D-emit-01, MIGRATE-08).
//
// codeBlockForV13(starter) emits ```leetcode-solve directly for v1.3 notes.
// buildNoteBody gains a `useInlineWidget` arg that gates the emit:
//   - useInlineWidget=true  → ```leetcode-solve fence (codeBlockForV13)
//   - useInlineWidget=false → legacy ```<langSlug> fence (codeBlockFor)
// Phase 22 deletes the gate and renames codeBlockForV13 → codeBlockFor.
// ─────────────────────────────────────────────────────────────────────────
describe('codeBlockForV13 emitter (Plan 21-03 v13-emit, D-emit-01, MIGRATE-08)', () => {
  it('v13-emit: emits ```leetcode-solve fence with starter body', () => {
    const result = codeBlockForV13('def f():\n    return 1');
    expect(result).toBe('```leetcode-solve\ndef f():\n    return 1\n```');
  });

  it('v13-emit: trims leading/trailing whitespace, preserves internal whitespace (mirrors codeBlockFor)', () => {
    const result = codeBlockForV13('  \n  class Solution { }  \n  ');
    expect(result).toBe('```leetcode-solve\nclass Solution { }\n```');
  });

  it('v13-emit: handles empty starter (round-trips to empty fence body)', () => {
    const result = codeBlockForV13('');
    expect(result).toBe('```leetcode-solve\n\n```');
  });

  it('v13-emit: takes NO langSlug arg — language lives in lc-language frontmatter (D-emit-01)', () => {
    // The emitter signature is intentionally (starter: string) only. The
    // fence opener is fixed at ```leetcode-solve regardless of language.
    // Phase 22 cleanup boundary: this matches what codeBlockFor will become
    // after the legacy emitter is deleted.
    const a = codeBlockForV13('a');
    const b = codeBlockForV13('a');
    expect(a).toBe(b);
    expect(a).not.toContain('python');
    expect(a).not.toContain('java');
  });
});

describe('buildNoteBody — useInlineWidget transition gate (Plan 21-03 v13-emit, MIGRATE-08)', () => {
  it('v13-emit: useInlineWidget=true emits ```leetcode-solve fence (NOT ```<langSlug>)', () => {
    const body = buildNoteBody({
      problemMarkdown: 'P',
      langSlug: 'python3',
      starterCode: 'def f(): pass',
      useInlineWidget: true,
    });
    expect(body).toContain('```leetcode-solve\n');
    // Pitfall 9 spot-check: useInlineWidget=ON path MUST NOT emit a langSlug
    // fence opener — only the v1.3 leetcode-solve marker.
    expect(body).not.toMatch(/^```python\s*$/m);
    expect(body).not.toMatch(/^```java\s*$/m);
    expect(body).not.toMatch(/^```cpp\s*$/m);
  });

  it('v13-emit: useInlineWidget=false emits legacy ```<langSlug> fence (Phase 22 boundary preserved)', () => {
    // useInlineWidget=OFF is the milestone default through Phase 21; this
    // path stays byte-for-byte unchanged so existing v1.2-creation tests
    // continue to pass.
    const body = buildNoteBody({
      problemMarkdown: 'P',
      langSlug: 'python3',
      starterCode: 'def f(): pass',
      useInlineWidget: false,
    });
    // Phase 5.3 D-04: codeBlockFor remaps python3 → python at the fence opener.
    expect(body).toContain('```python\n');
    expect(body).not.toContain('```leetcode-solve');
  });

  it('v13-emit: useInlineWidget omitted defaults to legacy emit (back-compat for existing callers)', () => {
    const body = buildNoteBody({
      problemMarkdown: 'P',
      langSlug: 'java',
      starterCode: 'class S {}',
    });
    expect(body).toContain('```java\n');
    expect(body).not.toContain('```leetcode-solve');
  });
});
