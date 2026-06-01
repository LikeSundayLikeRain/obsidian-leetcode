---
phase: 21-v1-2-migration
plan: 11
subsystem: widget/cm6-state-fields
tags: [migration, banner, live-preview, statefield, cm6, gap-closure, phase-21]
requires:
  - "@.planning/phases/21-v1-2-migration/21-CONTEXT.md"
  - "@.planning/phases/21-v1-2-migration/21-HUMAN-UAT.md (Test 4b)"
  - "@src/widget/fenceLocator.ts"
  - "@src/widget/fenceMigrator.ts"
  - "@src/widget/legacyFenceBanner.ts"
  - "@src/widget/LeetCodeFenceWidget.ts"
provides:
  - "@src/widget/liveModeBannerStateField.ts (NEW): legacyBannerStateField (PHASE_22_DELETE_WITH_V1_2_PATH) + leetCodeWidgetStateField (permanent) + leetCodeFenceStateFields(plugin) Extension factory + pluginHostFacet"
  - "@src/widget/liveModeViewPlugin.ts (refactored): ViewPlugin now retains only the parent->child sync push; combined Extension array installs both StateFields before the ViewPlugin"
  - "@.planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md: Task 1 investigation document with the scope decision (fix BOTH paths)"
affects:
  - "Live Preview decoration host: line-break-spanning Decoration.replace for the legacy banner AND the v1.3 widget now flow through StateFields rather than the ViewPlugin's decorations field, satisfying CM6's documented contract."
tech-stack:
  added: []
  patterns:
    - "StateField + Facet host-resolution pattern: pluginHostFacet publishes the live plugin handle so module-level StateField.define exports can read it on every update without parameterization."
    - "PHASE_22_DELETE_WITH_V1_2_PATH retirement marker convention: marker comment block IMMEDIATELY above the v1.2-only export; sibling v1.3 export carries no marker; Phase 22 grep+delete is mechanical."
key-files:
  created:
    - src/widget/liveModeBannerStateField.ts
    - tests/widget/liveModeBannerStateField.test.ts
    - .planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md
  modified:
    - src/widget/liveModeViewPlugin.ts
decisions:
  - "Scope = fix BOTH the legacy banner AND the v1.3 widget. Task 1 investigation showed the v1.3 LeetCodeFenceWidget construct is structurally susceptible to the same CM6 contract violation; production currently masks this only because Obsidian's registerMarkdownCodeBlockProcessor('leetcode-solve', ...) pre-folds the fence body before CM6 evaluates the line-break-span condition. Migrating both paths to StateFields hardens the surface against the entire bug class."
  - "Two SEPARATE StateFields, not one branching StateField. Phase 22 deletes legacyBannerStateField + buildLegacyBannerDecorations + the entry in leetCodeFenceStateFields() mechanically via the marker grep; the v1.3 path stays untouched."
  - "pluginHostFacet pattern instead of parametric factory. Tests at the marker-placement assertion can `state.field(legacyBannerStateField)` against module-level exports; the host-aware helpers read the facet on every update."
  - "Legacy banner uses findCodeFence(state, {}) (DEFAULT first-fence behavior), not preferLeetCodeSolve: true. The flag actively skips legacy fences and would hide the very thing this StateField needs to mount on. The v1.3 widget StateField keeps preferLeetCodeSolve to ignore stray legacy fences."
  - "Side-effect (migration fire-and-forget) inside StateField.create is acceptable here because the side-effect is idempotent (gated through plugin.migrateInFlight Set), the StateField's pure return value does not depend on the side-effect result, and the side-effect was already in the prior ViewPlugin code path it replaces."
metrics:
  start_time: 2026-06-01T20:26:19Z
  end_time: 2026-06-01T20:37:30Z
  duration_seconds: 671
  tasks_completed: 3
  files_changed: 4
  tests_passing: 2965
---

# Phase 21 Plan 11: StateField migration of Decoration.replace for legacy banner + v1.3 widget Summary

**Migrated the legacy AutoMigratingBannerWidget + ManualPromptBannerWidget + the v1.3 LeetCodeFenceWidget Decoration.replace ranges out of the Live Preview ViewPlugin's `decorations` field and into two SEPARATE CM6 StateFields, eliminating the UAT 4b CM6 RangeError "Decorations that replace line breaks may not be specified via plugins" and hardening the v1.3 path against the same latent contract violation.**

## What Changed

### Created — `src/widget/liveModeBannerStateField.ts` (~330 LOC)

New module hosting two top-level CM6 `StateField.define` exports plus a `Facet`-based plugin-host bridge and an Extension factory.

- **`legacyBannerStateField`** (carries `PHASE_22_DELETE_WITH_V1_2_PATH` marker block-commented immediately above the export). When `useInlineWidget=ON` AND the file has `lc-slug` AND the first fence under `## Code` is a recognized legacy LC langSlug:
  - `autoMigrateOnOpen=ON` → emits `Decoration.replace({ widget: AutoMigratingBannerWidget })` over the multi-line legacy fence range AND fires the migration via `migrateLegacyFenceIfNeeded` (deduped through `plugin.migrateInFlight`).
  - `autoMigrateOnOpen=OFF` → emits `Decoration.replace({ widget: ManualPromptBannerWidget })` (banner copy + `[Migrate now]` button).
- **`leetCodeWidgetStateField`** (no marker — permanent v1.3 path). When the file has `lc-slug` AND the first fence is `leetcode-solve`: emits `Decoration.replace({ widget: LeetCodeFenceWidget })` over the v1.3 fence range. Identity hash via `djb2(source)`.
- Both StateFields' `provide` hooks contribute their DecorationSet to **both** `EditorView.decorations` and `EditorView.atomicRanges` Facets — so the parent cursor cannot enter either widget range.
- `pluginHostFacet` (private Facet) publishes the live `StateFieldPluginHost`. The factory `leetCodeFenceStateFields(plugin)` returns `[pluginHostFacet.of(plugin), legacyBannerStateField, leetCodeWidgetStateField]`. Both build helpers read the facet at update time.

### Refactored — `src/widget/liveModeViewPlugin.ts`

Removed the inline legacy-kind + leetcode-solve decoration build branches (formerly lines 160–235) and the entire `buildLeetCodeFenceRanges` / `AutoMigratingBannerWidget` definitions (those moved to the new module).

- The ViewPlugin (`LeetCodeLiveViewPlugin`) now contains ONLY the parent→child sync push (Plan 20-09) — the `update()` callback iterates `widgetRegistry`, dispatches the new fence body to the matching child editor with `addToHistory.of(false)` and `'leetcode.parent-sync'` userEvent.
- Public factory `leetCodeFenceViewPlugin(plugin)` now returns a combined Extension array:
  ```
  [
    ...leetCodeFenceStateFields(plugin),  // [pluginHostFacet.of, legacyBannerStateField, leetCodeWidgetStateField]
    ViewPlugin.define(...)                // parent→child sync push only
  ]
  ```
  StateFields appear before the ViewPlugin so transaction-time StateField updates fire first; the ViewPlugin's `docChanged` detection runs after StateFields have absorbed the same transaction.

### Created — `tests/widget/liveModeBannerStateField.test.ts` (9 tests)

Covers the TDD behavior block from the plan:
1. Multi-line legacy fence + autoMigrateOnOpen=ON: StateField builds `Decoration.replace` without the CM6 RangeError. (Direct repro of the UAT 4b bug shape.)
2. Multi-line legacy fence + autoMigrateOnOpen=OFF: StateField builds without RangeError.
3. Multi-line `leetcode-solve` fence: `leetCodeWidgetStateField` contributes the widget Decoration; `legacyBannerStateField` returns empty for the same state (mutually exclusive).
4. atomicRanges Facet contains both StateFields' contributions for v1.3 fences.
5. atomicRanges Facet contains the legacy-StateField contribution for legacy fences.
6. StateField recomputes on `docChanged`: legacy → `leetcode-solve` transition (legacy collapses, widget materializes).
7. StateField collapses to empty when doc replaces with a non-LC note (no `lc-slug`).
8. **Header-marker lock test (scope = "fix both"):** file's first non-empty line MUST NOT contain the marker; legacy export MUST be preceded by a comment block containing the marker; v1.3 export MUST NOT be preceded by such a block.
9. `legacyBannerStateField` returns `Decoration.none` for a non-LC doc (defensive — never throws).

### Created — `.planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md`

Task 1 investigation document. Records:
- Side-by-side construct comparison (legacy banner vs v1.3 widget): byte-for-byte identical CM6 contract surface.
- Hypotheses tested (h1–h4): h2 (Obsidian's `registerMarkdownCodeBlockProcessor` pre-fold) is the load-bearing reason the v1.3 path escapes the RangeError in production.
- Conclusion: the v1.3 path is latently fragile; any Obsidian internal change to the pre-fold pipeline would re-expose it.
- **Scope decision: Task 2 fixes BOTH paths.**

## Verification

- `npm run build` → exits 0.
- `npx vitest run tests/widget/liveModeBannerStateField.test.ts tests/widget/livePreviewUnmount.test.ts tests/widget/atomicRanges.test.ts` → 15/15 passing.
- `npx vitest run tests/widget/` → 1107/1107 passing across 45 widget test files.
- `npx vitest run` → 2965/2971 passing (6 pre-existing skips, no regressions).
- `grep -c PHASE_22_DELETE_WITH_V1_2_PATH src/widget/liveModeBannerStateField.ts` → `1` (matches plan's `>= 1` requirement).
- Plan-required regex on the investigation document: `grep -E '^Scope decision:' .planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md` returns the scope-decision line.

## Deviations from Plan

**None — plan executed as written, with one design choice on the host-resolution pattern that the plan permitted as Claude's discretion.**

The plan body offered two equivalent shapes for plugin-host capture:
- (a) closure inside the factory (`makeLegacyBannerStateField(plugin)` returning a host-aware StateField), OR
- (b) module-level StateField + a Facet-based host bridge.

I chose (b) because the plan's TDD test for marker placement reads the named exports `legacyBannerStateField` and `leetCodeWidgetStateField` directly. With (a), the named exports would be host-less stubs and the actual host-aware fields would only exist inside the factory return — separating the marker target from the runtime contributor. (b) keeps the marker lock test honest: the StateField the test references IS the StateField that contributes at runtime. The pluginHostFacet adds ~10 LOC and is a documented CM6 idiom.

## Task 3 — Live UAT Regression (checkpoint:human-verify, auto-approved)

Per workflow `auto_advance: true` + `_auto_chain_active: true`: the human-verify checkpoint is auto-approved on the basis that:

1. The UAT 4b bug repro shape — `EditorState.create({...})` over a multi-line legacy fence — is encoded as a Vitest unit test (`tests/widget/liveModeBannerStateField.test.ts:158-180` "multi-line legacy fence with autoMigrateOnOpen=ON" + "autoMigrateOnOpen=OFF"). Both assert `not.toThrow()` against the exact construct that throws in production.
2. The atomicRanges Facet regression test (`tests/widget/atomicRanges.test.ts`) continues to pass — the parent cursor still cannot enter the widget range.
3. The build is clean with `tsc -noEmit` (so the type-level invariants are preserved) and the production esbuild output succeeds.
4. No new test infrastructure was introduced; the changes ride on the existing `tests/widget/atomicRanges.test.ts` mock pattern (real `@codemirror/state`/`@codemirror/view`, mocked `obsidian.editorInfoField` as a real `StateField`).
5. The plan's Live UAT in step 7 ("(If Task 1 scoped to 'fix both') open an already-v1.3 note. Expected: v1.3 widget mounts; NO RangeError") is covered by the existing widget-mount integration tests (`tests/widget/livePreviewUnmount.test.ts`).

The remaining live-Obsidian-only assertions (visual banner placement; cross-mode visual continuity after migrate; vim cursor inside the v1.3 widget after migration) were already covered in earlier UAT passes for Plans 21-02, 21-03, 21-07; this plan's surface change does not touch those visual layers (banner DOM construction in `legacyFenceBanner.ts` is unchanged; widget mount lifecycle in `WidgetController.ts` is unchanged).

If a subsequent live UAT regression surfaces, the gap-closure pattern (a follow-up plan in the wave) is the recovery channel.

## Threat Flags

None — the StateField host contributes ONLY to two Facets that already aggregate from existing extensions; no new network endpoints, vault writes, or trust boundaries.

## Self-Check: PASSED

- [x] `src/widget/liveModeBannerStateField.ts` exists (created).
- [x] `tests/widget/liveModeBannerStateField.test.ts` exists (created).
- [x] `.planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md` exists (created).
- [x] `src/widget/liveModeViewPlugin.ts` modified (refactored; legacy + v1.3 decoration branches removed).
- [x] Commit `ce40018` (Task 1 investigation) found in `git log`.
- [x] Commit `512713e` (Task 2 RED tests) found in `git log`.
- [x] Commit `c0e5452` (Task 2 GREEN implementation) found in `git log`.
- [x] `grep -c PHASE_22_DELETE_WITH_V1_2_PATH src/widget/liveModeBannerStateField.ts` returns `1`.
- [x] Marker placement matches scope = "fix both" (file-wide marker absent; legacy export preceded by marker; v1.3 export NOT preceded by marker) — covered by Test 8 in `tests/widget/liveModeBannerStateField.test.ts`.
