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

## Plan 17-11 deferred lint errors (pre-existing, out of scope)

Discovered during 17-11 final lint check. None introduced by 17-11 — all
predate the plan (verified via git blame). Logged here per the executor
scope-boundary rule (only fix issues directly caused by current task's changes).

src/main/childEditorFactory.ts (introduced in commits e05731ef, d7bff1f):
  - 44:1 warning — Unused eslint-disable directive (Plan 17-06 left a now-stale
    eslint-disable-next-line for import/no-extraneous-dependencies on the
    @replit/codemirror-vim import; the violation no longer fires).
  - 168:20 error — @typescript-eslint/no-unnecessary-type-assertion on
    `event as KeyboardEvent` inside the Scope register callback (Phase 16
    cmd-slash code).
  - 184:9 warning — obsidianmd/prefer-active-doc on `document.activeElement`
    inside the focus retention plumbing (Phase 16).

tests/main/childEditorFactory.test.ts (introduced in commit c2225e0f):
  - 98:1, 99:1 errors — import/no-extraneous-dependencies for
    @codemirror/view + @codemirror/state (transitive peers of obsidian;
    listed external in esbuild but not in package.json — same pattern as
    childEditorSync.test.ts).
  - 125, 201, 224, 280, 283, 305 errors — @typescript-eslint/unbound-method
    on EditorState.create / keymap.of / EditorView.theme references inside
    `expect(...).toHaveBeenCalled()` assertions (vitest mock-pattern friction;
    fix would require the `as ReturnType<typeof vi.fn>` cast pattern that
    is already applied at line 99-onward but not at the assertion sites).

These do NOT affect runtime, build, or tests (all 1706 pass; build clean).
