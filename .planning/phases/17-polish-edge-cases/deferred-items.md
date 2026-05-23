# Phase 17 — Deferred Items (out-of-scope discoveries)

Pre-existing failures or items that surfaced during plan execution but are
out of scope for the current plan's contract. Logged here per the executor's
SCOPE BOUNDARY rule (only auto-fix issues directly caused by current task).

## 17-03 (Tab mid-line behavior)

### Pre-existing bundle-size test failures

**File:** `tests/foundations/check-bundle-size.test.ts`
**Failing tests:**
- `exits 0 with WARN when 1_170_000 < size <= 1_300_000 (soft warn band)`
- `exits 1 with FAIL when main.js > 1_300_000 bytes (hard limit)`
- `uses HARD_LIMIT=1_300_000 and SOFT_WARN=1_170_000 (1.3 MB ceiling for live streamText consumer)`

**Confirmed pre-existing:** `git stash` baseline run reproduces the same
3 failures with no plan changes applied (verified during 17-03 Task 2).

**Why deferred:** Plan 17-03 only modified the Tab keymap in
`src/main/childEditorFactory.ts` and added two named exports. No language
packs were added, no AI SDK changes, no bundle-size impact. The bundle-size
test failure is unrelated to D-11/D-12 and was failing before this plan
started.

**Suggested resolution:** A separate phase or quick task should adjust
either the bundle-size threshold constants in `scripts/check-bundle-size.mjs`
or the test fixture, or investigate genuine bundle-size growth from a prior
phase. Not blocking for v1.2 Phase 17 polish work.

## 17-05 (Themed HighlightStyle + bracket-match contrast)

### Same pre-existing bundle-size test failures
Re-confirmed during 17-05 Task 2 (re-stashed baseline). Same 3 failures in
`tests/foundations/check-bundle-size.test.ts`. Plan 17-05 added a single
small module (`src/main/childEditorTheme.ts`, ~70 LOC source) and removed
one import — no AI SDK touch, no language pack additions. Bundle-size delta
is negligible.
