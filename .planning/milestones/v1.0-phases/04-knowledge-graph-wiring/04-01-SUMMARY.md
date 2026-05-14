---
status: partial
plan: 04-01
phase: 04-knowledge-graph-wiring
type: execute
completed_tasks: [1]
deferred_tasks: [2, 3]
blocking_finding: research_drift
---

# Plan 04-01 SUMMARY (partial — phase paused at Wave 0 checkpoint)

## Status

**Partial completion.** Task 1 (test scaffolding) committed. Task 2 (live LC fixture capture) **surfaced a material drift in RESEARCH.md §Pattern B** that blocks the rest of Phase 4 from executing as planned. Task 3 (grep gate extension) is deferred pending replan.

Phase 4 is paused at the Wave 0 checkpoint. No further waves executed.

## What shipped (committed on worktree branch)

| Task | Status | Commit | Files |
|---|---|---|---|
| 1 — 15 test stubs + 2 fakes | ✓ complete | `6bddd3e` | `tests/graph/*.test.ts` (15), `tests/graph/mocks/fakeSubmissionHistoryFetcher.ts`, `tests/graph/mocks/fakeKnowledgeGraphDeps.ts` |
| 2 — Fixture capture (partial) | ⚠ 4/5 + drift finding | this commit | `tests/fixtures/lc-submissions/list-many.json`, `list-empty.json`, `list-session-expired.json`, `detail-ac.graphql.json`, `detail-wa.graphql.json`, `README.md` |
| 3 — Extend grep gate to cover `src/graph/` | ⏸ deferred | — | (one-line change; safe to run anytime — not executed here because phase is paused) |

`npm test -- --run tests/graph/` reports 15 test files red-failing with `Cannot find module` against `src/graph/**` imports, plus two `buildTechniqueFilename is not a function` errors against `src/notes/NoteTemplate.ts`. Zero harness-level failures. Describe-block names match 04-RESEARCH.md §Phase Requirements → Test Map verbatim (spot-check: `grep -h "^describe(" tests/graph/*.test.ts`).

## Key finding — RESEARCH §Pattern B / §A3 has materialized (MEDIUM → CONFIRMED)

LeetCode's submission-detail surface has migrated from server-rendered HTML to a Next.js SPA backed by GraphQL. The MEDIUM-risk assumption A3 ("HTML shape may drift") is now a confirmed material drift.

| RESEARCH.md assumption | Reality 2026-05-09 |
|---|---|
| `GET /submissions/detail/{id}/` returns HTML with `var pageData = {...};` to be regex-scraped | Returns a Next.js SPA shell (115 KB, no `pageData`, no `__NEXT_DATA__` with submission payload). The real payload loads via GraphQL XHR after hydration. |
| `submissionHistoryClient.detail` = HTML + regex scrape | Must become `POST /graphql/` with operation `submissionDetails($submissionId: Int!) { ... }` returning clean JSON (`runtime`, `memory`, `code`, `statusCode`, `lang.name`, `topicTags[].slug`, `user.username`, `question.titleSlug`, etc.). |
| Session-expired = HTML login-redirect (`<title>Log In`, `action="/accounts/login`) | `/api/submissions/` with no cookies returns **JSON 401** `{"detail": "Authentication credentials were not provided."}`. No natural HTML-redirect path remains. |

List endpoint `/api/submissions/{slug}/` is **unchanged** — Django JSON with `submissions_dump` array, all RESEARCH-noted keys intact (`id`, `status_display`, `lang`, `runtime`, `memory`, `timestamp`, `url`, `title_slug`).

### Impact on downstream plans

- **04-01 stubs** — `submissionHistoryClient.test.ts` subtest `detail scrapes pageData` is obsolete. `SubmissionDetailModal.test.ts` copy-to-code tests still valid (they operate on the response object shape, not the transport).
- **04-03 (`submissionHistoryClient`)** — implementation must use GraphQL POST, not HTML GET + regex. Session-expired detection must inspect HTTP status + JSON `detail` field, not HTML markers. `SessionExpiredError` semantics stay the same; the probe logic changes.
- **04-04 (`SubmissionDetailModal`)** — mostly unaffected. The modal renders the parsed detail object; it doesn't care how the transport extracted it.
- **04-05 (`main.ts` wiring)** — unaffected.
- **RESEARCH.md §Pattern B** — needs a rewrite against the GraphQL shape. The `04-CONTEXT.md` decisions D-27/D-28/D-29 need review: D-27 ("list maps wire shape") is still valid; D-27's detail-wire half ("detail scrapes pageData") must be replaced with "detail calls GraphQL `submissionDetails`".

## Fixtures captured (usable as-is post-replan)

| File | Shape | Real-wire-verified |
|---|---|---|
| `list-many.json` | `{submissions_dump: [20 rows with id, status_display, lang, runtime, memory, timestamp, url, code, title_slug, ...], has_next, last_key}` | ✓ |
| `list-empty.json` | `{submissions_dump: [], has_next: false, last_key: ""}` | ✓ |
| `list-session-expired.json` | `{"detail": "Authentication credentials were not provided."}` (HTTP 401 body) | ✓ |
| `detail-ac.graphql.json` | `{data: {submissionDetails: {runtime, memory, code, statusCode: 10, lang.name, topicTags, user.username (scrubbed), ...}}}` | ✓ |
| `detail-wa.graphql.json` | Same shape as AC but `statusCode: 11`, `topicTags: []` for this slug | ✓ |

See `tests/fixtures/lc-submissions/README.md` for the exact GraphQL query used and scrubbing proof.

## Recommended next action

**Run `/gsd-discuss-phase 4` or `/gsd-plan-phase 4 --gaps` to:**
1. Rewrite RESEARCH.md §Pattern B against the GraphQL shape.
2. Update 04-CONTEXT.md D-27 to reference the GraphQL transport.
3. Regenerate the 04-01 stub describe-block for `submissionHistoryClient.test.ts detail` (swap "scrapes pageData" → "calls GraphQL submissionDetails").
4. Rewrite 04-03 tasks to implement GraphQL client, not HTML scraper.
5. After replan, re-enter `/gsd-execute-phase 4` — the grep gate (Task 3) is a one-liner and can fold into the first wave of the replanned phase, or be shipped standalone first.

The Wave 0 checkpoint did its job: it caught a MEDIUM-risk assumption BEFORE any production code was written against the wrong wire shape.

## Files modified

- `tests/graph/*.test.ts` (×15) — test stubs
- `tests/graph/mocks/fakeSubmissionHistoryFetcher.ts`
- `tests/graph/mocks/fakeKnowledgeGraphDeps.ts`
- `tests/fixtures/lc-submissions/*.json` (×5) — live-captured fixtures
- `tests/fixtures/lc-submissions/README.md`

## Self-Check

- [x] Task 1 committed atomically (`6bddd3e`)
- [x] Fixtures scrubbed (grep for `mxyzptlk13|monsoon1013|Mo Xu|LEETCODE_SESSION=|csrftoken=` returns 0)
- [x] README documents drift + recapture procedure
- [x] No fabricated fixtures (where shape is unknown or drifted, surfaced to human not synthesized)
- [ ] Task 3 NOT executed — deferred to post-replan
- [ ] Phase 4 verification NOT run — phase paused at Wave 0 checkpoint
- [ ] Subsequent waves (04-02..04-06) NOT executed
