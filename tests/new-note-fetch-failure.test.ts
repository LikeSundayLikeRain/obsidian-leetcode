import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

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

function makeEmptySettings() {
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
    setDefaultLanguage: async () => undefined,
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter new-note fetch failure (D-13)', () => {
  it('shows Notice "Couldn\'t fetch …" and does NOT create any file on network failure', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ throwOn: 'network' });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    // D-13: a Notice containing "Couldn't fetch" (curly or straight apostrophe — either is fine)
    const matched = noticeSpy.mock.calls.find(([msg]) => /couldn.?t fetch/i.test(String(msg)));
    expect(matched).toBeDefined();
    // No partial file created.
    expect(m.spies.create).not.toHaveBeenCalled();
  });

  it('shows a clear Notice and creates no file when LC returns null (problem not found)', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: null });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('unknown-slug');
    const matched = noticeSpy.mock.calls.find(([msg]) => /not found|couldn.?t fetch/i.test(String(msg)));
    expect(matched).toBeDefined();
    expect(m.spies.create).not.toHaveBeenCalled();
  });
});
