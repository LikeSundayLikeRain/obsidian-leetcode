import { describe, it, expect } from 'vitest';
import { readCases, writeCases } from '../../src/solve/CaseRegion';

describe('readCases (SOLVE-04, D-18)', () => {
  it('returns [] when the `## Custom Tests` section is absent', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    expect(readCases(body)).toEqual([]);
  });

  it('returns [] when the section exists but has no `### Case` subheadings', () => {
    const body = '## Custom Tests\n\nsome user note\n';
    expect(readCases(body)).toEqual([]);
  });

  it('reads a single case block', () => {
    const body = [
      '## Custom Tests',
      '',
      '### Case 1',
      '```text',
      '[3,2,4]',
      '6',
      '```',
      '',
    ].join('\n');
    expect(readCases(body)).toEqual(['[3,2,4]\n6']);
  });

  it('reads multiple case blocks in numeric order', () => {
    const body = [
      '## Custom Tests',
      '',
      '### Case 1',
      '```text',
      'first',
      '```',
      '',
      '### Case 2',
      '```text',
      'second',
      '```',
      '',
      '### Case 3',
      '```text',
      'third',
      '```',
    ].join('\n');
    expect(readCases(body)).toEqual(['first', 'second', 'third']);
  });

  it('stops reading at the next `## ` heading', () => {
    const body = [
      '## Custom Tests',
      '### Case 1',
      '```text',
      'x',
      '```',
      '',
      '## Notes',
      '### Case 99',
      '```text',
      'not-a-case',
      '```',
    ].join('\n');
    expect(readCases(body)).toEqual(['x']);
  });
});

describe('writeCases (SOLVE-04, D-18, D-19)', () => {
  it('leaves body unchanged when cases is empty and section does not exist (lazy, D-18)', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    expect(writeCases(body, [])).toBe(body);
  });

  it('appends `## Custom Tests` at EOF when section did not exist', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const out = writeCases(body, ['hello']);
    expect(out).toContain('## Custom Tests');
    expect(out).toContain('### Case 1');
    expect(out).toContain('```text\nhello\n```');
    // Original content preserved.
    expect(out).toContain('## Problem');
    expect(out).toContain('## Notes');
  });

  it('removes the entire region when cases becomes empty but region existed', () => {
    const body = [
      '## Problem',
      'foo',
      '',
      '## Custom Tests',
      '',
      '### Case 1',
      '```text',
      'x',
      '```',
      '',
      '## Notes',
      'bar',
      '',
    ].join('\n');
    const out = writeCases(body, []);
    expect(out).not.toContain('## Custom Tests');
    expect(out).not.toContain('### Case 1');
    expect(out).toContain('## Problem');
    expect(out).toContain('## Notes');
    expect(out).toContain('bar');
  });

  it('roundtrips: readCases(writeCases(body, cases)) === cases', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const cases = ['alpha', 'beta\nwith newline', 'gamma'];
    const afterWrite = writeCases(body, cases);
    expect(readCases(afterWrite)).toEqual(cases);
  });

  it('preserves INTER-case user paragraph text verbatim on write-back (D-19 full round-trip, Warning 8 fix)', () => {
    const input = [
      '## Custom Tests',
      '',
      'Notes about my test strategy.',
      '',
      '### Case 1',
      '```text',
      'input-a',
      '```',
      '',
      'Inter-case paragraph — must survive round-trip.',
      '',
      '### Case 2',
      '```text',
      'input-b',
      '```',
      '',
      'Trailing user commentary.',
      '',
    ].join('\n');

    // readCases extracts just the case contents.
    const cases = readCases(input);
    expect(cases).toEqual(['input-a', 'input-b']);

    // writeCases with the same cases must preserve the inter-case free text.
    const output = writeCases(input, cases);
    expect(output).toContain('Notes about my test strategy.');
    expect(output).toContain('Inter-case paragraph — must survive round-trip.');
    expect(output).toContain('Trailing user commentary.');
  });

  it('is pure — same input returns same output', () => {
    const body = '## Problem\nfoo\n\n## Notes\nbar\n';
    const a = writeCases(body, ['x', 'y']);
    const b = writeCases(body, ['x', 'y']);
    expect(a).toBe(b);
  });

  it('renumbers cases sequentially even when existing numbering is non-sequential', () => {
    // Existing body has Case 1 and Case 5 (gap).
    const body = [
      '## Custom Tests',
      '',
      '### Case 1',
      '```text',
      'first',
      '```',
      '',
      '### Case 5',
      '```text',
      'fifth',
      '```',
    ].join('\n');
    const out = writeCases(body, ['updated-first', 'updated-fifth']);
    expect(out).toContain('### Case 1');
    expect(out).toContain('### Case 2');
    expect(out).not.toContain('### Case 5');
  });

  it('drops trailing cases when new `cases` has fewer entries than existing', () => {
    const body = [
      '## Custom Tests',
      '',
      '### Case 1',
      '```text',
      'a',
      '```',
      '',
      '### Case 2',
      '```text',
      'b',
      '```',
      '',
      '### Case 3',
      '```text',
      'c',
      '```',
    ].join('\n');
    const out = writeCases(body, ['new-a']);
    expect(readCases(out)).toEqual(['new-a']);
  });

  it('appends new cases beyond existing count', () => {
    const body = [
      '## Custom Tests',
      '',
      '### Case 1',
      '```text',
      'a',
      '```',
    ].join('\n');
    const out = writeCases(body, ['a', 'b', 'c']);
    expect(readCases(out)).toEqual(['a', 'b', 'c']);
  });
});
