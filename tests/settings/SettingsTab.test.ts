// tests/settings/SettingsTab.test.ts
//
// Phase 5.2 Plan 05.2-02 — D-12 Settings language dropdown pinned LC list.
//
// Unskipped in 05.2-02 Task 2. `LANGUAGE_OPTIONS` is now exported from
// SettingsTab.ts and matches the 19-entry LC-official submission-language
// list (SQL dialects excluded — v1 scope is algorithm problems).

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

// The exact LC-official key set (CONTEXT D-12 + Plan 05.2-02 pinned list).
// Planner's research phase confirmed these slugs against leetcode.com's
// language picker. If LC adds/removes a language in the future that's a
// follow-up phase, not a maintenance burden on this test.
const EXPECTED_KEYS = [
  'python3',
  'python',
  'java',
  'cpp',
  'c',
  'csharp',
  'javascript',
  'typescript',
  'php',
  'swift',
  'kotlin',
  'dart',
  'golang',
  'ruby',
  'scala',
  'rust',
  'racket',
  'erlang',
  'elixir',
];

describe('SettingsTab LANGUAGE_OPTIONS (D-12 LC pinned list)', () => {
  // D-12 — the dropdown key set equals the LC-official list.
  it('D-12: LANGUAGE_OPTIONS keys match LC pinned list', async () => {
    const mod = (await import('../../src/settings/SettingsTab')) as unknown as {
      LANGUAGE_OPTIONS?: Record<string, string>;
    };
    if (!mod.LANGUAGE_OPTIONS) {
      throw new Error('LANGUAGE_OPTIONS not exported — 05.2-02 must export it');
    }
    expect(Object.keys(mod.LANGUAGE_OPTIONS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  // D-12 — locked label text for the three ambiguous cases per CONTEXT.md:
  // `python3` → 'Python3', `python` → 'Python', `cpp` → 'C++'.
  it('D-12: locked labels for python3 / python / cpp', async () => {
    const mod = (await import('../../src/settings/SettingsTab')) as unknown as {
      LANGUAGE_OPTIONS?: Record<string, string>;
    };
    if (!mod.LANGUAGE_OPTIONS) {
      throw new Error('LANGUAGE_OPTIONS not exported — 05.2-02 must export it');
    }
    expect(mod.LANGUAGE_OPTIONS.python3).toBe('Python3');
    expect(mod.LANGUAGE_OPTIONS.python).toBe('Python');
    expect(mod.LANGUAGE_OPTIONS.cpp).toBe('C++');
  });
});
