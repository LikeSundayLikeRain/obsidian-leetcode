import { describe, it, expect } from 'vitest';
import { forceInjectCodeSection } from '../../src/solve/starterCodeInjector';

describe('forceInjectCodeSection — forced path (Blocker 2 fix, D-07 on-demand)', () => {
  const NEW_STARTER = 'def solve():\n    # new';
  const OPTS = { starterCode: NEW_STARTER, langSlug: 'python3' };

  it('UNCONDITIONALLY replaces an existing recognized-langSlug block', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```python3',
      'user wrote this — will be replaced',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, OPTS);
    expect(out).toContain('# new');
    expect(out).not.toContain('user wrote this — will be replaced');
  });

  it('falls back to injectCodeSection behavior when ## Code does not exist', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const out = forceInjectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    expect(out).toContain('# new');
  });

  it('inserts starter at top of section when ## Code has no recognized block', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```text',
      'unrelated',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, OPTS);
    // Phase 5.3 D-04: codeBlockFor remaps python3 → python at the fence opener.
    expect(out).toContain('```python');
    expect(out).toContain('# new');
    // Existing text block preserved.
    expect(out).toContain('```text');
    expect(out).toContain('unrelated');
  });

  it('replaces only the FIRST recognized block; leaves additional blocks alone', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```python3',
      'first',
      '```',
      '',
      '```java',
      'second',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, OPTS);
    // First block replaced.
    expect(out).toContain('# new');
    expect(out).not.toContain('first');
    // Second block preserved.
    expect(out).toContain('```java');
    expect(out).toContain('second');
  });

  it('is pure — same input returns same output', () => {
    const body = '## Problem\nX\n\n## Code\n```python3\nold\n```\n';
    const a = forceInjectCodeSection(body, OPTS);
    const b = forceInjectCodeSection(body, OPTS);
    expect(a).toBe(b);
  });

  it('switches language: python3 → java replaces the python3 block', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```python3',
      'python-code',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, {
      starterCode: 'class Solution {}',
      langSlug: 'java',
    });
    expect(out).toContain('```java');
    expect(out).toContain('class Solution {}');
    expect(out).not.toContain('python-code');
  });
});
