// tests/solve/customTestStore.test.ts
// RED baseline (Wave 0) — will fail until Plan 05 ships
// src/solve/customTestStore.ts with readCases + writeCases (round-trip facade
// over CaseRegion). This file exercises the round-trip at the store level;
// CaseRegion.test.ts covers the lower-level parser/writer.
//
// Contracts under test:
//   Pitfall 5 / D-19 Warning 8: inter-case user paragraph text preserved
//   empty read when ## Custom Tests absent
//   N+1 cases written produces N+1 ### Case N blocks in order
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- RED until Plan 05
import { readCases, writeCases } from '../../src/solve/customTestStore';

describe('customTestStore.readCases (D-19)', () => {
  it('returns [] when ## Custom Tests section is absent', () => {
    const body = '## Problem\nx\n\n## Notes\n\n';
    expect(readCases(body)).toEqual([]);
  });

  it('parses 2 ### Case N + ```text blocks into [{input}, {input}]', () => {
    const body = [
      '## Problem',
      '',
      '## Custom Tests',
      '',
      '### Case 1',
      '',
      '```text',
      '[1,2]',
      '3',
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
      { input: '[1,2]\n3' },
      { input: '[5,6]\n7' },
    ]);
  });
});

describe('customTestStore.writeCases (D-19, Warning 8)', () => {
  it('writing 3 cases produces 3 ### Case N blocks in order', () => {
    const body = '## Problem\nx\n\n## Notes\n\n';
    const out = writeCases(body, [
      { input: 'a' },
      { input: 'b' },
      { input: 'c' },
    ]);
    expect(out).toContain('### Case 1');
    expect(out).toContain('### Case 2');
    expect(out).toContain('### Case 3');
    expect(out.indexOf('### Case 1')).toBeLessThan(out.indexOf('### Case 2'));
    expect(out.indexOf('### Case 2')).toBeLessThan(out.indexOf('### Case 3'));
  });

  it('Pitfall 5 / D-19 Warning 8: preserves inter-case user paragraph text on round-trip', () => {
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
      'note: edge case I keep missing',
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
    expect(after).toContain('note: edge case I keep missing');
  });
});
