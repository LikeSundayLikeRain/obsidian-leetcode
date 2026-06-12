---
status: complete
result: passed
phase: 21-v1-2-migration
source: [21-VERIFICATION.md]
started: 2026-06-01T21:35:00Z
updated: 2026-06-12
gap_closure_plans: [21-08, 21-09, 21-10, 21-11, 21-12, 21-13, 21-14, 21-15, 21-16, 21-17]
gap_closure_status: all_resolved
re_test_complete: 2026-06-01T21:10:00Z
cycle_2_re_test_complete: 2026-06-02T00:00:00Z
cycle_2_results:
  R2: passed (cycle-2 fix d6e41d0 — metadataCache wait + fall-through to mount)
  R4: passed (cycle-2 fix 79d2503 — within-fence layout + accent CTA in both modes)
  R6: passed (cycle-2 confirmed — Plan 21-16 NoteWriter post-write rerender DI works)
  R9: passed (cycle-2 confirmed — Plan 21-17 applyPeerSync peer-sync fan-out works)
R10_resolution: "Resolved by Phase 21.1 — typing flicker fix (MIGRATE-FLICKER-01)"
result_summary: "All migration UAT scenarios resolved. Cycle-2 closures (R2/R4/R6/R9) verified during dogfood; R10 typing-flicker addressed in Phase 21.1. Migration shipped in 1.3.0-beta.1 and validated through BRAT 7-day dogfood."
---

## Current Test

[cycle-2 re-test complete — 4 cycle-2 closures pass + R10 new gap filed]

## Re-Test Tests (post gap-closure)

Code for all 6 originally diagnosed UAT gaps has shipped via plans 21-08..21-13. The following 8 live-Obsidian items must be re-tested to confirm the fixes work in a real Obsidian instance:

### R1. Widget mounts on same open after auto-migration (21-08 / MIGRATE-CR-01)
expected: "Open a v1.2 fixture note in Reading mode in a dev vault with autoMigrateOnOpen=ON. Within ~50ms the legacy fence is rewritten to ```leetcode-solve AND the v1.3 widget mounts ON THE SAME OPEN. Closing+reopening NOT required."
result: pass

### R2. Frontmatter auto-repair with defaultLanguage=Java (21-09 / MIGRATE-FM-REPAIR-01)
expected: "Open a note with lc-slug + ```leetcode-solve fence + lc-language MISSING in frontmatter. With defaultLanguage=Java in settings, frontmatter is auto-repaired to lc-language: java BEFORE the widget mounts. NO Notice 'lc-language frontmatter missing; falling back to Python' fires. Widget mounts using Java."
result: pass
cycle_2_status: resolved
cycle_2_fix_commit: d6e41d0
cycle_2_fix_summary: |
  Root cause: processFrontMatter resolves before metadataCache.changed
  fires. Plan 21-14's rerenderReadingModePanes hand-off only handled
  Reading-mode panes (getMode() === 'preview' filter); Live-Preview leaves
  no-op'd that helper, leaving the widget stuck on the pre-repair stale
  Python+Notice fallback DOM.
  Fix: codeBlockProcessor's repaired-branch now awaits a bounded poll
  (16 ticks @ ~50ms = ~800ms ceiling) for metadataCache to reflect
  lc-language, then falls through to the existing addChild path so the
  widget mounts with the freshly-written language. Belt-and-suspenders
  same wait pattern in the LP StateField repair branch.
  Verified pass 2026-06-01 in dev vault on
  LeetCode/11-container-with-most-water.md (autoMigrate=ON, default=java).
why_human: "Same shape as R1's resolved bug — repair triggers a frontmatter write but no rerender hand-off, so the widget that mounted before repair stays in a stale/uninitialized state. Symmetric to MIGRATE-CR-01 but for the repair path, not the migrate path."
diagnosis_hint: |
  Plan 21-09 wired repairFrontmatterIfNeeded into the readingModeMigrationHook + post-processor + Live Preview StateField. After the processFrontMatter write, we need the SAME post-write rerender that 21-08 added for migrate(). Currently the readingModeMigrationHook only chains rerenderPreviewLeaves after migrate() resolves; the .then() chain after repair() does NOT trigger a rerender — even though processFrontMatter just changed the frontmatter, which is what determines lc-language, which determines what the widget renders. Likely fix: in src/main/readingModeMigrationHook.ts, extend the .then() chain so a `repaired === true` outcome ALSO calls rerenderPreviewLeaves(this.app, file.path). Alternative: the repair candidate's writeback happens via fire-and-forget from inside liveModeBannerStateField (fire-and-forget repairInFlight guard) — that path also lacks a rerender hand-off in the Reading-mode case where the same path was already rendered from stale frontmatter.

### R3. Reading-mode banner on v1.2 note (21-10 / MIGRATE-BANNER-RM-01)
expected: "Open a v1.2-shaped note in Reading mode with useInlineWidget=ON AND autoMigrateOnOpen=OFF. The langSlug code block is replaced with the legacy migration banner (copy + [Migrate now] CTA + read-only `<pre><code>` of fence body). Clicking [Migrate now] runs migration and the v1.3 widget mounts on next render."
result: pass

### R4. Live-Preview banner without CM6 RangeError (21-11 / MIGRATE-BANNER-LP-01)
expected: "Open a v1.2-shaped note in Live Preview with useInlineWidget=ON AND autoMigrateOnOpen=OFF. The migration banner mounts WITHOUT throwing the CM6 RangeError 'Decorations that replace line breaks may not be specified via plugins'. Console clean. With autoMigrateOnOpen=ON, AutoMigratingBannerWidget mounts cleanly and unmounts on the post-migration update cycle."
result: pass
cycle_2_status: resolved
cycle_2_fix_commit: 79d2503
cycle_2_fix_summary: |
  Cycle-1 (Plan 21-15) added scoped LP CSS that wrapped everything in
  an extra rounded box and gave the button blue-accent styling — making
  LP look DIFFERENT from Reading mode rather than the user-expected
  parity-with-some-distinction.
  Cycle-2 fix accepts CM6's outer fence container as a constraint and
  works WITHIN it: drops the LP outer wrapper (host transparent), restores
  Obsidian UI font on banner copy + CTA, adds a horizontal separator
  between banner header and source preview, and applies accent-color
  CTA in BOTH modes (unscoped selector + !important to win against
  Obsidian's default button specificity).
  Verified pass 2026-06-02 in dev vault.
severity: minor
why_human: "RangeError fix (the actual blocker) succeeded; this is a visual/structural defect in the Live-Preview banner rendering. The legacyBannerStateField uses Decoration.replace({widget: AutoMigratingBannerWidget, block: true}) over the legacy fence range — the AutoMigratingBannerWidget builds a single host element containing copy + button + read-only pre/code, so CM6 sees the entire host as one block decoration replacing the multi-line fence. The host element's outer container picks up the surrounding code-block tint or shares the fence's CSS scope, so the visual separation is lost compared to Reading mode where the banner replaces the rendered code-block element with a freshly-styled host."
diagnosis_hint: |
  Compare AutoMigratingBannerWidget.toDOM in src/widget/liveModeViewPlugin.ts (or wherever the legacy banner widget toDOM lives) against the Reading-mode mountLegacyFenceBanner in src/widget/codeBlockProcessor.ts. The Reading-mode path produces a host with explicit class names + a separating border between banner and code preview; the LP host probably reuses the same DOM build helper but ends up nested inside CM6's `.cm-line` / `.cm-block-decoration-replace` wrapper which inherits code-block visual styling.

  Likely fix: in liveModeBannerStateField (or the AutoMigratingBannerWidget host build), add a top-level CSS class scoping the banner host to the leetcode-banner-livepreview namespace so styles from the surrounding code-block container can't bleed in. Cross-check the styles.css rules for `.lc-legacy-fence-banner` (or equivalent) — they may only target the Reading-mode banner shape.

### R5. Take-Over CTA across all remount triggers (21-12 / TAKEOVER-CTA-01)
expected: "On every remount of an LC note (close tab→reopen, switch notes→switch back, close all→reopen) the widget mounts in a working state. The 'Click to take over' overlay either does not appear (single-pane focused) OR — if it appears during a transient mid-attach window — clicking it deterministically promotes the pane and the overlay is removed. Existing two-real-pane peer flow preserved."
result: pass

### R6. No duplicate fence from problem browser (21-13 / NEWNOTE-FENCE-DEDUP-01)
expected: "With useInlineWidget=ON, opening a fresh problem from the problem browser produces a note whose ## Code section contains EXACTLY ONE ```leetcode-solve fence — ZERO langSlug-tagged sibling fences. Note renders with single LC widget mount."
result: pass
cycle_2_status: resolved
cycle_2_fix_commit: 712503e (Plan 21-16 ship — verified during cycle-2 UAT)
cycle_2_fix_summary: |
  Plan 21-16 introduced setRerenderAfterNoteWritten DI on NoteWriter and
  wired the production callback in main.ts to fire BOTH rerenderReadingModePanes
  AND a leetcodeRefreshAnnotation CM6 dispatch on every problem-browser
  open. Cycle-2 user verification confirms the widget mounts in working
  state on first paint (syntax highlighting, action row, editable) for
  fresh problems opened from the browser with useInlineWidget=ON.
  Verified pass 2026-06-02 in dev vault.
severity: major
why_human: "Source-on-disk fix succeeded (single fence — confirms 21-13 retrofit gate works). Defect is downstream: the new-note open flow lands the note in the editor, then writes/retrofits the body, but no rerender hand-off ensures the widget remounts against the now-finalized source. Same family as R2 — post-write rerender missing on the new-note path."
diagnosis_hint: |
  The new-note flow likely runs:
  1. NoteWriter.openProblem creates the file with ```leetcode-solve fence (Plan 21-13 fix correct here).
  2. Workspace.openLinkText / getLeaf().openFile loads the file in the active leaf.
  3. The widget mounts against the loaded buffer.
  4. Some retrofit/post-create step runs on the buffer (NoteWriter.retrofitStarterCode at one of the 4 call sites — probably the line 419 belt-and-suspenders).
  5. The retrofit path now no-ops correctly (Plan 21-13's wrapper gate), but the editor was already in a partially-mounted state when retrofit ran.

  Two candidate fixes:
  - Reorder: ensure the file is FULLY WRITTEN to disk (including any retrofit) BEFORE the workspace opens it. The retrofit-after-open dance is the legacy path; with useInlineWidget=ON, retrofit is a guaranteed no-op so it's safe to skip.
  - Trigger rerender post-write on the new-note path the same way 21-08 does for migrate(): after the openProblem write completes, queue a rerenderPreviewLeaves(this.app, file.path) (Reading) and/or a CM6 view refresh (Live Preview).

  Cross-check: in src/notes/NoteWriter.ts open flow, find where the leaf is opened relative to where the body is finalized. If body is finalized AFTER leaf opens, that's the race.

### R7. Two-pane peer flow regression check (21-12)
expected: "When two REAL Obsidian panes both display the same LC note, focusing one pane sets the other to 'peer' state and shows the take-over overlay. The fix to the null-leaf branch (case b) MUST NOT break case (c) two-attached-leaves behavior."
result: pass

### R8. shim-validation byte-layout (inherited deferred from 21-02)
expected: "tests/fixtures/migration/.obsidian-shim-validation.txt records DIFF: empty for live-Obsidian byte-equal validation. Already captured in original UAT Test 3 (result: pass) — included here for completeness."
result: pass

### R10. Typing flicker on body flush with autoMigrateOnOpen=ON (NEW — found during R2 cycle-2 verification)
expected: "When typing into a v1.3 LC widget in Live Preview, the child editor flushes to parent disk via vault.process every ~500ms (DebouncedWriter cadence). The widget should remain visually stable across each flush — no unmount/remount visible to the user."
result: issue
reported: "On every body-flush during typing, the widget briefly disappears and reappears. The flicker is timed with the DebouncedWriter cadence (~500ms after stopping typing). Reproduced at baseline 4bca4c4 (BEFORE the cycle-2 gap-closure work shipped) AND with autoMigrateOnOpen=ON; not reproduced with autoMigrateOnOpen=OFF, suggesting the auto-migrate fire-and-forget side-effect path is involved (possibly the StateField rebuild triggered by isMigrationCandidate / isFrontmatterRepairCandidate side-effects re-firing on every parent docChange when autoMigrate=ON)."
severity: minor
why_human: "Pre-existing bug surfaced during R2 cycle-2 testing. Bisected: present at 4bca4c4 baseline (before any cycle-2 work). NOT introduced by plans 21-14..17 nor cycle-2 review-fix commits. Probable mechanism: when autoMigrateOnOpen=ON, the LP StateField buildLeetCodeWidgetDecorations runs side-effects (migrate / repair fire-and-forget) on every parent docChange, which interacts badly with the parent→child sync push path during keystroke flushes."
diagnosis_hint: |
  - Investigate buildLeetCodeWidgetDecorations side-effects (migrate / repair fire-and-forget calls inside StateField.update) — these are gated on `isAutoMigrateEnabled(plugin)` so only fire when autoMigrate=ON.
  - Cross-check whether the codeBlockProcessor re-fire on body change in Live Preview is producing a fresh LeetCodeWidgetRenderChild on each flush (Obsidian post-processor lifecycle behavior).
  - Check whether peer-sync fan-out's applyPeerSync path (Plan 21-17) is being invoked even in single-pane scenarios (it shouldn't — single-pane-consumed should be the routing decision).
  - Likely fix: dedupe the StateField side-effect via a per-path "already-attempted-this-session" Set so migrate/repair only run once per file-open, not on every parent docChange.

### R9. Split-pane cursor preservation across edits (post-R7 finding)
expected: "When the same LC note is open in two split panes, editing in one pane preserves the cursor position in the OTHER pane's widget — cursor does NOT jump to the beginning of the widget."
result: pass
cycle_2_status: resolved
cycle_2_fix_commit: a6d333c (Plan 21-17 ship — verified during cycle-2 UAT)
cycle_2_fix_summary: |
  Plan 21-17 added applyPeerSync (incremental ChangeSpec dispatch with
  mapped selection forward-bias) + peerSyncRouting helper + main.ts
  modify-handler peer-sync fan-out (skip originator, apply to peers).
  Cycle-2 user verification: typing in pane A propagates edits to pane B
  with cursor preserved at user's chosen position (no jump-to-zero).
  Both panes remain usable. R7 two-pane peer overlay (Plan 21-12)
  preserved.
  Verified pass 2026-06-02 in dev vault.
severity: minor
why_human: "Split-pane sync is a multi-leaf timing path that requires real Obsidian Workspace to reproduce. The peer pane's CM6 view should receive an incremental Transaction (with cursor mapping) rather than a full EditorState.create(); current code path resets selection."
captured: |
  Live dev-vault probe executed interactively 2026-06-01T19:06:45Z (see Test 3 below).
  Pre-migration bytes: 77; post-migration bytes: 103; shim output bytes: 103.
  diff /tmp/obsidian-actual.txt /tmp/shim-output.txt → empty (byte-equal).
  Plan 21-04 Task 3 BLOCKER 4 acceptance criterion satisfied.

## Re-Test Summary

total: 9
passed: 5
issues: 4
pending: 0
skipped: 0
blocked: 0

---

## Original Tests (status: diagnosed → resolved by gap-closure plans 21-08..21-13)

## Tests

### 1. Reading-mode auto-migration on a real v1.2 note (CR-01 live confirmation)
expected: "Open a v1.2 fixture note in Reading mode in a dev vault with `autoMigrateOnOpen=ON`. workspace.on('file-open') fires; makeReadingModeMigrationHandler calls migrateLegacyFenceIfNeeded; within ~50ms the legacy fence opener is rewritten to ` ```leetcode-solve `, the v1.3 widget mounts, no banner appears."
result: issue
reported: "First-open: migration runs and the fence is rewritten, but the widget does not mount. Closing and reopening the note shows the widget correctly."
severity: minor
why_human: "Confirms the newly wired Reading-mode hook (Plan 21-05) fires in a real Obsidian instance — unit tests mock the dependencies; live vault proves the EventRef path and actual Reading-mode render cycle. **Highest-priority item before Phase 22 merges.**"

### 2. MIGRATE-07 single-frame ordering empirical (Plan 21-02 Task 4 Test 2)
expected: "Open a v1.2 fixture note WITH `lc-language` MISSING in dev vault (auto path). Fence opener rewritten + lc-language injected + widget mounts on the canonical language. No flash of Python+Notice (single-frame ordering)."
result: issue
reported: "Notice 'lc-language missing, falling back to Python' fires. (1) Default language is set to Java in settings but Python was used — user default not honored. (2) Chevron reflects the language but lc-language is NOT written to the frontmatter."
severity: major
why_human: "Empirical resolution of RESEARCH Open Question §1. Auto-resume default is `single_frame`; actual behavior is unobserved. If two-frame, Phase 19 C-04 hash-arm fallback must be confirmed wired."

### 3. shim_validation=captured (dev-vault probe Test 7)
expected: "tests/fixtures/migration/.obsidian-shim-validation.txt records DIFF: empty."
result: pass
captured: |
  Live dev-vault probe executed interactively 2026-06-01T19:06:45Z.
  Pre-migration bytes: 77; post-migration bytes: 103; shim output bytes: 103.
  diff /tmp/obsidian-actual.txt /tmp/shim-output.txt → empty (byte-equal).
  Artifact rewritten with shim_validation=captured + DIFF: empty.
  Plan 21-04 Task 3 BLOCKER 4 acceptance criterion satisfied.
  IMPORTANT: This run also EMPIRICALLY OBSERVED single-frame ordering AND
  honored default-language=java with NO Python+Notice flash, contradicting
  Test 2's report. Re-test Test 2 with same fixture shape to determine
  whether Test 2 issue is flaky or path-dependent (Reading vs Live Preview).
why_human: "Currently records shim_validation: skipped, DIFF: deferred. Live-Obsidian byte-equal validation is the only authoritative ground truth for MIGRATE-10 release-gate confidence."

### 4. Banner UX visual check (Reading + Live Preview with autoMigrateOnOpen=OFF)
expected: "Banner with copy 'This note uses the v1.2 format.' + [Migrate now] button + read-only `<pre><code>` of the fence body. Click [Migrate now] runs migration and remounts to v1.3 widget."
result: issue
reported: |
  Tested 9-palindrome-number.md (v1.2-shaped: lc-slug=palindrome-number, ## Code fence opener ```java, closer present, no existing ```leetcode-solve). With autoMigrateOnOpen=OFF, observed:

  (a) **Reading mode:** plain Obsidian java code block rendered (screenshot). No banner, no [Migrate now] button, no widget. Fence opener NOT rewritten until the user runs the command-palette migrate command.

  (b) **Live Preview migrate-command path:** running the LeetCode "Migrate current note" command DOES successfully migrate the file on disk (verified post-test: line 50 of 9-palindrome-number.md now reads ```leetcode-solve). However, during the migration the console emits a CodeMirror 6 RangeError:
        'Decorations that replace line breaks may not be specified via plugins'
        at e.point (app.js:354372) → e.spans → e.build → t.updateChildren → t.update → e.update → e.dispatchTransactions
     The error originates from the banner decoration build path inside the Live Preview ViewPlugin (mountLegacyFenceBanner via src/widget/liveModeViewPlugin.ts).

  Net effect: migration logic works, but the BANNER UX (what this test was verifying) is fully broken in both modes. User has no in-note way to discover or trigger migration when autoMigrateOnOpen=OFF — they would have to know about the command-palette entry.
severity: major
diagnosis_hint: |
  TWO independent bugs in the banner mount path (migration orchestrator itself is fine):

  (1) **Reading mode silent no-op.** registerMarkdownCodeBlockProcessor('leetcode-solve', handler) — confirmed at src/main.ts:1060 — only fires for fences whose tag IS 'leetcode-solve'. A langSlug-shaped legacy fence (```java, ```python, etc.) is rendered by Obsidian's default markdown processor and our handler never sees it. mountLegacyFenceBanner at src/widget/codeBlockProcessor.ts:198 is therefore unreachable for v1.2 notes in Reading mode. Likely fix: add a registerMarkdownPostProcessor that scans rendered DOM for v1.2-shaped fences (parent note has lc-slug + ## Code section + langSlug-tagged code block) and replaces their DOM with the banner.

  (2) **Live Preview CM6 RangeError on banner mount.** mountLegacyFenceBanner at src/widget/liveModeViewPlugin.ts:93 IS reached, but the Decoration.replace it builds spans line breaks, which CM6 forbids when built inside a ViewPlugin's `decorations` field. CM6 contract: line-break-spanning Decoration.replace must be built in a StateField (transaction-time), not a ViewPlugin (build-time). The legacy fence body is multi-line so the decoration inherently spans line breaks. Fixes (pick one):
     • Move the banner decoration into a StateField, OR
     • Convert to per-line Decoration.line + a separate Decoration.widget for the [Migrate now] button + a separate read-only `<pre><code>` block widget.

  Why not caught: (a) Reading-mode banner test only covers ```leetcode-solve fences via the registered code-block processor, never the v1.2 langSlug shape; (b) Live Preview ViewPlugin tests use synthetic single-line decorations that don't span line breaks.
why_human: "DOM positioning + cohesive styling is mode-specific; cannot be unit-tested."

### 5. Cross-OS backup folder path on Windows VM (if available)
expected: "`.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md` materializes correctly with no `:` in folder name."
result: skipped
reason: "User has no Windows VM available; deferring to pre-release verification. Code path inspected: src/widget/fenceMigrator.ts:273-285 (buildBackupPaths) replaces `:` with `-` and strips millisecond fragment, so the path shape is correct in theory; empirical Windows confirmation deferred."
why_human: "Only macOS dev vault is in active use; Windows path-separator and reserved-character behavior is empirical."

## Summary

total: 5
passed: 1
issues: 3
pending: 0
skipped: 1
blocked: 0

## Post-UAT Findings

(Reported by user 2026-06-01 after diagnose phase, before plan-fixes completes — captured here so plan-phase can fold in.)

- truth: "On every remount of an LC note (close tab→reopen, switch notes→switch back, close all→reopen), the takeover system mounts in a working state. The 'Click to take over' pill responds to clicks consistently across all mounts."
  status: resolved_pending_uat
  root_cause: |
    TWO compounding bugs in the multi-pane "Take over" affordance produce the deterministic Open #1-fine / Open #2-dead / Open #3-fine pattern.

    PRIMARY BUG — `reconcileFocus` mis-classifies detached containers as peers (src/widget/multiPaneCoordinator.ts:140-145):
       const ctlLeafEl = findLeafEl(ctl.container ?? null);
       if (ctlLeafEl && ctlLeafEl === activeLeafEl) {
         ctl.setPaneState('active');
       } else {
         ctl.setPaneState('peer');   // ← fires when ctlLeafEl is null
       }
    When findLeafEl(ctl.container) returns null (controller mid-mount-attach window, parked under document.body, or mid-teardown), the else branch wins and the controller flips to 'peer'. Mounts the overlay (WidgetController.setPaneState, WidgetController.ts:632-705) on the lone widget for the active file.

    SECONDARY BUG — promoteThisPane cannot self-recover when click is on the active leaf (WidgetController.ts:720-742):
    By the time the user clicks the pill, the container IS attached to the (already-active) leaf. promoteThisPane walks getLeavesOfType('markdown'), finds the leaf containing this.container, calls setActiveLeaf(leaf). Obsidian dedupes redundant focus changes — active-leaf-change does NOT re-fire — so reconcileFocus never re-runs and the controller stays stuck in 'peer' with the overlay forever.

    DETERMINISM EXPLAINED:
    - Open #1: leaf hosting note is already focused before widget mounts. Container attached when reconcileFocus runs → 'active' → no overlay.
    - Open #2: widgetRegistry.set(...) at WidgetController.ts:1176-1178 runs synchronously inside mountLeetCodeWidget BEFORE the host is attached to the leaf (CM6 attaches after toDOM returns; Reading-mode containerEl moves into leaf after post-processor returns). active-leaf-change for the new pane fires DURING this attach window. Reconcile sees registered controller + detached container → flips to 'peer'.
    - Open #3 (file-nav click): workspace.openLinkText / getLeaf().openFile fires active-leaf-change AFTER the leaf is fully populated. reconcileFocus runs against attached container → 'active' → overlay removed.
  artifacts:
    - path: "src/widget/multiPaneCoordinator.ts:140-145"
      issue: "PRIMARY: else branch flips controller to 'peer' whenever findLeafEl returns null, including the legitimate mid-attach window. A controller with a single widget for the active file plus null leaf must NOT be peer."
    - path: "src/widget/WidgetController.ts:720-742"
      issue: "SECONDARY: promoteThisPane cannot self-correct when target leaf is already active (Obsidian dedupes the focus event, no reconcile re-runs)."
    - path: "src/widget/WidgetController.ts:1176-1178"
      issue: "Timing-load-bearing: widgetRegistry.set(...) happens synchronously inside mountLeetCodeWidget BEFORE the host is attached. Source of the mid-attach race window."
    - path: "src/widget/WidgetController.ts:632-705"
      issue: "setPaneState('peer') is correct in isolation; it's the upstream input that is wrong."
  missing:
    - "PRIMARY FIX: in reconcileFocus, change else branch (multiPaneCoordinator.ts:140-145) so a null ctlLeafEl defaults to setPaneState('active') (or skip — leave state unchanged). Controllers with no leaf ancestor are parked/pre-attach/mid-teardown — none of those states should show a takeover overlay."
    - "DEFENSE-IN-DEPTH: in promoteThisPane (WidgetController.ts:720-742), add an explicit setPaneState('active') on `this` after setActiveLeaf so single-pane click-to-recover works when Obsidian dedupes the focus event."
    - "Regression test: reconcileFocus with a controller whose container has no .workspace-leaf ancestor → assert setPaneState('active') (or no-op), NOT 'peer'."
    - "Integration test: open LC note, switch away+back, assert no overlay visible AND that the click handler succeeds at takeover."
  debug_session: ".planning/debug/take-over-cta-singleton-pane-asymmetric.md"
  triage
  severity: major
  test: "post-UAT (no test number — emerged during diagnose phase)"
  reproduction: |
    Confirmed pattern (user reported 2026-06-01 with screenshot):
    - **Open #1** (first time opening note this session): widget mounts NORMALLY — full LC widget, takeover already active, code area + action row + chevron all responsive.
    - **Open #2** (any of: close tab → reopen the SAME note in a new tab; switch from the LC note to another note → switch back; close ALL tabs → reopen): widget renders WITH the "Click to take over" pill overlaid on the code area (screenshot attached). Action row (Run / Submit / AI solution / language chevron) IS visible and the code IS rendered. **Clicking the "Click to take over" pill does NOTHING.** Code area is visually marked --NORMAL-- mode but unresponsive.
    - **Open #3** (recovery action: click the file in the left file-navigation pane to re-open the same note again): widget mounts NORMALLY again, takeover works.

    Reproducible across all three "second-mount" trigger paths (a, b, c — close-tab, switch-away, close-all). Recovery via file-nav click is consistent.
  symptom_breakdown:
    - "Code IS rendered (Java starter code visible in screenshot)"
    - "Action row buttons ARE visible (AI solution / Run / Submit pills)"
    - "Language chevron IS visible (Java)"
    - "Vim-mode indicator IS visible (--NORMAL--)"
    - "ONLY the 'Click to take over' pill click handler is dead on second mount"
  hypothesis_refined: |
    On the second mount, the widget renders in a 'pre-takeover-handover' state (the "Click to take over" pill is the visible cue) but the click listener that triggers takeover is NOT attached.

    Likely root cause: the takeover system probably uses a singleton or registry keyed on file path. On Open #1 it registers; on the close+reopen, the OLD widget's registration may not have been torn down (onunload didn't fire, or fired AFTER the new widget tried to register), so the new widget sees the slot as 'taken' and renders the prompt pill — but the pill's click handler points at the OLD widget's takeover function which no longer exists in the DOM. Open #3 succeeds because by then the OLD widget's onunload has finally fired and the slot is clean.

    Alternative hypothesis: there's a takeover lifecycle FSM that has states {un-mounted, mounted-not-taken, mounted-taken-over}. Open #1 lands in mounted-taken-over directly. Close-and-reopen leaves the FSM in mounted-taken-over but the new DOM is in mounted-not-taken — visual state and FSM state diverge. The pill is rendered because visual state says "show takeover pill", but the FSM says "already taken over" so the click is a no-op.

    Either hypothesis points to: investigate the takeover registration's onload + onunload symmetry, AND the FSM transition guard on the takeover-pill click handler.
  artifacts_to_inspect:
    - "src/widget/WidgetController.ts (mountLeetCodeWidget — search for 'take over' / 'takeOver' / 'click to take over' click handler registration AND any singleton / registry by file path)"
    - "src/widget/LeetCodeFenceWidget.ts (toDOM + destroy lifecycle for Live Preview — verify destroy() actually unregisters from any takeover registry)"
    - "src/widget/codeBlockProcessor.ts (LeetCodeWidgetRenderChild.onload + onunload — Reading-mode lifecycle symmetry)"
    - "src/widget/childEditorRegistry.ts (or similar — registry by file path; check whether destroy paths actually call delete)"
    - "src/main/childEditorSync.ts (Phase 17 D-05 child-editor sync — may be the 'takeover' mechanism; check Reset child dispatch pattern)"
  triage_decision: "Add as Plan 21-12 in the gap-closure wave. Add depends_on: [] to 21-12 — independent of the other 4. Fix may turn out to share infrastructure with Test 1's rerender fix (same mount lifecycle), but route as a distinct plan because the diagnosis path is different."
  next_step: "After the planner returns the revised 21-09/10/11, dispatch a NEW debug agent for THIS issue + spawn 21-12 plan. Hold off until the current revision iteration completes to avoid concurrent planner conflicts."

- truth: "Opening a new problem from the problem browser renders the LC widget exactly once in the ## Code section."
  status: resolved_pending_uat
  root_cause: |
    The post-create "belt-and-suspenders" retrofit in NoteWriter.openProblem (src/notes/NoteWriter.ts:419) calls into starterCodeInjector.retrofit (src/solve/starterCodeInjector.ts:256-271), which calls injectCodeSection(current, { starterCode, langSlug }) WITHOUT passing fenceKind.

    With useInlineWidget=ON, buildNoteBody has just emitted a ```leetcode-solve fence into the new note (src/notes/NoteTemplate.ts:241-243 → codeBlockForV13). Because the retrofit chain never threads fenceKind: 'leetcode-solve', the v1.3 short-circuit at injectCodeSection lines 106-112 is never taken. The legacy path then walks ## Code looking for a recognized-langSlug fence — 'leetcode-solve' is NOT a member of LC_LANG_SLUGS, so neither sectionHasRecognizedFence (line 123) nor the FENCE_OPENER_CHECK loop (lines 131-140) matches. Falls into the lines 141-146 "insert starter immediately after heading" branch and PREPENDS a fresh ```<defaultLanguage> (e.g. ```java) starter block at the top of ## Code. The original ```leetcode-solve fence is preserved verbatim below it as part of sectionBody.

    Net result: TWO fence blocks in ## Code on every fresh problem-browser open with useInlineWidget=ON.

    Git evidence: commit 466f7bf (2026-06-01, "feat(21-03): add codeBlockForV13 emitter + fenceKind on injectCodeSection + buildNoteBody useInlineWidget gate") added the v1.3 emit AND fenceKind option but did NOT thread fenceKind through the retrofit wrapper. The follow-up ee8ffb9 (Plan 21-07 WR-07) hardened the v1.3 short-circuit's index but did not close the wrapper gap. Pre-existing comment block at src/main.ts:1421-1428 already documents this exact corruption pattern (Phase 20 Plan 20-09) — that earlier fix only gated the file-open handler (`if (!useInlineWidget)` at main.ts:1429); did not gate any of NoteWriter's four internal retrofitStarterCode call sites.

    Scope: fresh-only on every problem-browser open with useInlineWidget=ON. Re-opens of existing v1.3 notes do NOT re-corrupt because the file-open handler is already gated by Phase 20 Plan 20-09. However, THREE OTHER NoteWriter paths inherit the same defect and would corrupt under their respective triggers:
       - NoteWriter.ts:272 (re-open with cached detail)
       - NoteWriter.ts:343 (cache cleared but file exists — recovered path)
       - NoteWriter.ts:453 (backgroundRefresh after 7-day TTL elapses on re-open)
    The new-note path (line 419) is the one that fires cleanly on every fresh problem-browser open.
  artifacts:
    - path: "src/solve/starterCodeInjector.ts:256-271"
      issue: "PRIMARY ROOT CAUSE: retrofit() calls injectCodeSection without fenceKind — the precise location of the missing plumbing"
    - path: "src/notes/NoteWriter.ts:230-241"
      issue: "retrofitStarterCode wrapper that does not pass fenceKind through — the seam where the missing argument originates"
    - path: "src/notes/NoteWriter.ts:414-419"
      issue: "second emitter call site (post-create belt-and-suspenders retrofit) — the redundant one for v1.3 notes"
    - path: "src/notes/NoteWriter.ts:369-375"
      issue: "first emitter call site (buildNoteBody emits the correct ```leetcode-solve fence)"
    - path: "src/solve/starterCodeInjector.ts:93-146"
      issue: "injectCodeSection legacy path runs because fenceKind is missing; lines 141-146 prepend the duplicate langSlug fence"
    - path: "src/notes/NoteWriter.ts:272, 343, 453"
      issue: "THREE LATENT CALL SITES with the same defect — must be fixed in the same plan to prevent corruption under cache-clear / re-open / background-refresh triggers"
    - path: "src/main.ts:1421-1428"
      issue: "pre-existing comment block already documents the same corruption pattern from Phase 20 Plan 20-09 — fix scope was incomplete"
  missing:
    - "PRIMARY FIX (option a — minimal): extend retrofit's settings parameter to include the optional getUseInlineWidget?(): boolean getter and pass fenceKind: settings.getUseInlineWidget?.() ? 'leetcode-solve' : 'legacy' into the injectCodeSection call at starterCodeInjector.ts:266. NoteWriter.this.settings already exposes getUseInlineWidget?(), so no caller-side change."
    - "PRIMARY FIX (option b): add explicit fenceKind?: 'leetcode-solve' | 'legacy' parameter to retrofit() and have NoteWriter pass it from this.settings.getUseInlineWidget?.()."
    - "DEFENSE-IN-DEPTH: in NoteWriter.openProblem, drop the line 419 belt-and-suspenders call when useInlineWidget=ON (mirroring the main.ts:1429 file-open gate). Also gate the analogous calls at lines 272, 343, 453."
    - "Test coverage gap: Phase 21-03 unit tests verified injectCodeSection directly with explicit fenceKind, but no integration test exercises retrofit (or end-to-end openProblem path) with useInlineWidget=ON and asserts a single-fence output. Add such a test alongside the fix."
  debug_session: ".planning/debug/duplicate-fence-on-new-problem-from-browser.md"
  triage
  severity: major
  test: "post-UAT (no test number — emerged during diagnose phase)"
  reproduction: |
    User reported 2026-06-01 with screenshot:
    1. Open the problem browser, click 'Open' on a fresh problem (one not already in the vault).
    2. The new note opens automatically.
    3. The ## Code section renders TWO code blocks stacked vertically:
       - Top: plain Obsidian Java code block (corner label 'Java', NO widget chrome — no vim mode, no chevron, no action row)
       - Bottom: the actual LC widget (vim --NORMAL--, language chevron, action row with AI solution / Run / Submit)
    Both blocks contain the same starter code.
  symptom_breakdown:
    - "Two code-block DOM elements rendered for ONE fence in the source markdown"
    - "Top block is the standard Prism/markdown renderer's output for a langSlug-tagged fence"
    - "Bottom block is the LC widget mount (registerMarkdownCodeBlockProcessor for 'leetcode-solve')"
    - "Implies BOTH renderers ran for the same fence range OR both ran for DIFFERENT fence ranges that haven't been deduplicated in the source"
  hypothesis_refined: |
    USER CONFIRMED 2026-06-01: this is NOT a render issue. The note's source on disk actually contains TWO fence blocks. Hypothesis (A) is the correct path; (B) is eliminated.

    (A — CONFIRMED) **Source has two fences.** The 'open from browser' code path writes the new note with TWO fences in ## Code:
       - First block: langSlug-tagged (```java in screenshot — Prism-rendered as a plain code block, no widget chrome)
       - Second block: ```leetcode-solve (mounts the LC widget normally)

    Both fences contain the SAME starter code (visible in screenshot — both show `class Solution { public int countRangeSum(int[] nums, int lower, int upper) { ... }`).

    Likely root cause: the new-note emit path runs TWO independent code-emitting steps that both target ## Code without coordinating. Possibilities:
       1. A recent refactor introduced the leetcode-solve emit path but the original langSlug emitter was not removed. Both run on every new-note creation.
       2. The starter-code injector runs once on the raw markdown (writing ```java) and then a second step rewrites only the FIRST occurrence to ```leetcode-solve, leaving the second ```java untouched (or vice versa — runs twice and only one rewrites).
       3. The Phase 21 migrator's frontmatter-injection step (Step 5) emits a fence as a side effect of a logic bug, in addition to the legitimate emitter.

    INVESTIGATION FOCUS: enumerate all call sites that write into ## Code on new-note creation. The duplicate fence emission is a writer bug — the renderer is doing its job (rendering whatever's in source).
  artifacts_to_inspect:
    - "src/browse/* (problem browser flow — find the 'open' click handler)"
    - "src/notes/* (new-note creation paths — search for any code that writes to ## Code section)"
    - "src/solve/starterCodeInjector.ts (mentioned in CLAUDE.md — known fence-aware injector)"
    - "src/main.ts:1060-1063 (registerMarkdownCodeBlockProcessor for 'leetcode-solve')"
    - "src/widget/codeBlockProcessor.ts (Reading-mode handler — verify it replaces vs. appends)"
    - "Recent commit history for src/browse/ + src/notes/ + src/solve/ — git log -p in those areas for any 'starter code' / 'leetcode-solve' / 'fence' commits in the last 4 weeks"
  triage_decision: "If hypothesis A (source has 2 fences): the bug is in the new-note emit path — Plan 21-13 fixes the emitter to write exactly one ```leetcode-solve fence. If hypothesis B (one fence, double render): Plan 21-13 fixes the rendering pipeline (likely a stale post-processor not unregistering, or a missing replace-in-place call). The disambiguation step is cheap (cat the new note from disk), do it before planning."
  next_step: "After the planner returns the revised 21-09/10/11, dispatch a debug agent that FIRST disambiguates A vs B (cat the new note's bytes), then diagnoses the specific path. Plan 21-13 follows."

## Gaps

- truth: "After auto-migration in Reading mode (autoMigrateOnOpen=ON), the v1.3 widget mounts on the same open."
  status: resolved_pending_uat
  reason: "User reported: First-open: migration runs and the fence is rewritten, but the widget does not mount. Closing and reopening the note shows the widget correctly."
  severity: minor
  test: 1
  root_cause: |
    Reading mode has no equivalent of CM6's reactive ViewPlugin update. After migrateLegacyFenceIfNeeded rewrites the fence opener via vault.process, no mechanism asks Obsidian to re-run its markdown post-processors on the rewritten code block.

    The plugin's only widget-aware reaction to file changes — vault.on('modify') at src/main.ts:1226-1341 — short-circuits at line 1249 (`if (!matchingWidget) return;`) when no widget is registered for the path. For a legacy v1.2 fence in Reading mode this is ALWAYS true, because the Reading-mode post-processor at src/main.ts:1060-1063 binds tag 'leetcode-solve' only — legacy ```python / ```java fences never produce a widget at first render. The migration handler at src/main/readingModeMigrationHook.ts:100-120 is intentionally fire-and-forget and does not call any rerender API. Live Preview is unaffected because src/widget/liveModeViewPlugin.ts:253-258 update() is reactive to update.docChanged.
  artifacts:
    - path: "src/main/readingModeMigrationHook.ts:100-120"
      issue: "fire-and-forget migrate; no post-completion Reading-mode rerender hand-off"
    - path: "src/main.ts:1548-1566"
      issue: "wires the file-open handler — the place where a .then(...) rerender chain would attach"
    - path: "src/main.ts:1060-1063"
      issue: "post-processor binding excludes legacy tags (intentional per L1, but is the structural reason no widget exists when modify fires)"
    - path: "src/main.ts:1226-1249"
      issue: "vault.on('modify') handler short-circuits when no widget is registered, dropping the only event that could have driven a rerender"
  missing:
    - "After migrate(...) resolves with `migrated === true` in makeReadingModeMigrationHandler's .then(), force the active Reading-mode pane for file.path to re-run post-processors via app.workspace.getLeavesOfType('markdown') → filter by view.file.path === file.path AND view.getMode() === 'preview' → call view.previewMode.rerender(true)"
    - "Gate on migrated === true to avoid spurious rerenders on candidates that were already migrated"
    - "Integration test: open v1.2 fixture in Reading mode (live or mocked workspace), assert v1.3 widget DOM mounts after the migration promise resolves on the SAME open (no second open required)"
  debug_session: ".planning/debug/reading-mode-migration-mount-race.md"

- truth: "When a note has the v1.3 ```leetcode-solve fence opener but is missing lc-language in frontmatter, lc-language is auto-injected using the user's default-language setting before the widget mounts (no Python+Notice fallback)."
  status: resolved_pending_uat
  reason: "User reported (clarified 2026-06-01): the failing repro is NOT a v1.2-shaped legacy fence — it is a note that ALREADY has ```leetcode-solve as its fence opener (i.e. body is already v1.3-shaped) but lc-language is MISSING from frontmatter. Notice 'lc-language missing, falling back to Python' fires from the widget mount path; default-language=java in settings is NOT honored (Python is used instead); chevron updates locally but lc-language is NEVER written to frontmatter. Test 3 (interactive shim probe) succeeded on a different shape (lc-slug + langSlug fence with NO leetcode-solve opener) — a different code path, not contradictory."
  severity: major
  test: 2
  root_cause: |
    The user's actual repro shape — `lc-slug` present + `## Code` fence is already `\`\`\`leetcode-solve` + `lc-language` missing — does NOT match isMigrationCandidate. Per src/widget/fenceMigrator.ts:220-226 clause 5 (idempotency early-out), if countLeetCodeSolveFenceOpenersInCodeSection(noteText) > 0 the predicate returns false and migrateLegacyFenceIfNeeded skips the note entirely. So the migrator's frontmatter-injection step (Step 5) NEVER RUNS for this shape — there is nothing to fix in the migrator.

    The Notice fires from the widget mount path: resolveLanguageSlug at src/widget/WidgetController.ts:780-803 reads metadataCache.getFileCache(file)?.frontmatter['lc-language'] when mountLeetCodeWidget is invoked at WidgetController.ts:999 (called from Live Preview's LeetCodeFenceWidget.toDOM at LeetCodeFenceWidget.ts:151 OR from Reading mode's LeetCodeWidgetRenderChild.onload). When lc-language is missing/non-string, it unconditionally fires `new Notice('LeetCode widget: lc-language frontmatter missing; falling back to Python.', 5000)` and returns 'python'. It never consults `plugin.settings.getDefaultLanguage()` — that's why default=java is ignored. It also never calls processFrontMatter — that's why the chevron updates (in-memory state in the action row) but the frontmatter on disk is unchanged.

    The v1.2 → v1.3 migration handles the FENCE-OPENER rewrite + lc-language injection together when both are missing (clauses 1-5 of isMigrationCandidate satisfied, including no existing leetcode-solve opener). It does NOT handle the asymmetric case where the body has already been migrated (manually, by a partial run, or by the user editing the fence tag) but the frontmatter side never landed. There is no second predicate covering "v1.3-shaped body + missing lc-language" → no auto-fix path exists for it.

    This is a Phase 21 SCOPE GAP, not a race or ordering bug. The original Plan 21-01 isMigrationCandidate was designed for v1.0/v1.1/v1.2 → v1.3 BODY migration; the lc-language frontmatter injection was bundled in as a side effect. Notes that already have the v1.3 body but missing frontmatter slip through.
  artifacts:
    - path: "src/widget/fenceMigrator.ts:220-226"
      issue: "isMigrationCandidate clause 5 (idempotency early-out) returns false when ```leetcode-solve already exists, regardless of lc-language frontmatter state — short-circuits the only auto-injection path"
    - path: "src/widget/WidgetController.ts:780-803"
      issue: "resolveLanguageSlug fires Python+Notice fallback on missing lc-language; never consults plugin.settings.getDefaultLanguage(); never writes back to frontmatter"
    - path: "src/widget/WidgetController.ts:999"
      issue: "mountLeetCodeWidget calls resolveLanguageSlug at mount entry — Notice fires before widget DOM is constructed; no coordination with migrator state"
  missing:
    - "Either: extend isMigrationCandidate (or add a sibling predicate isFrontmatterRepairCandidate) to recognize the asymmetric shape (lc-slug present + ```leetcode-solve fence with closer + lc-language missing) and route it through a frontmatter-only repair path that injects lc-language: <plugin.settings.getDefaultLanguage()> via processFrontMatter"
    - "Or: in resolveLanguageSlug, when lc-language is missing AND the file has lc-slug, fall back to plugin.settings.getDefaultLanguage() AND queue a processFrontMatter write via the canonical write-path pattern (CLAUDE.md Phase 17 D-05) to persist the resolved language to the file. Suppress the Notice for this auto-repaired path; emit a debug log only."
    - "Integration test: open a note shape (lc-slug + lc-language MISSING + ```leetcode-solve fence) → assert lc-language is injected into frontmatter (matching default-language setting) within the same open AND no Python+Notice fires"
    - "Acceptance: re-test against the user's actual repro file (whatever 9-palindrome-number's state was when Notice fired) and confirm Java is honored + frontmatter is updated"
  debug_session: ".planning/debug/lc-language-injection-path-divergence.md"
  diagnosis_correction: "Initial debug agent (adb3925) analyzed the Step-4-vs-Step-5 race assuming the migrator runs. User clarified post-diagnosis that the actual repro has the body already at v1.3 (```leetcode-solve), so isMigrationCandidate short-circuits at clause 5 and the migrator never executes. The Step-4/Step-5 race diagnosis is correct for v1.2 → v1.3 migrations but does NOT explain THIS bug. The real bug is a scope gap: no code path injects lc-language into a v1.3-shaped note with missing frontmatter."

- truth: "v1.2-shaped notes show the banner UX (copy + [Migrate now] button + read-only `<pre><code>` source) when autoMigrateOnOpen=OFF in BOTH Reading mode and Live Preview."
  status: resolved_pending_uat
  reason: "User reported: Reading mode silently renders a plain Obsidian java code block (no banner, no button, no widget); Live Preview emits a CM6 RangeError 'Decorations that replace line breaks may not be specified via plugins' from the banner mount path during migrate-command execution. Migration logic itself is correct (file rewritten on disk to ```leetcode-solve verified post-test) — the banner UX is broken in both modes."
  severity: major
  test: 4
  root_cause: |
    TWO independent root causes (BOTH CONFIRMED by debug agent investigation):

    (A) **Reading mode silent no-op (CONFIRMED).** src/main.ts:1060-1063 registers `registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this))`. Obsidian fires this handler ONLY for fences whose tag IS LITERALLY 'leetcode-solve'. A v1.2 note carrying ```java (or any langSlug) is rendered by Obsidian's default markdown processor and never reaches leetCodeBlockProcessor — so the mountLegacyFenceBanner('manual-prompt') call at src/widget/codeBlockProcessor.ts:198 is structurally unreachable for v1.2-shaped fences in Reading mode. This is explicitly acknowledged as a known shipped limitation in src/main/readingModeMigrationHook.ts:121-133 ('the Reading-mode post-processor binding is leetcode-solve-only — so a Reading-mode user with autoMigrateOnOpen=OFF on a legacy note sees Obsidian's stock language-tagged fence with NO banner. ... Reading-mode banner-on-OFF is acknowledged as a follow-up enhancement'). The file-open hook even runs isMigrationCandidate on a legacy note and only emits a logger.debug line — no DOM change.

    (B) **Live Preview CM6 RangeError (CONFIRMED).** src/widget/liveModeViewPlugin.ts:160-208 (the fence.kind === 'legacy' branch in buildLeetCodeFenceRanges) builds a Decoration.replace at lines 176-182 spanning the FULL multi-line legacy fence: legacyFrom = view.state.doc.line(fence.openerLine).from to legacyTo = view.state.doc.line(fence.closerLine).to — every \\n between opener and closer is inside the replaced range. The decoration is supplied via the ViewPlugin's `decorations: v => v.decorations` field at line 386, NOT a StateField. CM6's contract: line-break-spanning Decoration.replace MUST come from a StateField (transaction-time), not a ViewPlugin (build-time). The error text 'Decorations that replace line breaks may not be specified via plugins' matches this contract violation verbatim.

    The wrapping AutoMigratingBannerWidget (lines 81-109) is structurally innocent — mountLegacyFenceBanner itself is innocent — the defect is purely in the host range shape (multi-line) AND provider type (ViewPlugin instead of StateField).

    Cross-check: LeetCodeFenceWidget mount path at lines 213-232 has the same construct shape (Decoration.replace spanning multi-line fence inside a ViewPlugin) but works in production. Investigation needed during fix design: whether v1.3 fences have a different intermediate state (perhaps folded by a separate mechanism before the ViewPlugin sees it as multi-line), or whether the existing LeetCodeFenceWidget construct is also susceptible and only escapes the error because v1.3 fences never have that exact pre-fold state.
  artifacts:
    - path: "src/main.ts:1060-1064"
      issue: "Only registers 'leetcode-solve'-tagged Reading-mode handler — no path catches v1.2 langSlug-shaped fences (Reading mode root cause)"
    - path: "src/main/readingModeMigrationHook.ts:121-133"
      issue: "file-open hook in autoMigrateOnOpen=OFF branch on a candidate note only emits logger.debug — no banner mount; explicitly documents the gap as a known follow-up"
    - path: "src/widget/codeBlockProcessor.ts:182-207"
      issue: "mountLegacyFenceBanner('manual-prompt') call site — dead code for langSlug-shaped fences in Reading mode"
    - path: "src/widget/liveModeViewPlugin.ts:160-208"
      issue: "legacy-kind branch builds line-break-spanning Decoration.replace (lines 176-182) inside the ViewPlugin's decorations field (line 386) — CM6 contract violation"
    - path: "src/widget/liveModeViewPlugin.ts:81-109"
      issue: "AutoMigratingBannerWidget — widget itself is innocent; the defect is the wrapping Decoration.replace range shape"
    - path: "tests/widget/legacyFenceBanner.test.ts"
      issue: "tests mount via stand-alone host element only — no Live Preview / multi-line Decoration.replace integration coverage (test-coverage gap that would have caught this)"
  missing:
    - "Reading mode: add a registerMarkdownPostProcessor (NOT a code-block processor — code-block processors are tag-bound) that walks the rendered DOM, gates on the parent note's frontmatter (lc-slug + useInlineWidget=ON + autoMigrateOnOpen=OFF + isMigrationCandidate(noteText, fm)), locates the rendered code-block element under ## Code whose language class corresponds to a recognized LC langSlug, and replaces it with mountLegacyFenceBanner(host, source, file, plugin, 'manual-prompt')"
    - "Live Preview: move the AutoMigratingBannerWidget decoration out of the ViewPlugin's decorations field. Either (1) host the legacy-fence decoration in a StateField (transaction-time) registered as a separate Extension from leetCodeFenceViewPlugin; OR (2) use Decoration.replace({widget, block: true}) from a StateField (block decorations replacing whole-line ranges are explicitly allowed when supplied via StateField). Either way, the constraint is provider type (StateField, not ViewPlugin) — the AutoMigratingBannerWidget class itself can be reused unchanged"
    - "Investigate whether LeetCodeFenceWidget construct at liveModeViewPlugin.ts:213-232 has the same defect latent (same Decoration.replace + multi-line + ViewPlugin shape) — if so, the StateField migration applies to BOTH widget paths"
    - "Integration test: build a multi-line legacy fence in a real EditorView, assert the decoration mounts without throwing"
    - "Integration test: open v1.2-shaped note in Reading mode (autoMigrateOnOpen=OFF), assert banner DOM appears in place of the langSlug code block"
  debug_session: ".planning/debug/banner-mount-path-broken-both-modes.md"

- truth: "After frontmatter auto-repair injects lc-language on a v1.3-shaped note, the widget mounts properly on the same open (syntax highlighting, editable, action row visible) — no reload required."
  status: failed
  reason: "User reported (R2 re-test, 2026-06-01): Frontmatter repair worked (lc-language: java was added on first open), but the widget did NOT mount properly on the same open: no syntax highlighting, not editable, no action row. After a reload (close+reopen, or plugin reload), the widget mounts correctly."
  severity: major
  test: R2
  artifacts:
    - path: "src/main/readingModeMigrationHook.ts"
      issue: "Plan 21-09 wired repair() into the same Promise chain that Plan 21-08 added rerenderPreviewLeaves to — but rerender only fires after migrate() resolves with migrated=true, NOT after repair() resolves with repaired=true. After processFrontMatter writes lc-language, no Reading-mode rerender is queued, so the widget that mounted from stale frontmatter (no lc-language) stays in its uninitialized state."
    - path: "src/widget/liveModeBannerStateField.ts"
      issue: "Live-Preview repair path is fire-and-forget guarded by repairInFlight Set in main.ts; on completion, no CM6 update is dispatched to remount the widget against the now-fresh metadataCache."
    - path: "src/widget/codeBlockProcessor.ts"
      issue: "Reading-mode post-processor calls repairFrontmatterIfNeeded after migrate=false but does not chain a rerenderPreviewLeaves on the post-repair branch."
  missing:
    - "PRIMARY FIX: Extend the rerenderPreviewLeaves call site so it also fires when repair() resolves with repaired=true. This is the SAME mechanism Plan 21-08 added for migrate(); the wiring was just not extended to the repair path."
    - "Defense-in-depth: in liveModeBannerStateField, after the fire-and-forget repair completes (release repairInFlight), dispatch an empty/no-op view.update to force the widget mount path to re-resolve language from the now-fresh frontmatter."
    - "Integration test: open a v1.3-shaped note with lc-language MISSING in Reading mode → assert (a) frontmatter is repaired AND (b) widget mounts correctly on the SAME open, NOT requiring a reload."

- truth: "In Live Preview, the legacy migration banner renders as a visually distinct UI block — the banner copy + [Migrate now] CTA are clearly separated from the read-only fence body preview, parallel to the Reading-mode banner shape."
  status: failed
  reason: "User reported (R4 re-test, 2026-06-01, screenshot attached): CM6 RangeError is gone (the actual fix landed), but the banner copy + button + fence body all render inside a single rounded code-block-tinted box. No visual separator between banner UI and fence content. Reading mode (R3) banner is correctly styled — this is Live-Preview-only."
  severity: minor
  test: R4
  artifacts:
    - path: "src/widget/liveModeBannerStateField.ts"
      issue: "AutoMigratingBannerWidget.toDOM (or whichever host-build helper the legacyBannerStateField calls) — produces a host element that, once wrapped by CM6's block-decoration container, inherits surrounding code-block visual styling. Banner UI does not have a top-level CSS scope that isolates it from CM6's fence-block style."
    - path: "src/widget/legacyFenceBanner.ts (host builder, if shared)"
      issue: "If Reading-mode and Live-Preview banners share this builder, the styling difference is in the WRAPPER CSS — verify whether styles.css has a `.lc-legacy-fence-banner` rule scoped only to Reading mode markdown post-processor parents."
    - path: "styles.css (or equivalent)"
      issue: "Banner CSS rules likely target Reading-mode DOM shape; Live-Preview wrapper inherits CM6 cm-line/cm-content code-block styling."
  missing:
    - "Add a top-level CSS scope class to the AutoMigratingBannerWidget host (e.g. `lc-legacy-banner--livepreview` plus the existing `lc-legacy-fence-banner`) so styles can target the LP shape distinctly without overriding Reading-mode behavior."
    - "Cross-check styles.css for the banner rules — ensure visual separation between header (copy + CTA) and body (read-only pre/code) is enforced via explicit margins/borders, not relying on inherited code-block container styles."
    - "Visual regression test: render the LP banner in a synthetic EditorView and assert the host has both `.lc-legacy-banner--livepreview` and a child element with the read-only pre/code class."

- truth: "When a fresh problem is opened from the problem browser with useInlineWidget=ON, the resulting note's widget mounts in a working state on the first render — syntax highlighting present, action row visible, editor responsive."
  status: failed
  reason: "User reported (R6 re-test, 2026-06-01): Note content on disk is correct (single ```leetcode-solve fence — Plan 21-13 fix landed), but the widget rendering is broken on the first open: no syntax highlighting, no action row, not editable. Closing+reopening shows the widget correctly. Same broken-mount shape as R2."
  severity: major
  test: R6
  artifacts:
    - path: "src/notes/NoteWriter.ts (openProblem flow + retrofit call sites at lines 272, 343, 419, 453)"
      issue: "openProblem opens the leaf BEFORE the retrofit gate decides whether to no-op; the editor mounts the widget against a buffer that may still be settling. Even though Plan 21-13's wrapper gate makes retrofit a clean no-op when useInlineWidget=ON, the leaf-open ordering is the race source."
    - path: "src/main.ts (vault.on('modify') handler + Reading-mode post-processor wiring)"
      issue: "Same short-circuit family as R1's resolved bug — the modify handler returns when no widget is registered for the path; on a brand-new note the widget IS being registered for the first time, but its mount happens against a transient state."
    - path: "src/widget/codeBlockProcessor.ts AND src/widget/liveModeBannerStateField.ts"
      issue: "First-mount path needs the SAME post-write rerender hand-off that 21-08 added for migrate() and that R2 needs for repair() — applied to the new-note creation path."
  missing:
    - "PRIMARY FIX: After NoteWriter.openProblem fully writes the new note's body, before/after openLinkText, queue a rerenderPreviewLeaves on the file path so the widget remounts against the finalized buffer. Symmetric to Plan 21-08's fix for the migrate path."
    - "Defense-in-depth: drop the line-419 belt-and-suspenders retrofit when useInlineWidget=ON (the wrapper gate already no-ops it; eliminating the call site makes the mount sequence deterministic)."
    - "Live-Preview equivalent: dispatch a no-op view.update after the openLinkText settles so CM6 re-resolves the StateField against the now-fresh buffer."
    - "Integration test: openProblem → assert widget mounts in working state on first render (syntax highlight, editable, action row) without requiring a second open."

- truth: "When the same LC note is open in two Obsidian split panes, editing in one pane does NOT cause the cursor in the other pane's widget to jump to the beginning. Each pane's widget preserves its own cursor position across edits originating in the sibling pane."
  status: failed
  reason: "User reported (post-R7, 2026-06-01): In split-pane mode (two panes both showing the same LC note), editing in one pane causes the cursor in the OTHER pane's widget to jump to the beginning of the widget. Cursor preservation is broken across split-pane sync."
  severity: minor
  test: R9
  artifacts:
    - path: "src/widget/multiPaneCoordinator.ts"
      issue: "When pane A's widget commits an edit via vault.process, the file modify event reaches pane B's controller. The remount/refresh path in the peer pane discards the existing CM6 EditorState (or full-doc-replace transaction) instead of patching only the changed range — cursor selection is reset to position 0 on the new state."
    - path: "src/widget/WidgetController.ts"
      issue: "Mount/remount on file-modify likely calls EditorState.create() with the new doc text instead of dispatching an incremental Transaction with mapped selection. Selection mapping (Transaction.userEvent + mapping cursor through changes) needs to be preserved for sibling panes."
    - path: "src/main.ts (vault.on('modify') handler at ~lines 1226-1341)"
      issue: "The modify handler short-circuits when no widget is registered, but when widgets ARE registered for the path on multiple panes, both panes receive the modify event and remount — only the originating pane's cursor is preserved (it never went through remount); the OTHER pane's cursor is lost."
  missing:
    - "PRIMARY FIX: in the per-leaf modify handler, when the originating pane is NOT this controller's pane, dispatch an incremental EditorView transaction (with computed ChangeSpec from old vs new doc text) to the peer pane's CM6 view INSTEAD of EditorState.create(). The transaction's selection should be the peer's current selection MAPPED through the change set — not reset."
    - "Defense-in-depth: add an annotation `'leetcode.peer-sync'` on the transaction so the section-lock filter passes it through (per CLAUDE.md 'leetcode.*' userEvent convention)."
    - "Skip self-sync: when the modify event originates from this very controller's commit (track via per-controller writeInFlight or via comparing dispatch userEvent against incoming change source), do not dispatch — the originating pane's selection is already correct."
    - "Integration test: open same file in two panes (synthetic Workspace mocks two leafs); type into pane A; assert pane B's CM6 selection.main.head equals its prior position (mapped if the edit was upstream) — NOT 0."
    - "Regression check: confirm pane B's StateField recompute (legacy banner / v1.3 widget StateFields from 21-11/21-14) still fires correctly when it should — peer-sync transaction must NOT suppress legitimate decoration recomputes."
