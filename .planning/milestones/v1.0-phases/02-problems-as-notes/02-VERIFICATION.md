---
phase: 02-problems-as-notes
verified: 2026-05-08T11:10:00Z
re_verified: 2026-05-13T23:55:00Z
status: passed
score: 5/5 must-haves verified (UAT human_verification confirmed via 02-UAT.md status: resolved — 6 passed, 3 issues addressed in subsequent phases, 1 skipped)
overrides_applied: 0
human_verification:
  - test: "End-to-end first-open creates note"
    expected: "Install plugin in dev vault, log in, click a problem row — LeetCode/1-two-sum.md is created with full frontmatter (lc-id, lc-slug, lc-title, lc-difficulty, lc-url, lc-status: untouched, lc-language), ## Problem body from turndown, and ## Notes heading."
    why_human: "Requires a real Vault + Obsidian metadata-cache + live processFrontMatter — not exercisable in vitest without a running Obsidian instance."
  - test: "Re-open reveals instantly (no spinner)"
    expected: "Clicking the same problem row a second time reveals the existing note in < 100 ms with no loading indicator."
    why_human: "Timing/UX observation only possible in a running Obsidian instance."
  - test: "User ## Notes content preserved across re-open"
    expected: "Type content under ## Notes, close the note, re-open via the browser — typed text is still present."
    why_human: "Requires a real edit cycle in the running vault."
  - test: "Manual #revisit tag preserved (D-10)"
    expected: "Add 'revisit' to the tags frontmatter in Obsidian's UI, close, re-open the problem — 'revisit' tag still present alongside lc/easy."
    why_human: "Requires a real vault frontmatter round-trip through Obsidian's YAML parser."
  - test: "LeetCode.base renders as sortable Bases view (D-17, D-18, D-19)"
    expected: "After first problem open, LeetCode/LeetCode.base appears in File Explorer and opens as a Bases table view sorted by lc-id descending."
    why_human: "Bases rendering is Obsidian-client-side; requires minAppVersion 1.10.0 and a real vault."
  - test: "Offline previously-opened problem reveals silently (NOTE-07, D-12)"
    expected: "Disable network. Click a cached problem. Note reveals instantly, zero Notice appears."
    why_human: "Requires real network toggle + running Obsidian."
  - test: "Offline never-opened problem shows error Notice (D-13)"
    expected: "Disable network. Click a fresh (not-yet-cached) problem. Notice 'Couldn't fetch …. Check your connection.' appears, no file is created."
    why_human: "Requires real network failure path in Obsidian's requestUrl."
  - test: "Session-expired detection still fires on note open (CF-04)"
    expected: "Clear LC session cookie. Click a problem. The existing Phase 1 session-expired Notice fires; no partial file is created."
    why_human: "Requires a real expired-cookie state; mock cannot fully replicate Obsidian's requestUrl CORS behavior."
  - test: "minAppVersion blocks install on Obsidian < 1.10 (D-19)"
    expected: "Attempting to install on Obsidian 1.9.x refuses with a version-too-old message."
    why_human: "Requires an older Obsidian build; cannot verify without the binary."
---

# Phase 2: Problems as Notes — Verification Report

**Phase Goal:** Opening a problem creates a permanent, offline-readable vault note with a locked frontmatter schema, `lc/`-namespaced tags, and user-authored content that survives plugin-triggered updates

**Verified:** 2026-05-08T11:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP.md Phase 2 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Selecting a problem creates `{folder}/{id}-{slug}.md` with fully populated `lc-` prefixed frontmatter written via `processFrontMatter()` | VERIFIED | `NoteWriter.openProblem` calls `vault.create` then `applyFrontmatter` (which uses `processFrontMatter`). `buildNoteFilename` returns `{id}-{slug}.md` (D-16, unpadded). 105/105 tests pass including `note-writer-folder`, `note-path-uses-settings`, `note-frontmatter-write` (7 lc-* keys confirmed). |
| SC-2 | Problem statement rendered as Markdown under `## Problem` using `turndown` — no `innerHTML` anywhere | VERIFIED | `htmlToMarkdown.ts` wraps TurndownService with `codeBlockStyle: 'fenced'`, custom `lc-image` rule, disabled escape pass. No `innerHTML` in any `src/notes/` file (grep exits 1 = no matches). `buildNoteBody` produces `## Problem\n…\n\n## Notes\n\n`. |
| SC-3 | Difficulty tag `lc/easy|medium|hard` on every note; user-added tags preserved across regeneration | VERIFIED | `buildFrontmatterInput` computes `pluginTags: [lc/{difficulty.toLowerCase()}]` (D-05, no topic tags). `applyFrontmatter` union-merges `tags` inside `processFrontMatter` callback (D-10). Tests `note-frontmatter-tags` (3 passing) and `note-frontmatter-preserve-user-tags` (2 passing) confirm both behaviors. |
| SC-4 | Previously-fetched notes load and display full content without any network access | VERIFIED | `NoteWriter.openProblem` checks `cached` and `existingFile`: if both present and cache is fresh (< 7 days), it calls `openLinkText` immediately without calling `getProblemDetail`. Test `offline-regenerate` passes (client throws on network, test confirms no call made). `CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000` exported and confirmed by `cache-ttl` test. |
| SC-5 | Frontmatter field names, filename scheme, and tag namespace defined once in `NoteTemplate.ts` only | VERIFIED | `grep -rE '"lc-id"\|"lc-slug"\|...' src/ --include='*.ts' | grep -v NoteTemplate.ts` → empty output. `grep -rn "'lc/" src/ --include='*.ts' | grep -v NoteTemplate.ts` → empty output. `PLUGIN_LC_KEYS`, `LC_TAG_PREFIX`, `buildNoteFilename` all defined exclusively in `src/notes/NoteTemplate.ts`. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/notes/NoteTemplate.ts` | Schema SSoT — lc-* keys, lc/ namespace, filename, applyFrontmatter | VERIFIED | Exports `PLUGIN_LC_KEYS`, `LC_TAG_PREFIX`, `NoteTemplateInput`, `buildNoteFilename`, `buildNotePath`, `buildNoteBody`, `buildFrontmatterInput`, `applyFrontmatter`. 153 lines. |
| `src/notes/htmlToMarkdown.ts` | turndown wrapper with fenced-code, img-preserve, deterministic | VERIFIED | Module-scoped singleton, `codeBlockStyle: 'fenced'`, `service.escape = (t) => t`, `keep(['sub','sup','kbd','var'])`, `addRule('lc-image', …)`. 87 lines. |
| `src/notes/HeadingRegion.ts` | Pure `rewriteProblemSection` — preserves `## Notes`, user sections | VERIFIED | Zero imports (pure string module), exports `PROBLEM_HEADING_LINE` and `rewriteProblemSection`. 106 lines. |
| `src/notes/NoteWriter.ts` | Row-click orchestrator — reveal-first, TTL, silent-offline, Notice-abort | VERIFIED | Exports `CACHE_TTL_MS`, `NoteWriter`, structural interfaces. 247 lines. Duck-type `isFileLike` check for mock compatibility. |
| `src/notes/BaseFile.ts` | Lazy LeetCode.base ship + never-overwrite (D-17, D-18) | VERIFIED | Exports `leetcodeBaseYaml` (YAML with `direction: DESC`) and `ensureLeetcodeBase` (checks existence before `vault.create`). 89 lines. |
| `src/notes/types.ts` | Re-export of `DetailCacheEntry` from SettingsStore | VERIFIED | Single line: `export type { DetailCacheEntry } from '../settings/SettingsStore'`. Plan 02 inline interface replaced by re-export in Plan 04. |
| `src/api/LeetCodeClient.ts` | `getProblemDetail(slug)` + `LeetCodeProblemDetail` interface | VERIFIED | Method at line 106, re-throws on network error (D-13 contract). `LeetCodeProblemDetail` interface exported at line 15. No import loop (`src/api/` does not import from `src/notes/`). |
| `src/settings/SettingsStore.ts` | `DetailCacheEntry` + `problemDetails` in `PluginData` + 3 new methods | VERIFIED | `DetailCacheEntry` exported (line 16), `problemDetails: {}` in `DEFAULT_DATA`, `sanitizeProblemDetails` + `isValidDetailCacheEntry` guards, `getProblemDetail`/`setProblemDetail`/`pruneProblemDetails` methods (lines 286–309). |
| `src/main.ts` | `notes!: NoteWriter` field + Step 5.5 + `openProblem(slug)` | VERIFIED | `notes!: NoteWriter` (line 26), constructed at line 57 between `ProblemListService` and view registration. `async openProblem(slug)` at line 96 delegates to `this.notes.openProblem(slug)`. |
| `src/browse/ProblemBrowserView.ts` | Phase 1 stubs replaced with `plugin.openProblem` | VERIFIED | `grep -c "Phase 1 stub" src/browse/ProblemBrowserView.ts` → 0. `grep -c "this.plugin.openProblem" src/browse/ProblemBrowserView.ts` → 2 (row-click at line 549, pickRandom at line 425). |
| `manifest.json` | `minAppVersion: "1.10.0"`, `isDesktopOnly: true` | VERIFIED | Line 5: `"minAppVersion": "1.10.0"`. Line 9: `"isDesktopOnly": true`. |
| `scripts/grep-no-vault-modify.sh` | D-22 grep gate — exits 0, exits 1 on violation | VERIFIED | Script present, executable, exits 0 with "OK: no vault.modify() calls in src/notes/ or src/browse/". |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `NoteWriter.ts` | `NoteTemplate.ts` | `import { applyFrontmatter, buildFrontmatterInput, buildNoteBody, buildNotePath }` | WIRED | All four NoteTemplate exports imported and called in `openProblem`. |
| `NoteWriter.ts` | `HeadingRegion.ts` | `rewriteProblemSection(current, freshMarkdown)` inside `vault.process` | WIRED | Used in `backgroundRefresh` at line 221. |
| `NoteWriter.ts` | `htmlToMarkdown.ts` | `htmlToMarkdown(entry.contentHtml)` | WIRED | Called at line 170 (new-note path) and line 219 (background refresh). |
| `NoteWriter.ts` | `BaseFile.ts` | `ensureLeetcodeBase(this.app, folder)` | WIRED | Called in both the re-open path (line 117) and the new-note path (line 200). |
| `NoteWriter.ts` | `LeetCodeClient.ts` | `isSessionExpired(err)` import | WIRED | Imported at line 29, used at line 141 in the catch block. |
| `NoteWriter.ts` | `shared/logger.ts` | `logger.debug(...)` for D-12 silent-offline | WIRED | `logger.debug` called for `backgroundRefresh` failure (line 126) and `ensureLeetcodeBase` failure (lines 118, 201). |
| `NoteTemplate.ts` | `app.fileManager.processFrontMatter` | `await app.fileManager.processFrontMatter(file, (fm) => { ... })` | WIRED | Line 119 in `applyFrontmatter`. All tag/alias union logic inside callback. |
| `htmlToMarkdown.ts` | `turndown` library | `import TurndownService from 'turndown'` | WIRED | Line 24. Module-scoped singleton. |
| `src/main.ts` | `NoteWriter.ts` | `new NoteWriter(this.app, this.client, this.settings)` | WIRED | Line 57 in `onload()`. |
| `ProblemBrowserView.ts` | `LeetCodePlugin.openProblem` | `void this.plugin.openProblem(p.slug)` | WIRED | Two call sites: row-click (line 549) and pickRandom (line 425). |
| `LeetCodePlugin.openProblem` | `NoteWriter.openProblem` | `return this.notes.openProblem(slug)` | WIRED | Line 97 in `src/main.ts`. |
| `src/notes/types.ts` | `SettingsStore.DetailCacheEntry` | `export type { DetailCacheEntry } from '../settings/SettingsStore'` | WIRED | Types.ts is a single-line re-export; inline Plan 02 interface removed. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `NoteWriter.openProblem` | `detail` (problem HTML + metadata) | `this.client.getProblemDetail(slug)` → `@leetnotion/leetcode-api` `lc.problem(slug)` | Yes — calls real GraphQL API; caches result in `SettingsStore.setProblemDetail` | FLOWING |
| `applyFrontmatter` | frontmatter fields | `NoteTemplateInput` built from `DetailCacheEntry` via `buildFrontmatterInput` | Yes — all 7 lc-* fields + difficulty-derived tag populated from LC response | FLOWING |
| `htmlToMarkdown` | `problemMarkdown` | `newEntry.contentHtml` from LC API response `q.content` | Yes — LC's real HTML passed through TurndownService | FLOWING |
| `NoteWriter.backgroundRefresh` | updated `contentHtml` | `client.getProblemDetail(slug)` on stale cache (> 7 days) | Yes — re-fetches from LC; `vault.process` + `applyFrontmatter` update the note | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 105 tests pass | `npm test` | "Test Files 30 passed (30) / Tests 105 passed (105)" | PASS |
| Build succeeds | `npm run build` | Exit 0, no TS errors | PASS |
| D-22 grep gate | `./scripts/grep-no-vault-modify.sh` | "OK: no vault.modify() calls in src/notes/ or src/browse/" (exit 0) | PASS |
| Phase 1 stubs gone | `grep -c "Phase 1 stub" src/browse/ProblemBrowserView.ts` | 0 | PASS |
| Metadata-cache-race guard present | `grep -c "Metadata-cache-race guard" src/notes/NoteWriter.ts` | 1 | PASS |
| D-03 SSoT: no lc-* keys outside NoteTemplate.ts | grep over src/ excluding NoteTemplate.ts | Empty output | PASS |
| D-03 SSoT: no lc/ namespace outside NoteTemplate.ts | grep over src/ excluding NoteTemplate.ts | Empty output | PASS |
| D-22: no vault.modify in src/notes/ or src/browse/ | grep direct | Exit 1 (no matches = clean) | PASS |
| plugin.openProblem wired exactly twice in ProblemBrowserView | `grep -c "this.plugin.openProblem" src/browse/ProblemBrowserView.ts` | 2 | PASS |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| NOTE-01 | `{folder}/{id}-{slug}.md` unpadded filename | SATISFIED | `buildNoteFilename(id, slug)` → `{id}-{slug}.md`. Folder autocreated via `vault.createFolder`. `note-filename` (3) + `note-writer-folder` (1) tests pass. |
| NOTE-02 | HTML → Markdown via `turndown`, no `innerHTML` | SATISFIED | `htmlToMarkdown.ts` with `TurndownService`, no `innerHTML`. `htmlToMarkdown` (4) + determinism (2) + snapshots (3) tests pass. |
| NOTE-03 | Frontmatter via `processFrontMatter` with 7 `lc-*` fields | SATISFIED | `applyFrontmatter` uses `app.fileManager.processFrontMatter`. All 7 keys confirmed by `note-frontmatter-write` (2) tests passing. |
| NOTE-04 | Difficulty tag `lc/easy|medium|hard` (Phase 2 scope only) | SATISFIED | D-05: `pluginTags: [lc/{difficulty.toLowerCase()}]` — no topic tags. `note-frontmatter-tags` (3) tests pass; Phase 4 deferred tags confirmed absent. |
| NOTE-05 | User-added tags preserved across regeneration | SATISFIED | `applyFrontmatter` union-merges tags: `Set([...priorTags, ...input.pluginTags])`. `note-frontmatter-preserve-user-tags` (2) + `note-frontmatter-preserve-user-aliases` (2) tests pass. |
| NOTE-06 | `## Notes` user content preserved across plugin updates | SATISFIED | `rewriteProblemSection` only replaces the `## Problem` region (heading-based ownership, D-08). `heading-region` (3) + `heading-region-rename` (1) + `heading-region-reinsert` (2) tests pass. |
| NOTE-07 | Previously-fetched notes readable offline | SATISFIED | `NoteWriter` reveals from `SettingsStore` cache without network when cache is fresh. `offline-regenerate` (1) + `re-open-silent-offline` (1) + `cache-ttl` (3) tests pass. |
| NOTE-08 | Configurable vault folder from settings | SATISFIED | `buildNotePath(this.settings.getProblemsFolder(), ...)` used in `openProblem`. `note-path-uses-settings` (1) test passes. |
| NOTE-09 | Configurable default language from settings | SATISFIED | `buildFrontmatterInput(newEntry, this.settings.getDefaultLanguage())` — `lc-language` from settings. `note-language-uses-settings` (1) test passes. |

---

### Decision Compliance Summary

| Decision | Description | Compliant | Evidence |
|----------|-------------|-----------|---------|
| D-01 | Only `## Problem` + `## Notes` at first write; no `## Solution`/`## Techniques` | YES | `buildNoteBody` produces exactly those two headings. |
| D-03 | `NoteTemplate.ts` is single source for `lc-*` keys + `lc/` namespace | YES | Both grep checks return empty (no matches outside NoteTemplate.ts). |
| D-04 | `lc-status` never downgraded from non-`untouched` value | YES | Condition: `typeof fm['lc-status'] !== 'string' \|\| fm['lc-status'] === '' \|\| fm['lc-status'] === 'untouched'` — `'accepted'` fails all three branches, is preserved. Test confirms. |
| D-05 | Phase 2 writes difficulty tag only; no topic tags | YES | `pluginTags: [lc/{difficulty.toLowerCase()}]` — `topicSlugs` from cache not used in Phase 2 tag output. |
| D-06 | `aliases: [title, String(id)]` unpadded | YES | `pluginAliases = [input.title, String(input.id)]` in `applyFrontmatter`. Test confirms string not number. |
| D-07 | Tags lowercase slug-form, frontmatter-only | YES | `difficulty.toLowerCase()` in `buildFrontmatterInput`. No inline `#lc/` in body. |
| D-08 | Heading-based ownership: plugin owns `## Problem` body | YES | `rewriteProblemSection` targets `## Problem` region bounded by next H2. |
| D-09 | Missing/renamed `## Problem` → re-insert at top | YES | If `problemStart === -1`, inserts above first `## ` heading. Tests confirm. |
| D-10 | `applyFrontmatter` union-merges `tags` and `aliases` inside callback | YES | Both merge with `new Set([...prior, ...plugin])` inside the `processFrontMatter` callback. |
| D-11 | Reveal-first, 7-day TTL, background refresh | YES | `openLinkText` called before any network; `CACHE_TTL_MS` check gates `backgroundRefresh`. |
| D-12 | Silent offline background refresh — no Notice | YES | `backgroundRefresh` failure caught with `logger.debug` only, no `new Notice`. |
| D-13 | New-note fetch failure → Notice + abort, no partial file | YES | `catch` block fires Notice before any `vault.create`; `vault.create` only called after successful `detail` retrieval. |
| D-16 | Unpadded `{id}-{slug}.md` filename | YES | `buildNoteFilename` returns `\`${id}-${slug}.md\`` — no zero-padding. |
| D-17 | `LeetCode.base` sorted by `lc-id` DESC | YES | `leetcodeBaseYaml` YAML contains `property: lc-id` + `direction: DESC`. |
| D-18 | `LeetCode.base` created via `vault.create` only, never overwritten | YES | `ensureLeetcodeBase` checks `getAbstractFileByPath(path)` and returns if exists. `vault.modify` absent. `base-file-preserve` test passes. |
| D-19 | `manifest.json` `minAppVersion` ≥ `1.10.0` | YES | `"minAppVersion": "1.10.0"`. `manifest-version` test (2) passes. |
| D-20 | `htmlToMarkdown` deterministic singleton | YES | Module-scoped `cachedService` variable. `htmlToMarkdown-determinism` test (2) confirms 100-run byte-identical output. |
| D-22 | No `vault.modify(` in `src/notes/` or `src/browse/` | YES | `./scripts/grep-no-vault-modify.sh` exits 0. Direct grep exits 1 (no matches). |
| BLOCKER-3 | `NoteWriter` has metadata-cache-race guard comment + tick-await + retry | YES | `grep -c "Metadata-cache-race guard" src/notes/NoteWriter.ts` → 1. `await new Promise((resolve) => setTimeout(resolve, 0))` + try/catch + 50ms retry present. |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TODO/FIXME/placeholder comments, no empty return stubs, no `vault.modify` calls, no `innerHTML` usage, no `fetch`/`axios`/`node-fetch` in `src/notes/` found.

---

### Human Verification Required

The following 9 behaviors require a live Obsidian instance to verify. All automated checks (105 tests, build, lint-gated grep scripts) pass.

**1. End-to-end first-open creates note**

**Test:** Install plugin in dev vault, authenticate, click problem "Two Sum" in the browser.
**Expected:** `LeetCode/1-two-sum.md` created with all 7 `lc-*` frontmatter keys, `tags: [lc/easy]`, `aliases: [Two Sum, '1']`, `## Problem` block with problem statement, `## Notes` heading.
**Why human:** Requires real `Vault` + Obsidian metadata-cache + live `processFrontMatter`.

**2. Re-open reveals instantly**

**Test:** Click the same problem row a second time.
**Expected:** Existing note reveals in < 100 ms with no loading indicator.
**Why human:** Timing is only observable in a running Obsidian UI.

**3. User `## Notes` content preserved across re-open**

**Test:** Type text under `## Notes`, close the note, re-open via the browser.
**Expected:** Typed text is present; `## Problem` body may have refreshed (if cache was stale) but `## Notes` is untouched.
**Why human:** Requires a real edit cycle in the running vault.

**4. Manual `#revisit` tag preserved (D-10)**

**Test:** Add `revisit` to `tags` frontmatter in Obsidian UI, close, re-open.
**Expected:** `revisit` tag still present alongside `lc/easy`.
**Why human:** Requires real vault frontmatter round-trip through Obsidian's YAML parser.

**5. `LeetCode.base` renders as sortable Bases view (D-17, D-18, D-19)**

**Test:** After first problem open, open `LeetCode/LeetCode.base` in File Explorer.
**Expected:** A Bases table view shows problem list columns sorted by `lc-id` descending.
**Why human:** Bases rendering is client-side only; requires Obsidian ≥ 1.10.0.

**6. Offline previously-opened problem reveals silently (NOTE-07, D-12)**

**Test:** Disable network. Click a previously-opened (cached) problem.
**Expected:** Note reveals instantly. Zero Notice appears.
**Why human:** Requires real network toggle + running Obsidian.

**7. Offline never-opened problem shows error Notice (D-13)**

**Test:** Disable network. Click a fresh (uncached) problem.
**Expected:** Notice "Couldn't fetch {slug}. Check your connection." appears. No file is created.
**Why human:** Requires real network failure path in Obsidian's `requestUrl`.

**8. Session-expired detection still fires on note open (CF-04)**

**Test:** Clear the LC session cookie. Click a problem.
**Expected:** The Phase 1 session-expired Notice fires. No partial file is created.
**Why human:** Requires a real expired-cookie state.

**9. minAppVersion blocks install on Obsidian < 1.10 (D-19)**

**Test:** Attempt to install on Obsidian 1.9.x.
**Expected:** Install refused with version-too-old message.
**Why human:** Requires an older Obsidian build.

---

## Automated Proof Summary

All automated gates green:

| Gate | Result |
|------|--------|
| `npm test` | 30 test files, 105 tests — all PASS |
| `npm run build` | Exit 0 (TypeScript + esbuild) |
| `./scripts/grep-no-vault-modify.sh` | Exit 0 — "OK: no vault.modify() calls" |
| D-03 lc-* SSoT | No lc-* key literals outside NoteTemplate.ts |
| D-03 lc/ namespace SSoT | No `'lc/` literals outside NoteTemplate.ts |
| Phase 1 stubs removed | `grep -c "Phase 1 stub" src/browse/ProblemBrowserView.ts` = 0 |
| BLOCKER-3 race guard | `grep -c "Metadata-cache-race guard" src/notes/NoteWriter.ts` = 1 |
| D-19 minAppVersion | `manifest.json` → `"1.10.0"` |
| D-22 vault.modify absent | `grep vault.modify src/notes/ src/browse/` → exit 1 (no matches) |

---

_Verified: 2026-05-08T11:10:00Z_
_Verifier: Claude (gsd-verifier)_
