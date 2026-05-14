---
phase: 3
slug: run-submit
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
last_audited: 2026-05-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Full detail (including per-test rationale) lives in `03-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (installed in Phase 2 Wave 0) |
| **Config file** | `vitest.config.ts` (Phase 2 baseline) |
| **Quick run command** | `npx vitest run tests/solve/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (solve/ only); ~25 seconds (full suite with Phase 2) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/solve/` (targeted to solve module)
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke checkpoint complete
- **Max feedback latency:** 10 seconds (targeted); 30 seconds (full)

---

## Per-Task Verification Map

Filled by the planner. Expected test file layout (per RESEARCH.md § Validation Architecture):

| Test File | Covers | Wave |
|-----------|--------|------|
| `tests/solve/codeExtractor.test.ts` | SOLVE-01, SOLVE-08, SOLVE-09 — first-fenced-block extraction, fence-tag language resolution, untagged fallback | 0 |
| `tests/solve/languages.test.ts` | SOLVE-08 — langSlug normalization table (python3/java/cpp/etc. + aliases) | 0 |
| `tests/solve/leetcodeRest.test.ts` | SOLVE-03, SOLVE-04, SOLVE-05 — endpoint URL construction, header shape, body shape (with mocked fetcher) | 0 |
| `tests/solve/pollingOrchestrator.test.ts` | SOLVE-06 — 1/2/4/8s backoff cadence, 60s timeout, abort flag, unknown-verdict handling | 0 |
| `tests/solve/submissionOrchestrator.test.ts` | SOLVE-03..06 — single-flight enforcement (D-24), session-expiry flow (D-27), full run/submit state machines | 0 |
| `tests/solve/verdictModalRenderer.test.ts` | SOLVE-07 — renderer for AC/WA/TLE/MLE/CE/RE/Unknown against captured fixtures | 0 |
| `tests/solve/customTestStore.test.ts` | SOLVE-04 — case persistence round-trip (note → modal → note) under `## Custom Tests` | 0 |
| `tests/solve/CaseRegion.test.ts` | SOLVE-04 — nested `### Case N` region parser (new sibling to HeadingRegion) | 0 |
| `tests/solve/starterCodeInjector.test.ts` | SOLVE-02 — retrofit idempotency, `## Code` heading insertion, langSlug-aware fenced-block detection | 0 |
| `tests/notes/NoteWriter.starter-retrofit.test.ts` | SOLVE-02 — extend Phase 2 NoteWriter test with retrofit hook | 0 |
| `tests/solve/fixtures/` | D-31 — 6 captured verdict JSONs (AC/WA/TLE/MLE/CE/RE) + 1 run-sample + 1 run-custom | 0 |
| `tests/solve/slugGuard.test.ts` | T-03-05-01 — `isValidSlug`/`SLUG_RE` accepts valid LC slugs, rejects path traversal / uppercase / non-string | Post-audit |
| `tests/solve/unknownVerdictGuard.test.ts` | T-03-04-05 — `assertKnownVerdictOrThrow` throws `UnknownVerdictError` on unknown `status_code`, passes known codes | Post-audit |
| `tests/solve/errors.test.ts` | Error hierarchy — NoCodeBlockError, InProgressError, JudgeTimeoutError, AbortError, UnknownVerdictError | 0 |
| `tests/solve/statusMap.test.ts` | SOLVE-07 — `classifyStatus` kind + displayName for known + unknown codes | 0 |
| `tests/solve/solve-types.test.ts` | `isTerminal` discriminated-union narrowing | 0 |
| `tests/solve/internal-question-id.test.ts` | T-03-03-03 — SettingsStore shape-guard for `internalQuestionId` | 0 |
| `tests/solve/throttled-request-url.test.ts` | T-03-03-04 — throttled-wrapper contract over `requestUrl` | 0 |
| `tests/solve/noteTemplate-phase3.test.ts` | Phase 3 heading constants + `codeBlockFor` helper | 0 |

Per-task mapping is finalized in the planner output — every `<task>` must include an `<automated>` block referencing one or more of the above files, OR `<manual>` with justification.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**Wave 0 — test scaffolding and fixture capture** (must complete before Wave 1):

- [x] `tests/solve/` directory created with vitest files stubbed (one failing test per file listed above)
- [x] `tests/solve/fixtures/` directory with six verdict JSONs captured from live LC (D-31)
  - [x] `accepted.json` — AC against a known-passing solution
  - [x] `wrong-answer.json` — WA against a deliberately-wrong solution
  - [x] `tle.json` — TLE against a brute-force O(n²) on a large-input problem
  - [x] `mle.json` — MLE against a large-allocation solution
  - [x] `compile-error.json` — CE from a syntax error
  - [x] `runtime-error.json` — RE from a NullPointerException / IndexError
  - [x] `run-sample.json` — `/interpret_solution/` response with sample input
  - [x] `run-custom.json` — `/interpret_solution/` response with custom input
- [x] `tests/solve/mocks/fakeFetcher.ts` — injectable fake for `requestUrlFetcher` returning scripted responses per endpoint URL
- [x] `tests/solve/mocks/fakeSettingsStore.ts` — in-memory `SettingsStore` stub with configurable cookies + detail cache
- [x] 15-minute `requestUrl` redirect spike (per RESEARCH.md § Risk Assessment) — document whether 302 to /accounts/login is followed silently or surfaces as 302 response; result informs D-27 session-expiry detection

*Existing infrastructure:* Phase 2 Wave 0 installed vitest + `tests/notes/mocks/*` patterns; Phase 3 follows the same layout.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live submission against LC judge | SOLVE-05 | Requires live LC session + real problem | 1. Log in via Phase 1 auth. 2. Open a known-passing problem note. 3. Write solution. 4. `LeetCode: Submit` → verify modal transitions pending → AC within 60s. 5. Re-run with deliberately wrong code → verify WA modal shows failing testcase + diff. |
| Custom input round-trip | SOLVE-04 | Note I/O requires Obsidian runtime | 1. Open problem note. 2. `LeetCode: Run code (custom input)` → add 2 cases via `+` tab. 3. Close modal. 4. Inspect note — verify `## Custom Tests` with `### Case 1`/`### Case 2` fenced blocks. 5. Re-open modal — verify tabs pre-populated. |
| Starter-code retrofit on existing note | SOLVE-02 | Requires pre-Phase-3 note | 1. Check out main branch pre-Phase-3, open a problem, close. 2. Switch to Phase 3 branch. 3. Re-open the same problem. 4. Verify `## Code` heading inserted with starter code, `## Notes` content preserved. |
| Polling cancel behavior | SOLVE-06 | Requires live LC judge + timing | 1. Submit a known-slow problem. 2. Click Cancel in pending modal before 60s. 3. Verify modal closes, no verdict fires, can submit again immediately. |
| Session expiry during submit | AUTH-04 (carried) | Requires live session expiry | 1. Log in, then manually revoke session via LC settings. 2. Submit from plugin. 3. Verify re-auth Notice fires (not timeout / not unknown verdict). |
| 60s timeout behavior | SOLVE-06 | Requires live LC stall | 1. (Synthetic) Inject a fake that holds `/check/{id}` forever. 2. Verify modal shows timeout error at 60s, abort flag stops further polling. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (6 fixture JSONs + 2 mock modules + redirect spike)
- [x] No watch-mode flags in test commands (use `vitest run`, not `vitest`)
- [x] Feedback latency < 30s (full suite) / < 10s (solve/ only)
- [x] `nyquist_compliant: true` set in frontmatter after planner finalizes per-task map

**Approval:** verified 2026-05-08

---

## Validation Audit 2026-05-08

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

### Resolved gaps

- **T-03-05-01 (slug guard regression):** Extracted `SLUG_RE` + `isValidSlug` from `src/main.ts` into `src/solve/slugGuard.ts` for independent testability. Added `tests/solve/slugGuard.test.ts` (36 cases: valid LC slugs, path-traversal rejection, uppercase/underscore/space rejection, non-string rejection, type-narrowing contract).
- **T-03-04-05 (UnknownVerdictError throw path):** Extracted the classify-and-throw seam from `submitFromActive` into `src/solve/verdictGuard.ts` as `assertKnownVerdictOrThrow`. Added `tests/solve/unknownVerdictGuard.test.ts` (18 cases: throws on unknown codes 99/999/0/17/22, no-op on known codes 10–21, `error.payload` reference preservation, `error.name` cross-bundle discriminator).

Final suite: 381/381 tests pass (327 baseline + 54 new). Typecheck clean. No regressions.
