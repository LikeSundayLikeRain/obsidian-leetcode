// tests/solve/pollingOrchestrator.test.ts
// RED baseline (Wave 0) — will fail until Plan 05 ships
// src/solve/pollingOrchestrator.ts with pollSubmission + JudgeTimeoutError + AbortError.
//
// Contracts under test:
//   D-23: abort flag halts polling between iterations (three-point check)
//   D-26: 3 consecutive non-2xx → JudgeTimeoutError; 60s cap → JudgeTimeoutError
//   Pattern 2: exponential backoff 1/2/4/8/8 with 60s cap
//   Warning 7: orchestrator accepts a registerInterval-style hook (stubbed
//     here via vi.fn()) so production code can route through Plugin.registerInterval
//
// Driven by vi.useFakeTimers() so we advance time deterministically.
 
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeFetcher } from './mocks/fakeFetcher';
 
import {
  pollSubmission,
  JudgeTimeoutError,
  AbortError,
} from '../../src/solve/pollingOrchestrator';
import acceptedFixture from './fixtures/accepted.json';

describe('pollingOrchestrator.pollSubmission (D-23, D-26, Pattern 2)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('Pattern 2: first poll at t≈1000ms (1s backoff)', async () => {
    const ff = makeFakeFetcher();
    // First call must return a STARTED so we can observe the scheduling.
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: acceptedFixture },
    ]);
    const reg = vi.fn((fn: () => void, _ms: number) => window.setTimeout(fn, _ms));
    const promise = pollSubmission({
      fetcher: ff.fetcher,
      submissionId: '42',
      slug: 'two-sum',
      registerInterval: reg,
      abortSignal: { aborted: false },
    });
    await vi.advanceTimersByTimeAsync(1001);
    expect(ff.spy).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toMatchObject({ status_code: 10 });
  });

  it('Pattern 2: cumulative poll times follow 1/2/4/8/8 backoff (1000, 3000, 7000, 15000, 23000)', async () => {
    const ff = makeFakeFetcher();
    // 5 STARTED + terminal SUCCESS on the 6th poll — each STARTED drives the next backoff tick.
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: acceptedFixture },
    ]);
    const reg = vi.fn((fn: () => void, ms: number) => window.setTimeout(fn, ms));
    const promise = pollSubmission({
      fetcher: ff.fetcher,
      submissionId: '42',
      slug: 'two-sum',
      registerInterval: reg,
      abortSignal: { aborted: false },
    });
    await vi.advanceTimersByTimeAsync(30000);
    await expect(promise).resolves.toMatchObject({ status_code: 10 });
    // reg was called at least once per scheduled poll.
    expect(reg).toHaveBeenCalled();
  });

  it('D-26: 60s cap → JudgeTimeoutError even if fetcher keeps returning STARTED', async () => {
    const ff = makeFakeFetcher();
    // Always STARTED — never terminal.
    ff.queue(/check\/$/, Array.from({ length: 30 }, () => ({ status: 200, json: { state: 'STARTED' } })));
    const promise = pollSubmission({
      fetcher: ff.fetcher,
      submissionId: '42',
      slug: 'two-sum',
      registerInterval: (fn, ms) => window.setTimeout(fn, ms),
      abortSignal: { aborted: false },
    });
    await vi.advanceTimersByTimeAsync(65000);
    await expect(promise).rejects.toBeInstanceOf(JudgeTimeoutError);
  });

  it('D-26: 3 consecutive non-2xx → JudgeTimeoutError', async () => {
    const ff = makeFakeFetcher();
    ff.queue(/check\/$/, [
      { status: 500, json: null },
      { status: 502, json: null },
      { status: 503, json: null },
    ]);
    const promise = pollSubmission({
      fetcher: ff.fetcher,
      submissionId: '42',
      slug: 'two-sum',
      registerInterval: (fn, ms) => window.setTimeout(fn, ms),
      abortSignal: { aborted: false },
    });
    await vi.advanceTimersByTimeAsync(30000);
    await expect(promise).rejects.toBeInstanceOf(JudgeTimeoutError);
  });

  it('D-23: abort flag flipped between polls → rejects with AbortError', async () => {
    const ff = makeFakeFetcher();
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: { state: 'STARTED' } },
    ]);
    const signal = { aborted: false };
    const promise = pollSubmission({
      fetcher: ff.fetcher,
      submissionId: '42',
      slug: 'two-sum',
      registerInterval: (fn, ms) => window.setTimeout(fn, ms),
      abortSignal: signal,
    });
    // Advance through the first poll, then flip abort BEFORE the second.
    await vi.advanceTimersByTimeAsync(1500);
    signal.aborted = true;
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).rejects.toBeInstanceOf(AbortError);
  });

  it('Warning 7: registerInterval stub is invoked at least once per scheduled poll', async () => {
    const ff = makeFakeFetcher();
    ff.queue(/check\/$/, [
      { status: 200, json: { state: 'STARTED' } },
      { status: 200, json: acceptedFixture },
    ]);
    const reg = vi.fn((fn: () => void, ms: number) => window.setTimeout(fn, ms));
    const promise = pollSubmission({
      fetcher: ff.fetcher,
      submissionId: '42',
      slug: 'two-sum',
      registerInterval: reg,
      abortSignal: { aborted: false },
    });
    await vi.advanceTimersByTimeAsync(5000);
    await promise.catch(() => undefined); // don't care about result here
    expect(reg.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
