---
status: in-progress
phase: 17-polish-edge-cases
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md, 17-06-SUMMARY.md]
started: 2026-05-23T10:14:00Z
updated: 2026-05-23T21:08:00Z
---

## Current Test

[testing in progress — manual UAT execution]

## Tests

### 1. PASTE-01 — Paste from VS Code into child editor (D-08)

expected: Open a Java problem note. Copy a multi-line Java snippet from VS Code (e.g., a populated `for` loop with nested braces and 4-space indentation). Click into the child editor inside the `## Code` fence. Paste (Cmd-V on macOS / Ctrl-V on Win/Linux). The pasted code arrives as raw text inside the fence body — original indentation preserved (4 spaces per level), all newlines intact, no characters dropped, no smart-quote substitution, no markdown formatting injected by Obsidian's clipboard interceptor. Cursor lands at the end of the pasted block. Cmd-Z reverts the entire paste in one undo step.
result: pending
notes: ""

### 2. PASTE-02 — Paste from StackOverflow HTML → child (D-08)

expected: Open a Python problem note. From a StackOverflow answer page, select a Python code block (which carries `<code>` HTML and syntax-highlighted `<span>` tags in the clipboard). Click into the child editor and paste. The pasted result is RAW code only — no `<code>` or `<span>` tags landing in the doc, no inline HTML, no tag attributes leaking through. Indentation preserved. The child fence stays a single `python` fence (no nested fence injection from StackOverflow's markdown serialization).
result: pending
notes: ""

### 3. PASTE-03 — Paste from LeetCode web copy → child (D-08)

expected: On leetcode.com, open a problem and select the starter code block in the editor. Copy. In Obsidian, open the matching problem note and click into the child editor. Paste. The pasted code arrives as raw code — LeetCode's clipboard serialization sometimes wraps in markdown fences (` ```language `) but the child must NOT preserve those wrapping fences inside its own fence body (no `\`\`\`` lines should appear in the child doc). Indentation, language-specific brackets, and signatures are preserved exactly.
result: pending
notes: ""

### 4. PASTE-04 — Obsidian clipboard interceptor — markdown formatting suppressed (D-08)

expected: Inside the child editor, paste plain text containing characters that Obsidian's clipboard interceptor would normally transform in a markdown context: a URL like `https://leetcode.com/problems/two-sum/` (Obsidian sometimes auto-links these), straight quotes `"hello"` (some themes/plugins smart-quote-substitute), and a markdown list-style line `- item`. None of these get auto-converted: the URL stays bare text (no `[...](...)` wrapping), straight quotes stay straight, the dash-prefixed line stays literal text — no list bullet rendering, no auto-indent shift. The child editor surfaces a code-context paste, NOT a markdown-context paste.
result: pending
notes: ""

### 5. IME-01 — Pinyin (Chinese) IME composition (D-09)

expected: Switch macOS / Windows IME to Pinyin (Simplified Chinese). Click into the child editor. Type a multi-keystroke pinyin sequence (e.g., `n` `i` `h` `a` `o` then space-bar to commit) intended to compose `你好`. The composing characters appear in the IME's underline-marked composition zone WITHOUT prematurely committing to the doc; on space-bar commit, EXACTLY the composed Chinese characters land in the doc — no duplication (e.g., `你好你好`), no truncation (e.g., only `你`), no early-commit during composition. Cursor advances by 2 grapheme positions. Pressing Cmd-Z undoes the IME-composed insertion in one step (not letter-by-letter).
result: pending
notes: ""

### 6. IME-02 — Romaji → kanji (Japanese) IME (D-09)

expected: Switch IME to Japanese Romaji. Click into the child editor. Type `k` `o` `n` `n` `i` `c` `h` `i` `w` `a`, IME shows hiragana `こんにちは` in composition zone, press space-bar to convert to kanji `今日は`, press Enter to commit. The committed kanji string lands ONCE in the doc (no double-insertion). Cursor advances by the correct grapheme count. The IME's modal selection popup did not get hijacked by Obsidian's command palette or by the child editor's own keymap. Cmd-/ after commit comments out the line correctly even though the line contains kanji.
result: pending
notes: ""

### 7. IME-03 — Hangul (Korean) IME (D-09)

expected: Switch IME to Korean (2-Set or 3-Set). Click into the child editor. Type Hangul jamo composing the syllable `한` (e.g., `ㅎ` `ㅏ` `ㄴ`). The IME composes the jamo into the single syllable block `한` in the composition zone; on space-bar or any non-jamo keystroke that closes composition, EXACTLY one syllable `한` lands in the doc — no orphaned jamo (`ㅎㅏㄴ`), no duplicate syllables. Backspace deletes the entire syllable as one unit, not jamo-by-jamo.
result: pending
notes: ""

### 8. SRCLIV-01 — Source ↔ Live Preview parity with pending edits (D-10)

expected: Open a Java problem note in Live Preview mode. Click into the child editor and TYPE several characters mid-line inside the fence (do NOT save manually — leave as pending edit). Press Cmd-E to flip the leaf to Reading Mode. The note renders in Reading Mode showing the latest edits (Obsidian flushes the pending CM6 doc to disk on mode flip). Press Cmd-E again to flip back to Live Preview. The child editor remounts cleanly; the cursor returns to a sensible position (start of body or last edit position — both acceptable); the typed characters from before the flip are still present; no widget-rebuild flicker visible to the user; no extension state corruption (next Cmd-/ still toggles comment correctly, next Tab still indents per Plan 17-03's mid-line behavior). Repeat once more (LP→Source→LP) — same parity.
result: pending
notes: ""

### 9. Phase 16 sanity regressions

expected: Re-run a curated subset of 16-UAT.md tests on the Phase-17 build to confirm no upstream regressions. The following tests must still pass identically: Test 2 (chevron Java→Python), Test 4 (Java bracket auto-close + overtype + pair-delete), Test 5 (Python no-markdown-pair regression), Test 6 (Python Cmd-/ line comment), Test 9 (Bracket match highlight), Test 13 (focus stays in child), Test 14 (focus returns to parent on Notes click), Test 15 (Tab indents inside child), Test 16 (Cmd-Z scoped to child), Test 17 (Copy to Code without echo loop), Test 18 (section lock holds), Test 19 (Run/Submit buttons work). Any failure here means a Phase-17 wave broke a Phase-16 invariant — file as a P0 regression.
result: pending
notes: ""

### 10. Phase 17 Wave 1 regression sanity — Reset undo restored (D-03)

expected: Open a populated Java solution note with a non-empty fence body. Cmd-P → "Reset code" → confirm. The fence body resets to the Java starter snippet, the chevron + lc-language frontmatter both still say `java`. With focus IN the child editor, press Cmd-Z → the prior solution body is restored to the child editor (NOT inserted into the `## Notes` section). With focus IN the `## Notes` section, press Cmd-Z → it is a NO-OP for the child code state (Notes section text is NEVER receiving the prior solution body, even after multiple Cmd-Z presses). The undo history is scoped to the child CM6 view; the parent CM6 view does NOT carry a Reset undo entry that could leak the prior body into adjacent sections. Validates Plan 17-01 fix.
result: pending
notes: ""

### 11. Phase 17 Wave 1 regression sanity — Tab mid-line behavior (INDENT-04)

expected: Open a Java solution note with at least 5 lines of populated code. (a) Place the cursor MID-LINE (e.g., after `if (x)` with the closing `{` still to come on the same line) and press Tab — exactly 4 spaces are inserted at the cursor position; the line content to the right of the cursor stays on the same line; the leading indent of the line is unchanged. (b) Place the cursor at the START of a different code line (column 0 or just past the existing indent) and press Tab — the entire line indents by one indent unit (4 spaces for Java); cursor moves with the line. (c) Select two contiguous lines and press Tab — both lines indent by one unit in a SINGLE undo step (Cmd-Z reverts both lines together, not one at a time). (d) Shift-Tab on a multi-line selection dedents both lines in a single undo step. Validates Plan 17-03 fix.
result: pending
notes: ""

### 12. Phase 17 Wave 2 regression sanity — fm reactivity (D-13/D-14)

expected: Open a Java problem note in pane A. Without switching focus to pane A, open the note's properties panel (or use Source mode + frontmatter edit) and CHANGE the `lc-language` frontmatter value from `java` to `python`. Switch focus back to pane A. Within ~1 second of the focus return, the child editor's syntax highlighter has flipped from Java to Python (you can verify by typing `def foo():` and observing Python coloring), the child's indent unit reflects Python (4 spaces — same for Java but verify the per-language map is consulted), the child's Cmd-/ uses `# ` (Python prefix) NOT `// ` (Java prefix). The fence opener TAG in the parent doc still says ` ```java ` — the listener does NOT rewrite the fence opener (D-14: passive-listener; frontmatter is SoT for the child only; users who want the fence opener flipped use the chevron). The note does NOT need to be closed and reopened. Repeat with `python → cpp` and observe C++ syntax + 4-space indent + `// ` comment prefix in the child. Validates Plan 17-04 listener.
result: pending
notes: ""

### 13. THEME-01 — Themed HighlightStyle dark theme legibility (D-15)

expected: Open a Java problem note in dark theme (Obsidian default dark or any community dark theme). Verify keywords (`class`, `public`, `return`), strings (`"hello"`), comments (`// note`), function names (`solve(...)`), type names (`String`, `Integer`), property names, operators (`==`, `+`), and numeric literals all render with Obsidian's dark-theme code colors. The colors are visually distinct from each other (no white-on-white, no fully-invisible tokens, no two adjacent tag classes rendering identically). Comments are italicized. Repeat with a Python note (`def`, `self`, `None`, `if __name__ == '__main__':`) and a JavaScript note (`const`, `=>`, template literals); same legibility properties.
result: pending
notes: ""

### 14. THEME-02 — Themed HighlightStyle light theme legibility (D-15)

expected: With the same Java/Python/JS notes still open from Test 13, switch Obsidian to a light theme (Settings → Appearance → Base color scheme → Light, OR pick a community light theme). DO NOT reload the plugin, DO NOT close+reopen the note. The same syntax tokens MUST automatically re-render in the light-theme palette (the `var(--code-keyword)` etc. bindings resolve against Obsidian's now-active theme). Same legibility properties as Test 13: each tag visually distinct, comments italic, no fully-invisible tokens. Switch back to dark to confirm bidirectional theme tracking.
result: pending
notes: ""

### 15. HIGHLIGHT-DARK-01 — Bracket-match contrast in dark theme (D-16)

expected: In dark theme, open a Java note with populated code containing nested brackets (e.g. `for (int i = 0; i < n; i++) { arr[i] = compute(args[k]); }`). Place the cursor IMMEDIATELY adjacent to a `{`. The matching `}` is highlighted with HIGH-CONTRAST styling: foreground uses `var(--code-keyword)` (a strong accent against the code-block background), background uses `var(--background-modifier-active-hover)` (a clearly tinted state — distinguishable from the surrounding code-block surface), and a 1px outline using `var(--code-keyword)` is visible around the bracket. The highlight is unambiguously distinguishable from regular text — NOT the Phase 16 carry-over symptom of "barely visible / can't tell which bracket is matched". Repeat for `[` ↔ `]` and `(` ↔ `)`. Switch to a light theme and confirm the SAME high-contrast properties hold (variables resolve to light-theme equivalents). Resolves the 16-UAT.md Test 9 cosmetic carry-over from Phase 16.
result: pending
notes: ""

### 16. GO-01 — Go syntax highlighting after themed swap (D-17 conditional)

expected: Open a problem note. Use the chevron to switch to a Go fence (or open a note whose `lc-language: golang`). Type a Go function with comments and strings, e.g.:
```
package main

import "fmt"

// Sum returns the sum of two ints.
func Sum(a int, b int) int {
    s := "hello"
    return a + b
}
```
Observe whether the themed `HighlightStyle` produces colorization on Go tokens.

  CASE A (themed style binds successfully to legacy-modes Go tags): Keywords (`func`, `package`, `return`, `import`), strings (`"fmt"`, `"hello"`), comments (`// Sum returns...`), and types (`int`) are all colorized using Obsidian theme variables. Mark `result: pass` — Go ships colorized in v1.2.

  CASE B (Go remains plain text after the swap): Keywords/strings/comments render as default text color (no highlighting visible). Mark `result: fail` and set `notes: "Defer Go highlighting to v1.3 per CONTEXT D-17 escape clause — legacy-modes StreamLanguage tag binding requires explicit work beyond the ~20 LOC ceiling"`. Additionally update `.planning/REQUIREMENTS.md` (or whichever requirements registry tracks LANG-01 / Go highlighting) to flag Go as a v1.3 deferral, AND add a one-line entry to `.planning/RETROSPECTIVE.md` or the phase 17 final SUMMARY noting the deferral and reason. Plan 17-06 Task 4 records the case and triggers the documentation update if CASE B.

result: pending
notes: ""

### 17. VIM-01 — Vim mode activates from Obsidian global setting (D-18)

expected: In Obsidian Settings → Editor → enable "Vim key bindings". Reload the dev vault (or close+reopen the vault) so plugins re-mount. Open a Java problem note. Click into the child editor inside the `## Code` fence. The cursor renders as a BLOCK (vim Normal mode default) — not a thin caret. A small `.cm-vim-panel` mode indicator strip is visible at the bottom of the child editor showing "-- NORMAL --". Press `i` → cursor changes to a thin caret (Insert mode); panel updates to "-- INSERT --". Press Esc → returns to Normal; cursor reverts to block; panel back to "-- NORMAL --". Toggle the global setting OFF; reload; reopen the same note → child editor is plain CM6 (caret cursor, no vim panel) — confirming the conditional read at child mount works in BOTH directions.
result: pending
notes: ""

### 18. VIM-02 — Tab in vim Insert mode follows D-11 customTabCommand (D-20)

expected: With vim mode enabled, open a Java note; click into the child editor; press `i` to enter Insert mode. (a) Cursor at line-start of an empty line → press Tab → exactly 4 spaces inserted (D-11 line-start branch — `indentMore` delegated). (b) Cursor mid-line after some non-whitespace text (e.g., after `if (x)` on `if (x) ` ) → press Tab → exactly 4 spaces inserted at cursor position; rest of line unchanged (D-11 mid-line branch). (c) Multi-line selection across 2 lines → press Tab → both lines indent in a SINGLE undo step (Cmd-Z reverts both at once; D-12 invariant). Vim Insert-mode does NOT shadow our custom Tab binding — the keymap precedence is correct. In vim Normal mode, Tab is the vim default (next jump / next match) — NOT our customTabCommand. This is intentional and acceptable per Pitfall 4 documentation.
result: pending
notes: ""

### 19. VIM-03 — Cmd-/ comment toggle works in both vim Insert + Normal modes (D-20)

expected: With vim mode enabled, open a Java note; click into the child editor. (a) In Normal mode, place cursor on a line with code; press Cmd-/ → the line is prefixed with `// ` (Java comment). Press Cmd-/ again → comment removed. (b) Press `i` to enter Insert mode; press Cmd-/ again → same toggle behavior; the comment toggle fires regardless of vim mode because the Obsidian Scope-based `Mod-/` override (factory.ts:165-170) intercepts at app level, not editor level. (c) Repeat with a Python note and verify `# ` prefix. (d) Repeat with a JavaScript/TypeScript note and verify `// ` prefix. COMMENT-01 holds in vim mode for all per-language prefixes.
result: pending
notes: ""

### 20. VIM-04 — Esc-Esc / click-out returns focus to parent (D-20, Pitfall 4 documentation)

expected: With vim mode enabled, open a Java note; click into the child editor (Insert mode active by default if you began typing, or Normal if just clicked). Vim's Esc binds to "enter Normal mode" with high precedence — so the Phase 15 escape-hatch behavior (Esc returns focus to parent) is shadowed when vim is on. Documented two-press path: (a) From Insert mode, press Esc → child enters Normal mode (focus stays in child, cursor block). (b) Press Esc a second time → either no-op in vim (acceptable) OR cursor moves to start of line (acceptable). The DOCUMENTED escape path for vim users is to CLICK INTO the `## Notes` section — focus returns to parent's Notes section, child editor blurs (vim panel grays). Confirm: clicking into `## Notes` from Normal mode returns focus to parent in one click. This is NOT a regression — it's the documented behavior per Pitfall 4. With vim mode OFF, the original single-Esc escape hatch behavior (Phase 15) is restored.
result: pending
notes: ""

### 21. VIM-05 — `:w` in vim Normal mode is a no-op (D-20 documentation)

expected: With vim mode enabled, open a Java note; click into the child editor; press Esc to ensure Normal mode; press `:` (colon) → vim's command palette appears at the bottom of the child editor; type `w` and press Enter → the command is processed by vim. Expected behavior: `:w` is treated as a no-op (vim's default save handler has nothing to save against — Obsidian auto-saves the parent doc on its own cadence, child→parent sync flushes on every keystroke). The note title bar's "•" unsaved indicator does NOT appear or disappear from `:w` (because the parent doc's saved state is owned by Obsidian's autosave). Users who want explicit save use Cmd-S, which Obsidian handles at the workspace level — `:w` is documented as "no-op for v1.2; use Cmd-S for explicit save". If `:w` instead produces a vim error popup ("can't save in this buffer") that's also acceptable behavior — log in notes.
result: pending
notes: ""

### 22. LIFE-01 — Heap-snapshot lifecycle UAT (D-23 arm b)

expected: Open and close 20 different lc-slug problem notes in the dev vault. Procedure: (1) Open Obsidian's built-in DevTools (Cmd-Shift-I on macOS / Ctrl-Shift-I on Win/Linux). (2) Switch to the Memory tab. (3) Take a baseline heap snapshot before opening any problem notes ("Snapshot 1: baseline"). (4) Open and close 20 different LeetCode problem notes — any combination from the dev vault's `LeetCode/problems/` folder. The registry capacity is 5, so by the 6th note the LRU eviction begins; by the 20th note 15 evictions have fired. (5) After closing the 20th note, force a garbage collection (DevTools Memory tab → "Collect garbage" / trash-can icon). (6) Take a second snapshot ("Snapshot 2: post-cycle"). (7) In DevTools' "Comparison" view of Snapshot 2 vs Snapshot 1, filter the constructor list by typing `EditorView`. Verify: the count of EditorView instances is at most 5 (the registry capacity) — the other 15 instances were destroyed on LRU eviction. Verify: no "Detached" EditorView instances appear (Detached = DOM-detached but JS-reachable, indicating a leak). Verify: registry size at end of cycle is 5. Verify: decoration set count is stable (not growing unboundedly) — drill into a remaining EditorView and confirm its `state.facet` decoration sets are bounded by the document size, not by the number of cycles. Pass criteria: zero detached EditorViews, registry size = 5, decoration sets stable. Fail criteria: any non-zero detached EditorView count, OR registry size > 5, OR unbounded decoration set growth. After completing this test, the executor (post-resume) creates `.planning/phases/17-polish-edge-cases/17-LIFE-SNAPSHOT.md` with the 5 required sections per CONTEXT D-23 arm b.
result: pending
notes: ""

## Summary

total: 22
passed: 0
issues: 0
pending: 22
skipped: 0
blocked: 0
