// src/main/shiftShiftDetector.ts
//
// Pure factory for a "double-shift" keydown handler. Returns a function the
// caller attaches via `Plugin.registerDomEvent(document, 'keydown', handler)`.
//
// Trigger contract:
//   - Two `Shift` keydowns inside `windowMs` (default 300) fire `onTrigger`.
//   - Any non-Shift keydown disarms the sequence (so `Shift, A, Shift` is NOT
//     a trigger; the second Shift starts a fresh window).
//   - `e.repeat === true` (held-down auto-repeat) is ignored — does NOT arm
//     and does NOT trigger.
//   - Any modifier held alongside Shift (`Cmd`, `Ctrl`, `Alt`, `Meta`) is
//     ignored — the user is composing a chord (e.g. `Cmd+Shift+P`), not
//     tapping Shift solo.
//
// Pure relative to `now()`: tests inject a mock clock so timing semantics can
// be exercised without happy-dom event scheduling. Production callers omit
// `now`, defaulting to `Date.now`.

export interface ShiftShiftOptions {
  /** Maximum gap between the two Shift presses, in ms. Default 300. */
  windowMs?: number;
  /** Fired when a valid double-shift is detected. */
  onTrigger: () => void;
  /** Clock injection for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export type ShiftShiftHandler = (e: KeyboardEvent) => void;

export function createShiftShiftDetector(opts: ShiftShiftOptions): ShiftShiftHandler {
  const windowMs = opts.windowMs ?? 300;
  const now = opts.now ?? Date.now;
  let lastShiftAt = 0;

  return (e: KeyboardEvent): void => {
    if (e.repeat) return;

    if (e.key !== 'Shift') {
      // Any other key disarms the pending sequence — `Shift, A, Shift` must
      // not trigger. The next Shift then starts a fresh window.
      lastShiftAt = 0;
      return;
    }

    // Shift pressed alongside another modifier is a chord, not a solo tap.
    if (e.ctrlKey || e.metaKey || e.altKey) {
      lastShiftAt = 0;
      return;
    }

    const t = now();
    if (lastShiftAt !== 0 && t - lastShiftAt <= windowMs) {
      lastShiftAt = 0;
      opts.onTrigger();
      return;
    }
    lastShiftAt = t;
  };
}
