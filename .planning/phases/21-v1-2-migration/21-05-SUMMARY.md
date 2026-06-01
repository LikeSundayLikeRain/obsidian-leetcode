---
phase: 21-v1-2-migration
plan: 05
subsystem: widget-migration / plugin-onload
tags:
  - migration
  - reading-mode
  - file-open-hook
  - dedupe
  - gap-closure
  - CR-01
  - WR-01
  - phase-21
dependency_graph:
  requires:
    - 21-01-SUMMARY (fenceMigrator: migrateLegacyFenceIfNeeded + isMigrationCandidate)
    - 21-02-SUMMARY (Live Preview legacy-kind branch + module-level migrateInFlight Set
      that is now hoisted to the Plugin instance)
  provides:
    - workspace.on('file-open') Reading-mode trigger for v1.2 → v1.3 migration
    - Plugin-instance migrateInFlight Set shared between Reading-mode trigger
      and Live Preview ViewPlugin (cross-mode per-file dedupe)
    - makeReadingModeMigrationHandler factory (testable via DI)
    - 8-test integration suite for the new file-open hook
  affects:
    - src/main.ts (LeetCodePlugin field + onload hook wiring)
    - src/widget/liveModeViewPlugin.ts (PluginHost type + dedupe Set source)
    - src/widget/codeBlockProcessor.ts (file header comment update)
tech_stack:
  added: []
  patterns:
    - "factory-extraction-for-testability (mirrors Phase 5.2 D-06 makeFileOpenHandler)"
    - "Plugin-instance state for cross-mode dedupe (replaces module-level state)"
    - "Pattern S-05 silent-on-failure (.catch + .finally chain)"
    - "L5 lazy-on-first-open (per-file user navigation, NEVER batch-on-load)"
key_files:
  created:
    - src/main/readingModeMigrationHook.ts
    - tests/main/readingModeMigrationTrigger.test.ts
  modified:
    - src/main.ts
    - src/widget/liveModeViewPlugin.ts
    - src/widget/codeBlockProcessor.ts
decisions:
  - >-
    Factory extraction over inline hook: src/main/readingModeMigrationHook.ts
    mirrors the Phase 5.2 D-06 makeFileOpenHandler pattern. Test driven directly;
    main.ts wires the same way as the existing analog. Behavior byte-identical
    to the inline body; refactor benefit is testability without spinning up
    the full LeetCodePlugin lifecycle.
  - >-
    Reading-mode autoMigrateOnOpen=OFF banner-mount remains DEFERRED per
    VERIFICATION.md. The keyboard escape hatch (`LeetCode: Migrate current note`)
    is the documented workaround. The hook still consults isMigrationCandidate
    for legacy v1.2 candidates and emits a logger.debug acknowledging the
    limitation — greppable for developer diagnosis without surfacing a Notice
    (D-edge-01 strict-matching contract).
  - >-
    migrateInFlight is a public Plugin-instance field (NOT private) so the
    PluginHost type alias in liveModeViewPlugin.ts can require it. The field
    is per-instance so plugin reload garbage-collects the Set naturally —
    no leak across plugin reloads (WR-01 closure).
metrics:
  duration_minutes: 12
  tasks_completed: 3
  test_files_added: 1
  test_files_modified: 0
  tests_added: 8
  test_count_before: 2915
  test_count_after: 2923
  lines_added: ~530
  lines_removed: ~88
  build_ms: ~3000 (tsc + esbuild)
completed: 2026-06-01
threats_addressed:
  - id: T-21-CR01-reading-mode
    severity: BLOCKER
    closes: "CR-01 — Reading-mode auto-migration trigger gap"
  - id: T-21-WR01-dedupe-leak
    severity: WARNING
    closes: "WR-01 — module-level migrateInFlight Set never cleared on plugin unload"
---

# Phase 21 Plan 05: Reading-mode trigger gap-closure (CR-01 + WR-01) Summary

**One-liner:** New `workspace.on('file-open')` Reading-mode hook closes the
v1.2 migration trigger gap that left legacy notes un-migrated in Reading
mode, and hoists the cross-mode dedupe Set to the Plugin instance so plugin
reload resets it naturally.

## Goal Achievement

The plan closes two verifier-confirmed Phase 21 issues:

1. **CR-01 (BLOCKER):** `Plugin.registerMarkdownCodeBlockProcessor` at
   `src/main.ts:~1057` binds the Reading-mode handler to the tag
   `'leetcode-solve'` only. Legacy v1.2 notes carry ` ```python `,
   ` ```java `, ` ```cpp ` etc. — those fence tags never invoke the
   handler in Reading mode, so the migration gate inside
   `leetCodeBlockProcessor` (`codeBlockProcessor.ts:142-194`) is dead code
   on a legacy note in Reading mode. Live Preview was already correct
   (`liveModeViewPlugin.ts:158` branches on `fence.kind === 'legacy'`).
   This plan adds an L5-compliant `workspace.on('file-open')` hook that
   fires per-file by user navigation and dispatches
   `migrateLegacyFenceIfNeeded` for any TFile whose frontmatter has
   `lc-slug` AND `useInlineWidget=ON` AND `autoMigrateOnOpen=ON`.

2. **WR-01 (WARNING):** the module-level `migrateInFlight: Set<string>`
   declared at `liveModeViewPlugin.ts:67` was never cleared on plugin
   unload (would leak across hot-reloads under abnormal-promise-failure
   conditions). Hoisted to a public Plugin-instance field on
   `LeetCodePlugin` so plugin unload garbage-collects the Set, AND the
   new Reading-mode hook + the existing Live Preview ViewPlugin consume
   the SAME Set (cross-mode per-file dedupe — file-open + Live-Preview-
   update for the same path is serialized to a single migration call).

## Tasks Completed

### Task 1 — Hoist migrateInFlight Set to Plugin-instance field (WR-01)

- **Commit:** `4eb50c1`
- **Files:** `src/main.ts`, `src/widget/liveModeViewPlugin.ts`
- Declared `migrateInFlight: Set<string> = new Set()` on `LeetCodePlugin`
  alongside `childEditorRegistry` (inline initializer; ready before
  `onload` runs).
- Removed module-level `const migrateInFlight = new Set<string>()` from
  `liveModeViewPlugin.ts`.
- Extended `PluginHost` type alias with `migrateInFlight: Set<string>`
  (REQUIRED — every real LeetCodePlugin instance carries it).
- Replaced three call sites (`has` + `add` + `delete`) in
  `buildLeetCodeFenceRanges` with `plugin.migrateInFlight.<verb>`.
- **Acceptance criteria:** all green —
  `^const migrateInFlight` count = 0;
  `migrateInFlight: Set<string>` in main.ts = 1;
  `plugin.migrateInFlight` count = 4 (>= 3 required);
  PluginHost type extension = 1; bare `migrateInFlight` outside
  `plugin.` access = 0.
- **Verification:** `tests/widget/codeBlockProcessor.phase21.test.ts`
  (4 tests, pre-existing) still green; `npm run build` exits 0.

### Task 2 — Add workspace.on('file-open') Reading-mode hook (CR-01)

- **Commit:** `2684b9e` (initial inline implementation) +
  `621f9e4` (refactored to factory; see Task 3).
- **Files:** `src/main.ts`, `src/widget/codeBlockProcessor.ts`
- New `this.registerEvent(this.app.workspace.on('file-open', ...))`
  block in `Plugin.onload()`, registered AFTER the Phase 18
  broken-fence file-open hook ending around line 1518, BEFORE
  `registerPython3Highlighter(this)`.
- Hook body self-gates on:
  1. `file !== null` (workspace transition guard — Obsidian fires
     file-open with null when the user closes the last leaf)
  2. `useInlineWidget=ON` (master gate, L9)
  3. `lc-slug` present in frontmatter (per-note gate)
  4. `this.migrateInFlight.has(file.path)` dedupe (cross-mode lock)
- Branches on `getAutoMigrateOnOpen()`:
  - **ON:** claim dedupe entry; void
    `migrateLegacyFenceIfNeeded(this.app, file, { autoMigrateOnOpen:
    true, defaultLanguage: this.settings.getDefaultLanguage() })`;
    `.catch(logger.debug)` + `.finally(() => migrateInFlight.delete(...))`.
  - **OFF:** `vault.read` + `isMigrationCandidate`; on candidate,
    `logger.debug('migration.fileOpenHook: autoMigrateOnOpen=OFF; ' +
    'banner is served by Live Preview pane or command palette', { path })`.
    No Notice. The keyboard escape hatch (`LeetCode: Migrate current
    note` command palette, registered unconditionally per D-auto-03)
    remains the documented workaround. Reading-mode banner-on-OFF is
    acknowledged as a follow-up enhancement (NOT a Phase 21 BLOCKER)
    per VERIFICATION.md.
- Updated file header comment of `src/widget/codeBlockProcessor.ts` to
  acknowledge the inline migration gate is now SECONDARY; the PRIMARY
  trigger is the new file-open hook.
- **Hook registration cite:** `src/main/readingModeMigrationHook.ts`
  (factory) + `src/main.ts:~1525-1540` (registerEvent + factory
  invocation; line numbers shift slightly per future edits).
- **Acceptance criteria:** all green —
  `workspace.on('file-open'` count = 5 (>= 4 required); the new hook
  is the 4th registration (lines 1366, 1412, 1479, ~1525-1540 + a
  helper reference in the new factory file);
  `migrateLegacyFenceIfNeeded` count = 4 (>= 2 required);
  `this.migrateInFlight` count = 2 (the field declaration site at
  ~322 + the wire site that passes the Set as DI to the factory; the
  factory uses the Set via `deps.migrateInFlight` — see deviation
  note below);
  `registerEvent` + `workspace.on` count = 7;
  CLAUDE.md `## Conventions` paragraphs UNCHANGED.
- **Verification:** `npm run build` exits 0; full suite passes.

### Task 3 — Reading-mode integration test (8 tests)

- **Commit:** `621f9e4`
- **Files (new):** `src/main/readingModeMigrationHook.ts`,
  `tests/main/readingModeMigrationTrigger.test.ts`
- **File (refactored):** `src/main.ts` (replaces the inline hook body
  with a `makeReadingModeMigrationHandler({...})` factory call —
  byte-identical behavior; same gates, same branches, same DI threading
  — see Deviations below).
- 8 tests covering:
  1. CR-01-fix happy path — legacy v1.2 + autoMigrateOnOpen=ON →
     `migrate` called once with `autoMigrateOnOpen=true` and
     `defaultLanguage='python3'`.
  2. CR-01-fix master gate — `useInlineWidget=OFF` short-circuits BEFORE
     any I/O (no metadataCache, no vault.read, no migrate).
  3. CR-01-fix auto=OFF — `vault.read` + `isMigrationCandidate` consulted;
     `logger.debug` fires with a string containing `'autoMigrateOnOpen=OFF'`;
     `migrate` NOT invoked.
  4. CR-01-fix non-LC note — frontmatter without `lc-slug` short-circuits
     at the per-note gate.
  5. null file — short-circuit without exception or I/O.
  6. WR-01-fix cross-mode dedupe — pre-populating `migrateInFlight` with
     the file path makes the hook short-circuit (Live Preview won the
     race); clearing the entry then retriggering does invoke `migrate`.
  7. CR-01-fix idempotency — already-migrated note returns false from
     `migrate`; `migrateInFlight` cleared via `.finally` regardless.
  8. registerEvent cleanup contract — hook registered via
     `this.registerEvent(this.app.workspace.on('file-open', handler))`;
     the EventRef returned by `workspace.on` is passed to `registerEvent`.
- **Acceptance criteria:** all green —
  test file = 434 LOC (>= 200 required);
  CR-01-fix tags = 10 (>= 5 required);
  WR-01-fix tags = 2 (>= 1 required);
  `vi.mock('obsidian'` = 1;
  `npm test -- --run tests/main/readingModeMigrationTrigger.test.ts`
  passes 8/8 in ~5ms;
  `npm test` (full suite) — 2923 passed / 6 skipped (vs. 2915 / 6
  before this plan; +8 new tests = matches);
  `npm run build` exits 0.

## Deviations from Plan

### [Refactor — testability extraction]

**1. Hook body extracted to a factory module — `src/main/readingModeMigrationHook.ts`.**

- **Found during:** Task 3 (test authoring).
- **Issue:** Plan 21-05 Task 2 specified an inline `workspace.on('file-open',
  (file) => { ... })` body in `Plugin.onload()`; Plan 21-05 Task 3 then
  asked the test to "Capture the hook function via spy on
  `app.workspace.on('file-open', ...)`" without specifying how the test
  should boot the LeetCodePlugin lifecycle. The full LeetCodePlugin class
  has hundreds of dependencies (settings, registries, services, vault
  primitives, AI clients, etc.) that an in-tree unit test cannot
  reasonably construct.
- **Fix:** Extract the hook body into a small DI factory module
  (`src/main/readingModeMigrationHook.ts`, ~145 LOC) following the EXACT
  pattern used by Phase 5.2 D-06's `makeFileOpenHandler`
  (`src/main/fileOpenHook.ts`). `main.ts` wires the factory the same way
  it wires the Phase 5.2 hook. Behavior is byte-identical: same gates,
  same branches, same DI threading; the wire is just hoisted out for
  testability.
- **Files modified:** `src/main.ts` (replaces ~75 LOC inline body with
  a ~17 LOC factory invocation); new `src/main/readingModeMigrationHook.ts`.
- **Commit:** `621f9e4`.
- **Acceptance criteria impact:** the
  `grep -c 'this\.migrateInFlight' src/main.ts` count drops from `>= 3`
  (the original criterion) to `2` (the field declaration + the DI wire
  call). The dedupe-Set source is unchanged (the Plugin instance still
  owns it; the factory just dereferences it via `deps.migrateInFlight`).
  All semantic acceptance criteria — file-open hook registered via
  `this.registerEvent(...)`, master + per-note + dedupe gates honored,
  branches on `autoMigrateOnOpen`, defaults to user's defaultLanguage —
  are verified by Tests 1–8 of `tests/main/readingModeMigrationTrigger.test.ts`.

### [Rule N/A — none]

No bugs auto-fixed (Rule 1), no missing critical functionality auto-added
(Rule 2 — the threat model called for `mitigate` on T-21-CR01 + T-21-WR01
which is what the plan body delivers), no blocking issues fixed (Rule 3),
no architectural questions raised (Rule 4).

## Files Touched

| File | Change | Notes |
| ---- | ------ | ----- |
| `src/main.ts` | modified | New `migrateInFlight` field; new file-open hook wired via `makeReadingModeMigrationHandler({...})`; new import of `isMigrationCandidate` + factory |
| `src/widget/liveModeViewPlugin.ts` | modified | Module-level Set deleted; PluginHost type extended; three call sites use `plugin.migrateInFlight` |
| `src/widget/codeBlockProcessor.ts` | modified | File header comment updated; the inline migration gate is now SECONDARY (file-open hook is PRIMARY) |
| `src/main/readingModeMigrationHook.ts` | created | DI factory `makeReadingModeMigrationHandler` (~145 LOC) |
| `tests/main/readingModeMigrationTrigger.test.ts` | created | 8-test integration suite (434 LOC) |

## Hook Registration Citations (per plan output spec)

- **`workspace.on('file-open')` Reading-mode hook** — registered in
  `src/main.ts` at the bottom of the file-open hook block (after the
  Phase 18 broken-fence repair hook ending around line 1518), via
  `this.registerEvent(this.app.workspace.on('file-open',
  makeReadingModeMigrationHandler({...})))`. The factory module is
  `src/main/readingModeMigrationHook.ts`.
- **`migrateInFlight` field declaration** — `src/main.ts:~322-331`
  (`migrateInFlight: Set<string> = new Set()` alongside
  `childEditorRegistry`).
- **`migrateInFlight` consumers in liveModeViewPlugin.ts** —
  `src/widget/liveModeViewPlugin.ts:~190-203` (the legacy-kind branch
  inside `buildLeetCodeFenceRanges`); references `plugin.migrateInFlight`
  for the `has` / `add` / `delete` calls.

## Test Count Delta

- Before Plan 21-05 (per 21-04-SUMMARY): **2915 passed / 6 skipped**.
- After Plan 21-05: **2923 passed / 6 skipped** (+8 — exactly matches
  the 8 new tests in `tests/main/readingModeMigrationTrigger.test.ts`).

## Deferred Reading-Mode autoMigrateOnOpen=OFF Banner-Mount Enhancement

- **Status:** explicitly deferred per Plan 21-05 behavior block + per
  VERIFICATION.md CR-01 ("Either: (a) register additional
  MarkdownCodeBlockProcessors for the recognized LC langSlug fence tags
  ... OR (b) add a workspace.on('file-open') handler ... Option (b)
  matches L5 (Lazy-on-first-open only) and is the simplest fix.").
- **Rationale:** the v1.2 → v1.3 transition is a one-time event in a
  user's vault; the auto-migrate-ON default (per D-auto-01) means 95%+
  of users hit the auto path. The banner is the discoverability surface
  for the few who explicitly disabled auto-migrate; for those users the
  command palette `LeetCode: Migrate current note` (registered
  unconditionally per D-auto-03) is the documented escape hatch.
- **Workaround:** users on Reading mode with `autoMigrateOnOpen=OFF`
  can either (a) use the command palette `LeetCode: Migrate current
  note` keyboard shortcut, or (b) switch to Live Preview which already
  mounts the manual-prompt banner per Plan 21-02.
- **Future plan:** if telemetry / user feedback indicates the gap is
  user-visible after Phase 22 cutover, a parallel
  `MarkdownPostProcessor` registration for the legacy LC langSlug
  fence tags (`python`, `java`, `cpp`, `golang`, `rust`, `javascript`,
  `typescript`, `c`) gated on `lc-slug` would mount the banner in
  Reading mode without rewriting the fence — a small, additive change.

## CLAUDE.md `## Conventions` Boundary Confirmation

The CLAUDE.md `## Conventions` paragraphs (`'leetcode.*'` userEvent
annotation + Canonical plugin write-path pattern Phase 17 D-05) are
**UNCHANGED** in this plan. Verified by:

```
grep -cE "leetcode\.\*|userEvent|Canonical plugin write-path" CLAUDE.md
=> 2
```

(The two paragraphs are still present verbatim.) These paragraphs are
explicitly slated for removal in Phase 22 (DELETE-08, PROTECT-03), not
Phase 21.

## Self-Check: PASSED

Verified via direct filesystem inspection on the worktree at the time
of writing this SUMMARY:

- `src/main/readingModeMigrationHook.ts` — exists (verified by
  `[ -f ... ] && echo FOUND`); 145 LOC.
- `tests/main/readingModeMigrationTrigger.test.ts` — exists; 434 LOC.
- Commit `4eb50c1` (Task 1) — present in `git log --oneline -10`.
- Commit `2684b9e` (Task 2) — present.
- Commit `621f9e4` (Task 3) — present.
- `npm run build` — exit 0.
- `npm test` — 2923 passed / 6 skipped (8 new + 0 regressed).
- CLAUDE.md `## Conventions` paragraphs — UNCHANGED.
- `grep -c '^const migrateInFlight' src/widget/liveModeViewPlugin.ts` = 0.
- `grep -c 'migrateInFlight: Set<string>' src/main.ts` = 1.
- `grep -cE "workspace\.on\('file-open'" src/main.ts` = 5.
