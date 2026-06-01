---
slug: fence-auto-recovery-regression
status: resolved
trigger: "Phase 17 D-06b — repairFenceStructure in src/main/childEditorSync.ts:355 is not auto-recovering damaged fence opener/closer correctly. When the user damages the fence opener (e.g., types over the ```python line so the language tag is gone) or fence closer (deletes the trailing ```), the repair function either does not fire, fires but produces a syntactically broken fence, or orphans the body content outside the fence. Surfaced 2026-05-23 from Phase 16 carry-over."
created: 2026-05-23
updated: 2026-05-23
related_phase: 17-polish-edge-cases
related_plan: .planning/phases/17-polish-edge-cases/17-02-PLAN.md
---

## Symptoms

**Expected behavior:**
When the user accidentally damages the fence inside an `lc-slug` note's `## Code` section — by deleting the trailing ` ``` ` closer, or typing over the ` ```python ` opener so the language tag is lost — the next child→parent sync attempt invokes `createChildSyncExtension`'s `findCodeFence` retry path. `findCodeFence` returns null (unterminated fence), `repairFenceStructure` fires within a single keystroke, and the parent doc is restored to a syntactically-intact fence with:

1. An opener line ` ```<active-lang-slug> ` matching the file's `lc-language` frontmatter (or current chevron-driven language).
2. A closer line ` ``` ` placed BEFORE the next `##` heading (or EOF).
3. The user's existing body content (whatever was typed) remaining INSIDE the new fence (between opener and closer), not orphaned above the opener or below the closer.
4. Subsequent child→parent sync mirrors landing cleanly with valid offsets — no echo loops, no lost keystrokes, no offset drift.

**Actual behavior:**

Three concrete failure modes observed via source trace + manufactured test fixtures:

- **Mode A (missing opener — surviving closer reclassified as opener):** When the user damages only the opener (e.g., the ` ```python ` line was overwritten leaving ` class Solution: ` instead) but the closer ` ``` ` is intact, `findCodeFence` returns null because the inner loop walks forward from the surviving ` ``` ` searching for ANOTHER ` ``` ` and never finds one. `repairFenceStructure` then scans the same lines: it locates the single surviving ` ``` ` and treats it as `openerLine`. Since no SECOND fence is found, `closerLine` stays at `-1`. The function falls into the "openerLine !== -1 && closerLine === -1" branch and inserts a new ` ``` ` AFTER the existing one (before `## Notes`). The result: the surviving closer is now the *opener* of an empty fence, and the user's actual body content (e.g. `class Solution: ...`) sits ORPHANED above the new "opener". The body is NOT inside any fence; the language tag is missing.
- **Mode B (missing closer — opener has language tag):** When the user damages only the closer (so the doc has ` ```python\nclass Solution:\n    pass\n\n## Notes`), `findCodeFence` returns null; repair scans, finds the single ` ```python ` as opener, doesn't find a closer, falls into the "missing closer" branch, and inserts ` \n``` ` before `## Notes`. This case actually works — body content stays inside the fence. But it relies on the surviving fence marker being the opener; in Mode A the same logic produces broken output.
- **Mode C (both missing — body content orphaned):** When both opener and closer are damaged (e.g., the user selected the entire fence block and pasted plain code), the doc has just ` ## Code\n<body lines>\n## Notes`. Repair falls into the "both missing" branch and inserts ` ```\n\n```\n ` immediately AFTER the `## Code` heading line. Result: opener and closer with an EMPTY body between them, while the user's actual body content sits BELOW the closer (between the new closer and `## Notes`). Body is orphaned outside the fence.

In addition to the body-orphaning bugs, in ALL repair branches the inserted opener is ` ``` ` with NO language tag — violating the must-have invariant that the post-repair opener match the file's active language slug. The chevron and the file's `lc-language` frontmatter would now disagree with the fence opener — the same 4-sources-of-truth divergence pattern that the Phase 16 reset-code-language-regression debug session already attacked at a different layer.

**Error messages:**
None. Failures are silent — `repairFenceStructure` returns `true` (it dispatched changes), the post-repair `findCodeFence` retry succeeds (it finds the new opener+closer pair), and the child→parent sync proceeds against the new (incorrect) offsets. The user observes their typed code disappearing from the fence body, or their fence opener becoming language-less. No console errors fire.

**Reproduction:**

1. Open an `lc-slug` Java problem note in the dev vault. Confirm fence opens as ` ```java ` and contains a Java solution.
2. In the parent editor (Source Mode for direct keystroke access), select the line ` ```java ` and overwrite it with `class Solution {` (deleting the language-tagged opener).
3. Type a single character anywhere in the body (or trigger any child→parent sync via the child editor's update listener).
4. Observe the parent doc: a new ` ``` ` line has been inserted BEFORE `## Notes` (or the next ` ## ` heading), and the user's earlier body content is now ABOVE the new "opener" — orphaned.
5. Observe the chevron: it still says Java, but the fence opener has no language tag. The chevron's source-of-truth (frontmatter `lc-language`) is `java`, the active fence opener tag is empty — divergence.

## Hypotheses

The four hypotheses enumerated in CONTEXT D-06c are evaluated below.

### (a) Opener/closer detection mis-classifies the user's edit (so repair never triggers correctly)

**What it predicts:** The diff path between user keystroke and `repairFenceStructure` dispatch fails to identify which marker is missing, leading to wrong-marker insertion. Specifically: `repairFenceStructure` cannot distinguish a surviving CLOSER from a surviving OPENER because both match the same `^\s*\`\`\`` regex.

**Probe:** Static source trace of `src/main/childEditorSync.ts:360-414` (the FENCE_RE scan in repair). Verified: `FENCE_RE = /^\s*\`\`\`/` matches BOTH ` \`\`\`python ` and ` \`\`\` ` — there is no language-tag awareness. The first match in the Code section is unconditionally assigned to `openerLine`, the second to `closerLine`. When the user damages the opener but leaves the closer, the surviving closer gets misclassified as the opener.

Cross-referenced against `src/main/codeActionsEditorExtension.ts:177-212` (`findCodeFence` SSoT): same FENCE_RE pattern; same blindness to language tag. So the misclassification is consistent across both detection paths but NEITHER path's blindness is the root cause of the WRONG-MARKER-INSERTION bug — the bug is repair's INSERTION logic which assumes the first surviving fence is always the opener.

**Result:** Confirmed. With the missing-opener fixture (surviving closer only), `repairFenceStructure` inserts a new ` ``` ` AFTER the surviving fence and BEFORE `## Notes` — orphaning the body. With the both-missing fixture, the body sits below the inserted closer because repair inserts ` ```\n\n```\n ` immediately after `## Code` regardless of where the user's body content actually is.

**Verdict:** **CONFIRMED — primary root cause.**

### (b) Repair triggers but `ECHO_PRONE_USER_EVENTS` swallows on the listener side

**What it predicts:** `repairFenceStructure` dispatches with `userEvent: 'leetcode.fence-repair'` (line 422). The set `ECHO_PRONE_USER_EVENTS` in `src/main/nestedEditorExtension.ts:265-268` contains `'leetcode.fence-repair'`. The `externalChangeListener` at line 316-326 skips parent→child propagation for any userEvent in that set. So the child never observes the repair, the child's view of the fence body diverges from the parent.

**Probe:** Read `src/main/nestedEditorExtension.ts:265-326`. Confirmed `'leetcode.fence-repair'` is in the set; `externalChangeListener` returns early when `ECHO_PRONE_USER_EVENTS.has(ev)` is true (line 319). Read the comment block at lines 244-264 — Phase 14 D-05 design intentionally skipped repair from parent→child mirror because "repair only inserts marker characters and never touches body content". The child has its own document and doesn't need to observe marker insertions.

**Verdict:** **REFUTED.** This skip is INTENTIONAL and correct given the Phase 14 design. The child's body content is not affected by marker insertions when repair works correctly. The bug is upstream — repair produces the WRONG markers (hypothesis a). Removing `'leetcode.fence-repair'` from `ECHO_PRONE_USER_EVENTS` would NOT fix the visible symptom (body orphaning); it would propagate marker-only changes to the child unnecessarily and could trip the child's own doc-update path. The skip-set design is sound; the bug is in repair's structural reasoning.

NOTE: There is a real concern that fence repair can shift `bodyEnd` in the parent (because closer line moves), so the post-repair sync path in `createChildSyncExtension` line 102 is the correct place to reconcile — and it does so by full-replacing the parent body slice with the child's current content. This is the "CR-04 fix" comment at line 100-115. So the parent→child mirror skip for repair is fine; the parent→child reconciliation happens via the full-replace dispatch which uses fresh post-repair offsets.

### (c) Repaired offsets are stale relative to the parent's current doc state

**What it predicts:** After `repairFenceStructure(parentView)` returns, the line at line 102 of `childEditorSync.ts` re-reads `parentView.state` to call `findCodeFence(parentView.state)`. If `parentView.state` were not synchronously updated to reflect the repair dispatch, the retry would return stale offsets (or null again).

**Probe:** Read CM6 `EditorView.dispatch` semantics: dispatches are synchronous; `view.state` reflects the post-dispatch state immediately on return. Verified by reading `src/main/childEditorSync.ts:102-106` — the retry reads `parentView.state.doc.line(...)` directly after `repairFenceStructure(parentView)` returns. If the dispatch landed (which it does when `repair` returns true), `parentView.state` is fresh.

**Result:** Inspection of CM6 source contracts and existing test `tests/main/childEditorSync.test.ts:601-733` (which exercises the repair function and asserts `parentView.dispatch` was called) confirms the dispatch is synchronous in our mock; in production it's also synchronous (CM6 documented behavior).

**Verdict:** **REFUTED.** Offsets ARE fresh post-dispatch. The retry reads correctly; what it reads is INCORRECT (the wrongly-positioned opener/closer from hypothesis a) but not stale.

### (d) Repair fires but section lock or another transaction filter drops the dispatch

**What it predicts:** The repair dispatch carries `userEvent: 'leetcode.fence-repair'`. `src/main/sectionLockExtension.ts` has a `changeFilter` that should pass `'leetcode.*'` userEvents through Gate 1 (line 389), but a regression there could be silently dropping the repair dispatch entirely.

**Probe:** Read `src/main/sectionLockExtension.ts:354-432`. Gate 0 (lines 375-381) tests for user-input userEvents — if NOT a user input, returns `true` (no suppression — passes through). Programmatic dispatches like `'leetcode.fence-repair'` are not user-input prefixes (`input.*`/`delete.*`/`undo`/`redo`), so they pass Gate 0 unconditionally. Gate 1 (line 389) is the explicit `'leetcode.*'` bypass — currently unreachable because Gate 0 already exits, but kept as defense-in-depth.

**Result:** Section lock does NOT drop `'leetcode.fence-repair'` dispatches. They thread through both Gate 0 (programmatic, not user-input) and the legacy Gate 1 (`'leetcode.*'` prefix). Existing test `tests/main/childEditorSync.test.ts:601-733` confirms the dispatch lands and modifies the doc.

**Verdict:** **REFUTED.** The dispatch is not being dropped. It's landing — but with WRONG content (hypothesis a).

## Current Focus

hypothesis: "Hypothesis (a) — `repairFenceStructure` mis-classifies which marker is missing because its FENCE_RE pattern (`^\\s*\\`\\`\\``) cannot distinguish a fence opener (which has a language tag) from a fence closer (which doesn't). When only the opener is damaged, the surviving closer is treated as the opener and a new closer is inserted after it — orphaning the body content. When both are missing, opener+closer are inserted immediately after `## Code` regardless of where the user's body content actually is, leaving the body OUTSIDE the new fence."
test: "Build damaged-fence parent fixtures via `tests/main/childEditorSync.test.ts:77-97`'s `makeMockParentView`/`makeStateForLockTests` pattern; assert that for missing-opener and both-missing inputs, `repairFenceStructure` produces a result where the user's body content is INSIDE the fence (between the new opener and new closer) AND the new opener carries the active language tag."
expecting: "Confirm the misclassification + missing-language-tag bugs via assertions on the dispatch payload. Then refactor repair to (1) explicitly determine which marker is missing by inspecting the surviving marker's language tag (opener has one, closer doesn't), and (2) include the active language slug in the inserted opener via a new `activeSlug` parameter or by reading the file's `lc-language` frontmatter through the parent state."
next_action: "Author the regression test fixture in `tests/main/childEditorSync.repair.test.ts` covering all four cases (intact / missing-opener / missing-closer / both-missing) plus the post-repair child-sync invariant. The test must currently FAIL on `main` for the missing-opener and both-missing cases (proving the regression). Then apply the fix and turn the test GREEN."
reasoning_checkpoint: ""
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-05-23 (E1)
  source: src/main/childEditorSync.ts:355-430 (`repairFenceStructure`)
  finding: |
    The FENCE_RE pattern at line 362 is `/^\s*\`\`\`/`. It does NOT distinguish opener from closer. The scan at lines 386-395 unconditionally assigns the FIRST match to `openerLine` and the SECOND to `closerLine`. There is no consultation of language-tag presence to disambiguate. The repair branches at lines 401-414 assume `openerLine !== -1` means the opener survives — wrong when the surviving marker is actually the closer.

    Additionally, the inserted opener strings are hardcoded:
    - Both missing: `'```\n\n```\n'` (line 405) — empty language tag
    - Missing opener only: `'```\n'` (line 409) — empty language tag
    - Missing closer only: `'\n```'` (line 413)

    The active language slug is never threaded through. The function signature `repairFenceStructure(parentView: EditorView)` does not accept a slug parameter and does not read `lc-language` frontmatter from the file behind `parentView`.

- timestamp: 2026-05-23 (E2)
  source: src/main/codeActionsEditorExtension.ts:177-212 (`findCodeFence`)
  finding: |
    The SSoT for fence detection. Same FENCE_RE pattern (line 183). When a single ` ``` ` survives in the Code section, `findCodeFence` enters the inner loop at line 203 looking for a SECOND fence; finds none; returns null (line 208). So `createChildSyncExtension:96` correctly identifies the damaged state and falls through to `repairFenceStructure`. The bug is downstream in repair's classification logic, not in detection.

- timestamp: 2026-05-23 (E3)
  source: src/main/nestedEditorExtension.ts:265-326 (`ECHO_PRONE_USER_EVENTS` + `externalChangeListener`)
  finding: |
    `'leetcode.fence-repair'` IS in the skip set (line 267) — confirming hypothesis (b) trigger. Reading the comment block at lines 244-264 carefully: Phase 14 D-05 design intentionally skips repair from parent→child propagation because repair only inserts marker characters. The child has its own doc; marker insertions don't affect child body content. The architectural rationale is sound IF repair behaves correctly. The bug is that repair behaves INCORRECTLY (orphans body content per hypothesis a), but removing `'leetcode.fence-repair'` from the set does NOT fix orphaning — it just adds noise to the child's update path.

    **Conclusion:** Do NOT modify `ECHO_PRONE_USER_EVENTS`. The skip is correct. Fix repair (hypothesis a).

- timestamp: 2026-05-23 (E4)
  source: src/main/sectionLockExtension.ts:354-432 (`changeFilter`)
  finding: |
    Gate 0 (lines 375-381) returns true (no suppression) for any non-user-input userEvent. `'leetcode.fence-repair'` is not in `('input.', 'delete.', 'undo', 'redo')` so it passes Gate 0 unconditionally. Gate 1 (line 389) is unreachable for our case but provides additional `'leetcode.*'` defense-in-depth. Repair dispatches are not dropped by the section lock.

- timestamp: 2026-05-23 (E5)
  source: src/main/childEditorSync.ts:82-121 (`createChildSyncExtension`)
  finding: |
    The retry at line 102 (`findCodeFence(parentView.state)`) reads the synchronously-updated state after repair dispatch. If repair landed (returned true) the state is fresh. The full-replace dispatch at lines 107-115 mirrors the child's CURRENT body content into the new bodyStart..bodyEnd range. **Critical observation:** when repair (with hypothesis-a bug) places opener+closer at WRONG positions, the bodyStart..bodyEnd range derived at lines 104-105 points to the WRONG region of the parent doc. The full-replace then writes the child's body INTO that wrong region, sometimes OVERWRITING the user's body content (which is now sitting outside the fence due to repair's misclassification).

    **Knock-on effect:** Once the child→parent full-replace fires after broken repair, the parent doc has TWO copies of the body content (one inside the broken fence position, one orphaned outside). On the next user keystroke, `findCodeFence` re-runs against this even-more-broken state and returns... whatever it finds first. The state spirals.

- timestamp: 2026-05-23 (E6)
  source: tests/main/childEditorSync.test.ts:601-733 (existing repair tests)
  finding: |
    Existing tests exercise `repairFenceStructure` and assert `dispatch` was called and that the inserted strings contain ` ``` `. They do NOT assert: (1) that the user's body content ends up INSIDE the new fence, (2) that the inserted opener carries the active language tag, (3) that the post-repair `findCodeFence` retry returns offsets pointing at a fence that ENCLOSES the body. The existing tests are happy-path correctness for the dispatch shape; they miss the structural correctness invariant.

    **Implication:** Existing tests will continue to pass after the fix because they assert only on dispatch shape; new regression tests in `tests/main/childEditorSync.repair.test.ts` must assert the structural invariant (body inside fence, opener tag matches active slug, post-repair fence is well-formed).

## Eliminated

- **(b)** `ECHO_PRONE_USER_EVENTS` is not the cause; the skip is intentional and the bug is upstream in repair's classification.
- **(c)** Offsets are fresh post-dispatch; CM6 dispatch is synchronous.
- **(d)** Section lock passes `'leetcode.fence-repair'` through unfiltered (both Gate 0 and Gate 1).

## Confirmed Root Cause

`src/main/childEditorSync.ts:355-430` `repairFenceStructure` has TWO compounding bugs:

1. **Marker misclassification (primary):** The FENCE_RE pattern matches both opener (with language tag) and closer (without). The scan at lines 386-395 unconditionally treats the FIRST surviving fence as the opener and the SECOND as the closer. When only the opener is damaged (the user typed over the ` ```python ` line) and the closer survives, the surviving closer is misclassified as an opener — a new "closer" is inserted AFTER it, leaving the user's actual body content ORPHANED above the false opener.

2. **Body-position blindness (secondary, in the both-missing branch):** When BOTH markers are missing, repair inserts ` ```\n\n```\n ` immediately after the `## Code` heading line (line 405), regardless of where the user's body content actually sits. This places the user's body OUTSIDE the new fence (below the new closer, above `## Notes`).

3. **Missing language tag (tertiary):** All inserted opener strings hardcode ` ``` ` without a language tag (lines 405, 409). The opener that lands in the doc never matches the file's `lc-language` frontmatter or the chevron's active slug — instant 4-sources-of-truth divergence.

The `ECHO_PRONE_USER_EVENTS` skip in `nestedEditorExtension.ts:265-268` is INTENTIONAL and CORRECT per Phase 14 D-05 design — it does not need to be modified. The bug is fully contained in `repairFenceStructure`.

## Planned Fix Scope

**Files to modify:** `src/main/childEditorSync.ts` only. Specifically `repairFenceStructure` (lines 355-430) and its caller signature in `createChildSyncExtension` (lines 82-121).

**Files NOT to modify:** `src/main/nestedEditorExtension.ts` (the skip set is correct), `src/main/sectionLockExtension.ts` (the changeFilter is correct).

**Fix shape (single-paragraph):**

Refactor `repairFenceStructure` to take an `activeSlug: string` parameter and use language-tag awareness to disambiguate opener from closer. The new scan recognizes a surviving fence as an OPENER iff its line text matches ` ^\s*\`\`\`\S+\s*$ ` (i.e., has a language tag); a fence with no language tag (` ^\s*\`\`\`\s*$ `) is a closer. The fix branches:

- **Surviving opener only** (closer damaged): insert ` \n\`\`\` ` BEFORE the next ` ## ` heading (or EOF). Body stays in place between the surviving opener and the new closer.
- **Surviving closer only** (opener damaged): insert ` \`\`\`<activeSlug>\n ` AFTER the `## Code` heading line (and any blank lines between the heading and the body content). Walk forward from the heading to find the FIRST non-blank, non-fence line — that's where the user's body starts; insert the new opener immediately above it. Body stays in place between the new opener and the surviving closer.
- **Surviving neither** (both damaged): scan from the `## Code` heading to find the user's body content (any non-blank line that is not itself a fence marker). Insert the opener ` \`\`\`<activeSlug>\n ` IMMEDIATELY ABOVE the first body line and the closer ` \n\`\`\` ` IMMEDIATELY BELOW the last body line (where "last body line" = last non-blank line before the next `##` heading or EOF). Body content is preserved INSIDE the new fence.
- **Surviving both** (intact): return `false` — nothing to repair.

The caller `createChildSyncExtension` is updated to derive `activeSlug` from the file's `lc-language` frontmatter (via `editorInfoField` + the plugin's metadataCache) with a fallback to `'python3'` (matching the convention in `src/main/nestedEditorExtension.ts:216`). When called from `createChildSyncExtension`, the slug is read once at sync time (no additional caching needed).

The dispatch annotation `userEvent: 'leetcode.fence-repair'` is unchanged. The Phase 14 `ECHO_PRONE_USER_EVENTS` skip remains intact — repair still touches only marker lines (it now ALSO inserts content with the language tag, but the body-content lines are not touched/shifted; they retain their character positions in the parent doc only when the repair correctly identifies which marker is missing). After repair, the post-repair `findCodeFence` retry at `childEditorSync.ts:102` returns valid offsets that ENCLOSE the user's body content, and the subsequent full-replace at lines 107-115 mirrors the child's body into the correct region.

A `// Phase 17:` comment block at the modified lines points readers to this debug doc and explains the marker-disambiguation invariant. CLAUDE.md `## Conventions` block does NOT need an update (no new userEvent; existing `'leetcode.fence-repair'` semantics preserved).

## Resolution

root_cause: |
  `src/main/childEditorSync.ts:355-430 repairFenceStructure` mis-classifies
  which fence marker survived because its FENCE_RE pattern is opener/closer
  agnostic. When only the opener is damaged, the surviving closer is treated
  as the opener and a new closer is inserted after it — orphaning the body.
  When both are missing, opener+closer are inserted immediately after
  `## Code` regardless of where the user's body content actually sits — also
  orphaning it. Compounded by the inserted opener never carrying a language
  tag, the chevron / lc-language frontmatter / fence-opener tag diverge
  immediately. The `ECHO_PRONE_USER_EVENTS` skip in
  `nestedEditorExtension.ts` is INTENTIONAL and not part of the bug.

fix: |
  Refactored `repairFenceStructure` to accept an `activeSlug: string`
  parameter and use language-tag presence to disambiguate opener from
  closer. New OPENER_RE = /^\s*```\S+\s*$/ matches an opener; CLOSER_RE =
  /^\s*```\s*$/ matches a closer; FENCE_RE matches either. The four branches
  (surviving-opener / surviving-closer / surviving-both / surviving-neither)
  each preserve the user's existing body content INSIDE the new fence. The
  surviving-neither branch scans for the actual body lines and inserts the
  opener ABOVE them and the closer BELOW them. The surviving-closer branch
  inserts the new opener at the start of the body region (after `## Code`
  + any blank lines). All inserted opener strings carry the activeSlug.

  Caller `createChildSyncExtension` reads the file's `lc-language`
  frontmatter via the plugin host's metadataCache (already wired into the
  signature for `detectAndPropagateExternalChange`) and threads the slug
  through to `repairFenceStructure`. The plugin host parameter is added to
  `createChildSyncExtension`'s signature, mirroring the pattern in
  `detectAndPropagateExternalChange` (childEditorSync.ts:186-241).

verification: |
  - npm test -- tests/main/childEditorSync.repair.test.ts: 5/5 pass (was 3/5
    failing on main pre-fix — RED state confirmed in commit de2f54c).
  - npm test -- tests/main/childEditorSync.test.ts: 28/28 pass (no Phase 14
    regressions; existing dispatch-shape assertions remain valid).
  - npm run build: clean (tsc -noEmit -skipLibCheck + esbuild production).
  - npm test (full suite): 1645/1654 pass; 3 pre-existing failures in
    tests/foundations/check-bundle-size.test.ts are stale-threshold assertions
    (`HARD_LIMIT=1_300_000` expected; actual is `1_600_000` per Phase 16 D-19)
    UNRELATED to this fix and predate Phase 17 — same failures observed in
    Phase 16 reset-code-language-regression debug session.
  - 6 skipped tests are pre-existing (not introduced by this plan).
  - 0 new console.debug or instrumentation in src (verified via
    `grep -c "console.debug" src/main/childEditorSync.ts src/main/nestedEditorExtension.ts`).

files_changed:
  - src/main/childEditorSync.ts (repairFenceStructure refactor + caller signature update + readLcLanguageFromDoc helper)
  - tests/main/childEditorSync.repair.test.ts (NEW — regression fixture)

final_commit_sha: f7c4d8a (Task 3 — fix + debug doc verification update)
plan_commits:
  - e609c05 (Task 1 — debug doc with hypothesis enumeration + root cause)
  - de2f54c (Task 2 — RED-state regression test fixture)
  - f7c4d8a (Task 3 — GREEN fix: marker-disambiguation + body-aware insertion + activeSlug threading)
