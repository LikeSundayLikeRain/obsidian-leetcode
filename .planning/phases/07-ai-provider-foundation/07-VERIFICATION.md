---
phase: 07-ai-provider-foundation
verified: 2026-05-15T22:45:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 12/12
  gaps_closed: []
  advisory_findings_closed:
    - "CR-01-A: Authorization: Bearer (no token) now left untouched; negative lookahead (?!bearer\\b) in second alternate prevents Bearer keyword from being consumed as a value"
    - "WR-02-separator: second alternate now captures [:=] and replays it in output, so 'x-api-key: val' -> 'x-api-key: [REDACTED]' (colon preserved)"
    - "WR-03-whitespace: all three guard sites (main.ts testActiveAIConnection, probeCustom, probeOllama) use !cfg.baseUrl?.trim() — whitespace-only baseUrl rejected at all three layers"
    - "WR-01-test-gap: MockSettings exposes setProviderConfig (stateful in-memory map); 3 new disclosure-gate unit tests cover cold path, warm path, and cancel path"
  regressions: []
advisory_findings_from_07_08_review:
  - id: WR-01
    severity: warning-advisory
    description: "(?!bearer\\b) negative lookahead has an undocumented partial-match behavior when tested in isolation with /g flag — not a production issue; the full pattern context correctly blocks Bearer at position 0. Missing tests for non-authorization keys with Bearer as value (e.g., 'token: Bearer', 'cookie: BEARER')."
  - id: WR-02
    severity: warning-advisory
    description: "WR-03-whitespace guard at main.ts is production-unreachable via normal settings UI flow because sanitizeProviderConfig coerces whitespace-only baseUrl to provider default before storage. Tests exercise an injected-state-only path (makeFake bypasses setProviderConfig). Defense-in-depth is sound; the tests' coverage claim is narrower than the summary implies."
  - id: WR-03
    severity: warning-advisory
    description: "MockSettings.setProviderConfig stores cfg raw without calling sanitizeProviderConfig. Real SettingsStore sanitizes on every write. Latent trap for future test authors using non-HTTP baseUrls or null values."
  - id: IN-01
    severity: info-advisory
    description: "CR-01-A test accepts dual-contract (acceptableA OR acceptableB) but only acceptableA can ever occur at runtime. acceptableB ('Authorization: Bearer [REDACTED]') is unreachable because the first alternate requires a non-whitespace token after Bearer. Tightening the assertion to acceptableA-only would make regression detection more precise."
  - id: IN-02
    severity: info-advisory
    description: "probeCustom, probeOllama, and createOpenAICompatibleModel do not trim baseUrl after the guard — leading/trailing whitespace would be passed to the fetcher. Unreachable via SettingsStore (sanitization rejects non-http(s):// values) but reachable by direct callers. Fix: cfg.baseUrl.trim().replace(/\\/$/, '')."
---

# Phase 07: AI Provider Foundation — Verification Report (Re-verification 3)

**Phase Goal:** User can configure an AI provider (Anthropic, OpenAI, OpenRouter, Ollama, or any OpenAI-compatible endpoint), test the connection, and acknowledge a one-time data-flow disclosure before any AI call is made.
**Verified:** 2026-05-15T22:45:00Z
**Status:** passed
**Re-verification:** Yes — third pass, after advisory cleanup (Plan 07-08)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AIProvider union, ProviderConfig, AICostLedger, ProbeResult, AIRequest, AIResponse types exported from src/ai/types.ts | VERIFIED | No regression — file unchanged from V2 |
| 2 | PluginData carries activeAIProvider, providerConfigs, aiCostLedger after load with shape-guards | VERIFIED | SettingsStore unchanged; no regression |
| 3 | Malformed AI fields in data.json collapse to per-provider safe defaults — no crash | VERIFIED | 941-test suite passes (includes 13 settingsStore unit tests) |
| 4 | Logger redacts apiKey, api_key, x-api-key, bearer, authorization at object-key and value-level — clean output without double-replacement | VERIFIED | Single ordered-alternation at logger.ts:70. Node execution confirmed: `'Authorization: Bearer sk-proj-abcdef'` → `'Authorization: Bearer [REDACTED]'`. No regression. |
| 5 | obsidianFetch sets credentials:'omit' on both branches | VERIFIED | Unchanged from V2 |
| 6 | leetcode.com calls NEVER use obsidianFetch — enforced by CI grep gate AND runtime test | VERIFIED | Unchanged; scripts/check-no-obsidianfetch-in-lc.sh exits 0 |
| 7 | AIClient.probe(provider) and AIClient.invoke(req) both gate on disclosureAcknowledged BEFORE any HTTP | VERIFIED | probe() checks at line 86; invoke() checks at line 136; unchanged |
| 8 | probeCustom returns clean error when baseUrl is empty — no network call issued with a relative URL | VERIFIED | Guard at openaiCompatible.ts:75 (`!cfg.baseUrl?.trim()`); mirror at ollama.ts:37; main.ts:797-799. Tests assert fetcherSpy.toHaveBeenCalledTimes(0). |
| 9 | Three palette commands exist with clean IDs: test-ai-connection, reset-ai-disclosures, clear-ai-key | VERIFIED | All three at main.ts:350, 363, 380; unchanged |
| 10 | Disclosure modal gates both AIClient.probe AND AIClient.invoke; Continue persists disclosureAcknowledged=true | VERIFIED | Unchanged from V2 |
| 11 | Switching activeAIProvider preserves prior provider's apiKey + disclosureAcknowledged in providerConfigs map | VERIFIED | SettingsStore unchanged |
| 12 | README ## Network usage section enumerates all 5 AI provider hosts plus leetcode.com | VERIFIED | README unchanged |
| 13 | Logger preserves separator from input: `'x-api-key: val'` → `'x-api-key: [REDACTED]'`; `'x-api-key=val'` → `'x-api-key=[REDACTED]'` (no normalization to `=`) | VERIFIED | Node execution confirmed both outputs. `otherSep` captured as group 5 (`[:=]` in pattern) and replayed in replacement at logger.ts:99. Logger test Category 5 "preserves the colon separator" and "preserves the equals separator" tests pass. |
| 14 | Logger does not consume `'Bearer'` keyword as a value: `'Authorization: Bearer'` (no token) is left untouched, NEVER becomes `'Authorization=[REDACTED]'` | VERIFIED | Node execution confirmed: `redactString('Authorization: Bearer')` → `'Authorization: Bearer'` (exact identity). Negative lookahead `(?!bearer\b)` at logger.ts:70 blocks second alternate when value starts with `bearer`. CR-01-A test in Category 5 asserts `not.toContain('Authorization=[REDACTED]')` and `toContain('Bearer')` — passes. |
| 15 | All three empty-baseUrl guard sites treat whitespace-only as empty: single space, tab, mixed whitespace all rejected at main.ts testActiveAIConnection, probeCustom, probeOllama (zero fetcher invocations) | VERIFIED | All three use `!cfg.baseUrl?.trim()`. Evidence: `openaiCompatible.ts:75`, `ollama.ts:37`, `main.ts:797-799`. WR-03 tests in probe-debounce.test.ts: single-space custom (line 229) and tab-only ollama (line 246) — both assert `probe.not.toHaveBeenCalled()` and the correct Notice text. |
| 16 | MockSettings exposes setProviderConfig (stateful); aiClient.test.ts has tests covering: cold path (ack=false → setProviderConfig called with ack=true after Continue), warm path (second probe does not re-fire helper), cancel path (Cancel does not persist ack) | VERIFIED | `makeMockSettings` factory at aiClient.test.ts:48-63 uses stateful `cfgs` Map; `setProviderConfig` is `vi.fn` that writes to map and `getProviderConfig` reads from it. Cold path test at line 123 asserts `setProviderConfig` called once with `disclosureAcknowledged: true`. Warm path test at line 150 asserts `requireDisclosureMock` stays at 1 invocation across two probes. Cancel path test at line 178 asserts `setProviderConfig.toHaveBeenCalledTimes(0)`. All pass. |

**Score:** 16/16 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ai/types.ts` | AIProvider union + 5 interfaces | VERIFIED | Unchanged |
| `src/ai/AIClient.ts` | probe/invoke/addCost facade | VERIFIED | Unchanged from V2 |
| `src/ai/obsidianFetch.ts` | FetchFn factory with stream/request modes | VERIFIED | Unchanged |
| `src/ai/pricing.ts` | PRICING table + estimateCostUsd | VERIFIED | Unchanged |
| `src/ai/providers/index.ts` | resolveAdapter exhaustive switch | VERIFIED | Unchanged |
| `src/ai/providers/anthropic.ts` | createAnthropicModel + probeAnthropic | VERIFIED | Unchanged |
| `src/ai/providers/openai.ts` | createOpenAIModel + probeOpenAI | VERIFIED | Unchanged |
| `src/ai/providers/openaiCompatible.ts` | createOpenAICompatibleModel + probeOpenRouter + probeCustom | VERIFIED | Guard at line 75: `!cfg.baseUrl?.trim()` (tightened from `!cfg.baseUrl` in 07-08) |
| `src/ai/providers/ollama.ts` | createOllamaModel + probeOllama | VERIFIED | Guard at line 37: `!cfg.baseUrl?.trim()` (tightened from `!cfg.baseUrl` in 07-08) |
| `src/ai/disclosure.ts` | AIDisclosureModal + DISCLOSURE_BASE_COPY + setCta on Continue | VERIFIED | Object.freeze unchanged from V2 |
| `src/settings/SettingsStore.ts` | 3 new PluginData fields + shape-guards + getters/setters | VERIFIED | Unchanged |
| `src/shared/logger.ts` | Single ordered-alternation SECRET_VALUE_PATTERN | VERIFIED | Plan 07-08: negative lookahead `(?!bearer\b)` added; `[:=]` separator capture group added. Lines 49-70 carry comprehensive doc comments. |
| `src/main.ts` | AIClient Step 5.9 + 3 palette commands + testActiveAIConnection + requireAIDisclosure + resetAIDisclosures + clearActiveAIKey + WR-03 whitespace guard | VERIFIED | Guard at lines 797-799: `!cfg.baseUrl?.trim()` (tightened from `=== ''` in 07-08) |
| `scripts/check-no-obsidianfetch-in-lc.sh` | CI grep gate for AIPROV-05 | VERIFIED | Unchanged |
| `styles.css` | .lc-ai-input + .leetcode-ai-disclosure | VERIFIED | Unchanged |
| `README.md` | ## Network usage with all 5 AI hosts | VERIFIED | Unchanged |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AIClient.probe(provider)` | `requireAIDisclosure(provider, cfg)` before HTTP | `!cfg.disclosureAcknowledged` check at line 86 | WIRED | Unchanged |
| `AIClient.invoke(req)` | `requireAIDisclosure(provider, cfg)` before HTTP | `!cfg.disclosureAcknowledged` check at line 136 | WIRED | Unchanged |
| `AIDisclosureModal Continue` | `SettingsStore.setProviderConfig(disclosureAcknowledged:true)` | onContinue callback | WIRED | Unit-tested end-to-end via makeMockSettings stateful map |
| `probeCustom` | early-return when baseUrl empty or whitespace | `!cfg.baseUrl?.trim()` guard at line 75 | WIRED | Tightened in 07-08 |
| `probeOllama` | early-return when baseUrl empty or whitespace | `!cfg.baseUrl?.trim()` guard at line 37 | WIRED | Tightened in 07-08 |
| `testActiveAIConnection` | Notice + early-return when custom/ollama baseUrl empty or whitespace | `!cfg.baseUrl?.trim()` guard at lines 797-799 | WIRED | Tightened in 07-08 |
| `DISCLOSURE_BASE_COPY` | immutable at runtime | `Object.freeze` on outer object + both inner arrays | WIRED | Unchanged from V2 |
| `test-ai-connection palette command` | `LeetCodePlugin.testActiveAIConnection()` | addCommand callback at line 350-352 | WIRED | Unchanged |
| `scripts/check-no-obsidianfetch-in-lc.sh` | LC-side dirs do not import obsidianFetch | prelint hook in package.json | WIRED | Unchanged |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/ai/AIClient.ts probe()` | `cfg` via `settings.getProviderConfig` | SettingsStore backed by plugin.loadData() | Yes | FLOWING |
| `src/settings/SettingsTab.ts AI section` | `active` via `settings.getActiveAIProvider()` | Same SettingsStore | Yes | FLOWING |
| `src/ai/disclosure.ts` | `provider, cfg` passed from AIClient | Real runtime state from SettingsStore | Yes | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| T13: `'x-api-key: val'` separator preserved | `node -e` with replicated pattern | `'x-api-key: [REDACTED]'` — colon preserved | PASS |
| T13: `'x-api-key=val'` separator preserved | `node -e` with replicated pattern | `'x-api-key=[REDACTED]'` — equals preserved | PASS |
| T14: `'Authorization: Bearer'` untouched | `node -e` with replicated pattern | `'Authorization: Bearer'` — exact identity; lookahead blocks second alternate | PASS |
| T14: `'Authorization: Bearer sk-proj-abc'` redacted | `node -e` with replicated pattern | `'Authorization: Bearer [REDACTED]'` — primary case unchanged | PASS |
| T15: WR-03 whitespace test (custom, `' '`) | probe-debounce test at line 225 | Notice fired; `probe.not.toHaveBeenCalled()` | PASS |
| T15: WR-03 whitespace test (ollama, `'\t'`) | probe-debounce test at line 242 | Notice fired; `probe.not.toHaveBeenCalled()` | PASS |
| T16: disclosure cold path — setProviderConfig called with ack=true | aiClient.test.ts line 123 | `setProviderConfig` called once with `disclosureAcknowledged: true` | PASS |
| T16: disclosure warm path — second probe skips helper | aiClient.test.ts line 150 | `requireDisclosureMock` stays at 1; `probeAdapter` called twice | PASS |
| T16: disclosure cancel path — setProviderConfig not called | aiClient.test.ts line 178 | `setProviderConfig.toHaveBeenCalledTimes(0)` | PASS |
| LC isolation script | `bash scripts/check-no-obsidianfetch-in-lc.sh` | exit 0 | PASS |
| Full test suite | `npm test` | **941 passed, 3 skipped, 0 failed** (130 test files, up from 925 in V2 — delta = 16 new advisory-fix tests) | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared for this phase. LC-isolation bash gate verified directly under Behavioral Spot-Checks.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AIPROV-01 | 07-01, 07-03 | Configure active AI provider (Anthropic, OpenAI, OpenRouter, Ollama, Custom) | SATISFIED | AI section in SettingsTab; 6-option dropdown; per-provider sub-form |
| AIPROV-02 | 07-01, 07-03, 07-06 | API key masked; plain-text storage disclosed in README | SATISFIED | input type='password' + .lc-ai-input; README ### Authentication present |
| AIPROV-03 | 07-04 | "Test connection" round-trip reports success or error | SATISFIED | testActiveAIConnection + palette command + Settings button; WR-03 guards prevent whitespace-URL confusion |
| AIPROV-04 | 07-05 | Disclosure modal gates first AI call per provider | SATISFIED | Gate at AIClient.probe AND AIClient.invoke; all three disclosure-path branches unit-tested (T16) |
| AIPROV-05 | 07-02 | obsidianFetch adapter for AI; LC calls never use obsidianFetch | SATISFIED | Two-layer enforcement: bash grep gate + runtime test; prelint hook |
| AIPROV-06 | 07-06 | "Clear AI key" palette command wipes active provider's key | SATISFIED | clearActiveAIKey method; active-only scope |
| AIPROV-07 | 07-06 | README enumerates all endpoints | SATISFIED | 5 AI hosts + leetcode.com + ### Authentication + ### Cost expectations |

All 7 AIPROV requirements satisfied. Coverage: 7/7.

---

### Anti-Patterns Found

No blockers or new warnings introduced by 07-08. All four advisory findings from 07-07 review are now closed:

| File | Line | Finding | Resolution in 07-08 |
|------|------|---------|---------------------|
| `src/shared/logger.ts` | 70 | CR-01-A: Bearer-no-token consumed by second alternate | `(?!bearer\b)` negative lookahead added; input now left untouched |
| `src/shared/logger.ts` | 99 | WR-02-separator: hardcoded `=` output separator | `[:=]` captured as group 5; replayed via `otherSep` in replacement |
| `src/main.ts` | 797-799 | WR-03-whitespace: strict `=== ''` guard | Tightened to `!cfg.baseUrl?.trim()` |
| `src/ai/providers/openaiCompatible.ts` | 75 | WR-03-whitespace: falsy `!cfg.baseUrl` guard | Tightened to `!cfg.baseUrl?.trim()` |
| `src/ai/providers/ollama.ts` | 37 | WR-03-whitespace: falsy `!cfg.baseUrl` guard | Tightened to `!cfg.baseUrl?.trim()` |
| `tests/ai/aiClient.test.ts` | 48-200 | WR-01-test-gap: MockSettings missing setProviderConfig | `makeMockSettings` factory with stateful map; 3 new disclosure-gate unit tests |

Advisory findings from 07-08 code review (not blockers; no action required for phase completion):

| Finding | File | Description | Impact |
|---------|------|-------------|--------|
| WR-01 (advisory) | `src/shared/logger.ts:70` | Lookahead partial-match behavior untested for non-authorization keys with `Bearer` value (e.g., `'token: Bearer'`). The existing pattern is correct; missing test coverage for this edge. | No production defect; test gap only. |
| WR-02 (advisory) | `src/main.ts:797-804`, `tests/ai/probe-debounce.test.ts:225-257` | WR-03 guard in main.ts is production-unreachable via SettingsStore UI flow (sanitizeProviderConfig normalizes whitespace baseUrl to provider default). Tests exercise injected-state-only path. | Defense-in-depth is sound; test coverage claim is narrower than summary implies. No user-visible bug. |
| WR-03 (advisory) | `tests/ai/aiClient.test.ts:53-63` | MockSettings stores cfg raw without sanitizeProviderConfig. Latent divergence from real SettingsStore for future test authors using edge-case baseUrl values. | No current test incorrectly passes; latent trap only. |
| IN-01 (info) | `tests/shared/logger.test.ts:189-203` | CR-01-A test accepts dual-contract (acceptableA OR acceptableB) but only acceptableA is reachable at runtime. acceptableB (`Authorization: Bearer [REDACTED]`) cannot occur for no-token input. | Documentation/precision issue; hard contract (`not.toContain('Authorization=[REDACTED]')`) is correct and sufficient. |
| IN-02 (info) | `src/ai/providers/openaiCompatible.ts:79`, `ollama.ts:41` | probeCustom/probeOllama do not trim baseUrl before URL construction — leading/trailing whitespace would survive into the fetcher URL. Unreachable via SettingsStore but reachable by direct callers. | No user-visible bug today. |

---

### Human Verification Required

No items requiring human verification — all critical paths are verified programmatically.

---

### Gaps Summary

No gaps. All 16 truths (12 original + 4 new advisory-fix truths) are verified. The four advisory findings from the 07-07 code review are confirmed closed by Plan 07-08:

**Advisory CR-01-A CLOSED** (`src/shared/logger.ts:70`)
Negative lookahead `(?!bearer\b)` in the second alternate's value position. Runtime execution confirms `redactString('Authorization: Bearer')` returns `'Authorization: Bearer'` exactly — the Bearer keyword is never consumed as a secret value. The `/i` flag makes the lookahead case-insensitive.

**Advisory WR-02-separator CLOSED** (`src/shared/logger.ts:99`)
Second alternate now captures `[:=]` as group 5 (`otherSep`) and replays it in output: `'x-api-key: val'` → `'x-api-key: [REDACTED]'`, `'x-api-key=val'` → `'x-api-key=[REDACTED]'`. Both confirmed by Node.js execution.

**Advisory WR-03-whitespace CLOSED** (`main.ts:797-799`, `openaiCompatible.ts:75`, `ollama.ts:37`)
All three guard sites now use `!cfg.baseUrl?.trim()`. Whitespace-only inputs (`' '`, `'\t'`) produce a Notice and zero fetcher invocations — confirmed by two new probe-debounce tests.

**Advisory WR-01-test-gap CLOSED** (`tests/ai/aiClient.test.ts:48-200`)
`makeMockSettings` factory exposes stateful `setProviderConfig`. Three new tests cover the cold path (ack=false → Continue → setProviderConfig called with ack=true), the warm path (second probe reads ack=true from map, skips helper), and the cancel path (Cancel → setProviderConfig not called). All pass.

Five advisory findings from the 07-08 code review are noted above but do not block phase completion — they are candidates for a future targeted cleanup task.

---

_Verified: 2026-05-15T22:45:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification 3 — after Plan 07-08 advisory cleanup_
