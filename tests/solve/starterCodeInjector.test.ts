import { describe, it, expect } from 'vitest';
import { injectCodeSection } from '../../src/solve/starterCodeInjector';

describe('injectCodeSection — idempotent path (SOLVE-02, D-06/D-07)', () => {
  const OPTS = { starterCode: 'def solve():\n    pass', langSlug: 'python3' };

  it('inserts ## Code section between ## Problem and ## Notes when missing', () => {
    const body = '## Problem\nA problem.\n\n## Notes\nMy notes.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    expect(out).toContain('```python3');
    expect(out).toContain('def solve():');
    const problemIdx = out.indexOf('## Problem');
    const codeIdx = out.indexOf('## Code');
    const notesIdx = out.indexOf('## Notes');
    expect(codeIdx).toBeGreaterThan(problemIdx);
    expect(notesIdx).toBeGreaterThan(codeIdx);
  });

  it('is idempotent when ## Code exists with a recognized-langSlug fenced block (D-07)', () => {
    const body = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '```python3',
      'user wrote this',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = injectCodeSection(body, OPTS);
    expect(out).toBe(body); // unchanged
    expect(out).toContain('user wrote this');
  });

  it('inserts starter BEFORE existing unrecognized `text` block (Pitfall 6)', () => {
    const body = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '```text',
      'not really code',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = injectCodeSection(body, OPTS);
    // New recognized block present.
    expect(out).toContain('```python3');
    expect(out).toContain('def solve():');
    // The old text block is still present too (inserted BEFORE, not replaced).
    expect(out).toContain('```text');
    expect(out).toContain('not really code');
    // The python3 block appears before the text block.
    const py = out.indexOf('```python3');
    const txt = out.indexOf('```text');
    expect(py).toBeGreaterThan(0);
    expect(py).toBeLessThan(txt);
  });

  it('inserts at EOF when neither ## Problem nor ## Notes exist', () => {
    const body = 'Just a free-form note.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    expect(out).toContain('```python3');
  });

  it('is pure — same input returns same output', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const a = injectCodeSection(body, OPTS);
    const b = injectCodeSection(body, OPTS);
    expect(a).toBe(b);
  });

  it('handles ## Problem only (no ## Notes) — inserts after ## Problem body', () => {
    const body = '## Problem\nA problem.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    expect(out).toContain('```python3');
  });

  it('empty starterCode still produces a fenced block', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const out = injectCodeSection(body, { starterCode: '', langSlug: 'python3' });
    expect(out).toContain('```python3\n\n```');
  });
});
