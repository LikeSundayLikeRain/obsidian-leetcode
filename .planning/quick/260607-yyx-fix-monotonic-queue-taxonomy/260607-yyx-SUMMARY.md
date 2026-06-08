---
phase: quick-260607-yyx
plan: 01
status: complete
date: 2026-06-07
---

# 260607-yyx — Fix Monotonic Queue / Monotonic Stack misclassification

## Bug

LC 239 ("Sliding Window Maximum") in user's vault was auto-categorized with `lc-pattern: [Monotonic Stack, Sliding Window]` instead of the correct **Monotonic Queue** primary technique. The AI Review body itself correctly identified "monotonic decreasing **deque** of indices" — proving the model understood the algorithm but the seed taxonomy fed to the prompt didn't include "Monotonic Queue" as a distinct option.

Same bug affects every deque-based sliding-window problem: LC 239, LC 862 (Shortest Subarray with Sum at Least K), LC 1438 (Longest Continuous Subarray), LC 1696 (Jump Game VI), LC 2398 (Maximum Number of Robots), and any future deque problems.

## Root cause

`SEED_PATTERNS` in `src/graph/patternTaxonomy.ts:20-70` contained 39 patterns including `'Monotonic Stack'` but **no `'Monotonic Queue'`**. The classification prompt in `src/graph/buildKgPrompt.ts` lists the seed patterns under "Known patterns:" and rule 2 says "Be SPECIFIC over generic. When a more specific pattern exists, use it instead of a broad category." Even though rule 4 permits inventing new pattern names, the LLM's strong prior is to choose from the explicit allowlist when something is approximately close — and "Monotonic Stack" is the nearest match for any monotonic-deque solution.

## Fix

| File | Change |
|---|---|
| `src/graph/patternTaxonomy.ts:27` | Inserted `'Monotonic Queue',` immediately after `'Monotonic Stack'` under "Core data structures". `SEED_PATTERNS.length` is now 40. |
| `src/graph/buildKgPrompt.ts:46` | New rule **2a** explicitly disambiguating Monotonic Queue (deque; sliding-window min/max; LC 239/862/1438/1696/2398) from Monotonic Stack (LIFO; next-greater / previous-smaller / largest-rectangle; LC 496/84/739). Also clarifies that for deque-based sliding-window problems the primary pattern is Monotonic Queue and "Sliding Window" is supporting scaffolding. |
| `tests/graph/buildKgPrompt.test.ts:25` | Updated `expect(SEED_PATTERNS).toHaveLength(39)` → `40`. |
| `tests/graph/buildKgPrompt.test.ts` | New regression test: asserts the prompt contains both `'- Monotonic Queue'` and `'- Monotonic Stack'`, matches `/deque/i`, and contains `'LC 239'` so a future prompt edit can't silently drop the disambiguation rule. |

## Existing-note handling — re-classification command does NOT exist

`PatternClusterEngine.onAccepted` (`src/graph/PatternClusterEngine.ts:148-169`) has a persistence check: when `lc-pattern` is already set on a file, classification is **skipped**. This means the user's existing 239 note (and any other already-misclassified notes) will NOT auto-correct after this fix. There is no `Reclassify pattern` command in `main.ts` (verified via `grep -rn "Reclassify\|recategorize" src/` → zero matches).

**User remediation for the 239 note:** delete the `lc-pattern` lines from the frontmatter, then re-submit an Accepted solution. On the next AC, the engine will re-run with the new taxonomy + prompt rules.

**Suggested follow-up (out of scope here):** add a "LeetCode: Reclassify pattern for active note" palette command that clears `lc-pattern` from frontmatter and invokes `patternClusterEngine.onAccepted(...)` directly using the cached problemHtml + the fenced code body. Would let users re-categorize without re-submitting. Roughly 15–25 LOC in `main.ts` + a focused test.

## Verification

| Gate | Result |
|---|---|
| `npm test -- tests/graph/buildKgPrompt.test.ts tests/graph/parseKgResponse.test.ts tests/graph/patternClusterEngine.test.ts` | 31 passed |
| `npm test` (full) | 243 files / 2874 tests passed, 7 skipped, **0 failed** (note: an earlier run had 5 flaky pre-existing failures in `ProblemPreviewView` shift-cli tests unrelated to this change; second run was clean) |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | 0 errors / 10 pre-existing warnings (unused `eslint-disable no-console` comments in `src/main.ts` — pre-existing baseline) |
| `npm run build` | Succeeds |

## Files changed

- `src/graph/patternTaxonomy.ts` (+1 line)
- `src/graph/buildKgPrompt.ts` (+1 line)
- `tests/graph/buildKgPrompt.test.ts` (+15 lines: count update + new regression test)
- `.planning/debug/ai-pattern-monotonic-queue-misclassification.md` (new — debug session record)
- `.planning/quick/260607-yyx-fix-monotonic-queue-taxonomy/260607-yyx-PLAN.md` (new — quick task plan)
- `.planning/quick/260607-yyx-fix-monotonic-queue-taxonomy/260607-yyx-SUMMARY.md` (this file)
