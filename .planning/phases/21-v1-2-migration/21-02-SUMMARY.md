---
phase: 21-v1-2-migration
plan: 02
subsystem: widget/migration + settings + lifecycle
tags: [migration, mount, settings, banner, command-palette, ux]
requires:
  - src/widget/fenceMigrator.ts (Plan 21-01: migrateLegacyFenceIfNeeded, isMigrationCandidate)
  - src/widget/codeBlockProcessor.ts (existing Reading-mode handler)
  - src/widget/liveModeViewPlugin.ts (existing Live Preview ViewPlugin)
  - src/settings/SettingsStore.ts (PluginData / DEFAULT_DATA / shape-guard / accessors)
  - src/settings/SettingsTab.ts (Experimental subsection / addToggle pattern)
  - src/main.ts (addCommand pattern, isValidSlug)
  - src/shared/logger.ts (logger.debug — Pattern S-05)
provides:
  - "src/widget/legacyFenceBanner.ts: mountLegacyFenceBanner (3-mode DOM + click handler)"
  - "src/settings/SettingsStore.ts: getAutoMigrateOnOpen / setAutoMigrateOnOpen + autoMigrateOnOpen field"
  - "src/widget/codeBlockProcessor.ts: pre-mount migration gate (auto path + manual-prompt banner path)"
  - "src/widget/liveModeViewPlugin.ts: AutoMigratingBannerWidget + fire-and-forget migration on fence.kind === 'legacy'"
  - "src/main.ts: addCommand({ id: 'migrate-current-note' }) — D-auto-03 escape hatch"
affects:
  - src/settings/SettingsTab.ts (added Experimental Auto-migrate toggle)
  - tests/solve/mocks/fakeSettingsStore.ts (added getAutoMigrateOnOpen / setAutoMigrateOnOpen stubs)
  - tests/ai/settingsTab.test.ts (added stub for new getter)
  - .planning/phases/21-v1-2-migration/21-02-DEV-VAULT-PROBE.md (NEW — deferred Task 4 protocol)
tech-stack:
  added: []
  patterns:
    - "Pattern S-05 silent-on-failure orchestrator try/catch (banner click handler + auto-path gate + Live Preview fire-and-forget)"
    - "Pattern S-06 dependency-injected settings (defaultLanguage threaded through every dispatch site)"
    - "Pattern S-07 no-innerHTML DOM construction (createEl + text option + happy-dom fallback)"
    - "vi.hoisted pattern for vi.mock factories that reference local spies (TDZ avoidance)"
    - "Decoration.replace + WidgetType bridge for synchronous Live Preview banner mount during async migration window (D-trigger-01 invariant)"
    - "Module-level Set dedup (migrateInFlight) to prevent duplicate I/O across update() passes inside the migration window"
key-files:
  created:
    - src/widget/legacyFenceBanner.ts
    - tests/widget/legacyFenceBanner.test.ts
    - tests/widget/codeBlockProcessor.phase21.test.ts
    - tests/settings/auto-migrate-on-open.test.ts
    - .planning/phases/21-v1-2-migration/21-02-DEV-VAULT-PROBE.md
  modified:
    - src/settings/SettingsStore.ts
    - src/settings/SettingsTab.ts
    - src/widget/codeBlockProcessor.ts
    - src/widget/liveModeViewPlugin.ts
    - src/main.ts
    - tests/solve/mocks/fakeSettingsStore.ts
    - tests/ai/settingsTab.test.ts
decisions:
  - "Empirical resolution of RESEARCH Open Question §1 (vault.process + processFrontMatter ordering) DEFERRED. Task 4 dev-vault probe is human-blocked and cannot run inside a headless executor; the executor applied the orchestrator's auto-resume default `single-frame` per plan-specific notes. If a future dev-vault session observes two-frame ordering, Task 5 wiring (selfWriteSuppression hash-arm fallback) is a follow-up via /gsd-execute-phase 21 --gaps-only."
  - "Test 7 frontmatter byte-layout capture (`tests/fixtures/migration/.obsidian-shim-validation.txt`) is `shim_validation=skipped`. Plan 21-04 Task 3 BLOCKER 4 inherits the requirement to run its own capture step (or wait for a follow-up dev-vault session) before authoring `*.expected.md` fixtures."
  - "Live Preview legacy-kind branch mounts an inline AutoMigratingBannerWidget (Decoration.replace + WidgetType) BEFORE firing the async migration call — preserves D-trigger-01's 'never a no-widget transitional state' invariant. The banner widget delegates DOM construction to legacyFenceBanner.ts in mode='auto-migrating' so the Reading-mode and Live Preview paths share one DOM construction primitive."
  - "module-level migrateInFlight Set in liveModeViewPlugin.ts dedupes concurrent update() passes during the ~10–50ms migration window. Without it, the synchronous update() would re-fire migration on every doc-change/viewport tick while the previous call is still resolving, producing wasted reads + candidate scans (the orchestrator is idempotent so the I/O is safe but duplicative)."
  - "isMigrationCandidate consumes ctx.getSectionInfo(el)?.text in Reading mode to access the FULL note text (not just the fence body in `source`). When section info is null (degenerate path), the manual-prompt banner branch is skipped and the existing render-child path applies."
  - "Settings access in codeBlockProcessor + liveModeViewPlugin is null-safe — `settings?.getUseInlineWidget?.()` short-circuits when test fixtures omit the settings field. Preserves backward-compat with existing codeBlockProcessor.test.ts fixtures that exercise mount-only paths."
  - "Banner mode is REQUIRED parameter (not optional) — caller MUST pass one of three modes per Plan 21-02 Task 2 behavior. The Reading-mode autoMigrateOnOpen=OFF path passes 'manual-prompt'; Live Preview during migration window passes 'auto-migrating'; 'read-only-legacy' is reserved."
  - "Dev-vault probe protocol committed verbatim to 21-02-DEV-VAULT-PROBE.md so a future human can resume cleanly via gaps-only re-run."
metrics:
  duration: 920s
  completed: 2026-06-01T16:30:00Z
  tasks: 4
  files: 12
---

# Phase 21 Plan 21-02: Mount Integration + Auto-Migrate Setting Summary

Wires the Plan 21-01 fenceMigrator foundation into both widget mount paths
(Reading mode + Live Preview), adds the user-visible `autoMigrateOnOpen`
toggle in Experimental settings, mounts a manual-prompt banner with a
[Migrate now] CTA when the toggle is OFF, and ships a `Migrate current
note` command palette entry as a keyboard escape hatch. The Live Preview
path mounts an `auto-migrating` banner widget on the legacy fence range
during the async migration window so the user never sees a 'no widget'
transitional state per D-trigger-01. Implements MIGRATE-06.

## What Shipped

### Task 1 — Settings field + toggle UI (commit `5621d03`)

- `src/settings/SettingsStore.ts` adds `autoMigrateOnOpen: boolean` to
  `PluginData` (mirrors `useInlineWidget` shape), DEFAULT_DATA entry
  (`true`), shape-guard at load (non-boolean / missing / corrupt collapses
  to `true`), and `getAutoMigrateOnOpen()` / `setAutoMigrateOnOpen()`
  accessors.
- `src/settings/SettingsTab.ts` adds the toggle UI in the Experimental
  subsection (after the `useInlineWidget` toggle): label
  "Auto-migrate v1.2 notes when opened" + description copy + onChange
  handler that ONLY persists (no reload required — live-applies on next
  file open).
- `tests/settings/auto-migrate-on-open.test.ts` ships 8 tests covering
  default, persistence + reload round-trip, and shape-guard against
  corrupt data.json values (string `'yes'`, null, number, boolean
  literals, undefined).

### Task 2 — legacyFenceBanner.ts (commits `b2946ee` RED + `a3a5e09` GREEN)

- `src/widget/legacyFenceBanner.ts` (138 LOC) — single export
  `mountLegacyFenceBanner(host, source, file, plugin, mode)` with three
  render branches:
  - `'manual-prompt'` — banner copy "This note uses the v1.2 format." +
    `[Migrate now]` button + read-only `<pre><code>` rendering of
    `source` byte-exact.
  - `'auto-migrating'` — banner copy "Migrating note to v1.3 format..."
    only; no button, no read-only display. Used by Live Preview during
    the migration window.
  - `'read-only-legacy'` — static `<pre><code>` only; no banner.
    Reserved for unmigratable shapes; currently unused.
- Click handler dispatches `migrateLegacyFenceIfNeeded(plugin.app, file,
  { force: true, autoMigrateOnOpen: true, defaultLanguage: ... })` —
  `force: true` bypasses the autoMigrateOnOpen setting per D-auto-02.
  Pattern S-05 silent-on-failure: try/catch + logger.debug + leave
  banner mounted.
- Pattern S-07 no-innerHTML: `host.createEl(tag, { text, cls })` first;
  happy-dom fallback to `document.createElement(tag) + textContent`
  (mirrors `renderStaticFallback` in `src/widget/codeBlockProcessor.ts:42-69`).
- `tests/widget/legacyFenceBanner.test.ts` (8 tests, vi.hoisted spy
  pattern) covers all three modes, click dispatch, byte-exact source
  preservation, host-empty-before-render invariant, and
  defaultLanguage fallback.

### Task 3 — Mount integration + command palette (commits `76be972` RED + `3ec30ec` GREEN)

- `src/widget/codeBlockProcessor.ts` adds the pre-mount migration gate
  AFTER `hasLcSlug` derivation but BEFORE the existing embed/RenderChild
  dispatch. Two paths:
  - **Auto path** (`useInlineWidget=ON` + `autoMigrateOnOpen=ON`):
    `await migrateLegacyFenceIfNeeded(...)` → on success
    `renderStaticFallback(el, source)` and return early. The
    `vault.on('modify')` event re-fires the post-processor on the
    rewritten fence and the v1.3 widget mounts in that next cycle.
  - **Banner path** (`useInlineWidget=ON` + `autoMigrateOnOpen=OFF` +
    `isMigrationCandidate(sectionText, fm)`): `mountLegacyFenceBanner(el,
    source, file, plugin, 'manual-prompt')`.
  - Defensive try/catch around the await (Pattern S-05 — migration must
    NOT block file open).
  - Handler signature widens to `async/Promise<void>`.

- `src/widget/liveModeViewPlugin.ts` adds the `AutoMigratingBannerWidget`
  (Decoration.replace + WidgetType inheriting from
  `@codemirror/view`) and branches on `fence.kind === 'legacy'` in
  `buildLeetCodeFenceRanges`. When the master gate + auto-migrate gate
  are ON, builds an `AutoMigratingBannerWidget` decoration on the
  legacy fence range BEFORE firing the async
  `void migrateLegacyFenceIfNeeded(...).catch(...).finally(...)` call
  (Pitfall 6 — update() is synchronous). Banner unmounts on the next
  update() cycle when `vault.on('modify')` fires after the migration
  resolves (fence.kind becomes 'leetcode-solve' and the existing widget
  mount path takes over).
  - Module-level `migrateInFlight: Set<string>` dedupes update() passes
    that fire while a migration is still resolving for the same file
    path.

- `src/main.ts` adds the `migrate-current-note` command palette entry
  alongside the existing `refresh-current-problem` block.
  `editorCheckCallback` self-gates on `useInlineWidget=ON` +
  `isValidSlug(fm['lc-slug'])`; on confirm dispatches with `force: true`
  and threads the user's `defaultLanguage`. Plugin-store rules: id
  has no 'leetcode' or 'command' substring; sentence-case name; no
  `hotkeys` field.

- `tests/widget/codeBlockProcessor.phase21.test.ts` ships 4 integration
  cases covering auto-migrate-on path, banner-mount path, useInlineWidget=OFF
  passthrough, and candidate-rejects fallthrough.
- `tests/solve/mocks/fakeSettingsStore.ts` + `tests/ai/settingsTab.test.ts`
  add `getAutoMigrateOnOpen` / `setAutoMigrateOnOpen` stubs so the
  pre-existing settings-tab tests render the new toggle row without
  TypeError.

### Task 4 — Dev-vault probe (commit `0c60bc5`, deferred to live Obsidian)

- `.planning/phases/21-v1-2-migration/21-02-DEV-VAULT-PROBE.md` documents
  the 11-step protocol verbatim from `21-02-PLAN.md` Task 4
  `<how-to-verify>`. The probe is human-blocked by design (revision-pass
  WARNING 2): Obsidian's render-frame ordering for `vault.process` +
  `processFrontMatter` modify events is observable only inside a live
  Obsidian runtime, and the Test 7 frontmatter byte-layout capture is
  sourced from Obsidian's own `fileManager.processFrontMatter`
  reconstruction.
- Auto-resume defaults applied per orchestrator plan-specific notes:
  - Axis 1 (Test 2 frame ordering): **`single-frame`**
  - Axis 2 (Test 7 shim validation): **`shim_validation=skipped`**
- Empirical resolution of RESEARCH Open Question §1 (vault.process +
  processFrontMatter ordering): **DEFERRED** to a future dev-vault
  session. The orchestrator's `migrateLegacyFenceIfNeeded` is resilient
  to either outcome; if two-frame ordering is later observed, Task 5
  wiring is a gaps-only follow-up.

### Task 5 — Conditional hash-arm fallback (SKIPPED per gate)

Task 5's gate is `blocking_when=probe_two_frame`. With Task 4's
auto-resume default `probe_result=single_frame`, Task 5 is **SKIPPED**
per the conditional-execution contract. No code in
`src/widget/fenceMigrator.ts` was modified for hash-arm wiring. If a
future dev-vault session observes two-frame ordering, Task 5's
selfWriteSuppression hash-arm fallback (Phase 19 C-04 pattern) lands as
a gaps-only follow-up.

## How It Works

### Reading mode (codeBlockProcessor.ts)

```
post-processor invocation
  ↓
resolve TFile + frontmatter
  ↓
if (hasLcSlug && useInlineWidget && autoMigrateOnOpen) {
  await migrateLegacyFenceIfNeeded(...)   // synchronous from user POV
  if (migrated) renderStaticFallback() + return  // vault.on('modify') re-fires
}
  ↓
if (hasLcSlug && useInlineWidget && !autoMigrateOnOpen
    && isMigrationCandidate(ctx.getSectionInfo(el).text, fm)) {
  mountLegacyFenceBanner(..., 'manual-prompt') + return  // banner with [Migrate now]
}
  ↓
existing path (embed / RenderChild) — unchanged
```

The user sees the v1.3 widget on first open (auto-on) or the banner
(auto-off); never raw markdown on a v1.2 fence.

### Live Preview (liveModeViewPlugin.ts)

```
ViewPlugin update() — synchronous
  ↓
findCodeFence(view.state, { preferLeetCodeSolve: true })
  ↓
fence.kind === 'legacy' && useInlineWidget && autoMigrateOnOpen:
  builder.add(legacyRange, Decoration.replace({ widget: AutoMigratingBannerWidget(...) }))
  void migrateLegacyFenceIfNeeded(...).catch(...).finally(...)   // fire-and-forget
  return builder.finish()
  ↓
fence.kind === 'leetcode-solve':
  existing widget mount path — unchanged
  ↓
vault.on('modify') fires after migration → CM6 re-runs update() →
  fence is now leetcode-solve → v1.3 widget mounts → banner gone
```

The banner widget bridges the ~10–50ms migration window; D-trigger-01
invariant ("never a no-widget transitional state") preserved.

### Command palette

`Cmd-P` → "Migrate current note" → editorCheckCallback returns true iff
`useInlineWidget=ON` + lc-slug present → on confirm,
`migrateLegacyFenceIfNeeded(app, file, { force: true, ... })`. force=true
bypasses the autoMigrateOnOpen gate but NOT the strict-match predicate
(per Plan 21-01 orchestrator contract).

## Verification

- `npm run build` — exits 0 (TypeScript strict-mode passes).
- `npx vitest run` — 2878 passed / 6 skipped (pre-existing) / 0 failed.
- All Plan 21-02 grep gates green:
  - `grep -c 'autoMigrateOnOpen' src/settings/SettingsStore.ts` = 8 (>=5).
  - `grep -c 'getAutoMigrateOnOpen' src/settings/SettingsStore.ts` >= 1.
  - `grep -c 'setAutoMigrateOnOpen' src/settings/SettingsStore.ts` >= 1.
  - `grep -c 'Auto-migrate v1.2 notes when opened' src/settings/SettingsTab.ts` = 1.
  - `grep -c '^export function mountLegacyFenceBanner' src/widget/legacyFenceBanner.ts` = 1.
  - `grep -c 'migrateLegacyFenceIfNeeded' src/widget/legacyFenceBanner.ts` >= 1.
  - `grep -c 'force:\\s*true' src/widget/legacyFenceBanner.ts` >= 1.
  - `grep -c 'migrateLegacyFenceIfNeeded' src/widget/codeBlockProcessor.ts` >= 1.
  - `grep -c 'mountLegacyFenceBanner' src/widget/codeBlockProcessor.ts` >= 1.
  - `grep -c 'isMigrationCandidate' src/widget/codeBlockProcessor.ts` >= 1.
  - `grep -c 'migrateLegacyFenceIfNeeded' src/widget/liveModeViewPlugin.ts` >= 1.
  - `grep -c 'void migrateLegacyFenceIfNeeded' src/widget/liveModeViewPlugin.ts` >= 1.
  - `grep -c 'auto-migrating' src/widget/liveModeViewPlugin.ts` >= 1.
  - `grep -c "id: 'migrate-current-note'" src/main.ts` = 1.
  - `grep -c "name: 'Migrate current note'" src/main.ts` = 1.
- CLAUDE.md `## Conventions` paragraphs (`'leetcode.*'` userEvent +
  Canonical plugin write-path pattern) UNCHANGED — Phase 22 boundary
  preserved.
- No `'leetcode.*'` userEvent dispatches added in this phase. Migration
  runs at the vault layer (`vault.process` + `processFrontMatter`)
  BEFORE widget mount; no CM6 dispatch path is involved (Pattern S-04).

## Deviations from Plan

### Auto-resolved per orchestrator plan-specific notes

**1. [Rule 4 — Architectural deferral] Task 4 dev-vault probe deferred
to a future live Obsidian session.**
- **Rationale:** The probe is `checkpoint:human-verify` with
  `gate="blocking"`. Headless executors cannot exercise it (Obsidian
  render-frame ordering + frontmatter byte-layout reconstruction are
  observable only at runtime). Per the orchestrator's plan-specific
  notes the executor records the auto-resume defaults and proceeds.
- **Records:** Axis 1 = `single-frame`, Axis 2 = `shim_validation=skipped`.
- **Follow-up:** A future human runs the protocol from
  `.planning/phases/21-v1-2-migration/21-02-DEV-VAULT-PROBE.md` and
  re-runs `/gsd-execute-phase 21 --gaps-only` if either axis flips.

**2. [Rule 4 — Conditional gate] Task 5 SKIPPED.**
- Conditional gate is `blocking_when=probe_two_frame`. With Axis 1
  defaulted to `single-frame`, Task 5 does not execute. No
  fenceMigrator.ts modifications were made for hash-arm wiring.

### Auto-fixed during execution

**1. [Rule 3 — Test infrastructure]** `vi.mock` factory referencing a
local `migrateSpy` fails with TDZ ReferenceError. Fixed via `vi.hoisted`
pattern (legacyFenceBanner.test.ts + codeBlockProcessor.phase21.test.ts).

**2. [Rule 1 — Bug]** Initial `legacyFenceBanner.ts` was 188 LOC
(over the plan's 150-line ceiling). Tightened helper functions
(`empty`, `mk`, `renderReadOnly`) without changing semantics → 138 LOC.

**3. [Rule 1 — Bug]** First-pass `codeBlockProcessor.ts` Phase 21 gate
called `plugin.settings.getUseInlineWidget?.()` directly; pre-existing
codeBlockProcessor.test.ts fixtures omit `plugin.settings`, producing
`Cannot read properties of undefined`. Fixed by introducing a local
`const settings = plugin.settings;` binding and chaining all access via
optional chaining (`settings?.getUseInlineWidget?.()`).

**4. [Rule 3 — Test infrastructure]** Pre-existing
`tests/settings/SettingsTab.knowledge-graph.test.ts` and
`tests/ai/settingsTab.test.ts` failed with
`getAutoMigrateOnOpen is not a function` because their fake settings
store didn't expose the new method. Fixed by adding the new accessors
to `tests/solve/mocks/fakeSettingsStore.ts` (used by the knowledge-graph
test) and stubbing them in the AI settings test fixture.

**5. [Rule 1 — Bug]** Banner DOM construction needs the FULL note text
to gate via `isMigrationCandidate` (the predicate walks for
`## Code` heading); the post-processor receives only the fence body in
`source`. Fixed by reading `ctx.getSectionInfo(el)?.text` for the
candidate scan; when section info is null (degenerate path), the banner
branch is skipped and the existing render-child logic handles the
embed/no-info cases.

## Threat Flags

None — the implementation matches the Plan 21-02 `<threat_model>`
register exactly. No new network surface, no new auth paths, no new
file access patterns at trust boundaries.

## Known Stubs

None — every code path is wired end-to-end. The only deferred work is
the live-Obsidian dev-vault probe (Task 4), which is not a code stub
but a human verification step documented separately.

## Self-Check: PASSED

- [x] `src/widget/legacyFenceBanner.ts` exists (138 LOC).
- [x] `tests/widget/legacyFenceBanner.test.ts` exists (8 tests).
- [x] `tests/widget/codeBlockProcessor.phase21.test.ts` exists (4 tests).
- [x] `tests/settings/auto-migrate-on-open.test.ts` exists (8 tests).
- [x] `.planning/phases/21-v1-2-migration/21-02-DEV-VAULT-PROBE.md` exists.
- [x] Commit `5621d03` (Task 1) present.
- [x] Commit `b2946ee` (Task 2 RED) present.
- [x] Commit `a3a5e09` (Task 2 GREEN) present.
- [x] Commit `76be972` (Task 3 RED) present.
- [x] Commit `3ec30ec` (Task 3 GREEN) present.
- [x] Commit `0c60bc5` (Task 4 deferred-probe) present.
- [x] `npm run build` exits 0.
- [x] `npx vitest run` — 2878 passed / 0 failed.
- [x] CLAUDE.md `## Conventions` paragraphs UNCHANGED.

## Command Palette Reference (for Phase 22 polish)

- **id:** `migrate-current-note`
- **name:** `Migrate current note`
- **gate:** `editorCheckCallback` returns true iff
  `useInlineWidget=ON` + `isValidSlug(fm['lc-slug'])`.
- **dispatch:** `migrateLegacyFenceIfNeeded(app, file, { force: true,
  autoMigrateOnOpen: true, defaultLanguage })` with silent on-failure.

Phase 22 (POLISH-01) flips the master `useInlineWidget` default to ON
and may relax the gate; this command's id and name are stable.

## TDD Gate Compliance

This is a `type: execute` plan (not `type: tdd`), so the plan-level
RED/GREEN/REFACTOR sequence does not apply. Per-task TDD discipline was
followed for tasks marked `tdd="true"`:

- Task 1: settings field + UI + 8 tests (committed in one feat — tests
  existed alongside the implementation; settings round-trip is
  declarative and there's no behavioral surface to RED/GREEN separately).
- Task 2: RED commit `b2946ee` (8 failing tests) → GREEN commit `a3a5e09`
  (banner implementation lands, all 8 pass).
- Task 3: RED commit `76be972` (4 cases, 2 failing on the new gate
  behavior, 2 passing because they exercise the legacy path) → GREEN
  commit `3ec30ec` (gate wired, 4 cases pass).
