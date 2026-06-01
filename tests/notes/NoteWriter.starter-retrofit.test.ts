// tests/notes/NoteWriter.starter-retrofit.test.ts
// RED baseline (Wave 0) — will fail until Plan 07 wires
// src/solve/starterCodeInjector into NoteWriter.openProblem /
// NoteWriter backgroundRefresh.
//
// Contracts under test (D-06, D-07, D-08, D-09):
//   D-06: NEW note body contains ## Problem → ## Code → ## Notes in order
//   D-07: EXISTING note with ## Code + recognized lang block → no overwrite
//   D-09: EXISTING note lacking ## Code → retrofit silently (no Notice, debug log only)
//   Pitfall 6: ## Code with ```text (non-starter) block → retrofit fires
//   no codeSnippets in detail → body untouched + debug log only
//
// Mirrors tests/new-note-fetch-failure.test.ts shape: vi.mock('obsidian', ...)
// for Notice, makeMockVaultApp + makeMockLeetCodeClient + makeEmptySettings.
import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from '../helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from '../helpers/mock-leetcode-client';
import { NoteWriter } from '../../src/notes/NoteWriter';

const noticeSpy = vi.fn();
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Notice: class MockNotice {
      constructor(msg: string, ms?: number) { noticeSpy(msg, ms); }
    },
  };
});

function makeEmptySettings(
  overrides: { defaultLanguage?: string | null; useInlineWidget?: boolean } = {},
) {
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () =>
      overrides.defaultLanguage === undefined ? 'python3' : overrides.defaultLanguage ?? '',
    setDefaultLanguage: async () => undefined,
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
    // Phase 21 Plan 21-13 — when `overrides.useInlineWidget` is undefined the
    // factory OMITS the getter entirely (back-compat for legacy fixtures); when
    // a boolean is supplied it returns a closure exposing the chosen value.
    ...(overrides.useInlineWidget === undefined
      ? {}
      : { getUseInlineWidget: () => overrides.useInlineWidget === true }),
  };
}

function pythonStarterDetail(slug: string = 'two-sum') {
  return makeMockDetail(1, slug, {
    content: '<p>Given an array of integers...</p>',
    codeSnippets: [
      { lang: 'Python3', langSlug: 'python3', code: 'class Solution:\n    def twoSum(self, nums, target):\n        pass' },
      { lang: 'Java', langSlug: 'java', code: 'class Solution { public int[] twoSum(int[] nums, int target) {} }' },
    ],
  });
}

describe('NoteWriter starter-code retrofit (D-06, D-07, D-09, Pitfall 6)', () => {
  it('D-06: new note body contains ## Problem → ## Code → ## Notes in that order', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    // Find the created note's body.
    const createdPath = m.spies.create.mock.calls[0]?.[0];
    expect(createdPath).toBeDefined();
    const body = m.getContent(createdPath!) ?? '';
    expect(body).toContain('## Problem');
    expect(body).toContain('## Code');
    expect(body).toContain('## Notes');
    expect(body.indexOf('## Problem')).toBeLessThan(body.indexOf('## Code'));
    expect(body.indexOf('## Code')).toBeLessThan(body.indexOf('## Notes'));
    // Starter code injected under ## Code.
    expect(body).toContain('class Solution:');
  });

  it('existing note with ## Problem + ## Notes but no ## Code gets retrofit between them; ## Notes content preserved verbatim', async () => {
    noticeSpy.mockClear();
    const existingBody = [
      '---',
      'slug: two-sum',
      '---',
      '',
      '## Problem',
      'existing problem body',
      '',
      '## Notes',
      "User's private observations — must not be touched.",
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(body).toContain('## Code');
    expect(body.indexOf('## Problem')).toBeLessThan(body.indexOf('## Code'));
    expect(body.indexOf('## Code')).toBeLessThan(body.indexOf('## Notes'));
    // User's existing Notes content survives.
    expect(body).toContain("User's private observations — must not be touched.");
    // No Notice fired for this silent retrofit (D-09).
    const hadRetrofitNotice = noticeSpy.mock.calls.some(([msg]) =>
      /retrofit|starter|code section/i.test(String(msg))
    );
    expect(hadRetrofitNotice).toBe(false);
  });

  it('D-07: existing note with ## Code + ```python3 block — re-opening does NOT overwrite user code', async () => {
    noticeSpy.mockClear();
    const existingBody = [
      '---',
      'slug: two-sum',
      '---',
      '',
      '## Problem',
      'problem body',
      '',
      '## Code',
      '',
      '```python3',
      'class Solution:',
      '    # My work in progress — do not touch',
      '    def twoSum(self, nums, target):',
      '        return [nums[0], nums[1]]',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    // User's code survives verbatim.
    expect(body).toContain('# My work in progress — do not touch');
    expect(body).toContain('return [nums[0], nums[1]]');
  });

  it('Pitfall 6: existing note with ## Code + ```text pseudo block — retrofit places starter above; pseudo-code preserved', async () => {
    noticeSpy.mockClear();
    const existingBody = [
      '---',
      'slug: two-sum',
      '---',
      '',
      '## Problem',
      'problem body',
      '',
      '## Code',
      '',
      '```text',
      'PSEUDO: hash map pass, single pass',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    // Starter inserted (langSlug match on python3).
    expect(body).toContain('class Solution:');
    // Pseudo-code preserved (Pitfall 6: text blocks are non-starter).
    expect(body).toContain('PSEUDO: hash map pass, single pass');
  });

  it('D-09: settings has no default language AND detail has no codeSnippets → body unchanged, no Notice', async () => {
    noticeSpy.mockClear();
    // Detail without codeSnippets.
    const emptyDetail = makeMockDetail(1, 'two-sum', { codeSnippets: undefined });
    const existingBody = [
      '---',
      'slug: two-sum',
      '---',
      '',
      '## Problem',
      'body',
      '',
      '## Notes',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: emptyDetail });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings({ defaultLanguage: null }) as never);
    await writer.openProblem('two-sum');
    // If there is no langSlug AND no starter to inject, the NoteWriter MUST:
    //   (a) not surface a user-visible Notice (D-09 silent), and
    //   (b) not leave the note with a malformed ## Code heading (no dangling heading
    //       with no body). The simplest pre-Plan-07 contract: body is unchanged.
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    // The user-facing retrofit path did NOT shout at the user.
    const hadRetrofitNotice = noticeSpy.mock.calls.some(([msg]) =>
      /retrofit|starter|code section/i.test(String(msg))
    );
    expect(hadRetrofitNotice).toBe(false);
    // Body remains structurally identical — no ## Code heading was introduced.
    expect(body).not.toContain('## Code');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 21 Plan 21-13 — NoteWriter retrofit useInlineWidget gating (Post-UAT
// Gap B closure). Tests assert the SOURCE BYTES of the created file (NOT
// rendered DOM) — the post-UAT diagnosis is explicit that the bug is in the
// writer, not the renderer.
//
// Defense-in-depth: NoteWriter.retrofitStarterCode short-circuits when
// useInlineWidget=true (the v1.3 widget owns its own fence body via
// vault.process; retrofit is structurally meaningless). Combined with the
// fenceKind plumbing in retrofit() (Test U1/U4/U5), the four NoteWriter
// retrofit call sites (lines 272, 343, 419, 453) are protected at TWO layers.
//
// Threat-model recap: Plan 21-13 changes vault-write behavior on retrofit
// only. Writes still go through `app.vault.process(file, fn)` — the
// canonical CF-06 / L8 primitive. No CM6 dispatches, no `'leetcode.*'`
// userEvent rule applies. No new trust boundary crossed.
// ─────────────────────────────────────────────────────────────────────────
describe('NoteWriter retrofit useInlineWidget gating — Post-UAT Gap B (Plan 21-13)', () => {
  /** Counts fence opener lines (` ```\S+ `) in a note body. */
  function countFenceOpeners(text: string): number {
    return (text.match(/^\s*```\S+\s*$/gm) ?? []).length;
  }
  /** Counts closing fence lines (` ``` ` alone). */
  function countFenceClosers(text: string): number {
    return (text.match(/^```\s*$/gm) ?? []).length;
  }

  it('I1 (HEADLINE Gap B regression): openProblem on a fresh problem with useInlineWidget=true writes a SINGLE-fence note (one ```leetcode-solve, ZERO ```<langSlug> siblings)', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail('palindrome-number') });
    const writer = new NoteWriter(
      m.app as never,
      client as never,
      makeEmptySettings({ useInlineWidget: true }) as never,
    );
    await writer.openProblem('palindrome-number');
    const createdPath = m.spies.create.mock.calls[0]?.[0];
    expect(createdPath).toBeDefined();
    const body = m.getContent(createdPath!) ?? '';
    // (a) ## Code appears exactly once.
    expect((body.match(/^## Code$/gm) ?? []).length).toBe(1);
    // (b) Exactly one fence opener (a ` ```leetcode-solve ` opener).
    expect(countFenceOpeners(body)).toBe(1);
    expect(body).toMatch(/^```leetcode-solve\s*$/m);
    // (c) Exactly one closing fence.
    expect(countFenceClosers(body)).toBe(1);
    // (d) NO sibling ```<langSlug> fence under ## Code (the bug symptom).
    expect(body).not.toMatch(/^```python\s*$/m);
    expect(body).not.toMatch(/^```java\s*$/m);
    // (e) Starter code appears exactly once (no duplicate-fence stacking).
    const starterMatches = body.match(/class Solution:/g) ?? [];
    expect(starterMatches.length).toBe(1);
  });

  it('I2 (re-open path, line 272): opening an existing v1.3-shaped note with useInlineWidget=true does NOT graft a sibling fence', async () => {
    noticeSpy.mockClear();
    // Pre-existing v1.3-shaped note on disk + cached detail in settings.
    const existingBody = [
      '---',
      'lc-slug: two-sum',
      'lc-language: python3',
      '---',
      '',
      '## Problem',
      'problem body',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'class Solution:',
      '    pass',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    // Fresh detail (so any retrofit invocation can rewrite the body if it runs).
    const detail = pythonStarterDetail('two-sum');
    const client = makeMockLeetCodeClient({ detail });
    // Seed cached detail so the re-open branch (line 272) fires.
    const settings = makeEmptySettings({ useInlineWidget: true }) as ReturnType<
      typeof makeEmptySettings
    >;
    void settings.setProblemDetail('two-sum', {
      fetchedAt: Date.now(),
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>...</p>',
      topicSlugs: [],
      codeSnippets: detail.codeSnippets,
    });
    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    // No sibling fence grafted.
    expect(countFenceOpeners(body)).toBe(1);
    expect(body).toMatch(/^```leetcode-solve\s*$/m);
    expect(body).not.toMatch(/^```python\s*$/m);
  });

  it('I3 (cache-cleared recovery, line 343): with useInlineWidget=true preserves single-fence shape', async () => {
    noticeSpy.mockClear();
    // Pre-existing v1.3 file on disk; settings cache CLEARED so the re-open
    // branch (line 252-282) falls through and existingAtCanonical (line 330-
    // 360) runs.
    const existingBody = [
      '---',
      'lc-slug: two-sum',
      'lc-language: python3',
      '---',
      '',
      '## Problem',
      'old problem body',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'class Solution:',
      '    pass',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail('two-sum') });
    // No cached detail seeded — drives execution into existingAtCanonical branch.
    const writer = new NoteWriter(
      m.app as never,
      client as never,
      makeEmptySettings({ useInlineWidget: true }) as never,
    );
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(countFenceOpeners(body)).toBe(1);
    expect(body).toMatch(/^```leetcode-solve\s*$/m);
    expect(body).not.toMatch(/^```python\s*$/m);
  });

  it('I4 (backgroundRefresh, line 453): with useInlineWidget=true preserves single-fence shape on TTL-stale re-open', async () => {
    noticeSpy.mockClear();
    const existingBody = [
      '---',
      'lc-slug: two-sum',
      'lc-language: python3',
      '---',
      '',
      '## Problem',
      'old body',
      '',
      '## Code',
      '',
      '```leetcode-solve',
      'class Solution:',
      '    pass',
      '```',
      '',
      '## Notes',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': existingBody });
    const detail = pythonStarterDetail('two-sum');
    const client = makeMockLeetCodeClient({ detail });
    const settings = makeEmptySettings({ useInlineWidget: true }) as ReturnType<
      typeof makeEmptySettings
    >;
    // Seed a STALE cache entry so cacheStale=true and backgroundRefresh fires.
    const stale = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days old
    void settings.setProblemDetail('two-sum', {
      fetchedAt: stale,
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>...</p>',
      topicSlugs: [],
      codeSnippets: detail.codeSnippets,
    });
    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.openProblem('two-sum');
    // Allow backgroundRefresh microtasks to settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const body = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(countFenceOpeners(body)).toBe(1);
    expect(body).toMatch(/^```leetcode-solve\s*$/m);
    expect(body).not.toMatch(/^```python\s*$/m);
  });

  it('I5 (legacy preservation): openProblem with useInlineWidget=false still emits a ```<langSlug> fence (no regression for v1.2 users)', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail('two-sum') });
    const writer = new NoteWriter(
      m.app as never,
      client as never,
      makeEmptySettings({ useInlineWidget: false }) as never,
    );
    await writer.openProblem('two-sum');
    const createdPath = m.spies.create.mock.calls[0]?.[0];
    const body = m.getContent(createdPath!) ?? '';
    // Legacy emitter: ```python (Phase 5.3 D-04 remap python3 → python).
    expect(body).toMatch(/^```python\s*$/m);
    // No leetcode-solve fence on the legacy path.
    expect(body).not.toContain('```leetcode-solve');
    expect(body).toContain('class Solution:');
  });

  it('I6 (back-compat): settings WITHOUT getUseInlineWidget treated as legacy (no regression for older fixtures)', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail('two-sum') });
    // makeEmptySettings() with no useInlineWidget override OMITS the getter entirely.
    const writer = new NoteWriter(
      m.app as never,
      client as never,
      makeEmptySettings() as never,
    );
    await writer.openProblem('two-sum');
    const createdPath = m.spies.create.mock.calls[0]?.[0];
    const body = m.getContent(createdPath!) ?? '';
    // Legacy emitter: ```python.
    expect(body).toMatch(/^```python\s*$/m);
    expect(body).not.toContain('```leetcode-solve');
  });
});
