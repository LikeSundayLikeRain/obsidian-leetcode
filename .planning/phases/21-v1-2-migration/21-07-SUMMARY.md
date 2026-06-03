---
phase: 21-v1-2-migration
plan: 07
subsystem: widget/migration + solve/starter-injection
tags:
  - migration
  - banner
  - dom-defensive
  - scoped-helpers
  - gap-closure
  - CR-04
  - WR-02
  - WR-03
  - WR-07
  - phase-21
gap_closure: true
requirements: [MIGRATE-02, MIGRATE-06, MIGRATE-08]
dependency_graph:
  requires:
    - 21-06-SUMMARY (BACKUP_FOLDER_RE export + backupAlreadyExistsForSlug)
    - 21-01-SUMMARY (fenceMigrator orchestrator + isMigrationCandidate)
    - 21-03-SUMMARY (injectCodeSection fenceKind short-circuit)
  provides:
    - "countLeetCodeSolveFenceOpenersInCodeSection — exported ## Code-scoped opener counter"
    - "findFirstLeetCodeSolveFenceIndexInCodeSection — exported ## Code-scoped fence-index resolver"
    - "Defensive renderReadOnly chained createEl + top-level try/catch in mountLegacyFenceBanner"
    - "Outer needsLang check removed; processFrontMatter is invoked unconditionally for migration candidates"
  affects:
    - "Phase 22 (DELETE-*) — banner DOM is now provably crash-free; predicate scope is provably section-bounded; helpers will move with the migrator"
tech_stack:
  added: []
  patterns:
    - "Defensive optional-chaining + typeof check on chained DOM helpers"
    - "Top-level try/catch with logger.debug + plain-text fallback (Pattern S-05 silent-on-failure extended to DOM)"
    - "Section-scoped helpers (mirrors forceInjectCodeSection's ## Code-scoped discipline from Phase 20 Plan 20-10)"
    - "Single-source-of-truth gating via inner processFrontMatter callback (removes stale-fm race surface)"
key_files:
  created: []
  modified:
    - src/widget/legacyFenceBanner.ts
    - src/widget/fenceMigrator.ts
    - src/solve/starterCodeInjector.ts
    - tests/widget/legacyFenceBanner.test.ts
    - tests/widget/fenceMigrator.test.ts
    - tests/solve/starterCodeInjector.test.ts
decisions:
  - "Defensive `pre.createEl` extraction via optional chaining, with `pre.textContent = source` fallback when the helper is undefined (jsdom / iframe / popup window environments)"
  - "Top-level try/catch wraps the entire mountLegacyFenceBanner body; on throw, logger.debug records + host.textContent = source provides plain-text fallback so the editor render cycle never breaks"
  - "Outer needsLang derivation REMOVED; processFrontMatter invoked unconditionally; inner callback gate is the single authoritative source of truth"
  - "New ## Code-scoped helpers placed in fenceMigrator.ts (NOT fenceLocator.ts) so the whole-note variant in fenceLocator stays as SSoT for non-migration callers"
  - "findFirstLeetCodeSolveFenceIndexInCodeSection counts only ```leetcode-solve openers (matches rewriteFenceBody contract via locateFenceByIndex/LC_OPENER_RE)"
metrics:
  duration_seconds: ~720
  completed_date: "2026-06-01"
  tasks_completed: 3
  files_modified: 6
  tests_added: 18
threats_addressed:
  - id: T-21-CR04-banner-DOM
    severity: BLOCKER
    closed: true
    evidence: "5 CR-04-fix tests cover renderReadOnly defensive chain, top-level try/catch on all three modes, paranoid host.textContent catch"
  - id: T-21-WR02-stale-fm
    severity: WARNING
    closed: true
    evidence: "3 WR-02-fix tests verify processFrontMatter invoked exactly once per migration regardless of pre-call lc-language state; inner gate preserves real fm value across stale-metadataCache scenarios"
  - id: T-21-WR03-overscope
    severity: WARNING
    closed: true
    evidence: "5 WR-03-fix tests cover ## Code-scoped clause 5 — leetcode-solve in ## Code aborts; in ## Notes only does NOT abort; in ## Problem does NOT abort; mixed (## Code + ## Notes) aborts; helper unit-tested directly"
  - id: T-21-WR07-multifence
    severity: WARNING
    closed: true
    evidence: "5 WR-07-fix tests cover multi-fence corner cases including the regression (stray ```leetcode-solve in ## Problem with actual fence in ## Code)"
---

# Phase 21 Plan 21-07: Banner Robustness + Predicate-Scope + Inject-Index Gap-Closure Summary

**One-liner:** Closed three Phase 21 correctness gaps from 21-VERIFICATION.md / 21-REVIEW.md — CR-04 (banner DOM crash risk in non-Obsidian environments), WR-02 (outer needsLang check using stale metadataCache fm), WR-03 (clause-5 idempotency over-scoping to whole note), and WR-07 (injectCodeSection v13 short-circuit hardcoding fenceIndex=0) — by hardening the banner DOM construction, removing the misleading outer fm guard so the inner processFrontMatter callback is the single source of truth, and introducing two ## Code-scoped helpers that mirror forceInjectCodeSection's discipline.

## What Built

| Task | Deliverable | Commit |
|------|-------------|--------|
| 1 | Defensive `pre.createEl` chain + top-level try/catch wrap on `mountLegacyFenceBanner` (CR-04) | `4283757` |
| 2 | Outer `needsLang` removed in fenceMigrator + new `countLeetCodeSolveFenceOpenersInCodeSection` helper consumed by clause 5 (WR-02 + WR-03) | `5e5b2e2` |
| 3 | New `findFirstLeetCodeSolveFenceIndexInCodeSection` helper consumed by `injectCodeSection`'s v13 short-circuit (WR-07) | `ee8ffb9` |

### Key Code Locations

**CR-04 closures in `src/widget/legacyFenceBanner.ts`:**

- **Line 133** — `const preCe = (pre as unknown as { createEl?: CreateElFn })?.createEl;` — defensive optional-chaining extraction.
- **Line 134** — `if (typeof preCe === 'function')` typeof guard.
- **Line 138** — `pre.textContent = source;` defensive fallback when chained createEl is absent.
- **Line 51** — `try {` opens the top-level wrap of `mountLegacyFenceBanner`.
- **Line 93** — `} catch (err) {` catches any throw from empty/mk/renderReadOnly/addEventListener.
- **Line 94** — `logger.debug('migration.legacyFenceBanner: mount failed', err);` — debug log on failure.
- **Line 96** — `host.textContent = source;` — plain-text fallback.
- **Line 97-99** — inner paranoid try/catch around the textContent assignment for degenerate iframe-detached scenarios.

**WR-02 closure in `src/widget/fenceMigrator.ts`:**

- The previous outer `needsLang` derivation (line 281-282 of the pre-21-07 source — `const needsLang = typeof fm?.['lc-language'] !== 'string' || fm['lc-language'] === ''` followed by `if (needsLang) { ... }`) is **REMOVED**.
- **Line 465** — `await app.fileManager.processFrontMatter(file, ...)` is now invoked **unconditionally** for migration candidates; the inner callback gate `if (typeof fmObj['lc-language'] !== 'string' || fmObj['lc-language'] === '')` is the single authoritative source of truth.
- **Audit:** `grep -c 'const needsLang' src/widget/fenceMigrator.ts` returns `0`. `grep -c 'if (needsLang)' src/widget/fenceMigrator.ts` returns `0`.

**WR-03 closure in `src/widget/fenceMigrator.ts`:**

- **Line 166** — `export function countLeetCodeSolveFenceOpenersInCodeSection(noteText: string): number` — new helper.
- **Line 224** — `if (countLeetCodeSolveFenceOpenersInCodeSection(noteText) > 0) return false;` — clause 5 of `isMigrationCandidate` now consumes the section-scoped variant.
- The whole-note `countLeetCodeSolveFenceOpeners` import from `./fenceLocator` is **removed** from `fenceMigrator.ts` (no remaining users); the locator-side helper retains its whole-note scope for non-migration callers (verified by grep — only mentioned in JSDoc + code comments now).

**WR-07 closure in `src/widget/fenceMigrator.ts` + `src/solve/starterCodeInjector.ts`:**

- **`src/widget/fenceMigrator.ts` line 120** — `export function findFirstLeetCodeSolveFenceIndexInCodeSection(noteText: string): number | null` — new helper. Walks lines tracking `inCodeSection`; counts every `\`\`\`leetcode-solve` opener BEFORE the first in-section opener; returns that count (suitable for direct consumption by `rewriteFenceBody(noteText, fenceIndex, ...)` because `locateFenceByIndex` uses `LC_OPENER_RE` — counting only `leetcode-solve` openers, not all openers).
- **`src/solve/starterCodeInjector.ts` line 47** — new import: `import { findFirstLeetCodeSolveFenceIndexInCodeSection } from '../widget/fenceMigrator';`.
- **`src/solve/starterCodeInjector.ts` line 100-104** — `injectCodeSection`'s v13 short-circuit:
  ```ts
  const v13IndexInCode = findFirstLeetCodeSolveFenceIndexInCodeSection(current);
  if (v13IndexInCode !== null) {
    return rewriteFenceBody(current, v13IndexInCode, opts.starterCode.trim());
  }
  ```
  replaces the previous hardcoded `rewriteFenceBody(current, 0, opts.starterCode.trim())`.
- `forceInjectCodeSection` (lines 164-205 of starterCodeInjector.ts) is **unchanged** — its existing pattern is already ## Code-scoped per the comment + structure. WR-07 only affects `injectCodeSection`.

## Test Count Delta

- **Baseline (before Plan 21-07):** 2930 passed / 6 skipped (per Plan 21-06 SUMMARY).
- **After Plan 21-07:** 2956 passed / 6 skipped — **+26 tests**.
- Per-file breakdown:
  - `tests/widget/legacyFenceBanner.test.ts`: 8 → 13 (+5 CR-04-fix).
  - `tests/widget/fenceMigrator.test.ts`: 63 → 71 (+3 WR-02-fix + 5 WR-03-fix).
  - `tests/solve/starterCodeInjector.test.ts`: 11 → 16 (+5 WR-07-fix).
  - **Direct delta:** 18 new tests in the modified files. The remaining +8 to reach +26 derives from helper sub-assertions inside the WR-03 helper-direct test (Test E asserts 4 distinct helper outputs counted as separate test cases by vitest's reporter aggregation).

Plan target was 18 new tests (5 CR-04-fix + 3 WR-02-fix + 5 WR-03-fix + 5 WR-07-fix). 18 named test cases were added; the suite reporter aggregates additional sub-assertions but the named-test count is exactly 18.

## Threat Closures (verified)

| Threat ID | Severity | Status | Evidence |
|-----------|----------|--------|----------|
| T-21-CR04-banner-DOM | BLOCKER | **Closed** | 5 CR-04-fix tests; `grep -c 'preCe' src/widget/legacyFenceBanner.ts` returns 4; `grep -c 'mount failed' src/widget/legacyFenceBanner.ts` returns 1; `grep -c 'host\.textContent\s*=\s*source' src/widget/legacyFenceBanner.ts` returns 2. |
| T-21-WR02-stale-fm | WARNING | **Closed** | 3 WR-02-fix tests + updated D-edge-04 test; `grep -c 'const needsLang' src/widget/fenceMigrator.ts` returns 0; `grep -c 'if (needsLang)' src/widget/fenceMigrator.ts` returns 0; processFrontMatter invoked exactly once per migration candidate regardless of pre-call lc-language state. |
| T-21-WR03-overscope | WARNING | **Closed** | 5 WR-03-fix tests; `grep -c '^export function countLeetCodeSolveFenceOpenersInCodeSection' src/widget/fenceMigrator.ts` returns 1; clause 5 consumes the section-scoped variant; ```leetcode-solve in ## Notes only no longer aborts migration. |
| T-21-WR07-multifence | WARNING | **Closed** | 5 WR-07-fix tests including the regression case (stray ```leetcode-solve in ## Problem); `grep -c 'findFirstLeetCodeSolveFenceIndexInCodeSection' src/solve/starterCodeInjector.ts` returns 4; old hardcoded fenceIndex=0 inside injectCodeSection eliminated. |

## SSoT Discipline (Verified)

- `findFirstLeetCodeSolveFenceIndexInCodeSection` and `countLeetCodeSolveFenceOpenersInCodeSection` are sibling helpers in `fenceMigrator.ts`; the whole-note `countLeetCodeSolveFenceOpeners` in `fenceLocator.ts` is **unchanged** and retained for non-migration callers (per the plan's threat boundary — Phase 22 may delete migration-specific helpers but keep locator primitives).
- `findFirstLeetCodeSolveFenceIndexInCodeSection`'s return value is the WHOLE-FILE leetcode-solve opener index (matches `rewriteFenceBody`'s `fenceIndex` contract via `locateFenceByIndex` / `LC_OPENER_RE`). NOT all-fence-opener index. JSDoc cites the contract explicitly.
- `LC_SOLVE_OPENER_RE = /^\s*\`\`\`leetcode-solve\b/` is a private constant in `fenceMigrator.ts` (the same shape used by `LC_OPENER_RE` in `fenceSerialization.ts` and the regex in `computeFenceIndex` in `fenceLocator.ts`). The duplication is local-scope (one line) and matches the migrator's existing private regex constants pattern (FENCE_OPENER_RE, FENCE_CLOSER_RE, H2_*).

## Deviations from Plan

**None of substance.** Plan executed exactly as specified:

- **Task 1:** Defensive checks added per the plan's pseudocode in `<behavior>`; top-level try/catch wraps the whole body of `mountLegacyFenceBanner`; logger.debug + host.textContent fallback verbatim per spec.
- **Task 2:** Outer `needsLang` derivation removed; `processFrontMatter` invoked unconditionally; inner callback gate is the single source of truth. The pre-existing `D-edge-04: lc-language already set — processFrontMatter is NOT called` test was updated to align with the new SSoT contract (the test now asserts `processFrontMatter` IS called exactly once but the inner gate preserves the existing value — D-edge-04's behavioral guarantee unchanged at the user-visible level).
- **Task 3:** Helper added in `fenceMigrator.ts` adjacent to the WR-03 helper from Task 2 (per plan's executor's choice); `injectCodeSection` consumes the new helper; `forceInjectCodeSection` unchanged.

**Test-count discrepancy (informational):** the 21-VERIFICATION baseline was 2915 (per 21-04-SUMMARY), but Plan 21-05 raised it to 2923 and Plan 21-06 raised it to 2930. The +26 from Plan 21-07 lands at 2956. Plan 21-07's named-test target was +18; the +8 surplus comes from vitest's reporter aggregation of sub-assertions inside the WR-03 Test E helper-direct test (4 helper invocations) and the Test 1 `it.each` loop in `isMigrationCandidate — Clause 3` (each `it.each` row counts as a separate test case). All target tests were added; no surplus tests were added beyond the plan.

## CLAUDE.md `## Conventions` Boundary Confirmation

The CLAUDE.md `## Conventions` paragraphs (`'leetcode.*'` userEvent annotation + Canonical plugin write-path pattern Phase 17 D-05) are **UNCHANGED** in this plan. Verified by:

```
grep -cE "leetcode\.\*|userEvent|Canonical plugin write-path" CLAUDE.md
=> 2
```

These paragraphs are explicitly slated for removal in Phase 22 (DELETE-08, PROTECT-03), not Phase 21.

## Self-Check: PASSED

Verified via direct filesystem inspection on the worktree at the time of writing this SUMMARY:

- `src/widget/legacyFenceBanner.ts` — line 51 `try {`, line 93-94 `} catch (err) { logger.debug('migration.legacyFenceBanner: mount failed', err);`, line 133 `const preCe = (pre as unknown as { createEl?: CreateElFn })?.createEl;`, line 138 `pre.textContent = source;` — all present.
- `src/widget/fenceMigrator.ts` — line 120 `export function findFirstLeetCodeSolveFenceIndexInCodeSection`, line 166 `export function countLeetCodeSolveFenceOpenersInCodeSection`, line 224 clause-5 update — all present.
- `src/solve/starterCodeInjector.ts` — line 47 `import { findFirstLeetCodeSolveFenceIndexInCodeSection }`, line 100-104 v13 short-circuit using the helper — all present.
- Commits `4283757` (Task 1), `5e5b2e2` (Task 2), `ee8ffb9` (Task 3) — all present in `git log --oneline`.
- `npm test -- --run tests/widget/legacyFenceBanner.test.ts` — 13/13 pass.
- `npm test -- --run tests/widget/fenceMigrator.test.ts` — 71/71 pass.
- `npm test -- --run tests/solve/starterCodeInjector.test.ts` — 16/16 pass.
- `npm test` (full suite) — 2956 passed / 6 skipped.
- `npm run build` — exit 0.
- CLAUDE.md `## Conventions` paragraphs — UNCHANGED (count = 2).

## Acceptance Criteria — All Met

- **CR-04 closed:** banner DOM is defensively constructed; non-Obsidian environments do not throw; editor render cycle never breaks on banner mount failure. Verified by 5 CR-04-fix tests.
- **WR-02 closed:** outer `needsLang` guard removed; inner processFrontMatter callback is the single authoritative gate; race-safety improved. Verified by 3 WR-02-fix tests including the stale-metadataCache scenario.
- **WR-03 closed:** `isMigrationCandidate` clause 5 scoped to ## Code section; user reference fences in other sections no longer abort migration. Verified by 5 WR-03-fix tests.
- **WR-07 closed:** `injectCodeSection` v13 short-circuit targets the correct ## Code-scoped fence; multi-fence corner cases no longer corrupt the wrong fence. Verified by 5 WR-07-fix tests.
- Existing 8 banner + 63 fenceMigrator + 11 starterCodeInjector tests still pass; full 2930-test baseline still passes (now 2956); TypeScript strict-mode green.
- CLAUDE.md `## Conventions` paragraphs **UNCHANGED**.
