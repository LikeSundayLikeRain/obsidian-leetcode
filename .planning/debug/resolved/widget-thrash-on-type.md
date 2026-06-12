# Debug: Widget thrash on type (Phase 20)

**UAT Test:** Phase 20 Test 4 (typing-flash symptom)
**Severity:** blocker
**Status:** root cause identified — verified by parallel debug agent
**Related:** `take-over-cta-asymmetric.md` (shared primary cause), `self-write-remount-cycle.md` (separate but adjacent echo loop)

## Symptom

Verbatim user report: *"When I tried to type anything in any of the pane, it flashes — it keeps trying to add and remove."*

Each keystroke causes the widget to flash (mount → unmount → mount), making the editor unusable in multi-pane mode.

## Root Cause

**Two compounding bugs**, the PRIMARY introduced/exposed by Phase 20-04, the AMPLIFIER pre-existing from Plan 19-02.

### PRIMARY — Structural registry key collision

`src/widget/WidgetController.ts:921-923` registers controllers under `${file.path}::${fenceIndex}` — NOT unique when the same file is open in two panes. Two panes on same file = identical key = `Map.set` overwrites the first controller. Pane A's controller is silently dropped from the registry but leaked in DOM.

`src/widget/LeetCodeFenceWidget.ts:110-138` (`destroy(_dom)`) looks up the registry by `${file.path}::${fenceIndex}`. Per registry collision, this returns the WRONG controller (the surviving one), then calls `flushNow + destroy + delete` on it. CM6's destroy(dom)→toDOM cycle thrashes both panes.

### AMPLIFIER — Active-leaf-change synchronous flushAll echo loop

`src/main.ts:962-966` (Plan 19-02 Hook 1):
```ts
app.workspace.on('active-leaf-change', () => { void this.widgetRegistry?.flushAll(); })
```

Synchronous force-flush on every focus event creates the disk-write echo loop:
1. Type → CM6 selection-driven focus + `mountLeetCodeWidget` mousedown→`contentDOM.focus` (`WidgetController.ts:862-871`).
2. `active-leaf-change` fires → `flushAll()` runs synchronously.
3. `vault.process` → `vault.modify` echo → parent CM6 ViewPlugin (`liveModeViewPlugin.ts:110-116`) rebuilds Decoration.
4. New `sourceHash` → `LeetCodeFenceWidget.eq()` (`LeetCodeFenceWidget.ts:66-74`) returns false.
5. CM6 destroys + remounts both panes' widget DOMs.

Plan 20-04 multi-pane coordinator at `main.ts:1035` registers a SECOND active-leaf-change handler (no de-duplication of focus traffic), making the echo louder.

## Evidence

- `src/widget/WidgetController.ts:921-923`: registry registration uses non-unique key — the structural defect.
- `src/widget/widgetRegistry.ts:56-67`: `Map<string, WidgetControllerLike>` with `set()` overwrite semantics — by design, but the key strategy is wrong for multi-pane.
- `src/widget/LeetCodeFenceWidget.ts:110-138`: `destroy(_dom)` uses the collision-prone key for cleanup, so it operates on the wrong controller.
- `src/main.ts:962-966` + `src/main.ts:1035`: two active-leaf-change subscribers; Hook 1's synchronous `flushAll` is the disk-write echo trigger that drives the eq()-rebuild thrash loop.
- `src/widget/liveModeViewPlugin.ts:110-116`: parent CM6 ViewPlugin rebuilds Decoration when parent doc changes (consumed by the echo loop).
- `src/widget/multiPaneCoordinator.ts:115-146`: `reconcileFocus` walks the registry — sees only one controller per file::index pair, hence the asymmetric CTA in the same UAT test.
- `tests/widget/multiPaneCoordinator.test.ts`: passes because fixtures inject two controllers directly into the registry, bypassing `mountLeetCodeWidget`'s `set(key, ctl)` collision. Real-world multi-pane mount path is not exercised by unit tests — explains green CI + broken UAT.

## Files Involved

- `src/widget/WidgetController.ts:921-923` — non-unique registry key.
- `src/widget/widgetRegistry.ts:56-67` — `Map.set` overwrite semantics; key strategy wrong for multi-pane.
- `src/widget/LeetCodeFenceWidget.ts:110-138` — `destroy(_dom)` uses collision-prone key for cleanup.
- `src/main.ts:962-966` (Hook 1) and `src/main.ts:1035` (coordinator subscriber) — duplicate active-leaf-change handlers; Hook 1's synchronous flushAll is the echo trigger.
- `src/widget/liveModeViewPlugin.ts:110-116` — parent ViewPlugin rebuilds on any docChanged.
- `src/widget/multiPaneCoordinator.ts:115-146` — symmetric logic, blocked by registry collision.
- `tests/widget/multiPaneCoordinator.test.ts` — fixture bypasses production mount path.

## Suggested Fix Direction

Two coordinated fixes are required (gap-fix planner should treat as one phase or two tightly-coupled plans):

1. **Make registry keys per-pane-unique.** Compose the key from `${file.path}::${fenceIndex}::${leafId}` where `leafId` is a stable identifier for the workspace leaf hosting the widget (resolvable via `host.closest('.workspace-leaf')` or by walking `app.workspace.getLeavesOfType('markdown')` and matching `containerEl.contains(host)`). Update all key construction sites (`mountLeetCodeWidget`, `LeetCodeWidgetRenderChild.onunload`, `LeetCodeFenceWidget.destroy`, `WidgetController.persistenceKey`) consistently. Reconsider whether `persistenceKey` should remain file::index-only (state hydration is per-fence-content, not per-pane) or also become per-pane.

2. **Suppress the keystroke-rate flush echo.** Either (a) gate Hook 1's `flushAll()` on `event.detail` so it only fires on actual leaf transitions, not on focus reaffirmations within the same leaf; or (b) move the flush off the synchronous active-leaf-change path entirely (use `requestIdleCallback` / debounce the flush). Cleanest: recognize that Hook 1 was designed for cross-file leaf transitions (CONTEXT C-07 "leaf change (file/leaf switch)") — it should not fire when the active leaf is just refocusing within the same file. Track `lastActiveLeafFilePath` and skip flushAll when unchanged.

3. **(Optional, deeper hardening)** The content-hash `eq()` check is correct but brittle — a mid-typing parent-doc echo will always invalidate it. Consider making `LeetCodeFenceWidget.eq()` aware of the in-flight self-write suppression: when `selfWriteSuppression` has an entry for this file with a hash matching the new sourceHash, treat the rebuild as a no-op (return true) so CM6 reuses the DOM. This decouples the widget identity from the parent doc echo loop and is robust against any future event that triggers an echo. **NOTE:** this overlaps with the fix path for the self-write-remount-cycle gap — see `self-write-remount-cycle.md`. Consider unifying these into a single "self-write provenance" primitive consumed by both the ViewPlugin's `update()` and the widget's `eq()`.
