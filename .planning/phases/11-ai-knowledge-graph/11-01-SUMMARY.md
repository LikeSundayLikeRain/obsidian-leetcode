---
phase: 11-ai-knowledge-graph
plan: 01
subsystem: graph/ai
tags: [ai-knowledge-graph, pattern-classification, pure-transforms, tdd]
dependency_graph:
  requires: []
  provides: [patternTaxonomy, buildKgPrompt, parseKgResponse, mergeRelatedVariantsSection, withKgBullet, RELATED_VARIANTS_HEADING_LINE, featureFlags.lookAheadEdges, autoAIKnowledgeGraph]
  affects: [NoteTemplate.LOCKED_HEADINGS, SettingsStore.PluginData, disclosure.ts]
tech_stack:
  added: []
  patterns: [pure-transform, defensive-parsing, composition-factory, shape-guard-extension]
key_files:
  created:
    - src/graph/patternTaxonomy.ts
    - src/graph/buildKgPrompt.ts
    - src/graph/parseKgResponse.ts
    - src/graph/mergeRelatedVariantsSection.ts
    - tests/graph/buildKgPrompt.test.ts
    - tests/graph/parseKgResponse.test.ts
    - tests/graph/mergeRelatedVariantsSection.test.ts
    - tests/ai/disclosure.withKgBullet.test.ts
  modified:
    - src/ai/disclosure.ts
    - src/notes/NoteTemplate.ts
    - src/settings/SettingsStore.ts
    - tests/main/sectionLockExtension.test.ts
decisions:
  - "SEED_PATTERNS frozen at 22 entries; AI free to create new names beyond the seed"
  - "parseKgResponse uses 4-strategy cascade (direct JSON, strip fences, regex extract, fallback)"
  - "RELATED_VARIANTS_HEADING_LINE added to LOCKED_HEADINGS at position 4 (before AI Review)"
  - "autoAIKnowledgeGraph defaults to true (core feature, ON when AI configured)"
  - "featureFlags.lookAheadEdges defaults to false (experimental, gated)"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-18T22:40:27Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 28
  files_created: 8
  files_modified: 4
---

# Phase 11 Plan 01: Foundation Layer (Pure Helpers + Schema) Summary

**One-liner:** 22-seed pattern taxonomy, deterministic prompt builder, 4-strategy defensive response parser, idempotent Related Variants section merge, and schema extensions for KG feature flag + toggle.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Pattern taxonomy + prompt builder + response parser (with tests) | 48445b8 | src/graph/patternTaxonomy.ts, src/graph/buildKgPrompt.ts, src/graph/parseKgResponse.ts |
| 2 | Related Variants section merge + disclosure bullet + schema extensions (with tests) | ecd54c6 | src/graph/mergeRelatedVariantsSection.ts, src/ai/disclosure.ts, src/notes/NoteTemplate.ts, src/settings/SettingsStore.ts |

## What Was Built

### Task 1: Pattern Taxonomy + Prompt Builder + Response Parser
- **patternTaxonomy.ts**: `SEED_PATTERNS` (22-entry readonly constant) + `normalizePatternName` (trim, collapse whitespace, title-case)
- **buildKgPrompt.ts**: Pure prompt assembler following the join-array pattern from `buildReviewPrompt.ts`. Embeds all 22 seed patterns, problem markdown, fenced code block, and JSON schema instructions. Zero deps beyond taxonomy import.
- **parseKgResponse.ts**: Defensive 4-strategy parser (direct JSON.parse, strip markdown fences, regex extract first `{...}`, fallback to `{ pattern: 'OTHER', variants: [], lookAhead: [] }`). Validates entries, caps arrays at 2, normalizes pattern name. Addresses T-11-01 and T-11-03 threat mitigations.

### Task 2: Related Variants Section Merge + Disclosure + Schema
- **mergeRelatedVariantsSection.ts**: Idempotent pure transform that inserts/replaces `## Related Variants` section. Anchor priority: after `## Techniques` > before `## AI Review` > EOF. Renders variants as `- [[slug]] — reason` format.
- **disclosure.ts**: Added `withKgBullet` composition factory (mirrors `withReviewBullet`/`withDebugBullet` pattern). Bullet: "AI Knowledge Graph sends the problem statement and your accepted code for pattern classification".
- **NoteTemplate.ts**: Added `RELATED_VARIANTS_HEADING_LINE = '## Related Variants'` constant. Extended `LOCKED_HEADINGS` tuple from 5 to 6 entries.
- **SettingsStore.ts**: Extended `PluginData` with `autoAIKnowledgeGraph: boolean` (default true) and `featureFlags: { lookAheadEdges: boolean }` (default false). Added shape-guards in load path + getter/setter methods.

## Test Coverage

- **tests/graph/buildKgPrompt.test.ts**: 7 tests (seed pattern embedding, trimming, fenced code, JSON schema, determinism, empty input, no Notes)
- **tests/graph/parseKgResponse.test.ts**: 9 tests (direct JSON, fenced JSON, regex extract, fallback, cap variants, cap lookAhead, normalization, missing fields, invalid entries)
- **tests/graph/mergeRelatedVariantsSection.test.ts**: 7 tests (insert after Techniques, replace existing, render format, missing Techniques, missing both anchors, idempotent, empty variants)
- **tests/ai/disclosure.withKgBullet.test.ts**: 5 tests (fresh object, length +1, verbatim bullet, reference equality, independence)
- **Total: 28 tests, all passing**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed sectionLockExtension.test.ts assertion**
- **Found during:** Task 2 verification
- **Issue:** Test asserted `LOCKED_HEADINGS.length === 5` which broke after adding `RELATED_VARIANTS_HEADING_LINE`
- **Fix:** Updated assertion to `length === 6` with element-wise checks including the new entry at position 4
- **Files modified:** tests/main/sectionLockExtension.test.ts
- **Commit:** ecd54c6

## Pre-existing Test Failures (Out of Scope)

- `tests/contest/ContestPreview.test.ts` (3 tests) — `settings.setProblemDetail is not a function` in mock. Phase 10 issue.
- `tests/integration/sectionLockIntegration.test.ts` (1 test) — `util.isString is not a function` from path module. Phase 5.5 issue.

These 4 failures are unrelated to Phase 11 changes and were present before this plan executed.

## Known Stubs

None. All implementations are complete and functional.

## Threat Flags

None. All files created/modified are within the planned threat model scope (T-11-01 through T-11-SC).

## Self-Check: PASSED
