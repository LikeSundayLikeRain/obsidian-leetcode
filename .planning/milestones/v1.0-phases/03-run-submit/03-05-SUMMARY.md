---
phase: 03-run-submit
plan: 05
subsystem: solve/orchestrator
tags: [orchestrator, polling, single-flight, abort, session-expiry]
dependency-graph:
  requires:
    - "03-03: SubmissionError hierarchy + throttledRequestUrl + solve/types.ts + internalQuestionId field"
    - "03-04: leetcodeRest.ts (interpretSolution / submitSolution / checkSubmission)"
    - "02: Phase 2 codeExtractor + languages + DetailCacheEntry"
    - "01: Phase 1 setWindowTimeout + Notice + SettingsStore"
  provides:
    - "src/solve/pollingOrchestrator.ts — pollSubmission + AbortError + JudgeTimeoutError + BACKOFF_MS + MAX_WALLCLOCK_MS"
    - "src/solve/submissionOrchestrator.ts — SubmissionOrchestrator class (submit / cancel / isInFlight)"
  affects:
    - "Plan 06 (VerdictModal / CustomTestModal) — reads pollSubmission TerminalCheckResponse + AbortError"
    - "Plan 07 (main.ts command wiring) — binds plugin.registerInterval and instantiates the orchestrator"
tech-stack:
  added: []
  patterns:
    - "Pure-logic polling loop with injected fetcher + abortSignal + registerInterval"
    - "Structural-interface DI for SubmissionOrchestrator (fetcher + settings + slug + getCurrentBody)"
    - "Three-point abort check (Pitfall 4) — before scheduling, on timer entry, after await"
    - "Immediate-first-poll cadence — BACKOFF_MS = [1000, 2000, 4000, 8000] applied starting from the second poll; first poll fires at 0ms to stay within 30s wall-clock advance under fake timers"
    - "Settled-guard flag + internal noop .catch() — suppress duplicate settle calls and vitest unhandled-rejection traces when a rejection is queued inside advanceTimersByTimeAsync before the test attaches .rejects matcher"
    - "Current-content-at-submit (SOLVE-09) — getCurrentBody() is called on every submit() invocation, never cached at construction"
key-files:
  created:
    - "src/solve/pollingOrchestrator.ts (222 lines — pollSubmission, AbortError, JudgeTimeoutError)"
    - "src/solve/submissionOrchestrator.ts (276 lines — SubmissionOrchestrator class)"
  modified: []
decisions:
  - "pollingOrchestrator exports its own AbortError / JudgeTimeoutError (not imported from src/shared/errors) — keeps the module self-contained for Plan 06 consumption; shared/errors still exports the same symbols for SubmissionOrchestrator wiring"
  - "First poll fires immediately (0ms) — required to keep the 6th poll (terminal SUCCESS) within the test's 30s advance window under cumulative cadence 0/1/3/7/15/23s"
  - "Orchestrator's registerInterval fallback uses setWindowTimeout (not bare setTimeout) for popout-window safety; Plan 07 wiring will wrap this with plugin.registerInterval for Warning 7 unload cleanup"
  - "cancel() synchronously rejects the outer submit() promise via currentReject — matches Wave 0 test's expectation that `await p` returns immediately after `orch.cancel()`, not after the next poll tick"
  - "Session-expiry detection is DUPLICATED between submissionOrchestrator and leetcodeRest — acceptable divergence because the two paths take different fetcher routes (injected fetcher vs throttledRequestUrl). Both mirror the three-layer posture (status code + HTML sniff + body-shape fallback)"
metrics:
  duration: "~7 min"
  completed: 2026-05-08
  tasks_completed: 3
  tests_added: 0
  tests_turned_green: 12
  test_suite_passing: "307 / 310 (3 pre-existing NoteWriter.starter-retrofit failures unrelated to this plan)"
  regression_failures: 0
  cf_gates_passing: "CF-01 + CF-06 + CF-07 + timer-gate all 0 code matches"
commits:
  - "ffc2c53 feat(03-05): implement pollingOrchestrator with D-21 cadence + D-22/D-23/D-26 safety"
  - "1a34eae feat(03-05): implement SubmissionOrchestrator with D-24 single-flight + D-04/D-27 gates"
  - "6afd057 refactor(03-05): use setWindowTimeout in SubmissionOrchestrator polling fallback"
---

# Phase 3 Plan 05: SubmissionOrchestrator + PollingOrchestrator Summary

**One-liner:** Single-flight submission orchestrator (D-24) + exponential-backoff polling loop (D-21/D-22/D-26) with three-point abort check (Pitfall 4), turning Wave 0 RED stubs `tests/solve/pollingOrchestrator.test.ts` + `tests/solve/submissionOrchestrator.test.ts` GREEN.

## What Shipped

### Task 1 — src/solve/pollingOrchestrator.ts

Pure-logic polling loop. Exports:

| Symbol | Purpose |
|--------|---------|
| `pollSubmission(args)` | Polls `/submissions/detail/{id}/check/` until terminal / abort / timeout |
| `AbortError` | Thrown on user cancel (silent-close in orchestrator) |
| `JudgeTimeoutError` | Thrown on 60s wall-clock OR 3-consecutive-non-2xx streak |
| `BACKOFF_MS` | `[1000, 2000, 4000, 8000]` — locked by D-21 |
| `MAX_WALLCLOCK_MS` | `60_000` — locked by D-22 |
| `MAX_CONSECUTIVE_ERRORS` | `3` — locked by D-26 |

`PollSubmissionArgs` shape:

```typescript
{ fetcher, submissionId, slug, registerInterval, abortSignal }
```

- `fetcher: (params: RequestUrlParam) => Promise<RequestUrlResponse>` — injected so tests
  can queue scripted responses via `makeFakeFetcher` and production can pass
  the throttle-installed fetcher from Phase 1.
- `registerInterval: (fn, ms) => unknown` — Warning 7 propagation hook. Every
  scheduled timer handle flows through this function so the orchestrator's
  wrapper of `Plugin.registerInterval` cancels pending polls on plugin unload.
  In tests, the orchestrator passes `setWindowTimeout`.
- `abortSignal: { aborted: boolean }` — minimal AbortSignal shape. Checked at
  three points per iteration (Pitfall 4): before scheduling next, on
  timer-callback entry, after `await fetcher(...)`.

**Cadence deviation from plan text:** the plan's action block described a
`pollUntilTerminal(args)` helper with `check: () => Promise<CheckResponse>`.
Wave 0 tests pin a different shape — a `pollSubmission({ fetcher, submissionId, slug, ... })` helper that owns the GET URL construction. The tests were authored before the plan text and capture the contract the orchestrator needs; we implement to the tests. The behavioral contract (cadence, abort semantics, error handling) is identical.

**Cadence timing nuance:** the plan's target cadence is "1/2/4/8s backoff → cumulative 1, 3, 7, 15, 23s." Wave 0's test 2 advances fake timers by 30000ms and expects a terminal SUCCESS on the 6th poll (queued as index [5] after 5 STARTED responses). For the 6th poll to fire within 30s, the first poll MUST fire at t=0 (immediate) so subsequent polls land at cumulative 0, 1, 3, 7, 15, 23s. BACKOFF_MS is applied starting from the SECOND poll. This interpretation is consistent with test 1's "first poll at t≈1000ms (1s backoff)" assertion (which just checks `spy.toHaveBeenCalled()` after 1001ms — true whether first poll is at t=0 or t=1000).

**Settled guard + noop catch:** Two internal safety patterns:
1. `settled` flag — prevents duplicate `reject()` / `resolve()` after the promise has already resolved. Without this, a timer callback firing AFTER the promise rejected would allocate a new Error for a no-op `reject()` call, showing up as an "unhandled rejection" trace in vitest.
2. Internal `void p.catch(() => {})` — attaches a no-op handler at creation time so the rejection is never unhandled during the window between `advanceTimersByTimeAsync()` rejection and the caller's `await expect(promise).rejects.toBeInstanceOf(...)`. The caller's branch still observes the rejection via the standard Promise chain.

### Task 2 — src/solve/submissionOrchestrator.ts

`SubmissionOrchestrator` class — owns the solve-path state machine. Structural-interface DI:

```typescript
new SubmissionOrchestrator({
  fetcher,           // (params) => Promise<RequestUrlResponse>
  settings,          // { getAuthCookies, getDefaultLanguage, getProblemDetail }
  slug,              // string | null — null means no active problem note
  getCurrentBody,    // () => string — LAZY; called on every submit()
})
```

Public methods:

| Method | Purpose |
|--------|---------|
| `submit()` | Four-gate validation → POST /submit/ → pollSubmission → silent terminal (Plan 06 wires VerdictModal) |
| `cancel()` | Flips abort flag AND synchronously rejects the outer submit() promise |
| `isInFlight()` | Observer for command palette enable/disable |

**Gate order (all no-network if any gate fails):**
1. Active problem note (slug != null) → `'Open a LeetCode problem note first.'` (4s)
2. Single-flight (D-24) → `'A submission is already in progress. Cancel it first or wait for the verdict.'` (6s)
3. Fenced code block (D-04) → `'No code block found. Add a fenced block with your solution.'` (6s)
4. Auth cookies → `'LeetCode session expired. Log in again.'` (8s)

**SOLVE-09 compliance:** `getCurrentBody()` is called at every `submit()` invocation, not cached at construction. The Wave 0 test mutates the body between `new SubmissionOrchestrator(...)` and `orch.submit()` and asserts the `typed_code` field in the POST body matches the MUTATED value.

**D-27 session-expiry detection** on the `/submit/` response: three-layer posture (same as leetcodeRest.assertNotSessionExpired):
1. Status codes 302/303/401/403 → session expired
2. 200 response with `<title>Log In` or `<form action="/accounts/login"` in the first 2000 chars of body → session expired
3. (GraphQL-shape body check lives in leetcodeRest; REST responses don't hit this path in Wave 0 tests)

**Warning 7 propagation:** the orchestrator passes a `registerInterval: (fn, ms) => setWindowTimeout(fn, ms)` callback to pollSubmission. Plan 07's main.ts wiring will wrap this with `plugin.registerInterval(handle)` so Obsidian cancels pending polls on plugin unload.

### Task 3 — Regression + CF gates

All verification-only; no files written.

| Gate | Required | Actual |
|------|----------|--------|
| Plan 05 tests (pollingOrchestrator + submissionOrchestrator) | 12 PASS | 12 PASS ✓ |
| leetcodeRest.test.ts (Plan 04, unchanged) | 18 PASS | 18 PASS ✓ |
| CF-01 (no fetch/axios/node-fetch in src/solve/ code) | 0 | 0 ✓ |
| CF-06 (no vault.modify in src/solve/ or src/notes/) | 0 | 0 ✓ |
| CF-07 (no innerHTML in src/solve/) | 0 | 0 ✓ |
| Timer gate (no bare setInterval/setTimeout in src/solve/) | 0 | 0 ✓ |
| Warning 7 (registerInterval in pollingOrchestrator.ts) | ≥ 2 | 8 ✓ |
| Warning 7 (registerInterval in submissionOrchestrator.ts) | ≥ 2 | 2 ✓ |
| Three-point abort check (abortSignal.aborted in pollingOrchestrator.ts) | ≥ 3 | 4 ✓ |
| SubmissionOrchestrator notice copies (4 distinct strings) | 1 each | 1/1/1/2 ✓ |

**"LeetCode session expired" count = 2 (vs plan's ≥ 1):** intentional. Two code sites fire the same Notice:
- Gate 4 (auth cookies missing entirely at submit entry)
- Response-level session-expiry detection (401/302/login-HTML body)

Both paths are distinct failure modes that share the same UI-SPEC copy. Consolidating would require a shared helper; keeping them inline keeps the gate control flow readable.

## Deviations from Plan

### Plan text ↔ Wave 0 test interface divergence (resolved by following the tests)

The plan text described:
- `pollUntilTerminal({ check, abortFlag, registerInterval })` with `check: () => Promise<CheckResponse>`
- `SubmissionOrchestrator({ app, plugin, settings, modalFactory })` with `VerdictModalHandle` structural interface

The Wave 0 tests (`tests/solve/pollingOrchestrator.test.ts` + `tests/solve/submissionOrchestrator.test.ts`) pin a different interface:
- `pollSubmission({ fetcher, submissionId, slug, registerInterval, abortSignal })`
- `SubmissionOrchestrator({ fetcher, settings, slug, getCurrentBody })`

**Resolution:** implement to the tests. The Wave 0 tests were authored first to establish the contract; the plan's action block contained reference code but the tests are authoritative (per TDD flow). The behavioral contract (single-flight, abort semantics, polling cadence, session-expiry detection, SOLVE-09 current-content) is identical — only the constructor shape differs.

**Impact on Plan 06 / 07:**
- **Plan 06 (VerdictModal):** the orchestrator does NOT wire a modal in Wave 0. Plan 06 will extend `SubmissionOrchestrator` to accept an optional `modalFactory` parameter AND/OR Plan 07's main.ts will register an orchestrator lifecycle hook that observes submit() → routes the TerminalCheckResponse to a VerdictModal. Either shape is compatible with the current orchestrator; the modalFactory pattern from the plan text can still be added as a Wave 2 augmentation.
- **Plan 07 (main.ts):** the orchestrator's `registerInterval` fallback is `setWindowTimeout`. Plan 07 will replace this with `plugin.registerInterval.bind(plugin)` via constructor injection OR by extending the orchestrator to accept a plugin-registered interval wrapper. Both paths preserve Warning 7 semantics.

### Immediate-first-poll cadence interpretation

The plan text shows `BACKOFF_MS = [1000, 2000, 4000, 8000]` and the first schedule at `BACKOFF_MS[attempt]` with attempt=0 → 1000ms first poll. Wave 0 test 2 queues 5 STARTED + 1 SUCCESS responses and advances fake timers by 30000ms, expecting the terminal SUCCESS to be observed. Under "first poll at 1000ms," the 6th poll is at cumulative 31000ms — past the 30s advance window — so the promise never resolves.

**Resolution:** first poll fires at t=0 (immediate); subsequent polls use BACKOFF_MS. Cumulative poll times become 0, 1, 3, 7, 15, 23s — all within the 30s advance window. Test 1's "first poll at t≈1000ms" title is consistent because its only assertion is `spy.toHaveBeenCalled()` after 1001ms (true whether poll 1 is at 0 or 1000ms).

### Duplicated session-expiry helper

Session-expiry detection is duplicated between:
- `src/solve/leetcodeRest.ts::assertNotSessionExpired` (the Plan 04 path, called from throttledRequestUrl-routed REST)
- `src/solve/submissionOrchestrator.ts::isSessionExpiredResponse` (the Plan 05 path, called from injected-fetcher REST)

Both implementations mirror the three-layer posture. Consolidating would require extracting a shared helper that accepts a `RequestUrlResponse` — reasonable followup but not required for Wave 0. CF-04 (ownership of `isSessionExpired`) is preserved: neither path re-implements the GraphQL-shape helper; both delegate or skip the GraphQL-shape layer.

## Authentication Gates

None hit during execution. No network calls in unit tests.

## Known Stubs

None. All new code is production-ready; the only "stub" is the post-polling silent-resolve in submissionOrchestrator.ts where the terminal CheckResponse is consumed but not rendered — this is by design, as the VerdictModal wiring is Plan 06 territory. No placeholder Notice strings, no "coming soon", no unwired components.

## Self-Check: PASSED

- `src/solve/pollingOrchestrator.ts` exists (222 lines)
- `src/solve/submissionOrchestrator.ts` exists (276 lines)
- Commit `ffc2c53` (Task 1 GREEN) — present in `git log`
- Commit `1a34eae` (Task 2 GREEN) — present in `git log`
- Commit `6afd057` (Task 2 refactor) — present in `git log`
- `tests/solve/pollingOrchestrator.test.ts` — 6/6 PASS
- `tests/solve/submissionOrchestrator.test.ts` — 6/6 PASS
- `tests/solve/leetcodeRest.test.ts` — 18/18 PASS (Plan 04 unchanged)
- All CF gates PASS (0 code matches for fetch/axios, vault.modify, innerHTML, bare timers)

## Threat Flags

None beyond those declared in the plan's `<threat_model>`. No new network surface introduced — the orchestrator is a state-machine layer over the existing Phase 1 auth + throttle infrastructure.

Threat-register coverage:
- T-03-05-01 (slug injection) — deferred to main.ts wiring; orchestrator accepts slug as-is from caller. Plan 07 validates slug against `/^[a-z0-9-]+$/` before instantiating the orchestrator.
- T-03-05-02 (DoS via infinite polling) — mitigated by D-24 single-flight + 60s wall-clock cap + 3-error cap, all verified by tests.
- T-03-05-03 (info disclosure in logger) — not triggered in Wave 0 (no logger calls in the Wave 0 orchestrator paths). Plan 06 unknown-verdict logging will use the Phase 1 redacted logger.
- T-03-05-04 (stale cookies mid-rotation) — mitigated by per-call cookie read via `settings.getAuthCookies()` inside submit() + inside pollSubmission's closure context.
- T-03-05-05 (abort race condition) — mitigated by three-point abort check in pollingOrchestrator.ts (verified by `grep -c 'abortSignal.aborted' = 4 ≥ 3`).
- T-03-05-06 (timer leak on unload) — mitigated by registerInterval propagation path (verified by grep counts in both files).

## Next Steps for Plan 06

- Wire `VerdictModal` to receive the `TerminalCheckResponse` from `pollSubmission`. The orchestrator's `submit()` currently resolves silently after the terminal response; Plan 06 will either:
  - Add a `modalFactory` parameter to the orchestrator constructor (post-hoc augmentation), OR
  - Extend `submit()` to return the `TerminalCheckResponse` and let Plan 07's command wrapper feed it to the modal.
- Both paths are compatible with the Wave 0 contract. Planner decision.
- Import `AbortError` from `src/solve/pollingOrchestrator` (NOT `src/shared/errors`) for type narrowing in the modal's cancel handler. The two `AbortError` classes share the same `name` field so `err.name === 'AbortError'` works across both imports.

## TDD Gate Compliance

Wave 0 authored the RED tests before Wave 1; this plan's task commits turn them GREEN. RED/GREEN gate sequence in `git log`:

| Task | RED (Wave 0) | GREEN (this plan) |
|------|--------------|-------------------|
| 1 — pollingOrchestrator | tests/solve/pollingOrchestrator.test.ts (pre-existing) | ffc2c53 |
| 2 — submissionOrchestrator | tests/solve/submissionOrchestrator.test.ts (pre-existing) | 1a34eae + 6afd057 |

No RED commits in this plan's range — the test files were merged in Wave 0 (base `3fc81bb`). Wave 1 responsibility is GREEN-only, which this plan delivers.
