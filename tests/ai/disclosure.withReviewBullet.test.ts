// tests/ai/disclosure.withReviewBullet.test.ts
//
// Phase 09 Plan 01 Task 3 — withReviewBullet factory tests.
//
// Verifies (per 09-01-PLAN.md acceptance criteria):
//   - withReviewBullet returns a FRESH object; DISCLOSURE_BASE_COPY is unchanged.
//   - result.willSend.length === base.willSend.length + 1
//   - result.willSend ends with the locked verbatim review bullet
//   - result.neverSends === base.neverSends (reference equality — no copy)
//   - Calling factory twice returns two independent objects (no shared state)

import { describe, it, expect } from 'vitest';

const VERBATIM_BULLET =
  'AI Review sends the problem statement and your accepted solution code';

describe('Phase 09 Plan 01 — withReviewBullet factory', () => {
  it('returns a FRESH object; DISCLOSURE_BASE_COPY is unchanged', async () => {
    const { withReviewBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const baseLengthBefore = DISCLOSURE_BASE_COPY.willSend.length;
    const result = withReviewBullet(DISCLOSURE_BASE_COPY);
    expect(result).not.toBe(DISCLOSURE_BASE_COPY);
    expect(DISCLOSURE_BASE_COPY.willSend.length).toBe(baseLengthBefore);
    // The base remains frozen (locked invariant from Phase 07 Plan 07 WR-02).
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY)).toBe(true);
    expect(Object.isFrozen(DISCLOSURE_BASE_COPY.willSend)).toBe(true);
  });

  it('result.willSend.length === base.willSend.length + 1', async () => {
    const { withReviewBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withReviewBullet(DISCLOSURE_BASE_COPY);
    expect(result.willSend.length).toBe(
      DISCLOSURE_BASE_COPY.willSend.length + 1,
    );
  });

  it('result.willSend ends with the locked verbatim review bullet', async () => {
    const { withReviewBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withReviewBullet(DISCLOSURE_BASE_COPY);
    expect(result.willSend[result.willSend.length - 1]).toBe(VERBATIM_BULLET);
  });

  it('result.neverSends === base.neverSends (reference equality)', async () => {
    const { withReviewBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const result = withReviewBullet(DISCLOSURE_BASE_COPY);
    expect(result.neverSends).toBe(DISCLOSURE_BASE_COPY.neverSends);
  });

  it('calling withReviewBullet twice returns two independent objects (no shared state)', async () => {
    const { withReviewBullet, DISCLOSURE_BASE_COPY } = await import(
      '../../src/ai/disclosure'
    );
    const r1 = withReviewBullet(DISCLOSURE_BASE_COPY);
    const r2 = withReviewBullet(DISCLOSURE_BASE_COPY);
    expect(r1).not.toBe(r2);
    expect(r1.willSend).not.toBe(r2.willSend);
    expect(r1.willSend.length).toBe(r2.willSend.length);
    expect(r1.willSend[r1.willSend.length - 1]).toBe(VERBATIM_BULLET);
    expect(r2.willSend[r2.willSend.length - 1]).toBe(VERBATIM_BULLET);
  });
});
