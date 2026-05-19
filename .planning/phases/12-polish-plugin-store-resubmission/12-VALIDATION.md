---
phase: 12
slug: polish-plugin-store-resubmission
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run && npm run lint && npm run build` |
| **Estimated runtime** | ~15 seconds (vitest) + ~5s (lint) + ~3s (build) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && npm run lint && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | D-01 | — | N/A | unit | `npx vitest run tests/solve/verdictModal` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | D-02 | — | N/A | unit | `npx vitest run tests/solve/verdictModal` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 1 | D-05 | — | N/A | unit | `npx vitest run tests/contest/scratchManager` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | D-06 | — | N/A | unit+manual | `npx vitest run tests/contest/contestSolveView` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 1 | D-07 | — | N/A | unit | `npx vitest run tests/contest/tabReuse` | ❌ W0 | ⬜ pending |
| 12-02-04 | 02 | 1 | D-08 | — | N/A | unit | `npx vitest run tests/contest/contestReview` | ❌ W0 | ⬜ pending |
| 12-02-05 | 02 | 1 | D-09 | — | N/A | unit+manual | `npx vitest run tests/contest/contestFinalizer` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 2 | D-03 | — | N/A | unit | `npx vitest run tests/solve/patternChip` | ❌ W0 | ⬜ pending |
| 12-03-02 | 03 | 2 | D-04 | — | N/A | manual | — | — | ⬜ pending |
| 12-04-01 | 04 | 2 | D-11 | — | N/A | unit | `npx vitest run tests/notes/noteTemplate` | ✅ | ⬜ pending |
| 12-04-02 | 04 | 2 | D-12 | — | N/A | unit+manual | `npx vitest run tests/preview/wikilinkPreview` | ❌ W0 | ⬜ pending |
| 12-05-01 | 05 | 3 | D-10 | — | N/A | manual | — | — | ⬜ pending |
| 12-06-01 | 06 | 4 | D-13 | — | N/A | unit | `npx vitest run tests/release/manifest` | ❌ W0 | ⬜ pending |
| 12-06-02 | 06 | 4 | D-14 | — | N/A | unit | `npx vitest run tests/ai/readme-network-use` | ✅ | ⬜ pending |
| 12-06-03 | 06 | 4 | D-15 | — | N/A | manual | `npm run build && npm run lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/solve/verdictModal.test.ts` — stubs for Close button removal + footer cleanup assertions
- [ ] `tests/contest/scratchManager.test.ts` — verify SCRATCH_FOLDER is dot-prefixed
- [ ] `tests/contest/contestFinalizer.test.ts` — verify finalization completes before returning
- [ ] `tests/solve/patternChip.test.ts` — verify chip renders with lc-pattern data
- [ ] `tests/preview/wikilinkPreview.test.ts` — verify unresolved links open preview

*Existing infrastructure covers: README network-use assertions (tests/ai/readme-network-use.test.ts), note template tests, build/lint CI.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pattern chip clickable navigation | D-04 | Requires live Obsidian workspace for leaf navigation | Open vault → AC a problem → verify chip appears → click chip → verify hub note opens |
| Cold-start < 3s | D-10 | Requires real plugin load timing in Obsidian | Install fresh build → open vault → time from Obsidian launch to plugin ready |
| Contest sidebar real-time AC update | D-06 | Requires active contest session + submit flow | Start contest → submit AC → verify sidebar badge updates without refresh |
| Contest finish lifecycle | D-09 | Requires full contest session + finalization pipeline | Start contest → finish → verify summary note + AI analysis before browser return |
| Wikilink-to-preview navigation | D-12 | Obsidian internal link resolution runs in live vault | Click unresolved wikilink in hub note → verify preview opens (no blank file) |
| GitHub release artifacts | D-15 | External GitHub API | Verify release page has main.js + manifest.json attached |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
