import { describe, it, expect } from 'vitest';
import { injectCodeSection } from '../../src/solve/starterCodeInjector';

describe('injectCodeSection — idempotent path (SOLVE-02, D-06/D-07)', () => {
  const OPTS = { starterCode: 'def solve():\n    pass', langSlug: 'python3' };

  it('inserts ## Code section between ## Problem and ## Notes when missing', () => {
    const body = '## Problem\nA problem.\n\n## Notes\nMy notes.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    // Phase 5.3 D-04: codeBlockFor remaps python3 → python at the fence opener.
    expect(out).toContain('```python');
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
    // New recognized block present (Phase 5.3 D-04: python3 → python at write).
    expect(out).toContain('```python');
    expect(out).toContain('def solve():');
    // The old text block is still present too (inserted BEFORE, not replaced).
    expect(out).toContain('```text');
    expect(out).toContain('not really code');
    // The python block appears before the text block.
    const py = out.indexOf('```python');
    const txt = out.indexOf('```text');
    expect(py).toBeGreaterThan(0);
    expect(py).toBeLessThan(txt);
  });

  it('inserts at EOF when neither ## Problem nor ## Notes exist', () => {
    const body = 'Just a free-form note.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    // Phase 5.3 D-04: codeBlockFor remaps python3 → python at the fence opener.
    expect(out).toContain('```python');
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
    // Phase 5.3 D-04: python3 → python at the fence opener.
    expect(out).toContain('```python');
  });

  it('empty starterCode still produces a fenced block (D-04 remap applied)', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const out = injectCodeSection(body, { starterCode: '', langSlug: 'python3' });
    expect(out).toContain('```python\n\n```');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-03 Task 3 — injectCodeSection fenceKind dispatch
// (D-emit-02). Mirrors the existing fenceKind arg on forceInjectCodeSection
// (Phase 20 Plan 20-10). Three branches:
//   - fenceKind === 'leetcode-solve' AND note has v1.3 fence → rewriteFenceBody
//     short-circuit (body-only replace; opener preserved byte-for-byte).
//   - fenceKind === 'leetcode-solve' AND note has NO v1.3 fence → fall through
//     to legacy path (transitional notes still get a starter injected).
//   - fenceKind === 'legacy' OR omitted → legacy path runs verbatim.
// ─────────────────────────────────────────────────────────────────────────
describe('injectCodeSection — fenceKind dispatch (Plan 21-03 v13-emit, D-emit-02)', () => {
  it('v13-emit: fenceKind=leetcode-solve with existing v1.3 fence → rewriteFenceBody short-circuit', () => {
    const body = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '```leetcode-solve',
      'old body',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = injectCodeSection(body, {
      starterCode: 'new starter',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // Body replaced; opener preserved.
    expect(out).toContain('```leetcode-solve\nnew starter\n```');
    expect(out).not.toContain('old body');
    // Did NOT emit a sibling ```python langSlug fence (would be a Pitfall 9 leak).
    expect(out).not.toMatch(/^```python\s*$/m);
  });

  it('v13-emit: fenceKind=leetcode-solve with NO v1.3 fence → falls through to legacy path', () => {
    // Transitional shape — frontmatter says v1.3 but body has no fence yet.
    // The legacy path injects a fresh starter (Pitfall 6 behavior preserved).
    const body = '## Problem\nA problem.\n\n## Notes\nMy notes.\n';
    const out = injectCodeSection(body, {
      starterCode: 'def solve(): pass',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    expect(out).toContain('## Code');
    // Legacy fence emitted (Phase 5.3 D-04 remap python3 → python).
    expect(out).toContain('```python');
  });

  it('v13-emit: fenceKind=legacy preserves verbatim legacy behavior (no short-circuit)', () => {
    // Note has BOTH a v1.3 fence and no recognized langSlug fence — the
    // legacy path is idempotent only when a recognized langSlug fence exists.
    // With fenceKind=legacy, the v1.3 short-circuit is skipped.
    const body = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '```leetcode-solve',
      'v13 body',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = injectCodeSection(body, {
      starterCode: 'starter',
      langSlug: 'python3',
      fenceKind: 'legacy',
    });
    // The v1.3 fence body MUST be preserved unchanged — legacy path doesn't
    // know how to rewrite it (no recognized langSlug fence found).
    expect(out).toContain('```leetcode-solve\nv13 body\n```');
  });

  it('v13-emit: fenceKind omitted = legacy path (back-compat for existing callers)', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const out = injectCodeSection(body, { starterCode: 'pass', langSlug: 'python3' });
    expect(out).toContain('```python');
    expect(out).not.toContain('```leetcode-solve');
  });
});
