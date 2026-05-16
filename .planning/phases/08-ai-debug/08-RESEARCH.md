# Phase 08: AI Debug — Research

**Researched:** 2026-05-15
**Domain:** Streaming AI consumption inside Obsidian (Vercel AI SDK 6.x `streamText` over `electron.net.fetch`); modal lifecycle + cancel; live Markdown rendering; verdict-driven prompt assembly
**Confidence:** HIGH

---

## Summary

Phase 08 is the first live customer of the seam Phase 07 stubbed: `obsidianFetch('stream')` flows directly into Vercel AI SDK 6.x `streamText` via the `fetch` injection on every `@ai-sdk/*` provider factory. The provider package versions pinned in `package.json` (`ai@6.0.183`, `@ai-sdk/anthropic@3.0.78`, `@ai-sdk/openai@3.0.64`, `@ai-sdk/openai-compatible@2.0.47`) all expose the `fetch` option uniformly and `streamText` returns a `StreamTextResult` whose `textStream` is an `AsyncIterableStream<string>` consumable directly by `for await (const chunk of result.textStream)`. The exact import is `import { streamText } from 'ai'` (core, not per-provider). Five planning decisions are now LOCKED by code-side verification, not training data:

1. **`streamText` carries first-class `abortSignal: AbortSignal`** — propagated into the model's `doStream` call where the underlying `fetch` (our `obsidianFetch('stream')`) receives `init.signal`. `electron.net.fetch` honors `init.signal` (Electron 28+, available since Obsidian 1.7+; our `minAppVersion` is well above this). `requestUrl` does NOT honor signals — confirmed via the `requestUrl` source path in `src/ai/obsidianFetch.ts:106-117` (no signal forwarding). User-visible cancel on the fallback path is "close modal + ignore response when it lands."

2. **Cost ledger on cancel:** `streamText` exposes `onAbort?: StreamTextOnAbortCallback<TOOLS>` whose payload carries `steps: StepResult<TOOLS>[]` (already-finished steps), but `usage` is NOT directly exposed in the abort callback. The `result.usage: PromiseLike<LanguageModelUsage>` Promise rejects on abort because the stream errored. **Recommendation: add `0` to ledger on cancel (`AbortError` branch).** Document in plan + JSDoc.

3. **Live Markdown re-render-per-chunk is the highest-uncertainty decision in Phase 08.** Obsidian's `MarkdownRenderer.render` parses the entire Markdown string each call, builds a fresh DOM tree, and inserts it into the container. For a streaming response with ~50–100 chunks of 20–80 chars each (typical 2000-token Anthropic stream), N full re-renders happen. No published Obsidian benchmarks exist for repeated re-renders at this rate. **Recommended posture: ship live-per-chunk first (user-locked preference), but implement a 100ms debounce ring buffer behind a single feature toggle in `AIStreamModal` so the planner can flip to debounced if dogfood reveals flicker/jank.** Detailed mitigation table in `## Common Pitfalls` Pitfall 1.

4. **`LastVerdict` field set is locked against actual orchestrator/poller output**, not invented. Source-of-truth: `src/solve/types.ts` `RunCheckResponse` + `SubmitCheckResponse`. Run failures populate `code_answer` / `expected_code_answer` / `compare_result` / `status_runtime` / `status_msg` / `runtime_error` / `compile_error`; submit failures populate `input` / `last_testcase` / `std_output` / `expected_output` / `runtime_error` / `compile_error` / `status_runtime` / `status_memory`. Detailed mapping in decision-locked LastVerdict shape below.

5. **Verdict-Accepted classification helper already exists** at `src/solve/statusMap.ts:40` (`classifyStatus(code, msg).kind === 'ac'`). Phase 08 reuses this rather than spawning a new helper — the existing surface is the cleanest seam. The ALSO-existing `assertKnownVerdictOrThrow(terminal)` in `src/solve/verdictGuard.ts` is for the Unknown-verdict guard; not the Accepted check.

**Primary recommendation:** Implement `AIClient.invokeStream(req): Promise<StreamTextResult<{}, {}>>` (returns the SDK result object directly so the modal can consume `textStream` AND await `onFinish`/`usage` independently). The modal owns the `AbortController`. Cost ledger updates on `onFinish` event, NOT on `onAbort`. Disclosure copy extension via factory `withDebugBullet(DISCLOSURE_BASE_COPY)` exported from `src/ai/disclosure.ts`. LastVerdictStore lives at `src/solve/lastVerdictStore.ts` (close to the orchestrators that populate it). All three button surfaces (Edit-Mode CM6, Reading-Mode post-processor, palette command) delegate to single entrypoint `LeetCodePlugin.openAIDebug(slug)`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AI streaming transport | Renderer → `obsidianFetch('stream')` → `electron.net.fetch` → Anthropic/OpenAI/OpenRouter/Ollama/Custom | — | Phase 07 wired the seam; this phase consumes it. CORS bypass via electron net fetch. |
| AI fallback transport (no streaming) | Renderer → `obsidianFetch('request')` → Obsidian `requestUrl` | — | When `loadElectronNet()` throws (sandboxed renderer / mobile edge). Always non-streaming buffered Response. |
| Stream consumption | Renderer (`AIStreamModal.onOpen()` → `for await (const chunk of result.textStream)`) | — | Modal owns the AbortController + textStream iterator + body re-render loop. |
| Verdict capture | `src/solve/lastVerdictStore.ts` (Map-on-Plugin-instance) populated by `submissionOrchestrator` + `pollingOrchestrator` post-resolve callback | — | In-memory only, slug-keyed, cleared on plugin reload. Mirrors `EphemeralTabStore` pattern. |
| Prompt assembly | `src/ai/buildDebugPrompt.ts` (pure function) | — | Stateless. Reads problem markdown via `getProblemDetail` (cache or fresh), `## Code` content via `HeadingRegion` helpers, last verdict via `LastVerdictStore.get(slug)`. |
| Disclosure gate | Phase 07 `AIClient.invokeStream` (gate seam already exists at `AIClient.invoke` line 130-160) | Renderer (`AIDisclosureModal`) | Phase 08 inherits the gate by routing through AIClient. Gate fires BEFORE streaming starts. |
| Modal UX (live render + cancel + counter) | Renderer (`Modal` subclass `AIStreamModal`) | — | Single class owns DOM, AbortController, mm:ss counter via `setWindowTimeout`, copy-to-clipboard. |
| Verdict modal AI Debug button | Renderer (extend `VerdictModal` footer + `RunModal` failure footer) | — | Conditional on non-Accepted verdict. Click closes verdict modal + opens AIStreamModal. Reuses `classifyStatus` from statusMap. |
| Code-fence button row | Renderer (extend `buildCodeBlockButtonRow`) | — | Single factory consumed by Edit-Mode CM6 widget AND Reading-Mode post-processor. 3rd button ("AI: Debug") — both surfaces inherit. |
| Palette command (`ai-debug`) | Renderer (`addCommand` in `LeetCodePlugin.onload`) | — | `editorCheckCallback`-guarded by `lc-slug` frontmatter. Single delegation to `openAIDebug(slug)`. |

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Prompt scope.** Mandatory inputs: (1) Problem text (full statement, examples, constraints — assembled via `getProblemDetail(slug)` cache or fresh fetch), (2) `## Code` content (active fence's text, read via `HeadingRegion` helpers — no cm.dispatch), (3) Last verdict + failing test (from `LastVerdictStore.get(slug)`), (4) Selected code language (fence info-string at the moment Debug fires). **`## Notes` is NEVER sent** (REQUIREMENTS.md "AI rewriting `## Notes`" out-of-scope; same posture extends to "AI reading `## Notes`"). Topic tags + difficulty + URL/slug deferred. Empty-store path: Phase 08 STILL sends the prompt with literal `"No verdict yet — review the code as-is."` line; button stays visible (decision C).

**B. LastVerdictStore.** Captured on BOTH Run failures (any non-pass sample/custom test) AND Submit failures (judge WA / TLE / MLE / RE / CE / OLE / IE). NOT captured on Accepted. Scope: per-slug `Map<slug, LastVerdict>` on `LeetCodePlugin` instance. Persistence: in-memory only — cleared on plugin reload. No `data.json` field. Mirrors `EphemeralTabStore` precedent.

**C. Button placement — three surfaces.**
- Surface 1: `## Code` button row — 3rd button, label `'AI: Debug'`, both Edit-Mode CM6 widget AND Reading-Mode post-processor. DOM order: `[chevron-prefix?] [Run] [Submit] [AI: Debug]`. Always visible when fence is under `## Code`. Test contract: `tests/main/codeBlockButtonRow.test.ts` no-prefix path bumps from "exactly 2 children" → "exactly 3 children"; chevron-prefix path bumps from 3 → 4.
- Surface 2: Verdict modal footer — conditional on non-Accepted verdict (`classifyStatus(code).kind !== 'ac'`). Click closes verdict modal + opens AIStreamModal.
- Surface 3: Palette command `ai-debug` (clean ID, no prefix). Label: `'AI: Debug current code'`. `editorCheckCallback`-guarded by `lc-slug` frontmatter.

**D. Modal UX — AIStreamModal.** Class: new `src/ai/AIStreamModal.ts` extending `Modal`. Title: `AI Debug — {prettyName(provider)}`. Body render strategy: live Markdown re-render per chunk (locked, but flagged for verification — see decision D-Mitigation). Footer during stream: single `[Cancel]`. On completion: `[Copy response to clipboard]` + `[Close]`. Cancel: `abortController.abort()` + freeze body + replace footer with `[Close]` + `[Copy]` + "Cancelled" header. Modal stays open — user keeps partial output. Fallback path (`requestUrl`): body shows `'Thinking…'` + `mm:ss` counter via `setWindowTimeout`. Cancel during fallback: closes modal immediately; in-flight call may complete in background (requestUrl has no abort).

**D-Mitigation (locked): live-per-chunk shipping default; planner adds 100ms debounce flag if researcher's verification turns up flicker/jank.** Researcher recommends **debounced (100ms) ring buffer** as the default ship — see Pitfall 1 below.

**E. AIRequest / AIResponse expansion.** Phase 07's empty interfaces fill in. AIRequest carries `{ prompt, maxTokens?, stream?, signal? }`. AIResponse for non-streaming carries `{ text, usdCost, usage? }`. Streaming uses separate method `AIClient.invokeStream(req): Promise<StreamTextResult<{}, {}>>` (Option 1 from CONTEXT). Empty-interface lint comments come off.

**F. Streaming transport plumbing.** `AIClient.invokeStream` → `obsidianFetch('stream')` → `electron.net.fetch`. Per-provider adapter calls `streamText({ model, prompt, abortSignal })` from `'ai'` (core). Fallback path: if `loadElectronNet()` throws, AIClient.invokeStream catches and falls back to `obsidianFetch('request')` + non-streaming `generateText()`. Researcher recommends: **expose `streaming: boolean` flag on the result object so the modal renders Thinking… when false** (see decision F-Refinement below).

**F-Refinement (researcher proposal):** AIClient.invokeStream returns a discriminated tuple `{ kind: 'stream', result: StreamTextResult<...>, abortController } | { kind: 'buffered', text: Promise<string>, abortController, addCostOnFinish: () => Promise<void> }`. Modal switches body strategy on `kind`. Planner's call.

**G. Out of scope:** Daily cost cap enforcement (Phase 09 AIREV-06). AI Debug never writes to the note. Pattern-cluster classification (Phase 11). Auto-debug on every WA. Auto-apply AI suggested code. Re-run button. Copy code only / extract first fence. Per-feature provider routing. Sending `## Notes`. Token estimation pre-call. Multi-turn debug.

### Claude's Discretion

The following items in CONTEXT.md `<open_questions_for_planning>` are flagged as researcher/planner judgement calls — answered in `## Open Questions` below:

1. Live Markdown re-render-per-chunk stability (highest uncertainty).
2. Exact AI SDK import surface for streaming.
3. AbortSignal propagation across all 4 providers.
4. requestUrl abort capability.
5. streamText behavior with non-streaming injected fetch.
6. Cost-ledger posture on cancel mid-stream.
7. Exact LastVerdict shape against orchestrator output.
8. Verdict-Accepted classification helper location.

### Deferred Ideas (OUT OF SCOPE)

- `## Notes` send toggle (rejected in decision A).
- Topic tags + difficulty + URL/slug in prompt.
- Re-run button in modal (Phase 09).
- Multi-turn debug (post-v1.1).
- Apply-patch / Cursor-style diff (AIPROV-FUT-03).
- LastVerdictStore persistence to data.json (rejected in decision B).
- Streaming Markdown render perf optimizations beyond 100ms debounce.
- AbortController-aware `requestUrl` (waiting on Obsidian).
- Provider-side rate-limit awareness (deferred).

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIDBG-01 | User triggers `AI: Debug` from a button under `## Code`; sends problem statement + current code + last run/submit failure (if any) to configured LLM. | `## Architecture Patterns` Pattern 1 (button-row extension) + Pattern 2 (LastVerdictStore) + Pattern 3 (prompt assembly via `buildDebugPrompt`). Standard Stack: `ai@6.0.183` `streamText` core import. |
| AIDBG-02 | AI Debug output appears in modal that progressively fills as tokens stream when streaming is available; otherwise "Thinking…" indicator with elapsed time. | `## Architecture Patterns` Pattern 4 (AIStreamModal live render). `## Code Examples` (streamText textStream consumption + onFinish). `## Common Pitfalls` Pitfall 1 (live render mitigation). Pattern 5 (mm:ss counter via `setWindowTimeout`). |
| AIDBG-03 | User can cancel an in-flight AI Debug request at any time without leaving the modal in a bad state. | `## Architecture Patterns` Pattern 6 (Cancel button + AbortController + onAbort callback). `## Common Pitfalls` Pitfall 4 (zombie network call prevention). `## Code Examples` (abortSignal propagation). |

</phase_requirements>

---

## Standard Stack

### Core (already-installed runtime deps — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `6.0.183` | Core SDK exporting `streamText` + `generateText` + types | [VERIFIED: package.json + node_modules/ai/package.json + node_modules/ai/dist/index.d.ts:2735 streamText declaration] Single-source for both streaming + non-streaming flows. `streamText` accepts `abortSignal: AbortSignal` and returns `StreamTextResult<TOOLS, OUTPUT>` with `textStream: AsyncIterableStream<string>`. |
| `@ai-sdk/anthropic` | `3.0.78` | Anthropic provider adapter | [VERIFIED: package.json + Phase 07 RESEARCH.md verified 2026-05-15] Already wired in `src/ai/providers/anthropic.ts:createAnthropicModel`. |
| `@ai-sdk/openai` | `3.0.64` | OpenAI provider adapter | [VERIFIED: package.json + Phase 07] Already wired in `src/ai/providers/openai.ts:createOpenAIModel`. |
| `@ai-sdk/openai-compatible` | `2.0.47` | OpenRouter / Ollama / Custom (OpenAI-compatible) | [VERIFIED: package.json + Phase 07] Already wired in `src/ai/providers/openaiCompatible.ts` + `src/ai/providers/ollama.ts`. |

### Already-installed runtime infrastructure (no new code)

| Asset | Source | Used By Phase 08 For |
|-------|--------|---------------------|
| `obsidianFetch('stream')` | `src/ai/obsidianFetch.ts:77` | First live customer of stream branch (electron.net.fetch). |
| `obsidianFetch('request')` | `src/ai/obsidianFetch.ts:91` | Fallback path (non-streaming, buffered Response). |
| `requireDisclosure` gate | `src/main.ts:854-872` (07 Plan 05) | Disclosure modal fires automatically before invokeStream's first HTTP. |
| `setProviderConfig` + `disclosureAcknowledged` flag | `src/settings/SettingsStore.ts` (07 Plan 01) | Persisted ack survives plugin reloads. |
| `addCostLedger` | `SettingsStore` (07 Plan 01 D-F) | Phase 08 calls after stream-end / on success path. |
| `prettyName(provider)` | `src/ai/types.ts:83` | Modal title `AI Debug — Anthropic` etc. — single source of truth. |
| `setWindowTimeout` / `clearWindowTimeout` | `src/shared/timers.ts` | mm:ss counter on fallback path. |
| `MarkdownRenderer.render(this.app, md, el, '', this)` | obsidian core; precedent `src/preview/ProblemPreviewView.ts:481` | Live Markdown body render (modal extends `Modal`, satisfies obsidianmd/no-plugin-as-component because `Modal extends Component`). |
| `classifyStatus(code, msg).kind === 'ac'` | `src/solve/statusMap.ts:40` | Verdict-Accepted check for conditional AI Debug button in VerdictModal. |
| `EphemeralTabStore` pattern | `src/solve/ephemeralTabStore.ts` | Template for `LastVerdictStore` (Map-on-Plugin, in-memory, lifecycle-aware). |
| `buildCodeBlockButtonRow` | `src/main/codeBlockButtonRow.ts:29` | Extend with 3rd button + new host method `aiDebugFromActive()`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `result.textStream` for-await consumption | `result.fullStream` (richer event types incl. `'abort'` event) | textStream is simpler — only deltas; chosen because the `onAbort` callback gives us cancel signaling without needing to handle `fullStream` event types. |
| `await result.text` Promise (consumes whole stream synchronously) | `for await (const chunk of result.textStream)` (incremental) | text-Promise blocks until stream ends; defeats the streaming UX. Locked: incremental for-await. |
| Append-text + final Markdown swap | Live Markdown re-render per chunk | User-locked decision D = live render. Append-text stays as the planner's escape hatch if dogfood reveals jank. See Pitfall 1. |
| `result.usage` Promise on success | `onFinish({ totalUsage })` callback | onFinish gives us the cost number AND the timestamp where to add it to the ledger in one event. Recommended. |
| Single `invoke` polymorphic on `req.stream` | Separate `invokeStream` method | Separate method is cleaner — symmetry with `LeetCodeClient.fetchUsername` vs `getProblemDetail` in the LC client. The cast on AIClient.ts:147 goes away. |
| `result.abort()` instance method | External `AbortController` passed via `abortSignal` | streamText 6.x accepts `abortSignal` (verified at node_modules/ai/dist/index.d.ts:2735); the result object has no abort() method. AbortController is the only correct path. |

**Installation:** None required. All dependencies already pinned via Phase 07.

**Version verification:**
```bash
npm ls ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/openai-compatible
# All four resolve from local node_modules — no fetch needed.
# Confirmed via /Users/moxu/projects/obsidian-leetcode/node_modules/ai/package.json (ai@6.0.183).
```

---

## Package Legitimacy Audit

> Phase 08 installs ZERO new packages. All four AI dependencies were vetted in Phase 07 RESEARCH §"Package Legitimacy Audit" and remain on the legitimacy slate.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `ai` | npm | 2.5+ years | ~9M/wk (Phase 07 baseline) | github.com/vercel/ai | (Phase 07 [OK]) | Already installed |
| `@ai-sdk/anthropic` | npm | 18+ months | ~2M/wk | github.com/vercel/ai (monorepo) | (Phase 07 [OK]) | Already installed |
| `@ai-sdk/openai` | npm | 18+ months | ~3M/wk | github.com/vercel/ai (monorepo) | (Phase 07 [OK]) | Already installed |
| `@ai-sdk/openai-compatible` | npm | 12+ months | ~1.3M/wk | github.com/vercel/ai (monorepo) | (Phase 07 [OK]) | Already installed |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ User clicks "AI: Debug" (one of 3 surfaces)                                 │
│   • Code-fence button row (Edit-Mode CM6 widget OR Reading-Mode             │
│     post-processor)                                                         │
│   • Verdict modal footer (conditional on non-Accepted verdict)              │
│   • Palette command `ai-debug` (editorCheckCallback-guarded by lc-slug)     │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │ LeetCodePlugin.openAIDebug(slug) │  ◄── single entrypoint
                    └──────────────┬───────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │ buildDebugPrompt(slug, ctx)          │
                    │   reads:                              │
                    │   • problem markdown (DetailCache)   │
                    │   • ## Code content (HeadingRegion)  │
                    │   • LastVerdictStore.get(slug)        │
                    │   • selected language (fence tag)    │
                    │   produces: prompt string            │
                    └──────────────┬───────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │ new AIStreamModal(...)            │
                    │   .open() ─► onOpen() builds DOM  │
                    └──────────────┬────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────┐
                    │ aiClient.invokeStream({          │
                    │   prompt, signal: ctrl.signal })  │
                    └──────────────┬────────────────────┘
                                   │
                                   ▼
            ┌─────────────────────────────────────────────────────┐
            │ Disclosure gate (Phase 07)                           │
            │ if !cfg.disclosureAcknowledged:                      │
            │   open AIDisclosureModal ─► await Continue/Cancel    │
            │   on Cancel: throw Error('AI call cancelled')         │
            └──────────────┬──────────────────────────────────────┘
                           │
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │ resolveAdapter(provider, cfg, fetcher)               │
            │   fetcher = obsidianFetch('stream')                  │
            └──────────────┬──────────────────────────────────────┘
                           │
                           │  ┌─── ELECTRON.NET.FETCH AVAILABLE ───┐
                           ├──┤                                     │
                           │  │  streamText({ model, prompt,        │
                           │  │    abortSignal, onFinish, onAbort })│
                           │  │     ─► provider's HTTP via          │
                           │  │        injected fetch =             │
                           │  │        electron.net.fetch           │
                           │  │     ─► returns                       │
                           │  │        StreamTextResult              │
                           │  │     ─► result.textStream =           │
                           │  │        AsyncIterableStream<string>   │
                           │  └─────┬───────────────────────────────┘
                           │        │
                           │  ┌─── FALLBACK (loadElectronNet throws) ──┐
                           └──┤                                          │
                              │  fetcher = obsidianFetch('request')      │
                              │  generateText({ model, prompt,            │
                              │    abortSignal })                         │
                              │     ─► single-shot Response               │
                              │     ─► returns { text, usage }            │
                              └──────┬───────────────────────────────────┘
                                     │
                                     ▼
                       ┌──────────────────────────────────┐
                       │ AIStreamModal renders body        │
                       │   stream path: for await chunk   │
                       │     -> debounce 100ms             │
                       │     -> MarkdownRenderer.render    │
                       │   buffered path: Thinking… mm:ss │
                       │     counter via setWindowTimeout  │
                       │     -> on resolve: render once    │
                       └──────────────┬───────────────────┘
                                      │
                                      ▼
                       ┌──────────────────────────────────┐
                       │ stream-end:                       │
                       │   onFinish event → cost ledger    │
                       │   footer becomes [Copy] [Close]   │
                       │ OR cancel:                         │
                       │   abortController.abort()         │
                       │   onAbort fires (no usage) →      │
                       │     add 0 to ledger               │
                       │   freeze body, footer becomes     │
                       │     [Cancelled header] [Copy]    │
                       │     [Close]                       │
                       └───────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── ai/
│   ├── AIClient.ts                  # extended: invokeStream(req) added
│   ├── AIStreamModal.ts             # NEW — Modal subclass for live render
│   ├── buildDebugPrompt.ts          # NEW — pure prompt assembly
│   ├── disclosure.ts                # extended: withDebugBullet() factory
│   ├── obsidianFetch.ts             # unchanged — Phase 07's seam
│   ├── types.ts                     # extended: AIRequest/AIResponse fill in
│   └── providers/
│       ├── anthropic.ts             # extended: invoke() = streamText/generateText
│       ├── openai.ts                # extended
│       ├── openaiCompatible.ts      # extended
│       ├── ollama.ts                # extended
│       └── index.ts                 # extended: resolveAdapter wires real invoke
├── solve/
│   ├── lastVerdictStore.ts          # NEW — Map<slug, LastVerdict>
│   ├── submissionOrchestrator.ts    # extended: post-resolve callback
│   ├── pollingOrchestrator.ts       # unchanged (orchestrator owns the callback)
│   ├── VerdictModal.ts              # extended: conditional AI Debug footer button
│   └── RunModal.ts                  # extended: conditional AI Debug footer on failure
├── main.ts                          # extended: openAIDebug(slug), ai-debug command,
│                                    #   LastVerdictStore field, post-resolve hook
├── main/
│   ├── codeBlockButtonRow.ts        # extended: 3rd button (AI: Debug)
│   ├── codeActionsEditorExtension.ts # unchanged — picks up 3rd button via factory
│   └── codeActionsPostProcessor.ts  # unchanged — picks up 3rd button via factory
├── notes/
│   ├── HeadingRegion.ts             # unchanged — read-only in this phase
│   └── NoteTemplate.ts              # unchanged
└── shared/
    ├── timers.ts                    # unchanged
    └── logger.ts                    # unchanged (no full-prompt logging)
```

### Pattern 1: 3-button Code-fence Row Extension

**What:** Extend `buildCodeBlockButtonRow` with a third button that delegates to `plugin.aiDebugFromActive()`.
**When to use:** Anywhere user solves problems — Edit-Mode CM6 widget AND Reading-Mode post-processor.
**Test contract update:** `tests/main/codeBlockButtonRow.test.ts:31` no-prefix path bumps from "exactly 2 children" → "exactly 3 children". Chevron-prefix path bumps from 3 → 4. Tests already in place — extend lit assertions only.
**Example:**

```typescript
// src/main/codeBlockButtonRow.ts (extended)
export interface CodeBlockButtonRowHost {
  runFromActive(): void | Promise<void>;
  submitFromActive(): void | Promise<void>;
  aiDebugFromActive(): void | Promise<void>;   // NEW
}

export function buildCodeBlockButtonRow(...): HTMLDivElement {
  const row = doc.createElement('div');
  row.className = 'leetcode-code-actions';
  if (opts.prefix) row.appendChild(opts.prefix());

  // Run + Submit (unchanged)
  const runBtn = doc.createElement('button');
  runBtn.className = 'leetcode-code-action-run';
  runBtn.textContent = 'Run';
  runBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void plugin.runFromActive();
  });
  row.appendChild(runBtn);

  const submitBtn = doc.createElement('button');
  submitBtn.className = 'leetcode-code-action-submit';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', (e) => { ... });
  row.appendChild(submitBtn);

  // NEW: AI Debug
  const aiBtn = doc.createElement('button');
  aiBtn.className = 'leetcode-code-action-ai-debug';
  aiBtn.textContent = 'AI: Debug';
  aiBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void plugin.aiDebugFromActive();
  });
  row.appendChild(aiBtn);

  return row;
}
```

### Pattern 2: LastVerdictStore (Map-on-Plugin, Mirrored from EphemeralTabStore)

**What:** In-memory `Map<slug, LastVerdict>` populated by orchestrator post-resolve callback.
**When to use:** Capturing transient debugging context that doesn't survive plugin reload.
**Why over data.json:** data.json bloat, expiry-policy complexity, no real user benefit (24-hour-old verdict isn't the right context anyway).
**Lifecycle:** Initialized in `LeetCodePlugin.onload()`. Populated via `(slug, verdict) => store.set(slug, verdict)` callback registered with each orchestrator's submit/run path. Cleared on plugin unload (the Map goes with the plugin instance).

**Source-verified `LastVerdict` shape (ALL fields present in `RunCheckResponse`/`SubmitCheckResponse` in `src/solve/types.ts:71-117`):**

```typescript
// src/solve/lastVerdictStore.ts (NEW)
export interface LastVerdict {
  /** 'run-failure' = at least one sample/custom test failed via interpret_solution.
   *  'submit-failure' = judge returned non-Accepted (status_code !== 10). */
  kind: 'run-failure' | 'submit-failure';

  /** Date.now() at capture — diagnostic only. */
  capturedAt: number;

  /** Human-readable verdict via classifyStatus(code, msg).displayName.
   *  Examples: 'Wrong Answer', 'Time Limit Exceeded', 'Compile Error'. */
  verdictText: string;

  /** Submit-side: from res.input || res.last_testcase.
   *  Run-side: from joinedDataInput sliced to the failing case via splitInput(). */
  failingInput?: string;

  /** Submit-side: from res.expected_output || asString(res.expected_code_answer).
   *  Run-side: from expected_code_answer[failingCaseIdx]. */
  expectedOutput?: string;

  /** Submit-side: from res.std_output || asString(res.code_output).
   *  Run-side: from code_answer[failingCaseIdx]. */
  actualOutput?: string;

  /** Submit-side: from res.status_runtime (string, e.g. '120 ms'). TLE-relevant. */
  runtimeMs?: string;

  /** Submit-side: from res.status_memory (string, e.g. '14.5 MB'). MLE-relevant. */
  memoryMb?: string;

  /** Submit-side: from res.full_runtime_error || res.runtime_error
   *                || res.full_compile_error || res.compile_error.
   *  Run-side: same fields (D-15 sniff in verdictModalRenderer.ts:hasRunErrorPayload). */
  errorMessage?: string;
}

export class LastVerdictStore {
  private readonly state = new Map<string, LastVerdict>();
  set(slug: string, v: LastVerdict): void { this.state.set(slug, v); }
  get(slug: string): LastVerdict | undefined { return this.state.get(slug); }
  clear(): void { this.state.clear(); }
}
```

**Hook posture (orchestrator integration):** The orchestrator stays pure. `LeetCodePlugin.onload()` registers a post-resolve callback (`onVerdict(slug, verdict)`) that the orchestrator invokes after `submit()` resolves. Keeps orchestrators free of plugin-instance side-effects.

### Pattern 3: Prompt Assembly via `buildDebugPrompt`

**What:** Pure function that assembles the AI Debug prompt from problem markdown + code + verdict + language.
**Why pure:** Testable without modal/network mocks. Same inputs → same prompt.

```typescript
// src/ai/buildDebugPrompt.ts (NEW)
export function buildDebugPrompt(args: {
  problemMd: string;
  code: string;
  language: string;          // fence info-string ('python3', 'java', etc.)
  lastVerdict?: LastVerdict;
}): string {
  const verdictBlock = args.lastVerdict
    ? formatVerdictBlock(args.lastVerdict)
    : 'No verdict yet — review the code as-is.';

  return [
    'You are debugging a LeetCode solution. Be concise. Do not rewrite the entire problem.',
    '',
    '## Problem',
    args.problemMd.trim(),
    '',
    `## My ${args.language} solution`,
    '```' + args.language,
    args.code.trim(),
    '```',
    '',
    '## What happened on my last run',
    verdictBlock,
    '',
    '## Tasks',
    '1. Tell me what is wrong.',
    '2. Suggest the smallest fix that makes the failing case pass.',
    '3. Show the corrected code in a fenced block. Do not rewrite unchanged sections; show the full corrected solution only if a partial diff would be confusing.',
  ].join('\n');
}

function formatVerdictBlock(v: LastVerdict): string {
  const lines: string[] = [`Verdict: ${v.verdictText}`];
  if (v.failingInput) lines.push(`Input: ${v.failingInput}`);
  if (v.expectedOutput !== undefined) lines.push(`Expected output: ${v.expectedOutput}`);
  if (v.actualOutput !== undefined) lines.push(`My output: ${v.actualOutput}`);
  if (v.runtimeMs) lines.push(`Runtime: ${v.runtimeMs}`);
  if (v.memoryMb) lines.push(`Memory: ${v.memoryMb}`);
  if (v.errorMessage) lines.push('', 'Error:', '```', v.errorMessage, '```');
  return lines.join('\n');
}
```

### Pattern 4: AIStreamModal — Live-render with Debounce Mitigation

**What:** Modal subclass that opens immediately, owns the AbortController, consumes `result.textStream` via for-await, and re-renders the body via `MarkdownRenderer.render` with a 100ms debounce.

**Recommended implementation skeleton:**

```typescript
// src/ai/AIStreamModal.ts (NEW)
import { Modal, MarkdownRenderer, Notice, type App } from 'obsidian';
import { setWindowTimeout, clearWindowTimeout, type TimerHandle } from '../shared/timers';
import { logger } from '../shared/logger';
import type { AIClient } from './AIClient';
import { prettyName } from './types';
import type { AIProvider } from './types';

const RENDER_DEBOUNCE_MS = 100;     // Pitfall 1 mitigation
const COUNTER_TICK_MS = 1000;       // mm:ss counter

export interface AIStreamModalArgs {
  provider: AIProvider;
  prompt: string;
  aiClient: AIClient;
}

export class AIStreamModal extends Modal {
  private buffer = '';
  private bodyEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;
  private renderTimer: TimerHandle | null = null;
  private counterTimer: TimerHandle | null = null;
  private elapsedSec = 0;
  private abortController = new AbortController();
  private completed = false;
  private cancelled = false;

  constructor(app: App, private args: AIStreamModalArgs) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass('leetcode-ai-stream');
    titleEl.setText(`AI Debug — ${prettyName(this.args.provider)}`);

    this.bodyEl = contentEl.createDiv({ cls: 'leetcode-ai-stream-body markdown-rendered' });
    this.footerEl = contentEl.createDiv({ cls: 'leetcode-ai-stream-footer' });
    this.cancelBtn = this.footerEl.createEl('button', { text: 'Cancel' });
    this.cancelBtn.addEventListener('click', () => this.handleCancel());

    // Open in Thinking… state immediately so the modal is non-empty during
    // the disclosure gate's await + the first chunk's network round-trip.
    this.bodyEl.createEl('p', { cls: 'leetcode-ai-stream-thinking',
                                 text: 'Thinking…' });
    this.startCounter();

    try {
      const handle = await this.args.aiClient.invokeStream({
        prompt: this.args.prompt,
        stream: true,
        signal: this.abortController.signal,
      });
      // discriminated tuple — 'stream' or 'buffered'
      if (handle.kind === 'stream') {
        await this.consumeStream(handle.result);
      } else {
        await this.renderBuffered(handle.text);
      }
    } catch (err) {
      this.handleError(err);
    }
  }

  private async consumeStream(result: StreamTextResult<{}, {}>): Promise<void> {
    // First chunk replaces the Thinking… placeholder.
    let firstChunkSeen = false;
    try {
      for await (const chunk of result.textStream) {
        if (!firstChunkSeen) {
          firstChunkSeen = true;
          this.bodyEl.empty();
          this.stopCounter();   // counter freezes once tokens flow
        }
        this.buffer += chunk;
        this.scheduleRender();
      }
      // Stream ended naturally.
      this.completed = true;
      await this.flushRender();      // final immediate render
      const usage = await result.usage;
      const cost = estimateUsd(this.args.provider, usage);
      await this.args.aiClient.addCost(cost);
      this.swapToCompletionFooter();
    } catch (err) {
      // streamText throws on network error. Cancel-via-abort lands here too;
      // distinguish by signal.aborted.
      if (this.abortController.signal.aborted) {
        this.cancelled = true;
        await this.args.aiClient.addCost(0);   // don't bill the cancelled call
        this.swapToCancelledFooter();
        return;
      }
      this.handleError(err);
    }
  }

  private scheduleRender(): void {
    if (this.renderTimer != null) return;     // already scheduled
    this.renderTimer = setWindowTimeout(() => {
      this.renderTimer = null;
      void this.flushRender();
    }, RENDER_DEBOUNCE_MS);
  }

  private async flushRender(): Promise<void> {
    if (this.renderTimer != null) {
      clearWindowTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.bodyEl.empty();
    await MarkdownRenderer.render(this.app, this.buffer, this.bodyEl, '', this);
  }

  private startCounter(): void {
    this.counterTimer = setWindowTimeout(() => this.tick(), COUNTER_TICK_MS);
  }
  private tick(): void {
    if (this.counterTimer == null) return;
    this.elapsedSec += 1;
    const m = Math.floor(this.elapsedSec / 60);
    const s = this.elapsedSec % 60;
    const labelEl = this.bodyEl.querySelector('.leetcode-ai-stream-thinking');
    if (labelEl) labelEl.textContent = `Thinking… ${pad(m)}:${pad(s)}`;
    this.counterTimer = setWindowTimeout(() => this.tick(), COUNTER_TICK_MS);
  }
  private stopCounter(): void {
    if (this.counterTimer != null) {
      clearWindowTimeout(this.counterTimer);
      this.counterTimer = null;
    }
  }

  private handleCancel(): void {
    this.cancelled = true;
    this.abortController.abort();
    this.stopCounter();
    // Stream consumer's catch branch will swap the footer.
  }

  onClose(): void {
    // AIDBG-03 anti-zombie: abort if still in flight.
    if (!this.completed && !this.cancelled) {
      this.abortController.abort();
    }
    this.stopCounter();
    if (this.renderTimer != null) {
      clearWindowTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.contentEl.empty();
  }

  // ... swapToCompletionFooter, swapToCancelledFooter, handleError, renderBuffered ...
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
```

### Pattern 5: Disclosure Composition Factory

**What:** Append AI Debug-specific bullet to `DISCLOSURE_BASE_COPY.willSend` via composition (constant is `Object.freeze`'d).

```typescript
// src/ai/disclosure.ts (extended)
export function withDebugBullet(
  base: { willSend: readonly string[]; neverSends: readonly string[] }
): { willSend: readonly string[]; neverSends: readonly string[] } {
  return {
    willSend: [
      ...base.willSend,
      'AI Debug also sends the last failing run/submit verdict for this problem (input, expected output, your output, error message)',
    ],
    neverSends: base.neverSends,
  };
}
```

**Mutation safeguard:** `Object.freeze` on the base ensures any attempted `.push` throws in strict mode. The factory returns a fresh object; phases 09 + 11 follow the same pattern (`withReviewBullet`, `withKgBullet`).

**Wiring:** Either AIStreamModal accepts a `disclosureCopy` constructor arg AND the AIDisclosureModal receives it through the gate, OR the gate at `AIClient.invokeStream` reads a feature-tag from `AIRequest` and selects the right copy. **Recommended: AIClient.invokeStream takes optional `disclosureCopy` in the request and the gate uses it.** Keeps the modal free of disclosure logic.

### Pattern 6: Cancel + AbortController + onAbort

**What:** Modal owns `new AbortController()`; passes `signal` into `invokeStream(req)`; AIClient passes it as `streamText({ abortSignal: req.signal })`.

**Three-point cancel coverage:**
1. **Cancel button click** → `controller.abort()` → AbortError surfaces in the for-await iterator catch → modal swaps footer to Cancelled state.
2. **Modal `onClose()` (Esc / X / overlay-click)** while in flight → `controller.abort()`. Defensive — the user-visible Cancel button is the primary path.
3. **Stream-end after Cancel (race)** → `signal.aborted === true` already so the swap-to-completion path is short-circuited.

**Verified in node_modules/ai/dist/index.mjs:6488** — `streamText({ abortSignal })` calls `mergeAbortSignals(abortSignal, ...)` and passes the merged signal into the model's `doStream` → `init.signal` on the injected fetch (our `obsidianFetch('stream')`). `electron.net.fetch` honors `init.signal` per Electron 28+ docs.

### Anti-Patterns to Avoid

- **`innerHTML` with AI-returned content.** Always `MarkdownRenderer.render(this.app, md, el, '', this)`. Phase 06 PreviewView is the precedent.
- **`vault.modify` from the modal.** Phase 08 has NO vault writes. AI output stays in the modal; copy-to-clipboard is the only exit.
- **`cm.dispatch` from the modal.** Modal does not touch the editor. Section-lock extension's userEvent allowlist (`leetcode.*`) is irrelevant here.
- **Mutating `DISCLOSURE_BASE_COPY` directly.** Frozen at module load — composition only.
- **Logging full prompts/responses.** Logger redaction (Phase 07 T-07-05) covers headers, but the prompt body contains user code which is sensitive on principle. Log only metadata: provider, model, token-count, duration, ok/err.
- **Re-using `EphemeralTabStore`'s `layout-change` reconcile loop for LastVerdictStore.** Verdicts don't have a "tab is open" lifecycle — they're transient debugging artifacts. Plain `Map` + `clear()` on plugin unload is sufficient. **No reconciliation needed.**
- **Adding a Re-run button.** Out-of-scope. Phase 09 wires cap; until then accidental double-spend is too easy.
- **`workspace.activeLeaf` direct access.** Use `app.workspace.getActiveViewOfType(MarkdownView)` (project convention).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP streaming to AI provider | A custom EventSource/SSE parser | `streamText` from `ai@6.0.183` (already installed) | SSE format varies per provider; Vercel SDK normalizes Anthropic's content-block-delta vs OpenAI's chat.completion.chunk. Hand-rolling = 4× provider-specific code paths + maintenance burden. |
| AbortController plumbing through fetch | Manual signal forwarding | Pass `abortSignal` to `streamText` — SDK does mergeAbortSignals + passes to fetch.init.signal | Verified at node_modules/ai/dist/index.mjs:6543. SDK handles step-timeout + chunk-timeout + user-abort merging. |
| Markdown → DOM rendering | Custom Markdown parser | `MarkdownRenderer.render(this.app, md, el, '', this)` | Obsidian's parser handles wikilinks, embeds, callouts, footnotes, math correctly. Bundle delta: zero (already in Obsidian). |
| Modal lifecycle (Esc / X / overlay-click) | Manual event listeners | Extend `Modal` class — `onOpen`/`onClose` give correct lifecycle | Obsidian guarantees `onClose` fires for all 3 dismiss paths. Tested by VerdictModal precedent. |
| Verdict classification | New helper | `classifyStatus(code, msg).kind` from `src/solve/statusMap.ts` | Already covers 10/11/12/13/14/15/16/20/21 + unknown fallback. New helper would drift. |
| `mm:ss` counter | `setInterval` | `setWindowTimeout` recursive scheduling (project rule) | `prefer-active-window-timers` lint rule — popout-window-safe. Mirrors Phase 06 PreviewView's detach handle. |
| Disclosure modal | Hand-rolled HTML strings | `AIDisclosureModal` from `src/ai/disclosure.ts` (Phase 07) | Already includes Continue/Cancel + Esc-as-cancel + Continue+close double-fire guards (07 Plan 05 acknowledged + decided flags). |
| Per-slug debugging context store | data.json field | Map-on-Plugin + onunload clear | EphemeralTabStore precedent. data.json bloat avoided. |
| Cost-USD math | Inline in modal | `aiClient.addCost(usd)` (Phase 07 D-F) | Day-rollover-on-write is in SettingsStore. Cap enforcement is Phase 09's job. |
| Prompt-assembly string concat | `${...}` in modal body | Pure `buildDebugPrompt(args)` factored to its own file | Testable without modal mocks. Consumed by Phase 09 (AI Review reuses ~70%). |

**Key insight:** Phase 08 is glue code. Every primitive (streaming SDK, modal class, MarkdownRenderer, verdict classifier, cost ledger, disclosure modal, button row factory) already exists. The plan should NOT introduce new primitives — it should compose existing ones.

---

## Common Pitfalls

### Pitfall 1: Live Markdown Re-render Performance (HIGHEST UNCERTAINTY)

**What goes wrong:** `MarkdownRenderer.render` parses the entire Markdown string each call, builds a fresh DOM tree, and replaces `bodyEl`'s contents. For a 2000-token streaming response (~50–100 chunks at typical Anthropic streaming rate of 30 tokens/sec), N full re-renders happen. Symptoms: visible flicker on every chunk; scroll jump as DOM rebuilds; broken half-fences while stream is mid-fence (` ```pyt` parses as a non-fence — body looks like inline code briefly); paint stalls on long answers.

**Why it happens:** Obsidian's MarkdownRenderer is designed for one-shot render of complete documents (post-processor pipeline), not incremental streaming. Each call walks the full AST.

**How to avoid (locked posture):**

| Tier | Strategy | When |
|------|----------|------|
| Tier 1 (default) | **100ms debounce** — accumulate chunks; render at most every 100ms | Always. Minimum drop from ~30 renders/sec to 10/sec. |
| Tier 2 (escape hatch) | **Append-text mode** during stream + final Markdown swap on stream-end | If Tier 1 dogfood reveals jank for code-heavy responses. Pitfall is that mid-stream the user sees raw Markdown chars (` ```python `, asterisks, etc.). |
| Tier 3 (post-v1.1) | Streaming Markdown parser (e.g., `markdown-stream` parser library) | Out of scope for v1.1. Backlog. |

**Recommended:** **Ship Tier 1 (100ms debounce).** Implementation in Pattern 4 above. The 100ms window batches 3–5 chunks at typical streaming rates — enough to mostly close half-fences before paint while remaining visually responsive. The `RENDER_DEBOUNCE_MS` constant is grep-locked so the planner can flip to 200ms or 50ms with one edit.

**Warning signs:**
- Console paint-time warnings during stream (`[Violation] 'requestAnimationFrame' handler took XXms`).
- User reports "modal feels stuttery" or "code blocks flash on/off."
- `await MarkdownRenderer.render` Promise resolution time > 50ms per chunk.

**Verification gate (planner MUST add to Plan 08-03):** Manual UAT on a 2000+ token response (e.g., "explain this DP solution in detail with worked examples") — observer confirms no visible flicker, no scroll jump, no half-fence flash > 100ms. If gate fails, switch to Tier 2.

### Pitfall 2: AbortError vs Network Error in Stream Iterator Catch

**What goes wrong:** `for await (const chunk of result.textStream)` throws on both AbortError (from cancel) AND network error (provider 500, timeout). Distinguishing them naively (`err.name === 'AbortError'`) is unreliable because `streamText` may wrap or rethrow.

**Why it happens:** SDK 6.x's stream iterator throws an `APICallError` (from `@ai-sdk/provider`) that wraps the underlying cause. The cause may or may not be an `AbortError` depending on which signal short-circuited.

**How to avoid:** Check `this.abortController.signal.aborted` first — if true, treat as cancel regardless of the thrown error type. Check the signal's `aborted` boolean, not the error.

```typescript
} catch (err) {
  if (this.abortController.signal.aborted) {
    this.cancelled = true;
    // ... swap to Cancelled footer; add 0 to cost ledger
    return;
  }
  // genuine network/provider error
  this.handleError(err);
}
```

**Warning signs:** Cancel UX appears as "AI call failed: AbortError" instead of clean Cancelled footer.

### Pitfall 3: requestUrl Has No Abort

**What goes wrong:** On the fallback path (electron.net.fetch unavailable), `requestUrl` does NOT honor `init.signal`. Confirmed by reading `src/ai/obsidianFetch.ts:106-117` — the requestUrl branch does not forward `credentials` and does not propagate any signal. The user clicks Cancel; the underlying network call continues until provider responds.

**Why it happens:** Obsidian's `requestUrl` is a buffered HTTP primitive without streaming or cancellation. There is no Obsidian API that accepts an AbortSignal on requestUrl.

**How to avoid:** Document the user-visible difference. On fallback path, Cancel = "close modal + ignore response when it arrives." Modal's `onClose()` MUST clean up DOM + clear counter timer regardless of whether the network call is still in flight. The Promise the modal awaits is never observed after close — its resolve/reject lands in a silent catch.

**Plan must include:** A Plan 08-02 task that adds `void aiClient.invokeBuffered(...).catch(() => {/* swallowed - modal closed */})` posture so the unhandled rejection doesn't bubble.

**Warning signs:**
- `UnhandledPromiseRejection` warning in console after Cancel on fallback path.
- User clicks Cancel; provider response Notice fires after modal is gone.

### Pitfall 4: Zombie Network Call After Modal Close (AIDBG-03)

**What goes wrong:** User dismisses modal via Esc / X / overlay-click while stream is in flight. Cancel button's click handler is bypassed; the for-await loop keeps consuming chunks; the cost ledger may double-count.

**Why it happens:** `Modal.onClose()` fires in all 3 dismiss paths but ONLY if the modal subclass invokes the abort logic.

**How to avoid:** `onClose()` MUST check `!this.completed && !this.cancelled` AND call `this.abortController.abort()` — the same flag the Cancel button sets. After abort, the for-await loop's next iteration throws AbortError and the catch branch's `signal.aborted` short-circuit fires.

**Verified pattern in source:** `src/preview/ProblemPreviewView.ts:267` (renderToken bump pattern is the analog) and `src/solve/VerdictModal.ts:49-63` (isPending check + onCancel forwarding).

**Warning signs:** Console `[leetcode] AI cost: $0.0123` Notice fires after the modal is gone.

### Pitfall 5: Disclosure Modal Stacking on Modal Open

**What goes wrong:** AIStreamModal opens, immediately calls `aiClient.invokeStream`, which fires the disclosure gate. Disclosure modal opens ON TOP OF AIStreamModal. User sees two stacked modals. Closing disclosure leaves AIStreamModal in indeterminate "Thinking…" state.

**Why it happens:** AIStreamModal's `onOpen` doesn't await the disclosure before painting. The thinking… UX makes this LOOK acceptable (loading state matches), but the visual stacking is awkward.

**How to avoid:** AIStreamModal opens with `Thinking…` body — body is empty until disclosure resolves AND first chunk arrives. The disclosure modal stacks ON TOP correctly because Obsidian's modal stack handles z-index. On disclosure Cancel, AIClient.invokeStream throws `Error('AI call cancelled')`; AIStreamModal's catch swaps to "Call cancelled" body + `[Close]` footer. NO double-modal close required — the disclosure modal closes itself; AIStreamModal stays open in an end-state.

**This is acceptable per CONTEXT D-Disclosure modal interaction.** No plan change needed. Document as expected behavior in 08-UI-SPEC.

**Warning signs:** Tests fail asserting modal count = 1 during disclosure pending.

### Pitfall 6: Cost Ledger on Cancel — `result.usage` Promise Rejects

**What goes wrong:** AbortController fires; for-await throws; planner code does `const usage = await result.usage` in the catch hoping to bill partial tokens. The Promise REJECTS (the stream errored), not resolves. Catch within catch.

**Why it happens:** SDK 6.x's `StreamTextResult.usage` is a `PromiseLike<LanguageModelUsage>` that resolves on natural stream-end via the `'finish-step'` event. On error/abort, it rejects.

**How to avoid:** Don't await `result.usage` in the abort path. Add `0` to the cost ledger (conservative — don't bill for cancelled calls). Document the alternative posture (estimate from input tokens only) in deferred backlog if ever needed.

```typescript
// Locked: always 0 on cancel.
if (this.abortController.signal.aborted) {
  await this.args.aiClient.addCost(0);
  return;
}
```

**Warning signs:** Cost ledger shows $0.005 spike per cancelled call. Or: unhandled rejection on the `result.usage` Promise.

### Pitfall 7: Verdict Modal AI Debug Button Visible on Accepted (Phase 09 Surface Leak)

**What goes wrong:** AIStreamModal's verdict modal button appears for ALL terminal states because the visibility check is wrong. Phase 09 owns the AC review surface; Phase 08 must NOT show AI Debug on Accepted.

**Why it happens:** `classifyStatus(code).kind === 'ac'` returns `true` only for status_code 10. But the dispatcher in `verdictModalRenderer.ts:108` already uses this exact check at line 458 (`switch (kind) case 'ac': renderAcBody`). The button-add logic must mirror.

**How to avoid:** Add the AI Debug button INSIDE `renderSubmitVerdict` after the kind switch (at the footer construction in `verdictModalRenderer.ts:483-505`), gated on `kind !== 'ac'` && `kind !== 'unknown'` && `kind !== 'unknown-lc'` && `kind !== 'ie'` && `kind !== 'ole'` (the latter four have no actionable failing case). Or simpler: gate on `(kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce')` — the same union the existing Copy-failing-input gate uses, plus `'ce'` and `'mle'`.

**Recommended union for AI Debug button visibility (locked):** `['wa', 'tle', 'mle', 're', 'ce']`. NOT `'ole'`/`'ie'`/`'unknown'`/`'unknown-lc'` — these have no actionable failing input (Phase 09 territory or LC-bug territory). NOT `'ac'`.

**Test contract (extends `tests/solve/VerdictModal.test.ts`):** AI Debug button visible for WA / TLE / MLE / RE / CE; absent for AC; absent for OLE / IE / unknown / unknown-lc.

### Pitfall 8: Run-Side Failure Capture — Per-Case Failure Identification

**What goes wrong:** Run-mode response carries `code_answer[]` + `expected_code_answer[]` + `compare_result` mask. The orchestrator/poller must identify WHICH case failed and slice the right input chunk to populate `LastVerdict.failingInput`.

**Why it happens:** `interpret_solution` returns aggregate results across N tabs. The `compare_result` string is `"110"` etc. — a per-case `0`/`1` mask. The first `0` is the failing case.

**How to avoid:** Reuse `splitOutput(res.code_answer, arity)` and `splitInput(joinedDataInput, linesPerCase)` already in `src/solve/runArity.ts`. The first index where `passMask[i] === false` (computed identically to `verdictModalRenderer.ts:170-179`) is the failing case. `joinedDataInput` is the same string passed to `interpret_solution` — already accessible in the orchestrator.

**Plan must include:** A helper `extractRunFailureForVerdictStore(res, joinedDataInput, metaData)` that returns `{ failingInput, expectedOutput, actualOutput, errorMessage }` — feeds straight into `LastVerdict`.

**Warning signs:** LastVerdict.failingInput is empty or shows ALL inputs; AI Debug prompt has no useful per-case context.

### Pitfall 9: HeadingRegion Read for `## Code` Content

**What goes wrong:** Phase 08 reads `## Code` content from the active note. `HeadingRegion.ts` exports `rewriteProblemSection` for `## Problem` rewriting but no symmetric reader for `## Code`. The fence content extraction is in `src/solve/codeExtractor.ts` (`extractFirstFencedBlock`) — used by submit/run paths.

**How to avoid:** Reuse `extractFirstFencedBlock(body)` from `src/solve/codeExtractor.ts`. Same path Run/Submit use. Returns `{ lang, code }`. The `lang` field is the fence info-string (already what we need for the prompt's "language" line).

**Plan must include:** AIClient surface `aiDebugFromActive()` reads active MarkdownView body via `getViewBody()` precedent (mirrors `submissionOrchestrator.ts:getCurrentBody`), feeds to `extractFirstFencedBlock`, threads `{ lang, code }` into `buildDebugPrompt`.

**Warning signs:** Empty code block in prompt; AI Debug returns "I don't see your solution."

### Pitfall 10: Logger Leakage of Prompt Body / Response Text

**What goes wrong:** Plan 08-02 plumbs `streamText({ model, prompt, abortSignal })` and a maintainer adds `logger.debug('AI request', { prompt })` for diagnostics. The prompt contains user code AND last verdict (potentially sensitive).

**Why it happens:** Existing logger redaction (Phase 07 T-07-05) covers headers (Authorization, x-api-key) but NOT generic body fields like `prompt` or `text`.

**How to avoid:** **Never log full prompts or responses at any verbosity.** Log only metadata: provider, model, prompt-char-count, duration, ok/err. Plan 08-02 adds a grep-locked guard test (`tests/ai/no-prompt-logging.test.ts`) that asserts no `logger.{debug,info,warn,error}` call site in `src/ai/` passes a `prompt` or `responseText` field.

**Warning signs:** Audit grep `grep -rn "logger\..*prompt" src/ai/` returns hits.

---

## Runtime State Inventory

> Phase 08 is greenfield — no rename/refactor/migration. Section omitted per template guidance for greenfield phases.

---

## Code Examples

Verified patterns from official sources (node_modules path = installed version):

### Example 1: streamText with abortSignal (verified via SDK type defs)

```typescript
// Source: node_modules/ai/dist/index.d.ts:2735 (streamText declaration)
//   + node_modules/ai/dist/index.mjs:6488 (function body)
import { streamText } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

const controller = new AbortController();

const result = streamText({
  model,                              // from createAnthropic(...)(modelId)
  prompt: 'Debug my solution to two-sum...',
  abortSignal: controller.signal,
  onFinish: async ({ totalUsage, finishReason }) => {
    // totalUsage: LanguageModelUsage = { inputTokens, outputTokens, ... }
    const usd = estimateUsd(provider, totalUsage);
    await aiClient.addCost(usd);
  },
  onAbort: ({ steps }) => {
    // Fires when user cancels mid-stream. usage NOT in payload.
    // Cost ledger update happens in the catch branch (Pitfall 6).
  },
  onError: ({ error }) => {
    logger.error('AI Debug stream error', error);
  },
});

// Consume incrementally:
try {
  for await (const chunk of result.textStream) {
    buffer += chunk;
    scheduleRender();
  }
} catch (err) {
  if (controller.signal.aborted) {
    // Cancel path
  } else {
    // Network/provider error
  }
}
```

### Example 2: Per-provider model factory invocation pattern (verified via existing src/ai/providers/)

```typescript
// Source: src/ai/providers/anthropic.ts (Phase 07) + extension for Phase 08
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText } from 'ai';

export async function streamAnthropic(
  cfg: ProviderConfig,
  fetcher: FetchFn,
  prompt: string,
  signal: AbortSignal,
): Promise<StreamTextResult<{}, {}>> {
  const provider = createAnthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
    fetch: fetcher,                   // <— obsidianFetch('stream') injected here
  });
  const model = provider(cfg.model || 'claude-haiku-4-5');
  return streamText({
    model,
    prompt,
    abortSignal: signal,
  });
}
```

### Example 3: MarkdownRenderer.render in Modal (verified via Phase 06 PreviewView precedent)

```typescript
// Source: src/preview/ProblemPreviewView.ts:481 (Phase 06 verified pattern)
//
// `this` is the Modal subclass — Modal extends Component, so it satisfies
// obsidianmd/no-plugin-as-component (the rule rejects passing the Plugin
// instance; Modal/View/ItemView/Component all pass).
import { MarkdownRenderer } from 'obsidian';

await MarkdownRenderer.render(
  this.app,
  this.buffer,                         // accumulated AI response Markdown
  this.bodyEl,                         // container — emptied before each render
  '',                                  // sourcePath — empty (no backing file)
  this,                                // Component (the Modal itself)
);
```

### Example 4: setWindowTimeout for mm:ss counter (verified via shared/timers.ts)

```typescript
// Source: src/shared/timers.ts + src/preview/ProblemPreviewView.ts:528
import { setWindowTimeout, clearWindowTimeout, type TimerHandle } from '../shared/timers';

private counterTimer: TimerHandle | null = null;
private elapsedSec = 0;

private startCounter(): void {
  this.counterTimer = setWindowTimeout(() => this.tick(), 1000);
}

private tick(): void {
  this.elapsedSec += 1;
  // re-render label
  this.counterTimer = setWindowTimeout(() => this.tick(), 1000);
}

private stopCounter(): void {
  if (this.counterTimer != null) {
    clearWindowTimeout(this.counterTimer);
    this.counterTimer = null;
  }
}
```

### Example 5: Conditional Verdict Modal Footer Button (extends verdictModalRenderer.ts:483)

```typescript
// In renderSubmitVerdict, after the existing Copy-failing-input button block
// and before the Close button. Locked union = ['wa', 'tle', 'mle', 're', 'ce'].
const showAIDebugButton =
  kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce';

if (showAIDebugButton && onOpenAIDebug) {
  const aiBtn = appendEl(footer, 'button');
  setText(aiBtn, 'AI: Debug');
  aiBtn.addEventListener('click', () => {
    onOpenAIDebug();   // closes verdict modal + opens AIStreamModal
  });
}
```

### Example 6: LastVerdict capture in submissionOrchestrator (extends submit() resolve path)

```typescript
// In SubmissionOrchestrator.submit() after pollSubmission resolves with terminal:
const terminal = await pollSubmission({ ... });
const info = classifyStatus(terminal.status_code, terminal.status_msg);
if (info.kind !== 'ac' && info.kind !== 'unknown' && info.kind !== 'unknown-lc') {
  this.deps.onVerdict?.(slug, {
    kind: 'submit-failure',
    capturedAt: Date.now(),
    verdictText: info.displayName,
    failingInput: terminal.input || terminal.last_testcase,
    expectedOutput: terminal.expected_output ?? asString(terminal.expected_code_answer),
    actualOutput: terminal.std_output ?? asString(terminal.code_output),
    runtimeMs: terminal.status_runtime,
    memoryMb: terminal.status_memory,
    errorMessage: firstNonEmpty(
      terminal.full_compile_error, terminal.compile_error,
      terminal.full_runtime_error, terminal.runtime_error,
    ),
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel AI SDK 4.x — `streamText` returned `experimental_*` types; no `onAbort` callback | SDK 6.0.x — first-class `onAbort: StreamTextOnAbortCallback`; abort event in `fullStream` | 2026-Q1 (SDK 6.0 GA) | Phase 08 uses the locked APIs; no escape-hatch needed. |
| `experimental_providerMetadata` for raw vendor data | `providerMetadata: PromiseLike<ProviderMetadata>` (no experimental_) | SDK 6.0 GA | Phase 08 doesn't need vendor metadata for v1.1; deferred. |
| `abortSignal` only at top-level | `abortSignal` + `timeout` (total + step + chunk) accepted in 6.x | SDK 6.0 GA | Phase 08 uses only `abortSignal`. Step/chunk timeouts are a backlog hardening item. |
| User-locked manual cm.dispatch userEvent suffix for plugin-internal writes | N/A — Phase 08 has no editor writes | N/A | Phase 08's `'leetcode.*'` userEvent allowlist is unused. Confirmed. |

**Deprecated/outdated (relevant to this phase):**
- `experimental_StreamData` — deprecated. Use `result.fullStream` event types directly. Phase 08 uses `result.textStream` only (simpler).
- `result.toAIStream()` — deprecated. Phase 08 uses native AsyncIterable; no transformation needed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `electron.net.fetch` honors `init.signal` (AbortSignal-aware) | Architecture Patterns Pattern 6, Pitfall 4 | If wrong, Cancel on the streaming path is also "ignore + close" semantics. **Mitigation:** Plan 08-02 adds an integration test that calls `electron.net.fetch(url, { signal: ctrl.signal })`, calls `ctrl.abort()`, asserts the returned Promise rejects with AbortError. **Verifiable in CI** by mocking electron.net via `tests/helpers/electronNetStub.ts`. |
| A2 | A 100ms debounce eliminates flicker for typical 2000-token Anthropic responses | Pitfall 1 | If wrong, user sees flicker. **Mitigation:** Verification gate in Plan 08-03 — manual UAT on a 2000-token "explain DP" prompt. Tier 2 escape hatch (append-text-during-stream) is documented. |
| A3 | Streaming chunks ≥ 1 char (no zero-length chunks that trigger empty-buffer renders) | Pattern 4 implementation | If wrong, scheduleRender fires for nothing. **Mitigation:** Guard `if (chunk.length === 0) continue;` in for-await body. Cheap insurance. |
| A4 | `streamText` correctly delegates abortSignal to all 4 providers (anthropic / openai / openai-compatible for OpenRouter & Custom & Ollama) uniformly | Architecture, Pattern 6 | If wrong, Cancel works on Anthropic but not OpenAI. **Mitigation:** Plan 08-02 adds an integration test per adapter using a mock fetcher that respects signal.aborted + asserts the for-await throws AbortError. |
| A5 | The cost-on-cancel posture (add 0) is acceptable to the user (vs estimate from input tokens) | Pitfall 6 | Conservative user-friendly default. If user later wants estimates, deferred backlog. |
| A6 | A single shared `LeetCodePlugin.openAIDebug(slug)` entrypoint can serve all 3 button surfaces without slug-resolution drift | Architecture Patterns | If wrong, palette command fires from a non-LC note and crashes. **Mitigation:** `openAIDebug(slug)` takes the slug as a parameter; each surface resolves slug from its own context (frontmatter / verdict modal payload). The three surfaces use the same resolver but have their own guards. |
| A7 | Disclosure copy extension via factory `withDebugBullet(base)` returns a fresh object that AIDisclosureModal accepts (vs constructor signature change) | Pattern 5 | If wrong, planner has to add `disclosureCopy` constructor param. Cheap fix. |
| A8 | Append-text-during-stream + final Markdown swap (Tier 2 escape hatch) does NOT degrade Cancel UX | Pitfall 1 | If wrong, partial text on cancel looks worse than partial Markdown. **Mitigation:** Tier 2 IS the escape hatch — only adopted if Tier 1 fails. The decision is explicit. |
| A9 | The `buildDebugPrompt` shape (illustrative in Pattern 3) is acceptable as a starting point; planner finalizes wording during Plan 08-03 | Pattern 3 | If wrong, output quality is poor. **Mitigation:** Dogfood iteration; prompt is data, not code architecture. |
| A10 | `result.usage` Promise rejecting on abort is the SDK 6.x behavior (not resolves with partial usage) | Pitfall 6 | Verified by inspection of node_modules/ai/dist/index.mjs:7286 — usage flows through 'finish-step' event which doesn't fire on abort. **Mitigation:** A locked test asserting "abort path adds 0, never reads usage Promise" makes this contract explicit. |
| A11 | `addCost(0)` is a valid idempotent no-op call (doesn't trigger date-rollover side effects) | Pattern 4 | Verified by Phase 07 Plan 01 D-F — `addCostLedger(usd)` does day-rollover-on-write FIRST then adds. Adding 0 still triggers the rollover (correct posture). |

---

## Open Questions

The 8 open questions in CONTEXT.md `<open_questions_for_planning>` are answered here:

### 1. **Live Markdown re-render-per-chunk stability** — RESOLVED

**Recommendation:** Ship 100ms debounce as the default (Tier 1). Append-text Tier 2 documented as escape hatch. Verification gate in Plan 08-03's UAT step ensures no flicker on a 2000-token response. See Pitfall 1 for mitigation table.

### 2. **Exact AI SDK import surface for streaming** — RESOLVED

**Verified:** `import { streamText, generateText } from 'ai';` (core, not per-provider). Per-provider packages export only the provider factory (`createAnthropic`, `createOpenAI`, `createOpenAICompatible`). The factory's return value is a model that you pass to `streamText({ model, ... })`. Source-verified in `node_modules/ai/dist/index.d.ts:2735` + existing `src/ai/providers/anthropic.ts` (which imports `generateText` from `'ai'` for the probe).

### 3. **AbortSignal propagation through streamText to all 4 providers** — RESOLVED

**Verified:** `streamText({ abortSignal })` calls `mergeAbortSignals(abortSignal, ...)` (node_modules/ai/dist/index.mjs:6543) and passes the merged signal into the model's `doStream` method. The model's `doStream` calls the injected `fetch` (our `obsidianFetch('stream')`) with `init.signal`. **Plan 08-02 adds per-adapter abort tests** to confirm this works for all 4 (anthropic / openai / openai-compatible w/ OpenRouter / openai-compatible w/ Ollama / openai-compatible w/ Custom).

### 4. **Whether `requestUrl` can be aborted** — RESOLVED — NO

**Verified:** `src/ai/obsidianFetch.ts:91-118` (the request branch) does NOT forward `init.signal` to requestUrl. Obsidian's `requestUrl` API itself takes no signal parameter. Cancel on the fallback path is "close modal + ignore response when it arrives." Documented as user-visible difference. Plan 08-03 must add a swallowed-promise pattern to prevent unhandled rejection.

### 5. **streamText behavior with non-streaming injected fetch** — RESOLVED

**Recommendation:** Don't rely on streamText with a non-streaming fetch. **Plan 08-02 adds an explicit `generateText` call on the fallback path.** AIClient.invokeStream returns a discriminated tuple `{ kind: 'stream', ... } | { kind: 'buffered', ... }`; the modal switches body strategy on kind. This is cleaner than hoping streamText's internal handling degrades correctly for a buffered Response.

### 6. **Cost-ledger posture on cancel mid-stream** — RESOLVED

**Recommendation:** Add `0` to the ledger on cancel. `result.usage` Promise rejects on abort (not resolves with partial); we don't read it. Conservative + user-friendly. Pitfall 6 documents the rationale. Future improvement (estimate from input tokens) is deferred backlog.

### 7. **Exact `LastVerdict` field set against orchestrator output** — RESOLVED

**Verified:** Field-by-field mapping in Pattern 2's TypeScript shape. Every field maps to a real `RunCheckResponse`/`SubmitCheckResponse` field in `src/solve/types.ts:71-117`. `runtimeMs` and `memoryMb` are kept as `string` (LC's wire format — `'120 ms'` / `'14.5 MB'`); naming `runtimeMs`/`memoryMb` is illustrative — planner may rename to `runtimeText`/`memoryText` for accuracy.

### 8. **Verdict-classification helper location** — RESOLVED

**Recommendation:** Reuse `classifyStatus(code, msg).kind === 'ac'` from `src/solve/statusMap.ts:40`. NO new helper. The check fits in 1 line at the verdict-modal-button visibility gate AND at the orchestrator post-resolve hook AND at the LastVerdictStore capture filter.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `electron.net.fetch` (Electron host API) | Streaming AI calls | ✓ | Electron 28+ (provided by Obsidian 1.7+) | `requestUrl` non-streaming buffered Response |
| Obsidian `requestUrl` | All LC calls + AI fallback path | ✓ | Obsidian 1.7+ (built-in) | — |
| `MarkdownRenderer.render` | AIStreamModal body render | ✓ | Obsidian 1.10+ (built-in; minAppVersion check passes) | — |
| `setIcon` from Lucide | Modal spinner / icons (optional) | ✓ | Obsidian 1.10+ | Plain Unicode glyph |
| `navigator.clipboard.writeText` | Copy-to-clipboard footer | ✓ on desktop | — | Notice "Clipboard unavailable" + manual copy from selection (mirrors VerdictModal precedent) |
| Vercel AI SDK 6.x | streamText + generateText | ✓ (already installed) | `ai@6.0.183` | — |
| `@ai-sdk/anthropic` | Anthropic streaming | ✓ | `3.0.78` | — |
| `@ai-sdk/openai` | OpenAI streaming | ✓ | `3.0.64` | — |
| `@ai-sdk/openai-compatible` | OpenRouter / Ollama / Custom streaming | ✓ | `2.0.47` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

---

## Validation Architecture

> nyquist_validation = true. Section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (already installed) |
| Config file | `vitest.config.*` (existing — Phase 07 wave 0 verified) |
| Quick run command | `npx vitest run tests/ai/ tests/solve/lastVerdictStore.test.ts -- --reporter=basic` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIDBG-01 | Code-fence button row has 3rd button "AI: Debug" both Edit AND Reading mode | unit | `npx vitest run tests/main/codeBlockButtonRow.test.ts` | exists — extend |
| AIDBG-01 | Palette command `ai-debug` registered with editorCheckCallback guard | unit | `npx vitest run tests/main/aiDebugCommand.test.ts` | needs Wave 0 |
| AIDBG-01 | VerdictModal AI Debug button visible iff kind ∈ {wa, tle, mle, re, ce}; absent for ac/ole/ie/unknown | unit | `npx vitest run tests/solve/VerdictModal.aiDebugButton.test.ts` | needs Wave 0 |
| AIDBG-01 | RunModal AI Debug button visible on failure footer | unit | `npx vitest run tests/solve/RunModal.aiDebugButton.test.ts` | needs Wave 0 |
| AIDBG-01 | LastVerdictStore captures on submit-failure + run-failure; NOT on accept | unit | `npx vitest run tests/solve/lastVerdictStore.test.ts` | needs Wave 0 |
| AIDBG-01 | LastVerdictStore is per-slug (parallel debugging) | unit | `npx vitest run tests/solve/lastVerdictStore.test.ts` | needs Wave 0 |
| AIDBG-01 | LastVerdictStore cleared on plugin unload | unit | `npx vitest run tests/solve/lastVerdictStore.test.ts` | needs Wave 0 |
| AIDBG-01 | submissionOrchestrator post-resolve callback fires for non-AC verdicts | unit | `npx vitest run tests/solve/submissionOrchestrator.onVerdict.test.ts` | needs Wave 0 |
| AIDBG-01 | buildDebugPrompt produces locked prompt structure with all 4 mandatory inputs | unit | `npx vitest run tests/ai/buildDebugPrompt.test.ts` | needs Wave 0 |
| AIDBG-01 | buildDebugPrompt empty-store path emits "No verdict yet — review the code as-is." | unit | `npx vitest run tests/ai/buildDebugPrompt.test.ts` | needs Wave 0 |
| AIDBG-01 | buildDebugPrompt does NOT include `## Notes` content | unit | `npx vitest run tests/ai/buildDebugPrompt.test.ts` | needs Wave 0 |
| AIDBG-02 | AIStreamModal renders body live via MarkdownRenderer (debounced) when stream available | unit | `npx vitest run tests/ai/AIStreamModal.streaming.test.ts` | needs Wave 0 |
| AIDBG-02 | AIStreamModal renders Thinking… + mm:ss counter on fallback path | unit | `npx vitest run tests/ai/AIStreamModal.fallback.test.ts` | needs Wave 0 |
| AIDBG-02 | AIStreamModal counter ticks once per second | unit | `npx vitest run tests/ai/AIStreamModal.fallback.test.ts` (vi.useFakeTimers) | needs Wave 0 |
| AIDBG-02 | First chunk replaces Thinking… placeholder | unit | `npx vitest run tests/ai/AIStreamModal.streaming.test.ts` | needs Wave 0 |
| AIDBG-02 | 100ms debounce: 5 chunks within 100ms → 1 render call | unit | `npx vitest run tests/ai/AIStreamModal.debounce.test.ts` (vi.useFakeTimers) | needs Wave 0 |
| AIDBG-02 | Live re-render UAT (manual) — 2000-token prompt, no flicker | manual UAT | (08-VALIDATION.md Plan 08-03 step) | manual |
| AIDBG-03 | Cancel button click aborts stream; modal stays open with partial output | unit | `npx vitest run tests/ai/AIStreamModal.cancel.test.ts` | needs Wave 0 |
| AIDBG-03 | Modal onClose() during in-flight stream calls abortController.abort() | unit | `npx vitest run tests/ai/AIStreamModal.cancel.test.ts` | needs Wave 0 |
| AIDBG-03 | Cancel mid-stream adds 0 to cost ledger (does NOT read result.usage) | unit | `npx vitest run tests/ai/AIStreamModal.cancel.test.ts` | needs Wave 0 |
| AIDBG-03 | Fallback path Cancel closes modal + swallows pending response Promise | unit | `npx vitest run tests/ai/AIStreamModal.fallback.cancel.test.ts` | needs Wave 0 |
| AIDBG-03 | abortSignal propagates to streamText → adapter fetch.init.signal (per-provider) | unit | `npx vitest run tests/ai/providers/abortSignal.test.ts` | needs Wave 0 |
| AIDBG-03 | electron.net.fetch honors init.signal (mock test) | unit | `npx vitest run tests/ai/electronNet.signal.test.ts` | needs Wave 0 |
| (cross) | Disclosure factory `withDebugBullet(base)` does not mutate base; returns fresh object | unit | `npx vitest run tests/ai/disclosure.withDebugBullet.test.ts` | needs Wave 0 |
| (cross) | tests/ai/lc-isolation.test.ts continues to pass (no obsidianFetch import in src/solve/, src/notes/, etc.) | regression | `npm test -- tests/ai/lc-isolation.test.ts` | exists — must NOT trip |
| (cross) | Bundle size remains under 1 MB ceiling | bundle | `npm run check:bundle-size` | exists — Phase 06 gate |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/ai/ tests/solve/lastVerdictStore.test.ts -- --reporter=basic`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`. Manual UAT gate (live-render flicker check) BEFORE Plan 08-03 closes.

### Wave 0 Gaps

- [ ] `tests/solve/lastVerdictStore.test.ts` — covers LastVerdictStore semantics (set/get/clear, per-slug, in-memory).
- [ ] `tests/solve/submissionOrchestrator.onVerdict.test.ts` — covers post-resolve callback for non-AC.
- [ ] `tests/ai/buildDebugPrompt.test.ts` — covers prompt assembly verbatim against fixtures including empty-store path and `## Notes`-exclusion.
- [ ] `tests/ai/AIStreamModal.streaming.test.ts` — covers stream-path render + first-chunk replacement.
- [ ] `tests/ai/AIStreamModal.fallback.test.ts` — covers Thinking… UX + counter cadence.
- [ ] `tests/ai/AIStreamModal.cancel.test.ts` — covers Cancel button + onClose + cost ledger 0.
- [ ] `tests/ai/AIStreamModal.fallback.cancel.test.ts` — covers fallback cancel posture.
- [ ] `tests/ai/AIStreamModal.debounce.test.ts` — covers 100ms debounce ring buffer.
- [ ] `tests/ai/providers/abortSignal.test.ts` — covers per-adapter abort propagation.
- [ ] `tests/ai/electronNet.signal.test.ts` — covers electron.net.fetch mock signal honoring.
- [ ] `tests/ai/disclosure.withDebugBullet.test.ts` — covers factory immutability of base.
- [ ] `tests/main/aiDebugCommand.test.ts` — covers palette command guard.
- [ ] `tests/solve/VerdictModal.aiDebugButton.test.ts` — covers conditional visibility (5 kinds present, 4 kinds absent).
- [ ] `tests/solve/RunModal.aiDebugButton.test.ts` — covers Run failure footer.
- [ ] Test helper: `tests/helpers/electronNetStub.ts` — mock `electron.net.fetch` with signal-aware abort behavior. Reused by 08-02/08-03 tests.

---

## Security Domain

> security_enforcement enabled (default). Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | AI provider auth lives in API key (Phase 07); Phase 08 reads via SettingsStore, never logs |
| V3 Session Management | no | No sessions in Phase 08; AI calls are stateless |
| V4 Access Control | yes | Disclosure gate (Phase 07) is the per-provider access control; Phase 08 inherits the gate at AIClient.invokeStream — verified by routing through AIClient |
| V5 Input Validation | yes | Prompt payload (user code + verdict) — Markdown-escape via `MarkdownRenderer.render` (no `innerHTML`); `## Notes` exclusion is the data-minimization control |
| V6 Cryptography | no | TLS handled by electron.net.fetch / requestUrl; no plugin-side crypto |
| V8 Data Protection | yes | API keys (data.json) — Phase 07 baseline; redact in logs (Phase 07 T-07-05); Phase 08 must not log full prompt/response (Pitfall 10) |
| V9 Communication | yes | electron.net.fetch with `credentials: 'omit'` — Phase 07 T-07-02 mitigation; cookies stripped both branches |
| V11 Business Logic | yes | Cost ledger correctness (don't bill cancelled calls — Pitfall 6) |
| V13 API & Web Service | yes | AbortController plumbing — Pitfall 4 zombie network call prevention |

### Known Threat Patterns for Obsidian + AI SDK Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cookie leakage to AI provider host (T-07-02 carryover) | Information Disclosure | `obsidianFetch` enforces `credentials: 'omit'` in BOTH branches even when caller passes `'include'`. Verified at `src/ai/obsidianFetch.ts:83`. |
| API key leakage in logs | Information Disclosure | Logger redaction (Phase 07 T-07-05) covers `apikey` / `api_key` / `Authorization: Bearer ...`. Phase 08 grep test ensures no full-prompt logging. |
| `## Notes` content leakage to provider | Information Disclosure | Locked decision A — `## Notes` NEVER sent. Asserted by `tests/ai/buildDebugPrompt.test.ts`. |
| AI response XSS via `innerHTML` | Tampering | `MarkdownRenderer.render` only — never `innerHTML`. Phase 06 PreviewView precedent. |
| Disclosure-bypass via direct `resolveAdapter` import | Elevation of Privilege | Documented in Phase 07 AIClient JSDoc. Phase 08 only imports AIClient — never resolveAdapter directly. AIPROV-05 grep gate doesn't catch this; community-plugin review is the human safety net. |
| Cost-ledger inflation on cancel (charged for unused tokens) | Repudiation / Tampering | Add 0 to ledger on cancel (Pitfall 6). |
| Zombie network call after modal close | Repudiation | onClose() aborts via AbortController (Pitfall 4). |
| LeetCode session cookie leakage in AI prompt (e.g., user pastes from cookies-tab into note) | Information Disclosure | Out of scope — user-side accident. README discloses what AI sees per AIPROV-04. |
| Provider rate limit (429) → unbounded retries | Denial of Service (self) | No retry in Phase 08. Provider 429 surfaces as error in modal. Backlog for Phase 09 polish. |
| Slopsquatted package update during routine npm install | Supply chain | All Phase 08 packages already pinned via Phase 07 lockfile. No new installs. |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/ai/dist/index.d.ts` (lines 2308-2470, 2580-2890, 2735) — `StreamTextResult`, `streamText` declaration, `OnFinishEvent`, `StreamTextOnAbortCallback` types — verified `ai@6.0.183`.
- `node_modules/ai/dist/index.mjs` (lines 6488-6580, 7286) — streamText function body, `mergeAbortSignals`, abort handling — verified shape.
- `node_modules/ai/dist/index.d.ts` (line 2453) — `textStream: AsyncIterableStream<string>` confirmed iterable shape.
- `src/ai/AIClient.ts` (Phase 07 Plan 05) — disclosure gate seam location at `invoke` line 130-160.
- `src/ai/disclosure.ts:55-73` — `Object.freeze`'d `DISCLOSURE_BASE_COPY` constant; composition contract.
- `src/ai/obsidianFetch.ts:77-119` — both branches; `credentials: 'omit'` enforcement; requestUrl signal absence.
- `src/ai/providers/{anthropic,openai,openaiCompatible,ollama}.ts` — adapter seam where streamText replaces the Phase 07 stub.
- `src/main/codeBlockButtonRow.ts:29` — host interface to extend with `aiDebugFromActive()`.
- `src/solve/statusMap.ts:40` — `classifyStatus(code, msg).kind === 'ac'` — verdict-Accepted check.
- `src/solve/types.ts:71-117` — RunCheckResponse + SubmitCheckResponse field shape (LastVerdict source-of-truth).
- `src/solve/verdictModalRenderer.ts:170-179, 458-505` — pass-mask computation pattern + footer button construction.
- `src/solve/ephemeralTabStore.ts` — Map-on-Plugin precedent for LastVerdictStore.
- `src/preview/ProblemPreviewView.ts:481` — `MarkdownRenderer.render(this.app, md, el, '', this)` non-MarkdownView precedent.
- `src/shared/timers.ts` — `setWindowTimeout` for mm:ss counter.
- `tests/main/codeBlockButtonRow.test.ts:31` — locked "exactly 2 children" test contract to bump.
- `tests/ai/lc-isolation.test.ts` — Phase 07 regression — must NOT trip.
- `.planning/phases/07-ai-provider-foundation/07-RESEARCH.md` — full Phase 07 context (verified package versions, bundle size baseline).
- `.planning/phases/07-ai-provider-foundation/07-CONTEXT.md` — Phase 07 decisions (disclosure gate, cost ledger, provider adapter pattern, obsidianFetch contract).
- `.planning/phases/06-foundations-preview-mode/06-CONTEXT.md` — `routeProblemClick` precedent + MarkdownRenderer.render discipline.

### Secondary (MEDIUM confidence)

- Vercel AI SDK 6.x changelog (training data + node_modules verification) — `onAbort` callback added in 6.0 GA.
- Electron 28+ `net.fetch` AbortSignal honoring — Electron docs (Obsidian 1.7+ ships Electron 28+).
- Anthropic Messages API content-block-delta SSE format — normalized by `@ai-sdk/anthropic` adapter; Phase 08 doesn't see raw SSE.

### Tertiary (LOW confidence)

- Manual UAT requirement for live-render flicker assessment (Pitfall 1) — no published Obsidian benchmark for repeated `MarkdownRenderer.render` calls. Validation gated to UAT step in Plan 08-03.
- Estimated streaming chunk frequency at typical Anthropic rate (~30 tokens/sec → 50–100 chunks for 2000-token response) — used for sizing 100ms debounce. Conservative — real rate may be slightly higher.

---

## Project Constraints (from CLAUDE.md)

The following directives extracted from `./CLAUDE.md` MUST be honored by Plan 08-XX. The planner should verify each plan against this list:

1. **All HTTP to leetcode.com via `requestUrl` — absolute, no exceptions.** Phase 08 AI calls go through `obsidianFetch(mode)` only; `tests/ai/lc-isolation.test.ts` MUST stay green.
2. **All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden.** Phase 08 has NO vault writes.
3. **Plugin-internal CM6 dispatches (if any) use `userEvent: 'leetcode.*'`.** Phase 08's modal does NOT write to the editor — no cm.dispatch needed.
4. **No `innerHTML` with user data** — `createEl()` / `MarkdownRenderer.render` only.
5. **No `eval()` / `new Function()` / dynamic `<script>` injection.**
6. **`isDesktopOnly: true` in manifest.json** — already set; Phase 08 uses `electron.net.fetch` which mandates this.
7. **No "obsidian" in plugin ID; no plugin-id prefix in command IDs; no "command" word in command IDs.** Phase 08 adds `ai-debug` (clean ID, no prefix). Per FOUND-03.
8. **No default hotkeys** — Phase 08 does NOT set a default hotkey on the `ai-debug` command.
9. **Resource cleanup** — all event listeners registered via `registerEvent()`; modal cleanup on `onClose()`.
10. **Use `this.app` not global `app`.**
11. **All vendored brand strings via `prettyName(provider)` from `src/ai/types.ts`.**
12. **Plugin-internal CM6 dispatches that target locked ranges MUST set `userEvent: 'leetcode.<verb>'`.** N/A for Phase 08.
13. **Vault writes via `app.vault.process` and `app.fileManager.processFrontMatter`.** N/A for Phase 08 — no vault writes.
14. **`obsidianmd/no-plugin-as-component` rule** — `MarkdownRenderer.render(this.app, md, el, '', this)` where `this` is the Modal (Modal extends Component, satisfies the rule).
15. **`prefer-instanceof` rule + `vault/iterate` rule + `commands/no-command-in-command-id` + `no-plugin-id-in-command-id`** — verified `ai-debug` is clean.
16. **Logger redaction discipline** — never log full prompts/responses; only metadata.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against `package.json` + `node_modules/ai/package.json`; SDK API surface verified against `node_modules/ai/dist/index.d.ts`.
- Architecture patterns: HIGH — every pattern mapped to a verified existing precedent in repo (Phase 06 PreviewView, Phase 05 EphemeralTabStore, Phase 07 AIClient gate, Phase 03 verdictModalRenderer, Phase 5.3 codeBlockButtonRow).
- Pitfalls: MEDIUM — Pitfall 1 (live-render perf) is the highest uncertainty; mitigation tier system documented; verification gated to UAT. All other pitfalls are LOW uncertainty (verified against source).
- LastVerdict shape: HIGH — every field verified against `src/solve/types.ts`.
- AbortSignal propagation: HIGH — verified through `node_modules/ai/dist/index.mjs` source inspection.
- Cost-on-cancel posture: MEDIUM — locked at `0` per conservative reasoning; could be revisited post-dogfood.
- Verdict-Accepted helper location: HIGH — existing helper at `src/solve/statusMap.ts:40` reused.

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days for stable APIs; SDK 6.x is GA so unlikely to break in 30 days; bump to 7 days post-2026-06-01 if SDK 7.0 prerelease appears)

---

*Phase 08 research captured: 2026-05-15. Ready for `/gsd-plan-phase 8`.*
