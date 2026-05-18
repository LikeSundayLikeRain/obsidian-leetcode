---
phase: "09"
plan: "04"
subsystem: main, ai
tags: [ai-review, palette-command, manual-rerun, onStreamComplete]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [rerun-ai-review-command, runAIReview-method, onStreamComplete-callback]
  affects: [AIStreamModal, main.ts]
tech_stack:
  added: []
  patterns: [editorCheckCallback-guard, onStreamComplete-callback-injection, vault-process-idempotent]
key_files:
  created:
    - tests/ai/rerunAIReview.test.ts
  modified:
    - src/main.ts
    - src/ai/AIStreamModal.ts
decisions:
  - "AIStreamModalArgs extended with optional onStreamComplete callback (minimal 1-field extension + invocation after cost ledger)"
  - "runAIReview placed between startAutoReview and aiDebugFromActive in main.ts (locality with other AI methods)"
  - "withReviewBullet imported alongside withDebugBullet from disclosure.ts (single import line)"
metrics:
  duration: "4m 01s"
  completed: "2026-05-18T04:45:12Z"
  tasks: 1
  files_modified: 3
  tests_added: 16
  tests_total_passing: 20
---

# Phase 09 Plan 04: Re-run AI Review Palette Command Summary

**One-liner:** Manual AI review palette command with onStreamComplete callback injection into AIStreamModal for idempotent vault write on stream completion.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 (RED) | Failing tests for rerun-ai-review command | `cb4d2df` | tests/ai/rerunAIReview.test.ts |
| 1 (GREEN) | rerun-ai-review palette command + runAIReview method | `29a2d5e` | src/main.ts, src/ai/AIStreamModal.ts, tests/ai/rerunAIReview.test.ts |

## Implementation Details

### AIStreamModal Extension

- Added `onStreamComplete?: (fullText: string) => Promise<void>` to `AIStreamModalArgs` interface
- Callback invoked after cost ledger call in both stream and buffered completion paths
- Errors in the callback are swallowed to avoid disrupting modal completion UX
- NOT invoked on abort/cancel/error -- callers should not rely on it for cleanup

### rerun-ai-review Command Registration

- `id: 'rerun-ai-review'`, `name: 'Re-run AI review on current note'`
- `editorCheckCallback` guard: returns false for non-LC notes (no file, no frontmatter, invalid lc-slug)
- Dispatches `this.runAIReview(slug, file)` when `checking === false`
- Placed after the `ai-debug` command registration (same section locality)

### runAIReview Method

- Private async method `runAIReview(slug: string, file: TFile): Promise<void>`
- Step 1: Gate on active AI provider (Notice on null)
- Step 2: Resolve active MarkdownView for editor body
- Step 3: Extract first fenced code block (Notice on miss)
- Step 4: Resolve problem HTML (DetailCache hit or LeetCodeClient fetch)
- Step 5: Assemble prompt via `buildReviewPrompt`
- Step 6: Open AIStreamModal with `withReviewBullet(DISCLOSURE_BASE_COPY)` + `onStreamComplete` callback
- onStreamComplete: builds attribution line (D-03 format), calls `vault.process(file, body => mergeAIReviewSection(body, reviewContent))`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `tests/ai/rerunAIReview.test.ts` -- 16 passed
- `tests/ai/lc-isolation.test.ts` -- 4 passed
- TypeScript compilation (`tsc --noEmit`) -- clean, zero errors
- No accidental file deletions
- No untracked files

## Known Stubs

None. All features are fully wired end-to-end.

## Threat Surface Scan

No new threat surfaces beyond those documented in the plan's threat model:
- T-09-11 (vault.process write on manual re-run) -- mitigated by mergeAIReviewSection purity + vault.process atomicity
- T-09-12 (AI response rendering) -- mitigated by AIStreamModal using MarkdownRenderer.render (CSP-safe, no innerHTML)
- T-09-13 (Notes leakage) -- mitigated by buildReviewPrompt never reading ## Notes

## Self-Check: PASSED

All created/modified files verified on disk. Both commit hashes verified in git log.
