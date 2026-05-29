// Phase 19 Plan 02 Task 1 — Flush-on-transition tests (RED).
//
// Verifies SYNC-02 / CONTEXT C-07: flushAll/flushAllSync/flushFile contracts
// on WidgetRegistry.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WidgetRegistry } from '../../src/widget/widgetRegistry';

interface MockController {
  file: { path: string };
  flushNow: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  writer?: { cancel: ReturnType<typeof vi.fn> };
}

function makeMockController(path: string): MockController {
  return {
    file: { path },
    flushNow: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    writer: { cancel: vi.fn() },
  };
}

describe('WidgetRegistry flush transitions (SYNC-02)', () => {
  let registry: WidgetRegistry;
  let ctlA: MockController;
  let ctlB: MockController;

  beforeEach(() => {
    registry = new WidgetRegistry();
    ctlA = makeMockController('A.md');
    ctlB = makeMockController('B.md');
    registry.set('A.md::0', ctlA as never);
    registry.set('B.md::0', ctlB as never);
  });

  describe('flushAll', () => {
    it('invokes flushNow on every registered controller', async () => {
      await registry.flushAll();
      expect(ctlA.flushNow).toHaveBeenCalledTimes(1);
      expect(ctlB.flushNow).toHaveBeenCalledTimes(1);
    });

    it('returns a Promise that resolves once every flushNow resolves', async () => {
      let resolveA: (v?: unknown) => void = () => undefined;
      ctlA.flushNow = vi.fn(() => new Promise<void>((r) => { resolveA = () => r(); }));
      const p = registry.flushAll();
      let done = false;
      void p.then(() => { done = true; });
      await Promise.resolve();
      expect(done).toBe(false);
      resolveA();
      await p;
      expect(done).toBe(true);
    });
  });

  describe('flushAllSync', () => {
    it('cancels each writer and fires flushNow without awaiting (best-effort)', () => {
      registry.flushAllSync();
      expect(ctlA.writer!.cancel).toHaveBeenCalledTimes(1);
      expect(ctlB.writer!.cancel).toHaveBeenCalledTimes(1);
      expect(ctlA.flushNow).toHaveBeenCalledTimes(1);
      expect(ctlB.flushNow).toHaveBeenCalledTimes(1);
    });

    it('does NOT throw when a controller has no writer (defensive)', () => {
      ctlA.writer = undefined;
      expect(() => registry.flushAllSync()).not.toThrow();
    });
  });

  describe('flushFile', () => {
    it('invokes flushNow on every controller whose file.path matches', async () => {
      await registry.flushFile('A.md');
      expect(ctlA.flushNow).toHaveBeenCalledTimes(1);
      expect(ctlB.flushNow).not.toHaveBeenCalled();
    });

    it('no-op when no controller matches the path', async () => {
      await registry.flushFile('does-not-exist.md');
      expect(ctlA.flushNow).not.toHaveBeenCalled();
      expect(ctlB.flushNow).not.toHaveBeenCalled();
    });
  });

  describe('applyDelay', () => {
    it('iterates controllers and calls writer.setDelay if available', () => {
      const setDelayA = vi.fn();
      const setDelayB = vi.fn();
      ctlA.writer = { cancel: vi.fn(), setDelay: setDelayA } as never;
      ctlB.writer = { cancel: vi.fn(), setDelay: setDelayB } as never;
      registry.applyDelay(1000);
      expect(setDelayA).toHaveBeenCalledWith(1000);
      expect(setDelayB).toHaveBeenCalledWith(1000);
    });

    it('no-op when controllers have no writer (defensive)', () => {
      ctlA.writer = undefined;
      expect(() => registry.applyDelay(1000)).not.toThrow();
    });
  });
});
