---
phase: 02-problems-as-notes
plan: 11
subsystem: notes / htmlToMarkdown — Shape B example rendering
tags: [gap-closure, gap-2b-2, htmlToMarkdown, turndown, post-processing, shape-b, examples]
parent-gap: GAP-2b-2 (user-observed Problem 65)
followup-of: 02-10
supersedes: []
type: micro-fix
requires: [02-08, 02-10]
provides: [shape-b-example-collapse, reshapeShapeBExamples]
affects:
  - src/notes/htmlToMarkdown.ts
  - tests/htmlToMarkdown.test.ts
  - tests/htmlToMarkdown-determinism.test.ts
  - tests/htmlToMarkdown-snapshots.test.ts
  - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
  - tests/fixtures/lc-valid-number.html
tech-stack:
  added: []
  patterns: [post-processing-string-transform, pure-function-determinism]
key-files:
  created:
    - .planning/phases/02-problems-as-notes/02-11-SUMMARY.md
    - tests/fixtures/lc-valid-number.html
  modified:
    - src/notes/htmlToMarkdown.ts
    - tests/htmlToMarkdown.test.ts
    - tests/htmlToMarkdown-determinism.test.ts
    - tests/htmlToMarkdown-snapshots.test.ts
    - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
decisions:
  - "Post-process the turndown Markdown string rather than extend lc-example-block as a per-<p> turndown rule: a turndown rule only sees one node at a time and cannot look ahead at the next 2–3 <p> siblings to decide whether the current <p> starts a Shape B run. A single pass over the full Markdown string has the structural context needed for the run detection, and keeps the turndown singleton config untouched."
  - "Detect Shape B via a tight regex — `^\\*\\*(Input|Output|Explanation):\\*\\* rest$` — on 2+ consecutive such lines (with blank lines tolerated between them). Require ≥2 matches to fire: a single stray `**Input:**` paragraph in description prose (e.g., 'Input: the function receives…') must NOT be collapsed. This keeps false-positive risk near zero."
  - "Keep the `**Example N:**` heading line outside the fence. This matches Shape A's existing visual convention (see two-sum snapshot: `**Example 1:**` on its own line above the ```text block) and preserves the example numbering as skimmable bold."
  - "Limit label set to Input / Output / Explanation — the three labels LC actually uses inside example bodies. Do NOT include `Example N:` itself in the label set: the heading stays OUTSIDE the fence, and Example headings never come in consecutive pairs anyway (each is followed by its Input/Output body, breaking the run)."
  - "Determinism preserved: the post-processor is a pure string → string function. No dates, no RNG, no iteration-order dependence. Determinism Test 11 exercises this at 100 iterations on a mixed Shape A + Shape B + regression-guard fixture."
metrics:
  completed: 2026-05-08
  duration-minutes: ~20
  tasks-completed: 1
  files-changed: 6
  commits: 1
---

# Phase 2 Plan 11: GAP-2b-2 — Shape B example blocks Summary

Extended the turndown pipeline to render LeetCode's "Shape B" example format (flat `<p>` paragraphs with inline `<strong>` labels, no `<pre>` wrapper — observed on Problem 65 "Valid Number") as the same fenced ```text block that Shape A ( `<pre>`-wrapped) already produces. Implemented via a post-processing pass `reshapeShapeBExamples` in `htmlToMarkdown.ts`, not a turndown rule — a single rule cannot inspect following sibling paragraphs needed for run detection.

## The two LC shapes

| Shape | HTML pattern | Prior behavior | Post-plan behavior |
|-------|-------------|----------------|--------------------|
| A (most problems — Two Sum) | `<pre><strong>Input:</strong> …\n<strong>Output:</strong> …</pre>` | Fenced ```text block via `lc-example-block` turndown rule | Unchanged — same fenced block |
| B (Problem 65 Valid Number, others) | `<p><strong>Input:</strong> …</p><p><strong>Output:</strong> …</p>` | Flat `**Input:** …\n\n**Output:** …` paragraphs (visual mismatch with Shape A) | Collapsed to the same fenced ```text block via `reshapeShapeBExamples` post-processor |

### Before (Shape B, Problem 65 pre-plan output)

```
**Example 1:**

**Input:** s = "0"

**Output:** true
```

### After (Shape B, Problem 65 post-plan output — matches Shape A)

```
**Example 1:**

```text
Input: s = "0"
Output: true
```
```

## Implementation

Added `reshapeShapeBExamples(md: string): string` to `src/notes/htmlToMarkdown.ts`:

```typescript
const LABEL_LINE = /^\*\*(Input|Output|Explanation):\*\*([^\n]*)$/;

function reshapeShapeBExamples(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const current = lines[i] ?? '';
    if (LABEL_LINE.test(current)) {
      const labelLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = (lines[j] ?? '').match(LABEL_LINE);
        if (m) {
          labelLines.push(`${m[1]}:${m[2]}`);
          j++;
          while (j < lines.length && (lines[j] ?? '').trim() === '') j++;
          continue;
        }
        break;
      }
      if (labelLines.length >= 2) {
        out.push('```text');
        for (const line of labelLines) out.push(line);
        out.push('```');
        out.push('');
        i = j;
        continue;
      }
    }
    out.push(current);
    i++;
  }
  // Trim trailing duplicate blanks the emitter may have introduced.
  while (out.length > 0 && out[out.length - 1] === '' &&
         (out.length < 2 || out[out.length - 2] === '')) out.pop();
  return out.join('\n');
}
```

Wired in after turndown:

```typescript
export function htmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || html.trim() === '') return '';
  try {
    const raw = getService().turndown(html);
    return reshapeShapeBExamples(raw).trim();
  } catch {
    return '';
  }
}
```

## Detection tightness — why two consecutive labels

The single hardest design constraint was making the post-processor NOT collapse legitimate bolded prose. Examples of content that must remain untouched:

- `**Note:** see the constraints` — wrong label (not in the Input/Output/Explanation set) → skipped.
- `**Warning:** large inputs may overflow` — same → skipped.
- A single `**Input:** the function receives an array.` paragraph in description prose — single run of 1, not 2+ → NOT collapsed.

The 2+ consecutive rule is what makes detection safe. LC never writes a bare single `**Input:**` inside an example block — the labels always come in pairs (Input+Output) or triples (Input+Output+Explanation). Any single occurrence is description prose and we must leave it alone. The dedicated regression-guard test (`does NOT collapse a single stray **Input:** paragraph`) locks this behavior.

## Tests (all in one commit)

**tests/htmlToMarkdown.test.ts** — 6 new test cases in a new `describe('htmlToMarkdown — Shape B examples (GAP-2b-2, NOTE-02)')` block:

1. **Problem 65 pattern** — 2-label run (Input + Output) collapses to fenced text block; `**Example 1:**` heading preserved above; bold labels stripped in the fence.
2. **Three-label run with Explanation** — Input + Output + Explanation all go in one fenced block.
3. **Shape A unchanged** — Shape A `<pre>`-wrapped example still produces exactly one opening + one closing fence; no double-wrap interaction with the post-processor.
4. **Regression guard — single stray `**Input:**`** — a single bolded Input paragraph in description prose must NOT be wrapped in a fence.
5. **Regression guard — wrong labels** — `**Note:**` / `**Warning:**` pairs are NOT in the Input/Output/Explanation set and must remain as plain bold.
6. **Two consecutive example groups** — Shape B with Example 1 AND Example 2 in the same document produces two fenced blocks (one per group).

**tests/htmlToMarkdown-determinism.test.ts** — Test 11 added: mixed Shape A + Shape B + regression-guard fixture, 100-run byte-equality gate (D-20).

**tests/htmlToMarkdown-snapshots.test.ts** — new `valid-number fixture` snapshot test asserts:
- Exactly 3 ```text fence openings (one per example)
- No `**Input:**` / `**Output:**` bold leaking
- All three `**Example N:**` headings preserved as bold

**tests/fixtures/lc-valid-number.html** — new fixture with 3 Shape B examples + a constraints list (`<code>` with `<sup>`, exercising interaction with the GAP-2c-3 Unicode pipeline).

### Canonical snapshot (`valid-number fixture`)

```markdown
A **valid number** can be split up into these components (in order):

1.  A **decimal number** or an **integer**.
2.  (Optional) An `'e'` or `'E'`, followed by an **integer**.

Given a string `s`, return `true` _if_ `s` _is a_ **valid number**.

**Example 1:**

\`\`\`text
Input: s = "0"
Output: true
\`\`\`

**Example 2:**

\`\`\`text
Input: s = "e"
Output: false
\`\`\`

**Example 3:**

\`\`\`text
Input: s = "."
Output: false
\`\`\`

**Constraints:**

-   `1 <= s.length <= 20`
-   `s` consists of only English letters (both uppercase and lowercase), digits (`0-9`), plus `'+'`, minus `'-'`, or dot `'.'`.
```

Three ```text fences, each containing the stripped labels. `**Example N:**` headings preserved. Shape-A-identical rendering.

## Acceptance Criteria Results

- [x] `reshapeShapeBExamples` function added to `htmlToMarkdown.ts` — `grep -c` = 2 (definition + call site)
- [x] Wired into `htmlToMarkdown(html)` after turndown — `return reshapeShapeBExamples(raw).trim();`
- [x] Problem 65 Shape B fixture → `**Example 1:**` + ```text block (NOT plain paragraphs) — verified by snapshot + 2 unit tests
- [x] Shape A (pre-wrapped) still produces its fenced block unchanged — verified by Shape-A-unchanged unit test + preserved two-sum/median snapshots
- [x] Stray `**Input:**`-like prose NOT converted — verified by dedicated regression-guard unit test
- [x] Shape B with Explanation → three labels in one fenced block — verified
- [x] Determinism Test 11 — 100-run byte equality on combined Shape A + Shape B + regression-guard fixture
- [x] Snapshots regenerated — new `valid-number` snapshot added; two-sum / median / regex snapshots unchanged
- [x] `npm test` green — **178 / 178** tests across 34 files (was 170; +8 new tests: 6 unit, 1 determinism, 1 snapshot)
- [x] `npm run build` clean — `tsc -noEmit` + esbuild production, no errors
- [x] `npm run lint` — **zero delta vs baseline** (42 problems before, 42 after; all pre-existing, none in files I touched)
- [x] `./scripts/grep-no-vault-modify.sh` exits 0
- [x] `grep -c "reshapeShapeBExamples" src/notes/htmlToMarkdown.ts` = 2 (≥ 1 required)
- [x] One atomic commit
- [x] SUMMARY.md at `.planning/phases/02-problems-as-notes/02-11-SUMMARY.md`

## Deviations from Plan

**1. [Rule 3 — Blocking] TypeScript strict-mode indexed-access fix in `reshapeShapeBExamples`**

- **Found during:** First `npm run build` after writing the helper.
- **Issue:** `tsc` reported four TS2345/TS2532 errors (`lines[i]` is `string | undefined` under `noUncheckedIndexedAccess`-like strictness). The helper was indexing the split-result array without narrowing.
- **Fix:** Added `lines[i] ?? ''` and `lines[j] ?? ''` at each read, stored in a local `const current = lines[i] ?? ''`. Behavior identical for in-range indices (which is all the loop visits); the coalesce only activates for impossible-out-of-range cases and satisfies the type checker.
- **Files modified:** `src/notes/htmlToMarkdown.ts` (same commit).
- **Outcome:** Build clean, all tests still green (178/178), byte-identical snapshot.

No other deviations — plan executed as specified.

## Threat Flags

None — pure string → string post-processor. No new network endpoints, no new filesystem access patterns, no new auth surface, no new user-input trust boundary. Extends an existing pure-function HTML→Markdown pipeline.

## Self-Check: PASSED

- [x] `src/notes/htmlToMarkdown.ts` — modified (added `reshapeShapeBExamples`, wired into `htmlToMarkdown`) — verified via Read
- [x] `tests/htmlToMarkdown.test.ts` — modified (+6 Shape B tests) — verified via Read
- [x] `tests/htmlToMarkdown-determinism.test.ts` — modified (+Test 11) — verified via Read
- [x] `tests/htmlToMarkdown-snapshots.test.ts` — modified (+valid-number snapshot test) — verified via Read
- [x] `tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap` — regenerated (new valid-number snapshot entry) — verified via Read
- [x] `tests/fixtures/lc-valid-number.html` — created (3-example Shape B fixture) — verified via Read
- [x] `.planning/phases/02-problems-as-notes/02-11-SUMMARY.md` — created (this file)
- [x] All 178 tests pass
- [x] Build clean
- [x] Lint zero delta vs baseline
