# Roadmap: Obsidian LeetCode

## Overview

Five phases build the plugin from a runnable scaffold to a community-store-ready release. Each phase delivers one coherent, independently verifiable capability. Phase 1 establishes the hard technical gates (HTTP adapter, auth, ESLint, `isDesktopOnly`) that everything downstream depends on. Phase 2 locks the note schema — filenames, frontmatter fields, and tag namespace — before any user vault is touched, because retroactive changes are breaking. Phase 3 implements the highest-risk work (undocumented REST endpoints, exponential-backoff polling, all verdict types). Phase 4 wires the Obsidian-native value: atomic vault write-back on Accepted submission and `[[Technique]]` backlinks that populate the knowledge graph. Phase 5 completes the settings UI, error handling UX, and the store-submission checklist.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Plugin Foundation** - Scaffold, ESLint, `isDesktopOnly` manifest, `requestUrl` adapter, auth service (BrowserWindow + paste), settings tab skeleton, problem-list view
- [x] **Phase 2: Problems as Notes** - Problem detail fetch, HTML→MD conversion, `{id}-{slug}.md` creation, frontmatter schema lock, `lc/` tag import, user-section preservation (completed 2026-05-08)
- [ ] **Phase 3: Run & Submit** - Hand-rolled REST for `interpret_solution`/`submit`/`check`, exponential-backoff polling, all verdict types, verdict modal, custom test input
- [ ] **Phase 4: Knowledge Graph Wiring** - On-Accepted: atomic solution append, frontmatter update, `[[Technique]]` backlinks, technique stub notes, opt-out setting
- [ ] **Phase 5: Polish & Ship** - Settings UI completeness, graceful error handling UX, README with screenshots + network disclosure, LICENSE, community plugin store PR

## Phase Details

### Phase 1: Plugin Foundation
**Goal**: The plugin installs, authenticates with LeetCode, and can display a problem list — with zero ESLint Required violations, correct manifest flags, and all HTTP routed through `requestUrl`
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, BROWSE-01, BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05
**Success Criteria** (what must be TRUE):
  1. User can install the plugin on desktop Obsidian 1.5+ and enable/disable it without crashes; plugin does not appear in the mobile plugin list
  2. User can log in via an embedded BrowserWindow that captures `LEETCODE_SESSION` and `csrftoken`, or by pasting a session cookie as a fallback — both paths persist credentials across restarts
  3. User can open the problem browser via ribbon icon or command palette and see a paginated, searchable, filterable problem list without Obsidian freezing
  4. Session expiry is detected (GraphQL `response.errors` check) and the user is prompted to re-authenticate rather than seeing a crash or silent failure
  5. `npm run lint` passes with zero `eslint-plugin-obsidianmd` Required violations; all Electron imports are confined to `auth/BrowserWindowLogin.ts`
**Plans**: 6 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold (manifest, tsconfig, esbuild, ESLint, vitest) + shared types + logger/errors
- [x] 01-02-PLAN.md — Throttle + requestUrl fetcher + LeetCodeClient + SettingsStore
- [x] 01-03-PLAN.md — BrowserWindow login + AuthService + CookiePasteModal + cookie-parse
- [x] 01-04-PLAN.md — Settings tab UI (Authentication + Notes sections, D-09 layout)
- [x] 01-05-PLAN.md — ProblemListService (pagination + search + filter)
- [x] 01-06-PLAN.md — ProblemBrowserView + main.ts wiring + human smoke checkpoint
**UI hint**: yes

### Phase 2: Problems as Notes
**Goal**: Opening a problem creates a permanent, offline-readable vault note with a locked frontmatter schema, `lc/`-namespaced tags, and user-authored content that survives plugin-triggered updates
**Depends on**: Phase 1
**Requirements**: NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06, NOTE-07, NOTE-08, NOTE-09
**Success Criteria** (what must be TRUE):
  1. Selecting a problem creates `{folder}/{id}-{slug}.md` (e.g. `LeetCode/0001-two-sum.md`) with fully populated `lc-` prefixed frontmatter written via `processFrontMatter()`
  2. Problem statement is rendered as Markdown under `## Problem` using `turndown` — no `innerHTML` anywhere in the codebase
  3. LC difficulty tag appears as `lc/easy`, `lc/medium`, `lc/hard` on every note; user-added personal tags in `tags[]` are never overwritten across note regeneration. (Topic tags like `lc/array`, `lc/dynamic-programming` are deferred to Phase 4 per D-05.)
  4. Previously-fetched problem notes load and display their full content without any network access
  5. Frontmatter field names, filename scheme, and tag namespace are defined once in `NoteTemplate.ts` and not duplicated elsewhere — this schema is locked for the remainder of v1
**Plans**: 5 plans (+ 3 gap-closure plans)
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Wave 0 test infrastructure (21 vitest files + 2 mock helpers + 3 LC HTML fixtures + grep gate script + manifest.json minAppVersion bump to 1.10.0)
- [x] 02-02-PLAN.md — Pure utilities: NoteTemplate.ts (schema SSoT), htmlToMarkdown.ts (turndown wrapper), HeadingRegion.ts (## Problem region rewriter)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-03-PLAN.md — Vault-touching: NoteWriter.ts orchestrator + BaseFile.ts (lazy LeetCode.base ship)
- [x] 02-04-PLAN.md — State extensions: LeetCodeClient.getProblemDetail + SettingsStore.problemDetails cache

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-05-PLAN.md — Wiring: NoteWriter registered in LeetCodePlugin + ProblemBrowserView row-click handlers

**Wave 4 — Gap closure** *(from UAT.md; `/gsd-execute-phase 2 --gaps-only`)*
- [x] 02-06-PLAN.md — GAP-2a: plumb IndexedProblem.status → lc-status on first frontmatter write
- [x] 02-07-PLAN.md — GAP-2b + GAP-2c: turndown lc-sup / lc-sub / lc-example-block rules
- [x] 02-08-PLAN.md — GAP-6: reverse-engineer Bases YAML + v0.1.0 migration Notice (checkpoint)

### Phase 3: Run & Submit
**Goal**: Users can run code against test cases and submit to LeetCode's judge from within the note, seeing accurate verdicts for all outcome types with no UI blocking and no aggressive polling
**Depends on**: Phase 2
**Requirements**: SOLVE-01, SOLVE-02, SOLVE-03, SOLVE-04, SOLVE-05, SOLVE-06, SOLVE-07, SOLVE-08, SOLVE-09
**Success Criteria** (what must be TRUE):
  1. Starter code for the user's chosen language is inserted into the note on first open; user writes code directly in the native Obsidian code block
  2. "Run Code" command posts to `/interpret_solution/` and displays the output against sample or custom test cases in a verdict modal
  3. "Submit" command posts to `/submit/`, polls `/check/{id}` with 1s→2s→4s→8s backoff, and displays the verdict — covering all six outcome types: AC, WA, TLE, MLE, CE, and RE
  4. Verdict modal shows status, runtime, memory, and any error output (wrong-answer test case, compile error message, etc.)
  5. Code sent to LC is always the current note content at submit time — no stale snapshots; plugin warns if no fenced code block is found
**Plans**: 7 plans
Plans:
**Wave 0 — Test scaffolding + fixture capture**
- [x] 03-01-PLAN.md — Test infrastructure: 11 vitest stubs (incl. starterCodeInjector.forced.test.ts) + 2 mocks + 8 live-captured LC verdict fixtures (D-31) + requestUrl redirect spike (Pitfall 3 / A2)

**Wave 1 — Pure utilities + primitives + REST** *(parallel, no file overlap)*
- [x] 03-02-PLAN.md — Pure utilities: codeExtractor, languages, CaseRegion (full inter-case preservation), statusMap, starterCodeInjector (idempotent + forceInjectCodeSection) + NoteTemplate `## Code` / `## Custom Tests` schema extension
- [x] 03-03-PLAN.md — Primitives + infrastructure: SubmissionError hierarchy + src/solve/types.ts discriminated union + throttledRequestUrl helper + SettingsStore internalQuestionId extension + LeetCodeClient questionId passthrough
- [x] 03-04-PLAN.md — REST wrappers: leetcodeRest.ts (interpretSolution / submitSolution / checkSubmission) with status-code + HTML-sniff session-expiry defense

**Wave 2 — Orchestrator + Modals** *(parallel, blocked on Wave 1)*
- [x] 03-05-PLAN.md — SubmissionOrchestrator (single-flight + D-21 backoff + D-23 abort + D-26 error cap + D-27 session expiry) + pollingLoop.ts (with plugin.registerInterval propagation)
- [x] 03-06-PLAN.md — VerdictModal (8 render states) + CustomTestModal (tabbed) + customTestStore + styles.css additions

**Wave 3 — Wiring + smoke checkpoint** *(blocked on Wave 2)*
- [x] 03-07-PLAN.md — main.ts 5-command registration + NoteWriter retrofit hook + ProblemBrowserView confirm + human smoke test against live LC (33 checks)

### Phase 4: Knowledge Graph Wiring
**Goal**: An Accepted submission atomically updates the problem note with solve-time frontmatter, `[[Technique]]` backlinks, and stub technique notes — turning every solve into a knowledge-graph citizen — without overwriting any user edits; `LeetCode: View past submissions` exposes LC's submission history with a read-only detail viewer and opt-in Copy-to-Code
**Depends on**: Phase 3
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05
**Success Criteria** (what must be TRUE):
  1. GRAPH-01 (revised per CONTEXT D-01): NO `## Solution` heading is created. The user's code always lives in the Phase 3 `## Code` fenced block. Past-submission history lives on LC's servers, surfaced via the new `LeetCode: View past submissions` command (picker modal + read-only detail viewer with a Copy-to-Code affordance that writes to `## Code` via `vault.process()` after a confirm gate on non-empty blocks)
  2. Frontmatter fields `lc-status`, `lc-solved-date` (ISO-8601 local-tz), `lc-runtime-ms`, `lc-memory-mb`, and `lc-language` are updated via `fileManager.processFrontMatter()` and visible in the note immediately after acceptance
  3. `## Techniques` section contains `[[Two Pointers]]`-style wikilinks (one per LC topic tag); the graph view shows edges from the problem note to technique notes
  4. Stub technique notes are created in the configured `{problemsFolder}/Techniques/` folder on first reference and are never overwritten once created
  5. User can disable auto-backlink creation (`autoBacklinksEnabled` flag in data.json; Phase 5 ships the Settings UI toggle); frontmatter fields + `lc/{topic-slug}` tags still write when opt-out is engaged (D-20)
**Plans**: 6 plans
Plans:
**Wave 0**
- [x] 04-01-PLAN.md — Wave 0 test infrastructure (15 vitest stubs + 2 mocks + 5 live-captured LC submission fixtures + grep-gate extension to src/graph/)

**Wave 1** *(blocked on Wave 0)*
- [x] 04-02-PLAN.md — Pure utilities: dateFormat.ts (ISO-8601 local-tz), mergeTechniquesSection.ts (list-item union-merge), StubNoteCreator.ts + NoteTemplate extensions (TECHNIQUES_HEADING_LINE, buildTechniquesBlock, buildTechniqueStubBody, buildTechniqueFilename) + SettingsStore extensions (autoBacklinksEnabled, topicTags cache, getTechniquesFolder)

**Wave 2** *(blocked on Wave 1 — Plan 03 extends NoteTemplate after Plan 02 locks the SSoT, sequential file ownership)*
- [x] 04-03-PLAN.md — REST client + orchestrator: submissionHistoryClient.ts (D-27..D-29) + KnowledgeGraphWriter.ts (D-08 single-entry + D-09 3-step pipeline + D-23 AC gate + D-24 re-AC + D-19 non-atomic stubs + D-20 opt-out) + applyFrontmatter solve-time extension

**Wave 3** *(blocked on Wave 2)*
- [x] 04-04-PLAN.md — Modals + Copy-to-Code: SubmissionPickerModal, SubmissionDetailModal (MarkdownRenderer + Component lifecycle, Pitfall 7), ConfirmOverwriteModal (Cancel default-focus), copyToCode.ts (reuses forceInjectCodeSection) + styles.css .leetcode-submissions-* scopes

**Wave 4** *(blocked on Wave 3)*
- [x] 04-05-PLAN.md — Wiring: main.ts KnowledgeGraphWriter singleton + `view-past-submissions` command registration + on-AC hook inside submitFromActive
- [ ] 04-06-PLAN.md — Human smoke test against live LC (49 checks across 8 sections: AC graph write, picker, Copy-to-Code, opt-out, session-expiry, non-AC skip, visual/a11y, Phase 1-3 regression)
**UI hint**: yes

### Phase 5: Polish & Ship
**Goal**: The plugin is ready for the Obsidian community plugin store: complete settings UI, all error states surface meaningful messages, README and LICENSE are present, the submission checklist passes, and the Run UX is reworked into a single ephemeral flow (pin-to-note affordance rejected by user during discussion — tabs are ephemeral-only)
**Depends on**: Phase 4
**Requirements**: POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05, POLISH-06, POLISH-07
**Success Criteria** (what must be TRUE):
  1. Settings tab exposes all required controls: auth status/login/logout, vault folder, technique folder override, default language, auto-backlink toggle, and manual cookie paste field
  2. All error conditions — LC offline, 429 rate-limited, expired session, and network timeout — surface a user-readable `Notice` message rather than a silent failure or unhandled rejection
  3. `npm run lint` passes with zero Required violations; the bundle contains no telemetry, no remote code evaluation, and no `innerHTML` with untrusted content
  4. README includes install instructions, usage walkthrough, screenshots, and a network usage disclosure ("This plugin communicates with leetcode.com to fetch problems and submit solutions")
  5. Repository has a LICENSE file and a GitHub release with `main.js` + `manifest.json` attached; a PR is opened to `obsidianmd/obsidian-releases` following community plugin guidelines
  6. Run UX rework (POLISH-07): replace the two `Run code (sample)` + `Run code (custom input)` commands with a single unified `Run` command. Its modal pre-fills tabs from the problem's `exampleTestcases` on first open, preserves in-memory edits across re-opens while any leaf shows the note, and wipes state when every leaf closes. Reset button re-seeds from examples. No persistence to `## Custom Tests`; legacy sections ignored. Clicking Run sends only the active tab's input.
**Plans**: 7 plans
Plans:
**Wave 0 — Test scaffolding** *(precondition for Waves 1-5)*
- [x] 05-01-PLAN.md — Wave 0 test infrastructure (10 failing vitest stubs + fakeSettingsStore extension + fakeWorkspace mock helper; Nyquist-compliant verify targets for every Waves 1-5 task)

**Wave 1 — Settings UI completeness** *(blocked on Wave 0)*
- [x] 05-02-PLAN.md — SettingsStore `techniquesFolderOverride` field + override-aware `getTechniquesFolder()` + SettingsTab `Knowledge Graph` section (override text field + auto-backlink toggle) — D-14, D-15, D-16, D-17, D-32

**Wave 2 — Error handling UX** *(blocked on Wave 0; parallel with Wave 1 via disjoint files)*
- [x] 05-03-PLAN.md — `isNetworkError` + `TimeoutError` helpers; throttle layer 429 single-retry + 10s Promise.race timeout (polling carve-out via `{ timeoutMs: 20_000 }`); `SessionExpiredNotice` DocumentFragment helper + 9-call-site migration; D-22 command-palette error routing in main.ts — D-18, D-19, D-20, D-21, D-22

**Wave 3 — Run UX rewrite** *(blocked on Waves 0, 1, 2)*
- [x] 05-04-PLAN.md — `ephemeralTabStore.ts` (layout-change + active-leaf-change reconcile; Pitfall 2 corrected from `file-close`) + `RunModal.ts` (rewrite of CustomTestModal) + main.ts delete `run-sample` + `run-custom` and add single `run` command; delete `customTestStore.ts` + `CaseRegion.ts` + `CustomTestModal.ts` — D-01..D-10

**Wave 4 — Reading-mode buttons + Phase 4 cosmetic polish** *(blocked on Waves 0, 4)*
- [x] 05-05-PLAN.md — `CodeBlockActionProcessor.ts` (MarkdownPostProcessor with lc-slug gate + idempotent button injection) + SubmissionDetailModal MarkdownRenderer.render + Component lifecycle rewrite + CSS for `.leetcode-code-actions` + CE chip orange override + light-mode focus ring — D-11, D-12, D-13, D-29, D-30, D-31

**Wave 5a — README + LICENSE + prerelease script** *(blocked on Waves 2, 3, 4, 5)*
- [x] 05-06-PLAN.md — LICENSE (MIT) + `scripts/prerelease-check.sh` (12 mechanical gates) + README with 10 D-25 sections + 4 screenshot checkpoint (human-verify) + `versions.json` correction to `1.10.0` — D-23, D-24, D-25, D-26, D-27

**Wave 5b — Community-store submission** *(blocked on Plan 06)*
- [ ] 05-07-PLAN.md — Version-triple consistency verify + production build + prerelease re-run + `0.1.0` tag push + GitHub release checkpoint (main.js + manifest.json + styles.css assets) + community-plugin PR checkpoint (`Add plugin: LeetCode` PR to `obsidianmd/obsidian-releases`) — D-23, D-28, POLISH-06
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Foundation | 0/TBD | Not started | - |
| 2. Problems as Notes | 5/5 | Complete   | 2026-05-08 |
| 3. Run & Submit | 0/7 | Planned — Wave 0/1/2/3 | - |
| 4. Knowledge Graph Wiring | 0/TBD | Not started | - |
| 5. Polish & Ship | 0/7 | Planned — Wave 0/1/2/3/4/5a/5b | - |

### Phase 5.1: Edit-mode Inline Run/Submit Buttons (INSERTED)
**Goal**: Run/Submit buttons are anchored inline directly below the `## Code` fenced block in Edit Mode (Source + Live Preview) without layout corruption, so users can submit without switching to Reading Mode during their normal coding flow
**Depends on**: Phase 5 (specifically 05-05 reading-mode buttons, which this mirrors for edit mode)
**Requirements**: POLISH-07 (gap-closure from 05-UAT G1; reading-mode buttons shipped in 05-05, edit-mode path was deferred and escalated to ship-blocker during 05-05 live smoke)
**Success Criteria** (what must be TRUE):
  1. In Live Preview and Source Mode on an `lc-slug` note, Run + Submit buttons appear inline directly below the closing fence of the `## Code` block — anchored to that specific block, scrolling with the note content
  2. Buttons are NOT a floating/corner toolbar; they live inline with the document and remain positioned correctly through edits to surrounding content
  3. Clicking dispatches `runFromActive` / `submitFromActive` (same command handlers already used by the reading-mode path)
  4. No layout corruption in either edit mode: no inserted whitespace, no duplicate widgets, no shifted heading positions, no large blank rectangles between existing blocks
  5. Reading Mode buttons from 05-05 continue to work unchanged — no regression
  6. Renders correctly in both light and dark themes
**Plans**: 3 plans
Plans:
**Wave 0 — Test scaffolding** *(RED-state unit tests; precondition for Wave 1)*
- [x] 05.1-01-PLAN.md — `tests/main/codeActionsEditorExtension.test.ts` (≥10 RED unit tests: findCodeFence pure-function cases, buildDecorations lc-slug gate + fence targeting, CodeActionsWidget.eq() idempotency, click-dispatch to runFromActive/submitFromActive) + `tests/helpers/obsidian-stub.ts` CM6 additions (`editorInfoField`, `editorLivePreviewField`)

**Wave 1 — Implementation** *(blocked on Wave 0)*
- [x] 05.1-02-PLAN.md — `src/main/codeActionsEditorExtension.ts` (CM6 `StateField<DecorationSet>` with `Decoration.widget({ side: 1 })` — NEVER `block: true`; regex-over-`state.doc` fence detection; `editorInfoField` + `metadataCache` frontmatter gate; `WidgetType.eq()` idempotency; reuses `buildCodeBlockButtonRow` helper verbatim) + `main.ts` onload Step 6f registration — D-01..D-09

**Wave 2 — D-10 LOCKED live-smoke checkpoint** *(blocked on Wave 1; autonomous: false)*
- [x] 05.1-03-PLAN.md — Human-verified live-smoke in dev vault: 12-item checklist covering Live Preview + Source Mode + Reading-Mode regression + light/dark themes + gate correctness + idempotency + click dispatch. Contingent `styles.css` tweak (`.cm-editor .leetcode-code-actions { margin-top: 8px }`) runs ONLY if live smoke surfaces misalignment — D-10, D-11, D-12

### Phase 5.2: Pre-ship UX Polish (INSERTED)
**Goal**: Ship a batch of small UX fixes and polish items surfaced during Phase 5.1 live smoke, so the 0.1.0 release presents a coherent, self-consistent user experience out of the box
**Depends on**: Phase 5.1 (inherits the shipped Edit-mode affordance + Reading-mode buttons)
**Requirements**: POLISH-08 (INSERTED — batch UX polish pre-release)
**Success Criteria** (what must be TRUE):
  1. Settings: Status row and Login/Logout button merged into one row — button sits on the right side of the status block
  2. Problem filter: `language` field removed from FilterModal field options (not applicable yet — filter UI stays, language filtering deferred to a future phase)
  3. Problem filter: `premium` field accepts multiple values (`non-premium`, `premium`, or both) instead of a single-value toggle
  4. Filter badge on ProblemBrowserView reflects actual rule count (0 for auto-populated defaults that shouldn't count; today it incorrectly shows "3")
  5. `## Code` fence auto-insertion: when a user opens an `lc-slug` note without a `## Code` section, the plugin auto-inserts the starter template silently. The existing "Insert starter code" command is replaced by a "Reset code" command that restores the starter template on demand
  6. Past Submissions picker: AC chip shows "Accepted" text label; WA chip shows "Wrong Answer" label — both currently render as empty pills
  7. Copy-to-Code: overwrite confirmation modal removed — Copy overwrites the `## Code` fence silently (matches reading-mode Run/Submit buttons which already operate silently)
  8. Default language list in Settings matches LeetCode's official language list (add/remove languages to exactly mirror LC's submission language dropdown)
  9. `python3` language tag in code fences produces proper syntax highlighting (currently python3-tagged blocks show unhighlighted plain text)
**Plans**: 6 plans
Plans:
**Wave 0 — Test scaffolding** *(RED-state unit tests; precondition for Wave 1)*
- [x] 05.2-01-PLAN.md — 8 vitest RED shells covering items 2/3/4/5/7/8/9 + workspace.on('file-open') obsidian-stub extension

**Wave 1 — Implementation (parallel)** *(3 plans, zero files_modified overlap)*
- [x] 05.2-02-PLAN.md — Settings row merge (D-01) + pinned LC 2026 language list (D-12) in src/settings/SettingsTab.ts
- [x] 05.2-03-PLAN.md — Filter UX cluster: remove `language` field (D-02), premium multi-value (D-03), badge auto-default exclusion (D-04) across FilterModal + SettingsStore + ProblemListService + ProblemBrowserView
- [x] 05.2-04-PLAN.md — Starter-code + Copy-to-Code cluster: remove Insert starter code command (D-05), add workspace.on('file-open') auto-insert hook (D-06), add Reset code command with ConfirmOverwriteModal gate (D-07, D-08, D-11), silent Copy-to-Code (D-10) in src/main.ts + src/graph/SubmissionDetailModal.ts

**Wave 2 — CSS contrast + python3 alias** *(blocked on 05.2-04 due to shared src/main.ts)*
- [x] 05.2-05-PLAN.md — AC/WA chip contrast fix via color-mix (D-09) + new src/main/python3Highlighter.ts MarkdownPostProcessor (D-13) wired in src/main.ts

**Wave 3 — Live-smoke checkpoint** *(blocked on Waves 1+2; autonomous: false)*
- [x] 05.2-06-PLAN.md — Human-verified live-smoke: 12-item checklist covering all 9 items + 3 regression checks (Phase 5.1 edit-mode buttons, Phase 5 reading-mode buttons, full npm test suite)

### Phase 5.3: Language-Aware Editor (INSERTED)
**Goal**: Fenced `## Code` blocks in Edit Mode get IDE-grade auto-indentation, bracket/paren handling, and language-aware editing behavior, so typing a multi-line solution feels like a real editor instead of a raw text field
**Depends on**: Phase 5.1 (CM6 editor extension infrastructure), Phase 5.2 (python3 highlighting support — language-pack wiring is the foundation 5.3 builds on)
**Requirements**: POLISH-09 (INSERTED — auto-indentation + language support for code fences)
**Success Criteria** (what must be TRUE):
  1. Pressing Enter inside a `## Code` fence on an `lc-slug` note triggers language-aware indentation: new line inherits the previous line's leading whitespace and adds/removes a level based on the language's grammar rules (Java/C++/JS: `{` bumps in, `}` dedents; Python: `:` bumps in, `else`/`elif`/`except`/`finally` dedent)
  2. Supported languages match LC's core set: Python (and python3), Java, C++, JavaScript, TypeScript, Go, Rust, C, C# (exact list locked during discuss-phase)
  3. Unsupported languages fall back cleanly to whitespace-copy (no crash, no disabled editor, just matches previous line's indentation without grammar awareness)
  4. Auto-indentation only fires inside the `## Code` fence on `lc-slug` notes — never in prose, never in other fences (parity with Phase 5.1's scoping)
  5. Reading Mode + Source Mode behavior unchanged — indentation applies only in Live Preview where the CM6 editor is active (same surface as Phase 5.1)
  6. Bundle size impact documented and accepted; language packs are lazy-loaded or conditionally bundled to keep the baseline install under a reasonable cap (exact number locked during discuss-phase)
  7. No regression in Phase 5.1 edit-mode Run/Submit buttons or Phase 5 reading-mode buttons
**Plans**: 4 plans
Plans:
**Wave 1 — Test scaffolding + dependency install + baseline** *(RED-state unit tests; precondition for Wave 2)*
- [ ] 05.3-01-PLAN.md — Install 6 @codemirror/lang-* packs + 3 RED-state vitest files (codeFenceLanguageExtension, languagePackRegistry, whitespaceCopyIndent) + A1 peer-dep verify + pre-install main.js baseline

**Wave 2 — Implementation (registry + fallback + extension + main.ts wiring)** *(blocked on Wave 1)*
- [ ] 05.3-02-PLAN.md — src/main/{languagePackRegistry,whitespaceCopyIndent,codeFenceLanguageExtension}.ts + src/main.ts Step 6i registerEditorExtension + optional warmDefaultPack — D-01..D-13, D-16; per-view Compartment swap (D-11 primary per RESEARCH Pitfall 1 + A4)

**Wave 3 — Bundle-size gate (D-09 / D-15)** *(blocked on Wave 2)*
- [ ] 05.3-03-PLAN.md — scripts/check-bundle-size.sh (700 KB hard / 600 KB warn) + scripts/prerelease-check.sh Gate 12 delegation + A8 + A9 close-out

**Wave 4 — D-14 LOCKED human-verified live-smoke** *(blocked on Wave 3; autonomous: false)*
- [ ] 05.3-04-PLAN.md — 44-item live-smoke: 8 supported langs + unsupported fallback + lc-slug gate + Source/Live-Preview parity + Phase 5.1/5.2/5 regression + light/dark theme + bundle-size ship gate — D-14
