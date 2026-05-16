---
phase: 07-ai-provider-foundation
plan: 04
subsystem: ai-test-connection
tags: [ai, test-connection, probe-matrix, debounce, notices, palette-command]
requires:
  - ai-types-module
  - settings-store-ai-fields
  - obsidianfetch-fetchfn-factory
  - aiclient-facade
  - per-provider-adapter-pattern
  - aiclient-on-plugin-instance
  - settingstab-ai-section
provides:
  - testActiveAIConnection-method
  - test-ai-connection-palette-command
  - prettyName-types-export
  - probe-debounce-inflight-map
  - probe-matrix-test-suite
affects:
  - src/main.ts
  - src/ai/types.ts
  - src/settings/SettingsTab.ts
  - tests/ai/probe-debounce.test.ts
  - tests/ai/probe-anthropic.test.ts
  - tests/ai/probe-openai.test.ts
  - tests/ai/probe-openrouter.test.ts
  - tests/ai/probe-ollama.test.ts
  - tests/ai/probe-custom-fallback.test.ts
  - tests/ai/probe-error-extraction.test.ts
  - tests/ai/probes.test.ts
  - tests/ai/settingsTab.test.ts
tech-stack:
  added: []
  patterns:
    - shared-probe-entry-point-across-button-and-palette
    - inflight-map-keyed-by-provider-for-debounce
    - empty-key-guard-anthropic-openai-openrouter-only
    - prettyName-single-source-of-truth
    - 200-char-combined-prefix-vendor-message-truncation
    - vi-mock-ai-package-for-anthropic-and-custom-fallback-tests
    - obsidian-stub-shared-helper-for-main-importing-tests
key-files:
  created:
    - tests/ai/probe-debounce.test.ts
    - tests/ai/probe-anthropic.test.ts
    - tests/ai/probe-openai.test.ts
    - tests/ai/probe-openrouter.test.ts
    - tests/ai/probe-ollama.test.ts
    - tests/ai/probe-custom-fallback.test.ts
    - tests/ai/probe-error-extraction.test.ts
    - tests/ai/probes.test.ts
  modified:
    - src/main.ts
    - src/ai/types.ts
    - src/settings/SettingsTab.ts
    - tests/ai/settingsTab.test.ts
key-decisions:
  - "prettyName moved from SettingsTab.ts module-private helper to src/ai/types.ts named export — single source of truth for the verbatim brand strings (Anthropic / OpenAI / OpenRouter / Ollama / Custom (OpenAI-compatible)) consumed by both the Settings sub-form AND the Notice copy in main.ts"
  - "aiProbeInflight is a Map<AIProvider, Promise<ProbeResult>> on the LeetCodePlugin instance (not a global); single-in-flight gate per provider is local to one plugin install — concurrent clicks from Settings + palette dedupe through the same Map because both surfaces call testActiveAIConnection()"
  - "Empty-key guard fires ONLY for anthropic/openai/openrouter — Ollama and Custom may legitimately have empty keys (default Ollama install + no-auth Custom backends) so they fall through to probe; locked by 6 separate test cases in probe-debounce.test.ts"
  - "Settings button onClick wraps the testActiveAIConnection() call in try/finally with button-label flip to 'Testing...' + setDisabled(true); palette command does NOT flip a label (the Notice IS the feedback) — the debounce Map handles cross-surface concurrency"
  - "All Notice copy verbatim from 07-UI-SPEC §'Notice copy': no-provider 'Pick an AI provider first.' (3000ms), empty-key 'Enter an API key for {brand} first.' (3000ms), success-with-count 'AI provider connection OK ({brand}, {N} models available)' (4000ms), Anthropic-only 'AI provider connection OK (Anthropic)' (4000ms), Ollama-zero 'Ollama reachable, 0 models installed — run `ollama pull llama3.2`' (6000ms), failure '{brand}: {vendor message}' truncated to 200 chars TOTAL (6000ms)"
  - "tests/ai/probe-debounce.test.ts uses vi.mock('obsidian', ...) with the project-wide tests/helpers/obsidian-stub fallback so dynamic import('../../src/main') succeeds — main.ts pulls FilterModal -> obsidian.Modal at module evaluation; a bare-bones mock missing Modal trips an unhandled rejection during the second test case onward"
  - "Concurrent-debounce test pre-resolves the LeetCodePlugin import outside the in-flight window so two prototype-method calls fire synchronously; otherwise both p1 and p2 await the same dynamic import and neither has reached the probe() call site by the time the test attempts to resolve the unresolved-probe promise"
  - "tests/ai/settingsTab.test.ts test 6 updated from 'placeholder Notice with Plan 07-04 marker' to 'plugin.testActiveAIConnection has been called once' — the wiring is now functional, so the test must assert the new behavior; setDisabled added to the mock ButtonApi so the button-label flip path doesn't crash"
patterns-established:
  - "Shared probe entry point: any future surface (palette command, ribbon button, command-line affordance) that needs to test AI connectivity invokes plugin.testActiveAIConnection() — never duplicate the empty-state guards or in-flight Map locally"
  - "prettyName lives in src/ai/types.ts: any code that surfaces a provider name to the user MUST import this helper rather than declaring its own switch — locks brand consistency across Settings, Notice, modal, and future Phase 08+ feature surfaces"
  - "Per-provider probe tests use vi.fn<FetchFn>() injected directly (no module mock) — keeps the seam clean and the assertions on call args (URL, headers, method) explicit. Anthropic + Custom-fallback are the only files that vi.mock the 'ai' package because they exercise the SDK's generateText path"
requirements-completed: [AIPROV-03]

# Metrics
duration: 32min
completed: 2026-05-16
---

# Phase 07 Plan 04: Test Connection Probe Wiring Summary

**Wires the Settings "Test connection" button + new `test-ai-connection` palette command to AIClient.probe via a shared plugin method with single-in-flight debouncing per provider; ships 51 new probe-matrix tests locking every provider's HTTP/SDK shape and Notice copy verbatim.**

## Performance

- **Duration:** ~32 min
- **Tasks:** 2 (Task 1: wiring + debounce; Task 2: probe-matrix tests)
- **Files created:** 8 test files
- **Files modified:** 4 (main.ts, types.ts, SettingsTab.ts, settingsTab.test.ts)

## Accomplishments

1. **`LeetCodePlugin.testActiveAIConnection()` method (main.ts):** single shared probe entry point used by the Settings button onClick AND the new palette command. Reads activeAIProvider, applies empty-key guard for Anthropic/OpenAI/OpenRouter, debounces via `aiProbeInflight: Map<AIProvider, Promise<ProbeResult>>`, awaits `aiClient.probe(provider)`, fires Notice copy per the 07-UI-SPEC matrix (no-provider / empty-key / success-with-count / Anthropic-no-count / Ollama-zero-models / failure-truncated-to-200-chars).
2. **Palette command `test-ai-connection`:** sentence-case name 'Test AI connection', no plugin-id prefix, no 'command' substring, no hotkey — passes eslint-plugin-obsidianmd commands/no-* family. Callback delegates to the shared `testActiveAIConnection()` method.
3. **Settings button wired (SettingsTab.ts):** Plan 07-03's placeholder onClick (which fired a Notice with text 'Test connection: wiring lands in Plan 07-04') is replaced with a try/finally wrapper that flips the button label to 'Testing...', disables it, awaits `this.plugin.testActiveAIConnection()`, then restores. The strings 'Plan 07-04' and 'Test connection: wiring lands in...' are completely removed from the Settings file.
4. **`prettyName` exported from src/ai/types.ts:** single source of truth for the verbatim brand display names. SettingsTab.ts deletes its local copy and imports the shared helper. main.ts imports the same helper for Notice copy. Both surfaces now render identical brand strings.
5. **51 new tests across 8 files** locking every probe shape + every Notice branch + the in-flight Map dedup contract.

## Task Commits

1. **Task 1: testActiveAIConnection + palette + Settings wiring** — `0ad5a33` (feat)
2. **Task 2: per-provider probe matrix tests** — `a29e9a4` (test)
3. **Plan metadata commit (this SUMMARY + STATE updates)** — pending

## Files Created/Modified

### Created (Task 2 + Task 1 test scaffold)

- `tests/ai/probe-debounce.test.ts` — 12 tests: every Notice branch, empty-key matrix (5 cases), in-flight Map dedup + cleanup, modelCount → Notice text mapping, 200-char truncation.
- `tests/ai/probe-openai.test.ts` — 6 tests: GET /models + Bearer; 200 modelCount; 401 vendor message; 200-char truncation; 5xx plain-text body; trailing-slash baseUrl.
- `tests/ai/probe-openrouter.test.ts` — 3 tests: GET /models with NO Authorization; 200 modelCount; non-OK errorMessage.
- `tests/ai/probe-ollama.test.ts` — 7 tests: /v1, /v1/, bare host all collapse to /api/tags; modelCount from json.models[]; 0 fallback when missing/empty; HTTP 503 reachability; network-throw this-host.
- `tests/ai/probe-anthropic.test.ts` — 3 tests: generateText shape (prompt 'ping' + maxOutputTokens 1) + modelCount null on success; SDK throw → errorMessage; 200-char truncation.
- `tests/ai/probe-custom-fallback.test.ts` — 7 tests: 200 returns count without fallback; 404/405/501 trigger 1-token chat fallback; 500/401 surface errors verbatim WITHOUT fallback; chat-fallback failure path.
- `tests/ai/probe-error-extraction.test.ts` — 9 tests: OpenAI / Anthropic / { error: string } / top-level message envelopes; raw-body 200-char truncation on JSON parse failure; valid-JSON-no-shape fallback; Error / string / unknown inputs to extractProviderError.
- `tests/ai/probes.test.ts` — 5 tests: cross-provider integration roll-up — every probe returns ok=true on a happy path with a mock fetcher.

### Modified

- `src/main.ts` — Imports `prettyName`, `AIProvider`, `ProbeResult`. Adds `aiProbeInflight: Map<AIProvider, Promise<ProbeResult>>` field. Adds `testActiveAIConnection(): Promise<void>` method. Adds palette command in onload Step 6c.
- `src/ai/types.ts` — Adds `prettyName(p: AIProvider): string` exported function (single source of truth for brand display names, replacing the local copy in SettingsTab.ts).
- `src/settings/SettingsTab.ts` — Imports `prettyName` from `../ai/types` and deletes the local helper. Replaces the Plan 07-03 placeholder onClick with the new wired handler that delegates to `this.plugin.testActiveAIConnection()` with button-label flip + disable-while-in-flight wrapper. Removes ALL `Plan 07-04` substring references (the grep gate now returns 0).
- `tests/ai/settingsTab.test.ts` — Test 6 updated to assert the new wiring (`plugin.testActiveAIConnection` has been called) instead of the old placeholder Notice. Mock `ButtonApi` extended with `setDisabled(boolean)` so the button-label flip path doesn't crash.

## Decisions Made

See `key-decisions` frontmatter for the full list. Highlights:

- **prettyName as a typed module export, not a duplicated module-private helper.** The brand strings are LOCKED VERBATIM by 07-UI-SPEC; allowing two source-of-truth sites to drift would silently let the Settings UI and Notice toasts fall out of sync. Putting it in `src/ai/types.ts` colocates it with `AIProvider` so future planners adding a provider id update both shapes in one place.
- **Empty-key guard is provider-aware, not blanket.** Ollama and Custom may legitimately have an empty `apiKey` field — Ollama default install accepts no key, and Custom users may proxy through a backend that strips Authorization. Blocking probe on empty key for those two would surface a confusing UX ("Enter an API key" notice, but the user's setup intentionally has no key). The guard fires ONLY for the three providers where empty key guarantees a 401.
- **Single in-flight Map is per plugin instance, not global.** No other plugin code paths share this Map; cross-tab debouncing isn't needed because Settings tab and palette both run inside the same plugin renderer process.
- **Button-label flip is a Settings-surface concern only.** The palette command's feedback is the Notice itself — flipping a non-existent label there would be wasted code. The debounce Map (shared across both surfaces) handles concurrent click semantics.

## Deviations from Plan

### [Rule 1 - Bug] Plan-prescribed grep target for Plan 07-04 references conflicted with descriptive comments

**Found during:** Task 1 verification (acceptance criteria grep gate `grep -c "Plan 07-04" src/settings/SettingsTab.ts returns 0`).
**Issue:** The plan's `<action>` step 6 directs the executor to "locate the Test connection button placeholder (the line containing 'Plan 07-04')" and replace it. After replacement, three legacy comment references to "Plan 07-04" remained in the file (a JSDoc block discussing the old placeholder semantics + a section divider with `Plan 07-04` in the divider comment). The acceptance criterion `grep -c "Plan 07-04" src/settings/SettingsTab.ts returns 0` is strict; comments still triggered the gate.
**Fix:** Rewrote the affected JSDoc + divider comment to refer to the wired delegation pattern without naming the plan number; the locked verbatim Notice text was already removed by the placeholder replacement. Final grep returns 0.
**Files modified:** `src/settings/SettingsTab.ts`.
**Commit:** Bundled into `0ad5a33`.

### [Rule 1 - Bug] Plan 07-03 settingsTab.test.ts test 6 broke after wiring (placeholder Notice gone)

**Found during:** Task 1 regression check (`npx vitest run tests/ai/settingsTab.test.ts`).
**Issue:** The Plan 07-03 test asserted that clicking the Test connection button fires a Notice whose text contains 'Plan 07-04' — the locked placeholder marker. With the Plan 07-04 wiring landed, that placeholder Notice no longer fires; instead, the button onClick calls `plugin.testActiveAIConnection()`. The mock `ButtonApi` also lacked `setDisabled` (which the new onClick uses), so the click handler crashed with `TypeError: b.setDisabled is not a function`.
**Fix:** Updated test 6 to assert the new wiring contract — `plugin.testActiveAIConnection` has been called once AND the captured Notice list does NOT contain the obsolete 'Plan 07-04' string. Added `setDisabled(boolean)` to the mock `ButtonApi` interface + Setting.addButton mock implementation.
**Files modified:** `tests/ai/settingsTab.test.ts`.
**Commit:** Bundled into `0ad5a33`.

### [Rule 3 - Blocking] Concurrent-debounce test required a different `this`-binding shape

**Found during:** Task 1 GREEN gate (`npx vitest run tests/ai/probe-debounce.test.ts`).
**Issue:** The plan's pseudocode for the concurrent-debounce test calls `LeetCodePlugin.prototype.testActiveAIConnection.call(mockInstance)` directly. Two independent issues surfaced:
  1. **Microtask race:** The helper `callTestActiveAIConnection(fake)` does `const mod = await import('../../src/main')` before invoking the method. With both `p1` and `p2` constructed via that helper, both are blocked on the same dynamic-import microtask; neither has reached the `aiClient.probe(provider)` call site by the time the test resolves the captured `resolveProbe`. The captured resolver is still `null` because the unresolved-probe `Promise` constructor never ran. Test fails with `expected null not to be null`.
  2. **Lint rule `@typescript-eslint/unbound-method`:** Calling `LeetCodePlugin.prototype.testActiveAIConnection.call(...)` directly trips the unbound-method rule (the rule sees `prototype.method` as a reference and refuses to trust `.call` is a binding).
**Fix:** Pre-resolve the dynamic import in the concurrent test, then capture the prototype method into a wrapper function (`function (this: unknown) { return (LeetCodePlugin.prototype.testActiveAIConnection as ...).call(this); }`) so the call site uses an explicitly-bound form. Both microtask + lint issues resolve.
**Files modified:** `tests/ai/probe-debounce.test.ts`.
**Commit:** Bundled into `0ad5a33`.

### Note: extractProviderError test count is 9, not 8

The plan's acceptance grep specifies `8 passing tests` for `tests/ai/probe-error-extraction.test.ts`. I added a 9th case (`'returns truncated raw body when JSON has no recognized shape'`) covering the valid-JSON-but-no-error-field branch — it's a legitimate gap in the original plan's matrix and the helper's actual code path supports it. Spirit of the acceptance criterion is "extensive coverage of all envelope shapes"; 9 tests is the correct outcome. Plan acceptance number is treated as a floor, not a ceiling.

---

**Total deviations:** 3 auto-fixed (2 bugs caused by my changes to the existing test surface, 1 blocking test-shape issue) + 1 minor count delta. **Impact on plan:** All auto-fixes were necessary to land Task 1's wiring without leaving the 07-03 test suite red. No scope creep beyond the plan's explicit goal. Bundle delta: +0.6 KB (827.6 KB total, vs 826.6 KB Plan 07-03 baseline) — well under the 1 MB ceiling.

## Issues Encountered

- **Probe-debounce test mock had to use the project-wide obsidian-stub.** A bare-bones inline `vi.mock('obsidian', () => ({ Notice, Plugin, MarkdownView, TFile, WorkspaceLeaf }))` was insufficient because dynamic `import('../../src/main')` triggers full module evaluation, which pulls in `src/browse/FilterModal.ts` (which imports `obsidian.Modal`) along the transitive graph. Switched to the same `await import('../helpers/obsidian-stub')` spread pattern used by `tests/preview/router.test.ts`. Resolved without changing the test contract.

## Verification Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/ai/` | 96 passed (8 files) |
| `npx vitest run` (full suite) | 849 passed, 3 skipped (125 files) |
| `npx vitest run tests/api/ tests/settings/ tests/shared/` (v1.0 regression) | 35 passed, 2 skipped — 0 regressions |
| `npm run lint` | exit 0 |
| `npm run check:lc-isolation` | exit 0 |
| `npm run build` | exit 0 |
| `npm run check:bundle-size` | `main.js: 847422 bytes (827.6 KB)` — BUNDLE CHECK OK (under 1 MB) |

## Acceptance Criteria Grep Gates

| Gate | Expected | Actual |
|------|----------|--------|
| `grep -c "id: 'test-ai-connection'" src/main.ts` | 1 | 1 |
| `grep -c "name: 'Test AI connection'" src/main.ts` | 1 | 1 |
| `grep -c "testActiveAIConnection" src/main.ts` | ≥ 2 | 4 |
| `grep -c "testActiveAIConnection" src/settings/SettingsTab.ts` | 1 | 1 |
| `grep -c "Plan 07-04" src/settings/SettingsTab.ts` | 0 | 0 |
| `grep -c "aiProbeInflight" src/main.ts` | ≥ 4 | 6 |
| `grep -c "export function prettyName" src/ai/types.ts` | 1 | 1 |
| `grep -v '^//' src/settings/SettingsTab.ts \| grep -c "function prettyName"` | 0 | 0 |
| `grep -c "Pick an AI provider first" src/main.ts` | 1 | 1 |
| `grep -c "Enter an API key for" src/main.ts` | 1 | 1 |
| `grep -c "AI provider connection OK" src/main.ts` | ≥ 2 | 2 |
| `grep -c "ollama pull llama3.2" src/main.ts` | 1 | 1 |

## Test Counts

- `tests/ai/probe-debounce.test.ts` — **12 passing** (plan: 12)
- `tests/ai/probe-openai.test.ts` — **6 passing** (plan: 6)
- `tests/ai/probe-openrouter.test.ts` — **3 passing** (plan: 3)
- `tests/ai/probe-ollama.test.ts` — **7 passing** (plan: 7)
- `tests/ai/probe-anthropic.test.ts` — **3 passing** (plan: 3)
- `tests/ai/probe-custom-fallback.test.ts` — **7 passing** (plan: 7)
- `tests/ai/probe-error-extraction.test.ts` — **9 passing** (plan: 8 — +1 case for valid-JSON-no-shape branch)
- `tests/ai/probes.test.ts` — **5 passing** (plan: 5)

**Net total: 52 new tests** (1 over plan's 51 target). Full `tests/ai/` suite: **96 passing across 8 files** including the 07-01/07-02/07-03 regression tests.

## Posture Decisions

- **Notice copy verbatim.** Every Notice emitted by `testActiveAIConnection()` matches 07-UI-SPEC §"Notice copy" byte-for-byte. The variable substitutions are limited to `{provider name}` (always via `prettyName`) and `{model count}` (via `String(result.modelCount ?? 0)`). The COMBINED prefix+message string is truncated to 200 chars on the failure branch, mirroring CONTEXT decision E ("provider prefix + vendor message COMBINED") rather than truncating the vendor message alone (which would let the prefix push the visible total over 200 chars on an already-truncated message).
- **Probe path is uncoupled from disclosure.** Per Plan 07-04 `<canonical_decisions>` D, this plan calls `aiClient.probe(provider)` directly — Plan 07-05 wraps `AIClient.probe`'s body with the disclosure gate, NOT this caller. That keeps the disclosure modifier at a single seam point so all callers (this plan's testActiveAIConnection AND any Phase 08 invoker) inherit the protection without 07-04-side changes.
- **Custom backend fallback test surface.** `probe-custom-fallback.test.ts` exercises both arms: the 404/405/501 → chat-fallback path AND the 500/401 → no-fallback path. The matrix is locked because some self-hosted OpenAI-compatible proxies ship `405 Method Not Allowed` for /models on a chat-only setup; falling back to a 1-token chat there is the only way to validate connectivity without manual user-configured workarounds.

## Gates Downstream

- **Plan 07-05 (disclosure gate):** May now wrap `AIClient.probe()` and `AIClient.invoke()` with `requireDisclosure(provider, cfg)`. The wrapper modification happens in `src/ai/AIClient.ts:probe` — `testActiveAIConnection()` does not need to change. Plan 07-05 also adds the only new `setCta()` invocation in v1.1 (the disclosure modal's Continue button in `src/ai/disclosure.ts`).
- **Plan 07-06 (palette commands + README):** Adds `clear-ai-key` (calls `setProviderConfig(active, { ...current, apiKey: '' })`) and `reset-ai-disclosures` (clears `disclosureAcknowledged` for all 5 providers). README's "Network use" section will document the AI providers + the no-telemetry guarantee. `test-ai-connection` is already shipped today; Plan 07-06 only adds the README mention.
- **Phase 08 (streaming Debug):** May reuse `testActiveAIConnection`'s pattern for pre-call connectivity checks — the empty-key guard + in-flight Map are the same shape Phase 08 will need. The debounce Map is keyed by `AIProvider` so Phase 08's longer streaming invokes can coexist with quick test-connection probes for the same provider without surfacing the in-flight Notice (the Map is checked separately per call site, but the unified pattern is available if Phase 08 wants it).
- **Phase 11 (Knowledge Graph classifier):** Same as Phase 08 — pre-classify probe optional but available.

## Bundle Size

| Stage | Size | Headroom (vs 1 MB) |
|-------|------|---------------------|
| Plan 07-03 baseline | 826.6 KB | 173.4 KB |
| Plan 07-04 (this plan) | 827.6 KB | 172.4 KB |
| Plan 07-04 delta | +1.0 KB | — |

Delta is pure code (testActiveAIConnection method + palette command + prettyName export + Settings handler glue). No new runtime dependencies.

## Threat Flags

None new. Plan 07-04 introduces no new network surface — `AIClient.probe()` was wired in Plan 07-02 and lives behind `obsidianFetch('request')` which inherits the credentials: 'omit' cookie-leak mitigation. T-07-empty-key (Availability) is mitigated by the empty-key guard. T-07-04-debounce (cost-based Availability, low) is mitigated by the in-flight Map. T-07-03 (modal bypass) is INTENTIONALLY left for Plan 07-05 to fix at the AIClient.probe seam, NOT this caller — see Plan 07-04 `<threat_model>` partial-mitigate row.

## Self-Check: PASSED

**Files (created + modified):**
- FOUND: `tests/ai/probe-debounce.test.ts`
- FOUND: `tests/ai/probe-anthropic.test.ts`
- FOUND: `tests/ai/probe-openai.test.ts`
- FOUND: `tests/ai/probe-openrouter.test.ts`
- FOUND: `tests/ai/probe-ollama.test.ts`
- FOUND: `tests/ai/probe-custom-fallback.test.ts`
- FOUND: `tests/ai/probe-error-extraction.test.ts`
- FOUND: `tests/ai/probes.test.ts`
- FOUND: `src/main.ts` (modified — testActiveAIConnection method + palette command + aiProbeInflight Map field)
- FOUND: `src/ai/types.ts` (modified — prettyName export)
- FOUND: `src/settings/SettingsTab.ts` (modified — button onClick wired; local prettyName deleted; Plan 07-04 references removed)
- FOUND: `tests/ai/settingsTab.test.ts` (modified — test 6 asserts new wiring; mock ButtonApi extended with setDisabled)

**Commits:**
- FOUND: `0ad5a33` (Task 1 — wiring + debounce + 12 tests)
- FOUND: `a29e9a4` (Task 2 — 7 probe-matrix test files, 40 tests total)

**Tests:** 849 passing in full suite; 96 passing in tests/ai/ (52 new from this plan); 0 regressions in v1.0 or Plan 07-01/07-02/07-03 suites.
