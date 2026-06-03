---
phase: 20-reconciliation-ux-action-row-section-protection
type: fix
fixed_at: 2026-05-31T00:30:00Z
review_path: .planning/phases/20-reconciliation-ux-action-row-section-protection/20-REVIEW.md
iteration: 1
findings_in_scope: 21
fixed: 16
skipped: 5
status: partial
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-05-31
**Source review:** .planning/phases/20-reconciliation-ux-action-row-section-protection/20-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 21 (6 BLOCKER + 15 WARNING)
- Fixed: 16 (6 BLOCKER + 10 WARNING)
- Skipped: 5 (subordinate / out-of-scope refactor)
- Status: partial — all BLOCKERs fixed; 5 WARNINGs deferred for cause documented below

**Verification:** TypeScript `tsc --noEmit -skipLibCheck` passes cleanly. Full vitest suite — **2075 passed, 6 skipped, 0 failed** across 237 test files. ESLint error count holds at the pre-fix baseline (30 errors on the 8 modified files, all pre-existing).

## Fixed Issues

### BL-04: DebouncedWriter / selfWriteSuppression mismatch
**Files modified:** `src/main.ts`
**Commit:** 426509c
**Applied fix:** Restored `selfWriteSuppression.tryConsume(file.path, observedHash)` as step (c) of the `vault.on('modify')` decision tree. The DebouncedWriter still arms the suppression entry before every `vault.process`; without the consume, the map grew monotonically and post-flush echoes opened a ConflictModal during normal typing because `writer.hasPending()` was still true through the entire flush body. The existing `observedBody === childDoc` check survives as a fail-safe for the stale-TTL / hash-mismatch race.

### BL-01 + WR-15: Parking lot dispose on plugin unload
**Files modified:** `src/widget/WidgetController.ts`, `src/main.ts`
**Commit:** e273981
**Applied fix:** Added `LeetCodeWidgetRenderChild.disposeParkingLot()` static. `Plugin.onunload` calls it after `widgetRegistry.destroyAll()` so the lot div is detached from `document.body` and the static reset to null. CommonJS module cache no longer pins a dead pointer across plugin enable/disable (WR-15 root cause). The `onload` fall-through catch now destroys + unregisters the stale entry before mounting fresh, plugging the leak path cited in the review.

### BL-02: Adoption alive-check
**Files modified:** `src/widget/WidgetController.ts`
**Commit:** dbdc132
**Applied fix:** The adoption predicate now checks `view.contentDOM` presence and `view.destroyed` flag (cast through `unknown` because `destroyed` is private at the type level). A destroyed-view match no longer chains into BL-03's spin loop. The check runs BEFORE the leaf-ownership compare so dead entries are skipped even when their leaf would otherwise match.

### BL-03: rAF refocus retry budget cap
**Files modified:** `src/widget/WidgetController.ts`
**Commit:** d7d61fc
**Applied fix:** Capped the `requestAnimationFrame(refocus)` recursion at 60 attempts (~1s @ 60fps). Also bails early on `view.destroyed === true`. Production contentDOM reattaches in 1-2 frames so the cap is a safety net, not normal-path tuning.

### BL-05: pushParentToChild active-typing gate
**Files modified:** `src/widget/liveModeViewPlugin.ts`
**Commit:** 75a8d6d
**Applied fix:** Skip the parent→child push when `widget.writer?.hasPending() === true`. Auto-save reload no longer races a keystroke into a full-doc replace that clamps vim cursor to end of doc. When the writer is idle, the equality short-circuit handles the common case anyway.

### BL-06: Hide stale source field, coordinate destroy with parking lot
**Files modified:** `src/widget/LeetCodeFenceWidget.ts`
**Commit:** c9502ef
**Applied fix:** Changed `public readonly source` to `private readonly source`. The single legitimate use site (toDOM seed) keeps working; external readers can no longer grab the misleading first-observed value. Also: `destroy(_dom)` checks whether `ctl.container.parentElement` has the `.lc-widget-parking-lot` class — if so, leave the controller alive in the registry so the upcoming RenderChild.onload adopts it instead of finding nothing and mounting fresh.

### WR-08: Remove unused parentView parameter
**Files modified:** `src/widget/WidgetController.ts`, `src/widget/LeetCodeFenceWidget.ts`
**Commit:** de3802c
**Applied fix:** Dropped `parentView?: EditorView` from `mountLeetCodeWidget`. Removed the parent-view resolution block in `LeetCodeWidgetRenderChild.onload` that walked `workspace.getActiveViewOfType(MarkdownView)`. Removed the `view` argument forwarding in `LeetCodeFenceWidget.toDOM`. The parameter was Plan 20-09's intended seed for `createChildParentSyncExtension(parentView, ...)` but the sync extension was never wired in — the typing path now relies on Obsidian's editor auto-save plus the BL-04-restored tryConsume gate.

### WR-14: Drop misleading optional chains in eq()
**Files modified:** `src/widget/LeetCodeFenceWidget.ts`
**Commit:** 6194d04
**Applied fix:** Changed `other.file?.path === this.file?.path` to `other.file.path === this.file.path`. `file: TFile` is contractually non-null. The chains masked a real hazard: two widgets with `undefined` files would compare equal and CM6 would reuse the wrong DOM. A null file should TypeError loudly; the recovery is "don't construct without a file", not "silently treat two missing files as identical".

### WR-12: Clear rate-limit timer in forceFlush
**Files modified:** `src/widget/debouncedWriter.ts`
**Commits:** 7654178, e4b881a
**Applied fix:** `forceFlush` now clears `this.rateLimitTimer` before re-entering `flush()`. Without this, calling `forceFlush` during the rate-limit defer window produced two `vault.process` calls — one from the immediate flush and a second from the deferred timer firing later with possibly stale `getDoc()` content. Used `window.clearTimeout()` per the project's popout-window compatibility lint rule.

### WR-11: Remove mousedown listeners on widget destroy
**Files modified:** `src/widget/WidgetController.ts`
**Commit:** 85ba0ad
**Applied fix:** Captured both mousedown listener references at attach time. Added a public `destroyHooks: Array<() => void>` field on `WidgetController`; `mountLeetCodeWidget` pushes a closure that removes both listeners. `destroy()` drains the array before `view.destroy()` so the cleanup can still touch `view.dom`. The hooks array also serves as a structural seam for future mount-time resources to register their own teardown.

### WR-09: Deterministic adoption preference
**Files modified:** `src/widget/WidgetController.ts`
**Commit:** e3065dc
**Applied fix:** Replaced `.find()` over `Map.values()` with `.filter()` + explicit preference: parked controllers (no active pane to disrupt) win over leaf-attached; within each bucket prefer the most recently registered (last entry in insertion-order Map). Falls back to the last leaf-attached entry when no parked match exists.

### WR-03: Multi-signal Reading-mode detection
**Files modified:** `src/widget/codeBlockProcessor.ts`
**Commit:** 6bc1a2e
**Applied fix:** Reading-mode detection now prefers local DOM signals (`elReading`, `ctxReading`) when `ctx.containerEl.isConnected`. Only falls back to `getActiveViewOfType(MarkdownView)?.getMode() === 'preview'` when ctx is detached (pre-render fragment). With a Reading pane focused while an LP pane re-renders, the LP widget no longer mounts as read-only.

### WR-04: Defer hadFocusBeforeUnload reset to rAF terminal
**Files modified:** `src/widget/WidgetController.ts`
**Commit:** 601d9f5
**Applied fix:** Moved the flag reset into the rAF terminal exits (budget exhaustion, view-missing, view-destroyed, successful focus, throw). When `shouldRefocus` is false (non-typing pane onload), do NOT reset — leave the flag intact so the typing pane's subsequent onload can still claim focus. Multi-pane focus theft is no longer possible when onload order is reversed.

### WR-05: Per-path index for hot-path registry lookups
**Files modified:** `src/widget/widgetRegistry.ts`, `src/widget/liveModeViewPlugin.ts`
**Commit:** 6a74205
**Applied fix:** Added `byPath: Map<string, Set<WidgetControllerLike>>` to `WidgetRegistry`, populated by `set()` and pruned by `delete()`/`destroyAll()`. Exposed `valuesForPath(path)` iterator. `pushParentToChild` prefers it when available; falls back to the full `values()` walk for structural test fixtures. Per-keystroke cost in large vaults drops from O(N) to O(matching widgets for the active file).

### WR-01: SelfWriteSuppression caller commentary
**Files modified:** `src/widget/selfWriteSuppression.ts`
**Commit:** 885d0d9
**Applied fix:** Updated the header comment to list the actual live callers of `arm()` and `tryConsume()`. The previous "single remaining caller of arm()" claim was inaccurate; it became fully accurate again with BL-04's restoration of `tryConsume`.

## Skipped Issues

### WR-02: Multi-pane registryKey doesn't update on adoption migration
**File:** `src/widget/WidgetController.ts:1278-1340`
**Reason:** skipped: code context — implementing requires unfreezing `registryKey` from `public readonly`, then re-keying the registry under the new key, and updating `LeetCodeFenceWidget.mountedCtlKey` semantics. That's a registry-contract refactor beyond review-fix scope. There's no current consumer that parses leafId out of `registryKey` at runtime — the multi-pane coordinator uses container DOM walks, not key parsing — so the bug is theoretical for now.
**Original issue:** After leaf A→B adoption, controller's `registryKey` still encodes leafA's leafId. Future code reasoning about registry-key-to-leaf will be wrong.

### WR-06: addToHistory.of(false) doc/code drift
**File:** `liveModeViewPlugin.ts:202` (also references SUMMARY.md)
**Reason:** skipped: out-of-scope — this is a doc drift in `20-09-SUMMARY.md` claiming the annotation was "removed" while the code still passes it correctly. The CODE is correct (`addToHistory.of(false)` is load-bearing on the parent→child push so we don't pollute the child's redo stack on auto-save reloads). Fixing the SUMMARY is a planning-doc cleanup, not a source code review fix.
**Original issue:** SUMMARY says "removed", but code at `liveModeViewPlugin.ts:202` still passes it. Document or code is wrong.

### WR-07: childParentSync.ts factory is dead code
**File:** `src/widget/childParentSync.ts`
**Reason:** skipped: code context — deleting `createChildParentSyncExtension` would also require deleting the 286-line `tests/widget/childParentSync.test.ts` suite that exercises the factory. The factory's tests (and its dispatch + echo gate semantics) are still useful as a reference if the typing-path sync is re-introduced later. Carrying dead code with a comment is the lower-cost option here. The dead import in `WidgetController.ts:68` was rendered semantically harmless by WR-08's parameter removal — there's no remaining call site that could "look like" it's wired.
**Original issue:** Carrying the dead factory creates a strong attractor for future readers to think typing-path sync is wired. Delete or move syncAnnotation to a tiny dedicated module.

### WR-10: Unused imports in dead childParentSync (subordinate to WR-07)
**File:** `src/widget/childParentSync.ts`
**Reason:** skipped: subordinate to WR-07 — would require deleting the test file as well. See WR-07 reasoning.
**Original issue:** Subordinate to WR-07.

### WR-13: Magic number 500 vs 300 mismatch
**Files:** `src/widget/WidgetController.ts:1095` (500ms) + `src/widget/childParentSync.ts:30` (300ms)
**Reason:** skipped: not actually conflicting — the 500ms is the disk-flush debounce (`DebouncedWriter.delayMs` default; user-tunable via settings); the 300ms is a child→parent CM6 sync debounce in `childParentSync.ts` (currently dead code per WR-07). They serve different operations with different semantic budgets. Consolidating them would muddle two unrelated timeouts.
**Original issue:** Future reader confusion. Pick one shared constant.

---

## Commit list (chronological)

```
426509c fix(20): BL-04 restore selfWriteSuppression.tryConsume in modify handler
e273981 fix(20): BL-01+WR-15 dispose parking lot on plugin unload
dbdc132 fix(20): BL-02 alive-check in adoption predicate
d7d61fc fix(20): BL-03 cap rAF refocus loop retry budget
75a8d6d fix(20): BL-05 active-typing gate in pushParentToChild
c9502ef fix(20): BL-06 hide stale source field, coordinate destroy with parking lot
de3802c chore(20): WR-08 remove unused parentView parameter from mountLeetCodeWidget
6194d04 fix(20): WR-14 drop misleading optional chains in LeetCodeFenceWidget.eq
7654178 fix(20): WR-12 clear rate-limit timer in forceFlush
85ba0ad fix(20): WR-11 remove mousedown listeners on widget destroy
e3065dc fix(20): WR-09 deterministic adoption preference
6bc1a2e fix(20): WR-03 prefer local DOM over global mode in reading detection
601d9f5 fix(20): WR-04 defer hadFocusBeforeUnload reset to rAF terminal callback
6a74205 fix(20): WR-05 per-path index for hot-path registry lookups
885d0d9 docs(20): WR-01 update SelfWriteSuppression caller commentary
e4b881a fix(20): WR-12 use window.clearTimeout for popout compatibility
```

## Files modified

- `src/main.ts` (BL-04, BL-01)
- `src/widget/WidgetController.ts` (BL-01, BL-02, BL-03, WR-08, WR-09, WR-11, WR-04)
- `src/widget/LeetCodeFenceWidget.ts` (BL-06, WR-08, WR-14)
- `src/widget/liveModeViewPlugin.ts` (BL-05, WR-05)
- `src/widget/codeBlockProcessor.ts` (WR-03)
- `src/widget/widgetRegistry.ts` (WR-05)
- `src/widget/debouncedWriter.ts` (WR-12)
- `src/widget/selfWriteSuppression.ts` (WR-01 doc)

## Verification evidence

- `npx tsc --noEmit -skipLibCheck` — passes (no errors)
- `npx vitest run` — **2075 passed, 6 skipped, 0 failed** across 238 test files (237 passed, 1 skipped)
- `npx eslint <8 modified files>` — 30 errors (matches pre-fix baseline; zero new errors introduced)

## Logic-bug flagged for human verification

- **BL-04**: status `fixed` but the modify-handler decision tree is logic-heavy. The fix matches the comments at `main.ts:1106-1134` exactly, and existing tests in `tests/widget/conflictTrigger.test.ts` already pin the contract. Recommended: spot-check that fast typing in the dev vault no longer accumulates `selfWriteSuppression.map` entries.
- **BL-05**: status `fixed` but the active-typing gate is order-sensitive (must run BEFORE the equality compare). Recommended: spot-check fast vim typing in split-view (parent + LP child) — cursor should not jump to end of doc on auto-save.

---

_Fixed: 2026-05-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
