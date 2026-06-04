// tests/contest/ContestSolveView.test.ts
// Phase 10 Plan 04 Task 1 — unit tests for ContestSolveView.
import { describe, it, expect, vi } from 'vitest';

// Mock obsidian with shared stub
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return {
    ...actual,
    Notice: class {
      constructor(public msg: string, public duration?: number) {}
    },
    MarkdownRenderer: {
      render: vi.fn().mockResolvedValue(undefined),
    },
    setIcon: vi.fn(),
  };
});

// Mock throttledRequestUrl
vi.mock('../../src/api/requestUrlFetcher', () => ({
  throttledRequestUrl: vi.fn().mockResolvedValue({
    status: 200,
    json: { submission_id: '12345' },
    text: '',
  }),
}));

// Mock interpretSolution
vi.mock('../../src/solve/leetcodeRest', () => ({
  interpretSolution: vi.fn().mockResolvedValue({ interpret_id: 'interp-123' }),
  authHeaders: vi.fn().mockReturnValue({ 'x-csrftoken': 'token' }),
}));

// Mock pollSubmission
vi.mock('../../src/solve/pollingOrchestrator', () => ({
  pollSubmission: vi.fn().mockResolvedValue({
    status_code: 10,
    status_msg: 'Accepted',
    state: 'SUCCESS',
  }),
}));

// Mock VerdictModal
vi.mock('../../src/solve/VerdictModal', () => ({
  VerdictModal: class {
    open = vi.fn();
    close = vi.fn();
    renderVerdict = vi.fn();
    constructor(public app: unknown, public args: unknown) {}
  },
}));

// Mock showSessionExpiredNotice
vi.mock('../../src/solve/SessionExpiredNotice', () => ({
  showSessionExpiredNotice: vi.fn(),
}));

// Mock classifyStatus
vi.mock('../../src/solve/statusMap', () => ({
  classifyStatus: vi.fn().mockReturnValue({ kind: 'ac', displayName: 'Accepted' }),
}));

import {
  ContestSolveView,
  CONTEST_SOLVE_VIEW_TYPE,
} from '../../src/contest/ContestSolveView';
import type { ContestSession } from '../../src/contest/types';
import type { ContestSessionManager } from '../../src/contest/ContestSessionManager';

// --- Helpers ---

function makeSession(): ContestSession {
  return {
    contestSlug: 'weekly-contest-380',
    contestTitle: 'Weekly Contest 380',
    contestType: 'weekly',
    duration: 5400,
    startedAt: Date.now() - 1000,
    pausedDuration: 0,
    isPaused: false,
    pausedAt: null,
    problems: [
      { slug: 'two-sum', title: 'Two Sum', credit: 3, difficulty: 1, verdict: 'unsolved', code: 'def twoSum(): pass', language: 'python3', solvedAt: null },
      { slug: 'add-two-numbers', title: 'Add Two Numbers', credit: 4, difficulty: 2, verdict: 'unsolved', code: '', language: 'python3', solvedAt: null },
      { slug: 'median-of-two', title: 'Median of Two Sorted Arrays', credit: 5, difficulty: 3, verdict: 'attempted', code: 'class Solution:', language: 'java', solvedAt: null },
      { slug: 'longest-substring', title: 'Longest Substring', credit: 5, difficulty: 2, verdict: 'accepted', code: 'fn solve()', language: 'rust', solvedAt: Date.now() },
    ],
  };
}

function makeMockPlugin(session: ContestSession | null = makeSession()) {
  const updateCode = vi.fn();
  const recordVerdict = vi.fn();

  const contestSessionManager = {
    getSession: vi.fn().mockReturnValue(session),
    updateCode,
    recordVerdict,
    isActive: vi.fn().mockReturnValue(session !== null),
  } as unknown as ContestSessionManager;

  const settings = {
    getProblemDetail: vi.fn().mockReturnValue({
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      contentHtml: '<p>Given an array</p>',
      exampleTestcases: '[2,7,11,15]\n9',
      metaData: '{"name":"twoSum","params":[{"name":"nums","type":"integer[]"},{"name":"target","type":"integer"}]}',
      internalQuestionId: '1',
    }),
    getAuthCookies: vi.fn().mockReturnValue({
      csrftoken: 'csrf-test',
      LEETCODE_SESSION: 'session-test',
    }),
    getDefaultLanguage: vi.fn().mockReturnValue('python3'),
  };

  const auth = {
    login: vi.fn(),
  };

  return {
    plugin: {
      contestSessionManager,
      settings,
      auth,
      app: { workspace: {} },
    },
    updateCode,
    recordVerdict,
  };
}

function makeLeaf() {
  const contentEl = document.createElement('div');
  const header = document.createElement('div');
  const content = document.createElement('div');
  contentEl.appendChild(header);
  contentEl.appendChild(content);
  return {
    containerEl: contentEl,
    view: null as unknown,
    detach: vi.fn(),
  };
}

describe('ContestSolveView', () => {
  describe('exports', () => {
    it('CONTEST_SOLVE_VIEW_TYPE equals leetcode-contest-solve', () => {
      expect(CONTEST_SOLVE_VIEW_TYPE).toBe('leetcode-contest-solve');
    });

    it('ContestSolveView class is exported', () => {
      expect(ContestSolveView).toBeDefined();
      expect(typeof ContestSolveView).toBe('function');
    });
  });

  describe('getViewType and getIcon', () => {
    it('getViewType returns CONTEST_SOLVE_VIEW_TYPE', () => {
      const { plugin } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);
      expect(view.getViewType()).toBe(CONTEST_SOLVE_VIEW_TYPE);
    });

    it('getIcon returns trophy', () => {
      const { plugin } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);
      expect(view.getIcon()).toBe('trophy');
    });
  });

  describe('setState / getState round-trip', () => {
    it('getState returns { problemIdx } matching what was set', async () => {
      const { plugin } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);

      // Initial state
      expect(view.getState()).toEqual({ problemIdx: null });

      // Set state
      await view.setState({ problemIdx: 2 }, { history: false });

      expect(view.getState()).toEqual({ problemIdx: 2 });
    });

    it('setState with invalid input keeps null', async () => {
      const { plugin } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);

      await view.setState({}, { history: false });
      expect(view.getState()).toEqual({ problemIdx: null });

      await view.setState(null, { history: false });
      expect(view.getState()).toEqual({ problemIdx: null });
    });
  });

  describe('getDisplayText', () => {
    it('returns Contest when no problem set', () => {
      const { plugin } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);
      expect(view.getDisplayText()).toBe('Contest');
    });

    it('returns problem title when problem is set', async () => {
      const { plugin } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);
      await view.setState({ problemIdx: 0 }, { history: false });
      expect(view.getDisplayText()).toBe('Contest: 1. Two Sum');
    });
  });

  describe('handleRun method', () => {
    it('exists on the prototype', () => {
      expect(typeof ContestSolveView.prototype.handleRun).toBe('function');
    });
  });

  describe('handleSubmit method', () => {
    it('exists on the prototype', () => {
      expect(typeof ContestSolveView.prototype.handleSubmit).toBe('function');
    });
  });

  describe('updateCode integration', () => {
    it('flushCodeSave calls updateCode with correct args', () => {
      const { plugin, updateCode } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);

      // Manually set state (bypassing full render)
      (view as unknown as { problemIdx: number }).problemIdx = 1;
      (view as unknown as { pendingCode: string }).pendingCode = 'print("hello")';
      (view as unknown as { pendingLanguage: string }).pendingLanguage = 'python3';

      view.flushCodeSave();

      expect(updateCode).toHaveBeenCalledWith(1, 'print("hello")', 'python3');
    });
  });

  describe('recordVerdict integration', () => {
    it('recordVerdict called with accepted on AC', async () => {
      const { plugin, recordVerdict } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);

      // Set problem index
      (view as unknown as { problemIdx: number }).problemIdx = 0;

      // classifyStatus returns 'ac' by default in mock
      await view.handleSubmit();

      expect(recordVerdict).toHaveBeenCalledWith(0, 'accepted');
    });

    it('recordVerdict called with attempted on non-AC verdict', async () => {
      const { plugin, recordVerdict } = makeMockPlugin();
      const leaf = makeLeaf();
      const view = new ContestSolveView(leaf as never, plugin as never);

      // Set problem index
      (view as unknown as { problemIdx: number }).problemIdx = 0;

      // Override classifyStatus to return 'wa'
      const { classifyStatus } = await import('../../src/solve/statusMap');
      vi.mocked(classifyStatus).mockReturnValueOnce({ kind: 'wa', displayName: 'Wrong Answer' } as never);

      await view.handleSubmit();

      expect(recordVerdict).toHaveBeenCalledWith(0, 'attempted');
    });
  });
});
