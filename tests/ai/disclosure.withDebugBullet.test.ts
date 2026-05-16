// tests/ai/disclosure.withDebugBullet.test.ts
//
// Phase 08 Plan 03 Task 1 — withDebugBullet factory tests.
//
// Verifies (per 08-PLAN.md acceptance criteria):
//   - withDebugBullet returns a FRESH object; DISCLOSURE_BASE_COPY is unchanged.
//   - DISCLOSURE_BASE_COPY remains Object.isFrozen + .willSend frozen + same
//     length after the factory call (no mutation hazard).
//   - result.willSend.length === base.willSend.length + 1
//   - result.willSend ends with the locked verbatim AI Debug bullet
//   - result.neverSends === base.neverSends (reference equality — both frozen,
//     no copy needed).
//   - Calling withDebugBullet twice returns two independent objects, each with
//     the SAME bullet appended (idempotent factory).

import { describe, it, expect } from 'vitest';

const VERBATIM_BULLET =
  'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)';

describe('Phase 08 Plan 03 — withDebugBullet factory', () => {
  it('returns a FRESH object; DISCLOSURE_BASE_COPY is unchanged', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const baseLengthBefore = DISCLOSURE_BASE_COPY.willSend.length;
    const result = withDebugBullet(DISCLOSURE_BASE_COPY);
    expect(result).not.toBe(DISCLOSURE_BASE_COPY);
    expect(DISCLOSURE_BASE_COPY.willSend.length).toBe(baseLengthBefore);
    // The base remains frozen (locked invariant from Phase 07 Plan 07 WR-02).
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY)).toBe(true);
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY.willSend)).toBe(true);
  });

  it('result.willSend.length === base.willSend.length + 1', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withDebugBullet(DISCLOSURE_BASE_COPY);
    expect(result.willSend.length).toBe(
      DISCLOSURE_BASE_COPY.willSend.length + 1,
    );
  });

  it('result.willSend ends with the locked verbatim AI Debug bullet', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withDebugBullet(DISCLOSURE_BASE_COPY);
    expect(result.willSend[result.willSend.length - 1]).toBe(VERBATIM_BULLET);
  });

  it('result.neverSends === base.neverSends (reference equality)', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withDebugBullet(DISCLOSURE_BASE_COPY);
    expect(result.neverSends).toBe(DISCLOSURE_BASE_COPY.neverSends);
  });

  it('calling withDebugBullet twice returns two independent objects, each with the same bullet appended', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const r1 = withDebugBullet(DISCLOSURE_BASE_COPY);
    const r2 = withDebugBullet(DISCLOSURE_BASE_COPY);
    expect(r1).not.toBe(r2);
    expect(r1.willSend).not.toBe(r2.willSend);
    expect(r1.willSend.length).toBe(r2.willSend.length);
    expect(r1.willSend[r1.willSend.length - 1]).toBe(VERBATIM_BULLET);
    expect(r2.willSend[r2.willSend.length - 1]).toBe(VERBATIM_BULLET);
  });

  it('preserves all base willSend entries in the same order before the new bullet', async () => {
    const { withDebugBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withDebugBullet(DISCLOSURE_BASE_COPY);
    for (let i = 0; i < DISCLOSURE_BASE_COPY.willSend.length; i++) {
      expect(result.willSend[i]).toBe(DISCLOSURE_BASE_COPY.willSend[i]);
    }
  });
});
