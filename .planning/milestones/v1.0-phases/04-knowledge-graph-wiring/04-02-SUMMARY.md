---
phase: 04-knowledge-graph-wiring
plan: 02
subsystem: graph
tags: [graph, settings, note-template, pure-transform, shape-guard]
status: complete
requires: [04-01]
provides:
  - src/graph/dateFormat.ts (toIsoLocalTz)
  - src/graph/mergeTechniquesSection.ts (mergeTechniquesSection)
  - src/graph/StubNoteCreator.ts (ensureTechniquesFolder, createStubIfMissing)
  - src/notes/NoteTemplate.ts (+TECHNIQUES_HEADING_LINE, +buildTechniquesBlock, +buildTechniqueStubBody, +buildTechniqueFilename)
  - src/settings/SettingsStore.ts (+autoBacklinksEnabled, +DetailCacheEntry.topicTags, +getTechniquesFolder, +getAutoBacklinksEnabled, +setAutoBacklinksEnabled)
affects: [04-03, 04-04]
tech-stack:
  added: []
  patterns:
    - "src/solve/CaseRegion.ts analog for item-level parse-items merge (mergeTechniquesSection)"
    - "src/notes/BaseFile.ts::ensureLeetcodeBase analog for idempotent folder/file create (StubNoteCreator)"
    - "isPremium shape-guard analog for boolean PluginData field (autoBacklinksEnabled)"
    - "internalQuestionId optional-field analog for DetailCacheEntry.topicTags"
key-files:
  created:
    - src/graph/dateFormat.ts
    - src/graph/mergeTechniquesSection.ts
    - src/graph/StubNoteCreator.ts
  modified:
    - src/notes/NoteTemplate.ts
    - src/settings/SettingsStore.ts
    - tests/settings-store.test.ts
decisions:
  - "toIsoLocalTz uses native Date.getTimezoneOffset — DST-aware per MDN; zero imports"
  - "mergeTechniquesSection item model: {type:'link',target,bullet} | {type:'free',content} — identical to CaseRegion shape"
  - "mergeTechniquesSection insertion point: end-of-Notes > before-Custom-Tests > EOF (D-14 canonical order)"
  - "StubNoteCreator diverges from BaseFile by design: KnowledgeGraphWriter (Plan 03) calls createStubIfMissing on every AC, so deleted stubs auto-recreate (D-18 divergence)"
  - "autoBacklinksEnabled default true — headline plugin value (D-21)"
  - "topicTags optional on DetailCacheEntry — Phase 2-era cache entries remain valid (Pitfall 10)"
  - "getTechniquesFolder is derived (no new settings field) — {problemsFolder}/Techniques (D-15)"
metrics:
  tasks_completed: 3
  tests_passing: 36
  files_created: 3
  files_modified: 3
  source_lines_added: 365
  completed_date: 2026-05-09
---

# Phase 4 Plan 02: Pure Helpers + SettingsStore Extensions Summary

All Phase 4 PURE helpers (dateFormat + NoteTemplate extensions + mergeTechniquesSection) and narrowly-I/O primitives (StubNoteCreator + SettingsStore extensions) ship in a single plan, unblocking Plan 03 (KnowledgeGraphWriter + submissionHistoryClient) and Plan 04 (modals that consume copyToCode).

## What shipped

| Task | Status | Commit  | Files                                                                           | LoC added |
| ---- | ------ | ------- | ------------------------------------------------------------------------------- | --------- |
| 1    | green  | fa98da1 | `src/graph/dateFormat.ts` + extensions to `src/notes/NoteTemplate.ts`           | 48 + 74   |
| 2    | green  | 6beef4e | `src/graph/mergeTechniquesSection.ts`                                           | 243       |
| 3    | green  | a7af302 | `src/graph/StubNoteCreator.ts` + extensions to `src/settings/SettingsStore.ts` + `tests/settings-store.test.ts` | 74 + 59 + 110 |

**Total new source:** 365 lines across 3 new files + 133 net lines added to 2 existing files.

## Task-by-task line counts (Plan 03 sizing signal)

- `src/graph/dateFormat.ts`: **48 LoC** (pure helper, zero imports — exactly per §Pattern 6 reference)
- `src/graph/mergeTechniquesSection.ts`: **243 LoC** (close to the 150 LoC estimate in the plan; the insertion-point logic for D-14's Notes-Custom-Tests-EOF cascade + the free/link bullet-preservation invariants expanded beyond the CaseRegion analog)
- `src/graph/StubNoteCreator.ts`: **74 LoC** (50 LoC estimate + expanded docstrings; two exports, both mirror BaseFile.ts shape)
- `src/notes/NoteTemplate.ts` additions: **+74 lines** (1 constant + 3 helpers + canonical anchor-order doc comment)
- `src/settings/SettingsStore.ts` additions: **+59 lines** (1 interface field + 1 optional field + 1 default + 1 shape-guard + 3 getters + inline docs)

## CaseRegion analog vs mergeTechniquesSection divergence

The plan predicted "insertion-point logic diverges; everything else mirrors." Confirmed:

| Concern             | CaseRegion (Phase 3)                                                      | mergeTechniquesSection (Phase 4)                                                                                |
| ------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| H2 scan constant    | `H2 = /^## /`                                                             | identical                                                                                                       |
| Item typedef        | `{type:'case'\|'free', ...}`                                              | `{type:'link'\|'free', ...}` — same shape, different leaf                                                       |
| LINK match          | `CASE_H3 = /^### Case (\d+)\s*$/`                                         | `LINK_RE = /^([-*+])\s+\[\[([^\]]+)\]\]\s*$/` — bullet-tolerant per D-13                                        |
| parseItems          | trim free-runs; fence-walk on case                                        | trim free-runs; single-line link                                                                                |
| Splice/glue         | copied verbatim                                                           | copied verbatim                                                                                                 |
| No-region behavior  | **append at EOF**                                                         | **insert after Notes > before Custom Tests > EOF (D-14)** — this is the sole divergence                         |
| Idempotence check   | test-level                                                                | test-level (Wave 0 stub verifies merge(merge(body,tags),tags) === merge(body,tags))                             |

## StubNoteCreator divergence from BaseFile

Per plan L283 and D-18: the function bodies are identical (pre-check + vault.create + silent on race). The semantic divergence is **caller-driven**: KnowledgeGraphWriter (Plan 03) will call `createStubIfMissing` on every AC, so a user-deleted stub re-appears on the next AC referencing that technique. This is enforced by test 4 in `stubNoteCreator.test.ts` ("recreates after delete"), which passes.

## Verification gates

| Gate                                                                                  | Status                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `npm test -- tests/graph/dateFormat.test.ts`                                          | 2/2 green                                             |
| `npm test -- tests/graph/stubFilename.test.ts`                                        | 2/2 green                                             |
| `npm test -- tests/graph/mergeTechniquesSection.test.ts`                              | 7/7 green                                             |
| `npm test -- tests/graph/stubNoteCreator.test.ts`                                     | 4/4 green                                             |
| `npm test -- tests/settings-store.test.ts`                                            | 21/21 green (14 pre-existing + 7 new Phase 4 tests)   |
| **Plan-scope total**                                                                  | **36/36 tests green across 5 test files**             |
| Full repo `npm test`                                                                  | 403 tests pass; 11 test files fail (ALL out-of-scope — Wave 0 stubs targeting Plan 04-03/04-04 files that don't exist yet: KnowledgeGraphWriter, submissionHistoryClient, copyToCode, SubmissionPickerModal, SubmissionDetailModal. These were committed RED by plan 04-01 intentionally — no regression from this plan.) |
| `bash scripts/grep-no-vault-modify.sh`                                                | **PASS** — no `vault.modify` in `src/notes/` or `src/browse/` |
| Extended grep: `vault\.modify` in `src/graph/`                                        | 0 matches (StubNoteCreator uses only `vault.create` + `vault.createFolder`) |
| `npx tsc -noEmit -skipLibCheck` (src-only tsconfig)                                   | exit 0, no errors                                     |
| `npx eslint src/graph/ src/notes/NoteTemplate.ts src/settings/SettingsStore.ts`       | exit 0, zero new Required violations                  |
| `grep -c TECHNIQUES_HEADING_LINE\|buildTechniquesBlock\|buildTechniqueStubBody\|buildTechniqueFilename src/notes/NoteTemplate.ts` | 9 matches (≥5 required)                             |
| `grep -cE "autoBacklinksEnabled\|topicTags\|getTechniquesFolder" src/settings/SettingsStore.ts` | 14 matches (≥5 required)                            |
| Single-import purity in `mergeTechniquesSection.ts`                                   | exactly 1 import statement, from `../notes/NoteTemplate`; 0 runtime `vault.` / `app.` / `TFile` refs |

## Deviations from Plan

**None material.** Plan executed as written, with two small amendments worth noting:

### Rule 2 (additive) — renderSection separator discipline

Added to `mergeTechniquesSection.ts`: the render function inserts a blank line when transitioning between `link` and `free` items (but not between consecutive links). Not explicitly called out in the plan's action step, but required for idempotence: without it, a body that starts as `## Techniques\n\n- [[X]]\n\nmy free note\n` would round-trip to a different string on the second merge, breaking test 5 (`idempotent`). The invariant ships with an inline comment.

### Rule 2 (additive) — `appendNewTechniquesSection` EOF fallback

Plan L418 specifies the D-14 insertion point as "after Notes → before Custom Tests → EOF." The fallback-to-EOF case is implied but not pseudocoded; I implemented it explicitly (`insertionIndex = lines.length`). Zero behavioral difference from the plan spec.

### Worktree-path-safety note

During initial implementation I encountered the #3099 absolute-path issue: the first Write call resolved to the main repo's `src/graph/dateFormat.ts` rather than the worktree's, because the path I supplied was constructed without deriving the worktree root. I reverted the main repo's accidental edit (`git checkout -- src/notes/NoteTemplate.ts` in main, `rm -rf src/graph` in main), then re-applied all changes using worktree-root-qualified absolute paths. The worktree commits are clean; no cross-worktree leakage in the final state.

## Known Stubs

**None.** All three new files export real, fully-implemented functions with live test coverage. SettingsStore extensions are fully wired. No `TODO` / `FIXME` / placeholder returns anywhere in the created code.

## Threat Flags

**None.** This plan does not introduce new network endpoints, auth paths, or file-access patterns beyond those already scoped in the plan's `<threat_model>` block. All four STRIDE threats (T-04-02-01..T-04-02-05) are mitigated as designed:

- **T-04-02-01** (Tampering — filename): `buildTechniqueFilename('../evil')` → `'-.-.-evil.md'`, verified via `stubFilename.test.ts` forbidden-char branches.
- **T-04-02-02** (Tampering — autoBacklinksEnabled): verified via `settings-store.test.ts` "autoBacklinksEnabled shape-guard rejects non-boolean".
- **T-04-02-03** (Tampering — topicTags): verified via `settings-store.test.ts` "DetailCacheEntry.topicTags malformed entries dropped".
- **T-04-02-04** (DoS — pathological body): accepted; O(n) transform, no network.
- **T-04-02-05** (Information Disclosure — debug logs): StubNoteCreator uses `logger.debug` which routes through Phase 1's redaction pipeline; path strings are relative vault paths only.

## Self-Check

**Files created (expected 3):**

- `src/graph/dateFormat.ts` — FOUND (48 LoC)
- `src/graph/mergeTechniquesSection.ts` — FOUND (243 LoC)
- `src/graph/StubNoteCreator.ts` — FOUND (74 LoC)

**Files modified (expected 3):**

- `src/notes/NoteTemplate.ts` — FOUND (+74 LoC diff)
- `src/settings/SettingsStore.ts` — FOUND (+59 LoC diff)
- `tests/settings-store.test.ts` — FOUND (+110 LoC diff, 7 new tests)

**Commits present in worktree branch (expected 3, one per task):**

- `fa98da1` feat(04-02): add toIsoLocalTz + Technique helpers (Task 1) — FOUND
- `6beef4e` feat(04-02): add mergeTechniquesSection pure transform (Task 2) — FOUND
- `a7af302` feat(04-02): add StubNoteCreator + SettingsStore extensions (Task 3) — FOUND

**Test suites green for plan scope (expected 5 files, 36 tests):**

- `tests/graph/dateFormat.test.ts` — 2/2 pass
- `tests/graph/stubFilename.test.ts` — 2/2 pass
- `tests/graph/mergeTechniquesSection.test.ts` — 7/7 pass
- `tests/graph/stubNoteCreator.test.ts` — 4/4 pass
- `tests/settings-store.test.ts` — 21/21 pass
- **Total 36/36 green**

**Gate checks:**

- `grep-no-vault-modify.sh` — PASS
- src-only tsc — exit 0
- ESLint on touched files — exit 0

## Self-Check: PASSED
