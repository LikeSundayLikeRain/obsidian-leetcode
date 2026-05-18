// tests/contest/revisitTag.test.ts
// Phase 10 Plan 06 — Unit tests for #revisit tagging on missed problems.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  finalizeContest,
  type FinalizeContestArgs,
  type ContestFinalizerSettings,
} from '../../src/contest/ContestFinalizer';
import type { ContestSession } from '../../src/contest/types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────────────

function createMockSession(overrides?: Partial<ContestSession>): ContestSession {
  return {
    contestSlug: 'weekly-contest-400',
    contestTitle: 'Weekly Contest 400',
    contestType: 'weekly',
    duration: 5400,
    startedAt: 1700000000000,
    pausedDuration: 0,
    isPaused: false,
    pausedAt: null,
    problems: [
      {
        slug: 'accepted-problem',
        title: 'Accepted Problem',
        credit: 3,
        difficulty: 1,
        verdict: 'accepted',
        code: 'function solve() { return 1; }',
        language: 'javascript',
        solvedAt: 1700000300000,
      },
      {
        slug: 'attempted-problem',
        title: 'Attempted Problem',
        credit: 5,
        difficulty: 2,
        verdict: 'attempted',
        code: 'function solve() { /* WIP */ }',
        language: 'javascript',
        solvedAt: null,
      },
      {
        slug: 'unsolved-problem',
        title: 'Unsolved Problem',
        credit: 5,
        difficulty: 2,
        verdict: 'unsolved',
        code: 'function solve() {}',
        language: 'javascript',
        solvedAt: null,
      },
    ],
    ...overrides,
  };
}

function createMockSettings(): ContestFinalizerSettings {
  return {
    getProblemsFolder: () => 'LeetCode',
    getProblemDetail: (slug: string) => {
      const details: Record<string, { id: number; title: string }> = {
        'accepted-problem': { id: 201, title: 'Accepted Problem' },
        'attempted-problem': { id: 202, title: 'Attempted Problem' },
        'unsolved-problem': { id: 203, title: 'Unsolved Problem' },
      };
      return details[slug] ?? null;
    },
  };
}

interface MockFile {
  path: string;
  extension: string;
}

function createMockApp() {
  const files: Map<string, string> = new Map();
  const frontmatters: Map<string, Record<string, unknown>> = new Map();

  return {
    vault: {
      getAbstractFileByPath: vi.fn((path: string): MockFile | null => {
        if (files.has(path)) return { path, extension: 'md' };
        return null;
      }),
      create: vi.fn(async (path: string, content: string): Promise<MockFile> => {
        files.set(path, content);
        return { path, extension: 'md' };
      }),
      createFolder: vi.fn(async (): Promise<void> => {}),
      process: vi.fn(async (file: MockFile, fn: (body: string) => string): Promise<void> => {
        const current = files.get(file.path) ?? '';
        files.set(file.path, fn(current));
      }),
    },
    fileManager: {
      processFrontMatter: vi.fn(async (file: MockFile, fn: (fm: Record<string, unknown>) => void): Promise<void> => {
        const fm = frontmatters.get(file.path) ?? {};
        fn(fm);
        frontmatters.set(file.path, fm);
      }),
    },
    _files: files,
    _frontmatters: frontmatters,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('#revisit tagging (CONTEST-08)', () => {
  let mockApp: ReturnType<typeof createMockApp>;
  let mockSettings: ContestFinalizerSettings;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700003600000);
    mockApp = createMockApp();
    mockSettings = createMockSettings();
  });

  it('missed (attempted) problems get #revisit tag added', async () => {
    const session = createMockSession();
    await finalizeContest({
      session,
      aborted: false,
      app: mockApp as unknown as FinalizeContestArgs['app'],
      settings: mockSettings,
    });

    const fm = mockApp._frontmatters.get('LeetCode/Contests/weekly-contest-400/202-attempted-problem.md');
    expect(fm).toBeDefined();
    expect(fm!.tags).toContain('revisit');
  });

  it('missed (unsolved) problems with code get #revisit tag added', async () => {
    const session = createMockSession();
    await finalizeContest({
      session,
      aborted: false,
      app: mockApp as unknown as FinalizeContestArgs['app'],
      settings: mockSettings,
    });

    const fm = mockApp._frontmatters.get('LeetCode/Contests/weekly-contest-400/203-unsolved-problem.md');
    expect(fm).toBeDefined();
    expect(fm!.tags).toContain('revisit');
  });

  it('accepted problems do NOT get #revisit tag', async () => {
    const session = createMockSession();
    await finalizeContest({
      session,
      aborted: false,
      app: mockApp as unknown as FinalizeContestArgs['app'],
      settings: mockSettings,
    });

    const fm = mockApp._frontmatters.get('LeetCode/Contests/weekly-contest-400/201-accepted-problem.md');
    expect(fm).toBeDefined();
    // Should have lc-contest-id but NOT revisit
    expect(fm!['lc-contest-id']).toBe('weekly-contest-400');
    expect(fm!.tags ?? []).not.toContain('revisit');
  });

  it('#revisit not duplicated if already present', async () => {
    // Pre-populate an existing file with 'revisit' already in tags
    const existingPath = 'LeetCode/Contests/weekly-contest-400/202-attempted-problem.md';
    mockApp._files.set(existingPath, '## Problem\n\n## Code\n```javascript\nold\n```\n\n## Notes\n');
    mockApp._frontmatters.set(existingPath, { tags: ['revisit', 'other-tag'] });

    const session = createMockSession();
    await finalizeContest({
      session,
      aborted: false,
      app: mockApp as unknown as FinalizeContestArgs['app'],
      settings: mockSettings,
    });

    const fm = mockApp._frontmatters.get(existingPath)!;
    const revisitCount = (fm.tags as string[]).filter((t) => t === 'revisit').length;
    expect(revisitCount).toBe(1);
  });
});
