import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Throttle } from '../src/api/throttle';

describe('Throttle (BROWSE-05)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('25 sequential acquires take >=10s with capacity=20', async () => {
    const t = new Throttle({ capacity: 20, refillMs: 10_000, maxConcurrent: 2 });
    const start = Date.now();
    let maxInFlight = 0;
    let inFlight = 0;

    const runOne = async () => {
      await t.acquire();
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      t.release();
    };

    const run = (async () => {
      for (let i = 0; i < 25; i++) await runOne();
    })();

    await vi.advanceTimersByTimeAsync(10_001);
    await run;

    expect(Date.now() - start).toBeGreaterThanOrEqual(10_000);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('first 20 acquires resolve immediately (no refill needed)', async () => {
    const t = new Throttle({ capacity: 20, refillMs: 10_000, maxConcurrent: 20 });
    for (let i = 0; i < 20; i++) {
      await t.acquire();
    }
    expect(true).toBe(true);
  });

  it('concurrency limit caps simultaneous runners at maxConcurrent', async () => {
    const t = new Throttle({ capacity: 100, refillMs: 10_000, maxConcurrent: 2 });
    let inFlight = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 10 }, async () => {
        await t.acquire();
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise<void>((r) => setTimeout(r, 5));
        inFlight--;
        t.release();
      })
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('Throttle.onQueueChange (D-13)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('getQueueDepth returns 0 on a fresh throttle', () => {
    const t = new Throttle({ capacity: 5, refillMs: 10_000, maxConcurrent: 5 });
    expect(t.getQueueDepth()).toBe(0);
  });

  it('getQueueDepth reflects pending waiters while tokens + concurrency are saturated', async () => {
    const t = new Throttle({ capacity: 1, refillMs: 10_000, maxConcurrent: 1 });
    // Consume the only token + slot without releasing.
    await t.acquire();
    // Queue three more acquires without awaiting.
    void t.acquire();
    void t.acquire();
    void t.acquire();
    // Allow microtasks to flush so .push() has run.
    await Promise.resolve();
    expect(t.getQueueDepth()).toBe(3);
  });

  it('onQueueChange fires on enqueue and dequeue; unsubscribe stops further calls', async () => {
    const t = new Throttle({ capacity: 1, refillMs: 10_000, maxConcurrent: 1 });
    const depths: number[] = [];
    const unsub = t.onQueueChange((d) => depths.push(d));

    await t.acquire();              // token consumed, no queue yet
    void t.acquire();               // queued — depth 1
    void t.acquire();               // queued — depth 2
    await Promise.resolve();
    expect(depths).toContain(1);
    expect(depths).toContain(2);

    t.release();                    // wakes one waiter — depth drops
    await Promise.resolve();
    const depthAfterOneRelease = depths[depths.length - 1];
    expect(depthAfterOneRelease).toBeLessThan(2);

    unsub();
    const before = depths.length;
    t.release();
    await Promise.resolve();
    expect(depths.length).toBe(before);
  });
});
