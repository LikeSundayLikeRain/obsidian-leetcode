import { describe, it, expect } from 'vitest';
import { rewriteProblemSection } from '../src/notes/HeadingRegion';

describe('rewriteProblemSection (NOTE-06, D-08)', () => {
  it('rewrites the ## Problem body and preserves content under ## Notes', () => {
    const before = `## Problem
Old problem statement.

## Notes
User's private observations — must not be touched.
`;
    const after = rewriteProblemSection(before, 'Fresh problem statement.');
    expect(after).toContain('## Problem');
    expect(after).toContain('Fresh problem statement.');
    expect(after).not.toContain('Old problem statement.');
    expect(after).toContain('## Notes');
    expect(after).toContain("User's private observations — must not be touched.");
  });

  it('does not touch ## Solution / ## Techniques sections (Phase 4 additions)', () => {
    const before = `## Problem
Old.

## Notes
User note.

## Solution
\`\`\`python
def solve(): pass
\`\`\`

## Techniques
[[Two Pointers]]
`;
    const after = rewriteProblemSection(before, 'New.');
    expect(after).toContain('## Solution');
    expect(after).toContain('def solve(): pass');
    expect(after).toContain('## Techniques');
    expect(after).toContain('[[Two Pointers]]');
  });

  it('is a pure function (no side effects on re-invocation — safe inside vault.process retry)', () => {
    const input = `## Problem\nfoo\n\n## Notes\nbar\n`;
    const a = rewriteProblemSection(input, 'new');
    const b = rewriteProblemSection(input, 'new');
    expect(a).toBe(b);
  });
});
