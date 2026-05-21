# Architecture Research

**Domain:** Obsidian community plugin — v1.1 milestone (Preview, Contest, AI Coach, AI Knowledge Graph) layered on top of shipped v1.0
**Researched:** 2026-05-14
**Confidence:** HIGH (read directly from `src/` on disk; integration points are evidence-based, not speculative)

---

## 1. v1.0 Architecture (as it exists today)

This is the inherited surface. v1.1 must extend it without breaking existing convention.

### 1.1 Component map (v1.0)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LeetCodePlugin (src/main.ts)  — single entry; lifecycle, command wiring     │
│   onload sequence (LOCKED ORDER):                                           │
│     1. SettingsStore.load                                                   │
│     2. installRequestUrlFetcher (BEFORE any LC client construction)         │
│     3. LeetCodeClient + reauthenticate                                      │
│     4. AuthService                                                          │
│     5. ProblemListService                                                   │
│     5.5 NoteWriter                                                          │
│     5.7 SubmissionHistoryStore + KnowledgeGraphWriter (on-AC pipeline)      │
│     5.8 EphemeralTabStore                                                   │
│     6a registerView(BROWSER_VIEW_TYPE, ...)                                 │
│     6b ribbon icon                                                          │
│     6c command palette                                                      │
│     6d settings tab                                                         │
│     6e/f reading-mode + edit-mode CodeActions extensions                    │
│     6f-bis section-lock CM6 extension                                       │
│     6g file-open hook (starter-code retrofit)                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ UI surface                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ProblemBrowserView (ItemView, right sidebar) ──── src/browse/              │
│    └─ row click → plugin.openProblem(slug, status) ──┐                      │
│                                                       │                      │
│  Reading-mode action row (MarkdownPostProcessor) ─────┤                      │
│    src/main/codeActionsPostProcessor.ts               ├── runFromActive /   │
│                                                       │    submitFromActive │
│  Edit-mode action row (CM6 block widget) ─────────────┘                      │
│    src/main/codeActionsEditorExtension.ts                                   │
│    + languageChevronWidget.ts (chevron dropdown)                            │
│                                                                             │
│  Modals: VerdictModal, RunModal, SubmissionPickerModal,                     │
│          SubmissionDetailModal, FilterModal, CookiePasteModal,              │
│          ConfirmOverwriteModal                                              │
│                                                                             │
│  PluginSettingTab → src/settings/SettingsTab.ts                             │
│    sections: Authentication / Manual cookie / Notes / Knowledge graph       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Domain services                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  AuthService            src/auth/             login + cookie persistence    │
│  LeetCodeClient         src/api/              GraphQL via @leetnotion       │
│  requestUrlFetcher      src/api/              CORS-bypass + Throttle        │
│  ProblemListService     src/browse/           paged index, 24h TTL          │
│  NoteWriter             src/notes/            row-click orchestrator        │
│  SubmissionOrchestrator src/solve/            submit + polling              │
│  pollingOrchestrator    src/solve/            interpret + check polling     │
│  KnowledgeGraphWriter   src/graph/            on-AC frontmatter+techniques  │
│  SubmissionHistoryStore src/graph/            in-memory submission cache    │
│  EphemeralTabStore      src/solve/            run-modal tab state (in-mem)  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Data layer                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  data.json (loadData/saveData via SettingsStore)                            │
│    cookies, problems folder, default language, techniques folder override,  │
│    auto-backlinks toggle, problem index (24h TTL),                          │
│    DetailCacheEntry per slug (7-day TTL), legacy-base-notice flag           │
│                                                                             │
│  Vault markdown notes (single source of truth for solving artefacts)        │
│    LeetCode/{id}-{slug}.md                                                  │
│    sections (canonical anchor order):                                       │
│      ## Problem  (LOCKED — body + heading)                                  │
│      ## Code     (LOCKED — heading + fence opener + closing fence)          │
│      ## Notes    (LOCKED heading; body editable)                            │
│      ## Techniques  (LOCKED heading; body editable)                         │
│      ## Custom Tests (NEVER locked; lazy)                                   │
│    LeetCode/Techniques/{Name}.md  (stub notes, lazy-created on AC)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Load-bearing conventions inherited by v1.1

| Convention | Where defined | Why it matters for v1.1 |
|---|---|---|
| All HTTP via `requestUrl` | `src/api/requestUrlFetcher.ts` | AI provider calls (Anthropic, OpenAI, Bedrock, Ollama, OpenRouter) MUST go through `throttledRequestUrl` — Electron CORS will block `fetch()`. |
| Vault writes via `app.vault.process(...)` (body) and `app.fileManager.processFrontMatter(...)` (frontmatter) — never `vault.modify` | `src/graph/KnowledgeGraphWriter.ts` D-22; `src/notes/NoteWriter.ts` | Any AI-write that lands in a problem note MUST use these primitives. Bypasses CM6 transactionFilter, retry-safe under conflict. |
| Plugin-internal CM6 dispatches use `userEvent: 'leetcode.*'` | `src/main.ts:828`; `src/main/sectionLockExtension.ts:26-30` | If v1.1 ever streams AI text into the live editor view via `cm.dispatch` (instead of vault.process), it MUST tag the transaction `'leetcode.ai-stream'` or the section lock will silently drop it. **Recommended: prefer vault.process for terminal writes; reserve cm.dispatch only for ephemeral preview overlays that don't need persistence.** |
| `getActiveProblemContext()` is the gate for "current problem note" | `src/main.ts:513-528` | All v1.1 features that need "the current problem note" reuse this helper. lc-slug frontmatter is the universal gate. |
| `editorCheckCallback` gates commands on `lc-slug` frontmatter | `src/main.ts` (5 places) | New v1.1 commands (AI Debug, AI Review, Open in Preview, Start Contest) follow this same gate pattern. |
| `KnowledgeGraphWriter.onAccepted(ctx, terminal)` is the on-AC fanout point | `src/main.ts:641-649` | v1.1 AI ACed-Review hooks here — same `if (classifyStatus(...).kind === 'ac')` branch already exists. |
| `data.json` shape is versioned via `PluginData` interface | `src/settings/SettingsStore.ts:49` | New v1.1 data (AI provider config, contest state, AI review cache, pattern-cluster index) extends this same shape. Migrations are precedented (legacy base file, premium auto-default). |
| Frontmatter union-merge preserves user keys; non-downgrade for `lc-status` | `src/notes/NoteTemplate.ts` `applyFrontmatter` | New AI-provenance keys (e.g. `lc-ai-reviewed-at`, `lc-cluster`) follow this same pattern. |

---

## 2. v1.1 Integration Architecture

### 2.1 Augmented system overview

```
                    ┌────────────────────────────────────────────┐
                    │ EXISTING: ProblemBrowserView (ItemView)    │
                    │   row click → plugin.openProblem(slug)     │
                    │                                            │
                    │ MODIFIED for v1.1:                         │
                    │   row click → plugin.routeProblemClick(    │
                    │     slug, intent='preview'|'open')         │
                    │   shift-click or "Start" button → 'open'   │
                    │   default click → 'preview'                │
                    └──────┬──────────────────────────┬──────────┘
                           │                          │
                  intent='preview'           intent='open'
                           ▼                          ▼
        ┌─────────────────────────────┐    ┌──────────────────────┐
        │ NEW: ProblemPreviewView     │    │ EXISTING:            │
        │ ItemView (preview-leetcode) │    │ NoteWriter.openProblem│
        │ src/preview/                │    │ (unchanged)          │
        │  • renders ## Problem only  │    └──────────────────────┘
        │  • Start / Open buttons     │
        │  • detects existing note    │
        └─────────────────────────────┘

         ┌─────────────────────────────────────────────────────┐
         │ NEW: ContestController        src/contest/          │
         │   • picks 4 problems (curated past LC contest or    │
         │     "surprise me" via ProblemListService)           │
         │   • starts ContestSession (timer, verdict log)      │
         │   • opens 4 problem notes via NoteWriter            │
         │   • emits per-problem lc-contest-id frontmatter     │
         │   • on end: writes summary note (Vault.create)      │
         │   ├── ContestStartModal (picker UI)                 │
         │   ├── ContestSession (in-memory + persisted)        │
         │   ├── ContestStatusBar (status-bar item)            │
         │   └── ContestSummaryWriter (Vault.create + linkage) │
         └─────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────────────────┐
         │ NEW: AI subsystem               src/ai/             │
         │   • AIProvider interface (Anthropic, OpenAI,        │
         │     OpenRouter, Bedrock, Ollama adapters)           │
         │   • AIClient — provider-agnostic chat() + stream()  │
         │     using requestUrl                                │
         │   • AIDebugCommand — assembles prompt, streams      │
         │     to a modal (AIStreamModal)                      │
         │   • AIReviewWriter — on-AC, writes ## AI Review     │
         │     (or sibling note) via vault.process             │
         │   • PatternClusterEngine — builds + maintains       │
         │     cluster hub notes; rewrites ## Techniques       │
         │     to wikilink the cluster instead of lc-tag       │
         │   • aiPromptTemplates — versioned prompt strings    │
         │     (single source of truth for review/cluster/     │
         │      look-ahead/related-variants)                   │
         └────────────────────────┬────────────────────────────┘
                                  │
                                  ▼
         ┌─────────────────────────────────────────────────────┐
         │ MODIFIED: KnowledgeGraphWriter.onAccepted           │
         │   step 1 frontmatter (unchanged)                    │
         │   step 2 ## Techniques body — gated by feature flag │
         │     • v1.0 mode: lc-tag-derived wikilinks (legacy)  │
         │     • v1.1 mode: PatternClusterEngine.classify(slug)│
         │       → wikilink to AI-named cluster hub note       │
         │   step 3 stub creator (still creates technique notes│
         │     for legacy mode; cluster hubs created by engine)│
         │   step 4 (NEW) — AIReviewWriter.queue(ctx, terminal)│
         │     fire-and-forget; review lands later             │
         │   step 5 (NEW) — PatternClusterEngine.refresh(slug) │
         │     updates progression edges, related-variants,    │
         │     look-ahead, cluster note backlinks              │
         └─────────────────────────────────────────────────────┘
```

### 2.2 Component matrix — NEW vs MODIFIED

| Component | Status | Path | Touches |
|---|---|---|---|
| `ProblemPreviewView` (ItemView) | NEW | `src/preview/ProblemPreviewView.ts` | renders LC HTML→markdown read-only; "Start"/"Open" buttons |
| `previewRouter` | NEW | `src/preview/previewRouter.ts` | resolves slug → existing-note vs new-fetch; opens preview leaf |
| `ContestController` | NEW | `src/contest/ContestController.ts` | start/end lifecycle, problem picking |
| `ContestSession` | NEW | `src/contest/ContestSession.ts` | timer state, verdict log, per-problem time tracking |
| `ContestSessionStore` | NEW | `src/contest/ContestSessionStore.ts` | persists active session to data.json (survives reload) |
| `ContestStartModal` | NEW | `src/contest/ContestStartModal.ts` | UI: pick contest by name or "Surprise me" |
| `ContestStatusBar` | NEW | `src/contest/ContestStatusBar.ts` | status-bar item showing timer + open-contest indicator |
| `ContestSummaryWriter` | NEW | `src/contest/ContestSummaryWriter.ts` | post-contest summary note via `app.vault.create` |
| `AIClient` | NEW | `src/ai/AIClient.ts` | provider-agnostic chat() + stream() over `requestUrl` |
| `AIProvider` adapters | NEW | `src/ai/providers/{anthropic,openai,openrouter,bedrock,ollama}.ts` | one file per provider; HTTP body shape only |
| `AIPromptTemplates` | NEW | `src/ai/prompts.ts` | versioned prompt strings (debug, review, cluster, look-ahead, variant) |
| `AIDebugCommand` | NEW | `src/ai/AIDebugCommand.ts` | assembles context, streams to AIStreamModal |
| `AIStreamModal` | NEW | `src/ai/AIStreamModal.ts` | modal that progressively fills as chunks arrive |
| `AIReviewWriter` | NEW | `src/ai/AIReviewWriter.ts` | writes `## AI Review` via `app.vault.process` |
| `AIReviewQueue` | NEW | `src/ai/AIReviewQueue.ts` | rate-limit + dedupe (one in-flight per slug); persisted across reload |
| `PatternClusterEngine` | NEW | `src/ai/PatternClusterEngine.ts` | classify(slug) → cluster id; manages cluster hub notes |
| `ClusterHubWriter` | NEW | `src/ai/ClusterHubWriter.ts` | creates/updates `LeetCode/Patterns/{Cluster}.md` hub notes |
| `RelatedVariantsWriter` | NEW | `src/ai/RelatedVariantsWriter.ts` | writes `## Related Variants` (NEW H2; UNLOCKED) |
| `AISettingsSection` | NEW | `src/settings/AISettingsSection.ts` | factored settings panel; mounted by `SettingsTab` |
| `LeetCodePlugin` (main.ts) | MODIFIED | `src/main.ts` | onload steps 5.9–5.12 add ai/contest/preview wiring; new commands; new view registrations |
| `ProblemBrowserView` | MODIFIED | `src/browse/ProblemBrowserView.ts` | row-click handler routes through `previewRouter` instead of direct `openProblem`; new "shift-click = open" affordance |
| `KnowledgeGraphWriter.onAccepted` | MODIFIED | `src/graph/KnowledgeGraphWriter.ts` | adds steps 4 (AI review queue) + 5 (cluster engine); step 2 swaps lc-tag links for cluster wikilink when v1.1 mode is on |
| `mergeTechniquesSection` | MODIFIED | `src/graph/mergeTechniquesSection.ts` | v1.1 input shape: cluster hub link instead of N topic-tag links |
| `SettingsTab` | MODIFIED | `src/settings/SettingsTab.ts` | new "AI" section + new "Contest" section (just folder override) |
| `SettingsStore` (`PluginData`) | MODIFIED | `src/settings/SettingsStore.ts` | new fields: `aiProvider`, `aiBaseUrl`, `aiModel`, `aiKeyEncrypted` (or plain), `aiReviewQueue`, `activeContestSession`, `clusterIndex`, `featureFlags` |
| `NoteTemplate` (`PLUGIN_LC_KEYS`) | MODIFIED | `src/notes/NoteTemplate.ts` | adds `lc-contest-id`, `lc-cluster`, `lc-ai-reviewed-at` to the canonical key list; adds `## AI Review` and `## Related Variants` to the locked-headings tuple if we lock them |
| `sectionLockExtension` | MODIFIED (config-only) | `src/main/sectionLockExtension.ts` | extends LOCKED_HEADINGS through NoteTemplate re-export — no code change beyond the tuple |
| `requestUrlFetcher` | UNCHANGED | `src/api/requestUrlFetcher.ts` | AI calls reuse the same throttle (or new dedicated AI throttle if we keep them on a separate budget) |
| `NoteWriter`, `LeetCodeClient`, `AuthService`, `RunModal`, `VerdictModal`, `pollingOrchestrator` | UNCHANGED | — | v1.1 calls into them; never modifies |

---

## 3. Per-feature integration deep-dives

### 3.1 Preview Mode

**Where the preview lives:**
A NEW `ItemView` registered at view type `'leetcode-preview'`. NOT a repurposed `MarkdownView` — a virtual file under `.obsidian/plugins/...` would be hidden from the vault UI (forbidden by v1.0 conventions), and bouncing through a real markdown file just to render a transient preview re-creates the exact "accidental note creation" footgun this feature exists to fix. An `ItemView` gives us full DOM control, ephemeral state, and a clean lifecycle (`onOpen`/`onClose`). Render markdown via `MarkdownRenderer.render(...)` (the same primitive `SubmissionDetailModal` already uses).

**How the existing browser changes:**
Single hook point — `ProblemBrowserView.renderRow`'s click handler at `src/browse/ProblemBrowserView.ts:605-609`. Today:
```ts
row.addEventListener('click', () => {
  void this.plugin.openProblem(p.slug, p.status);
});
```
Becomes:
```ts
row.addEventListener('click', (e) => {
  const intent = e.shiftKey ? 'open' : 'preview';
  void this.plugin.routeProblemClick(p.slug, p.status, intent);
});
```
The new `routeProblemClick(slug, status, intent)` method on `LeetCodePlugin`:
- `intent === 'preview'` → check if note exists at `LeetCode/{cached.id}-{slug}.md`; if it does, *still* show preview leaf with "Open Problem" wired to `openProblem`. If it doesn't, show preview with "Start Problem".
- `intent === 'open'` → existing `openProblem` path verbatim.

**Existing-note detection — what cache lookup do we already have?**
Two pieces are already in place and sufficient:
1. `SettingsStore.getProblemDetail(slug)` returns the `DetailCacheEntry` with `id` (and `fetchedAt`). Same path NoteWriter uses at `src/notes/NoteWriter.ts:218-225`.
2. `app.vault.getAbstractFileByPath(buildNotePath(folder, cached.id, slug))` checks vault existence — `buildNotePath` is exported from `src/notes/NoteTemplate.ts`.

So the preview's existing-note check is two function calls — no new index needed.

**"Start Problem" reuses existing pipeline:**
`Start` button → `plugin.openProblem(slug, status)` → `NoteWriter.openProblem` (entry function, unchanged). The preview leaf closes after Start completes.

**"Open Problem" (when note already exists):**
`Open` button → same `plugin.openProblem(slug, status)`. NoteWriter's existing re-open branch (`existingFile` truthy at line 227) handles it.

**No mutation to NoteWriter required.** All preview logic is a shell over existing primitives.

---

### 3.2 Contest (virtual)

**Where contest UI lives:**
- **Picker (modal):** `ContestStartModal` extending Obsidian's `Modal`. Same pattern as `FilterModal`. Shows past contests + "Surprise me" button.
- **Active-contest UI: status-bar item.** Lightest option that satisfies the requirement "timer surfaces in problem-note tabs during a contest." Status bar is global, never tab-specific, never blocks the user's view, and uses `plugin.addStatusBarItem()` (Obsidian primitive, no new view registration). Side panels and dedicated views fight for screen real estate the user is already using to solve.
- **No dedicated contest ItemView.** Active contest is a state, not a screen. Per-problem progress shows in the four problem notes themselves (frontmatter `lc-contest-id`).

**Timer state — where it lives:**
`ContestSession` lives in two places:
1. **In-memory** on `LeetCodePlugin.activeContest` for fast access from the status bar tick.
2. **Persisted** to `data.json` under `PluginData.activeContestSession` — shape: `{ id, startedAt, durationMs, problems: [{slug, status, firstAcAt, attempts}], finished: false }`. Persisted means a plugin reload mid-contest resumes correctly (the user's actual elapsed wall-clock time is `Date.now() - startedAt`, not a counter we need to increment).

A hidden `.planning/`-style file is wrong: this isn't planning artefacts; it's runtime state. data.json is precedented for runtime state (cookies, problem index, ephemeral submission flags).

**Status-bar surface:**
`plugin.addStatusBarItem()` → click handler shows a tiny popover with "End contest now" + "Open contest summary so far". Updates every 1s via `plugin.registerInterval` (auto-cleans on unload — established pattern).

**Per-tab surface during contest:**
Optional, low-cost: a small CM6 widget OR a markdown post-processor banner at the top of any note whose frontmatter `lc-contest-id` matches the active contest. Recommend deferring — the status bar alone is sufficient for v1.1 ship.

**Post-contest summary note:**
- Path: `LeetCode/Contests/{date}-{contest-id}.md` (NEW folder convention; matches the `Techniques` sibling pattern)
- Created via `app.vault.create()` — same primitive NoteWriter and StubNoteCreator already use
- Frontmatter: `lc-contest-id`, `lc-contest-name`, `lc-contest-date`, `lc-duration-mins`, `lc-score`, `lc-solved`, `lc-attempted`
- Body: per-problem table (slug, time-to-AC, verdict, wikilinks), aggregate stats, optional AI commentary

**`lc-contest-id` on per-problem notes:**
YES — required for traceability. `lc-contest-id` written into each of the 4 problem notes' frontmatter via `app.fileManager.processFrontMatter` when the contest opens them. This makes contest membership a graph-queryable property (`["lc-contest-id" = "weekly-388"]` Bases query). Status-bar's per-tab banner detection also uses it.

---

### 3.3 AI subsystem

**Where AI calls originate:**
A new `src/ai/` directory. `AIClient` is the single class that knows how to talk to any provider. Provider-specific HTTP body shapes go in `src/ai/providers/{anthropic,openai,openrouter,bedrock,ollama}.ts` — each implementing an `AIProvider` interface:

```ts
interface AIProvider {
  chat(opts: ChatOpts): Promise<string>;                           // non-streaming
  stream(opts: ChatOpts, onChunk: (text: string) => void): Promise<void>;
}
```

All HTTP via `requestUrl`. Ollama's local `http://localhost:11434` is also fine through requestUrl — the CORS bypass is unconditional.

**Streaming UX:**
Streaming chunks arrive via `requestUrl`'s buffered response (Obsidian's `requestUrl` returns the full body, NOT a stream). Three paths considered:

| Path | Verdict |
|---|---|
| Native streaming via `requestUrl` chunked reads | Not exposed in Obsidian's API — `requestUrl` returns a single `RequestUrlResponse`. |
| Polling completion endpoint (e.g. Anthropic's stream endpoint) with `text/event-stream` parsed from a fully-buffered response | Works for Anthropic/OpenAI; their SSE bodies arrive as one buffered string post-completion if not streamed; this defeats the streaming UX. |
| Use the underlying `electron.net` API via `(window as any).electron.remote.net` or Node's `http` (forbidden by community-plugin rules). | NOT VIABLE. |
| **Recommended:** issue the non-streaming completion call. Render the full response into the modal once it arrives. Show a deterministic "Thinking…" indicator with elapsed time. | Honest about Obsidian's HTTP API limits; avoids forbidden Electron internals. Differentiator is content quality, not streaming animation. |

If the user really wants visible streaming and the model supports it (Anthropic/OpenAI do), a pragmatic hack works: `requestUrl` with a long-poll body that responds with chunked text. Some providers' SSE endpoints DO incrementally flush to the buffered response (the body grows over time and can be polled mid-flight). Treat this as **v1.1 polish, not blocker** — the modal architecture supports either mode without reshaping.

**AI Debug — what context is sent:**
- The locked `## Problem` section text (read fresh from the active note via `app.vault.read`)
- The user's `## Code` block extracted via `extractFirstFencedBlock` (already exported from `src/solve/codeExtractor.ts`)
- The most-recent failing run/submit verdict — captured from the existing `VerdictModal` flow. The `submitFromActive` and `runInterpretedInput` paths already have access to `terminal` (`SubmitCheckResponse` / `RunCheckResponse`). A new `LastVerdictStore` (in-memory, per-slug) caches the last terminal verdict for use by AI Debug. Tiny new component (~30 LOC).

**Where AI Review gets written — RECOMMENDATION:**
Add a NEW H2 **`## AI Review`** to the canonical anchor order, inserted between `## Techniques` and `## Notes`. **The heading goes into LOCKED_HEADINGS**; the body stays editable for the user to annotate.

| Option | Verdict |
|---|---|
| Frontmatter | Rejected — review content is markdown-rich, multi-paragraph. Frontmatter clutter. |
| Sibling `{slug}-review.md` | Rejected — fragments the graph. The whole point is one note per problem with everything linked. |
| Inline under `## Notes` | Rejected — `## Notes` is the user's surface; plugin must NOT write into it (Phase 2 D-08, sectionLockExtension D-08). |
| **NEW `## AI Review` H2** (recommended) | Accepted — symmetric with `## Techniques`. Same write primitive (`app.vault.process` + a pure transform mirroring `mergeTechniquesSection`). Same lock posture (heading locked, body editable for user re-organization). |

Add `lc-ai-reviewed-at` (ISO timestamp) to frontmatter so the writer can dedupe and the user can graph-query "problems where AI review is stale".

**Migration consequence — pattern clusters supersede lc-tag Techniques:**

Three options, ranked:

| Option | Recommendation |
|---|---|
| **Migrate on-demand:** when KnowledgeGraphWriter writes to ANY note, if the note's `## Techniques` is in legacy lc-tag mode, rewrite it to cluster mode. Skip never-touched notes. | **Recommended.** Zero startup cost. User sees migration as a side-effect of natural re-engagement. Old notes stay valid (lc-tag wikilinks still resolve to existing technique stubs). |
| Manual command "Migrate techniques to clusters" | Adds a one-shot command for impatient users. **Ship as a complement to on-demand**, not the only path. |
| Batch-rewrite all notes on plugin upgrade | Rejected — slow, error-prone (requires AI calls during plugin load), surprises the user. |

**Implementation:** `mergeTechniquesSection` gets a strategy parameter — `'lc-tags' | 'cluster'`. The cluster strategy replaces all topic-tag wikilinks with a single cluster wikilink. Legacy topic-tag wikilinks are NOT removed automatically (that would feel destructive); they coexist below the new cluster link until the user manually prunes. The AI Knowledge Graph spec wants pattern clusters to *supersede* — so a future "clean up legacy lc-tag links" command is a follow-up, not blocker.

**Forward-looking edges (look-ahead) — wikilinks to non-existent notes:**
Yes, the existing browser already has the capability to detect "this is an unresolved-link click." When the user clicks an unresolved `[[Foo Problem]]` wikilink in any note, Obsidian fires `app.workspace.on('file-open', ...)` for a new file event. We register a hook (NEW: `unresolvedLinkRouter`) that intercepts clicks on wikilinks whose target matches our `LeetCode/{id}-{slug}.md` filename pattern but whose file doesn't exist yet — and offers Preview / Start the same way the browser does. Or simpler: name look-ahead targets with a special prefix (e.g. `LeetCode/_Look-ahead/{slug}.md`) and let them stay dangling (Obsidian's unresolved-link styling makes them visually distinct — that's the point).

**Recommendation: dangling wikilinks, not stub notes.** Stubs would clutter the vault and create the wrong graph signal (look-ahead is "you should solve this," not "here's a note about it"). Detection of "click on a look-ahead link" is a v2 polish if needed.

---

### 3.4 Provider settings

**Where in PluginSettingTab:**
NEW "AI" section in `SettingsTab.display()`, sibling to "Knowledge graph". Order: Authentication → Manual cookie → Notes → Knowledge graph → **AI** → (later v1.2) Contest. Mounted via a factored `AISettingsSection.render(containerEl, plugin)` to keep `SettingsTab.ts` from ballooning past 300 LOC.

Fields:
- Provider (dropdown: Anthropic / OpenAI / OpenRouter / Bedrock / Ollama / Custom)
- Base URL (text input; placeholder per provider; editable for Custom)
- Model (text input — free-form; LC-style starter doesn't apply here because models change weekly)
- API key (password input)
- "Test connection" button (sends a 1-token completion request; surfaces success/failure as a Notice)
- AI Review toggle (default ON for users who want auto-review; OFF for those who want explicit only)
- AI Debug rate budget (default: max 20 calls/hour; soft limit Notice)

**Where the API key is stored:**
`data.json` under `PluginData.aiKey`. **Plain text. Local-only.** Obsidian doesn't expose Keychain/Credential Manager APIs to plugins, and any encryption at rest using a key stored in the same file is theatre. The README MUST disclose:

> AI provider API keys are stored unencrypted in your vault's `.obsidian/plugins/obsidian-leetcode/data.json` file. This file lives entirely on your machine. The plugin never transmits your key anywhere except the configured AI provider endpoint. Treat your vault folder as you would any local file containing secrets — back it up securely and avoid committing the plugin's data.json to public version control.

This is the same posture as the existing `LEETCODE_SESSION` cookie (also plain in data.json) — precedented and disclosed.

**Multi-key vs single-key:**
**One active provider, one key per provider stored.** UI shows the active provider's settings; switching provider doesn't wipe the previous provider's key. Internal shape:
```ts
aiProviders: {
  anthropic?: { baseUrl: string; model: string; key: string };
  openai?: { ... };
  // ...
};
aiActive: 'anthropic' | 'openai' | ...;
```

Multi-key UX where users juggle keys per call is rare and easy to design wrong; the per-provider stash is forgiving (switch back to the previous provider and your config is still there).

---

### 3.5 Section-lock interaction (CRITICAL)

**AI-written content lands in:**

| AI write | Target section | Lock posture | Write primitive |
|---|---|---|---|
| AI Review | NEW `## AI Review` (heading locked, body editable) | Touches LOCKED region (heading line + structural insertion point) | **`app.vault.process`** with a pure transform mirroring `mergeTechniquesSection`. Bypasses CM6 transactionFilter — vault writes happen below the editor layer. |
| AI Debug | A modal (`AIStreamModal`) — never lands in the note | N/A | DOM only. |
| Cluster wikilink in `## Techniques` | Existing `## Techniques` (heading locked, body editable) | Body, NOT heading | **`app.vault.process`** + updated `mergeTechniquesSection` strategy |
| `## Related Variants` | NEW `## Related Variants` (heading locked, body editable) | Touches LOCKED region | **`app.vault.process`** with insert-or-rewrite-region helper |
| Look-ahead links | Inside `## Related Variants` (or `## Techniques` body) | Body | **`app.vault.process`** |
| Cluster hub note (`LeetCode/Patterns/{X}.md`) | NEW vault note | N/A — separate file | `app.vault.create` (first time), `app.vault.process` (updates) |
| `lc-cluster`, `lc-ai-reviewed-at`, `lc-contest-id` frontmatter | Frontmatter (always editable in Obsidian) | N/A | **`app.fileManager.processFrontMatter`** |

**Critical rule (per CLAUDE.md CONVENTIONS):**
NO AI-write code path uses `cm.dispatch`. Every AI write goes through `app.vault.process` (body) or `app.fileManager.processFrontMatter` (frontmatter). This bypasses the section-lock changeFilter by design (the filter operates on CM6 transactions; vault writes happen below CM6).

If a future v1.1 feature ever needs to mutate the live editor view directly (e.g., a "stream AI suggestions inline at cursor" feature) it MUST set `userEvent: 'leetcode.ai-stream'` on `cm.dispatch` per the established convention. **Recommended: don't build that. Use modals and vault.process. The convention exists; respect it but don't strain it.**

---

## 4. Recommended Project Structure (additions)

```
src/
├── ai/                                  # NEW
│   ├── AIClient.ts                      # provider-agnostic facade
│   ├── AIProvider.ts                    # interface + types
│   ├── providers/
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── openrouter.ts
│   │   ├── bedrock.ts
│   │   └── ollama.ts
│   ├── prompts.ts                       # versioned prompt templates
│   ├── AIDebugCommand.ts                # context assembly + stream invocation
│   ├── AIStreamModal.ts                 # progressive-fill modal
│   ├── AIReviewWriter.ts                # vault.process-based ## AI Review writer
│   ├── AIReviewQueue.ts                 # rate-limit + dedupe + persistence
│   ├── PatternClusterEngine.ts          # classify(slug) → cluster
│   ├── ClusterHubWriter.ts              # LeetCode/Patterns/{Cluster}.md
│   ├── RelatedVariantsWriter.ts         # ## Related Variants section
│   └── LastVerdictStore.ts              # in-memory last terminal per slug
│
├── contest/                             # NEW
│   ├── ContestController.ts             # lifecycle: start, end, finalize
│   ├── ContestSession.ts                # in-memory state + serialization
│   ├── ContestSessionStore.ts           # data.json persistence
│   ├── ContestStartModal.ts             # picker UI
│   ├── ContestStatusBar.ts              # status-bar item + tick
│   ├── ContestSummaryWriter.ts          # LeetCode/Contests/{date}-{id}.md
│   └── contestCatalog.ts                # past-contest list (cached)
│
├── preview/                             # NEW
│   ├── ProblemPreviewView.ts            # ItemView with read-mode rendering
│   └── previewRouter.ts                 # routeProblemClick(slug, status, intent)
│
├── settings/
│   ├── SettingsStore.ts                 # MODIFIED — extends PluginData
│   ├── SettingsTab.ts                   # MODIFIED — new sections mounted
│   └── AISettingsSection.ts             # NEW — factored AI panel
│
├── browse/
│   └── ProblemBrowserView.ts            # MODIFIED — row click → previewRouter
│
├── graph/
│   ├── KnowledgeGraphWriter.ts          # MODIFIED — adds steps 4 (review) + 5 (cluster)
│   └── mergeTechniquesSection.ts        # MODIFIED — strategy param: 'lc-tags' | 'cluster'
│
├── notes/
│   └── NoteTemplate.ts                  # MODIFIED — new lc-* keys, new H2 entries
│
├── main/
│   └── sectionLockExtension.ts          # config-only change via NoteTemplate re-export
│
└── main.ts                              # MODIFIED — onload steps 5.9–5.13 wire new subsystems
```

### Structure rationale

- **`src/ai/`:** All AI logic is one bounded subsystem. Provider adapters are isolated so adding a new provider (Gemini, Mistral) is a single new file. Prompts are isolated so prompt-version bumps don't touch logic.
- **`src/contest/`:** Contest is an entirely new lifecycle with its own state machine. Keeping it parallel to `src/solve/` (the v1.0 lifecycle) makes the boundary obvious.
- **`src/preview/`:** Tiny — just two files. But conceptually separate from `src/browse/` (which is "list browsing") and from `src/notes/` (which is "writing to disk"). Preview is "ephemeral read."
- **No reorganization of v1.0 directories:** v1.0 modules stay where they are. Only `KnowledgeGraphWriter`, `mergeTechniquesSection`, `NoteTemplate`, `SettingsStore`, `SettingsTab`, `ProblemBrowserView`, and `main.ts` get touched. Risk surface is minimized.

---

## 5. Architectural Patterns (v1.1-specific)

### Pattern 1: Provider-agnostic AI client via interface
**What:** `AIProvider` interface; one adapter per provider. `AIClient` selects adapter from settings.
**When:** Any time multiple external services share a logical API surface (chat completion).
**Trade-offs:** + Adding a provider is a new file, no edit. − Each adapter must independently handle auth headers, body shape, error mapping.

```ts
// src/ai/AIProvider.ts
export interface AIProvider {
  chat(opts: { system: string; user: string; maxTokens?: number }): Promise<string>;
  stream?(opts: { system: string; user: string }, onChunk: (text: string) => void): Promise<void>;
}

// src/ai/AIClient.ts
export class AIClient {
  constructor(private readonly settings: AISettingsFacade) {}
  private getProvider(): AIProvider {
    const active = this.settings.getActiveProvider();
    return providerRegistry[active](this.settings.getProviderConfig(active));
  }
  chat(opts: ChatOpts) { return this.getProvider().chat(opts); }
}
```

### Pattern 2: vault.process for all AI writes (mandatory)
**What:** Every AI write to a problem note funnels through `app.vault.process(file, current => transformed)`. Pure transforms; safe under Obsidian's retry-on-conflict.
**When:** Always for AI writes. Never `vault.modify`. Never `cm.dispatch` (unless `userEvent: 'leetcode.*'` annotated, which we don't need for AI).
**Trade-offs:** + Bypasses section lock by design. + Idempotent under concurrent writes. + Retry-safe. − No live-editor streaming UX (do streaming in a modal instead).

```ts
// src/ai/AIReviewWriter.ts
async writeReview(file: TFile, review: AIReview): Promise<void> {
  await this.app.vault.process(file, (current) =>
    mergeAIReviewSection(current, review),  // pure transform
  );
  await this.app.fileManager.processFrontMatter(file, (fm) => {
    fm['lc-ai-reviewed-at'] = new Date().toISOString();
  });
}
```

### Pattern 3: Persistent state in data.json with versioned shape
**What:** Active contest sessions, AI review queue, cluster index, AI provider config — all extend `PluginData`. Migrations follow the precedent in `SettingsStore` (legacy base notice flag, premium auto-default).
**When:** Any cross-session state. Never use separate hidden files (community-plugin reviewers flag them).
**Trade-offs:** + Single load/save path. − Schema must be carefully versioned; corrupt data.json kills all settings.

### Pattern 4: Feature flags for graceful v1.0 ↔ v1.1 coexistence
**What:** `PluginData.featureFlags = { aiReview: boolean; clusterMode: boolean; preview: boolean }`. Allows shipping v1.1 with each AI feature individually toggleable.
**When:** Risky milestone with multiple decoupled features that may need to be disabled in the field.
**Trade-offs:** + Easy hotfix path ("turn off AI Review for all users"). − Adds branching in code paths.

### Pattern 5: On-AC fanout (extending the existing pattern)
**What:** `KnowledgeGraphWriter.onAccepted` is the single dispatcher for "user just solved a problem" events. v1.1 adds steps 4 and 5 to its existing 3-step pipeline.
**When:** Any AI work that should fire on accepted submission.
**Trade-offs:** + Single integration point — the v1.0 pattern is proven. − KGWriter becomes the "god object" of accepted-submission side effects; mitigate by keeping each step's logic in its own module (`AIReviewQueue.queue(...)`, `PatternClusterEngine.refresh(...)`).

---

## 6. Suggested build order (phases 06–12)

**Foundational ordering rationale:**
- AI provider settings + AIClient must exist before AI Debug or AI Review (Phase 06).
- Preview must land before Contest (Contest's "open 4 problems" optionally goes through preview tabs; even if it doesn't, Preview's `previewRouter` refactor of `ProblemBrowserView` simplifies Contest's problem-opening code).
- AI Debug is the simplest AI feature (button-triggered, no on-AC integration, modal-only output) — ship it first to validate the AI subsystem end-to-end.
- AI Review is incremental on top of AI Debug (reuses AIClient + adds vault.process write path).
- AI Knowledge Graph (clusters) requires AI Review's prompt infrastructure; ship it after.
- Contest is independent of AI but depends on Preview.

### Phase 06 — Preview Mode
**Why first:** Smallest, lowest risk, refactors the browser's row-click handler in a way that pays off for Contest later.
**Builds:** `ProblemPreviewView`, `previewRouter`, modified `ProblemBrowserView` row click, modified `main.ts` view registration + `routeProblemClick` method.
**Cuts loose:** No AI dependency. Ships standalone.

### Phase 07 — AI Provider Foundation
**Why second:** Every other AI feature depends on it.
**Builds:** `AIClient`, `AIProvider` interface, all 5 provider adapters, `AISettingsSection`, `SettingsStore` shape extension (`aiProviders`, `aiActive`, `aiKey`), README disclosure.
**Cuts loose:** Test connection button validates end-to-end without any vault interaction. Pure AI plumbing.

### Phase 08 — AI Debug
**Why third:** Validates the AI subsystem on a button-triggered, modal-only path. Lowest risk for AI integration.
**Builds:** `AIDebugCommand`, `AIStreamModal`, `LastVerdictStore`, prompt template, "AI Debug" button in reading-mode + edit-mode action rows (extends existing `codeBlockButtonRow`).
**Cuts loose:** No vault writes. No on-AC integration. Pure UI + HTTP.

### Phase 09 — AI ACed Review
**Why fourth:** First AI write to a problem note — exercises the section-lock safety convention. Reuses Phase 07's AIClient and Phase 08's prompt infrastructure.
**Builds:** `AIReviewWriter`, `AIReviewQueue` (rate-limit + dedupe + data.json persistence), new `## AI Review` H2 (extends `LOCKED_HEADINGS`), modified `KnowledgeGraphWriter.onAccepted` (step 4), `lc-ai-reviewed-at` frontmatter, "Re-run AI review" command.
**Cuts loose:** Doesn't touch ## Techniques. Adds a new H2 alongside.

### Phase 10 — Contest (virtual + analysis)
**Why fifth:** Independent of AI. Depends on Preview's `previewRouter`. Ships as standalone polish.
**Builds:** `ContestController`, `ContestSession`, `ContestSessionStore`, `ContestStartModal`, `ContestStatusBar`, `ContestSummaryWriter`, `contestCatalog` (past-contest list cache), `lc-contest-id` frontmatter key, `LeetCode/Contests/` folder convention.
**Cuts loose:** No new AI code. Optional: AI commentary on summary note (gated by Phase 09 being shipped).

### Phase 11 — AI Knowledge Graph (clusters + variants + look-ahead)
**Why sixth:** Largest scope, riskiest migration. Depends on Phase 07 (AIClient) and Phase 09 (review patterns + on-AC step pipeline).
**Builds:** `PatternClusterEngine`, `ClusterHubWriter`, `RelatedVariantsWriter`, modified `mergeTechniquesSection` (strategy param), modified `KnowledgeGraphWriter.onAccepted` (step 5 = cluster refresh), `lc-cluster` frontmatter, on-demand migration logic, `LeetCode/Patterns/` folder convention, `## Related Variants` new H2.
**Cuts loose:** Migration is on-demand (no batch rewrite of historical notes — the user re-engages naturally and notes upgrade lazily).

### Phase 12 — Polish, migration command, plugin-store re-submission
**Why last:** Validates everything together. Plugin-store rules (new disclosure for AI calls + AI keys) need a re-review.
**Builds:** "Migrate techniques to clusters" one-shot command, README updates (AI disclosure, contest UX, preview UX, key storage warning), version bump to 1.1.0, manifest re-validation, GitHub release artefacts.

### Parallelization opportunities

These phases can be developed concurrently (with some merge conflict risk):
- **Phase 10 (Contest)** and **Phase 09 (AI Review)** — both modify `main.ts` onload but in distinct sections. Independent test surfaces.
- **Phase 11 (Cluster)** subcomponents — `PatternClusterEngine` (classification), `ClusterHubWriter` (file I/O), `RelatedVariantsWriter` (section transform) can be built in parallel by different contributors as they share only the engine's classify() output.

These phases must be sequential:
- 06 → 10 (Contest's `previewRouter` reuse)
- 07 → 08 → 09 → 11 (AI dependency chain)
- 09 → 11 (cluster engine reuses review prompt infrastructure)

### Compressed alternative (if 7 phases is too many)

If pressure to compress to 5–6 phases:
- Merge **06+10** as "Preview + Contest" (both are "alternative ways to engage problems")
- Merge **08+09** as "AI Debug + AI Review" (both are user-facing AI on existing problems)
- Keep **07** standalone (settings groundwork)
- Keep **11** standalone (largest)
- Keep **12** standalone (ship)

That's 5 phases. Riskier merge conflicts, but viable.

---

## 7. Anti-patterns to avoid

### Anti-Pattern 1: Streaming AI text directly into the live editor
**What people do:** Use `cm.dispatch` to insert AI tokens at cursor as they arrive.
**Why it's wrong:** Section lock will silently drop transactions unless `userEvent: 'leetcode.ai-stream'` is set; even then, every keystroke creates an undo entry; concurrent user edits race the AI; the locked-region rule is fragile under streaming.
**Do this instead:** Stream into a modal. Let the user copy/paste the result. If they want it in the note, they paste into `## Notes`.

### Anti-Pattern 2: Storing AI keys behind home-grown encryption
**What people do:** Encrypt the API key in data.json with a key derived from… something on the same machine.
**Why it's wrong:** It's theatre. The decrypt key is on the same machine as the encrypted secret. Worse: the user thinks the key is protected and starts being careless.
**Do this instead:** Store in plain data.json. Disclose in README. Match the existing v1.0 cookie posture.

### Anti-Pattern 3: Batch-rewriting all historical notes on plugin upgrade
**What people do:** "Migrate every existing problem note to the new cluster scheme on first launch of v1.1."
**Why it's wrong:** Slow; potentially 100s of AI calls before the user has consented to AI usage; surfaces network errors at startup; users lose trust in the upgrade.
**Do this instead:** On-demand migration. Each note upgrades naturally on next AC or explicit user command.

### Anti-Pattern 4: A new ItemView for the contest timer
**What people do:** Build a side-panel ContestView that displays the timer and active problems.
**Why it's wrong:** Contest is a state, not a screen. Side panels fight for the screen real estate the user is using to solve. Status bar is the precedent.
**Do this instead:** Status bar item. Click to open a tiny popover with "End contest" / "Open summary".

### Anti-Pattern 5: Hidden `.planning/`-style files for runtime state
**What people do:** Persist active contest session to a hidden file under `.obsidian/plugins/...`.
**Why it's wrong:** Two persistence mechanisms; data.json was already chosen and works. Runtime state belongs in PluginData.
**Do this instead:** Extend `PluginData`. The schema is versioned and migration-friendly.

### Anti-Pattern 6: Forgetting the `userEvent: 'leetcode.*'` convention if cm.dispatch is unavoidable
**What people do:** Add a v1.1 cm.dispatch call (e.g., a helper that bulk-inserts AI suggestions into a code block) without the userEvent annotation.
**Why it's wrong:** Section-lock changeFilter silently drops the change. Bug is invisible until the user reports "AI did nothing."
**Do this instead:** Audit every new `cm.dispatch` callsite during code review. Use `app.vault.process` whenever possible — it bypasses the lock by design and is the established convention.

---

## 8. Integration Points

### 8.1 External services (NEW for v1.1)

| Service | Integration Pattern | Notes |
|---|---|---|
| Anthropic API | `requestUrl` POST to `https://api.anthropic.com/v1/messages`; `x-api-key` header; user-supplied model | No streaming via `requestUrl`; non-streaming completion only. Body shape lives in `src/ai/providers/anthropic.ts`. |
| OpenAI API | `requestUrl` POST to `https://api.openai.com/v1/chat/completions`; `Authorization: Bearer` | Well-documented body schema. |
| OpenRouter | `requestUrl` POST to `https://openrouter.ai/api/v1/chat/completions`; OpenAI-compatible body | Single key gives access to most models. Recommended default for users who want flexibility. |
| AWS Bedrock | `requestUrl` POST to user-supplied endpoint URL with SigV4 signing | SigV4 in-browser is non-trivial; alternative: require user to use a Bedrock proxy. **Recommend deferring Bedrock to v1.2** — adds days of crypto work for a small slice of users. |
| Ollama (local) | `requestUrl` POST to `http://localhost:11434/api/chat`; no auth | Easiest provider. requestUrl works for localhost. Good fallback for cost-sensitive users. |
| LeetCode contest API (existing GraphQL surface via `@leetnotion/leetcode-api`) | Existing `LeetCodeClient` extension — query past contests + their problem slugs | No new HTTP surface; reuse existing client. |

### 8.2 Internal boundaries (additions)

| Boundary | Communication | Notes |
|---|---|---|
| `LeetCodePlugin` ↔ `AIClient` | Direct method call: `plugin.aiClient.chat(opts)` | AIClient owns settings facade for provider/model selection |
| `KnowledgeGraphWriter` ↔ `AIReviewQueue` | KGWriter calls `queue.enqueue(slug)` fire-and-forget | Queue persists state; survives reload |
| `KnowledgeGraphWriter` ↔ `PatternClusterEngine` | KGWriter calls `engine.refresh(slug)` fire-and-forget | Engine writes hub notes + updates `lc-cluster` frontmatter |
| `ProblemBrowserView` ↔ `previewRouter` | View calls `plugin.routeProblemClick(slug, status, intent)` | Router dispatches to preview or NoteWriter |
| `ContestController` ↔ `NoteWriter` | Controller calls `notes.openProblem(slug)` for each of 4 problems | NoteWriter unchanged — Contest is a higher-level orchestrator |
| `ContestController` ↔ `app.fileManager.processFrontMatter` | After NoteWriter creates/reveals each note, controller stamps `lc-contest-id` | Standard frontmatter primitive |
| `ContestStatusBar` ↔ `ContestSession` | Status bar reads in-memory session via `plugin.activeContest`; ticks via `registerInterval` | No event bus needed; polling at 1s is cheap |
| `AIReviewWriter` ↔ Vault | All writes via `app.vault.process` (body) + `processFrontMatter` (frontmatter) | NEVER `vault.modify`. NEVER `cm.dispatch`. |

### 8.3 Settings facade (per-feature)

Each new subsystem takes a structural settings facade (matches existing v1.0 pattern from `KnowledgeGraphWriter`):

```ts
// src/ai/AIClient.ts
interface AISettingsFacade {
  getActiveProvider(): 'anthropic' | 'openai' | 'openrouter' | 'bedrock' | 'ollama';
  getProviderConfig(p: string): { baseUrl: string; model: string; key: string } | null;
}

// src/contest/ContestController.ts
interface ContestSettingsFacade {
  getProblemsFolder(): string;
  getContestsFolder(): string;
  getActiveContestSession(): SerializedContestSession | null;
  setActiveContestSession(s: SerializedContestSession | null): Promise<void>;
}
```

This keeps tests free of the full `SettingsStore` and matches v1.0's DI discipline.

---

## 9. Sources

Source files read directly from the repo at `/Users/moxu/projects/obsidian-leetcode/`:

- `.planning/PROJECT.md` — v1.1 milestone scope and decisions
- `.planning/MILESTONES.md` — v1.0 phase summary, locked architectural conventions
- `CLAUDE.md` — section-lock + `'leetcode.*'` userEvent convention; `app.vault.process` discipline
- `src/main.ts` (1170 lines) — onload sequence, command wiring, on-AC dispatch site, switchFenceLanguage as the canonical `'leetcode.lang-switch'` callsite
- `src/browse/ProblemBrowserView.ts` — row-click handler, ItemView lifecycle pattern
- `src/notes/NoteWriter.ts` — open-problem orchestrator, retrofit pattern, on-open hook injection
- `src/notes/NoteTemplate.ts` — `LOCKED_HEADINGS`, `PLUGIN_LC_KEYS`, canonical anchor order
- `src/graph/KnowledgeGraphWriter.ts` — on-AC pipeline, gating matrix, vault.process discipline
- `src/main/sectionLockExtension.ts` — change filter, `'leetcode.*'` bypass
- `src/main/codeActionsEditorExtension.ts` — CM6 block widget pattern for action rows
- `src/settings/SettingsTab.ts` — section structure precedent
- `src/settings/SettingsStore.ts` — `PluginData` shape, persisted runtime state precedents
- `src/api/requestUrlFetcher.ts` (referenced) — throttled HTTP layer
- `src/solve/codeExtractor.ts`, `src/solve/starterCodeInjector.ts`, `src/notes/HeadingRegion.ts` — pure transform helpers reused by new AI write paths

Confidence: **HIGH** — every integration point cited is a verified line of existing code or a documented convention. No speculation.

---

*Architecture research for: Obsidian LeetCode plugin v1.1 milestone (Preview, Contest, AI Coach, AI Knowledge Graph)*
*Researched: 2026-05-14*
