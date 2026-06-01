---
phase: 21-v1-2-migration
verified: 2026-06-01T20:18:00Z
status: gaps_found
score: 7/10 must-haves verified (3 partial/failed; 1 deferred to dev-vault)
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "MIGRATE-01 — Reading-mode auto-migration trigger fires on first open of a v1.2 note"
    status: failed
    reason: |
      Reading-mode migration is structurally unreachable for legacy v1.2 notes.
      Phase 21 wires `migrateLegacyFenceIfNeeded` and `mountLegacyFenceBanner`
      INSIDE `leetCodeBlockProcessor` (codeBlockProcessor.ts:142-194), but
      `Plugin.registerMarkdownCodeBlockProcessor` at src/main.ts:1041 binds that
      handler to the tag `'leetcode-solve'` only. Legacy v1.2 notes carry
      ` ```python `, ` ```java `, ` ```cpp `, ` ```typescript ` etc. — these
      fence tags do NOT match the registered processor tag, so the handler is
      NEVER invoked on a legacy v1.2 note in Reading mode. The migration
      trigger code is dead in Reading mode.

      Evidence:
        - `grep -rn "registerMarkdownCodeBlockProcessor" src/` returns ONE
          binding (src/main.ts:1041, tag = 'leetcode-solve').
        - `grep -nE "workspace\\.on\\('file-open'.*migrate|migrateLegacyFenceIfNeeded" src/main.ts`
          shows only the command-palette dispatch at line 731; the three
          `workspace.on('file-open', ...)` handlers (lines 1366, 1412, 1479)
          handle blank-file repair / auto-insert / broken-fence repair — none
          call `migrateLegacyFenceIfNeeded`.
        - The Reading-mode migration code in codeBlockProcessor.ts is gated
          behind `hasLcSlug && useInlineWidget && autoMigrateOnOpen` AND only
          runs inside the `leetcode-solve` post-processor — but a legacy note
          has no `leetcode-solve` fence, so the post-processor never fires
          for it.

      Live Preview path is fine: `liveModeViewPlugin.ts:158` correctly branches
      on `fence.kind === 'legacy'` from `findCodeFence`, so Live Preview users
      DO get migration. Reading-mode users (the user-clarified default
      experience for many setups) get nothing — Obsidian's stock
      ` ```python ` syntax-highlighted block renders with no migration prompt
      and no banner.

      This is the BLOCKER cited in 21-REVIEW.md CR-01 (depth: standard;
      ranked critical). The phase goal explicitly states "every v1.2 note
      migrates lazily on first open" — this is FALSE in Reading mode.
    artifacts:
      - path: "src/main.ts"
        issue: "registerMarkdownCodeBlockProcessor binds only to 'leetcode-solve' (line 1041); no parallel registration for legacy LC langSlug fence tags AND no workspace.on('file-open') hook calls migrateLegacyFenceIfNeeded for legacy notes."
      - path: "src/widget/codeBlockProcessor.ts"
        issue: "Migration gate at lines 142-194 is dead code in Reading mode for legacy notes — the post-processor it lives in only fires for `leetcode-solve` fences."
    missing:
      - "Either: (a) register additional MarkdownCodeBlockProcessors for the recognized LC langSlug fence tags (`python`, `java`, `cpp`, `golang`, etc.) gated on `lc-slug` frontmatter; OR (b) add a `workspace.on('file-open')` handler in Plugin.onload() that calls `migrateLegacyFenceIfNeeded` for any TFile whose frontmatter has `lc-slug` AND useInlineWidget=ON. Option (b) matches L5 (Lazy-on-first-open only) and is the simplest fix."
      - "Update file header comment in codeBlockProcessor.ts to reflect actual coverage."
      - "Add an integration test demonstrating that opening a legacy v1.2 note in Reading mode triggers migration."

  - truth: "MIGRATE-02 — One backup per note ever (D-backup-02 invariant)"
    status: partial
    reason: |
      Backup IS written before rewrite (correct order; T-21-backup mitigated).
      But the orchestrator's pre-existence check is missing. If
      `vault.process` throws between `writeBackup` succeeding and the rewrite
      landing (vault locked, plugin reload mid-write, transient I/O error),
      the next file-open re-runs the orchestrator with:
        - countLeetCodeSolveFenceOpeners > 0 → false (rewrite never landed)
        - isMigrationCandidate → true again
        - writeBackup → writes a SECOND backup folder with a different ISO
          timestamp.

      D-backup-02 explicitly states "one backup per note ever; idempotency
      short-circuits BEFORE the backup writer runs on subsequent re-opens."
      That is only true on the happy path. On the partial-failure retry path,
      the invariant is violated.

      This is 21-REVIEW.md CR-02 (BLOCKER). The 30-day GC eventually cleans
      up extra folders, but the contract violation matters because Phase 22
      cleanup logic may rely on D-backup-02's "one backup per note" invariant.
    artifacts:
      - path: "src/widget/fenceMigrator.ts"
        issue: "migrateLegacyFenceIfNeeded does not check for an existing backup folder before calling writeBackup; partial-failure retry produces a second backup."
    missing:
      - "Add pre-existence check before writeBackup (regex-match `migration-backup-{slug}-*` under `.obsidian/plugins/obsidian-leetcode/`); skip backup when one already exists for the slug."

  - truth: "MIGRATE-05 — 30-day TTL cleanup deletes ONLY backup folders (T-21-gc; never deletes non-backup folders)"
    status: partial
    reason: |
      The strict regex `^migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$`
      uses a greedy `(.+)` for the slug capture. Without restricting the
      character class to LC slug shape (`[a-z0-9-]+`), a future plugin-internal
      folder named `migration-backup-anything-2026-01-01T12-00-00Z` could be
      matched and TTL-deleted via `rmdir(path, true)` (recursive=true).

      Realistic risk is LOW (no other plugin code creates folders with that
      shape under `.obsidian/plugins/obsidian-leetcode/`), but D-backup-03's
      "strict matching prevents non-backup folder deletion" claim is weaker
      than implemented. 21-REVIEW.md CR-03 (BLOCKER) provides the tightened
      regex.
    artifacts:
      - path: "src/widget/migrationBackupGc.ts"
        issue: "BACKUP_FOLDER_RE slug capture `(.+)` is too permissive."
    missing:
      - "Tighten regex to `^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z)$` (LC slug shape constraint)."
      - "Add a unit test fixture that confirms a multi-segment slug (e.g., `foo-bar-baz`) still matches; AND a test that confirms a non-LC-shape folder (e.g., `migration-backup-FOO/BAR-2026-01-01T00-00-00Z`) is rejected."

  - truth: "Banner DOM does not crash post-processor when host.createEl returns a non-Obsidian element"
    status: partial
    reason: |
      `legacyFenceBanner.renderReadOnly` chains `.createEl('code', ...)` on
      the `pre` element returned from `host.createEl('pre')` without checking
      that `pre` itself exposes `createEl`. In Obsidian's runtime this is
      always true; in test environments / popup windows / iframes where
      Obsidian's prototype patch hasn't fired, the chained call throws
      `TypeError: Cannot read properties of undefined`. There is no top-level
      try/catch around `mountLegacyFenceBanner`; the throw propagates out of
      both call sites (codeBlockProcessor.ts:185-191 and the `toDOM` of
      AutoMigratingBannerWidget) and breaks the editor render cycle.

      21-REVIEW.md CR-04 (BLOCKER). The phase goal "no user data is stranded"
      depends on the migration UX being robust; a runtime crash in the
      banner code path leaves the user with a broken pane on a v1.2 note.
    artifacts:
      - path: "src/widget/legacyFenceBanner.ts"
        issue: "renderReadOnly chains createEl on the returned pre without defensive check; mountLegacyFenceBanner has no top-level try/catch."
    missing:
      - "Defensive check on the chained createEl + textContent fallback when pre lacks the helper."
      - "Top-level try/catch around mountLegacyFenceBanner with logger.debug + plain-text fallback (host.textContent = source)."

deferred:
  - truth: "MIGRATE-07 — vault.process + processFrontMatter land in the same render frame (single-frame ordering)"
    addressed_in: "Plan 21-02 Task 4 (dev-vault probe) — explicitly deferred to a future live-Obsidian session."
    evidence: |
      21-02-SUMMARY.md records `probe_result=single_frame` (auto-resume default per
      orchestrator's plan-specific notes for the human-blocked checkpoint) AND
      `shim_validation=skipped`. Plan 21-02 explicitly chose this deferral and
      documented the protocol verbatim in 21-02-DEV-VAULT-PROBE.md. The orchestrator
      is resilient to either outcome (single-frame: existing single-arm
      selfWriteSuppression covers both writes; two-frame: Phase 19 C-04 hash-arm
      fallback already in tree). Plan 21-04 inherits the deferral.

      This is NOT a hidden gap — it is explicitly deferred per phase plan, and the
      verifier categorizes it as `human_needed` → dev-vault smoke item per the
      verifier brief. It does NOT block goal achievement at the in-tree code level.
human_verification:
  - test: "Open a v1.2 fixture note in Reading mode in a dev vault with autoMigrateOnOpen=ON"
    expected: "Within one render frame, the legacy fence opener is rewritten to ` ```leetcode-solve `, the v1.3 widget mounts, no banner appears. (CURRENTLY FAILS due to CR-01 — Reading-mode trigger gap.)"
    why_human: "Confirms CR-01 is a real user-visible regression and not a misread of the binding. If it works in Reading mode despite the registerMarkdownCodeBlockProcessor binding, document the mechanism that triggers it; if it doesn't, this is the BLOCKER."
  - test: "Open a v1.2 fixture note WITH lc-language MISSING in dev vault (auto path)"
    expected: "Fence opener rewritten + lc-language injected + widget mounts on the canonical language. No flash of Python+Notice (single-frame ordering)."
    why_human: "Plan 21-02 Task 4 Test 2 — empirical resolution of RESEARCH Open Question §1. The auto-resume default is `single_frame`, but the actual behavior is unobserved. If two-frame, the Phase 19 C-04 hash-arm fallback must be wired."
  - test: "Capture frontmatter byte layout for shim validation (Test 7 of dev-vault probe)"
    expected: "tests/fixtures/migration/.obsidian-shim-validation.txt records `DIFF: empty`."
    why_human: "Currently records `shim_validation: skipped, DIFF: deferred`. The fixture-runner shim's applyFrontmatterMutation is paired against itself; live-Obsidian byte-equal validation is the only authoritative ground truth for MIGRATE-10 release-gate confidence."
  - test: "Visual check — banner above legacy fence in Reading and Live Preview with autoMigrateOnOpen=OFF"
    expected: "Banner with copy 'This note uses the v1.2 format.' + [Migrate now] button + read-only <pre><code> of the fence body. Click [Migrate now] runs migration and remounts to v1.3 widget."
    why_human: "DOM positioning + cohesive styling is mode-specific; cannot be unit-tested."
  - test: "Cross-OS backup folder path on Windows VM (if available)"
    expected: "`.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md` materializes correctly with no `:` in folder name."
    why_human: "Only macOS dev vault is in active use; Windows path-separator and reserved-character behavior is empirical."
---

# Phase 21: v1.2 Migration Verification Report

**Phase Goal:** Every v1.2 note migrates lazily on first open to the `leetcode-solve` fence tag with a backup sidecar, atomic rewrite, idempotent detection, and CI fixtures spanning v1.0, v1.1, and v1.2 sample notes — so Phase 22 can delete the v1.2 path with confidence that no user data is stranded.

**Verified:** 2026-06-01
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | MIGRATE-01: v1.2 notes migrate lazily on first open in BOTH Reading mode AND Live Preview | ✗ FAILED | Reading-mode trigger structurally unreachable: registerMarkdownCodeBlockProcessor at src/main.ts:1041 binds only to 'leetcode-solve' — legacy fence tags (`python`, `java`, ...) never invoke the handler. No file-open hook covers it. Live Preview is correct (liveModeViewPlugin.ts:158 branches on `fence.kind === 'legacy'`). |
| 2 | MIGRATE-02: Backup written BEFORE rewrite + one backup per note ever | ⚠️ PARTIAL | Order correct (writeBackup → vault.process); but no pre-existence guard. Partial-failure retry produces a SECOND backup folder. D-backup-02 violated on retry path. |
| 3 | MIGRATE-03: Atomic rewrite preserves fence body byte-exact | ✓ VERIFIED | rewriteFenceOpenerTag SSoT delegation (CRLF-tolerant via splitPreservingEols); 110+ property cases; vim-artifacts fixture (test-typescript-vim-artifacts) preserves trailing whitespace round-trip. |
| 4 | MIGRATE-04: Re-opening a migrated note is idempotent (no-op) | ✓ VERIFIED | countLeetCodeSolveFenceOpeners > 0 short-circuit verified by unit tests + property tests. fenceMigrator.test.ts MIGRATE-04 case confirms double-call returns false. |
| 5 | MIGRATE-05: Backups older than 30 days auto-delete on plugin load | ⚠️ PARTIAL | Microtask wired correctly (Promise.resolve().then; fire-and-forget; unconditional). TTL math direction correct (29.96d remains, 31d deletes). BUT regex `(.+)` slug capture too permissive — non-LC-shape folder names could be deleted (T-21-gc weakened). |
| 6 | MIGRATE-06: autoMigrateOnOpen setting + manual-prompt banner UX | ⚠️ PARTIAL | Setting persists, default ON, shape-guard verified. Banner mounts in Live Preview correctly. Banner DOM construction has uncaught createEl chain that can throw in non-Obsidian environments (CR-04). Reading-mode banner path is also unreachable for legacy notes due to CR-01. |
| 7 | MIGRATE-07: Migration + first edit atomic (vault.process + processFrontMatter same render frame) | ⚠️ PARTIAL / DEFERRED | Single-arm selfWriteSuppression assumed; ordering is empirical and the dev-vault probe records `single_frame` as auto-resume default but `shim_validation=skipped`. Resilient orchestrator design either way. Listed under `deferred` (Plan 21-02 Task 4). |
| 8 | MIGRATE-08: New notes emit ` ```leetcode-solve ` directly when useInlineWidget=ON | ✓ VERIFIED | codeBlockForV13 emitter exists (src/notes/NoteTemplate.ts:136); buildNoteBody useInlineWidget gate at NoteTemplate.ts:241-242 selects v13 when ON. Tests cover the gate (noteTemplate-phase3.test.ts v13-emit suite). injectCodeSection short-circuit added to mirror forceInjectCodeSection. |
| 9 | MIGRATE-09: codeExtractor reads lc-language frontmatter when fence is leetcode-solve | ✓ VERIFIED | extractFirstFencedBlock signature widened to `(noteBody, frontmatter?)`; 3-branch dispatch (A: leetcode-solve+lang→frontmatter wins, B: leetcode-solve+missing→null, C: legacy→fenceTag). 6 production consumers threaded; SubmissionDeps lifted with `file?` and `app?` fields. SSoT-bypass audit clean. |
| 10 | MIGRATE-10: CI fixtures (10 pairs across v1.0/v1.1/v1.2) byte-exact migrate | ✓ VERIFIED | All 10 fixture pairs exist; fixture runner at tests/fixtures/migration/index.test.ts; 11 tests pass (1 discovery + 10 fixture pairs). Vim-artifacts + valid-parentheses fixtures pass. CAVEAT: shim-validation deferred (`shim_validation=skipped`); fixtures are paired against the shim itself, not against live Obsidian — internally consistent only. |

**Score:** 5/10 truths fully verified · 4 partial · 1 failed (1 deferred for human verification, but the failures are independent of it).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | MIGRATE-07 single-frame ordering empirical confirmation | Plan 21-02 Task 4 (dev-vault probe) | Documented in 21-02-DEV-VAULT-PROBE.md; auto-resume default `probe_result=single_frame`; orchestrator resilient to either outcome; Phase 19 C-04 hash-arm fallback in tree if needed. |
| 2 | shim_validation=captured (Test 7 frontmatter byte-layout) | Plan 21-02 Task 4 Test 7 | tests/fixtures/migration/.obsidian-shim-validation.txt records `shim_validation: skipped, DIFF: deferred`. Plan 21-04 inherits the deferral; Plan 21-04 SUMMARY notes "MIGRATE-10 is claimed at the in-tree fixture-corpus confidence level; full live-Obsidian confidence is gated on the deferred capture." |

These items are explicitly scheduled for follow-up dev-vault sessions and are NOT part of the gap closure for the in-tree blockers above.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/widget/fenceMigrator.ts` | NEW (~250 LOC); 3 exports | ✓ VERIFIED | 309 LOC; isMigrationCandidate + writeBackup + migrateLegacyFenceIfNeeded all exported; pure module; no Plugin.onload import; no vault.modify; no app.plugins reach. |
| `src/widget/legacyFenceBanner.ts` | NEW (~80 LOC); mountLegacyFenceBanner | ⚠️ HOLLOW | 138 LOC; 3-mode dispatch present; click handler dispatches with `force: true`; NO innerHTML. BUT renderReadOnly chained createEl is uncaught (CR-04); top-level try/catch missing. |
| `src/widget/migrationBackupGc.ts` | NEW (~60 LOC); runMigrationBackupGc | ⚠️ PARTIAL | 143 LOC; strict regex + TTL math + first-install safety + silent-on-failure. Regex slug capture too permissive (CR-03). |
| `src/widget/codeBlockProcessor.ts` | MODIFIED — pre-mount migration gate | ⚠️ ORPHANED IN READING MODE | Migration gate code present (lines 142-194), well-formed in isolation; but the post-processor only fires for `leetcode-solve` fences (CR-01). For legacy fences in Reading mode the migration code path is unreachable. |
| `src/widget/liveModeViewPlugin.ts` | MODIFIED — fire-and-forget on kind === 'legacy' | ✓ VERIFIED | AutoMigratingBannerWidget defined; branches on `fence.kind === 'legacy'` at line 158; fires `void migrateLegacyFenceIfNeeded(...)` at line 187; module-level migrateInFlight Set dedupes concurrent passes. |
| `src/main.ts` | MODIFIED — command palette + microtask GC | ✓ VERIFIED | Line 720: `id: 'migrate-current-note'` command palette entry; line 731: dispatch with `force: true`. Line 420: `Promise.resolve().then(() => runMigrationBackupGc(this.app))` (fire-and-forget; unconditional; no setTimeout). |
| `src/solve/codeExtractor.ts` | MODIFIED — frontmatter-aware extractFirstFencedBlock | ✓ VERIFIED | Signature widened with `frontmatter?: { 'lc-language'?: string }`; 3-branch dispatch (A/B/C); 7 frontmatter-source tests pass. |
| `src/notes/NoteTemplate.ts` | MODIFIED — codeBlockForV13 + useInlineWidget gate | ✓ VERIFIED | codeBlockForV13 exported (line 136); buildNoteBody transition gate at lines 241-242; legacy codeBlockFor preserved (Phase 22 boundary). |
| `tests/fixtures/migration/v1.0/` | 3 input + 3 expected | ✓ VERIFIED | 6 files: two-sum / reverse-string / valid-parentheses (with their .expected.md). |
| `tests/fixtures/migration/v1.1/` | 3 input + 3 expected | ✓ VERIFIED | 6 files: test-techniques / test-ai-review / test-related-variants. |
| `tests/fixtures/migration/v1.2/` | 4 input + 4 expected | ✓ VERIFIED | 8 files: test-python3-remap / test-golang-remap / test-c-remap / test-typescript-vim-artifacts. |
| `tests/fixtures/migration/index.test.ts` | NEW — fixture runner | ✓ VERIFIED | 11 tests pass (1 discovery + 10 fixture-pair byte-exact); applyFrontmatterMutation shim documented; backup-correctness assertion via mock.calls[0][1]. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `Plugin.onload` (registerMarkdownCodeBlockProcessor) | legacy fences in Reading mode | tag-binding | ✗ NOT_WIRED | Only registered for `leetcode-solve`; no parallel registration for legacy LC tags AND no file-open hook calls migrate. CR-01. |
| `liveModeViewPlugin.buildLeetCodeFenceRanges` | `migrateLegacyFenceIfNeeded` | fire-and-forget on `kind === 'legacy'` | ✓ WIRED | Line 187: `void migrateLegacyFenceIfNeeded(...).catch(...).finally(...)`. AutoMigratingBannerWidget mounts before fire (D-trigger-01 invariant). |
| `legacyFenceBanner.click` | `migrateLegacyFenceIfNeeded` | force: true bypass | ✓ WIRED | Line 85: `await migrateLegacyFenceIfNeeded(plugin.app, file, { force: true, autoMigrateOnOpen: true, defaultLanguage: ... })`. |
| `Plugin.onload` (command palette) | `migrateLegacyFenceIfNeeded` | id: migrate-current-note | ✓ WIRED | src/main.ts:720-740; editorCheckCallback gates on useInlineWidget=ON + lc-slug. |
| `Plugin.onload` (microtask) | `runMigrationBackupGc` | Promise.resolve().then | ✓ WIRED | src/main.ts:420; fire-and-forget; unconditional (no useInlineWidget gate). |
| `migrateLegacyFenceIfNeeded` | `app.vault.process(file, fn)` | atomic body-touching write | ✓ WIRED | fenceMigrator.ts:274-276. |
| `migrateLegacyFenceIfNeeded` | `app.fileManager.processFrontMatter` | D-edge-03 fill-when-missing | ✓ WIRED | fenceMigrator.ts:285-295; needsLang inner re-check. |
| `migrateLegacyFenceIfNeeded` | `app.vault.adapter.write` | backup BEFORE rewrite | ✓ WIRED | fenceMigrator.ts:270 (writeBackup → adapter.write); ordering verified by spy.invocationCallOrder in unit tests. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript strict-mode compiles | `npm run build` (per Plan SUMMARYs) | exit 0 | ✓ PASS |
| Phase 21 unit + property + fixture-runner tests pass | `npx vitest run tests/widget/fenceMigrator.test.ts tests/widget/migrationBackupGc.test.ts tests/fixtures/migration/` | 3 files / 77 tests passed | ✓ PASS |
| Full project test suite | `npx vitest run` (per 21-04 SUMMARY) | 2915 passed / 6 skipped | ✓ PASS |
| Reading-mode legacy-note migration trigger | grep registerMarkdownCodeBlockProcessor → only 'leetcode-solve'; grep workspace.on('file-open' → no migrate dispatch | no Reading-mode trigger for legacy notes | ✗ FAIL (CR-01) |

### Probe Execution

No probe scripts present in this phase (`scripts/*/tests/probe-*.sh` not used; phase relies on vitest). N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MIGRATE-01 | 21-01, 21-02 | Lazy-on-open trigger | ✗ BLOCKED (Reading-mode gap) | CR-01 — registerMarkdownCodeBlockProcessor binding mismatch. |
| MIGRATE-02 | 21-01 | Backup before rewrite | ⚠️ PARTIAL | Order correct; D-backup-02 retry-path violation (CR-02). |
| MIGRATE-03 | 21-01 | Atomic rewrite, fence body byte-exact | ✓ SATISFIED | rewriteFenceOpenerTag + 110+ property tests; vim-artifacts fixture passes. |
| MIGRATE-04 | 21-01 | Idempotent re-open | ✓ SATISFIED | countLeetCodeSolveFenceOpeners short-circuit; double-call test passes. |
| MIGRATE-05 | 21-04 | 30-day TTL cleanup | ⚠️ PARTIAL | Microtask wired; TTL math correct; regex `(.+)` too permissive (CR-03). |
| MIGRATE-06 | 21-02 | autoMigrateOnOpen setting + banner | ⚠️ PARTIAL | Setting + Live Preview banner correct; Reading-mode banner path orphaned by CR-01; banner DOM crash risk (CR-04). |
| MIGRATE-07 | 21-01 | Atomic single write (vault.process + processFrontMatter same frame) | ? NEEDS HUMAN | Auto-resume default `single_frame`; dev-vault probe deferred. Resilient orchestrator either way. |
| MIGRATE-08 | 21-03 | New notes emit `\`\`\`leetcode-solve` | ✓ SATISFIED | codeBlockForV13 + useInlineWidget gate at NoteTemplate:241-242; tests pass. |
| MIGRATE-09 | 21-03 | codeExtractor reads lc-language | ✓ SATISFIED | 3-branch dispatch; 6 consumers threaded; SubmissionDeps lifted; SSoT-bypass audit clean. |
| MIGRATE-10 | 21-04 | CI fixtures byte-exact | ✓ SATISFIED (in-tree) | 10 fixture pairs + runner; 11 tests pass. CAVEAT: shim-validation deferred — confidence is internal-shim consistency only. |

No orphaned requirements found — all 10 MIGRATE-* IDs have plan coverage.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/main.ts` | 1041 | `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` only — no legacy-tag handler AND no file-open trigger for migrate | 🛑 BLOCKER | Reading-mode legacy notes never migrate — CR-01. Phase goal "every v1.2 note migrates lazily on first open" is FALSE in Reading mode. |
| `src/widget/fenceMigrator.ts` | 270 | writeBackup is unconditional after isMigrationCandidate; no pre-existence guard | 🛑 BLOCKER | Partial-failure retry produces second backup folder; violates D-backup-02 — CR-02. |
| `src/widget/migrationBackupGc.ts` | 55-56 | BACKUP_FOLDER_RE slug capture is `(.+)` (greedy, no character class) | 🛑 BLOCKER | Non-LC-shape folder under plugin dir could be matched and TTL-deleted — CR-03. |
| `src/widget/legacyFenceBanner.ts` | 97-109 | renderReadOnly chains `.createEl` on returned `pre` without defensive check; mountLegacyFenceBanner has no top-level try/catch | 🛑 BLOCKER | TypeError in non-Obsidian environments breaks editor render cycle — CR-04. |
| `src/widget/liveModeViewPlugin.ts` | 67 | module-level `migrateInFlight: Set<string>` not cleared on plugin unload | ⚠️ WARNING | Hot-reload may leak entries; abandoned-promise leaves stale entry — WR-01. |
| `src/widget/fenceMigrator.ts` | 110 | countLeetCodeSolveFenceOpeners scans ENTIRE noteText including `## Notes` | ⚠️ WARNING | A user reference to ` ```leetcode-solve ` in `## Notes` aborts migration of the actual `## Code` fence — WR-03. |
| `src/widget/fenceMigrator.ts` | 281-282 | Outer `needsLang` check uses stale `fm` from step 1 | ⚠️ WARNING | Inner re-check is authoritative; outer guard misleading — WR-02. |
| `src/widget/migrationBackupGc.ts` | 98-143 | No throttle/dedup on concurrent runMigrationBackupGc invocations | ⚠️ WARNING | Plugin reload during a long sweep could race; not data-corrupting but noisy — WR-05. |
| `src/solve/starterCodeInjector.ts` | 91-100 | injectCodeSection short-circuit replaces fence index 0 without checking it's inside `## Code` | ⚠️ WARNING | Multi-fence corner case; user with a stray `\`\`\`leetcode-solve` reference above `## Code` would have wrong fence overwritten — WR-07. |
| `tests/fixtures/migration/.obsidian-shim-validation.txt` | n/a | placeholder records `shim_validation: skipped, DIFF: deferred` | ⚠️ WARNING | MIGRATE-10 release-gate is internal-shim consistency only; live-Obsidian byte-equal validation deferred. Documented; not a hidden gap. |

No `TBD` / `FIXME` / `XXX` debt markers found in the modified files (audit clean).

### Human Verification Required

5 items (see `human_verification:` block in frontmatter). The most important:

1. **Reading-mode auto-migration on a real v1.2 note (CR-01 confirmation).** Open a v1.2 fixture in Reading mode with `useInlineWidget=ON` + `autoMigrateOnOpen=ON`. Without an additional registration or file-open hook, the legacy fence will NOT migrate (Obsidian falls back to its stock ` ```python ` syntax-highlighted block). This is the BLOCKER.
2. **MIGRATE-07 single-frame ordering empirical (Plan 21-02 Task 4 Test 2).** Auto-resume default is `single_frame`; the actual behavior is unobserved.
3. **shim_validation=captured (Test 7).** Currently records `shim_validation: skipped, DIFF: deferred`.
4. **Banner UX visual check (Reading + Live Preview, autoMigrateOnOpen=OFF).**
5. **Cross-OS backup folder path (Windows VM if available).**

### Gaps Summary

Phase 21 ships strong in the foundation layer (fenceMigrator: byte-exact; idempotent; backup-before-rewrite; thoroughly property-tested), in the codeExtractor refactor (D-extract-01 + D-extract-02 SSoT), and in the new-note emission gate (MIGRATE-08). The CI fixture corpus is hand-written, paired, and byte-exact verified — and the dev-vault deferrals are explicitly documented (not hidden).

But three of the four 21-REVIEW.md BLOCKERs are real, in-tree, and break the phase goal "every v1.2 note migrates lazily on first open":

- **CR-01 (Reading-mode trigger gap)** is architecturally significant: the migration is dead code in Reading mode for legacy v1.2 notes. The `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` binding can never invoke the gate code on a fence that hasn't yet been rewritten to `leetcode-solve`. Fix: add a `workspace.on('file-open', ...)` hook in `Plugin.onload()` that calls `migrateLegacyFenceIfNeeded` for any TFile whose frontmatter has `lc-slug` AND `useInlineWidget=ON` AND `autoMigrateOnOpen=ON`. Alternatively, register parallel processors for the legacy LC langSlug fence tags. The simpler fix is the file-open hook (matches L5 "Lazy-on-first-open only").
- **CR-02 (double-backup on retry)** violates D-backup-02. Fix: pre-existence check before writeBackup.
- **CR-03 (greedy slug regex)** weakens T-21-gc. Fix: tighten character class to `[a-z0-9][a-z0-9-]*[a-z0-9]`.
- **CR-04 (banner DOM crash risk)** affects the user-visible UX in non-Obsidian environments + iframes. Fix: defensive createEl chain + top-level try/catch.

These four BLOCKERs are clustered in the user-facing trigger + safety paths and are independent of one another. The deferred dev-vault items (MIGRATE-07 single-frame + shim_validation) are explicit follow-ups and do NOT block the phase goal at the in-tree level.

**Recommendation:** Status `gaps_found`. Phase 22 should NOT begin deleting the v1.2 path until the 4 BLOCKERs are closed — specifically CR-01 is non-negotiable (the phase goal explicitly states "every v1.2 note migrates lazily" and currently Reading-mode users get nothing).

Phase 21 plan structure should accept a follow-up Plan 21-05 (or `--gaps-only` re-run on Plans 21-01..21-02) to close CR-01..CR-04 before Phase 22 entrance criteria are met.

---

_Verified: 2026-06-01_
_Verifier: Claude (gsd-verifier)_
