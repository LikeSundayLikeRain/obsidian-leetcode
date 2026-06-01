---
phase: 21-v1-2-migration
plan: 08
subsystem: migration
tags: [migration, reading-mode, rerender, gap-closure, phase-21]
requires: [readingModeMigrationHook, MarkdownView, previewMode.rerender]
provides:
  - "Post-migration Reading-mode rerender wiring"
  - "rerenderReadingModePanes helper (exported)"
  - "rerenderPreviewLeaves DI surface on ReadingModeMigrationHookDeps"
affects: [src/main/readingModeMigrationHook.ts, src/main.ts, tests/main/readingModeMigrationTrigger.test.ts]
tech-stack:
  added: []
  patterns:
    - "DI surface on factory deps (rerenderPreviewLeaves) so production wires the App-bound helper while tests substitute a vi.fn()"
    - "Trailing .then() AFTER .finally() so rerender observes migrateInFlight already cleared (re-entrant safety)"
    - "Outer + inner try/catch on the rerender helper so failure never propagates to the migrate orchestrator (Pattern S-05 silent-on-failure)"
key-files:
  created: []
  modified:
    - src/main/readingModeMigrationHook.ts
    - src/main.ts
    - tests/main/readingModeMigrationTrigger.test.ts
decisions:
  - "Trailing .then() (after .finally clears in-flight lock) is the rerender callsite — guarantees that a re-entrant post-processor → file-open echo would not see the dedupe lock held."
  - "rerenderReadingModePanes export lives in readingModeMigrationHook.ts (sibling helper), not in a new file — minimizes surface area and keeps Reading-mode migration concerns colocated."
  - "Filter explicitly excludes non-preview leaves: Live Preview ViewPlugin already updates reactively on docChanged; rerendering it would be redundant and could cause editor-state flicker."
  - "Zero-write path: no vault.process, no processFrontMatter, no CM6 dispatch. CLAUDE.md Phase 17 D-05 + Phase 05.5 'leetcode.*' userEvent rules don't apply."
metrics:
  completed: 2026-06-01T16:30:00Z
  duration: ~10m
  tasks-completed: 2
  files-touched: 3
  tests-added: 7
  tests-total: 2963 (passing) / 2969 (incl. 6 skipped baseline)
---

# Phase 21 Plan 08: Reading-mode rerender after auto-migration (UAT Gap 1) Summary

Closes UAT Test 1 (severity: minor) — "After auto-migration in Reading mode, the v1.3 widget does not mount on the first open — the user must close and reopen the note." Adds an explicit post-migration `previewMode.rerender(true)` hand-off gated on `migrated === true` so the v1.3 widget mounts on the SAME file-open in Reading mode.

## What Changed

### 1. `src/main/readingModeMigrationHook.ts`

**`ReadingModeMigrationHookDeps`** gains one required DI field:

```ts
rerenderPreviewLeaves: (path: string) => void;
```

Tests substitute a `vi.fn()`; production wires the new `rerenderReadingModePanes` helper (below).

**Auto-migrate promise chain restructured.** The previous chain was `migrate(...).catch(...).finally(...)`. The new chain is:

1. `.then((migrated) => { migratedFlag = migrated === true })` — capture the resolved boolean.
2. `.catch((err) => { migratedFlag = false; logDebug('non-fatal failure', err) })` — rejection forces flag false; rerender skipped.
3. `.finally(() => migrateInFlight.delete(path))` — UNCONDITIONALLY clears the in-flight lock.
4. **Trailing `.then(() => if (migratedFlag) { try { rerenderPreviewLeaves(path) } catch { logDebug } })`** — fires AFTER the lock is cleared so a re-entrant post-processor → file-open echo would not see the lock held. Inner try/catch swallows rerender throws.

The OFF branch is unchanged.

**New export `rerenderReadingModePanes(app, path)`.** Walks `app.workspace.getLeavesOfType('markdown')`, filters to leaves where:

- `view` is a `MarkdownView` instance (`instanceof` gate); AND
- `view.file?.path === path`; AND
- `typeof view.getMode === 'function' && view.getMode() === 'preview'`

…and calls `view.previewMode?.rerender?.(true)` on each match. Outer + inner try/catch swallow undefined-method, throwing `rerender`, and unexpected workspace API shapes so failure never propagates back to the migrate orchestrator (Pattern S-05 silent-on-failure preserved).

### 2. `src/main.ts`

Imports updated:

```ts
import {
  makeReadingModeMigrationHandler,
  rerenderReadingModePanes,
} from './main/readingModeMigrationHook';
```

Factory call site at lines 1548–1573 now wires the production rerender:

```ts
rerenderPreviewLeaves: (path: string) =>
  rerenderReadingModePanes(this.app, path),
```

### 3. `tests/main/readingModeMigrationTrigger.test.ts`

- `wireHook(...)` extended to accept an optional `rerenderPreviewLeaves: vi.fn()` (defaulted) so all existing 8 tests continue to pass unchanged.
- `flushPromises()` tick count bumped from 3 to 8 to cover the new trailing `.then` hop.
- New `describe('Reading-mode rerender after auto-migration (Gap 1)', ...)` block with 5 tests (G1.1–G1.5).
- New `describe('rerenderReadingModePanes (Plan 21-08 Task 2)', ...)` block with 2 tests (T2.1–T2.2).

## Test Coverage

| Test | What it asserts |
|------|-----------------|
| G1.1 | ON path + `migrated === true` → rerender called exactly once with `file.path` |
| G1.2 | ON path + `migrated === false` → rerender NOT called |
| G1.3 | ON path + migrate rejects → rerender NOT called + logDebug records `/non-fatal failure/` |
| G1.4 | ON path ordering — rerender observes `migrateInFlight` already cleared |
| G1.5 | OFF path — rerender NEVER called regardless of candidate state |
| T2.1 | `rerenderReadingModePanes` walks leaves, rerenders only preview-mode + path-matching leaves with `true` |
| T2.2 | Defensive — undefined `previewMode` + throwing `rerender` swallowed; remaining healthy match still rerenders |

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Targeted suite | `npm test -- tests/main/readingModeMigrationTrigger.test.ts --run` | 15/15 passed (8 existing + 5 G1 + 2 T2) |
| TypeScript build | `npm run build` | exit 0 (tsc -noEmit + esbuild production) |
| Full suite regression | `npx vitest run` | 2963 passed / 6 skipped (baseline 2956 + 7 new) |

## Plan Done Criteria

- [x] All existing tests still pass (8 prior tests + 0 baseline regressions).
- [x] Five new G1 tests pass.
- [x] Two new T2 tests pass.
- [x] Auto-migrate branch invokes `deps.rerenderPreviewLeaves(file.path)` iff `migrate` resolves with `true`.
- [x] Never invoked on false-resolution or rejection.
- [x] Never invoked under `autoMigrateOnOpen=OFF`.
- [x] Ordering: rerender observes `migrateInFlight` already cleared (rerender swallows its own exception so the `.finally` always runs).
- [x] `rerenderReadingModePanes` exported from `src/main/readingModeMigrationHook.ts`.
- [x] `main.ts` wires the helper into the existing factory call.
- [x] Build passes (TypeScript clean).

## Deviations from Plan

**[Spec adjustment, no behavior change]** Plan `<action>` for Task 1 described two slightly conflicting orderings:

1. The TypeScript snippet showed `.then → .catch → .finally` with rerender INSIDE `.then`.
2. Test G1.4's behavior block REQUIRED rerender to observe `migrateInFlight` already cleared (i.e., AFTER `.finally`).

These are mutually exclusive — `.finally` runs after `.then`, so a `.then`-resident rerender would observe the lock still held. I chose the option that satisfies the explicit test ordering requirement (G1.4 + the prose "rerender BEFORE in-flight delete… BUT… rerenderPreviewLeaves AFTER ensuring no rejection"): a TRAILING `.then()` chained after `.finally`, with the `migratedFlag` boolean captured in the original `.then` and observed by the trailing `.then`. Both `.catch` and the inner try/catch around the rerender call ensure no exception path leaks. This is the only structurally correct way to satisfy "rerender observes cleared in-flight lock" while still gating on `migrated === true`.

**[Test infrastructure tweak]** `flushPromises()` tick count raised from 3 to 8. The previous count was sufficient for the original `.then → .catch → .finally` chain but underflushes the new `.then → .catch → .finally → .then(rerender)` chain. Eight ticks gives ample slack for any future extension and adds zero observable runtime cost (immediate microtask resolution).

No Rule-1 bugs found. No Rule-2 missing critical functionality. No Rule-3 blocking issues. No Rule-4 architectural changes.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None — the new code path performs ZERO writes (no fence body, no frontmatter, no CM6 dispatch). It only triggers Obsidian's preview rerender via a documented API. The CLAUDE.md "Phase 17 D-05 canonical write-path pattern" does not apply (no write). The Phase 05.5 `'leetcode.*'` userEvent annotation rule does not apply (no CM6 dispatch). Plan's existing `<threat_model>` (T-21-08-01..03) is fully addressed:

- **T-21-08-01 (DoS — rerender loop):** Mitigated. Filter is path-matching + preview-mode only; never blanket-rerenders all leaves; gated on `migrated === true` so no spurious work on no-op opens.
- **T-21-08-02 (Tampering — previewMode contract):** Accepted. `previewMode.rerender(true)` is the same API the plugin reload path uses; outer + inner try/catch swallow undefined-method or throw cases.
- **T-21-08-03 (Information Disclosure — debug log):** Accepted. Only logs `err` at debug level; no PII.

## Self-Check: PASSED

| Claim | Verification |
|-------|--------------|
| Task 1 commit `8e4f1a2` exists | `git log --oneline --all \| grep -q 8e4f1a2` → present |
| Task 2 commit `35b03c0` exists | `git log --oneline --all \| grep -q 35b03c0` → present |
| `src/main/readingModeMigrationHook.ts` modified | `git diff 274fa55..HEAD -- src/main/readingModeMigrationHook.ts \| wc -l` → non-zero |
| `src/main.ts` modified | `git diff 274fa55..HEAD -- src/main.ts \| wc -l` → non-zero |
| `tests/main/readingModeMigrationTrigger.test.ts` modified | `git diff 274fa55..HEAD -- tests/main/...` → non-zero |
| Targeted test suite passes | `npm test -- tests/main/readingModeMigrationTrigger.test.ts --run` → 15/15 |
| Full project test suite passes | `npx vitest run` → 2963 passed / 6 skipped |
| TypeScript build clean | `npm run build` → exit 0 |
