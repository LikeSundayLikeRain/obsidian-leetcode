// Popout-window-safe timer helpers (WR-02).
// Obsidian injects `activeWindow` as the currently-focused window (including
// popouts); its `setTimeout` binds timers to that window's event loop.
// In Node-hosted unit tests `activeWindow` is undefined, so we fall back to
// the platform `setTimeout`. Resolution happens per-call so that vitest's
// `useFakeTimers()` (which swaps the platform timer functions after module
// load) still works, and so that a view that moves between the main window
// and a popout still wires its timers into the right loop.
declare const activeWindow: Window | undefined;

export type TimerHandle = ReturnType<typeof setTimeout>;

export function setWindowTimeout(fn: () => void, ms: number): TimerHandle {
  if (typeof activeWindow !== 'undefined' && activeWindow) {
    return activeWindow.setTimeout(fn, ms) as unknown as TimerHandle;
  }
  // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- test fallback; activeWindow branch is the runtime path
  return setTimeout(fn, ms);
}

export function clearWindowTimeout(handle: TimerHandle): void {
  if (typeof activeWindow !== 'undefined' && activeWindow) {
    activeWindow.clearTimeout(handle as unknown as number);
    return;
  }
  // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- test fallback; activeWindow branch is the runtime path
  clearTimeout(handle);
}
