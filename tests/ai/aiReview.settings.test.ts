// Phase 09 Plan 02 — TDD RED: tests for autoAIReviewOnAC field in PluginData.
// Verifies shape-guard, default, getter, and setter.
// Target: AIREV-01 / D-06 — opt-in auto AI review on Accepted.
// Turns green when Plan 02 ships the field + getter/setter + shape-guard.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => {
      state.data = d;
    }),
  };
}

interface AIReviewCapableStore {
  getAutoAIReviewOnAC(): boolean;
  setAutoAIReviewOnAC(value: boolean): Promise<void>;
}

describe('SettingsStore — autoAIReviewOnAC (Phase 09 AIREV-01)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('Test 1: DEFAULT_DATA.autoAIReviewOnAC is false', async () => {
    // A fresh data.json (no prior AI review field) must default to false
    // so AI calls never fire without explicit user opt-in.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' },
      problemsFolder: 'LeetCode',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AIReviewCapableStore;
    expect(typeof s.getAutoAIReviewOnAC).toBe('function');
    expect(s.getAutoAIReviewOnAC()).toBe(false);
  });

  it('Test 2: shape-guard collapses missing/non-boolean raw value to false', async () => {
    // T-09-04 threat mitigation: corrupt data.json with non-boolean
    // autoAIReviewOnAC (e.g. string "true", number 42, null, undefined)
    // must never enable AI calls. Shape-guard collapses to false.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');

    for (const badValue of ['true', 42, null, undefined, { evil: true }]) {
      const plugin = makeMockPlugin({
        version: 1,
        problemsFolder: 'LeetCode',
        autoAIReviewOnAC: badValue,
      });
      const s = (await SettingsStore.load(plugin as never)) as unknown as AIReviewCapableStore;
      expect(s.getAutoAIReviewOnAC()).toBe(false);
    }
  });

  it('Test 3: shape-guard preserves true when explicitly set', async () => {
    // When the user has explicitly enabled AI review, the boolean `true`
    // must round-trip through load without collapse.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoAIReviewOnAC: true,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AIReviewCapableStore;
    expect(s.getAutoAIReviewOnAC()).toBe(true);
  });

  it('Test 4: getAutoAIReviewOnAC() returns the stored value', async () => {
    // Getter reads the in-memory state without side-effects.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoAIReviewOnAC: false,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AIReviewCapableStore;
    expect(s.getAutoAIReviewOnAC()).toBe(false);
  });

  it('Test 5: setAutoAIReviewOnAC(true) persists and subsequent get returns true', async () => {
    // Setter writes to in-memory data AND persists to disk. A subsequent
    // getter call must reflect the updated value.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      autoAIReviewOnAC: false,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as AIReviewCapableStore;
    expect(s.getAutoAIReviewOnAC()).toBe(false);
    await s.setAutoAIReviewOnAC(true);
    expect(s.getAutoAIReviewOnAC()).toBe(true);
    // Verify persist was called.
    expect(plugin.saveData).toHaveBeenCalled();
  });
});
