---
phase: 21-v1-2-migration
plan: 10
status: pending
subsystem: main/reading-mode-banner-postprocessor
tags:
  - migration
  - banner
  - reading-mode
  - post-processor
  - gap-closure
  - phase-21
gap_closure: true
requirements: [MIGRATE-BANNER-RM-01]
dependency_graph:
  requires:
    - 21-01-SUMMARY (mountLegacyFenceBanner + isMigrationCandidate)
    - 21-07-SUMMARY (banner DOM hardening; defensive renderReadOnly chained createEl)
  provides:
    - "registerLegacyBannerPostProcessor — registerMarkdownPostProcessor factory for v1.2 fence DOM replacement"
  affects:
    - "Reading-mode autoMigrateOnOpen=OFF flow: banner UX now appears in place of plain Obsidian langSlug code blocks"
key_files:
  created:
    - src/main/readingModeLegacyBannerPostProcessor.ts
    - tests/main/readingModeLegacyBannerPostProcessor.test.ts
  modified:
    - src/main.ts
decisions: []
metrics:
  duration_seconds: pending
  completed_date: pending
  tasks_completed: 0
  files_modified: 0
  tests_added: 0
threats_addressed: []
---

# Phase 21 Plan 21-10: Reading-mode banner via registerMarkdownPostProcessor (Gap 3) — Summary

**Status:** pending — populated upon execution by `/gsd-execute-phase 21 --gaps-only`.

**One-liner:** _to be populated after execution_

**Gap closed:** 21-HUMAN-UAT.md Test 4a (severity=major) — "Reading-mode shows plain Obsidian langSlug code block; no banner, no [Migrate now] CTA; user has no in-note way to discover migration when autoMigrateOnOpen=OFF."
