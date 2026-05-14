---
phase: 04-knowledge-graph-wiring
verified: 2026-05-09T19:10:00-07:00
human_verified: 2026-05-09T21:25:00-07:00
status: passed
score: 5/5 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "SubmissionDetailModal renders the code via MarkdownRenderer.render with proper Component lifecycle (Pitfall 7)"
    reason: "Implementation uses <pre><code class='language-*'> + textContent instead of MarkdownRenderer.render. User rejected the deviation during UAT test 10 and chose 'fix' — captured as a Phase 5 todo with resolves_phase: 5. Does not block Phase 4 goal achievement."
    accepted_by: "user (UAT Test 10, 2026-05-09) — accepted with deferred fix"
    accepted_at: "2026-05-09T21:25:00-07:00"
    deferred_todo: .planning/todos/pending/submission-detail-markdownrenderer-upgrade.md
    resolves_phase: 5
human_verification:
  - test: "Run Phase 4 end-to-end smoke test (04-06-PLAN.md-derived UAT)"
    expected: "AC triggers frontmatter + ## Techniques + stub creation; picker shows history; Copy-to-Code; opt-out; session-expiry Notice; non-AC skips; Graph View edges; visual/a11y; Phase 1-3 regression."
    why_human: "Live LeetCode account required."
    result: "10/10 UAT tests executed (04-UAT.md). 8 pass, 2 cosmetic/a11y deferred to Phase 5 (CE chip tint, light-mode focus ring), 1 deviation accepted with fix deferred (MarkdownRenderer upgrade). Two live-LC bugs surfaced during testing and were fixed in commit 3fe6c7d (GraphQL topicTags subselection + derive-from-topicSlugs fallback for pre-Phase-4 caches)."
gaps: []
deferred:
  - gap: "CE verdict chip tint reads red-ish, expected orange"
    source: 04-UAT.md test 6
    severity: cosmetic
    resolves_phase: 5
  - gap: "Focused submission row focus ring weak in light mode"
    source: 04-UAT.md test 6
    severity: minor
    resolves_phase: 5
  - gap: "SubmissionDetailModal syntax highlighting via MarkdownRenderer.render + Component lifecycle"
    source: 04-UAT.md test 10
    severity: minor
    resolves_phase: 5
    todo: .planning/todos/pending/submission-detail-markdownrenderer-upgrade.md
  - gap: "Settings UI toggle for autoBacklinksEnabled (D-20)"
    source: user request during UAT
    severity: minor
    resolves_phase: 5
    todo: .planning/todos/pending/settings-ui-auto-backlinks-toggle.md
---

# Phase 4: Knowledge Graph Wiring — Verification Report

**Phase Goal:** An Accepted submission atomically updates the problem note with solve-time frontmatter, `[[Technique]]` backlinks, and stub technique notes — turning every solve into a knowledge-graph citizen — without overwriting any user edits; `LeetCode: View past submissions` exposes LC's submission history with a read-only detail viewer and opt-in Copy-to-Code
**Verified:** 2026-05-09T19:10:00-07:00
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GRAPH-01: No `## Solution` heading; code lives in `## Code`; submission history surfaced via `LeetCode: View past submissions` command (picker + read-only detail + Copy-to-Code) | ✓ VERIFIED | `grep "## Solution"` in src/graph/ src/notes/ src/main.ts → only doc-comment rejecting the heading (NoteTemplate.ts:135). `view-past-submissions` command registered at main.ts:309. SubmissionPickerModal, SubmissionDetailModal, ConfirmOverwriteModal, copyToCode.ts all exist and are substantive. |
| 2 | GRAPH-02: `lc-status`, `lc-solved-date` (ISO-8601 local-tz), `lc-runtime-ms`, `lc-memory-mb`, `lc-language` updated via `processFrontMatter()` after AC | ✓ VERIFIED | `applySolveTimeFrontmatter` exported from NoteTemplate.ts (line 340). Called in KnowledgeGraphWriter.ts step 1 (line 147+). Uses Obsidian `processFrontMatter()` API (CF-06 compliant). |
| 3 | GRAPH-03: `## Techniques` section contains `[[Two Pointers]]`-style wikilinks per LC topic tag; graph edges appear | ✓ VERIFIED | `mergeTechniquesSection` imported and called in KnowledgeGraphWriter.ts (lines 56, 174). Wrapped in `vault.process()` for atomicity. Pitfall 10 guard at line 125 handles undefined topicTags. |
| 4 | GRAPH-04: Stub technique notes created in `{problemsFolder}/Techniques/`; never overwritten once created | ✓ VERIFIED | `createStubIfMissing` imported from StubNoteCreator.ts (line 57) and called per-tag in step 3 loop (line 199). D-18 never-overwrite discipline: `createStubIfMissing` only calls `vault.create`, pre-checks existence. |
| 5 | GRAPH-05: `autoBacklinksEnabled` flag disables auto-backlinks; frontmatter + `lc/{topic-slug}` tags still write when opt-out engaged | ✓ VERIFIED | `getAutoBacklinksEnabled()` check at KnowledgeGraphWriter.ts line 157. When false: steps 2+3 skipped, step 1 fires (confirmed by debug log at line 158). topicSlugs tag union runs before the autoBacklinksEnabled gate (line 125 topicTags array, step 1 uses topicSlugs for tag writes). |

**Score:** 5/5 truths verified

### Plan-Level Must_Have Deviations

One plan-level must_have (04-04) is not met by the implementation but does NOT block any ROADMAP success criterion:

| Plan | Must_Have | Status | Finding |
|------|-----------|--------|---------|
| 04-04 | "SubmissionDetailModal renders the code via MarkdownRenderer.render with proper Component lifecycle (Pitfall 7)" | ⚠ DEVIATION | Implementation uses `<pre><code class="language-*">` + textContent (SubmissionDetailModal.ts lines 99-104). No MarkdownRenderer import. SUMMARY acknowledges this explicitly, cites test determinism rationale. Phase 5 is flagged for syntax highlighting upgrade. User-visible outcome ("read-only code viewer") is achieved. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/graph/dateFormat.ts` | ISO-8601 local-tz formatter | ✓ VERIFIED | 48 LoC, exports `toIsoLocalTz` |
| `src/graph/mergeTechniquesSection.ts` | Union-merge pure transform for ## Techniques | ✓ VERIFIED | 243 LoC, exports `mergeTechniquesSection` |
| `src/graph/StubNoteCreator.ts` | Idempotent stub note creation | ✓ VERIFIED | 74 LoC, exports `ensureTechniquesFolder`, `createStubIfMissing` |
| `src/graph/submissionHistoryClient.ts` | GraphQL submission list + detail client | ✓ VERIFIED | Exports `listSubmissionsForSlug`, `detailForSubmission`; uses `operationName: 'submissionList'` and `operationName: 'submissionDetails'` |
| `src/graph/KnowledgeGraphWriter.ts` | On-AC 3-step pipeline (frontmatter → ## Techniques → stubs) | ✓ VERIFIED | D-23 gate (line 111), D-20 gate (line 157), D-19 silent stubs (lines 199-204), Pitfall 10 guard (line 125) |
| `src/graph/SubmissionPickerModal.ts` | List modal for past submissions | ✓ VERIFIED | Wired with optional `submissionHistoryStore` field |
| `src/graph/SubmissionDetailModal.ts` | Read-only detail viewer | ✓ VERIFIED | Uses `<pre><code>` + textContent (not MarkdownRenderer — see deviation above) |
| `src/graph/ConfirmOverwriteModal.ts` | Destructive overwrite gate | ✓ VERIFIED | Cancel default-focused (line 71) |
| `src/graph/copyToCode.ts` | vault.process rewrite of ## Code | ✓ VERIFIED | Imports and calls `forceInjectCodeSection` (line 26) |
| `src/graph/SubmissionHistoryStore.ts` | In-memory per-slug cache, 60s TTL, in-flight dedupe | ✓ VERIFIED | 6 contract tests all green |
| `src/notes/NoteTemplate.ts` | TECHNIQUES_HEADING_LINE, buildTechniquesBlock, buildTechniqueStubBody, buildTechniqueFilename, applySolveTimeFrontmatter | ✓ VERIFIED | 9 grep matches for technique helpers; `applySolveTimeFrontmatter` exported at line 340 |
| `src/settings/SettingsStore.ts` | autoBacklinksEnabled, topicTags cache field, getTechniquesFolder, getAutoBacklinksEnabled | ✓ VERIFIED | 14 grep matches for these symbols |
| `src/api/LeetCodeClient.ts` | isSessionExpired 2-arg overload (D-30) | ✓ VERIFIED | Lines 158-160: both overload signatures declared + implementation |
| `src/solve/leetcodeRest.ts` | authHeaders optional referer override; assertNotSessionExpired exported | ✓ VERIFIED | Confirmed by 04-03 SUMMARY and grep on authHeaders |
| `src/main.ts` | KnowledgeGraphWriter + SubmissionHistoryStore singletons; view-past-submissions command; on-AC hook | ✓ VERIFIED | `new SubmissionHistoryStore` (line 147), `new KnowledgeGraphWriter` (line 158), `id: 'view-past-submissions'` (line 309), `knowledgeGraph.onAccepted` (line 566) |
| `src/notes/NoteWriter.ts` | setOnNoteOpen setter + fireOnNoteOpen at 3 reveal sites | ✓ VERIFIED | `setOnNoteOpen` (line 137), `fireOnNoteOpen` (lines 196, 266, 349) |
| `tests/graph/SubmissionHistoryStore.test.ts` | 6 contract tests | ✓ VERIFIED | All 6 pass in 435-test suite |
| `tests/fixtures/lc-submissions/` | 6 live-captured fixtures | ✓ VERIFIED | list-many.json, list-many.graphql.json, list-empty.json, list-session-expired.json, detail-ac.graphql.json, detail-wa.graphql.json |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/graph/submissionHistoryClient.ts` | `https://leetcode.com/graphql/` | `operationName: 'submissionList'` | ✓ WIRED | Grep confirmed: operationName literal present; URL assembled from BASE_URL constant (not a raw string literal) |
| `src/graph/submissionHistoryClient.ts` | `https://leetcode.com/graphql/` | `operationName: 'submissionDetails'` | ✓ WIRED | Grep confirmed: operationName literal present |
| `src/graph/submissionHistoryClient.ts` | REST `/api/submissions/` list endpoint | (absent — D-27 compliance) | ✓ WIRED | grep `/api/submissions/` → 0 matches in file |
| `src/graph/submissionHistoryClient.ts` | HTML scrape `var pageData` | (absent — D-27 compliance) | ✓ WIRED | grep `var pageData` → 0 matches in file |
| `src/graph/KnowledgeGraphWriter.ts` | `mergeTechniquesSection` | import + call at step 2 | ✓ WIRED | Lines 56 (import), 174 (call inside vault.process) |
| `src/graph/KnowledgeGraphWriter.ts` | `createStubIfMissing` (D-19 silent) | try/catch per stub, swallowed to debug log | ✓ WIRED | Lines 199-204; each stub failure isolated |
| `src/graph/KnowledgeGraphWriter.ts` | `classifyStatus(...).kind === 'ac'` | D-23 gate | ✓ WIRED | Lines 54 (import), 111 (gate) |
| `src/graph/KnowledgeGraphWriter.ts` | `settings.getAutoBacklinksEnabled()` | D-20 opt-out gate | ✓ WIRED | Lines 76 (interface), 157 (check) |
| `src/graph/copyToCode.ts` | `forceInjectCodeSection` from starterCodeInjector | import + call | ✓ WIRED | Lines 26 (import), 49 (call) |
| `src/graph/ConfirmOverwriteModal.ts` | Cancel button default focus | `cancelBtn.focus()` after DOM append | ✓ WIRED | Lines 68-71 |
| `src/main.ts` | `KnowledgeGraphWriter.onAccepted` | on-AC hook after renderVerdict (D-08) | ✓ WIRED | Line 566 |
| `src/main.ts` | `submissionHistory.invalidate(ctx.slug)` | after on-AC (D-07 per-session freshness) | ✓ WIRED | Confirmed in SUMMARY; on-AC branch |
| `src/notes/NoteWriter.ts` | `setOnNoteOpen` hook fires at 3 reveal sites | `fireOnNoteOpen` calls | ✓ WIRED | Lines 196, 266, 349 |
| `src/graph/SubmissionDetailModal.ts` | `MarkdownRenderer.render` | import + call with Component lifecycle (Pitfall 7) | ✗ NOT_WIRED | Uses `<pre><code>` + textContent instead. Plan-level deviation. ROADMAP SC-1 does not require this rendering technique. See override suggestion. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `KnowledgeGraphWriter.onAccepted` | `terminal` (SubmitCheckResponse) | Phase 3 SubmissionOrchestrator → main.ts on-AC hook | Yes — live LC API response | ✓ FLOWING |
| `SubmissionPickerModal` | `SubmissionRow[]` | `SubmissionHistoryStore.get(slug)` → `listSubmissionsForSlug` → GraphQL POST | Yes — live LC GraphQL | ✓ FLOWING |
| `SubmissionDetailModal` | `SubmissionDetail` | `detailForSubmission(row.id, cookies)` → GraphQL POST | Yes — live LC GraphQL | ✓ FLOWING |
| `NoteTemplate.applySolveTimeFrontmatter` | `lc-status`, `lc-solved-date`, etc. | terminal.status_msg, status_runtime, status_memory, lang | Yes — parsed from LC response | ✓ FLOWING |
| `mergeTechniquesSection` | `topicTags: string[]` | `SettingsStore.getProblemDetail(slug).topicTags` | Yes — cached from Phase 2/3 detail fetch | ✓ FLOWING (with Pitfall 10 guard for undefined cache entries) |

### Behavioral Spot-Checks

Step 7b: SKIPPED for live behaviors (require running Obsidian + live LC account). Automated subset:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (435 tests) | `npm test -- --run` | 435/435 pass, 69/69 files | ✓ PASS |
| No vault.modify in graph/ or main.ts | `grep -n "vault\.modify" src/graph/*.ts src/main.ts` | 0 matches | ✓ PASS |
| No ## Solution creation path | `grep "## Solution" src/graph/ src/notes/ src/main.ts` | 1 match: doc-comment rejecting the heading | ✓ PASS |
| GraphQL operationNames present | `grep operationName submissionHistoryClient.ts` | 'submissionList' + 'submissionDetails' both present | ✓ PASS |
| REST list endpoint absent (D-27) | `grep /api/submissions/ submissionHistoryClient.ts` | 0 matches | ✓ PASS |
| HTML scrape absent (D-27) | `grep "var pageData" submissionHistoryClient.ts` | 0 matches | ✓ PASS |
| D-30 isSessionExpired 2-arg overload | `grep "isSessionExpired" LeetCodeClient.ts` | Both overload signatures at lines 158-160 | ✓ PASS |
| D-19 silent stubs (per-stub catch) | KnowledgeGraphWriter.ts lines 199-204 | Per-stub try/catch swallowed to debug log | ✓ PASS |
| Pitfall 10 guard | KnowledgeGraphWriter.ts line 125 | `Array.isArray(detail?.topicTags) ? detail.topicTags : []` | ✓ PASS |
| Cancel default focus | ConfirmOverwriteModal.ts lines 68-71 | `cancelBtn.focus()` explicitly called | ✓ PASS |
| copyToCode reuses forceInjectCodeSection | copyToCode.ts line 26 | Import confirmed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GRAPH-01 | 04-04, 04-05 | Submission history via picker (no ## Solution) | ✓ SATISFIED | view-past-submissions command wired; no ## Solution creation path found |
| GRAPH-02 | 04-03, 04-05 | Solve-time frontmatter update on AC | ✓ SATISFIED | `applySolveTimeFrontmatter` + KnowledgeGraphWriter step 1 |
| GRAPH-03 | 04-02, 04-03 | ## Techniques wikilinks + graph edges | ✓ SATISFIED | mergeTechniquesSection wired in vault.process |
| GRAPH-04 | 04-02, 04-03 | Stub technique notes, never overwrite | ✓ SATISFIED | createStubIfMissing with existence pre-check |
| GRAPH-05 | 04-02, 04-03, 04-05 | autoBacklinksEnabled opt-out | ✓ SATISFIED | D-20 gate at KnowledgeGraphWriter line 157 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/grep-no-vault-modify.sh` | All | Does not cover `src/graph/` or `src/main.ts` — 04-01 Task 3 was deferred | ℹ Info | Manual grep confirms 0 `vault.modify` in both paths; gate is incomplete but the property it guards holds |
| `src/graph/KnowledgeGraphWriter.ts` | Comments | Two private ISO-8601 formatters exist: one in NoteTemplate.ts and one in dateFormat.ts | ℹ Info | Intentional duplication to keep NoteTemplate's import surface stable; documented in SUMMARY |

No TODO/FIXME/placeholder patterns found in any Phase 4 source files. No hardcoded empty arrays/objects in rendering paths. No `vault.modify` calls. No `innerHTML` in new files.

### Human Verification Required

#### 1. Phase 4 End-to-End Smoke Test (04-06-PLAN.md)

**Test:** Execute all 49 checks in 04-06-PLAN.md against a live LeetCode account in a dedicated test Obsidian vault. Sections: A (fresh AC graph write), B (picker), C (Copy-to-Code), D (opt-out), E (session expiry), F (non-AC skip), G (visual/a11y), H (Phase 1-3 regression).

**Expected:** All 49 checks pass. Key behaviors:
- AC submission produces frontmatter update (lc-status, lc-solved-date in local-tz, lc-runtime-ms, lc-memory-mb, lc-language) + ## Techniques wikilinks + Techniques/ stub files
- Picker shows submission history with verdict chips; clicking row opens detail modal with code rendered
- Copy-to-Code over non-empty ## Code fires ConfirmOverwriteModal with Cancel default-focused; pressing Enter dismisses without overwriting
- autoBacklinksEnabled=false: frontmatter + lc/{topic-slug} tags write, no ## Techniques, no stubs
- Session expiry during picker fetch fires exact Notice copy `LeetCode session expired. Log in again.`
- WA verdict leaves existing ## Techniques unchanged, lc-status not downgraded

**Why human:** Requires live LeetCode account + credentials. Cannot test: real GraphQL wire shape correctness, Obsidian Graph View edge rendering, visual chip colors + dark mode contrast, keyboard tab navigation in live modal, MarkdownRenderer syntax highlighting (deviation from plan — only verifiable in live Obsidian).

#### 2. MarkdownRenderer.render deviation acceptance decision

**Test:** Visually inspect `LeetCode: View past submissions` → click a row → observe code rendering in SubmissionDetailModal.

**Expected:** Code is legible and correctly displayed. If syntax highlighting is absent (because `<pre><code>` is used instead of MarkdownRenderer.render), determine whether this is acceptable for Phase 4 or requires a gap-closure plan.

**Why human:** The plan's must_have specified MarkdownRenderer.render. The implementation uses `<pre><code>` + textContent. The SUMMARY documents this as intentional. A human decision is needed: accept the deviation (add the override to VERIFICATION.md frontmatter) or treat as a gap requiring fix before Phase 4 closes.

### Gaps Summary

No automated-verifiable gaps found. All 5 ROADMAP success criteria are verified in the codebase. The one plan-level deviation (MarkdownRenderer.render not used) is intentional per SUMMARY, does not block any ROADMAP success criterion, and requires a human acceptance decision.

**Phase 4 automated checks: PASSED.** Awaiting 04-06 human smoke test and MarkdownRenderer deviation acceptance before phase can be marked complete.

---

_Verified: 2026-05-09T19:10:00-07:00_
_Verifier: Claude (gsd-verifier)_
