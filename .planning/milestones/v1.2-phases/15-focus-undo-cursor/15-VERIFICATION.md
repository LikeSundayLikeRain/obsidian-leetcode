---
phase: 15-focus-undo-cursor
verified: 2026-05-22T07:05:00Z
status: passed
score: 5/5
overrides_applied: 1
gaps: []
overrides:
  - truth: "Escape in the child editor returns focus to the parent (accessibility escape hatch)"
    override: "accepted"
    reason: "CONTEXT.md D-03 (locked decision from discuss-phase) explicitly states: 'No Escape key exit hatch. Escape does nothing in the child editor — matches Obsidian and LeetCode web behavior.' This supersedes the ROADMAP SC #5 which was written before the discuss-phase decision. Users click to move focus elsewhere."
human_verification:
  - test: "Escape key in child editor (without Vim mode)"
    expected: "Either returns focus to parent (per SC) or does nothing (per D-03 decision)"
    why_human: "UAT was skipped due to Vim mode; cannot verify programmatically whether Escape should be implemented or the D-03 override applies"
---

# Phase 15: Focus, Undo & Cursor Verification Report

**Phase Goal:** Seamless user experience -- clicking into the child editor, pressing Tab, using Cmd-Z, clicking back to markdown, and using Run/Submit all work correctly without focus confusion
**Verified:** 2026-05-22T07:05:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking into child editor gives focus; clicking Notes returns focus to parent; Run/Submit work in both states | VERIFIED | `ignoreEvent(): true` in CodeActionsWidget prevents parent focus steal; mousedown preventDefault on all 3 buttons; runFromActive/submitFromActive called on click; browser-native blur handles click-out per D-01 |
| 2 | Tab indents code (not focus-nav); Shift-Tab dedents; multi-line indent as single undo | VERIFIED | `indentWithTab` is first entry in `keymap.of()` array in childEditorFactory.ts:50; `indentUnit.of("    ")` at line 49; tests confirm priority (164-176 in test file) |
| 3 | Cmd-Z in child undoes last child edit; parent reflects undo via sync | VERIFIED | `history()` configured in child; `Transaction.addToHistory.of(false)` on both parent dispatch sites (2 occurrences in childEditorSync.ts); parent undo stack excludes child-sync changes |
| 4 | Child editor auto-grows with content (no inner scrollbar); parent scrolls as unified document | VERIFIED | CSS `overflow: visible !important` on `.cm-editor .lc-nested-editor .cm-scroller` (styles.css:1923-1924); `height: auto !important; max-height: none !important` on `.cm-editor .lc-nested-editor .cm-editor` (styles.css:1906-1907); `createScrollIntoViewExtension()` wired in childEditorFactory.ts:67 |
| 5 | Escape in child editor returns focus to parent (accessibility escape hatch) | FAILED | No Escape key binding exists in childEditorFactory.ts keymap. D-03 decision in 15-CONTEXT.md explicitly chose "No Escape key exit hatch." UAT skipped this check (Vim mode). |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/childEditorFactory.ts` | indentWithTab keymap + indentUnit facet + createScrollIntoViewExtension | VERIFIED | All three present: indentWithTab at line 22/50, indentUnit at line 19/49, createScrollIntoViewExtension at line 24/67 |
| `src/main/childEditorSync.ts` | addToHistory:false on all parent dispatches + createScrollIntoViewExtension | VERIFIED | 2x `Transaction.addToHistory.of(false)` at lines 111 and 161; `createScrollIntoViewExtension` exported at line 305 |
| `src/main/codeBlockButtonRow.ts` | mousedown preventDefault on all action buttons | VERIFIED | 3x mousedown handlers at lines 51-53, 64-66, 77-79 |
| `styles.css` | Auto-grow CSS for nested editor | VERIFIED | overflow:visible at line 1923-1924; height:auto at lines 1906-1907 |
| `src/main/codeActionsEditorExtension.ts` | ignoreEvent():true on CodeActionsWidget | VERIFIED | Line 158: `ignoreEvent(): boolean { return true; }` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| childEditorFactory.ts | @codemirror/commands | `indentWithTab` import | WIRED | Line 22: `import { history, indentWithTab, defaultKeymap, historyKeymap }` |
| childEditorFactory.ts | @codemirror/language | `indentUnit` import | WIRED | Line 19: `indentUnit` in language import destructure |
| childEditorSync.ts | @codemirror/state | `Transaction.addToHistory` annotation | WIRED | Transaction imported at line 18; used in annotation arrays at lines 111, 161 |
| childEditorFactory.ts | childEditorSync.ts | `createScrollIntoViewExtension` import | WIRED | Line 24: `import { createScrollIntoViewExtension } from './childEditorSync'`; called at line 67 |
| codeBlockButtonRow.ts | DOM mousedown event | addEventListener('mousedown') | WIRED | 3 handlers at lines 51, 64, 77; all call `e.preventDefault()` |
| styles.css | .lc-nested-editor .cm-scroller | CSS overflow rule | WIRED | Line 1923: `overflow: visible !important` |

### Data-Flow Trace (Level 4)

Not applicable -- these artifacts are editor configuration (keymaps, CSS, annotations), not data-rendering components.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All tests pass | `npm test -- --run` | 1528 passed, 3 skipped | PASS |
| TypeScript compiles | `npx tsc --noEmit --skipLibCheck` | Exit 0, no output | PASS |
| indentWithTab in factory | `grep -c "indentWithTab" src/main/childEditorFactory.ts` | 2 (import + usage) | PASS |
| addToHistory isolation | `grep -c "addToHistory.of(false)" src/main/childEditorSync.ts` | 2 (both dispatch sites) | PASS |
| mousedown on buttons | `grep -c "mousedown" src/main/codeBlockButtonRow.ts` | 3 (one per button) | PASS |
| userEvent preserved | `grep -c "Transaction.userEvent.of('leetcode.child-sync')" src/main/childEditorSync.ts` | 2 (not lost) | PASS |
| No debt markers | `grep -E "TBD\|FIXME\|XXX\|TODO" (all modified files)` | 0 matches | PASS |

### Probe Execution

Step 7c: SKIPPED (no conventional probes found; no probe scripts declared in plans)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INDENT-01 | 15-01 | Tab inserts indentation in child editor | SATISFIED | indentWithTab keymap wired as first entry; test at line 164 confirms |
| INDENT-02 | 15-01 | Shift-Tab removes indentation | SATISFIED | indentWithTab provides both Tab and Shift-Tab; CM6 builtin behavior |
| INDENT-03 | 15-01 | Multi-line select + Tab indents all as single undo | SATISFIED | CM6 native grouping with indentWithTab; D-06 confirms |
| INDENT-04 | 15-01 | Indent unit respects active language (4 spaces default) | SATISFIED (partial) | `indentUnit.of("    ")` present; dynamic per-language deferred to Phase 16 per plan |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | - |

No debt markers (TBD, FIXME, XXX, TODO, HACK, PLACEHOLDER) found in any modified file.

### Human Verification Required

### 1. Escape key behavior (without Vim mode)

**Test:** Disable Vim mode in Obsidian, open an lc-slug note, click into the child code editor, press Escape
**Expected:** Either focus returns to parent (per ROADMAP SC #5) or nothing happens (per D-03 design decision)
**Why human:** UAT was skipped because user has Vim mode enabled. The behavior needs to be verified to determine whether the D-03 decision (no Escape handler) should be overridden or accepted as intentional deviation from SC #5.

### Gaps Summary

**1 gap found: ROADMAP Success Criterion #5 (Escape returns focus to parent) is not implemented.**

The implementation intentionally omits the Escape handler based on design decision D-03 in 15-CONTEXT.md: "No Escape key exit hatch. Escape does nothing in the child editor -- matches Obsidian and LeetCode web behavior. Users click to move focus elsewhere."

This is a conscious design choice documented before planning began, meaning the ROADMAP SC was superseded by a deliberate implementation decision. However, the ROADMAP SC was never updated to reflect this, creating a contractual gap.

**This looks intentional.** To accept this deviation, add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "Escape in the child editor returns focus to the parent (accessibility escape hatch)"
    reason: "D-03 design decision: No Escape exit hatch — matches Obsidian and LeetCode web behavior. Users click to move focus. Implementing Escape-to-exit would conflict with Vim mode users."
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
```

---

_Verified: 2026-05-22T07:05:00Z_
_Verifier: Claude (gsd-verifier)_
