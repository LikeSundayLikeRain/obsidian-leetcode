# Phase 22: v1.2 Path Removal + Polish - Research

**Researched:** 2026-06-02
**Domain:** Hard cutover deletion + release polish + plugin-store re-review
**Confidence:** HIGH

## Summary

Phase 22 is a deletion phase, not an architectural phase. Every empirical question the planner needs answered comes from grep + reading source — there is no SDK uncertainty, no library probe, no upstream API risk. This research enumerates the exact cutsites in `src/main.ts`, `src/settings/SettingsStore.ts`, `src/settings/SettingsTab.ts`, `src/solve/codeExtractor.ts`, `src/solve/starterCodeInjector.ts`, `src/notes/NoteTemplate.ts`, `src/notes/NoteWriter.ts`, `src/contest/ContestFinalizer.ts`, `styles.css`, `CLAUDE.md`, and the test suite, and verifies the assertion baselines for the three release gates (bundle size, eslint, theme regression).

**One unresolved empirical risk and one corrected scope item surfaced:**
1. The vim-Tab cursor-marker fix (D-polish-01) targets `src/widget/WidgetController.ts:1075-1090`. The CM5 adapter exposed by `@replit/codemirror-vim@6.3.0` exports `Vim.handleKey(cm, key, origin)` — verified against `node_modules/@replit/codemirror-vim/dist/index.d.ts:11`. The minimal probe is `Vim.handleKey(getCM(view), '<Tab>', 'mapping')`. Whether this dispatches the indent + updates the block-cursor marker is empirically unknown; the 30-min time-box from CONTEXT D-polish-01 stands.
2. CONTEXT references CLAUDE.md `## Conventions` at "lines 195+197" — the actual repo state at HEAD has the userEvent paragraph at `CLAUDE.md:195` (single bullet) and the canonical write-path paragraph at `CLAUDE.md:197` (single bullet). Both are still in tree exactly as expected. There are no other surviving conventions paragraphs — deletion of both bullets empties `## Conventions`, so the section heading itself can also be deleted (Discretion item from CONTEXT).

**Primary recommendation:** Plan 22-01 follows the sub-step A→E sequence verbatim from CONTEXT D-cutover-01. The single biggest risk in Plan 22-01 is the **mutual-exclusion inversion in sub-step A** at `src/main.ts:1139-1144`, which today reads "useInlineWidget is ON — disabling useNestedEditor"; it must invert to "useNestedEditor is set — forcing useInlineWidget=true (v1.2 retired)" so 1.2.x users carrying `useInlineWidget: false` in their `data.json` don't fall through to deleted v1.2 code. After sub-step E completes the field deletions, this inversion path also dies.

## Architectural Responsibility Map

Phase 22 is removal, not new capability. Every retained tier is the v1.3 widget tier already shipped in Phases 19–21.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Code-block widget mount (Reading + Live Preview) | Widget (`src/widget/`) | — | Phase 19 deliverable; only path after Phase 22. |
| Section protection (`## Problem` body / `## Techniques` heading) | Editor extension (`src/main/sectionProtectionExtension.ts`) | — | Phase 20 narrowed extension; `sectionLockExtension.ts` deletes here. |
| One-way sync (widget → vault.process → file → modify → reload) | Widget (`src/widget/debouncedWriter.ts` + `selfWriteSuppression.ts`) | — | Phase 19; unchanged. |
| Action row (Run / Submit / AI Solution / Reset / Retrieve + chevron) | Widget DOM (`src/widget/widgetActions.ts` + reused `src/main/codeBlockButtonRow.ts`) | — | Phase 20; CSS polish in 22-02. |
| Lazy v1.2 → v1.3 migration | Widget (`src/widget/fenceMigrator.ts`) | Reading-mode hook (`src/main/readingModeMigrationHook.ts`) | Phase 21; KEPT indefinitely for late upgraders (CONTEXT L2). |
| Backup GC (30-day cleanup) | Plugin lifecycle (`src/widget/migrationBackupGc.ts`) | — | Phase 21; KEPT indefinitely. |
| Settings UI | `src/settings/SettingsTab.ts` | `SettingsStore.ts` | Toggle removal in 22-01 sub-step E. |
| Bundle size gate | CI (`scripts/check-bundle-size.mjs` + `.github/workflows/ci.yml`) | `package.json` script | Existing infrastructure; thresholds adjusted in 22-03. |
| Theme regression check | Manual dev-vault checklist | — | Author runs in 22-03; no automation in scope. |

## User Constraints (from CONTEXT.md)

### Locked Decisions

> Copied verbatim from `.planning/phases/22-v1-2-path-removal-polish/22-CONTEXT.md` `<decisions>` section. The planner MUST NOT re-litigate these.

**Carry-Forward (Phase 19+20+21 + REQUIREMENTS.md):**
- **L1** Default flip is the cutover semantic — `useInlineWidget: false → true` in `SettingsStore.ts:287` is the user-visible event that activates v1.3.
- **L2** Migration infrastructure stays indefinitely — `fenceMigrator.ts`, `legacyFenceBanner.ts`, `migrationBackupGc.ts`, `autoMigrateOnOpen` setting all remain after Phase 22.
- **L3** Bundle hard cap at v1.2 baseline 1.71 MB raw (1,706,000 B). CI gate fails on regression past v1.2 size.
- **L4** Manual theme-regression gate via dev-vault checklist (THEME-05). 5 themes (Minimal / Things / Catppuccin / Anuppuccin / Atom). No automated visual-diff harness.
- **L5** 1-week BRAT alpha + author dogfood is POLISH-06 satisfaction bar. Tag `1.3.0-beta.1`, push to BRAT, dogfood 7 days, watch GitHub Issues.
- **L6** `useNestedEditor` settings field handled via read-and-ignore — drop from `SettingsStore.ts` types/getters/mapper.
- **L7** VIM-03 reload-on-toggle banner is **NOT shipped** — Phase 20 live-reconfigure works, so VIM-03 is a no-op success criterion. Mark as "Resolved by Phase 20".
- **L8** Plugin-store re-review checklist mandatory (`isDesktopOnly: true`, no `innerHTML`, no remote eval, no telemetry, manifest version bump to 1.3.0).
- **L9** README updated for v1.3 (architecture, migration docs, sync interaction, Cmd-Z + Cmd-F scoping).

**Plan Structure:**
- **D-plan-01** 3 plans by phase: 22-01 cutover (sub-steps A→E) → 22-02 carry-over polish → 22-03 release gates + BRAT + plugin-store.

**Cutover Sequencing:**
- **D-cutover-01** Flip default first, delete after. Sub-steps A (flip) → B (1-day dev-vault dogfood) → C (delete v1.2 sources) → D (delete dead tests) → E (unwire main.ts + strip conventions + strip userEvent annotations).
- **D-cutover-02** Mutual-exclusion logic inversion at `src/main.ts:1139`: when `data.json` has `useInlineWidget: false` AND `useNestedEditor: true` (1.2.x carry-over), force `useInlineWidget=true` and emit Notice "v1.2 nested-editor path retired in 1.3.0 — using v1.3 widget". After sub-step E deletes `useNestedEditor`, this Notice path also dies.

**main.ts Unwiring:**
- **D-unwire-01** Single atomic commit for all `src/main.ts` unwiring (33+ `useInlineWidget` mention sites, all `useInlineWidget=false` branches, `childEditorRegistry` field + lookups, `nestedEditorRebuildEffect` import + dispatches, `ECHO_PRONE_USER_EVENTS`, `useNestedEditor` reads, fence-repair hook, ~10 `'leetcode.*'` userEvent annotations, CLAUDE.md `## Conventions` paragraphs, comment cleanup).
- **D-unwire-02** Strip ALL `'leetcode.*'` userEvent annotations: `'leetcode.lang-switch'` (~5 sites), `'leetcode.peer-sync'` (referenced), `'leetcode.reset.child'` (~1 site at line 4546).

**Carry-Over Polish:**
- **D-polish-01** Vim-Tab cursor-marker sync: 30-min dev-vault probe targeting `Vim.handleKey('<Tab>', getCM(view))` on the existing CM5 adapter at `src/widget/WidgetController.ts:1075-1090`. Time-box; if probe fails, defer to v1.3.x backlog with README note + tracked GitHub issue.
- **D-polish-02** Widget hover border removed via `.lc-nested-editor .cm-editor:hover` (or inner widget wrapper) override; MUST NOT nuke cursor-marker / focus-ring styles.
- **D-polish-03** Action row uses normal font: `.leetcode-code-actions { font-family: var(--font-text); }` to override inherited `.cm-editor` monospace.

**Release Gates:**
- **D-gate-01** Bundle size hard cap: `main.js` raw size `< 1,706,000` bytes. CI gate fails on regression. Phase 22 expected ~1.5 MB target.
- **D-gate-02** eslint clean run: `npm run lint` passes; `grep -r 'innerHTML' src/widget/` returns zero results.
- **D-gate-03** Manual theme-regression checklist (THEME-05): 5 themes × representative LC notes; screenshots vs. v1.2 baseline; documented in `22-VERIFICATION.md`.
- **D-gate-04** BRAT alpha + plugin-store re-review: tag `1.3.0-beta.1`, 7-day dogfood window, no P0/P1 → tag `1.3.0`, file plugin-store re-review.

**Settings Cleanup:**
- **D-settings-01** `useNestedEditor` handled via read-and-ignore — remove from type/`DEFAULT_DATA`/`loadFromRaw`/getter/setter/`SettingsTab.ts` UI; persisted field disappears on next `saveData()`.
- **D-settings-02** `autoMigrateOnOpen` stays. Default ON. UI rendering stays.

**CLAUDE.md Updates:**
- **D-claude-01** Delete obsolete Conventions paragraphs at `CLAUDE.md:195` (`'leetcode.*'` userEvent) and `CLAUDE.md:197` (Canonical plugin write-path pattern). Section heading itself can be deleted if both paragraphs are the entire section.
- **D-claude-02** Add v1.3 architecture note to CLAUDE.md `## Architecture` (currently empty placeholder). ~5–10 lines describing widget-only path; `vault.process` is the only mutation primitive; `lc-language` frontmatter is canonical for Run/Submit dispatch; `sectionProtectionExtension` (narrow) protects `## Problem` body + `## Techniques` heading; migration infrastructure stays in tree.

**README Update:**
- **D-readme-01** README v1.3 update: (a) one-line "v1.3 inline-widget architecture" callout; (b) migration docs subsection; (c) sync interaction notes (~400ms `vault.process`, conflict modal, external-edit reload); (d) Cmd-Z scoping ("undo is per-widget"); (e) Cmd-F scoping ("find is focus-scoped").

**Manifest + Version Bump:**
- **D-manifest-01** `manifest.json` version → 1.3.0 (from 1.0.1 — NOTE: empirical anomaly, see Specific Findings §2). `package.json` in lockstep. Description ≤250 chars verified. `isDesktopOnly: true` confirmed.

### Claude's Discretion

> The planner MAY choose freely within these areas. Recommendations are advisory.

- **`autoMigrateOnOpen` UI placement.** Currently under "Experimental" subsection in `SettingsTab.ts`. Recommendation: leave under "Migration" subsection (or rename "Experimental" → "Migration" if that's the only experimental setting left); planner finalizes after surveying SettingsTab structure post-deletion.
- **`useNestedEditor` UI deletion ordering.** When toggle disappears, any user with settings panel open at moment of plugin reload sees a missing toggle. Acceptable. Recommendation: deletion in sub-step E lands together with field deletion in `SettingsStore.ts`.
- **Vim-Tab fix discovery via probe vs. spike.** Could grow to `/gsd-spike` if past 30 min. Recommendation: time-box at 30 min; if no definitive answer, defer to v1.3.x backlog.
- **THEME-05 baseline regeneration.** v1.2 baseline screenshots not in repo. Recommendation: at start of Plan 22-03, capture v1.2 baseline by `git stash` + `git checkout <v1.2 ship commit>` + screenshot in dev vault + `git stash pop`. The 5 baseline screenshots become inline assets in `22-VERIFICATION.md`.
- **Plugin-store re-review submission.** community-plugins.json entry exists from v1.0; v1.3 is a version-bump-trigger re-review (no new PR needed unless entry's `repo`/`name` changed).
- **`tests/main/` directory after deletion.** After 8 dead-test deletions, may have surviving files. Recommendation: verify `tests/main/` non-empty post-deletion; if empty, remove directory; planner finalizes by survey at sub-step D.
- **Lockfile / package.json cleanup.** No new dependencies needed. Verify no v1.2-only deps can be dropped. Recommendation: `npm ls` survey at end of sub-step E.

### Deferred Ideas (OUT OF SCOPE)

- Automated visual-diff harness for THEME-05 — v1.4+ infra.
- Migration infrastructure deletion — v1.4+ candidate after sunset window. Phase 22 keeps everything per L2.
- `useNestedEditor` active migration code — read-and-ignore is sufficient.
- Vim-Tab cursor-marker fix backlog — if D-polish-01 probe fails, defer to v1.3.x with tracked GitHub issue.
- Bundle gzipped ceiling — Phase 22 caps raw only.
- v1.4+ multi-pane live/mirror (MULTI-01/02), static palette (PALETTE-01), triple-backtick bracket pair (BRACKET-01).
- VIM-03 reload-on-toggle banner — NOT shipped per L7. Mark as "Resolved by Phase 20 live-reconfigure" in REQUIREMENTS.md traceability.
- Plugin-store auto-rejection escape hatch — if re-review surfaces a blocker (e.g., hidden `innerHTML` eslint missed), Plan 22-03 fixes inline; if non-trivial, mini-phase 22.1 handles.

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` directives that the planner MUST honor — these have the same authority as locked decisions:

| Directive | Source | How Phase 22 honors it |
|-----------|--------|------------------------|
| **No `innerHTML` in plugin code** | CLAUDE.md "Community Plugin Store Requirements" + ESLint rule | D-gate-02 verifies `grep -r 'innerHTML' src/widget/` returns zero. The eslint clean run is the enforcement mechanism. |
| **`requestUrl` for all LeetCode HTTP calls (never `fetch()` / `axios`)** | CLAUDE.md tech stack | Not touched in Phase 22 (no new network calls); `npm run check:lc-isolation` passes as part of CI. |
| **`vault.process` (atomic) — NEVER `vault.modify`** | CLAUDE.md "What NOT to Use" | Existing `scripts/grep-no-vault-modify.sh` enforces. Phase 22 makes no new vault writes. |
| **`'leetcode.*'` userEvent convention is the bypass for plugin-internal CM6 dispatches** | CLAUDE.md `## Conventions` (line 195) | **DELETED IN PHASE 22.** PROTECT-03 + DELETE-08 retire the convention; D-unwire-02 strips all annotations; D-claude-01 removes the paragraph. |
| **Canonical plugin write-path pattern (Phase 17 D-05) — child→parent dispatch with `addToHistory.of(false)`** | CLAUDE.md `## Conventions` (line 197) | **DELETED IN PHASE 22.** D-claude-01 removes the paragraph because the underlying mechanism (`childEditorRegistry`, `childEditorSync`) deletes in 22-01 sub-step C. |
| **Use `this.app` not global `app`** | CLAUDE.md community-plugin requirements | Already enforced by `eslint-plugin-obsidianmd@0.3.0`; Phase 22 maintains. |
| **GSD workflow enforcement** | CLAUDE.md `## GSD Workflow Enforcement` | Phase 22 work flows through `/gsd-execute-phase`. |

`./CLAUDE.md` documents the v1.3 stack (TypeScript 5.8.3 / esbuild 0.28.0 / obsidian@latest / `@replit/codemirror-vim@6.3.0` / `turndown@7.2.4` / vitest@4.1.5). **No new runtime dependencies in Phase 22.** Lockfile cleanup may drop deps that only the v1.2 path used (Discretion item: `npm ls` survey at end of sub-step E).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DELETE-01** | `src/main/childEditorSync.ts` (809 LOC) deleted | Verified extant: `wc -l` = 809 LOC. Imports in `src/main/childEditorRegistry.ts:7` (`unwireSync`), `src/main/nestedEditorExtension.ts:40` (`wireSyncIfNeeded`, `detectAndPropagateExternalChange`), `src/main/childEditorFactory.ts:51` (`createScrollIntoViewExtension`). All three importers also delete (DELETE-03/04 + childEditorFactory drops imports). |
| **DELETE-02** | `src/main/sectionLockExtension.ts` (527 LOC) deleted | Verified extant: 527 LOC. Imported only by `src/main.ts` (registration) and `tests/integration/sectionLockIntegration.test.ts:48` (DELETE: must remove or update test). `tests/main/sectionProtectionExtension.test.ts:1` references it in a comment — fork header is fine. |
| **DELETE-03** | `src/main/nestedEditorExtension.ts` (395 LOC) deleted | Verified extant: 395 LOC. Imported only by `src/main.ts:173` (`buildNestedEditorExtension`, `nestedEditorRebuildEffect`). |
| **DELETE-04** | `src/main/childEditorRegistry.ts` (114 LOC) deleted | Verified extant: 114 LOC. Imported by `src/main.ts:172`, `src/main/nestedEditorExtension.ts:38`, `src/main/childEditorSync.ts:26`, `tests/main/lifecycle.test.ts:31`. lifecycle test must delete or update. |
| **DELETE-05** | `src/main/codeActionsEditorExtension.ts` (401 LOC) deleted | Verified extant: 401 LOC. `findCodeFence` already lifted to `src/widget/fenceLocator.ts` (per Phase 19 carry-over and `tests/widget/fenceLocator.test.ts:3` comment "Verifies findCodeFence (lifted from codeActionsEditorExtension.ts:177-212)"). The deleted file's only remaining responsibility (the v1.2 edit-mode block widget) is already replaced by `src/widget/widgetActions.ts`. |
| **DELETE-06** | `src/main.ts` ~800 LOC v1.2 unwiring | Phase 19+20+21 wiring grew main.ts to 4,688 LOC. The 33+ `useInlineWidget` mention sites mapped per "Specific Findings §3"; the ~10 `'leetcode.*'` userEvent annotation sites mapped per "Specific Findings §4". |
| **DELETE-07** | 8 dead test files | Verified all 8 extant in `tests/main/`. List in Specific Findings §5. |
| **DELETE-08** | CLAUDE.md `## Conventions` paragraphs removed | Verified: paragraph 1 at `CLAUDE.md:195` (`'leetcode.*'` userEvent), paragraph 2 at `CLAUDE.md:197` (Canonical plugin write-path). Both are entire section content — see Specific Findings §6. |
| **POLISH-01** | Default = v1.3 widget on first 1.3.x release | Bind to D-cutover-01 sub-step A; flip `SettingsStore.ts:287` `useInlineWidget: false` → `true`. |
| **POLISH-02** | Bundle size reduces from ~1.71 MB; CI gate flags regression | Existing `scripts/check-bundle-size.mjs` already shipped. Current `HARD_LIMIT = 1_800_000`. Phase 22 D-gate-01 lowers HARD to `1_706_000` (v1.2 baseline). |
| **POLISH-03** | `eslint-plugin-obsidianmd` clean; zero `innerHTML` in `src/widget/` | Verified empirically: `grep -rn innerHTML src/widget/` returns ONLY comments + a doc-comment string in `WidgetController.ts:781-782`. **No active `innerHTML` assignments in `src/widget/`.** D-gate-02 baseline is already passing. |
| **POLISH-04** | README updated for v1.3 | D-readme-01 itemizes (a)–(e). Plan 22-03 owns. |
| **POLISH-05** | All v1.2 tests pass (excluding 8 dead-test deletions); new widget code has unit + integration coverage | Phase 21.1 baseline: 3,106 pass / 1 pre-existing fail. After 8 deletions, expect ≤ 3,106 minus dead-test count; widget tests already in tree (44 files in `tests/widget/`). |
| **POLISH-06** | BRAT alpha + plugin-store re-review readiness | D-gate-04 sequence; 7-day dogfood. |
| **PROTECT-03** | `'leetcode.*'` userEvent convention removed from extension + CLAUDE.md | Already removed from `src/main/sectionProtectionExtension.ts` extension behavior in Phase 20 (verified — extension does NOT filter on userEvent post-fork; see Specific Findings §7). Phase 22 strips the dispatch-side annotations + the CLAUDE.md paragraphs. |
| **VIM-03** | Reload-on-toggle banner only if Phase 20 live-reconfigure failed | **Resolved by Phase 20** per CONTEXT L7 — no banner ships in Phase 22. Mark as no-op in REQUIREMENTS.md traceability. |
| **THEME-05** | Manual theme regression check (5 themes) | D-gate-03; manual checklist; v1.2 baseline regen via `git checkout <v1.2 ship commit>`. v1.2 ship commit = `2411f8e docs: changelog entry for 1.2.0-alpha.4` (see Specific Findings §2). |

## Specific Findings

The following are the empirically verified answers to the 14 research questions in the additional context. Each finding cites the exact line numbers and grep results so the planner can reference them in tasks without re-running the searches.

### §1 — D-cutover-02 mutual-exclusion inversion (Q1 verified)

**Verified extant** at `src/main.ts:1128-1144`:

```typescript
// Phase 19 vq4 — read once: the nested-editor toggle is reload-apply-only.
let useNestedEditor = this.settings.getUseNestedEditor();
// Phase 19 Plan 01 — read the v1.3 inline-widget master toggle (CONTEXT D-05).
const useInlineWidget = this.settings.getUseInlineWidget();

// Phase 19 D-06 mutual-exclusion assert ...
if (useInlineWidget && useNestedEditor) {
  // eslint-disable-next-line obsidianmd/ui/sentence-case ...
  new Notice('useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)', 5000);
  await this.settings.setUseNestedEditor(false);
  useNestedEditor = false;
}
```

**Phase 22 sub-step A inversion shape** (lands in the same commit as the default flip):

```typescript
// CONTEXT.md exact line 1139 reference; this line stays at ~1139 post-flip.
// Inverted predicate: 1.2.x carry-over data.json has useInlineWidget=false AND
// useNestedEditor=true → force useInlineWidget=true and emit Notice.
if (!useInlineWidget && useNestedEditor) {
  new Notice('v1.2 nested-editor path retired in 1.3.0 — using v1.3 widget', 5000);
  await this.settings.setUseInlineWidget(true);
  // useNestedEditor reads continue to return true here, but the v1.2
  // registration block (lines 1151-1153) deletes in sub-step E so this is
  // a no-op write; setting forces persistence so next reload reads correctly.
}
```

**After sub-step E deletes `useNestedEditor` entirely**, the entire 4-line inversion block also deletes — only the `useInlineWidget` read remains until that too dies. The Notice path is short-lived (one boot cycle for users upgrading from 1.2.x → 1.3.0).

**Why it's not a no-op**: `data.json` written by 1.2.x persists `{useInlineWidget: false, useNestedEditor: true}`. The default flip in DEFAULT_DATA only kicks in for fresh installs (`loadFromRaw` falls through to `DEFAULT_DATA.useInlineWidget` only when the field is missing/non-boolean — `SettingsStore.ts:715-720` confirmed). 1.2.x users explicitly persisted `false`. The inversion is the only reason their upgrade lands on the v1.3 path.

### §2 — `useInlineWidget` reference enumeration (Q2 verified — 33+ confirmed)

`grep -rn useInlineWidget src/` (TypeScript only) returned **76 hits across 16 files**. Mapped by treatment in sub-step E:

| File | Hit count | Treatment |
|------|-----------|-----------|
| `src/main.ts` | 26 | Delete all `if (useInlineWidget)` gates → unconditional v1.3 branch. Delete all `if (!useInlineWidget)` branches. Delete the `getUseInlineWidget()` read at line 1130. Delete the inversion-Notice path. Delete every `// useInlineWidget=ON` comment. |
| `src/settings/SettingsTab.ts` | 4 | Delete the toggle UI block (lines 278–305). |
| `src/settings/SettingsStore.ts` | 12 | Delete `useInlineWidget` field from `LeetCodeSettings` interface (line 86); delete from `DEFAULT_DATA` (line 287); delete from `loadFromRaw` (lines 715–720); delete `getUseInlineWidget` (line 913) + `setUseInlineWidget` (line 919). |
| `src/solve/codeExtractor.ts` | 1 | Comment at line 32 — rewrite or delete; the dual-path branch in `extractFirstFencedBlock` becomes single-path (Phase 21 D-extract-01 transitional dual-path collapses). |
| `src/solve/starterCodeInjector.ts` | 1 | Comment at line 273 — delete; the legacy fence emission path becomes unreachable. The `getUseInlineWidget?(): boolean` arg in the `SettingsHost` interface (line ~284) becomes redundant; the ternary `settings.getUseInlineWidget?.() === true ? 'leetcode-solve' : 'legacy'` collapses to `'leetcode-solve'`. |
| `src/widget/liveModeBannerStateField.ts` | 2 | Comment at line 288; gate at line ~276 (`getUseInlineWidget?.() !== false`) becomes unconditional `true` (or simply remove gate). |
| `src/widget/migrationBackupGc.ts` | 2 | Comment-only references to L9 (Phase 21) — keep file in tree per CONTEXT L2; rewrite comments to drop `useInlineWidget` reference. |
| `src/widget/fenceMigrator.ts` | 2 | Comment at lines 94–95 ("does NOT inspect useInlineWidget — caller's responsibility"); rewrite to drop reference. |
| `src/widget/themeListener.ts` | 2 | Comments at lines 40, 65 — rewrite. |
| `src/widget/multiPaneCoordinator.ts` | 2 | Comments at lines 51, 193 — rewrite. |
| `src/widget/codeBlockProcessor.ts` | 3 | Comments at lines 67, 180, 198 — rewrite. |
| `src/widget/WidgetController.ts` | 4 | Comments at lines 21 (also `useNestedEditor`), 139, 741, 1365 — rewrite. |
| `src/notes/NoteTemplate.ts` | 4 | Lines 128, 216 (comments); line 237 `useInlineWidget?: boolean` field on `BuildNoteBodyInput`; line 241 ternary `input.useInlineWidget ? codeBlockForV13(...) : codeBlockFor(...)`. **Action**: delete the `useInlineWidget?` arg + ternary — `codeBlockForV13` becomes the only emitter (or rename to `codeBlockFor` and delete the legacy emitter; CONTEXT D-emit-01 of Phase 21 spec'd this). |
| `src/notes/NoteWriter.ts` | 16 | Lines 186, 350, 366 (comments); 370–374 (`useInlineWidgetOverride` arg + reading); 397, 404 (WR-05 caching at openProblem top); 428–430 (passing through); 501–502; 525–535 (BuildNoteBodyInput pass-through); 582–597 (the `if (!useInlineWidget)` retrofit guard); 629–632 (post-write rerender gate). **Action**: simplify aggressively — `useInlineWidget` becomes always-true so every `if (useInlineWidget)` body becomes unconditional, every `if (!useInlineWidget)` body deletes (the `retrofitStarterCode` legacy-emit retrofit at line 596–597 dies entirely; Phase 21 plan 21-13 already gated this on `useInlineWidget=ON`). |
| `src/contest/ContestFinalizer.ts` | 2 | Lines 308, 315 — drop `useInlineWidget: settings.getUseInlineWidget?.() ?? false` from the call site arg. |
| `src/main/readingModeLegacyBannerPostProcessor.ts` | 2 | Lines 88, 92 — comments; the post-processor itself stays in tree (PHASE_22_DELETE_WITH_V1_2_PATH marker per Phase 21). **Wait**: this file is part of migration infrastructure (banner for `autoMigrateOnOpen=OFF`); CONTEXT L2 says migration infrastructure stays. Verify — see Specific Findings §13. |
| `src/main/readingModeMigrationHook.ts` | 1 | Line 124 — comment about the master gate; rewrite. |

**Confirmation of CONTEXT's "33+" claim**: 76 raw hits, ~26 in main.ts alone. The "33+" is a conservative undercount; the planner should expect closer to 60-70 sites once comments are counted, or ~30 functional gates if comments-only sites are tallied separately.

**The `getUseInlineWidget?.()` call sites** (the optional-chaining shape used by `SettingsHost` consumers like `starterCodeInjector` and `ContestFinalizer`) are interface-bound — deleting `getUseInlineWidget` from `SettingsStore.ts` requires either (a) removing the optional method from each consumer's `SettingsHost` interface, or (b) leaving the optional method in the interface (callers fall through to `undefined` → false branch → unreachable). Option (a) is cleaner; Option (b) is a paper saving with no downside since Phase 22 deletes the consumer branch anyway. Recommendation: option (a) — the planner should propagate the deletion through all `SettingsHost` interfaces.

### §3 — `'leetcode.*'` userEvent annotation enumeration (Q3 verified — 4 active dispatch sites)

`grep -rn "userEvent: 'leetcode\\." src/` returned exactly **4 active `cm.dispatch` annotation sites**, all in `src/main.ts`:

| Line | Verb | Context |
|------|------|---------|
| `src/main.ts:3395` | `'leetcode.lang-switch'` | `switchFenceLanguage` parent-CM6 dispatch |
| `src/main.ts:3905` | `'leetcode.lang-switch'` | `dispatchChildLanguageReconfigure` child-CM6 dispatch |
| `src/main.ts:3963` | `'leetcode.lang-switch'` | Second child-CM6 dispatch site |
| `src/main.ts:4546` | `'leetcode.reset.child'` | Reset child dispatch (Phase 17 D-03) |

**Plus 2 documentation references** (no actual dispatches):
- `src/widget/childParentSync.ts:15` — comment block describing the sync convention; rewrite without the userEvent reference.
- `src/solve/resetCodeWithConfirm.ts:114` — comment about the convention; rewrite.

**Plus 1 string match in retired extension**:
- `src/main/sectionLockExtension.ts:28` — comment in a file that deletes (DELETE-02). No work needed.

**Plus 1 string match in surviving extension**:
- `src/main/sectionProtectionExtension.ts:25` — comment in the v1.3 extension. **CRITICAL**: verify the extension's runtime behavior does not actually filter on userEvent — see §7 below.

**Verification that v1.3 `sectionProtectionExtension` does NOT filter on userEvent (CONTEXT D-unwire-02 claim)**: confirmed in §7 below. Stripping the annotations is functionally a no-op; CONTEXT D-unwire-02 is correct that the annotations are dead weight.

**Atomic-commit shape per CONTEXT D-unwire-01**: in a single commit, strip:
1. Object property `userEvent: 'leetcode.lang-switch',` at lines 3395, 3905, 3963 (delete the property; the surrounding `cm.dispatch({...})` call still has its `changes` and `selection` keys, so the comma is the only adjacent punctuation to delete).
2. Object property `userEvent: 'leetcode.reset.child',` at line 4546 — but this entire `dispatch` call is inside the `childEditorRegistry?.get(file.path)` lookup branch (line 4528) which deletes when `childEditorRegistry` deletes (DELETE-04). So the annotation strip here is moot — the branch dies wholesale.
3. The 2 doc comments in `childParentSync.ts` and `resetCodeWithConfirm.ts`.
4. The doc comment in `sectionProtectionExtension.ts:25`.
5. The "CLAUDE.md §Conventions ('leetcode.*' bypass convention)" reference comment at `src/main.ts:3384` and similar prose comments throughout the lang-switch helpers.

### §4 — Vim-Tab cursor-marker probe target (Q4 verified)

**Tab handler shape** at `src/widget/WidgetController.ts:1071-1095`:

```typescript
keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      const cm5 = getCM(view);                                   // CM5 adapter
      if (cm5 && !cm5.state.vim?.insertMode) return false;       // Vim non-insert: fall through
      const sel = view.state.selection.main;
      const target = view as unknown as Parameters<typeof insertTab>[0];
      if (!sel.empty) return indentMore(target);                  // Selection: indent
      return insertTab(target);                                   // Empty selection: insert tab
    },
  },
  // Shift-Tab handler is the inverse with indentLess
]),
```

**`@replit/codemirror-vim@6.3.0` exports** (verified `node_modules/@replit/codemirror-vim/dist/index.d.ts`):

```typescript
declare function initVim(CM: typeof CodeMirror): {
  enterVimMode: (cm: CodeMirror) => void;
  leaveVimMode: (cm: CodeMirror) => void;
  resetVimGlobalState_: () => void;
  getVimGlobalState_: () => { ... };
  maybeInitVimState_: (cm: CodeMirror) => vimState;
  handleKey: (cm: CodeMirror, key: string, origin: string) => undefined | boolean;
  // ... (no `execCommand` exposed at the top level)
};
export type Vim = ReturnType<typeof initVim>;
```

The `Vim` object exports `handleKey(cm, key, origin)`. Source observation in `node_modules/@replit/codemirror-vim/dist/index.cjs:922`:

```typescript
handleKey: function (cm, key, origin) {
  // ... (line 1023) function handleKeyInsertMode() { ... }
  // ... (line 1057) ? handleKeyInsertMode()
  // ... (line 1058) : handleKeyNonInsertMode();
}
```

**Probe shape (recommended)** for D-polish-01:

```typescript
// Inside the existing Tab handler when cm5?.state.vim?.insertMode is true:
import { Vim, getCM } from '@replit/codemirror-vim';

run: (view) => {
  const cm5 = getCM(view);
  if (cm5 && !cm5.state.vim?.insertMode) return false;
  // ... existing selection/empty logic ...
  // PROBE: route Tab through Vim.handleKey so the block-cursor marker tracks
  if (cm5 && cm5.state.vim?.insertMode) {
    const handled = Vim.handleKey(cm5, '<Tab>', 'mapping');
    if (handled === true) return true;  // Vim absorbed it; marker is in sync
    // Fall through to insertTab if Vim refused (returns undefined or false)
  }
  // ... existing insertTab/indentMore ...
}
```

**Alternative probe**: `cm5.execCommand('insertTab')` — `execCommand` is NOT exported on the `Vim` type from the `.d.ts`, but in `index.cjs` the CM5 adapter object has `execCommand` as a runtime method (CM5 compatibility shim). This shape is empirically less reliable than `Vim.handleKey` because it bypasses vim's input pipeline (which is what's needed to update the marker). Recommend `Vim.handleKey('<Tab>', cm5, 'mapping')` as the primary probe.

**Predicted failure mode**: Vim's `handleKey` may return `undefined` (key not in any mapping) for `<Tab>` since vim has no native Tab binding in insert mode. If so, the block-cursor marker is updated by vim's own pre-handler (vim observes the keystroke even when no command exists for it), but the actual indent doesn't happen — so the fix would need to combine `Vim.handleKey('<Tab>', cm5, 'mapping')` for the marker update AND fall through to `insertTab(target)` for the actual indent. This is exactly the 5-LOC change CONTEXT D-polish-01 estimates.

**Time-box justification (30 min)**: the empirical question is whether `Vim.handleKey` updates the marker as a side-effect even when it returns `undefined`. The probe is to set a breakpoint in the Tab handler, observe `cm5.state.vim.lastVisualMode` / `cm5.state.vim.insertMode` and the rendered marker position before and after the call, and dispatch `insertTab` afterward. If the marker tracks, ship the 5-LOC change. If it doesn't, the fix needs deeper investigation into vim's internal CM5 adapter (out of scope per CONTEXT — defer to v1.3.x).

### §5 — D-polish-02 + D-polish-03 CSS surface (Q5 verified)

**Existing rules in `styles.css`** (verified):

| Rule | Line(s) | Phase 22 action |
|------|---------|-----------------|
| `.leetcode-code-actions { display: flex; ... }` | 943–956 | **D-polish-03 inserts `font-family: var(--font-text);` here** (or in the inner descendant rule). |
| `.cm-editor .cm-content > .leetcode-code-actions, .cm-content > .leetcode-code-actions { display: flex !important; ... }` | 961–971 | **D-polish-03 may also add `font-family: var(--font-text) !important;` here** to defeat CM6's monospace `.cm-content` cascade. |
| `.cm-editor .lc-nested-editor { ... }` (transparent outer wrapper) | 1950–1952 | **D-polish-02 target**: add `:hover { border: none; outline: none; }` here, or scope to the inner `.leetcode-widget-codeblock` wrapper at line 1953. |
| `.cm-editor .lc-nested-editor .leetcode-widget-codeblock { ... }` (grey paint inner wrapper) | 1953–1955 | Could also be the hover-border target — depends on which level Obsidian's default `:hover` paints. |
| Cursor-marker scoping rules | 2014–2035 | **MUST NOT BREAK** — D-polish-02 override must be narrower than these. |
| Multi-pane data-pane-state rules | 2134–2153 | Out of scope; not a hover surface. |

**No existing `:hover` rule on `.lc-nested-editor` or `.leetcode-widget-codeblock`** — the hover border is bleeding through from Obsidian's default `.cm-editor:hover` cascade (or a community theme variant). Verified `grep -n ":hover" styles.css` returns 24 hover rules, NONE on the widget container classes.

**Recommended D-polish-02 rule shape** (start with this; refine in dev vault):

```css
/* Phase 22 D-polish-02 — suppress Obsidian's default :hover border bleed
 * on the widget surface. Scoped to the outer transparent wrapper to leave
 * the inner CM6 cursor-marker / focus-ring rules at lines 2014-2035
 * unaffected. */
.cm-editor .lc-nested-editor:hover,
.cm-editor .lc-nested-editor .leetcode-widget-codeblock:hover {
  border: none;
  outline: none;
  /* Do NOT set background-color — that would defeat the grey paint at
   * line 1953-1955 which IS the desired hover-aware visual. */
}
```

**Recommended D-polish-03 rule shape**:

```css
/* Phase 22 D-polish-03 — action row chrome reads as UI, not as code.
 * Override the inherited monospace from .cm-editor / .cm-content. */
.leetcode-code-actions,
.leetcode-code-actions * {
  font-family: var(--font-text);
}
```

The descendant selector covers chevron text, button labels, and the language-name display.

**Variable conventions used elsewhere**: confirmed via `grep` — `var(--background-modifier-hover)` (60+ uses), `var(--background-modifier-border)`, `var(--text-muted)`, `var(--interactive-accent)`, `var(--interactive-normal)`, `var(--font-text)`, `var(--font-monospace)`. CONTEXT D-polish-03's `var(--font-text)` is the canonical token.

### §6 — Bundle-size measurement infrastructure (Q6 verified)

**Existing infrastructure**: `scripts/check-bundle-size.mjs` (132 LOC). Current thresholds:

```javascript
const HARD_LIMIT = 1_800_000;      // Phase 17 ceiling-bump for vim addition
const SOFT_WARN = 1_710_000;       // 95% of HARD
const PATH = 'main.js';
```

**Hooked in two places**:
1. `package.json` `scripts.check:bundle-size` → `node scripts/check-bundle-size.mjs`
2. `package.json` `scripts.ci` → chains `lint && test && build && check:bundle-size`
3. `.github/workflows/ci.yml` → `- run: npm run check:bundle-size` after `npm run build`

**v1.2 baseline**: `STATE.md:39` records `1.71 MB raw / 459 KB gzipped`; `STATE.md:65` cites `Post-vim raw 1,707,327 B / gzipped 459,257 B`. Round to `1,706,000` per CONTEXT L3 (slightly lower than the actual 1,707,327, which gives Phase 22 ~1.3 KB of mandatory net-reduction even before deletions land — easily achieved given expected ~−2,400 LOC).

**D-gate-01 implementation** = lower the constants in the existing script:

```javascript
// Phase 22 ceiling bump-DOWN — v1.2 baseline 1,706,000 = 1.71 MB raw.
// Net deletion is ~−2,400 LOC; expected post-Phase-22 ~1.5 MB.
const HARD_LIMIT = 1_706_000;     // FAILS CI on regression past v1.2 baseline.
const SOFT_WARN = 1_500_000;      // ~88% of HARD; bites earlier than 95% so
                                  //  drift is caught while there's headroom.
```

The script's logic (lines 117-131) already exits 1 on `size > HARD_LIMIT` and stderr-WARN on `size > SOFT_WARN` — no code changes needed beyond the two constants.

**Edge case**: `STATE.md:65` notes the actual v1.2 ship was `1,707,327 B`, which is ~1,327 bytes ABOVE `1,706,000`. Phase 22 must net negative bytes to land below the new HARD; the deletions guarantee this (5 files × ~3,000 LOC + ~800 LOC main.ts trimming far exceeds the 1,327-byte cushion). Confirmed safe.

### §7 — `innerHTML` scan (Q7 verified — D-gate-02 baseline already passing)

`grep -rn 'innerHTML' src/widget/` returned **5 hits, all comments**:

| File | Line | Content |
|------|------|---------|
| `src/widget/legacyFenceBanner.ts` | 14 | `// Pattern S-07 — no innerHTML. createEl with text option (XSS-safe);` |
| `src/widget/legacyFenceBanner.ts` | 160 | `*  helpers. NEVER assigns innerHTML. */` |
| `src/widget/codeBlockProcessor.ts` | 20 | `// CLAUDE.md: NO innerHTML — use createEl with text option.` |
| `src/widget/codeBlockProcessor.ts` | 116 | `* paths. Uses createEl + text option per CLAUDE.md no-innerHTML rule.` |
| `src/widget/codeBlockProcessor.ts` | 138 | `// happy-dom path — manual DOM. Still no innerHTML.` |
| `src/widget/conflictDiff.ts` | 17 | `// in `<span class="lc-diff-{kind}">` with `textContent` only (no innerHTML).` |
| `src/widget/WidgetController.ts` | 781 | `*     `innerHTML`. CTA copy is hardcoded "Click to take over" — not user-` |
| `src/widget/WidgetController.ts` | 782 | `*     controlled (CLAUDE.md no-innerHTML rule).` |

**Zero active `innerHTML` assignments in `src/widget/`.** D-gate-02 baseline is already passing as of `git HEAD = 1c0b14e`. The eslint clean run is a passing operation; no conversion work is needed.

**Broader `src/` scan** also clean — every `innerHTML` mention in src/ is either a comment, a doc-string, or in `node_modules`. The widget code, the modal code, the chevron, the action row — all use `createEl` / `createDiv` / `setText` / `appendChild` exclusively.

**Why CONTEXT D-gate-02 still has value**: the eslint plugin (`eslint-plugin-obsidianmd@0.3.0`) catches drift on every PR via `npm run lint`. Phase 22 D-gate-02's value is the codified gate — even if the baseline is already clean, the gate prevents Phase 22 itself from accidentally introducing `innerHTML` during the cutover (e.g., in a CSS comment regen, a banner update, a README escape). Belt-and-suspenders.

### §8 — THEME-05 baseline regeneration (Q8 verified)

**v1.2 ship commit**: there is no canonical `v1.2.0` tag in the repo (`git tag -l` returns only `1.0.0`, `1.0.1`, `1.1.0-alpha.1`, `1.1.0-alpha.2`, `1.2.0-alpha.3`, `1.2.0-alpha.4`). The closest "v1.2 ship" reference is **commit `2411f8e docs: changelog entry for 1.2.0-alpha.4`** (this is what STATE.md "v1.2 shipped 2026-05-26" refers to).

**Recommended baseline-regen procedure** for D-gate-03:

```bash
# At the start of Plan 22-03:
git stash push -m "phase-22-pre-baseline-regen"
git checkout 2411f8e        # v1.2 ship commit
npm ci && npm run build      # rebuild v1.2 main.js
# Symlink or copy main.js into the dev vault's plugin folder
cp main.js manifest.json styles.css "$HOME/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/"
# Reload the dev vault (Cmd-R or Settings → Restart)
# For each of the 5 themes (Minimal / Things / Catppuccin / Anuppuccin / Atom):
#   1. Settings → Appearance → Theme → install + activate
#   2. Open a representative LC note (problem-open from browser, existing solved, AC'd note with AI Review)
#   3. Capture screenshot at consistent zoom (Cmd-0 to reset; window 1200x900)
#   4. Save to .planning/phases/22-v1-2-path-removal-polish/baseline-screenshots/{theme}-{view}.png
git checkout phase-22-branch
git stash pop                 # restore in-progress Phase 22 changes
# Repeat capture against the post-Phase-22 build → comparison-screenshots/
```

**Dev vault location** per `MEMORY.md` (read at session init): `$HOME/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/`.

**Zoom + window-size convention**: not documented in any `.planning/` file. Recommendation: standardize on `Cmd-0` (default zoom) + 1200×900 window (Obsidian default + ~150px wider for action-row breathing room). Document this in `22-VERIFICATION.md` as part of the checklist execution.

**The 5 themes by exact community-plugin-store name** (verified via Obsidian's themes directory at `obsidianmd/obsidian-releases/community-css-themes.json` — author's confirmation expected):
- **Minimal** by `kepano`
- **Things** by `colineckert`
- **Catppuccin** by `catppuccin`
- **Anuppuccin** by `BasicMan-1`
- **Atom** by `kognise`

### §9 — D-gate-04 BRAT release artifacts (Q9 verified)

**Current `manifest.json` state** (verified):

```json
{
  "id": "leetcode",
  "name": "LeetCode",
  "version": "1.0.1",
  "minAppVersion": "1.10.0",
  "description": "Browse, solve, and note LeetCode problems inside your vault.",
  "author": "Mo Xu",
  "authorUrl": "https://github.com/LikeSundayLikeRain",
  "isDesktopOnly": true
}
```

**EMPIRICAL ANOMALY**: `manifest.json` says `"version": "1.0.1"` — this is **STALE** from v1.0.x and was never bumped during v1.1 or v1.2 milestones. `package.json` says `"version": "1.2.0"`. The **release workflow at `.github/workflows/release.yml:39`** auto-patches `manifest.json` from the git tag at release time: `jq --arg v "$TAG" '.version = $v' manifest.json > manifest.tmp && mv manifest.tmp manifest.json`. So shipped v1.0.1, v1.1.0-alpha.x, v1.2.0-alpha.x releases all wrote the correct version into the release-attached `manifest.json` even though the in-tree value never updated.

**Implication for D-manifest-01**: the in-tree `manifest.json` version bump may be a no-op for the release pipeline (the tag drives the manifest version), but the in-tree value should still be set to `1.3.0-beta.1` for consistency with `package.json` and so dev vault installs (which copy manifest.json directly without going through the release workflow) read the correct value. Plan 22-03 should bump BOTH `manifest.json` AND `package.json` to lockstep.

**Description ≤250 char check**: current = `"Browse, solve, and note LeetCode problems inside your vault."` = 60 chars. Well under the 250 limit per Obsidian community-plugin requirements. CLAUDE.md community-plugin requirements ("ends with `.`") satisfied.

**Required release artifacts** per `.github/workflows/release.yml:67-72`:
- `main.js` (mandatory)
- `manifest.json` (mandatory, version-patched from tag)
- `styles.css` (optional — `if [[ -f styles.css ]]; then ASSETS+=(styles.css); fi`)

**Existing release automation**: the release workflow triggers on tags matching `[0-9]+.[0-9]+.[0-9]+*` (the trailing `*` allows pre-release suffixes like `-beta.1`). Auto-detects pre-release via the `-` separator: `if [[ "$TAG" == *-* ]]; then echo "prerelease=true"`. So `1.3.0-beta.1` is auto-flagged as a GitHub pre-release; `1.3.0` is a final release. **Zero workflow changes needed for Phase 22.**

**Tag command sequence**:

```bash
# Plan 22-03 — BRAT alpha tag
git tag -a 1.3.0-beta.1 -m "v1.3.0-beta.1 — BRAT alpha (POLISH-06)"
git push origin 1.3.0-beta.1
# Workflow runs; release artifacts attach automatically

# After 7-day BRAT pass:
git tag -a 1.3.0 -m "v1.3.0 — Inline Widget Architecture (milestone close)"
git push origin 1.3.0
# Plugin-store re-review submission via existing community-plugins.json entry
```

### §10 — D-settings-01 read-and-ignore mechanism (Q10 verified)

**`SettingsStore.ts:loadFromRaw` for `useNestedEditor`** (lines 711-713):

```typescript
useNestedEditor: typeof raw.useNestedEditor === 'boolean'
  ? raw.useNestedEditor
  : DEFAULT_DATA.useNestedEditor,
```

**Verified that there is no `Object.assign(this.data, raw)` over the raw data** — every field in `loadFromRaw` is explicitly mapped (it's a typed transformation, not a spread). Searching `SettingsStore.ts` for `Object.assign` returns no instance over `raw`. Searching for spread `...raw` also returns nothing.

**Mechanism**: when D-settings-01 deletes the `useNestedEditor` field from the type (`LeetCodeSettings`), `DEFAULT_DATA`, the `loadFromRaw` mapper output object, the getter, and the setter:

1. Existing `data.json` files persist with `useNestedEditor: true` (or `false`).
2. On plugin load, `loadFromRaw(raw)` returns an object that **does not contain a `useNestedEditor` key** (because the literal property is deleted from the return-object literal).
3. `this.data` is assigned the return value of `loadFromRaw`. The persisted `useNestedEditor` is now lost from in-memory state.
4. Next `await this.persist()` (which calls `saveData(this.data)`) writes only the keys present in `this.data` — `useNestedEditor` is gone from disk.

**Edge case verification**: `persist()` is at `SettingsStore.ts` (search returned the method). It calls `await this.plugin.saveData(this.data)`. `saveData` writes the in-memory shape verbatim — there is no Obsidian-internal preservation of fields not in the in-memory shape. Confirmed silent disappearance.

**No active migration code is needed.** The read-and-ignore lifecycle is exactly: read existing data.json → drop `useNestedEditor` from in-memory shape → next save writes without the field. CONTEXT D-settings-01 is correct.

### §11 — D-claude-01 + D-claude-02 CLAUDE.md current state (Q11 verified)

**`./CLAUDE.md` `## Conventions` section** (verified — read in init context):

The section contains exactly **two paragraph-bullets**:

1. **Bullet 1** (~`CLAUDE.md:195` per CONTEXT) — `'leetcode.*' userEvent annotation is the bypass convention for plugin-internal CM6 dispatches.` — long paragraph describing the section lock changeFilter, audited callsites, and the `addToHistory.of(false)` pattern. Multiple line spans.

2. **Bullet 2** (~`CLAUDE.md:197` per CONTEXT) — `Canonical plugin write-path pattern (Phase 17 D-05).` — paragraph describing child editor dispatch through `childEditorRegistry`, `createChildSyncExtension`, and the `'leetcode.reset.child'` example. Multiple line spans.

Both paragraphs reference files that delete in Phase 22:
- Bullet 1 references `src/main/sectionLockExtension.ts` (DELETE-02), `src/main/childEditorRegistry` (DELETE-04), `src/main/nestedEditorExtension.ts` (DELETE-03).
- Bullet 2 references `src/main/childEditorSync.ts:82-121` (DELETE-01), `this.childEditorRegistry.get(file.path)` lookup (DELETE-04), `ECHO_PRONE_USER_EVENTS` in `src/main/nestedEditorExtension.ts:265-268` (DELETE-03).

**D-claude-01 deletion shape**: delete both bullets in their entirety (multi-line paragraphs). After deletion the `## Conventions` section is empty. Per CONTEXT D-claude-01: "the section heading itself can be deleted if other conventions exist (currently both paragraphs ARE the section — section heading itself can be deleted if empty)."

**Recommendation**: delete both bullets AND the `## Conventions` heading. The section will not be regenerated by Phase 22 — the surviving conventions (no innerHTML, vault.process discipline, requestUrl, `'leetcode.*'` retired) are documented elsewhere (vault-write rule in CLAUDE.md "What NOT to Use" table; `requestUrl` in tech stack section). No standalone CLAUDE.md `## Conventions` section is needed.

**D-claude-02 — `## Architecture` section currently empty** (verified — section reads "Architecture not yet mapped. Follow existing patterns found in the codebase."). Phase 22 Plan 22-03 final wave fills it. Recommended ~5–10 line shape (CONTEXT specifies content):

```markdown
## Architecture

**v1.3 inline-widget architecture (post-Phase-22).**

The plugin's editing model is a single `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` + `registerEditorExtension(leetCodeFenceViewPlugin)` pair (Reading mode + Live Preview, both calling `mountLeetCodeWidget`). The widget owns its own CM6 EditorView; widget edits flow through `app.vault.process(file, fn)` — the only mutation primitive in the plugin. `lc-language` frontmatter is the single source of truth for Run/Submit/AI dispatch (read via `extractFirstFencedBlock(noteBody, frontmatter)` in `src/solve/codeExtractor.ts`).

`src/main/sectionProtectionExtension.ts` (narrow scope: `## Problem` body + `## Techniques` heading) is the only protection extension. Section locking on the fence opener / closer is moot — the widget owns the fence range via `EditorView.atomicRanges`.

Migration infrastructure (`src/widget/fenceMigrator.ts`, `src/widget/legacyFenceBanner.ts`, `src/widget/migrationBackupGc.ts`, `autoMigrateOnOpen` setting) stays in tree for users upgrading from 1.2.x → 1.3.x late. 30-day backup sidecar at `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/`.
```

### §12 — Validation Architecture for Nyquist (Q12 — see dedicated section below)

See `## Validation Architecture` section.

### §13 — Pitfalls deep-dive (Q13)

**P5 — Default flip is a hard cutover; intermediate state is a bug surface.** PITFALLS.md warns that any intermediate state between v1.2 and v1.3 is a bug surface. Phase 22 D-cutover-01's flip-first-then-delete sequencing addresses this: sub-step A (flip) runs WITH the v1.2 path still alive (sub-steps C/D/E haven't deleted it yet), so a regression on `=ON`-default-fresh-install has the v1.2 path as recoverable fallback (toggle OFF). Sub-step B (1-day dogfood) is the empirical bug-discovery window. After sub-step E completes deletions, the only recovery is `git revert`. **Mitigation**: sub-step B's 1-day dogfood is non-negotiable.

**P13 — Plugin-store re-review trigger on architectural change.** PITFALLS.md item 13 enumerates 12 review checkpoints (network calls, innerHTML, eval, isDesktopOnly, telemetry, processFrontMatter, vault.on('modify') scope, code-block processor registration, migration that touches user files, suppression machinery, codemirror externals, bundle size). **Phase 22 D-gate-04 + D-readme-01 + D-manifest-01 mitigate by**:
- README explains v1.3 architecture (P13 #1, #9 disclosure).
- `eslint-plugin-obsidianmd` clean run (P13 #2 innerHTML, #11 codemirror externals automatic).
- Bundle gate (P13 #12).
- README explains migration + backup location (P13 #9 mitigation).
- The `vault.on('modify')` listener IS scoped (Phase 19 widget code filters via `lc-slug` frontmatter — not a global handler). README disclosure satisfies P13 #7.

**P25 — No `innerHTML` in widget.** PITFALLS.md is unambiguous. **Phase 22 D-gate-02 + the empirical scan in §7 above confirm zero active assignments.** No conversion work needed. The eslint clean run codifies the gate.

### §14 — Codebase post-deletion sanity (Q14)

**Test-file orphan import scan** — `grep` for imports of soon-deleted files in `tests/` outside `tests/main/`:

```
tests/integration/sectionLockIntegration.test.ts:48 — imports from '../../src/main/sectionLockExtension'
tests/main/sectionProtectionExtension.test.ts:1 — comment-only reference (no import)
tests/main/lifecycle.test.ts:31 — imports ChildEditorRegistry from '../../src/main/childEditorRegistry'
```

**Action items for sub-step D / E**:

| Test file | Status | Phase 22 disposition |
|-----------|--------|----------------------|
| `tests/integration/sectionLockIntegration.test.ts` | NOT in CONTEXT's 8-test deletion list | **Must verify**: is this test still meaningful for `sectionProtectionExtension` (the surviving narrow extension)? If yes — port the import to `sectionProtectionExtension`. If no — delete entirely. Likely **delete**: the integration test exercises the old fence-opener protection which is removed. Planner discretion. |
| `tests/main/lifecycle.test.ts` | NOT in CONTEXT's 8-test deletion list | **Must verify**: does the lifecycle test cover only `ChildEditorRegistry` (deletes) or broader plugin lifecycle? If `ChildEditorRegistry`-only, **delete**. If broader, port the import out (to a non-deleted file) and keep. Planner discretion. |
| `tests/main/sectionProtectionExtension.test.ts` | KEEP | Comment-only reference; no functional dependency on `sectionLockExtension.ts`. The fork header reference is descriptive prose. |

**Survivor list in `tests/main/` after the 8 deletions** (CONTEXT D-cutover-01 sub-step D list: `childEditorSync.test.ts`, `childEditorSync.repair.test.ts`, `sectionLockExtension.test.ts`, `nestedEditorExtension.test.ts`, `codeActionsEditorExtension.test.ts`, `childEditorRegistry.test.ts`, `resetCommand.childDispatch.test.ts`, `tabMidLine.test.ts`):

Surviving in `tests/main/`:
- `aiDebugCommand.test.ts` (KEEP — AI debug command lives in `src/main.ts` post-cutover)
- `childEditorFactory.test.ts` (**RISK** — `childEditorFactory.ts` imports `createScrollIntoViewExtension` from `childEditorSync.ts`. The factory file SURVIVES per CONTEXT — Phase 19 C-01 says "repurpose for widget-internal CM6 mount." But `childEditorFactory.ts` lines 50–53 import from `./childEditorLanguage`, `./childEditorSync`, `./childEditorTheme`, `./childEditorSemanticClasses`. If `childEditorSync.ts` deletes, the factory's `createScrollIntoViewExtension` import breaks. **Resolution**: Phase 19/20 already wired `WidgetController.ts` to import from `../main/childEditorLanguage`/`Theme`/`SemanticClasses` directly — but did NOT lift `createScrollIntoViewExtension` out of `childEditorSync`. Either (a) move the small `createScrollIntoViewExtension` helper to a new home (or inline it into `childEditorFactory`), (b) verify `childEditorFactory.ts` itself dies (it's a v1.2-only seam — the v1.3 widget mounts via `WidgetController.buildWidgetExtensions` directly, not via this factory). **Recommendation: verify whether `childEditorFactory.ts` has any v1.3 callers post-Phase-22**; if no, add it to the deletion list as DELETE-01.5.)
- `childEditorLanguage.behavioral.test.ts`, `childEditorLanguage.test.ts` (KEEP — `childEditorLanguage.ts` survives per Phase 19 C-12 — the 8-language pack registry is reused by the widget)
- `childEditorTheme.test.ts` (KEEP — `childEditorTheme.ts` survives per Phase 19 C-13)
- `codeActionsPostProcessor.test.ts` (KEEP — Reading-mode action row v1.3 path uses this; ACTION-06)
- `codeBlockButtonRow.test.ts` (KEEP — reused verbatim by widget action row per Phase 20 D-action-02)
- `fileOpenRetrofit.test.ts` (**VERIFY** — likely tests the `retrofitStarterCode` path that becomes unreachable when `useInlineWidget=ON`. Planner audits.)
- `fmReactivity.test.ts` (KEEP — frontmatter reactivity is a v1.3 surface)
- `inlineWidgetActionGate.test.ts` (KEEP — v1.3 action-row gate)
- `languageChevronWidget.test.ts` (KEEP — chevron survives)
- `mutualExclusion.test.ts` (**DELETE** — mutual-exclusion logic at `src/main.ts:1139` itself dies in sub-step E; the test surface dissolves. Add to deletion list.)
- `python3Highlighter.test.ts` (KEEP — survives)
- `readingModeLegacyBannerPostProcessor.test.ts` (KEEP — banner survives per CONTEXT L2 migration infrastructure stays)
- `readingModeMigrationTrigger.test.ts` (KEEP)
- `resetCommand.test.ts` (KEEP — reset survives; only the `resetCommand.childDispatch.test.ts` exercising the v1.2 child-dispatch path deletes)
- `runFromWidget.test.ts` (KEEP — `*FromWidget` is the v1.3 path)
- `sectionProtectionExtension.test.ts` (KEEP — v1.3 protection extension)
- `switchFenceLanguage.test.ts` (**VERIFY** — does this test exercise the parent-CM6 dispatch path that dies in sub-step E? Phase 22 may need to update or delete.)
- `switchLanguageFromWidget.test.ts` (KEEP — v1.3 path)

**Recommendation for planner**: at start of sub-step D, run a parallel "expand the deletion list" audit:
1. `npm test -- tests/main/` to identify which surviving tests fail compilation post-Phase-22 import deletions.
2. Update or delete each failing test based on whether the test target is a v1.2-only path (delete) or has a v1.3 equivalent (port).
3. Plan to add at minimum: `mutualExclusion.test.ts` to the deletion list (the mutual-exclusion logic dies); audit `childEditorFactory.test.ts`, `fileOpenRetrofit.test.ts`, `switchFenceLanguage.test.ts`.

The 8-test list in CONTEXT D-cutover-01 sub-step D is a **floor**, not a ceiling. Plan 22-01 sub-step D may grow to 10–11 deletions after the audit.

## Standard Stack

### Core (no changes — all already in tree)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` (npm) | `latest` (1.12.3) | Plugin API surface | All v1.3 surfaces remain Phase 19+20+21 deliverables. [VERIFIED: package.json] |
| `@codemirror/view` | `6.38.6` | CM6 widget surface | External; provided by Obsidian host. [VERIFIED: package.json + CLAUDE.md] |
| `@codemirror/state` | `6.5.0` | CM6 transaction core | External; provided by Obsidian host. [VERIFIED: package.json + CLAUDE.md] |
| `@codemirror/commands` | `^6.10.3` | indentMore/indentLess/insertTab + history | Already imported by `WidgetController.ts:1083-1102`. [VERIFIED: package.json + grep] |
| `@replit/codemirror-vim` | `^6.3.0` | `vim()` extension + `getCM` + `Vim.handleKey` | Probe target for D-polish-01. [VERIFIED: node_modules/@replit/codemirror-vim/dist/index.d.ts] |
| `eslint-plugin-obsidianmd` | `^0.3.0` | Plugin-store anti-pattern lint | D-gate-02 enforcement. [VERIFIED: package.json devDependencies] |
| `vitest` | `4.1.5` | Test runner | Phase 21.1 baseline 3,106 tests pass. [VERIFIED: package.json] |
| `esbuild` | `^0.28.0` | Bundler | Already pinned; produces `main.js` for D-gate-01. [VERIFIED: package.json] |

**No new runtime dependencies in Phase 22.**

**Lockfile/`package.json` cleanup discretion** (CONTEXT — Claude's Discretion item): after sub-step E lands, run `npm ls` to verify no transitive-dep no-longer-needed orphans. Candidates to drop if unused after deletions:
- None expected — every CM6 lang pack used by the widget is also used by the deleted v1.2 path; no v1.2-only deps surface from the deletion targets.
- `fs`, `path`, `child_process` (in `dependencies`) are old Node built-in shims of unclear purpose; orthogonal to Phase 22.

**Prescription**: leave `package.json` `dependencies` alone unless `npm ls` surfaces a concrete orphan. The cleanup is opportunistic, not required.

### Supporting (no changes)

All v1.3 widget code (`src/widget/*.ts`) and supporting carry-overs (`src/main/childEditorLanguage.ts`, `childEditorTheme.ts`, `childEditorSemanticClasses.ts`, `codeBlockButtonRow.ts`, `languageChevronWidget.ts`, `codeActionsPostProcessor.ts`) stay in tree. Migration infrastructure (`fenceMigrator.ts`, `legacyFenceBanner.ts`, `migrationBackupGc.ts`, `readingModeMigrationHook.ts`, `readingModeLegacyBannerPostProcessor.ts`) stays per CONTEXT L2.

## Package Legitimacy Audit

**Skipped — Phase 22 installs no new packages.** Per the Package Legitimacy Gate protocol, this section applies only when a phase introduces external dependencies. Phase 22 is pure deletion + CSS overrides + version bump; the existing dependency tree (verified by `npm ls` at Phase 21.1 close, with 3,106 tests green) is unchanged.

If lockfile cleanup (Claude's Discretion item) drops any deps post-cutover, those drops are subtractive and require no slopcheck verification.

## Architecture Patterns

### Established patterns (Phase 22 follows verbatim)

**Atomic commit per concern.** Phase 19/20/21 discipline. Phase 22 follows:
- Sub-step A → 1 commit (`feat(22-01): flip useInlineWidget default to true`).
- Sub-step C → 1 commit (`chore(22-01): delete v1.2 source files (DELETE-01..05)`).
- Sub-step D → 1 commit (`chore(22-01): delete dead v1.2 test files (DELETE-07)`).
- Sub-step E → 1 commit (`chore(22-01): unwire v1.2 path from src/main.ts + retire 'leetcode.*' userEvent convention (DELETE-06, DELETE-08, PROTECT-03)`).
- Polish: 1 commit per polish item (`fix(22-02): vim-Tab cursor-marker sync`, `style(22-02): widget hover border`, `style(22-02): action row font`).
- Release gates: 1 commit per artifact (`chore(22-03): bundle size CI gate (POLISH-02)`, `docs(22-03): README v1.3 architecture (POLISH-04)`, `chore(22-03): bump version to 1.3.0-beta.1`, `chore(22-03): bump version to 1.3.0`).

**Single-file deletions ARE atomic per CONTEXT D-unwire-01.** The TypeScript compiler enforces this — half-unwired `src/main.ts` doesn't compile (every `useInlineWidget=false` branch references either v1.2 or v1.3 code). Sub-step E is one commit because the type system mandates it.

**Read-and-ignore for deprecated settings fields** (new pattern in Phase 22 — D-settings-01). Established here for future deprecations.

### System Architecture Diagram (post-Phase-22)

```
                                  +------------------+
                                  |   data.json      |
                                  |  (vault-private) |
                                  +--------+---------+
                                           | loadFromRaw (drops useNestedEditor silently)
                                           v
                              +----------------------------+
                              |     SettingsStore          |
                              |  (no useInlineWidget;      |
                              |   no useNestedEditor;      |
                              |   no getUseInlineWidget;   |
                              |   no getUseNestedEditor)   |
                              +-------------+--------------+
                                            |
                                            v
+------------+   open    +-----------------------------------+
| LC note    |---------->| Plugin.onload                     |
| (md file)  |           |   - registerMarkdownCodeBlock-    |
|            |           |     Processor('leetcode-solve')   |
|            |           |   - registerEditorExtension(      |
|            |           |       leetCodeFenceViewPlugin)    |
|            |           |   - registerEditorExtension(      |
|            |           |       sectionProtectionExtension) |
|            |           |   - registerLegacyBanner-         |
|            |           |     PostProcessor (autoMigrate=OFF)|
|            |           |   - registerInterval(             |
|            |           |       statePersistence sweep)     |
|            |           |   - migrationBackupGc microtask   |
|            |           |   - widgetRegistry init           |
|            |           |   - selfWriteSuppression init     |
|            |           |   - vault.on('modify')            |
|            |           |     [filters via lc-slug]         |
|            |           +-------------+---------------------+
|            |                         |
|            v   pre-mount migration   |
|  +-------------------------------+   |
|  | fenceMigrator                 |---+
|  |  (autoMigrateOnOpen=ON)       |   |
|  |   write backup sidecar        |   |
|  |   vault.process(rewrite tag)  |   |
|  |   processFrontMatter (lc-lang)|   |
|  +-------------------------------+   |
|                                      v
|                          +-----------+----------------+
|                          |  WidgetController          |
|                          |   (per-fence, per-pane)    |
|                          |   - CM6 EditorView         |
|                          |   - 8 language packs via   |
|                          |     languageCompartment    |
|                          |   - vim via vimCompartment |
|                          |     [Tab handler probe]    |
|                          |   - debouncedWriter        |
|                          |   - widgetActions row      |
|                          +------------+---------------+
|                                       |
|                                       v   on edit (debounced)
|                          +------------+---------------+
|                          |  selfWriteSuppression      |
|                          |   .arm(path, expectedHash) |
|                          +------------+---------------+
|                                       |
|                                       v
|                          +------------+---------------+
|                          |  app.vault.process         |
|                          |   (atomic rewrite of fence |
|                          |    body via rewriteFenceBody)|
|                          +------------+---------------+
|                                       |
|                                       v   modify event
|                          +------------+---------------+
|                          |  vault.on('modify')        |
|                          |   if pendingSelfWrites     |
|                          |     skip                    |
|                          |   else dispatch reload      |
|                          |     (cursor-clamp;          |
|                          |      conflict modal if      |
|                          |      hasPending())          |
|                          +----------------------------+
```

**Removed paths (post-Phase-22)**: `childEditorRegistry`, `childEditorSync`, `nestedEditorExtension`, `codeActionsEditorExtension`, `sectionLockExtension`, `useInlineWidget` master gate, `useNestedEditor` field, `'leetcode.*'` userEvent annotations, `ECHO_PRONE_USER_EVENTS`, `nestedEditorRebuildEffect`, fence-repair hook, all `if (!useInlineWidget)` branches. The diagram above is the entire architecture — there is no parallel v1.2 path.

### Pattern 1: Default-flip-then-delete (D-cutover-01)

**What:** Flip the default ON in commit 1; delete the now-unreachable v1.2 path in commits 3–5. Sandwich a 1-day dev-vault dogfood (commit 2 — verification, no code change) between the flip and the deletion.

**When to use:** Hard architectural cutover where the new path coexists with the old behind a feature flag, the new path has been dogfooded only behind the flag, and post-deletion recovery costs (`git revert`) are higher than pre-deletion recovery (toggle the flag).

**Example commit sequence:**
```bash
# Sub-step A — flip
git commit -m "feat(22-01): flip useInlineWidget default to true"

# Sub-step B — dogfood (verification gate; no commit, but:)
# Run full test suite. Deploy to dev vault. Exercise problem-open, solve,
# run, submit, AI debug, language switch, vim toggle, theme swap. ~24 hours
# wall clock. Document outcome in a temporary 22-DOGFOOD-LOG.md (deleted
# before phase close).

# Sub-step C — delete v1.2 sources
git rm src/main/childEditorSync.ts src/main/sectionLockExtension.ts \
       src/main/nestedEditorExtension.ts src/main/childEditorRegistry.ts \
       src/main/codeActionsEditorExtension.ts
git commit -m "chore(22-01): delete v1.2 source files (DELETE-01..05)"

# Sub-step D — delete dead tests
git rm tests/main/childEditorSync.test.ts \
       tests/main/childEditorSync.repair.test.ts \
       tests/main/sectionLockExtension.test.ts \
       tests/main/nestedEditorExtension.test.ts \
       tests/main/codeActionsEditorExtension.test.ts \
       tests/main/childEditorRegistry.test.ts \
       tests/main/resetCommand.childDispatch.test.ts \
       tests/main/tabMidLine.test.ts
# + extras from §14 audit: mutualExclusion.test.ts, possibly
# childEditorFactory.test.ts / fileOpenRetrofit.test.ts / others
git commit -m "chore(22-01): delete dead v1.2 test files (DELETE-07)"

# Sub-step E — atomic main.ts unwiring + CLAUDE.md strip + userEvent strip
# (Single commit per D-unwire-01 — type system enforces atomicity)
git commit -m "chore(22-01): unwire v1.2 path from src/main.ts + retire 'leetcode.*' userEvent convention (DELETE-06, DELETE-08, PROTECT-03)"
```

### Pattern 2: Read-and-ignore for deprecated settings fields (D-settings-01)

**What:** Drop a deprecated field from the type, default, mapper, and accessors. Persisted data.json files retain the field but it's silently ignored on load and disappears on next save.

**When to use:** Schema-evolution scenarios where forced migration (active rewrite) is heavyweight and silent is acceptable. The default for "user opens settings, saves something" (which immediately drops the field) and "user reads existing notes" (where the field has no semantic meaning) is identical.

**Example:**
```typescript
// BEFORE (Phase 21):
export interface LeetCodeSettings {
  useNestedEditor: boolean;       // <-- DELETE THIS
  useInlineWidget: boolean;       // <-- DELETE THIS (sub-step E)
  autoMigrateOnOpen: boolean;
  // ... (all other fields)
}

const DEFAULT_DATA: LeetCodeSettings = {
  useNestedEditor: true,          // <-- DELETE
  useInlineWidget: false,         // <-- DELETE (after flipping to true in sub-step A first; in sub-step E the field itself dies)
  autoMigrateOnOpen: true,
  // ...
};

function loadFromRaw(raw): LeetCodeSettings {
  return {
    useNestedEditor: typeof raw.useNestedEditor === 'boolean'
      ? raw.useNestedEditor : DEFAULT_DATA.useNestedEditor,    // <-- DELETE
    useInlineWidget: typeof raw.useInlineWidget === 'boolean'
      ? raw.useInlineWidget : DEFAULT_DATA.useInlineWidget,    // <-- DELETE
    autoMigrateOnOpen: typeof raw.autoMigrateOnOpen === 'boolean'
      ? raw.autoMigrateOnOpen : DEFAULT_DATA.autoMigrateOnOpen,
    // ...
  };
}

// AFTER (sub-step E):
export interface LeetCodeSettings {
  // useNestedEditor + useInlineWidget removed
  autoMigrateOnOpen: boolean;
  // ...
}
// loadFromRaw simply doesn't reference raw.useNestedEditor or raw.useInlineWidget
```

**Source:** `src/settings/SettingsStore.ts:79-95` (current types) + `:284-296` (DEFAULT_DATA) + `:711-720` (loadFromRaw).

### Anti-Patterns to Avoid

- **Half-unwired commit (option B from CONTEXT D-unwire-01).** Multiple staged commits to reduce churn. The TypeScript compiler will fail the build between commits because `useInlineWidget=false` branches reference deleted code. Single atomic commit per CONTEXT D-unwire-01 is the only viable shape.
- **Per-note opt-in to v1.3 (already rejected in Phase 19 D-05).** Adds a flag to maintain through Phase 22 anyway. CONTEXT L1 + L9 lock the global default-flip semantic.
- **Active migration code for `useNestedEditor` field** (rejected per CONTEXT D-settings-01). Read-and-ignore is the obsidian-plugin idiom.
- **Hard-requiring the vim-Tab fix** (rejected per CONTEXT D-polish-01). 30-min time-box; defer-on-empirical-failure.
- **Auto-rewriting CSS for backward-compat** (none in scope). Phase 22 polish CSS additions are net-new rules; they don't modify existing rules.
- **Creating a new bundle-size CI workflow** (already exists). D-gate-01 modifies `scripts/check-bundle-size.mjs` constants only.
- **Bundling `obsidian` or `@codemirror/*`** (already external in `esbuild.config.mjs`). No change.

## Don't Hand-Roll

Phase 22 is a deletion phase — most "don't build X" guidance is about NOT introducing new code. The remaining items concern the polish + release work.

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vim Tab cursor-marker sync | Custom CM5 adapter introspection / signal injection | `Vim.handleKey('<Tab>', cm5, 'mapping')` from `@replit/codemirror-vim` | The library already exposes the CM5 input pipeline. Re-implementing vim's marker-tracking is a v1.4 architecture surface. |
| Hover border suppression | New CM6 extension or `EditorView.theme` rule | Plain CSS override on `.lc-nested-editor:hover` in styles.css | The hover border is a CSS cascade artifact, not CM6 state. CSS is the right surface. |
| Action row font | New CM6 theme + Compartment | Plain CSS `font-family: var(--font-text)` on `.leetcode-code-actions` | Same — CSS cascade is the right abstraction. |
| Bundle-size gate | New CI workflow / new tooling | Lower thresholds in existing `scripts/check-bundle-size.mjs` | Infrastructure already shipped + tested. |
| Theme regression detection | Visual-diff harness (Playwright / Pixelmatch / Percy) | Manual side-by-side screenshots in dev vault | Per CONTEXT L4 / "Specific Ideas" — automation is v1.4+ infra investment. Single-author dogfood discipline matches v1.0/v1.1/v1.2. |
| `useNestedEditor` migration | Active rewrite of data.json | Read-and-ignore (D-settings-01) | Zero risk; matches "user owns their data". |
| `'leetcode.*'` annotation strip | Codemod / AST tool | Manual + grep + tsc fast-feedback | One-time strip; codemod is over-engineering. |
| README diff renderer | Custom HTML/MD renderer for "what changed in v1.3" | Plain Markdown sections | Standard Obsidian community-plugin discipline. |
| Plugin-store re-review submission | Custom GitHub Actions workflow | Manual gh release create + community-plugins.json version bump | The release workflow already auto-uploads main.js + manifest.json + styles.css per `release.yml:67-72`. The community-plugins.json entry IS the registration; version bump in the existing entry triggers re-review. |
| BRAT alpha auto-tagging | New release-channel workflow | `git tag 1.3.0-beta.1 && git push origin 1.3.0-beta.1` | Existing release workflow auto-flags pre-release on `-` separator (verified release.yml:32-37). |

**Key insight**: every Phase 22 polish + release gate has existing infrastructure that just needs invocation, not authoring. The phase's value is the cutover ceremony itself, not new tooling.

## Runtime State Inventory

> Phase 22 is a refactor + deletion phase. Even though no string-rename is involved, the runtime-state inventory discipline applies — there are runtime systems that have v1.2 state cached/registered/persisted that don't auto-clear from a code rename or file deletion.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `data.json` files in user vaults persist `useNestedEditor: true/false` AND `useInlineWidget: false`. Migration backups under `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/` (already on disk for any 1.3.0-beta user who opens a 1.2.x note). | **`useNestedEditor` / `useInlineWidget` fields**: read-and-ignore via D-settings-01 (passive deletion on next save). **Migration backups**: untouched — kept for 30-day TTL per CONTEXT L2 + Phase 21 D-backup-03. **Per-path attempt-once Sets** (`migrateAttempted`, `repairAttempted`, `codeBlockProcessorMigrateAttempted` per Phase 21.1) are in-memory only; cleared on plugin reload — no persistence concerns. |
| **Live service config** | None. The plugin does not register OS services or external service workflows. | None — verified by grep for `WorkspaceLeaf.setView`, `Workspace.setLayoutChanged`, OS hooks. |
| **OS-registered state** | None. The plugin runs entirely inside Obsidian's renderer process; no OS-level registrations (no daemons, no Task Scheduler, no launchd, no systemd). | None — verified. |
| **Secrets and env vars** | None for Phase 22 itself. Pre-existing: `LEETCODE_SESSION` cookie + AI provider keys live in plugin data (`data.json`). No env var or secret reference is being renamed. | None — Phase 22 doesn't touch the auth/AI surfaces. |
| **Build artifacts / installed packages** | (a) Compiled `main.js` in user vaults — needs reload after plugin update (PITFALLS P25). (b) `node_modules/` deps unchanged. (c) BRAT-installed plugin in tester vaults — receives the new `main.js` automatically when `1.3.0-beta.1` ships. (d) Plugin-store-installed plugins receive `1.3.0` after Obsidian community-plugin store re-review approves. | (a) README POLISH-04 documents "reload your open notes" advice. (b) No work — `npm ci` rebuilds clean. (c) BRAT auto-update is the mechanism (D-gate-04). (d) Plugin-store re-review is the mechanism (D-gate-04). |

**The canonical question**: *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* Phase 22 answer: **only `data.json` carrying `useNestedEditor` and `useInlineWidget=false` from 1.2.x users**. The read-and-ignore mechanism (D-settings-01) handles both. The mutual-exclusion inversion (D-cutover-02) handles the upgrade path. No other runtime state surfaces from this audit.

## Common Pitfalls

### Pitfall 1: Half-deleted main.ts breaks tsc between commits
**What goes wrong:** Splitting D-unwire-01 into multiple commits (option B per CONTEXT) leaves `useInlineWidget=false` branches referencing deleted `nestedEditorExtension` / `childEditorSync` / `childEditorRegistry` / `codeActionsEditorExtension` modules. `tsc` fails. Each intermediate commit is "broken on purpose" which is useless for `gsd-undo` granularity.
**Why it happens:** Phase 22 has 33+ `useInlineWidget` references and 4 active dispatch annotation sites; the temptation to commit "deleted nestedEditor first, then unwired main.ts" is real. But the tree must compile after each commit — that's the GSD/CI invariant.
**How to avoid:** CONTEXT D-unwire-01 mandates a single atomic commit. Plan 22-01 sub-step E is one task that produces one commit. Run `npm run build` after each substantive deletion within the working state (no commit between) to catch broken references; commit only when full suite + tsc clean.
**Warning signs:** Plan task lists for sub-step E that have multiple commit verbs ("delete X then unwire Y").

### Pitfall 2: Sub-step A flip without inversion = broken upgrade
**What goes wrong:** A user upgrading from 1.2.0-alpha.4 has `data.json: {"useInlineWidget": false, "useNestedEditor": true}`. Plan 22-01 sub-step A flips DEFAULT_DATA to `useInlineWidget: true` — but their persisted `false` overrides the default (per `loadFromRaw` lines 718-720). Without the D-cutover-02 inversion at line 1139, their boot still tries to register the v1.2 extensions (`buildNestedEditorExtension`, `buildSectionLockExtension`) which **STILL EXIST** in tree at sub-step A (deletions land in sub-steps C/D/E). v1.2 path runs against the post-flip state — confusion follows.
**Why it happens:** "Flip the default" feels complete; the inversion is easy to miss as "an unrelated detail."
**How to avoid:** Sub-step A is TWO changes in one commit: (a) DEFAULT_DATA flip, (b) inversion of the mutual-exclusion logic at `src/main.ts:1139` per Specific Findings §1. Plan 22-01 sub-step A task list MUST mention both.
**Warning signs:** Sub-step A task description that says only "flip useInlineWidget default" without naming line 1139.

### Pitfall 3: Sub-step B dogfood skipped for a green test suite
**What goes wrong:** The test suite passes after sub-step A, the team is eager to ship. Sub-step B's 1-day dogfood is skipped. A regression that surfaces only against `=ON`-default-fresh-install (not the dogfooded `=OFF`-then-toggled-ON) lands in sub-steps C/D/E. After sub-step C deletes v1.2 sources, recovery is `git revert`.
**Why it happens:** Tests don't exercise the `data.json` shape of an actual 1.2.x user upgrading. Phase 21.1 R6 was exactly this class of bug (fresh-create vs existing-note open had different runtime characteristics).
**How to avoid:** Sub-step B is non-negotiable per CONTEXT D-cutover-01. The dogfood checklist must include: problem-open from browser (R6 surface), solve, run, submit, AI debug, language switch, vim toggle, theme swap. Document outcome in a transient `22-DOGFOOD-LOG.md` (deleted before phase close).
**Warning signs:** Plan 22-01 task list that goes A → C without an explicit B verification gate.

### Pitfall 4: Vim-Tab probe expanded into a spike
**What goes wrong:** The 30-min D-polish-01 probe finds that `Vim.handleKey('<Tab>', cm5, 'mapping')` updates the marker but doesn't dispatch the indent. The "fix" expands into investigating vim's CM5 adapter internals; 30 min becomes 4 hours. Phase 22 stalls on a cosmetic.
**Why it happens:** Once a probe surfaces a partial-fix, the natural urge is to complete it. CONTEXT D-polish-01 explicitly rejects this: time-box, defer-on-empirical-failure.
**How to avoid:** Plan 22-02 task for D-polish-01 enforces the 30-min wall clock. If no definitive answer, document outcome in `22-VERIFICATION.md`, file a `vim-tab-cursor-marker-sync` GitHub issue, add to v1.3.x backlog, proceed to D-polish-02.
**Warning signs:** Task notes that grow past 30 min without a definitive ship-or-defer decision.

### Pitfall 5: Bundle gate lowered without verifying current bundle fits
**What goes wrong:** D-gate-01 lowers `HARD_LIMIT` to `1_706_000` in `check-bundle-size.mjs`. But Phase 22 deletions haven't fully landed yet (or the deletion order differs from expected). CI fails because the new ceiling is below current bundle size.
**Why it happens:** The gate is set as part of Plan 22-03 (release gates) but Plan 22-01 may be in-progress in a parallel branch.
**How to avoid:** Plan 22-03 D-gate-01 task ordering is: (a) merge or rebase Plan 22-01 onto current branch first, (b) `npm run build && wc -c main.js` to verify post-deletion size, (c) THEN lower the constants. If the post-deletion bundle still exceeds 1,706,000, audit what didn't get deleted (likely orphan import or zombie code path).
**Warning signs:** D-gate-01 task running before Plan 22-01 sub-step E lands.

### Pitfall 6: Manifest version bumped in tree but release tag mismatches
**What goes wrong:** Plan 22-03 bumps `manifest.json` to `1.3.0-beta.1` in tree, then tags `1.3.0-beta.1` and pushes. The release workflow at `release.yml:46-49` auto-patches `manifest.json` from the tag — which is the same value, so this is a no-op. But if the tag and the in-tree version diverge (e.g., dev bumped to `1.3.0` but tagged `1.3.0-beta.1`), the release-attached `manifest.json` carries the tag value (`1.3.0-beta.1`) which BRAT consumers see — fine; the in-tree value (which dev-vault installs read directly) shows `1.3.0` — confused dev vaults.
**Why it happens:** `manifest.json` HEAD currently says `1.0.1` (Specific Findings §9 anomaly). The release workflow has been masking this for 3 milestones via auto-patch.
**How to avoid:** Plan 22-03 bump task = bump in-tree to MATCH the tag exactly (`1.3.0-beta.1`, then `1.3.0`). Bump `package.json` in lockstep. The auto-patch becomes a no-op for in-tree consistency.
**Warning signs:** A task description that bumps only `package.json` or only `manifest.json`.

## Code Examples

### Sub-step A flip + inversion (single commit)

```typescript
// src/settings/SettingsStore.ts:287
// BEFORE
useInlineWidget: false,
// AFTER (Phase 22-01 sub-step A)
useInlineWidget: true,

// src/main.ts:1139 (mutual-exclusion logic)
// BEFORE
if (useInlineWidget && useNestedEditor) {
  new Notice('useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)', 5000);
  await this.settings.setUseNestedEditor(false);
  useNestedEditor = false;
}
// AFTER (Phase 22-01 sub-step A)
if (!useInlineWidget && useNestedEditor) {
  new Notice('v1.2 nested-editor path retired in 1.3.0 — using v1.3 widget', 5000);
  await this.settings.setUseInlineWidget(true);
  // Mutual-exclusion is no longer about "both ON"; it's about "1.2.x user's
  // persisted false fights the default flip." Force useInlineWidget=true so
  // the subsequent registration block (lines 1151-1165) lands on the v1.3
  // path. After sub-step E deletes useNestedEditor entirely, this whole
  // 4-line block dies.
}
```

### Sub-step E — main.ts atomic unwire (illustrative)

```typescript
// BEFORE (src/main.ts:1146-1193)
if (useNestedEditor) {
  this.registerEditorExtension(buildNestedEditorExtension(this));
}

if (useInlineWidget) {
  this.widgetRegistry = new WidgetRegistry();
  this.selfWriteSuppression = new SelfWriteSuppression();
  this.statePersistence = new StatePersistenceMap();
  // ... (entire v1.3 widget registration block)
  this.registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this));
  registerLegacyBannerPostProcessor(this);
  this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);
}

// AFTER (sub-step E — useInlineWidget gate removed; useNestedEditor branch deleted)
this.widgetRegistry = new WidgetRegistry();
this.selfWriteSuppression = new SelfWriteSuppression();
this.statePersistence = new StatePersistenceMap();
// ... (entire v1.3 widget registration block — unconditional)
this.registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this));
registerLegacyBannerPostProcessor(this);
this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);
```

### Sub-step E — userEvent annotation strip

```typescript
// BEFORE (src/main.ts:3390-3398)
view.editor.cm.dispatch({
  changes: { from: bodyFrom, to: bodyTo, insert: newCodeBlock },
  userEvent: 'leetcode.lang-switch',
});

// AFTER (Phase 22-01 sub-step E)
view.editor.cm.dispatch({
  changes: { from: bodyFrom, to: bodyTo, insert: newCodeBlock },
});
```

Strip the `userEvent: 'leetcode.lang-switch',` line entirely. Surrounding properties stay. Comma cleanup unaffected. Same shape for the other 3 sites (3905, 3963, 4546-as-part-of-deleted-branch).

### D-polish-01 vim-Tab fix (probe-success path)

```typescript
// src/widget/WidgetController.ts:1071-1095 (Tab handler — UPDATED)
import { Vim, getCM, vim } from '@replit/codemirror-vim';

keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      const cm5 = getCM(view);
      if (cm5 && !cm5.state.vim?.insertMode) return false;
      // Phase 22 D-polish-01 — when vim is in Insert mode, route Tab through
      // Vim.handleKey FIRST so the block-cursor marker tracks the indent.
      // handleKey returns undefined when no vim mapping exists for <Tab>
      // (vim has no native Tab binding in insert mode); the side effect of
      // observing the keystroke updates the marker. We fall through to
      // insertTab/indentMore for the actual indent dispatch.
      if (cm5 && cm5.state.vim?.insertMode) {
        Vim.handleKey(cm5, '<Tab>', 'mapping');
        // Don't return — let the existing path handle the indent.
      }
      const sel = view.state.selection.main;
      const target = view as unknown as Parameters<typeof insertTab>[0];
      if (!sel.empty) return indentMore(target);
      return insertTab(target);
    },
  },
  // Shift-Tab: same pattern — call Vim.handleKey('<S-Tab>', cm5, 'mapping')
  // before falling through to indentLess. (Probe both bindings in dev vault.)
]),
```

**Source:** `node_modules/@replit/codemirror-vim/dist/index.d.ts:11` (`handleKey: (cm, key, origin) => undefined | boolean`).

### D-polish-02 + D-polish-03 CSS additions

```css
/* styles.css — append at end of file or in a new "Phase 22 polish" section. */

/* Phase 22 D-polish-02 — suppress Obsidian's default :hover border bleed
 * on the widget surface. Scoped to the outer transparent wrapper to leave
 * the inner CM6 cursor-marker / focus-ring rules at lines 2014-2035
 * unaffected. */
.cm-editor .lc-nested-editor:hover,
.cm-editor .lc-nested-editor .leetcode-widget-codeblock:hover {
  border: none;
  outline: none;
}

/* Phase 22 D-polish-03 — action row chrome reads as UI, not as code. */
.leetcode-code-actions,
.leetcode-code-actions * {
  font-family: var(--font-text);
}
```

### D-gate-01 bundle threshold lower

```javascript
// scripts/check-bundle-size.mjs:113-115
// BEFORE (Phase 17 ceiling for vim addition)
const HARD_LIMIT = 1_800_000;
const SOFT_WARN = 1_710_000;
const PATH = 'main.js';

// AFTER (Phase 22 D-gate-01 — clamp to v1.2 baseline)
// Phase 22 D-gate-01 — v1.2 baseline 1,706,000 bytes is the new HARD ceiling.
// Phase 22 deletes ~−2,400 LOC; expected post-Phase-22 ~1.5 MB raw.
const HARD_LIMIT = 1_706_000;
const SOFT_WARN = 1_500_000;
const PATH = 'main.js';
```

### D-manifest-01 version bump

```json
// manifest.json — bump for BRAT alpha
// BEFORE
{ "version": "1.0.1", ... }
// AFTER (Plan 22-03 BRAT-tag step)
{ "version": "1.3.0-beta.1", ... }
// AFTER (Plan 22-03 GA step)
{ "version": "1.3.0", ... }
```

```json
// package.json — lockstep bump
// BEFORE
{ "version": "1.2.0", ... }
// AFTER (BRAT)
{ "version": "1.3.0-beta.1", ... }
// AFTER (GA)
{ "version": "1.3.0", ... }
```

## State of the Art

Phase 22 ships no new architectural patterns — it's a deletion + checklist phase. The only "state of the art" item is the **discontinuation of the `'leetcode.*'` userEvent bypass convention** documented at CLAUDE.md:195. This convention was load-bearing under the v1.2 dual-CM6 sync model where parent-doc dispatches needed to bypass section-lock filtering; under the v1.3 widget-owns-fence model, no plugin-originated CM6 dispatch lands inside the section-protection range, so the bypass is unnecessary.

| Old Approach (v1.0–v1.2) | Current Approach (v1.3 post-Phase-22) | When Changed | Impact |
|--------------------------|---------------------------------------|--------------|--------|
| `'leetcode.*'` userEvent annotation on plugin CM6 dispatches | Annotations stripped; dispatches go unannotated | Phase 22 sub-step E | The bypass convention is retired; future plugin dispatches that need to interact with section protection must use a different mechanism (none currently needed because the widget owns its content range). |
| `childEditorRegistry` + `childEditorSync` (bidirectional CM6 mirror) | `widgetRegistry` (one-way: widget → vault.process → file → reload) | Phase 19 (introduced); Phase 22 (v1.2 deleted) | Net −2,400 LOC; eliminates the entire fence fragmentation / cmd-Z leak / locked-range dispatch bug class. |
| `sectionLockExtension.ts` (broad: fence opener + closer + body + headings) | `sectionProtectionExtension.ts` (narrow: `## Problem` body + `## Techniques` heading only) | Phase 20 (forked + narrowed); Phase 22 (v1.2 deleted) | Reduces the `EditorState.changeFilter` surface to only what's still semantically needed; the widget owns the fence range via `atomicRanges`. |
| Mutual-exclusion logic forces `useNestedEditor=false` when both ON | Mutual-exclusion logic forces `useInlineWidget=true` when 1.2.x carry-over `useNestedEditor=true` is detected | Phase 22 sub-step A (Specific Findings §1 inversion) | Upgrade path correctness for 1.2.x → 1.3.0 users. The inversion path itself dies in sub-step E. |
| `useInlineWidget=false` default (1.2.x line) | Default removed; v1.3 widget is unconditional path | Phase 22 sub-step A (flip) → sub-step E (gate removal) | The cutover semantic per CONTEXT L1. |

**Deprecated/outdated:**
- `'leetcode.lang-switch'`, `'leetcode.peer-sync'`, `'leetcode.reset.child'` userEvent strings — gone from `src/`. Any future grep that finds them is a regression.
- `useInlineWidget` and `useNestedEditor` setting fields — gone from `SettingsStore.ts`. data.json may carry them for one boot cycle (read-and-ignore mechanism).
- `childEditorRegistry`, `childEditorSync`, `nestedEditorExtension`, `codeActionsEditorExtension`, `sectionLockExtension` modules — gone from `src/main/`.

## Assumptions Log

> All factual claims in this research are tagged inline. The table below enumerates `[ASSUMED]` items that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | v1.2 ship commit = `2411f8e docs: changelog entry for 1.2.0-alpha.4` | §8 THEME-05 baseline regen | If wrong commit chosen, baseline screenshots show different code; theme regression checklist becomes invalid. **Mitigation**: planner can confirm by `git show 2411f8e -- package.json` and verifying `"version": "1.2.0"`; if a different commit is the canonical v1.2 ship, planner picks. The release-tag pattern (`1.2.0-alpha.4`) is the closest ship marker. |
| A2 | Vim.handleKey returns `undefined` for `<Tab>` and updates marker as side-effect even without a binding | §4 D-polish-01 + Code Examples | If wrong, the probe finds `Vim.handleKey` doesn't update the marker either — fix doesn't work. Already mitigated by 30-min time-box + defer-to-v1.3.x fallback. |
| A3 | The 5 community themes by exact store name as listed | §8 THEME-05 baseline regen | If a theme has been renamed/forked since v1.2 baseline (e.g., "Catppuccin" published under a different repo), screenshot capture pulls a different theme than the v1.2 baseline. **Mitigation**: planner verifies each theme name in Obsidian's themes browser at THEME-05 execution time; updates checklist if names changed. |
| A4 | `tests/integration/sectionLockIntegration.test.ts` and `tests/main/lifecycle.test.ts` should be deleted (not ported) in Phase 22 | §14 codebase post-deletion sanity | If these tests cover surviving v1.3 surfaces, deleting them removes coverage. **Mitigation**: planner audits each at sub-step D start; CONTEXT discretion item explicitly calls for "verify tests/main/ non-empty post-deletion". |
| A5 | `childEditorFactory.ts` no longer has v1.3 callers post-Phase-22 (i.e., it should be added to deletion list) | §14 + Standard Stack | If `childEditorFactory.ts` IS still called by `WidgetController` indirectly, deleting it breaks the build. **Mitigation**: planner runs `grep -rn 'childEditorFactory' src/` at sub-step C start; if zero non-self references, add to deletion list. If references exist, leave in tree (factory may have been kept as a v1.3 internal helper). Per cursory grep: `WidgetController.ts` imports `childEditorLanguage`, `childEditorTheme`, `childEditorSemanticClasses` directly — NOT `childEditorFactory`. So the factory is likely a v1.2-only seam → DELETE candidate. |
| A6 | `mutualExclusion.test.ts` should be added to deletion list | §14 | If the test exercises a surviving surface (e.g., the assertion that `useInlineWidget=ON` forces `useNestedEditor=false`), deletion is wrong. Per file name + context, this test is exactly the v1.2 mutual-exclusion logic that dies in sub-step E. **Recommendation**: delete. Planner verifies by reading test file at sub-step D. |
| A7 | The release workflow's auto-patch of `manifest.json` from tag is sufficient for plugin-store re-review | §9 D-gate-04 | If plugin-store reviewers fetch the in-tree manifest.json (not the release-asset version) for the auto-review step, the `1.0.1` HEAD value would fail review. **Mitigation**: D-manifest-01 bumps in-tree to `1.3.0` at GA, eliminating the divergence. |
| A8 | Lockfile `package.json` `dependencies` cleanup yields no candidates post-Phase-22 | Standard Stack §Lockfile cleanup | If `npm ls` surfaces orphans (e.g., `child_process`, `path`, `fs` shims that look unrelated to deleted v1.2 code but were transitively pulled in), the planner has a discretion call. **Mitigation**: `npm ls` audit is a Discretion item, not gate-blocking. If unclear, leave alone. |

**If user confirms A1, A3, A5, A6 before planning starts**: the planner can lock these decisions into Plan 22-01 / 22-03 task descriptions verbatim. If user defers to discovery: planner audits during execution.

## Open Questions

1. **Should `tests/integration/sectionLockIntegration.test.ts` be deleted or ported to `sectionProtectionExtension`?**
   - What we know: it imports from `../../src/main/sectionLockExtension` (deleting). The Phase 20 forked extension `sectionProtectionExtension.ts` has its own dedicated test at `tests/main/sectionProtectionExtension.test.ts`.
   - What's unclear: whether the integration test exercises surviving narrow-protection cases that the unit test doesn't cover.
   - Recommendation: at sub-step D start, read the integration test file. If its cases are subsumed by `sectionProtectionExtension.test.ts`, **delete**. If unique cases (e.g., interaction with vault.process from another extension), **port** the imports.

2. **`childEditorFactory.ts` (482 LOC) — DELETE or KEEP?**
   - What we know: not in CONTEXT's 5-source-deletion list. Phase 19 C-01 says "repurpose for widget-internal CM6 mount." Imports from `childEditorSync` (deleting), `childEditorLanguage` (keeping), `childEditorTheme` (keeping), `childEditorSemanticClasses` (keeping).
   - What's unclear: whether `WidgetController.buildWidgetExtensions` actually calls into `childEditorFactory` or builds extensions directly. Empirical grep shows `WidgetController.ts` imports `childEditorLanguage`/`Theme`/`SemanticClasses` directly — suggesting the factory IS a v1.2-only seam.
   - Recommendation: at sub-step C start, run `grep -rn 'childEditorFactory\|createChildEditor' src/widget/` and `tests/widget/`. If zero hits, **delete** + extend DELETE-01..05 list to include it.

3. **`mutualExclusion.test.ts` — confirm DELETE.**
   - What we know: in `tests/main/`, not in CONTEXT's 8-test-deletion list.
   - What's unclear: nothing — this test almost certainly exercises the `src/main.ts:1139` mutual-exclusion logic that dies in sub-step E.
   - Recommendation: read at sub-step D, confirm coverage, **delete**.

4. **`childEditorFactory.test.ts` — DELETE or KEEP?**
   - Tied to Q2: same answer as the source file. If `childEditorFactory.ts` deletes, this test deletes. If kept, this test stays.

5. **`fileOpenRetrofit.test.ts` — DELETE or update?**
   - Test exercises the `retrofitStarterCode` path that becomes unreachable when `useInlineWidget=ON` (Phase 21 plan 21-13 closure). Sub-step E deletes the unreachable branch in `NoteWriter.ts:596-597`. The test's surface dissolves.
   - Recommendation: read at sub-step D, **delete or simplify** to cover only the surviving v1.3 retrofit.

6. **`switchFenceLanguage.test.ts` — DELETE or update?**
   - Tests the parent-CM6 dispatch at `src/main.ts:3395` (which strips its userEvent annotation in sub-step E but keeps the dispatch shape). Whether the test asserts on the userEvent (which would fail) or on the change effects (which would pass) determines treatment.
   - Recommendation: read at sub-step D, update if asserting on userEvent annotation; otherwise pass-through.

## Environment Availability

> Phase 22 has minimal external dependencies — most work is filesystem editing. The few external touchpoints are listed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All build/test/lint | ✓ | 22.x (per `.github/workflows/ci.yml:18`) | — |
| npm | Package management | ✓ | bundled with Node | — |
| TypeScript compiler (`tsc`) | `npm run build` | ✓ | `5.8.3` per package.json | — |
| esbuild | `npm run build` | ✓ | `^0.28.0` | — |
| vitest | `npm test` | ✓ | `4.1.5` | — |
| eslint | `npm run lint` | ✓ | `9.30.1` (transitive) | — |
| `@replit/codemirror-vim` (D-polish-01 probe target) | Plan 22-02 vim-Tab fix | ✓ | `^6.3.0` already pinned | — |
| Obsidian (dev vault) | Sub-step B dogfood + D-gate-03 themes + D-polish-01/02/03 verification | ✓ | Author's local install at `$HOME/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/` | None — manual operations |
| BRAT plugin | D-gate-04 alpha distribution | Assumed available in tester vaults | Latest | None; if unavailable, GitHub release direct download is the fallback |
| `gh` CLI | D-gate-04 release flagging | Assumed available on author's machine | Latest | Manual GitHub web UI for release creation |
| The 5 community themes (Minimal, Things, Catppuccin, Anuppuccin, Atom) | D-gate-03 | Available via Obsidian themes browser | Latest | If a theme is unavailable (renamed/removed), pick a substitute and document |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None (all assumed available; BRAT and `gh` have manual fallbacks).

## Validation Architecture

> Per workflow §5.5, this section drives the `VALIDATION.md` template that the planner consumes. Phase 22 is mostly deletion + checklist; the validation architecture focuses on (a) regression-clean baseline, (b) post-deletion grep zero-matches assertions, (c) release gate verifications.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 + happy-dom 20.9 |
| Config file | none — vitest auto-discovers `vitest.config.*` if present; otherwise inferred. `package.json:scripts.test` = `vitest run --passWithNoTests` |
| Quick run command | `npm test -- tests/main/` (subset) or `npx vitest run path/to/file.test.ts` |
| Full suite command | `npm test` (resolves to `vitest run --passWithNoTests`) |
| CI command | `npm run ci` (chains lint + test + build + check:bundle-size) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **DELETE-01** | `src/main/childEditorSync.ts` removed | grep | `! grep -rn "from.*'\\./childEditorSync'\|from.*'\\.\\./main/childEditorSync'" src/` | ✅ verifiable |
| **DELETE-02** | `src/main/sectionLockExtension.ts` removed | grep | `! grep -rn "from.*sectionLockExtension" src/` | ✅ |
| **DELETE-03** | `src/main/nestedEditorExtension.ts` removed | grep | `! grep -rn "from.*nestedEditorExtension" src/` | ✅ |
| **DELETE-04** | `src/main/childEditorRegistry.ts` removed | grep | `! grep -rn "from.*childEditorRegistry\|childEditorRegistry" src/` | ✅ |
| **DELETE-05** | `src/main/codeActionsEditorExtension.ts` removed | grep | `! grep -rn "from.*codeActionsEditorExtension" src/` | ✅ |
| **DELETE-06** | `src/main.ts` v1.2 unwiring complete | grep | `! grep -rn "useInlineWidget\|useNestedEditor\|nestedEditorRebuildEffect\|ECHO_PRONE_USER_EVENTS" src/` | ✅ |
| **DELETE-07** | 8 dead test files removed | filesystem | `for f in childEditorSync.test.ts childEditorSync.repair.test.ts sectionLockExtension.test.ts nestedEditorExtension.test.ts codeActionsEditorExtension.test.ts childEditorRegistry.test.ts resetCommand.childDispatch.test.ts tabMidLine.test.ts; do test ! -f "tests/main/$f" \|\| (echo "FAIL: $f still exists"; exit 1); done` | ✅ |
| **DELETE-08** | CLAUDE.md `## Conventions` paragraphs removed | grep | `! grep -n "userEvent.*'leetcode\\\\.\\|Canonical plugin write-path" CLAUDE.md` | ✅ |
| **POLISH-01** | `useInlineWidget=true` is default | code inspection | manual: settings.useInlineWidget readback after fresh install | ❌ Wave 0 (manual) |
| **POLISH-02** | bundle ≤ 1,706,000 bytes | CI script | `npm run check:bundle-size` (fails if >`HARD_LIMIT`) | ✅ |
| **POLISH-03** | eslint clean + zero `innerHTML` in `src/widget/` | lint + grep | `npm run lint && ! grep -E '^[^/*]*innerHTML' src/widget/` | ✅ |
| **POLISH-04** | README updated for v1.3 | manual review | grep README.md for v1.3 architecture, migration docs, sync notes, Cmd-Z, Cmd-F | ✅ |
| **POLISH-05** | Test suite green (excluding 8 dead-test deletions) | full suite | `npm test` | ✅ |
| **POLISH-06** | BRAT alpha + plugin-store re-review | manual | 7-day dogfood + GitHub Issues monitoring + plugin-store entry version-bump | ❌ manual |
| **PROTECT-03** | `'leetcode.*'` userEvent stripped | grep | `! grep -rn "userEvent: 'leetcode\\." src/` | ✅ |
| **VIM-03** | "Resolved by Phase 20 live-reconfigure" annotation in REQUIREMENTS.md | manual | docs review | ❌ manual |
| **THEME-05** | 5-theme manual checklist passes | manual | Author runs checklist; documents in `22-VERIFICATION.md` | ❌ manual |

### Sampling Rate

- **Per task commit (sub-step A, C, D, polish, gates):** `npm run lint && npm test && npm run build && npm run check:bundle-size` (the `npm run ci` chain). ~30 seconds for the test step in current baseline.
- **Per wave merge (e.g., when Plan 22-01 lands):** Full `npm run ci` plus the grep assertions in the table above (each is sub-100ms; can be a CI step or a manual checklist in `22-VERIFICATION.md`).
- **Phase gate (before `/gsd-verify-work`):** Full suite green AND all grep assertions pass AND bundle size < 1,706,000 AND eslint clean AND theme checklist documented AND BRAT 7-day window completed.

### Wave 0 Gaps

> Wave 0 covers test infrastructure that must exist before implementation tasks run. Phase 22 has minimal Wave 0 — most validation runs against existing test infra.

- [ ] **None — existing test infrastructure covers all Phase 22 requirements.** vitest is configured; the deletion targets have existing tests that delete with their source files; the v1.3 surfaces have existing tests (44 files in `tests/widget/`, 23 surviving files in `tests/main/`). The grep assertions in the table above run as ad-hoc CI checks or are bundled into `22-VERIFICATION.md` as documentation gates.

> The validation architecture is intentionally lightweight because Phase 22 is destructive, not constructive. The bulk of validation work is verifying that the existing test suite stays green after deletions and that the grep-based "nothing references this anymore" assertions hold.

### Plan-Level Validation Targets

**Plan 22-01 (cutover) gates:**
- Sub-step A: full test suite green; sub-step B dogfood passes (no P0/P1).
- Sub-step C: build succeeds (no orphan imports); reduced test count by N where N matches deletion count.
- Sub-step D: build still succeeds; surviving `tests/main/` files compile.
- Sub-step E: build succeeds; full test suite green; grep assertions for DELETE-01..08 + PROTECT-03 all pass; bundle size measured (no gate yet — gate lands in Plan 22-03).

**Plan 22-02 (polish) gates:**
- D-polish-01: 30-min probe documented (ship-or-defer decision in `22-VERIFICATION.md`).
- D-polish-02 + D-polish-03: visual verification in dev vault across at least 2 themes (default + Minimal).
- Build succeeds; eslint clean; test suite still green.

**Plan 22-03 (release gates) gates:**
- D-gate-01: bundle threshold lowered; CI passes against current bundle size.
- D-gate-02: eslint clean; `grep -r 'innerHTML' src/widget/` returns zero non-comment matches.
- D-gate-03: 5-theme screenshots captured + compared; documented in `22-VERIFICATION.md`.
- D-gate-04: `1.3.0-beta.1` tagged + pushed; release artifacts attached; 7-day dogfood window opens. After window: `1.3.0` tagged + pushed; community-plugins.json version bump PR'd to obsidianmd/obsidian-releases (or verified that auto-trigger handles it).
- D-readme-01: README v1.3 sections present.
- D-claude-01 + D-claude-02: CLAUDE.md `## Conventions` deleted; `## Architecture` filled.
- D-manifest-01: `manifest.json` + `package.json` versions in lockstep at `1.3.0-beta.1` then `1.3.0`.

## Security Domain

> Phase 22 makes no new network calls, introduces no new auth surfaces, and does not modify the authentication/AI key handling. The security posture inherits from Phase 19/20/21 unchanged. Per `security_enforcement` discipline, the relevant ASVS categories are still enumerated for documentation completeness.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherit) | LeetCode session cookie + AI provider keys in `data.json` only; never logged, never transmitted except to `leetcode.com` / AI provider hosts. Phase 22 doesn't touch this surface. |
| V3 Session Management | yes (inherit) | LC session cookie validity check: 401/403 → re-auth prompt. Phase 22 doesn't touch. |
| V4 Access Control | no | Plugin runs entirely under user's vault permissions; no multi-tenant or privilege boundary. |
| V5 Input Validation | yes (inherit) | `lc-slug` regex `^[a-z0-9-]+$` validates slug shape per CLAUDE.md community-plugin requirements. Phase 22 doesn't introduce new user-controlled inputs. |
| V6 Cryptography | no | Plugin uses no cryptography (LC + AI provider TLS handled by Obsidian's `requestUrl` and the Vercel AI SDK). |

### Known Threat Patterns for v1.3 widget stack

| Pattern | STRIDE | Standard Mitigation | Phase 22 Status |
|---------|--------|---------------------|-----------------|
| XSS via `innerHTML` of LC HTML content | Tampering | `createEl` / `setText` / `appendChild` only; never `innerHTML` | D-gate-02 verifies via eslint clean + `grep -r 'innerHTML' src/widget/`. Baseline already passing per §7. |
| XSS via paste of HTML into widget | Tampering | CM6's paste handler strips HTML by default | Inherit from CM6 baseline; Phase 22 doesn't touch the paste pipeline. |
| Migration writing to non-LC notes (vault corruption attack vector) | Tampering | Strict gate on `lc-slug` frontmatter; reject without it (Phase 21 D-edge-01) | Phase 21 baseline; Phase 22 keeps migration infrastructure unchanged. |
| Self-write echo loop | DoS / data integrity | Per-path content-hash suppression map with 2s TTL | Phase 19 C-04; unchanged. |
| `vault.modify` non-atomic writes | Tampering / data integrity | `vault.process` mandatory; `scripts/grep-no-vault-modify.sh` enforces in CI | Phase 22 makes no new vault writes; the existing CI grep gates remain. |
| `'leetcode.*'` userEvent bypass abuse | Tampering | The convention itself is retired in Phase 22 (PROTECT-03) — bypass mechanism no longer exists | Phase 22 retirement closes the surface. |
| Plugin-store reviewer rejection | (process risk, not STRIDE) | D-gate-04 + D-readme-01 + D-manifest-01 + D-gate-02 | Belt-and-suspenders: README discloses v1.3 architecture; manifest version-bumped; eslint clean; bundle smaller than v1.2. |
| Bundle code reads cookies/keys for telemetry | Information Disclosure | `npm run check:lc-isolation` enforces `leetcode.com` calls go through `requestUrl` only; `eslint-plugin-obsidianmd` enforces no `fetch` from LC paths | Inherit from Phase 19+; Phase 22 doesn't add network calls. |

**No new ASVS surfaces introduced in Phase 22.** The phase is deletion-net-negative on attack surface (5 source files + 8 test files removed; ~800 LOC of plumbing removed; 2 conventions retired).

## Sources

### Primary (HIGH confidence)

- **`./CLAUDE.md`** — Project conventions, tech stack, community-plugin requirements, GSD workflow enforcement (read at session init).
- **`.planning/phases/22-v1-2-path-removal-polish/22-CONTEXT.md`** — User decisions (carry-forward L1–L9, D-plan-01, D-cutover-01..02, D-unwire-01..02, D-polish-01..03, D-gate-01..04, D-settings-01..02, D-claude-01..02, D-readme-01, D-manifest-01); claude's discretion areas; deferred ideas. **THE primary input.**
- **`.planning/REQUIREMENTS.md`** — DELETE-01..08, POLISH-01..06, PROTECT-03, VIM-03, THEME-05 traceability.
- **`.planning/STATE.md`** — v1.2 baseline (1,707,327 B raw / 459,257 B gzipped; 1,713 tests); Phase 21.1 baseline (3,106 pass / 1 pre-existing fail).
- **`.planning/ROADMAP.md` §"Phase 22"** (lines 273–307) — 9 success criteria; key risks/notes; LOW research flag.
- **`.planning/research/SUMMARY.md`** — Phase ordering rationale; Phase 4 = Phase 22 mapping; "deletion + checklist, no new architecture."
- **`.planning/research/PITFALLS.md`** — Especially P5, P13, P25 mapping per CONTEXT canonical refs.
- **`.planning/research/STACK.md`** — `'leetcode.*'` userEvent retirement guidance; CM6 version pin discrepancy (CLAUDE.md docs drift, not a Phase 22 blocker).
- **Phase 19+20+21 CONTEXT files** — Carry-forward decisions; deletion-target rationale.
- **Phase 21.1 SUMMARY** — Baseline behavior Phase 22 must NOT regress (R6 fresh-create + R10 typing-flicker fixes stable).

### Source-of-truth empirical artifacts (HIGH confidence)

- **`src/main.ts:1100-1300`** — Phase 19+20+21 onload registration block; mutual-exclusion logic at `:1139`; `useInlineWidget` master gate; v1.2 + v1.3 registration paths.
- **`src/main.ts:3395, 3905, 3963, 4546`** — 4 active `'leetcode.*'` userEvent annotation sites for D-unwire-02 strip.
- **`src/widget/WidgetController.ts:1071-1095`** — Tab handler shape; D-polish-01 target.
- **`src/settings/SettingsStore.ts:79-95, 284-296, 711-720, 895-925`** — Settings field types, defaults, mapper, getters/setters for D-settings-01.
- **`styles.css:943-971, 1145-1156, 1950-2035`** — Action row + widget wrapper CSS for D-polish-02 + D-polish-03.
- **`scripts/check-bundle-size.mjs:113-115`** — Existing bundle gate for D-gate-01.
- **`.github/workflows/ci.yml`** — CI sequence (`lint`, `test`, `build`, `check:bundle-size`).
- **`.github/workflows/release.yml`** — Auto-patch manifest from tag; auto-detect prerelease via `-` separator.
- **`manifest.json`** — Current version `1.0.1` (anomaly per §9); `isDesktopOnly: true`; description 60 chars (≤ 250).
- **`package.json`** — Current version `1.2.0`; `npm run ci` chain; no new deps needed.
- **`node_modules/@replit/codemirror-vim/dist/index.d.ts`** — `Vim.handleKey` signature for D-polish-01 probe.
- **`node_modules/@replit/codemirror-vim/dist/index.cjs:922-1058`** — `handleKey` runtime split between insert/non-insert paths.

### Secondary (MEDIUM confidence)

- **CONTEXT D-cutover-02 line reference "1139"** — verified extant at `src/main.ts:1139` exact line; mapping is correct.
- **CONTEXT "33+ mention sites" claim for `useInlineWidget`** — confirmed conservative; actual count is 76 raw hits (Specific Findings §2). Planner should expect ~30 functional gates after comments are filtered.
- **CONTEXT "~10 sites" claim for `'leetcode.*'`** — slight overcount; actual is 4 active dispatch sites + 2 doc comments + 2 in-deleted-file comments + 1 in-surviving-file comment = 9 references (Specific Findings §3). Within "~10" tolerance.
- **CLAUDE.md line 195/197 references to Conventions paragraphs** — both bullets confirmed extant (Specific Findings §11). Section can be deleted entirely after both bullets are removed.

### Tertiary (LOW confidence — flagged for validation)

- **A1 v1.2 ship commit = `2411f8e`** — picked from `git log --grep` results; closest match to "v1.2 shipped 2026-05-26" per STATE.md. Planner verifies at THEME-05 baseline regen.
- **A3 5 theme exact names** — pulled from CONTEXT verbatim; planner confirms in Obsidian's themes browser at THEME-05 execution time.
- **A2 Vim.handleKey marker side-effect** — purely empirical; the 30-min probe is the verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all targets verified.
- Architecture: HIGH — diagram is the actual post-Phase-22 code; not aspirational.
- Pitfalls: HIGH — every pitfall maps to a verified-extant code/file/process.
- Validation: HIGH — every gate has an existing tool or simple grep assertion.
- Specific Findings (the 14 questions): HIGH — empirically verified by grep + file read.
- Two LOW items (theme names, vim marker side-effect) — explicitly flagged + planned validation paths.

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (30 days for stable deletion phase; minimal upstream-API drift risk)
