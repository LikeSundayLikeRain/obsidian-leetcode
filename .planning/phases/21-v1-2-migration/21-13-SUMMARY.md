---
phase: 21-v1-2-migration
plan: 13
subsystem: notes-write-path
tags: [migration, new-note, fence-emit, retrofit, fenceKind, gap-closure, phase-21, post-uat, bug-fix, defense-in-depth]
gap_closure: true
requirements: [NEWNOTE-FENCE-DEDUP-01]
dependency-graph:
  requires:
    - "src/widget/fenceLocator.ts:countLeetCodeSolveFenceOpeners (Plan 19)"
    - "src/widget/fenceMigrator.ts:findFirstLeetCodeSolveFenceIndexInCodeSection (Plan 21-07)"
    - "src/widget/fenceSerialization.ts:rewriteFenceBody (Plan 19-04)"
    - "src/notes/NoteWriter.ts:NoteWriterSettings.getUseInlineWidget?() (Plan 21-03)"
    - "src/solve/starterCodeInjector.ts:injectCodeSection fenceKind dispatch (Plan 21-03)"
  provides:
    - "Plan 21-13 closes the four-call-site retrofit duplicate-fence corruption (Post-UAT Gap B) at two layers — fenceKind plumbing in retrofit() + useInlineWidget gate in NoteWriter.retrofitStarterCode wrapper"
  affects:
    - "src/solve/starterCodeInjector.ts (retrofit() — settings widening + fenceKind dispatch)"
    - "src/notes/NoteWriter.ts (retrofitStarterCode wrapper — useInlineWidget early-return gate)"
tech-stack:
  added: []
  patterns:
    - "Mirrors Phase 20 Plan 20-09 main.ts:1421-1429 file-open gate (gate retrofit on !useInlineWidget)"
    - "Mirrors Phase 20 Plan 20-10 forceInjectCodeSection fenceKind dispatch (now extended to retrofit())"
    - "Optional getter widening (`getUseInlineWidget?(): boolean`) preserves test-fixture back-compat"
key-files:
  created:
    - "(none — extended existing files only)"
  modified:
    - "src/solve/starterCodeInjector.ts"
    - "src/notes/NoteWriter.ts"
    - "tests/solve/starterCodeInjector.test.ts"
    - "tests/notes/NoteWriter.starter-retrofit.test.ts"
decisions:
  - "Option (a) — extend retrofit()'s settings parameter with optional getUseInlineWidget?(): boolean (NO new positional arg). Smallest diff that closes all four NoteWriter call sites (lines 272/343/419/453) simultaneously through the shared wrapper."
  - "Defense-in-depth gate added to NoteWriter.retrofitStarterCode (the wrapper) — short-circuits BEFORE invoking the raw retrofit when useInlineWidget=ON. Mirrors Plan 20-09 file-open gate pattern."
  - "fenceKind plumbing kept even though the wrapper gate makes it structurally unreachable in production — belt-and-suspenders for any future caller that bypasses the wrapper."
metrics:
  duration: "~7m"
  completed: "2026-06-01"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  tests_added: 11
  tests_total_passing: 1968
---

# Phase 21 Plan 13: Post-UAT Gap B Duplicate-Fence Corruption Closure Summary

Closed the post-UAT "duplicate fence on new problem from browser" symptom by threading `fenceKind` through `retrofit()` (belt) AND gating `NoteWriter.retrofitStarterCode` on `useInlineWidget` (suspenders) — single root cause fix protecting all four NoteWriter retrofit call sites.

## What Changed

**Belt — fenceKind plumbing in `src/solve/starterCodeInjector.ts:retrofit()`:**

- Widened `settings` parameter from `{ getDefaultLanguage(): string }` to `{ getDefaultLanguage(): string; getUseInlineWidget?(): boolean }`. The new field is OPTIONAL so existing test fixtures (and the `src/main/fileOpenHook.ts:55-60` callsite that constructs a minimal `langSettings` from frontmatter) continue to compile byte-for-byte.
- Inside `retrofit()`, after deriving `defaultLang` and `starter`, derive `fenceKind: settings.getUseInlineWidget?.() === true ? 'leetcode-solve' : 'legacy'`.
- Pass `fenceKind` into the `InjectOptions` object handed to `injectCodeSection`. The v1.3 short-circuit at `injectCodeSection.ts:106-112` now engages when called from retrofit (it routes through `rewriteFenceBody` to leave the existing `\`\`\`leetcode-solve` fence's opener byte-for-byte and replace only the body).

**Suspenders — defense-in-depth gate in `src/notes/NoteWriter.ts:retrofitStarterCode` (wrapper at lines 230-241):**

- Read `useInlineWidget` once at the top of the wrapper via `this.settings.getUseInlineWidget?.() ?? false`.
- Added an early-return gate BEFORE the existing `if (!defaultLang && !hasAnyStarter) return` check: when `useInlineWidget=ON`, log a debug message and return immediately. The v1.3 widget owns its own fence body via `vault.process` writes, so retrofit is structurally meaningless on the v1.3 path.
- This gate protects all four call sites simultaneously: lines 272 (re-open with cached detail), 343 (cache-cleared recovery), 419 (new-note belt-and-suspenders), 453 (backgroundRefresh after TTL).

The combination is exactly the planned belt-and-suspenders posture: even if any future caller bypasses the wrapper gate, the fenceKind plumbing inside `retrofit()` itself routes the call to the body-only-replace path (no sibling fence graft).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | TDD: thread fenceKind through retrofit() + useInlineWidget gate on retrofitStarterCode wrapper | 62c5b56 | `src/solve/starterCodeInjector.ts`, `src/notes/NoteWriter.ts`, `tests/solve/starterCodeInjector.test.ts`, `tests/notes/NoteWriter.starter-retrofit.test.ts` |
| 2 | Audit + verify zero file overlap with Plans 21-08..21-12; full Phase 21 test suite | (verification-only — no source change) | (none) |

## Tests

**11 new tests, all passing on the post-fix tree:**

`tests/solve/starterCodeInjector.test.ts` — 5 unit tests under `describe('retrofit() fenceKind plumbing — Post-UAT Gap B (Plan 21-13)', ...)`:
- **U1** retrofit threads `fenceKind: 'leetcode-solve'` when `getUseInlineWidget()=true` → exactly one fence opener after rewriteFenceBody short-circuit; ZERO `\`\`\`python` siblings.
- **U2** retrofit threads `fenceKind: 'legacy'` when `getUseInlineWidget()=false` → legacy `\`\`\`python` fence emitted (Phase 5.3 D-04 remap preserved).
- **U3** retrofit defaults to `'legacy'` when settings omits `getUseInlineWidget` (back-compat for older test fixtures predating Plan 21-13).
- **U4** retrofit on a v1.3 note where the existing fence body matches the trimmed starter → byte-equal idempotent (no churn, no spurious fence graft).
- **U5** retrofit on a v1.3 note with a DIFFERENT starter → body rewritten, opener `\`\`\`leetcode-solve` preserved byte-for-byte, ZERO `\`\`\`<langSlug>` siblings anywhere in the note.

`tests/notes/NoteWriter.starter-retrofit.test.ts` — 6 integration tests under `describe('NoteWriter retrofit useInlineWidget gating — Post-UAT Gap B (Plan 21-13)', ...)`:
- **I1 (HEADLINE Gap B regression)** `openProblem('palindrome-number')` with `useInlineWidget=true` on a fresh problem → asserts SOURCE BYTES of created file: ## Code appears once, exactly one fence opener `\`\`\`leetcode-solve`, exactly one closer, ZERO `\`\`\`python|\`\`\`java` siblings, `class Solution:` appears exactly once.
- **I2 (re-open path, line 272)** v1.3-shaped existing note + cached detail + `useInlineWidget=true` → no churn, no fence graft.
- **I3 (cache-cleared recovery, line 343)** v1.3-shaped existing note on disk + cleared settings cache → existingAtCanonical branch runs, single-fence shape preserved.
- **I4 (backgroundRefresh, line 453)** v1.3-shaped existing note + STALE cache (8 days old) → backgroundRefresh fires, single-fence shape preserved.
- **I5 (legacy preservation)** `useInlineWidget=false` → legacy `\`\`\`python` fence emitted (no regression for v1.2 users).
- **I6 (back-compat)** settings WITHOUT `getUseInlineWidget` getter → treated as legacy (no regression for older fixtures).

**RED gate confirmed before fix:** 7 of 11 new tests failed on the pre-fix tree (U1, U4, U5, I1, I2, I3, I4 — exactly the predicted set). U2, U3, I5, I6 already passed (they assert preserved legacy behavior).

**GREEN gate after fix:** all 11 new tests pass; all 21 pre-existing tests in `starterCodeInjector.test.ts` continue to pass; all 5 pre-existing tests in `NoteWriter.starter-retrofit.test.ts` continue to pass.

**Full Phase 21 surface (Task 2 verification):**

```
npm test -- tests/solve tests/notes tests/widget tests/main --run
Test Files  100 passed (100)
Tests       1968 passed | 5 skipped (1973)
```

Zero regressions in adjacent surfaces (`tests/widget/fenceMigrator.test.ts`, `tests/main/readingModeMigrationTrigger.test.ts`, etc.).

**Build (TypeScript + esbuild):** `npm run build` exits 0.

## Audit (Task 2)

Confirmed **only NoteWriter consumes `retrofit` from `starterCodeInjector` in production** (plus `main.ts` which already gates the file-open path on `!useInlineWidget` per Plan 20-09):

```
src/main.ts:87:                  import { retrofit as retrofitStarterCode } ...
src/notes/NoteWriter.ts:52:      import { retrofit as retrofitStarterCodeRaw } ...
tests/solve/starterCodeInjector.test.ts:2:  import { injectCodeSection, retrofit } ...
```

Two unrelated production files import `forceInjectCodeSection` (a different function with its own Plan 20-10 fenceKind support — out of scope for Plan 21-13):

```
src/solve/resetCodeWithConfirm.ts:20:    import { forceInjectCodeSection } ...
src/graph/copyToCode.ts:26:              import { forceInjectCodeSection } ...
```

No additional unguarded retrofit consumers exist; the wrapper-level gate plus the function-level fenceKind plumbing together cover every production code path that could trigger Gap B.

## Sanity Grep Gates (Task 2)

- `grep -c "fenceKind" src/solve/starterCodeInjector.ts` → **13** (≥ 1 required; the new dispatch is present along with the existing Plan 20-10 / Plan 21-03 dispatches).
- `grep -c "useInlineWidget" src/notes/NoteWriter.ts` → **5** (≥ 2 required; the existing `buildNoteBody` site PLUS the new `retrofitStarterCode` gate; remaining occurrences are interface declaration + comments).

## Threat-Model Recap

| Threat | Surface | Mitigation realized |
|---|---|---|
| T-21-13-01 Tampering — retrofit on v1.3 notes | `retrofit()` | TWO layers: fenceKind plumbing routes v1.3 path through `rewriteFenceBody` (preserves opener byte-for-byte); wrapper gate short-circuits the entire retrofit call when `useInlineWidget=ON` |
| T-21-13-02 Data Integrity — starter body byte-equality | `rewriteFenceBody(text, fenceIndex, starter.trim())` | Property-tested via `tests/widget/fenceSerialization.property.test.ts` (Plan 19-04 corpus); idempotency confirmed by Test U4 |
| T-21-13-04 Backward compatibility — settings interface widening | `retrofit()` settings shape | `getUseInlineWidget?()` is OPTIONAL; existing `src/main/fileOpenHook.ts` callsite (which constructs `langSettings = { getDefaultLanguage }`) compiles unchanged |
| T-21-13-05 Backward compatibility — legacy v1.2 path preservation | `useInlineWidget=false` branch | Tests U2, U3, I5, I6 explicitly assert byte-equality with pre-fix legacy behavior |

**Write-path discipline:** vault writes still go exclusively through `app.vault.process(file, fn)` (CF-06 / L8). No new write paths introduced. No CM6 dispatches added — Phase 17 D-05 child-editor pattern is irrelevant (retrofit fires from `openProblem` BEFORE the widget mounts, so no child editor exists at retrofit-time). Phase 05.5 `'leetcode.*'` userEvent rule does NOT apply (no CM6 transactions). User input crosses no new trust boundary.

**No threat flags raised** — the change widens an internal options shape and gates an existing code path; it does not introduce new endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Deviations from Plan

None — plan executed exactly as written. The "preferred option (a)" in the plan's `<objective>` (extend `retrofit()`'s settings parameter with optional getter, NO new positional argument) was the chosen path; the defense-in-depth gate at the wrapper was added in addition per the plan's belt-and-suspenders directive.

## Known Stubs

None. The fix wires real production data flow end-to-end (no placeholder values, no hard-coded empty results, no mock-only behavior).

## Plan Goals Achieved

- [x] All four NoteWriter `retrofitStarterCode` call sites (lines 272, 343, 419, 453) protected by the wrapper-level gate.
- [x] `retrofit()`'s fenceKind plumbing independently locked in by Tests U1, U4, U5 (belt — protects future bypass-the-wrapper callers).
- [x] Legacy v1.2 behavior byte-for-byte preserved (Tests U2, U3, I5, I6).
- [x] Test coverage gap identified by debug agent (no integration test exercising retrofit through openProblem with `useInlineWidget=ON`) is closed by Test I1's source-byte assertion.
- [x] Plan 21-13 has zero file overlap with Plans 21-08..21-12 — wave-parallel safe.
- [x] No `PHASE_22_DELETE_WITH_V1_2_PATH` marker added (the surrounding `useInlineWidget=ON ? : useInlineWidget=OFF` branching is mechanically deleted by Phase 22 alongside the v1.2 path).

## Self-Check: PASSED

- [x] `src/solve/starterCodeInjector.ts` exists with `fenceKind` plumbing (commit 62c5b56).
- [x] `src/notes/NoteWriter.ts` exists with `useInlineWidget` gate (commit 62c5b56).
- [x] `tests/solve/starterCodeInjector.test.ts` extended with `retrofit() fenceKind plumbing — Post-UAT Gap B (Plan 21-13)` describe block (commit 62c5b56).
- [x] `tests/notes/NoteWriter.starter-retrofit.test.ts` extended with `NoteWriter retrofit useInlineWidget gating — Post-UAT Gap B (Plan 21-13)` describe block (commit 62c5b56).
- [x] Commit 62c5b56 present in `git log`.
- [x] All verification gates pass: 11 new tests + 1968 existing tests + `npm run build` exits 0.
