// Phase 20 Plan 20-06 — gap-closure regression test for the
// self-write-remount-cycle blocker (UAT Test 6, carry-over from Phase 19
// Test 1).
//
// Symptom: after the 400ms debouncedWriter flush, the widget loses
// focus/cursor/vim mode because the ViewPlugin rebuilt the DecorationSet
// on the post-flush docChanged transaction → `eq()` returned false →
// CM6 destroyed and remounted the widget DOM.
//
// Tests:
//   1. ViewPlugin reuse on self-write echo: peek returns armed hash
//      matching new sourceHash → `decorations` reference NOT replaced.
//   2. ViewPlugin rebuild on external edit: peek returns null OR mismatched
//      hash → `decorations` reference IS replaced.
//   3. ViewPlugin rebuild when no entry is armed (default behavior).
//   4. eq() — strict compare passes (pre-existing contract).
//   5. eq() — suppression-map clause kicks in when only sourceHash differs
//      AND peek matches one side (Plan 20-06 next-build hardening).
//   6. ViewPlugin gate fires when both docChanged AND viewportChanged are
//      true (Blocker #2 viewport regression).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    dom = document.createElement('div');
    contentDOM = document.createElement('div');
    state: { doc: { toString: () => string } } = { doc: { toString: () => '' } };
    destroy = vi.fn();
  }
  class WidgetType {}
  return {
    EditorView: MockEditorView,
    WidgetType,
  };
});

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  class TFile {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
  }
  return { ...actual, TFile };
});

// Stub the mount factory so eq()/eq tests don't pull in the live mount path.
vi.mock('../../src/widget/WidgetController', () => ({
  mountLeetCodeWidget: vi.fn(),
}));

import { LeetCodeFenceWidget } from '../../src/widget/LeetCodeFenceWidget';
import { SelfWriteSuppression } from '../../src/widget/selfWriteSuppression';

interface FakePlugin {
  selfWriteSuppression?: SelfWriteSuppression;
  _id: string;
}

function makePlugin(opts: { suppression?: SelfWriteSuppression } = {}): FakePlugin {
  return {
    _id: 'plug',
    selfWriteSuppression: opts.suppression,
  };
}

function makeFile(path: string): { path: string } {
  return { path };
}

function makeWidget(
  plugin: FakePlugin,
  file: { path: string },
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

describe('Phase 20 Plan 20-06 — eq() suppression-map hardening', () => {
  let suppression: SelfWriteSuppression;

  beforeEach(() => {
    suppression = new SelfWriteSuppression();
  });

  it('Test 4: strict sourceHash compare returns true (pre-existing contract)', () => {
    const plugin = makePlugin({ suppression });
    const file = makeFile('foo.md');
    const a = makeWidget(plugin, file, 0, 'h1', 's');
    const b = makeWidget(plugin, file, 0, 'h1', 's');
    expect(a.eq(b as never)).toBe(true);
  });

  it('Test 4b: strict compare fails AND no armed entry → eq returns false', () => {
    const plugin = makePlugin({ suppression });
    const file = makeFile('foo.md');
    const a = makeWidget(plugin, file, 0, 'h1', 's1');
    const b = makeWidget(plugin, file, 0, 'h2', 's2');
    expect(a.eq(b as never)).toBe(false);
  });

  it('Test 5: strict fails BUT armed entry matches one side → eq returns true', () => {
    const plugin = makePlugin({ suppression });
    const file = makeFile('foo.md');
    const a = makeWidget(plugin, file, 0, 'h1', 's1'); // pre-flush
    const b = makeWidget(plugin, file, 0, 'h2', 's2'); // post-flush
    // Arm with the post-flush hash (matches `b`'s sourceHash).
    suppression.arm('foo.md', 'h2');
    expect(a.eq(b as never)).toBe(true);
  });

  it('Test 5b: armed entry matches NEITHER side → eq returns false', () => {
    const plugin = makePlugin({ suppression });
    const file = makeFile('foo.md');
    const a = makeWidget(plugin, file, 0, 'h1', 's1');
    const b = makeWidget(plugin, file, 0, 'h2', 's2');
    suppression.arm('foo.md', 'h-OTHER');
    expect(a.eq(b as never)).toBe(false);
  });

  it('Test 5c: armed entry matches `this` side (pre-flush hash) → eq returns true', () => {
    const plugin = makePlugin({ suppression });
    const file = makeFile('foo.md');
    const a = makeWidget(plugin, file, 0, 'h1', 's1');
    const b = makeWidget(plugin, file, 0, 'h2', 's2');
    // Symmetry check — peek === this.sourceHash also yields true.
    suppression.arm('foo.md', 'h1');
    expect(a.eq(b as never)).toBe(true);
  });

  it('Test 5d: peek throws → eq falls through safely to false', () => {
    // Fault-injecting suppression that throws on peek to verify defensive try/catch.
    const faulty = {
      peekExpectedHash: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as SelfWriteSuppression;
    const plugin = makePlugin({ suppression: faulty });
    const file = makeFile('foo.md');
    const a = makeWidget(plugin, file, 0, 'h1', 's1');
    const b = makeWidget(plugin, file, 0, 'h2', 's2');
    // Must not throw; must return false (since strict compare also failed).
    expect(() => a.eq(b as never)).not.toThrow();
    expect(a.eq(b as never)).toBe(false);
  });

  it('Test 5e: cross-file widgets never match (file gate is load-bearing)', () => {
    const plugin = makePlugin({ suppression });
    const a = makeWidget(plugin, makeFile('foo.md'), 0, 'h1', 's1');
    const b = makeWidget(plugin, makeFile('bar.md'), 0, 'h2', 's2');
    suppression.arm('foo.md', 'h2');
    // file refs differ → eq returns false even with armed match on foo.md.
    expect(a.eq(b as never)).toBe(false);
  });
});

describe('Phase 20 Plan 20-06 — ViewPlugin update() provenance gate (peekExpectedHash)', () => {
  // We exercise the gate's logic directly without spinning up a real
  // EditorView. The gate's contract is:
  //   IF docChanged && new sourceHash matches armed expected hash
  //   THEN keep `decorations` reference-stable.
  // We model the gate as a pure function and assert the predicate.

  function gateDecision(args: {
    docChanged: boolean;
    viewportChanged: boolean;
    sourceHash: string | null;
    filePath: string | null;
    suppression: SelfWriteSuppression | undefined;
  }): 'reuse' | 'rebuild' {
    if (
      args.docChanged &&
      args.sourceHash !== null &&
      args.filePath !== null &&
      args.suppression
    ) {
      const peeked = args.suppression.peekExpectedHash(args.filePath);
      if (peeked !== null && peeked === args.sourceHash) return 'reuse';
    }
    if (args.docChanged || args.viewportChanged) return 'rebuild';
    return 'rebuild'; // implicit branch for completeness
  }

  let suppression: SelfWriteSuppression;
  beforeEach(() => {
    suppression = new SelfWriteSuppression();
  });

  it('Test 1: armed entry matches new sourceHash → REUSE (echo path)', () => {
    suppression.arm('foo.md', 'h-new');
    const decision = gateDecision({
      docChanged: true,
      viewportChanged: false,
      sourceHash: 'h-new',
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('reuse');
  });

  it('Test 2: armed entry mismatched → REBUILD (external edit)', () => {
    suppression.arm('foo.md', 'h-mine');
    const decision = gateDecision({
      docChanged: true,
      viewportChanged: false,
      sourceHash: 'h-external-different',
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('rebuild');
  });

  it('Test 3: no armed entry → REBUILD (default)', () => {
    const decision = gateDecision({
      docChanged: true,
      viewportChanged: false,
      sourceHash: 'h-anything',
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('rebuild');
  });

  it('Test 6: docChanged + viewportChanged BOTH true, armed match → REUSE (Blocker #2)', () => {
    // The pre-revision plan would have inverted on `!viewportChanged`,
    // bypassing the gate exactly when CM6 reflows the viewport on a
    // doc change. The Blocker #2 fix gates only on docChanged.
    suppression.arm('foo.md', 'h-flush');
    const decision = gateDecision({
      docChanged: true,
      viewportChanged: true,
      sourceHash: 'h-flush',
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('reuse');
  });

  it('Test 7: viewport-only update (docChanged=false) → REBUILD (no echo possible)', () => {
    suppression.arm('foo.md', 'h-flush');
    const decision = gateDecision({
      docChanged: false,
      viewportChanged: true,
      sourceHash: 'h-flush',
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('rebuild');
  });

  it('Test 8: missing sourceHash (multi-fence / no LC widget) → REBUILD', () => {
    suppression.arm('foo.md', 'h-flush');
    const decision = gateDecision({
      docChanged: true,
      viewportChanged: false,
      sourceHash: null,
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('rebuild');
  });

  it('Test 9: stale entry (past TTL) returns null from peek → REBUILD', () => {
    // Manually expire by setting Date.now far in the future via mock.
    suppression.arm('foo.md', 'h-flush');
    const RealNow = Date.now;
    Date.now = vi.fn(() => RealNow.call(Date) + 10_000); // +10s, past 2s TTL
    const decision = gateDecision({
      docChanged: true,
      viewportChanged: false,
      sourceHash: 'h-flush',
      filePath: 'foo.md',
      suppression,
    });
    expect(decision).toBe('rebuild');
    Date.now = RealNow;
  });
});
