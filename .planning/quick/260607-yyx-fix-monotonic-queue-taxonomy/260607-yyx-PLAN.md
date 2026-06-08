---
phase: quick-260607-yyx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/graph/patternTaxonomy.ts
  - src/graph/buildKgPrompt.ts
  - tests/graph/buildKgPrompt.test.ts
autonomous: true
requirements:
  - QUICK-260607-YYX-01
must_haves:
  truths:
    - "SEED_PATTERNS includes 'Monotonic Queue' as a distinct technique from 'Monotonic Stack' so the AI classifier no longer misclassifies deque-based sliding-window problems."
    - "buildKgPrompt rules call out the deque-vs-stack distinction explicitly so the LLM can disambiguate even when a problem statement hints at both."
    - "Existing tests still pass; the seed-count assertion updates to 40."
  artifacts:
    - path: "src/graph/patternTaxonomy.ts"
      provides: "SEED_PATTERNS constant with 'Monotonic Queue' inserted adjacent to 'Monotonic Stack'."
      contains: "'Monotonic Queue'"
    - path: "src/graph/buildKgPrompt.ts"
      provides: "Classification rules with explicit Monotonic Queue ↔ Monotonic Stack disambiguation."
      contains: "Monotonic Queue"
    - path: "tests/graph/buildKgPrompt.test.ts"
      provides: "Updated seed-count + regression test for the disambiguation rule."
      contains: "toHaveLength(40)"
---

<objective>
Fix AI auto-categorization quality bug: deque-based problems (LC 239, 862, 1438, 1696, 2398) are tagged "Monotonic Stack" because `SEED_PATTERNS` doesn't include "Monotonic Queue". Add the missing pattern, strengthen the prompt's deque-vs-stack guidance, update tests.

Out of scope: building a "Reclassify pattern" command. The PatternClusterEngine persistence check (line 148) skips classification when `lc-pattern` is already set; existing misclassified notes need manual frontmatter clear + re-AC. Document this as a follow-up.
</objective>

<context>
@.planning/debug/ai-pattern-monotonic-queue-misclassification.md
@src/graph/patternTaxonomy.ts
@src/graph/buildKgPrompt.ts
@src/graph/PatternClusterEngine.ts
@tests/graph/buildKgPrompt.test.ts
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add 'Monotonic Queue' seed + prompt disambiguation + test updates</name>
  <files>src/graph/patternTaxonomy.ts, src/graph/buildKgPrompt.ts, tests/graph/buildKgPrompt.test.ts</files>
  <action>
    1. Insert `'Monotonic Queue',` into `SEED_PATTERNS` immediately after `'Monotonic Stack'` under the "Core data structures" group.
    2. Add a new bullet to the "## Classification rules" block in `buildKgPrompt.ts` that explicitly distinguishes Monotonic Queue (deque-based; sliding-window min/max) from Monotonic Stack (next-greater/previous-smaller patterns).
    3. Update `tests/graph/buildKgPrompt.test.ts` seed-count assertion from 39 to 40.
    4. Add a regression `it()` to `tests/graph/buildKgPrompt.test.ts` asserting that the prompt contains the substring `'Monotonic Queue'` and the disambiguation guidance keywords.
  </action>
  <verify>
    <automated>npm test -- tests/graph/buildKgPrompt.test.ts tests/graph/parseKgResponse.test.ts tests/graph/patternClusterEngine.test.ts</automated>
  </verify>
</task>

</tasks>

<verification>
- `npm test` (full suite) all green.
- `npx tsc --noEmit` clean.
- `npm run lint` no new errors (baseline 81).
- `npm run build` succeeds.
- `grep -n "Monotonic Queue" src/graph/patternTaxonomy.ts` returns one match.
- `grep -n "Monotonic Queue" src/graph/buildKgPrompt.ts` returns ≥1 match.
</verification>

<success_criteria>
- The next time a user solves a deque-based sliding-window problem and the AI auto-categorizes it, "Monotonic Queue" is presented as a candidate seed pattern. The LLM picks it over "Monotonic Stack" for problems like LC 239.
- Existing notes with `lc-pattern: [Monotonic Stack]` are unchanged (intentional — the persistence check skips them; manual frontmatter clear required for re-classification).
</success_criteria>
