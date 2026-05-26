---
phase: 17-polish-edge-cases
plan: 09
subsystem: nested-editor
tags: [fm-reactivity, language-compartment, gap-closure, phase-17, d-13, d-14, 17-uat-issue-3, round-trip]
requires:
  - 17-04  # External lc-language fm reactivity listener (D-13/D-14)
  - 17-08  # Reset language priority chain restoration (read along)
provides:
  - "LeetCodePlugin.childLanguageTracker: WeakMap<EditorView, string>"
  - "Per-child slug tracker — written by chevron switch + fm-reactivity dispatch sites"
  - "Symmetric round-trip fm reactivity (Java → Python3 → Java BOTH dispatch)"
affects:
  - src/main.ts
  - tests/main/fmReactivity.test.ts
tech_stack:
  added: []
  patterns:
    - "Per-instance WeakMap<EditorView, string> for tracking CM6 Compartment value (no public read API exists)"
    - "Lazy seeding via dispatch sites — pre-mount the tracker has no entry; first dispatch seeds it"
    - "Three-gate frontmatter listener — Gate 3 dedupe migrated from fence-opener parse to tracker.get"
key_files:
  created:
    - .planning/phases/17-polish-edge-cases/17-09-SUMMARY.md
  modified:
    - src/main.ts
    - tests/main/fmReactivity.test.ts
key_decisions:
  - "Gate 3 reads from childLanguageTracker.get(childView), NOT from this.readActiveFenceSlug(file). Per D-14 the listener does not rewrite the parent fence opener, so the opener tag is an unsound proxy for 'current applied child language' on the listener path. The tracker is the only sound source: it records the slug actually applied to the child's languageCompartment by the most recent dispatch (chevron OR fm-reactivity)."
  - "Tracker is updated at BOTH dispatch sites — dispatchChildLanguageReconfigure (chevron switch, after the existing dispatch inside the try block) AND handleFmChangeForLanguageReactivity (fm-reactivity, after the existing dispatch inside the try block). Failed dispatches leave the tracker untouched (next event retries)."
  - "Empty-tracker entries are treated as 'unknown current' and the listener proceeds to dispatch. This is safe because Compartment.reconfigure with an equal LanguageSupport is idempotent — visually a no-op but seeds the tracker for the next swap. This handles the first-metadataCache-changed-event-after-note-open path."
  - "readActiveFenceSlug helper retained (not removed). The 17-08 resolver path may still need a 'what does the parent fence opener currently say?' primitive, and the diff is smaller without removal. JSDoc updated to note the helper is no longer consumed by the fm-reactivity listener."
  - "Plan 17-04 invariants preserved verbatim — effect-only dispatch (no changes payload, no userEvent annotation), D-14 (listener never rewrites the fence opener tag, never calls vault.process or processFrontMatter), Gates 1-2 (lc-slug filter, child registered) unchanged."
  - "Test migration strategy: only the existing tests that exercise Gate 3 dedupe (Test 2 + Test 5 Scenario B) needed tracker seeding; the other 4 legacy tests (Tests 1, 3, 4, 5 scenarios A/C/D, 6) are unaffected because they exercise paths that don't hit Gate 3 equality (Tests 1, 3, 4, 5 scenarios A/C/D) or assert the dispatch shape after Gate 3 already passes (Test 6). Existing readActiveFenceSlug stub on the fake plugin is left in place as a contract guard against future regressions that might re-introduce a fence-opener read."
metrics:
  duration_seconds: 600
  completed_date: "2026-05-24"
  tasks_completed: 2
  files_modified: 2
requirements_addressed: [LANG-01, INDENT-04, ENTER-02, ENTER-03, ENTER-04, COMMENT-01, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04]
---

# Phase 17 Plan 09: Round-Trip fm Reactivity (D-13/D-14 Gap Closure) Summary

Added per-child `childLanguageTracker: WeakMap<EditorView, string>` on the
`LeetCodePlugin` instance and migrated Gate 3 of the fm-reactivity listener
to read the child's currently-applied language slug from the tracker
instead of from the parent fence opener tag. Both dispatch sites — chevron
switch path (`dispatchChildLanguageReconfigure`) and fm-reactivity listener
(`handleFmChangeForLanguageReactivity`) — now write to the tracker after a
successful `Compartment.reconfigure` dispatch. Closes 17-UAT.md Issue 3
(Test 12) — round-trip Java → Python3 → Java fm swaps now dispatch
symmetrically; Plan 17-04 invariants (effect-only dispatch, D-14, Pitfall 3
dedupe) preserved verbatim.

## Context

**17-UAT.md Test 12 (D-13/D-14 fm reactivity)** reported asymmetric
round-trip behavior:

- **Java → Python3 fm swap:** chevron updates AND child editor syntax
  coloring flips to Python3 (works correctly).
- **Python3 → Java fm swap (reverse):** chevron updates BUT child editor
  syntax coloring stays Python3 (broken).

**Root cause** (validated against `src/main.ts:2613-2641`
`readActiveFenceSlug`): Gate 3 in `handleFmChangeForLanguageReactivity`
called `this.readActiveFenceSlug(file)` which parses the slug from the
parent's FENCE OPENER TAG. Per D-14 the fm-reactivity listener does NOT
rewrite the fence opener — so the opener NEVER changes via this path.
After the first Java → Python3 swap the child reconfigures to Python3 but
the parent fence opener still says ` ```java `. On the reverse Python3 →
Java swap Gate 3 reads `currentSlug = readActiveFenceSlug(file) = 'java'`
(from the unchanged opener tag), compares to `fmLangRaw = 'java'`, finds
them equal, and short-circuits — no `Compartment.reconfigure` dispatch
fires, child syntax stays Python3.

The bug is structural: D-14 explicitly decouples the opener tag from the
listener path, so reading "current applied child language" from the opener
tag is unsound.

## Tasks Completed

### Task 1 — Failing round-trip regression tests (RED)

**File:** `tests/main/fmReactivity.test.ts`

Added 4 new `it(...)` blocks to the existing top-level describe block, and
extended `makeFakePlugin` with a `childLanguageTracker: WeakMap<object,
string>` field plus optional `trackedSlug` seeding option:

- **Test 7 — round-trip Java → Python3 → Java BOTH dispatch.** Tracker
  pre-seeded to `'java'` simulating chevron / initial mount having recorded
  the note's starting language. Step A swaps fm to `'python3'` and asserts
  `dispatchMock.calls.length === 1` and `tracker.get(childView) ===
  'python3'`. Step B swaps fm to `'java'` and asserts the cumulative
  dispatch count is **2** and `tracker.get(childView) === 'java'`. **RED on
  current main**: `tracker.set` never happens because the production
  handler does not write to the tracker, so step B asserts fail.
- **Test 8 — Gate 3 dedupe still works after tracker swap.** Tracker
  pre-seeded to `'java'`; fm `'java'`. `activeFenceSlug` deliberately set
  to a DIFFERENT value (`'python3'`) to prove post-fix Gate 3 reads from
  the tracker, not from the helper. Asserts `dispatchMock` not called.
- **Test 9 — empty tracker dispatches even on equal fm.** No `trackedSlug`
  → tracker has no entry. fm `'java'` equals `readActiveFenceSlug='java'`.
  Asserts dispatch fires (post-fix Gate 3 sees `tracker.get=undefined !==
  'java'`) and tracker is now seeded with `'java'`.
- **Test 10 — D-14 across round-trip.** Across all three post-fix
  scenarios above, asserts neither `vault.process` nor
  `fileManager.processFrontMatter` was called.

`npm test -- tests/main/fmReactivity.test.ts` showed 3/4 new tests RED on
current main (Tests 7, 8, 9); Test 10 passed coincidentally because the
D-14 invariant held even on the broken path.

**Commit:** `83f3483` — `test(17-09): add failing round-trip regression tests for fm reactivity`

### Task 2 — Tracker production wiring + Gate 3 migration (GREEN)

**File:** `src/main.ts`

Three changes:

1. **New class field** at line ~256, immediately after `childEditorRegistry`:
   ```ts
   childLanguageTracker: WeakMap<EditorView, string> = new WeakMap();
   ```
   Full JSDoc documents the contract — updated by both dispatch sites,
   read by Gate 3, lazy seeding via dispatch (not at mount time), WeakMap
   auto-GCs on EditorView destruction. Type `EditorView` was already
   imported from `@codemirror/view` at line 106.

2. **Chevron switch tracker.set** in `dispatchChildLanguageReconfigure`
   (line ~2483), inside the existing `try` block, immediately after
   `childView.dispatch({...})`:
   ```ts
   this.childLanguageTracker.set(childView, newSlug);
   ```
   Failed dispatches (caught by the existing catch block) leave the
   tracker untouched — next event retries.

3. **Gate 3 read migration + listener tracker.set** in
   `handleFmChangeForLanguageReactivity` (lines ~2545-2606):
   - Replaced:
     ```ts
     const currentSlug = this.readActiveFenceSlug(file);
     if (currentSlug === fmLangRaw) return;
     ```
     with:
     ```ts
     const currentSlug = this.childLanguageTracker.get(childView);
     if (currentSlug === fmLangRaw) return;
     ```
   - Added inside the existing `try` block, immediately after
     `childView.dispatch({...})`:
     ```ts
     this.childLanguageTracker.set(childView, fmLangRaw);
     ```

Also added a JSDoc note above `readActiveFenceSlug` documenting it is no
longer consumed by the fm-reactivity listener (retained for future callers
and the 17-08 resolver may still need a "what does the fence opener
currently say?" primitive — the diff is smaller without removal).

**File:** `tests/main/fmReactivity.test.ts` (test migration)

Migrated 2 of the 6 existing Plan 17-04 tests to seed
`childLanguageTracker` where Gate 3 dedupe is exercised:

- **Test 2 (Pitfall 3 dedupe):** added `trackedSlug: 'python'` so post-fix
  Gate 3 reads tracker equality. Legacy `activeFenceSlug: 'python'` stub
  preserved as a contract guard against future regressions that
  re-introduce a fence-opener read.
- **Test 5 Scenario B (D-14 dedupe path):** same migration —
  `trackedSlug: 'python'`.

The other 4 existing tests (Tests 1, 3, 4, 5 scenarios A/C/D, 6) are
unaffected — they exercise paths that don't hit Gate 3 equality, or assert
dispatch shape after Gate 3 already passes.

Also fixed two `vi.fn()` typing issues introduced by the new tests using
`fake.childEditorRegistry.get(...)` directly in Step B/C of Tests 7 and 9
— TypeScript strict mode treats `Mock<Procedure | Constructable>` as
not-callable. Cast as `(fn as unknown as (path: string) => object)(...)`
to satisfy the compiler without runtime impact.

**Commit:** `3cffcc0` — `fix(17-09): add childLanguageTracker WeakMap; Gate 3 reads from tracker`

## Verification

| Check | Result |
|---|---|
| `npm test -- tests/main/fmReactivity.test.ts` | **10/10 GREEN** (6 migrated + 4 new) |
| `npm test` (full suite) | **1696 passed, 6 skipped, 0 failures** |
| `npm run build` | clean (tsc -noEmit + esbuild production) |
| `npm run lint` (changed files) | Zero new errors in `src/main.ts` or `tests/main/fmReactivity.test.ts` (88 pre-existing errors in unrelated files — `tests/main/tabMidLine.test.ts`, `tests/solve/VerdictModal.aiDebugButton.test.ts`, etc. — out of scope per fix-attempt-limit + scope-boundary rule) |

### Acceptance criteria audit (all PASS)

| Criterion | Result |
|---|---|
| `tests/main/fmReactivity.test.ts` test count `it()` ≥ 10 | ✓ 10 |
| File contains `childLanguageTracker` (≥ 4 occurrences) | ✓ 12 |
| File contains `round-trip` and `java.*python3.*java` test names | ✓ |
| Test 7 explicitly asserts `dispatchMock.calls.length === 2` after second invocation | ✓ |
| Test 9 asserts `tracker.get(childView) === '<new-slug>'` after dispatch | ✓ |
| `grep -c "childLanguageTracker" src/main.ts` ≥ 4 | ✓ 6 |
| `grep -c "this.childLanguageTracker.set" src/main.ts` = 2 | ✓ (chevron + listener) |
| `grep -c "this.childLanguageTracker.get" src/main.ts` ≥ 1 | ✓ 1 (Gate 3) |
| `grep -c "leetcode.lang-switch" src/main.ts` unchanged from 17-04 baseline | ✓ 7 (unchanged) |
| Zero `this.readActiveFenceSlug` calls inside `handleFmChangeForLanguageReactivity` | ✓ 0 |

## Plan 17-04 Invariants Preserved

The fix is purely additive at one new class field + one new tracker.set in
the existing chevron dispatch try block + one new tracker.set in the
existing listener dispatch try block + one Gate 3 read swap. All Plan
17-04 contracts hold:

- **Effect-only dispatch:** dispatch spec carries no `changes:` payload
  and no `userEvent` annotation. Section-lock changeFilter does not gate
  effect-only transactions per CLAUDE.md §Conventions. Test 6 (D-13
  dispatch shape) still GREEN.
- **D-14 (no fence opener rewrite):** the listener still does not call
  `vault.process` or `fileManager.processFrontMatter`. Test 5 (exhaustive
  guard across 4 scenarios) still GREEN; Test 10 (round-trip across 3
  post-fix scenarios) GREEN.
- **Gate 1 (lc-slug filter):** unchanged. Test 3 still GREEN.
- **Gate 2 (child registered):** unchanged. Test 4 still GREEN.
- **Pitfall 3 dedupe:** preserved — Test 2 GREEN via tracker comparison
  instead of fence-opener parse.
- **Chevron switch user-visible behavior:** unchanged — the tracker.set
  in `dispatchChildLanguageReconfigure` is invisible to the user; the
  existing parent fence opener rewrite + child Compartment.reconfigure +
  `'leetcode.lang-switch'` userEvent are unchanged.

## Deviations from Plan

None — plan executed exactly as written.

The orchestrator's worktree branch was created from an obsolete base
(`740929f`, before the v1.1 PR merge) instead of the expected
`gsd/v1.2-code-editor-experience` HEAD (`25c2931`). Followed the
`<worktree_branch_check>` recovery: asserted HEAD on per-agent branch
(`worktree-agent-a11af30b36f47e7e6`, NOT a protected ref), then
`git reset --hard 25c2931` to align with the expected base. This is the
canonical recovery from the known `EnterWorktree` issue (#2015) and is
not a deviation from the plan content.

One minor in-task fix: the new tests (Tests 7, 9) used
`fake.childEditorRegistry.get(...)` directly to look up `childView` for
post-dispatch tracker assertions. TypeScript strict mode treats
`vi.fn()` Mock as not-callable in the strict signature, so the build
emitted TS2348 errors. Cast the mock fn to a callable signature via
`(fn as unknown as (path: string) => object)(...)` — no runtime impact,
preserves the test's intent. Tracked as part of the GREEN commit, not a
separate deviation.

## Authentication Gates

None.

## Manual UAT Reference

**17-UAT.md Test 12 (D-13/D-14 fm reactivity)** to be re-verified
post-merge:

1. Open a Java problem note in pane A.
2. Without switching focus to pane A, change `lc-language` frontmatter
   from `java` to `python3` (via properties panel or Source mode).
3. Switch focus back to pane A. Verify within ~1s the child editor's
   syntax highlighter flips to Python3.
4. **Reverse leg (the previously broken path):** without changing pane
   focus, change `lc-language` from `python3` back to `java`. Verify the
   child editor's syntax highlighter flips back to Java — this is the
   round-trip symmetry restored by this plan.
5. Repeat with `python3 → cpp → python3` and `java → typescript → java`
   to confirm the symmetry holds across non-default languages too.
6. Verify the parent fence opener tag stays whatever the user originally
   wrote (D-14: listener does NOT rewrite the opener; users who want the
   opener flipped use the chevron).

## Self-Check: PASSED

Files exist:
- FOUND: src/main.ts (modified — 2 tracker.set, 1 tracker.get, 1 field declaration, 1 JSDoc note)
- FOUND: tests/main/fmReactivity.test.ts (modified — 4 new tests, 2 migrations, 1 new fixture option, 2 TS casts)
- FOUND: .planning/phases/17-polish-edge-cases/17-09-SUMMARY.md (this file)

Commits exist:
- FOUND: 83f3483 (test RED — 4 new failing tests)
- FOUND: 3cffcc0 (fix GREEN — production wiring + test migration)

Acceptance criteria — all PASSED (see audit table above).

Plan-level verification:
- Surgical fix: 1 field + 2 tracker.set + 1 tracker.get + 0 new userEvent + 0 new sync ✓
- Plan 17-04 invariants verified ✓
- D-14 invariant verified (Tests 5 + 10 GREEN) ✓
- Pitfall 3 dedupe preserved (Test 2 + Test 8 GREEN) ✓
- Round-trip symmetry restored (Test 7 GREEN — was RED on main) ✓
- 17-UAT.md Test 12 ready for manual re-verification ✓
