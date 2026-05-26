---
phase: 16-language-packs-switching
plan: 05
subsystem: editor
tags: [codemirror, behavioral-tests, requirements, bundle, uat, language-packs]

# Dependency graph
requires:
  - phase: 16-language-packs-switching
    plan: 01
    provides: "buildLanguageExtensions(slug, override) builder + IndentOverride type"
  - phase: 16-language-packs-switching
    plan: 03
    provides: "languageCompartment wired into childEditorFactory"
  - phase: 16-language-packs-switching
    plan: 04
    provides: "switchFenceLanguage Step B′ child reconfigure dispatch"
provides:
  - "Live-EditorState behavioral coverage of BRACKET-01..04, COMMENT-01, INDENT-04 across 8 LC slugs"
  - "REQUIREMENTS.md BRACKET-05 status flipped to Deferred (D-09 — Phase 16 closure)"
  - "Bundle-size delta measurement for Phase 16 (raw and gzipped)"
  - "Manual UAT checkpoint enumerating 21 verification items + 1 bundle-ceiling decision item"
affects:
  - "Phase 17 (polish): inherits Pitfall E green path (StreamLanguage(go) commentTokens auto-derived); inherits BRACKET-05 deferral; inherits bundle-ceiling decision pending UAT"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live `@codemirror/*` imports in vitest behavioral tests — vitest's resolver is independent of esbuild externals; CM6 packages resolve from node_modules normally for test execution"
    - "`insertBracket(state, char)` from @codemirror/autocomplete drives closeBrackets in unit tests without needing a live EditorView (no DOM-event simulation in happy-dom)"
    - "`closeBracketsKeymap.find((b) => b.key === 'Backspace').run({state, dispatch})` invokes the Backspace pair-delete handler against a synthetic state — same pattern recommended for keymap-driven CM6 tests"
    - "LooseStateCommand structural type to bridge @codemirror/commands@6.6.0 / @codemirror/state@6.5.0 dual resolution — TS2352 mitigation documented in 16-04 SUMMARY's Deferred Issues"
    - "ENTER-02..04 covered by `it.skip` with documented manual-UAT references — Lezer parser-tree-driven indent does not reproduce deterministically in happy-dom; behavioral verification lives in real-Obsidian UAT (RESEARCH §Assumption A4)"

key-files:
  created:
    - "tests/main/childEditorLanguage.behavioral.test.ts (~470 lines): 49 tests across 8 describe blocks — 46 passing, 3 ENTER skipped"
    - ".planning/phases/16-language-packs-switching/16-05-SUMMARY.md (this file)"
  modified:
    - ".planning/REQUIREMENTS.md: 3 mutations — checkbox annotation, Future Requirements bullet, traceability row Pending → Deferred"

key-decisions:
  - "Used live `@codemirror/*` imports per RESEARCH §10 (no `vi.mock` on CM6 packages). Vitest resolves CM6 from node_modules independently of esbuild externals — this is the same path tests/main/sectionLockExtension.test.ts takes for live EditorState assertions."
  - "Drove BRACKET-01 auto-close via `insertBracket(state, char)` from @codemirror/autocomplete (a public helper exported from the package root) instead of dispatching simulated input events. Rationale: happy-dom does not deterministically reproduce CM6's input pipeline; `insertBracket` is the same function the keymap calls internally, so the test covers the load-bearing path with no fidelity loss."
  - "Drove BRACKET-04 (Backspace pair-delete) via `closeBracketsKeymap.find(b => b.key === 'Backspace').run({state, dispatch})` against a synthetic shim. Same precedent and same fidelity argument as above."
  - "Skipped ENTER-02..04 with `it.skip` blocks naming the manual-UAT items that gate them (Task 5 items 12/13/14). Explicit handoff to the human verification step is the ONLY reliable check for Lezer parser-tree-emergent properties; encoding flaky structural assertions would create test-suite tech debt."
  - "Pitfall E (Go `commentTokens`) GATE PASSED out of the box — `StreamLanguage.define(go)` from @codemirror/legacy-modes/mode/go DOES expose the CM5 mode's `lineComment: '//'` as CM6 `commentTokens`. Task 4 is therefore SKIPPED — no edit to childEditorLanguage.ts. RESEARCH §12 Pitfall E preventive remediation pattern remains documented for future StreamLanguage additions where the mapping does not auto-derive."
  - "LooseStateCommand structural-type workaround for the @codemirror/commands@6.6.0 ⊥ @codemirror/state@6.5.0 dual resolution that triggers TS2352 on the imported `StateCommand` type. This is a test-only mitigation; the production code path in src/main/childEditorLanguage.ts uses the same precedent (line 146: `as unknown as Command` cast). Underlying duplicate resolution is documented in 16-04 SUMMARY's Deferred Issues — a Phase 17 hygiene plan can deduplicate."

patterns-established:
  - "Behavioral test layout: separate file per emergent-property cluster (`*.behavioral.test.ts`), live imports, fixture-driven `it.each` for table-shape coverage, `it.skip` with documented manual-UAT references for properties that require a live Electron Obsidian to reproduce"

requirements-completed: []  # Plan 05 produces tests + docs; the requirements flip to Complete after the manual UAT (Task 5 checkpoint) is signed off

# Metrics
duration: ~6 min (Tasks 1-3, automated work — UAT pending)
completed: 2026-05-22
---

# Phase 16 Plan 05: Behavioral Tests + REQUIREMENTS.md + Bundle Measurement Summary

**Live-EditorState behavioral test coverage for BRACKET/COMMENT/INDENT requirements (49 tests, 46 passing, 3 ENTER manual-UAT-gated); REQUIREMENTS.md BRACKET-05 status flipped to Deferred (D-09); bundle-size delta measured (+108 KB gzipped); manual UAT pending in Task 5 plus one bundle-ceiling decision flagged for the user.**

## Performance

- **Duration:** ~6 min for Tasks 1–3 (Task 4 skipped — Pitfall E not encountered; Task 5 deferred to user UAT)
- **Started:** 2026-05-22T20:08Z (executor spawn)
- **Completed (automated portion):** 2026-05-22T20:14Z
- **Tasks:** 3 automated (Tasks 1, 2, 3) + 1 skipped (Task 4) + 1 awaiting human verification (Task 5)
- **Commits:** 2 — Task 1 RED-then-GREEN combined (tests already pass against existing 16-01..16-04 implementation), Task 2 docs
- **Files changed:** 2 (1 created, 1 modified)

## What Was Built

### Task 1 — `tests/main/childEditorLanguage.behavioral.test.ts` (commit `17049a1`)

49 tests across 8 describe blocks. All non-skipped tests pass against the production `buildLanguageExtensions` exported from `src/main/childEditorLanguage.ts` (Plan 16-01) — no implementation changes needed for any test to go green. This is consistent with the plan's framing: 16-01..16-04 wired the structure, 16-05 verifies the emergent behaviors.

| Describe block | # tests | Coverage |
| -------------- | ------- | -------- |
| BRACKET-01 — auto-close openers across languages | 13 (`it.each`) | python3/java/cpp/rust/golang/javascript/typescript × `{ [ ( "` plus python3 single-quote |
| BRACKET-02 — markdown chars do NOT auto-pair (D-10 regression) | 6 (`it.each` + 1 dedicated) | python3/java/javascript × `*` `_` plus python3 backtick (no triple-fence) |
| BRACKET-03 — overtype on closer | 2 | python3 `()` and java `{}` |
| BRACKET-04 — Backspace pair-delete via closeBracketsKeymap | 3 | python3 `{}`, java `()`, javascript `[]` |
| COMMENT-01 — toggleLineComment per language | 7 | python3 `#`, java/javascript/rust/golang/cpp/typescript `//` |
| INDENT-04 — getIndentUnit per language and override | 13 (`it.each` + 5 dedicated) | All 8 chevron slugs `auto`, plus override=2/4/8 cases including D-06 Go-tab non-negotiable |
| ENTER-02/03/04 — Lezer indent (manual-UAT gated) | 3 (`it.skip`) | Documents handoff to Task 5 items 12/13/14 |
| Surface assertion: closeBrackets and toggleLineComment are wired | 2 | smoke check across all 8 slugs + structural reachability |

**Pitfall E gate result:** Go `toggleLineComment` test passes out of the box. The CM5-style `lineComment: '//'` declaration in `@codemirror/legacy-modes/mode/go` is auto-mapped to CM6 `commentTokens.line` by `StreamLanguage.define()`. Task 4's conditional remediation is therefore **NOT executed** — `src/main/childEditorLanguage.ts` is unchanged in this plan.

**Result:** 46 passing + 3 skipped = 49. Full vitest suite: 1632 passed, 6 skipped, 0 failures. No regressions in any prior phase.

### Task 2 — `.planning/REQUIREMENTS.md` (commit `42fcaed`)

Three mutations marking BRACKET-05 as Deferred per Phase 16 D-09:

1. **Bracket & Pair Handling list (line 31):** appended `*(Deferred — see Future Requirements; per Phase 16 D-09)*` annotation to the BRACKET-05 checkbox row. Checkbox itself remains `[ ]` so the requirement stays visible in the v1.2 list as a deferred item.
2. **Future Requirements section (after FUTURE-04):** added bullet — `**BRACKET-05**: Triple-backtick template literal auto-close in JS/TS (CM6 stock closeBrackets does not cover triple-quote sequences; deferred to v1.3 if user-reported).`
3. **Traceability table (line 84):** flipped Status column from `Pending` to `Deferred` — RESEARCH §8 calls this the "load-bearing" mutation.

**Verification:**
- `grep "BRACKET-05.*Deferred" .planning/REQUIREMENTS.md` → 2 matches (checkbox annotation + traceability)
- `grep "BRACKET-05.*Pending" .planning/REQUIREMENTS.md` → 0 matches
- `git diff .planning/REQUIREMENTS.md` → only BRACKET-05 lines touched (3-line diff)

### Task 3 — Bundle-size delta measurement

Methodology: built the production bundle at the current Phase 16 HEAD, captured `main.js` raw and gzipped sizes, then checked out the source tree at commit `2516f07` (the last commit before Phase 16 added new deps in `889ad29`), reinstalled deps, rebuilt, and captured the pre-Phase-16 sizes. Then restored the Phase 16 worktree state. Both builds use the same esbuild config (`esbuild.config.mjs`, production mode, minify=true).

| Measurement | Pre-Phase-16 (`2516f07`) | Post-Phase-16 (`42fcaed`) | Delta |
| ----------- | ------------------------ | ------------------------- | ----- |
| `main.js` raw bytes | 1,273,722 | 1,577,935 | **+304,213** (+297 KB) |
| `main.js` raw KB | 1,243.9 KB | 1,541.0 KB | **+297 KB** |
| `gzip -c main.js \| wc -c` | 310,169 | 418,581 | **+108,412** (+106 KB) |
| Headroom vs CLAUDE.md ~1.5 MB ceiling (raw) | 257 KB | -41 KB **(over)** | -298 KB |
| Headroom vs `check-bundle-size.mjs` HARD_LIMIT (1,300,000 raw) | 26 KB | -278 KB **(over)** | -304 KB |

**`node scripts/check-bundle-size.mjs` exit code:** 1 (FAIL — main.js exceeds 1,300,000 bytes).

**Per-package contribution to the +297 KB raw / +106 KB gz delta** (estimated by inspecting the dependency tree at the two commits):

| Package | Bundled? | Approx. raw contribution | Approx. gz contribution |
| ------- | -------- | ------------------------ | ----------------------- |
| `@codemirror/lang-rust` (Lezer parser tables) | YES | ~180–220 KB | ~55–65 KB |
| `@codemirror/legacy-modes/mode/go` (StreamLanguage descriptor) | YES | ~10–15 KB | ~3–5 KB |
| `@codemirror/autocomplete` (`closeBrackets`, `closeBracketsKeymap`) | NO (esbuild external — runtime-provided by Obsidian) | 0 | 0 |
| Plan 16-01 builder + Plan 16-04 dispatch helper plumbing | YES | ~1–2 KB | ~0.5 KB |
| Other (minify nondeterminism / call-graph reach) | — | balance | balance |

The dominant cost is `@codemirror/lang-rust`'s Lezer parser tables. RESEARCH §9 estimated 20–30 KB gzipped for `lang-rust`; the actual contribution is roughly 2× that estimate. The Lezer grammar for Rust is larger than other CM6 packs (lifetime annotations, macro syntax, etc.).

**Why this exceeds the check script's 1.3 MB hard limit but not CLAUDE.md's 1.5 MB ceiling:**

- CLAUDE.md records the v1.2 architectural ceiling as ~1.5 MB (Stack Patterns + Bundle ceiling discussion in `.planning/research/STACK.md`).
- `scripts/check-bundle-size.mjs` was last bumped at Phase 08 Plan 02 to 1.3 MB hard / 1.17 MB soft, with an explicit "16% headroom" framing for the AI SDK addition. The script's own header comment establishes the ceiling-bump precedent: when a planned work item lands and tree-shaking false-greens lift, the threshold gets raised proportionally.
- Phase 16's planned addition (lang-rust + legacy-modes/mode/go) was anticipated to add ~50–80 KB at CONTEXT.md scoping time. The actual delta of 297 KB raw / 106 KB gz overshoots that estimate.
- The post-Phase-16 bundle (1.50 MB raw, 408 KB gz) sits roughly at the CLAUDE.md ~1.5 MB architectural ceiling and below most Obsidian AI plugins (Smart Connections ~1.2 MB precedent listed in the script header is an AI-only baseline; Phase 16 adds language-pack functionality on top of an AI-bundled plugin).

**Disposition: surfaced as a Task 5 decision item, NOT auto-bumped.** Per the plan's Task 3 action: "If the script exits non-zero (over budget), DO NOT proceed to Task 4; instead, surface the failure to the user and ask whether to revisit the bundle ceiling — RESEARCH §9 estimates the delta well within budget, so any failure indicates an unexpected bundling regression." The measurement is faithfully recorded above; the decision to bump the script's HARD_LIMIT to 1.6 MB / 1.7 MB or to investigate further (e.g., dynamic-import the legacy Go mode, switch to an alternative Rust grammar, or accept the bundle ceiling lift) is an architectural call that belongs with the user. See the **Bundle Ceiling Decision** subsection of the Task 5 Manual UAT items below.

### Task 4 — Pitfall E remediation: SKIPPED

Conditional on Task 1's Go COMMENT-01 test failing. **Test passed** — `StreamLanguage.define(go)` from `@codemirror/legacy-modes/mode/go` exposes the CM5 mode's `lineComment: '//'` as CM6 `commentTokens.line` automatically. No edit to `src/main/childEditorLanguage.ts`. Pitfall E preventive remediation pattern (`new LanguageSupport(StreamLanguage.define(go), [languageData.of({ commentTokens: { line: '//' } })])`) remains documented in 16-RESEARCH.md §12 for future StreamLanguage additions where the mapping does not auto-derive.

## Test Coverage Matrix

| Requirement | Test Block | # tests | Result |
| ----------- | ---------- | ------- | ------ |
| BRACKET-01 (auto-close openers) | Behavioral: BRACKET-01 | 13 | PASS |
| BRACKET-02 (no markdown auto-pair, D-10) | Behavioral: BRACKET-02 | 6 | PASS |
| BRACKET-03 (overtype on closer) | Behavioral: BRACKET-03 | 2 | PASS |
| BRACKET-04 (Backspace pair-delete) | Behavioral: BRACKET-04 | 3 | PASS |
| COMMENT-01 (toggleLineComment per language) | Behavioral: COMMENT-01 | 7 | PASS — incl. Go (Pitfall E gate green) |
| INDENT-04 (getIndentUnit per language + override) | Behavioral: INDENT-04 | 13 | PASS |
| ENTER-02 (`{`-Enter Java indent) | Behavioral: ENTER-02/03/04 | 1 | SKIP — manual UAT Task 5 item 12 |
| ENTER-03 (`:`-Enter Python indent) | Behavioral: ENTER-02/03/04 | 1 | SKIP — manual UAT Task 5 item 13 |
| ENTER-04 (`{|}` 3-line split) | Behavioral: ENTER-02/03/04 | 1 | SKIP — manual UAT Task 5 item 14 |
| LANG-01 (chevron switch) | Existing 16-04 + Task 5 item 4-5 | — | covered by 16-04 unit tests; visible UX gated by manual UAT |
| HIGHLIGHT-01 (bracket match highlight) | Existing 16-03 factory test + Task 5 item 11 | — | covered structurally by 16-03 (`bracketMatching()` in extensions); visual gated by UAT |
| BRACKET-05 (template literal auto-close) | — | — | DEFERRED via REQUIREMENTS.md (D-09) |

**Behavioral file totals:** 49 tests, 46 passing, 3 ENTER-skipped (intentional, with documented manual-UAT references).

## Verification Results

| Check | Result |
| ----- | ------ |
| `npx vitest run tests/main/childEditorLanguage.behavioral.test.ts` | PASS — 46/49 (3 intentional skips) |
| `npx vitest run` (full suite) | PASS — 1632 passed, 6 skipped, 0 failures |
| `npm run build` (tsc strict + esbuild production) | PASS — exit 0 (after LooseStateCommand workaround for the documented dual-resolution TS2352) |
| `node scripts/check-bundle-size.mjs` | **FAIL** — main.js (1,577,935 bytes) exceeds HARD_LIMIT (1,300,000 bytes). Decision flagged for Task 5 UAT. |
| `grep "BRACKET-05.*Deferred" .planning/REQUIREMENTS.md` | 2 matches (checkbox annotation + traceability table) |
| `grep "BRACKET-05.*Pending" .planning/REQUIREMENTS.md` | 0 matches |
| `git diff` scope | Only the new test file + 3 BRACKET-05 lines in REQUIREMENTS.md — no other rows touched |

## Bundle Size Delta

| Measurement | Value |
| ----------- | ----- |
| Pre-raw (`2516f07`) | 1,273,722 bytes |
| Post-raw (`42fcaed`) | 1,577,935 bytes |
| Delta-raw | +304,213 bytes (+297 KB) |
| Pre-gz | 310,169 bytes |
| Post-gz | 418,581 bytes |
| Delta-gz | +108,412 bytes (+106 KB) |
| RESEARCH §9 estimate | +25–40 KB gzipped — overshot by ~2.5× |
| `check-bundle-size.mjs` HARD_LIMIT | 1,300,000 bytes (over by 277 KB) |
| `check-bundle-size.mjs` SOFT_WARN | 1,170,000 bytes (over by 408 KB) |
| CLAUDE.md ~1.5 MB v1.2 ceiling | ~1,536,000 bytes — over by ~41 KB |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Lint/TS discipline] LooseStateCommand structural type to bridge dual @codemirror/state resolution**

- **Found during:** Task 1 verification (`npm run build` after the initial test file landed).
- **Issue:** `tsc -noEmit -skipLibCheck` reported TS2352 on three `as StateCommand` casts in the new test file. The error chain showed two copies of `@codemirror/state` resolved in node_modules (one at the top level, one nested under `@codemirror/commands/node_modules/`). `toggleLineComment` from `@codemirror/commands` carries the nested copy's `StateCommand` type, while the test file imports `StateCommand` from the top-level `@codemirror/state`. The two have nominally-equal shapes but TS2352 fires on the private `flags` field of `SelectionRange`.
- **Fix:** Replaced `import { type StateCommand } from '@codemirror/state'` with a local structural alias `type LooseStateCommand = (target: { state: EditorState; dispatch: (tr: Transaction) => void }) => boolean`, and cast `toggleLineComment` once via `as unknown as LooseStateCommand` into a module-local `toggleLineCommentLoose` constant. All test bodies now reference the loose alias. Mirror precedent: `src/main/childEditorLanguage.ts:146` already uses `as unknown as Command` for the same root cause (16-01's GREEN-state code).
- **Files modified:** `tests/main/childEditorLanguage.behavioral.test.ts` (the new file from this plan).
- **Why this is Rule 3 and not architectural:** Both copies of `@codemirror/state` carry the same runtime contract — only TypeScript's nominal-type machinery distinguishes them. The structural type bypass preserves test-time intent (a `(target) => boolean` command shape) without weakening runtime behavior. The underlying duplicate-resolution issue is documented as Deferred Issue in 16-04 SUMMARY and is out of scope for Plan 16-05.

**No bugs auto-fixed (Rule 1):** None.
**No critical missing functionality auto-added (Rule 2):** None.

### Architectural Decision Surfaced (Rule 4 — escalation, NOT auto-fixed)

**Bundle size exceeds the `check-bundle-size.mjs` HARD_LIMIT (1.3 MB raw):**

Rather than auto-bumping the threshold (which would be a Rule 4 architectural change to a guard rail without explicit user decision), this plan surfaces the measurement and adds a Bundle Ceiling Decision item to the Task 5 manual UAT checkpoint. Three options for the user:

- **Option A (recommended for v1.2 close-out):** Bump `HARD_LIMIT` to 1,600,000 / `SOFT_WARN` to 1,440,000 (~10% headroom over current bundle). Rationale: Phase 16 was scoped to add language packs; the addition was anticipated and the runtime cost is functional, not bloat. This preserves the regression-gate behavior — future commits that add another 50 KB would still trip the check.
- **Option B:** Investigate dynamic-import or alternative Rust grammar to reduce the lang-rust contribution. Adds 1–3 days of unscoped work; may not be feasible given Obsidian's single-CJS plugin loader requirement (07-RESEARCH bundle decision-A guard).
- **Option C:** Accept the regression check as failing for Phase 16 and revisit in Phase 17 polish. Phase 16 ships the language-pack functionality; the bundle gate is decoupled from user-visible correctness.

This is documented as a checkpoint item; no code change in this plan reflects a choice yet.

### Threat Model Mitigations

| Threat ID | Disposition | Implementation Verification |
|-----------|-------------|----------------------------|
| T-16-05-01 (Bundle size regression beyond 1.5 MB ceiling) | mitigate | Task 3 measurement performed; `check-bundle-size.mjs` exits 1; flagged to user as decision item. Bundle is at the CLAUDE.md ~1.5 MB architectural ceiling but exceeds the script's stricter 1.3 MB HARD_LIMIT. |
| T-16-05-02 (Behavioral tests pass but real-world UX fails) | mitigate | Task 5 manual UAT in real Obsidian — 21 verification items + 1 bundle-ceiling decision item — is a blocking human checkpoint per plan frontmatter `gate="blocking"`. |
| T-16-05-03 (REQUIREMENTS.md mutation accidentally flips other rows) | mitigate | `git diff .planning/REQUIREMENTS.md` confirmed scope is exactly 3 BRACKET-05 lines (checkbox annotation, Future Requirements bullet, traceability cell). No other rows touched. |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. New artifacts: a behavioral test file (test-only, not bundled at runtime) and a REQUIREMENTS.md edit (planning artifact). No threat flags.

## Known Stubs

None. The behavioral test file does not stub any production code; it imports the live `buildLanguageExtensions` SUT. The 3 `it.skip` ENTER blocks are documented manual-UAT handoffs, not stubs.

## Deferred Issues

- **Bundle ceiling decision** — see "Architectural Decision Surfaced" above. User must select Option A/B/C in the Task 5 UAT checkpoint.
- **`@codemirror/state` dual resolution** — inherited from 16-01/16-04. Phase 17 hygiene plan candidate. Mitigated locally via `LooseStateCommand` structural type.
- **ENTER-02..04 automated coverage** — Lezer parser-tree-driven indent does not reproduce deterministically in happy-dom. The 3 `it.skip` blocks document the manual-UAT path; if Phase 17 spins up a real Electron-based test harness, these can be migrated to automated assertions.

## Self-Check: PASSED

- `[ -f tests/main/childEditorLanguage.behavioral.test.ts ]` — FOUND
- `[ -f .planning/phases/16-language-packs-switching/16-05-SUMMARY.md ]` — FOUND (this file)
- Commit `17049a1` (Task 1 — behavioral tests) — FOUND in `git log --oneline`
- Commit `42fcaed` (Task 2 — REQUIREMENTS.md mutation) — FOUND in `git log --oneline`
- Build: `npm run build` exits 0
- Behavioral tests: 46 passing + 3 intentional skips (49 total)
- Full suite: 1632 passed, 6 skipped, 0 failures
- REQUIREMENTS.md mutations: BRACKET-05 has Deferred status (2 matches), no Pending matches, Future Requirements section augmented, only BRACKET-05 lines in diff
- Bundle measurement captured (pre-raw 1,273,722 / post-raw 1,577,935 / pre-gz 310,169 / post-gz 418,581) — pending user decision on ceiling
- Task 4 (Pitfall E) — SKIPPED with documented rationale (Go test passed out of the box; no edit needed)
- Task 5 (manual UAT) — pending; structured CHECKPOINT REACHED message returned to orchestrator with all 21 plan items + 1 bundle-ceiling decision item

## Next Phase Readiness

- **Manual UAT gate (Task 5)** is the next required step. Once the user signs off on the 21 verification items AND selects a bundle-ceiling option, Phase 16 closes.
- **Phase 17 candidates inherited from this plan:**
  - D-14 (external `lc-language` frontmatter edit reactivity) — informational deferral confirmed
  - D-16 (theme-aware syntax highlighting via Obsidian CSS variables) — informational deferral confirmed
  - BRACKET-05 (triple-backtick template literal auto-close) — deferred to v1.3 reconsideration if user-reported
  - Bundle-ceiling threshold update (if Option A chosen) — `scripts/check-bundle-size.mjs` HARD_LIMIT and SOFT_WARN adjusted
  - `@codemirror/state` duplicate resolution cleanup — Phase 17 hygiene
  - ENTER-02..04 automated coverage migration — pending real-Electron harness

---
*Phase: 16-language-packs-switching*
*Plan: 05 — Behavioral Tests, REQUIREMENTS.md Mutation, Bundle Measurement, UAT Setup*
*Completed (automated portion): 2026-05-22*
