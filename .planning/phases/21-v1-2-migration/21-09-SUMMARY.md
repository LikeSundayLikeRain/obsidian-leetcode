---
phase: 21-v1-2-migration
plan: 09
status: pending
subsystem: widget/migration + main/reading-mode-hook
tags:
  - migration
  - frontmatter-repair
  - scope-gap
  - gap-closure
  - phase-21
gap_closure: true
requirements: [MIGRATE-FM-REPAIR-01]
dependency_graph:
  requires:
    - 21-01-SUMMARY (fenceMigrator orchestrator + isMigrationCandidate)
    - 21-05-SUMMARY (Reading-mode file-open hook factory + DI shape)
    - 21-07-SUMMARY (countLeetCodeSolveFenceOpenersInCodeSection + findFirstLeetCodeSolveFenceIndexInCodeSection helpers)
  provides:
    - "isFrontmatterRepairCandidate — pure predicate for the asymmetric v1.3-body + missing-lc-language shape"
    - "repairFrontmatterIfNeeded — orchestrator that injects lc-language via processFrontMatter (no body rewrite, no backup)"
    - "Reading-mode + Live Preview + post-processor wiring of the repair path alongside migrate"
  affects:
    - "Phase 22 (DELETE-*) — repair path moves alongside the migrator if relocated"
    - "WidgetController.resolveLanguageSlug — the Notice + Python fallback now fires only for genuinely orphaned notes (no lc-slug or no ## Code), not for the v1.3-body-missing-lc-language case"
key_files:
  created: []
  modified:
    - src/widget/fenceMigrator.ts
    - src/main/readingModeMigrationHook.ts
    - src/widget/codeBlockProcessor.ts
    - src/widget/liveModeViewPlugin.ts
    - src/main.ts
    - tests/widget/fenceMigrator.test.ts
    - tests/main/readingModeMigrationTrigger.test.ts
    - tests/widget/codeBlockProcessor.phase21.test.ts
decisions: []
metrics:
  duration_seconds: pending
  completed_date: pending
  tasks_completed: 0
  files_modified: 0
  tests_added: 0
threats_addressed: []
---

# Phase 21 Plan 21-09: Frontmatter repair predicate + path (Gap 2) — Summary

**Status:** pending — populated upon execution by `/gsd-execute-phase 21 --gaps-only`.

**One-liner:** _to be populated after execution_

**Gap closed:** 21-HUMAN-UAT.md Test 2 (severity=major) — "lc-language is not auto-injected on a v1.3-body-shaped note when frontmatter is missing; user's defaultLanguage=Java is ignored; chevron updates locally but frontmatter on disk is unchanged."
