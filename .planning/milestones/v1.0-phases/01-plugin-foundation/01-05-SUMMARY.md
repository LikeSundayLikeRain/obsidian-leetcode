---
phase: 01-plugin-foundation
plan: 05
subsystem: problem-list-service
tags: [pagination, search, filter, status-mapping, cache-ttl]
requires:
  - IndexedProblem (src/browse/types.ts, Plan 01)
  - ProblemIndex (src/browse/types.ts, Plan 01)
  - LeetCodeClient (src/api/LeetCodeClient.ts, Plan 02)
  - SettingsStore.getProblemIndex / setProblemIndex (src/settings/SettingsStore.ts, Plan 02)
provides:
  - ProblemListService (real impl replaces Wave-1 brand stub)
  - INDEX_TTL_MS (24h)
  - PAGE_SIZE (50)
  - mapStatus (internal helper, 'ac'->'solved', 'notac'->'attempted', else 'untouched')
affects:
  - Plan 06 (ProblemBrowserView) — imports ProblemListService, calls refresh() on onOpen,
    passes {difficulty, status} chip selections into filter()
tech_stack:
  added: []
  patterns:
    - paginated LC fetch with short-page termination (PAGE_SIZE=50, library param `offset`)
    - 24h TTL cache gate in front of network fetch
    - in-memory pure search + filter helpers (no DOM, no network)
    - status-degrades-to-untouched for undefined / unknown LC values (T-05-06)
    - AND-across-dimensions, OR-within-dimension filter semantics
key_files:
  created:
    - tests/search-filter.test.ts
    - tests/problem-filter-status.test.ts
    - tests/problems-pagination.test.ts
  modified:
    - src/browse/ProblemListService.ts (replaced Wave-1 brand stub with real implementation)
decisions:
  - LC client param is `offset` (not `skip`) — the CONTEXT.md D-07 pseudocode used
    `skip:` loosely; the `@leetnotion/leetcode-api` runtime surface accepts `offset`.
    Plan 05 uses the library name verbatim. Anti-bulk grep gate confirms no `skip:`
    appears in src/browse/.
  - mapStatus(): unknown future LC status values degrade to 'untouched' (threat T-05-06
    mitigation — attacker can't mis-classify rows as solved by injecting a novel
    status code).
  - filter() treats `status === undefined` as `'untouched'` so legacy index entries
    (pre-status-population) behave consistently with newly-refreshed rows.
  - search() is pure substring; consistent with BROWSE-03's documented behaviour
    (not word-boundary / not token-prefix). Fixed test S1 expected-output to match
    (plan's fixture had id=4 "Median of Two Sorted Arrays" which matches substring
    "two" — the plan expected [1,2] but [1,2,4] is the correct substring result).
  - refresh() ships in Task 1's GREEN commit (not Task 2's) because search/filter/
    refresh share one file; splitting the impl across two commits would require
    either two rewrites of ProblemListService.ts or an intermediate stub. Identical
    to Plan 02's SettingsStore-implemented-before-its-tests precedent.
metrics:
  duration_seconds: "~250"
  completed: 2026-05-07T20:01:30Z
  task_count: 2
  file_count: 4
---

# Phase 01 Plan 05: Problem List Service Summary

## One-liner

Paginated-with-PAGE_SIZE=50 + 24h-TTL-cached LC problem list service with in-memory
substring search (BROWSE-03) and multi-select `{difficulty, status}` filter (BROWSE-04,
AND-across-dimensions, OR-within-dimension); refresh() maps LC's `q.status` into the
`'solved' | 'attempted' | 'untouched'` vocabulary with unknown-value-degrades-to-untouched.

## What was built

### Source (1 file, brand stub replaced)

- **`src/browse/ProblemListService.ts`** (117 lines; Wave-1 brand stub completely replaced):
  - Exports `class ProblemListService` plus `INDEX_TTL_MS` (24 * 60 * 60 * 1000 = 86 400 000 ms)
    and `PAGE_SIZE` (50) constants.
  - `refresh(force = false)`: returns cached index when `!force && cached && Date.now() -
    cached.fetchedAt < INDEX_TTL_MS`; otherwise loops `client.lc.problems({ limit: PAGE_SIZE,
    offset })` starting at `offset: 0`, incrementing by `PAGE_SIZE`, terminating when
    `page.questions.length < PAGE_SIZE` (T-05-01). Every question is mapped into
    `IndexedProblem` with `status: mapStatus(q.status ?? null)`. The completed list is
    persisted as `{ fetchedAt: Date.now(), problems: all }` via `settings.setProblemIndex(...)`.
  - `search(idx, term)`: `term.trim().toLowerCase()` — empty → input unchanged; otherwise
    returns rows where `title.toLowerCase().includes(q) || String(id).startsWith(q)`.
  - `filter(idx, { difficulty?, status? })`: per-dimension OR (row matches if value in list),
    cross-dimension AND. Missing / empty array → no constraint on that dimension. `status ===
    undefined` is treated as `'untouched'` for filter comparisons.
  - Internal `mapStatus(s)`: `'ac' → 'solved'`, `'notac' → 'attempted'`, anything else → `'untouched'`.

### Tests (3 files, 20 tests — all green)

- **`tests/search-filter.test.ts`** (9 tests): BROWSE-03 search cases (S1-S5: case-insensitive
  substring, id-prefix, empty, whitespace-only, uppercase query) + BROWSE-04 difficulty cases
  (F1-F4: single, multi, empty opts, empty array).
- **`tests/problem-filter-status.test.ts`** (6 tests): BROWSE-04 status dimension (ST1-ST6:
  solved only, attempted only, untouched INCLUDING `status === undefined`, multi-select,
  empty-array-no-constraint, AND-with-difficulty).
- **`tests/problems-pagination.test.ts`** (5 tests): BROWSE-02 pagination 50/50/7 → 107 items
  with offsets {0, 50, 100}; persistence round-trip asserting all three status buckets present;
  fresh-cache (<24h) returns cached without network; stale-cache (>24h) re-fetches; first-run
  no-cache fetches.

## D-07 value confirmations

| Constant | Value | Source literal | D-07 requirement |
|----------|-------|----------------|-------------------|
| `PAGE_SIZE` | `50` | `export const PAGE_SIZE = 50;` | page size = 50 ✓ |
| `INDEX_TTL_MS` | `86 400 000` (24 h) | `export const INDEX_TTL_MS = 24 * 60 * 60 * 1000;` | 24 h TTL ✓ |

## q.status → IndexedProblem.status mapping (BROWSE-04 status dim)

| LC `q.status` | `IndexedProblem.status` | User-facing label |
|----------------|--------------------------|--------------------|
| `'ac'` | `'solved'` | Solved |
| `'notac'` | `'attempted'` | Attempted |
| `null` | `'untouched'` | Untouched |
| missing / `undefined` | `'untouched'` | Untouched |
| any other future value | `'untouched'` (T-05-06) | Untouched |

## Test counts by file

| File | Contract | Tests | Pass |
|------|----------|-------|------|
| `tests/search-filter.test.ts` | BROWSE-03 + BROWSE-04 difficulty | 9 | 9 |
| `tests/problem-filter-status.test.ts` | BROWSE-04 status dimension | 6 | 6 |
| `tests/problems-pagination.test.ts` | BROWSE-02 | 5 | 5 |
| **This plan's new tests** |  | **20** | **20** |
| Phase 1 total (8 files) |  | **46** | **46** |

All eight test files in the repo at Plan 05 completion:

1. `tests/throttle.test.ts` — 6 (Plan 02)
2. `tests/fetcher-install.test.ts` — 6 (Plan 02)
3. `tests/session-expiry.test.ts` — 4 (Plan 02)
4. `tests/settings-store.test.ts` — 5 (Plan 02)
5. `tests/cookie-parse.test.ts` — 5 (Plan 03)
6. `tests/search-filter.test.ts` — 9 (Plan 05, new)
7. `tests/problem-filter-status.test.ts` — 6 (Plan 05, new)
8. `tests/problems-pagination.test.ts` — 5 (Plan 05, new)

## Gate Results

| Gate | Command | Exit | Evidence |
|------|---------|------|----------|
| Test | `npm test` | 0 | 46/46 pass across 8 files |
| Lint | `npm run lint` | 0 | Zero errors, zero warnings |
| Build | `npm run build` | 0 | `tsc -noEmit` clean, esbuild produces `main.js` |
| BROWSE-02 anti-bulk (3+ digit limit) | `grep -rnE 'limit:\s*[0-9]{3,}\|limit:\s*Infinity' src/browse/` | — | **0** matches |
| BROWSE-02 anti-bulk (no `skip:` in browse) | `grep -rn 'skip:' src/browse/` | — | **0** matches |
| Exports of ProblemListService / INDEX_TTL_MS / PAGE_SIZE | `grep -cE 'export (class ProblemListService\|const (INDEX_TTL_MS\|PAGE_SIZE))' src/browse/ProblemListService.ts` | — | **3** |
| PAGE_SIZE = 50 literal | `grep -c 'PAGE_SIZE = 50' src/browse/ProblemListService.ts` | — | **1** |
| INDEX_TTL_MS = 24h literal | `grep -cE 'INDEX_TTL_MS = 24 \* 60 \* 60 \* 1000' src/browse/ProblemListService.ts` | — | **1** |
| search uses toLowerCase + startsWith | `grep -cE '(toLowerCase\|startsWith)' src/browse/ProblemListService.ts` | — | **2** |
| filter accepts difficulty + status | `grep -c 'difficulty\?: string\[\]' ... && grep -c 'status\?: string\[\]' ...` | — | **1** + **1** |
| mapStatus present | `grep -c 'mapStatus' src/browse/ProblemListService.ts` | — | **2** |
| 'ac' mapping | `grep -c "'ac'" src/browse/ProblemListService.ts` | — | **3** |
| 'notac' mapping | `grep -c "'notac'" src/browse/ProblemListService.ts` | — | **3** |
| status tests ≥ 6 | `grep -c "it('" tests/problem-filter-status.test.ts` | — | **6** |
| pagination tests = 5 | `grep -c "it('" tests/problems-pagination.test.ts` | — | **5** |
| status values present in pagination test | `grep -c "'solved'\|'attempted'\|'untouched'" tests/problems-pagination.test.ts` | — | **2/2/2** (each ≥1) |

## Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 RED | test | 02dd4b1 | add failing search/filter tests (BROWSE-03, BROWSE-04 RED) |
| 1 GREEN | feat | aaa4c8f | implement ProblemListService search + filter (BROWSE-03, BROWSE-04) |
| 2 | test | 1ecfdec | add BROWSE-02 pagination + TTL + status-mapping tests |

## Requirements Satisfied

- **BROWSE-02** (paginated problem list, no bulk download, 24h TTL) — verified by
  `tests/problems-pagination.test.ts` (offsets 0/50/100, short-page termination, cache
  fresh/stale branches) + static grep gate (no 3+ digit `limit:` anywhere in src/browse/).
- **BROWSE-03** (in-memory title substring + id-prefix search, case-insensitive, trims
  whitespace) — verified by `tests/search-filter.test.ts` S1-S5.
- **BROWSE-04** (multi-select difficulty AND multi-select status, AND across dimensions,
  OR within) — verified by `tests/search-filter.test.ts` F1-F4 (difficulty) +
  `tests/problem-filter-status.test.ts` ST1-ST6 (status + AND-with-difficulty).

## Deviations from Plan

### Rule-1 fixes

**1. Test S1 expected output corrected to match documented substring semantics**
- **Found during:** Task 1 GREEN first test-run.
- **Issue:** The plan's `tests/search-filter.test.ts` S1 expected `search(FIXTURE, 'two') → [1, 2]`,
  but FIXTURE's id=4 title is `"Median of Two Sorted Arrays"` — which also contains the substring
  "two". The implementation (documented as "case-insensitive title substring OR id-prefix") correctly
  returned `[1, 2, 4]`. The plan's expected output was inconsistent with its own declared substring
  semantics (and with S5's `'TWO SUM' → [1]` which confirms substring logic). Users typing "two"
  into the filter expect "Median of Two Sorted Arrays" to match — the contract, not the literal
  expected output, is authoritative.
- **Fix:** Updated S1 to expect `[1, 2, 4]` (sorted); added a code comment explaining the match.
- **Files:** `tests/search-filter.test.ts`
- **Commit:** aaa4c8f

### Rule-3 fixes (blocking issues)

**2. Unused eslint-disable on `no-constant-condition`**
- **Found during:** Task 1 GREEN lint pass.
- **Issue:** The plan's snippet used `while (true) { ... }` with a scoped `eslint-disable-next-line
  no-constant-condition` comment. The repo's flat config does not enable `no-constant-condition`
  in the `while(true)` form (typescript-eslint 8.x is liberal here), so the disable fires as an
  unused-directive warning.
- **Fix:** Rewrote the pagination loop as `for (;;) { ... }` — idiomatic intentional-infinite-loop
  form that passes without any disable comment. Behaviour identical.
- **Files:** `src/browse/ProblemListService.ts`
- **Commit:** aaa4c8f

**3. `as ProblemIndex` cast + strict array-index undefined narrowing collision in pagination test**
- **Found during:** Task 2 lint + build runs.
- **Issue:** The plan's pagination-test snippet wrote `const call = settings.setProblemIndex.mock.calls[0][0] as ProblemIndex;`.
  Lint's `@typescript-eslint/no-unnecessary-type-assertion` flagged the cast as redundant (the mock's
  parameter type already narrows `mock.calls[0][0]` to `ProblemIndex`). Removing the cast exposed a
  tsc `TS2532: Object is possibly 'undefined'` error because the indexed-access type on `mock.calls[0]`
  is `ProblemIndex[] | undefined` under strict array indexing.
- **Fix:** Replaced the cast with a defensive destructure: `const firstCall =
  settings.setProblemIndex.mock.calls[0]; if (!firstCall) throw new Error('setProblemIndex was not called');
  const call = firstCall[0];`. Satisfies both tsc's narrowing AND lint's no-unnecessary-assertion rule.
- **Files:** `tests/problems-pagination.test.ts`
- **Commit:** 1ecfdec

### TDD sequencing note (not a deviation)

- `refresh()` was implemented in Task 1's GREEN commit `aaa4c8f` (alongside `search`/`filter`),
  not in Task 2. Reason: `src/browse/ProblemListService.ts` is one file; splitting one class
  across two GREEN commits would either require two rewrites (write search-only impl in Task 1,
  rewrite entirely in Task 2) or a temporary throwing-stub refresh between the two. Plan 02's
  SettingsStore already set this precedent (impl lands in the plan that needs its method; tests
  follow in a later task). Task 2's commit is pure `test(...)` — it exercises the already-green
  implementation and asserts BROWSE-02 contract + status mapping.

### No Rule-2 or Rule-4 (architectural) deviations

No missing security features, no new dependencies, no cross-module patterns introduced. No auth
gates (plan is fully offline / unit-test only).

## Library-param naming clarification (`offset`, not `skip`)

CONTEXT.md D-07's pseudocode referred to `skip` — the `@leetnotion/leetcode-api` runtime
actually takes `offset`. Plan 05 uses the library's real parameter name (`offset`) in both
the implementation and the test mocks. The BROWSE-02 anti-bulk grep gate explicitly checks
that `skip:` never appears in `src/browse/` to prevent accidental regression to the
CONTEXT.md pseudocode naming. Result: `grep -rn 'skip:' src/browse/` returns 0.

## Handoff to Plan 06 (ProblemBrowserView)

Plan 06 consumes this service as follows:

```typescript
import { ProblemListService } from '../browse/ProblemListService';
import { isSessionExpired } from '../api/LeetCodeClient';
import { RateLimitError } from '../shared/errors';

// In main.ts onload():
this.list = new ProblemListService(this.client, this.settings);

// In ProblemBrowserView onOpen() (render the list):
try {
  const all = await this.plugin.list.refresh();           // uses 24h cache
  const filtered = this.plugin.list.filter(all, {
    difficulty: [...this.selectedDifficulty],              // from chip row
    status:     [...this.selectedStatus],                  // from chip row (Solved/Attempted/Untouched)
  });
  const searched = this.plugin.list.search(filtered, this.searchTerm.trim());
  this.renderRows(searched);
} catch (e) {
  if (e instanceof RateLimitError) { /* D-14 Notice */ }
  else if (isSessionExpired(e))   { /* AUTH-04 flow */ }
}
```

Key invariants Plan 06 must preserve:
- Call `search()` *after* `filter()` so the user's typed query narrows the already-filtered
  set (cheaper on the hot path).
- Pass `force: true` to `refresh()` only from an explicit user action (e.g., a toolbar
  "Refresh" button) — never on every onOpen.
- Subscribe to `getActiveThrottle().onQueueChange` for the fetching-indicator footer (D-13);
  the queue will contain this service's pagination requests during a forced refresh.

## Known Stubs

None — all Wave-1 brand stubs that this plan was responsible for replacing are gone:

| File | Status |
|------|--------|
| `src/browse/ProblemListService.ts` | Brand stub REPLACED with real implementation in `aaa4c8f`. |

The remaining Wave-1 stubs belong to other plans (this plan owns none).

## Self-Check: PASSED

- [x] `src/browse/ProblemListService.ts` exists — 117 lines; exports `ProblemListService`, `INDEX_TTL_MS`, `PAGE_SIZE`.
- [x] `tests/search-filter.test.ts` exists — 9 tests, all green.
- [x] `tests/problem-filter-status.test.ts` exists — 6 tests, all green.
- [x] `tests/problems-pagination.test.ts` exists — 5 tests, all green.
- [x] Commits `02dd4b1`, `aaa4c8f`, `1ecfdec` all present in `git log --oneline`.
- [x] `npm run build` → exit 0.
- [x] `npm run lint` → exit 0 (zero errors, zero warnings).
- [x] `npm test` → exit 0 (46/46 across 8 files).
- [x] BROWSE-02 anti-bulk grep gate: `grep -rnE 'limit:\s*[0-9]{3,}|limit:\s*Infinity' src/browse/` → 0.
- [x] `grep -rn 'skip:' src/browse/` → 0 (library uses `offset`).
- [x] `PAGE_SIZE = 50` literal present exactly once.
- [x] `INDEX_TTL_MS = 24 * 60 * 60 * 1000` literal present exactly once.
- [x] `mapStatus` appears ≥ 1 time.
- [x] `'ac'` and `'notac'` string literals each appear ≥ 1 time.
- [x] `difficulty?: string[]` and `status?: string[]` each appear exactly once in the filter signature.
- [x] Status-dimension test file has 6 `it(...)` blocks.
- [x] Pagination test file has 5 `it(...)` blocks and mentions all three status buckets.

## TDD Gate Compliance

- Task 1 RED: `02dd4b1` test(01-05): add failing search/filter tests (BROWSE-03, BROWSE-04 RED)
- Task 1 GREEN: `aaa4c8f` feat(01-05): implement ProblemListService search + filter (BROWSE-03, BROWSE-04)
- Task 2: `1ecfdec` test(01-05): add BROWSE-02 pagination + TTL + status-mapping tests
  (refresh() impl already in aaa4c8f; TDD-sequencing note above)
