---
phase: 21-v1-2-migration
plan: 14
subsystem: migration/widget-mount
tags: [migration, frontmatter-repair, rerender, gap-closure, phase-21, post-uat-r2, mount-race]
requirements: [MIGRATE-FM-REPAIR-01]
gap_closure: true
wave: 1
depends_on: []
provides:
  - "Reading-mode post-processor: post-repair rerenderReadingModePanes hand-off (Task 1)"
  - "Live-Preview StateField: annotation-driven recompute on repair=true (Task 2)"
  - "Reading-mode hook: regression lock on existing 21-09 repair→rerender wiring (Task 3)"
requires:
  - "Plan 21-08 — rerenderReadingModePanes helper + readingModeMigrationHook .then trailing rerender"
  - "Plan 21-09 — repairFrontmatterIfNeeded orchestrator + repair entry points wired into all three mount paths"
affects:
  - "src/widget/codeBlockProcessor.ts (Reading-mode post-processor repair branch)"
  - "src/widget/liveModeBannerStateField.ts (LP StateField update predicates + repair fire-and-forget chain)"
tech-stack:
  added: []
  patterns:
    - "Pattern S-05 silent-on-failure preserved across all three entry points"
    - "Annotation-driven CM6 StateField recompute (CM6-idiomatic for non-doc state changes)"
    - "Same hand-off shape as Plan 21-08's migrate→rerender chain — architectural mirror"
key-files:
  created: []
  modified:
    - "src/widget/codeBlockProcessor.ts"
    - "src/widget/liveModeBannerStateField.ts"
    - "tests/widget/codeBlockProcessor.phase21.test.ts"
    - "tests/widget/liveModeBannerStateField.test.ts"
    - "tests/main/readingModeMigrationTrigger.test.ts"
decisions:
  - "Use Annotation-driven recompute (not StateEffect) — Annotation.define<true>() is the lighter-weight CM6 idiom for one-shot non-mutating triggers; effects add API surface for a single use"
  - "Module-private dispatchLeetCodeRefresh helper (not exported) — keeps the API surface minimal; T-21-14-02 mitigation"
  - "No source change in readingModeMigrationHook.ts (Task 3) — the existing Plan 21-09 wiring at lines 151-200 already fires rerenderPreviewLeaves on `migratedFlag || repairedFlag`; tests lock it in"
metrics:
  duration: "~6 minutes"
  tasks_completed: 3
  tests_added: 17
  tests_passing: 53
  files_modified: 5
  files_created: 0
  completed: 2026-06-01
---

# Phase 21 Plan 21-14: Frontmatter-Repair Rerender Hand-off Summary

Closes UAT re-test Gap R2 (severity=major) by ensuring the v1.3 widget mounts in a working state on the SAME open after `repairFrontmatterIfNeeded` injects `lc-language` — no close+reopen required. Mirrors Plan 21-08's migrate→rerender pattern across all three repair entry points.

## What Shipped

**Three entry points, three closures (Wave 1, single-cycle):**

1. **Reading-mode post-processor (Task 1, commit `5b9b612`)** — `src/widget/codeBlockProcessor.ts:188-216`. After `repaired === true`, render the static fallback first (so the user never sees a "no widget" frame), then call `rerenderReadingModePanes(plugin.app, file.path)` wrapped in try/catch (Pattern S-05). Forces the preview pane to re-run post-processors against the just-written frontmatter.
2. **Live-Preview StateField (Task 2, commit `14e6b1d`)** — `src/widget/liveModeBannerStateField.ts`. Added `leetcodeRefreshAnnotation = Annotation.define<true>()` and a module-private `dispatchLeetCodeRefresh(plugin, path)` helper. Widened both StateField update predicates to recompute on EITHER `tr.docChanged` OR the sentinel annotation. Chained `.then((repaired) => { if (repaired) dispatchLeetCodeRefresh(plugin, file.path); })` before the existing `.catch + .finally` so the post-repair completion forces a StateField recompute against the now-fresh frontmatter without requiring a doc change. Reading-mode panes are unaffected (no `.editor`).
3. **Reading-mode hook regression lock (Task 3, commit `be5beb8`)** — `tests/main/readingModeMigrationTrigger.test.ts`. Five new tests (R2.HOOK.1–R2.HOOK.5) lock the existing Plan 21-09 wiring at `src/main/readingModeMigrationHook.ts:151-200` so a future refactor cannot regress it. ZERO source change required.

## Architecture: why annotation-driven recompute (not docChange or StateEffect)

The fence-body / decoration build depends on **frontmatter**, not the doc. CM6's StateField only rebuilds on `tr.docChanged`. A frontmatter-only `processFrontMatter` write does not change the doc, so without help the StateField stays cached with a `LeetCodeFenceWidget` constructed against the STALE language. Plan 21-09 originally relied on `metadataCache.changed` to refire the post-processor, but that fires on the next macrotask after the StateField has already mounted the widget in the wrong state.

The fix is **CM6-native**: dispatch an annotation-only transaction (no doc change, no userEvent) carrying a sentinel `Annotation.define<true>()`. Widen the predicate to recompute on `tr.docChanged || tr.annotation(leetcodeRefreshAnnotation)`. The pure builder runs again with the post-repair frontmatter; the widget remounts with the user's `defaultLanguage`. CM6's section-lock `changeFilter` is moot — it only inspects doc-mutating transactions. Phase 05.5's `'leetcode.*'` userEvent rule does not apply.

`Annotation.define<true>()` was preferred over `StateEffect.define<void>()` — annotations are the lighter idiom for one-shot non-mutating triggers; effects add API surface for a single use case.

## Tests Added (17 new, 53/53 pass)

| Suite | Tests Added | New Total | Coverage |
|-------|-------------|-----------|----------|
| `tests/widget/codeBlockProcessor.phase21.test.ts` | 5 (R2.1–R2.5) | 11 | Post-repair rerenderReadingModePanes hand-off; helper called once with `(plugin.app, file.path)` on repair=true; not called on false / migrate=true / rejection / basename mismatch |
| `tests/widget/liveModeBannerStateField.test.ts` | 7 (R2.LP.1–R2.LP.7) | 16 | Annotation export; recompute on annotation w/ docChanged=false; bail-out on no-annotation no-doc-change; legacy parity; post-repair dispatch fires only on matching leaf when repaired=true; not on false / rejection |
| `tests/main/readingModeMigrationTrigger.test.ts` | 5 (R2.HOOK.1–R2.HOOK.5) | 26 | Regression lock on existing 21-09 wiring: rerenderPreviewLeaves fires on migrate=false+repair=true; not on both-false / repair-rejection; migrate=true exactly-once-no-double-fire; strict ordering migrate→repair→migrateInFlight cleared→rerender |

## Verification Performed

- `npm test -- tests/widget/codeBlockProcessor.phase21.test.ts --run` → 11/11 pass
- `npm test -- tests/widget/liveModeBannerStateField.test.ts --run` → 16/16 pass
- `npm test -- tests/main/readingModeMigrationTrigger.test.ts --run` → 26/26 pass
- Combined run → 53/53 pass (3 files, 0 failures, 734ms test execution)
- `npm run build` → 0 (TypeScript clean, esbuild production OK)
- RED gate observed before each source change (Task 1: R2.1 + R2.5 fail; Task 2: R2.LP.1, R2.LP.2, R2.LP.4, R2.LP.5 fail). After source change, all green.
- Task 3 has ZERO source change; 21 existing + 5 new pass on first run, confirming the existing Plan 21-09 implementation is already correct (regression lock).

## Decisions Made

1. **Annotation over StateEffect.** `Annotation.define<true>()` is the lighter CM6 idiom for one-shot non-mutating triggers. StateEffect would add API surface (a defined effect type) for a single use case with no observable benefit.
2. **Module-private `dispatchLeetCodeRefresh`.** Helper is NOT exported. The Annotation symbol IS exported (for tests + parity with the predicate). T-21-14-02 mitigation: external code must import the symbol to synthesize a transaction, and the widened predicate runs the same pure builders.
3. **Render fallback before rerender (Task 1).** Inside the repair=true branch we call `renderStaticFallback(el, source)` BEFORE invoking `rerenderReadingModePanes` so the user never sees a "no widget" frame between the repair write and the re-run post-processor cycle.
4. **Defensive try/catch on every dispatch.** `dispatchLeetCodeRefresh` has outer + inner try/catch (mirrors `rerenderReadingModePanes`'s shape from Plan 21-08). Per-leaf failures swallow so remaining leaves still get their dispatch. Outer never propagates to the StateField caller.
5. **No source change for the Reading-mode hook (Task 3).** The trailing `.then` at `readingModeMigrationHook.ts:190-200` already chains on `migratedFlag || repairedFlag`. Five new tests lock this in as anti-regression assertions; test names explicitly call out "Plan 21-14 regression lock" to prevent future maintainers from mistaking them for original 21-09 acceptance tests.

## Deviations from Plan

None — plan executed exactly as written. The only unscripted change was a single TS strict-undefined fix in the Task 2 test file (`mock.calls[0][0]` → guarded extraction); not a deviation, just a strict-TS detail.

## Threat-Model + Write-Path Hygiene

- **No vault writes** added by this plan. The post-repair completion only triggers Obsidian's `previewMode.rerender(true)` (Task 1) and CM6 annotation-only transactions (Task 2). Vault writes happen inside `repairFrontmatterIfNeeded` itself (Plan 21-09), which uses `app.fileManager.processFrontMatter` (Phase 17 D-05 canonical pattern).
- **No CM6 doc mutations** — annotation-only transactions carry zero changes (`tr.changes.length === 0`). The Phase 05.5 section-lock changeFilter only inspects doc-mutating transactions; structurally bypassed (T-21-14-03).
- **CLAUDE.md `'leetcode.*'` userEvent convention** does not apply: the convention covers dispatches that "target a locked range." Empty-change dispatches don't target any range. The `'leetcode.'` userEvent prefix could have been added for log-traceability but was omitted to keep the dispatch contract minimal.
- **No reentrancy** — the dispatch fires from a post-microtask `.then` callback, AFTER the StateField has returned its value to the EditorState; CM6 processes the new transaction sequentially (T-21-14-05).

## Known Stubs

None. Both source paths fully wire the post-repair completion to a StateField/post-processor recompute; no placeholders, no TODO comments, no hardcoded empty values.

## Threat Flags

None. The two new code paths (Task 1 rerender call, Task 2 dispatch helper) sit entirely within the existing trust boundaries enumerated in the plan's `<threat_model>` (Plugin → Obsidian preview rerender API; Plugin → CM6 EditorView dispatch; Plugin → metadataCache read-only). Mitigations applied:
- T-21-14-01 (DoS via dispatch loop) → matched-leaf filter + per-leaf try/catch + `repairInFlight` Set keeps the dispatch at most once per file per repair window. ✓
- T-21-14-02 (StateField widening tampering) → annotation symbol is module-import-gated; widened predicate runs the same pure builders. ✓
- T-21-14-03 (Section-lock filter bypass) → bypass is structural (empty-change transactions never reach the filter); documented in `dispatchLeetCodeRefresh` comment. ✓
- T-21-14-04 (Info disclosure on logger.debug) → inherited from Plan 21-08; no PII. ✓
- T-21-14-05 (Reentrancy in StateField update) → dispatch runs in post-microtask `.then`, after StateField has returned; CM6 processes new transaction sequentially. ✓

## Commits

| Task | Hash | Type | Files | Description |
|------|------|------|-------|-------------|
| Task 1 | `5b9b612` | feat | 2 | Chain rerenderReadingModePanes after repair=true (Reading-mode post-processor) |
| Task 2 | `14e6b1d` | feat | 2 | Annotation-driven StateField recompute on post-repair (Live Preview) |
| Task 3 | `be5beb8` | test | 1 | Regression lock for repair hand-off rerender (Reading-mode hook) |

## Self-Check: PASSED

**Files exist:**
- `src/widget/codeBlockProcessor.ts` ✓
- `src/widget/liveModeBannerStateField.ts` ✓
- `tests/widget/codeBlockProcessor.phase21.test.ts` ✓
- `tests/widget/liveModeBannerStateField.test.ts` ✓
- `tests/main/readingModeMigrationTrigger.test.ts` ✓

**Commits exist:**
- `5b9b612` — feat(21-14): chain rerenderReadingModePanes after repair=true (Task 1) ✓
- `14e6b1d` — feat(21-14): annotation-driven StateField recompute on post-repair (Task 2) ✓
- `be5beb8` — test(21-14): regression lock for repair hand-off rerender (Task 3) ✓

**Tests pass:**
- 11/11 codeBlockProcessor.phase21.test.ts ✓
- 16/16 liveModeBannerStateField.test.ts ✓
- 26/26 readingModeMigrationTrigger.test.ts ✓
- Combined: 53/53 ✓

**Build:** `npm run build` exits 0 ✓
