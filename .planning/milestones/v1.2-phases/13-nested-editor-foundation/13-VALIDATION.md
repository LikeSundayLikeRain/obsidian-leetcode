---
phase: 13
slug: nested-editor-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/main/nestedEditorExtension.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/main/nestedEditorExtension.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | SC-2 | — | N/A | unit | `npx vitest run tests/main/nestedEditorExtension.test.ts -t "decoration"` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 1 | SC-3 | — | N/A | unit | `npx vitest run tests/main/childEditorRegistry.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 1 | SC-4 | — | N/A | unit | `npx vitest run tests/main/childEditorRegistry.test.ts -t "destroy"` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 1 | SC-1 | — | N/A | unit | `npx vitest run tests/main/childEditorFactory.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/main/nestedEditorExtension.test.ts` — covers decoration building, fence-hide logic, widget eq() stability
- [ ] `tests/main/childEditorRegistry.test.ts` — covers LRU eviction, get/set/delete, destroyAll
- [ ] `tests/main/childEditorFactory.test.ts` — covers EditorView creation with correct extensions

*Existing test infrastructure (vitest) is already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Python fence renders child EditorView with Lezer-based syntax highlighting | SC-1 | Requires live Obsidian runtime with CM6 rendering | Open lc-slug note with Python fence; verify syntax colors differ from markdown default |
| Section lock + code-actions + nested editor coexist without regression | SC-5 | Requires live Obsidian UI interaction | Open lc-slug note; verify Run/Submit buttons, language chevron, section lock all function |
| Child editor renders in Live Preview mode | D-07 | Requires Obsidian rendering mode toggle | Toggle Cmd-E between Source and Live Preview; verify child editor visible in both |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
