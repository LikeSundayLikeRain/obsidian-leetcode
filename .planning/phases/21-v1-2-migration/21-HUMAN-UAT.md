---
status: partial
phase: 21-v1-2-migration
source: [21-VERIFICATION.md]
started: 2026-06-01T21:35:00Z
updated: 2026-06-01T21:35:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Reading-mode auto-migration on a real v1.2 note (CR-01 live confirmation)
expected: "Open a v1.2 fixture note in Reading mode in a dev vault with `autoMigrateOnOpen=ON`. workspace.on('file-open') fires; makeReadingModeMigrationHandler calls migrateLegacyFenceIfNeeded; within ~50ms the legacy fence opener is rewritten to ` ```leetcode-solve `, the v1.3 widget mounts, no banner appears."
result: [pending]
why_human: "Confirms the newly wired Reading-mode hook (Plan 21-05) fires in a real Obsidian instance — unit tests mock the dependencies; live vault proves the EventRef path and actual Reading-mode render cycle. **Highest-priority item before Phase 22 merges.**"

### 2. MIGRATE-07 single-frame ordering empirical (Plan 21-02 Task 4 Test 2)
expected: "Open a v1.2 fixture note WITH `lc-language` MISSING in dev vault (auto path). Fence opener rewritten + lc-language injected + widget mounts on the canonical language. No flash of Python+Notice (single-frame ordering)."
result: [pending]
why_human: "Empirical resolution of RESEARCH Open Question §1. Auto-resume default is `single_frame`; actual behavior is unobserved. If two-frame, Phase 19 C-04 hash-arm fallback must be confirmed wired."

### 3. shim_validation=captured (dev-vault probe Test 7)
expected: "tests/fixtures/migration/.obsidian-shim-validation.txt records DIFF: empty."
result: [pending]
why_human: "Currently records shim_validation: skipped, DIFF: deferred. Live-Obsidian byte-equal validation is the only authoritative ground truth for MIGRATE-10 release-gate confidence."

### 4. Banner UX visual check (Reading + Live Preview with autoMigrateOnOpen=OFF)
expected: "Banner with copy 'This note uses the v1.2 format.' + [Migrate now] button + read-only `<pre><code>` of the fence body. Click [Migrate now] runs migration and remounts to v1.3 widget."
result: [pending]
why_human: "DOM positioning + cohesive styling is mode-specific; cannot be unit-tested."

### 5. Cross-OS backup folder path on Windows VM (if available)
expected: "`.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md` materializes correctly with no `:` in folder name."
result: [pending]
why_human: "Only macOS dev vault is in active use; Windows path-separator and reserved-character behavior is empirical."

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
