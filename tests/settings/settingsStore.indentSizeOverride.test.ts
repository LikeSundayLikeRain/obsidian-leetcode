// tests/settings/settingsStore.indentSizeOverride.test.ts
// Phase 16 Plan 02 — RED until SettingsStore.indentSizeOverride is wired.
//
// Target: INDENT-04 D-06 — `indentSizeOverride: 'auto' | 2 | 4 | 8`, default
// `'auto'`. Strict-equality shape-guard: only literal numbers 2/4/8 pass; any
// other input (missing field, wrong type, string '4', invalid number 3, null,
// the literal string 'auto') collapses to `'auto'`.
//
// Pattern mirrors `tests/settings/preview-click-behavior.test.ts` — fake
// plugin with loadData/saveData spies + table-driven shape-guard scenarios +
// round-trip assertion through saveData.

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

interface IndentCapableStore {
  getIndentSizeOverride(): 'auto' | 2 | 4 | 8;
  setIndentSizeOverride(v: 'auto' | 2 | 4 | 8): Promise<void>;
}

describe('SettingsStore — indentSizeOverride (Phase 16 INDENT-04 D-06)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
  });

  // ─── Table-driven shape-guard scenarios ──────────────────────────────────
  // D-06: only literal numbers 2/4/8 are accepted; everything else (missing
  // field, wrong type, string '4', invalid number 3, null, the literal string
  // 'auto') collapses to 'auto'.
  const scenarios: Array<{
    label: string;
    raw: Record<string, unknown>;
    expected: 'auto' | 2 | 4 | 8;
  }> = [
    {
      label: "fresh install (no indentSizeOverride field) → 'auto'",
      raw: { version: 1, problemsFolder: 'LeetCode' },
      expected: 'auto',
    },
    {
      label: 'numeric 2 accepted verbatim',
      raw: { version: 1, problemsFolder: 'LeetCode', indentSizeOverride: 2 },
      expected: 2,
    },
    {
      label: 'numeric 4 accepted verbatim',
      raw: { version: 1, problemsFolder: 'LeetCode', indentSizeOverride: 4 },
      expected: 4,
    },
    {
      label: 'numeric 8 accepted verbatim',
      raw: { version: 1, problemsFolder: 'LeetCode', indentSizeOverride: 8 },
      expected: 8,
    },
    {
      label: "numeric 3 (not in locked set) → 'auto'",
      raw: { version: 1, problemsFolder: 'LeetCode', indentSizeOverride: 3 },
      expected: 'auto',
    },
    {
      label: "string '4' (strict-true posture) → 'auto'",
      raw: { version: 1, problemsFolder: 'LeetCode', indentSizeOverride: '4' },
      expected: 'auto',
    },
    {
      label: "null → 'auto'",
      raw: { version: 1, problemsFolder: 'LeetCode', indentSizeOverride: null },
      expected: 'auto',
    },
    {
      label: "literal string 'auto' (catchall) → 'auto'",
      raw: {
        version: 1,
        problemsFolder: 'LeetCode',
        indentSizeOverride: 'auto',
      },
      expected: 'auto',
    },
  ];

  it.each(scenarios)('shape-guard: $label', async ({ raw, expected }) => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin(raw);
    const s = (await SettingsStore.load(
      plugin as never,
    )) as unknown as IndentCapableStore;
    expect(typeof s.getIndentSizeOverride).toBe('function');
    expect(s.getIndentSizeOverride()).toBe(expected);
  });

  // ─── Setter persistence round-trip ───────────────────────────────────────

  it('setIndentSizeOverride(2) persists via saveData and updates getter', async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin(null);

    const s1 = (await SettingsStore.load(
      plugin as never,
    )) as unknown as IndentCapableStore;
    expect(s1.getIndentSizeOverride()).toBe('auto');

    await s1.setIndentSizeOverride(2);
    expect(s1.getIndentSizeOverride()).toBe(2);

    // saveData received the persisted indentSizeOverride === 2
    expect(plugin.saveData).toHaveBeenCalled();
    const lastCall = plugin.saveData.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const persistedData = lastCall![0] as { indentSizeOverride: unknown };
    expect(persistedData.indentSizeOverride).toBe(2);

    // Re-load against the same mock plugin — state was persisted via saveData.
    const s2 = (await SettingsStore.load(
      plugin as never,
    )) as unknown as IndentCapableStore;
    expect(s2.getIndentSizeOverride()).toBe(2);
  });

  it("setIndentSizeOverride round-trips back to 'auto'", async () => {
    const { SettingsStore } = await import('../../src/settings/SettingsStore');
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      indentSizeOverride: 4,
    });
    const s = (await SettingsStore.load(
      plugin as never,
    )) as unknown as IndentCapableStore;
    expect(s.getIndentSizeOverride()).toBe(4);
    await s.setIndentSizeOverride('auto');
    expect(s.getIndentSizeOverride()).toBe('auto');
  });
});
