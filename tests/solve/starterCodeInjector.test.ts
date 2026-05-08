// tests/solve/starterCodeInjector.test.ts
// RED baseline (Wave 0) — will fail to import until Plan 02 ships
// src/solve/starterCodeInjector.ts with injectCodeSection.
//
// Contracts under test:
//   D-06: ## Code heading is inserted between ## Problem and ## Notes
//   D-07: idempotent when ## Code already contains a recognized langSlug block
//   D-09: silent on failure — returns body unchanged, no Notice
//   Pitfall 6: text/plaintext fenced blocks are non-starter; retrofit still fires
//   D-03: respects settings.defaultLanguage when choosing the starter fence tag
//
// Pure function; no Obsidian dependencies.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 02
import { injectCodeSection } from '../../src/solve/starterCodeInjector';

describe('starterCodeInjector.injectCodeSection (D-06, D-07, D-09, Pitfall 6)', () => {
  it('D-06: inserts ## Code between ## Problem and ## Notes when absent', () => {
    const body = [
      '## Problem',
      'desc',
      '',
      '## Notes',
      '',
    ].join('\n');
    const result = injectCodeSection(body, { starterCode: 'class Solution: pass', langSlug: 'python3' });
    expect(result).toContain('## Code');
    expect(result).toContain('class Solution: pass');
    expect(result.indexOf('## Problem')).toBeLessThan(result.indexOf('## Code'));
    expect(result.indexOf('## Code')).toBeLessThan(result.indexOf('## Notes'));
  });

  it('D-07: idempotent when ## Code already contains a recognized python3 block', () => {
    const body = [
      '## Problem',
      'desc',
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
    const result = injectCodeSection(body, { starterCode: 'def other(): pass', langSlug: 'python3' });
    // User's existing code MUST be preserved (no overwrite).
    expect(result).toContain('class Solution: pass');
    expect(result).not.toContain('def other(): pass');
  });

  it('Pitfall 6: text/plaintext fenced blocks are non-starter → retrofit fires anyway', () => {
    const body = [
      '## Problem',
      'desc',
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
    const result = injectCodeSection(body, { starterCode: 'def solve(): ...', langSlug: 'python3' });
    // New starter is inserted; pseudo-code survives.
    expect(result).toContain('def solve(): ...');
    expect(result).toContain('TODO: plan');
  });

  it('D-03: respects settings default language in the fence tag', () => {
    const body = '## Problem\ndesc\n\n## Notes\n\n';
    const result = injectCodeSection(body, { starterCode: 'class Solution {}', langSlug: 'java' });
    expect(result).toContain('```java');
  });

  it('D-09: silent on failure — no starterCode → returns body unchanged, no throw', () => {
    const body = '## Problem\ndesc\n\n## Notes\n\n';
    const result = injectCodeSection(body, { starterCode: null, langSlug: 'python3' });
    expect(result).toBe(body);
  });
});
