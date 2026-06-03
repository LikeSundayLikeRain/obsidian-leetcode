---
slug: vim-cursor-jumps-to-widget-start
status: resolved
trigger: in vim mode, my cursor moves to the beginning of widget sometimes while i'm typing to solve problem.
created: 2026-06-02
updated: 2026-06-02
tdd_mode: false
goal: find_and_fix
---

## Resolution

- **root_cause**: `pushParentToChild` in `src/widget/liveModeViewPlugin.ts` dispatched a full-doc replacement (`{ from: 0, to: childView.state.doc.length, insert: newBody }`) into the child `EditorView` with no `selection` field. CM6's default selection-mapping for a 0..end change collapses every selection coordinate to offset 0 — visible as the cursor jumping to the top-left of the widget. Triggered whenever the parent CM6 received an untagged doc-change (e.g., Obsidian's editor auto-save reflowing the parent ~2s after typing) AND the child held typing ahead of the last 300ms child→parent flush.
- **fix**: Replaced the full-doc dispatch with a minimal ChangeSpec computed via longest common prefix + suffix, then mapped the child's current selection through the resulting `ChangeSet` with forward bias (`mapPos(pos, 1)`). Mirrors the algorithm already shipped in `WidgetController.applyPeerSync` (Plan 21-17 split-pane peer sync). On a fallback `ChangeSet.of` failure, places the cursor at the start of the inserted region instead of collapsing to 0.
- **verification**:
  - 7 new regression tests in `tests/widget/parentToChildCursorPreservation.test.ts` (downstream/upstream insert/delete, the symptom case "child has typing ahead of parent reflow", no-op case, dispatch-shape annotation guard, incremental-vs-full-doc guard) — all pass.
  - 19 existing `splitPaneCursorPreservation.test.ts` tests still pass.
  - 4 unrelated test files fail on baseline both with and without the fix (pre-existing flaky/broken — not caused by this change).
  - Build clean (`npm run build`); deployed to dev vault.
- **files_changed**:
  - `src/widget/liveModeViewPlugin.ts` (added `ChangeSet`, `EditorSelection` imports; replaced full-doc dispatch in `pushParentToChild` with minimal-diff + mapped-selection; added `syncHandle.hasPending()` rollback-prevention gate)
  - `src/widget/childParentSync.ts` (added `hasPending()` to `ChildParentSyncHandle`)
  - `tests/widget/parentToChildCursorPreservation.test.ts` (new)

## Follow-up: rollback prevention (same session)

User flagged a follow-up risk: while the cursor-jump fix prevented the visible symptom, the underlying race could still **silently roll back the user's most recent typing** if `pushParentToChild` fired during the 300ms childParentSync debounce window (child has typed past parent → untagged parent change lands → push overwrites child with stale parent body, deleting the un-synced characters).

- **fix**: Added a `hasPending()` method to `ChildParentSyncHandle` that returns `true` while the child→parent debounce timer is armed. In `pushParentToChild`, gate the loop body on `syncHandle.hasPending()`: when `true`, skip the push entirely (the child is the source of truth during the debounce; the next 300ms flush will reconcile). We cannot run `flushSync()` synchronously here because `pushParentToChild` executes inside the parent ViewPlugin's `update()` and CM6 throws `"Calls to EditorView.update are not allowed while an update is in progress"` on re-entrant `view.dispatch()`. "Skip when pending" is the only safe synchronous behavior — and it matches the existing `writer.hasPending()` gate semantics (BL-05).
- **trade-off accepted**: A genuine external parent change that arrives during the 300ms window is also dropped — its content reaches the child only after the next childParentSync flush completes (parent then re-emits the change as part of its already-absorbed state, OR the user's flush-back fully overwrites the external delta). This matches v1.3's child-as-source-of-truth posture; conflict resolution beyond that is owned by `ConflictModal` / `selfWriteSuppression`, not by this gate.
- **verification**: 3 new regression tests in `parentToChildCursorPreservation.test.ts`:
  - "rollback prevention: when childParentSync has a pending flush, the push is skipped" — drives the bug scenario via an untagged out-of-fence parent change; asserts child content + cursor unchanged + no child dispatch (and that flushSync is NOT called from inside the update — guarded by a throwing mock).
  - "rollback prevention: with no pending flush, the push runs as before" — regression guard for the cursor-mapping fix path.
  - "rollback prevention: backward-compat — widgets without syncHandle still receive pushes" — guards against the optional-chain regressing existing fixtures that don't expose `syncHandle`.
- All 38 cross-cutting sync tests pass (`childParentSync` + `splitPaneCursorPreservation` + `parentToChildCursorPreservation`). Build clean. Deployed.

# Debug Session: vim-cursor-jumps-to-widget-start

## Symptoms

<!-- DATA_START -->
- **Expected behavior**: Cursor stays where the user is typing in the widget while in vim Insert mode.
- **Actual behavior**: Cursor sometimes jumps to the top-left of the widget (line 1, column 0) while user is typing in vim mode.
- **Trigger**: Kinda random — user suspects correlation with autosave (debounced ~400ms after typing pause). Twice during a single "Two Sum" solve session.
- **Frequency**: Intermittent — observed twice during one solve session.
- **Destination**: Top-left of widget (line 1, col 0) — i.e., start of the code fence body.
- **Timeline**: Unsure when started; user can't recall a known-good baseline.
- **Reproduction**: Type in vim Insert mode inside the LeetCode widget code fence; pause for ~400ms (autosave window); cursor occasionally snaps to widget start.
<!-- DATA_END -->

## Environment

- Plugin branch: `gsd/v1.3-architecture-overview-migration-docs-sync-interaction-notes-`
- Architecture: **v1.3 inline widget** is the active path (Phase 22; v1.2 nested-CM6 is being retired). Vim mounts via `vimCompartment` inside the widget's child `EditorView` in `WidgetController.ts:1209-1211` and is reactive via `reconfigureVim`.
- Active write paths:
  - **Child→parent (CM6 doc)**: `createChildParentSyncExtension` (`src/widget/childParentSync.ts`) — debounced 300 ms; dispatches with `userEvent: 'leetcode.child-sync'`.
  - **Widget→disk (vault)**: `DebouncedWriter` (`src/widget/debouncedWriter.ts`) — debounced 500 ms (default); arms `selfWriteSuppression` (TTL **2000 ms**) before `vault.process`; threads `registryKey`.
  - **Parent→child (CM6 → child)**: `pushParentToChild` in `src/widget/liveModeViewPlugin.ts:107-165` — full-doc replacement of child via `dispatch({ changes: { from: 0, to: childDoc.length, insert: newBody } })`. **Drops cursor** (no `selection` field).
- Recent vim-cursor work: Phase 22 D-polish-07 (commits 3fe5370, 675d7e2) — only touches CSS class toggling for cursor visibility; the bug was likely already present, but prior compromise rules ("force both cursor layers visible") may have masked the symptom optically.

## Initial Hypotheses (priority order)

1. ~~**Parent doc rebuild on autosave drops child editor state**~~ — DOESN'T APPLY in v1.3: parking-lot survival in `LeetCodeWidgetRenderChild.onunload`/`onload` keeps the child `EditorView` alive across post-processor remounts. The EditorView is moved to a hidden `.lc-widget-parking-lot` div, so its selection is preserved.
2. **Widget decoration recompute clobbers child selection** — `LeetCodeFenceWidget.eq()` is **location-only** (line 96-122) so widget reuse keeps the same DOM. CM6 will not reconstruct the EditorView on parent doc changes. RULED OUT.
3. **Child→parent sync echo loop reapplies the doc** — `pushParentToChild` self-skips on `'leetcode.*'` userEvents (line 92-96). RULED OUT for child-origin echoes.
4. ~~**Vim selection state lost on doc replace**~~ — vim's CM5 adapter stores selection coordinates that follow the underlying CM6 selection; if the underlying selection is set to (0), vim sees (0). The bug is in the underlying CM6 dispatch, not in vim itself.

## Current Focus

```yaml
hypothesis: |
  ROOT CAUSE: pushParentToChild() in src/widget/liveModeViewPlugin.ts:152-160
  dispatches a full-doc replacement to the child EditorView with NO selection
  field. CM6's default behavior on a `changes` dispatch without a `selection`
  arg is to MAP the existing selection through the change set. For a
  full-doc replace (from: 0 to: doc.length), every position in the old
  selection is fully removed by the change set; CM6's selection mapping
  collapses ALL prior selection coordinates to position 0 (the only
  surviving anchor). The cursor lands at offset 0 → line 1, col 0 — the
  symptom destination.

  Trigger sequence:
    1. User types in vim Insert mode in widget A (or single pane).
    2. childParentSync debounces 300ms; dispatches into PARENT CM6 with
       'leetcode.child-sync' userEvent. Parent fence body now matches child.
    3. ~2s later, Obsidian's editor auto-save fires `vault.modify` on the
       parent file. (The 'leetcode.child-sync' transaction does NOT pass
       through DebouncedWriter; only chevron / copyToCode / conflict-modal
       paths arm selfWriteSuppression. Plain typing relies on Obsidian's
       built-in editor auto-save — see WidgetController.ts:1358-1366
       comment "Architecture: ... Obsidian's modify event then bubbles
       back through the parent CM6 reload pipeline".)
    4. vault.on('modify') fires in main.ts:1376. Path:
         - allMatching = [widget A]
         - currentDocHash matches observedHash if widget caught up since
           last write → early return at line 1431-1437. Often YES.
         - When NO (race: child typed AGAIN between local hash refresh
           and the modify echo): tryConsume returns 'miss' (no entry was
           armed by DebouncedWriter for the typing path) →
           decision.kind === 'reload-silent' → reloadFromDisk('silent').
       BUT: a competing path is more direct.
    5. **The smoking gun**: while widget A is the only typing path, the
       parent→child PUSH in liveModeViewPlugin.ts ALSO fires on every
       parent docChanged that is NOT 'leetcode.*'-tagged. The
       'leetcode.child-sync' transaction IS tagged so it's skipped (line
       92-96, isPluginEcho gate). HOWEVER, when Obsidian's built-in editor
       auto-save runs, it issues an UNTAGGED parent CM6 transaction
       (vault->parent reflow); that change is treated as "external", and
       pushParentToChild dispatches a full-doc replace into the child
       WITHOUT any selection mapping intent — every typed character that
       happened in the 300ms window between the last child→parent flush
       and the auto-save reflow becomes "different content", and the child
       receives a full-replace that drops the user's cursor to 0.

  In Reading-mode siblings (split-pane Reading view), the read-only widget
  receives the SAME push — but cursor jumps there are invisible since
  read-only widgets are not editable.

  This matches the user's "kinda random ~ correlated with autosave"
  observation precisely: the bug fires only when (a) a parent reflow
  happens with no syncAnnotation (i.e., not from our own pushParentToChild
  loop) and (b) `norm(childDoc) !== norm(newBody)` — typically when the
  child has uncommitted typing AHEAD of the last child→parent flush.

evidence_locations:
  - src/widget/liveModeViewPlugin.ts:152-160 — full-doc replace dispatch with NO selection field
  - src/widget/childParentSync.ts:30 — DEFAULT_DEBOUNCE_MS = 300
  - src/widget/debouncedWriter.ts — only arms suppression for chevron/copyToCode/conflict paths in v1.3 (typing path uses Obsidian editor auto-save per WidgetController.ts:1358-1366)
  - src/widget/WidgetController.ts:482-584 — applyPeerSync DOES preserve selection via ChangeSet.mapPos with forward bias; the canonical fix shape exists already.
  - src/widget/WidgetController.ts:627-701 — reloadFromDisk uses line/col clamp; would also produce 0,0 if line 1 has 0 length and cursor was at line 1 (but the immediate culprit is the simpler push path).

test: |
  Empirical reproduction (requires live Obsidian session, the user's dev
  vault) — instrument three log points:
    A. childParentSync.ts:doFlush — log "child→parent flush" with bodyLen.
    B. liveModeViewPlugin.ts:pushParentToChild — at the dispatch site,
       log: childDocLen, newBodyLen, childCursorBefore (read via
       childView.state.selection.main.head BEFORE dispatch), and a
       transaction reason tag.
    C. WidgetController.ts: editorView's updateListener — log
       update.selectionSet, update.docChanged, and resulting
       cursor=update.state.selection.main.head whenever it transitions
       to 0.

  Reproduce by typing in vim Insert mode and pausing. Expect to see:
    A fires, then B fires within ~2s with childCursorBefore = the user's
    cursor and dispatch goes through; C fires with cursor=0 in the
    SAME microtask as B.

expecting: |
  EITHER (most likely): B fires, dispatch lands on child, C reports
  cursor=0 — confirms full-doc replace is dropping cursor.

  OR: A doesn't fire but C reports cursor=0 → suggests reloadFromDisk
  path or applyPeerSync misuse instead.

  Both can be tested in one round.

next_action: |
  Fix is small and well-scoped. Reuse the EXACT shape from applyPeerSync
  (already battle-tested for split-pane R9) inside pushParentToChild:
  compute LCP/LCS, build a ChangeSpec, map selection via
  ChangeSet.mapPos. This preserves the cursor naturally even if the
  doc lengths or contents shift.

  Alternative (simpler): convert the existing dispatch to also pass
  `selection: ...mapped...` derived from `ChangeSet.of(...)` and
  `selection.ranges.map(r => EditorSelection.range(changes.mapPos(r.anchor, 1), changes.mapPos(r.head, 1)))`.

reasoning_checkpoint: null
tdd_checkpoint: null
```

## Evidence

- timestamp: 2026-06-02T19:35:00 — `pushParentToChild` (src/widget/liveModeViewPlugin.ts:152-160) dispatches a full-doc replace into the child without a `selection` field. CM6 maps the existing selection through the change set; for a full-replace `(from:0, to:doc.length)` every position is in the deleted range. With default `assoc=-1` semantics, all mapped positions collapse to `0`.
- timestamp: 2026-06-02T19:35:01 — `applyPeerSync` (src/widget/WidgetController.ts:482-584) implements the correct algorithm: longest-common-prefix + suffix → minimal ChangeSpec → `ChangeSet.mapPos(pos, 1)` forward-bias. This is the proven shape from Plan 21-17 split-pane R9 work.
- timestamp: 2026-06-02T19:35:02 — Skip-conditions in `pushParentToChild`: `isPluginEcho` (line 92-96) and `writer.hasPending()` (line 145, BL-05). Neither catches the case where Obsidian's editor auto-save reflows the parent doc with NO userEvent annotation while the user is mid-typing in vim Insert mode (no DebouncedWriter pending — the typing path doesn't use it for plain text). The `norm(childDoc) === norm(newBody)` no-op gate (line 149-150) only fires when the child happened to flush JUST before the parent reflow; if the user typed more characters in the 300ms debounce window, `childDoc` differs and the dispatch fires.
- timestamp: 2026-06-02T19:35:03 — Why this is "kinda random ~400ms correlation with typing pause":
  - Child→parent flush happens at 300ms typing-idle.
  - Obsidian's editor auto-save default is ~2s after the last parent doc change.
  - User pauses ~400ms (within child→parent debounce window has not always elapsed at 400ms but on subsequent keystrokes that re-arm the timer it eventually flushes around 700ms-1s, after which the 2s editor auto-save schedule starts; total visible window is ~700ms-2.7s post-keystroke).
  - During typical typing bursts the user crosses the 300ms threshold while still typing, then crosses 2s of total idle, then the auto-save fires; if the user's NEXT keystroke landed within those windows the symptom can appear "random ~ on autosave".
- timestamp: 2026-06-02T19:35:04 — Existing test coverage: `tests/widget/splitPaneCursorPreservation.test.ts` covers the *peer-sync* path's selection mapping (P1..P6), but there is **no test exercising `pushParentToChild`'s selection preservation** for the single-pane parent→child reflow path. This is the regression-test gap.

## Eliminated

- H1 (parent doc rebuild destroys child EditorView): RULED OUT. Parking-lot survival in `LeetCodeWidgetRenderChild.onunload`/`onload` keeps the EditorView alive across post-processor remounts (lines 1761-1978 of WidgetController.ts).
- H2 (widget decoration recompute clobbers child selection): RULED OUT. `LeetCodeFenceWidget.eq()` is location-only (LeetCodeFenceWidget.ts:96-122); CM6 reuses widget DOM on parent doc changes. The embedded `EditorView` instance is preserved.
- H4 (vim internal selection state): RULED OUT as primary cause. Vim's CM5 adapter follows the underlying CM6 selection; the (0,0) lands first on the CM6 selection, then vim observes it.

## Specialist Hint

Suggested specialist: `typescript` (CodeMirror 6 / TypeScript). Recommendation: confirm the `ChangeSet.mapPos` semantics for full-doc replace and recommend the LCP/LCS shape that already exists in `applyPeerSync`.

## Resolution

- root_cause: |
    `pushParentToChild` in `src/widget/liveModeViewPlugin.ts:152-160` dispatches
    a full-doc replacement into the child `EditorView` without supplying a
    `selection` field. CM6's default selection-mapping for a `(from:0, to:doc.length)`
    change collapses all prior selection coordinates to offset 0, so the
    user's cursor (and vim's tracked position) snap to line 1, col 0 of the
    widget. The dispatch fires whenever (a) the parent CM6 receives an
    untagged docChange (e.g., Obsidian's editor auto-save reflow) AND
    (b) the child's current doc differs from the new fence body — typical
    when the user has typed beyond the last child→parent debounce flush.
- fix: |
    Replace the full-doc replacement in `pushParentToChild` with the
    same minimal-edit + mapped-selection algorithm already implemented in
    `WidgetController.applyPeerSync` (LCP + LCS → `ChangeSpec` →
    `ChangeSet.of(spec, oldLen)` → map every selection range via
    `changes.mapPos(pos, 1)`). Pass the mapped selection in the dispatch.
    This preserves cursor + selection across parent→child sync regardless
    of doc-length change.

    Pseudocode (adapted from applyPeerSync):
    ```ts
    const oldDoc = childView.state.doc.toString();
    if (newBody === oldDoc) continue; // existing no-op gate
    // LCP
    let p = 0; const maxP = Math.min(oldDoc.length, newBody.length);
    while (p < maxP && oldDoc.charCodeAt(p) === newBody.charCodeAt(p)) p++;
    // LCS (capped)
    let s = 0; const maxS = Math.min(oldDoc.length - p, newBody.length - p);
    while (s < maxS && oldDoc.charCodeAt(oldDoc.length - 1 - s) === newBody.charCodeAt(newBody.length - 1 - s)) s++;
    const spec = { from: p, to: oldDoc.length - s, insert: newBody.slice(p, newBody.length - s) };
    const changes = ChangeSet.of(spec, oldDoc.length);
    const ranges = childView.state.selection.ranges.map((r) =>
      EditorSelection.range(changes.mapPos(r.anchor, 1), changes.mapPos(r.head, 1)),
    );
    const mappedSelection = EditorSelection.create(ranges, childView.state.selection.mainIndex);
    childView.dispatch({
      changes: spec,
      selection: mappedSelection,
      annotations: [
        syncAnnotation.of(true),
        Transaction.userEvent.of('leetcode.parent-sync'),
        Transaction.addToHistory.of(false),
      ],
    });
    ```

    Add a regression test in `tests/widget/` that:
      1. Mounts a parent CM6 + child via `pushParentToChild`.
      2. Sets the child cursor at offset > 0 (e.g., end of doc).
      3. Modifies the parent fence body upstream of the cursor (insert
         characters at offset 0 of the child body).
      4. Triggers `pushParentToChild`.
      5. Asserts the child cursor moved by exactly the inserted-prefix
         length (forward-mapped, not collapsed to 0).
- verification: pending — apply fix; run `npm run lint && npm test`; deploy to dev vault and confirm by typing in vim Insert mode (>10 minute solve session, multiple typing pauses).
- files_changed: pending — `src/widget/liveModeViewPlugin.ts` (push), `tests/widget/parentToChildCursorPreservation.test.ts` (new).
