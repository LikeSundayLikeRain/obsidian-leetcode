---
phase: 21-v1-2-migration
plan: 11
status: pending
subsystem: widget/live-preview-banner-statefield
tags:
  - migration
  - banner
  - live-preview
  - statefield
  - cm6
  - gap-closure
  - phase-21
gap_closure: true
requirements: [MIGRATE-BANNER-LP-01]
dependency_graph:
  requires:
    - 21-01-SUMMARY (mountLegacyFenceBanner + AutoMigratingBannerWidget)
    - 21-02-SUMMARY (Live Preview ViewPlugin legacy-kind branch wiring)
  provides:
    - "legacyBannerStateField — StateField-hosted Decoration.replace for line-break-spanning legacy fences (CM6 contract-compliant)"
    - "21-11-INVESTIGATION.md — investigation report on whether LeetCodeFenceWidget at lines 213-232 is also susceptible to the line-break Decoration.replace + ViewPlugin contract violation"
  affects:
    - "Phase 22 (DELETE-*) — the StateField + ViewPlugin combined Extension shape moves with the live-mode plugin"
key_files:
  created:
    - src/widget/liveModeBannerStateField.ts
    - tests/widget/liveModeBannerStateField.test.ts
    - .planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md
  modified:
    - src/widget/liveModeViewPlugin.ts
    - tests/widget/livePreviewUnmount.test.ts
decisions: []
metrics:
  duration_seconds: pending
  completed_date: pending
  tasks_completed: 0
  files_modified: 0
  tests_added: 0
threats_addressed: []
---

# Phase 21 Plan 21-11: Live Preview banner StateField migration (Gap 4) — Summary

**Status:** pending — populated upon execution by `/gsd-execute-phase 21 --gaps-only`.

**One-liner:** _to be populated after execution_

**Gap closed:** 21-HUMAN-UAT.md Test 4b (severity=major) — "Live Preview emits CM6 RangeError 'Decorations that replace line breaks may not be specified via plugins' from the banner mount path during migrate-command execution."

**Scope decision (Task 1 investigation drives this):** _to be populated by execution — either "fix legacy banner only" OR "fix both legacy banner AND v1.3 widget"._
