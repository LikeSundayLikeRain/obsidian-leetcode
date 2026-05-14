# Phase 3: Run & Submit - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Hand-roll the three undocumented LeetCode REST endpoints (`/problems/{slug}/interpret_solution/`, `/problems/{slug}/submit/`, `/submissions/detail/{id}/check/`) on top of the existing Phase 1 `requestUrlFetcher` + throttle stack. Users invoke **Run Code** and **Submit** via command palette only — no overlay buttons in Phase 3 (deferred to Phase 5 Polish). The plugin extracts the **first fenced code block** from the active problem note, sends the live note content at invocation time, polls `/check/{id}` with 1s→2s→4s→8s exponential backoff up to a 60s hard cap, and surfaces all six verdict types (AC / WA / TLE / MLE / CE / RE) in a dedicated verdict modal. Phase 3 introduces **one new plugin-owned heading, `## Code`**, between `## Problem` and `## Notes`, and retrofits existing problem notes with starter code on next open when the heading/block is missing. A **tabbed custom-input modal** (Case 1 / Case 2 / Case 3 / +) lets users iterate on inputs; cases persist under a new `## Custom Tests` section in the note. Covers 9 requirements: SOLVE-01..09.

Explicitly out of scope for Phase 3:
- Writing `## Solution` or updating frontmatter on Accepted (Phase 4 — GRAPH-01, GRAPH-02)
- `[[Technique]]` backlinks and stub technique notes (Phase 4 — GRAPH-03, GRAPH-04)
- Overlay Run/Submit buttons on the code block (Phase 5 Polish — Reading Mode `MarkdownPostProcessor` + optional CM6 widget)
- Per-argument labeled input UI in the custom-test modal (Phase 5 Polish — requires starter-code signature parsing)
- Settings-UI polish for any new Phase 3 fields (Phase 5 — POLISH-01)
- Submission history browsing / past-submission restoration (deferred — not in v1 requirements)

</domain>

<decisions>
## Implementation Decisions

### Code Extraction & Language Resolution (SOLVE-01, SOLVE-08, SOLVE-09)

- **D-01:** The **first fenced code block** in the active note is the submission payload. "First" means the topmost triple-backtick block anywhere in the body — not scoped to a heading. This matches the retrofit + on-demand insertion target (under `## Code`) without depending on heading presence, and keeps extraction tolerant of note edits. The code sent to LC is always the **current note content at submit time** (no stale snapshots) — SOLVE-09 is satisfied by reading the file at invocation, not by caching.

- **D-02:** **Fence tag wins** for language resolution. The fenced block's language tag (e.g., ```` ```python3 ````, ```` ```java ````, ```` ```cpp ````) is the submission language. The plugin normalizes the tag to LC's `langSlug` set (e.g., `python3`, `java`, `cpp`, `javascript`, `typescript`, `rust`, `golang`). **One problem note can have multiple submissions over time in different languages** — switching language is as simple as changing the fence tag. Frontmatter `lc-language` is a default used only for starter-code insertion, not a source of truth at submit time.

- **D-03:** **Untagged fence** (bare ```` ``` ````) falls back to the **global default language from `SettingsStore`** (set in Phase 1 Settings tab, default `python3`). Rationale: if the user cleared the fence tag to switch languages and didn't commit to one, the global preference wins; `lc-language` is a per-note default that may be stale.

- **D-04:** **No fenced code block found** → show Notice: `No code block found. Add a fenced block with your solution.` Abort. **No network call, no auto-starter-injection.** Matches ROADMAP success criterion 5 verbatim. Error path is explicit: the user sees the problem and can run **Insert starter code** from the palette.

- **D-05:** Language normalization table lives alongside `NoteTemplate.ts` or in a new `src/solve/languages.ts`. Must map every LC-supported `langSlug` (from cached `codeSnippets`) and common fence-tag aliases (e.g., `py` → `python3`, `ts` → `typescript`, `js` → `javascript`, `c++` → `cpp`). Unknown fence tag → treat as untagged (fall back to D-03).

### Starter-Code Injection (SOLVE-02)

- **D-06:** **New plugin-owned heading `## Code`** is introduced in Phase 3, inserted between `## Problem` and `## Notes`. Updates the Phase 2 D-01 heading inventory: Phase 3's canonical body shape is **`## Problem` → `## Code` → `## Notes`**. Phase 4's `## Solution` and `## Techniques` remain post-accepted additions.

- **D-07:** **Retrofit + on-demand injection** behavior:
  1. **New notes (Phase 2 NoteWriter extension):** on create, insert `## Code` with a fenced block pre-filled from cached `codeSnippets[lc-language]` (or settings default if not found). If `codeSnippets` is absent in cache (old Phase 2 cache entries), insert an empty fenced block tagged with the default language.
  2. **Existing notes (on next open):** if `## Code` is missing OR the section has no fenced block, insert it via the same logic. Idempotent: if `## Code` already exists with a fenced block (tagged or untagged, any content), **do not modify**. The retrofit check runs after the D-11-equivalent cached/refresh flow from Phase 2 (reveal first, then background retrofit).
  3. **On-demand command:** `LeetCode: Insert starter code` — unconditionally replaces the fenced block under `## Code` with fresh starter for the specified language (prompt via modal or use frontmatter `lc-language`). **This is the only write that overwrites an existing fenced block.** Used for language switches or recovery.

- **D-08:** **User-owned vs plugin-owned under `## Code`** — extends D-08 (Phase 2):
  - The `## Code` heading anchor itself: plugin-owned (re-inserted if the user renames or deletes it, same heuristic as `## Problem` in Phase 2 D-09).
  - The **fenced code block(s)** under `## Code`: **user-owned** once they exist. Retrofit and auto-insertion only fire when NO fenced block is present. The user can freely edit, paste over, or add additional fenced blocks; the plugin never touches them unless the user runs `Insert starter code`.
  - Anything else the user writes under `## Code` (comments, notes between blocks): preserved.

- **D-09:** Retrofit telemetry is silent (no Notice on successful retrofit). On retrofit **failure** (e.g., `codeSnippets` cache corrupted, `SettingsStore` returns undefined default), show debug-level log only and leave the note untouched — user can still run `Insert starter code` manually.

### Run & Submit UX Surface (SOLVE-03, SOLVE-04, SOLVE-05, SOLVE-07)

- **D-10:** **Command palette is the only invocation surface for Phase 3.** Commands to register:
  - `LeetCode: Run code (sample)` — runs against `exampleTestcases` from cache
  - `LeetCode: Run code (custom input)` — opens the tabbed custom-input modal
  - `LeetCode: Submit` — submits the first fenced block to the judge
  - `LeetCode: Insert starter code` — D-07 on-demand injection
  - `LeetCode: Cancel running submission` — cancels in-flight polling (D-17 supplement; harmless no-op if nothing in flight)

  All commands are **no-hotkey by default** (FND-03 / Phase 1 Pattern 4 — no plugin-set default hotkeys; users assign their own in Obsidian's Hotkeys settings).

- **D-11:** **Overlay Run/Submit buttons on the code block are deferred to Phase 5 Polish.** Rationale: the feasibility delta is real — Reading Mode buttons via `MarkdownPostProcessor` are safe (~50 LoC), but Live Preview / Source Mode requires CM6 internals (`view.editor.cm as EditorView`) which CLAUDE.md flags as undocumented. Phase 3 keeps the hard work (REST endpoints, polling, verdicts) focused; buttons become a Phase 5 enhancement once the core flow is stable. **Note Phase 5 carries the design expectation** of LC-style icon-row overlay in Reading Mode.

- **D-12:** **Verdict modal** is a single `Modal` subclass (e.g., `VerdictModal` in `src/solve/VerdictModal.ts`) that renders all six verdict types via a switch on `status_code`/`status_msg`. Shared chrome:
  - Title: status + problem title (e.g., `Wrong Answer — Two Sum`)
  - Runtime line: `Runtime: 12 ms · Memory: 14.2 MB` (shown when LC returns these)
  - Body: verdict-specific (see D-13)
  - Footer: `Close` button + context-specific action buttons (see D-14)

  Built with `createEl()` only (no `innerHTML`). CSS follows Phase 1's class-scoped `.leetcode-*` convention (new classes like `.leetcode-verdict`, `.leetcode-verdict-wa-diff`).

- **D-13:** **Verdict-specific body content:**
  - **AC (Accepted):** big green status, runtime/memory, percentile if LC returns it (`runtime_percentile`, `memory_percentile`), compact summary. Phase 4 will extend this with a "Wrote to note" confirmation line — Phase 3 leaves room in the layout but does not write to the note on AC (GRAPH-01 is Phase 4).
  - **WA (Wrong Answer):** LC-native-feel layout — `Input`, `Output`, `Expected` sections with monospace formatting and diff highlighting (red for actual, green for expected). Fields from `/check/{id}` response: `input_formatted` (or `std_input`), `code_output` (or `code_answer`), `expected_output`. Last-test-case only (LC returns only the first failing case).
  - **TLE (Time Limit Exceeded) / MLE (Memory Limit Exceeded):** status + failing input + (for TLE) the last computed output if available.
  - **CE (Compile Error):** full `compile_error` text in a monospace pre-formatted block. No input/output.
  - **RE (Runtime Error):** `runtime_error` text + the input that triggered it. Stack trace shown as returned (LC formats per language).
  - **Unknown status (D-15):** see below.

- **D-14:** **Action buttons in the verdict modal:**
  - **WA / TLE / RE:** `Copy failing testcase to custom input` — pipes the failing input into the custom-test modal's active tab (or creates a new tab if none exists). Opens the custom-test modal after copy.
  - **CE:** `Copy error` — copies `compile_error` to clipboard.
  - **Unknown verdict (D-15):** `Copy payload` — copies the full `/check/{id}` JSON response to clipboard for issue filing.
  - **All verdicts:** `Close` (primary). No "Retry" button in Phase 3 — user runs the submit command again.

- **D-15:** **Unknown verdict handling:** if LC returns a `status_code`/`status_msg` not in the recognized set (AC / WA / TLE / MLE / CE / RE / `status_code` in known integer map), treat as an **error with copy-payload action**:
  - Verdict modal renders with title `Unrecognized verdict` + the raw status string.
  - Body shows a collapsed `<details>` with the full response JSON (truncated at ~2 KB for display; full payload goes to clipboard on copy).
  - `Copy payload` button in footer.
  - Log at **warn level** with the full payload via `src/shared/logger.ts` (which already redacts session cookies per Phase 1).
  - Phase 4's on-accepted flow does **NOT** fire for unknown verdicts.

- **D-16:** **Run vs Submit distinction:** `interpret_solution` (run) and `submit` have **identical request shapes** except for the endpoint URL (and `submit` adds `judge_type: 'large'`). Both return a `{ interpret_id | submission_id }` that is polled via `/check/{id}`. The **check response shape differs** by run vs submit (run returns `code_answer[]`, `expected_code_answer[]`, `correct_answer: boolean`; submit returns the full verdict + runtime percentile). The verdict modal handles both flows via a discriminated union in `src/solve/types.ts`.

### Custom Test Input UI (SOLVE-04)

- **D-17:** **Tabbed modal with textarea per case** (Case 1 / Case 2 / Case 3 / +). Each tab holds an LC-raw-format textarea (one value per line, exactly the format `exampleTestcases` uses). **Per-argument labeled inputs are deferred to Phase 5 Polish** — they require parsing the starter-code signature across languages, which is fragile.
  - **First open for a note:** pre-populate Case 1 with `exampleTestcases` (split by LC's double-newline separator if LC provides multiple example cases as one string; else a single case).
  - **Tab affordances:** click to switch, `×` icon on hover to remove (keep at least one case; can't delete the last). `+` at the end adds a new empty tab.
  - **Run button** in the modal: runs the **currently active tab's input** via `interpret_solution`. Closes the custom-input modal and opens the verdict modal.

- **D-18:** **Case persistence** under a new plugin-owned heading `## Custom Tests` in the problem note. One fenced code block per case, language tag `text` (or `plaintext`), each block separated by a blank line:
  ```
  ## Custom Tests

  ### Case 1
  \`\`\`text
  [3,2,4]
  6
  \`\`\`

  ### Case 2
  \`\`\`text
  [3,3]
  6
  \`\`\`
  ```
  The `## Custom Tests` heading is **lazy-created** — only inserted when the user first saves a case (either by opening the modal and pressing Run, or explicitly hitting a "Save cases" control). If the user never opens the custom-test modal, `## Custom Tests` never appears in the note. Users can edit cases directly in the note (read from note → modal → back to note round-trips are idempotent on content).

- **D-19:** **Case write discipline:** `## Custom Tests` section is **plugin-owned** (same heuristic as `## Code`). The plugin reads all `### Case N` subheadings + their immediate fenced block, writes them back in numeric order. User-added text under `## Custom Tests` (between cases or before the first case) is preserved across round-trips by the same heading-region regenerator used for `## Problem` (Phase 2 `HeadingRegion.ts`). Extend `HeadingRegion` if needed to support nested `###` subheadings within a plugin-owned `##` region — planner discretion.

- **D-20:** **`## Custom Tests` ordering in the note:** below `## Notes`. Final note shape becomes:
  ```
  ---
  <frontmatter>
  ---

  ## Problem
  <turndown output>

  ## Code
  \`\`\`python3
  <user solution>
  \`\`\`

  ## Notes
  <user-authored>

  ## Custom Tests  (only if user has saved cases)
  ### Case 1
  \`\`\`text
  ...
  \`\`\`
  ```

### Polling, Concurrency, and Timeouts (SOLVE-05, SOLVE-06)

- **D-21:** **Polling cadence** follows ROADMAP Phase 3 success-criterion 3: backoff sequence **1s → 2s → 4s → 8s → 8s → 8s …** (first 4 intervals are `2^n` seconds, then cap at 8s). Total wall-clock cap: **60s**.

- **D-22:** **60s hard cap + cancel button.** The verdict modal opens immediately after submit in a **pending state** with:
  - Spinner / animated status indicator
  - Copy: `Polling LeetCode for verdict…` (subtitle: `Backoff: 1s → 2s → 4s → 8s`)
  - `Cancel` button in the footer
  - If the cap is hit without a verdict, the modal transitions to an error state: `LeetCode judge timed out. Try again or check leetcode.com.` — with a `Close` button. The pending request is aborted.
  - If the user clicks Cancel, the modal closes and the pending request is aborted (no Notice; cancelling is a user action, not a failure).

- **D-23:** **Abort mechanism:** maintain an `AbortController` (or equivalent state flag) in the `SubmissionOrchestrator`. `requestUrl` doesn't natively support AbortController, but the orchestrator can drop polling by checking the flag between intervals and before scheduling the next poll. Fire-and-forget in-flight `requestUrl` calls are allowed to complete; their results are discarded.

- **D-24:** **Concurrency policy: block with Notice.** If the user invokes `Submit` or `Run code (sample/custom)` while a submission is in flight:
  - Show Notice: `A submission is already in progress. Cancel it first or wait for the verdict.`
  - Abort the new invocation — do not queue, do not cancel the previous one.
  - Matches LC's own server-side behavior (LC queues serially per user; parallel submissions can return stale-verdict artifacts).
  - The `Cancel` button in the pending-verdict modal is the user's escape hatch.

- **D-25:** **Rate-limit reuse:** Phase 3 `/interpret_solution/`, `/submit/`, `/check/{id}` all route through the existing `api/throttle.ts` (Phase 1 D-12). No new throttle layer. The 20 req / 10 s bucket + max-2 concurrent limit applies. Polling at 8s cadence for a single submission stays well under the ceiling; two concurrent submissions are blocked at D-24 before they reach throttle.

- **D-26:** **429 / 503 from LC during poll:** retry with the current backoff interval (no special handling — the backoff naturally absorbs it). If three consecutive non-2xx responses during polling, treat as judge timeout and fire the D-22 timeout flow.

- **D-27:** **Session-expiry detection during run/submit:** `interpret_solution` and `submit` POST endpoints can return 401/403 or redirect to login. The orchestrator reuses `isSessionExpired` from `src/api/LeetCodeClient.ts` (Phase 1 CF-04 plumbing). On session expiry:
  - Abort polling, close pending modal
  - Fire the existing Phase 1 re-auth Notice ("Session expired. Log in again.") via `AuthService`
  - Do not retry automatically after re-auth — user re-invokes the command

### REST Endpoint Mechanics

- **D-28:** **Hand-rolled REST module** lives in `src/solve/leetcodeRest.ts` (or similar; planner discretion on split). Three functions:
  - `interpretSolution({ slug, lang, typedCode, dataInput, questionId }) → { interpret_id }`
  - `submitSolution({ slug, lang, typedCode, questionId }) → { submission_id }`
  - `checkSubmission({ id }) → CheckResponse` (discriminated union: run result vs submit result)

  All three go through the same `requestUrlFetcher` + throttle that `LeetCodeClient` uses — **do NOT construct a second fetcher**. Bridge pattern: expose the throttle's internal `requestUrlFetcher` (or add a thin wrapper) so `leetcodeRest.ts` can invoke it directly for non-GraphQL calls.

- **D-29:** **Endpoint paths** (per CLAUDE.md §LeetCode API and `skygragon/leetcode-cli` lib/config.js):
  - `POST https://leetcode.com/problems/{slug}/interpret_solution/`
  - `POST https://leetcode.com/problems/{slug}/submit/`
  - `GET  https://leetcode.com/submissions/detail/{id}/check/`

  Headers (all three):
  - `Content-Type: application/json`
  - `Referer: https://leetcode.com/problems/{slug}/`
  - `x-csrftoken: <csrftoken from SettingsStore auth cookies>`
  - Cookie header is managed by Obsidian's `requestUrl` automatically when the session cookie is in the user's Electron cookie jar — **BUT** Phase 1 stores the session cookie in `data.json`, not in the Electron cookie jar. Researcher must confirm: either (a) explicitly send `Cookie: LEETCODE_SESSION=...; csrftoken=...` header from `SettingsStore.getAuthCookies()`, or (b) inject cookies into the session partition on login. **Planner flags this as a P0 research item.**

- **D-30:** **Request body shape** (verified against leetcode-cli reference; researcher confirms current shape):
  ```ts
  interpret_solution: {
    lang: 'python3' | 'java' | ...,   // LC langSlug
    question_id: string,              // NOT the slug — the internal numeric id (from problemDetails.id or questionFrontendId)
    typed_code: string,               // user's code
    data_input: string,               // test input (LC raw format)
    judge_type: 'large'               // required per vscode-leetcode source
  }

  submit: {
    lang, question_id, typed_code,
    judge_type: 'large'
  }
  ```

  Researcher MUST verify whether `question_id` is the numeric frontend id (`questionFrontendId`) or the internal `questionId` — these diverge for some problems (e.g., premium variants). Cache `problemDetails` from Phase 2 already has `questionFrontendId`; the internal `questionId` may need an added cache field.

- **D-31:** **Fixture capture (STATE.md concern 1):** before merging Phase 3, capture **live fixtures for all six verdict types** against the live LC service. Store in `tests/fixtures/lc-verdicts/` (one JSON file per verdict type). Used for unit-testing the verdict-modal renderer without requiring network access. Planner assigns fixture capture as a specific plan (early — probably the first plan after infra).

### Claude's Discretion

- Exact module layout under `src/solve/` (orchestrator vs REST client vs modal split). Expected files: `SubmissionOrchestrator.ts`, `leetcodeRest.ts`, `VerdictModal.ts`, `CustomTestModal.ts`, `codeExtractor.ts`, `languages.ts`, `types.ts`. Planner may collapse or split as makes sense.
- Whether `SubmissionOrchestrator` is a singleton service registered in `main.ts` (like `ProblemListService`) or a per-command factory. Prefer singleton — simplifies D-24's in-flight check.
- CSS approach for verdict-modal diff highlighting (inline color classes vs CSS variables). Follow Phase 1 convention of class-scoped `.leetcode-*` selectors in `styles.css`.
- Exact icon / emoji in verdict-modal titles. Could be plain text (`Accepted`), a colored dot (`● Accepted`), or a status icon from Obsidian's `setIcon` palette. Recommend `setIcon` with `check-circle` (AC) / `x-circle` (WA, TLE, MLE, RE) / `alert-triangle` (CE, Unknown). Planner decides; UI-SPEC optional.
- Retry-after handling for 429s during polling: respect `Retry-After` header if present, otherwise use current backoff interval. Planner picks.
- Whether custom-test cases persist in `data.json` (per-slug map) OR in-note under `## Custom Tests`. **Locked: in-note (D-18)** — but planner decides internal in-memory representation.
- Whether to cache `question_id` (internal numeric id) in `problemDetails` cache or re-fetch per submission. Prefer cache (extend the Phase 2 `DetailCacheEntry` shape).
- Language normalization aliases table scope: which fence tags to recognize. Start with the obvious aliases; expand as users report misses (deferred).
- Whether the verdict modal should auto-close after N seconds on AC (LC's web UI doesn't). Recommendation: no auto-close; AC is rare and the user wants to see percentiles. Planner confirms.

### Carried Forward from PROJECT.md / STATE.md / Phase 1 & 2 CONTEXT.md (not re-asked)

- **CF-01:** All LC calls via `api/throttle.ts → requestUrlFetcher`. Phase 3's hand-rolled REST uses the same pipe — no direct `requestUrl`, no `fetch`, no `axios`. (Phase 1 D-12, Phase 2 CF-01.)
- **CF-02:** `isDesktopOnly: true` stays in `manifest.json`. No new Electron imports in Phase 3 — it's pure TS + Obsidian API + the existing Phase 1 auth/fetcher stack. (Phase 1 CF-02, Phase 2 CF-02, Phase 2 CF-06.)
- **CF-03:** Session cookie + CSRF token live only in `data.json`; never logged, never sent off leetcode.com. Phase 3's REST calls read them via `SettingsStore.getAuthCookies()` at request time. (Phase 1 CF-03.)
- **CF-04:** Session-expiry detection via `isSessionExpired` in `src/api/LeetCodeClient.ts` — **OWNERSHIP LOCKED**; Phase 3 imports and reuses. (LeetCodeClient.ts:132, Phase 2 CF-04.)
- **CF-05:** `eslint-plugin-obsidianmd` zero Required violations. Phase 3 adds no new violations: no `innerHTML`, no raw `fetch`, no default hotkeys (D-10), no plugin-id-prefixed command ids, sentence-case Notice copy with terminal period (Phase 1 UI-SPEC §Notice Copy). (Phase 1 CF-05, Phase 2 CF-05.)
- **CF-06:** All vault writes for the problem note use `vault.process()` + `app.fileManager.processFrontMatter()`. `vault.modify()` on problem notes remains permanently forbidden. Grep gate in Phase 3 execution:
  ```
  grep -rE "vault\.modify\s*\(" src/solve/ src/notes/ --include='*.ts'    # must be empty
  ```
  (Phase 2 D-22, STATE.md Phase 4 pre-plan rule.)
- **CF-07:** `createEl()` discipline for all DOM in `VerdictModal` and `CustomTestModal`. No `innerHTML` — especially risky for WA diff rendering of user-output strings. (Phase 1 Shared Pattern 3, Phase 2 CF-05.)
- **CF-08:** Default language `python3`; default problems folder `LeetCode` (no trailing slash in storage). `SettingsStore.sanitizeFolder()` already rejects path-traversal and absolute paths. (Phase 1 D-10, Phase 2 CF-07.)
- **CF-09:** Rate ceiling 20 req / 10 s + max 2 concurrent. Phase 3 polling stays well under this; two-concurrent-submission is blocked at D-24 before hitting throttle. (Phase 1 CF-07, D-12.)
- **CF-10:** Throttle UX is silent queue. Routine throttling stays invisible; 429 surfaces one-shot Notice via existing Phase 1 path. (Phase 1 D-13, D-14.)
- **CF-11:** Feature-first folder layout — Phase 3 adds `src/solve/` as a new sibling folder. Does not scatter solve code across `src/notes/`, `src/browse/`, etc. (Phase 1 D-01.)
- **CF-12:** Phase 2 frontmatter schema locked. Phase 3 does NOT add new `lc-*` fields — Phase 4 owns the Accepted-path fields (`lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, status transitions). `lc-language` is read (for default-language resolution in starter-code injection) but not written by Phase 3. (Phase 2 D-03, D-04.)
- **CF-13:** `codeSnippets` and `exampleTestcases` already cached in `problemDetails[slug]` from Phase 2 (Phase 2 D-14). Phase 3 reads them — no new fetch for starter-code injection or initial custom-test-modal population.
- **CF-14:** Cache TTL 7 days for `problemDetails` (Phase 2 D-11). If starter-code injection or custom-test population hits a stale-cache problem, the Phase 2 background-refresh flow handles it silently on the next note open.
- **CF-15:** `IndexedProblem.topicSlugs` still populated at Phase 1 refresh time — Phase 4 consumes this for `[[Technique]]` backlinks; Phase 3 does not need it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — Core value, constraints, Key Decisions (one-note-per-problem, all LC languages supported, remote execution only, no local runtimes)
- `.planning/REQUIREMENTS.md` §v1 Solving & Submission — SOLVE-01..09 (code in note, starter code, run sample, run custom, submit, polling with backoff, verdict/runtime/memory, all languages, current-content-at-submit)
- `.planning/ROADMAP.md` §Phase 3 — Goal, five success criteria (note includes starter code → run → submit → 1s/2s/4s/8s backoff → verdict modal → current content not stale)
- `.planning/STATE.md` §Blockers/Concerns — "Phase 3 has a research/spike dependency: LC REST endpoint response shapes for all verdict types must be captured against the live service before implementation. This is the highest-risk phase."
- `.planning/STATE.md` §Accumulated Context — "Phase 3: Highest-risk phase; capture live fixtures for all six verdict types (AC/WA/TLE/MLE/CE/RE) before implementing polling logic"
- `.planning/phases/01-plugin-foundation/01-CONTEXT.md` — Phase 1 locks: `requestUrl` adapter, throttle wiring (D-12), auth cookie storage, feature-first layout, session-expiry helper ownership
- `.planning/phases/01-plugin-foundation/01-PATTERNS.md` — Shared Patterns 2 (requestUrl-only HTTP), 3 (DOM via createEl only), 4 (Notice copy locked, no default hotkeys)
- `.planning/phases/01-plugin-foundation/01-UI-SPEC.md` — Notice copy table, Copywriting contract (sentence case + terminal period), CSS conventions — applies to `VerdictModal`, `CustomTestModal`, and any new Notice strings Phase 3 introduces
- `.planning/phases/02-problems-as-notes/02-CONTEXT.md` — Frontmatter schema lock (D-03), heading ownership heuristic (D-08, D-09 — extend to `## Code` / `## Custom Tests`), detail cache schema (D-14 — `codeSnippets`, `exampleTestcases` already cached), `vault.process()` + `processFrontMatter()` discipline (D-22)

### Tech stack (locked in CLAUDE.md)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §LeetCode API → "Hand-rolled REST for run/submit" row — Phase 3's scope is exactly this row
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §HTTP Client — `requestUrl` is the only allowed transport for LC calls
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §6 Markdown Rendering — `innerHTML` forbidden; `createEl()` for DOM (relevant for `VerdictModal` WA-diff rendering)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Stack Patterns → "Poll `check/` every 2 s; abort after 30 s" — **OVERRIDDEN by CONTEXT D-21 / D-22** (backoff 1/2/4/8s cadence, 60s cap per ROADMAP)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Stack Patterns → "Use `setInterval` / `clearInterval` via `this.registerInterval()` so it auto-cleans on plugin unload" — polling must use registered timers
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §8 Community Plugin Store Requirements → no default hotkeys, no obfuscated code, no `innerHTML` with user data, `isDesktopOnly`
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Sources → `skygragon/leetcode-cli` lib/config.js — reference for REST endpoint paths and request body shapes (MEDIUM confidence; **researcher must verify against current LC in D-29, D-30**)

### Obsidian & LC docs (researcher MUST fetch and verify)
- `obsidianmd/obsidian-api` `obsidian.d.ts` — `Modal` class API, `createEl` + `createDiv` API, `setIcon` palette, `Notice` constructor, `registerInterval`
- `obsidianmd/obsidian-api` `obsidian.d.ts` — `Plugin.registerDomEvent`, `Plugin.addCommand` (command id rules, no default hotkeys), `TFile`, `WorkspaceLeaf.openFile`
- `obsidianmd/obsidian-developer-docs` — Modal component best practices, Command API
- `obsidianmd/obsidian-developer-docs` — `MarkdownPostProcessor` and CM6 `EditorView` access (FOR PHASE 5 reference; Phase 3 does NOT use these but planner may read to understand what's being deferred)
- `skygragon/leetcode-cli` `lib/config.js` + `lib/plugins/leetcode.js` — authoritative reference for `interpret_solution` / `submit` / `check` endpoint paths, request headers (`Referer`, `x-csrftoken`), request body (`data_input`, `judge_type`, `question_id` vs `question_frontend_id`). **P0 research item: confirm current shape against live LC.**
- `@leetnotion/leetcode-api` source — confirm whether any non-GraphQL REST helpers exist (expected: no; CLAUDE.md confirms). If one emerges in a 2026 version, reuse it.
- `microsoft/vscode-leetcode` source (`src/commands/show.ts`, `src/commands/submit.ts`) — reference for `question_id` resolution semantics, timing of CSRF header refresh, verdict status_code integer map

### What to avoid
- `fetch()` / `axios` / `node-fetch` for REST endpoints — CORS-blocked in Electron renderer; use `requestUrl` via the existing Phase 1 fetcher pipe (D-28)
- A second throttle or fetcher layer — reuse `api/throttle.ts` (CF-01, D-25)
- `innerHTML` in verdict-modal diff rendering — user-output strings are untrusted (D-12, CF-07)
- `vault.modify()` on problem notes — use `vault.process()` + `processFrontMatter()` for any note mutation (CF-06)
- `setInterval` / `setTimeout` not registered via plugin helpers — causes leaks on plugin unload
- Pre-warming / speculative polling of submissions without user action
- Default keyboard shortcuts (FND-03, D-10) — users assign in Obsidian settings
- Writing `## Solution`, `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, or `[[Technique]]` backlinks on AC — Phase 4 scope (D-12 AC-state caveat)
- Parsing starter-code signatures to build per-argument custom-test UI — deferred to Phase 5 (D-17)
- Overlay Run/Submit buttons on the code block (Reading Mode or Live Preview) — deferred to Phase 5 (D-11)
- Mocking the LC REST endpoints in tests without a real fixture capture — D-31 requires live fixtures for the six verdict types before shipping

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phases 1 & 2, shipped in `src/`)

- **`src/api/throttle.ts`** — token bucket (20 / 10s) + concurrency limiter (max 2). Phase 3 REST calls route through this. **Integration point:** the throttle currently composes `requestUrl` inside `requestUrlFetcher`. Phase 3 may need to either (a) expose the internal `requestUrlFetcher` for non-GraphQL direct use, or (b) add a thin `throttledRequestUrl(req)` helper that preserves the throttle semantics for arbitrary `RequestUrlParam` payloads. Planner picks; minimal surface expansion.

- **`src/api/requestUrlFetcher.ts`** — the fetcher installed into `@leetnotion/leetcode-api` via `fetcher.set()`. Phase 3 does NOT use the GraphQL client for REST endpoints; it uses the lower-level throttled `requestUrl` call. Shape alignment: Phase 3's hand-rolled REST returns typed responses; the fetcher here is GraphQL-oriented. Expect a parallel, simpler `restRequest(params) → RequestUrlResponse` helper.

- **`src/api/LeetCodeClient.ts`** — holds auth state (`isSessionExpired` helper + `Credential` lifecycle). Phase 3 imports `isSessionExpired` for post-response session checks (D-27, CF-04). Do NOT duplicate the helper. The `LeetCodeClient` class itself is GraphQL-only; Phase 3 REST does not extend it — REST lives in `src/solve/leetcodeRest.ts` as a sibling module.

- **`src/settings/SettingsStore.ts`** — `getAuthCookies()` returns `{ LEETCODE_SESSION, csrftoken } | null`. Phase 3 reads at request time (not at orchestrator construction) so post-login/logout cookie changes take effect immediately. Phase 3 may extend `problemDetails[slug]` cache shape with `internalQuestionId?: string` if researcher confirms divergence from `questionFrontendId` (D-30).

- **`src/notes/NoteTemplate.ts`** — single source of truth for note structure. Phase 3 extends the heading inventory: adds `## Code` (canonical between `## Problem` and `## Notes`) and `## Custom Tests` (canonical after `## Notes`, lazy). **Schema change must happen here** — other modules must not hardcode heading names.

- **`src/notes/NoteWriter.ts`** — Phase 2 orchestrator for open/create/refresh. Phase 3 extends it with a retrofit step (D-07 item 2): after the cached-or-refreshed `## Problem` write, check for `## Code` + fenced block; if missing, insert starter code. Retrofit is idempotent and silent.

- **`src/notes/HeadingRegion.ts`** — region regenerator for `## Problem` (Phase 2 D-09). Phase 3 reuses or extends this for `## Code` ownership (D-08) and `## Custom Tests` with nested `### Case N` subheadings (D-19). Planner decides whether to generalize `HeadingRegion` or add a specialized `CustomTestRegion.ts`.

- **`src/notes/htmlToMarkdown.ts`** — turndown wrapper. Not used by Phase 3 (no HTML rendering here), but referenced for CSS-class and copy-style consistency.

- **`src/browse/ProblemBrowserView.ts`** — Phase 2's entry point (row click → NoteWriter). Phase 3 does NOT touch the browser view directly. Commands registered in `main.ts` operate on the **active `MarkdownView`**.

- **`src/shared/logger.ts`** — Phase 3 uses for warn-level unknown-verdict logging (D-15). Key redaction is already wired (Phase 1), so verdict payloads with session artifacts are safe.

- **`src/shared/errors.ts`** — Phase 3 may add a new error class (e.g., `SubmissionError` with discriminated subtypes: `NoCodeBlock`, `InProgress`, `JudgeTimeout`, `SessionExpired`, `UnknownVerdict`). Planner discretion.

- **`src/shared/timers.ts`** — if Phase 2 introduced a registered-timer helper, Phase 3 reuses it for polling. Otherwise, polling uses `this.registerInterval()` on the plugin instance.

### Established Patterns (from Phases 1 & 2 — must carry forward)

- **Feature-first folder layout:** Phase 3 adds `src/solve/` as a new sibling. Expected files (planner discretion on exact split): `SubmissionOrchestrator.ts`, `leetcodeRest.ts`, `VerdictModal.ts`, `CustomTestModal.ts`, `codeExtractor.ts`, `languages.ts`, `types.ts`. Do NOT scatter solve code across other folders.

- **All LC calls through throttle/fetcher pipe:** Phase 3 REST joins the same pipe. No parallel HTTP stack.

- **All vault writes via `vault.process()` / `processFrontMatter()`:** Phase 3 doesn't write vault content on Run/Submit during Phase 3 (Phase 4 owns the on-AC vault writes). BUT starter-code retrofit and `## Custom Tests` persistence are vault writes — must follow the pattern.

- **`createEl()` only for DOM:** `VerdictModal` and `CustomTestModal` built entirely with `createEl()` / `createDiv()`. WA-diff output uses `.setText()` on nested spans (no `innerHTML`).

- **Notice copy locked:** any new Notice Phase 3 introduces follows sentence case + terminal period discipline from Phase 1 UI-SPEC. Candidate new Notices (UI reviewer confirms):
  - `No code block found. Add a fenced block with your solution.` (D-04)
  - `A submission is already in progress. Cancel it first or wait for the verdict.` (D-24)
  - `LeetCode judge timed out. Try again.` (D-22)
  - `Starter code inserted.` (D-07, optional — may be silent like retrofit)

- **No default hotkeys on any new command (D-10, FND-03).**

- **Settings not extended in Phase 3:** Phase 5 will add Phase 3-specific controls (e.g., "Poll timeout" override, "Overlay buttons" toggle once Phase 5 ships them). Phase 3 uses existing Phase 1 defaults (default language, problems folder).

### Integration Points

- **`main.ts` wiring order** — Phase 3 adds a new step between `NoteWriter` registration and `ProblemBrowserView` registration:
  1. Settings load
  2. Fetcher / throttle
  3. LC client + auth
  4. Problem list service
  5. Note writer (Phase 2)
  6. **Submission orchestrator (Phase 3) — new**
  7. Register commands (Phase 3 adds `LeetCode: Run code (sample)`, `Run code (custom input)`, `Submit`, `Insert starter code`, `Cancel running submission`)
  8. Register problem browser view, settings tab, ribbon, command palette (Phase 1)

- **`NoteWriter.openOrRefresh(slug)` extension** — after the Phase 2 cached-or-refreshed `## Problem` write, a Phase 3 hook runs:
  1. Check if `## Code` exists with a fenced block
  2. If missing, look up `codeSnippets[lc-language]` from `problemDetails[slug]` (or settings default language)
  3. Insert `## Code` + fenced block via `HeadingRegion` pattern
  4. Silent on success; debug-log on retrofit failure (D-09)

- **Command `LeetCode: Run code (sample) / (custom input) / Submit`** — all three get the active `MarkdownView`, extract the first fenced code block (D-01), resolve language (D-02, D-03), resolve `question_id` from frontmatter `lc-id` (or `problemDetails[slug]`), then delegate to `SubmissionOrchestrator`. If no active problem note, Notice: `Open a LeetCode problem note first.` (add to UI-SPEC candidates.)

- **`SubmissionOrchestrator.submit(context) → Promise<void>`** — opens `VerdictModal` in pending state, fires REST call, manages polling, updates modal state. Holds the single-flight flag for D-24. Registers polling interval via `this.plugin.registerInterval()` so it auto-cleans on unload.

- **`CustomTestModal.open(slug) → Promise<{ input: string } | null>`** — opens modal, reads persisted cases from note (via `HeadingRegion` over `## Custom Tests`), pre-populates tabs, returns the user's selected input on Run (or null on close). On modal close (not cancel), writes updated cases back to the note if changed.

- **`VerdictModal.open(context) → Modal`** — pending state initially; receives verdict updates via orchestrator callback or subscription. Renders all six verdict types + the unknown case. Handles `Copy failing testcase to custom input` (opens `CustomTestModal` with the failing input pre-seeded as a new tab).

- **`manifest.json`** — no changes in Phase 3. `minAppVersion` was bumped in Phase 2 for Bases (D-19 locked by Phase 2 planner). Phase 3 uses only APIs already available in the committed target version.

</code_context>

<specifics>
## Specific Ideas

- **LC-native verdict UX:** the author explicitly referenced LC's own web-UI verdict display as the visual target — Input / Output / Expected with diff-colored formatting for WA (screenshot shared during discussion). `VerdictModal` should feel like the LC-native result pane, not a generic Obsidian modal. This is a **spirit test** for the phase: if the WA modal feels less polished than LC's, Phase 3 failed qualitatively even if the tests pass.
- **LC-native custom-test UX:** author also referenced LC's tabbed custom-input UI (Case 1 / Case 2 / Case 3 / +, screenshot shared). `CustomTestModal` replicates the tabbed structure but **without** the per-argument labeled inputs — each tab is a plain textarea in LC's raw newline-delimited format. The label-parsing polish is explicitly deferred to Phase 5.
- **Author dogfooding perspective:** the most-hit flow once Phase 3 is live is "read the problem → tweak code → Run against samples → Submit." That flow must feel **fast and LC-equivalent**. Specifically:
  - Run Code latency should be dominated by LC's judge, not plugin overhead (sub-100ms plugin path from command invocation to first REST call)
  - Submit should open the pending-verdict modal **immediately** (before the first `/submit/` POST returns); status updates stream in as polling progresses
  - Cancel must be instant (no waiting for the in-flight `requestUrl` to complete) — the modal closes, polling stops via the abort flag, and the user can submit again right away
- **"One problem, multiple submissions in different languages":** the author explicitly confirmed this as a supported workflow. Changing the fence tag (```` ```python3 ```` → ```` ```java ````) + re-running starter-code insertion (via `Insert starter code` command) switches languages without disturbing frontmatter. Frontmatter `lc-language` is a default, not a source of truth.
- **Overlay-button deferral rationale:** the author saw the LC-native code editor chrome (language switcher, bookmark, format, reset, expand) and asked about feasibility. The ship-first answer was command palette only for Phase 3; the visual target persists as a **Phase 5 Polish design goal** — Reading Mode `MarkdownPostProcessor`-based icon row is the low-risk path; Live Preview (CM6) is a harder follow-up. Capture this as the intended Polish design, not a vague "improve UX" item.

</specifics>

<deferred>
## Deferred Ideas

Captured during Phase 3 discussion, redirected away from Phase 3 scope:

- **Overlay Run/Submit buttons on the code block** — LC-style icon row (language switcher, format, reset, expand, bookmark, Run, Submit) rendered over the fenced code block. Reading Mode path via `MarkdownPostProcessor` is feasible in Phase 5; Live Preview path via CM6 `EditorView` is harder (undocumented API). **Design goal locked for Phase 5 Polish.** Phase 3 ships command-palette-only.
- **Per-argument labeled inputs in custom-test modal** — LC's `nums = [3,2,4]`, `target = 6` per-arg UI requires parsing the starter-code signature per language. Fragile; defer to Phase 5. Phase 3 ships plain-textarea tabs.
- **Submission history browsing** — show past submissions for a problem (time, verdict, runtime, language) in a side pane or modal. Not in v1 requirements. Candidate for a dedicated post-v1 phase.
- **Retry button in verdict modal** — on WA/TLE/CE, a "Submit again" button that re-runs without closing the modal. Nice-to-have; deferred to Phase 5.
- **Auto-language detection from starter code** — infer language from fenced-block syntax when the user pastes unlabeled code. Deferred; `Insert starter code` + explicit tag is the intended path.
- **Large-output truncation strategy for verdict modal** — when LC returns huge `std_output` or `code_output` (e.g., arrays with thousands of elements), the modal should truncate with "show more" rather than render all. Phase 3 ship-first attempts baseline rendering; if rendering performance is an observed issue, Phase 5 Polish adds the collapse.
- **Test against a mocked LC server** — integration tests that stand up a local stub of `interpret_solution` / `submit` / `check`. Phase 3 unit-tests the fixture-driven renderer and the orchestrator's state machine; full integration testing with mocked HTTP is a deferred reliability upgrade.
- **Submission diff highlighting granularity** — character-level or word-level diff in WA output rendering. Phase 3 ships line-level (or whole-value) diff; fine-grained diff is a Phase 5 polish.
- **Error-copy polish for REST failures** — LC offline vs 429 vs network timeout vs 500 error messages. Phase 3 uses a minimal set of Notices (D-04, D-22, D-24) + the Phase 1 session-expiry flow; fuller graceful messaging is POLISH-02 (Phase 5).

Standing deferrals (already in PROJECT.md / REQUIREMENTS.md):
- On-Accepted solution append, frontmatter update, `[[Technique]]` backlinks, technique stubs → Phase 4 (GRAPH-01..05)
- Settings-UI completeness (all POLISH-01 controls), telemetry-free verification, README + network-disclosure copy, community plugin store PR → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI enhancements → v2 (SR-01..03, CN-01..02, MOB-01..02, AI-01..02)

</deferred>

---

*Phase: 3-run-submit*
*Context gathered: 2026-05-08*
