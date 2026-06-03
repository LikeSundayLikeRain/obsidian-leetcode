---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 01
subsystem: section-protection / vim-live-reconfigure
tags:
  - section-protection
  - vim-compartment
  - foundation
  - vertical-slice
requirements_complete:
  - PROTECT-01
  - PROTECT-02
  - VIM-02
dependency_graph:
  requires:
    - "Phase 19 widget foundation: WidgetController, widgetRegistry, useInlineWidget gate, atomicRanges via liveModeViewPlugin"
    - "v1.2 sectionLockExtension.ts (fork source — kept verbatim through Phase 21)"
    - "@replit/codemirror-vim@6.3.0 vim() extension (existing pin)"
    - "@codemirror/state Compartment.reconfigure (existing pin, used by languageCompartment in Phase 16)"
  provides:
    - "src/main/sectionProtectionExtension.ts — narrowed v1.3 protection extension; mutually-exclusive with sectionLockExtension via useInlineWidget gate"
    - "src/widget/vimMode.ts — canonical reader for undocumented Obsidian internal `app.vault.getConfig('vimMode')`; single cast site consumed by Plan 20-01 + Plan 20-04 (theme dispatcher analog)"
    - "WidgetController.vimCompartment + WidgetController.reconfigureVim — per-widget live vim toggle"
    - "widgetRegistry.*values() iterator — consumed by plugin-side layout-change vim dispatcher and (Plan 20-04) theme + multi-pane affordance"
  affects:
    - "src/main.ts: layout-change listener inside useInlineWidget=ON block (vim live dispatcher); mutually-exclusive registerEditorExtension wrap (sectionProtectionExtension vs sectionLockExtension)"
tech_stack:
  added: []
  patterns:
    - "Forking + surgical narrowing (D-protect-04) — preserves every UAT-hardened scar verbatim from sectionLockExtension.ts"
    - "Compartment.reconfigure for live config swap — analog to languageCompartment from Phase 16, scoped per-widget for vim"
    - "Plugin-side single-listener fan-out via widgetRegistry iterator — minimizes event handler count"
    - "Canonical cast helper for undocumented Obsidian internal — type discipline per PLAN Step 4 directive"
key_files:
  created:
    - path: "src/main/sectionProtectionExtension.ts"
      loc: 512
      purpose: "Narrowed protection extension forked from sectionLockExtension.ts (527 LOC source). Surgical removal of fence-CLOSER lock block from `'code'` branch."
    - path: "src/widget/vimMode.ts"
      loc: 41
      purpose: "Canonical reader for undocumented `app.vault.getConfig('vimMode')`. Single cast site."
    - path: "tests/main/sectionProtectionExtension.test.ts"
      loc: 880
      purpose: "Forked v1.0 Phase 5.5 regression test. 32 cases pass (30 base − 1 deleted closer-lock + 3 new Phase 20: closer-NOT-locked, fence-body-input-passes-through, computeProtectedRanges-alias)."
    - path: "tests/widget/vimReconfigure.test.ts"
      loc: 290
      purpose: "9 unit tests covering vimCompartment mount payload, reconfigureVim dispatch contract, no-op gate, effects-only invariant, registry iterator, plugin dispatcher synthesis."
  modified:
    - path: "src/main.ts"
      change: "Imported buildSectionProtectionExtension + readVimModeFromVault. Mutually-exclusive registerEditorExtension wrap based on useInlineWidget. Added single workspace.on('layout-change') listener inside useInlineWidget=ON block."
    - path: "src/widget/WidgetController.ts"
      change: "Added Compartment import + readVimModeFromVault import. Added vimCompartment + mountedVimMode fields to WidgetController constructor. Added public reconfigureVim(enabled) method. Wrapped vim() in vimCompartment.of(...) inside buildExtensions. Refactored mountLeetCodeWidget to construct the compartment + read vimMode once and pass through."
    - path: "src/widget/widgetRegistry.ts"
      change: "Added *values(): IterableIterator<WidgetControllerLike> accessor. Extended WidgetControllerLike with optional reconfigureVim?: (enabled: boolean) => void."
    - path: "tests/widget/vimMount.test.ts"
      change: "Updated assertions to traverse vimCompartment.of([...]) wrapper (marker now one level nested in mocked extensions array)."
    - path: "tests/widget/readOnlyMount.test.ts"
      change: "Same wrapper-traversal fix for readOnly=false, vimMode=true case."
    - path: "tests/widget/livePreviewUnmount.test.ts"
      change: "Added Compartment to @codemirror/state mock (mountLeetCodeWidget now constructs one per widget)."
decisions:
  - "Section protection narrowing implemented via fork (D-protect-04) — preserves boundary fix, blank-line pocket, malformed-note path, 'leetcode.*' userEvent bypass, transactionFilter snap, Decoration.line dimming verbatim. Only the `out.push(closer.from, closerLockTo)` block + its variable computations were deleted from the `'code'` branch."
  - "Mutually-exclusive registration (D-protect-03) — useInlineWidget=ON → buildSectionProtectionExtension; useInlineWidget=OFF → buildSectionLockExtension. useInlineWidget read once at onload (line ~876) so the gate cannot flip mid-session."
  - "vimCompartment is per-widget (NOT module-singleton like languageCompartment) — each widget owns its own EditorView and Compartments are identity-keyed. The plugin-side layout-change listener iterating widgetRegistry.values() is the single fan-out path."
  - "Canonical readVimModeFromVault helper — single cast site for the undocumented Obsidian internal. WidgetController and the plugin-side dispatcher both import from src/widget/vimMode.ts. Type discipline: future call sites MUST import this helper rather than re-cast inline."
  - "reconfigureVim no-op gate — early-return when mountedVimMode === enabled. Load-bearing because workspace.on('layout-change') fires on EVERY layout change (pane focus, settings save, etc.), not just vim-mode flips. Without the gate, every layout change would dispatch a redundant Compartment.reconfigure to every widget."
  - "Boundary: `'leetcode.*'` userEvent bypass preserved verbatim per L6 / D-protect-02. CLAUDE.md §Conventions paragraph 1 unchanged through Phase 21. PROTECT-03 (Phase 22) removes together with v1.2 path deletion."
metrics:
  duration: ~25min
  completed: 2026-05-29
  test_suite_delta: "1906 baseline → 1959 passing (+53). 222 test files passing, 6 skipped, 0 failing."
---

# Phase 20 Plan 01: Section Protection Narrowing + Vim Live-Reconfigure (Foundation)

**One-liner:** Forked sectionLockExtension → sectionProtectionExtension narrowing fence-closer lock; per-widget vimCompartment with workspace.on('layout-change') dispatcher for live vim toggle without note reload.

Foundation wave for Phase 20. Two atomic tasks executed sequentially:
1. Forked `src/main/sectionLockExtension.ts` (527 LOC) → `src/main/sectionProtectionExtension.ts` (512 LOC) with surgical removal of the fence-CLOSER lock block from the `'code'` branch. Mutually-exclusive registration with the v1.2 path based on `useInlineWidget`. Forked the v1.0 Phase 5.5 regression test (32 cases pass).
2. Wired per-widget `vimCompartment` + `mountedVimMode` fields + public `reconfigureVim(enabled)` method on `WidgetController`. Created canonical `readVimModeFromVault` helper (single cast site for the undocumented Obsidian internal). Added `*values()` iterator to `widgetRegistry`. Added single `workspace.on('layout-change')` listener in `src/main.ts` that walks the registry and dispatches `reconfigureVim` to every controller. 9 new unit tests cover the contract.

## Task Outcomes

### Task 1 — Fork sectionProtectionExtension + mutually-exclusive registration

**Status:** ✅ COMPLETE
**Commit:** `8b08a67`
**Files:** `src/main/sectionProtectionExtension.ts` (NEW, 512 LOC), `src/main.ts` (modified — import + mutually-exclusive registration block), `tests/main/sectionProtectionExtension.test.ts` (NEW, 880 LOC).

Surgical edits to the fork:

| Section in source | Action | Rationale |
|--|--|--|
| File header banner (lines 1-22) | Replaced with Phase 20 banner naming the surgical narrowing | Documents fork lineage + delta |
| `computeLockedRanges` `'code'` branch (lines 168-195 of source) | KEEP heading + blank-line pocket + opener-line lock; DELETE `out.push(closer.from, closerLockTo)` + nextHeadingLine/closerLockTo variable computations | Widget owns the fence range via atomicRanges (Phase 19 C-05) |
| Re-export `computeLockedRanges as computeProtectedRanges` | Added | Test surface uses canonical Phase 20 name without forcing a wider rename |
| `buildSectionLockExtension` symbol | Renamed to `buildSectionProtectionExtension` | Phase 20 public API |
| Boundary fix (lines 416-430 of source) | PRESERVED verbatim | UAT 2026-05-13 — extends each lock's `from` by 1 |
| `'leetcode.*'` userEvent bypass (lines 384-391) | PRESERVED verbatim | D-protect-02 / L6 — load-bearing through Phase 21 |
| Gate 0 isUserInput check | PRESERVED verbatim | UAT 2026-05-13 vault-sync regression fix |
| `mergeLockedRanges`, `computeSnapTarget` helpers | PRESERVED verbatim | UAT 2026-05-13 selection-snap decision tree |
| `transactionFilter` selection-snap logic | PRESERVED verbatim | UAT 2026-05-13 cursor-motion handling |
| `Decoration.line` heading-marker dimming | PRESERVED verbatim | Phase 5.5 D-04 cosmetic |

**Plugin registration** (`src/main.ts` line ~1029):
```typescript
if (useInlineWidget) {
  this.registerEditorExtension(buildSectionProtectionExtension(this));
} else {
  this.registerEditorExtension(buildSectionLockExtension(this));
}
```
`useInlineWidget` is read once at line 876 — the gate cannot flip mid-session. The Phase 19 D-06 mutual-exclusion assert at lines 885-890 already guarantees `useInlineWidget && useNestedEditor` cannot both fire.

**Test forks**:
- `tests/main/sectionProtectionExtension.test.ts`: forked from `tests/main/sectionLockExtension.test.ts`. Replaced import path + `buildSectionLockExtension` references. Replaced the `'locks fence closer line end-to-end'` v1.0 case with a Phase 20 inverse case (`'does NOT lock fence closer line — Phase 20 D-protect-01 surgical narrowing'`). Added two new positive cases:
  - `'Phase 20 narrowing — input.type that lands ONLY in the fence body passes through (closer/body no longer protected)'` — asserts the changeFilter return value (the flat suppression-range array) does NOT cover the fence body line.
  - `'Phase 20 alias — computeProtectedRanges is the canonical name for computeLockedRanges'` — asserts the alias re-export is the same function identity.
- `tests/main/sectionLockExtension.test.ts`: UNCHANGED — both extensions still pass their respective tests.

**Test result:** `tests/main/sectionLockExtension.test.ts` 30 cases ✓ + `tests/main/sectionProtectionExtension.test.ts` 32 cases ✓ = **62 / 62 PASS**.

**LOC budget note:** Plan done criteria specified `wc -l ≤ 400 (target ~370)`. Actual file is 512 LOC. The discrepancy is intrinsic to D-protect-04: the byte-level surgical contract (PATTERNS lines 140-145) deletes only the closer-lock block (~13 LOC) while preserving every UAT-hardened scar (boundary fix + transactionFilter snap + decoration emitter ≈ 200 LOC). The locked decision (D-protect-04) wins over the planner's LOC estimate. See **Deviations** section below.

### Task 2 — Per-widget vimCompartment + workspace.on('layout-change') dispatcher

**Status:** ✅ COMPLETE
**Commit:** `2f04929`
**Files:** `src/widget/vimMode.ts` (NEW, 41 LOC), `src/widget/WidgetController.ts` (modified), `src/widget/widgetRegistry.ts` (modified), `src/main.ts` (modified), `tests/widget/vimReconfigure.test.ts` (NEW, 290 LOC), 3 existing test files updated.

**Architectural decisions baked in:**

1. **Per-widget `vimCompartment`** — NOT module-singleton (the contrast with `languageCompartment` is intentional per PLAN Step 2 rationale). Each widget owns its own EditorView and Compartments are identity-keyed. Module-singleton would dispatch to all widgets at once — correct for `languageCompartment` because frontmatter is a single source of truth, but unnecessary for vim because the plugin-side `workspace.on('layout-change')` listener iterating `widgetRegistry.values()` is the single fan-out path.

2. **Canonical `readVimModeFromVault` helper** — `src/widget/vimMode.ts` is the single cast site for `app.vault.getConfig('vimMode')`. Both `WidgetController` (mount-time read) and the plugin-side dispatcher import it. Future call sites (e.g., Plan 20-02 if a chevron switch needs vim awareness) MUST import this helper.

3. **Effects-only `reconfigureVim` dispatch** — the dispatch payload is `{ effects: vimCompartment.reconfigure(...) }` with NO `changes`/`selection`/`scrollIntoView`. This is the load-bearing invariant for cursor + scroll + undo preservation per Phase 16 Pitfall C analog (Compartment.reconfigure is documented as state-preserving). Test `Behavior 6` asserts this invariant.

4. **No-op gate** — `reconfigureVim` early-returns when `mountedVimMode === enabled`. Load-bearing because `workspace.on('layout-change')` fires on EVERY layout change (pane focus, settings save, etc.), not just vim-mode flips. Without the gate, every layout change would dispatch a redundant Compartment.reconfigure to every widget — cheap but wasteful.

**Test result:** `tests/widget/vimReconfigure.test.ts` 9 cases ✓ + `tests/widget/vimMount.test.ts` 4 cases ✓ + `tests/widget/widgetRegistry.test.ts` 8 cases ✓ + 4 cases in `readOnlyMount.test.ts` + 4 cases in `livePreviewUnmount.test.ts` (after mock fix) = **29 / 29 PASS**.

## Probe Outcome

The Phase 20 Plan 20-01 dev-vault probe (Step 5 of Task 2 / CONTEXT L4 + RESEARCH §"Probe Procedure" lines 540-556) is a **manual UAT** that requires a live Obsidian instance with the user's configured dev vault (`~/Documents/Obsidian Vault` per project skills MEMORY.md). The current execution context (parallel executor agent in a worktree, no live Obsidian) cannot drive a real Obsidian editor.

### ## Probe Outcome: PENDING-MANUAL-UAT

The probe procedure is fully implemented in code (per-widget vimCompartment + plugin-side layout-change listener + canonical helper). The behavioral contract is verified via 9 unit tests. The remaining open question is the empirical runtime behavior of `@replit/codemirror-vim@6.3.0` under `Compartment.reconfigure(vim() ↔ [])` — specifically whether the library's internal state (current vim mode, command buffer) survives the dispatch cleanly.

**Phase 22 path forward:**
- If the manual UAT in dev vault PASSES (per RESEARCH §"Pass criteria" lines 541-549): keep the live-reconfigure path; VIM-03 banner is NOT needed.
- If the manual UAT FAILS (per RESEARCH §"Fail criteria" lines 551-555 — Esc doesn't enter normal mode after toggle, OR cursor stays line-shape, OR insert-mode glitchy after toggle, OR state lost on dispatch, OR glitchy-pass requiring no-op keystroke): ship VIM-03 banner-on-toggle fallback at Phase 22 per CONTEXT L4 pre-acceptance.

The dev vault probe SHOULD be exercised by the user (or in a follow-up agent that has live Obsidian access) before Phase 22 commits. The unit-test contract guarantees the architecture is correct; the runtime probe verifies the library's empirical behavior.

## Manual UAT — atomicRanges Cursor-Edge Cases (Step 10 of Task 1)

VALIDATION.md §Manual-Only line 81 lists four cursor-edge cases that exercise the runtime CM6 `atomicRanges` cursor-skip behavior installed by Phase 19's `liveModeViewPlugin`. These cases CANNOT be exercised under vitest because `atomicRanges` is a runtime-only behavior that requires a live CM6 EditorView with a real Obsidian leaf.

| Case | Action | Expected | Outcome |
|------|--------|----------|---------|
| (a) | Up-arrow into closer line | Cursor jumps over fence body to next editable line above | PENDING-MANUAL-UAT |
| (b) | Right-arrow at end of `## Code` heading line | Cursor lands at next editable position past the blank-line pocket + opener (atomicRanges keeps it out) | PENDING-MANUAL-UAT |
| (c) | Backspace at fence-opener line | Edit accepted (opener line no longer protected by changeFilter; atomicRanges only governs cursor motion, not changes) | PENDING-MANUAL-UAT |
| (d) | Type into fence body | Edit accepted via the widget's own EditorView (not the parent CM6) | PENDING-MANUAL-UAT |

The user (or a follow-up agent with dev-vault access) SHOULD run these four cases against `useInlineWidget=ON` before Phase 20 closeout. The unit-test contract (32 cases in `sectionProtectionExtension.test.ts`) verifies the changeFilter narrowing is correct; the manual UAT verifies the runtime cursor behavior the changeFilter alone cannot exercise.

## Deviations from Plan

### LOC budget mismatch (informational — D-protect-04 wins)

**Plan done criteria:** `wc -l src/main/sectionProtectionExtension.ts ≤ 400 (target ~370)`.
**Actual:** 512 LOC.
**Reason:** The plan's `~370 LOC after fork+remove` estimate appears to have anticipated more aggressive removal than D-protect-04 (the locked decision) actually permits. PATTERNS lines 140-145 specify byte-level surgical deletion of ONLY the closer-lock block (`out.push(closer.from, closerLockTo)` + its variable computations: ~13 LOC). The remaining ~514 LOC are preserve-verbatim per D-protect-04: the boundary fix (UAT 2026-05-13), the `'leetcode.*'` userEvent bypass, the Gate 0 isUserInput check, the file + lc-slug gate, the `mergeLockedRanges` helper, the `computeSnapTarget` helper, the transactionFilter selection-snap logic, the `EditorView.decorations.of` line decoration. Removing any of these would regress UAT-hardened behavior the v1.0 Phase 5.5 cases pin.
**Resolution:** Documented here. The done criterion is informational; D-protect-04 is the locked decision. Both regression test surfaces (sectionLockExtension.test.ts + sectionProtectionExtension.test.ts) pass byte-for-byte against the new extension.

### [Rule 1 - Test infra] livePreviewUnmount.test.ts mock missing Compartment export

**Found during:** Task 2, full-suite run.
**Issue:** `tests/widget/livePreviewUnmount.test.ts` mocked `@codemirror/state` but did not export `Compartment`. The Phase 20 `mountLeetCodeWidget` now constructs `new Compartment()` per widget, so the test crashed with `No "Compartment" export is defined on the "@codemirror/state" mock`.
**Fix:** Added `Compartment: class { of(ext) { return ['mock-compartment-of', ext]; } reconfigure(ext) { return { __reconfigureEffect: true, ext }; } }` to the mock. All 4 cases now pass.
**Files modified:** `tests/widget/livePreviewUnmount.test.ts`.
**Commit:** `2f04929`.

### [Rule 1 - Test assertion shape] vimMount + readOnlyMount tests check wrapper

**Found during:** Task 2, full-suite run after WidgetController refactor.
**Issue:** `vimMount.test.ts` and `readOnlyMount.test.ts` asserted `extensions.toContain('mock-vim-extension')` but vim is now wrapped in `vimCompartment.of(vim())`, so the marker is one level nested in the mocked extensions array.
**Fix:** Both tests updated to traverse the wrapper via a `flatExtensionsContains(...)` predicate that accepts either a bare marker or a marker nested inside one Array level. Negative-case tests (`not.toContain('mock-vim-extension')`) continue to pass byte-for-byte because read-only widgets get `vimCompartment.of([])` (no marker present).
**Files modified:** `tests/widget/vimMount.test.ts`, `tests/widget/readOnlyMount.test.ts`.
**Commit:** `2f04929`.

## Validation Results

### Automated

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run tests/main/sectionProtectionExtension.test.ts tests/main/sectionLockExtension.test.ts` | ✅ 62 passed (32 + 30) |
| `npx vitest run tests/widget/vimReconfigure.test.ts tests/widget/vimMount.test.ts tests/widget/widgetRegistry.test.ts` | ✅ 21 passed (9 + 4 + 8) |
| `npm test` (full suite) | ✅ **1959 passed / 6 skipped / 0 failing** across 222 test files (was 1906 baseline + 41 new + ~12 phase-related) |

### Phase-level Verification Checks (from 20-01-PLAN `<verification>` block)

| # | Check | Status |
|---|-------|--------|
| 1 | `wc -l src/main/sectionProtectionExtension.ts` returns 350-400 | ⚠️ 512 (D-protect-04 wins; see Deviations) |
| 2 | `grep -c "userEvent\\b.*leetcode\\." src/main/sectionProtectionExtension.ts ≥ 1` | ✅ multiple matches |
| 3 | `closer.from` / `closerLockTo` NOT in `'code'` branch | ✅ zero hits |
| 4 | Boundary-fix block `expanded.push(Math.max(0, ...))` present | ✅ at lines 437-438 |
| 5 | Both regression test files pass | ✅ 62 cases pass |
| 6 | v1.0 Phase 5.5 cases pass against new extension | ✅ all 30 base cases preserved + 1 deleted (closer-lock) + 3 added (Phase 20) |
| 7 | `WidgetController.reconfigureVim` exists + dispatches via vimCompartment.reconfigure | ✅ verified by `vimReconfigure.test.ts` Behavior 3-4 |
| 8 | `widgetRegistry.values()` iterator exported | ✅ verified by `vimReconfigure.test.ts` Behavior 7 |
| 9 | layout-change listener registered inside `if (useInlineWidget)` block | ✅ verified at `src/main.ts:~990` |
| 10 | `npx tsc --noEmit` exits 0; `npm test` full suite green | ✅ 1959 passing / 0 failing |
| 11 | Dev-vault probe outcome recorded | ✅ recorded above as PENDING-MANUAL-UAT (CONTEXT L4 fallback pre-accepted) |

## Carry-Forward Notes for Plan 20-02

- **`readVimModeFromVault` helper** (`src/widget/vimMode.ts`) is the canonical cast site for the undocumented Obsidian internal. If Plan 20-02 adds any chevron-side behavior that needs to query vim state (unlikely — vim mode shouldn't affect language-switch UX), import the helper rather than re-cast.

- **`widgetRegistry.values()`** iterator is now exposed and used by the layout-change dispatcher. Plan 20-04 will also consume this for the theme dispatcher and multi-pane "Take over" affordance.

- **`vimCompartment` is per-widget.** If Plan 20-04's `multiPaneCoordinator` needs to coordinate vim state across panes (probably not — single-active-per-file is the v1.3 baseline), it must walk the registry; there's no module-singleton to dispatch to.

- **Section-protection narrowing is a Phase 20 baseline.** When `useInlineWidget=ON`, the v1.3 widget's atomicRanges (from `liveModeViewPlugin.ts:135-139`) governs the fence body + closer; the parent CM6's section-protection extension governs only `## Problem` body + `## Code` heading + blank-line pocket + opener-line + `## Techniques` heading + `## Notes` heading. Plans 20-02/03/04 must assume this scope when wiring action-row mounts, conflict-modal triggers, and theme reflows.

- **`'leetcode.*'` userEvent bypass is preserved verbatim through Phase 21** (CLAUDE.md §Conventions paragraph 1). Plan 20-02 chevron flow MUST go through `app.fileManager.processFrontMatter(...)` (vault-layer write — bypasses changeFilter by design) and NOT through a `cm.dispatch` with `'leetcode.lang-switch'` userEvent on the parent. Plan 20-03 conflict-modal "Keep mine" flush path goes through `widget.writer.forceFlush()` which routes through `app.vault.process` — also vault-layer. The bypass remains load-bearing for the v1.2 path's chevron switch + Reset child dispatch (Phase 17 D-03) through Phase 21.

## Test File References for Plan 20-02

The next plan should import these existing test helpers / mocks where applicable:
- `tests/helpers/obsidian-stub.ts` — Modal, MarkdownRenderChild, MarkdownRenderer stubs
- `tests/solve/mocks/fakeWorkspace.ts` — `createFakePlugin`, `createFakeMetadataCache`, `createFakeCommands`
- `tests/widget/vimMount.test.ts` — `flatExtensionsContains` predicate pattern (extracted via inline helper) is reusable for any `Compartment.of(...)` wrapping verification

## Self-Check: PASSED

- ✅ `src/main/sectionProtectionExtension.ts` exists (verified `[ -f path ]`).
- ✅ `src/widget/vimMode.ts` exists.
- ✅ `tests/main/sectionProtectionExtension.test.ts` exists.
- ✅ `tests/widget/vimReconfigure.test.ts` exists.
- ✅ Commit `8b08a67` exists in `git log`.
- ✅ Commit `2f04929` exists in `git log`.
- ✅ All deviations documented above.
- ✅ Manual UAT cases (vim probe + 4 atomicRanges cursor-edge cases) recorded as PENDING-MANUAL-UAT with Phase 22 path forward.
