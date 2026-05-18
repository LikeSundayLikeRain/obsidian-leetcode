---
phase: "09"
plan: "02"
subsystem: settings, section-lock, notes
tags: [ai-review, schema, settings, section-lock]
dependency_graph:
  requires: []
  provides: [AI_REVIEW_HEADING_LINE, autoAIReviewOnAC, ai-review-section-lock]
  affects: [sectionLockExtension, SettingsStore, SettingsTab, NoteTemplate]
tech_stack:
  added: []
  patterns: [shape-guard, heading-only-lock, TDD-RED-GREEN]
key_files:
  created:
    - tests/ai/aiReview.settings.test.ts
  modified:
    - src/notes/NoteTemplate.ts
    - src/main/sectionLockExtension.ts
    - src/settings/SettingsStore.ts
    - src/settings/SettingsTab.ts
    - tests/main/sectionLockExtension.test.ts
    - tests/solve/mocks/fakeSettingsStore.ts
decisions:
  - "AI section heading added before Knowledge Graph in SettingsTab (worktree lacks Phase 07/08 AI section; minimal heading ensures toggle placement matches plan intent)"
metrics:
  duration: "5m 21s"
  completed: "2026-05-18T04:21:13Z"
  tasks: 2
  files_modified: 6
  files_created: 1
  tests_added: 5
  tests_total_passing: 35
---

# Phase 09 Plan 02: AI Review Schema + Section Lock + Settings Toggle Summary

**One-liner:** AI Review heading locked via section lock extension (heading-only, body editable per D-19) + autoAIReviewOnAC opt-in boolean in PluginData with shape-guard defaulting to false.

## Tasks Completed

| # | Name | Commit | Type |
|---|------|--------|------|
| 1 | LOCKED_HEADINGS extension + sectionLock HeadingKind | `00dab20` | feat |
| 2 | PluginData.autoAIReviewOnAC + settings toggle + tests (RED) | `cd6d050` | test |
| 2 | PluginData.autoAIReviewOnAC + settings toggle + tests (GREEN) | `b7ffb2c` | feat |

## Implementation Details

### Task 1: Section Lock Extension

- Added `AI_REVIEW_HEADING_LINE = '## AI Review'` constant to `NoteTemplate.ts`
- Extended `LOCKED_HEADINGS` tuple from 4 to 5 elements
- Added `'ai-review'` to `HeadingKind` union type in `sectionLockExtension.ts`
- Pass 1 now detects `## AI Review` heading lines
- Pass 2 routes `'ai-review'` through the existing `else` branch (heading-only lock, body editable per D-19)
- `buildLockedDecorations` includes the new heading for visual-dim styling
- Updated existing test assertion from `length === 4` to `length === 5`

### Task 2: Settings Toggle (TDD)

- **RED:** Created `tests/ai/aiReview.settings.test.ts` with 5 failing tests covering default, shape-guard, getter, setter
- **GREEN:** Added `autoAIReviewOnAC: boolean` to `PluginData` interface, `DEFAULT_DATA` (false), shape-guard in `load()`, getter/setter methods
- Added AI section heading + toggle in `SettingsTab.ts` before Knowledge Graph section
- Updated `fakeSettingsStore` mock with `getAutoAIReviewOnAC` / `setAutoAIReviewOnAC`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing section lock test**
- **Found during:** Task 1
- **Issue:** `sectionLockExtension.test.ts` asserted `LOCKED_HEADINGS.length === 4`; adding the 5th heading broke it
- **Fix:** Updated assertion to expect 5 elements and added `LOCKED_HEADINGS[4] === '## AI Review'` check
- **Files modified:** `tests/main/sectionLockExtension.test.ts`
- **Commit:** `00dab20`

**2. [Rule 3 - Blocking] Updated fakeSettingsStore mock**
- **Found during:** Task 2
- **Issue:** `SettingsTab.knowledge-graph.test.ts` failed because mock plugin lacked `getAutoAIReviewOnAC` method
- **Fix:** Added `getAutoAIReviewOnAC()` and `setAutoAIReviewOnAC()` to `FakeSettings` interface and implementation
- **Files modified:** `tests/solve/mocks/fakeSettingsStore.ts`
- **Commit:** `b7ffb2c`

**3. [Rule 3 - Blocking] AI section heading created**
- **Found during:** Task 2
- **Issue:** Worktree lacks Phase 07/08 AI section in SettingsTab (based on main branch). Plan assumes AI section exists.
- **Fix:** Created minimal AI section heading before Knowledge Graph section to house the toggle
- **Files modified:** `src/settings/SettingsTab.ts`
- **Commit:** `b7ffb2c`

## TDD Gate Compliance

1. `test(09-02)` commit exists (RED gate): `cd6d050`
2. `feat(09-02)` commit exists after it (GREEN gate): `b7ffb2c`
3. No refactor needed (implementation is minimal)

## Verification Results

- `npx vitest run tests/main/sectionLockExtension.test.ts` — 30 passed
- `npx vitest run tests/ai/aiReview.settings.test.ts` — 5 passed
- `npx vitest run tests/settings/SettingsTab.knowledge-graph.test.ts` — 3 passed
- `npx vitest run tests/settings-store.test.ts` — 27 passed

## Known Stubs

None. All features are fully wired.

## Self-Check: PASSED

All 7 files verified present. All 3 commits verified in git log.
