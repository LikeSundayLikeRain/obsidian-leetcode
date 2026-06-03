// tests/contest/ContestFinalizer.test.ts
// Phase 10 Plan 06 — Integration tests for ContestFinalizer.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  finalizeContest,
  rewriteCodeSection,
  type FinalizeContestArgs,
  type ContestFinalizerSettings,
} from '../../src/contest/ContestFinalizer';
import type { ContestSession } from '../../src/contest/types';
import { TFile } from '../helpers/obsidian-stub';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock factories
// ─────────────────────────────────────────────────────────────────────────────

function createMockSession(overrides?: Partial<ContestSession>): ContestSession {
  return {
    contestSlug: 'weekly-contest-400',
    contestTitle: 'Weekly Contest 400',
    contestType: 'weekly',
    duration: 5400, // 90 minutes
    startedAt: 1700000000000,
    pausedDuration: 0,
    isPaused: false,
    pausedAt: null,
    problems: [
      {
        slug: 'problem-a',
        title: 'Problem A',
        credit: 3,
        difficulty: 1,
        verdict: 'accepted',
        code: 'function solve() { return 1; }',
        language: 'javascript',
        solvedAt: 1700000300000, // 5 min in
      },
      {
        slug: 'problem-b',
        title: 'Problem B',
        credit: 5,
        difficulty: 2,
        verdict: 'attempted',
        code: 'function solve() { /* WIP */ }',
        language: 'javascript',
        solvedAt: null,
      },
      {
        slug: 'problem-c',
        title: 'Problem C',
        credit: 5,
        difficulty: 2,
        verdict: 'unsolved',
        code: '',
        language: 'javascript',
        solvedAt: null,
      },
      {
        slug: 'problem-d',
        title: 'Problem D',
        credit: 7,
        difficulty: 3,
        verdict: 'unsolved',
        code: '',
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
    getDefaultLanguage: () => 'python3',
    getProblemDetail: (slug: string) => {
      const details: Record<string, { id: number; title: string; contentHtml: string; difficulty: string; url: string; topicSlugs: string[] }> = {
        'problem-a': { id: 101, title: 'Problem A', contentHtml: '<p>Problem A</p>', difficulty: 'Easy', url: 'https://leetcode.com/problems/problem-a/', topicSlugs: [] },
        'problem-b': { id: 102, title: 'Problem B', contentHtml: '<p>Problem B</p>', difficulty: 'Medium', url: 'https://leetcode.com/problems/problem-b/', topicSlugs: [] },
        'problem-c': { id: 103, title: 'Problem C', contentHtml: '<p>Problem C</p>', difficulty: 'Hard', url: 'https://leetcode.com/problems/problem-c/', topicSlugs: [] },
        'problem-d': { id: 104, title: 'Problem D', contentHtml: '<p>Problem D</p>', difficulty: 'Medium', url: 'https://leetcode.com/problems/problem-d/', topicSlugs: [] },
      };
      return details[slug] ?? null;
    },
  };
}

interface MockFile {
  path: string;
  extension: string;
}

function makeTFile(path: string): MockFile {
  const f = Object.create(TFile.prototype) as MockFile;
  f.path = path;
  f.extension = 'md';
  return f;
}

function createMockApp() {
  const files: Map<string, string> = new Map();
  const frontmatters: Map<string, Record<string, unknown>> = new Map();

  const app = {
    vault: {
      getAbstractFileByPath: vi.fn((path: string): MockFile | null => {
        if (files.has(path)) {
          return makeTFile(path);
        }
        return null;
      }),
      create: vi.fn(async (path: string, content: string): Promise<MockFile> => {
        files.set(path, content);
        return makeTFile(path);
      }),
      createFolder: vi.fn(async (_path: string): Promise<void> => {
        // no-op
      }),
      process: vi.fn(async (file: MockFile, fn: (body: string) => string): Promise<void> => {
        const current = files.get(file.path) ?? '';
        const updated = fn(current);
        files.set(file.path, updated);
      }),
    },
    fileManager: {
      processFrontMatter: vi.fn(async (file: MockFile, fn: (fm: Record<string, unknown>) => void): Promise<void> => {
        const fm = frontmatters.get(file.path) ?? {};
        fn(fm);
        frontmatters.set(file.path, fm);
      }),
    },
    // Expose internals for test assertions
    _files: files,
    _frontmatters: frontmatters,
  };

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ContestFinalizer', () => {
  let mockApp: ReturnType<typeof createMockApp>;
  let mockSettings: ContestFinalizerSettings;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1700003600000); // ~60 min after start
    mockApp = createMockApp();
    mockSettings = createMockSettings();
  });

  describe('finalizeContest', () => {
    it('creates new notes for problems with code', async () => {
      const session = createMockSession();
      await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // problem-a and problem-b have code, so they get notes
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'LeetCode/101-problem-a.md',
        expect.any(String),
      );
      expect(mockApp.vault.create).toHaveBeenCalledWith(
        'LeetCode/102-problem-b.md',
        expect.any(String),
      );
    });

    it('skips problems with empty code', async () => {
      const session = createMockSession();
      await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // problem-c and problem-d have empty code — no notes created for them
      const createCalls = mockApp.vault.create.mock.calls.map((c) => c[0]);
      expect(createCalls).not.toContain('LeetCode/103-problem-c.md');
      expect(createCalls).not.toContain('LeetCode/104-problem-d.md');
    });

    it('D-13 merge: AC on existing file overwrites ## Code via vault.process', async () => {
      // Pre-populate existing file
      const existingPath = 'LeetCode/101-problem-a.md';
      mockApp._files.set(existingPath, '## Problem\nOld\n\n## Code\n```javascript\nold code\n```\n\n## Notes\n');

      const session = createMockSession();
      await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // vault.process should have been called for the existing AC file
      expect(mockApp.vault.process).toHaveBeenCalled();
      const updatedContent = mockApp._files.get(existingPath)!;
      expect(updatedContent).toContain('function solve() { return 1; }');
    });

    it('D-13 merge: non-AC on existing file does NOT call vault.process for that file', async () => {
      // Pre-populate existing file for problem-b (attempted)
      const existingPath = 'LeetCode/102-problem-b.md';
      mockApp._files.set(existingPath, '## Problem\nOld\n\n## Code\n```javascript\nexisting code\n```\n\n## Notes\n');

      const session = createMockSession();
      await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // vault.process should NOT be called for non-AC existing file
      const processCalls = mockApp.vault.process.mock.calls;
      const processedPaths = processCalls.map((c) => (c[0] as MockFile).path);
      expect(processedPaths).not.toContain(existingPath);
      // Content should be unchanged
      expect(mockApp._files.get(existingPath)).toContain('existing code');
    });

    it('applies lc-contest-id frontmatter to new notes', async () => {
      const session = createMockSession();
      await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // Check frontmatter was applied
      const fm = mockApp._frontmatters.get('LeetCode/101-problem-a.md');
      expect(fm).toBeDefined();
      expect(fm!['lc-contest-id']).toBe('weekly-contest-400');
    });

    it('creates summary note at correct path', async () => {
      const session = createMockSession();
      await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // Date from startedAt (1700000000000) = 2023-11-14
      const expectedPath = 'LeetCode/Contests/2023-11-14-weekly-contest-400.md';
      const createCalls = mockApp.vault.create.mock.calls.map((c) => c[0]);
      expect(createCalls).toContain(expectedPath);
    });

    it('aborted=true adds "(aborted at ...)" marker in summary', async () => {
      const session = createMockSession();
      const result = await finalizeContest({
        session,
        aborted: true,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      // Find the summary note content
      const summaryContent = mockApp._files.get(result)!;
      expect(summaryContent).toMatch(/\*\*\(aborted at \d{2}:\d{2} remaining\)\*\*/);
    });

    it('validates contest slug (T-10-10)', async () => {
      const session = createMockSession({ contestSlug: '../evil-path' });
      await expect(
        finalizeContest({
          session,
          aborted: false,
          app: mockApp as unknown as FinalizeContestArgs['app'],
          settings: mockSettings,
        }),
      ).rejects.toThrow('Invalid contest slug');
    });

    it('returns summary note path', async () => {
      const session = createMockSession();
      const result = await finalizeContest({
        session,
        aborted: false,
        app: mockApp as unknown as FinalizeContestArgs['app'],
        settings: mockSettings,
      });

      expect(result).toBe('LeetCode/Contests/2023-11-14-weekly-contest-400.md');
    });
  });

  describe('rewriteCodeSection', () => {
    it('replaces existing code fence under ## Code', () => {
      const body = '## Problem\nHello\n\n## Code\n```python\nold\n```\n\n## Notes\n';
      const result = rewriteCodeSection(body, 'new code', 'javascript');
      expect(result).toContain('```leetcode-solve\nnew code\n```');
      expect(result).not.toContain('old');
    });

    it('appends ## Code when missing', () => {
      const body = '## Problem\nHello\n\n## Notes\n';
      const result = rewriteCodeSection(body, 'new code', 'python');
      expect(result).toContain('## Code');
      expect(result).toContain('```leetcode-solve\nnew code\n```');
    });
  });
});
