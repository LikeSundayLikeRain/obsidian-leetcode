# v1.1 Research Summary — Contest, AI Coach, Preview

**Project:** Obsidian LeetCode (community plugin)
**Milestone:** v1.1 — Contest virtual mode, AI Coach (Debug + Review + Knowledge Graph), Preview tab
**Domain:** Existing shipped Obsidian plugin (TypeScript, Electron desktop) — subsequent milestone on top of v1.0
**Researched:** 2026-05-14
**Confidence:** HIGH on stack + architecture (verified against `node_modules/`, source files, Context7); MEDIUM on UX patterns (look-ahead edges are novel; LC contest scoring varies per contest)

> Detail lives in `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`. This document is the consolidated decision surface — go to the per-topic files for evidence and code snippets.

---

## 1. Milestone Snapshot

v1.1 layers an AI subsystem (4 native providers + LiteLLM gateway path for Bedrock, streaming Debug, on-AC Review, AI-curated knowledge graph) plus a virtual contest mode and a non-destructive Preview tab on top of the shipped v1.0 codebase. The hard architectural addition is the AI provider layer — the rest reuses v1.0 primitives (`requestUrl`, `app.vault.process`, `processFrontMatter`, section-lock, `KnowledgeGraphWriter.onAccepted` fanout, `data.json` persistence, `ItemView`). Recommended bundle delta: ~80–110 KB via Vercel AI SDK + 4 provider adapters; total stays well under the 500 KB CI gate. The biggest risks are streaming-transport convention drift, AI cost surprise on auto-AC review, hallucinated wikilinks in look-ahead edges, and pattern-cluster naming jitter — all mitigated by explicit phase ordering: provider foundation first, AI write paths next, Knowledge Graph last (where migration risk concentrates).

---

## 2. Stack Additions

| Add | Version | Purpose | Notes |
|-----|---------|---------|-------|
| `ai` (Vercel AI SDK) | 6.37.0 | Unified `streamText` / `generateText` / `generateObject` across providers | Per-provider custom `fetch` option |
| `@ai-sdk/openai` | 3.0.77 | OpenAI provider | First-party |
| `@ai-sdk/anthropic` | 3.0.63 | Anthropic provider | First-party (wire format != OpenAI-compatible) |
| `@ai-sdk/openai-compatible` | 2.0.47 | OpenRouter, Ollama, vLLM, LM Studio, custom base URL, LiteLLM gateway path for Bedrock | One adapter for all OpenAI-shape endpoints |
| `zod` | 4.4.3 | Peer dep of `@ai-sdk/provider-utils` | Structured-output schemas |
| `electron.net.fetch` | bundled | Streaming transport (CORS-free `Response.body`) | Resolution: `require('electron').net.fetch` -> `...remote.net.fetch` -> fallback to `requestUrl` |
| `requestUrl` (existing) | bundled | Non-streaming AI calls + all leetcode.com calls | v1.0 convention preserved for LC; AI providers use it for `generateText`/`generateObject` |

**No new dev deps. No new esbuild externals.** Keep `electron` external (already is). `@leetnotion/leetcode-api@3.0.0` already shipped — its `getPastContests`, `getContestQuestions`, `user_contest_info`, `recent_user_submissions` cover all v1.1 contest needs.

**Explicit non-additions:** `@anthropic-ai/sdk`, `openai`, `aws-sdk`, `langchain` — bundle bloat + Node-only transports (PITFALLS #1). `xstate` — 60 KB for a 4-state machine (PITFALLS #11). `eventsource-parser` — useless without a streaming transport ai-sdk doesn't already handle.

→ `STACK.md` for installation commands, version-compatibility matrix, decision rationale.

---

## 3. Feature Scope

| Category | Table Stakes (P1) | Differentiators (P1) | Defer (P2/P3) | Anti-Features |
|----------|-------------------|----------------------|---------------|---------------|
| **A. Preview** | Right-click → Preview tab; read-mode render; Start/Open CTA toggle; closeable as tab | Default click target (single-click previews; Shift-click or Start = create note); difficulty + topic chips visible | Cluster-coverage hint (after E1) | innerHTML rendering; auto-cache full problem set; pre-pick language |
| **B. Contest** | Past picker + Surprise me; 90/100-min timer; 4 notes; verdict tracking; post-contest summary note; pause/abort | Summary as graph note; auto-tag missed with #revisit; LC scoring rendered (with caveat); resume on plugin reload | AI auto-tagging (after E1); difficulty-weighted Surprise me | Live participation; leaderboard scraping; auto-submit on expiry; hard-mode timer |
| **C. AI Debug** | User-triggered; problem + code + last failure in prompt; streamed inline OR strong "thinking" UX; cancel mid-stream; failing test included | Auto-include `## Notes` opt-in; Esc-to-stop | Apply-Patch (Cursor-style diff) — v1.2 | Auto-debug on every WA; full vault context; pre-submit oracle; AI generates from scratch |
| **D. AI ACed Review** | Triggered on AC (toggle, default OFF); 3 dimensions; inline `## AI Review`; idempotent on re-AC; non-streaming | Suggested code in separate fence; complexity comparison table | Cluster deep-link (after E1) | Auto-apply suggested code; review every Run; sidebar/modal-only render; comparative leaderboard |
| **E. AI Knowledge Graph** | 22-pattern hubs (18 NeetCode + 4 add'l); difficulty-progression edges; cross-cluster `## Related Variants` (twins only); look-ahead edges (cap 2/note) | Hub auto-summary; clusters supersede lc-tag Techniques on **new** ACs; cluster-color graph view | Opt-in batch migration UI; manual cluster override | Free-form AI naming; same-cluster Variants; auto-rewrite on plugin update; AI rewrites `## Notes`; look-ahead as TODO; >2 look-ahead/note |
| **F. Multi-Provider** | Anthropic + OpenAI + OpenRouter + Ollama; custom base URL per provider; key in `data.json` (masked); test-connection; per-feature provider routing | Local cost telemetry; pre-populated model dropdowns; first-run privacy modal | Bedrock SigV4 native (v1.1.x or v1.2 — see Section 6); Azure OpenAI; GitHub Copilot | Plugin-hosted proxy; OS keychain (theatre); auto-fallback; usage telemetry; smart routing |

→ `FEATURES.md` for the per-feature dependency graph, MVP cut-line, competitor matrix. **USP: AI-judged look-ahead edges** — no comparable product has this.

---

## 4. Integration Map (NEW vs MODIFIED)

### NEW components

| Path | What |
|------|------|
| `src/ai/AIClient.ts` + `AIProvider.ts` | Provider-agnostic facade |
| `src/ai/providers/{anthropic,openai,openrouter,ollama}.ts` | Per-provider request shape (Bedrock deferred) |
| `src/ai/prompts.ts` | Versioned prompt templates |
| `src/ai/AIDebugCommand.ts` + `AIStreamModal.ts` | Streaming Debug surface |
| `src/ai/AIReviewWriter.ts` + `AIReviewQueue.ts` | On-AC review pipeline |
| `src/ai/PatternClusterEngine.ts` + `ClusterHubWriter.ts` + `RelatedVariantsWriter.ts` | KG subsystem |
| `src/ai/LastVerdictStore.ts` | In-memory last terminal verdict per slug |
| `src/contest/{ContestController,Session,SessionStore,StartModal,StatusBar,SummaryWriter,catalog}.ts` | Contest lifecycle |
| `src/preview/{ProblemPreviewView,previewRouter}.ts` | Read-mode tab |
| `src/settings/AISettingsSection.ts` | Factored AI panel |

### MODIFIED v1.0 components

| Path | What changes |
|------|--------------|
| `src/main.ts` | onload steps 5.9–5.13 (AIClient/contest/preview/settings); new commands; new view registrations |
| `src/browse/ProblemBrowserView.ts` | Row click → `routeProblemClick(slug, status, intent)`; Shift-click = open |
| `src/graph/KnowledgeGraphWriter.ts` | `onAccepted` adds step 4 (AIReviewQueue.queue) + step 5 (PatternClusterEngine.refresh); step 2 strategy-param-driven |
| `src/graph/mergeTechniquesSection.ts` | Strategy param `'lc-tags' \| 'cluster'` |
| `src/notes/NoteTemplate.ts` | Adds `lc-contest-id`, `lc-cluster`, `lc-ai-reviewed-at` to PLUGIN_LC_KEYS; adds `## AI Review` + `## Related Variants` to LOCKED_HEADINGS |
| `src/main/sectionLockExtension.ts` | Config-only via NoteTemplate re-export |
| `src/settings/SettingsTab.ts` + `SettingsStore.ts` | New "AI" + "Contest" sections; PluginData extends |
| `src/api/requestUrlFetcher.ts` | UNCHANGED |

→ `ARCHITECTURE.md` sections 2.1, 2.2, 3, 6.

---

## 5. Top Pitfalls + Mitigations

| # | Pitfall | Mitigation | Phase |
|---|---------|------------|-------|
| 1 | Bundling Node-only AI SDKs crashes Electron renderer / bloats to 1–2 MB | Vercel AI SDK + per-provider custom `fetch` adapter; CI bundle gate < 500 KB | Phase 07 |
| 2 | `requestUrl` cannot stream — users expect token drip | Default `electron.net.fetch`; fallback `requestUrl` + Thinking indicator + cancel; never shim global `fetch` | Phase 08 |
| 3 | AI Review cost surprise (3 calls × N ACs/week) | Auto-run default OFF; combined-dimensions single call (default ON); usage tracker; daily cap; README cost section | Phase 09 |
| 4 | Hallucinated slugs in look-ahead wikilinks pollute vault | Validate every emitted slug vs local problem index; constrained pick-from-list prompt (top ~50 from cluster); drop unknowns silently | Phase 11 |
| 5 | Pattern-cluster name drift fragments the graph | 22-pattern canonical taxonomy in `data.json`; LLM picks from list with `OTHER` user-gated escape hatch | Phase 11 |
| 6 | Migration of v1.0 Techniques overwrites edits / hits section-lock | Default lazy-on-AC via `vault.process`; opt-in batch UI as Phase 12 stretch with backup writer + 10-batch; never auto-rewrite on plugin load | Phase 11 + 12 |
| 7 | Contest timer drift (sleep/reload) + broken Surprise-me slugs | Persist `{startedAt, durationMs}`; compute `Date.now()`-based remaining; pre-flight `Promise.allSettled` over 4 problem slugs; mode-aware rate-limiter | Phase 10 |
| 8 | eslint-plugin-obsidianmd 0.1.9 → 0.3.0 new rules will fail at plugin store | Bump to ^0.3.0 in Phase 06 first plan; lint clean before any feature code; new commands use clean IDs (`ai-debug`, not `obsidian-leetcode:ai-debug`) | Phase 06 |

→ `PITFALLS.md` for full 18-pitfall list, phase-mapping table, "looks done but isn't" checklist.

---

## 6. Convergent Decisions

### 6.1 AI streaming transport — `electron.net.fetch` default; `requestUrl` fallback

Ship `electron.net.fetch` for AI Debug streaming with automatic fallback to `requestUrl` + non-streaming when the resolver returns null — same call site (`streamText` with custom `fetch`), different transport. Both paths must work end-to-end before Phase 08 ships. Non-streaming AI calls (Review, KG) always use `requestUrl`.

### 6.2 AI provider scope — 4 native; Bedrock via gateway

Ship 4 providers natively (Anthropic + OpenAI + OpenRouter + Ollama). Document **LiteLLM** or **Bedrock Access Gateway** in README as the v1.1 Bedrock path — both expose an OpenAI-compatible endpoint that re-signs SigV4 server-side; plugin talks to gateway via existing `@ai-sdk/openai-compatible` adapter (no new code). Native `@ai-sdk/amazon-bedrock` deferred to v1.1.x or v1.2. The user-facing trade-off is explicit: Claude on Bedrock works today via gateway; native AWS auth comes later.

### 6.3 Pattern-cluster taxonomy — 22 patterns frozen at v1.1 ship

18 NeetCode patterns (extracted from `neetcode-gh/leetcode/.problemSiteData.json`, 450 entries) + 4 community-recognized: **Prefix Sum, Monotonic Stack, Topological Sort, Union-Find**. Bootstrap in `PluginData.aiClusterTaxonomy`. LLM prompt: "pick exactly one from this list, or answer `OTHER` and propose." On `OTHER`, prompt user once (Yes / Use 'X' instead / Skip) and persist.

### 6.4 v1.0 → v1.1 migration — lazy-on-AC default; opt-in batch as stretch

Lazy-on-AC by default — when KGWriter touches a note, that note's `## Techniques` rewrites to cluster mode via `vault.process`. Zero startup cost, zero surprise. Opt-in batch UI is Phase 12 stretch goal: backup writer + 10-at-a-time + active-note-with-unsaved-changes guard + resume-on-crash flag. If Phase 12 slips, ship lazy-only; README documents dual-convention coexistence honestly. Legacy `[[lc-tag]]` wikilinks never auto-removed.

### 6.5 `requestUrl` convention exception — bounded scope

- `requestUrl` for **all** leetcode.com calls — absolute, no exception.
- `requestUrl` for AI providers in **non-streaming** mode (`generateText`, `generateObject`) — providers all set permissive CORS; stays on-convention.
- `electron.net.fetch` permitted **only** for AI providers in **streaming** mode (`streamText`) — and only when resolver returns it; falls back to `requestUrl`.

Single `obsidianFetch(mode: 'stream' | 'buffered')` adapter is the switch point; all providers receive it via `fetch` option. Document in CLAUDE.md Conventions section alongside existing `'leetcode.*'` userEvent rule.

### 6.6 Section-lock interaction — `vault.process` mandatory; new headings locked

All AI writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); never `cm.dispatch`/`vault.modify`. Bypasses section-lock changeFilter by design. New `## AI Review` and `## Related Variants` headings added to `LOCKED_HEADINGS` — heading locked, body editable.

### 6.7 Forward-looking edges — dangling wikilinks; no stub creation

Native `[[unresolved]]` + `metadataCache.unresolvedLinks` is the right primitive. AI prompt includes candidate list (top ~50 from cluster) — LLM picks/ranks rather than recalls. Validate every emitted slug. Write as plain `[[id-slug|Display Title]]` under `## Related Variants` — **no stub note creation in v1.1**. Click triggers existing v1.0 "open as note" flow (now routed through preview router).

### 6.8 Privacy + plugin-store readiness — non-negotiable Phase 06/07

First-run AI disclosure modal (Phase 07) before any AI call: lists provider, base URL, exact data shipped (problem text + `## Code` + last verdict + failing test, optionally `## Notes`); explicit list of what does NOT ship. README "Network use" enumerates every endpoint by name (Phase 06; final audit Phase 12). Password-masked key field + Setting.setDesc warning + "Clear AI key" command. No telemetry. Plain `data.json` storage (parallels v1.0 cookie posture).

---

## 7. Recommended Phase Order (06–12)

```
Phase 06: Foundations + Preview Mode         <- no AI; CI gates; lint cleanup
   |
   +--> Phase 07: AI Provider Foundation     <- AIClient, 4 providers, settings, disclosure modal
   |       |
   |       +--> Phase 08: AI Debug           <- streaming via electron.net.fetch + fallback
   |       |       |
   |       |       +--> Phase 09: AI ACed Review  <- first AI vault write (## AI Review)
   |       |               |
   |       |               +--> Phase 11: AI Knowledge Graph
   |       |
   |       +--> Phase 10: Contest             <- independent of AI; depends on Phase 06 router refactor

Phase 12: Polish, opt-in migration UI, plugin-store re-submission
```

### Phase 06 — Foundations + Preview Mode

**Why first:** Lowest risk; pays off for Phases 10+11; bumps eslint-plugin-obsidianmd to ^0.3.0 (PITFALLS #15); adds CI bundle-size gate (PITFALLS #18); refactors `ProblemBrowserView` row click into `previewRouter` for Phase 10 reuse.
**Delivers:** `ProblemPreviewView` (ItemView), `previewRouter`, click-behavior settings toggle (preserve v1.0 muscle memory for upgraders), CI bundle-size gate, lint clean on 0.3.0, `MarkdownRenderer.render(app, md, el, '', this)` where `this` is the view.
**Avoids:** PITFALLS #14 (Preview silently creating notes), #15 (lint surprises), #18 (bundle blow-up).

### Phase 07 — AI Provider Foundation

**Why second:** Every other AI feature depends on it; standalone-validatable via test-connection button without any vault write.
**Delivers:** `AIClient`, `AIProvider` interface, 4 provider adapters, `AISettingsSection`, `obsidianFetch(mode)` adapter, `PluginData.aiProviders`/`aiActive`/`aiKey`/`featureFlags` extension, README "Network use" + "AI provider configuration & data flow" sections, first-run disclosure modal scaffolding.
**Avoids:** PITFALLS #1, #3, #4 (Bedrock via gateway), #5, #16.

### Phase 08 — AI Debug

**Why third:** Validates AI subsystem on button-triggered, modal-only path with highest-stakes UX (streaming). No vault write.
**Delivers:** `AIDebugCommand`, `AIStreamModal` (progressive-fill + cancel + abort + elapsed-time), `LastVerdictStore`, AI Debug button under `CodeActionsWidget`, first-run disclosure modal.
**Avoids:** PITFALLS #2, #7.

### Phase 09 — AI ACed Review

**Why fourth:** First AI **vault write** — exercises `vault.process` discipline + section-lock-aware new H2 + on-AC fanout extension.
**Delivers:** `AIReviewWriter`, `AIReviewQueue` (rate-limit + dedupe + persisted), new `## AI Review` H2 in `LOCKED_HEADINGS`, modified `KnowledgeGraphWriter.onAccepted` (step 4), `lc-ai-reviewed-at` frontmatter, "Re-run AI review" command, auto-run toggle (default OFF), single-LLM-call combined-dimensions mode, local usage tracker, daily cap.
**Avoids:** PITFALLS #6 (cost), #10 (vault.process), #17 (frontmatter bloat).

### Phase 10 — Contest

**Why fifth:** Independent of AI; depends on Phase 06 `previewRouter`. Standalone polish.
**Delivers:** `ContestController`, `ContestSession`, `ContestSessionStore`, `ContestStartModal`, `ContestStatusBar` (status-bar item + 1s tick), `ContestSummaryWriter` (`LeetCode/Contests/{date}-{id}.md`), `contestCatalog` (cached + `Promise.allSettled` slug pre-flight), `lc-contest-id` frontmatter, mode-aware rate-limiter, `onbeforeunload` warning during active contest.
**Avoids:** PITFALLS #11, #12, #13.

### Phase 11 — AI Knowledge Graph

**Why sixth:** Largest scope. Depends on Phase 07 + Phase 09.
**Delivers:** `PatternClusterEngine.classify(slug)` (constrained 22-pattern + `validateSlug`), `ClusterHubWriter` (`LeetCode/Patterns/{Cluster}.md`), `RelatedVariantsWriter` (cross-cluster twins ONLY), modified `mergeTechniquesSection` (strategy param), modified `KnowledgeGraphWriter.onAccepted` (step 5), `lc-cluster` frontmatter, on-demand lazy migration, `## Related Variants` H2 in `LOCKED_HEADINGS`, look-ahead edges (cap 2/note, validated, dangling only).
**Avoids:** PITFALLS #8, #9, #10.

### Phase 12 — Polish + opt-in migration UI + plugin-store re-submission

**Why last:** Validates everything together; plugin store needs re-review.
**Delivers:** Opt-in batch migration command (backup + 10-batch + resume) — **stretch**; final README audit; version bump 1.1.0; manifest re-validation; GitHub release artifacts.

### Parallelization

- Phase 09 ‖ Phase 10 — both modify `main.ts` onload but distinct sections.
- Phase 11 sub-components independent given engine's `classify()` output as contract.

### Sequential dependencies

- 06 → 10 (Contest reuses `previewRouter`)
- 07 → 08 → 09 → 11 (AI dependency chain)
- 09 → 11 (cluster engine reuses review's prompt + write infrastructure)

### Compressed alternative (5 phases)

Merge 06+10 ("alternative engagement"); merge 08+09 ("user-facing AI"). Higher merge-conflict risk; recommend 7-phase path unless time pressure forces compression.

---

## 8. Open Questions for `/gsd-discuss-phase`

1. **Streaming UX cliff** (Phase 08): If `electron.net.fetch` resolution fails, fallback is non-streaming + Thinking indicator. Validate during dogfood whether the indicator feels acceptable or polling-pseudo-stream is needed.
2. **Per-feature provider routing UX** (Phase 07): Three dropdowns (Debug/Review/KG) is correct architecturally; ship in v1.1 base or defer to v1.1.x? Recommend defer; ship one-active-provider in v1.1 base.
3. **Cost-display surface** (Phase 09): Per-call toast? Settings tab summary? Sidebar widget? Recommend settings-tab + per-call toast for first month.
4. **Pattern-cluster hub note format** (Phase 11): Bases query (matches v1.0 `LeetCode.base`)? Recommend Bases.
5. **AI cluster disagreement override** (Phase 11): Manual override mechanism? Recommend defer to v1.2; surface as known limitation.
6. **Bedrock native integration trigger** (Phase 12 retro): If LiteLLM gateway is friction-heavy in dogfood, schedule v1.2 phase for native `@ai-sdk/amazon-bedrock`.

---

## 9. Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | All adds verified against `node_modules/`, npm registry timestamps, 6+ production Obsidian + ai-sdk plugins; ai-sdk official docs |
| Features | **MEDIUM-HIGH** | HIGH for vscode-leetcode + NeetCode taxonomy + Obsidian Copilot provider list. MEDIUM for LC contest scoring base points (vary per contest). LOW for look-ahead UX (novel) — flag for Phase 11 dogfood |
| Architecture | **HIGH** | Read directly from `src/`; every integration point cited is a verified line of existing code or documented convention |
| Pitfalls | **HIGH** | Obsidian Developer Docs + Policies via Context7; eslint-plugin-obsidianmd 0.3.0 README; community plugin source review |

**Overall:** HIGH for technical decisions; MEDIUM for novel UX (look-ahead) — flag for dogfood.

### Gaps to address during planning

- **Look-ahead edge UX:** No prior art. Phase 11 should ship behind `featureFlags.lookAheadEdges`.
- **Contest scoring fidelity:** LC's per-contest base points are published metadata, not algorithmic. Consume `ContestQuestion.credit` from `@leetnotion/leetcode-api`; never hardcode 1+2+3+4.
- **Streaming-transport fallback dogfood:** `electron.net.fetch` resolver pattern proven by one production plugin. Phase 08 should add Settings toggle to force non-streaming.
- **Migration completeness:** Lazy-only leaves dual convention indefinitely if Phase 12 slips — README must document honestly.

---

## 10. Sources (Aggregated)

| File | Coverage | Confidence |
|------|----------|------------|
| `STACK.md` | Vercel AI SDK + 4 provider adapters; `electron.net.fetch` streaming pattern; `@leetnotion/leetcode-api` contest API; native `[[wikilinks]]` for look-ahead; `MarkdownRenderer.render` for Preview | HIGH |
| `FEATURES.md` | vscode-leetcode + LeetHub + NeetCode + Obsidian Copilot + Continue.dev competitor matrix; 22-pattern taxonomy from `neetcode-gh/leetcode/.problemSiteData.json` (450 entries); per-feature MVP/P2/P3 cuts | HIGH (sources) / MEDIUM (LC contest scoring) |
| `ARCHITECTURE.md` | Read directly from `src/` — full v1.0 component map, NEW vs MODIFIED matrix, per-feature integration deep dives, section-lock grid, build-order with parallelization | HIGH |
| `PITFALLS.md` | 18 pitfalls (Critical/Performance/Security/UX), pitfall-to-phase mapping, "looks done but isn't" checklist; sourced from Obsidian Developer Docs + eslint-plugin-obsidianmd 0.3.0 + community plugin review | HIGH |

### Primary external sources (HIGH confidence)

- Context7 `/obsidianmd/obsidian-developer-docs` — `requestUrl`, `MarkdownRenderer.render`, `ItemView`, `processFrontMatter`, `unresolvedLinks`
- `node_modules/obsidian/obsidian.d.ts` (1.12.x) — verified `RequestUrlResponse` shape (no streaming body)
- `node_modules/@leetnotion/leetcode-api/lib/index.d.ts` (3.0.0) — verified contest API methods
- ai-sdk official docs (`https://ai-sdk.dev/`) — `streamText`, `createOpenAICompatible`, custom `fetch`
- `your-papa/obsidian-Smart2Brain`, `jcollingj/caret`, `0xIntuition/intuition-obsidian-plugin` — production patterns
- `neetcode-gh/leetcode/.problemSiteData.json` — canonical pattern taxonomy
- `logancyang/obsidian-copilot/src/constants.ts` — multi-provider UX precedent
- npm registry — versions + timestamps verified 2026-05-14
- `CLAUDE.md`, `PROJECT.md`, `MILESTONES.md` — v1.0 conventions

### Secondary sources (MEDIUM confidence)

- LeetCode native virtual contest UI (training data + community wiki)
- Continue.dev provider docs
- `skygragon/leetcode-cli` — REST endpoint stability

---

*Research synthesized: 2026-05-14*
*Ready for: requirements scoping (user) → roadmap derivation (gsd-roadmapper)*
*Phase numbering continues from v1.0: next phase = 06*
