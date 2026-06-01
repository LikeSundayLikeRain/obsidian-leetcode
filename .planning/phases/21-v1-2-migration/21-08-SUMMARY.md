---
phase: 21-v1-2-migration
plan: 08
status: pending
subsystem: main/reading-mode-rerender
tags:
  - migration
  - reading-mode
  - rerender
  - gap-closure
  - phase-21
gap_closure: true
requirements: [MIGRATE-CR-01]
dependency_graph:
  requires:
    - 21-05-SUMMARY (makeReadingModeMigrationHandler factory + ReadingModeMigrationHookDeps)
    - 21-01-SUMMARY (migrateLegacyFenceIfNeeded resolves boolean migrated flag)
  provides:
    - "rerenderReadingModePanes — exported helper that walks workspace markdown leaves and forces previewMode.rerender(true) on file.path-matching preview leaves"
    - "rerenderPreviewLeaves DI field on ReadingModeMigrationHookDeps wiring"
  affects:
    - "Plan 21-09 (frontmatter repair) consumes the same rerenderPreviewLeaves DI optionally for post-repair rerender"
key_files:
  created: []
  modified:
    - src/main/readingModeMigrationHook.ts
    - src/main.ts
    - tests/main/readingModeMigrationTrigger.test.ts
decisions: []
metrics:
  duration_seconds: pending
  completed_date: pending
  tasks_completed: 0
  files_modified: 0
  tests_added: 0
threats_addressed: []
---

# Phase 21 Plan 21-08: Reading-mode rerender after auto-migration (Gap 1) — Summary

**Status:** pending — populated upon execution by `/gsd-execute-phase 21 --gaps-only`.

**One-liner:** _to be populated after execution_

**Gap closed:** 21-HUMAN-UAT.md Test 1 (severity=minor) — "After auto-migration in Reading mode, the v1.3 widget does not mount on first open; close+reopen required."
