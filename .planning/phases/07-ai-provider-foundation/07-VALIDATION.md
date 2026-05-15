---
phase: 07
slug: ai-provider-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Pulled from `07-RESEARCH.md` `## Validation Architecture` section. The planner will
> finalize this map (Task IDs, automated commands) once plans are written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x (already installed v1.0; same config as Phases 02–06) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm test -- --run tests/ai/` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5 s quick / ~30 s full |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run tests/ai/`
- **After every plan wave:** Run `npm test -- --run` (full suite must stay green)
- **Before `/gsd:verify-work`:** Full suite + `npm run lint` + `npm run build` (bundle gate) all green
- **Max feedback latency:** ~10 seconds for ai/ subfolder

---

## Per-Task Verification Map

> Filled by the planner once PLAN.md tasks are emitted. Below are the goal-anchored
> rows derived from CONTEXT.md success criteria + RESEARCH.md Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-* | 07.01 | 1 | AIPROV-02, AIPROV-06 | T-07-01 (key tampering) | Malformed AI key/baseUrl/model in data.json collapses to safe default | unit | `npm test -- --run tests/ai/settingsStore.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-* | 07.02 | 2 | AIPROV-05 | T-07-02 (cookie leak) | obsidianFetch sets credentials:'omit'; LC paths still use requestUrl | unit | `npm test -- --run tests/ai/obsidianFetch.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-regression | 07.02 | 2 | AIPROV-05 | — | No leetcode.com call uses obsidianFetch (grep gate + runtime test) | unit + grep | `npm test -- --run tests/ai/lc-isolation.test.ts` then `! grep -rE "obsidianFetch.*leetcode\\.com" src/` | ❌ W0 | ⬜ pending |
| 07-03-* | 07.03 | 3 | AIPROV-01, AIPROV-02 | — | API key inputs render as `<input type="password">`; provider dropdown swaps fields | unit (jsdom) | `npm test -- --run tests/ai/settingsTab.test.ts` | ❌ W0 | ⬜ pending |
| 07-04-* | 07.04 | 4 | AIPROV-03 | T-07-03 (probe disclosure bypass) | Probe matrix: GET /v1/models for OpenAI/OpenRouter, /api/tags for Ollama, /models→1-tok-chat fallback for Custom, 1-tok chat for Anthropic; disclosure modal gates probe entry | unit | `npm test -- --run tests/ai/probes.test.ts` | ❌ W0 | ⬜ pending |
| 07-05-* | 07.05 | 5 | AIPROV-04 | T-07-04 (modal bypass) | First call after switching to a not-yet-acknowledged provider fires modal; Cancel blocks call; "I understand" persists ack | unit | `npm test -- --run tests/ai/disclosure.test.ts` | ❌ W0 | ⬜ pending |
| 07-06-* | 07.06 | 6 | AIPROV-07 | — | `clear-ai-key` palette command wipes active provider key only; README enumerates all endpoints | unit + lint | `npm test -- --run tests/ai/clearKey.test.ts` && `node scripts/check-network-endpoints.mjs` | ❌ W0 | ⬜ pending |
| 07-bundle | (gate) | 1 | — | — | Production bundle stays under 500 KB CI ceiling with @ai-sdk/* statically imported | build | `npm run build && npm run check:bundle-size` | ✅ existing | ⬜ pending |
| 07-redact | 07.01 | 1 | AIPROV-06 | T-07-05 (key in logs) | Logger redaction extended for `apiKey`, `bearer`, `authorization`, `x-api-key` | unit | `npm test -- --run tests/shared/logger.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Test files referenced in the verification map MUST exist (or stubbed) before Wave 1
> begins. v1.0 already ships `vitest` infrastructure — no new framework install.

- [ ] `tests/ai/settingsStore.test.ts` — shape-guard + redaction unit tests for `AIProvider`, `ProviderConfig`, `aiCostLedger` (REQ-AIPROV-02, REQ-AIPROV-06)
- [ ] `tests/ai/obsidianFetch.test.ts` — adapter mode switch + `credentials:'omit'` regression (REQ-AIPROV-05)
- [ ] `tests/ai/lc-isolation.test.ts` — runtime regression: every leetcode.com path still uses requestUrl (REQ-AIPROV-05)
- [ ] `tests/ai/settingsTab.test.ts` — provider dropdown + masked password input (REQ-AIPROV-01, REQ-AIPROV-02)
- [ ] `tests/ai/probes.test.ts` — per-provider Test connection probe matrix (REQ-AIPROV-03)
- [ ] `tests/ai/disclosure.test.ts` — once-per-provider-switch modal gating (REQ-AIPROV-04)
- [ ] `tests/ai/clearKey.test.ts` — Clear AI key palette command (REQ-AIPROV-07)
- [ ] `tests/shared/logger.test.ts` — redaction patterns extended for AI key fields
- [ ] `scripts/check-network-endpoints.mjs` — README network-use enumeration check (used by Phase 12 audit too)

*Existing infrastructure (vitest, jsdom polyfills used in Phase 06) covers framework setup. No new install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Test connection success/failure Notice text | AIPROV-03 | Notice content rendering verified manually because Obsidian Notice DOM lifecycle isn't easily mocked in vitest | UAT: configure each provider with valid key → click Test connection → confirm green Notice; configure with bogus key → confirm provider's verbatim error in Notice (truncated to ~200 chars) |
| Disclosure modal copy + UX | AIPROV-04 | Modal text + button placement need a human eye | UAT: switch provider → confirm modal title says "Heads up: this will send data to {provider name}", body lists base URL + Phase-07-stub data manifest, two buttons (Cancel / I understand — continue) |
| Clear AI key Notice + data.json effect | AIPROV-07 | Filesystem effect verified live | UAT: configure key → run `Clear AI key` palette command → inspect `data.json` to confirm only the active provider's `apiKey` is empty (others preserved) |
| README "Network use" section | AIPROV (success criterion 4) | Documentation review | UAT: open README, confirm new section enumerates: leetcode.com, api.anthropic.com, api.openai.com, openrouter.ai, http://localhost:11434 (Ollama default), plus Custom-URL note |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING test file references
- [ ] No watch-mode flags (every command runs `--run`)
- [ ] Feedback latency < 10 s for `tests/ai/` quick path
- [ ] `nyquist_compliant: true` set in frontmatter once planner finalizes the map

**Approval:** pending — planner finalizes per-task IDs in step 8
