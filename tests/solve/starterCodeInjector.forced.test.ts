// tests/solve/starterCodeInjector.forced.test.ts
// RED baseline (Wave 0) — Blocker 2 fix — will fail until Plan 02 Task 4
// ships src/solve/starterCodeInjector.ts with a new forceInjectCodeSection
// export that unconditionally replaces (not idempotent like injectCodeSection).
//
// The non-forced path (injectCodeSection) is idempotent per D-07. The
// forced path is needed for:
//   - "Force refresh starter from LC" command (future)
//   - Language switch while a starter exists under the note's ## Code
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 02 Task 4
import { forceInjectCodeSection } from '../../src/solve/starterCodeInjector';

describe('forceInjectCodeSection (Plan 02 Task 4 — unconditional replace, Blocker 2)', () => {
  it('replaces existing recognized-langSlug fenced block under ## Code', () => {
    const body = [
      '## Problem',
      'foo',
      '',
      '## Code',
      '',
      '```python3',
      'class Solution: pass',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const result = forceInjectCodeSection(body, {
      starterCode: 'def solve(): ...',
      langSlug: 'python3',
    });
    // Old starter is gone; new one is present.
    expect(result).not.toContain('class Solution: pass');
    expect(result).toContain('def solve(): ...');
    // Structural order preserved.
    expect(result.indexOf('## Problem')).toBeLessThan(result.indexOf('## Code'));
    expect(result.indexOf('## Code')).toBeLessThan(result.indexOf('## Notes'));
  });

  it('inserts starter when ## Code exists with only a non-recognized text block (Pitfall 6 passthrough)', () => {
    const body = [
      '## Problem',
      'foo',
      '',
      '## Code',
      '',
      '```text',
      'TODO: plan',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const result = forceInjectCodeSection(body, {
      starterCode: 'def solve(): ...',
      langSlug: 'python3',
    });
    expect(result).toContain('def solve(): ...');
    // Pseudo-code text block is preserved (content is user-owned non-starter).
    expect(result).toContain('TODO: plan');
  });

  it('creates ## Code section when absent (delegates to injectCodeSection)', () => {
    const body = '## Problem\nfoo\n\n## Notes\n\n';
    const result = forceInjectCodeSection(body, {
      starterCode: 'def solve(): ...',
      langSlug: 'python3',
    });
    expect(result).toContain('## Code');
    expect(result).toContain('def solve(): ...');
    expect(result.indexOf('## Code')).toBeLessThan(result.indexOf('## Notes'));
  });
});
