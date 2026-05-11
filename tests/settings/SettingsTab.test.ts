// tests/settings/SettingsTab.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-02 (Settings language dropdown D-12).
//
// Current state (main): SettingsTab.ts has a file-local `LANGUAGE_OPTIONS`
// Record<string,string> with 5 entries — python3/java/cpp/javascript/
// typescript. Wave 1 plan 05.2-02 expands this to match LeetCode's official
// submission-language dropdown (D-12) AND exports the constant so tests can
// pin the exact key-set.
//
// This shell is `it.skip` because `LANGUAGE_OPTIONS` is not exported today;
// the test imports the future shape. Plan 05.2-02 exports the constant and
// adds the extra keys, at which point this test unskips.

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

describe('SettingsTab LANGUAGE_OPTIONS (RED until 05.2-02)', () => {
  // D-12 — the dropdown key set equals the LC-official list.
  it.skip('D-12: LANGUAGE_OPTIONS keys match LC pinned list (TODO(05.2-02): export LANGUAGE_OPTIONS + expand to LC list)', async () => {
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
  it.skip('D-12: locked labels for python3 / python / cpp (TODO(05.2-02))', async () => {
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
