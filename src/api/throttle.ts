// Token-bucket + concurrency limit. Parameters LOCKED by D-12 / CF-07:
//   capacity: 20, refillMs: 10_000, maxConcurrent: 2
// D-13 — exposes a queue-depth observer so Plan 06's footer indicator can show
// "⋯ Fetching from LeetCode…" only when the queue stays > 0 for > 2 s.

// Popout-window-safe timer helpers. Obsidian injects `activeWindow` as the
// currently-focused window (including popouts); its `setTimeout` binds timers
// to that window's event loop. In Node-hosted unit tests `activeWindow` is
// undefined, so we fall back to the platform `setTimeout`. Resolution happens
// per-call so that vitest's `useFakeTimers()` (which swaps the platform timer
// functions after module load) still works.
declare const activeWindow: Window | undefined;
type TimerHandle = ReturnType<typeof setTimeout>;
const _setTimeout = (fn: () => void, ms: number): TimerHandle => {
  if (typeof activeWindow !== 'undefined' && activeWindow) {
    return activeWindow.setTimeout(fn, ms) as unknown as TimerHandle;
  }
  // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- test fallback; activeWindow branch is the runtime path
  return setTimeout(fn, ms);
};
const _clearTimeout = (handle: TimerHandle): void => {
  if (typeof activeWindow !== 'undefined' && activeWindow) {
    activeWindow.clearTimeout(handle as unknown as number);
    return;
  }
  // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- test fallback; activeWindow branch is the runtime path
  clearTimeout(handle);
};

export interface ThrottleOpts {
  capacity: number;
  refillMs: number;
  maxConcurrent: number;
}

export type QueueChangeListener = (depth: number) => void;

export class Throttle {
  private tokens: number;
  private readonly cap: number;
  private readonly refillMs: number;
  private readonly maxConc: number;
  private running = 0;
  private waiters: Array<() => void> = [];
  private lastRefill = Date.now();
  private listeners: Set<QueueChangeListener> = new Set();

  constructor(o: ThrottleOpts) {
    this.cap = o.capacity;
    this.tokens = o.capacity;
    this.refillMs = o.refillMs;
    this.maxConc = o.maxConcurrent;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefill >= this.refillMs) {
      this.tokens = this.cap;
      this.lastRefill = now;
    }
    while (this.tokens <= 0 || this.running >= this.maxConc) {
      // Schedule a self-wake if the only reason we're blocked is an empty
      // token bucket (otherwise release() handles it). Without this, a
      // saturated throttle with no in-flight requests would dead-lock because
      // release() never fires during idle refill windows.
      const delayUntilRefill = this.refillMs - (Date.now() - this.lastRefill);
      let refillTimer: ReturnType<typeof setTimeout> | null = null;
      let resolver: (() => void) | null = null;
      await new Promise<void>((r) => {
        resolver = r;
        this.waiters.push(r);
        this.emitDepthChange();
        if (this.tokens <= 0 && delayUntilRefill > 0) {
          refillTimer = _setTimeout(() => {
            // Remove ourselves from the waiters queue (by identity, not position,
            // to stay safe if release() already shifted us) and resolve.
            const i = this.waiters.indexOf(r);
            if (i !== -1) {
              this.waiters.splice(i, 1);
              this.emitDepthChange();
            }
            r();
          }, delayUntilRefill);
        }
      });
      if (refillTimer) _clearTimeout(refillTimer);
      // If release() woke us via its setTimeout path, the resolver was already
      // shifted off — so no cleanup needed. Suppress unused-var lint.
      void resolver;
      const nowAgain = Date.now();
      if (nowAgain - this.lastRefill >= this.refillMs) {
        this.tokens = this.cap;
        this.lastRefill = nowAgain;
      }
    }
    // Defensive clamp: the while-loop guarantees tokens > 0 on entry, but
    // if a future refactor ever reorders the guards, keep this from going
    // negative (CR-03 defense-in-depth). Math.max(0, ...) is a no-op in the
    // current correct path.
    this.tokens = Math.max(0, this.tokens - 1);
    this.running++;
  }

  release(): void {
    // CR-04: guard against over-release. If release() is called more times
    // than acquire() has returned (e.g. exception thrown between acquire and
    // the request body, or a buggy caller), `running` would go negative and
    // the `running >= maxConc` gate would silently admit more than maxConc
    // concurrent requests. Clamp to zero instead.
    if (this.running > 0) this.running--;
    const w = this.waiters.shift();
    this.emitDepthChange();
    // CR-03: wake the next waiter synchronously. The previous impl used
    // _setTimeout(w, 0), which introduced a tick gap during which a second
    // concurrent acquire() could exit its while-loop with the same token
    // count, resulting in `tokens-- === -1`. A synchronous call preserves
    // the single-threaded invariant (one waker runs to completion before the
    // next starts).
    if (w) w();
  }

  getQueueDepth(): number {
    return this.waiters.length;
  }

  onQueueChange(cb: QueueChangeListener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private emitDepthChange(): void {
    const depth = this.waiters.length;
    for (const cb of this.listeners) {
      try { cb(depth); } catch { /* ignore listener errors */ }
    }
  }
}
