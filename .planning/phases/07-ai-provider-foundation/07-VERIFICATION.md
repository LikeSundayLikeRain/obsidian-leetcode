---
phase: 07-ai-provider-foundation
verified: 2026-05-16T21:30:00Z
status: gaps_found
score: 10/12 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Logger redactString does not garble log output — 'Authorization: Bearer sk-xyz' redacts cleanly without double-replacement"
    status: failed
    reason: "CR-01 confirmed by runtime execution. The two-pass replace in redactString produces malformed output: BEARER_VALUE_PATTERN converts 'Authorization: Bearer sk-proj-abc' to 'Authorization: Bearer [REDACTED]'; then SECRET_VALUE_PATTERN's 'authorization' alternate matches 'authorization: Bearer' and rewrites it to 'Authorization=[REDACTED] [REDACTED]' — changing ':' to '=' and leaving a dangling '[REDACTED]' token. Secret is protected but the output is garbled. Verified by node execution: input='Authorization: Bearer sk-proj-abcdef', step1='Authorization: Bearer [REDACTED]', step2='Authorization=[REDACTED] [REDACTED]'."
    artifacts:
      - path: "src/shared/logger.ts"
        issue: "redactString two-pass replace: BEARER_VALUE_PATTERN runs first (line 48), then SECRET_VALUE_PATTERN (line 49) re-consumes 'Bearer' as a value after the first pass already replaced the token, producing garbled ':' → '=' conversion and dangling [REDACTED]"
    missing:
      - "Fix redactString to avoid double-replacement: either exclude '[' from the value character class in SECRET_VALUE_PATTERN so already-redacted '[REDACTED]' tokens are never re-consumed, OR replace the two-pass approach with a single ordered alternation pattern as described in CR-01"

  - truth: "probeCustom returns a clean error when baseUrl is empty — no network call issued with a relative URL"
    status: failed
    reason: "CR-02 confirmed by runtime execution. When activeProvider='custom' and baseUrl='' (the default for newly-selected custom provider), probeCustom executes cfg.baseUrl.replace(/\\/$/, '') = '' and fetches '/models' — a relative URL. requestUrl({url: '/models', ...}) will throw or produce a nonsensical response. The testActiveAIConnection guard in main.ts (line 776) only blocks on empty apiKey for anthropic/openai/openrouter; it does NOT block on empty baseUrl for custom or ollama. A user who selects 'Custom' and immediately clicks 'Test connection' before entering a URL triggers this path."
    artifacts:
      - path: "src/ai/providers/openaiCompatible.ts"
        issue: "probeCustom at line 64: 'const baseUrl = cfg.baseUrl.replace(/\\/$/, '')' produces '' when cfg.baseUrl is ''. The subsequent fetch call at line 67 becomes fetcher('/models', ...) — a relative URL that requestUrl cannot handle correctly."
    missing:
      - "Add an early-return guard in probeCustom: if (!cfg.baseUrl) return { ok: false, errorMessage: 'Base URL is required for Custom provider.' }"
      - "Consider mirroring this guard in probeOllama (same empty-string path for Ollama if baseUrl is cleared) and/or in testActiveAIConnection in main.ts"
---

# Phase 07: AI Provider Foundation — Verification Report

**Phase Goal:** User can configure an AI provider (Anthropic, OpenAI, OpenRouter, Ollama, or any OpenAI-compatible endpoint), test the connection, and acknowledge a one-time data-flow disclosure before any AI call is made.
**Verified:** 2026-05-16T21:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AIProvider union, ProviderConfig, AICostLedger, ProbeResult, AIRequest, AIResponse types exported from src/ai/types.ts | VERIFIED | File exists; all 6 types confirmed present at lines 14, 21, 34, 46, 61, 72 |
| 2 | PluginData carries activeAIProvider, providerConfigs, aiCostLedger after load with shape-guards | VERIFIED | SettingsStore has 36 occurrences of AI field names; isValidProviderId, sanitizeProviderConfig, sanitizeAICostLedger all present |
| 3 | Malformed AI fields in data.json collapse to per-provider safe defaults — no crash | VERIFIED | 13 settingsStore unit tests pass covering malformed apiKey, non-https baseUrl, malformed ledger date, negative usdToday |
| 4 | Logger redacts apiKey, api_key, x-api-key, bearer, authorization at object-key and value-level | FAILED (CR-01) | BEARER_VALUE_PATTERN + SECRET_VALUE_PATTERN double-replacement produces garbled output for Authorization: Bearer strings. Confirmed by runtime execution: 'Authorization: Bearer sk-proj-abc' → 'Authorization=[REDACTED] [REDACTED]'. Secret is protected but output is malformed. |
| 5 | obsidianFetch sets credentials:'omit' on both branches | VERIFIED | Stream branch: safeInit with credentials:'omit' at line 83. Request branch: documented + structurally impossible at lines 99-105. 6 occurrences of credentials:'omit' in file. |
| 6 | leetcode.com calls NEVER use obsidianFetch — enforced by CI grep gate AND runtime test | VERIFIED | scripts/check-no-obsidianfetch-in-lc.sh exists, passes (exit 0 confirmed). tests/ai/lc-isolation.test.ts exists with 4 tests. prelint hook wired in package.json. |
| 7 | AIClient.probe(provider) and AIClient.invoke(req) both gate on disclosureAcknowledged BEFORE any HTTP | VERIFIED | probe() checks !cfg.disclosureAcknowledged at line 86; invoke() checks at line 136. Both consult flag before any HTTP call. Gate is at AIClient boundary, not call site. |
| 8 | probeCustom returns clean error when baseUrl is empty | FAILED (CR-02) | No early-return guard in probeCustom for empty baseUrl. cfg.baseUrl.replace(/\/$/, '') → ''; fetch('/models', ...) is a relative URL. testActiveAIConnection guard only blocks empty apiKey for cloud providers, not empty baseUrl for custom/ollama. Confirmed by runtime execution. |
| 9 | Three palette commands exist with clean IDs: test-ai-connection, reset-ai-disclosures, clear-ai-key | VERIFIED | All three confirmed in src/main.ts at lines 350, 363, 380. No 'obsidian' prefix, no 'command' substring, no hotkeys. |
| 10 | Disclosure modal gates both AIClient.probe AND AIClient.invoke; Continue persists disclosureAcknowledged=true | VERIFIED | AIClient.probe wraps disclosure check at lines 86-99; AIClient.invoke wraps at lines 136-145. Continue path calls setProviderConfig with disclosureAcknowledged:true. Cancel returns {ok:false,errorMessage:'AI call cancelled'} from probe; throws Error('AI call cancelled') from invoke. |
| 11 | Switching activeAIProvider preserves prior provider's apiKey + disclosureAcknowledged in providerConfigs map | VERIFIED | SettingsStore.setActiveAIProvider changes only activeAIProvider field; setProviderConfig writes only the specified provider entry. Asserted by unit test. |
| 12 | README ## Network usage section enumerates all 5 AI provider hosts plus leetcode.com | VERIFIED | All 5 hosts present: api.anthropic.com (line 70), api.openai.com (line 71), openrouter.ai (line 72), localhost:11434 (line 73), Custom endpoint. leetcode.com present. ### Authentication and ### Cost expectations subsections present. No telemetry disclaimer present. 16 CI substring assertions pass. |

**Score:** 10/12 truths verified (2 blocked by CR-01 and CR-02)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ai/types.ts` | AIProvider union + 5 interfaces | VERIFIED | All 6 exports present |
| `src/ai/AIClient.ts` | probe/invoke/addCost facade | VERIFIED | All 3 methods; disclosure gate wired in both probe and invoke |
| `src/ai/obsidianFetch.ts` | FetchFn factory with stream/request modes | VERIFIED | Both branches present; credentials:'omit' in stream branch |
| `src/ai/pricing.ts` | PRICING table + estimateCostUsd | VERIFIED | 4 entries including dot-not-dash OpenRouter slug |
| `src/ai/providers/index.ts` | resolveAdapter exhaustive switch | VERIFIED | switch(provider) present |
| `src/ai/providers/anthropic.ts` | createAnthropicModel + probeAnthropic | VERIFIED | createAnthropic call present |
| `src/ai/providers/openai.ts` | createOpenAIModel + probeOpenAI | VERIFIED | createOpenAI call present |
| `src/ai/providers/openaiCompatible.ts` | createOpenAICompatibleModel + probeOpenRouter + probeCustom | STUB (CR-02) | probeCustom missing empty-baseUrl guard |
| `src/ai/providers/ollama.ts` | createOllamaModel + probeOllama | VERIFIED | /api/tags present |
| `src/ai/disclosure.ts` | AIDisclosureModal + DISCLOSURE_BASE_COPY + setCta on Continue | VERIFIED | Modal renders verbatim copy; setCta on Continue only; two-flag double-fire guard |
| `src/settings/SettingsStore.ts` | 3 new PluginData fields + shape-guards + getters/setters | VERIFIED | 36 AI-related occurrences |
| `src/shared/logger.ts` | Extended REDACT + SECRET_VALUE_PATTERN | PARTIAL (CR-01) | Regexes extended but two-pass produce garbled output |
| `src/main.ts` | AIClient Step 5.9 + 3 palette commands + testActiveAIConnection + requireAIDisclosure + resetAIDisclosures + clearActiveAIKey | VERIFIED | All methods and commands present |
| `scripts/check-no-obsidianfetch-in-lc.sh` | CI grep gate for AIPROV-05 | VERIFIED | Exists, executable, passes on clean tree |
| `styles.css` | .lc-ai-input + .leetcode-ai-disclosure | VERIFIED | Both classes present |
| `README.md` | ## Network usage with all 5 AI hosts | VERIFIED | All 5 hosts enumerated; ### Authentication + ### Cost expectations present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AIClient.probe(provider)` | `requireAIDisclosure(provider, cfg)` before HTTP | `!cfg.disclosureAcknowledged` check at line 86 | WIRED | Returns `{ok:false,errorMessage:'AI call cancelled'}` on Cancel |
| `AIClient.invoke(req)` | `requireAIDisclosure(provider, cfg)` before HTTP | `!cfg.disclosureAcknowledged` check at line 136 | WIRED | Throws `Error('AI call cancelled')` on Cancel |
| `AIDisclosureModal Continue` | `SettingsStore.setProviderConfig(disclosureAcknowledged:true)` | onContinue callback → AIClient.probe persists | WIRED | Re-reads cfg after persist |
| `test-ai-connection palette command` | `LeetCodePlugin.testActiveAIConnection()` | addCommand callback at line 350-352 | WIRED | Shared method with Settings button |
| `Settings Test connection button` | `LeetCodePlugin.testActiveAIConnection()` | onClick at SettingsTab; confirmed by settingsTab tests | WIRED | Button-label flip + disable in try/finally |
| `reset-ai-disclosures palette command` | `LeetCodePlugin.resetAIDisclosures()` | addCommand callback at line 363-365 | WIRED | Iterates all 5 providers |
| `clear-ai-key palette command` | `LeetCodePlugin.clearActiveAIKey()` | addCommand callback at line 380-382 | WIRED | Active-only scope |
| `obsidianFetch (both branches)` | `credentials: 'omit'` | stream branch: safeInit spread; request branch: documented structural impossibility | WIRED | Both branches enforce the cookie-leak mitigation |
| `scripts/check-no-obsidianfetch-in-lc.sh` | LC-side dirs do not import obsidianFetch | prelint hook in package.json | WIRED | Exit 0 verified at runtime |
| `LeetCodePlugin.onload Step 5.9` | `new AIClient(this.settings, requireDisclosure)` | Confirmed at main.ts line 270-272 | WIRED | Disclosure helper injected at construction |

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
| logger double-replacement bug | `node -e "..."` (runtime trace) | 'Authorization: Bearer sk-proj-abcdef' → 'Authorization=[REDACTED] [REDACTED]' | FAIL (CR-01 confirmed) |
| probeCustom empty baseUrl produces relative URL | `node -e "..."` (runtime trace) | ''.replace(/\/$/, '') + '/models' = '/models' | FAIL (CR-02 confirmed) |
| LC isolation script | `bash scripts/check-no-obsidianfetch-in-lc.sh` | exit 0 | PASS |
| All 157 AI suite tests | `npx vitest run tests/ai/` | 157 passed, 0 failed (20 files) | PASS |
| WR-01 missing await on adapter.invoke | `node -e "..."` (async try/catch behavior) | `return promise` without await does NOT trigger surrounding catch | CONFIRMED (warning) |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared for this phase. LC-isolation bash gate verified directly under Behavioral Spot-Checks.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AIPROV-01 | 07-01, 07-03 | Configure active AI provider from Settings (Anthropic, OpenAI, OpenRouter, Ollama, Custom) | SATISFIED | AI section in SettingsTab; 6-option dropdown; per-provider sub-form |
| AIPROV-02 | 07-01, 07-03, 07-06 | API key masked; plain-text storage disclosed in README | SATISFIED | input type='password' + .lc-ai-input; README ### Authentication present |
| AIPROV-03 | 07-04 | "Test connection" round-trip reports success or error | SATISFIED | testActiveAIConnection method + palette command + Settings button wired |
| AIPROV-04 | 07-05 | Disclosure modal gates first AI call per provider; acknowledged before call proceeds | SATISFIED | Gate at AIClient.probe AND AIClient.invoke; Continue persists flag; switching provider re-fires gate |
| AIPROV-05 | 07-02 | obsidianFetch adapter for AI; LC calls never use obsidianFetch | SATISFIED | Two-layer enforcement: bash grep gate + runtime test; prelint hook |
| AIPROV-06 | 07-06 | "Clear AI key" palette command wipes active provider's key | SATISFIED | clearActiveAIKey method; active-only scope; other providers/fields preserved |
| AIPROV-07 | 07-06 | README enumerates all endpoints | SATISFIED | 5 AI hosts + leetcode.com + No telemetry disclaimer; 16 CI substring assertions |

All 7 AIPROV requirements are satisfied at the feature level. Requirements coverage is 7/7. Two blocker gaps (CR-01, CR-02) affect correctness/security of the shipped implementation but do not affect requirement satisfaction at the behavioral level — the logger still redacts secrets (garbled output is not a secret leak), and Test connection still works for all non-empty-baseUrl configurations.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/shared/logger.ts` | 48-49 | Double-replacement in redactString: BEARER_VALUE_PATTERN followed by SECRET_VALUE_PATTERN re-consumes 'Bearer' as a value, producing garbled 'key=[REDACTED] [REDACTED]' output | BLOCKER | Log output for Authorization headers is malformed — `:` changed to `=` and a dangling `[REDACTED]` token appears. Secret is protected but debuggability is degraded. CR-01. |
| `src/ai/providers/openaiCompatible.ts` | 64, 67 | probeCustom issues network call with empty baseUrl — relative URL '/models' formed when cfg.baseUrl is '' | BLOCKER | requestUrl({url: '/models'}) will throw or return a nonsensical response. Reachable on first click of Test connection after selecting Custom provider. CR-02. |
| `src/ai/AIClient.ts` | 150 | `return adapter.invoke(req)` without `await` in async function — rejections from adapter.invoke bypass the surrounding try/catch | WARNING | invoke() promises to re-throw adapter errors but the missing `await` means try/catch does not catch them; they propagate as unhandled rejections. Confirmed by runtime test. WR-01. |
| `src/ai/disclosure.ts` | 115, 122 | DISCLOSURE_BASE_COPY.willSend / neverSends iterated directly — live reference, not snapshot | WARNING | If Phase 08/09 mutates the array while a modal is open, the in-flight render sees mid-mutation state. WR-02. |

---

### Human Verification Required

No items requiring human verification — all critical paths are verified programmatically.

---

### Gaps Summary

Two blockers prevent complete goal achievement:

**Gap 1 — CR-01: Logger double-replacement** (`src/shared/logger.ts`)
The two-pass `redactString` function garbles `Authorization: Bearer <token>` log lines. After BEARER_VALUE_PATTERN converts the value to `[REDACTED]`, SECRET_VALUE_PATTERN's `authorization` alternate matches `authorization: Bearer` and rewrites the header as `authorization=[REDACTED] [REDACTED]` — changing the `:` separator to `=` and appending a second `[REDACTED]` token. The secret is never exposed, but the malformed output violates the stated intent ("both the Bearer keyword's value AND the surrounding header name redact, with no secret survival") and degrades debuggability for every AI provider error that embeds an Authorization header. Fix: exclude `[` from SECRET_VALUE_PATTERN's value character class (`[^\s;,"'&}\]\[]+`) so already-placed `[REDACTED]` tokens are never re-consumed by the second pass.

**Gap 2 — CR-02: probeCustom empty-baseUrl crash** (`src/ai/providers/openaiCompatible.ts`)
When a user selects the Custom provider and immediately clicks Test connection before entering a Base URL, `probeCustom` constructs the fetch URL as `'' + '/models' = '/models'` — a relative URL that `requestUrl` cannot handle. The `testActiveAIConnection` guard in `main.ts` only checks for empty `apiKey` on cloud providers; there is no guard for empty `baseUrl` on Custom (or Ollama). Fix: add `if (!cfg.baseUrl) return { ok: false, errorMessage: 'Base URL is required for Custom provider.' }` at the top of `probeCustom`.

One warning is also confirmed:

**Warning — WR-01: Missing `await` on `adapter.invoke`** (`src/ai/AIClient.ts:150`)
`invoke()` is documented to re-throw adapter errors so Phase 08 callers can branch on error type. However, `return adapter.invoke(req)` without `await` means the surrounding `try/catch` does not catch adapter rejections — they propagate as unhandled rejections. Confirmed by runtime execution: `return Promise.reject(new Error('x'))` inside a try block does NOT trigger the catch. Fix: `return await adapter.invoke(req)`. This is a warning (not a blocker) because Phase 08 is not yet wired; the Phase 08 stub always throws immediately, and callers will receive a rejected promise that they can still `.catch()` — the issue is the broken documentation contract and potential for subtle Phase 08 integration bugs.

---

_Verified: 2026-05-16T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
