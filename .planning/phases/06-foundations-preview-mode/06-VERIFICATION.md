---
phase: 06-foundations-preview-mode
verified: 2026-05-15T19:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Right-click a problem row in the LeetCode browser and confirm the 'Preview problem' menu entry opens a read-mode preview tab without creating a .md file in the vault."
    expected: "Context menu appears with 'Preview problem' item; clicking opens a 'leetcode-preview' tab; no new file under {problemsFolder}/."
    why_human: "Native Electron context-menu rendering, Lucide icon visibility, and Obsidian Menu chrome cannot be exercised in a unit test."
  - test: "Single-click a problem (default settings) and confirm a preview tab opens; shift-click the same problem and confirm the v1.0 note-creation path fires (note opens, not preview)."
    expected: "Plain left-click opens preview; shift+click opens/creates the note via the v1.0 pipeline."
    why_human: "Real DOM event ordering with shiftKey + Obsidian's tab focus behavior cannot be reliably reproduced in happy-dom tests."
  - test: "Open Settings → Preview → Click behavior, switch to 'Open note directly', click a problem and confirm the v1.0 path fires; switch back to 'Preview first', reload Obsidian, confirm the toggle persists."
    expected: "Setting persists across reload via data.json; click routing flips between preview and open paths consistent with the dropdown."
    why_human: "Real settings persistence and full plugin reload cycle are out of scope for unit tests."
  - test: "Preview a problem you have NOT created a note for; click 'Start Problem'; confirm a note is created via the existing v1.0 pipeline AND the preview tab auto-detaches ~100ms after the note opens."
    expected: "Note is created at {problemsFolder}/{id}-{slug}.md; preview leaf disappears once the note tab takes focus."
    why_human: "Real WorkspaceLeaf.detach + tab focus + 100ms timing requires a live Obsidian instance."
  - test: "Preview a problem you HAVE created a note for; confirm 'Open Problem' (neutral, no accent) renders instead of 'Start Problem'; click it and confirm it jumps to the existing note WITHOUT overwriting content."
    expected: "Action button label says 'Open Problem'; clicking jumps to the existing note; note content unchanged."
    why_human: "Visual accent class application + actual file content preservation needs an interactive vault."
  - test: "Open the same problem twice from the browser (single-click two different rows). Confirm only ONE 'leetcode-preview' tab exists at any time (the second preview replaces the first)."
    expected: "workspace.getLeavesOfType('leetcode-preview').length === 1 throughout."
    why_human: "Tab-reuse via setViewState is unit-tested at the spy level (tab-reuse.test.ts) but real Obsidian leaf identity through revealLeaf needs a live workspace."
  - test: "From a problem note with `lc-slug` frontmatter, run command palette 'Open in preview' and confirm the preview tab opens for that slug; from a non-LeetCode note, confirm the command does NOT appear in the palette."
    expected: "Palette command gates correctly on lc-slug presence; force=true so the user's Click behavior=open setting cannot suppress it."
    why_human: "Real Obsidian command palette gating + frontmatter cache requires a live editor."
  - test: "Trigger an offline / network-error preview (kill network, then preview). Confirm the error state with 'Couldn't load problem' + Retry button renders and the Notice fires."
    expected: "Empty-state DOM with retry button; 4-second Notice appears."
    why_human: "Real network failure simulation in Obsidian's runtime is not exercised by unit tests."
---

# Phase 06: Foundations + Preview Mode — Verification Report

**Phase Goal:** User can preview a LeetCode problem without creating a note, and the codebase is lint-clean against the latest plugin-store ruleset with a CI bundle-size gate.

**Verified:** 2026-05-15T19:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP v1.1 success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can right-click a problem in the browser and see a read-mode preview tab open with NO `.md` file created in the vault. | VERIFIED | `src/browse/ProblemBrowserView.ts:639-651` adds `contextmenu` listener using `Menu.addItem('Preview problem')` -> `routeProblemClick(slug, status, 'preview', { force: true })`. `src/main.ts:561` `routeProblemClick` -> `openOrReusePreview(this, slug)`. `src/preview/previewRouter.ts:36-59` uses `setViewState({ type: 'leetcode-preview', state: { slug } })` only — no `vault.create`. `tests/preview/regression-grep.test.ts` GATE 1 enforces 0 `vault.create(` matches in any `src/preview/` file. `tests/preview/right-click.test.ts` (8 tests) covers the menu wiring. |
| 2 | User can single-click a problem (default) to preview, or shift-click / use a settings toggle to fall back to v1.0 click-to-create note behavior. | VERIFIED | `src/browse/ProblemBrowserView.ts:36-37` `decideClickIntent(e)` returns `'open'` if `shiftKey`, else `'preview'`. `src/browse/ProblemBrowserView.ts:620-631` row click handler calls `routeProblemClick(p.slug, p.status, intent)`. `src/main.ts:544-562` `routeProblemClick` honors setting precedence (intent='preview' + setting='open' → openProblem). `src/settings/SettingsTab.ts:184-196` Preview section + Click behavior dropdown (`Preview first` / `Open note directly`). `src/settings/SettingsStore.ts:95,131,342,426-433` `previewClickBehavior` field with default `'preview'`, shape-guard collapses malformed values, getter/setter pair. `tests/preview/router.test.ts` (9 cases — full 8-cell intent×force×setting matrix) + `tests/settings/preview-click-behavior.test.ts` (10 round-trip + shape-guard tests) + `tests/preview/click-behavior.test.ts` (6 helper + DOM tests) all green. |
| 3 | User sees difficulty + topic chips at the top of the preview tab and can click "Start Problem" or "Open Problem" depending on whether a note exists. | VERIFIED | `src/preview/ProblemPreviewView.ts:116-167` `renderHeader()` builds h2 title + chip row with difficulty pill (`lc-diff lc-diff--{difficulty.toLowerCase()}`) + topic chips (`lc-preview__topic`) + action button. Lines 152-159: button label flips between `Start Problem` (no note, with `is-primary` accent class) and `Open Problem` (note exists, neutral). Lines 439-441 + 449-494 `handleActionClick` delegates to `plugin.openProblem(slug, undefined)` (existing v1.0 NoteWriter pipeline). `src/preview/previewExistingNote.ts:62-76` `detectExistingNote()` pure helper consults cache + `buildNotePath` + `vault.getAbstractFileByPath`. CSS at `styles.css:1233-1340` reuses Obsidian variables (no raw hex per UI-SPEC). Tests: `header-render.test.ts` (7), `existing-note-detection.test.ts` (4), `start-button.test.ts` (3), `detach.test.ts` (2). |
| 4 | CI fails the build when production bundle exceeds 500 KB; current bundle baseline is captured. | VERIFIED | `scripts/check-bundle-size.mjs:17,28-31` HARD_LIMIT=500_000 with `process.exit(1)` on exceed; SOFT_WARN=400_000. `.github/workflows/ci.yml:24` runs `npm run check:bundle-size` as the final CI step on push-to-main + every PR. `package.json:11` registers the script. Live re-run: `npm run check:bundle-size` → `main.js: 168953 bytes (165.0 KB) → BUNDLE CHECK OK` (exit 0). `README.md:134-145` documents the 500 KB hard / 400 KB soft thresholds and cites the verified baseline `~165.0 KB (168,953 bytes)`. `tests/foundations/check-bundle-size.test.ts` (7 tests, including 100/450/600 KB tmpdir fixtures) + `tests/foundations/ci-workflow.test.ts` (4 tests for 5-step pipeline shape) lock the gate. |
| 5 | `npm run lint` passes against `eslint-plugin-obsidianmd@^0.3.0` with all new commands using clean IDs. | VERIFIED | `package.json:22` `eslint-plugin-obsidianmd: ^0.3.0`. `eslint.config.mts` adopts `obsidianmd.configs.recommended` (drift-gated by `tests/foundations/eslint-config.test.ts`). `src/main.ts:280` new command `id: 'open-in-preview'` — no plugin-id prefix (`leetcode`/`obsidian`), no `command` substring, no hotkey. Live re-run: `npm run lint` exits 0 with **0 errors / 0 warnings** at HEAD. `tests/preview/command-ids.test.ts` (7 tests) statically asserts ID hygiene. |

**Score:** 5 / 5 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/preview/ProblemPreviewView.ts` | `leetcode-preview` ItemView with sticky header + body via MarkdownRenderer | VERIFIED | 496 lines; lifecycle (onOpen / setState / onClose / renderForSlug / renderRendered / handleActionClick) wired; `renderToken` guards late fetches; cache-miss persists via `setProblemDetail` (line 340); `MarkdownRenderer.render(this.app, md, body, '', this)` (line 435) — passes the view as Component. |
| `src/preview/previewRouter.ts` | `openOrReusePreview` tab-reuse helper using `getLeavesOfType` + `setViewState` | VERIFIED | 60 lines; line 41 `getLeavesOfType(PREVIEW_VIEW_TYPE)` + lines 44-49 reuse-or-create branches with `setViewState({ state: { slug } })` + `revealLeaf`. Imported by `src/main.ts:37`. |
| `src/preview/previewExistingNote.ts` | Pure `detectExistingNote(app, settings, slug)` helper | VERIFIED | 77 lines; uses cache → `buildNotePath` → `getAbstractFileByPath` → `instanceof TFile` chain. Imported by `ProblemPreviewView.ts:48`. |
| `src/main.ts` (registerView + open-in-preview command + routeProblemClick preview branch) | All three present | VERIFIED | Line 240 `registerView(PREVIEW_VIEW_TYPE, leaf => new ProblemPreviewView(leaf, this))`. Lines 279-294 `addCommand({ id: 'open-in-preview', name: 'Open in preview', editorCheckCallback: ... })` gates on `lc-slug` frontmatter, fires with `force: true`. Lines 544-562 `routeProblemClick` correctly precedence-orders intent='open' / force / setting='open' / default-preview. |
| `src/browse/ProblemBrowserView.ts` (row click + right-click context menu) | Both wired | VERIFIED | Line 5 `Menu` added to obsidian import. Lines 36 `decideClickIntent(e)` exported pure helper. Lines 620-631 row click delegates to `routeProblemClick(slug, status, intent)`. Lines 639-651 `contextmenu` listener with `Menu.addItem('Preview problem')` → `routeProblemClick(..., 'preview', { force: true })`. `pickRandom` left untouched per CONTEXT.md (regression-grep gate locks this). |
| `src/settings/SettingsStore.ts` (previewClickBehavior + shape-guard) | Field + getter/setter present | VERIFIED | Line 95 PluginData field `previewClickBehavior: 'preview' \| 'open'`. Line 131 `DEFAULT_DATA.previewClickBehavior: 'preview'`. Line 342 `load()` shape-guard `raw.previewClickBehavior === 'open' ? 'open' : 'preview'`. Lines 426-433 getter/setter pair (mirrors `getAutoBacklinksEnabled`). |
| `src/settings/SettingsTab.ts` (Preview section + dropdown) | Section heading + 'Click behavior' dropdown | VERIFIED | Line 184 `new Setting(containerEl).setName('Preview').setHeading()`. Lines 186-196 dropdown with `addOption('preview', 'Preview first')` + `addOption('open', 'Open note directly')` + `setValue(getPreviewClickBehavior())` + `onChange` calling `setPreviewClickBehavior(v)`. |
| `scripts/check-bundle-size.mjs` | Node ESM bundle gate (500 KB hard / 400 KB soft) | VERIFIED | 36 lines, ESM, zero deps. HARD_LIMIT=500_000 / SOFT_WARN=400_000. `process.exit(1)` on exceed. Replaces deleted bash version. Invoked by `npm run check:bundle-size` AND by `scripts/prerelease-check.sh` gate 12. |
| `.github/workflows/ci.yml` | First GitHub Actions workflow with 5-step pipeline | VERIFIED | 25 lines. `name: CI`. Triggers on push-to-main + every PR. `runs-on: ubuntu-latest`, `node-version: 20`, `cache: npm`. 5 steps in order: `npm ci → npm run lint → npm test → npm run build → npm run check:bundle-size`. |
| `README.md` (Bundle size + click-default docs) | New section + Features bullet + bundle subsection | VERIFIED | Line 10 Features bullet for preview affordance. Lines 54-62 `## Previewing problems` section with verbatim copy (`Preview problem`, `Open in preview`, `Preview first`, `Open note directly`, `shift-click`). Lines 134-145 `### Bundle size` subsection citing `scripts/check-bundle-size.mjs`, 500 KB hard / 400 KB soft, baseline `~165.0 KB (168,953 bytes)`. |
| `package.json` (eslint-plugin-obsidianmd@^0.3.0 + check:bundle-size script) | Both present | VERIFIED | Line 11 `"check:bundle-size": "node scripts/check-bundle-size.mjs"`. Line 22 `"eslint-plugin-obsidianmd": "^0.3.0"`. |
| `tests/preview/regression-grep.test.ts` | 7-gate UI-SPEC acceptance lock | VERIFIED | 105 lines. GATE 1 (no vault.create), GATE 2 (no openLinkText), GATE 3 (no innerHTML=), GATE 4 (no cm.dispatch), GATE 5 (MarkdownRenderer passes `this` not `this.plugin`), GATE 6 + aggregate (getLeavesOfType for tab-reuse). All green at HEAD. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `ProblemBrowserView.row.click` | `LeetCodePlugin.routeProblemClick` | `decideClickIntent` + `void this.plugin.routeProblemClick(p.slug, p.status, intent)` | WIRED | `src/browse/ProblemBrowserView.ts:629-630` — calls flow into the central router. |
| `ProblemBrowserView.row.contextmenu` | `LeetCodePlugin.routeProblemClick` | `Menu.addItem('Preview problem').onClick(...)` with `force: true` | WIRED | `src/browse/ProblemBrowserView.ts:646-647` — right-click uses force-flag escape. |
| `LeetCodePlugin.routeProblemClick` | `openOrReusePreview` | `return openOrReusePreview(this, slug)` | WIRED | `src/main.ts:561`. The Plan 06-02 placeholder Notice has been removed. |
| `LeetCodePlugin.routeProblemClick` | `LeetCodePlugin.openProblem` | `return this.openProblem(slug, status)` | WIRED | `src/main.ts:551,555` — both intent='open' and setting='open' branches reach the v1.0 pipeline. |
| `openOrReusePreview` | `WorkspaceLeaf.setViewState` | `await leaf.setViewState({ type: PREVIEW_VIEW_TYPE, state: { slug } })` | WIRED | `src/preview/previewRouter.ts:44-49,52-57` — both reuse and create branches set state with slug. |
| `ProblemPreviewView.handleActionClick` | `LeetCodePlugin.openProblem` | `await this.plugin.openProblem(slug, undefined)` | WIRED | `src/preview/ProblemPreviewView.ts:465` — Start/Open buttons delegate to v1.0 pipeline. |
| `ProblemPreviewView.handleActionClick` | `WorkspaceLeaf.detach` | `setWindowTimeout(() => this.leaf.detach(), 100)` | WIRED | `src/preview/ProblemPreviewView.ts:482-489` — post-action detach scheduled via popout-aware timer. |
| `ProblemPreviewView.renderForSlug` | `SettingsStore.setProblemDetail` | `await this.plugin.settings.setProblemDetail(slug, toDetailCacheEntry(fetched))` | WIRED | `src/preview/ProblemPreviewView.ts:340` — cache-miss persists per RESEARCH §A2. |
| `ProblemPreviewView.renderRendered` | `MarkdownRenderer.render` | `MarkdownRenderer.render(this.app, md, body, '', this)` | WIRED | `src/preview/ProblemPreviewView.ts:435` — passes `this` (ItemView extends Component), satisfies `obsidianmd/no-plugin-as-component`. Locked by `regression-grep.test.ts` GATE 5. |
| `LeetCodePlugin.onload` | `ProblemPreviewView` constructor | `registerView(PREVIEW_VIEW_TYPE, leaf => new ProblemPreviewView(leaf, this))` | WIRED | `src/main.ts:240-241`. |
| `LeetCodePlugin` command palette | `routeProblemClick` (force) | `id: 'open-in-preview'` editorCheckCallback gates on `lc-slug`; calls `routeProblemClick(slug, undefined, 'preview', { force: true })` | WIRED | `src/main.ts:279-294`. ID hygiene locked by `tests/preview/command-ids.test.ts`. |
| `SettingsTab.Preview.dropdown` | `SettingsStore.setPreviewClickBehavior` | `onChange` handler awaits `setPreviewClickBehavior(v)` | WIRED | `src/settings/SettingsTab.ts:193-195`. |
| `.github/workflows/ci.yml` | `scripts/check-bundle-size.mjs` | `npm run check:bundle-size` final step | WIRED | `.github/workflows/ci.yml:24` + `package.json:11`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|---------------------|--------|
| `ProblemPreviewView` (header chips) | `detail.difficulty`, `detail.topicSlugs`, `detail.id`, `detail.title` | `plugin.settings.getProblemDetail(slug)` cache, fallback to `plugin.client.getProblemDetail(slug)` (v1.0 LeetCodeClient HTTP path), persisted via `setProblemDetail(slug, toDetailCacheEntry(fetched))` | YES — same v1.0 pipeline that powers the existing browser/notes (live `requestUrl` to leetcode.com) | FLOWING |
| `ProblemPreviewView` (body markdown) | `htmlToMarkdown(detail.contentHtml)` | Same `DetailCacheEntry.contentHtml` populated from `LeetCodeClient.getProblemDetail`. | YES — real HTML returned by the LC GraphQL endpoint, converted via existing `htmlToMarkdown` (turndown). | FLOWING |
| `ProblemPreviewView` (action button label) | `noteExists` boolean from `detectExistingNote(app, settings, slug)` | `app.vault.getAbstractFileByPath(buildNotePath(folder, cached.id, slug))` + TFile narrow. | YES — real Obsidian vault index lookup; pure helper has no fallback to hardcoded data. | FLOWING |
| Settings dropdown selected value | `previewClickBehavior: 'preview' \| 'open'` | `loadData()/saveData()` round-trip via `SettingsStore`; shape-guard at line 342. | YES — real Obsidian plugin data persistence. | FLOWING |
| CI bundle size | `fs.statSync('main.js').size` | Real file output of `node esbuild.config.mjs production`. | YES — real bundle bytes. | FLOWING |

No artifact passes existence/wired but renders hardcoded/empty data. All preview content traces back to the live v1.0 LC API path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lint passes against eslint-plugin-obsidianmd@^0.3.0 with 0 errors / 0 warnings | `npm run lint` | exit 0, no output (silent success) | PASS |
| Test suite passes including all preview/foundations tests | `npm test` | 731 passed / 3 skipped (107 files, 22.93s) | PASS |
| Test suite — preview + foundations subsets specifically | `npx vitest run tests/preview tests/foundations tests/settings/preview-click-behavior.test.ts` | 80 passed / 0 failed (14 test files) | PASS |
| Production build (tsc + esbuild) clean | `npm run build` | exit 0; tsc clean + production bundle written | PASS |
| Bundle-size gate exits 0 and reports real bytes | `npm run check:bundle-size` | `main.js: 168953 bytes (165.0 KB)` → `BUNDLE CHECK OK` | PASS |
| Bundle file exists with expected size | `wc -c main.js` | `168953 main.js` | PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| n/a | n/a | No probes declared in PLAN/SUMMARY for Phase 06 (this is a feature phase, not a migration phase). | SKIPPED |

The phase artifacts do not declare any `scripts/*/tests/probe-*.sh` files. The success-gate is the four `npm` scripts above (lint/test/build/check:bundle-size); all four exit 0.

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| FOUND-01 | git show 5bdbcd1:.planning/REQUIREMENTS.md | `eslint-plugin-obsidianmd` is bumped to `^0.3.0` and the codebase passes the new ruleset before any v1.1 feature code lands. | SATISFIED | `package.json:22` pinned to ^0.3.0; `npm run lint` exits 0; cascade fixes applied across 19 files in commit `8550bab`; drift-gated by `tests/foundations/eslint-config.test.ts`. |
| FOUND-02 | git show 5bdbcd1:.planning/REQUIREMENTS.md | CI fails the build if production bundle exceeds 500 KB; current size captured as baseline. | SATISFIED | `scripts/check-bundle-size.mjs` (HARD=500_000 with exit 1); `.github/workflows/ci.yml` runs it last; README documents the gate + 165.0 KB / 168,953 byte baseline. Live `npm run check:bundle-size` exits 0. |
| FOUND-03 | git show 5bdbcd1:.planning/REQUIREMENTS.md | All new commands use clean IDs per `eslint-plugin-obsidianmd@0.3.0` rules. | SATISFIED | `src/main.ts:280` `id: 'open-in-preview'` — no plugin-id prefix, no `command` substring, no hotkey. `tests/preview/command-ids.test.ts` (7 tests) locks ID hygiene. |
| PREVIEW-01 | git show 5bdbcd1:.planning/REQUIREMENTS.md | User can right-click a problem in the browser to open it in a read-mode preview tab without creating a note. | SATISFIED | `src/browse/ProblemBrowserView.ts:639-651` contextmenu listener + Menu wiring; `tests/preview/right-click.test.ts` (8 tests) covers Menu wiring; regression-grep GATE 1 confirms no `vault.create(` in any `src/preview/` file. (Note: visual menu rendering still requires human verification.) |
| PREVIEW-02 | git show 5bdbcd1:.planning/REQUIREMENTS.md | Single-click previews; settings toggle restores v1.0 click-to-create behavior. | SATISFIED | `decideClickIntent(e)` + `routeProblemClick` decision flow + `Preview › Click behavior` settings dropdown + `previewClickBehavior` field with safe default `'preview'` and shape-guard. Test matrix: `tests/preview/router.test.ts` (9), `tests/preview/click-behavior.test.ts` (6), `tests/settings/preview-click-behavior.test.ts` (10). |
| PREVIEW-03 | git show 5bdbcd1:.planning/REQUIREMENTS.md | Difficulty + topic chips at the top of the preview tab. | SATISFIED | `src/preview/ProblemPreviewView.ts:116-167` `renderHeader()`. Difficulty pill + topic chips + sticky header CSS at `styles.css:1233-1340`. Tests: `tests/preview/header-render.test.ts` (7). |
| PREVIEW-04 | git show 5bdbcd1:.planning/REQUIREMENTS.md | Preview shows "Start Problem" button when no note exists; creates note via existing v1.0 pipeline. | SATISFIED | `src/preview/ProblemPreviewView.ts:152-159` button label flips on `noteExists`; line 465 `await this.plugin.openProblem(slug, undefined)` delegates to v1.0 NoteWriter pipeline. Tests: `tests/preview/start-button.test.ts` (3), `tests/preview/existing-note-detection.test.ts` (4). |
| PREVIEW-05 | git show 5bdbcd1:.planning/REQUIREMENTS.md | Preview shows "Open Problem" button when a note already exists; jumps to existing note. | SATISFIED | Same `renderHeader` branch — `Open Problem` (neutral, no `is-primary`) when `detectExistingNote` reports `fileExists: true`; click handler still routes through `plugin.openProblem(slug)` which itself detects existing notes (NoteWriter.openProblem at `src/notes/NoteWriter.ts:218-225` is the existing v1.0 path that opens-not-overwrites). |

**Coverage:** 8 / 8 requirements satisfied. No orphaned requirements detected — every ID declared in the SUMMARYs matches an ID in the v1.1 REQUIREMENTS.md (recovered from git commit `5bdbcd1`).

**Note on REQUIREMENTS.md location:** The repository's `.planning/REQUIREMENTS.md` was deleted in commit `00c4137` ("chore: remove REQUIREMENTS.md for v1.0 milestone") AFTER it was originally created in commit `30ea19f` (v1.1 39 reqs). The current ROADMAP.md on disk shows ONLY v1.0 phases (the v1.1 section was likely also rolled back). However, the v1.1 REQUIREMENTS.md content is preserved in git history at commit `5bdbcd1`, and Phase 06 was executed against that contract. **Consider this an audit risk** — the planning artifacts that describe Phase 06's scope are not on the working tree at HEAD. Recommend the planner restore `.planning/REQUIREMENTS.md` and the v1.1 section of `.planning/ROADMAP.md` before Phase 07 starts. Flagged as a warning under "Anti-Patterns Found" below.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | (file missing) | Requirements doc not present on working tree at HEAD | Warning | Phase 06 implementation matches the v1.1 REQUIREMENTS that existed at commit `5bdbcd1`, but the file was removed by commit `00c4137`. Phase 07+ planners and reviewers cannot verify intent against an on-disk requirements file. **Action:** restore `.planning/REQUIREMENTS.md` (content available at `git show 5bdbcd1:.planning/REQUIREMENTS.md`). |
| `.planning/ROADMAP.md` | full file | v1.1 milestone section absent | Warning | The on-disk ROADMAP.md (32 lines) shows only v1.0 phases. The v1.1 section with Phase 06 success criteria (which this verification is checking against) is preserved at `git show 5bdbcd1:.planning/ROADMAP.md` but is not on disk. Consequence: Phase 06 executor and verifier had to recover Phase 06's Success Criteria from git history rather than the working tree. |
| `.planning/phases/06-foundations-preview-mode/` | directory | No PLAN.md, CONTEXT.md, RESEARCH.md, UI-SPEC.md, VALIDATION.md files on disk | Warning | The phase directory contains only the four SUMMARY.md files. The PLAN/CONTEXT/RESEARCH/UI-SPEC/VALIDATION files were referenced in commit messages (`docs(06): create phase plan`, `docs(06): UI design contract`, etc.) and are reachable via earlier git refs (e.g., `940e828`, `f8f3022`, `8c91807`, `da0b14c`), but are not present in the working tree. SUMMARY.md frontmatter cites these as the source of every locked decision. **Audit risk:** future re-verification cannot diff intent vs implementation without re-checking out the older planning commits. |
| `src/preview/`, `src/main.ts`, etc. | n/a | Debt markers (TBD/FIXME/XXX) | none | grep across phase 06 files: zero `TBD`/`FIXME`/`XXX` markers in modified source. The single `TODO(06-03):` marker from Plan 06-02 was correctly resolved and removed in commit `34b9fd1` (Plan 06-03). The current `// Phase 06 Plan 03 — preview path` comment at `src/main.ts:557` is a documentation marker, not unresolved debt. |
| `src/preview/`, `src/main.ts`, etc. | n/a | Stub/empty implementations | none | All preview functions have substantive bodies (>10 lines each); no `return null` stubs; no `console.log`-only handlers; no hardcoded `[]` return values that would short-circuit data flow. |

**Summary of anti-patterns:** Three planning-artifact warnings (REQUIREMENTS.md / ROADMAP v1.1 section / phase 06 PLAN-CONTEXT-RESEARCH-UI-SPEC-VALIDATION files all absent from the working tree). Zero source-code anti-patterns. Implementation is clean, but the planning paper trail is incomplete on disk — recoverable from git history.

### Human Verification Required

**Why the status is `human_needed` despite all 5 truths verifying as VERIFIED:** Phase 06 ships user-visible UI (sticky header, chips, action buttons, right-click menu, settings dropdown, post-action detach timing). Unit tests (`tests/preview/*` — 80 tests across 11 files) cover the wiring, decision flow, and DOM contracts at the component level, but cannot exercise:
- Real Obsidian Menu chrome / Lucide icon rendering
- Real `WorkspaceLeaf` lifecycle through `revealLeaf` + `detach`
- Real settings persistence across full plugin reload
- Real network failure surface
- Real shift-key event ordering with Obsidian's keyboard handling

The 8 human verification items in the frontmatter cover these. Items are organized into:
1. Right-click menu UX (1 item)
2. Default vs shift-click behavior (1 item)
3. Settings persistence across reload (1 item)
4. Start Problem creates note + detaches (1 item)
5. Open Problem opens existing note without overwriting (1 item)
6. Tab-reuse invariant (one preview leaf at a time) (1 item)
7. Command palette gating on lc-slug (1 item)
8. Network error fallback (1 item)

### Gaps Summary

**No code-side gaps.** The phase goal is met by the codebase:
- All 5 ROADMAP success criteria have direct implementation evidence and pass programmatic checks.
- All 8 declared requirements (FOUND-01,02,03 + PREVIEW-01,02,03,04,05) are implemented and traced to source.
- Live test gate at HEAD is fully green: lint 0/0, tests 731/3-skipped, build clean, bundle-size 168,953 bytes (33% of hard ceiling).

**Three planning-artifact warnings** (see Anti-Patterns Found) flag missing on-disk planning documentation that should be restored before Phase 07 starts. These do NOT block phase 06 from being considered shippable — the implementation matches the contract that was in force at execution time, and that contract is verifiable via git history.

---

_Verified: 2026-05-15T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
