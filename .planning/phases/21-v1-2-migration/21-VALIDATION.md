---
phase: 21
slug: v1-2-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source of truth for the test surface required to defend lazy-on-open v1.2 migration. Mirrors `21-RESEARCH.md §"Validation Architecture"`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@4.1.5` (already in tree) |
| **Config file** | `vitest.config.ts` (existing — no changes) |
| **Quick run command** | `npm test -- --run tests/widget/fenceMigrator.test.ts` (per-Plan slice) |
| **Full suite command** | `npm test` (full suite, ~30s baseline) |
| **Estimated runtime** | ~30s full suite; ~3s per per-Plan slice |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run <relevant test file>` (slice — see Per-Task map).
- **After every plan wave:** Run `npm test` (full suite, including new `tests/fixtures/migration/*` + `tests/widget/migration.property.test.ts`).
- **Before `/gsd-verify-work`:** `npm test` AND `npm run build` (typecheck) must both be green.
- **Max feedback latency:** 30 seconds (full suite).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-X | 21-01 | 1 | MIGRATE-01 | — | Lazy-on-open trigger only — no batch on plugin load | unit | `npm test -- --run tests/widget/fenceMigrator.test.ts -t "MIGRATE-01"` | ❌ W0 (new file) | ⬜ pending |
| 21-01-X | 21-01 | 1 | MIGRATE-02 | T-21-backup | Backup written BEFORE rewrite (ordering) | unit (adapter.write spy) | `npm test -- --run tests/widget/fenceMigrator.test.ts -t "MIGRATE-02"` | ❌ W0 | ⬜ pending |
| 21-01-X | 21-01 | 1 | MIGRATE-03 | T-21-bytes | Atomic rewrite preserves fence body byte-for-byte | property | `npm test -- --run tests/widget/migration.property.test.ts -t "body-preservation"` | ❌ W0 | ⬜ pending |
| 21-01-X | 21-01 | 1 | MIGRATE-04 | — | Idempotency — `migrate(migrate(note)) === migrate(note)` | property + unit | `npm test -- --run tests/widget/fenceMigrator.test.ts -t "MIGRATE-04"` | ❌ W0 | ⬜ pending |
| 21-01-X | 21-01 | 1 | MIGRATE-07 | T-21-atom | Atomic w/ first edit (`vault.process` + `processFrontMatter` same render frame) | integration (dev-vault probe) | manual smoke + selfWriteSuppression hash-arm test | ❌ W0 | ⬜ pending |
| 21-01-X | 21-01 | 1 | MIGRATE-09 (predicate) | — | Strict-match predicate — 5 clauses (no false positives) | unit | `npm test -- --run tests/widget/fenceMigrator.test.ts -t "isMigrationCandidate"` | ❌ W0 | ⬜ pending |
| 21-02-X | 21-02 | 2 | MIGRATE-01 (mount integration) | — | `migrateLegacyFenceIfNeeded` fires before widget mount in both modes | integration | `npm test -- --run tests/widget/codeBlockProcessor.test.ts` + `liveModeViewPlugin.test.ts` | ⚠️ extend | ⬜ pending |
| 21-02-X | 21-02 | 2 | MIGRATE-06 | — | `autoMigrateOnOpen` setting persists; OFF → banner mounts | unit (settings) + integration (banner DOM) | `npm test -- --run tests/settings/SettingsTab.test.ts -t "autoMigrateOnOpen"` + `tests/widget/legacyFenceBanner.test.ts` | ⚠️ extend / ❌ W0 | ⬜ pending |
| 21-03-X | 21-03 | 3 | MIGRATE-08 | — | New notes emit `` ```leetcode-solve `` directly when `useInlineWidget=ON` | unit | `npm test -- --run tests/solve/starterCodeInjector.test.ts -t "v13-emit"` + `tests/notes/noteTemplate.test.ts -t "v13-emit"` | ⚠️ extend | ⬜ pending |
| 21-03-X | 21-03 | 3 | MIGRATE-09 | — | `codeExtractor` reads `lc-language` frontmatter when fence is `leetcode-solve`; legacy path preserved for unmigrated notes | unit | `npm test -- --run tests/solve/codeExtractor.test.ts -t "frontmatter-source"` | ⚠️ extend | ⬜ pending |
| 21-04-X | 21-04 | 4 | MIGRATE-05 | T-21-gc | 30-day TTL parses ISO timestamp from folder + deletes expired only | unit (mock `Date.now()` + adapter spy) | `npm test -- --run tests/widget/migrationBackupGc.test.ts -t "MIGRATE-05"` | ❌ W0 | ⬜ pending |
| 21-04-X | 21-04 | 4 | MIGRATE-10 | — | CI fixtures byte-exact migrate v1.0/v1.1/v1.2 sample notes | integration (snapshot) | `npm test -- --run tests/fixtures/migration/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/widget/fenceMigrator.test.ts` — strict-match + atomic rewrite + idempotency unit/integration tests (MIGRATE-01..04, MIGRATE-07, predicate)
- [ ] `tests/widget/migration.property.test.ts` — property tests for body preservation, frontmatter preservation, idempotency, backup correctness
- [ ] `tests/widget/migrationBackupGc.test.ts` — TTL parsing + adapter cleanup mock
- [ ] `tests/widget/legacyFenceBanner.test.ts` — banner DOM + read-only legacy display
- [ ] `tests/fixtures/migration/v1.0/` — 3 hand-written sample notes + 3 `*.expected.md` paired outputs
- [ ] `tests/fixtures/migration/v1.1/` — 3 hand-written sample notes + 3 `*.expected.md` paired outputs (Techniques / AI Review / Related Variants)
- [ ] `tests/fixtures/migration/v1.2/` — 4 hand-written sample notes + 4 `*.expected.md` paired outputs (Phase 5.3 lcSlugToFenceTag remaps + vim-mode artifact case)
- [ ] `tests/fixtures/migration/index.test.ts` — fixture runner (loads fixture, runs migrator, asserts byte-exact `*.expected.md`)
- [ ] Extend `tests/settings/SettingsTab.test.ts` — `autoMigrateOnOpen` toggle persistence
- [ ] Extend `tests/solve/codeExtractor.test.ts` — `frontmatter` arg dual-path
- [ ] Extend `tests/solve/starterCodeInjector.test.ts` — `fenceKind` arg + v1.3 emit
- [ ] Extend `tests/notes/noteTemplate.test.ts` (or equivalent) — `codeBlockForV13` emitter

*Framework already installed (`vitest@4.1.5`); no install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `vault.process` + `processFrontMatter` land in same render frame | MIGRATE-07 | Empirical Obsidian-runtime ordering — cannot be unit-tested without full Electron host | Plan 21-01 dev-vault probe: open a v1.2 fixture note in dev vault with `autoMigrateOnOpen=ON`, verify (a) widget mounts on `leetcode-solve` fence in same frame, (b) no transient widget mount on legacy fence, (c) external-edit reconciliation (Phase 20 SYNC-04) does not surface a phantom diff. Documented in 21-RESEARCH.md §Pitfall 1. |
| Banner-mode UX in Reading + Live Preview | MIGRATE-06 | DOM positioning + inline-vs-fixed banner placement is mode-specific | Plan 21-02 dev-vault smoke: with `autoMigrateOnOpen=OFF`, open a v1.2 note in Reading mode and Live Preview separately. Confirm banner is visible above the fence body, [Migrate now] click runs migration and remounts the v1.3 widget in the same render. |
| Legacy fence read-only display fidelity | — | Visual check (no syntax highlight gate, but should not be blank) | Plan 21-02 dev-vault smoke: legacy fence body renders as `<pre><code>` with semantic classes; no atomicRanges, no debouncedWriter. |
| Backup folder filesystem layout cross-OS | MIGRATE-02 | `:` → `-` substitution; macOS/Windows/Linux path separator differences | Plan 21-04 dev-vault smoke: trigger migration on macOS dev vault; verify `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md` path materializes correctly with no `:` in folder name. Repeat on Windows VM if available. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (manual smoke documented for MIGRATE-07 dev-vault probe + Phase 22 cross-OS backup-path)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 new test files + 3 new fixture directories + 4 extensions)
- [ ] No watch-mode flags (`--run` everywhere; `npm test` already runs `vitest run`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 verified green by gsd-validate-phase)

**Approval:** pending
