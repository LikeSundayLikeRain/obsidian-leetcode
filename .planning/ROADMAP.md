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

**Milestone Goal:** Make editing code inside the solution fence feel like a proper code editor (comparable to LeetCode web's Monaco) by embedding a nested CM6 EditorView with full LanguageSupport in the `## Code` fence region.

**Architecture:** Nested EditorView (Path B) — a standalone child CM6 editor with language packs replaces the visible fence body, syncing changes back to the parent markdown document. This provides syntax-tree-based indent, bracket handling, highlighting, and comment toggling natively.

- [x] **Phase 13: Nested Editor Foundation** (3/3 plans) — Widget + CSS-hide approach, child EditorView registry, lifecycle management, single-language proof-of-concept rendering
- [x] **Phase 14: Bidirectional Sync** — Child↔parent sync protocol (CM6 split-view pattern), offset derivation, vault.process conflict handling, section lock coexistence (completed 2026-05-21)
- [ ] **Phase 15: Focus, Undo & Cursor** — Focus model (child/parent/Obsidian), cursor transitions, undo stack isolation, Tab/keyboard routing, scroll integration
- [ ] **Phase 16: Language Packs & Switching** — All 8 LC languages with full LanguageSupport, Compartment-based language switching via chevron, indent/bracket/comment/highlight all active
- [ ] **Phase 17: Polish & Edge Cases** — Paste/clipboard, IME/CJK, Find/Replace, event propagation, plugin review prep, bundle size validation

## Phase Details

### Phase 13: Nested Editor Foundation

**Goal**: A child CM6 EditorView renders inside the `## Code` fence region with syntax highlighting for one language (Python), mounted via Decoration.widget + CSS-hidden fence lines, with lifecycle managed by a centralized registry
**Depends on**: Phase 12 (existing section-lock + code-actions widget pattern)
**Requirements**: (foundation phase — enables all 16 requirements)
**Success Criteria** (what must be TRUE):

  1. On an `lc-slug` note with a Python fence, the fence body renders inside a child CM6 EditorView with Python syntax highlighting (Lezer-based, not Prism/markdown)
  2. The child editor is mounted via `Decoration.widget({ block: true })` with parent fence body lines hidden via CSS line decorations; NOT via `Decoration.replace`
  3. Opening a note, switching to another note, and switching back preserves the child editor state (cursor, scroll) via the plugin-level EditorView registry
  4. Closing a note and reopening it creates a fresh child editor (no stale registry entries); plugin unload destroys all child editors cleanly (zero memory leaks)
  5. The existing section lock, code-actions button row, and language chevron continue to function without regression

**Plans**: 3 plans
Plans:

- [x] 13-01-PLAN.md — Registry + factory (child EditorView lifecycle & creation)
- [x] 13-02-PLAN.md — Nested editor extension (StateField, widget, cursor redirect)
- [x] 13-03-PLAN.md — Integration wiring + CSS + human verification

### Phase 14: Bidirectional Sync

**Goal**: Edits in the child editor flow into the parent document at the correct fence offset, and external changes to the parent fence content (vault.process, copyToCode) propagate into the child — with no echo loops or corruption
**Depends on**: Phase 13
**Requirements**: INDENT-01, INDENT-02, ENTER-01 (basic editing must work end-to-end for these to be testable)
**Success Criteria** (what must be TRUE):

  1. Typing in the child editor updates the parent document's fence body in real-time; saving the file (Ctrl-S) persists the code written in the child
  2. Using "Copy to Code" from a past submission (vault.process write) updates the child editor's content without corruption or duplication
  3. Editing `## Notes` in the parent document (above/below the fence) does NOT corrupt the child editor or produce offset drift
  4. No echo loop: child→parent sync does NOT trigger parent→child sync back (sync annotation prevents it)
  5. The section lock's changeFilter passes all child-to-parent sync transactions cleanly (verified: no `input.*` userEvent on sync dispatches)

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 14-01-PLAN.md — Core sync module (childEditorSync.ts — annotations, listeners, fence repair)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-02-PLAN.md — Wiring (childEditorFactory + nestedEditorExtension integration)
- [x] 14-03-PLAN.md — Unit tests for sync module

### Phase 15: Focus, Undo & Cursor

**Goal**: Seamless user experience — clicking into the child editor, pressing Tab, using Cmd-Z, clicking back to markdown, and using Run/Submit all work correctly without focus confusion
**Depends on**: Phase 14
**Requirements**: INDENT-01, INDENT-02, INDENT-03, INDENT-04 (Tab/Shift-Tab works via child's indentWithTab)
**Success Criteria** (what must be TRUE):

  1. Clicking into the child editor gives it focus; clicking into `## Notes` returns focus to the parent; Run/Submit buttons work in both states
  2. Tab inside the child editor indents code (NOT focus-navigation); Shift-Tab dedents; multi-line selection indent works as single undo
  3. Cmd-Z in the child undoes the last child edit; the parent document reflects the undo correctly via sync
  4. The child editor auto-grows with content (no inner scrollbar); the parent note scrolls as a unified document
  5. Escape in the child editor returns focus to the parent (accessibility escape hatch)

**Plans**: 3 plans
Plans:

- [x] 13-01-PLAN.md — Registry + factory (child EditorView lifecycle & creation)
- [x] 13-02-PLAN.md — Nested editor extension (StateField, widget, cursor redirect)
- [x] 13-03-PLAN.md — Integration wiring + CSS + human verification

### Phase 16: Language Packs & Switching

**Goal**: All 8 LeetCode languages have full LanguageSupport (indent, brackets, comments, highlight) and switching language via the chevron instantly reconfigures the child editor
**Depends on**: Phase 15
**Requirements**: INDENT-04, ENTER-02, ENTER-03, ENTER-04, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04, BRACKET-05, LANG-01, COMMENT-01, HIGHLIGHT-01
**Success Criteria** (what must be TRUE):

  1. All 8 LC languages (Python, Java, C++, C, JavaScript, TypeScript, Go, Rust) have correct indent rules: Enter after `{` indents in Java/C++/JS/TS; Enter after `:` indents in Python; `}` on Enter dedents
  2. Bracket auto-close works for `{`, `[`, `(`, `"`, `'` in all languages; overtype on closing bracket; pair-delete on Backspace; markdown `*`/`_` pairs are NOT inserted (child is in code mode, not markdown)
  3. Switching language via the chevron dropdown reconfigures the child editor's LanguageSupport via Compartment.reconfigure() — no note re-open needed; indent rules and comment syntax update immediately
  4. Cmd-/ (Mac) / Ctrl-/ (Win/Linux) toggles line comment with correct syntax (`//` for Java/JS/C++/TS, `#` for Python, `//` for Go/Rust)
  5. Bracket match highlighting is visible when cursor is adjacent to any bracket

**Plans**: 3 plans
Plans:

- [x] 13-01-PLAN.md — Registry + factory (child EditorView lifecycle & creation)
- [x] 13-02-PLAN.md — Nested editor extension (StateField, widget, cursor redirect)
- [x] 13-03-PLAN.md — Integration wiring + CSS + human verification

### Phase 17: Polish & Edge Cases

**Goal**: All edge cases handled — paste, IME input, event propagation, Source/Live Preview parity, bundle size validated, plugin review readiness
**Depends on**: Phase 16
**Requirements**: (polish for all 16 requirements — ensures robustness)
**Success Criteria** (what must be TRUE):

  1. Pasting code into the child editor produces raw code (not markdown-formatted text); Obsidian's paste interceptors do not interfere
  2. Chinese/Japanese IME input in the child editor produces correct characters without duplication or composition interruption
  3. The child editor renders and functions correctly in both Source Mode and Live Preview (Cmd-E toggle preserves editing state)
  4. Bundle size is documented and justified (language packs raise ceiling to ~1.5 MB); no unused code shipped
  5. All lifecycle cleanup verified: no memory leaks after 20 note open/close cycles; plugin unload destroys all child editors

**Plans**: 3 plans
Plans:

- [x] 13-01-PLAN.md — Registry + factory (child EditorView lifecycle & creation)
- [ ] 13-02-PLAN.md — Nested editor extension (StateField, widget, cursor redirect)
- [x] 13-03-PLAN.md — Integration wiring + CSS + human verification

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
| 13. Nested Editor Foundation                | v1.2      | 3/3 | Complete    | 2026-05-21 |
| 14. Bidirectional Sync                      | v1.2      | 3/3 | Complete   | 2026-05-21 |
| 15. Focus, Undo & Cursor                    | v1.2      | 0/TBD          | Not started | -          |
| 16. Language Packs & Switching              | v1.2      | 0/TBD          | Not started | -          |
| 17. Polish & Edge Cases                     | v1.2      | 0/TBD          | Not started | -          |
