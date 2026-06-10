// Phase 22 Wave 3 C6d — sliding-window safety timer + hard-linked TTL tests.
//
// Coverage:
//   (a) Hard-link invariant: WIDGET_DIRTY_SAFETY_TTL_MS === SELF_WRITE_SUPPRESSION_TTL_MS
//   (b) Sliding window: re-arm at t=1500 prevents clearing at t=2001
//   (c) Idle past TTL clears _childDirty
//   (d) markChildClean cancels the pending timer (no late-fire)
//   (e) destroy() cancels the pending timer
//
// Fake-timer pattern matches tests/throttle.test.ts (vi.useFakeTimers in
// beforeEach, vi.useRealTimers in afterEach, vi.advanceTimersByTime to step).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF_WRITE_SUPPRESSION_TTL_MS } from '../../src/widget/selfWriteSuppression';
import {
  WIDGET_DIRTY_SAFETY_TTL_MS,
  WidgetController,
} from '../../src/widget/WidgetController';
import { Compartment } from '@codemirror/state';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

// ---------------------------------------------------------------------------
// Minimal controller factory
//
// Constructs a WidgetController with the smallest possible stub surface so the
// dirty-bit + safety-timer methods can be exercised in isolation. No real CM6
// EditorView is needed — destroy() only uses view.destroy(), so a { destroy()
// {} } fake is sufficient. markChildClean uses view.state.doc.toString() to
// compute the live hash; we provide a deterministic empty-string doc so the
// sha1 can be matched in tests that exercise the clean path.
// ---------------------------------------------------------------------------

function makeMinimalController(): WidgetController {
  const fakeView = {
    state: { doc: { toString: () => '' } },
    destroy: vi.fn(),
    scrollDOM: document.createElement('div'),
    contentDOM: document.createElement('div'),
    dom: document.createElement('div'),
  } as never;
  const fakeContainer = document.createElement('div');
  const fakeFile = { path: 'test/note.md' } as never;
  const fakePlugin = {
    app: {
      vault: {},
      metadataCache: { getFileCache: () => null },
    },
    lcSettings: { getIndentSizeOverride: () => 4 as const },
  } as never;
  const vimComp = new Compartment();
  return new WidgetController(
    fakeView,
    fakeContainer,
    fakeFile,
    0,
    fakePlugin,
    vimComp,
    false,
  );
}

// ---------------------------------------------------------------------------
// Invariant test — no fake timers needed
// ---------------------------------------------------------------------------

describe('WIDGET_DIRTY_SAFETY_TTL_MS hard-link invariant (C6d)', () => {
  it('MUST equal SelfWriteSuppression TTL — drift hazard', () => {
    expect(WIDGET_DIRTY_SAFETY_TTL_MS).toBe(SELF_WRITE_SUPPRESSION_TTL_MS);
  });
});

// ---------------------------------------------------------------------------
// Sliding-window + timer tests — vi.useFakeTimers
// ---------------------------------------------------------------------------

describe('WidgetController._childDirty sliding-window safety timer (C6d)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('continuous typing past 2s does NOT clear _childDirty (sliding window)', () => {
    const ctl = makeMinimalController();
    ctl.markChildDirty(); // t=0
    expect(ctl.childDirty).toBe(true);

    vi.advanceTimersByTime(1500); // t=1500 — still inside TTL
    expect(ctl.childDirty).toBe(true);

    ctl.markChildDirty(); // re-arm — sliding window resets to TTL from NOW
    vi.advanceTimersByTime(501); // t=2001 — would have fired without the re-arm
    expect(ctl.childDirty).toBe(true); // still dirty (re-armed at t=1500)

    vi.advanceTimersByTime(1500); // t=3501 — past TTL since the last markChildDirty
    expect(ctl.childDirty).toBe(false); // now cleared
  });

  it('idle past TTL clears _childDirty', () => {
    const ctl = makeMinimalController();
    ctl.markChildDirty();

    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS - 1);
    expect(ctl.childDirty).toBe(true);

    vi.advanceTimersByTime(2); // just past TTL
    expect(ctl.childDirty).toBe(false);
  });

  it('markChildClean cancels the pending safety timer (no late-fire leak)', async () => {
    const ctl = makeMinimalController();
    ctl.markChildDirty();

    // sha1('') — precomputed to allow markChildClean's live-hash compare to
    // succeed. The fake view's doc.toString() returns '' so liveHash === this.
    const emptyStrSha1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
    const cleared = await ctl.markChildClean(emptyStrSha1);
    expect(cleared).toBe(true);
    expect(ctl.childDirty).toBe(false);

    // Advance well past TTL — the timer must NOT have re-cleared (already null).
    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS + 100);
    expect(ctl.childDirty).toBe(false); // no spurious flip

    // Re-marking dirty after clean works — the cancelled timer leaves no orphan.
    ctl.markChildDirty();
    expect(ctl.childDirty).toBe(true);
    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS + 1);
    expect(ctl.childDirty).toBe(false); // fresh timer fires correctly
  });

  it('destroy() cancels the pending safety timer', () => {
    const ctl = makeMinimalController();
    ctl.markChildDirty();
    expect(ctl.childDirty).toBe(true);

    ctl.destroy();
    // Advance past TTL — no throw, no late timer fire after destroy.
    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS + 100);
    // Implicit assertion: vi did not blow up; _childDirty is false (cleared
    // synchronously by destroy before clearTimeout).
    expect(ctl.childDirty).toBe(false);
  });
});
