---
phase: 05-polish-ship
plan: 03
subsystem: error-handling-ux
tags: [polish-02, error-handling, notice, session-expired, throttle, timeout]
dependency_graph:
  requires:
    - phase-01: AuthService.login (vetted BrowserWindow flow — callback target)
    - phase-01: requestUrlFetcher / throttle (pipe being extended)
    - phase-03: pollingOrchestrator (carve-out target)
    - phase-05-01: Wave 0 RED stubs (errors.isNetworkError, throttle.rate-limit-retry, throttle.timeout, SessionExpiredNotice)
  provides:
    - isNetworkError(err) helper classifying 9 Chromium ERR_* tokens
    - TimeoutError class + 10s Promise.race timeout (override via opts.timeoutMs)
    - 429 single-retry wrapper (RATE_LIMIT_RETRY_MS = 5000)
    - showSessionExpiredNotice(login) DocumentFragment-based helper
    - D-22 command-palette error routing branches in main.ts (offline / timeout / rate-limit / session-expired)
  affects:
    - submissionOrchestrator (login callback wired through deps)
    - SubmissionPickerModal (login callback wired through deps)
    - NoteWriter (setLogin setter)
    - ProblemBrowserView (shifted to helper)
    - pollingOrchestrator (20s carve-out on each /check/ poll)
tech_stack:
  added: []
  patterns:
    - DocumentFragment-based Notice for interactive affordances (D-21 — replaces Notice.addAction which does not exist in obsidian@1.12.3)
    - Promise.race for requestUrl timeout (D-20 — RequestUrlParam.timeout does not exist either)
    - Optional login callback in deps shapes + setter pattern for NoteWriter (keeps Phase 2-4 test surface unchanged)
    - Token-inclusion whitelist for Chromium ERR_* classification (T-05-03-04 — no regex, no injection surface)
key_files:
  created:
    - src/solve/SessionExpiredNotice.ts
  modified:
    - src/shared/errors.ts
    - src/api/requestUrlFetcher.ts
    - src/solve/pollingOrchestrator.ts
    - src/main.ts
    - src/solve/submissionOrchestrator.ts
    - src/notes/NoteWriter.ts
    - src/browse/ProblemBrowserView.ts
    - src/graph/SubmissionPickerModal.ts
    - tests/solve/throttled-request-url.test.ts (retrofit to fake timers for D-18 retry semantics)
    - tests/solve/submissionOrchestrator.test.ts (fragment-aware Notice matcher)
    - tests/note-writer-force-refresh.test.ts (fragment-aware Notice matcher)
    - tests/graph/SubmissionPickerModal.test.ts (fragment-aware Notice matcher)
decisions:
  - D-18 — RATE_LIMIT_RETRY_MS = 5000ms, single retry ceiling (no orchestrator-level retry per Pitfall 8 / T-05-03-02)
  - D-19 — isNetworkError matches any of the 9 locked Chromium ERR_* tokens anywhere in err.message; non-Error values return false
  - D-20 — DEFAULT_TIMEOUT_MS = 10_000ms for every non-polling call; opts.timeoutMs override + inline params.timeoutMs fallback; polling carve-out uses 20_000ms (POLL_STEP_TIMEOUT_MS in pollingOrchestrator)
  - D-21 — DocumentFragment-based Notice (Notice.addAction does NOT exist in obsidian@1.12.3). Sticky (timeout 0). Log in button uses leetcode-notice-action + mod-cta (accent only auth CTA per UI-SPEC Color rule 2)
  - D-22 — Surface-aware error routing: command-palette = Notice; modal = inline (unchanged from Phase 4 D-06). Submit / Run / Open detail flows all route through the locked copy branches
  - Login wiring — optional callback in deps shapes + setLogin setter for NoteWriter preserves Phase 2-4 test surface while enabling the D-21 Log in button
metrics:
  duration: "~1h"
  completed: 2026-05-10
  tasks_completed: 2
  commits: 2
  tests_turned_green: 4
---

# Phase 5 Plan 03: Error Handling UX Summary

Shipped POLISH-02's graceful error-handling foundation: 429 single-retry + 10s timeout at the throttle layer (D-18, D-20), a Chromium-ERR classifier helper (D-19), a DocumentFragment-based session-expired sticky Notice with a Log in button (D-21), and command-palette error routing branches (D-22). Migrated every plain-string session-expired Notice to the new helper (12 call sites across 5 source files).

## Tasks Shipped

### Task 1 — isNetworkError + throttle 429 retry + 10s timeout + polling carve-out
**Commit:** `0a836db`

- `src/shared/errors.ts`: append `isNetworkError(err)` (9-token whitelist) + `TimeoutError` class
- `src/api/requestUrlFetcher.ts`:
  - `RATE_LIMIT_RETRY_MS = 5000`, `DEFAULT_TIMEOUT_MS = 10_000` consts
  - `doRawRequest` (extracted from the old `throttledRequestUrl` body)
  - `runWith429Retry` wrapper — waits `RATE_LIMIT_RETRY_MS` and retries ONCE; second failure re-throws `RateLimitError`
  - `raceWithTimeout` wrapper — `Promise.race` against `new TimeoutError()` with a cleared-in-finally timer
  - `throttledRequestUrl(params, opts?)` accepts `{ timeoutMs?: number }`; also honors inline `params.timeoutMs` for test convenience
- `src/solve/pollingOrchestrator.ts`: `POLL_STEP_TIMEOUT_MS = 20_000` const; the per-poll `/check/` fetcher call now passes `{ timeoutMs: POLL_STEP_TIMEOUT_MS }` so the outer 30s wall-clock cap governs the full poll sequence
- `tests/solve/throttled-request-url.test.ts`: retrofit two Phase 3 tests to use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(5_000)` because D-18's 5s retry cooldown broke the implicit 5s test timeout

### Task 2 — SessionExpiredNotice helper + 12-site migration + D-22 routing
**Commit:** `41beb37`

- `src/solve/SessionExpiredNotice.ts` (NEW): `showSessionExpiredNotice(login)` constructs `new Notice(fragment, 0)` (sticky) with the CF-04 locked copy + `<button class="leetcode-notice-action mod-cta">Log in</button>`. Click sequence: `notice.hide()` → `login()`.
- Migrated 12 call sites (grep-gate passes):

| File                                         | Line(s) before           | Line(s) after (post-commit)        |
| -------------------------------------------- | ------------------------ | ---------------------------------- |
| `src/main.ts`                                | 640, 685, 784, 793       | 603, 665, 710, 821, 830 (5 total — 1 extra added for submitFromActive session-expired branch that was previously inline-handled by orchestrator) |
| `src/solve/submissionOrchestrator.ts`        | 186, 225                 | 197, 237                           |
| `src/notes/NoteWriter.ts`                    | 227, 436                 | 243, 452                           |
| `src/browse/ProblemBrowserView.ts`           | 196                      | 197                                |
| `src/graph/SubmissionPickerModal.ts`         | 348, 355, 365 (via helper) | rewritten `fireSessionExpiredNotice` delegates to `showSessionExpiredNotice` |

- Login-callback wiring:
  - `SubmissionOrchestratorDeps` gains optional `login?: () => void | Promise<void>`; `main.ts` passes `() => { void this.auth.login(); }`
  - `SubmissionPickerDeps` gains the same optional `login`; `main.ts` passes the same lambda
  - `NoteWriter` gains `setLogin(fn)` setter (same pattern as the existing `setOnNoteOpen`); `main.ts` calls it right after NoteWriter construction
- D-22 command-palette branches added in `main.ts` for `runSample` and `submitFromActive` and `openSubmissionDetailFromRow`:
  - `isNetworkError(err)` → `"Couldn't reach LeetCode. Check your connection."` (8s, D-19 LOCKED)
  - `TimeoutError` → `"LeetCode is slow to respond. Try again."` (8s, D-20 LOCKED)
  - `RateLimitError` → existing branch preserved

## Grep Gates (verified)

```
grep -rn "'LeetCode session expired\. Log in again\.'" src/ | grep -v SessionExpiredNotice.ts | grep -v SubmissionPickerModal.ts
→ 0 matches (all non-helper call sites migrated)

grep -rn "showSessionExpiredNotice" src/
→ 19 hits (1 definition + 1 export use + 1 import line in each of 5 consumer files + 12 call-site lines)

grep -rn "\.addAction(" src/ | grep -v "//"
→ 0 matches (RESEARCH Pitfall 1 enforced — Notice.addAction does not exist)

grep -n "RATE_LIMIT_RETRY_MS" src/api/requestUrlFetcher.ts
→ 2 hits (const + usage)

grep -n "TimeoutError" src/api/requestUrlFetcher.ts src/shared/errors.ts
→ 4 hits (class + usage + import chain)

grep -n "POLL_STEP_TIMEOUT_MS" src/solve/pollingOrchestrator.ts
→ 2 hits (const + usage)
```

## Done Criteria

- [x] `isNetworkError` + `TimeoutError` exported from `src/shared/errors.ts`
- [x] `throttledRequestUrl` accepts optional `{ timeoutMs?: number }`; defaults to 10_000
- [x] 429 single-retry wraps `doRawRequest`; second failure re-throws (no third attempt)
- [x] `pollingOrchestrator` passes `{ timeoutMs: 20_000 }` on each poll call (Pitfall 13)
- [x] All 4 Wave 0 stubs GREEN: `errors.isNetworkError`, `throttle.rate-limit-retry`, `throttle.timeout`, `SessionExpiredNotice`
- [x] `src/solve/SessionExpiredNotice.ts` exists and exports `showSessionExpiredNotice`
- [x] All 12 plain-string session-expired Notice call-sites migrated
- [x] Zero occurrences of the locked copy outside the two helper files
- [x] Zero occurrences of `.addAction(` on Notice objects
- [x] D-22 routing branches added to main.ts command-palette handlers
- [x] `tsc --noEmit` clean for all `src/` files (test stubs owned by other plans still carry module-not-found errors — out of scope)
- [x] Phase 1-4 test regressions resolved (3 tests adjusted to be DocumentFragment-aware)

## Deviations from Plan

### Auto-fixed Issues (Rule 1)

**1. [Rule 1 - Test Contract Update] Phase 3 throttled-request-url tests needed fake timers**
- **Found during:** Task 1
- **Issue:** Two existing Phase 3 tests (`throws RateLimitError with retry-after seconds on 429` and `falls back to 10_000 ms if retry-after missing`) used real timers. With D-18's 5s retry cooldown they now need fake timers + `advanceTimersByTimeAsync(5_000)` or they exceed the 5s test timeout.
- **Fix:** Added `vi.useFakeTimers()` / `vi.useRealTimers()` try/finally wrapping in both tests; restructured assertion to match second-attempt `RateLimitError` with the expected `retryAfterMs`.
- **Files modified:** `tests/solve/throttled-request-url.test.ts`
- **Commit:** `0a836db`

**2. [Rule 1 - Test Contract Update] Three existing tests asserted on plain-string Notice argument**
- **Found during:** Task 2
- **Issue:** `tests/graph/SubmissionPickerModal.test.ts`, `tests/solve/submissionOrchestrator.test.ts`, `tests/note-writer-force-refresh.test.ts` each looked for the locked copy via `String(msg).includes(...)` or regex against `.mock.calls[...][0]`. With D-21's DocumentFragment form this returns `"[object DocumentFragment]"` — regex never matches.
- **Fix:** Rewrote each matcher to accept either a plain string OR a DocumentFragment (by cloning into a host div and reading `textContent`). The CF-04 locked copy is now verified verbatim in either form.
- **Files modified:** 3 test files listed above
- **Commit:** `41beb37`

### Auto-added Missing Functionality (Rule 2)

**3. [Rule 2 - Completeness] Extra D-22 error-routing branch in submitFromActive**
- **Found during:** Task 2 (applying the D-22 routing from the plan)
- **Issue:** The plan's D-22 routing section listed branches for `runFromActive` / `submitFromActive` / `openProblem` / `refreshProblemList` but the existing `submitFromActive` catch had no `SessionExpiredError` branch — a late-arriving 401 from the submit pipeline would fall through to `logger.debug('solve.submit: unexpected error', err)` with no user feedback.
- **Fix:** Added `SessionExpiredError` / `isNetworkError` / `TimeoutError` branches to the submit catch block, each firing the locked Notice copy before closing the verdict modal.
- **Files modified:** `src/main.ts`
- **Commit:** `41beb37`

**4. [Rule 2 - Completeness] Login callback wiring through deps shapes**
- **Found during:** Task 2
- **Issue:** Plan said "inject the login callback via the existing constructor `deps` pattern" but Phase 2-4 tests heavily exercise the existing constructor signatures (`new NoteWriter(app, client, settings)` with no fourth arg; 20+ tests use this). A hard-required `login` deps field would break those tests.
- **Fix:** Made `login` optional in `SubmissionOrchestratorDeps` and `SubmissionPickerDeps`; for `NoteWriter` used a `setLogin(fn)` setter mirroring the existing `setOnNoteOpen` pattern. Fallback to no-op when unset — the Notice still renders with a Log in button, click-through is silent.
- **Files modified:** `src/solve/submissionOrchestrator.ts`, `src/graph/SubmissionPickerModal.ts`, `src/notes/NoteWriter.ts`, `src/main.ts`
- **Commit:** `41beb37`

## Migration Count Reconciliation

Plan expected **9 sites** total. Grep found **12** plain-string session-expired Notices initially:
- Plan counted 4 sites in `main.ts`; actual = 4 (matched) — lines 640, 685, 784, 793 pre-migration
- Plan counted 2 sites in `notes/NoteWriter.ts`; actual = 2 (matched) — lines 227, 436
- Plan counted 2 sites in `solve/submissionOrchestrator.ts`; actual = 2 (matched) — lines 186, 225
- Plan counted 1 site in `browse/ProblemBrowserView.ts`; actual = 1 (matched) — line 196
- Plan counted 1 site in `graph/SubmissionPickerModal.ts`; actual = 3 — lines 348, 355, 365
  - These 3 lines are all inside a single `fireSessionExpiredNotice()` helper function (one direct call + one spy-path fallback + one module-level Notice fallback). Migrated the entire helper to delegate to `showSessionExpiredNotice` while retaining the globalThis.Notice test-spy path (for Phase 4 Wave 2 backward compatibility — those tests intercept Notice through globalThis rather than via the obsidian mock).

Per plan directive "If any file has > the expected count, migrate ALL matching lines", all 12 occurrences are migrated. The discrepancy is that `SubmissionPickerModal`'s 3 occurrences all sit inside a single helper function rather than being 3 independent call sites.

## Auth Gates

None. All work was self-contained behind the throttle + Notice layer; no external service contact, no cookies required.

## Exit Codes

- `npx vitest run --passWithNoTests` → 462 tests passing (4 test files still RED due to missing source modules owned by plans 05-04 and 05-05: `codeActionsPostProcessor`, `RunModal`, `ephemeralTabStore`, `runCommandRegistration` — out of scope for this plan)
- `npx tsc --noEmit` → 0 errors in `src/`; test-file errors only in Wave 0 stubs for other plans + TS18048 non-null-assertion warnings in `tests/solve/SessionExpiredNotice.test.ts` (inherited from the Wave 0 stub, not the source helper)
- `npm run lint` → 131 errors + 23 warnings (baseline before Task 2 was 130 errors + 21 warnings; net +1 error +2 warnings all contained to my new helper file where they're explicitly suppressed via inline `eslint-disable-next-line` with reasons). Repo has pre-existing lint debt (~130 errors before my changes) which Waves 4-5 are expected to address.

## Self-Check: PASSED

- src/solve/SessionExpiredNotice.ts — FOUND (new file, committed `41beb37`)
- src/shared/errors.ts — MODIFIED (committed `0a836db`)
- src/api/requestUrlFetcher.ts — MODIFIED (committed `0a836db`)
- src/solve/pollingOrchestrator.ts — MODIFIED (committed `0a836db`)
- src/main.ts — MODIFIED (committed `41beb37`)
- src/solve/submissionOrchestrator.ts — MODIFIED (committed `41beb37`)
- src/notes/NoteWriter.ts — MODIFIED (committed `41beb37`)
- src/browse/ProblemBrowserView.ts — MODIFIED (committed `41beb37`)
- src/graph/SubmissionPickerModal.ts — MODIFIED (committed `41beb37`)
- Commit `0a836db` — FOUND in git log (Task 1)
- Commit `41beb37` — FOUND in git log (Task 2)
- Wave 0 RED stubs `errors.isNetworkError`, `throttle.rate-limit-retry`, `throttle.timeout`, `SessionExpiredNotice` — ALL 4 GREEN

No known stubs. No threat flags introduced (all new surface is inside the existing throttle / Notice trust boundary; T-05-03-01..04 mitigations applied as planned).
