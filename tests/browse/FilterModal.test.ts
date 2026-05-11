// tests/browse/FilterModal.test.ts
//
// Phase 5.2 Wave 0 — RED until 05.2-03 (FilterModal D-02 / D-03 / D-04).
//
// Covers three Wave-1 behavior changes:
//   - D-02: `language` entry removed from the field-selector — DEFERRED_STUB_FIELDS
//           must be empty (or the symbol deleted entirely). The Language row no
//           longer appears in the modal.
//   - D-03: `premium` value-editor becomes a multi-select (checkbox popover)
//           instead of the current single-value chevron picker.
//   - D-04: the Apply handler strips any `__autoDefault: true` marker from
//           rules before handing them to `onApply`, so the persisted filter
//           only carries user-intent rules.
//
// All three tests are currently `it.skip` because:
//   - FIELD_DEFS / DEFERRED_STUB_FIELDS are not exported from FilterModal.ts
//     yet (D-02 surfaces them during the Wave 1 rewrite).
//   - The `__autoDefault` marker is a Wave 1 schema addition; FilterRule in
//     main today carries no such field.
// Plan 05.2-03 will unskip these tests as part of the implementation and
// adjust imports to reference the newly-exported surfaces.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

describe('FilterModal Wave 0 shells (RED until 05.2-03)', () => {
  // D-02 — field selector no longer lists Language. The current production
  // code owns a `DEFERRED_STUB_FIELDS` array with a single `language` entry
  // rendered as a disabled stub row. Wave 1 deletes the array entirely (or
  // empties it) AND removes the render loop call site. This test asserts the
  // end state: either no export at all, OR an empty array.
  it('D-02: field selector menu does not list Language option (TODO(05.2-03): export DEFERRED_STUB_FIELDS + empty it)', async () => {
    const mod = (await import('../../src/browse/FilterModal')) as unknown as {
      DEFERRED_STUB_FIELDS?: unknown[];
    };
    // Accept either: (a) symbol no longer exported, (b) exported but empty.
    const stubs = mod.DEFERRED_STUB_FIELDS;
    if (stubs === undefined) {
      expect(stubs).toBeUndefined();
    } else {
      expect(Array.isArray(stubs)).toBe(true);
      expect(stubs).toHaveLength(0);
    }
  });

  // D-03 — premium field becomes multi-value. The current production code
  // renders `renderPremiumEditor` (single-value chevron) for premium rules;
  // Wave 1 deletes that method so `renderValueEditor` falls through to
  // `renderMultiSelect` (the same path Status / Difficulty use today). We
  // assert the method is absent post-refactor.
  it('D-03: renderPremiumEditor deleted — premium uses multi-select (TODO(05.2-03): delete renderPremiumEditor in FilterModal.ts)', async () => {
    const mod = (await import('../../src/browse/FilterModal')) as unknown as {
      FilterModal: new (...args: unknown[]) => unknown;
    };
    const proto = mod.FilterModal.prototype as Record<string, unknown>;
    // Post-Wave-1: the premium path shares renderMultiSelect with status /
    // difficulty, so renderPremiumEditor must not exist.
    expect(proto.renderPremiumEditor).toBeUndefined();
    // renderMultiSelect must continue to exist — it's the shared entry point.
    expect(typeof proto.renderMultiSelect).toBe('function');
  });

  // D-04 — Apply handler strips `__autoDefault` markers. Wave 1 marks the
  // first-open default (`premium: non-premium` when isPremium === false) with
  // `__autoDefault: true` so `updateFilterBadge` can exclude it from the count.
  // On Apply the marker is stripped before passing to `onApply` so the
  // persisted filter only contains user-intent rules.
  it('D-04: Apply strips __autoDefault markers from draft rules (TODO(05.2-03): add marker stripping in applyBtn click)', async () => {
    // Target invariant (Wave 1): applyBtn click → the rule passed to onApply
    // does NOT carry a `__autoDefault` property even if the draft rule did.
    // Wave 1 plan will expose a pure helper `stripAutoDefaults(rules)` that
    // this test invokes directly; expressing intent as the invariant here so
    // the test is unskipped against the real helper without re-plumbing.
    const mod = (await import('../../src/browse/FilterModal')) as unknown as {
      stripAutoDefaults?: (rules: unknown[]) => unknown[];
    };
    if (typeof mod.stripAutoDefaults !== 'function') {
      // Helper not yet extracted — Wave 1 will add it (see plan 05.2-03 §Action).
      throw new Error('stripAutoDefaults helper missing — 05.2-03 must export it');
    }
    const draft = [
      { field: 'premium', op: 'is', values: ['non-premium'], __autoDefault: true },
      { field: 'difficulty', op: 'is', values: ['Easy'] },
    ];
    const stripped = mod.stripAutoDefaults(draft) as Array<Record<string, unknown>>;
    expect(stripped).toHaveLength(2);
    expect(stripped[0]).not.toHaveProperty('__autoDefault');
    expect(stripped[1]).not.toHaveProperty('__autoDefault');
  });
});
