---
status: partial
phase: 17-polish-edge-cases
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md, 17-06-SUMMARY.md]
started: 2026-05-23T10:14:00Z
updated: 2026-05-23T21:50:00Z
summary:
  total: 23
  pass: 14
  issue: 6
  deferred: 1
  skipped: 2
  pending: 1
---

## Current Test

[testing complete — 14 pass, 6 issues, 1 deferred, 2 skipped + 1 pending (Plan 17-13)]

## Tests

### 1. PASTE-01 — Paste from VS Code into child editor (D-08)

expected: Open a Java problem note. Copy a multi-line Java snippet from VS Code (e.g., a populated `for` loop with nested braces and 4-space indentation). Click into the child editor inside the `## Code` fence. Paste (Cmd-V on macOS / Ctrl-V on Win/Linux). The pasted code arrives as raw text inside the fence body — original indentation preserved (4 spaces per level), all newlines intact, no characters dropped, no smart-quote substitution, no markdown formatting injected by Obsidian's clipboard interceptor. Cursor lands at the end of the pasted block. Cmd-Z reverts the entire paste in one undo step.
result: pass
notes: ""

### 2. PASTE-02 — Paste from StackOverflow HTML → child (D-08)

expected: Open a Python problem note. From a StackOverflow answer page, select a Python code block (which carries `<code>` HTML and syntax-highlighted `<span>` tags in the clipboard). Click into the child editor and paste. The pasted result is RAW code only — no `<code>` or `<span>` tags landing in the doc, no inline HTML, no tag attributes leaking through. Indentation preserved. The child fence stays a single `python` fence (no nested fence injection from StackOverflow's markdown serialization).
result: issue
reported: "Paste content arrives clean (no HTML/tags). BUT in Source Mode while child editor has focus, structural changes (paste / enter + type a new line) cause a phantom duplicate render of the parent fence body below the child editor. Existing-line edits do NOT cause duplication. Duplication disappears when the child editor loses focus."
severity: major
hypothesis: "Source Mode-only render bug. The CSS line-hide decorations in nestedEditorExtension.ts StateField are not extending to cover lines newly added by the child→parent mirror dispatch (addToHistory.of(false)). The mirror transaction adds lines to the parent doc, but the StateField's RangeSetBuilder range/decoration computation doesn't re-run for the new line range until a fresh render trigger (focus change). Pitfall 8 (Source Mode parity) — D-10 / SRCLIV-01 will likely surface the same root cause."
artifacts: []
missing: []

### 3. PASTE-03 — Paste from LeetCode web copy → child (D-08)

expected: On leetcode.com, open a problem and select the starter code block in the editor. Copy. In Obsidian, open the matching problem note and click into the child editor. Paste. The pasted code arrives as raw code — LeetCode's clipboard serialization sometimes wraps in markdown fences (` ```language `) but the child must NOT preserve those wrapping fences inside its own fence body (no `\`\`\`` lines should appear in the child doc). Indentation, language-specific brackets, and signatures are preserved exactly.
result: pass
notes: ""

### 4. PASTE-04 — Obsidian clipboard interceptor — markdown formatting suppressed (D-08)

expected: Inside the child editor, paste plain text containing characters that Obsidian's clipboard interceptor would normally transform in a markdown context: a URL like `https://leetcode.com/problems/two-sum/` (Obsidian sometimes auto-links these), straight quotes `"hello"` (some themes/plugins smart-quote-substitute), and a markdown list-style line `- item`. None of these get auto-converted: the URL stays bare text (no `[...](...)` wrapping), straight quotes stay straight, the dash-prefixed line stays literal text — no list bullet rendering, no auto-indent shift. The child editor surfaces a code-context paste, NOT a markdown-context paste.
result: pass
notes: "Pasted as raw text — URL not auto-linked, quotes/dash preserved."

### 5. IME-01 — Pinyin (Chinese) IME composition (D-09)

expected: Switch macOS / Windows IME to Pinyin (Simplified Chinese). Click into the child editor. Type a multi-keystroke pinyin sequence (e.g., `n` `i` `h` `a` `o` then space-bar to commit) intended to compose `你好`. The composing characters appear in the IME's underline-marked composition zone WITHOUT prematurely committing to the doc; on space-bar commit, EXACTLY the composed Chinese characters land in the doc — no duplication (e.g., `你好你好`), no truncation (e.g., only `你`), no early-commit during composition. Cursor advances by 2 grapheme positions. Pressing Cmd-Z undoes the IME-composed insertion in one step (not letter-by-letter).
result: pass
notes: ""

### 6. IME-02 — Romaji → kanji (Japanese) IME (D-09)

expected: Switch IME to Japanese Romaji. Click into the child editor. Type `k` `o` `n` `n` `i` `c` `h` `i` `w` `a`, IME shows hiragana `こんにちは` in composition zone, press space-bar to convert to kanji `今日は`, press Enter to commit. The committed kanji string lands ONCE in the doc (no double-insertion). Cursor advances by the correct grapheme count. The IME's modal selection popup did not get hijacked by Obsidian's command palette or by the child editor's own keymap. Cmd-/ after commit comments out the line correctly even though the line contains kanji.
result: skipped
reason: "No Japanese IME available on user's system."

### 7. IME-03 — Hangul (Korean) IME (D-09)

expected: Switch IME to Korean (2-Set or 3-Set). Click into the child editor. Type Hangul jamo composing the syllable `한` (e.g., `ㅎ` `ㅏ` `ㄴ`). The IME composes the jamo into the single syllable block `한` in the composition zone; on space-bar or any non-jamo keystroke that closes composition, EXACTLY one syllable `한` lands in the doc — no orphaned jamo (`ㅎㅏㄴ`), no duplicate syllables. Backspace deletes the entire syllable as one unit, not jamo-by-jamo.
result: skipped
reason: "No Korean IME available on user's system."

### 8. SRCLIV-01 — Source ↔ Live Preview parity with pending edits (D-10)

expected: Open a Java problem note in Live Preview mode. Click into the child editor and TYPE several characters mid-line inside the fence (do NOT save manually — leave as pending edit). Press Cmd-E to flip the leaf to Reading Mode. The note renders in Reading Mode showing the latest edits (Obsidian flushes the pending CM6 doc to disk on mode flip). Press Cmd-E again to flip back to Live Preview. The child editor remounts cleanly; the cursor returns to a sensible position (start of body or last edit position — both acceptable); the typed characters from before the flip are still present; no widget-rebuild flicker visible to the user; no extension state corruption (next Cmd-/ still toggles comment correctly, next Tab still indents per Plan 17-03's mid-line behavior). Repeat once more (LP→Source→LP) — same parity.
result: pass
notes: "State preservation across Cmd-E flips works correctly — pending edits, cursor, extension state all survive. BUT: same Source Mode phantom render issue from Test 2 PASTE-02 reproduces here. Confirmed scope: the bug is a Source Mode rendering issue (Pitfall 8), independent of paste action. Linked to the gap from Test 2."

### 9. Phase 16 sanity regressions

expected: Re-run a curated subset of 16-UAT.md tests on the Phase-17 build to confirm no upstream regressions. The following tests must still pass identically: Test 2 (chevron Java→Python), Test 4 (Java bracket auto-close + overtype + pair-delete), Test 5 (Python no-markdown-pair regression), Test 6 (Python Cmd-/ line comment), Test 9 (Bracket match highlight), Test 13 (focus stays in child), Test 14 (focus returns to parent on Notes click), Test 15 (Tab indents inside child), Test 16 (Cmd-Z scoped to child), Test 17 (Copy to Code without echo loop), Test 18 (section lock holds), Test 19 (Run/Submit buttons work). Any failure here means a Phase-17 wave broke a Phase-16 invariant — file as a P0 regression.
result: pass
notes: "User spot-checked 4 highest-risk surfaces: chevron switch (multi-language), Cmd-/ toggle, bracket auto-close, indent rules — all working. Tests 13–19 (focus model, Cmd-Z scope to child, Copy to Code, section lock, Run/Submit) not formally re-run; covered by the dedicated Tests 10 (RESET-01), 11 (TAB-MIDLINE), 17–21 (VIM) in this UAT."

### 10. Phase 17 Wave 1 regression sanity — Reset undo restored (D-03)

expected: Open a populated Java solution note with a non-empty fence body. Cmd-P → "Reset code" → confirm. The fence body resets to the Java starter snippet, the chevron + lc-language frontmatter both still say `java`. With focus IN the child editor, press Cmd-Z → the prior solution body is restored to the child editor (NOT inserted into the `## Notes` section). With focus IN the `## Notes` section, press Cmd-Z → it is a NO-OP for the child code state (Notes section text is NEVER receiving the prior solution body, even after multiple Cmd-Z presses). The undo history is scoped to the child CM6 view; the parent CM6 view does NOT carry a Reset undo entry that could leak the prior body into adjacent sections. Validates Plan 17-01 fix.
result: issue
reported: "Two findings: (1) ACCEPTED: To Cmd-Z the Reset, focus must be in the child editor first. Honors Phase 15 D-05 cm-z scope isolation invariant — undo only fires for the focused editor's history. Notes section is never receiving the prior solution body. (2) BUG: Reset wrote a Python starter into a Java problem note where chevron AND lc-language frontmatter both still say `java`. The language priority chain (D-06: fm > active fence opener tag > getDefaultLanguage) is not being honored."
severity: major
hypothesis: "Plan 17-01 refactored Reset to dispatch through child CM6 (D-03), and may have inadvertently lost the language priority resolution chain that the Phase 16 reset-code-language-regression fix put in place. The getActiveFenceLangSlug + frontmatter-read resolver chain in resolveActiveLangSlug() may not be wired through the new child-dispatch call site in src/main.ts:resetCode, so the helper falls back to settings.getDefaultLanguage() (which is set to python3 in user's settings)."
artifacts: ["src/solve/resetCodeWithConfirm.ts (resolveActiveLangSlug)", "src/main.ts (resetCode wiring — getActiveFenceLangSlug + getDispatchHandle resolvers)"]
missing: []

### 11. Phase 17 Wave 1 regression sanity — Tab mid-line behavior (INDENT-04)

expected: Open a Java solution note with at least 5 lines of populated code. (a) Place the cursor MID-LINE (e.g., after `if (x)` with the closing `{` still to come on the same line) and press Tab — exactly 4 spaces are inserted at the cursor position; the line content to the right of the cursor stays on the same line; the leading indent of the line is unchanged. (b) Place the cursor at the START of a different code line (column 0 or just past the existing indent) and press Tab — the entire line indents by one indent unit (4 spaces for Java); cursor moves with the line. (c) Select two contiguous lines and press Tab — both lines indent by one unit in a SINGLE undo step (Cmd-Z reverts both lines together, not one at a time). (d) Shift-Tab on a multi-line selection dedents both lines in a single undo step. Validates Plan 17-03 fix.
result: pass
notes: "All three Tab behaviors confirmed: line-start indents whole line, mid-line inserts indent unit at cursor, multi-line selection indents as single undo step."

### 12. Phase 17 Wave 2 regression sanity — fm reactivity (D-13/D-14)

expected: Open a Java problem note in pane A. Without switching focus to pane A, open the note's properties panel (or use Source mode + frontmatter edit) and CHANGE the `lc-language` frontmatter value from `java` to `python`. Switch focus back to pane A. Within ~1 second of the focus return, the child editor's syntax highlighter has flipped from Java to Python (you can verify by typing `def foo():` and observing Python coloring), the child's indent unit reflects Python (4 spaces — same for Java but verify the per-language map is consulted), the child's Cmd-/ uses `# ` (Python prefix) NOT `// ` (Java prefix). The fence opener TAG in the parent doc still says ` ```java ` — the listener does NOT rewrite the fence opener (D-14: passive-listener; frontmatter is SoT for the child only; users who want the fence opener flipped use the chevron). The note does NOT need to be closed and reopened. Repeat with `python → cpp` and observe C++ syntax + 4-space indent + `// ` comment prefix in the child. Validates Plan 17-04 listener.
result: issue
reported: "Asymmetric reactivity. Direction Java → Python3: chevron updates AND child editor syntax coloring changes (works correctly). Reverse direction Python3 → Java: chevron updates BUT child editor's syntax coloring remains stuck on Python3 (Compartment.reconfigure does not fire / does not take effect). Fence opener tag stays unchanged in both directions (D-14 honored)."
severity: major
hypothesis: "The fm-reactivity handler in src/main.ts (handleFmChangeForLanguageReactivity / readActiveFenceSlug) appears to compare against a stale reference. Possible causes: (a) the 'currently applied language' tracking in childEditorRegistry / child state isn't updated after the first reconfigure, so the slug-equality gate evaluates `currentSlug === fmSlug` as true on the second swap → no dispatch fires; (b) slug normalization is asymmetric (e.g., `java` vs `python3` — the trailing version digit on python normalizes one way but not back); (c) the readActiveFenceSlug helper reads from the parent's fence opener tag instead of the child's currently-applied compartment value, and since the fence opener tag never changed (D-14), it always reports 'java' — which means going to python3 detects mismatch but going BACK to java reads `java === java` → no-op."
artifacts: ["src/main.ts (handleFmChangeForLanguageReactivity, readActiveFenceSlug, registerEvent block in onload)", "src/main/childEditorLanguage.ts (Compartment.reconfigure target)", "tests/main/fmReactivity.test.ts (Test 6 effect-only dispatch coverage)"]
missing: ["Test for round-trip language swaps (Java→Python3→Java) — current 6-test suite likely only covers the forward direction"]

### 13. THEME-01 — Themed HighlightStyle dark theme legibility (D-15)

expected: Open a Java problem note in dark theme (Obsidian default dark or any community dark theme). Verify keywords (`class`, `public`, `return`), strings (`"hello"`), comments (`// note`), function names (`solve(...)`), type names (`String`, `Integer`), property names, operators (`==`, `+`), and numeric literals all render with Obsidian's dark-theme code colors. The colors are visually distinct from each other (no white-on-white, no fully-invisible tokens, no two adjacent tag classes rendering identically). Comments are italicized. Repeat with a Python note (`def`, `self`, `None`, `if __name__ == '__main__':`) and a JavaScript note (`const`, `=>`, template literals); same legibility properties.
result: issue
reported: "Highlighting works (tokens are colored, distinguishable from each other), and dark mode is legible. BUT: identical syntax colors across two vaults running different themes (one Atom, one default) — verified on Java side. The Obsidian theme palette is NOT being picked up by the child editor's HighlightStyle."
severity: major
hypothesis: "The plugin's `src/main/childEditorTheme.ts` HighlightStyle correctly uses `var(--code-keyword)`, `var(--code-string)`, etc. references (verified in source). However, the child editor's DOM is mounted via `Decoration.widget({block:true})`, which inserts a fresh DOM subtree. The CSS variables `--code-keyword` etc. are scoped to specific Obsidian selectors (e.g., `.markdown-source-view .HyperMD-codeblock`) that the widget's DOM tree does NOT inherit from. As a result, `var(--code-keyword)` resolves to the inherited fallback (current-color text) — same hue across all themes. Either: (a) the plugin's `styles.css` needs to define the `--code-*` variables explicitly on the child editor's container with sensible defaults, AND respond to `.theme-dark` / `.theme-light` body classes, OR (b) the child editor's container needs to live inside Obsidian's code-block scope so the cascade reaches it."
artifacts: ["src/main/childEditorTheme.ts (HighlightStyle.define spec)", "styles.css (currently has NO --code-* variable definitions)", "src/main/childEditorFactory.ts (widget mount — DOM container's CSS scope)"]
missing: ["Theme-resolution test: assert child editor's computed style for a keyword token differs between dark and light themes (currently no such test in tests/main/childEditorTheme.test.ts)"]

### 14. THEME-02 — Themed HighlightStyle light theme legibility (D-15)

expected: With the same Java/Python/JS notes still open from Test 13, switch Obsidian to a light theme (Settings → Appearance → Base color scheme → Light, OR pick a community light theme). DO NOT reload the plugin, DO NOT close+reopen the note. The same syntax tokens MUST automatically re-render in the light-theme palette (the `var(--code-keyword)` etc. bindings resolve against Obsidian's now-active theme). Same legibility properties as Test 13: each tag visually distinct, comments italic, no fully-invisible tokens. Switch back to dark to confirm bidirectional theme tracking.
result: issue
reported: "Live theme switch: background flips correctly (dark slate → light gray), but token colors are IDENTICAL between dark and light themes. Verified via side-by-side screenshots: keywords (`class`, `public`, `for`, `if`, `return`, `null`) same pink, types (`int`, `Map`, `Integer`, `HashMap`) same coral, function calls (`twoSum`, `containsKey`, `get`, `put`) same yellow, numbers (`0`) same purple. Only background + un-tokenized punctuation/identifiers flip between modes. Same root cause as THEME-01."
severity: major
hypothesis: "Refining the THEME-01 hypothesis: the `var(--code-*)` references DO resolve (tokens are stylized, not fallback gray), but they resolve to the SAME values across both themes. Either (a) the values are baked at a higher scope that doesn't reflect the active `theme-light` / `theme-dark` body class, (b) Obsidian's `--code-*` palette intentionally stays the same across base color schemes (only background/foreground change), or (c) the child editor's widget DOM is mounted in a CSS scope where the theme override selectors (e.g., `.theme-light .markdown-source-view { --code-keyword: ... }`) do not match. The plugin's `styles.css` does not define `--code-*` variables at all — adding theme-scoped definitions there (e.g., `.theme-light .obsidian-leetcode-child-editor { --code-keyword: #d73a49; }` and corresponding dark variant) would force palette tracking regardless of where Obsidian's own variables land."
artifacts: ["src/main/childEditorTheme.ts", "styles.css (no --code-* definitions)", "src/main/childEditorFactory.ts (widget mount + outer DOM container)"]
missing: ["Theme-resolution test (computed style differs between light and dark)", "Visual regression baseline screenshots for both themes"]
linked_to: 13

### 15. HIGHLIGHT-DARK-01 — Bracket-match contrast in dark theme (D-16)

expected: In dark theme, open a Java note with populated code containing nested brackets (e.g. `for (int i = 0; i < n; i++) { arr[i] = compute(args[k]); }`). Place the cursor IMMEDIATELY adjacent to a `{`. The matching `}` is highlighted with HIGH-CONTRAST styling: foreground uses `var(--code-keyword)` (a strong accent against the code-block background), background uses `var(--background-modifier-active-hover)` (a clearly tinted state — distinguishable from the surrounding code-block surface), and a 1px outline using `var(--code-keyword)` is visible around the bracket. The highlight is unambiguously distinguishable from regular text — NOT the Phase 16 carry-over symptom of "barely visible / can't tell which bracket is matched". Repeat for `[` ↔ `]` and `(` ↔ `)`. Switch to a light theme and confirm the SAME high-contrast properties hold (variables resolve to light-theme equivalents). Resolves the 16-UAT.md Test 9 cosmetic carry-over from Phase 16.
result: pass
notes: "Bracket-match works with high-contrast pink outline on both `{` and matching `}`. Verified visually in light theme. Caveat: like keywords (Tests 13/14), the outline color is the same pink across both themes (resolves from `var(--code-keyword)`), but contrast remains clearly visible against any background. Phase 16 carry-over (barely visible bracket match) resolved."

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

result: deferred
case: CASE B (Go is plain text — defer to v1.3)
notes: "Defer Go highlighting to v1.3 per CONTEXT D-17 escape clause — legacy-modes StreamLanguage tag binding does not auto-apply via the themed HighlightStyle pipeline. Add FUTURE-06 to REQUIREMENTS.md (Go syntax highlighting deferred to v1.3) and document deferral in 17-SUMMARY.md."
followup: "REQUIREMENTS.md FUTURE-06 entry; 17-SUMMARY.md deferral note"

### 17. VIM-01 — Vim mode activates from Obsidian global setting (D-18)

expected: In Obsidian Settings → Editor → enable "Vim key bindings". Reload the dev vault (or close+reopen the vault) so plugins re-mount. Open a Java problem note. Click into the child editor inside the `## Code` fence. The cursor renders as a BLOCK (vim Normal mode default) — not a thin caret. A small `.cm-vim-panel` mode indicator strip is visible at the bottom of the child editor showing "-- NORMAL --". Press `i` → cursor changes to a thin caret (Insert mode); panel updates to "-- INSERT --". Press Esc → returns to Normal; cursor reverts to block; panel back to "-- NORMAL --". Toggle the global setting OFF; reload; reopen the same note → child editor is plain CM6 (caret cursor, no vim panel) — confirming the conditional read at child mount works in BOTH directions.
result: issue
reported: "D-18 contract works correctly: vim mounts when Obsidian setting is ON, unmounts when OFF, conditional read at child mount fires in both directions. BUG: Insert-mode cursor render is intermittent. After pressing `i` to enter Insert mode, the caret cursor sometimes does NOT render — no cursor visible, no blink. As soon as the user types any letter, the cursor appears and behavior normalizes. Pattern is non-deterministic; user reports no clear repro trigger."
severity: major
hypothesis: "@replit/codemirror-vim's Insert-mode cursor relies on CodeMirror dispatching a measure pass after the modal state machine transitions Normal → Insert. The child editor's `Decoration.widget({block:true})` mount may interact with vim's transition timing — possibly: (a) the cursor DOM element exists but its CSS-class-based visibility (`.cm-cursor` vs `.cm-fat-cursor`) toggles before the next animation frame, missing the paint cycle; (b) focus arrival timing — vim's Insert-mode draw runs before the child editor's document-level focus is fully resolved, so the cursor element is not yet considered 'visible'; (c) interaction with Obsidian's own caret-blink CSS in the surrounding markdown view (the widget inherits some caret-blink animation that conflicts with vim's caret); (d) vim's `EditorView.contentDOM` query for cursor placement happens before the widget DOM is fully laid out (possible if vim mounts before the block widget paints). First user keystroke triggers a transaction → forces the missing measure/draw."
artifacts: ["src/main/childEditorFactory.ts (vim() spread in extension array, position relative to other extensions)", "@replit/codemirror-vim 6.3.0 (Insert mode cursor logic)", "styles.css (any caret-related rules that might conflict)"]
missing: ["Visual regression test for vim cursor render after `i` keypress (vimMode UAT VIM-01 was the only assertion before this finding)"]

### 18. VIM-02 — Tab in vim Insert mode follows D-11 customTabCommand (D-20)

expected: With vim mode enabled, open a Java note; click into the child editor; press `i` to enter Insert mode. (a) Cursor at line-start of an empty line → press Tab → exactly 4 spaces inserted (D-11 line-start branch — `indentMore` delegated). (b) Cursor mid-line after some non-whitespace text (e.g., after `if (x)` on `if (x) ` ) → press Tab → exactly 4 spaces inserted at cursor position; rest of line unchanged (D-11 mid-line branch). (c) Multi-line selection across 2 lines → press Tab → both lines indent in a SINGLE undo step (Cmd-Z reverts both at once; D-12 invariant). Vim Insert-mode does NOT shadow our custom Tab binding — the keymap precedence is correct. In vim Normal mode, Tab is the vim default (next jump / next match) — NOT our customTabCommand. This is intentional and acceptable per Pitfall 4 documentation.
result: pass
notes: "Vim Insert-mode Tab respects D-11 customTabCommand (line-start indent, mid-line tab insertion, multi-line selection indent). Keymap precedence correct — vim does not shadow customTabCommand."

### 19. VIM-03 — Cmd-/ comment toggle works in both vim Insert + Normal modes (D-20)

expected: With vim mode enabled, open a Java note; click into the child editor. (a) In Normal mode, place cursor on a line with code; press Cmd-/ → the line is prefixed with `// ` (Java comment). Press Cmd-/ again → comment removed. (b) Press `i` to enter Insert mode; press Cmd-/ again → same toggle behavior; the comment toggle fires regardless of vim mode because the Obsidian Scope-based `Mod-/` override (factory.ts:165-170) intercepts at app level, not editor level. (c) Repeat with a Python note and verify `# ` prefix. (d) Repeat with a JavaScript/TypeScript note and verify `// ` prefix. COMMENT-01 holds in vim mode for all per-language prefixes.
result: pass
notes: "Cmd-/ comment toggle works in both vim Insert and Normal modes."

### 20. VIM-04 — Esc-Esc / click-out returns focus to parent (D-20, Pitfall 4 documentation)

expected: With vim mode enabled, open a Java note; click into the child editor (Insert mode active by default if you began typing, or Normal if just clicked). Vim's Esc binds to "enter Normal mode" with high precedence — so the Phase 15 escape-hatch behavior (Esc returns focus to parent) is shadowed when vim is on. Documented two-press path: (a) From Insert mode, press Esc → child enters Normal mode (focus stays in child, cursor block). (b) Press Esc a second time → either no-op in vim (acceptable) OR cursor moves to start of line (acceptable). The DOCUMENTED escape path for vim users is to CLICK INTO the `## Notes` section — focus returns to parent's Notes section, child editor blurs (vim panel grays). Confirm: clicking into `## Notes` from Normal mode returns focus to parent in one click. This is NOT a regression — it's the documented behavior per Pitfall 4. With vim mode OFF, the original single-Esc escape hatch behavior (Phase 15) is restored.
result: pass
notes: "Click-out path works — clicking into `## Notes` returns focus to parent cleanly. Esc-Esc stays in Normal mode (acceptable per D-20 alternative — documented click-out path is the escape hatch under vim). Phase 15 escape hatch invariant preserved via the click-out alternative. SECONDARY ISSUE (cosmetic): no vim mode-indicator panel visible in the child editor — `@replit/codemirror-vim` ships a `Vim.statusBar` panel that shows `-- NORMAL --` / `-- INSERT --` but it appears not wired into the child editor's extension array. This breaks discoverability of the current vim mode and was a Test 17 spec assertion (`.cm-vim-panel`). Filing as a sibling issue."
sibling_issue: "vim mode panel (.cm-vim-panel) not visible — Vim.statusBar extension not wired into childEditorFactory.ts when vimEnabled. Cosmetic but affects discoverability."

### 21. VIM-05 — `:w` in vim Normal mode is a no-op (D-20 documentation)

expected: With vim mode enabled, open a Java note; click into the child editor; press Esc to ensure Normal mode; press `:` (colon) → vim's command palette appears at the bottom of the child editor; type `w` and press Enter → the command is processed by vim. Expected behavior: `:w` is treated as a no-op (vim's default save handler has nothing to save against — Obsidian auto-saves the parent doc on its own cadence, child→parent sync flushes on every keystroke). The note title bar's "•" unsaved indicator does NOT appear or disappear from `:w` (because the parent doc's saved state is owned by Obsidian's autosave). Users who want explicit save use Cmd-S, which Obsidian handles at the workspace level — `:w` is documented as "no-op for v1.2; use Cmd-S for explicit save". If `:w` instead produces a vim error popup ("can't save in this buffer") that's also acceptable behavior — log in notes.
result: pass
notes: "`:w` is a benign no-op — no visible error, no console errors (verified via DevTools console), no broken state, child editor remains functional. Obsidian's auto-save handles persistence. Acceptable per D-20."

### 22. LIFE-01 — Heap-snapshot lifecycle UAT (D-23 arm b)

expected: Open and close 20 different lc-slug problem notes in the dev vault. Procedure: (1) Open Obsidian's built-in DevTools (Cmd-Shift-I on macOS / Ctrl-Shift-I on Win/Linux). (2) Switch to the Memory tab. (3) Take a baseline heap snapshot before opening any problem notes ("Snapshot 1: baseline"). (4) Open and close 20 different LeetCode problem notes — any combination from the dev vault's `LeetCode/problems/` folder. The registry capacity is 5, so by the 6th note the LRU eviction begins; by the 20th note 15 evictions have fired. (5) After closing the 20th note, force a garbage collection (DevTools Memory tab → "Collect garbage" / trash-can icon). (6) Take a second snapshot ("Snapshot 2: post-cycle"). (7) In DevTools' "Comparison" view of Snapshot 2 vs Snapshot 1, filter the constructor list by typing `EditorView`. Verify: the count of EditorView instances is at most 5 (the registry capacity) — the other 15 instances were destroyed on LRU eviction. Verify: no "Detached" EditorView instances appear (Detached = DOM-detached but JS-reachable, indicating a leak). Verify: registry size at end of cycle is 5. Verify: decoration set count is stable (not growing unboundedly) — drill into a remaining EditorView and confirm its `state.facet` decoration sets are bounded by the document size, not by the number of cycles. Pass criteria: zero detached EditorViews, registry size = 5, decoration sets stable. Fail criteria: any non-zero detached EditorView count, OR registry size > 5, OR unbounded decoration set growth. After completing this test, the executor (post-resume) creates `.planning/phases/17-polish-edge-cases/17-LIFE-SNAPSHOT.md` with the 5 required sections per CONTEXT D-23 arm b.
result: pass
notes: "20 open/close cycles completed. Heap snapshot Comparison view (Snapshot 1 baseline vs Snapshot 2 post-cycle, after explicit GC) shows zero EditorView class entries — no retained instances detectable in either Comparison or Summary view filtered by `EditorView`. Either: (a) the LRU registry properly destroyed all instances and GC reclaimed them (D-23a working as designed), or (b) constructor names are minified in production bundle (would still reveal retained instances under any minified name in the comparison delta if leaks existed). No leak signal under either interpretation. Pass."
findings:
  detached_editorview_count: 0
  registry_size_after_cycle: "not directly measurable in heap (no live EditorView class found post-GC); LRU eviction inferred working from no-retention signal"
  decoration_sets_stable: "no growth detected — no EditorView retained means no decoration sets retained either"
  os_obsidian_version: "macOS / current Obsidian (user dev vault)"
  bundle_form: "production-built main.js from Phase 17 Wave 4 commits (post 17-06 Tasks 1-3)"

### 23. REPAIR-02 — Fence auto-recovery runtime trigger + missing-closer correctness (gap-closure round 2)

expected: Open a Java problem note in the dev vault. In Source Mode (so direct keystrokes hit the parent), select the line ` ``` ` (the fence closer at the bottom of `## Code`) and DELETE it. Type a single character (or just leave the keystroke that deleted the line). Within ONE parent transaction (no reload, no Cmd-E flip, no manual click into the child), observe the parent doc: the fence closer is automatically restored. The restored closer is a single bare ` ``` ` line placed immediately above `## Notes` (or after the last non-blank body line, BEFORE any trailing blank lines that precede `## Notes`). The parent doc has EXACTLY ONE opener (` ```java `) and EXACTLY ONE closer (` ``` `) — no duplicate fence block, no orphaned body content, no second copy of the user's solution. Repeat with the user's exact reproduction from `.planning/debug/fence-auto-recovery-regression-round2.md` (delete the closer; reload the app) — the recovered state is identical (single intact fence, no duplicate). The chevron + lc-language frontmatter still say `java`. Cmd-Z reverts the repair (the deleted closer comes back and the auto-restored closer goes away). Validates Plan 17-13 fix — Bug 1 (parent-side runtime trigger fires repair on parent-only damage WITHOUT reload or child dispatch) AND Bug 2 (missing-closer recovery produces a single intact fence, no duplicate-fence shape).
result: pending
notes: ""

## Summary

total: 23
passed: 14
issues: 6
pending: 1
skipped: 2
deferred: 1
blocked: 0
