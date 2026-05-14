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
- [x] 05-07-PLAN.md — Version-triple consistency verify + production build + prerelease re-run + `0.1.0` tag push + GitHub release checkpoint (main.js + manifest.json + styles.css assets) + community-plugin PR checkpoint (`Add plugin: LeetCode` PR to `obsidianmd/obsidian-releases`) — D-23, D-28, POLISH-06
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

### Phase 05.5: Section Locking for lc-slug Notes (INSERTED)

**Goal:** Plugin-owned regions of `lc-slug` notes (`## Problem` entire region; `## Code` heading + fence opener + closing fence; `## Techniques` heading; `## Notes` heading) become read-only in Edit Mode via a CM6 `EditorState.changeFilter`, so user edits cannot accidentally land in regions the plugin overwrites on background-refresh / chevron-switch / on-AC. Lock is gated on `lc-slug` frontmatter (D-06) + Edit Mode (D-07); plugin-side dispatches with `userEvent: 'leetcode.*'` bypass the lock so the Phase 5.3 chevron switch keeps working (RESEARCH Pitfall 5).
**Requirements**: POLISH bracket — no formal REQ-ID assigned; behavioral anchors are CONTEXT decisions D-01..D-09
**Depends on:** Phase 5
**Plans:** 7/7 plans complete

Plans:
**Wave 0 — Test scaffolding** *(RED-state TDD; precondition for Wave 1)*
- [x] 05.5-01-PLAN.md — `tests/main/sectionLockExtension.test.ts` (>=13 RED it-blocks for D-01..D-09) + `tests/helpers/obsidian-stub.ts` `makeStateForLockTests` + `makeFakeTransaction` factories + `LOCKED_HEADINGS` SSoT export added to `src/notes/NoteTemplate.ts`

**Wave 1 — Implementation (GREEN-state)** *(blocked on Wave 0)*
- [x] 05.5-02-PLAN.md — `src/main/sectionLockExtension.ts` (NEW): `computeLockedRanges` pure helper + `buildSectionLockExtension` composing `EditorState.changeFilter` + `EditorView.atomicRanges`; honors `'leetcode.*'` userEvent bypass (Pitfall 5), uses `tr.startState` (Pitfall 2), reuses Phase 5.1 `findCodeFence` (Phase 5.3 D-13 SSoT). Plan 01 RED tests turn GREEN. (completed 2026-05-13)

**Wave 2 — Integration tests + wiring + polish + docs** *(parallel; both blocked on Wave 1; disjoint file sets)*
- [x] 05.5-03-PLAN.md — `tests/integration/sectionLockIntegration.test.ts` (NEW): chevron `'leetcode.lang-switch'` userEvent bypass survives lock; malformed-fence body editable (D-09 fallthrough); non-`lc-slug` notes universally unaffected (D-06); copy-to-code architectural assertion (`src/graph/copyToCode.ts` uses `vault.process` not `cm.dispatch` — bypass-by-design per RESEARCH Pitfall 6).
- [x] 05.5-04-PLAN.md — Wiring + visual-dim polish + docs: `src/main.ts` Step 6f-bis registers `buildSectionLockExtension(this)`; `src/main/sectionLockExtension.ts` adds `Decoration.mark` visual-dim layer (`.leetcode-section-locked`); `styles.css` adds `.cm-editor .leetcode-section-locked { background: var(--background-secondary); }` (no hardcoded colors); README documents section-lock UX under Phase 5 D-25 troubleshooting; CLAUDE.md §Conventions documents the `'leetcode.*'` userEvent bypass convention. Five-gate smoke (test/lint/tsc/build/bundle-size) green.

### Phase 05.4: Run Verdict UX + Button Polish (INSERTED)

**Goal**: Run-mode VerdictModal renders LC.com-style per-case results (header with verdict + runtime, always-on tab strip, three stacked Input/Output/Expected sections with theme-aware coloring, per-case PASS/FAIL chips, single error block on compile/runtime errors); RunModal sends one batched multi-case interpret_solution call; all non-CTA buttons across RunModal + VerdictModal + the inline ## Code action row port the .lc-fm__picker neutral-button polish; the language chevron renders a Lucide chevron-down glyph and reads as a select-input pill — all without touching the Submit verdict modal (D-14 LOCKED)
**Requirements**: POLISH-10 (INSERTED — Phase 5.4 is driven entirely by user decisions D-01..D-16 in 05.4-CONTEXT.md; no formal REQ-IDs assigned)
**Depends on**: Phase 5 (Run + Submit pipeline, RunModal, VerdictModal renderer/modal split), Phase 5.1 (inline ## Code action row), Phase 5.3 (.lc-fm__picker port to .leetcode-language-chevron, chevron widget)
**Success Criteria** (what must be TRUE):
  1. Clicking Run in RunModal triggers exactly one batched interpret_solution REST call whose data_input is all non-empty tabs joined by 
 (D-01)
  2. Per-case PASS/FAIL chips computed via per-index code_answer[i].trim() === expected_code_answer[i].trim() (D-04)
  3. Run-mode VerdictModal layout matches LC.com screenshots: title + runtime inline, always-on tab strip (even N=1), three stacked Input → Output → Expected sections (D-05)
  4. All colors via Obsidian semantic CSS vars only — no hardcoded hex/rgb in styles.css beyond the documented popover-shadow rgba exception (D-06)
  5. State-driven coloring: title var(--text-success) on AC / var(--text-error) on WA; Output value var(--text-error) only on per-case fail; Expected value var(--text-success) only on per-case fail; section labels always var(--text-muted); section surfaces always var(--background-secondary) (D-07)
  6. Input section parses metaData.params and renders name = value per param; falls back to raw input dump on missing/malformed metaData (D-08)
  7. All non-CTA buttons (RunModal tabs, +, ×, Reset, Verdict-modal case tabs) port the .lc-fm__picker token set verbatim (D-09)
  8. RunModal tabs and VerdictModal case tabs share visual shape, active highlight, and pill sizing (D-10)
  9. Footer hierarchy stays primary-right / secondary-left via existing space-between flex layout (D-11)
  10. Inline Run/Submit buttons port the new neutral-button polish (D-12a); chevron renders Lucide chevron-down via setIcon and reads as a select-input pill (D-12b)
  11. Run-mode header chrome is {verdict}  Runtime: N ms — no problem title (D-13)
  12. Submit verdict modal (renderSubmitVerdict) is bytes-identical to pre-5.4 (D-14 LOCKED)
  13. Run-mode compile/runtime errors render a single .leetcode-verdict-error-pre block with no tab strip (D-15)
  14. Run path has zero copy-failing-testcase buttons; Submit path keeps the existing button + on click appends the failing case as a new RunModal tab via openRunModalWithSeedAppended (D-16)
  15. No regression in Phase 5.1 / 5.2 / 5.3 surfaces; full vitest suite GREEN; bundle builds cleanly
**Plans**: 5 plans
Plans:
**Wave 0 — Test scaffolding + multi-case fixture spike** *(precondition for Wave 1; resolves A2 assumption)*
- [x] 05.4-01-PLAN.md — src/solve/runArity.ts pure helpers (parseMetaData / deriveArity / splitInput / joinCasesForRun / splitOutput) + live-captured tests/solve/fixtures/run-multi-case.json + RED-state scaffolding in tests/solve/RunModal.test.ts (D-01), tests/solve/verdictModalRenderer.test.ts (D-04/05/07/08/13/15/16), tests/main/languageChevronWidget.test.ts (D-12b drop literal ▼ at lines 76/84/92/100)

**Wave 1 — RunModal multi-case join** *(blocked on Wave 0; tiny single-file edit)*
- [x] 05.4-02-PLAN.md — src/solve/RunModal.ts: switch Run-button click handler from active-tab-only (Phase 5 D-07) to joinCasesForRun(this.cases, arity) (D-01); preserve textarea-sync + setTabs + try/finally close; D-01 RED test goes GREEN; D-14 + Plan 03/04 isolation guardrails held

**Wave 2 — Renderer expansion + CSS polish + chevron glyph swap (parallel; disjoint file sets)**
- [x] 05.4-03-PLAN.md — src/solve/verdictModalRenderer.ts: extend RenderVerdictArgs with optional metaData + joinedDataInput; rewrite renderRunResult per D-04/05/07/08/13/15/16 (always-on tab strip, per-case PASS/FAIL chips, three stacked sections with state classes, single error block on compile/runtime errors, no copy button on Run path); thread metaData + dataInput from main.ts → VerdictModal → renderer; renderSubmitVerdict + submit-body helpers byte-identical (D-14 LOCKED)
- [x] 05.4-04-PLAN.md — styles.css: port .lc-fm__picker tokens to all RunModal + VerdictModal neutral surfaces (D-09/D-10), add D-07 class-gated value-color rules + D-13 runtime line + D-08 input section + chip variants, polish inline .leetcode-code-action-run/-submit (D-12a), add chevron icon-span rules (D-12b); src/main/languageChevronWidget.ts: swap textContent ▼ literal for setIcon(span, chevron-down) + label-span

**Wave 3 — Live-smoke checkpoint + UAT sign-off** *(blocked on Waves 1-2; autonomous: false)*
- [x] 05.4-05-PLAN.md — Pre-flight automated gates (full vitest suite + build + lint + D-14 byte-diff + D-06 grep gate + A2 fixture provenance check) + 05.4-UAT.md skeleton with 11 sections (A pre-flight, B verdict layout, C chips, D input labeling, E theme parity, F multi-case spike, G error states, H Run-side copy absence, I Submit regression, J chevron polish, K cross-phase regression); human-verified live-smoke walkthrough in dev vault against LC.com screenshots; sign off 05.4-VALIDATION.md with nyquist_compliant: true

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

### Phase 5.3: Language-Aware Editor (INSERTED — REPLANNED 2026-05-11)
**Goal**: Fenced `## Code` blocks in Edit Mode render with native markdown syntax highlighting for the user's LC language, and a chevron dropdown LEFT of Phase 5.1's Run/Submit row lets users switch the LC language atomically (refetches starter code, rewrites fence opener tag + body, writes lc-language frontmatter — all in one Cmd-Z-revertible CM6 transaction)
**Depends on**: Phase 5.1 (CM6 editor extension infrastructure), Phase 5.2 (python3 → python Prism alias precedent — Phase 5.3 lifts the same trick to write-time)
**Requirements**: POLISH-09 (INSERTED — language support via write-time fence-tag remap + chevron switching UX. The original "IDE-grade auto-indentation + bracket handling" half is deferred to Phase 6.x per CONTEXT `<deferred>` Path A or Path B; documented as parked, not abandoned)
**Success Criteria** (what must be TRUE — replanned per CONTEXT.md domain block 2026-05-11):
  1. `## Code` fence content in Edit Mode (Live Preview + Source) renders with native markdown syntax highlighting for any LC language whose fence tag is markdown-recognized (after write-time remap: python3→python, golang→go, c→cpp; java/cpp/javascript/typescript/rust/python identity)
  2. Language chevron `[▼ Python]` appears inline with Phase 5.1's Run/Submit buttons (LEFT-aligned; chevron + Run + Submit share the .leetcode-code-actions flex row via space-between)
  3. Chevron is Edit-Mode only (D-09); Reading Mode shows ONLY Run + Submit
  4. Clicking the chevron opens a dropdown of 8 supported LC languages; selecting one destructively replaces the fence body with LC's canonical starter code, rewrites the fence opener tag, and writes lc-language frontmatter — single CM6 dispatch so Cmd-Z reverts the visible fence atomically
  5. Frontmatter cleanup: drop never-read lc-runtime-ms and lc-memory-mb (D-01/D-02); keep lc-language as the canonical LC-API source of truth (D-03)
  6. Reverts the failed D-10/D-11 implementation: deletes 3 source files + 3 test files, uninstalls 6 @codemirror/lang-* packs; bundle returns from 520 KB to ~155 KB (D-13)
  7. No regression in Phase 5.1 Run/Submit (Edit + Reading), Phase 5 reading-mode buttons, Phase 5.2's python3Highlighter Prism alias
  8. Note: ROADMAP success criteria 1 from the original draft (per-language indent rules) is EXPLICITLY DEFERRED — superseded by the replan; see CONTEXT.md `<deferred>` Path A/B for the future Phase 6.x work
**Plans**: 7 plans
Plans:
**Wave 0 — Revert failed Compartment-swap implementation (D-13)**
- [x] 05.3-01-PLAN.md — Delete codeFenceLanguageExtension.ts + languagePackRegistry.ts + whitespaceCopyIndent.ts + their tests; uninstall 6 @codemirror/lang-* packs; strip Step 6i imports + registration from src/main.ts; PRESERVE scripts/check-bundle-size.sh (D-13). Bundle drops 520 KB → ~149 KB

**Wave 1 — Frontmatter cleanup + write-time fence-tag remap** *(blocked on Wave 0)*
- [x] 05.3-02-PLAN.md — src/solve/languages.ts: add LC_LANG_FENCE_TAG + lcSlugToFenceTag + LC_LANG_DISPLAY_LABELS + LC_CHEVRON_LANG_ORDER (D-04, D-10); src/notes/NoteTemplate.ts: codeBlockFor calls lcSlugToFenceTag (D-04 write-time remap); applySolveTimeFrontmatter drops lc-runtime-ms / lc-memory-mb writes (D-01/D-02); src/graph/KnowledgeGraphWriter.ts: drop runtime/memory parsing + passing; update tests/graph/* fixtures

**Wave 2 — Chevron widget + atomic destructive switch** *(blocked on Wave 1)*
- [x] 05.3-03-PLAN.md — src/main/codeBlockButtonRow.ts: add opts.prefix?; src/main/languageChevronWidget.ts (NEW): DOM builder + dropdown click handler; src/main/codeActionsEditorExtension.ts: CodeActionsWidget.toDOM passes chevron factory (Edit-Mode only — D-09); src/main.ts: LeetCodePlugin.switchLanguage atomic-dispatch handler (CM6 dispatch FIRST, processFrontMatter SECOND — D-05/D-08); styles.css: chevron classes + space-between flex layout (D-06); two new vitest files

**Wave 3 — D-14 successor: live-smoke + bundle ship gate** *(blocked on Wave 2; autonomous: false)*
- [x] 05.3-04-PLAN.md — Rewrite 05.3-UAT.md as the chevron+remap checklist (~45 items across 9 sections); tighten scripts/check-bundle-size.sh to 250 KB hard / 200 KB warn (RESEARCH §Q7); update scripts/prerelease-check.sh Gate 12 legend; human-verified live-smoke against dev vault — D-14 LOCKED

**Wave 4 — Gap closure: chevron polish + copy-to-code lang sync** *(blocked on Wave 3; closes 7 verifier-prioritized gaps from Plan 04 UAT — gap_closure: true)*
- [x] 05.3-05-PLAN.md — Chevron polish (6 of 7 gaps): C6 Esc dismissal + G-CLICK-THROUGH wrapper-level pointerdown stopPropagation in src/main/languageChevronWidget.ts; G-LABEL-LAG metadataCache→languageRefreshEffect dispatch in src/main/codeActionsEditorExtension.ts; G-CHEVRON-STYLING port .lc-fm__picker rule to .leetcode-language-chevron in styles.css; G-LAYOUT widget anchor moved to closer-line.to with side: 1; G-PYTHON-LABEL python3→Python 3 in LC_LANG_DISPLAY_LABELS; G-UNDO-ORDER explicitly NOT addressed (verifier-accepted divergence)
- [x] 05.3-06-PLAN.md — G-COPY-TO-CODE-LANG-DRIFT: extended src/graph/copyToCode.ts to call app.fileManager.processFrontMatter after vault.process resolves (mirrors switchFenceLanguage Step C); same-slug + unknown-slug short-circuits; new tests/graph/copyToCode.langSync.test.ts (5 it-blocks); zero caller-surface changes — SubmissionDetailModal.performCopy unchanged (completed 2026-05-12)

**Wave 5 — Gap-closure live-smoke verification** *(blocked on Wave 4; autonomous: false; gap_closure: true)*
- [x] 05.3-07-PLAN.md — Re-run chevron-affected UAT subset (Sections C, D, F + new Copy-to-Code Sync-1..Sync-6 + Section A spot-check + light theme spot-check) after Plans 05/06 land; record results in 05.3-UAT.md preserving Plan 04 historical entries; flip 05.3-VERIFICATION.md from status: human_needed → status: verified; commit + 05.3-07-SUMMARY.md sign-off

**Wave 5b — Plan 07 polish-loop fixes** *(landed inline before Plan 07 UAT re-verification; gap_closure: true)*
- [x] 05.3-07-FIXES-SUMMARY.md — G-LAYOUT-V2: Edit-Mode action row now CM6 block widget below fence (Decoration.widget({ block: true, side: 1 }) at closer-fence-line.to); restores user-preferred below-fence placement AND remains immune to indent decoration of adjacent content lines (commit db2d075). G-COPY-MODAL-NOCLOSE: SubmissionDetailModal auto-dismisses on successful Copy-to-Code via explicit safeClose at click-handler level (success-only; modal stays open on error so user retains failure context — commit 3503255). Tests 567 / bundle 148 KB / D-09 Reading-Mode lock preserved.
