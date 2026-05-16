---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Contest, AI Coach, and Preview
status: executing
stopped_at: Completed 07-04-PLAN.md
last_updated: "2026-05-16T00:35:48.060Z"
last_activity: 2026-05-16 -- Completed 07-04 (Test connection wiring + probe-matrix tests + 200-char Notice truncation)
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 12
  completed_plans: 10
  percent: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-15 — v1.1 milestone opened)

**Core value:** Every LeetCode problem you solve becomes a first-class note in your Obsidian vault — tagged, linked, and discoverable — so practice builds a knowledge graph instead of scattered code files.
**Current focus:** Phase 07 — AI Provider Foundation

## Current Position

Phase: 07 (AI Provider Foundation) — EXECUTING
Plan: 5 of 6
Status: 07-04 complete; 07-05 next (disclosure modal + AIClient.probe/invoke wrapping)
Last activity: 2026-05-16 -- Completed 07-04 (Test connection wiring)

### Resume path

1. Execute `.planning/phases/07-ai-provider-foundation/07-05-PLAN.md` (disclosure gate).
2. Plan 07-05 wraps `AIClient.probe()` and `AIClient.invoke()` with the disclosure modal (`requireDisclosure(provider, cfg)` interception); the wrapping happens at the AIClient seam so all callers — including Plan 07-04's `testActiveAIConnection` — inherit the protection without caller-side changes. The modal's "I understand — continue" button is the only new `setCta()` invocation in v1.1.
3. Plan 07-06 (palette commands + README) adds `clear-ai-key` and `reset-ai-disclosures` palette commands and updates the README "Network use" section.

### v1.1 Phase Map

| Phase | Goal Summary                                                                 | Depends on        | v1.1 Reqs |
|-------|------------------------------------------------------------------------------|-------------------|-----------|
| 06    | Foundations + Preview Mode (lint bump, CI gate, click-to-preview)            | v1.0 (05.5)       | 8         |
| 07    | AI Provider Foundation (4 providers + custom URL, settings, disclosure)      | 06                | 7         |
| 08    | AI Debug (streaming modal + cancel)                                          | 07                | 3         |
| 09    | AI ACed Review (locked `## AI Review` H2, opt-in, idempotent)                | 07                | 6         |
| 10    | Contest virtual mode (timer + 4 notes + summary)                             | 06 (previewRouter)| 8         |
| 11    | AI Knowledge Graph (22-pattern hubs, lazy migration, look-ahead)             | 07, 09            | 7         |
| 12    | Polish + plugin-store re-submission (release artifacts, stretch migration UI)| 08, 09, 10, 11    | 0         |

Coverage: 39/39 v1.1 requirements mapped ✓

### Parallelization opportunities

- Phase 09 ‖ Phase 10 — both modify `main.ts` onload but in distinct sections.
- Phase 11 sub-components (`PatternClusterEngine`, `ClusterHubWriter`, `RelatedVariantsWriter`) can be built in parallel given the engine's `classify()` output as contract.

### Sequential dependencies (must serialize)

- 06 → 10 (Contest reuses `previewRouter`)
- 07 → 08 → 09 → 11 (AI dependency chain)
- 09 → 11 (cluster engine reuses review prompt + write infrastructure)

## Performance Metrics

**Velocity (v1.0 cumulative):**

- Total plans completed: 65 across v1.0
- v1.1 plans completed: 4 (07-01, 07-02, 07-03, 07-04)
- v1.1 phases completed: 0/7

**v1.0 plan-level history archived in `.planning/milestones/v1.0-ROADMAP.md`.**

**v1.1 plan execution metrics:**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 07    | 01   | 7m 38s   | 3     | 7     |
| 07    | 02   | 11m 6s   | 3     | 14    |
| 07    | 03   | 12m 46s  | 2     | 9     |
| 07    | 04   | 32min    | 2     | 12    |

## Accumulated Context

### Roadmap Evolution

- 2026-05-14 — v1.0 MVP shipped (Phases 01–05.5).
- 2026-05-15 — v1.1 milestone opened: Contest, AI Coach, and Preview.
- 2026-05-15 — v1.1 ROADMAP.md drafted with Phases 06–12; 39/39 requirements mapped to phases.

### Decisions (v1.1-relevant carry-overs from v1.0)

- All HTTP via `requestUrl` for leetcode.com — absolute, no exception in v1.1.
- All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter) — never `vault.modify`.
- Plugin-internal CM6 dispatches use `userEvent: 'leetcode.*'` to bypass section-lock changeFilter.
- `LOCKED_HEADINGS` lives in `src/notes/NoteTemplate.ts`; v1.1 will extend it with `## AI Review` (Phase 09) and `## Related Variants` (Phase 11).
- Frontmatter additions require a documented production reader (lesson from v1.0 dropped `lc-solved-date`/`lc-runtime-ms`/`lc-memory-mb`).
- **07-01:** AIRequest/AIResponse ship as empty-but-named interfaces (lint-disabled inline) — named brand types stabilize Plan 07-02's AIClient.invoke signature; Phase 08 expands shape.
- **07-01:** BEARER_VALUE_PATTERN runs BEFORE SECRET_VALUE_PATTERN in `redactString` so `Authorization: Bearer sk-xyz` redacts at both layers (no secret survival).
- **07-01:** `sanitizeAICostLedger` resets BOTH date AND usdToday together when either is malformed — corrupt ledger cannot carry stale spend under a bogus date.
- **07-02:** Bundle landed at 168.9 KB / 331.1 KB headroom under 500 KB ceiling — no dynamic-import escape hatch triggered (well below 450 KB threshold). Static imports as planned.
- **07-02:** obsidianFetch loads electron via the activeWindow.require / module.require / __webpack_require__ shim (mirroring src/auth/BrowserWindowLogin.ts:nodeRequire) — literal `require('electron')` call site forbidden by `@typescript-eslint/no-require-imports`.
- **07-02:** Both obsidianFetch branches enforce `credentials: 'omit'` (T-07-02 cookie-leak mitigation); stream branch overrides caller's `'include'` at runtime even if explicitly set.
- **07-02:** AIPROV-05 LC-isolation gate wired as `prelint` hook (fail-fast before eslint), backed by 4 fs-walk runtime tests as layer-2 defense against silent CI gate disablement.
- **07-02:** OpenRouter slug uses DOT not dash (`anthropic/claude-haiku-4.5`) — locked by regression test (RESEARCH Assumption A4).
- **07-02:** resolveAdapter ships exhaustive switch with Phase-08-stub `invoke` throwing `'AIClient.invoke: Phase 08 wires the real call'` — surfaces forgotten wiring loudly during Phase 08.
- **07-03:** Bundle ceiling raised from 500 KB → 1 MB (Rule 3 architectural deviation). esbuild's CJS-no-splitting profile (mandatory for Obsidian plugins) makes `await import()` ineffective as an escape hatch — the AI SDK lands on the bundle graph as soon as `AIClient` is constructed at `main.ts:onload`. Production bundle landed at 826.6 KB after 07-03; mainstream Obsidian AI plugins ship at similar sizes (Smart Connections ~1.2 MB, Obsidian-Copilot ~800 KB). Soft warn proportionally bumped to 900 KB.
- **07-03:** Plan 07-02's reported 168.9 KB bundle was a false-green — the AI SDK was tree-shaken because no entry path imported it. Future planners measuring bundle deltas for not-yet-wired modules MUST treat tree-shaken measurements as advisory; the real cost manifests only after entry-point wiring lands.
- **07-03:** AIClient construction site is `main.ts:onload` Step 5.9 — AFTER Step 5.8 (EphemeralTabStore) and BEFORE Step 6a (registerView). Constructor takes only SettingsStore; no eager network; no `onunload` teardown required.
- **07-03:** Test connection button onClick is a PLACEHOLDER Notice with text `'Test connection: wiring lands in Plan 07-04'` — locked grep target so 07-04 can replace the handler body cleanly without disturbing surrounding rows.
- **07-03:** AI Settings section uses `.addOption(value, label)` chain (NOT `.addOptions(Record)`) so the locked dropdown order from 07-UI-SPEC ('' / anthropic / openai / openrouter / ollama / custom) is preserved across browsers — matches Phase 06 PREVIEW-02 dropdown precedent.
- **07-03:** `obsidianmd/ui/sentence-case` brand allowlist extended in `eslint.config.mts` for AI provider names + locked URL/host substrings + `Plan 07-04` grep marker. Two cases (`'— Not configured —'` em-dashes, lowercase URL `https://your-host.example.com/v1` placeholder) require inline `// eslint-disable-next-line` with a 07-UI-SPEC reference.
- **07-04:** `prettyName(p: AIProvider): string` is exported from `src/ai/types.ts` (NOT colocated in SettingsTab.ts as Plan 07-03 had it). Single source of truth for verbatim brand strings consumed by both the Settings sub-form AND the Notice copy in `main.ts:testActiveAIConnection`. Future surfaces (Phase 08 disclosure body, Phase 11 cluster header) MUST import this helper rather than redeclare the switch.
- **07-04:** `aiProbeInflight: Map<AIProvider, Promise<ProbeResult>>` on the LeetCodePlugin instance is the single-in-flight gate per provider. Settings button + palette command both call `testActiveAIConnection()` which manages the Map; concurrent clicks during an in-flight probe are no-ops. Cost-based Availability mitigation (T-07-04-debounce) — Anthropic 1-token chat is ~$0.0001/click but the gate prevents accidental duplicate billing on rapid clicks.
- **07-04:** Empty-key guard fires ONLY for `anthropic`/`openai`/`openrouter` — Ollama and Custom may legitimately have empty keys (default Ollama install + no-auth Custom backends), so they fall through to probe. Locked by 6 separate test cases in `tests/ai/probe-debounce.test.ts`.
- **07-04:** Settings button onClick wraps the testActiveAIConnection() call in try/finally with button-label flip to `'Testing...'` + `setDisabled(true)`; palette command does NOT flip a label (the Notice IS the feedback). The debounce Map handles cross-surface concurrency.
- **07-04:** All Notice copy verbatim from 07-UI-SPEC §"Notice copy"; failure Notice combines provider prefix + vendor message and truncates the COMBINED string to 200 chars (CONTEXT decision E semantics) — NOT just the vendor message portion. This guarantees the visible Notice never exceeds 200 chars total.
- **07-04:** Probe path is uncoupled from disclosure: `testActiveAIConnection` calls `aiClient.probe(provider)` directly. Plan 07-05 wraps the disclosure gate at the `AIClient.probe` seam, NOT at the caller — all callers (07-04 testActiveAIConnection AND any Phase 08 invoker) inherit the disclosure protection without 07-04-side changes.
- **07-04:** Bundle landed at 827.6 KB (+1.0 KB from Plan 07-03 baseline 826.6 KB) — pure code delta from the testActiveAIConnection method + palette command + prettyName export + Settings handler glue. No new runtime deps. Headroom under 1 MB ceiling: 172.4 KB.
- **07-04:** `tests/ai/probe-debounce.test.ts` uses `vi.mock('obsidian', async () => ({ ...await import('../helpers/obsidian-stub'), Notice: <captureClass> }))` so dynamic `import('../../src/main')` succeeds — main.ts pulls FilterModal -> obsidian.Modal at module evaluation; a bare-bones inline mock missing Modal trips an unhandled rejection during the second test case onward. Concurrent-debounce test pre-resolves the LeetCodePlugin import and captures the prototype method into an explicitly-bound wrapper (avoids `@typescript-eslint/unbound-method`).

### v1.1 Decisions Locked at Roadmap Time

- **Phase numbering continues from v1.0** — next phase is 06, NOT a reset to 1.
- **Bedrock native SigV4 is NOT in v1.1 scope** — covered by `@ai-sdk/openai-compatible` + LiteLLM/Bedrock-Access-Gateway path under AIPROV-01's "custom base URL" field. Native integration deferred to AIPROV-FUT-01 (v1.2 candidate).
- **Look-ahead edges (AIKG-06) are feature-flagged** behind `featureFlags.lookAheadEdges` so they can be disabled in field if UX is wrong.
- **Foundation work (FOUND-01/02/03) gates all v1.1 feature code** — Phase 06 must ship first.
- **v1.0 → v1.1 `## Techniques` migration is lazy-on-AC by default** — opt-in batch UI is Phase 12 stretch goal (AIKG-FUT-01); never auto-rewrite on plugin load.
- **AI streaming transport** — `electron.net.fetch` default with `requestUrl` fallback for streaming AI calls only; non-streaming AI calls always use `requestUrl`.

### Pending Todos

None yet — awaiting `/gsd-plan-phase 6`.

### Blockers/Concerns

- **Streaming UX cliff** (Phase 08): If `electron.net.fetch` resolution fails, fallback is non-streaming + Thinking indicator. Validate during Phase 08 dogfood whether the indicator feels acceptable.
- **Look-ahead edge UX is novel** (Phase 11): Ship behind `featureFlags.lookAheadEdges`; flag for dogfood feedback.
- **Pattern-cluster taxonomy frozen at v1.1 ship** — 22 patterns (18 NeetCode + Prefix Sum + Monotonic Stack + Topological Sort + Union-Find). Bootstrapped in `PluginData.aiClusterTaxonomy`.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260514-k39 | Fix Obsidian plugin store auto-review ESLint errors and warnings | 2026-05-14 | 80a51ca | [260514-k39-fix-obsidian-plugin-store-auto-review-es](./quick/260514-k39-fix-obsidian-plugin-store-auto-review-es/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| AI provider | Native `@ai-sdk/amazon-bedrock` (SigV4) — AIPROV-FUT-01 | Deferred to v1.2 | 2026-05-15 (v1.1 scoping) |
| AI provider | Per-feature provider routing — AIPROV-FUT-02 | Deferred | 2026-05-15 |
| AI provider | Apply-patch (Cursor-style diff) — AIPROV-FUT-03 | Deferred | 2026-05-15 |
| Knowledge graph | Manual cluster override — AIKG-FUT-02 | Deferred | 2026-05-15 |
| Knowledge graph | Cluster-color graph view — AIKG-FUT-03 | Deferred | 2026-05-15 |
| Knowledge graph | AI auto-tagging of contest problems — AIKG-FUT-04 | Deferred | 2026-05-15 |
| Contest | Live participation — CONTEST-FUT-01 | Deferred | 2026-05-15 |
| Contest | Difficulty-weighted Surprise me — CONTEST-FUT-02 | Deferred | 2026-05-15 |
| Contest | Upcoming contest schedule — CONTEST-FUT-03 | Deferred | 2026-05-15 |

## Session Continuity

Last session: 2026-05-16T00:35:25.735Z
Stopped at: Completed 07-04-PLAN.md
Resume file: .planning/phases/07-ai-provider-foundation/07-05-PLAN.md

## Operator Next Steps

- Review and approve `.planning/ROADMAP.md` v1.1 section (Phases 06–12).
- Run `/gsd-plan-phase 6` to start planning Phase 06 (Foundations + Preview Mode).
- Phase 06 must land before any v1.1 feature code (AIs/Contest) is written — lint + bundle-size gates are gating dependencies for the remaining phases.
