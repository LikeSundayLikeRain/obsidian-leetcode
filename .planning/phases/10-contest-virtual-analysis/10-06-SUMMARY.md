---
phase: 10-contest-virtual-analysis
plan: 06
subsystem: contest-finalization
tags: [contest, vault-write, notes, finalization, revisit-tagging]
dependency_graph:
  requires: [10-01, 10-02]
  provides: [ContestFinalizer, finalizeContest, buildSummaryBody, rewriteCodeSection]
  affects: [src/contest, tests/contest]
tech_stack:
  added: []
  patterns: [vault.process-for-body-writes, processFrontMatter-for-metadata, pure-string-transform-helpers]
key_files:
  created:
    - src/contest/ContestFinalizer.ts
    - tests/contest/ContestFinalizer.test.ts
    - tests/contest/revisitTag.test.ts
    - tests/contest/summaryNote.test.ts
  modified: []
decisions:
  - "Contest subfolder path: {folder}/Contests/{slug}/ for problem notes"
  - "Summary path: {folder}/Contests/{date}-{slug}.md for summary note"
  - "Slug validation via /^(weekly|biweekly)-contest-\\d+$/ regex (T-10-10)"
  - "Existing file lookup checks both contest subfolder and normal problems folder"
metrics:
  duration: "191s"
  completed: "2026-05-18T16:59:33Z"
  tasks_completed: 1
  tasks_total: 1
  tests_added: 28
  tests_passing: 28
---

# Phase 10 Plan 06: Contest Finalizer Summary

**One-liner:** Batch contest finalization — problem notes with D-13 merge strategy, rich summary note with scoring, and #revisit tagging on missed problems.

## What Was Built

The `ContestFinalizer` module transforms ephemeral contest state (held in PluginData during the contest) into permanent vault artifacts when a contest ends (finish, abort, or timer expiry):

1. **Problem notes** — Created in `{folder}/Contests/{slug}/` subfolder. D-13 merge strategy enforced: AC overwrites `## Code` on existing notes; non-AC leaves existing notes untouched.

2. **Summary note** — Written to `{folder}/Contests/{date}-{slug}.md` with:
   - Rich frontmatter (D-14): `lc-contest-id`, `lc-contest-type`, `date`, `duration`, `score`, `solved-count`, `problems`
   - Body (D-17): `## Results` table (Problem | Difficulty | Verdict | Time | Points) + `## Notes` section

3. **#revisit tagging** (CONTEST-08) — Missed problems (verdict !== 'accepted') automatically get `#revisit` added to frontmatter tags via `processFrontMatter`.

## Key Exports

| Export | Type | Purpose |
|--------|------|---------|
| `finalizeContest` | async function | Main orchestrator — batch notes + summary + tags |
| `buildSummaryBody` | pure function | Markdown body builder (testable in isolation) |
| `rewriteCodeSection` | pure function | Replaces code fence under ## Code heading |
| `computeElapsedMs` | pure function | Calculates solving time excluding pauses |

## Decisions Made

1. **Contest subfolder**: Problem notes land in `{folder}/Contests/{slug}/` rather than the root problems folder — keeps contest work grouped.
2. **Dual-path lookup**: Checks both contest subfolder and normal problems folder for existing files (handles re-solving problems previously solved outside a contest).
3. **Slug validation (T-10-10)**: Regex gate on `contestSlug` prevents path traversal before any filesystem interpolation.
4. **Pure helpers**: `buildSummaryBody` and `rewriteCodeSection` are exported as pure functions for testability — no I/O, no side effects.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `7622f66` | feat(10-06): ContestFinalizer — batch notes + summary + #revisit |

## Verification Results

- All 28 tests pass (ContestFinalizer: 10, revisitTag: 4, summaryNote: 14)
- `npm run build` succeeds (tsc + esbuild)
- Zero `vault.modify` usage in source
- `processFrontMatter` used for all frontmatter mutations (4 call sites)
- `lc-contest-id` written in 3 contexts (new note, existing AC note, summary note)

## Self-Check: PASSED

- [x] `src/contest/ContestFinalizer.ts` exists
- [x] `tests/contest/ContestFinalizer.test.ts` exists
- [x] `tests/contest/revisitTag.test.ts` exists
- [x] `tests/contest/summaryNote.test.ts` exists
- [x] Commit `7622f66` exists in git log
