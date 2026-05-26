---
phase: 14
slug: bidirectional-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm test -- --grep "childEditorSync"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --grep "childEditorSync"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | INDENT-01 | — | N/A | unit | `npm test -- --grep "child-to-parent sync"` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | INDENT-02 | — | N/A | unit | `npm test -- --grep "offset derivation"` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | ENTER-01 | — | N/A | unit | `npm test -- --grep "parent-to-child"` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | — | — | No echo loop | unit | `npm test -- --grep "echo loop"` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | — | — | N/A | unit | `npm test -- --grep "fence repair"` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 2 | — | — | N/A | manual | See manual verification below | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/childEditorSync.test.ts` — stubs for sync unit tests (offset derivation, change remapping, echo prevention)
- [ ] Test fixtures for parent EditorState with fence structure

*Existing vitest infrastructure covers framework needs — no new install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Type in child editor, Ctrl-S persists | INDENT-01 | Requires live Obsidian + vault I/O | Open lc-slug note, type in child, save, reopen to confirm |
| Copy to Code updates child | — | Requires SubmissionDetailModal flow | Open past submission, click Copy to Code, verify child shows new code |
| Ctrl-Z after Copy to Code restores | — | Requires undo history in live editor | After Copy to Code, press Ctrl-Z in child, verify old code returns |
| No visual glitch on rapid typing | — | Requires human perception check | Type rapidly in child for 10s, verify no flicker/corruption |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
