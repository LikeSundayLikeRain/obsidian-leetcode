// tests/solve/lastVerdictStore.test.ts
//
// Phase 08 Plan 01 Task 1 — Wave 0 RED tests for `src/solve/lastVerdictStore.ts`.
//
// Locked contract per 08-CONTEXT decision B + 08-PATTERNS §"src/solve/
// lastVerdictStore.ts":
//   - In-memory `Map<slug, LastVerdict>` on the LeetCodePlugin instance.
//   - NO Plugin constructor arg (deviation from EphemeralTabStore — verdicts
//     have no tab lifecycle, so no reconcile loop is needed).
//   - NO data.json field (in-memory only — cleared on plugin reload).
//   - Per-slug isolation: two slugs hold independent verdicts.
//   - `set` overwrites prior verdict for the same slug; no per-slug history.
//   - `clear()` and `dispose()` empty the Map; idempotent.
//   - `get('unknown')` returns undefined.
//
// LastVerdict shape locked against `src/solve/types.ts:71-117` per RESEARCH
// §Pattern 2 — every field maps to a real RunCheckResponse / SubmitCheckResponse
// field; runtimeMs and memoryMb are kept as `string` (LC's wire format,
// e.g. '120 ms' / '14.5 MB').

import { describe, it, expect } from 'vitest';
import {
  LastVerdictStore,
  type LastVerdict,
} from '../../src/solve/lastVerdictStore';

function makeSubmitFailureVerdict(): LastVerdict {
  return {
    kind: 'submit-failure',
    capturedAt: 1234567890,
    verdictText: 'Wrong Answer',
    failingInput: '[2,7,11,15]\n9',
    expectedOutput: '[0,1]',
    actualOutput: '[1,0]',
    runtimeMs: '52 ms',
    memoryMb: '14.5 MB',
    errorMessage: undefined,
  };
}

function makeRunFailureVerdict(): LastVerdict {
  return {
    kind: 'run-failure',
    capturedAt: 9876543210,
    verdictText: 'Wrong Answer',
    failingInput: '[3,2,4]\n6',
    expectedOutput: '[1,2]',
    actualOutput: '[0,2]',
  };
}

describe('Phase 08 LastVerdictStore (08-CONTEXT decision B)', () => {
  it('set/get round-trip returns byte-identical verdict', () => {
    const store = new LastVerdictStore();
    const v = makeSubmitFailureVerdict();
    store.set('two-sum', v);
    const got = store.get('two-sum');
    expect(got).toBeDefined();
    expect(got).toEqual(v);
    // Reference equality is NOT required — set may copy or hold the original.
    // Equality of every field is the contract.
    expect(got?.kind).toBe('submit-failure');
    expect(got?.failingInput).toBe('[2,7,11,15]\n9');
    expect(got?.runtimeMs).toBe('52 ms');
    expect(got?.memoryMb).toBe('14.5 MB');
  });

  it('per-slug isolation: two slugs hold independent verdicts', () => {
    const store = new LastVerdictStore();
    const v1 = makeSubmitFailureVerdict();
    const v2 = makeRunFailureVerdict();
    store.set('two-sum', v1);
    store.set('add-two-numbers', v2);

    const got1 = store.get('two-sum');
    const got2 = store.get('add-two-numbers');

    expect(got1).toEqual(v1);
    expect(got2).toEqual(v2);
    expect(got1?.kind).toBe('submit-failure');
    expect(got2?.kind).toBe('run-failure');
    expect(got1).not.toEqual(got2);
  });

  it('re-set overwrites prior verdict for the same slug (no history)', () => {
    const store = new LastVerdictStore();
    const v1 = makeSubmitFailureVerdict();
    store.set('two-sum', v1);
    expect(store.get('two-sum')).toEqual(v1);

    const v2: LastVerdict = {
      kind: 'submit-failure',
      capturedAt: 2222222222,
      verdictText: 'Time Limit Exceeded',
      failingInput: 'large input',
      runtimeMs: '5000 ms',
    };
    store.set('two-sum', v2);
    const got = store.get('two-sum');
    expect(got).toEqual(v2);
    expect(got?.verdictText).toBe('Time Limit Exceeded');
    // No trace of v1 remains.
    expect(got?.expectedOutput).toBeUndefined();
    expect(got?.actualOutput).toBeUndefined();
  });

  it('get returns undefined for unknown slug', () => {
    const store = new LastVerdictStore();
    expect(store.get('never-set')).toBeUndefined();
    store.set('two-sum', makeSubmitFailureVerdict());
    expect(store.get('two-sum')).toBeDefined();
    expect(store.get('still-unknown')).toBeUndefined();
  });

  it('clear empties the store; subsequent get returns undefined', () => {
    const store = new LastVerdictStore();
    store.set('two-sum', makeSubmitFailureVerdict());
    store.set('add-two-numbers', makeRunFailureVerdict());
    expect(store.get('two-sum')).toBeDefined();
    expect(store.get('add-two-numbers')).toBeDefined();

    store.clear();

    expect(store.get('two-sum')).toBeUndefined();
    expect(store.get('add-two-numbers')).toBeUndefined();

    // Idempotent — second clear is a no-op.
    store.clear();
    expect(store.get('two-sum')).toBeUndefined();
  });

  it('dispose is idempotent and equivalent to clear', () => {
    const store = new LastVerdictStore();
    store.set('two-sum', makeSubmitFailureVerdict());
    store.dispose();
    expect(store.get('two-sum')).toBeUndefined();
    // Idempotent — second dispose is a no-op.
    store.dispose();
    expect(store.get('two-sum')).toBeUndefined();
    // Set after dispose still works (the store remains usable).
    const v = makeRunFailureVerdict();
    store.set('two-sum', v);
    expect(store.get('two-sum')).toEqual(v);
  });

  it('no Plugin constructor arg required (instantiate via `new LastVerdictStore()`)', () => {
    // Locked deviation from EphemeralTabStore per 08-PATTERNS §"src/solve/
    // lastVerdictStore.ts" Apply pattern: "strip the plugin constructor arg AND
    // the layout-change reconcile loop". Verdicts have no tab lifecycle.
    expect(() => new LastVerdictStore()).not.toThrow();
    const store = new LastVerdictStore();
    expect(typeof store.set).toBe('function');
    expect(typeof store.get).toBe('function');
    expect(typeof store.clear).toBe('function');
    expect(typeof store.dispose).toBe('function');
  });
});
