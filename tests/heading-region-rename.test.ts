import { describe, it, expect } from 'vitest';
import { rewriteProblemSection } from '../src/notes/HeadingRegion';

describe('rewriteProblemSection (D-09 user renamed ## Problem)', () => {
  it('leaves the renamed section untouched AND re-inserts ## Problem at top (D-09 clarified)', () => {
    const before = `## My Understanding
I think this problem is about...

## Notes
More thoughts.
`;
    const after = rewriteProblemSection(before, 'REGENERATED STATEMENT');
    // D-09 clarified: user renamed ## Problem → plugin treats it as missing,
    // re-inserts its own ## Problem anchor at the top. User's renamed section
    // stays intact. Heuristic: plugin owns its known anchor; everything else
    // — including a user rename — belongs to the user.
    expect(after).toContain('## My Understanding');
    expect(after).toContain('I think this problem is about...');
    expect(after).toContain('## Notes');
    expect(after).toContain('More thoughts.');
    // Regenerated ## Problem goes in at the top, above the user's sections.
    expect(after).toContain('## Problem');
    expect(after).toContain('REGENERATED STATEMENT');
  });
});
