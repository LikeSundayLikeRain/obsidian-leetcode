---
status: partial
phase: 19-widget-foundation-one-way-sync
source: [19-VERIFICATION.md]
started: 2026-05-29T13:05:00Z
updated: 2026-05-29T13:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Reading mode + Live Preview two-path mount and edit behavior
expected: In Reading mode, widget renders with `editable.of(false)` (read-only CM6). In Live Preview, widget mounts editable; typing triggers debounced write (~400ms); within 400ms of last keystroke, disk reflects the change byte-for-byte.
result: [pending]

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
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
