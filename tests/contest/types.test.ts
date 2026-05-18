// tests/contest/types.test.ts
// Phase 10 Plan 01 — unit tests for contest types (getRemainingMs pure function).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRemainingMs } from '../../src/contest/types';
import type { ContestSession } from '../../src/contest/types';

function makeSession(overrides: Partial<ContestSession> = {}): ContestSession {
  return {
    contestSlug: 'weekly-contest-380',
    contestTitle: 'Weekly Contest 380',
    contestType: 'weekly',
    duration: 5400, // 90 minutes in seconds
    startedAt: Date.now() - 30 * 60 * 1000, // started 30 min ago
    pausedDuration: 0,
    isPaused: false,
    pausedAt: null,
    problems: [],
    ...overrides,
  };
}

describe('getRemainingMs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns remaining time for a running session', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Started 30 min ago, duration 90 min, no pause.
    const session = makeSession({
      startedAt: now - 30 * 60 * 1000,
      pausedDuration: 0,
      isPaused: false,
      pausedAt: null,
    });

    const remaining = getRemainingMs(session);
    // Expected: (5400*1000) - (30*60*1000 - 0) = 5,400,000 - 1,800,000 = 3,600,000
    expect(remaining).toBe(60 * 60 * 1000); // 60 minutes remaining
  });

  it('returns remaining time accounting for paused duration', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Started 40 min ago, paused for 10 min, currently running.
    const session = makeSession({
      startedAt: now - 40 * 60 * 1000,
      pausedDuration: 10 * 60 * 1000, // 10 min paused
      isPaused: false,
      pausedAt: null,
    });

    const remaining = getRemainingMs(session);
    // Elapsed = 40min - 10min pause = 30min actual solving.
    // Remaining = 90min - 30min = 60min = 3,600,000ms
    expect(remaining).toBe(60 * 60 * 1000);
  });

  it('returns remaining time when session is paused', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Started 50 min ago, paused 5 min into it (at startedAt + 45min mark).
    const session = makeSession({
      startedAt: now - 50 * 60 * 1000,
      pausedDuration: 5 * 60 * 1000, // previously paused for 5 min
      isPaused: true,
      pausedAt: now - 5 * 60 * 1000, // paused 5 min ago
    });

    const remaining = getRemainingMs(session);
    // When paused: elapsed = pausedAt - startedAt - pausedDuration
    // = (now - 5min) - (now - 50min) - 5min
    // = 45min - 5min = 40min actual solving
    // Remaining = 90min - 40min = 50min = 3,000,000ms
    expect(remaining).toBe(50 * 60 * 1000);
  });

  it('returns 0 when time has expired', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Started 100 min ago, no pause, duration is 90 min — expired.
    const session = makeSession({
      startedAt: now - 100 * 60 * 1000,
      pausedDuration: 0,
      isPaused: false,
      pausedAt: null,
    });

    const remaining = getRemainingMs(session);
    expect(remaining).toBe(0); // Never negative
  });

  it('never returns negative values', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // Way past duration.
    const session = makeSession({
      startedAt: now - 200 * 60 * 1000,
      duration: 5400, // 90 min
      pausedDuration: 0,
      isPaused: false,
      pausedAt: null,
    });

    expect(getRemainingMs(session)).toBe(0);
  });

  it('returns full duration when just started', () => {
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const session = makeSession({
      startedAt: now,
      pausedDuration: 0,
      isPaused: false,
      pausedAt: null,
    });

    const remaining = getRemainingMs(session);
    expect(remaining).toBe(5400 * 1000); // Full 90 min
  });
});
