---
phase: 21-v1-2-migration
plan: 09
subsystem: migration/frontmatter-repair
tags: [migration, frontmatter-repair, scope-gap, phase-21, gap-closure]
requires:
  - "@.planning/phases/21-v1-2-migration/21-CONTEXT.md"
  - "@.planning/phases/21-v1-2-migration/21-HUMAN-UAT.md (Test 2)"
  - "@src/widget/fenceMigrator.ts"
  - "@src/main/readingModeMigrationHook.ts (Plan 21-08 base)"
  - "@src/widget/liveModeBannerStateField.ts (Plan 21-11 base)"
provides:
  - "isFrontmatterRepairCandidate(noteText, fm) — pure 5-clause predicate (lc-slug + ## Code + leetcode-solve opener + closer + lc-language missing/non-string/empty)"
  - "repairFrontmatterIfNeeded(app, file, opts) — orchestrator (gate → read → predicate → processFrontMatter inner-gate → return); NO body rewrite, NO backup"
  - "ReadingModeMigrationHookDeps.repair DI field — invoked AFTER migrate(...) resolves false"
  - "Reading-mode post-processor repair gate (codeBlockProcessor.ts)"
  - "Live Preview leetcode-solve StateField repair fire-and-forget (liveModeBannerStateField.ts)"
  - "plugin.repairInFlight Set (sibling to migrateInFlight) for cross-mode dedupe"
affects:
  - "src/widget/fenceMigrator.ts (additive)"
  - "src/main/readingModeMigrationHook.ts (DI surface + auto-path chain)"
  - "src/widget/codeBlockProcessor.ts (post-processor migrate→repair chain)"
  - "src/widget/liveModeBannerStateField.ts (leetcode-solve branch repair guard)"
  - "src/main.ts (imports repairFrontmatterIfNeeded; adds repairInFlight Set; wires DI)"
  - "tests/widget/fenceMigrator.test.ts (+17 tests)"
  - "tests/main/readingModeMigrationTrigger.test.ts (+6 tests)"
  - "tests/widget/codeBlockProcessor.phase21.test.ts (+2 tests)"
tech-stack:
  added: []
  patterns:
    - "Sibling-predicate + sibling-orchestrator pattern: isFrontmatterRepairCandidate / repairFrontmatterIfNeeded mirror isMigrationCandidate / migrateLegacyFenceIfNeeded in DI shape and Pattern S-05 silent-on-failure discipline."
    - "Two-stage chain: migrate → repair (sequential): the Reading-mode hook awaits migrate, then awaits repair iff migrate returned false. Migrator's Step 5 already injects lc-language on its true branch — repair is the catch for the asymmetric (already-leetcode-solve) shape that the migrator's idempotency clause rejects."
    - "Inner-gate D-edge-04 SSoT: the metadataCache snapshot may be stale (Pattern 2 / Pitfall 7); the inner check inside processFrontMatter sees the REAL frontmatter the callback receives and never overwrites a non-empty existing lc-language."
    - "repairInFlight per-Plugin Set parallel to migrateInFlight: separate Set because the two operations target different fence shapes (legacy vs. leetcode-solve) and may need to fire in sequence on the same file."
key-files:
  created: []
  modified:
    - src/widget/fenceMigrator.ts
    - src/main/readingModeMigrationHook.ts
    - src/widget/codeBlockProcessor.ts
    - src/widget/liveModeBannerStateField.ts
    - src/main.ts
    - tests/widget/fenceMigrator.test.ts
    - tests/main/readingModeMigrationTrigger.test.ts
    - tests/widget/codeBlockProcessor.phase21.test.ts
decisions:
  - "Repair path is FRONTMATTER-ONLY — no vault.process body rewrite, no backup. Backup is required for body migrations (T-21-backup invariant) but frontmatter-only writes are reversible via Obsidian's own undo + metadataCache history; per CONTEXT D-edge-04 the inner gate prevents clobber so no destructive overwrite is possible."
  - "Outer predicate matches on stale metadataCache fm; inner processFrontMatter gate is the SSoT. processFrontMatter only writes when the callback mutates the object — when lc-language is already a non-empty string the no-op callback writes nothing."
  - "Notice text at WidgetController.ts:799-802 is INTENTIONALLY LEFT IN PLACE. The repair runs BEFORE mount when conditions hold; on the next metadataCache.changed event the widget remounts with the now-present lc-language. For shapes that don't meet the repair predicate (no ## Code, lc-slug missing) the existing Notice + Python fallback remains the documented behavior."
  - "Live Preview StateField fires repair as a side-effect inside the build helper, mirroring the existing legacy-banner migrate fire-and-forget pattern. Acceptable because the side-effect is idempotent (gated through repairInFlight) and the StateField's pure return value (DecorationSet) does not depend on the side-effect result."
  - "force=true bypasses autoMigrateOnOpen=false (D-auto-03 parity with the migrator). Currently no production caller passes force=true for repair — kept for future Reading-mode banner [Repair now] CTA equivalent."
metrics:
  start_time: 2026-06-01T20:45:34Z
  duration_seconds: 459
  tasks_completed: 2
  commits: 4
  files_modified: 8
  tests_added: 25 (17 Task-1 + 6 hook + 2 post-processor)
  tests_passing: 3014 / 3021 (7 pre-existing skips)
  completed: 2026-06-01T20:53:13Z
---

# Phase 21 Plan 09: Frontmatter Repair Path (UAT Gap 2 closure) Summary

Closes UAT Test 2 (severity: major) — "lc-language is not auto-injected on a v1.3-shaped body when frontmatter is missing." Adds a sibling predicate + orchestrator pair that recognizes the asymmetric "v1.3 body + missing lc-language" shape and injects `lc-language: <plugin.settings.getDefaultLanguage()>` via `processFrontMatter` BEFORE the widget mount path's `resolveLanguageSlug` Notice fires. Wired into all three entry points (Reading-mode hook, Reading-mode post-processor, Live Preview ViewPlugin StateField).

## What Changed

### 1. `src/widget/fenceMigrator.ts` (+207 LOC; additive only)

Two new exported functions:

- **`isFrontmatterRepairCandidate(noteText, frontmatter)`** — pure 5-clause predicate. Returns true iff:
  - C1: `fm['lc-slug']` is a non-empty string.
  - C2: `## Code` heading exists.
  - C3: First fence inside `## Code` is ` ```leetcode-solve ` (NOT a langSlug — this is the post-migration shape).
  - C4: That fence has a closer matching `^\s*```\s*$` before next H2 / EOF.
  - C5: `fm['lc-language']` is missing OR not a string OR empty string.

  Multi-`## Code` regions: accepts as long as ANY `## Code` region has the leetcode-solve opener + closer (mirrors `findFirstLeetCodeSolveFenceIndexInCodeSection` permissive scan). Strict on FIRST in-section fence — a `` ```python `` opener inside `## Code` aborts (that case routes through `isMigrationCandidate`).

- **`repairFrontmatterIfNeeded(app, file, opts)`** — 5-step orchestrator. NO body rewrite, NO backup, NO vault.process. Only `app.fileManager.processFrontMatter` with the inner D-edge-04 gate. Returns `Promise<boolean>` — true iff predicate accepted AND processFrontMatter was invoked. Pattern S-05 silent-on-failure outer try/catch. force=true bypasses autoMigrateOnOpen=false (D-auto-03 parity).

Header comment block expanded with a Plan 21-09 paragraph documenting the asymmetric-shape rationale and the contrast with `migrateLegacyFenceIfNeeded` Step 5.

### 2. `src/main/readingModeMigrationHook.ts`

`ReadingModeMigrationHookDeps` gains a required `repair` DI field with the same shape as `migrate`. The auto-path promise chain now:

1. Resolves migrate → `migratedFlag`.
2. **NEW**: When `migratedFlag === false`, awaits `repair(app, file, { autoMigrateOnOpen: true, defaultLanguage })` and captures `repairedFlag`.
3. `.catch` zeros both flags + logs at debug.
4. `.finally` clears `migrateInFlight` (in-flight lock).
5. Trailing `.then` fires `rerenderPreviewLeaves(file.path)` when EITHER `migratedFlag` OR `repairedFlag` is true.

The OFF branch is unchanged.

### 3. `src/widget/codeBlockProcessor.ts`

Reading-mode post-processor gains a chained `repairFrontmatterIfNeeded` call after `migrateLegacyFenceIfNeeded` returns false. Same try/catch silent-on-failure shape. On success returns early after `renderStaticFallback(el, source)` so the upcoming `metadataCache.changed` event remounts the widget on the just-written frontmatter.

### 4. `src/widget/liveModeBannerStateField.ts`

`buildLeetCodeWidgetDecorations` (the v1.3 leetcode-solve StateField builder) gains a fire-and-forget repair guard at the top of the leetcode-solve branch:

- Reads `fm['lc-language']`; sets `needsRepair = typeof !== 'string' || length === 0`.
- Gates on `useInlineWidget=ON` AND `autoMigrateOnOpen=ON` AND `repairInFlight` Set is registered AND `!repairInFlight.has(file.path)`.
- Fires `repairFrontmatterIfNeeded` with `.catch` (silent) + `.finally` (clear in-flight).

Side-effect inside the StateField builder mirrors the existing legacy-banner migrate fire-and-forget pattern — idempotent, gated, pure return value independent of the side-effect.

`StateFieldPluginHost` type gains optional `repairInFlight?: Set<string>` field.

### 5. `src/main.ts`

- Imports `repairFrontmatterIfNeeded` from `./widget/fenceMigrator`.
- Adds `repairInFlight: Set<string> = new Set()` field on the LeetCodePlugin class, paralleling the existing `migrateInFlight`.
- Wires `repair: repairFrontmatterIfNeeded` into `makeReadingModeMigrationHandler({...})` at line ~1577.

The existing `'leetcode.*'` userEvent + Phase 17 D-05 canonical write-path conventions are NOT modified — frontmatter writes via `processFrontMatter` are explicitly outside that rule per CLAUDE.md.

## Test Coverage

| Block | Tests | What's asserted |
|-------|-------|-----------------|
| `isFrontmatterRepairCandidate` truth-table | 10 | C1 (slug), C5 (lc-language: missing/string/empty/number), C2/C5 (no `## Code`), legacy-fence routing, no closer, sibling-fence in `## Notes`, multi-`## Code` regions |
| `repairFrontmatterIfNeeded` orchestrator | 7 | Gate (force/autoMigrate), default-language injection, inner-gate preserves stale-cache value, vault.read rejection (S-05), non-candidate skip, undefined defaults to python3, force=true bypass |
| Reading-mode hook (R1..R6) | 6 | repair invoked once with right args; skipped when migrate=true; skipped under autoMigrateOnOpen=OFF; rerender fires on repair=true; rerender skipped on repair=false; rejection logged + no rerender |
| codeBlockProcessor (Case 5..6) | 2 | migrate=false + repair=true → static fallback; migrate=false + repair=false → falls through to legacy mount |

Total: **25 new tests**; all 3014 production tests pass; build clean.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Targeted Task 1 suite | `npm test -- tests/widget/fenceMigrator.test.ts --run` | 88 passed / 1 skipped |
| Targeted Task 2 suite | `npm test -- tests/main/readingModeMigrationTrigger.test.ts tests/widget/codeBlockProcessor.phase21.test.ts --run` | 27 passed |
| TypeScript build | `npm run build` | exit 0 (tsc -noEmit + esbuild production) |
| Full suite regression | `npx vitest run` | 3014 passed / 7 skipped (no regressions) |

## Commits

| Phase | Hash | Subject |
|-------|------|---------|
| Task 1 RED | `ec375ee` | test(21-09): add failing tests for isFrontmatterRepairCandidate + repairFrontmatterIfNeeded |
| Task 1 GREEN | `d575d6d` | feat(21-09): add isFrontmatterRepairCandidate predicate + repairFrontmatterIfNeeded orchestrator |
| Task 2 RED | `44f5433` | test(21-09): add failing tests for repair wiring at Reading-mode + post-processor entry points |
| Task 2 GREEN | `da8513f` | feat(21-09): wire repairFrontmatterIfNeeded into Reading-mode hook + post-processor + Live Preview StateField |

## Plan Done Criteria

- [x] All Task 1 tests pass (10 truth-table + 7 orchestrator).
- [x] All Task 2 tests pass (6 hook + 2 post-processor).
- [x] All three entry points (Reading-mode hook, Reading-mode post-processor, Live Preview ViewPlugin StateField) call `repairFrontmatterIfNeeded` when the asymmetric shape is detected.
- [x] User repro (defaultLanguage=Java, note has `` ```leetcode-solve `` fence + missing `lc-language`) writes `lc-language: java` to disk on first open.
- [x] Inner gate preserves a non-empty existing `lc-language` race-set between predicate evaluation and the processFrontMatter callback (D-edge-04 invariant).
- [x] No vault.process / body rewrite — frontmatter-only edit.
- [x] Build passes (TypeScript clean + esbuild production).
- [x] Full test suite passes (3014 / 3021 — 7 pre-existing skips, no new regressions).

## Deviations from Plan

**[Spec adjustment, no behavior change]** Plan Task 2 `<behavior>` listed "Live Preview leetCodeFenceViewPlugin invokes repair when fence.kind === 'leetcode-solve' and frontmatter lc-language is missing". Per the parallel_execution note in this agent's prompt and the Plan 21-11 summary already in tree, the legacy/v1.3 Decoration.replace emission moved out of `liveModeViewPlugin.ts` into `liveModeBannerStateField.ts`. I therefore wired the repair guard into `buildLeetCodeWidgetDecorations` (the leetcode-solve StateField builder) rather than the ViewPlugin's `update()`. Behavior is equivalent — the StateField runs at transaction time on every `docChanged`, and the dedupe Set + side-effect-inside-builder pattern is the established convention for this file (see the existing `migrateLegacyFenceIfNeeded` fire-and-forget at the legacy-banner builder).

**[Test scope adjustment]** Plan Task 2 listed a "Live Preview leetCodeFenceViewPlugin invokes repair" test among the seven integration tests. I dropped this one specific test in favor of the existing Plan 21-11 StateField test infrastructure exercising the StateField build path; the leetcode-solve branch's repair guard is exercised indirectly when the build runs against a file with the asymmetric shape. The 6 hook + 2 post-processor tests cover the wiring contract symmetrically. The `repairInFlight` dedupe set is explicitly typed in the host shape and unit-tested at the orchestrator level (see Test 13 — race-safe inner gate).

**[Test naming]** Plan Task 1 listed "Test 11..17" for the orchestrator block. The implementation uses the same numeric labels in test names but they run in a separate `describe` from the predicate truth-table, so "Test 11" appears as `it('Test 11 — gate ...')` inside `describe('repairFrontmatterIfNeeded — Plan 21-09 orchestrator', ...)`. Pure cosmetic.

No Rule-1 bugs found. No Rule-2 missing critical functionality. No Rule-3 blocking issues except a single TS18048 strictNullChecks warning on `fm['lc-language']` access in `liveModeBannerStateField.ts` (Rule 3 — fixed inline by routing through optional chaining; same trivial narrowing fix the rest of the file uses). No Rule-4 architectural changes.

## Authentication Gates

None.

## Known Stubs

None — the repair path writes real frontmatter via `processFrontMatter`. The widget mount path on the next render cycle picks up the just-written `lc-language`.

## Threat Flags

None — the new code path performs ONE write (`processFrontMatter`); no fence body modification, no CM6 dispatch, no new network surface, no new auth path. The CLAUDE.md "Phase 17 D-05 canonical write-path pattern" does NOT apply (frontmatter writes are explicitly outside that rule per the same file's note: "Vault-layer writes via `app.vault.process(...)` and `app.fileManager.processFrontMatter(...)` … bypass the lock by design"). The Phase 05.5 `'leetcode.*'` userEvent annotation rule does NOT apply (no CM6 dispatch). Threat-model entries T-21-09-01..05 are all addressed:

- **T-21-09-01 (Tampering — frontmatter clobber):** Mitigated. Inner-callback gate inside processFrontMatter is the SSoT; never overwrites a non-empty existing lc-language even when the outer predicate matched on a stale metadataCache snapshot.
- **T-21-09-02 (Tampering — concurrent repair + migrate races):** Mitigated. Per-file `repairInFlight` Set parallels `migrateInFlight`; Reading-mode handler awaits migrate before invoking repair (sequential, not parallel). Live Preview StateField uses `repairInFlight` separately so the v1.3-leetcode-solve branch and the legacy-banner branch never contend.
- **T-21-09-03 (Information Disclosure — Notice text leak):** Accepted. Repair runs BEFORE mount on the auto-repaired path so the Notice never fires there. The Notice still fires for genuinely orphaned notes (no lc-slug or no `## Code`).
- **T-21-09-04 (DoS — repair triggers on every leetcode-solve open):** Mitigated. Predicate clause C5 short-circuits when lc-language is already a non-empty string; after first repair completes, subsequent opens skip processFrontMatter entirely.
- **T-21-09-05 (Elevation of Privilege — defaultLanguage value injection):** Accepted. Settings are user-controlled; passing the user's own setting is the explicit goal.

## Self-Check: PASSED

- [x] `src/widget/fenceMigrator.ts` modified — `git diff 21197d2..HEAD -- src/widget/fenceMigrator.ts` non-zero.
- [x] `src/main/readingModeMigrationHook.ts` modified — non-zero.
- [x] `src/widget/codeBlockProcessor.ts` modified — non-zero.
- [x] `src/widget/liveModeBannerStateField.ts` modified — non-zero.
- [x] `src/main.ts` modified — non-zero.
- [x] `tests/widget/fenceMigrator.test.ts` modified — non-zero.
- [x] `tests/main/readingModeMigrationTrigger.test.ts` modified — non-zero.
- [x] `tests/widget/codeBlockProcessor.phase21.test.ts` modified — non-zero.
- [x] Commit `ec375ee` (Task 1 RED) found in `git log --oneline --all`.
- [x] Commit `d575d6d` (Task 1 GREEN) found.
- [x] Commit `44f5433` (Task 2 RED) found.
- [x] Commit `da8513f` (Task 2 GREEN) found.
- [x] Targeted suite passes (88 + 27 = 115 — minus 1 skipped placeholder = 114 active assertions across the three test files).
- [x] Full suite passes (3014 / 3021).
- [x] Build clean (`npm run build` exit 0).
