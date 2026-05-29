---
phase: 20
slug: reconciliation-ux-action-row-section-protection
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| _pending_ | — | — | — | — | — | — | — | — | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
