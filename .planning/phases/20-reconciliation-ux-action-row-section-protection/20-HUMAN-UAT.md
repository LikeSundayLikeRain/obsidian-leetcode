---
status: partial
phase: 20-reconciliation-ux-action-row-section-protection
source: [20-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[awaiting human testing]

## Tests

### 1. Vim live-reconfigure dev-vault probe (VIM-02)
expected: Toggle "Vim key bindings" in Obsidian Settings → Editor with a v1.3 widget open. Verify keystrokes route to vim-mode handlers immediately (h/j/k/l navigates) without note reload. Toggle off; verify normal-mode insert restored. Cursor + scroll + undo preserved across the toggle. PASS = clean reconfigure; FAIL = needs Phase 22 VIM-03 banner fallback per CONTEXT L4.
result: [pending]

### 2. atomicRanges cursor-edge cases (PROTECT-01)
expected: Open a v1.3-widget LeetCode note. Exercise four cursor cases — (a) up-arrow into closer line; (b) right-arrow at end of `## Code` heading line; (c) backspace at fence-opener line; (d) type into fence body. Verify cursor jumps over fence body via atomicRanges (cases a, b); fence opener/closer body editable in source mode (case c); fence body atomic when widget mounted (case d).
result: [pending]

### 3. Light/dark theme retheme (THEME-04)
expected: Open a v1.3-widget LeetCode note. Toggle Appearance → Light/Dark. Verify all 8 language packs retheme (token colors, gutter, line-numbers) without note reload. Repeat with a custom community theme installed (e.g., Minimal). Cursor + scroll + undo preserved across retheme.
result: [pending]

### 4. Multi-pane Take-Over CTA promote/demote
expected: Open the same LeetCode note in two split panes. Verify pane B's widget greys out + shows "Click to take over" CTA when pane A is active. Click CTA; verify pane A demotes (greys with CTA) and pane B promotes (editable). L10 single-active baseline preserved — peer panes do NOT live-mirror typing.
result: [pending]

### 5. Obsidian Sync conflict modal end-to-end (SYNC-04, SYNC-05)
expected: Open same vault on two devices via Obsidian Sync. Type in widget on device A; edit fence body in plain editor on device B. Verify modal appears on A within ~1s with "Keep mine / Keep external / View diff". Click "View diff" — modal expands inline to three columns (Mine | External | Merged preview). "Keep mine" → forceFlush rewrites disk. "Keep external" → reload preserves cursor via line/col clamp. Second external edit while modal open updates External pane in place (no second modal stacking).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
