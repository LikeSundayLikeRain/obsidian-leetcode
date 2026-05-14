// Popout-window-safe timer helpers (WR-02).
// Obsidian injects `activeWindow` as the currently-focused window (including
// popouts); its `setTimeout` binds timers to that window's event loop. In
// happy-dom (vitest) `activeWindow` is the global window so the same path
// works for tests too. We always route through `activeWindow.*Timeout` to
// satisfy the obsidianmd/prefer-active-window-timers rule and to keep timers
// wired to the correct event loop when the consumer view moves between the
// main window and a popout. The global is declared in
// `src/types/obsidian-globals.d.ts`.

export type TimerHandle = ReturnType<typeof setTimeout>;

export function setWindowTimeout(fn: () => void, ms: number): TimerHandle {
  return activeWindow.setTimeout(fn, ms) as unknown as TimerHandle;
}

export function clearWindowTimeout(handle: TimerHandle): void {
  activeWindow.clearTimeout(handle as unknown as number);
}
