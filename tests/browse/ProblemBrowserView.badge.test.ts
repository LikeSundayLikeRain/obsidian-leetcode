// tests/browse/ProblemBrowserView.badge.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-03 (badge zero-count bug D-04).
//
// Bug captured: on a fresh install the plugin auto-applies
// `{ field: 'premium', op: 'is', value: 'non-premium' }` for users where
// `isPremium === false`. The badge count reads `filter.rules.length`, so the
// user sees "1" (or "3" in legacy builds that pre-populated Status/Difficulty/
// Topics) even though they have NOT explicitly set any filter.
//
// Wave 1 (05.2-03) fix: stamp auto-applied rules with `__autoDefault: true`;
// the badge count excludes any rule carrying that marker. User-added rules
// have no marker and always count.
//
// We assert the pure helper `computeFilterBadgeCount(filter)` rather than
// driving the ProblemBrowserView class — the class depends on Obsidian's
// ItemView / leaf machinery that is not feasible to stand up in a unit test.
// Plan 05.2-03 extracts the count function as part of the fix so it becomes
// directly testable.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

describe('ProblemBrowserView filter badge count (RED until 05.2-03)', () => {
  // D-04 — fresh install (no user rules, one auto-default rule) shows no
  // badge. Assertion uses count=0 as the proxy for "badge hidden" since the
  // DOM toggle (`is-visible`) is driven by `count === 0`.
  it.skip('D-04: fresh install with only auto-default premium rule → badge count is 0 (TODO(05.2-03): export computeFilterBadgeCount)', async () => {
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      computeFilterBadgeCount?: (f: unknown) => number;
    };
    if (typeof mod.computeFilterBadgeCount !== 'function') {
      throw new Error('computeFilterBadgeCount not exported — 05.2-03 must export it');
    }
    const filter = {
      match: 'all',
      rules: [
        { field: 'premium', op: 'is', values: ['non-premium'], __autoDefault: true },
      ],
    };
    expect(mod.computeFilterBadgeCount(filter)).toBe(0);
  });

  // D-04 — user-added rules always count; auto-default rules never do. A
  // mixed filter (one of each) reads "1", not "2".
  it.skip('D-04: one user rule + one auto-default rule → badge count is 1 (TODO(05.2-03))', async () => {
    const mod = (await import('../../src/browse/ProblemBrowserView')) as unknown as {
      computeFilterBadgeCount?: (f: unknown) => number;
    };
    if (typeof mod.computeFilterBadgeCount !== 'function') {
      throw new Error('computeFilterBadgeCount not exported — 05.2-03 must export it');
    }
    const filter = {
      match: 'all',
      rules: [
        { field: 'premium', op: 'is', values: ['non-premium'], __autoDefault: true },
        { field: 'difficulty', op: 'is', values: ['Easy'] },
      ],
    };
    expect(mod.computeFilterBadgeCount(filter)).toBe(1);
  });
});
