// tests/solve/CaseRegion.test.ts
// RED baseline (Wave 0) — will fail to import until Plan 02 ships
// src/solve/CaseRegion.ts with readCases + writeCases.
//
// Contracts under test:
//   D-19: parse ### Case N blocks inside ## Custom Tests; preserve
//     inter-case user paragraph text VERBATIM (Warning 8)
//   append-new-case: writeCases with N+1 cases inserts the new one at
//     the end of the region
//   remove-region-when-empty: writing [] to a note that has a ## Custom Tests
//     region collapses the region entirely
//   purity: same input → same output (vault.process retry-safe)
//
// Pure function; no Obsidian dependencies.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 02
import { readCases, writeCases } from '../../src/solve/CaseRegion';

describe('CaseRegion.readCases (D-19)', () => {
  it('parses ### Case N blocks inside ## Custom Tests and returns inputs in order', () => {
    const body = [
      '## Problem',
      '',
      '## Custom Tests',
      '',
      '### Case 1',
      '',
      '```text',
      '[1,2,3]',
      '4',
      '```',
      '',
      '### Case 2',
      '',
      '```text',
      '[5,6]',
      '7',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    expect(readCases(body)).toEqual([
      { input: '[1,2,3]\n4' },
      { input: '[5,6]\n7' },
    ]);
  });

  it('returns [] when ## Custom Tests section is absent', () => {
    const body = '## Problem\nfoo\n\n## Notes\n\n';
    expect(readCases(body)).toEqual([]);
  });
});

describe('CaseRegion.writeCases (D-19, Warning 8: preserve user text)', () => {
  it('preserves inter-case user paragraph text VERBATIM (D-19 full contract, Warning 8)', () => {
    const before = [
      '## Problem',
      '',
      '## Custom Tests',
      '',
      '### Case 1',
      '',
      '```text',
      'foo',
      '```',
      '',
      'note: this is a palindrome',
      '',
      '### Case 2',
      '',
      '```text',
      'bar',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const after = writeCases(before, [{ input: 'foo' }, { input: 'bar' }]);
    // User's narrative line between cases MUST survive a round-trip.
    expect(after).toContain('note: this is a palindrome');
    expect(after).toContain('### Case 1');
    expect(after).toContain('### Case 2');
  });

  it('appends a new case at the end of the region when cases grow', () => {
    const before = [
      '## Problem',
      '',
      '## Custom Tests',
      '',
      '### Case 1',
      '',
      '```text',
      'foo',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const after = writeCases(before, [{ input: 'foo' }, { input: 'new' }]);
    expect(after).toContain('### Case 2');
    expect(after).toContain('new');
    // Order: Case 1 before Case 2.
    expect(after.indexOf('### Case 1')).toBeLessThan(after.indexOf('### Case 2'));
  });

  it('removes the ## Custom Tests region entirely when cases are written empty', () => {
    const before = [
      '## Problem',
      '',
      '## Custom Tests',
      '',
      '### Case 1',
      '',
      '```text',
      'foo',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const after = writeCases(before, []);
    expect(after).not.toContain('## Custom Tests');
    expect(after).not.toContain('### Case 1');
    // Surrounding headings preserved.
    expect(after).toContain('## Problem');
    expect(after).toContain('## Notes');
  });

  it('purity: same input gives identical output on re-invocation', () => {
    const input = '## Problem\n\n## Custom Tests\n\n### Case 1\n\n```text\nx\n```\n\n## Notes\n\n';
    const a = writeCases(input, [{ input: 'x' }]);
    const b = writeCases(input, [{ input: 'x' }]);
    expect(a).toBe(b);
  });
});
