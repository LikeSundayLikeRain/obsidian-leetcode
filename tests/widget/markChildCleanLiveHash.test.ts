// Phase 22 Wave 3 C6b — unit tests for WidgetController.markChildClean(observedHash).
//
// Verifies the live-hash-compare guard introduced in C6b:
//   - HAPPY PATH: live doc === snapshot → returns true, _childDirty cleared.
//   - LIVE DRIFT: live doc has extra chars typed during vault.process await
//     → returns false, _childDirty kept set.
//   - TEARDOWN RACE: view.state.doc.toString() throws → returns false, no throw.
//   - FOLLOW-UP ECHO: after a drift call left dirty=true, a fresh echo whose
//     observedHash matches the now-stable live doc → returns true and clears.
//
// The method under test:
//   async markChildClean(observedHash: string): Promise<boolean>
//
// It accesses only:
//   this.view.state.doc.toString()   — live child fence body
//   this._childDirty                 — internal stored flag
//
// We test via a minimal duck-typed object rather than constructing a full
// WidgetController (which requires a heavy plugin/vault fixture). The object
// binds the real method so the production code path is exercised end-to-end.
// sha1 uses the FNV-1a fallback in happy-dom (no SubtleCrypto) — deterministic.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sha1 } from '../../src/widget/debouncedWriter';
import { WidgetController } from '../../src/widget/WidgetController';

// ---------------------------------------------------------------------------
// Minimal fixture builder
// ---------------------------------------------------------------------------
// We need just enough of WidgetController's instance shape to call
// markChildClean without constructing the full plugin/vault/file graph.
// Approach: create a partial object with the real markChildClean method
// (bound from the class prototype), a real EditorView, and the _childDirty
// field the method mutates. _setChildDirty / childDirty getter are also
// bound so the test can arm/read the flag without peeking at a private name.

interface MinimalController {
  view: EditorView;
  _childDirty: boolean;
  _setChildDirty(v: boolean): void;
  get childDirty(): boolean;
  markChildClean(observedHash: string): Promise<boolean>;
}

function makeView(doc: string): EditorView {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new EditorView({ state: EditorState.create({ doc }), parent: container });
}

function makeController(doc: string): MinimalController {
  const view = makeView(doc);
  // Bind the real instance methods from the prototype but hang them on a
  // plain object so we avoid the full constructor call.
  const obj = Object.create(WidgetController.prototype) as unknown as Record<string, unknown>;
  // Install the only instance fields markChildClean touches.
  obj['view'] = view;
  obj['_childDirty'] = false;
  // writer is needed by the childDirty getter (hasPending / recentlyFlushed).
  // Set to null — the getter short-circuits on _childDirty before reaching
  // the writer union, so null is safe for these tests.
  obj['writer'] = null;
  return obj as unknown as MinimalController;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WidgetController.markChildClean — live-hash guard (C6b)', () => {
  it('HAPPY PATH — live doc matches snapshot → returns true, _childDirty cleared', async () => {
    const doc = 'function solution() {}';
    const ctl = makeController(doc);

    // Arm the dirty flag as the arming listener would.
    ctl._setChildDirty(true);
    expect(ctl.childDirty).toBe(true);

    const observedHash = await sha1(doc);
    const cleared = await ctl.markChildClean(observedHash);

    expect(cleared).toBe(true);
    // _childDirty cleared → childDirty is false (writer is null so the union
    // arms stop at the stored flag).
    expect(ctl.childDirty).toBe(false);
  });

  it('LIVE DRIFT — user typed one char after snapshot; live doc ≠ snapshot → returns false, dirty stays set', async () => {
    const snapshot = 'function solution() {}';
    const liveDoc = 'function solution() {}X'; // one char typed during await
    const ctl = makeController(liveDoc);

    ctl._setChildDirty(true);

    // observedHash is the hash of the snapshot (t0 body that went to disk),
    // NOT the live doc that now has the extra 'X'.
    const observedHash = await sha1(snapshot);
    const cleared = await ctl.markChildClean(observedHash);

    expect(cleared).toBe(false);
    // dirty bit must remain set — next flush will produce a fresh echo.
    expect(ctl.childDirty).toBe(true);
  });

  it('LIVE DRIFT — dirty bit is false to begin with; drift still returns false (idempotency of non-clear)', async () => {
    // Even if _childDirty happens to be false (writer union already drained),
    // a hash mismatch must NOT set it to true or do anything unexpected.
    const snapshot = 'abc';
    const liveDoc = 'abcdef';
    const ctl = makeController(liveDoc);
    // _childDirty starts false; do NOT arm it.

    const observedHash = await sha1(snapshot);
    const cleared = await ctl.markChildClean(observedHash);

    expect(cleared).toBe(false);
    expect(ctl.childDirty).toBe(false); // still false — not flipped to true
  });

  it('TEARDOWN RACE — view.state throws → returns false, does not throw', async () => {
    const doc = 'any';
    const ctl = makeController(doc);
    ctl._setChildDirty(true);

    // Simulate a view in teardown by replacing state with a throwing getter.
    vi.spyOn(ctl.view, 'state', 'get').mockImplementation(() => {
      throw new Error('view already destroyed');
    });

    const observedHash = await sha1(doc);
    // Must not throw — the try/catch inside markChildClean absorbs it.
    await expect(ctl.markChildClean(observedHash)).resolves.toBe(false);
    // dirty bit must remain set — can't confirm safety so keep it.
    expect(ctl._childDirty).toBe(true);
  });

  it('FOLLOW-UP ECHO — after drift left dirty=true, next echo with fresh hash clears it', async () => {
    // Sequence:
    //   t0: writer flushes 'abc', arms suppression with sha1('abc').
    //   t1: user types 'd' → live doc = 'abcd'.
    //   t2: vault.on('modify') fires; observedHash = sha1('abc'); tryConsume
    //       returns 'consumed'; markChildClean('abc-hash') → DRIFT → false.
    //   t3: writer fires again for 'abcd', arms suppression with sha1('abcd').
    //   t4: vault.on('modify') fires; observedHash = sha1('abcd'); tryConsume
    //       returns 'consumed'; markChildClean('abcd-hash') → MATCH → true.

    const docAfterDrift = 'abcd';
    const ctl = makeController(docAfterDrift);
    ctl._setChildDirty(true);

    // t2 call — snapshot 'abc' does NOT match live 'abcd'.
    const staleHash = await sha1('abc');
    const firstResult = await ctl.markChildClean(staleHash);
    expect(firstResult).toBe(false);
    expect(ctl.childDirty).toBe(true); // still dirty

    // t4 call — snapshot 'abcd' matches live 'abcd'.
    const freshHash = await sha1('abcd');
    const secondResult = await ctl.markChildClean(freshHash);
    expect(secondResult).toBe(true);
    expect(ctl.childDirty).toBe(false); // finally cleared
  });

  it('empty doc — sha1("") matches both sides; clears correctly', async () => {
    const ctl = makeController('');
    ctl._setChildDirty(true);

    const observedHash = await sha1('');
    const cleared = await ctl.markChildClean(observedHash);

    expect(cleared).toBe(true);
    expect(ctl.childDirty).toBe(false);
  });
});
