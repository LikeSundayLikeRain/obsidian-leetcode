# Phase 07: AI Provider Foundation — Research

**Researched:** 2026-05-15
**Domain:** Vercel AI SDK provider integration in an Obsidian plugin (Electron renderer)
**Confidence:** HIGH

---

## Summary

Phase 07 builds the AI provider seam every later v1.1 AI feature plugs into. The
domain is well-trodden: Vercel AI SDK's `@ai-sdk/anthropic`, `@ai-sdk/openai`, and
`@ai-sdk/openai-compatible` packages all expose the **same** `fetch` injection
hook (`(input: RequestInfo, init?: RequestInit) => Promise<Response>`), and
Electron's `net.fetch` returns a standard `GlobalResponse` whose body is a
`ReadableStream` — the two ends snap together cleanly through a single
`obsidianFetch(mode)` adapter. The non-streaming path is a thin `requestUrl`
bridge identical in shape to v1.0's `src/api/requestUrlFetcher.ts`, which is the
load-bearing precedent.

The bundle delta is the only first-order risk: combined static imports of the
three `@ai-sdk/*` packages plus their shared `@ai-sdk/provider` and
`@ai-sdk/provider-utils` runtime deps land at roughly **300–360 KB
post-tree-shake / post-minify** added to the current ~163 KB baseline. That
keeps us under the **500 KB CI gate** with ~30–40 KB headroom. **Recommended:
ship static imports (no dynamic-import gymnastics) and rely on esbuild
tree-shaking.** Add the dynamic-import escape hatch to the deferred backlog
only if the actual measured bundle exceeds 450 KB on the Plan 07.02 build.

The other locked decisions (model-list-GET probe matrix, once-per-provider
disclosure, scaffold-only cost ledger, single shared disclosure copy module)
are confirmed against current vendor docs — every default model id, default
base URL, and probe endpoint matches what the live SDK and live vendor
endpoints expect today.

**Primary recommendation:** mirror `src/api/LeetCodeClient.ts` +
`src/api/requestUrlFetcher.ts` verbatim into `src/ai/AIClient.ts` +
`src/ai/obsidianFetch.ts`. Pin `@ai-sdk/anthropic@3.0.78`,
`@ai-sdk/openai@3.0.64`, `@ai-sdk/openai-compatible@2.0.47`, and `zod@^4.1.8`
(SDK peer dep — required). Default models per provider: `claude-haiku-4-5`,
`gpt-5-mini`, `anthropic/claude-haiku-4.5`, `llama3.2`, custom-empty. Ship
`src/ai/pricing.ts` with the four hardcoded rate tuples documented below;
README documents that defaults rot. Disclosure copy lives in a single
exported constant in `src/ai/disclosure.ts`. Test connection is debounced
in-flight (1 outstanding probe per provider).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AI HTTP transport (streaming) | Electron main-process (`net.fetch` via renderer-exposed binding) | Renderer (Promise plumbing) | Streaming requires a Fetch-API `ReadableStream`; `requestUrl` returns a buffered `RequestUrlResponse`, no streaming. `net.fetch` is the only Obsidian-shipped streaming-capable HTTP primitive. |
| AI HTTP transport (non-streaming) | Renderer → `requestUrl` (Obsidian built-in → main-process net stack) | — | `requestUrl` already bypasses Electron CORS and is the v1.0 LC convention; reusing it for non-streaming AI keeps one HTTP primitive for both modes. |
| LeetCode HTTP (preserved) | Renderer → `requestUrl` | — | **MUST never change.** v1.0 convention is absolute. AI calls do NOT go via `obsidianFetch`; only AI calls do. |
| Provider adapters (Anthropic, OpenAI, OpenRouter, Ollama, Custom) | Renderer (plugin runtime) | — | Vercel AI SDK packages are pure ESM/CJS modules with no main-process needs; bundled into `main.js`. |
| Settings UI (AI section) | Renderer (Obsidian PluginSettingTab) | — | Standard Obsidian Setting API; sits between Preview and Knowledge graph in the existing `LeetCodeSettingTab`. |
| Persistence (PluginData / data.json) | Plugin core (`SettingsStore.load/saveData`) | — | Shape-guards on every new field. AI keys plain-text in `data.json` per AIPROV-02; redacted in logs per AUTH-06. |
| Disclosure modal | Renderer (Obsidian Modal) | Plugin core (PluginData persistence) | One-shot per-provider gate via `ProviderConfig.disclosureAcknowledged`. |
| Cost ledger (scaffold only) | Plugin core (`AIClient.addCost` + `SettingsStore`) | — | Day-rollover math is pure; no UI, no enforcement in Phase 07. |
| Test-connection probe | Plugin core (`AIClient.probe(provider)` ↔ provider adapter) | Renderer (Notice for result) | Each provider gets a tailored probe; results surface as Notice strings. |

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Provider SDK approach — Vercel AI SDK family.** Pin `@ai-sdk/anthropic`
(Anthropic), `@ai-sdk/openai` (OpenAI), `@ai-sdk/openai-compatible` (OpenRouter,
Ollama, Custom-URL). Hand-rolled REST is rejected; "hybrid" with hand-rolled
Anthropic is rejected; Ollama-as-OpenAI-compatible (default base
`http://localhost:11434/v1`, placeholder API key) is the chosen shape.
Bundle-size guard: planner adds dynamic-import plan IF combined `@ai-sdk/*`
exceeds ~250 KB. Otherwise static imports.

**B. AIClient module shape — facade + per-provider adapter files.** Layout:

```
src/ai/
├── AIClient.ts              # facade — owns active-provider lookup + dispatches to adapter
├── obsidianFetch.ts         # the fetch adapter: electron.net.fetch (stream) | requestUrl (request)
├── providers/
│   ├── anthropic.ts         # wraps @ai-sdk/anthropic
│   ├── openai.ts            # wraps @ai-sdk/openai
│   ├── openaiCompatible.ts  # wraps @ai-sdk/openai-compatible (covers OpenRouter, Custom URL)
│   └── ollama.ts            # also @ai-sdk/openai-compatible but with Ollama default base + key handling
├── types.ts                 # AIProvider, ProviderConfig, AIRequest, AIResponse
└── disclosure.ts            # the once-per-provider-switch disclosure modal
```

**C. Settings UI shape — single 'AI' section** in existing `LeetCodeSettingTab`,
between Preview and Knowledge graph. Active-provider dropdown swaps visible
form fields. PluginData stores `activeAIProvider` plus
`Record<provider, ProviderConfig>` map so switching providers preserves prior
keys. `ProviderConfig = { apiKey: string; baseUrl: string; model: string;
disclosureAcknowledged: boolean }`. API key field is `<input type="password">`.
Default model strings shipped per provider; defaults may rot — README
documents this; we do NOT auto-rotate on 404.

**D. Disclosure modal — once per provider switch.** `ProviderConfig.disclosureAcknowledged`
per-provider in PluginData. Default `false`. Modal lists active provider name +
base URL + exact data-flow text + "what plugin never sends" list. Two actions:
**Cancel** (blocks call, "AI call cancelled" Notice) + **I understand —
continue** (sets `disclosureAcknowledged = true`, persists, allows call).
Reset path: palette command `Reset AI provider disclosures` clears all flags.

**E. Test-connection probe — per-provider tailored matrix.**
- OpenAI: `GET /v1/models` (Bearer auth)
- OpenRouter: `GET /api/v1/models`
- Custom (OpenAI-compatible): try `GET {baseUrl}/models`; on 404/405/501 fall back to 1-token chat
- Ollama: `GET {baseUrl}/api/tags` (no auth)
- Anthropic: 1-token chat completion via SDK with `max_tokens: 1`, prompt `"ping"`
Result UX: success Notice with model count (Anthropic omits count); failure
Notice with provider error verbatim, truncated at ~200 chars.

**F. Cost-cap counter scaffolding — foundation now.** `aiCostLedger: { date, usdToday }`
in PluginData. `AIClient.addCost(usd)` with day-rollover-on-read. **No cap
enforcement, no UI, no Notice in Phase 07.** Phase 09 wires `aiDailyCapUsd` +
UI + pre-flight check.

**G. Out of scope for Phase 07 (locked):** streaming UI active use (Phase 08);
Debug button (Phase 08); `## AI Review` write path (Phase 09); pattern-cluster
classification (Phase 11); per-feature daily cost cap UI (Phase 09);
apply-patch (v1.2); native Bedrock SigV4 (v1.2); per-feature provider routing
(v1.2); OS keychain key storage (rejected as theatre); plugin-hosted AI proxy
(rejected — telemetry surface).

### Claude's Discretion

The following items in CONTEXT.md `<open_questions_for_planning>` are explicitly
flagged as researcher/planner judgement calls (not user-locked):

1. Exact `@ai-sdk/*` versions to pin and combined bundle delta against the
   500 KB CI gate.
2. Whether AI SDK's `fetch` option fully supports streaming through
   `electron.net.fetch`.
3. Whether `electron.net.fetch` is reliably available across `minAppVersion`
   (currently 1.10.0 in `manifest.json`).
4. Default model strings per provider — confirm current cheap/fast tier names.
5. Default base URL canonical strings (esp. OpenRouter, Ollama).
6. Whether `addCost()` token→USD math ships a per-provider pricing table in
   Phase 07 (recommended) or defers to Phase 09.
7. For Custom (OpenAI-compatible) provider, the fallback flow when
   `GET /models` returns 404 — confirm 1-token chat fallback shape is
   universally acceptable.
8. Disclosure modal copy — single shared constant in `src/ai/disclosure.ts`
   (recommended) vs hardcoded per-feature.
9. Test connection rate-limit / debouncing — recommend 1 in-flight at a time
   per provider.
10. Whether tree-shaking AI SDK packages requires esbuild config tweaks.

This research answers each of these in `## Open Questions` below.

### Deferred Ideas (OUT OF SCOPE)

- Lazy / dynamic provider import to keep bundle small — only if researcher
  confirms static-import bundle delta exceeds comfortable headroom.
- Per-provider rate-limit awareness (mirrors `src/api/throttle.ts` for LC).
- Bedrock SigV4 (AIPROV-FUT-01).
- Apply-patch suggestion path (AIPROV-FUT-03).
- Per-feature provider routing (AIPROV-FUT-02).
- Cost-cap UI + enforcement (Phase 09 / AIREV-06).
- Token estimation before call (Phase 09 polish).
- Auto-rotate default model strings on 404 (explicitly rejected — README
  documents rot).
- Test connection cost-budget guard (overengineering).

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIPROV-01 | User can configure an active AI provider (Anthropic, OpenAI, OpenRouter, Ollama, Custom OpenAI-compatible). | `## Standard Stack` (provider packages); `## Code Examples` (createOpenAICompatible covers OpenRouter/Ollama/Custom); CONTEXT decision A. |
| AIPROV-02 | User pastes their own API key per provider; keys stored in `data.json`, masked field, README discloses plain-text local-only. | `## Architecture Patterns` Pattern 3 (masked input precedent: SettingsTab uses `inputEl.type = 'password'`); `## Common Pitfalls` Pitfall 5 (data.json plain-text discipline mirrors v1.0 cookie posture). |
| AIPROV-03 | User can run "Test connection" — tiny round-trip, success or error message. | CONTEXT decision E (probe matrix verified against current vendor docs); see `## Code Examples` provider probe shapes. |
| AIPROV-04 | One-time disclosure modal — active provider, base URL, exact data the plugin will send — must be acknowledged before first AI call. | `## Architecture Patterns` Pattern 4 (per-provider disclosure gate); CONTEXT decision D. |
| AIPROV-05 | AI calls go through `obsidianFetch(mode)` — `electron.net.fetch` for stream when available, otherwise `requestUrl`; non-streaming AI always `requestUrl`; **all leetcode.com calls remain on `requestUrl`**. | `## Architecture Patterns` Pattern 1 + Pattern 2; `## Don't Hand-Roll` (use existing `requestUrl` precedent). |
| AIPROV-06 | "Clear AI key" palette command wipes the active provider's key from `data.json`. | `## Architecture Patterns` Pattern 5 (palette command discipline + clean ID); CONTEXT decision G + plan_hints Plan 07.06. |
| AIPROV-07 | README's "Network use" section enumerates every endpoint the plugin can contact (leetcode.com plus each AI provider base URL). | `## Architecture Patterns` Pattern 6 (network-use audit table — values verified against Stack section base URLs). |

</phase_requirements>

---

## Standard Stack

### Core (new runtime deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/anthropic` | `3.0.78` (published 2026-05-15, ~3 hours before research) | Anthropic Messages API adapter | [VERIFIED: npm view @ai-sdk/anthropic@latest — 2026-05-15] Official Vercel-maintained provider, exposes `fetch` option for adapter injection, `apiKey` + `baseURL` config. Apache-2.0. |
| `@ai-sdk/openai` | `3.0.64` (published 2026-05-15) | OpenAI Chat Completions adapter | [VERIFIED: npm view @ai-sdk/openai@latest — 2026-05-15] Same shape as anthropic. Apache-2.0. |
| `@ai-sdk/openai-compatible` | `2.0.47` (published 2026-05-15) | Generic OpenAI-compatible adapter (OpenRouter, Ollama, Custom URL, LM Studio, vLLM, LiteLLM) | [VERIFIED: npm view @ai-sdk/openai-compatible@latest — 2026-05-15] Single shared `createOpenAICompatible({ name, apiKey, baseURL, fetch, headers })` — covers all three remaining providers. Apache-2.0. |
| `ai` (peer/runtime — see Note) | `6.0.183` (published 2026-05-15) | `streamText`, `generateText`, `LanguageModel` interface | [VERIFIED: npm view ai@latest — 2026-05-15] **Runtime dep required if using `streamText`/`generateText`**, but Phase 07 only uses provider models for the test-connection 1-token probe (Anthropic) — `provider('model-id').doGenerate(...)` is exposed via the model interface. **Recommendation: include `ai` as a runtime dep now** so Phase 08's `streamText` does not require a Phase 08 dep churn. |
| `zod` (peer of all `@ai-sdk/*` packages) | `^4.1.8` (current latest is `4.4.3`) | Schema validation peer required by AI SDK packages | [VERIFIED: `npm view @ai-sdk/anthropic peerDependencies` returns `{ zod: '^3.25.76 \|\| ^4.1.8' }`] **MUST install zod** — without it the `@ai-sdk/*` packages will throw at module load. We're not using zod ourselves in Phase 07, but it must be present. Use `zod@^4.1.8` to match the SDK's preferred range. |

**Bundle weight (verified via `npm view dist.unpackedSize`, all 2026-05-15):**

| Package | Unpacked Size | Notes |
|---------|---------------|-------|
| `@ai-sdk/anthropic@3.0.78` | 3.16 MB | Includes both ESM + CJS + types + sourcemaps. Real bundled cost is far smaller post-tree-shake (estimated 30–50 KB minified). |
| `@ai-sdk/openai@3.0.64` | 3.65 MB | Same caveat. |
| `@ai-sdk/openai-compatible@2.0.47` | 0.60 MB | Smallest of the three (mostly just fetch + JSON wrapper logic). Estimated 20–30 KB minified. |
| `@ai-sdk/provider@3.0.10` | 0.51 MB | Shared by all three provider packages — bundled once. Pure interfaces / types. ~10 KB minified. |
| `@ai-sdk/provider-utils@4.0.27` | 0.87 MB | Shared by all three. SSE parsing, request building. ~30–50 KB minified. |
| `@ai-sdk/gateway@3.0.115` (only if using `ai` core) | 0.63 MB | Only loaded if `ai` package is used. ~20 KB minified. |
| `eventsource-parser@^3.0.8` (transitive via provider-utils) | 0.11 MB | ~10 KB minified. |
| `zod@^4.1.8` | (peer dep) | **Already a real dep**: ~50–100 KB minified. Required for SDK module load. |

**Estimated total bundle delta against the 500 KB CI gate (current ~163 KB baseline):** **~300–360 KB added**, **landing at ~460–520 KB total**. [ASSUMED — must validate on actual Plan 07.02 build.] **This is close to the 500 KB CI ceiling.** [VERIFIED: README §"Bundle size" — Phase 06 FOUND-02 set the gate at 500 KB hard / 400 KB soft warn.]

**Bundle-delta decision:** Static imports first; if the Plan 07.02 production bundle exceeds 450 KB (90% of ceiling), the planner adds the dynamic-import escape hatch in CONTEXT decision A. The escape hatch should `await import(`./providers/${activeProvider}`)` lazily so only the active provider's adapter is in the hot path. Test-connection runs all five probes synchronously — but tests are user-initiated, not startup-time, so a 50–80 ms first-test-of-each-provider lazy-load is acceptable.

**Installation:**

```bash
npm install @ai-sdk/anthropic@3.0.78 \
            @ai-sdk/openai@3.0.64 \
            @ai-sdk/openai-compatible@2.0.47 \
            ai@6.0.183 \
            zod@^4.1.8
```

### Supporting (no new deps)

| Library | Already pinned | Purpose | When to Use |
|---------|----------------|---------|-------------|
| `obsidian` (built-in `requestUrl`) | latest (1.12.3 types) | Non-streaming HTTP for AI calls + all probes | Mirrors the v1.0 LC pattern; bypasses Electron CORS. |
| `electron` (Obsidian-host-provided, esbuild external) | external | `net.fetch` for streaming AI | `require('electron').net.fetch(...)` returns a `Response` with a `ReadableStream` body; AI SDK's `fetch` option accepts it directly (signatures match). |
| `obsidian.Modal` | built-in | Disclosure modal | Standard Obsidian modal class; `app.modal.open(modal)` pattern. |
| `obsidian.Setting` | built-in | AI settings section | Same `setName().setHeading()` pattern as existing `Preview` + `Knowledge graph` sections. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AI SDK provider packages | Hand-rolled REST + SSE parsers | Adds ~200 lines per provider × 4 providers = ~800 lines of fragile parsing code; no upstream model-list maintenance; provider-error mapping by hand. **Rejected per CONTEXT decision A.** |
| AI SDK provider packages | Single `@ai-sdk/openai-compatible` for ALL providers (incl. Anthropic via Anthropic's OpenAI-compatible endpoint) | Anthropic's OpenAI-compat endpoint exists but is `beta` — different field semantics, not officially supported. **Rejected** for stability. |
| `ai` core package | Use only `provider.languageModel('id').doGenerate(...)` directly | Skips ~20 KB but gives up `streamText`/`generateText` ergonomics that Phase 08 wants. **Including `ai` core now** is cheaper than adding it in Phase 08 and re-doing wiring. |
| `zod@^4.1.8` | `zod@^3.25.76` (also satisfies SDK peer range) | Both work. zod 4 is the modern default; sticking with 4.x avoids future migration. |

---

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────── PHASE 07 SCOPE ─────────────────────────┐
                │                                                                   │
User activates  │  ┌─────────────────────────────────────────────┐                 │
provider in     │  │             SETTINGS UI (renderer)            │                 │
SettingsTab     ├─►│  AI section (between Preview & Knowledge)    │                 │
                │  │  • Active-provider dropdown (5 options)      │                 │
                │  │  • Per-provider form (key + baseURL + model) │                 │
                │  │  • Test connection button                    │                 │
                │  │  • Click → AIClient.probe(provider)          │                 │
                │  └────────────────┬─────────────────────────────┘                 │
                │                    │                                              │
                │                    ▼                                              │
                │  ┌─────────────────────────────────────────────┐                 │
                │  │         DISCLOSURE GATE (Phase 07)            │                 │
                │  │  AIClient.invoke() / probe() entry checks    │                 │
                │  │  ProviderConfig.disclosureAcknowledged.      │                 │
                │  │  If false → openDisclosureModal(provider)    │                 │
                │  │   • Cancel → "AI call cancelled" Notice      │                 │
                │  │   • Continue → set ack = true, proceed       │                 │
                │  └────────────────┬─────────────────────────────┘                 │
                │                    │                                              │
                │                    ▼                                              │
                │  ┌─────────────────────────────────────────────┐                 │
                │  │          AIClient (facade)                    │                 │
                │  │  • activeProvider lookup from settings       │                 │
                │  │  • dispatches to provider adapter            │                 │
                │  │  • addCost(usd) + day-rollover-on-read       │                 │
                │  │  • probe(provider) — per-provider probe      │                 │
                │  └────────────────┬─────────────────────────────┘                 │
                │                    │                                              │
                │     ┌──────────────┼──────────────┬──────────────┬──────────┐    │
                │     ▼              ▼              ▼              ▼          ▼    │
                │  anthropic.ts  openai.ts   openaiCompatible  ollama.ts   custom  │
                │   (Anthropic)  (OpenAI)     (OpenRouter)    (localhost  (custom  │
                │                              + custom URL)   :11434/v1)  baseURL)│
                │     │              │              │              │          │    │
                │     └──────────────┴──────────────┼──────────────┴──────────┘    │
                │                                    │                              │
                │                                    ▼                              │
                │  ┌─────────────────────────────────────────────┐                 │
                │  │      obsidianFetch(mode)  ← THE SEAM         │                 │
                │  │  mode='stream' → electron.net.fetch (Phase 08)│                 │
                │  │  mode='request' → requestUrl bridge → Response│                 │
                │  └────────────────┬─────────────────────────────┘                 │
                └────────────────────│─────────────────────────────────────────────┘
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                   electron.net.fetch     Obsidian.requestUrl
                   (main-process net)     (main-process net,
                   ReadableStream         buffered)
                   response body
                          │                     │
                          ▼                     ▼
                ┌────────────────────┐ ┌────────────────────────┐
                │ Anthropic /        │ │ leetcode.com (NEVER    │
                │ OpenAI /           │ │ via obsidianFetch —    │
                │ OpenRouter /       │ │ ALWAYS via requestUrl  │
                │ Ollama / Custom    │ │ direct in src/api/*)   │
                └────────────────────┘ └────────────────────────┘
```

The arrows show **data flow direction**. The critical invariant is the **right-side
column**: leetcode.com requests skip `obsidianFetch` entirely. They go through the
existing `installRequestUrlFetcher()` shim + `throttledRequestUrl` path in
`src/api/requestUrlFetcher.ts`. Phase 07 introduces a **second, separate** HTTP
seam (`obsidianFetch`) that only AI calls travel through.

### Recommended Project Structure

Per CONTEXT decision B (locked):

```
src/ai/
├── AIClient.ts              # facade — public API: probe(), invoke(), addCost(), clearKey()
├── obsidianFetch.ts         # the fetch adapter: stream (net.fetch) | request (requestUrl)
├── pricing.ts               # token→USD pricing table (per default model)
├── disclosure.ts            # disclosure modal + shared "what gets sent" copy
├── providers/
│   ├── anthropic.ts         # createAnthropic({ apiKey, baseURL, fetch }) wrapper + probe()
│   ├── openai.ts            # createOpenAI({ apiKey, baseURL, fetch }) wrapper + probe()
│   ├── openaiCompatible.ts  # createOpenAICompatible(...) wrapper + probe() — OpenRouter + Custom
│   └── ollama.ts            # createOpenAICompatible(...) with Ollama defaults + probe()
└── types.ts                 # AIProvider enum, ProviderConfig, AIRequest, AIResponse, ProbeResult
```

### Pattern 1: Facade Client with Injected Adapter (mirrors v1.0 LC)

**What:** `AIClient` is the only public interface for AI operations. It internally
dispatches to per-provider adapters that all use `@ai-sdk/*` packages. The
`obsidianFetch(mode)` adapter is constructed **once at AIClient construction
time** (mirroring v1.0's `LeetCodeClient` constructor pattern at
`src/api/LeetCodeClient.ts:46-57`) and passed into every provider adapter via
the `fetch` option.

**When to use:** Always. This is the primary seam for Phase 08/09/11 to plug
into without each phase needing to know provider-specific details.

```typescript
// Source: mirrors src/api/LeetCodeClient.ts:42-57 (v1.0 precedent)
import type { SettingsStore } from '../settings/SettingsStore';
import { obsidianFetch } from './obsidianFetch';
import { resolveAdapter } from './providers';
import { addCostInLedger } from './costLedger';
import type { AIRequest, AIResponse, ProbeResult, AIProvider } from './types';

export class AIClient {
  constructor(private settings: SettingsStore) {}

  /** Test-connection probe — tailored per provider per CONTEXT decision E. */
  async probe(provider: AIProvider): Promise<ProbeResult> {
    const cfg = this.settings.getProviderConfig(provider);
    const adapter = resolveAdapter(provider, cfg, obsidianFetch('request'));
    return adapter.probe(); // returns { ok, modelCount?, errorMessage? }
  }

  /** Day-rollover-on-read + add. CONTEXT decision F. No cap enforcement here. */
  async addCost(usd: number): Promise<void> {
    await this.settings.addCostLedger(usd); // SettingsStore handles rollover
  }

  /** Invoke (Phase 08+ uses this). Phase 07 ships the entry but only probe
   *  exercises the provider adapter live. */
  async invoke(req: AIRequest): Promise<AIResponse> {
    const provider = this.settings.getActiveAIProvider();
    if (!provider) throw new Error('No AI provider configured');
    // Disclosure gate (Pattern 4) checked at the command-layer, not here.
    const cfg = this.settings.getProviderConfig(provider);
    const mode = req.stream ? 'stream' : 'request';
    const adapter = resolveAdapter(provider, cfg, obsidianFetch(mode));
    return adapter.invoke(req);
  }
}
```

### Pattern 2: `obsidianFetch(mode)` — the single HTTP seam

**What:** A factory that returns a Fetch-API-shaped function (`(input: RequestInfo,
init?: RequestInit) => Promise<Response>`). Two modes:

- `mode='request'`: bridges to `requestUrl` (mirrors `src/api/requestUrlFetcher.ts`
  shim shape). Buffered response. Used by all probes + non-streaming invoke.
- `mode='stream'`: calls `electron.net.fetch(input, init)` directly. Returns the
  raw `Response` whose `.body` is a `ReadableStream`. Phase 08 consumes this
  for streaming AI.

**Why factory over single function:** The mode is fixed at adapter construction
time (per call), so capturing it in a closure rather than passing on every fetch
keeps the AI SDK's `fetch` option shape clean (`fetch: typeof globalThis.fetch`).

**When to use:** Always for AI calls. **Never for leetcode.com** — those go
through the existing `requestUrlFetcher` + `throttledRequestUrl` path
verbatim.

```typescript
// Source: extends src/api/requestUrlFetcher.ts:50-93 with stream mode
import { requestUrl } from 'obsidian';

type FetchFn = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export function obsidianFetch(mode: 'stream' | 'request'): FetchFn {
  if (mode === 'stream') {
    // Phase 08 path — only loaded when streaming is requested.
    // electron.net.fetch returns a standard Response with ReadableStream body.
    // [VERIFIED: electron PR #36733 'feat: implement net.fetch' merged 2023-02-20,
    //  shipped Electron 25.0.0 (May 2023). Obsidian 1.10.0 (manifest minAppVersion)
    //  ships Electron 28+, so net.fetch is universally available.]
    const { net } = require('electron') as typeof import('electron');
    return async (input, init) => net.fetch(input as string | Request, init);
  }
  // 'request' mode — buffered requestUrl bridge. Mirrors v1.0 LC shim.
  return async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : (input as Request).url ?? (input as URL).toString();
    const res = await requestUrl({
      url,
      method: (init?.method as string) ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body as string | undefined,
      throw: false,
    });
    return new Response(res.text, { status: res.status, headers: res.headers as HeadersInit });
  };
}
```

### Pattern 3: Per-provider adapter — uniform shape over AI SDK packages

**What:** Each provider adapter file exports a single function
`createModel(config, fetcher)` plus a `probe(config, fetcher)` function. The
adapter wraps the `@ai-sdk/*` package's `createXxx` factory, wiring the
plugin's `fetch` adapter into the SDK's `fetch` option.

**When to use:** Adding a new provider in v1.2 = one new file, no facade change.

```typescript
// Source: ai-sdk.dev/providers/ai-sdk-providers/anthropic — verified 2026-05-15
// File: src/ai/providers/anthropic.ts
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ProviderConfig, ProbeResult } from '../types';

export function createAnthropicModel(cfg: ProviderConfig, fetcher: typeof fetch) {
  const provider = createAnthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl, // default 'https://api.anthropic.com/v1' per CONTEXT C
    fetch: fetcher,        // ← obsidianFetch('request' | 'stream')
  });
  return provider(cfg.model || 'claude-haiku-4-5'); // VERIFIED 2026-05-15
}

export async function probeAnthropic(cfg: ProviderConfig, fetcher: typeof fetch): Promise<ProbeResult> {
  // Anthropic has NO public models endpoint — 1-token chat is the only probe.
  try {
    const model = createAnthropicModel(cfg, fetcher);
    // Use the AI SDK's `generateText` with max_tokens: 1.
    const { generateText } = await import('ai');
    const res = await generateText({
      model,
      prompt: 'ping',
      maxOutputTokens: 1,
    });
    return { ok: true, modelCount: null /* no list */ };
  } catch (err) {
    return { ok: false, errorMessage: extractProviderError(err).slice(0, 200) };
  }
}
```

```typescript
// File: src/ai/providers/openai.ts
import { createOpenAI } from '@ai-sdk/openai';
// ... same shape as anthropic.ts. Probe = GET /v1/models with Bearer auth.

export async function probeOpenAI(cfg: ProviderConfig, fetcher: typeof fetch): Promise<ProbeResult> {
  // GET /v1/models — zero token cost; validates key + base URL.
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, errorMessage: extractFromJson(body).slice(0, 200) };
  }
  const json = await res.json() as { data?: unknown[] };
  return { ok: true, modelCount: Array.isArray(json.data) ? json.data.length : null };
}
```

```typescript
// File: src/ai/providers/openaiCompatible.ts (OpenRouter + Custom)
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export function createOpenAICompatibleModel(cfg: ProviderConfig, fetcher: typeof fetch, name = 'custom') {
  const provider = createOpenAICompatible({
    name,                  // e.g. 'openrouter', 'custom', 'ollama'
    apiKey: cfg.apiKey || 'placeholder', // Ollama works with empty/placeholder
    baseURL: cfg.baseUrl,  // 'https://openrouter.ai/api/v1' / 'http://localhost:11434/v1' / user-typed
    fetch: fetcher,
  });
  return provider(cfg.model);
}

// Probe for OpenRouter: GET /api/v1/models — verified 2026-05-15 returns JSON
// with .data[] of model entries. No auth required for the public list.
// Probe for Custom: try GET /models; on 404/405/501 fall back to 1-token chat.
// Probe for Ollama: GET {baseUrl-without-/v1}/api/tags — no auth.
```

### Pattern 4: Disclosure gate — once per provider switch

**What:** Before any AI call (including Test connection's 1-token chat fallback
for Anthropic), check `ProviderConfig.disclosureAcknowledged`. If false, open
`AIDisclosureModal(provider)` and block the call until the user clicks
"I understand — continue" or "Cancel".

**Why per-provider not per-feature:** Modal fatigue (CONTEXT decision D). A
user switching from Anthropic to a self-hosted Ollama at home re-sees the
modal because the network destination genuinely changed.

**Implementation note — Test connection IS gated.** The probe for Anthropic
sends a real 1-token chat completion. Per AIPROV-04 wording ("**before any AI
call** is issued"), the disclosure modal MUST fire before this probe. The
models-list-GET probes (OpenAI, OpenRouter, Ollama, Custom-success) ALSO go
to the provider's host — these are also gated. **The disclosure fires before
any HTTP request to the provider's domain.**

```typescript
// File: src/ai/disclosure.ts
import { App, Modal, Notice } from 'obsidian';
import type { AIProvider, ProviderConfig } from './types';

/** SHARED constant — Phase 08/09/11 each append their feature-specific
 *  data manifest. CONTEXT decision D + open question 8 recommended path. */
export const DISCLOSURE_BASE_COPY = {
  willSend: [
    'Future AI features will send: problem text, your `## Code` content, last verdict + failing test, optionally `## Notes`.',
  ],
  neverSends: [
    'Vault file paths outside the active note',
    'Frontmatter that does not begin with `lc-`',
    'Any other vault content',
    'Telemetry of any kind',
  ],
};

export class AIDisclosureModal extends Modal {
  constructor(
    app: App,
    private provider: AIProvider,
    private cfg: ProviderConfig,
    private onContinue: () => void,
    private onCancel: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(`Heads up: this will send data to ${prettyName(this.provider)}`);
    contentEl.createEl('p', { text: `Active provider: ${prettyName(this.provider)} — ${this.cfg.baseUrl}` });
    const willList = contentEl.createEl('ul');
    DISCLOSURE_BASE_COPY.willSend.forEach((line) => willList.createEl('li', { text: line }));
    contentEl.createEl('p', { text: 'The plugin never sends:' });
    const neverList = contentEl.createEl('ul');
    DISCLOSURE_BASE_COPY.neverSends.forEach((line) => neverList.createEl('li', { text: line }));
    // Buttons via createEl + addClass (no innerHTML — Pitfall 6 from v1.0 PITFALLS.md).
    // ... Cancel + I understand actions wire to onCancel / onContinue.
  }
}
```

### Pattern 5: Settings UI section (between Preview and Knowledge graph)

**What:** Add a new `AI` heading to `src/settings/SettingsTab.ts` between the
existing `Preview` heading (~line 184) and `Knowledge graph` heading (~line 205).
Active-provider dropdown swaps the visible form fields.

**Reference precedent:** The Preview section block at `SettingsTab.ts:184-196`
is the exact shape (single `setHeading()` row + dropdown row). The Knowledge
graph section at `:205-236` is the multi-field shape — that's the one to mirror
for AI (key + base URL + model + Test connection button).

**API key field is `<input type="password">`:** mirrors LC's manual cookie
inputs at `SettingsTab.ts:108-121`. `b.setValue(...).inputEl.type = 'password'`.

**Clean command IDs (Phase 06 FOUND-03):** All three new commands MUST follow:

| Command | ID | Name |
|---------|-----|------|
| Clear AI key | `clear-ai-key` | Clear AI key |
| Test AI connection | `test-ai-connection` | Test AI connection |
| Reset AI provider disclosures | `reset-ai-disclosures` | Reset AI provider disclosures |

IDs MUST NOT contain `obsidian`, the plugin id `leetcode`, or the substring
`command` (per `eslint-plugin-obsidianmd@^0.3.0` rules verified pinned in
`package.json`).

### Anti-Patterns to Avoid

- **`fetch()` directly from a provider adapter** — Electron renderer CORS
  blocks it for Anthropic/OpenAI/OpenRouter. ALL AI HTTP must route through
  `obsidianFetch(mode)`.
- **`innerHTML` in disclosure modal** — Pitfall 2 from `.planning/research/PITFALLS.md`;
  use `createEl()` / `createDiv()` exclusively. `eslint-plugin-obsidianmd@0.3.0`
  flags it; v1.0's plugin-store re-review will fail.
- **Bundling `electron` or `obsidian`** — both are external in
  `esbuild.config.mjs:18-25`. AI SDK packages MUST stay bundled (no `external`).
- **Storing AI keys anywhere except `data.json`** — no separate file, no OS
  keychain (CONTEXT G — explicitly out of scope, theatre).
- **Logging AI keys** — extend `src/shared/logger.ts:12` `REDACT` pattern to
  cover `apiKey`, `key`, `bearer` keys; extend `SECRET_VALUE_PATTERN` to cover
  `Authorization:`, `Bearer`, `x-api-key`. Mandatory before any provider
  adapter logs an error/request payload.
- **Mixing `obsidianFetch` and direct `requestUrl` in one adapter** — keep the
  seam pure. If an AI feature later needs a non-streaming side-call, route it
  through `obsidianFetch('request')`, not `requestUrl` directly.
- **Using `'leetcode.*'` userEvent annotation in AI code** — that's a CM6
  bypass for plugin-internal dispatches into locked sections of an LC note.
  AI code in Phase 07 doesn't touch the editor; this convention is irrelevant
  here. Document its irrelevance so Phase 08/09 reviewers don't add it
  cargo-cult.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anthropic Messages SSE parsing | Custom SSE parser + JSON event wiring | `@ai-sdk/anthropic` | Anthropic's SSE event format has 6+ event types; getting them right requires reading the spec. SDK does this for free. [VERIFIED: ai-sdk.dev/providers/ai-sdk-providers/anthropic — 2026-05-15] |
| OpenAI streaming chat completion | Custom SSE parser | `@ai-sdk/openai` | Same reasoning. |
| OpenRouter / Ollama / Custom adapter | Three separate hand-rolled wrappers | `@ai-sdk/openai-compatible` × 3 base URLs | One package, three configs. SDK already validates response shape. |
| Token→USD cost math | Custom token estimator | Hardcoded per-default-model rate table in `src/ai/pricing.ts` | Phase 07 only needs `addCost(usd)` semantics; Phase 09 polishes. SDK's `usage` field on responses gives `inputTokens` + `outputTokens` directly. |
| Day rollover for cost ledger | `setInterval` watching the date | Lazy on-read check (`if ledger.date !== today, reset`) | No timer leak risk; same shape as v1.0's TTL cache eviction at `SettingsStore.pruneProblemDetails`. |
| Error message extraction from provider responses | Custom JSON parsers per provider | `error.message` from the SDK's thrown error | AI SDK normalizes provider errors into a typed `AISDKError` with `.message`. Truncate at 200 chars per CONTEXT E. |
| Disclosure copy duplicated per feature | Hardcode in Phase 08/09/11 each | Single shared `DISCLOSURE_BASE_COPY` constant in `src/ai/disclosure.ts` (extensible) | CONTEXT D + open question 8. Phase 08 imports it and appends `'Phase 08: code, problem, last verdict.'` etc. |
| Test-connection rate-limiting | Token-bucket throttle | Single in-flight Promise per provider (debounce) | Per CONTEXT open question 9. Cost is a 1-token chat for Anthropic ($0.0001) — debouncing >>> rate-limiting. |
| Network-use README enumeration | Auto-generate from runtime | Hand-written README table (audited per release) | Phase 07.06 ships the table; Phase 12 re-audits. Plugin store reviewers compare README claims against grep of source — keep the table accurate-by-hand. |

**Key insight:** The Vercel AI SDK's existence collapses what would otherwise be ~1500 lines of bespoke per-provider code into ~150 lines of thin adapter wrappers. The `fetch` injection point makes the v1.0 LC pattern (`requestUrl` shim) directly transferable to AI calls.

---

## Common Pitfalls

### Pitfall 1: AI SDK requires `zod` as peer dep — silent module-load failure

**What goes wrong:** `npm install @ai-sdk/anthropic` succeeds but no `zod` is
installed. At plugin load time, the SDK's module-init throws
`Cannot find module 'zod'` and the plugin fails to load with a confusing
top-level stack trace.

**Why it happens:** zod is a `peerDependencies` entry, not a regular dep.
npm 7+ auto-installs peers, but explicit installation is safer because
mismatched zod major versions produce silent type drift.

**How to avoid:** Add `zod@^4.1.8` explicitly to `package.json` `dependencies`
in the same Plan as the SDK packages. Treat zod as a real runtime dep even
though we never `import` it ourselves.

**Warning signs:** Plugin fails to load with `Cannot find module 'zod'` in dev
console; SDK throws at first `createXxx` call.

**Phase to address:** Plan 07.01 (foundation deps).

[VERIFIED: `npm view @ai-sdk/anthropic peerDependencies` → `{ zod: '^3.25.76 || ^4.1.8' }` 2026-05-15]

### Pitfall 2: `electron.net.fetch` returning a `Response` whose `.body` is consumed only once

**What goes wrong:** Phase 08 or a future feature reads the streaming response
body, then a debug log later tries to read it again — `TypeError: Response body
is already consumed.`

**Why it happens:** Standard Fetch-API contract — `Response.body` is a
`ReadableStream` and can only be consumed once.

**How to avoid:** Document in `obsidianFetch('stream')` JSDoc that callers
consume the body exactly once. Phase 07 only ships the seam; Phase 08 owns the
streaming consumer pattern. Reference Phase 5 Wave 2's `runWith429Retry` shape
in `src/api/requestUrlFetcher.ts:198-212` for retry-without-double-consume
discipline.

**Warning signs:** `TypeError` in Phase 08 dogfood about already-consumed body.

**Phase to address:** Plan 07.02 documents the contract; Phase 08 enforces.

### Pitfall 3: AI SDK's `fetch` option signature mismatch with `electron.net.fetch`

**What goes wrong:** The AI SDK expects `fetch: (input: RequestInfo, init?:
RequestInit) => Promise<Response>` (per ai-sdk.dev docs verified 2026-05-15).
`electron.net.fetch(input: string | GlobalRequest, init?: RequestInit & {
bypassCustomProtocolHandlers?: boolean }): Promise<GlobalResponse>` accepts the
same `init` shape but `RequestInfo` includes `Request | string | URL` — `Request`
in the renderer is the DOM `Request`, while electron.net's `GlobalRequest` is
the same global. **In practice they are the same type at runtime.** The only
risk is a Type-only mismatch if `tsconfig.json` `lib` settings drift.

**Why it happens:** TypeScript's `dom` lib provides `RequestInfo`; if any
`compilerOptions.lib` setting strips `dom`, the AI SDK won't compile.

**How to avoid:** Verify `tsconfig.json` includes `"DOM"` (it does — Obsidian
plugins always include it). The runtime call passes through unchanged. **Verified
the shape match:** `electron.net.fetch` returns a `GlobalResponse` which is
structurally a `Response` — passing it back to AI SDK works.

**Warning signs:** TS compile error about `Request` not assignable to
`GlobalRequest` (only if `lib` is misconfigured); runtime "fetch is not a
function" if the require fails.

**Phase to address:** Plan 07.02. Add a 1-line type cast in `obsidianFetch('stream')`
if the compiler complains: `return net.fetch as unknown as FetchFn`.

[VERIFIED: ai-sdk.dev docs for createAnthropic / createOpenAI / createOpenAICompatible — 2026-05-15] [VERIFIED: electronjs.org/docs/latest/api/net — net.fetch returns Promise<GlobalResponse>]

### Pitfall 4: Provider-specific 401/403 patterns

**What goes wrong:** OpenAI returns `401 { error: { message: "Incorrect API key
provided", type: "invalid_request_error" }}`; Anthropic returns `401 {"error":
{"type": "authentication_error", "message": "..."}}`; Ollama with a wrong port
returns ECONNREFUSED at the network layer; OpenRouter returns
`401 { error: { message, code } }`. Treating any of these uniformly produces
useless error text.

**How to avoid:** Per CONTEXT E, surface vendor error messages **verbatim**,
truncated at 200 chars. The AI SDK already normalizes provider errors into a
typed error class — extract `error.message` and pass through.

```typescript
function extractProviderError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unknown error';
}
```

**Phase to address:** Plan 07.04 (Test connection probe).

### Pitfall 5: Plain-text key storage in `data.json` audit-trail

**What goes wrong:** A user opens `data.json` in a text editor, sees their
Anthropic API key in clear text, posts a screenshot publicly. Or another
plugin reads `.obsidian/plugins/leetcode/data.json` and exfiltrates keys.

**Why it happens:** Per CONTEXT G + AIPROV-02 wording, plain-text storage IS
the locked posture. Same as v1.0's `LEETCODE_SESSION` cookie. The risk is
documentation-only.

**How to avoid:**
1. Mask keys in the Settings UI input (`<input type="password">`).
2. Extend `src/shared/logger.ts` REDACT pattern + SECRET_VALUE_PATTERN to
   cover all AI key field names. Mandatory.
3. README "Network use" + "Security" section explicitly says: "API keys are
   stored in plain text in `.obsidian/plugins/leetcode/data.json` on your
   local disk only. Never transmitted anywhere except to the configured
   provider's API. This matches v1.0's LeetCode cookie posture."
4. Same posture for `.obsidian/plugins/leetcode/data.json` — the key never
   leaves the local machine.

**Warning signs:** Logged AI key in dev console (logger redaction failed); key
visible in network capture from another plugin (impossible — Obsidian plugins
don't share renderer state with each other).

**Phase to address:** Plan 07.01 (logger redaction extension); Plan 07.06
(README disclosure).

### Pitfall 6: Forgetting that Test connection IS an AI call subject to disclosure

**What goes wrong:** Implementer treats Test connection as "internal plumbing"
and skips the disclosure modal. AIPROV-04 wording is "before any AI call ever
made by the plugin"; the probe for Anthropic IS an AI call (1-token chat). The
probe for OpenAI/OpenRouter/Ollama/Custom-success is technically an
unauthenticated metadata call but goes to the provider's host — falls under
"sends data to provider".

**How to avoid:** `AIClient.probe(provider)` checks `disclosureAcknowledged`
the same way `AIClient.invoke()` does. Both routes through
`requireDisclosureOrCancel(provider)`.

**Phase to address:** Plan 07.04 (probe wiring) + Plan 07.05 (disclosure gate).

### Pitfall 7: AI SDK's `streamText` and our buffered `requestUrl` semantics

**What goes wrong:** Phase 08 calls `streamText({ model, prompt })` where
`model = createAnthropicModel(cfg, obsidianFetch('request'))` (note: 'request'
not 'stream'). The SDK requests streaming but the buffered `requestUrl`
returns the entire body at once, defeating streaming.

**How to avoid:** Phase 08 chooses 'stream' mode at the `obsidianFetch` factory
call site. Phase 07 only ships the factory; Phase 08 owns the choice. **Document
this contract in `obsidianFetch.ts`**: "If your AI SDK call needs streaming,
pass mode='stream'. mode='request' returns a fully-buffered response —
SDK streaming will appear to work but will arrive in one chunk."

### Pitfall 8: ESM-only AI SDK packages confusing esbuild

**What goes wrong:** AI SDK packages ship dual ESM+CJS. esbuild auto-resolves
which to import. If the resolution picks ESM and our esbuild target is `es2018`
(see `esbuild.config.mjs:27`), `tsconfig.json` `module: "ESNext"` should keep
it consistent. Risk: future SDK update goes ESM-only and our `target: "es2018"`
+ `format: "cjs"` config produces TLA (top-level-await) errors.

**How to avoid:** Plan 07.02 builds the production bundle with `npm run build`
and verifies zero TLA / dynamic-import warnings. If they appear, raise the
target to `es2020`.

**Phase to address:** Plan 07.02.

[VERIFIED: `esbuild.config.mjs:27` — `target: "es2018"`; AI SDK packages currently CJS-compatible per `dist.tarball` content 2026-05-15]

---

## Code Examples

### Example 1: `obsidianFetch` adapter (the seam)

```typescript
// src/ai/obsidianFetch.ts
// Source: extends src/api/requestUrlFetcher.ts:50-93 with stream mode
import { requestUrl } from 'obsidian';

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Single HTTP seam for ALL AI provider calls.
 *
 * mode='stream'  → electron.net.fetch — returns a Response with a
 *                  ReadableStream body. Phase 08+ uses this.
 * mode='request' → requestUrl bridge — returns a buffered Response. All
 *                  Phase 07 probes use this; future non-streaming AI calls
 *                  (e.g. AI Review batch in Phase 09) also use this.
 *
 * INVARIANT: leetcode.com calls NEVER go through this function. They use
 * the existing `installRequestUrlFetcher` + `throttledRequestUrl` path in
 * src/api/requestUrlFetcher.ts. Tests must verify this invariant.
 */
export function obsidianFetch(mode: 'stream' | 'request'): FetchFn {
  if (mode === 'stream') {
    // electron is external in esbuild — provided by Obsidian host at runtime.
    // net.fetch added in Electron 25 (May 2023); Obsidian minAppVersion 1.10
    // ships Electron 28+, so always available.
     
    const { net } = require('electron') as typeof import('electron');
    return async (input, init) => net.fetch(input as string | Request, init);
  }
  return async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : (input instanceof URL ? input.toString() : (input as Request).url);
    const res = await requestUrl({
      url,
      method: (init?.method as string) ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body as string | undefined,
      throw: false,
    });
    return new Response(res.text, { status: res.status, headers: res.headers as HeadersInit });
  };
}
```

### Example 2: Per-provider probe matrix

```typescript
// src/ai/providers/openai.ts (probe portion)
export async function probeOpenAI(cfg: ProviderConfig, fetcher: FetchFn): Promise<ProbeResult> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, errorMessage: extractFromJson(body).slice(0, 200) };
  }
  const json = await res.json() as { data?: { id: string }[] };
  return { ok: true, modelCount: Array.isArray(json.data) ? json.data.length : null };
}

// src/ai/providers/openaiCompatible.ts (custom probe with fallback)
export async function probeCustom(cfg: ProviderConfig, fetcher: FetchFn): Promise<ProbeResult> {
  // Try GET /models first.
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models`;
  let res: Response;
  try {
    res = await fetcher(url, {
      method: 'GET',
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
    });
  } catch (err) {
    return { ok: false, errorMessage: extractProviderError(err).slice(0, 200) };
  }
  if (res.ok) {
    const json = await res.json() as { data?: unknown[] };
    return { ok: true, modelCount: Array.isArray(json.data) ? json.data.length : null };
  }
  // 404/405/501 → fall back to 1-token chat. Other 4xx/5xx → fail with body.
  if ([404, 405, 501].includes(res.status)) {
    return probeViaOneTokenChat(cfg, fetcher); // shared with Anthropic
  }
  const body = await res.text();
  return { ok: false, errorMessage: extractFromJson(body).slice(0, 200) };
}

// src/ai/providers/ollama.ts (probe portion — uses /api/tags, NOT /v1/models)
export async function probeOllama(cfg: ProviderConfig, fetcher: FetchFn): Promise<ProbeResult> {
  // baseUrl is e.g. 'http://localhost:11434/v1' — strip trailing /v1 for /api/tags.
  const baseHost = cfg.baseUrl.replace(/\/v1\/?$/, '');
  const url = `${baseHost}/api/tags`;
  try {
    const res = await fetcher(url, { method: 'GET' });
    if (!res.ok) return { ok: false, errorMessage: `Ollama not reachable (HTTP ${res.status})` };
    const json = await res.json() as { models?: { name: string }[] };
    return { ok: true, modelCount: Array.isArray(json.models) ? json.models.length : 0 };
  } catch (err) {
    return { ok: false, errorMessage: 'Ollama not reachable on this host' };
  }
}
```

[VERIFIED: github.com/ollama/ollama/blob/main/docs/api.md — `GET /api/tags` lists installed models, default port 11434, no auth required, response has `models[]`. Fetched 2026-05-15.]

### Example 3: Pricing table (Plan 07.02 ships this)

```typescript
// src/ai/pricing.ts
// HARDCODED — vendor pricing pages at planning time. README documents that
// these may rot. Phase 09 polishes. Ollama always returns 0.0.
//
// Sources verified 2026-05-15:
//   - Anthropic Haiku 4.5: platform.claude.com/docs/en/about-claude/models/overview
//   - OpenAI mini-tier: openrouter.ai/api/v1/models (cross-referenced; OpenAI's
//     own pricing page returned 403 to WebFetch)
//   - OpenRouter: per-model from openrouter.ai/api/v1/models
//
// All values are USD per token (NOT per million tokens), matching the SDK's
// `usage` field which reports `{ inputTokens, outputTokens }` in tokens.

export interface ModelRate { input: number; output: number; }

export const PRICING: Record<string, ModelRate> = {
  // Anthropic — claude-haiku-4-5: $1/MTok input, $5/MTok output
  // [VERIFIED: platform.claude.com/docs/en/about-claude/models/overview 2026-05-15]
  'claude-haiku-4-5': { input: 1e-6, output: 5e-6 },
  // OpenAI — gpt-5-mini: $0.25/MTok input, $2/MTok output
  // [VERIFIED: openrouter.ai/api/v1/models for openai/gpt-5-mini 2026-05-15]
  'gpt-5-mini': { input: 0.25e-6, output: 2e-6 },
  // OpenRouter — anthropic/claude-haiku-4.5 pass-through: $1/MTok input, $5/MTok output
  // [VERIFIED: openrouter.ai/api/v1/models 2026-05-15]
  'anthropic/claude-haiku-4.5': { input: 1e-6, output: 5e-6 },
  // Ollama — local; always 0
  'llama3.2': { input: 0, output: 0 },
};

export function estimateCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  const rate = PRICING[model];
  if (!rate) return 0; // Unknown model (custom URL with arbitrary slug) — treat as free until Phase 09 polishes.
  return rate.input * usage.inputTokens + rate.output * usage.outputTokens;
}
```

### Example 4: Cost ledger day-rollover

```typescript
// In SettingsStore (extension)
async addCostLedger(usd: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' local-day
  if (this.data.aiCostLedger.date !== today) {
    this.data.aiCostLedger = { date: today, usdToday: 0 };
  }
  this.data.aiCostLedger.usdToday += usd;
  await this.persist();
}
```

### Example 5: Disclosure gate at probe entry

```typescript
// In AIClient.probe()
async probe(provider: AIProvider): Promise<ProbeResult> {
  const cfg = this.settings.getProviderConfig(provider);
  if (!cfg.disclosureAcknowledged) {
    const ack = await this.requireDisclosure(provider, cfg);
    if (!ack) {
      return { ok: false, errorMessage: 'AI call cancelled' };
    }
  }
  const adapter = resolveAdapter(provider, cfg, obsidianFetch('request'));
  return adapter.probe();
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-roll provider adapters per LLM | Vercel AI SDK's `@ai-sdk/*` packages with shared `fetch` injection | 2024+ (AI SDK 2.x onward) | Reduces ~1500 lines per multi-provider integration to ~150 lines of thin wrappers. |
| `fetch()` directly in plugin renderer for AI calls | `obsidianFetch(mode)` adapter (mode-switched) | This phase introduces it | Bypasses Electron CORS. Mirrors v1.0 LC pattern. |
| `electron.remote.BrowserWindow` for embedded browser flows | `require('electron')` directly (Obsidian host external) | 2023+ (`@electron/remote` deprecated) | Aligns with v1.0's `BrowserWindowLogin.ts` pattern. |
| Single global "AI" provider (one key, one URL) | Active-provider dropdown + `Record<provider, ProviderConfig>` map | 2024+ (multi-provider plugins norm) | Users can keep keys for multiple providers and switch without re-pasting. |
| Disclosure shown once per install | Disclosure shown once per provider switch | Per CONTEXT D | Network destination changes (work Anthropic vs home Ollama) re-fire correctly. |

**Deprecated/outdated for this phase:**

- **`@electron/remote`:** Deprecated; never use — direct `require('electron')`
  is the canonical path.
- **`fetch()` / `axios` for AI calls in plugin renderer:** Same CORS failure
  mode as v1.0 PITFALLS.md Pitfall 1.
- **OS keychain key storage:** Explicitly rejected per CONTEXT G —
  same-machine encryption is theatre.
- **Plugin-hosted AI proxy:** Explicitly rejected — telemetry surface, hosting
  cost, store risk.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Combined static-import bundle delta lands at ~300–360 KB minified, total ~460–520 KB against 500 KB CI gate. | Standard Stack | If actual bundle exceeds 500 KB, Plan 07.02 build CI fails — must add dynamic-import escape hatch (CONTEXT decision A's contingency path, already documented as fallback). **Validation: run `npm run build` + `npm run check:bundle-size` in Plan 07.02 Wave 1 BEFORE wiring AI features; fail-fast.** |
| A2 | OpenRouter free public list at `GET /api/v1/models` works without API key. | Code Examples | If OpenRouter starts requiring auth on the public list, the probe becomes Bearer-required. Verified live 2026-05-15 (returned 200 with full data array). Low risk. |
| A3 | Ollama default install ships `llama3.2` as a runnable model. | Standard Stack | If a fresh Ollama install has zero models, the probe returns `modelCount: 0` and the user must `ollama pull <model>`. The Notice says "Ollama reachable, 0 models installed — run `ollama pull llama3.2`." Document this in README. |
| A4 | The OpenRouter slug shape `anthropic/claude-haiku-4.5` (with dot, not dash) is the canonical form. | Standard Stack | [VERIFIED 2026-05-15 via live `curl https://openrouter.ai/api/v1/models`] — slug shape confirmed. |
| A5 | `electron.net.fetch` is reliably available across `minAppVersion: 1.10.0`. | Architecture Patterns | [VERIFIED] PR #36733 'feat: implement net.fetch' merged 2023-02-20, shipped Electron 25.0.0 (May 2023). Obsidian 1.5+ ships Electron 25+; Obsidian 1.10+ ships Electron 28+. Universally available across our supported version range. **Confidence: HIGH.** |
| A6 | The hardcoded pricing rates in `src/ai/pricing.ts` will rot but Phase 07's behavior is correct (returns 0 USD for unknown models, accumulates known-model costs). | Code Examples | If a vendor changes pricing, `addCost(usd)` continues to record stale numbers. Phase 09's UI surfaces the rolling daily total — users see "wrong" cost. README explicitly documents this rot. Low risk in Phase 07 (no UI). |
| A7 | The AI SDK `fetch` option's `Response` return type is structurally compatible with both `electron.net.fetch`'s `GlobalResponse` and our `requestUrl`-bridge `Response`. | Architecture Patterns | [VERIFIED via ai-sdk.dev docs 2026-05-15] — the SDK explicitly says "Defaults to the global `fetch` function" and shows examples replacing it. The signature is `(input, init?) => Promise<Response>`, which is exactly what both branches return. **Confidence: HIGH.** |
| A8 | tree-shaking of `@ai-sdk/*` packages requires no esbuild config tweaks beyond the existing `treeShaking: true` (already in `esbuild.config.mjs:30`). | Standard Stack | If true, no work; if false, bundle is larger than estimated. Validation in Plan 07.02 build. **Confidence: MEDIUM.** [ASSUMED] — esbuild tree-shaking is generally automatic for ESM imports. |
| A9 | The probes for OpenAI / OpenRouter / Ollama / Custom-success modes that go through `obsidianFetch('request')` work uniformly — vendor APIs accept the request shape. | Code Examples | Custom OpenAI-compat servers (LM Studio, vLLM, LiteLLM) generally implement `GET /models` per the OpenAI spec, but local servers may bind to localhost-only — `requestUrl` from Obsidian renderer to `localhost:*` works (no CORS). LiteLLM's docs explicitly say `/v1/models` is exposed; per their Swagger. Verified per the LiteLLM proxy docs at `docs.litellm.ai/docs/proxy/quick_start` 2026-05-15. **Confidence: MEDIUM-HIGH.** [ASSUMED for rare custom backends] |

---

## Open Questions

1. **Will the actual production bundle stay under 500 KB?**
   - What we know: Estimated 460–520 KB total based on `dist.unpackedSize` proxies and minification ratio assumptions.
   - What's unclear: The precise minified size after esbuild tree-shaking. Tree-shaking effectiveness varies per package.
   - Recommendation: **Plan 07.02 Wave 1 first task is `npm run build` + `npm run check:bundle-size` BEFORE wiring AI features.** If under 450 KB, ship static. If 450–500 KB, ship static but add the dynamic-import plan to `## Deferred Items` for v1.2. If over 500 KB, the planner reorders 07.02 to ship dynamic imports up front.

2. **Default model rot — when do we update the constants?**
   - What we know: `claude-haiku-4-5`, `gpt-5-mini`, `anthropic/claude-haiku-4.5`, `llama3.2` all current as of 2026-05-15.
   - What's unclear: Anthropic's model rotation cadence is roughly every 6 months. By Phase 12 ship, `claude-haiku-4-5` may be deprecated.
   - Recommendation: README "Cost expectations" subsection (Plan 07.06) explicitly says "Defaults may rot — when 'Test connection' shows `model_not_found`, update the model field manually". Phase 12 release-time audit confirms current values.

3. **Does the `'leetcode.*'` userEvent annotation have any role in Phase 07?**
   - What we know: Per CLAUDE.md and v1.0 Phase 5.5 section-lock, this annotation is for plugin-internal CM6 dispatches into locked LC-note regions.
   - What's unclear: Phase 07 doesn't write to the editor at all (foundation only).
   - Recommendation: **No role.** Document in 07.02's `obsidianFetch.ts` JSDoc that this convention is irrelevant for AI code; reviewers should NOT add it cargo-cult. Phase 09's `## AI Review` write path WILL need attention here, but that's Phase 09's problem.

4. **Should `ai` core package be a Phase 07 dep or Phase 08 dep?**
   - What we know: `ai@6.0.183` exposes `streamText` + `generateText` + `LanguageModel` interface. Phase 07's Anthropic probe uses `generateText`.
   - What's unclear: We could call `provider('id').doGenerate(...)` directly without `ai` core.
   - Recommendation: **Ship `ai@6.0.183` as a Phase 07 dep.** Avoids Phase 08 dep churn; the `generateText` API is significantly cleaner than `doGenerate`. Cost: ~20 KB extra (verified via `dist.unpackedSize` 6.6 MB → ~30 KB minified).

5. **What error-message extraction shape works for ALL providers' 4xx/5xx bodies?**
   - What we know: OpenAI/OpenRouter return `{ error: { message, type, code }}`; Anthropic returns `{ error: { type, message }}`; Ollama returns plain text or `{ error: "..." }`; LiteLLM mimics OpenAI.
   - What's unclear: A single regex/JSON-walk that handles all cases.
   - Recommendation: Best-effort extraction:
     ```typescript
     function extractFromJson(body: string): string {
       try {
         const j = JSON.parse(body);
         return j?.error?.message ?? j?.error ?? j?.message ?? body.slice(0, 200);
       } catch {
         return body.slice(0, 200);
       }
     }
     ```
     Falls back to raw body truncated. Good enough for Phase 07's "show vendor error verbatim" UX.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + npm | Build pipeline | ✓ | (per package.json) | — |
| `obsidian` types + runtime | Plugin runtime | ✓ | 1.12.3 (latest) | — |
| `electron` (host-provided) | obsidianFetch('stream') | ✓ | Electron 28+ (Obsidian 1.10+) | If somehow unavailable, fall back to `obsidianFetch('request')` for streaming — body arrives in one chunk, Phase 08's "Thinking..." indicator path. |
| `electron.net.fetch` API | obsidianFetch('stream') | ✓ | Added Electron 25 (May 2023) | Same as above — `requestUrl` fallback. |
| esbuild + watch mode | Dev workflow | ✓ | 0.25.5 | — |
| TypeScript compile | `npm run build` | ✓ | 5.8.3 | — |
| ESLint with `eslint-plugin-obsidianmd@^0.3.0` | Phase 06 already bumped | ✓ | 0.3.0 | — |
| `vitest@4.1.5` | Wave 0 tests | ✓ | already pinned | — |
| `npm run check:bundle-size` | Bundle-size CI gate | ✓ | Phase 06 FOUND-02 already shipped | — |
| `eslint-plugin-obsidianmd` rules `commands/no-command-in-command-id` + `no-plugin-id-in-command-id` | Plan 07.06 (clean command IDs) | ✓ | 0.3.0 already pinned | — |

**Missing dependencies with no fallback:** None — Phase 07 is pure code/config work plus 5 new npm packages (4 AI SDK + zod) that all install cleanly via `npm install`.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.5` (already pinned in `devDependencies`) |
| Config file | (project uses default vitest config; `tests/` is the convention) |
| Quick run command | `npx vitest run tests/ai/ -x` (per-task, ~2s) |
| Full suite command | `npm test` → `vitest run --passWithNoTests` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AIPROV-01 | Active provider dropdown swaps form fields; PluginData stores provider configs | unit (settings) | `npx vitest run tests/ai/settings-store-providers.test.ts -x` | ❌ Wave 0 |
| AIPROV-01 | Default model strings match the locked constants per provider | unit | `npx vitest run tests/ai/defaults.test.ts -x` | ❌ Wave 0 |
| AIPROV-02 | Settings UI renders password-masked input for API key field | unit (DOM) | `npx vitest run tests/ai/settings-tab-ai-section.test.ts -x` | ❌ Wave 0 |
| AIPROV-02 | Logger redacts AI key fields in error logs | unit | `npx vitest run tests/shared/logger-redact.test.ts -x` (extend existing test file) | ✅ extend existing |
| AIPROV-03 | OpenAI probe sends `GET /v1/models` with Bearer auth and reports model count | unit (fetch mocked) | `npx vitest run tests/ai/probe-openai.test.ts -x` | ❌ Wave 0 |
| AIPROV-03 | OpenRouter probe sends `GET /api/v1/models` and reports model count | unit | `npx vitest run tests/ai/probe-openrouter.test.ts -x` | ❌ Wave 0 |
| AIPROV-03 | Ollama probe sends `GET /api/tags` and reports model count | unit | `npx vitest run tests/ai/probe-ollama.test.ts -x` | ❌ Wave 0 |
| AIPROV-03 | Anthropic probe sends 1-token chat completion via SDK | unit (SDK mocked) | `npx vitest run tests/ai/probe-anthropic.test.ts -x` | ❌ Wave 0 |
| AIPROV-03 | Custom probe falls back to 1-token chat on `GET /models` 404/405/501 | unit | `npx vitest run tests/ai/probe-custom-fallback.test.ts -x` | ❌ Wave 0 |
| AIPROV-03 | Probe failure surfaces vendor error message verbatim, truncated at 200 chars | unit | `npx vitest run tests/ai/probe-error-extraction.test.ts -x` | ❌ Wave 0 |
| AIPROV-04 | Disclosure modal shows on first invoke per provider; sets `disclosureAcknowledged = true` | unit | `npx vitest run tests/ai/disclosure-gate.test.ts -x` | ❌ Wave 0 |
| AIPROV-04 | Switching to a not-yet-acknowledged provider re-fires the modal | unit | `npx vitest run tests/ai/disclosure-per-provider.test.ts -x` | ❌ Wave 0 |
| AIPROV-04 | Cancel action blocks call and emits "AI call cancelled" Notice | unit | `npx vitest run tests/ai/disclosure-cancel.test.ts -x` | ❌ Wave 0 |
| AIPROV-04 | `Reset AI provider disclosures` palette command clears all flags | unit | `npx vitest run tests/ai/reset-disclosures-command.test.ts -x` | ❌ Wave 0 |
| AIPROV-05 | `obsidianFetch('request')` calls `requestUrl` and returns Fetch-compatible Response | unit | `npx vitest run tests/ai/obsidian-fetch-request.test.ts -x` | ❌ Wave 0 |
| AIPROV-05 | `obsidianFetch('stream')` calls `electron.net.fetch` (mocked) | unit | `npx vitest run tests/ai/obsidian-fetch-stream.test.ts -x` | ❌ Wave 0 |
| AIPROV-05 | **Regression: any leetcode.com path still uses `requestUrl` not `obsidianFetch`** | regression (grep) | `./scripts/grep-no-vault-modify.sh`-style grep gate; or `npx vitest run tests/ai/leetcode-still-uses-requesturl.test.ts -x` | ❌ Wave 0 — see "Regression Test Spec" below |
| AIPROV-06 | `clear-ai-key` palette command wipes `providerConfigs[active].apiKey` from `data.json` | unit | `npx vitest run tests/ai/clear-ai-key-command.test.ts -x` | ❌ Wave 0 |
| AIPROV-06 | Clean command IDs lint-pass (`obsidianmd/commands/no-plugin-id-in-command-id`, etc.) | lint | `npm run lint` (existing CI job) | ✅ existing |
| AIPROV-07 | README "Network use" section enumerates all 5 base URLs + leetcode.com | doc-test | `npx vitest run tests/ai/readme-network-use.test.ts -x` (greps README.md for required strings) | ❌ Wave 0 |
| Cost ledger (F) | `addCost(usd)` accumulates same-day; rolls over on date change | unit | `npx vitest run tests/ai/cost-ledger-rollover.test.ts -x` | ❌ Wave 0 |
| Cost ledger (F) | Pricing table returns 0 for unknown models, correct rate for known | unit | `npx vitest run tests/ai/pricing-table.test.ts -x` | ❌ Wave 0 |

### Regression Test Spec — leetcode.com still uses requestUrl

The single most important regression test in this phase. **Two layers:**

**Layer 1 — grep-gate (CI script):**
```bash
# Add to scripts/ — fails if any src/api/* file imports obsidianFetch
! grep -rn "obsidianFetch" src/api/ src/auth/ src/browse/ src/notes/ src/solve/ src/graph/
```
Runs in CI before `npm test`.

**Layer 2 — runtime test:**
```typescript
// tests/ai/leetcode-still-uses-requesturl.test.ts
import { vi, expect, test } from 'vitest';
import * as obsidian from 'obsidian';

// Spy on requestUrl + assert that LC API code paths invoke it.
test('LeetCodeClient does NOT touch obsidianFetch', async () => {
  const obsidianFetchMock = vi.fn();
  // Stub obsidianFetch module
  vi.doMock('../../src/ai/obsidianFetch', () => ({ obsidianFetch: obsidianFetchMock }));
  // Run a smoke set of LeetCodeClient operations
  // ... assert obsidianFetchMock not called
  expect(obsidianFetchMock).not.toHaveBeenCalled();
});
```

### Sampling Rate

- **Per task commit:** `npx vitest run tests/ai/ -x` (ai-only suite, ~2s)
- **Per wave merge:** `npm test` (full suite ~10s + bundle-size check)
- **Phase gate:** Full suite green + `npm run check:bundle-size` green + `npm run lint` green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/ai/` directory and conftest-equivalent `tests/ai/helpers/mockProvider.ts` — shared fixtures for SDK + fetch mocking
- [ ] All `tests/ai/*.test.ts` files listed in the requirements map above (~20 new test files)
- [ ] `tests/shared/logger-redact.test.ts` — extend existing file with AI-key-field test cases (NOT a new file)
- [ ] `tests/ai/leetcode-still-uses-requesturl.test.ts` — the regression layer-2 test
- [ ] `scripts/check-no-obsidianfetch-in-lc.sh` — the regression layer-1 grep gate

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (against AI providers) | API key passed via `Authorization: Bearer` header (OpenAI/OpenRouter/Custom) or `x-api-key` (Anthropic, handled by SDK). Key never in URL. |
| V3 Session Management | no (stateless API calls) | — |
| V4 Access Control | no (single-user local plugin) | — |
| V5 Input Validation | yes | `SettingsStore` shape-guards on every new PluginData field — mirrors v1.0 D-14 + Phase 06 PREVIEW-02 posture. Any malformed field collapses to safe default. Specifically: `apiKey: string` (non-string → `''`); `baseUrl: string` (non-string OR not starting with `http://`/`https://` → provider default); `model: string` (non-string → provider default); `disclosureAcknowledged: boolean` (non-boolean → `false`); `aiCostLedger.date: string` (non-`YYYY-MM-DD` → today's date); `aiCostLedger.usdToday: number` (non-finite-number → 0). |
| V6 Cryptography | no (plain-text storage is locked posture) | Per CONTEXT G — same posture as v1.0 LC cookie. README "Security" section discloses. |
| V8 Data Protection | yes | API keys plain-text in `data.json` per AIPROV-02 (locked); never logged (logger.ts redaction extension); never transmitted except to configured provider's host (`obsidianFetch` is the single exit point — auditable). |
| V9 Communications | yes | All AI HTTP via Obsidian's `requestUrl` or `electron.net.fetch` (both go through Chrome's network stack with TLS); base URLs MUST be `https://` (Anthropic, OpenAI, OpenRouter); Ollama allows `http://localhost:*` only. Custom URL validation: enforce `http://` or `https://` prefix; warn (not block) `http://` non-localhost. |
| V13 API and Web Service | yes | OpenAI-compat probe accepts only well-formed `GET /v1/models` JSON; non-JSON 200 falls through to error path. |

### Known Threat Patterns for Obsidian + AI SDK + Electron renderer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in error logs / stack traces | Information Disclosure | Logger redaction extension (REDACT regex + SECRET_VALUE_PATTERN) — extend `src/shared/logger.ts:12-17` to include `apiKey`, `bearer`, `authorization`. **Mandatory before any provider adapter logs an error/request.** |
| Malicious `data.json` (manually edited) injecting URL pointing at attacker host | Tampering | Settings shape-guard validates `baseUrl` starts with `http://` or `https://`; user-typed Custom URL field has no auto-trust. README explains "your Custom URL is sent the same data as Anthropic — only point it at hosts you trust". |
| Cross-plugin key exfiltration | Information Disclosure | Out of scope — Obsidian renderer plugins are mutually isolated by Obsidian's plugin loader. Same posture as v1.0 LC cookie. |
| Prompt injection in problem text → AI exfiltrates `## Code` to remote URL | Information Disclosure | Out of scope for Phase 07 (no AI feature ships). Phase 08/09's prompt assembly + AI Review write path is where this matters; they MUST NOT include any user vault content beyond the active note. CONTEXT D's "never sends" list documents the boundary. |
| Disclosure modal bypass via direct `AIClient.invoke()` call | Tampering | Disclosure gate is in `AIClient.probe()` and `AIClient.invoke()` — both check `disclosureAcknowledged` before any HTTP call. Phase 08/09 commands MUST go through `AIClient.invoke()`, not bypass it. |
| Replay of cached LC cookie via AI provider host (cookie smuggling) | Tampering | `obsidianFetch` does NOT carry cookies; Cookie header is never set by AI adapters. Provider hosts only see Bearer auth. **Verified:** `electron.net.fetch` defaults to default session cookies — explicit override needed: `init.credentials = 'omit'` to be safe. **Plan 07.02 MUST set `credentials: 'omit'` on every AI fetch call.** |
| `electron.net.fetch` honoring `*://leetcode.com/*` cookies in AI calls | Information Disclosure | Same as above — `credentials: 'omit'` is mandatory on AI calls. **Adds a small but critical line to `obsidianFetch('stream')`.** |

---

## Sources

### Primary (HIGH confidence)

- `npm view @ai-sdk/anthropic@latest` — version 3.0.78 / unpackedSize 3.16 MB / peer zod ^3.25.76 || ^4.1.8 — verified 2026-05-15
- `npm view @ai-sdk/openai@latest` — version 3.0.64 / unpackedSize 3.65 MB — verified 2026-05-15
- `npm view @ai-sdk/openai-compatible@latest` — version 2.0.47 / unpackedSize 0.60 MB — verified 2026-05-15
- `npm view ai@latest` — version 6.0.183 / unpackedSize 6.56 MB — verified 2026-05-15
- ai-sdk.dev — Anthropic provider docs (custom fetch, model ids) — fetched 2026-05-15
- ai-sdk.dev — OpenAI provider docs (custom fetch, model ids) — fetched 2026-05-15
- ai-sdk.dev — OpenAI-compatible provider docs (createOpenAICompatible signature) — fetched 2026-05-15
- platform.claude.com/docs/en/about-claude/models/overview — Claude model id `claude-haiku-4-5` + pricing $1/$5 per MTok — fetched 2026-05-15
- live `curl https://openrouter.ai/api/v1/models` — slug shape `anthropic/claude-haiku-4.5`, pricing for haiku-4.5 + gpt-5-mini — verified 2026-05-15
- github.com/ollama/ollama/blob/main/docs/api.md — `GET /api/tags` shape, default port 11434 — fetched 2026-05-15
- electronjs.org/docs/latest/api/net — `net.fetch` signature + behavior — fetched 2026-05-15
- github.com/electron/electron/pull/36733 — `feat: implement net.fetch` merged 2023-02-20 (shipped Electron 25 May 2023) — fetched 2026-05-15
- `.planning/research/ARCHITECTURE.md` Pattern 1 (Facade Client with Injected Adapter) — load-bearing v1.0 precedent
- `src/api/LeetCodeClient.ts` (load-bearing v1.0 precedent for `AIClient.ts`)
- `src/api/requestUrlFetcher.ts` (load-bearing v1.0 precedent for `obsidianFetch.ts`)
- `src/settings/SettingsStore.ts` (shape-guard discipline + `previewClickBehavior` locked-schema posture)
- `src/settings/SettingsTab.ts:147-236` (section ordering + masked-input + heading-pattern precedent)
- `src/shared/logger.ts:12-17` (REDACT + SECRET_VALUE_PATTERN — to be extended)
- `manifest.json` (`minAppVersion: 1.10.0`)
- `esbuild.config.mjs` (electron + obsidian external; AI SDKs bundled)
- `package.json` (current pins)

### Secondary (MEDIUM confidence)

- docs.litellm.ai/docs/proxy/quick_start — LiteLLM proxy `/models` endpoint shape — fetched 2026-05-15

### Tertiary (LOW confidence — flagged in Assumptions Log)

- Bundle-delta minified estimate (~300–360 KB) — derived from `dist.unpackedSize` ratios; **must validate via Plan 07.02 build**.

---

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — every package version verified live via npm registry; AI SDK API surface verified live via official docs; pricing verified via live OpenRouter API + Anthropic docs.
- Architecture: **HIGH** — direct mirror of v1.0 LC patterns that have shipped + been UAT-tested; the `obsidianFetch` seam is structurally identical to `installRequestUrlFetcher`.
- Validation Architecture: **HIGH** — every requirement maps to a concrete vitest test file; the regression test for AIPROV-05 is fully specified.
- Security domain: **HIGH** — shape-guard + redaction patterns mirror v1.0 D-14 + AUTH-06 precedent.
- Pitfalls: **HIGH** — 7 of 8 pitfalls are extensions of v1.0 PITFALLS.md patterns or directly verified via live tools.
- Bundle-delta estimate: **MEDIUM** — based on unpacked-size ratios; final number depends on tree-shaking effectiveness, validated in Plan 07.02 Wave 1.

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days — AI SDK / Anthropic / OpenAI / OpenRouter all release frequently; verify versions + default model ids at planning time AND at execution time if more than ~2 weeks elapse).
