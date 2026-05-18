---
phase: 10-contest-virtual-analysis
plan: 04
subsystem: contest
tags: [contest, item-view, code-editor, run-submit, ephemeral]
dependency_graph:
  requires: [ContestSessionManager, ContestSession, ContestProblemState, interpretSolution, pollSubmission, VerdictModal]
  provides: [ContestSolveView, CONTEST_SOLVE_VIEW_TYPE, openContestProblem]
  affects: [src/main.ts, styles.css]
tech_stack:
  added: []
  patterns: [tab-reuse-getLeavesOfType, debounced-persist, epoch-timer-integration]
key_files:
  created:
    - src/contest/ContestSolveView.ts
    - tests/contest/ContestSolveView.test.ts
  modified:
    - src/main.ts
    - styles.css
decisions:
  - "VerdictModal used for both Run and Submit (not RunModal) — RunModal requires interactive tab store that doesn't apply to ephemeral contest context"
  - "Code save debounce at 30s (CODE_SAVE_DEBOUNCE_MS) — flushes immediately on Run/Submit/onClose"
  - "Tab-reuse pattern mirrors previewRouter: getLeavesOfType + setViewState + revealLeaf"
  - "No vault writes in ContestSolveView — code persists only in PluginData via ContestSessionManager (D-09)"
metrics:
  duration: "5m 43s"
  completed: "2026-05-18T16:54:04Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 13
  tests_total_passing: 13
  files_created: 2
  files_modified: 2
---

# Phase 10 Plan 04: ContestSolveView (Editing + Run/Submit) Summary

**One-liner:** Dedicated ItemView for contest problem solving with code textarea, language selector, Run/Submit via existing LC REST infrastructure, and ephemeral code persistence through ContestSessionManager.

## What Was Built

### Task 1: ContestSolveView ItemView with code editing + Run/Submit (bac61d0)

- **src/contest/ContestSolveView.ts** — Full ItemView implementation:
  - `CONTEST_SOLVE_VIEW_TYPE = 'leetcode-contest-solve'` exported constant
  - `ContestSolveView extends ItemView` with constructor, getViewType, getIcon ('trophy'), getDisplayText
  - `setState({ problemIdx })` / `getState()` — Obsidian state persistence round-trip
  - `renderProblem()` — sticky header (title + difficulty pill + "Problem N/4"), problem description via `MarkdownRenderer.render(htmlToMarkdown(...))`, code textarea, language selector, Run/Submit buttons
  - `handleRun()` — interpretSolution + pollSubmission + VerdictModal; records 'attempted' on failure
  - `handleSubmit()` — POST /submit/ + pollSubmission + VerdictModal; records 'accepted' on AC, 'attempted' on failure
  - `flushCodeSave()` — immediate persist to ContestSessionManager.updateCode
  - Code textarea wired with 30s debounced save; flushes on Run/Submit/onClose
- **styles.css** — Appended contest solve view CSS:
  - `.leetcode-contest-solve` (padding: 16px)
  - `.leetcode-contest-solve__header` (sticky, border-bottom, background-primary)
  - `.leetcode-contest-solve__code` (monospace, background-secondary, border-radius, resize-vertical)
  - `.leetcode-contest-solve__actions` (flex row, gap 8px)
  - `.leetcode-contest-solve__submit-btn.mod-cta` (accent color via interactive-accent)
  - All CSS uses only `var(--*)` tokens, zero raw hex
- **tests/contest/ContestSolveView.test.ts** — 13 unit tests covering:
  - Exports (CONTEST_SOLVE_VIEW_TYPE constant, class presence)
  - getViewType/getIcon correctness
  - setState/getState round-trip (valid + invalid input)
  - getDisplayText with/without problem set
  - handleRun/handleSubmit prototype existence
  - flushCodeSave calls updateCode with correct args
  - recordVerdict called with 'accepted' on AC, 'attempted' on WA

### Task 2: Register ContestSolveView in main.ts (95a74f8)

- **src/main.ts** — Added:
  - Import: `ContestSolveView`, `CONTEST_SOLVE_VIEW_TYPE` from `./contest/ContestSolveView`
  - `this.registerView(CONTEST_SOLVE_VIEW_TYPE, ...)` alongside existing preview view registration
  - `async openContestProblem(problemIdx: number): Promise<void>` — tab-reuse helper:
    - Checks `workspace.getLeavesOfType(CONTEST_SOLVE_VIEW_TYPE)` for existing leaf
    - If found: `setViewState` with new problemIdx + `revealLeaf`
    - If not: `workspace.getLeaf('tab')` + `setViewState` + `revealLeaf`
    - Same pattern as `openOrReusePreview` from previewRouter.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RunModal requires interactive tab store**
- **Found during:** Task 1 implementation
- **Issue:** Plan prescribed using RunModal for the Run button, but RunModal requires `slug`, `exampleTestcases`, `store: EphemeralTabStore`, and `onRun` callback — the tab-store infrastructure doesn't exist for ephemeral contest problems (no vault file = no EphemeralTabStore entry)
- **Fix:** Used VerdictModal for both Run and Submit, matching the `runInterpretedInput` pattern in main.ts. VerdictModal only requires `problemTitle` and `onCancel`, which fits the contest context perfectly.
- **Files modified:** `src/contest/ContestSolveView.ts`
- **Commit:** bac61d0

## Verification Results

- `npm run build` — tsc + esbuild succeeds
- `npx vitest run tests/contest/ContestSolveView.test.ts` — 13 tests pass
- `grep -n "registerView.*CONTEST_SOLVE" src/main.ts` — match at line 365
- `grep -n "CONTEST_SOLVE_VIEW_TYPE" src/contest/ContestSolveView.ts` — 2 matches (export + usage)
- `grep -n "openContestProblem" src/main.ts` — method definition at line 802
- `grep -c "handleRun\|handleSubmit" src/contest/ContestSolveView.ts` — returns 4 (2 defs + 2 usages)
- `grep -rn "vault.modify\|vault.create" src/contest/ContestSolveView.ts` — zero matches (no vault writes during contest)

## Known Stubs

None. All exported functions and classes are fully implemented with production logic.

## Threat Flags

None — no new network endpoints introduced beyond existing LC REST infrastructure (interpretSolution, submit, pollSubmission). All HTTP calls go through existing throttledRequestUrl + authHeaders pipeline.

## Self-Check: PASSED

- [x] src/contest/ContestSolveView.ts exists
- [x] tests/contest/ContestSolveView.test.ts exists
- [x] Commit bac61d0 exists
- [x] Commit 95a74f8 exists
