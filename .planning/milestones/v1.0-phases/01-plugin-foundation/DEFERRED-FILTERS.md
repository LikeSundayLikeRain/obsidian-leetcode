# Deferred Filter Fields (tracked so we don't lose them)

The LeetCode problem browser filter modal supports 9 fields. Phase 1.x
implements 6; the remaining 3 require data sources that don't fit the
problem-list cache and are deferred to later phases.

## Deferred to Phase 3 (Run & Submit)

### Language filter
- **Why deferred:** LC's `supported_languages` is per-problem and not in the
  `problemsetQuestionList` query. Fetching requires a second query per
  problem (3300+ round trips).
- **Plan:** When Phase 3 adds per-problem detail fetch (for starter code),
  opportunistically cache `codeSnippets[].langSlug` and populate a
  `languages: string[]` field on `IndexedProblem` rows the user has opened.
  Filter then operates only on already-opened problems (or falls back to
  "all languages" for unopened rows).

### Last Submit range
- **Why deferred:** Requires user submission history — `recentSubmissionList`
  GraphQL query, hundreds-to-thousands of records, needs its own cache with
  a short TTL (~1h) and its own pagination.
- **Plan:** Phase 3 already touches submission data (verdict polling). Add
  a submission-history service that caches the user's last N submissions
  and joins against the problem index for filtering.

### Published range
- **Why deferred:** Each problem's published date is in `allQuestions` but
  not in `problemsetQuestionList`. Same issue as Language — bulk per-problem
  fetch required.
- **Plan:** Fold into the Phase 3 per-problem detail fetch. Cache
  `publishedAt` alongside other detail fields.

## Deferred to Phase 5 (Polish & Ship)

### Save as Smart List
- **Why deferred:** Settings-storage design, named filter sets, Smart-List
  UI in the modal, list-management surface. Not a Phase 1 ship gate.
- **Plan:** Add `smartLists: { name: string, rules: FilterRule[] }[]` to
  SettingsStore. Ship rename/delete UI in Phase 5 polish.

## Status (as of 2026-05-07)

| Field | Status |
|-------|--------|
| Status | ✓ Shipped Phase 1.x |
| Difficulty | ✓ Shipped Phase 1.x |
| Topics | ✓ Shipped Phase 1.x |
| Question ID range | ✓ Shipped Phase 1.x |
| Acceptance range | ✓ Shipped Phase 1.x |
| Premium content | ✓ Shipped Phase 1.x |
| Language | ✗ Deferred to Phase 3 |
| Last Submit range | ✗ Deferred to Phase 3 |
| Published range | ✗ Deferred to Phase 3 |
| Save as Smart List | ✗ Deferred to Phase 5 |
