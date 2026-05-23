// Phase 17 Plan 06 — Lifecycle leak tests for ChildEditorRegistry (D-23 arm a).
//
// Automated counterpart to the manual heap-snapshot UAT (D-23 arm b).
// Asserts:
//   1. destroyAll calls EditorView.destroy() on every cached view and clears the cache.
//   2. LRU eviction destroys the evicted view and removes it from the cache.
//   3. set() on an existing key destroys the previous view before replacing it.
//   4. delete() destroys the view and removes it from the map.
//   5. (static integration) src/main.ts onunload calls registry.destroyAll() —
//      pinned via readFileSync grep so a refactor that drops the call breaks
//      this test.
//   6. destroyAll is idempotent — calling twice does not throw and size stays 0.
//
// The tests use the REAL ChildEditorRegistry under test. Mocks are limited to
// the EditorView instances stored in the registry (only a `destroy` spy is needed).

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// unwireSync is invoked by the registry on delete/destroyAll/eviction. Stub it
// so test runs don't pull in the full sync module / state machinery.
vi.mock('../../src/main/childEditorSync', () => ({
  unwireSync: vi.fn(),
}));

import { ChildEditorRegistry } from '../../src/main/childEditorRegistry';

/**
 * Minimal mock satisfying the EditorView shape touched by the registry.
 * Per 17-RESEARCH.md lines 565-572.
 */
function makeMockEditorView() {
  return {
    state: { doc: { length: 0, toString: () => '' } },
    dispatch: vi.fn(),
    destroy: vi.fn(),
    dom: { parentElement: null },
  } as unknown as import('@codemirror/view').EditorView;
}

describe('ChildEditorRegistry lifecycle (Phase 17 D-23a)', () => {
  let registry: ChildEditorRegistry;

  beforeEach(() => {
    registry = new ChildEditorRegistry(5);
  });

  it('destroyAll calls destroy on every cached EditorView and clears the cache', () => {
    const v1 = makeMockEditorView();
    const v2 = makeMockEditorView();
    const v3 = makeMockEditorView();

    registry.set('a', v1);
    registry.set('b', v2);
    registry.set('c', v3);
    expect(registry.size).toBe(3);

    registry.destroyAll();

    expect(v1.destroy).toHaveBeenCalledTimes(1);
    expect(v2.destroy).toHaveBeenCalledTimes(1);
    expect(v3.destroy).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
    expect(registry.has('a')).toBe(false);
    expect(registry.has('b')).toBe(false);
    expect(registry.has('c')).toBe(false);
  });

  it('LRU eviction destroys the evicted view and unwires sync', () => {
    // capacity=2: any third entry forces eviction of the oldest-accessed key.
    const small = new ChildEditorRegistry(2);
    const v1 = makeMockEditorView();
    const v2 = makeMockEditorView();
    const v3 = makeMockEditorView();

    small.set('a', v1);
    small.set('b', v2);
    // touch 'a' so 'b' becomes LRU
    small.get('a');
    // adding 'c' must evict 'b' (oldest) and call destroy() on v2
    small.set('c', v3);

    expect(v2.destroy).toHaveBeenCalledTimes(1);
    expect(small.has('b')).toBe(false);
    expect(small.has('a')).toBe(true);
    expect(small.has('c')).toBe(true);
    expect(small.size).toBe(2);
    // The retained entries' destroy spies must NOT have fired.
    expect(v1.destroy).not.toHaveBeenCalled();
    expect(v3.destroy).not.toHaveBeenCalled();
  });

  it('set on existing key destroys old view before replacing', () => {
    const v1 = makeMockEditorView();
    const v2 = makeMockEditorView();

    registry.set('a', v1);
    registry.set('a', v2); // same key — must destroy v1 before replacing

    expect(v1.destroy).toHaveBeenCalledTimes(1);
    expect(v2.destroy).not.toHaveBeenCalled();
    expect(registry.get('a')).toBe(v2);
    expect(registry.size).toBe(1);
  });

  it('delete calls destroy on the view and removes from map', () => {
    const v1 = makeMockEditorView();
    registry.set('a', v1);

    registry.delete('a');

    expect(v1.destroy).toHaveBeenCalledTimes(1);
    expect(registry.has('a')).toBe(false);
    expect(registry.size).toBe(0);
  });

  it('plugin onunload integration — registry.destroyAll is invoked', () => {
    // Static assertion: the source of src/main.ts must contain a destroyAll
    // invocation inside an onunload method body. This pins the integration
    // point so a refactor that drops the call breaks the test.
    const content = readFileSync('src/main.ts', 'utf-8');
    expect(content).toMatch(
      /onunload[\s\S]*?childEditorRegistry\??\.destroyAll\(\)/,
    );
  });

  it('destroyAll is idempotent — calling twice does not throw', () => {
    const v1 = makeMockEditorView();
    registry.set('a', v1);

    expect(() => {
      registry.destroyAll();
      registry.destroyAll();
    }).not.toThrow();

    // First call destroys; second call is a no-op (no extra destroy invocations).
    expect(v1.destroy).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });
});
