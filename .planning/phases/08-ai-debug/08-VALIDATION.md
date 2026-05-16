---
phase: 08
slug: ai-debug
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run --reporter=basic` (changed files only via `--changed`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (current suite + Phase 08 additions) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed` (≤ 5 s)
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Filled in by the planner with one row per emitted task. Reference 08-RESEARCH.md `## Validation Architecture` for signal → oracle → sampling mappings.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD by planner_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/lastVerdictStore.test.ts` — stubs for AIDBG-01 (capture/scope/clear contract)
- [ ] `tests/ai/buildDebugPrompt.test.ts` — stubs for AIDBG-01 (prompt assembly + empty-store fallback)
- [ ] `tests/ai/AIStreamModal.test.ts` — stubs for AIDBG-02, AIDBG-03 (stream render, fallback Thinking…, Cancel cleanup)
- [ ] `tests/ai/AIClient.invokeStream.test.ts` — stubs for AIDBG-02 (stream path + non-streaming fallback)
- [ ] `tests/ai/disclosure.test.ts` — extend with `withDebugBullet` factory (composition, no mutation)
- [ ] `tests/main/codeBlockButtonRow.test.ts` — bump no-prefix assertion 2 → 3 children; chevron-prefix 3 → 4
- [ ] `tests/solve/VerdictModal.test.ts` — extend: AI Debug button conditional on non-Accepted verdict
- [ ] `tests/solve/RunModal.test.ts` — extend: AI Debug button on failure footer

*Existing infrastructure (vitest 4.1.5, fake-indexeddb, jsdom env, MockObsidianApp) covers all phase requirements; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live MarkdownRenderer.render flicker / scroll-jump under streaming | AIDBG-02 | jsdom does not faithfully model layout/scroll/repaint; this is the **single highest-uncertainty gate** in Phase 08. | 1) Open a `## Code` fence with the `lc-slug` frontmatter set, 2) Click `'AI: Debug'`, 3) Trigger a real Anthropic streamText for ~2000 tokens, 4) Observe: no flicker, no scroll-jump on each chunk, no broken half-fences. Repeat with 100 ms debounce ON vs OFF. Document in PLAN.md verification report. |
| `requestUrl` fallback path (electron.net.fetch unavailable) | AIDBG-02 | Reproducing "no electron.net" requires either mobile-mode runtime or stubbing in dev — easier to dogfood. | 1) In dev vault, force `loadElectronNet()` to throw (e.g. comment out the require), 2) Trigger AI Debug, 3) Confirm: modal shows literal `'Thinking…'` text + `mm:ss` counter, 4) Counter ticks once per second, 5) When response lands, counter freezes, body re-renders once. |
| Cancel during fallback closes modal cleanly even though `requestUrl` cannot be aborted | AIDBG-03 | Validates the swallowed-promise pattern (response arrives after modal closed). | 1) Trigger fallback path, 2) Click Cancel before response arrives, 3) Confirm modal closes immediately, 4) No Notice / no error / no console exception when the eventual response resolves into the void. |
| Disclosure modal flow on first AI Debug invocation | AIDBG-01, AIDBG-02 | Disclosure UX is integration; modal-stack interaction with AIStreamModal needs eyes. | 1) Reset disclosures via `reset-ai-disclosures` palette command, 2) Trigger AI Debug, 3) Confirm: disclosure modal opens FIRST, AIStreamModal is open underneath with empty body, 4) Click Continue → AIStreamModal starts streaming, 5) Repeat from scratch but click Cancel on disclosure → AIStreamModal shows "AI call cancelled" body + Close footer. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (AIDBG-01/02/03 stubs)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
