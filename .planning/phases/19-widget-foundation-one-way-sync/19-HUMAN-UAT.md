---
status: partial
phase: 19-widget-foundation-one-way-sync
source: [19-VERIFICATION.md]
started: 2026-05-29T13:05:00Z
updated: 2026-05-29T13:05:00Z
---

## Current Test

number: 1
name: Reading mode + Live Preview two-path mount and edit behavior
expected: |
  In Reading mode, widget renders with `editable.of(false)` (read-only CM6). In Live Preview, widget mounts editable; typing triggers debounced write (~400ms); within 400ms of last keystroke, disk reflects the change byte-for-byte.
awaiting: user response

## Tests

### 1. Reading mode + Live Preview two-path mount and edit behavior
expected: In Reading mode, widget renders with `editable.of(false)` (read-only CM6). In Live Preview, widget mounts editable; typing triggers debounced write (~400ms); within 400ms of last keystroke, disk reflects the change byte-for-byte.
result: issue
reported: |
  Reading mode is editable (contenteditable=true, vim NORMAL/VISUAL panel shows, can type). Font larger than v1.2 path. White vim status bar visible. DevTools console shows: "Uncaught RangeError: Decorations that replace line breaks may not be specified via plugins" thrown from CodeMirror. DOM container has correct lc-nested-editor + HyperMD-codeblock + lc-leetcode-solve classes. Action row (AI solution / Run / Submit) appears under the widget where Phase 19 D-03 says no buttons should render. Note: action buttons may come from codeActionsPostProcessor matching `leetcode-solve` blocks — needs verification.
severity: blocker
diagnosis_targets:
  - "RangeError: liveModeViewPlugin uses ViewPlugin.provide() to attach Decoration.replace over multi-line ranges. CM6 requires StateField for line-break-spanning replace decorations. Refactor liveModeViewPlugin to use StateField-based decorations."
  - "Reading mode editable: codeBlockProcessor's RenderChild path is supposed to pass readOnly=true to mountLeetCodeWidget, but the WidgetController.buildExtensions clearly isn't applying editable.of(false) effectively (or the RangeError above causes the Live Preview ViewPlugin to also fire on Reading mode mounts, polluting state)."
  - "Action row under widget: codeActionsPostProcessor.ts may be matching `leetcode-solve` language. Phase 19 D-03 says no buttons; if codeActionsPostProcessor matches leetcode-solve, exclude it explicitly."
  - "Font larger / vim panel white: theme cascade is partially working (correct classes attached) but vim panel CSS is unstyled. Fix may flow from fixing the readOnly mount (no vim panel in read-only)."

### 2. Force-quit data preservation (SYNC-02 critical)
expected: Type a sentinel string, Cmd-Q within 100ms. Reopen — sentinel present on disk. `workspace.on('quit')` Tasks.add path is the primary flush; `beforeunload` is the fallback.
result: [pending]

### 3. Self-write echo suppression — no widget reload on own flush (SYNC-03)
expected: After typing, DevTools console shows NO 'external modify observed' log for the flushed file. Only external edits produce that log.
result: [pending]

### 4. atomicRanges parent cursor cannot enter fence range (WIDGET-02, VIM-04)
expected: Arrow-down from heading above widget — cursor jumps over the widget range. In Vim mode, `j`/`k` navigation stops at fence boundary and does not enter widget. `mousedown.stopPropagation` prevents raw-source-reveal on click.
result: [pending]

### 5. State persistence: cursor + scroll + undo stack across unmount/remount within 30s (WIDGET-04)
expected: Type 'A','B','C'. Close note. Reopen within 5s. Cmd-Z three times removes C, B, A. After 35s the state is fresh (cursor at 0). historyJSON is captured but full `fromJSON` round-trip depends on single-CM6 Obsidian runtime.
result: [pending]

### 6. Embed read-only routing: ![[lc-note]] and ![[lc-note#Code]] (EMBED-01, EMBED-02)
expected: Hub note with `![[lc-note]]` renders widget read-only (cannot type); `![[lc-note#Code]]` section embed also read-only. No Run/Submit buttons (none exist in Phase 19).
result: [pending]

### 7. Stray fence in non-LC note safe degradation (EMBED-04)
expected: Non-LC note with `leetcode-solve` fence shows static `<pre><code>` in Reading mode; no widget, no crash, no error in DevTools.
result: [pending]

### 8. Language fallback Notice fires exactly once per mount (WIDGET-06)
expected: With `lc-language` removed or set to 'kotlin': Notice appears once, widget shows Python. With valid `lc-language`: no Notice.
result: [pending]

### 9. v1.2 path regression-clean with useInlineWidget=OFF (D-05)
expected: Toggle `useInlineWidget=OFF`, reload. v1.2 nested-editor mounts per existing behavior. No regressions in any v1.2 flow.
result: [pending]

### 10. Theme inheritance: widget visual matches active Obsidian theme (THEME-01..03)
expected: Switching to Minimal/Catppuccin theme — widget visual updates. `lc-nested-editor` + `HyperMD-codeblock` classes present in DevTools (verified via Inspector).
result: [pending]

### 11. WidgetType.eq() content-hash prevents toDOM per-keystroke (Pitfall 19-F)
expected: DevTools Performance profile: `LeetCodeFenceWidget.toDOM()` does NOT fire on every keystroke. Only fires when fence body changes.
result: [pending]

## Summary

total: 11
passed: 0
issues: 1
pending: 10
skipped: 0
blocked: 0

## Gaps

- truth: "Reading-mode widget renders read-only (editable.of(false)) — no vim panel, no typing"
  status: failed
  reason: "User reported: Reading mode is editable (DOM has contenteditable=true), vim NORMAL/VISUAL status panel visible, can type. Should be fully read-only per WIDGET-07 + CONTEXT C-03."
  severity: blocker
  test: 1
  artifacts:
    - src/widget/codeBlockProcessor.ts
    - src/widget/WidgetController.ts
  missing:
    - "Reading-mode mount path applies editable.of(false) effectively — current path either mis-routes via Live Preview ViewPlugin or vim extension mounts unconditionally instead of being gated on (vimEnabled && !readOnly)"
    - "No vim panel in read-only mounts (vim should only attach when widget is editable AND vimMode is on)"

- truth: "Phase 19 widgets render code only — no Run/Submit/AI-solution buttons under the widget (CONTEXT D-03)"
  status: failed
  reason: "User reported: Action row (AI solution / Run / Submit) appears under the widget. Phase 19 explicitly excludes action row (Phase 20 territory)."
  severity: blocker
  test: 1
  artifacts:
    - src/main/codeActionsPostProcessor.ts
    - src/widget/codeBlockProcessor.ts
  missing:
    - "codeActionsPostProcessor must NOT match `leetcode-solve` blocks when useInlineWidget=ON — the v1.2 button postprocessor is matching the new fence tag and rendering buttons under the new widget"

- truth: "Widget visual matches v1.2 path — same font size, theme cascade, no white vim panel"
  status: failed
  reason: "User reported: Font is larger than v1.2 path; vim status bar renders white (unstyled). Theme classes (lc-nested-editor + HyperMD-codeblock) are present per DOM inspection but visual differs."
  severity: major
  test: 1
  artifacts:
    - src/widget/WidgetController.ts
    - src/main/childEditorTheme.ts
  missing:
    - "Font size parity with v1.2 nested editor — verify createThemedHighlight / theme extensions match v1.2 mount sequence"
    - "vim panel CSS — likely auto-resolves once vim is gated on (vimEnabled && !readOnly); panel should not render in Reading mode at all"

- truth: "DevTools console clean during widget mount (no CM6 RangeError on multi-line decoration replace)"
  status: watch
  reason: "User reported: 'Uncaught RangeError: Decorations that replace line breaks may not be specified via plugins' observed once when no `java` fence existed in the note. Did not reproduce after reload — likely cascading from useNestedEditor child-editor auto-repair path, not a direct widget bug. Watch for regression after the 3 blocker fixes land."
  severity: minor
  test: 1
  artifacts:
    - src/widget/liveModeViewPlugin.ts
    - src/main/childEditorSync.ts
  missing:
    - "Verify after blocker fixes that this does not reproduce. If it does, refactor liveModeViewPlugin to use StateField-based decoration source (CM6 invariant for line-break-spanning Decoration.replace)."
