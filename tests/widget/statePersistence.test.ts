// Phase 19 Plan 03 Task 1 (RED) — StatePersistenceMap unit tests.
//
// Verifies CONTEXT C-09 + D-01 + RESEARCH Pattern 4: plugin-singleton state
// persistence map keyed by `${file.path}::${fenceIndex}` with 30s TTL.
// captureState writes; hydrateState reads + applies + deletes; sweepExpired
// drains; multi-key isolation; cursor clamping on hydrate.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { StatePersistenceMap } from '../../src/widget/statePersistence';

// ─── Mock EditorView ─────────────────────────────────────────────────────────
//
// happy-dom won't run real CM6 layout cleanly under fake timers; we mock the
// EditorView surface that StatePersistenceMap touches:
//   - state.selection.main.head
//   - state.doc.length
//   - state.toJSON({history: ...}) → returns object with .history slot
//   - scrollDOM.scrollTop (read on capture, written on hydrate)
//   - dispatch({selection}) — observable mock
//
// Tests assert via vi.fn() spies and direct property reads.
function makeFakeView(opts: {
  cursor?: number;
  scrollTop?: number;
  docLength?: number;
  historyJSON?: unknown;
}): {
  state: {
    selection: { main: { head: number } };
    doc: { length: number; toString: () => string };
    toJSON: (fields?: Record<string, unknown>) => Record<string, unknown>;
  };
  scrollDOM: { scrollTop: number };
  dispatch: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
} {
  const cursor = opts.cursor ?? 0;
  const scrollTop = opts.scrollTop ?? 0;
  const docLength = opts.docLength ?? 100;
  const historyJSON = opts.historyJSON ?? { done: [], undone: [] };
  return {
    state: {
      selection: { main: { head: cursor } },
      doc: { length: docLength, toString: () => 'x'.repeat(docLength) },
      toJSON: (_fields?: Record<string, unknown>) => ({ history: historyJSON }),
    },
    scrollDOM: { scrollTop },
    dispatch: vi.fn(),
    setState: vi.fn(),
  };
}

describe('StatePersistenceMap', () => {
  let map: StatePersistenceMap;

  beforeEach(() => {
    map = new StatePersistenceMap();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('captureState / hydrateState basic', () => {
    it('captureState writes entry; hydrateState reads it back, dispatches selection, applies scrollTop, returns true', () => {
      const v1 = makeFakeView({ cursor: 42, scrollTop: 200, docLength: 100 });
      map.captureState('a.md::0', v1 as never);

      const v2 = makeFakeView({ cursor: 0, scrollTop: 0, docLength: 100 });
      const ok = map.hydrateState('a.md::0', v2 as never);

      expect(ok).toBe(true);
      // dispatch was called with a selection object whose anchor is the cursor.
      expect(v2.dispatch).toHaveBeenCalledTimes(1);
      const firstCall = v2.dispatch.mock.calls[0];
      expect(firstCall).toBeDefined();
      const dispatchArg = (firstCall as unknown[])[0] as {
        selection?: unknown;
      };
      expect(dispatchArg.selection).toBeDefined();
      expect(v2.scrollDOM.scrollTop).toBe(200);
    });

    it('hydrateState returns false on miss (un-captured key)', () => {
      const v = makeFakeView({});
      expect(map.hydrateState('never.md::0', v as never)).toBe(false);
    });

    it('hydrateState deletes the entry after a successful hydrate (one-shot)', () => {
      const v1 = makeFakeView({ cursor: 10 });
      map.captureState('a.md::0', v1 as never);
      const v2 = makeFakeView({});
      expect(map.hydrateState('a.md::0', v2 as never)).toBe(true);
      // Second hydrate of the same key should miss.
      const v3 = makeFakeView({});
      expect(map.hydrateState('a.md::0', v3 as never)).toBe(false);
    });
  });

  describe('30s TTL expiry', () => {
    it('hydrate after 30001ms returns false; entry deleted', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      const v1 = makeFakeView({ cursor: 5 });
      map.captureState('a.md::0', v1 as never);
      vi.setSystemTime(new Date(30_001));
      const v2 = makeFakeView({});
      expect(map.hydrateState('a.md::0', v2 as never)).toBe(false);
      // Re-hydrate even within a fresh window must miss — the expired entry
      // should have been swept on lookup.
      const v3 = makeFakeView({});
      expect(map.hydrateState('a.md::0', v3 as never)).toBe(false);
    });

    it('hydrate just before 30s boundary returns true', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      const v1 = makeFakeView({ cursor: 5 });
      map.captureState('a.md::0', v1 as never);
      vi.setSystemTime(new Date(29_999));
      const v2 = makeFakeView({});
      expect(map.hydrateState('a.md::0', v2 as never)).toBe(true);
    });

    it('sweepExpired removes stale entries; live entries survive', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(0));
      map.captureState('stale.md::0', makeFakeView({ cursor: 1 }) as never);
      vi.setSystemTime(new Date(20_000));
      map.captureState('fresh.md::0', makeFakeView({ cursor: 2 }) as never);
      vi.setSystemTime(new Date(31_000));
      // At t=31s: stale.md (captured at 0, expires 30s) is past TTL;
      // fresh.md (captured at 20s, expires at 50s) still alive.
      map.sweepExpired();
      // After sweep: stale.md miss, fresh.md hit.
      expect(map.hydrateState('stale.md::0', makeFakeView({}) as never)).toBe(
        false,
      );
      expect(map.hydrateState('fresh.md::0', makeFakeView({}) as never)).toBe(
        true,
      );
    });
  });

  describe('multi-key isolation (CONTEXT D-01)', () => {
    it("captureState('a.md::0') doesn't affect 'a.md::1'", () => {
      map.captureState('a.md::0', makeFakeView({ cursor: 5 }) as never);
      // a.md::1 is uncaptured — hydrate misses.
      expect(map.hydrateState('a.md::1', makeFakeView({}) as never)).toBe(
        false,
      );
      // a.md::0 still hits.
      expect(map.hydrateState('a.md::0', makeFakeView({}) as never)).toBe(
        true,
      );
    });

    it('different file paths are isolated', () => {
      map.captureState('a.md::0', makeFakeView({ cursor: 5 }) as never);
      map.captureState('b.md::0', makeFakeView({ cursor: 7 }) as never);
      const va = makeFakeView({});
      const vb = makeFakeView({});
      expect(map.hydrateState('a.md::0', va as never)).toBe(true);
      expect(map.hydrateState('b.md::0', vb as never)).toBe(true);
      // Each consumed once.
      expect(map.hydrateState('a.md::0', makeFakeView({}) as never)).toBe(
        false,
      );
      expect(map.hydrateState('b.md::0', makeFakeView({}) as never)).toBe(
        false,
      );
    });
  });

  describe('cursor clamping on hydrate (RESEARCH Pattern 4 line 301)', () => {
    it('stored cursor=100 hydrating into doc.length=50 → clamped to 50', () => {
      const v1 = makeFakeView({ cursor: 100, docLength: 100 });
      map.captureState('a.md::0', v1 as never);
      // Hydrate target's doc shrunk to 50.
      const v2 = makeFakeView({ cursor: 0, docLength: 50 });
      expect(map.hydrateState('a.md::0', v2 as never)).toBe(true);
      // Inspect dispatched selection — anchor must be ≤ docLength.
      const firstCall = v2.dispatch.mock.calls[0];
      expect(firstCall).toBeDefined();
      const dispatchArg = (firstCall as unknown[])[0] as {
        selection?: { anchor?: number; head?: number; main?: { head: number } };
      };
      // EditorSelection.cursor returns a SelectionRange-like object with
      // anchor=head; we accept either property since the StatePersistenceMap
      // implementation may use EditorSelection.cursor or a plain object.
      const anchor =
        dispatchArg.selection &&
        ((dispatchArg.selection as { anchor?: number }).anchor ??
          (dispatchArg.selection as { head?: number }).head ??
          (dispatchArg.selection as { main?: { head: number } }).main?.head);
      expect(typeof anchor).toBe('number');
      expect(anchor as number).toBeLessThanOrEqual(50);
    });
  });

  describe('clear / clearForPath', () => {
    it('clear() empties the map', () => {
      map.captureState('a.md::0', makeFakeView({}) as never);
      map.captureState('b.md::0', makeFakeView({}) as never);
      map.clear();
      expect(map.hydrateState('a.md::0', makeFakeView({}) as never)).toBe(
        false,
      );
      expect(map.hydrateState('b.md::0', makeFakeView({}) as never)).toBe(
        false,
      );
    });

    it('clearForPath removes all entries with matching path prefix', () => {
      map.captureState('a.md::0', makeFakeView({}) as never);
      map.captureState('a.md::1', makeFakeView({}) as never);
      map.captureState('b.md::0', makeFakeView({}) as never);
      map.clearForPath('a.md');
      expect(map.hydrateState('a.md::0', makeFakeView({}) as never)).toBe(
        false,
      );
      expect(map.hydrateState('a.md::1', makeFakeView({}) as never)).toBe(
        false,
      );
      expect(map.hydrateState('b.md::0', makeFakeView({}) as never)).toBe(
        true,
      );
    });
  });
});
