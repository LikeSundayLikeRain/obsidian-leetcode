import { describe, it, expect, vi } from 'vitest';
import { injectCodeSection, retrofit } from '../../src/solve/starterCodeInjector';

describe('injectCodeSection — idempotent path (SOLVE-02, D-06/D-07)', () => {
  const OPTS = { starterCode: 'def solve():\n    pass', langSlug: 'python3' };

  it('inserts ## Code section between ## Problem and ## Notes when missing', () => {
    const body = '## Problem\nA problem.\n\n## Notes\nMy notes.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    // Phase 22 v1.3: codeBlockFor emits the ```leetcode-solve opener regardless of langSlug.
    expect(out).toContain('```leetcode-solve');
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
    // Phase 22 v1.3: codeBlockFor emits ```leetcode-solve regardless of langSlug.
    expect(out).toContain('```leetcode-solve');
    expect(out).toContain('def solve():');
    // The old text block is still present too (inserted BEFORE, not replaced).
    expect(out).toContain('```text');
    expect(out).toContain('not really code');
    // The leetcode-solve block appears before the text block.
    const py = out.indexOf('```leetcode-solve');
    const txt = out.indexOf('```text');
    expect(py).toBeGreaterThan(0);
    expect(py).toBeLessThan(txt);
  });

  it('inserts at EOF when neither ## Problem nor ## Notes exist', () => {
    const body = 'Just a free-form note.\n';
    const out = injectCodeSection(body, OPTS);
    expect(out).toContain('## Code');
    // Phase 22 v1.3: codeBlockFor emits ```leetcode-solve regardless of langSlug.
    expect(out).toContain('```leetcode-solve');
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
    // Phase 22 v1.3: codeBlockFor emits ```leetcode-solve regardless of langSlug.
    expect(out).toContain('```leetcode-solve');
  });

  it('empty starterCode still produces a fenced block (Phase 22 v1.3 emitter)', () => {
    const body = '## Problem\nX\n\n## Notes\n';
    const out = injectCodeSection(body, { starterCode: '', langSlug: 'python3' });
    expect(out).toContain('```leetcode-solve\n\n```');
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
    // Phase 22 v1.3: codeBlockFor emits ```leetcode-solve regardless of langSlug.
    expect(out).toContain('```leetcode-solve');
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
    // Phase 22 v1.3: codeBlockFor unconditionally emits ```leetcode-solve;
    // langSlug remains a parameter for back-compat but is no longer reflected
    // in the fence opener.
    expect(out).toContain('```leetcode-solve');
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
    // Phase 22 v1.3: codeBlockFor emits ```leetcode-solve regardless of langSlug.
    expect(out).toContain('```leetcode-solve');
    expect(out).toContain('NEW');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-13 — retrofit() fenceKind plumbing (Post-UAT Gap B
// closure). The bug: `retrofit()` calls `injectCodeSection` WITHOUT a
// `fenceKind` argument; on a v1.3 note that already has a leetcode-solve
// fence under ## Code, the legacy path runs and grafts a sibling
// ```<langSlug> fence on top — DATA CORRUPTION on every fresh problem-open.
//
// Threat-model + write-path hygiene: retrofit dispatches via
// `app.vault.process(file, fn)` (CF-06 / L8). No CM6 dispatches; the
// `'leetcode.*'` userEvent rule (Phase 05.5) does NOT apply. The injected
// `fn` is a pure-string transform around `injectCodeSection`; no new write
// path introduced.
// ─────────────────────────────────────────────────────────────────────────
describe('retrofit() fenceKind plumbing — Post-UAT Gap B (Plan 21-13)', () => {
  /**
   * Helper — build a captured-callback vault.process spy. The capture lets
   * tests run the closure synchronously against any input string without
   * needing a real Obsidian vault.
   */
  function makeProcessSpy() {
    let captured: ((current: string) => string) | null = null;
    const process = vi.fn(async (_file: unknown, fn: (current: string) => string) => {
      captured = fn;
      return fn('');
    });
    const app = { vault: { process } } as unknown as Parameters<typeof retrofit>[0];
    const file = { path: 'LeetCode/1-foo.md' } as unknown as Parameters<typeof retrofit>[1];
    return {
      app,
      file,
      process,
      run(input: string): string {
        if (!captured) throw new Error('vault.process callback never captured');
        return captured(input);
      },
    };
  }

  /** Counts the number of fence opener lines (` ```\S+ `) in a note body. */
  function countFenceOpeners(text: string): number {
    return (text.match(/^\s*```\S+\s*$/gm) ?? []).length;
  }

  const PYTHON_DETAIL = {
    fetchedAt: Date.now(),
    id: 1,
    title: 'Foo',
    difficulty: 'Easy' as const,
    url: 'https://leetcode.com/problems/foo/',
    contentHtml: '<p>foo</p>',
    topicSlugs: [],
    codeSnippets: [
      { lang: 'Python3', langSlug: 'python3', code: 'class Solution:\n    pass' },
    ],
  };

  it('U1: retrofit threads fenceKind=leetcode-solve unconditionally (Phase 22 — useInlineWidget gate retired) → rewriteFenceBody short-circuit, single fence opener preserved', async () => {
    const spy = makeProcessSpy();
    const settings = {
      getDefaultLanguage: () => 'python3',
    };
    const existing = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'OLD',
      'BODY',
      '```',
      '',
      '## Notes',
    ].join('\n');
    await retrofit(spy.app, spy.file, PYTHON_DETAIL as never, settings);
    const out = spy.run(existing);
    // Exactly ONE fence opener — body replaced via rewriteFenceBody.
    expect(countFenceOpeners(out)).toBe(1);
    expect(out).toMatch(/^```leetcode-solve\s*$/m);
    // No sibling ```python graft.
    expect(out).not.toMatch(/^```python\s*$/m);
    // Body now has the trimmed starter.
    expect(out).toContain('class Solution:');
    expect(out).not.toContain('OLD\nBODY');
  });

  it('U4: retrofit on a v1.3-shaped note with matching starter is byte-equal idempotent', async () => {
    const spy = makeProcessSpy();
    const settings = {
      getDefaultLanguage: () => 'python3',
    };
    // Body content matches what `retrofit` will derive (trimmed starter).
    const existing = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'class Solution:',
      '    pass',
      '```',
      '',
      '## Notes',
    ].join('\n');
    await retrofit(spy.app, spy.file, PYTHON_DETAIL as never, settings);
    const out = spy.run(existing);
    // Idempotent — output equals input byte-for-byte.
    expect(out).toBe(existing);
  });

  it('U5: retrofit on v1.3 note with DIFFERENT starter rewrites body, opener byte-for-byte preserved, ZERO sibling fences', async () => {
    const spy = makeProcessSpy();
    const settings = {
      getDefaultLanguage: () => 'python3',
    };
    const existing = [
      '## Problem',
      'A problem.',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'OLD STARTER',
      '```',
      '',
      '## Notes',
    ].join('\n');
    await retrofit(spy.app, spy.file, PYTHON_DETAIL as never, settings);
    const out = spy.run(existing);
    // Exactly one fence opener.
    expect(countFenceOpeners(out)).toBe(1);
    // The opener is leetcode-solve.
    expect(out).toMatch(/^```leetcode-solve\s*$/m);
    // ZERO ```python siblings.
    expect(out).not.toMatch(/^```python\s*$/m);
    // Body replaced.
    expect(out).toContain('class Solution:');
    expect(out).not.toContain('OLD STARTER');
  });
});
