---
phase: 21-v1-2-migration
plan: 06
subsystem: widget/migration
tags: [migration, backup, idempotency, regex, gc, gap-closure, CR-02, CR-03, WR-05]
gap_closure: true
requirements: [MIGRATE-02, MIGRATE-05]
dependency_graph:
  requires:
    - "src/widget/migrationBackupGc.ts (Plan 21-04)"
    - "src/widget/fenceMigrator.ts (Plan 21-01)"
  provides:
    - "BACKUP_FOLDER_RE — exported SSoT for LC-shape backup folder pattern"
    - "backupAlreadyExistsForSlug — pre-existence check helper for retry path"
    - "gcRunning concurrency lock + __resetGcRunningForTesting test helper"
  affects:
    - "Phase 22 (DELETE-*) — D-backup-02 invariant now holds across retry path; cleanup logic can rely on it"
tech_stack:
  added: []
  patterns:
    - "SSoT regex via named export (BACKUP_FOLDER_RE) — no literal duplication"
    - "Pattern S-05 silent-on-failure preserved on adapter.list / adapter.rmdir"
    - "Module-level concurrency lock with finally-reset (idiomatic JS)"
key_files:
  created: []
  modified:
    - "src/widget/migrationBackupGc.ts"
    - "src/widget/fenceMigrator.ts"
    - "tests/widget/migrationBackupGc.test.ts"
    - "tests/widget/fenceMigrator.test.ts"
decisions:
  - "BACKUP_FOLDER_RE tightened to LC-slug shape `[a-z0-9][a-z0-9-]*[a-z0-9]` and exported as named const for SSoT reuse (CR-03)"
  - "Pre-existence check via adapter.list + per-slug match closes D-backup-02 retry path (CR-02). On match, writeBackup is skipped but the rewrite proceeds — preserves idempotent retry shape"
  - "Module-level gcRunning lock (NOT instance-scoped) — at most one in-flight sweep per plugin lifetime is sufficient for MIGRATE-05's TTL contract (WR-05)"
  - "Test-only export __resetGcRunningForTesting — gated by JSDoc note; production code MUST NOT call it"
metrics:
  duration_seconds: ~600
  completed_date: "2026-06-01"
  tasks_completed: 3
  files_modified: 4
  tests_added: 15
threats_addressed:
  - id: T-21-CR02-double-backup
    severity: BLOCKER
    closed: true
    evidence: "CR-02-fix Test A asserts adapter.write.mock.calls.length === 1 across both calls of partial-failure retry"
  - id: T-21-CR03-greedy-regex
    severity: BLOCKER
    closed: true
    evidence: "6 CR-03-fix tests cover multi-segment match + 5 non-LC-shape rejects (uppercase, mixed-case, single-char, leading/trailing hyphen)"
  - id: T-21-WR05-gc-race
    severity: WARNING
    closed: true
    evidence: "4 WR-05-fix tests cover concurrent skip + finally reset on success/failure + sequential happy paths"
---

# Phase 21 Plan 21-06: Backup-Invariant Gap Closure Summary

**One-liner:** Closed three Phase 21 backup-invariant gaps from 21-VERIFICATION.md / 21-REVIEW.md — CR-02 (double-backup on partial-failure retry), CR-03 (greedy slug regex permitting TTL deletion of non-LC-shape folders), and WR-05 (no concurrency guard on the GC sweep) — by tightening the LC-slug regex into a named SSoT export, adding a per-slug pre-existence backup check that reuses it, and serializing concurrent GC invocations with a module-level lock.

## What Built

| Task | Deliverable | Commit |
|------|-------------|--------|
| 1 | Tightened BACKUP_FOLDER_RE to LC-slug shape and exported as named const SSoT (CR-03) | `31f28f0` |
| 2 | Added `backupAlreadyExistsForSlug` helper + orchestrator pre-existence check (CR-02) | `f03ffdf` |
| 3 | Added module-level `gcRunning` concurrency lock + `__resetGcRunningForTesting` (WR-05) | `713d541` |

### Key Code Locations

- **`src/widget/migrationBackupGc.ts:75`** — `export const BACKUP_FOLDER_RE = /^migration-backup-([a-z0-9][a-z0-9-]*[a-z0-9])-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/;`
  Verbatim regex literal (CR-03 closure). Slug class: starts and ends with `[a-z0-9]`, body `[a-z0-9-]*` accepts internal hyphens. Minimum 2 chars enforced by start+end character classes.
- **`src/widget/migrationBackupGc.ts:94`** — `let gcRunning = false;` (module-level concurrency lock; WR-05).
- **`src/widget/migrationBackupGc.ts:151`** — Entry guard: `if (gcRunning) { logger.debug('migrationBackupGc: skipping concurrent invocation', {}); return; }` followed by `gcRunning = true;` on the next line.
- **`src/widget/migrationBackupGc.ts:202`** — `} finally { gcRunning = false; }` — outer try/finally wrap; resets the lock across success, failure, and concurrent-skip paths. Inner try/catches around `adapter.list` and `adapter.rmdir` are preserved unchanged (Pattern S-05).
- **`src/widget/migrationBackupGc.ts:113-115` (approx)** — `export function __resetGcRunningForTesting(): void { gcRunning = false; }` — test-only helper, JSDoc-tagged "NOT for production use".
- **`src/widget/fenceMigrator.ts:205`** — Helper signature: `async function backupAlreadyExistsForSlug(app: App, slug: string): Promise<boolean>` — lists `.obsidian/plugins/obsidian-leetcode/`, matches each folder against imported `BACKUP_FOLDER_RE`, returns `true` on first match where `m[1] === slug`. Defensive on rejection (returns `false`).
- **`src/widget/fenceMigrator.ts:334`** — Orchestrator call site: `const alreadyBackedUp = await backupAlreadyExistsForSlug(app, slug);` followed by conditional `await writeBackup(app, file, slug, text);` — replaces the previous unconditional Step 3 backup write. On a hit, only the backup write is skipped — the orchestrator still runs Step 4 (`vault.process`), preserving the idempotent retry shape.

## Test Count Delta

- **Baseline (before Plan 21-06):** 2915 passed / 6 skipped (2921 total) — full suite, captured 2026-06-01T14:00:12.
- **After Plan 21-06:** 2930 passed / 6 skipped (2936 total) — full suite, captured 2026-06-01T14:05:36.
- **Delta:** **+15 tests** (exactly matches the planned 6 CR-03-fix + 5 CR-02-fix + 4 WR-05-fix).
- Per-file:
  - `tests/widget/migrationBackupGc.test.ts`: 8 baseline → 18 (8 + 6 CR-03-fix + 4 WR-05-fix).
  - `tests/widget/fenceMigrator.test.ts`: 58 baseline → 63 (58 + 5 CR-02-fix).
- TypeScript strict-mode build: PASS (`tsc -noEmit -skipLibCheck`).

## Threat Closures (verified)

| Threat ID | Severity | Status | Evidence |
|-----------|----------|--------|----------|
| T-21-CR02-double-backup | BLOCKER | **Closed** | CR-02-fix Test A: simulates `vault.process` throwing AFTER `writeBackup` succeeded; second call's pre-existence check finds the prior backup folder; assertion `adapter.write.mock.calls.length === 1` across BOTH calls. D-backup-02 invariant ("one backup per note ever") holds across the partial-failure retry path. |
| T-21-CR03-greedy-regex | BLOCKER | **Closed** | 6 CR-03-fix tests: A (multi-segment `foo-bar-baz` matches), B (uppercase `FOO` rejected), C (mixed-case `Test` rejected), D (single-char `a` rejected), E (leading-hyphen rejected), F (trailing-hyphen rejected). Existing `two-sum` slug still matches the new shape. |
| T-21-WR05-gc-race | WARNING | **Closed** | 4 WR-05-fix tests: A (concurrent invocation skipped at lock — `app2.adapter.list` never called; debug log captured), B (finally reset on success — sequential calls each hit the body), C (finally reset on failure — `adapter.list` throws on first call, second call still executes), D (sequential happy paths each fully execute). |

## SSoT Discipline (Verified)

- `grep -c 'BACKUP_FOLDER_RE' src/widget/fenceMigrator.ts` returns 2 — one import statement, one usage in `backupAlreadyExistsForSlug`. NO regex literal duplication; the `fenceMigrator.ts` helper imports the named export from `migrationBackupGc.ts`.
- `grep -c "from './migrationBackupGc'" src/widget/fenceMigrator.ts` returns 1 (the new import line).
- Per the threat-model boundary in the plan: both `runMigrationBackupGc` (TTL deletion) and `backupAlreadyExistsForSlug` (retry-path pre-check) operate on the SAME folder shape constraint via the SAME compiled regex.

## Deviations from Plan

**None.** Plan executed exactly as written:

- Task 1: Regex literal verbatim from VERIFICATION.md / REVIEW.md.
- Task 2: Helper signature, behavior, and orchestrator integration verbatim from the plan's `<action>` block. The orchestrator's outer try/catch (Pattern S-05) covers any propagation; the helper's internal catch handles first-install gracefully.
- Task 3: Lock declaration, entry guard, and finally placement verbatim from the plan. `__resetGcRunningForTesting` exported with JSDoc tag.

CLAUDE.md `## Conventions` paragraphs UNCHANGED (verified — no edits to CLAUDE.md in this plan).

## Self-Check: PASSED

- [x] `src/widget/migrationBackupGc.ts:75` exports `BACKUP_FOLDER_RE` with the tightened LC-slug regex.
- [x] `src/widget/migrationBackupGc.ts:94` declares `let gcRunning = false;` at module scope.
- [x] `src/widget/migrationBackupGc.ts:151` has the `if (gcRunning)` entry guard followed by `gcRunning = true;`.
- [x] `src/widget/migrationBackupGc.ts:202` has the outer `} finally { gcRunning = false; }` wrap.
- [x] `src/widget/migrationBackupGc.ts` exports `__resetGcRunningForTesting`.
- [x] `src/widget/fenceMigrator.ts` imports `BACKUP_FOLDER_RE` from `./migrationBackupGc`.
- [x] `src/widget/fenceMigrator.ts:205` defines `async function backupAlreadyExistsForSlug(app, slug)`.
- [x] `src/widget/fenceMigrator.ts:334` calls `backupAlreadyExistsForSlug` BEFORE the conditional `writeBackup` call.
- [x] Commit `31f28f0` exists in `git log`: `fix(21-06): tighten BACKUP_FOLDER_RE to LC-slug shape, export as SSoT (CR-03)`.
- [x] Commit `f03ffdf` exists in `git log`: `fix(21-06): add pre-existence backup check to protect D-backup-02 (CR-02)`.
- [x] Commit `713d541` exists in `git log`: `fix(21-06): add gcRunning concurrency lock to runMigrationBackupGc (WR-05)`.
- [x] `npm test -- --run tests/widget/migrationBackupGc.test.ts` exits 0 with 18 tests passing.
- [x] `npm test -- --run tests/widget/fenceMigrator.test.ts` exits 0 with 63 tests passing.
- [x] `npm test -- --run` (full suite) exits 0 with 2930 passing / 6 skipped — exactly +15 vs baseline.
- [x] `npm run build` exits 0.
- [x] CLAUDE.md `## Conventions` paragraphs UNCHANGED.

## Acceptance Criteria — All Met

- CR-02 closed: D-backup-02 invariant holds across the partial-failure retry path (CR-02-fix Test A).
- CR-03 closed: BACKUP_FOLDER_RE tightened to LC-slug shape; non-LC-shape folders are NEVER TTL-deleted (6 CR-03-fix tests).
- WR-05 closed: concurrent `runMigrationBackupGc` invocations short-circuit at the lock; lock resets in `finally` across success/failure paths (4 WR-05-fix tests).
- BACKUP_FOLDER_RE is the single source of truth (exported from `migrationBackupGc.ts`, imported by `fenceMigrator.ts`).
- Existing 8 GC tests + 58 fenceMigrator tests still pass; full 2915-test baseline still passes (now 2930); TypeScript strict-mode green.
- D-backup-01 (folder shape), D-backup-02 (one backup per note), D-backup-03 (30-day TTL + microtask) all strengthened.
