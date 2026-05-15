// tests/settings/preview-click-behavior.test.ts
// Phase 06 Plan 02 — RED until SettingsStore.previewClickBehavior is wired.
// Target: PREVIEW-02 D-A — single default ('preview') for fresh installs and
// v1.1 upgraders, with shape-guard that collapses any malformed/missing value
// to 'preview'.
//
// Pattern: mirrors `tests/settings/SettingsStore.techniques-override.test.ts`
// verbatim — fake plugin with loadData/saveData spies + round-trip assertions
// against `getPreviewClickBehavior` / `setPreviewClickBehavior`.

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

interface PreviewCapableStore {
  getPreviewClickBehavior(): 'preview' | 'open';
  setPreviewClickBehavior(v: 'preview' | 'open'): Promise<void>;
}

describe('SettingsStore — previewClickBehavior (Phase 06 PREVIEW-02 D-A)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("defaults to 'preview' on fresh install (no previewClickBehavior key in data.json)", async () => {
    // Pre-Phase-06 / fresh-install data.json has no `previewClickBehavior` key.
    // CONTEXT.md decision A: fresh installs and v1.1 upgraders alike land on
    // `'preview'` — no upgrader-detection branch.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' },
      problemsFolder: 'LeetCode',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(typeof s.getPreviewClickBehavior).toBe('function');
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("defaults to 'preview' on completely empty data.json (first plugin run)", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin(null);
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("accepts 'open' literal verbatim", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: 'open',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('open');
  });

  it("accepts 'preview' literal verbatim", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: 'preview',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("collapses malformed numeric value to 'preview' (shape-guard, RESEARCH §Pitfall 7)", async () => {
    // RESEARCH §Pitfall 7 locked schema: anything that isn't literally the string
    // 'open' falls through to 'preview'. A number, object, null, or unknown
    // string typo all return 'preview'.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: 42 as unknown,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("collapses malformed object value to 'preview'", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: { evil: 'obj' } as unknown,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("collapses unknown-string typo (e.g. 'OPEN', 'previewMode') to 'preview'", async () => {
    // Defensive: case-mismatch / typo should NOT silently flip the user to a
    // surprise behavior. Anything that isn't literally 'open' is 'preview'.
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: 'OPEN',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("collapses null value to 'preview'", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: null,
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });

  it("setPreviewClickBehavior round-trips through saveData (set 'open' → reload → still 'open')", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin(null);

    // First load — fresh defaults.
    const s1 = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s1.getPreviewClickBehavior()).toBe('preview');

    // Flip to 'open' and persist.
    await s1.setPreviewClickBehavior('open');
    expect(s1.getPreviewClickBehavior()).toBe('open');
    expect(plugin.saveData).toHaveBeenCalled();

    // Re-load against the SAME mock plugin (state was persisted via saveData).
    const s2 = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s2.getPreviewClickBehavior()).toBe('open');
  });

  it("setPreviewClickBehavior round-trips back to 'preview'", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      previewClickBehavior: 'open',
    });
    const s = (await SettingsStore.load(plugin as never)) as unknown as PreviewCapableStore;
    expect(s.getPreviewClickBehavior()).toBe('open');
    await s.setPreviewClickBehavior('preview');
    expect(s.getPreviewClickBehavior()).toBe('preview');
  });
});
