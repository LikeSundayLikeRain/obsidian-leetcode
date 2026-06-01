---
phase: 21-v1-2-migration
plan: 13
status: pending
subsystem: solve/starter-code-injector + notes/note-writer
tags:
  - migration
  - new-note
  - fence-emit
  - retrofit
  - fenceKind
  - gap-closure
  - phase-21
  - post-uat
gap_closure: true
requirements: [NEWNOTE-FENCE-DEDUP-01]
dependency_graph:
  requires:
    - 21-HUMAN-UAT.md Post-UAT Findings (lines 124-164) — debug agent diagnosis of the duplicate-fence emission
    - Plan 21-03 (codeBlockForV13 emitter + buildNoteBody useInlineWidget gate; the existing v1.3 emit path that this plan complements)
    - Plan 20-10 (fenceKind dispatch on forceInjectCodeSection — the existing pattern this plan mirrors onto the retrofit code path)
    - Plan 20-09 (main.ts:1421-1429 file-open useInlineWidget gate — the analog defense-in-depth pattern this plan replicates at NoteWriter.retrofitStarterCode)
  provides:
    - "retrofit() fenceKind plumbing — settings.getUseInlineWidget?.() drives the fenceKind ('leetcode-solve' | 'legacy') threaded into injectCodeSection"
    - "NoteWriter.retrofitStarterCode wrapper-level gate — short-circuits with debug-log when useInlineWidget=ON (defense-in-depth; mirrors main.ts:1421-1429 Phase 20 Plan 20-09 pattern)"
    - "11 new tests across two test files — U1/U2/U3/U4/U5 in tests/solve/starterCodeInjector.test.ts (fenceKind plumbing) + I1/I2/I3/I4/I5/I6 in tests/notes/NoteWriter.starter-retrofit.test.ts (all four NoteWriter call sites end-to-end + legacy preservation)"
  affects:
    - "src/solve/starterCodeInjector.ts — retrofit() settings parameter widens to optional getUseInlineWidget"
    - "src/notes/NoteWriter.ts — retrofitStarterCode wrapper gains an early-return gate; ALL FOUR call sites (lines 272, 343, 419, 453) protected by ONE wrapper change"
key_files:
  created: []
  modified:
    - src/solve/starterCodeInjector.ts
    - src/notes/NoteWriter.ts
    - tests/solve/starterCodeInjector.test.ts
    - tests/notes/NoteWriter.starter-retrofit.test.ts
phase_22_marker: false  # the gating logic is bug-fix on the v1.3 happy path; the wrapper gate gets cleaned up mechanically by Phase 22 alongside the master useInlineWidget removal
wave: 3
depends_on_plans: []
parallel_with: [21-08, 21-09, 21-10, 21-11, 21-12]  # zero file overlap with any of these
file_overlap_audit:
  - "vs 21-08 (src/main/readingModeMigrationHook.ts + tests/main/readingModeMigrationTrigger.test.ts) — ZERO overlap"
  - "vs 21-09 (src/widget/fenceMigrator.ts + src/main/readingModeMigrationHook.ts + src/widget/codeBlockProcessor.ts + src/widget/liveModeViewPlugin.ts + tests) — ZERO overlap"
  - "vs 21-10 (src/main/readingModeLegacyBannerPostProcessor.ts + src/main.ts + tests) — ZERO overlap"
  - "vs 21-11 (src/widget/liveModeViewPlugin.ts + src/widget/liveModeBannerStateField.ts + tests) — ZERO overlap"
  - "vs 21-12 (src/widget/multiPaneCoordinator.ts + src/widget/WidgetController.ts + tests/widget/multiPaneCoordinator.test.ts) — ZERO overlap"
acceptance:
  - "Tests U1/U2/U3/U4/U5 (retrofit fenceKind plumbing) pass — including the v1.3 idempotency invariant (U4) and zero-sibling-fence guarantee (U5)."
  - "Tests I1/I2/I3/I4 (all four NoteWriter retrofit call sites with useInlineWidget=ON) pass — each asserts SOURCE BYTES of the resulting file have exactly one ```leetcode-solve fence opener and ZERO langSlug siblings."
  - "Tests I5/I6 (legacy useInlineWidget=OFF / undefined preservation) pass — byte-equal to pre-fix behavior on the v1.2 path."
  - "All previously-passing tests in tests/solve/starterCodeInjector.test.ts and tests/notes/NoteWriter.starter-retrofit.test.ts continue to pass."
  - "Full Phase 21 test suite (tests/solve tests/notes tests/widget tests/main) passes (Task 2 audit)."
  - "npm run build exits 0 (TypeScript clean)."
  - "grep -c 'fenceKind' src/solve/starterCodeInjector.ts >= 1 AND grep -c 'useInlineWidget' src/notes/NoteWriter.ts >= 2."
  - "Live UAT regression (post-execution by /gsd-verify-work) — fresh problem opened from browser yields exactly one ```leetcode-solve fence in ## Code on disk; ZERO ```<langSlug> siblings."
---

# Plan 21-13 — Duplicate fence on new problem from browser (Post-UAT Gap B)

## Status: PENDING — to be executed after Plans 21-08..21-11 complete on the milestone branch.

## Summary

Pre-execution scaffold. This summary will be replaced with the execution outcome by the executor on completion.

The plan closes Post-UAT Gap B from `21-HUMAN-UAT.md` (lines 124-164) — a `severity: major` issue where opening a fresh problem from the browser writes the new note's source on disk with TWO fences under `## Code` (a top ` ```<langSlug> ` plain Obsidian code block AND a bottom ` ```leetcode-solve ` widget fence) both containing the same starter code.

**Root cause** (debug-diagnosed before planning): `src/solve/starterCodeInjector.ts:256-271` (`retrofit()`) calls `injectCodeSection` WITHOUT `fenceKind`. The v1.3 short-circuit at `injectCodeSection.ts:106-112` is skipped; execution falls through to the legacy fresh-fence-prepend path at lines 141-146 which graft a sibling `\`\`\`<defaultLanguage>` fence ahead of the existing v1.3 fence.

**Four latent call sites** in `src/notes/NoteWriter.ts` all share the `retrofitStarterCode` wrapper (lines 230-241): line 272 (re-open with cached detail), line 343 (cache-cleared recovery), line 419 (new-note belt-and-suspenders — the user's primary repro), line 453 (backgroundRefresh after TTL). The minimal fix at `starterCodeInjector.ts:266` closes all four simultaneously via the shared wrapper.

**Plan decision** — option (a) PREFERRED is the chosen shape: extend `retrofit()`'s settings parameter with optional `getUseInlineWidget?(): boolean` and derive `fenceKind` internally. ZERO call-site change required at the four NoteWriter sites. PLUS a defense-in-depth wrapper-level gate (mirrors Phase 20 Plan 20-09 main.ts:1421-1429 pattern) that short-circuits the entire retrofit when `useInlineWidget=ON`. Belt (fenceKind plumbing) + suspenders (wrapper gate).

## Relevant artifacts (post-execution; populate after running the plan)

- TBD — `src/solve/starterCodeInjector.ts` settings parameter widening + fenceKind dispatch diff
- TBD — `src/notes/NoteWriter.ts` retrofitStarterCode wrapper gate diff
- TBD — `tests/solve/starterCodeInjector.test.ts` new describe block + 5 tests (U1..U5)
- TBD — `tests/notes/NoteWriter.starter-retrofit.test.ts` new describe block + 6 tests (I1..I6); makeEmptySettings factory extension

## Verification trail (post-execution; populate after running the plan)

- TBD — `npm test -- tests/solve/starterCodeInjector.test.ts tests/notes/NoteWriter.starter-retrofit.test.ts --run` exit code + new test count
- TBD — `npm test -- tests/solve tests/notes tests/widget tests/main --run` exit code (Task 2 full audit)
- TBD — `npm run build` exit code
- TBD — Audit grep result confirming only NoteWriter consumes `retrofit` from starterCodeInjector
- TBD — Live UAT regression result (file-on-disk single-fence verification)
