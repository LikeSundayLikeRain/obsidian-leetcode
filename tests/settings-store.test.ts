import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => { state.data = d; }),
  };
}

describe('SettingsStore (AUTH-03, AUTH-05, D-07, D-10)', () => {
  it('defaults: problemsFolder="LeetCode", defaultLanguage="python3", auth=null', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toBeNull();
    expect(s.getProblemsFolder()).toBe('LeetCode');
    expect(s.getDefaultLanguage()).toBe('python3');
    expect(s.getProblemIndex()).toBeNull();
  });

  it('round-trip: setAuthCookies then getAuthCookies (AUTH-03)', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    await s.setAuthCookies({ LEETCODE_SESSION: 'X', csrftoken: 'Y' });
    expect(s.getAuthCookies()).toEqual({ LEETCODE_SESSION: 'X', csrftoken: 'Y' });
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('logout: setAuthCookies(null) clears (AUTH-05)', async () => {
    const plugin = makeMockPlugin({ auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' }, version: 1 });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toEqual({ LEETCODE_SESSION: 'X', csrftoken: 'Y' });
    await s.setAuthCookies(null);
    expect(s.getAuthCookies()).toBeNull();
  });

  it('preserves existing values when loading v1 data', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'A', csrftoken: 'B' },
      username: 'user',
      problemsFolder: 'Custom',
      defaultLanguage: 'java',
      problemIndex: null,
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getUsername()).toBe('user');
    expect(s.getProblemsFolder()).toBe('Custom');
    expect(s.getDefaultLanguage()).toBe('java');
  });

  it('problem-index round-trip (D-07)', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    const idx = {
      fetchedAt: 123,
      problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy' as const, paid: false }],
    };
    await s.setProblemIndex(idx);
    expect(s.getProblemIndex()).toEqual(idx);
  });
});
