---
phase: 02-problems-as-notes
plan: 09
subsystem: notes / htmlToMarkdown
tags: [gap-closure, gap-2c-2, htmlToMarkdown, turndown, sup-sub, obsidian-rendering]
parent-gap: GAP-2c (02-UAT.md)
followup-of: 02-08
type: micro-fix
requires: [02-08]
provides: [lc-code-with-children-rule]
affects: [src/notes/htmlToMarkdown.ts, tests/htmlToMarkdown.test.ts, tests/htmlToMarkdown-determinism.test.ts, tests/htmlToMarkdown-snapshots.test.ts, tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap]
tech-stack:
  added: []
  patterns: [turndown-rule-ordering, outerHTML-passthrough]
key-files:
  created:
    - .planning/phases/02-problems-as-notes/02-09-SUMMARY.md
  modified:
    - src/notes/htmlToMarkdown.ts
    - tests/htmlToMarkdown.test.ts
    - tests/htmlToMarkdown-determinism.test.ts
    - tests/htmlToMarkdown-snapshots.test.ts
    - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
decisions:
  - "Option A (HTML passthrough) over Option B (math escape inside backticks) because Obsidian reading view already styles raw <code> elements with monospace + gray background identically to backtick-wrapped code, AND renders nested <sup>/<sub>/<strong> correctly — preserving LC's semantic intent without sacrificing styling."
  - "Rule ordered BEFORE lc-sup / lc-sub so the filter gets first chance on <code> nodes with element children; pure-text <code> falls through to turndown's default backtick conversion."
  - "Used outerHTML (not innerHTML + manual reconstruction) so arbitrary attributes on <code> (e.g., class) survive the conversion verbatim — future-proofs against LC adding class names to inline code."
metrics:
  completed: 2026-05-08
  duration-minutes: ~15
  tasks-completed: 2
  files-changed: 5
  commits: 1
---

# Phase 2 Plan 9: GAP-2c-2 — Preserve `<sup>`/`<sub>` Inside `<code>` via HTML Passthrough Summary

Fixed GAP-2c-2: LC's complexity notation `<code>O(n<sup>2</sup>)</code>` was rendering as literal `$^{2}$` source text inside backticks because Markdown's inline-code rule suppresses all nested formatting. Added a new turndown rule `lc-code-with-children` that emits `<code>` elements containing any element child as literal HTML passthrough, so Obsidian reading view applies monospace + background styling AND renders nested superscripts correctly.

## Problem

GAP-2c (plan 02-08) added `lc-sup` / `lc-sub` turndown rules to convert bare `<sup>2</sup>` → `$^{2}$` math-mode caret form. This works perfectly in prose — Obsidian's MathJax renders the superscript.

However, when the `<sup>` is **inside** a `<code>` element (LC's constraint notation: `<code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code>`), turndown wraps the whole thing in backticks. Markdown's inline-code rule then suppresses everything between the backticks — the user sees the literal `$^{4}$` source leaking through instead of a rendered superscript.

This was discovered via UAT of the two-sum problem note:

```
-   `2 <= nums.length <= 10$^{4}$`            ← user sees $^{4}$ verbatim
-   `-10$^{9}$ <= nums[i] <= 10$^{9}$`        ← user sees $^{9}$ verbatim
```

## Solution (Option A: HTML Passthrough)

Added `lc-code-with-children` rule BEFORE `lc-sup` / `lc-sub` in `src/notes/htmlToMarkdown.ts`:

```typescript
service.addRule('lc-code-with-children', {
  filter: (node) => {
    if (node.nodeName !== 'CODE') return false;
    const hasElementChild = Array.from(node.childNodes).some(
      (child) => child.nodeType === 1, // Node.ELEMENT_NODE
    );
    return hasElementChild;
  },
  replacement: (_content, node) => {
    const el = node as unknown as { outerHTML: string };
    return el.outerHTML;
  },
});
```

### Why Option A over Option B (math escape)

| Option | Pros | Cons |
|--------|------|------|
| **A (chosen): HTML passthrough** | Obsidian reading view styles raw `<code>` same as backticks (monospace + gray background); nested `<sup>` renders as true superscript; zero new math-escape logic. | Source view shows raw HTML tags (acceptable — most users use reading view). |
| B: emit backticks with math escaping | Source view still shows backticks (familiar). | Markdown inline-code rule suppresses everything inside backticks — math would STILL not render. Non-starter. |

### Rule ordering rationale

Turndown tries custom rules top-to-bottom. `lc-code-with-children` must come BEFORE `lc-sup` / `lc-sub` so that when descending into a `<code>` node, the filter claims the whole element first and returns `outerHTML` — turndown does not then recurse into the `<sup>` children. Pure-text `<code>` (e.g., `<code>nums[i]</code>`) returns `false` from the filter and falls through to turndown's default backtick conversion — no regression.

## Tests Added

**`tests/htmlToMarkdown.test.ts` — 4 new cases in a new describe block `htmlToMarkdown — <code> with nested tags (GAP-2c-2, NOTE-02)`:**

1. `<code>O(n<sup>2</sup>)</code>` → literal HTML passthrough (the GAP-2c-2 smoking gun)
2. `<code>nums[i]</code>` → still uses backticks (no regression for pure-text code)
3. `<code>a<sub>i</sub></code>` → literal HTML passthrough (sub coverage)
4. `<p>complexity is O(n<sup>2</sup>)</p>` → still emits `$^{2}$` math form outside `<code>` (no regression on lc-sup)

**`tests/htmlToMarkdown-determinism.test.ts` — Test 10:**

100-run byte-equality on a combined fixture mixing `<code><sup>` passthrough with bare `<sup>` math — guards against any per-call mutable state in the new rule (none by design; confirmed empirically).

**`tests/htmlToMarkdown-snapshots.test.ts`:**

- Regenerated the two-sum snapshot (now shows `<code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code>` literal).
- Updated the GAP-2c smoke check → GAP-2c-2 smoke check: asserts the literal HTML passthrough IS present AND the old (wrong) `10$^{4}$` backtick-wrapped math is NOT. Catches silent reversion of either lc-code-with-children or lc-sup.

## Snapshot diff

Before (two-sum constraints section):

```
-   `2 <= nums.length <= 10$^{4}$`
-   `-10$^{9}$ <= nums[i] <= 10$^{9}$`
-   `-10$^{9}$ <= target <= 10$^{9}$`
```

After:

```
-   <code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code>
-   <code>-10<sup>9</sup> &lt;= nums[i] &lt;= 10<sup>9</sup></code>
-   <code>-10<sup>9</sup> &lt;= target &lt;= 10<sup>9</sup></code>
```

Median and regex snapshots are unchanged (their constraint `<code>` elements contain only text).

## Acceptance Criteria Results

- [x] `lc-code-with-children` rule exists in `htmlToMarkdown.ts`, ordered BEFORE `lc-sup` / `lc-sub`
- [x] `grep -c "lc-code-with-children" src/notes/htmlToMarkdown.ts` = 1
- [x] Test case: `<code>O(n<sup>2</sup>)</code>` → literal HTML passthrough passes
- [x] Test case: plain `<code>nums[i]</code>` still uses backticks (no regression)
- [x] Test case: `<sup>` outside `<code>` still emits `$^{...}$` math form (no regression)
- [x] `npm test` full suite green — 158 tests pass across 33 files
- [x] `npm run build` clean (tsc -noEmit + esbuild production bundle)
- [x] `npm run lint` — zero new errors on files I modified (40 pre-existing baseline errors in other files, unchanged)
- [x] D-20 determinism Test 10 passes (100-run byte equality on combined fixture)
- [x] `./scripts/grep-no-vault-modify.sh` exits 0
- [x] Snapshots regenerated and manually inspected — two-sum's big-O notation appears as `<code>...10<sup>4</sup>...</code>` literal; median and regex unchanged
- [x] One atomic commit (`feat(02-09): preserve <sup>/<sub> inside <code> via HTML passthrough (GAP-2c-2)`)

## Deviations from Plan

**1. [Rule 1 — Bug] Updated GAP-2c snapshot smoke check**

- **Found during:** Step 4 (snapshot regeneration)
- **Issue:** The pre-existing `GAP-2c smoke check` in `tests/htmlToMarkdown-snapshots.test.ts` asserted `expect(md).toContain('10$^{4}$')` — that's the exact (wrong) output GAP-2c-2 eliminates. After the fix, the assertion fails because `10$^{4}$` no longer appears in the two-sum snapshot (constraints are now passthrough HTML).
- **Fix:** Rewrote the smoke check as a GAP-2c-2 smoke check that asserts the literal passthrough (`<code>...<sup>4</sup>...</code>`) IS present AND the old backtick-wrapped math is NOT. This is still a valid regression guard — if either rule silently reverts, the assertion fails.
- **Files modified:** `tests/htmlToMarkdown-snapshots.test.ts`
- **Commit:** (single atomic commit with the feature)

No other deviations — plan executed as specified.

## Threat Flags

None — pure HTML→Markdown transform module; no new network/auth/filesystem surface.

## Self-Check: PASSED

- [x] `src/notes/htmlToMarkdown.ts` — modified (rule added) — verified via file read
- [x] `tests/htmlToMarkdown.test.ts` — modified (4 new tests) — verified via file read
- [x] `tests/htmlToMarkdown-determinism.test.ts` — modified (Test 10 added) — verified via file read
- [x] `tests/htmlToMarkdown-snapshots.test.ts` — modified (smoke check updated) — verified via file read
- [x] `tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap` — regenerated — verified via file read
- [x] `.planning/phases/02-problems-as-notes/02-09-SUMMARY.md` — created (this file)
- [x] All 158 tests pass
- [x] Build clean
- [x] Commit landed: `0a8903a` — verified via `git log --oneline -3`

## Commit

| Hash | Message |
|------|---------|
| `0a8903a` | `feat(02-09): preserve <sup>/<sub> inside <code> via HTML passthrough (GAP-2c-2)` |
