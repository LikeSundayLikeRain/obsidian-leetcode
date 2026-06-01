---
phase: 17-polish-edge-cases
plan: 07
subsystem: nested-editor / source-mode-rendering
tags: [phase-17, source-mode, regression-fix, statefield, decorations]
gsd_summary_version: 1.0
status: complete
requires:
  - 17-01
  - 17-02
  - 17-04
provides:
  - StateField update() rebuilds DecorationSet on line-count change (no more phantom render in Source Mode)
  - Regression coverage for the Phase 14 leetcode.* fast-path edge case
affects:
  - src/main/nestedEditorExtension.ts (update() body of buildNestedEditorExtension's StateField)
  - tests/main/nestedEditorExtension.test.ts (new Phase 17-07 describe blocks)
tech-stack:
  added: []
  patterns:
    - "Line-count delta gate before userEvent fast-path: tr.startState.doc.lines !== tr.state.doc.lines triggers full buildNestedDecorations rebuild even when userEvent matches 'leetcode.*'"
    - "RangeSet.map(tr.changes) is unsafe for line-adding transactions — it shifts decoration positions but does NOT emit new line decorations to cover newly-inserted lines"
key-files:
  created: []
  modified:
    - src/main/nestedEditorExtension.ts
    - tests/main/nestedEditorExtension.test.ts
key-decisions:
  - "Line-count check uses tr.startState.doc.lines !== tr.state.doc.lines (CM6 standard Text.lines getter). Equality means same-line edit → cheap RangeSet.map fast-path; inequality means structural change → full rebuild."
  - "Order of branches: line-count rebuild evaluates BEFORE the userEvent fast-path. This is the surgical fix — flipping the order keeps existing-line edits (the 99% case) on the cheap path while routing line-adding leetcode.child-sync mirrors to rebuild."
  - "ECHO_PRONE_USER_EVENTS is NOT modified. Adding 'leetcode.child-sync' to that Set would suppress detectAndPropagateExternalChange propagation — orthogonal to the StateField rebuild path. The Phase 14 / chevron-switch-child-body-stale fix established that ECHO_PRONE_USER_EVENTS gates the externalChangeListener only; the StateField has its own gate, which is what 17-07 narrows."
  - "Test exposure pattern: behavioral tests use real EditorState.create() with the extension, plus a vi.mock override of editorInfoField that yields the canonical LC path so the slug-frontmatter gate passes. DecorationSet introspection uses internal-API access (state.values RangeSet shape detection) because the StateField is closed over `registry` and has no exported handle — the plan explicitly excluded adding such an export."
requirements-completed:
  - BRACKET-01
  - BRACKET-02
  - BRACKET-03
  - BRACKET-04
  - ENTER-01
  - ENTER-02
  - ENTER-03
  - ENTER-04
  - INDENT-01
  - INDENT-02
  - INDENT-03
  - INDENT-04
metrics:
  duration: "11 min"
  completed: 2026-05-24
  tasks: 2
  files: 2
---

# Phase 17 Plan 07: Source Mode Phantom Render Fix — Summary

Closes 17-UAT.md Issue 1 (Tests 2 PASTE-02 + 8 SRCLIV-01) — narrows the parent's `buildNestedEditorExtension` StateField fast-path so line-count-changing `'leetcode.*'` transactions take the full `buildNestedDecorations` rebuild path, eliminating the visible phantom render of the parent fence body below the child editor when the user paste/Enter+types a new line in Source Mode.

## Outcome

**Before:** In Source Mode, when the user typed Enter and started a new line OR pasted multi-line content INSIDE the focused child editor, the parent's fence body rendered a phantom duplicate copy of the new line(s) below the child editor box. The phantom disappeared on focus change. Existing-line edits (single-character typing on a line that already existed) showed no phantom.

**After:** No phantom render. The line-hide decoration RangeSet always covers the full `[openerLine, closerLine]` inclusive range derived from the latest fence detection, including lines newly added by the `'leetcode.child-sync'` mirror dispatch.

## Files Modified

- **`src/main/nestedEditorExtension.ts`** — `update(old, tr)` body of the StateField in `buildNestedEditorExtension` (lines 284–303 → now spans ~30 lines after the comment block). Surgical change to the update() logic only; no other parts of the extension touched.
- **`tests/main/nestedEditorExtension.test.ts`** — added two new `describe` blocks at the bottom: "Phase 17-07 — StateField update() rebuild on line-count change (17-UAT.md Issue 1)" (3 behavioral tests) and "Phase 17-07 — StateField update() source-level invariants" (3 source-level regex assertions). Also extended the top-level `vi.mock('obsidian')` to override `editorInfoField` so behavioral tests can drive real CM6 transactions through the extension.

## Tests Added

| Test | What it asserts | RED → GREEN |
|------|-----------------|-------------|
| `line-adding leetcode.child-sync mirror triggers full rebuild — new closerLine has hideLine` | After a `'leetcode.child-sync'` transaction that ADDS a line at the end of the body, the post-state DecorationSet covers `[openerLine, newCloserLine]` inclusive (6 line-hide decorations on a 4-line-body fence that grew by one line). The new closerLine and the newly-inserted line both have `lc-fence-hidden` line decorations. | RED on current main (fast-path returned `old.map(tr.changes)` → 5 decorations, new line uncovered). GREEN after fix. |
| `existing-line leetcode.child-sync edit keeps fast-path — no rebuild churn` | After a same-line edit (replace the text of an existing body line, no line-count delta), DecorationSet line count is unchanged. Guards against an over-broad fix that would rebuild on every leetcode.* transaction. | GREEN on both pre- and post-fix (sanity guard). |
| `non-child-sync line-adding edit (e.g., user typing in parent) still rebuilds via the existing rebuild path` | After a docChanged transaction with no `leetcode.*` userEvent that adds a line, DecorationSet covers all fence lines. Guards against a fix that accidentally regresses the user-typing-in-parent path. | GREEN on both pre- and post-fix (sanity guard). |
| `StateField update() references doc.lines on tr.startState and tr.state` | Source-level: `doc.lines` appears at least twice in `nestedEditorExtension.ts`. | RED on current main (zero references). GREEN after fix (introduces `tr.startState.doc.lines !== tr.state.doc.lines`). |
| `StateField update() body documents the 17-07 / 17-UAT.md Issue 1 rationale` | Source-level: comment with `17-07`, `Issue 1`, or `line-count` is present. | RED on current main. GREEN after fix (documenting comment block added). |
| `ECHO_PRONE_USER_EVENTS Set is unchanged from baseline (only child-sync + fence-repair)` | Source-level: the Set still contains exactly `'leetcode.child-sync'` and `'leetcode.fence-repair'`, NOT `'leetcode.lang-switch'`. Pins the must-have invariant from the plan. | GREEN on both pre- and post-fix (invariant guard). |

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run tests/main/nestedEditorExtension.test.ts` | 35/35 passed (29 pre-existing + 6 new) |
| `npm test` (full suite) | 1690 passed, 6 skipped, 0 failed across 195 files |
| `npm run build` | Clean (`tsc -noEmit -skipLibCheck && esbuild` both succeed; exit 0) |
| `npm run lint` | Exit 0 (120 problems pre-existing — no new errors introduced; my code follows the existing `require()` source-introspection pattern used by the chevron-switch tests in the same file at lines 587–637) |

## Confirmation of Plan Must-Haves

- **Line-hide decorations cover [openerLine, closerLine] inclusive at all times, including lines newly added by `'leetcode.child-sync'` mirror dispatches** — Verified by Test 1 (asserts both `newCloserLine` and the newly-inserted line at original `closerLine` have `lc-fence-hidden` line decorations).
- **Phantom render does not appear during structural edits AND does not appear after focus change** — The fix is symmetric: any transaction that changes line count rebuilds, regardless of userEvent or focus state. The post-fix invariant is independent of who is focused.
- **Existing-line edits continue to work without regression** — Test 2 asserts the fast-path is preserved for same-line edits.
- **Pitfall 8 (Source Mode parity for `Decoration.widget({block:true})`) is closed** — the line-hide RangeSet always covers the full latest `[openerLine, closerLine]` after a docChanged + line-count-delta transaction.
- **The userEvent gate at update() does NOT short-circuit the rebuild for child-sync mirror dispatches that ADD lines** — Verified by Test 1 (assertion 1: 6 line-hide decorations after the line-adding leetcode.child-sync transaction; pre-fix this would be 5).

## Confirmation of "Do Not Touch" Surfaces

- **`ECHO_PRONE_USER_EVENTS`** — unchanged. The diff for `src/main/nestedEditorExtension.ts` modifies only the `update()` body (lines 284–303) and the documenting comment immediately above it. The `ECHO_PRONE_USER_EVENTS` constant at lines 265–268 is untouched. Source-level test pins this invariant.
- **`externalChangeListener`** — unchanged. The listener body at lines 316–326 still uses `ECHO_PRONE_USER_EVENTS.has(ev)` (not `startsWith('leetcode.')`).
- **`transactionFilter`** — unchanged. The cursor-redirect logic at lines 328–370 is untouched.
- **`buildNestedDecorations`** — unchanged. The rebuild path the StateField now invokes more often is the same function that already worked correctly when called.
- **`NestedEditorWidget`** — unchanged.

## Manual UAT to Re-Run Post-Merge

The user should re-run **17-UAT.md Test 2 (PASTE-02)** and **Test 8 (SRCLIV-01)** in Source Mode after this lands:

1. Open a problem note with a multi-line fence body in Source Mode.
2. Click into the child editor (focus it).
3. Press End to land at the end of the last body line, then press Enter and type a new line.
4. **Expected (post-fix):** the new line appears INSIDE the child editor box with no phantom duplicate render of any text BELOW the child editor.
5. Variant: paste 3 lines of code at the end of the body. Same expectation — no phantom render below.
6. Variant: lose focus on the child (click outside). The display should be unchanged from before focus change (no new phantom appears, no existing phantom disappears — there shouldn't have been one).

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `bddecb6` | test | add failing regression for Source Mode phantom render in StateField (RED) |
| `734c175` | fix | rebuild StateField decorations on line-count change (GREEN) |

## Self-Check: PASSED

- [x] `tests/main/nestedEditorExtension.test.ts` exists and contains the literal strings `leetcode.child-sync`, `lc-fence-hidden`, `buildNestedEditorExtension`
- [x] `grep -c "leetcode.child-sync" tests/main/nestedEditorExtension.test.ts` returns ≥ 2
- [x] `grep -c "doc\.lines" src/main/nestedEditorExtension.ts` returns ≥ 2
- [x] `grep -c "17-07\|Issue 1\|line-count" src/main/nestedEditorExtension.ts` returns ≥ 1
- [x] `grep -c "ECHO_PRONE_USER_EVENTS" src/main/nestedEditorExtension.ts` is unchanged from baseline (`'leetcode.child-sync'` + `'leetcode.fence-repair'`, no `'leetcode.lang-switch'`)
- [x] `npm test` exit 0
- [x] `npm run build` exit 0
- [x] `npm run lint` exit 0
- [x] Both commits exist on the worktree branch (`bddecb6` + `734c175`)
