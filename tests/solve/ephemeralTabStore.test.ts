// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-07 D-02 / D-09 — ephemeral tab lifecycle. In-memory state
// keyed by `lc-slug`; state wipes when no leaf still shows the note (via
// workspace `layout-change` reconciliation).
// Turns green when Plan 05 ships `src/solve/ephemeralTabStore.ts`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeWorkspace, createFakePlugin, type FakeLeaf } from './mocks/fakeWorkspace';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

interface EphemeralTabStoreCtor {
  new (plugin: unknown): {
    getOrSeed(slug: string, exampleTestcases: string, linesPerCase?: number): string[];
    setTabs(slug: string, tabs: string[]): void;
    resetToSamples(slug: string, exampleTestcases: string, linesPerCase?: number): string[];
    getTabs(slug: string): string[] | null;
    reconcile(): void;
  };
}

describe('Phase 5 EphemeralTabStore (D-02 / D-09)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('getOrSeed seeds tabs from exampleTestcases split on blank lines', async () => {
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    expect(typeof mod.EphemeralTabStore).toBe('function');

    const plugin = createFakePlugin();
    const store = new mod.EphemeralTabStore!(plugin);
    // LC's exampleTestcases payload uses newline-separated cases; the store
    // must split on blank-line boundaries into distinct tab strings.
    const tabs = store.getOrSeed('two-sum', '[2,7,11,15]\n9\n\n[3,2,4]\n6');
    expect(tabs).toEqual(['[2,7,11,15]\n9', '[3,2,4]\n6']);
  });

  it('getOrSeed chunks by linesPerCase when blank-line separators are absent (UAT 2026-05-13)', async () => {
    // LIVE-observed two-sum exampleTestcases uses single-newline-only formatting
    // with NO blank line between cases. Without linesPerCase, the splitter
    // would return one big chunk → one tab. With linesPerCase=2, we recover
    // three per-case tabs.
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    const plugin = createFakePlugin();
    const store = new mod.EphemeralTabStore!(plugin);
    const tabs = store.getOrSeed(
      'two-sum',
      '[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6',
      2,
    );
    expect(tabs).toEqual(['[2,7,11,15]\n9', '[3,2,4]\n6', '[3,3]\n6']);
  });

  it('getOrSeed prefers blank-line split over linesPerCase chunking when both available', async () => {
    // Defensive: if LC ever sends both blank-line and arity-padded format,
    // prefer the explicit blank-line boundary (legacy / unambiguous).
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    const plugin = createFakePlugin();
    const store = new mod.EphemeralTabStore!(plugin);
    const tabs = store.getOrSeed(
      'two-sum',
      '[2,7,11,15]\n9\n\n[3,2,4]\n6',
      2,
    );
    expect(tabs).toEqual(['[2,7,11,15]\n9', '[3,2,4]\n6']);
  });

  it('second getOrSeed for the same slug returns existing state (not a re-seed)', async () => {
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    expect(typeof mod.EphemeralTabStore).toBe('function');

    const plugin = createFakePlugin();
    const store = new mod.EphemeralTabStore!(plugin);
    const first = store.getOrSeed('two-sum', '[1]\n2');
    store.setTabs('two-sum', ['user-edited case', 'added case']);
    const second = store.getOrSeed('two-sum', '[1]\n2');
    expect(second).toEqual(['user-edited case', 'added case']);
    expect(second).not.toEqual(first);
  });

  it('resetToSamples wipes and re-seeds from exampleTestcases', async () => {
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    expect(typeof mod.EphemeralTabStore).toBe('function');

    const plugin = createFakePlugin();
    const store = new mod.EphemeralTabStore!(plugin);
    store.getOrSeed('two-sum', '[1]\n2');
    store.setTabs('two-sum', ['user-edited case']);
    const reset = store.resetToSamples('two-sum', '[1]\n2\n\n[3]\n4');
    expect(reset).toEqual(['[1]\n2', '[3]\n4']);
    expect(store.getTabs('two-sum')).toEqual(['[1]\n2', '[3]\n4']);
  });

  it('setTabs round-trips through getTabs', async () => {
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    expect(typeof mod.EphemeralTabStore).toBe('function');

    const plugin = createFakePlugin();
    const store = new mod.EphemeralTabStore!(plugin);
    store.setTabs('two-sum', ['a', 'b', 'c']);
    expect(store.getTabs('two-sum')).toEqual(['a', 'b', 'c']);
  });

  it('layout-change with 0 leaves showing a slug wipes its state; reopening via getOrSeed re-seeds', async () => {
    const mod = (await import('../../src/solve/ephemeralTabStore')) as unknown as {
      EphemeralTabStore?: EphemeralTabStoreCtor;
    };
    expect(typeof mod.EphemeralTabStore).toBe('function');

    const workspace = createFakeWorkspace();
    const plugin = createFakePlugin({ workspace });
    const store = new mod.EphemeralTabStore!(plugin);

    // Seed state for `two-sum` while at least one leaf shows the note.
    const notePath = 'LeetCode/1-two-sum.md';
    const leaf: FakeLeaf = { view: { file: { path: notePath } } };
    workspace.setLeaves([leaf]);
    store.getOrSeed('two-sum', '[1]\n2');
    store.setTabs('two-sum', ['user case']);

    // Close every leaf showing the note; fire layout-change and reconcile.
    workspace.setLeaves([]);
    workspace.fire('layout-change');

    // State should be wiped — next getOrSeed re-seeds from exampleTestcases.
    const reseeded = store.getOrSeed('two-sum', '[9]\n9\n\n[8]\n8');
    expect(reseeded).toEqual(['[9]\n9', '[8]\n8']);
  });
});
