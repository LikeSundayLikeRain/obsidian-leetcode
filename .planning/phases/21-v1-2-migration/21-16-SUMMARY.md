---
phase: 21-v1-2-migration
plan: 16
subsystem: notes
tags: [migration, new-note, mount-race, rerender, gap-closure, phase-21, post-uat-r6]
requires:
  - "@.planning/phases/21-v1-2-migration/21-08-SUMMARY.md (rerenderReadingModePanes helper)"
  - "@.planning/phases/21-v1-2-migration/21-13-SUMMARY.md (retrofitStarterCode wrapper gate)"
provides:
  - "NoteWriter.setRerenderAfterNoteWritten DI surface for post-write rerender hand-off"
  - "main.ts production wiring of post-write rerender callback (Reading + Live-Preview)"
  - "Defense-in-depth: line-440 belt-and-suspenders retrofit dropped on useInlineWidget=ON path"
affects:
  - src/notes/NoteWriter.ts
  - src/main.ts
  - tests/notes/NoteWriter.starter-retrofit.test.ts
soft_depends_on:
  - "Plan 21-14 leetcodeRefreshAnnotation export (loaded defensively via require + try/catch — Plan 21-14 has not landed in this base; LP rerender path is currently a no-op until 21-14 ships)"
tech-stack:
  added: []
  patterns:
    - "Pattern S-05 silent-on-failure: layered try/catch (NoteWriter wrapper + main.ts outer/middle/inner)"
    - "DI-via-setter mirroring setOnNoteOpen/setLogin (latest setter wins; null detaches)"
    - "Soft module dependency via dynamic require + try/catch (mergeable independently of 21-14)"
key-files:
  created: []
  modified:
    - "src/notes/NoteWriter.ts: +setRerenderAfterNoteWritten setter, +rerenderAfterNoteWritten field, +fireRerenderAfterNoteWritten wrapper, +call site after fireOnNoteOpen on new-note path (gated on useInlineWidget=ON), +useInlineWidget gate around line-440 retrofit (drops the call on v1.3 path)"
    - "src/main.ts: +setRerenderAfterNoteWritten wiring after setOnNoteOpen, +defensive require of leetcodeRefreshAnnotation, +three-layer try/catch dispatch path"
    - "tests/notes/NoteWriter.starter-retrofit.test.ts: +8 R6 tests (R6.1-R6.8) locking in DI shape, call ordering, gating, idempotency, silent-on-failure, and defense-in-depth"
decisions:
  - "Soft-dependency on Plan 21-14: dynamic require() instead of static import. Plan 21-14 has NOT shipped in this base — leetcodeRefreshAnnotation is not exported from src/widget/liveModeBannerStateField.ts. The defensive require() resolves this in the same merge cycle without blocking on 21-14: when 21-14 lands the LP rerender path activates automatically. Until then the Reading-mode rerender path (Plan 21-08, already shipped) carries the fix on its own."
  - "Defense-in-depth dropping line-440 retrofit when useInlineWidget=ON: eliminates the call site rather than relying solely on Plan 21-13's wrapper short-circuit. The mount sequence between applyFrontmatter and openLinkText is now deterministic (no intermediate vault op can fire a metadataCache modify event mid-render). The wrapper gate stays in place (belt) for the other 3 call sites — re-open, cache-cleared recovery, backgroundRefresh — which Plan 21-13's tests cover and which are not in the R6 reproduction."
  - "Per-layer try/catch (3 layers in main.ts callback) instead of a single outer wrapper: lets the Reading-mode rerender succeed even when the LP dispatch throws, and isolates per-leaf dispatch failures from the leaf walk. Pattern S-05 silent-on-failure preserved end-to-end."
metrics:
  duration_seconds: 360
  completed_date: "2026-06-01"
  tests_added: 8
  tests_total_in_file: 19
  full_phase21_surface_tests: 1984
---

# Phase 21 Plan 21-16: Close UAT Gap R6 (Post-Write Rerender Hand-off) Summary

## One-Liner

Closes UAT R6 by adding a post-write rerender hand-off to NoteWriter.openProblem's new-note creation path so the v1.3 widget remounts against the finalized buffer; symmetric to Plan 21-08 (migrate) and Plan 21-14 (repair). Adds DI'd `setRerenderAfterNoteWritten` surface; production wiring in main.ts dispatches `rerenderReadingModePanes` (Reading) + `leetcodeRefreshAnnotation` (Live-Preview, soft-dep on 21-14). Drops the line-440 belt-and-suspenders retrofit on the v1.3 path so the mount sequence is deterministic.

## What Shipped

### A. NoteWriter DI surface for post-write rerender (`src/notes/NoteWriter.ts`)

- Private field: `rerenderAfterNoteWritten: ((path: string) => void) | null = null`
- Public setter: `setRerenderAfterNoteWritten(cb)` — mirrors `setOnNoteOpen` / `setLogin`. Latest setter wins; passing `null` detaches.
- Private wrapper: `fireRerenderAfterNoteWritten(filePath)` — Pattern S-05 try/catch around the callback so a throwing callback never propagates to `openProblem`.

### B. Call site on the new-note creation path (`src/notes/NoteWriter.ts:openProblem`)

After `fireOnNoteOpen(slug)` on the new-note path, when `useInlineWidget === true`:

```ts
if (useInlineWidget) {
  this.fireRerenderAfterNoteWritten(file.path);
}
```

The callback fires AFTER `revealExistingLeaf || openLinkText` resolves AND AFTER `fireOnNoteOpen` so a target EditorView / preview pane exists for the rerender to act on. Gated on `useInlineWidget=ON`: legacy v1.2 notes have no widget to remount, and the rerender hand-off is a no-op for them anyway when the production callback is null.

### C. Defense-in-depth: drop line-440 retrofit on the v1.3 path (`src/notes/NoteWriter.ts`)

The line-440 belt-and-suspenders `retrofitStarterCode(file, newEntry)` call is now wrapped in `if (!useInlineWidget) { ... }`. Plan 21-13's wrapper at `retrofitStarterCode:246-254` already short-circuits when `useInlineWidget=ON`, but eliminating the call site is the deterministic-mount win — no intermediate vault operation can fire a metadataCache modify event between `applyFrontmatter` and `openLinkText`. The wrapper gate stays in place (belt) for the OTHER three call sites (lines 272 / 343 / 467 — re-open / cache-cleared recovery / backgroundRefresh).

### D. Production wiring in `src/main.ts`

Immediately after `this.notes.setOnNoteOpen(...)`:

```ts
this.notes.setRerenderAfterNoteWritten((path: string) => {
  // Layer 1: Reading-mode helper from Plan 21-08.
  try { rerenderReadingModePanes(this.app, path); } catch { /* logger.debug */ }
  // Layer 2: Live-Preview / Source-mode CM6 dispatch (Plan 21-14 soft-dep).
  if (leetcodeRefreshAnnotation) {
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) { /* match path → cm.dispatch annotation */ }
  }
});
```

`leetcodeRefreshAnnotation` is loaded via `require('./widget/liveModeBannerStateField')` wrapped in try/catch — when the export is missing (Plan 21-14 has not landed in this base) the LP dispatch path is silently skipped while the Reading-mode helper still fires.

### E. Tests (`tests/notes/NoteWriter.starter-retrofit.test.ts`)

8 new R6 tests in a `describe('R6 — post-write rerender hand-off (Plan 21-16)', ...)` block:

| ID | Behavior |
|----|----------|
| R6.1 | Fresh problem + useInlineWidget=ON → callback fires exactly once with file path AFTER openLinkText resolves (call-ordering tick counter) |
| R6.2 | Fresh problem + useInlineWidget=OFF → callback NOT fired |
| R6.3 | Re-open path (existing file + cached detail) → callback NOT fired |
| R6.4 | Cache-cleared recovery path (existingAtCanonical) → callback NOT fired |
| R6.5 | Setter idempotency (last wins; null detaches; no double-fire) |
| R6.6 | Throwing callback resolves cleanly; no Notice; file still on disk (Pattern S-05) |
| R6.7 | Defense-in-depth: useInlineWidget=ON → vault.process never called from line-440 retrofit (call site dropped) |
| R6.8 | Defense-in-depth: useInlineWidget=OFF → legacy emit shape preserved (no regression) |

## RED → GREEN gate

- RED: 6 of 8 R6 tests failed against the pre-fix tree (`writer.setRerenderAfterNoteWritten is not a function`); R6.7/R6.8 already passed (they assert observable behaviors that already hold).
- GREEN: 19/19 tests pass in `tests/notes/NoteWriter.starter-retrofit.test.ts` (5 D-06 + 6 Plan 21-13 I-block + 8 R6).
- Full Phase 21 surface (`tests/solve tests/notes tests/widget tests/main`): 100 test files, 1984 passing + 5 skipped, zero failures.
- `npm run build` exits 0.

## Sanity grep gates (all passing)

| Pattern | File | Expected | Actual |
|---------|------|----------|--------|
| `rerenderAfterNoteWritten` | src/notes/NoteWriter.ts | ≥3 | 5 ✓ |
| `setRerenderAfterNoteWritten` | src/main.ts | =1 | 1 ✓ |
| `leetcodeRefreshAnnotation` | src/main.ts | ≥1 | 8 ✓ |
| `useInlineWidget` | src/notes/NoteWriter.ts | ≥6 | 13 ✓ |

## Threat-Model + Write-Path Hygiene Recap

- **Vault writes:** zero new write paths. The new code only invokes documented Obsidian / CM6 APIs (`getLeavesOfType`, `previewMode.rerender` via `rerenderReadingModePanes`, `cm.dispatch` with empty changes + Plan 21-14 annotation). No fence-body writes, no frontmatter writes, no new `vault.process` callsites.
- **CM6 dispatches:** the LP-side dispatch carries an annotation only (no `changes`, no userEvent). Per Plan 21-14's threat model, transactions with `tr.changes.length === 0` never reach the section-lock changeFilter — the `'leetcode.*'` userEvent convention does NOT apply here.
- **Pattern S-05 silent-on-failure:** layered try/catch (NoteWriter wrapper, main.ts outer/middle/inner). No exception propagates back to `NoteWriter.openProblem` or to Obsidian's render pipeline.
- **Subtractive change at line-440:** removing a call site is purely subtractive. The wrapper gate's behavior is unchanged. No threat surface widens.
- **Pattern S-05 isolation:** a throw in the LP dispatch path does NOT prevent the Reading-mode rerender from firing (per-layer try/catch).
- **Soft-dependency on Plan 21-14:** dynamic `require()` wrapped in try/catch. When the export is missing (current state of this base — 21-14 has not landed) the LP dispatch path silently no-ops; the Reading-mode helper still carries the fix on its own. When 21-14 ships in the same merge cycle the LP path activates automatically with no further code change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue resolution] Used SOFT DEPENDENCY fallback shape for `leetcodeRefreshAnnotation`**

- **Found during:** Task 2 (main.ts wiring)
- **Issue:** Plan 21-16 was authored against the assumption that Plan 21-14 had already landed (`leetcodeRefreshAnnotation` exported from `src/widget/liveModeBannerStateField.ts`). The plan's PRIMARY shape uses a static `import { leetcodeRefreshAnnotation } from './widget/liveModeBannerStateField'`. In this base, however, Plan 21-14 has NOT shipped — `liveModeBannerStateField.ts` does not export `leetcodeRefreshAnnotation`. A static import would fail TypeScript compilation.
- **Fix:** Used the SOFT DEPENDENCY fallback shape documented in the plan's Task 2 step 4 ("If `npm run build` fails because `leetcodeRefreshAnnotation` is not exported … fall back to a defensive guard: dynamic `require('./widget/liveModeBannerStateField')` wrapped in try/catch"). Annotation is loaded via `require()` and gated at the dispatch site. When Plan 21-14 lands the LP path activates automatically; until then only the Reading-mode rerender (Plan 21-08, already shipped) carries the fix.
- **Files modified:** `src/main.ts` (defensive require + null-guard at dispatch site; no static import).
- **Commit:** fd65c59
- **Plan compliance:** This is the documented soft-dependency fallback path, not a deviation from contract.

**2. [Rule 1 — Test-fixture clarification] R6.7 spy approach via observable side effect**

- **Found during:** Task 1 RED gate authoring
- **Issue:** The plan suggests instrumenting `retrofitStarterCodeRaw` (the inner export) via a vi.mock block. Doing so would replace the real implementation and break the existing 5 D-06 / 6 Plan 21-13 tests in the same file, which assert observable file-body shape after retrofit runs end-to-end.
- **Fix:** Asserted the dropped call site via observable side effect on the mock vault: when `useInlineWidget=ON` on the new-note path, `vault.process` (the only mutation primitive retrofit ever calls) MUST NOT have been invoked. Plus the body-shape assertion (single `\`\`\`leetcode-solve` fence; no `\`\`\`python` sibling) confirms the legacy retrofit did not rewrite the file. R6.8 mirrors with the legacy emit shape preserved on `useInlineWidget=OFF`.
- **Files modified:** `tests/notes/NoteWriter.starter-retrofit.test.ts` (no vi.mock added; spy via `m.spies.process`).
- **Plan compliance:** asserts the same contract as the plan-suggested instrumentation, with stricter side-effect coverage.

## Self-Check: PASSED

- `[FOUND]` `.planning/phases/21-v1-2-migration/21-16-SUMMARY.md` (this file)
- `[FOUND]` `src/notes/NoteWriter.ts` (modified; setter + field + wrapper + call site + line-440 gate)
- `[FOUND]` `src/main.ts` (modified; production wiring + defensive require)
- `[FOUND]` `tests/notes/NoteWriter.starter-retrofit.test.ts` (modified; +8 R6 tests)
- `[FOUND]` Commit `eccbc9c` (Task 1: NoteWriter rerender DI + drop line-440 retrofit)
- `[FOUND]` Commit `fd65c59` (Task 2: production wiring)
- `[VERIFIED]` Sanity grep gates: 5/1/8/13 (all ≥ expected)
- `[VERIFIED]` `npm run build` exits 0
- `[VERIFIED]` Full Phase 21 surface: 1984 passing, 5 skipped, 0 failing
