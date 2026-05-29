# Phase 20: Reconciliation, UX, Action Row, Section Protection — Research

**Researched:** 2026-05-29
**Domain:** Obsidian community plugin (TypeScript) — UX-completing the v1.3 inline widget behind `useInlineWidget=OFF` so it can be flipped ON cleanly at Phase 22
**Confidence:** HIGH (load-bearing primitives all verified directly against `obsidian@1.13.0`'s shipped `obsidian.d.ts`, against the Phase 19 deliverables in-repo, and against the Phase 19 closeout's empirical probe results)

## Summary

Phase 20 makes the v1.3 inline widget UX-complete. It does not introduce new architectural primitives — every primitive is already present (Phase 19's `WidgetController` / `DebouncedWriter` / `SelfWriteSuppression` / `StatePersistenceMap` / two-path mount; v1.2's `codeBlockButtonRow` / `languageChevronWidget` / `languageCompartment` / `sectionLockExtension`). What Phase 20 does is **wire** these primitives into six surfaces (external-edit reconciliation + conflict modal, in-widget action row + chevron, language switching via frontmatter, narrowed `sectionProtectionExtension`, vim live-reconfigure, live theme retheme) without breaking the `useInlineWidget=OFF` regression baseline.

The empirical risks are bounded and well-located. (1) `@replit/codemirror-vim@6.3.0` does not document Compartment.reconfigure; CONTEXT L4 has pre-accepted the VIM-03 banner-on-toggle fallback for Phase 22. (2) `app.workspace.on('css-change')` is verified to exist in `obsidian.d.ts` (line 7137) — no MutationObserver fallback needed. (3) `app.fileManager.processFrontMatter` is async/Promise-returning; whether it triggers `vault.on('modify')` is documented as part of Obsidian's metadataCache pipeline but not explicitly tested in the v1.2 codebase under the new lc-language-only update shape — Plan 20-02 must probe. (4) Vim mode change detection has no documented event; recommendation is to `getConfig('vimMode')` poll on `workspace.on('layout-change')` (which Obsidian fires when settings save) AND on widget focus, and to compare against the cached mount-time value — see §"Vim Mode Change Detection" below.

**Primary recommendation:** Execute the four-plan vertical-slice structure from CONTEXT D-plan-01 verbatim. For each plan, anchor every empirical question to an explicit dev-vault probe before committing the primary path; CONTEXT L4 already pre-accepts VIM-03 banner fallback if Plan 20-01's vim probe fails.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Carry-Forward (locked by PROJECT.md / REQUIREMENTS.md / Phase 19 CONTEXT — not re-litigated):**
- **L1:** Conflict modal options = "Keep mine / Keep external / View diff" (ROADMAP.md §"Phase 20" success criterion 1).
- **L2:** Action buttons read code via `widget.childView.state.doc.toString()` — no disk round-trip (ACTION-04).
- **L3:** Language switch flow = chevron click → `processFrontMatter` → `metadataCache.on('changed')` → `Compartment.reconfigure` (ACTION-02, ACTION-03).
- **L4:** Vim live = `vimCompartment.reconfigure(vim() ↔ [])`; VIM-03 reload-on-toggle banner is the **pre-accepted** Phase 22 fallback if Phase 20 probe fails (REQUIREMENTS.md Q2; VIM-03).
- **L5:** Section protection narrows to `## Problem` body + `## Code` heading + `## Techniques` heading; fence opener/closer protection removed because widget owns the fence range via `atomicRanges` (PROTECT-01, PROTECT-02; Phase 19 C-05).
- **L6:** `'leetcode.*'` userEvent convention is NOT removed in Phase 20 — it is still load-bearing for the v1.2 path (chevron switch in Phase 5.3, Reset child dispatch in Phase 17 D-03). PROTECT-03 removal is Phase 22.
- **L7:** All 8 v1.2 language packs already carry over via Phase 19's `languageCompartment` from `src/main/childEditorLanguage.ts` (WIDGET-08).
- **L8:** Phase 19 captured `historyJSON` per widget on every state-persistence-map entry. Phase 20's conflict-modal reload consumes this for undo-stack continuity across reload.
- **L9:** `useInlineWidget=OFF` is the default through Phase 21; Phase 20 must remain regression-clean on both paths. Hard-gate from Phase 19 D-05 stays in force — when OFF, neither widget registration runs.
- **L10:** Single-active-per-file is the v1.3 baseline (REQUIREMENTS.md Q4). Multi-pane live/mirror is v1.4+ (MULTI-01, MULTI-02 deferred).

**Conflict Modal + Reload UX (D-conflict-01..04):**
- **D-conflict-01:** ANY unflushed chars in `debouncedWriter` trigger the conflict modal — `widget.debouncedWriter.hasPending() === true` at `vault.on('modify')` arrival; fall through to silent reload otherwise.
- **D-conflict-02:** "View diff" expands the modal in place to show three columns: **Mine** (widget doc), **External** (disk), **Merged preview** (line-by-line LCS diff). Pure-TS line-diff (longest-common-subsequence), ~150 LOC. New `src/widget/conflictDiff.ts`.
- **D-conflict-03:** Silent-reload (no-conflict path) cursor preservation = **line/col clamp**. Capture `(line, col)` from `widget.childView.state.selection.main`, clamp to new doc bounds after reload, restore.
- **D-conflict-04:** A second external edit arriving while the conflict modal is open updates the **External** column silently in place; the diff recomputes. No banner, no stacking.

**Action Row Layout & Contents (D-action-01..04):**
- **D-action-01:** Action row sits **below the editor body, above the fence closer**. Single horizontal strip via `Decoration.widget({ block: true, side: 1 })` at the closer-line END (matching v1.2's existing pattern).
- **D-action-02:** Reuse `src/main/codeBlockButtonRow.ts` **verbatim** with no API changes. CSS class `.leetcode-code-actions`, `space-between` + `margin-left:auto` rules already in place. The widget passes the chevron prefix factory via the existing `buildCodeBlockButtonRow(doc, plugin, { prefix })` API.
- **D-action-03:** Widget action row = **exact v1.2 set, exact v1.2 grouping**. Left (prefix slot, `justify-content: space-between` clings left): chevron + Retrieve + Reset. Right (`margin-left: auto` clings right): AI Solution + Run + Submit. **No AI Debug button. No Copy button.** ROADMAP.md correction is a Phase 20 documentation task.
- **D-action-04:** Add new **`*FromWidget(widget)` plugin methods**: `runFromWidget`, `submitFromWidget`, `aiSolutionFromWidget`, `resetFromWidget`, `retrieveLastSubmissionFromWidget`. Each reads `widget.childView.state.doc.toString()` directly. The v1.2 `*FromActive` methods are unchanged. At Phase 22, `*FromActive` methods are deleted; `*FromWidget` become the only path.

**Section Protection Scope (D-protect-01..04):**
- **D-protect-01:** Protected regions in v1.3 = `## Problem` body + `## Code` heading + `## Techniques` heading. **Drop:** fence opener line, fence closer line, body-between-opener-and-closer (the widget owns this range entirely via `atomicRanges`). **Keep `## Code` heading locked**.
- **D-protect-02:** `sectionProtectionExtension.ts` keeps the `'leetcode.*'` userEvent bypass **verbatim** from `sectionLockExtension.ts`. PROTECT-03 (Phase 22) removes the convention together with the v1.2 path deletion.
- **D-protect-03:** Lifecycle = **mutually exclusive** with `sectionLockExtension`. The new `sectionProtectionExtension.ts` registers when `useInlineWidget=ON`; the existing `sectionLockExtension.ts` registers when `useInlineWidget=OFF`.
- **D-protect-04:** Build path = **fork `sectionLockExtension.ts` → `sectionProtectionExtension.ts`**, surgically remove the fence-opener and fence-closer cases from the protected-ranges builder. Preserve verbatim: boundary fix, blank-line pocket logic, malformed-note path, `'leetcode.*'` userEvent bypass, atomicRanges integration. Net ~150 LOC removed from a 527 LOC base.

**Plan Structure (D-plan-01, D-plan-02):**
- **D-plan-01:** **4 vertical slices.**
  - **Plan 20-01 — Section protection narrowing + vim live-reconfigure (Foundation).**
  - **Plan 20-02 — Action row + language chevron + *FromWidget methods (UX).**
  - **Plan 20-03 — External-edit reconciliation + conflict modal + 3-pane diff (Sync).**
  - **Plan 20-04 — Live theme retheme + multi-pane "Take over" affordance (Polish).**
- **D-plan-02:** **Plan order = sequential foundation → UX → sync → polish.** Each plan is a dogfood checkpoint.

### Claude's Discretion

- **Theme detection probe:** `app.workspace.on('css-change')` may or may not exist in `obsidian@1.12.3` — verified via grep; **EXISTS** at `node_modules/obsidian/obsidian.d.ts:7137`. MutationObserver is the documented fallback regardless (defensive, but not needed).
- **Vim live-reconfigure failure-mode classification:** Plan 20-01 dev-vault probe should treat "reconfigure works but insert-mode mid-keystroke is glitchy" as a fail (ship VIM-03 banner in Phase 22); "reconfigure works cleanly only after one no-op keystroke" is a pass.
- **Multi-pane "Take over" UX:** Plan 20-04 designer + planner pick between greyed-out+CTA vs. frozen-readonly snapshot vs. banner-across-both-panes.
- **`MarkdownView.editor.cm` exposure:** widget edits to the parent doc go through `app.fileManager.processFrontMatter`, not direct `cm.dispatch`. Planner may need to verify `processFrontMatter` ↔ `vault.on('modify')` ordering empirically.
- **3-pane diff UX details:** column widths, syntax-highlighting on Mine/External columns, diff marker style, scroll synchronization.
- **Conflict-modal "Keep mine" mechanics:** does it bump the disk write through `debouncedWriter.flush()` immediately or queue a normal debounced write? Recommendation: immediate flush.

### Deferred Ideas (OUT OF SCOPE)

- **AI Debug button in widget action row** — Currently AI Debug is invokable via command palette only.
- **Copy button in widget action row** — User can Cmd-A Cmd-C in the editor.
- **Multi-pane live/mirror sync (MULTI-01, MULTI-02)** — v1.4+. Phase 20 ships single-active-per-file with "Take over" CTA only.
- **PROTECT-03: `'leetcode.*'` userEvent removal from sectionProtectionExtension + CLAUDE.md** — Phase 22.
- **VIM-03: Reload-on-toggle banner** — Phase 22, only if Plan 20-01 dev-vault probe shows live-reconfigure is empirically unreliable.
- **THEME-05: Theme regression visual gate (top 5 community themes)** — Phase 22 release gate.
- **DELETE-01..07: v1.2 file deletion** — Phase 22.
- **POLISH-01: `useInlineWidget` flip to default ON** — Phase 22.
- **ROADMAP s.c. 2 wording correction** — change "Run / Submit / AI Debug / Reset / Copy" to "Retrieve / Reset / AI Solution / Run / Submit" to match v1.2 button set.
- **`processFrontMatter` ↔ `vault.on('modify')` ordering probe** — Plan 20-02 may discover frontmatter writes trigger a modify event the widget's selfWriteSuppression must absorb.
- **3-pane diff syntax-highlighting** — recommended yes (reuse `languageCompartment` for the active language) but planner can defer.
- **Conflict modal "Keep mine" debounce semantics** — recommended immediate flush.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SYNC-04** | External edits reload the widget via `vault.on('modify')` with cursor-preserving dispatch | §"External-Edit Reconciliation Path" + §"Cursor Preservation Pattern" + §"Code Examples — Reload-with-cursor" |
| **SYNC-05** | Conflict modal appears when external edit arrives during local in-flight typing | §"Conflict Modal Architecture" + §"Pure-TS LCS Diff" + §"Code Examples — ConflictModal" |
| **ACTION-01** | Run/Submit/AI Solution/Retrieve/Reset buttons mount inside widget DOM | §"Action Row Mount Inside Widget DOM" + reuse of `codeBlockButtonRow.ts` verbatim |
| **ACTION-02** | Language chevron mounts inside widget; click flips `lc-language` frontmatter via `processFrontMatter` | §"Language Switch Flow" + reuse of `languageChevronWidget.ts` |
| **ACTION-03** | Widget reacts to `metadataCache.on('changed')` and applies `Compartment.reconfigure` | §"Language Switch Flow" — verified `MetadataCache.on('changed')` signature in `obsidian.d.ts:4309` |
| **ACTION-04** | Action buttons read code via `widget.childView.state.doc.toString()` (no disk round-trip) | §"*FromWidget Methods" + §"Code Examples — *FromWidget" |
| **ACTION-05** | Action row uses flex-wrap layout, CSS variable discipline, focus save/restore on button click | Existing `codeBlockButtonRow.ts` already implements `mousedown.preventDefault` for focus retention |
| **ACTION-06** | Reading-mode action row continues to render via `codeActionsPostProcessor.ts` (unchanged) | Verified — Reading mode is read-only; `codeActionsPostProcessor.ts` is touched by neither plan |
| **PROTECT-01** | `src/main/sectionProtectionExtension.ts` (replacing `sectionLockExtension.ts`) protects only `## Problem` body + `## Techniques` heading | §"Section Protection Narrowing — Forking Strategy" + §"What to Preserve Verbatim" |
| **PROTECT-02** | Fence opener and closer protection is removed (widget owns the fence range) | §"What to Delete from the Fork" |
| **VIM-02** | Live `Compartment.reconfigure(enabled ? vim() : [])` swaps vim on/off without rebuilding the EditorView | §"Vim Live-Reconfigure" + §"Vim Mode Change Detection" + §"Probe Procedure" |
| **THEME-04** | Theme changes re-theme the widget live — no note reload | §"Live Theme Retheme" — `app.workspace.on('css-change')` verified at `obsidian.d.ts:7137` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| External-edit detection (`vault.on('modify')`) | Plugin (main.ts) | Widget (`WidgetController`) | Single global listener filters by path; per-widget reconciliation in controller. Single listener avoids N-listener fanout for vaults with many open widgets. |
| Self-write suppression check | Widget (`SelfWriteSuppression` singleton) | Plugin (suppression `arm` from `DebouncedWriter`, `tryConsume` from main's modify listener) | Per-path content-hash map keyed by `file.path`; armed in widget's writer, consumed in plugin's modify handler. |
| Conflict-pending detection | Widget (`debouncedWriter.hasPending()`) | Plugin (consults via `WidgetRegistry.get(key)`) | Pending state is per-widget (different debounce timers per widget); plugin asks widget. |
| Conflict modal rendering | UI (`Obsidian.Modal` extension in `src/widget/ConflictModal.ts`) | Plugin (constructs + opens) | Standard Obsidian Modal pattern; modal owns its own DOM. |
| Pure-TS LCS line diff | Pure data layer (`src/widget/conflictDiff.ts`) | Modal (consumes) | No DOM, no I/O — pure function for testability. |
| Action row DOM | Widget (`WidgetController.mount` + `widgetActions.ts` adapter) | Reuse `src/main/codeBlockButtonRow.ts` verbatim | Reading-mode keeps using `codeActionsPostProcessor.ts` unchanged (ACTION-06). |
| `*FromWidget` business logic | Plugin (`src/main.ts`) | Widget (calls plugin) | Same downstream LC API path as `*FromActive`; widget supplies code via `state.doc.toString()`. |
| Language switch atomic write | Plugin (existing `app.fileManager.processFrontMatter`) | Widget (subscribes to `metadataCache.on('changed')`, calls `Compartment.reconfigure`) | Frontmatter is the single source of truth; widget reacts. |
| `languageCompartment.reconfigure` dispatch | Widget (`WidgetController` per-widget) | — | Compartment is module-singleton (Phase 16 Pitfall C); dispatches target each widget's own `EditorView`. |
| `vimCompartment` (NEW) | Widget (per-widget) | — | New Compartment scoped to the widget; same shape as `languageCompartment`. |
| Vim setting change detection | Plugin (workspace listener / settings sentinel) | Widget (called per-widget reconfigure) | Obsidian fires no documented event; needs `workspace.on('layout-change')` poll OR settings-tab onChange wire. |
| Section protection (`sectionProtectionExtension`) | Parent CM6 extension (registered on parent EditorView) | — | Same surface as v1.2 `sectionLockExtension`; mutually exclusive registration based on `useInlineWidget`. |
| Theme listener (`css-change`) | Plugin (single global listener) | Widget (per-widget retheme via `WidgetRegistry`) | One listener, fan out to all widgets via registry. |
| Multi-pane "Take over" affordance | Plugin (per-pane focus tracking) | Widget (visual greyed-out state) | Walks `widgetRegistry`; the active widget is editable, others are greyed. |

## Standard Stack

### Core (No new dependencies — all already pinned)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` (npm) | `1.12.3` (installed) → `1.13.0` (npm latest as of 2026-05-29) [VERIFIED: npm view] | Modal, MetadataCache.on, processFrontMatter, Workspace.on('css-change'), debounce | All Phase 20 surface verified against installed `obsidian.d.ts` 1.12.3 |
| `@codemirror/state` | `6.5.0` (installed) [VERIFIED: codebase grep] | Compartment.reconfigure, EditorState.changeFilter, Transaction.userEvent, EditorSelection | Same as v1.2 / Phase 19 |
| `@codemirror/view` | `6.38.6` (installed) [VERIFIED: codebase grep] | EditorView.atomicRanges, Decoration.widget, Decoration.replace | Same as v1.2 / Phase 19 |
| `@replit/codemirror-vim` | `6.3.0` (installed) [VERIFIED: npm view returns 6.3.0 latest] | `vim()` extension; live Compartment.reconfigure UNDOCUMENTED — Phase 20 empirical probe | Already pinned and used by Phase 19 `WidgetController` at construction time |

### Supporting (No new entries — Phase 20 reuses Phase 19 + v1.2 modules)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@codemirror/commands` | `6.10.3` [VERIFIED: codebase grep] | `historyField` for state-persistence consumption, `defaultKeymap`, `historyKeymap` | Conflict-modal reload's history rehydrate path |
| `@codemirror/language` | `6.12.3` | `bracketMatching`, `indentUnit` | Already in widget extensions |
| `@codemirror/autocomplete` | `6.20.2` | `closeBracketsKeymap` | Already in widget extensions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-TS LCS line diff (~150 LOC) | `diff` library (~6KB gzipped) | Adds runtime dep; LCS is one O(m·n) function; testable in isolation; `diff` library would also need wrapping for our 3-pane row layout. **Reject:** the simplification is not worth a dep. |
| Pure-TS LCS line diff | Myers diff (more efficient for similar inputs) | LCS is simpler to verify; ~150 LOC for a feature whose worst-case input is a fence body (~150 lines). **Reject Myers** — not needed for this scale. |
| `app.workspace.on('css-change')` | `MutationObserver` on `document.body.classList` | css-change is the documented Obsidian primitive; MutationObserver is more general but observes every body-class flip (not just theme changes). **Use css-change**; document MutationObserver as fallback per CONTEXT discretion. |
| `vimCompartment.reconfigure(vim() ↔ [])` | Reload widget on vim toggle (VIM-03) | Reconfigure preserves cursor + scroll + history; reload destroys per-widget state. **Use reconfigure first** with VIM-03 banner as the pre-accepted Phase 22 fallback (CONTEXT L4). |
| `metadataCache.on('changed')` listener | Polling `getFileCache(file).frontmatter['lc-language']` | Polling adds polling cost + delay; metadataCache event is the documented signal. **Use metadataCache.on('changed')**. |
| Three-pane diff inside same Modal | Three separate modals | Three modals split user attention; the diff IS the resolution surface. **Inline-expand** per CONTEXT D-conflict-02. |
| `*FromWidget` methods alongside `*FromActive` | Mediator interface (`CodeSource`) | Mediator adds ceremony; the existing `*FromActive` shape is already 5 well-defined methods. **Use parallel methods**; Phase 22 deletes `*FromActive` and renames `*FromWidget` mechanically. |

**Installation:** None — Phase 20 introduces no new dependencies. All primitives come from `obsidian@1.12.3`, `@codemirror/state@6.5.0`, `@codemirror/view@6.38.6`, `@replit/codemirror-vim@6.3.0` — already pinned and verified externally for Phase 19.

**Version verification (run before write):**
```bash
npm view obsidian version            # → 1.13.0 (latest); installed 1.12.3 — npm view confirms parity
npm view @replit/codemirror-vim version  # → 6.3.0 (latest); installed 6.3.0 — current
npm view turndown version            # → 7.2.4 (HTML→MD library; not used by Phase 20 but pinned for project)
```

## Package Legitimacy Audit

> Phase 20 introduces no new package installs. All packages below are already in the project's `package.json` and have been audited at v1.2 / Phase 19 install time.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `obsidian` | npm | 5+ yrs (1.13.0 as of 2026-05-29) | 100K+/wk | github.com/obsidianmd/obsidian-api | OK (already in tree) | Approved (carry-forward) |
| `@codemirror/state` | npm | 4+ yrs (6.5.0 installed) | 4M+/wk | github.com/codemirror/state | OK (already in tree) | Approved (carry-forward) |
| `@codemirror/view` | npm | 4+ yrs (6.38.6 installed) | 4M+/wk | github.com/codemirror/view | OK (already in tree) | Approved (carry-forward) |
| `@codemirror/commands` | npm | 4+ yrs (6.10.3 installed) | 1M+/wk | github.com/codemirror/commands | OK (already in tree) | Approved (carry-forward) |
| `@replit/codemirror-vim` | npm | 4+ yrs (6.3.0) | 7K+/wk | github.com/replit/codemirror-vim | OK (already in tree) | Approved (carry-forward) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

slopcheck was available in this research session. No new installs are proposed by Phase 20 — every recommended import comes from packages that v1.2 / Phase 19 already vetted. The Phase 20 planner does not need a `checkpoint:human-verify` task.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌────────────────────────────────────────────────────────────────────┐
                          │            Obsidian core: vault.on('modify') / metadataCache       │
                          │            workspace.on('css-change') / workspace.on('quit')       │
                          │                vault.on('rename') / processFrontMatter             │
                          └─────────────────────────┬──────────────────────────────────────────┘
                                                    │
                                                    │  events fire
                                                    ▼
        ┌──────────────────────────────────────────────────────────────────────────────────────┐
        │                              src/main.ts (Plugin.onload)                            │
        │                                                                                      │
        │   When useInlineWidget=ON:                                                            │
        │     - registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor)   │
        │     - registerEditorExtension([leetCodeFenceViewPlugin])                              │
        │     - registerEditorExtension(buildSectionProtectionExtension)   ← NEW Plan 20-01     │
        │     - registerEvent(vault.on('modify', externalEditDispatcher))  ← NEW Plan 20-03     │
        │     - registerEvent(metadataCache.on('changed', langSwitchDispatcher))  ← Plan 20-02  │
        │     - registerEvent(workspace.on('css-change', themeDispatcher))  ← NEW Plan 20-04    │
        │     - settings onChange (vimMode → vimReconfigureDispatcher)     ← NEW Plan 20-01     │
        │     - settings onChange (widgetSyncDebounceMs → registry.applyDelay)                  │
        │                                                                                      │
        │   When useInlineWidget=OFF:                                                           │
        │     - registerEditorExtension(buildSectionLockExtension)         ← v1.2 unchanged     │
        │     - registerCodeBlockActionProcessor / buildCodeActionsEditorExtension              │
        │                                                                                      │
        │   *FromWidget methods (Plan 20-02):                                                   │
        │     runFromWidget / submitFromWidget / aiSolutionFromWidget /                          │
        │     resetFromWidget / retrieveLastSubmissionFromWidget                                │
        │     → read widget.childView.state.doc.toString()                                      │
        │     → route to same downstream LC API as *FromActive                                  │
        └────────────────────────────────────┬───────────────────────────────────────────────┘
                                             │ holds plugin singletons:
                                             ▼
        ┌──────────────────────────────────────────────────────────────────────────────────────┐
        │                                Plugin singletons                                     │
        │   widgetRegistry: WidgetRegistry          [Phase 19]                                 │
        │   selfWriteSuppression: SelfWriteSuppression  [Phase 19]                             │
        │   statePersistence: StatePersistenceMap    [Phase 19]                                │
        └────────────────────────────────────┬───────────────────────────────────────────────┘
                                             │
                                             ▼
        ┌──────────────────────────────────────────────────────────────────────────────────────┐
        │                         Per-widget WidgetController (Phase 19)                        │
        │   - view: EditorView                                                                  │
        │   - writer: DebouncedWriter (Phase 19 C-06; hasPending() trigger for conflict modal) │
        │   - container: HTMLElement                                                            │
        │   - persistenceKey: ${file.path}::${fenceIndex}                                       │
        │                                                                                      │
        │   Phase 20 ADDS:                                                                      │
        │   - actionRow: HTMLDivElement (mounted into container after editor body)             │
        │   - languageCompartment.reconfigure on metadataCache changed                           │
        │   - vimCompartment (NEW) — separate Compartment from languageCompartment              │
        │   - reloadFromDisk(extReason: 'silent' | 'keep-external')                             │
        │   - hasUnflushedEdits() = writer.hasPending()                                         │
        │   - cssRetheme() = forced reflow on css-change                                        │
        │   - greyedOut: boolean (multi-pane "Take over" affordance — Plan 20-04)               │
        └──────────────────────────────────────────────────────────────────────────────────────┘

   Modal flow (Plan 20-03):
   ┌──────────────────────────────────────────────────────────────────────────────────────────┐
   │  vault.on('modify', file)                                                                │
   │    → if file.path matches widget AND !suppression.consumed                              │
   │       → if !widget.hasUnflushedEdits()                                                   │
   │            → silent reloadFromDisk('silent')                                             │
   │       → else                                                                              │
   │            → if conflictModal.isOpenFor(file.path)                                       │
   │                 → conflictModal.updateExternalContent(newDiskBody)  [D-conflict-04]      │
   │            → else                                                                         │
   │                 → new ConflictModal(app, widget, mineDoc, externalDisk).open()           │
   │                   user picks:                                                             │
   │                     "Keep mine"     → debouncedWriter.flush() + close                    │
   │                     "Keep external" → reloadFromDisk('keep-external') + close            │
   │                     "View diff"     → modal.expandDiff() (3-column LCS)                  │
   └──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── main/
│   ├── sectionLockExtension.ts          # v1.2 — registered when useInlineWidget=OFF (D-protect-03)
│   ├── sectionProtectionExtension.ts    # NEW (~370 LOC after fork+remove) — Plan 20-01
│   ├── codeBlockButtonRow.ts            # Reused verbatim by Plan 20-02 widget action row
│   ├── languageChevronWidget.ts         # Reused verbatim by Plan 20-02 chevron prefix factory
│   ├── codeActionsEditorExtension.ts    # v1.2 — used only when useInlineWidget=OFF
│   ├── codeActionsPostProcessor.ts      # UNCHANGED — reading-mode v1.2 path (ACTION-06)
│   ├── childEditorLanguage.ts           # languageCompartment + buildLanguageExtensions (Plan 20-02)
│   ├── childEditorTheme.ts              # Container classes that cascade Obsidian CSS (Plan 20-04)
│   └── childEditorSemanticClasses.ts    # Lezer→CSS class mapping (Plan 20-04 retheme)
└── widget/
    ├── codeBlockProcessor.ts            # Phase 19 — extended in Plan 20-02 (action-row container)
    ├── liveModeViewPlugin.ts            # Phase 19 — extended in Plan 20-02 + 20-04
    ├── WidgetController.ts              # Phase 19 — extended by every Plan 20 plan
    ├── LeetCodeFenceWidget.ts           # Phase 19 — extended in Plan 20-02 + 20-04
    ├── debouncedWriter.ts               # Phase 19 — Plan 20-03 reads hasPending() for conflict trigger
    ├── selfWriteSuppression.ts          # Phase 19 — Plan 20-03 reads tryConsume() for self vs. external
    ├── statePersistence.ts              # Phase 19 — Plan 20-03 hydrates historyJSON post-conflict reload
    ├── widgetRegistry.ts                # Phase 19 — Plan 20-04 multi-pane affordance walks this
    ├── embedDetect.ts                   # Phase 19 — Plan 20-02 must skip action-row for embeds
    ├── widgetActions.ts                 # NEW (~80 LOC) — Plan 20-02 action-row mount adapter
    ├── ConflictModal.ts                 # NEW — Plan 20-03 (extends Obsidian.Modal)
    ├── conflictDiff.ts                  # NEW (~150 LOC) — Plan 20-03 pure-TS LCS line diff
    ├── themeListener.ts                 # NEW — Plan 20-04 (css-change event or MutationObserver fallback)
    └── multiPaneCoordinator.ts          # NEW — Plan 20-04 pane focus tracking + "Take over" CTA
```

### Pattern 1: Section Protection Narrowing — Forking Strategy

**What:** Replace `sectionLockExtension.ts` (527 LOC) with `sectionProtectionExtension.ts` (~370 LOC after fork+remove). Drop fence-opener and fence-closer protection because the widget owns the fence range via `EditorView.atomicRanges`. Preserve every other v1.0/v1.2-validated edge case verbatim.

**When to use:** Phase 20 Plan 20-01 only. Mutually exclusive registration with `sectionLockExtension` based on `useInlineWidget` setting (CONTEXT D-protect-03).

**What to Preserve Verbatim (from `src/main/sectionLockExtension.ts`):**
- The boundary fix at line 416–430 (UAT 2026-05-13): `expanded.push(Math.max(0, (ranges[i] as number) - 1));` — extends each lock's `from` backward by 1, clamped at 0, so boundary insertions at lock start don't pass through.
- The `'leetcode.*'` userEvent bypass at lines 384–391 (Pitfall 5 / D-04). PROTECT-03 (Phase 22) removes this; Phase 20 keeps it verbatim per CONTEXT L6 + D-protect-02.
- The `Gate 0 isUserInput` check at lines 374–381 — only suppress changes for known user-input userEvents (`input.*`, `delete.*`, `undo`, `redo`). UAT 2026-05-13 regression fix that prevents vault-sync corruption.
- The `tr.startState` discipline at lines 33–35 (Pitfall 2) — read pre-transaction state, NEVER post-transaction state.
- The `## Problem` body lock at lines 144–156 — heading + entire body until next canonical heading.
- The blank-line pocket logic in `## Code` heading lock at lines 168–195 — extends heading lock through the fence opener so blank lines between `## Code` and the opener are also locked. **Note:** this region IS preserved (the heading + opener line lock still locks the blank-line pocket between them, but the fence opener line itself is now editable because the widget owns the range and `atomicRanges` keeps the cursor out — preserve the heading+pocket lock; remove only the fence opener-to-closer body lock).
- The malformed-note path at lines 191–193 — when `findCodeFence` returns null, only the heading line is locked.
- The `mergeLockedRanges` helper at lines 228–243 — coalesces flat range list into sorted disjoint tuples (transactionFilter snap relies on merged shape).
- The `computeSnapTarget` helper at lines 263–285 — UAT 2026-05-13 derived snap-decision tree.
- The `transactionFilter` selection-snap logic at lines 453–520 — collapsed-cursor only, not selections.
- The `EditorView.decorations.of` line decoration at lines 522–525 — `.leetcode-locked-heading-line` class for heading-marker hiding.
- The `atomicRanges` integration (or its absence — UAT 2026-05-13 noted atomicRanges was removed in favor of transactionFilter for cursor-motion handling; preserve that decision).

**What to Delete from the Fork:**
- The `## Code` body lock between fence opener and closer at lines 168–195. With v1.3, the widget owns this range entirely via `atomicRanges` from the ViewPlugin (Phase 19 C-05 — `liveModeViewPlugin.ts:135-139` exposes the same RangeSet to `EditorView.atomicRanges`). The fence opener line lock is dropped. The fence closer line lock is also dropped.
- BUT: keep the lock from `## Code` heading line through end-of-pocket (the blank line(s) before the opener line). The opener line itself becomes editable in the file (but `atomicRanges` keeps the parent cursor out).
- BUT: keep the lock from `## Techniques` heading. Drop nothing else from the heading suite.

**Net change:** 527 LOC → ~370 LOC after fork+remove.

**Code reference (from `src/main/sectionLockExtension.ts:160-195`):**
```typescript
} else if (cur.kind === 'code') {
  const fence = findCodeFence(state);
  if (fence) {
    const opener = state.doc.line(fence.openerLine);
    const closer = state.doc.line(fence.closerLine);
    const openerTo =
      fence.openerLine < total
        ? state.doc.line(fence.openerLine + 1).from
        : opener.to;
    out.push(headFrom, openerTo);
    // ↑ KEEP: heading + blank-line pocket + opener-line lock — preserves the v1.2 cosmetic lock.
    //   In v1.3 with widget mounted, the opener line never receives keystrokes anyway
    //   (atomicRanges keeps the parent cursor out), but locking it explicitly defends
    //   the no-widget mode (e.g., useInlineWidget=ON but the widget hasn't mounted yet).

    const nextHeadingLine = ...;
    const closerLockTo = ...;
    out.push(closer.from, closerLockTo);
    // ↑ DELETE in sectionProtectionExtension.ts: fence closer lock is no longer needed.
    //   The widget owns the closer line range via atomicRanges; if the user is in Source mode
    //   (no widget rendered), they're explicitly editing raw fence and that's intentional.
    //   BUT preserve the post-closer pocket → next-heading lock for blank-line aesthetics.
  } else {
    out.push(headFrom, headTo);
    // ↑ KEEP: malformed-note path — only heading locked.
  }
}
```

### Pattern 2: Action Row Mount Inside Widget DOM

**What:** Mount `buildCodeBlockButtonRow(doc, plugin, { prefix })` inside the widget's container element, below the editor body, before the widget container's last child. Both Live-Preview and Reading-mode widgets render the action row (matching v1.2's behavior; reading-mode widgets are read-only via `EditorView.editable.of(false)` — buttons fire same handlers).

**When to use:** Plan 20-02. Skip mount when widget is in embed context (`isEmbedContext` returns true; Phase 19 `embedDetect.ts` already gates).

**Pattern:**
```typescript
// src/widget/widgetActions.ts (NEW, ~80 LOC)
import { buildCodeBlockButtonRow } from '../main/codeBlockButtonRow';
import { buildLanguageChevron } from '../main/languageChevronWidget';
import type { TFile } from 'obsidian';
import type { WidgetController } from './WidgetController';

export function mountActionRow(
  ctl: WidgetController,
  file: TFile,
  currentSlug: string,
  doc: Document,
): HTMLDivElement {
  // CodeBlockButtonRowHost adapter — routes *FromActive to *FromWidget.
  const host = {
    runFromActive: () => ctl.plugin.runFromWidget(ctl),
    submitFromActive: () => ctl.plugin.submitFromWidget(ctl),
    aiDebugFromActive: () => Promise.resolve(),  // not in widget row (D-action-03)
    aiSolutionFromActive: () => ctl.plugin.aiSolutionFromWidget(ctl),
    resetFromActive: () => ctl.plugin.resetFromWidget(ctl),
    retrieveLastSubmissionFromActive: () => ctl.plugin.retrieveLastSubmissionFromWidget(ctl),
    switchLanguage: (f: TFile, slug: string) => ctl.plugin.switchLanguageFromWidget(ctl, f, slug),
  };
  const row = buildCodeBlockButtonRow(doc, host as never, {
    prefix: () => buildLanguageChevron(doc, host as never, file, currentSlug),
  });
  ctl.container.appendChild(row);
  return row;
}
```

**Why:** Verbatim reuse of `codeBlockButtonRow.ts` matches CONTEXT D-action-02. The chevron passes through the existing `prefix` slot. The CodeBlockButtonRowHost adapter shape matches the existing `interface` at `src/main/codeBlockButtonRow.ts:3-11`.

### Pattern 3: Language Switch Flow

**What:** Chevron click → `processFrontMatter('lc-language', newLang)` → `metadataCache.on('changed')` → `Compartment.reconfigure(buildLanguageExtensions(newLang, indent))`.

**When to use:** Plan 20-02 (ACTION-02, ACTION-03).

**Why:** Frontmatter is the single source of truth for language. `processFrontMatter` is atomic and Obsidian fires `metadataCache.on('changed')` automatically when the cached metadata is updated. The widget subscribes to `metadataCache.on('changed')` filtered by file path; on each fire, it re-reads frontmatter and dispatches a Compartment.reconfigure.

**Code (verified pattern from existing v1.2 code at `src/main.ts:2703-2790`):**
```typescript
// Plan 20-02: switchLanguageFromWidget routes the chevron click for v1.3 widgets.
async switchLanguageFromWidget(ctl: WidgetController, file: TFile, newSlug: string): Promise<void> {
  // Step 1 — flush widget edits BEFORE frontmatter write so any pending
  //          characters land under the OLD language slug. Otherwise the
  //          metadataCache.on('changed') reconfigure could fire while the
  //          debounced flush is in flight, producing a doc parsed under the
  //          new language but with characters typed under the old.
  await ctl.flushNow();

  // Step 2 — atomic frontmatter rewrite. Obsidian fires
  //          metadataCache.on('changed', file) automatically.
  await this.app.fileManager.processFrontMatter(file, (fm) => {
    fm['lc-language'] = newSlug;
  });
  // No CM6 dispatch into the parent. v1.3 has no fence opener language tag
  // to rewrite (CONTEXT C-01: leetcode-solve is fixed); chevron only updates
  // frontmatter. The widget's metadataCache.on('changed') listener does the
  // Compartment.reconfigure (Step 3 below).
}

// Plan 20-02: WidgetController constructor adds the metadataCache subscription.
// (Conceptual — actual code lives in main.ts onload, scoped per-widget via the registry.)
this.registerEvent(
  this.app.metadataCache.on('changed', (file) => {
    const widget = this.widgetRegistry.getByFilePath(file.path);
    if (!widget) return;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const newSlug = (typeof fm?.['lc-language'] === 'string') ? fm['lc-language'] as string : 'python3';
    const indent = this.settings.getIndentSizeOverride();
    widget.view.dispatch({
      effects: languageCompartment.reconfigure(buildLanguageExtensions(newSlug, indent)),
    });
  })
);
```

**Verified API signature (`obsidian.d.ts:4309`):**
```typescript
on(name: 'changed', callback: (file: TFile, data: string, cache: CachedMetadata) => any, ctx?: any): EventRef;
```

### Pattern 4: External-Edit Reconciliation Path

**What:** A single global `vault.on('modify')` listener filters by path, consults `selfWriteSuppression.tryConsume(path, observedHash)`, and routes to either silent reload, conflict modal, or a no-op (consumed self-write).

**When to use:** Plan 20-03.

**Three-way decision tree:**
```
vault.on('modify', file)
  │
  ├─ file.path matches no widget? → no-op
  │
  ├─ widget = widgetRegistry.getByFilePath(file.path)  (Phase 20-04 may have multiple panes;
  │                                                    iterate all matching widgets)
  │
  ├─ Read fresh disk: const newDisk = await app.vault.read(file)
  │
  ├─ Compute fence body hash: const observedHash = await sha1(extractFenceBody(newDisk, fenceIndex) ?? '')
  │
  ├─ Outcome = selfWriteSuppression.tryConsume(file.path, observedHash):
  │
  ├─ 'consumed'  → self-write echo, no widget action (already absorbed)
  ├─ 'stale'     → entry expired before consume; treat as external (rare race)
  ├─ 'miss'      → no entry, OR hash mismatch within TTL (race)
  │                  → check widget.hasUnflushedEdits():
  │                       false → silent reload (D-conflict-03 line/col cursor preservation)
  │                       true  → conflict modal (D-conflict-01..04)
  │
  └─ For multi-widget case (multi-pane same file), iterate all widgets:
        - Pane that originated the write got 'consumed' — no action
        - Other panes get 'miss' — they reload silently if not editing,
          conflict modal if they ARE editing in their own debouncedWriter
```

**Why:** Phase 19's `selfWriteSuppression` was specifically designed for this 3-state outcome (`'consumed' | 'stale' | 'miss'`). The widget's `hasUnflushedEdits()` is `debouncedWriter.hasPending()` — a method we need to ADD to `DebouncedWriter` (Phase 19's writer has `cancel`, `forceFlush`, `setDelay`, `run` but no `hasPending` accessor).

**Action item for Plan 20-03:** Add `hasPending()` to `src/widget/debouncedWriter.ts`. Implementation: check whether `this.deb.cancel()` has anything to cancel (the Obsidian Debouncer doesn't expose this directly; Plan 20-03 must wrap with a sentinel boolean reset on `flush()` and set on `run()`).

### Pattern 5: Pure-TS LCS Diff (`conflictDiff.ts`)

**What:** Line-level Longest Common Subsequence diff between two strings, returning `DiffRow[]` for 3-column rendering: `{ kind: 'same' | 'mine' | 'external' | 'changed'; mineLine?: string; externalLine?: string }`.

**When to use:** Plan 20-03 ConflictModal "View diff" expansion.

**Algorithm:** Standard dynamic-programming LCS, O(m·n) for inputs of length m, n. For a fence body of ~150 lines, this is ~22,500 operations — instant.

**Reference algorithm (skeleton):**
```typescript
// src/widget/conflictDiff.ts (NEW, ~150 LOC)
export interface DiffRow {
  kind: 'same' | 'mine-only' | 'external-only' | 'changed';
  mine?: string;
  external?: string;
}

export function lineDiff(mine: string, ext: string): DiffRow[] {
  const m = mine.split('\n');
  const e = ext.split('\n');
  // DP table — m.length+1 rows × e.length+1 cols, initialized with zeros
  const dp: number[][] = Array.from({ length: m.length + 1 }, () =>
    Array.from({ length: e.length + 1 }, () => 0),
  );
  for (let i = 1; i <= m.length; i++) {
    for (let j = 1; j <= e.length; j++) {
      if (m[i - 1] === e[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  // Backtrack
  const out: DiffRow[] = [];
  let i = m.length, j = e.length;
  while (i > 0 && j > 0) {
    if (m[i - 1] === e[j - 1]) {
      out.push({ kind: 'same', mine: m[i - 1], external: e[j - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ kind: 'mine-only', mine: m[i - 1] });
      i--;
    } else {
      out.push({ kind: 'external-only', external: e[j - 1] });
      j--;
    }
  }
  while (i > 0) { out.push({ kind: 'mine-only', mine: m[--i] }); i; }
  while (j > 0) { out.push({ kind: 'external-only', external: e[--j] }); j; }
  return out.reverse();
}
```

**Why standard LCS:** Smallest correct algorithm for the scale; ~150 LOC budget; pure function for unit testability; no `diff` library dep needed (CONTEXT D-conflict-02 specifies "pure-TS line-diff... ~150 LOC").

### Pattern 6: Vim Live-Reconfigure (VIM-02) — Probe Procedure

**What:** Maintain a separate `vimCompartment` per widget; on vim setting change, dispatch `vimCompartment.reconfigure(vimEnabled ? vim() : [])`. Live-toggle without rebuilding the EditorView.

**When to use:** Plan 20-01.

**Probe procedure (from CONTEXT additional_context):**

The library `@replit/codemirror-vim@6.3.0` README is silent on Compartment.reconfigure runtime-toggle. Phase 20 Plan 20-01 must run a dev-vault probe to determine whether the live-reconfigure works empirically. CONTEXT L4 has pre-accepted the VIM-03 banner fallback for Phase 22 if the probe fails.

**Pass criteria (probe succeeds, ship live-reconfigure):**
1. Open an LC note with `useInlineWidget=ON` and `vimMode=OFF` (Obsidian setting).
2. Type some text in the widget. Verify normal text-input behavior.
3. Open Obsidian Settings → Editor → Vim mode → toggle ON. Close settings.
4. Without reloading the note: position the cursor inside the widget. Press `Esc` (vim normal mode entry).
5. Verify the cursor changes appearance (block cursor) AND `j`/`k`/`l`/`h` move the cursor without inserting characters.
6. Press `i`. Verify insert mode (line cursor); `j`/`k` etc. now insert characters.
7. Toggle vim mode OFF in Settings. Press a vim normal-mode binding (e.g., `j`). Verify the character `j` is inserted (no longer captured by vim).
8. Both directions work without note reload AND without insert-mode glitches.

**Fail criteria (ship VIM-03 banner in Phase 22):**
- After toggling ON: `Esc` does not enter normal mode, OR cursor stays as line cursor when it should be block.
- After toggling OFF: vim normal-mode bindings still capture keys.
- Insert-mode after toggle is glitchy (e.g., requires one no-op keystroke before responding correctly — this is a "glitchy pass" that CONTEXT discretion treats as a fail).
- The reconfigure succeeds but the widget loses cursor / scroll / undo state on the dispatch.
- Toggling within milliseconds of typing (race condition) corrupts the editor state.

**Vim Mode Change Detection:**

`app.vault.getConfig('vimMode')` is undocumented internal Obsidian API (already used by `WidgetController.ts:264` and `childEditorFactory.ts:268` per VIM-01). It returns `true | false | undefined`. There is **no documented event** when this setting changes.

**Three options for detecting the toggle:**

1. **`workspace.on('layout-change')` poll [RECOMMENDED for Phase 20]** — Obsidian fires this when settings save (observed in v1.2 code at `src/solve/ephemeralTabStore.ts:1` callsite). The handler reads `getConfig('vimMode')` and compares against the cached mount-time value; if changed, dispatch Compartment.reconfigure on every widget. **Verified existence:** `obsidian.d.ts:7119` (`'layout-change'` event, public, `since 0.9.20`).

2. **Settings tab `onChange` direct wire [PARTIAL — only catches plugin-side toggle]** — Obsidian's Vim Mode toggle is in the core editor settings, NOT in our plugin's settings tab. Our plugin can't directly hook the core toggle.

3. **Polling (5s interval) [LAST RESORT]** — `setInterval` reads `getConfig('vimMode')`; if changed, fire reconfigure. Battery cost is non-zero; UX feels laggy.

**Recommendation:** Option 1. Plan 20-01 must register `workspace.on('layout-change')` per-plugin (one listener), iterate `widgetRegistry`, and reconfigure each widget's `vimCompartment`.

**Code skeleton:**
```typescript
// src/widget/WidgetController.ts (Plan 20-01 extension)
//
// vimCompartment is per-widget (NOT module-singleton like languageCompartment) because
// each widget has its own EditorView and Compartments are identity-keyed.
private vimCompartment: Compartment;
private mountedVimMode: boolean;

constructor(...) {
  this.vimCompartment = new Compartment();
  // Read vimMode at mount time (Phase 19 C-14)
  const getConfig = plugin.app.vault.getConfig;
  this.mountedVimMode = typeof getConfig === 'function' &&
    (getConfig.call(plugin.app.vault, 'vimMode') as boolean | undefined) === true;
}

// Compartment payload
buildVimExtension(): Extension {
  return this.vimCompartment.of(this.mountedVimMode ? vim({ status: true }) : []);
}

// Plan 20-01: live reconfigure dispatch
reconfigureVim(enabled: boolean): void {
  if (this.mountedVimMode === enabled) return; // no-op
  this.mountedVimMode = enabled;
  this.view.dispatch({
    effects: this.vimCompartment.reconfigure(enabled ? vim({ status: true }) : []),
  });
}

// Plugin side (src/main.ts onload, Plan 20-01)
this.registerEvent(
  this.app.workspace.on('layout-change', () => {
    const newVim = (this.app.vault as any).getConfig?.('vimMode') === true;
    for (const ctl of this.widgetRegistry.values()) {
      ctl.reconfigureVim(newVim);
    }
  })
);
```

### Pattern 7: Live Theme Retheme (THEME-04)

**What:** On `app.workspace.on('css-change')`, force a reflow of all mounted widgets. No EditorView rebuild — `lc-nested-editor` + `HyperMD-codeblock` containers and `childEditorSemanticClasses` already cascade Obsidian's CSS, so changing the theme automatically updates the visual appearance. The remaining concern is forcing CM6 to re-render its content with the new computed styles.

**Verified API (`obsidian.d.ts:7137`):**
```typescript
on(name: 'css-change', callback: () => any, ctx?: any): EventRef;
```

**When to use:** Plan 20-04.

**Pattern:**
```typescript
// src/widget/themeListener.ts (NEW)
export function registerThemeListener(plugin: LeetCodePlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('css-change', () => {
      for (const ctl of plugin.widgetRegistry.values()) {
        // Force CM6 to remeasure after the new theme has applied.
        ctl.view.requestMeasure();
      }
    })
  );
}
```

**Why no rebuild:** `EditorView.requestMeasure()` triggers CM6 to recompute layout-affected metrics on the next animation frame. Combined with the cascading CSS classes (`lc-nested-editor` already inherits `var(--background-secondary)` etc.), the theme transition is instant and preserves cursor + scroll + undo state.

**MutationObserver fallback (per CONTEXT discretion):** Not needed — `css-change` is verified to exist. But for defense-in-depth (or if a future Obsidian version drops the event), the fallback is:
```typescript
// Fallback (NOT used in Phase 20 unless css-change probe fails)
const observer = new MutationObserver(() => {
  for (const ctl of plugin.widgetRegistry.values()) ctl.view.requestMeasure();
});
observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
```

### Pattern 8: Multi-Pane "Take Over" Affordance

**What:** When pane B opens the same file as pane A, pane A's widget renders editable; pane B's widget renders greyed-out + "Click to take over" CTA. Clicking promotes pane B and demotes pane A.

**When to use:** Plan 20-04.

**Approach (from CONTEXT discretion — planner picks one):**
1. **Greyed-out + CTA** — pane A is editable; pane B shows greyed-out widget with "Click to take over" overlay. **Recommended** because it preserves visual state (user sees what's there, knows it's not editable).
2. **Frozen-readonly snapshot** — pane B is a read-only widget that doesn't update on every keystroke (only on flush). Loses real-time visibility.
3. **Banner-across-both-panes** — both widgets editable but show "Editing in pane 1" banner. Allows races (Pitfall P2). **Reject** (Phase 19 single-active baseline rules this out).

**Recommendation:** Greyed-out + CTA. Pane focus tracking via `workspace.on('active-leaf-change')` walking the `widgetRegistry` to find peer widgets on the same file path.

**Why simplest correct:** Single-active-per-file is the v1.3 baseline (CONTEXT L10); multi-pane live/mirror is v1.4+ deferred. The "Take over" CTA is the minimal observable affordance that meets the user's mental model.

### Anti-Patterns to Avoid

- **Don't modify `codeBlockButtonRow.ts`.** CONTEXT D-action-02 mandates verbatim reuse. Any change (e.g., adding new buttons) regresses the v1.2 reading-mode action row that ACTION-06 mandates remains unchanged.
- **Don't change the `'leetcode.*'` userEvent convention.** CONTEXT L6 + D-protect-02 keep it verbatim through Phase 21. `sectionProtectionExtension.ts` (Phase 20) AND `sectionLockExtension.ts` (v1.2 path, still alive) both honor the convention. PROTECT-03 (Phase 22) removes it together with the v1.2 path deletion.
- **Don't add `'leetcode.*'` to `ECHO_PRONE_USER_EVENTS` (CLAUDE.md).** Phase 17 D-05 + Phase 19 carry-over: child-origin Reset relies on the existing child→parent sync mirror; mucking with the echo-prone list is a known Phase 16/17 carry-over hazard.
- **Don't dispatch `cm.dispatch` from Phase 20 widget code into the parent doc.** All plugin writes go through `app.fileManager.processFrontMatter` (frontmatter) or `app.vault.process` (body). Direct CM6 dispatch into parent is the v1.2 anti-pattern that Phase 19 deleted.
- **Don't store widget state outside the `WidgetRegistry` + `StatePersistenceMap`.** Adding a parallel registry (e.g., a `useState`-style React-y hook) recreates the v1.2 multi-state-source problem.
- **Don't bypass `selfWriteSuppression` in the modify handler.** Every external-edit detection path MUST consult suppression first. Skipping it produces self-write echo bugs (Pitfall P1).
- **Don't rebuild the EditorView on language switch or vim toggle.** `Compartment.reconfigure` preserves cursor + scroll + undo. Rebuilding loses all of it (Phase 16 Pitfall C).
- **Don't write to disk twice on language switch.** Step 1 = flush widget; Step 2 = `processFrontMatter`. The flush MUST complete before the frontmatter write so pending characters land under the OLD slug (CONTEXT D-action-04 + verified pattern at `src/main.ts:2782-2790`).
- **Don't rewrite the fence opener on language switch in v1.3.** v1.3's fence opener is fixed at `\`\`\`leetcode-solve` (Phase 19 C-01); language is metadata-only. No `cm.dispatch` to rewrite the opener.
- **Don't auto-resolve conflicts.** CONTEXT D-conflict-01 mandates the modal whenever the writer has unflushed chars. Silent overwrite is the data-loss path Pitfall P8 covers.
- **Don't show two modals.** CONTEXT D-conflict-04: a second external edit while modal is open updates the External pane in place; never stack a second modal.
- **Don't poll for vim mode change.** Use `workspace.on('layout-change')` per §"Vim Mode Change Detection".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal infrastructure | Custom HTML overlay with backdrop, focus trap, Esc-to-dismiss | `Obsidian.Modal` (extend, override `onOpen`, `onClose`) | Obsidian provides backdrop, focus restoration, mobile/desktop sizing, Esc key, click-outside-dismiss. Already verified at `obsidian.d.ts:4332`. |
| Frontmatter atomic write | Regex find-replace on file body | `app.fileManager.processFrontMatter(file, fn)` | Atomic; handles YAML parse errors; auto-fires `metadataCache.on('changed')` event we depend on. Verified at `obsidian.d.ts:2830`. |
| MetadataCache event subscription | Polling `getFileCache(file).frontmatter` | `metadataCache.on('changed', cb)` | Event-driven; no polling cost. Verified at `obsidian.d.ts:4309`. |
| Theme detection | MutationObserver on `document.body.classList` | `app.workspace.on('css-change')` | Documented, future-proof, exact-event semantics. Verified at `obsidian.d.ts:7137`. |
| Compartment reconfigure for vim | Tear down + rebuild EditorView | `vimCompartment.reconfigure(vim() / [])` | Preserves cursor + scroll + undo. The exact same pattern Phase 16 used for languageCompartment. |
| Line-level diff | String split + manual zip with `===` checks | LCS algorithm (provided in Pattern 5 ~150 LOC) | LCS handles insertions / deletions correctly; naive zip misaligns immediately. |
| Self-write echo suppression | Boolean flag | Phase 19's `SelfWriteSuppression` (per-path content-hash, 2s TTL) | Boolean is provably broken under multi-file flushes (Pitfall P1). |
| Plugin event registration | Bare `addEventListener` | `plugin.registerEvent(app.workspace.on(...))` | Auto-cleanup on plugin unload. Mandatory pattern across the project. |
| Cursor preservation across reload | Token-anchor scan | Line/col clamp (CONTEXT D-conflict-03) | Predictable; matches Obsidian's own external-file behavior; fails gracefully when line shrunk. |

**Key insight:** Phase 20 is wiring Phase 19's primitives into UX surfaces. Every "primitive" needed is either Obsidian-provided or already exists in the codebase. Hand-rolling any of the above wastes plan budget and risks regressions.

## Runtime State Inventory

> Phase 20 is a v1.3 widget UX-completion phase. It does **not** rename or migrate runtime state; it adds new behavior atop Phase 19's already-shipped primitives. This section is included for completeness — every category below is verified empty except for the canonical Phase 19 plugin-singletons that Phase 20 EXTENDS.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 20 introduces no new persistence. The Phase 19 `StatePersistenceMap` (in-memory, 30s TTL) is consumed (read) by Plan 20-03 conflict-modal reload but not modified. | None |
| Live service config | None — no external services touched. | None |
| OS-registered state | None — no OS-level registrations. | None |
| Secrets/env vars | None — Phase 20 introduces no new env reads. The existing `getConfig('vimMode')` cast is reused per Pattern 6. | None |
| Build artifacts | None — Phase 20 adds source files (`sectionProtectionExtension.ts`, `ConflictModal.ts`, `conflictDiff.ts`, `themeListener.ts`, `multiPaneCoordinator.ts`, `widgetActions.ts`) but no compiled artifacts that need invalidation. | None |

**Nothing found in any category** — Phase 20 is purely additive at the source level. Verified by:
- `cat .planning/config.json` — no migration metadata.
- `grep -nE 'vimMode|getConfig' src/` — single existing reader (`WidgetController.ts:264` + `childEditorFactory.ts:268`).
- No new ChromaDB / Mem0 / SQLite / SOPS / pm2 / Task Scheduler / launchd / pip egg-info touches.

## Common Pitfalls

### Pitfall P2: External-Edit Echo Through ProcessFrontMatter

**What goes wrong:** The widget's `switchLanguageFromWidget` calls `processFrontMatter`. If `processFrontMatter` triggers `vault.on('modify')` (it usually does — it's an atomic file write), and the widget's modify listener doesn't filter it as a self-write, the listener will trigger a reload that wipes the in-flight chevron change.

**Why it happens:** `selfWriteSuppression` is keyed by content-hash of the **fence body**, not the full file. A frontmatter-only write changes the file's full content but NOT the fence body — so `extractFenceBody(disk, fenceIndex)` returns the SAME string before and after. `tryConsume(path, observedHash)` returns `'miss'` (no entry was armed), and the modify listener treats it as external.

**How to avoid:** Plan 20-02 must extend `selfWriteSuppression` to handle frontmatter-only writes. Two options:
1. **Best:** Compare the OBSERVED fence body hash to the WIDGET's current doc hash. If they match, the write didn't change the fence body — no reload needed (regardless of suppression entry). Add an early-return in the modify handler when `observedFenceHash === widget.currentDocHash`.
2. **Alternative:** Arm a sentinel suppression entry on `processFrontMatter` calls keyed by full-file hash; consume it on modify with full-file-hash comparison.

**Recommendation:** Option 1. It's simpler, doesn't expand the suppression-map shape, and handles the general case (any write that doesn't change the fence body — including frontmatter, AI Review section, KG writes — should never trigger a widget reload).

**Warning signs:**
- After a chevron switch, the widget content briefly clears and re-fills (visible flash).
- After a chevron switch, the widget cursor jumps to position 0.
- After AI Review writes to the file, the widget loses unflushed local edits.

**Phase to address:** Plan 20-02 (must wire the early-return in Plan 20-03 too — both plans share the modify handler).

### Pitfall P8: Cursor Restoration After Reload

**What goes wrong:** Reload code path replaces the widget doc without capturing cursor first. User sees cursor jump to position 0 on every external edit reconciliation.

**How to avoid:** CONTEXT D-conflict-03 mandates line/col clamp. The widget's reload path captures `(line, col)` BEFORE the dispatch and restores after. See §"Cursor Preservation Pattern" code example.

**Phase to address:** Plan 20-03.

### Pitfall P9: Theme Differences in Action Row Layout

**What goes wrong:** Themes (Minimal, Things, Catppuccin, Anuppuccin, Atom) target generic `.markdown-rendered button` selectors; widget action row inherits unintended button styles. Margin collapse with adjacent paragraphs swallows visible spacing.

**How to avoid:** `codeBlockButtonRow.ts` already uses `.leetcode-code-actions` outer scope and CSS variable discipline — verbatim reuse keeps this clean. The widget container's `.lc-nested-editor` outer class plus `.lc-leetcode-solve` (added in Phase 19 mount) provide additional scoping.

**Phase to address:** Plan 20-02 + Plan 20-04 (theme regression visual gate is Phase 22 THEME-05).

### Pitfall P10: Section-Lock Removal Regression

**What goes wrong:** `sectionLockExtension.ts` is forked but the new `sectionProtectionExtension.ts` removes too much (regresses v1.0 validated requirement) or too little (interferes with non-fence writes).

**How to avoid:** **Forking strategy** (CONTEXT D-protect-04). Preserve every UAT-hardened edge case verbatim. Surgical removal of only the fence-opener and fence-closer body lock cases. Run the v1.0 Phase 5.5 section-lock UAT regression cases against the new extension as Plan 20-01's acceptance gate.

**Phase to address:** Plan 20-01.

### Pitfall P11: Frontmatter `lc-language` Out of Sync With Editor State

**What goes wrong:** Widget reads `lc-language` at mount, never re-reads. External frontmatter edits ignored. OR: chevron click flips frontmatter but the widget's `metadataCache.on('changed')` listener isn't subscribed (or is filtered to wrong file path).

**How to avoid:** §"Pattern 3: Language Switch Flow" — single source of truth (frontmatter), `metadataCache.on('changed')` listener filtered by file path, Compartment.reconfigure on every fire. Test the external-edit path: edit `lc-language: python3` → `lc-language: java` directly in the source-mode frontmatter; verify widget syntax highlighting updates without reload.

**Phase to address:** Plan 20-02.

### Pitfall P16: Theme Detection Without Documented Event

**What goes wrong:** Widget falls behind the active theme — light/dark toggle doesn't update widget colors until note reload.

**How to avoid:** `app.workspace.on('css-change')` is verified to exist (`obsidian.d.ts:7137`). MutationObserver fallback is documented but not needed.

**Phase to address:** Plan 20-04.

### Pitfall P19/P20: Multi-Pane Same-File Race

**What goes wrong:** Two widgets accept input simultaneously for the same file. Last-write-wins; one pane's edits silently overwrite the other.

**How to avoid:** CONTEXT L10 — single-active-per-file baseline. Plan 20-04 ships "Take over" CTA: pane A is live; pane B is greyed-out + CTA. Click → demote A, promote B.

**Phase to address:** Plan 20-04.

### Pitfall P21: Vim Live-Reconfigure Empirical Unknown

**What goes wrong:** `vimCompartment.reconfigure(vim() / [])` doesn't take effect, OR insert-mode behaves glitchy after the toggle.

**How to avoid:** Plan 20-01 dev-vault probe (§"Probe Procedure"). CONTEXT L4 pre-accepts VIM-03 banner fallback for Phase 22 if probe fails. Treat "glitchy pass" (works only after one no-op keystroke) as a fail per CONTEXT discretion.

**Phase to address:** Plan 20-01.

### Pitfall P24: Action-Row Mount Inside Widget DOM Layout

**What goes wrong:** Widget container DOM is `<div class="lc-nested-editor HyperMD-codeblock lc-leetcode-solve">[CM6 EditorView][action row]</div>` — but CM6's `EditorView.lineWrapping` plus `EditorView.theme` may re-arrange children. Action row pushed to wrong position.

**How to avoid:** Verify in Plan 20-02 that the action row is appended AFTER `view.dom` in the container. CM6 doesn't reorder DOM children; the action row is a sibling, not a CM6 child. The same `Decoration.widget({ block: true, side: 1 })` pattern at the closer-line END works for the Live-Preview ViewPlugin too — but in the Live-Preview case, the entire widget IS the `Decoration.replace` payload, so the action row is just a child of the widget's container `<div>`.

**Phase to address:** Plan 20-02.

## Code Examples

### Example 1: ConflictModal Skeleton (Plan 20-03)

```typescript
// src/widget/ConflictModal.ts (NEW)
// Verified API: obsidian.d.ts:4332 (Modal class)
import { Modal, App, Setting } from 'obsidian';
import { lineDiff, type DiffRow } from './conflictDiff';
import type { WidgetController } from './WidgetController';

export class ConflictModal extends Modal {
  private diffOpen = false;
  private mineEl!: HTMLPreElement;
  private extEl!: HTMLPreElement;
  private mergedEl!: HTMLPreElement;
  private buttonRow!: HTMLDivElement;

  constructor(
    app: App,
    private readonly widget: WidgetController,
    private readonly mineDoc: string,
    private externalDoc: string,
  ) {
    super(app);
  }

  /** D-conflict-04: a second external edit updates the External pane in place. */
  updateExternalContent(newExternal: string): void {
    this.externalDoc = newExternal;
    if (this.diffOpen) this.renderDiff();
  }

  isOpen = false;
  open(): void { this.isOpen = true; super.open(); }
  close(): void { this.isOpen = false; super.close(); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'External edit detected' });
    contentEl.createEl('p', {
      text: 'This file changed on disk while you were editing. Choose a resolution:',
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Keep mine')
          .setCta()
          .onClick(() => {
            // Recommendation from CONTEXT discretion: immediate flush.
            void this.widget.writer?.forceFlush();
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Keep external').onClick(() => {
          // Plan 20-03: line/col cursor clamp reload (D-conflict-03).
          this.widget.reloadFromDisk('keep-external');
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText('View diff').onClick(() => this.expandDiff()),
      );

    this.buttonRow = contentEl.querySelector('.setting-item-control') as HTMLDivElement;
  }

  expandDiff(): void {
    this.diffOpen = true;
    const { contentEl } = this;
    const diffContainer = contentEl.createDiv({ cls: 'lc-conflict-diff' });
    diffContainer.createEl('h3', { text: 'Diff' });
    const cols = diffContainer.createDiv({ cls: 'lc-conflict-cols' });
    this.mineEl = cols.createEl('pre', { cls: 'lc-conflict-mine' });
    this.extEl = cols.createEl('pre', { cls: 'lc-conflict-external' });
    this.mergedEl = cols.createEl('pre', { cls: 'lc-conflict-merged' });
    this.renderDiff();
  }

  private renderDiff(): void {
    if (!this.diffOpen) return;
    this.mineEl.textContent = this.mineDoc;
    this.extEl.textContent = this.externalDoc;
    const rows = lineDiff(this.mineDoc, this.externalDoc);
    this.mergedEl.empty();
    for (const r of rows) {
      const span = this.mergedEl.createEl('span', { cls: `lc-diff-${r.kind}` });
      span.textContent = (r.mine ?? r.external ?? '') + '\n';
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

### Example 2: *FromWidget Method (Plan 20-02)

```typescript
// src/main.ts — Plan 20-02 adds these alongside existing *FromActive (lines 2322-2475).
// Verified pattern at lines 2459-2629 (submitFromActive).

async runFromWidget(widget: WidgetController): Promise<void> {
  // Step 1 — flush widget edits BEFORE reading code. Even though we read
  //          state.doc.toString() (no disk round-trip per ACTION-04), flushing
  //          first ensures the disk is current too — RUN endpoint failures
  //          can be reproduced from the file.
  await widget.flushNow();

  // Step 2 — read code DIRECTLY from widget state.
  const code = widget.view.state.doc.toString();
  const file = widget.file;

  // Step 3 — read frontmatter for slug + language (same pattern as
  //          getActiveProblemContext at src/main.ts:~2540).
  const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const lcSlug = fm?.['lc-slug'];
  if (typeof lcSlug !== 'string' || lcSlug.length === 0) {
    new Notice('This widget is not on a LeetCode note.', 4000);
    return;
  }
  const lcLanguage = (typeof fm?.['lc-language'] === 'string')
    ? (fm['lc-language'] as string)
    : 'python3';

  // Step 4 — route to existing run path (same downstream as runFromActive at line 2631).
  await this.runWithCode(file, lcSlug as string, lcLanguage, code);
}

// runWithCode is a refactor target — extract the body of runFromActive that
// reads file/slug/language/code into a private method that takes them as args.
// Then runFromActive calls runWithCode after extracting from active view, and
// runFromWidget calls runWithCode after extracting from widget state.
//
// This refactor matches CONTEXT D-action-04: "the widget's button-row host adapter
// is { runFromActive: () => plugin.runFromWidget(widget), ... } so the existing
// buildCodeBlockButtonRow API works unmodified."
//
// Phase 22 mechanical rename: runFromActive → DELETE; runWithCode → renamed
// to runFromCode; runFromWidget → renamed to runFromActive (single path).
```

### Example 3: Reload-with-Cursor (Plan 20-03 D-conflict-03)

```typescript
// src/widget/WidgetController.ts (Plan 20-03 extension)
//
// CONTEXT D-conflict-03: line/col clamp cursor preservation.

reloadFromDisk(reason: 'silent' | 'keep-external'): Promise<void> {
  // Capture cursor BEFORE the dispatch. Use line+col, not absolute offset —
  // line+col is more stable across content edits.
  const head = this.view.state.selection.main.head;
  const line = this.view.state.doc.lineAt(head);
  const col = head - line.from;
  const lineNumber = line.number;
  const scrollTop = this.view.scrollDOM.scrollTop;

  // Read fresh disk content; extract the fence body for this widget's index.
  return this.plugin.app.vault.read(this.file).then((newDisk) => {
    const newBody = extractFenceBody(newDisk, this.fenceIndex) ?? '';
    if (newBody === this.view.state.doc.toString()) return; // no-op (same as widget)

    // Replace doc + restore selection in ONE transaction.
    const newDocLength = newBody.length;
    const newLineCount = (newBody.match(/\n/g)?.length ?? 0) + 1;
    const targetLine = Math.min(lineNumber, newLineCount);
    let targetLineFrom = 0;
    for (let i = 1; i < targetLine; i++) {
      const idx = newBody.indexOf('\n', targetLineFrom);
      if (idx < 0) break;
      targetLineFrom = idx + 1;
    }
    const targetLineEnd = newBody.indexOf('\n', targetLineFrom);
    const targetLineLength = (targetLineEnd < 0 ? newBody.length : targetLineEnd) - targetLineFrom;
    const targetCol = Math.min(col, targetLineLength);
    const restoredHead = Math.min(targetLineFrom + targetCol, newDocLength);

    // Plan 19-03 historyJSON consumption (CONTEXT L8): for the 'keep-external'
    // path, the widget's history is preserved but the doc is replaced — this
    // means the user's "undo" stack now references a doc state that no longer
    // exists. Acceptable tradeoff: pressing Cmd-Z after a "keep-external"
    // resolution does nothing useful. Document in Plan 20-03 SUMMARY.
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: newBody },
      selection: EditorSelection.cursor(restoredHead),
      annotations: [Transaction.addToHistory.of(false)],
    });
    this.view.scrollDOM.scrollTop = scrollTop;
  });
}
```

### Example 4: Forking sectionLockExtension.ts (Plan 20-01)

```bash
# CONTEXT D-protect-04: "fork sectionLockExtension.ts → sectionProtectionExtension.ts"
cp src/main/sectionLockExtension.ts src/main/sectionProtectionExtension.ts
```

```typescript
// src/main/sectionProtectionExtension.ts (NEW, ~370 LOC after edits)
//
// Forked from sectionLockExtension.ts at v1.3 Phase 20. Replaces the v1.0/v1.2
// section-lock with a narrower scope that only protects the regions still
// requiring lock under the v1.3 widget architecture (CONTEXT L5 / D-protect-01).
//
// Surgical changes from the source (delta only):
//   1. Renamed export buildSectionLockExtension → buildSectionProtectionExtension.
//   2. computeLockedRanges 'code' branch: keep heading + opener-line lock
//      (preserves blank-line pocket); DELETE the closer-line lock (`out.push(closer.from, closerLockTo)`).
//   3. (Optional in PROTECT-03 / Phase 22): remove the 'leetcode.*' userEvent
//      bypass at lines 384-391. PRESERVE in Phase 20 per CONTEXT L6 + D-protect-02.
//   4. Boundary fix at lines 416-430: PRESERVE verbatim.
//   5. UAT 2026-05-13 selection-snap transactionFilter at lines 453-520: PRESERVE verbatim.
//   6. atomicRanges decision (UAT 2026-05-13: removed in favor of transactionFilter):
//      PRESERVE — the v1.3 widget already provides atomicRanges via the
//      ViewPlugin (Phase 19 C-05); the parent's section protection extension
//      sticks with transactionFilter for cursor motion handling.
//
// All other code (Gate 0 isUserInput, Gate 1 leetcode.*, Gate 2 file gate,
// Gate 3 lc-slug gate, mergeLockedRanges helper, computeSnapTarget helper,
// EditorView.decorations.of dimming) is preserved verbatim.

// (Body identical to sectionLockExtension.ts except for the 2 deletions above.)
```

```typescript
// src/main.ts (Plan 20-01 extension at line 1029):
//
// Mutually-exclusive registration based on useInlineWidget (CONTEXT D-protect-03).
if (useInlineWidget) {
  this.registerEditorExtension(buildSectionProtectionExtension(this));
} else {
  this.registerEditorExtension(buildSectionLockExtension(this));  // v1.2 path unchanged
}
```

## State of the Art

| Old Approach (v1.2 / Phase 19) | Current Approach (Phase 20) | When Changed | Impact |
|--------------------------------|------------------------------|--------------|--------|
| `sectionLockExtension.ts` protects 4 regions (Problem body / Code heading + opener + closer / Techniques heading) on lc-slug notes | `sectionProtectionExtension.ts` protects 3 regions (Problem body / Code heading + opener + pocket / Techniques heading) — fence opener body + closer dropped because widget owns the range | Phase 20 Plan 20-01 | Prevents v1.0 "plugin-owned regions" requirement regression while letting the widget take over its fence range cleanly. |
| Vim mounted at widget construction; toggle requires note reload (VIM-01) | `vimCompartment.reconfigure(vim() / [])` swaps live on `workspace.on('layout-change')` (VIM-02) | Phase 20 Plan 20-01 | Vim users no longer need to reload notes when toggling vim mode in Settings. Pre-accepted Phase 22 fallback (VIM-03 banner) if probe fails. |
| Action row mounted as Decoration.widget below fence in PARENT CM6 (codeActionsEditorExtension.ts) | Action row mounted INSIDE widget DOM via `widgetActions.ts` adapter (ACTION-01) | Phase 20 Plan 20-02 | Action buttons read code via `widget.view.state.doc.toString()` — no disk round-trip; survives focus save/restore. |
| Language switch via atomic CM6 dispatch on parent + processFrontMatter (lines 2703-2790) | Language switch via processFrontMatter ONLY → metadataCache.on('changed') → languageCompartment.reconfigure (ACTION-02, ACTION-03) | Phase 20 Plan 20-02 | No CM6 dispatch on parent; widget reacts via metadata event. Drops the `'leetcode.lang-switch'` userEvent (still alive on the v1.2 path). |
| External edit `vault.on('modify')` triggers widget rebuild from disk (Phase 19 — silent reload baseline) | External edit triggers conflict modal IF `debouncedWriter.hasPending()`; silent reload otherwise (SYNC-04, SYNC-05) | Phase 20 Plan 20-03 | "Never lose data" guarantee for in-flight edits. |
| Theme follows Obsidian via CSS cascade; refresh requires note reload | `app.workspace.on('css-change')` triggers `view.requestMeasure()` for live retheme (THEME-04) | Phase 20 Plan 20-04 | Light/dark toggle, custom theme swap retheme widget instantly. |
| Multi-pane same-file: both editable, last-write-wins race | Single-active-per-file: pane A editable; pane B greyed + "Take over" CTA | Phase 20 Plan 20-04 | Eliminates Pitfall P2 race entirely; v1.4+ may add live/mirror. |

**Deprecated/outdated (still in tree through Phase 21):**
- `sectionLockExtension.ts`: still active when `useInlineWidget=OFF`. Phase 22 deletes it (DELETE-02).
- `'leetcode.*'` userEvent convention: still load-bearing for `useInlineWidget=OFF` path. Phase 22 deletes it (PROTECT-03 / DELETE-08 + CLAUDE.md cleanup).
- Reading-mode `codeActionsPostProcessor.ts`: stays unchanged (ACTION-06). Phase 22 may consolidate into a single read-only widget path.

## Assumptions Log

> Phase 20 inherits the locked decisions from CONTEXT.md. The remaining empirical claims below are NOT yet verified against this plugin's own dev vault. Each is annotated `[ASSUMED]` and the planner / dev-vault probe must confirm before the corresponding plan commits its primary path.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vimCompartment.reconfigure(vim() / [])` works at runtime in `@replit/codemirror-vim@6.3.0` without rebuilding the EditorView. [ASSUMED — library README is silent on Compartment runtime-toggle; CONTEXT L4 pre-accepts VIM-03 banner fallback.] | §"Vim Live-Reconfigure" | Plan 20-01 ships VIM-03 banner instead. Phase 22 fallback is pre-accepted. |
| A2 | `app.workspace.on('layout-change')` fires when the user toggles vim mode in Obsidian Settings. [ASSUMED — observed indirectly in v1.2 code at `src/solve/ephemeralTabStore.ts`; not verified that THIS specific setting fires it.] | §"Vim Mode Change Detection" | Plan 20-01 must add a polling fallback OR detect via `getConfig('vimMode')` re-read on widget focus. |
| A3 | `app.fileManager.processFrontMatter(file, fn)` triggers `vault.on('modify')` for the file. [ASSUMED — `processFrontMatter` is documented atomic; the Obsidian event chain is documented but not directly tested.] | Pitfall P2 | Plan 20-02 must verify; if it doesn't fire modify, the early-return for "fence body unchanged" is unnecessary. If it DOES fire, the early-return is required. |
| A4 | A second external edit while the conflict modal is open does not need stack-of-modals UX. [LOCKED in CONTEXT D-conflict-04 — but the in-place External update flow (D-conflict-04) is the WAY to handle it; the assumption is that users don't get confused by the silent External update.] | §"Pattern 4: External-Edit Reconciliation Path" | UX feedback in Plan 20-03 UAT may want a brief flash on External pane update; the modal itself remains single. |
| A5 | The 3-pane diff column widths fit on a 600px-wide pane with 3 ~150-line strings. [ASSUMED — Obsidian Modal sizing is variable per theme.] | §"Pattern 5: Pure-TS LCS Diff" | Plan 20-03 may need horizontal-scroll OR collapse-to-2-pane fallback. |
| A6 | Live `Compartment.reconfigure` for vim does NOT lose cursor / scroll / undo state. [ASSUMED — Pattern is identical to languageCompartment which DOES preserve in Phase 16; vim Compartment empirically untested.] | §"Pattern 6: Vim Live-Reconfigure — Probe Procedure" | Plan 20-01 probe must verify; Phase 22 VIM-03 fallback if violated. |
| A7 | Multi-pane focus tracking via `workspace.on('active-leaf-change')` is sufficient to detect when pane B opens the same file as pane A. [ASSUMED — event fires on every leaf focus; widget registry walking should find peer widgets.] | §"Pattern 8: Multi-Pane 'Take Over' Affordance" | Plan 20-04 may need additional `workspace.on('layout-change')` for pane creation. |

**If this table is empty:** No empirical claims remain — every primitive is verified. (This table is NOT empty for Phase 20; the empirical risks are bounded but real.)

## Open Questions

1. **Does `app.fileManager.processFrontMatter` fire `vault.on('modify')` for the file it touches?**
   - **What we know:** It's an atomic write. Obsidian's metadataCache pipeline updates after the write completes. The `metadataCache.on('changed')` event ALWAYS fires.
   - **What's unclear:** Whether the `vault.on('modify')` event ALSO fires (independent of metadataCache). If it does, the widget's modify listener will trigger reload UNLESS the early-return for "fence body unchanged" is in place.
   - **Recommendation:** Plan 20-02 must include a probe (write a test that fires `processFrontMatter` and observes whether `vault.on('modify')` fires for the same file in the next tick). If yes, ship the early-return; if no, the early-return is dead code but harmless.

2. **Does `@replit/codemirror-vim@6.3.0` support runtime Compartment.reconfigure cleanly?**
   - **What we know:** The library exposes `vim()` as a standard CM6 Extension. CM6's Compartment.reconfigure is a documented general primitive. Phase 16 successfully uses Compartment.reconfigure for languageCompartment.
   - **What's unclear:** Whether the vim extension's internal state survives Compartment.reconfigure cleanly. The library's internal state may include the current vim mode (normal/insert/visual), the vim command buffer, etc. Wholesale replace of `vim()` with `[]` may leak references.
   - **Recommendation:** Plan 20-01 dev-vault probe (§"Probe Procedure"). Pre-accepted VIM-03 banner fallback if it fails.

3. **Does `app.workspace.on('layout-change')` fire when a user toggles vim mode in Obsidian Settings?**
   - **What we know:** `'layout-change'` exists at `obsidian.d.ts:7119`. v1.2 code already subscribes to it (`src/solve/ephemeralTabStore.ts:line 1`).
   - **What's unclear:** Whether THIS specific Obsidian setting (Settings → Editor → Vim mode) fires it. Settings persistence may use a different event.
   - **Recommendation:** Plan 20-01 probe — toggle vim mode and observe whether `layout-change` fires. Fallback is `setInterval` poll on 5s; UX is laggy but works.

4. **What's the right "click to take over" UX flow for greyed-out pane in multi-pane?**
   - **What we know:** Single-active-per-file is the v1.3 baseline (CONTEXT L10). Pane A active, pane B greyed.
   - **What's unclear:** When user clicks pane B's CTA, does pane A immediately render greyed-out? Or does it wait for pane B to gain focus? Race window is small but visible.
   - **Recommendation:** Plan 20-04 designer + planner pick the flow; CONTEXT discretion mentions three options. Recommendation: synchronous "click → both panes update at the same animation frame" via shared state in `multiPaneCoordinator.ts`.

5. **Should the conflict modal "Keep mine" debounce semantics be immediate flush or queued?**
   - **What we know:** The user just made a deliberate decision.
   - **What's unclear:** Whether immediate flush could ever conflict with another concurrent flush (e.g., another widget on the same file in another pane).
   - **Recommendation:** Immediate flush per CONTEXT discretion. If a race surfaces in dev testing, fall back to queued (the user's "Keep mine" choice persists in `selfWriteSuppression` even if delayed).

## Environment Availability

> Phase 20 has no external runtime dependencies beyond what v1.2 / Phase 19 already required. This section documents the Phase 20 plan's tool / library / runtime needs.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (build only) | esbuild | ✓ | per repo | — |
| TypeScript | source | ✓ | 5.8.3 (from project) | — |
| Obsidian core | runtime (Modal, MetadataCache.on, processFrontMatter, css-change, layout-change) | ✓ | manifest minAppVersion 1.10.0; installed 1.12.3; npm latest 1.13.0 | — |
| `@replit/codemirror-vim@6.3.0` | runtime (vim() extension) | ✓ | 6.3.0 (latest as of 2026-05-29) | VIM-03 banner-on-toggle fallback for Phase 22 |
| `@codemirror/state` (Compartment, EditorState.changeFilter, Transaction.userEvent) | runtime | ✓ | 6.5.0 | — |
| `@codemirror/view` (atomicRanges, Decoration.widget) | runtime | ✓ | 6.38.6 | — |
| `@codemirror/commands` (historyField for state-persistence) | runtime | ✓ | 6.10.3 | — |
| Vitest test framework | test (Plan 20-01 regression rerun, Plan 20-03 LCS unit tests) | ✓ | 4.1.5 (project pinned) | — |
| `eslint-plugin-obsidianmd` | lint (POLISH-03 gate at Phase 22; Phase 20 keeps it green throughout) | ✓ | per project | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all primitives are pinned.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (project pinned) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run --reporter=basic` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **PROTECT-01** | `## Problem` body + `## Code` heading + `## Techniques` heading remain locked | unit | `npx vitest run tests/main/sectionProtectionExtension.test.ts` | ❌ Wave 0 (mirror existing `sectionLockExtension.test.ts`) |
| **PROTECT-02** | Fence opener line remains in file but parent cursor cannot enter (atomicRanges via widget) | unit | `npx vitest run tests/widget/atomicRanges.test.ts` | ✅ existing (Phase 19 covers atomicRanges) |
| **PROTECT-01** regression | Run v1.0 Phase 5.5 section-lock UAT cases against new extension | unit | `npx vitest run tests/main/sectionProtectionExtension.test.ts` | ❌ Wave 0 (port test from `sectionLockExtension.test.ts`) |
| **VIM-02** | `vimCompartment.reconfigure` swaps vim live without note reload | unit + UAT | `npx vitest run tests/widget/vimReconfigure.test.ts` + manual probe | ❌ Wave 0 |
| **VIM-02** failure-mode | Probe procedure: glitchy vim state after toggle = fail (Phase 22 VIM-03) | manual UAT | manual probe in Plan 20-01 dev-vault | manual-only |
| **ACTION-01** | Buttons mount inside widget DOM | unit | `npx vitest run tests/widget/widgetActions.test.ts` | ❌ Wave 0 |
| **ACTION-02** | Chevron click flips `lc-language` frontmatter | unit | `npx vitest run tests/widget/languageSwitchFromWidget.test.ts` | ❌ Wave 0 |
| **ACTION-03** | Widget reacts to `metadataCache.on('changed')` and reconfigures language | unit | `npx vitest run tests/widget/languageReactivity.test.ts` | ❌ Wave 0 |
| **ACTION-04** | Action buttons read code via `widget.childView.state.doc.toString()` | unit | `npx vitest run tests/widget/fromWidget.test.ts` | ❌ Wave 0 |
| **ACTION-05** | flex-wrap layout, focus save/restore on button click | manual UAT | manual visual test in Plan 20-02 | manual-only |
| **ACTION-06** | Reading-mode action row continues to render via `codeActionsPostProcessor.ts` (unchanged from v1.2) | smoke | `npx vitest run tests/main/codeActionsPostProcessor.test.ts` | ✅ existing |
| **SYNC-04** | External edit reload preserves cursor (no conflict path) | unit | `npx vitest run tests/widget/reloadFromDisk.test.ts` | ❌ Wave 0 |
| **SYNC-04** modify-handler | `vault.on('modify')` consults suppression + branches | unit | `npx vitest run tests/widget/modifyHandler.test.ts` | ❌ Wave 0 |
| **SYNC-05** | Conflict modal appears when `widget.debouncedWriter.hasPending() === true` | unit + UAT | `npx vitest run tests/widget/ConflictModal.test.ts` + manual | ❌ Wave 0 |
| **SYNC-05** LCS diff | `lineDiff(mine, ext)` produces correct DiffRow[] | unit | `npx vitest run tests/widget/conflictDiff.test.ts` | ❌ Wave 0 |
| **SYNC-05** D-conflict-04 | Second external edit while modal open updates External in place | unit | `npx vitest run tests/widget/conflictModalUpdate.test.ts` | ❌ Wave 0 |
| **THEME-04** | Light/dark toggle retheme widget colors live | unit + manual UAT | `npx vitest run tests/widget/themeListener.test.ts` + manual | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=basic`
- **Per wave merge:** `npm test` (full 1,906 tests + new Phase 20 additions, projected ~1,990)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/main/sectionProtectionExtension.test.ts` — fork from `sectionLockExtension.test.ts`; rerun v1.0 Phase 5.5 acceptance cases against the new extension; delete cases for fence opener / closer that no longer apply.
- [ ] `tests/widget/vimReconfigure.test.ts` — covers VIM-02 (vimCompartment.reconfigure)
- [ ] `tests/widget/widgetActions.test.ts` — covers ACTION-01
- [ ] `tests/widget/languageSwitchFromWidget.test.ts` — covers ACTION-02
- [ ] `tests/widget/languageReactivity.test.ts` — covers ACTION-03
- [ ] `tests/widget/fromWidget.test.ts` — covers ACTION-04 (`*FromWidget` methods)
- [ ] `tests/widget/reloadFromDisk.test.ts` — covers SYNC-04 cursor-preserving reload
- [ ] `tests/widget/modifyHandler.test.ts` — covers SYNC-04 modify branch decision tree
- [ ] `tests/widget/ConflictModal.test.ts` — covers SYNC-05 modal lifecycle
- [ ] `tests/widget/conflictDiff.test.ts` — covers SYNC-05 LCS diff (pure-function tests; ~100 cases for hostile inputs: insertions, deletions, full replacement, empty inputs)
- [ ] `tests/widget/conflictModalUpdate.test.ts` — covers D-conflict-04 in-place External update
- [ ] `tests/widget/themeListener.test.ts` — covers THEME-04 css-change listener

**No new framework install needed** — Vitest is already pinned at 4.1.5.

## Project Constraints (from CLAUDE.md)

| Directive | Source | Enforcement in Phase 20 |
|-----------|--------|-------------------------|
| **`'leetcode.*'` userEvent convention is the bypass for plugin-internal CM6 dispatches into locked ranges** | CLAUDE.md §"Conventions" paragraph 1 | `sectionProtectionExtension.ts` MUST honor the bypass verbatim (CONTEXT L6 + D-protect-02). Plan 20-01 preserves the gate. PROTECT-03 (Phase 22) removes; do NOT remove in Phase 20. |
| **Canonical plugin write-path pattern (Phase 17 D-05): plugin writes touching the fence body dispatch through child editor's CM6 when registered, fall back to `app.vault.process` otherwise** | CLAUDE.md §"Conventions" paragraph 2 | Phase 20 v1.3 widget writes go through `widget.flushNow() → DebouncedWriter.flush() → vault.process` (Phase 19 architecture). The convention is preserved through Phase 21 for the v1.2 path; Phase 20 must NOT delete the convention paragraph. PROTECT-03 / DELETE-08 (Phase 22) remove. |
| **Do NOT add `'leetcode.reset.child'` to `ECHO_PRONE_USER_EVENTS` in `nestedEditorExtension.ts:265-268`** | CLAUDE.md §"Conventions" paragraph 2 | Phase 20 plans must NOT modify nestedEditorExtension.ts. |
| **Vault-layer write discipline: `app.vault.process(file, fn)` (atomic) for body writes; never `vault.modify(file, data)`** | CLAUDE.md §"Constraints" + project CI grep `scripts/grep-no-vault-modify.sh` | Plan 20-03 conflict-modal "Keep mine" path = `widget.writer?.forceFlush()` which goes through DebouncedWriter → vault.process (Phase 19 path). |
| **Plugin compatibility: must pass Obsidian community plugin review** | CLAUDE.md §"Constraints" | Phase 20 introduces no new dependencies, no `innerHTML` in widget code (use `createEl`), no `eval`, no remote code. ConflictModal extends `Obsidian.Modal` (sanctioned API). |
| **No `innerHTML` in widget code; use `createEl()` / DOM API** | CLAUDE.md §"Constraints" + `eslint-plugin-obsidianmd` | All Phase 20 new files (`ConflictModal.ts`, `conflictDiff.ts`, `widgetActions.ts`, `themeListener.ts`, `multiPaneCoordinator.ts`) use `createEl` / `createDiv` / `createSpan`. The diff render in `ConflictModal.ts` MUST use `textContent`, never `innerHTML`. |
| **Resource cleanup: All event listeners registered via `registerEvent()`; custom views cleanup on `onClose()`** | CLAUDE.md §"Constraints" | Plan 20-03 modal listeners + Plan 20-04 css-change listener wrap with `plugin.registerEvent()`. ConflictModal's `onClose` empties contentEl. |
| **Use `this.app` not global `app`** | CLAUDE.md §"Constraints" | All Phase 20 code paths use `plugin.app` / `this.app`. |

## Sources

### Primary (HIGH confidence)
- `node_modules/obsidian/obsidian.d.ts` (`obsidian@1.12.3` installed) — verified directly via `grep -nE`:
  - `Modal` class — line 4332 (`class Modal implements CloseableComponent`); `contentEl` line 4357; `onOpen` line 4383; `onClose` line 4387.
  - `MetadataCache.on('changed', ...)` — line 4309 (`(file: TFile, data: string, cache: CachedMetadata) => any`).
  - `Workspace.on('css-change', ...)` — line 7137 (since 0.9.7, `() => any`).
  - `Workspace.on('layout-change', ...)` — line 7119 (since 0.9.20).
  - `FileManager.processFrontMatter(file, fn, options?)` — line 2830.
- `src/main/sectionLockExtension.ts` — entire 527 LOC. Forking source for Plan 20-01.
- `src/main/codeBlockButtonRow.ts` — 99 LOC. Verbatim reuse for Plan 20-02.
- `src/main/languageChevronWidget.ts` — 304 LOC. Verbatim reuse for Plan 20-02.
- `src/main/childEditorLanguage.ts` — 148 LOC. `languageCompartment` + `buildLanguageExtensions` for Plan 20-02.
- `src/main/codeActionsEditorExtension.ts` — `Decoration.widget({ block: true, side: 1 })` placement primitive (line 286-296).
- `src/widget/WidgetController.ts` — Phase 19 controller; Plan 20-01 + 20-04 extend.
- `src/widget/debouncedWriter.ts` — Phase 19 writer; Plan 20-03 adds `hasPending()`.
- `src/widget/selfWriteSuppression.ts` — Phase 19 suppression; Plan 20-03 consumes via `tryConsume`.
- `src/widget/statePersistence.ts` — Phase 19 captures `historyJSON`; Plan 20-03 may consume on conflict-modal reload.
- `src/widget/widgetRegistry.ts` — Phase 19 registry; Plan 20-04 walks for multi-pane affordance.
- `src/widget/embedDetect.ts` — Phase 19 embed detection; Plan 20-02 must skip action-row for embeds.
- `src/widget/codeBlockProcessor.ts` — Phase 19 reading-mode mount.
- `src/widget/liveModeViewPlugin.ts` — Phase 19 Live Preview ViewPlugin with atomicRanges.
- `src/widget/LeetCodeFenceWidget.ts` — Phase 19 WidgetType subclass.
- `src/main.ts` — `*FromActive` method bodies (lines 2322-2475); `switchFenceLanguage` body (lines 2703-2790); useInlineWidget gating block (lines 879-930); existing `workspace.on('layout-change')` callsite at `src/solve/ephemeralTabStore.ts:1`.
- `manifest.json` — `minAppVersion: 1.10.0`, `isDesktopOnly: true` confirmed.
- `.planning/phases/19-widget-foundation-one-way-sync/19-PHASE-SUMMARY.md` — Phase 19 closeout, A1/A2/A3 empirical results, 10 architectural decisions locked.

### Secondary (MEDIUM confidence)
- `npm view @replit/codemirror-vim version` → `6.3.0` (verified 2026-05-29). README's silence on Compartment.reconfigure is the source of CONTEXT L4's pre-accepted fallback.
- `npm view obsidian version` → `1.13.0` (verified 2026-05-29). Installed 1.12.3 is a minor patch behind; manifest minAppVersion 1.10.0 covers both.
- `npm view turndown version` → `7.2.4` (verified; not used by Phase 20 but project-pinned).
- v1.0 Phase 5.5 section-lock UAT acceptance cases (referenced in `sectionLockExtension.ts` boundary fix comment lines 416-430) — empirical regression baseline for Plan 20-01.
- v1.2 Phase 16 `languageCompartment` reconfigure pattern — empirical evidence Compartment.reconfigure works for one extension; analogous for vim is the assumption.
- v1.2 `src/main/childEditorFactory.ts:262-274` — `getConfig('vimMode')` cast pattern; reused at `src/widget/WidgetController.ts:264`.

### Tertiary (LOW confidence — flagged for empirical validation)
- `app.fileManager.processFrontMatter` ↔ `vault.on('modify')` ordering (Open Question 1) — not directly tested in this codebase under v1.3 widget shape.
- `app.workspace.on('layout-change')` firing on Settings → Editor → Vim mode toggle (Open Question 3) — observed for other settings but not specifically this one.
- `vimCompartment.reconfigure(vim() / [])` runtime behavior (Open Question 2) — Phase 20 dev-vault probe is the authoritative answer.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package already pinned and v1.2/Phase 19 vetted; no new installs.
- Architecture: HIGH — every primitive is in the codebase (Phase 19 `WidgetController` / `DebouncedWriter` / `SelfWriteSuppression` / `StatePersistenceMap` / two-path mount; v1.2 `codeBlockButtonRow` / `languageChevronWidget` / `languageCompartment` / `sectionLockExtension`).
- Pitfalls: HIGH — Pitfalls catalog (P1–P26) was authored at v1.3 milestone start; Phase 20 inherits unchanged.
- Empirical risks: MEDIUM — three open questions (vim Compartment.reconfigure, layout-change firing on vim toggle, processFrontMatter→modify ordering). Each has a documented probe procedure and a pre-accepted fallback.

**Research date:** 2026-05-29
**Valid until:** 2026-06-29 (30 days for stable v1.3 architecture; re-verify if Obsidian releases beyond 1.13.x or `@replit/codemirror-vim` releases beyond 6.3.x within the window).
