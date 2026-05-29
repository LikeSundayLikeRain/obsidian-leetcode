// Phase 19 Plan 01 — WidgetRegistry unit tests.
// Mirrors tests/main/childEditorRegistry.test.ts, drops LRU eviction tests,
// adds flushAll() coverage and multi-fence-key (`${file.path}::${fenceIndex}`)
// scenarios per CONTEXT D-01.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import { WidgetRegistry } from '../../src/widget/widgetRegistry';

interface MockController {
  flushNow: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  file: { path: string };
}

function makeMockController(filePath = 'LeetCode/0001-two-sum.md'): MockController {
  return {
    flushNow: vi.fn(),
    destroy: vi.fn(),
    file: { path: filePath },
  };
}

describe('WidgetRegistry', () => {
  let registry: WidgetRegistry;

  beforeEach(() => {
    registry = new WidgetRegistry();
  });

  describe('get/set/has/delete', () => {
    it('returns undefined for missing keys', () => {
      expect(registry.get('LeetCode/two-sum.md::0')).toBeUndefined();
    });

    it('stores and retrieves entries by ${path}::${fenceIndex} key', () => {
      const ctl = makeMockController();
      registry.set('LeetCode/two-sum.md::0', ctl as never);
      expect(registry.get('LeetCode/two-sum.md::0')).toBe(ctl);
    });

    it('has() returns true after set()', () => {
      const ctl = makeMockController();
      registry.set('a.md::0', ctl as never);
      expect(registry.has('a.md::0')).toBe(true);
      expect(registry.has('a.md::1')).toBe(false);
    });

    it('delete() removes the entry', () => {
      const ctl = makeMockController();
      registry.set('a.md::0', ctl as never);
      registry.delete('a.md::0');
      expect(registry.has('a.md::0')).toBe(false);
    });

    it('supports multiple fenceIndex entries per file (multi-fence corner)', () => {
      const c0 = makeMockController('a.md');
      const c1 = makeMockController('a.md');
      registry.set('a.md::0', c0 as never);
      registry.set('a.md::1', c1 as never);
      expect(registry.get('a.md::0')).toBe(c0);
      expect(registry.get('a.md::1')).toBe(c1);
    });
  });

  describe('flushAll()', () => {
    it('calls flushNow on every registered controller (Plan 19-02: async)', async () => {
      const c1 = makeMockController('a.md');
      const c2 = makeMockController('b.md');
      const c3 = makeMockController('a.md');
      registry.set('a.md::0', c1 as never);
      registry.set('b.md::0', c2 as never);
      registry.set('a.md::1', c3 as never);
      await registry.flushAll();
      expect(c1.flushNow).toHaveBeenCalledTimes(1);
      expect(c2.flushNow).toHaveBeenCalledTimes(1);
      expect(c3.flushNow).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when registry is empty', async () => {
      await expect(registry.flushAll()).resolves.toBeUndefined();
    });
  });

  describe('destroyAll()', () => {
    it('calls destroy on every registered controller and clears the map', () => {
      const c1 = makeMockController();
      const c2 = makeMockController();
      registry.set('a.md::0', c1 as never);
      registry.set('b.md::0', c2 as never);
      registry.destroyAll();
      expect(c1.destroy).toHaveBeenCalledTimes(1);
      expect(c2.destroy).toHaveBeenCalledTimes(1);
      expect(registry.has('a.md::0')).toBe(false);
      expect(registry.has('b.md::0')).toBe(false);
    });
  });
});
