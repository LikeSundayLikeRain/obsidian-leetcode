// tests/contest/timer.test.ts
// Phase 10 Plan 02 Task 1 — Unit tests for getRemainingMs pure function.
//
// All tests use deterministic epoch values (no Date.now() dependency).
// Verifies the drift-free timer computation from CONTEXT.md D-08.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRemainingMs } from '../../src/contest/types';
import type { ContestSession } from '../../src/contest/types';

/** Helper: build a minimal ContestSession for timer math testing. */
function makeSession(overrides: Partial<ContestSession> = {}): ContestSession {
  return {
    contestSlug: 'weekly-contest-400',
    contestTitle: 'Weekly Contest 400',
    contestType: 'weekly',
    duration: 5400, // 90 minutes in seconds
    startedAt: 1000000, // arbitrary epoch ms
    pausedDuration: 0,
    isPaused: false,
    pausedAt: null,
    problems: [],
    ...overrides,
  };
}

describe('getRemainingMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('running session with no pause returns duration*1000 - (now - startedAt)', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    // Set "now" to 10 seconds after start
    vi.setSystemTime(startedAt + 10_000);

    const session = makeSession({ startedAt, pausedDuration: 0, isPaused: false });
    const remaining = getRemainingMs(session);

    // 5400s * 1000 - 10000ms = 5,390,000ms
    expect(remaining).toBe(5400 * 1000 - 10_000);
  });

  it('paused session freezes at pausedAt computation (clock stops)', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    const pausedAt = startedAt + 30_000; // Paused 30s after start
    // Even if "now" is much later, paused session uses pausedAt
    vi.setSystemTime(startedAt + 120_000); // 2 min later

    const session = makeSession({
      startedAt,
      pausedDuration: 0,
      isPaused: true,
      pausedAt,
    });
    const remaining = getRemainingMs(session);

    // Should be frozen at the pause moment: duration*1000 - (pausedAt - startedAt - pausedDuration)
    // = 5,400,000 - (30,000 - 0) = 5,370,000
    expect(remaining).toBe(5400 * 1000 - 30_000);
  });

  it('returns 0 (not negative) when elapsed > duration', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    // Set "now" to well past the contest end
    vi.setSystemTime(startedAt + 10_000_000); // ~167 minutes (> 90)

    const session = makeSession({ startedAt, pausedDuration: 0, isPaused: false });
    const remaining = getRemainingMs(session);

    expect(remaining).toBe(0);
  });

  it('pausedDuration correctly subtracted from elapsed', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    const pausedDuration = 60_000; // Was paused for 60s total previously
    // "now" is 120s after start
    vi.setSystemTime(startedAt + 120_000);

    const session = makeSession({ startedAt, pausedDuration, isPaused: false });
    const remaining = getRemainingMs(session);

    // Effective elapsed = (now - startedAt - pausedDuration) = 120000 - 60000 = 60000
    // Remaining = 5,400,000 - 60,000 = 5,340,000
    expect(remaining).toBe(5400 * 1000 - 60_000);
  });

  it('paused session with prior pausedDuration uses both in computation', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    const pausedDuration = 20_000; // Previously paused 20s
    const pausedAt = startedAt + 50_000; // Currently paused 50s after start
    vi.setSystemTime(startedAt + 200_000); // Irrelevant for paused session

    const session = makeSession({
      startedAt,
      pausedDuration,
      isPaused: true,
      pausedAt,
    });
    const remaining = getRemainingMs(session);

    // Frozen at: duration*1000 - (pausedAt - startedAt - pausedDuration)
    // = 5,400,000 - (50,000 - 20,000) = 5,400,000 - 30,000 = 5,370,000
    expect(remaining).toBe(5400 * 1000 - 30_000);
  });

  it('returns full duration when contest just started', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    vi.setSystemTime(startedAt); // Exactly at start

    const session = makeSession({ startedAt });
    const remaining = getRemainingMs(session);

    expect(remaining).toBe(5400 * 1000);
  });

  it('returns exactly 0 at the exact expiry moment', () => {
    vi.useFakeTimers();
    const startedAt = 1_000_000;
    vi.setSystemTime(startedAt + 5400 * 1000); // Exactly at end

    const session = makeSession({ startedAt });
    const remaining = getRemainingMs(session);

    expect(remaining).toBe(0);
  });
});
