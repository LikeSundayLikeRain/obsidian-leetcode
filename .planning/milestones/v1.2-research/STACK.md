# Stack Research

**Domain:** Obsidian community plugin — LeetCode integration (desktop, Electron-based) — v1.1 milestone (Contest, AI Coach, Preview)
**Researched:** 2026-05-14
**Confidence:** HIGH (all v1.1 additions verified against Context7/official docs, npm registry timestamps within 6 months, real-world Obsidian-plugin reference implementations, and locally-installed `node_modules` type definitions)

> **Scope note.** This document focuses on **STACK CHANGES needed for v1.1**. The v1.0 baseline (TypeScript 5.8.3, esbuild 0.25.5, `obsidian` API, CodeMirror 6 externals, `@leetnotion/leetcode-api` 3.0.0, hand-rolled REST for run/submit, `requestUrl`, `turndown` 7.2.4, `vitest` 4.1.5) is unchanged and remains validated. See git history for the original (pre-v1.1) STACK.md.

---

## v1.1 New Stack Summary (TL;DR)

| Capability | Add | Version | Why |
|------------|-----|---------|-----|
| Multi-provider LLM client | `ai` | `6.37.0` (2026-05-12) | Single TS API across all providers, supports per-provider custom `fetch`, validated in production by 6+ Obsidian plugins (Caret, Anker, llmsider, wordwise, ai-canvas, intuition) |
| OpenAI-compatible adapter (covers OpenRouter, Ollama remote, vLLM, custom base URLs) | `@ai-sdk/openai-compatible` | `2.0.47` (2026-05-13) | Native `baseURL` + `apiKey` + `fetch` options; one provider for all OpenAI-shape endpoints |
| OpenAI provider | `@ai-sdk/openai` | `3.0.77` (2026-05-13) | First-party OpenAI provider; honors `fetch` override |
| Anthropic provider | `@ai-sdk/anthropic` | `3.0.63` (2026-05-13) | First-party Anthropic provider; honors `fetch` override; needed because Anthropic's wire format is not OpenAI-compatible |
| Amazon Bedrock provider | `@ai-sdk/amazon-bedrock` | `4.0.105` (2026-05-13) | First-party AWS Bedrock provider; supports SigV4 + custom `fetch` |
| Zod (peer dep of ai-sdk) | `zod` | `4.4.3` (2026-05-04) | Required peer dep of `@ai-sdk/provider-utils@4.0.27` (`^3.25.76 \|\| ^4.1.8`); used for tool/output schemas |
| Streaming transport (SSE-capable, CORS-bypass) | `electron.net.fetch` (Electron built-in, no npm dep) | bundled with Obsidian's Electron host | True streaming `Response.body` ReadableStream; CORS-free; pattern proven by `your-papa/obsidian-Smart2Brain` |
| Buffered fallback transport | `requestUrl` (Obsidian built-in, no npm dep) | bundled with Obsidian | Already in v1.0; falls back when `electron.net.fetch` is unavailable; **no streaming** but works for non-streaming AI calls (review, knowledge-graph) |

**No new bundler config required** — `ai`, `@ai-sdk/*`, and `zod` bundle cleanly into the existing esbuild CJS output. Estimated bundle delta: **~80–110 KB minified+gzipped** (ai-sdk core + 3 providers + zod-mini path), bringing the bundle from ~163 KB to ~245–275 KB. Within plugin-store norms (Smart Connections, Caret, Smart2Brain are all 300 KB–2 MB).

---

## Recommended Stack — v1.1 Additions

### LLM Client

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `ai` (Vercel AI SDK) | `6.37.0` (2026-05-12) | Unified `streamText` / `generateText` / `generateObject` API across all providers | The de-facto standard in 2026 Obsidian AI plugins. Caret, Anker, llmsider, wordwise, ai-canvas, intuition, vibesidian — all on `ai`. Single API surface means all 5 providers share the same code path, so AI Debug streaming, AI ACed-review, and AI graph maintenance all work the same way. ESM + CJS dual; tree-shakes well; peer-deps only on zod. |
| `@ai-sdk/openai` | `3.0.77` (2026-05-13) | OpenAI provider | First-party; ships with `createOpenAI({ baseURL, apiKey, fetch, headers })`. Required for native OpenAI calls; also usable for Azure OpenAI by overriding `baseURL`. |
| `@ai-sdk/anthropic` | `3.0.63` (2026-05-13) | Anthropic provider | First-party; same option shape as openai. Anthropic's wire format (`/v1/messages`, `anthropic-version` header) is NOT OpenAI-compatible, so the dedicated provider is required — `@ai-sdk/openai-compatible` will not work for Anthropic. |
| `@ai-sdk/openai-compatible` | `2.0.47` (2026-05-13) | OpenRouter, Ollama (remote), vLLM, LM Studio, NVIDIA NIM, any custom OpenAI-shape endpoint | One provider covers everything that exposes the OpenAI chat-completions schema. `createOpenAICompatible({ name, baseURL, apiKey, fetch })`. Instead of bundling separate community packages for OpenRouter / Ollama / etc., we use this single adapter — cuts bundle size and reduces dependency surface. **Pattern proven by `jcollingj/caret`** which uses it for the user's "custom" provider slot. |
| `@ai-sdk/amazon-bedrock` | `4.0.105` (2026-05-13) | AWS Bedrock provider | First-party; handles SigV4 auth and the Bedrock InvokeModel/ConverseStream wire format. Required because Bedrock is NOT OpenAI-compatible. Honors custom `fetch`. |
| `zod` | `4.4.3` (2026-05-04) | Schema validation peer-dep | Hard peer-dep of `@ai-sdk/provider-utils@4.0.27` (`^3.25.76 \|\| ^4.1.8`). Used internally by ai-sdk for tool / structured-output schemas. Pin to v4 to match what ai-sdk treeshakes most aggressively. Already used by `jcollingj/caret`'s LLM layer. |

### Streaming Transport

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `electron.net.fetch` | bundled (no dep) | Streaming HTTP transport for AI Debug live token feed | **Obsidian/Electron's `requestUrl` returns a fully-buffered `RequestUrlResponse` with `text`/`json`/`arrayBuffer` — confirmed in `node_modules/obsidian/obsidian.d.ts` — there is NO `ReadableStream` body.** That kills `streamText` token-by-token UX if you only have `requestUrl`. The fix is `electron.net.fetch` — exposed via `require('electron').net.fetch` (or `electron.remote.net.fetch` on older builds). It is CORS-free (`net.fetch` runs in the main process via the chromium net stack) AND returns a real `Response` with a `body` ReadableStream. **Confirmed real-world pattern by `your-papa/obsidian-Smart2Brain` (`src/lib/aiTransport.ts`).** Resolution order: `globalThis.require('electron').net.fetch` → `globalThis.require('electron').remote.net.fetch` → `import('electron').net.fetch`. |
| `requestUrl` (Obsidian) | bundled (no dep) | Buffered fallback when streaming transport is unavailable + all non-streaming AI calls | Already in use for v1.0 LeetCode calls. For AI: ACed-solution review, knowledge-graph cluster naming, and graph-edge generation all use `generateText` / `generateObject` (one shot, no streaming) — `requestUrl` is fine for these. Only AI Debug needs `electron.net.fetch`. |

**Pattern:** Build one `obsidianFetch(mode: 'stream' | 'buffered')` adapter. In `'stream'` mode it uses `electron.net.fetch`. In `'buffered'` mode it uses `requestUrl`. The adapter is passed to each provider via the `fetch` option — same call site, different transport.

### Contest Data API

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@leetnotion/leetcode-api` | `3.0.0` (2026-04-03) — **already installed** | Past contests list, contest problem set, user contest history | **VERIFIED in `node_modules/@leetnotion/leetcode-api/lib/index.d.ts`**: the library already exposes `getPastContests({ limit, skip })` (returns `PastContests` = `{ totalNum, contests: PastContest[] }` where each `PastContest` has `titleSlug, title, startTime, duration, totalQuestions, solved`), `getContestQuestions(contestSlug)` (returns `ContestQuestions = { questions: ContestQuestion[] }` where each has `title, title_slug, credit, difficulty`), and `user_contest_info(username)` (returns `UserContestInfo` = ranking + history). **No new dependency needed for contest data.** The underlying GraphQL queries are `contestV2HistoryContests`, `contestQuestionList`, and `userContestRanking + userContestRankingHistory` (verified in upstream `codewithsathya/leetcode-api/src/graphql/*.graphql`). |
| Hand-rolled REST for `interpret_solution`/`submit`/`check` | — (already implemented in v1.0) | Run/submit code during virtual contest | Reused as-is. Contest mode submits exactly the same way as a normal problem; the only contest-specific concern is that LC's contest pages live at `/contest/{slug}/problems/{problem-slug}/` but `submit` still posts to `/problems/{slug}/submit/`. |

**Per-contest user submission summary** is NOT a single endpoint. The strategy: when a virtual contest ends, query the user's recent submissions (`recent_user_submissions(username, limit=20)`, already in `@leetnotion/leetcode-api`) and filter by `titleSlug ∈ contest.questions[*].titleSlug` and `timestamp ∈ [contestStart, contestEnd]`. Verified pattern.

### Virtual Timer & Persistence

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `setInterval` + `Plugin.registerInterval()` | bundled (Obsidian) | 90/100-min contest countdown + UI tick | Already the v1.0 pattern for submission polling. **Do not** add a state-machine library — virtual contest is a 4-state FSM (idle → running → paused → ended); a 30-line discriminated union is more maintainable than xstate's 60 KB+ runtime. Persistence: serialize `{ contestSlug, startedAt, durationSec, pausedSec, endedAt? }` into `data.json` via `loadData/saveData`. On plugin reload, recompute remaining time from `Date.now() - startedAt - pausedSec`. No timer libs survive Obsidian reloads anyway — only persisted timestamps do. |

### Preview Rendering

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `ItemView` + `MarkdownRenderer.render()` | bundled (Obsidian) | Read-mode preview tab for "Start Problem" CTA | **VERIFIED in `node_modules/obsidian/obsidian.d.ts`**: `MarkdownRenderer.render(app, markdown, el, sourcePath, component)` is the static, current API (the older `renderMarkdown` is `@deprecated`). The idiomatic pattern: register a custom `ItemView` (e.g. `LC_PREVIEW_VIEW_TYPE = "leetcode-preview"`) via `this.registerView(...)`, open it via `workspace.getLeaf(false).setViewState({ type: LC_PREVIEW_VIEW_TYPE, state: { slug } })`. In `onOpen`, call `MarkdownRenderer.render()` to inject the converted problem markdown. Add a "Start Problem" / "Open Problem" button via `addAction()` (toolbar) or `containerEl.createEl('button', ...)` (inline). No note creation happens until the button is clicked. **No new dependencies — entirely native Obsidian API.** |

### Forward-Looking Wikilinks (Look-ahead Edges)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Native Obsidian `[[wikilinks]]` + `app.metadataCache.unresolvedLinks` | bundled (Obsidian) | AI-emitted look-ahead edges to UNSOLVED problems | **VERIFIED in `obsidian.d.ts`**: `MetadataCache.unresolvedLinks: Record<string, Record<string, number>>` already maps every dangling `[[Two Sum II]]` reference, even if the target note doesn't exist. Obsidian renders them dimly out of the box. **No new dependency required.** When the user later solves the problem and the note is created, the link auto-resolves on `metadataCache.on('resolve')`. This means: write `[[Two Sum II]]` literally into a hub note's `## Related (Look-ahead)` section, and Obsidian's graph picks it up immediately. The `obsidian-graph-analysis` plugin is irrelevant — its niche is graph metrics, not edge creation. |

---

## Installation

```bash
# v1.1 LLM stack (only what's not already installed)
npm install ai@6.37.0
npm install @ai-sdk/openai@3.0.77
npm install @ai-sdk/anthropic@3.0.63
npm install @ai-sdk/openai-compatible@2.0.47
npm install @ai-sdk/amazon-bedrock@4.0.105
npm install zod@4.4.3
```

**No new dev-dependencies.** The existing `vitest@4.1.5` + esbuild stack handles AI-provider unit tests fine (mock the `fetch` override).

**No new esbuild externals.** `ai`, `@ai-sdk/*`, and `zod` all bundle cleanly. Keep the existing externals list (`obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, Node builtins) untouched. **Important: `electron` MUST stay in the externals list** — it is provided by Obsidian's runtime; bundling it would break `electron.net.fetch` resolution.

---

## Detailed Decision Rationale — v1.1

### 1. Why Vercel AI SDK over alternatives

**Considered:**

| Option | Verdict | Reason |
|--------|---------|--------|
| `ai` (Vercel AI SDK) v6.37.0 | **WINNER** | Single TypeScript API for all providers. `streamText`, `generateText`, `generateObject`. Per-provider custom `fetch` (verified — see code samples). Real-world proven in 6+ Obsidian plugins. Maintenance: published 2026-05-12 (2 days before research date). |
| `langchain` v1.4.0 (2026-05-05) | Reject | Heavy (multiple sub-packages, 100+ KB minified for the parts you'd actually use). Not idiomatic for "lightweight plugin call site." Useful for agent orchestration, overkill for AI Debug + ACed review. |
| `openai` (official SDK) v6.37.0 | Reject | OpenAI-only. Forces hand-rolling Anthropic + Bedrock + Ollama. Worse: the official SDK depends on `ws` for some transports, ships with Node-specific patterns, and historically has had bundling friction in Electron renderer (multiple Obsidian plugin issues filed against it). The community has converged on ai-sdk specifically to escape this. |
| `@anthropic-ai/sdk` v0.96.0 | Reject (as primary) | Anthropic-only; same multi-provider problem. Could be a fallback if `@ai-sdk/anthropic` ever lags Anthropic API features, but no current reason. |
| `@aws-sdk/client-bedrock-runtime` v3.1047.0 | Reject (as primary) | AWS SDK v3 alone is ~150 KB minified — too heavy for what we need. `@ai-sdk/amazon-bedrock` is 25 KB and uses the same SigV4 logic. |
| `ollama` v0.6.3 (Nov 2025) | Reject | Last published 2025-11-19 — six months stale by 2026-05. `@ai-sdk/openai-compatible` covers Ollama via its OpenAI-compatible endpoint at `http://localhost:11434/v1` (verified by ai-sdk docs). |
| Raw `requestUrl` + hand-rolled provider clients | Reject | 5 providers × 2 modes (stream/buffered) × per-provider wire-format quirks (Anthropic's `messages` shape, Bedrock's `ConverseStream` event stream, OpenAI's SSE `data: ...` lines, Ollama's NDJSON) = 2,000+ lines of provider-handling code. Not where this project should spend complexity budget. ai-sdk is exactly this code, maintained by Vercel. |

### 2. Why custom `fetch` per provider, not a global override

ai-sdk providers (`createOpenAI`, `createAnthropic`, `createOpenAICompatible`, `createAmazonBedrock`) each accept a `fetch` option that defaults to `globalThis.fetch`. Don't shim global `fetch` — that breaks unrelated Obsidian core code that relies on the real `fetch`. Pass the adapter explicitly:

```ts
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

const openai = createOpenAI({
  apiKey: settings.openai.key,
  baseURL: settings.openai.baseUrl ?? 'https://api.openai.com/v1',
  fetch: createObsidianFetch({ mode: 'stream' }),  // or 'buffered'
});
```

This pattern is verified in `gnuhpc/obsidian-llmsider`, `AlexW00/anker`, `ckt1031/obsidian-wordwise-plugin`, `0xIntuition/intuition-obsidian-plugin`, `testy-cool/obsidian-ai-canvas`.

### 3. The streaming transport problem (binding constraint)

Obsidian's `RequestUrlResponse` (verified in local `node_modules/obsidian/obsidian.d.ts`):

```ts
export interface RequestUrlResponse {
    status: number;
    headers: Record<string, string>;
    arrayBuffer: ArrayBuffer;
    json: any;
    text: string;
}
```

**No `body` ReadableStream.** No incremental read. The full response is available only after the entire body has been buffered. This is fine for `generateText` / `generateObject` (one-shot) but **breaks `streamText`** — calling `streamText` with a buffered fetch produces a `textStream` that emits all tokens at once when the response completes, not as the model generates them. UX-wise this looks like a 3–10 second hang then a wall of text appears.

**The fix** is `electron.net.fetch`, exposed by Electron's main-process `net` module. It:
- Runs in the chromium net stack (CORS-free for cross-origin requests from plugin context).
- Returns a real Web `Response` whose `body` is a `ReadableStream<Uint8Array>`.
- Is reachable from the renderer via `require('electron').net.fetch` (recent builds) or `require('electron').remote.net.fetch` (older builds with `@electron/remote` or pre-Electron-14 hosts).

Resolution order (from `your-papa/obsidian-Smart2Brain/src/lib/aiTransport.ts`, verified pattern):

```ts
async function getElectronNetFetch(): Promise<typeof fetch | null> {
  const requireFn = (globalThis as any).require ?? (window as any).require;
  if (typeof requireFn === 'function') {
    try {
      const electron = requireFn('electron');
      // Try main-process net.fetch first
      if (typeof electron?.net?.fetch === 'function') {
        return electron.net.fetch.bind(electron.net);
      }
      // Fall back to remote.net.fetch (older builds)
      if (typeof electron?.remote?.net?.fetch === 'function') {
        return electron.remote.net.fetch.bind(electron.remote.net);
      }
    } catch { /* fall through */ }
  }
  return null;  // caller falls back to requestUrl
}
```

If `electron.net.fetch` is unavailable (very old Obsidian builds), AI Debug should gracefully degrade to non-streaming mode using `requestUrl` and `generateText` — the suggestions still arrive, just all at once.

`isDesktopOnly: true` in the manifest is already set by v1.0, which is required for `electron` access.

### 4. Why `@ai-sdk/openai-compatible` instead of dedicated OpenRouter / Ollama packages

`@openrouter/ai-sdk-provider` (separate package) exists, and `ollama-ai-provider` exists. We could install both. We don't, because:

- `@ai-sdk/openai-compatible` works for both, plus vLLM, LM Studio, NVIDIA NIM, DeepInfra, Together, Groq's OpenAI-compatible endpoint, and any user-supplied custom base URL.
- One package. One bundle entry. One Settings UI surface ("Custom OpenAI-compatible: base URL + key").
- Verified in ai-sdk official docs: "Any endpoint that conforms to the OpenAI API shape ... should work by pointing `baseURL` at it." Examples in docs include OpenRouter and Ollama directly.
- `jcollingj/caret`'s production code uses `createOpenAICompatible` for the user's "custom" provider slot — exactly our use case.

If a future user reports OpenRouter-specific feature drift (e.g. routing preferences, OpenRouter headers like `HTTP-Referer`, `X-Title`), pass them via the `headers` option on `createOpenAICompatible` — no new package needed.

### 5. Why `@ai-sdk/amazon-bedrock` instead of `@aws-sdk/client-bedrock-runtime`

| Concern | `@ai-sdk/amazon-bedrock` | `@aws-sdk/client-bedrock-runtime` |
|---------|--------------------------|-----------------------------------|
| Bundle size | ~25 KB | ~150 KB minified (multi-package SDK) |
| API consistency | Same `streamText({ model: bedrock(...) })` as other providers | Bespoke `BedrockRuntimeClient` + `InvokeModelCommand` |
| Custom fetch | YES | Different surface (custom `requestHandler`) |
| SigV4 | Built-in | Built-in (via `@aws-sdk/signature-v4`) |
| Streaming | YES (`ConverseStream`) | YES |

ai-sdk's Bedrock provider wraps the same SigV4 logic but exposes it through the unified `streamText` API. No reason to ship the full AWS SDK in a 270 KB plugin.

### 6. Why NOT a state-machine library for the contest timer

xstate v5.31.1 (2026-05-10) is excellent for stateful UI but is overkill for the contest FSM. The contest has 4 states (idle, running, paused, ended) and ~6 transitions (start, pause, resume, tick, finish, abort). A discriminated union of 30 lines plus `setInterval` is simpler, smaller (saves ~60 KB), and more debuggable than an actor model. **Persistence is the real problem, not state modeling.** What survives plugin reload is `data.json` — so persist `{ contestSlug, startedAt: ms, durationSec, pausedSec, lastTickAt }` and recompute remaining time on re-init. `Plugin.registerInterval()` (already used for v1.0 submission polling) auto-cleans on unload.

### 7. Why native `[[wikilinks]]` for look-ahead edges

The user's question is "any Obsidian pattern for wikilinks to notes that don't exist yet?" — Obsidian's answer is **the default behavior**. Writing `[[Two Sum II]]` into a hub note's `## Related (Look-ahead)` section produces an unresolved link that:
- Renders dimly in reading mode (visual hint that target doesn't exist).
- Appears as a "ghost" node in the graph view.
- Auto-resolves the moment the target note is created.
- Is queryable via `app.metadataCache.unresolvedLinks` (verified type in `obsidian.d.ts`).
- Surfaces in the file's "Linked mentions" pane after creation.

No plugin needed. The AI knowledge-graph maintenance feature just emits the wikilink; Obsidian handles the rest. If desired, on-create stub generation (creating an empty placeholder note with frontmatter `lc-status: not-yet-attempted`) is a 20-line vault-write — but the v1.0 convention is `app.fileManager.processFrontMatter` for structured writes, not creating empty stubs. **Recommendation: ship dangling links first, evaluate stub-creation in a later phase based on dogfood feedback.**

### 8. Provider-specific wire format constraints

| Provider | Endpoint shape | Streaming format | OpenAI-compatible? |
|----------|---------------|------------------|---------------------|
| OpenAI | `/v1/chat/completions` | SSE `data: {...}` | Native |
| Anthropic | `/v1/messages` with `anthropic-version` header | SSE with named events (`message_start`, `content_block_delta`, ...) | NO |
| OpenRouter | OpenAI-compatible | SSE | Yes |
| Ollama (`/v1/`) | OpenAI-compatible | SSE | Yes |
| Ollama (native `/api/chat`) | NDJSON | NDJSON streaming | NO — but use the `/v1/` endpoint |
| AWS Bedrock | `/model/{id}/converse-stream` (SigV4) | AWS event stream | NO |

This is exactly the parsing complexity ai-sdk eliminates. The `streamText` call site stays identical across all 5 providers — the provider plugin handles wire-format decoding.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `ai` v6.37.0 | `langchain` v1.4.0 | Heavier, agent-oriented; we need single-shot completions and one streaming call; ai-sdk fits better |
| `ai` + per-provider packages | `openai` (official SDK) only | OpenAI-only; multi-provider requires hand-rolling Anthropic, Bedrock, Ollama wire formats |
| `@ai-sdk/openai-compatible` for OpenRouter/Ollama | `@openrouter/ai-sdk-provider` + `ollama-ai-provider` | Two extra packages for the same outcome; openai-compatible covers both via base URL |
| `@ai-sdk/amazon-bedrock` v4.0.105 | `@aws-sdk/client-bedrock-runtime` v3.1047.0 | 150 KB vs 25 KB; different API surface from other providers |
| `electron.net.fetch` for streaming | `eventsource-parser` + manual `requestUrl` polling | requestUrl returns full body once — there's nothing to parse incrementally; `eventsource-parser` cannot rescue a buffered transport |
| `electron.net.fetch` for streaming | Hidden `<webview>` proxy | Adds DOM complexity, IPC, lifecycle management; net.fetch is cleaner |
| `setInterval` + `data.json` persistence | `xstate` v5.31.1 | 60 KB+ for a 4-state FSM; persistence is what matters and xstate doesn't solve that |
| Native `[[wikilinks]]` + `unresolvedLinks` | `obsidian-graph-analysis` (third-party) | graph-analysis is for graph metrics, not edge creation; native API covers the use case |
| Native `MarkdownRenderer.render()` + `ItemView` | Custom DOM rendering with `createEl` | MarkdownRenderer already handles wikilinks, embeds, math, code blocks consistently with the rest of Obsidian; reinventing the renderer is anti-pattern |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `fetch()` global override (shimming `globalThis.fetch`) | Breaks Obsidian core / other plugins that legitimately use the platform `fetch`; surfaces as random unrelated bugs | Pass `fetch` explicitly to each provider via the `fetch` option |
| `requestUrl` for AI Debug streaming | Returns fully-buffered response — `streamText` will emit all tokens at once; UX hangs then dumps text | `electron.net.fetch` for AI Debug; `requestUrl` only for non-streaming AI calls |
| `openai` (official npm package) as the multi-provider client | OpenAI-only; previously had Electron-renderer bundling friction (Node-specific transports); forces hand-rolling other providers | `ai` + `@ai-sdk/openai` |
| `@aws-sdk/client-bedrock-runtime` directly | 6× the bundle size of `@ai-sdk/amazon-bedrock` for equivalent functionality; different API surface from other providers | `@ai-sdk/amazon-bedrock` |
| `langchain` for AI Debug | Heavier than needed; agent/chain abstractions are wrong tool for "send code + problem + error → stream suggestions" | `ai-sdk` `streamText` directly |
| `xstate` for the contest timer | 60 KB+ runtime for a 4-state FSM; doesn't solve the actual hard problem (reload-survival) | Discriminated-union FSM + `data.json` persisted timestamps |
| `ollama` (npm package, last published 2025-11) | Stale by 6 months; not idiomatic for ai-sdk pattern | `@ai-sdk/openai-compatible` pointed at Ollama's `/v1/` endpoint |
| `eventsource-parser` v3.0.8 | Useless without an actual streaming transport; with `electron.net.fetch` you already get a `ReadableStream` and ai-sdk handles SSE parsing internally | Not needed |
| New esbuild externals for `electron` | `electron` is ALREADY in the externals list (v1.0 esbuild config line 19); bundling it would shadow the runtime-provided module and break `net.fetch` resolution | Keep externals list as-is |
| Stub-note creation for every look-ahead wikilink | Premature; pollutes vault with empty notes; user might never solve some look-ahead targets | Emit dangling `[[wikilink]]`; let `unresolvedLinks` do the work; revisit stubs after dogfood |
| Telemetry or proxying AI calls through any third-party endpoint | Plugin-store rejection guaranteed (no telemetry; disclose all network endpoints in README) | BYO key + direct provider call only; document this in README |
| Storing API keys in plain `data.json` without redaction in error logs | Credential leak risk in error-reporting paths | Re-use the v1.0 pattern: store in `data.json` (no other option in Obsidian); redact key in any console.log / Notice / error path |

---

## Stack Patterns by Variant

**For AI Debug (streaming):**
- `electron.net.fetch` if available, fall back to `requestUrl` (non-streaming).
- `streamText({ model: provider(modelId), messages, abortSignal })` — pipe `result.textStream` (`AsyncIterable<string>`) into the inline UI, appending tokens to a `<div>` as they arrive.
- Wire an `AbortController` to a "Cancel" button so the user can stop generation.
- On non-streaming fallback, use `generateText` and render the full response when it arrives, with a "Generating..." Notice while waiting.

**For AI ACed-solution review (non-streaming):**
- `requestUrl` is fine; no streaming UX.
- `generateObject({ model, schema, messages })` with a zod schema for `{ approach, efficiency, codeStyle }` — guarantees structured output for the 3-dimensions render, no parser brittleness.

**For AI knowledge-graph maintenance (non-streaming, batched):**
- `requestUrl` is fine.
- `generateObject` with a zod schema for `{ clusterName, members[], difficultyEdges[], lookAheadEdges[] }`.
- Write the resulting wikilinks via `app.fileManager.processFrontMatter` (for tags/cluster name in frontmatter) and `app.vault.process(...)` (for the `## Pattern Cluster` / `## Related Variants` / `## Related (Look-ahead)` body sections — preserves the Phase 05.5 section-lock convention).

**For Preview tab (read-mode):**
- `ItemView` subclass `LeetCodePreviewView` registered via `this.registerView(LC_PREVIEW_VIEW_TYPE, leaf => new LeetCodePreviewView(leaf))`.
- In `onOpen()`: fetch problem detail (cached if available), call `MarkdownRenderer.render(this.app, markdown, this.contentEl, '', this)`.
- Add "Start Problem" button via `this.addAction('plus', 'Start problem', () => this.createNote())`.
- `setViewState({ type: LC_PREVIEW_VIEW_TYPE, state: { titleSlug } })` opens it in a tab.

**For Virtual Contest (FSM + persistence):**
- Discriminated-union state: `type ContestState = { kind: 'idle' } | { kind: 'running'; contestSlug; startedAt; durationSec } | { kind: 'paused'; ...; pausedAt } | { kind: 'ended'; ...; endedAt }`.
- Persist on every transition to `data.json`.
- `Plugin.registerInterval()` for the 1-second tick that updates the toolbar timer widget.
- On plugin load, hydrate from `data.json`; if `kind === 'running'` and `Date.now() > startedAt + durationSec * 1000`, transition to `ended` immediately.

**For Settings UI (multi-provider):**
- `PluginSettingTab` (already in v1.0) — add new section "AI Provider".
- `Setting` with `addDropdown` for provider (openai/anthropic/openai-compatible/bedrock).
- Conditional `Setting` rows: base URL (compat only), AWS region (bedrock only), API key (all), model ID (all, with sensible defaults per provider).
- API key field: `Setting.addText().inputEl.type = 'password'` to mask. Same convention as v1.0's session cookie field.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ai@6.37.0` | `@ai-sdk/provider@3.0.10`, `@ai-sdk/provider-utils@4.0.27`, `@ai-sdk/gateway@3.0.114` (transitive); `zod ^3.25.76 \|\| ^4.1.8` (peer) | Transitive deps pinned within the ai package; no manual install needed |
| `@ai-sdk/openai@3.0.77` | `ai@6.37.0`, `@ai-sdk/provider@3.0.10`, `zod ^3.25.76 \|\| ^4.1.8` | Match major version with `ai` |
| `@ai-sdk/anthropic@3.0.63` | Same as @ai-sdk/openai | — |
| `@ai-sdk/openai-compatible@2.0.47` | `ai@6.37.0`, `@ai-sdk/provider@3.0.10`, `zod ^3.25.76 \|\| ^4.1.8` | Major v2 is current; bumped from v1 in early 2026 |
| `@ai-sdk/amazon-bedrock@4.0.105` | `ai@6.37.0`, `@ai-sdk/provider@3.0.10`, `zod ^3.25.76 \|\| ^4.1.8` | Major v4 is current |
| `zod@4.4.3` | `ai@6.37.0` peer (`^3.25.76 \|\| ^4.1.8`) | v4 satisfies; can downgrade to `zod@3.25.76+` if any Obsidian-side code conflicts arise |
| `electron.net.fetch` | Obsidian Electron host (any modern build) | Available in Electron 21+ as `net.fetch`; older builds use `remote.net.fetch`; both paths handled by the resolver |
| `@leetnotion/leetcode-api@3.0.0` | Already-installed; provides `getPastContests`, `getContestQuestions`, `user_contest_info`, `recent_user_submissions` for v1.1 contest features | No upgrade needed for v1.1 |

---

## Sources

- `node_modules/obsidian/obsidian.d.ts` — verified `RequestUrlResponse` shape (no streaming body), `MarkdownRenderer.render`, `ItemView`, `unresolvedLinks` (HIGH confidence — local file)
- `node_modules/@leetnotion/leetcode-api/lib/index.d.ts` — verified `getPastContests`, `getContestQuestions`, `user_contest_info`, `recent_user_submissions` exist in installed v3.0.0 (HIGH confidence — local file)
- `codewithsathya/leetcode-api` (the upstream of `@leetnotion/leetcode-api` — confirmed via `npm view repository.url`) — verified contest GraphQL files: `src/graphql/contest.graphql` (`userContestRanking + userContestRankingHistory`), `src/graphql/past-contests.graphql` (`contestV2HistoryContests`); `contestQuestionList` corroborated in `NikkyAmresh/lcex/src/modules/LeetCode.ts` and `noogler-eng/ContestTracker/backend/src/controllers/contests.ts` (HIGH confidence)
- `your-papa/obsidian-Smart2Brain/src/lib/aiTransport.ts` — verified `electron.net.fetch` resolution pattern with fallback to `electron.remote.net.fetch` and `requestUrl` (HIGH confidence — production Obsidian plugin)
- `jcollingj/caret/llm_calls.ts` — verified `streamText` + `createOpenAICompatible` + `createOpenAI/Anthropic/Groq` Obsidian plugin pattern (HIGH confidence — production code; ai-sdk in real Obsidian use)
- `0xIntuition/intuition-obsidian-plugin/src/utils/obsidian-fetch.ts` — verified canonical `obsidianFetch` adapter pattern with explicit "No streaming support (Obsidian buffers entire response)" comment (HIGH confidence — production code)
- `AlexW00/anker/src/services/AiService.ts`, `gnuhpc/obsidian-llmsider/src/providers/openai-provider.ts`, `ckt1031/obsidian-wordwise-plugin/src/provider/openai.ts`, `testy-cool/obsidian-ai-canvas/src/utils/ai.ts` — corroborating Obsidian + ai-sdk + requestUrl pattern across multiple production plugins (HIGH confidence)
- ai-sdk official docs `https://ai-sdk.dev/providers/ai-sdk-providers/openai-compatible` — verified `createOpenAICompatible({ baseURL, apiKey, fetch })` API surface, Ollama / OpenRouter / vLLM examples (HIGH confidence — official source)
- ai-sdk official docs `https://ai-sdk.dev/providers/ai-sdk-providers/openai` — verified `createOpenAI` `fetch` option (HIGH confidence — official source)
- ai-sdk official docs `https://ai-sdk.dev/docs/ai-sdk-core/generating-text` — verified `streamText` returns `result.textStream` as `ReadableStream + AsyncIterable` (HIGH confidence — official source)
- npm registry — verified package versions and last-published timestamps as of 2026-05-14 for `ai@6.37.0` (2026-05-12), `@ai-sdk/openai@3.0.77` (2026-05-13), `@ai-sdk/anthropic@3.0.63` (2026-05-13), `@ai-sdk/openai-compatible@2.0.47` (2026-05-13), `@ai-sdk/amazon-bedrock@4.0.105` (2026-05-13), `zod@4.4.3` (2026-05-04), `langchain@1.4.0` (2026-05-05), `openai@6.37.0` (2026-05-12), `@anthropic-ai/sdk@0.96.0` (2026-05-13), `@aws-sdk/client-bedrock-runtime@3.1047.0` (2026-05-14), `xstate@5.31.1` (2026-05-10), `ollama@0.6.3` (2025-11-19 — STALE) (HIGH confidence — registry source-of-truth)
- `skygragon/leetcode-cli/lib/config.js` — verified LC REST endpoints (`interpret_solution`, `submit`, `submissions/detail/{id}/check`) — note this CLI does NOT cover contest endpoints, so contest API came from `codewithsathya/leetcode-api` and `@leetnotion/leetcode-api` directly (MEDIUM confidence on contest endpoint stability — verified by multiple recent third-party clients)

---

*Stack research for: Obsidian community plugin — LeetCode integration — v1.1 milestone (Contest, AI Coach, Preview)*
*Researched: 2026-05-14*
