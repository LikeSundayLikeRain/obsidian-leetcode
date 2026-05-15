---
phase: 07-ai-provider-foundation
plan: 01
subsystem: ai-foundation
tags: [ai, settings-store, shape-guard, logger-redaction, foundation]
requires: []
provides: [ai-types-module, settings-store-ai-fields, logger-ai-redaction]
affects: [src/settings/SettingsStore.ts, src/shared/logger.ts, src/ai/types.ts]
tech-stack:
  added: []
  patterns:
    - locked-schema-shape-guards
    - day-rollover-on-read
    - strict-true-boolean-coercion
    - per-provider-default-fallback
    - bearer-then-secret-regex-ordering
key-files:
  created:
    - src/ai/types.ts
    - tests/ai/types.test.ts
    - tests/ai/settingsStore.test.ts
    - tests/ai/helpers/mockProvider.ts
    - tests/shared/logger.test.ts
  modified:
    - src/settings/SettingsStore.ts
    - src/shared/logger.ts
decisions:
  - "AIRequest/AIResponse shipped as empty-but-named interfaces (lint-disabled inline) so Plan 07-02's AIClient.invoke signature stabilizes today; Phase 08 expands shape"
  - "sanitizeAICostLedger resets BOTH date AND usdToday together when EITHER is malformed (corrupt ledger cannot carry stale spend under bogus date)"
  - "BEARER_VALUE_PATTERN runs before SECRET_VALUE_PATTERN so `Authorization: Bearer sk-xyz` redacts at both layers without secret survival"
  - "Single-line AIProvider union literal locked as exact grep target for plan acceptance criteria"
metrics:
  duration: "7m 38s"
  completed_date: "2026-05-15"
  tasks_completed: 3
  files_changed: 7
  files_created: 5
  tests_added: 29
  bundle_delta_bytes: 143
---

# Phase 07 Plan 01: AI Provider Foundation Summary

Foundation layer for Phase 07's AI work: typed domain shapes (`src/ai/types.ts`), locked-schema PluginData fields with per-field shape-guards (T-07-01 mitigation), day-rollover-on-read cost ledger, and extended logger redaction covering AI key fields + Bearer-header values (T-07-05 mitigation, lands BEFORE any provider adapter is imported).

## Objective Achieved

The plan shipped exactly the data + safety layer Plans 02–06 plug into:

1. **AI domain types** (`src/ai/types.ts`): locked 5-entry `AIProvider` union, `ProviderConfig` (apiKey/baseUrl/model/disclosureAcknowledged), `AICostLedger`, `ProbeResult`, plus empty-but-named `AIRequest`/`AIResponse` so Plan 07-02's `AIClient.invoke()` signature type-checks today.
2. **SettingsStore extension**: 3 new `PluginData` fields (`activeAIProvider`, `providerConfigs`, `aiCostLedger`); 3 new shape-guards (`isValidProviderId`, `sanitizeProviderConfig`, `sanitizeAICostLedger`); 6 new public methods (`getActiveAIProvider`, `setActiveAIProvider`, `getProviderConfig`, `setProviderConfig`, `getAICostLedger`, `addCostLedger`); per-provider defaults locked by CONTEXT decision C.
3. **Logger redaction extension**: `REDACT` regex covers AI key field names; `SECRET_VALUE_PATTERN` extends to header-name=value pairs (`x-api-key:`, `apiKey=`, `Authorization:`, …); new `BEARER_VALUE_PATTERN` separately catches `Bearer sk-xyz` substrings, runs first so the `Authorization: Bearer sk-xyz` shape redacts at both layers.

Zero UI, zero HTTP, zero new dependencies. Plan 07-02 may now log adapter errors safely; Plan 07-03 may now read these PluginData fields.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create `src/ai/types.ts` and Wave 0 test scaffolds | `9b7815a` | `src/ai/types.ts`, `tests/ai/types.test.ts`, `tests/ai/helpers/mockProvider.ts`, `tests/ai/settingsStore.test.ts` (placeholder), `tests/shared/logger.test.ts` (placeholder) |
| 2 | Extend `SettingsStore` with AI fields, shape-guards, getters/setters, `addCostLedger` | `653a44a` | `src/settings/SettingsStore.ts`, `tests/ai/settingsStore.test.ts` |
| 3 | Extend `src/shared/logger.ts` redaction for AI key fields + Bearer values | `e0d42a3` | `src/shared/logger.ts`, `tests/shared/logger.test.ts`, `src/ai/types.ts` (lint-disable for empty interfaces) |

## Tests Added

- **`tests/ai/types.test.ts`** — 5 cases: AIProvider union shape (compile-time cast test), ProviderConfig field shape, AICostLedger shape, ProbeResult shape, AIRequest/AIResponse exports.
- **`tests/ai/settingsStore.test.ts`** — 13 cases across 5 describe blocks:
  - `activeAIProvider` (2): missing → null, invalid → null
  - `providerConfigs` (5): missing hydrates 5 defaults, malformed apiKey collapses to '', non-https baseUrl falls back to default, http://localhost accepted for Ollama, disclosureAcknowledged strict-true only
  - `aiCostLedger` (2): malformed date resets both fields, negative usdToday → 0
  - `addCostLedger` (3): same-day accumulates, day-rollover resets before adding, non-finite/negative silently ignored
  - provider-switch invariant (1): switching X→Y preserves prior provider's apiKey + disclosureAcknowledged byte-for-byte
- **`tests/shared/logger.test.ts`** — 11 cases across 3 categories:
  - REDACT key-name (6): apiKey, api_key, x-api-key, deeply-nested providerConfigs.anthropic.apiKey, plus negative tests for `model` and `baseUrl`
  - SECRET_VALUE_PATTERN value-level (3): Bearer in Authorization, x-api-key value, header-name preservation
  - v1.0 regression (2): LEETCODE_SESSION + csrftoken still redact

**Net total: 29 new tests; suite now 771 passing (+24 net new from this plan after subtracting the 5 placeholder assertions Task 1 shipped that Tasks 2/3 replaced).**

## Verification Results

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/ai/ tests/shared/ tests/settings/ tests/settings-store.test.ts tests/logger-redact.test.ts` | 80 passed, 2 skipped (pre-existing) |
| `npx vitest run` (full suite) | 771 passed, 3 skipped |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| Bundle delta | +143 bytes (success criterion was ± 1 KB) |

## Deviations from Plan

### [Rule 1 - Bug] Plan-prescribed test shape failed v1.0 logger contract

**Found during:** Task 3 RED gate.
**Issue:** The plan's Category 2 + Category 3 test cases passed the secret-bearing string as the FIRST argument to `logger.warn(...)` (e.g. `logger.warn('Authorization: Bearer sk-xyz')`). The v1.0 logger only redacts the SECOND argument (`ctx`); the first argument is the message prefix and is wrapper-formatted as-is. So those tests failed not because the regex was wrong but because they exercised a path the v1.0 logger never redacted. Confirmed by reading existing v1.0 contract tests in `tests/logger-redact.test.ts` which always pass secrets via `ctx`.
**Fix:** Updated my new tests to follow the v1.0 convention — pass the message prefix as the first arg and the secret-bearing string as the second arg (`logger.warn('http err', 'Authorization: Bearer sk-xyz')`). This matches every production callsite (the message is always a fixed string and the secrets always live inside `ctx`).
**Files modified:** `tests/shared/logger.test.ts` (Category 2 & Category 3 cases).
**Commit:** Bundled into `e0d42a3`.

### [Rule 1 - Bug] BEARER must run before SECRET_VALUE_PATTERN

**Found during:** Task 3 GREEN, after first regex extension.
**Issue:** SECRET_VALUE_PATTERN's `authorization` alternate matches `Authorization: Bearer` greedily (consuming up to first whitespace), producing `Authorization=[REDACTED] sk-xyz` — leaving `sk-xyz` exposed because the `Bearer` keyword that BEARER_VALUE_PATTERN needs as anchor was already consumed.
**Fix:** Reorder `redactString` to run `BEARER_VALUE_PATTERN` FIRST. Result on `Authorization: Bearer sk-xyz` → `Authorization: Bearer [REDACTED]` → SECRET_VALUE_PATTERN then collapses the surrounding `Authorization: Bearer` chunk into `Authorization=[REDACTED]`. Net output: both layers redact, no secret survives.
**Files modified:** `src/shared/logger.ts`.
**Commit:** Bundled into `e0d42a3`.

### [Rule 3 - Blocking] Empty interface lint rule blocks plan-prescribed shape

**Found during:** Task 3 plan-level lint gate.
**Issue:** Plan explicitly requires empty-but-named `AIRequest` / `AIResponse` interfaces (so Plan 07-02's `AIClient.invoke(req: AIRequest): Promise<AIResponse>` signature has stable named brand types). `@typescript-eslint/no-empty-object-type` blocks this with two errors.
**Fix:** Inline `// eslint-disable-next-line @typescript-eslint/no-empty-object-type` on each declaration with JSDoc explaining the named-brand requirement. This is the canonical escape hatch for intentional empty interfaces and matches the plan's `<behavior>` directive. Alternative `type X = object` was considered and rejected because it would not preserve the named brand that downstream plans import.
**Files modified:** `src/ai/types.ts`.
**Commit:** Bundled into `e0d42a3` (lint gate exposed during Task 3 verification, not Task 1).

### Note: Single-line AIProvider union locked as grep target

The plan's acceptance-criteria grep is `grep -c "'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom'"`. A multi-line union (one provider per line, prettier-style) fails this check. Locked the literal as a single-line declaration with a code comment citing the acceptance-criteria contract, so future formatters that try to wrap it can be redirected to the comment. This is a CLAUDE.md-style "convention to honor" note, not a deviation.

## Auth Gates

None — this plan ships data + safety layer only; no provider HTTP calls happen until Plan 07-02.

## Posture Decisions

- **Locked-schema like `previewClickBehavior`:** every AI field uses the strictness exemplar at SettingsStore line 342 — anything not literally matching the known shape collapses to a per-provider safe default.
- **Strict-true for booleans:** `disclosureAcknowledged === true` only — string `'yes'`, number 1, truthy objects all collapse to `false` so a corrupt data.json cannot silently flip a user past the disclosure gate (T-07-05 alignment).
- **Day-rollover-on-read inside `addCostLedger`:** local-day comparison happens at write time; readers see whatever was last persisted (no implicit mutation in the getter). UI display layer in Plan 07-03 can compare `date` to today on its own without writing.
- **Setter re-sanitization (T-07-01-b):** `setProviderConfig(p, cfg)` runs `sanitizeProviderConfig(cfg, defaults)` before persisting so a buggy command-layer caller in Plan 07-06 cannot poison `data.json` with malformed input.
- **Per-provider default fallback:** `sanitizeProviderConfig` takes a `defaults` argument so each provider's `baseUrl`/`model` failure-path lands on the right baseline (Ollama → http://localhost:11434/v1; Anthropic → https://api.anthropic.com/v1).

## Gates Downstream

- **Plan 07-02 (AIClient adapters):** May now safely log adapter errors / request payloads — REDACT covers `apiKey`, `api[_-]?key`, `bearer`, `authorization`; SECRET_VALUE_PATTERN handles `x-api-key` headers and `Bearer sk-...` Authorization header values. AIRequest/AIResponse interfaces ready to import for `AIClient.invoke()` signature.
- **Plan 07-03 (Settings UI):** May now read `getActiveAIProvider`, `getProviderConfig`, `setProviderConfig`, `getAICostLedger` to render the provider dropdown + per-provider key/URL/model fields + disclosure toggle + cost display.
- **Plan 07-04 (probe):** `ProbeResult` shape exported and ready; `tests/ai/helpers/mockProvider.ts` exposes `makeFetcherMock()` + `mockResponse()` helpers it can consume directly.
- **Plan 07-05 + 07-06 (palette commands):** `setActiveAIProvider`, `setProviderConfig` setters available; key-clear command in Plan 07-06 will use `setProviderConfig(p, { ...current, apiKey: '' })` (the setter's re-sanitization path is the right place).

## Self-Check: PASSED

**Files:**
- FOUND: `src/ai/types.ts`
- FOUND: `tests/ai/types.test.ts`
- FOUND: `tests/ai/settingsStore.test.ts`
- FOUND: `tests/ai/helpers/mockProvider.ts`
- FOUND: `tests/shared/logger.test.ts`
- FOUND: `src/settings/SettingsStore.ts` (modified)
- FOUND: `src/shared/logger.ts` (modified)

**Commits:**
- FOUND: `9b7815a` (Task 1)
- FOUND: `653a44a` (Task 2)
- FOUND: `e0d42a3` (Task 3)

**Tests:** 771 passing in full suite; 80 passing in plan-relevant subset; 0 regressions in v1.0 logger / settings suites.
