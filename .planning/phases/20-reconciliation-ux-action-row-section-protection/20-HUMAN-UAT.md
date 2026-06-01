---
status: passed
phase: 20-reconciliation-ux-action-row-section-protection
source: [20-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-31
rerun_after: "gap-closure plan 20-10 — final UAT replay 2026-05-31 covering T3/T7/T8/T9/T10 + 7 hotfix patches"
result_summary: "All five UAT gaps closed by Plan 20-10 + 7 hotfix patches; user signoff 2026-05-31. 3 minor cosmetic items deferred to Phase 22 polish (vim-Tab cursor marker, widget hover border, action-row monospace font)."
---

## Current Test

[testing complete — all gaps closed by Plan 20-10 + 7 hotfix patches; UAT-approved 2026-05-31]

## Tests

### 1. Vim live-reconfigure dev-vault probe (VIM-02)
expected: Toggle "Vim key bindings" in Obsidian Settings → Editor with a v1.3 widget open. Verify keystrokes route to vim-mode handlers immediately (h/j/k/l navigates) without note reload. Toggle off; verify normal-mode insert restored. Cursor + scroll + undo preserved across the toggle. PASS = clean reconfigure; FAIL = needs Phase 22 VIM-03 banner fallback per CONTEXT L4.
result: pass
note: "Acceptable — needs a keystroke or two for new mode to kick in"

### 2. atomicRanges cursor-edge cases (PROTECT-01)
expected: Open a v1.3-widget LeetCode note. Exercise four cursor cases — (a) up-arrow into closer line; (b) right-arrow at end of `## Code` heading line; (c) backspace at fence-opener line; (d) type into fence body. Verify cursor jumps over fence body via atomicRanges (cases a, b); fence opener/closer body editable in source mode (case c); fence body atomic when widget mounted (case d).
result: pass
verified_after: "20-07 gap closure (2026-05-31)"
prior_result: issue
prior_reported: "for a and b, it actually turns into source mode instead of jump over"

### 3. Light/dark theme retheme (THEME-04)
expected: Open a v1.3-widget LeetCode note. Toggle Appearance → Light/Dark. Verify all 8 language packs retheme (token colors, gutter, line-numbers) without note reload. Repeat with a custom community theme installed (e.g., Minimal). Cursor + scroll + undo preserved across retheme.
result: issue
reported: "Switch language is not working — nothing happens when I choose a different language. Theme retheme itself works (Java retheme good); other aspects fine."
severity: major
regression_after: "20-08 chevron refresh + 20-09 — gap re-opens after gap-closure plans"
prior_result: issue
prior_reported: "Theme retheme looks good for Java (current language), but the language switch is broken — looks like it hasn't been wired up. Couldn't verify all 8 language packs."

### 4. Multi-pane Take-Over CTA promote/demote
expected: Open the same LeetCode note in two split panes. Verify pane B's widget greys out + shows "Click to take over" CTA when pane A is active. Click CTA; verify pane A demotes (greys with CTA) and pane B promotes (editable). L10 single-active baseline preserved — peer panes do NOT live-mirror typing.
result: pass
verified_after: "20-05 (CTA + thrash) + 20-09 (residual self-write remount) — 2026-05-31"
prior_result: issue
prior_reported: "When left is active, right pane shows CTA correctly. But when right is active, left doesn't show CTA (asymmetric). Also: typing in either pane flashes — keep trying to add and remove the widget."

### 5. Obsidian Sync conflict modal end-to-end (SYNC-04, SYNC-05)
expected: Open same vault on two devices via Obsidian Sync. Type in widget on device A; edit fence body in plain editor on device B. Verify modal appears on A within ~1s with "Keep mine / Keep external / View diff". Click "View diff" — modal expands inline to three columns (Mine | External | Merged preview). "Keep mine" → forceFlush rewrites disk. "Keep external" → reload preserves cursor via line/col clamp. Second external edit while modal open updates External pane in place (no second modal stacking).
result: skipped
reason: "User does not have Obsidian Sync subscription — cannot exercise multi-device flow."

### 9. Retrieve last submission (action row + command palette) (blocker)
expected: With a solved problem, click the Retrieve icon in the action row OR run the "Retrieve last submission" command. The plugin queries LC for the most recent accepted submission and writes its code into the widget. v1.2 path worked — Phase 20 widget path should match.
result: issue
reported: "Retrieve last submission says 'no submission found' from BOTH the command palette AND the action-row button — but submissions exist on LC."
severity: blocker
added: 2026-05-31 (re-run)
likely_shares_root_cause_with: "T3 + T7 — same widget→plugin handoff, frontmatter resolution, or fence-kind awareness path"
hypothesis: "retrieveLastSubmissionFromWidget at src/main.ts:2866 OR retrieveLastSubmissionWithSlug at line 2680 may be: (a) reading wrong slug from frontmatter, (b) querying LC with a stale csrftoken / session, (c) post-20-09 kind-aware fence detection rejecting valid fence as 'legacy'"

### 10. Reset inserts plain ``` codeblock instead of leetcode-solve fence (blocker — data corruption)
expected: Reset (action row icon AND command palette "Reset to starter code") replaces the fence body's code with the LC starter snippet, KEEPING the existing leetcode-solve fence opener/closer. The widget continues to mount on the same fence.
result: issue
reported: "Reset (both action row button AND command) inserts a plain ``` codeblock — NOT the leetcode-solve widget fence. Effectively destroys the v1.3 widget on the note (replaces it with a v1.2-style fence)."
severity: blocker
added: 2026-05-31 (re-run)
data_corruption: true
hypothesis: "resetCode in src/main.ts (around line 2663 + resetCodeWithConfirm in src/solve/resetCodeWithConfirm.ts) does NOT preserve the fence kind. resetCodeWithConfirm.ts:41 FENCE_RE = /^\\s*```/ matches generic fence opener, doesn't carry forward the 'leetcode-solve' tag. Likely: replaceFence regenerates opener as ```<lang> instead of ```leetcode-solve."
artifacts:
  - path: "src/main.ts"
    lines: "2848-2862 (resetFromWidget), 767 (command palette dispatch)"
    issue: "Both routes call this.resetCode(file, slug); shared regression"
  - path: "src/solve/resetCodeWithConfirm.ts"
    lines: "41 (FENCE_RE), full fence-rewrite path"
    issue: "Generic fence regex; no leetcode-solve fence-kind carry-forward"

### 8. Action row sits OUTSIDE the codeblock background (cosmetic / DOM structure)
expected: Action row (`.leetcode-code-actions` — chevron + Retrieve + Reset + AI Solution + Run + Submit) renders as a SIBLING below the grey-backgrounded code editor container, NOT inside it. The grey codeblock background ends at the closing brace; the action row floats on the parent note background. Matches the v1.2 reading-mode layout (codeActionsPostProcessor) where the row sits below the `<pre>` block.
result: issue
reported: "Action row is currently rendering inside the grey codeblock container; should be outside (sibling below). Layout regression — see screenshots: current (inside) vs. target (outside)."
severity: cosmetic
added: 2026-05-31 (re-run)
hypothesis: "mountActionRow appends to ctl.container which IS the grey-backgrounded widget container. Fix: introduce .leetcode-widget-codeblock wrapper around .cm-editor that owns the grey background; leave .leetcode-code-actions as a sibling at the ctl.container level (no background)."
artifacts:
  - path: "src/widget/widgetActions.ts"
    issue: "mountActionRow appends row to wrong container"
  - path: "src/widget/WidgetController.ts"
    issue: "ctl.container DOM structure — needs an inner code wrapper to host the grey background"
  - path: "styles.css"
    issue: "Grey-background CSS rule applies to ctl.container; should move to .leetcode-widget-codeblock"

### 7. Run / Submit reads code from widget (ACTION-04, blocker)
expected: With a v1.3 widget mounted, click "Run" — request goes out with the code currently in the widget editor (per `widget.view.state.doc.toString()` after `flushNow()`); LC returns Run verdict. Same for "Submit". No "can't find code block" error. Frontmatter `lc-slug` and `lc-language` resolved via `metadataCache.getFileCache(file)`.
result: issue
reported: "Submit and Run are not working — can't find the code block."
severity: blocker
added: 2026-05-31 (re-run)
likely_shares_root_cause_with: "Test 3 (language switch) — both go through the widget → plugin *FromWidget handoff"

### 6. Self-write remount cycle: focus/vim state lost after 400ms flush (carry-over from Phase 19)
expected: In Live Preview, type into a widget. After the 400ms debounced flush completes (one-way sync writes to disk), the widget retains focus, cursor position, and vim mode (if enabled). Typing should not be interrupted by widget remount.
result: pass
verified_after: "20-06 (Cluster B) + 20-09 (residual self-write remount) — 2026-05-31"
prior_result: issue
prior_reported: "Widget loses focus after the 400ms sync."
carry_over_from: "Phase 19 Test 1 (deferred)"
also_resolves: "Phase 19 Test 1 deferred carry-over"

## Summary

total: 10
passed: 4
issues: 5
pending: 0
skipped: 1
blocked: 0
note: "Re-run after 20-05/06/07/08/09 (2026-05-31): T2/T4/T6 now pass. New gaps surfaced: T3 (language-switch silent), T7 (Run/Submit can't find code block), T8 (action row inside codeblock — cosmetic), T9 (retrieve last submission says 'no submission found' from both command + action row), T10 (Reset inserts plain ``` codeblock — DATA CORRUPTION, destroys v1.3 widget). T3/T7/T9 likely share root cause (widget→plugin *FromWidget handoff). T10 is independent (resetCode fence-kind preservation). Phase 19 Test 1 deferred carry-over resolved by T6 pass."

## Gaps

- truth: "Language switch produces visible feedback so user can verify retheme across all 8 language packs"
  status: passed
  resolved_by: "20-10-PLAN.md (gap closure for T3/T7/T8/T9/T10) + hotfix patches a7b65f1, 424e02c, 5a5c620, fff3b72, 4cfa60e, 54c0647, 981cc91"
  verified: 2026-05-31
  reason: "User reported (2026-05-31 re-run): switch language is not working — nothing happens when choosing a different language. Theme retheme itself works for the current pack. Regression after gap-closure plans 20-08 (chevron refresh) and 20-09 landed."
  severity: major
  test: 3
  regression_after: "20-08 (chevron refresh) + 20-09 (language-switch-wrong-fence)"
  prior_root_cause: "Chevron click IS wired (chevron → switchLanguageFromWidget → processFrontMatter → metadataCache → languageCompartment.reconfigure) but produces ZERO visible feedback: chevron label and `.is-current` marker built once at mount and never refreshed; fence body intentionally not swapped (v1.3 design). Successful switch is indistinguishable from a no-op."
  debug_session: .planning/debug/language-switch-not-wired.md
  artifacts: []
  missing:
    - "Re-diagnose: 20-08 was supposed to wire mountActionRow refresh closure; 20-09 was supposed to fix language-switch-wrong-fence. Re-trace the click path and confirm where it fails — chevron click handler firing? processFrontMatter writing? metadataCache emit? languageCompartment dispatch? actionRowRefresh callback?"
    - "Verify chevron label updates AND .is-current marker re-targets when frontmatter changes"
    - "Verify language pack swap is observable (token colors change to match new language pack)"

- truth: "Run / Submit click on the action row reads code from widget state (no 'can't find code block' error) and routes to the LC API"
  status: passed
  resolved_by: "20-10-PLAN.md (gap closure for T3/T7/T8/T9/T10) + hotfix patches a7b65f1, 424e02c, 5a5c620, fff3b72, 4cfa60e, 54c0647, 981cc91"
  verified: 2026-05-31
  reason: "User reported (2026-05-31 re-run): Submit and Run are not working — can't find the code block. ACTION-04 path appears broken at runtime."
  severity: blocker
  test: 7
  likely_shares_root_cause_with: "Gap T3 — language switch — both depend on widget → plugin *FromWidget handoff"
  hypotheses:
    - "Frontmatter resolution failing: metadataCache.getFileCache(file)?.frontmatter returns undefined (e.g., file ref drift across remount, OR frontmatter missing lc-slug/lc-language after 20-09 self-write fix)"
    - "Widget controller registry lookup failing: ctl.view is null or stale after 20-05 per-pane registry-key change introduced widget identity drift"
    - "ctl.view.state.doc.toString() returns empty string (e.g., wrong EditorView reference; 20-09 child→parent CM6 sync changed which view holds canonical body)"
    - "*FromWidget methods at src/main.ts:2731 (runFromWidget) and 2792 (submitFromWidget) are gated on something that's now false (e.g., embed-context guard, useInlineWidget flag mismatch)"
    - "Action-row mount adapter (src/widget/widgetActions.ts mountActionRow) host adapter is stale after a 20-08 refactor — runFromActive callback no longer routes to runFromWidget"
  artifacts:
    - path: "src/main.ts"
      lines: "2731-2790 (runFromWidget), 2792-2830 (submitFromWidget)"
      issue: "Need to verify code-resolution path: widget.view.state.doc.toString() AND metadataCache.getFileCache(file)?.frontmatter both return non-empty"
    - path: "src/widget/widgetActions.ts"
      lines: "mountActionRow"
      issue: "Host adapter routing — verify runFromActive: () => ctl.plugin.runFromWidget(ctl) wiring not broken"
    - path: "src/widget/WidgetController.ts"
      issue: "Verify ctl.view, ctl.file, ctl.fenceIndex are all stable post-20-05 + 20-09 changes"
  missing:
    - "Reproduce in dev vault with logger.debug breadcrumbs at: (a) action-row click → host adapter, (b) host adapter → *FromWidget, (c) *FromWidget code resolution, (d) frontmatter resolution"
    - "Identify which of: code='', frontmatter=undefined, ctl.view=null, or wrong file ref — produces the 'can't find code block' error path"
    - "Cross-check with T3 root cause to determine if a single fix closes both"

- truth: "Action row renders OUTSIDE the grey codeblock container (sibling below .cm-editor), matching v1.2 reading-mode layout"
  status: passed
  resolved_by: "20-10-PLAN.md (gap closure for T3/T7/T8/T9/T10) + hotfix patches a7b65f1, 424e02c, 5a5c620, fff3b72, 4cfa60e, 54c0647, 981cc91"
  verified: 2026-05-31
  reason: "User reported (2026-05-31 re-run): action row currently inside the grey codeblock container; should be outside as a sibling below. Layout regression visible in screenshots."
  severity: cosmetic
  test: 8
  hypothesis: "mountActionRow appends to ctl.container which IS the grey-backgrounded widget container. Need a wrapping `.leetcode-widget-codeblock` div around `.cm-editor` that owns the grey background CSS; leave `.leetcode-code-actions` as a sibling at the ctl.container level."
  artifacts:
    - path: "src/widget/widgetActions.ts"
      lines: "mountActionRow"
      issue: "Appends action row to ctl.container; that container also hosts .cm-editor + grey background, putting row inside the grey region"
    - path: "src/widget/WidgetController.ts"
      issue: "DOM structure: ctl.container needs an inner .leetcode-widget-codeblock wrapper around .cm-editor so the grey background scopes only to the editor"
    - path: "styles.css"
      issue: "Grey background CSS rule is currently scoped to the widget container; needs to move to .leetcode-widget-codeblock"
  missing:
    - "Introduce .leetcode-widget-codeblock wrapper inside ctl.container around the .cm-editor mount"
    - "Move grey background CSS from outer container to .leetcode-widget-codeblock"
    - "mountActionRow continues to append to ctl.container (now sibling of the wrapper, not inside it)"
    - "Visual regression check: screenshot in light + dark themes matches the target layout (action row floats on note background, codeblock keeps grey)"

## Resolved Gaps (re-verified 2026-05-31)

- truth: "Cursor jumps over fence body via atomicRanges when navigating with arrow keys (cases a, b)"
  test: 2
  resolved_by: "20-07-PLAN.md gap-closure"
  verified: 2026-05-31

- truth: "Multi-pane CTA is symmetric + typing in active pane is stable (no widget thrash)"
  test: 4
  resolved_by: "20-05-PLAN.md (CTA + thrash) + 20-09-PLAN.md (residual self-write remount)"
  verified: 2026-05-31

- truth: "After 400ms debounced flush, widget retains focus + cursor + vim state (no self-write remount)"
  test: 6
  carry_over_from: "Phase 19 Test 1"
  resolved_by: "20-06-PLAN.md (Cluster B) + 20-09-PLAN.md (residual)"
  verified: 2026-05-31
