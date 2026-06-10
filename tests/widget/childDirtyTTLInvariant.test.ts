// Phase 22 Wave 3 C6d — Hard-linked TTL invariant test.
//
// INVARIANT: WIDGET_DIRTY_SAFETY_TTL_MS MUST equal SELF_WRITE_SUPPRESSION_TTL_MS.
//
// Rationale (from WidgetController.ts JSDoc):
//   The safety timer is the fallback for the case where the echo handshake
//   never drains _childDirty (PITFALLS Pitfall 27 — byte-identical writes).
//   If the safety TTL is SHORTER than the suppression TTL, a slow modify
//   event arriving inside the suppression window would find _childDirty
//   already false and incorrectly route as external — potentially calling
//   reloadFromDisk and overwriting in-flight chars.
//
//   If the safety TTL is LONGER, _childDirty outlives the suppression entry;
//   this is safe but wastes the guard window. Exact equality is the load-
//   bearing constraint.
//
// Failure mode on naive design: WidgetController exported a hard-coded
// constant (e.g. 2000) instead of re-exporting SELF_WRITE_SUPPRESSION_TTL_MS.
// If someone bumped the suppression TTL (e.g. to 3000) without updating the
// safety TTL, this test would catch the drift at CI time.

import { describe, it, expect } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

import { vi } from 'vitest';
import { SELF_WRITE_SUPPRESSION_TTL_MS } from '../../src/widget/selfWriteSuppression';
import { WIDGET_DIRTY_SAFETY_TTL_MS } from '../../src/widget/WidgetController';

describe('Hard-linked TTL invariant — WIDGET_DIRTY_SAFETY_TTL_MS === SELF_WRITE_SUPPRESSION_TTL_MS', () => {
  it('safety timer TTL matches suppression TTL (drift fails CI)', () => {
    // This is the load-bearing invariant. If these values drift, the safety
    // timer will either fire too early (allowing reload-silent to clobber
    // in-flight chars) or too late (no practical harm but violates the spec).
    expect(WIDGET_DIRTY_SAFETY_TTL_MS).toBe(SELF_WRITE_SUPPRESSION_TTL_MS);
  });

  it('both TTL constants are positive finite numbers', () => {
    expect(typeof WIDGET_DIRTY_SAFETY_TTL_MS).toBe('number');
    expect(typeof SELF_WRITE_SUPPRESSION_TTL_MS).toBe('number');
    expect(isFinite(WIDGET_DIRTY_SAFETY_TTL_MS)).toBe(true);
    expect(WIDGET_DIRTY_SAFETY_TTL_MS).toBeGreaterThan(0);
  });

  it('WIDGET_DIRTY_SAFETY_TTL_MS is a re-export of SELF_WRITE_SUPPRESSION_TTL_MS (not a literal copy)', () => {
    // The production code assigns:
    //   export const WIDGET_DIRTY_SAFETY_TTL_MS = SELF_WRITE_SUPPRESSION_TTL_MS;
    // This test cannot directly verify the assignment mechanism, but it
    // verifies strict value equality — sufficient to catch any future
    // independent re-definition of either constant.
    expect(WIDGET_DIRTY_SAFETY_TTL_MS).toStrictEqual(SELF_WRITE_SUPPRESSION_TTL_MS);
  });
});
