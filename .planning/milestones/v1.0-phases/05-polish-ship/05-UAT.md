---
status: resolved
phase: 05-polish-ship
source: [05-05-SUMMARY.md, live smoke 2026-05-10]
started: 2026-05-10T22:00:00-07:00
updated: 2026-05-13T23:55:00Z
scope: "Live UAT during Phase 5 execution. Captures regressions and deferred work surfaced through user testing of the deployed plugin in ~/Documents/Leetcode vault."
resolution: "G1 (edit-mode inline buttons) absorbed by Phase 05.1; G2 (pill labels) addressed in Phase 05.4 polish. All deferred items now closed."
---

## Current Test

[awaiting: edit-mode inline buttons (UAT-3)]

## Tests

### 1. Reading-mode Run/Submit buttons appear only under `## Code`
expected: |
  In Reading Mode on an lc-slug note with `## Problem` (containing fenced example blocks)
  and `## Code` (containing the solution), Run + Submit buttons appear below the `## Code`
  fenced block only. Example code blocks in `## Problem` show no buttons.
result: pass (fix landed in this phase after live smoke surfaced the bug)

### 2. Reading-mode button clicks dispatch Run/Submit
expected: |
  Click "Run" below the Code block → RunModal opens (seeded from exampleTestcases,
  editable tabs). Click "Submit" → verdict modal opens with polling.
result: pass (fix landed after live smoke surfaced that editorCheckCallback gated out
Reading Mode; click handlers now call plugin.runFromActive()/submitFromActive() directly)

### 3. Past Submissions modal — status pills show no letter/label
expected: |
  In the Past Submissions modal (LeetCode: View past submissions), each row has a
  status pill at the far-left. The pill should contain a visible label (e.g., "AC",
  "WA", "TLE", "CE") or full status text, so users can identify verdict type at a
  glance. Currently pills render as colored shapes with no text except for "Compile
  Error" which somehow does render text — other verdict types are blank colored pills.
result: fail — pre-existing Phase 4 polish bug, not introduced by Phase 5.
severity: medium-polish (not ship-blocker — colors alone are partial signal, but
  accessibility-poor and ambiguous for WA vs TLE vs MLE vs RE which are all red).
resolves_phase: "5.1 or 5.2"
notes: |
  Investigation pointer: src/graph/SubmissionPickerModal.ts — the row renderer. Check
  whether a label span is being skipped for non-CE statuses, or if CSS `color` is being
  set to the background color (invisible text). CE works because it may use a different
  render branch.

### 4. Edit-mode inline Run/Submit buttons anchored below `## Code` fenced block
expected: |
  In Edit Mode (Live Preview or Source Mode), on an lc-slug note, Run + Submit buttons
  appear INLINE directly below the closing ``` of the `## Code` fenced block — anchored
  to that specific block, scrolling with the note content, not a floating/corner toolbar.
  Clicking dispatches runFromActive / submitFromActive. No layout corruption in the rest
  of the note (no inserted whitespace, no duplicate widgets, no shifted heading positions).
result: resolved (deferred to Phase 5.1; landed there 2026-05-11 — see 05.1 VERIFICATION.md status: passed)
notes: |
  D-11 originally scoped Reading Mode only, deferring Live Preview / CM6 path post-v1.
  User override during 05-05 live smoke: "edit mode button is more important, user type
  code in edit mode, they should not switch to read to submit, that's a lot of churn."

  First attempt used `registerEditorExtension` + CM6 ViewPlugin + Decoration.widget with
  `block: true`. Visible layout corruption in Live Preview — the block widget reserved
  inappropriate line height and fought Obsidian's own Live Preview widget layer that
  renders fenced blocks as formatted blocks. Screenshot captured by user showed large
  blank rectangle inserted mid-document between example blocks.

  Second approach (floating toolbar anchored bottom-right of editor pane) rejected by
  user: "not really what I want, sry, i need something that anchor to the code block."

  Ship-blocking for v1 per user judgment ("this is not a shipable version"). Release
  (05-07) held until Phase 5.1 lands correctly.

  Phase 5.1 scope hints: deeper CM6 research (likely need to cooperate with
  livePreviewState or use an inline mark decoration rather than block widget), test in
  BOTH Source Mode and Live Preview, live-verify each iteration rather than relying on
  unit tests alone.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### G1: Edit-mode inline Run/Submit buttons (UAT-4) — RESOLVED
status: resolved (2026-05-11)
severity: was ship-blocker
resolves_phase: "5.1"
description: |
  Phase 5.1 shipped Run/Submit buttons anchored inline below the `## Code` fenced
  block in Edit Mode via the CodeActionsWidget block decoration with G-LAYOUT-V2.
  See .planning/phases/05.1-edit-mode-inline-buttons/05.1-VERIFICATION.md (status: passed).

### G2: Past Submissions pill labels missing (UAT-3) — RESOLVED
status: resolved (2026-05-11/12 polish phases)
severity: was medium-polish
resolves_phase: "5.4"
description: |
  Phase 5.4 polish addressed verdict-pill rendering; pills now display verdict
  text correctly. See .planning/phases/05.4-run-verdict-ux-button-polish/.
