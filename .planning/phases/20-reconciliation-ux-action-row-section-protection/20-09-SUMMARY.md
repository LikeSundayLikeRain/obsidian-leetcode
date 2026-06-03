---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 09
subsystem: widget
tags: [cm6, widget, lifecycle, focus-retention, multi-pane, reading-mode]
requires:
  - phase: 19
    provides: WidgetController + LeetCodeFenceWidget + LeetCodeWidgetRenderChild + DebouncedWriter + selfWriteSuppression
  - phase: 20-05
    provides: per-pane registryKey discipline (leafId segment)
  - phase: 20-06
    provides: peekExpectedHash + suppression peek path (later retired in this plan)
  - phase: 20-07
    provides: language-switch via parent CM6 dispatch
  - phase: 20-08
    provides: conflict modal trigger via child-doc compare
provides:
  - parking-lot DOM adoption for editable widgets (EditorView never destroyed across post-processor remounts)
  - debounced widget→disk flush via vault.process (typing path retired from parent CM6 dispatch)
  - location-only widget identity (file.path + fenceIndex) — content-hash sourceHash dropped from eq()
  - mode-aware adoption gate (lp / read modes coexist; no cross-mode contamination)
  - pane-aware adoption gate (multi-pane same-mode coexist; no cross-leaf theft)
  - focus-retention gate (only the originally-focused pane refocuses on adoption)
  - multi-signal Reading-mode detection (el.closest + ctx.containerEl.closest + workspace.getMode)
  - plugin-origin echo gate for pushParentToChild (preserves redo stack)
affects: [phase-21 migration, phase-22 polish, future widget extensions]

tech-stack:
  added: []
  patterns:
    - parking-lot pattern (hidden document.body div) for DOM survival across MarkdownRenderChild remount
    - location-only WidgetType.eq() identity for stable Decoration.replace under content churn
    - composite registry key (path::fenceIndex::leafId::mode) for multi-pane / multi-mode coexistence
    - hadFocusBeforeUnload flag for selective refocus across multiple parallel adoption events
    - multi-signal mode detection to neutralize Obsidian pre-render detached-DOM races

key-files:
  created: []
  modified:
    - src/widget/WidgetController.ts
    - src/widget/LeetCodeFenceWidget.ts
    - src/widget/liveModeViewPlugin.ts
    - src/widget/childParentSync.ts
    - src/widget/codeBlockProcessor.ts
    - tests/widget/widgetEquality.test.ts
    - tests/widget/childParentSync.test.ts
    - tests/widget/WidgetController.test.ts

key-decisions:
  - "REVERSAL: per-keystroke child→parent CM6 dispatch (the original 20-09 approach) was UAT-broken at the post-mortem level. Replaced with debounced widget→disk flush — the same architecture Plan 19-02 used, but now paired with parking-lot adoption so the inevitable post-processor remount no longer destroys focus."
  - "Widget owns the source of truth in memory. Child docChanges never dispatch into the parent CM6 doc directly; only DebouncedWriter writes — and only after ~500ms of typing idle."
  - "On RenderChild.onunload, editable widget containers are PARKED in a hidden document.body div. The EditorView never leaves the document → no blur fires → vim insert mode + cursor + undo all survive."
  - "On RenderChild.onload, scan widgetRegistry for an existing controller matching (file.path, fenceIndex, mode). Pane- and mode-blind by leafId because Obsidian pre-renders post-processor el in a detached subtree where leafId is unresolvable."
  - "Refocus on next animation frame — wait until contentDOM is reconnected to the visible DOM. Do NOT dispatch a saved selection (it races with concurrent typing)."
  - "Read-only widgets (Reading mode, embeds) are DESTROYED on unload, not parked — no editable state to preserve, prevents orphan accumulation across rapid mode flips."
  - "Multi-pane focus theft prevented by capturing document.activeElement === contentDOM at unload and gating refocus on that flag — only the originally-focused pane refocuses."
  - "Reading-mode detection uses 3-signal OR (el.closest + ctx.containerEl.closest + workspace.getActiveViewOfType.getMode === 'preview') because el is sometimes in a detached pre-render fragment when the post-processor fires."
  - "pushParentToChild now skips ANY transaction with userEvent starting `leetcode.*` — was previously narrow `leetcode.child-sync` only, which leaked Reset/lang-switch echoes into the child redo stack."

patterns-established:
  - "Parking lot for DOM survival: a hidden, fixed-position div under document.body holds widget containers between RenderChild lifecycles so the embedded EditorView never receives a blur event."
  - "Location-only widget identity: WidgetType.eq() compares (plugin, file.path, fenceIndex). Content (sourceHash) is NOT identity — preserves CM6's DOM-reuse contract under content churn."
  - "Composite registry key: ${path}::${fenceIndex}::${leafId}::${mode} so multiple panes / modes can coexist without clobbering each other on Map.set."
  - "Pre-render detection caveat: rely on multiple DOM signals + workspace API for mode detection because el.closest('.markdown-reading-view') returns null when el is in Obsidian's detached pre-render subtree."

requirements-completed: []

# Metrics
duration: ~5h (split across 2 sessions; original 8-task implementation + 2026-05-30 post-mortem rewrite)
completed: 2026-05-30
---

# Phase 20 Plan 09: child→parent CM6 sync architecture (post-mortem rewrite)

**Per-keystroke widget remount + multi-pane focus retention + mode-aware adoption — landed via 6 atomic commits that replace per-keystroke parent CM6 dispatch with debounced widget→disk flush + parking-lot DOM adoption.**

## Performance

- **Started:** 2026-05-30 (initial 8-task implementation under the original PLAN.md)
- **Paused:** 2026-05-30T23:52Z — UAT showed per-keystroke remount + focus loss persisted; original architecture refuted
- **Resumed:** 2026-05-30 — full post-mortem rewrite this session
- **Completed:** 2026-05-30
- **Total commits:** 21 (8 original tasks + 7 inter-task fixes + 6 post-mortem commits)
- **Files modified:** 8 (5 src, 3 tests)

## What shipped vs what was planned

The original PLAN.md (Tasks 1-9) targeted **real-time per-keystroke child→parent CM6 dispatch** as the typing path. Tasks 1-8 implemented that architecture and shipped. UAT (Plan 20-09 Task 9) revealed the architecture itself was structurally broken — the post-processor (`registerMarkdownCodeBlockProcessor`) re-fires on every parent fence-body content change in Live Preview, creating a fresh `MarkdownRenderChild` instance per keystroke and destroying the embedded EditorView's focus.

The session paused at commit `b87e18a wip(20-09): pause work before per-keystroke remount fix`. The 6 post-mortem commits below replace the typing path entirely:

- `14e930f fix(20-09): widget eq() is location-only, not content-hash` — drop sourceHash from `LeetCodeFenceWidget.eq()` so CM6 stops calling `toDOM()` on every parent docChange
- `de20210 fix(20-09): parking-lot DOM adoption + debounced disk-flush` — widget owns source of truth; ~500ms idle DebouncedWriter flush; parking lot keeps EditorView in `document.body` so blur never fires; new RenderChild.onload reparents from lot
- `a8a3f7c chore(20-09): retire per-keystroke parent CM6 sync, strip diagnostics` — `createChildParentSyncExtension` refactored to debounced API but no longer wired into typing path; only retained for parent→child push (external sync)
- `5c77d76 fix(20-09): skip pushParentToChild on plugin-origin echoes — preserves redo` — broaden gate from `leetcode.child-sync` to any `leetcode.*` userEvent
- `9e6bd44 fix(20-09): pane- and mode-aware widget adoption — BUG 1, 2, 4` — registry key + adoption predicate include leafId AND mode; readonly widgets destroyed on unload not parked
- `d3f4085 fix(20-09): tighten adoption predicate + multi-signal Reading-mode detection` — drop `myLeaf &&` permissive guard (cross-leaf theft); 3-signal OR for Reading-mode detection; capture-and-gate refocus on hadFocusBeforeUnload to prevent multi-pane focus theft

## Accomplishments

- Per-keystroke widget remount eliminated — typing stays purely in child CM6 state until ~500ms idle
- Vim insert mode persists across all typing flows (no spurious Esc-to-normal transitions)
- Cursor position stable across debounced flush + post-processor remount
- Multi-pane Live Preview: both panes render the widget; typing in one doesn't steal focus from the other
- Live Preview + Reading mode coexist without cross-contamination
- LP↔Reading mode flips clean repeatedly; no orphan registry entries
- Cmd-Z / Cmd-Shift-Z (undo / redo) preserved through the typing→flush cycle
- All 304 widget unit tests pass; 2,073 project tests pass

## Task Commits

This plan shipped via two commit waves:

**Wave 1 — original 8-task implementation (Tasks 1-8 + UAT-driven fixes):**
1. `6705101 chore(20-09): strip UAT diagnostics + revert Bug B wrong-fence fix — Task 1`
2. `f843337 feat(20-09): create childParentSync — child→parent CM6 dispatch — Task 2`
3. `300fa30 feat(20-09): wire child→parent sync; retire DebouncedWriter from typing — Task 3`
4. `f0a33ac feat(20-09): toDOM threads parent view; eq() collapses to strict — Task 4`
5. `e6143f1 feat(20-09): retire suppression peek + parent-dispatch lang switch — Tasks 5+6`
6. `e748882 feat(20-09): parent → child sync push (the missing direction) — Task 7`
7. `dd7687a feat(20-09): conflict modal trigger uses child-doc compare — Task 8`
8. `b5d96f8 fix(20-09): drop addToHistory.of(false) — was blocking Obsidian auto-save`
9. `b87e18a wip(20-09): pause work before per-keystroke remount fix`

**Wave 2 — post-mortem rewrite (this session):**

10. `14e930f fix(20-09): widget eq() is location-only, not content-hash`
11. `de20210 fix(20-09): parking-lot DOM adoption + debounced disk-flush`
12. `a8a3f7c chore(20-09): retire per-keystroke parent CM6 sync, strip diagnostics`
13. `5c77d76 fix(20-09): skip pushParentToChild on plugin-origin echoes — preserves redo`
14. `9e6bd44 fix(20-09): pane- and mode-aware widget adoption — BUG 1, 2, 4`
15. `d3f4085 fix(20-09): tighten adoption predicate + multi-signal Reading-mode detection`

## Files Created/Modified

- `src/widget/WidgetController.ts` — DebouncedWriter rewired into typing path; LeetCodeWidgetRenderChild gains parking-lot adoption + refocus rAF; controller stores `readOnly` + `hadFocusBeforeUnload` fields; registry key includes mode segment
- `src/widget/LeetCodeFenceWidget.ts` — `eq()` is location-only (file.path + fenceIndex); `toDOM` no longer threads parent view (sync extension retired from typing path)
- `src/widget/liveModeViewPlugin.ts` — `pushParentToChild` echo gate broadened to `leetcode.*` userEvent prefix; trailing-newline normalization for body comparison
- `src/widget/childParentSync.ts` — refactored to return `{extension, handle}` debounced API (no longer wired into typing path; retained for `syncAnnotation` export consumed by main.ts Reset path and liveModeViewPlugin parent→child push)
- `src/widget/codeBlockProcessor.ts` — multi-signal Reading-mode detection (el.closest + ctx.containerEl.closest + workspace.getActiveViewOfType.getMode)
- `tests/widget/widgetEquality.test.ts` — content-hash assertion inverted to location-only
- `tests/widget/childParentSync.test.ts` — debounced API + flushSync/cancel coverage
- `tests/widget/WidgetController.test.ts` — writer-attached assertion inverted (writer IS attached on editable mounts post-rewrite)

## Architecture Notes

### Why the original approach was abandoned

The original PLAN.md hypothesis was: "if we dispatch every keystroke into the parent CM6 instead of writing to disk, the parent doc never reloads from disk, so the widget DOM never detaches, so focus survives." UAT proved this wrong on several axes:

1. **Per-keystroke parent dispatch still triggered the codeblock post-processor.** Obsidian fires `registerMarkdownCodeBlockProcessor` on every fence-body content change, regardless of source. New `MarkdownRenderChild` per keystroke → fresh `mountLeetCodeWidget` → embedded EditorView destroyed.
2. **`Decoration.replace({block: true})` from a ViewPlugin crashes Obsidian's CM6 measurement layer** (`getBoundingClientRect on null lines`). Verified empirically.
3. **`Decoration.replace({block: true})` from a StateField rendered nothing visible** — contradicted external research suggesting StateField provision would work. Empirical test showed `block: true` is unsupported in Obsidian's modified CM6 regardless of provider type.
4. **`Decoration.replace` (inline) provides no visible widget body** — only the post-processor produces visible DOM in Live Preview.

The post-processor is therefore non-negotiable as the renderer. The post-processor's remount is non-negotiable as a behavior. The fix is to **survive the remount** rather than prevent it.

### Why parking lot works

`MarkdownRenderChild.onunload` fires BEFORE Obsidian removes `containerEl` from the DOM (verified via diagnostic: `containerInDOM: true` at unload time). Moving the controller's container into a hidden `document.body` div during onunload keeps the EditorView attached to the document — no `blur` event fires, vim mode persists, cursor stays. The next `onload` reparents from the lot into the new `containerEl`. CM6 doesn't care where its DOM lives.

### Adoption predicate semantics

Adoption matches `(file.path, fenceIndex, readOnly)` AND requires that the existing controller's container is either parked (no `.workspace-leaf` ancestor) OR in the same `.workspace-leaf` as the new RenderChild's containerEl. This handles three coexistence axes:

- **Multi-pane same-mode** (LP + LP): each pane registers its own controller (different leafId in registry key); adoption refuses to steal across leaves
- **Same-pane different-mode** (LP↔Reading on same leaf): each mode gets its own controller (different mode in registry key); adoption refuses cross-mode pickup
- **Single pane single mode** (the dominant case): the parking-lot controller is freely adoptable across post-processor remounts

### Why eq() drops sourceHash

CM6's `Decoration.replace` widget identity is the WidgetType's `eq()` function. If `eq()` returns false, CM6 destroys the widget DOM and calls `toDOM()` again. With sourceHash in identity, every parent docChange (e.g., parent reloading from disk after our flush) creates a new widget instance with a different hash → CM6 destroys → `toDOM` mounts a fresh embedded EditorView → focus lost. Location-only identity preserves the widget instance across content churn.

## Known Follow-ups

- **Tab key inside widget** doesn't insert indent — likely missing `indentWithTab` keymap entry (carried from v1.2 `childEditorFactory` but possibly dropped during the v1.3 refactor). Separate phase.
- **`createChildParentSyncExtension` export retained** but unused on the typing path. Future cleanup phase can delete the function and update tests; for this plan we kept it because main.ts and liveModeViewPlugin.ts still import `syncAnnotation` from the same module.
- **`addToHistory.of(false)` removal** in pushParentToChild left the original parent-sync push using normal history. Cmd-Z on parent fence body during external-sync conflict will undo the parent-sync push as a regular change. Acceptable for v1.3.

## Self-Check: PASSED

- All 304 widget tests pass
- All 2,073 project tests pass
- TypeScript clean (`npx tsc --noEmit --skipLibCheck`)
- Build clean (`npm run build`)
- Manual UAT confirmed by user across: single-pane typing, vim mode, redo, multi-pane LP+LP, LP+Reading, mode-flips
