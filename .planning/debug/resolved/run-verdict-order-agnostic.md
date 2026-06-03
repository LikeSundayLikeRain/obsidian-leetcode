---
slug: run-verdict-order-agnostic
status: root-cause-found
trigger: "Run verdict reports failure for problems where the answer order doesn't matter (e.g., Two Sum — returning [1,0] instead of [0,1]). The LeetCode website accepts both orders fine, but our plugin's run verdict fails if the order doesn't match."
created: 2026-06-02
updated: 2026-06-02
---

# Debug: run-verdict-order-agnostic

## Symptoms

- **Expected behavior:** Running solution with `[1,0]` for Two Sum should be accepted as correct (LC web UI accepts it; the problem statement says "you may return the answer in any order").
- **Actual behavior:** Plugin's run verdict reports failure / wrong answer when output order doesn't match the expected output exactly.
- **Error messages:** Verdict UI shows failure (mismatch) instead of pass.
- **Timeline:** Long-standing — present since Phase 5.4 D-04 introduced strict trim-compare per-case mask.
- **Reproduction:** Two Sum, solution returned `[1,0]` instead of `[0,1]`. Local plugin verdict failed; LC website accepts the same output.

## Initial Hypothesis (user-provided)

User suspects the plugin is doing **local string equality** on the run/`interpret_solution` response (comparing our `code_answer` field against `expected_code_answer` ourselves) instead of **trusting LC's authoritative verdict** (e.g., `correct_answer: true` / `status_msg: "Accepted"`).

**Confirmed.** See Evidence below.

## Current Focus

- **hypothesis:** Run-verdict logic computes pass/fail by string-comparing our output against expected output locally, instead of using LC's `correct_answer` boolean.
- **status:** CONFIRMED.

## Evidence

- timestamp: 2026-06-02
  finding: |
    `src/solve/verdictModalRenderer.ts:184-196` (renderRunResult — Run path verdict computation):

    ```ts
    // ── Step 3: per-case pass mask (D-04 strict trim-compare) ──────────────
    const outputs = splitOutput(res.code_answer, arity);
    const expected = splitOutput(res.expected_code_answer, arity);
    const passMask: Array<boolean | null> = [];
    for (let i = 0; i < arity; i++) {
      const exp = expected[i] ?? '';
      const out = outputs[i] ?? '';
      if (exp.length === 0) {
        passMask.push(null);
      } else {
        passMask.push(out.trim() === exp.trim());      // <-- LOCAL STRING COMPARE
      }
    }

    // ── Step 4: aggregate verdict ──────────────────────────────────────────
    const aggregatePass = passMask.every((m) => m !== false);
    ```

    The renderer ignores LC's authoritative `correct_answer: boolean` and `status_code` (10 = Accepted) on the Run path entirely. The verdict ("Accepted" vs "Wrong Answer") is decided client-side by `aggregatePass`, which is built from per-case `out.trim() === exp.trim()` comparisons.
- timestamp: 2026-06-02
  finding: |
    `src/solve/types.ts:81` declares `correct_answer?: boolean` on `RunCheckResponse` — the field is wired in the type but never read in the renderer. Tests (`tests/solve/verdictModalRenderer.test.ts:223-251`) explicitly assert the local-compare behavior under the comment `D-04: per-case PASS/FAIL chip when code_answer[i].trim() === expected_code_answer[i].trim()` — so the bug was tested-in, not an oversight.
- timestamp: 2026-06-02
  finding: |
    `src/solve/pollingOrchestrator.ts:206-216` and `src/solve/leetcodeRest.ts:170-182` faithfully pass the LC poll body through to the renderer — they do not strip `correct_answer`. The full payload (including `correct_answer` and `compare_result`) is available at the renderer.
- timestamp: 2026-06-02
  finding: |
    Live fixture at `tests/solve/fixtures/run-multi-case.json` confirms LC ships both authoritative signals on every Run response:
      - `correct_answer: true` (overall verdict)
      - `compare_result: "111"` (per-case bitmask — '1' = pass, '0' = fail)
      - `status_code: 10` / `status_msg: "Accepted"`
    The compare_result string is the per-case authoritative mask LC's web UI uses.
- timestamp: 2026-06-02
  finding: |
    Order-agnostic problems (Two Sum's "you may return the answer in any order", subset-sum permutations, etc.) are precisely the case where the local trim-compare diverges from LC's judge. LC's judge applies problem-specific normalization (sort, set-equality, etc.) that the plugin has no way to replicate locally without per-problem judge metadata.
- timestamp: 2026-06-02
  finding: |
    Submit path is unaffected — `submissionOrchestrator.ts:397-432` correctly classifies the submit verdict via `classifyStatus(status_code)` and routes to `renderSubmitVerdict`, which decides AC/WA from LC's `status_code` (10 = AC). The bug is Run-path-only.

## Eliminated

- Cookie / headers / referer issues (response payload reaches the renderer correctly)
- Polling races (full terminal payload makes it to the renderer; `compare_result` and `correct_answer` are present)
- Submit path — uses LC's `status_code` via `classifyStatus`, not local compare

## Root Cause

`renderRunResult` in `src/solve/verdictModalRenderer.ts` decides Run-path PASS/FAIL by client-side `out.trim() === exp.trim()` per case (lines 184-196). It ignores LC's authoritative `correct_answer: boolean` and `compare_result: "<bitmask>"` fields. For order-agnostic problems where LC's judge applies non-trivial normalization (e.g., Two Sum: index pair valid in either order), the local trim-compare produces false-negative "Wrong Answer" verdicts even though LC reports `correct_answer: true` / `status_code: 10` / `compare_result: "111…"`.

**Why it shipped:** Phase 5.4 Plan 05 D-04 introduced the per-case PASS/FAIL chip strip with a deliberately strict trim-compare. The implicit assumption was that LC's `expected_code_answer[i]` would always equal a correct user output exactly — true for problems with a unique canonical answer, false for any problem with order-agnostic / set-equivalent / float-tolerant judging.

## Resolution

### Recommended fix (preserving LC as source of truth)

In `src/solve/verdictModalRenderer.ts:renderRunResult`, replace the local trim-compare with LC's authoritative signals, in priority order:

1. **Per-case mask (`compare_result`)** — LC's `"<bitmask>"` string. Each character is `'1'` (pass) or `'0'` (fail). When present, this is the per-case source of truth.
2. **Aggregate (`correct_answer`)** — LC's overall boolean. When `compare_result` is absent (custom-input run, single-case), use `correct_answer` to set the aggregate verdict; per-case chips degrade to `null` (no chip) when expected is empty, and otherwise to the aggregate.
3. **Local trim-compare** — kept ONLY as a last-resort fallback when neither `compare_result` nor `correct_answer` is present (defensive — should never fire on a real LC response).

Sketch:

```ts
// Step 3: per-case pass mask, LC-authoritative
const compareResult = typeof res.compare_result === 'string' ? res.compare_result : '';
const correctAnswer = typeof res.correct_answer === 'boolean' ? res.correct_answer : undefined;

const passMask: Array<boolean | null> = [];
for (let i = 0; i < arity; i++) {
  const exp = expected[i] ?? '';
  const out = outputs[i] ?? '';
  // Custom-input run: no expected available -> no chip.
  if (exp.length === 0) {
    passMask.push(null);
    continue;
  }
  // Source of truth #1: LC's per-case bitmask.
  if (compareResult.length > i) {
    passMask.push(compareResult[i] === '1');
    continue;
  }
  // Source of truth #2: LC's aggregate boolean (broadcast to all cases).
  if (correctAnswer !== undefined) {
    passMask.push(correctAnswer);
    continue;
  }
  // Fallback: local trim-compare (defensive — should not fire on real LC responses).
  passMask.push(out.trim() === exp.trim());
}

// Step 4: aggregate verdict
const aggregatePass = correctAnswer !== undefined
  ? correctAnswer
  : passMask.every((m) => m !== false);
```

### Test impact

- `tests/solve/verdictModalRenderer.test.ts:223-251` — the two D-04 tests (`per-case PASS chip when code_answer[i].trim() === expected_code_answer[i].trim()` and `per-case FAIL chip when outputs differ`) are still valid because the existing fixtures have `correct_answer` / `compare_result` aligned with their string-compare outcomes. They'll pass unchanged.
- Add a NEW test: synthesize an order-agnostic case where `code_answer = ['[1,0]']`, `expected_code_answer = ['[0,1]']`, `correct_answer: true`, `compare_result: '1'`, `status_code: 10` — assert the renderer produces a PASS chip (regression guard for this bug).

### Specialist hint

specialist_hint: typescript

## Status

Root cause confirmed; fix scoped to a single function in one file (`src/solve/verdictModalRenderer.ts:renderRunResult`). Awaiting user choice between immediate fix, planned fix, or manual fix.
