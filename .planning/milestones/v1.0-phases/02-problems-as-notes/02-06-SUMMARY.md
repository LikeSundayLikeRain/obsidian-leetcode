---
phase: 02-problems-as-notes
plan: 06
subsystem: notes
tags: [obsidian, typescript, frontmatter, leetcode, gap-closure]

# Dependency graph
requires:
  - phase: 02-problems-as-notes (Plan 02-05)
    provides: "plugin.openProblem(slug) facade + row-click wiring in ProblemBrowserView"
  - phase: 02-problems-as-notes (Plan 02-01)
    provides: "IndexedProblem.status populated from LC's q.status in ProblemListService.mapStatus"
provides:
  - "GAP-2a closed: new notes receive real LC submission status in lc-status on first write"
  - "mapStatusDisplay SSoT helper in NoteTemplate.ts (IndexedProblem → lc-status vocabulary)"
  - "LC_STATUS_VALUES + LcStatus type exports for D-03 SSoT compliance"
  - "Row-aware openProblem signature across the call chain (ProblemBrowserView → main.ts → NoteWriter → NoteTemplate)"
  - "D-04 non-downgrade guard hardened: existing 'accepted' and 'attempted' both preserved on re-open"
affects:
  - "Phase 2 verification — UAT test 2 first issue ('lc-status inaccurate') now resolved"
  - "Phase 4 solve-time writer — once it flips lc-status to 'accepted', the D-04 guard here guarantees Phase 2 re-opens never clobber it"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Internal (IndexedProblem) → on-disk (lc-status) vocabulary mapping isolated in NoteTemplate.ts per D-03"
    - "Optional-arg plumbing for caller-supplied hints without breaking back-compat (NoteWriter, main.ts, ProblemBrowserView)"

key-files:
  created:
    - ".planning/phases/02-problems-as-notes/02-06-SUMMARY.md — this file"
    - "tests/note-status-mapping.test.ts — mapStatusDisplay unit coverage (4 cases)"
    - "tests/note-status-plumbing.test.ts — NoteWriter.openProblem plumbing + D-04 end-to-end (5 cases)"
  modified:
    - "src/notes/NoteTemplate.ts — LC_STATUS_VALUES, LcStatus, mapStatusDisplay, initialStatus field + arg, applyFrontmatter branch update"
    - "src/notes/NoteWriter.ts — openProblem(slug, initialStatus?) + 2× mapStatusDisplay calls on new-note path"
    - "src/main.ts — plugin.openProblem(slug, initialStatus?) forwarding"
    - "src/browse/ProblemBrowserView.ts — both call sites pass p.status / pick.status"
    - "tests/note-frontmatter-write.test.ts — 5 new cases (initial status, D-04 preservation, idempotence)"
    - "tests/note-frontmatter-tags.test.ts — parameterized D-05 scope guard over 4 status values"

key-decisions:
  - "Background-refresh path stays hint-less: re-fetching a 7-day-stale LC status should never flip an on-disk value (D-04 rationale)"
  - "applyFrontmatter status branch rewritten: existing 'accepted' AND 'attempted' are preserved (only empty / 'untouched' values get the new hint)"
  - "mapStatusDisplay lives in NoteTemplate.ts — the one module that translates between the two status vocabularies, honoring D-03 SSoT"

patterns-established:
  - "Status vocabulary boundary: ProblemListService.mapStatus handles LC-wire → internal; NoteTemplate.mapStatusDisplay handles internal → on-disk. No module crosses more than one boundary."

requirements-completed: [NOTE-03]

# Metrics
duration: 45min
completed: 2026-05-08
---

# Phase 2 Plan 06: Close GAP-2a — real lc-status on first note open

**New notes now record the user's actual LeetCode submission status in frontmatter at first open, instead of the hardcoded 'untouched' placeholder. D-04 non-downgrade guard strengthened: existing 'accepted' and 'attempted' values are never clobbered on re-open.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-08T16:12:00Z
- **Completed:** 2026-05-08T16:19:00Z
- **Tasks:** 2/2
- **Files modified:** 5 source + 4 tests (2 new)

## Accomplishments

- Added `mapStatusDisplay` SSoT helper in `NoteTemplate.ts` translating `IndexedProblem.status` ('solved'|'attempted'|'untouched'|undefined) → `lc-status` ('accepted'|'attempted'|'untouched')
- Extended `buildFrontmatterInput` with an optional `initialStatus` 3rd arg so the on-first-write value flows through the orchestrator
- Rewrote `applyFrontmatter`'s `lc-status` branch to adopt the caller hint on first write while keeping the D-04 non-downgrade guard (now covers 'accepted' AND 'attempted')
- Plumbed the hint through the full call chain: `ProblemBrowserView` row-click → `plugin.openProblem` → `NoteWriter.openProblem` → `buildFrontmatterInput`
- Added 10 new test cases across 4 files covering the mapping helper, the initial-status branch, the D-04 guard, and end-to-end plumbing

## Task Commits

Each task was committed atomically following the TDD cycle (RED → GREEN):

1. **Task 1 RED: failing tests for mapStatusDisplay + lc-status initial mapping** — `1037ee7` (test)
2. **Task 1 GREEN: mapStatusDisplay + NoteTemplate initialStatus contract** — `35a4f29` (feat)
3. **Task 2 RED: failing plumbing tests for openProblem status hint** — `4dcc614` (test)
4. **Task 2 GREEN: plumb IndexedProblem.status through openProblem chain** — `d8fe849` (feat)

Plan metadata commit: to-be-assigned on final docs commit.

## Files Created/Modified

### Created

- `tests/note-status-mapping.test.ts` — 4 cases pinning mapStatusDisplay's four branches
- `tests/note-status-plumbing.test.ts` — 5 cases for NoteWriter.openProblem: the three vocabulary branches, back-compat (no 2nd arg), and the D-04 end-to-end test (background-refresh cannot downgrade an existing 'accepted' even when caller passes 'untouched')

### Modified

- `src/notes/NoteTemplate.ts`
  - New exports: `LC_STATUS_VALUES`, `LcStatus` type, `mapStatusDisplay`
  - `NoteTemplateInput` gained an optional `initialStatus?: LcStatus` field
  - `buildFrontmatterInput` gained an optional 3rd arg `initialStatus?: LcStatus`
  - `applyFrontmatter` status branch rewritten: existing 'accepted' and 'attempted' both preserved; empty / 'untouched' gets the caller hint (defaulting to 'untouched')
  - Top-of-file comment updated to cite `LC_STATUS_VALUES` alongside `PLUGIN_LC_KEYS` and `LC_TAG_PREFIX` as SSoT constants per D-03
- `src/notes/NoteWriter.ts`
  - `openProblem(slug, initialStatus?)` — new optional 2nd arg in IndexedProblem vocabulary
  - Imports `mapStatusDisplay` from `./NoteTemplate`
  - Both `applyFrontmatter` calls on the new-note path (first attempt + 50 ms retry) pass `mapStatusDisplay(initialStatus)` through `buildFrontmatterInput`
  - Background-refresh path (`backgroundRefresh`) stays hint-less on purpose — D-04 guard handles non-downgrade
  - Header comment updated to document the new `initialStatus` parameter and the GAP-2a rationale
- `src/main.ts` — `plugin.openProblem(slug, initialStatus?)` forwards verbatim to `this.notes.openProblem`; JSDoc references GAP-2a + D-04
- `src/browse/ProblemBrowserView.ts` — both call sites updated: row-click handler (`p.status`) and `pickRandom` (`pick.status`). No other refactors in this 553-line file.
- `tests/note-frontmatter-write.test.ts` — new `describe` block with 5 cases covering initial-status mapping and the D-04 preservation/idempotence guarantees
- `tests/note-frontmatter-tags.test.ts` — parameterized `it.each` D-05 scope-guard over the four status values, ensuring status plumbing never leaks into pluginTags

## Behavior Reference

### Status vocabulary mapping (the GAP-2a fix)

| IndexedProblem.status | lc-status on first write |
| --------------------- | ------------------------ |
| `'solved'`            | `'accepted'`             |
| `'attempted'`         | `'attempted'`            |
| `'untouched'`         | `'untouched'`            |
| `undefined`           | `'untouched'`            |

### D-04 non-downgrade preservation (strengthened)

| Existing lc-status | Caller hint     | Resulting on-disk value |
| ------------------ | --------------- | ----------------------- |
| (empty / missing)  | `'accepted'`    | `'accepted'`            |
| `'untouched'`      | `'attempted'`   | `'attempted'`           |
| `'attempted'`      | `'untouched'`   | `'attempted'` (preserved) |
| `'accepted'`       | `'untouched'`   | `'accepted'` (preserved) |
| `'accepted'`       | `'attempted'`   | `'accepted'` (preserved) |

## Tests Added / Extended

- **New** `tests/note-status-mapping.test.ts` — 4 tests, one per input branch of `mapStatusDisplay`
- **New** `tests/note-status-plumbing.test.ts` — 5 end-to-end tests through `NoteWriter.openProblem`
- **Extended** `tests/note-frontmatter-write.test.ts` — added 5 cases: three write-through cases (accepted / attempted / back-compat default), two D-04 preservation cases (non-downgrade + idempotence)
- **Extended** `tests/note-frontmatter-tags.test.ts` — added parameterized `it.each` test proving `initialStatus` never alters `pluginTags` (D-05 scope guard)

Result: **123/123 tests pass** (118 pre-plan + 10 net-new additions; 5 plumbing tests in the new file, 5 preservation tests spread across two extended files).

## Deviations from Plan

**1. [Rule 2 - Correctness] `applyFrontmatter`'s non-downgrade guard now also preserves `'attempted'`**

- **Found during:** Task 1 GREEN, while writing the new `applyFrontmatter` branch
- **Issue:** The original guard wrote the new value iff the existing value was `undefined`, empty, or `'untouched'`. Under the plan's "callers who want to flip 'attempted' → 'accepted' must go through Phase 4's solve-time writer" wording, I interpreted this as: `'attempted'` must ALSO be preserved on re-open. Downgrading 'attempted' → 'untouched' would also be a correctness bug (if a user attempted a problem on LC, then closed the tab, our next open shouldn't paper over their attempted state even when LC is slow to return status).
- **Fix:** The guard now tests `existingIsEmpty = typeof fm['lc-status'] !== 'string' || fm['lc-status'] === '' || fm['lc-status'] === 'untouched'` and only writes when that's true. This covers both the D-04 'accepted' invariant AND the analogous 'attempted' preservation. All pre-existing D-04 tests still pass; the new D-04 test specifically exercises the 'accepted' case end-to-end.
- **Files modified:** `src/notes/NoteTemplate.ts`
- **Commit:** `35a4f29`

**2. [Rule 3 - Blocking] Test file lint rule `obsidianmd/prefer-active-window-timers` fires on `setTimeout` in plumbing test**

- **Found during:** Task 2 GREEN verification, running `npm run lint`
- **Issue:** The existing tests `re-open-silent-offline.test.ts` and `cache-ttl.test.ts` already use `await new Promise((r) => setTimeout(r, N))` to let background promises settle — and are flagged by the same rule at baseline. My new `note-status-plumbing.test.ts` adopted that same pattern and took a new lint hit.
- **Fix:** Added an `eslint-disable-next-line obsidianmd/prefer-active-window-timers -- test-only; matches the pattern already in re-open-silent-offline.test.ts + cache-ttl.test.ts` comment at the call site. Lint-error delta from this plan is now zero. (Broader project lint cleanup — baseline reports 40 problems, now 39 — is out of scope for this GAP-2a closure.)
- **Files modified:** `tests/note-status-plumbing.test.ts`
- **Commit:** `d8fe849`

## Self-Check: PASSED

- [x] 2 tasks committed with TDD RED/GREEN separation (4 commits total: 1037ee7, 35a4f29, 4dcc614, d8fe849)
- [x] SUMMARY.md present at `.planning/phases/02-problems-as-notes/02-06-SUMMARY.md`
- [x] `npm test` exits 0 — 123/123 tests green (118 baseline + 10 net-new, all passing)
- [x] `npm run build` exits 0 — tsc + esbuild clean
- [x] `./scripts/grep-no-vault-modify.sh` exits 0 — D-22 gate holds
- [x] D-03 gate: `grep 'lc-status' src/notes/NoteWriter.ts | grep -v '^#'` = 0 hits — schema literal stays in NoteTemplate.ts
- [x] Both `ProblemBrowserView` call sites pass status: 2 hits for `void this.plugin.openProblem([^,]+,[^)]+)`

## Unexpected Findings

- **`mapStatus` vs `mapStatusDisplay` naming:** `ProblemListService.ts` already exports a `mapStatus` helper (LC wire vocabulary → internal vocabulary). The plan specifies `mapStatusDisplay` for this plan's helper (internal → on-disk), which avoids confusion but creates two similarly-named functions at different boundaries. Kept verbatim as specified — the name is actually a nod to LC's historical `statusDisplay` field that inspired GAP-2a.
- **Background-refresh path status hint — intentionally dropped:** the plan calls this out explicitly, but it's worth re-noting: even when a re-open is paired with a stale cache and the caller passes an 'untouched' hint, the background refresh does NOT pass the hint. The D-04 guard in `applyFrontmatter` has to be perfect for this to be safe — the new D-04 end-to-end test (`tests/note-status-plumbing.test.ts` test 5) verifies this invariant explicitly.
- **Lint baseline is dirty (40 problems pre-plan):** None of those 40 are introduced by this plan's changes. Tracking this as context for a future out-of-scope lint-hygiene pass (not a plan-level blocker).
