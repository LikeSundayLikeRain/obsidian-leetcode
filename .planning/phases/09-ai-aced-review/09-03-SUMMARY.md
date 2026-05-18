---
phase: "09"
plan: "03"
subsystem: solve, main, ai
tags: [ai-review, streaming, verdict-modal, auto-review, vault-write]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [auto-review-on-ac, verdict-modal-review-stream, startAutoReview]
  affects: [VerdictModal, main.ts]
tech_stack:
  added: []
  patterns: [callback-injection, debounced-markdown-render, abort-controller-lifecycle]
key_files:
  created: []
  modified:
    - src/solve/VerdictModal.ts
    - src/main.ts
decisions:
  - "VerdictModal extended directly (no helper class) — streaming logic lives in main.ts host callback, modal only manages DOM + lifecycle"
  - "Review stream callback uses callback injection pattern (onStartReviewStream) to keep VerdictModal decoupled from AI modules"
  - "startAutoReview is a private method on LeetCodePlugin — mirrors openAIDebug locality"
metrics:
  duration: "5m 50s"
  completed: "2026-05-18T04:37:47Z"
  tasks: 2
  files_modified: 2
  tests_added: 0
  tests_total_passing: 1227
---

# Phase 09 Plan 03: Auto-Review Stream Wiring Summary

**One-liner:** VerdictModal extended with review streaming callback + main.ts AC hook wires prompt assembly, AIClient.invokeStream, debounced render, and vault.process write end-to-end.

## Tasks Completed

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | VerdictModal review streaming extension | `341c7a9` | src/solve/VerdictModal.ts |
| 2 | main.ts AC hook wiring -- auto-review stream host | `2259ae7` | src/main.ts |

## Implementation Details

### Task 1: VerdictModal review streaming extension

- Extended `VerdictModalArgs` with optional `onStartReviewStream` callback field accepting `(reviewAreaEl: HTMLElement, component: Component) => { abort: () => void; promise: Promise<void> }`
- On AC verdict when callback is provided: creates `div.leetcode-ai-review-stream`, instantiates `Component` (load/unload lifecycle), invokes host callback
- `onClose()` aborts in-flight review stream via stored abort handle (anti-zombie per Pitfall 2)
- Component unloaded on close to prevent MarkdownRenderer child component leaks
- VerdictModal stays fully decoupled -- zero AI module imports
- Added private `isAccepted(res)` helper checking `status_code === 10`

### Task 2: main.ts AC hook wiring

- Added `startAutoReview` private method to LeetCodePlugin implementing the full streaming host:
  1. Resolves problem HTML (DetailCache hit or LeetCodeClient fetch)
  2. Extracts code from note body via `extractFirstFencedBlock`
  3. Assembles prompt via `buildReviewPrompt`
  4. Calls `this.aiClient.invokeStream({ prompt, stream: true, signal })`
  5. Consumes stream with 100ms debounced `MarkdownRenderer.render` into reviewAreaEl
  6. On natural completion: builds attribution line (D-03 format with local date), calls `vault.process` with `mergeAIReviewSection`
  7. Cost ledger: `estimateCostUsd` on stream path, `addCost(0)` on buffered/error/abort
- VerdictModal construction in `submitFromActive` gains `onStartReviewStream` gated on `autoAIReviewOnAC && activeAIProvider`
- Sequential ordering preserved: `knowledgeGraph.onAccepted` awaited first (fast local writes), then VerdictModal triggers review callback (downstream, after renderVerdict paints AC)
- On abort (modal close): `addCost(0)`, no vault write (D-11 posture)
- On error: subtle Notice `'AI review skipped -- {reason}'`, no vault write, `addCost(0)`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `tests/solve/verdictModalRenderer.test.ts` -- 27 passed
- `tests/solve/VerdictModal.aiDebugButton.test.ts` -- 21 passed
- `tests/ai/lc-isolation.test.ts` -- 4 passed
- `tests/main/aiDebugCommand.test.ts` -- 22 passed
- `tests/ai/buildReviewPrompt.test.ts` -- 7 passed
- `tests/ai/mergeAIReviewSection.test.ts` -- 8 passed
- Full suite: 1227 passed, 1 pre-existing failure (unrelated `sectionLockIntegration.test.ts` env bug)

## Known Stubs

None. All features are fully wired end-to-end.

## Threat Surface Scan

No new threat surfaces beyond those documented in the plan's threat model:
- T-09-06 (vault.process write) -- mitigated by mergeAIReviewSection purity + vault.process atomicity
- T-09-07 (AI response rendering) -- mitigated by MarkdownRenderer.render (CSP-safe, no innerHTML)
- T-09-10 (KG write vs review write race) -- mitigated by sequential ordering (KG awaited first)

## Self-Check: PASSED

All 2 modified files exist on disk. Both commit hashes verified in git log.
