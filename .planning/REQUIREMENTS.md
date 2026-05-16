# Requirements: Obsidian LeetCode

**Defined:** 2026-05-15
**Milestone:** v1.1 — Contest, AI Coach, and Preview
**Core Value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.

> v1.0 requirements (validated, shipped) live in `.planning/milestones/v1.0-REQUIREMENTS.md`. This document is scoped to the v1.1 milestone.

---

## v1.1 Requirements

Requirements for the v1.1 milestone. Each maps to a roadmap phase.

### Preview (PREVIEW)

- [x] **PREVIEW-01**: User can right-click a problem in the browser to open it in a read-mode preview tab without creating a note.
- [x] **PREVIEW-02**: Single-click on a problem in the browser previews it (replaces v1.0's create-note default); a settings toggle restores v1.0 click-to-create behavior for upgraders.
- [x] **PREVIEW-03**: User can see difficulty and topic chips at the top of the preview tab.
- [x] **PREVIEW-04**: Preview shows a "Start Problem" button when no note exists for that problem; the button creates the note via the existing v1.0 note-creation pipeline.
- [x] **PREVIEW-05**: Preview shows an "Open Problem" button when a note already exists; the button jumps to the existing note instead of overwriting it.

### Contest (CONTEST)

- [ ] **CONTEST-01**: User can pick a past LeetCode contest from a searchable list of weekly + biweekly contests.
- [ ] **CONTEST-02**: User can start a "Surprise me" virtual contest that selects a random past contest, skipping any with deprecated/unfetchable problem slugs.
- [ ] **CONTEST-03**: User can run a virtual contest with the original 90-min (weekly) or 100-min (biweekly) timer; the timer survives plugin reloads using `Date.now()`-baseline persistence.
- [ ] **CONTEST-04**: All four contest problems are fetched as notes with `lc-contest-id` frontmatter linking them to the contest.
- [ ] **CONTEST-05**: User can see remaining time and per-problem verdict status while the contest is running (status-bar item).
- [ ] **CONTEST-06**: User can pause and abort an active virtual contest.
- [ ] **CONTEST-07**: On contest end (timer expiry or user finish), a summary note is written to `LeetCode/Contests/{date}-{id}.md` with solved/missed problems, per-problem time, score (using LC's per-question credit values), and technique tags.
- [ ] **CONTEST-08**: Missed problems in a contest are auto-tagged with `#revisit`.

### AI Debug (AIDBG)

- [x] **AIDBG-01**: User can trigger an "AI: Debug" action from a button under the `## Code` fence; the action sends the problem statement, current code, and last run/submit failure (if any) to the configured LLM.
- [x] **AIDBG-02**: AI Debug output appears in a modal that progressively fills as tokens stream when streaming is available, or shows a "Thinking…" indicator with elapsed time when streaming is not available.
- [x] **AIDBG-03**: User can cancel an in-flight AI Debug request at any time without leaving the modal in a bad state.

### AI Review (AIREV)

- [ ] **AIREV-01**: User can opt in to automatic AI review on Accepted submissions via a settings toggle (default OFF); when on, a single combined-dimensions LLM call (Approach + Efficiency + Code Style) writes a review.
- [ ] **AIREV-02**: AI review output is written to a new locked-heading `## AI Review` section inside the problem note via `app.vault.process` (never `cm.dispatch` or `vault.modify`); the heading is locked, the body remains editable.
- [ ] **AIREV-03**: AI review is idempotent on re-AC — re-running the review replaces the prior review block, never appends.
- [ ] **AIREV-04**: When AI proposes a different approach, the suggested code is rendered as a separate fence inside `## AI Review` (never auto-applied to `## Code`).
- [ ] **AIREV-05**: User can run "Re-run AI review on current note" from the command palette to refresh a stale review on demand.
- [ ] **AIREV-06**: User can configure a daily AI cost cap; once exceeded, AI Review and AI Debug return a Notice instead of calling the provider until the next day.

### AI Knowledge Graph (AIKG)

- [ ] **AIKG-01**: On Accepted submission, AI classifies the solution into one of 22 canonical patterns (18 NeetCode patterns + Prefix Sum + Monotonic Stack + Topological Sort + Union-Find); user is prompted once if AI returns `OTHER` and the choice persists.
- [ ] **AIKG-02**: AI maintains a hub note at `LeetCode/Patterns/{Cluster}.md` for each used pattern, listing all member problems via wikilinks.
- [ ] **AIKG-03**: When `KnowledgeGraphWriter.onAccepted` runs against a note, that note's `## Techniques` section is upgraded from v1.0 lc-tag-based wikilinks to AI-named pattern-cluster wikilinks (lazy-on-AC migration; never batch on plugin load).
- [ ] **AIKG-04**: AI maintains difficulty-progression edges (Easy → Medium → Hard on the same pattern) on each cluster hub note.
- [ ] **AIKG-05**: AI optionally adds a `## Related Variants` section inside the problem note when it identifies cross-cluster structural twins (capped at 2 per note); same-cluster suggestions are suppressed to avoid graph noise.
- [ ] **AIKG-06**: AI may emit look-ahead wikilinks to problems the user has not yet solved, when the AI judges them load-bearing for the pattern; emitted slugs are validated against the local problem index, unknowns dropped silently. Look-ahead edges are gated by a `featureFlags.lookAheadEdges` toggle so they can be disabled in field if UX is wrong.
- [ ] **AIKG-07**: All AI knowledge-graph writes use `app.vault.process` for body and `app.fileManager.processFrontMatter` for frontmatter; the new `## Related Variants` heading is locked under section-lock.

### AI Provider (AIPROV)

- [x] **AIPROV-01**: User can configure an active AI provider from a Settings tab supporting Anthropic, OpenAI, OpenRouter, and Ollama natively, plus any OpenAI-compatible custom endpoint via a base-URL field (covers Bedrock-via-LiteLLM-gateway, Azure-OpenAI shape, vLLM, LM Studio).
- [x] **AIPROV-02**: User pastes their own API key per provider; keys are stored in `data.json`, displayed only as a masked field, and the README discloses that storage is plain-text local-only.
- [x] **AIPROV-03**: User can run a "Test connection" action that issues a tiny round-trip call to the configured provider and reports success or the error message.
- [x] **AIPROV-04**: Before the first AI call ever made by the plugin, a one-time disclosure modal lists the active provider, base URL, and the exact data the plugin will send (problem text + `## Code` + last verdict + failing test, optionally `## Notes`); the modal must be acknowledged before the call proceeds.
- [x] **AIPROV-05**: AI calls use a single `obsidianFetch(mode)` adapter — `electron.net.fetch` for streaming AI calls when available, otherwise `requestUrl`; non-streaming AI calls always use `requestUrl`; all `leetcode.com` calls remain on `requestUrl` (v1.0 convention preserved absolutely).
- [x] **AIPROV-06**: User can run a "Clear AI key" command that wipes the active provider's key from `data.json`.
- [x] **AIPROV-07**: README's "Network use" section enumerates every endpoint the plugin contacts (leetcode.com plus each AI provider's base URL).

### Foundations (FOUND)

- [x] **FOUND-01**: `eslint-plugin-obsidianmd` is bumped to `^0.3.0` and the codebase passes the new ruleset (`no-plugin-as-component`, `commands/no-command-in-command-id`, `no-plugin-id-in-command-id`, `prefer-instanceof`, `vault/iterate`) before any v1.1 feature code lands.
- [x] **FOUND-02**: CI fails the build if the production bundle exceeds 500 KB; current size is captured as a baseline.
- [x] **FOUND-03**: All new commands use clean IDs (e.g. `ai-debug`, not `obsidian-leetcode:ai-debug`) per `eslint-plugin-obsidianmd@0.3.0` rules.

---

## Future Requirements

Tracked but deferred from v1.1.

### Out-of-band AI

- **AIPROV-FUT-01**: Native `@ai-sdk/amazon-bedrock` integration with browser-friendly SigV4 (deferred — LiteLLM/Bedrock Access Gateway path covers Bedrock for v1.1).
- **AIPROV-FUT-02**: Per-feature provider routing (separate provider for Debug vs Review vs KG).
- **AIPROV-FUT-03**: AI-generated apply-patch (Cursor-style diff applied to `## Code`).

### Knowledge graph extensions

- **AIKG-FUT-01**: Opt-in batch migration UI for v1.0 notes (one-shot rewrite of all `## Techniques` sections to cluster mode with backup writer + 10-batch + resume) — Phase 12 stretch goal.
- **AIKG-FUT-02**: Manual cluster override (user can set `lc-cluster` and AI respects it).
- **AIKG-FUT-03**: Cluster-color graph view.
- **AIKG-FUT-04**: AI auto-tagging of contest problems for review.

### Contest extensions

- **CONTEST-FUT-01**: Live contest participation (real-time submission, leaderboard).
- **CONTEST-FUT-02**: Difficulty-weighted "Surprise me".
- **CONTEST-FUT-03**: Upcoming contest schedule visibility (tab + countdown).

---

## Out of Scope

Explicitly excluded for v1.1.

| Feature | Reason |
|---------|--------|
| Live contest participation | Needs real-time leaderboards and contest-day submission throttling. v1.1 is virtual-only. |
| Plugin-hosted AI proxy | Telemetry surface, hosting cost, plugin-store risk. v1.1 is BYO key only. |
| OS keychain key storage | Theatre — same-machine encryption keys offer no real defense. Plain `data.json` parallels v1.0 cookie posture. |
| Native Bedrock SigV4 in v1.1 | SigV4 in Electron renderer is phase-sized risk; LiteLLM/Bedrock Access Gateway covers users today. |
| Auto-debug on every WA | Cost surprise + anti-feature; debug must remain user-triggered. |
| Auto-apply AI suggested code | Trust boundary; AI suggestions stay in `## AI Review`, never overwrite `## Code`. |
| Pre-create stub notes for look-ahead wikilinks | Pollutes vault; native dangling-wikilink rendering is the right primitive. |
| Auto-rewrite v1.0 `## Techniques` on plugin update | Risks clobbering user edits at scale; lazy-on-AC migration is mandatory default. |
| Free-form AI cluster names | Cluster-name drift fragments the graph; AI picks from a frozen 22-pattern taxonomy. |
| Same-cluster Related Variants | Redundant with cluster hub note; only cross-cluster twins justify the edge. |
| `>2` look-ahead edges per note | Look-ahead value collapses past 2; cap is hard. |
| AI rewriting `## Notes` | `## Notes` is the user's reflection space — never AI-touched. |
| Telemetry / usage analytics | No telemetry policy is non-negotiable for plugin-store. |
| Mobile support | Inherits v1.0 desktop-only constraint (Electron BrowserWindow, electron.net.fetch dependencies). |
| leetcode.cn | Inherits v1.0 .com-only constraint. |
| Spaced repetition / review scheduling | Inherits v1.0 deferral; cluster hubs + #revisit auto-tag from contest cover the v1.1 review surface. |

---

## Traceability

Filled by the roadmapper.

| Requirement | Phase    | Status  |
|-------------|----------|---------|
| FOUND-01    | Phase 06 | Complete |
| FOUND-02    | Phase 06 | Complete |
| FOUND-03    | Phase 06 | Complete |
| PREVIEW-01  | Phase 06 | Complete |
| PREVIEW-02  | Phase 06 | Complete |
| PREVIEW-03  | Phase 06 | Complete |
| PREVIEW-04  | Phase 06 | Complete |
| PREVIEW-05  | Phase 06 | Complete |
| AIPROV-01   | Phase 07 | Complete |
| AIPROV-02   | Phase 07 | Complete |
| AIPROV-03   | Phase 07 | Complete |
| AIPROV-04   | Phase 07 | Complete |
| AIPROV-05   | Phase 07 | Complete |
| AIPROV-06   | Phase 07 | Complete |
| AIPROV-07   | Phase 07 | Complete |
| AIDBG-01    | Phase 08 | Complete |
| AIDBG-02    | Phase 08 | Complete |
| AIDBG-03    | Phase 08 | Complete |
| AIREV-01    | Phase 09 | Pending |
| AIREV-02    | Phase 09 | Pending |
| AIREV-03    | Phase 09 | Pending |
| AIREV-04    | Phase 09 | Pending |
| AIREV-05    | Phase 09 | Pending |
| AIREV-06    | Phase 09 | Pending |
| CONTEST-01  | Phase 10 | Pending |
| CONTEST-02  | Phase 10 | Pending |
| CONTEST-03  | Phase 10 | Pending |
| CONTEST-04  | Phase 10 | Pending |
| CONTEST-05  | Phase 10 | Pending |
| CONTEST-06  | Phase 10 | Pending |
| CONTEST-07  | Phase 10 | Pending |
| CONTEST-08  | Phase 10 | Pending |
| AIKG-01     | Phase 11 | Pending |
| AIKG-02     | Phase 11 | Pending |
| AIKG-03     | Phase 11 | Pending |
| AIKG-04     | Phase 11 | Pending |
| AIKG-05     | Phase 11 | Pending |
| AIKG-06     | Phase 11 | Pending |
| AIKG-07     | Phase 11 | Pending |

**Coverage:**

- v1.1 requirements: 39 total
- Mapped to phases: 39 ✓
- Unmapped: 0

---

*Requirements defined: 2026-05-15*
*Last updated: 2026-05-15 — roadmap derivation: all 39 requirements mapped to Phases 06–11 (Phase 12 is operational/release-prep with no v1.1 base reqs)*
