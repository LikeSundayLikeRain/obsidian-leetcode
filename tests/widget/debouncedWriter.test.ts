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
  let getDoc: ReturnType<typeof vi.fn>;
  let getFenceIndex: ReturnType<typeof vi.fn>;

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
    getDoc = vi.fn(() => 'newbody');
    getFenceIndex = vi.fn(() => 0);
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
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
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
});
