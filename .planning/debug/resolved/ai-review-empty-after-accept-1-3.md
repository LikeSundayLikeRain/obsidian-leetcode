---
slug: ai-review-empty-after-accept-1-3
status: resolved
trigger: |
  AI review after Accept (auto-review on AC) returns "The submitted solution is empty — there is no code to review. Please paste the actual Java implementation." Regression introduced by the v1.3 inline-widget architecture (post-Phase 22 / 1.3.0-beta.1). Submit succeeds (verdict shows Accepted), but the auto-AI-review prompt sees empty code.
created: 2026-06-04T17:40:34Z
updated: 2026-06-04T17:55:00Z
---

# Debug Session: ai-review-empty-after-accept-1-3

## Symptoms

- **Expected behavior:** After clicking Submit on a Java solution from the inline widget and getting "Accepted!", the auto AI Review stream should review the actual Java code that was just submitted.
- **Actual behavior:** The AI replies with "The submitted solution is empty — there is no code to review. Please paste the actual Java implementation." (model is reading an empty `code` field in the prompt).
- **Error messages:** None thrown — the bug is silent: an empty string is sent to the AI as the user's solution.
- **Timeline:** Started after the v1.3 inline-widget architecture landed (Phase 22 / PR #10, 1.3.0-beta.1). Did not occur on v1.2.x (legacy MarkdownView submit path).
- **Reproduction:** Open a Java problem note with the inline widget, type a working solution, click Submit (or use the fence-row Submit button), wait for "Accepted!", observe the AI Review stream below the Accepted banner.

## Current Focus

```yaml
hypothesis: |
  startAutoReview's `extractFirstFencedBlock(snapshotBody)` is being called with the
  WIDGET'S RAW CODE STRING (not a markdown body containing a fenced ```leetcode-solve
  block). Widget callers pass `currentBody: () => widget.view.state.doc.toString()`
  — that returns the raw Java source, no ``` fences. extractFirstFencedBlock walks
  the lines looking for ``` openers, finds none, returns null, so `code = ''` and
  the prompt is built with an empty solution.

  Why Submit still works: submitFromWidget passes a SEPARATE `getCurrentCode`
  shortcut to submitWithCode (main.ts:3085), and the orchestrator skips
  extractFirstFencedBlock when getCurrentCode is supplied (Phase 20 Plan 20-10
  Task 5 / gap-closure T7). startAutoReview has NO equivalent shortcut — it
  always re-extracts via the markdown-body codepath, which is broken when the
  caller's `currentBody` returns raw widget code instead of the full note body.
test: |
  Source-grep regression test pins the new shortcut wiring contract
  (tests/ai/widgetAutoReviewRegression.test.ts) so a future refactor cannot
  silently regress the fix.
expecting: |
  After fix: ctx.getCurrentCode() returns raw Java; widget branch in
  startAutoReview takes the raw code directly + resolves language from
  ctx.lcLanguage (lc-language frontmatter SSoT). Prompt receives full code.
next_action: |
  RESOLVED — see Resolution below.
```

## Suspected Files

- src/main.ts:2580-2619 — `startAutoReview` calls `extractFirstFencedBlock(snapshotBody)`. **(FIXED)**
- src/main.ts:3041 — `widgetCtxResolver` returns `currentBody: () => widget.view.state.doc.toString()` (raw code, not markdown body). Unchanged — the value the orchestrator passes through `getCurrentBody` is now bypassed on the review side.
- src/main.ts:3084 — `submitFromWidget` passes `() => widget.view.state.doc.toString()` as `getCurrentBody` into `submitWithCode`. Unchanged.
- src/main.ts:3292, 3312 — `submitWithCode` builds `reviewCtx` and hands it to `startAutoReview`. **(FIXED — now propagates `getCurrentCode` + `lcLanguage`.)**
- src/main.ts:3274-3284 — `submitWithCode`'s asymmetric `getCurrentCode` shortcut. **(FIXED — symmetry restored on review path.)**
- src/solve/codeExtractor.ts:90 — `extractFirstFencedBlock` returns null when no ``` opener is found. Unchanged — still the contract for the legacy active-leaf path.

## Evidence

- timestamp: 2026-06-04T17:40:34Z
  finding: |
    Submit-from-widget path passes raw widget code as `getCurrentBody`
    (main.ts:3084: `() => widget.view.state.doc.toString()`). The same callable
    is then re-used as `currentBody` inside the synthetic `reviewCtx`
    (main.ts:3292), which `startAutoReview` snapshots and feeds to
    `extractFirstFencedBlock` (main.ts:2614-2618). The widget doc has no ```
    fence markers — only raw Java source — so the extractor returns null and
    `code = ''` (main.ts:2619). The prompt is then built with an empty solution
    (main.ts:2623), explaining the AI's "submitted solution is empty" reply.
- timestamp: 2026-06-04T17:40:34Z
  finding: |
    Submit succeeds because `submitFromWidget` (main.ts:3079-3086) supplies the
    optional `getCurrentCode` parameter — the orchestrator (Phase 20 Plan 20-10
    Task 5) skips extractFirstFencedBlock when `getCurrentCode` is present. No
    equivalent shortcut exists on the review path: `startAutoReview` only
    accepts `currentBody` and unconditionally calls `extractFirstFencedBlock`.
    This is the asymmetry that masks the regression — Submit works, AI review
    silently sends empty code.
- timestamp: 2026-06-04T17:55:00Z
  finding: |
    Hypothesis confirmed by full call-chain read of
    src/main.ts (startAutoReview at L2580, submitWithCode at L3274,
    submitFromWidget at L3052, getActiveProblemContext at L2156). The legacy
    active-leaf path (`submitFromActive` → `getActiveProblemContext`) supplies
    `currentBody: () => view.editor.getValue()` — full markdown body, fences
    intact — so extraction still works there. Only the widget submit path
    delivers raw code as `currentBody`, breaking the review path.

## Eliminated

- (none — single-cause bug, hypothesis confirmed on first read.)

## Resolution

```yaml
root_cause: |
  Asymmetric shortcut: `submitFromWidget` (main.ts:3079-3086) supplied
  `getCurrentCode = () => widget.view.state.doc.toString()` to the
  SubmissionOrchestrator (Phase 20 Plan 20-10 Task 5 / gap-closure T7), which
  bypasses `extractFirstFencedBlock` and uses the raw fence body directly.
  The same thunk was reused as `currentBody` for the review path's
  synthetic reviewCtx, but `startAutoReview` had no equivalent shortcut —
  it unconditionally called `extractFirstFencedBlock(snapshotBody)`. The
  widget doc has no ``` markers, so extraction returned null, `code = ''`,
  and `buildReviewPrompt` produced a prompt with an empty solution body —
  the AI replied "submitted solution is empty".

fix: |
  Threaded an optional `getCurrentCode` (+ companion `lcLanguage`) into
  `startAutoReview`'s ctx parameter and added a symmetric branch that
  bypasses `extractFirstFencedBlock` when the widget shortcut is supplied.
  Propagated both fields through `submitWithCode`'s `reviewCtx` literal via
  conditional spread (mirrors the orchestrator's posture). Legacy
  `submitFromActive` callers omit the shortcut and fall through to the
  preserved markdown-body extractor branch — Phase 21 Plan 21-03 Task 2
  frontmatter threading is intact on that branch. Fix scope: src/main.ts
  only (two anchor edits).

regression_test: |
  tests/ai/widgetAutoReviewRegression.test.ts — 7 source-grep gates pinning
  the contract:
    1. startAutoReview ctx accepts getCurrentCode + lcLanguage
    2. snapshotCode is captured alongside snapshotBody (sync — pre-async)
    3. The ctx.getCurrentCode !== undefined branch + else-branch with
       extractFirstFencedBlock both exist (so legacy path is preserved)
    4. Widget branch resolves language from ctx.lcLanguage + settings
       default fallback
    5. submitWithCode propagates getCurrentCode + lcLanguage into reviewCtx
       via conditional spread
    6. reviewCtx still includes file/slug/title/currentBody (legacy contract)
    7. submitFromWidget still hands submitWithCode two thunks reading
       widget.view.state.doc.toString() (preserves the trigger contract)

verification: |
  - npx vitest run tests/ai/widgetAutoReviewRegression.test.ts → 7/7 pass
  - npx vitest run tests/ai/buildReviewPrompt.test.ts tests/ai/rerunAIReview.test.ts
    tests/solve/submissionOrchestrator.test.ts tests/solve/codeExtractor.test.ts
    tests/solve/VerdictModal.aiDebugButton.test.ts → 70/70 pass
  - npm test -- --run → 239 files, 2839 tests pass (7 skipped, pre-existing)
  - npm run build → clean (tsc --noEmit + esbuild production both succeed)
  - npm run lint → no new issues introduced (pre-existing project-wide
    warnings/errors unchanged)

cycles: 1 investigation, 1 fix
specialist_review: typescript (skipped — fix is a 3-anchor structural change
  in the same file as the existing orchestrator-side shortcut; pattern is
  already proven by Phase 20 Plan 20-10 T7. No idiomatic improvements to
  flag — TypeScript optional-property + conditional-spread is the standard
  TS posture.)
```
