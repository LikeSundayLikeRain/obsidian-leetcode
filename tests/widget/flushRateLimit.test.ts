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
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingArgs: T | null = null;
    const run = (...args: T): V | undefined => {
      pendingArgs = args;
      if (timer && resetTimer) { clearTimeout(timer); timer = null; }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pendingArgs) { const a = pendingArgs; pendingArgs = null; cb(...a); }
        }, timeout);
      }
      return undefined;
    };
    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
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

describe('DebouncedWriter rate limit (SYNC-07)', () => {
  let app: ReturnType<typeof makeFakeApp>;
  let file: FakeFile;
  let suppression: SelfWriteSuppression;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_000));
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

    // First flush — fires immediately; lastFlushAt = T0.
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    // Second flush at T+50ms — should coalesce/delay until T+200ms.
    vi.setSystemTime(new Date(1_000_050));
    const flushPromise = w.forceFlush();

    // Advance to T+199ms — still under rate-limit window.
    await vi.advanceTimersByTimeAsync(149);
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    // Advance the remaining 1ms (now T+200ms from flush #1).
    await vi.advanceTimersByTimeAsync(1);
    // Allow microtasks to drain.
    await Promise.resolve();
    await Promise.resolve();
    await flushPromise.catch(() => undefined);

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

    // Immediate retry — must NOT fire synchronously.
    vi.setSystemTime(new Date(1_000_010));
    void w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);
  });

  it('after rate-limit window expires, next flush fires immediately', async () => {
    const w = new DebouncedWriter(
      app as never, file as never, () => 'body', () => 0, suppression, 0,
    );
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(1_000_201));
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(2);
  });
});
