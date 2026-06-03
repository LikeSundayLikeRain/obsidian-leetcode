---
phase: 19-widget-foundation-one-way-sync
plan: 05
type: gap-closure
status: complete
started: 2026-05-29T15:00:00Z
completed: 2026-05-29T15:35:00Z
duration: ~35min
tasks_completed: 3
tasks_total: 3
deviations: 1
---

# Plan 19-05 Summary: Read-Only Mount + Action-Row Gate (Gap Closure)

## What Was Built

Closed three UAT blockers from Test 1 (Reading mode + Live Preview two-path mount):

### BLOCKER 1: Read-only vim leak — FIXED

**Root cause (discovered during UAT):** Two issues compounded:
1. `WidgetController.buildExtensions` gated vim on `vimEnabled` only — missing `&& !readOnly`. Vim's internal `editable.of(true)` won by extension order over our `EditorView.editable.of(false)`.
2. `codeBlockProcessor.ts` computed `readOnly = isEmbed || !hasLcSlug` — which gives `false` for normal LC notes. Since `registerMarkdownCodeBlockProcessor` fires in BOTH Reading mode and Live Preview (not just Reading mode as documented), this made Reading-mode widgets editable.

**Fix (3 commits):**
- `WidgetController.ts:276`: `vimEnabled && !readOnly` gate (executor commit `dd5dc32`)
- `codeBlockProcessor.ts:141`: Detect Reading mode via `el.closest('.markdown-reading-view')` DOM ancestor (commit `0d49d27`)
- `WidgetController.ts buildExtensions`: Systematic split — when `readOnly=true`, return ONLY visual extensions (syntax highlight, theme, line wrapping). No vim, no bracketMatching, no drawSelection, no highlightActiveLine, no keymaps, no history (commit `0d49d27`)

### BLOCKER 2: Action row under widget — FIXED

**Root cause:** `registerCodeBlockActionProcessor` and `buildCodeActionsEditorExtension` are fence-tag-AGNOSTIC — they match by `lc-slug` frontmatter. With `useInlineWidget=ON`, both fire on the new `leetcode-solve` fence.

**Fix:** `main.ts:853` wraps both v1.2 action-row registrations in `if (!this.settings.getUseInlineWidget())` (executor commit `0df8416`).

### BLOCKER 3: Font size drift — DEFERRED to Phase 20 THEME-04

Reading-mode widget uses `var(--font-text-size)` (resolves to 16px) while Obsidian's native `<pre><code>` renders at 14px. The theme block is byte-identical to v1.2's `childEditorFactory.ts:381-395` — the delta is between embedded CM6 and Obsidian's native rendered code blocks. Cosmetic only; does not affect correctness.

## Deviation

**D-01: codeBlockProcessor fires in Live Preview (undocumented Obsidian behavior)**

The plan assumed `registerMarkdownCodeBlockProcessor` only fires in Reading mode (per Obsidian docs and CONTEXT C-02). Empirically it fires in BOTH modes. The original plan's `readOnly = isEmbed || !hasLcSlug` logic was correct for the assumed architecture but wrong in practice. Fix: DOM-based mode detection via `.markdown-reading-view` ancestor.

## Additional Finding (Phase 20 scope)

**Self-write remount cycle disrupts vim state (SYNC-04/SYNC-05 territory):**
Typing → 400ms flush → `vault.process()` → parent doc updates → ViewPlugin rebuilds → `sourceHash` mismatch → `eq()` false → full widget remount → vim resets to Normal mode. One-way sync is correct (data persists to disk), but ViewPlugin lacks self-write awareness. Documented in 19-HUMAN-UAT.md with fix path for Phase 20.

## Test Results

- Full suite: **1918 passed** / 6 skipped (baseline was 1906; +12 new tests)
- Widget suite: 179 passed
- Build: `npm run build` exits 0
- New test files: `tests/widget/readOnlyMount.test.ts` (4 tests), `tests/main/inlineWidgetActionGate.test.ts` (5 tests), extended `tests/widget/vimMount.test.ts` (+1 test)

## Grep Regression Checks

- `vimEnabled && !readOnly` in WidgetController.ts: 1 hit (fixed gate)
- `!useInlineWidget` gate in main.ts: present (line 853)
- CLAUDE.md `'leetcode.*'` paragraph: preserved (1 hit)
- CLAUDE.md Phase 17 D-05 paragraph: preserved (1 hit)
- No new runtime deps: package.json unchanged
- v1.2 files preserved: all 5 present

## UAT Verdict

`approved-with-deferred`: BLOCKERs 1+2 resolved. BLOCKER 3 (font 16px vs 14px) deferred to Phase 20 THEME-04. Self-write remount cycle deferred to Phase 20 SYNC-04/SYNC-05. WATCH item (CM6 RangeError) did not reproduce.

## Key Files

| File | Change |
|------|--------|
| `src/widget/WidgetController.ts` | Systematic read-only extension split; vim gated on `!readOnly` |
| `src/widget/codeBlockProcessor.ts` | Reading-mode detection via DOM ancestor |
| `src/main.ts` | Action-row registrations gated on `!useInlineWidget` |
| `tests/widget/readOnlyMount.test.ts` | NEW: 4-cell (readOnly × vimMode) matrix |
| `tests/main/inlineWidgetActionGate.test.ts` | NEW: action-row gate both branches |
| `tests/widget/vimMount.test.ts` | EXTENDED: readOnly=true case |
