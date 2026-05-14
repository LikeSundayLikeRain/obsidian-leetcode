---
phase: 05-polish-ship
plan: 04
subsystem: solve-run-ux
tags: [polish-07, run-modal, ephemeral-tab-store, d-01, d-02, d-03, d-05, d-06, d-07, d-08, d-09, d-10]
dependency_graph:
  requires:
    - phase-01: Plugin lifecycle (onload/onunload), registerEvent auto-detach pattern
    - phase-02: problemDetails[slug].exampleTestcases cache (D-14) — consumed as Run seed
    - phase-03: SubmissionOrchestrator, VerdictModal, interpretSolution, pollingOrchestrator, codeExtractor
    - phase-04: SubmissionHistoryStore, KnowledgeGraphWriter — untouched but keep working
    - phase-05-01: Wave 0 RED stubs (ephemeralTabStore, RunModal, run-command-registration)
    - phase-05-03: SessionExpiredNotice helper, isNetworkError, TimeoutError — error routing branches reuse them
  provides:
    - src/solve/ephemeralTabStore.ts — in-memory Map<slug, string[]> tab store (D-02, D-09)
    - src/solve/RunModal.ts — unified Run modal replacing CustomTestModal (D-03, D-05, D-06, D-07, D-10)
    - src/solve/runCommandRegistration.ts — registerRunCommand helper used by main.ts (D-01)
    - Plugin.ephemeralTabs field + lifecycle (constructed in onload, disposed in onunload)
    - Plugin.runFromActive + openRunModalWithSeedAppended methods
  affects:
    - src/main.ts — 2 addCommand deletions + 1 helper call + 3 helper deletions + 2 new methods
    - styles.css — .leetcode-custom-test block replaced by .leetcode-run block (71-line swap)
    - src/graph/mergeTechniquesSection.ts — doc comment scrub (CaseRegion refs removed)
    - src/notes/NoteTemplate.ts — doc comment scrub (CaseRegion refs removed)
tech_stack:
  added: []
  patterns:
    - "RESEARCH §Pattern 4 — layout-change + active-leaf-change + ref-count wipe (replaces the non-existent workspace.on('file-close') assumption)"
    - "RESEARCH §Pitfall 2 compliance — Wave 0 test drives reconcile via fakeWorkspace.setLeaves([]) + fire('layout-change'); runtime uses the same event bus"
    - "Thin registration helper (registerRunCommand) + plugin-method delegation (openRun hook) so Wave 0 unit test can drive command set without instantiating Plugin"
    - "store.getOrSeed + store.setTabs round-trip for D-25 'Copy failing testcase' affordance — ZERO vault interaction, preserves D-08 ignore-legacy"
key_files:
  created:
    - src/solve/ephemeralTabStore.ts
    - src/solve/RunModal.ts
    - src/solve/runCommandRegistration.ts
  modified:
    - src/main.ts
    - styles.css
    - src/graph/mergeTechniquesSection.ts
    - src/notes/NoteTemplate.ts
  deleted:
    - src/solve/CustomTestModal.ts
    - src/solve/customTestStore.ts
    - src/solve/CaseRegion.ts
    - tests/solve/customTestStore.test.ts
    - tests/solve/CaseRegion.test.ts
decisions:
  - "Kept `string[]` as the tab-state shape (not the plan-sketched `TabState[]` with `{input: string}` wrapper). The Wave 0 stub test drives with plain string arrays; a wrapper would fail the contract without buying any extension. Can be promoted to TabState[] later if extra fields appear (cursor position, last-run result)."
  - "Extracted registerRunCommand into its own helper file instead of inlining in main.ts per the Wave 0 stub's own comment: `If Plan 04 lands the wiring inline in main.ts instead, extract a small helper so this test has a focused unit to drive.` main.ts calls it with a {settings, openRun} deps bag; openRun lambdas into `this.runFromActive()`."
  - "Distinct CSS class prefix `.leetcode-run` (not `.leetcode-custom-test`) — the Wave 0 RunModal test selectors assert `.leetcode-run-tab`, `.leetcode-run-reset`, `.leetcode-run-submit`, `.leetcode-run-tab-delete`. Old Phase 3 CSS block deleted wholesale, replaced with the new block + the D-10 `.leetcode-run-modal .leetcode-run-footer` space-between rule."
  - "`+` add-tab button uses `.leetcode-run-tab-add` ONLY (not `.leetcode-run-tab .leetcode-run-tab-add`). Wave 0 test counts `.leetcode-run-tab` elements and expects `tabs.length === N` (no add button inflating the count)."
  - "openRunModalWithSeedAppended (new helper for D-25 'Copy failing testcase') uses `store.getOrSeed + store.setTabs([...existing, seed])` instead of directly opening RunModal with a modified state, so the in-memory store stays the single source of truth and the modal opens cleanly."
  - "NO activation to keep the `## Custom Tests` heading constants alive — `CUSTOM_TESTS_HEADING_LINE` + `CASE_HEADING_PREFIX` still live in NoteTemplate.ts because `src/graph/mergeTechniquesSection.ts` uses `CUSTOM_TESTS_HEADING_LINE` to choose an insertion point when ## Notes is absent. Removing them would regress the Phase 4 Techniques placement logic. Only the comment referring to `CaseRegion.writeCases` was scrubbed."
metrics:
  duration: "~45 minutes"
  completed_date: 2026-05-10
  tasks_completed: 3
  tasks_total: 3
  commits: 3
  line_delta: "+420 / -921 (net −501 lines, reflects the D-01 consolidation + custom-test persistence deletion)"
  tests_turned_green: 12 (5 ephemeralTabStore + 5 RunModal + 2 run-command-registration)
---

# Phase 5 Plan 04: Run UX Rework Summary

POLISH-07 shipped: single unified `LeetCode: Run` command replaces the two Phase 3 commands
(`run-sample`, `run-custom`), custom-test persistence to `## Custom Tests` is removed entirely,
tabs live in an in-memory `EphemeralTabStore` keyed by `lc-slug`, and the store wipes a slug's
state when no markdown leaf still shows the note. Reset button re-seeds from LC's
`exampleTestcases`; Run sends only the active tab's input to `/interpret_solution/`.

## Commits

| Task | Name | Commit | Files |
| --- | --- | --- | --- |
| 1 | EphemeralTabStore (D-02/D-09) | `5bfd225` | src/solve/ephemeralTabStore.ts (NEW, 153 lines) |
| 2 | RunModal + CSS (D-03..D-10) | `f571c5d` | src/solve/RunModal.ts (NEW, 232 lines), styles.css (+36/-46) |
| 3 | main.ts rewire + 3 deletions (D-01) | `36be135` | src/main.ts (+53/-85), src/solve/runCommandRegistration.ts (NEW, 64 lines), 3 src deletions, 2 test deletions, 2 doc-comment scrubs |

Task 1's commit was amended once (before being pushed into the session log) to scrub the literal string `file-close` from a doc comment so the Pitfall-2 grep gate reports zero hits.

## Grep-Verification Transcript

```
== STRICT gates (counts across src/ + tests/) ==
CustomTestModal          → 0
writeCasesToVault        → 0
readCasesFromVault       → 0
CaseRegion               → 0
'run-sample' in src/     → 0
'run-custom' in src/     → 0
file-close in src/solve/ → 0

== Positive anchors ==
EphemeralTabStore in src/main.ts           → 5  (import, field decl, ctor, dispose, field doc)
registerRunCommand in src/main.ts          → 1  (single call site)
id: 'run' in src/solve/runCommandRegistration.ts → 1
workspace.on('layout-change')             → 1 site in ephemeralTabStore.ts
workspace.on('active-leaf-change')        → 1 site in ephemeralTabStore.ts
plugin.registerEvent                      → 2 calls (one per event subscription)
```

`grep -rn "'run-sample'\|'run-custom'" src/ tests/` returns 2 hits, BOTH in
`tests/solve/run-command-registration.test.ts` as the Wave 0 stub's
`expect(staleIds).not.toContain(...)` anchors. These are intentional — they prove the gate is
asserted against, not violated.

## Line-Count Delta in main.ts

Before Task 3: `933` lines (per `wc -l src/main.ts` prior to the edit).
After Task 3: `897` lines.

Net change: **−36 lines** in main.ts alone. Three helpers deleted (`runSampleFromActive`,
`openCustomTestModalFromActive`, `openCustomTestModalWithSeeded`) and two helpers added
(`runFromActive`, `openRunModalWithSeedAppended`). Two `addCommand` blocks deleted (`run-sample`,
`run-custom`) and replaced with one `registerRunCommand(this, {...})` call. Field +
construction + dispose added for `ephemeralTabs`. Four stale comments scrubbed.

Across the whole plan: `+420 insertions / -921 deletions = net −501 lines`, reflecting the
magnitude of Phase 3's custom-test persistence machinery (CaseRegion parse/write + vault I/O
wrappers) that D-01 + D-08 removes.

## Wave 0 Stubs Turned GREEN

| Stub | Tests | Status |
| --- | --- | --- |
| `tests/solve/ephemeralTabStore.test.ts` | 5 | ✓ all GREEN |
| `tests/solve/RunModal.test.ts` | 5 | ✓ all GREEN |
| `tests/solve/run-command-registration.test.ts` | 2 | ✓ all GREEN |

12 stubs flipped green — the remaining RED Wave 0 stub is `tests/main/codeActionsPostProcessor.test.ts`
which is owned by Plan 05-05 (per 05-01-SUMMARY.md's "Plan 04/05" ownership table).

## Overall Test Suite

- **Before Task 1** (baseline from 05-03 landing): 462 passing / 4 RED Wave 0 stubs pending (ephemeralTabStore, RunModal, runCommandRegistration, codeActionsPostProcessor).
- **After Task 3**: **456 tests passing / 77 test files passing / 1 failed file** (codeActionsPostProcessor — module-not-found; owned by Plan 05-05). 12 tests net added (5+5+2 Wave 0 stubs turned green), 7 tests removed (3 customTestStore + 4 CaseRegion tests deleted with their module).
- `npx tsc --noEmit` clean for every `src/` file; test-file errors are confined to the 4 pre-existing Wave 0 stubs (SessionExpiredNotice TS18048, RunModal TS2532 index, codeActionsPostProcessor TS2307 module-not-found, all of which exist in their own Wave 0 headers — not introduced here).
- `npm run lint` total **112 errors + 22 warnings** — DOWN from 131 + 23 at the 05-03 landing (net −19 errors, −1 warning). My deletion of CustomTestModal + customTestStore + CaseRegion removed lint debt; no new lint regressions introduced by my three new source files. The 8 `unused eslint-disable directive` warnings in main.ts are pre-existing (attached to unrelated `activateBrowser` / `Notice` call sites untouched by this plan).

## `tsc --noEmit` Dead-Code Residue

Zero dead-code residue introduced. All three deleted-file symbols (`CustomTestModal`, `CustomTestCase`, `readCasesFromVault`, `writeCasesToVault`, `readCases`, `writeCases` from `customTestStore`, `readCases`, `writeCases` from `CaseRegion`) had exactly-zero callers after main.ts's rewire — verified via `grep -rn` and `tsc --noEmit` both before and after the `rm` calls.

## Deviations from Plan

### Rule 1 — Auto-fix bug

**1. [Rule 1 – Bug] RunModal test expected the `+` add-tab button NOT to be counted as a tab**

- **Found during:** Task 2 verification (first `npx vitest run tests/solve/RunModal.test.ts` after writing RunModal.ts).
- **Issue:** Test `expect(tabButtons.length).toBe(3)` expected 3 real tabs; my renderTabs implementation gave the `+` button both `.leetcode-run-tab` and `.leetcode-run-tab-add` classes (copied from Phase 3's CustomTestModal pattern where the test never asserted this distinction). The querySelectorAll('.leetcode-run-tab') returned 4.
- **Fix:** Dropped `.leetcode-run-tab` from the add button; kept only `.leetcode-run-tab-add`. Added a new CSS selector `.leetcode-run .leetcode-run-tab, .leetcode-run .leetcode-run-tab-add` so both share the chip styling.
- **Files modified:** `src/solve/RunModal.ts`, `styles.css`
- **Commit:** `f571c5d` (applied before first commit of Task 2; no amend).

### Rule 2 — Auto-add missing critical functionality

**2. [Rule 2 – Completeness] `getTabs(slug)` method required by Wave 0 test but not in plan skeleton**

- **Found during:** Task 1 first-pass test run.
- **Issue:** The plan skeleton's `EphemeralTabStore` interface listed `getOrSeed / setTabs / resetToSamples / reconcile / dispose`. The Wave 0 stub additionally asserts `store.getTabs('two-sum')` at line 74 (`expect(store.getTabs('two-sum')).toEqual(...)`). Without the method the test import would compile but the assertion would fail with `getTabs is not a function`.
- **Fix:** Added `getTabs(slug): string[] | null` — returns a defensive copy of the stored array, or `null` when no state exists (disambiguates empty-array "last tab deleted" from absent-slug).
- **Files modified:** `src/solve/ephemeralTabStore.ts`
- **Commit:** `5bfd225`

**3. [Rule 2 – Completeness] `openRunModalWithSeedAppended` helper for VerdictModal D-25 affordance**

- **Found during:** Task 3 rewire (reading main.ts's submitFromActive branch that references `onCopyFailingInput: (input) => { void this.openCustomTestModalWithSeeded(input); }`).
- **Issue:** Plan listed the deletion of `openCustomTestModalWithSeeded` but did not spell out its replacement. Without a replacement the "Copy failing testcase" affordance in VerdictModal (D-25 from Phase 3) would call a deleted method → runtime crash.
- **Fix:** Added `openRunModalWithSeedAppended(seedInput)` which pre-seeds the store via `getOrSeed + setTabs([...existing, seedInput])` then opens RunModal. The seed appears as the last tab; RunModal's onOpen sees it through `store.getOrSeed`.
- **Files modified:** `src/main.ts`
- **Commit:** `36be135`

### Rule 3 — Auto-fix blocking issue

**4. [Rule 3 – Blocking] `workspace.on('file-close')` literal string in doc comment tripped the Pitfall-2 grep gate**

- **Found during:** Task 1 commit verification (`grep -c "file-close"` returned 1).
- **Issue:** My file-header doc comment included `workspace.on('file-close', …)` as illustrative text describing the pitfall being avoided. The Pitfall 2 grep gate (`grep -rn "workspace.on('file-close'" src/`) is specified by the plan as strict "0 matches" — even comments count against it.
- **Fix:** Rewrote the comment to describe the absent event without using the literal string (`"Obsidian 1.12.3 has no dedicated 'leaf was closed' Workspace event"`).
- **Files modified:** `src/solve/ephemeralTabStore.ts`
- **Commit:** `5bfd225` (amended once; amendment confined to doc-comment text, no behavior change).

**5. [Rule 3 – Blocking] Scrub trailing `CaseRegion` / `CustomTestModal` / `writeCasesToVault` / `readCasesFromVault` comment references**

- **Found during:** Task 3 grep verification (`grep -rn "CaseRegion" src/ tests/` returned 4 hits post-deletion — all in doc comments in `mergeTechniquesSection.ts` (3) and `NoteTemplate.ts` (1)).
- **Issue:** Plan's grep gates mandate `0 hits` for these patterns. Even though the references were only architectural pointers in comments ("analogous to CaseRegion.ts", "lazy-created by CaseRegion.writeCases"), they would keep failing future automated gate runs.
- **Fix:** Scrubbed 4 comment references across 2 files. Replaced with neutral prose that keeps the original documentation intent without pointing to deleted modules. Same scrub applied to RunModal.ts and main.ts self-references.
- **Files modified:** `src/graph/mergeTechniquesSection.ts`, `src/notes/NoteTemplate.ts`, `src/main.ts`, `src/solve/RunModal.ts`
- **Commit:** `36be135`

### Rule 4 — Architectural changes

None. The plan's architecture (in-memory Map, layout-change reconciliation, helper extraction for command registration) matched the Wave 0 stubs precisely; no structural surprises.

## Authentication Gates

None. This plan is pure UI + wiring — no new network surface, no new credential usage. The
existing RunModal onRun pipeline routes into the pre-existing `runInterpretedInput` helper
(Phase 3) which already handles SessionExpiredError via Phase 5 Plan 03's
`showSessionExpiredNotice` helper (unchanged by this plan).

## Known Stubs

None introduced. The only persistent RED test file after this plan is
`tests/main/codeActionsPostProcessor.test.ts` — a Wave 0 stub owned by Plan 05-05 (per
05-01-SUMMARY.md's ownership table). It asserts against a module Plan 05-05 will create.

## Threat Flags

None. The plan's `<threat_model>` enumerated four threat IDs (T-05-04-01..04); none produced
a `mitigate` disposition — all were `accept`. No new trust-boundary crossings introduced by
the implementation (the user test input is still forwarded verbatim to LC per T-05-04-01;
the ephemeral Map is still bounded by the number of distinct lc-slug notes the user opens
per T-05-04-02; reconcile is still synchronous over a snapshot per T-05-04-04).

## Self-Check: PASSED

Created files:

- FOUND: src/solve/ephemeralTabStore.ts
- FOUND: src/solve/RunModal.ts
- FOUND: src/solve/runCommandRegistration.ts

Deleted files (negative self-check):

- DELETED: src/solve/CustomTestModal.ts
- DELETED: src/solve/customTestStore.ts
- DELETED: src/solve/CaseRegion.ts
- DELETED: tests/solve/customTestStore.test.ts
- DELETED: tests/solve/CaseRegion.test.ts

Commits:

- FOUND: 5bfd225 (Task 1 — EphemeralTabStore)
- FOUND: f571c5d (Task 2 — RunModal + CSS)
- FOUND: 36be135 (Task 3 — main.ts rewire + deletions)

Strict grep gates (src/ + tests/, 0 hits expected):

- PASS: `CustomTestModal` → 0 hits
- PASS: `writeCasesToVault` → 0 hits
- PASS: `readCasesFromVault` → 0 hits
- PASS: `CaseRegion` → 0 hits
- PASS: `'run-sample'` in src/ → 0 hits
- PASS: `'run-custom'` in src/ → 0 hits
- PASS: `file-close` in src/solve/ephemeralTabStore.ts → 0 hits

Wave 0 stubs owned by this plan:

- GREEN: tests/solve/ephemeralTabStore.test.ts (5/5)
- GREEN: tests/solve/RunModal.test.ts (5/5)
- GREEN: tests/solve/run-command-registration.test.ts (2/2)

Overall test suite: 77/78 test files pass, 456/456 tests pass (1 unresolvable file is a Plan-05-05-owned Wave 0 stub — intentional Nyquist RED per 05-01-SUMMARY.md).
