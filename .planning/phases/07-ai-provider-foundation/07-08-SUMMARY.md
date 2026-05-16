---
phase: 07-ai-provider-foundation
plan: 08
subsystem: ai-provider-foundation
tags:
  - phase-07
  - gap-closure-round-2
  - logger-redaction
  - empty-baseurl-guard
  - disclosure-gate-test
  - advisory-cleanup
gap_closure: true
requires:
  - 07-07
provides:
  - "logger separator-preserving redaction (CR-01-A + WR-02-separator)"
  - "whitespace-aware empty-baseUrl guards across all three sites (WR-03-whitespace)"
  - "MockSettings.setProviderConfig + disclosure-gate persistence test coverage (WR-01-test-gap)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Captured separator group in regex alternate to preserve input separator in replacement"
    - "Negative lookahead to exclude scheme-keyword consumption as a value"
    - "Optional chaining + .trim() for whitespace-aware emptiness check"
    - "Stateful in-memory map in test mocks for assertion of persistence flows"
key-files:
  created:
    - .planning/phases/07-ai-provider-foundation/07-08-SUMMARY.md
  modified:
    - src/shared/logger.ts
    - src/main.ts
    - src/ai/providers/openaiCompatible.ts
    - src/ai/providers/ollama.ts
    - tests/shared/logger.test.ts
    - tests/ai/probes.test.ts
    - tests/ai/probe-debounce.test.ts
    - tests/ai/aiClient.test.ts
decisions:
  - "Implemented CR-01-A as 'untouched' form: 'Authorization: Bearer' (no token) survives the redaction pipeline verbatim — neither alternate matches. Achieved via negative lookahead `(?!bearer\\b)` in the second alternate's value position. The plan permitted either 'untouched' or 'normalized' (`'Authorization: Bearer [REDACTED]'`); the lookahead approach naturally produces the cleaner untouched form."
  - "Implemented WR-02-separator by capturing the FULL separator group `\\s*[=:]\\s*` (whitespace + sep + whitespace) in the second alternate, not just `[=:]`. This preserves both the separator character and the surrounding whitespace from the input — `'x-api-key: val'` (with space) redacts to `'x-api-key: [REDACTED]'` (with space) cleanly. Capturing only `[=:]` would have produced `'x-api-key:[REDACTED]'` (lost the space)."
  - "All three guard sites use `!cfg.baseUrl?.trim()` (optional chain + trim) — a single uniform shape. The `?.` is defensive; sanitizeProviderConfig coerces baseUrl to '' for missing/non-string today, but the optional chain is belt-and-braces against future shape drift."
  - "Per plan anti-requirement, did NOT introduce a centralized `isBlank(s)` helper for the three guard sites. Three call sites is below the extraction threshold; inlining keeps the diff localized and review easy."
  - "Per plan anti-requirement, did NOT trim baseUrl before passing to the fetcher. The advisory is about guard symmetry, not URL sanitization — Settings-side trimming is out of scope."
  - "Per plan anti-requirement, did NOT modify AIClient.ts. All Task 3 changes were test-side (MockSettings rebuilt with stateful map; new factory signature `{startingCfg, overrides}` replaced flat overrides)."
metrics:
  duration: "~10 minutes (autonomous executor)"
  completed: 2026-05-15
  tasks_completed: 3
  files_modified: 8
  test_count_before: 925
  test_count_after: 941
  test_count_delta: +16
---

# Phase 07 Plan 08: Round-2 Advisory Cleanup Summary

Closes four advisory findings from `07-07-REVIEW.md` (round-1 code review). None of the four blocked the original 12 phase-07 truths — all four AIPROV-01..07 requirements remained SATISFIED before this plan — but each was a concrete contract violation, test gap, or undocumented output mutation that this plan resolves.

## Advisory Closures

### CR-01-A — `'Authorization: Bearer'` (no token) no longer rendered as `'Authorization=[REDACTED]'`

- **File:** `src/shared/logger.ts`
- **Change:** Added negative lookahead `(?!bearer\b)` to the second alternate of `SECRET_VALUE_PATTERN` (the case-insensitive `/i` flag already on the pattern means the lookahead matches `Bearer`/`BEARER`/`bearer` etc.). The first alternate already requires `\s+([^\s;,"'&}\]\[]+)` which fails to match when no token follows, so adding the lookahead in the second alternate cleanly excludes the `Bearer` keyword from being consumed as a value.
- **Result:** Input `'Authorization: Bearer'` (no trailing token) now survives the redaction pipeline verbatim — neither alternate matches.
- **Test:** `tests/shared/logger.test.ts` Category 5 — `does NOT consume the Bearer keyword as a value when no token follows`. Hard contract `not.toContain('Authorization=[REDACTED]')` is asserted, with an `acceptableA || acceptableB` OR-of-shapes check that allows either the untouched form or the normalized form.

### WR-02-separator — Logger redaction now preserves the input separator

- **File:** `src/shared/logger.ts`
- **Change:** Replaced inline `\s*[=:]\s*` in the second alternate with a captured group `(\s*[=:]\s*)` so the full separator (whitespace + `:` or `=` + whitespace) is available in the replacement function. The replacement now emits `${otherKey}${otherSep}[REDACTED]` instead of the v07-07 hardcoded `${otherKey}=[REDACTED]`.
- **Result:** `'x-api-key: val'` redacts to `'x-api-key: [REDACTED]'` (colon + surrounding whitespace preserved). `'LEETCODE_SESSION=val'` redacts to `'LEETCODE_SESSION=[REDACTED]'` (equals preserved). Symmetry with the first alternate's separator-preserving contract is restored.
- **Test:** `tests/shared/logger.test.ts` Category 5 — `preserves the colon separator for x-api-key header` and `preserves the equals separator for env-var-style LEETCODE_SESSION`.

### WR-03-whitespace — All three empty-baseUrl guards now reject whitespace-only inputs uniformly

- **Files:** `src/main.ts` (testActiveAIConnection), `src/ai/providers/openaiCompatible.ts` (probeCustom), `src/ai/providers/ollama.ts` (probeOllama)
- **Change:** All three guards changed to `!cfg.baseUrl?.trim()`. Previously: main.ts used strict `cfg.baseUrl === ''`; provider-side guards used falsy `!cfg.baseUrl`. Both forms passed whitespace-only inputs (`' '`, `'\t'`, `'  \t  '`) through the guard and on to the fetcher.
- **Result:** Single-space, tab, and mixed-whitespace baseUrl inputs are uniformly rejected at all three sites with a friendly Notice / clean error. The fetcher is never invoked for these inputs.
- **Tests:**
  - `tests/ai/probes.test.ts` — 6 new tests under "WR-03-whitespace empty-baseUrl guards — Plan 07-08 Task 2": probeCustom × 3 whitespace shapes, probeOllama × 2 whitespace shapes, plus a regression guard confirming leading/trailing whitespace around a real URL still calls the fetcher (the guard rejects "all-whitespace" only, not "any whitespace").
  - `tests/ai/probe-debounce.test.ts` — 2 new tests for testActiveAIConnection: custom + ollama with single-space and tab inputs respectively, asserting Notice text + `probe NOT called` + `aiProbeInflight.size === 0`.
- **Regression guard:** Existing CR-02 strict-empty fixtures from 07-07 continue to pass — `!''.trim()` is `!''` which is `true`, so the new condition is a strict superset of the old.

### WR-01-test-gap — MockSettings now exposes setProviderConfig + disclosure-gate persistence is unit-tested

- **File:** `tests/ai/aiClient.test.ts`
- **Change:**
  - `MockSettings` interface gained `setProviderConfig: (p: string, cfg: Record<string, unknown>) => Promise<void>`.
  - `makeMockSettings` factory rebuilt with a stateful in-memory `Map<string, Record<string, unknown>>` backing both `getProviderConfig` and `setProviderConfig`. The factory signature changed from `makeMockSettings(overrides)` to `makeMockSettings({ startingCfg?, overrides? })` — the two existing call sites that passed flat overrides were updated.
  - 3 new tests appended to the `Phase 07 AIClient — probe` describe block:
    1. **Continue path** — ack:false starting cfg, `requireDisclosure` returns true → `setProviderConfig` called once with the ack:true persistence shape; adapter probe reached.
    2. **Second-probe ack-respect** — after first probe persists ack:true via the stateful map, the second probe call does NOT re-fire the disclosure helper; both probes hit the adapter.
    3. **Cancel path** — `requireDisclosure` returns false → result is `{ok:false, errorMessage:'AI call cancelled'}`, `setProviderConfig` is NEVER called, adapter probe never reached.
- **Result:** The disclosure-gate Continue path that was previously untestable (would crash with `setProviderConfig is not a function`) is now exercised at the unit level. The persistence call shape, the second-probe re-read flow, and the cancel-branch non-persistence are all asserted.

## Test Counts

- **Before plan:** 925 passing (per 07-VERIFICATION.md baseline)
- **After plan:** 941 passing, 3 skipped, 0 failed
- **Delta:** +16 tests (5 logger Category 5, 6 probes WR-03-whitespace, 2 probe-debounce WR-03-whitespace, 3 aiClient WR-01-test-gap = 16; matches actual delta exactly)

## Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1 RED | `b1f3540` | test | Failing tests for CR-01-A + WR-02-separator |
| 1 GREEN | `cd908ad` | feat | Logger separator preservation + Bearer keyword guard |
| 2 RED | `f5e834a` | test | Failing whitespace-only baseUrl guard tests |
| 2 GREEN | `44dc97f` | fix | Whitespace-aware empty-baseUrl guards (3 sites) |
| 3 | `9c38e24` | test | Stateful MockSettings + disclosure-gate persistence tests |

## Verification Outcomes

- `npx vitest run tests/shared/logger.test.ts` — 19 passed (5 new + 14 existing)
- `npx vitest run tests/ai/probes.test.ts tests/ai/probe-debounce.test.ts` — 31 passed (8 new + 23 existing)
- `npx vitest run tests/ai/aiClient.test.ts` — 8 passed (3 new + 5 existing)
- `npm test` — 941 passed, 3 skipped, 0 failed (full regression)
- `npx tsc --noEmit` — exit 0 (TypeScript clean)
- `bash scripts/check-no-obsidianfetch-in-lc.sh` — exit 0 (LC-isolation invariant intact)

## Deviations from Plan

None — plan executed substantially as written. Two minor implementation details worth noting:

1. **Captured-separator scope.** The plan suggested capturing `[=:]` as a single character group (`\s*([=:])\s*`) and replaying it; that approach normalized whitespace around the separator (e.g., `'x-api-key: val'` → `'x-api-key:[REDACTED]'`, losing the space). Switched to capturing the full `(\s*[=:]\s*)` so original whitespace is preserved verbatim. This is an internal regex shape change that produces strictly better behavior than the plan's suggested form (matches the plan's "preserves separator" must-have truth more faithfully — `'x-api-key: val'` → `'x-api-key: [REDACTED]'`).

2. **Factory signature breakage in MockSettings refactor.** The plan asked to "extend `makeMockSettings`" with a stateful map. To accommodate the optional `startingCfg` parameter cleanly, the factory signature changed from `makeMockSettings(overrides: Partial<MockSettings>)` to `makeMockSettings({ startingCfg?, overrides? })`. Two existing callers (`getActiveAIProvider: () => null` and `addCostLedger: ledgerSpy`) were updated to use `{ overrides: ... }`. No production code touched; all 5 existing aiClient tests still pass.

## Threat Surface

No new attack surface. All four advisories were correctness/UX defects with no security-impact:

- **CR-01-A and WR-02-separator** are log-line readability fixes. No real secret was ever exposed by the v07-07 shape — the regex was over-eager but still redacted the bytes. The fixes restore contract fidelity to the documented separator/keyword-preservation promises.
- **WR-03-whitespace** prevents whitespace-only baseUrl from being constructed into a malformed URL. Pre-existing risk was a UX defect (confusing fetcher exception), not a secret leak — empty-key custom/ollama don't attach an Authorization header, so nothing sensitive could ride a malformed request.
- **WR-01-test-gap** is purely test-side coverage; the production code under test was already correct.

## Self-Check: PASSED

Files created/modified verified:
- `src/shared/logger.ts` — FOUND (Category 5 separator + lookahead changes present)
- `src/main.ts` — FOUND (`!cfg.baseUrl?.trim()` at testActiveAIConnection)
- `src/ai/providers/openaiCompatible.ts` — FOUND (`!cfg.baseUrl?.trim()` at probeCustom)
- `src/ai/providers/ollama.ts` — FOUND (`!cfg.baseUrl?.trim()` at probeOllama)
- `tests/shared/logger.test.ts` — FOUND (Category 5 block appended)
- `tests/ai/probes.test.ts` — FOUND (WR-03-whitespace block appended)
- `tests/ai/probe-debounce.test.ts` — FOUND (2 new whitespace tests appended)
- `tests/ai/aiClient.test.ts` — FOUND (MockSettings rebuilt + 3 new tests)
- `.planning/phases/07-ai-provider-foundation/07-08-SUMMARY.md` — FOUND (this file)

Commits verified in `git log`:
- `b1f3540` — RED Task 1
- `cd908ad` — GREEN Task 1
- `f5e834a` — RED Task 2
- `44dc97f` — GREEN Task 2
- `9c38e24` — Task 3
