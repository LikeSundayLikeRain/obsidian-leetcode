# Roadmap: Obsidian LeetCode

## Milestones

- ✅ **v1.0 MVP** — Phases 01–05.5 (shipped 2026-05-14)
- ✅ **v1.1 Contest, AI Coach, and Preview** — Phases 06–12 (shipped 2026-05-20)
- ✅ **v1.2 Code Editor Experience** — Phases 13–18 (shipped 2026-05-26)
- 🚧 **v1.3 Inline Widget Architecture** — Phases 19–22 (in progress)

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

<details>
<summary>✅ v1.2 Code Editor Experience (Phases 13–18) — SHIPPED 2026-05-26</summary>

- [x] Phase 13: Nested Editor Foundation (3/3 plans) — completed 2026-05-21
- [x] Phase 14: Bidirectional Sync (3/3 plans) — completed 2026-05-21
- [x] Phase 15: Focus, Undo & Cursor (3/3 plans) — completed 2026-05-22
- [x] Phase 16: Language Packs & Switching (5/5 plans) — completed 2026-05-23
- [x] Phase 17: Polish & Edge Cases (13/13 plans) — completed 2026-05-25
- [x] Phase 18: Vim, Recovery & Polish + Ship Close (4/4 plans) — completed 2026-05-26

Full milestone detail: [.planning/milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

<details open>
<summary>🚧 v1.3 Inline Widget Architecture (Phases 19–22) — IN PROGRESS</summary>

- [x] **Phase 19: Widget Foundation + One-Way Sync** — Self-contained inline `leetcode-solve` widget mounted in both Reading and Live Preview, debounced one-way sync to disk, state persistence, hash-based echo suppression — completed 2026-05-29
- [x] **Phase 20: Reconciliation, UX, Action Row, Section Protection** — External-edit reconciliation + conflict modal, action row inside widget, language switching via metadataCache, narrowed `sectionProtectionExtension`, vim live-reconfigure (completed 2026-05-30)
- [x] **Phase 21: v1.2 Migration** — Lazy-on-open atomic migration of v1.2 fence tags → `leetcode-solve`, backup sidecar with 30-day retention, idempotent detection, CI fixtures across v1.0/v1.1/v1.2 sample notes (completed 2026-06-01)
- [ ] **Phase 22: v1.2 Path Removal + Polish** — Hard cutover; delete 5 legacy files (~2,400 LOC net), drop `'leetcode.*'` userEvent convention, theme regression gate, BRAT alpha, plugin-store re-review

</details>

## Phase Details

### Phase 19: Widget Foundation + One-Way Sync

**Goal:** A working inline `leetcode-solve` widget renders in both Reading and Live Preview modes, persists state across unmount/remount, writes edits to disk via debounced one-way sync, and never loses data — running in parallel behind `useInlineWidget=OFF` while the v1.2 path remains the user-facing default.

**Depends on:** Phase 18 (v1.2 closed and shipped)

**Requirements:** WIDGET-01, WIDGET-02, WIDGET-03, WIDGET-04, WIDGET-05, WIDGET-06, WIDGET-07, WIDGET-08, SYNC-01, SYNC-02, SYNC-03, SYNC-06, SYNC-07, EMBED-01, EMBED-02, EMBED-03, EMBED-04, VIM-01, VIM-04, THEME-01, THEME-02, THEME-03

**Success criteria (observable behaviors):**

1. User opens an LC note in Reading mode and Live Preview and sees an identical CM6-rendered code editor inside the `leetcode-solve` fence (Reading mode is read-only via `editable.of(false)`).
2. User types in the widget; within ~400ms the fence body on disk reflects the change exactly (byte-for-byte: triple backticks, `---` lines, trailing whitespace), and the parent CM6 file picker shows the update without spurious "modify" loops or echo cycles.
3. User force-quits Obsidian (Cmd-Q) within milliseconds of typing — on next open, the most-recent characters are present on disk (flush-on-`beforeunload` + flush-on-unload + flush-on-leaf-change all fire).
4. User opens an `![[lc-note]]` embed in any host note and sees a read-only widget; opening a stray ` ```leetcode-solve ` fence in a non-LC note (no `lc-slug`) renders read-only without crashing or offering Run/Submit.
5. User toggles the parent cursor toward the fence and the cursor cannot enter the fence range (`atomicRanges`); closing/reopening the note within 30 seconds restores cursor position, scroll offset, and undo history at the fence (state-persistence map hits).
6. With `useInlineWidget=OFF` (default), the v1.2 nested-editor path remains fully operational — no regressions on v1.2 acceptance flows.

**Key risks/notes:**

- **Two-path mount is non-negotiable.** `registerMarkdownCodeBlockProcessor` (Reading) + `registerEditorExtension` ViewPlugin with `Decoration.replace({ widget })` (Live Preview) — verified against Obsidian docs and Dataview source. Shipping only one path breaks half of all user workflows.
- **Self-write echo suppression must be a per-path content-hash map with 2-second TTL** — boolean flag is provably broken under concurrent multi-file flushes (PITFALLS P1).
- **`EditorView.atomicRanges` on parent CM6 is load-bearing** — without it, Live Preview unmounts the widget on cursor approach, destroying state (PITFALLS P3).
- **Empirical research flag (LOW):** Live Preview raw-source-reveal mitigation via `mousedown.stopPropagation()` is empirically untested; state-persistence map is the fallback regardless. `getSectionInfo` null-paths must be exercised on day one.
- Pitfalls covered: P1, P3, P4, P6, P12, P14, P15, P17, P18, P22, P23.

**Plans:** 5 plans (4 main + 1 gap-closure)

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — Minimal mount: two-path widget, atomicRanges, lc-slug gate, theme/semantic carry-over, conditional vim, Experimental settings, mutual-exclusion assert, property-test corpus seed (no live writes)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-02-PLAN.md — Debounced one-way sync + suppression: vault.process write path, per-path content-hash suppression (2s TTL), per-file rate-limit (1/200ms), six flush-on-transition hooks, post-flush hash diagnostic; empirical probe of vault.on('modify') ordering

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-03-PLAN.md — State persistence + P3 mitigation: state map keyed by `${file.path}::${fenceIndex}` with 30s TTL, cursor/scroll/undo capture-and-hydrate, CM6 history JSON round-trip

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 19-04-PLAN.md — Embed + stray fence + property-test hardening: dual-signal embed detection, read-only routing for embeds, stray-fence safe fallback, language-fallback Notice, expanded SYNC-06 corpus, WidgetType.eq() content-hash identity

**Wave 5** *(gap closure — UAT Test 1 BLOCKERS 1+2+3)*

- [x] 19-05-PLAN.md — Reading-mode read-only fix (gate vim on `vimEnabled && !readOnly`) + suppress v1.2 action row when `useInlineWidget=ON` (gate registerCodeBlockActionProcessor + buildCodeActionsEditorExtension on `!useInlineWidget`); UAT re-run for WIDGET-07 / VIM-01 / D-03 / D-05

---

### Phase 20: Reconciliation, UX, Action Row, Section Protection

**Goal:** Full external-edit handling, conflict resolution, in-widget action row, language switching via frontmatter, narrowed section protection, and vim live-reconfigure — making the v1.3 widget feature-complete behind `useInlineWidget=OFF` so it can be flipped on at Phase 22 without UX regressions.

**Depends on:** Phase 19

**Requirements:** SYNC-04, SYNC-05, ACTION-01, ACTION-02, ACTION-03, ACTION-04, ACTION-05, ACTION-06, PROTECT-01, PROTECT-02, VIM-02, THEME-04

**Success criteria (observable behaviors):**

1. External edit arrives (other pane, Obsidian Sync, CLI `git pull`, file-system tool) — widget reloads from disk with cursor preserved; if the edit collides with local in-flight typing, a conflict modal appears with "Keep mine / Keep external / View diff" and the user's choice persists deterministically.
2. User clicks Run / Submit / AI Debug / Reset / Copy buttons mounted **inside** the widget DOM; each button reads code directly via `widgetInstance.childView.state.doc.toString()` (no disk round-trip) and survives focus save/restore on click; flex-wrap layout reflows cleanly on window resize.
3. User clicks the language chevron inside the widget; `lc-language` frontmatter flips via `processFrontMatter`, `metadataCache.on('changed')` fires, and `Compartment.reconfigure` swaps language packs, indent, brackets, and comment rules without rebuilding the EditorView.
4. User toggles vim mode in Obsidian settings; the widget's `vimCompartment` reconfigures live (`vim()` ↔ `[]`) without note reload — keystrokes route correctly to the new mode immediately.
5. User attempts to type into `## Problem` body or `## Techniques` heading — the change is rejected by `sectionProtectionExtension.ts` (narrower replacement preserving the v1.0 validated requirement), while fence opener/closer are now freely editable (since the widget owns the fence range).
6. User switches Obsidian theme (light/dark toggle, custom theme swap) — widget colors retheme live across all 8 language packs, no note reload required.

**Key risks/notes:**

- **Section-protection narrowing is empirical.** The v1.2 `sectionLockExtension.ts` (527 LOC) protected `## Problem` body, fence opener, fence closer, and `## Techniques` heading via a single `EditorState.changeFilter`. Removing fence-opener/closer protection while preserving body/heading protection requires auditing every condition in the filter — risk of removing too much (regression of v1.0 validated requirement) or too little (interferes with non-fence writes). Research flag: MEDIUM.
- **Multi-pane simplification accepted.** Q4 confirms single-active-per-file in v1.3; full live/mirror promote-on-focus deferred to v1.3.x. Phase 20 ships single-active with a "Take over" affordance if a second pane focuses the same file. (MULTI-01/MULTI-02 are explicitly v1.4+ deferred.)
- **Vim live-reconfigure is empirically untested in `@replit/codemirror-vim` README.** Plan must include an early dev-vault probe; if it fails, VIM-03 (reload-on-toggle banner) lands in Phase 22 as the pre-accepted fallback.
- **Conflict modal is a novel UX surface for this plugin.** Worth a paper-prototype review before implementation.
- Pitfalls covered: P2, P8, P9, P10, P11, P16, P19, P20, P21, P24.

**Plans:** 9/10 plans complete (1 gap-closure pending)

Plans:
**Wave 1**

- [x] 20-01-PLAN.md — Section protection narrowing + vim live-reconfigure (foundation): fork sectionLockExtension → sectionProtectionExtension; mutually-exclusive registration; per-widget vimCompartment + workspace.on('layout-change') dispatcher; v1.0 Phase 5.5 UAT regression rerun

**Wave 2** *(blocked on Wave 1)*

- [x] 20-02-PLAN.md — Action row + language chevron + *FromWidget methods (UX): mount buildCodeBlockButtonRow inside widget DOM; 5 *FromWidget plugin methods + switchLanguageFromWidget + per-widget metadataCache.on('changed') reactivity; Pitfall P2 early-return absorption

**Wave 3** *(blocked on Wave 2)*

- [x] 20-03-PLAN.md — External-edit reconciliation + conflict modal + 3-pane LCS diff (sync): vault.on('modify') decision tree; ConflictModal extends Obsidian.Modal with in-place "View diff" expansion; pure-TS LCS line-diff (~150 LOC); D-conflict-04 second-fire updates External pane in place

**Wave 4** *(blocked on Wave 3)*

- [x] 20-04-PLAN.md — Live theme retheme + multi-pane "Take over" affordance (polish): app.workspace.on('css-change') → cssRetheme via view.requestMeasure; app.workspace.on('active-leaf-change') → setGreyedOut + .lc-takeover-overlay CTA per UI-SPEC §3

**Gap closure (post-UAT)**

- [x] 20-10-PLAN.md — Gap closure for UAT T3/T7/T8/T9/T10: fence-kind audit primitive + body-only Reset for v1.3 leetcode-solve fence (T10 DATA CORRUPTION); switchLanguageFromWidget rewrite to childEditorRegistry dispatch (T3); runWithCode/submitWithCode refactor accepting code directly (T7); SubmissionHistoryStore short-TTL-on-empty + retrieve invalidate (T9); .leetcode-widget-codeblock inner wrapper for action-row DOM hierarchy (T8) — completed 2026-05-31

**UI hint**: yes

---

### Phase 21: v1.2 Migration

**Goal:** Every v1.2 note migrates lazily on first open to the `leetcode-solve` fence tag with a backup sidecar, atomic rewrite, idempotent detection, and CI fixtures spanning v1.0, v1.1, and v1.2 sample notes — so Phase 22 can delete the v1.2 path with confidence that no user data is stranded.

**Depends on:** Phase 20 (widget must be UX-complete before user notes are rewritten on top of it)

**Requirements:** MIGRATE-01, MIGRATE-02, MIGRATE-03, MIGRATE-04, MIGRATE-05, MIGRATE-06, MIGRATE-07, MIGRATE-08, MIGRATE-09, MIGRATE-10

**Success criteria (observable behaviors):**

1. User opens a v1.2-format note (first fence under `## Code` has a v1.2 lang-slug AND `lc-slug` frontmatter present) — within one `vault.process` callback the fence opener becomes ` ```leetcode-solve ` and `lc-language` frontmatter is verified/derived; fence body is byte-identical to before.
2. Before the first migration in a session, a backup file is written to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/{slug}.md` containing the full pre-migration note; backups older than 30 days auto-delete on plugin load.
3. Re-opening an already-migrated note is a no-op (idempotent detection on `leetcode-solve` opener); plugin load never triggers batch migration regardless of how many v1.2 notes exist in the vault.
4. New notes created in v1.3 emit ` ```leetcode-solve ` directly (no v1.2 lang-slug fence tags ever written by `starterCodeInjector.ts` or `NoteTemplate.ts`); `codeExtractor.ts` reads language from `lc-language` frontmatter rather than fence tag.
5. With "Auto-migrate v1.2 notes when opened" set OFF, opening a v1.2 note shows a "Migrate this note?" button with no automatic rewrite; toggling ON migrates on next open.
6. CI runs against fixture vaults containing v1.0, v1.1, and v1.2 sample notes — all migrate cleanly on every release candidate; fixture diff vs. expected output is byte-stable.

**Key risks/notes:**

- **Migration is the highest-risk surface in the milestone.** Never call from `Plugin.onload()`. Never regex-replace across the full file. Always gate on `lc-slug` frontmatter to avoid hijacking non-LC code blocks (PITFALLS P7).
- **Q7 confirmed: migration + first-edit are atomic** — both land in the same `vault.process` callback so disk never observes a half-migrated state.
- **v1.1 lazy-on-AC Techniques migration is the direct precedent.** Same discipline: never batch-rewrite vault data on plugin load.
- **Reverse migration (`unmigrateToLegacyFence`) kept in tree as a dev-only command, not shipped** — recovery path for users is the backup sidecar.
- Research flag: LOW for mechanics; MEDIUM for hand-edited note edge cases (e.g., user-modified fence with extra blank lines, malformed frontmatter, missing `## Code` heading).
- Pitfalls covered: P7, P13.

**Plans:** 7 plans (4 shipped + 3 gap-closure from 21-VERIFICATION.md)

Plans:
**Wave 1**

- [x] 21-01-PLAN.md — fenceMigrator core + strict-match predicate + rewriteFenceOpenerTag CRLF helper + property-test corpus (Foundation; MIGRATE-01..04, MIGRATE-07)

**Wave 2** *(blocked on Wave 1)*

- [x] 21-02-PLAN.md — Mount integration + autoMigrateOnOpen setting + legacyFenceBanner + command palette entry + dev-vault smoke for vault.process+processFrontMatter ordering probe (UX; MIGRATE-06)

**Wave 3** *(blocked on Wave 1)*

- [x] 21-03-PLAN.md — codeExtractor frontmatter-source refactor + codeBlockForV13 emitter + injectCodeSection fenceKind dispatch + 5 consumer call-site updates (SSoT refactor; MIGRATE-08, MIGRATE-09)

**Wave 4** *(blocked on Waves 1+2)*

- [x] 21-04-PLAN.md — migrationBackupGc 30-day TTL microtask + 10 CI fixture pairs (v1.0/v1.1/v1.2) + fixture runner with byte-exact assertion (Polish + Release Gate; MIGRATE-05, MIGRATE-10)

**Gap closure** *(parallel; independent file ownership; close 21-VERIFICATION.md BLOCKERs CR-01..CR-04 + WARNINGs WR-01/02/03/05/07)*

- [ ] 21-05-PLAN.md — Reading-mode file-open hook + Plugin-instance migrateInFlight (CR-01 + WR-01; MIGRATE-01, MIGRATE-06)
- [ ] 21-06-PLAN.md — Pre-existence backup check + tightened LC-slug regex + GC concurrency lock (CR-02 + CR-03 + WR-05; MIGRATE-02, MIGRATE-05)
- [ ] 21-07-PLAN.md — Defensive banner DOM + processFrontMatter unconditional + ## Code-scoped helpers (CR-04 + WR-02 + WR-03 + WR-07; MIGRATE-02, MIGRATE-06, MIGRATE-08)

---

### Phase 22: v1.2 Path Removal + Polish

**Goal:** Hard cutover — flip `useInlineWidget` to default ON, delete the 5 v1.2 files (~3,000 LOC) and ~800 LOC of `src/main.ts` wiring, retire the `'leetcode.*'` userEvent convention, run release gates (theme regression, bundle size, eslint, all tests), BRAT alpha period, and ship plugin-store re-review.

**Depends on:** Phase 21

**Requirements:** DELETE-01, DELETE-02, DELETE-03, DELETE-04, DELETE-05, DELETE-06, DELETE-07, DELETE-08, POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05, POLISH-06, PROTECT-03, VIM-03, THEME-05

**Success criteria (observable behaviors):**

1. With `useInlineWidget=ON` as the default on first 1.3.x release, every LC note opens directly into the v1.3 widget — no `useNestedEditor` fork remains in `src/main.ts`, no v1.2 path is reachable.
2. The 5 deleted files (`childEditorSync.ts`, `sectionLockExtension.ts`, `nestedEditorExtension.ts`, `childEditorRegistry.ts`, `codeActionsEditorExtension.ts`) and 8 dead test files are gone from `src/main/` and `tests/`; bundle size is measurably smaller than v1.2's 1.71 MB raw / 459 KB gzipped (CI gate flags any regression).
3. Side-by-side widget screenshots across the top 5 community themes (Minimal, Things, Catppuccin, Anuppuccin, Atom) match the v1.2 baseline — no theme regressions; THEME-05 release gate passes.
4. Full test suite (1,713 v1.2 tests minus the 8 dead-test deletions, plus all new widget unit + integration tests) runs green; `eslint-plugin-obsidianmd` passes with zero `innerHTML` usages in `src/widget/`.
5. CLAUDE.md `## Conventions` no longer contains the `'leetcode.*'` userEvent paragraph or the "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph; README is updated with v1.3 architecture overview, migration docs, sync interaction notes, and Cmd-Z/Cmd-F scoping behavior.
6. BRAT alpha tag ships and runs in real user vaults for at least one feedback cycle; plugin-store re-review submission is filed and accepted.
7. **Vim-Tab cursor-marker sync (carried from Phase 20 Plan 20-10 hotfix part 7).** When Tab is pressed in vim Insert mode, the widget routes the keystroke through `insertTab` / `indentMore` directly, so vim's CM5-style block-cursor marker can lag the real CM6 caret (visible as a stale `|` to the left of the actual cursor). Fix routes Insert-mode Tab through vim's input pipeline (e.g. `CodeMirror.signal` / `Vim.handleKey` on the `getCM(view)` adapter) so vim updates its caret tracker, OR replaces the explicit Tab handler with a vim-aware indent command that calls vim's own insert-text path. Cosmetic only — typing lands at the correct offset; the visual marker is wrong.
8. **Widget hover border removed (carried from Phase 20 UAT polish).** Hovering the v1.3 widget surface paints a border (Obsidian default `.cm-editor`-level `:hover` outline bleeding through). Add a defensive override scoped to `.lc-nested-editor .cm-editor:hover` (or the equivalent inner wrapper) to suppress the border without nuking the cursor-marker / focus-ring styles.
9. **Action row uses normal font, not monospace (carried from Phase 20 UAT polish).** The widget's action-row chevron + buttons currently inherit `var(--font-monospace)` from the surrounding `.cm-editor` theme rule. Add an override on `.leetcode-code-actions` (and its descendants) setting `font-family: var(--font-text)` so the controls read as UI chrome rather than code.

**Key risks/notes:**

- **Vim-Tab cursor-marker sync** (success criterion 7). Cosmetic block-cursor desync introduced by the Plan 20-10 hotfix Tab handler. Reproducer: enable vim, press `i` to enter Insert mode, press Tab — text inserts correctly but the vim caret marker visually stays at the pre-Tab column. Investigation entry point: `src/widget/WidgetController.ts` Tab handler around the `keymap.of([...])` block; `getCM(view)` returns a CM5 adapter that can dispatch through vim's input layer.
- **Coexistence ends here.** Phases 19-21 ran the v1.3 widget behind `useInlineWidget=OFF`; flipping the default to ON is a hard cutover. After this phase, the v1.2 path is irrecoverable except via `git revert`.
- **VIM-03 fallback lands here only if Phase 20 live-reconfigure proved empirically unreliable.** If Phase 20 succeeded, VIM-03's "reload to apply vim toggle" banner becomes a no-op success criterion; if it failed, VIM-03 ships the banner UX in this phase.
- **Plugin-store re-review trigger.** The review checklist must be re-run since the architectural surface changed substantially: confirm `isDesktopOnly`, no `innerHTML` in widget code, no remote eval, no telemetry, manifest version bump (PITFALLS P13, P25).
- **README plugin-update notes** must explain Cmd-Z scoping change (per-widget undo) and Cmd-F scoping change (focus-scoped) so users aren't surprised.
- Research flag: LOW — deletion + checklist, no new architecture.
- Pitfalls covered: P5, P13, P25.

**Plans:** TBD

**UI hint**: yes

---

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
| 17. Polish & Edge Cases                     | v1.2      | 13/13          | Complete    | 2026-05-25 |
| 18. Vim, Recovery & Polish + Ship Close     | v1.2      | 4/4            | Complete    | 2026-05-26 |
| 19. Widget Foundation + One-Way Sync        | v1.3      | 5/4 | Complete   | 2026-05-29 |
| 20. Reconciliation, UX, Action Row, Section Protection | v1.3 | 9/9 | Complete   | 2026-05-31 |
| 21. v1.2 Migration                          | v1.3      | 4/4 | Complete   | 2026-06-01 |
| 22. v1.2 Path Removal + Polish              | v1.3      | 0/0            | Not started | -          |

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

### Phase 999.1.1: Opinionated Static Palette — v1.3 Candidate (BACKLOG)

**Promoted from:** 999.1 (carried forward)
**Note:** 999.2, 999.3, 999.4 were promoted into Phase 18 and shipped in v1.2.
