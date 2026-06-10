// Phase 22 Wave 3 C6d — Lens 2 Variant 2 regression: safety timer is a
// sliding window, NOT a one-shot.
//
// The naive design armed a single setTimeout at t=0. Continuous typing past
// the TTL would therefore clear _childDirty even while the user was still
// actively typing, opening a reload-silent window that could clobber chars
// typed between the timer fire and the next flush.
//
// The revised design (C6d) cancels the pending timer and re-arms a FRESH
// one on every markChildDirty() call. Only a full WIDGET_DIRTY_SAFETY_TTL_MS
// of idle after the LAST keystroke triggers the auto-clear.
//
// These tests fail on the naive (one-shot) implementation and pass on the
// revised sliding-window implementation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return { ...actual };
});

import { SELF_WRITE_SUPPRESSION_TTL_MS } from '../../src/widget/selfWriteSuppression';
import { WIDGET_DIRTY_SAFETY_TTL_MS, WidgetController } from '../../src/widget/WidgetController';
import { Compartment } from '@codemirror/state';

// ---------------------------------------------------------------------------
// Minimal controller factory (no real CM6 EditorView needed)
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
  const fakeFile = { path: 'test/two-sum.md' } as never;
  const fakePlugin = {
    app: {
      vault: {},
      metadataCache: { getFileCache: () => null },
    },
    lcSettings: { getIndentSizeOverride: () => 4 as const },
  } as never;
  const vimComp = new Compartment();
  return new WidgetController(fakeView, fakeContainer, fakeFile, 0, fakePlugin, vimComp, false);
}

// ---------------------------------------------------------------------------
// Sliding-window safety timer regression tests
// ---------------------------------------------------------------------------

describe('Lens 2 Variant 2 — safety timer slides on every keystroke (C6d regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('type at t=0, retype at t=1500 → original t=2000 fire does NOT clear dirty', () => {
    const ctl = makeMinimalController();

    // t=0: first keystroke
    ctl.markChildDirty();
    expect(ctl.childDirty).toBe(true);

    // t=1500: still inside TTL, user types again → timer re-armed to t=3500
    vi.advanceTimersByTime(1500);
    expect(ctl.childDirty).toBe(true);
    ctl.markChildDirty(); // re-arm

    // t=2001: the ORIGINAL (naive) timer would have fired here.
    // With the sliding window this point is still BEFORE the re-armed TTL.
    vi.advanceTimersByTime(501); // total = 2001ms
    // Dirty MUST still be true — the re-armed timer has not fired yet.
    expect(ctl.childDirty).toBe(true);
  });

  it('after re-arm at t=1500, dirty clears only at t=3501 (full TTL after last keystroke)', () => {
    const ctl = makeMinimalController();

    ctl.markChildDirty(); // t=0
    vi.advanceTimersByTime(1500);
    ctl.markChildDirty(); // re-arm at t=1500 → timer now ends at t=3500

    // t=3499: one ms before the re-armed TTL fires
    vi.advanceTimersByTime(1999); // total = 3499ms
    expect(ctl.childDirty).toBe(true);

    // t=3501: past the re-armed TTL — should now be clear
    vi.advanceTimersByTime(2); // total = 3501ms
    expect(ctl.childDirty).toBe(false);
  });

  it('three keystrokes chain; dirty clears only after TTL from the LAST keystroke', () => {
    const ctl = makeMinimalController();

    ctl.markChildDirty(); // t=0
    vi.advanceTimersByTime(500);
    ctl.markChildDirty(); // t=500
    vi.advanceTimersByTime(500);
    ctl.markChildDirty(); // t=1000 — last keystroke; timer set for t=3000

    // t=2999: just before the last-keystroke TTL
    vi.advanceTimersByTime(1999); // total = 2999ms
    expect(ctl.childDirty).toBe(true);

    // t=3001: past the final TTL
    vi.advanceTimersByTime(2); // total = 3001ms
    expect(ctl.childDirty).toBe(false);
  });

  it('idle past TTL from the ONLY keystroke clears dirty (non-sliding baseline)', () => {
    const ctl = makeMinimalController();

    ctl.markChildDirty(); // t=0 — no re-arm

    vi.advanceTimersByTime(SELF_WRITE_SUPPRESSION_TTL_MS - 1);
    expect(ctl.childDirty).toBe(true);

    vi.advanceTimersByTime(2); // just past TTL
    expect(ctl.childDirty).toBe(false);
  });

  it('WIDGET_DIRTY_SAFETY_TTL_MS equals SELF_WRITE_SUPPRESSION_TTL_MS (hard-link invariant)', () => {
    // If these drift, a slow modify event arriving inside the suppression
    // window would find _childDirty already false and incorrectly route as
    // external — potentially destroying in-flight chars.
    expect(WIDGET_DIRTY_SAFETY_TTL_MS).toBe(SELF_WRITE_SUPPRESSION_TTL_MS);
  });
});
