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
- [x] **Phase 15: Focus, Undo & Cursor** (3/3 plans) — Focus model (child/parent/Obsidian), cursor transitions, undo stack isolation, Tab/keyboard routing, scroll integration (completed 2026-05-22)
- [x] **Phase 16: Language Packs & Switching** — All 8 LC languages with full LanguageSupport, Compartment-based language switching via chevron, indent/bracket/comment/highlight all active (completed 2026-05-22)
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

**Wave 1**

- [x] 15-01-PLAN.md — indentWithTab keymap + undo isolation (addToHistory:false)

**Wave 2** (blocked on Wave 1)

- [x] 15-02-PLAN.md — Button focus retention + auto-grow CSS + scroll-into-view

**Wave 3** (blocked on Wave 2)

- [ ] 15-03-PLAN.md — Integration wiring + human verification





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

**Plans**: 5 plans
Plans:

**Wave 1**

- [x] 16-01-PLAN.md — Dependencies + buildLanguageExtensions builder + unit tests (per-language indent map; languageCompartment singleton)
- [x] 16-02-PLAN.md — Settings: indentSizeOverride field + 'Code editor' settings UI

**Wave 2** (blocked on Wave 1)

- [x] 16-03-PLAN.md — Child editor wiring: replace hardcoded indentUnit/python with languageCompartment + closeBracketsKeymap
- [x] 16-04-PLAN.md — Chevron switch dispatch: Compartment.reconfigure on child via 'leetcode.lang-switch' (LANG-01)

**Wave 3** (blocked on Wave 2)

- [x] 16-05-PLAN.md — Behavioral tests + REQUIREMENTS.md BRACKET-05 → Deferred + bundle measurement + manual UAT

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

**Plans**: 13 plans across 5 waves (5 round-1 + 2 round-2 gap-closure plans added 2026-05-23 from 17-UAT.md and round-2 user manual testing)
Plans:

**Wave 1**

- [x] 17-01-PLAN.md — Reset undo refactor (D-03..D-06): dispatch via child CM6 + restore Phase 15 cm-z scope isolation
- [x] 17-02-PLAN.md — Fence opener/closer auto-recovery debug + fix (D-06b..D-06d)
- [x] 17-03-PLAN.md — Tab mid-line vs line-start behavior (D-11..D-12)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 17-04-PLAN.md — External lc-language fm reactivity (D-13/D-14) + Edge-input UAT scaffold (D-07..D-10)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 17-05-PLAN.md — Themed HighlightStyle + bracket-match contrast + Go conditional (D-15..D-17)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 17-06-PLAN.md — Vim mode (D-18..D-21 — gated by D-19 hard bundle ceiling) + lifecycle tests (D-23a) + manual UAT execution (D-07..D-10/D-15..D-17/D-20/D-23b) + bundle audit (D-24)

**Wave 5** *(gap-closure for 17-UAT.md issues — sequential within wave on shared files)*

- [ ] 17-07-PLAN.md — Source Mode phantom render fix: narrow leetcode.* fast-path so line-count-changing transactions rebuild decorations (17-UAT.md Issue 1, Tests 2 + 8)
- [ ] 17-08-PLAN.md — Reset language priority chain restored at Phase 17 D-03 child-dispatch site: fm > fence opener > default (17-UAT.md Issue 2, Test 10) — depends on 17-01
- [ ] 17-09-PLAN.md — fm reactivity round-trip symmetry: per-child childLanguageTracker WeakMap replaces fence-opener Gate 3 read (17-UAT.md Issue 3, Test 12) — depends on 17-04 + 17-08
- [ ] 17-10-PLAN.md — Themed HighlightStyle CSS variable theme tracking: :where(.theme-light/.theme-dark) .lc-nested-editor scoped --code-* fallback palette (17-UAT.md Issue 4, Tests 13 + 14) — depends on 17-05
- [ ] 17-11-PLAN.md — Vim Insert-mode cursor render + status panel: vim({status:true}) + .cm-cursor visibility forcing CSS (17-UAT.md Issues 5 + 6, Tests 17 + 20 sibling) — depends on 17-06 + 17-10
- [ ] 17-12-PLAN.md — Line numbers gating: app.vault.getConfig('showLineNumber') conditional spread mirroring D-18 vim mount (LINENUM-01 round-2 gap-closure) — depends on 17-06
- [ ] 17-13-PLAN.md — Fence auto-recovery round-2: parent-side runtime trigger + missing-closer correctness regression + re-entry idempotency (REPAIR-02 round-2 gap-closure) — depends on 17-02

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
| 14. Bidirectional Sync                      | v1.2      | 3/3 | Complete    | 2026-05-21 |
| 15. Focus, Undo & Cursor                    | v1.2      | 3/3            | Complete    | 2026-05-22 |
| 16. Language Packs & Switching              | v1.2      | 5/5 | Complete    | 2026-05-23 |
| 17. Polish & Edge Cases                     | v1.2      | 5/13 | In Progress|            |

## Backlog

### Phase 999.1: Opinionated Static Palette for Child Editor (BACKLOG)

**Goal:** Add a settings option to override the child editor's theme-tracking behavior with a fixed VS Code-style palette (One Dark Pro, One Light Pro, Atom One Dark, Dracula). Some users prefer a predictable opinionated look regardless of which Obsidian theme is active.

**Requirements:** TBD

**Plans:** 0 plans (promote with /gsd-review-backlog when ready)

**Context:**
- Current behavior (Phase 17 Plan 10 round-3): child editor emits Obsidian/CM5-compatible semantic class names (cm-keyword, cm-type, cm-variable, cm-def, …) so Obsidian's app.css and community-theme HyperMD overrides cascade in. Theme-tracks but doesn't always match the user's mental "VS Code" model.
- Desired alternative: ship hardcoded `EditorView.theme()` blocks scoped to `.lc-nested-editor` that win via specificity. Add a settings dropdown: "Match Obsidian theme" (default, current behavior) / "One Dark Pro" / "One Light Pro" / "Atom One Dark" / "Dracula".
- Italic-on-parameters via Lezer `t.local(t.variableName)` binding.
- Reversible — toggle back to "Match Obsidian theme" returns the round-3 behavior.
- Reference: 17-UAT.md Test 13 trail (2026-05-24) has the user's One Dark Pro screenshot.

### Phase 999.2: Vim Focus Routing — Child Editor Steals Navigation Keys (BACKLOG)

**Goal:** Fix the bug where vim navigation/edit commands (j, k, dd, etc.) intermittently leak from the child editor to the parent editor when both have vim() extensions active.

**Requirements:** TBD

**Plans:** 0 plans (promote with /gsd-review-backlog when ready)

**Context (from 17-UAT.md Test 17 — VIM-01, 2026-05-24):**
- Reproduction: child editor focused, vim mode enabled globally in Obsidian. Press `i`/`a`/`o` → status panel shows --INSERT--. Press `j` → cursor moves down in PARENT editor instead of child. Press `dd` → deletes a line in the PARENT doc.
- DOM probe confirms `document.activeElement` IS inside `.lc-nested-editor` (inChild: true) when the leak occurs — focus is correct, but keystrokes still route to parent's vim.
- Pressing `i` or `a` again re-engages the child's vim cleanly.
- Intermittent — not every keystroke.

**Hypothesis:** Obsidian's global vim mode wraps the parent CM6 view's keymap at app priority (analogous to the cmd-slash-not-reaching-child finding from Phase 16). When both parent and child have `vim()` extensions, the parent's vim handler fires first in the keystroke pipeline, processes the key, and only then does the event reach the child. Status panel updates are local and not synchronized with which vim instance actually handled the key.

**Likely fix path:**
- Mirror the `createCmdSlashScopeExtension` pattern (childEditorFactory.ts:165-170) — register a Scope on `app.keymap` when the child gains focus, intercepting vim navigation keys (h/j/k/l/d/y/p/o/i/a/x/etc.) and routing them to the child's vim.
- Alternative: capture-phase `keydown` listener on the child's `contentDOM` that calls `stopPropagation` for vim-relevant keys.
- Bonus enhancement: register `:set nu` / `:set nonu` aliases (currently `@replit/codemirror-vim` rejects `nu` as unknown — only `:set number` works).

**Severity:** major — affects core vim usability when v1.2 ships with vim mode wired in.

### Phase 999.3: Fence Auto-Recovery Bypassed by Vim + Stale Child Render After Reload (BACKLOG)

**Goal:** Two related findings from 17-UAT.md Test 23 (REPAIR-02) re-test 2026-05-24 — both involve vim-driven edits bypassing CM6's transaction model.

**Requirements:** TBD

**Plans:** 0 plans (promote with /gsd-review-backlog when ready)

**Bug 1: vim `dd` on closer line bypasses parent repair listener.** Plan 17-13's parent-side `createParentRepairExtension` only fires on CM6 update transactions. When the user deletes the fence closer via vim (`dd` in Normal mode), the keystroke is intercepted by Obsidian's app-level vim handler and the resulting doc edit doesn't dispatch through CM6 in a way our updateListener observes. Result: `repairFenceStructure` never runs, the closer stays missing, and the fence is broken until manual repair.

**Bug 2: After reloading the app on a broken-fence note, the child editor renders Python content while parent doc and lc-language frontmatter both say Java.** Hypothesis: stale chevron/registry state cached in `data.json`, OR a chevron switch happened during vim-driven editing that got cached and replayed on reload, OR the child editor mount path picked up a stale `lc-language` from an in-memory state instead of frontmatter. Possibly an interaction with 999.2 (vim focus routing) — vim's writes may have flipped the chevron without going through `switchFenceLanguage`'s lc-language frontmatter update.

**Likely fix paths:**
- Bug 1: add a `vault.on('modify', file)` or `metadataCache.on('changed', file)` listener that runs `repairFenceStructure` for the active LC problem note when the parent doc is modified outside CM6's transaction pipeline. Idempotency guard from 17-13 still applies.
- Bug 2: investigate `data.json` cached state for the affected note. May want to invalidate stale child-mount state when frontmatter `lc-language` and child's tracked slug disagree.

**Severity:** major — auto-recovery is a v1.2 contract (CONTEXT D-29), so failure-to-fire on the most common vim user's deletion path is a real gap.

**Linked to:** 999.2 (vim focus routing) — both stem from vim bypassing CM6's keystroke pipeline.
