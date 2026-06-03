---
phase: 20-reconciliation-ux-action-row-section-protection
type: review
status: issues_found
depth: deep
reviewed_files:
  - src/widget/LeetCodeFenceWidget.ts
  - src/widget/WidgetController.ts
  - src/widget/childParentSync.ts
  - src/widget/codeBlockProcessor.ts
  - src/widget/liveModeViewPlugin.ts
findings_total: 21
blockers: 6
warnings: 15
created: 2026-05-31
---

# Phase 20-09 Code Review — Adversarial Findings

**Depth:** deep · **Files reviewed:** 5 source + cross-file traces · **Status:** issues_found

The user's UAT confirmed the dominant single-pane editable flow; most BLOCKERs surface only under teardown, multi-pane edges, file rename, or repeated dev plugin reloads. **BL-04's modify-handler/suppression mismatch is reachable under fast typing and is the most consequential to address before shipping.**

---

## BLOCKER findings

### BL-01 — Parking lot leak: `onunload` parks but `onload` may never fire
**File:** `src/widget/WidgetController.ts:1382-1430`

When `LeetCodeWidgetRenderChild.onunload()` parks an editable container, the registry entry is intentionally NOT deleted (the lifecycle assumes a matching `onload` will adopt it). Several real paths break that assumption:

1. **Plugin disable / `Plugin.onunload`** — `widgetRegistry.destroyAll()` tears down EditorViews but leaves the parking lot div attached to `document.body`. Static `LeetCodeWidgetRenderChild.parkingLot` reference persists across plugin instances (CommonJS module cache).
2. **File rename** — registry entries' `registryKey` is a frozen string captured at construction. The new file's RenderChild won't adopt the parked controller; it mounts fresh; parked controller dangles forever.
3. **Error during new RenderChild's `onload`** — `try/catch` falls through to fresh mount without destroying the stale registry entry.
4. **Tab close mid-typing** — `onunload` parks, but `onload` never re-fires.

**Fix:**
- `Plugin.onunload`: call new `LeetCodeWidgetRenderChild.disposeParkingLot()` to remove the lot from DOM and null the static.
- `vault.on('rename')` handler: re-key parked controllers under the new path.
- Workspace `layout-change` sweeper: walk registry for parked controllers >N seconds old, destroy + unregister.
- Fall-through `catch` in onload should `existing.destroy()` + `widgetRegistry.delete(existing.registryKey)`.

---

### BL-02 — Adoption can pick a controller whose EditorView was already destroyed
**File:** `src/widget/WidgetController.ts:1278-1340`

The adoption predicate filters on `(file.path, fenceIndex, readOnly, same-leaf-or-parked)` but never checks that the existing controller's `view` is still alive. Two paths produce a registry entry whose `view.contentDOM` has been destroyed:

1. **`LeetCodeFenceWidget.destroy(_dom)`** can race with `LeetCodeWidgetRenderChild.onunload` parking the same controller.
2. **The `try/catch` fall-through** at adoption doesn't destroy the stale controller; subsequent remounts find both stale and fresh in the registry.

After a destroyed-controller match, `view.contentDOM.isConnected` returns false forever, locking the rAF refocus loop into a spin (BL-03).

**Fix:** Add alive-check to predicate: `if (!ctl.view || !ctl.view.contentDOM || ctl.view['destroyed']) return false;`. Also `existing.destroy()` + delete in the fall-through catch.

---

### BL-03 — Refocus rAF loop has no upper bound; can spin forever after view destroy
**File:** `src/widget/WidgetController.ts:1324-1340`

The `requestAnimationFrame(refocus)` recursion keeps re-queueing as long as `contentDOM.isConnected === false`. If contentDOM is destroyed (tab closed mid-typing, file deleted, plugin teardown), the loop spins at 60fps indefinitely, pinning a memory reference to the destroyed controller.

**Fix:** Cap retry budget:
```ts
let attempts = 0;
const refocus = () => {
  if (attempts++ > 60) return; // ~1 second budget
  if (view['destroyed']) return;
  ...
};
```

---

### BL-04 — DebouncedWriter is wired but `selfWriteSuppression` is never consumed in the modify handler
**File:** `src/main.ts:1135-1235` and `src/widget/WidgetController.ts:1039-1056`

`mountLeetCodeWidget` constructs a `DebouncedWriter` whose `flush()` arms `selfWriteSuppression`. The arming entry is supposed to be drained by the vault `'modify'` handler via `tryConsume(path, observedHash)`. **The modify handler no longer calls `tryConsume`.** Comments at line 1123 reference it; the code path was retired.

**Effects:**
1. **`SelfWriteSuppression.map` grows monotonically** — slow leak per file path edited.
2. **The post-flush echo race is uncovered.** Under fast typing, the new `observedBody === childDoc` check fails (child has advanced), the handler reads `writer.hasPending() === true`, and **opens a ConflictModal during normal typing**.
3. **Feedback edge:** child types → debounced disk flush → modify event → conflict modal opened despite the child being the source of the write.

**Fix:** Either delete the `DebouncedWriter` construction OR restore `tryConsume` in step (c) of the modify decision tree:
```ts
const result = this.selfWriteSuppression.tryConsume(file.path, observedHash);
if (result === 'consumed') return;
```
Pick one consistent story. Add periodic TTL sweeper to `SelfWriteSuppression`.

---

### BL-05 — `pushParentToChild` echo gate is too narrow: external auto-save reload leaks into typing
**File:** `src/widget/liveModeViewPlugin.ts:142-209`

The new gate skips `'leetcode.*'` userEvents but does NOT skip Obsidian's auto-save reload (no userEvent on internal sync). Under fast typing, a 250ms-debounced parent reload races a keystroke; `pushParentToChild` dispatches a full-doc replace on the child with `addToHistory.of(false)`. CM6 clamps selection to new doc length → vim cursor jumps to end of doc.

**Fix:** Active-typing gate — skip `pushParentToChild` when `widget.writer?.hasPending() === true`. Or route all parent reloads through `WidgetController.reloadFromDisk` (already implements line/col cursor clamping).

---

### BL-06 — `eq()` ignores `source` content but constructor still receives it; widget instance lies about its content
**File:** `src/widget/LeetCodeFenceWidget.ts:46-106` and `src/widget/liveModeViewPlugin.ts:99`

CM6's `Decoration.replace` widget-reuse contract: when `eq()` returns true, CM6 reuses the FIRST widget instance's `toDOM()` and discards subsequent widget instances' `source` field. `widget.source` is the first body ever observed; the fence body has since been edited.

The hazard: future code that reads `widget.source` after construction will get the first-ever body forever. There's no current consumer, but the API shape invites a future bug.

Concurrent destroy paths: `LeetCodeFenceWidget.destroy(_dom)` can race `LeetCodeWidgetRenderChild.onunload` parking the same controller (see BL-02).

**Fix:** Remove `public readonly source` from constructor. Coordinate destroy paths — `LeetCodeFenceWidget.destroy` should skip `ctl.destroy()` when `ctl.container.parentElement.classList.contains('lc-widget-parking-lot')`.

---

## WARNING findings

### WR-01 — `selfWriteSuppression.tryConsume` is dead code under the new architecture
The whole `tryConsume` API has zero callers. Header comment lies about "single remaining caller of arm()". Delete or restore in modify handler.

### WR-02 — Multi-pane registryKey doesn't update on adoption migration
After leaf A→B adoption, controller's `registryKey` still encodes leafA's leafId. Future code reasoning about registry-key-to-leaf will be wrong.

**Fix:** Re-key on adoption — delete old key, mutate `registryKey` field, set under new key.

### WR-03 — Multi-signal Reading-mode detection has false positives in split view
`getActiveViewOfType(MarkdownView)` is global, not per-postprocessor. With Reading pane focused while LP pane re-renders, `activeModeReading=true` mounts LP widget as read-only.

**Fix:** When `ctx.containerEl.isConnected`, trust local DOM signals; only fall back to global mode when ctx is detached.

### WR-04 — `hadFocusBeforeUnload` reset is unconditional but read site can fail before reset
Flag is reset BEFORE the rAF refocus runs. If refocus fails (BL-03), the focus signal is lost forever. Multi-pane focus theft if onload order is reversed.

**Fix:** Combine flag with leaf-affinity (`leafIdAtUnload`); only refocus when same pane re-adopts. Move reset into rAF terminal callback.

### WR-05 — `pushParentToChild` walks ALL registry entries per parent docChange (O(N))
Per-keystroke cost is N comparisons for large vaults with many tabs.

**Fix:** Add per-path index `Map<string, Set<WidgetControllerLike>>` to `WidgetRegistry`.

### WR-06 — `addToHistory.of(false)` doc/code drift
SUMMARY says "removed", but code at `liveModeViewPlugin.ts:202` still passes it. Document or code is wrong.

### WR-07 — `childParentSync.ts` factory is dead code; only `syncAnnotation` is live
Carrying the dead factory creates a strong attractor for future readers to think typing-path sync is wired. Delete or move `syncAnnotation` to a tiny dedicated module.

### WR-08 — `mountLeetCodeWidget` accepts `parentView?: EditorView` but never uses it
`buildExtensions(..., undefined)` — parameter is dead. Remove from signature and call sites.

### WR-09 — Nondeterministic `find()` over `Map.values()` is order-dependent
With multiple matches, `find` returns FIRST inserted (race-dependent).

**Fix:** Prefer parked over leaf-attached, prefer most recent.

### WR-10 — Unused imports in dead childParentSync (subordinate to WR-07)

### WR-11 — `view.dom.addEventListener('mousedown', ...)` registered twice; never removed
Listeners hold view reference; parked containers retain mousedown handlers.

**Fix:** Capture listener refs, remove in `destroy()`.

### WR-12 — DebouncedWriter rate-limit retry timer races cancel() during shutdown
Possible double `vault.process` if `forceFlush` is called during deferred window.

**Fix:** Always clear `rateLimitTimer` before reassign; bypass-clear in `forceFlush`.

### WR-13 — Magic number 500 vs 300 mismatch between WidgetController and childParentSync
Future reader confusion. Pick one shared constant.

### WR-14 — `eq()` uses `?.` on non-nullable `file.path`
Masks a real bug. If TFile becomes null, two distinct deleted-file widgets compare `undefined === undefined → true`. CM6 reuses wrong DOM.

**Fix:** Drop `?.` since `file: TFile` is contractually non-null, or explicit null guard.

### WR-15 — `parkingLot` static survives plugin reload (subordinate to BL-01)
CommonJS module cache persists across enable/disable. First disable doesn't clear; second enable returns stale lot pointing into dead DOM tree.

---

## Recommended Action Plan

**Before shipping v1.3:**

1. **BL-04 (highest priority)** — Decide: restore `tryConsume` in modify handler OR delete `DebouncedWriter` wiring. Current state is "Schrödinger's contract" with a feedback edge under fast typing.
2. **BL-01 + BL-03 + WR-15** — Add parking-lot teardown to `Plugin.onunload`. Cap rAF refocus retry budget.
3. **BL-02** — Add alive-check to adoption predicate. Destroy stale entries in fall-through catch.
4. **BL-05** — Add active-typing gate to `pushParentToChild`.

**Can defer to v1.3.x:**
- BL-06, WR-02, WR-03, WR-04 — narrow edge cases not encountered in primary UAT.
- WR-05 — perf optimization.
- WR-06, WR-07, WR-08, WR-10, WR-13 — code hygiene / doc drift.
- WR-09, WR-11, WR-12, WR-14 — defensive hardening.

**Total estimated remediation:** ~150-200 LOC across 4 files for the BLOCKER set; ~100 LOC for WARNING set.
