---
phase: 09
slug: ai-aced-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai/buildReviewPrompt.test.ts tests/ai/mergeAIReviewSection.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ai/buildReviewPrompt.test.ts tests/ai/mergeAIReviewSection.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | AIREV-02, AIREV-04 | T-09-XSS | AI response rendered via MarkdownRenderer.render, never innerHTML | unit | `npx vitest run tests/ai/buildReviewPrompt.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | AIREV-02, AIREV-03 | — | N/A | unit | `npx vitest run tests/ai/mergeAIReviewSection.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | — | T-09-disclosure | Disclosure copy composition via spread, never mutate | unit | `npx vitest run tests/ai/disclosure.withReviewBullet.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | AIREV-01, AIREV-02 | — | N/A | unit | `npx vitest run tests/ai/aiReview.settings.test.ts` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 3 | AIREV-01 | T-09-race | KG write completes before review stream starts | integration | manual | — | ⬜ pending |
| 09-04-01 | 04 | 4 | AIREV-05 | — | N/A | unit | `npx vitest run tests/ai/rerunAIReview.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/buildReviewPrompt.test.ts` — prompt structure, dimension headings, code-fence-only-when-different instruction
- [ ] `tests/ai/mergeAIReviewSection.test.ts` — idempotent replacement, first-write insertion after ## Notes, EOF handling
- [ ] `tests/ai/disclosure.withReviewBullet.test.ts` — composition factory returns new object, base unchanged
- [ ] `tests/ai/aiReview.settings.test.ts` — shape-guard defaults `autoAIReviewOnAC: false`
- [ ] `tests/ai/rerunAIReview.test.ts` — palette command guard on lc-slug frontmatter

*Existing infrastructure covers framework install — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VerdictModal streams review after AC | AIREV-01 | Requires live Obsidian + AI provider | AC a problem with auto-review ON; verify review streams below "Accepted!" |
| Close during stream cancels cleanly | AIREV-01 | Requires live modal interaction | Click Close during review stream; verify no partial write |
| Manual re-run opens AIStreamModal | AIREV-05 | Requires live Obsidian | Open lc-slug note; run palette command; verify modal opens and streams |
| Section lock prevents heading deletion | AIREV-02 | Requires live CM6 editor | Try to delete `## AI Review` heading in edit mode; verify it's locked |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
