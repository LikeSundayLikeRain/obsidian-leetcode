---
phase: 21-v1-2-migration
plan: 01
subsystem: widget/migration
tags: [migration, fence, vault-process, atomic, property-test, ssoT, crlf]
requires:
  - src/widget/fenceLocator.ts (countLeetCodeSolveFenceOpeners)
  - src/widget/fenceSerialization.ts (splitPreservingEols, extractFenceBody)
  - src/solve/languages.ts (LC_LANG_SLUGS, resolveLangSlug)
  - src/shared/logger.ts (logger.debug)
provides:
  - "src/widget/fenceMigrator.ts: isMigrationCandidate, writeBackup, migrateLegacyFenceIfNeeded"
  - "src/widget/fenceSerialization.ts: rewriteFenceOpenerTag (new export)"
affects:
  - tests/widget/fenceSerialization.property.test.ts (extended)
  - tests/widget/fenceMigrator.test.ts (new)
  - tests/widget/migration.property.test.ts (new)
tech-stack:
  added: []
  patterns:
    - "vault-layer atomic write: vault.process + fileManager.processFrontMatter (paired)"
    - "SSoT delegation: rewriteFenceOpenerTag → rewriteFenceBody sibling in fenceSerialization.ts"
    - "Pattern S-05 silent-on-failure orchestrator try/catch"
    - "Sentinel-trick langSlug recognition (resolveLangSlug + LC_LANG_SLUGS membership)"
    - "ISO timestamp sanitization for cross-OS filesystem path safety"
key-files:
  created:
    - src/widget/fenceMigrator.ts
    - tests/widget/fenceMigrator.test.ts
    - tests/widget/migration.property.test.ts
  modified:
    - src/widget/fenceSerialization.ts
    - tests/widget/fenceSerialization.property.test.ts
decisions:
  - "RESEARCH Open Question §1 (vault.process ↔ processFrontMatter ordering): NOT empirically resolved in this plan — flagged open. Plan 21-02 owns the integration smoke. Orchestrator is resilient to either outcome."
  - "rewriteFenceOpenerTag added as a SIBLING export of rewriteFenceBody (not as an extension of rewriteFenceBody with an openerTag? param) — keeps the body-rewrite contract in tests/widget/fenceSerialization.property.test.ts unchanged."
  - "Type narrow on `newOpenerTag: 'leetcode-solve'` parameter — Phase 22 cleanup will rename / generalize."
  - "lc-language fill default: opts.defaultLanguage ?? 'python3' (Pattern S-06 dependency injection — caller threads SettingsStore.getDefaultLanguage())."
metrics:
  duration: 564s
  completed: 2026-06-01T16:04:44Z
  tasks: 3
  files: 5
---

# Phase 21 Plan 21-01: Fence Migration Foundation Summary

JWT-style "lazy-on-open" v1.2→v1.3 fence migration foundation: a strict-match predicate, atomic vault.process + processFrontMatter pipeline, CRLF-tolerant rewriteFenceOpenerTag helper, and exhaustive property-test coverage. Migration is unit-testable in isolation against a fixture-shaped App + TFile + frontmatter; NOT yet wired into widget mount paths (Plan 21-02 wires it).

## What Shipped

### `src/widget/fenceMigrator.ts` (NEW, 309 LOC)

Three exported functions implementing the v1.3 migration core:

| Export | Signature | Purpose |
|--------|-----------|---------|
| `isMigrationCandidate` | `(noteText: string, frontmatter: Record<string, unknown> \| undefined) => boolean` | Pure 5-clause strict-match predicate (D-edge-01). True iff lc-slug present AND `## Code` heading exists AND first fence inside has recognized LC langSlug AND fence has closer AND no leetcode-solve fence already present. |
| `writeBackup` | `(app: App, file: TFile, slug: string, fileText: string) => Promise<string>` | Writes a per-note sidecar to `.obsidian/plugins/obsidian-leetcode/migration-backup-{slug}-{ISO}/{slug}.md` via `app.vault.adapter.write`. Returns the backup path. ISO timestamp sanitized (`:` → `-`, millis stripped). |
| `migrateLegacyFenceIfNeeded` | `(app: App, file: TFile, opts?: { force?: boolean; defaultLanguage?: string; autoMigrateOnOpen?: boolean }) => Promise<boolean>` | Async orchestrator. 6-step pipeline: settings gate → read → predicate → backup → vault.process → processFrontMatter (only when lc-language missing/empty) → return. Whole orchestrator wrapped in try/catch (Pattern S-05). Returns true iff migration ran. |

### `src/widget/fenceSerialization.ts` (MODIFIED, +96 LOC)

| Export | Signature | Purpose |
|--------|-----------|---------|
| `rewriteFenceOpenerTag` (NEW) | `(noteText: string, newOpenerTag: 'leetcode-solve') => string` | CRLF-tolerant body-preserving fence-opener swap. Walks `## Code` section, finds first fence opener whose tag is NOT already `leetcode-solve`, rewrites only that opener line. Reuses `splitPreservingEols` (existing primitive). Returns input unchanged on miss (caller's strict-match predicate is the gate). |

### `tests/widget/fenceMigrator.test.ts` (NEW, 469 LOC, 58 tests)

- `describe('isMigrationCandidate')`: 5-clause exhaustion. 18 recognized langSlug aliases + 6 unrecognized + empty + no-`## Code` + multiple H2 + closer-missing variants.
- `describe('writeBackup')`: ISO sanitization, path shape, byte-exact contents, mkdir-before-write ordering. Uses `vi.useFakeTimers()` for deterministic timestamps.
- `describe('migrateLegacyFenceIfNeeded')`: covers MIGRATE-01..MIGRATE-04 + MIGRATE-07. Spy ordering via `mock.invocationCallOrder` (10 references) for T-21-backup (write < process) and T-21-atom (process < processFrontMatter). D-edge-04 lc-language never overwritten when set. autoMigrateOnOpen=false defensive no-I/O. force=true override (D-auto-03). Backup-throws → vault.process never called. vault.process-throws → processFrontMatter never called.

### `tests/widget/migration.property.test.ts` (NEW, 298 LOC, 567 tests)

169-case cartesian-product corpus (LANG_SLUGS × HOSTILE_BODIES × CRLF × lc-language variants). Verifies four D-fixtures-02 invariants:
- **body-preservation:** `extractFenceBody(migrated, 0) === preMigrationBody` byte-exact.
- **frontmatter preservation:** every `lc-*` key (other than `lc-language` when missing pre-migration) is byte-identical post-migration.
- **idempotency:** second `migrateLegacyFenceIfNeeded` call returns false; spy counts === 1.
- **backup-correctness:** `adapter.write` spy received pre-migration text byte-exact.

### `tests/widget/fenceSerialization.property.test.ts` (MODIFIED, +151 LOC)

New `describe('rewriteFenceOpenerTag — body preservation')` block. SHELLS_LEGACY × HOSTILE_BODIES drives 110 generated cases across 2 invariants (body byte-exact + non-fence-opener portion unchanged) plus 6 spot-check cases (manual byte-exact, idempotency, no-`## Code`, no-fence, section-boundary, CRLF round-trip).

## Test Coverage

| Test Suite | Tests | Pass |
|------------|-------|------|
| `tests/widget/fenceSerialization.property.test.ts` | 164 (48 baseline + 116 new) | ✓ |
| `tests/widget/fenceMigrator.test.ts` | 58 | ✓ |
| `tests/widget/migration.property.test.ts` | 567 | ✓ |
| **Plan 21-01 contribution** | **741 new tests** | **All pass** |
| Full project suite | 2858 / 2864 (6 skipped, unchanged) | ✓ |

## Behavior Truths Verified

All `must_haves.truths` from PLAN.md frontmatter are upheld:

- ✓ `isMigrationCandidate` 5-clause AND-gate (verified across 18 alias + 6 unrecognized + edge tests).
- ✓ Body byte-exact via `rewriteFenceOpenerTag` SSoT delegation (110+ property cases).
- ✓ Backup written BEFORE rewrite (T-21-backup); spy ordering asserted via `mock.invocationCallOrder`.
- ✓ `migrate(migrate(note))` returns false on second call (idempotency property test).
- ✓ Missing/empty `lc-language` filled via `processFrontMatter` in same atomic flow; existing values never overwritten (D-edge-04).
- ✓ NO Plugin.onload import / NO registerEvent / NO vault.modify (audit greps return 0 non-comment matches).
- ✓ `opts.force=false` AND `opts.autoMigrateOnOpen=false` skips ALL I/O.
- ✓ Strict-match predicate property-tested over corpus: text/bash/pseudo/empty fence tags MUST NOT migrate.

## Open Question §1 — `vault.process` + `processFrontMatter` ordering

**Status: OPEN.** Plan 21-01 does NOT execute the dev-vault probe; Plan 21-02 owns the integration smoke per RESEARCH §"Project Constraints".

The orchestrator is resilient to either outcome:

- **Single-frame ordering** (most likely): the existing single-arm `selfWriteSuppression` covers both writes. No additional plumbing needed in mount-path (Plan 21-02).
- **Two-frame ordering** (fallback): the Phase 19 C-04 hash-arm pattern (`src/widget/selfWriteSuppression.ts:42-91`) is already in tree. Plan 21-02 would `arm()` twice — once with the post-rewrite hash before `vault.process`, once with the post-frontmatter-fill hash before `processFrontMatter`. Pattern S-03.

Either way, this plan's `migrateLegacyFenceIfNeeded` orchestrator does not need to change — the suppression-arming lives in the mount-path caller (Plan 21-02), not in the migrator. The migrator's contract is: "I call vault.process and processFrontMatter atomically and return when both have settled."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — TS strict-mode build error] Test file App-shape type mismatch**
- **Found during:** Task 2 verification — `npm run build` failed.
- **Issue:** `tests/widget/migration.property.test.ts` constructs a typed mock App object literal and passes it directly to `migrateLegacyFenceIfNeeded(app, file, ...)`. TypeScript strict-mode rejects: "Type ... is missing the following properties from type 'App': keymap, scope, workspace, lastEvent, and 5 more."
- **Fix:** Added `import type { App, TFile } from 'obsidian'` and cast both `app` and `file` via `unknown as App` / `unknown as TFile` at the makeMockApp return. Mirror's the same pattern used by tests/widget/fenceMigrator.test.ts (which uses untyped `any` returns and was unaffected). No runtime behavior change.
- **Files modified:** tests/widget/migration.property.test.ts
- **Commit:** b0baf79 (combined with the GREEN feat for fenceMigrator)

### Architectural Changes

None — the plan was implemented exactly as specified. All decisions D-edge-01..04, D-backup-01..02, D-trigger-01 followed verbatim.

## Authentication Gates

None encountered.

## Threat Mitigations Confirmed

| Threat ID | Mitigation Verified |
|-----------|---------------------|
| T-21-bytes | 110+ property-test cases asserting `extractFenceBody(migrated, 0) === preBody` byte-exact via SSoT delegation to rewriteFenceOpenerTag. |
| T-21-backup | `mock.invocationCallOrder` assertion: `adapterWrite.invocationCallOrder[0] < vaultProcess.invocationCallOrder[0]`. Backup-throws test confirms vault.process is NEVER called when backup fails. |
| T-21-atom | `mock.invocationCallOrder`: `vaultProcess < processFrontMatter` for the missing-lc-language case. |
| T-21-strict | `describe('isMigrationCandidate')` exhausts the 5-clause predicate over 28+ cases (18 recognized + 6 unrecognized + empty + null lc-slug + numeric lc-slug + no-Code-heading + no-closer + EOF-before-closer + multi-H2). |
| T-21-load | `grep -E 'Plugin\.onload\|registerEvent\|registerInterval' src/widget/fenceMigrator.ts` returns 0 non-comment matches. |
| T-21-bytes-CRLF | CRLF round-trip cases in both fenceSerialization.property.test.ts (`SHELLS_LEGACY[2]` uses `\r\n` throughout) and migration.property.test.ts (CRLF flag varies in cartesian product). |

## Verification Audit

| Check | Command | Result |
|-------|---------|--------|
| Property test (Task 1) | `npm test -- --run tests/widget/fenceSerialization.property.test.ts` | ✓ 164 pass |
| Migrator + property (Task 2 + 3) | `npm test -- --run tests/widget/fenceMigrator.test.ts tests/widget/migration.property.test.ts` | ✓ 625 pass |
| TypeScript strict-mode | `npm run build` | ✓ exit 0 |
| Module audit | `grep -E 'Plugin\.onload\|registerEvent\|registerInterval' src/widget/fenceMigrator.ts \| grep -v '^\s*//' \| grep -v '^\s*\*'` | ✓ 0 matches |
| vault.modify audit | `grep -E 'vault\.modify\b' src/widget/fenceMigrator.ts` | ✓ 0 matches |
| app.plugins.plugins audit | `grep -E "plugins\['obsidian-leetcode'\]" src/widget/fenceMigrator.ts \| grep -v '^//'` | ✓ 0 matches (only comment reference stating we DO NOT reach) |
| Full project regression | `npm test` | ✓ 2858 pass / 6 skipped |

## API Surface for Plan 21-02

Plan 21-02 mount integration imports:

```typescript
import {
  migrateLegacyFenceIfNeeded,
  isMigrationCandidate,
  writeBackup,  // unlikely but available
} from '../widget/fenceMigrator';
```

Wiring shape (from PATTERNS.md S-06):

```typescript
// In codeBlockProcessor.ts (Reading mode):
if (
  hasLcSlug &&
  plugin.settings.getUseInlineWidget?.() === true &&
  plugin.settings.getAutoMigrateOnOpen?.() === true
) {
  const migrated = await migrateLegacyFenceIfNeeded(plugin.app, file, {
    autoMigrateOnOpen: true,
    defaultLanguage: plugin.settings.getDefaultLanguage(),
  });
  // ... mount logic
}

// Banner path when autoMigrateOnOpen=OFF:
if (
  hasLcSlug &&
  plugin.settings.getUseInlineWidget?.() === true &&
  plugin.settings.getAutoMigrateOnOpen?.() !== true &&
  isMigrationCandidate(source, fm)
) {
  mountLegacyFenceBanner(el, source, file, plugin);
  return;
}
```

The migrator's `opts` shape is fully covered by the call sites above. No further refactor needed.

## TDD Gate Compliance

This plan followed RED → GREEN cycle for both tasks:

| Task | RED commit | GREEN commit |
|------|-----------|--------------|
| Task 1 — rewriteFenceOpenerTag | `6828a88` test(21-01): add property-test corpus for rewriteFenceOpenerTag (RED) | `573c01d` feat(21-01): add rewriteFenceOpenerTag CRLF-tolerant helper (GREEN) |
| Task 2+3 — fenceMigrator + tests | `ec2771a` test(21-01): add fenceMigrator unit + property tests (RED) | `b0baf79` feat(21-01): implement fenceMigrator with strict-match + atomic write (GREEN) |

RED commits verified by running tests against missing implementation — both showed `is not a function` / module-resolution failures before GREEN landed. No REFACTOR cycle needed; the GREEN implementations were minimal and clear.

## Self-Check: PASSED

- ✓ All Task 1 acceptance criteria pass (1 export, 50+ generated cases, manual + idempotency + CRLF spot-checks).
- ✓ All Task 2 acceptance criteria pass (3 exports, signature exact, 0 forbidden imports, build green, file LOC in [180, 320]).
- ✓ All Task 3 acceptance criteria pass (469 + 298 LOC, MIGRATE-01..04 + MIGRATE-07 + isMigrationCandidate filter tests all exit 0, invocationCallOrder used 10x, > 100 property cases).
- ✓ All commits exist on branch and reachable from HEAD: `6828a88`, `573c01d`, `ec2771a`, `b0baf79`.
- ✓ Full project test suite 2858/2864 pass (6 skipped, unchanged).
- ✓ npm run build exits 0.
- ✓ No deviation beyond the single Rule 3 TS-strict-mode test-file type fix (documented above).
