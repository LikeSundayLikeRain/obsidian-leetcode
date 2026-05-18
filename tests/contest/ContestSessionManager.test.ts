// tests/contest/ContestSessionManager.test.ts
// Phase 10 Plan 02 Task 1 — Unit tests for ContestSessionManager state machine.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContestSessionManager,
  type ContestSettingsPort,
  type ContestSessionCallbacks,
} from '../../src/contest/ContestSessionManager';
import type { ContestSession } from '../../src/contest/types';

/** Creates an in-memory mock of the settings port. */
function createMockSettings(): ContestSettingsPort & { stored: ContestSession | null } {
  const mock = {
    stored: null as ContestSession | null,
    getContestSession(): ContestSession | null {
      return mock.stored;
    },
    setContestSession(session: ContestSession | null): void {
      mock.stored = session;
    },
  };
  return mock;
}

/** Standard contest start params for tests. */
const START_PARAMS = {
  contestSlug: 'weekly-contest-400',
  contestTitle: 'Weekly Contest 400',
  contestType: 'weekly' as const,
  duration: 5400, // 90 minutes in seconds
  problems: [
    { slug: 'problem-a', title: 'Problem A', credit: 3, difficulty: 1 },
    { slug: 'problem-b', title: 'Problem B', credit: 5, difficulty: 2 },
    { slug: 'problem-c', title: 'Problem C', credit: 5, difficulty: 2 },
    { slug: 'problem-d', title: 'Problem D', credit: 7, difficulty: 3 },
  ],
};

describe('ContestSessionManager', () => {
  let settings: ReturnType<typeof createMockSettings>;
  let callbacks: ContestSessionCallbacks;
  let manager: ContestSessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    settings = createMockSettings();
    callbacks = {
      onTick: vi.fn(),
      onExpired: vi.fn(),
      onVerdictChange: vi.fn(),
    };
    manager = new ContestSessionManager(settings, callbacks);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start()', () => {
    it('creates a valid session shape and persists it', () => {
      const now = Date.now();
      manager.start(START_PARAMS);

      const session = settings.stored;
      expect(session).not.toBeNull();
      expect(session!.contestSlug).toBe('weekly-contest-400');
      expect(session!.contestTitle).toBe('Weekly Contest 400');
      expect(session!.contestType).toBe('weekly');
      expect(session!.duration).toBe(5400);
      expect(session!.startedAt).toBeGreaterThanOrEqual(now);
      expect(session!.startedAt).toBeLessThanOrEqual(now + 10);
      expect(session!.pausedDuration).toBe(0);
      expect(session!.isPaused).toBe(false);
      expect(session!.pausedAt).toBeNull();
      expect(session!.problems).toHaveLength(4);
    });

    it('initializes all problems with default values', () => {
      manager.start(START_PARAMS);

      const problems = settings.stored!.problems;
      for (const p of problems) {
        expect(p.verdict).toBe('unsolved');
        expect(p.code).toBe('');
        expect(p.language).toBe('python3');
        expect(p.solvedAt).toBeNull();
      }
      expect(problems[0].slug).toBe('problem-a');
      expect(problems[0].credit).toBe(3);
      expect(problems[3].difficulty).toBe(3);
    });

    it('marks session as active', () => {
      manager.start(START_PARAMS);
      expect(manager.isActive()).toBe(true);
    });
  });

  describe('pause()', () => {
    it('sets isPaused=true and pausedAt to a recent epoch', () => {
      manager.start(START_PARAMS);
      vi.advanceTimersByTime(5000);
      const beforePause = Date.now();
      manager.pause();

      const session = settings.stored!;
      expect(session.isPaused).toBe(true);
      expect(session.pausedAt).toBeGreaterThanOrEqual(beforePause);
      expect(session.pausedAt).toBeLessThanOrEqual(beforePause + 10);
    });

    it('does nothing if already paused', () => {
      manager.start(START_PARAMS);
      manager.pause();
      const firstPausedAt = settings.stored!.pausedAt;
      vi.advanceTimersByTime(1000);
      manager.pause();
      expect(settings.stored!.pausedAt).toBe(firstPausedAt);
    });

    it('does nothing if no session', () => {
      manager.pause(); // Should not throw
      expect(settings.stored).toBeNull();
    });
  });

  describe('resume()', () => {
    it('accumulates pausedDuration correctly', () => {
      manager.start(START_PARAMS);
      vi.advanceTimersByTime(10_000); // 10s running
      manager.pause();
      vi.advanceTimersByTime(5000); // 5s paused
      manager.resume();

      const session = settings.stored!;
      expect(session.isPaused).toBe(false);
      expect(session.pausedAt).toBeNull();
      expect(session.pausedDuration).toBe(5000);
    });

    it('accumulates over multiple pause/resume cycles', () => {
      manager.start(START_PARAMS);
      vi.advanceTimersByTime(1000);
      manager.pause();
      vi.advanceTimersByTime(2000);
      manager.resume();
      vi.advanceTimersByTime(1000);
      manager.pause();
      vi.advanceTimersByTime(3000);
      manager.resume();

      expect(settings.stored!.pausedDuration).toBe(5000); // 2000 + 3000
    });

    it('does nothing if not paused', () => {
      manager.start(START_PARAMS);
      manager.resume(); // Not paused
      expect(settings.stored!.pausedDuration).toBe(0);
    });
  });

  describe('recordVerdict()', () => {
    it('upgrades unsolved -> attempted', () => {
      manager.start(START_PARAMS);
      manager.recordVerdict(0, 'attempted');

      expect(settings.stored!.problems[0].verdict).toBe('attempted');
      expect(callbacks.onVerdictChange).toHaveBeenCalledWith(0, 'attempted');
    });

    it('upgrades unsolved -> accepted and sets solvedAt', () => {
      manager.start(START_PARAMS);
      const beforeAC = Date.now();
      manager.recordVerdict(1, 'accepted');

      expect(settings.stored!.problems[1].verdict).toBe('accepted');
      expect(settings.stored!.problems[1].solvedAt).toBeGreaterThanOrEqual(beforeAC);
      expect(callbacks.onVerdictChange).toHaveBeenCalledWith(1, 'accepted');
    });

    it('upgrades attempted -> accepted', () => {
      manager.start(START_PARAMS);
      manager.recordVerdict(0, 'attempted');
      manager.recordVerdict(0, 'accepted');

      expect(settings.stored!.problems[0].verdict).toBe('accepted');
    });

    it('never downgrades: accepted stays accepted even if called with attempted', () => {
      manager.start(START_PARAMS);
      manager.recordVerdict(0, 'accepted');
      manager.recordVerdict(0, 'attempted');

      expect(settings.stored!.problems[0].verdict).toBe('accepted');
      // onVerdictChange should only have been called once (for the accepted upgrade)
      expect(callbacks.onVerdictChange).toHaveBeenCalledTimes(1);
    });

    it('does nothing for invalid problem index', () => {
      manager.start(START_PARAMS);
      manager.recordVerdict(99, 'accepted');
      // Should not throw, no callback
      expect(callbacks.onVerdictChange).not.toHaveBeenCalled();
    });
  });

  describe('updateCode()', () => {
    it('updates code and language for a problem', () => {
      manager.start(START_PARAMS);
      manager.updateCode(0, 'class Solution { }', 'java');

      expect(settings.stored!.problems[0].code).toBe('class Solution { }');
      expect(settings.stored!.problems[0].language).toBe('java');
    });

    it('does nothing for invalid index', () => {
      manager.start(START_PARAMS);
      manager.updateCode(99, 'code', 'python3');
      // Should not throw
      expect(settings.stored!.problems[0].code).toBe('');
    });
  });

  describe('abort()', () => {
    it('clears session from settings and returns snapshot', () => {
      manager.start(START_PARAMS);
      manager.recordVerdict(0, 'attempted');

      const snapshot = manager.abort();

      expect(snapshot).not.toBeNull();
      expect(snapshot!.contestSlug).toBe('weekly-contest-400');
      expect(snapshot!.problems[0].verdict).toBe('attempted');
      expect(settings.stored).toBeNull();
      expect(manager.isActive()).toBe(false);
    });

    it('returns null if no session', () => {
      expect(manager.abort()).toBeNull();
    });
  });

  describe('finish()', () => {
    it('clears session from settings and returns snapshot', () => {
      manager.start(START_PARAMS);
      manager.recordVerdict(0, 'accepted');

      const snapshot = manager.finish();

      expect(snapshot).not.toBeNull();
      expect(snapshot!.problems[0].verdict).toBe('accepted');
      expect(settings.stored).toBeNull();
      expect(manager.isActive()).toBe(false);
    });

    it('returns null if no session', () => {
      expect(manager.finish()).toBeNull();
    });
  });

  describe('restore()', () => {
    it('calls onExpired if session has already timed out', () => {
      // Manually set an already-expired session
      settings.stored = {
        contestSlug: 'weekly-contest-400',
        contestTitle: 'Weekly Contest 400',
        contestType: 'weekly',
        duration: 5400,
        startedAt: Date.now() - 6000_000, // Started 100 min ago (> 90 min)
        pausedDuration: 0,
        isPaused: false,
        pausedAt: null,
        problems: [],
      };

      manager.restore();
      expect(callbacks.onExpired).toHaveBeenCalledTimes(1);
    });

    it('resumes ticking if session is still active (not paused)', () => {
      settings.stored = {
        contestSlug: 'weekly-contest-400',
        contestTitle: 'Weekly Contest 400',
        contestType: 'weekly',
        duration: 5400,
        startedAt: Date.now() - 1000, // Started 1s ago
        pausedDuration: 0,
        isPaused: false,
        pausedAt: null,
        problems: [],
      };

      manager.restore();
      vi.advanceTimersByTime(1000);
      expect(callbacks.onTick).toHaveBeenCalled();
    });

    it('does nothing if session is paused (user must resume manually)', () => {
      settings.stored = {
        contestSlug: 'weekly-contest-400',
        contestTitle: 'Weekly Contest 400',
        contestType: 'weekly',
        duration: 5400,
        startedAt: Date.now() - 1000,
        pausedDuration: 0,
        isPaused: true,
        pausedAt: Date.now() - 500,
        problems: [],
      };

      manager.restore();
      vi.advanceTimersByTime(2000);
      expect(callbacks.onTick).not.toHaveBeenCalled();
      expect(callbacks.onExpired).not.toHaveBeenCalled();
    });

    it('does nothing if no session exists', () => {
      manager.restore();
      vi.advanceTimersByTime(2000);
      expect(callbacks.onTick).not.toHaveBeenCalled();
      expect(callbacks.onExpired).not.toHaveBeenCalled();
    });
  });

  describe('timer tick', () => {
    it('fires onTick with remaining ms every second', () => {
      manager.start(START_PARAMS);
      vi.advanceTimersByTime(3000); // 3 ticks

      expect(callbacks.onTick).toHaveBeenCalledTimes(3);
      // Each call should have a positive remaining value
      const lastCall = (callbacks.onTick as ReturnType<typeof vi.fn>).mock.calls[2][0];
      expect(lastCall).toBeGreaterThan(0);
      expect(lastCall).toBeLessThan(5400 * 1000);
    });

    it('fires onExpired when timer reaches zero', () => {
      manager.start(START_PARAMS);
      // Advance past the full contest duration
      vi.advanceTimersByTime(5400 * 1000 + 1000);

      expect(callbacks.onExpired).toHaveBeenCalledTimes(1);
    });

    it('stops ticking after pause', () => {
      manager.start(START_PARAMS);
      vi.advanceTimersByTime(2000);
      const tickCountBeforePause = (callbacks.onTick as ReturnType<typeof vi.fn>).mock.calls.length;
      manager.pause();
      vi.advanceTimersByTime(5000);
      expect((callbacks.onTick as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tickCountBeforePause);
    });

    it('resumes ticking after resume', () => {
      manager.start(START_PARAMS);
      vi.advanceTimersByTime(1000);
      manager.pause();
      vi.advanceTimersByTime(5000);
      manager.resume();
      vi.advanceTimersByTime(2000);
      // Should have ticked: 1 before pause + 2 after resume = 3
      expect(callbacks.onTick).toHaveBeenCalledTimes(3);
    });
  });
});
