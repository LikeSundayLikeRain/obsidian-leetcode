import { describe, it, expect } from 'vitest';
import { rewriteProblemSection } from '../src/notes/HeadingRegion';

describe('rewriteProblemSection (D-09 missing ## Problem heading)', () => {
  it('re-inserts ## Problem above ## Notes when the heading is missing', () => {
    const before = `## Notes
User's pre-existing notes.
`;
    const after = rewriteProblemSection(before, 'Restored problem text.');
    const problemIdx = after.indexOf('## Problem');
    const notesIdx = after.indexOf('## Notes');
    expect(problemIdx).toBeGreaterThanOrEqual(0);
    expect(notesIdx).toBeGreaterThan(problemIdx);
    expect(after).toContain('Restored problem text.');
    expect(after).toContain("User's pre-existing notes.");
  });

  it('re-inserts ## Problem at the top of an empty document', () => {
    const after = rewriteProblemSection('', 'Fresh.');
    expect(after).toContain('## Problem');
    expect(after).toContain('Fresh.');
  });
});
