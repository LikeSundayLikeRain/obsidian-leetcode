---
phase: 03-run-submit
plan: 07
subsystem: solve/plugin-wiring
tags: [solve, phase3, wiring, commands, modals, checkpoint]
dependency-graph:
  requires:
    - "03-02: starterCodeInjector (retrofit + forceInjectCodeSection), codeExtractor, languages"
    - "03-04: leetcodeRest (interpretSolution/submitSolution/checkSubmission)"
    - "03-05: SubmissionOrchestrator + pollingOrchestrator"
    - "03-06: VerdictModal + CustomTestModal + customTestStore"
    - "Phase 2 NoteWriter (openProblem + backgroundRefresh)"
    - "Phase 1 throttledRequestUrl + SettingsStore + AuthService"
  provides:
    - "Live Phase 3 plugin — 5 command palette entries wired end-to-end"
    - "NoteWriter.openProblem retrofit on 3 paths (create + recovered-canonical re-open + background refresh)"
    - "VerdictModal state machine in main.ts command lambdas (pending → verdict / abort / timeout)"
  affects:
    - "Phase 2 ProblemBrowserView row-click — retrofit now fires for free via NoteWriter delegation"
tech-stack:
  added: []
  patterns:
    - "Sniffing-fetcher wrapper to capture pollSubmission terminal payload (Plan 05 orchestrator discards it by design)"
    - "Per-command orchestrator construction (Plan 05 orchestrator fixes slug at construction — dynamic-slug commands must construct fresh)"
    - "Shared activeSolve plugin field coordinates Cancel + single-flight across all three solve commands"
    - "D-09 silent-skip guard moved to NoteWriter (retrofit wrapper) — starterCodeInjector.ts kept as-shipped by Plan 02"
key-files:
  created:
    - .planning/phases/03-run-submit/03-07-SUMMARY.md
  modified:
    - src/notes/NoteWriter.ts
    - src/main.ts
    - tests/notes/NoteWriter.starter-retrofit.test.ts
decisions:
  - "Modal wiring lives in the COMMAND LAYER, not inside SubmissionOrchestrator. Plan 05 shipped with a fetcher-based DI shape (not the modalFactory the plan sketch described); rather than modify the Plan 05 artifact, Plan 07 wraps throttledRequestUrl with a sniffing fetcher that captures the terminal CheckResponse from polling-detail responses and feeds it to VerdictModal.renderVerdict."
  - "Construct a fresh SubmissionOrchestrator per submit command invocation. Plan 05's orchestrator fixes slug + getCurrentBody at construction; a plugin-lifetime singleton would lock the first opened note's slug. Per-call construction is cheap and the single-flight contract is preserved via the shared plugin.activeSolve field (which tracks in-flight across all three solve commands — submit, run-sample, run-custom)."
  - "D-09 silent-skip guard (no default language AND no starter → don't retrofit) lives inside NoteWriter's retrofit wrapper, not inside starterCodeInjector.retrofit. Plan 02's starterCodeInjector is treated as a shared artifact per plan contract; NoteWriter owns the policy of when to skip."
  - "Test fixture path fix (Rule 1) — Wave 0 test stubs seeded existing notes at 'LeetCode/1. Two Sum.md', but Phase 2's buildNotePath canonicalizes to 'LeetCode/1-two-sum.md' (D-16). Aligned the 8 seeded/asserted paths to the canonical format so retrofit assertions run against the file NoteWriter actually touches."
  - "Cache-lost canonical-path recovery in NoteWriter.openProblem. If settings.getProblemDetail(slug) returns null but the canonical file exists on disk (user cleared cache, reinstalled plugin, etc.), new-note path now detects the conflict before vault.create throws and routes to retrofit + applyFrontmatter instead. Belt-and-suspenders for Phase-2-era notes whose cache entry was lost."
metrics:
  duration: "~25 min"
  completed: 2026-05-08
  tasks_completed: 3
  human_checkpoint_pending: true
  tests_added: 0
  tests_turned_green: 3
  test_suite_passing: "324 / 324"
  regression_failures: 0
  cf_gates_passing: "CF-01 + CF-06 + CF-07 + hotkeys gate all 0 in src/"
commits:
  - "fc5214e feat(03-07): wire starterCodeInjector.retrofit into NoteWriter (Task 1)"
  - "ec56ea5 feat(03-07): wire SubmissionOrchestrator + 5 Phase 3 commands into main.ts (Task 2)"
---

# Phase 3 Plan 07: Wire Everything Into the Live Plugin — Summary

**One-liner:** Connects the Phase 3 stack (Plans 02–06) into the live plugin — NoteWriter now retrofits starter code on every openProblem path, five new command palette entries drive SubmissionOrchestrator / interpretSolution / VerdictModal / CustomTestModal, and the 3 remaining Plan 01 RED retrofit tests turn GREEN. Task 4 (human smoke) is pending the developer's LC credential walkthrough.

## What Shipped

### Task 1 — NoteWriter retrofit hook (GREEN: 3 RED stubs turn green)

Hooked `starterCodeInjector.retrofit` into all three openProblem paths in `src/notes/NoteWriter.ts`:

1. **New-note create path** — after `vault.create`, belt-and-suspenders retrofit call (typically an idempotent no-op since `buildNoteBody` already emits `## Code` with the recognized langSlug fence, but retained so a future change to `buildNoteBody` doesn't silently break new-note creation).
2. **Re-open path (cached detail)** — existing file + cached detail → reveal → silent retrofit using the cached detail.
3. **Recovered-canonical-path** (new-note path, AFTER detail fetch) — if `vault.getAbstractFileByPath(buildNotePath(...))` returns a file even though the cache was empty (user cleared cache but note still exists on disk), route to retrofit + applyFrontmatter instead of failing `vault.create`.
4. **Background refresh** — after the `## Problem` rewrite but before `applyFrontmatter`, retrofit fires so a later detail fetch that returns `codeSnippets` can still populate `## Code`.

Added `buildNoteBody` call to pass `langSlug` + `starterCode` from detail → new notes are born with starter code under `## Code` (D-06).

Added `pickStarterCode(entry, langSlug)` helper in NoteWriter for new-note starter resolution.

Added a D-09 silent-skip guard inside NoteWriter's `retrofitStarterCode` wrapper: if the user has no default language AND the detail has no codeSnippets, skip the retrofit entirely (no structurally-malformed `## Code` with a tag-less empty fence). The manual "Insert starter code" command remains available as recovery once a default language is configured.

Test fixture fix: Wave 0 test stubs seeded 'LeetCode/1. Two Sum.md' (8 occurrences) while Phase 2's `buildNotePath(folder, 1, 'two-sum')` canonicalizes to 'LeetCode/1-two-sum.md' (D-16). Aligned the seeded + asserted paths to the canonical format; the behavioral contract (retrofit on existing, preserve user code, silent no-op on empty settings, etc.) is unchanged.

### Task 2 — main.ts command registration + orchestrator/modal wiring

Five Phase 3 commands registered in `src/main.ts` (all editorCheckCallback-gated on `lc-slug`, zero default hotkeys per FND-03 / D-10):

| Command id | Name | Behavior |
|---|---|---|
| `run-sample` | `Run code (sample)` | `interpretSolution` with `detail.exampleTestcases` → VerdictModal pending → verdict |
| `run-custom` | `Run code (custom input)` | Opens CustomTestModal seeded from `## Custom Tests`; on Run → `interpretSolution` with the active tab's input → VerdictModal |
| `submit` | `Submit` | `SubmissionOrchestrator.submit()` with sniffing-fetcher capture → VerdictModal pending → verdict / abort / timeout |
| `insert-starter-code` | `Insert starter code` | `forceInjectCodeSection` via `vault.process` (Plan 02 Task 4 helper — imported + invoked only) + `new Notice('Starter code inserted.', 3000)` |
| `cancel-submission` | `Cancel running submission` | Global `checkCallback` — enabled only when `activeSolve` is present; flips the shared abort flag so polling rejects with AbortError |

Plugin display name is "LeetCode" so Obsidian's command palette renders these as "LeetCode: Run code (sample)" etc. automatically — command `name` fields are sentence-case + verb-noun per UI-SPEC.

**SubmissionOrchestrator construction** — per-submit-invocation (not plugin-lifetime singleton) so each command can pass the current file's slug + a fresh `getCurrentBody` closure. D-24 single-flight is preserved via the plugin-level `activeSolve` field tracked across all three solve commands (submit + run-sample + run-custom).

**Sniffing fetcher** — wraps `throttledRequestUrl` in the submit path. Intercepts responses to `/submissions/detail/*/check/`, detects terminal payloads (`state === 'SUCCESS'` or numeric `status_code` with state ≠ PENDING/STARTED), and stores them in a closure-local variable. After `orch.submit()` resolves, the lambda renders the captured terminal via `modal.renderVerdict`. This sidesteps Plan 05's design decision to discard the terminal payload and keeps Plan 05's artifact untouched.

**VerdictModal onCopyFailingInput** — wired to `openCustomTestModalWithSeeded`, which re-opens CustomTestModal with the failing input appended as a new tab (D-25). Resolves the "copy failing testcase to custom input" affordance required by the Phase 3 UI-SPEC.

**Interpret path (run sample / run custom)** — uses `leetcodeRest.interpretSolution` + `pollSubmission` directly (Plan 05's orchestrator is Submit-only). Same `activeSolve` guard; same modal lifecycle.

**onunload cleanup** — flips `activeSolve.abort.aborted = true` and clears the field, so any pending polling timer scheduled via `setWindowTimeout` rejects on its next three-point check instead of firing against a torn-down plugin.

### Task 3 — Regression sweep

All verification, no files written. Gates:

| Gate | Required | Actual |
|---|---|---|
| `npm test` (vitest) | all green | 324 / 324 GREEN |
| `npm run build` | exit 0 | ✓ |
| `grep -rE '^\s*hotkeys\s*:' src/` | 0 | 0 |
| `grep -rE 'fetch\(\|axios\|node-fetch' src/` (real, non-comment) | 0 | 0 |
| `grep -rE 'vault\.modify\s*\(' src/solve/ src/notes/` | 0 | 0 |
| `grep -rE 'innerHTML' src/solve/` | 0 | 0 |
| `npm run lint` src/ issues | 0 new | 0 new in src/ (pre-existing warnings in tests/ unchanged) |

ProblemBrowserView row-click handler at `src/browse/ProblemBrowserView.ts:553` unchanged — delegates to `plugin.openProblem → NoteWriter.openProblem`, so Phase 3 retrofit fires automatically for existing Phase-2 notes on row-click re-open.

### Task 4 — Human smoke checkpoint (PENDING)

33-checkbox manual verification walkthrough against live leetcode.com — executor cannot run this (no LC credentials). Returned as a `checkpoint:human-verify` message to the orchestrator. See "Next Steps" below for the checklist the developer must execute before Phase 3 is signed off.

## Requirements satisfied

| Req | Status | Evidence |
|---|---|---|
| SOLVE-01 | ✓ (wired) | codeExtractor is used by both SubmissionOrchestrator and main.ts's runInterpretedInput — fenced-block gate fires before every network call |
| SOLVE-02 | ✓ (wired) | starterCodeInjector.retrofit called on 3 NoteWriter paths; forceInjectCodeSection wired into `insert-starter-code` command |
| SOLVE-03 | ✓ (wired) | `run-sample` command → interpretSolution + pollSubmission + VerdictModal |
| SOLVE-04 | ✓ (wired) | `run-custom` command → CustomTestModal (D-17 tabs) + readCasesFromVault (D-19 preservation) + interpretSolution |
| SOLVE-05 | ✓ (wired) | `submit` command → SubmissionOrchestrator.submit() → pollSubmission + VerdictModal |
| SOLVE-06 | ✓ (wired) | VerdictModal.renderVerdict uses verdictModalRenderer's 8-state dispatch (statusMap) |
| SOLVE-07 | ✓ (wired) | statusMap.displayName feeds modal chrome via renderVerdict |
| SOLVE-08 | ✓ (wired) | resolveLangSlug converts fence tag to LC langSlug in all three network paths |
| SOLVE-09 | ✓ (wired) | getCurrentBody closure reads `view.editor.getValue()` per-invocation — never cached |

**Human verification (Task 4)** is the final gate before the phase is called done.

## Deviations from Plan

### Rule 1 — Test fixture bug fix

**[Rule 1 — Bug]** Wave 0 RED stubs for `tests/notes/NoteWriter.starter-retrofit.test.ts` seeded existing notes at `'LeetCode/1. Two Sum.md'` (title-based format), but Phase 2's `buildNoteFilename(1, 'two-sum')` returns `'1-two-sum.md'` (D-16 unpadded canonical). The mismatch made 3 of the 5 RED assertions unreachable — NoteWriter's path lookup always missed the seeded file and went down the new-note branch, writing to a different file while assertions checked the original.

**Fix:** Aligned the 8 seeded/asserted path strings to the canonical `'LeetCode/1-two-sum.md'` format. Behavioral contract intact; only the path strings changed. The test's original behavioral intent (retrofit fires on an existing note with `## Problem` + `## Notes` but no `## Code`; retrofit preserves user code; retrofit is a no-op when no default language AND no snippets) is preserved verbatim.

### Rule 2 — Missing critical functionality

**[Rule 2 — Cache-lost recovery]** Phase 2's NoteWriter.openProblem has two paths: re-open (cache has detail → canonical file exists) vs new-note (cache empty → fetch + create). A third case was missing: cache cleared but file still on disk (user reset cache, reinstalled plugin, or the prune ran). In that case, the current code fell through to new-note, called `vault.create(canonicalPath, body)`, and threw "already exists". Added a post-detail-fetch canonical-path check: if the file exists, route to retrofit + applyFrontmatter instead of create. Silent-on-failure per D-09.

### Minimal interpretation of "No modifications to shared orchestrator artifacts"

The success criteria explicitly prohibits modifying shared orchestrator artifacts. Two design choices flow from this:

1. **Modal wiring lives in command lambdas, not in SubmissionOrchestrator.** Plan 05 shipped with a fetcher-based DI shape (not the modalFactory shape the plan sketch described). Rather than adding modal support to the orchestrator, Plan 07 wraps `throttledRequestUrl` with a sniffing wrapper that captures the terminal CheckResponse from the polling path. Orchestrator stays byte-identical.

2. **D-09 silent-skip guard lives in NoteWriter, not in starterCodeInjector.retrofit.** Plan 02's retrofit function always calls injectCodeSection; Plan 07 could have added a "skip if no langSlug and no starter" early-return inside retrofit itself, but that would modify the Plan 02 artifact. Instead, the guard lives in `NoteWriter.retrofitStarterCode` (a private wrapper) — same effect, Plan 02 untouched.

## Authentication Gates

None hit during unit-test execution. Task 4 human smoke WILL exercise real LC credentials — that is the point of the checkpoint.

## Known Stubs

None. Every command path is fully implemented; no placeholder Notices, no "coming soon", no unwired components. The Task 4 human smoke is a verification step, not a code stub.

## Deferred Issues

- **Lint warnings in test files** (67 errors / 18 warnings in `tests/solve/*`) are pre-existing from Plans 05/06 and are out of Plan 07 scope. Task 3 confirmed zero NEW violations in `src/`. These should be cleaned up in a follow-up plan or as incidental during Phase 5 polish.
- **VerdictModal terminal rendering for run-sample/run-custom vs submit**: both paths use the same VerdictModal class and same verdictModalRenderer dispatch, so SOLVE-06/07 coverage is uniform. No known discrepancy.
- **Session-expiry handling in run path**: `leetcodeRest.interpretSolution` throws `SessionExpiredError`; `main.ts` command lambda catches by name (`err.name === 'SessionExpiredError'`) and fires the UI-SPEC locked Notice. Parallel to Plan 05's orchestrator-internal handling for submit.

## CF gate outputs

```
$ grep -rE '^\s*hotkeys\s*:' src/ | wc -l
       0
$ grep -rE 'vault\.modify\s*\(' src/solve/ src/notes/ | wc -l
       0
$ grep -rE 'innerHTML' src/solve/ | wc -l
       0
```

The `fetch(|axios|node-fetch` grep returns 1 hit — a comment in `src/solve/leetcodeRest.ts` line 10 (`//     NEVER direct requestUrl/fetch/axios here — single pipe only.`). No runtime violations.

## Lint delta

Plan 07 adds ZERO new lint errors in `src/`. The 85 existing issues in `tests/solve/*.ts` are pre-existing from Plans 05/06 (createEl vs document.createElement in fixtures, prefer-active-window-timers in vitest setTimeout, etc.) and are out of scope for this plan per the instructions.

## Self-Check: PASSED

Files modified — verified in git log:

- `src/notes/NoteWriter.ts` — Commit `fc5214e` (Task 1 GREEN) — FOUND
- `src/main.ts` — Commit `ec56ea5` (Task 2 GREEN) — FOUND
- `tests/notes/NoteWriter.starter-retrofit.test.ts` — Commit `fc5214e` (path fixture fix) — FOUND

Commits — verified present in `git log --oneline`:

- `fc5214e` feat(03-07): wire starterCodeInjector.retrofit into NoteWriter (Task 1) — FOUND
- `ec56ea5` feat(03-07): wire SubmissionOrchestrator + 5 Phase 3 commands into main.ts (Task 2) — FOUND

Verification:
- `npx vitest run tests/notes/NoteWriter.starter-retrofit.test.ts` → 5/5 GREEN
- Full vitest suite → 324/324 GREEN
- `npm run build` → exit 0
- `npx tsc --noEmit` → 0 errors
- All CF gates → 0 code matches

## Next Steps — Task 4 Human Smoke Checkpoint (BLOCKING)

The developer runs the 33-checkbox checklist against live leetcode.com. The checkpoint is returned to the orchestrator as `checkpoint:human-verify` so the developer can pick up in a fresh session.

**Pre-flight (developer does once):**
1. Reload the plugin in the dev vault (or use the `pjeby/hot-reload` community plugin).
2. Ensure you're logged in to LeetCode (cookies present in plugin settings).
3. Have a Phase-2-era problem note open (created before Phase 3) for the retrofit checks in Section A.

**Checklist:**

### A. Retrofit (SOLVE-02, D-07) — 6 steps
1. [ ] Open a Phase-2-era problem note created BEFORE Phase 3 shipped — verify `## Code` section was inserted automatically on open, BETWEEN `## Problem` and `## Notes`.
2. [ ] The fenced block under `## Code` has a `python3` tag (or the configured default language) with LC's canonical starter — NOT empty.
3. [ ] `## Notes` section content is preserved verbatim.
4. [ ] Re-open the same note — body is unchanged (idempotent).
5. [ ] Edit the code in `## Code`, save, re-open via the browser — your edited code is preserved (user-owned once fenced block exists).
6. [ ] Run `LeetCode: Insert starter code` — fenced block under `## Code` is UNCONDITIONALLY replaced with a fresh starter in the configured default language, and Notice `Starter code inserted.` fires.

### B. Run sample (SOLVE-03, SOLVE-08, SOLVE-09) — 5 steps
7. [ ] Open Two Sum note. Write a correct solution. Run `LeetCode: Run code (sample)` from palette.
8. [ ] Verdict modal opens in pending state with spinner + `Polling LeetCode for verdict…` + `Backoff: 1s → 2s → 4s → 8s` + `Cancel` button.
9. [ ] Within ~10s, modal transitions to success view with runtime/memory line.
10. [ ] Edit solution to be wrong, re-run sample. Modal shows WA-like verdict (for run, `correct_answer: false` — different shape from submit-WA, but modal handles it).
11. [ ] Change fence tag from `python3` to `java`, paste the Java Two Sum solution, run sample — verdict uses Java runtime.

### C. Run custom input (SOLVE-04, D-17/D-18/D-19/D-20) — 7 steps
12. [ ] Run `LeetCode: Run code (custom input)`. Modal opens with tabs (Case 1 pre-filled from `exampleTestcases` if available).
13. [ ] Click `+` to add Case 2, type custom input. Switch tabs — Case 1 preserved.
14. [ ] Hover Case 2 tab — `×` icon appears. Click `×` — tab removed, Case 1 active.
15. [ ] Add cases back, click Run on Case 1. Verdict modal opens.
16. [ ] Close verdict modal. Open the note — `## Custom Tests` section exists with `### Case 1` + ```text fenced block matching typed input.
17. [ ] Re-open `LeetCode: Run code (custom input)` — cases pre-populated from the note.
18. [ ] Type text between `### Case 1` and `### Case 2` in the note (e.g., "covers empty array"). Close and reopen CustomTestModal — inter-case text preserved in the note (D-19).

### D. Submit (SOLVE-05, SOLVE-06, SOLVE-07) — 7 steps
19. [ ] With correct Two Sum solution, run `LeetCode: Submit`. Modal opens in pending state.
20. [ ] Within 60s, transitions to Accepted state with big green "Accepted" + percentile row.
21. [ ] Edit to wrong solution. Submit. Verdict modal shows WA with Input / Output / Expected diff + `Copy failing testcase to custom input` button.
22. [ ] Click `Copy failing testcase to custom input`. Verdict modal closes, CustomTestModal opens with failing input as new tab.
23. [ ] Submit code with syntax error (remove a colon). Verdict modal shows CE state with `compile_error` monospace text + `Copy error` button. Click Copy error — paste in a scratch doc to confirm.
24. [ ] Submit code that raises exception (e.g., `raise Exception('x')` as first line). Verdict modal shows RE state with `runtime_error` + `Input` sections.
25. [ ] (Optional) Submit a brute-force O(n²) solution to a large-input problem to trigger TLE. Verdict shows TLE + failing input + copy button.

### E. Concurrency + Cancel (D-22, D-23, D-24) — 3 steps
26. [ ] Submit a solution. Immediately run `LeetCode: Submit` again. Notice: `A submission is already in progress. Cancel it first or wait for the verdict.` — no second network call.
27. [ ] Click `Cancel` in pending modal. Modal closes silently, no Notice. Immediately re-invoking `LeetCode: Submit` works.
28. [ ] Run `LeetCode: Cancel running submission` from palette while pending. Modal closes. If nothing in flight, command is greyed out.

### F. Session-expiry (D-27) — 1 step
29. [ ] Clear cookies (or use the plugin's Logout button). Invoke `LeetCode: Submit`. Within ~2s: Notice `LeetCode session expired. Log in again.` fires, modal closes. Plugin does NOT crash.

### G. Error paths (D-04) — 2 steps
30. [ ] Open a problem note. Delete the ```python3 fenced block under `## Code`. Invoke `LeetCode: Submit`. Notice: `No code block found. Add a fenced block with your solution.` — no network call.
31. [ ] Open a non-problem note (no `lc-slug` frontmatter). Invoke `LeetCode: Submit` — command is disabled (greyed out) OR shows Notice `Open a LeetCode problem note first.`. Both acceptable.

### H. Hotkey + ESLint gates — 2 steps
32. [ ] Open Obsidian Hotkeys settings, search "LeetCode". Verify all 5 Phase 3 commands appear with NO default hotkey.
33. [ ] `npm run lint` reports 0 NEW Required violations in `src/` vs Phase 2 baseline (ZERO new src/ lint errors — see CF gate section above).

**Resume signal:** Developer types `smoke approved` after all 33 pass OR `smoke partial: {notes}` with specific failures.

## Threat Flags

None introduced beyond the plan's existing threat model. The sniffing-fetcher closure adds a small defensive guard (try/catch around the terminal-detection path) so a malformed LC response cannot crash the submit command lambda — the inner try logs via `logger.debug` and rethrows nothing, letting the orchestrator's own error paths handle the response. Redaction of any logged payload fragments relies on Phase 1's `src/shared/logger.ts` which already redacts session/csrf/cookie/token patterns (T-03-05-03 mitigation).
