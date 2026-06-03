// Phase 19 Plan 04 Task 1 — widgetEquality unit tests (RED).
//
// VALIDATION row 19-04-05 / RESEARCH Pitfall 19-F.
//
// Verifies LeetCodeFenceWidget.eq() returns true iff (file.path, fenceIndex,
// sourceHash) ALL match. Identity must NOT include the WidgetController
// instance — eq is content-based per RESEARCH lines 419-421.
//
// Plan 19-04 refines the constructor signature to take an explicit `sourceHash`
// argument so callers can pass a synchronously-computed identity hash (DJB2
// or similar) without the widget recomputing it. The hash for self-write
// suppression remains SHA-1 in DebouncedWriter; the eq() identity uses the
// synchronous hash.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = document.createElement('div');
    state: { doc: { toString: () => string } } = { doc: { toString: () => '' } };
    destroy = vi.fn();
    constructor() { /* no-op */ }
  }
  class WidgetType {
    constructor() { /* no-op base */ }
  }
  return {
    EditorView: MockEditorView,
    WidgetType,
  };
});

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) { this.path = path; }
  }
  const debounce = (cb: (...a: unknown[]) => unknown) => {
    const fn = () => cb();
    return Object.assign(fn, { run: fn, cancel: () => fn });
  };
  return { ...actual, TFile, debounce };
});

// Stub out the heavy mount factory imports so widget construction doesn't
// pull in the entire CM6 + extension stack — eq() is a pure identity check
// that doesn't need a live mount.
vi.mock('../../src/widget/WidgetController', () => ({
  mountLeetCodeWidget: vi.fn(),
}));

import { LeetCodeFenceWidget } from '../../src/widget/LeetCodeFenceWidget';

interface MockPlugin { _id: string }
interface MockFile { path: string }

function makePlugin(id: string): MockPlugin { return { _id: id }; }
function makeFile(path: string): MockFile { return { path }; }

// The Plan 19-04 LeetCodeFenceWidget constructor takes (plugin, file,
// fenceIndex, sourceHash, source). Plan 19-01 passed (plugin, file, fenceIndex,
// source) and computed the hash inline; Plan 19-04 explicitly accepts the
// hash so the Live Preview ViewPlugin can inject a synchronous DJB2 hash.
function makeWidget(
  plugin: unknown,
  file: unknown,
  fenceIndex: number,
  sourceHash: string,
  source: string,
): LeetCodeFenceWidget {
  return new (LeetCodeFenceWidget as unknown as new (
    plugin: unknown,
    file: unknown,
    fenceIndex: number,
    sourceHash: string,
    source: string,
  ) => LeetCodeFenceWidget)(plugin, file, fenceIndex, sourceHash, source);
}

describe('LeetCodeFenceWidget.eq() — content-hash identity (Pitfall 19-F)', () => {
  const plugin = makePlugin('p1');
  const otherPlugin = makePlugin('p2');
  const file = makeFile('LeetCode/two-sum.md');
  const otherFile = makeFile('LeetCode/three-sum.md');

  it('two widgets with identical (plugin, file, fenceIndex, sourceHash) → eq() === true', () => {
    const w1 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    const w2 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    expect(w1.eq(w2)).toBe(true);
  });

  it('same (plugin, file, fenceIndex) → eq() === true even with DIFFERENT sourceHash (Phase 20-09 location-only identity)', () => {
    // Content is NOT part of widget identity. The child editor owns the
    // source of truth in memory; only file.path + fenceIndex determine
    // widget identity. This prevents CM6 from destroying the widget DOM
    // when the parent doc updates (e.g. on disk flush).
    const w1 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    const w2 = makeWidget(plugin, file, 0, 'def67890', 'world');
    expect(w1.eq(w2)).toBe(true);
  });

  it('same file + sourceHash but DIFFERENT fenceIndex → eq() === false', () => {
    const w1 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    const w2 = makeWidget(plugin, file, 1, 'abc12345', 'hello');
    expect(w1.eq(w2)).toBe(false);
  });

  it('DIFFERENT file (other reference) → eq() === false', () => {
    const w1 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    const w2 = makeWidget(plugin, otherFile, 0, 'abc12345', 'hello');
    expect(w1.eq(w2)).toBe(false);
  });

  it('DIFFERENT plugin → eq() === false', () => {
    const w1 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    const w2 = makeWidget(otherPlugin, file, 0, 'abc12345', 'hello');
    expect(w1.eq(w2)).toBe(false);
  });

  it('self-equality — w.eq(w) === true', () => {
    const w = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    expect(w.eq(w)).toBe(true);
  });

  it('eq() does NOT consult any WidgetController instance — two widgets with the same identity tuple but constructed at different times are eq', () => {
    // Construct two widgets with identical identity tuples but in separate
    // instantiation closures; eq must return true regardless of any
    // per-render WidgetController internals.
    const w1 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    const w2 = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    expect(w1.eq(w2)).toBe(true);
    // RESEARCH lines 419-421: eq() MUST be content-based; never per-instance.
    // We assert the same tuple → eq, regardless of `source` parameter
    // identity. Same hash with different `source` literal would only happen
    // on collision, but the contract is hash-based.
  });

  it('compared against a non-LeetCodeFenceWidget (instanceof guard) → eq() === false', () => {
    const w = makeWidget(plugin, file, 0, 'abc12345', 'hello');
    // The widget must defensively return false on instanceof mismatch (not
    // throw), per the eq() pattern from CodeActionsWidget.
    const otherShape = { plugin, file, fenceIndex: 0, sourceHash: 'abc12345' } as never;
    expect(w.eq(otherShape)).toBe(false);
  });
});
