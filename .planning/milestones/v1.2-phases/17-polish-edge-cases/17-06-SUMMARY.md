---
phase: 17-polish-edge-cases
plan: 06
status: split
shipped_in_phase_17: ["vim package install", "ChildEditorRegistry.destroyAll lifecycle tests", "conditional vim() extension wiring"]
deferred_to_phase_18: ["manual UAT close-out", "17-BUNDLE-AUDIT.md", "17-LIFE-SNAPSHOT.md (heap-snapshot UAT)"]
superseded_by: ["18-04-PLAN.md (v1.2 ship-readiness close)"]
---

# Plan 17-06 — Status: Split

## What Shipped Inside Phase 17

The implementation portions of this plan landed during Phase 17 execution:

- **`@replit/codemirror-vim` 6.3.0 installed** + bundle ceiling raised from 1.6 MB → 1.8 MB (commit `9160c6d`)
- **Conditional `vim()` extension wiring** in `src/main/childEditorFactory.ts` driven by `app.vault.getConfig('vimMode')` at child mount, per D-18 (commit `d7bff1f`)
- **`ChildEditorRegistry.destroyAll` lifecycle tests** in `tests/main/lifecycle.test.ts` (commit `8615be5`)
- **17-UAT.md scaffold flipped to in-progress** (commit `25ae66d`)

## What Was Deferred to Phase 18

Per user decision 2026-05-24 (after Phase 17 UAT surfaced backlog 999.2/999.3/999.4 promoted into Phase 18): the **manual UAT close-out**, **17-BUNDLE-AUDIT.md**, and **17-LIFE-SNAPSHOT.md (heap-snapshot UAT)** are best run against the final v1.2 build that includes the Phase 18 fixes. Running the bundle audit and heap snapshot now would produce numbers that don't reflect the shipped v1.2 — re-running after Phase 18 lands is the only audit that matters for ship readiness.

These deferrals are picked up in **Plan 18-04 (v1.2 ship-readiness close)**.

## Status

Phase 17 implementation is functionally complete (all gap-fix plans 17-07..17-13 verified via UAT). The remaining ship-readiness checks live in Phase 18.
