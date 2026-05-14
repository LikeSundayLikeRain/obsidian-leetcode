# Feature Research

**Domain:** Obsidian community plugin — LeetCode integration
**Researched:** 2026-05-07
**Confidence:** HIGH (vscode-leetcode fully audited; LC REST endpoints confirmed via leetcode-cli source; 5 existing Obsidian LC plugins surveyed)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.
Benchmark: vscode-leetcode is the reference implementation users will compare against.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Authentication / login** | Can't do anything without a session | M | Electron BrowserWindow captures `LEETCODE_SESSION` + `csrftoken` cookies after normal LC login flow. Cookie-paste fallback for edge cases. vscode-leetcode broke its bespoke `/authorize-login/vscode/` endpoint — we must not depend on that. |
| **Session persistence + expiry handling** | Sessions expire; re-login must be smooth | S | Store cookie in Obsidian plugin data (never plaintext in vault). Detect 401/403 and prompt re-login gracefully. |
| **Problem browser / list** | Users need to find problems | M | Fetch full problem list via LC GraphQL (`problemsetQuestionList`). Show #, title, difficulty, solved-status. Filter by difficulty, tag, status. Search by keyword. |
| **Problem detail view** | Read the problem before solving | M | Render problem description (HTML→Markdown) in a note. Include constraints, examples, hints. Cache to disk after first fetch — enables offline reading. |
| **Solved / attempted status indicator** | Core progress tracking | S | Mirror LC's status per problem (solved/attempted/unattempted) in the problem list view and in note frontmatter (`status` field). |
| **Code editor per language** | Write solution without leaving Obsidian | M | Code block in note (fenced, language-tagged). Default language in settings. All LC-supported languages selectable per problem. Scaffold from LC's starter code template fetched via GraphQL. |
| **Run code against sample test cases** | Verify before submitting | L | POST to `https://leetcode.com/problems/{slug}/interpret_solution/` with `{lang, question_id, typed_code, data_input}`. Poll `https://leetcode.com/submissions/detail/{interpret_id}/check/` until `state === "SUCCESS"`. Display output vs expected per test case. Custom test case input supported. |
| **Submit code to judge** | The core action | L | POST to `https://leetcode.com/problems/{slug}/submit/` with `{lang, question_id, typed_code, judge_type: "large"}`. Poll `/check/` endpoint. Display verdict (Accepted / Wrong Answer / TLE / MLE / Runtime Error / Compile Error). |
| **Verdict display** | Users need to know what happened | S | Show: status string, runtime (ms + percentile), memory (MB + percentile), failed test case on WA, compile error message. Render in a modal or panel within Obsidian. |
| **Rate limit + downtime error handling** | LC is flaky; polling must be robust | S | Exponential backoff on polling. Surface friendly errors for 429 (rate limit), 503 (LC downtime), cookie expiry. Never silently fail. |
| **Settings UI** | Plugin configuration | S | Obsidian settings tab with: session cookie display/clear, default language, vault folder for problem notes, file naming template. Uses standard Obsidian `addSettingTab` API — text inputs, dropdowns, toggles. |
| **Default language selection** | Workflow preference | S | Setting stored in plugin config. Overridable per-problem on open. Matches vscode-leetcode's `leetcode.defaultLanguage`. |

---

### Differentiators (Obsidian-Native Value)

Features that exploit what Obsidian uniquely provides. Not in vscode-leetcode (it has no note graph). These are the core competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **One note per problem (vault layout)** | Every problem is a first-class Obsidian note — searchable, linkable, taggable | S | Create `{vault}/{folder}/{id}-{slug}.md` on first open. Idempotent: re-opening an existing problem opens the same note. File naming template configurable. Enables all other Obsidian-native features downstream. |
| **LC tag import as Obsidian tags** | Problem topics (Array, DP, Sliding Window…) become vault-wide tags instantly | S | Fetch `topicTags` from LC GraphQL on problem open. Write as YAML frontmatter `tags: [array, dynamic-programming, ...]`. Normalized to lowercase-hyphen. Users can then use Obsidian tag search and tag pane across all problems. |
| **User-added personal tags** | `#revisit`, `#tricky`, `#interview-asked` — custom taxonomy on top of LC's | S | Frontmatter `user_tags` field (separate from LC `tags` to avoid clobbering on re-sync). Plugin never overwrites `user_tags`. Edit directly in note frontmatter. |
| **Auto-append accepted solution to note** | Solved problem → solution captured in the note permanently | S | On verdict = Accepted: extract code from the active code block, append a `## Solution (YYYY-MM-DD)` section with fenced code block. Subsequent accepted submissions append (don't overwrite) — preserves history. |
| **Auto-update frontmatter on accepted submission** | Rich metadata: solved date, runtime, memory, language | S | On verdict = Accepted: update frontmatter fields `solved_date`, `runtime_ms`, `memory_mb`, `language`, `status: solved`. Uses Obsidian's `app.vault.process()` to surgically update YAML without touching note body. |
| **Auto-backlinks to technique notes on accept** | Solving compounds into a knowledge graph — the plugin's unique value | M | On verdict = Accepted: for each LC topic tag on the problem, ensure a wikilink `[[Two Pointers]]` exists in a `## Techniques` section of the problem note. Creates stub technique notes (e.g. `Two Pointers.md`) in a configurable `techniques/` folder if they don't exist. Backlinks "just work" in Obsidian graph. |
| **Graph-friendly wikilinks** | Problem notes participate in Obsidian's graph view without manual linking | S | Wikilinks to technique notes + difficulty-based tags → rich graph. No special graph API needed — standard `[[link]]` syntax in the note body is enough. Configurable: user can opt out of auto-linking. |
| **Offline-readable cached problem content** | Problems readable on a plane, without LC session | S | Problem description (converted to Markdown) stored in note on first fetch. No re-fetch needed to read. Code submissions still require internet (by definition). Problem list cache stored in plugin data with TTL. |
| **Dataview compatibility** | Power users can query their problem database with the popular Dataview plugin | S | Design frontmatter schema to be Dataview-friendly (`tags`, `difficulty`, `status`, `solved_date`, `runtime_ms`, `memory_mb`, `language`, `leetcode_id`, `url`). Zero extra work — just good frontmatter design. Document example Dataview queries in README. |
| **Obsidian settings-UI integration** | Native settings feel, not a separate config file | S | Use `addSettingTab` with `Setting` components. No raw JSON editing. Matches every other Obsidian plugin's UX contract. |

---

### Anti-Features (Explicitly Not Building)

Features that seem reasonable but are out of scope for v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Local code execution runtimes** | "Run without internet" sounds useful | Requires bundling language runtimes (Python/JVM/Node) — massive binary size, security surface, platform matrix. LC's remote `/interpret_solution/` endpoint already handles this for free. | Use LC's remote run endpoint. |
| **IDE-grade editing** (IntelliSense, linting, debugger) | Developers want autocompletion | Obsidian is not an IDE; implementing LSP in a plugin is a full project. Users with IDE needs should use their IDE alongside this plugin. | Document: "for deep editing, open in your IDE; use this plugin for capture." |
| **leetcode.cn support in v1** | Chinese users want it | Different domain, different GraphQL schema variants, different auth flow (WeChat, phone). Doubles the auth/API surface. | Design the API abstraction layer (endpoint-agnostic) so v2 can add CN without rewrite. |
| **Mobile (iOS/Android) support in v1** | Obsidian mobile exists | Electron BrowserWindow (used for embedded login) does not exist on mobile. Capacitor plugin API diverges. Re-login via cookie paste is clunky on mobile. | Document desktop-only scope. Revisit in v2 with cookie-paste-only auth path. |
| **Spaced repetition / review scheduling** | "Tell me what to practice" is valuable | Full SR system (SM-2/FSRS algorithms, due-date tracking, review UI) is a separate product. V1's graph + tags already answer "what should I revisit?" | Defer to v2. Document the integration point (frontmatter `last_reviewed`, `ease_factor` fields) so v2 can bolt on. |
| **AI-powered auto-tagging** | "Automatically categorize my solution" | Requires LLM API key, adds cost, privacy concerns (code sent externally), non-deterministic. Fragile until core is stable. | Defer to v2 after LC tag import is solid. |
| **Top-voted solution viewer** | vscode-leetcode has it | Useful but not core to the note-taking value prop. LC's solution page is one browser click away. | Link to LC solutions page from the note; don't replicate in-plugin. |
| **Contest participation features** | Some LC users do contests | Contest timing, ranking, virtual contests — completely different UX. Out of scope for problem-practice focus. | Out of scope permanently unless a milestone proposal adds it. |

---

## Feature Dependencies

```
Authentication (session cookie)
    └──required by──> Problem List (GraphQL calls need session)
    └──required by──> Problem Detail (fetch starter code, tags)
    └──required by──> Run Code (POST to LC with cookie)
    └──required by──> Submit Code (POST to LC with cookie)
    └──required by──> Session Management (list/switch sessions)

Problem Detail
    └──required by──> Code Editor (need starter code template + language list)
    └──required by──> LC Tag Import (tags fetched with problem detail)
    └──enables──>     Offline Caching (description stored after first fetch)

Problem Browser
    └──required by──> Open Problem as Note (select → open)
    └──enhances──>    Solved/Attempted Status (status shown in list)

Run Code
    └──required by──> Verdict Display (run result is a verdict variant)
    └──requires──>    Code Editor (code must exist to run)

Submit Code
    └──required by──> Auto-append Accepted Solution
    └──required by──> Auto-update Frontmatter on Accept
    └──required by──> Auto-backlinks to Technique Notes
    └──requires──>    Code Editor (code must exist to submit)

Auto-backlinks to Technique Notes
    └──enhances──>    Graph-friendly Wikilinks (backlinks make graph interesting)
    └──requires──>    LC Tag Import (need topic tags to know which techniques to link)

One Note Per Problem
    └──required by──> ALL Obsidian-native differentiators (everything lives in the note)

LC Tag Import
    └──enhances──>    Dataview Compatibility (tags in frontmatter = Dataview-queryable)
    └──enhances──>    User-added Personal Tags (separate field alongside LC tags)
```

### Dependency Notes

- **Run Code and Submit Code are independent of each other** — a user can submit without running first (uncommon but valid). Neither depends on the other.
- **Auto-frontmatter update requires Submit Code** — triggered only on Accepted verdict from a real submission, not from Run Code results.
- **Offline caching is a side-effect of Problem Detail fetch** — no separate feature gate needed; just write to disk when detail is fetched.
- **Dataview compatibility requires zero extra implementation** — it's a frontmatter schema design choice, not a feature to build.

---

## vscode-leetcode Feature Parity Analysis

| vscode-leetcode Feature | In Our Plugin? | Notes |
|-------------------------|---------------|-------|
| Sign in / sign out | YES | Different mechanism: embedded BrowserWindow vs bespoke LC redirect. |
| leetcode.cn endpoint | NO (v2) | Explicitly deferred. |
| Problem Explorer (sidebar list) | YES | Obsidian leaf/view instead of VS Code tree view. |
| Search by keyword | YES | Filter in problem list view. |
| Hide solved problems toggle | YES | Settings toggle + list filter. |
| Difficulty colorization | YES | Difficulty shown in list; frontmatter `difficulty` enables Obsidian CSS snippet coloring. |
| Show problem description | YES | In the note itself (Markdown). vscode-leetcode opens a webview; we render Markdown. |
| 16 language support | YES | All LC-supported languages; language-agnostic API call. |
| Default language setting | YES | Obsidian settings tab. |
| Submit code (Code Lens) | YES | Obsidian command palette + ribbon button. |
| Test code with custom cases | YES | Run Code feature with custom test case input. |
| Star / favorite | NO | Not in v1. LC favorites are useful but not graph-native. |
| Show top voted solution | NO (by design) | Anti-feature: link to LC solutions page instead. |
| Manage sessions (create/delete) | PARTIAL | Session switch in v1 (display active session); create/delete deferred — low usage. |
| Status bar session indicator | YES | Obsidian status bar item showing current LC user. |
| Side-by-side mode | N/A | Obsidian's split panes cover this natively; no special implementation needed. |
| WSL support | N/A | vscode-leetcode needs WSL because it shells out to Node.js CLI. We call LC REST/GraphQL directly — no shell dependency. |
| File path / naming customization | YES | Settings: vault folder + file name template `{{id}}-{{slug}}`. |

**Key features vscode-leetcode has that don't translate to Obsidian:**
- Code Lens (VS Code-specific inline buttons above code) → replaced by Obsidian command palette + toolbar buttons
- VS Code integrated terminal running Node CLI → not needed; we call LC APIs directly via fetch
- VS Code webview for problem description → replaced by native Markdown note rendering
- WSL path translation → irrelevant (no shell exec)

**Features Obsidian uniquely enables (no vscode-leetcode equivalent):**
- Note permanence: problem notes live in user's vault forever, not temp files
- YAML frontmatter as structured data (queryable via Dataview)
- Backlinks and graph view across all solved problems
- Tag cloud across entire problem set via Obsidian tag pane
- Offline reading from cached Markdown (vscode-leetcode re-fetches from LC)
- Inter-problem linking via `[[wikilinks]]`
- Technique stub notes creating a personal knowledge base

---

## MVP Definition

### Launch With (v1)

Minimum viable product — validates the core "solve → note" loop.

- [ ] **Authentication** — can't do anything without it; embedded login + cookie fallback
- [ ] **Problem browser** — find problems by number/title/difficulty/tag
- [ ] **Problem detail view** — read problem in a note (HTML→Markdown, cached offline)
- [ ] **Solved/attempted status** — reflected in list and frontmatter
- [ ] **Code editor (in note)** — starter code scaffold, language selection
- [ ] **Run code against sample cases** — verify before submit; custom test case input
- [ ] **Submit code** — the core action
- [ ] **Verdict display** — Accepted/WA/TLE/etc. with runtime + memory
- [ ] **Auto-append accepted solution to note** — captures the win
- [ ] **Auto-update frontmatter on accept** — solved_date, runtime, memory, language
- [ ] **LC tag import as Obsidian tags** — instant topic taxonomy
- [ ] **Auto-backlinks to technique notes** — core graph value
- [ ] **Offline-readable cached problem content** — problem description readable without internet
- [ ] **Settings UI** — login, default language, vault folder
- [ ] **Graceful error handling** — rate limits, expired session, LC downtime
- [ ] **README + screenshots** — required for community plugin submission

### Add After Validation (v1.x)

Features to add once core solving loop is confirmed working:

- [ ] **User-added personal tags** — `#revisit` etc.; low complexity, add after frontmatter schema is settled
- [ ] **Session management UI** — list/switch sessions; useful for power users with multiple LC accounts
- [ ] **Problem list sorting strategies** — sort by acceptance rate, ID, difficulty; trivial once list is built

### Future Consideration (v2+)

- [ ] **leetcode.cn support** — different auth + API surface; design abstraction layer in v1
- [ ] **Mobile support** — blocked on BrowserWindow; revisit with cookie-paste-only path
- [ ] **Spaced repetition** — full SR system (SM-2/FSRS); defer until graph/tags prove insufficient
- [ ] **AI auto-tagging** — requires LLM API; defer until core tagging is stable
- [ ] **Top-voted solution viewer** — nice-to-have; link to LC page suffices for v1

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Authentication | HIGH | MEDIUM | P1 |
| Problem Browser | HIGH | MEDIUM | P1 |
| Problem Detail View | HIGH | MEDIUM | P1 |
| Code Editor in Note | HIGH | MEDIUM | P1 |
| Run Code | HIGH | HIGH | P1 |
| Submit Code | HIGH | HIGH | P1 |
| Verdict Display | HIGH | LOW | P1 |
| One Note Per Problem | HIGH | LOW | P1 |
| LC Tag Import | HIGH | LOW | P1 |
| Auto-append Solution on Accept | HIGH | LOW | P1 |
| Auto-update Frontmatter on Accept | HIGH | LOW | P1 |
| Auto-backlinks to Technique Notes | HIGH | MEDIUM | P1 |
| Offline Caching | HIGH | LOW | P1 |
| Settings UI | MEDIUM | LOW | P1 |
| Error Handling | HIGH | LOW | P1 |
| Solved/Attempted Status | MEDIUM | LOW | P1 |
| User-added Personal Tags | MEDIUM | LOW | P2 |
| Session Management UI | LOW | LOW | P2 |
| Problem List Sorting | LOW | LOW | P2 |
| Dataview Compatibility | MEDIUM | LOW | P2 (schema design choice, no build cost) |
| Star / Favorite | LOW | MEDIUM | P3 |
| Top-Voted Solution Viewer | LOW | MEDIUM | P3 |
| leetcode.cn | MEDIUM | HIGH | P3 (v2) |
| Spaced Repetition | MEDIUM | HIGH | P3 (v2) |
| AI Tagging | LOW | HIGH | P3 (v2) |

---

## Complexity Breakdown (S/M/L/XL)

| Feature | Size | Rationale |
|---------|------|-----------|
| Authentication (BrowserWindow + cookie capture) | M | BrowserWindow in Electron is well-understood, but cookie interception + storage + refresh detection adds non-trivial state management |
| Session persistence + expiry detection | S | Store cookie in plugin data; detect 401/403 on any request |
| Problem browser / list | M | GraphQL fetch + pagination + filter UI (Obsidian modal) + status indicators |
| Problem detail view (HTML→Markdown) | M | HTML→Markdown conversion is the tricky part (LC's HTML is non-standard); rendering is just a note |
| Offline caching | S | Write description to note on fetch; that's the cache. Problem list needs a TTL-based JSON cache |
| Code editor in note | M | Starter code scaffold from LC GraphQL (`codeSnippets`), fenced code block insertion, language selector |
| Run code (interpret_solution + polling) | L | Two-step HTTP: POST to `/interpret_solution/`, poll `/check/` with backoff; parse multi-test-case result; custom test case input UI |
| Submit code (submit + polling) | L | Same polling pattern as run; parse verdict, runtime percentile, memory percentile, error messages |
| Verdict display | S | Modal or panel in Obsidian showing parsed result; no logic, just rendering |
| Solved/attempted status | S | Read from problem list GraphQL response; write to frontmatter |
| Auto-append accepted solution | S | Detect accepted verdict, extract code block from note, append new section. Obsidian vault API. |
| Auto-update frontmatter on accept | S | `app.vault.process()` to update YAML fields; well-understood pattern in Obsidian plugin ecosystem |
| LC tag import | S | `topicTags` already in GraphQL problem detail response; write to frontmatter |
| User-added personal tags | S | Separate frontmatter field; plugin never overwrites it |
| Auto-backlinks to technique notes | M | Map LC topic tags → readable technique names; create/update `## Techniques` section; stub note creation |
| Graph-friendly wikilinks | S | Falls out of auto-backlinks; `[[Two Pointers]]` syntax in note body |
| Dataview compatibility | S | Frontmatter schema design decision; zero runtime cost |
| Settings UI | S | Standard Obsidian `addSettingTab` with text/dropdown/toggle settings |
| Error handling (rate limits, downtime, expiry) | S | Try/catch + backoff strategy + user-facing notices in Obsidian notification system |
| README + community plugin submission | S | Documentation effort, not code |

**Size definitions:**
- S = 0.5–1 day
- M = 2–4 days
- L = 1–2 weeks (involves async polling, multiple states, edge cases)
- XL = 2+ weeks (not applicable to any v1 feature)

---

## Sources

- **vscode-leetcode** full README and `leetCodeExecutor.ts` source: https://github.com/LeetCode-OpenSource/vscode-leetcode
- **leetcode-cli** (the underlying CLI vscode-leetcode wraps): https://github.com/skygragon/leetcode-cli — confirmed REST endpoints: `/interpret_solution/`, `/submit/`, `/check/`
- **leetcode-query** library source (GraphQL read-only; no run/submit): https://github.com/jacoblincool/leetcode-query
- **fennr/obsidian_leetcode_template** (Russian-language Obsidian LC plugin with frontmatter schema + cookie auth): https://github.com/fennr/obsidian_leetcode_template
- **hanbyul-kim/obsidian-leetcode** (Obsidian LC importer — URL→note with frontmatter, Python template, Dataview examples): https://github.com/hanbyul-kim/obsidian-leetcode
- **luis-kueng/obsidian-leetcode** (daily problem → note): https://github.com/luis-kueng/obsidian-leetcode
- **alfa-leetcode-api** (read-only LC API, confirms GraphQL schema for problem list/detail): https://github.com/alfaarghya/alfa-leetcode-api
- **clearloop/leetcode-cli** data models (VerifyResult fields: status_code, status_msg, runtime_percentile, memory_percentile, compile errors): https://github.com/clearloop/leetcode-cli

---

*Feature research for: Obsidian LeetCode integration plugin*
*Researched: 2026-05-07*
