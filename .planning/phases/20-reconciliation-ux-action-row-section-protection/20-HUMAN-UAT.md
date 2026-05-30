---
status: diagnosed
phase: 20-reconciliation-ux-action-row-section-protection
source: [20-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[testing complete]

## Tests

### 1. Vim live-reconfigure dev-vault probe (VIM-02)
expected: Toggle "Vim key bindings" in Obsidian Settings → Editor with a v1.3 widget open. Verify keystrokes route to vim-mode handlers immediately (h/j/k/l navigates) without note reload. Toggle off; verify normal-mode insert restored. Cursor + scroll + undo preserved across the toggle. PASS = clean reconfigure; FAIL = needs Phase 22 VIM-03 banner fallback per CONTEXT L4.
result: pass
note: "Acceptable — needs a keystroke or two for new mode to kick in"

### 2. atomicRanges cursor-edge cases (PROTECT-01)
expected: Open a v1.3-widget LeetCode note. Exercise four cursor cases — (a) up-arrow into closer line; (b) right-arrow at end of `## Code` heading line; (c) backspace at fence-opener line; (d) type into fence body. Verify cursor jumps over fence body via atomicRanges (cases a, b); fence opener/closer body editable in source mode (case c); fence body atomic when widget mounted (case d).
result: issue
reported: "for a and b, it actually turns into source mode instead of jump over"
severity: major

### 3. Light/dark theme retheme (THEME-04)
expected: Open a v1.3-widget LeetCode note. Toggle Appearance → Light/Dark. Verify all 8 language packs retheme (token colors, gutter, line-numbers) without note reload. Repeat with a custom community theme installed (e.g., Minimal). Cursor + scroll + undo preserved across retheme.
result: issue
reported: "Theme retheme looks good for Java (current language), but the language switch is broken — looks like it hasn't been wired up. Couldn't verify all 8 language packs."
severity: major
note: "Java retheme passes; full 8-pack coverage blocked by separate language-switch bug"

### 4. Multi-pane Take-Over CTA promote/demote
expected: Open the same LeetCode note in two split panes. Verify pane B's widget greys out + shows "Click to take over" CTA when pane A is active. Click CTA; verify pane A demotes (greys with CTA) and pane B promotes (editable). L10 single-active baseline preserved — peer panes do NOT live-mirror typing.
result: issue
reported: "When left is active, right pane shows CTA correctly. But when right is active, left doesn't show CTA (asymmetric). Also: typing in either pane flashes — keep trying to add and remove the widget."
severity: blocker

### 5. Obsidian Sync conflict modal end-to-end (SYNC-04, SYNC-05)
expected: Open same vault on two devices via Obsidian Sync. Type in widget on device A; edit fence body in plain editor on device B. Verify modal appears on A within ~1s with "Keep mine / Keep external / View diff". Click "View diff" — modal expands inline to three columns (Mine | External | Merged preview). "Keep mine" → forceFlush rewrites disk. "Keep external" → reload preserves cursor via line/col clamp. Second external edit while modal open updates External pane in place (no second modal stacking).
result: skipped
reason: "User does not have Obsidian Sync subscription — cannot exercise multi-device flow."

### 6. Self-write remount cycle: focus/vim state lost after 400ms flush (carry-over from Phase 19)
expected: In Live Preview, type into a widget. After the 400ms debounced flush completes (one-way sync writes to disk), the widget retains focus, cursor position, and vim mode (if enabled). Typing should not be interrupted by widget remount.
result: issue
reported: "Widget loses focus after the 400ms sync. Originally surfaced during Phase 19 UAT and deferred to Phase 20 SYNC-04/SYNC-05. ViewPlugin rebuilds on any parent docChanged without distinguishing self-writes from external edits — after debouncedWriter flushes via vault.process(), parent doc update triggers ViewPlugin rebuild → sourceHash mismatch → eq() false → full remount → focus/vim/cursor lost."
severity: blocker
carry_over_from: "Phase 19 Test 1 (deferred)"

## Summary

total: 6
passed: 1
issues: 4
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Cursor jumps over fence body via atomicRanges when navigating with arrow keys (cases a, b)"
  status: failed
  reason: "User reported: for a and b, it actually turns into source mode instead of jump over"
  severity: major
  test: 2
  root_cause: "Two coupled defects: (PRIMARY) sectionProtectionExtension's `## Code` lock snaps cursor to `state.doc.line(fence.openerLine + 1).from` which is INSIDE the widget's Decoration.replace range; transactionFilter sets selection authoritatively, bypassing atomicRanges. (SECONDARY) Decoration.replace constructed without `block: true` for a multi-line span, so vertical motion via coordsAtPos can land mid-range."
  debug_session: .planning/debug/atomicranges-cursor-edge-cases.md
  artifacts:
    - path: "src/main/sectionProtectionExtension.ts"
      lines: "163-167, 438-505"
      issue: "`## Code` lock snap target falls inside widget replace range; transactionFilter bypasses atomicRanges"
    - path: "src/widget/liveModeViewPlugin.ts"
      lines: "84-89"
      issue: "Decoration.replace missing `block: true` for multi-line widget"
  missing:
    - "Widen `## Code` lock to `[headFrom, doc.line(closerLine + 1).from]` when fence.kind === 'leetcode-solve' so snap target lands past the widget"
    - "Add `block: true` to Decoration.replace spec in liveModeViewPlugin.ts:85 (matches codeActionsEditorExtension.ts:294 pattern)"
    - "Manual UAT verification (atomicRanges cursor behavior cannot run under vitest)"

- truth: "Language switch wired up so user can verify retheme across all 8 language packs"
  status: failed
  reason: "User reported: language switch is broken — looks like it hasn't been wired up. Java retheme alone looked good, but couldn't exercise the other 7 packs."
  severity: major
  test: 3
  root_cause: "Chevron click IS wired (chevron → switchLanguageFromWidget → processFrontMatter → metadataCache → languageCompartment.reconfigure) but produces ZERO visible feedback: chevron label and `.is-current` marker built once at mount and never refreshed; fence body intentionally not swapped (v1.3 design). Successful switch is indistinguishable from a no-op."
  debug_session: .planning/debug/language-switch-not-wired.md
  artifacts:
    - path: "src/main/languageChevronWidget.ts"
      lines: "75-303"
      issue: "Chevron label + .is-current marker captured at construction; no update method exposed"
    - path: "src/widget/widgetActions.ts"
      lines: "75-116"
      issue: "mountActionRow is one-shot; no refresh hook"
    - path: "src/widget/WidgetController.ts"
      lines: "925-962"
      issue: "metadataCache 'changed' listener reconfigures parser only; no bridge to action-row DOM"
  missing:
    - "mountActionRow returns updater closure (newSlug → void) capturing labelSpan + .is-current button list; stored on controller as ctl.actionRowRefresh"
    - "metadataCache 'changed' listener calls ctl.actionRowRefresh?.(newSlug) after languageCompartment.reconfigure dispatch"
    - "Verify chevron label updates AND .is-current marker re-targets to new slug"

- truth: "Multi-pane CTA is symmetric: each non-active pane greys + shows 'Click to take over' regardless of which pane is active"
  status: failed
  reason: "User reported: when left is active, right pane shows CTA correctly; when right is active, left does NOT show CTA — asymmetric promote/demote handler."
  severity: blocker
  test: 4
  root_cause: "Registry key `${file.path}::${fenceIndex}` lacks pane discriminator. Two panes on same file = identical key = Map.set clobbers; widgetRegistry only ever holds ONE controller per file::fenceIndex. multiPaneCoordinator.reconcileFocus walks registry.values() and can only flip state on the surviving controller — sibling pane is invisible. Mount order determines which pane the coordinator can see, producing asymmetric CTA."
  debug_session: .planning/debug/take-over-cta-asymmetric.md
  shares_root_cause_with: "Test 4 typing-flash gap (.planning/debug/widget-thrash-on-type.md)"
  artifacts:
    - path: "src/widget/WidgetController.ts"
      lines: "922, 1084"
      issue: "Registry set/delete uses pane-blind key"
    - path: "src/widget/LeetCodeFenceWidget.ts"
      lines: "111, 136"
      issue: "destroy(_dom) get + delete using lossy key — can delete OTHER pane's entry"
    - path: "src/widget/widgetRegistry.ts"
      lines: "56-67"
      issue: "Map.set overwrite semantics — by design, but key strategy wrong for multi-pane"
    - path: "tests/widget/multiPaneCoordinator.test.ts"
      lines: "169-170"
      issue: "Fixture fabricates distinct keys ('foo.md::0:a', 'foo.md::0:b') that production cannot produce, masking regression"
  missing:
    - "Extend registry key with per-mount discriminator (leafId, parent EditorView ref, or per-mount UUID) — recommend leafId from host.closest('.workspace-leaf')"
    - "Update all 5 callsites (set, delete x2, get x1) to round-trip through new key shape"
    - "Fix LeetCodeFenceWidget.destroy to delete ONLY its own entry (not look up by content-key alone)"
    - "Add regression test: mountLeetCodeWidget twice with identical (file, fenceIndex) — assert both controllers visible to widgetRegistry.values()"
    - "Fix tests/widget/multiPaneCoordinator.test.ts:169-170 fabricated keys to match production shape"

- truth: "Typing in active pane is stable — widget does not unmount/remount on each keystroke"
  status: failed
  reason: "User reported: typing in either pane flashes — widget keeps trying to add and remove. Indicates widget thrash on edit (likely re-decorate loop or active-pane recompute on every transaction)."
  severity: blocker
  test: 4
  root_cause: "Two compounding bugs: (PRIMARY) Registry key collision (same as CTA asymmetry gap). (AMPLIFIER) Plan 19-02 Hook 1 at main.ts:962-966 — `active-leaf-change` synchronously calls flushAll on every focus event. Typing → CM6 selection-driven focus → active-leaf-change → flushAll → vault.process echo → parent CM6 ViewPlugin rebuilds Decoration → new sourceHash → eq() false → CM6 destroys+remounts widget DOM. Two active-leaf-change subscribers (Hook 1 + Plan 20-04 coordinator) make the echo louder."
  debug_session: .planning/debug/widget-thrash-on-type.md
  shares_root_cause_with: "Test 4 CTA asymmetry gap (.planning/debug/take-over-cta-asymmetric.md)"
  artifacts:
    - path: "src/main.ts"
      lines: "962-966 (Hook 1), 1035 (coordinator subscriber)"
      issue: "Two active-leaf-change handlers; Hook 1's synchronous flushAll triggers disk-write echo loop on every focus event"
    - path: "src/widget/liveModeViewPlugin.ts"
      lines: "110-116"
      issue: "ViewPlugin rebuilds Decoration on any docChanged with no provenance check"
    - path: "src/widget/LeetCodeFenceWidget.ts"
      lines: "66-74"
      issue: "eq() compares sourceHash; correct logic but brittle against parent-doc echo"
  missing:
    - "Per-pane registry keys (shared with CTA asymmetry fix)"
    - "Gate Hook 1 flushAll on actual leaf transition (track lastActiveLeafFilePath; skip when unchanged) OR move flush off synchronous path (debounce/requestIdleCallback)"
    - "Optional: make eq() consult selfWriteSuppression so DOM is reused across self-write echoes (overlaps with self-write-remount-cycle fix — consider unifying into single 'self-write provenance' primitive)"

- truth: "After 400ms debounced flush, widget retains focus + cursor + vim state (no self-write remount)"
  status: failed
  reason: "User reported: widget loses focus after the 400ms sync. Confirmed in BOTH vim and non-vim modes — focus loss is widget-level (not vim state machine). Carry-over from Phase 19 Test 1 (deferred to Phase 20)."
  severity: blocker
  test: 6
  carry_over_from: "Phase 19 Test 1"
  reproduces_in: ["vim mode", "non-vim mode"]
  root_cause: "ViewPlugin in liveModeViewPlugin.ts:110-116 rebuilds DecorationSet on every update.docChanged with NO provenance check. After debouncedWriter.flush() → vault.process writes new body → Obsidian dispatches docChange transaction back onto parent CM6 → ViewPlugin recomputes sourceHash from NEW body → on-screen widget's sourceHash was from OLD body → LeetCodeFenceWidget.eq() returns FALSE → CM6 destroys+remounts widget → focus/cursor/vim state lost. selfWriteSuppression map is wired correctly for vault.on('modify') reload path but has no connection to the CM6 ViewPlugin transaction stream."
  debug_session: .planning/debug/self-write-remount-cycle.md
  confirms_phase_19_hypothesis: true
  artifacts:
    - path: "src/widget/liveModeViewPlugin.ts"
      lines: "81-90, 110-116"
      issue: "Unconditional ViewPlugin rebuild on docChanged with no provenance gate; sourceHash recomputed fresh per build from parent doc"
    - path: "src/widget/debouncedWriter.ts"
      lines: "181-192"
      issue: "vault.process write has no signal to ViewPlugin that this is a self-write echo"
    - path: "src/widget/LeetCodeFenceWidget.ts"
      lines: "66-74"
      issue: "eq() works as designed; sourceHash necessarily transitions on self-write so DOM reuse cannot save the widget"
    - path: "src/widget/selfWriteSuppression.ts"
      issue: "Correctly arms/consumes for vault-layer modify path; not consulted by ViewPlugin update()"
  missing:
    - "Recommended path (a — suppression-map analog): per-(filePath, fenceIndex) 'expected next sourceHash' map on plugin singleton. debouncedWriter.flush() arms it with djb2(newBody) BEFORE vault.process. liveModeViewPlugin.update() checks it: if rebuilt sourceHash matches armed value, skip rebuild for THIS transaction (rebuild on next docChanged). One-shot consume. TTL-bounded for safety. Mirrors selfWriteSuppression shape, plumbed at CM6 layer."
    - "Alternative path (b — userEvent annotation): wrap vault.process so parent CM6 sees programmatic transaction with `'leetcode.self-write'` userEvent + addToHistory.of(false). ViewPlugin checks tr.annotation(Transaction.userEvent) and skips rebuild if leetcode.* prefix. Consistent with existing `'leetcode.*'` annotation convention (CLAUDE.md)."
    - "Verify in both vim and non-vim modes — gap reproduces in both per UAT."
