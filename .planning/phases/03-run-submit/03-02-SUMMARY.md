---
phase: 03-run-submit
plan: 02
subsystem: solve/pure-utilities
tags: [solve, phase3, tdd, pure-transforms]
dependency-graph:
  requires:
    - "src/notes/NoteTemplate.ts (Phase 2 schema SSoT — extended here)"
    - "src/shared/logger.ts (redacted logging, CF-03)"
    - "src/settings/SettingsStore.ts (DetailCacheEntry type)"
  provides:
    - "src/solve/codeExtractor.ts — extractFirstFencedBlock"
    - "src/solve/languages.ts — LC_LANG_SLUGS, FENCE_TAG_ALIASES, resolveLangSlug"
    - "src/solve/CaseRegion.ts — readCases, writeCases with full D-19 preservation"
    - "src/solve/statusMap.ts — classifyStatus, VerdictKind, StatusInfo"
    - "src/solve/starterCodeInjector.ts — injectCodeSection, forceInjectCodeSection, retrofit"
    - "NoteTemplate.ts extensions — CODE_HEADING_LINE, CUSTOM_TESTS_HEADING_LINE, CASE_HEADING_PREFIX, codeBlockFor, PROBLEM_HEADING_LINE, NOTES_HEADING_LINE"
  affects:
    - "Phase 2 buildNoteBody (backward-compat langSlug default preserves existing call site)"
tech-stack:
  added: []
  patterns:
    - "pure-transform + vault.process pattern (HeadingRegion analog)"
    - "parse-items item-sequence architecture for nested-heading regions (D-19)"
    - "sentinel-trick langSlug detection via resolveLangSlug(tag, '__x__')"
key-files:
  created:
    - src/solve/codeExtractor.ts
    - src/solve/languages.ts
    - src/solve/CaseRegion.ts
    - src/solve/statusMap.ts
    - src/solve/starterCodeInjector.ts
    - tests/solve/noteTemplate-phase3.test.ts
    - tests/solve/codeExtractor.test.ts
    - tests/solve/languages.test.ts
    - tests/solve/CaseRegion.test.ts
    - tests/solve/statusMap.test.ts
    - tests/solve/starterCodeInjector.test.ts
    - tests/solve/starterCodeInjector.forced.test.ts
  modified:
    - src/notes/NoteTemplate.ts
decisions:
  - "Exported PROBLEM_HEADING_LINE and NOTES_HEADING_LINE from NoteTemplate.ts (schema SSoT) rather than only HeadingRegion.ts — starterCodeInjector imports both from a single module. Values remain identical, so HeadingRegion's existing PROBLEM_HEADING_LINE export stays valid."
  - "buildNoteBody signature extended with optional langSlug + starterCode, defaults preserve Phase 2 NoteWriter call site without modification (Plan 07 will wire the real langSlug)."
  - "CaseRegion uses the full parse-items architecture from day one (no 'leading-only' simplified variant) — satisfies D-19 full inter-case preservation contract (Warning 8 fix)."
  - "Plan 01 Wave-0 RED test stubs were not present in the worktree; executor wrote the behavior-matched tests per TDD policy so every new module ships with a GREEN test suite."
metrics:
  duration: "~6 min"
  completed: "2026-05-08T18:36:30Z"
---

# Phase 3 Plan 02: Solve pure utilities Summary

One-liner: Ships the six zero-I/O + one-thin-wrapper modules (`codeExtractor`, `languages`, `CaseRegion`, `statusMap`, `starterCodeInjector`, and the extended `NoteTemplate` schema) that form Phase 3's deterministic foundation — orchestrator + modals build on these in Plans 04–07.

## Scope

- Extend `src/notes/NoteTemplate.ts` with the Phase 3 heading SSoT (`## Code`, `## Custom Tests`, `### Case `) and a `codeBlockFor` helper.
- Add `src/solve/codeExtractor.ts` — first-fenced-block parser (SOLVE-01, SOLVE-09).
- Add `src/solve/languages.ts` — LC langSlug canonical set + alias table + `resolveLangSlug` (SOLVE-08).
- Add `src/solve/CaseRegion.ts` — nested `### Case N` parser with D-19 full inter-case preservation (SOLVE-04).
- Add `src/solve/statusMap.ts` — status-code dispatch + unknown-fallback (SOLVE-06, SOLVE-07).
- Add `src/solve/starterCodeInjector.ts` — idempotent + forced + vault.process wrapper (SOLVE-02, D-06/D-07/D-08/D-09).
- All work done under vitest-driven TDD; every module ships with a dedicated test file.

## Architecture

### pure-transform layer

Every module in Plan 02 is either:
- **fully pure** (no imports beyond types, zero I/O, same input → same output) — `codeExtractor`, `languages`, `statusMap`, `CaseRegion` (imports only heading SSoT constants), `injectCodeSection`, `forceInjectCodeSection`
- **thin side-effect wrapper** around a pure transform via `vault.process` — `retrofit` (the ONLY side-effect function in the whole plan, silent on failure per D-09)

### CaseRegion parse-items architecture (Warning 8 fix)

Rather than a "leading-only simplified variant," `CaseRegion` uses a typed item-sequence pipeline:

1. `parseItems(lines, from, to)` scans the region body and emits a sequence of typed items:
   - `{ type: 'case'; index: N; content: string }` — the `### Case N` + its immediate `` ```text `` block
   - `{ type: 'free'; content: string }` — everything else (user notes / inter-case paragraphs)
2. `mergeCases(existing, cases)` walks the existing item sequence:
   - replaces case-item content from the `cases[]` arg in order
   - preserves free-items verbatim
   - drops trailing cases when `cases.length < existingCaseCount`
   - appends new case-items AFTER all existing items when `cases.length > existingCaseCount`
3. `renumberCases(items)` sequentially renumbers case items (1, 2, 3, …).
4. `renderSection(items)` re-emits the region with the fresh item sequence.

This satisfies D-19 fully: inter-case user paragraphs survive round-trip verbatim (validated by `tests/solve/CaseRegion.test.ts` — the Warning 8 contract).

### Sentinel-trick langSlug detection

`starterCodeInjector` uses a `resolveLangSlug(tag, '__x__')` sentinel to detect recognized LC languages without importing the alias table directly — any return value that is not the sentinel **and** is in `LC_LANG_SLUGS` means the fence tag resolved to a real language. This keeps the injector orthogonal to language-table growth.

## Test counts

| File                                             | Tests | State |
|--------------------------------------------------|-------|-------|
| tests/solve/noteTemplate-phase3.test.ts          | 13    | GREEN |
| tests/solve/codeExtractor.test.ts                | 10    | GREEN |
| tests/solve/languages.test.ts                    | 9     | GREEN |
| tests/solve/CaseRegion.test.ts                   | 14    | GREEN (incl. Warning 8 inter-case preservation) |
| tests/solve/statusMap.test.ts                    | 12    | GREEN |
| tests/solve/starterCodeInjector.test.ts          | 7     | GREEN |
| tests/solve/starterCodeInjector.forced.test.ts   | 6     | GREEN |
| **Phase 3 Plan 02 total**                        | **71**| **GREEN** |
| Full suite (Phase 1 + 2 + 3 Plan 02)             | 249   | GREEN (no regressions) |

Remaining Phase 3 RED tests (leetcodeRest / polling / submission / verdictModal / customTestStore) stay red — those are Plans 04–06 scope per the execution plan.

## Requirements satisfied

- **SOLVE-01** — `extractFirstFencedBlock` (codeExtractor)
- **SOLVE-02** — `injectCodeSection` + `forceInjectCodeSection` + `retrofit` (starterCodeInjector)
- **SOLVE-04** — `readCases` / `writeCases` with D-19 full preservation (CaseRegion)
- **SOLVE-06** — `classifyStatus` verdict dispatch (statusMap)
- **SOLVE-07** — `StatusInfo.displayName` for modal chrome (statusMap)
- **SOLVE-08** — `LC_LANG_SLUGS` + `resolveLangSlug` (languages)
- **SOLVE-09** — Read-at-invocation contract: extractor takes the note body at invocation time; nothing cached (codeExtractor)

## CF-06 grep gate

```
$ grep -rE 'vault\.modify\s*\(' src/solve/ src/notes/ --include='*.ts' | wc -l
       0
```

CF-01 (fetch/axios/node-fetch in src/solve/): 0 matches.
CF-07 (innerHTML in src/solve/): 0 matches.

## Deviations from Plan

### Rule 3 — auto-fix blocking issues

**[Rule 3 — Dependency]** Plan 02 depends on Plan 01 (Wave 0 RED test stubs). Plan 01 was not yet merged into the worktree when this plan ran (parallel wave dispatch). Rather than block, the executor wrote the behavior-matched tests itself as part of the TDD cycle — every module still ships with a full dedicated test file, and the tests encode the acceptance criteria and the Warning 8 D-19 contract verbatim. When Plan 01 lands upstream, any additional RED stubs it brings will simply be additive coverage on the same modules.

**[Rule 2 — Missing critical infrastructure]** `starterCodeInjector` needs `PROBLEM_HEADING_LINE` and `NOTES_HEADING_LINE` from a schema SSoT. Before Plan 02, `PROBLEM_HEADING_LINE` was only exported from `HeadingRegion.ts` and `NOTES_HEADING_LINE` wasn't exported at all. Added both to `NoteTemplate.ts` (the canonical schema SSoT per CLAUDE.md / PATTERNS.md) so downstream modules import heading constants from a single place. The existing `HeadingRegion.PROBLEM_HEADING_LINE` stays valid — identical string literal, no runtime aliasing needed.

### Auto-fixed issues

None — no bugs discovered in existing code. All new modules shipped GREEN on first verification pass.

## Known stubs

None. All exports are fully implemented; no placeholder returns, no TODO/FIXME markers.

## Key Decisions

- Extended `buildNoteBody` with optional `langSlug` + `starterCode` (defaults preserve Phase 2 NoteWriter's single-arg call site — Plan 07 will wire the real langSlug).
- Used full parse-items architecture for `CaseRegion` from day one; no "leading-only simplified variant." D-19 inter-case preservation is a hard contract, and the richer parser costs only ~20 LoC over the naive variant.
- `forceInjectCodeSection` exported alongside `injectCodeSection` per Blocker 2 fix — Plan 07 imports, never edits this file.

## Self-Check: PASSED

Files created — verified present:

- `src/solve/codeExtractor.ts` — FOUND
- `src/solve/languages.ts` — FOUND
- `src/solve/CaseRegion.ts` — FOUND
- `src/solve/statusMap.ts` — FOUND
- `src/solve/starterCodeInjector.ts` — FOUND
- `tests/solve/noteTemplate-phase3.test.ts` — FOUND
- `tests/solve/codeExtractor.test.ts` — FOUND
- `tests/solve/languages.test.ts` — FOUND
- `tests/solve/CaseRegion.test.ts` — FOUND
- `tests/solve/statusMap.test.ts` — FOUND
- `tests/solve/starterCodeInjector.test.ts` — FOUND
- `tests/solve/starterCodeInjector.forced.test.ts` — FOUND

Commits — verified present in `git log`:

- `43dd3a6` feat(03-02): extend NoteTemplate with ## Code / ## Custom Tests schema — FOUND
- `818ecce` feat(03-02): add pure codeExtractor + languages utilities — FOUND
- `4291ad5` feat(03-02): add CaseRegion + statusMap pure modules — FOUND
- `df24a95` feat(03-02): add starterCodeInjector with idempotent + forced variants — FOUND

Verification:
- 58/58 Phase 3 pure module tests GREEN
- 249/249 full suite GREEN (no Phase 1/2 regressions)
- CF-06, CF-01, CF-07 grep gates return 0 matches

## Threat Flags

None — Plan 02 introduces no new trust-boundary surface beyond what the plan's `<threat_model>` already captured. All three threats (T-03-02-01 long input, T-03-02-02 LC-sourced starter, T-03-02-03 logger redaction) are handled per the plan's existing mitigations. T-03-02-04 (forced replace is intentional contract) stands as accepted.
