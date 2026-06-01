---
status: diagnosed
phase: 21-v1-2-migration
source: [21-VERIFICATION.md]
started: 2026-06-01T21:35:00Z
updated: 2026-06-01T22:50:00Z
---

## Current Test

[testing complete]

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

## Gaps

- truth: "After auto-migration in Reading mode (autoMigrateOnOpen=ON), the v1.3 widget mounts on the same open."
  status: diagnosed
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
  status: diagnosed
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
  status: diagnosed
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
