---
phase: 08-ai-debug
plan: 05
subsystem: ui
tags: [obsidian, ai-debug, verdict-modal, footer-button, single-entrypoint, conditional-render]

# Dependency graph
requires:
  - phase: 08-01
    provides: classifyStatus + VerdictKind union (statusMap.ts) + LastVerdictStore wired in main.ts
  - phase: 08-02
    provides: AIClient.invokeStream (entered via openAIDebug)
  - phase: 08-03
    provides: AIStreamModal + buildDebugPrompt
  - phase: 08-04
    provides: LeetCodePlugin.openAIDebug(slug) — single entrypoint shared with fence-row + palette
provides:
  - "VerdictModalArgs.onOpenAIDebug? — optional close-then-fire callback"
  - "RenderVerdictArgs.onOpenAIDebug? — pure-renderer arg threading"
  - "Conditional AI Debug button in verdict modal footer with LOCKED visibility union {wa,tle,mle,re,ce}"
  - "DOM order: [Copy failing?][Copy error?][AI: Debug?][Close]"
  - "VerdictModal close-then-fire ordering — close() before args.onOpenAIDebug?.() — prevents AIStreamModal/VerdictModal z-index stacking (T-08-05-T-stack)"
  - "main.ts wires onOpenAIDebug callback at BOTH VerdictModal construction sites (submitFromActive + runInterpretedInput) — Submit AND Run paths covered"
affects:
  - 09     # Phase 09 AI Review will reuse the same single-entrypoint pattern for Accepted verdicts

# Tech tracking
tech-stack:
  added: []  # No new packages
  patterns:
    - "Single-entrypoint discipline (T-08-05-T-host): all 3 AI Debug surfaces (fence-row from 08-04, palette from 08-04, verdict-modal-footer from 08-05) funnel through openAIDebug(slug) — one function for prompt assembly + disclosure gate + AIStreamModal open."
    - "Close-then-fire callback ordering for modal-spawning callbacks (T-08-05-T-stack mitigation): when a modal-layer callback opens a NEW modal, the closing modal must be torn down BEFORE the new modal opens so the OS-level focus + z-index stack stays clean. REVERSED from clipboard-side callbacks (onCopyFailingInput fires-then-closes because the clipboard write must happen while the user-gesture context is alive)."
    - "Defensive gating on optional callback wiring: the renderer + Modal layer BOTH gate on truthy `onOpenAIDebug` (renderer skips button render; Modal forwards `undefined` not lambda when arg is missing) so the conditional union + the surface-wiring boundary are double-locked. T-08-05-D-callback-undef mitigation."

key-files:
  created:
    - tests/solve/VerdictModal.aiDebugButton.test.ts
  modified:
    - src/solve/verdictModalRenderer.ts
    - src/solve/VerdictModal.ts
    - src/main.ts

key-decisions:
  - "Surface 3 (RunModal) COLLAPSES into Surface 2 (VerdictModal). RunModal renders ZERO failure UI — it's a pre-judge tab/textarea/Run-button shell only. All Run-mode failures (and Submit-mode failures) route through VerdictModal.renderVerdict, which is rendered by the SAME verdictModalRenderer.ts. Wiring main.ts's runInterpretedInput VerdictModal site is sufficient — RunModal stays untouched."
  - "Both Submit AND Run paths get the AI Debug button via the same renderer. The verdictModalRenderer's `renderSubmitVerdict` is the only function that emits the conditional union; the Run path's `renderRunResult` doesn't render the button (Run-side aggregate verdicts are typically Accepted-or-failed-test-case-aggregate; if user wants AI on a failing Run, the Submit + WA flow is the canonical entry). The Run-mode error block (renderRunErrorBlock for compile/runtime errors during Run) does NOT carry the button either — these are syntactic errors fixable in seconds, not algorithmic failures."
  - "Defensive double-gate: renderer uses `if (showAIDebugButton && onOpenAIDebug)`; Modal layer forwards `undefined` (not a lambda) when args.onOpenAIDebug is missing. This means a future caller that forgets to wire `onOpenAIDebug` (e.g. test fixtures from prior phases) will see NO button — the system fails closed. Same posture as Plan 08-04's defensive gates on disclosureCopy/getActiveAIProvider."
  - "Close-then-fire (REVERSED from onCopyFailingInput): close() runs synchronously before the user callback fires. Tests assert the order via a shared closeOrder array. This is a load-bearing invariant — if a future refactor swaps the order, the user will see AIStreamModal flicker as it stacks on top of the verdict modal that's just starting to close (T-08-05-T-stack)."

patterns-established:
  - "Conditional renderer-arg pattern: optional callback fields on the args type that BOTH (a) gate the conditional render block in the pure renderer AND (b) carry the actual click handler. Renderer + Modal layer share responsibility: the renderer never renders without a callback; the Modal layer never forwards a lambda without a backing arg. Both layers fail closed."
  - "DOM order locked by render-block sequence: [Copy failing?][Copy error?][AI: Debug?][Close]. Close stays the LAST child via 'Close button always appended last' rule. Tests assert footer.children indices match this exact order — guards against accidental refactor that re-orders the conditional blocks."

requirements-completed: [AIDBG-01]

# Metrics
duration: 6min
completed: 2026-05-16
---

# Phase 08 Plan 05: Verdict Modal AI Debug Button Summary

**The 3rd AI Debug surface ships — a conditional `AI: Debug` button in the verdict modal footer for non-Accepted verdicts (`kind ∈ {wa, tle, mle, re, ce}`), wired through `LeetCodePlugin.openAIDebug(slug)` (the same single entrypoint as the fence-row + palette surfaces from Plan 08-04). AIDBG-01 user-visible end-to-end.**

## Surface 3 Outcome — RunModal COLLAPSES into Surface 2

**RunModal does NOT render failure UI.** Read end-to-end (lines 70-156 + 158-172) — it is a pre-judge shell only:

- `onOpen` paints tabs + textarea + footer with Reset + Run buttons.
- `onClose` syncs in-memory tab state via `store.setTabs`.
- The Run button calls `args.onRun(joinedInput)` then immediately `this.close()`.
- ZERO calls to `renderVerdict`, `classifyStatus`, or any failure-rendering primitive.

The orchestrator-side dispatch (`main.ts:1349` `runFromActive`, `main.ts:1507` `openRunModalWithSeedAppended`, `main.ts:1523` `runInterpretedInput`) shows the Run path's failure flow:

1. `runFromActive` opens `new RunModal(...)` with an `onRun` callback that calls `runInterpretedInput`.
2. `runInterpretedInput` opens `new VerdictModal(this.app, { ... })` at `main.ts:1549`, calls `interpretSolution + pollSubmission`, and routes the response through `modal.renderVerdict(terminal as RunCheckResponse, ctx.title, { metaData, joinedDataInput })` at `main.ts:1589`.

Grep evidence:

```
$ grep -rn "renderRunVerdict\|renderRunResult" src/solve/ src/main.ts
src/solve/verdictModalRenderer.ts:50  // work; renderRunResult uses the raw-dump fallback when both are absent.
src/solve/verdictModalRenderer.ts:84      renderRunResult(
src/solve/verdictModalRenderer.ts:127 function renderRunResult(
# zero hits in main.ts — main.ts NEVER calls renderRunResult directly; it goes through VerdictModal.renderVerdict.

$ grep -rn "new VerdictModal\|new RunModal" src/
src/main.ts:1200:    const modal = new VerdictModal(this.app, { ... })   ← submitFromActive
src/main.ts:1349:    new RunModal(this.app, { ... })                     ← runFromActive (input-collection only)
src/main.ts:1507:    new RunModal(this.app, { ... })                     ← openRunModalWithSeedAppended (input-collection only)
src/main.ts:1549:    const modal = new VerdictModal(this.app, { ... })   ← runInterpretedInput (failure rendering)
```

**Conclusion:** Wiring the `onOpenAIDebug` callback at the TWO `new VerdictModal(...)` construction sites (lines 1200, 1549) covers BOTH Submit AND Run failure paths. RunModal stays untouched. No `tests/solve/RunModal.aiDebugButton.test.ts` is needed.

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-16T05:14:48Z
- **Completed:** 2026-05-16T05:21:07Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3 source + 1 new test
- **Commits:** 2 (test commit + feat commit)

## Accomplishments

- Added `onOpenAIDebug?` to `RenderVerdictArgs` in `src/solve/verdictModalRenderer.ts` (line 47-54) and threaded the arg through `renderSubmitVerdict`.
- Inserted the conditional AI Debug button block in `renderSubmitVerdict`'s footer between the Copy-failing/Copy-error block and the Close button. Locked visibility union: `kind === 'wa' || kind === 'tle' || kind === 'mle' || kind === 're' || kind === 'ce'`. Verbatim label: `AI: Debug`. Neutral class `leetcode-ai-debug-action` (NO `.mod-cta` per UI-SPEC §Color).
- Added `onOpenAIDebug?` to `VerdictModalArgs` (line 27-39 of `src/solve/VerdictModal.ts`) — optional, backward compatible with all existing tests/test fixtures that don't supply it.
- Wired close-then-fire lambda in `VerdictModal.renderVerdict()` — `this.close()` runs FIRST, then `this.args.onOpenAIDebug?.()` fires (REVERSED from `onCopyFailingInput`). Lambda is only forwarded to the renderer when `this.args.onOpenAIDebug` is truthy — preserves the defensive double-gate.
- Wired `onOpenAIDebug: () => void this.openAIDebug(ctx.slug)` at BOTH `new VerdictModal(...)` construction sites in `src/main.ts` (lines 1200-1213 `submitFromActive` AND lines 1549-1562 `runInterpretedInput`). Both Submit AND Run failure paths now surface the button.
- Added 21 test cases in `tests/solve/VerdictModal.aiDebugButton.test.ts` covering visibility union (5 PRESENT, 5 ABSENT), defensive callback-undefined guard, click semantics (WA + CE), DOM-order assertions, color contract (no `.mod-cta`), co-existence guards (Copy buttons still work), and 3 VerdictModal close-then-fire ordering tests.

## Task Commits

1. **RED — failing tests for AI Debug button** — `b59112a` (test)
2. **GREEN — wire AI Debug button into verdict modal footer** — `32bed1e` (feat)

**Plan metadata:** _(committed in the final docs commit at the end of this summary)_

## Files Created/Modified

- **`src/solve/verdictModalRenderer.ts`** (modified) — Added `onOpenAIDebug?: () => void` to `RenderVerdictArgs` (line 47-54). Threaded arg through `renderSubmitVerdict` signature (line 434). Inserted conditional button block (line 522-534) BEFORE the Close button block. Visibility union LOCKED at line 527.
- **`src/solve/VerdictModal.ts`** (modified) — Added `onOpenAIDebug?: () => void` to `VerdictModalArgs` (line 33-37). Wired close-then-fire lambda in `renderVerdict()` (line 124-138). Lambda is conditional on `this.args.onOpenAIDebug` truthiness (defensive double-gate).
- **`src/main.ts`** (modified) — Added `onOpenAIDebug: () => { void this.openAIDebug(ctx.slug); }` at line 1212 (`submitFromActive`) and line 1567 (`runInterpretedInput`). Both VerdictModal construction sites now wire the same single `openAIDebug(slug)` entrypoint.
- **`tests/solve/VerdictModal.aiDebugButton.test.ts`** (NEW) — 21 cases: 10 visibility-union (5 PRESENT for wa/mle/tle/re/ce + 5 ABSENT for ac/ole/ie/unknown-lc/unknown), 1 defensive callback-undefined guard, 2 click-semantics (WA + CE), 2 DOM-order, 1 color (no mod-cta), 2 co-existence (Copy failing + Copy error), 3 VerdictModal close-then-fire ordering.

## Decisions Made

- **Surface 3 (RunModal) collapses into Surface 2 (VerdictModal)** — Read RunModal.ts end-to-end; it's a pre-judge input shell only. All failure rendering goes through `VerdictModal.renderVerdict`. Wiring the callback at the two existing VerdictModal construction sites (one for Submit, one for Run) covers all failure paths. RunModal stays untouched.
- **Defensive double-gate on optional callback** — Both the renderer (`if (showAIDebugButton && onOpenAIDebug)`) and the Modal layer (`this.args.onOpenAIDebug ? () => { ... } : undefined`) gate on callback truthiness. The renderer never paints a no-op button; the Modal layer never forwards a lambda without a backing arg. Same fail-closed posture as Plan 08-04's `disclosureCopy` + `getActiveAIProvider` gates.
- **Close-then-fire ordering REVERSED from onCopyFailingInput** — `onCopyFailingInput` fires-then-closes because the clipboard write needs the user-gesture context alive. `onOpenAIDebug` closes-then-fires because it opens a NEW modal that must not stack on top of the closing one (T-08-05-T-stack mitigation). Tests assert the order via a shared `closeOrder` array.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug fix] Defensive lambda gating in VerdictModal**

- **Found during:** TDD GREEN — test "VerdictModalArgs.onOpenAIDebug is optional (backward compat)" failed because the always-passed lambda made the renderer always render the button.
- **Issue:** The Modal layer was forwarding a lambda to the renderer unconditionally (`onOpenAIDebug: () => { this.close(); this.args.onOpenAIDebug?.(); }`). Even though the lambda body would no-op when args.onOpenAIDebug was undefined, the lambda itself was truthy, so the renderer's `if (showAIDebugButton && onOpenAIDebug)` gate let the button paint. The button would visually appear but click-no-op — confusing UX.
- **Fix:** Made the lambda forwarding conditional: `onOpenAIDebug: this.args.onOpenAIDebug ? () => { this.close(); this.args.onOpenAIDebug?.(); } : undefined`. Now the renderer's gate suppresses the button entirely when args.onOpenAIDebug is absent. Defensive double-gate preserved.
- **Files modified:** `src/solve/VerdictModal.ts` (line 124-138).
- **Verification:** `npx vitest run tests/solve/VerdictModal.aiDebugButton.test.ts` — 21/21 pass including the backward-compat test.
- **Committed in:** `32bed1e` (Task 1 GREEN commit).

**2. [Rule 1 — Bug fix] Test fixture `state` literal narrowing**

- **Found during:** TDD GREEN — TypeScript errors `Type 'string' is not assignable to type '"SUCCESS"'` on the 3 VerdictModal close-then-fire test cases.
- **Issue:** The test fixtures used `state: 'SUCCESS'` (inferred as `string`) but `VerdictModal.renderVerdict` requires `SubmitCheckResponse` whose `state` is the literal type `"SUCCESS"`. Without `as const`, the fixtures didn't narrow.
- **Fix:** Added `as const` to every `state: 'SUCCESS'` field on the 10 test fixtures (replace_all). This is a test-only ergonomics fix — the source code was already correct.
- **Files modified:** `tests/solve/VerdictModal.aiDebugButton.test.ts` (10 fixture declarations).
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `32bed1e` (Task 1 GREEN commit, included with implementation).

**3. [Rule 1 — Bug fix] Submit-mode `submission_id` on test fixtures**

- **Found during:** TDD GREEN — 6 tests failed because CE and RE fixtures were being routed through the Run-mode error path (`hasRunErrorPayload` returns true for CE/RE without `submission_id`, since they have empty `code_answer` + `compile_error`/`runtime_error`).
- **Issue:** `hasRunErrorPayload` (verdictModalRenderer.ts:667) sniffs Run-mode error payloads by checking for absence of `submission_id` AND empty `code_answer` AND non-empty error fields. My CE/RE Submit-mode fixtures matched all three criteria, so they were rendered as Run errors (which have no footer Copy/AI buttons). Real-world Submit responses always carry `submission_id`.
- **Fix:** Added `submission_id: '1234567890'` to all 10 Submit-mode test fixtures (replace_all). This routes them through `renderSubmitVerdict` where the AI Debug button block lives.
- **Files modified:** `tests/solve/VerdictModal.aiDebugButton.test.ts` (10 fixtures).
- **Verification:** 21/21 cases pass.
- **Committed in:** `32bed1e` (Task 1 GREEN commit).

---

**Total deviations:** 3 auto-fixed (3 bug fixes — none scope creep, all necessary to satisfy plan invariants and test contracts).

**Impact on plan:** All deviations were necessary to satisfy the plan's locked invariants (defensive double-gate, close-then-fire, visibility union). No scope creep. All within Rule 1 (bug fix) — no architectural changes.

## Issues Encountered

- 2 pre-existing `no-useless-escape` lint errors in `src/shared/logger.ts:70` (already documented in `.planning/phases/08-ai-debug/deferred-items.md` per Plan 08-04 SUMMARY). NOT fixed in this plan — out of scope per executor scope-boundary rule.

## Verification

- `npx tsc --noEmit` exits 0 (no TypeScript errors).
- `npx vitest run tests/solve/VerdictModal.aiDebugButton.test.ts` → 21/21 pass.
- `npx vitest run tests/solve/` → 287 passed, 1 skipped (pre-existing). All Phase 3/5/5.4 verdict-modal tests stay green.
- `npx vitest run` (full suite) → 1065 passed, 3 skipped (pre-existing). Zero regressions.
- `tests/ai/lc-isolation.test.ts` continues to pass (no `obsidianFetch` imports added under `src/solve/`).
- `npm run lint` clean of NEW errors (2 pre-existing `src/shared/logger.ts` errors remain — logged in deferred-items.md by Plan 08-04).
- `npm run check:bundle-size` → `main.js: 986.4 KB` (well under 1.2 MB ceiling; under 1 MB even).

## Bundle Size Delta

- Plan 08-05 added: 1 button block in renderer (~280 bytes), 1 callback field on RenderVerdictArgs interface (~80 bytes), 1 callback field on VerdictModalArgs interface + 1 wired lambda (~180 bytes), 2 callback wirings in main.ts (~160 bytes total).
- Total source delta: ~700 bytes; bundle delta after esbuild minify + tree-shake: well under 0.5 KB.
- Pre-Plan-08-05 (Plan 08-04): 986.4 KB.
- Post-Plan-08-05: 986.4 KB (same — within tree-shake/minify rounding).

## All 3 AI Debug Surfaces Now Operational

- **Surface 1 (fence-row, Plan 08-04):** Edit Mode CM6 widget AND Reading Mode post-processor. Inherits AI Debug button via shared `buildCodeBlockButtonRow` factory. Click → `aiDebugFromActive()` → `openAIDebug(slug)`.
- **Surface 2 (palette command, Plan 08-04):** `ai-debug` command with `editorCheckCallback` frontmatter guard. Click in palette → `openAIDebug(slug)`.
- **Surface 3 (verdict modal footer, Plan 08-05):** Conditional `AI: Debug` button in verdict modal footer for `kind ∈ {wa, tle, mle, re, ce}`. Click → close modal → `openAIDebug(slug)`. Both Submit AND Run failure paths covered.

All 3 surfaces funnel through the SAME `LeetCodePlugin.openAIDebug(slug)` entrypoint — single source of truth for prompt assembly + disclosure gate + AIStreamModal open (T-08-05-T-host single-host invariant).

## User Setup Required

None — Plan 08-05 ships only the verdict-modal-footer entrypoint. The disclosure modal, provider configuration, and AI Debug single entrypoint were already wired by Phase 07 + Plan 08-04.

## Manual UAT Smoke (Operator Will Run at Phase Closeout)

Phase 08 closeout protocol (operator runs after Plan 08-05 lands):

1. Submit a wrong solution to a LeetCode problem.
2. Verdict modal opens → WA verdict renders with [Copy failing testcase][AI: Debug][Close] footer.
3. Click "AI: Debug" → verdict modal closes → AIStreamModal opens.
4. Disclosure modal fires (or skips if already acknowledged) → response streams.

(This Plan 08-05 commit is autonomous — operator UAT smoke is the manual confirmation step recorded in the phase closeout, not gated within this plan.)

## Phase 08 AIDBG-01 Status

**SHIPS.** All 3 AI Debug surfaces are user-visible. The user can now invoke AI Debug from:

- The fence-row `AI: Debug` button (Edit Mode + Reading Mode)
- The `ai-debug` command palette entry (`AI: Debug current code`)
- The verdict modal footer (after a non-Accepted Submit or Run failure)

All 3 surfaces share the same `openAIDebug(slug)` entrypoint, the same disclosure gate, the same prompt assembly. AIDBG-01 is complete pending final UAT smoke at phase closeout.

---
*Phase: 08-ai-debug*
*Completed: 2026-05-16*

## Self-Check: PASSED

- Created `tests/solve/VerdictModal.aiDebugButton.test.ts` — FOUND.
- Modified `src/solve/verdictModalRenderer.ts` — FOUND (onOpenAIDebug field, conditional union, button block).
- Modified `src/solve/VerdictModal.ts` — FOUND (VerdictModalArgs.onOpenAIDebug, close-then-fire lambda).
- Modified `src/main.ts` — FOUND (onOpenAIDebug wiring at 2 VerdictModal construction sites).
- Commit `b59112a` (RED test) — FOUND in `git log`.
- Commit `32bed1e` (GREEN feat) — FOUND in `git log`.
