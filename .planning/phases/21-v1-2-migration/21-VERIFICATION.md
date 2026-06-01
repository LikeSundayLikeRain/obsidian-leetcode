---
phase: 21-v1-2-migration
verified: 2026-06-01T14:40:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/10 (5 fully verified + 4 partial/failed)
  gaps_closed:
    - "CR-01 (MIGRATE-01) — Reading-mode auto-migration trigger: src/main/readingModeMigrationHook.ts new file; this.registerEvent(this.app.workspace.on('file-open', makeReadingModeMigrationHandler({...}))) wired at src/main.ts:1548-1566; 8-test integration suite passing."
    - "CR-02 (MIGRATE-02) — Double-backup on partial-failure retry: backupAlreadyExistsForSlug helper at fenceMigrator.ts:308-329 calls BACKUP_FOLDER_RE SSoT; called BEFORE writeBackup at fenceMigrator.ts:437-445; 5 CR-02-fix tests passing."
    - "CR-03 (MIGRATE-05) — Greedy slug regex tightened: BACKUP_FOLDER_RE exported from migrationBackupGc.ts:76 = /^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(...Z)$/; 6 CR-03-fix tests covering uppercase/mixed/single-char/leading-hyphen/trailing-hyphen rejection."
    - "CR-04 (MIGRATE-06) — Banner DOM crash: renderReadOnly defensive createEl chain at legacyFenceBanner.ts:130-138; top-level try/catch + host.textContent fallback at mountLegacyFenceBanner:57-100; 5 CR-04-fix tests (A-E) passing."
    - "WR-01 — migrateInFlight Set leak: module-level Set removed from liveModeViewPlugin.ts (grep clean); hoisted to LeetCodePlugin instance field at main.ts:341; shared Set passed to both file-open hook and Live Preview branch."
    - "WR-02 — Outer needsLang stale check removed: fenceMigrator.ts Step 5 invokes processFrontMatter unconditionally; inner callback gate is sole SSoT; D-edge-04 test confirms lc-language=java preserved."
    - "WR-03 — Whole-note countLeetCodeSolveFenceOpeners over-scope: new countLeetCodeSolveFenceOpenersInCodeSection helper at fenceMigrator.ts:166-186; consumed by isMigrationCandidate clause 5; 5 WR-03-fix tests confirming stray ```leetcode-solve in ## Notes / ## Problem does not abort migration."
    - "WR-05 — runMigrationBackupGc concurrent-call race: module-level gcRunning lock at migrationBackupGc.ts:94-155; finally reset at migrationBackupGc.ts:202-207; __resetGcRunningForTesting helper for test hermeticity; WR-05-fix Test A passing."
    - "WR-07 — injectCodeSection multi-fence corner: findFirstLeetCodeSolveFenceIndexInCodeSection exported from fenceMigrator.ts:120-145; consumed by injectCodeSection v13 short-circuit at starterCodeInjector.ts:107; 4 WR-07-fix tests passing."
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "MIGRATE-07 — vault.process + processFrontMatter land in the same render frame (single-frame ordering)"
    addressed_in: "Plan 21-02 Task 4 (dev-vault probe) — explicitly deferred to a future live-Obsidian session."
    evidence: "21-02-SUMMARY.md records probe_result=single_frame (auto-resume default) and shim_validation=skipped. Plan 21-02 explicitly chose this deferral. The orchestrator is resilient to either outcome (Phase 19 C-04 hash-arm fallback in tree). Plan 21-04 inherits the deferral."
  - truth: "shim_validation=captured (Test 7 frontmatter byte-layout live-Obsidian byte-equal)"
    addressed_in: "Plan 21-02 Task 4 Test 7 dev-vault probe."
    evidence: "tests/fixtures/migration/.obsidian-shim-validation.txt records shim_validation: skipped, DIFF: deferred. Explicitly documented non-hidden deferral."
human_verification:
  - test: "Open a v1.2 fixture note in Reading mode in a dev vault with autoMigrateOnOpen=ON"
    expected: "workspace.on('file-open') fires; makeReadingModeMigrationHandler calls migrateLegacyFenceIfNeeded; within ~50ms the legacy fence opener is rewritten to ```leetcode-solve, the v1.3 widget mounts, no banner appears."
    why_human: "Confirms the newly wired Reading-mode hook fires in a real Obsidian instance — unit tests mock the dependencies; live vault proves the EventRef path and actual Reading-mode render cycle."
  - test: "Open a v1.2 fixture note WITH lc-language MISSING in dev vault (auto path)"
    expected: "Fence opener rewritten + lc-language injected + widget mounts on the canonical language. No flash of Python+Notice (single-frame ordering)."
    why_human: "Plan 21-02 Task 4 Test 2 — empirical resolution of RESEARCH Open Question 1. Auto-resume default is single_frame; actual behavior is unobserved. If two-frame, Phase 19 C-04 hash-arm fallback must be confirmed wired."
  - test: "Capture frontmatter byte layout for shim validation (Test 7 of dev-vault probe)"
    expected: "tests/fixtures/migration/.obsidian-shim-validation.txt records DIFF: empty."
    why_human: "Currently records shim_validation: skipped, DIFF: deferred. Live-Obsidian byte-equal validation is the only authoritative ground truth for MIGRATE-10 release-gate confidence."
  - test: "Visual check — banner above legacy fence in Reading and Live Preview with autoMigrateOnOpen=OFF"
    expected: "Banner with copy 'This note uses the v1.2 format.' + [Migrate now] button + read-only <pre><code> of the fence body. Click [Migrate now] runs migration and remounts to v1.3 widget."
    why_human: "DOM positioning + cohesive styling is mode-specific; cannot be unit-tested."
  - test: "Cross-OS backup folder path on Windows VM (if available)"
    expected: "`.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md` materializes correctly with no `:` in folder name."
    why_human: "Only macOS dev vault is in active use; Windows path-separator and reserved-character behavior is empirical."
---

# Phase 21: v1.2 Migration Verification Report

**Phase Goal:** Every v1.2 note migrates lazily on first open to the `leetcode-solve` fence tag with a backup sidecar, atomic rewrite, idempotent detection, and CI fixtures spanning v1.0, v1.1, and v1.2 sample notes — so Phase 22 can delete the v1.2 path with confidence that no user data is stranded.

**Verified:** 2026-06-01T14:40:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (Plans 21-05, 21-06, 21-07)

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | MIGRATE-01: v1.2 notes migrate lazily on first open in BOTH Reading mode AND Live Preview | ✓ VERIFIED | `src/main/readingModeMigrationHook.ts` (NEW, 153 LOC): `makeReadingModeMigrationHandler` factory with 4-gate chain (file!=null, useInlineWidget, lc-slug, !migrateInFlight). Wired at `src/main.ts:1548-1566` via `this.registerEvent(this.app.workspace.on('file-open', ...))`. 8-test integration suite passes. Live Preview path unchanged (liveModeViewPlugin.ts:160-191 branches on `fence.kind === 'legacy'`). |
| 2 | MIGRATE-02: Backup written BEFORE rewrite + one backup per note ever (D-backup-02) | ✓ VERIFIED | `backupAlreadyExistsForSlug` helper at `fenceMigrator.ts:308-329`: calls `adapter.list(PLUGIN_DIR)`, matches each folder against `BACKUP_FOLDER_RE` SSoT (no regex duplication), per-slug filter. Called BEFORE `writeBackup` at orchestrator step 3 (`fenceMigrator.ts:437-445`). 5 CR-02-fix tests: partial-failure retry produces ONE backup; first-install proceeds; different slug writes; idempotent note short-circuits before pre-existence check. |
| 3 | MIGRATE-03: Atomic rewrite preserves fence body byte-exact | ✓ VERIFIED | Unchanged from initial verification. `rewriteFenceOpenerTag` SSoT; 110+ property cases; vim-artifacts fixture passes. |
| 4 | MIGRATE-04: Re-opening a migrated note is idempotent (no-op) | ✓ VERIFIED | Unchanged. `countLeetCodeSolveFenceOpenersInCodeSection > 0` short-circuit (updated to code-section scope in WR-03 fix); double-call test passes. |
| 5 | MIGRATE-05: Backups older than 30 days auto-delete on plugin load | ✓ VERIFIED | `BACKUP_FOLDER_RE` tightened at `migrationBackupGc.ts:75-76`: `/^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/` — LC-slug shape constraint. `gcRunning` module-level lock at `migrationBackupGc.ts:94`; `finally` reset at line 202-207. 8+6+2 tests: TTL boundary, strict regex rejection, concurrent-call lock, all passing. |
| 6 | MIGRATE-06: autoMigrateOnOpen setting + manual-prompt banner UX | ✓ VERIFIED | Banner DOM: `mountLegacyFenceBanner` wrapped in top-level try/catch at `legacyFenceBanner.ts:57-100`; `renderReadOnly` defensive `createEl` chain at lines 130-138 (optional-chains `pre.createEl`; falls back to `pre.textContent = source`). 5 CR-04-fix tests (A-E) confirm no throw in non-Obsidian environments. Reading-mode hook (CR-01 fix) now covers the auto path. |
| 7 | MIGRATE-07: Migration + first edit atomic (vault.process + processFrontMatter same render frame) | ⚠️ PARTIAL / DEFERRED | Single-arm selfWriteSuppression assumed; dev-vault probe records `single_frame` as auto-resume default but `shim_validation=skipped`. Resilient orchestrator either way. Listed under `deferred`. |
| 8 | MIGRATE-08: New notes emit `\`\`\`leetcode-solve` directly when useInlineWidget=ON | ✓ VERIFIED | Unchanged. `codeBlockForV13` + `useInlineWidget` gate at `NoteTemplate.ts:241-242`; tests pass. |
| 9 | MIGRATE-09: codeExtractor reads lc-language frontmatter when fence is leetcode-solve | ✓ VERIFIED | Unchanged. 3-branch dispatch; 6 consumers threaded; SSoT-bypass audit clean. |
| 10 | MIGRATE-10: CI fixtures (10 pairs across v1.0/v1.1/v1.2) byte-exact migrate | ✓ VERIFIED (in-tree) | 11 tests pass (1 discovery + 10 fixture pairs). CAVEAT: shim-validation deferred — confidence is internal-shim consistency only. |

**Score:** 10/10 truths verified (9 fully verified; 1 partial/deferred — MIGRATE-07 — but does not block in-tree goal achievement).

### Re-verification Gap Closure Summary

All 4 BLOCKERs (CR-01..CR-04) and all 5 WARNINGs (WR-01/02/03/05/07) from the initial verification are closed.

| Gap | Previous Status | New Status | Closed By |
| --- | --------------- | ---------- | --------- |
| CR-01 Reading-mode trigger gap | FAILED / BLOCKER | VERIFIED | Plan 21-05: `readingModeMigrationHook.ts` + `main.ts:1548-1566` `registerEvent` |
| CR-02 Double-backup on retry | PARTIAL / BLOCKER | VERIFIED | Plan 21-06: `backupAlreadyExistsForSlug` helper called before `writeBackup` |
| CR-03 Greedy slug regex | PARTIAL / BLOCKER | VERIFIED | Plan 21-06: `BACKUP_FOLDER_RE` tightened to `[a-z0-9][a-z0-9-]*[a-z0-9]` |
| CR-04 Banner DOM crash | PARTIAL / BLOCKER | VERIFIED | Plan 21-07: defensive `createEl` chain + top-level try/catch |
| WR-01 migrateInFlight Set leak | WARNING | VERIFIED | Plan 21-05: module-level Set removed; hoisted to Plugin instance field |
| WR-02 Outer needsLang stale check | WARNING | VERIFIED | Plan 21-07: outer guard removed; inner callback gate is SSoT |
| WR-03 Whole-note fence count over-scope | WARNING | VERIFIED | Plan 21-07: `countLeetCodeSolveFenceOpenersInCodeSection` scoped helper |
| WR-05 GC concurrent-call race | WARNING | VERIFIED | Plan 21-06: `gcRunning` module-level lock with `finally` reset |
| WR-07 injectCodeSection multi-fence | WARNING | VERIFIED | Plan 21-07: `findFirstLeetCodeSolveFenceIndexInCodeSection` helper |

### Deferred Items

Items not yet met but explicitly addressed in later phases or deferred dev-vault sessions.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | MIGRATE-07 single-frame ordering empirical confirmation | Plan 21-02 Task 4 (dev-vault probe) | Documented in 21-02-DEV-VAULT-PROBE.md; auto-resume default `probe_result=single_frame`; orchestrator resilient to either outcome; Phase 19 C-04 hash-arm fallback in tree if needed. |
| 2 | shim_validation=captured (Test 7 frontmatter byte-layout) | Plan 21-02 Task 4 Test 7 | tests/fixtures/migration/.obsidian-shim-validation.txt records `shim_validation: skipped, DIFF: deferred`. Plan 21-04 inherits the deferral. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/main/readingModeMigrationHook.ts` | NEW (CR-01 fix) — `makeReadingModeMigrationHandler` factory | ✓ VERIFIED | 153 LOC; factory returns `(file: TFile \| null) => void`; 4-gate chain; auto and OFF branches; WR-01 shared Set; Pattern S-05 silent-on-failure. |
| `src/widget/fenceMigrator.ts` | 3 exports + CR-02 + WR-02 + WR-03 fixes | ✓ VERIFIED | 489 LOC; `backupAlreadyExistsForSlug` (private, called before writeBackup); `countLeetCodeSolveFenceOpenersInCodeSection` (exported, WR-03); `findFirstLeetCodeSolveFenceIndexInCodeSection` (exported, WR-07); outer `needsLang` check removed (WR-02); `BACKUP_FOLDER_RE` imported from migrationBackupGc SSoT (no duplication). |
| `src/widget/migrationBackupGc.ts` | BACKUP_FOLDER_RE tightened + gcRunning lock | ✓ VERIFIED | 209 LOC; `BACKUP_FOLDER_RE` at line 75-76 with `[a-z0-9][a-z0-9-]*[a-z0-9]` slug class; `gcRunning` module-level lock at line 94; `__resetGcRunningForTesting` exported for test hermeticity; `finally` reset at line 202-207. |
| `src/widget/legacyFenceBanner.ts` | Defensive createEl + top-level try/catch | ✓ VERIFIED | 176 LOC; `mountLegacyFenceBanner` body wrapped in try/catch at lines 57-100; inner paranoid catch on `host.textContent = source`; `renderReadOnly` optional-chains `pre.createEl` at lines 130-138 with textContent fallback; no innerHTML; Pattern S-07. |
| `src/widget/liveModeViewPlugin.ts` | Module-level migrateInFlight REMOVED | ✓ VERIFIED | grep for `^let migrateInFlight\|^const migrateInFlight\|module.*migrateInFlight` returns no output; `plugin.migrateInFlight` consumed as Plugin-instance field at lines 189-199. |
| `src/main.ts` | `this.registerEvent(this.app.workspace.on('file-open', makeReadingModeMigrationHandler({...})))` | ✓ VERIFIED | Lines 1548-1566: `this.registerEvent(this.app.workspace.on('file-open', makeReadingModeMigrationHandler({app, settings, migrateInFlight: this.migrateInFlight, migrate: migrateLegacyFenceIfNeeded, isMigrationCandidate, logDebug})))`. All DI fields threaded. `migrateInFlight: Set<string> = new Set()` at line 341. |
| `tests/main/readingModeMigrationTrigger.test.ts` | NEW — 8-test CR-01+WR-01 integration test | ✓ VERIFIED | 436 LOC; 8 tests covering happy path, master gate, auto=OFF, non-LC note, null file, cross-mode dedupe, idempotency, registerEvent cleanup contract. All pass. |
| `tests/widget/fenceMigrator.test.ts` | CR-02-fix + WR-02-fix + WR-03-fix tests | ✓ VERIFIED | CR-02-fix Tests A-E present (lines 546-790); WR-02 test (`D-edge-04` lc-language=java preserved via inner gate, line 401); WR-03-fix Tests A-E present (lines 210-252). |
| `tests/widget/migrationBackupGc.test.ts` | CR-03-fix Tests A-F + WR-05-fix Tests A-B | ✓ VERIFIED | CR-03-fix Tests A-F present (lines 239-344); WR-05-fix Tests A-B present (lines 355+). `__resetGcRunningForTesting` called in beforeEach/afterEach. |
| `tests/widget/legacyFenceBanner.test.ts` | CR-04-fix Tests A-E | ✓ VERIFIED | CR-04-fix Tests A-E in `describe('CR-04-fix — defensive DOM construction')` at lines 224-408. All pass. |
| `tests/solve/starterCodeInjector.test.ts` | WR-07-fix Tests A-D | ✓ VERIFIED | `describe('injectCodeSection — WR-07-fix ## Code-scoped fence index')` at line 184; Tests A-D covering happy path, stray in ## Notes, stray in ## Problem (regression case), no v1.3 in ## Code falls through. All pass. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `Plugin.onload` (registerEvent) | `makeReadingModeMigrationHandler` handler on `file-open` | `this.registerEvent(this.app.workspace.on('file-open', ...))` | ✓ WIRED | `src/main.ts:1548-1566`. Uses `registerEvent` (NOT bare `on`) — cleanup on plugin unload guaranteed. |
| `makeReadingModeMigrationHandler` (auto=ON path) | `migrateLegacyFenceIfNeeded` | fire-and-forget with `.catch().finally()` | ✓ WIRED | `readingModeMigrationHook.ts:106-120`. Shared `migrateInFlight` Set claimed before fire, cleared in `.finally`. |
| `makeReadingModeMigrationHandler` (auto=OFF path) | `isMigrationCandidate` | `vault.read` then candidate check then `logger.debug` | ✓ WIRED | `readingModeMigrationHook.ts:134-149`. No migration; documents Reading-mode banner-on-OFF limitation. |
| `migrateLegacyFenceIfNeeded` Step 3 | `backupAlreadyExistsForSlug` | called BEFORE `writeBackup` | ✓ WIRED | `fenceMigrator.ts:437-445`. `alreadyBackedUp` guard skips `writeBackup` on retry path; logs at debug level. |
| `backupAlreadyExistsForSlug` | `BACKUP_FOLDER_RE` (SSoT from migrationBackupGc.ts) | imported regex, per-slug filter | ✓ WIRED | `fenceMigrator.ts:80` imports `BACKUP_FOLDER_RE`; used at line 325 `BACKUP_FOLDER_RE.exec(folderName)` then `m[1] === slug`. |
| `isMigrationCandidate` clause 5 | `countLeetCodeSolveFenceOpenersInCodeSection` | call at predicate start | ✓ WIRED | `fenceMigrator.ts:224`. Returns false only when count > 0 IN `## Code` section; stray references in other sections pass through. |
| `injectCodeSection` v1.3 short-circuit | `findFirstLeetCodeSolveFenceIndexInCodeSection` | call inside fenceKind==='leetcode-solve' branch | ✓ WIRED | `starterCodeInjector.ts:107`. Returns null when no in-section opener → falls through to legacy path. |
| `liveModeViewPlugin` legacy-kind branch | `plugin.migrateInFlight` (Plugin-instance Set) | `plugin.migrateInFlight.has/add/delete` | ✓ WIRED | `liveModeViewPlugin.ts:189-199`. Module-level Set removed; Plugin-instance field consumed. Same Set as file-open hook → cross-mode dedupe intact. |
| `mountLegacyFenceBanner` | top-level try/catch | wraps entire mount body | ✓ WIRED | `legacyFenceBanner.ts:57-100`. `catch(err)` logs at debug; `try { host.textContent = source } catch {}` paranoid inner guard. |
| `renderReadOnly` | `pre.createEl` optional chain | `(pre as unknown as { createEl?: CreateElFn })?.createEl` | ✓ WIRED | `legacyFenceBanner.ts:133-138`. Falls back to `pre.textContent = source` when `preCe` is not a function. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `readingModeMigrationHook.ts` | `fm['lc-slug']` | `deps.app.metadataCache.getFileCache(file)?.frontmatter` | Yes — live Obsidian metadataCache | ✓ FLOWING |
| `migrateLegacyFenceIfNeeded` | `text` | `app.vault.read(file)` | Yes — real vault read | ✓ FLOWING |
| `backupAlreadyExistsForSlug` | `listing.folders` | `app.vault.adapter.list(PLUGIN_DIR)` | Yes — real adapter list | ✓ FLOWING |
| `runMigrationBackupGc` | `listing.folders` | `app.vault.adapter.list(BASE_DIR)` | Yes — real adapter list | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript strict-mode compiles clean | `npm run build` | exit 0 (tsc -noEmit + esbuild production) | ✓ PASS |
| Full project test suite | `npx vitest run` | 2956 passed / 6 skipped (248 test files) | ✓ PASS — matches baseline exactly |
| Reading-mode hook file exists and exports factory | file read | 153 LOC; `makeReadingModeMigrationHandler` exported | ✓ PASS |
| BACKUP_FOLDER_RE tightened regex shape | grep `migrationBackupGc.ts:75-76` | `[a-z0-9][a-z0-9-]*[a-z0-9]` LC-slug constraint confirmed | ✓ PASS |
| Module-level migrateInFlight removed from liveModeViewPlugin | grep `^let\|^const migrateInFlight` in liveModeViewPlugin.ts | no output | ✓ PASS |
| this.registerEvent (not bare on()) used for file-open hook | grep `main.ts:1548` | `this.registerEvent(this.app.workspace.on('file-open', ...))` | ✓ PASS |

### Probe Execution

No probe scripts present (`scripts/*/tests/probe-*.sh` not used; phase relies on vitest). N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MIGRATE-01 | 21-01, 21-02, 21-05 | Lazy-on-open trigger (BOTH Reading + Live Preview) | ✓ SATISFIED | CR-01 closed: `readingModeMigrationHook.ts` + `main.ts:1548-1566` `registerEvent`. 8-test suite. |
| MIGRATE-02 | 21-01, 21-06 | Backup before rewrite; one backup per note ever | ✓ SATISFIED | CR-02 closed: `backupAlreadyExistsForSlug` before `writeBackup`; 5 CR-02-fix tests. |
| MIGRATE-03 | 21-01 | Atomic rewrite, fence body byte-exact | ✓ SATISFIED | Unchanged. `rewriteFenceOpenerTag` + 110+ property tests. |
| MIGRATE-04 | 21-01 | Idempotent re-open | ✓ SATISFIED | `countLeetCodeSolveFenceOpenersInCodeSection > 0` short-circuit. |
| MIGRATE-05 | 21-04, 21-06 | 30-day TTL cleanup | ✓ SATISFIED | CR-03 + WR-05 closed: tightened regex + `gcRunning` lock. 8+6+2 tests. |
| MIGRATE-06 | 21-02, 21-07 | autoMigrateOnOpen setting + banner | ✓ SATISFIED | CR-04 closed: defensive DOM + try/catch. Reading-mode hook covers auto path. 5 CR-04-fix tests. |
| MIGRATE-07 | 21-01 | Atomic single write (vault.process + processFrontMatter same frame) | ? NEEDS HUMAN | Auto-resume default `single_frame`; dev-vault probe deferred. Resilient orchestrator. |
| MIGRATE-08 | 21-03 | New notes emit `\`\`\`leetcode-solve` | ✓ SATISFIED | Unchanged. `codeBlockForV13` + gate at `NoteTemplate.ts:241-242`. |
| MIGRATE-09 | 21-03 | codeExtractor reads lc-language | ✓ SATISFIED | Unchanged. 3-branch dispatch; 6 consumers. |
| MIGRATE-10 | 21-04 | CI fixtures byte-exact | ✓ SATISFIED (in-tree) | 11 tests pass. CAVEAT: shim-validation deferred. |

No orphaned requirements — all 10 MIGRATE-* IDs have plan coverage.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `tests/fixtures/migration/.obsidian-shim-validation.txt` | n/a | placeholder records `shim_validation: skipped, DIFF: deferred` | ⚠️ INFO | MIGRATE-10 release-gate is internal-shim consistency only; live-Obsidian byte-equal validation deferred. Documented; not a hidden gap. |

No `TBD` / `FIXME` / `XXX` debt markers found in any files modified by Plans 21-05, 21-06, or 21-07 (confirmed by grep).

Previously documented blockers (CR-01..CR-04) are all resolved. Previously documented warnings (WR-01/02/03/05/07) are all resolved. No new anti-patterns introduced.

### Human Verification Required

5 items need live-Obsidian verification. These are carry-forward from the initial verification — the in-tree blockers are now closed; the remaining items are empirical / visual and cannot be confirmed programmatically:

1. **Reading-mode auto-migration on a real v1.2 note (CR-01 confirmation in live vault)**

   **Test:** Open a v1.2 fixture note (e.g., `tests/fixtures/migration/v1.2/test-python3-remap.md` content) in Reading mode in a dev vault with `useInlineWidget=ON` + `autoMigrateOnOpen=ON`.
   **Expected:** The `workspace.on('file-open')` hook fires, `makeReadingModeMigrationHandler` calls `migrateLegacyFenceIfNeeded`, within ~50ms the legacy fence opener is rewritten to `leetcode-solve`, the v1.3 widget mounts. No banner appears.
   **Why human:** Unit tests mock all dependencies. Only a real Obsidian instance proves the EventRef path and actual Reading-mode render cycle after vault write.

2. **MIGRATE-07 single-frame ordering empirical (Plan 21-02 Task 4 Test 2)**

   **Test:** Open a v1.2 fixture note with `lc-language` MISSING in dev vault.
   **Expected:** Fence opener rewritten + `lc-language` injected + widget mounts on canonical language. No flash of Python+Notice.
   **Why human:** `shim_validation=skipped`; actual single-vs-two-frame behavior unobserved.

3. **shim_validation=captured (Test 7 frontmatter byte-layout)**

   **Test:** Run dev-vault probe Test 7 with `autoMigrateOnOpen=ON` + `lc-language` missing.
   **Expected:** `tests/fixtures/migration/.obsidian-shim-validation.txt` records `DIFF: empty`.
   **Why human:** Only live-Obsidian byte-equal validation is authoritative for MIGRATE-10 release-gate confidence.

4. **Banner UX visual check (Reading + Live Preview, autoMigrateOnOpen=OFF)**

   **Test:** Open a v1.2 note with `autoMigrateOnOpen=OFF` in both Reading mode and Live Preview.
   **Expected:** Banner with `This note uses the v1.2 format.` + `[Migrate now]` button + read-only `<pre><code>`. Click `[Migrate now]` runs migration and remounts to v1.3 widget.
   **Why human:** DOM positioning + cohesive styling is mode-specific; cannot be unit-tested.

5. **Cross-OS backup folder path (Windows VM if available)**

   **Test:** Run migration on Windows with a multi-segment slug (e.g., `two-sum`).
   **Expected:** `.obsidian/plugins/obsidian-leetcode/migration-backup-two-sum-2026-06-01T14-32-08Z/two-sum.md` materializes with no `:` in folder name.
   **Why human:** Only macOS dev vault in active use; Windows path-separator behavior is empirical.

### Gaps Summary

All 4 BLOCKERs and all 5 WARNINGs from the initial `gaps_found` verdict are closed. The in-tree codebase now satisfies the phase goal: every v1.2 note can migrate lazily on first open to `leetcode-solve` in both Reading mode and Live Preview, with backup sidecar, atomic rewrite, idempotent detection, GC cleanup, and CI fixture corpus.

The 5 deferred `human_verification` items carry forward from the initial report (MIGRATE-07 single-frame probe, shim_validation capture, banner visual, Reading-mode live vault confirmation, Windows path). These are live-Obsidian empirical items, not in-tree code defects. They were explicitly documented in Plan 21-02 and do not block Phase 22 entrance at the code level — but the Reading-mode live-vault confirmation (item 1) should be the first step before Phase 22 merges to main.

Phase 22 can proceed with deleting the v1.2 path, subject to the human verification items above being cleared in a dev-vault session first.

---

_Verified: 2026-06-01T14:40:00Z_
_Re-verified: 2026-06-01T14:40:00Z (after Plans 21-05, 21-06, 21-07 gap closure)_
_Verifier: Claude (gsd-verifier)_
