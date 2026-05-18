// src/contest/types.ts
// Pure interface module (zero runtime deps) — per src/browse/types.ts pattern.
// All contest type contracts for Phase 10. No other module hardcodes these shapes.

/** Cached contest metadata persisted in PluginData.contestIndex. Minimal shape
 *  derived from PastContest (LC API) to keep data.json lean. */
export interface CachedContest {
  slug: string;
  title: string;
  startTime: number;
  duration: number; // seconds (from PastContest.duration)
  type: 'weekly' | 'biweekly';
}

/** Contest index persisted in PluginData. 24h TTL (same as problemIndex). */
export interface ContestIndex {
  fetchedAt: number;
  contests: CachedContest[];
}

/** Per-problem ephemeral state during a contest session. Lives in PluginData
 *  (not in vault files — D-09). */
export interface ContestProblemState {
  slug: string;
  title: string;
  credit: number;
  difficulty: number; // 1=Easy, 2=Medium, 3=Hard (from ContestQuestion.difficulty)
  verdict: 'unsolved' | 'attempted' | 'accepted';
  code: string; // ephemeral code buffer
  language: string; // user's selected language for this problem
  solvedAt: number | null; // epoch ms when AC'd
}

/** Full contest session state persisted in PluginData (D-08). Survives reload
 *  via Date.now() baseline — no interval drift (RESEARCH Pattern 2). */
export interface ContestSession {
  contestSlug: string;
  contestTitle: string;
  contestType: 'weekly' | 'biweekly';
  duration: number; // seconds (from PastContest.duration)
  startedAt: number; // epoch ms
  pausedDuration: number; // cumulative ms paused
  isPaused: boolean;
  pausedAt: number | null; // epoch ms when pause began
  problems: ContestProblemState[];
}

/**
 * Compute remaining contest time from epoch math (RESEARCH Pattern 2).
 * Pure function — no I/O, no side effects. Handles both paused and running states.
 */
export function getRemainingMs(session: ContestSession): number {
  const now = session.isPaused ? session.pausedAt! : Date.now();
  const elapsed = now - session.startedAt - session.pausedDuration;
  const remaining = session.duration * 1000 - elapsed;
  return Math.max(0, remaining);
}
