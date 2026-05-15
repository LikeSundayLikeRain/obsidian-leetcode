# Phase 07 Discussion Log — AI Provider Foundation

**Date:** 2026-05-15
**Phase:** 07 — AI Provider Foundation
**Mode:** default (no flags)

This is the human-readable record of the discussion that produced `07-CONTEXT.md`. Not consumed by downstream agents; for audits / retrospectives only.

---

## Gray-area selection

**Question:** Which areas to discuss for Phase 07 (AI Provider Foundation)?

**Options presented:**
1. Provider SDK approach
2. Settings UI shape
3. Disclosure + test-probe
4. Cost-cap + AIClient shape

**User selected:** All four.

---

## Area 1 — Provider SDK approach

**Question:** How should AI calls reach each provider — via Vercel AI SDK packages, hand-rolled REST, or a hybrid?

**Options presented:**
- **Vercel AI SDK (Recommended)** — `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/openai-compatible`. Standardized streaming, bundle ~80–150 KB.
- Hand-rolled per-provider — direct POST to each REST. Smallest bundle, max maintenance.
- Hybrid — AI SDK for OpenAI-compat + native for Anthropic.
- Ollama gets its own `/api/chat` path.

**User selected:** Vercel AI SDK.

**Notes captured:**
- Pinned versions + bundle-size measurement against the 500 KB CI gate is an open question for the researcher.
- If combined bundle exceeds ~250 KB, planner adds a dynamic-import plan.
- Ollama treated as another OpenAI-compatible provider (default base URL `http://localhost:11434/v1`, placeholder API key) — avoids a 5th adapter file.

---

## Area 2 — Settings UI shape

**Question:** How should the AI provider settings UI be organized?

**Options presented:**
- **Single 'AI' section in existing SettingsTab (Recommended)** — active-provider dropdown swaps fields below.
- Separate AISettingsTab (second tab).
- Accordion: all providers visible at once.
- Single section, no dropdown (one provider only).

**User selected:** Single 'AI' section in existing SettingsTab.

**Notes captured:**
- New section sits between Preview (Phase 06) and Knowledge graph (Phase 5 POLISH-01).
- PluginData stores `activeAIProvider` + `providerConfigs: Record<provider, ProviderConfig>` so switching providers preserves prior keys.
- Default base URLs + default cheap/fast model strings per provider (researcher to confirm against current vendor catalogs at planning time).
- Default model rot is documented in README; no auto-rotate on 404 — surface vendor error verbatim instead.

---

## Area 3 — Disclosure modal scope + test-connection probe

**Question:** When should the AIPROV-04 disclosure modal fire?

**Options presented:**
- **Once per provider switch (Recommended)** — first call after activate, persists per-provider acknowledgment.
- Once per plugin install — single modal ever.
- Once per feature×provider — up to 10 first-fires.
- Every AI call (always-on banner) — no acknowledgment ever.

**User selected:** Once per provider switch.

**Notes captured:**
- Per-provider `disclosureAcknowledged: boolean` flag on `ProviderConfig`.
- `Reset AI provider disclosures` palette command provided as escape hatch.
- "Always-on banner" rejected because AIPROV-04 wording requires explicit acknowledgment.
- "Once per install" rejected because changing destinations (e.g. Anthropic at office → self-hosted Ollama at home) deserves re-disclosure.

**Question:** How should 'Test connection' (AIPROV-03) probe each provider?

**Options presented:**
- 1-token chat completion (universal, ~$0.0001).
- **Models-list GET where available (selected)** — `/v1/models` for OpenAI/OpenRouter/Custom; `/api/tags` for Ollama; tiny chat for Anthropic (no public models endpoint).
- Per-provider tailored probe.
- HEAD/OPTIONS to base URL.

**User selected:** Models-list GET where available.

**Notes captured:**
- This is functionally identical to the "per-provider tailored probe" option once Anthropic's fallback is acknowledged. Recorded as such in CONTEXT.md decision E.
- Custom (OpenAI-compatible) provider: try `GET {baseUrl}/models` first; fall back to 1-token chat on 404/405/501 (some LiteLLM configs lack the endpoint).
- Result UX: success Notice includes model count where available; failure Notice surfaces vendor error verbatim, truncated at ~200 chars.

---

## Area 4 — Cost-cap counter scaffolding + AIClient module shape

**Question:** Should the daily cost-cap counter ship in Phase 07 or wait for Phase 09 (AIREV-06)?

**Options presented:**
- **Foundation now: storage + addCost() in Phase 07 (Recommended)** — counter scaffolding here, cap UI + enforcement in Phase 09.
- Defer to Phase 09 entirely.
- Foundation now, but counter-only — no token math yet.

**User selected:** Foundation now: storage + addCost() in Phase 07.

**Notes captured:**
- `aiCostLedger: { date, usdToday }` shape in PluginData.
- Day-rollover-on-read so no setInterval needed.
- Per-provider USD math — recommended to ship a minimal token→USD pricing table in Phase 07 (`src/ai/pricing.ts`); Ollama always returns 0; vendor-rot documented in CONTEXT.md.
- Phase 08 streaming Debug calls will count toward the cap automatically once Phase 09 wires the limit, with no Phase 08 churn.

**Question:** How should the AIClient module be split across files?

**Options presented:**
- **Facade + per-provider adapter files (Recommended)** — mirrors v1.0 LeetCodeClient + requestUrlFetcher pattern.
- Single AIClient with strategy table — one file, all providers inline.
- Facade + per-provider files + separate /streaming module.

**User selected:** Facade + per-provider adapter files.

**Notes captured:**
- Layout locked: `src/ai/AIClient.ts`, `src/ai/obsidianFetch.ts`, `src/ai/providers/{anthropic,openai,openaiCompatible,ollama}.ts`, `src/ai/types.ts`, `src/ai/disclosure.ts`.
- Symmetry with v1.0 wiring is the load-bearing reason.
- Separate `/streaming` module rejected as YAGNI for Phase 07 — `obsidianFetch.ts` already owns the `mode` switch; Phase 08 wires the streaming branch when it actually needs it.

---

## Deferred ideas (captured during analysis, not implemented)

- Lazy / dynamic provider import (only triggered if static-import bundle delta exceeds comfortable headroom against 500 KB gate).
- Per-provider rate-limit awareness (mirrors v1.0 throttle.ts) — deferred until Phase 08 dogfood surfaces 429s.
- Native Bedrock SigV4 (AIPROV-FUT-01).
- Apply-patch / Cursor-style diff (AIPROV-FUT-03).
- Per-feature provider routing (AIPROV-FUT-02).
- Cost-cap UI + enforcement (Phase 09 / AIREV-06).
- Token estimation before call for accurate pre-call cap math (Phase 09 polish).
- Auto-rotate default model strings on 404 (explicitly rejected; document rot in README instead).
- Test-connection cost-budget guard (overengineering at ~$0.0001/test).

---

## Claude's discretion (decisions not surfaced as gray areas)

- New "AI" section placed between Preview and Knowledge graph — followed v1.0 alphabetical-by-purpose precedent without asking.
- API key fields use `<input type="password">` — required by AIPROV-02 wording, not a discussion point.
- `src/shared/logger.ts` redaction patterns extended to every AI key field — required by v1.0 secret-handling posture (parallels `auth.LEETCODE_SESSION` redaction), not a discussion point.
- Clean command IDs (`clear-ai-key`, `test-ai-connection`, `reset-ai-disclosures`) — required by Phase 06 FOUND-03 cleanup (`eslint-plugin-obsidianmd@^0.3.0`), not a discussion point.
- Ollama default base URL `http://localhost:11434/v1` (editable) and placeholder API key — derived from the "Ollama as OpenAI-compatible provider" decision in Area 1.
- Test-connection result Notice truncation at ~200 chars — Obsidian Notice overflow guard, not a discussion point.

---

*Phase 07 discussion completed: 2026-05-15.*
