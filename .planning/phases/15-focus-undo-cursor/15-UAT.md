---
status: partial
phase: 15-focus-undo-cursor
source: [15-VERIFICATION.md, 15-03-PLAN.md]
started: 2026-05-22
updated: 2026-05-22
---

## Tests

### 1. Tab indent (SC-2)
expected: Tab inserts 4 spaces, Shift-Tab dedents, multi-line indent works
result: pass
note: Tab indents whole line regardless of cursor position (matches D-05 "always indents"). User noted this differs from VS Code insert-at-cursor behavior. Design decision — not a bug.

### 2. Undo isolation (SC-3)
expected: Cmd-Z in child undoes child only; Cmd-Z in parent undoes parent only
result: pass

### 3. Focus retention (SC-1)
expected: Click Run button — cursor stays in child editor
result: fail
note: After clicking Run, focus leaves the child editor. User must re-click to type. mousedown preventDefault is in place but the run action itself (panel open / UI update) likely moves focus elsewhere.

### 4. Auto-grow (SC-4)
expected: No inner scrollbar on 20+ lines, note scrolls as one document
result: pass

### 5. Scroll-into-view (SC-4)
expected: Typing at bottom of code area auto-scrolls parent to keep cursor visible
result: pass

### 6. No Escape exit (SC-5 / D-03)
expected: Escape in child editor does nothing
result: not-tested
note: Skipped — user has Vim mode enabled which uses Escape for mode switching. Cannot test D-03 isolation.

### 7. Vim ghost text (edge case)
expected: No visual artifacts in child editor area
result: fail
note: With Vim enabled, typed text appears duplicated below the code block in a parent line area (showing parent line numbers). Disappears on Escape (Vim normal mode). Likely overflow:visible on .cm-scroller making hidden fence lines leak through in Vim insert mode. Phase 17 scope (edge cases & plugin interactions).

## Summary

total: 7
passed: 4
issues: 2
pending: 0
skipped: 1
blocked: 0

## Gaps

### GAP-1: Focus retention after Run/Submit
severity: medium
description: mousedown preventDefault correctly prevents button from taking focus, but runFromActive() triggers UI changes (result panel) that steal focus from child editor. Need to refocus child after action completes.
fix_scope: Phase 15 (gap closure)

### GAP-2: Vim mode ghost text
severity: low
description: overflow:visible on .cm-scroller causes hidden fence lines to leak through visually when Vim insert mode is active. Vim overrides height/display on CM6 lines.
fix_scope: Phase 17 (Polish & Edge Cases — Vim support listed as deferred)
