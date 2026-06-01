---
phase: 21-v1-2-migration
plan: 12
subsystem: ui
tags: [takeover, multi-pane, reconcileFocus, promoteThisPane, gap-closure, phase-21, post-uat, widget]

# Dependency graph
requires:
  - phase: 20-reconciliation-ux-action-row-section-protection
    provides: "multiPaneCoordinator + WidgetController.setPaneState/promoteThisPane (Plan 20-04 take-over coordinator baseline)"
provides:
  - "Hardened reconcileFocus null-leaf branch — registered controllers with no .workspace-leaf ancestor default to 'active' (NOT 'peer'); closes the mid-mount-attach window where the takeover overlay was rendered with a dead click handler."
  - "Defense-in-depth promoteThisPane self-recover — explicit setPaneState('active') call after setActiveLeaf in BOTH the matched-leaf and no-matched-leaf paths so visible state converges even when Obsidian dedupes the focus event."
  - "8 new regression tests under 'Post-UAT Gap A' describe block locking in both fixes + the legitimate two-pane peer flow + the Open #1 / close-tab / Open #2 integration repro."
affects: [phase-22-cleanup, multi-pane-future-MULTI-01-MULTI-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-way decision in reconcileFocus same-file branch: (a) same attached leaf → 'active', (b) null leaf ancestor → 'active' (parked / pre-attach / mid-teardown), (c) different attached leaf → 'peer'. The null-default-to-active rule replaces the prior null-falls-through-to-else-peer behavior."
    - "Defense-in-depth click-recovery: the click handler explicitly converges visual state via setPaneState('active') in addition to setActiveLeaf, relying on the existing setPaneState idempotency guard (line 645) to make the call a no-op on the production happy path."

key-files:
  created: []
  modified:
    - src/widget/multiPaneCoordinator.ts
    - src/widget/WidgetController.ts
    - tests/widget/multiPaneCoordinator.test.ts

key-decisions:
  - "Smallest-diff promoteThisPane shape: keep the early-return inside the for-loop (Option 2 from PLAN action guidance) and add this.setPaneState('active') BEFORE the return AND after the loop ends. Picked over the flag-and-fallthrough refactor (Option 1) because the diff is 2 inserted lines + 1 comment block vs ~6 inserted/restructured lines, with identical test coverage."
  - "PRIMARY fix uses explicit three-way if/else-if/else (cases a/b/c) rather than a ternary or nested-ternary so the post-UAT root cause comment block sits adjacent to the case (b) branch where it is most discoverable."
  - "Test C1 (integration repro) builds the full Open #1 → close-tab → Open #2 sequence inline using makeFakeCtl + makeDetachedCtl + WidgetRegistry; verifies BOTH paths converge on 'active' and stale-A never flips to 'peer'."

patterns-established:
  - "When reconcileFocus is widened to handle a new lifecycle case (parked, pre-attach, mid-teardown), the safe default is 'active' — the legitimate peer flow requires both leaves to be attached AND distinct."
  - "Click-driven user-intent UI handlers should converge visible state directly (idempotent setPaneState call) rather than relying on a downstream event re-firing through the coordinator. Obsidian dedupes same-leaf focus events; do not assume active-leaf-change always re-fires."

requirements-completed: [TAKEOVER-CTA-01]

# Metrics
duration: 4min
completed: 2026-06-01
---

# Phase 21 Plan 12: Post-UAT Gap A — Take-Over CTA Dead State Fix Summary

**Hardened reconcileFocus null-leaf branch + added promoteThisPane self-recover so every Open #2 (close-tab+reopen, switch-away+back, close-all+reopen) of a v1.3 LC note mounts in working state — overlay either does not appear (single-pane focused) or, if it appears in a transient mid-mount-attach window, its click handler deterministically promotes the pane.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-01T16:58:51Z (approx — agent spawn)
- **Completed:** 2026-06-01T17:03:10Z (approx — SUMMARY commit)
- **Tasks:** 1 of 2 executed; Task 2 is a live-UAT human-verify checkpoint (auto-approved per phase auto-mode policy; not blocking-human).
- **Files modified:** 3

## Accomplishments
- PRIMARY fix in `src/widget/multiPaneCoordinator.ts` — `reconcileFocus` same-file branch now defaults a null `ctlLeafEl` to `'active'` instead of falling through to the `'peer'` flip. The fix is gated on a three-way if/else-if/else so the legitimate two-pane peer flow (case (c)) is preserved byte-identically.
- SECONDARY fix in `src/widget/WidgetController.ts` — `promoteThisPane` calls `this.setPaneState('active')` in BOTH the matched-leaf path (after `setActiveLeaf`) AND the no-matched-leaf fallthrough path. The existing idempotency guard at line 645 of `setPaneState` makes the call harmless on the production happy path.
- 8 new regression tests in `tests/widget/multiPaneCoordinator.test.ts` under the `Post-UAT Gap A` describe block: A1/A2/A3 (null-leaf default), A4 (preserved two-pane peer), B1/B2 (self-recover), B3 (idempotency), C1 (integration repro).
- Full test suite: **3022 passed / 7 skipped (250 files)**. No regressions.
- TypeScript build: **clean** (`npm run build` exit 0).
- Verification greps both pass: `grep -nE "ctlLeafEl.*===.*null|ctlLeafEl == null"` returns lines 140 + 174; `grep -n "this.setPaneState('active')"` returns lines 731, 757, 763 (the new calls inside `promoteThisPane`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden reconcileFocus null-leaf branch + add promoteThisPane self-recover (TDD)** — `0bd968a` (fix)

**Note on TDD gates:** Per the plan's `tdd="true"` flag the task followed the RED → GREEN cycle in a single commit (the new tests + both source fixes are inseparable for behavioral coverage — Tests A1/A2/A3/B1/B2/C1 fail without the source fixes; the C1 integration test asserts the cross-cutting Open #2 behavior the two fixes jointly close). RED was empirically confirmed via the test run before the fixes were applied (output captured: 6 fails / 12 passes); GREEN confirmed afterward (18 passes). Refactor was unnecessary — the fix is already minimal.

**Plan metadata:** Will be appended via the SUMMARY commit below.

## Files Created/Modified

- `src/widget/multiPaneCoordinator.ts` — `reconcileFocus` same-file branch widened from binary if/else to three-way if/else-if/else. New comment block documents the three null-leaf cases (mid-mount-attach, parked, mid-teardown) and references `21-HUMAN-UAT.md` Post-UAT Findings (Gap A).
- `src/widget/WidgetController.ts` — `promoteThisPane` body now invokes `this.setPaneState('active')` in BOTH paths. Comment block documents the Obsidian dedup root cause and the idempotency guarantee.
- `tests/widget/multiPaneCoordinator.test.ts` — added `makeDetachedCtl` factory (controller without `.workspace-leaf` ancestor) and a new `describe('Post-UAT Gap A — reconcileFocus null-leaf + promoteThisPane self-recover (regression)', ...)` block with 8 tests.

## Decisions Made

- **Promote-this-pane shape choice (Option 2 from PLAN action guidance):** kept the early-return inside the for-loop and added the explicit `setPaneState('active')` call BEFORE the return AND after the loop ends. Smallest diff, identical test coverage, no flag/fallthrough restructure required.
- **Three-way if/else-if/else for reconcileFocus** (over a ternary or nested-ternary) so the post-UAT root cause comment block could sit adjacent to case (b).
- **No CLAUDE.md write-path discipline applied** — this plan changes ONLY DOM/state mutations (data-attribute toggles, overlay mount/unmount). NO vault writes, NO frontmatter writes, NO CM6 dispatch. Phase 17 D-05 canonical write-path pattern does NOT apply; Phase 05.5 `'leetcode.*'` userEvent annotation does NOT apply.

## Deviations from Plan

None — plan executed exactly as written. Both source fixes applied per the PLAN action guidance; all 8 specified tests added; verification commands pass; test counts match (10 pre-existing + 8 new = 18 in the file; full suite green).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Task 2 (live UAT checkpoint) is a manual verification step the user runs in their dev vault per the PLAN's how-to-verify steps; it requires no setup beyond reopening their existing LC notes.

## Threat Surface Scan

No new threat surface introduced. The fixes REDUCE surface (null-leaf controllers no longer mount a phantom overlay → fewer dead-CTA states the user could click into). The remaining DOM mutations reuse the existing `setPaneState` code path which is `createElement` + `textContent` only (no `innerHTML` per CLAUDE.md no-innerHTML rule). The reconcileFocus loop iteration count is unchanged; per-controller cost remains O(1).

## Task 2 — Live UAT Checkpoint Status

Per the phase auto-mode policy (`workflow.auto_advance: true`, `workflow._auto_chain_active: true` in `.planning/config.json`), `checkpoint:human-verify` checkpoints auto-approve UNLESS they carry `gate="blocking-human"` OR they are package-legitimacy verifications. Task 2 has `gate="blocking"` (not `"blocking-human"`) and is not a package-legitimacy gate — it is a deterministic-repro live-UAT regression check. Auto-approved for SUMMARY purposes; the human-driven verification of the 8 expectations remains a soft requirement before phase 21 closes (the post-UAT gap-closure is locked by the regression tests, but the live-vault confirmation is what flips `21-HUMAN-UAT.md` Post-UAT Finding Gap A from `status: triaged` → `status: closed`). The 8 verification steps are documented in `21-12-PLAN.md` Task 2 `<how-to-verify>` and require no further executor action.

## Self-Check: PASSED

- `[ -f src/widget/multiPaneCoordinator.ts ]` — FOUND
- `[ -f src/widget/WidgetController.ts ]` — FOUND
- `[ -f tests/widget/multiPaneCoordinator.test.ts ]` — FOUND
- Commit `0bd968a` — FOUND in `git log` on the worktree branch
- `grep -nE "ctlLeafEl.*===.*null|ctlLeafEl == null"` returns ≥1 match — VERIFIED (lines 140, 174)
- `grep -n "this.setPaneState('active')"` inside `promoteThisPane` returns ≥1 NEW match — VERIFIED (lines 757, 763)
- `npm test -- tests/widget/multiPaneCoordinator.test.ts --run` exit 0, 18/18 pass — VERIFIED
- `npm run build` exit 0 — VERIFIED
- Full test suite (3022 passed / 7 skipped) — VERIFIED

## Next Phase Readiness

- Phase 21 wave 3 closure: this plan ran wave-parallel with Plan 21-13 (different surface — widget multi-pane state vs new-note emit path). No file overlap, no merge friction.
- Permanent v1.3 code (NOT v1.2 scaffolding); no `PHASE_22_DELETE_WITH_V1_2_PATH` marker required. The take-over coordinator and `WidgetController.setPaneState` / `promoteThisPane` persist past Phase 22.
- The legitimate two-pane peer flow (Test A4 + UAT step 8) is preserved — peer overlay still mounts on the inactive pane; click still promotes the pane. MULTI-01 / MULTI-02 (full live/mirror with promote-on-focus) remain deferred to v1.4+.

---
*Phase: 21-v1-2-migration*
*Completed: 2026-06-01*
