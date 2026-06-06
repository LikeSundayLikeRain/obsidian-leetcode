---
quick_id: 260605-vny
slug: fix-widget-cursor-jump-and-char-rollback
status: complete
date: 2026-06-06
commits:
  - b56b286
  - 9217baa
  - bb48ea1
  - 256ba0d
---

# Quick Task 260605-vny: Fix widget cursor-jump and char-rollback (BRAT regression)

## One-liner

Eliminates two BRAT-era inline-widget regressions — cursor jumping to position 0 mid-typing, and 1-2 chars of just-typed input being rolled back — by closing three race windows around the DebouncedWriter flush boundary.

## Root cause recap

The debug session traced both BRAT symptoms to a shared race window: the user typing during the user's own ~500ms DebouncedWriter flush. Three confirmed root causes drive it:

1. **DebouncedWriter race** (`src/widget/debouncedWriter.ts:237-241`) — the `finally` block resets `pending = false` BEFORE Obsidian's `vault.on('modify')` macrotask fires. Both `writer.hasPending()` gates downstream fail open during that window.
2. **Dead syncHandle gate** (`src/widget/liveModeViewPlugin.ts:159`) — `mountLeetCodeWidget` passes `undefined` for `syncExtension`, so `candidate.syncHandle` is permanently undefined in production. The optional-chain `?.hasPending?.()` returns `undefined !== true`, so the rollback-prevention gate at line 159 never fires.
3. **Catch-fallback cursor slam** (`src/widget/liveModeViewPlugin.ts:215-219`) — when `ChangeSet.of(spec, oldLen)` throws, the catch fallback set `mappedSelection` to `EditorSelection.cursor(prefixLen)`. When divergence starts at byte 0, prefixLen is 0 → cursor jumps to position 0.

## Fixes

### Fix A — abort dispatch on ChangeSet.of throw (commit `b56b286`)

**File:** `src/widget/liveModeViewPlugin.ts:202-219`

Replaces the `mappedSelection = EditorSelection.create([EditorSelection.cursor(prefixLen)])` fallback in the `catch` block with `continue;`. TypeScript accepts the restructure because `continue` is a control-flow exit, leaving `mappedSelection` definitely-assigned at the dispatch site below. A ChangeSet.of throw implies malformed spec geometry — dispatching anyway is also wrong; skipping the iteration is strictly safer and the next sync trigger reconciles.

### Fix B — child-is-superset guard in pushParentToChild (commit `9217baa`)

**File:** `src/widget/liveModeViewPlugin.ts:165-187` (new block right after the existing `norm(childDoc) === norm(newBody)` check)

When the in-memory child is a strict prefix-extension of the parent body (`normChild.startsWith(normParent)` and the trailing-char delta is ≤8), the trailing chars are by definition just-typed input that the next debounced flush will absorb into the parent. Pushing the parent body now would delete them — the char-rollback primitive. The guard skips the dispatch in that case. Independent of writer state by design: the prefix-superset signature is itself sufficient evidence of pending typing.

### Fix C — strengthened modify-handler self-write detection (commit `bb48ea1`)

**Files:**
- `src/widget/debouncedWriter.ts` — added `private lastFlushCompletedAt = 0;` field; the `finally` block now records the timestamp BEFORE clearing `pending` so observers racing the macrotask see `recentlyFlushed()` even after `hasPending()` flips. New public `recentlyFlushed(thresholdMs = 200): boolean` method.
- `src/main.ts:1430-1456` — new gate after the existing `observedBody === childDoc` backup self-write check. Recognizes typing-during-own-flush exactly: `childDoc.startsWith(observedBody) && childDoc.length - observedBody.length <= 8 && firstMatch.writer?.recentlyFlushed?.(200) === true`. Optional-chain on `recentlyFlushed?.(200)` keeps the gate inert for legacy mounts without the new method.

Without this gate, the modify event fell through to `reloadFromDisk('silent')`, whose full-doc-replace + line/col cursor clamp at `WidgetController.ts:677-700` produced both symptoms simultaneously: typed chars overwritten by stale disk body AND cursor clamped onto a now-shorter line.

### Test update — symptom-case contract change (commit `256ba0d`)

**File:** `tests/widget/parentToChildCursorPreservation.test.ts:237-280`

The Plan-21-17 era "symptom case" test codified the partial fix: caret-mapping prevented cursor-jump but trailing chars were still deleted on every parent reflow. The 260605-vny child-is-superset guard supersedes that — both symptoms are now prevented because the dispatch is skipped entirely. Updated assertions:
- `dispatchSpy not.toHaveBeenCalled()` (the push was skipped)
- `childDoc === oldBody` (trailing 'u' preserved)
- `caret === 13` (end of child doc, not clamped, not 0)

The other nine tests in the file are unaffected — they cover non-prefix-extension reflows where the guard correctly does not match.

## Deviations from plan

- **Test contract update.** The plan listed a single follow-up test for `recentlyFlushed`. After running the full suite I discovered `tests/widget/parentToChildCursorPreservation.test.ts:237` ("the symptom case") asserted the OLD (still-broken) behavior — caret clamps to 12 instead of 0, but trailing 'u' is deleted. The fix supersedes that contract, so I updated the test in lockstep and committed it as `256ba0d` (Rule 1: auto-fix bugs caused by current task changes). Kept it as a separate commit so the three primary fix commits remain atomic and bisectable.
- **`recentlyFlushed` test cases.** Plan suggested "ONE focused test for the recentlyFlushed timestamp behavior." I added three cases (initial-zero, within-window, threshold-expiry) because the boundary semantics matter — `Date.now() - 0 < threshold` is always true if the threshold is positive, which would silently mask the constructor-time false-positive. The three cases together fully pin the contract.
- **No changes to `reloadFromDisk` line/col clamp.** Plan mentioned this as one of the four cited primitives, but Fix C (modify-handler gate) prevents reload-silent from being reached in the typing-during-own-flush case, so the clamp's misbehavior is moot for this regression. Fixes D and E (deferred per plan) remain on the followup list.

## Verification

- `npm run build` — clean (`tsc -noEmit -skipLibCheck` passed; production bundle built).
- `npm test` — `Test Files 240 passed | 1 skipped (241)`, `Tests 2857 passed | 7 skipped (2864)`. The previously-failing `parentToChildCursorPreservation.test.ts:266` is now passing under the updated contract.
- `npm run lint` — `0 errors, 10 warnings`. All 10 warnings are pre-existing `eslint-disable-next-line` directives on diagnostic `console.debug` calls in `src/main.ts` modify-handler that ESLint flags as unused now (the no-console rule was previously stricter at the location). Identical to baseline before this work; not introduced by these commits.

## Files modified

| File | Change |
|------|--------|
| `src/widget/liveModeViewPlugin.ts` | Fix A (catch fallback) + Fix B (child-is-superset guard) |
| `src/widget/debouncedWriter.ts` | Fix C (a) — `lastFlushCompletedAt` field + `recentlyFlushed` method |
| `src/main.ts` | Fix C (b) — strengthened modify-handler typing-during-own-flush gate |
| `tests/widget/debouncedWriter.test.ts` | New `recentlyFlushed()` describe block (3 cases) |
| `tests/widget/parentToChildCursorPreservation.test.ts` | Updated symptom-case contract for child-is-superset guard |

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `b56b286` | fix | abort pushParentToChild dispatch on ChangeSet.of throw instead of slamming cursor to 0 |
| 2 | `9217baa` | fix | skip pushParentToChild during in-flight typing (child-is-superset guard) |
| 3 | `bb48ea1` | fix | strengthen backup self-write detection for typing-during-own-flush |
| 4 | `256ba0d` | test | update parentToChildCursorPreservation symptom case for child-is-superset guard |

## Followup (deferred per plan)

- Fix D and Fix E (named in the original debug session) remain on the followup list. Both targeted the `reloadFromDisk` line/col clamp and the syncHandle wiring respectively. Fix C closes the only path that reaches the clamp during typing-during-own-flush, so D's user-visible impact is shielded; E (wiring `this.syncHandle = ...` in WidgetController) remains a latent dead-gate worth resurrecting before any future refactor that re-enables a child→parent debounce path.

## Self-Check: PASSED

- File `src/widget/liveModeViewPlugin.ts` — FOUND
- File `src/widget/debouncedWriter.ts` — FOUND
- File `src/main.ts` — FOUND
- File `tests/widget/debouncedWriter.test.ts` — FOUND
- File `tests/widget/parentToChildCursorPreservation.test.ts` — FOUND
- Commit `b56b286` — FOUND in `git log`
- Commit `9217baa` — FOUND in `git log`
- Commit `bb48ea1` — FOUND in `git log`
- Commit `256ba0d` — FOUND in `git log`
