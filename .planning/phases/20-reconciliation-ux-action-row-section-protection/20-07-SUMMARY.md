---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 07
status: complete
gap_closure: true
closes_gaps: ["atomicranges-cursor-edge-cases"]
tasks_completed: 2
tasks_deferred: 1
manual_uat: deferred-to-phase-end
---

# Plan 20-07 Summary — atomicRanges cursor-edge fixes

## Objective

Fix Phase 20 UAT Test 2 (`20-HUMAN-UAT.md` line 20-25, severity major):
"for cases (a) and (b), it actually turns into source mode instead of jump
over." Two coupled defects: the `## Code` lock snap target landed inside
the widget's Decoration.replace range (transactionFilter bypassed
atomicRanges authoritatively); vertical motion via coordsAtPos through a
multi-line inline replace was not covered by atomicRanges.

## Tasks

- [x] Task 1 — Widen `## Code` lock to past-closer-line for `leetcode-solve` fences
- [x] Task 2 — Add `block: true` to widget Decoration.replace
- [ ] Task 3 — Manual UAT (deferred to phase-end UAT loop per orchestrator decision)

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/main/sectionProtectionExtension.ts` | +59 / -12 | Switched to kind-aware `findCodeFence` import; routed `## Code` lock on `fence.kind === 'leetcode-solve'` widening past closer; legacy fences keep narrow lock; D-protect-01 stale comment fully replaced |
| `src/widget/liveModeViewPlugin.ts` | +12 / -2 | Added `block: true` to `Decoration.replace` spec |

## Key Implementation Details

### Lock widening — kind-routed branch

```ts
if (fence.kind === 'leetcode-solve') {
  // Widen past closer line so the snap target lands OUTSIDE the widget's
  // [openerLine.from, closerLine.to] replace range.
  const closerNextFrom = fence.closerLine < total
    ? state.doc.line(fence.closerLine + 1).from
    : closer.to;
  out.push(headFrom, closerNextFrom);
} else {
  // Legacy fence (any other ```lang``` block) — keep narrow D-protect-01 lock
  // (no widget overlap concern).
  out.push(headFrom, openerTo);
}
```

### Import switch — kind-aware findCodeFence

`sectionProtectionExtension.ts` previously imported `findCodeFence` from
`./codeActionsEditorExtension` (returns `{openerLine, closerLine}` only).
Now imports from `../widget/fenceLocator` which adds `kind: 'leetcode-solve'
| 'legacy'`. Both share the (openerLine, closerLine) shape so all existing
callsites compile unchanged.

### `block: true` Decoration.replace

```ts
Decoration.replace({
  widget: new LeetCodeFenceWidget(...),
  block: true,  // ← Phase 20 Plan 20-07
});
```

CM6 now treats the multi-line widget as a single visual block; vertical
motion skips it as a unit. Same primitive used by v1.2's
`codeActionsEditorExtension.ts:294` action-row widget.

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| `npx vitest run tests/main/sectionProtectionExtension.test.ts` | 32/32 pass (no fixture updates needed) |
| `npx vitest run` (full project) | 2061 pass / 6 skipped / 0 fail (no regressions) |
| `grep -nE 'block: true' src/widget/liveModeViewPlugin.ts` | 1 live hit |
| `grep -nE "fence\\.kind === 'leetcode-solve'" src/main/sectionProtectionExtension.ts` | 1 live hit |
| `grep -nE 'DELETE the closer-line' src/main/sectionProtectionExtension.ts` | 0 hits (Blocker #4 cleared) |
| `grep -nE 'Plan 20-07' src/main/sectionProtectionExtension.ts` | 2 hits (import + branch) |

## Test Fixture Surprise (No Update Needed)

Plan 20-07 anticipated that `tests/main/sectionProtectionExtension.test.ts`
fixtures using `'leetcode-solve'` openers would need their expected lock
ranges widened. Investigation showed all existing fixtures use
`fenceLang: 'python'` (line 80 of the test file) which produces a
`` ```python `` opener → `kind: 'legacy'` → narrow-lock branch — unchanged
by this plan. **Zero fixture updates required.** The kind-routed branch
preserves all existing test invariants for legacy fences.

## `'leetcode.*'` userEvent bypass

CLAUDE.md Conventions §1 — preserved verbatim. `grep -nE "'leetcode\."
src/main/sectionProtectionExtension.ts` returns the same hits as before
this plan (lines 4, 25, 374). No changes to the bypass path.

## Atomic Commits

1. `9728b5c` Task 1 — widen `## Code` lock past closer for leetcode-solve fences
2. `65282a1` Task 2 — `block: true` on Decoration.replace

## Manual UAT — Deferred

Task 3 (dev-vault rerun of UAT Test 2 cases a/b/c/d + vertical motion +
multi-pane regression) deferred to phase-end UAT loop where all 4
gap-closure plans (20-05/06/07/08) are verified together.

## Phase 22 Implication

Phase 22 (flip useInlineWidget=ON) inherits this fix. The widget body is
now atomic for cursor motion in both directions (horizontal via
atomicRanges + transactionFilter widening; vertical via `block: true`).
