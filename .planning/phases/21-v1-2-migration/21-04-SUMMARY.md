---
phase: 21-v1-2-migration
plan: 04
subsystem: migration / release-gate
tags: [migration, backup-gc, ci-fixtures, release-gate, MIGRATE-05, MIGRATE-10]
requires:
  - "21-01 (fenceMigrator core)"
  - "21-02 (mount integration + autoMigrateOnOpen setting)"
  - "21-03 (codeExtractor refactor + new-note v1.3 emission)"
provides:
  - "30-day TTL backup cleanup (MIGRATE-05)"
  - "10-fixture CI release gate over v1.0/v1.1/v1.2 sample notes (MIGRATE-10)"
  - "Pattern: Promise.resolve().then(...) fire-and-forget microtask in Plugin.onload()"
affects:
  - "src/main.ts (Plugin.onload fire-and-forget microtask wiring)"
tech-stack:
  added:
    - "src/widget/migrationBackupGc.ts — file-system filter + ISO-timestamp parser + TTL math + silent-on-failure logger.debug"
  patterns:
    - "Pattern S-05 (silent-on-failure best-effort wrapper) applied to two adapter calls (list + rmdir)"
    - "Pattern S-08 (lazy-on-trigger discipline) — reaffirmed in fixture-runner architecture (no real I/O)"
    - "Frontmatter-append convention — documented in tests/fixtures/migration/index.test.ts header"
key-files:
  created:
    - "src/widget/migrationBackupGc.ts (140 LOC; runMigrationBackupGc export)"
    - "tests/widget/migrationBackupGc.test.ts (8 tests)"
    - "tests/fixtures/migration/v1.0/{two-sum,reverse-string,valid-parentheses}.md + .expected.md (6 files)"
    - "tests/fixtures/migration/v1.1/{test-techniques,test-ai-review,test-related-variants}.md + .expected.md (6 files)"
    - "tests/fixtures/migration/v1.2/{test-python3-remap,test-golang-remap,test-c-remap,test-typescript-vim-artifacts}.md + .expected.md (8 files)"
    - "tests/fixtures/migration/index.test.ts (1 discovery test + 10 fixture-pair tests)"
    - "tests/fixtures/migration/.obsidian-shim-validation.txt (deferred-validation placeholder; BLOCKER 4 option-b)"
  modified:
    - "src/main.ts (Phase 21 import + 1 microtask line in Plugin.onload after settings load)"
decisions:
  - "BLOCKER 4 disposition (Option b): authored .obsidian-shim-validation.txt as a deferred-validation placeholder. Plan 21-02 Task 4 Test 7 recorded shim_validation=skipped; this plan inherits the deferral. The fixture runner's applyFrontmatterMutation and the *.expected.md files are paired against each other (same convention used to author both), so byte-equal assertions remain internally consistent. A follow-up dev-vault session must run the empirical capture (procedure documented in the placeholder) before MIGRATE-10 can be claimed at full live-Obsidian confidence."
  - "Microtask placement: scheduled immediately after `await SettingsStore.load(this)` in onload (before requestUrl shim install). The microtask reads no settings — it only consults app.vault.adapter — so position relative to subsequent steps does not matter; placement after settings load merely keeps the Phase 21-only feature contiguous with future phase additions."
metrics:
  duration_minutes: 12
  completed_date: 2026-06-01
  tasks_completed: 3
  tests_added: 19  # 8 GC unit + 1 fixture-discovery + 10 fixture-runner
  files_created: 17
  files_modified: 1
---

# Phase 21 Plan 21-04: Backup GC + CI Fixtures + Release Gate Summary

Deliver 30-day TTL backup cleanup (MIGRATE-05) wired as a fire-and-forget microtask, plus a hand-written 10-fixture CI corpus + byte-exact runner (MIGRATE-10) closing Phase 21 release gate.

## What Shipped

### Task 1 — runMigrationBackupGc (MIGRATE-05) — commit `ae3f901`

`src/widget/migrationBackupGc.ts` (140 LOC) exports a single async function `runMigrationBackupGc(app)`:

1. List `.obsidian/plugins/obsidian-leetcode/` via `app.vault.adapter.list`. On rejection (likely first-install: plugin folder does not yet exist), `logger.debug` + return — Pattern S-05.
2. Filter folders against the **strict regex** `/^migration-backup-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/` (T-21-gc — non-backup folders like `data`/`cache` are NEVER deleted).
3. Reverse the `:` → `-` substitution in the captured ISO suffix and `Date.parse(iso)`. Skip on NaN.
4. **TTL math direction**: `if (now - parsed > 30 * 24 * 60 * 60 * 1000)` (Pitfall 5 — explicitly verified by boundary tests).
5. Delete via `app.vault.adapter.rmdir(folderFull, true)` inside its own try/catch — partial cleanup failure does not abort the sweep.

`src/main.ts` Plugin.onload wiring:

```ts
Promise.resolve().then(() => runMigrationBackupGc(this.app));
```

- **Fire-and-forget**: NOT `await`ed, NOT `setTimeout`. Verified by `grep -E 'await\s+runMigrationBackupGc' src/main.ts` → 0 matches; `grep -E 'setTimeout.*runMigrationBackupGc' src/main.ts` → 0 matches.
- **Unconditional**: NOT gated on `useInlineWidget` or `autoMigrateOnOpen` (per D-backup-03). Backups exist on disk regardless of widget toggle state.

8 unit tests cover the matrix (file `tests/widget/migrationBackupGc.test.ts`):

| # | Behavior | Result |
|---|---|---|
| 1 | MIGRATE-05 happy path: 62-day-old deleted, 2-day-old kept | PASS |
| 2 | TTL boundary: 29.96-day-old folder remains | PASS |
| 3 | TTL boundary: 31-day-old folder deleted | PASS |
| 4 | First-install (Pitfall 4): adapter.list rejects → resolves silently | PASS |
| 5 | T-21-gc: strict regex rejects `data`, `cache`, `migration-backup-malformed` | PASS |
| 6 | Malformed ISO suffix folder skipped | PASS |
| 7 | Pattern S-05: rmdir rejection swallowed silently | PASS |
| 8 | Multiple folders: 3 expired + 2 fresh → 3 rmdir calls (partial deletion) | PASS |

### Task 2 — CI fixture corpus — commit `2d65fce`

20 hand-written fixture files (10 input + 10 paired `*.expected.md`) under `tests/fixtures/migration/`:

- **v1.0** (3 pairs): `two-sum` (python3), `reverse-string` (java), `valid-parentheses` (cpp, **no `lc-language`** — exercises D-edge-03 default-language injection through the orchestrator + frontmatter-append shim).
- **v1.1** (3 pairs): `test-techniques`, `test-ai-review`, `test-related-variants` — Phase 11/12 surfaces with adjacent `## ` headings to stress the strict-match predicate's heading-boundary logic.
- **v1.2** (4 pairs): `test-python3-remap` (lang=python3, fence=python), `test-golang-remap` (lang=golang, fence=go), `test-c-remap` (lang=c, fence=cpp — Phase 5.3 lcSlugToFenceTag remap), `test-typescript-vim-artifacts` (T-21-bytes stress: 2 body lines with trailing whitespace).

Each `.expected.md` is byte-identical to its input EXCEPT:
- the fence opener under `## Code` is rewritten from `` ```<langTag> `` to `` ```leetcode-solve ``;
- `valid-parentheses.expected.md` ALSO appends `lc-language: python3` at the end of the frontmatter block (frontmatter-append convention).

### Task 3 — fixture runner / release gate (MIGRATE-10) — commit `22ba945`

`tests/fixtures/migration/index.test.ts` (340 LOC):

- `discoverFixtures()` scans the three version directories, pairs each `*.md` with its `*.expected.md`, returns labeled tuples (`label = ${version}/${slug}`).
- `applyFrontmatterMutation(noteText, mutator)` — pure shim that parses the frontmatter block, calls `mutator` with a `Record<string, unknown>` mirroring Obsidian's contract, and re-serializes following the **append-at-end** convention (existing keys keep their original order + raw value; newly-added keys appended just before the closing `---`).
- `createMockApp(input, slug)` returns a fully-spied App shim: `vault.read`, `vault.process` (mutates currentText), `vault.adapter.write` (backup spy), `vault.adapter.mkdir`, `metadataCache.getFileCache` (returns parsed initial frontmatter), `fileManager.processFrontMatter` (routes through `applyFrontmatterMutation`).
- `it.each(fixtures)` drives 10 byte-exact equality assertions plus backup-correctness assertions:
  - `expect(reconstructed).toBe(expected)` — T-21-bytes
  - `expect(adapterWriteSpy).toHaveBeenCalledTimes(1)` and `expect(writeArgs[1]).toBe(input)` — T-21-backup

## Verification Outcomes

- `npx vitest run tests/widget/migrationBackupGc.test.ts` — **8/8 PASS** (~14ms).
- `npx vitest run tests/fixtures/migration/` — **11/11 PASS** (1 discovery + 10 fixture pairs, ~23ms).
- `npx vitest run` (full suite) — **2915 passed, 6 pre-existing skipped, 247 files, 65s**.
- `npm run build` — **PASS** (TypeScript strict-mode green; esbuild production bundle clean).

### TTL Boundary Test Results (Pitfall 5 mitigation in production)

- **29.96-day-old folder remains**: confirmed via Test 2 — `2026-05-02T01:00:00Z` vs `Date.now()` mocked to `2026-06-01T00:00:00Z` → `now - parsed = ~29.96 days < 30 days TTL` → `rmdir` NOT called. PASS.
- **31-day-old folder deletes**: confirmed via Test 3 — `2026-05-01T00:00:00Z` vs `2026-06-01T00:00:00Z` → `now - parsed = exactly 31 days > 30 days TTL` → `rmdir` called once with the exact path. PASS.

### Vim-artifacts fixture (T-21-bytes stress)

- `grep -c ' $' tests/fixtures/migration/v1.2/test-typescript-vim-artifacts.md` → **2** (two trailing-whitespace lines preserved on disk).
- `grep -c ' $' tests/fixtures/migration/v1.2/test-typescript-vim-artifacts.expected.md` → **2** (round-trips byte-exact).
- Fixture runner test for `v1.2/test-typescript-vim-artifacts` — PASS.

### valid-parentheses fixture (D-edge-03 default-language injection)

- Input `lc-language` count: **0** (frontmatter intentionally lacks the field).
- Expected `lc-language` count: **1** (`lc-language: python3` appended at the end of the frontmatter block).
- Fixture runner test for `v1.0/valid-parentheses` — PASS (proves orchestrator triggers `processFrontMatter` only when missing/empty AND the frontmatter-append shim reproduces the convention byte-exactly).

### Microtask Audit

- `grep -c 'Promise.resolve().then' src/main.ts` → **2** (Phase 21 microtask + 1 pre-existing PATH-warm microtask). The Phase 21 line contains `runMigrationBackupGc`.
- `grep -E 'await\s+runMigrationBackupGc' src/main.ts | wc -l` → **0** (fire-and-forget invariant).
- `grep -E 'setTimeout.*runMigrationBackupGc' src/main.ts | wc -l` → **0** (microtask, not timer).
- `grep -c 'runMigrationBackupGc' src/main.ts` → **2** (1 import + 1 invocation).

### Phase 21 cumulative test-count delta

`npm test` total post-Plan-21-04: **2915 passing**. Plan 21-04 adds **19 new tests** (8 GC unit + 1 fixture-discovery + 10 fixture-pair byte-exact). Plans 21-01..04 cumulative addition is well above the +30 floor stated in the output spec (21-01 + 21-02 + 21-03 + 21-04 add tests across migrator unit/property + mount-path + codeExtractor refactor + GC + fixture-runner; the precise per-plan delta is recorded in each prior plan's SUMMARY).

## Open Question §1 — vault.process + processFrontMatter ordering

**Final disposition (carries Plan 21-02 Task 4 empirical answer):** Per `21-02-DEV-VAULT-PROBE.md` the empirical observation was `single-frame` ordering (Axis 1). The hash-arm fallback (Pattern S-03) was NOT activated; `selfWriteSuppression` operates with a single arm covering the atomic vault.process + processFrontMatter pair as Obsidian queues the two writes serially per-file inside the same render frame. Phase 21 ships with the single-arm path; the two-frame fallback remains in tree (unused but tested) for cross-version Obsidian compatibility.

## Deviations from Plan

### BLOCKER 4 — deferred shim validation (Rule 3 → Option b applied per plan-specific notes)

**Trigger:** The plan acceptance criteria require `tests/fixtures/migration/.obsidian-shim-validation.txt` to exist with a captured `DIFF: empty` line; producer is Plan 21-02 Task 4 Test 7, which recorded `shim_validation=skipped` per `21-02-SUMMARY.md` (headless executor — no live Obsidian session).

**Resolution applied:** Authored `.obsidian-shim-validation.txt` as a **deferred-validation placeholder** (Option b in the plan-specific notes). The file records the skipped state, the version metadata schema (`obsidian_version: deferred`, `shim_validation: skipped`, `DIFF: deferred`), and a re-run protocol for a follow-up dev-vault session. Plan 21-04 Task 3's fixture-runner is the **ground-truth check** while live-Obsidian validation remains pending: `*.expected.md` files and the runner's `applyFrontmatterMutation` shim are paired against each other (same convention used to author both), so byte-equal assertions are internally consistent. A future dev-vault capture that diverges will require regenerating all `*.expected.md` from the corrected shim and re-running the suite. **MIGRATE-10 is claimed at the in-tree fixture-corpus confidence level; full live-Obsidian confidence is gated on the deferred capture.**

### No Rule 1 / Rule 2 / Rule 4 Deviations

No bugs auto-fixed. No missing critical functionality auto-added. No architectural changes proposed. Plan executed exactly as written.

## Known Stubs

None. All deliverables wire real production code (`runMigrationBackupGc` is invoked from `Plugin.onload`); fixtures and test runner are self-contained test artifacts with no UI placeholders.

## Phase 22 Entrance Criteria

Phase 21 is now complete pending the deferred shim-validation capture. All four plans (21-01..21-04) have closed:

- 21-01: fenceMigrator core + isMigrationCandidate + writeBackup + atomic vault.process+processFrontMatter pipeline.
- 21-02: mount integration (Reading + Live Preview) + `autoMigrateOnOpen` setting + legacyFenceBanner + `LeetCode: Migrate current note` command.
- 21-03: codeExtractor frontmatter-aware refactor (MIGRATE-09) + `codeBlockForV13` new-note emitter (MIGRATE-08).
- 21-04: 30-day TTL backup cleanup (MIGRATE-05) + 10-fixture CI release gate (MIGRATE-10).

Phase 22 (DELETE-01..07 + POLISH-01 + PROTECT-03 + THEME-05) can now flip the `useInlineWidget=ON` default and begin deleting the v1.2 path with confidence that:
- migration runs lazily on every legacy-note open;
- backups are written to disk before any rewrite (T-21-backup) and auto-expire at 30 days;
- the fixture corpus catches regressions byte-exactly across v1.0/v1.1/v1.2 + Phase 5.3 lcSlugToFenceTag remaps + vim-mode artifacts;
- the deferred shim-validation capture is the single follow-up item — once empirical confirmation lands, MIGRATE-10 is at full confidence.

## Self-Check: PASSED

- File `src/widget/migrationBackupGc.ts` — FOUND.
- File `tests/widget/migrationBackupGc.test.ts` — FOUND.
- 20 fixture files under `tests/fixtures/migration/{v1.0,v1.1,v1.2}/` — FOUND (verified by `ls | wc -l = 20`).
- File `tests/fixtures/migration/index.test.ts` — FOUND.
- File `tests/fixtures/migration/.obsidian-shim-validation.txt` — FOUND.
- Commit `ae3f901` (Task 1) — FOUND in `git log --all`.
- Commit `2d65fce` (Task 2) — FOUND.
- Commit `22ba945` (Task 3) — FOUND.
