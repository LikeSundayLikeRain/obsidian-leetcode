# Milestones

## v1.3 Inline Widget Architecture (Shipped: 2026-06-12)

**Phases completed:** 5 phases (19, 20, 21, 21.1, 22), 35 plans
**Timeline:** 2026-05-28 → 2026-06-12 (15 days; in-tree work closed 2026-06-03, BRAT 7-day dogfood + 1.3.0 stable 2026-06-04→12)
**Stats:** ~2,873 tests passing. Bundle: 1,723 KB raw (within 1.8 MB ceiling). Net −3,325 LOC in `src/` from the v1.2-path deletion. Tags: `1.3.0-beta.1`, `1.3.0-beta.2`, `1.3.0`.

**Delivered:** A ground-up rewrite of the editing model. The v1.2 dual-CM6 nested-editor + bidirectional sync + section-lock stack is replaced by a self-contained inline `leetcode-solve` code-block widget driven by one-way sync. The widget owns its own embedded CM6 `EditorView`; edits flow through a single mutation primitive (`app.vault.process`) to disk, and the file becomes the single source of truth. This collapses v1.2's open-ended corner-case bug class (cmd-Z leaks, locked-range dispatches, fence-closer merges, cursor-visibility races) into one render path. Every v1.2 note migrates lazily and atomically on first open, with a 30-day backup sidecar. The `leetcode-solve` fence renders read-only inside `![[embeds]]` and degrades safely on stray fences.

### Key accomplishments

1. **Widget Foundation + One-Way Sync** (Phase 19) — Self-contained inline `leetcode-solve` widget mounted via a two-path strategy: `registerMarkdownCodeBlockProcessor` (Reading mode, `editable.of(false)`) + a Live Preview ViewPlugin with `Decoration.replace`. Debounced one-way sync to disk via `vault.process` with per-path content-hash echo suppression (2s TTL, NOT a boolean flag), per-file rate-limiting, and six flush-on-transition hooks (unload, blur, leaf-change, rename, button-click, `beforeunload`). `EditorView.atomicRanges` keeps the parent cursor out of the fence. State (cursor/scroll/undo) persists across unmount/remount via a 30s-TTL map. Embeds + stray fences route to read-only.

2. **Reconciliation, UX, Action Row, Section Protection** (Phase 20) — External-edit reconciliation via `vault.on('modify')` with a conflict modal (Keep mine / Keep external / View diff + inline LCS line-diff) on in-flight-typing collisions. Run / Submit / AI Debug / Reset / Copy action row + language chevron mounted inside the widget DOM, reading code directly from the live `EditorView` (no disk round-trip). Language switching flips `lc-language` frontmatter → `metadataCache.on('changed')` → `Compartment.reconfigure` with no EditorView rebuild. `sectionLockExtension.ts` (527 LOC) narrowed to `sectionProtectionExtension.ts` (`## Problem` body + `## Techniques` heading only). Per-widget `vimCompartment` live-reconfigure. Live theme retheme via `css-change` + `requestMeasure`. Multi-pane single-active-per-file with a "Take over" affordance.

3. **v1.2 Migration** (Phase 21) — Lazy-on-open atomic migration: a v1.2 lang-slug fence under `## Code` (gated on `lc-slug` frontmatter) is rewritten to ` ```leetcode-solve ` with `lc-language` verified/derived, all in one `vault.process` callback so disk never observes a half-migrated state. Backup sidecar at `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/` with 30-day GC. Idempotent detection; never batch-migrates on plugin load. `codeExtractor.ts` sources language from frontmatter; `starterCodeInjector.ts` / `NoteTemplate.ts` emit `leetcode-solve` directly. CI fixtures span v1.0/v1.1/v1.2 sample notes with byte-exact assertions.

4. **Migration follow-up — typing-flicker fix** (Phase 21.1) — Closed UAT R10: with `autoMigrateOnOpen=ON`, the LP StateField's migrate/repair side-effects re-fired on every parent docChange, remounting the widget on each ~500ms flush. Fixed with a per-path attempt-once-this-session gate. Also closed the R6 fresh-create regression (wait for `metadataCache` before `openLinkText`). MIGRATE-FLICKER-01 resolved.

5. **v1.2 Path Removal + Polish + Ship** (Phase 22) — Hard cutover: `useInlineWidget` defaults ON, the 5 v1.2 files + 8 dead test files deleted, ~800 LOC of `src/main.ts` sync wiring removed, the `'leetcode.*'` userEvent convention retired (net −3,325 LOC across 34 files). Polish suite (vim-Tab cursor marker, widget hover border, action-row font). Release gates wired in-tree: bundle-size CI gate, `innerHTML` scan of `src/widget/`, README v1.3 architecture/migration/scoping docs, CLAUDE.md `## Architecture` rewrite, manifest bump. BRAT 7-day dogfood (1.3.0-beta.1) passed; surfaced regressions fixed via `/gsd-quick` (cursor-jump/char-rollback, multi-pane preview leaf-targeting, quick-search, issue-16 cookie filter). Shipped 1.3.0 stable.

### Requirements outcome

All 57 v1.3 requirements Resolved across phases 19/20/21/21.1/22 (WIDGET, SYNC, EMBED, ACTION, THEME, PROTECT, VIM, MIGRATE, DELETE, POLISH groups). VIM-03 resolved via documentation (vim-toggle in Settings requires an Obsidian reload — accepted as the v1.3 contract; the reload-on-toggle banner was explicitly not shipped). MIGRATE-FLICKER-01 added mid-milestone (Phase 21.1) and resolved.

### Tech stack notes (vs v1.2)

- Net code reduction: the dual-CM6 sync stack (`childEditorSync.ts` 809 LOC, `sectionLockExtension.ts` 527 LOC, `nestedEditorExtension.ts` 395 LOC, `childEditorRegistry.ts`, `codeActionsEditorExtension.ts`) deleted; replaced by a thin `widgetRegistry.ts` (`Map<key, EditorView>`) + `WidgetController`.
- `app.vault.process` is the sole mutation primitive; `'leetcode.*'` userEvent bypass convention retired.
- `@replit/codemirror-vim` carried over with per-widget `vimCompartment`.
- ~2,873 tests passing (up from 1,713 in v1.2).

### Known notes at close

- **vim-toggle requires Obsidian reload** (VIM-03) — Settings-panel vim toggle does not hot-reload the widget; documented in README "Known notes". Banner explicitly not shipped.
- **POLISH-03 eslint baseline** — `src/widget/` innerHTML scan PASS; a pre-existing repo-wide ~81-error eslint baseline (predates Phase 22) is deferred to a future cleanup pass. Plugin-store auto-rejection guard (innerHTML in widget code) is intact.
- **Multi-fence per problem note** — deferred to v1.4 (todo captured 2026-06-11).

### Archived artifacts

- `.planning/milestones/v1.3-ROADMAP.md` — full phase + plan list
- `.planning/milestones/v1.3-REQUIREMENTS.md` — requirements traceability with outcomes

---

## v1.0 MVP (Shipped: 2026-05-14)

**Phases completed:** 10 phases, 61 plans, 76 tasks

**Delivered:** A first-class Obsidian plugin for solving LeetCode problems without leaving the vault. Browse the LeetCode problem list, open a problem as a vault note (problem statement → `## Problem`, solution → `## Code`, your reflections → `## Notes`), run code against custom test cases, submit solutions and see verdicts inline, switch fence languages from a chevron dropdown, view past submissions, and have technique tags + backlinks auto-generated on Accepted submissions. Plugin-owned regions are structurally locked to prevent accidental edits.

### Key accomplishments

1. **Plugin foundation** (Phase 01) — Embedded BrowserWindow login flow, session cookie capture + persistence, throttled `requestUrl` HTTP layer with rate-limit handling, right-sidebar `ItemView` problem browser, ribbon icon + command palette activation.

2. **Problems-as-notes pipeline** (Phase 02) — First-click creates a `LeetCode/{id}-{slug}.md` vault note with full frontmatter (lc-id, lc-slug, lc-title, lc-difficulty, lc-url, lc-status, lc-language, aliases, tags), HTML-to-Markdown conversion via turndown, `## Problem` + `## Notes` template, `LeetCode.base` Bases view, offline cache.

3. **Run/Submit + verdict** (Phase 03) — Run code against editable test-case tabs, submit to LC, polling-based judge with abort/timeout, terminal verdict modal (Accepted/WA/TLE/MLE/RE/CE), session-expiry detection chain, network/rate-limit/timeout error UX.

4. **Knowledge graph wiring** (Phase 04) — On Accepted: auto-merge topic-slug tags (`lc/array`, `lc/hash-table`, …), append wikilinks under `## Techniques`, write technique stubs to a configurable folder, opt-out toggle for users who don't want auto-backlinks.

5. **Polish + ship-blocker resolution** (Phase 05 + 05.1 + 05.2) — Reading-mode action row (Run/Submit buttons under `## Code` fences), edit-mode inline buttons via CM6 `CodeActionsWidget` block decoration, copy-to-code from past submissions, settings-tab UI, MarkdownRenderer integration in submission detail modal.

6. **Language-aware editor** (Phase 05.3) — Chevron dropdown to switch fence language atomically (rewrites opener tag + body + frontmatter `lc-language` in one undo step), portal-pattern dropdown that escapes CM6 paint container, default-language fallback, `'leetcode.lang-switch'` userEvent annotation as the bypass convention for plugin-internal CM6 dispatches.

7. **Run/verdict UX polish** (Phase 05.4) — Multi-case Run modal with per-case input/output rendering, arity inference from `metaData`, "Copy failing testcase" affordance from VerdictModal, ephemeral tab store, polish across the verdict pill rendering and inline action row spacing.

8. **Section locking for lc-slug notes** (Phase 05.5) — `## Problem` body, `## Code` heading + fence opener + closing fence, `## Techniques` heading, `## Notes` heading become read-only in Edit Mode via a CM6 `EditorState.changeFilter`. Cursor snaps out of locked ranges. Selections allow copy. Heading `##` markers hidden for Reading-Mode parity. `vault.process` writes pass through cleanly.

### Tech stack

- TypeScript ^5.8.3 + esbuild bundler
- Obsidian plugin API + CodeMirror 6 (`@codemirror/state`, `@codemirror/view`)
- `@leetnotion/leetcode-api` for problem-list/detail/submissions GraphQL
- Hand-rolled REST for `interpret_solution` / `submit` / `check`
- `requestUrl` (Obsidian built-in) for all HTTP — bypasses Electron CORS
- `turndown` for HTML→Markdown conversion
- `vitest` for unit testing — 652 tests passing, ~163 KB production bundle

### Outstanding work (not v1.0 scope)

- Plan 07 (`05-07-SUMMARY.md`): GitHub release / `community-plugins.json` PR — version bump + tag + release artifacts. Documented as deferred manual step; ready to execute whenever the user is.

### Archived artifacts

- `.planning/milestones/v1.0-ROADMAP.md` — full phase + plan list
- `.planning/milestones/v1.0-REQUIREMENTS.md` — requirements traceability with outcomes

---

## v1.1 Contest, AI Coach, and Preview (Shipped: 2026-05-20)

**Phases completed:** 9 phases, 41 plans
**Timeline:** 2026-05-15 → 2026-05-20 (5 days)
**Stats:** 206 files changed, 37,219 insertions, 2,141 deletions. 1,450 tests passing. Bundle: 1.155 MB.

**Delivered:** AI-powered coaching + contest training + non-destructive preview. The v1.0 "solve and capture" plugin becomes a practice + coaching + AI-curated knowledge graph — preview problems without creating notes, run virtual past contests with timer and scoring, get AI debug suggestions on failed submissions, receive AI-generated 3-dimension reviews on Accepted solutions, and have AI maintain a 22-pattern knowledge graph with hub notes, difficulty-progression edges, cross-cluster Related Variants, and look-ahead wikilinks to unsolved problems.

### Key accomplishments

1. **Preview mode** (Phase 06) — Click-to-preview replaces click-to-create as default. Sticky header with difficulty + topic chips, "Start Problem" / "Open Problem" buttons, right-click context menu, tab-reuse semantics. CI bundle-size gate + eslint-plugin-obsidianmd@^0.3.0 lint baseline.

2. **AI Provider Foundation** (Phase 07) — `AIClient` facade with 5 provider adapters (Anthropic, OpenAI, OpenRouter, Ollama, Bedrock), `obsidianFetch(mode)` transport layer, masked key input, one-time data-flow disclosure modal, Test Connection probe matrix, Clear AI Key command, README network disclosure.

3. **AI Debug** (Phase 08 + 08.1 + 08.2) — User-triggered "AI: Debug" button on failed submissions. Token-by-token streaming via native `window.fetch()` primary tier with 2 fallback tiers. AWS Bedrock as full 5th provider with canonical credential chain (`AWS_PROFILE`, `credential_process`, auto-refresh). AIStreamModal with live render, Thinking indicator, Cancel + Copy.

4. **AI ACed Review** (Phase 09) — Opt-in auto-review on Accepted: 3-dimension LLM call (Approach + Efficiency + Code Style) writes to locked `## AI Review` section. Idempotent on re-AC. Manual re-run from command palette. Section-lock enforced.

5. **Contest mode** (Phase 10) — Past contest picker + "Surprise me" random. Virtual timer (90/100 min) with persistent epoch-baseline. 4-problem solve view with Run/Submit. Active contest header (countdown + verdict badges + pause/abort). ContestFinalizer writes summary note with solved/missed, per-problem time, score, technique tags, #revisit auto-tagging.

6. **AI Knowledge Graph** (Phase 11) — 22-pattern classifier (18 NeetCode + 4 additional). Cluster hub notes at `LeetCode/Patterns/{Cluster}.md` with difficulty-progression edges. Lazy-on-AC migration from v1.0 lc-tag wikilinks. Cross-cluster `## Related Variants` (capped at 2). Feature-flagged look-ahead edges to unsolved problems.

7. **Polish + release** (Phase 12) — Pattern chip on verdict modal, wikilink-to-preview navigation, H1 titles in notes, contest bug fixes (scratch files, tab idempotency, finish lifecycle), lazy AIClient construction, manifest v1.1.0, README audit.

### Tech stack additions (over v1.0)

- Vercel AI SDK 6.x (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@ai-sdk/amazon-bedrock`)
- Native `window.fetch()` for streaming AI (confined to `src/ai/` via prelint + fs-walk gates)
- In-plugin AWS credential chain (INI parser, `credential_process` spawnSync, cache + auto-refresh)
- 1,450 tests passing (up from 652 in v1.0)

### Archived artifacts

- `.planning/milestones/v1.1-ROADMAP.md` — full phase + plan list
- `.planning/milestones/v1.1-REQUIREMENTS.md` — requirements traceability with outcomes

---

## v1.2 Code Editor Experience (Shipped: 2026-05-26)

**Phases completed:** 6 phases, 31 plans
**Timeline:** 2026-05-21 → 2026-05-26 (6 days)
**Stats:** 47 files changed, 9,800 insertions. 1,713 tests passing. Bundle: 1.71 MB (raw) / 459 KB (gzip).

**Delivered:** A nested CM6 EditorView replaces the raw fence body with a proper code editor — syntax highlighting, auto-indent, bracket matching, comment toggling, and vim mode for all 8 LeetCode languages. Bidirectional sync keeps the child editor and parent markdown document in lock-step. Fence auto-recovery handles non-CM6 edits (vim, external tools). Optional relative line numbers provide vim-native navigation feedback.

### Key accomplishments

1. **Nested Editor Foundation** (Phase 13) — Child CM6 EditorView mounted via Decoration.widget + CSS-hidden fence lines. Plugin-level EditorView registry for lifecycle management. Python syntax highlighting proof-of-concept.

2. **Bidirectional Sync** (Phase 14) — Child↔parent sync protocol using CM6 split-view pattern with sync annotations to prevent echo loops. Offset derivation via findCodeFence(). Section lock coexistence verified (no input.* userEvent on sync dispatches).

3. **Focus, Undo & Cursor** (Phase 15) — Focus model (child/parent/Obsidian transitions), Tab/Shift-Tab indent via indentWithTab keymap, undo stack isolation with addToHistory:false, auto-grow CSS, Escape to return to parent.

4. **Language Packs & Switching** (Phase 16) — All 8 LC languages with full LanguageSupport (Lezer grammars). Compartment-based language switching via chevron. closeBrackets, bracketMatching, comment toggling all active. Indent size override setting.

5. **Polish & Edge Cases** (Phase 17) — Paste/clipboard (raw code only from any source), IME/CJK input, Source/Live Preview parity, themed HighlightStyle with Obsidian CSS variable tracking, vim mode integration, fence auto-recovery via parent-side updateListener.

6. **Vim, Recovery & Ship Close** (Phase 18) — Scope-based vim keystroke routing (Normal-mode keys stay in child). vault.on('modify') fence repair for non-CM6 edits. Relative line numbers setting. Bundle audit + heap snapshot both PASS.

### Requirements outcome

All 16 v1.2 requirements complete. BRACKET-05 (triple-backtick template literal) deferred to v1.3 — CM6's stock closeBrackets doesn't cover triple-quote sequences.

### Tech stack additions (over v1.1)

- 8 Lezer language grammars (@codemirror/lang-python, lang-java, lang-cpp, lang-javascript, lang-rust, @lezer/highlight)
- @replit/codemirror-vim 6.3.0 for vim mode
- CM6 Compartment-based language switching
- Custom ViewPlugin for vim isolation (Scope-based intercept pattern)
- 1,713 tests passing (up from 1,450 in v1.1)

### Known gaps at close

- 17-UAT.md status: partial (2 skipped — no Japanese/Korean IME available)
- Milestone audit not run (alpha shipped, user accepted gaps)

### Archived artifacts

- `.planning/milestones/v1.2-ROADMAP.md` — full phase + plan list
- `.planning/milestones/v1.2-REQUIREMENTS.md` — requirements traceability with outcomes
