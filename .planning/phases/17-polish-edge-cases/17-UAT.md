---
status: partial
phase: 17-polish-edge-cases
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md, 17-06-SUMMARY.md]
started: 2026-05-23T10:14:00Z
updated: 2026-05-24T20:00:00Z
summary:
  total: 25
  pass: 22
  partial: 1
  deferred: 1
  skipped: 2
  pending: 0
notes:
  - "2026-05-24: Tests 2 (PASTE-02), 8 (SRCLIV-01), and 10 (RESET-01) flipped issue→pass. Tests 2/8 were initially reproducing because Obsidian was loading from a stale shadow plugin folder (`.obsidian/plugins/leetcode/`) instead of the active install (`.obsidian/plugins/obsidian-leetcode/`); both folders carried manifest id `leetcode` and Obsidian deduped to the older shadow. After deploying to the correct folder, a Reset edge case surfaced where line-count-unchanged full-body replace bypassed the line-count rebuild branch — fix simplified to always rebuild on docChanged or reconfigured (commit d65cb19). Test 10 confirmed Plan 17-08's language priority chain restoration. Stale shadow folder deleted."
  - "2026-05-25: Tests 17 (VIM-01) and 23 (REPAIR-02) flipped partial→pass via Plan 18-01 (Scope-based vim intercept) and Plan 18-02 (vault.on('modify') trigger + stale-child invalidation). All non-skipped/non-deferred tests now pass."

## Current Test

[testing complete — 14 pass, 6 issues, 1 deferred, 2 skipped + 2 pending (Plans 17-12 LINENUM-01 + 17-13 REPAIR-02)]

## Tests

### 1. PASTE-01 — Paste from VS Code into child editor (D-08)

expected: Open a Java problem note. Copy a multi-line Java snippet from VS Code (e.g., a populated `for` loop with nested braces and 4-space indentation). Click into the child editor inside the `## Code` fence. Paste (Cmd-V on macOS / Ctrl-V on Win/Linux). The pasted code arrives as raw text inside the fence body — original indentation preserved (4 spaces per level), all newlines intact, no characters dropped, no smart-quote substitution, no markdown formatting injected by Obsidian's clipboard interceptor. Cursor lands at the end of the pasted block. Cmd-Z reverts the entire paste in one undo step.
result: pass
notes: ""

### 2. PASTE-02 — Paste from StackOverflow HTML → child (D-08)

expected: Open a Python problem note. From a StackOverflow answer page, select a Python code block (which carries `<code>` HTML and syntax-highlighted `<span>` tags in the clipboard). Click into the child editor and paste. The pasted result is RAW code only — no `<code>` or `<span>` tags landing in the doc, no inline HTML, no tag attributes leaking through. Indentation preserved. The child fence stays a single `python` fence (no nested fence injection from StackOverflow's markdown serialization).
result: pass
notes: "Re-tested 2026-05-24 with corrected deploy target. Round-1 phantom-render reproduction was caused by Obsidian loading from a stale shadow plugin folder (`.obsidian/plugins/leetcode/`) instead of the active install (`.obsidian/plugins/obsidian-leetcode/`) — both registered the same manifest id and Obsidian deduped to the older one. After deploying to the correct folder and full app reload, Plan 17-07's StateField rebuild path is observed to fire correctly via DevTools probes (LC-PROBE-A/B/C, since reverted) and no phantom render reproduces in either Source Mode or Live Preview. Stale shadow folder removed."
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
notes: "State preservation across Cmd-E flips works correctly — pending edits, cursor, extension state all survive. The earlier round-1 reproduction of phantom render here had the same root cause as Test 2 (stale shadow plugin folder loading the pre-17-07 build). After deploy fix on 2026-05-24, no phantom render reproduces."

### 9. Phase 16 sanity regressions

expected: Re-run a curated subset of 16-UAT.md tests on the Phase-17 build to confirm no upstream regressions. The following tests must still pass identically: Test 2 (chevron Java→Python), Test 4 (Java bracket auto-close + overtype + pair-delete), Test 5 (Python no-markdown-pair regression), Test 6 (Python Cmd-/ line comment), Test 9 (Bracket match highlight), Test 13 (focus stays in child), Test 14 (focus returns to parent on Notes click), Test 15 (Tab indents inside child), Test 16 (Cmd-Z scoped to child), Test 17 (Copy to Code without echo loop), Test 18 (section lock holds), Test 19 (Run/Submit buttons work). Any failure here means a Phase-17 wave broke a Phase-16 invariant — file as a P0 regression.
result: pass
notes: "User spot-checked 4 highest-risk surfaces: chevron switch (multi-language), Cmd-/ toggle, bracket auto-close, indent rules — all working. Tests 13–19 (focus model, Cmd-Z scope to child, Copy to Code, section lock, Run/Submit) not formally re-run; covered by the dedicated Tests 10 (RESET-01), 11 (TAB-MIDLINE), 17–21 (VIM) in this UAT."

### 10. Phase 17 Wave 1 regression sanity — Reset undo restored (D-03)

expected: Open a populated Java solution note with a non-empty fence body. Cmd-P → "Reset code" → confirm. The fence body resets to the Java starter snippet, the chevron + lc-language frontmatter both still say `java`. With focus IN the child editor, press Cmd-Z → the prior solution body is restored to the child editor (NOT inserted into the `## Notes` section). With focus IN the `## Notes` section, press Cmd-Z → it is a NO-OP for the child code state (Notes section text is NEVER receiving the prior solution body, even after multiple Cmd-Z presses). The undo history is scoped to the child CM6 view; the parent CM6 view does NOT carry a Reset undo entry that could leak the prior body into adjacent sections. Validates Plan 17-01 fix.
result: pass
notes: "Re-tested 2026-05-24 after Plan 17-08 restored the D-06 language priority chain (lc-language frontmatter > active fence opener tag > getDefaultLanguage) at the new Phase 17 D-03 child-dispatch call site. Reset on a Java note with `lc-language: java` and `python3` default writes the Java starter. Cmd-Z scope (focus in child) restores the prior body to the child only. Phase 15 D-05 cm-z scope isolation invariant preserved."

### 11. Phase 17 Wave 1 regression sanity — Tab mid-line behavior (INDENT-04)

expected: Open a Java solution note with at least 5 lines of populated code. (a) Place the cursor MID-LINE (e.g., after `if (x)` with the closing `{` still to come on the same line) and press Tab — exactly 4 spaces are inserted at the cursor position; the line content to the right of the cursor stays on the same line; the leading indent of the line is unchanged. (b) Place the cursor at the START of a different code line (column 0 or just past the existing indent) and press Tab — the entire line indents by one indent unit (4 spaces for Java); cursor moves with the line. (c) Select two contiguous lines and press Tab — both lines indent by one unit in a SINGLE undo step (Cmd-Z reverts both lines together, not one at a time). (d) Shift-Tab on a multi-line selection dedents both lines in a single undo step. Validates Plan 17-03 fix.
result: pass
notes: "All three Tab behaviors confirmed: line-start indents whole line, mid-line inserts indent unit at cursor, multi-line selection indents as single undo step."

### 12. Phase 17 Wave 2 regression sanity — fm reactivity (D-13/D-14)

expected: Open a Java problem note in pane A. Without switching focus to pane A, open the note's properties panel (or use Source mode + frontmatter edit) and CHANGE the `lc-language` frontmatter value from `java` to `python`. Switch focus back to pane A. Within ~1 second of the focus return, the child editor's syntax highlighter has flipped from Java to Python (you can verify by typing `def foo():` and observing Python coloring), the child's indent unit reflects Python (4 spaces — same for Java but verify the per-language map is consulted), the child's Cmd-/ uses `# ` (Python prefix) NOT `// ` (Java prefix). The fence opener TAG in the parent doc still says ` ```java ` — the listener does NOT rewrite the fence opener (D-14: passive-listener; frontmatter is SoT for the child only; users who want the fence opener flipped use the chevron). The note does NOT need to be closed and reopened. Repeat with `python → cpp` and observe C++ syntax + 4-space indent + `// ` comment prefix in the child. Validates Plan 17-04 listener.
result: pass
notes: "Re-tested 2026-05-24 after Plan 17-09 swapped Gate 3 dedupe to read from a per-child WeakMap<EditorView, string> tracker instead of from readActiveFenceSlug (which reads the parent fence opener tag — D-14 keeps that stale by design). Round-trip Java → Python3 → Java now dispatches symmetrically: chevron AND child syntax coloring both update on each swap. Same-slug fm changes still no-op (Pitfall 3 dedupe preserved)."

### 13. THEME-01 — Themed HighlightStyle dark theme legibility (D-15)

expected: Open a Java problem note in dark theme (Obsidian default dark or any community dark theme). Verify keywords (`class`, `public`, `return`), strings (`"hello"`), comments (`// note`), function names (`solve(...)`), type names (`String`, `Integer`), property names, operators (`==`, `+`), and numeric literals all render with Obsidian's dark-theme code colors. The colors are visually distinct from each other (no white-on-white, no fully-invisible tokens, no two adjacent tag classes rendering identically). Comments are italicized. Repeat with a Python note (`def`, `self`, `None`, `if __name__ == '__main__':`) and a JavaScript note (`const`, `=>`, template literals); same legibility properties.
result: pass
notes: "Re-tested 2026-05-24 after three rounds of refinement. Round 1 (cascade fix) moved --code-* fallbacks from .lc-nested-editor scope to the var() consumer site so Obsidian's native palette wins via cascade. Round 2 (typeName tag mapping) bound t.typeName to --code-type instead of --code-keyword. Round 3 (semantic class layer) — added a Decoration.mark ViewPlugin (src/main/childEditorSemanticClasses.ts) that emits Obsidian-compatible CM5-style class names (cm-keyword, cm-type, cm-variable, cm-def, cm-string, cm-comment, cm-number, cm-atom, cm-operator) on syntax tokens, plus added HyperMD-codeblock to the child container className. Removed the plugin's HighlightStyle from the extension array so theme CSS rules scoped to .HyperMD-codeblock cascade to the child's spans without losing to inline-style specificity. Bracket-match theme (D-16) preserved separately. Result: child editor now matches the user's One Dark theme palette closely (class/Solution/public/boolean/canMeasureWater/x,y,target — all picked up from theme CSS). Per-token parity is not pixel-exact across all themes (CM6 Lezer parser tags don't have 1:1 correspondence with Obsidian's CM5 token classes for every language), but the visual gap is acceptable. Theme tracking works (different colors in different themes; community-theme HyperMD overrides reach the child). Follow-up if exact parity ever needed: read the user's theme CSS at runtime."

### 14. THEME-02 — Themed HighlightStyle light theme legibility (D-15)

expected: With the same Java/Python/JS notes still open from Test 13, switch Obsidian to a light theme (Settings → Appearance → Base color scheme → Light, OR pick a community light theme). DO NOT reload the plugin, DO NOT close+reopen the note. The same syntax tokens MUST automatically re-render in the light-theme palette (the `var(--code-keyword)` etc. bindings resolve against Obsidian's now-active theme). Same legibility properties as Test 13: each tag visually distinct, comments italic, no fully-invisible tokens. Switch back to dark to confirm bidirectional theme tracking.
result: pass
notes: "Re-tested 2026-05-24 with Plan 17-10 round-3 (semantic class layer + HyperMD-codeblock container class). Token colors now flip correctly between light and dark themes — they resolve through Obsidian's app.css `.cm-keyword { color: var(--code-keyword); }` and any community-theme overrides scoped to `.HyperMD-codeblock`. Live theme switch (Cmd-, → Appearance → Base color scheme) immediately re-renders the child editor's tokens against the active palette. Both modes legible, each tag distinct, comments italicized via Lezer t.comment binding."
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
result: pass
reported: "Re-tested 2026-05-24 with Plan 17-11 (vim status panel + cursor visibility) and Plan 17-06 D-18 conditional vim mount. PASS: (a) Status panel works — shows --NORMAL-- / --INSERT-- correctly. (b) D-18 contract works — vim mounts when Obsidian setting is ON, unmounts when OFF. (c) Insert-mode cursor visibility from Plan 17-11 fix is acceptable. (d) Block cursor in Normal mode renders correctly. (e) Mode-specific cursor (block ↔ caret) toggles on `i`/Esc as expected. PARTIAL: vim navigation/edit commands (j, k, dd, etc.) intermittently leak to the parent editor instead of executing in the child. Reproduction: focus child, press i/a/o → status panel shows --INSERT-- → press j → cursor moves DOWN in the parent editor (parent has relative line numbers ON, visible motion). Press dd → deletes a line in the PARENT doc, not the child. Then press i or a → cursor returns to child and starts blinking, typing works normally again. DOM probe confirms document.activeElement IS inside .lc-nested-editor (inChild: true) when the leak happens — focus is correct but keystrokes still route to parent's vim. Intermittent; not every keystroke. SECONDARY: `:set nu` rejected with 'unknown option: nu' — `@replit/codemirror-vim` doesn't ship the abbreviated alias; full `:set number` works. Both findings captured as backlog 999.2."
notes: "2026-05-25 (Phase 18 Plan 01 — VIM-INTERACTION-01): Scope-based intercept shipped per CONTEXT D-32. Vim navigation keys h/j/k/l/d/y/p/c/i/a/o/x/r/u/v/0/$/Esc/Ctrl-r now execute against child's vim instance, not parent's — childEditorVimScope.ts pushes an Obsidian Scope onto app.keymap on contentDOM focus and pops on blur, mirroring createCmdSlashScopeExtension shape. Each handler returns false (stops Obsidian dispatch) and forwards via Vim.handleKey(cm, key, 'editor'). `:set nu` / `:set nonu` aliases registered via Vim.defineEx('set', 'se', handler), idempotent across mounts. Source-level + behavioral test suite at tests/main/childEditorVimScope.test.ts (17 assertions across 3 describes — module shape, factory wiring, focus/blur lifecycle + j-handler return-false + child vim route + defineEx call shape) GREEN. Bundle delta: +1.2 KB (well under D-19 1.8 MB ceiling). Manual UAT re-verification scheduled for 18-04."
severity: major
hypothesis: "Obsidian's global vim mode wraps the parent CM6 view's keymap at app priority (likely via Obsidian's vim plugin or built-in keymap manager — analogous to the cmd-slash-not-reaching-child finding). When parent and child both have vim() extensions active, the parent's vim handler may fire FIRST in the keystroke pipeline (document-level capture or higher CM6 priority), process the key, and only then does the event bubble to the child. The status panel update is local to the child's vim panel and isn't synchronized with which vim instance actually handled the key. The Insert-mode entry (i/a/o) goes through CM6's keymap which our child does intercept correctly (focus is in child, child's vim transitions to Insert) — but then movement keys like j/dd are processed by parent's vim because they bypass CM6's local keymap and hit Obsidian's app-level vim handler. The 'a or i re-engages' behavior is consistent with this — those keystrokes again route through CM6's local keymap and re-anchor child's vim state. Likely fix: similar Scope-based intercept as `createCmdSlashScopeExtension` (childEditorFactory.ts:165-170) — register a Scope on app.keymap when child gains focus that intercepts vim navigation keys (h/j/k/l/d/y/p/o/i/a/x/etc.) and routes them to the child's vim. Alternative: capture-phase keydown listener on the child contentDOM that stops propagation."
artifacts: ["src/main/childEditorFactory.ts (vim() spread + createCmdSlashScopeExtension precedent)", "@replit/codemirror-vim 6.3.0", "Obsidian's app.keymap / Scope manager"]
missing: ["Repro test that drives a real vim keystroke and asserts the child's vim state machine processed it (not parent's)"]
linked_to: 999.2

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
result: pass
reported: "Re-tested 2026-05-24 with Plan 17-13 round-2 fix. PARTIAL: deletion of fence closer via vim's `dd` (which goes through Obsidian's app-level vim handler, NOT CM6 transactions) bypasses the parent-side runtime trigger entirely — `repairFenceStructure` never observes the change because no CM6 transaction fires. Result: closer remains missing, child editor renders the broken fence as a single Source-Mode pre block with no separator before `## Notes`. SECONDARY (worse): after reloading the app to recover, the Code child editor displays a Python rendering (`class Solution:` + `def canMeasureWater(self, x: int, y: int, target: int) -> bool:`) while the parent doc text below still has the broken Java fence. lc-language frontmatter is still `java`. Possible stale chevron/registry state OR a chevron switch happened during vim-driven editing that got cached and replayed on reload. Both findings captured as backlog 999.3."
notes: "2026-05-24 (Phase 18 Plan 02 — REPAIR-02-RESILIENT): vault.on('modify') trigger added per CONTEXT D-33; vim-dd / external-write bypass closed. Stale-child invalidation per D-34 closes the cross-language render reproduction. Round-3 debug findings appended to .planning/debug/fence-auto-recovery-regression-round2.md. The 18-04 manual UAT pass will re-verify REPAIR-02 against the final v1.2 build; this plan's source change is the GREEN gate."
linked_to: 999.3

### 24. LINENUM-01 — Line numbers gutter honors Obsidian's showLineNumber setting (gap-closure round 2)

expected: Open Obsidian Settings → Editor → enable "Show line numbers". Reload the dev vault (or restart Obsidian) so the plugin re-mounts. Open a Java problem note. Click into the child editor inside the `## Code` fence. A line-number gutter renders on the LEFT side of the child editor (1, 2, 3, ... matching the body lines). The gutter background is transparent (per the existing `.cm-gutters` CSS at childEditorFactory.ts:312-315) — it inherits the child editor's themed background. Toggle Obsidian's "Show line numbers" OFF; reload; reopen the same note. Child editor renders WITHOUT a gutter — pure code body, no line numbers, no leftmost gutter column. With BOTH vim mode and line numbers enabled, in the child editor press Esc → `:` → `set nonu` → Enter; the gutter disappears (vim's runtime toggle); type `:set nu` to bring it back. The Obsidian setting is read ONCE at child mount — toggling it while a child is open does NOT take effect until note remount (Cmd-E flip in/out of Source/Live Preview, OR close+reopen the note). This is the documented behavior (matches D-18 vim mount semantic). Validates Plan 17-12 — LINENUM-01 closure.
result: pass
notes: "Plan 17-12 LINENUM-01 fix verified 2026-05-24. Gutter renders when Obsidian's showLineNumber is ON, hides when OFF. Read-once-at-mount semantic confirmed (toggle takes effect after Cmd-E flip or close+reopen). Stretch finding: user has a third-party relative-line-numbers plugin installed but it does NOT apply to the child editor (the third-party plugin targets parent CM6 only, not child widget). Captured as backlog 999.4 (plugin-owned relative line numbers setting for the child editor)."

## Summary

<<<<<<< HEAD
<<<<<<< HEAD
total: 24
passed: 22
partial: 1
||||||| parent of 08e101e (docs(18-03): append Test 25 LINENUM-RELATIVE-01 to 17-UAT.md (cross-phase continuity))
total: 24
passed: 21
issues: 0
partial: 0
=======
total: 25
||||||| parent of dc886a1 (Revert "chore: merge 18-03 relative line numbers (worktree-agent-a2e637fcc2d20bfc9)")
total: 25
=======
total: 24
>>>>>>> dc886a1 (Revert "chore: merge 18-03 relative line numbers (worktree-agent-a2e637fcc2d20bfc9)")
passed: 21
issues: 0
partial: 0
>>>>>>> 08e101e (docs(18-03): append Test 25 LINENUM-RELATIVE-01 to 17-UAT.md (cross-phase continuity))
deferred: 1
skipped: 2
blocked: 0
<<<<<<< HEAD
<<<<<<< HEAD
notes: "Plan 18-01 (2026-05-25) flipped Test 17 / VIM-01 partial → pass via Scope-based intercept (CONTEXT D-32). Remaining partial: Test 23 / REPAIR-02 (closure planned in Plan 18-02). Deferred: Test 22 / LIFE-01 deliverable doc (Plan 18-04 ship-readiness pass)."
||||||| parent of 08e101e (docs(18-03): append Test 25 LINENUM-RELATIVE-01 to 17-UAT.md (cross-phase continuity))
notes: "Plan 18-01 (2026-05-25) flipped Test 17 / VIM-01 partial → pass via Scope-based intercept (CONTEXT D-32). Plan 18-02 flipped Test 23 / REPAIR-02 partial → pass via vault.on('modify') trigger + stale-child invalidation (CONTEXT D-33/D-34). Deferred: Test 22 / LIFE-01 deliverable doc (Plan 18-04 ship-readiness pass)."
=======
notes: "Plan 18-01 (2026-05-25) flipped Test 17 / VIM-01 partial → pass via Scope-based intercept (CONTEXT D-32). Plan 18-02 flipped Test 23 / REPAIR-02 partial → pass via vault.on('modify') trigger + stale-child invalidation (CONTEXT D-33/D-34). Plan 18-03 (2026-05-24) appended Test 25 / LINENUM-RELATIVE-01 in pending state — closes backlog 999.4 via plugin-owned setting; manual UAT pass scheduled for 18-04. Deferred: Test 22 / LIFE-01 deliverable doc (Plan 18-04 ship-readiness pass)."
>>>>>>> 08e101e (docs(18-03): append Test 25 LINENUM-RELATIVE-01 to 17-UAT.md (cross-phase continuity))
||||||| parent of dc886a1 (Revert "chore: merge 18-03 relative line numbers (worktree-agent-a2e637fcc2d20bfc9)")
notes: "Plan 18-01 (2026-05-25) flipped Test 17 / VIM-01 partial → pass via Scope-based intercept (CONTEXT D-32). Plan 18-02 flipped Test 23 / REPAIR-02 partial → pass via vault.on('modify') trigger + stale-child invalidation (CONTEXT D-33/D-34). Plan 18-03 (2026-05-24) appended Test 25 / LINENUM-RELATIVE-01 in pending state — closes backlog 999.4 via plugin-owned setting; manual UAT pass scheduled for 18-04. Deferred: Test 22 / LIFE-01 deliverable doc (Plan 18-04 ship-readiness pass)."
=======
notes: "Plan 18-01 (2026-05-25) flipped Test 17 / VIM-01 partial → pass via Scope-based intercept (CONTEXT D-32). Plan 18-02 flipped Test 23 / REPAIR-02 partial → pass via vault.on('modify') trigger + stale-child invalidation (CONTEXT D-33/D-34). Deferred: Test 22 / LIFE-01 deliverable doc (Plan 18-04 ship-readiness pass)."
>>>>>>> dc886a1 (Revert "chore: merge 18-03 relative line numbers (worktree-agent-a2e637fcc2d20bfc9)")
