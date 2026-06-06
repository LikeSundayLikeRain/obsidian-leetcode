// Phase 19 Plan 02 Task 1 — Per-file flush rate-limit tests (RED).
//
// Verifies SYNC-07 / CONTEXT C-08: per-file rate limit max 1 flush per
// 200ms; over-rate calls coalesce.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  const debounce = <T extends unknown[], V>(
    cb: (...args: T) => V,
    timeout = 0,
    resetTimer = false,
  ) => {
    let timer: number | null = null;
    let pendingArgs: T | null = null;
    const run = (...args: T): V | undefined => {
      pendingArgs = args;
      if (timer && resetTimer) { window.clearTimeout(timer); timer = null; }
      if (!timer) {
        timer = window.setTimeout(() => {
          timer = null;
          if (pendingArgs) { const a = pendingArgs; pendingArgs = null; cb(...a); }
        }, timeout);
      }
      return undefined;
    };
    const cancel = () => {
      if (timer) { window.clearTimeout(timer); timer = null; }
      pendingArgs = null;
      return debounced;
    };
    const debounced = Object.assign(run, { run, cancel });
    return debounced;
  };
  return { ...actual, debounce };
});

import { DebouncedWriter } from '../../src/widget/debouncedWriter';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

interface FakeFile { path: string }

const FENCE_NOTE = [
  '## Code',
  '',
  '```leetcode-solve',
  'old',
  '```',
  '',
].join('\n');

function makeFakeApp() {
  const files = new Map<string, string>();
  const callTimestamps: number[] = [];
  return {
    files,
    callTimestamps,
    vault: {
      read: vi.fn(async (f: FakeFile) => files.get(f.path) ?? ''),
      process: vi.fn(async (f: FakeFile, fn: (body: string) => string) => {
        callTimestamps.push(Date.now());
        const before = files.get(f.path) ?? '';
        const after = fn(before);
        files.set(f.path, after);
        return after;
      }),
    },
  };
}

/**
 * Drain the asynchronous flush() chain deterministically.
 *
 * The flush body awaits vault.read → sha1 (native crypto.subtle.digest
 * Promise — NOT synchronized with fake timers) → vault.process. Different
 * Node versions / CI runners need different numbers of event-loop ticks for
 * the native crypto Promise to resolve, so a fixed-iteration drain loop
 * flakes under CI load. We tick fake time forward in 1ms increments until
 * vault.process has fired the target number of times.
 *
 * Each 1ms tick drains pending microtasks AND fires any sub-window timers,
 * which is sufficient regardless of how many native-Promise hops crypto
 * needs.
 */
async function drainUntilCalled(
  app: { vault: { process: ReturnType<typeof vi.fn> } },
  target: number,
  maxIters = 2000,
): Promise<void> {
  const calls = () => (app.vault.process as ReturnType<typeof vi.fn>).mock.calls.length;
  for (let i = 0; i < maxIters; i++) {
    if (calls() >= target) return;
    await vi.advanceTimersByTimeAsync(1);
  }
  if (calls() < target) {
    throw new Error(
      `drainUntilCalled: vault.process called ${calls()} times after ${maxIters}ms (expected >= ${target})`,
    );
  }
}

describe('DebouncedWriter rate limit (SYNC-07)', () => {
  let app: ReturnType<typeof makeFakeApp>;
  let file: FakeFile;
  let suppression: SelfWriteSuppression;

  beforeEach(() => {
    vi.useFakeTimers();
    // Non-zero epoch so the first flush's rate-limit check (now - 0 ≥ 200)
    // doesn't gate it.
    vi.setSystemTime(new Date(10_000_000));
    app = makeFakeApp();
    file = { path: 'a.md' };
    app.files.set(file.path, FENCE_NOTE);
    suppression = new SelfWriteSuppression();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('two back-to-back forceFlush calls produce two writes with ≥200ms gap', async () => {
    let docSeq = 0;
    const w = new DebouncedWriter(
      app as never, file as never, () => `body${docSeq++}`, () => 0, suppression, 0,
    );

    // First flush — fires immediately; lastFlushAt = T0. Await drains the
    // entire async chain (vault.read → sha1 → vault.process) via microtasks,
    // capturing t0 at exactly T0 with no fake-time advancement.
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    // Advance 50ms — still under rate-limit window.
    await vi.advanceTimersByTimeAsync(50);
    // Second flush — under rate-limit window. forceFlush() resolves
    // synchronously (rate-limit gate returns early), but a deferred flush is
    // scheduled via setTimeout to fire 150ms later.
    void w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    // Drain until the deferred rate-limit timer fires AND its async flush
    // chain (vault.read → sha1 → vault.process) resolves to completion.
    // 1ms ticks are sufficient regardless of how many native-Promise hops
    // crypto.subtle.digest needs on the host runner (CI flake fix).
    await drainUntilCalled(app, 2);

    expect(app.vault.process).toHaveBeenCalledTimes(2);
    const t0 = app.callTimestamps[0]!;
    const t1 = app.callTimestamps[1]!;
    expect(t1 - t0).toBeGreaterThanOrEqual(200);
  });

  it('flush within rate-limit window does not fire vault.process immediately', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, () => 'body', () => 0, suppression, 0,
    );
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    // Advance 10ms — still in rate-limit window.
    await vi.advanceTimersByTimeAsync(10);
    void w.forceFlush();
    // Drain microtasks — the rate-limit gate returns synchronously without
    // firing process.
    await Promise.resolve();
    expect(app.vault.process).toHaveBeenCalledTimes(1);
  });

  it('after rate-limit window expires, next flush fires immediately', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, () => 'body', () => 0, suppression, 0,
    );
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    // Advance past rate-limit window.
    await vi.advanceTimersByTimeAsync(201);
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(2);
  });
});
