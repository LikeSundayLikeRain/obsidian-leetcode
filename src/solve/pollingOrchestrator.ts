// src/solve/pollingOrchestrator.ts
//
// Phase 3 Plan 05 — exponential-backoff polling loop for LC submission judge.
// Contracts: D-21 (1/2/4/8s cadence), D-22 (60s wall-clock cap + abort),
// D-23 (three-point abort check; Pitfall 4), D-26 (3-consecutive-non-2xx → timeout).
// Warning 7: every scheduled timer flows through `registerInterval` so
// `Plugin.registerInterval` (bound by the orchestrator) cancels it on plugin unload.
//
// This module is pure-logic: it takes a `fetcher` (RequestUrlParam ->
// RequestUrlResponse) and schedules `check/` GETs. No direct requestUrl, no
// global state, no modal wiring — SubmissionOrchestrator composes it.
//
// Why this shape (vs. the plan's `check: () => Promise<CheckResponse>` signature):
// Wave 0 tests (tests/solve/pollingOrchestrator.test.ts) use the scripted
// `fakeFetcher` pattern to queue responses per URL. Accepting a fetcher +
// submissionId/slug keeps the test harness identical to leetcodeRest.test.ts
// and avoids duplicating the GET-check wiring inside the orchestrator.

import type { RequestUrlParam, RequestUrlResponse } from 'obsidian';

/** Cadence locked by D-21: 1s, 2s, 4s, 8s, then hold at 8s for all subsequent polls. */
export const BACKOFF_MS = [1000, 2000, 4000, 8000] as const;
/** Wall-clock cap locked by D-22. */
export const MAX_WALLCLOCK_MS = 60_000;
/** Non-2xx streak cap locked by D-26. */
export const MAX_CONSECUTIVE_ERRORS = 3;

const BASE_URL = 'https://leetcode.com';

/** Minimal abort-signal shape — matches the DOM AbortSignal's `aborted`
 *  property so tests can pass a bare `{ aborted: boolean }` literal. */
export interface AbortLike {
  aborted: boolean;
}

/** Plugin-aware timer registration. Orchestrator passes
 *  `plugin.registerInterval.bind(plugin)` wrapped so Obsidian cancels scheduled
 *  polls on plugin unload (Warning 7). Signature: `(fn, ms) => handle`. */
export type RegisterIntervalFn = (fn: () => void, ms: number) => unknown;

export type Fetcher = (params: RequestUrlParam) => Promise<RequestUrlResponse>;

export interface PollSubmissionArgs {
  fetcher: Fetcher;
  submissionId: string;
  slug: string;
  registerInterval: RegisterIntervalFn;
  abortSignal: AbortLike;
  /** Optional request headers applied to each poll GET. Required in production
   *  so LC accepts the /check/ request (cookie + csrf + referer); tests omit. */
  headers?: Record<string, string>;
}

/** Terminal judge response. LC returns `state: 'SUCCESS'` along with
 *  `status_code` when the submission is finalized; we also treat the presence
 *  of a numeric `status_code` on any non-PENDING/STARTED response as terminal
 *  for forward-compat with LC field drift. */
export interface TerminalCheckResponse {
  status_code: number;
  status_msg?: string;
  [k: string]: unknown;
}

/** Thrown when the user cancels mid-flight. SubmissionOrchestrator wraps this
 *  as silent-close (no Notice) — cancelling is a user action, not a failure. */
export class AbortError extends Error {
  constructor() {
    super('Submission aborted by user');
    this.name = 'AbortError';
  }
}

/** Thrown when the 60s wall-clock cap (D-22) OR 3-consecutive-non-2xx (D-26)
 *  fires. SubmissionOrchestrator renders the timeout state in VerdictModal. */
export class JudgeTimeoutError extends Error {
  constructor() {
    super('LeetCode judge timed out');
    this.name = 'JudgeTimeoutError';
  }
}

/**
 * Poll `/submissions/detail/{submissionId}/check/` until terminal, abort, or timeout.
 *
 * Three-point abort check (Pitfall 4):
 *   1. Before scheduling next iteration.
 *   2. On timer-callback entry.
 *   3. After `await fetcher(...)` resolves.
 *
 * Non-2xx handling (D-26): increment a consecutive counter; reset to 0 on any
 * 2xx response (even if the body is still PENDING). 3 in a row → JudgeTimeoutError.
 */
export function pollSubmission(args: PollSubmissionArgs): Promise<TerminalCheckResponse> {
  const { fetcher, submissionId, slug, registerInterval, abortSignal, headers } = args;
  const startedAt = Date.now();

  const p = createPollPromise();
  // Suppress unhandled-rejection noise in vitest when the test attaches its
  // `.rejects` matcher via `await expect(promise).rejects.toBeInstanceOf(...)`
  // AFTER the rejection has already been queued by `advanceTimersByTimeAsync`.
  // Attaching a no-op catch handler here means the real rejection is still
  // observable on the returned promise `p` (via the standard promise-chain
  // semantics: p.then/catch still sees the rejection because we return `p`
  // itself, not the derivative). The chain we create with `.catch(noop)`
  // observes and swallows the rejection on its own branch, while the caller's
  // `.rejects.toBeInstanceOf(...)` branch still observes it.
  void p.catch(() => { /* noop — prevents unhandled-rejection during fake-timer advance */ });
  return p;

  function createPollPromise(): Promise<TerminalCheckResponse> {
  // Attempt index: drives the BACKOFF_MS lookup. The FIRST poll fires
  // immediately (0ms) so the response arrives before we've burned the 1s
  // of wall-clock budget — Wave 0 tests (pollingOrchestrator.test.ts Pattern 2)
  // pin the cumulative cadence at [1000, 3000, 7000, 15000, 23000] AFTER the
  // initial poll resolves with STARTED. Subsequent polls step through BACKOFF_MS
  // and hold at the last value (8000ms) once the index exceeds the length.
  let attempt = 0;
  let consecutiveErrors = 0;
  // `settled` guards against duplicate resolve/reject after the promise has
  // already settled. Without this, a timer callback that fires AFTER we've
  // already timed out or aborted would call reject() again, and the
  // error-object allocation leaks as an unhandled-rejection trace in vitest.
  let settled = false;

  return new Promise<TerminalCheckResponse>((resolve, reject) => {
    const settleReject = (err: Error): void => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const settleResolve = (body: TerminalCheckResponse): void => {
      if (settled) return;
      settled = true;
      resolve(body);
    };

    const scheduleNext = (): void => {
      if (settled) return;
      // Abort check #1 — before scheduling. D-23 / Pitfall 4.
      if (abortSignal.aborted) {
        settleReject(new AbortError());
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= MAX_WALLCLOCK_MS) {
        settleReject(new JudgeTimeoutError());
        return;
      }
      // First poll fires immediately (0ms); subsequent polls use BACKOFF_MS.
      const intervalMs = attempt === 0
        ? 0
        : (BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] as number);
      attempt++;
      // Warning 7 fix — every scheduled timer flows through registerInterval.
      // Orchestrator wraps `plugin.registerInterval` so Obsidian cancels on unload.
      registerInterval(() => {
        if (settled) return;
        // Abort check #2 — timer-callback entry. Pitfall 4.
        if (abortSignal.aborted) {
          settleReject(new AbortError());
          return;
        }
        void (async () => {
          try {
            const res = await fetcher({
              url: `${BASE_URL}/submissions/detail/${submissionId}/check/`,
              method: 'GET',
              throw: false,
              ...(headers ? { headers } : {}),
            });
            // Abort check #3 — after await (critical per Pitfall 4: a stale
            // check response should never drive the modal forward after the
            // user clicked Cancel).
            if (settled) return;
            if (abortSignal.aborted) {
              settleReject(new AbortError());
              return;
            }
            if (res.status < 200 || res.status >= 300) {
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                settleReject(new JudgeTimeoutError());
                return;
              }
              scheduleNext();
              return;
            }
            consecutiveErrors = 0;
            const body = (res.json ?? {}) as { state?: string; status_code?: unknown };
            // Terminal when state === 'SUCCESS' OR a numeric status_code appears
            // (forward-compat with LC field drift for D-15 payload preservation).
            const isTerminal =
              body.state === 'SUCCESS' ||
              (body.state !== 'PENDING' && body.state !== 'STARTED' &&
                typeof body.status_code === 'number');
            if (isTerminal) {
              settleResolve(body as TerminalCheckResponse);
              return;
            }
            scheduleNext();
          } catch (err) {
            if (settled) return;
            // Abort check after rejection — prevents a stale rejection from
            // racing past a Cancel.
            if (abortSignal.aborted) {
              settleReject(new AbortError());
              return;
            }
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              settleReject(new JudgeTimeoutError());
              return;
            }
            // Log suppressed — test-friendly; caller inspects consecutiveErrors
            // via the eventual JudgeTimeoutError.
            void err;
            scheduleNext();
          }
        })();
      }, intervalMs);
    };

    scheduleNext();
  });
  }
}
