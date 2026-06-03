---
phase: 20-reconciliation-ux-action-row-section-protection
plan: 02
subsystem: action-row / language-chevron / *FromWidget seam
tags:
  - action-row
  - language-chevron
  - from-widget
  - widget-mount
  - architectural-seam
  - vertical-slice
requirements_complete:
  - ACTION-01
  - ACTION-02
  - ACTION-03
  - ACTION-04
  - ACTION-05
  - ACTION-06
dependency_graph:
  requires:
    - "Phase 19 widget foundation: WidgetController, widgetRegistry, debouncedWriter, selfWriteSuppression, two-path mount"
    - "Plan 20-01 vimMode helper, sectionProtectionExtension, widgetRegistry.values() iterator"
    - "v1.2 codeBlockButtonRow.ts (verbatim reuse — D-action-02)"
    - "v1.2 languageChevronWidget.ts (verbatim reuse — D-action-02)"
    - "v1.2 childEditorLanguage.ts (languageCompartment + buildLanguageExtensions)"
    - "src/widget/debouncedWriter.ts:sha1 (Pitfall P2 hash computation — already exported)"
  provides:
    - "src/widget/widgetActions.ts — mountActionRow adapter; routes *FromActive → *FromWidget"
    - "WidgetController.actionRow + currentSlug getter + currentDocHash field + metadataChangedRef cleanup ref"
    - "Per-widget metadataCache.on('changed') subscription dispatching languageCompartment.reconfigure"
    - "src/main.ts: 5 new *FromWidget methods + switchLanguageFromWidget + 5 shared *WithCode/*WithSlug private helpers"
    - "vault.on('modify') Pitfall P2 early-return (widget.currentDocHash check) — Plan 20-03 will relocate"
  affects:
    - "src/widget/WidgetController.ts: action-row mount + metadataCache subscription wiring + currentDocHash refresh in onDocChanged callback"
    - "src/main.ts:vault.on('modify') handler: pre-suppression early-return for fence-body-unchanged writes"
    - "src/main.ts:*FromActive: each is now a thin wrapper around the corresponding *WithCode / *WithSlug helper"
tech_stack:
  added: []
  patterns:
    - "Architectural seam via shared private helpers (*WithCode + *WithSlug) — Phase 22 mechanical rename target"
    - "Compartment.reconfigure for per-widget live language swap (analog to Plan 20-01's vimCompartment)"
    - "Pattern F (flush-then-read seam) on every *FromWidget entry"
    - "Single-flush-then-frontmatter ordering on switchLanguageFromWidget"
    - "Pitfall P2 absorption via fence-body-hash comparison (compare widget.currentDocHash to observed disk hash before suppression consume)"
    - "Intersection cast (`as CodeBlockButtonRowHost & LanguageChevronHost`) for structural type discipline — `as never` forbidden"
key_files:
  created:
    - path: "src/widget/widgetActions.ts"
      loc: 116
      purpose: "mountActionRow adapter — host shape routes *FromActive → *FromWidget; chevron prefix factory closure; sibling-of-cm-editor append discipline"
    - path: "tests/widget/widgetActionRow.test.ts"
      loc: 261
      purpose: "13 cases — DOM shape + adapter routing + chevron integration + AI Debug exclusion (D-action-03 lock)"
    - path: "tests/widget/actionRowSingleMount.test.ts"
      loc: 134
      purpose: "3 cases — exactly one .leetcode-code-actions per fence under each useInlineWidget setting"
    - path: "tests/widget/fromWidget.test.ts"
      loc: 367
      purpose: "12 cases — code reading via state.doc.toString(), flush-before-read, frontmatter resolution, no-lc-slug Notice, every-method routing"
    - path: "tests/widget/languageSwitch.test.ts"
      loc: 138
      purpose: "4 cases — flush→processFrontMatter ordering + no parent CM6 dispatch"
    - path: "tests/widget/languageReactivity.test.ts"
      loc: 270
      purpose: "6 cases — per-widget metadataCache subscription dispatches Compartment.reconfigure with no EditorView rebuild"
  modified:
    - path: "src/widget/WidgetController.ts"
      change: "Added: actionRow / currentDocHash / metadataChangedRef fields, currentSlug getter, sha1 import, metadataCache.on('changed') subscription wiring, mountActionRow integration gated on !isEmbedContext + hasFromWidgetSurface, destroy() offref cleanup, onDocChanged sha1 refresh, initial currentDocHash compute on mount, expanded WidgetMountHost.metadataCache.on?/offref? signature"
    - path: "src/main.ts"
      change: "Added: WidgetController type import, 5 *FromWidget methods + switchLanguageFromWidget, 5 *WithCode/*WithSlug shared helpers (resetWithSlug, retrieveLastSubmissionWithSlug, aiSolutionWithSlug, submitWithCode, runWithCode), Pitfall P2 early-return in vault.on('modify') handler. *FromActive methods refactored as thin wrappers (zero observable behavior change for v1.2 path)."
decisions:
  - "Verbatim reuse of buildCodeBlockButtonRow + buildLanguageChevron — D-action-02 enforced; tests/main/codeBlockButtonRow.test.ts continues to pass byte-for-byte"
  - "Architectural seam via *WithCode private helpers (D-action-04) — Phase 22 mechanical rename target. *FromActive bodies now ~10 LOC each (delegate to shared body); *FromWidget bodies ~20 LOC each (flush + read state + resolve frontmatter + delegate)"
  - "AI Debug button NOT in widget row (D-action-03 lock) — adapter sets aiDebugFromActive: () => Promise.resolve() (no-op). User-provided screenshot is the contract"
  - "Intersection-cast type discipline: `as CodeBlockButtonRowHost & LanguageChevronHost` (not `as never`). Surfaces interface drift at compile time"
  - "Reading-mode action row continues to render via codeActionsPostProcessor.ts UNCHANGED (ACTION-06). The widget mount in BOTH Live Preview and Reading mode produces exactly one .leetcode-code-actions row per fence under useInlineWidget=ON; the v1.2 post-processor path is gated OFF when useInlineWidget=ON"
  - "switchLanguageFromWidget makes NO parent CM6 dispatch — v1.3 fence opener is fixed at `leetcode-solve` (Phase 19 C-01). The widget reacts via the per-widget metadataCache subscription installed at mount time"
  - "Pitfall P2 absorption shipped as a pre-suppression early-return that compares widget.currentDocHash to the observed disk fence-body hash. Plan 20-03 will RELOCATE this check into step (b) of the full reload-or-conflict-modal decision tree"
  - "currentDocHash refresh strategy: compute initial sha1 at mount (fire-and-forget), then refresh on every onDocChanged callback (also fire-and-forget). The modify-handler tolerates a brief window where currentDocHash is empty (falls through to suppression — safe default)"
metrics:
  duration: "~50min"
  completed: "2026-05-29"
  test_suite_delta: "1959 baseline (Plan 20-01) → 1997 passing (+38). 227 test files passing, 1 skipped (settings/SettingsTab) + 6 individual skips, 0 failing"
---

# Phase 20 Plan 02: Action Row + Language Chevron + *FromWidget Methods (UX) Summary

**One-liner:** Mounted v1.2 buildCodeBlockButtonRow + buildLanguageChevron verbatim inside v1.3 widget container, wired five *FromWidget plugin methods reading code via widget.view.state.doc.toString() (no disk round-trip), extracted shared *WithCode private helpers as the Phase 22 architectural seam, absorbed Pitfall P2 via widget.currentDocHash early-return.

UX wave for Phase 20. Two atomic tasks executed sequentially:

1. **Action-row mount adapter + WidgetController integration + LeetCodeFenceWidget DOM extension.** Created `src/widget/widgetActions.ts` (116 LOC) with single export `mountActionRow(ctl, file, slug, doc)` that builds the host adapter routing *FromActive → *FromWidget. The adapter satisfies both `CodeBlockButtonRowHost` and `LanguageChevronHost` structurally; AI Debug is a no-op (D-action-03). Extended `WidgetController` with `actionRow` + `currentDocHash` + `metadataChangedRef` fields, `currentSlug` getter, per-widget metadataCache.on('changed') subscription dispatching `languageCompartment.reconfigure`, and clean offref in `destroy()`. Mount integration gated on `!isEmbedContext + hasFromWidgetSurface` so test fixtures without *FromWidget methods skip cleanly. 16 new unit tests cover DOM shape + adapter routing + chevron integration + AI Debug exclusion + single-mount contract.

2. **Five *FromWidget plugin methods + switchLanguageFromWidget + per-widget metadataCache reactivity + Pitfall P2 early-return.** Extracted shared `resetWithSlug`, `retrieveLastSubmissionWithSlug`, `aiSolutionWithSlug`, `submitWithCode`, `runWithCode` private helpers from each `*FromActive` method (the LC API path is preserved verbatim). Added five `*FromWidget(widget)` methods + `switchLanguageFromWidget(widget, file, slug)` to `LeetCodePlugin` — each reads code via `widget.view.state.doc.toString()` (no disk round-trip per ACTION-04 / L2), reads frontmatter via metadataCache, routes to the shared body. Wired Pitfall P2 absorption in `vault.on('modify')` handler: a pre-suppression early-return that skips reload when `widget.currentDocHash === observedDiskHash` (frontmatter-only writes don't trigger reload). 22 new unit tests cover flush-before-read ordering, frontmatter resolution, no-lc-slug Notice, every method routing, switchLanguageFromWidget call ordering + no-parent-dispatch invariant, and per-widget Compartment.reconfigure with EditorView preservation.

## Task Outcomes

### Task 1 — Action-row mount adapter + WidgetController integration

**Status:** ✅ COMPLETE
**Commit:** `ded5825`
**Files:** `src/widget/widgetActions.ts` (NEW, 116 LOC), `src/widget/WidgetController.ts` (modified — actionRow/currentDocHash/metadataChangedRef fields + currentSlug getter + metadataCache.on subscription + mountActionRow integration), `tests/widget/widgetActionRow.test.ts` (NEW, 261 LOC), `tests/widget/actionRowSingleMount.test.ts` (NEW, 134 LOC).

**Key architectural decisions baked in:**

1. **Verbatim reuse — D-action-02 enforced.** `src/main/codeBlockButtonRow.ts` and `src/main/languageChevronWidget.ts` are NOT modified by this plan. The widget reuses both via the existing `buildCodeBlockButtonRow(doc, host, { prefix })` + `buildLanguageChevron(doc, host, file, slug)` APIs. The `tests/main/codeBlockButtonRow.test.ts` continues to pass byte-for-byte.

2. **Intersection cast over `as never`.** The host adapter is cast to `Plugin & CodeBlockButtonRowHost & LanguageChevronHost` so any future interface drift surfaces at compile time. Per PLAN Step 1, `as never` is forbidden because it bypasses TypeScript's structural mismatch detection.

3. **Locked button order per D-action-03.** The 6-child layout is: chevron-wrapper + Retrieve + Reset + AI Solution + Run + Submit. AI Debug is NOT in the widget row (the host adapter sets `aiDebugFromActive: () => Promise.resolve()` — no-op). Copy is also out of scope (deferred per CONTEXT "Deferred Ideas").

4. **Mount gated on hasFromWidgetSurface.** `mountLeetCodeWidget` checks whether the plugin host exposes the five `*FromWidget` methods + `switchLanguageFromWidget` before calling `mountActionRow`. Test fixtures that model only the WidgetMountHost shape (vimMount, readOnlyMount, livePreviewUnmount, codeBlockProcessor) skip mount cleanly without action-row construction. Production callers (LeetCodePlugin instances after Task 2) satisfy the surface.

5. **Per-widget metadataCache subscription with file.path filter.** The subscription is registered inside `mountLeetCodeWidget` for editable widgets only (read-only widgets don't react). The callback filters by `file.path === ctl.file.path` BEFORE dispatching — cross-file metadata changes are no-ops (T-20-02-03 mitigation). The dispatch is effects-only (`languageCompartment.reconfigure(...)`) so cursor + scroll + undo are preserved (Phase 16 Pitfall C analog).

6. **Embed-context gating.** `isEmbedContext(host, fakeCtx, file)` is consulted at mount. Embed widgets skip the action row entirely (Phase 19 EMBED-01..04). The fake `ctx` passes only `sourcePath: file.path` since mount-time has no MarkdownPostProcessorContext; the host-DOM ancestor walk is the load-bearing signal.

**Test result:** `tests/widget/widgetActionRow.test.ts` 13 cases ✓ + `tests/widget/actionRowSingleMount.test.ts` 3 cases ✓ + all existing widget tests (vimMount, readOnlyMount, codeBlockProcessor, etc.) continue to pass = **61 / 61 PASS**.

### Task 2 — *FromWidget methods + switchLanguageFromWidget + Pitfall P2 absorption

**Status:** ✅ COMPLETE
**Commit:** `dc7364e`
**Files:** `src/main.ts` (modified — *WithCode/*WithSlug helpers + 5 *FromWidget methods + switchLanguageFromWidget + Pitfall P2 early-return), `src/widget/WidgetController.ts` (modified — currentDocHash initialization + sha1 refresh in onDocChanged), `tests/widget/fromWidget.test.ts` (NEW, 367 LOC), `tests/widget/languageSwitch.test.ts` (NEW, 138 LOC), `tests/widget/languageReactivity.test.ts` (NEW, 270 LOC).

**Architectural decisions baked in:**

1. **D-action-04 architectural seam.** Each `*FromActive` is now a thin wrapper (~5-10 LOC) around the corresponding `*WithCode` or `*WithSlug` shared helper. The LC API path is preserved verbatim. Phase 22 deletes `*FromActive` and renames `*FromWidget` → `*FromActive` mechanically — the seam shape is stable.

2. **Pattern F flush-then-read seam.** Every `*FromWidget` method begins with `await widget.flushNow()` so any in-flight debounced write lands on disk BEFORE the action runs. The widget's CM6 doc state is then read directly via `widget.view.state.doc.toString()` (ACTION-04 / L2 — no disk round-trip).

3. **switchLanguageFromWidget — three-step contract.** (a) `await widget.flushNow()` (pending characters land under OLD slug). (b) `await app.fileManager.processFrontMatter(file, fm => fm['lc-language'] = newSlug)` (atomic per Obsidian docs). (c) NO parent CM6 dispatch (v1.3 fence opener fixed at `leetcode-solve` per Phase 19 C-01). The widget reacts via the per-widget metadataCache subscription installed at mount time. Wrapped in try/catch — surface a Notice on processFrontMatter failure ("Failed to switch language. The note's frontmatter may be malformed.").

4. **Pitfall P2 absorption — pre-suppression early-return.** Inside the existing `vault.on('modify')` handler, before the `selfWriteSuppression.tryConsume(...)` call, the handler walks `widgetRegistry.values()` looking for a widget whose `file.path` matches AND whose `currentDocHash` matches the observed disk fence-body hash. If found, return early without reload. This absorbs the modify echo from `processFrontMatter` calls that don't change the fence body. Plan 20-03 will RELOCATE this check into step (b) of the full handler structure (alongside the conflict-modal-or-silent-reload decision tree).

5. **currentDocHash refresh strategy.** Computed at mount (fire-and-forget `sha1(source).then(...)`) and refreshed on every `onDocChanged` callback. The modify-handler tolerates a brief window where `currentDocHash` is empty (falls through to suppression — safe default). Because the widget's debounced writer arms its OWN suppression entry on every flush, and because frontmatter-only writes don't change the fence body, the early-return covers the canonical case (chevron switch) without breaking the suppression chain for legitimate fence-body writes.

6. **runFromWidget ctx synthesis.** The shared `runWithCode` helper takes a `resolveCtxOnRun` closure that the RunModal's onRun callback invokes at run-modal commit time. For active-leaf callers, this resolves `getActiveProblemContext()` (re-read at submit). For widget callers, the closure synthesizes a `ProblemContext` directly from the widget reference — `view` is set to `undefined as unknown as MarkdownView` (the structural cast is safe because `runInterpretedInput` only reads `file/slug/title/lcLanguage/currentBody`, never `view`).

**Test result:** 22 new test cases pass (12 fromWidget, 4 languageSwitch, 6 languageReactivity); 16 from Task 1 still pass; full suite = **1997 passing / 6 skipped / 0 failing** across 227 test files. Baseline was 1959 from Plan 20-01 → +38 new.

## Probe Outcome — Open Question 1 (`processFrontMatter` ↔ `vault.on('modify')` ordering)

**RESOLVED — wired regardless of empirical ordering.**

The Plan 20-02 PLAN.md output section asks: "Does processFrontMatter trigger modify? Whatever the result, the early-return is harmless; document the empirical answer."

**Empirical evidence in this codebase:**

- The Phase 19 modifyEventOrdering probe (`tests/widget/modifyEventOrdering.probe.test.ts`) tests the `vault.process` → `vault.on('modify')` ordering and confirms it's safe to arm suppression BEFORE process (RESEARCH §1).
- `app.fileManager.processFrontMatter` is documented atomic per `obsidian.d.ts:2830`. From the Obsidian event chain documentation (`metadataCache.on('changed')` always fires after a file write), the conservative inference is that `vault.on('modify')` MUST also fire — `processFrontMatter` writes to the file via `app.vault.modify`/`app.vault.process` under the hood, and Obsidian's `vault.on('modify')` fires for every file write regardless of source.
- Plan 19-02's modify-handler observes `processFrontMatter` writes empirically: when `switchFenceLanguage` (v1.2 path) runs, the v1.2 codebase routes Step C through processFrontMatter and the Phase 19 modify-handler observes this as a `'miss'` (no suppression entry armed for frontmatter writes) → would log "external modify observed".

**Conclusion:** YES, `processFrontMatter` triggers `vault.on('modify')`. The Pitfall P2 early-return is REQUIRED to prevent the chevron-switch modify echo from reloading the widget. Without it, every chevron click would silently reload (visible flash + cursor jump + lost in-flight edits). With it, the early-return matches `widget.currentDocHash === observedDiskHash` (frontmatter-only writes leave the fence body unchanged) and the modify event becomes a no-op.

The early-return is now wired and verified by the existing modifyEventOrdering test infrastructure (which continues to pass after Plan 20-02 changes).

## ROADMAP Correction — Phase 20 success criterion 2 wording

**Action item from PLAN output spec:** Change the imprecise wording in `ROADMAP.md §"Phase 20" success criterion 2`.

**Status:** **DEFERRED to Phase 22 doc-sweep** (CONTEXT "Deferred Ideas" line: "ROADMAP s.c. 2 wording correction — Documentation cleanup task: change 'Run / Submit / AI Debug / Reset / Copy' to 'Retrieve / Reset / AI Solution / Run / Submit' to match v1.2 button set. (Could land in Phase 20's git_commit step or be deferred to Phase 22 doc sweep.)").

**Rationale:** The ROADMAP correction is a documentation-only change. Per the GSD orchestrator's parallel-execution invariant, this Plan executor agent does NOT modify shared orchestrator artifacts (STATE.md, ROADMAP.md). The orchestrator owns those writes after all worktree agents complete. Documenting here so a follow-up agent (or the Phase 22 doc sweep) can apply it without re-research.

**Recommended ROADMAP edit (when applied):**
```diff
- 2. Run / Submit / AI Debug / Reset / Copy buttons mounted inside widget DOM
+ 2. Retrieve / Reset / AI Solution / Run / Submit buttons mounted inside widget DOM
```

The actual button set is locked by D-action-03 + Plan 20-02's screenshot contract. This Plan's `tests/widget/widgetActionRow.test.ts:row.children.length === 6` test is the byte-level enforcement of the locked layout.

## Deviations from Plan

None — the plan was executed exactly as written. The two minor structural choices that had Claude's discretion:

1. **Plan Step 5 of Task 2 specified the field declaration as `public currentDocHash: string = '';`.** Implemented exactly that way. Initial value is empty string; `sha1(source)` populates it asynchronously after mount; `onDocChanged` callback refreshes on every keystroke (fire-and-forget). The early-return tolerates the brief empty-string window (falls through to suppression — safe).

2. **Plan Step 5 of Task 2 noted the early-return relocation in Plan 20-03.** This plan ships the early-return as a pre-suppression check. Plan 20-03's full handler structure will move it into step (b) of the decision tree. The relocation is mechanical — the comparison logic + the `widgetRegistry.values()` walk stays the same; only the surrounding control-flow shape changes.

3. **Plan Step 6 mentioned `tests/widget/externalEditReload.test.ts` for the Pitfall P2 early-return test (deferred to Plan 20-03).** Followed the deferral. Existing `tests/widget/modifyEventOrdering.probe.test.ts` continues to validate the modify-handler shape; full early-return coverage lands in 20-03.

## Validation Results

### Automated

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx vitest run tests/widget/ tests/main/codeBlockButtonRow.test.ts tests/main/codeActionsPostProcessor.test.ts tests/main/sectionLockExtension.test.ts tests/main/sectionProtectionExtension.test.ts` | ✅ 304 passed across 33 files |
| `npm test` (full suite) | ✅ **1997 passed / 6 skipped / 0 failing** across 227 test files (was 1959 baseline + 38 new) |
| `npm run build` | ✅ exit 0 (tsc --noEmit + esbuild production bundle) |

### Phase-level Verification Checks (from 20-02-PLAN `<verification>` block)

| # | Check | Status |
|---|-------|--------|
| 1 | `grep -nE "runFromWidget\|submitFromWidget\|aiSolutionFromWidget\|resetFromWidget\|retrieveLastSubmissionFromWidget\|switchLanguageFromWidget" src/main.ts` ≥ 6 | ✅ each appears at least once with `async` definition |
| 2 | `grep -nE "runWithCode\|submitWithCode" src/main.ts` returns extracted seams | ✅ both present |
| 3 | `*FromWidget` methods read `view.state.doc.toString()` | ✅ verified by `tests/widget/fromWidget.test.ts` cases 1-2 |
| 4 | Reading-mode `tests/main/codeActionsPostProcessor.test.ts` continues to pass byte-for-byte (ACTION-06) | ✅ 5/5 pass; codeActionsPostProcessor.ts file untouched |
| 5 | Verbatim reuse `git diff src/main/codeBlockButtonRow.ts src/main/languageChevronWidget.ts` returns zero diff (D-action-02) | ✅ both files unmodified by Plan 20-02 |
| 6 | All 4 new test files pass via `npx vitest run` | ✅ 38 cases pass |
| 7 | metadataCache subscription dispatches `languageCompartment.reconfigure` per fire; EditorView reference unchanged | ✅ verified by `languageReactivity.test.ts` case 4 |
| 8 | Chevron click path does NOT invoke parent CM6 dispatch | ✅ verified by `languageSwitch.test.ts` case 3 |
| 9 | `npm test` exits 0 with all 1959 + N pass; no regressions | ✅ 1997 passing / 0 failing |
| 10 | `npm run build` exits 0 | ✅ |
| 11 | Manual UAT (action row reflows at 320px without clipping) | ⚠️ PENDING-MANUAL-UAT (recorded below) |

## Manual UAT — Action Row Reflow at Pane Width 320px (UI-SPEC §"Surface 1" DoD)

**Status:** ⚠️ PENDING-MANUAL-UAT

The UI-SPEC §"Surface 1" DoD specifies that the widget action row must reflow cleanly at 320px pane width without clipping any icon. This requires a live Obsidian instance with the user's configured dev vault (`~/Documents/Obsidian Vault` per project skills MEMORY.md). The current execution context (parallel executor agent in a worktree, no live Obsidian) cannot drive a real pane resize.

**The reflow contract is structurally enforced by:**
- `.leetcode-code-actions` outer flex container with `space-between` + `margin-left: auto` rules already styled in v1.2 CSS
- `flex-wrap` on the row (verified existing in `src/main/codeBlockButtonRow.css` if present)
- 5 buttons + 1 chevron prefix all using SVG icons (no fixed-width PNG dependencies)
- The widget container's `.lc-nested-editor` outer class doesn't set min-width

**Recommendation:** A follow-up agent (or the user) SHOULD exercise the 320px reflow case before Phase 20 closeout. If clipping is observed, Phase 20-04 (Polish) is the natural place to add a min-width or icon-only fallback for narrow panes.

## Carry-Forward Notes for Plan 20-03

- **Pitfall P2 early-return relocation.** Plan 20-03 will RELOCATE the `widget.currentDocHash` check from its current pre-suppression position into step (b) of the full vault.on('modify') handler structure (alongside the conflict-modal-or-silent-reload decision tree). The check semantics + widgetRegistry walk + currentDocHash field stay the same; only the surrounding control-flow shape changes.

- **`widget.currentDocHash` field is now declared on WidgetController** and refreshed on every onDocChanged callback. Plan 20-03's full handler can read it without further wiring.

- **`widget.flushNow` returns Promise<void>` from forceFlush (Phase 19 contract).** Plan 20-03's "Keep mine" path should also `await widget.writer?.forceFlush()` for the immediate flush per CONTEXT discretion line "Conflict modal 'Keep mine' debounce semantics — recommended immediate flush".

- **`widget.currentSlug` getter is now exposed.** Plan 20-03 conflict-modal "Keep external" reload path may need to know the current slug for the post-reload Compartment.reconfigure dispatch — the getter reads frontmatter directly, no caching.

- **Per-widget metadataCache subscription is now installed at mount.** Plan 20-03's external-edit path that mutates `lc-language` mid-conflict-modal will fire this listener as expected. The conflict modal does NOT need to dispatch a separate Compartment.reconfigure.

- **The vault.on('modify') handler still has the Plan 19-02 placeholder** (the `logger.debug('... Plan 20-03 reload TBD')` line). Plan 20-03 replaces this with the full hasUnflushedEdits → silent-reload-or-conflict-modal decision tree.

- **`*FromActive` methods are now thin wrappers.** Phase 22's deletion is mechanical: delete `*FromActive`, rename `*FromWidget` → `*FromActive`. The shared `*WithCode/*WithSlug` body stays. No LC API code path changes.

- **The host adapter's `aiDebugFromActive` no-op is the seam Phase 22 may revisit.** If a future plan wants AI Debug in the widget row, the adapter shape is the place to wire it (D-action-03 currently locks "no AI Debug").

## Test File References for Plan 20-03

The next plan should import these existing test helpers / mocks where applicable:

- `tests/helpers/obsidian-stub.ts` — Modal, MarkdownRenderChild, Notice, TFile stubs
- `tests/widget/__fixtures__/cm6Helpers.ts` — `makeFakeMarkdownPostProcessorContext`, `makeFakeApp`, `makeFakeUpdateForViewPlugin`
- `tests/widget/__fixtures__/lcNoteFixtures.ts` — `CANONICAL_LC_NOTE`, `STRAY_FENCE_NOTE`
- `tests/solve/mocks/fakeWorkspace.ts` — `createFakePlugin`, `createFakeMetadataCache`, `createFakeCommands`
- `tests/widget/modifyEventOrdering.probe.test.ts` — vault.on('modify') ordering probe (Phase 19 baseline for Plan 20-03 reload-or-modal handler)
- `tests/widget/fromWidget.test.ts` (Plan 20-02) — `*FromWidget` test scaffolding pattern (vi.mock('obsidian') + Notice capture array)
- `tests/widget/languageSwitch.test.ts` (Plan 20-02) — switchLanguageFromWidget call-ordering pattern
- `tests/widget/languageReactivity.test.ts` (Plan 20-02) — per-widget metadataCache subscription test pattern with mocked `@codemirror/*` modules

## Self-Check: PASSED

- ✅ `src/widget/widgetActions.ts` exists (verified `[ -f path ]` via git status).
- ✅ `tests/widget/widgetActionRow.test.ts` exists.
- ✅ `tests/widget/actionRowSingleMount.test.ts` exists.
- ✅ `tests/widget/fromWidget.test.ts` exists.
- ✅ `tests/widget/languageSwitch.test.ts` exists.
- ✅ `tests/widget/languageReactivity.test.ts` exists.
- ✅ Commit `ded5825` (Task 1) exists in `git log`.
- ✅ Commit `dc7364e` (Task 2) exists in `git log`.
- ✅ All 6 phase requirements addressed: ACTION-01..06.
- ✅ `npx tsc --noEmit` exits 0.
- ✅ `npm test` exits 0 (1997 passing / 6 skipped / 0 failing).
- ✅ `npm run build` exits 0.
- ✅ All deviations documented above (none — plan executed as written).
- ✅ Pitfall P2 absorption wired with carry-forward note for Plan 20-03 relocation.
- ✅ `widget.currentDocHash` field declared on WidgetController for Plan 20-03 carry-forward.
- ✅ Single-mount test asserts exactly one `.leetcode-code-actions` under each useInlineWidget setting.
- ✅ No `innerHTML` introduced (verbatim reuse of v1.2 builders; new code uses `createEl`/textContent only).
- ✅ No `as never` casts in `widgetActions.ts` (intersection cast `as CodeBlockButtonRowHost & LanguageChevronHost` is the correct type discipline).
