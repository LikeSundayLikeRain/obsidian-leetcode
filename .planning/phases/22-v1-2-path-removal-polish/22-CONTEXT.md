# Phase 22: v1.2 Path Removal + Polish - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 22 is the **hard cutover** from v1.2 to v1.3 — the milestone-closing phase that flips `useInlineWidget` to default ON, deletes the 5 v1.2 source files (~2,246 LOC), removes ~800 LOC of `src/main.ts` v1.2 wiring, deletes 8 dead test files under `tests/main/`, retires the `'leetcode.*'` userEvent convention everywhere it appears in code and CLAUDE.md, ships 3 carry-over polish items (vim-Tab cursor-marker sync, widget hover border, action row font), runs 3 release gates (THEME-05 manual visual checklist, bundle-size hard cap at v1.2 baseline 1.71 MB raw, eslint-plugin-obsidianmd zero `innerHTML` in `src/widget/`), runs a 1-week BRAT alpha + author dogfood, and files plugin-store re-review.

In scope: 18 requirements (DELETE-01..08, POLISH-01..06, PROTECT-03, VIM-03, THEME-05) plus 3 carry-over polish items from Phase 20 UAT (vim-Tab marker desync, hover border, action row monospace bleed-through). Coexistence ends here — after this phase the v1.2 path is irrecoverable except via `git revert`.

Out of scope: any new v1.3 capabilities (those belong in v1.3.x); migration-infrastructure deletion (`fenceMigrator.ts`, `legacyFenceBanner.ts`, `migrationBackupGc.ts`, `autoMigrateOnOpen` setting all stay indefinitely so users upgrading 1.2.x → 1.3.x late still get lazy migration); reverse-migration shipping to users (kept dev-only); `useNestedEditor` data-migration code (read-and-ignore, not active deletion); v1.4+ deferred items (MULTI-01/02 multi-pane, PALETTE-01 static palette, BRACKET-01 triple-backtick pair).

</domain>

<decisions>
## Implementation Decisions

### Carry-Forward (locked by REQUIREMENTS.md / Phase 19+20+21 CONTEXT — not re-litigated)

- **L1:** Default flip is the cutover semantic — `useInlineWidget: false → true` in `SettingsStore.ts:287` is the user-visible event that activates v1.3 (REQUIREMENTS Q5; POLISH-01).
- **L2:** Migration infrastructure stays indefinitely — `fenceMigrator.ts`, `legacyFenceBanner.ts`, `migrationBackupGc.ts`, and the `autoMigrateOnOpen` setting (default ON) all remain after Phase 22 (Phase 21 CONTEXT §specifics: "the migrator + backup GC + banner stay"). Users who skip 1.3.0 and upgrade later from 1.2.x still need lazy migration.
- **L3:** Bundle hard cap at v1.2 baseline 1.71 MB raw (1,706,000 B). CI gate fails on regression past v1.2 size; Phase 22 expected to land well under (~−2,400 LOC net).
- **L4:** Manual theme-regression gate via dev-vault checklist (THEME-05). Author installs Minimal / Things / Catppuccin / Anuppuccin / Atom in dev vault, side-by-side screenshots vs. v1.2 baseline (which lives at the v1.2 ship commit), result documented in `22-VERIFICATION.md`. No automated visual-diff harness in Phase 22.
- **L5:** 1-week BRAT alpha + author dogfood is the POLISH-06 satisfaction bar. Tag `1.3.0-beta.1`, push to BRAT, dogfood for 7 days, watch GitHub Issues. Move to plugin-store submission if no P0/P1 issues surface.
- **L6:** `useNestedEditor` settings field handled via read-and-ignore — drop from `SettingsStore.ts` types/getters; `Object.assign` reads silently ignore the persisted field; on next save it disappears naturally. No active migration code.
- **L7:** VIM-03 reload-on-toggle banner is **NOT shipped** — Phase 20 live-reconfigure works, so VIM-03 is a no-op success criterion. Mark VIM-03 as "Resolved by Phase 20 live-reconfigure" in REQUIREMENTS.md traceability.
- **L8:** Plugin-store re-review checklist re-run is mandatory (`isDesktopOnly: true`, no `innerHTML` in widget code, no remote eval, no telemetry, manifest version bump to 1.3.0). Per ROADMAP §22 Key risks/notes.
- **L9:** README updated for v1.3 (architecture overview, migration docs, sync interaction notes, Cmd-Z per-widget undo scoping, Cmd-F focus-scoped scoping). Per POLISH-04.

### Plan Structure (D-plan)

- **D-plan-01: 3 plans by phase.** The deletion+cutover, polish, and release-gate concerns separate cleanly:
  - **22-01 — Cutover (default flip + delete v1.2 sources + delete dead tests + main.ts unwiring + CLAUDE.md conventions strip + userEvent annotations strip)**. Internally staged: flip default first → run full test suite + 1-day dev-vault dogfood → then delete sources/tests/wiring/conventions/annotations. Single atomic commit per stage. The flip-first sequencing (L11 below) is the safety net.
  - **22-02 — Carry-over polish (vim-Tab investigation + fix-or-defer; widget hover border CSS; action row font CSS).** Independent UI fixes; won't conflict with 22-01 deletions.
  - **22-03 — Release gates (THEME-05 manual checklist + bundle-size CI gate + eslint-plugin-obsidianmd clean run + README update + manifest version bump) + BRAT alpha + plugin-store re-review.** Sequential gates; the BRAT period is the wall-clock pacer.

  **Why:** ROADMAP §22 frames Phase 22 as "deletion + checklist, no new architecture" so plan count is small. 5 plans (one option) is finer granularity but 3 of those are checklists; collapsing them under one plan reduces friction. Single mega-plan (another option) loses `gsd-undo` granularity for what's effectively three separable concerns. **How to apply:** gsd-planner finalizes wave structure; recommended sequential ordering (22-01 → 22-02 → 22-03) so deletions don't churn polish PRs and so the release gates run against the post-deletion bundle.

### Cutover Sequencing (D-cutover)

- **D-cutover-01: Flip default first, delete after.** Within 22-01:
  1. **Sub-step A (flip):** `SettingsStore.ts:287` `useInlineWidget: false → true`. Update `DEFAULT_DATA.useInlineWidget` literal. Update mutual-exclusion logic in `Plugin.onload()` (`src/main.ts:1139` Notice — invert which path warns). Run full test suite. Atomic commit `feat(22-01): flip useInlineWidget default to true`.
  2. **Sub-step B (dogfood):** Deploy to dev vault, dogfood for 1 day on real LC notes (problem-open, solve, run, submit, AI debug, language switch, vim toggle, theme swap). If P0/P1 surfaces, fix BEFORE proceeding to deletion. (Phase 21.1 R6+R10 work proved fresh-create + typing-flicker stability — those are now baseline.)
  3. **Sub-step C (delete v1.2 sources):** Delete `src/main/childEditorSync.ts`, `sectionLockExtension.ts`, `nestedEditorExtension.ts`, `childEditorRegistry.ts`, `codeActionsEditorExtension.ts`. Atomic commit `chore(22-01): delete v1.2 source files (DELETE-01..05)`.
  4. **Sub-step D (delete dead tests):** Delete `tests/main/childEditorSync.test.ts`, `childEditorSync.repair.test.ts`, `sectionLockExtension.test.ts`, `nestedEditorExtension.test.ts`, `codeActionsEditorExtension.test.ts`, `childEditorRegistry.test.ts`, `resetCommand.childDispatch.test.ts`, `tabMidLine.test.ts`. Atomic commit `chore(22-01): delete dead v1.2 test files (DELETE-07)`.
  5. **Sub-step E (unwire main.ts + strip conventions + strip userEvent annotations):** Single atomic commit per D-unwire-01 below.

  **Why:** the flip-first ordering is the safety net — if the v1.3 path has a regression that surfaces only against `=ON`-default-fresh-install behavior (vs. `=OFF`-then-toggled-ON), we discover it WITH the v1.2 path still alive. Bug found post-flip is recoverable (toggle OFF → v1.2 path still works). Delete-first-then-flip was rejected because it removes the safety net. Single-atomic flip+delete commit was rejected because it loses the staged dogfood opportunity. **How to apply:** sub-steps run sequentially within 22-01; each is its own commit; failure at any sub-step rolls back at git granularity.

- **D-cutover-02: Mutual-exclusion logic inversion.** `src/main.ts:1139` currently warns "useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)" when both are true. After the default flip, the corruption-recovery path inverts: if `data.json` has `useInlineWidget: false` AND `useNestedEditor: true` (a 1.2.x carry-over), force `useInlineWidget=true` and emit `Notice('v1.2 nested-editor path retired in 1.3.0 — using v1.3 widget')`. After sub-step E deletes `useNestedEditor` entirely, this Notice path also dies. **Why:** users upgrading from 1.2.x have `useInlineWidget: false` in their `data.json`; without the inversion, they'd still mount the v1.2 path on the deleted code. **How to apply:** Plan 22-01 sub-step A handles this in the same commit as the flip.

### main.ts Unwiring (D-unwire)

- **D-unwire-01: Single atomic commit for all `src/main.ts` unwiring.** Single commit containing:
  - All `useInlineWidget=false` branches deleted (33+ mention sites).
  - All `useInlineWidget` checks deleted as redundant (the master gate is gone — the v1.3 path is the only path).
  - `childEditorRegistry` instantiation, `Plugin.childEditorRegistry` field, all `.get(file.path)` lookups, all `?.get` seams in `switchFenceLanguage` / `reset` / `copyToCode` deleted.
  - `nestedEditorRebuildEffect` import + dispatch sites deleted.
  - `ECHO_PRONE_USER_EVENTS` constant + `nestedEditorExtension.ts` import deleted.
  - `useNestedEditor` field reads/writes deleted; `getUseNestedEditor` getter deleted from `SettingsStore.ts`.
  - Fence-repair hook (the `dispatchChildLanguageReconfigure` + `handleFmChangeForLanguageReactivity` legacy-path branches) deleted; the v1.3 path's `metadataCache.changed` reactivity in `WidgetController` is the canonical replacement.
  - All `userEvent: 'leetcode.*'` annotations on `cm.dispatch` calls in `src/main.ts` stripped (lang-switch at lines 3395, 3905, 3963; reset.child at line 4546; peer-sync at line 1352 reference; ~10 sites total per `grep`).
  - CLAUDE.md `## Conventions` paragraph 1 (`'leetcode.*'` userEvent — `CLAUDE.md:195`) deleted; paragraph 2 ("Canonical plugin write-path pattern (Phase 17 D-05)" — `CLAUDE.md:197`) deleted.
  - Comment cleanup: every `// useInlineWidget=ON` / `// CONTEXT D-05` / `// per L9` comment that referenced the gate is either deleted or rewritten.

  Atomic commit `chore(22-01): unwire v1.2 path from src/main.ts + retire 'leetcode.*' userEvent convention (DELETE-06, DELETE-08, PROTECT-03)`.

  **Why:** logically atomic — half-unwired `main.ts` doesn't compile (every `useInlineWidget` branch references either v1.2 or v1.3 code). Multiple staged commits (option B) churn intermediate states that break TS compilation between commits and are useless for `gsd-undo`. Codemod (option C) is over-engineering for a one-time strip; manual + grep + tsc fast-feedback loop is sufficient. **How to apply:** gsd-executor opens the file, applies the deletions in order, runs `npm run build` after each substantive deletion to catch broken references, commits when full suite + tsc clean. Bundle size delta logged post-build for D-gate-01 verification.

- **D-unwire-02: Strip ALL `'leetcode.*'` userEvent annotations.** Even though the v1.3 `sectionProtectionExtension.ts` does not filter on userEvent, the annotations in `cm.dispatch` calls are now no-ops. Strip them: `'leetcode.lang-switch'` (~5 sites in `src/main.ts:3395, 3905, 3963` plus refs), `'leetcode.peer-sync'` (referenced), `'leetcode.reset.child'` (~1 site at line 4546). The `reset.child` callsite is unreachable post-DELETE-04 (`childEditorRegistry?.get` is `undefined`), so that whole branch dies anyway. Lang-switch and peer-sync targets live v1.3 dispatches — strip the annotation, keep the dispatch. **Why:** PROTECT-03 retires the convention; carrying dead annotations contradicts that. Saves a few hundred bytes; keeps the codebase honest. Diagnostic-value option was rejected — CM6 transaction logs aren't a debugging surface this plugin actively uses. Strip-only-`reset.child` was rejected because the convention should be retired wholesale, not partially. **How to apply:** included in the D-unwire-01 atomic commit; grep `userEvent: 'leetcode\.` to enumerate; remove each (and the comma/key as appropriate).

### Carry-Over Polish (D-polish)

- **D-polish-01: Vim-Tab cursor-marker sync investigation + fix.** The Phase 20-10 hotfix Tab handler at `src/widget/WidgetController.ts:1075-1090` routes Tab through `insertTab` directly. Vim's CM5-style block-cursor marker doesn't update because `insertTab` bypasses vim's input pipeline. **Investigation (time-boxed ~30 min in dev vault):** probe `Vim.handleKey('<Tab>', getCM(view))` on the existing CM5 adapter — if it dispatches the indent + updates the marker, ship the fix in Plan 22-02. Alternative shape: replace the explicit Tab handler with a vim-aware indent command that calls vim's own insert-text path (e.g., `getCM(view).execCommand('insertTab')` if exposed). **Fallback if empirically unreliable:** defer to v1.3.x backlog (not v1.4+ — close enough that it should ship in a 1.3.x patch); README notes the cosmetic; a tracked GitHub issue is opened. **Why:** ROADMAP §22 success criterion 7 calls this cosmetic-only ("typing lands at the correct offset; the visual marker is wrong") so it is not a release blocker. Hard-requiring the fix risks Phase 22 stall on an undocumented CM5 adapter behavior. Defer-entirely was rejected because the user has already framed Phase 22 success criteria with this fix; punting it past 1.3.x leaves a known-bad surface in the GA release. **How to apply:** Plan 22-02 starts with the dev-vault probe; gsd-executor reports findings; if `Vim.handleKey('<Tab>', cm5)` works, the fix is a 5-LOC change in `WidgetController.ts`; if it doesn't, the deferral is documented in 22-VERIFICATION.md and a backlog issue is created.

- **D-polish-02: Widget hover border removed.** Add CSS override scoped to `.lc-nested-editor .cm-editor:hover` (or the equivalent inner widget wrapper) suppressing the Obsidian-default border. Must NOT nuke cursor-marker / focus-ring styles. **Why:** ROADMAP §22 success criterion 8. Cosmetic — looks unfinished without this. **How to apply:** Plan 22-02 adds a single rule to `styles.css`; verify in dev vault that focused state, cursor visibility, and selection highlight remain unchanged.

- **D-polish-03: Action row uses normal font, not monospace.** Add `.leetcode-code-actions { font-family: var(--font-text); }` (and descendants as needed) to override the inherited `.cm-editor` monospace. **Why:** ROADMAP §22 success criterion 9. The chevron + buttons are UI chrome; reading them as monospace is a UX regression introduced by mounting them inside the widget DOM in Phase 20. **How to apply:** Plan 22-02 adds the rule to `styles.css`.

### Release Gates (D-gate)

- **D-gate-01: Bundle size hard cap.** CI gate (new or extension to existing post-build script) verifies `main.js` raw size `< 1,706,000 bytes` (v1.2 baseline). Fails the build (or PR check) on regression past v1.2 baseline. Phase 22 expected to land well under (~1.5 MB target given net −2,400 LOC). **Why:** POLISH-02 requires "measurably smaller"; hard cap operationalizes it. Soft warning was rejected (loses the guarantee). Both raw + gzipped (option C) was rejected as marginal upside since raw correlates. **How to apply:** Plan 22-03 adds the size assertion (hand-rolled `node -e 'process.exit(fs.statSync("main.js").size > 1706000 ? 1 : 0)'` or a dedicated script in `package.json`); CI pipeline (whatever runs `npm run build`) consumes the exit code.

- **D-gate-02: eslint clean run.** `npm run lint` with `eslint-plugin-obsidianmd` configured passes; `grep -r 'innerHTML' src/widget/` returns zero results. **Why:** POLISH-03; Obsidian plugin-store auto-review trips on `innerHTML` usage. **How to apply:** Plan 22-03 verifies; if any `innerHTML` exists in `src/widget/` (per-grep), it gets converted to `createEl` / `setText` / `appendChild` patterns in the same plan.

- **D-gate-03: Manual theme-regression checklist (THEME-05).** Author installs Minimal, Things, Catppuccin, Anuppuccin, Atom in dev vault. For each theme, opens a representative LC note with widget mounted (problem-open from the browser; existing solved note; AC'd note with `## AI Review`). Captures screenshot at consistent zoom + window size. Compares side-by-side against v1.2 baseline screenshots (which can be regenerated by `git checkout` of the v1.2 ship commit + same screenshot capture). Result documented in `22-VERIFICATION.md` with the screenshot pairs (or a clear pass/fail per theme). **Why:** ROADMAP §22 success criterion 3 explicitly calls out the 5 themes by name; manual checklist is sufficient for "side-by-side" framing; automated harness is v1.4+ infra investment. **How to apply:** Plan 22-03 includes the checklist execution; THEME-05 is the gate; failure on any theme blocks ship until rooted out.

- **D-gate-04: BRAT alpha + plugin-store re-review.** Tag `1.3.0-beta.1`, push tag to GitHub, ensure BRAT-compatible release artifacts (`main.js`, `manifest.json`, `styles.css`) attached. Author dogfoods for 7 calendar days on real LC notes. Watches `https://github.com/{owner}/{repo}/issues` for BRAT-specific reports. **Pass criteria:** no P0/P1 issues filed in the 7-day window AND no P0/P1 surfaces in author dogfood. On pass: tag `1.3.0`, attach release artifacts, file plugin-store re-review (PR to `obsidianmd/obsidian-releases` already exists for the plugin from v1.2 — version bump in the existing entry; community-plugins.json `id` unchanged). **Why:** POLISH-06; ROADMAP success criterion 6; matches single-author dogfood discipline of v1.0/v1.1/v1.2 ships. 2-week + explicit feedback solicitation (option B) was rejected as ship delay without proportional signal. Skip-BRAT (option C) was rejected because the architectural surface change (widget instead of nested editor) warrants real-vault smoke before plugin-store. **How to apply:** Plan 22-03 final wave; the 7-day window is the wall-clock pacer for the milestone close.

### Settings Cleanup (D-settings)

- **D-settings-01: `useNestedEditor` field handled via read-and-ignore.** Remove `useNestedEditor` from `SettingsStore.ts` `LeetCodeSettings` type, from `DEFAULT_DATA`, from the `loadFromRaw` mapper, from the `getUseNestedEditor()` getter, from any `setUseNestedEditor(v)` setter, and from `SettingsTab.ts` UI rendering. On the next `saveData()` after Phase 22 ships, the persisted `useNestedEditor` field disappears from `data.json` naturally (since the in-memory shape no longer includes it and `saveData(this.data)` writes only the canonical shape). **Why:** simplest correct approach; zero risk; matches "user owns their data" — we don't mutate `data.json` until they touch settings. Active migration (option B) adds testing burden for a one-shot cleanup. Deprecated alias (option C) carries v1.2 vocabulary forward. **How to apply:** Plan 22-01 sub-step E handles this in the unwiring commit.

- **D-settings-02: `autoMigrateOnOpen` setting stays.** Default ON. UI rendering stays. Migration infrastructure (`fenceMigrator.ts`, `legacyFenceBanner.ts`, `migrationBackupGc.ts`) stays. **Why:** users upgrading 1.2.x → 1.3.x late still need lazy migration. Phase 21 CONTEXT §specifics confirms this. **How to apply:** no change in Phase 22.

### CLAUDE.md Updates (D-claude)

- **D-claude-01: Delete obsolete Conventions paragraphs.** `CLAUDE.md:195` (the `'leetcode.*'` userEvent paragraph) and `CLAUDE.md:197` (the "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph) are both DELETED in Plan 22-01 sub-step E. Both reference v1.2 files (`sectionLockExtension.ts`, `childEditorSync.ts`, `childEditorRegistry`, `nestedEditorExtension.ts`, `codeActionsEditorExtension.ts`) that no longer exist post-deletion. **Why:** DELETE-08 + PROTECT-03; keeping them is a documentation lie. **How to apply:** Plan 22-01 unwiring commit deletes both paragraphs; the section heading `## Conventions` survives only if other conventions exist (currently both paragraphs ARE the section — section heading itself can be deleted if empty).

- **D-claude-02: Add v1.3 architecture note to CLAUDE.md `## Architecture` (currently empty placeholder "Architecture not yet mapped").** ~5-10 lines describing: widget-only path; `vault.process` is the only mutation primitive; `lc-language` frontmatter is canonical for Run/Submit dispatch; `sectionProtectionExtension` (narrow) protects `## Problem` body + `## Techniques` heading; migration infrastructure stays in tree for 1.2.x → 1.3.x late upgraders. **Why:** README is for users; CLAUDE.md is for future Claude sessions; a 5-line architecture sketch costs nothing and saves a future session from re-deriving the surface. **How to apply:** Plan 22-03 final wave (after the deletions are in tree, so the description matches reality).

### README Updates (D-readme)

- **D-readme-01: README v1.3 update.** Plan 22-03 updates `README.md` with: (a) one-line "v1.3 inline-widget architecture" callout in the version section; (b) migration docs subsection — "Existing v1.0/v1.1/v1.2 notes auto-migrate on first open in 1.3.x; migration writes a backup sidecar to `.obsidian/plugins/obsidian-leetcode/migration-backup-*/`; backups auto-delete after 30 days; toggle `autoMigrateOnOpen` to OFF for manual migration via the "Migrate this note" command palette entry"; (c) sync interaction notes — "Widget edits write to disk via debounced `vault.process` (~400ms); external edits reload the widget; conflict modal appears on collision"; (d) Cmd-Z scoping — "Undo is per-widget — Cmd-Z inside the widget undoes widget edits; Cmd-Z outside undoes parent-doc edits"; (e) Cmd-F scoping — "Find is focus-scoped — Cmd-F inside the widget searches widget content; outside searches the parent doc". **Why:** POLISH-04; matches plugin-store re-review expectations (architecture changes warrant user-facing docs). **How to apply:** Plan 22-03; one PR; verify final rendering on GitHub.

### Manifest + Version Bump (D-manifest)

- **D-manifest-01: `manifest.json` version bump to 1.3.0** (from 1.2.x — verify exact current value at planning time). `package.json` version bump in lockstep. `manifest.json` `description` field reviewed for ≤250 char limit. `isDesktopOnly: true` confirmed unchanged. **Why:** Plugin-store auto-review and BRAT both consume `manifest.json` version; mismatch with git tag fails ship. **How to apply:** Plan 22-03 in the BRAT-tag preparation step; one commit `chore(22-03): bump version to 1.3.0-beta.1`; second commit at GA `chore(22-03): bump version to 1.3.0`.

### Claude's Discretion

- **`autoMigrateOnOpen` UI placement.** Currently it's likely under an "Experimental" or "Migration" subsection in `SettingsTab.ts`. After cutover, it stops being experimental — should it move to a top-level setting? Recommendation: leave under "Migration" subsection (or rename "Experimental" → "Migration" if that's the only experimental setting left); planner finalizes after surveying SettingsTab structure post-deletion.
- **`useNestedEditor` UI deletion ordering.** When the `useNestedEditor` toggle disappears from `SettingsTab.ts`, any user with the settings panel open at the moment of plugin reload sees a missing toggle. This is acceptable (no error path). Recommendation: deletion in sub-step E lands together with the field deletion in `SettingsStore.ts`.
- **Vim-Tab fix discovery via probe vs. spike.** The investigation could be a `/gsd-spike` if it grows past 30 min. Recommendation: time-box at 30 min; if a definitive answer doesn't emerge, defer to v1.3.x backlog and proceed to D-polish-02 + D-polish-03. Avoid Phase 22 stall on an empirical unknown.
- **THEME-05 baseline regeneration.** v1.2 baseline screenshots may not exist as artifacts in the repo. Recommendation: at the start of Plan 22-03, capture v1.2 baseline by `git stash` + `git checkout <v1.2 ship commit>` + screenshot in dev vault + `git stash pop`. The 5 baseline screenshots become inline assets in `22-VERIFICATION.md`.
- **Plugin-store re-review submission.** The community-plugins.json entry exists from v1.0; v1.3 ship is a version-bump-trigger re-review (no new PR needed unless the entry's `repo`/`name` changed). Recommendation: planner verifies at PR time; if the entry needs update, it's a one-line PR to `obsidianmd/obsidian-releases`.
- **`tests/main/` directory after deletion.** After 8 dead-test deletions, `tests/main/` may have surviving files. Recommendation: verify `tests/main/` is non-empty post-deletion; if empty, remove the directory; planner finalizes by survey at Plan 22-01 sub-step D.
- **Lockfile / package.json cleanup.** No new dependencies needed for Phase 22; verify no v1.2-only deps can be dropped (e.g., if `@codemirror/some-extension` was only used by deleted files). Recommendation: `npm ls` survey at end of Plan 22-01 sub-step E; remove unused entries from `package.json` `dependencies` if found.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 22 Direct Foundation
- `.planning/phases/19-widget-foundation-one-way-sync/19-CONTEXT.md` — Widget mount strategy (C-01..C-17, D-01..D-10); `useInlineWidget=ON` master gate origin; mutual-exclusion assert design.
- `.planning/phases/20-reconciliation-ux-action-row-section-protection/20-CONTEXT.md` — `sectionProtectionExtension` design; action row mount-inside-widget; vim live-reconfigure validation.
- `.planning/phases/21-v1-2-migration/21-CONTEXT.md` — Migration infrastructure (`fenceMigrator`, `legacyFenceBanner`, `migrationBackupGc`, `autoMigrateOnOpen`) — all kept in tree per Phase 22.
- `.planning/phases/21.1-v1-2-migration-follow-up-typing-flicker-fix/21.1-01-SUMMARY.md` — R6 fresh-create + R10 typing-flicker fixes; baseline behavior Phase 22 must NOT regress.

### Project / Milestone State
- `.planning/PROJECT.md` — v1.3 architecture decisions; v1.2 → v1.3 cutover rationale.
- `.planning/REQUIREMENTS.md` — Phase 22 owns DELETE-01..08, POLISH-01..06, PROTECT-03, VIM-03, THEME-05 (lines 199-212 traceability).
- `.planning/ROADMAP.md` §"Phase 22: v1.2 Path Removal + Polish" (lines 273-307) — Goal, success criteria 1-9, key risks/notes (LOW research flag — deletion + checklist, no new architecture).
- `.planning/STATE.md` lines 91-92 — Bundle headroom note: "~92 KB remaining after v1.2's vim addition. v1.3 should net out negative (−2,400 LOC) but CI gate must guard."

### v1.3 Research (foundation)
- `.planning/research/SUMMARY.md` — Q1–Q7 confirmed decisions; Q5 default-ON rollout.
- `.planning/research/PITFALLS.md` — Especially **P5** (default flip is a hard cutover; intermediate state is a bug surface), **P13** (plugin-store re-review trigger on architectural change), **P25** (no `innerHTML` in widget).
- `.planning/research/STACK.md` — `Plugin.addCommand`, `Plugin.removeCommand` lifecycle; manifest fields.

### v1.2 Source Files (DELETION TARGETS — Plan 22-01 sub-step C)
- `src/main/childEditorSync.ts` (809 LOC) — DELETE-01.
- `src/main/sectionLockExtension.ts` (527 LOC) — DELETE-02 (replaced by `src/main/sectionProtectionExtension.ts`, which stays).
- `src/main/nestedEditorExtension.ts` (395 LOC) — DELETE-03.
- `src/main/childEditorRegistry.ts` (114 LOC) — DELETE-04 (no replacement needed; `widgetRegistry.ts` already exists).
- `src/main/codeActionsEditorExtension.ts` (401 LOC) — DELETE-05 (`findCodeFence` already lifted to `src/widget/fenceLocator.ts`).

### Dead Test Files (DELETION TARGETS — Plan 22-01 sub-step D)
- `tests/main/childEditorSync.test.ts`
- `tests/main/childEditorSync.repair.test.ts`
- `tests/main/sectionLockExtension.test.ts`
- `tests/main/nestedEditorExtension.test.ts`
- `tests/main/codeActionsEditorExtension.test.ts`
- `tests/main/childEditorRegistry.test.ts`
- `tests/main/resetCommand.childDispatch.test.ts`
- `tests/main/tabMidLine.test.ts`

### v1.3 Code Files (touch points)
- `src/main.ts` — **Modify (massive).** Plan 22-01 sub-step E: ~800 LOC unwiring, all `useInlineWidget=false` branches deleted, `childEditorRegistry` field + lookups deleted, `'leetcode.*'` userEvent annotations stripped (~10 sites). Verify line counts pre/post.
- `src/settings/SettingsStore.ts` — **Modify.** Delete `useNestedEditor` field from type, `DEFAULT_DATA`, `loadFromRaw`, getter, setter. Flip `useInlineWidget` default to `true`.
- `src/settings/SettingsTab.ts` — **Modify.** Delete `useNestedEditor` toggle UI; verify `autoMigrateOnOpen` toggle still mounts cleanly (Phase 21 added it).
- `src/widget/WidgetController.ts` — **Modify (Plan 22-02).** Vim-Tab handler at lines 1075-1090; investigate `Vim.handleKey('<Tab>', getCM(view))` route.
- `styles.css` — **Modify (Plan 22-02).** Add `.lc-nested-editor .cm-editor:hover { border: none; ... }` and `.leetcode-code-actions { font-family: var(--font-text); }` overrides.
- `CLAUDE.md` — **Modify.** Delete `## Conventions` paragraphs at lines 195 + 197 (Plan 22-01 sub-step E). Add `## Architecture` v1.3 sketch (Plan 22-03).
- `README.md` — **Modify (Plan 22-03).** v1.3 architecture overview, migration docs, sync notes, Cmd-Z/Cmd-F scoping behavior.
- `manifest.json` + `package.json` — **Modify (Plan 22-03).** Version bump to 1.3.0-beta.1 (BRAT) and 1.3.0 (GA).

### Migration Infrastructure (KEPT — do NOT delete)
- `src/widget/fenceMigrator.ts`
- `src/widget/legacyFenceBanner.ts`
- `src/widget/migrationBackupGc.ts`
- `src/main/readingModeMigrationHook.ts`
- `src/main/readingModeLegacyBannerPostProcessor.ts`
- `autoMigrateOnOpen` setting in `SettingsStore.ts`
- `migrateAttempted` / `repairAttempted` Sets on Plugin instance (Phase 21.1 R10 fix)

### Obsidian / CodeMirror Reference
- `node_modules/obsidian/obsidian.d.ts` (`obsidian@1.12.3`) — `Plugin.addCommand`/`removeCommand`, `Notice`, `Plugin.onload`/`onunload` lifecycle.
- `@replit/codemirror-vim` exports — `getCM(view)` returns CM5 adapter; `Vim.handleKey` is the input pipeline (D-polish-01 probe target).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (verbatim)
- `src/widget/fenceLocator.ts:findCodeFence` — Already returns `kind: 'leetcode-solve' | 'legacy'`; covers all v1.3 widget mount paths. No changes for Phase 22.
- `src/widget/fenceSerialization.ts:rewriteFenceBody` — Body-preserving fence-opener swap; the migration codepath uses this. No changes for Phase 22.
- `src/main/sectionProtectionExtension.ts` — The v1.3 narrow extension (replaces `sectionLockExtension.ts`); already in tree from Phase 20. After Phase 22 it's the ONLY section-protection extension; `sectionLockExtension.ts` deletion has no replacement need.
- `src/widget/widgetRegistry.ts` — Already in tree; replaces `childEditorRegistry.ts` (DELETE-04). No new code needed.
- Phase 21.1 attempt-once Sets (`migrateAttempted`, `repairAttempted`, `codeBlockProcessorMigrateAttempted`) — Stable; no Phase 22 changes needed.
- Phase 21 R6 fresh-create fix in `src/notes/NoteWriter.ts` (`waitForFrontmatterIndexed` bounded poll) — Stable; baseline for Phase 22.

### Established Patterns
- **Atomic commit per concern** (Phase 19/20/21 discipline) — Phase 22 follows: cutover (D-cutover-01 sub-steps each their own commit); polish (one commit per polish item if independent, else atomic per file); release gates (one commit per gate-pass artifact).
- **Read-and-ignore for deprecated settings fields** (no precedent in this repo; new pattern in Phase 22) — D-settings-01 establishes this. Future deprecations follow.
- **`useInlineWidget` master gate** (Phase 19 D-05, Phase 21 L9) — DIES in Phase 22. Gate-removal pattern: every `if (useInlineWidget)` becomes the unconditional v1.3 branch; every `else` arm is deleted; the `useInlineWidget` getter becomes unused and is deleted.
- **CLAUDE.md `## Conventions` updates align with code state** (Phase 17 D-05 added the userEvent convention; Phase 22 deletes it). Conventions stay only when the underlying mechanism stays. **Pattern enforcement: deleting a code mechanism without deleting its convention paragraph is a documentation regression — Phase 22 catches both.**

### Integration Points
- `Plugin.onload()` (`src/main.ts:1101`-`~1180`) — Heaviest unwiring site: mutual-exclusion logic between `useNestedEditor` and `useInlineWidget`, all v1.2 extension registrations, the `childEditorRegistry` instantiation. Plan 22-01 sub-step E: this becomes purely v1.3 path registrations.
- `src/main.ts:846-857` `editorCheckCallback` — `useInlineWidget` self-gate at line 857 becomes unconditional `true`; the function body simplifies.
- `src/main.ts:1101-1180` (after sub-step A flip) — `useNestedEditor` branch (line 1151) deleted; `useInlineWidget` branch (line 1165) becomes unconditional.
- `src/main.ts:1333-1380` (Specific Findings §4 gated body) — `useInlineWidget` gate becomes unconditional; the gated body is the only path.
- `src/main.ts:3322-4107` (lang-switch dispatch sites) — `userEvent: 'leetcode.lang-switch'` annotations stripped; the dispatches themselves stay (they target the v1.3 widget's child CM6).
- `src/main.ts:4493-4570` (Reset child dispatch) — The whole `childEditorRegistry?.get(file.path)` lookup branch deleted; Reset goes directly through `widgetRegistry`-based dispatch.
- `src/widget/WidgetController.ts:1075-1090` — Vim-Tab handler; D-polish-01 fix or defer.
- `src/widget/codeBlockProcessor.ts:202` and `:292` — `useInlineWidget` self-gates become unconditional.
- `src/widget/liveModeBannerStateField.ts:276` — `getUseInlineWidget?.() !== false` check becomes unconditional `true` (or simply remove the gate).
- `src/widget/liveModeViewPlugin.ts:55` — `useInlineWidget` getter type-arg can be deleted from the interface.
- `src/solve/codeExtractor.ts:32` — Comment about `useInlineWidget=ON` becomes a stale reference; Phase 21's MIGRATE-09 dual-path becomes single-path (the legacy fence-tag branch is unreachable). Plan 22-01 sub-step E deletes the legacy fence-tag branch in this file.
- `src/solve/starterCodeInjector.ts:284-290` — `getUseInlineWidget?(): boolean` arg becomes redundant; the ternary `settings.getUseInlineWidget?.() === true ? 'leetcode-solve' : 'legacy'` collapses to `'leetcode-solve'`. Plan 22-01 sub-step E updates the type signature and removes the legacy fence emission path.
- `src/notes/NoteTemplate.ts` (Phase 21 D-emit-01 split) — `codeBlockFor` legacy emitter deleted; `codeBlockForV13` renamed to `codeBlockFor` (single emitter). `useInlineWidget` gate at call sites deleted. Plan 22-01 sub-step E.

</code_context>

<specifics>
## Specific Ideas

- **The "hard cutover" framing in ROADMAP §22 is the philosophical anchor for Phase 22.** Coexistence ends here — every accommodation for `useInlineWidget=false` (the gate, the v1.2 sources, the dead tests, the userEvent convention, the read-and-ignore `useNestedEditor` field) is removed. The result is a codebase where v1.3 is THE path, not "one of two paths."
- **Flip-first sequencing (D-cutover-01) is the safety net.** A regression that surfaces only against `=ON`-default-fresh-install behavior (not `=OFF`-then-toggled-ON) is non-zero — Phase 21.1's R6 was exactly that class of bug. Discovering it WITH the v1.2 path still alive lets us toggle off, fix, retry. After deletion, recovery is `git revert` — much higher friction.
- **D-unwire-01's atomic commit is logically forced by the type system.** Half-unwired `main.ts` doesn't compile. Multiple staged commits (option B from the planning question) is a paper preference; the practical unit is "the moment `tsc` passes." Single commit captures that moment cleanly. Codemod (option C) is over-engineering for a one-time strip — manual + grep + tsc fast-feedback is sufficient.
- **D-unwire-02 (strip ALL `'leetcode.*'` annotations) is a documentation+code consistency move.** PROTECT-03 retires the convention; carrying dead annotations on live dispatches contradicts that. The v1.3 `sectionProtectionExtension` doesn't filter on userEvent — the annotations are no-ops. Cost is a few hundred bytes; benefit is a codebase that means what it says.
- **Read-and-ignore for `useNestedEditor` (D-settings-01) is the obsidian-plugin idiom for deprecated fields.** No active migration code; the persisted field disappears on next save. Most users of this plugin won't even notice — they'll see `useInlineWidget` work as expected.
- **D-polish-01's time-box-then-defer is the correct disposition for an undocumented CM5 adapter behavior.** Phase 22 is "deletion + checklist, no new architecture" — investigating an undocumented vim adapter and shipping a fix that may not work is more architecture work than the phase scope permits. 30-min probe is generous; if it fails, the cosmetic ships in 1.3.x.
- **THEME-05 manual checklist (D-gate-03) is intentionally low-tech.** Visual diff harnesses for Obsidian don't exist as a turnkey solution; building one is v1.4+ infra. The manual checklist is sufficient for the success criterion's "side-by-side" framing and matches the single-author dogfood discipline of v1.0/v1.1/v1.2.
- **D-gate-04 (BRAT alpha) is the wall-clock pacer for milestone close.** 7 days. Not "until enough feedback" — that's open-ended. Author dogfood + watching GitHub Issues is the discipline. Plugin-store re-review submission triggers AFTER the BRAT pass.
- **Migration infrastructure (`fenceMigrator.ts`, `legacyFenceBanner.ts`, `migrationBackupGc.ts`) stays in tree forever-ish.** Users who skip 1.3.0 and upgrade later from 1.2.x still need lazy migration. Deletion in v1.4+ (option B in the migration-code question) was rejected as deferred decision; keeping it is zero-cost vs. the "what about the late upgraders" risk.
- **Deletion-in-Phase-22 (the rejected option C in the migration-code question) was a strand-user-data risk.** Some users delay upgrades by months; deleting the migration path now would force them to manually fix every legacy note, contradicting the "user owns their vault" principle that has guided v1.0–v1.2.

</specifics>

<deferred>
## Deferred Ideas

- **Automated visual-diff harness for THEME-05** — v1.4+ infra investment. Phase 22 uses manual checklist (D-gate-03). If theme regressions become a recurring concern, build the harness as its own phase.
- **Migration infrastructure deletion** — v1.4+ candidate after a sunset window during which most 1.2.x users have upgraded. Phase 22 keeps everything per L2.
- **`useNestedEditor` active migration code** — Read-and-ignore is sufficient (D-settings-01). If a future scenario requires actively cleaning persisted v1.2 fields, that becomes its own one-shot migration phase.
- **Vim-Tab cursor-marker fix backlog** — If Phase 22 D-polish-01 probe is empirically unreliable, defer to v1.3.x with a tracked GitHub issue. README notes the cosmetic.
- **Bundle gzipped ceiling** — Phase 22 caps raw at 1.71 MB (D-gate-01); gzipped cap is option C (rejected as marginal upside). If gzipped-specific regressions surface, add the gate in v1.3.x.
- **v1.4+ multi-pane live/mirror (MULTI-01/02)** — Deferred per Phase 19 Q4.
- **v1.4+ static palette (PALETTE-01)** — v1.2 backlog 999.1 carried forward.
- **v1.4+ triple-backtick bracket pair (BRACKET-01)** — Phase 19 deferred.
- **VIM-03 reload-on-toggle banner** — NOT shipped per L7 (Phase 20 live-reconfigure works). Mark as "Resolved by Phase 20 live-reconfigure" in REQUIREMENTS.md traceability.
- **Plugin-store auto-rejection escape hatch** — If the re-review surfaces a blocker (e.g., a hidden `innerHTML` in a path eslint missed), Plan 22-03 fixes it inline; if blocker is non-trivial, mini-phase 22.1 handles.

</deferred>

---

*Phase: 22-v1-2-path-removal-polish*
*Context gathered: 2026-06-02*
