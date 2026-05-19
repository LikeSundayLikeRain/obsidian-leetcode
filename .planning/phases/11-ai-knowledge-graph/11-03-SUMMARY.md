---
phase: 11-ai-knowledge-graph
plan: 03
subsystem: graph
tags: [ai-knowledge-graph, wiring, settings, integration]
dependency_graph:
  requires: [11-01, 11-02]
  provides: [ai-classification-pipeline, hub-reconcile-mechanisms, kg-settings-ui]
  affects: [src/graph/KnowledgeGraphWriter.ts, src/main.ts, src/settings/SettingsTab.ts]
tech_stack:
  added: []
  patterns: [late-bind-DI, fire-and-forget-reconcile, registerInterval-auto-cleanup]
key_files:
  created:
    - tests/graph/onAccepted.aiClassification.test.ts
  modified:
    - src/graph/KnowledgeGraphWriter.ts
    - src/main.ts
    - src/settings/SettingsTab.ts
    - tests/helpers/mock-vault.ts
    - tests/ai/settingsTab.test.ts
    - tests/settings/SettingsTab.knowledge-graph.test.ts
decisions:
  - "Late-bind pattern for PatternClusterEngine + ClusterHubWriter into KnowledgeGraphWriter via setters (construction order: KG writer before AIClient)"
  - "ClusterHubWriter.reconcile() takes no args (app stored from construction) — plan interface was outdated"
  - "Code extraction for AI prompt uses vault.cachedRead + extractFirstFencedBlock (existing codeExtractor.ts)"
  - "withKgBullet disclosure not wired to streaming modal — PatternClusterEngine uses non-streaming invoke() which gates through AIClient's own requireAIDisclosure"
metrics:
  duration_seconds: 764
  completed: "2026-05-19T00:47:14Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 7
---

# Phase 11 Plan 03: AI Knowledge Graph Wiring Summary

Extended KnowledgeGraphWriter with inline AI classification (Step 2.5), fire-and-forget background reconcile (Step 2.6), palette command, 1-hour timer, and settings UI toggles for the full D-07 four-mechanism reconcile strategy.

## One-liner

AI classification pipeline wired into on-AC flow with all four D-07 reconcile mechanisms operational and settings UI toggles exposed.

## Completed Tasks

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Extend KnowledgeGraphWriter pipeline + main.ts wiring | c14eb16 | Added Steps 2.5/2.6 to pipeline; constructed engine+hubWriter in main.ts; palette command + interval |
| 2 | Settings UI toggles + integration test | b64c388 | Two new toggles in AI section; 8-case integration test; mock updates |

## Implementation Details

### KnowledgeGraphWriter Pipeline Extension

- **Step 2.5 (inline blocking):** After Step 2 (Techniques body write), calls `patternClusterEngine.onAccepted(file, slug, problemHtml, code, language)` in a try/catch. Code extracted via `vault.cachedRead` + `extractFirstFencedBlock`. On success, sets `classificationRan = true`.
- **Step 2.6 (D-07 mechanism 2):** Fire-and-forget `void this.hubWriter.reconcile()` after Step 2.5 regardless of classification outcome. Catches drift from incremental appends.
- **Step 3 conditional:** When `classificationRan` is true, stubs are skipped (hub notes replace them). Legacy path (no engine) still fires stubs.
- **DI pattern:** `patternClusterEngine` and `hubWriter` are optional in `KnowledgeGraphWriterDeps`. Late-bound via `setPatternClusterEngine()` / `setHubWriter()` setters since KnowledgeGraphWriter is constructed before AIClient in the onload sequence.

### main.ts Wiring

- Constructs `ClusterHubWriter` and `PatternClusterEngine` after AIClient (Step 5.9b)
- Late-binds both into the existing `knowledgeGraph` instance
- Registers `reconcile-pattern-hubs` palette command (D-07 mechanism 4) with success Notice
- Registers 1-hour `registerInterval` for background reconcile (D-07 mechanism 3)

### D-07 Four-Mechanism Reconcile Coverage

| Mechanism | Implementation | Location |
|-----------|---------------|----------|
| 1. Incremental append on AC | `hubWriter.appendEntry` inside `PatternClusterEngine.onAccepted` | Plan 02 |
| 2. Background full reconcile after AC | `void hubWriter.reconcile()` in Step 2.6 | KnowledgeGraphWriter.ts |
| 3. 1-hour interval timer | `registerInterval(setInterval(..., 3600000))` | main.ts |
| 4. Palette command | `reconcile-pattern-hubs` addCommand | main.ts |

### Settings UI

- **AI pattern classification on Accept** — binds to `getAutoAIKnowledgeGraph()` / `setAutoAIKnowledgeGraph()`
- **Look-ahead edges (experimental)** — binds to `getFeatureFlags().lookAheadEdges` / `setFeatureFlag('lookAheadEdges', v)`
- Position: after autoAIReviewOnAC toggle, before Contest section

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ClusterHubWriter.reconcile() signature mismatch**
- **Found during:** Task 1
- **Issue:** Plan interface specified `reconcile(app: App)` but actual implementation takes no args (app stored from construction)
- **Fix:** Called `reconcile()` without args, matching the real implementation
- **Files modified:** src/graph/KnowledgeGraphWriter.ts, src/main.ts

**2. [Rule 3 - Blocking] Construction order requires late-bind pattern**
- **Found during:** Task 1
- **Issue:** KnowledgeGraphWriter is constructed at line 306 (before AIClient at line 343). PatternClusterEngine needs AIClient.
- **Fix:** Added `setPatternClusterEngine()` / `setHubWriter()` setters; construct engine after AIClient and late-bind
- **Files modified:** src/graph/KnowledgeGraphWriter.ts, src/main.ts

**3. [Rule 3 - Blocking] Settings mocks missing new methods in existing tests**
- **Found during:** Task 2
- **Issue:** settingsTab.test.ts and SettingsTab.knowledge-graph.test.ts mocks did not have `getAutoAIKnowledgeGraph`, `setAutoAIKnowledgeGraph`, `getFeatureFlags`, `setFeatureFlag`
- **Fix:** Added missing methods to both test mock factories
- **Files modified:** tests/ai/settingsTab.test.ts, tests/settings/SettingsTab.knowledge-graph.test.ts

**4. [Rule 3 - Blocking] mock-vault missing cachedRead**
- **Found during:** Task 2
- **Issue:** KnowledgeGraphWriter now calls `vault.cachedRead(file)` but mock-vault didn't have it
- **Fix:** Added `cachedRead` spy mirroring existing `read` behavior
- **Files modified:** tests/helpers/mock-vault.ts

## Verification Results

- `tests/graph/onAccepted.aiClassification.test.ts`: 8/8 pass
- `tests/graph/onAccepted.gate.test.ts`: 2/2 pass
- `tests/graph/onAccepted.tags.test.ts`: 4/4 pass
- `tests/ai/lc-isolation.test.ts`: 4/4 pass
- `tests/ai/settingsTab.test.ts`: 6/6 pass (after mock fix)
- `tests/settings/SettingsTab.knowledge-graph.test.ts`: 4/4 pass (after mock fix)
- Full suite: 1446 pass, 4 fail (pre-existing: 3 ContestPreview + 1 sectionLockIntegration)
- esbuild bundle: compiles cleanly (1.2 MB)
- eslint on modified src/: 0 new errors (2 pre-existing on Phase 09's toggle)

## Known Stubs

None. All wiring is functional — classification fires through to hub writes when toggle is ON and provider is configured.

## Self-Check: PASSED
