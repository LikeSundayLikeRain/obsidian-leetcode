---
phase: 01-plugin-foundation
plan: 02
subsystem: http-persistence-backbone
tags: [throttle, fetcher, rate-limit, session-expiry, persistence]
requires:
  - RateLimitError (src/shared/errors.ts, Plan 01)
  - AuthCookies (src/auth/types.ts, Plan 01)
  - ProblemIndex (src/browse/types.ts, Plan 01)
provides:
  - Throttle (20/10s + maxConcurrent=2)
  - QueueChangeListener
  - installRequestUrlFetcher (idempotent, hot-reload safe)
  - getActiveThrottle
  - LeetCodeClient (real impl)
  - isSessionExpired (AUTH-04 canonical helper)
  - SettingsStore (real impl with typed accessors)
  - PluginData
affects:
  - Plan 03 (AuthService) — consumes SettingsStore + LeetCodeClient + isSessionExpired
  - Plan 05 (ProblemListService) — consumes SettingsStore + LeetCodeClient
  - Plan 06 (ProblemBrowserView) — subscribes to getActiveThrottle().onQueueChange for D-13 footer indicator; catches RateLimitError for D-14 Notice; calls isSessionExpired on refresh errors
tech_stack:
  added: []
  patterns:
    - token-bucket + concurrency-limiter with queue-depth observer (D-13)
    - module-singleton fetcher mutation pattern (replaces @fetch-impl/fetcher.fetch)
    - per-install Throttle scope (W4: hot-reload safe; no leaked waiters across plugin-load cycles)
    - retry-after header parsing at the fetcher level (D-14 baseline; Notice owned by Plan 06)
    - plugin.loadData/saveData wrapper with typed accessors + version field for future migrations
key_files:
  created:
    - src/api/throttle.ts
    - src/api/requestUrlFetcher.ts
    - tests/throttle.test.ts
    - tests/fetcher-install.test.ts
    - tests/session-expiry.test.ts
    - tests/settings-store.test.ts
  modified:
    - src/api/LeetCodeClient.ts (replaced Wave-1 brand stub with real wrapper + isSessionExpired)
    - src/settings/SettingsStore.ts (replaced Wave-1 brand stub with real loadData/saveData wrapper)
    - tsconfig.json (include tests/**/*.ts so typed lint works on test files)
decisions:
  - Throttle instantiated INSIDE installRequestUrlFetcher (per-install scope) — hot-reload safe; no module-scope Throttle leakage across plugin-load cycles
  - Self-wake refill timer added inside Throttle.acquire() to prevent deadlock when tokens drained with zero concurrent runners (PATTERNS.md pattern would hang under that edge case)
  - activeWindow.setTimeout/clearTimeout in runtime with platform fallback for Node-hosted tests (satisfies obsidianmd/prefer-active-window-timers without breaking vitest fake timers)
  - Implemented SettingsStore (plan Task 3) during Task 2 to unblock LeetCodeClient's typed accessors; tests landed after, all pass
  - isSessionExpired canonical location is src/api/LeetCodeClient.ts — Plans 03/06 import and call, never redefine
  - 429 retry-after parser honors header seconds -> ms conversion with 10_000ms default when header absent (D-14 baseline; full polish deferred to POLISH-02)
metrics:
  duration_seconds: "~480"
  completed: 2026-05-07T19:40:00Z
  task_count: 3
  file_count: 8
---

# Phase 01 Plan 02: HTTP + Persistence Backbone Summary

## One-liner

Token-bucket + concurrency-limited `Throttle` (20/10s, max 2) with queue-depth observer wired inside an idempotent `installRequestUrlFetcher()` that mutates `@fetch-impl/fetcher.fetch` (throw:false, throws `RateLimitError` on 429 honoring retry-after per D-14), plus `LeetCodeClient` (with AUTH-04 `isSessionExpired` canonical helper) and `SettingsStore` (plugin.loadData/saveData wrapper with typed accessors and D-10 defaults `LeetCode` / `python3`).

## What was built

### Source modules (4 files — 2 net new, 2 replaced Wave-1 brand stubs)

- **`src/api/throttle.ts` (new):** Hand-rolled token-bucket + concurrency limiter per D-12 / CF-07. Parameters `{capacity:20, refillMs:10_000, maxConcurrent:2}` accepted via `ThrottleOpts`. Public API: `acquire()`, `release()`, `getQueueDepth()`, `onQueueChange(cb)` (returns unsubscribe). Private `listeners: Set<QueueChangeListener>` with `emitDepthChange()` swallowing listener errors. Self-wake refill timer inside `acquire()` (see Deviations below). Popout-window-safe timer helpers route through `activeWindow` at runtime and fall back to platform `setTimeout`/`clearTimeout` in Node tests.
- **`src/api/requestUrlFetcher.ts` (new):** Exports `installRequestUrlFetcher()` (idempotent — each call constructs a fresh Throttle, replacing the previous `activeThrottle` reference) and `getActiveThrottle()` (returns the most-recent Throttle or `null`). The shim mutates `@fetch-impl/fetcher.fetch` to an async function that: (a) `await throttle.acquire()`, (b) calls `requestUrl({...init, throw:false})`, (c) on `res.status === 429` parses `res.headers['retry-after'] ?? res.headers['Retry-After']`, converts seconds→ms (default 10_000ms when absent or non-numeric), and throws `new RateLimitError(retryMs)`, (d) otherwise wraps `res.text` in a `Response` with `status`, `headers`, empty `statusText`, (e) `throttle.release()` in `finally`.
- **`src/api/LeetCodeClient.ts` (replaced brand stub):** Wraps `LeetCode` + `Credential` from `@leetnotion/leetcode-api`. Constructor eagerly calls `rebuildClientSync()`; `reauthenticate()` awaits `Credential.init(session)` before instantiating a new `LeetCode`. Module also exports `isSessionExpired(resp: unknown): boolean` with primary signal `data === null` and secondary regex against `errors[].message` for `logged in | authentication | CSRF | unauthori[sz]ed`.
- **`src/settings/SettingsStore.ts` (replaced brand stub):** Async wrapper over `plugin.loadData()` / `plugin.saveData()`. `PluginData` interface exports `version: 1`, `auth`, `username`, `problemsFolder`, `defaultLanguage`, `problemIndex`. `DEFAULT_DATA` enforces D-10 (`problemsFolder: 'LeetCode'`, `defaultLanguage: 'python3'`). Typed accessors for all five fields (get + set), each `set*` calling `persist()`.

### Test modules (4 files — all new)

- **`tests/throttle.test.ts`** (6 tests, all green): BROWSE-05 contract — 25 sequential acquires ≥ 10s under fake timers, first-20 immediate without refill, concurrency cap ≤ 2 across 10 parallel tasks; D-13 observer — fresh depth 0, saturated waiters counted, `onQueueChange` fires on enqueue + dequeue, unsubscribe stops further callbacks.
- **`tests/fetcher-install.test.ts`** (6 tests, all green): FND-04 — fetcher.fetch replaced, invocation calls requestUrl with `throw:false`, idempotent, `getActiveThrottle()` returns non-null. D-14 — 429 with `retry-after: 5` yields `RateLimitError(retryAfterMs: 5000)` and `instanceof RateLimitError` holds; 429 with missing retry-after yields `retryAfterMs: 10_000`.
- **`tests/session-expiry.test.ts`** (4 tests, all green): AUTH-04 — `data: null` → true; `data: null` + `"logged in"` error message → true; `data: { questions: [] }` → false; empty object → false.
- **`tests/settings-store.test.ts`** (5 tests, all green): AUTH-03 — cookie round-trip + saveData called; AUTH-05 — logout clears; D-10 — defaults `LeetCode` / `python3` / null; loaded v1 data preserved; D-07 — problem-index round-trip.

## Gate Results

| Gate | Command | Exit | Evidence |
|------|---------|------|----------|
| Test | `npx vitest run` | 0 | 21/21 pass across 4 files |
| Lint | `npm run lint` | 0 | Zero errors, zero warnings |
| Build | `npm run build` | 0 | `tsc -noEmit` clean, `esbuild production` produces `main.js` |
| FND-04 bare `fetch(` | `grep -rnE '(^\|[^a-zA-Z_\.])fetch\(' src/ --include='*.ts' \| grep -v 'fetcher\.fetch\|cross-fetch'` | — | 0 matches |
| FND-04 `axios` | `grep -rn "from 'axios'" src/` | — | 0 matches |
| CF-07 throttle ceiling | `grep -c 'capacity: 20' src/api/requestUrlFetcher.ts` | — | 1 |
| CF-07 refill | `grep -c 'refillMs: 10_000' src/api/requestUrlFetcher.ts` | — | 1 |
| CF-07 concurrency | `grep -c 'maxConcurrent: 2' src/api/requestUrlFetcher.ts` | — | 1 |
| D-14 429 guard | `grep -c "res.status === 429" src/api/requestUrlFetcher.ts` | — | 1 |
| D-14 retry-after | `grep -c "retry-after" src/api/requestUrlFetcher.ts` | — | 3 |
| D-14 RateLimitError thrown | `grep -c 'RateLimitError' src/api/requestUrlFetcher.ts` | — | 4 |
| W4 Throttle inside install | throttle instantiation AFTER `export function installRequestUrlFetcher` line | — | Line 29 (after line 25) |
| W4 no module-scope flag | `grep -cE '^let installed' src/api/requestUrlFetcher.ts` | — | 0 |
| Queue-depth observer | `grep -c 'getQueueDepth\|onQueueChange' src/api/throttle.ts` | — | 1 / 1 |
| isSessionExpired canonical | `grep -rc 'export function isSessionExpired' src/` | — | 1 (LeetCodeClient.ts only) |

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 RED | test | cd3f4d0 | add failing throttle tests (BROWSE-05 + D-13 queue-depth observer) |
| 1 GREEN | feat | 85ff807 | implement Throttle (20/10s + maxConcurrent=2 + D-13 observer) |
| 2 RED | test | ba51cd0 | add failing fetcher-install (FND-04 + D-14) and session-expiry (AUTH-04) tests |
| 2 GREEN | feat | ad73443 | install requestUrl fetcher (D-14 429), LeetCodeClient, SettingsStore |
| 3 | test | b4c5316 | add SettingsStore round-trip tests (AUTH-03 + AUTH-05 + D-07 + D-10) |

## Confirmed throttle parameters

- `capacity: 20`, `refillMs: 10_000`, `maxConcurrent: 2` — LOCKED by D-12 / CF-07. Enforced inside `installRequestUrlFetcher()`; grep-verified.

## Per-install Throttle scope (W4 — hot-reload safe)

- The module-level `let activeThrottle: Throttle | null = null` is a *reference*, not an instance. Each `installRequestUrlFetcher()` call constructs `new Throttle({...})` and reassigns `activeThrottle`. The previous Throttle (with any pending waiters from a prior plugin-load cycle) is released for GC. Plan 06 uses `getActiveThrottle()` to subscribe; its `onClose()` unsubscribes so the observer doesn't leak across hot-reload either.

## 429 / retry-after handling (D-14 baseline)

- `res.status === 429` → parse `res.headers['retry-after'] ?? res.headers['Retry-After']`.
- Numeric seconds → multiply by 1000 (e.g. `'5'` → `retryAfterMs: 5000`).
- Missing / non-numeric header → `retryAfterMs: 10_000` (the 10s default).
- `throw new RateLimitError(retryMs)` — Plan 06 catches and surfaces the locked Notice `'LeetCode rate-limited — slowing down.'`. Plan 02 owns the *throw* + retry-after *parsing*; Plan 06 owns the user-facing Notice. Backoff-ladder polish deferred to POLISH-02.

## `isSessionExpired` logic (AUTH-04 canonical)

- Primary signal (most reliable per library-internal stripping of `errors`): `r.data === null` → `true`.
- Secondary signal: any `errors[].message` matching `/logged in|authentication|CSRF|unauthori[sz]ed/i` → `true`.
- Non-object / `null` / empty → `false`.
- Ownership: Plans 03 (AuthService refresh flow) and 06 (browser refresh error handler) both `import { isSessionExpired }` from `src/api/LeetCodeClient.ts`. Neither redefines. Enforced via grep gate `grep -rc 'export function isSessionExpired' src/` == 1.

## Throttle queue-depth observer API (D-13 handoff for Plan 06)

- `throttle.getQueueDepth(): number` — returns `waiters.length` (excludes running tasks).
- `throttle.onQueueChange(cb: (depth:number)=>void): () => void` — subscription; returns an unsubscribe function. Fires on every enqueue (inside acquire's promise executor) and dequeue (inside release). Listener errors are swallowed so one bad subscriber can't break the queue.
- Plan 06 subscribes in `renderShell()` / `onOpen()` and unsubscribes in `onClose()` (per plan contract), applying its own 2-second-debounce logic before rendering the `⋯ Fetching from LeetCode…` footer.

## Test counts + pass state

| Suite | Contract | Tests | Pass |
|-------|----------|-------|------|
| `tests/throttle.test.ts` | BROWSE-05 + D-13 | 6 | 6 |
| `tests/fetcher-install.test.ts` | FND-04 + D-14 | 6 | 6 |
| `tests/session-expiry.test.ts` | AUTH-04 | 4 | 4 |
| `tests/settings-store.test.ts` | AUTH-03 + AUTH-05 + D-07 + D-10 | 5 | 5 |
| **Total** | | **21** | **21** |

## Deviations from Plan

### Rule-1 fixes

**1. Self-wake refill timer inside `Throttle.acquire()`**
- **Found during:** Task 1 GREEN (BROWSE-05 test 1 — 25-sequential-acquire gate)
- **Issue:** The PATTERNS.md / RESEARCH.md Pattern 3 implementation only refills tokens on `acquire()` *entry* and relies on `release()` to wake waiters. Under fake timers in a sequential loop, iterations 21–25 block in `acquire()` with `tokens === 0 && running === 0` — no release fires because nothing is running, so the refill window passes but no waiter is woken. Promise deadlocks; vitest times out at 5 s.
- **Fix:** Added a `delayUntilRefill` calculation and, when blocking solely on tokens, `_setTimeout` a self-wake for exactly that delay. On wake, the waiter removes itself from the queue (by reference identity, not position — safe if `release()` raced ahead) and re-enters the loop, which re-checks the refill window and proceeds. If `release()` fires first, the scheduled refill timer is cleared via `_clearTimeout`.
- **Files:** `src/api/throttle.ts`
- **Commit:** 85ff807

**2. Restructured concurrency-cap test to drain fake timers before awaiting**
- **Found during:** Task 1 GREEN (BROWSE-05 test 3)
- **Issue:** As specified in the plan, the test did `await Promise.all(…)` where each task used `await new Promise(r => setTimeout(r, 5))` under fake timers. Promise.all never settles because the inner `setTimeout` calls were never advanced.
- **Fix:** Kick off the Promise.all without awaiting (`const all = Promise.all(…)`), then `await vi.advanceTimersByTimeAsync(100)` to drain, then `await all`. Preserves the test's intent (peak in-flight ≤ maxConcurrent=2) while making fake timers actually reachable.
- **Files:** `tests/throttle.test.ts`
- **Commit:** 85ff807

### Rule-2 fixes

**3. `activeWindow`-preferring timer helpers with Node fallback**
- **Found during:** Task 1 lint run
- **Issue:** `obsidianmd/prefer-active-window-timers` flags bare `setTimeout`/`clearTimeout` for popout-window compat. But: (a) our module is also imported by vitest tests where `activeWindow` is undefined, (b) `vi.useFakeTimers()` swaps the global AFTER module load, so capturing a reference at import time breaks fake timers.
- **Fix:** Added module-local `_setTimeout`/`_clearTimeout` functions that, *on each call*, check `typeof activeWindow !== 'undefined' && activeWindow` and route to `activeWindow.*` when available, otherwise to the platform function. The platform-fallback branches carry scoped `eslint-disable-next-line obsidianmd/prefer-active-window-timers -- test fallback` comments explaining intent.
- **Files:** `src/api/throttle.ts`
- **Commit:** 85ff807

**4. Test-file scoped `prefer-active-window-timers` disable**
- **Found during:** Task 1 lint run
- **Issue:** The concurrency test uses `await new Promise(r => setTimeout(r, 5))` to simulate work. Test files don't run in Obsidian's popout window, but the lint rule still fires.
- **Fix:** Top-of-file `/* eslint-disable obsidianmd/prefer-active-window-timers -- tests run in Node; no activeWindow */`.
- **Files:** `tests/throttle.test.ts`
- **Commit:** 85ff807

### Rule-3 fixes

**5. `tsconfig.json` include expansion for `tests/**/*.ts`**
- **Found during:** Task 1 lint run
- **Issue:** Plan 01 set tsconfig `include` to `src/**/*.ts` only. The typescript-eslint project service then rejected `tests/*.ts` with `Parsing error: not found by the project service`. Trying `allowDefaultProject: ['tests/**/*.ts']` fails — the newer typescript-eslint disallows `**` in that list. Every new test file in every future plan would hit the same parse error.
- **Fix:** Expanded `tsconfig.json` `include` to `["src/**/*.ts", "tests/**/*.ts"]`. Keeps `eslint.config.mts` `allowDefaultProject` narrow.
- **Files:** `tsconfig.json`
- **Commit:** 85ff807

**6. SettingsStore implemented during Task 2 (ahead of plan's Task 3 position)**
- **Found during:** Task 2 lint/build after writing `LeetCodeClient.ts`
- **Issue:** `LeetCodeClient` imports `SettingsStore` and calls `this.settings.getAuthCookies()`. The Wave-1 brand-stub `SettingsStore` only had `readonly __brand!: 'SettingsStore'` — no methods — so `tsc` raised `TS2339: Property 'getAuthCookies' does not exist on type 'SettingsStore'`. Plan Task 3 is where SettingsStore lands officially. Implementing it earlier unblocks LeetCodeClient without changing behavior.
- **Fix:** Replaced the brand stub with the real SettingsStore (verbatim PATTERNS.md block + D-10 defaults) in the Task 2 GREEN commit. Task 3 then contributed the unit tests (all green on first run since impl was already in place). Documented in Task 3 commit message as a TDD-order deviation.
- **Files:** `src/settings/SettingsStore.ts`, `tests/settings-store.test.ts`
- **Commits:** ad73443 (impl), b4c5316 (tests)

**7. Widened `mockRequestUrl` return type in fetcher-install test**
- **Found during:** Task 2 build run
- **Issue:** The plan's test spec starts with a default `vi.fn(async () => ({status:200, headers:{'content-type':'...'}, ...}))` whose literal type narrowed to that specific `headers` and `json` shape. When `mockImplementation` later returned `{status:429, headers:{'retry-after':'5'}, json:null, ...}`, TS errored: `Property ''content-type'' is missing`.
- **Fix:** Declared a `MockRequestUrlResponse` interface with `headers: Record<string, string>` and `json: unknown`, then typed the mock explicitly: `vi.fn<(arg: unknown) => Promise<MockRequestUrlResponse>>(...)`. Later mocks now satisfy the declared widening.
- **Files:** `tests/fetcher-install.test.ts`
- **Commit:** ad73443

**8. Dropped unnecessary type assertion in 429 branch**
- **Found during:** Task 2 lint run
- **Issue:** `@typescript-eslint/no-unnecessary-type-assertion` flagged `const headers = res.headers as Record<string, string>` — `res.headers` already has that type.
- **Fix:** Inlined the header lookups: `res.headers['retry-after'] ?? res.headers['Retry-After']`.
- **Files:** `src/api/requestUrlFetcher.ts`
- **Commit:** ad73443

### No architectural (Rule 4) deviations

No new dependencies added, no cross-module patterns introduced beyond what the plan specified. No auth gates (plan is fully offline/unit-test).

## Follow-ups for Plan 06 (consumer handoff)

- **Footer indicator (D-13):** `import { getActiveThrottle } from '../api/requestUrlFetcher'`. In the view's `onOpen()` (or `renderShell()`), call `const t = getActiveThrottle(); const unsub = t?.onQueueChange(depth => … )`. Plan 06 owns the 2-second debounce logic (`⋯ Fetching from LeetCode…` only when `depth > 0` holds for > 2s). Unsubscribe in `onClose()`.
- **429 Notice (D-14):** Plan 06's refresh/search handlers wrap LC calls in `try { … } catch (e) { if (e instanceof RateLimitError) new Notice('LeetCode rate-limited — slowing down.', 6000); … }`. The retry-after delay is already available via `e.retryAfterMs` if Plan 06 wants to schedule a retry (POLISH-02 territory).
- **Session-expiry refresh (AUTH-04):** `import { isSessionExpired } from '../api/LeetCodeClient'`. Call from error handlers after LC GraphQL responses; on `true` invoke `AuthService.onSessionExpired()` (Plan 03's responsibility to define).

## Self-Check: PASSED

- [x] `src/api/throttle.ts` exists — 115 lines; 6 tests green.
- [x] `src/api/requestUrlFetcher.ts` exists — 64 lines; installs fetcher, throws RateLimitError on 429, exposes getActiveThrottle; 6 tests green.
- [x] `src/api/LeetCodeClient.ts` exists (brand stub replaced) — 57 lines; real wrapper + isSessionExpired; 4 tests green.
- [x] `src/settings/SettingsStore.ts` exists (brand stub replaced) — 66 lines; 5 tests green.
- [x] `tests/throttle.test.ts`, `tests/fetcher-install.test.ts`, `tests/session-expiry.test.ts`, `tests/settings-store.test.ts` all exist.
- [x] Commits cd3f4d0, 85ff807, ba51cd0, ad73443, b4c5316 all present in `git log --oneline`.
- [x] `npm run build` → exit 0.
- [x] `npm run lint` → exit 0.
- [x] `npx vitest run` → exit 0, 21 tests pass.
- [x] FND-04 bare-`fetch(` grep gate: 0 matches.
- [x] FND-04 `axios` grep gate: 0 matches.
- [x] CF-07 throttle parameters (20 / 10_000 / 2) all present in `src/api/requestUrlFetcher.ts`.
- [x] D-14 `res.status === 429`, `retry-after`, `RateLimitError` all present in `src/api/requestUrlFetcher.ts`.
- [x] Throttle is instantiated INSIDE `installRequestUrlFetcher` (line 29, after the `export function` declaration on line 25).
- [x] `getQueueDepth` + `onQueueChange` present in `src/api/throttle.ts`.
- [x] `isSessionExpired` canonical location: exactly 1 `export function isSessionExpired` in `src/`, in `src/api/LeetCodeClient.ts`.
