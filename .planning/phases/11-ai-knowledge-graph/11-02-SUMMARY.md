---
phase: 11-ai-knowledge-graph
plan: 02
subsystem: graph/ai
tags: [ai-knowledge-graph, pattern-classification, hub-notes, orchestration, tdd]
dependency_graph:
  requires: [patternTaxonomy, buildKgPrompt, parseKgResponse, mergeRelatedVariantsSection, withKgBullet]
  provides: [ClusterHubWriter, PatternClusterEngine, OtherPatternModal, mergeTechniquesSectionAI, ClassifyResult, HubEntry]
  affects: [mergeTechniquesSection.ts, KnowledgeGraphWriter-pipeline]
tech_stack:
  added: []
  patterns: [DI-constructor, never-throw-posture, vault-process-writes, modal-promise-pattern, tdd]
key_files:
  created:
    - src/graph/ClusterHubWriter.ts
    - src/graph/PatternClusterEngine.ts
    - src/graph/OtherPatternModal.ts
    - tests/graph/clusterHubWriter.test.ts
    - tests/graph/patternClusterEngine.test.ts
  modified:
    - src/graph/mergeTechniquesSection.ts
decisions:
  - "mergeTechniquesSectionAI discards ALL link items and inserts single AI cluster wikilink (D-09 clean break)"
  - "OtherPatternModal uses Promise-based waitForResult pattern for testability"
  - "PatternClusterEngine accepts showOtherModal factory via DI for testability"
  - "OTHER pattern detection uses case-insensitive comparison (parseKgResponse normalizes to 'Other')"
  - "Hub note body uses ### Easy / ### Medium / ### Hard with markdown tables"
  - "Cost accounting uses rough token-based estimate ($0.01/1K tokens)"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-18T22:51:43Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 26
  files_created: 5
  files_modified: 1
---

# Phase 11 Plan 02: Service Layer (ClusterHubWriter + PatternClusterEngine) Summary

**One-liner:** Hub note CRUD with difficulty-grouped tables, AI classification orchestration with OTHER-pattern user prompt, variant validation, and full vault-write pipeline.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | ClusterHubWriter — hub note CRUD + reconcile + mergeTechniquesSectionAI | 6d3b0dc | src/graph/ClusterHubWriter.ts, src/graph/mergeTechniquesSection.ts |
| 2 | PatternClusterEngine — AI classification orchestration + OTHER prompt + validation | 979d39a | src/graph/PatternClusterEngine.ts, src/graph/OtherPatternModal.ts |

## What Was Built

### Task 1: ClusterHubWriter + mergeTechniquesSectionAI
- **ClusterHubWriter.ts**: Service class with DI constructor (`{ app, problemsFolder }`). Methods:
  - `ensureHub(patternName, firstEntry)`: Creates hub note at `{problemsFolder}/Patterns/{pattern}.md` with difficulty-grouped tables. Race-safe folder/file creation.
  - `appendEntry(patternName, entry)`: Adds table row to correct difficulty section via `vault.process`. Idempotent (skips if wikilink already present).
  - `reconcile()`: Scans all vault markdown files for `lc-pattern` frontmatter via metadataCache, groups by pattern, rebuilds each hub from scratch.
- **mergeTechniquesSectionAI**: New export in `mergeTechniquesSection.ts`. Removes ALL existing link items (v1.0 lc-tag wikilinks), inserts single `- [[patternName]]` for the AI cluster, preserves all free items (user-added content). Clean break per D-09.

### Task 2: PatternClusterEngine + OtherPatternModal
- **PatternClusterEngine.ts**: Orchestration engine with DI constructor (`{ app, aiClient, settings, hubWriter, showOtherModal? }`). Pipeline:
  1. Gates on `autoAIKnowledgeGraph` + `activeAIProvider`
  2. Persistence check: skips classification when `lc-pattern` frontmatter already set
  3. Converts problem HTML to markdown (turndown)
  4. Assembles prompt via `buildKgPrompt`
  5. Invokes `AIClient.invoke` (non-streaming, maxTokens: 500)
  6. Parses response via `parseKgResponse`
  7. OTHER handling: shows `OtherPatternModal` once per problem (AIKG-01)
  8. Writes `lc-pattern` frontmatter via `processFrontMatter`
  9. Rewrites `## Techniques` via `mergeTechniquesSectionAI` + `vault.process`
  10. Validates variants (known slugs only, D-12) + lookAhead (feature-flag gated, D-16)
  11. Writes `## Related Variants` via `mergeRelatedVariantsSection` (cross-cluster only)
  12. Updates hub note via `hubWriter.ensureHub` + `appendEntry`
  13. Tracks cost via `addCostLedger`
- **OtherPatternModal.ts**: `Modal` subclass for naming an OTHER pattern. Promise-based `waitForResult()` for async consumption. Uses `createEl`/`createDiv` (no innerHTML). Resolves with normalized pattern name or 'OTHER' on dismiss.

## Test Coverage

- **tests/graph/clusterHubWriter.test.ts**: 12 tests (ensureHub create, no-op, folder creation, appendEntry, idempotent, reconcile, body structure, mergeTechniquesSectionAI 5 tests)
- **tests/graph/patternClusterEngine.test.ts**: 14 tests (autoAIKG gate, provider gate, persistence skip, invoke args, frontmatter write, techniques rewrite, variants with validation, unknown slug drop, lookAhead gate off/on, cost ledger, never-throw, OTHER modal, hub update)
- **Total: 26 new tests, all passing**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LC-isolation test violation from comment**
- **Found during:** Task 2 verification
- **Issue:** A comment in `PatternClusterEngine.ts` contained the string `obsidianFetch` which triggered the LC-isolation grep test
- **Fix:** Rewrote comment to avoid the forbidden substring
- **Files modified:** src/graph/PatternClusterEngine.ts
- **Commit:** 979d39a

**2. [Rule 1 - Bug] OTHER pattern detection case mismatch**
- **Found during:** Task 2 GREEN phase
- **Issue:** `parseKgResponse` normalizes 'OTHER' to 'Other' via `normalizePatternName`, but the engine compared against `'OTHER'` (exact)
- **Fix:** Changed comparison to case-insensitive (`patternName.toUpperCase() === 'OTHER'`)
- **Files modified:** src/graph/PatternClusterEngine.ts
- **Commit:** 979d39a

## Pre-existing Test Failures (Out of Scope)

- `tests/contest/ContestPreview.test.ts` (3 tests) — `settings.setProblemDetail is not a function` in mock. Phase 10 issue.
- `tests/integration/sectionLockIntegration.test.ts` (1 test) — `util.isString is not a function` from path module. Phase 5.5 issue.

These 4 failures are unrelated to Phase 11 changes and were present before this plan executed.

## Known Stubs

None. All implementations are complete and functional.

## Threat Flags

None. All files created/modified are within the planned threat model scope (T-11-04 through T-11-SC). The `normalizePatternName` sanitization (T-11-04, T-11-08) is applied at all entry points where AI output or user input becomes a file path.

## Self-Check: PASSED
