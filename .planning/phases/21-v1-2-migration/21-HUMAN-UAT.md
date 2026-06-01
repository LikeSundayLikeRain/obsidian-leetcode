---
status: partial
phase: 21-v1-2-migration
source: [21-VERIFICATION.md]
started: 2026-06-01T21:35:00Z
updated: 2026-06-01T20:30:00Z
gap_closure_plans: [21-08, 21-09, 21-10, 21-11, 21-12, 21-13]
gap_closure_status: code_shipped_pending_live_uat
---

## Current Test

[awaiting human re-testing of 8 live-Obsidian items after gap-closure plans 21-08..21-13 shipped]

## Re-Test Tests (post gap-closure)

Code for all 6 originally diagnosed UAT gaps has shipped via plans 21-08..21-13. The following 8 live-Obsidian items must be re-tested to confirm the fixes work in a real Obsidian instance:

### R1. Widget mounts on same open after auto-migration (21-08 / MIGRATE-CR-01)
expected: "Open a v1.2 fixture note in Reading mode in a dev vault with autoMigrateOnOpen=ON. Within ~50ms the legacy fence is rewritten to ```leetcode-solve AND the v1.3 widget mounts ON THE SAME OPEN. Closing+reopening NOT required."
result: [pending]

### R2. Frontmatter auto-repair with defaultLanguage=Java (21-09 / MIGRATE-FM-REPAIR-01)
expected: "Open a note with lc-slug + ```leetcode-solve fence + lc-language MISSING in frontmatter. With defaultLanguage=Java in settings, frontmatter is auto-repaired to lc-language: java BEFORE the widget mounts. NO Notice 'lc-language frontmatter missing; falling back to Python' fires. Widget mounts using Java."
result: [pending]

### R3. Reading-mode banner on v1.2 note (21-10 / MIGRATE-BANNER-RM-01)
expected: "Open a v1.2-shaped note in Reading mode with useInlineWidget=ON AND autoMigrateOnOpen=OFF. The langSlug code block is replaced with the legacy migration banner (copy + [Migrate now] CTA + read-only `<pre><code>` of fence body). Clicking [Migrate now] runs migration and the v1.3 widget mounts on next render."
result: [pending]

### R4. Live-Preview banner without CM6 RangeError (21-11 / MIGRATE-BANNER-LP-01)
expected: "Open a v1.2-shaped note in Live Preview with useInlineWidget=ON AND autoMigrateOnOpen=OFF. The migration banner mounts WITHOUT throwing the CM6 RangeError 'Decorations that replace line breaks may not be specified via plugins'. Console clean. With autoMigrateOnOpen=ON, AutoMigratingBannerWidget mounts cleanly and unmounts on the post-migration update cycle."
result: [pending]

### R5. Take-Over CTA across all remount triggers (21-12 / TAKEOVER-CTA-01)
expected: "On every remount of an LC note (close tab→reopen, switch notes→switch back, close all→reopen) the widget mounts in a working state. The 'Click to take over' overlay either does not appear (single-pane focused) OR — if it appears during a transient mid-attach window — clicking it deterministically promotes the pane and the overlay is removed. Existing two-real-pane peer flow preserved."
result: [pending]

### R6. No duplicate fence from problem browser (21-13 / NEWNOTE-FENCE-DEDUP-01)
expected: "With useInlineWidget=ON, opening a fresh problem from the problem browser produces a note whose ## Code section contains EXACTLY ONE ```leetcode-solve fence — ZERO langSlug-tagged sibling fences. Note renders with single LC widget mount."
result: [pending]

### R7. Two-pane peer flow regression check (21-12)
expected: "When two REAL Obsidian panes both display the same LC note, focusing one pane sets the other to 'peer' state and shows the take-over overlay. The fix to the null-leaf branch (case b) MUST NOT break case (c) two-attached-leaves behavior."
result: [pending]

### R8. shim-validation byte-layout (inherited deferred from 21-02)
expected: "tests/fixtures/migration/.obsidian-shim-validation.txt records DIFF: empty for live-Obsidian byte-equal validation. Already captured in original UAT Test 3 (result: pass) — included here for completeness."
result: [pending]
captured: |
  Live dev-vault probe executed interactively 2026-06-01T19:06:45Z (see Test 3 below).
  Pre-migration bytes: 77; post-migration bytes: 103; shim output bytes: 103.
  diff /tmp/obsidian-actual.txt /tmp/shim-output.txt → empty (byte-equal).
  Plan 21-04 Task 3 BLOCKER 4 acceptance criterion satisfied.

## Re-Test Summary

total: 8
passed: 0
issues: 0
pending: 8
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
