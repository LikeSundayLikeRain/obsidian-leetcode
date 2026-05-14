---
phase: 02-problems-as-notes
plan: 05
subsystem: plugin-entry + browse-view
tags: [wiring, plugin-lifecycle, row-click, note-open]
requires:
  - 02-01 # NoteWriter contract + type surface
  - 02-02 # htmlToMarkdown + HeadingRegion
  - 02-03 # NoteWriter implementation
  - 02-04 # LeetCodeClient.getProblemDetail + SettingsStore cache
provides:
  - LeetCodePlugin.notes (NoteWriter field)
  - LeetCodePlugin.openProblem(slug) public facade
  - ProblemBrowserView row-click + pickRandom wired to note-open
affects:
  - src/main.ts
  - src/browse/ProblemBrowserView.ts
tech-stack:
  added: []
  patterns:
    - "Plugin facade: view callers go through plugin.openProblem(slug), never plugin.notes.openProblem(slug) directly"
    - "Locked onload ordering preserved: settings → fetcher → client → auth → list → notes → views"
key-files:
  created: []
  modified:
    - src/main.ts
    - src/browse/ProblemBrowserView.ts
decisions:
  - "Option A + plugin facade (from 02-PATTERNS.md): register this.notes field AND expose openProblem(slug) as public method; view callers invoke the facade"
  - "Step 5.5 (note writer) inserted between step 5 (list service) and step 6 (view registration) — preserves locked ordering"
  - "Notice import in ProblemBrowserView intentionally retained — still used by session-expired, rate-limit, and empty-filter-state paths"
metrics:
  duration: "~10 minutes"
  tasks: 2
  files_modified: 2
  tests_passing: "30 files / 105 tests (no regressions)"
  commits: 2
completed: 2026-05-08
---

# Phase 2 Plan 05: Wire NoteWriter + replace Phase 1 stubs Summary

Wired Phase 2's `NoteWriter` orchestrator into `LeetCodePlugin` and replaced the two Phase 1 stub Notice call sites in `ProblemBrowserView` with delegating calls to `plugin.openProblem(slug)` — clicking a problem row now opens or reveals a note instead of showing a stub toast.

## Final `onload()` Step Ordering (post-Plan-02-05)

```
//   1. Load settings (has cookies if stored)
//   2. Install requestUrl fetcher (BEFORE any LC client construction)
//   3. Construct LeetCodeClient (depends on SettingsStore)
//   4. Construct AuthService(settings, client) — TWO-ARG
//   5. Construct ProblemListService (depends on client + settings)
//   5.5. Construct NoteWriter (Phase 2 — row-click orchestrator; depends on app + client + settings)
//   6. Register view, ribbon, command, settings tab
```

## Public Surface Added to `LeetCodePlugin`

```typescript
export default class LeetCodePlugin extends Plugin {
  // ... existing fields ...
  notes!: NoteWriter;                              // NEW

  /** Phase 2 entry point for row-click in ProblemBrowserView.
   *  Delegates to NoteWriter.openProblem(slug). Safe-to-await; errors are
   *  swallowed inside NoteWriter (D-12 silent-offline) or surfaced via Notice
   *  (D-13 new-note fetch failure). */
  async openProblem(slug: string): Promise<void> {
    return this.notes.openProblem(slug);
  }
}
```

`NoteWriter` construction site in `onload()`:

```typescript
    // Step 5.5 — note writer (depends on app + client + settings). Phase 2.
    // Row-click in ProblemBrowserView delegates to plugin.openProblem(slug)
    // which in turn delegates to this.notes.openProblem(slug).
    this.notes = new NoteWriter(this.app, this.client, this.settings);
```

## ProblemBrowserView Call-Site Replacements

Row-click handler (was `new Notice('Phase 1 stub: would open ${p.slug}.', 3000)`):
```typescript
    row.addEventListener('click', () => {
      void this.plugin.openProblem(p.slug);
    });
```

pickRandom handler (was `new Notice('Phase 1 stub: would open ${pick.slug}.', 3000)`):
```typescript
    const pick = visible[Math.floor(Math.random() * visible.length)];
    if (!pick) return;
    void this.plugin.openProblem(pick.slug);
```

Both replacements are surgical — no other structural changes to `ProblemBrowserView.ts`. The `Notice` import is retained because session-expired, rate-limit, and empty-filter-state code paths still use it.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire NoteWriter into LeetCodePlugin + expose openProblem(slug) | `0f2179a` | src/main.ts |
| 2 | Replace two Phase 1 stub row-click handlers with plugin.openProblem calls | `cc7aa84` | src/browse/ProblemBrowserView.ts |

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep -c "import { NoteWriter }" src/main.ts` | 1 | 1 | PASS |
| `grep -c "notes!: NoteWriter" src/main.ts` | 1 | 1 | PASS |
| `grep -cE "this\.notes\s*=\s*new NoteWriter" src/main.ts` | 1 | 1 | PASS |
| `grep -c "async openProblem" src/main.ts` | 1 | 1 | PASS |
| `grep -c "return this.notes.openProblem" src/main.ts` | 1 | 1 | PASS |
| `grep -c "NoteWriter" src/main.ts` | ≥ 3 | 6 | PASS |
| `grep -rc "Phase 1 stub" src/` | 0 | 0 | PASS |
| `grep -c "this.plugin.openProblem" src/browse/ProblemBrowserView.ts` | 2 | 2 | PASS |
| `grep -cE "void this\.plugin\.openProblem\(p\.slug\)" src/browse/ProblemBrowserView.ts` | 1 | 1 | PASS |
| `grep -cE "void this\.plugin\.openProblem\(pick\.slug\)" src/browse/ProblemBrowserView.ts` | 1 | 1 | PASS |
| `grep -c "new Notice" src/browse/ProblemBrowserView.ts` | ≥ 1 | 3 | PASS |
| `npm run build` | exit 0 | exit 0 | PASS |
| `npm test` | all green | 30 files / 105 tests green | PASS |
| `./scripts/grep-no-vault-modify.sh` | exit 0 | exit 0 | PASS |

## Deviations from Plan

None — plan executed exactly as written.

Lint (`npm run lint`) reports 35 errors + 4 warnings, but none were introduced by this plan. All surfaced issues sit in files/lines that Plan 02-05 did not touch:
- `src/main.ts` lines 106/113 — unused `eslint-disable obsidianmd/no-unsupported-api` directives around `revealLeaf` (these drifted to their current lines because Plan 02-05's Step 5.5 insertion shifted the file by 6 lines; the directives themselves were unchanged).
- `src/browse/ProblemBrowserView.ts` — pre-existing issues at lines 8 (`FilterRule` unused), 239/240 (type assertions), 347/353/360 (`document.createElementNS` / `document` vs `activeDocument`). None at the two lines Plan 02-05 modified (425 and 549).
- `src/notes/NoteWriter.ts`, `tests/cache-ttl.test.ts`, `tests/re-open-silent-offline.test.ts` — pre-existing issues in files not modified by Plan 02-05.

Per the executor's scope boundary rule, these pre-existing issues were NOT auto-fixed. They are logged in `.planning/phases/02-problems-as-notes/deferred-items.md` for a dedicated lint-hygiene pass.

## Authentication Gates

None — this plan does not touch auth or make LC API calls during execution.

## Threat Model Compliance

All mitigations from the plan's STRIDE register are satisfied:
- **T-02-18** (Tampering: corrupt `p.slug` crashes openProblem): `IndexedProblem.slug` already passes Phase 1's shape guard; NoteWriter handles empty/invalid internally (verified in Plan 02-03 tests).
- **T-02-19** (DoS: click spam): LC throttle caps concurrency at 2 / 20 per 10s; no per-click DoS surface introduced.
- **T-02-20** (Information disclosure: plugin field leakage): `this.notes` is a standard plugin instance field; Obsidian plugin sandbox isolates it.
- **T-02-21** (EoP: vault.modify regression): `./scripts/grep-no-vault-modify.sh` exits 0 — gate still holds.

No new threat surface introduced (no new endpoints, no new auth paths, no new trust boundaries).

## Remaining Phase 2 Gate

Per `.planning/phases/02-problems-as-notes/02-VALIDATION.md` § "Manual-Only Verifications", the final gate for closing Phase 2 is human QA in a real Obsidian instance:

1. Click a problem row in the browser → verify a new note is created in the configured problems folder on first click.
2. Click the same row again → verify the note is revealed (not re-created).
3. Click the shuffle button → verify it opens or reveals a random visible problem.
4. Test with `LeetCode.base` missing → verify it's shipped on first problem open (D-18).
5. Test session expiry → verify the Notice copy matches UI-SPEC and the view falls back to the logged-out empty state.

This manual QA is the remaining step before Phase 2 is complete; Plan 02-05 itself is fully verified by the automated gates above.

## Self-Check: PASSED

- Commit `0f2179a` (Task 1): FOUND in git log
- Commit `cc7aa84` (Task 2): FOUND in git log
- File `src/main.ts`: FOUND (modified)
- File `src/browse/ProblemBrowserView.ts`: FOUND (modified)
- File `.planning/phases/02-problems-as-notes/02-05-SUMMARY.md`: will be written by this operation
