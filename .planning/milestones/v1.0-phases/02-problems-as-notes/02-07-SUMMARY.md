---
phase: 02-problems-as-notes
plan: 07
subsystem: notes/htmlToMarkdown
tags:
  - obsidian
  - turndown
  - markdown
  - leetcode
  - gap-closure
dependency-graph:
  requires:
    - 02-04 (htmlToMarkdown turndown wrapper + D-20 determinism posture)
  provides:
    - lc-sup rule (<sup>X</sup> → $^{X}$)
    - lc-sub rule (<sub>X</sub> → $_{X}$)
    - lc-example-block rule (<pre> Input/Output → ```text fence)
    - regenerated snapshots for lc-two-sum, lc-median, lc-regex
  affects:
    - any downstream consumer of htmlToMarkdown() in NoteWriter / re-open refresh
tech-stack:
  added: []
  patterns:
    - "Turndown `addRule` with string filter (sup, sub)"
    - "Turndown `addRule` with function filter + firstElementChild className check (example-block vs language-code precedence)"
    - "textContent extraction (instead of turndown `content` arg) to strip <strong> wrappers inside <pre> while preserving literal newlines"
key-files:
  created: []
  modified:
    - src/notes/htmlToMarkdown.ts
    - tests/htmlToMarkdown.test.ts
    - tests/htmlToMarkdown-determinism.test.ts
    - tests/htmlToMarkdown-snapshots.test.ts
    - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
decisions:
  - "Empty <sup></sup> / <sub></sub> drops to empty string (chose readability over symmetry — `x<sup></sup>` becomes `x`, not `x$^{}$`). Pinned by Test 10."
  - "lc-example-block uses textContent (not Turndown's `content` arg) to avoid nested <strong> wrappers appearing as **Input:** inside a fence where backtick context would leak Markdown semantics"
  - "Filter defers <pre><code class=\"language-*\"> to built-in fencedCodeBlock by checking firstElementChild.className — keeps lc-regex's python fence working while catching LC's bare-<pre> Input/Output pattern"
requirements:
  - NOTE-02
metrics:
  duration_iso: "PT3M25S"
  completed_date: "2026-05-08"
  tasks_completed: 2
  commits: 3
gap_closure:
  - GAP-2b (example blocks render as flat paragraphs → now fenced `text` blocks)
  - GAP-2c (<sup>/<sub> leak as literal HTML → now Obsidian math-mode)
---

# Phase 02 Plan 07: GAP-2b + GAP-2c Gap Closure Summary

Close GAP-2b (LC example blocks flattened into paragraphs) and GAP-2c (`<sup>`/`<sub>` leaking as literal HTML) by adding three additive turndown rules — `lc-sup`, `lc-sub`, `lc-example-block` — to the Phase 2 Plan 04 htmlToMarkdown utility, regenerating the three fixture snapshots, and extending the D-20 determinism test with a combined sup + example-block fixture.

## Outcome

UAT test 2 second and third reported issues now pass:

- **GAP-2c**: constraint lines like `10<sup>4</sup>` render as `10$^{4}$` — Obsidian's math-mode caret form produces true superscript in preview (and stays readable in source view). Handles arbitrary expressions (`i+1`, `n-1`, multi-digit) without per-character mapping.
- **GAP-2b**: LC's `<pre><strong>Input:</strong> ...` styled-example pattern renders as a ```` ```text ```` fenced block with `Input:` / `Output:` / `Explanation:` labels preserved literally (no Markdown bold leak inside the fence). Visually distinct from surrounding paragraphs in both edit and preview modes.
- **Language-code precedence preserved**: `<pre><code class="language-python">` in the lc-regex fixture still routes through the built-in fencedCodeBlock rule and emits ```` ```python ```` — the new lc-example-block filter checks `firstElementChild.className` for `/language-/` and defers.

## Before / After

### GAP-2c — `<sup>` conversion (from lc-two-sum snapshot)

**Before (v0.1.0):**
```
-   `2 <= nums.length <= 10<sup>4</sup>`
-   `-10<sup>9</sup> <= nums[i] <= 10<sup>9</sup>`
```

**After (v0.1.0 + Plan 02-07):**
```
-   `2 <= nums.length <= 10$^{4}$`
-   `-10$^{9}$ <= nums[i] <= 10$^{9}$`
```

### GAP-2b — example-block conversion (from lc-two-sum snapshot)

**Before:**
```
**Example 1:**

**Input:** nums = [2,7,11,15], target = 9
**Output:** [0,1]
**Explanation:** Because nums[0] + nums[1] == 9, we return [0, 1].
```

**After:**
```
**Example 1:**

```text
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
```
```

## Commits

| # | Hash     | Kind     | Message                                                              |
|---|----------|----------|----------------------------------------------------------------------|
| 1 | 116702a  | test     | add failing tests for lc-sup, lc-sub, lc-example-block rules (RED)   |
| 2 | c97f7b0  | feat     | add lc-sup, lc-sub, lc-example-block turndown rules (GREEN)          |
| 3 | a220cda  | test     | regenerate snapshots + add GAP-2b/2c smoke checks                    |

RED gate: 116702a. GREEN gate: c97f7b0. TDD sequence compliant.

## Verification

All phase-gate checks pass:

```
npm test -- tests/htmlToMarkdown.test.ts tests/htmlToMarkdown-determinism.test.ts tests/htmlToMarkdown-snapshots.test.ts
 → 21/21 passed (13 unit + 3 determinism + 5 snapshot)

npm test (full suite)
 → 135/135 passed across 32 test files

npm run build
 → tsc -noEmit clean, esbuild production bundle produced

Acceptance grep gates:
 addRule('lc-sup'        : 1      (expected 1)
 addRule('lc-sub'        : 1      (expected 1)
 addRule('lc-example-block' : 1   (expected 1)
 keep(...sup...)         : 0      (expected 0)
 keep(...sub...)         : 0      (expected 0)
 service.escape assign   : 1      (real assignment only, count of 2 includes comment reference)
 test $^{ asserts        : 5      (expected ≥3)
 test $_{ asserts        : 3      (expected ≥2)
 test ```text asserts    : 4      (expected ≥1)

Snapshot grep gates:
 $^{ in snapshot         : 3      (expected ≥2)
 ```text in snapshot     : 3      (expected ≥2; two-sum×2 + median×1)
 ```python in snapshot   : 1      (expected ≥1; regex preserved)
 <sup>/<sub> leak        : 0      (expected 0)

D-22 vault.modify gate   : OK (no matches in src/notes/ or src/browse/)
Purity guard             : OK (htmlToMarkdown.ts imports only 'turndown')
```

### Determinism (D-20)

Determinism Test 9 (combined `<sup>` + LC example-block fixture) — PASS over 100 consecutive invocations with byte-equality. Test asserts the new rules actually fired (`$^{2}$`, `$^{9}$`, `$^{4}$`, `$_{n-1}$`, ```` ```text ```` fence) as a guard against vacuous equality where both runs produce the same incorrect output.

### Snapshot Stability

Running `npm test -- tests/htmlToMarkdown-snapshots.test.ts` twice in a row produces zero diffs. `git diff --exit-code tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap` clean.

## Deviations from Plan

**1. [Minor scope — plan step 2.6] Added two smoke-check tests instead of one**

Plan Task 2 step 6 asked for a single smoke check on the two-sum text fence. I added a second `grep` for the `$^{...}$` caret form at the same time — cheap parallelism since both are the same retrieve-and-inspect shape, and the rules ship together. This catches silent reversion of either rule without requiring snapshot inspection.

- Files modified: `tests/htmlToMarkdown-snapshots.test.ts`
- Commit: a220cda

Otherwise, plan executed exactly as written.

## Authentication Gates

None. This plan is a pure pure-function change to the HTML→Markdown utility — no network, no auth, no Obsidian lifecycle.

## Deferred / Out-of-Scope Items

Pre-existing lint errors (~35) exist in files outside this plan's scope (`src/browse/FilterModal.ts`, `src/browse/ProblemBrowserView.ts`, `src/main.ts`, `src/notes/NoteWriter.ts`, `tests/cache-ttl.test.ts`, `tests/re-open-silent-offline.test.ts`). My modified files produce zero lint errors. Per CLAUDE.md scope-boundary rule, these pre-existing issues are deferred — adding to phase-level `deferred-items.md` is not necessary because they are already tracked as part of Phase 02 polish.

## Surprises Discovered

**None material.** Turndown's `content` argument for the `<pre>` replacement already processes child rules (including the removed `<strong>` keep()), which would have delivered `**Input:**` into the fence. Switching to `textContent` for the example-block rule cleanly strips nested tag structure while preserving newlines — this was in the plan's action as written, but worth calling out because it's the single design decision that made the labels render correctly without a separate `<strong>`-stripping pass.

The lc-regex fixture's `<pre><code class="language-python">` branch behaved exactly as predicted by the filter's `/language-/` className check. No edge cases observed with mixed-content `<pre>` (e.g. a `<pre>` with both `<code>` AND loose text) since LC's HTML doesn't produce that pattern.

## Threat Flags

None. This plan modifies existing turndown rules inside the same trust boundary already covered by Plan 02-04's threat model; no new network surface, no new auth paths, no schema changes. The three new rules operate on string input already declared untrusted-HTML-from-LC and emit string output flowing to a vault file (same as the baseline). T-02.7-01 through T-02.7-05 from the plan's threat model are all mitigated as designed.

## Self-Check

Verifying claimed artifacts:

- FOUND: `src/notes/htmlToMarkdown.ts` (modified)
- FOUND: `tests/htmlToMarkdown.test.ts` (modified)
- FOUND: `tests/htmlToMarkdown-determinism.test.ts` (modified)
- FOUND: `tests/htmlToMarkdown-snapshots.test.ts` (modified)
- FOUND: `tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap` (regenerated)
- FOUND commit 116702a (RED gate)
- FOUND commit c97f7b0 (GREEN gate)
- FOUND commit a220cda (snapshot regeneration + smoke checks)

## Self-Check: PASSED
