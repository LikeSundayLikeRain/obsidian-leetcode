---
phase: 20
slug: reconciliation-ux-action-row-section-protection
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-29
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (existing — no Wave 0 install required) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled in by gsd-planner during step 8. Each plan task with executable code MUST land in this table with an automated command, OR map to a Wave 0 stub, OR appear in Manual-Only Verifications below with documented justification.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-T1 | 20-01 | 1 | PROTECT-01, PROTECT-02 | T-20-01-01, T-20-01-02, T-20-01-03 | Section-protection narrowing preserves UAT-hardened scars + `'leetcode.*'` userEvent bypass + mutually-exclusive registration | unit + regression | `npx tsc --noEmit && npx vitest run tests/main/sectionProtectionExtension.test.ts tests/main/sectionLockExtension.test.ts --reporter=basic` | Task creates `tests/main/sectionProtectionExtension.test.ts` (forks v1.0 cases) + `tests/main/sectionLockExtension.test.ts` (Phase 5.5 baseline) | ⬜ pending |
| 20-01-T2 | 20-01 | 1 | VIM-02 | T-20-01-04, T-20-01-06, T-20-01-07 | vimCompartment.reconfigure round-trip preserves cursor/scroll/undo + plugin-side layout-change dispatcher iterates registry | unit | `npx tsc --noEmit && npx vitest run tests/widget/vimReconfigure.test.ts tests/widget/vimMount.test.ts tests/widget/widgetRegistry.test.ts --reporter=basic` | Task creates `tests/widget/vimReconfigure.test.ts` | ⬜ pending |
| 20-02-T1 | 20-02 | 2 | ACTION-01, ACTION-02, ACTION-05, ACTION-06 | T-20-02-04, T-20-02-05 | Action-row mount inside widget container with locked button order + verbatim reuse of buildCodeBlockButtonRow + buildLanguageChevron + single-mount assertion under both useInlineWidget settings | unit + DOM | `npx tsc --noEmit && npx vitest run tests/widget/widgetActionRow.test.ts tests/widget/actionRowSingleMount.test.ts tests/main/codeBlockButtonRow.test.ts tests/main/codeActionsPostProcessor.test.ts --reporter=basic` | Task creates `tests/widget/widgetActionRow.test.ts` + `tests/widget/actionRowSingleMount.test.ts` | ⬜ pending |
| 20-02-T2 | 20-02 | 2 | ACTION-03, ACTION-04 | T-20-02-01, T-20-02-03, T-20-02-05, T-20-02-06, T-20-02-07 | *FromWidget reads code via state.doc.toString() (no disk roundtrip) + per-widget metadataCache reactivity dispatches Compartment.reconfigure without rebuild + Pitfall P2 early-return absorbs frontmatter-only modify echo + `currentDocHash` field declared on WidgetController | unit + Promise-order | `npx tsc --noEmit && npx vitest run tests/widget/fromWidget.test.ts tests/widget/languageSwitch.test.ts tests/widget/languageReactivity.test.ts --reporter=basic` | Task creates `tests/widget/fromWidget.test.ts` + `tests/widget/languageSwitch.test.ts` + `tests/widget/languageReactivity.test.ts` | ⬜ pending |
| 20-03-T1 | 20-03 | 3 | SYNC-05 | T-20-03-04 | Pure-TS LCS line diff returns correct DiffRow[] for hostile inputs + DebouncedWriter.hasPending sentinel resets correctly | unit + perf | `npx tsc --noEmit && npx vitest run tests/widget/conflictDiff.test.ts tests/widget/debouncedWriter.test.ts --reporter=basic` | Task creates `tests/widget/conflictDiff.test.ts` + extends `tests/widget/debouncedWriter.test.ts` | ⬜ pending |
| 20-03-T2 | 20-03 | 3 | SYNC-04, SYNC-05 | T-20-03-01, T-20-03-02, T-20-03-03, T-20-03-05, T-20-03-06, T-20-03-07, T-20-03-08, T-20-03-09 | ConflictModal lifecycle uses Obsidian-guaranteed onOpen/onClose (no custom open/close overrides) + activeConflictModal cleared via constructor callback + reload preserves cursor via line/col clamp + Transaction.addToHistory.of(false) + textContent-only DOM render + second-external-edit updates External pane in place | unit + DOM + lifecycle | `npx tsc --noEmit && npx vitest run tests/widget/ConflictModal.test.ts tests/widget/externalEditReload.test.ts tests/widget/conflictTrigger.test.ts tests/widget/conflictModalUpdate.test.ts --reporter=basic` | Task creates `tests/widget/ConflictModal.test.ts` + `tests/widget/externalEditReload.test.ts` + `tests/widget/conflictTrigger.test.ts` + `tests/widget/conflictModalUpdate.test.ts` | ⬜ pending |
| 20-04-T1 | 20-04 | 4 | THEME-04 | T-20-04-05 | css-change listener iterates registry; cssRetheme calls only view.requestMeasure (no rebuild) | unit + spy | `npx tsc --noEmit && npx vitest run tests/widget/themeListener.test.ts --reporter=basic` | Task creates `tests/widget/themeListener.test.ts` | ⬜ pending |
| 20-04-T2 | 20-04 | 4 | (multi-pane single-active baseline per L10) | T-20-04-01, T-20-04-02, T-20-04-03, T-20-04-07 | Two widgets on same file path → setGreyedOut flips data-pane-state correctly per active leaf; click on overlay promotes pane reversibly; CSS variables only | unit + DOM | `npx tsc --noEmit && npx vitest run tests/widget/multiPaneCoordinator.test.ts tests/widget/themeListener.test.ts --reporter=basic` | Task creates `tests/widget/multiPaneCoordinator.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/main/sectionProtectionExtension.test.ts` — fork v1.0 Phase 5.5 cases from `tests/main/sectionLockExtension.test.ts`; remove fence-opener/closer cases; preserve `## Problem` body + `## Code` heading + `## Techniques` heading + `'leetcode.*'` userEvent bypass + boundary-fix cases (Plan 20-01)
- [ ] `tests/widget/conflictDiff.test.ts` — LCS line-diff unit tests (identical / pure-add / pure-delete / interleaved / empty / multiline edge cases) (Plan 20-03)
- [ ] `tests/widget/ConflictModal.test.ts` — modal lifecycle + 3-pane render + "Keep mine"/"Keep external"/"View diff" branch tests; second-external-edit-while-open updates External pane in place (Plan 20-03)
- [ ] `tests/widget/themeListener.test.ts` — `css-change` listener registration + cleanup; cascade-only retheme (no EditorView rebuild) (Plan 20-04)
- [ ] `tests/widget/multiPaneCoordinator.test.ts` — registry walk; "Take over" CTA promote/demote (Plan 20-04)
- [ ] `tests/widget/widgetActionRow.test.ts` — `*FromWidget` adapter wiring; chevron prefix factory; `widget.view.state.doc.toString()` is the code source (Plan 20-02)
- [ ] `tests/widget/languageSwitch.test.ts` — chevron click → `processFrontMatter` → `metadataCache.on('changed')` → `Compartment.reconfigure` flow without rebuilding EditorView (Plan 20-02)
- [ ] `tests/widget/vimReconfigure.test.ts` — `vimCompartment.reconfigure(vim() ↔ [])` round-trip; documents probe outcome (pass → keep; fail → escalate VIM-03 to Phase 22) (Plan 20-01)
- [ ] `tests/widget/externalEditReload.test.ts` — silent reload path: line/col cursor clamp; `selfWriteSuppression.isExpected()` gate; `historyJSON` continuity (Plan 20-03)
- [ ] `tests/widget/conflictTrigger.test.ts` — `vault.on('modify')` handler decision tree: self-write consumed → no-op; idle → silent reload; pending writer → conflict modal (Plan 20-03)

*Existing `tests/main/sectionLockExtension.test.ts` continues to validate the v1.2 path through Phase 21; do not delete in Phase 20.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| External edit via Obsidian Sync triggers conflict modal when typing | SYNC-04, SYNC-05 | Real-world Sync timing; vitest cannot simulate Obsidian Sync transport | Open same vault on two devices via Obsidian Sync; type in widget on device A; edit fence body in plain editor on device B; verify modal appears on A within 1s with "Keep mine / Keep external / View diff" |
| Vim mode toggle in Obsidian Settings flips widget vim live | VIM-02 | Settings UI dispatches via Obsidian internals; not unit-testable without live Obsidian instance | Dev vault: Open LeetCode note with widget; toggle Settings → Editor → Vim key bindings; verify keystrokes route to vim-mode handlers immediately (h/j/k/l navigates) without reload; toggle off; verify normal-mode insert restored |
| Light/dark theme swap rethemes widget colors live | THEME-04 | CSS cascade behavior depends on installed theme + Obsidian internal CSS pipeline | Dev vault: Open LeetCode note with widget; toggle Appearance → Light/Dark; verify all 8 language packs retheme (token colors, gutter, line-numbers) without note reload; repeat with custom community theme installed |
| Multi-pane "Take over" CTA promotes inactive pane | DEFERRED v1.4 baseline (single-active-with-CTA) | Pane focus tracking depends on Obsidian workspace events firing in real layout | Dev vault: Open same LeetCode note in two split panes; verify pane B widget greys + shows "Click to take over" CTA when pane A is active; click CTA; verify pane A demotes (greys with CTA) and pane B promotes (editable) |
| Section-protection narrowing — fence opener/closer freely editable but parent cursor stays out via `atomicRanges` | PROTECT-01 | `atomicRanges` cursor-skip is a runtime-only CM6 behavior with multiple keyboard-input edge cases | Dev vault: Open LeetCode note; cursor up-arrow into closer line — verify cursor jumps over fence body to `## Problem` body if unprotected, or `## Code` heading edge if protected; right-arrow at end of `## Code` heading line — verify cursor lands at fence-opener start position; backspace at fence-opener — verify edit accepted (no longer protected) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each plan creates its test files first per task action — per-plan test files stand in for separate Wave 0 stub tasks)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (full suite ~25s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-29
