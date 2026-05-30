---
status: complete
phase: 20-reconciliation-ux-action-row-section-protection
source: [20-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[testing complete]

## Tests

### 1. Vim live-reconfigure dev-vault probe (VIM-02)
expected: Toggle "Vim key bindings" in Obsidian Settings → Editor with a v1.3 widget open. Verify keystrokes route to vim-mode handlers immediately (h/j/k/l navigates) without note reload. Toggle off; verify normal-mode insert restored. Cursor + scroll + undo preserved across the toggle. PASS = clean reconfigure; FAIL = needs Phase 22 VIM-03 banner fallback per CONTEXT L4.
result: pass
note: "Acceptable — needs a keystroke or two for new mode to kick in"

### 2. atomicRanges cursor-edge cases (PROTECT-01)
expected: Open a v1.3-widget LeetCode note. Exercise four cursor cases — (a) up-arrow into closer line; (b) right-arrow at end of `## Code` heading line; (c) backspace at fence-opener line; (d) type into fence body. Verify cursor jumps over fence body via atomicRanges (cases a, b); fence opener/closer body editable in source mode (case c); fence body atomic when widget mounted (case d).
result: issue
reported: "for a and b, it actually turns into source mode instead of jump over"
severity: major

### 3. Light/dark theme retheme (THEME-04)
expected: Open a v1.3-widget LeetCode note. Toggle Appearance → Light/Dark. Verify all 8 language packs retheme (token colors, gutter, line-numbers) without note reload. Repeat with a custom community theme installed (e.g., Minimal). Cursor + scroll + undo preserved across retheme.
result: issue
reported: "Theme retheme looks good for Java (current language), but the language switch is broken — looks like it hasn't been wired up. Couldn't verify all 8 language packs."
severity: major
note: "Java retheme passes; full 8-pack coverage blocked by separate language-switch bug"

### 4. Multi-pane Take-Over CTA promote/demote
expected: Open the same LeetCode note in two split panes. Verify pane B's widget greys out + shows "Click to take over" CTA when pane A is active. Click CTA; verify pane A demotes (greys with CTA) and pane B promotes (editable). L10 single-active baseline preserved — peer panes do NOT live-mirror typing.
result: issue
reported: "When left is active, right pane shows CTA correctly. But when right is active, left doesn't show CTA (asymmetric). Also: typing in either pane flashes — keep trying to add and remove the widget."
severity: blocker

### 5. Obsidian Sync conflict modal end-to-end (SYNC-04, SYNC-05)
expected: Open same vault on two devices via Obsidian Sync. Type in widget on device A; edit fence body in plain editor on device B. Verify modal appears on A within ~1s with "Keep mine / Keep external / View diff". Click "View diff" — modal expands inline to three columns (Mine | External | Merged preview). "Keep mine" → forceFlush rewrites disk. "Keep external" → reload preserves cursor via line/col clamp. Second external edit while modal open updates External pane in place (no second modal stacking).
result: skipped
reason: "User does not have Obsidian Sync subscription — cannot exercise multi-device flow."

## Summary

total: 5
passed: 1
issues: 3
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Cursor jumps over fence body via atomicRanges when navigating with arrow keys (cases a, b)"
  status: failed
  reason: "User reported: for a and b, it actually turns into source mode instead of jump over"
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Language switch wired up so user can verify retheme across all 8 language packs"
  status: failed
  reason: "User reported: language switch is broken — looks like it hasn't been wired up. Java retheme alone looked good, but couldn't exercise the other 7 packs."
  severity: major
  test: 3
  artifacts: []
  missing: []

- truth: "Multi-pane CTA is symmetric: each non-active pane greys + shows 'Click to take over' regardless of which pane is active"
  status: failed
  reason: "User reported: when left is active, right pane shows CTA correctly; when right is active, left does NOT show CTA — asymmetric promote/demote handler."
  severity: blocker
  test: 4
  artifacts: []
  missing: []

- truth: "Typing in active pane is stable — widget does not unmount/remount on each keystroke"
  status: failed
  reason: "User reported: typing in either pane flashes — widget keeps trying to add and remove. Indicates widget thrash on edit (likely re-decorate loop or active-pane recompute on every transaction)."
  severity: blocker
  test: 4
  artifacts: []
  missing: []
