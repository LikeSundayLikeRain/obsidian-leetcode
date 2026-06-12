---
status: complete
result: passed
phase: 19-widget-foundation-one-way-sync
source: [19-VERIFICATION.md]
started: 2026-05-29T13:05:00Z
updated: 2026-06-12
result_summary: "All Phase 19 UAT scenarios validated out-of-band during BRAT 7-day dogfood window (1.3.0-beta.1). Fixes shipped via /gsd-quick (260605-vny widget cursor jump + char rollback, 260605-wux multi-pane preview leaf targeting, 260607-uko quick-search). Widget mount, one-way sync, atomicRanges, embed routing, language fallback, theme inheritance, and v1.2 path coexistence all verified in production dogfood."
---

## Current Test

number: 1
name: Reading mode + Live Preview two-path mount and edit behavior
expected: |
  In Reading mode, widget renders with `editable.of(false)` (read-only CM6). In Live Preview, widget mounts editable; typing triggers debounced write (~400ms); within 400ms of last keystroke, disk reflects the change byte-for-byte.
awaiting: resolved (gap-closure 19-05)

## Tests

### 1. Reading mode + Live Preview two-path mount and edit behavior
expected: In Reading mode, widget renders with `editable.of(false)` (read-only CM6). In Live Preview, widget mounts editable; typing triggers debounced write (~400ms); within 400ms of last keystroke, disk reflects the change byte-for-byte.
result: passed-with-deferred
reported: |
  **Gap-closure 19-05 resolved:**
  - BLOCKER 1 (vim leak in read-only): FIXED. Reading mode now read-only — no vim panel, no cursor, no line highlight, no bracket matching. Systematic fix: buildExtensions returns visual-only extensions when readOnly=true.
  - BLOCKER 2 (action row under widget): FIXED. Action row suppressed when useInlineWidget=ON in both modes. v1.2 path (useInlineWidget=OFF) retains action row in both modes (D-05 verified).
  - BLOCKER 3 (font size drift): DEFERRED to Phase 20 THEME-04. Reading-mode widget uses `var(--font-text-size)` (16px) while native Obsidian code blocks use 14px. The theme block is byte-identical to v1.2's childEditorFactory; the delta is between the widget's CM6 and Obsidian's native rendered `<pre><code>`. This is cosmetic and does not affect correctness.
  
  **Additional finding (Phase 20 SYNC-04/SYNC-05):**
  Self-write remount cycle: typing in LP widget → 400ms flush → vault.process() → parent doc updates → ViewPlugin rebuilds → sourceHash differs → eq() returns false → full widget remount → vim state (Normal mode, cursor pos) lost. The one-way sync WORKS (edits persist to disk correctly), but the ViewPlugin lacks self-write awareness — it cannot distinguish "parent doc changed because I flushed" from "parent doc changed because someone else edited." This disrupts vim mode after each flush cycle. Root cause: liveModeViewPlugin.ts rebuilds on ANY docChanged without checking whether the change originated from the widget's own debouncedWriter.
  
  **Fix path (Phase 20):** ViewPlugin needs a "suppress next rebuild" signal from the debouncedWriter flush. After vault.process() completes and the parent CM6 processes the change, the ViewPlugin should skip the rebuild for that specific update cycle. This preserves the existing widget DOM (and all vim/cursor/undo state) for self-writes while still rebuilding on external edits.
severity: deferred
diagnosis_targets: []

### 2. Force-quit data preservation (SYNC-02 critical)
expected: Type a sentinel string, Cmd-Q within 100ms. Reopen — sentinel present on disk. `workspace.on('quit')` Tasks.add path is the primary flush; `beforeunload` is the fallback.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 3. Self-write echo suppression — no widget reload on own flush (SYNC-03)
expected: After typing, DevTools console shows NO 'external modify observed' log for the flushed file. Only external edits produce that log.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 4. atomicRanges parent cursor cannot enter fence range (WIDGET-02, VIM-04)
expected: Arrow-down from heading above widget — cursor jumps over the widget range. In Vim mode, `j`/`k` navigation stops at fence boundary and does not enter widget. `mousedown.stopPropagation` prevents raw-source-reveal on click.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 5. State persistence: cursor + scroll + undo stack across unmount/remount within 30s (WIDGET-04)
expected: Type 'A','B','C'. Close note. Reopen within 5s. Cmd-Z three times removes C, B, A. After 35s the state is fresh (cursor at 0). historyJSON is captured but full `fromJSON` round-trip depends on single-CM6 Obsidian runtime.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 6. Embed read-only routing: ![[lc-note]] and ![[lc-note#Code]] (EMBED-01, EMBED-02)
expected: Hub note with `![[lc-note]]` renders widget read-only (cannot type); `![[lc-note#Code]]` section embed also read-only. No Run/Submit buttons (none exist in Phase 19).
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 7. Stray fence in non-LC note safe degradation (EMBED-04)
expected: Non-LC note with `leetcode-solve` fence shows static `<pre><code>` in Reading mode; no widget, no crash, no error in DevTools.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 8. Language fallback Notice fires exactly once per mount (WIDGET-06)
expected: With `lc-language` removed or set to 'kotlin': Notice appears once, widget shows Python. With valid `lc-language`: no Notice.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 9. v1.2 path regression-clean with useInlineWidget=OFF (D-05)
expected: Toggle `useInlineWidget=OFF`, reload. v1.2 nested-editor mounts per existing behavior. No regressions in any v1.2 flow.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 10. Theme inheritance: widget visual matches active Obsidian theme (THEME-01..03)
expected: Switching to Minimal/Catppuccin theme — widget visual updates. `lc-nested-editor` + `HyperMD-codeblock` classes present in DevTools (verified via Inspector).
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

### 11. WidgetType.eq() content-hash prevents toDOM per-keystroke (Pitfall 19-F)
expected: DevTools Performance profile: `LeetCodeFenceWidget.toDOM()` does NOT fire on every keystroke. Only fires when fence body changes.
result: passed (validated in BRAT 7-day dogfood, 1.3.0-beta.1)

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0
final_validation: "BRAT 7-day dogfood window (1.3.0-beta.1), 2026-06-03 → 2026-06-10. All 10 previously-pending scenarios validated in production daily LC practice usage. Regressions surfaced during dogfood were fixed via /gsd-quick (260605-vny, 260605-wux, 260607-uko)."

## Gaps

- truth: "Reading-mode widget renders read-only (editable.of(false)) — no vim panel, no typing"
  status: resolved
  reason: "Gap-closure 19-05: codeBlockProcessor detects Reading mode via DOM ancestor; buildExtensions returns visual-only extensions when readOnly=true."
  severity: blocker
  test: 1

- truth: "Phase 19 widgets render code only — no Run/Submit/AI-solution buttons under the widget (CONTEXT D-03)"
  status: resolved
  reason: "Gap-closure 19-05: main.ts wraps both v1.2 action-row registrations in `if (!useInlineWidget)` gate."
  severity: blocker
  test: 1

- truth: "Widget visual matches v1.2 path — same font size, theme cascade, no white vim panel"
  status: deferred
  reason: "Font size: widget uses var(--font-text-size) (16px) while native Reading-mode code blocks render at 14px. Theme block is byte-identical to v1.2; the delta is between embedded CM6 and Obsidian's native <pre><code>. Deferred to Phase 20 THEME-04."
  severity: minor
  test: 1
  deferred_to: "Phase 20 THEME-04"

- truth: "DevTools console clean during widget mount (no CM6 RangeError on multi-line decoration replace)"
  status: watch
  reason: "Did not reproduce after gap-closure fixes. Watch for regression."
  severity: minor
  test: 1

- truth: "Live Preview self-write cycle causes widget remount — vim state lost after each 400ms flush"
  status: deferred
  reason: "ViewPlugin rebuilds on any parent docChanged without distinguishing self-writes from external edits. After debouncedWriter flushes via vault.process(), parent doc update triggers ViewPlugin rebuild → sourceHash mismatch → eq() false → full remount → vim Normal mode / cursor pos lost. One-way sync is correct (data persists); only UX is disrupted."
  severity: major
  deferred_to: "Phase 20 SYNC-04/SYNC-05"
  fix_path: "ViewPlugin needs suppress-next-rebuild signal from debouncedWriter flush path. Skip decoration rebuild for the update cycle triggered by the widget's own vault.process() write."
  test: 1
