import { describe, it, expect } from 'vitest';
import { forceInjectCodeSection } from '../../src/solve/starterCodeInjector';

describe('forceInjectCodeSection — forced path (Blocker 2 fix, D-07 on-demand)', () => {
  const NEW_STARTER = 'def solve():\n    # new';
  const OPTS = { starterCode: NEW_STARTER, langSlug: 'python3' };

  it('UNCONDITIONALLY replaces an existing recognized-langSlug block', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```python3',
      'user wrote this — will be replaced',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, OPTS);
    expect(out).toContain('# new');
    expect(out).not.toContain('user wrote this — will be replaced');
  });

  it('falls back to injectCodeSection behavior when ## Code does not exist', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const out = forceInjectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    expect(out).toContain('# new');
  });

  it('inserts starter at top of section when ## Code has no recognized block', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```text',
      'unrelated',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, OPTS);
    // Phase 22 v1.3 unification: codeBlockFor emits only ```leetcode-solve.
    expect(out).toContain('```leetcode-solve');
    expect(out).toContain('# new');
    // Existing text block preserved.
    expect(out).toContain('```text');
    expect(out).toContain('unrelated');
  });

  it('replaces only the FIRST recognized block; leaves additional blocks alone', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```python3',
      'first',
      '```',
      '',
      '```java',
      'second',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, OPTS);
    // First block replaced.
    expect(out).toContain('# new');
    expect(out).not.toContain('first');
    // Second block preserved.
    expect(out).toContain('```java');
    expect(out).toContain('second');
  });

  it('is pure — same input returns same output', () => {
    const body = '## Problem\nX\n\n## Code\n```python3\nold\n```\n';
    const a = forceInjectCodeSection(body, OPTS);
    const b = forceInjectCodeSection(body, OPTS);
    expect(a).toBe(b);
  });

  it('switches language: python3 → java replaces the python3 block', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```python3',
      'python-code',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, {
      starterCode: 'class Solution {}',
      langSlug: 'java',
    });
    // Phase 22 v1.3 unification: starter blocks are emitted with the
    // ```leetcode-solve opener regardless of langSlug. The langSlug is now
    // a frontmatter / runtime attribute — not the fence tag.
    expect(out).toContain('```leetcode-solve');
    expect(out).toContain('class Solution {}');
    expect(out).not.toContain('python-code');
  });
});

// =============================================================================
// Phase 20 Plan 20-10 (gap-closure T9 underlying / T10 — DATA CORRUPTION).
//
// fenceKind: 'leetcode-solve' short-circuits forceInjectCodeSection to the
// existing rewriteFenceBody primitive (src/widget/fenceSerialization.ts:141)
// when the note already contains a v1.3 fence. The leetcode-solve opener is
// preserved byte-for-byte (no langSlug-tagged sibling fence grafted on top).
//
// Legacy path (fenceKind === 'legacy' or omitted) is unchanged — the cases
// in the describe block above continue to pass byte-for-byte.
// =============================================================================
describe('forceInjectCodeSection — fenceKind: leetcode-solve short-circuit (Plan 20-10)', () => {
  it('Case A: replaces leetcode-solve fence body in place; opener stays verbatim', () => {
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```leetcode-solve',
      'OLD_CODE',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, {
      starterCode: 'class S: pass',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // Opener preserved verbatim (no langSlug graft).
    expect(out).toMatch(/^```leetcode-solve$/m);
    // No sibling ```python / ```python3 fence injected.
    expect(out).not.toMatch(/^```python\d?$/m);
    // Body replaced with new starter.
    expect(out).toContain('class S: pass');
    expect(out).not.toContain('OLD_CODE');
    // ## Notes preserved.
    expect(out).toContain('## Notes');
  });

  // Phase 22 v1.2 path removal: Case B and Case C deleted — they pinned
  // the legacy langSlug-tagged fence path (```python / ```java / ```python3)
  // that no longer exists. The widget is now the only path and
  // forceInjectCodeSection unconditionally emits ```leetcode-solve.

  it('Case D (malformed v1.3 fence): unterminated leetcode-solve opener returns input unchanged', () => {
    // rewriteFenceBody's documented contract: returns input unchanged when
    // the fence is unterminated (no `\`\`\`` closer line before the next
    // H2 / next non-LC tagged opener / EOF). This matches the property
    // tests in tests/widget/fenceSerialization.property.test.ts. We honor
    // that contract here — no spurious starter graft, no exception.
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```leetcode-solve',
      'NO_CLOSER',
    ].join('\n');
    const out = forceInjectCodeSection(body, {
      starterCode: 'class S: pass',
      langSlug: 'python3',
      fenceKind: 'leetcode-solve',
    });
    // Input echoed verbatim — no starter graft, no closer fabricated.
    expect(out).toBe(body);
  });

  it('Case E (multiple langSlug fences AROUND a leetcode-solve fence): body-only replace inside the v1.3 fence', () => {
    // Defensive — in the unlikely event a note has both a leetcode-solve
    // and other langSlug fences in the same section, the v1.3 fence is
    // the one that gets the body-only replace; the surrounding fences
    // are sibling content and stay untouched.
    const body = [
      '## Problem',
      'X',
      '',
      '## Code',
      '```leetcode-solve',
      'OLD_CODE',
      '```',
      '',
      '## Notes',
    ].join('\n');
    const out = forceInjectCodeSection(body, {
      starterCode: 'NEW_BODY',
      langSlug: 'java',
      fenceKind: 'leetcode-solve',
    });
    expect(out).toMatch(/^```leetcode-solve$/m);
    expect(out).toContain('NEW_BODY');
    expect(out).not.toContain('OLD_CODE');
  });
});
