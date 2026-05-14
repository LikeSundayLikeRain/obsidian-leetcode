# Phase 4: Knowledge Graph Wiring - Context

**Gathered:** 2026-05-09
**Updated:** 2026-05-09 — D-27/D-28/D-29 revised after Wave 0 drift finding
**Status:** Needs replan of 04-03 (submissionHistoryClient) against GraphQL

## Update log

**2026-05-09 drift revision:** Wave 0 fixture capture (see 04-01-SUMMARY.md) surfaced that LeetCode has migrated submission detail from server-rendered HTML + `var pageData` scrape to Next.js SPA + `POST /graphql/`. RESEARCH §A3 (MEDIUM-risk) has materialized. Narrowly-scoped changes to D-27, D-28 (signal list), D-29, `Claude's Discretion` (submission client bullet), and `deferred/avoid` pointers. All other 26 decisions unaffected. Re-run `/gsd-plan-phase 4 --gaps` after reading this file.

<domain>
## Phase Boundary

On an **Accepted** submission (and only on Accepted — never on AC-adjacent verdicts, never on unknown verdicts per Phase 3 D-15), the plugin performs **one atomic knowledge-graph write pass** against the active problem note:

1. **Frontmatter update** via `fileManager.processFrontMatter()` — flips `lc-status` to `accepted`, writes `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, and sets `lc-language` to the submission's actual language (not stale frontmatter).
2. **Topic-tag write** — expands the plugin's current-pass `tags[]` contribution to include `lc/{topic-slug}` for every LC topic tag on the problem (the Phase 2 D-05 deferred work lands here). Union-merge semantics from Phase 2 D-10 preserved — user tags untouched.
3. **`## Techniques` body write** — new plugin-owned H2 heading appended below `## Notes`. Contains a bulleted list of `[[<topicTag.name>]]` wikilinks, one per LC topic tag. Union-merge: plugin-derived links re-synced on each AC, user-added lines preserved.
4. **Stub technique-note creation** — for each wikilink that has no resolved target, create `{problemsFolder}/Techniques/{Name}.md` with minimal frontmatter only. Never overwritten once created.

Additionally, a **new submission-history surface** ships this phase (derived from the gray-area discussion, not originally in GRAPH-01..05):

5. **On note open, refetch problem detail AND submission history** (for this specific slug) in the background — same reveal-first silent-fail posture as Phase 2 D-11/D-12, but tightens the TTL for history to "always refetch on open" (history is volatile per LC's experience).
6. **`LeetCode: View past submissions`** command — opens a picker modal listing every submission for the active problem (AC + WA + TLE + CE + RE + MLE), with verdict chip, runtime, memory, date. Selecting a row opens a **read-only Submission Viewer** with the code + metadata + a `Copy to ## Code` button that confirms-then-overwrites the current `## Code` fenced block.

**`## Solution` is NOT created** — a deliberate revision of the ROADMAP Phase 4 draft per the discussion. The user's working code lives in `## Code` (Phase 3), AC history lives on LeetCode's servers (not in the note, not in data.json cache beyond the in-flight picker fetch).

Covers 5 requirements with scope revisions:
- **GRAPH-01:** Revised — no `## Solution` heading, no atomic code-append to the note. Accepted-code history is fetched live from LC on demand via the picker. ROADMAP success criterion 1 needs rewrite at phase transition.
- **GRAPH-02:** As-is — frontmatter fields written on AC.
- **GRAPH-03:** As-is — `[[Technique]]` wikilinks under a new `## Techniques` heading, one per LC topic tag.
- **GRAPH-04:** As-is — stub technique notes, never overwritten once created.
- **GRAPH-05:** Refined — opt-out skips `## Techniques` + stubs; frontmatter topic tags (`lc/{slug}`) still fire because they're lightweight graph fuel.
- **Phase 2 D-05 deferred scope:** Topic tags on first Accepted — implemented here.

Explicitly out of scope for Phase 4:
- `## Solution` heading as originally drafted in ROADMAP Phase 4 — **dropped**. Transition doc must rewrite ROADMAP §Phase 4 success-criterion 1.
- Overlay widget / chevron navigator on the `## Code` block — deferred to **Phase 5** (same lane as Phase 3 D-11 Run/Submit overlay buttons; MarkdownPostProcessor for Reading Mode; CM6 for Live Preview remains higher-risk).
- Stale-detect "insert fresh block if last AC > X days" behavior — dropped. The note holds ONE `## Code` block (Phase 3 D-08); picker + Copy-to-Code handles the "I want to start fresh from an old solution" flow.
- Caching submission history in `data.json` beyond the life of a single picker invocation.
- `Submission Viewer` → diff against current `## Code`. Nice-to-have; deferred to Phase 5.
- Settings UI control for opt-out toggle — scaffolded here (opt-out default ON, read from existing `SettingsStore`), but the visible settings control ships in **Phase 5 POLISH-01** alongside other Phase 4-owned toggles.
- Removing a wikilink when LC removes a topic tag from a problem — deferred; user-owned once written.
- Bases-file updates to reflect the new frontmatter fields (`lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`) — if the v0.1.0 → v0.2.0 Bases schema needs updating for these new columns, it's Phase 5 Polish (cosmetic).

</domain>

<decisions>
## Implementation Decisions

### Submission History & `## Code` (revised GRAPH-01)

- **D-01:** **No `## Solution` heading is created.** The user's code always lives in the single Phase 3 `## Code` fenced block. LC's server holds accepted-submission history; the plugin fetches it on demand. This is a deliberate revision of ROADMAP Phase 4 success criterion 1 — transition doc must rewrite the criterion to reflect the picker-based model. Rationale (from discussion): the author wants LC's own "all my submissions" experience in the Obsidian surface, not a bespoke per-note `## Solution` block. It also avoids the ownership tangle of plugin-owned code vs user-owned WIP under a single heading.

- **D-02:** **On note open, refetch both the problem detail AND the submission history** for the active slug. Problem-detail refetch respects Phase 2 D-11's 7-day TTL (unchanged). Submission-history refetch is **always live** — no TTL, no `data.json` cache persisted between picker invocations. Fetch runs after reveal (reveal-first, same as Phase 2). Failure is silent (Phase 2 D-12 silent-offline posture carries forward); the picker will show "No submissions" or fetch-failed message if the network hop failed.

- **D-03:** **`LeetCode: View past submissions` command** — added to Phase 3's command set (now a Phase-3/4-shared solve surface). Enabled only when the active editor has an `lc-slug` frontmatter entry (existing `editorCheckCallback` pattern from Phase 3 Plan 07). Invocation: fetch `/api/submissions/?question_slug={slug}` (or whichever GraphQL/REST surface the researcher confirms — **P0 research item**), render a `SubmissionPickerModal` with one row per submission:
  - Verdict chip (AC / WA / TLE / MLE / CE / RE) — colored, matching `statusMap` from Phase 3
  - Runtime + memory (when LC returns them)
  - Submission date — LC's native "X hours ago" / "Jan 3, 2026" format, or a researched ISO string the modal renders locally as ISO-8601 local-tz
  - Language slug (small chip, right-aligned)
  - Row click → opens `SubmissionDetailModal` (D-04).

- **D-04:** **`SubmissionDetailModal`** — read-only viewer. Chrome:
  - Title: `<status> · <problem title>` (e.g., `Accepted · Two Sum`)
  - Metadata row: runtime / memory / language / submitted-at (ISO-8601 local-tz)
  - Body: full code in a fenced block with syntax highlighting (use the same CM6 code-block render Obsidian's Markdown preview uses — `MarkdownRenderer.render`)
  - Footer buttons:
    - `Copy to ## Code` (primary) — confirms overwrite if current `## Code` is non-empty, then replaces the fenced block via `vault.process()`. Language tag of the new block = submitted language (not current fence tag). This is the only vault mutation the picker path does.
    - `Close`
  - **Confirm-overwrite modal:** if `## Code`'s current fenced block is non-empty, a second modal asks "Overwrite current code? [Yes / No]". Yes → vault.process rewrite. No → dismiss, no write.

- **D-05:** **Picker populates with ALL submissions** (AC + WA + TLE + CE + RE + MLE), not just Accepted. Verdict chip makes the state visually obvious. Sort: most recent first (LC's default). No filter toggle in Phase 4 — if list length becomes painful, filter controls are a Phase 5 Polish item.

- **D-06:** **Session-expiry + zero-submissions handling:**
  - Session expired → existing `isSessionExpired` path fires the locked `LeetCode session expired. Log in again.` Notice (Phase 1 / Phase 3 CF-04). Picker modal closes.
  - LC returns empty array → picker shows "No submissions yet." placeholder row. Dismissable.
  - LC returns a 4xx/5xx or the network fails → picker shows "Couldn't load submissions. Check your connection." inline — NOT a Notice (the user opened the picker explicitly; surface failure in the modal, not as a toast).

- **D-07:** **Submission-history persistence: NONE.** No `submissionHistory` map in `data.json`. Each picker invocation hits LC. Rationale: history is volatile (LC can change percentile, the user may have submitted from the web between picker opens), and the author's "experience matches LC" signal rules out cache staleness. Throttle (20 req / 10s) absorbs the spike; single invocation = single request + per-row detail is fetched only when the user selects (lazy).

### On-AC Write Pipeline (GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05, Phase 2 D-05 carry)

- **D-08:** **Single on-AC entry point:** a new `KnowledgeGraphWriter.onAccepted(ctx, checkResponse)` service. Called from `main.ts` immediately after `classifyStatus(terminal.status_code) === 'accepted'` in the `submitFromActive` command lambda (not inside `SubmissionOrchestrator` — the orchestrator is language/language-agnostic and shouldn't know about vault state). `ctx` is the Phase 3 `ProblemContext` (file, slug, title, currentBody). `checkResponse` is the terminal `SubmitCheckResponse` (runtime, memory, language_slug, etc.).

- **D-09:** **One atomic-per-concern pass, not one atomic-per-note pass.** The writer sequences:
  1. `fileManager.processFrontMatter()` — writes all 5 new lc-* keys + union-merges topic tags (Phase 2 D-10 pattern). Atomic within.
  2. `vault.process()` — rewrites the `## Techniques` region (appends if missing, union-merges if present). Atomic within.
  3. `vault.create()` calls — one per missing stub technique note. Each atomic within.
  
  Steps 2 and 3 are gated by the opt-out flag (D-16). Step 1 always fires on AC.

- **D-10:** **Frontmatter field shapes:**
  - `lc-status: accepted` — string, controlled vocabulary from `LC_STATUS_VALUES` in `NoteTemplate.ts`. The GAP-2a non-downgrade guard already protects this on future re-opens.
  - `lc-solved-date: 2026-05-09T14:32:01-07:00` — **ISO-8601 local-tz** string. Planner writes a tiny helper in `NoteTemplate.ts` (or `src/shared/dates.ts`): `toIsoLocalTz(date: Date): string`. Uses the Electron-host process's local TZ offset via `Intl.DateTimeFormat().resolvedOptions().timeZone` or equivalent. Test includes DST-boundary case.
  - `lc-runtime-ms: 12` — **number**. Parse LC's `"12 ms"` or `"status_runtime: '12 ms'"` response via `parseInt`; undefined on parse failure (write a debug log, still write status + date).
  - `lc-memory-mb: 14.2` — **number**. Parse `"14.2 MB"` via `parseFloat`. Same undefined-on-fail posture.
  - `lc-language: python3` — **string**, LC's `langSlug` (not the display name). Sourced from `checkResponse.lang` (or the submission language the orchestrator sent, which comes from `resolveLangSlug` per Phase 3 D-02).
  
  All five are already in the `PLUGIN_LC_KEYS` tuple in `NoteTemplate.ts` (Phase 2 D-03 locked the shape). Phase 4 just starts writing them on AC.

- **D-11:** **Topic tags on frontmatter — first-Accepted write triggers union-merge with `lc/{topic-slug}`.** Source: `problemDetails[slug].topicSlugs` (already cached from Phase 2 D-14). The writer reads the cache, maps each slug to `lc/<slug>` (no transformation — `two-pointers` → `lc/two-pointers`), and passes to `applyFrontmatter` via the current-pass tag set. Phase 2's union-merge preserves user tags and already-written tags. Resyncs on every AC (idempotent — same cached slugs → same tags).

- **D-12:** **`## Techniques` body content — bulleted wikilinks:**
  ```
  ## Techniques
  
  - [[Two Pointers]]
  - [[Hash Table]]
  - [[Sliding Window]]
  ```
  **Display name source:** LC's `topicTags[].name` (verbatim). Cached in Phase 2 `problemDetails[slug].topicTags` — **IMPORTANT:** Phase 2 currently caches only `topicSlugs: string[]` (D-14), not `topicTags: {name, slug}[]`. Phase 4 must **extend the `DetailCacheEntry` schema** to add `topicTags: Array<{ name: string; slug: string }>` alongside `topicSlugs`. `topicSlugs` stays (for the frontmatter tag write in D-11); `topicTags` is additive. Shape guard in `SettingsStore.isValidDetailCacheEntry` updated.
  
  **Ordering:** same order LC returns them in `topicTags`. Stable across re-fetches per LC's API. No alphabetical sort — respect LC's ordering (which in practice is roughly "most-representative first").

- **D-13:** **`## Techniques` ownership — union-merge on the bulleted list (new primitive).** Phase 2's D-09 `HeadingRegion.ts` handles whole-region replacement; Phase 4 needs finer-grained merge. Semantics:
  - **Plugin-derived links** = the set `{ [[<topicTag.name>]] | topicTag in detail.topicTags }`
  - **User-added lines under `## Techniques`** = any line that isn't a plugin-derived wikilink (`- [[...]]` where the target doesn't match a current topic tag)
  - **On write:** emit plugin-derived links as a bulleted list (sorted per D-12 ordering) + preserve user-added lines below a `<!-- user additions below -->` sentinel marker? NO — sentinel rejected in Phase 2 D-08. Instead: preserve user-added lines **in their original relative position** (before/after plugin-derived block, interleaved) via a diff-and-merge approach. Planner discretion on exact algorithm; the invariant is "plugin-derived links present exactly once; user lines untouched."
  - **New helper:** `src/graph/mergeTechniquesSection.ts` — pure string transform, like `HeadingRegion.ts` but aware of list items.

- **D-14:** **`## Techniques` insertion point in note body:** immediately after `## Notes` (if present) or at EOF if not. Final note shape becomes:
  ```
  ---
  <frontmatter with lc-solved-date, lc-runtime-ms, lc-memory-mb, lc-language, tags [lc/easy, lc/two-pointers, …]>
  ---
  
  ## Problem
  <turndown output>
  
  ## Code
  ```python3
  <user solution>
  ```
  
  ## Notes
  <user-authored>
  
  ## Techniques
  
  - [[Two Pointers]]
  - [[Hash Table]]
  
  ## Custom Tests  (if present from Phase 3)
  ### Case 1
  ...
  ```
  **Concrete anchor order in `NoteTemplate.ts`:** `## Problem` → `## Code` → `## Notes` → `## Techniques` → `## Custom Tests` (lazy, Phase 3 D-20).

### Stub Technique Notes (GRAPH-04)

- **D-15:** **Stub folder: sibling to problems folder, derived — `{problemsFolder}/Techniques/`**. No new settings field. `SettingsStore.getTechniquesFolder()` is a pure derivation: `return this.getProblemsFolder() + '/Techniques'` (respecting `sanitizeFolder`'s no-trailing-slash invariant). If user changes `problemsFolder` in Phase 5 settings, techniques move too — which is the right semantic (they're part of the LeetCode knowledge graph). Folder auto-created on first stub write via `vault.createFolder()` if missing.

- **D-16:** **Stub shape — frontmatter only, empty body:**
  ```yaml
  ---
  lc-technique: two-pointers
  aliases: [Two Pointers]
  tags: [lc/technique/two-pointers]
  ---
  ```
  Three fields:
  - `lc-technique: <slug>` — machine-readable identity, queryable in Dataview/Bases
  - `aliases: [<display-name>]` — so `[[Two Pointers]]` resolves and `[[two-pointers]]` also finds the note
  - `tags: [lc/technique/<slug>]` — mirror namespace for the problem-note `lc/<slug>` tag. Graph view clusters on tag; this lets the technique note be a graph-native hub.
  
  Empty body below the frontmatter. User writes their own notes.

- **D-17:** **Stub filename: `{topicTag.name}.md`** (e.g., `Two Pointers.md`, `Hash Table.md`). Uses LC's `.name` verbatim. Special-char normalization: LC names appear clean (title case, spaces, hyphens), but if a name contains vault-forbidden chars (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`), replace with `-`. Researcher confirms whether any LC topic tag names contain these (unlikely; defensive guard).

- **D-18:** **Never-overwrite discipline (matches GRAPH-04 + Phase 2 D-18 LeetCode.base pattern):**
  - If stub exists at `{path}`: no-op. Never `vault.modify`, never `vault.process`, never touch frontmatter.
  - If stub missing: `vault.create()` with the frontmatter-only body. Fails silently on conflict (another process created it between the check and the create) — the next AC write retries the check and finds it.
  - If user deletes the stub AND a new problem references the same technique: **re-create** (idempotent — D-18 of Phase 2 says "don't auto-recreate LeetCode.base", but techniques follow the opposite rule because a dangling `[[Two Pointers]]` link is worse UX than a stub appearing). This IS a divergence from the Phase 2 BaseFile pattern; planner notes the rationale.

- **D-19:** **Stub creation is NOT atomic with the on-AC write.** `processFrontMatter` runs on the problem note first (fast, local). `vault.process` rewrites `## Techniques` next. Then stub creation loops — one `vault.create` per missing stub. If a stub creation fails mid-loop, the `## Techniques` section still has the wikilink (correct — Obsidian will show it as unresolved). On next AC, the loop retries. Silent debug log on per-stub failure; no Notice (the note is already correctly updated).

### Opt-Out (GRAPH-05)

- **D-20:** **Opt-out scope: skip `## Techniques` body write + skip stub creation; still write `lc/{topic-slug}` frontmatter tags.** Rationale (from discussion): tags are lightweight graph fuel, drive `lc/two-pointers` tag searches, and don't create any new files. The opt-out user wants "no folder clutter, no inline link noise" — not "no topic metadata at all."

- **D-21:** **Opt-out flag: `autoBacklinksEnabled: boolean`, default `true`.** New field in `PluginData` + shape guard in `SettingsStore.isValidPluginData`. Phase 4 adds the getter/setter; the settings-UI control is a Phase 5 POLISH-01 item but the field itself must exist in Phase 4 so the writer respects it. Default `true` — the headline value of the plugin is "notes become a graph"; disabled-by-default hides the differentiator.

- **D-22:** **No first-run prompt modal.** The setting defaults ON and surfaces in Phase 5's Settings tab. Users can flip it off after seeing the first `## Techniques` block render. Rationale: modals on first action are friction; the graph view itself is the "aha" moment.

### Unknown Verdict + Edge Cases

- **D-23:** **Unknown verdicts do NOT fire the on-AC pipeline** (reiterates Phase 3 D-15). Only `classifyStatus(terminal.status_code) === 'accepted'` fires `KnowledgeGraphWriter.onAccepted`. Other terminal verdicts (WA/TLE/MLE/CE/RE) short-circuit.

- **D-24:** **Re-accepted submission (user solved the same problem a second time):** all five writes re-fire. `lc-solved-date` updates to the new submission's timestamp. `lc-runtime-ms` / `lc-memory-mb` overwrite with the new submission's values — even if worse. Rationale: the frontmatter reflects the **most recent** AC, not the best-ever. The picker shows the full history for "my fastest run was…" introspection.

- **D-25:** **Problem without any topic tags:** extremely rare (most LC problems have 1+ tags). The writer still fires frontmatter update (D-10); skips D-11 (no tag union-merge contribution); skips D-12 (no `## Techniques` write). Edge-case test required in Phase 4's test plan.

- **D-26:** **Opt-out toggled ON after notes have `## Techniques` sections written:** existing sections are NOT removed. Opt-out is a go-forward setting. User can manually delete `## Techniques` sections if they want to clean up; the plugin doesn't enforce retroactive cleanup. Rationale: user-owned content model (D-13) — if the plugin auto-cleans, it might delete user-added lines too.

### GraphQL / API Mechanics (revised 2026-05-09)

- **D-27 (revised):** **Submission-history transport — GraphQL for BOTH list and detail.** LC migrated the submission-detail surface from HTML scrape to Next.js SPA + GraphQL. The REST `/api/submissions/{slug}/` list endpoint still works and returns Django JSON, but for transport consistency (one client code path, one failure mode, one session-expiry check) Phase 4 uses GraphQL for both surfaces. Verified live 2026-05-09.
  - **List:** `POST https://leetcode.com/graphql/` with operation `submissionList`, query `questionSubmissionList(offset, limit, lastKey, questionSlug)`. Returns `{lastKey, hasNext, submissions: [{id, title, titleSlug, status, statusDisplay, lang, langName, runtime, timestamp, url, isPending, memory, hasNotes, notes, flagType, frontendId, topicTags}]}`. See `tests/fixtures/lc-submissions/list-many.graphql.json`.
  - **Detail:** `POST https://leetcode.com/graphql/` with operation `submissionDetails`, query `submissionDetails($submissionId: Int!)` (Int, not String — LC enforces). Returns `{data: {submissionDetails: {runtime, runtimeDisplay, runtimePercentile, memory, memoryDisplay, memoryPercentile, code, timestamp, statusCode, user{username, profile{realName, userAvatar}}, lang{name, verboseName}, question{questionId, titleSlug, hasFrontendPreview}, notes, flagType, topicTags{tagId, slug, name}, runtimeError, compileError, fullCodeOutput, testDescriptions, testBodies, testInfo}}}`. See `tests/fixtures/lc-submissions/detail-ac.graphql.json` and `detail-wa.graphql.json`.
  - **Picker populates from list**; row click **lazy-fetches detail via `submissionDetails`** (respects D-28 throttle).
  - **New file:** `src/graph/submissionHistoryClient.ts`. Two exports: `listSubmissionsForSlug(slug, deps) → SubmissionRow[]` and `detailForSubmission(id: string, deps) → SubmissionDetail`. **Mirrors the `src/solve/leetcodeRest.ts` shape** (Phase 3's hand-rolled REST wrapper) — no dependency on `@leetnotion/leetcode-api`'s submission-family helpers (the library's `submission(id)` still uses the obsolete HTML scrape per RESEARCH §Pattern B's 2026-04-03 note — independently broken from the same drift, so delegating would just push the same fix down a level).
  - **Rejected alternatives:** Keep REST list + GraphQL detail (hybrid — rejected to avoid two transports in one client); delegate to `@leetnotion/leetcode-api` (rejected — fork lags the drift).

- **D-28 (revised):** **All submission-history requests go through the existing `throttledRequestUrl` pipe** (Phase 3 CF-01, Phase 1 D-12). No new throttle layer. Method is `POST`, content-type `application/json`, body is `JSON.stringify({query, variables, operationName})`. Picker open = 1 list request; each row click = 1 detail request. Well under the 20req/10s ceiling. **No change** from original D-28 intent — just `POST` instead of `GET`.

- **D-29 (revised):** **Headers** for GraphQL calls:
  - `cookie: csrftoken=...; LEETCODE_SESSION=...` from `SettingsStore.getAuthCookies()` — unchanged
  - `content-type: application/json` — **new** (GraphQL POST needs this)
  - `x-csrftoken: {csrftoken}` — unchanged (LC GraphQL enforces)
  - `referer: https://leetcode.com/problems/{slug}/description/` for list calls; `https://leetcode.com/submissions/detail/{id}/` for detail calls — **revised** (detail referer must point at the detail URL, not the problem URL, or LC returns 403)
  - `x-requested-with`, `user-agent` — reuse `authHeaders()` helper in `leetcodeRest.ts`
  - `authHeaders()` MUST be extended to accept an optional `referer` override parameter so the detail call can supply the detail URL. Planner ensures the extension is backward-compatible with Phase 3 callers (default referer = problem description URL).

- **D-30 (new):** **Session-expiry signal for GraphQL + REST paths.** SessionExpiredError is thrown from the client on any of:
  - HTTP 401 with JSON body `{"detail": "Authentication credentials were not provided."}` (the unauthenticated REST 401 shape captured in `tests/fixtures/lc-submissions/list-session-expired.json`).
  - HTTP 403 (bare — LC sometimes returns plain 403 on expired GraphQL calls).
  - HTTP 200 with `response.errors[]` containing a message matching `/auth(enticat|oriz)/i`.
  - The existing `isSessionExpired(responseText)` helper in `src/api/LeetCodeClient.ts` is **extended** to accept an optional `(body: unknown, status: number)` overload for JSON inspection (backward-compatible: the string overload stays for Phase 1/3 callers). Planner writes the overload.
  - On fire: Notice copy `LeetCode session expired. Log in again.` (CF-19, CF-04). Picker closes (D-06). Existing auth flow handles re-login.

### Claude's Discretion

- Exact module layout under `src/graph/`. Expected files: `KnowledgeGraphWriter.ts` (orchestrator), `mergeTechniquesSection.ts` (pure transform), `StubNoteCreator.ts` (stub creation loop), `submissionHistoryClient.ts` (REST), `SubmissionPickerModal.ts`, `SubmissionDetailModal.ts`, `dateFormat.ts` (ISO-8601 local-tz helper). Planner may split/collapse.
- Whether `KnowledgeGraphWriter` is a singleton registered in `main.ts` (like `NoteWriter`) or a per-invocation factory. Prefer singleton — keeps opt-out flag access simple.
- Whether the submission picker's per-row detail fetch is prefetched on row hover (LC's own UX hint) or on click only. Prefer on-click — simpler + respects throttle.
- Picker row rendering: use `createEl()` (Phase 3 CF-07 discipline) with the same verdict-chip CSS classes the `VerdictModal` uses (e.g., `.leetcode-verdict-ac`, `.leetcode-verdict-wa`). Planner checks for CSS reuse.
- `SubmissionDetailModal`'s code rendering: use `MarkdownRenderer.render(app, '```' + lang + '\n' + code + '\n```', el, '', plugin)` so Obsidian's own CM6 highlighter renders the code. Researcher confirms this API is stable in 1.12.x.
- "Copy to ## Code" confirmation: simple `confirm()` native dialog vs Obsidian-styled modal. Prefer Obsidian-styled (consistent chrome); planner decides.
- Whether `lc-solved-date` persists a timezone-less `YYYY-MM-DD` in addition to the full ISO-8601. Default: no — single source of truth. If Dataview queries need date-only, they can derive with `date(lc-solved-date)`.
- Exact CSS class naming under `src/graph/` additions (follow Phase 1 `.leetcode-*` convention).
- Whether stub note frontmatter is written via `app.fileManager.processFrontMatter` (after create) or included in the initial `vault.create` body string. Prefer included-in-body — single I/O, stub is immediately complete.

### Wire-shape drift artifacts (2026-05-09)

- **Test stubs and fixtures already landed in Wave 0** (commits `6bddd3e` + `666abd3`) carry the OLD wire-shape assumptions. Specifically:
  - `tests/graph/submissionHistoryClient.test.ts` describe blocks `'list maps wire shape'` (still valid), `'detail scrapes pageData'` (OBSOLETE — rewrite against `submissionDetails` GraphQL), `'list fires SessionExpiredError on 302/401/403/login-HTML'` (REVISE — now JSON 401 + GraphQL 403 + errors[]), `'detail fires SessionExpiredError on login-redirect'` (REVISE — same). **Replan of 04-01 must regenerate these describe names** to match D-27/D-30 revised.
  - `tests/fixtures/lc-submissions/list-many.json` (REST JSON — keep; useful if the GraphQL surface breaks later), `list-empty.json` (keep), `list-session-expired.json` (keep — represents the JSON 401 body), plus the three NEW `list-many.graphql.json`, `detail-ac.graphql.json`, `detail-wa.graphql.json` (authoritative for the new client).
  - The stale `detail-ac.html`, `detail-wa.html`, `list-session-expired.html` Chrome "View Source" files were removed during the 04-01 drift-commit; no action needed.
- **04-03 PLAN.md and stub test names must be regenerated** via `/gsd-plan-phase 4 --gaps`. The other 5 plans (04-02, 04-04, 04-05, 04-06, 04-01 task 3) are unaffected by this drift.
- **RESEARCH.md §Pattern B** is stale — planner/researcher rewrites §Pattern B during the regen pass. The `@leetnotion/leetcode-api` verification note in §Pattern B (line 523) referring to "HTML scrape" is now inaccurate for LC itself; the library may also be stale but that's no longer Phase 4's problem since we're not delegating.

### Carried Forward from PROJECT.md / STATE.md / Phase 1, 2, 3 CONTEXT.md (not re-asked)

- **CF-01:** All LC calls via `api/throttle.ts → throttledRequestUrl`. Phase 4's submission-history fetch uses the same pipe. (Phase 1 D-12, Phase 2 CF-01, Phase 3 CF-01.)
- **CF-02:** `isDesktopOnly: true` stays. No new Electron imports in Phase 4. (Phase 1 CF-02 through Phase 3 CF-02.)
- **CF-03:** Session cookie + CSRF only in `data.json`; never logged, never sent off leetcode.com. Phase 4's REST reads them via `SettingsStore.getAuthCookies()` at request time. (Phase 1 CF-03, Phase 3 CF-03.)
- **CF-04:** Session-expiry detection via `isSessionExpired` in `src/api/LeetCodeClient.ts` — Phase 4 imports and reuses for submission-history fetch failures. (Phase 3 CF-04.)
- **CF-05:** `eslint-plugin-obsidianmd` zero Required violations. Phase 4 adds no `innerHTML`, no raw `fetch`, no default hotkeys, sentence-case Notice copy with terminal period. (Phase 1 CF-05 through Phase 3 CF-05.)
- **CF-06:** **All vault writes use `vault.process()` + `fileManager.processFrontMatter()` ONLY.** `vault.modify()` on problem notes remains permanently forbidden. Grep gate in Phase 4 execution:
  ```
  grep -rE "vault\.modify\s*\(" src/graph/ --include='*.ts'    # must be empty
  ```
  Phase 4 adds `vault.create()` for stub notes (explicitly allowed for new files) and `vault.createFolder()` for the Techniques folder. (Phase 2 D-22, Phase 3 CF-06.)
- **CF-07:** `createEl()` discipline for all DOM in `SubmissionPickerModal` and `SubmissionDetailModal`. No `innerHTML`. WA/TLE/CE/RE verdict chips use `.setText()` on nested spans. (Phase 1 Shared Pattern 3, Phase 3 CF-07.)
- **CF-08:** Default problems folder `LeetCode`; default language `python3`; `SettingsStore.sanitizeFolder` rejects path-traversal. Derived `{problemsFolder}/Techniques/` inherits these guards. (Phase 1 D-10, Phase 3 CF-08.)
- **CF-09:** Rate ceiling 20 req / 10 s + max 2 concurrent. Submission-history fetch stays well under. (Phase 3 CF-09.)
- **CF-10:** Throttle UX is silent queue; 429 surfaces one-shot Notice. Picker-mode 4xx/5xx renders inline in the modal (D-06), not as Notice. (Phase 3 CF-10.)
- **CF-11:** Feature-first folder layout — Phase 4 adds `src/graph/` as a new sibling. Does not scatter graph code across `src/notes/`, `src/solve/`, etc. (Phase 1 D-01, Phase 3 CF-11.)
- **CF-12:** Phase 2 frontmatter schema locked — Phase 4 is the phase that activates the solve-time fields already reserved in `PLUGIN_LC_KEYS`. No NEW lc-* key names introduced; just writing the existing reserved ones. `lc-technique` is a new **technique-note-only** key (not in `PLUGIN_LC_KEYS`, not in problem notes). (Phase 2 D-03, D-04.)
- **CF-13:** `codeSnippets`, `exampleTestcases`, `topicSlugs` cached in `problemDetails[slug]` from Phase 2 (D-14). Phase 4 **extends** the schema with `topicTags: {name, slug}[]` (D-12) — backward-compatible via shape-guard (missing field → empty array; old cache entries still valid).
- **CF-14:** Cache TTL 7 days for `problemDetails` (Phase 2 D-11). Submission-history cache has NO TTL (always live, not persisted, D-02/D-07).
- **CF-15:** `IndexedProblem.topicSlugs` still populated at Phase 1 refresh time — Phase 4 reads from per-problem `problemDetails[slug].topicSlugs` (and new `.topicTags`), not from the index. The index's `topicSlugs` is the filter-modal surface; Phase 4 uses the richer per-problem cache.
- **CF-16:** Phase 2 GAP-2a's `applyFrontmatter` non-downgrade guard protects `lc-status: accepted` from being clobbered on re-open. Phase 4's on-AC write IS the upgrade path (untouched/attempted → accepted). (Phase 2 NoteWriter GAP-2a.)
- **CF-17:** `HeadingRegion.ts` (Phase 2) and `CaseRegion.ts` (Phase 3) provide the region-replacement pattern. Phase 4's `mergeTechniquesSection.ts` is a new primitive — finer-grained than region replacement because it must union-merge within the region. Pure string transform; same "safe for `vault.process` retry" invariant.
- **CF-18:** Phase 3 `classifyStatus` (`src/solve/statusMap.ts`) is the single source of truth for status_code → verdict-kind. Phase 4's on-AC guard reuses it: `classifyStatus(terminal.status_code) === 'accepted'`.
- **CF-19:** Notice copy locked (sentence case + terminal period). New Phase 4 Notice candidates (UI-SPEC reviewer confirms):
  - `Couldn't load submissions. Check your connection.` (picker load failure — if surfaced as Notice rather than inline; prefer inline per D-06)
  - No Notice for the on-AC graph write itself — it's invisible-by-design (part of the submit flow, verdict modal already surfaces "Accepted").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — Core Value (knowledge graph as primary differentiator), Key Decisions (auto-update note on accepted submission; knowledge-graph first design)
- `.planning/REQUIREMENTS.md` §v1 Knowledge Graph Wiring — GRAPH-01..05, plus §Problems as Notes NOTE-04 (topic tags deferred to Phase 4 per D-05)
- `.planning/ROADMAP.md` §Phase 4 — Goal, success criteria. **Note:** criterion 1 references `## Solution`; Phase 4 transition doc must rewrite this to reflect D-01's `## Code` + picker model.
- `.planning/STATE.md` §Accumulated Context — "Phase 4: All vault writes via `vault.process()` + `processFrontMatter()` only — `vault.modify()` on problem notes is permanently forbidden"
- `.planning/phases/01-plugin-foundation/01-CONTEXT.md` — Phase 1 locks: `requestUrl` adapter (D-12), auth cookie storage, feature-first layout
- `.planning/phases/02-problems-as-notes/02-CONTEXT.md` — Frontmatter schema lock (D-03), `PLUGIN_LC_KEYS` inventory, topic-tag deferral (D-05), union-merge semantics (D-10), heading ownership (D-08/D-09), detail cache schema (D-14 — **Phase 4 extends with `topicTags`**), `vault.process` + `processFrontMatter` discipline (D-22)
- `.planning/phases/02-problems-as-notes/02-DISCUSSION-LOG.md` — for audit trail on D-05 topic-tag rationale
- `.planning/phases/03-run-submit/03-CONTEXT.md` — Phase 3 locks: `## Code` heading ownership (D-06, D-08), `classifyStatus` single source of truth (CF-18 equivalent), command-palette-only invocation pattern (D-10), `SubmissionOrchestrator` shape, `throttledRequestUrl` pipe, `authHeaders` helper in `leetcodeRest.ts`, `SubmitCheckResponse` discriminated-union types (`src/solve/types.ts`)
- `.planning/phases/03-run-submit/03-PATTERNS.md` — Phase 3 modal chrome, createEl() discipline, CSS class-scoped convention

### Tech stack (locked in CLAUDE.md)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Technology Stack — `turndown` for HTML→MD (not used in Phase 4), `@leetnotion/leetcode-api` for LC GraphQL (may be used for submission history if it exposes the endpoint)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §5 Offline Cache — `data.json` via `loadData/saveData`; Phase 4 does NOT persist submission history (D-07)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §6 Markdown Rendering — `innerHTML` forbidden; `createEl()` for DOM. `MarkdownRenderer.render` is the sanctioned path for rendering markdown (code blocks) inside modals (`SubmissionDetailModal` D-04)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Stack Patterns — `app.fileManager.processFrontMatter()` atomic pattern, `vault.process()` for body writes, NO `Vault.modify()`, `registerInterval()` for timers
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §9 Knowledge Graph Integration — the integration philosophy (graph-first, tags + backlinks)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Sources → `microsoft/vscode-leetcode` — reference for submission-history endpoint shape (MEDIUM confidence; researcher must verify against live LC)

### Obsidian & LC docs (researcher MUST fetch and verify)
- `obsidianmd/obsidian-api` `obsidian.d.ts` — `FileManager.processFrontMatter` (frontmatter union-merge on arrays — confirm behavior), `Vault.process`, `Vault.create`, `Vault.createFolder`, `Modal` class API, `MarkdownRenderer.render` (for code-block rendering in `SubmissionDetailModal`), `Notice`, `setIcon` (verdict chip icons)
- `obsidianmd/obsidian-developer-docs` — Wiki-link resolution semantics (`[[Name]]` → file by name or alias match), aliases frontmatter field behavior, tag hierarchy (`lc/technique/<slug>` nested tag rendering)
- `obsidianmd/obsidian-developer-docs` — `MarkdownRenderer.render` usage pattern (version, args, disposal)
- LC submission-history API (any of):
  - `microsoft/vscode-leetcode` `src/commands/submit.ts` + `src/leetCodeManager.ts` — reference for `api/submissions/` endpoint
  - `skygragon/leetcode-cli` `lib/plugins/leetcode.js` — additional endpoint reference
  - `@leetnotion/leetcode-api` source — check if a `submissions(slug)` or equivalent helper exists in 3.0.0
  - **P0 research item: confirm current submission-list + submission-detail shapes against live LC.**

### What to avoid
- **HTML-scraping `/submissions/detail/{id}/` for `var pageData`** — obsolete as of 2026-05-09. LC serves a Next.js SPA shell; the real payload is GraphQL `submissionDetails` (D-27 revised). Do not regex-scrape HTML under any circumstances; fixtures for the old shape have been removed from the repo.
- **Treating session-expiry as HTML login-redirect for submission-history calls** — the `/api/` path now returns JSON 401, not redirect. GraphQL returns 403 or 200-with-errors. Use D-30 signal set, not HTML-markers.
- `vault.modify()` on problem notes — use `vault.process()` + `processFrontMatter()` (CF-06)
- `innerHTML` in picker/detail modals — user-submitted code in `SubmissionDetailModal` is untrusted-ish (technically their own code, but could contain string payloads that break rendering) (CF-07)
- Writing a `## Solution` heading — **explicitly rejected in D-01**. If a downstream agent proposes this, it's a requirements regression
- Caching submission history in `data.json` — rejected in D-07
- Sentinel-based list-item markers (HTML comments as "user additions below") — rejected in D-13 (same spirit as Phase 2 D-08)
- `fetch()` / `axios` — CORS-blocked (CF-01)
- Setting-controls added to Settings tab in Phase 4 — those ship in Phase 5 POLISH-01
- Removing wikilinks when LC removes a topic tag — D-26 keeps existing sections user-owned on go-forward changes
- Overwriting stub technique notes — GRAPH-04 + D-18 ironclad
- Prefetching submission history in bulk — D-02 is on-open-per-slug; no batch warming
- Local timezone hardcoded to UTC — D-10 explicitly uses Electron-host local TZ

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phases 1, 2, 3 — all shipped in `src/`)

- **`src/api/throttle.ts` + `src/api/requestUrlFetcher.ts` (throttledRequestUrl)** — Phase 4's submission-history REST calls route through here. Same pipe as Phase 3. No new HTTP infrastructure.

- **`src/api/LeetCodeClient.ts`** — `isSessionExpired` helper extended with a `(body: unknown, status: number)` overload per D-30 (the existing string overload stays for Phase 1/3 callers). `src/graph/submissionHistoryClient.ts` is a new sibling to Phase 3's `src/solve/leetcodeRest.ts`; hand-rolled, no `@leetnotion/leetcode-api` dependency on this path (D-27 revised).

- **`src/settings/SettingsStore.ts`** — Phase 4 extensions:
  - Adds `autoBacklinksEnabled: boolean` to `PluginData` (D-21, default `true`) + shape-guard in `isValidPluginData`.
  - Extends `DetailCacheEntry` with `topicTags?: Array<{ name: string; slug: string }>` (D-12) + shape-guard backward-compat (undefined/old entries → empty array).
  - Adds `getAutoBacklinksEnabled()` + `setAutoBacklinksEnabled(v)` getters.
  - Adds `getTechniquesFolder()` derived getter (returns `{problemsFolder}/Techniques`, D-15).
  - No new data.json fields for submission history (D-07).

- **`src/notes/NoteTemplate.ts`** — Phase 4 extensions:
  - Adds `## Techniques` to the heading inventory (D-14). Export `TECHNIQUES_HEADING_LINE = '## Techniques'`.
  - Updates the heading-order inventory: `PROBLEM → CODE → NOTES → TECHNIQUES → CUSTOM_TESTS` (D-14).
  - Date-format helper `toIsoLocalTz(date: Date): string` (D-10) — OR extract to new `src/shared/dates.ts` (planner discretion).
  - `buildTechniquesBlock(topicTags: Array<{ name: string }>): string` — emits the bulleted wikilinks.
  - Stub note builder: `buildTechniqueStubBody(slug: string, name: string): string` — emits the frontmatter-only stub per D-16.
  - Stub filename helper: `buildTechniqueFilename(name: string): string` — handles special-char normalization (D-17).

- **`src/notes/HeadingRegion.ts`** — Pattern reference for Phase 4's `mergeTechniquesSection.ts` (D-13). **Do NOT extend HeadingRegion itself** — the union-merge semantics are different enough to warrant a new pure transform.

- **`src/notes/NoteWriter.ts`** — No direct extension in Phase 4. The on-AC pipeline is a separate `KnowledgeGraphWriter`, not a NoteWriter method. Rationale: NoteWriter is open/refresh-oriented; KnowledgeGraphWriter is submit-outcome-oriented.

- **`src/solve/submissionOrchestrator.ts`** — **Untouched.** Phase 4's on-AC pipeline lives in `main.ts`'s `submitFromActive` command lambda (after the orchestrator resolves and the verdict is classified as `accepted`). Keeps the orchestrator pure-REST-+-polling, no vault state.

- **`src/solve/statusMap.ts` (classifyStatus)** — Imported by `KnowledgeGraphWriter` gate: only fires if `classifyStatus(terminal.status_code) === 'accepted'` (D-23, CF-18).

- **`src/solve/VerdictModal.ts`** — No extension needed — the existing AC branch (Phase 3 D-13) already leaves room for a "Wrote to note" confirmation line. Phase 4 optionally adds a subtle line like "Note updated with Techniques" via a callback from KnowledgeGraphWriter to the modal. Planner discretion; could ship without.

- **`src/solve/customTestStore.ts`** — Unrelated; Phase 4 doesn't touch custom tests.

- **`src/shared/logger.ts`** — Phase 4 uses for debug-level logs on silent failures (stub creation failure, submission-history fetch failure, union-merge ambiguity).

- **`src/shared/errors.ts`** — Phase 4 may add `KnowledgeGraphWriteError` subtypes if needed; prefer reusing Phase 3's existing error hierarchy (`SessionExpiredError`, `RateLimitError`) for the submission-history fetch path.

### Established Patterns (from Phases 1, 2, 3 — carried forward)

- **Feature-first folder layout:** Phase 4 adds `src/graph/` as a new sibling. Expected files (planner discretion):
  - `KnowledgeGraphWriter.ts` — on-AC orchestrator; owns the 4-step pipeline (D-08, D-09)
  - `mergeTechniquesSection.ts` — pure string transform for ## Techniques union-merge (D-13)
  - `StubNoteCreator.ts` — per-stub `vault.create` loop with never-overwrite guard (D-18)
  - `submissionHistoryClient.ts` — REST wrapper for submission list + detail fetches (D-27)
  - `SubmissionPickerModal.ts` — picker UI (D-03)
  - `SubmissionDetailModal.ts` — read-only viewer (D-04)

- **All LC calls through throttle/fetcher pipe:** Phase 4's submission-history fetch joins the same pipe. No parallel HTTP stack.

- **All vault writes via `vault.process()` / `processFrontMatter()` / `vault.create()` (no modify):** Phase 4 adds `vault.create` for stub notes (new files, allowed) and `vault.createFolder` for Techniques folder init. Grep gate still applies to `vault.modify`.

- **`createEl()` only for DOM:** `SubmissionPickerModal` and `SubmissionDetailModal` built entirely with `createEl()` / `createDiv()`. Code in `SubmissionDetailModal` rendered via `MarkdownRenderer.render` (Obsidian's sanctioned CM6 fence rendering — not `innerHTML`).

- **Notice copy locked:** sentence case + terminal period. Phase 4 minimizes new Notices (D-06 prefers inline modal errors); candidate:
  - No Notice on the on-AC write itself (invisible-by-design, CF-19)
  - Picker load failure → inline in modal (D-06), not a Notice

- **No default hotkeys on any new command (`LeetCode: View past submissions`):** matches Phase 3 D-10 + FND-03.

- **Atomic commits per plan:** Phase 4 plans each commit one or two files; `KnowledgeGraphWriter` should be decomposable into unit-testable pieces (merge transform, frontmatter helpers, stub creator) each in their own plan.

### Integration Points

- **`main.ts` wiring order** — Phase 4 adds one new step + extends the submit command lambda:
  1. Settings load (existing)
  2. Fetcher / throttle (existing)
  3. LC client + auth (existing)
  4. Problem list service (existing)
  5. Note writer (existing, Phase 2)
  6. Submission orchestrator (existing, Phase 3)
  7. **Knowledge graph writer (Phase 4) — new** — singleton, constructed with `(app, settings, plugin)`
  8. Register commands (existing Phase 3 set + new `view-past-submissions`)
  9. Register views, tabs, ribbon (existing)

- **`submitFromActive` command lambda in `main.ts`** — after the existing `modal.renderVerdict(terminalTyped, ctx.title)` call, add:
  ```ts
  if (classifyStatus(terminalTyped.status_code) === 'accepted') {
    try {
      await this.knowledgeGraph.onAccepted(ctx, terminalTyped);
    } catch (err) {
      // Silent — graph write failure should never fail a successful submit
      logger.debug('graph.onAccepted failed', err);
    }
  }
  ```
  
  `onAccepted` is non-blocking from the user's perspective — the verdict modal is already showing "Accepted." Graph write happens immediately after; completes in ≤100ms for cached-detail + 1 stub create.

- **`NoteWriter.openProblem` extension (D-02)** — after the reveal + background-refresh-if-stale flow, fire a **second** fire-and-forget background fetch for submission history **if** the user has invoked the picker for this slug recently (or unconditionally — planner picks). This is D-02's "refetch on open" semantics. **Planner decision:** prefer unconditional refetch on open (matches LC's "always fresh" experience, author's stated preference). Throttle absorbs the cost.

- **New command `LeetCode: View past submissions`** — `editorCheckCallback` gated on `lc-slug` frontmatter (same pattern as Phase 3 commands). On invocation: fetch history for slug → open `SubmissionPickerModal`. Error states: session expired → Notice + re-auth; offline → inline error in modal.

- **`ProblemBrowserView` integration** — row-click flow doesn't change in Phase 4 (NoteWriter handles open, which already reveals + refreshes per D-02). Phase 4 only adds the picker command path.

- **`manifest.json`** — no changes in Phase 4. `minAppVersion` was bumped in Phase 2 for Bases support; Phase 4 uses only Obsidian APIs available at that level.

### Existing Test Infrastructure (reusable)

- **`tests/solve/mocks/fakeFetcher.ts`, `fakeSettingsStore.ts`** — Phase 3 test doubles. Phase 4 extends with submission-history fetch scripting.
- **`tests/fixtures/lc-verdicts/`** — Phase 3 live-captured verdict fixtures. Phase 4 adds `tests/fixtures/lc-submissions/` for picker + detail fixtures (live-captured per D-27 research).
- **`tests/solve/` + `tests/notes/`** — test folders. Phase 4 adds `tests/graph/`.
- **`vitest.config.ts`** — existing; Phase 4 adds no new config.

</code_context>

<specifics>
## Specific Ideas

- **Graph-native note shape:** the author's explicit vision is that each problem note is a graph citizen — topic tags + wikilinks + stub technique notes compose into Obsidian's graph view so a solving session builds a personal technique-map. The `## Techniques` bulleted-list format (D-12) and `lc/technique/<slug>` tags on stubs (D-16) both service this: clicking Graph View should show problem→technique edges immediately after AC.

- **LC-experience parity for submission history:** the author referenced LC's own submission panel verbatim — `< 2/2 >` chevrons, middle dropdown to jump to a specific submission, read-only code viewer. Phase 4 ships the picker + detail modal (D-03, D-04) which gives the same function through the command palette; the chevron overlay widget is deferred to Phase 5 Polish (same lane as Phase 3 D-11 Run/Submit overlay).

- **"Note reflects most recent AC, not best-ever":** D-24 explicitly locks this. `lc-runtime-ms` overwrites even on regression. The picker is where best-ever lives (user can see "my fastest was 8ms" in the list).

- **Opt-out is a pragmatic toggle, not ideological:** D-20 leaves `lc/<slug>` frontmatter tags on even when opt-out is engaged. Rationale (from discussion): tags are lightweight, invisible until the user opens the tag pane or graph view, and drive Dataview/Bases. The opt-out user wants "no folder clutter" (stubs + Techniques/ folder) not "no topic awareness at all."

- **First-run behavior:** D-22 explicitly NO first-run prompt. Default on, let the user see the `## Techniques` section on first AC, flip off in Phase 5 settings if they dislike it. The graph view "aha moment" IS the first-run onboarding.

- **Timezone-aware solve date:** D-10 locks ISO-8601 **local-tz** specifically because the author's dogfooding perspective is "when I solved it in my local time, not UTC." Preserves the emotional beat of "I did three problems yesterday afternoon" surviving a timezone change (travel). Planner must test against DST boundary.

</specifics>

<deferred>
## Deferred Ideas

Captured during Phase 4 discussion, redirected away from Phase 4 scope:

- **Chevron/dropdown navigator overlay on `## Code`** — LC-style `< 2/2 >` widget for jumping between submissions in-view. Phase 4 ships command-palette-only; Reading Mode `MarkdownPostProcessor` widget is Phase 5 Polish (same lane as Phase 3 D-11 Run/Submit overlay). Live Preview path via CM6 `EditorView` is the harder follow-up. **Design target locked** for Phase 5.

- **Stale-detect "insert fresh block if last AC > X days ago"** — dropped entirely once the single-code-block model locked in. The picker + Copy-to-Code flow handles "I want to restart from scratch" (user picks an old submission, doesn't copy, types fresh in `## Code`).

- **Submission-history cache in `data.json`** — rejected in D-07. If submission history ever becomes too slow over a slow connection (20+ submissions per problem), a bounded LRU cache with short TTL (e.g., 1 minute) is a Phase 5 enhancement.

- **Diff view in `SubmissionDetailModal`** — side-by-side or unified diff against current `## Code`. Powerful for "what did I change to beat the TLE" introspection. Deferred to Phase 5 Polish.

- **Filter toggle in picker** (Accepted-only) — D-05 ships all-verdicts; if visual noise becomes an issue in practice, filter controls are Phase 5.

- **First-run prompt modal for auto-backlink opt-in** — rejected in D-22; default-on is the choice.

- **Settings UI control for `autoBacklinksEnabled`** — Phase 5 POLISH-01 adds the visible toggle. Phase 4 adds only the PluginData field + getter/setter.

- **Settings UI control for techniques folder override** — rejected in D-15 (derived from `problemsFolder`). If user demand emerges, a Phase 5 follow-up setting can decouple them.

- **Retroactive opt-out cleanup** — D-26 keeps existing `## Techniques` sections on opt-out-after-the-fact. An explicit command `LeetCode: Strip all technique sections` could ship in Phase 5 for users who really want to reset.

- **Removing wikilinks when LC removes a topic tag** — rejected in D-26; user-owned go-forward.

- **Bases-file schema update for `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb` columns** — Phase 5 Polish (cosmetic). The raw Bases file from Phase 2 still works; users who want the new columns visible there regenerate it manually.

- **Per-row submission prefetch on hover** — LC's UX hint. D-28 rejects in favor of on-click-only (simpler, respects throttle).

- **Submission history export** — "save all my submissions for problem X as separate files." Not a Phase 4 requirement; could be a v2 feature.

- **"Was this submission in streak N?" metadata enrichment** — anything that depends on the pending spaced-repetition scope (SR-01..03, v2).

Standing deferrals (already in PROJECT.md / REQUIREMENTS.md):
- Settings-UI completeness (all POLISH-01 controls), graceful error handling UX, README + network disclosure, community plugin store PR → Phase 5
- Run UX rework (POLISH-07) → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI enhancements → v2

</deferred>

---

*Phase: 4-knowledge-graph-wiring*
*Context gathered: 2026-05-09*
