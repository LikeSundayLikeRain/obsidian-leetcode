---
phase: 03-run-submit
plan: 03
subsystem: solve
tags: [primitives, errors, throttle, types, cache-schema]
dependency-graph:
  requires:
    - "03-01: Phase 1 throttle + requestUrlFetcher + activeThrottle singleton"
    - "Phase 2: DetailCacheEntry schema + NoteWriter.toDetailCacheEntry mapping site"
  provides:
    - "NoCodeBlockError / InProgressError / JudgeTimeoutError / AbortError / UnknownVerdictError (src/shared/errors.ts)"
    - "throttledRequestUrl(params) helper (src/api/requestUrlFetcher.ts) — raw RequestUrlResponse, reuses Phase 1 throttle, throws RateLimitError on 429"
    - "DetailCacheEntry.internalQuestionId optional field + shape-guard + SettingsStore.getInternalQuestionId(slug) accessor"
    - "LeetCodeProblemDetail.questionId?: string | null passthrough + NoteWriter cache mapper populates internalQuestionId"
    - "src/solve/types.ts — SubmissionContext + InterpretArgs + SubmitArgs + CheckArgs + PendingCheckResponse + RunCheckResponse + SubmitCheckResponse + CheckResponse + isTerminal"
  affects:
    - "Plan 04 (leetcodeRest.ts) will import args + response types + throttledRequestUrl"
    - "Plan 05 (SubmissionOrchestrator) will throw SubmissionError subtypes"
    - "Plan 06 (VerdictModal) will consume UnknownVerdictError.payload for D-15 copy-to-clipboard"
tech-stack:
  added: []
  patterns:
    - "Discriminated union + type predicate (isTerminal) for exhaustive narrowing"
    - "Module-scoped activeThrottle singleton shared between GraphQL shim + REST helper (single throttle bucket, D-25)"
    - "Optional schema extension with shape-guard backward-compat (old cache entries without internalQuestionId remain valid)"
key-files:
  created:
    - "src/solve/types.ts"
    - "tests/solve/errors.test.ts"
    - "tests/solve/throttled-request-url.test.ts"
    - "tests/solve/internal-question-id.test.ts"
    - "tests/solve/solve-types.test.ts"
  modified:
    - "src/shared/errors.ts (+45 lines: 5 SubmissionError classes)"
    - "src/api/requestUrlFetcher.ts (+45 lines: throttledRequestUrl + RequestUrlParam/Response type import)"
    - "src/settings/SettingsStore.ts (+14 lines: internalQuestionId field + shape-guard + getInternalQuestionId accessor)"
    - "src/api/LeetCodeClient.ts (+7 lines: questionId?: string | null on LeetCodeProblemDetail)"
    - "src/notes/NoteWriter.ts (+9 lines: NoteWriterDetail.questionId field + toDetailCacheEntry passthrough)"
decisions:
  - "throttledRequestUrl lives in src/api/requestUrlFetcher.ts (not throttle.ts) — consumes the module-scoped activeThrottle directly; avoids adding a getter just for cross-module state access"
  - "Index signature [k: string]: unknown on Run/SubmitCheckResponse — forward-compat with LC field drift; also supports UnknownVerdictError.payload preserving raw response"
  - "isTerminal narrows state === 'SUCCESS' (rather than checking absence of PENDING/STARTED) — canonical form per LC wire protocol"
  - "SettingsStore.getInternalQuestionId returns null (not undefined) for missing/absent entries — consistent with sibling getProblemDetail null semantics"
  - "NoteWriterDetail mirrors the questionId field instead of importing LeetCodeProblemDetail — preserves Phase 2 convention of structural NoteWriterDetail + runtime-only isSessionExpired import"
metrics:
  duration: "4m 38s"
  completed: 2026-05-08
  tasks_completed: 5
  tests_added: 26
  test_suite_total: "38 files, 204 tests passing (up from 37 files / ~178 tests)"
  regression_failures: 0
  tsc_errors: 0
---

# Phase 3 Plan 03: Primitives & Infrastructure Summary

**One-liner:** SubmissionError hierarchy + throttledRequestUrl REST helper + src/solve/types.ts discriminated union + internalQuestionId cache extension — all primitives Plan 04's leetcodeRest.ts depends on.

## What Shipped

### Task 1 — src/shared/errors.ts

Five new error classes added after Phase 1's existing `SessionExpiredError` / `RateLimitError` / `NetworkError`:

| Class | Purpose | Consumed by |
|-------|---------|-------------|
| `NoCodeBlockError` | Active note has no fenced code block (D-04) | Plan 05 SubmissionOrchestrator |
| `InProgressError` | Second submission while one is in flight (D-24) | Plan 05 SubmissionOrchestrator |
| `JudgeTimeoutError` | Polling exceeded the 60s cap (D-22) | Plan 05 SubmissionOrchestrator |
| `AbortError` | User clicked Cancel in verdict modal (D-23) | Plan 05 SubmissionOrchestrator |
| `UnknownVerdictError` | LC returned a status outside the recognized set (D-15) | Plan 06 VerdictModal copy-payload action |

`UnknownVerdictError` carries `public readonly payload: unknown` — the full `/check/{id}` JSON body is held by-reference (no clone) so the modal's "Copy payload" button can serialize the exact wire bytes.

### Task 2 — src/api/requestUrlFetcher.ts `throttledRequestUrl`

```typescript
export async function throttledRequestUrl(
  params: RequestUrlParam,
): Promise<RequestUrlResponse>
```

**Final location:** `src/api/requestUrlFetcher.ts`. Plan 04 imports as `import { throttledRequestUrl } from '../api/requestUrlFetcher'`.

Behavior:
- Consumes the module-scoped `activeThrottle` directly (no cross-module getter added — `getActiveThrottle()` stays as the read-only observer for Plan 06's footer indicator).
- Throws `Error('throttledRequestUrl: fetcher not installed')` if called before `installRequestUrlFetcher()` (plugin startup race; Plan 05 guards this).
- Passes `throw: false` so callers see every status code (REST verdict flow needs 4xx for session-expiry disambiguation per CF-04).
- Parses `Retry-After` header (seconds → ms, fallback 10_000 ms) and throws `RateLimitError` on 429.
- `finally` block guarantees throttle release on every exit path (success, 429, thrown network error).

Returns raw `RequestUrlResponse` — callers read `res.json` / `res.status` / `res.headers` directly. No fetch `Response` wrapper (that's reserved for the GraphQL shim which the library's fetcher contract expects).

### Task 3 — internalQuestionId plumbing

Three files touched in coordinated change:

**src/settings/SettingsStore.ts:**
- `DetailCacheEntry` gains `internalQuestionId?: string`.
- `isValidDetailCacheEntry` rejects non-string values; accepts `undefined` (optional).
- New accessor: `getInternalQuestionId(slug): string | null`.

**src/api/LeetCodeClient.ts:**
- `LeetCodeProblemDetail` gains `questionId?: string | null`. The library's `DetailedProblem` already exposes this field, so no `getProblemDetail` mapping change was needed — the raw object flows through unchanged.

**src/notes/NoteWriter.ts:**
- `NoteWriterDetail` mirrors the new `questionId?: string | null` field.
- `toDetailCacheEntry` passes `questionId` through to `internalQuestionId` in the cache entry.

Backward compat verified: the shape-guard tolerates old cache entries lacking the field.

### Task 4 — src/solve/types.ts

New module exports nine type contracts:

```
SubmissionContext, InterpretArgs, SubmitArgs, CheckArgs,
PendingCheckResponse, RunCheckResponse, SubmitCheckResponse, CheckResponse,
isTerminal
```

The three `CheckResponse` variants share a discriminated tag (`state`). The Run/Submit variants carry an index signature (`[k: string]: unknown`) for forward-compat with LC field drift — critical for D-15 which preserves the raw payload on `UnknownVerdictError`.

Imports only `AuthCookies` type from `../auth/types` — no runtime dependencies.

### Task 5 — Regression check

- `npm test`: 38 test files / 204 tests — all passing.
- `npx tsc --noEmit`: exit 0, zero new errors.
- `grep -rn "from '.*solve/types'" src/`: zero matches — consistent with plan (Plan 04+ will import).

## Deviations from Plan

**None — plan executed exactly as written.**

One minor clarification on Part B of Task 3: the plan said to locate the `getProblemDetail` mapping and extend it to include `questionId: detail.questionId ?? null`. On inspection, `getProblemDetail` returns the raw library `q` object cast to `LeetCodeProblemDetail` without a field-by-field mapping — so adding the field to the interface alone is sufficient. This is consistent with the plan's intent (the library already returns `questionId`).

## Authentication Gates

None hit during execution. No network work in this plan.

## Known Stubs

None. All new code is production-ready; no placeholder values, no "coming soon" strings, no unwired components.

## Self-Check: PASSED

- `src/solve/types.ts` exists.
- `src/shared/errors.ts` contains 5 new SubmissionError classes.
- `src/api/requestUrlFetcher.ts` exports `throttledRequestUrl`.
- `src/settings/SettingsStore.ts` has `internalQuestionId` field + `getInternalQuestionId` accessor.
- `src/api/LeetCodeClient.ts` has `questionId` on `LeetCodeProblemDetail`.
- `src/notes/NoteWriter.ts` has `NoteWriterDetail.questionId` + `toDetailCacheEntry` passthrough.
- All commits present: b526f52, 280fa38, c06a966, 9c29422, 84279a3, a6b9abf, e90dcaf, 3954d3f.

## Next Steps for Plan 04

- Import `throttledRequestUrl` from `'../api/requestUrlFetcher'`.
- Import `InterpretArgs` / `SubmitArgs` / `CheckArgs` / `CheckResponse` / `isTerminal` from `'./types'`.
- When building the POST body, read `question_id` from `settings.getInternalQuestionId(slug)` — Plan 03 guarantees this is populated on cache writes from Phase 2 onward.

## TDD Gate Compliance

All four behavior-adding tasks (1, 2, 3, 4) followed strict RED → GREEN commits:

| Task | RED commit | GREEN commit |
|------|------------|--------------|
| 1 — SubmissionError hierarchy | b526f52 | 280fa38 |
| 2 — throttledRequestUrl | c06a966 | 9c29422 |
| 3 — internalQuestionId | 84279a3 | a6b9abf |
| 4 — src/solve/types.ts | e90dcaf | 3954d3f |

Task 5 was verification-only; no files written, no commit needed.
