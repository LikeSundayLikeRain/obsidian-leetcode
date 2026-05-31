// Phase 20 Plan 20-09 (amended) — debounced child→parent sync extension tests.
//
// The new architecture debounces child→parent dispatches (300ms idle).
// Tests use vi.useFakeTimers() to advance time and verify:
//   1. No dispatch before debounce fires.
//   2. Debounced dispatch replaces parent fence body with child doc.
//   3. Echo prevention: transactions carrying syncAnnotation don't trigger.
//   4. Fence missing (getFence returns null) → abort silently.
//   5. docChanged === false → no scheduling.
//   6. Multiple rapid changes → only one dispatch after debounce.
//   7. flushSync() fires immediately without waiting for debounce.
//   8. cancel() prevents pending flush from firing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@codemirror/state', () => {
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

interface FakeParentDoc {
  text: string;
  lines: number;
  line(n: number): { from: number; to: number; text: string; number: number };
  sliceString(from: number, to: number): string;
  get length(): number;
}

function makeFakeDoc(text: string): FakeParentDoc {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  const ends: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    const next = i + 1 < starts.length ? starts[i + 1]! : text.length + 1;
    ends.push(next - 1);
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
    sliceString(from: number, to: number) {
      return text.slice(from, to);
    },
    get length() {
      return text.length;
    },
  };
}

interface FakeParentView {
  state: { doc: FakeParentDoc };
  dispatched: Array<{ changes: { from: number; to: number; insert: string }; annotations?: unknown[] }>;
  dispatch(spec: { changes: { from: number; to: number; insert: string }; annotations?: unknown[] }): void;
}

function makeFakeParentView(text: string): FakeParentView {
  const view: FakeParentView = {
    state: { doc: makeFakeDoc(text) },
    dispatched: [],
    dispatch(spec) {
      view.dispatched.push(spec);
    },
  };
  return view;
}

interface FakeUpdate {
  docChanged: boolean;
  transactions: Array<{ annotation: (def: { key: symbol }) => unknown }>;
  view: { state: { doc: { toString: () => string } } };
}

function makeUpdate(opts: {
  docChanged: boolean;
  childDoc?: string;
  syncAnnotated?: boolean;
}): FakeUpdate {
  const annotationKey = (syncAnnotation as unknown as { key: symbol }).key;
  return {
    docChanged: opts.docChanged,
    transactions: opts.syncAnnotated
      ? [{ annotation: (def: { key: symbol }) => def.key === annotationKey ? true : undefined }]
      : [{ annotation: () => undefined }],
    view: { state: { doc: { toString: () => opts.childDoc ?? '' } } },
  };
}

function getListenerCallback(
  ext: unknown,
): (update: FakeUpdate) => void {
  return (ext as { __updateListener: (u: FakeUpdate) => void }).__updateListener;
}

describe('Phase 20 Plan 20-09 (amended) — debounced childParentSync', () => {
  // Parent doc with leetcode-solve fence on lines 3-6:
  //   line 1: '## Code\n'         positions 0-7
  //   line 2: '\n'                 position  8
  //   line 3: '```leetcode-solve\n' positions 9-26
  //   line 4: 'class Solution {\n'  positions 27-43
  //   line 5: '}\n'                positions 44-45
  //   line 6: '```\n'              positions 46-49
  // bodyStart = line(3).to + 1 = 26 + 1 = 27 (but .to excludes \n, so 25+1=26? let's verify)
  // Actually: line(3) text is '```leetcode-solve', from=9, to=25 (end of text before \n)
  //   bodyStart = 25 + 1 = 26... No — let's just let the test verify empirically.
  const PARENT_TEXT = '## Code\n\n```leetcode-solve\nclass Solution {\n}\n```\n';
  const FENCE: FenceLocation = { openerLine: 3, closerLine: 6, kind: 'leetcode-solve' };
  // bodyStart = 27, bodyEnd = 46
  // parent fence body = 'class Solution {\n}\n' (includes trailing \n before closer)

  let parent: FakeParentView;
  let getFence: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    parent = makeFakeParentView(PARENT_TEXT);
    getFence = vi.fn(() => FENCE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 1: no dispatch before debounce timer fires', () => {
    const { extension: ext } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, childDoc: 'class Solution {\n  return 0;\n}' }));

    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 2: dispatch fires after debounce (300ms) with full body replace', () => {
    const { extension: ext } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    const newBody = 'class Solution {\n  return 0;\n}';
    cb(makeUpdate({ docChanged: true, childDoc: newBody }));

    vi.advanceTimersByTime(300);

    expect(parent.dispatched.length).toBe(1);
    const dispatch = parent.dispatched[0]!;
    expect(dispatch.changes.from).toBe(27); // bodyStart
    expect(dispatch.changes.to).toBe(46);   // bodyEnd
    // Trailing \n appended to preserve fence structure
    expect(dispatch.changes.insert).toBe(newBody + '\n');
  });

  it('Test 3: echo prevention — syncAnnotation skips scheduling', () => {
    const { extension: ext } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, childDoc: 'modified', syncAnnotated: true }));

    vi.advanceTimersByTime(500);

    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 4: getFence returns null → abort silently', () => {
    const nullFence = vi.fn(() => null);
    const { extension: ext } = createChildParentSyncExtension(parent as never, nullFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, childDoc: 'modified' }));

    vi.advanceTimersByTime(500);

    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 5: docChanged false → no scheduling', () => {
    const { extension: ext } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: false, childDoc: 'modified' }));

    vi.advanceTimersByTime(500);

    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 6: multiple rapid changes → single dispatch after debounce', () => {
    const { extension: ext } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, childDoc: 'a' }));
    vi.advanceTimersByTime(100);
    cb(makeUpdate({ docChanged: true, childDoc: 'ab' }));
    vi.advanceTimersByTime(100);
    cb(makeUpdate({ docChanged: true, childDoc: 'abc' }));

    // Not yet at 300ms from last change
    expect(parent.dispatched.length).toBe(0);

    vi.advanceTimersByTime(300);

    // Single dispatch with final child doc + trailing \n
    expect(parent.dispatched.length).toBe(1);
    expect(parent.dispatched[0]!.changes.insert).toBe('abc\n');
  });

  it('Test 7: flushSync() fires immediately without waiting for debounce', () => {
    const { extension: ext, handle } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, childDoc: 'flushed' }));

    // Flush immediately — no timer advance
    handle.flushSync();

    expect(parent.dispatched.length).toBe(1);
    expect(parent.dispatched[0]!.changes.insert).toBe('flushed\n');

    // Advancing timer should NOT produce a second dispatch
    vi.advanceTimersByTime(500);
    expect(parent.dispatched.length).toBe(1);
  });

  it('Test 8: cancel() prevents pending flush from firing', () => {
    const { extension: ext, handle } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    cb(makeUpdate({ docChanged: true, childDoc: 'cancelled' }));

    handle.cancel();

    vi.advanceTimersByTime(500);

    expect(parent.dispatched.length).toBe(0);
  });

  it('Test 9: no dispatch when child doc matches parent fence body', () => {
    const { extension: ext } = createChildParentSyncExtension(parent as never, getFence as never);
    const cb = getListenerCallback(ext);

    // Child doc 'class Solution {\n}' + appended '\n' = parent body 'class Solution {\n}\n'
    cb(makeUpdate({ docChanged: true, childDoc: 'class Solution {\n}' }));

    vi.advanceTimersByTime(500);

    expect(parent.dispatched.length).toBe(0);
  });
});
