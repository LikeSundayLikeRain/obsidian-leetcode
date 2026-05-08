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

function makeEmptySettings(overrides: { defaultLanguage?: string | null } = {}) {
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
    const createdPath = m.spies.create.mock.calls[0]?.[0] as string | undefined;
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
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1. Two Sum.md') ?? '';
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
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1. Two Sum.md') ?? '';
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
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: pythonStarterDetail() });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const body = m.getContent('LeetCode/1. Two Sum.md') ?? '';
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
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': existingBody });
    const client = makeMockLeetCodeClient({ detail: emptyDetail });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings({ defaultLanguage: null }) as never);
    await writer.openProblem('two-sum');
    // If there is no langSlug AND no starter to inject, the NoteWriter MUST:
    //   (a) not surface a user-visible Notice (D-09 silent), and
    //   (b) not leave the note with a malformed ## Code heading (no dangling heading
    //       with no body). The simplest pre-Plan-07 contract: body is unchanged.
    const body = m.getContent('LeetCode/1. Two Sum.md') ?? '';
    // The user-facing retrofit path did NOT shout at the user.
    const hadRetrofitNotice = noticeSpy.mock.calls.some(([msg]) =>
      /retrofit|starter|code section/i.test(String(msg))
    );
    expect(hadRetrofitNotice).toBe(false);
    // Body remains structurally identical — no ## Code heading was introduced.
    expect(body).not.toContain('## Code');
  });
});
