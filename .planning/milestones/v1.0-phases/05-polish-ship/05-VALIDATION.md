---
phase: 5
slug: polish-ship
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run --reporter=dot` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~20 seconds |

Prerelease gate (D-27) runs `scripts/prerelease-check.sh` which invokes:
- `npm run lint`
- `npm test -- --run`
- grep-gates (innerHTML, fetch, eval, telemetry strings, vault.modify)
- manifest + license + README checks

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run --reporter=dot`
- **After every plan wave:** Run `npm test -- --run` + `npm run lint`
- **Before `/gsd-verify-work`:** Full suite + `scripts/prerelease-check.sh` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Populated by planner during PLAN.md generation. Every task in `type: execute` plans must either (a) map to a vitest file or (b) declare `manual: true` with Test Instructions. Manual-only items map to `05-UAT.md` test IDs.

| Task Area | Wave | Requirement | Test Type | Automated Command |
|-----------|------|-------------|-----------|-------------------|
| Settings store techniquesFolderOverride field | 1 | POLISH-01 | unit | `npm test -- --run tests/settings/SettingsStore.techniques-override.test.ts` |
| Settings tab Knowledge Graph section renders | 1 | POLISH-01 | interaction | `npm test -- --run tests/settings/SettingsTab.knowledge-graph.test.ts` |
| Throttle 429 auto-retry (once after 5s) | 2 | POLISH-02 | unit | `npm test -- --run tests/api/throttle.rate-limit-retry.test.ts` |
| Throttle 10s timeout wrapping | 2 | POLISH-02 | unit | `npm test -- --run tests/api/throttle.timeout.test.ts` |
| isNetworkError helper classification | 2 | POLISH-02 | unit | `npm test -- --run tests/shared/errors.isNetworkError.test.ts` |
| Notice re-login action (DocumentFragment fallback since Notice.addAction absent) | 2 | POLISH-02 | unit (Notice spy) | `npm test -- --run tests/solve/SessionExpiredNotice.test.ts` |
| ephemeralTabStore lifecycle (layout-change + leaf reference counting) | 3 | POLISH-07 | unit | `npm test -- --run tests/solve/ephemeralTabStore.test.ts` |
| RunModal seed + reset + single-active-tab run | 3 | POLISH-07 | interaction | `npm test -- --run tests/solve/RunModal.test.ts` |
| MarkdownPostProcessor gates on lc-slug frontmatter | 4 | POLISH-01 / FND-01 | interaction | `npm test -- --run tests/main/codeActionsPostProcessor.test.ts` |
| SubmissionDetailModal MarkdownRenderer.render + Component | 4 | GRAPH-phase-4-carryover | unit | `npm test -- --run tests/graph/SubmissionDetailModal.test.ts` |
| Prerelease script grep-gates | 5 | POLISH-03 / POLISH-04 / POLISH-05 / POLISH-06 | shell | `bash scripts/prerelease-check.sh` |
| manifest + versions + package consistency | 5 | POLISH-06 | shell | `node scripts/check-version-consistency.mjs` (or equivalent) |

*Status tracked in `05-EXECUTION.md` after execute-phase populates test runs.*

---

## Wave 0 Requirements

Wave 0 = foundation tests before Waves 1–5 execute. Per research §Test Architecture, 12 new test files identified.

- [ ] `tests/settings/SettingsStore.techniques-override.test.ts` — tests for techniquesFolderOverride shape-guard + getTechniquesFolder precedence
- [ ] `tests/settings/SettingsTab.knowledge-graph.test.ts` — tests for new section heading + toggle + override field rendering
- [ ] `tests/api/throttle.rate-limit-retry.test.ts` — tests for 429 auto-retry once (not twice), 5s backoff respected
- [ ] `tests/api/throttle.timeout.test.ts` — tests for 10s Promise.race timeout, polling path unaffected
- [ ] `tests/shared/errors.isNetworkError.test.ts` — tests classifying ERR_NAME_NOT_RESOLVED / ERR_CONNECTION_REFUSED / ERR_INTERNET_DISCONNECTED / ERR_NETWORK_CHANGED
- [ ] `tests/solve/SessionExpiredNotice.test.ts` — tests for DocumentFragment notice with clickable Log in link (fallback since Notice.addAction unavailable)
- [ ] `tests/solve/ephemeralTabStore.test.ts` — tests for getOrSeed, mutate, reset, layout-change cleanup
- [ ] `tests/solve/RunModal.test.ts` — tests for seed from exampleTestcases, reset, single-active-tab Run, delete-guard
- [ ] `tests/main/codeActionsPostProcessor.test.ts` — tests for lc-slug gate, button click dispatching `run` / `submit` command
- [ ] `tests/graph/SubmissionDetailModal.test.ts` — **REWRITE** to assert MarkdownRenderer.render mock + Component lifecycle
- [ ] `tests/solve/mocks/fakeSettingsStore.ts` — extend with techniquesFolderOverride field
- [ ] `tests/solve/mocks/fakeWorkspace.ts` — new mock helper for getLeavesOfType / layout-change / active-leaf-change events

Wave 0 is a precondition for Waves 1-5 execution. Planner marks the first test-stub plan in each wave as type: tdd (if TDD_MODE) or type: execute with read_first + acceptance_criteria on the test file.

---

## Manual-Only Verifications

These items ship under `05-UAT.md`. They are subjective/visual and cannot be asserted with grep or vitest.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CE verdict chip reads orange (not red) | D-29 | Visual color check | Trigger CE verdict (syntactically-broken code submit); confirm chip is orange in both light + dark themes |
| Light-mode focus ring on submission picker rows is clearly visible | D-30 | Visual/accessibility check | Open picker in light theme; Tab through rows; confirm 2px accent outline visible |
| Settings UI renders cleanly in light + dark modes | POLISH-01 | Visual spot-check | Open settings tab in each theme; confirm no clipped text, alignment, spacing issues |
| Screenshots in README match current UI | POLISH-04, D-24 | Visual spot-check | Capture each of 4 screenshots; visually compare to README references; update if stale |
| Run UX — first Run seeds tabs, later Runs restore in-memory state, file-close wipes | POLISH-07, D-02, D-03 | Multi-leaf + multi-window interaction | See 05-UAT.md §Run UX Lifecycle |
| Reading-mode code-block buttons click dispatches correct command | D-11, D-12 | Visual + integration | Open problem note in reading mode; click Run below `python3` block; confirm Run modal opens |
| Notice session-expired `Log in` action opens BrowserWindow login | D-21 | Integration | Trigger expired-session Notice; click Log in link; confirm BrowserWindow opens |
| Community plugin PR to obsidianmd/obsidian-releases submitted | POLISH-06, D-28 | External (GitHub) | Manual PR submission; link in 05-UAT.md upon completion |
| No default hotkeys present | CF-05 | Grep verified but store reviews manually | `grep -r "defaultHotkeys" src/` → 0 matches |
| main.js readability (no obfuscation) | POLISH-03 | Manual read | Visual check of first/last 50 lines of built main.js |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (vitest `--run` enforced)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 file list is locked in plans

**Approval:** pending
