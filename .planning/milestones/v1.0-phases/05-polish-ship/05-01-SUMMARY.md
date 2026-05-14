---
phase: 05-polish-ship
plan: 01
subsystem: test-infrastructure
tags: [wave-0, nyquist, tdd-red, stubs, mocks]
dependency_graph:
  requires: []
  provides:
    - "tests/settings/SettingsStore.techniques-override.test.ts (targets D-15, consumed by Plan 02)"
    - "tests/settings/SettingsTab.knowledge-graph.test.ts (targets D-14/D-15/D-16, consumed by Plan 02)"
    - "tests/api/throttle.rate-limit-retry.test.ts (targets D-18, consumed by Plan 03)"
    - "tests/api/throttle.timeout.test.ts (targets D-20, consumed by Plan 03)"
    - "tests/shared/errors.isNetworkError.test.ts (targets D-19, consumed by Plan 03)"
    - "tests/solve/SessionExpiredNotice.test.ts (targets D-21, consumed by Plan 03)"
    - "tests/solve/ephemeralTabStore.test.ts (targets D-02/D-09, consumed by Plan 05)"
    - "tests/solve/RunModal.test.ts (targets D-03/D-05/D-06/D-07, consumed by Plan 05)"
    - "tests/main/codeActionsPostProcessor.test.ts (targets D-11/D-12/D-13, consumed by Plan 06)"
    - "tests/solve/run-command-registration.test.ts (targets D-01, consumed by Plan 04)"
    - "tests/solve/mocks/fakeSettingsStore.ts (extended FakeSettings — override + toggle round-trip)"
    - "tests/solve/mocks/fakeWorkspace.ts (new — createFakeWorkspace + createFakePlugin + createFakeMetadataCache + createFakeCommands)"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Module-level vi.mock('obsidian') + lazy dynamic imports — each stub resolves its src target via `await import(...)` so absent modules surface as assertion failures (typeof === 'function') rather than compile errors (TDD-RED hygiene)."
    - "Happy-dom DOM assertions for modal + Settings-tab stubs (Modal + Setting class stubs inlined per test file to avoid cross-test leakage)."
    - "Deterministic workspace event simulation via createFakeWorkspace — tests call `.setLeaves([])` + `.fire('layout-change')` to drive the EphemeralTabStore reconciliation path without a live Obsidian workspace."
    - "Capture-style Notice mock — tests collect a CapturedNotice[] so DocumentFragment + timeout + hide() sequence can be asserted across tick boundaries."
key_files:
  created:
    - tests/settings/SettingsStore.techniques-override.test.ts
    - tests/settings/SettingsTab.knowledge-graph.test.ts
    - tests/api/throttle.rate-limit-retry.test.ts
    - tests/api/throttle.timeout.test.ts
    - tests/shared/errors.isNetworkError.test.ts
    - tests/solve/SessionExpiredNotice.test.ts
    - tests/solve/ephemeralTabStore.test.ts
    - tests/solve/RunModal.test.ts
    - tests/main/codeActionsPostProcessor.test.ts
    - tests/solve/run-command-registration.test.ts
    - tests/solve/mocks/fakeWorkspace.ts
  modified:
    - tests/solve/mocks/fakeSettingsStore.ts
decisions:
  - "Chose `src/solve/runCommandRegistration` as the target import path for D-01's stub so Plan 04 can unit-test the helper rather than reach into main.ts. If Plan 04 inlines registration in main.ts instead, it should extract a thin `registerRunCommand(plugin, deps)` helper to honor this stub."
  - "Chose `src/main/codeActionsPostProcessor` as the target import path for D-11's stub. Planner may relocate to `src/solve/` or `src/graph/` — rename the test's `import(...)` path alongside."
  - "Chose `src/solve/SessionExpiredNotice` as the target import path for D-21's stub (helper exporting `showSessionExpiredNotice(onLogin)` — NOT a class). Action button injection via DocumentFragment + explicit hide() before login callback per Pattern 1 / D-21."
  - "Resolved naming convention drift: VALIDATION.md was not authored for Phase 5 (only 05-CONTEXT.md + 7 plan files + 05-DISCUSSION-LOG.md present); the `files_modified` list in 05-01-PLAN.md frontmatter served as the authoritative Wave 0 path list. Zero naming deltas — every created file matches the plan's exact path string."
  - "Pre-existing Phase 3 commands are `run-sample` + `run-custom` (NOT `run-code-sample` + `run-code-custom` as 05-CONTEXT.md §Integration Points notes). Run-command-registration test asserts deletion of the actual IDs found in main.ts."
metrics:
  duration: "~20 minutes"
  completed_date: 2026-05-09
---

# Phase 5 Plan 01: Wave 0 Nyquist Stubs Summary

10 failing test stubs + 2 mock helper files committed to satisfy Nyquist compliance (every behavior-changing Waves 1-5 task now has a pre-existing failing test file it can turn green). Stubs use lazy dynamic imports so downstream plans turn them green by shipping the named src module; they fail today with `typeof mod.X === 'function'` assertions rather than compile errors.

## Commits

| Task | Name                                                        | Commit  | Files                                                                        |
| ---- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| 2    | Extend fakeSettingsStore + add fakeWorkspace mock helper    | de7721a | tests/solve/mocks/fakeSettingsStore.ts (+52/-4), tests/solve/mocks/fakeWorkspace.ts (new 157 lines) |
| 1    | 10 Wave 0 failing stubs (Nyquist) for Phase 5               | 2b29f36 | 10 new .test.ts files totaling 1228 insertions                               |

Total: 12 files changed, 1433 insertions(+), 4 deletions(-).

## Baseline Test Counts

**Before Wave 0** (captured by running `npm test -- --run` at plan start):

- Test Files: 70 passed
- Tests: (all passing — exit code 0)

**After Wave 0** (the reference baseline Plan 02+ must maintain):

- Test Files: **10 failed, 70 passed** (80 total)
- Tests: **13 failed, 440 passed** (453 total)
- Duration: 7.78s

The 13 failing tests are distributed as:

| File                                             | Failing it(...) count | Reason                                          |
| ------------------------------------------------ | --------------------- | ----------------------------------------------- |
| tests/settings/SettingsStore.techniques-override | 4                     | `getTechniquesFolderOverride`/`setTechniquesFolderOverride` absent |
| tests/settings/SettingsTab.knowledge-graph       | 3                     | `Knowledge Graph` section not rendered yet       |
| tests/api/throttle.rate-limit-retry              | 2                     | `requestUrlMock` called once not twice (no retry) |
| tests/api/throttle.timeout                       | 1                     | `TimeoutError` never thrown (2nd test passes vacuously — override trivially holds when base timeout also absent) |
| tests/shared/errors.isNetworkError               | 3                     | `isNetworkError` helper missing                  |
| tests/solve/SessionExpiredNotice                 | —                     | Import fails — module missing                    |
| tests/solve/ephemeralTabStore                    | —                     | Import fails — module missing                    |
| tests/solve/RunModal                             | —                     | Import fails — module missing                    |
| tests/main/codeActionsPostProcessor              | —                     | Import fails — module missing                    |
| tests/solve/run-command-registration             | —                     | Import fails — module missing                    |

Plan 02+ must keep the pre-existing 70 test files green while progressively flipping each Wave 0 file to green as its companion src ships.

## Naming Deltas vs Plan `files_modified`

Zero deltas. Every created file matches the plan's exact path string verbatim.

## Deviations from Plan

### Rule 3 — Auto-fix blocking issue

**1. [Rule 3 — Blocking] Phase 5 RESEARCH.md / PATTERNS.md / VALIDATION.md / UI-SPEC.md not authored**

- **Found during:** plan-start Read of `read_first` references.
- **Issue:** 05-01-PLAN.md references `05-VALIDATION.md §Wave 0 Requirements` as the authoritative path list + `05-PATTERNS.md §Test files` for analog + mock shape guidance + `05-RESEARCH.md §Example 2` for ERR_* token list + `05-UI-SPEC.md` for copy rules. None of those four files exist in `.planning/phases/05-polish-ship/` — only `05-CONTEXT.md`, `05-DISCUSSION-LOG.md`, and the 7 plan files (01..07) are present.
- **Fix:** Anchored all 10 stubs against the authoritative `files_modified:` + `must_haves:` frontmatter of 05-01-PLAN.md itself (which enumerates exact paths + required field/behavior anchors) + the `<context>` block's `<interfaces>` section (which provides the 3 key test-infrastructure analogs verbatim). D-XX targets + the 9 Chromium ERR_* tokens are locked in 05-CONTEXT.md §decisions + §code_context. No information loss.
- **Files modified:** none (pure navigation fix — the plan's own frontmatter was used as the authoritative list).
- **Commit:** n/a (did not cause a code change; documented here for Plan 02+ traceability).

### Rule 1 — Auto-fix bug

**2. [Rule 1 — Bug] Unhandled-rejection noise in throttle.rate-limit-retry test**

- **Found during:** Task 1 verification (first `npm test` run).
- **Issue:** The initial stub structure attached `await expect(pending).rejects.toBeInstanceOf(...)` AFTER `await vi.advanceTimersByTimeAsync(...)`, so the rejection path surfaced as an unhandled rejection during timer advancement and vitest logged 2 warning blocks in the run output.
- **Fix:** Flipped to a `.then(onFulfilled, onRejected) → settle into Result<T, E>` pattern so the handler is attached synchronously at promise creation, eliminating the window where the rejection is unhandled. Semantics unchanged — test still asserts that `result.ok === false` and `result.error instanceof RateLimitError`.
- **Files modified:** tests/api/throttle.rate-limit-retry.test.ts
- **Commit:** 2b29f36 (applied before first commit).

**3. [Rule 1 — Bug] Throttle timeout test hit vitest's 5000ms default testTimeout instead of asserting cleanly**

- **Found during:** Task 1 verification (solo run of throttle.timeout.test.ts).
- **Issue:** The initial pattern used `pending.catch((err) => err)` + `await rejection`, which blocked the test's async body on a never-rejecting promise (because Plan 03 hasn't shipped the timeout wrapper). Vitest killed the test at the 5000ms default, producing a `Test timed out` failure — correct outcome (stub fails) but wrong failure reason (stub should fail on a semantic assertion, not infrastructure).
- **Fix:** Switched to fire-and-record `.then(onFulfilled, onRejected) → set rejectedErr`, flushed microtasks with `await Promise.resolve()` after timer advancement, then asserted on the recorded state. Now fails with a clean "expected Error, got undefined" assertion that precisely targets the missing timeout behavior.
- **Files modified:** tests/api/throttle.timeout.test.ts
- **Commit:** 2b29f36.

### Rule 2 — Auto-add missing critical functionality

None — plan enumerated the test scope precisely; no defensive additions needed.

## Authentication Gates

None — Wave 0 is test-infrastructure only, no network or auth touched.

## Self-Check: PASSED

Created files (12 total) — each verified to exist on disk:

- FOUND: tests/settings/SettingsStore.techniques-override.test.ts
- FOUND: tests/settings/SettingsTab.knowledge-graph.test.ts
- FOUND: tests/api/throttle.rate-limit-retry.test.ts
- FOUND: tests/api/throttle.timeout.test.ts
- FOUND: tests/shared/errors.isNetworkError.test.ts
- FOUND: tests/solve/SessionExpiredNotice.test.ts
- FOUND: tests/solve/ephemeralTabStore.test.ts
- FOUND: tests/solve/RunModal.test.ts
- FOUND: tests/main/codeActionsPostProcessor.test.ts
- FOUND: tests/solve/run-command-registration.test.ts
- FOUND: tests/solve/mocks/fakeWorkspace.ts
- FOUND: tests/solve/mocks/fakeSettingsStore.ts (extended)

Commits — both present in `git log`:

- FOUND: de7721a (mocks)
- FOUND: 2b29f36 (stubs)

Baseline test count — matches expected pattern (exactly 10 failing files + 70 green files).

## Known Stubs

None — this plan's deliverable IS a set of intentional failing stubs. Every stub cites its D-XX target in its header comment and names the plan that turns it green. No accidental stubs (empty UI, hardcoded mock data flowing to users, etc.) introduced.

## Threat Flags

None. No new network surface, auth path, file access, or trust boundary crossed by this plan — it is pure test-infrastructure addition inside `tests/` (which the vitest.config.ts `include: ['tests/**/*.test.ts']` already covers).
