---
status: testing
phase: 16-language-packs-switching
source: [16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-04-SUMMARY.md, 16-05-SUMMARY.md]
started: 2026-05-22T20:25:00Z
updated: 2026-05-22T22:15:00Z
---

## Current Test

number: 7
name: Java Cmd-/ line comment (COMMENT-01)
expected: |
  In a Java fence — place cursor on a code line, press Cmd-/ (Mac) or Ctrl-/ (Win/Linux). Line gets `// ` prefix. Press Cmd-/ again → prefix removed. (Test 8 will verify Go right after.)
awaiting: user response

## Tests

### 1. Pre-flight — fresh build + plugin reload
expected: npm run build produces latest main.js (~1.5MB), plugin reloads cleanly, a Java problem note opens with the existing lc-slug frontmatter intact.
result: pass

### 2. Chevron switch from Java → Python (LANG-01)
expected: Click the chevron on the fence opener, switch to Python. Fence opener flips to ```python instantly. Body content swaps to Python starter code. Indent unit visible as 4 spaces. Cursor is preserved or sensibly placed at body start. NO scroll jump. NO note re-open or leaf flicker.
result: pass
notes: "Initial fail traced to debug session chevron-switch-child-body-stale.md (parent externalChangeListener filtered 'leetcode.*' too broadly). Fix landed in src/main/nestedEditorExtension.ts via narrowed ECHO_PRONE_USER_EVENTS set. Re-tested in dev vault: content updates and syntax highlight flip correctly."

### 3. 8-language sequence (LANG-01 + INDENT-04)
expected: Switch through python3 → java → cpp → c → javascript → typescript → golang → rust → python3 via the chevron. Each switch is visually instantaneous. Indent units update per D-05: 4 spaces for Java/Python/C++/C/Rust, 2 spaces for JS/TS, real tab for Go. Zero console errors in DevTools.
result: pass
notes: "User switched around all 8 languages; starter code reflected and syntax highlight is good for 7 of 8. Go is plain text — already logged as separate gap (test 3 secondary)."

### 4. Java bracket auto-close + overtype + pair-delete (BRACKET-01/03/04)
expected: In a Java fence — type `{` → observe `{}` auto-closes (BRACKET-01). Position cursor between, press Backspace → both `{` and `}` deleted (BRACKET-04). Type `(` (auto-pairs to `()`), then type `)` over the auto-inserted closer → observe single `)`, no `))` (BRACKET-03).
result: pass

### 5. Python no-markdown-pair regression (BRACKET-02 / D-10)
expected: In a Python fence — type `*` → NO auto-pair fires. Type `_` → NO auto-pair fires. (Markdown pair behavior is intentionally absent in the child editor.)
result: pass

### 6. Python Cmd-/ line comment (COMMENT-01)
expected: In a Python fence — place cursor on a code line, press Cmd-/ (Mac) or Ctrl-/ (Win/Linux). Line gets `# ` prefix. Press Cmd-/ again → prefix removed.
result: pass
notes: "Initial fail (Obsidian's editor:toggle-comments hijacked Cmd-/). Two iterations: bubble-phase domEventHandlers (failed), then capture-phase document/window listeners (failed — Obsidian's hotkey doesn't go through DOM). Final fix: push Obsidian Scope on focus, register Mod-/ inside the Scope. User confirmed: 'wow the test looks good, it works !'."

### 7. Java Cmd-/ line comment (COMMENT-01)
expected: In a Java fence — Cmd-/ on a code line adds `// ` prefix. Press again to remove.
result: [pending]

### 8. Go Cmd-/ line comment (COMMENT-01 / Pitfall E gate)
expected: In a Go fence — Cmd-/ on a code line adds `// ` prefix. Press again to remove. (Automated test passed; visual confirmation expected — if this fails it triggers Pitfall E remediation.)
result: [pending]

### 9. Bracket match highlight (HIGHLIGHT-01 / D-15)
expected: Position cursor adjacent to a `{` in any fence — observe BOTH the `{` and its matching `}` are visually highlighted.
result: [pending]

### 10. Java Enter after `{` indents (ENTER-02)
expected: In a Java fence on a fresh empty line, type `if (x) {` and press Enter. The new line is indented one level deeper than the `if` line (4 spaces beyond).
result: [pending]

### 11. Python Enter after `:` indents (ENTER-03)
expected: In a Python fence on a fresh empty line, type `def foo():` and press Enter. The new line is indented one level deeper than the `def` line (4 spaces beyond).
result: [pending]

### 12. Java Enter between `{|}` splits 3 lines (ENTER-04)
expected: In a Java fence, type `{` (auto-pairs to `{}` with cursor between), then press Enter. Result: `{` on line N, an indented blank line on line N+1 with the cursor on it, `}` on line N+2 aligned with the original `{` line's indent.
result: [pending]

### 13. Phase 15 regression — focus stays in child
expected: Click into the child editor body — focus stays in the child (does not bounce up to the parent).
result: [pending]

### 14. Phase 15 regression — focus returns to parent on Notes click
expected: Click into the ## Notes section — focus returns to the parent editor.
result: [pending]

### 15. Phase 15 regression — Tab indents inside child
expected: With cursor in the child editor, press Tab. The line indents (it does NOT move focus elsewhere).
result: [pending]

### 16. Phase 15 regression — Cmd-Z scoped to child
expected: Make an edit in the child, then Cmd-Z. Only the child edit is undone; ## Notes section content is unchanged.
result: [pending]

### 17. Phase 14 regression — Copy to Code without echo loop
expected: Trigger Copy to Code from a past submission. The child editor updates with the copied code; no echo loop / no duplicated content.
result: pass
notes: "Confirmed during chevron-fix retest: past submission retrieval works, content updates cleanly."

### 18. Phase 5.5 regression — section lock holds
expected: Try to type into the ## Problem section. The keystroke is dropped (no-op). The section lock is intact.
result: [pending]

### 19. Phase 5.4 regression — Run/Submit buttons work
expected: Click the Run button in the action row → solution executes against LeetCode test cases. Click Submit → submission goes through. Both still work end-to-end.
result: [pending]

### 20. Bundle ceiling decision
expected: Phase 16 bundle is 1,577,935 bytes raw / 418,581 bytes gzipped (+297 KB raw / +106 KB gz vs baseline). Within CLAUDE.md's ~1.5 MB v1.2 architectural ceiling, but over `scripts/check-bundle-size.mjs` HARD_LIMIT (1,300,000). Choose: A) bump HARD_LIMIT to 1,600,000 / SOFT_WARN to 1,440,000 (recommended — same precedent as Phase 07-03/08-02 bumps); B) defer to Phase 17 to investigate dynamic-import; C) accept regression-gate failing for Phase 16, revisit in polish. Reply with "A", "B", or "C".
result: [pending]

## Summary

total: 20
passed: 6
issues: 1
pending: 13
skipped: 0
blocked: 0

## Gaps

- truth: "Chevron switch updates child editor body to new language starter code without note reload"
  status: resolved
  reason: "User reported: the sync is not happening, upon change the language, the content remain the same with old language, syntax highlight seems to be fine though, i believe the note is update with starter code, just the edit is not syncing, cuz when I reload the app, the starter code reflected"
  severity: major
  test: 2
  root_cause: "src/main/nestedEditorExtension.ts:269 externalChangeListener used over-broad 'leetcode.*' userEvent skip-gate that swallowed the parent-originated 'leetcode.lang-switch' dispatch carrying the new fence body — child editor mirror never received the body update."
  artifacts:
    - path: "src/main/nestedEditorExtension.ts"
      issue: "externalChangeListener prefix-match too broad"
  missing:
    - "Replaced with explicit ECHO_PRONE_USER_EVENTS Set: ['leetcode.child-sync', 'leetcode.fence-repair']"
  debug_session: ".planning/debug/chevron-switch-child-body-stale.md"

- truth: "Go fence shows syntax highlighting (legacy-modes StreamLanguage)"
  status: failed
  reason: "User reported: go is plain text. Switching to Go fence shows no syntax colorization (despite the lang pack loading via @codemirror/legacy-modes/mode/go and StreamLanguage.define(go) per D-02). Likely cause: legacy-modes Go provides a streaming tokenizer but the highlight tags don't map to defaultHighlightStyle the way Lezer-based packs do. May require explicit HighlightStyle wrapper or syntaxHighlighting binding."
  severity: minor
  test: 3
  user_flagged_priority: "low priority"
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Cmd-/ in child editor toggles language-aware line comment (# for Python, // for Java/JS/Go/Rust)"
  status: resolved
  reason: "User reported: no, it doesn't work, my cursor is in fenced block, but when I hit cmd + /, it insert %% %% at Note section.."
  severity: major
  test: 6
  root_cause: "Obsidian's app-level `editor:toggle-comments` hotkey is dispatched through Obsidian's internal Scope-based keymap manager, NOT a DOM event. DOM-level capture-phase listeners (window/document/contentDOM) cannot prevent it. Confirmed via diagnostic logging: our DOM listener fired AND ran toggleLineComment successfully, but Obsidian's hotkey ALSO fired in parallel through its own dispatch path."
  artifacts:
    - path: "src/main/childEditorFactory.ts"
      issue: "Initial fix used bubble-phase domEventHandlers (couldn't intercept Obsidian's Scope), second iteration used document-level capture-phase listeners (also bypassed by Obsidian's internal dispatch)"
    - path: "src/main/nestedEditorExtension.ts"
      issue: "Widget signature needed `app` to plumb through to the factory's Scope override"
  missing:
    - "Replaced DOM-event interception with Obsidian Scope mechanism: createCmdSlashScopeExtension(app) pushes a Scope on child editor focus, registers Mod-/ inside the Scope to run toggleLineComment on the child, pops Scope on blur. Plumbed app through factory and widget."
  debug_session: ".planning/debug/cmd-slash-not-reaching-child.md"
