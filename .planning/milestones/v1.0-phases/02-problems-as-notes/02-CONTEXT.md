# Phase 2: Problems as Notes - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Opening a LeetCode problem from the Phase 1 Problem Browser creates a permanent, offline-readable vault note at `{folder}/{id}-{slug}.md`. The note has a locked `lc-*` frontmatter schema, a plugin-written `## Problem` body rendered from LC HTML via `turndown`, a `## Notes` heading reserved for the user, and a single `#lc/<difficulty>` tag. A per-problem detail cache (HTML, topic slugs, examples) is persisted in `data.json` keyed by slug. A `LeetCode.base` file is shipped in the problems folder so the user has a native Obsidian-sorted listing (the plugin's own sidebar remains the primary sorted surface). Re-opening an existing note is a background-refresh operation: reveal first, refetch only when cache > 7 days.

Covers 9 requirements: NOTE-01..09 with one scope adjustment — NOTE-04's **topic** tags are populated in Phase 4 on first Accepted submission; Phase 2 writes the **difficulty** tag only. (See D-05.)

Explicitly out of scope for Phase 2:
- Writing or polling run/submit endpoints (Phase 3 — SOLVE-*)
- Appending solution code or `[[Technique]]` backlinks on Accepted (Phase 4 — GRAPH-*)
- Settings UI polish beyond existing Phase 1 fields (Phase 5)
- Image / LaTeX handling quirks in turndown output (flagged as a deferred follow-up if surfaced during implementation)

</domain>

<decisions>
## Implementation Decisions

### Note Anatomy & Heading Order
- **D-01:** Phase 2 writes only two headings: `## Problem` (plugin-owned, turndown-rendered) and `## Notes` (empty, user-owned). Frontmatter sits above. **`## Solution` and `## Techniques` are NOT pre-created** — Phase 4 appends them on the first Accepted submission. This keeps unsolved notes visually clean and avoids user confusion about empty sections.
  ```
  ---
  <frontmatter>
  ---

  ## Problem
  <turndown output>

  ## Notes

  ```
- **D-02:** `## Problem` block is a **single flat block** from turndown — no sub-splitting into `### Description / ### Examples / ### Constraints`. LC's HTML structure is inconsistent across problems, and a flat block is robust to that. Planner/researcher must NOT attempt sub-parsing.

### Frontmatter Schema (Phase 2 scope)
- **D-03:** Frontmatter schema at first-open is minimal and identity-focused. `NoteTemplate.ts` is the single source of truth — no other module may hardcode `lc-*` field names or the tag namespace. Schema locked for v1 per ROADMAP success-criterion 5.
  ```yaml
  ---
  lc-id: 1
  lc-slug: two-sum
  lc-title: Two Sum
  lc-difficulty: Easy
  lc-url: https://leetcode.com/problems/two-sum/
  lc-status: untouched
  lc-language: python3
  aliases: [Two Sum, '1']
  tags: [lc/easy]
  ---
  ```
- **D-04:** Solve-time fields (`lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, and change of `lc-status` to `accepted`) are **written by Phase 4**, not pre-filled empty in Phase 2. Rationale: empty YAML keys pollute frontmatter and can confuse Bases / Dataview queries.
- **D-05:** **Scope adjustment to NOTE-04.** Topic tags (`lc/array`, `lc/hash-table`, etc.) are populated **in Phase 4 on first Accepted submission**, not at note-open time. Phase 2 writes the difficulty tag (`lc/easy` / `lc/medium` / `lc/hard`) only. Rationale: the vault shouldn't be polluted with topic tags for problems the user never solved — the knowledge graph should reflect earned knowledge. The transition phase doc for Phase 2 must flag this so REQUIREMENTS.md §NOTE-04 is re-mapped (NOTE-04 "Topic tags" → Phase 4; "Difficulty tag" stays Phase 2).
- **D-06:** `aliases` field contains `[<Title>, '<id>']` (two entries: human title + numeric id as a quoted string). Supports `[[Two Sum]]` and `[[1]]` linking. No `'0001'` padded alias — filename is unpadded, aliases follow suit.
- **D-07:** Tag form is **lowercase slug-form, frontmatter-only, single source**. Canonical shape: `lc/easy`, `lc/dynamic-programming`, `lc/hash-table`. No inline `#lc/...` in the body. No mirror. Obsidian's native tag pane reads frontmatter `tags[]` — that's the whole surface.

### User-Content Preservation (NOTE-05, NOTE-06)
- **D-08:** Ownership is **heading-based**, not sentinel-based. Plugin-owned regions:
  - `## Problem` body (Phase 2)
  - `## Solution` body (Phase 4)
  - `## Techniques` body (Phase 4)
  - Plugin-written frontmatter keys (`lc-*`, `aliases`) and the plugin's current-pass tag set
  User-owned regions: **everything else** — `## Notes`, any user-added headings, any frontmatter keys the plugin didn't write, and any tags in `tags[]` that aren't in the plugin's current-pass set.
- **D-09:** On regeneration, **missing `## Problem` heading → re-insert at top of body** (above `## Notes` if present, else at the first non-frontmatter line). A user-renamed `## Problem` (anything else) is treated as missing: the plugin re-inserts its own `## Problem` anchor at the top, and the user's renamed section is left untouched. Heuristic: "plugin owns its known anchor; the user owns everything else, including their own renames — but the plugin still writes its own anchor so regeneration never silently drops content."
- **D-10:** Frontmatter merge semantics via `fileManager.processFrontMatter()`:
  - `lc-*` keys: plugin-written, overwritten every pass
  - `aliases`: plugin writes its entries; user-added aliases preserved (union on regeneration)
  - `tags`: plugin writes its current-pass set (in Phase 2: just the difficulty tag); any tag already in `tags[]` that isn't in the current-pass set is preserved. Covers `#revisit`, `#tricky`, user's own `#lc/my-category`, and Phase 4's later-added topic tags (they survive subsequent Phase 2 re-opens).
  - User-added non-`lc-*` frontmatter keys: preserved untouched.

### Re-Open Behavior
- **D-11:** Row-click flow when note exists:
  1. Reveal the existing note immediately (no blocking fetch)
  2. Read cache for `{slug}` from `data.json` `problemDetails` table
  3. If cache `fetchedAt` < 7 days old → done
  4. Else → background fetch problem detail; on success, re-run the regenerator over the plugin-owned regions (see D-08/D-09); on failure (network, 5xx, session expiry) swallow silently and keep the cached content
- **D-12:** **Offline policy:** never `Notice` on a refresh failure. NOTE-07 promises offline readability; showing "you're offline" every time the user opens a note is noise. Log at debug level only. (A future explicit "Refresh problem from LeetCode" command in Phase 5 MAY surface errors to the user when they explicitly asked for a network operation — but Phase 2 keeps background-refresh silent.)
- **D-13:** Row-click flow when note does NOT exist:
  1. Fetch problem detail (cached if < 7d — i.e., user may have opened + later deleted the note)
  2. Write `{folder}/{id}-{slug}.md` with frontmatter + `## Problem` + `## Notes`
  3. Open the newly-created note in the main pane
  4. `## Problem` on-network-failure: show `Notice('Couldn\'t fetch Two Sum. Check your connection.')` (4s) and do NOT create a partial note. Failure state matches "user clicked but nothing happened" — recoverable.

### Detail Cache
- **D-14:** Per-problem detail cached in `data.json` under a new `problemDetails` map, keyed by slug. Schema:
  ```ts
  problemDetails: {
    [slug: string]: {
      fetchedAt: number;        // epoch ms
      id: number;               // for reverse-lookup safety
      title: string;
      difficulty: 'Easy' | 'Medium' | 'Hard';
      url: string;
      contentHtml: string;      // raw LC HTML — turndown re-runs cheap
      topicSlugs: string[];     // for Phase 4 to read
      exampleTestcases?: string;  // LC 'exampleTestcases' field — for Phase 3
      codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;  // for Phase 3 starter-code (SOLVE-02)
      // No user-progress fields here — those live elsewhere.
    }
  }
  ```
  TTL: 7 days. Expected size ~10–50 KB per entry; 500 solved problems ≈ 5–25 MB — within comfort. **Must NOT** pre-warm all 3,300 problems (explicit PROJECT.md §6 / CLAUDE.md §"Pre-warming full problem cache" guard).
- **D-15:** `SettingsStore` gets new getters/setters: `getProblemDetail(slug)`, `setProblemDetail(slug, detail)`, `pruneProblemDetails(maxAgeMs)` (last one is optional — runs on plugin load if `problemDetails` object is > some reasonable size, e.g. 1000 entries. Planner picks the threshold; honest-size budget check only.). Add shape-guards in `SettingsStore.load()` mirroring the existing `isValidProblemIndex` / `isValidCompoundFilter` patterns.

### Filename & Listing Surface
- **D-16:** Filename: `{id}-{slug}.md` with **no zero-padding**. Example: `1-two-sum.md`, `10-regular-expression-matching.md`, `100-same-tree.md`. Rationale: matches LC's URL convention, shorter. File Explorer's lexicographic sort (1, 10, 100, 2) is cosmetic and NOT the primary browsing surface.
- **D-17:** Primary sorted-browsing surfaces are:
  1. The Phase 1 Problem Browser sidebar (sorted by id, authoritative)
  2. A `LeetCode.base` Bases file shipped into the problems folder on first-use, sorted by `lc-id` descending (most-recently-added first)
- **D-18:** `LeetCode.base` creation rules:
  - Created if missing when the user first opens any problem in Phase 2 (not on plugin enable — lazy)
  - **Never overwritten** once it exists — user may customise views
  - If user deletes it, the plugin does NOT auto-recreate (same preservation discipline as technique notes in Phase 4)
  - Created via `vault.create()` only — never via `modify()`
- **D-19:** **Bump `manifest.json` `minAppVersion` to the version that introduced Bases.** Researcher must confirm exact version (believed to be Obsidian 1.9.x). Users on older Obsidian still get the plugin's sidebar — the hard Bases-file-shipping write becomes a soft-failure: if `minAppVersion` is enforced by Obsidian on install, users simply can't install on older versions, which is the intended policy. README gets a short note in Phase 5 Polish.

### Turndown Wiring
- **D-20:** `turndown` is wrapped in a `src/notes/htmlToMarkdown.ts` utility with LC-specific rules:
  - Preserve `<pre>` / `<code>` blocks as fenced code blocks
  - Preserve LaTeX-like sequences (`\(...\)`, `$...$`) by treating them as inline literal via a custom Turndown rule — **don't escape** math delimiters into MD-breaking form
  - Preserve `<img>` tags by emitting `![](<url>)` — no download, just link to LC's CDN (offline-degradable)
  - Strip LC-specific decorative wrappers that turndown would emit as empty divs
  - **Determinism gate:** calling the utility with identical HTML must produce byte-identical Markdown — needed for idempotent regeneration (otherwise every re-open creates a dirty diff in the note).
- **D-21:** If turndown produces unexpectedly empty or malformed output for a problem, **write what we got** + log a debug warning. Don't block the user. (Phase 5 Polish may revisit with targeted fixes — captured as deferred idea.)

### Atomic Writes
- **D-22:** All body writes for `## Problem` use `vault.process(file, (current) => mutated)`. All frontmatter writes use `app.fileManager.processFrontMatter(file, (fm) => mutate(fm))`. **`vault.modify()` is permanently forbidden** on problem notes (matches the STATE.md decision from Phase 4's pre-plan: "All vault writes via `vault.process()` + `processFrontMatter()` only"). Grep gate in Phase 2 execution:
  ```
  grep -rE "vault\.modify\s*\(" src/notes/ src/browse/ --include='*.ts'    # must be empty
  ```

### Claude's Discretion
- Exact internal module layout under `src/notes/` (planner may split `NoteTemplate.ts`, `NoteWriter.ts`, `htmlToMarkdown.ts`, `NoteReader.ts` however makes sense — keep the single-source-of-truth invariant for schema).
- Implementation of the "plugin-owned regions" regenerator — regex-based anchor matching, AST-based markdown walker, or a dedicated line-range tracker. Prefer minimal-new-dep.
- Decision between storing `topicSlugs` as `[string]` in `problemDetails` vs a richer `[{ slug, name }]`. Either is fine — planner should pick and stick with it.
- Exact `LeetCode.base` view definition (columns, filters). The lc-id-desc sort is required; other view details are at discretion.
- Exception-to-Notice mapping for D-13 (per-row network failure): the Notice copy `Couldn't fetch {title}. Check your connection.` is a suggested default; UI-SPEC.md (if generated for Phase 2) may refine.
- Threshold for the opportunistic `pruneProblemDetails` pass (D-15).
- Whether the row-click handler in `ProblemBrowserView` routes through `main.ts` (a `plugin.openProblem(slug)` method) or directly through a new `NoteOrchestrator` service. Either works; planner picks based on dependency cleanliness.

### Carried Forward from PROJECT.md / STATE.md / Phase 1 CONTEXT.md (not re-asked)
- **CF-01:** All LC calls through `requestUrl` via `api/throttle.ts → requestUrlFetcher → @leetnotion/leetcode-api`. No direct HTTP in `src/notes/`.
- **CF-02:** `isDesktopOnly: true` stays in `manifest.json`.
- **CF-03:** Session cookies only in `data.json`, never logged. New detail-cache fields (HTML, topicSlugs) are non-sensitive; still route through `SettingsStore` which owns `data.json`.
- **CF-04:** Session-expiry detection already wired in Phase 1 — if detail-fetch receives a session-expired response, the existing `Notice` + re-auth prompt flow fires. Phase 2 doesn't re-implement.
- **CF-05:** `eslint-plugin-obsidianmd` zero Required violations. No `innerHTML`, no raw `fetch`, no hotkeys on new commands, no plugin-id-in-command-id, sentence-case copy on any new UI strings.
- **CF-06:** No new Electron imports. Phase 2 is pure TypeScript + Obsidian API + turndown + the existing LC client.
- **CF-07:** Default problems folder is `LeetCode` (no trailing slash in storage). Default language is `python3`. Folder value must pass `SettingsStore.sanitizeFolder()` — path-traversal and absolute-path inputs are already rejected there.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specs
- `.planning/PROJECT.md` — Core value, constraints, Key Decisions (one-note-per-problem, Java/Python primary but all LC languages supported, knowledge-graph design)
- `.planning/REQUIREMENTS.md` §v1 — Problems as Notes block (NOTE-01..09); **note D-05 scope adjustment for NOTE-04** (topic tags move to Phase 4)
- `.planning/ROADMAP.md` §Phase 2 — Goal, success criteria (`{id}-{slug}.md`, `## Problem` via turndown, `lc/`-namespaced tags, NoteTemplate single source of truth, offline readable)
- `.planning/STATE.md` §Accumulated Context — Frontmatter/tag/filename schema lock + all-writes-via-process() rule
- `.planning/phases/01-plugin-foundation/01-CONTEXT.md` — Phase 1 locks: requestUrl adapter, throttle wiring, feature-first folder layout, default settings, SettingsStore data.json shape
- `.planning/phases/01-plugin-foundation/01-PATTERNS.md` — Shared Patterns 2 (requestUrl-only HTTP), 3 (DOM via createEl only), 4 (Notice copy locked)
- `.planning/phases/01-plugin-foundation/01-UI-SPEC.md` — Notice copy table, Copywriting contract, CSS conventions (applies to any new UI surfaces Phase 2 adds — Bases file header etc. if any)

### Tech stack (locked in CLAUDE.md)
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Technology Stack — `turndown` 7.2.4 (HTML→MD), `@leetnotion/leetcode-api` 3.0.0 (detail fetch), peer CM6 externals, TypeScript 5.8.3, vitest 4.1.5
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §5 Offline Cache — `data.json` via `loadData/saveData` for all persisted data, 7-day TTL pattern for problem content, never write hidden files under `.obsidian/plugins/`
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §6 Markdown Rendering — turndown direction (HTML→MD), `innerHTML` forbidden, `createEl()` for DOM
- `/Users/moxu/projects/obsidian-leetcode/CLAUDE.md` §Stack Patterns — `app.fileManager.processFrontMatter()` atomic write pattern, do NOT use `Vault.modify()` on active file

### Obsidian & LC docs (researcher must fetch and verify)
- `obsidianmd/obsidian-api` `obsidian.d.ts` — `Vault.create`, `Vault.process`, `TFile`, `FileManager.processFrontMatter` signatures + semantics (especially merge behavior on arrays)
- `obsidianmd/obsidian-developer-docs` — Vault API best practices (why `vault.process` > `vault.modify`), Frontmatter API
- `obsidianmd/obsidian-developer-docs` — **Bases introduction + minimum Obsidian version** (D-19 verification gate — researcher must return the exact `minAppVersion` to bump to)
- `obsidianmd/obsidian-developer-docs` — `.base` file format (YAML schema, view definitions, filters, sort spec)
- `@leetnotion/leetcode-api` source — `problem(slug)` / `getProblem(slug)` call shape, returned fields (content HTML, topicTags, exampleTestcases, codeSnippets, stats)
- `mixmark-io/turndown` README — custom rule API, how to override default handlers (pre/code/img), how to preserve literal strings (for LaTeX `\(...\)` preservation per D-20)

### What to avoid
- `innerHTML` with turndown input OR output — must pipe through `createEl()` only if rendering; but Phase 2 writes to files, not DOM, so this mostly applies to any modal/preview rendering
- `fetch()` / `axios` / `node-fetch` — CORS-blocked; use existing LeetCodeClient
- `vault.modify()` on problem notes — use `vault.process()` + `processFrontMatter()`
- Pre-fetching all 3,300 problem details — explicit PROJECT.md / CLAUDE.md guard
- Sentinel-based region markers (HTML comments in body as ownership markers) — rejected in D-08 in favor of heading-based ownership

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1, now shipped in `src/`)
- `src/api/LeetCodeClient.ts` — already authenticated, throttled, fetcher-injected. Phase 2 adds a detail-fetch wrapper method (e.g., `getProblem(slug)` returning the raw LC problem detail). Do NOT construct a second client.
- `src/settings/SettingsStore.ts` — Phase 2 extends `PluginData` with `problemDetails: { [slug]: DetailCacheEntry }`. Add getters/setters + a shape-guard (`isValidDetailCacheEntry`) mirroring the existing `isValidProblemIndex` / `isValidCompoundFilter` patterns. `DEFAULT_DATA` gets `problemDetails: {}`.
- `src/browse/ProblemBrowserView.ts` — the row-click handler is the Phase 2 entry point. Phase 1 stubbed it as `new Notice('Phase 1 stub: would open ${slug}.')`. Phase 2 replaces this with the orchestrator call.
- `src/browse/ProblemListService.ts` — still owns index refresh + search + filter. Phase 2 does NOT modify its behavior; `IndexedProblem.topics` (already populated at refresh time from `q.topicTags` in Phase 1) is the source for Phase 4's later tag population, not Phase 2.
- `src/settings/SettingsTab.ts` — already has "Problems folder" and "Default language" fields. Phase 2 does NOT add new settings controls. (Phase 5 Polish will.)
- `src/shared/logger.ts` — use for any debug/warn on refresh/turndown failures. Key redaction already wired; Phase 2 shouldn't log sensitive data anyway.

### Established Patterns (from Phase 1 — must carry forward)
- **Feature-first layout:** Phase 2 adds a new sibling folder `src/notes/`. Don't scatter note-related code across other folders. Expected files (planner discretion on exact split): `NoteTemplate.ts` (schema single source), `NoteWriter.ts` (orchestrates open/create/refresh), `htmlToMarkdown.ts` (turndown wrapper), `NoteReader.ts` or similar.
- **All LC calls through `LeetCodeClient`** — no direct `requestUrl`, no new fetcher.
- **DOM via `createEl()`** — Phase 2 has no new DOM surfaces by default (Bases file is YAML, not DOM), but if the planner proposes any UI (e.g., a "Refresh" button in the problem browser), the Shared Pattern 3 rule applies.
- **All vault writes via `vault.process()` / `processFrontMatter()`** — no `vault.modify()` on problem notes. Grep gate in Phase 2 execution.
- **Notice copy locked** — any new Notice strings Phase 2 introduces must follow sentence case + terminal period discipline from UI-SPEC.md. Candidate new Notices (reviewer to confirm):
  - `Couldn't fetch {title}. Check your connection.` (on detail-fetch failure, D-13)
  - `LeetCode problem not found: {slug}.` (on 404 from LC — corner case)
  - No Notice for silent offline re-open (D-12)

### Integration Points
- `ProblemBrowserView.onRowClick(slug)` → calls a new `NoteOrchestrator.openProblem(slug)` (or `plugin.openProblem(slug)` — planner discretion per Claude's Discretion above). The orchestrator handles: file-exists check, fetch-if-cold, write-if-new, reveal, conditional background-refresh.
- `main.ts` `onload()` — if the orchestrator is a service, it needs registering after `ProblemListService` (step 5 in the locked ordering). If it's a plugin method, just a method on `LeetCodePlugin`. Either way: order remains settings → fetcher → client → auth → list → notes → views.
- `SettingsStore.load()` — extend validation path for the new `problemDetails` field; malformed entries dropped silently with a warn (same policy as other fields).
- `manifest.json` — **`minAppVersion` bump** is a plan-level task (D-19). Researcher confirms target version; planner adds the bump to Plan 01 (or wherever manifest changes live).

</code_context>

<specifics>
## Specific Ideas

- The vscode-leetcode plugin writes `description.md` + a separate solution file per problem. That's explicitly rejected here — one-note-per-problem is the PROJECT.md decision, and the note is the vault citizen (not an auxiliary `description.md`).
- Author's dogfooding perspective: the most-hit flow once Phase 2 is live is "open a problem I've solved before to skim my ## Notes." That flow must feel instant. Hence D-11 (reveal first, refresh later, background-only) and D-12 (silent offline). If re-opening a solved problem feels slow or noisy, the phase fails its unwritten spirit-test.
- `LeetCode.base` is nice-to-have, not core. If researcher discovers Bases minAppVersion is too high to be acceptable (e.g., bleeding-edge-only), the fallback is: drop the Bases file and rely on the sidebar alone. Planner should flag this as a decision point rather than silently picking.
- Turndown's LaTeX handling (D-20) is where unexpected pain is most likely. Researcher should look at community turndown-plus-LaTeX recipes (there are several, e.g., `turndown-plugin-gfm` for tables, plus a custom `\(...\)` rule). If the existing solutions require a new dep, flag it — CLAUDE.md prefers minimal-new-dep.

</specifics>

<deferred>
## Deferred Ideas

Captured during Phase 2 discussion, redirected away from Phase 2 scope:

- **"Has a note" indicator in the Problem Browser row** — lightweight icon or font-weight change showing which problems already have vault notes. Not in Phase 2 scope (requires reading the vault filesystem on every render, small new surface). Candidate for Phase 5 Polish or a small standalone phase.
- **"Force refresh from LeetCode" command** — explicit command-palette entry to force re-fetch a problem's detail + regenerate its note, bypassing the 7-day cache. Candidate for Phase 5 Polish; Phase 2 keeps auto-background-refresh silent.
- **User-visible refresh-failure indicator** — inline chip in the note view showing "Offline — cached X days ago." Rejected in D-12 in favor of silent policy. Candidate for Phase 5 Polish if the silent default feels too silent in practice.
- **Image download / vault-local caching** — Phase 2 keeps LC image URLs as-is (D-20). If a problem has images and the user goes offline, they see broken images. Deferred; offline-problem-with-images is a narrow case.
- **Turndown output fine-tuning for specific problem types** — LC problems with tables, nested code blocks, diagram SVGs, etc. Baseline turndown handles most cases; edge cases that produce ugly Markdown deferred to Phase 5 Polish (targeted custom rules per observed failure). Captured as a known risk, not a blocker.
- **Pruning the `problemDetails` cache proactively** — D-15 mentions an opportunistic prune; actual size-based prune policy is Claude's Discretion. If it becomes a real issue (user with 3,300 opened), a Phase 5 cache-management surface could expose it in settings.

Standing deferrals (already in PROJECT.md / REQUIREMENTS.md):
- Solve / submit endpoints → Phase 3
- Accepted-submission code append + `[[Technique]]` backlinks → Phase 4
- Settings UI completeness, error-copy polish, README + community plugin PR → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI enhancements → v2

</deferred>

---

*Phase: 2-problems-as-notes*
*Context gathered: 2026-05-07*
