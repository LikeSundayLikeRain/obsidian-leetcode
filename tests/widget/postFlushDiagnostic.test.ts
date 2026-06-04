// Phase 19 Plan 02 Task 1 — Post-flush hash diagnostic test (RED).
//
// Verifies CONTEXT D-09 / SYNC-06 runtime portion: console.warn fires when
// the post-flush observed fence body hash differs from the expected (widget
// doc) hash. With a working rewriteFenceBody, no warning fires.

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

function makeFakeApp(processOverride?: (body: string) => string) {
  const files = new Map<string, string>();
  return {
    files,
    vault: {
      read: vi.fn(async (f: FakeFile) => files.get(f.path) ?? ''),
      process: vi.fn(async (f: FakeFile, fn: (body: string) => string) => {
        const before = files.get(f.path) ?? '';
        const after = processOverride ? processOverride(before) : fn(before);
        files.set(f.path, after);
        return after;
      }),
    },
  };
}

describe('post-flush hash diagnostic (CONTEXT D-09)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does NOT warn when round-trip is byte-exact (normal typing)', async () => {
    const app = makeFakeApp();
    const file = { path: 'a.md' };
    app.files.set(file.path, FENCE_NOTE);
    const w = new DebouncedWriter(
      app as never, file as never, () => 'newbody', () => 0,
      new SelfWriteSuppression(), 0,
    );
    await w.forceFlush();
    const driftWarn = warnSpy.mock.calls.find((args: unknown[]) =>
      typeof args[0] === 'string' && /post-flush hash drift/i.test(args[0] as string),
    );
    expect(driftWarn).toBeUndefined();
  });

  it('warns when post-flush observed body differs from expected (drift simulation)', async () => {
    // Override vault.process to corrupt the on-disk content (insert phantom
    // newline) — the diagnostic must fire.
    const app = makeFakeApp((before) => {
      // Run normal rewrite then mutate.
      // Simulate corrupting body with extra newline.
      return before.replace(/old/, 'corrupted-body\n');
    });
    const file = { path: 'a.md' };
    app.files.set(file.path, FENCE_NOTE);
    const w = new DebouncedWriter(
      app as never, file as never, () => 'newbody', () => 0,
      new SelfWriteSuppression(), 0,
    );
    await w.forceFlush();
    const driftWarn = warnSpy.mock.calls.find((args: unknown[]) =>
      typeof args[0] === 'string' && /post-flush hash drift/i.test(args[0] as string),
    );
    expect(driftWarn).toBeDefined();
    // The warning message should mention the file path.
    expect(driftWarn![0]).toContain('a.md');
  });
});
