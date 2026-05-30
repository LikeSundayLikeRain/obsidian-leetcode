# Phase 20: Reconciliation, UX, Action Row, Section Protection - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 20 makes the v1.3 inline widget UX-complete behind `useInlineWidget=OFF` so it can be flipped ON cleanly at Phase 22 without UX regressions. Six surfaces land:

1. **External-edit reconciliation + conflict modal** (SYNC-04, SYNC-05) — `vault.on('modify')` reload with cursor preservation; conflict modal with "Keep mine / Keep external / View diff" when local typing is in-flight.
2. **In-widget action row + language chevron** (ACTION-01..06) — Run / Submit / AI Solution / Reset / Retrieve buttons + language chevron mounted inside the widget DOM, reading code via `widget.childView.state.doc.toString()`.
3. **Language switching via frontmatter** (ACTION-02, ACTION-03) — chevron click → `processFrontMatter` → `metadataCache.on('changed')` → `Compartment.reconfigure` swaps language packs without rebuilding the EditorView.
4. **Narrowed section protection** (PROTECT-01, PROTECT-02) — new `sectionProtectionExtension.ts` (forked from `sectionLockExtension.ts`) protects `## Problem` body + `## Code` heading + `## Techniques` heading only; fence opener/closer protection drops because the widget owns the fence range via `atomicRanges`.
5. **Vim live-reconfigure** (VIM-02) — `vimCompartment.reconfigure(vim() ↔ [])` swaps vim on/off without rebuilding the EditorView when the user toggles vim mode in Obsidian settings.
6. **Live theme retheme** (THEME-04) — widget colors retheme live on Obsidian theme change (light/dark toggle, custom theme swap) without note reload.

In scope: 12 requirements (SYNC-04, SYNC-05, ACTION-01..06, PROTECT-01, PROTECT-02, VIM-02, THEME-04). Phase 20 ships behind `useInlineWidget=OFF` default — v1.2 nested-editor path remains the user-facing default through Phase 21.

Out of scope (Phase 21–22): v1.2 fence-tag migration (MIGRATE-01..10, Phase 21); deletion of v1.2 files and `useInlineWidget=ON` cutover (DELETE-01..08, POLISH-01..06, Phase 22); `'leetcode.*'` userEvent removal (PROTECT-03, Phase 22); VIM-03 banner fallback (Phase 22, only if Phase 20 live-reconfigure proves empirically unreliable); theme regression visual gate (THEME-05, Phase 22). Multi-pane live/mirror sync (MULTI-01, MULTI-02) is v1.4+ deferred — Phase 20 ships single-active-per-file with a "Take over" affordance only.

</domain>

<decisions>
## Implementation Decisions

### Carry-Forward (locked by PROJECT.md / REQUIREMENTS.md / Phase 19 CONTEXT — not re-litigated)

- **L1:** Conflict modal options = "Keep mine / Keep external / View diff" (ROADMAP.md §"Phase 20" success criterion 1).
- **L2:** Action buttons read code via `widget.childView.state.doc.toString()` — no disk round-trip (ACTION-04).
- **L3:** Language switch flow = chevron click → `processFrontMatter` → `metadataCache.on('changed')` → `Compartment.reconfigure` (ACTION-02, ACTION-03).
- **L4:** Vim live = `vimCompartment.reconfigure(vim() ↔ [])`; VIM-03 reload-on-toggle banner is the **pre-accepted** Phase 22 fallback if Phase 20 probe fails (REQUIREMENTS.md Q2; VIM-03).
- **L5:** Section protection narrows to `## Problem` body + `## Techniques` heading; fence opener/closer protection removed because widget owns the fence range via `atomicRanges` (PROTECT-01, PROTECT-02; Phase 19 C-05).
- **L6:** `'leetcode.*'` userEvent convention is NOT removed in Phase 20 — it is still load-bearing for the v1.2 path (chevron switch in Phase 5.3, Reset child dispatch in Phase 17 D-03). PROTECT-03 removal is Phase 22.
- **L7:** All 8 v1.2 language packs already carry over via Phase 19's `languageCompartment` from `src/main/childEditorLanguage.ts` (WIDGET-08).
- **L8:** Phase 19 captured `historyJSON` per widget on every state-persistence-map entry. Phase 20's conflict-modal reload consumes this for undo-stack continuity across reload (carry-over from Phase 19 SUMMARY §"Open Items Carrying Forward").
- **L9:** `useInlineWidget=OFF` is the default through Phase 21; Phase 20 must remain regression-clean on both paths. Hard-gate from Phase 19 D-05 stays in force — when OFF, neither widget registration runs.
- **L10:** Single-active-per-file is the v1.3 baseline (REQUIREMENTS.md Q4). Multi-pane live/mirror is v1.4+ (MULTI-01, MULTI-02 deferred).

### Conflict Modal + Reload UX

- **D-conflict-01:** ANY unflushed chars in `debouncedWriter` trigger the conflict modal. If the timer is armed and pending content ≠ disk, the user is "in-flight." Aligns with v1.3 "never lose data" thesis. **Why:** simplest contract; alternatives (time-thresholded, focus-gated) add tunable knobs without clear win. **How to apply:** modal trigger condition is `widget.debouncedWriter.hasPending() === true` at `vault.on('modify')` arrival; fall through to silent reload otherwise.

- **D-conflict-02:** "View diff" expands the modal in place to show three columns: **Mine** (widget doc), **External** (disk), **Merged preview** (line-by-line LCS diff with conflict markers). Pure-TS line-diff (longest-common-subsequence), ~150 LOC. No external tools, no extra panes. **Why:** ROADMAP flags conflict modal as "novel UX surface — worth a paper-prototype review"; seeing the diff is the entire reason to gate on a modal vs. silent overwrite. Inline keeps the resolution in one focused flow. **How to apply:** new `src/widget/conflictDiff.ts` with `lineDiff(mine: string, ext: string): DiffRow[]`; modal renders three side-by-side `<pre>` columns with synced scroll.

- **D-conflict-03:** Silent-reload (no-conflict path) cursor preservation = **line/col clamp**. Capture `(line, col)` from `widget.childView.state.selection.main`, clamp to new doc bounds after reload, restore. **Why:** matches Obsidian's own external-file behavior; predictable; fails gracefully (cursor lands at end-of-line if line shrunk). Token-anchor scan was rejected as expensive on large docs and edge-case-prone when the anchor is the changed region. **How to apply:** standard CM6 reload pattern — capture selection, dispatch full-doc replacement, dispatch `selection: EditorSelection.cursor(clampedPos)` in same transaction.

- **D-conflict-04:** A second external edit arriving while the conflict modal is open updates the **External** column silently in place; the diff recomputes. No banner, no stacking. The modal is a live view of disk state. **Why:** lowest cognitive load during Obsidian Sync storms; the user's eventual "Keep external" applies to whatever External shows when they click. Stacking modals is provably bad UX; silently dropping new edits is data-loss-prone. **How to apply:** `vault.on('modify')` handler checks `if (conflictModal.isOpen) conflictModal.updateExternalContent(newContent)` instead of opening a second modal.

### Action Row Layout & Contents

- **D-action-01:** Action row sits **below the editor body, above the fence closer**. Single horizontal strip via `Decoration.widget({ block: true, side: 1 })` at the closer-line END (matching v1.2's existing pattern). **Why:** v1.2 reading-mode `codeActionsPostProcessor.ts` mounts buttons below; muscle memory carries over. User typically ends a coding session at the bottom of their solution — buttons sit one line away. **How to apply:** widget DOM order is `[editor body container] → [action row container]`; Live Preview ViewPlugin's `Decoration.replace` replaces the whole fence including this trailing row.

- **D-action-02:** Reuse `src/main/codeBlockButtonRow.ts` **verbatim** with no API changes. CSS class `.leetcode-code-actions`, `space-between` + `margin-left:auto` rules already in place. The widget passes the chevron prefix factory via the existing `buildCodeBlockButtonRow(doc, plugin, { prefix })` API. **Why:** v1.2 row is already styled, tested, and accessibility-correct (mousedown.preventDefault for focus retention; SVG icons, ARIA tooltips); rebuilding would risk regressions. The file is in `src/main/` (not `src/widget/`) but that's fine — Phase 22 can move it during cleanup if needed. **How to apply:** widget mount calls `buildCodeBlockButtonRow(doc, plugin, { prefix: () => makeLanguageChevron(file, plugin) })`.

- **D-action-03:** Widget action row = **exact v1.2 set, exact v1.2 grouping**. Left (prefix slot, `justify-content: space-between` clings left): chevron + Retrieve + Reset. Right (`margin-left: auto` clings right): AI Solution + Run + Submit. **No AI Debug button. No Copy button.** ROADMAP.md §"Phase 20" success criterion 2 wording (`Run / Submit / AI Debug / Reset / Copy`) is **imprecise** — actual v1.2 button set is `Retrieve / Reset / AI Solution / Run / Submit`. ROADMAP correction is a Phase 20 documentation task. **Why:** matches user's existing visual + muscle memory verbatim (user provided screenshot for confirmation). Adding net-new buttons (AI Debug, Copy) is scope creep into Phase 20 — both are deferred ideas if user wants them. **How to apply:** the existing `CodeBlockButtonRowHost` interface (`runFromActive`, `submitFromActive`, `aiSolutionFromActive`, `resetFromActive`, `retrieveLastSubmissionFromActive`) is the contract; widget creates a `CodeBlockButtonRowHost` adapter that routes to *FromWidget methods (D-action-04).

- **D-action-04:** Add new **`*FromWidget(widget)` plugin methods**: `runFromWidget`, `submitFromWidget`, `aiSolutionFromWidget`, `resetFromWidget`, `retrieveLastSubmissionFromWidget`. Each reads `widget.childView.state.doc.toString()` directly and routes to the same downstream LC API call as the corresponding `*FromActive` method. The v1.2 `*FromActive` methods are unchanged. At Phase 22, `*FromActive` methods are deleted; `*FromWidget` become the only path. **Why:** clean separation; survives Phase 22 deletion of the v1.2 path with mechanical renames. Mediator interface (`CodeSource`) was rejected as ceremony; hijacking `getActiveViewOfType` was rejected as too-broad side effect. **How to apply:** new methods live alongside `*FromActive` in `src/main.ts`; widget's button-row host adapter is `{ runFromActive: () => plugin.runFromWidget(widget), ... }` so the existing `buildCodeBlockButtonRow` API works unmodified.

### Section Protection Scope (PROTECT-01, PROTECT-02)

- **D-protect-01:** Protected regions in v1.3 = `## Problem` body + `## Code` heading + `## Techniques` heading. **Drop:** fence opener line, fence closer line, body-between-opener-and-closer (the widget owns this range entirely via `atomicRanges`). **Keep `## Code` heading locked** (ROADMAP wording is silent but v1.0 validated requirement remains — preventing accidental rename / delete of the heading that anchors the fence). **Why:** conservative; preserves v1.0 validated UX. Conditional locking ("only when adjacent to leetcode-solve fence") was rejected as overengineered; defer-to-probe was rejected as kicking the can. **How to apply:** the protected-ranges builder in `sectionProtectionExtension.ts` emits ranges for these three regions only; the fence-opener and fence-closer paths from `sectionLockExtension.ts` are deleted.

- **D-protect-02:** `sectionProtectionExtension.ts` keeps the `'leetcode.*'` userEvent bypass **verbatim** from `sectionLockExtension.ts`. Plugin writes (chevron switch in Phase 5.3, Reset child dispatch in Phase 17 D-03) still depend on this bypass under the v1.2 path. PROTECT-03 (Phase 22) removes the convention together with the v1.2 path deletion. **Why:** v1.2 path is alive through Phase 21; removing the bypass now would break chevron switch + Reset under `useInlineWidget=OFF`. Deprecation logging was rejected as noise. **How to apply:** copy the `tr.annotation(Transaction.userEvent).startsWith('leetcode.')` gate verbatim; preserve the comment block referencing Pitfall 5 + Phase 5.3 D-09.

- **D-protect-03:** Lifecycle = **mutually exclusive** with `sectionLockExtension`. The new `sectionProtectionExtension.ts` registers when `useInlineWidget=ON`; the existing `sectionLockExtension.ts` registers when `useInlineWidget=OFF`. The two extensions never coexist on the same parent CM6. The protectionExtension's mount lifecycle still gates on `lc-slug` frontmatter (same shape as v1.2). **Why:** prevents double-changeFilter interaction (especially around the `'leetcode.*'` bypass running twice); makes bisection clean (flag → which extension is active is unambiguous). **How to apply:** `Plugin.onload()` selects exactly one of the two `registerEditorExtension` calls based on `settings.useInlineWidget`; the mutual-exclusion assert from Phase 19 D-06 already enforces single-flag-on.

- **D-protect-04:** Build path = **fork `sectionLockExtension.ts` → `sectionProtectionExtension.ts`**, surgically remove the fence-opener and fence-closer cases from the protected-ranges builder. **Preserve verbatim:** the boundary fix (UAT 2026-05-13 — changeFilter exclusive at upper bound; offset-of-`## Problem` start is excluded), blank-line pocket logic (lock extends through trailing blanks so cursor doesn't get trapped), malformed-note path (only the `## Code` heading line is locked when fence-locator returns null), `'leetcode.*'` userEvent bypass, atomicRanges integration. Net ~150 LOC removed from a 527 LOC base. **Why:** ROADMAP MEDIUM-empirical-risk warning ("removing too much (regression of v1.0 validated requirement) or too little (interferes with non-fence writes)") targets exactly the rewrite-from-spec scenario. Forking preserves every edge case v1.2 hardened over multiple UAT rounds. PROTECT-01 wording "replacing sectionLockExtension.ts" is satisfied by the fork+rename — the new file replaces the old one in `Plugin.onload()` registration. **How to apply:** `cp src/main/sectionLockExtension.ts src/main/sectionProtectionExtension.ts`; delete the fence-opener and fence-closer ranges in the protected-ranges builder; rename exports; update `Plugin.onload()` to register the new file when `useInlineWidget=ON`. Run the v1.0 Phase 5.5 section-lock UAT cases against the new extension as a regression gate.

### Plan Structure (advisory — gsd-planner finalizes)

- **D-plan-01 [informational]:** **4 vertical slices.**
  - **Plan 20-01 — Section protection narrowing + vim live-reconfigure (Foundation).** Fork `sectionLockExtension.ts` → `sectionProtectionExtension.ts`; remove fence-opener/closer cases; preserve `'leetcode.*'` bypass + boundary fix + blank-line pocket + malformed-note path. Mutually-exclusive registration with `sectionLockExtension`. `vimCompartment.reconfigure(vim() ↔ [])` live toggle on settings change; dev-vault probe documents whether VIM-03 banner is needed in Phase 22. v1.0 Phase 5.5 section-lock UAT regression rerun. Acceptance: `## Problem` body + `## Code` heading + `## Techniques` heading remain locked; fence opener/closer are now editable in the file (but `atomicRanges` keeps the parent cursor out); vim toggle in Obsidian settings flips the widget's vim state without reload.
  - **Plan 20-02 — Action row + language chevron + *FromWidget methods (UX).** Mount `buildCodeBlockButtonRow` inside widget DOM with chevron prefix factory; wire `*FromWidget(widget)` methods reading `widget.childView.state.doc.toString()`. Reading-mode action row continues to render via `codeActionsPostProcessor.ts` unchanged (ACTION-06). Language chevron click → `processFrontMatter('lc-language', newLang)` → `metadataCache.on('changed')` → `Compartment.reconfigure(buildLanguageExtensions(newLang, indent))`. Acceptance: clicking Run / Submit / AI Solution / Reset / Retrieve in the widget triggers the same downstream behavior as the v1.2 active-leaf buttons; clicking the chevron flips frontmatter and swaps language packs without rebuilding the EditorView.
  - **Plan 20-03 — External-edit reconciliation + conflict modal + 3-pane diff (Sync).** `vault.on('modify')` handler: check `selfWriteSuppression.isExpected(path, content)` first (Phase 19 C-04); if external, branch on `widget.debouncedWriter.hasPending()` → silent reload (line/col clamp) OR conflict modal. New `src/widget/ConflictModal.ts` extending `Obsidian.Modal` with three-column layout. New `src/widget/conflictDiff.ts` with pure-TS LCS line diff. Modal updates External pane in place on second external edit. Phase 19's `historyJSON` capture consumed for post-resolution undo continuity. Acceptance: external edit while idle → cursor preserved, no modal; external edit while typing → modal appears; "View diff" expands inline; "Keep mine" rewrites disk; "Keep external" reloads widget.
  - **Plan 20-04 — Live theme retheme + multi-pane "Take over" affordance (Polish).** Theme detection via `app.workspace.on('css-change')` if it exists; fall back to `MutationObserver` on `document.body.classList`. Retheme path: refresh CSS classes only (no EditorView rebuild) — `lc-nested-editor` + `HyperMD-codeblock` containers + `childEditorSemanticClasses` already cascade Obsidian's CSS, so a single forced reflow is sufficient. Multi-pane "Take over" affordance: when pane B focuses the same file's widget, pane A's widget greys out + shows a "Click to take over" CTA; clicking promotes pane A and demotes pane B. Acceptance: light/dark toggle retheme widget colors live with no note reload; opening the same file in two panes shows the active pane's widget editable and the inactive pane's widget greyed-with-CTA.

- **D-plan-02:** **Plan order = sequential foundation → UX → sync → polish.** Each plan is a dogfood checkpoint:
  - Day 1: 20-01 Foundation — keystrokes still gated correctly, vim toggles live.
  - Day 2: 20-02 UX — widget feels usable; Run/Submit work from inside the widget.
  - Day 3: 20-03 Sync — external edits handled safely; conflict modal observable.
  - Day 4: 20-04 Polish — visual + multi-pane edge cases.

  Parallel ordering (20-01 + 20-02 in Wave 1) was rejected: 20-02 touches `src/widget/WidgetController.ts` for action-row mounting; 20-03 touches the same file for external-edit handler. Sequential prevents merge conflicts and keeps each dogfood checkpoint clean.

### Claude's Discretion

- **Theme detection probe:** `app.workspace.on('css-change')` may or may not exist in `obsidian@1.12.3` — Plan 20-04 researcher should grep `node_modules/obsidian/obsidian.d.ts` and verify before committing to the listener path. `MutationObserver` is the documented fallback regardless.
- **Vim live-reconfigure failure-mode classification:** Plan 20-01 dev-vault probe should treat "reconfigure works but insert-mode mid-keystroke is glitchy" as a fail (ship VIM-03 banner in Phase 22); "reconfigure works cleanly only after one no-op keystroke" is a pass. Planner has discretion to raise the bar based on what they observe.
- **Multi-pane "Take over" UX:** Plan 20-04 designer + planner pick between greyed-out+CTA vs. frozen-readonly snapshot vs. banner-across-both-panes. The DEFERRED multi-pane area covered three options at the discuss stage; planner picks one based on which preserves the most state with least flicker.
- **`MarkdownView.editor.cm` exposure:** widget edits to the parent doc (e.g., language-switch frontmatter via `processFrontMatter`) go through Obsidian's vault-layer APIs (`app.fileManager.processFrontMatter`), not direct `cm.dispatch`. Planner may need to verify `processFrontMatter` is atomic with respect to `vault.on('modify')` ordering — if not, the language-switch may itself trigger a modify event the widget's suppression map needs to absorb (treat as self-write under the same hash).
- **3-pane diff UX details:** column widths, syntax-highlighting on the Mine/External columns (probably yes, via the same `languageCompartment` configured for the active language), diff marker style (gutter vs. inline strikethrough), scroll synchronization. Planner picks based on Obsidian Modal sizing constraints.
- **Conflict-modal "Keep mine" mechanics:** does it bump the disk write through `debouncedWriter.flush()` immediately or queue a normal debounced write? Recommendation: immediate flush — user just made a deliberate decision. Planner finalizes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 20 Direct Foundation
- `.planning/phases/19-widget-foundation-one-way-sync/19-CONTEXT.md` — Phase 19 implementation decisions C-01..C-17 + D-01..D-10. Phase 20 inherits all of them.
- `.planning/phases/19-widget-foundation-one-way-sync/19-PHASE-SUMMARY.md` — Acceptance gate walk, empirical probe results (A1 modify ordering, A2 mousedown.stopPropagation, A3 history round-trip), 10 architectural decisions locked. **Especially:** "Open Items Carrying Forward" lists Phase 20 work explicitly.
- `.planning/phases/19-widget-foundation-one-way-sync/19-RESEARCH.md` (assumed) — Read for Pitfalls 19-A through 19-F context.

### v1.3 Research (foundation)
- `.planning/research/SUMMARY.md` — Q1–Q7 confirmed decisions; 4-phase build order; primitives.
- `.planning/research/STACK.md` — Two-path mount, `WidgetType.eq()`/`ignoreEvent()`, self-write suppression Set shape, Obsidian `debounce` API, CM6 version pin discrepancy.
- `.planning/research/FEATURES.md` — `EditorView.atomicRanges` load-bearing, vim live-reconfigure plan, anti-feature catalogue.
- `.planning/research/ARCHITECTURE.md` — Cutlist with LOC counts, dead-path audit, `src/widget/` file layout, dual-flag coexistence strategy.
- `.planning/research/PITFALLS.md` — Especially P2 (external edit echo), P8/P9/P10/P11 (conflict resolution), P16 (theme detection), P19/P20 (multi-pane), P21 (vim live-reconfigure), P24 (action-row mount).

### Project / Milestone State
- `.planning/PROJECT.md` — Key Decisions table; bundle-ceiling history.
- `.planning/REQUIREMENTS.md` — v1.3 requirements list with traceability. Phase 20 owns: SYNC-04, SYNC-05, ACTION-01..06, PROTECT-01, PROTECT-02, VIM-02, THEME-04.
- `.planning/ROADMAP.md` §"Phase 20: Reconciliation, UX, Action Row, Section Protection" — Goal, success criteria, key risks/notes (MEDIUM empirical risk on section narrowing; conflict modal flagged as worth-paper-prototype).
- `.planning/STATE.md` — Recent decisions affecting Phase 20 (especially the v1.3 architecture + section-lock-narrowing context).

### v1.2 Code Files (reusable / fork sources)
- `src/main/sectionLockExtension.ts` (527 LOC) — **Fork source for Plan 20-01.** Surgical removal of fence-opener/closer ranges; preserve boundary fix, blank-line pocket, malformed-note path, `'leetcode.*'` userEvent bypass, atomicRanges integration.
- `src/main/codeBlockButtonRow.ts` (99 LOC) — **Reuse verbatim in Plan 20-02.** `buildCodeBlockButtonRow(doc, plugin, { prefix })` API; widget passes chevron prefix factory.
- `src/main/codeActionsPostProcessor.ts` (67 LOC) — **Keep verbatim — unchanged in Phase 20.** Reading-mode v1.2-path action row (ACTION-06).
- `src/main/codeActionsEditorExtension.ts` (395 LOC) — Read for understanding v1.2 action-row mount via `Decoration.widget({ block: true, side: 1 })` at closer-line END. Phase 22 deletes; Phase 20 widget reuses the placement primitive (NOT this file directly — widget builds its own decoration from the same shape).
- `src/main/languageChevronWidget.ts` (304 LOC) — **Reuse verbatim in Plan 20-02 chevron prefix factory.** DOM construction via `doc.createElement` (no innerHTML); dropdown portaled to `doc.body` (G-DROPDOWN-CLIPPED pattern).
- `src/main/childEditorLanguage.ts` — `languageCompartment` + `buildLanguageExtensions(slug, indent)` 8-pack registry. Used by Plan 20-02 for `Compartment.reconfigure` on language switch.
- `src/main/childEditorTheme.ts` (152 LOC) — `lc-nested-editor` + `HyperMD-codeblock` classes. Plan 20-04 retheme path relies on these cascading from Obsidian's CSS.
- `src/main/childEditorSemanticClasses.ts` (297 LOC) — Lezer→semantic CSS class mapping. Plan 20-04 retheme inherits via cascade.

### v1.3 Widget Code (Phase 19 deliverables — Plan 20 modifies)
- `src/widget/codeBlockProcessor.ts` — Reading-mode mount handler. Plan 20-02 may add action-row container DOM construction.
- `src/widget/liveModeViewPlugin.ts` — Live Preview ViewPlugin with `Decoration.replace`. Plan 20-02 widget DOM extends to include action row.
- `src/widget/WidgetController.ts` — Per-widget state controller. Plan 20-02 mounts action row + chevron; Plan 20-03 mounts conflict-modal trigger; Plan 20-04 wires theme listener + multi-pane affordance.
- `src/widget/LeetCodeFenceWidget.ts` — Live Preview WidgetType. Plan 20-02 extends `toDOM` with action row; Plan 20-04 may extend with greyed-out state for multi-pane affordance.
- `src/widget/debouncedWriter.ts` — Phase 19 C-06. Plan 20-03 reads `hasPending()` for conflict-modal trigger gate.
- `src/widget/selfWriteSuppression.ts` — Phase 19 C-04. Plan 20-03 reads `isExpected(path, content)` to distinguish self-writes from external writes.
- `src/widget/statePersistence.ts` — Phase 19 C-09. Plan 20-03 hydrates `historyJSON` after conflict-modal "Keep external" reload.
- `src/widget/widgetRegistry.ts` — Per-plugin widget instance map. Plan 20-04 multi-pane affordance walks the registry to find peer widgets on the same file.
- `src/widget/embedDetect.ts` — Phase 19 EMBED-01..04. Plan 20-02 must skip action-row mount for embed widgets (read-only).

### Plan-Specific New Files (proposed — planner finalizes)
- `src/main/sectionProtectionExtension.ts` (NEW, ~370 LOC after fork+remove) — Plan 20-01.
- `src/widget/ConflictModal.ts` (NEW) — Plan 20-03; extends Obsidian `Modal`.
- `src/widget/conflictDiff.ts` (NEW, ~150 LOC) — Plan 20-03; pure-TS LCS line diff.
- `src/widget/themeListener.ts` (NEW) — Plan 20-04; `css-change` event or MutationObserver fallback.
- `src/widget/multiPaneCoordinator.ts` (NEW) — Plan 20-04; pane focus tracking + "Take over" CTA.

### v1.2 Test Files (regression rerun)
- `tests/main/sectionLockExtension.test.ts` — **Plan 20-01 must rerun the v1.0 Phase 5.5 acceptance cases against the new `sectionProtectionExtension.ts`.** Cases for fence-opener and fence-closer protection are deleted (those ranges no longer protected); cases for `## Problem` body, `## Code` heading, `## Techniques` heading must continue to pass byte-for-byte.

### Obsidian / CodeMirror Reference
- `node_modules/obsidian/obsidian.d.ts` (`obsidian@1.12.3`) — Especially `Modal`, `MetadataCache.on`, `processFrontMatter`, `Workspace.on('css-change')` (verify exists), `MarkdownView.editor.cm` cast pattern.
- `@codemirror/state@6.5.0` — `Compartment.reconfigure`, `EditorState.changeFilter`, `Transaction.userEvent`.
- `@codemirror/view@6.38.6` — `EditorView.atomicRanges`, `Decoration.widget`, `Decoration.replace`.
- `@replit/codemirror-vim@6.3.0` — `vim()` extension; library README is silent on Compartment.reconfigure runtime-toggle (Phase 20 empirical probe is the answer).

### CLAUDE.md Conventions (status update)
- `CLAUDE.md` §"Conventions" — `'leetcode.*'` userEvent paragraph and "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph **remain in CLAUDE.md through Phase 21**. Phase 20 plans MUST NOT delete or modify these. `sectionProtectionExtension.ts` continues to honor `'leetcode.*'` (D-protect-02). Phase 22 (DELETE-08, PROTECT-03) removes them.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (verbatim or light-modify)
- `src/main/sectionLockExtension.ts` — **Fork source.** v1.0/v1.2-hardened edge cases (boundary fix, blank-line pocket, malformed-note path) preserve verbatim.
- `src/main/codeBlockButtonRow.ts` — **Reuse verbatim.** `buildCodeBlockButtonRow(doc, plugin, { prefix })` API matches widget needs without modification.
- `src/main/languageChevronWidget.ts` — **Reuse verbatim.** Widget plugs into the existing chevron via the `prefix` factory.
- `src/main/codeActionsPostProcessor.ts` — Untouched — Reading-mode v1.2 path keeps using it (ACTION-06).
- `src/main/childEditorLanguage.ts:languageCompartment` + `buildLanguageExtensions` — Plan 20-02 calls `compartment.reconfigure(buildLanguageExtensions(newLang, indent))` for live language switch.
- Phase 19 `src/widget/*` files — All extended (not replaced); Phase 20 adds action-row mount + conflict-modal trigger + theme listener + multi-pane coordinator.

### Established Patterns
- **Compartment.reconfigure for live config swap** (Phase 16): `languageCompartment.reconfigure(buildLanguageExtensions(slug, indent))`. Plan 20-02 reuses for ACTION-03 (language switch) and Plan 20-01 for VIM-02 (vim toggle, separate `vimCompartment`).
- **Vault-layer write discipline** (v1.0/v1.1/v1.3): all plugin writes touching the fence body go through `app.vault.process(file, fn)` — including conflict-modal "Keep mine" path. The v1.3 widget's `debouncedWriter` is the single channel for widget writes.
- **`processFrontMatter` for atomic frontmatter changes** (v1.1, v1.2): `app.fileManager.processFrontMatter(file, (fm) => { fm['lc-language'] = newLang })`. Plan 20-02 chevron click uses this; the resulting `metadataCache.on('changed')` event is what the widget listens for.
- **`registerEvent()` for plugin lifecycle cleanup** — every event handler (vault.on('modify'), metadataCache.on('changed'), workspace.on('css-change')) registered through `this.registerEvent()` so they auto-unregister on `Plugin.onunload()`.
- **`Decoration.widget({ block: true, side: 1 })` at closer-line END** (Phase 13 / Phase 17): widget renders below the closer line; same primitive Phase 20 widget DOM construction uses for the action row's vertical position.
- **Obsidian Modal pattern** — Plan 20-03 ConflictModal extends `Obsidian.Modal`; mounts via `new ConflictModal(this.app, ...).open()`.

### Integration Points
- `src/main.ts:Plugin.onload()` — Plan 20-01 swaps `sectionLockExtension` ↔ `sectionProtectionExtension` registration based on `useInlineWidget` flag (mutually exclusive). Plan 20-02 adds `*FromWidget` methods.
- `src/widget/WidgetController.ts` — Plan 20-02 adds action-row mount + chevron prefix factory + `*FromWidget` host adapter; Plan 20-03 adds conflict-modal trigger + reload path; Plan 20-04 wires theme listener + multi-pane coordinator.
- `src/widget/LeetCodeFenceWidget.ts:toDOM()` — Plan 20-02 extends to include action-row container element; Plan 20-04 may add a greyed-out class for multi-pane "Take over" affordance.
- `src/main/childEditorLanguage.ts` — Plan 20-02 imports `languageCompartment` + `buildLanguageExtensions` for the `metadataCache.on('changed')` reactivity path.
- `src/settings/SettingsTab.ts` — Plan 20-01 vim toggle: when user toggles `app.vault.getConfig('vimMode')`, Phase 20 listens (probe: how does Obsidian fire this? `workspace.on('config-changed')`? Plan 20-01 researcher to verify) and reconfigures `vimCompartment`.
- `tests/widget/` — All four plans add new test files mirroring `src/widget/*`; Plan 20-01 adds `sectionProtectionExtension.test.ts` mirroring the v1.2 test surface.

</code_context>

<specifics>
## Specific Ideas

- **The action-row screenshot the user provided is the contract.** The exact button order (Java chevron / `{}` Retrieve / `↺` Reset on the left; ✦ AI Solution / ▷ Run / ☁ Submit on the right) is locked. ROADMAP s.c. 2 wording is downgraded to advisory; the screenshot wins. Phase 20 git commit should include a one-line ROADMAP correction.
- **Forking sectionLockExtension is the safer-than-rewrite path.** The v1.0 boundary-fix UAT (2026-05-13), the blank-line pocket logic, and the malformed-note path are not visible from the spec — they are scars from real bug reports. Rewriting from spec without those scars regresses validated behavior. Forking + surgically removing the fence ranges keeps every scar.
- **The conflict modal is one focused flow, not three pages.** The 3-pane diff expands the modal in place; the user clicks Keep mine / Keep external from the same surface that shows the diff. No drill-down, no separate diff window. ROADMAP "worth a paper-prototype review" warning is honored by the inline-expansion design — a single modal with three columns is the smallest paper-prototype-able UX.
- **`*FromWidget` (not `*FromActive`) is the new contract.** This is the architectural seam Phase 22 will sweep through to delete the v1.2 path. Building the seam in Phase 20 means Phase 22 is mechanical: rename `*FromWidget` → `*FromActive`, delete the old `*FromActive` impls.
- **`'leetcode.*'` userEvent bypass is preserved verbatim under v1.3 protection extension.** It's NOT dead code in Phase 20 — it's load-bearing for the v1.2 path's chevron switch + Reset child dispatch. Removing it is Phase 22's job, packaged with the v1.2 path deletion.

</specifics>

<deferred>
## Deferred Ideas

- **AI Debug button in widget action row** — Not part of v1.2 row; can land if user wants, but defer to a future polish phase. Currently AI Debug is invokable via command palette only. (Surfaced by ROADMAP s.c. 2 imprecision; flagged for ROADMAP correction.)
- **Copy button in widget action row** — Same as above; `widget.childView.state.doc.toString()` + clipboard is ~10 LOC if user wants it. Currently user can Cmd-A Cmd-C in the editor. Defer to future polish.
- **Multi-pane live/mirror sync (MULTI-01, MULTI-02)** — v1.4+. Phase 20 ships single-active-per-file with "Take over" CTA only.
- **PROTECT-03: `'leetcode.*'` userEvent removal from sectionProtectionExtension + CLAUDE.md** — Phase 22, paired with v1.2 path deletion.
- **VIM-03: Reload-on-toggle banner** — Phase 22, **only if** Plan 20-01 dev-vault probe shows live-reconfigure is empirically unreliable.
- **THEME-05: Theme regression visual gate (top 5 community themes)** — Phase 22 release gate.
- **DELETE-01..07: v1.2 file deletion** — Phase 22.
- **POLISH-01: `useInlineWidget` flip to default ON** — Phase 22.
- **ROADMAP s.c. 2 wording correction** — Documentation cleanup task: change "Run / Submit / AI Debug / Reset / Copy" to "Retrieve / Reset / AI Solution / Run / Submit" to match v1.2 button set. (Could land in Phase 20's git_commit step or be deferred to Phase 22 doc sweep.)
- **`processFrontMatter` ↔ `vault.on('modify')` ordering probe** — Plan 20-02 may discover that frontmatter writes through `processFrontMatter` trigger a modify event; if so, the widget's selfWriteSuppression must absorb it. If empirical answer is "no extra modify event," no work needed.
- **3-pane diff syntax-highlighting** — recommended yes (reuse `languageCompartment` for the active language) but planner can defer if it slows Plan 20-03.
- **Conflict modal "Keep mine" debounce semantics** — recommended immediate flush (deliberate user action); planner finalizes.

</deferred>

---

*Phase: 20-Reconciliation, UX, Action Row, Section Protection*
*Context gathered: 2026-05-29*
