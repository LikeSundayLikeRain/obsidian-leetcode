---
slug: ai-pattern-monotonic-queue-misclassification
status: root_cause_found
trigger: 2026-06-07 user report — LC 239 in interview-prep vault tagged with `[[Monotonic Stack]]` + `[[Sliding Window]]`; correct primary technique is **Monotonic Queue**.
opened: 2026-06-07
goal: find_and_fix
specialist_hint: typescript
---

# Debug — AI pattern classification: missing "Monotonic Queue" causes deque problems to be tagged "Monotonic Stack"

## Symptoms

- LeetCode 239 ("Sliding Window Maximum") in `~/Documents/interview-prep/01-LeetCode/problem/239-sliding-window-maximum.md`.
- Frontmatter (lines 22–24):
  ```yaml
  lc-pattern:
    - Monotonic Stack
    - Sliding Window
  ```
- `## Techniques` section (lines 127–130) renders `- [[Monotonic Stack]]` + `- [[Sliding Window]]`.
- Correct categorization: **Monotonic Queue** primary, Sliding Window supporting.
- AI Review body (line 141) correctly says "monotonic decreasing **deque** of indices" — AI understands the algorithm but the tag came out wrong.
- LC's own topicTags (in `tags:` list lines 15–21) already include `lc/monotonic-queue` — so LC distinguishes the two.
- Bug is reported as a **quality issue in auto-categorization**, not a one-off prompt drift.

## Hypothesis

The 22-seed (now 39-seed) `SEED_PATTERNS` taxonomy in `src/graph/patternTaxonomy.ts` includes `'Monotonic Stack'` but does NOT include `'Monotonic Queue'`. The classification prompt in `src/graph/buildKgPrompt.ts` lists the seed patterns and says "Be SPECIFIC over generic" — the AI gravitates to the closest seed match (Monotonic Stack) instead of inventing a new "Monotonic Queue" name (rule 4 of the prompt allows new names but the LLM defaults to the listed allowlist when one is "close enough").

## Evidence

- timestamp: 2026-06-07 — `src/graph/patternTaxonomy.ts:20-70` lists 39 seed patterns. `'Monotonic Stack'` at line 27. NO entry for `'Monotonic Queue'` (verified via `grep -rln "Monotonic Queue" src/ tests/` → zero matches).
- timestamp: 2026-06-07 — `src/graph/buildKgPrompt.ts:34-46` injects the seed list into the prompt and instructs: "Be SPECIFIC over generic. When a more specific pattern exists, use it instead of a broad category." Rule 4 allows new pattern names but is a soft instruction (rules 2 + 3 push toward the allowlist).
- timestamp: 2026-06-07 — `src/graph/PatternClusterEngine.ts:148-169` persistence check: when `lc-pattern` is already set on the file, classification is **skipped** entirely. So a fix to the taxonomy does NOT auto-correct the existing 239 note — the user must manually clear `lc-pattern` from the frontmatter (or re-run on a fresh problem) to trigger re-classification.
- timestamp: 2026-06-07 — No `recategorize` / `reclassify` command exists (`grep -rn "Reclassify\|recategorize" src/` → zero matches). User has to clear frontmatter manually.
- timestamp: 2026-06-07 — `tests/graph/buildKgPrompt.test.ts:25` asserts `expect(SEED_PATTERNS).toHaveLength(39)`. Adding "Monotonic Queue" bumps to 40 — that test must update.
- timestamp: 2026-06-07 — Confirmed in vault note that LC's own `topicTags` list includes both `monotonic-queue` and `sliding-window` (`tags:` lines 15-21 of the note) — so LC's taxonomy distinguishes them.

## Root cause

`SEED_PATTERNS` in `src/graph/patternTaxonomy.ts` is missing `'Monotonic Queue'`. The AI prompt lists seed patterns as the primary allowlist; even though rule 4 permits inventing new names, the LLM's strong prior is to choose from the explicit list when something is approximately close. Monotonic Stack and Monotonic Queue are distinct techniques — they share the "monotonic" mental model but use stack semantics (LIFO; unmatched elements popped from one end) vs deque semantics (FIFO + LIFO; expire-from-front, push-from-back). Any deque-based sliding-window-style problem (LC 239, LC 862, LC 1438, LC 1696, LC 2398) will currently be misclassified as Monotonic Stack.

## Fix

1. Add `'Monotonic Queue'` to `SEED_PATTERNS` in `src/graph/patternTaxonomy.ts`. Place it adjacent to `'Monotonic Stack'` (line 27) under "Core data structures" so both monotonic variants sit together for prompt readability.
2. Strengthen the prompt classification rules in `src/graph/buildKgPrompt.ts` to flag the deque-vs-stack distinction explicitly. Add a rule item under "## Classification rules" that names the two techniques and clarifies the data-structure tell (sliding-window minimum/maximum → Monotonic Queue; next-greater-element → Monotonic Stack).
3. Update `tests/graph/buildKgPrompt.test.ts:25` to assert `toHaveLength(40)` instead of `39`.
4. Add a regression test asserting that the prompt contains `'Monotonic Queue'` and the deque-vs-stack disambiguation rule (so a future prompt edit doesn't silently regress this).
5. **Cannot retroactively fix the 239 note from code** (D-PERSIST: PatternClusterEngine skips classification when `lc-pattern` is already set). Document in SUMMARY: user clears `lc-pattern` from the 239 frontmatter, re-submits AC (or in the future a manual "Reclassify pattern" command — out of scope for this quick task).

## Specialist Review

(typescript-expert review skipped — fix is a string addition + a prompt edit + test count update; no language-specific idiomatic concern. Type-checker confirms via `tsc --noEmit`.)

## Resolution

- **root_cause**: `SEED_PATTERNS` allowlist in `src/graph/patternTaxonomy.ts` was missing `'Monotonic Queue'`, so the AI classifier's prompt presented Monotonic Stack as the closest available technique for deque-based sliding-window-min/max problems.
- **fix**: (see PR — quick task `260607-yyx-fix-monotonic-queue-taxonomy`) added `'Monotonic Queue'` to `SEED_PATTERNS`, added a deque-vs-stack disambiguation bullet to the prompt rules in `buildKgPrompt.ts`, updated the seed-count assertion + added a regression test for the new prompt rule.
- **re-categorization for existing notes**: NO command exists; per-note manual remediation = clear `lc-pattern` from frontmatter then re-AC. Listed as a follow-up nice-to-have.
