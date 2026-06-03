---
phase: 20
slug: reconciliation-ux-action-row-section-protection
status: human_needed
verified_at: 2026-05-29
score: 12/12
overrides_applied: 0
---

# Phase 20 — Verification Report

## Phase Goal

Make v1.3 inline widget UX-complete behind `useInlineWidget=OFF` so it can be flipped ON cleanly at Phase 22 without UX regressions. Six surfaces:

1. External-edit reconciliation + conflict modal (SYNC-04, SYNC-05)
2. In-widget action row + language chevron (ACTION-01..06)
3. Language switching via frontmatter (ACTION-02, ACTION-03)
4. Narrowed section protection (PROTECT-01, PROTECT-02)
5. Vim live-reconfigure (VIM-02)
6. Live theme retheme (THEME-04)

## Requirements Coverage Matrix

| REQ-ID | Plan | Code Evidence | Status |
|--------|------|---------------|--------|
| SYNC-04 | 20-03 | `src/widget/WidgetController.ts:reloadFromDisk` (line 405 has `Transaction.addToHistory.of(false)`); line/col cursor clamp + `EditorSelection.cursor(restoredHead)` + scrollTop preserve; `src/main.ts:1148-1156` modify-handler decision tree branch (d) routes idle external edit → silent reload | VERIFIED |
| SYNC-05 | 20-03 | `src/widget/ConflictModal.ts` (193 LOC) — Modal subclass; 3-button initial state in `onOpen()` (line 99); pure-TS LCS in `src/widget/conflictDiff.ts` (117 LOC); `updateExternalContent` for D-conflict-04; `src/main.ts:1149` branches on `hasPending()`; `src/main.ts:1159-1178` constructs/updates `activeConflictModal` | VERIFIED |
| ACTION-01 | 20-02 | `src/widget/widgetActions.ts:mountActionRow` (116 LOC) builds host adapter; reuses `buildCodeBlockButtonRow` + `buildLanguageChevron` verbatim; mount integration in `WidgetController.mountLeetCodeWidget` gated on `!isEmbedContext + hasFromWidgetSurface`; tests `tests/widget/widgetActionRow.test.ts` 13 cases | VERIFIED |
| ACTION-02 | 20-02 | `src/main.ts:2806 switchLanguageFromWidget` invokes `processFrontMatter` (line 2825); chevron prefix factory in `widgetActions.ts` invokes `switchLanguageFromWidget`; verified by `tests/widget/languageSwitch.test.ts` (4 cases — flush→processFrontMatter ordering, no parent CM6 dispatch) | VERIFIED |
| ACTION-03 | 20-02 | `src/widget/WidgetController.ts:950 languageCompartment.reconfigure` dispatched inside `metadataCache.on('changed')` callback filtered by `file.path === ctl.file.path` (lines 210-211 JSDoc, callback body wires effects-only dispatch); verified by `tests/widget/languageReactivity.test.ts` (6 cases — view ref unchanged) | VERIFIED |
| ACTION-04 | 20-02 | `src/main.ts:2640, 2701, 2689, 2726, 2915` — every `*FromWidget` reads code via `widget.view.state.doc.toString()`; no `app.vault.read` in those bodies; verified by `tests/widget/fromWidget.test.ts` (12 cases — flush-before-read ordering, frontmatter resolution, no-lc-slug Notice) | VERIFIED |
| ACTION-05 | 20-02 | Verbatim reuse of v1.2 `buildCodeBlockButtonRow` (flex-wrap + CSS variable discipline + focus save/restore) — `git diff` zero diff per 20-02-SUMMARY check #5; tests/main/codeBlockButtonRow.test.ts continues to pass | VERIFIED |
| ACTION-06 | 20-02 | `src/main/codeActionsPostProcessor.ts` UNTOUCHED by Phase 20 (Reading-mode v1.2 path); single-mount enforced by `tests/widget/actionRowSingleMount.test.ts` (3 cases — exactly one `.leetcode-code-actions` per fence per useInlineWidget setting) | VERIFIED |
| PROTECT-01 | 20-01 | `src/main/sectionProtectionExtension.ts` exists (512 LOC) — forked from `sectionLockExtension.ts` (D-protect-04); `## Problem` body + `## Code` heading + `## Techniques` heading lock preserved; verified by `tests/main/sectionProtectionExtension.test.ts` 32 cases | VERIFIED |
| PROTECT-02 | 20-01 | `grep -nE "closer\.from|closerLockTo" src/main/sectionProtectionExtension.ts` returns ZERO hits — surgical removal of fence-CLOSER lock block confirmed; widget owns fence body via Phase 19 `atomicRanges` ViewPlugin | VERIFIED |
| VIM-02 | 20-01 | `src/widget/WidgetController.ts:165 vimCompartment` (Compartment per-widget); `reconfigureVim(enabled)` at line 443 dispatches `vimCompartment.reconfigure(...)` effects-only; `src/main.ts:1052 workspace.on('layout-change')` iterates `widgetRegistry.values()`; `tests/widget/vimReconfigure.test.ts` 9 cases | VERIFIED |
| THEME-04 | 20-04 | `src/widget/themeListener.ts:71 workspace.on('css-change')` (87 LOC); `WidgetController.cssRetheme()` at line 478 calls `view.requestMeasure()` ONLY (no rebuild); `src/main.ts:1020 registerThemeListener(this)` inside `useInlineWidget=ON` block; `tests/widget/themeListener.test.ts` 5 cases | VERIFIED |

**12/12 requirements VERIFIED in code (not just SUMMARY claims).**

## Must-Haves Verification (Per Plan)

### Plan 20-01 (Foundation — section protection + vim live-reconfigure)

| Truth | Status | Evidence |
|-------|--------|----------|
| `sectionProtectionExtension` protects only Problem body + Code heading + blank-line pocket + Techniques heading | VERIFIED | 32 forked test cases pass; closer.from/closerLockTo removed |
| Mutually-exclusive registration via `useInlineWidget` gate | VERIFIED | `src/main.ts:1207-1212` if/else gate with `useInlineWidget` read once at onload (line 903) |
| `'leetcode.*'` userEvent bypass preserved verbatim | VERIFIED | grep returns 6 references (lines 4, 25, 373); CLAUDE.md convention paragraph 1 honored |
| Boundary fix + blank-line pocket + malformed-note path + helpers preserved | VERIFIED | 30 of 30 v1.0 Phase 5.5 base cases pass byte-for-byte against new extension |
| Per-widget vimCompartment swaps vim() ↔ [] without rebuild | VERIFIED | `WidgetController.reconfigureVim` at line 443; effects-only dispatch (no `changes`/`selection`) per `vimReconfigure.test.ts` Behavior 6 |
| Single layout-change listener iterates registry.values() | VERIFIED | `src/main.ts:1052` workspace.on('layout-change') inside useInlineWidget=ON block |

### Plan 20-02 (UX — action row + chevron + *FromWidget)

| Truth | Status | Evidence |
|-------|--------|----------|
| Action row mounts inside widget container as sibling of `.cm-editor` | VERIFIED | `mountActionRow` appends to `ctl.container`; widgetActions.ts:116 LOC |
| Button order: chevron + Retrieve + Reset + AI Solution + Run + Submit | VERIFIED | `tests/widget/widgetActionRow.test.ts` Test 1 asserts 6 children in order |
| Each button click invokes `*FromWidget(widget)` with flush-then-read seam | VERIFIED | host adapter routes `*FromActive` → `*FromWidget`; flush-before-read verified by Promise spies |
| Chevron click → `processFrontMatter` (NO parent CM6 dispatch) | VERIFIED | `src/main.ts:2806-2825` switchLanguageFromWidget; languageSwitch.test.ts case 3 asserts no parent dispatch |
| Per-widget metadataCache subscription dispatches Compartment.reconfigure | VERIFIED | `src/widget/WidgetController.ts:950` languageCompartment.reconfigure inside metadataCache callback |
| Pitfall P2 absorbed via `widget.currentDocHash` early-return | VERIFIED | currentDocHash field at line 206; refresh in onDocChanged at line 837 |
| `buildCodeBlockButtonRow` + `buildLanguageChevron` reused VERBATIM | VERIFIED | tests/main/codeBlockButtonRow.test.ts continues to pass byte-for-byte |
| Reading-mode action row UNCHANGED (codeActionsPostProcessor.ts untouched) | VERIFIED | actionRowSingleMount.test.ts asserts exactly one row per useInlineWidget setting |

### Plan 20-03 (Sync — reconciliation + conflict modal + LCS diff)

| Truth | Status | Evidence |
|-------|--------|----------|
| vault.on('modify') decision tree (P2 early-return → tryConsume → hasPending) | VERIFIED | `src/main.ts:1148-1178` full handler structure; placeholder removed |
| ConflictModal extends Modal; 3-button + diff-expansion (View diff does NOT replace buttons) | VERIFIED | ConflictModal.ts:99 onOpen builds 3 buttons; expandDiff appends without removing |
| Pure-TS LCS line-diff (~150 LOC, no library dep) | VERIFIED | conflictDiff.ts 117 LOC; pure function; 11 cases pass |
| Second external edit while modal open updates External pane in place | VERIFIED | `src/main.ts:1159-1162` if/else gate; conflictModalUpdate.test.ts case 1 verifies single constructor call |
| Silent reload preserves cursor via line/col clamp + addToHistory.of(false) | VERIFIED | reloadFromDisk at WidgetController.ts:405 dispatches with addToHistory.of(false) annotation |
| 'Keep mine' calls `widget.writer.forceFlush()`; 'Keep external' calls `reloadFromDisk('keep-external')` | VERIFIED | ConflictModal.ts onOpen handlers route correctly per Modal Tests 2-3 |
| `DebouncedWriter.hasPending()` accessor; sentinel reset via try/finally | VERIFIED | debouncedWriter.ts:111 hasPending; pending sentinel field at line 63 |
| ConflictModal renders external file content via textContent only — NEVER innerHTML | VERIFIED | grep returns 0 actual usages (only JSDoc comments referencing the rule) |

### Plan 20-04 (Polish — theme retheme + multi-pane)

| Truth | Status | Evidence |
|-------|--------|----------|
| Single global app.workspace.on('css-change') iterates registry.values() | VERIFIED | themeListener.ts:71 subscription; iterates ctl.cssRetheme() per widget |
| cssRetheme() calls view.requestMeasure() only — NO EditorView rebuild | VERIFIED | WidgetController.ts:478-484 body is `try { this.view.requestMeasure(); } catch {}` |
| Single global active-leaf-change + layout-change listener walks registry | VERIFIED | multiPaneCoordinator.ts subscribes to BOTH events per ephemeralTabStore precedent |
| setPaneState toggles data-pane-state; overlay mounted/unmounted | VERIFIED | WidgetController.ts:523 setPaneState; styles.css 2107-2139 selectors |
| Greyed-out overlay is child of widget container, NOT CM6 child | VERIFIED | overlay constructed via `createElement` + appended to container |
| Multi-pane state changes reversible; click promotes via setActiveLeaf | VERIFIED | promoteThisPane walks getLeavesOfType + setActiveLeaf; coordinator listener catches |
| Multi-pane coordinator does NOT dispatch widget writes | VERIFIED | only mutates container attribute + DOM children |
| MutationObserver fallback documented but NOT shipped | VERIFIED | themeListener.ts JSDoc references; only `workspace.on('css-change')` shipped |

## Critical Compliance Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Requirement coverage: 12/12 IDs verified in code | PASS | All 12 reqs cross-referenced above |
| 2 | `'leetcode.*'` userEvent bypass preserved verbatim under sectionProtectionExtension | PASS | `grep -c "leetcode\."` returns 6 hits in src/main/sectionProtectionExtension.ts (lines 4, 25, 373) |
| 3 | `*FromActive` methods unchanged (Phase 22 architectural seam) | PASS | All 5 `*FromActive` methods exist as thin wrappers (lines 2522, 2552, 2573, 2895, 3097); shared `*WithCode/*WithSlug` helpers extracted |
| 4 | Zero `innerHTML` (CLAUDE.md mandate) | PASS | All 3 grep hits in source code are JSDoc comments referencing the no-innerHTML rule (WidgetController.ts:509-510, conflictDiff.ts:17). No actual `innerHTML` assignments anywhere in new code |
| 5 | ConflictModal isOpen mutated in onOpen/onClose ONLY; constructor-callback for activeConflictModal cleanup | PASS | ConflictModal.ts:100 sets isOpen=true in onOpen; line 189 sets false in onClose; line 190 invokes onCloseCallback BEFORE contentEl.empty; constructor accepts onCloseCallback (line 75); main.ts:1175 passes `() => { activeConflictModal = null }` |
| 6 | Section narrowing: Problem body + Code heading + Techniques heading locked; fence opener/closer body locks REMOVED | PASS | grep `closer.from\|closerLockTo` returns ZERO hits in sectionProtectionExtension.ts; widget owns fence via Phase 19 atomicRanges |
| 7 | Mutual exclusivity in src/main.ts: useInlineWidget=OFF → sectionLockExtension; ON → sectionProtectionExtension | PASS | src/main.ts:1207-1212 if/else block; useInlineWidget read once at line 903; never both |
| 8 | L10 single-active baseline: peer panes show CTA only, do NOT live-mirror typing | PASS | multiPaneCoordinator only flips data-pane-state attribute; setPaneState mounts overlay/CTA on 'peer'; no doc dispatching to peer widgets |
| 9 | Theme retheme: NO EditorView rebuild — cascade-only via existing CSS classes | PASS | WidgetController.cssRetheme body is `view.requestMeasure()` only; no Compartment.reconfigure, no rebuild, no DOM mutation |
| 10 | Build + tests green | PASS | Per orchestrator: 2057 pass / 6 skipped / 0 fail; npm run build exit 0 |

**10/10 critical compliance checks PASS.**

## Human Verification

These items are explicitly classified as Manual-Only in 20-VALIDATION.md (rows §"Manual-Only Verifications") because they require live Obsidian instances. They are NOT gaps — they are expected pending items per Phase 20 plan design (CONTEXT L4 vim probe pre-acceptance, D-plan-02 Day 4 dogfood).

### 1. Vim Live-Reconfigure Dev-Vault Probe (VIM-02)

**Test:** Open LC note with widget mounted in dev vault (`~/Documents/Obsidian Vault`). Toggle Settings → Editor → Vim key bindings → ON without reloading. Position cursor in widget; press Esc; verify (a) cursor changes to block, (b) `j/k/l/h` move without inserting, (c) press `i` enters insert mode, (d) toggle vim OFF, verify `j` inserts.
**Expected:** All six steps work without note reload; no insert-mode glitches; no cursor/scroll/undo loss across dispatch.
**Why human:** `@replit/codemirror-vim@6.3.0` runtime behavior under `Compartment.reconfigure(vim() ↔ [])` is empirically untested; library internal state (vim mode, command buffer) survival across dispatch cannot be unit-tested.

### 2. atomicRanges Cursor-Edge Cases (PROTECT-01)

**Test:** In dev vault with `useInlineWidget=ON`, exercise:
  (a) up-arrow into closer line → cursor jumps over fence body to next editable line above
  (b) right-arrow at end of `## Code` heading line → cursor lands past blank-line pocket + opener
  (c) backspace at fence-opener line → edit accepted (opener no longer protected; atomicRanges only governs cursor motion)
  (d) type into fence body → edit accepted via widget's own EditorView
**Expected:** All four cases pass; runtime CM6 atomicRanges keeps parent cursor out in Live Preview.
**Why human:** atomicRanges is a runtime-only CM6 behavior requiring live Obsidian leaf; cannot be exercised under vitest.

### 3. Light/Dark Theme Retheme (THEME-04)

**Test:** Dev vault — open LC note with widget. Toggle Settings → Appearance → Light/Dark. Verify widget body background flips ~16ms; syntax highlight colors update; cursor stays at line:col; scroll position unchanged; undo stack intact (Cmd-Z reverts last typed character, NOT theme change). Repeat for Minimal + Things community theme swaps. Verify `prefers-reduced-motion` does not animate.
**Expected:** Live retheme without note reload; no white flash; all 8 language packs repaint correctly.
**Why human:** Obsidian internal CSS pipeline + community theme cascade behavior cannot be simulated under vitest.

### 4. Multi-Pane Take-Over CTA (multi-pane single-active baseline)

**Test:** Dev vault — open same LC note in two split panes. Verify pane B widget greys with "Click to take over" CTA centered when pane A active. Click pane B's CTA → pane A demotes (greys with CTA), pane B promotes (editable) within 1 animation frame. Click pane A's CTA → swap back. Open transcluded LC fence (`![[lc-note#Code]]`) in third pane → embed widget shows underlying content with NO greyed overlay (embed gate).
**Expected:** Reversible promote/demote; single-active invariant holds; embed widgets always show as 'active'.
**Why human:** Pane focus tracking depends on Obsidian workspace events firing in real layout — cannot be unit-tested without live workspace.

### 5. Obsidian Sync Conflict Modal (SYNC-04, SYNC-05)

**Test:** Open same vault on two devices via Obsidian Sync. Type in widget on device A. Edit fence body in plain editor on device B. Verify modal appears on device A within ~1s with three buttons. "View diff" expands inline; "Keep mine" persists local typing + Notice "Local edits saved."; "Keep external" reloads cursor preserved at line:col + Notice "Reloaded from disk."; second external edit while modal open updates External pane silently in place (no second modal stacks). Cmd-Z after "Keep external" does nothing useful (L8 documented limitation).
**Expected:** Modal appears reliably under real Sync transport; all three resolutions behave per UI-SPEC §Copywriting.
**Why human:** Real-world Sync timing cannot be simulated under vitest — only the decision-tree branching and modal lifecycle are unit-testable.

## Gaps Found

None. All 12 requirements verified in code; all 10 critical compliance checks PASS; all unmet items are explicitly Manual-Only per 20-VALIDATION.md classification.

## Build & Test State

| Command | Result |
|---------|--------|
| `npm run build` (per orchestrator) | exit 0; bundle 1.71 MB |
| `npm test` (per orchestrator) | **2057 pass / 6 skipped / 0 fail** across 234 test files |
| `npx tsc --noEmit` (per all SUMMARY checks) | exit 0 |

Test suite delta across Phase 20: 1906 baseline → 2057 passing (+151 tests across 4 plans). Zero pre-existing tests regressed.

## Verification Outcome

**Status: human_needed** — All 12 requirements verified in code; all 10 critical compliance checks PASS; build + tests green. Five Manual-Only items remain pending dev-vault UAT per 20-VALIDATION.md §"Manual-Only Verifications" classification (vim live-reconfigure probe; atomicRanges cursor-edge cases; light/dark + community theme retheme; multi-pane Take-Over CTA; Obsidian Sync conflict modal). These are NOT gaps — they are expected pending items per Phase 20 plan design (CONTEXT L4 + D-plan-02). Phase 22 readiness gate: dev-vault UAT outcomes feed into VIM-03 banner decision (Phase 22 contingency).

---

_Verified: 2026-05-29_
_Verifier: Claude (gsd-verifier, opus 4.7)_
