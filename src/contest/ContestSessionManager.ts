// src/contest/ContestSessionManager.ts
// Phase 10 Plan 02 Task 1 — Contest session state machine with timer.
//
// Lifecycle: idle -> active -> (paused <-> active) -> ended
// Timer: epoch-based (D-08) — no drift. Ticks every 1000ms for display.
// Persistence: every state mutation saves to SettingsStore immediately.
//
// Dependencies:
//   - ContestSession, ContestProblemState, getRemainingMs from ./types
//   - SettingsStore (getContestSession / setContestSession)

import type { ContestSession, ContestProblemState } from './types';
import { getRemainingMs } from './types';

/**
 * Callbacks fired by the session manager on state changes.
 */
export type ContestSessionCallbacks = {
  /** Fired every ~1000ms with remaining milliseconds. */
  onTick: (remainingMs: number) => void;
  /** Fired when the contest timer reaches zero. */
  onExpired: () => void;
  /** Fired when a problem's verdict changes. */
  onVerdictChange: (problemIdx: number, verdict: ContestProblemState['verdict']) => void;
};

/**
 * Minimal interface for the settings dependency (testable without full SettingsStore).
 */
export interface ContestSettingsPort {
  getContestSession(): ContestSession | null;
  setContestSession(session: ContestSession | null): void;
}

/**
 * Manages the contest session lifecycle: start, pause, resume, abort, finish.
 * Timer uses epoch math for drift-free countdown (RESEARCH Pitfall 1).
 * All state mutations persist immediately to PluginData via the settings port.
 */
export class ContestSessionManager {
  private tickHandle: number | null = null;
  private settings: ContestSettingsPort;
  private callbacks: ContestSessionCallbacks;

  constructor(settings: ContestSettingsPort, callbacks: ContestSessionCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  /**
   * Start a new contest session.
   * Creates a fresh ContestSession, persists it, and begins the tick interval.
   */
  start(params: {
    contestSlug: string;
    contestTitle: string;
    contestType: 'weekly' | 'biweekly';
    duration: number;
    problems: Array<{ slug: string; title: string; credit: number; difficulty: number; code?: string; language?: string }>;
  }): void {
    const session: ContestSession = {
      contestSlug: params.contestSlug,
      contestTitle: params.contestTitle,
      contestType: params.contestType,
      duration: params.duration,
      startedAt: Date.now(),
      pausedDuration: 0,
      isPaused: false,
      pausedAt: null,
      problems: params.problems.map((p) => ({
        slug: p.slug,
        title: p.title,
        credit: p.credit,
        difficulty: p.difficulty,
        verdict: 'unsolved' as const,
        code: p.code ?? '',
        language: p.language ?? 'python3',
        solvedAt: null,
      })),
    };
    this.settings.setContestSession(session);
    this.startTick();
  }

  /**
   * Pause the active contest. Stops the tick interval.
   * Paused time does NOT count toward total elapsed (D-06).
   */
  pause(): void {
    const session = this.settings.getContestSession();
    if (!session || session.isPaused) return;

    session.isPaused = true;
    session.pausedAt = Date.now();
    this.settings.setContestSession(session);
    this.stopTick();
  }

  /**
   * Resume from a paused state. Accumulates pause duration and restarts tick.
   */
  resume(): void {
    const session = this.settings.getContestSession();
    if (!session || !session.isPaused || session.pausedAt === null) return;

    session.pausedDuration += Date.now() - session.pausedAt;
    session.isPaused = false;
    session.pausedAt = null;
    this.settings.setContestSession(session);
    this.startTick();
  }

  /**
   * Abort the contest. Returns a snapshot of the session at abort time.
   * Clears the session from persistence.
   */
  abort(): ContestSession | null {
    const session = this.settings.getContestSession();
    if (!session) return null;

    this.stopTick();
    this.settings.setContestSession(null);
    return session;
  }

  /**
   * Finish the contest normally. Returns a snapshot for finalization.
   * Clears the session from persistence.
   */
  finish(): ContestSession | null {
    const session = this.settings.getContestSession();
    if (!session) return null;

    this.stopTick();
    this.settings.setContestSession(null);
    return session;
  }

  /**
   * Record a verdict for a problem. Only upgrades (never downgrades).
   * unsolved -> attempted -> accepted
   */
  recordVerdict(problemIdx: number, verdict: 'attempted' | 'accepted'): void {
    const session = this.settings.getContestSession();
    if (!session) return;

    const problem = session.problems[problemIdx];
    if (!problem) return;

    // Only upgrade verdicts
    const rank = { unsolved: 0, attempted: 1, accepted: 2 } as const;
    if (rank[verdict] <= rank[problem.verdict]) return;

    problem.verdict = verdict;
    if (verdict === 'accepted') {
      problem.solvedAt = Date.now();
    }
    this.settings.setContestSession(session);
    this.callbacks.onVerdictChange(problemIdx, verdict);
  }

  /**
   * Update code buffer for a problem. Caller is responsible for debouncing.
   */
  updateCode(problemIdx: number, code: string, language: string): void {
    const session = this.settings.getContestSession();
    if (!session) return;

    const problem = session.problems[problemIdx];
    if (!problem) return;

    problem.code = code;
    problem.language = language;
    this.settings.setContestSession(session);
  }

  /**
   * Get the current session (or null if no active contest).
   */
  getSession(): ContestSession | null {
    return this.settings.getContestSession();
  }

  /**
   * Whether a contest session is currently active (exists and not cleared).
   */
  isActive(): boolean {
    return this.settings.getContestSession() !== null;
  }

  /**
   * Restore on plugin reload. If a session exists:
   *  - If expired during offline time: fire onExpired
   *  - If still active (not paused): restart ticking
   *  - If paused: do nothing (user must resume manually)
   */
  restore(): void {
    const session = this.settings.getContestSession();
    if (!session) return;

    if (!session.isPaused) {
      const remaining = getRemainingMs(session);
      if (remaining <= 0) {
        // Contest expired while plugin was unloaded
        this.callbacks.onExpired();
        return;
      }
      // Still running — restart the tick
      this.startTick();
    }
    // If paused, do nothing — user must resume manually
  }

  /**
   * Start the 1-second tick interval for countdown display.
   * Each tick computes remaining time from epoch (drift-free).
   */
  private startTick(): void {
    this.stopTick();
    this.tickHandle = window.setInterval(() => {
      const session = this.settings.getContestSession();
      if (!session) {
        this.stopTick();
        return;
      }
      const remaining = getRemainingMs(session);
      if (remaining <= 0) {
        this.stopTick();
        this.callbacks.onExpired();
      } else {
        this.callbacks.onTick(remaining);
      }
    }, 1000);
  }

  /**
   * Stop the tick interval.
   */
  private stopTick(): void {
    if (this.tickHandle !== null) {
      window.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }
}
