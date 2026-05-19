---
phase: 12-polish-plugin-store-resubmission
plan: 02
subsystem: contest
tags: [bug-fix, contest-mode, lifecycle, ui]
dependency_graph:
  requires: [10-04, 10-05, 10-07]
  provides: [contest-scratch-hidden, contest-tab-idempotent, contest-finish-lifecycle]
  affects: [src/contest/ContestScratchManager.ts, src/browse/ProblemBrowserView.ts, src/main.ts]
tech_stack:
  added: []
  patterns: [leaf-scan-reuse, callback-patching, lifecycle-ownership]
key_files:
  created: []
  modified:
    - src/contest/ContestScratchManager.ts
    - src/browse/ProblemBrowserView.ts
    - src/main.ts
decisions:
  - "D-06 badge update already works via wireContestCallbacks patching; added fallback onVerdictChange in main.ts for workspace-restore edge case"
  - "D-08 AI review suppression confirmed already correct (no code change needed)"
  - "D-09 root cause: PBV.handleFinishContest called finish() before handleContestEnd, clearing session prematurely"
metrics:
  duration: "3m 27s"
  completed: "2026-05-19T15:26:16Z"
---

# Phase 12 Plan 02: Contest Mode Bug Fixes Summary

**One-liner:** Fix 5 contest integration bugs: hidden scratch folder, tab reuse via leaf scan, immediate badge re-render, AI review deferral verified, and finish lifecycle ownership fix.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Scratch folder + Tab idempotency + onVerdictChange re-render | 5da3c8a | `.leetcode-contest` folder, leaf scan before getLeaf, fallback onVerdictChange |
| 2 | AI review deferral + Contest finish lifecycle | b4184aa | Removed premature finish()/abort() from PBV handlers, fixed onExpired double-fire |

## Changes Made

### D-05: Hidden scratch folder
- Changed `SCRATCH_FOLDER` constant from `'LeetCode/contest-scratch'` to `'.leetcode-contest'`
- Dot-prefixed folder is invisible in Obsidian's file explorer

### D-06: Sidebar AC status update
- Replaced no-op `onVerdictChange` callback in main.ts with a fallback that triggers `ProblemBrowserView.onOpen()` on all open browser view leaves
- Primary badge update still happens via `wireContestCallbacks()` direct patching; this fallback covers workspace-restore edge cases where callbacks are not re-wired

### D-07: Tab idempotency
- Added leaf scan in `openContestProblem()` before `getLeaf('tab')` that checks all markdown leaves for matching file path
- If existing leaf found, calls `revealLeaf()` and returns early

### D-08: AI review deferral during contest
- Verified: `ContestSolveView.ts` VerdictModal constructions have no `onStartReviewStream` callback
- No code change needed; AI review is correctly suppressed

### D-09: Finish lifecycle completion
- Root cause: `ProblemBrowserView.handleFinishContest()` called `contestSessionManager.finish()` which cleared the session, then called `handleContestEnd()` which found null session and returned early
- Fix: Removed `finish()`/`abort()` calls from PBV handlers; `handleContestEnd` now owns the full lifecycle (sync code from scratch, finish/abort session, finalize notes, Notice, cleanup)
- Fixed `onExpired` patched callback to not double-fire `handleContestEnd`
- Made handlers `async` with proper `void` annotation at call sites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed onExpired double-fire of handleContestEnd**
- **Found during:** Task 2
- **Issue:** The patched `onExpired` callback called both `origExpired()` (which fires `handleContestEnd`) AND `this.handleFinishContest()` (which also fires `handleContestEnd`) -- double lifecycle execution
- **Fix:** Replaced `this.handleFinishContest()` with inline UI reset (mode switch + re-render) since `origExpired()` already handles the lifecycle
- **Files modified:** src/browse/ProblemBrowserView.ts
- **Commit:** b4184aa

## Verification

- `grep 'SCRATCH_FOLDER' src/contest/ContestScratchManager.ts` shows `.leetcode-contest`
- `grep 'revealLeaf' src/main.ts` confirms tab reuse logic present
- `npx vitest run tests/contest/` -- 144 tests pass (13 files)
- `npm run build` -- succeeds with no type errors

## Known Stubs

None -- all changes are complete implementations.

## Threat Flags

None -- no new network endpoints, auth paths, or trust boundary changes.
