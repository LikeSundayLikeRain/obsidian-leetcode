---
phase: 07-ai-provider-foundation
verified: 2026-05-15T22:15:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/12
  gaps_closed:
    - "Logger redactString does not garble log output — 'Authorization: Bearer sk-proj-abcdef' redacts cleanly without double-replacement (CR-01)"
    - "probeCustom returns a clean error when baseUrl is empty — no network call issued with a relative URL (CR-02)"
  gaps_remaining: []
  regressions: []
advisory_findings_from_07_07_review:
  - id: CR-01-A
    severity: critical-advisory
    description: "Authorization: Bearer (no trailing token) — second alternate fires, outputs 'Authorization=[REDACTED]', silently consuming the Bearer keyword as a value and changing ':' to '='. Not a security issue; no real secret is exposed. Not in the original 12 truths."
  - id: WR-01-test-gap
    severity: warning-advisory
    description: "aiClient.test.ts MockSettings is missing setProviderConfig — disclosure-gate path would crash if exercised; all existing tests bypass it via disclosureAcknowledged:true."
  - id: WR-02-separator
    severity: warning-advisory
    description: "Second alternate hardcodes '=' separator in output, so 'x-api-key: val' becomes 'x-api-key=[REDACTED]'. Pre-existing asymmetry; worsened by the CR-01 fix which now explicitly documents ':' preservation only for the first alternate."
  - id: WR-03-whitespace
    severity: warning-advisory
    description: "main.ts guard uses cfg.baseUrl === '' (strict) while probeCustom/probeOllama use !cfg.baseUrl (falsy). Whitespace-only baseUrl ('   ') passes the main.ts guard but produces a relative-ish URL. No test coverage for this edge."
---

# Phase 07: AI Provider Foundation — Verification Report

**Phase Goal:** User can configure an AI provider (Anthropic, OpenAI, OpenRouter, Ollama, or any OpenAI-compatible endpoint), test the connection, and acknowledge a one-time data-flow disclosure before any AI call is made.
**Verified:** 2026-05-15T22:15:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 07-07)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AIProvider union, ProviderConfig, AICostLedger, ProbeResult, AIRequest, AIResponse types exported from src/ai/types.ts | VERIFIED | Confirmed in initial verification; no regression (quick check: file unchanged) |
| 2 | PluginData carries activeAIProvider, providerConfigs, aiCostLedger after load with shape-guards | VERIFIED | Confirmed in initial verification; SettingsStore unchanged by 07-07 |
| 3 | Malformed AI fields in data.json collapse to per-provider safe defaults — no crash | VERIFIED | 13 settingsStore unit tests pass in the 925-test suite run |
| 4 | Logger redacts apiKey, api_key, x-api-key, bearer, authorization at object-key and value-level — clean output without double-replacement | VERIFIED (fixed) | Single ordered-alternation pattern in `src/shared/logger.ts:51-70`. Node execution confirmed: `'Authorization: Bearer sk-proj-abcdef'` → `'Authorization: Bearer [REDACTED]'`. No `=[REDACTED] [REDACTED]` garbling. See advisory CR-01-A for the no-token edge case. |
| 5 | obsidianFetch sets credentials:'omit' on both branches | VERIFIED | Stream branch: `credentials: 'omit'` in safeInit spread at line 83. Request branch: documented structural impossibility at lines 101-105. |
| 6 | leetcode.com calls NEVER use obsidianFetch — enforced by CI grep gate AND runtime test | VERIFIED | `scripts/check-no-obsidianfetch-in-lc.sh` exists; 4 LC-isolation tests pass in suite |
| 7 | AIClient.probe(provider) and AIClient.invoke(req) both gate on disclosureAcknowledged BEFORE any HTTP | VERIFIED | probe() checks `!cfg.disclosureAcknowledged` at line 86; invoke() checks at line 136. Both confirmed present. |
| 8 | probeCustom returns clean error when baseUrl is empty — no network call issued with a relative URL | VERIFIED (fixed) | `if (!cfg.baseUrl) return { ok: false, errorMessage: 'Base URL is required for Custom provider.' }` at `openaiCompatible.ts:70`. Mirrored in `ollama.ts:32`. `testActiveAIConnection` main.ts guard at lines 789-795. Tests: `probes.test.ts` CR-02 suite asserts `fetcherSpy.toHaveBeenCalledTimes(0)` for both probeCustom and probeOllama with empty baseUrl — all pass (925 passed, 0 failed). |
| 9 | Three palette commands exist with clean IDs: test-ai-connection, reset-ai-disclosures, clear-ai-key | VERIFIED | All three confirmed at `main.ts:350, 363, 380`. No 'obsidian' prefix, no hotkeys. |
| 10 | Disclosure modal gates both AIClient.probe AND AIClient.invoke; Continue persists disclosureAcknowledged=true | VERIFIED | Confirmed in initial verification; no changes to gate logic in 07-07 |
| 11 | Switching activeAIProvider preserves prior provider's apiKey + disclosureAcknowledged in providerConfigs map | VERIFIED | Confirmed in initial verification; SettingsStore unchanged |
| 12 | README ## Network usage section enumerates all 5 AI provider hosts plus leetcode.com | VERIFIED | Confirmed in initial verification; README not modified by 07-07 |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ai/types.ts` | AIProvider union + 5 interfaces | VERIFIED | Unchanged from initial verification |
| `src/ai/AIClient.ts` | probe/invoke/addCost facade | VERIFIED | WR-01 fix applied: `return await adapter.invoke(req)` at line 159 |
| `src/ai/obsidianFetch.ts` | FetchFn factory with stream/request modes | VERIFIED | Both branches present; credentials:'omit' confirmed |
| `src/ai/pricing.ts` | PRICING table + estimateCostUsd | VERIFIED | Unchanged from initial verification |
| `src/ai/providers/index.ts` | resolveAdapter exhaustive switch | VERIFIED | Unchanged |
| `src/ai/providers/anthropic.ts` | createAnthropicModel + probeAnthropic | VERIFIED | Unchanged |
| `src/ai/providers/openai.ts` | createOpenAIModel + probeOpenAI | VERIFIED | Unchanged |
| `src/ai/providers/openaiCompatible.ts` | createOpenAICompatibleModel + probeOpenRouter + probeCustom | VERIFIED (fixed) | CR-02 guard at line 70: `if (!cfg.baseUrl) return { ok: false, errorMessage: 'Base URL is required for Custom provider.' }` |
| `src/ai/providers/ollama.ts` | createOllamaModel + probeOllama | VERIFIED (fixed) | CR-02 mirror guard at line 32: `if (!cfg.baseUrl) return { ok: false, errorMessage: 'Base URL is required for Ollama provider.' }` |
| `src/ai/disclosure.ts` | AIDisclosureModal + DISCLOSURE_BASE_COPY + setCta on Continue | VERIFIED (improved) | WR-02 fix: `Object.freeze` applied at lines 56, 62, 73 — outer object AND both inner arrays frozen. `readonly` type annotation on exported constant. |
| `src/settings/SettingsStore.ts` | 3 new PluginData fields + shape-guards + getters/setters | VERIFIED | Unchanged |
| `src/shared/logger.ts` | Single ordered-alternation SECRET_VALUE_PATTERN | VERIFIED (fixed) | CR-01 fix: two-pass approach replaced with single-pattern ordered alternation at lines 51-71. Replacement function preserves `:` separator for Authorization: Bearer shape. |
| `src/main.ts` | AIClient Step 5.9 + 3 palette commands + testActiveAIConnection + requireAIDisclosure + resetAIDisclosures + clearActiveAIKey + CR-02 baseUrl guard | VERIFIED (improved) | CR-02 guard added at lines 789-795 for custom/ollama empty baseUrl |
| `scripts/check-no-obsidianfetch-in-lc.sh` | CI grep gate for AIPROV-05 | VERIFIED | Unchanged; passes |
| `styles.css` | .lc-ai-input + .leetcode-ai-disclosure | VERIFIED | Unchanged |
| `README.md` | ## Network usage with all 5 AI hosts | VERIFIED | Unchanged |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AIClient.probe(provider)` | `requireAIDisclosure(provider, cfg)` before HTTP | `!cfg.disclosureAcknowledged` check at line 86 | WIRED | Unchanged |
| `AIClient.invoke(req)` | `requireAIDisclosure(provider, cfg)` before HTTP | `!cfg.disclosureAcknowledged` check at line 136 | WIRED | WR-01: now `return await adapter.invoke(req)` so try/catch contracts are honoured |
| `AIDisclosureModal Continue` | `SettingsStore.setProviderConfig(disclosureAcknowledged:true)` | onContinue callback | WIRED | Unchanged |
| `probeCustom` | early-return when baseUrl empty | `if (!cfg.baseUrl)` guard at line 70 | WIRED | New in 07-07 (CR-02 fix) |
| `probeOllama` | early-return when baseUrl empty | `if (!cfg.baseUrl)` guard at line 32 | WIRED | New in 07-07 (CR-02 fix) |
| `testActiveAIConnection` | Notice + early-return when custom/ollama baseUrl empty | `cfg.baseUrl === ''` guard at lines 789-795 | WIRED | New in 07-07 (CR-02 fix, defense-in-depth) |
| `DISCLOSURE_BASE_COPY` | immutable at runtime | `Object.freeze` on outer object + both inner arrays | WIRED | New in 07-07 (WR-02 fix) |
| `test-ai-connection palette command` | `LeetCodePlugin.testActiveAIConnection()` | addCommand callback at line 350-352 | WIRED | Unchanged |
| `scripts/check-no-obsidianfetch-in-lc.sh` | LC-side dirs do not import obsidianFetch | prelint hook in package.json | WIRED | Unchanged |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/ai/AIClient.ts probe()` | `cfg` via `settings.getProviderConfig` | SettingsStore backed by plugin.loadData() | Yes — real PluginData loaded from data.json | FLOWING |
| `src/settings/SettingsTab.ts AI section` | `active` via `settings.getActiveAIProvider()` | Same SettingsStore | Yes | FLOWING |
| `src/ai/disclosure.ts` | `provider, cfg` passed from AIClient | Real runtime state from SettingsStore | Yes | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-01 primary case: `Authorization: Bearer sk-proj-abcdef` | `node -e` (replicated pattern) | `'Authorization: Bearer [REDACTED]'` — no `=[REDACTED] [REDACTED]` | PASS |
| CR-01 advisory edge case: `Authorization: Bearer` (no token) | `node -e` | `'Authorization=[REDACTED]'` — Bearer keyword silently consumed; separator mutated to `=` | ADVISORY (CR-01-A, not a blocker for original truth #4) |
| CR-01 other keys: `x-api-key: sk-proj-abc` | `node -e` | `'x-api-key=[REDACTED]'` — value redacted | PASS |
| CR-02 probeCustom empty baseUrl | Code inspection + test | `if (!cfg.baseUrl) return { ok: false, errorMessage: '...' }` at line 70; `fetcherSpy.toHaveBeenCalledTimes(0)` asserted | PASS |
| CR-02 probeOllama empty baseUrl | Code inspection + test | Mirror guard at ollama.ts:32; `fetcherSpy.toHaveBeenCalledTimes(0)` asserted | PASS |
| CR-02 main.ts guard | Code inspection + test | `cfg.baseUrl === ''` guard at lines 789-795; probe-debounce tests pass | PASS |
| WR-01 await on adapter.invoke | Code inspection at `AIClient.ts:159` | `return await adapter.invoke(req)` — await present | PASS |
| WR-02 DISCLOSURE_BASE_COPY frozen | Code inspection at `disclosure.ts:56,62,73` | `Object.freeze([...])` on both inner arrays; `Object.freeze(DISCLOSURE_BASE_COPY)` at module scope | PASS |
| LC isolation script | `bash scripts/check-no-obsidianfetch-in-lc.sh` | exit 0 | PASS |
| Full test suite | `npm test` | 925 passed, 3 skipped, 0 failed (130 test files) | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared for this phase. LC-isolation bash gate verified directly under Behavioral Spot-Checks.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AIPROV-01 | 07-01, 07-03 | Configure active AI provider (Anthropic, OpenAI, OpenRouter, Ollama, Custom) | SATISFIED | AI section in SettingsTab; 6-option dropdown; per-provider sub-form |
| AIPROV-02 | 07-01, 07-03, 07-06 | API key masked; plain-text storage disclosed in README | SATISFIED | input type='password' + .lc-ai-input; README ### Authentication present |
| AIPROV-03 | 07-04 | "Test connection" round-trip reports success or error | SATISFIED | testActiveAIConnection + palette command + Settings button; CR-02 guards prevent relative-URL crash |
| AIPROV-04 | 07-05 | Disclosure modal gates first AI call per provider | SATISFIED | Gate at AIClient.probe AND AIClient.invoke; WR-02 freeze ensures immutable copy during render |
| AIPROV-05 | 07-02 | obsidianFetch adapter for AI; LC calls never use obsidianFetch | SATISFIED | Two-layer enforcement: bash grep gate + runtime test; prelint hook |
| AIPROV-06 | 07-06 | "Clear AI key" palette command wipes active provider's key | SATISFIED | clearActiveAIKey method; active-only scope |
| AIPROV-07 | 07-06 | README enumerates all endpoints | SATISFIED | 5 AI hosts + leetcode.com + ### Authentication + ### Cost expectations |

All 7 AIPROV requirements satisfied. Coverage: 7/7.

---

### Anti-Patterns Found

No new blockers. Resolved from initial verification:

| File | Line | Pattern | Severity | Resolution |
|------|------|---------|----------|------------|
| `src/shared/logger.ts` | 51-71 | Two-pass double-replacement (CR-01) | RESOLVED | Single ordered-alternation pattern; primary Authorization: Bearer case verified clean |
| `src/ai/providers/openaiCompatible.ts` | 70-72 | Empty-baseUrl relative URL (CR-02) | RESOLVED | `if (!cfg.baseUrl)` early-return guard added |
| `src/ai/AIClient.ts` | 159 | Missing `await` on adapter.invoke (WR-01) | RESOLVED | `return await adapter.invoke(req)` |
| `src/ai/disclosure.ts` | 56,62,73 | Live mutable array shared across modal renders (WR-02) | RESOLVED | `Object.freeze` on both inner arrays and outer object |

Advisory findings from 07-07 code review (not blockers for this phase's 12 truths):

| Finding | File | Description | Impact |
|---------|------|-------------|--------|
| CR-01-A (advisory) | `src/shared/logger.ts:65-70` | `Authorization: Bearer` with no trailing token: second alternate fires, produces `Authorization=[REDACTED]` — Bearer keyword consumed as value, `:` changed to `=` | Not a security issue; no secret exposed. Degrades log readability for truncated header fragments. Fix in a future phase. |
| WR-01 (advisory) | `tests/ai/aiClient.test.ts:25-43` | `MockSettings` missing `setProviderConfig` — disclosure-gate ack path untestable at unit level | All tests bypass via `disclosureAcknowledged:true`. Integration coverage exists in probe-debounce tests. |
| WR-02 (advisory) | `src/shared/logger.ts:69` | Other auth keys (x-api-key, token, etc.) output `key=[REDACTED]` with hardcoded `=` even when original used `:` | Pre-existing asymmetry; not introduced by 07-07. No secret exposed. |
| WR-03 (advisory) | `src/main.ts:791`, `openaiCompatible.ts:70`, `ollama.ts:32` | main.ts guard uses `=== ''` (strict); provider guards use `!cfg.baseUrl` (falsy). Whitespace-only baseUrl `'   '` bypasses the main.ts Notice but produces a whitespace-prefixed URL. | No test coverage for whitespace-only case. Narrow edge; low real-world risk. |

---

### Human Verification Required

No items requiring human verification — all critical paths are verified programmatically.

---

### Gaps Summary

No gaps. All 12 original truths are verified. The two blockers from the initial verification have been fixed and confirmed:

**Gap 1 — CR-01 CLOSED** (`src/shared/logger.ts`)
The two-pass `redactString` garbling has been replaced with a single ordered-alternation pattern. Runtime execution confirms the primary case `'Authorization: Bearer sk-proj-abcdef'` now produces `'Authorization: Bearer [REDACTED]'` — no `=[REDACTED] [REDACTED]` malformation, separator preserved, Bearer keyword preserved. The 07-07 review identified one new edge case (CR-01-A: no token after Bearer) which is advisory only and does not affect the original truth.

**Gap 2 — CR-02 CLOSED** (`src/ai/providers/openaiCompatible.ts`, `ollama.ts`, `src/main.ts`)
Three-layer defense-in-depth: `probeCustom` and `probeOllama` have `if (!cfg.baseUrl)` early-return guards; `testActiveAIConnection` has a `cfg.baseUrl === ''` guard that surfaces a friendly Notice and skips all probe machinery. Tests in `probes.test.ts` assert zero fetcher calls for empty-baseUrl inputs. All pass.

**WR-01 and WR-02 CLOSED**
`return await adapter.invoke(req)` is confirmed in `AIClient.ts:159`. `Object.freeze` is confirmed on both inner arrays and the outer `DISCLOSURE_BASE_COPY` object in `disclosure.ts:56,62,73`.

Four advisory findings from the 07-07 code review are noted above but do not block phase completion — they are candidates for a targeted follow-up task.

---

_Verified: 2026-05-15T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after Plan 07-07 gap closure_
