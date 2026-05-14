---
phase: 4
slug: knowledge-graph-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm run lint && npm run build && npm test -- --run` |
| **Estimated runtime** | ~12 seconds (unit); ~40 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm run lint && npm run build && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green (incl. grep gates for vault.modify + innerHTML)
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

*To be filled in by the planner as tasks are defined. The map below shows expected coverage per phase requirement.*

| Requirement | Behavior | Test Type | Expected Test File(s) |
|-------------|----------|-----------|------------------------|
| GRAPH-01 (revised) | Submission-history picker fetches from LC on demand | unit | `tests/graph/submissionHistoryClient.test.ts` |
| GRAPH-01 (revised) | Copy-to-Code overwrites `## Code` fenced block via vault.process | unit | `tests/graph/copyToCode.test.ts` |
| GRAPH-01 (revised) | Copy-to-Code confirm gate fires on non-empty existing block | unit | `tests/graph/copyToCode.confirm.test.ts` |
| GRAPH-02 | On-AC: processFrontMatter writes lc-status / lc-solved-date / lc-runtime-ms / lc-memory-mb / lc-language | unit | `tests/graph/onAccepted.frontmatter.test.ts` |
| GRAPH-02 | ISO-8601 local-tz date format (DST-boundary) | unit | `tests/shared/dates.test.ts` |
| GRAPH-03 | ## Techniques body union-merge preserves user lines | unit | `tests/graph/mergeTechniquesSection.test.ts` |
| GRAPH-03 | Topic-tag frontmatter union-merge writes `lc/{slug}` (Phase 2 D-05 carry) | unit | `tests/graph/onAccepted.tags.test.ts` |
| GRAPH-04 | Stub technique note creates with frontmatter-only body | unit | `tests/graph/stubNoteCreator.test.ts` |
| GRAPH-04 | Stub never-overwritten on subsequent AC | unit | `tests/graph/stubNoteCreator.idempotent.test.ts` |
| GRAPH-04 | Filename special-char normalization | unit | `tests/graph/stubFilename.test.ts` |
| GRAPH-05 | Opt-out skips Techniques + stubs, keeps frontmatter tags | unit | `tests/graph/onAccepted.optOut.test.ts` |
| Phase 3 D-23 invariant | Unknown verdicts do NOT fire onAccepted | unit | `tests/graph/onAccepted.gate.test.ts` |

---

## Wave 0 Requirements

- [ ] `tests/graph/mocks/fakeSubmissionHistoryFetcher.ts` — scripted fake for submission list + detail
- [ ] `tests/fixtures/lc-submissions/list-20.json` — live-captured list response (author's own LC account, ~20 mixed-verdict submissions against a known problem)
- [ ] `tests/fixtures/lc-submissions/detail-ac.html` — live-captured HTML from `/submissions/detail/{id}/` for an Accepted submission
- [ ] `tests/fixtures/lc-submissions/detail-wa.html` — ditto for Wrong Answer
- [ ] `tests/fixtures/lc-submissions/session-expired.html` — live-captured login-redirect response for session-expired path
- [ ] `tests/graph/mocks/fakeKnowledgeGraphDeps.ts` — Vault + FileManager + Settings fakes for on-AC pipeline tests
- [ ] Extend `tests/notes/fakeSettingsStore.ts` with `getAutoBacklinksEnabled` + `setAutoBacklinksEnabled` + `getTechniquesFolder`
- [ ] Extend `tests/solve/mocks/fakeFetcher.ts` scripting to allow `/api/submissions/{slug}` + `/submissions/detail/{id}/` response queuing

*Framework already installed (vitest 4.1.5 from Phase 1). No new test framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live AC flow → on-AC pipeline fires → note gets `## Techniques` + stubs in `LeetCode/Techniques/` + graph view shows edges | GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04 | Requires live LC session cookie + a real AC submission; graph-view visual check is human-eye only | 1. Log into LC via plugin. 2. Open Two Sum. 3. Submit a known-correct solution. 4. Verify: note frontmatter has lc-status: accepted + solve-time fields. 5. Verify: ## Techniques section has bulleted wikilinks. 6. Verify: `LeetCode/Techniques/Two Pointers.md` (or equivalent) exists. 7. Open Graph View → confirm edges from problem → techniques. |
| Submission picker → detail modal → Copy-to-Code flow end-to-end with live LC | GRAPH-01 (revised) | Requires live LC with history; modal render + copy flow is visual | 1. Open a problem with 2+ submissions on LC. 2. Run "LeetCode: View past submissions". 3. Pick a historical Accepted. 4. Click "Copy to Code". 5. Confirm overwrite. 6. Verify: `## Code` fenced block contains the copied code with the correct language tag. |
| Opt-out flag flipped off → subsequent AC writes ONLY frontmatter tags, no `## Techniques`, no stubs | GRAPH-05 | Opt-out toggle wiring is internal; visible verification is the note after AC | 1. Set `autoBacklinksEnabled: false` via a test-only settings tweak (Phase 5 adds UI). 2. Submit AC on a fresh problem. 3. Verify: frontmatter has lc/{topic-slug} tags. 4. Verify: note has NO `## Techniques` heading. 5. Verify: `LeetCode/Techniques/` folder not created (or no new files added). |
| ISO-8601 local-tz formatting survives DST boundary in practice | GRAPH-02 | Travel / system-clock test is cumbersome in unit tests alone | DST-boundary unit test covers the core logic; a dogfooding pass across a real DST boundary (author's local timezone) catches any Electron-host quirks. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (submission-history fixtures, fake Vault/FileManager deps, settings store extensions)
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
