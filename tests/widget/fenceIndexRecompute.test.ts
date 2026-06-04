// Phase 19 Plan 02 Task 1 — fenceIndex recompute test (RED).
//
// Verifies RESEARCH Pitfall 19-E: DebouncedWriter.flush() recomputes the
// fenceIndex from fresh disk content; on detected drift (multi-fence inserted
// above), aborts the write and surfaces a Notice.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const noticeSpy = vi.fn();

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
  class Notice {
    constructor(public message: string, public timeout?: number) { noticeSpy(message, timeout); }
  }
  return { ...actual, debounce, Notice };
});

import { DebouncedWriter } from '../../src/widget/debouncedWriter';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

interface FakeFile { path: string }

const SINGLE_FENCE = [
  '## Code',
  '',
  '```leetcode-solve',
  'old',
  '```',
  '',
].join('\n');

const MULTI_FENCE = [
  '## Code',
  '',
  '```leetcode-solve',
  'newly-inserted',
  '```',
  '',
  '## Other',
  '',
  '```leetcode-solve',
  'old',
  '```',
  '',
].join('\n');

function makeFakeApp(initialContent: string) {
  const files = new Map<string, string>();
  return {
    files,
    initialContent,
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

describe('DebouncedWriter fenceIndex recompute (Pitfall 19-E)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    noticeSpy.mockClear();
    // Suppress D-09 post-flush diagnostic noise — this test exercises paths
    // where the diagnostic legitimately fires (fence missing → rewrite no-op),
    // and stderr noise breaks --reporter=dot expected line counts.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('aborts write + surfaces Notice when fence count grew (insertion above the active fence)', async () => {
    // Mount-time fenceIndex = 0 (when only the single fence existed). After
    // the insertion above, the active fence should be at index 1; the writer
    // detects drift and aborts.
    const app = makeFakeApp(SINGLE_FENCE);
    const file = { path: 'a.md' };
    app.files.set(file.path, MULTI_FENCE); // disk now has MULTI_FENCE
    const w = new DebouncedWriter(
      app as never, file as never, () => 'newbody', () => 0, new SelfWriteSuppression(), 0,
    );
    await w.forceFlush();
    // The vault.process must NOT fire (write aborted on drift).
    expect(app.vault.process).not.toHaveBeenCalled();
    // Notice surfaced.
    expect(noticeSpy).toHaveBeenCalledTimes(1);
    expect(noticeSpy.mock.calls[0]![0]).toMatch(/Fence position changed/i);
  });

  it('proceeds normally when fence count is unchanged at flush time', async () => {
    const app = makeFakeApp(SINGLE_FENCE);
    const file = { path: 'a.md' };
    app.files.set(file.path, SINGLE_FENCE);
    const w = new DebouncedWriter(
      app as never, file as never, () => 'newbody', () => 0, new SelfWriteSuppression(), 0,
    );
    await w.forceFlush();
    expect(app.vault.process).toHaveBeenCalledTimes(1);
    expect(noticeSpy).not.toHaveBeenCalled();
  });

  it('proceeds normally when fence at expected index disappeared (out-of-range no-op safe)', async () => {
    // If the active fence got removed entirely, current behavior: no fence at
    // expected index → rewriteFenceBody is a no-op. We accept this as safe;
    // the modify listener catches external removal.
    const app = makeFakeApp(SINGLE_FENCE);
    const file = { path: 'a.md' };
    app.files.set(file.path, '## Code\n\nNo fence here.\n');
    const w = new DebouncedWriter(
      app as never, file as never, () => 'newbody', () => 0, new SelfWriteSuppression(), 0,
    );
    await w.forceFlush();
    // No notice (we abort silently when expected fence missing — Plan 20 reload).
    // Vault content unchanged (rewrite is no-op when out of range).
    expect(app.files.get('a.md')).toBe('## Code\n\nNo fence here.\n');
  });
});
