// tests/main/shiftShiftDetector.test.ts
//
// Pure unit tests for the double-shift keydown detector. The factory takes a
// mock `now()` so we can advance time deterministically without happy-dom.
import { describe, it, expect, vi } from 'vitest';
import { createShiftShiftDetector } from '../../src/main/shiftShiftDetector';

function ev(
  key: string,
  opts: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  return {
    key,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: key === 'Shift',
    ...opts,
  } as unknown as KeyboardEvent;
}

describe('createShiftShiftDetector', () => {
  it('fires onTrigger when two Shift presses land inside the window', () => {
    const onTrigger = vi.fn();
    let t = 1000;
    const handler = createShiftShiftDetector({ windowMs: 300, now: () => t, onTrigger });

    handler(ev('Shift'));
    expect(onTrigger).not.toHaveBeenCalled();

    t += 200; // inside the 300ms window
    handler(ev('Shift'));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the second Shift is past the window', () => {
    const onTrigger = vi.fn();
    let t = 1000;
    const handler = createShiftShiftDetector({ windowMs: 300, now: () => t, onTrigger });

    handler(ev('Shift'));
    t += 500; // outside the window
    handler(ev('Shift'));
    expect(onTrigger).not.toHaveBeenCalled();

    // The late press should re-arm the window — a follow-up tap inside 300ms
    // now triggers.
    t += 100;
    handler(ev('Shift'));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('disarms when a non-Shift key arrives between the two Shifts', () => {
    const onTrigger = vi.fn();
    let t = 1000;
    const handler = createShiftShiftDetector({ windowMs: 300, now: () => t, onTrigger });

    handler(ev('Shift'));
    t += 50;
    handler(ev('a'));
    t += 50;
    handler(ev('Shift'));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('ignores Shift presses with other modifiers held (chord, not solo tap)', () => {
    const onTrigger = vi.fn();
    let t = 1000;
    const handler = createShiftShiftDetector({ windowMs: 300, now: () => t, onTrigger });

    // Cmd+Shift while composing Cmd+Shift+P should not arm the detector.
    handler(ev('Shift', { metaKey: true }));
    t += 50;
    handler(ev('Shift'));
    expect(onTrigger).not.toHaveBeenCalled();

    // Likewise Ctrl+Shift and Alt+Shift.
    handler(ev('Shift', { ctrlKey: true }));
    t += 50;
    handler(ev('Shift', { altKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('ignores keydown events with repeat=true (held-down auto-repeat)', () => {
    const onTrigger = vi.fn();
    let t = 1000;
    const handler = createShiftShiftDetector({ windowMs: 300, now: () => t, onTrigger });

    // First press arms the detector.
    handler(ev('Shift'));
    // OS auto-repeat keeps firing keydown with repeat=true — must NOT count
    // as the second press.
    t += 50;
    handler(ev('Shift', { repeat: true }));
    expect(onTrigger).not.toHaveBeenCalled();

    // A real second press inside the window does trigger.
    t += 50;
    handler(ev('Shift'));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('uses a 300ms default window when windowMs is omitted', () => {
    const onTrigger = vi.fn();
    let t = 1000;
    const handler = createShiftShiftDetector({ now: () => t, onTrigger });

    handler(ev('Shift'));
    t += 299;
    handler(ev('Shift'));
    expect(onTrigger).toHaveBeenCalledTimes(1);

    t += 1000;
    handler(ev('Shift'));
    t += 301;
    handler(ev('Shift'));
    // No new trigger past the 300ms default.
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });
});
