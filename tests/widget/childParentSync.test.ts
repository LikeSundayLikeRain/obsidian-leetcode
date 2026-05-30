// Phase 20 Plan 20-09 Task 2 — child→parent sync extension tests.
//
// Tests:
//   1. Single-character insertion in child remaps to parent fence-body offset.
//   2. Multi-line insertion remaps correctly.
//   3. Echo prevention: transactions carrying syncAnnotation don't re-dispatch.
//   4. Fence missing (getFence returns null) → abort silently, no parent
//      dispatch.
//   5. Replacement (range edit, not insertion) remaps both `from` and `to`
//      to parent offsets.
//   6. update.docChanged === false → no parent dispatch.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @codemirror/state with the minimum primitives the sync extension
// touches: Annotation.define + Transaction.userEvent.of + addToHistory.of.
vi.mock('@codemirror/state', () => {
  // Symbol-keyed annotation registry. tr.annotation(<defKey>) returns the
  // value stored on the transaction under that key (or undefined).
  type AnnotationDef<T> = { key: symbol; of: (value: T) => { __key: symbol; value: T } };
  const define = <T>(): AnnotationDef<T> => {
    const key = Symbol('annotation');
    return {
      key,
      of: (value: T) => ({ __key: key, value }),
    };
  };
  return {
    Annotation: { define },
    Transaction: {
      userEvent: { of: (s: string) => ({ __userEvent: s }) },
      addToHistory: { of: (b: boolean) => ({ __addToHistory: b }) },
    },
  };
});

vi.mock('@codemirror/view', () => {
  // updateListener.of(cb) just stores the callback so tests can call it
  // directly with a synthetic ViewUpdate.
  return {
    EditorView: {
      updateListener: {
        of: (cb: (update: unknown) => void) => ({ __updateListener: cb }),
      },
    },
  };
});

import {
  createChildParentSyncExtension,
  syncAnnotation,
} from '../../src/widget/childParentSync';
import type { FenceLocation } from '../../src/widget/fenceLocator';

interface ChangeRange {
  from: number;
  to: number;
  insert: string;
}

interface FakeParentDoc {
  text: string;
  lines: number;
  line(n: number): { from: number; to: number; text: string; number: number };
  get length(): number;
}

function makeFakeDoc(text: string): FakeParentDoc {
  // Build line index: lines[i] holds the start offset of line i+1 (1-indexed).
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  const ends: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    const next = i + 1 < starts.length ? starts[i + 1]! : text.length + 1;
    ends.push(next - 1); // .to excludes the trailing \n
  }

  return {
    text,
    lines: starts.length,
    line(n: number) {
      const idx = n - 1;
      const from = starts[idx]!;
      const to = ends[idx]!;
      return {
        from,
        to: Math.min(to, text.length),
        text: text.slice(from, Math.min(to, text.length)),
        number: n,
      };
    },
    get length() {
      return text.length;
    },
  };
}

interface FakeParentView {
  state: { doc: FakeParentDoc };
  dispatched: Array<{ changes: ChangeRange[]; annotations?: unknown[] }>;
  dispatch(spec: { changes: ChangeRange[] | ChangeRange; annotations?: unknown[] }): void;
}

function makeFakeParentView(text: string): FakeParentView {
  const view: FakeParentView = {
    state: { doc: makeFakeDoc(text) },
    dispatched: [],
    dispatch(spec) {
      const arr = Array.isArray(spec.changes) ? spec.changes : [spec.changes];
      view.dispatched.push({ changes: arr, annotations: spec.annotations });
    },
  };
  return view;
}

interface FakeChangeSet {
  iterChanges(
    cb: (
      fromA: number,
      toA: number,
      fromB: number,
      toB: number,
      inserted: string,
    ) => void,
  ): void;
}

function makeChangeSet(changes: Array<{ fromA: number; toA: number; insert: string }>): FakeChangeSet {
  return {
    iterChanges(cb) {
      let fromB = 0;
      for (const c of changes) {
        const toB = fromB + c.insert.length;
        cb(c.fromA, c.toA, fromB, toB, c.insert);
        fromB = toB;
      }
    },
  };
}

interface FakeUpdate {
  docChanged: boolean;
  changes: FakeChangeSet;
  transactions: Array<{ annotation: (def: { key: symbol }) => unknown }>;
  view: { state: { doc: { toString: () => string } } };
  startState: { doc: { toString: () => string } };
  state: { doc: { toString: () => string } };
}

function makeUpdate(opts: {
  docChanged: boolean;
  changes?: FakeChangeSet;
  syncAnnotated?: boolean;
}): FakeUpdate {
  const annotationKey = (syncAnnotation as unknown as { key: symbol }).key;
  return {
    docChanged: opts.docChanged,
    changes: opts.changes ?? makeChangeSet([]),
    transactions: opts.syncAnnotated
      ? [
          {
            annotation: (def: { key: symbol }) =>
              def.key === annotationKey ? true : undefined,
          },
        ]
      : [
          {
            annotation: () => undefined,
          },
        ],
    view: { state: { doc: { toString: () => '' } } },
    startState: { doc: { toString: () => '' } },
    state: { doc: { toString: () => '' } },
  };
}

function getListenerCallback(
  ext: unknown,
): (update: FakeUpdate) => void {
  return (ext as { __updateListener: (u: FakeUpdate) => void }).__updateListener;
}

describe('Phase 20 Plan 20-09 Task 2 — childParentSync', () => {
  // Build a parent doc that has a leetcode-solve fence on lines 4-6:
  //   line 1: ## Code
  //   line 2: (blank)
  //   line 3: ```leetcode-solve
  //   line 4: class Solution {  <-- fence body line 1
  //   line 5: }                  <-- fence body line 2
  //   line 6: ```
  // bodyStart = line(3).to + 1; bodyEnd = line(6).from
  const PARENT_TEXT = '## Code\n\n```leetcode-solve\nclass Solution {\n}\n```\n';
  const FENCE: FenceLocation = { openerLine: 3, closerLine: 6, kind: 'leetcode-solve' };

  let parent: FakeParentView;
  let getFence: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    parent = makeFakeParentView(PARENT_TEXT);
    getFence = vi.fn(() => FENCE);
  });

  it('Test 1: single-character insertion in child remaps to parent fence-body offset', () => {
    const ext = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    // Child docChange: insert 'X' at child offset 0.
    cb(makeUpdate({
      docChanged: true,
      changes: makeChangeSet([{ fromA: 0, toA: 0, insert: 'X' }]),
    }));

    expect(parent.dispatched.length).toBe(1);
    const dispatch = parent.dispatched[0]!;
    // Parent fence body starts at line(3).to + 1.
    // line 3 (1-indexed) = '```leetcode-solve' starting at offset 9 (after '## Code\n\n').
    // line(3).to = 9 + '```leetcode-solve'.length = 9 + 17 = 26.
    // bodyStart = 27.
    expect(dispatch.changes[0]!.from).toBe(27);
    expect(dispatch.changes[0]!.to).toBe(27);
    expect(dispatch.changes[0]!.insert).toBe('X');
    // userEvent + addToHistory annotations attached.
    expect(dispatch.annotations).toBeDefined();
    expect(dispatch.annotations!.length).toBe(2);
  });

  it('Test 2: multi-character insertion remaps correctly', () => {
    const ext = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({
      docChanged: true,
      changes: makeChangeSet([{ fromA: 5, toA: 5, insert: 'abc' }]),
    }));

    expect(parent.dispatched.length).toBe(1);
    const dispatch = parent.dispatched[0]!;
    expect(dispatch.changes[0]!.from).toBe(27 + 5);
    expect(dispatch.changes[0]!.to).toBe(27 + 5);
    expect(dispatch.changes[0]!.insert).toBe('abc');
  });

  it('Test 3: echo prevention — syncAnnotation transaction does NOT dispatch', () => {
    const ext = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({
      docChanged: true,
      changes: makeChangeSet([{ fromA: 0, toA: 0, insert: 'X' }]),
      syncAnnotated: true,
    }));

    // No dispatch — would have been an echo loop.
    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 4: getFence returns null → abort silently, no parent dispatch', () => {
    const nullFence = vi.fn(() => null);
    const ext = createChildParentSyncExtension(parent as never, nullFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({
      docChanged: true,
      changes: makeChangeSet([{ fromA: 0, toA: 0, insert: 'X' }]),
    }));

    expect(parent.dispatched.length).toBe(0);
    expect(nullFence).toHaveBeenCalled();
  });

  it('Test 5: range replacement remaps both from and to', () => {
    const ext = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    // Replace child[2..5] with 'XYZ'.
    cb(makeUpdate({
      docChanged: true,
      changes: makeChangeSet([{ fromA: 2, toA: 5, insert: 'XYZ' }]),
    }));

    expect(parent.dispatched.length).toBe(1);
    const dispatch = parent.dispatched[0]!;
    expect(dispatch.changes[0]!.from).toBe(27 + 2);
    expect(dispatch.changes[0]!.to).toBe(27 + 5);
    expect(dispatch.changes[0]!.insert).toBe('XYZ');
  });

  it('Test 6: docChanged false → no parent dispatch', () => {
    const ext = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: false }));

    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 7: getFence is called fresh on every update (offset re-derivation)', () => {
    const ext = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, changes: makeChangeSet([{ fromA: 0, toA: 0, insert: 'A' }]) }));
    cb(makeUpdate({ docChanged: true, changes: makeChangeSet([{ fromA: 0, toA: 0, insert: 'B' }]) }));
    cb(makeUpdate({ docChanged: true, changes: makeChangeSet([{ fromA: 0, toA: 0, insert: 'C' }]) }));

    // Each update re-derives the fence so a shifted fence (after a
    // child→parent dispatch) is observed correctly.
    expect(getFence).toHaveBeenCalledTimes(3);
    expect(parent.dispatched.length).toBe(3);
  });
});
