// src/contest/types.ts
// Phase 10 Plan 01 — Interfaces and pure helpers for the contest subsystem.
//
// SSoT for contest data shapes. All contest modules import from here.
// Mirror convention from src/notes/types.ts (Phase 2 SSoT pattern).

/**
 * Persisted contest session state. Lives in PluginData.contestSession.
 * Shape locked by CONTEXT.md D-08.
 */
export interface ContestSession {
  contestSlug: string;
  contestTitle: string;
  contestType: 'weekly' | 'biweekly';
  /** Contest duration in seconds (from PastContest.duration). */
  duration: number;
  /** Epoch ms when the user started this contest session. */
  startedAt: number;
  /** Cumulative milliseconds spent paused. */
  pausedDuration: number;
  /** Whether the session is currently paused. */
  isPaused: boolean;
  /** Epoch ms when the current pause began (null if not paused). */
  pausedAt: number | null;
  /** Per-problem state for the 4 contest problems. */
  problems: ContestProblemState[];
}

/**
 * Per-problem state within a contest session.
 */
export interface ContestProblemState {
  slug: string;
  title: string;
  /** LC credit (points) for this problem in the contest. */
  credit: number;
  /** Difficulty tier: 1=Easy, 2=Medium, 3=Hard. */
  difficulty: number;
  /** Current verdict state — only upgrades (unsolved -> attempted -> accepted). */
  verdict: 'unsolved' | 'attempted' | 'accepted';
  /** Ephemeral code buffer — persisted in PluginData, not in vault during contest. */
  code: string;
  /** LC language slug (e.g., 'python3', 'java'). */
  language: string;
  /** Epoch ms when the user got AC (null if not yet accepted). */
  solvedAt: number | null;
}

/**
 * Compute remaining milliseconds for a contest session.
 * Drift-free: uses epoch math, not interval counting (Pitfall 1).
 *
 * @returns remaining ms (clamped to 0 — never negative)
 */
export function getRemainingMs(session: ContestSession): number {
  const now = session.isPaused ? session.pausedAt! : Date.now();
  const elapsed = now - session.startedAt - session.pausedDuration;
  const remaining = session.duration * 1000 - elapsed;
  return Math.max(0, remaining);
}
