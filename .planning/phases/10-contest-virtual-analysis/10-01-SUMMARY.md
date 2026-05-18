---
phase: 10-contest-virtual-analysis
plan: 01
subsystem: contest
tags: [contest, types, api, settings, disclosure, foundation]
dependency_graph:
  requires: []
  provides: [ContestSession, ContestProblemState, CachedContest, ContestIndex, getRemainingMs, ContestListService, inferContestType, withContestAnalysisBullet, AI_ANALYSIS_HEADING_LINE, getPastContests, getContestQuestions]
  affects: [src/settings/SettingsStore.ts, src/api/LeetCodeClient.ts, src/ai/disclosure.ts, src/notes/NoteTemplate.ts]
tech_stack:
  added: []
  patterns: [single-flight-guard, shape-guard, composition-factory, TTL-cache]
key_files:
  created:
    - src/contest/types.ts
    - src/contest/ContestListService.ts
    - tests/contest/ContestListService.test.ts
    - tests/contest/types.test.ts
  modified:
    - src/settings/SettingsStore.ts
    - src/api/LeetCodeClient.ts
    - src/ai/disclosure.ts
    - src/notes/NoteTemplate.ts
decisions:
  - "LeetCodeAdvanced is a drop-in replacement for LeetCode (same constructor, same credential flow) — A1 assumption confirmed"
  - "Contest slug validation (T-10-01) placed in LeetCodeClient.getContestQuestions as a pre-call guard"
  - "surpriseMe maxAttempts capped at min(3, contests.length) to avoid infinite loops when fewer than 3 contests exist"
  - "AI_ANALYSIS_HEADING_LINE intentionally NOT added to LOCKED_HEADINGS (summary notes only, not problem notes)"
metrics:
  duration: "7m 59s"
  completed: "2026-05-18T16:33:08Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 24
  tests_total_passing: 1267
  files_created: 4
  files_modified: 4
---

# Phase 10 Plan 01: Contest Foundation (Types, Schema, API, Service) Summary

**One-liner:** Contest type contracts, PluginData schema extension with shape-guards, LeetCodeAdvanced upgrade, ContestListService with paginated fetch/cache/search/surprise-me, disclosure factory, and NoteTemplate constant.

## What Was Built

### Task 1: Contest Types + PluginData + LeetCodeClient + Disclosure + NoteTemplate (781ee53)

- **src/contest/types.ts** — Pure interface module exporting `CachedContest`, `ContestIndex`, `ContestProblemState`, `ContestSession`, and `getRemainingMs()` pure function (handles paused/running states via epoch math).
- **src/settings/SettingsStore.ts** — Extended `PluginData` with `contestSession: ContestSession | null`, `autoAIContestAnalysis: boolean`, `contestIndex: ContestIndex | null`. Added `isValidContestSession` and `isValidContestIndex` shape-guards following the `isValidProblemIndex` pattern. Added getter/setter pairs for all three fields.
- **src/api/LeetCodeClient.ts** — Upgraded from `LeetCode` to `LeetCodeAdvanced` (drop-in replacement). Added `getPastContests()` and `getContestQuestions()` methods with slug validation (T-10-01 threat mitigation).
- **src/ai/disclosure.ts** — Added `withContestAnalysisBullet` composition factory following the existing `withDebugBullet`/`withReviewBullet` pattern (WR-02 frozen-base safe).
- **src/notes/NoteTemplate.ts** — Added `AI_ANALYSIS_HEADING_LINE = '## AI Analysis'` constant. Intentionally NOT added to `LOCKED_HEADINGS` (applies to summary notes only).

### Task 2: ContestListService (6b4bc5e)

- **src/contest/ContestListService.ts** — Full service with:
  - `refresh(force?)` — paginated fetch via `getPastContests(limit=100, skip)`, 24h TTL, single-flight deduplication.
  - `search(contests, term)` — case-insensitive title substring filter.
  - `surpriseMe()` — random pick with `getContestQuestions` validation, up to 3 retries on failure.
  - `inferContestType(titleSlug)` — derives `weekly`/`biweekly` from slug prefix.
- **tests/contest/ContestListService.test.ts** — 18 tests covering refresh (cache hit/miss/stale/force/pagination/single-flight), search (empty/match/no-match), and surpriseMe (success/retry/exhaustion/empty-cache/few-questions).
- **tests/contest/types.test.ts** — 6 tests for `getRemainingMs` covering running/paused/expired/just-started scenarios.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npx vitest run tests/contest/` — 24 tests pass
- `npm run build` — esbuild compilation succeeds
- `grep -n "LeetCodeAdvanced" src/api/LeetCodeClient.ts` — matches found
- `grep -n "withContestAnalysisBullet" src/ai/disclosure.ts` — match found
- `grep -n "AI_ANALYSIS_HEADING_LINE" src/notes/NoteTemplate.ts` — match found
- `grep -n "contestSession" src/settings/SettingsStore.ts` — matches in PluginData + shape-guard + getter/setter
- Full test suite: 1267 passed, 1 pre-existing failure (worktree path resolution in sectionLockIntegration.test.ts)

## Known Stubs

None. All exported functions and interfaces are fully implemented with production logic.

## Self-Check: PASSED

- [x] src/contest/types.ts exists
- [x] src/contest/ContestListService.ts exists
- [x] tests/contest/ContestListService.test.ts exists
- [x] tests/contest/types.test.ts exists
- [x] Commit 781ee53 exists
- [x] Commit 6b4bc5e exists
