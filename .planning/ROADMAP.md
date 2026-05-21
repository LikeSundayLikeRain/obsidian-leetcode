# Roadmap: Obsidian LeetCode

## Milestones

- ✅ **v1.0 MVP** — Phases 01–05.5 (shipped 2026-05-14)
- ✅ **v1.1 Contest, AI Coach, and Preview** — Phases 06–12 (shipped 2026-05-20)
- 🚧 **v1.2 Code Editor Experience** — Phases 13–17 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 01–05.5) — SHIPPED 2026-05-14</summary>

- [x] Phase 01: Plugin foundation (6/6 plans) — completed 2026-05-14
- [x] Phase 02: Problems as notes (8/8 plans) — completed 2026-05-14
- [x] Phase 03: Run / Submit (7/7 plans) — completed 2026-05-14
- [x] Phase 04: Knowledge graph wiring (6/6 plans) — completed 2026-05-14
- [x] Phase 05: Polish & ship (7/7 plans) — completed 2026-05-14
- [x] Phase 05.1: Edit-mode inline buttons (3/3 plans) — completed 2026-05-14
- [x] Phase 05.2: Pre-ship UX polish (6/6 plans) — completed 2026-05-14
- [x] Phase 05.3: Language-aware editor (9/9 plans) — completed 2026-05-14
- [x] Phase 05.4: Run-verdict UX button polish (5/5 plans) — completed 2026-05-14
- [x] Phase 05.5: Section locking for lc-slug notes (4/4 plans) — completed 2026-05-14

Full milestone detail: [.planning/milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Contest, AI Coach, and Preview (Phases 06–12) — SHIPPED 2026-05-20</summary>

- [x] Phase 06: Foundations + Preview Mode (5/5 plans) — completed 2026-05-15
- [x] Phase 07: AI Provider Foundation (8/8 plans) — completed 2026-05-16
- [x] Phase 08: AI Debug (5/5 plans) — completed 2026-05-16
- [x] Phase 08.1: Streaming transport fix + Bedrock provider (2/2 plans) — completed 2026-05-17
- [x] Phase 08.2: Bedrock canonical default-chain (2/2 plans) — completed 2026-05-18
- [x] Phase 09: AI ACed Review (4/4 plans) — completed 2026-05-18
- [x] Phase 10: Contest virtual + analysis (7/7 plans) — completed 2026-05-18
- [x] Phase 11: AI Knowledge Graph (3/3 plans) — completed 2026-05-19
- [x] Phase 12: Polish + Plugin-Store Re-submission (5/5 plans) — completed 2026-05-19

Full milestone detail: [.planning/milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### 🚧 v1.2 Code Editor Experience (In Progress)

**Milestone Goal:** Make editing code inside the solution fence feel like a proper code editor — language-aware indentation, smart bracket handling, and Tab/Enter behavior that matches what developers expect from a real editor.

- [ ] **Phase 13: Fence Zone Foundation** — Pure logic layer: fence zone detector, indent rules, bracket rules; zero CM6 side effects; full unit-test coverage
- [ ] **Phase 14: Tab / Shift-Tab Indentation** — Tab indents and Shift-Tab dedents current/selected lines inside the fence; language-aware indent unit; validates full guard→dispatch→section-lock-bypass pipeline
- [ ] **Phase 15: Smart Enter** — Enter preserves indent, auto-indents after `{`/`(`/`:`, splits matched brace pairs; depends on Phase 14 indent infrastructure
- [ ] **Phase 16: Bracket & Pair Handling** — Auto-close code pairs, suppress markdown pairs, overtype on closing bracket, pair-delete on Backspace, template-literal triple-backtick in JS/TS
- [ ] **Phase 17: Language Switching, Comment Toggle & Bracket Highlight** — Compartment reconfigure on language switch, Cmd-/Ctrl-/ line comment, bracket match highlight

## Phase Details

### Phase 13: Fence Zone Foundation
**Goal**: Pure logic infrastructure exists — fence zone detection, per-language indent rules, and bracket rule tables — all tested in isolation with zero CM6 side effects
**Depends on**: Phase 12 (existing section-lock + `'leetcode.*'` userEvent bypass convention)
**Requirements**: (foundation phase — enables INDENT-01–04, ENTER-01–04, BRACKET-01–05, LANG-01, COMMENT-01, HIGHLIGHT-01)
**Success Criteria** (what must be TRUE):
  1. Given a CM6 EditorState, `fenceZoneDetector` correctly identifies whether a cursor position is inside the `## Code` fence body (not the fence opener, closing fence, or heading — which are locked)
  2. `codeIndentRules` returns the correct indent unit (4 spaces for Java/Python/C++, 2 for JS/TS) for every LeetCode-supported language
  3. `codeBracketRules` correctly classifies each character as a code pair opener, code pair closer, markdown-only pair, or neutral character for every supported language
  4. All three modules have 100% unit-test coverage with no Obsidian or CM6 imports — they are pure TypeScript functions
**Plans**: TBD

### Phase 14: Tab / Shift-Tab Indentation
**Goal**: Users can press Tab and Shift-Tab inside the code fence body to indent and dedent lines, with indent size matching the active language, and multi-line selections handled as a single undo step
**Depends on**: Phase 13
**Requirements**: INDENT-01, INDENT-02, INDENT-03, INDENT-04
**Success Criteria** (what must be TRUE):
  1. Pressing Tab with cursor inside the fence body indents the current line by the language-appropriate unit (4 spaces for Java; 2 spaces for JS/TS); pressing Tab outside the fence body triggers Obsidian's default Tab behavior unchanged
  2. Pressing Shift-Tab inside the fence body removes one indent unit from the current line; lines with less indentation than one unit are dedented to column 0
  3. Selecting three lines inside the fence body and pressing Tab indents all three lines simultaneously; the entire operation is a single undo step (one Ctrl-Z restores all three lines)
  4. Switching the fence language from Java to TypeScript and pressing Tab indents by 2 spaces, not 4; no note re-open required
**Plans**: TBD
**UI hint**: yes

### Phase 15: Smart Enter
**Goal**: Users get automatic indentation on every Enter keypress inside the fence body — indent preserved from the current line, deepened after openers, and brace pairs split into three lines correctly
**Depends on**: Phase 14
**Requirements**: ENTER-01, ENTER-02, ENTER-03, ENTER-04
**Success Criteria** (what must be TRUE):
  1. Pressing Enter on an indented line inside the fence (e.g., 8 spaces of indent) produces a new line with the same 8 spaces of indent; no indent is added or removed
  2. Pressing Enter at the end of a line that closes with `{` produces a new line indented one level deeper than the opening line
  3. Pressing Enter at the end of a Python `def foo():` or `if x:` line produces a new line indented one level deeper; this applies to all Python block-opening keywords (def, if, elif, else, for, while, with, class, try, except, finally)
  4. Pressing Enter when the cursor is between a matched `{` and `}` on the same line splits into three lines: the opener line, a new blank indented line (cursor lands here), and the closing `}` dedented to the opener's indent level
**Plans**: TBD
**UI hint**: yes

### Phase 16: Bracket & Pair Handling
**Goal**: Typing brackets and pairs inside the code fence behaves like a code editor — code pairs auto-close, markdown pairs are suppressed, closing brackets overtype, Backspace removes both halves of an auto-inserted pair, and JS/TS template literals work
**Depends on**: Phase 13
**Requirements**: BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04, BRACKET-05
**Success Criteria** (what must be TRUE):
  1. Typing `{` inside a Java fence inserts `{}` with cursor between them; same for `[`, `(`, `"`, and `'`; typing these characters outside the fence produces Obsidian's default behavior
  2. Typing `*` inside the fence body inserts a single `*` and does not trigger Obsidian's markdown auto-pair (`**`); same for `_` and a single backtick
  3. Typing `)` when the cursor is immediately before an auto-inserted `)` moves the cursor past it without inserting a second `)` (overtype behavior); the note contains only one `)`, not two
  4. Pressing Backspace when the cursor is between an auto-inserted pair (e.g., between `{` and `}`) deletes both characters in a single Backspace keypress
  5. In a JavaScript or TypeScript fence, typing three consecutive backticks produces a template literal (backtick pair) with cursor inside; in other languages, three backticks are inserted literally
**Plans**: TBD
**UI hint**: yes

### Phase 17: Language Switching, Comment Toggle & Bracket Highlight
**Goal**: Language switching instantly updates all editor behaviors, Cmd-/Ctrl-/ toggles line comments using the correct syntax, and bracket match highlighting is visible when the cursor is adjacent to any bracket
**Depends on**: Phase 14, Phase 16
**Requirements**: LANG-01, COMMENT-01, HIGHLIGHT-01
**Success Criteria** (what must be TRUE):
  1. Switching the fence language from Python to Java via the chevron dropdown immediately changes Tab indent to 4 spaces, Enter-after-colon auto-indent to inactive, and comment toggle syntax to `//` — all without closing or re-opening the note
  2. Pressing Cmd-/ (macOS) or Ctrl-/ (Windows/Linux) on a Java line inside the fence prefixes it with `//`; pressing again removes it; pressing on a Python line uses `#` instead
  3. Pressing Cmd-/ or Ctrl-/ on a block of selected lines inside the fence toggles all selected lines together using the active language's comment syntax
  4. When the cursor is immediately before or after a `{`, `}`, `(`, `)`, `[`, or `]` inside the fence body, both that bracket and its matching bracket are visually highlighted; moving the cursor away removes the highlight
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase                                       | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 01. Plugin foundation                       | v1.0      | 6/6            | Complete    | 2026-05-14 |
| 02. Problems as notes                       | v1.0      | 8/8            | Complete    | 2026-05-14 |
| 03. Run / Submit                            | v1.0      | 7/7            | Complete    | 2026-05-14 |
| 04. Knowledge graph wiring                  | v1.0      | 6/6            | Complete    | 2026-05-14 |
| 05. Polish & ship                           | v1.0      | 7/7            | Complete    | 2026-05-14 |
| 05.1. Edit-mode inline buttons              | v1.0      | 3/3            | Complete    | 2026-05-14 |
| 05.2. Pre-ship UX polish                    | v1.0      | 6/6            | Complete    | 2026-05-14 |
| 05.3. Language-aware editor                 | v1.0      | 9/9            | Complete    | 2026-05-14 |
| 05.4. Run-verdict UX button polish          | v1.0      | 5/5            | Complete    | 2026-05-14 |
| 05.5. Section locking for lc-slug notes     | v1.0      | 4/4            | Complete    | 2026-05-14 |
| 06. Foundations + Preview Mode              | v1.1      | 5/5            | Complete    | 2026-05-15 |
| 07. AI Provider Foundation                  | v1.1      | 8/8            | Complete    | 2026-05-16 |
| 08. AI Debug                                | v1.1      | 5/5            | Complete    | 2026-05-16 |
| 08.1. Streaming transport fix + Bedrock     | v1.1      | 2/2            | Complete    | 2026-05-17 |
| 08.2. Bedrock canonical default-chain       | v1.1      | 2/2            | Complete    | 2026-05-18 |
| 09. AI ACed Review                          | v1.1      | 4/4            | Complete    | 2026-05-18 |
| 10. Contest (virtual + analysis)            | v1.1      | 7/7            | Complete    | 2026-05-18 |
| 11. AI Knowledge Graph                      | v1.1      | 3/3            | Complete    | 2026-05-19 |
| 12. Polish + Plugin-Store Re-submission     | v1.1      | 5/5            | Complete    | 2026-05-19 |
| 13. Fence Zone Foundation                   | v1.2      | 0/TBD          | Not started | -          |
| 14. Tab / Shift-Tab Indentation             | v1.2      | 0/TBD          | Not started | -          |
| 15. Smart Enter                             | v1.2      | 0/TBD          | Not started | -          |
| 16. Bracket & Pair Handling                 | v1.2      | 0/TBD          | Not started | -          |
| 17. Language Switching, Comment & Highlight | v1.2      | 0/TBD          | Not started | -          |
