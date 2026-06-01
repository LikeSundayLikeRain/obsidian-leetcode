---
phase: 21-v1-2-migration
plan: 12
status: pending
subsystem: widget/multi-pane-coordinator + widget-controller-takeover
tags:
  - takeover
  - multi-pane
  - reconcileFocus
  - promoteThisPane
  - gap-closure
  - phase-21
  - post-uat
gap_closure: true
requirements: [TAKEOVER-CTA-01]
dependency_graph:
  requires:
    - 21-HUMAN-UAT.md Post-UAT Findings (lines 88-122) — debug agent diagnosis of the two compounding bugs
    - Existing wave 1+2 gap-closures (21-08..21-11) already shipped to milestone branch (commits 67c613f, 2e307fb, 2baf7da, ee8ffb9)
  provides:
    - "reconcileFocus null-leaf branch — null ctlLeafEl defaults to 'active' (PRIMARY fix; eliminates phantom overlay during the mid-mount-attach window)"
    - "promoteThisPane self-recover — explicit this.setPaneState('active') after the setActiveLeaf attempt (SECONDARY defense-in-depth fix; converges visual state with FSM state when Obsidian dedupes the focus event)"
    - "8 new regression tests in tests/widget/multiPaneCoordinator.test.ts under the 'Post-UAT Gap A' describe block — A1/A2/A3/A4 (reconcileFocus) + B1/B2/B3 (promoteThisPane) + C1 (Open #1/#2/#3 deterministic repro)"
  affects:
    - "src/widget/multiPaneCoordinator.ts — reconcileFocus is the single fan-out for active-leaf-change and layout-change events; this fix lands in its decision logic"
    - "src/widget/WidgetController.ts — promoteThisPane is the overlay click handler; permanent v1.3 surface (NOT v1.2 scaffolding)"
key_files:
  created: []
  modified:
    - src/widget/multiPaneCoordinator.ts
    - src/widget/WidgetController.ts
    - tests/widget/multiPaneCoordinator.test.ts
phase_22_marker: false  # permanent v1.3 code; no PHASE_22_DELETE_WITH_V1_2_PATH header required
wave: 3
depends_on_plans: []
parallel_with: [21-08, 21-09, 21-10, 21-11, 21-13]  # zero file overlap with any of these
file_overlap_audit:
  - "vs 21-08 (src/main/readingModeMigrationHook.ts + tests/main/readingModeMigrationTrigger.test.ts) — ZERO overlap"
  - "vs 21-09 (src/widget/fenceMigrator.ts + src/main/readingModeMigrationHook.ts + src/widget/codeBlockProcessor.ts + src/widget/liveModeViewPlugin.ts + tests) — ZERO overlap"
  - "vs 21-10 (src/main/readingModeLegacyBannerPostProcessor.ts + src/main.ts + tests) — ZERO overlap"
  - "vs 21-11 (src/widget/liveModeViewPlugin.ts + src/widget/liveModeBannerStateField.ts + tests) — ZERO overlap"
  - "vs 21-13 (src/solve/starterCodeInjector.ts + src/notes/NoteWriter.ts + tests/solve + tests/notes) — ZERO overlap"
acceptance:
  - "Tests A1/A2/A3/A4 (reconcileFocus null-leaf branch + preserved two-pane behavior) pass."
  - "Tests B1/B2/B3 (promoteThisPane self-recover with deduped focus event + idempotency preservation) pass."
  - "Test C1 (deterministic Open #1/#2/#3 sequence — Gap A symptom) passes."
  - "All previously-passing tests in tests/widget/multiPaneCoordinator.test.ts continue to pass."
  - "npm run build exits 0 (TypeScript clean)."
  - "Live UAT regression (Task 2 checkpoint) — all 8 expectations met across the three trigger paths (close-tab+reopen, switch-away+back, close-all+reopen) AND the two-pane regression-prevention check."
---

# Plan 21-12 — Take-over CTA dead on second mount (Post-UAT Gap A)

## Status: PENDING — to be executed after Plans 21-08..21-11 complete on the milestone branch.

## Summary

Pre-execution scaffold. This summary will be replaced with the execution outcome by the executor on completion.

The plan closes Post-UAT Gap A from `21-HUMAN-UAT.md` (lines 88-122) — a `severity: major` issue where every remount of an LC note (close-tab+reopen, switch-away+back, close-all+reopen) leaves the widget in a 'pre-takeover-handover' visual state with a dead 'Click to take over' CTA. Recovery requires a file-nav click.

Two compounding bugs (both diagnosed by the debug agent before planning):

1. **PRIMARY** — `src/widget/multiPaneCoordinator.ts:140-145` flips a controller to `'peer'` when `findLeafEl(ctl.container)` returns `null`. That null is "no leaf ancestor at all" (mid-mount-attach window when `widgetRegistry.set` at `WidgetController.ts:1176-1178` fires synchronously BEFORE the host is appended to a leaf), NOT "in a different leaf". Fix: null-leaf defaults to `'active'`.

2. **SECONDARY** — `src/widget/WidgetController.ts:720-742` (`promoteThisPane`) cannot self-recover when the click target leaf is already active because `setActiveLeaf` is a no-op AND Obsidian dedupes the focus event AND `active-leaf-change` never refires AND `reconcileFocus` never re-runs. Fix: defense-in-depth `this.setPaneState('active')` call regardless of whether the focus event fired.

## Relevant artifacts (post-execution; populate after running the plan)

- TBD — `src/widget/multiPaneCoordinator.ts` reconcileFocus decision-logic diff
- TBD — `src/widget/WidgetController.ts` promoteThisPane self-recover diff
- TBD — `tests/widget/multiPaneCoordinator.test.ts` new describe block + 8 tests

## Verification trail (post-execution; populate after running the plan)

- TBD — `npm test -- tests/widget/multiPaneCoordinator.test.ts --run` exit code + new test count
- TBD — `npm run build` exit code
- TBD — Live UAT regression result for Task 2 checkpoint
