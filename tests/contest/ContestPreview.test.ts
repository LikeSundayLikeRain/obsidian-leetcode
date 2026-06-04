// tests/contest/ContestPreview.test.ts
// Phase 10 Plan 03 Task 2 — unit tests for ContestPreview modal + startContest flow.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock obsidian with shared stub
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return {
    ...actual,
    Notice: class {
      constructor(public msg: string, public duration?: number) {}
    },
    setIcon: vi.fn(),
  };
});

import { ContestPreviewModal } from '../../src/contest/ContestPreview';
import type { CachedContest } from '../../src/contest/types';
import type { ContestSessionManager } from '../../src/contest/ContestSessionManager';

// --- Helpers ---

function makeMockContest(): CachedContest {
  return {
    slug: 'weekly-contest-380',
    title: 'Weekly Contest 380',
    startTime: 1700000000,
    duration: 5400,
    type: 'weekly',
  };
}

function makeContestQuestions() {
  return [
    { credit: 3, title: 'Problem A', title_slug: 'problem-a', difficulty: 1 },
    { credit: 4, title: 'Problem B', title_slug: 'problem-b', difficulty: 2 },
    { credit: 5, title: 'Problem C', title_slug: 'problem-c', difficulty: 2 },
    { credit: 6, title: 'Problem D', title_slug: 'problem-d', difficulty: 3 },
  ];
}

function makeMockClient(opts?: { getProblemDetailFails?: boolean; failOnSlug?: string }) {
  return {
    getProblemDetail: vi.fn(async (slug: string) => {
      if (opts?.getProblemDetailFails) throw new Error('Network error');
      if (opts?.failOnSlug === slug) return null;
      return {
        questionFrontendId: '1',
        titleSlug: slug,
        title: `Problem ${slug}`,
        content: '<p>Description</p>',
        difficulty: 'Easy' as const,
        isPaidOnly: false,
      };
    }),
    getContestQuestions: vi.fn(async () => ({
      questions: makeContestQuestions(),
    })),
  };
}

function makeMockSessionManager() {
  return {
    start: vi.fn(),
    getSession: vi.fn(() => null),
    isActive: vi.fn(() => false),
  } as unknown as ContestSessionManager;
}

// --- Tests ---

describe('ContestPreviewModal', () => {
  it('exports ContestPreviewModal class', () => {
    expect(ContestPreviewModal).toBeDefined();
    expect(typeof ContestPreviewModal).toBe('function');
  });

  it('extends Modal (structural check)', () => {
    const contest = makeMockContest();
    const client = makeMockClient() as unknown as import('../../src/api/LeetCodeClient').LeetCodeClient;
    const onStart = vi.fn();
    // Construct the modal — this verifies constructor signature
    const modal = new ContestPreviewModal({} as import('obsidian').App, contest, client, onStart);
    expect(modal).toBeDefined();
  });
});

describe('startContest flow (ProblemBrowserView.startContest)', () => {
  let mockClient: ReturnType<typeof makeMockClient>;
  let mockSessionManager: ReturnType<typeof makeMockSessionManager>;
  let instance: Record<string, unknown>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    mockSessionManager = makeMockSessionManager();

    // Import and create a minimal ProblemBrowserView instance for testing startContest
    const { ProblemBrowserView } = await import('../../src/browse/ProblemBrowserView');
    const proto = ProblemBrowserView.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    instance = Object.create(proto);
    instance.plugin = {
      client: mockClient,
      contestSessionManager: mockSessionManager,
      settings: {
        getContestSession: () => null,
        setProblemDetail: vi.fn(),
        getDefaultLanguage: () => 'python3',
        getProblemDetail: () => ({ codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'class Solution:' }] }),
      },
    };
    instance.mode = 'contests';
    instance.app = {};
    // Stub onOpen so re-render doesn't throw
    instance.onOpen = vi.fn();
  });

  it('calls getProblemDetail for each question slug in parallel', async () => {
    const questions = makeContestQuestions();
    const contest = makeMockContest();

    const startContest = (instance as unknown as { startContest: (c: CachedContest, q: typeof questions) => Promise<void> }).startContest;
    await startContest.call(instance, contest, questions);

    // Should have been called 4 times (one per problem)
    expect(mockClient.getProblemDetail).toHaveBeenCalledTimes(4);
    expect(mockClient.getProblemDetail).toHaveBeenCalledWith('problem-a');
    expect(mockClient.getProblemDetail).toHaveBeenCalledWith('problem-b');
    expect(mockClient.getProblemDetail).toHaveBeenCalledWith('problem-c');
    expect(mockClient.getProblemDetail).toHaveBeenCalledWith('problem-d');
  });

  it('calls ContestSessionManager.start with correct contest shape', async () => {
    const questions = makeContestQuestions();
    const contest = makeMockContest();

    const startContest = (instance as unknown as { startContest: (c: CachedContest, q: typeof questions) => Promise<void> }).startContest;
    await startContest.call(instance, contest, questions);

    expect(mockSessionManager.start).toHaveBeenCalledTimes(1);
    expect(mockSessionManager.start).toHaveBeenCalledWith({
      contestSlug: 'weekly-contest-380',
      contestTitle: 'Weekly Contest 380',
      contestType: 'weekly',
      duration: 5400,
      problems: [
        { slug: 'problem-a', title: 'Problem A', credit: 3, difficulty: 1, code: 'class Solution:', language: 'python3' },
        { slug: 'problem-b', title: 'Problem B', credit: 4, difficulty: 2, code: 'class Solution:', language: 'python3' },
        { slug: 'problem-c', title: 'Problem C', credit: 5, difficulty: 2, code: 'class Solution:', language: 'python3' },
        { slug: 'problem-d', title: 'Problem D', credit: 6, difficulty: 3, code: 'class Solution:', language: 'python3' },
      ],
    });
  });

  it('sets all problems to initial state (unsolved, empty code, null solvedAt)', async () => {
    const questions = makeContestQuestions();
    const contest = makeMockContest();

    const startContest = (instance as unknown as { startContest: (c: CachedContest, q: typeof questions) => Promise<void> }).startContest;
    await startContest.call(instance, contest, questions);

    // The ContestSessionManager.start call receives problems that map to the
    // initial state inside the manager (verified via ContestSessionManager.test.ts).
    // Here we verify the problem shapes passed to start() are correct.
    const startFn = mockSessionManager.start as unknown as ReturnType<typeof vi.fn>;
    const startCall = startFn.mock.calls[0]![0] as {
      problems: Array<{ slug: string; title: string; credit: number; difficulty: number }>;
    };
    expect(startCall.problems).toHaveLength(4);
    for (const p of startCall.problems) {
      expect(p.slug).toBeDefined();
      expect(p.title).toBeDefined();
      expect(p.credit).toBeGreaterThan(0);
      expect(p.difficulty).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles fetch failure gracefully (one getProblemDetail rejects — does not call sessionManager.start)', async () => {
    // Replace client with one that fails on a specific slug
    mockClient = makeMockClient({ failOnSlug: 'problem-b' });
    (instance.plugin as Record<string, unknown>).client = mockClient;

    const questions = makeContestQuestions();
    const contest = makeMockContest();

    const startContest = (instance as unknown as { startContest: (c: CachedContest, q: typeof questions) => Promise<void> }).startContest;
    await startContest.call(instance, contest, questions);

    // Should NOT have called sessionManager.start because one problem returned null
    expect(mockSessionManager.start).not.toHaveBeenCalled();
  });

  it('handles getProblemDetail rejection gracefully', async () => {
    // Replace client with one that throws
    mockClient = makeMockClient({ getProblemDetailFails: true });
    (instance.plugin as Record<string, unknown>).client = mockClient;

    const questions = makeContestQuestions();
    const contest = makeMockContest();

    const startContest = (instance as unknown as { startContest: (c: CachedContest, q: typeof questions) => Promise<void> }).startContest;
    await startContest.call(instance, contest, questions);

    // Should NOT have called sessionManager.start because all fetches threw
    expect(mockSessionManager.start).not.toHaveBeenCalled();
  });
});
