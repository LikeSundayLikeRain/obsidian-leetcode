// Phase 13 — ChildEditorRegistry unit tests.
// Pins the LRU cache behavioral contract: get/set/delete/destroyAll/has/size,
// and LRU eviction that calls EditorView.destroy() on the least-recently-accessed entry.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChildEditorRegistry } from '../../src/main/childEditorRegistry';

/** Minimal mock that satisfies the EditorView shape needed by the registry. */
function makeMockView() {
  return { destroy: vi.fn() } as unknown as import('@codemirror/view').EditorView;
}

describe('ChildEditorRegistry', () => {
  let registry: ChildEditorRegistry;

  beforeEach(() => {
    registry = new ChildEditorRegistry(3); // cap=3 for easier eviction tests
  });

  describe('get()', () => {
    it('returns undefined for missing keys', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('returns the EditorView for existing keys', () => {
      const view = makeMockView();
      registry.set('file-a', view);
      expect(registry.get('file-a')).toBe(view);
    });

    it('updates lastAccess on retrieval (LRU touch)', () => {
      const viewA = makeMockView();
      const viewB = makeMockView();
      const viewC = makeMockView();
      const viewD = makeMockView();

      registry.set('a', viewA);
      registry.set('b', viewB);
      registry.set('c', viewC);

      // Access 'a' to make it most-recently-used
      registry.get('a');

      // Adding 'd' should evict 'b' (oldest access), not 'a'
      registry.set('d', viewD);

      expect(registry.has('a')).toBe(true);
      expect(registry.has('b')).toBe(false);
      expect(registry.has('c')).toBe(true);
      expect(registry.has('d')).toBe(true);
      expect(viewB.destroy).toHaveBeenCalledOnce();
    });
  });

  describe('set()', () => {
    it('stores the entry and is retrievable via get', () => {
      const view = makeMockView();
      registry.set('key1', view);
      expect(registry.get('key1')).toBe(view);
    });

    it('evicts the entry with oldest lastAccess when at cap', () => {
      const viewA = makeMockView();
      const viewB = makeMockView();
      const viewC = makeMockView();
      const viewD = makeMockView();

      registry.set('a', viewA);
      registry.set('b', viewB);
      registry.set('c', viewC);

      // All three are in cache now (cap=3)
      expect(registry.size).toBe(3);

      // Adding a 4th should evict 'a' (first inserted, oldest access)
      registry.set('d', viewD);

      expect(registry.size).toBe(3);
      expect(registry.has('a')).toBe(false);
      expect(viewA.destroy).toHaveBeenCalledOnce();
    });

    it('calls EditorView.destroy() on the evicted view', () => {
      const viewA = makeMockView();
      const viewB = makeMockView();
      const viewC = makeMockView();
      const viewD = makeMockView();

      registry.set('a', viewA);
      registry.set('b', viewB);
      registry.set('c', viewC);
      registry.set('d', viewD); // evicts 'a'

      expect(viewA.destroy).toHaveBeenCalledOnce();
      expect(viewB.destroy).not.toHaveBeenCalled();
      expect(viewC.destroy).not.toHaveBeenCalled();
      expect(viewD.destroy).not.toHaveBeenCalled();
    });

    it('replaces existing entry without eviction when key already exists', () => {
      const viewA = makeMockView();
      const viewA2 = makeMockView();
      const viewB = makeMockView();
      const viewC = makeMockView();

      registry.set('a', viewA);
      registry.set('b', viewB);
      registry.set('c', viewC);

      // Replace 'a' — should destroy old view but NOT evict others
      registry.set('a', viewA2);

      expect(registry.size).toBe(3);
      expect(registry.get('a')).toBe(viewA2);
      expect(viewA.destroy).toHaveBeenCalledOnce();
    });
  });

  describe('delete()', () => {
    it('calls EditorView.destroy() and removes from cache', () => {
      const view = makeMockView();
      registry.set('key1', view);
      registry.delete('key1');

      expect(view.destroy).toHaveBeenCalledOnce();
      expect(registry.has('key1')).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('is a no-op for missing keys', () => {
      // Should not throw
      expect(() => registry.delete('nonexistent')).not.toThrow();
    });
  });

  describe('destroyAll()', () => {
    it('calls destroy() on every entry and empties the cache', () => {
      const viewA = makeMockView();
      const viewB = makeMockView();
      const viewC = makeMockView();

      registry.set('a', viewA);
      registry.set('b', viewB);
      registry.set('c', viewC);

      registry.destroyAll();

      expect(viewA.destroy).toHaveBeenCalledOnce();
      expect(viewB.destroy).toHaveBeenCalledOnce();
      expect(viewC.destroy).toHaveBeenCalledOnce();
      expect(registry.size).toBe(0);
    });
  });

  describe('has()', () => {
    it('returns true for existing keys', () => {
      const view = makeMockView();
      registry.set('exists', view);
      expect(registry.has('exists')).toBe(true);
    });

    it('returns false for missing keys', () => {
      expect(registry.has('missing')).toBe(false);
    });
  });

  describe('size', () => {
    it('returns current entry count', () => {
      expect(registry.size).toBe(0);

      registry.set('a', makeMockView());
      expect(registry.size).toBe(1);

      registry.set('b', makeMockView());
      expect(registry.size).toBe(2);

      registry.delete('a');
      expect(registry.size).toBe(1);
    });
  });

  describe('default cap', () => {
    it('uses cap=5 when no argument provided', () => {
      const defaultRegistry = new ChildEditorRegistry();
      for (let i = 0; i < 5; i++) {
        defaultRegistry.set(`key-${i}`, makeMockView());
      }
      expect(defaultRegistry.size).toBe(5);

      // Adding a 6th should trigger eviction
      const extraView = makeMockView();
      defaultRegistry.set('extra', extraView);
      expect(defaultRegistry.size).toBe(5);
    });
  });
});
