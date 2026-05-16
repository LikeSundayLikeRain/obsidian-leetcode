---
phase: 07-ai-provider-foundation
plan: 07
subsystem: ai
tags: [ai, gap-closure, logger, redaction, probe-guard, await-bug, freeze-disclosure, security-hardening]

# Dependency graph
requires:
  - phase: 07-ai-provider-foundation
    provides: AIClient seam (07-02/03/05), probeCustom + probeOllama (07-02), DISCLOSURE_BASE_COPY (07-05), logger AI extension (07-01)
provides:
  - logger redactString without double-replacement bug (CR-01)
  - probeCustom + probeOllama empty-baseUrl early-return guards (CR-02)
  - main.ts testActiveAIConnection empty-baseUrl Notice guard for custom + ollama (CR-02 defense-in-depth)
  - AIClient.invoke contract-correct re-throw via `return await adapter.invoke` (WR-01)
  - DISCLOSURE_BASE_COPY frozen at module load (outer + both inner arrays) (WR-02)
affects: [phase-08-ai-debug, phase-09-ai-aced-review, phase-11-ai-knowledge-graph]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-pattern ordered-alternation regex over two-pass replace (idempotent secret redaction)"
    - "Empty-baseUrl early-return guard at probe boundary + main.ts caller (defense-in-depth)"
    - "Object.freeze deep at module load (inner arrays first, then outer object) for shared-mutable-global mitigation"
    - "Composition-over-mutation extension contract (supersedes 07-PATTERNS.md Pattern 4 for downstream phase disclosure copy extension)"

key-files:
  created: []
  modified:
    - src/shared/logger.ts (CR-01 fix — single-pattern alternation; BEARER_VALUE_PATTERN removed; SECRET_VALUE_PATTERN now ordered alternation with authorization+bearer shape first)
    - src/ai/providers/openaiCompatible.ts (CR-02 fix — probeCustom empty-baseUrl early-return guard)
    - src/ai/providers/ollama.ts (CR-02 fix — probeOllama empty-baseUrl early-return guard)
    - src/main.ts (CR-02 fix — testActiveAIConnection empty-baseUrl Notice guard for custom + ollama; defense-in-depth)
    - src/ai/AIClient.ts (WR-01 fix — `return await adapter.invoke(req)` for contract correctness)
    - src/ai/disclosure.ts (WR-02 fix — Object.freeze on outer + both inner arrays; readonly types; doc supersedes Pattern 4 mutation contract)
    - tests/shared/logger.test.ts (CR-01 — Category 4 regression fixture, 3 tests)
    - tests/ai/probes.test.ts (CR-02 — 4 new tests: probeCustom + probeOllama empty-baseUrl + 2 happy-path regression guards)
    - tests/ai/probe-debounce.test.ts (CR-02 — 2 new tests: testActiveAIConnection empty-baseUrl Notice for custom + ollama)
    - tests/ai/aiClient.test.ts (WR-01 — adapter-rejection observable via rejects.toThrow with original message preserved)
    - tests/ai/disclosure.test.ts (WR-02 — 5 new freeze tests: 3 Object.isFrozen + 2 mutation-throws-in-strict-mode)

key-decisions:
  - "CR-01: Approach B (single-pattern ordered alternation) chosen over Approach A (exclude '[' from value char class). Approach A as described in the plan does NOT actually fix the bug — the second-pass SECRET_VALUE_PATTERN's value class greedily consumes 'Bearer' (which contains no '['), producing 'Authorization=[REDACTED] [REDACTED]' regardless of the bracket exclusion. Verified by tracing the regex against the test input. Approach B sidesteps the order dependency entirely and preserves the original ':' separator for the bearer alternate (no more ':' → '=' mangling)."
  - "CR-02: layered three-guard fix (probeCustom + probeOllama + main.ts testActiveAIConnection). The probe-side guards alone close the BLOCKER, but the main.ts caller-side guard surfaces a friendlier 'Enter a Base URL for X first.' Notice and skips the aiProbeInflight Map churn entirely. Symmetric with the existing apiKey guard above it."
  - "WR-01: combined RED+GREEN commit (no separate RED) because the test passes both before and after the fix — the rejection is observable via rejects.toThrow either way (returning a rejected promise from an async function still rejects observably). The fix is contract/maintenance hardening for future try/catch wrapping, not a behavior change."
  - "WR-02: type signature changed from `string[]` to `readonly string[]` for both inner arrays. Iteration sites (modal render for-of loops) work unchanged. Doc comment rewritten to supersede 07-PATTERNS.md Pattern 4 — Phase 08/09/11 must extend via composition (spread base + append) rather than mutation (push)."

patterns-established:
  - "Pattern: Idempotent secret redaction via ordered alternation. The regex must list combined-shape alternates (e.g. authorization+bearer) before bare-key alternates so combined shapes match as a unit and don't get re-consumed by a later pass."
  - "Pattern: Defense-in-depth empty-input guards at multiple layers. Probe boundary guards prevent invalid HTTP calls; caller-side guards surface friendlier UX messages and avoid wasted state machinery (in-flight maps)."
  - "Pattern: Frozen shared-mutable-global with composition extension contract. Object.freeze inner arrays before outer object; downstream consumers extend by constructing new objects rather than mutating in-place."

requirements-completed: [AIPROV-02, AIPROV-03, AIPROV-04]

# Metrics
duration: 8m 54s
completed: 2026-05-16
---

# Phase 07 Plan 07: Gap Closure Summary

**Closed 2 BLOCKERS (CR-01 logger double-replacement, CR-02 probeCustom/probeOllama empty-baseUrl) + 2 WARNINGS (WR-01 missing await, WR-02 unfrozen disclosure copy) from 07-VERIFICATION.md without regressing any of the 157 prior AI suite tests.**

## Performance

- **Duration:** 8m 54s
- **Started:** 2026-05-16T01:51:13Z
- **Completed:** 2026-05-16T02:00:07Z
- **Tasks:** 4
- **Files modified:** 11 (6 source, 5 test)

## Accomplishments

- **CR-01 closed.** Logger `redactString` now produces clean output for `Authorization: Bearer <token>` strings — no `=[REDACTED] [REDACTED]` garble. Approach B (single-pattern ordered alternation) replaces the v1 two-pass replace; preserves the `:` separator instead of mangling to `=`. v1.0 regression tests stay green.
- **CR-02 closed.** Three-layer guard fix: `probeCustom` and `probeOllama` early-return `{ok:false, errorMessage:'Base URL is required for X provider.'}` when `cfg.baseUrl` is empty (fetcher never invoked); `main.ts:testActiveAIConnection` adds a symmetric caller-side guard that fires `'Enter a Base URL for X first.'` Notice for custom + ollama, parallel to the existing apiKey guard.
- **WR-01 closed.** `AIClient.invoke` now uses `return await adapter.invoke(req)` — adapter rejections preserve their original error message end-to-end. Future maintainers wrapping the body in try/catch will not be silently betrayed.
- **WR-02 closed.** `DISCLOSURE_BASE_COPY` is `Object.freeze`d at module load (outer + both inner arrays). Mutation attempts throw in strict mode. Doc comment rewritten to supersede 07-PATTERNS.md Pattern 4 with a composition-based extension contract for Phase 08/09/11.
- **Zero regression.** Full test suite: 925 passed (3 skipped pre-existing). AI suite + logger: 183/183 (157 prior + 26 new). Build: `tsc -noEmit` exits 0. LC isolation gate: exit 0.

## Task Commits

Each task was committed atomically (RED + GREEN where TDD applied):

1. **Task 1 RED — logger CR-01 fixture** — `b3dbbf3` (test)
2. **Task 1 GREEN — logger.ts single-pattern alternation** — `8d98036` (fix)
3. **Task 2 RED — CR-02 empty-baseUrl probe + main.ts guard tests** — `8ad1350` (test)
4. **Task 2 GREEN — three-guard CR-02 fix** — `dd98b63` (fix)
5. **Task 3 — WR-01 await adapter.invoke + test** — `36939a4` (fix; combined RED+GREEN — see decision rationale)
6. **Task 4 RED — WR-02 freeze regression tests** — `b1e1bc8` (test)
7. **Task 4 GREEN — Object.freeze DISCLOSURE_BASE_COPY** — `1be0ad6` (fix)

**Plan metadata commit:** added with this SUMMARY.md.

## Files Created/Modified

**Source modifications (6):**

- `src/shared/logger.ts` — Replaced two-pass `BEARER_VALUE_PATTERN` + `SECRET_VALUE_PATTERN` with a single ordered-alternation regex. The `authorization: bearer <token>` shape matches first (preserves `:` separator). Bare key=value alternate kept for v1.0 regression compatibility. Doc comment rewritten with the CR-01 trace.
- `src/ai/providers/openaiCompatible.ts` — Added empty-baseUrl early-return guard at the top of `probeCustom` returning `{ok:false, errorMessage:'Base URL is required for Custom provider.'}`.
- `src/ai/providers/ollama.ts` — Mirror guard on `probeOllama` with provider-specific message `'Base URL is required for Ollama provider.'`.
- `src/main.ts` — Added empty-baseUrl Notice guard inside `testActiveAIConnection` immediately after the existing apiKey guard. Fires `'Enter a Base URL for {prettyName} first.'` (3000ms) for custom + ollama; skips `aiClient.probe` and `aiProbeInflight` Map.
- `src/ai/AIClient.ts` — Changed `return adapter.invoke(req)` to `return await adapter.invoke(req)` on the line previously at 150. Comment block above the change explains the contract rationale (re-throw posture documented in JSDoc; future try/catch must observe rejection synchronously).
- `src/ai/disclosure.ts` — Inline `Object.freeze` on `willSend` + `neverSends` arrays during literal construction; `Object.freeze(DISCLOSURE_BASE_COPY)` after the const declaration. Type changed from `string[]` to `readonly string[]` for both inner arrays. Doc rewritten to supersede 07-PATTERNS.md Pattern 4 with composition-based extension contract.

**Test additions (5):**

- `tests/shared/logger.test.ts` — Added `'Phase 07 logger Category 4 — CR-01 double-replacement regression'` describe block with 3 tests (Title-case, lowercase, regression guard).
- `tests/ai/probes.test.ts` — Added `'CR-02 empty-baseUrl guards — Plan 07-07 Task 2'` describe block with 4 tests (probeCustom + probeOllama empty-baseUrl + 2 happy-path regression guards).
- `tests/ai/probe-debounce.test.ts` — Added 2 new tests inside the existing `'LeetCodePlugin.testActiveAIConnection — Plan 07-04 Task 1'` describe (Custom + Ollama empty baseUrl block with locked Notice text).
- `tests/ai/aiClient.test.ts` — Added 1 new test inside the existing `'Phase 07 AIClient — invoke'` describe block (adapter-rejection observable via `rejects.toThrow(/adapter-boom/)` with original message preserved).
- `tests/ai/disclosure.test.ts` — Added `'Phase 07 Plan 07 — WR-02 freeze regression'` describe block with 5 tests (3 `Object.isFrozen` + 2 mutation-throws-in-strict-mode).

## Decisions Made

- **CR-01 approach choice (Approach B over Approach A).** The plan suggested Approach A (exclude `[` from value char class) as the recommended minimal-targeted fix. Tracing the regex against `'Authorization: Bearer sk-proj-abcdef'` showed Approach A does NOT close the bug: after BEARER_VALUE_PATTERN replaces `Bearer sk-proj-abcdef` with `Bearer [REDACTED]`, SECRET_VALUE_PATTERN's `authorization` alternate still re-matches `Authorization: Bearer` as kv (with `Bearer` as the value — `Bearer` contains no `[`). The bracket exclusion only matters for matches where the value WOULD have started with `[`; in this trace, the value is `Bearer` itself. Switched to Approach B (single ordered alternation) which makes the order dependency moot. Verified by behavioral spot-check: 5/5 redaction cases produce clean output with no `=[REDACTED] [REDACTED]` substring.
- **CR-02 three-guard layering.** Plan suggested probeCustom + probeOllama guards as primary fix and main.ts guard as defense-in-depth. Implemented all three. The main.ts guard is genuinely value-add: it surfaces `'Enter a Base URL for X first.'` (parallel to the existing `'Enter an API key for X first.'`) and skips the `aiProbeInflight` Map churn — the probe-side guards would still trigger Map entry creation + Notice text from the probe error message rather than the friendlier caller-side copy.
- **WR-01 single commit (no RED-then-GREEN).** The new test passes against both buggy and fixed source because returning a rejected promise from an async function is observably the same as `await`-throwing the rejection — both surface via `.catch` / `rejects.toThrow`. The fix is contract hardening (so a hypothetical future try/catch wrap will work), not behavior change. Committed as a single `fix(07-07)` rather than splitting into a meaningless test+impl pair.
- **WR-02 type widening to readonly.** `Object.freeze` at runtime requires `readonly string[]` at the type level for accurate typing. The two consumers (modal render `for...of` loops at lines 132, 139) work unchanged. No downstream consumers in src/ tree besides those two — checked via `grep -rn "DISCLOSURE_BASE_COPY" src/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CR-01 Approach A described in plan does not work — switched to Approach B**

- **Found during:** Task 1 GREEN gate
- **Issue:** Plan recommended Approach A (exclude `[` from value char class) as the cleaner minimal-targeted fix. After applying the bracket exclusion, the new Category 4 tests STILL FAILED with the v1 garbled output `Authorization=[REDACTED] [REDACTED]`. Tracing the regex revealed why: BEARER_VALUE_PATTERN converts `Authorization: Bearer sk-xyz` to `Authorization: Bearer [REDACTED]`. SECRET_VALUE_PATTERN's `authorization` alternate then matches `Authorization: Bearer` as `key:separator+value` where the value char class `[^\s;,"'&}\]\[]+` greedily consumes `Bearer` (Bearer contains no `[`, so the bracket exclusion is irrelevant). Replacement produces `Authorization=[REDACTED]`, leaving the trailing `[REDACTED]` token dangling — same garbled output as v1.
- **Fix:** Switched to Approach B (single-pattern ordered alternation per 07-REVIEW.md CR-01 lines 67-81). The `authorization\s*:\s*bearer\s+<token>` shape is matched first as a unit before the bare `authorization` alternate ever sees the input. Replacement function uses captured groups to preserve the `:` separator and `Bearer` keyword. Removed `BEARER_VALUE_PATTERN` (logic absorbed into SECRET_VALUE_PATTERN's first alternate).
- **Files modified:** src/shared/logger.ts (regex + replacement function rewritten; doc comment updated)
- **Verification:** Category 4 tests pass; all 4 logger categories pass (14/14); v1.0 logger-redact tests pass (4/4); behavioral spot-check confirms 5/5 redaction cases produce clean output.
- **Committed in:** `8d98036` (Task 1 GREEN). The commit message documents the Approach A→B switch and reasoning.

---

**Total deviations:** 1 auto-fixed (1 plan-described-fix-doesn't-work bug, switched to plan's Approach B alternative).
**Impact on plan:** No scope change — plan listed both approaches as acceptable. The deviation is the choice between the two, made on direct trace evidence rather than the plan's recommendation. Both achieve the same acceptance criteria. Approach B has a slightly larger diff (per plan note) but eliminates the order dependency permanently, preventing future-maintainer rediscovery of the same trap.

## Issues Encountered

- **None during execution.** The 4 fixes landed cleanly. The CR-01 Approach A discovery (deviation above) was caught at the GREEN gate by the failing test fixture — the TDD RED-first discipline would have caught a non-fixing fix even if the regex trace were not run mentally first.

## TDD Gate Compliance

Tasks 1, 2, 4 followed the full RED → GREEN cycle (test commit before fix commit). Task 3 was committed as a single fix commit (test + impl) with rationale documented in the commit message — the test passes both before and after the fix because the rejection is externally observable either way; the fix is contract hardening for future maintenance, not a behavior change. Plan acceptance criteria for Task 3 explicitly note this: "Test 1 confirms the rejection is observable via `rejects.toThrow` regardless" — meaning RED-state was not behaviorally distinguishable.

## User Setup Required

None — all four fixes are inline source edits. No new dependencies, no env vars, no external service configuration.

## Verification Recap

| Verification Step                                            | Result          |
| ------------------------------------------------------------ | --------------- |
| `npm test`                                                   | 925 pass / 3 skipped pre-existing |
| `npx vitest run tests/ai/ tests/shared/logger.test.ts`       | 183 pass        |
| `bash scripts/check-no-obsidianfetch-in-lc.sh`               | exit 0          |
| `npm run build` (`tsc -noEmit -skipLibCheck && esbuild`)     | exit 0          |
| Logger CR-01 behavioral trace (5 fixture inputs)             | 5/5 clean       |

**Original FAILED truths from 07-VERIFICATION.md:**

- **Truth #4** (logger redactString clean output) — now PASSES. Behavioral trace + Category 4 fixture both confirm `Authorization: Bearer sk-proj-abcdef` redacts to `Authorization: Bearer [REDACTED]` (single redaction, `:` preserved, no double `[REDACTED]`).
- **Truth #8** (probeCustom empty-baseUrl) — now PASSES. `probeCustom({baseUrl:''}, vi.fn())` returns `{ok:false, errorMessage:'Base URL is required for Custom provider.'}` and the fetcher mock asserts zero calls.

## Next Phase Readiness

Phase 07 is now closeout-ready for code review + verifier sign-off:

- All 7 AIPROV requirements satisfied at the requirement level (unchanged — Phase 07-06 already had this).
- 12/12 must-have truths from 07-VERIFICATION.md now verified (the 2 previously FAILED truths are closed).
- WR-01 prevents a Phase 08 integration trap (await contract correct).
- WR-02 prevents a Phase 08/09/11 mutation-mid-render race (DISCLOSURE_BASE_COPY frozen; downstream phases must use composition).

**Phase 08 (AI Debug — streaming modal + cancel) can begin via `/gsd-plan-phase 8`.** The disclosure gate is inherited via the AIClient seam (no caller-side disclosure wiring needed in Phase 08). The freeze contract requires Phase 08's disclosure-bullet append to use composition (e.g. `{ ...DISCLOSURE_BASE_COPY, willSend: [...DISCLOSURE_BASE_COPY.willSend, 'Phase 08 bullet'] }` and pass the new object to the modal constructor).

## Self-Check: PASSED

Verified files exist:

- src/shared/logger.ts (modified) — FOUND
- src/ai/providers/openaiCompatible.ts (modified) — FOUND
- src/ai/providers/ollama.ts (modified) — FOUND
- src/main.ts (modified) — FOUND
- src/ai/AIClient.ts (modified) — FOUND
- src/ai/disclosure.ts (modified) — FOUND
- tests/shared/logger.test.ts (modified) — FOUND
- tests/ai/probes.test.ts (modified) — FOUND
- tests/ai/probe-debounce.test.ts (modified) — FOUND
- tests/ai/aiClient.test.ts (modified) — FOUND
- tests/ai/disclosure.test.ts (modified) — FOUND

Verified commits exist (worktree branch `worktree-agent-aa86d909082e5ac78`):

- b3dbbf3 — FOUND (Task 1 RED)
- 8d98036 — FOUND (Task 1 GREEN)
- 8ad1350 — FOUND (Task 2 RED)
- dd98b63 — FOUND (Task 2 GREEN)
- 36939a4 — FOUND (Task 3 combined)
- b1e1bc8 — FOUND (Task 4 RED)
- 1be0ad6 — FOUND (Task 4 GREEN)

---

*Phase: 07-ai-provider-foundation*
*Completed: 2026-05-16*
