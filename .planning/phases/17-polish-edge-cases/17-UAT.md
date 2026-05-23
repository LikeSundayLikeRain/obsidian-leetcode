---
status: in-progress
phase: 17-polish-edge-cases
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md, 17-06-SUMMARY.md]
started: 2026-05-23T10:14:00Z
updated: 2026-05-23T10:14:00Z
---

## Current Test

[testing pending — execute in Plan 17-06]

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

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0
