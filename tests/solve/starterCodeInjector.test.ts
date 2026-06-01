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

// ─────────────────────────────────────────────────────────────────────────
// Plan 21-07 Task 3 — WR-07 closure. injectCodeSection's v1.3 short-circuit
// targets the FIRST leetcode-solve fence INSIDE ## Code (not the first
// leetcode-solve fence in the WHOLE FILE). Mirrors forceInjectCodeSection's
// ## Code-scoped discipline. Multi-fence corner cases — stray
// ```leetcode-solve in ## Problem or ## Notes — no longer corrupt the
// wrong fence.
// ─────────────────────────────────────────────────────────────────────────
describe('injectCodeSection — WR-07-fix ## Code-scoped fence index (Plan 21-07)', () => {
  it('WR-07-fix Test A — happy path (single v1.3 fence in ## Code) replaces body', () => {
    const body = [
      '## Code',
      '',
      '```leetcode-solve',
      'old body',
      '```',
      '',
    ].join('\n');
    const out = injectCodeSection(body, {
      starterCode: 'new body',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    expect(out).toContain('```leetcode-solve\nnew body\n```');
    expect(out).not.toContain('old body');
  });

  it("WR-07-fix Test B — stray leetcode-solve in ## Notes (BELOW ## Code) — only ## Code's fence rewritten", () => {
    const body = [
      '## Code',
      '',
      '```leetcode-solve',
      'actual body',
      '```',
      '',
      '## Notes',
      '',
      'Reference:',
      '',
      '```leetcode-solve',
      'example',
      '```',
      '',
    ].join('\n');
    const out = injectCodeSection(body, {
      starterCode: 'NEW',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // ## Code fence rewritten; ## Notes example fence preserved.
    expect(out).toContain('```leetcode-solve\nNEW\n```');
    expect(out).toContain('```leetcode-solve\nexample\n```');
    expect(out).not.toContain('actual body');
    // Order preserved: NEW (in ## Code) appears BEFORE example (in ## Notes).
    const newIdx = out.indexOf('NEW');
    const exampleIdx = out.indexOf('example');
    expect(newIdx).toBeGreaterThan(0);
    expect(exampleIdx).toBeGreaterThan(newIdx);
  });

  it("WR-07-fix Test C — stray leetcode-solve in ## Problem (ABOVE ## Code) — ONLY ## Code's fence rewritten (regression case)", () => {
    // This is the WR-07 regression case: pre-21-07, the wrong fence (the
    // ## Problem one) would be overwritten because rewriteFenceBody(text, 0)
    // targets the FIRST leetcode-solve opener regardless of section.
    const body = [
      '## Problem',
      '',
      'For reference:',
      '',
      '```leetcode-solve',
      'example',
      '```',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'actual body',
      '```',
      '',
    ].join('\n');
    const out = injectCodeSection(body, {
      starterCode: 'NEW',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // The ## Problem reference fence is preserved.
    expect(out).toContain('```leetcode-solve\nexample\n```');
    // The ## Code fence got the new body.
    expect(out).toContain('```leetcode-solve\nNEW\n```');
    // The original ## Code body is replaced.
    expect(out).not.toContain('actual body');
    // Order: example (in ## Problem) BEFORE NEW (in ## Code).
    const exampleIdx = out.indexOf('example');
    const newIdx = out.indexOf('NEW');
    expect(exampleIdx).toBeGreaterThan(0);
    expect(newIdx).toBeGreaterThan(exampleIdx);
  });

  it('WR-07-fix Test D — no v1.3 fence in ## Code (helper returns null) — falls through to legacy path', () => {
    const body = [
      '## Code',
      '',
      '```python',
      'legacy',
      '```',
      '',
    ].join('\n');
    const out = injectCodeSection(body, {
      starterCode: 'NEW',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // Legacy python fence is recognized (idempotent); injectCodeSection
    // returns the body unchanged via D-07 idempotency contract.
    expect(out).toContain('```python');
    expect(out).toContain('legacy');
    expect(out).not.toContain('NEW');
  });

  it('WR-07-fix Test E — no ## Code section at all — falls through to legacy path which creates ## Code', () => {
    const body = '## Notes\n\n```leetcode-solve\nfencey\n```\n';
    const out = injectCodeSection(body, {
      starterCode: 'NEW',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // The stray ```leetcode-solve in ## Notes is preserved.
    expect(out).toContain('```leetcode-solve\nfencey\n```');
    // The legacy path creates a ## Code section.
    expect(out).toContain('## Code');
    expect(out).toContain('```python');
    expect(out).toContain('NEW');
  });
});
