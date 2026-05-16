# Roadmap: Obsidian LeetCode

## Milestones

- ✅ **v1.0 MVP** — Phases 01–05.5 (shipped 2026-05-14)
- 🚧 **v1.1 Contest, AI Coach, and Preview** — Phases 06–12 (planning 2026-05-15)

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

### v1.1 — Contest, AI Coach, and Preview

- [x] **Phase 06: Foundations + Preview Mode** — Lint bump, CI bundle gate, click-to-preview surface; refactor browser row-click into `previewRouter` for downstream reuse. (completed 2026-05-15)
- [x] **Phase 07: AI Provider Foundation** — `AIClient`, 4 provider adapters, `obsidianFetch(mode)`, AI settings panel, first-run disclosure modal scaffolding, test-connection. (completed 2026-05-16)
- [x] **Phase 08: AI Debug** — Streaming via `electron.net.fetch` with `requestUrl` fallback; `AIStreamModal`; `LastVerdictStore`; AI Debug button under `## Code` fence. (completed 2026-05-16)
- [ ] **Phase 09: AI ACed Review** — First AI vault write to new locked `## AI Review` H2; opt-in auto-run; idempotent on re-AC; daily cost cap; manual re-run command.
- [ ] **Phase 10: Contest (virtual + analysis)** — Past picker + Surprise me; persisted timer; 4 problem notes with `lc-contest-id`; status-bar UI; post-contest summary note.
- [ ] **Phase 11: AI Knowledge Graph** — 22-pattern classifier; cluster hub notes; lazy-on-AC migration of `## Techniques`; cross-cluster `## Related Variants`; flagged look-ahead edges.
- [ ] **Phase 12: Polish + Plugin-Store Re-submission** — Final README/network audit, version bump 1.1.0, manifest re-validation, GitHub release artifacts; opt-in batch migration UI as stretch goal.

## Phase Details

### Phase 06: Foundations + Preview Mode

**Goal**: User can preview a LeetCode problem without creating a note, and the codebase is lint-clean against the latest plugin-store ruleset with a CI bundle-size gate.
**Depends on**: v1.0 (Phase 05.5)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, PREVIEW-01, PREVIEW-02, PREVIEW-03, PREVIEW-04, PREVIEW-05
**Success Criteria** (what must be TRUE):

  1. User can right-click a problem in the browser and see a read-mode preview tab open with no `.md` file created in the vault.
  2. User can single-click a problem (default) to preview, or shift-click / use a settings toggle to fall back to v1.0 click-to-create note behavior.
  3. User sees difficulty + topic chips at the top of the preview tab and can click "Start Problem" (creates note via existing v1.0 pipeline) or "Open Problem" (jumps to existing note) depending on whether a note exists.
  4. CI fails the build when production bundle exceeds 500 KB; current bundle baseline is captured.
  5. `npm run lint` passes against `eslint-plugin-obsidianmd@^0.3.0` with all new commands using clean IDs (no plugin-id prefix, no "command" word).

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Foundations: bump eslint-plugin-obsidianmd to ^0.3.0, fix cascade lint, add Node bundle-size script (500 KB hard / 400 KB soft), bootstrap `.github/workflows/ci.yml`, foundations test stubs.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — `routeProblemClick` router on LeetCodePlugin + `previewClickBehavior` field on PluginData + new `Preview` settings section with Click-behavior dropdown; `ProblemBrowserView` row-click delegates to the router (shift-click = open).

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-03-PLAN.md — `ProblemPreviewView` ItemView (sticky header + chips + Start/Open buttons) with tab-reuse, right-click context menu, `open-in-preview` palette command, `toDetailCacheEntry` export, scoped CSS chrome.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-04-PLAN.md — README v1.1 docs: click-default change + click-behavior toggle + right-click + palette docs + Bundle size subsection (500 KB ceiling, 400 KB warn, verified baseline).

**UI hint**: yes

### Phase 07: AI Provider Foundation

**Goal**: User can configure an AI provider (Anthropic, OpenAI, OpenRouter, Ollama, or any OpenAI-compatible endpoint), test the connection, and acknowledge a one-time data-flow disclosure before any AI call is made.
**Depends on**: Phase 06
**Requirements**: AIPROV-01, AIPROV-02, AIPROV-03, AIPROV-04, AIPROV-05, AIPROV-06, AIPROV-07
**Success Criteria** (what must be TRUE):

  1. User can pick a provider from the AI settings tab, paste a key (masked input), set a base URL + model, and run "Test connection" with a clear success/failure Notice.
  2. User sees a one-time disclosure modal — listing active provider, base URL, and the exact data the plugin will send — before any AI call is issued.
  3. User can run the "Clear AI key" command from the palette and see the active provider's key wiped from `data.json`.
  4. README's "Network use" section enumerates every endpoint the plugin can contact (leetcode.com plus each AI provider's base URL).
  5. AI calls go through a single `obsidianFetch(mode)` adapter — `electron.net.fetch` for streaming when available, `requestUrl` otherwise — and all leetcode.com calls remain on `requestUrl` (v1.0 convention preserved absolutely).

**Plans**: 8 plans (gap-closure 07-07 added 2026-05-16; advisory cleanup 07-08 added 2026-05-15)

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Foundation types + PluginData schema + shape-guards + logger redaction (gates 02–06)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — `obsidianFetch(mode)` adapter + `AIClient` facade + 5 provider adapters + pricing table + bundle-size CI gate verification + LC-isolation regression (grep gate + runtime test)

**Wave 3** *(blocked on Waves 1–2 completion)*

- [x] 07-03-PLAN.md — AIClient onload wiring (Step 5.9) + AI Settings section (heading + active-provider dropdown + provider-conditional sub-form + masked password key input + Test connection placeholder button) + bundle ceiling 500 KB → 1 MB (Rule 3 deviation)

**Wave 4** *(blocked on Wave 3 completion — three parallel plans)*

- [x] 07-04-PLAN.md — Test connection wiring: `testActiveAIConnection` + `test-ai-connection` palette command + per-provider probe matrix unit tests (OpenAI/OpenRouter/Ollama/Anthropic/Custom-fallback)
- [x] 07-05-PLAN.md — `AIDisclosureModal` + `DISCLOSURE_BASE_COPY` shared constant + AIClient probe/invoke disclosure gate + `reset-ai-disclosures` palette command
- [x] 07-06-PLAN.md — `clear-ai-key` palette command + README ## Network usage section (5 AI provider hosts + leetcode.com + Authentication + Cost expectations stub) + README CI grep gate

**Wave 5** *(gap-closure — blocked on Waves 1–4 completion)*

- [x] 07-07-PLAN.md — Gap closure: CR-01 logger double-replacement + CR-02 probeCustom/probeOllama empty-baseUrl guards + WR-01 AIClient.invoke missing await + WR-02 DISCLOSURE_BASE_COPY freeze

**Wave 6** *(advisory cleanup — blocked on Wave 5 completion)*

- [x] 07-08-PLAN.md — Round-2 advisory cleanup: CR-01-A logger Bearer-no-token guard + WR-02-separator separator-preservation in redactString + WR-03-whitespace `!cfg.baseUrl?.trim()` symmetry across main.ts/probeCustom/probeOllama + WR-01-test-gap MockSettings.setProviderConfig + disclosure-gate persistence test

**UI hint**: yes

### Phase 08: AI Debug

**Goal**: User can trigger AI Debug from a button under `## Code`, see a streaming modal fill in real time (or a "Thinking…" indicator on fallback), and cancel mid-flight without leaving the modal in a bad state.
**Depends on**: Phase 07
**Requirements**: AIDBG-01, AIDBG-02, AIDBG-03
**Success Criteria** (what must be TRUE):

  1. User can click "AI: Debug" under the `## Code` fence and a modal opens with the prompt assembled from problem statement + `## Code` + last run/submit failure.
  2. User sees AI output progressively fill the modal when streaming is available; otherwise sees a "Thinking…" indicator with elapsed-time counter.
  3. User can click Cancel at any time during an in-flight AI request and the modal closes cleanly with no zombie network call.

**Plans**: 5 plans

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — AIRequest/AIResponse expansion + LastVerdictStore module + onVerdict orchestrator hook (gates 02–05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — AIClient.invokeStream + per-provider streamText/generateText adapters + AbortSignal propagation tests + electron.net.fetch signal-honoring stub

**Wave 3** *(blocked on Waves 1–2 completion)*

- [x] 08-03-PLAN.md — AIStreamModal (live debounced render + Thinking… counter + Cancel + Copy + Close) + buildDebugPrompt pure helper + withDebugBullet disclosure factory + 5 CSS selectors + manual UAT live-render verification gate

**Wave 4** *(blocked on Wave 3 completion — two parallel plans)*

- [x] 08-04-PLAN.md — Fence-row 3rd AI Debug button (Edit + Reading via shared factory) + ai-debug palette command + LeetCodePlugin.openAIDebug(slug) single entrypoint + LastVerdictStore field + orchestrator onVerdict callback registration
- [x] 08-05-PLAN.md — Verdict modal AI Debug button (conditional on kind ∈ {wa,tle,mle,re,ce}) + RunModal Surface 3 discovery (ships or collapses into Surface 2)

**UI hint**: yes

### Phase 09: AI ACed Review

**Goal**: When a user opts in, an Accepted submission triggers a single combined-dimensions AI review that lands as a new locked-heading `## AI Review` section inside the problem note, idempotent on re-AC and re-runnable on demand.
**Depends on**: Phase 07
**Requirements**: AIREV-01, AIREV-02, AIREV-03, AIREV-04, AIREV-05, AIREV-06
**Success Criteria** (what must be TRUE):

  1. User can toggle "Auto AI review on Accept" in settings (default OFF); when ON, an Accepted submission writes a 3-dimension review (Approach + Efficiency + Code Style) to a new `## AI Review` section.
  2. The `## AI Review` heading is in `LOCKED_HEADINGS`, and the review body is written via `app.vault.process` (never `cm.dispatch` or `vault.modify`).
  3. Re-AC of the same problem replaces the prior review block (idempotent — never appends), and AI-suggested code lands in a separate fence inside `## AI Review` (never auto-applied to `## Code`).
  4. User can run "Re-run AI review on current note" from the command palette and refresh a stale review on demand.
  5. User can configure a daily AI cost cap; once exceeded, AI Review and AI Debug return a Notice instead of calling the provider until the next day.

**Plans**: TBD

### Phase 10: Contest (virtual + analysis)

**Goal**: User can start a virtual past LeetCode contest (picked or "Surprise me"), solve 4 problem notes against a persistent timer, and finish with a summary note capturing solved/missed problems, per-problem time, score, and technique tags.
**Depends on**: Phase 06 (reuses `previewRouter`)
**Requirements**: CONTEST-01, CONTEST-02, CONTEST-03, CONTEST-04, CONTEST-05, CONTEST-06, CONTEST-07, CONTEST-08
**Success Criteria** (what must be TRUE):

  1. User can pick a past weekly or biweekly contest from a searchable list, or start a "Surprise me" contest that skips contests with deprecated/unfetchable problem slugs.
  2. User sees the contest timer (90 min weekly, 100 min biweekly) plus per-problem verdict status in the status bar; timer survives plugin reload via `Date.now()`-baseline persistence.
  3. User can pause and abort an active virtual contest at any time.
  4. All four contest problems are fetched as notes with `lc-contest-id` frontmatter linking them back to the contest.
  5. On contest end (timer expiry or user finish), a summary note is written to `LeetCode/Contests/{date}-{id}.md` with solved/missed list, per-problem time, score (using LC's `ContestQuestion.credit`), and technique tags; missed problems are auto-tagged `#revisit`.

**Plans**: TBD
**UI hint**: yes

### Phase 11: AI Knowledge Graph

**Goal**: AI maintains a 22-pattern cluster taxonomy across the user's solved problems — hub notes, difficulty-progression edges, cross-cluster Related Variants, and (flag-gated) look-ahead edges to unsolved problems — replacing v1.0's lc-tag Techniques wikilinks lazily as each note is touched on AC.
**Depends on**: Phase 07, Phase 09
**Requirements**: AIKG-01, AIKG-02, AIKG-03, AIKG-04, AIKG-05, AIKG-06, AIKG-07
**Success Criteria** (what must be TRUE):

  1. On Accepted submission, AI classifies the solution into one of 22 canonical patterns (or `OTHER` → user is prompted once and the choice persists); pattern hub notes at `LeetCode/Patterns/{Cluster}.md` list all member problems via wikilinks and difficulty-progression edges.
  2. The AC'd note's `## Techniques` section is rewritten lazily from v1.0 lc-tag wikilinks to AI-named pattern-cluster wikilinks (never batch on plugin load); legacy lc-tag wikilinks stay readable until the user prunes them.
  3. AI optionally adds a `## Related Variants` section (heading locked under `LOCKED_HEADINGS`) with up to 2 cross-cluster structural twins; same-cluster suggestions are suppressed.
  4. Look-ahead wikilinks to unsolved problems are emitted only when `featureFlags.lookAheadEdges` is enabled; every emitted slug is validated against the local problem index, unknowns dropped silently, capped at 2 per note.
  5. All knowledge-graph writes use `app.vault.process` (body) and `app.fileManager.processFrontMatter` (frontmatter); no `cm.dispatch` and no `vault.modify` anywhere in the AI write paths.

**Plans**: TBD

### Phase 12: Polish + Plugin-Store Re-submission

**Goal**: v1.1 ships as a re-reviewed community plugin release — manifest validated, README network/cost/AI sections audited, version bumped to 1.1.0, GitHub release artifacts attached; the deferred opt-in batch migration UI ships as a stretch goal if time allows.
**Depends on**: Phase 08, Phase 09, Phase 10, Phase 11
**Requirements**: (operational phase — release prep + AIKG-FUT-01 stretch goal; no v1.1 base requirements)
**Success Criteria** (what must be TRUE):

  1. README's "Network use" section enumerates every endpoint contacted in v1.1 (leetcode.com + every AI provider base URL); a "Cost expectations" subsection links provider pricing pages and gives a per-AC estimate.
  2. `manifest.json` version is bumped to 1.1.0, `minAppVersion` re-validated, and a GitHub release with `main.js` + `manifest.json` artifacts is published.
  3. `community-plugins.json` PR (or update if already merged) reflects the v1.1 description; lint + bundle-size CI gates remain green at the release commit.
  4. (Stretch) User can run an opt-in "Migrate v1.0 Techniques to clusters" command from the palette that batches 10 notes at a time, writes a backup file before each batch, skips the active note when it has unsaved changes, and resumes cleanly after a crash.

**Plans**: TBD

## Progress

| Phase                                    | Milestone | Plans Complete | Status      | Completed   |
| ---------------------------------------- | --------- | -------------- | ----------- | ----------- |
| 01. Plugin foundation                    | v1.0      | 6/6            | Complete    | 2026-05-14  |
| 02. Problems as notes                    | v1.0      | 8/8            | Complete    | 2026-05-14  |
| 03. Run / Submit                         | v1.0      | 7/7            | Complete    | 2026-05-14  |
| 04. Knowledge graph wiring               | v1.0      | 6/6            | Complete    | 2026-05-14  |
| 05. Polish & ship                        | v1.0      | 7/7            | Complete    | 2026-05-14  |
| 05.1. Edit-mode inline buttons           | v1.0      | 3/3            | Complete    | 2026-05-14  |
| 05.2. Pre-ship UX polish                 | v1.0      | 6/6            | Complete    | 2026-05-14  |
| 05.3. Language-aware editor              | v1.0      | 9/9            | Complete    | 2026-05-14  |
| 05.4. Run-verdict UX button polish       | v1.0      | 5/5            | Complete    | 2026-05-14  |
| 05.5. Section locking for lc-slug notes  | v1.0      | 4/4            | Complete    | 2026-05-14  |
| 06. Foundations + Preview Mode           | v1.1      | 4/4 | Complete    | 2026-05-15 |
| 07. AI Provider Foundation               | v1.1      | 8/8 | Complete    | 2026-05-16 |
| 08. AI Debug                             | v1.1      | 5/5 | Complete   | 2026-05-16 |
| 09. AI ACed Review                       | v1.1      | -/-            | Not Started | -           |
| 10. Contest (virtual + analysis)         | v1.1      | -/-            | Not Started | -           |
| 11. AI Knowledge Graph                   | v1.1      | -/-            | Not Started | -           |
| 12. Polish + Plugin-Store Re-submission  | v1.1      | -/-            | Not Started | -           |
