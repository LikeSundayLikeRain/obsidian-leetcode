// tests/settings/auto-migrate-on-open.test.ts
//
// Phase 21 Plan 21-02 Task 1 — autoMigrateOnOpen settings round-trip + shape-guard.
// Mirrors `tests/settings/preview-click-behavior.test.ts` setup verbatim — fake
// plugin with loadData/saveData spies + assertions against
// `getAutoMigrateOnOpen` / `setAutoMigrateOnOpen`.
//
// Covers MIGRATE-06 acceptance:
//   1. Default: fresh SettingsStore reports getAutoMigrateOnOpen() === true.
//   2. Persistence: setAutoMigrateOnOpen(false) round-trips through data.json.
//   3. Shape-guard: corrupt data ('yes', null, number, undefined) collapses
//      to true (default ON).
//
// Pattern S-06 mirror — test file is named for the setting like
// `preview-click-behavior.test.ts`; this is a SettingsTab.test.ts adjacency
// (the existing test covers LANGUAGE_OPTIONS only and is mostly skipped).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    plugin: {
      loadData: vi.fn(async () => state.data),
      saveData: vi.fn(async (d: unknown) => {
        state.data = d;
      }),
    },
    state,
  };
}

interface AutoMigrateCapableStore {
  getAutoMigrateOnOpen(): boolean;
  setAutoMigrateOnOpen(v: boolean): Promise<void>;
}

describe('SettingsStore — autoMigrateOnOpen (Phase 21 MIGRATE-06)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('Test 1: defaults to true on fresh install (no autoMigrateOnOpen key in data.json)', async () => {
    // Fresh install: data.json has no `autoMigrateOnOpen` key. Phase 21
    // MIGRATE-06 default ON; user must explicitly opt out.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' },
      problemsFolder: 'LeetCode',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(typeof s.getAutoMigrateOnOpen).toBe('function');
    expect(s.getAutoMigrateOnOpen()).toBe(true);
  });

  it('Test 1b: defaults to true on completely empty data.json (first plugin run)', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin(null);
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(s.getAutoMigrateOnOpen()).toBe(true);
  });

  it('Test 2: setAutoMigrateOnOpen(false) round-trips — persistence + reload preserve the flip', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin, state } = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    // Initial default → true.
    expect(s.getAutoMigrateOnOpen()).toBe(true);
    // Flip to false.
    await s.setAutoMigrateOnOpen(false);
    expect(s.getAutoMigrateOnOpen()).toBe(false);
    // Verify the persisted blob carries the flipped value.
    const persisted = state.data as Record<string, unknown>;
    expect(persisted.autoMigrateOnOpen).toBe(false);
    // Reload — re-instantiate against the persisted blob to simulate Obsidian
    // restart. The loaded SettingsStore must still report false.
    vi.resetModules();
    const { SettingsStore: SettingsStore2 } = await import('../../src/settings/SettingsStore');
    const reloaded = (await SettingsStore2.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(reloaded.getAutoMigrateOnOpen()).toBe(false);
  });

  it('Test 3a: shape-guard collapses string "yes" to true (corrupt data.json)', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoMigrateOnOpen: 'yes' as unknown,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(s.getAutoMigrateOnOpen()).toBe(true);
  });

  it('Test 3b: shape-guard collapses null to true', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoMigrateOnOpen: null as unknown,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(s.getAutoMigrateOnOpen()).toBe(true);
  });

  it('Test 3c: shape-guard collapses number to true', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoMigrateOnOpen: 1 as unknown,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(s.getAutoMigrateOnOpen()).toBe(true);
  });

  it('Test 3d: accepts true literal verbatim', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoMigrateOnOpen: true,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(s.getAutoMigrateOnOpen()).toBe(true);
  });

  it('Test 3e: accepts false literal verbatim', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const { plugin } = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoMigrateOnOpen: false,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AutoMigrateCapableStore;
    expect(s.getAutoMigrateOnOpen()).toBe(false);
  });
});
