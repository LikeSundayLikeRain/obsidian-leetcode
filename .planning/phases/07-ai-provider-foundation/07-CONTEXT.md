# Phase 07 Context — AI Provider Foundation

**Phase:** 07 — AI Provider Foundation
**Milestone:** v1.1 (Contest, AI Coach, and Preview)
**Date:** 2026-05-15
**Goal:** User can configure an AI provider (Anthropic, OpenAI, OpenRouter, Ollama, or any OpenAI-compatible endpoint), test the connection, and acknowledge a one-time data-flow disclosure before any AI call is made.

---

<domain>

This phase delivers the **foundation layer** every later v1.1 AI feature plugs into:

- An `AIClient` facade with per-provider adapter files (Anthropic, OpenAI, OpenAI-compatible, Ollama-as-OpenAI-compat) all using the **Vercel AI SDK** family of packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`).
- A single `obsidianFetch(mode)` adapter that the AI SDK packages consume via their `fetch` option: `electron.net.fetch` for streaming when available, `requestUrl` otherwise. Non-streaming AI calls always use `requestUrl`. **All `leetcode.com` calls remain on `requestUrl` — v1.0 convention preserved absolutely.**
- A new "AI" section inside the existing `SettingsTab` (between Preview and Knowledge graph) with an active-provider dropdown that swaps the visible form fields (key + base URL + model) for the selected provider. PluginData stores `activeAIProvider` plus a `Record<provider, ProviderConfig>` map so switching providers preserves prior keys.
- "Test connection" action that issues a **models-list GET where supported** (`/v1/models` for OpenAI / OpenRouter / Custom; `/api/tags` for Ollama) and falls back to a **1-token chat completion for Anthropic** (which has no public models endpoint). Reports success or the provider's error message.
- A **per-provider-switch disclosure modal** that fires the first call after the user activates a provider, listing the active provider, base URL, and exact data the plugin will send. Acknowledged state persists per provider in PluginData; switching to a not-yet-acknowledged provider re-fires.
- A "Clear AI key" palette command that wipes the **active provider's** key from `data.json`.
- **Cost-cap scaffolding** (storage + `AIClient.addCost(usd)` + day-rollover-on-read), with no UI yet — Phase 09 (AIREV-06) wires the limit and the cap-exceeded Notice. Phase 08 streaming Debug calls automatically count toward the cap once Phase 09 lands.
- README "Network use" section enumerates every endpoint the plugin can contact (leetcode.com plus each AI provider's base URL).

Phase 07 ships **no AI features that the user actually invokes** — Debug (Phase 08) and Review (Phase 09) and KG (Phase 11) are downstream. This phase delivers the seam those phases will plug into.

Requirements covered: **AIPROV-01, AIPROV-02, AIPROV-03, AIPROV-04, AIPROV-05, AIPROV-06, AIPROV-07** (7 of v1.1's 39).

</domain>

---

<canonical_refs>

Downstream agents (researcher, planner, executor) MUST read these before acting. All paths are repo-relative.

**Project state**
- `.planning/PROJECT.md` — v1.1 milestone scope, key decisions, out-of-scope (BYO key only, no plugin-hosted proxy, no OS keychain, plain `data.json` posture)
- `.planning/REQUIREMENTS.md` — v1.1 requirements list (AIPROV-01..07, plus the AIPROV-FUT items deferred to v1.2)
- `.planning/ROADMAP.md` — Phase 07 goal + success criteria
- `.planning/STATE.md` — v1.1 decisions locked at roadmap time (`electron.net.fetch` default with `requestUrl` fallback for streaming AI; non-streaming AI always `requestUrl`; LC calls always `requestUrl`)

**v1.0 / v1.1 research**
- `.planning/research/SUMMARY.md` — Critical-path blockers (`requestUrl` adapter primacy, `data.json` discipline, Electron quarantine), library selections.
- `.planning/research/ARCHITECTURE.md` §"Standard Architecture", §"Recommended Project Structure", §"Pattern 1: Facade Client with Injected Adapter" — `LeetCodeClient` is the load-bearing precedent for `AIClient`.
- `.planning/research/PITFALLS.md` Pitfall 1 (Electron renderer CORS), Pitfall 2 (lint), Pitfall 8/9 (data.json bloat — relevant for cost ledger sizing), Pitfall 12 (frontmatter shape — relevant for cost-ledger schema discipline).
- `.planning/research/STACK.md` — current devDeps + bundle-size posture (no new runtime deps in Phase 06; Phase 07 introduces 3 new runtime deps via `@ai-sdk/*`).

**Project conventions (from `CLAUDE.md`)**
- All HTTP to `leetcode.com` via `requestUrl` — no exceptions, ever. The new `obsidianFetch(mode)` adapter is for AI provider hosts only.
- All vault writes via `app.vault.process` (body) + `app.fileManager.processFrontMatter` (frontmatter); `vault.modify` forbidden. Phase 07 has no vault writes (foundation only) — but the discipline applies the moment Phase 08/09/11 begin writing.
- `'leetcode.*'` userEvent annotation for plugin-internal CM6 dispatches (irrelevant to Phase 07; flagged as a guard for future AI features).
- Plugin ID prefix and "command" word forbidden in command IDs (`eslint-plugin-obsidianmd@^0.3.0` — bumped in Phase 06).

**v1.0 code references (read before editing)**
- `src/main.ts:152-310` — `LeetCodePlugin.onload()` shape; `registerView`, `addCommand`, settings tab registration, service wiring. Phase 07 wires `AIClient` construction here.
- `src/main.ts:505-560` — `openProblem(slug, status)` and `routeProblemClick(slug, status, intent)` — model for service-method signature pattern + delegation pattern.
- `src/api/LeetCodeClient.ts` — load-bearing precedent for `AIClient` shape (single facade, internal adapter, fetcher-as-construction-arg). New `src/ai/AIClient.ts` should mirror this.
- `src/api/requestUrlFetcher.ts` — load-bearing precedent for `obsidianFetch.ts` adapter shape (`requestUrl` ↔ Fetch-API bridge). New adapter extends with `electron.net.fetch` streaming branch.
- `src/api/throttle.ts` — rate-limiter precedent. AIClient may need its own provider-side rate awareness; researcher to confirm whether per-provider 429 handling is in-scope here or deferred to Phase 08.
- `src/settings/SettingsStore.ts` — `PluginData` shape; new fields go here. Existing patterns to mirror: shape-guards on every field (`isValidAuthCookies`, `sanitizeFolder`, `isValidCompoundFilter`); per-field fallback to defaults on validation failure. **Critical**: AI keys must follow the same locked-schema posture as `previewClickBehavior` (raw input that isn't a known shape collapses to a safe default).
- `src/settings/SettingsTab.ts:147-200` — section ordering (Notes, Preview, Knowledge graph). New "AI" section sits between **Preview** and **Knowledge graph** (alphabetical-by-purpose precedent).
- `src/auth/AuthService.ts` — masked-input precedent for the AI key fields (LC cookie input is not visually masked but is treated as secret; AI key inputs MUST be `<input type="password">` per AIPROV-02).
- `src/shared/logger.ts` — redaction patterns target `auth.LEETCODE_SESSION`. Phase 07 MUST extend redaction patterns to **every AI provider key field** (Anthropic, OpenAI, OpenRouter, Custom — Ollama keys are typically empty / placeholder so optional). This is non-negotiable for the same posture as the LC cookie.
- `package.json` — `eslint-plugin-obsidianmd@^0.3.0` already bumped in Phase 06. Adding `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` as new runtime deps; researcher confirms exact versions + total bundle delta against the 500 KB CI gate (current baseline ~163 KB).
- `esbuild.config.mjs` — production build entry; AI SDK packages must remain bundled (no `external`); `electron` stays external.

**External (researcher to verify against current state at planning time)**
- Vercel AI SDK docs — `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` API surface, `fetch` option for adapter injection, streaming via `streamText`, structured response handling. Researcher MUST confirm SDK version pin and that `fetch` injection works for both streaming and non-streaming paths.
- `electron.net.fetch` API — availability across Obsidian versions ≥ `minAppVersion`; stream-friendly response handling.
- Anthropic Messages API (`/v1/messages`) — public; no public models-list endpoint; SDK handles request shape.
- OpenAI `/v1/models` + `/v1/chat/completions` — used for both probe and real calls.
- OpenRouter `/api/v1/models` — same shape as OpenAI for the SDK.
- Ollama `/api/tags` (model list) + `/api/chat` (OpenAI-compatible at `/v1/chat/completions`) — local-first; no API key in default install.

</canonical_refs>

---

<decisions>

### A. Provider SDK approach — Vercel AI SDK family

- **Pick: Vercel AI SDK packages** as the runtime dep for all 4 providers. Specifically: `@ai-sdk/anthropic` (Anthropic), `@ai-sdk/openai` (OpenAI), `@ai-sdk/openai-compatible` (OpenRouter, Ollama, Custom-URL).
- **Why over hand-rolled REST:** Standardized streaming via async iterables, normalized response shape, models maintained upstream, `fetch` option lets us inject our `obsidianFetch(mode)` adapter cleanly for every provider with a single seam. The hand-rolled alternative would force us to write 4 SSE parsers (one per provider) and own provider error-mapping forever — too much work for a one-person plugin.
- **Why not "Hybrid: AI SDK for OpenAI-compatible + native for Anthropic":** Adding `@ai-sdk/anthropic` is one more dep but avoids hand-writing Anthropic's `/v1/messages` SSE parser. The bundle savings are not worth the maintenance cost of a hand-rolled Anthropic adapter.
- **Why not "Ollama gets its own /api/chat":** Ollama exposes an OpenAI-compatible endpoint at `/v1/chat/completions`. Treat Ollama as another OpenAI-compatible provider with a default base URL of `http://localhost:11434/v1` and a placeholder API key (`'ollama'` or empty). Avoids a 5th adapter file.
- **Bundle-size guard:** Researcher must confirm total bundle delta against the 500 KB CI gate (currently ~163 KB baseline). If `@ai-sdk/*` total exceeds ~250 KB combined, the planner adds a Plan to dynamic-import each provider lazily so only the active provider's package is in the hot path.

### B. AIClient module shape — facade + per-provider adapter files

- **Pick: facade + per-provider adapter files**, mirroring v1.0's `src/api/LeetCodeClient.ts` + `src/api/requestUrlFetcher.ts` precedent.
- Layout:
  ```
  src/ai/
  ├── AIClient.ts              # facade — owns the active-provider lookup + dispatches to adapter
  ├── obsidianFetch.ts         # the fetch adapter: electron.net.fetch for stream, requestUrl otherwise
  ├── providers/
  │   ├── anthropic.ts         # wraps @ai-sdk/anthropic
  │   ├── openai.ts            # wraps @ai-sdk/openai
  │   ├── openaiCompatible.ts  # wraps @ai-sdk/openai-compatible (covers OpenRouter, Custom URL)
  │   └── ollama.ts            # also @ai-sdk/openai-compatible but with an Ollama default base URL + key handling
  ├── types.ts                 # AIProvider, ProviderConfig, AIRequest, AIResponse
  └── disclosure.ts            # the once-per-provider-switch disclosure modal
  ```
- **Why over single AIClient + strategy table:** Symmetry with v1.0 LeetCode wiring. Per-provider quirks (Ollama's empty-key handling, Anthropic's models-list workaround) stay isolated. Adding a 5th provider in v1.2 = one new file, not a refactor of the strategy table.
- **Why not facade + adapters + separate `/streaming` module:** Phase 08 wires streaming, not Phase 07. Adding the dedicated streaming module pre-emptively is YAGNI. `obsidianFetch.ts` already owns the `mode` switch (`'stream' | 'request'`) — Phase 08 calls it with `'stream'`; Phase 07 ships only the `'request'` path actively used by Test connection.

### C. Settings UI shape — single 'AI' section with active-provider dropdown

- **Pick: single "AI" section in existing SettingsTab**, sits between **Preview** (Phase 06) and **Knowledge graph** (Phase 5 POLISH-01).
- Active-provider dropdown swaps the visible form fields. Only one provider's config is editable at a time.
- **PluginData shape**:
  ```
  activeAIProvider: 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom' | null  // null = not yet configured
  providerConfigs: Record<AIProvider, ProviderConfig>  // preserves prior keys when user switches
  ```
  where `ProviderConfig = { apiKey: string; baseUrl: string; model: string; disclosureAcknowledged: boolean }`. The per-provider `disclosureAcknowledged` flag implements decision D below.
- **Dropdown values + default base URLs** (researcher to confirm canonical URL strings against current SDK):
  - `anthropic` → `https://api.anthropic.com` (no user override needed; field hidden or read-only)
  - `openai` → `https://api.openai.com/v1` (read-only)
  - `openrouter` → `https://openrouter.ai/api/v1` (read-only)
  - `ollama` → `http://localhost:11434/v1` (editable — user may run on a different host/port)
  - `custom` → empty (user MUST type a URL; covers Bedrock-via-LiteLLM-gateway, Azure-OpenAI shape, vLLM, LM Studio per AIPROV-01)
- **No "AISettingsTab" second tab.** Single tab is canonical; users discover AI alongside other LC settings.
- **No accordion** — visible cognitive load too high for a plugin where most users will pick one provider and stick with it.
- **API key field is `<input type="password">`** per AIPROV-02. README explicitly states keys live plain-text in `data.json`.
- **Default model strings** (so paste-key-and-go works zero-config) — researcher MUST verify these against vendor catalogs at planning time and prefer "small/cheap" defaults:
  - Anthropic: `claude-haiku-4-5` (or current cheap-and-fast Haiku tier)
  - OpenAI: `gpt-5-mini` (or the current cheap-and-fast tier)
  - OpenRouter: `anthropic/claude-haiku-4-5` (mirror of Anthropic default through OpenRouter's slug shape)
  - Ollama: `llama3.2` (commonly preinstalled local default)
  - Custom: empty (user must type one)
- **Default-model rot mitigation:** When a configured model returns 404 / `model_not_found`, surface the provider's error verbatim in the test-connection result and the AI-feature error path. We do NOT auto-rotate defaults silently. README documents that defaults may rot and how to update them.

### D. Disclosure modal — once per provider switch

- **Pick: once per provider switch.** First AI call after the user activates a provider triggers the modal. Subsequent calls within the same provider don't re-show. Switching to a not-yet-acknowledged provider re-fires.
- **Persistence:** `ProviderConfig.disclosureAcknowledged: boolean` per-provider in PluginData. Default `false`. Set `true` only after user clicks "I understand" in the modal.
- **Modal content**:
  - Title: "Heads up: this will send data to {provider name}"
  - Body lists, in plain English:
    1. Active provider name + base URL (e.g. `Anthropic — https://api.anthropic.com`)
    2. Exactly what gets sent (this phase only stubs this; Phases 08/09/11 each add their feature-specific data manifest):
       - Phase 07: nothing yet — modal text reads "Future AI features will send: problem text, your `## Code` content, last verdict + failing test, optionally `## Notes`."
    3. The plugin **never** sends: vault file paths outside the active note, frontmatter that does not begin with `lc-`, any other vault content, telemetry of any kind.
  - Two actions: **Cancel** (closes modal, blocks the in-flight call, returns a Notice "AI call cancelled") and **I understand — continue** (sets `disclosureAcknowledged = true`, persists, allows the in-flight call to proceed).
- **Why not once-per-install:** A user switching from Anthropic at the office to a self-hosted Ollama at home should re-see the modal — the network destination is genuinely different.
- **Why not once-per-feature×provider:** Up to 2 features × 5 providers = 10 first-fires. Modal fatigue + low marginal value once the user has acknowledged the *destination*.
- **Why not always-on banner:** AIPROV-04 wording ("must be acknowledged before the call proceeds") rules out non-blocking inline UI. We need the explicit click.
- **Reset path:** New palette command `Reset AI provider disclosures` clears all `disclosureAcknowledged` flags so the modal re-fires on next call. Useful for QA + as a paranoia escape hatch. Clean command ID: `reset-ai-disclosures`.

### E. Test-connection probe — models-list GET where supported, 1-token chat for Anthropic

- **Pick: per-provider tailored probe that prefers models-list GET and falls back to 1-token chat for Anthropic.**
- Per-provider mapping:
  - **OpenAI**: `GET /v1/models` (Bearer auth). Zero token cost. Validates key + base URL.
  - **OpenRouter**: `GET /api/v1/models`. Same shape as OpenAI.
  - **Custom (OpenAI-compatible)**: Try `GET {baseUrl}/models` first; if 404 / 405 / 501, fall back to 1-token chat. Custom URLs may not implement the models endpoint (e.g. some LiteLLM configs).
  - **Ollama**: `GET {baseUrl}/api/tags` (no auth needed). Validates the base URL is reachable + lists installed models.
  - **Anthropic**: 1-token chat completion via SDK with `max_tokens: 1`, prompt `"ping"`. Anthropic has no public models-list endpoint. Cost: ~$0.0001 per test.
- **Why not 1-token chat universally:** Cost surprise on a setup-time action; users may click "Test connection" repeatedly while debugging. Free probes where vendor offers them.
- **Why not models-list-only:** Anthropic doesn't offer one. A models-list-only probe leaves Anthropic users untested — unacceptable for a foundation phase.
- **Why not HEAD/OPTIONS:** Doesn't validate the API key. AIPROV-03 requires reporting "success or the error message" — HEAD doesn't surface auth errors meaningfully.
- **Result UX:**
  - Success → Notice "AI provider connection OK ({provider name}, {model_count} models available)" — model count omitted for Anthropic (no list).
  - Failure → Notice with the provider's error message verbatim (e.g. "OpenAI: Incorrect API key provided"). Truncated at ~200 chars to avoid Notice overflow.

### F. Cost-cap counter scaffolding — foundation now

- **Pick: foundation-now with `addCost(usd)` hook + day-rollover-on-read.**
- **PluginData additions**:
  ```
  aiCostLedger: {
    date: string;       // ISO date 'YYYY-MM-DD' — local plugin TZ
    usdToday: number;   // rolling sum since `date`; 0 on rollover
  }
  ```
- **`AIClient.addCost(usd: number): Promise<void>`** — every adapter calls this after each non-zero-cost call. On entry, checks `Date.now()` local-date against `aiCostLedger.date`; if mismatched, resets `usdToday` to 0 and updates `date`. Then adds `usd`.
- **No cap enforcement in Phase 07.** No UI. No Notice. Phase 09 adds:
  - `aiDailyCapUsd: number` PluginData field
  - Settings UI for the cap
  - Pre-flight check in `AIClient.invoke()` that compares `usdToday + estimated_call_cost` against `aiDailyCapUsd` and short-circuits with a Notice when over.
- **Phase 07 scope is only the storage shape + the `addCost()` hook + day-rollover.** This way Phase 08 streaming Debug calls automatically count toward the cap once Phase 09 wires the limit, with no Phase 08 churn.
- **Per-provider USD math:** Researcher to confirm a small token→USD pricing table can ship in Phase 07 (`src/ai/pricing.ts`) or whether it should be deferred to Phase 09. Recommended: ship a minimal table now (per-1M-input / per-1M-output pricing for the default model on each provider, hardcoded constants); Phase 09 polishes. Ollama always returns `0.0`. Anthropic, OpenAI, OpenRouter populate from the vendor's pricing pages at planning time; documented as "may rot — update when vendor pricing shifts."

### G. Out of scope for this phase (locked)

- **Streaming UI / `electron.net.fetch` streaming path active use** — Phase 08. Phase 07's `obsidianFetch.ts` ships the `mode` switch but only the `'request'` path is exercised by Test connection.
- **AI Debug button under `## Code`** — Phase 08.
- **`## AI Review` heading + write path** — Phase 09.
- **Pattern-cluster classification + hub notes** — Phase 11.
- **Per-feature daily cost cap UI + Notice** — Phase 09.
- **Apply-patch / Cursor-style diff** — AIPROV-FUT-03, deferred to v1.2.
- **Native Bedrock SigV4** — AIPROV-FUT-01, deferred to v1.2 (LiteLLM/BAG via Custom URL covers Bedrock for v1.1 per STATE.md).
- **Per-feature provider routing** (separate provider for Debug vs Review) — AIPROV-FUT-02, deferred to v1.2.
- **Native OS-keychain key storage** — explicit Out-of-Scope per REQUIREMENTS.md (theatre).
- **Plugin-hosted AI proxy** — explicit Out-of-Scope (telemetry surface, hosting cost, store risk).

</decisions>

---

<deferred>

Captured here, NOT implemented. These came up during analysis but are out of scope for Phase 07.

- **Lazy / dynamic provider import** to keep bundle small — only triggered if researcher confirms the static-import bundle delta exceeds comfortable headroom against the 500 KB CI gate. If the static path is fine, this stays in the v1.2 backlog.
- **Per-provider rate-limit awareness** (mirrors v1.0's `src/api/throttle.ts` for LC). AI providers each have their own rate limits; on 429 we want exponential backoff. Phase 07 ships no rate limiter; Phase 08 may add one if streaming surfaces 429s in dogfood. Deferred decision until Phase 08.
- **Provider-side request signing for Bedrock SigV4** — AIPROV-FUT-01.
- **Apply-patch suggestion path** — AIPROV-FUT-03.
- **Per-feature provider routing** — AIPROV-FUT-02.
- **Cost-cap UI + enforcement** — Phase 09 (AIREV-06).
- **Token estimation before call** for accurate pre-call cap math — Phase 09 polish.
- **Auto-rotate default model strings on 404** — explicitly rejected in decision C; documented in README that defaults may rot and how to update.
- **Test connection cost-budget guard** (e.g. block Test connection after N tests/day) — overengineering; cost is ~$0.0001 per test.

</deferred>

---

<code_context>

Key existing assets new code should reuse (read before writing anything new):

- **`src/api/LeetCodeClient.ts` shape** — load-bearing precedent for `src/ai/AIClient.ts`. Single facade, internal adapter, fetcher injected at construction. The whole AI module is patterned after this.
- **`src/api/requestUrlFetcher.ts` shape** — load-bearing precedent for `src/ai/obsidianFetch.ts`. The new adapter extends with an `electron.net.fetch` branch behind a `mode === 'stream'` check; falls back to `requestUrl` for `mode === 'request'` or when streaming is unavailable.
- **`src/settings/SettingsStore.ts` shape-guard discipline** — every new PluginData field MUST ship a shape-guard with a safe-default fallback, mirroring `previewClickBehavior`'s "anything not-literally-the-known-string falls through to default" pattern. AI key fields, base URLs, model strings, `disclosureAcknowledged`, `aiCostLedger.date`, `aiCostLedger.usdToday` all need guards.
- **`src/settings/SettingsTab.ts:147-200`** — section ordering precedent. The new "AI" section is added between **Preview** (line ~184) and **Knowledge graph** (line ~205), using the same `new Setting(containerEl).setName('AI').setHeading()` pattern.
- **`src/auth/AuthService.ts`** — masked-input + Notice precedents. AI key fields use `<input type="password">` (Obsidian's `addText` with `inputEl.type = 'password'`).
- **`src/shared/logger.ts`** — redaction patterns. New AI keys must extend the redaction list. Exact field names (`anthropic.apiKey`, `openai.apiKey`, etc) all redacted in logs.
- **`src/main.ts:152-310`** — `onload()` wiring shape. `AIClient` construction goes here; placed after `SettingsStore.load()` and before `registerView`. Disclosure modal registered as a Plugin instance method.
- **`addCommand` patterns in `src/main.ts`** — clean command IDs (no `obsidian-leetcode:` prefix, no "command" word) per Phase 06 FOUND-03 cleanup. Phase 07 adds: `clear-ai-key`, `test-ai-connection`, `reset-ai-disclosures`.
- **`esbuild.config.mjs`** — `@ai-sdk/*` packages must be bundled (not external). `electron` stays external (Obsidian provides). Researcher confirms whether tree-shaking the AI SDK packages requires any esbuild config tweaks.
- **`package.json`** — already pins `eslint-plugin-obsidianmd@^0.3.0`. Phase 07 adds `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, and (per researcher's call) potentially the `ai` core package as a peer dep.

</code_context>

---

<plan_hints>

For the planner — likely plan boundaries (researcher/planner have final say):

1. **Plan 07.01: Foundation types + PluginData schema + shape-guards.** Adds `AIProvider` enum, `ProviderConfig` interface, `aiCostLedger` shape, `disclosureAcknowledged` per-provider flag to `PluginData`. Ships SettingsStore getters/setters + shape-guards + log-redaction. **No UI yet.** Tests cover: every malformed input collapses to a safe default (mirrors v1.0 D-14 + Phase 06 PREVIEW-02 posture). **Gates Plans 07.02–07.06.**
2. **Plan 07.02: `obsidianFetch(mode)` adapter + `AIClient` facade.** Ships `src/ai/obsidianFetch.ts` (full `mode` switch, both branches working — but only `'request'` exercised in tests this phase) and `src/ai/AIClient.ts` (facade method `invoke()` that dispatches to the active adapter, plus `addCost(usd)` + day-rollover). Per-provider adapter files stub: each exports a `createModel(config, fetcher)` returning the SDK's model object.
3. **Plan 07.03: AI Settings section + active-provider dropdown.** Adds the new "AI" section in `SettingsTab` between Preview and Knowledge graph. Active-provider dropdown swaps form fields. Masked key inputs. Default base URLs + default models per decision C. Ships the wire-up but `Test connection` button still stubbed.
4. **Plan 07.04: Test-connection probe (per-provider).** Implements the per-provider probe matrix from decision E: models-list GET for OpenAI / OpenRouter / Custom-with-fallback / Ollama; 1-token chat for Anthropic. Surfaces vendor error messages verbatim in Notice.
5. **Plan 07.05: Once-per-provider-switch disclosure modal.** Implements `src/ai/disclosure.ts`. `AIClient.invoke()` (stubbed since no real AI feature uses it yet) checks `disclosureAcknowledged` and shows the modal first. `Reset AI provider disclosures` palette command.
6. **Plan 07.06: `Clear AI key` palette command + README "Network use" section update.** Adds `clear-ai-key` command that wipes the active provider's key. Updates README listing every endpoint the plugin can contact (leetcode.com plus each AI provider's base URL); adds a "Cost expectations" stub that Phase 12 fleshes out.

Plan numbering is illustrative; planner's split is authoritative.

</plan_hints>

---

<success_criteria>

(Mirrors ROADMAP.md Phase 07 success criteria, restated for downstream.)

1. User can pick a provider from the AI settings tab, paste a key (masked input), set a base URL + model, and run "Test connection" with a clear success/failure Notice.
2. User sees a one-time disclosure modal — listing active provider, base URL, and the exact data the plugin will send — before any AI call is issued. Switching to a not-yet-acknowledged provider re-fires the modal.
3. User can run the "Clear AI key" command from the palette and see the active provider's key wiped from `data.json`.
4. README's "Network use" section enumerates every endpoint the plugin can contact (leetcode.com plus each AI provider's base URL).
5. AI calls go through a single `obsidianFetch(mode)` adapter — `electron.net.fetch` for streaming when available, `requestUrl` otherwise — and all leetcode.com calls remain on `requestUrl` (v1.0 convention preserved absolutely).

Verification: each success criterion maps to an integration test or a manual UAT step, planner to enumerate. Test #5 specifically requires a regression test that any LC API call path still uses `requestUrl` and not the new adapter.

</success_criteria>

---

<open_questions_for_planning>

Items the researcher / planner should resolve before execution. Not blockers for this CONTEXT.md.

- Exact `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` versions to pin and the resulting bundle delta against the 500 KB CI gate (current ~163 KB baseline). If combined size exceeds ~250 KB, planner adds a dynamic-import plan.
- Whether the AI SDK's `fetch` option fully supports streaming through `electron.net.fetch` (it expects a Fetch-API-shaped function returning a `Response` with a readable stream) — researcher must validate, not assume.
- Whether `electron.net.fetch` is reliably available across `minAppVersion` (currently 1.5.x in manifest); fallback path if not.
- Default model strings per provider — researcher confirms current cheap/fast tier names for each (Anthropic, OpenAI, OpenRouter slug shape, Ollama default install) at planning time so the seed values aren't already rotted on commit.
- Default base URL canonical strings (esp. OpenRouter, Ollama) against current SDK docs.
- Whether `addCost()` token→USD math should ship a per-provider pricing table in Phase 07 (recommended) or defer entirely to Phase 09. If shipped here, planner derives the constants from current vendor pricing pages at planning time.
- For Custom (OpenAI-compatible) provider, the fallback flow when `GET /models` returns 404 — confirm the 1-token chat fallback shape is universally acceptable for OpenAI-compat servers (LiteLLM, vLLM, LM Studio, Azure-OpenAI shape).
- Whether the disclosure modal's "exactly what gets sent" copy should be sourced from a single shared constant (so Phase 08/09/11 each extend it) or hardcoded per-feature. Recommend single shared constant in `src/ai/disclosure.ts` that downstream phases append to.
- Test connection rate-limit / debouncing — should rapid clicks be debounced (recommended: 1 in-flight at a time per provider) or rate-limited?
- README "Cost expectations" subsection scope — Phase 07 adds a stub; Phase 12 finalizes. What goes in the stub? Recommend: 1-paragraph "AI features will incur per-call cost; see your provider's pricing page; cost tracking ships in Phase 09".

</open_questions_for_planning>

---

*Phase 07 context captured: 2026-05-15. Ready for `/gsd-plan-phase 7`.*
