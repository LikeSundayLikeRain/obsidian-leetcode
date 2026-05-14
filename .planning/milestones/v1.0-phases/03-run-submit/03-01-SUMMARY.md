---
phase: 03-run-submit
plan: 01
subsystem: testing
tags: [vitest, fixtures, red-baseline, leetcode-rest, tdd]

requires:
  - phase: 02-problems-as-notes
    provides: SettingsStore DetailCacheEntry schema, NoteWriter shape, vi.mock('obsidian') pattern, makeMockVaultApp + makeMockLeetCodeClient helpers
provides:
  - Test infrastructure for Phase 3 (11 RED baseline test files + 2 mock helpers)
  - 8 synthetic-flagged fixture JSONs covering all 6 verdict types + 2 run responses
  - tests/solve/mocks/fakeFetcher.ts — scripted requestUrl fake with per-URL FIFO queue
  - tests/solve/mocks/fakeSettingsStore.ts — in-memory SettingsStore stub + makeDetailCacheEntry
  - tests/solve/fixtures/README.md — D-31 capture protocol + redirect spike deferral
  - Forced-path starter injector test stub (Blocker 2 fix)
affects:
  - 03-02 (tests/solve/* pure-function modules — codeExtractor, languages, CaseRegion, statusMap, starterCodeInjector)
  - 03-03 (problemDetail extension — internalQuestionId)
  - 03-04 (leetcodeRest — REST client; MUST re-capture live fixtures + resolve redirect spike)
  - 03-05 (polling + submission orchestrators)
  - 03-06 (verdictModalRenderer)
  - 03-07 (NoteWriter starter-code retrofit wiring)

tech-stack:
  added: []
  patterns:
    - Per-URL FIFO scripted response queue for polling tests
    - Fixture-driven modal render assertions (DOM shape keyed by fixture)
    - Exact Notice copy enforcement for Plan 05 (single-flight D-24, no-code D-04, no-note, session-expiry D-27)
    - RED baseline convention: import resolves only when the downstream module ships

key-files:
  created:
    - tests/solve/fixtures/README.md
    - tests/solve/fixtures/accepted.json
    - tests/solve/fixtures/wrong-answer.json
    - tests/solve/fixtures/tle.json
    - tests/solve/fixtures/mle.json
    - tests/solve/fixtures/compile-error.json
    - tests/solve/fixtures/runtime-error.json
    - tests/solve/fixtures/run-sample.json
    - tests/solve/fixtures/run-custom.json
    - tests/solve/mocks/fakeFetcher.ts
    - tests/solve/mocks/fakeSettingsStore.ts
    - tests/solve/codeExtractor.test.ts
    - tests/solve/languages.test.ts
    - tests/solve/CaseRegion.test.ts
    - tests/solve/statusMap.test.ts
    - tests/solve/starterCodeInjector.test.ts
    - tests/solve/leetcodeRest.test.ts
    - tests/solve/pollingOrchestrator.test.ts
    - tests/solve/submissionOrchestrator.test.ts
    - tests/solve/verdictModalRenderer.test.ts
    - tests/solve/customTestStore.test.ts
    - tests/solve/starterCodeInjector.forced.test.ts
    - tests/notes/NoteWriter.starter-retrofit.test.ts
  modified: []

key-decisions:
  - "Seeded all 8 Wave 0 fixtures as SYNTHETIC-NOT-LIVE, flagged in README §Synthetic Fixture Flags. Executor has no live LC session; plan's last-resort synthetic fallback clause invoked. Plan 04 MUST re-capture live before merge (verify-work greps for _fixture_note in fixtures/)."
  - "Redirect spike (Task 3) DEFERRED TO PLAN 04. Executor cannot drive Obsidian devtools console. Plan 04 must implement BOTH status-code check AND HTML body sniff as defense in depth."
  - "tests/solve/fixtures/README.md encodes the contract for re-capture; Plan 04 is gated on it."

patterns-established:
  - "Wave 0 RED baseline: test file imports a module path that does NOT YET exist in src/. Vitest returns ERR_MODULE_NOT_FOUND; downstream plan ships the module and tests turn GREEN without modification."
  - "Exact Notice copy: submissionOrchestrator tests assert verbatim Notice strings so Plan 05 cannot drift UI copy."
  - "Fixture-driven renderer: verdictModalRenderer.test.ts imports 8 JSON fixtures by literal path; fixtures ARE the contract, renderer conforms."

requirements-completed:
  - SOLVE-01
  - SOLVE-02
  - SOLVE-03
  - SOLVE-04
  - SOLVE-05
  - SOLVE-06
  - SOLVE-07
  - SOLVE-08
  - SOLVE-09

duration: ~22min
completed: 2026-05-08
---

# Phase 3 Plan 01: Test Infrastructure + D-31 Fixtures + Redirect Spike Summary

**11 Phase 3 test files stubbed as RED baseline (6 behavior + 5 pure + 1 NoteWriter retrofit) plus 8 synthetic-flagged fixture JSONs + 2 mock helpers; redirect spike deferred to Plan 04 with defense-in-depth instructions captured in fixtures/README.md**

## Performance

- **Duration:** ~22 minutes (no live LC calls; fixture seeding synthetic)
- **Completed:** 2026-05-08
- **Tasks:** 10 (Tasks 2 and 10 handled as described below — see Auth/Human Gates)
- **Files created:** 23 (1 README + 8 fixture JSONs + 2 mocks + 11 test files + 1 NoteWriter retrofit test)

## Accomplishments

- RED baseline established for Phase 3: 12 test files fail (11 tests/solve/ + 1 tests/notes/NoteWriter.starter-retrofit.test.ts); Phase 1/2 suites unchanged at 180 passed tests.
- Blocker 2 (forced-path test coverage) fixed: `tests/solve/starterCodeInjector.forced.test.ts` stubs `forceInjectCodeSection` with 3 test cases covering unconditional replace, Pitfall 6 passthrough, and ## Code creation delegation.
- All 8 required fixture JSONs exist and parse as valid JSON with the shapes Plan 06's renderer and Plan 05's polling loop will assert against.
- Mock helpers (`makeFakeFetcher`, `makeFakeSettingsStore`, `makeDetailCacheEntry`) ready for Plan 04/05 consumption without modification.
- Exact Notice copy enforced in `submissionOrchestrator.test.ts` for D-24 single-flight, D-04 no-code-block, no-note, and D-27 session-expiry paths.

## Task Commits

| # | Task                                                                  | Commit     | Type     |
|---|-----------------------------------------------------------------------|------------|----------|
| 1 | Create fixture README + capture protocol                              | `9be73cf`  | docs     |
| 2 | CHECKPOINT — Human captures 8 fixture JSONs (handled synthetic)       | `51aec56`  | test     |
| 3 | Redirect spike (deferred to Plan 04 with defense-in-depth note)       | `7275744`  | docs     |
| 4 | tests/solve/mocks/fakeFetcher.ts                                      | `2ba6cd2`  | test     |
| 5 | tests/solve/mocks/fakeSettingsStore.ts                                | `ead8458`  | test     |
| 6 | 5 pure-function test stubs (codeExtractor/languages/CaseRegion/statusMap/starterCodeInjector) | `09713ba` | test |
| 7 | 6 behavior test stubs (REST/polling/submit/modal/customTest/forced)   | `c94a333`  | test     |
| 8 | tests/notes/NoteWriter.starter-retrofit.test.ts                       | `d66eed7`  | test     |
| 9 | Full-suite verification (no files written)                            | _(none)_   | verify   |
|10 | CHECKPOINT — Wave 0 readiness (awaiting human verify; see below)      | _(SUMMARY)_| —        |

## Files Created/Modified

### Fixtures (Task 1 + 2)

- `tests/solve/fixtures/README.md` — D-31 capture protocol (problems + code per verdict), redaction gate (no csrftoken/LEETCODE_SESSION in JSON), synthetic-fixture flags for all 8, redirect-spike deferral block.
- `tests/solve/fixtures/accepted.json` — synthetic status_code 10, runtime/memory percentiles.
- `tests/solve/fixtures/wrong-answer.json` — synthetic status_code 11, input/std_output/expected fields.
- `tests/solve/fixtures/tle.json` — synthetic status_code 14, last_testcase.
- `tests/solve/fixtures/mle.json` — synthetic status_code 12, memory 815.8 MB.
- `tests/solve/fixtures/compile-error.json` — synthetic status_code 20, compile_error + full_compile_error.
- `tests/solve/fixtures/runtime-error.json` — synthetic status_code 15, runtime_error + full_runtime_error.
- `tests/solve/fixtures/run-sample.json` — synthetic state SUCCESS, code_answer array, correct_answer true.
- `tests/solve/fixtures/run-custom.json` — synthetic state SUCCESS, no expected_*.

### Mocks (Tasks 4, 5)

- `tests/solve/mocks/fakeFetcher.ts` — `makeFakeFetcher()` returns `{ fetcher, queue, spy }`; per-URL FIFO response queue; throws loudly on unqueued URL.
- `tests/solve/mocks/fakeSettingsStore.ts` — `makeFakeSettingsStore(overrides?)` + `makeDetailCacheEntry(overrides?)` helper.

### Pure-function tests (Task 6 — RED)

- `tests/solve/codeExtractor.test.ts` (7 it) — D-01/D-02/D-03/D-04 + purity + first-wins.
- `tests/solve/languages.test.ts` (5 it) — SOLVE-08 self-round-trip, alias table (py/ts/c++/go/rs), D-05 fallback, core LC langSlugs.
- `tests/solve/CaseRegion.test.ts` (6 it) — D-19 parse + writeback; Warning 8 inter-case user paragraph preserved; empty writeback removes region.
- `tests/solve/statusMap.test.ts` (3 it) — D-15 canonical 10-21 table + unknown code fallback + displayName shape.
- `tests/solve/starterCodeInjector.test.ts` (5 it) — D-06 heading insert, D-07 idempotent, Pitfall 6 text-block passthrough, D-03 langSlug respect, D-09 silent on null starter.

### Behavior tests (Task 7 — RED + Blocker 2)

- `tests/solve/leetcodeRest.test.ts` (8 it) — interpret/submit/check URL shape + body fields + cookie/x-csrftoken/referer headers + D-27 302/401 → SessionExpiredError + D-14 429 → RateLimitError + judge_type='large' only on submit.
- `tests/solve/pollingOrchestrator.test.ts` (6 it) — Pattern 2 1/2/4/8/8 backoff via vi.useFakeTimers(); D-26 60s cap + 3-consecutive-non-2xx → JudgeTimeoutError; D-23 abort between polls → AbortError; Warning 7 registerInterval hook.
- `tests/solve/submissionOrchestrator.test.ts` (6 it) — D-24 single-flight (exact Notice copy), D-04 no-code (exact Notice), no-note (exact Notice), SOLVE-09 current-content-at-submit invariant, D-27 session-expiry (exact Notice), cancel() → AbortError.
- `tests/solve/verdictModalRenderer.test.ts` (10 it) — 8 fixture-driven assertions + 2 synthetic (unknown verdict, timeout). Modal stubbed via vi.mock('obsidian', ...).
- `tests/solve/customTestStore.test.ts` (4 it) — D-19 read/write round-trip + Warning 8 user-text preservation.
- `tests/solve/starterCodeInjector.forced.test.ts` (3 it, **Blocker 2**) — `forceInjectCodeSection` unconditional replace + Pitfall 6 passthrough + ## Code creation delegation.

### NoteWriter retrofit (Task 8 — RED)

- `tests/notes/NoteWriter.starter-retrofit.test.ts` (5 it) — D-06 order + D-09 silent retrofit + D-07 idempotent + Pitfall 6 text-block + D-09 no-starter body-unchanged. 3 fail RED (Plan 07 wires starter injector); 2 incidentally pass (existing NoteWriter already satisfies idempotent + empty-starter-skip paths).

## Decisions Made

1. **Synthetic fixtures invoked** — The GSD executor has no live LC session access. The plan's explicit synthetic-fallback clause ("If you cannot capture one verdict type... record a placeholder fixture... note in README that this fixture is synthetic-not-live") is the governing path. All 8 fixtures flagged; Plan 04 re-capture gate encoded in README.

2. **Redirect spike deferred** — Same root cause. README now instructs Plan 04 to implement BOTH status-code check AND HTML body sniff as defense in depth; spike can be run when Plan 04 ships leetcodeRest.ts.

3. **Exact Notice copy captured in tests** — All user-visible Notices for Plan 05's submissionOrchestrator are pinned as string literals in `submissionOrchestrator.test.ts`. This prevents Plan 05 drift from the agreed copy.

4. **RED baseline convention** — Tests import `src/solve/*` paths that do not yet exist; vitest reports ERR_MODULE_NOT_FOUND; Plan 02 ships the module and tests turn GREEN without modification. Idiomatic for the "stand up test infrastructure first" Wave 0 pattern.

## Deviations from Plan

### Auto-fixed / Synthetic Adaptations

**1. [Rule 3 — Blocking] Missing phase 03 planning files in worktree → copied from main repo at startup**
- **Found during:** Initial context load (pre-Task 1)
- **Issue:** Worktree was spawned from base commit `67fffba` which predates `.planning/phases/03-run-submit/` by hours; reads of the plan, CONTEXT, RESEARCH, etc. all 404'd.
- **Fix:** `cp` phase-03 planning files from `/Users/moxu/projects/obsidian-leetcode/.planning/phases/03-run-submit/` into the worktree's `.planning/phases/03-run-submit/` before starting Task 1.
- **Files affected:** `.planning/phases/03-run-submit/03-01-PLAN.md` + 03-CONTEXT.md + 03-RESEARCH.md + 03-PATTERNS.md + 03-UI-SPEC.md + 03-VALIDATION.md (worktree copies).
- **Verification:** Read succeeded; plan's 10 tasks enumerated.
- **Committed in:** _(not committed — these are shared planning artifacts the orchestrator re-syncs on merge; no-op in the worktree branch)_

**2. [Plan-sanctioned fallback] 8 fixtures seeded as SYNTHETIC-NOT-LIVE**
- **Found during:** Task 2
- **Issue:** Executor has no live LC session access; cannot capture live JSON.
- **Fix:** Per the plan's explicit synthetic-fallback clause, seeded shape-correct synthetic fixtures from the leetcode-cli helper.js status table and documented LC response shape. Each fixture carries a top-level `_fixture_note` marking it synthetic; README §Synthetic Fixture Flags records the full checklist; Plan 04 merge gate instructed to grep for `_fixture_note` and block on any hit.
- **Files modified:** 8 fixture JSONs + `tests/solve/fixtures/README.md`
- **Verification:** all 8 parse as valid JSON; status_code / required fields match per-verdict contract; credential-gate grep returns no matches across JSON files.
- **Committed in:** `51aec56`

**3. [Plan-sanctioned fallback] Redirect spike deferred to Plan 04**
- **Found during:** Task 3
- **Issue:** Spike requires driving Obsidian devtools console against live LC; executor cannot.
- **Fix:** Per the plan's explicit "SPIKE DEFERRED TO PLAN 04 — Plan 04 must implement both status-code check AND HTML body sniff as defense in depth" clause, documented in README §Redirect spike result §Status with the `[x] SPIKE DEFERRED TO PLAN 04` box checked. Added a reproduction recipe Plan 04 can paste verbatim.
- **Files modified:** `tests/solve/fixtures/README.md`
- **Verification:** `grep -c 'Redirect spike result' tests/solve/fixtures/README.md` = 1; `grep -c 'SPIKE DEFERRED TO PLAN 04' = 1`.
- **Committed in:** `7275744`

---

**Total deviations:** 3 (1 blocking env-setup + 2 plan-sanctioned synthetic fallbacks).
**Impact on plan:** Zero scope creep; all fallbacks invoked are explicitly authorized by the plan's own task text (Task 2 §Synthetic Fallback and Task 3 §Status deferral).

## Issues Encountered

- **Worktree HEAD base older than phase 03 planning files** — recovered by copying phase 03 planning files into the worktree at startup (see Deviation #1). Orchestrator re-syncs shared planning artifacts on merge, so no cross-worktree conflict.
- **Vitest "failed file" count of 12 vs plan's expected ≥9** — expected; 11 tests/solve/ files fail at import stage (ERR_MODULE_NOT_FOUND), plus tests/notes/NoteWriter.starter-retrofit.test.ts fails 3 assertions on the retrofit path not yet wired.
- **Phase 1/2 suite: 180 passed tests** — no regressions.

## Known Stubs

All 8 fixture JSONs are synthetic. Each carries a top-level `_fixture_note: "SYNTHETIC-NOT-LIVE..."` field. Plan 04 MUST replace them with live captures before its merge gate; the gate is encoded in `tests/solve/fixtures/README.md` and should be verified via `grep -l _fixture_note tests/solve/fixtures/*.json` returning no matches after Plan 04.

## Self-Check: PASSED

Verified against Task 10 checklist:

- `ls tests/solve/fixtures/*.json | wc -l` = 8 — **PASS**
- `grep -c 'Redirect spike result' tests/solve/fixtures/README.md` = 1 — **PASS**
- `npm test 2>&1 | grep -c '^ FAIL'` = 14 (≥ 9) — **PASS**
- Phase 1/2 suite pass count: 180 passed tests; 34 passed test files — **PASS (no regressions)**
- `accepted.json` status_code 10 — **PASS**
- `wrong-answer.json` status_code 11 + input + output + expected — **PASS**
- `compile-error.json` status_code 20 + compile_error — **PASS**
- `test -f tests/solve/starterCodeInjector.forced.test.ts` — **PASS (Blocker 2)**
- Credential gate (grep `csrftoken=|LEETCODE_SESSION=|sessionid=` on JSON) — **clean**

All claimed files exist:

- tests/solve/fixtures/README.md + 8 fixture JSONs — **FOUND**
- tests/solve/mocks/fakeFetcher.ts + fakeSettingsStore.ts — **FOUND**
- tests/solve/{codeExtractor,languages,CaseRegion,statusMap,starterCodeInjector,leetcodeRest,pollingOrchestrator,submissionOrchestrator,verdictModalRenderer,customTestStore,starterCodeInjector.forced}.test.ts — **FOUND (11 files)**
- tests/notes/NoteWriter.starter-retrofit.test.ts — **FOUND**

All claimed commits exist in `git log`:

- `9be73cf`, `51aec56`, `7275744`, `2ba6cd2`, `ead8458`, `09713ba`, `c94a333`, `d66eed7` — **all FOUND**

## User Setup Required

**Awaiting human verification for Task 10 checkpoint + live fixture re-capture before Plan 04 merge:**

1. Review `tests/solve/fixtures/README.md` §Synthetic Fixture Flags — all 8 entries marked `[x]` synthetic.
2. Run the capture protocol in README §Capture Protocol against your live LC session to replace the 8 synthetic JSONs. Remove the `_fixture_note` field from each JSON once captured live.
3. Optionally run the redirect spike (README §Redirect spike result §Reproduction recipe) in Obsidian devtools console and fill in the Observed behavior block; flip `[x] SPIKE DEFERRED TO PLAN 04` → `[ ]` and `[ ] Spike run against live LC` → `[x]`.
4. Merge this plan into main and proceed to Wave 1 (Plans 02/03/04 in parallel; Plan 04 will re-capture live fixtures as its first Wave 1 task if you skip step 2).

If the human can complete step 2 before Wave 1 starts, Plan 04 ships with live-accurate test assertions from Task 1 and avoids re-work.

## Next Phase Readiness

- **RED baseline:** 11 Phase 3 test files fail at module-import; 1 retrofit test file fails at assertion-level; Phase 1/2 untouched. Wave 1 (Plans 02, 03, 04) can start in parallel.
- **Wave 1 concerns:** Plan 04 inherits the live-fixture re-capture gate AND the redirect spike execution. Both are encoded in `tests/solve/fixtures/README.md` with specific instructions, so Plan 04 planning should reference that file directly.
- **Blocker 2 cleared:** `starterCodeInjector.forced.test.ts` exists with 3 RED tests; Plan 02 Task 4 (forceInjectCodeSection export) can now be planned with test coverage in place.

---
*Phase: 03-run-submit*
*Completed: 2026-05-08*
