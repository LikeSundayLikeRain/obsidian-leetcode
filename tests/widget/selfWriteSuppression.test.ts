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

  // Plan 21-17 — originator tracking for peer-sync fan-out.
  //
  // The split-pane peer-sync fan-out (Plan 21-17) needs to know WHICH pane
  // originated a self-write so the modify-handler can skip that pane (its
  // caret is already correct — its own typing produced the new state) and
  // dispatch incremental peer-sync updates to all OTHER editable controllers
  // for the same file.
  //
  //   - arm() accepts an optional third argument `originatingRegistryKey`.
  //   - peekOriginator(path) returns the registryKey of the most-recent
  //     unexpired entry for the path WITHOUT consuming it (read-only).
  //   - tryConsume's match logic is UNCHANGED — originator is informational.
  describe('arm() + peekOriginator() — originator tracking for peer-sync (Plan 21-17)', () => {
    it('O1 arm(path, hash, originatingRegistryKey) records the registryKey alongside the expected hash; peekOriginator(path) returns it', () => {
      sup.arm('note.md', 'h1', 'note.md::0::leaf-A::lp');
      expect(sup.peekOriginator('note.md')).toBe('note.md::0::leaf-A::lp');
    });

    it('O2 peekOriginator returns null when no entry is armed for the path', () => {
      expect(sup.peekOriginator('note.md')).toBeNull();
    });

    it('O3 peekOriginator returns null when the entry has expired (TTL)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      sup.arm('note.md', 'h1', 'note.md::0::leaf-A::lp');
      // Past the 2s TTL.
      vi.setSystemTime(new Date(2001));
      expect(sup.peekOriginator('note.md')).toBeNull();
    });

    it('O4 tryConsume drops the entry — peekOriginator after consume returns null', () => {
      sup.arm('note.md', 'h1', 'note.md::0::leaf-A::lp');
      // Pre-consume peek returns the originator.
      expect(sup.peekOriginator('note.md')).toBe('note.md::0::leaf-A::lp');
      sup.tryConsume('note.md', 'h1');
      // Post-consume peek returns null — entry was dropped.
      expect(sup.peekOriginator('note.md')).toBeNull();
    });

    it('O5 arm without originatingRegistryKey (legacy 2-arg call shape) still works; peekOriginator returns null for that path', () => {
      // Backward compat: callers not yet threaded continue to work; the
      // originator field is optional. tryConsume continues to match on hash.
      sup.arm('note.md', 'h1');
      expect(sup.peekOriginator('note.md')).toBeNull();
      // tryConsume still works for entries armed without the originator.
      expect(sup.tryConsume('note.md', 'h1')).toBe('consumed');
    });

    it('originator field never affects tryConsume match logic', () => {
      // tryConsume matches solely on hash — originator is informational.
      sup.arm('note.md', 'hX', 'leaf-A');
      // Mismatched hash → still 'miss' (defensive delete on race) regardless
      // of originator presence.
      expect(sup.tryConsume('note.md', 'hY')).toBe('miss');
      // Re-arm with originator; matching hash returns 'consumed'.
      sup.arm('note.md', 'hZ', 'leaf-B');
      expect(sup.tryConsume('note.md', 'hZ')).toBe('consumed');
    });

    it('peekOriginator does NOT consume the entry — repeated peeks return same value, then tryConsume still works', () => {
      sup.arm('note.md', 'h1', 'leaf-A');
      // Multiple peeks are read-only.
      expect(sup.peekOriginator('note.md')).toBe('leaf-A');
      expect(sup.peekOriginator('note.md')).toBe('leaf-A');
      // tryConsume still matches the original hash (peek didn't drop).
      expect(sup.tryConsume('note.md', 'h1')).toBe('consumed');
      // Now peek returns null because tryConsume DID drop.
      expect(sup.peekOriginator('note.md')).toBeNull();
    });
  });
});
