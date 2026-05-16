---
phase: 07-ai-provider-foundation
plan: 06
subsystem: ai-credential-lifecycle-and-network-disclosure
tags: [ai, palette-command, readme, plugin-store-compliance, network-disclosure, phase-closeout]
requires:
  - ai-types-module
  - settings-store-ai-fields
  - aiclient-on-plugin-instance
  - testActiveAIConnection-method
  - reset-ai-disclosures-palette-command
provides:
  - clear-ai-key-palette-command
  - clearactiveAIKey-plugin-method
  - readme-network-usage-extended
  - readme-authentication-subsection
  - readme-cost-expectations-stub
  - readme-network-use-ci-grep-gate
affects:
  - src/main.ts
  - README.md
  - tests/ai/clearKey.test.ts
  - tests/ai/readme-network-use.test.ts
tech-stack:
  added: []
  patterns:
    - palette-command-clean-id-no-plugin-prefix-no-command-word-no-hotkey
    - active-only-credential-clear-preserves-other-providers
    - preserve-disclosure-flag-on-key-clear-credential-vs-disclosure-separation
    - readme-grep-gate-for-plugin-store-reviewer-parity
    - verbatim-v1.0-cookie-disclosure-preservation-under-authentication-subsection
key-files:
  created:
    - tests/ai/clearKey.test.ts
    - tests/ai/readme-network-use.test.ts
  modified:
    - src/main.ts
    - README.md
decisions:
  - "Palette command `clear-ai-key` clean ID: no plugin-id prefix ('leetcode-'), no 'command' substring, no hotkey field — passes eslint-plugin-obsidianmd commands/no-* rule family already enforced phase-wide."
  - "clearActiveAIKey scope is ACTIVE-ONLY: when activeAIProvider is null, the locked Notice fires and SettingsStore is NOT touched. When set, only the active provider's apiKey is wiped; baseUrl, model, disclosureAcknowledged are PRESERVED on the active provider AND every other provider's config is byte-for-byte unchanged. T-07-06-other-keys mitigation: writtenProviders array asserted to equal ['anthropic'] (or whichever single provider) in unit tests."
  - "T-07-06-disclosure: clearing a key does NOT clear `disclosureAcknowledged` — credential rotation is a distinct semantic from disclosure-reset. Users who want to re-trigger the disclosure modal run the separate `reset-ai-disclosures` command (Plan 07-05). This separation lets users rotate keys without losing the prior disclosure acknowledgement."
  - "No confirmation modal on clear (per 07-UI-SPEC §'Destructive actions'): user typed the command name explicitly; double-confirmation is friction; re-pasting from provider dashboard is trivial recovery. Mirrors v1.0 D-22/D-23/AUTH-05 logout precedent."
  - "Notice copy verbatim from 07-UI-SPEC §'Notice copy': success = 'Cleared AI key for {prettyName(provider)}' (3000ms), empty-state = 'No active AI provider — nothing to clear.' (3000ms). Both strings locked by unit-test assertions."
  - "README ## Network usage section REPLACED entirely (was 1 paragraph + 1 LC cookie paragraph) with a bullet list enumerating all 5 AI hosts + leetcode.com, plus ### Authentication and ### Cost expectations subsections. v1.0 LC cookie disclosure (`embedded Obsidian BrowserWindow ... never transmitted anywhere except leetcode.com`) preserved BYTE-FOR-BYTE under ### Authentication."
  - "Plugin-store reviewer parity gate: tests/ai/readme-network-use.test.ts asserts 16 substrings (5 AI hosts + leetcode.com + section headings + telemetry disclaimer + Phase 09 reference + no-placeholder regression). The test reads README.md from disk via `path.resolve(__dirname, '../../README.md')` so any reviewer-grep claim mismatches surface in CI on every commit."
  - "Cost expectations stub references Phase 09 cost-cap UI + per-Test-connection cost notes (~$0.0001/click for Anthropic 1-token completion; free for OpenAI/OpenRouter/Custom/Ollama metadata-only `GET /v1/models`). Phase 12 release-audit will only verify (and bump version), not rewrite — the audit-ready text is shipped now."
  - "Phase 07 closeout: all 7 AIPROV requirements (AIPROV-01..AIPROV-07) are user-visible behaviors verified by tests. Three palette commands now exist (test-ai-connection, reset-ai-disclosures, clear-ai-key). Downstream Phase 08 (AI Debug) may now build on the AIClient seam without further foundation work."
metrics:
  duration: "~10 min"
  completed_date: "2026-05-16"
  tasks_completed: 2
  files_changed: 4
---

# Phase 07 Plan 06: clear-ai-key + README Network usage Summary

Closes Phase 07 by shipping the credential-rotation escape hatch (`clear-ai-key` palette command — AIPROV-06) and the plugin-store-reviewer-ready network disclosure (README ## Network usage section enumerating all 5 AI provider hosts + leetcode.com — AIPROV-07).

## What Shipped

- **`clear-ai-key` palette command** (`src/main.ts`) — clean ID, no hotkey, sentence-case name. Callback delegates to `LeetCodePlugin.clearActiveAIKey()`.
- **`LeetCodePlugin.clearActiveAIKey()`** method — wipes ONLY the active provider's `apiKey` via `SettingsStore.setProviderConfig(active, { ...cfg, apiKey: '' })`. Every other field (baseUrl, model, disclosureAcknowledged) is preserved; other providers' configs are untouched.
- **Empty-state guard** — when `activeAIProvider` is null, fires the locked Notice `'No active AI provider — nothing to clear.'` (3000ms) and returns without touching SettingsStore.
- **Success Notice** — `'Cleared AI key for {prettyName(provider)}'` (3000ms), reusing the verbatim brand strings from `src/ai/types.ts:prettyName()` (e.g., "Anthropic", "OpenAI", "OpenRouter", "Ollama", "Custom (OpenAI-compatible)").
- **README ## Network usage** rewritten — the prior 1-paragraph leetcode.com-only section is replaced with a bullet list enumerating all 5 AI provider hosts (`api.anthropic.com`, `api.openai.com`, `openrouter.ai`, `localhost:11434`, custom endpoint) alongside `leetcode.com`, with explicit "No telemetry. No analytics. No other endpoints." disclaimer.
- **README ### Authentication subsection** — preserves the v1.0 LC cookie disclosure verbatim (BrowserWindow + LEETCODE_SESSION cookie + never-transmitted-anywhere-except-leetcode.com guarantee) AND adds the AI key plain-text storage disclosure with reference to `src/shared/logger.ts` redaction.
- **README ### Cost expectations stub** — references Phase 09 cost-cap UI as the future cost-control surface; documents per-Test-connection cost (~$0.0001 for Anthropic 1-token chat, free for OpenAI/OpenRouter/Ollama/Custom metadata-only model-list endpoints); notes that default model identifiers may rot.
- **`tests/ai/clearKey.test.ts`** — 8 unit tests asserting active-only scope, every non-apiKey field preserved, both Notice copy variants verbatim, palette command wiring.
- **`tests/ai/readme-network-use.test.ts`** — 16 substring assertions on README.md (read from disk at test time) acting as a CI-time plugin-store-reviewer-parity gate.

## Verification Evidence

- `npx vitest run tests/ai/clearKey.test.ts` → 8 passed.
- `npx vitest run tests/ai/readme-network-use.test.ts` → 16 passed.
- `npx vitest run tests/ai/` → 168 passed (full AI suite).
- `npx vitest run` (full repo) → 910 passed, 3 pre-existing skips, 0 failed.
- `npx tsc --noEmit` → exit 0.
- `npm run lint` → exit 0 (clean command ID rules pass; eslint-plugin-obsidianmd@0.3.0 satisfied).
- `npm run check:lc-isolation` → exit 0.
- `npm run build && npm run check:bundle-size` → 850,442 bytes (830.5 KB) — under 1 MB ceiling, +0.4 KB from Plan 07-05 baseline (830.1 KB).
- `grep -c "id: 'clear-ai-key'" src/main.ts` → 1.
- `grep -c "## Network usage" README.md` → 1.
- All 5 host substrings present in README: `api.anthropic.com`, `api.openai.com`, `openrouter.ai`, `localhost:11434`, `Custom (OpenAI-compatible)`.

## Threat-Model Outcomes

- **T-07-06-other-keys (Tampering / Information Disclosure)** — MITIGATED. `clearActiveAIKey` calls `setProviderConfig` exactly once and only for the active provider. Unit test asserts `writtenProviders` equals `['anthropic']` (single-element array) when active = anthropic and all 5 providers have non-empty keys, and the other 4 providers' apiKeys remain intact in the post-call cfg snapshot.
- **T-07-06-disclosure (Tampering)** — MITIGATED. The method spreads `...cfg` then overrides only `apiKey: ''`; `disclosureAcknowledged` flows through unchanged. Unit test asserts `cfgs.openrouter.disclosureAcknowledged === true` after a clear when the pre-state was true.
- **T-07-07-readme-drift (Compliance / plugin store)** — MITIGATED. `tests/ai/readme-network-use.test.ts` runs in every CI invocation and asserts every required substring; any drift between README claims and source code becomes a CI failure on the same commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test lint fix: prototype access pattern triggered `@typescript-eslint/unbound-method`**
- **Found during:** Task 1 GREEN gate (post-implementation lint).
- **Issue:** `clearKey.test.ts` initially used dynamic `await import('node:fs')` + `await import('node:path')` inside a test body; the destructured `resolve` from node:path was flagged as an unbound method (line 226).
- **Fix:** Hoisted to top-level `import { readFileSync } from 'node:fs'` + `import * as path from 'node:path'` and changed the test from `async () =>` to `() =>` (no longer needs to await imports).
- **Files modified:** `tests/ai/clearKey.test.ts`.
- **Commit:** `d5a8195` (rolled into the GREEN commit).

**2. [Rule 2 - Missing critical functionality] None.**
**3. [Rule 3 - Blocking issue] None.**
**4. [Rule 4 - Architectural change] None.**

### Plan-Acceptance Criterion Off-By-One

The plan claimed `grep -E "test-ai-connection|reset-ai-disclosures|clear-ai-key" src/main.ts | wc -l` should return 6 (3 IDs + 3 callback delegations). The actual count is 7 because each of the three commands also has a JSDoc reference to its ID/method-name in the surrounding documentation comments. The load-bearing assertion is `grep -c "id: 'clear-ai-key'" src/main.ts` returning 1, which holds; the wc-l count was an off-by-one artifact in the plan.

## Authentication Gates

None. No external auth required for this plan.

## Phase 07 Closeout

All 7 AIPROV requirements are now user-visible behaviors verified by tests:

| ID         | Surface                                                                                     | Plan |
|------------|---------------------------------------------------------------------------------------------|------|
| AIPROV-01  | AI provider settings panel (Anthropic, OpenAI, OpenRouter, Ollama, Custom-OpenAI-compat)    | 07-03|
| AIPROV-02  | Per-provider apiKey field (masked) + plain-text data.json storage disclosure in README      | 07-03 + 07-06|
| AIPROV-03  | "Test connection" button + `test-ai-connection` palette command                              | 07-04|
| AIPROV-04  | First-run disclosure modal (per-provider acknowledgement; gates probe AND invoke at AIClient seam) | 07-05|
| AIPROV-05  | `obsidianFetch(mode)` adapter; LC isolation gate enforced as `prelint` hook                  | 07-02|
| AIPROV-06  | `clear-ai-key` palette command (active-only scope; preserves other providers' keys + disclosure flag) | 07-06|
| AIPROV-07  | README ## Network usage enumerates all 5 AI hosts + leetcode.com; CI grep gate at every commit | 07-06|

Three palette commands now exist for AI provider lifecycle:

| Command ID                | Action                                                                                |
|---------------------------|---------------------------------------------------------------------------------------|
| `test-ai-connection`      | Probe the active provider; emit success/failure Notice                                |
| `reset-ai-disclosures`    | Clear all 5 providers' `disclosureAcknowledged` flags (idempotent skip on already-false) |
| `clear-ai-key`            | Wipe the active provider's `apiKey` (other fields + other providers preserved)        |

Downstream Phase 08 (AI Debug) may now build on the AIClient seam — `AIClient.invoke(req)` already inherits the disclosure gate from Plan 07-05; Phase 08 only needs to call it. No further foundation work in Phase 07 is required.

Bundle baseline at end of Phase 07: **830.5 KB / 1 MB ceiling** (169.5 KB headroom). Cumulative Phase 07 bundle delta: +665.5 KB (from v1.1 entry baseline 165.0 KB) — driven primarily by Vercel AI SDK static imports landing on the bundle graph after `AIClient` was wired into `main.ts:onload` (Plan 07-03 architectural deviation).

## Self-Check: PASSED

Verifying claimed artifacts and commits exist on disk:

- `[FOUND]` `src/main.ts` — `clearActiveAIKey()` method + `clear-ai-key` addCommand block both present.
- `[FOUND]` `README.md` — `## Network usage` + `### Authentication` + `### Cost expectations` all present; all 5 AI host substrings present.
- `[FOUND]` `tests/ai/clearKey.test.ts` — 8 tests; passes.
- `[FOUND]` `tests/ai/readme-network-use.test.ts` — 16 tests; passes.
- `[FOUND]` Commit `37068eb` — RED test for clear-ai-key.
- `[FOUND]` Commit `d5a8195` — GREEN implementation of clearActiveAIKey + palette command.
- `[FOUND]` Commit `ce861f5` — RED test for README network-use grep gate.
- `[FOUND]` Commit `17e9e0b` — GREEN README rewrite.
