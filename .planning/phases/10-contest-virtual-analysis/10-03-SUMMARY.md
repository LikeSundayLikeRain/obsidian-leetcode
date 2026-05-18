---
phase: 10-contest-virtual-analysis
plan: 03
subsystem: contest
tags: [contest, browser-view, mode-toggle, preview-modal, start-flow, css]
dependency_graph:
  requires: [ContestListService, ContestSessionManager, CachedContest, ContestSession]
  provides: [ProblemBrowserView-contests-mode, ContestPreviewModal, startContest-flow, mode-toggle-CSS, contest-row-CSS]
  affects: [src/browse/ProblemBrowserView.ts, src/main.ts, styles.css]
tech_stack:
  added: []
  patterns: [mode-toggle-tablist, scroll-pagination, parallel-fetch, preview-modal]
key_files:
  created:
    - src/contest/ContestPreview.ts
    - tests/contest/contestBrowserMode.test.ts
    - tests/contest/ContestPreview.test.ts
  modified:
    - src/browse/ProblemBrowserView.ts
    - src/main.ts
    - styles.css
decisions:
  - "ContestPreviewModal takes LeetCodeClient directly (not plugin) for testability and decoupling"
  - "ContestSessionManager constructed in main.ts onload Step 5.11 with no-op callbacks — Plan 04 wires real timer UI handlers"
  - "startContest uses Promise.allSettled for parallel problem fetch — any failure (rejected or null result) prevents session creation"
  - "Mode toggle re-renders full view via onOpen() — simpler than partial DOM patching, consistent with existing patterns"
metrics:
  duration: "8m 36s"
  completed: "2026-05-18T16:46:00Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 15
  tests_total_passing: 87
  files_created: 3
  files_modified: 3
---

# Phase 10 Plan 03: Contest Browser Mode + Preview Modal Summary

**One-liner:** Dual-mode toggle (Problems/Contests) in ProblemBrowserView with searchable contest list, scroll pagination, Surprise-me button, ContestPreview modal, and Start Contest flow that fetches 4 problems in parallel and initializes the session.

## What Was Built

### Task 1: ProblemBrowserView contests mode toggle + contest list rendering (caaff4b)

- **src/browse/ProblemBrowserView.ts** — Extended with:
  - `mode: 'problems' | 'contests'` field defaulting to 'problems'
  - `renderModeToggle()` — two buttons with `role="tablist"` container, `role="tab"` + `aria-selected` per button, `is-active` class on active mode
  - `renderContestsMode()` — auth gate, search input (200ms debounce), shuffle button, contest row rendering
  - `renderContestRows()` / `appendContestRows()` — paginated rendering (50 per page) with scroll detection
  - `renderContestRow()` — individual row with title + date/meta, click opens ContestPreview
  - `handleSurpriseMe()` — delegates to ContestListService.surpriseMe(), shows Notice on failure
  - `openContestPreview()` — instantiates ContestPreviewModal with onStart callback
  - `startContest()` — fetches all 4 problem details in parallel via Promise.allSettled, creates ContestSession on success
  - Auto-switch to contests mode on open when active session exists (Pitfall 7)
- **styles.css** — Added `.lc-mode-toggle` (flex, 4px gap, 28px buttons, accent active state) and `.lc-contest-row` (flex, 40px min-height, 8px padding, 8px radius) — all CSS variables, zero hex
- **src/main.ts** — Added `contestSessionManager` field + construction in onload Step 5.11 with no-op callbacks (Plan 04 wires real handlers)

### Task 2: ContestPreview modal with Start Contest flow (f082542)

- **src/contest/ContestPreview.ts** — Modal showing:
  - Contest title (h2) + duration label + problems heading
  - Problems fetched via `client.getContestQuestions()` on open
  - Problem list rendered as ordered list with difficulty pills (`lc-diff--{easy|medium|hard}`)
  - "Start Contest" button (mod-cta) — disables on click, shows "Starting...", calls onStart callback
  - Error handling: re-enables button on failure, shows Notice
- **tests/contest/ContestPreview.test.ts** — 7 tests covering:
  - ContestPreviewModal exports and construction
  - startContest calls getProblemDetail for each slug in parallel
  - ContestSessionManager.start receives correct shape (slug, title, type, duration, problems)
  - All problems initialized with proper fields
  - Fetch failure prevents session creation (graceful degradation)
  - getProblemDetail rejection handled without crash

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npm run build` — tsc + esbuild succeeds
- `npx vitest run tests/contest/ContestPreview.test.ts` — 7 tests pass
- `npx vitest run tests/contest/contestBrowserMode.test.ts` — 8 tests pass
- `grep -n "lc-mode-toggle" styles.css` — 4 rules found
- `grep -n "lc-contest-row" styles.css` — 4 rules found
- `grep -rn "ContestPreviewModal" src/contest/` — class definition found
- `grep -n "mode.*problems.*contests" src/browse/ProblemBrowserView.ts` — mode field found
- `grep -n "startContest" src/browse/ProblemBrowserView.ts` — 3 occurrences found
- No raw hex in new CSS: `grep -nE '#[0-9a-fA-F]{3,8}' styles.css | grep -i "contest\|mode-toggle"` returns empty

## Known Stubs

None. All exported functions and classes are fully implemented with production logic.

## Self-Check: PASSED

- [x] src/contest/ContestPreview.ts exists
- [x] tests/contest/contestBrowserMode.test.ts exists
- [x] tests/contest/ContestPreview.test.ts exists
- [x] Commit caaff4b exists
- [x] Commit f082542 exists
