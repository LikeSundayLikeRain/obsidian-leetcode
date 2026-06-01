---
status: complete
phase: 21-v1-2-migration
source: [21-VERIFICATION.md]
started: 2026-06-01T21:35:00Z
updated: 2026-06-01T22:30:00Z
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
  status: failed
  reason: "User reported: First-open: migration runs and the fence is rewritten, but the widget does not mount. Closing and reopening the note shows the widget correctly."
  severity: minor
  test: 1
  artifacts: []
  missing: []

- truth: "When lc-language is missing during auto-migration, lc-language is injected into frontmatter using the user's default language (single-frame ordering, no Python+Notice flash)."
  status: failed
  reason: "User reported: Notice 'lc-language missing, falling back to Python' fires (single-frame ordering NOT observed). (1) Default language is Java in settings but Python was used — user default not honored. (2) Chevron reflects the language but lc-language is NOT written to frontmatter."
  severity: major
  test: 2
  artifacts: []
  missing: []
  followup: "Test 7 (interactive shim probe) on a different fixture (test-shim-capture.md) DID inject lc-language: java correctly with no Python+Notice flash, contradicting Test 2. Re-test Test 2 on a clean v1.2 fixture to determine whether the bug is path-dependent (Reading vs Live Preview vs editor mode) or flaky."

- truth: "v1.2-shaped notes show the banner UX (copy + [Migrate now] button + read-only `<pre><code>` source) when autoMigrateOnOpen=OFF in BOTH Reading mode and Live Preview."
  status: failed
  reason: "User reported: Reading mode silently renders a plain Obsidian java code block (no banner, no button, no widget); Live Preview emits a CM6 RangeError 'Decorations that replace line breaks may not be specified via plugins' from the banner mount path during migrate-command execution. Migration logic itself is correct (file rewritten on disk to ```leetcode-solve verified post-test) — the banner UX is broken in both modes."
  severity: major
  test: 4
  artifacts:
    - "src/main.ts:1060 (registerMarkdownCodeBlockProcessor for 'leetcode-solve' only)"
    - "src/widget/codeBlockProcessor.ts:198 (mountLegacyFenceBanner — unreachable for langSlug-shaped fences)"
    - "src/widget/liveModeViewPlugin.ts:93 (mountLegacyFenceBanner — Decoration.replace spans line breaks inside ViewPlugin)"
  missing:
    - "Reading-mode markdown post-processor that catches v1.2-shaped (langSlug) fences and replaces their DOM with the banner"
    - "Live Preview banner decoration moved into a StateField (or refactored to per-line Decoration.line + widget) so it does not violate CM6 ViewPlugin line-break constraint"
    - "Unit test exercising banner mount on a langSlug-shaped multi-line fence (current tests only cover ```leetcode-solve fences and single-line synthetic decorations)"
