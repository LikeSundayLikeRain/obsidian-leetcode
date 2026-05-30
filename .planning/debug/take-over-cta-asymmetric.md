# Debug: Multi-pane Take-Over CTA asymmetric (Phase 20)

**UAT Test:** Phase 20 Test 4 (asymmetry symptom)
**Severity:** blocker
**Status:** root cause identified — verified by parallel debug agent
**Related:** `widget-thrash-on-type.md` (same root cause, different symptom)

## Symptom

Verbatim user report: *"When left is active, right pane shows CTA correctly. But when right is active, left does NOT show CTA — asymmetric promote/demote handler."*

Expected: open same LeetCode note in two split panes; pane B's widget greys out + shows "Click to take over" CTA when pane A is active, regardless of which is which.

## Root Cause

The widget registry key shape `${file.path}::${fenceIndex}` lacks any pane / leaf / view discriminator. When the same file is open in two panes, both widgets compute identical registry keys; `Map.set` clobbers, so `WidgetRegistry` only ever holds ONE controller per `${file.path}::${fenceIndex}` (typically the most-recently-mounted pane).

`multiPaneCoordinator.reconcileFocus` walks `widgetRegistry.values()` and can only flip state on the one surviving controller — the sibling in the other pane is invisible to the coordinator. Mount order determines which pane is "real" to the coordinator, producing the asymmetric symptom.

Trace confirming the symptom:
- When right pane mounted second, RIGHT-active means coordinator sees only right controller, finds it on the active leaf, sets it 'active' — left controller is never touched → no CTA shown.
- When LEFT-active, coordinator sees only right controller, finds it on a non-active leaf, sets it 'peer' → right shows CTA correctly.

## Evidence

- `src/widget/WidgetController.ts:922` — `plugin.widgetRegistry.set(\`${file.path}::${fenceIndex}\`, ctl)` — registry key has NO pane/leaf discriminator. Both panes mounting the same file at the same fence index produce identical keys; second mount clobbers first via Map.set semantics.
- `src/widget/multiPaneCoordinator.ts:115` — `for (const ctl of registry.values())` only yields the surviving (last-set) controller. The coordinator's pane-affiliation logic itself is correct (closest('.workspace-leaf') comparison is symmetric), but it never sees the second pane's controller.
- `src/widget/liveModeViewPlugin.ts` — each pane has its own CM6 ViewPlugin instance, so each pane independently calls `mountLeetCodeWidget` and races to claim the same registry slot.
- `src/widget/LeetCodeFenceWidget.ts:111-136` + `WidgetController.ts:1084` — destroy paths also use the same lossy key, so a destroy in one pane can delete the OTHER pane's registry entry. Combined with `LeetCodeFenceWidget.eq()` including `sourceHash`, every keystroke triggers destroy + remount in the typing pane, producing the secondary "widget flashing" blocker reported in UAT.
- `tests/widget/multiPaneCoordinator.test.ts:169-170` — failing test was masked because `makeFakeCtl` registers entries with fabricated distinct keys (`'foo.md::0:a'`, `'foo.md::0:b'`) that the real `mountLeetCodeWidget` never produces. The test never exercises the production key-collision path.

## Files Involved

- `src/widget/WidgetController.ts` (line 922 set, line 1084 delete) — registers controllers under a pane-blind key.
- `src/widget/LeetCodeFenceWidget.ts` (lines 111, 136) — `get` + `delete` using the same lossy key during Live-Preview destroy.
- `src/widget/widgetRegistry.ts` — Map-backed store; `*values()` iterator yields only the surviving entry per key.
- `src/widget/multiPaneCoordinator.ts` — iteration is correct, but blind to clobbered entries.
- `tests/widget/multiPaneCoordinator.test.ts` — fixture fabricates distinct keys that production cannot produce, masking the regression.

## Suggested Fix Direction

Extend the registry key (or storage shape) with a per-mount discriminator so multiple panes' widgets for the same file can coexist. Candidates:

(a) include the parent CM6 EditorView reference / parent-view UUID,
(b) include the owning WorkspaceLeaf reference / leaf id,
(c) introduce a per-mount UUID generated at `mountLeetCodeWidget` time and threaded through controller lifecycle for both register and destroy.

Update all 5 callsites (set, delete x2, get x1) to round-trip through the new key shape consistently, and fix `LeetCodeFenceWidget.destroy` to delete only its OWN entry (since it currently looks up by content-key alone). The coordinator's iterator already walks all entries — once the registry actually holds N entries per file, `reconcileFocus` will fan out symmetrically with no logic change.

Add a regression test that calls `mountLeetCodeWidget` twice with identical (file, fenceIndex) and asserts both controllers are visible to `widgetRegistry.values()` — fix the existing `tests/widget/multiPaneCoordinator.test.ts:169-170` fabricated keys to match production at the same time.

**Cross-link:** the secondary "widget flashing on typing" blocker (UAT Test 4 second symptom — see `widget-thrash-on-type.md`) shares this root cause (per-keystroke destroy/remount cycles cause registry slot ping-pong), so a key-shape fix likely resolves both blockers; verify in UAT after the fix lands.
