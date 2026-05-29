// Phase 19 Plan 02 Task 1 — SelfWriteSuppression unit tests (RED).
//
// Verifies CONTEXT C-04 + RESEARCH Pattern 2: per-path content-hash map with
// 2s TTL. arm() / tryConsume() / clear() / clearForPath() contract.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

describe('SelfWriteSuppression', () => {
  let sup: SelfWriteSuppression;

  beforeEach(() => {
    sup = new SelfWriteSuppression();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('arm/tryConsume basic', () => {
    it('arm then tryConsume with matching hash returns "consumed"', () => {
      sup.arm('a.md', 'h1');
      expect(sup.tryConsume('a.md', 'h1')).toBe('consumed');
    });

    it('second tryConsume after consume returns "miss"', () => {
      sup.arm('a.md', 'h1');
      sup.tryConsume('a.md', 'h1');
      expect(sup.tryConsume('a.md', 'h1')).toBe('miss');
    });

    it('tryConsume on un-armed path returns "miss"', () => {
      expect(sup.tryConsume('never.md', 'h1')).toBe('miss');
    });
  });

  describe('TTL expiry', () => {
    it('arm + tryConsume past 2s TTL returns "stale"', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      sup.arm('a.md', 'h1');
      vi.setSystemTime(new Date(2001));
      expect(sup.tryConsume('a.md', 'h1')).toBe('stale');
    });

    it('tryConsume just before TTL boundary returns "consumed"', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      sup.arm('a.md', 'h1');
      vi.setSystemTime(new Date(1999));
      expect(sup.tryConsume('a.md', 'h1')).toBe('consumed');
    });
  });

  describe('multi-file isolation (NOT a boolean flag — CONTEXT C-04)', () => {
    it('arming two files independently — each consumes separately', () => {
      sup.arm('a.md', 'hA');
      sup.arm('b.md', 'hB');
      expect(sup.tryConsume('a.md', 'hA')).toBe('consumed');
      expect(sup.tryConsume('b.md', 'hB')).toBe('consumed');
    });

    it('consuming a.md does not affect b.md entry', () => {
      sup.arm('a.md', 'hA');
      sup.arm('b.md', 'hB');
      sup.tryConsume('a.md', 'hA');
      expect(sup.tryConsume('b.md', 'hB')).toBe('consumed');
    });
  });

  describe('hash mismatch within TTL — defensive delete', () => {
    it('mismatched observed hash within TTL returns "miss" and deletes entry', () => {
      sup.arm('a.md', 'hA');
      // Race: external write landed first; observed hash is unexpected.
      expect(sup.tryConsume('a.md', 'hX')).toBe('miss');
      // Defensive delete: the original entry was dropped, so a subsequent
      // matching consume on the original hash also misses.
      expect(sup.tryConsume('a.md', 'hA')).toBe('miss');
    });
  });

  describe('clear / clearForPath', () => {
    it('clear() empties the entire map', () => {
      sup.arm('a.md', 'hA');
      sup.arm('b.md', 'hB');
      sup.clear();
      expect(sup.tryConsume('a.md', 'hA')).toBe('miss');
      expect(sup.tryConsume('b.md', 'hB')).toBe('miss');
    });

    it('clearForPath removes only the specified path', () => {
      sup.arm('a.md', 'hA');
      sup.arm('b.md', 'hB');
      sup.clearForPath('a.md');
      expect(sup.tryConsume('a.md', 'hA')).toBe('miss');
      expect(sup.tryConsume('b.md', 'hB')).toBe('consumed');
    });
  });

  describe('re-arming overwrites prior entry', () => {
    it('arm path with new hash replaces previous entry', () => {
      sup.arm('a.md', 'hOLD');
      sup.arm('a.md', 'hNEW');
      expect(sup.tryConsume('a.md', 'hOLD')).toBe('miss'); // old hash defensive-deleted
      // entry was replaced; the consume call above defensive-deleted the new entry on mismatch.
    });

    it('arm path then arm same path with same hash — single entry, single consume', () => {
      sup.arm('a.md', 'h1');
      sup.arm('a.md', 'h1'); // re-arm with same hash (e.g., debounce coalesce)
      expect(sup.tryConsume('a.md', 'h1')).toBe('consumed');
      expect(sup.tryConsume('a.md', 'h1')).toBe('miss');
    });
  });
});
