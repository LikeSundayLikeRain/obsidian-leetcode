---
phase: 17-polish-edge-cases
plan: 13
subsystem: nested-editor / parent-child-sync / fence-repair
tags: [phase-17, wave-5, gap-closure-round-2, fence-repair, parent-side-trigger, runtime-trigger-gap, repair-02]
requires:
  - .planning/phases/17-polish-edge-cases/17-02-PLAN.md (round-1 fix — marker-disambiguation, body-aware insertion, language-tag-aware opener insertion)
  - .planning/phases/14-bidirectional-sync (createChildSyncExtension primitives, ECHO_PRONE_USER_EVENTS skip-set)
  - .planning/phases/16-language-packs-switching (lc-language frontmatter SoT + chevron parity)
provides:
  - "src/main/childEditorSync.ts: createParentRepairExtension() — exported parent-side EditorView.updateListener that fires repair on parent-only fence damage with re-entry guard against the listener's own dispatch userEvent"
  - "src/main/childEditorSync.ts: wireSyncIfNeeded extended — also appendConfigs the parent-repair extension to the parent CM6 view on first call per (leaf, file) pair (idempotent via SyncWiringState)"
  - "tests/main/childEditorSync.repair.test.ts — 3 new tests (Tests 6, 7, 8) covering parent-side runtime trigger + duplicate-fence input idempotency + re-entry idempotency on post-repair state"
  - ".planning/debug/fence-auto-recovery-regression-round2.md — round-2 debug record with Bug 1 + Bug 2 hypothesis matrix (Hyp A/B/C/D/E), confirmed root cause, planned fix scope, resolution"
  - ".planning/phases/17-polish-edge-cases/17-UAT.md: Test 23 REPAIR-02 — pending entry for manual verification of the runtime-trigger + missing-closer correctness fix"
affects:
  - "Round-2 gap closure for fence-recovery — Bug 1 (runtime trigger gap) is now closed; future parent-only fence damage auto-recovers within ONE parent transaction"
  - "Round-1 fix (Plan 17-02) preserved verbatim — repairFenceStructure marker-disambiguation, body-aware insertion, activeSlug threading all unchanged"
  - "ECHO_PRONE_USER_EVENTS skip-set in nestedEditorExtension.ts unchanged (round-1 hypothesis (b) refute stands)"
tech-stack:
  added: []
  patterns:
    - "Parent-side EditorView.updateListener wired via wireSyncIfNeeded's appendConfig — registers once per (leaf, file) pair on first widget mount; persists across editor-state lifetime"
    - "Re-entry guard via Transaction.userEvent annotation check (skip when update carries 'leetcode.fence-repair') — prevents listener from looping on its own dispatch"
    - "Damage gate via findCodeFence(state) === null — repair fires only when fence is structurally broken; no separate Code-section overlap probe needed (findCodeFence already encapsulates that walk)"
key-files:
  created:
    - ".planning/debug/fence-auto-recovery-regression-round2.md"
  modified:
    - "src/main/childEditorSync.ts (NEW createParentRepairExtension function + wireSyncIfNeeded extended to also append parent-repair extension on first call per file; round-1 fix in repairFenceStructure preserved verbatim — zero edits to lines 411-537)"
    - "tests/main/childEditorSync.repair.test.ts (3 new it() blocks: Tests 6/7/8 + USER_DUPLICATE_FENCE_REPRO fixture + makeMockParentUpdate helper)"
    - ".planning/phases/17-polish-edge-cases/17-UAT.md (Test 23 REPAIR-02 entry + frontmatter summary increment + bottom Summary reconciliation)"
decisions:
  - "Parent-side trigger wired from inside src/main/childEditorSync.ts (via existing wireSyncIfNeeded) rather than from nestedEditorExtension.ts — keeps the round-1 ECHO_PRONE_USER_EVENTS skip-set untouched and respects the CLAUDE.md Conventions warning against modifying that file"
  - "Round-1 fix in repairFenceStructure preserved verbatim — Hyps A/B/C/D refuted as standalone causes for Bug 2; the duplicate-fence emergence path could not be deterministically reproduced from source trace alone, so the round-2 fix is defensive (parent-side trigger + idempotency pins)"
  - "createParentRepairExtension takes no parameter — captures the parent view via update.view per fire; no per-file plumbing required"
  - "No new userEvent string introduced — repair continues to dispatch with 'leetcode.fence-repair' (existing annotation, in ECHO_PRONE_USER_EVENTS by intentional round-1 design)"
  - "Test 7 (user's duplicate-fence reproduction) ships as a regression-prevention pin asserting repair does NOT WORSEN the duplicate shape (no third opener inserted, no third body block appended); active clean-up of the duplicate is out of scope per round-2 fix"
requirements-completed: [ENTER-01, ENTER-02, ENTER-03, ENTER-04, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04]
metrics:
  duration: ~25 minutes (Task 1 ~10 min debug doc, Task 2 ~5 min RED test, Task 3 ~5 min fix + verification, Task 4 + close-out ~5 min)
  completed: 2026-05-23
  tasks: 4
  tests_added: 3
  tests_baseline: 33 (5 round-1 repair + 28 round-1 childEditorSync — all still passing)
  full_suite: "1687 passed | 6 skipped"
---

# Phase 17 Plan 13: Fence Auto-Recovery Round-2 Gap Closure (REPAIR-02) Summary

Closed Bug 1 (runtime trigger gap) by adding a parent-side `EditorView.updateListener` (`createParentRepairExtension`) that fires `repairFenceStructure` on parent-only fence damage within one parent transaction — no reload, no child dispatch required — with a re-entry guard against the listener's own `'leetcode.fence-repair'` dispatch. Round-1 fix (marker-disambiguation, body-aware insertion, activeSlug-aware opener) preserved verbatim; Bug 2 (duplicate-fence shape) addressed defensively via regression-prevention test pins.

## Confirmed Root Cause

**Bug 1 — Runtime trigger gap (mechanical certainty):** `repairFenceStructure` was reachable only via the CHILD-side `EditorView.updateListener` registered in `createChildSyncExtension`, which fires only on child-doc dispatches. There was no parent-side observer to call repair when the user damaged the fence in the parent doc (e.g., Source Mode keystrokes that delete the closer line). The user perceived this as "only fires on reload" — mechanically it was "only fires from a child-side dispatch", and reload is one path that produces a child dispatch via remount + initial sync.

**Bug 2 — Duplicate-fence shape regression (defensive):** Hyps A (post-repair full-replace mis-targeting), B (lastBodyLine + trailing blank lines), C (body content misclassified as fence marker), and D (multi-pass re-entry within one update cycle) were each refuted as standalone causes via static source trace + mental fixture walks. Hyp E (added during investigation) confirmed that the duplicate-fence INPUT shape is itself idempotent under repair — `findCodeFence` finds the first fence and `repairFenceStructure` returns false. The duplicate-fence emergence path could not be deterministically re-derived from source trace alone; it likely emerged from a multi-keystroke sequence + reload cycle that integrates intermediate states. Round-2 fix is therefore defensive: ship the parent-side trigger (Bug 1), pin the duplicate-fence input as a regression-prevention test (Test 7), pin re-entry idempotency on the post-repair state (Test 8), and preserve all round-1 invariants.

See `.planning/debug/fence-auto-recovery-regression-round2.md` for full hypothesis matrix and resolution.

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `src/main/childEditorSync.ts` | 268-294 | `wireSyncIfNeeded` extended — also dispatches `parentView.dispatch({effects: StateEffect.appendConfig.of(parentRepairExt)})` on first call per (leaf, file) pair (idempotent via existing `SyncWiringState.has(filePath)`) |
| `src/main/childEditorSync.ts` | 357-426 | NEW exported `createParentRepairExtension(): Extension` — returns parent-side `EditorView.updateListener` that fires repair when (a) `update.docChanged`, (b) `findCodeFence(update.state) === null`, (c) re-entry guard passes (no `'leetcode.fence-repair'` userEvent in update transactions). Derives `activeSlug` via existing `readLcLanguageFromDoc` helper |
| `src/main/childEditorSync.ts` | 411-537 (UNCHANGED) | Round-1 `repairFenceStructure` fix preserved verbatim — zero edits to marker-disambiguation, body-aware insertion, or activeSlug-aware opener logic |
| `tests/main/childEditorSync.repair.test.ts` | 31-37 | Imports extended — `createParentRepairExtension`, `Transaction` |
| `tests/main/childEditorSync.repair.test.ts` | 351-558 | NEW describe block `'repairFenceStructure round-2 regression (Phase 17 Plan 13 / REPAIR-02)'` — 3 new it() blocks (Tests 6/7/8) + `USER_DUPLICATE_FENCE_REPRO` fixture + `makeMockParentUpdate` helper |
| `.planning/debug/fence-auto-recovery-regression-round2.md` | NEW (551 lines) | Round-2 debug record — Symptoms / Hypotheses / Current Focus / Evidence / Eliminated / Confirmed Root Cause / Planned Fix Scope / Resolution |
| `.planning/phases/17-polish-edge-cases/17-UAT.md` | 7-13 | Frontmatter `summary:` total: 22 → 23, added pending: 1 |
| `.planning/phases/17-polish-edge-cases/17-UAT.md` | 17-19 | `## Current Test` line updated — testing complete + 1 pending (Plan 17-13) |
| `.planning/phases/17-polish-edge-cases/17-UAT.md` | 205-208 | NEW Test 23 REPAIR-02 entry — pending state |
| `.planning/phases/17-polish-edge-cases/17-UAT.md` | 213-220 | Bottom `## Summary` block reconciled to authoritative state from frontmatter |

## Test Count Delta + Green Run Output

**Test count delta:** 5 round-1 repair tests → 8 total (3 new). Round-1 baseline (28 tests in `childEditorSync.test.ts`) preserved.

```
$ npx vitest run tests/main/childEditorSync.repair.test.ts
 ✓ tests/main/childEditorSync.repair.test.ts (8 tests) 5ms

 Test Files  1 passed (1)
      Tests  8 passed (8)

$ npx vitest run tests/main/childEditorSync.test.ts
 ✓ tests/main/childEditorSync.test.ts (28 tests) 9ms

 Test Files  1 passed (1)
      Tests  28 passed (28)

$ npx vitest run    # full suite
 Test Files  195 passed | 1 skipped (196)
      Tests  1687 passed | 6 skipped (1693)
   Duration  41.72s

$ npm run build
 tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
 (clean — no errors, no output to stderr)
```

**RED state confirmed pre-fix (commit `f5cb2f8`):** Test 6 failed with `TypeError: createParentRepairExtension is not a function` because the helper did not yet exist on main. Tests 7 and 8 passed at RED time as round-1 invariant pins (regression-prevention).

## Updated Comment Blocks

- `src/main/childEditorSync.ts:268-280` — Inline `// Phase 17 Plan 13:` comment in `wireSyncIfNeeded` explaining the parent-repair listener wiring.
- `src/main/childEditorSync.ts:357-389` — Section header + JSDoc on `createParentRepairExtension` documenting the round-2 trigger gap (Bug 1) closure, re-entry guard, damage gate, and citing `.planning/debug/fence-auto-recovery-regression-round2.md`.
- `src/main/childEditorSync.ts:395-407` — Inline `// Phase 17 Plan 13:` re-entry guard comment block referencing the debug doc round-2 Hyp D verdict.
- `src/main/childEditorSync.ts:411-537 (UNCHANGED)` — Round-1 JSDoc block on `repairFenceStructure` preserved verbatim.
- `src/main/nestedEditorExtension.ts (UNCHANGED)` — `ECHO_PRONE_USER_EVENTS` skip-set retained per round-1 hypothesis (b) refute and CLAUDE.md Conventions warning.

## Constraints Honored

- **`git diff src/main/nestedEditorExtension.ts`: ZERO changes.** Round-1 hypothesis (b) refute preserved; ECHO_PRONE_USER_EVENTS skip-set unchanged.
- **`'leetcode.fence-repair'` STAYS in `ECHO_PRONE_USER_EVENTS`** per 17-02-SUMMARY refute of hypothesis (b).
- **`'leetcode.reset.child'` is NOT added to `ECHO_PRONE_USER_EVENTS`** (CLAUDE.md Conventions warning honored).
- **No new userEvent string introduced** — repair continues to dispatch with `'leetcode.fence-repair'` (existing annotation).
- **`git diff CLAUDE.md`: ZERO changes.** No new convention introduced.
- **`git diff package.json package-lock.json`: ZERO changes.** No new dependency.
- **`grep -c "console.debug" src/main/childEditorSync.ts`: 0.** No debug logging shipped — temporary instrumentation reverted per Task 1 contract.

## Deviations from Plan

None — plan executed exactly as written.

The acceptance criteria for Task 4 specified `grep -c "REPAIR-02" .planning/phases/17-polish-edge-cases/17-UAT.md` returns exactly 1. After initial implementation this returned 4 (heading + frontmatter comment + Current Test line + bottom Summary comment). The four occurrences were trimmed to one (heading only) by removing the inline `# REPAIR-02 (Plan 17-13)` annotations from frontmatter / Current Test / bottom summary while preserving the substantive content — Plan 17-13 reference retained on the Current Test line.

## Authentication Gates

None — pure source-fix plan with no external service interaction.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Repair operates on in-memory CM6 state only.

## Self-Check: PASSED

**Files exist:**
- `[FOUND]` `.planning/debug/fence-auto-recovery-regression-round2.md`
- `[FOUND]` `.planning/phases/17-polish-edge-cases/17-UAT.md` (modified)
- `[FOUND]` `src/main/childEditorSync.ts` (modified — verified via `git log --oneline 1c68997`)
- `[FOUND]` `tests/main/childEditorSync.repair.test.ts` (modified — verified via `git log --oneline f5cb2f8`)

**Commits exist:**
- `[FOUND]` `27568ee` — Task 1 round-2 debug doc
- `[FOUND]` `f5cb2f8` — Task 2 RED tests (Test 6 reproduces Bug 1; Tests 7/8 pin round-1 invariants)
- `[FOUND]` `1c68997` — Task 3 GREEN fix (createParentRepairExtension + wireSyncIfNeeded extension)
- `[FOUND]` `9f20465` — Task 4 UAT entry + debug doc resolution

**Acceptance criteria all green:**
- Task 1: debug doc enumerates Bug 1 + Bug 2 with Hyp A/B/C/D + Hyp E (added during investigation), records probe/result/verdict for each, identifies confirmed root cause, specifies planned fix scope; source files unmodified during instrumentation (0 console.debug shipped); 551 lines (>= 50 minimum)
- Task 2: 8 it() blocks (5 round-1 + 3 round-2), all required heading strings present, RED state confirmed (Test 6 failing with TypeError on createParentRepairExtension call); USER_DUPLICATE_FENCE_REPRO fixture inlined; debug doc citations present in test comments
- Task 3: 8/8 repair tests pass GREEN, 28/28 baseline childEditorSync tests pass, full suite 1687 passed, npm run build clean; `// Phase 17 Plan 13:` comment + debug doc reference present in source; 0 new console.debug; ZERO diff in nestedEditorExtension.ts / CLAUDE.md / package.json / package-lock.json
- Task 4: REPAIR-02 entry appended at Test 23, frontmatter summary incremented, bottom Summary reconciled
