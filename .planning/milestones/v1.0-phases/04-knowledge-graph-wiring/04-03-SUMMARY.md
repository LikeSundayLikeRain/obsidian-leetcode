---
phase: 04-knowledge-graph-wiring
plan: 04-03
subsystem: graph
tags: [submission-history, graphql-client, knowledge-graph-writer, on-accepted-pipeline, session-expiry]
requires:
  - 04-02 (mergeTechniquesSection, StubNoteCreator, buildTechniqueStubBody, buildTechniqueFilename, applyFrontmatter union-merge semantics)
  - 04-01 (GraphQL fixtures + rewritten test contracts)
  - 03-04 (leetcodeRest.authHeaders, assertNotSessionExpired, throttledRequestUrl pipe)
  - 02 (DetailCacheEntry.topicTags + topicSlugs schema, processFrontMatter atomicity)
  - 01 (isSessionExpired helper, SessionExpiredError, requestUrl adapter)
provides:
  - KnowledgeGraphWriter.onAccepted — single on-AC entry point for main.ts
  - applySolveTimeFrontmatter — 5-field solve-time frontmatter writer + tag union
  - listSubmissionsForSlug / detailForSubmission — GraphQL submission client
  - isSessionExpired(body, status) — widened D-30 overload covering 401/403/200+errors
  - authHeaders(slug, cookies, refererOverride) — referer override for /submissions/detail/{id}/
  - assertNotSessionExpired — now exported for sibling clients
affects:
  - src/api/LeetCodeClient.ts (isSessionExpired overload — new 2-arg shape)
  - src/solve/leetcodeRest.ts (authHeaders signature — new optional 3rd param; assertNotSessionExpired visibility)
  - src/notes/NoteTemplate.ts (new applySolveTimeFrontmatter export)
tech-stack:
  added: []
  patterns: [GraphQL POST via throttledRequestUrl, Int!-typed submissionId with numeric-guard defensive check, authHeaders referer override for 403-sensitive queries, one-atomic-per-concern pipeline (processFrontMatter → vault.process → vault.create), D-20 gate for opt-out, Pitfall 10 gate for pre-Phase-4 caches]
key-files:
  created:
    - src/graph/submissionHistoryClient.ts
    - src/graph/KnowledgeGraphWriter.ts
  modified:
    - src/api/LeetCodeClient.ts (isSessionExpired overload)
    - src/solve/leetcodeRest.ts (authHeaders referer param; assertNotSessionExpired export)
    - src/notes/NoteTemplate.ts (applySolveTimeFrontmatter + SolveTimeFrontmatterInput)
decisions:
  - D-27 revised (GraphQL for both list + detail) — honored via single-transport client
  - D-28 revised (all GraphQL through throttledRequestUrl) — honored; no new HTTP path
  - D-29 revised (referer /submissions/detail/{id}/ for detail calls) — honored via authHeaders refererOverride
  - D-30 new (status-aware session-expiry signals) — honored via isSessionExpired(body, status) overload
  - D-08 single on-AC entry point — KnowledgeGraphWriter.onAccepted
  - D-09 one-atomic-per-concern (not one-atomic-per-note) pipeline
  - D-11 topic-slug → lc/{slug} tag union on every AC
  - D-20 opt-out scope: skip ## Techniques + stubs, still fire lc-* + lc/{slug} tags
  - D-23 classifyStatus === 'ac' gate, everything else short-circuits
  - D-24 re-AC reflects latest (not best-ever) — runtime/memory overwrite
  - Pitfall 10 pre-Phase-4 cache entries (topicTags undefined) → step 1 still fires
metrics:
  duration_minutes: ~22
  tasks_completed: 2
  files_modified: 5
  files_created: 2
  tests_in_scope_passing: 17 (6 submissionHistoryClient subtests + 11 onAccepted subtests)
  tests_full_suite: 420 pass / 4 fail (Wave 2 targets — out of scope)
  completed_at: 2026-05-09T18:29-07:00
---

# Phase 4 Plan 3: submissionHistoryClient + KnowledgeGraphWriter Summary

**One-liner:** Post-GraphQL-drift submission client + on-Accepted knowledge-graph pipeline; widens isSessionExpired to cover LC's three session-expiry shapes and lands the invisible-by-design writer that flips five solve-time frontmatter fields, union-merges topic tags, writes ## Techniques wikilinks, and creates stub technique notes.

## What shipped

Two commits on `worktree-agent-a5dd6896959520eec`:

| Task | Commit | Headline |
|---|---|---|
| 1 — submissionHistoryClient (GraphQL) + D-30 overload | `279f162` | New GraphQL client for submission list + detail; isSessionExpired widened with (body, status) overload; authHeaders gains referer override; assertNotSessionExpired exported |
| 2 — KnowledgeGraphWriter + applySolveTimeFrontmatter | `18366da` | On-AC three-stage pipeline (frontmatter → ## Techniques → stubs); 5-field solve-time frontmatter writer with lc/{slug} tag union |

### Task 1 — src/graph/submissionHistoryClient.ts (D-27/D-28/D-29/D-30 revised)

**Transport (D-27, D-28):** Both list AND detail flow through `POST https://leetcode.com/graphql/` via Phase 3's `throttledRequestUrl` pipe. `content-type: application/json`, body `JSON.stringify({ query, variables, operationName })`. One transport, one failure mode, one session-expiry check — exactly the D-27 rationale for rejecting REST-list + GraphQL-detail hybrid.

**Two exports:**
- `listSubmissionsForSlug(slug, cookies) → SubmissionRow[]` — `operationName='submissionList'`, query `questionSubmissionList(offset, limit, lastKey, questionSlug)`. Normalises LC's wire shape (string timestamps → number, defensive `topicTags` mapping, fallback defaults on missing primitives) into SubmissionRow[].
- `detailForSubmission(id, cookies) → SubmissionDetail` — `operationName='submissionDetails'`, query `submissionDetails($submissionId: Int!)`. Parses id string → number with `/^[0-9]+$/` guard + finite-positive integer check BEFORE any network call (T-04-03-02 mitigation — blocks `'not-a-number'`, `'../../admin'`, `''` at the boundary).

**Headers (D-29 revised):** List call uses the Phase 3 default referer (`/problems/{slug}/description/`); detail call passes `refererOverride = /submissions/detail/{id}/` through the extended `authHeaders()` — LC returns 403 on the detail query without this.

**Session-expiry (D-30 new):** Both exports funnel through `assertNotGraphqlSessionExpired(status, body)` which delegates to the widened `isSessionExpired(body, status)` overload (see below). Signals fired:
- HTTP 401 with JSON `{"detail": "Authentication credentials were not provided."}` (REST/GraphQL unauthenticated)
- HTTP 403 bare (expired csrftoken against GraphQL)
- HTTP 200 + `body.errors[].message` matching `/auth(enticat|oriz)/i` (GraphQL 200+errors shape)

Throws `SessionExpiredError` on any match. Other 4xx/5xx throw generic `Error` with a 200-char text excerpt for the picker's inline-in-modal error handling (D-06).

**No @leetnotion/leetcode-api dependency on this path.** Library lags LC's drift (still uses obsolete HTML scrape for submission family — D-27 rejected alternative).

### Task 1 — src/api/LeetCodeClient.ts (isSessionExpired D-30 overload)

Two overloads now declared:
```ts
export function isSessionExpired(resp: unknown): boolean;
export function isSessionExpired(body: unknown, status: number): boolean;
```

The 2-arg form is the new Phase 4 widening. Status-aware signals (401 / 403) fire first; otherwise it falls through to the original body-only signal (`data === null` primary; auth-ish `errors[]` secondary). Phase 1/3 callers (`NoteWriter`, `leetcodeRest.assertNotSessionExpired`, `AuthService`) continue calling the 1-arg form unchanged — contract preserved, no breaking change.

### Task 1 — src/solve/leetcodeRest.ts (authHeaders referer override)

Added optional third parameter to `authHeaders(slug, cookies, refererOverride?)`. Backward-compatible with every Phase 3 caller (`interpretSolution`, `submitSolution`, `checkSubmission` all omit the override and get the unchanged problem-description referer). New Phase 4 `detailForSubmission` supplies the `/submissions/detail/{id}/` override because LC otherwise returns 403. Also exported `assertNotSessionExpired` so the submission client reuses the same Phase-3 guard pattern (though in practice the GraphQL client uses the tighter status-aware form via the D-30 overload).

### Task 2 — src/graph/KnowledgeGraphWriter.ts (D-08 through D-24)

Singleton writer with one public method: `onAccepted(ctx, terminal)`. Entry contract:
- `ctx` — `{ file, slug, title }` (minimal Phase-3 ProblemContext fragment)
- `terminal` — the terminal `SubmitCheckResponse` from Phase 3's orchestrator

**Gate (D-23, CF-18):** `classifyStatus(terminal.status_code, terminal.status_msg).kind === 'ac'`. Non-AC / unknown verdicts short-circuit with a debug log; no frontmatter touches, no body writes, no vault.create.

**Pipeline (D-09):**

1. **Frontmatter always** — `applySolveTimeFrontmatter`:
   - `lc-status = 'accepted'` (overwrites any prior state on re-AC per D-24)
   - `lc-solved-date = toIsoLocalTz(new Date())` — ISO-8601 local-tz, DST-aware
   - `lc-runtime-ms`/`lc-memory-mb` — parsed from `status_runtime` (`"12 ms"` → 12) and `status_memory` (`"14.2 MB"` → 14.2); on LC `"N/A"` the field is **explicitly cleared** (D-24: latest, not best-ever, so stale values don't linger)
   - `lc-language = terminal.lang` (falls back to `'unknown'` if omitted)
   - `tags` union-merge: existing tags + `lc/{slug}` for each `detail.topicSlugs` entry
   - All non-lc user keys untouched

2. **## Techniques body** — gated by `settings.getAutoBacklinksEnabled() === true` AND `detail.topicTags.length > 0`. Uses `mergeTechniquesSection` (Plan 04-02 pure transform) inside `vault.process` — idempotent, retry-safe under Obsidian's conflict retry.

3. **Stub technique notes** — gated same as step 2. Calls `ensureTechniquesFolder(app, settings.getTechniquesFolder())`, then loops over `detail.topicTags` emitting `buildTechniqueFilename(name)` + `buildTechniqueStubBody(slug, name)` via `createStubIfMissing`. **Per-stub failures are silent** (D-19) so disk-full on one stub doesn't block the others or revert the ## Techniques section write.

**Pre-Phase-4 cache safety (Pitfall 10):** If `detail.topicTags` is undefined/empty (old cache entry written before Phase 2 D-12 added the field), steps 2+3 skip — step 1 still fires using `topicSlugs` for the lc/{slug} tag contribution, so the graph isn't empty.

**Opt-out scope (D-20):** `autoBacklinksEnabled = false` skips steps 2+3 only; step 1 (including `lc/{slug}` tags) still fires. Rationale: tags are lightweight graph fuel; user's opt-out is about folder clutter, not topic awareness.

**Invisible by design (CF-19):** No `new Notice()` on write success or failure. The VerdictModal already renders "Accepted" — adding a second toast would be noise. Debug logs capture each stage's outcome for troubleshooting.

**## Code never touched (GRAPH-01 revised, D-01):** The writer has zero code paths that rewrite `## Code`. Verified in tests/graph/onAccepted.frontmatter.test.ts `on AC does not modify ## Code`.

### Task 2 — src/notes/NoteTemplate.ts#applySolveTimeFrontmatter

New solve-time frontmatter writer distinct from the existing open/refresh `applyFrontmatter`. Key differences:
- Writes FIVE lc-* keys (not seven) — problem-identity fields (lc-id, lc-slug, lc-title, lc-difficulty, lc-url) are already persisted on note creation.
- Opposite non-downgrade posture: ALWAYS upgrades lc-status to 'accepted'. The D-04 preservation guard in the original `applyFrontmatter` protects re-opens; this solve-time writer IS the upgrade path.
- N/A-handling: explicitly clears `lc-runtime-ms`/`lc-memory-mb` rather than preserving prior values (D-24 latest-not-best semantic).
- Duplicates `formatIsoLocalTz` as a local private helper (keeps NoteTemplate's import surface stable; Plan 04-02's `src/graph/dateFormat.ts` export is still the canonical caller-facing helper for non-frontmatter paths).

## Verification

### In-scope tests
All 17 tests in the plan scope pass:

```
tests/graph/submissionHistoryClient.test.ts (6/6):
  ✓ list calls questionSubmissionList GraphQL
  ✓ detail calls submissionDetails GraphQL
  ✓ detail rejects non-numeric submission id
  ✓ list fires SessionExpiredError on JSON 401
  ✓ list fires SessionExpiredError on 403 bare
  ✓ detail fires SessionExpiredError on 200 with errors[] auth message

tests/graph/onAccepted.frontmatter.test.ts (3/3)
tests/graph/onAccepted.gate.test.ts (2/2)
tests/graph/onAccepted.tags.test.ts (2/2)
tests/graph/onAccepted.optOut.test.ts (1/1)
tests/graph/onAccepted.missingTopicTags.test.ts (2/2)
tests/graph/onAccepted.reAccepted.test.ts (1/1)
```

### Full regression suite

```
Test Files  4 failed | 64 passed (68)
Tests       420 passed (420)
```

The 4 remaining failing files are Wave 2 targets out of this plan's scope:
- `tests/graph/copyToCode.test.ts` + `tests/graph/copyToCode.confirm.test.ts` — target `src/graph/copyToCode.ts` (Wave 2)
- `tests/graph/SubmissionPickerModal.test.ts` — target `src/graph/SubmissionPickerModal.ts` (Wave 2)
- `tests/graph/SubmissionDetailModal.test.ts` — target `src/graph/SubmissionDetailModal.ts` (Wave 2)

Their failure mode is module-not-found at transform time — identical to the Wave 0 red baseline. Zero regressions in Phase 1/2/3 tests.

### Type-check + lint

`npx tsc --noEmit` — clean for all Plan 04-03 files. Residual TS2307 errors are the same four Wave 2 missing-module cases.

`npx eslint src/graph/submissionHistoryClient.ts src/graph/KnowledgeGraphWriter.ts src/api/LeetCodeClient.ts src/solve/leetcodeRest.ts src/notes/NoteTemplate.ts` — clean, 0 errors 0 warnings after narrowing `raw.id ?? ''` to primitive types (typescript-eslint/no-base-to-string mitigation).

### Discipline gates

- `scripts/grep-no-vault-modify.sh` — passes. No `vault.modify()` in src/notes or src/browse.
- No `vault.modify()` in new `src/graph/` files (verified via grep).
- No `innerHTML`, no `fetch`, no `axios`, no direct `requestUrl` — all LC HTTP through `throttledRequestUrl` (CF-01).
- No new default hotkeys (no new commands added in this plan).
- No new Notice copy (invisible-by-design on-AC path; session-expiry Notice belongs to caller per D-06).
- No telemetry, no eval, no remote code (CF-05).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Runtime/memory N/A handling**
- **Found during:** Task 2 test run (onAccepted.frontmatter.test.ts "parses runtime/memory")
- **Issue:** Initial implementation left `lc-runtime-ms`/`lc-memory-mb` untouched when LC returns "N/A", preserving the prior AC's value. Test expected the field to be `undefined || NaN || null` on the second (N/A) AC call.
- **Fix:** Changed `applySolveTimeFrontmatter` to explicitly assign `undefined` on parse failure, matching D-24's "reflect the latest AC" semantic — frontmatter should not carry stale runtime/memory from a prior submission when the new submission's telemetry is unavailable.
- **Files modified:** `src/notes/NoteTemplate.ts`
- **Commit:** folded into Task 2's `18366da`

**2. [Rule 2 — Missing safety] raw.id stringification hardening**
- **Found during:** Task 2 lint check after both source files landed
- **Issue:** `typescript-eslint/no-base-to-string` flagged `String(raw.id ?? '')` in `mapListRow` — if LC ever returns `raw.id` as an object, `String({…})` produces `"[object Object]"` instead of a useful id.
- **Fix:** Added an explicit primitive-narrowing step before `String()`: only accept `string | number` for id; malformed rows fall back to `''` (which flows through as an empty id and shows the picker row inert-but-visible rather than triggering a crash).
- **Files modified:** `src/graph/submissionHistoryClient.ts`
- **Commit:** folded into Task 2's `18366da`

### Authentication gates

None. No live LC calls in this plan — all work was against fixture JSON captured in Plan 04-01 and the pre-existing mock-vault harness.

### Scope boundary observations

- **grep-no-vault-modify.sh** still only checks `src/notes/` and `src/browse/`, not `src/graph/`. Extending it is Task 3 of Plan 04-01 (deferred per 04-01-SUMMARY.md line 87). Deferred-items note: the extension is a one-line sed change in `scripts/grep-no-vault-modify.sh` and can be picked up in the next phase work.
- **NoteTemplate.ts now hosts a second ISO-8601 formatter (`formatIsoLocalTz` private helper)** that mirrors `src/graph/dateFormat.ts#toIsoLocalTz` byte-for-byte. The duplication is deliberate — keeping NoteTemplate's import graph stable vs. creating a cross-module runtime dep. If a future phase extracts date helpers to `src/shared/dates.ts`, both callers can converge.
- **`authHeaders` receives a sentinel `'_submission-detail'` slug from `detailForSubmission`** because the picker → detail boundary is id-driven, not slug-driven. The sentinel is harmless — the refererOverride replaces the slug-consuming header, and the cookie/csrftoken path doesn't touch the slug. Documented inline.

## Known Stubs

None. No hardcoded empty arrays/objects in plugin-visible rendering paths. All `KnowledgeGraphWriter` write stages are fully wired:
- Step 1 reads `detail.topicSlugs` from real `DetailCacheEntry`
- Step 2 reads `detail.topicTags` from real `DetailCacheEntry`
- Step 3 reads `detail.topicTags` from real `DetailCacheEntry` + `settings.getTechniquesFolder()`

The only skip paths are intentional gates (D-20 opt-out, D-23 non-AC, Pitfall 10 pre-Phase-4 cache) — each documented inline with its decision reference.

## Threat Flags

None beyond the mitigations already captured in 04-CONTEXT.md:
- T-04-03-02 (numeric-id guard on `detailForSubmission`) — mitigated via `/^[0-9]+$/` + finite-positive integer check before network call.
- T-04-02-02 (shape-guard on `autoBacklinksEnabled`) — honored; writer reads from `SettingsStore.getAutoBacklinksEnabled()` which already shape-guards malformed data.json.
- T-04-02-03 (shape-guard on `topicTags` cache field) — honored; `SettingsStore.isValidDetailCacheEntry` already rejects malformed entries.
- T-04-03-01 (Runtime/memory parse failure does not crash writer) — honored; explicit `Number.isFinite` guards + fallback to `undefined`.

No new network endpoints, no new auth paths, no new trust boundaries introduced.

## Self-Check: PASSED

Commits verified on branch:
- `279f162` — `feat(04-03): add submissionHistoryClient (GraphQL) + D-30 session-expiry overload` ✓ present in `git log --all`
- `18366da` — `feat(04-03): add KnowledgeGraphWriter + solve-time frontmatter writer` ✓ present in `git log --all`

Files created + content verified:
- `src/graph/submissionHistoryClient.ts` ✓ exists
- `src/graph/KnowledgeGraphWriter.ts` ✓ exists

Files modified + content verified:
- `src/api/LeetCodeClient.ts` — isSessionExpired overload present
- `src/solve/leetcodeRest.ts` — authHeaders 3rd param present; assertNotSessionExpired exported
- `src/notes/NoteTemplate.ts` — applySolveTimeFrontmatter exported

All 17 in-scope tests pass. No regressions in 420-test regression suite. Lint clean. Typecheck clean.

STATE.md and ROADMAP.md intentionally untouched (orchestrator owns those writes per parallel-executor rules).
