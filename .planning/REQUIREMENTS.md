# Requirements — v1.2 Code Editor Experience

## Milestone Goal

Make editing code inside the `## Code` solution fence feel like a proper code editor — comparable to LeetCode web — while preserving all markdown editing behavior outside the fence.

---

## v1.2 Requirements

### Indentation & Tab

- [ ] **INDENT-01**: User can press Tab inside the code fence body to indent the current line
- [ ] **INDENT-02**: User can press Shift-Tab inside the code fence body to dedent the current line
- [ ] **INDENT-03**: User can select multiple lines in the fence body and Tab/Shift-Tab to indent/dedent all selected lines as a single undo step
- [ ] **INDENT-04**: Indent unit respects the active language (e.g., 4 spaces for Java/Python/C++, 2 for JS/TS)

### Smart Enter

- [ ] **ENTER-01**: User pressing Enter inside the fence body preserves the current line's indent level on the new line
- [ ] **ENTER-02**: User pressing Enter after an opening brace/paren `{` `(` indents the new line one level deeper
- [ ] **ENTER-03**: User pressing Enter after Python colon `:` (def, if, for, while, class, etc.) indents the new line one level deeper
- [ ] **ENTER-04**: User pressing Enter between matched braces `{|}` splits into three lines: current, indented blank, dedented closing brace

### Bracket & Pair Handling

- [ ] **BRACKET-01**: Typing `{`, `[`, `(`, `"`, `'` inside the fence body auto-inserts the matching closer
- [ ] **BRACKET-02**: Typing `*`, `_`, or backtick inside the fence body does NOT trigger markdown auto-pair behavior
- [ ] **BRACKET-03**: Typing a closing bracket `)`, `]`, `}` when cursor is before an auto-inserted closer overtypes it instead of doubling
- [ ] **BRACKET-04**: Pressing Backspace between an auto-inserted pair (e.g., `{|}`) deletes both opener and closer
- [ ] **BRACKET-05**: Typing backtick-backtick-backtick (template literal) inside JS/TS fence auto-closes with matching backtick

### Language Switching

- [ ] **LANG-01**: When user switches language via the chevron dropdown, indent rules and bracket behavior update to match the new language without re-opening the note

### Comment Toggling

- [ ] **COMMENT-01**: User can press Cmd-/ (Mac) or Ctrl-/ (Win/Linux) inside the fence body to toggle line comment using the active language's comment syntax (// for Java/JS/C++, # for Python)

### Matching Bracket Highlight

- [ ] **HIGHLIGHT-01**: When cursor is adjacent to a bracket `{`, `}`, `(`, `)`, `[`, `]` inside the fence body, both the bracket and its match are visually highlighted

---

## Future Requirements (Deferred)

- **FUTURE-01**: Auto-complete suggestions for language keywords (too complex for v1.2; needs full language server)
- **FUTURE-02**: Error squiggles / linting inside fence (requires language service integration)
- **FUTURE-03**: Snippet expansion (e.g., `for` → full for-loop template)
- **FUTURE-04**: Multi-cursor editing inside fence

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full language server / IntelliSense | Obsidian isn't an IDE; excessive complexity for a plugin |
| Syntax-tree-based indentation | CM6's nested parse tree inside markdown fences is unreliable for fast typing; heuristic approach chosen |
| Global CM6 extensions (indentWithTab, closeBrackets) | Would break markdown editing vault-wide |
| Mobile support for code editing features | Desktop-only constraint (v1 platform) |

---

## Traceability

| REQ-ID     | Phase                                       | Status  |
|------------|---------------------------------------------|---------|
| INDENT-01  | Phase 14: Tab / Shift-Tab Indentation       | Pending |
| INDENT-02  | Phase 14: Tab / Shift-Tab Indentation       | Pending |
| INDENT-03  | Phase 14: Tab / Shift-Tab Indentation       | Pending |
| INDENT-04  | Phase 14: Tab / Shift-Tab Indentation       | Pending |
| ENTER-01   | Phase 15: Smart Enter                       | Pending |
| ENTER-02   | Phase 15: Smart Enter                       | Pending |
| ENTER-03   | Phase 15: Smart Enter                       | Pending |
| ENTER-04   | Phase 15: Smart Enter                       | Pending |
| BRACKET-01 | Phase 16: Bracket & Pair Handling           | Pending |
| BRACKET-02 | Phase 16: Bracket & Pair Handling           | Pending |
| BRACKET-03 | Phase 16: Bracket & Pair Handling           | Pending |
| BRACKET-04 | Phase 16: Bracket & Pair Handling           | Pending |
| BRACKET-05 | Phase 16: Bracket & Pair Handling           | Pending |
| LANG-01    | Phase 17: Language Switching, Comment & Highlight | Pending |
| COMMENT-01 | Phase 17: Language Switching, Comment & Highlight | Pending |
| HIGHLIGHT-01 | Phase 17: Language Switching, Comment & Highlight | Pending |
