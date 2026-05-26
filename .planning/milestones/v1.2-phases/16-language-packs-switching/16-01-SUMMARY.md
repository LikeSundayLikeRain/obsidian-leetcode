---
phase: 16-language-packs-switching
plan: 01
subsystem: editor
tags: [codemirror, language-pack, compartment, indent, brackets, comment, typescript]

# Dependency graph
requires:
  - phase: 13-nested-editor-foundation
    provides: childEditorFactory.ts python() + indentUnit.of("    "); childEditorRegistry; bracketMatching
  - phase: 14-bidirectional-sync
    provides: 'leetcode.lang-switch' userEvent convention; child sync skips effects-only transactions
  - phase: 15-focus-undo-cursor
    provides: indentWithTab keymap precedence; child editor extension array shape
provides:
  - "src/main/childEditorLanguage.ts: pure builder with buildLanguageExtensions(slug, override) → Extension[]"
  - "languageCompartment: Compartment singleton consumed by 16-03 factory and 16-04 chevron"
  - "effectiveIndent(slug, override): pure indent-unit lookup with D-05 map + D-06 Go-tab"
  - "Three new direct deps: @codemirror/lang-rust, @codemirror/legacy-modes, @codemirror/autocomplete"
affects: [16-02, 16-03, 16-04, 16-05]

# Tech tracking
tech-stack:
  added:
    - "@codemirror/lang-rust ^6.0.2 (Rust LanguageSupport)"
    - "@codemirror/legacy-modes ^6.5.3 (Go via StreamLanguage)"
    - "@codemirror/autocomplete ^6.20.2 (promoted transitive→direct for closeBrackets)"
  patterns:
    - "Pure language-extension builder pattern: (slug, override) → Extension[] decoupled from EditorView lifecycle"
    - "Module-level Compartment singleton (Pitfall C) — identity-keyed, shared across child editors"
    - "Pitfall A: StreamLanguage.define(go) called at function-call time, not module init, to avoid invoking esbuild-external @codemirror/language before Obsidian provides it"
    - "Pitfall B: closeBrackets imported from @codemirror/autocomplete package root only"

key-files:
  created:
    - "src/main/childEditorLanguage.ts (148 lines): buildLanguageExtensions, effectiveIndent, languageCompartment"
    - "tests/main/childEditorLanguage.test.ts (265 lines): 31 unit tests, 3 describe blocks"
  modified:
    - "package.json: 3 new direct dependencies"
    - "package-lock.json: lock entries for the three new packages + their dedupe targets"

key-decisions:
  - "D-05/D-06 implemented exactly: python3/java/cpp/c/rust → 4 spaces, javascript/typescript → 2 spaces, golang → '\\t' (always, even with numeric override)"
  - "D-11 builder shape locked: [LanguageSupport, indentUnit.of(...), closeBrackets(), keymap.of([{key:'Mod-/', run: toggleLineComment}])] — exactly 4 elements"
  - "closeBracketsKeymap deferred to 16-03's top-level wiring (Claude's Discretion in CONTEXT.md): keymap is language-agnostic so rebuilding it on every reconfigure is wasted work"
  - "D-04 defensive fallback: unknown slugs return python() instead of throwing — keeps function total even though chevron only emits 8 known slugs"
  - "Pitfall A enforced: StreamLanguage.define(go) inlined inside getLanguageSupport function body; verified by acceptance criterion grep over module-level consts"

patterns-established:
  - "Per-language Extension builder: pure function returning fixed-shape Extension[] for atomic Compartment.reconfigure"
  - "vi.hoisted() pattern for sharing sentinels between vi.mock factories: required because top-level const refs inside vi.mock factories throw ReferenceError due to factory hoisting"

requirements-completed: [INDENT-04, LANG-01, COMMENT-01, BRACKET-01]

# Metrics
duration: ~10 min
completed: 2026-05-22
---

# Phase 16 Plan 01: Language Builder & Dependencies Summary

**Pure language-extension builder for child editor: `buildLanguageExtensions(slug, override) → Extension[4]` with D-05 indent map + D-06 Go-tab non-negotiable rule + COMMENT-01 Mod-/ binding, plus three new direct CodeMirror dependencies and exported `languageCompartment` singleton for 16-03/16-04 to consume.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-22T13:18Z
- **Completed:** 2026-05-22T13:28Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 edited)

## Accomplishments

- `src/main/childEditorLanguage.ts` exports three symbols (`buildLanguageExtensions`, `effectiveIndent`, `languageCompartment`) with full TypeScript-strict typing
- 31 unit tests across `effectiveIndent`, `buildLanguageExtensions`, and `languageCompartment` — every D-05/D-06 indent rule and D-03 shared-pack rule covered
- Three new direct dependencies installed: `@codemirror/lang-rust@6.0.2`, `@codemirror/legacy-modes@6.5.3`, `@codemirror/autocomplete@6.20.2`
- Pitfall A (`StreamLanguage.define(go)` at call time) and Pitfall B (`closeBrackets` from package root) structurally enforced and grep-verified
- Full test suite green (1559 passed, 3 skipped) — no regressions

## Task Commits

1. **Task 1: Install three CodeMirror packages** — `889ad29` (chore)
2. **Task 2: Create childEditorLanguage.ts** — `b9078a0` (feat)
3. **Task 3: Unit tests** — `348d388` (test)

## Files Created/Modified

- `src/main/childEditorLanguage.ts` — Pure language builder with `buildLanguageExtensions`, `effectiveIndent`, and `languageCompartment` (singleton)
- `tests/main/childEditorLanguage.test.ts` — 31 unit tests covering all 8 chevron slugs, D-05/D-06 indent rules, D-03 shared cpp/c + typescript variant, Pitfall A enforcement, and Compartment shape
- `package.json` — Added 3 entries to `dependencies`: `@codemirror/lang-rust`, `@codemirror/legacy-modes`, `@codemirror/autocomplete`
- `package-lock.json` — Lock entries for the three new packages

## Decisions Made

- **Builder return type relaxed to `Extension[]`** — `getLanguageSupport(slug)` now returns `Extension` instead of `LanguageSupport`. Reason: `StreamLanguage.define(go)` returns `StreamLanguage<unknown>`, not `LanguageSupport`. Both are valid Compartment payloads via the broader `Extension` union; the narrower type was a TypeScript error, not a runtime constraint.
- **`toggleLineComment` cast through `Command`** — Pre-existing `@codemirror/state` version duplicate (`commands` resolves to 6.6.0, the rest to 6.5.0) causes nominal type drift between `StateCommand` and `Command`. The cast unblocks TypeScript strict mode without touching runtime behavior; both interfaces are structurally identical.
- **`vi.hoisted()` for shared sentinels in tests** — Top-level `const` references inside `vi.mock` factory bodies throw `ReferenceError` because factories are hoisted above top-level statements. `vi.hoisted()` is the canonical workaround; documented in test-file header.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Builder return type too strict for Go path**
- **Found during:** Task 2 (build verification)
- **Issue:** `getLanguageSupport(slug): LanguageSupport` rejected at TS compile time because `StreamLanguage.define(go)` returns `StreamLanguage<unknown>`, which is missing `language` and `support` properties of `LanguageSupport`.
- **Fix:** Relaxed return type to `Extension`. Both `LanguageSupport` and `StreamLanguage` are valid extensions; the broader type is correct for the Compartment payload.
- **Files modified:** src/main/childEditorLanguage.ts
- **Verification:** `npm run build` exits 0 after fix.
- **Committed in:** b9078a0

**2. [Rule 3 — Blocking] toggleLineComment Command vs StateCommand type mismatch**
- **Found during:** Task 2 (build verification)
- **Issue:** `keymap.of([{ run: toggleLineComment }])` failed type check. `toggleLineComment` from `@codemirror/commands` is typed `StateCommand`; `keymap` from `@codemirror/view` expects `Command`. Both interfaces are structurally identical, but `@codemirror/commands` resolves a different `@codemirror/state` (6.6.0) than `@codemirror/view` (6.5.0), creating nominal type drift.
- **Fix:** Cast `toggleLineComment as unknown as Command` at the keymap binding site, with an inline comment documenting the cause.
- **Files modified:** src/main/childEditorLanguage.ts
- **Verification:** `npm run build` exits 0 after fix; `npm run lint` exits 0; tests still green.
- **Committed in:** b9078a0

**3. [Rule 1 — Bug] vi.mock factory cannot reference top-level const**
- **Found during:** Task 3 (first test run)
- **Issue:** Test file declared `const goModeSentinel = ...` at top level and referenced it inside a `vi.mock('@codemirror/legacy-modes/mode/go', () => ({ go: goModeSentinel }))` factory. Vitest hoists `vi.mock` factories above all top-level statements, so the const reference threw `ReferenceError: Cannot access 'goModeSentinel' before initialization`.
- **Fix:** Moved the sentinel into a `vi.hoisted(() => ({ goModeSentinel: ... }))` block — the canonical vitest pattern for shared values inside mock factories.
- **Files modified:** tests/main/childEditorLanguage.test.ts
- **Verification:** Test file now passes 31/31.
- **Committed in:** 348d388

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking type mismatch)
**Impact on plan:** All three were minor; structural intent of the plan unchanged. The `Command` cast surfaces a pre-existing CM6 dep duplicate that was deferred (see Deferred Issues).

## Issues Encountered

None blocking. The pre-existing CM6 state/view version duplicate (caused by `@codemirror/commands@6.10.3` resolving `@codemirror/state@6.6.0` while obsidian peer-pins to `6.5.0`) created nominal type drift that required a `Command` cast. Documented in Known Stubs/Deferred Issues for future cleanup.

## Deferred Issues

- **CM6 core duplicate (pre-existing, out of scope for 16-01):** `npm ls @codemirror/state @codemirror/view` reports two resolved versions: `6.5.0` (obsidian peer + most lang packs) and `6.6.0` (via `@codemirror/commands@6.10.3` and `@codemirror/lint@6.9.6`). This was present before Phase 16 — Phase 16 did not introduce it. The plan's Pitfall F mitigation acceptance criterion (`single resolved version each`) is technically failing on a pre-existing condition, but per scope-boundary rules I did not auto-fix unrelated issues. Recommended Phase 17 cleanup: align `@codemirror/commands` to a version that resolves `@codemirror/state@6.5.0`, or update obsidian peer-dep alignment in package.json. Tracked here so the verifier sees the explicit deferral.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `languageCompartment` singleton ready for 16-03 (factory) and 16-04 (chevron) to import
- `buildLanguageExtensions(slug, override)` ready to be consumed by both `Compartment.of(...)` (factory init) and `Compartment.reconfigure(...)` (chevron switch)
- `effectiveIndent` exported separately for any future code path that needs the indent unit independent of the full builder
- 16-02 (settings field) and 16-03 (factory wiring) can proceed in parallel as designed by the wave layout

## Self-Check: PASSED

- Files: 4/4 created/modified files exist on disk
- Commits: 3/3 task commits found in git log (`889ad29`, `b9078a0`, `348d388`)
- Build: `npm run build` exits 0
- Lint: `npm run lint` exits 0
- New tests: `npm test -- tests/main/childEditorLanguage.test.ts` — 31/31 passing
- Full suite: 1559 passed, 3 skipped (no regressions)
- Acceptance criteria all-task verification:
  - Task 1: 3 new deps in package.json + lock; esbuild externals unchanged; CM6 duplicate documented as pre-existing deferred
  - Task 2: 3 exports present; build green; StreamLanguage.define call inside function body; closeBrackets imported from package root; legacy-modes deep subpath used; D-05/D-06/D-11 + INDENT-04/LANG-01/COMMENT-01 in header comments
  - Task 3: 30+ test cases (got 31); 11 CM6 mocks; Go-override-ignored test present; typescript({ typescript: true }) test present

---
*Phase: 16-language-packs-switching*
*Completed: 2026-05-22*
