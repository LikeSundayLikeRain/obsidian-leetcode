---
status: resolved
trigger: "Investigate and fix R6 regression introduced by Plan 21.1-01 GREEN commit (1a8a140). Fresh problem open → widget does not mount (renderStaticFallback path). Delete+reopen workaround works."
created: 2026-06-02T00:00:00Z
updated: 2026-06-02T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

RESOLVED — fix applied, tests pass, build + deploy complete.
next_action: commit

## Symptoms

expected: Opening fresh problem from problem browser → widget mounts correctly (same as R6 in cycle-2 passing at 5474c77)
actual: First open → renderStaticFallback path fires (plaintext, no action row). Delete+reopen → widget mounts correctly.
errors: No error messages reported — silent wrong-path execution
reproduction: Plugin/app reload → first-time open of NEW problem from problem browser
started: Introduced in commit 1a8a140 (Plan 21.1-01 GREEN)

## Eliminated

(none yet)

## Evidence

(none yet)

## Resolution

root_cause: In codeBlockProcessor.ts, the `if (repaired)` branch (Plan 21-14) used a bounded metadataCache poll then fell through to addChild — it never called rerenderReadingModePanes and never rendered a static intermediate. When the 1a8a140 Set guard (attempt-once) was added, LP flushes could no longer retry past the first invocation. On a fresh note where metadataCache hadn't indexed lc-language yet (race: applyFrontmatter write vs first processor fire), repairFrontmatterIfNeeded returned true. The bounded poll then resolved but addChild was called with a stale el that Obsidian may have already discarded. Widget mount was lost.

fix: Changed the `if (repaired)` branch to mirror the `if (migrated)` branch exactly: call rerenderReadingModePanes(plugin.app, file.path), then renderStaticFallback(el, source), then return. The second invocation triggered by rerenderReadingModePanes hits Set.has(path)=true, short-circuits migrate/repair, and falls through to addChild with fresh metadataCache state.

verification: Full test suite: 3101 pass (net +6 vs baseline), 1 pre-existing failure unchanged. 3 new R6 regression tests pass. 10 flicker-fix tests (R10) pass. Build clean (tsc + esbuild production). Deploy OK.

files_changed:
  - src/widget/codeBlockProcessor.ts (repaired=true branch: remove bounded poll, add rerenderReadingModePanes + renderStaticFallback + return)
  - tests/widget/codeBlockProcessor.r6Regression.test.ts (new: 3 tests for R6-A/R6-B/R6-C scenarios)
