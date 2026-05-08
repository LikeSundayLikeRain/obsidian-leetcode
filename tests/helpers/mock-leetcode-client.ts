// tests/helpers/mock-leetcode-client.ts
// Reusable mocked LC client for NoteWriter / NoteOrchestrator tests.
// Plan 04 creates the real LeetCodeClient.getProblemDetail method; this mock
// lets tests drive the (detail | null | throw) branches.
import { vi } from 'vitest';

// Mirrors the shape of LeetCodeProblemDetail from src/api/LeetCodeClient.ts
// (added in Plan 04). Kept local to avoid an import-cycle in Wave 0 when the
// source doesn't exist yet.
export interface MockProblemDetail {
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  exampleTestcases?: string;
  topicTags?: Array<{ name: string; slug: string }>;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  stats?: string;
}

export interface MakeMockClientOpts {
  /** If set, every getProblemDetail call resolves to this (or null). */
  detail?: MockProblemDetail | null;
  /** Per-slug override for detail payloads. */
  detailsBySlug?: Record<string, MockProblemDetail | null>;
  /** If set, getProblemDetail throws the corresponding error. */
  throwOn?: 'network' | 'session-expiry' | null;
}

export function makeMockLeetCodeClient(opts: MakeMockClientOpts = {}) {
  const getProblemDetail = vi.fn(async (slug: string): Promise<MockProblemDetail | null> => {
    if (opts.throwOn === 'network') throw new Error('ENOTFOUND leetcode.com');
    if (opts.throwOn === 'session-expiry') {
      const e = new Error('session expired');
      // Mirror the shape isSessionExpired detects: { response: { data: null } }
      (e as unknown as { response: { data: null } }).response = { data: null };
      throw e;
    }
    if (opts.detailsBySlug && slug in opts.detailsBySlug) {
      return opts.detailsBySlug[slug] ?? null;
    }
    return opts.detail ?? null;
  });
  return { getProblemDetail };
}

/** Shorthand for tests that need a fully-populated detail for a specific problem. */
export function makeMockDetail(id: number, slug: string, overrides: Partial<MockProblemDetail> = {}): MockProblemDetail {
  return {
    questionFrontendId: String(id),
    titleSlug: slug,
    title: overrides.title ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    content: overrides.content ?? '<p>Given an array...</p>',
    difficulty: overrides.difficulty ?? 'Easy',
    isPaidOnly: overrides.isPaidOnly ?? false,
    exampleTestcases: overrides.exampleTestcases,
    topicTags: overrides.topicTags ?? [{ name: 'Array', slug: 'array' }],
    codeSnippets: overrides.codeSnippets,
    stats: overrides.stats,
  };
}
