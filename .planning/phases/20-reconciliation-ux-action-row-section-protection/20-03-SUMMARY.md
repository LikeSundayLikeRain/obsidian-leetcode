---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 03
subsystem: external-edit reconciliation / conflict modal / pure-TS LCS diff
tags:
  - reconciliation
  - conflict-modal
  - lcs-diff
  - sync-04
  - sync-05
  - vertical-slice
requirements_complete:
  - SYNC-04
  - SYNC-05
dependency_graph:
  requires:
    - "Phase 19 widget foundation: WidgetController, debouncedWriter (sha1, forceFlush, cancel/run scheduling), selfWriteSuppression (tryConsume), statePersistence (historyJSON best-effort consumption per L8)"
    - "Plan 20-02: widget.currentDocHash field + per-widget metadataCache subscription + Pitfall P2 pre-suppression early-return (RELOCATED into step (b) of the new handler)"
    - "src/widget/fenceSerialization.ts: extractFenceBody for hashing observed disk fence body"
    - "src/widget/debouncedWriter.ts: sha1 helper (already exported)"
  provides:
    - "src/widget/conflictDiff.ts: pure-TS LCS line diff; single export `lineDiff(mine, ext): DiffRow[]`"
    - "src/widget/ConflictModal.ts: Obsidian.Modal subclass with three-button + diff-expansion flow per D-conflict-01..04; updateExternalContent(newExt) for D-conflict-04 in-place update"
    - "WidgetController.reloadFromDisk(reason: 'silent' | 'keep-external'): Promise<void> with line/col clamp + Transaction.addToHistory.of(false)"
    - "DebouncedWriter.hasPending(): boolean accessor (sentinel boolean reset on flush completion / cancel)"
    - "main.ts: full vault.on('modify') decision tree per Pattern 4 — Pitfall P2 early-return RELOCATED into step (b)"
    - "main.ts: activeConflictModal: ConflictModal | null field with constructor-callback cleanup"
    - "styles.css: lc-conflict-* block — 3-pane diff layout, color-mix on Obsidian CSS variables only, reduced-motion-gated update flash"
  affects:
    - "src/widget/WidgetController.ts: reloadFromDisk method + EditorSelection + Transaction imports + extractFenceBody import"
    - "src/widget/debouncedWriter.ts: pending sentinel + try/finally on flush body + hasPending accessor + cancel() resets sentinel"
    - "src/main.ts: vault.on('modify') handler structure (replaces Plan 19-02 placeholder); ConflictModal import + activeConflictModal field"
    - "styles.css: appended ~70 LOC lc-conflict-* + lc-diff-* selectors"
tech_stack:
  added: []
  patterns:
    - "Obsidian.Modal lifecycle in onOpen/onClose ONLY — DO NOT override open()/close() (BLOCKER fix from plan-checker iter 2; Modal Test 8 enforces)"
    - "Constructor-callback cleanup pattern (WARNING #6) — plugin passes `() => { activeConflictModal = null }` to ConflictModal; callback fires inside onClose BEFORE contentEl.empty"
    - "Pure-TS LCS line diff (O(m*n) DP + backtrack) — no external library; bounded by fence body size (~150 lines typical; 22500 ops smoke-tested <100ms)"
    - "Line/col cursor clamp on full-doc replacement (D-conflict-03) — capture (line, col) BEFORE dispatch; targetLine = min(originalLine, newLineCount); targetCol = min(col, targetLineLength); restoredHead = min(targetLineFrom + targetCol, newDocLength)"
    - "Single-transaction full-doc replace + cursor + Transaction.addToHistory.of(false) annotation — prevents undo-stack pollution from reload"
    - "Pre-suppression Pitfall P2 early-return RELOCATED into step (b) of vault.on('modify') decision tree — same widget.currentDocHash comparison; different anchor in the tree (now occurs AFTER widget gate, BEFORE tryConsume)"
    - "D-conflict-04 in-place External-pane update — `if (activeConflictModal?.isOpen) updateExternalContent(newExt) else open new` — NEVER stack a second modal"
    - "Try/finally on DebouncedWriter.flush — pending sentinel resets regardless of success / abort / Notice / I/O error path"
key_files:
  created:
    - path: "src/widget/conflictDiff.ts"
      loc: 117
      purpose: "Pure-TS LCS line diff. Single export `lineDiff(mine, ext): DiffRow[]`; documents 'changed' kind as forward-compat (basic LCS emits only 3 of 4 kinds). NO imports beyond the local DiffRow interface."
    - path: "src/widget/ConflictModal.ts"
      loc: 175
      purpose: "Obsidian.Modal subclass. Three-button flow: Keep mine (setCta) / Keep external / View diff (inline expansion). updateExternalContent for D-conflict-04. textContent-only (zero innerHTML). Constructor accepts onCloseCallback; callback fires inside onClose BEFORE contentEl.empty."
    - path: "tests/widget/conflictDiff.test.ts"
      loc: 130
      purpose: "11 cases — LCS Tests 1-10 + DiffRow shape contract: identical, pure-add, pure-delete, middle-replace, empty/empty, empty/single, single/empty, interleaved row order, 150x150 perf <100ms, full-replace, DiffRow shape."
    - path: "tests/widget/ConflictModal.test.ts"
      loc: 392
      purpose: "11 cases — Modal Tests 1-9: open populates DOM with 3 buttons (Keep mine setCta), Keep mine click → forceFlush + close + Notice, Keep external click → reloadFromDisk + close + Notice, View diff inline expansion, updateExternalContent in-place mutation + diff re-render, onClose empties contentEl, no-innerHTML grep, lifecycle invariant (BLOCKER), activeConflictModal cleanup (WARNING #6)."
    - path: "tests/widget/externalEditReload.test.ts"
      loc: 220
      purpose: "7 cases — Reload Tests 1-5 + keep-external path: captures (line, col) BEFORE dispatch + reads disk via app.vault.read; no-op when newBody === current doc; line shrunk → cursor clamps; col shrunk → clamps to EOL; Transaction.addToHistory.of(false) annotation present; scrollTop preserved; keep-external reason path uses same line/col clamp."
    - path: "tests/widget/conflictTrigger.test.ts"
      loc: 230
      purpose: "7 cases — Trigger Tests 1-4: self-write-consumed → no-op; external + idle → silent reload, no modal; external + in-flight → ConflictModal opens; Pitfall P2 fence-body-unchanged → return BEFORE tryConsume. Plus gating (no-match → no-op) and helper coverage."
    - path: "tests/widget/conflictModalUpdate.test.ts"
      loc: 195
      purpose: "4 cases — D-conflict-04 Update Test 1: first modify constructs modal; second modify while open → updateExternalContent + constructor NOT called again; THIRD modify keeps single modal updateExternalContent fires twice; after close, new modify constructs fresh modal."
  modified:
    - path: "src/widget/debouncedWriter.ts"
      change: "Added: private `pending` sentinel boolean field; mutated true in run(), false in cancel(), false in flush completion (try/finally — covers success, error, vault.read failure, drift Notice path); public hasPending(): boolean accessor."
    - path: "src/widget/WidgetController.ts"
      change: "Added: EditorSelection + Transaction imports from @codemirror/state; extractFenceBody import from ./fenceSerialization; reloadFromDisk(reason: 'silent' | 'keep-external') method per D-conflict-03. Method captures (line, col) + scrollTop BEFORE dispatch; reads disk via app.vault.read; extracts fence body; no-ops when newBody === current doc; clamps cursor; dispatches single transaction with full-doc replace + EditorSelection.cursor(restoredHead) + Transaction.addToHistory.of(false) annotation; restores scrollTop; refreshes currentDocHash via fire-and-forget sha1."
    - path: "src/main.ts"
      change: "Added: ConflictModal import from ./widget/ConflictModal; activeConflictModal: ConflictModal | null field. Replaced Plan 19-02 vault.on('modify') placeholder with full Pattern 4 decision tree per Plan 20-03. Pitfall P2 RELOCATED into step (b) of new handler. Constructor-callback cleanup pattern wired (callback resets activeConflictModal exactly once across every close trigger). Removed `logger.debug('... Plan 20-03 reload TBD')` placeholder."
    - path: "styles.css"
      change: "Appended Phase 20 Plan 20-03 lc-conflict-* + lc-diff-* block (~70 LOC). Uses Obsidian CSS variables only (no raw hex); diff colors via color-mix on --color-green / --color-red / --color-yellow. Reduced-motion-gated External-pane flash (lc-conflict-external--updated). Mobile fallback: <600px viewport collapses 3-column grid to 1-column."
    - path: "tests/widget/debouncedWriter.test.ts"
      change: "Added 5 hasPending() tests under nested describe block: initial false, true on run, false post-forceFlush, false post-cancel, two consecutive runs stay true until flush."
decisions:
  - "Lifecycle in onOpen/onClose ONLY — DO NOT override open()/close() (BLOCKER fix from plan-checker iter 2). Obsidian fires onClose() exactly once regardless of close trigger (button click, Esc, workspace teardown, programmatic close). Overriding close() would miss internal teardown paths and leave isOpen stale-true, causing updateExternalContent to write into a detached DOM (race T-20-03-05)."
  - "Constructor-callback cleanup (WARNING #6 lock) — plugin passes `() => { activeConflictModal = null }` to the modal constructor. Callback fires inside onClose() BEFORE contentEl.empty. Locked to ONE shape so Modal Test 8 has a single behavior to assert. Alternative `plugin holds reference cleared on onClose without callback` was rejected because it requires bidirectional knowledge between plugin and modal."
  - "Pitfall P2 early-return RELOCATED from Plan 20-02's pre-suppression position INTO step (b) of the full vault.on('modify') decision tree. Same logic — different anchor: now occurs AFTER widget gate, BEFORE tryConsume. The relocation is mechanical (the comparison + widgetRegistry walk + currentDocHash field stay the same; only surrounding control-flow shape changes)."
  - "Pure-TS LCS over `diff` library dep (CONTEXT D-conflict-02 lock). 117 LOC inside the 80-150 budget. Documents 'changed' kind as reserved/forward-compat (basic LCS emits only 3 of 4 kinds; future enhancement may pair adjacent mine-only/external-only into a single 'changed' row)."
  - "DebouncedWriter.hasPending sentinel — try/finally on flush body covers every exit path (success, abort, drift Notice, I/O error, rate-limit defer). cancel() resets immediately; run() sets true; forceFlush leaves true until flush() completes."
  - "reloadFromDisk(reason) — both 'silent' and 'keep-external' use the SAME line/col clamp body. The reason parameter is currently informational only (used for the post-resolution Notice copy upstream); future variants may diverge."
  - "L8 limitation accepted (Cmd-Z after Keep external is a no-op) — addToHistory.of(false) annotation prevents reload pollution but the captured Phase 19 historyJSON references a doc state that no longer exists. Documented in WidgetController.reloadFromDisk JSDoc + this SUMMARY's `## L8 Limitation` section. Phase 19's historyJSON capture is reserved for richer undo strategies in v1.4+."
  - "Modal sizing per UI-SPEC §2 — Obsidian default modal width (`min(700px, 90vw)`); 3-column grid `1fr 1fr 1fr` with `gap: 12px`; max-height 360px per pane; no syntax highlighting on Mine/External (CONTEXT discretion deferral — non-blocking; if it slows Plan 20-03)."
  - "Color contract via Obsidian CSS variables only (UI-SPEC §Color) — diff highlight uses `color-mix(in srgb, var(--background-secondary) 85%, var(--color-green) 15%)` so cross-theme contrast is acceptable. NO raw hex anywhere in the new styles.css block."
  - "Test for innerHTML uses fs/grep on the source file content — runtime check ensures grep stays clean even after future edits. (Plan-checker iter Modal Test 7 — implementation needed careful comment phrasing to avoid the literal string in JSDoc.)"
metrics:
  duration: "~30min"
  completed: "2026-05-29"
  test_suite_delta: "1997 baseline (Plan 20-02) → 2042 passing (+45). 232 test files passing, 1 skipped, 0 failing."
---

# Phase 20 Plan 03: External-Edit Reconciliation + Conflict Modal + 3-Pane Diff (Sync) Summary

**One-liner:** Wired the v1.3 widget's external-edit reconciliation surface — vault.on('modify') decision tree branches on Pitfall P2 / tryConsume / hasPending; ConflictModal opens on in-flight typing with three-button flow + inline diff expansion + D-conflict-04 in-place updates; reloadFromDisk preserves cursor via line/col clamp; DebouncedWriter.hasPending() ships as the conflict-modal trigger gate.

Sync wave for Phase 20 — Day 3 dogfood checkpoint per CONTEXT D-plan-02. Two atomic tasks executed sequentially (TDD RED→GREEN per task):

1. **Pure-TS LCS diff + DebouncedWriter.hasPending().** New `src/widget/conflictDiff.ts` (117 LOC) with single export `lineDiff(mine, ext): DiffRow[]` per CONTEXT D-conflict-02 — O(m·n) DP table + backtrack; no external library dep. DocumentS 'changed' kind as forward-compat (basic LCS emits only 3 of 4 kinds). Added private `pending` sentinel + public `hasPending(): boolean` accessor to `DebouncedWriter`; sentinel resets on flush completion via try/finally so every exit path (success / abort / drift Notice / I/O error / rate-limit-deferred) leaves a clean post-condition. 11 LCS tests + 5 hasPending tests pass.

2. **ConflictModal + WidgetController.reloadFromDisk + replace modify-handler placeholder.** New `src/widget/ConflictModal.ts` (Obsidian.Modal subclass, 175 LOC) with three-button initial state ("Keep mine" setCta / "Keep external" / "View diff"); inline diff expansion (does NOT replace buttons); `updateExternalContent(newExt)` for D-conflict-04. Lifecycle in `onOpen/onClose` ONLY (BLOCKER fix); constructor-callback cleanup (WARNING #6 lock). Added `WidgetController.reloadFromDisk(reason)` per D-conflict-03 line/col clamp + `Transaction.addToHistory.of(false)` annotation. Replaced Plan 19-02 modify-handler placeholder in `src/main.ts` with the full Pattern 4 decision tree per Plan 20-03; Pitfall P2 RELOCATED into step (b) of new handler structure. styles.css `lc-conflict-*` block uses Obsidian CSS variables only (no raw hex). 11 ConflictModal tests + 7 externalEditReload tests + 7 conflictTrigger tests + 4 conflictModalUpdate tests pass.

## Task Outcomes

### Task 1 — Pure-TS LCS line diff + DebouncedWriter.hasPending()

**Status:** COMPLETE
**Commit:** `98457bb`
**Files:** `src/widget/conflictDiff.ts` (NEW, 117 LOC), `src/widget/debouncedWriter.ts` (modified — pending sentinel + try/finally + hasPending accessor), `tests/widget/conflictDiff.test.ts` (NEW, 130 LOC), `tests/widget/debouncedWriter.test.ts` (modified — 5 hasPending tests added under nested describe block).

**Architectural decisions baked in:**

1. **No external diff library dep — locked.** CONTEXT D-conflict-02 explicitly mandates "pure-TS line-diff (longest-common-subsequence), ~150 LOC. No external tools, no extra panes." conflictDiff.ts ships at 117 LOC — within the 80-150 budget — with a documented O(m·n) DP table + backtrack. The 'changed' kind is declared in the DiffRow union for forward-compat but the basic LCS emits only `same` / `mine-only` / `external-only` (Modal renders 4 classes via styles.css; the 4th is reserved).

2. **Sentinel sentinel-reset via try/finally — covers every exit path.** The flush body in `DebouncedWriter` has multiple early-returns (vault.read failure, drift Notice, rate-limit defer). Wrapping the body in `try { ... } finally { this.pending = false; }` guarantees the sentinel resets regardless of which exit path fires. The rate-limit-deferred path leaves `pending = true` because a subsequent `flush()` is enqueued via setTimeout; the deferred flush will reset on completion.

3. **forceFlush leaves pending true until completion.** The accessor reflects "pending OR in-flight" — both states are observable to the conflict-modal trigger gate as "writer has unflushed chars". Once `forceFlush()`'s awaited Promise resolves, the sentinel is false.

4. **Performance smoke test (LCS Test 8) — 100ms ceiling for 150x150 input.** Loose enough to accommodate CI variance; the actual measured time was <10ms in dev. Threat T-20-03-04 mitigation: input is bounded by fence body size (~150 lines typical; 1000-line worst case → 1MB DP table — no DoS).

**Test result:** 11 LCS cases + 7 existing DebouncedWriter cases + 5 new hasPending cases = **23 / 23 PASS**.

### Task 2 — ConflictModal + WidgetController.reloadFromDisk + main.ts modify-handler

**Status:** COMPLETE
**Commit:** `5c9ee7a`
**Files:** `src/widget/ConflictModal.ts` (NEW, 175 LOC), `src/widget/WidgetController.ts` (modified — reloadFromDisk + EditorSelection + Transaction + extractFenceBody imports), `src/main.ts` (modified — full decision tree replaces Plan 19-02 placeholder + activeConflictModal field + ConflictModal import), `styles.css` (modified — ~70 LOC lc-conflict-* + lc-diff-* block appended), `tests/widget/ConflictModal.test.ts` (NEW, 392 LOC), `tests/widget/externalEditReload.test.ts` (NEW, 220 LOC), `tests/widget/conflictTrigger.test.ts` (NEW, 230 LOC), `tests/widget/conflictModalUpdate.test.ts` (NEW, 195 LOC).

**Architectural decisions baked in:**

1. **Lifecycle in onOpen/onClose ONLY — BLOCKER fix locked.** ConflictModal does NOT override `open()` or `close()`. The `isOpen` boolean is set to true at the START of `onOpen()` and to false at the START of `onClose()`. Obsidian fires `onClose()` exactly once regardless of close trigger (button click, Esc, workspace teardown, programmatic `close()`). Overriding `close()` would miss internal teardown paths and leave `isOpen` stale-true, causing `updateExternalContent` to write into a detached DOM (T-20-03-05 race). Modal Test 8 enforces this — it directly invokes `(modal as any).onClose()` (NOT `modal.close()`) and asserts both `isOpen === false` AND `plugin.activeConflictModal === null`.

2. **Constructor-callback cleanup — WARNING #6 lock.** The plugin sets `this.activeConflictModal = new ConflictModal(...)` and passes a callback `() => { this.activeConflictModal = null; }` as the 5th constructor argument. The callback fires inside `onClose()` BEFORE `contentEl.empty()` so the plugin's reference resets exactly once across every close trigger. Locked to ONE shape so Modal Test 8 + Modal Test 9 have a single behavior to assert. The alternative ("plugin clears reference on a separate post-close hook") was rejected because it spreads cleanup across two coordination points.

3. **Pitfall P2 early-return RELOCATED into step (b) of the new decision tree — mechanical.** Plan 20-02 shipped the early-return as a pre-suppression check. Plan 20-03 RELOCATES it into step (b) of the full handler structure: (a) gate widget by file path, (b) compute observedFenceHash + early-return when widget.currentDocHash matches, (c) tryConsume, (d) branch on hasPending(). The comparison logic + widgetRegistry walk + currentDocHash field stay byte-for-byte the same; only surrounding control-flow shape changes. The carry-forward note in 20-02-SUMMARY.md predicted exactly this relocation.

4. **D-conflict-04 in-place External-pane update — locked.** A second `vault.on('modify')` fire while modal is open calls `activeConflictModal.updateExternalContent(observedBody)` rather than constructing a second modal. The trigger gate is `if (activeConflictModal && activeConflictModal.isOpen)` — checks both presence AND lifecycle state because the constructor-callback nulls the reference on close (so a stale post-close fire would correctly construct a fresh modal, not crash). Update Test 1 covers the first/second/third modify sequence + the post-close fresh-construction case.

5. **Line/col clamp cursor preservation — D-conflict-03.** `reloadFromDisk(reason)` captures `(line, col)` from `view.state.selection.main.head` BEFORE any await; reads disk via `app.vault.read`; extracts fence body via `extractFenceBody(disk, fenceIndex)`. If `newBody === view.state.doc.toString()` returns no-op (guards against unnecessary history pollution). Otherwise computes `targetLine = min(originalLine, newLineCount); targetCol = min(col, targetLineLength); restoredHead = min(targetLineFrom + targetCol, newDocLength)`. Dispatches a SINGLE transaction with full-doc replace + `EditorSelection.cursor(restoredHead)` + `Transaction.addToHistory.of(false)` annotation; restores `scrollDOM.scrollTop`. Fire-and-forget refresh of `currentDocHash` so the modify-handler early-return correctly absorbs the trailing modify event for THIS reload.

6. **textContent-only DOM rendering — T-20-03-01 / T-20-03-09 mitigation.** Modal Test 7 reads the source file via fs.readFileSync and asserts `grep -c innerHTML === 0`. Even comments (where the literal string was originally used to call out the no-innerHTML rule) had to be rephrased to avoid a false positive. CLAUDE.md no-innerHTML rule + DOM XSS mitigation. The diff merged-row spans are populated via `<span class="lc-diff-{kind}">.textContent = ...` only.

7. **Keep mine immediate flush per CONTEXT discretion.** "Conflict modal 'Keep mine' debounce semantics — recommended immediate flush". The button handler awaits `widget.writer?.forceFlush()` then fires `Notice('Local edits saved.', 3000)` then closes the modal. The `widget.writer` is the canonical path through `DebouncedWriter → vault.process` (Phase 19 architecture); no direct disk writes from the modal.

8. **Color contract via Obsidian CSS variables only.** styles.css `lc-conflict-*` block uses `var(--background-secondary)` for the column panes and `color-mix(in srgb, var(--background-secondary) 85%, var(--color-green) 15%)` for `lc-diff-mine-only` (likewise red for external-only). No raw hex. Reduced-motion-gated outline flash for D-conflict-04 in-place update; <600px viewport collapses the 3-column grid to a single column with horizontal scroll per pane.

**Test result:** 11 ConflictModal cases + 7 externalEditReload cases + 7 conflictTrigger cases + 4 conflictModalUpdate cases = **29 / 29 PASS** new; **45 net new tests** added (Task 1 + Task 2); **2042 / 2048 PASS / SKIP / FAIL = 2042 passed / 6 skipped / 0 failed** in full suite (1997 → 2042 baseline + 45).

## Manual UAT Documentation

**Status: PENDING-MANUAL-UAT**

The plan PLAN.md `<verify>` block specifies the SYNC-04 / SYNC-05 acceptance gate via manual UAT in a live Obsidian instance:

> Manual UAT recorded in 20-03-SUMMARY.md: external edit via second editor → modal appears with three buttons; "View diff" expands inline; second external edit while modal open updates External pane silently.

The current execution context (parallel executor agent in a worktree, no live Obsidian) cannot drive this UAT. Recommendation: a follow-up agent or the user SHOULD exercise the following sequence before Phase 20 closeout:

1. **External-edit-while-typing → modal appears.** Open an LC note with `useInlineWidget=ON`. Type some characters in the widget (so `debouncedWriter.hasPending() === true`). In a separate text editor (e.g., VS Code), edit the same `.md` file's fence body and save. Within ~1s, ConflictModal should appear with three buttons (Keep mine / Keep external / View diff).

2. **View diff expansion.** Click "View diff". The modal should EXPAND IN PLACE (not navigate to a new page); the three buttons should remain at the top; below them, three columns appear (Mine / External / Merged preview) with the LCS diff rendered.

3. **Keep mine resolution.** Click "Keep mine". The widget's local edits should land on disk; modal closes; Notice "Local edits saved." appears. The external edit IS overwritten (documented destructive action — diff view IS the confirmation surface per UI-SPEC §"Destructive actions").

4. **Keep external resolution.** Re-typify the conflict (type → external-edit → modal opens). Click "Keep external". The widget's content should reload from disk; modal closes; Notice "Reloaded from disk." appears. **L8 limitation:** Cmd-Z does NOT recover the discarded text (accepted tradeoff per CONTEXT L8 — `Transaction.addToHistory.of(false)` annotation prevents reload from polluting the undo stack, but the captured Phase 19 historyJSON references a doc state that no longer exists).

5. **D-conflict-04 second-edit-while-modal-open.** Re-typify the conflict. While the modal is open, edit the disk file again (third-party edit). The External pane in the modal should update silently in place; NO second modal should stack; the diff merged column re-renders against the latest disk content.

6. **Idle external edit (silent reload).** Open a note. Do NOT type. In a separate editor, edit the fence body. The widget should silently reload — cursor should land on the same line:col (clamped to new doc bounds if line/col shrunk); no modal appears.

The structurally enforced contracts (decision tree branching, line/col clamp cursor preservation, addToHistory.of(false) annotation, textContent-only rendering) are unit-tested via the 45 new tests. The manual UAT exercises the visual/interactional contract that unit tests cannot.

## L8 Limitation: Post-Resolution Undo Continuity

CONTEXT L8 specifies: "Phase 19 captured `historyJSON` per widget on every state-persistence-map entry. Phase 20's conflict-modal reload consumes this for undo-stack continuity across reload (carry-over from Phase 19 SUMMARY §'Open Items Carrying Forward')."

**What ships in Plan 20-03:**

The "Keep external" reload path replaces the widget doc via a single transaction with `Transaction.addToHistory.of(false)` annotation. This prevents the reload from polluting the user's undo stack — pressing Cmd-Z after the reload should NOT replay the reload as an undoable action.

**What is best-effort / accepted limitation:**

The captured Phase 19 `historyJSON` references doc states that no longer exist after the doc is replaced. Pressing Cmd-Z after a "Keep external" resolution does nothing useful — the history StateField has entries pointing at the pre-reload doc, but the doc is now the post-reload content; CM6's `historyField.fromJSON` would need to be invoked AND the user would need a coherent "what undo means" mental model that spans the conflict resolution. Both are out of scope for v1.3.

**Documented in:**
- `src/widget/WidgetController.ts:reloadFromDisk` JSDoc (lines noting "Pressing Cmd-Z after a 'Keep external' resolution does nothing useful — accepted tradeoff").
- This SUMMARY's `## L8 Limitation` section.
- UI-SPEC §"Destructive actions" line 146 (already documented at planning time).

**v1.4+ enhancement opportunity:** Replay `historyJSON` via `EditorState.fromJSON(...)` after the reload dispatch; this requires knowing the full extensions array at hydrate time AND a wholesale `view.setState(newState)` (not a transaction). Plan 20-03 does NOT ship this — Phase 19's historyJSON capture is preserved unchanged; consumers in v1.4+ can wire the replay path.

## Deviations from Plan

None of the four Rules 1-3 (auto-fix bug / auto-add missing critical functionality / auto-fix blocking issues) fired. Two minor structural choices that had Claude's discretion:

1. **Modal Test 7 — innerHTML grep** required removing the literal string `innerHTML` from JSDoc comments in `src/widget/ConflictModal.ts`. The original comment text said "NEVER innerHTML" which Modal Test 7's regex matches as a positive hit. Changed to "NEVER use the equivalent inner-HTML setter" + "no-inner-HTML rule" so the grep stays clean. Functional contract is unchanged; only the prose phrasing differs.

2. **TypeScript test fixture casts.** ConflictModal.test.ts has a `beforeEach` block that polyfills `HTMLElement.prototype.createEl/createDiv/createSpan/empty/setText` for jsdom. The Obsidian d.ts already declares typed overloads with `DomElementInfo` so a strict-typed assignment fails. Cast through `unknown` (test fixture only — runtime contract is exercised via the production code's actual `createEl(tag, { text, cls })` shape). conflictModalUpdate.test.ts also needs a callable-with-mock-property cast on the `vi.fn()` factory and `updateExternalContent` to satisfy strict mode. Both casts are scoped to test fixtures; production code uses the real Obsidian types verbatim.

3. **Plan Step 4 of Task 2 specified `widgetRegistry.getByFilePath` accessor "if it doesn't exist, add per 20-PATTERNS §4 line 304 OR walk values() filtering by ctl.file.path === file.path".** Chose the walk-`values()` approach because (a) the existing `widgetRegistry.values()` iterator is already present (Plan 20-01 carry-forward), (b) production has a SINGLE actively-typing widget per file under L10's single-active-per-file baseline, (c) adding a new accessor would create a separate code path Plan 20-04 multi-pane coordinator would need to harmonize. Walk-and-break is O(n) over registry size which is bounded by open files. **Carry-forward for Plan 20-04:** the same walk pattern can be reused for multi-pane fan-out; or Plan 20-04 may add `getByFilePath` and refactor at that point.

## Validation Results

### Automated

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run tests/widget/conflictDiff.test.ts tests/widget/debouncedWriter.test.ts` | 23 passed (11 LCS + 12 DebouncedWriter incl. 5 new hasPending) |
| `npx vitest run tests/widget/ConflictModal.test.ts tests/widget/externalEditReload.test.ts tests/widget/conflictTrigger.test.ts tests/widget/conflictModalUpdate.test.ts` | 29 passed (11 + 7 + 7 + 4) |
| `npx vitest run` (full suite) | **2042 passed / 6 skipped / 0 failing** across 232 test files (was 1997 baseline + 45 new) |
| `npm run build` | exit 0 (tsc --noEmit + esbuild production bundle) |

### Phase-level Verification Checks (from 20-03-PLAN `<verification>` block)

| # | Check | Status |
|---|-------|--------|
| 1 | `wc -l src/widget/conflictDiff.ts` returns 80-150 | 117 (in budget) |
| 2 | `grep -c "innerHTML" src/widget/ConflictModal.ts` returns 0 | 0 |
| 3 | `grep -c "textContent\|createEl" src/widget/ConflictModal.ts` returns >=3 | 12 |
| 4 | `grep -nE "Transaction\.addToHistory\.of\(false\)" src/widget/WidgetController.ts` returns reload-from-disk dispatch | 1 hit at line 371 |
| 5 | `grep -nE "logger\.debug.*Plan 20 reload TBD\|Plan 20 reload TBD" src/main.ts` returns ZERO hits | 0 (placeholder replaced) |
| 6 | `grep -nE "ConflictModal" src/main.ts` returns construction site | line 1136 (`new ConflictModal(...)`) + import |
| 7 | `grep -nE "lc-conflict-" styles.css` returns new block | 9 selectors |
| 8 | All five new test files pass via `npx vitest run` | 29 cases pass |
| 9 | Existing tests (Phase 19 + Plan 20-01/20-02) continue to pass byte-for-byte | 1997 → 2042; no pre-existing test broke |
| 10 | `npx tsc --noEmit` exits 0; `npm run build` exits 0 | both |
| 11 | Manual UAT recorded in 20-03-SUMMARY.md | PENDING-MANUAL-UAT (recorded above with detailed sequence) |
| 12 | Bundle size delta: `npm run build` reports +~5-10KB | within milestone headroom (production build succeeds; exact KB delta not measured in this execution) |

## Carry-Forward Notes for Plan 20-04

- **`widget.activeConflictModal` is now a plugin field.** Plan 20-04 multi-pane coordinator may need to read it (e.g., to skip "Take over" CTA promotion when the user is mid-conflict-resolution). The constructor-callback cleanup ensures the field is `null` whenever no modal is open.

- **`reloadFromDisk(reason)` accepts a string discriminator.** Plan 20-04's multi-pane "Take over" CTA could reuse the same primitive with a third reason string (e.g., `'multi-pane-promote'`) — both 'silent' and 'keep-external' currently share the same body, so adding a third is an enum extension only.

- **The `widgetRegistry.values()` walk-and-break pattern was used here for the modify-handler "find first matching widget".** Plan 20-04 multi-pane coordinator may want a `getByFilePath` accessor that returns ALL matching widgets (not just the first). If added, the modify-handler can be refactored to fan out silent reloads to inactive panes while opening the modal only on the active pane (CONTEXT L10 single-active baseline + the multi-widget case from Pattern 4 lines 463-468).

- **`hasPending()` accessor is now exposed on `DebouncedWriter`.** Any Plan 20-04 surface that needs to know "is the user mid-typing" reads `widget.writer?.hasPending() === true`.

- **Phase 19 historyJSON consumption is best-effort per L8.** Plan 20-04 polish phase may revisit if v1.4+ wants Cmd-Z continuity across "Keep external" reloads. The Phase 19 capture is preserved unchanged; only the consume-on-reload path is best-effort in 20-03.

- **styles.css `lc-conflict-*` + `lc-diff-*` block uses Obsidian CSS variables only.** Plan 20-04 retheme path (`view.requestMeasure()` on `css-change`) will automatically pick up theme-token changes for these classes; no per-class retheme wiring needed.

- **conflictDiff.ts is pure-function and dependency-free.** If a v1.4 enhancement wants to split adjacent mine-only/external-only rows into 'changed' rows (the 4th DiffRow kind), the work lives entirely in this file with no API changes (the kind union already declares `'changed'`).

## Self-Check: PASSED

- `src/widget/conflictDiff.ts` exists; 117 LOC; pure function (no imports beyond DiffRow interface).
- `src/widget/ConflictModal.ts` exists; 175 LOC; lifecycle in onOpen/onClose only; constructor-callback cleanup.
- `tests/widget/conflictDiff.test.ts` exists; 11 cases pass.
- `tests/widget/ConflictModal.test.ts` exists; 11 cases pass (Modal Tests 1-9 + innerHTML grep + lifecycle).
- `tests/widget/externalEditReload.test.ts` exists; 7 cases pass.
- `tests/widget/conflictTrigger.test.ts` exists; 7 cases pass.
- `tests/widget/conflictModalUpdate.test.ts` exists; 4 cases pass.
- Commit `98457bb` (Task 1) exists in git log: `git log --oneline | grep 98457bb` returns the LCS + hasPending commit.
- Commit `5c9ee7a` (Task 2) exists in git log: `git log --oneline | grep 5c9ee7a` returns the ConflictModal + reloadFromDisk + handler commit.
- Both phase requirements addressed: SYNC-04 (external-edit reload + cursor preservation) and SYNC-05 (conflict modal on in-flight typing + LCS diff + D-conflict-04 in-place update).
- `npx tsc --noEmit` exits 0.
- `npm test` exits 0 (2042 passing / 6 skipped / 0 failing).
- `npm run build` exits 0.
- All deviations documented above (Modal Test 7 comment fix; TypeScript test fixture casts; widgetRegistry.values walk over getByFilePath accessor — none affect production behavior).
- Pitfall P2 early-return RELOCATED from Plan 20-02 (NOT duplicated, NOT rewritten from scratch — same comparison + widgetRegistry walk + currentDocHash field; only surrounding control-flow shape changed).
- Modal Test 8 (lifecycle invariant) added (BLOCKER fix from plan-checker iter 2).
- Modal Test 9 (activeConflictModal cleanup via constructor callback) added (WARNING #6 fix).
- No `innerHTML` anywhere in `src/widget/ConflictModal.ts` (Modal Test 7 fs.readFileSync grep returns zero).
- LCS complexity bound documented (O(m·n); ~22500 ops for 150x150 input; 100ms perf smoke test ceiling).
- L8 limitation (Cmd-Z after Keep external is a no-op) documented in JSDoc + dedicated SUMMARY section.
- Build clean; full suite green.
