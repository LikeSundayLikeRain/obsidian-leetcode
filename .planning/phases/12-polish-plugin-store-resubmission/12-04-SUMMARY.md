---
phase: 12-polish-plugin-store-resubmission
plan: 04
subsystem: main-plugin-lifecycle
tags: [wikilink, preview, cold-start, performance, ai-client]
dependency_graph:
  requires: [12-01, 12-02]
  provides: [wikilink-to-preview-interception, lazy-ai-client]
  affects: [src/main.ts, src/graph/PatternClusterEngine.ts]
tech_stack:
  added: []
  patterns: [lazy-getter, getter-function-DI]
key_files:
  created: []
  modified:
    - src/main.ts
    - src/graph/PatternClusterEngine.ts
decisions:
  - "Wikilink interception uses file.stat.size === 0 gate (not vault.read) for zero-cost empty detection"
  - "Triple gate (problems folder + empty + slug in index) prevents accidental deletion of user content (T-12-06)"
  - "PatternClusterEngine accepts `() => AIClient` getter to truly defer construction past onload"
  - "Lazy getter normalizes direct AIClient instances in tests via thunk wrapper for backward compat"
metrics:
  duration: "4m 40s"
  completed: "2026-05-19"
  tasks: 2
  files: 2
---

# Phase 12 Plan 04: Wikilink-to-Preview + Deferred AI Client Summary

Wikilink-to-preview interception with triple-gate safety and lazy AIClient getter for cold-start improvement.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wikilink-to-preview interception | 706dcc5 | src/main.ts |
| 2 | Deferred AIClient construction | 573d111 | src/main.ts, src/graph/PatternClusterEngine.ts |

## Implementation Details

### Task 1: Wikilink-to-Preview Interception (D-12)

Registered a `file-open` event handler (Step 6g-pre) that runs BEFORE the existing starter-code handler. When Obsidian creates a blank file from clicking a `[[slug]]` wikilink, the handler:

1. **Gate (a):** Checks file path starts with the configured problems folder
2. **Gate (b):** Checks `file.stat.size === 0` (empty, just-created)
3. **Gate (c):** Parses `{id}-{slug}` from basename and verifies slug exists in the problem index or detail cache

If all three gates pass, the blank file is deleted and `openOrReusePreview` opens the preview tab. This ensures hub notes and Related Variants wikilinks are instantly navigable without creating stub notes.

### Task 2: Deferred AIClient Construction (D-10)

Replaced eager `new AIClient(...)` at Step 5.9 with a lazy getter property:

- Backing field `_aiClient` is null during plugin load
- `get aiClient()` constructs on first access and caches the instance
- PatternClusterEngine accepts `aiClient: AIClient | (() => AIClient)` — production passes a getter, tests pass a direct instance
- All AI consumers (probe, invokeStream, addCost, testActiveAIConnection) trigger via the getter on first user-initiated action

Cold-start no longer pays the AIClient constructor cost (SettingsStore reads + adapter resolution). Module evaluation cost of the AI SDK import is unavoidable with esbuild CJS (documented in STATE.md decisions), but constructor deferral saves the synchronous work during plugin activation.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run build` passes (no type errors)
- `npx vitest run` passes (1450 tests, 0 failures)
- `grep -q "openOrReusePreview" src/main.ts` confirms wikilink handler
- `grep -q "vault.delete" src/main.ts` confirms blank file deletion
- `grep -q "_aiClient\|get aiClient" src/main.ts` confirms lazy pattern

## Self-Check: PASSED
