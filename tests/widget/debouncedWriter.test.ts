// Phase 19 Plan 02 Task 1 — DebouncedWriter unit tests (RED).
//
// Verifies SYNC-01: debounce with configurable delay (default 400ms),
// resetTimer behavior, cancel(), forceFlush(), setDelay(), and the
// canonical arm-then-vault.process flow.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  // Replace `debounce` with a deterministic fake-timer-friendly version that
  // mimics Obsidian's Debouncer<T,V> shape (run + cancel methods).
  const debounce = <T extends unknown[], V>(
    cb: (...args: T) => V,
    timeout = 0,
    resetTimer = false,
  ) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingArgs: T | null = null;
    const run = (...args: T): V | undefined => {
      pendingArgs = args;
      if (timer && resetTimer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pendingArgs) {
            const a = pendingArgs;
            pendingArgs = null;
            cb(...a);
          }
        }, timeout);
      }
      return undefined;
    };
    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
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
import { rewriteFenceBody } from '../../src/widget/fenceSerialization';

interface FakeFile { path: string }

function makeFakeApp() {
  const files = new Map<string, string>();
  return {
    files,
    vault: {
      read: vi.fn(async (f: FakeFile) => files.get(f.path) ?? ''),
      process: vi.fn(async (f: FakeFile, fn: (body: string) => string) => {
        const before = files.get(f.path) ?? '';
        const after = fn(before);
        files.set(f.path, after);
        return after;
      }),
    },
  };
}

const FENCE_NOTE = [
  '## Code',
  '',
  '```leetcode-solve',
  'old',
  '```',
  '',
].join('\n');

describe('DebouncedWriter', () => {
  let app: ReturnType<typeof makeFakeApp>;
  let file: FakeFile;
  let suppression: SelfWriteSuppression;
  let getDoc: () => string;
  let getFenceIndex: () => number;

  beforeEach(() => {
    vi.useFakeTimers();
    // Start at a non-zero epoch so the first flush isn't gated by the
    // rate-limiter (which would otherwise see lastFlushAt=0 vs now=0 and
    // defer indefinitely).
    vi.setSystemTime(new Date(10_000_000));
    app = makeFakeApp();
    file = { path: 'a.md' };
    app.files.set(file.path, FENCE_NOTE);
    suppression = new SelfWriteSuppression();
    getDoc = () => 'newbody';
    getFenceIndex = () => 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('run() schedules flush after delayMs (default 400ms)', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    w.run();
    await vi.advanceTimersByTimeAsync(399);
    expect(app.vault.process).not.toHaveBeenCalled();
    // Drain remaining 1ms PLUS pending microtasks from the async flush() chain.
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    // crypto.subtle.digest returns a real Promise that fake timers don't
    // synchronize with deterministically — drain remaining microtasks.
    for (let i = 0; i < 5 && (app.vault.process as ReturnType<typeof vi.fn>).mock.calls.length === 0; i++) {
      await Promise.resolve();
      await vi.runAllTimersAsync();
    }
    expect(app.vault.process).toHaveBeenCalledTimes(1);
  });

  it('run() called repeatedly within delay window resets the timer (one flush)', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    w.run();
    await vi.advanceTimersByTimeAsync(100);
    w.run();
    await vi.advanceTimersByTimeAsync(100);
    w.run();
    // After the third call, only 200ms has elapsed since the first; timer
    // resets each time. We need 400ms past the LAST run().
    await vi.advanceTimersByTimeAsync(399);
    expect(app.vault.process).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    // crypto.subtle.digest returns a real Promise that fake timers don't
    // synchronize with deterministically — drain remaining microtasks.
    for (let i = 0; i < 5 && (app.vault.process as ReturnType<typeof vi.fn>).mock.calls.length === 0; i++) {
      await Promise.resolve();
      await vi.runAllTimersAsync();
    }
    expect(app.vault.process).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops pending flush', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    w.run();
    w.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(app.vault.process).not.toHaveBeenCalled();
  });

  it('forceFlush() bypasses timer and writes synchronously', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    w.run();
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);
  });

  it('setDelay(1000) — next run() fires after 1000ms not 400ms', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    w.setDelay(1000);
    w.run();
    await vi.advanceTimersByTimeAsync(999);
    expect(app.vault.process).not.toHaveBeenCalled();
    // Advance the remaining 1ms, then drain pending timers + microtasks.
    await vi.advanceTimersByTimeAsync(2);
    for (let i = 0; i < 5; i++) {
      await vi.runAllTimersAsync();
      await Promise.resolve();
    }
    expect(app.vault.process).toHaveBeenCalledTimes(1);
  });

  it('flush() arms suppression with future-fence-body hash BEFORE vault.process (CONTEXT C-04)', async () => {
    const armSpy = vi.spyOn(suppression, 'arm');
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    await w.forceFlush();
    expect(armSpy).toHaveBeenCalledTimes(1);
    expect(armSpy).toHaveBeenCalledBefore(app.vault.process);
    expect(armSpy.mock.calls[0]![0]).toBe('a.md');
    // Hash should be non-empty.
    expect(armSpy.mock.calls[0]![1].length).toBeGreaterThan(0);
  });

  it('flush() writes through vault.process using rewriteFenceBody', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, getDoc, getFenceIndex, suppression, 400,
    );
    await w.forceFlush();
    const expected = rewriteFenceBody(FENCE_NOTE, 0, 'newbody');
    expect(app.files.get('a.md')).toBe(expected);
  });

  // Phase 20 Plan 20-03 Task 1 — hasPending() accessor (SYNC-05).
  // Sentinel boolean reset on flush completion / cancel; set on run().
  describe('hasPending()', () => {
    it('returns false immediately after construction', () => {
      const w = new DebouncedWriter(
        app as never, file as never, getDoc, getFenceIndex, suppression, 400,
      );
      expect(w.hasPending()).toBe(false);
    });

    it('returns true after run() schedules a debounced flush', () => {
      const w = new DebouncedWriter(
        app as never, file as never, getDoc, getFenceIndex, suppression, 400,
      );
      w.run();
      expect(w.hasPending()).toBe(true);
    });

    it('returns false after forceFlush() resolves', async () => {
      const w = new DebouncedWriter(
        app as never, file as never, getDoc, getFenceIndex, suppression, 400,
      );
      w.run();
      expect(w.hasPending()).toBe(true);
      await w.forceFlush();
      expect(w.hasPending()).toBe(false);
    });

    it('returns false after cancel()', () => {
      const w = new DebouncedWriter(
        app as never, file as never, getDoc, getFenceIndex, suppression, 400,
      );
      w.run();
      expect(w.hasPending()).toBe(true);
      w.cancel();
      expect(w.hasPending()).toBe(false);
    });

    it('two consecutive run() calls keep hasPending() === true until flush completes', async () => {
      const w = new DebouncedWriter(
        app as never, file as never, getDoc, getFenceIndex, suppression, 400,
      );
      w.run();
      w.run();
      expect(w.hasPending()).toBe(true);
      await w.forceFlush();
      expect(w.hasPending()).toBe(false);
    });
  });

  // Plan 21-17 — originator threading. DebouncedWriter accepts an optional
  // registryKey at construction; flush() passes it as the third arg to
  // selfWriteSuppression.arm(...) so peer-sync fan-out can identify the
  // writing pane and skip it during the modify-handler dispatch.
  describe('arm() originator threading (Plan 21-17)', () => {
    it('W1 DebouncedWriter constructed with registryKey arms suppression with the controller registryKey', async () => {
      const armSpy = vi.spyOn(suppression, 'arm');
      const w = new DebouncedWriter(
        app as never,
        file as never,
        getDoc,
        getFenceIndex,
        suppression,
        400,
        'a.md::0::leaf-A::lp', // registryKey — Plan 21-17 originator
      );
      await w.forceFlush();
      expect(armSpy).toHaveBeenCalledTimes(1);
      // Third arg is the registryKey; first arg is path; second is hash.
      expect(armSpy.mock.calls[0]![0]).toBe('a.md');
      expect(armSpy.mock.calls[0]![2]).toBe('a.md::0::leaf-A::lp');
    });

    it('W2 DebouncedWriter constructed without registryKey falls back to 2-arg arm() shape (backward compat)', async () => {
      const armSpy = vi.spyOn(suppression, 'arm');
      // Legacy 6-arg constructor — no registryKey. Backward compat for
      // existing test fixtures that haven't been threaded.
      const w = new DebouncedWriter(
        app as never, file as never, getDoc, getFenceIndex, suppression, 400,
      );
      await w.forceFlush();
      expect(armSpy).toHaveBeenCalledTimes(1);
      expect(armSpy.mock.calls[0]![0]).toBe('a.md');
      // Third arg is undefined — arm's default behavior.
      expect(armSpy.mock.calls[0]![2]).toBeUndefined();
    });

    it('peer-sync routing: peekOriginator returns the registryKey threaded by DebouncedWriter', async () => {
      const w = new DebouncedWriter(
        app as never,
        file as never,
        getDoc,
        getFenceIndex,
        suppression,
        400,
        'a.md::0::leaf-X::lp',
      );
      await w.forceFlush();
      // The arm call inside flush() set the originator; peekOriginator
      // returns it (entry was already consumed by the post-flush hash
      // diagnostic? No — the modify event consumes it in production; in
      // this test we manually peek BEFORE any tryConsume).
      // Actually, flush() arms BEFORE vault.process; the test's vault.process
      // returns synchronously without firing a modify echo, so the entry
      // remains armed and peekOriginator should return it.
      expect(suppression.peekOriginator('a.md')).toBe('a.md::0::leaf-X::lp');
    });
  });
});
