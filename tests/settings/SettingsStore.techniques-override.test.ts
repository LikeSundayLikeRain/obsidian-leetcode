// Phase 5 Wave 0 — failing stub (Nyquist).
// Target: POLISH-01 D-15 — techniquesFolderOverride round-trip + override-aware
// getTechniquesFolder().
// Turns green when Plan 02 ships the override field + getter/setter +
// updated getTechniquesFolder() in src/settings/SettingsStore.ts.

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

interface OverrideCapableStore {
  getTechniquesFolderOverride(): string;
  setTechniquesFolderOverride(v: string): Promise<void>;
  getTechniquesFolder(): string;
}

describe('SettingsStore — techniquesFolderOverride (Phase 5 D-15)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to empty string when techniquesFolderOverride absent from data.json', async () => {
    // A pre-Phase-5 data.json has no `techniquesFolderOverride` key. The new
    // getter must fall back to `''` (D-15: empty = derived default).
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' },
      problemsFolder: 'LeetCode',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as OverrideCapableStore;
    expect(typeof s.getTechniquesFolderOverride).toBe('function');
    expect(s.getTechniquesFolderOverride()).toBe('');
  });

  it('coerces non-string raw techniquesFolderOverride value to empty string', async () => {
    // T-05-0-01 threat mitigation: a malicious data.json with a non-string
    // override (e.g. object, number) must not propagate downstream; shape-guard
    // reverts to empty string (= derived default).
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: { evil: 'obj' } as unknown,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as OverrideCapableStore;
    expect(typeof s.getTechniquesFolderOverride).toBe('function');
    expect(s.getTechniquesFolderOverride()).toBe('');
  });

  it('getTechniquesFolder returns override verbatim when non-empty, derived default when empty', async () => {
    // D-15 verbatim: `return override && override.length > 0 ? override : \`${problemsFolder}/Techniques\``
    const { SettingsStore } = await import('../../src/settings/SettingsStore');

    // Empty override → derived default.
    const p1 = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: '',
    });
    const s1 = (await SettingsStore.load(p1 as never)) as unknown as OverrideCapableStore;
    expect(s1.getTechniquesFolder()).toBe('LeetCode/Techniques');

    // Non-empty override → verbatim.
    const p2 = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: 'Library/LC Techniques',
    });
    const s2 = (await SettingsStore.load(p2 as never)) as unknown as OverrideCapableStore;
    expect(s2.getTechniquesFolder()).toBe('Library/LC Techniques');
  });

  it('setTechniquesFolderOverride round-trips through saveData', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin(null);
    const s = (await SettingsStore.load(plugin as never)) as unknown as OverrideCapableStore;
    expect(typeof s.setTechniquesFolderOverride).toBe('function');
    await s.setTechniquesFolderOverride('Custom/Path');
    expect(s.getTechniquesFolderOverride()).toBe('Custom/Path');
    expect(plugin.saveData).toHaveBeenCalled();
  });
});
