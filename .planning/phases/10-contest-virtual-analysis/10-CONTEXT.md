# Phase 10: Contest (virtual + analysis) - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Virtual contest mode. User picks a past LC contest (or "Surprise me" for random), solves 4 problems under a timed sandbox experience with pause/abort, and receives a summary note with scoring and AI-generated performance analysis on contest end. Problem notes are created from ephemeral contest state into canonical vault locations on contest end.

Requirements covered: **CONTEST-01, CONTEST-02, CONTEST-03, CONTEST-04, CONTEST-05, CONTEST-06, CONTEST-07, CONTEST-08** (8 of v1.1's 39). Additionally ships an AI contest analysis feature (holistic debrief + brief per-problem commentary) that extends the contest surface with AI coaching.

</domain>

<decisions>
## Implementation Decisions

### A. Contest picker surface — tab toggle in ProblemBrowserView

- **D-01: Contests live in the same sidebar tab as problems.** ProblemBrowserView gains a top-level toggle/tab to switch between "Problems" and "Contests" modes. No new view type registration needed.
- **D-02: Contest list fetched live from LC API on tab open, cached in PluginData.** Same caching pattern as `problemIndex` — refresh on explicit pull or after 24h TTL.
- **D-03: "Surprise me" via both button (in contest tab) and palette command.** Reuse the existing random button pattern — in Contests mode it picks a random contest instead of a random problem.
- **D-04: Clicking a contest opens a preview pane (contest details, problems, duration).** User sees the contest info before committing. A "Start Contest" button in the preview begins the session. Reuses the Phase 06 preview pattern.

### B. Timer + pause/abort UX

- **D-05: Timer displayed in a sticky header bar within the contest tab.** Not a global status bar item — timer is only visible when the contest tab is active. Shows remaining time + per-problem verdict badges.
- **D-06: Pause stops the clock.** Paused time doesn't count toward the total. Total elapsed = sum of running segments only. Summary note records actual solving time.
- **D-07: Abort requires confirmation modal.** Shows "Are you sure? You've solved X/4 problems, Y min remaining." On confirm: problem notes created, summary note written with "(aborted)" marker and time-at-abort.
- **D-08: Timer persisted in PluginData with Date.now() baseline.** Shape: `{ contestId, startedAt: epoch, pausedDuration: ms, isPaused, pausedAt: epoch | null, problems[] }`. On reload: remaining = duration - (now - startedAt - pausedDuration). Per CONTEST-03.

### C. Problem note creation flow — ephemeral sandbox

- **D-09: Contest solving is ephemeral — no .md file during the contest.** Problem code lives in PluginData (keyed by slug, part of contest session state) during the contest. Survives reload natively. No vault clutter during the session.
- **D-10: Problem details fetched upfront on contest start, note created on open.** All 4 problem details fetched and cached at start (no mid-contest network dependency). The editing surface is created only when user navigates to that problem. Planner decides the exact editing surface (dedicated ItemView or hidden scratch file).
- **D-11: Canonical notes written on contest end for all attempted problems.** Even unsolved problems get a note with their last code attempt. Batch write on end.
- **D-12: Contest notes land in a subfolder.** Path: `{problemsFolder}/Contests/{contest-slug}/`. Still uses NoteWriter pipeline. `lc-contest-id` frontmatter links each note to the contest.
- **D-13: Merge strategy for previously-solved problems.** If a canonical note already exists for a problem:
  - Contest got AC → overwrite `## Code` with the contest solution + update `lc-contest-id` frontmatter.
  - Contest did NOT AC → don't touch the existing note. The failed attempt is captured in the summary note only.
  - This protects prior good solutions while recording genuine re-solves.

### D. Summary note shape

- **D-14: Rich frontmatter on summary note.** Fields: `lc-contest-id`, `lc-contest-type` (weekly/biweekly), `date`, `duration` (actual solving time), `score`, `solved-count`, `problems` (list of slugs). Enables Dataview queries across contests.
- **D-15: Summary note location:** `{problemsFolder}/Contests/{date}-{contest-id}.md` (per CONTEST-07).
- **D-16: Score uses LC's per-question credit values.** Fetch point values per problem from the contest API and sum only solved problems. Authentic scoring.
- **D-17: Body sections:** `## Results` (table: problem, difficulty, verdict, time-to-solve, points) → `## AI Analysis` (locked heading) → `## Notes` (empty user section for reflection).
- **D-18: Missed problems auto-tagged with `#revisit`.** Per CONTEST-08. Tag applied to the problem note's frontmatter tags on contest end.

### E. AI contest analysis

- **D-19: Full debrief — holistic patterns + brief per-problem commentary.** AI reviews all 4 problems: time allocation patterns, technique gaps, what to practice next. Per-problem commentary kept to 1-2 sentences max (not a full code review — Phase 09 AIREV handles that on individual notes).
- **D-20: Triggered both automatically (on contest end) and via manual palette command.** Auto-run gated by a separate settings toggle `autoAIContestAnalysis` (default OFF). Manual command: `generate-contest-analysis` (works on any summary note with `lc-contest-id` frontmatter).
- **D-21: `## AI Analysis` is a locked heading in the summary note.** Idempotent — re-running the manual command replaces the content. Same `vault.process` write pattern as Phase 09's `## AI Review`. Placed after `## Results`, before `## Notes`.
- **D-22: Disclosure gate + cost ledger apply.** Same disclosure pattern as Phase 09 — `withContestAnalysisBullet(DISCLOSURE_BASE_COPY)` factory. Sends: contest metadata, per-problem summary (slug + difficulty + verdict + time + user's code). `## Notes` is NEVER sent.

### Claude's Discretion

- Exact editing surface for contest solving (dedicated ItemView pane vs hidden scratch .md in `.obsidian/plugins/` — both survive reload; planner picks based on complexity and CM6 editor requirements).
- Contest list API discovery — which LC GraphQL query or REST endpoint returns past contest metadata (researcher investigates).
- How the ProblemBrowserView toggle is implemented (tabs, dropdown, segmented control) — planner picks based on existing UI patterns.
- `maxTokens` for the contest analysis AI call.
- Whether "Surprise me" validates that all 4 problems are still fetchable before starting, or handles unfetchable problems gracefully mid-flow.
- Exact contest preview pane implementation (reuse ProblemPreviewView with a contest state, or a new modal).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project state
- `.planning/PROJECT.md` — v1.1 milestone scope, vault-write conventions.
- `.planning/REQUIREMENTS.md` — CONTEST-01..08 wording. Out-of-Scope rows: live contest participation, difficulty-weighted Surprise me, upcoming contest schedule.
- `.planning/ROADMAP.md` — Phase 10 goal + success criteria.
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time, deferred items (CONTEST-FUT-01..03).

### v1.1 prior phase context (load-bearing precedents)
- `.planning/phases/09-ai-aced-review/09-CONTEXT.md` — AI vault write pattern (`## AI Review` locked heading, `vault.process`, disclosure extension via composition, idempotent replacement). Phase 10's `## AI Analysis` follows this pattern exactly.
- `.planning/phases/08-ai-debug/08-CONTEXT.md` — AIStreamModal for streaming AI output, `buildDebugPrompt` as prompt-assembly precedent, `DISCLOSURE_BASE_COPY` extension contract.

### Project conventions (from `CLAUDE.md`)
- All HTTP to `leetcode.com` via `requestUrl` — absolute, no exceptions.
- All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden.
- `LOCKED_HEADINGS` lives in `src/notes/NoteTemplate.ts:74`; Phase 10 extends with `## AI Analysis` (on summary notes only — not problem notes).
- Plugin ID prefix and "command" word forbidden in command IDs.
- Frontmatter additions require a documented production reader (v1.0 lesson). Phase 10 adds `lc-contest-id` to problem notes and rich metadata to summary notes.

### v1.1 code references (read before editing)
- `src/main.ts:64` — `ProblemBrowserView` import + registration. Phase 10 extends this view with contest tab.
- `src/browse/ProblemBrowserView.ts` — existing browser view. Phase 10 adds a toggle between problems/contests mode.
- `src/preview/previewRouter.ts` — `openOrReusePreview` reuse pattern. Phase 10 may reuse for contest preview.
- `src/preview/ProblemPreviewView.ts` — ItemView pattern precedent for preview.
- `src/notes/NoteWriter.ts` — note creation pipeline. Phase 10 calls with `lc-contest-id` parameter.
- `src/notes/NoteTemplate.ts:74` — `LOCKED_HEADINGS` tuple. Phase 10 extends (for summary notes).
- `src/settings/SettingsStore.ts:50` — `PluginData` interface. Phase 10 adds contest session state + `autoAIContestAnalysis` toggle.
- `src/solve/pollingOrchestrator.ts` — `registerInterval` pattern for timer-like scheduled work.
- `src/ai/AIClient.ts` — `invokeStream(req)` for AI contest analysis.
- `src/ai/AIStreamModal.ts` — streaming modal for manual contest analysis re-run.
- `src/ai/disclosure.ts` — `DISCLOSURE_BASE_COPY` + `withDebugBullet`/`withReviewBullet` factories. Phase 10 adds `withContestAnalysisBullet`.
- `src/ai/types.ts` — `AIRequest`, `prettyName()`. Phase 10 follows established patterns.
- `src/settings/SettingsStore.ts:844` — `addCostLedger(usd)`. Phase 10 calls after AI analysis completes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ProblemBrowserView`** — the sidebar view being extended with a contest tab. Already has row-click delegation, search, filter, and random button patterns.
- **`openOrReusePreview` / `previewRouter`** — tab-reuse pattern for previewing content without creating notes. Candidate for contest preview.
- **`NoteWriter.openOrCreateProblemNote`** — full note creation pipeline. Phase 10 passes `lc-contest-id` as an additional option.
- **`pollingOrchestrator.ts` timer pattern** — `registerInterval` usage for scheduled callbacks that auto-cancel on plugin unload. Contest timer follows this.
- **`AIClient.invokeStream`** — streaming AI seam for contest analysis. Disclosure gate fires automatically.
- **`AIStreamModal`** — reused for manual contest analysis generation.
- **`withDebugBullet` / `withReviewBullet` composition** — Phase 10 adds `withContestAnalysisBullet` following the same pattern.
- **`SettingsStore.addCostLedger(usd)`** — cost ledger for AI calls.

### Established Patterns
- **PluginData shape-guard extension** — new fields get shape-guarded defaults at load time (Phase 07–09 precedent).
- **`vault.process` for all vault writes** (CF-06) — Phase 10 follows exclusively for summary + problem notes.
- **`LOCKED_HEADINGS` tuple extension** — add `## AI Analysis` for summary notes.
- **`editorCheckCallback` guard on palette commands** — frontmatter check gates commands to relevant note types.
- **Disclosure extension via composition** — `withContestAnalysisBullet` mirrors `withReviewBullet`.
- **ItemView + `registerView` pattern** — established in Phase 06 (ProblemPreviewView). Contest editing surface may follow this.

### Integration Points
- **`ProblemBrowserView`** — gains problems/contests toggle. Contest mode shows contest list, random button picks contests.
- **`PluginData` shape** — gains contest session state (timer, problems, code buffers) + `autoAIContestAnalysis: boolean`.
- **`NoteTemplate.ts`** — may gain contest-specific template helpers or a `LOCKED_HEADINGS` extension for summary notes.
- **`main.ts` onload** — registers contest-related commands (start-random-contest, generate-contest-analysis, pause-contest, abort-contest).

</code_context>

<specifics>
## Specific Ideas

- The user wants a sandbox experience for contests — no permanent notes during solving, just ephemeral state that persists across reloads via PluginData.
- ProblemBrowserView gains a tab toggle (not a separate view) to switch between Problems and Contests.
- The existing random button in the browser view is reused — in contest mode it picks a random contest.
- Contest preview (before starting) mirrors the Phase 06 problem preview pattern.
- AI analysis is a "coach's debrief" — holistic + 1-2 sentence per-problem commentary. Not a replacement for per-problem AIREV.
- Score uses LC's authentic per-question credit values, not a simple solved count.

</specifics>

<deferred>
## Deferred Ideas

- **Random-problem button bypasses previewRouter (bug).** Currently the random button in ProblemBrowserView creates a note directly instead of routing through `previewRouter` for a preview first. Should be fixed but not in Phase 10 scope — file as a separate bug/quick-task.
- **CONTEST-FUT-01 (live participation)** — real-time submission during live contests. v1.2 candidate.
- **CONTEST-FUT-02 (difficulty-weighted Surprise me)** — weight random selection by difficulty. v1.2 candidate.
- **CONTEST-FUT-03 (upcoming contest schedule)** — show upcoming contests with countdown. v1.2 candidate.
- **Per-feature AI provider routing (AIPROV-FUT-02)** — contest analysis uses the same active provider as Debug/Review.

</deferred>

---

*Phase: 10-contest-virtual-analysis*
*Context gathered: 2026-05-18*
