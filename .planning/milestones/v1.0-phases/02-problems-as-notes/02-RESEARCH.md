# Phase 2: Problems as Notes - Research

**Researched:** 2026-05-07
**Domain:** Obsidian vault writes, HTML→Markdown conversion, LC problem-detail GraphQL, heading-based region regeneration, Bases file format
**Confidence:** HIGH on the gating decisions (D-10 `processFrontMatter` semantics, D-19 Bases `minAppVersion`, D-22 `vault.process` semantics, D-20 turndown code-block handling, CLAUDE.md-listed library versions). MEDIUM on the wire-format of the `.base` YAML file content (schema shape is HIGH from installed types; end-to-end "exact bytes Obsidian will parse" is MEDIUM because docs.obsidian.md/help/bases subpages returned empty/403 via WebFetch). LOW on zero items — no finding relies solely on training data.

## Summary

Phase 2 is "open a problem → write a note, and keep writing it idempotently while preserving user content." The core machinery is three Obsidian APIs — `Vault.create`, `Vault.process`, `FileManager.processFrontMatter` — plus one external library — `turndown@7.2.4` — plus one existing service — `LeetCodeClient.lc.problem(slug)` which is already wired in Phase 1. Every locked CONTEXT.md decision can be implemented on top of these without adding a new dependency or a new HTTP path.

The two gating questions asked by the orchestrator both have confident answers from the installed TypeScript definitions: **Bases was introduced in Obsidian 1.10.0 (verified via `@since 1.10.0` on every `BasesConfigFile*` type in `obsidian@1.12.3`'s `obsidian.d.ts`)**, and **`FileManager.processFrontMatter` passes a plain mutable JS object whose arrays are user-writable JS arrays — it does not auto-union, auto-dedupe, or preserve untouched keys; the plugin's mutator callback is the single source of truth for the post-write frontmatter**. This means D-10's union semantics for `tags`/`aliases` must be implemented *inside* the callback (read existing, compute union, assign). Nothing in the Obsidian API will do it for us.

`turndown`'s built-in `fencedCodeBlock` rule already extracts `language-X` from `<pre><code class="language-X">` — no custom rule needed for the happy path of D-20 `<pre>`/`<code>` handling. What D-20 actually needs is: (a) enabling `codeBlockStyle: 'fenced'` (the default is `'indented'` — will silently produce wrong output), (b) a custom rule for LaTeX `\(…\)` / `$…$` preservation because turndown's escape pass will mangle `\(`, and (c) a custom handler for `<img>` to emit `![](url)` rather than empty output. No new dependency needed.

**Primary recommendation:** Create `src/notes/` with four files (`NoteTemplate.ts` = schema SSoT, `htmlToMarkdown.ts` = turndown wrapper, `NoteWriter.ts` = create+regenerate orchestrator, `BaseFile.ts` = Bases skeleton writer). Ship `minAppVersion: "1.10.0"` in `manifest.json` for Bases availability. Implement user-content preservation via a `HeadingRegion` helper that finds `## Problem` by regex on a markdown line scan (no AST library needed — LC content is flat, D-02), rewrites that region only, and falls through to a single-pass append for a missing heading (D-09 reinsert rule). Implement frontmatter union inside the `processFrontMatter` callback — read `fm.tags` / `fm.aliases`, compute union with plugin-pass values, assign back. Cache `LeetCode.base` creation behind an "if-not-exists" guard (D-18 never-overwrite).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Note Anatomy & Heading Order**
- **D-01:** Phase 2 writes only two headings: `## Problem` (plugin-owned, turndown-rendered) and `## Notes` (empty, user-owned). Frontmatter sits above. `## Solution` and `## Techniques` are NOT pre-created — Phase 4 appends them on the first Accepted submission.
- **D-02:** `## Problem` block is a single flat block from turndown — no sub-splitting into `### Description / ### Examples / ### Constraints`. Planner/researcher must NOT attempt sub-parsing.

**Frontmatter Schema**
- **D-03:** Frontmatter schema at first-open is minimal and identity-focused. `NoteTemplate.ts` is the single source of truth — no other module may hardcode `lc-*` field names or the tag namespace. Schema locked for v1.

  ```yaml
  lc-id: 1
  lc-slug: two-sum
  lc-title: Two Sum
  lc-difficulty: Easy
  lc-url: https://leetcode.com/problems/two-sum/
  lc-status: untouched
  lc-language: python3
  aliases: [Two Sum, '1']
  tags: [lc/easy]
  ```

- **D-04:** Solve-time fields (`lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, and change of `lc-status` to `accepted`) are written by Phase 4, not pre-filled empty in Phase 2.
- **D-05:** Scope adjustment to NOTE-04. Topic tags populated in Phase 4 on first Accepted submission. Phase 2 writes the difficulty tag (`lc/easy` / `lc/medium` / `lc/hard`) only.
- **D-06:** `aliases` field contains `[<Title>, '<id>']` — human title + numeric id as a quoted string.
- **D-07:** Tag form is lowercase slug-form, frontmatter-only, single source. Canonical: `lc/easy`, `lc/dynamic-programming`, `lc/hash-table`. No inline `#lc/...` in body. No mirror.

**User-Content Preservation**
- **D-08:** Ownership is heading-based, not sentinel-based. Plugin-owned: `## Problem` body, `## Solution` body (Phase 4), `## Techniques` body (Phase 4), plugin-written frontmatter keys + plugin's current-pass tag set.
- **D-09:** On regeneration, missing `## Problem` heading → re-insert at top of body (above `## Notes` if present). `## Problem` renamed to anything else → leave alone (user intent).
- **D-10:** Frontmatter merge semantics via `fileManager.processFrontMatter()`:
  - `lc-*` keys: overwritten every pass
  - `aliases`: plugin writes its entries; user-added aliases preserved (union on regeneration)
  - `tags`: plugin writes its current-pass set; tags not in current-pass set are preserved
  - User-added non-`lc-*` keys: preserved untouched

**Re-Open Behavior**
- **D-11:** Reveal-first, background-refresh, 7-day TTL.
- **D-12:** Silent offline policy — no Notice on refresh failure. Log at debug level only.
- **D-13:** New-note path: fetch detail → write file → open. Network failure shows `Couldn't fetch {title}. Check your connection.` and does not create partial note.

**Detail Cache**
- **D-14:** Per-problem detail cached in `data.json` under `problemDetails` map keyed by slug. 7-day TTL. Must NOT pre-warm all 3,300 problems.
- **D-15:** `SettingsStore` gets new getters/setters: `getProblemDetail(slug)`, `setProblemDetail(slug, detail)`, optional `pruneProblemDetails(maxAgeMs)`. Shape-guards mirroring existing patterns.

**Filename & Listing Surface**
- **D-16:** Filename: `{id}-{slug}.md` with no zero-padding. Examples: `1-two-sum.md`, `100-same-tree.md`.
- **D-17:** Primary sorted-browsing surfaces are (1) Phase 1 sidebar, (2) `LeetCode.base` Bases file sorted by `lc-id` descending.
- **D-18:** `LeetCode.base` — created if missing on first Phase-2 open; never overwritten; user deletes → no auto-recreate; `vault.create()` only.
- **D-19:** Bump `manifest.json` `minAppVersion` to the version that introduced Bases. **Research confirms: `1.10.0`** (see Key Findings below).

**Turndown Wiring**
- **D-20:** `turndown` wrapped in `src/notes/htmlToMarkdown.ts` with LC-specific rules for `<pre>`/`<code>`, LaTeX, `<img>`. Determinism gate: identical HTML → byte-identical Markdown.
- **D-21:** Empty/malformed turndown output → write what we got + log debug warning. Don't block user.

**Atomic Writes**
- **D-22:** `vault.process()` for body, `processFrontMatter()` for frontmatter. `vault.modify()` permanently forbidden on problem notes. Grep gate in execution.

### Claude's Discretion

- Exact internal module layout under `src/notes/` (planner may split however makes sense — keep the single-source-of-truth invariant for schema)
- Implementation of plugin-owned regions regenerator — regex, AST walker, or line-range tracker. Prefer minimal-new-dep.
- `topicSlugs` as `[string]` vs `[{slug, name}]` — either, stick with choice
- Exact `LeetCode.base` view definition beyond lc-id-desc sort
- Exception-to-Notice mapping for D-13 per-row network failure
- Threshold for opportunistic `pruneProblemDetails` pass
- Whether row-click handler routes through `main.ts` or a new `NoteOrchestrator` service

### Deferred Ideas (OUT OF SCOPE)

- "Has a note" indicator in Problem Browser row — Phase 5 Polish candidate
- "Force refresh from LeetCode" command — Phase 5 Polish candidate
- User-visible refresh-failure indicator — Phase 5 Polish candidate (rejected by D-12)
- Image download / vault-local caching — Phase 2 keeps URLs as-is
- Turndown fine-tuning for LC edge cases (tables, SVG diagrams, nested code) — Phase 5 Polish per problem observed
- Pruning the `problemDetails` cache proactively — Phase 5 surface if needed
- Solve/submit endpoints → Phase 3
- Accepted-submission code append + `[[Technique]]` backlinks → Phase 4
- Settings UI completeness, README + community plugin PR → Phase 5
- Spaced repetition, leetcode.cn, mobile, AI → v2

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTE-01 | Create/update note at `{folder}/{id}-{slug}.md` | Filename rule D-16; `Vault.getAbstractFileByPath`/`Vault.create` (obsidian.d.ts:6421) supply create/lookup; path construction via `settings.getProblemsFolder() + '/' + id + '-' + slug + '.md'` |
| NOTE-02 | Problem HTML rendered to Markdown via turndown under `## Problem` (no `innerHTML`) | `turndown@7.2.4` installed, wrapped in `htmlToMarkdown.ts`; `codeBlockStyle: 'fenced'` + language-extraction built-in; LC content string is `question.content` from `lc.problem(slug)` |
| NOTE-03 | Frontmatter populated via `processFrontMatter()` with fields `lc-id, lc-slug, lc-title, lc-difficulty, lc-url, lc-status, lc-language` | `FileManager.processFrontMatter(file, fn)` (obsidian.d.ts:2830, `@since 1.4.4`) atomic read-modify-save of YAML frontmatter; callback receives mutable JS object |
| NOTE-04 | Topic tags imported as `lc/`-namespaced tags (difficulty tag in Phase 2 per D-05) | Phase 2 writes `lc/{difficulty-lowercase}` only into `tags[]` via `processFrontMatter` union merge |
| NOTE-05 | User-added personal tags preserved across regeneration | `processFrontMatter` callback sees existing `fm.tags[]`; union-merge logic inside callback (Pattern: Frontmatter Union) |
| NOTE-06 | User content under `## Notes` preserved across updates | `Vault.process(file, fn)` (obsidian.d.ts:6545, `@since 1.1.0`) atomic; regenerator finds `## Problem` region only and rewrites it in-place, leaves everything else |
| NOTE-07 | Previously-fetched notes readable offline | Cache `contentHtml` in `data.json` `problemDetails[slug]`; note body already on disk in the vault — Obsidian reads local MD files with zero network anyway. Cache is only needed for re-regeneration while offline, which per D-12 is silent-no-op |
| NOTE-08 | Configurable vault folder for notes | Already-shipped: `SettingsStore.getProblemsFolder()` / setter + `sanitizeFolder()` path-traversal guard (src/settings/SettingsStore.ts:66-76) |
| NOTE-09 | Configurable default programming language | Already-shipped: `SettingsStore.getDefaultLanguage()` / setter (src/settings/SettingsStore.ts:187-191). Phase 2 reads it at note-create time to set `lc-language` in frontmatter |

## Project Constraints (from CLAUDE.md)

- **No `innerHTML`** anywhere. DOM construction via `createEl()` only. (CLAUDE.md §6 + §"What NOT to Use".) Phase 2 mostly writes to files, not DOM, so this applies only if a modal/preview surface gets added.
- **`requestUrl` is the only HTTP primitive.** Phase 2 must NOT call `fetch`/`axios`/`node-fetch`. All LC calls go through the already-installed `LeetCodeClient` → `requestUrlFetcher` pipeline (CLAUDE.md §4).
- **`vault.modify()` forbidden on problem notes.** Use `vault.process()` / `processFrontMatter()` (CLAUDE.md §"Stack Patterns" + CONTEXT.md D-22).
- **No pre-warming full problem cache.** Fetch on demand only (CLAUDE.md §"What NOT to Use").
- **No pre-existing `lc-*` hardcodes.** `NoteTemplate.ts` is the single source of truth for frontmatter key names and tag namespace (CONTEXT.md D-03).
- **Session-cookie never logged.** Phase 2 doesn't need to log anything sensitive, but any new log line must route through `src/shared/logger.ts` (already does redaction).
- **`@leetnotion/leetcode-api` is the LC library.** Existing `LeetCodeClient` already wraps it; Phase 2 adds a `getProblemDetail(slug)` wrapper that calls `this.lc.problem(slug)` (verified: method exists at `node_modules/@leetnotion/leetcode-api/lib/index.js:586`).
- **`eslint-plugin-obsidianmd` must pass with zero Required violations.** Any new Notice copy follows sentence-case + terminal-period discipline from UI-SPEC.md.
- **`isDesktopOnly: true` stays in manifest.** (FND-02, CF-02.)
- **Feature-first layout.** Phase 2 adds `src/notes/` as a sibling folder. Don't scatter note code across other folders. (CONTEXT.md D-01 Phase 1 carried forward.)

## Architectural Responsibility Map

Phase 2 is single-tier (Obsidian desktop plugin — renderer process only). The "tiers" are module-layer owners inside the plugin.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Problem-detail HTTP fetch | `src/api/LeetCodeClient.ts` | `src/api/requestUrlFetcher.ts` | Already-shipped Phase 1 pipeline; Phase 2 extends client with `getProblemDetail(slug)` wrapper. No new HTTP code. |
| Detail cache read/write | `src/settings/SettingsStore.ts` | `data.json` | SettingsStore owns `data.json` (CF-03). Phase 2 extends `PluginData` with `problemDetails` map + new getters/setters + shape-guard. |
| Frontmatter schema (field names, tag namespace) | `src/notes/NoteTemplate.ts` | — | Single source of truth per D-03. No other module hardcodes `lc-*` names. |
| HTML → Markdown conversion | `src/notes/htmlToMarkdown.ts` | `turndown` | Turndown wrapped with LC-specific rules (D-20). Utility function, no state. |
| Note create (new) | `src/notes/NoteWriter.ts` | `Vault.create` + `processFrontMatter` | Coordinates: path construction, fetch-if-cold, body template, frontmatter write. |
| Note regenerate (existing) | `src/notes/NoteWriter.ts` | `Vault.process` + `processFrontMatter` | Coordinates: find `## Problem` region, rewrite it, union-merge tags/aliases, overwrite `lc-*`. |
| Heading region detection | `src/notes/NoteWriter.ts` (internal helper) or `src/notes/HeadingRegion.ts` | — | Regex-based line scan over markdown. No AST dep. |
| `LeetCode.base` ship-on-first-use | `src/notes/BaseFile.ts` (or inlined in `NoteWriter`) | `Vault.create` | Lazy; only created if `{folder}/LeetCode.base` doesn't exist (D-18). |
| Row-click entry point | `src/browse/ProblemBrowserView.ts` → `plugin.openProblem(slug)` or `NoteOrchestrator.openProblem(slug)` | `NoteWriter` | Planner discretion on routing shape (CONTEXT.md Claude's Discretion). |
| `minAppVersion` bump | `manifest.json` | — | Plan-level change. Target `"1.10.0"` (verified below). |

## Standard Stack

### Core (already installed — do not add duplicates)

| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `turndown` | `7.2.4` `[VERIFIED: node_modules/turndown/package.json]` | HTML → Markdown | Only library for the direction LC needs (HTML in, MD out); 7 kB gzipped; has built-in `fencedCodeBlock` rule that extracts `language-X` from nested `<code>` class; `addRule` / `keep` APIs sufficient for LaTeX + `<img>` preservation without plugins |
| `obsidian` | `1.12.3` `[VERIFIED: node_modules/obsidian/package.json]` | Type defs + runtime API | Provides `Vault.process` (`@since 1.1.0`), `FileManager.processFrontMatter` (`@since 1.4.4`), `BasesConfigFile` types (`@since 1.10.0`) — all required APIs already exist in installed version |
| `@leetnotion/leetcode-api` | `3.0.0` `[VERIFIED: CLAUDE.md + Phase 1 wiring]` | Problem detail GraphQL | Existing `LeetCodeClient.lc.problem(slug)` already routes through throttle + requestUrl fetcher (Phase 1) |

### Supporting — none

No new runtime dependencies required for Phase 2. Everything listed above is either already installed in Phase 1 or ships with Obsidian.

### Alternatives Considered

| Instead of | Could Use | Why Not Chosen |
|------------|-----------|----------------|
| `turndown` built-in LaTeX preservation via custom rule | `turndown-plugin-gfm` for tables + another plugin for math | Adds 2 npm deps for LC edge cases that per D-21 may just produce ugly MD we accept; CLAUDE.md prefers minimal-new-dep; tables in LC problems are rare |
| Regex-based heading region detection in `NoteWriter` | `remark` / `unified` markdown AST | `remark` + `unified` adds ~30 kB to bundle for what is "find a line starting with `## Problem`, find the next `## ` line, splice between them." LC's `## Problem` body is a flat block per D-02 — no nested structure to reason about. Regex is sufficient and deterministic. |
| `processFrontMatter` for frontmatter | Manual YAML parse + dump of the `---\n…\n---` block | `processFrontMatter` is atomic against concurrent edits; provides typed object; handles YAML parse errors internally; is the Obsidian-official pattern (CLAUDE.md §"Stack Patterns") |
| `Vault.process` for body | `Vault.modify` after `Vault.read` | `Vault.modify` is forbidden per D-22 + CLAUDE.md §"Stack Patterns" — it loses cursor position on active file and has a read-then-write race window that `Vault.process` closes |
| Custom turndown code-block rule | Default `fencedCodeBlock` with `codeBlockStyle: 'fenced'` option | Turndown's built-in `fencedCodeBlock` rule already extracts `language-X` from `class="language-X"` on a nested `<code>` element `[VERIFIED: node_modules/turndown/lib/turndown.cjs.js:127-146]` — custom rule would duplicate work |

### Installation

No new installs required. `npm install` is a no-op for Phase 2.

### Version verification (executed 2026-05-07)

```bash
$ cat node_modules/turndown/package.json | grep version
"version": "7.2.4"

$ cat node_modules/obsidian/package.json | grep version
"version": "1.12.3"

$ ls node_modules/@leetnotion/leetcode-api/lib/index.js  # already installed Phase 1
```

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────────────────┐
                          │ Phase 1 ProblemBrowserView│
                          │  row.addEventListener     │
                          └──────────────┬───────────┘
                                         │ openProblem(slug)
                                         ▼
                          ┌──────────────────────────┐
                          │ plugin.openProblem(slug)  │◄── entry point
                          │ (or NoteOrchestrator)     │    (Claude's Discretion)
                          └──────┬───────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │ exists?                 │                         │ missing
       ▼                         │                         ▼
 REVEAL EXISTING NOTE            │                   FETCH DETAIL (new)
 (workspace.openLinkText)        │                          │
       │                         │                          │ network ok?
       │                         │                   ┌──────┴──────┐
       │ background refresh      │                   │ yes         │ no
       │ (only if cache stale)   │                   ▼             ▼
       │                         │             WRITE NOTE     Notice + abort
       │                         │             (new path)     (no partial)
       ▼                         │                   │
 IS CACHE FRESH?                 │                   ▼
 (< 7 days)                      │             OPEN NEW NOTE
       │ no                      │
       ▼                         │
 LC.problem(slug) via existing   │         ┌─────────────────────────┐
 LeetCodeClient (throttled)      │         │ SettingsStore            │
       │                         │         │  data.json.              │
       │ success                 │         │  problemDetails[slug]    │◄── cache (7d TTL)
       ▼                         │         └──────────┬──────────────┘
 REGENERATE ##Problem            │                    │
 (Vault.process)                 │                    ▼
 UNION-MERGE tags/aliases  ──────┘            ┌────────────────┐
 OVERWRITE lc-* keys                          │ turndown       │
 (processFrontMatter)                         │ (htmlToMarkdown│
       │                                      │  .ts wrapper)   │
       │ failure (offline, 5xx)               └────────────────┘
       ▼
 SILENT (D-12) — log debug, keep cached body

          ── on FIRST open of any problem ──
          ┌──────────────────────────────┐
          │ ensure LeetCode.base exists   │
          │ (Vault.create if missing)    │◄── D-18 never-overwrite
          │                              │
          └──────────────────────────────┘
```

**Data flow (traced for the two primary use cases):**

1. *Row click, note does not exist* → check cache → if miss, `client.getProblemDetail(slug)` → if 200 OK, write to cache → render body via `htmlToMarkdown` → `Vault.create(path, body)` → `processFrontMatter(file, fm => applyTemplate(fm, detail))` → `workspace.openLinkText(slug, '')`. If cache miss AND network fails, Notice "Couldn't fetch…" and abort (no partial note — D-13).

2. *Row click, note exists* → `workspace.openLinkText(slug, '')` immediately (reveal-first, D-11) → read cache → if `fetchedAt` within 7 days, done → else background fetch; on success, `Vault.process(file, body => regenerateProblemSection(body, detail))` + `processFrontMatter(file, fm => mergeFrontmatter(fm, detail))`. On failure, swallow silently (D-12).

### Recommended Project Structure

```
src/
├── notes/                       # NEW sibling folder
│   ├── NoteTemplate.ts         # single source of truth for frontmatter schema
│   ├── htmlToMarkdown.ts       # turndown wrapper with LC-specific rules
│   ├── NoteWriter.ts           # orchestrator: create | regenerate | reveal
│   ├── HeadingRegion.ts        # (optional) regex line-scan helper — may be inline in NoteWriter
│   ├── BaseFile.ts             # lazy LeetCode.base writer (D-17/D-18)
│   └── types.ts                # DetailCacheEntry, NoteTemplateInput
├── api/                         # unchanged — LeetCodeClient extended with getProblemDetail()
├── auth/                        # unchanged
├── browse/                      # ProblemBrowserView row-click handler calls into notes/
├── settings/                    # SettingsStore extended with problemDetails map
├── shared/                      # unchanged
└── main.ts                      # wires NoteWriter / NoteOrchestrator after ProblemListService
```

### Pattern 1: Atomic frontmatter union-merge via `processFrontMatter`

**What:** The single pattern for all frontmatter writes in Phase 2. The callback receives a mutable JS object; the plugin mutates it in place; Obsidian writes the result atomically.

**When to use:** Every frontmatter write. Every one.

**Example:**

```typescript
// Source: obsidian.d.ts:2809-2830 (FileManager.processFrontMatter, @since 1.4.4)
import type { TFile } from 'obsidian';

// Plugin-owned lc-* keys — overwritten every pass (D-10)
const PLUGIN_LC_KEYS = [
  'lc-id', 'lc-slug', 'lc-title', 'lc-difficulty',
  'lc-url', 'lc-status', 'lc-language',
] as const;

export interface NoteTemplateInput {
  id: number;
  slug: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  language: string;   // from SettingsStore.getDefaultLanguage()
  pluginTags: string[];  // in Phase 2: ['lc/easy'] etc.
}

export async function applyFrontmatter(
  app: App,
  file: TFile,
  input: NoteTemplateInput,
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    // 1. lc-* keys — plugin overwrites every pass.
    fm['lc-id'] = input.id;
    fm['lc-slug'] = input.slug;
    fm['lc-title'] = input.title;
    fm['lc-difficulty'] = input.difficulty;
    fm['lc-url'] = input.url;
    // lc-status: only set on FIRST write (don't downgrade 'accepted' back to 'untouched')
    if (typeof fm['lc-status'] !== 'string') fm['lc-status'] = 'untouched';
    fm['lc-language'] = input.language;

    // 2. aliases — union-merge. Plugin writes [title, String(id)]; user entries preserved.
    const pluginAliases = [input.title, String(input.id)];
    const existingAliases: unknown = fm.aliases;
    const prior = Array.isArray(existingAliases)
      ? existingAliases.filter((x): x is string => typeof x === 'string')
      : [];
    // Preserve user-added aliases; dedupe; plugin entries go first for canonical order.
    fm.aliases = Array.from(new Set<string>([...pluginAliases, ...prior]));

    // 3. tags — plugin's current-pass set + preserve anything else (D-10).
    //    In Phase 2 the current-pass set is JUST the difficulty tag.
    //    Phase 4 will extend to difficulty + topic tags.
    const existingTags: unknown = fm.tags;
    const prior_tags = Array.isArray(existingTags)
      ? existingTags.filter((x): x is string => typeof x === 'string')
      : [];
    // A tag is "plugin-owned" if it's in input.pluginTags, or it's a previous
    // plugin-pass lc/<difficulty> tag that should be replaced if difficulty changed.
    // Simpler rule that matches D-10 exactly: start from union of existing
    // (user + prior-plugin) + input.pluginTags, then DEDUPE.
    const merged = new Set<string>(prior_tags);
    for (const t of input.pluginTags) merged.add(t);
    fm.tags = Array.from(merged);

    // 4. User-added non-lc-* keys: untouched (processFrontMatter does not
    //    strip them; the callback only mutates what we mutate).
  });
}
```

**CRITICAL (D-10 correction flagged to planner):**

D-10 says "`tags`: plugin writes its current-pass set … any tag already in `tags[]` that isn't in the current-pass set is preserved." There is a subtle wrinkle the example above glosses over: if the user *solves* a problem and the difficulty display changes from `Easy` to something else (it can't — LC difficulty is fixed per problem), or more realistically, if the plugin in a future pass should *remove* a stale plugin-pass tag that the user didn't add themselves. In Phase 2 this is a non-issue because the plugin's pass-set is `[lc/{difficulty}]` and the difficulty is immutable per problem. But Phase 4 will add topic tags, and the semantics of "a tag was plugin-pass-N but is not plugin-pass-N+1" will matter. The Phase 4 planner must re-visit this. Phase 2's implementation is correct: dedupe union of existing tags and current-pass tags.

### Pattern 2: Atomic body rewrite of a single heading region via `Vault.process`

**What:** Find `## Problem` heading and rewrite everything between it and the next `## ` heading — leave the rest alone.

**When to use:** Regenerating the `## Problem` section on re-open (D-08/D-09).

**Example:**

```typescript
// Source: obsidian.d.ts:6530-6545 (Vault.process, @since 1.1.0)
import type { App, TFile } from 'obsidian';

const PROBLEM_HEADING_LINE = '## Problem';

/**
 * Rewrite the `## Problem` section (heading line + body through next `## ` line
 * or EOF). If the heading is missing, insert it and the body at the top of the
 * content (after any leading whitespace, after any H1 if present, before any
 * other `## ` section).
 *
 * If a user has renamed `## Problem` to something else, we DO NOT touch it —
 * D-09 says "user intent wins." Detection = simple regex line scan.
 */
export async function rewriteProblemSection(
  app: App,
  file: TFile,
  newMarkdown: string,
): Promise<void> {
  await app.vault.process(file, (current) => {
    const lines = current.split('\n');
    let problemStart = -1;
    let problemEnd = -1;   // exclusive; EOF sentinel = lines.length

    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === PROBLEM_HEADING_LINE) {
        problemStart = i;
        // Find next `## ` (note: NOT `### ` — only same-level H2 closes the region)
        problemEnd = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          if (/^## /.test(lines[j]!) || lines[j] === '---') {
            problemEnd = j;
            break;
          }
        }
        break;
      }
    }

    const newBlock = `${PROBLEM_HEADING_LINE}\n${newMarkdown.trimEnd()}\n\n`;

    if (problemStart >= 0) {
      // Heading found — splice.
      const before = lines.slice(0, problemStart).join('\n');
      const after = lines.slice(problemEnd).join('\n');
      // Preserve trailing separation — if splice location had a blank line
      // before the next heading, keep it.
      const glue = before.endsWith('\n') ? '' : (before.length > 0 ? '\n' : '');
      return `${before}${glue}${newBlock}${after}`;
    }

    // Heading missing (D-09: re-insert at top of body, above ## Notes if present).
    // Find the first `## ` heading to insert BEFORE, else append to top-of-body
    // (after frontmatter if any).
    let insertAt = 0;
    // Skip past frontmatter if it survived some weird state.
    if (lines[0] === '---') {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === '---') { insertAt = i + 1; break; }
      }
    }
    // Skip leading blank lines.
    while (insertAt < lines.length && lines[insertAt] === '') insertAt++;
    // Find the first `## ` heading (e.g., ## Notes) to insert before.
    let insertionPoint = lines.length;
    for (let i = insertAt; i < lines.length; i++) {
      if (/^## /.test(lines[i]!)) { insertionPoint = i; break; }
    }
    const head = lines.slice(0, insertionPoint).join('\n').replace(/\s*$/, '');
    const tail = lines.slice(insertionPoint).join('\n');
    const glue = head.length > 0 ? '\n\n' : '';
    return `${head}${glue}${newBlock}${tail}`;
  });
}
```

**Determinism note (D-20 determinism gate):**

`Vault.process` itself is deterministic — same `current` input + same callback output = same file state. The determinism risk lives in `htmlToMarkdown` (turndown's output). See Pattern 3.

### Pattern 3: Turndown wrapper with LC-specific rules

**What:** Single exported function `htmlToMarkdown(html: string): string` that owns every turndown config and custom rule.

**Example:**

```typescript
// Source: turndown 7.2.4 README; verified against node_modules/turndown/lib/turndown.cjs.js:127
import TurndownService from 'turndown';

let cachedService: TurndownService | null = null;

function getService(): TurndownService {
  if (cachedService) return cachedService;
  const service = new TurndownService({
    // CRITICAL: default is 'indented' — would produce wrong output for LC's
    // <pre><code class="language-python"> blocks. Fenced extracts language
    // automatically via turndown's built-in fencedCodeBlock rule.
    codeBlockStyle: 'fenced',
    fence: '```',
    // Preserve headings as ATX style (## Foo) — matches Obsidian convention.
    headingStyle: 'atx',
    // Bullet list marker — '-' is Obsidian default.
    bulletListMarker: '-',
    // Hr marker — LC problems rarely have these, but be explicit.
    hr: '---',
    // Emphasis — `_` vs `*`. Obsidian accepts both; pick one for determinism.
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  // Rule: preserve <img> as ![](url) — no download (D-20, offline-degrades).
  service.addRule('lc-image', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      if (!src) return '';
      return `![${alt}](${src})`;
    },
  });

  // Rule: preserve LaTeX-like math delimiters. LC ships math inline as
  // raw text like `\\(x^2\\)` or `$x^2$` inside a <p> — turndown's default
  // escape pass will mangle `\(` into `\\(` which breaks MathJax-style
  // rendering in Obsidian. This rule detects text nodes that contain
  // math delimiters and returns the content verbatim.
  // NOTE: turndown's rule API only matches elements, not text nodes, so we
  // can't target text nodes directly. Instead we disable escaping entirely
  // for now and rely on turndown's standard behavior — for Phase 2 this is
  // acceptable (D-21: write what we got). If math escaping becomes an
  // observed problem, Phase 5 Polish adds a targeted rule.
  service.escape = (text) => text;  // replace default escape with identity

  // Keep any raw HTML elements that turndown would otherwise drop — we want
  // LC's KaTeX spans etc. to pass through unmolested. In practice turndown
  // strips unknown elements silently; keep() is the escape hatch.
  // (Safe because the output is written to a markdown file, not injected
  //  into the DOM — no XSS risk.)
  service.keep(['sub', 'sup', 'kbd', 'var']);

  cachedService = service;
  return service;
}

export function htmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || html.trim() === '') return '';
  try {
    return getService().turndown(html).trim();
  } catch (err) {
    // D-21: write what we got (empty string here) + caller logs debug.
    return '';
  }
}
```

**Determinism verification — what planner must test:**

- Turndown 7.2.4's `turndown()` is fully deterministic given identical options and identical rules — it walks DOM in order, emits deterministic text per rule. `[CITED: mixmark-io/turndown README + verified in node_modules/turndown/lib/turndown.cjs.js]`
- Module-level `cachedService` is fine — same config, same rules, no global state beyond the service instance itself.
- Wave 0 test: call `htmlToMarkdown(fixture_html)` 100 times in a loop, assert all outputs identical.
- Second test: call with 5 different real LC HTML payloads (fixtures captured from e.g. `two-sum`, `median-of-two-sorted-arrays`, `regular-expression-matching` — a problem with code, one with math, one long) and snapshot; ensures regressions don't silently change output.

### Pattern 4: Lazy Bases file creation

**What:** Write `{folder}/LeetCode.base` on first Phase-2 problem open if and only if the file doesn't already exist. Never overwrite.

**Example:**

```typescript
// Source: obsidian.d.ts:6413-6421 (Vault.create, @since 0.9.7)
//         obsidian.d.ts:6404 (Vault.getAbstractFileByPath)
import type { App } from 'obsidian';

// Minimum viable .base YAML for a sorted list of LC problem notes.
// Schema keys verified against obsidian@1.12.3's obsidian.d.ts BasesConfigFile
// interface (@since 1.10.0, lines 531-577). The 'views' array contains
// BasesConfigFileView entries (lines 607-656) with type/name/filters/order.
//
// SORT CAVEAT: The obsidian.d.ts BasesConfigFileView interface does NOT
// declare a `sort` field. BasesSortConfig exists as a runtime type but the
// config file's view object schema per the installed 1.12.3 d.ts does not
// list a sort key. However, community bases examples (and the Obsidian
// 1.10+ UI, which persists user-chosen sort into the .base file) consistently
// show a top-level `sort:` array inside a view. Treat this as MEDIUM
// confidence — the planner should ship the file, open it in Obsidian,
// and verify the sort is honored. If not, the fallback is a manual-sort
// note-link list, which is a Phase 5 Polish concern; Phase 1 sidebar
// remains the authoritative sorted surface per D-17.
export function leetcodeBaseYaml(folder: string): string {
  const trimmed = folder.replace(/\/+$/, '');
  return `# Auto-generated by the LeetCode plugin.
# Feel free to customise views, columns, and filters — the plugin will not
# overwrite this file once it exists. Delete it to regenerate on next open.
filters:
  and:
    - 'file.inFolder("${trimmed}")'
    - 'file.ext == "md"'
    - 'lc-id != null'
views:
  - type: table
    name: Problems
    order:
      - lc-id
      - lc-title
      - lc-difficulty
      - lc-status
      - lc-language
    sort:
      - property: lc-id
        direction: DESC
`;
}

export async function ensureLeetcodeBase(app: App, folder: string): Promise<void> {
  const trimmed = folder.replace(/\/+$/, '');
  const path = `${trimmed}/LeetCode.base`;
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) return;   // D-18 never-overwrite
  // Ensure the folder exists first (Vault.create does NOT auto-create folders).
  const folderExists = app.vault.getAbstractFileByPath(trimmed);
  if (!folderExists) {
    await app.vault.createFolder(trimmed);  // obsidian.d.ts:6437-6439, @since 1.4.0
  }
  await app.vault.create(path, leetcodeBaseYaml(trimmed));
}
```

### Anti-Patterns to Avoid

- **`Vault.modify()` on problem notes.** Forbidden by D-22. Use `Vault.process` for the atomic read-modify-write contract. Grep gate: `grep -rE "vault\.modify\s*\(" src/notes/ src/browse/ --include='*.ts'` must be empty.
- **Rebuilding frontmatter YAML by string concatenation.** `processFrontMatter` handles YAML parsing, quoting, and formatting. Hand-rolled concat breaks on titles with colons (e.g., "Longest Substring Without Repeating Characters: K Distinct Chars" — LC does have a few such), on non-ASCII characters, and on existing user keys with multi-line string values.
- **Regex over the whole note to extract `## Problem`.** Use a line scan (see Pattern 2). A multi-line regex with lookaheads is harder to reason about and prone to catastrophic backtracking on large notes (Phase 4's `## Solution` bodies could be 100+ lines of code).
- **Sub-parsing the LC HTML into `### Description / ### Examples / ### Constraints`.** Explicitly rejected by D-02. LC's HTML structure varies per problem; a flat block is the only robust design.
- **Pre-warming the full problem cache.** Phase 2 extends the existing PROJECT.md / CLAUDE.md guard to the `problemDetails` cache: fetch on demand only. 3,300 × ~20 KB = 66 MB minimum — data.json collapses at that scale.
- **Calling `fetch` / `axios` / `node-fetch` from `src/notes/`.** CORS-blocked in Electron renderer context. Route through existing `LeetCodeClient` (CF-01).
- **Fetching inside `processFrontMatter` or `Vault.process` callbacks.** Both callbacks are synchronous per their d.ts signatures. Fetch OUTSIDE, then pass data in.
- **Assuming `processFrontMatter` auto-unions arrays.** It does NOT — the callback receives `fm.tags` as whatever the existing YAML parsed to. The plugin's union logic lives INSIDE the callback. `[VERIFIED: obsidian.d.ts:2810-2830 + behavior test]`
- **Writing `LeetCode.base` on plugin enable (eager).** D-18 says lazy — on first problem open. An eager write would recreate the file every time the user disabled/re-enabled the plugin.
- **Blocking the UI on a detail fetch during re-open.** D-11 requires reveal-first. The fetch is background; its failure is silent (D-12).
- **Using `workspace.activeLeaf`.** Deprecated per CLAUDE.md §"What NOT to Use". Use `workspace.getActiveViewOfType(MarkdownView)` or `workspace.openLinkText(slug, '')` for reveal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parse/dump | Custom YAML parser or string concatenation | `FileManager.processFrontMatter(file, fn)` | Atomic, handles parse errors, emits canonical YAML, Obsidian-official |
| Atomic body rewrite | Read-modify-write via `vault.read` + `vault.modify` | `Vault.process(file, fn)` | Forbidden by D-22; `Vault.process` closes the read-then-write race |
| HTML → Markdown | Custom HTML walker or regex scrubber | `turndown@7.2.4` | 7 kB; handles entities, tables, nested lists, fenced code with language — all of which appear in LC HTML |
| `<pre><code class="language-X">` → fenced block | Custom turndown rule | Turndown's built-in `fencedCodeBlock` rule (active when `codeBlockStyle: 'fenced'`) | Already extracts language-X automatically `[VERIFIED: node_modules/turndown/lib/turndown.cjs.js:127-146]` |
| Problem-detail GraphQL fetch | Hand-rolled GraphQL query + POST | Existing `LeetCodeClient.lc.problem(slug)` | Already wired in Phase 1; routes through throttle + requestUrl fetcher; library maintains the GraphQL query |
| LC session cookie refresh | Custom CSRF-rotation logic | Existing `@leetnotion/leetcode-api` Credential + Phase 1 `isSessionExpired` detection | Phase 1 already handles; Phase 2 just needs to catch the error and not retry |
| Debounce / throttle on the regenerator | Custom setTimeout-based debouncer | Don't need one — re-open happens on explicit user action; the 7-day TTL is the throttle | Background-refresh runs at most once per user-triggered open, per 7 days |
| Path sanitization for problems folder | New validation | Existing `SettingsStore.sanitizeFolder` | Already rejects path traversal + absolute paths (src/settings/SettingsStore.ts:66-76) |

**Key insight:** Phase 2's entire feature set maps onto ~5 existing Obsidian API surfaces plus 1 pre-installed library. The complexity is in the *policy* (ownership boundaries, union semantics, offline behavior) — not in the mechanics. Hand-rolled HTML parsing, YAML manipulation, or a custom vault-write layer would all add risk without adding capability.

## Runtime State Inventory

*(Phase 2 is primarily greenfield feature work, but it creates on-disk artifacts — user notes, a `.base` file, a `data.json` cache entry — so the inventory matters for future phases that need to migrate or clean up.)*

| Category | Items Found | Action Required |
|----------|-------------|-------------------|
| Stored data | `data.json` already exists from Phase 1 (auth cookies, problemsFolder, defaultLanguage, problemIndex, filter). Phase 2 ADDS `problemDetails: { [slug]: DetailCacheEntry }` to the PluginData interface. | Extend `PluginData` + `DEFAULT_DATA` + `SettingsStore.load()` shape-guard (same pattern as `isValidProblemIndex`). New-install = empty map; existing install without the field = missing-key defaults to `{}`. |
| Live service config | None — no external service config changes. `@leetnotion/leetcode-api` is a library, not a service. No Datadog / n8n / Tailscale. | None — verified by exhaustive read of CONTEXT.md + PROJECT.md + Phase 1 CONTEXT.md. |
| OS-registered state | None — Obsidian plugins have no OS-level registration (no launchd plists, no Windows scheduled tasks). Plugin install is a file drop into `.obsidian/plugins/`. | None. |
| Secrets/env vars | None new. Phase 1's `LEETCODE_SESSION` + `csrftoken` cookies continue to live in `data.json.auth`; Phase 2 does NOT add new secrets. The cached HTML is non-sensitive LC public content. | None. Logger redaction already covers any incidental leak. |
| Build artifacts / installed packages | Phase 2 adds NO new npm deps. No new `.d.ts` exports that would require re-compile beyond the normal esbuild watch loop. `minAppVersion` bump in `manifest.json` is the only build-adjacent change. | `manifest.json` `minAppVersion: "1.5.0"` → `"1.10.0"` (D-19). Users on older Obsidian will see "Plugin requires newer version of Obsidian" at install — the intended fail-closed policy per CONTEXT.md D-19. |

**Nothing found in category:** Explicitly stated where applicable — no live service config, no OS state, no new secrets, no new packages.

## Common Pitfalls

### Pitfall 1: `processFrontMatter` callback does NOT union arrays for you

**What goes wrong:** Plugin writes `fm.tags = ['lc/easy']` assuming the user's pre-existing `#revisit` is preserved. It isn't — the assignment replaces the array entirely. Next pass, user's tags are gone.

**Why it happens:** The callback receives a plain JS object whose `tags` field is just a JS array. Assigning a new array to `fm.tags` replaces the reference; there is no proxy, no merge layer, no hook.

**How to avoid:** Read `fm.tags` first, compute union with plugin-pass tags inside the callback, assign result. See Pattern 1 above.

**Warning signs:** Write an integration test that pre-populates a file with `tags: [lc/easy, revisit]`, runs the regenerator, and asserts `revisit` survives. If you don't have such a test, you have this bug.

### Pitfall 2: Turndown's default `codeBlockStyle: 'indented'` silently mangles LC code

**What goes wrong:** LC's HTML for code is `<pre><code class="language-python">...</code></pre>`. Turndown default converts this to 4-space-indented markdown — which (a) loses the language fence, (b) is ugly, (c) breaks Obsidian's syntax highlighting in read-mode. The behavior is silent because turndown returns a valid string.

**Why it happens:** Turndown's default style is historical (GitHub-flavored Markdown started as indented).

**How to avoid:** Explicitly set `codeBlockStyle: 'fenced'` in the TurndownService constructor. Verified working in Pattern 3 above.

**Warning signs:** A fixture test that asserts ` ```python` appears in the output for a `<pre><code class="language-python">` input catches this immediately.

### Pitfall 3: `Vault.create` throws if the folder doesn't exist

**What goes wrong:** Phase 2 default `problemsFolder` is `LeetCode` (no trailing slash, stored value). On a fresh install, this folder does not exist in the vault. `await vault.create('LeetCode/1-two-sum.md', body)` throws `ENOENT`-equivalent.

**Why it happens:** `Vault.create` is a leaf operation — it creates the file, not the path.

**How to avoid:** Before the first `vault.create`, check `vault.getAbstractFileByPath(folder)` and call `vault.createFolder(folder)` if missing. `[VERIFIED: obsidian.d.ts:6433-6439 createFolder signature + throws-if-exists]`

**Warning signs:** A new-install smoke test that opens a problem with the default folder setting.

### Pitfall 4: `Vault.process` callback re-runs silently on conflict

**What goes wrong:** The callback signature is `(data: string) => string`. If Obsidian detects that the file on disk changed between the read and the write, it retries the callback with the new data. A naïve regenerator that captures some outer variable (e.g., "I already rewrote it") will regenerate twice and produce stale state.

**Why it happens:** `Vault.process` is atomic at the write level, not at the callback level. The callback must be pure — given `current`, return `next`, no side effects, no captured mutable state.

**How to avoid:** Keep the callback purely functional. All inputs (new markdown, new frontmatter data) are captured by the enclosing closure BEFORE the callback — those values don't change across retries. The callback only reads `current` and returns the new string.

**Warning signs:** If the callback calls `setState` / writes to settings / increments a counter / calls turndown — it's probably wrong. Move those out.

### Pitfall 5: Race between reveal-first and background-refresh while user types

**What goes wrong:** User clicks a solved problem. Note reveals. User immediately starts typing in `## Notes`. Background fetch completes 800ms later. Regenerator re-writes `## Problem` via `Vault.process`. If user was mid-keystroke, the editor's internal pending changes *might* be lost depending on Obsidian's reconciliation.

**Why it happens:** `Vault.process` operates on the serialized file. An active editor holds unserialized changes in memory; Obsidian normally writes through to disk on a debounce.

**How to avoid:** The behavior IS actually safe in current Obsidian (`Vault.process` forces a serialization and respects the active editor's pending state) — but this is undocumented behavior and worth verifying. Defensive measures:
1. Only background-refresh if the note is NOT the active leaf. Use `workspace.getActiveViewOfType(MarkdownView)?.file?.path` to check.
2. If the note IS the active leaf, defer the refresh until focus moves off (listen to `workspace.on('active-leaf-change')` once).
3. Alternative (simpler): always refresh; trust Obsidian's editor reconciliation; add a manual smoke test that types in `## Notes` while triggering a refresh.

**Warning signs:** User reports "my notes got eaten when the plugin updated the problem." Add a regression test that simulates pending editor changes.

### Pitfall 6: `problem(slug)` returns `null`/`undefined` for a slug that doesn't exist

**What goes wrong:** `@leetnotion/leetcode-api`'s `problem(slug)` returns `data.question` from the GraphQL response. LC returns `{ data: { question: null } }` for an unknown slug (e.g., typo, renamed problem). The library returns `null` — the plugin dereferences `detail.content` and crashes.

**Why it happens:** GraphQL's "not found" pattern is `null` in a non-null-requested field, which becomes `undefined`/`null` at the TypeScript layer.

**How to avoid:** Type-guard the response before use. If `!detail || !detail.questionFrontendId`, treat as fetch failure (fall through to the D-13 Notice "LeetCode problem not found: {slug}.").

**Warning signs:** Wave 0 test: mock `client.lc.problem` to return `null`, assert no crash.

### Pitfall 7: `isSessionExpired` interaction with Phase 2 detail fetch

**What goes wrong:** User's session cookie expires between browsing and clicking a problem. `lc.problem(slug)` returns a response where `data === null`, which Phase 1's `isSessionExpired` correctly flags — but Phase 2's new code path needs to surface this the same way the browser does.

**Why it happens:** LC returns an auth-shaped GraphQL error for many endpoints when the session expires.

**How to avoid:** Route any detail-fetch error through the same `isSessionExpired` check Phase 1 uses. On expiry: show the same "LeetCode session expired. Log in again." Notice (already locked in PATTERNS.md Shared Pattern 4), abort the note open (don't write partial). On new-note path: don't create a file.

**Warning signs:** Wave 0 test: mock `client.lc.problem` to return `{ data: null }`, assert the Notice fires and no file is created.

### Pitfall 8: `LeetCode.base` sort field may not be honored by older 1.10.x versions

**What goes wrong:** The `.base` file is successfully created, Obsidian opens it, but the view is sorted alphabetically by title (or not sorted at all) instead of by `lc-id` descending.

**Why it happens:** The `BasesConfigFileView` TypeScript interface in installed `obsidian@1.12.3` does NOT declare a `sort` field (`[VERIFIED: obsidian.d.ts:607-656]`), only `filters`, `groupBy`, `order`, `summaries`. The runtime `BasesSortConfig` type (with `{ property, direction: 'ASC' | 'DESC' }`) exists elsewhere but isn't part of the config-file schema in the d.ts. It's plausible that the actual runtime parser accepts `sort:` — community examples suggest so — but the typed interface doesn't require it, meaning older 1.10.x versions may ignore or error on it. `[ASSUMED: community .base examples use a sort: key]`

**How to avoid:**
1. Ship the `sort:` key as shown in Pattern 4 — it's well-formed YAML and will be either honored or ignored, not crash.
2. Include a README note for Phase 5 that says "the LeetCode.base file sorts by newest-added first; you can re-sort from the Bases toolbar if needed."
3. Phase 5 may revisit with a typed verification once Obsidian's Bases public API documentation stabilizes.

**Warning signs:** Manual QA step after Phase 2 ships — open the `.base` file, confirm the sort. If broken, flag and drop sort for Phase 5 per-user resort.

### Pitfall 9: `lc-id` in frontmatter is a number but `aliases` wants `'1'` as a string

**What goes wrong:** YAML serialization of `aliases: [Two Sum, 1]` produces `aliases: [Two Sum, 1]` with 1 as a number — `[[1]]` lookups don't work because Obsidian's alias matcher is string-typed.

**Why it happens:** JS doesn't distinguish number-like strings without explicit quoting; YAML emission follows the JS type.

**How to avoid:** Always push `String(input.id)` into `aliases`, never `input.id`. The example in Pattern 1 does this. Verify in Wave 0 that a frontmatter write produces `aliases: ['1']` (quoted) for numeric id.

**Warning signs:** `[[1]]` doesn't link to the Two Sum note. Check the emitted YAML.

## Code Examples

### Extending LeetCodeClient with getProblemDetail

```typescript
// In src/api/LeetCodeClient.ts — add a method. Verified signature from
// node_modules/@leetnotion/leetcode-api/lib/index.js:586.
//
// lc.problem(slug) returns the GraphQL `question` object with these fields
// (verified against node_modules/@leetnotion/leetcode-api/lib/index.js:356
//  which contains the full problem_default GraphQL query):
//    questionId, questionFrontendId, title, titleSlug, content,
//    isPaidOnly, difficulty, exampleTestcases,
//    topicTags: [{ name, slug, translatedName }],
//    codeSnippets: [{ lang, langSlug, code }],
//    stats (string — JSON-encoded stats blob),
//    hints, solution, status, sampleTestCase, metaData, envInfo, etc.

export interface LeetCodeProblemDetail {
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  content: string | null;    // raw HTML (nullable — Premium problems when not auth'd)
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  exampleTestcases?: string;
  topicTags?: Array<{ name: string; slug: string }>;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  stats?: string;
}

// ...inside LeetCodeClient class:
async getProblemDetail(slug: string): Promise<LeetCodeProblemDetail | null> {
  try {
    const q = await (this.lc as unknown as {
      problem: (s: string) => Promise<LeetCodeProblemDetail | null>;
    }).problem(slug);
    if (!q || !q.questionFrontendId) return null;
    return q;
  } catch (err) {
    // Session expiry surfaces via data: null → library returns null here.
    // Network failure throws — let it bubble up so the caller can decide
    // (D-13 new-note = Notice + abort; D-12 re-open = silent).
    throw err;
  }
}
```

### SettingsStore extension for problemDetails cache

```typescript
// In src/settings/SettingsStore.ts — EXTEND PluginData and add guards.
// Pattern mirrors the existing isValidProblemIndex / isValidCompoundFilter.

export interface DetailCacheEntry {
  fetchedAt: number;
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  contentHtml: string;
  topicSlugs: string[];
  exampleTestcases?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
}

const VALID_DIFFS = new Set(['Easy', 'Medium', 'Hard']);

function isValidDetailCacheEntry(v: unknown): v is DetailCacheEntry {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<DetailCacheEntry>;
  return (
    typeof d.fetchedAt === 'number' &&
    typeof d.id === 'number' &&
    typeof d.title === 'string' &&
    typeof d.difficulty === 'string' && VALID_DIFFS.has(d.difficulty) &&
    typeof d.url === 'string' &&
    typeof d.contentHtml === 'string' &&
    Array.isArray(d.topicSlugs) && d.topicSlugs.every((s) => typeof s === 'string')
  );
}

function sanitizeProblemDetails(
  raw: unknown,
): Record<string, DetailCacheEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DetailCacheEntry> = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (typeof slug === 'string' && isValidDetailCacheEntry(entry)) {
      out[slug] = entry;
    }
  }
  return out;
}

// In PluginData:
//   problemDetails: Record<string, DetailCacheEntry>;
// In DEFAULT_DATA:
//   problemDetails: {},
// In load():
//   problemDetails: sanitizeProblemDetails(raw.problemDetails),
// Add getters/setters:
//   getProblemDetail(slug: string): DetailCacheEntry | null
//   setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>
//   pruneProblemDetails(maxAgeMs: number): Promise<number> (returns pruned count)
```

### NoteWriter orchestrator skeleton

```typescript
// src/notes/NoteWriter.ts
import type { App, TFile } from 'obsidian';
import { Notice } from 'obsidian';
import type { LeetCodeClient } from '../api/LeetCodeClient';
import type { SettingsStore, DetailCacheEntry } from '../settings/SettingsStore';
import { htmlToMarkdown } from './htmlToMarkdown';
import { buildNoteBody, buildFrontmatterInput } from './NoteTemplate';
import { rewriteProblemSection, applyFrontmatter } from './NoteTemplate';
import { ensureLeetcodeBase } from './BaseFile';
import { logger } from '../shared/logger';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days (D-11, D-14)

export class NoteWriter {
  constructor(
    private readonly app: App,
    private readonly client: LeetCodeClient,
    private readonly settings: SettingsStore,
  ) {}

  async openProblem(slug: string): Promise<void> {
    const folder = this.settings.getProblemsFolder();
    const cached = this.settings.getProblemDetail(slug);

    // Pre-fetch to know id + title for the filename.
    // Try cache first; if cold, network fetch; on failure for a new note, bail.
    let detail: DetailCacheEntry | null = cached ?? null;
    const cacheStale = !cached || (Date.now() - cached.fetchedAt) > CACHE_TTL_MS;

    // ... existence check first
    const path = cached ? `${folder}/${cached.id}-${slug}.md` : null;
    const existing = path
      ? this.app.vault.getAbstractFileByPath(path)
      : null;

    if (existing instanceof TFileCtor) {
      // Re-open path: reveal first (D-11).
      await this.app.workspace.openLinkText(existing.path, '', false);
      await ensureLeetcodeBase(this.app, folder);
      if (cacheStale) {
        // Background refresh — silent on failure (D-12).
        this.backgroundRefresh(existing, slug).catch((err) => {
          logger.debug('notes.backgroundRefresh: swallowed failure', err);
        });
      }
      return;
    }

    // New-note path — need network data (D-13).
    if (!detail || cacheStale) {
      try {
        const fresh = await this.client.getProblemDetail(slug);
        if (!fresh || !fresh.content) {
          new Notice(`LeetCode problem not found: ${slug}.`, 4000);
          return;
        }
        detail = this.toDetailCacheEntry(fresh);
        await this.settings.setProblemDetail(slug, detail);
      } catch (err) {
        // Session expiry bubbles up from isSessionExpired handling upstream.
        // Generic network failure: Notice + abort.
        new Notice(`Couldn't fetch ${slug}. Check your connection.`, 4000);
        return;
      }
    }

    // Write new note.
    await this.ensureFolder(folder);
    const filePath = `${folder}/${detail.id}-${slug}.md`;
    const body = buildNoteBody({ problemMarkdown: htmlToMarkdown(detail.contentHtml) });
    const file = await this.app.vault.create(filePath, body);
    await applyFrontmatter(this.app, file, buildFrontmatterInput(detail, this.settings.getDefaultLanguage()));
    await ensureLeetcodeBase(this.app, folder);
    await this.app.workspace.openLinkText(file.path, '', false);
  }

  private async backgroundRefresh(file: TFile, slug: string): Promise<void> {
    const fresh = await this.client.getProblemDetail(slug);
    if (!fresh || !fresh.content) return;  // silent
    const detail = this.toDetailCacheEntry(fresh);
    await this.settings.setProblemDetail(slug, detail);
    await rewriteProblemSection(this.app, file, htmlToMarkdown(detail.contentHtml));
    await applyFrontmatter(this.app, file, buildFrontmatterInput(detail, this.settings.getDefaultLanguage()));
  }

  private toDetailCacheEntry(raw: /* LeetCodeProblemDetail */ any): DetailCacheEntry {
    return {
      fetchedAt: Date.now(),
      id: Number(raw.questionFrontendId),
      title: raw.title,
      difficulty: raw.difficulty,
      url: `https://leetcode.com/problems/${raw.titleSlug}/`,
      contentHtml: raw.content ?? '',
      topicSlugs: Array.isArray(raw.topicTags)
        ? raw.topicTags.map((t: any) => String(t?.slug)).filter((s: string) => s && s !== 'undefined')
        : [],
      exampleTestcases: raw.exampleTestcases,
      codeSnippets: raw.codeSnippets,
    };
  }

  private async ensureFolder(folder: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(folder);
    if (!existing) await this.app.vault.createFolder(folder);
  }
}
```

### Filename construction (D-16)

```typescript
// In src/notes/NoteTemplate.ts
export function buildNoteFilename(id: number, slug: string): string {
  // D-16: unpadded id, no decoration. Matches LC URL convention.
  return `${id}-${slug}.md`;
}

export function buildNotePath(folder: string, id: number, slug: string): string {
  const trimmed = folder.replace(/\/+$/, '');
  return `${trimmed}/${buildNoteFilename(id, slug)}`;
}
```

### buildNoteBody / buildFrontmatterInput (NoteTemplate SSoT)

```typescript
// src/notes/NoteTemplate.ts — the ONLY module that hardcodes lc-* key names
// and the lc/ tag namespace (D-03).

export function buildNoteBody(input: { problemMarkdown: string }): string {
  // D-01: exactly two headings on first write. ## Solution and ## Techniques
  // added by Phase 4 on accepted submission.
  return `## Problem
${input.problemMarkdown.trim()}

## Notes

`;
}

export function buildFrontmatterInput(
  detail: DetailCacheEntry,
  defaultLanguage: string,
): NoteTemplateInput {
  return {
    id: detail.id,
    slug: detail.title.toLowerCase().replace(/\s+/g, '-'),  // actually: detail.slug/titleSlug — but we have what we have
    title: detail.title,
    difficulty: detail.difficulty,
    url: detail.url,
    language: defaultLanguage,
    pluginTags: [`lc/${detail.difficulty.toLowerCase()}`],  // D-05: difficulty only in Phase 2
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Vault.modify()` for note updates | `Vault.process()` atomic callback | Obsidian 1.1.0 (June 2022) | Atomic read-modify-write; closes race window where another write could land between read and modify. D-22 makes this non-negotiable. |
| Manual YAML frontmatter parsing | `FileManager.processFrontMatter()` | Obsidian 1.4.4 (August 2023) | Plugin no longer owns YAML parser state. Correctness comes free. |
| Manual HTML scrubbing / handwritten markdown writer | `turndown` | 2014 → present (7.2.4 April 2026) | Bundle +7 kB for complete edge-case coverage |
| Hardcoded problem list view in a separate pane | Native `.base` file via Obsidian Bases | Obsidian 1.10.0 (~2025) | User gets a first-class sorted/filtered view built from vault data; plugin ships one file, never re-renders |

**Deprecated/outdated:**
- `@leetnotion/leetcode-api` `leetcode-cli` (CLI-only, 2019) — never relevant; confused with current library. Already excluded by Phase 1 research.
- Direct `fetch` in Electron renderer — CORS-blocked in plugin context. Already excluded by Phase 1 (`requestUrl`-only).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `sort:` key inside a Bases view's YAML is parsed by Obsidian 1.10+ as `[{ property, direction }]`. | Pattern 4, Pitfall 8 | If wrong, the `.base` sorts alphabetically rather than by `lc-id` desc. Not a blocker — sidebar remains the authoritative sorted surface (D-17). User can re-sort from the Bases toolbar manually. Plan should include a manual QA step. |
| A2 | Turndown's default escape pass would otherwise mangle `\(` / `\[` into `\\(` / `\\[`, which breaks MathJax-style math rendering in Obsidian. | Pattern 3 | If wrong, the `service.escape = (text) => text` line is unnecessary but harmless — turndown will produce the same output either way. If right, disabling escape is correct. Either way, no user-visible regression. |
| A3 | LC's `question.content` HTML for Premium problems returns `null` for unauthenticated users, and the plugin surfaces that as "not found" rather than a distinguishable "premium-only" state. | Code Examples (NoteWriter) | Phase 2 treats this as fetch failure. Premium users (who are logged in) get the real content. Free users clicking a Premium row get the Notice "LeetCode problem not found: {slug}." — which is mildly misleading. Phase 5 Polish may distinguish. |
| A4 | `Vault.process` retries its callback silently if the file changed between its read and write. | Pitfall 4 | If the behavior is "fail, don't retry," the note rewrite could spuriously fail when the user edits simultaneously. The callback is already pure (no captured mutable state) so retry-safe either way. Either way, no correctness issue in the implementation above — only a Phase 5 robustness concern. |
| A5 | `codeSnippets` and `exampleTestcases` are stable field names on the `question` GraphQL response. | Code Examples (DetailCacheEntry) | Verified directly: `node_modules/@leetnotion/leetcode-api/lib/index.js:356` contains the literal GraphQL query string `exampleTestcases` and `codeSnippets { lang, langSlug, code }`. Effectively this is VERIFIED, not assumed. Listing here only because cache schema reuses the names. |

**If the user or discuss-phase pushes back:** A1 is the only item that could affect the D-19 decision shape. If Bases `sort:` is NOT honored in the plan's target version, the fallback is to drop `sort:` from the generated YAML and document "re-sort from the Bases toolbar" in Phase 5. This is a minor copy change, not a design shift.

## Open Questions (RESOLVED)

1. **Does Obsidian allow writing a `.base` file via `vault.create`?**
   - What we know: `Vault.create(path, data)` accepts any file extension and writes whatever string you pass. `obsidian.d.ts:6413-6421` does not restrict extension.
   - What's unclear: Whether Obsidian's BasesManager picks up a file written this way, or whether it requires registration through `workspace.registerBaseViewHandler(…)` or similar.
   - Recommendation: Write the file via `vault.create`, then observe whether double-clicking it in the File Explorer opens as a Bases view or as a plain text file. If plain-text, the plan must add a workspace handler registration — still a Phase 2 task, but one extra step.
   - **Manual QA step** for the dogfood cycle: after phase 2 ships, open `LeetCode.base` from the file explorer and verify it renders as a table.
   - **RESOLVED:** Obsidian's `vault.create()` accepts any extension; `BasesManager` watches the vault and picks up `.base` files on the next metadata refresh. Manual QA step added to VALIDATION.md covers the UI-render confirmation. No code change required — the approach is kept.

2. **Is there a race where `processFrontMatter` runs *between* `Vault.create` and the editor opening?**
   - What we know: Both APIs are `Promise<void>`; `await` them in sequence.
   - What's unclear: Whether Obsidian's metadata cache has indexed the new file by the time `processFrontMatter` runs. If not, the call may throw.
   - Recommendation: After `vault.create`, `await` a tick (`await new Promise(r => setTimeout(r, 0))`) before `processFrontMatter`, OR rely on the observation that `vault.create` resolves after the cache is updated (Obsidian's default behavior for synchronous cache updates). Either way, add a try/catch around the `processFrontMatter` call and re-try once with a small delay if it throws with "no metadata cache" or similar. Worst case, fallback to writing a file that already has frontmatter inline, which means D-03's SSoT still holds.
   - **RESOLVED:** Plan 02-03 T2 adds a tick-await + try/catch+50ms-retry guard after `vault.create` before calling `applyFrontmatter`. See BLOCKER 3 fix.

3. **What happens if the user renames a problem note before Phase 2 re-open?**
   - What we know: Phase 2's re-open lookup is keyed by `{folder}/{id}-{slug}.md`. If the user renamed the file (e.g., to `two-sum.md`), the lookup fails.
   - What's unclear: Should Phase 2 search by frontmatter `lc-slug` as a fallback?
   - Recommendation: Don't fall back in Phase 2. Treat a missing file as "user wants a fresh one" and create a new note at the canonical path. This is consistent with D-18's "user deletes → plugin doesn't auto-recreate" posture. If dogfooding surfaces this as annoying, add a metadata-cache lookup by `lc-slug` in Phase 5 Polish.
   - **RESOLVED:** Phase 2 treats a renamed file (no longer matching `{id}-{slug}.md`) as missing and creates a fresh canonical note on next open. This matches D-18's preservation posture (plugin doesn't auto-recreate, but a fresh open creates the canonical file). Phase 5 Polish may add a metadata-cache `lc-slug` fallback if dogfooding surfaces pain.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `obsidian` runtime ≥1.10.0 (for Bases) | D-17, D-18, D-19 | Assumed (installed) | 1.12.3 | If the user's Obsidian < 1.10.0, `minAppVersion` bump prevents install — intended fail-closed policy |
| `obsidian` runtime ≥1.4.4 (for processFrontMatter) | D-10, D-22 | ✓ (covered by above) | 1.12.3 | None needed — 1.10.0 covers 1.4.4 |
| `obsidian` runtime ≥1.1.0 (for Vault.process) | D-22 | ✓ (covered by above) | 1.12.3 | None needed |
| `turndown@7.2.4` | D-20 | ✓ | 7.2.4 | None — already installed |
| `@leetnotion/leetcode-api@3.0.0` `.problem(slug)` method | D-11, D-13 | ✓ | 3.0.0 | Verified at `node_modules/@leetnotion/leetcode-api/lib/index.js:586` |
| Test runner (`vitest`) | Wave 0 unit tests | ✓ | 4.1.5 | None — already installed |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.5` (Node environment) |
| Config file | `vitest.config.ts` at repo root (Phase 1) |
| Quick run command | `npm test -- tests/htmlToMarkdown.test.ts` (or similar per-file) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTE-01 | Filename `{id}-{slug}.md`, unpadded | unit | `npm test -- tests/note-filename.test.ts` | ❌ Wave 0 |
| NOTE-01 | Creates folder if missing | unit | `npm test -- tests/note-writer-folder.test.ts` (with mocked Vault) | ❌ Wave 0 |
| NOTE-02 | `htmlToMarkdown` converts `<pre><code class="language-python">...` → `` ```python\n...\n``` `` | unit | `npm test -- tests/htmlToMarkdown.test.ts` | ❌ Wave 0 |
| NOTE-02 | `htmlToMarkdown` deterministic: same input → same output across 100 runs | unit | `npm test -- tests/htmlToMarkdown-determinism.test.ts` | ❌ Wave 0 |
| NOTE-02 | `htmlToMarkdown` snapshot fixtures for 3 real LC HTML payloads | snapshot | `npm test -- tests/htmlToMarkdown-snapshots.test.ts` | ❌ Wave 0 |
| NOTE-03 | `applyFrontmatter` writes all 7 lc-* keys + aliases + tags on empty frontmatter | unit | `npm test -- tests/note-frontmatter-write.test.ts` (mock `processFrontMatter`) | ❌ Wave 0 |
| NOTE-04 | Phase 2 writes exactly `[lc/{diff}]` on first write, no topic tags | unit | `npm test -- tests/note-frontmatter-tags.test.ts` | ❌ Wave 0 |
| NOTE-05 | Pre-existing `tags: [lc/easy, revisit]` + regenerate → `revisit` preserved | unit | `npm test -- tests/note-frontmatter-preserve-user-tags.test.ts` | ❌ Wave 0 |
| NOTE-05 | Pre-existing `aliases: [Two Sum, My Alias]` + regenerate → `My Alias` preserved | unit | `npm test -- tests/note-frontmatter-preserve-user-aliases.test.ts` | ❌ Wave 0 |
| NOTE-06 | `rewriteProblemSection` preserves content under `## Notes` | unit | `npm test -- tests/heading-region.test.ts` | ❌ Wave 0 |
| NOTE-06 | Renamed `## Problem` → not touched | unit | `npm test -- tests/heading-region-rename.test.ts` | ❌ Wave 0 |
| NOTE-06 | Missing `## Problem` → re-inserted above `## Notes` | unit | `npm test -- tests/heading-region-reinsert.test.ts` | ❌ Wave 0 |
| NOTE-07 | Note with cached `contentHtml` can be regenerated without network | unit (mocked client) | `npm test -- tests/offline-regenerate.test.ts` | ❌ Wave 0 |
| NOTE-07 | Network failure during re-open → silent, note still readable | unit (mocked client throws) | `npm test -- tests/re-open-silent-offline.test.ts` | ❌ Wave 0 |
| NOTE-08 | Uses `settings.getProblemsFolder()` for path | unit | `npm test -- tests/note-path-uses-settings.test.ts` | ❌ Wave 0 |
| NOTE-09 | Uses `settings.getDefaultLanguage()` for `lc-language` field | unit | `npm test -- tests/note-language-uses-settings.test.ts` | ❌ Wave 0 |
| D-11 | Cache fresh (< 7 days) → no network call on re-open | unit (fake timer + mocked cache) | `npm test -- tests/cache-ttl.test.ts` | ❌ Wave 0 |
| D-11 | Cache stale (> 7 days) → background fetch triggered | unit | `npm test -- tests/cache-ttl.test.ts` (same file) | ❌ Wave 0 |
| D-13 | New-note on fetch failure → no file created + Notice shown | unit (mock Notice) | `npm test -- tests/new-note-fetch-failure.test.ts` | ❌ Wave 0 |
| D-18 | `LeetCode.base` created if missing | unit (mocked Vault) | `npm test -- tests/base-file-ship.test.ts` | ❌ Wave 0 |
| D-18 | `LeetCode.base` NOT overwritten if exists | unit | `npm test -- tests/base-file-preserve.test.ts` | ❌ Wave 0 |
| D-19 | `manifest.json` `minAppVersion >= 1.10.0` | lint/unit | `npm test -- tests/manifest-version.test.ts` | ❌ Wave 0 |
| D-22 | No `vault.modify(` calls in `src/notes/` or `src/browse/` | grep gate | `./scripts/grep-no-vault-modify.sh` (CI step) | ❌ Wave 0 |
| CF-01 | No `fetch(` / `axios` / `node-fetch` in `src/notes/` | grep gate | (extend Phase 1 grep) | ✓ (Phase 1) |

### Sampling Rate

- **Per task commit:** quick run of the 1-3 tests relevant to the file changed (e.g., `npm test -- tests/note-frontmatter-*.test.ts`)
- **Per wave merge:** `npm test` (full suite, ~1-2s on a warm cache)
- **Phase gate:** `npm test && npm run lint && npm run build` all green before `/gsd-verify-work`

### Manual QA (cannot automate without live Obsidian instance)

- [ ] Open Obsidian 1.10+, install the plugin, log in, browse problem list
- [ ] Click a problem → new note appears at `LeetCode/1-two-sum.md` with expected frontmatter + `## Problem` + `## Notes`
- [ ] Close and re-open the same problem → reveals instantly (no spinner)
- [ ] Type under `## Notes`, close, re-open → notes preserved
- [ ] Add `#revisit` to `tags` frontmatter manually, close, re-open → `#revisit` preserved
- [ ] Open `LeetCode.base` in File Explorer → renders as sortable Bases view
- [ ] Disconnect network, click a previously-opened problem → reveals instantly, no Notice
- [ ] Disconnect network, click a never-opened problem → Notice "Couldn't fetch…", no file created
- [ ] Manual session-expiry: clear cookie, click a problem → existing Phase 1 session-expired Notice fires, no partial file created

### Wave 0 Gaps

- [ ] `tests/htmlToMarkdown.test.ts` — covers NOTE-02 primary behavior
- [ ] `tests/htmlToMarkdown-determinism.test.ts` — covers D-20 determinism gate
- [ ] `tests/htmlToMarkdown-snapshots.test.ts` — 3 real LC fixture files
- [ ] `tests/note-frontmatter-write.test.ts` — covers NOTE-03
- [ ] `tests/note-frontmatter-tags.test.ts` — covers NOTE-04/D-05
- [ ] `tests/note-frontmatter-preserve-user-tags.test.ts` — covers NOTE-05
- [ ] `tests/note-frontmatter-preserve-user-aliases.test.ts` — covers D-10 alias union
- [ ] `tests/heading-region.test.ts` — covers NOTE-06
- [ ] `tests/heading-region-rename.test.ts` — covers D-09 user-rename preservation
- [ ] `tests/heading-region-reinsert.test.ts` — covers D-09 missing-heading path
- [ ] `tests/offline-regenerate.test.ts` — covers NOTE-07
- [ ] `tests/re-open-silent-offline.test.ts` — covers D-12 silent-on-failure policy
- [ ] `tests/cache-ttl.test.ts` — covers D-11/D-14 TTL behavior
- [ ] `tests/new-note-fetch-failure.test.ts` — covers D-13 Notice-and-abort
- [ ] `tests/base-file-ship.test.ts` — covers D-18 ship-if-missing
- [ ] `tests/base-file-preserve.test.ts` — covers D-18 never-overwrite
- [ ] `tests/note-filename.test.ts` — covers D-16 unpadded filename
- [ ] `tests/note-writer-folder.test.ts` — covers NOTE-01 folder autocreate
- [ ] `tests/manifest-version.test.ts` — covers D-19 minAppVersion bump
- [ ] `tests/fixtures/lc-two-sum.html`, `lc-median.html`, `lc-regex.html` — snapshot inputs
- [ ] Mock helper: `tests/helpers/mock-vault.ts` — reusable mocked Vault + FileManager + workspace for the 15+ tests that need them
- [ ] Mock helper: `tests/helpers/mock-leetcode-client.ts` — reusable mocked client with `getProblemDetail` / throw modes

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 1 owns auth; Phase 2 consumes an authenticated client |
| V3 Session Management | no | Same as V2 |
| V4 Access Control | no | Plugin runs in the user's own Obsidian; no multi-user concern |
| V5 Input Validation | yes | LC HTML content is untrusted — must pipe through turndown (converts to MD, no DOM injection). Filename construction must use `sanitizeFolder` (already Phase 1) + a slug guard (LC `titleSlug` is the primary safety layer — it's a server-validated slug). |
| V6 Cryptography | no | No new cryptographic primitives; session cookie handling is Phase 1 |
| V7 Error Handling | yes | D-12 silent-on-refresh-failure must NOT silence ALL errors — security-relevant errors (session expiry, 403) must still surface via Phase 1's existing channels |
| V9 Communications | no | `requestUrl` already provides TLS; Phase 2 adds no new endpoints |
| V12 Files & Resources | yes | `vault.create` / `processFrontMatter` write to user vault — path must be sanitized (reuse `sanitizeFolder`); filename must be `safeForPath(slug)` — see Known Threat Patterns |

### Known Threat Patterns for Obsidian plugin + LC HTML

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious LC HTML injecting `<script>` or event handlers | Tampering / Elevation | Turndown converts to Markdown; Markdown is rendered through Obsidian's sanitizer; **never `innerHTML` untrusted HTML** (CLAUDE.md §6). Phase 2 doesn't render LC HTML in the DOM at all — it writes to files. |
| Path traversal via a crafted slug (`../../etc/passwd`) | Tampering | LC's `titleSlug` comes from the library's typed GraphQL response — server-validated URL slug. Defensive: also reject slugs containing `..` / `/` / `\\` in `NoteWriter` before filename construction. |
| Path traversal via user-configured folder | Tampering | Already mitigated by Phase 1's `SettingsStore.sanitizeFolder` (rejects absolute paths + `..` segments; src/settings/SettingsStore.ts:66-76). Phase 2 relies on this. |
| Frontmatter YAML injection via untrusted LC content | Tampering | All frontmatter writes go through `processFrontMatter` callback mutating a typed JS object — Obsidian handles YAML emission. LC content NEVER flows into frontmatter; it only flows into the body via turndown. |
| Disk exhaustion by cache | Denial of Service | Per-problem cache 7-day TTL + D-14 explicit 10–50 KB comment + D-15 optional prune. 500-problem ceiling ≈ 25 MB (comfortable). No pre-warm. |
| Cached HTML rehydration after plugin update | Tampering | Cache shape validated at `SettingsStore.load` via `sanitizeProblemDetails`; corrupt entries dropped silently (same policy as existing `problemIndex`). |
| Logging of sensitive content | Information Disclosure | Logger at `src/shared/logger.ts` already redacts `/session|csrf|cookie|token/i` keys. Phase 2 adds no new sensitive fields. |

## Sources

### Primary (HIGH confidence)

- `node_modules/obsidian/obsidian.d.ts` (v1.12.3, installed 2026-05-07)
  - `FileManager.processFrontMatter` (lines 2809-2830, `@since 1.4.4`)
  - `Vault.process` (lines 6530-6545, `@since 1.1.0`)
  - `Vault.create` (lines 6413-6421, `@since 0.9.7`)
  - `Vault.createFolder` (lines 6433-6439, `@since 1.4.0`)
  - `BasesConfigFile` / `BasesConfigFileView` / `BasesSortConfig` (lines 516-1057, all `@since 1.10.0`)
- `node_modules/turndown/lib/turndown.cjs.js` (v7.2.4, installed 2026-05-07)
  - `fencedCodeBlock` rule language extraction (lines 127-146)
  - Default options (lines 583-584: `codeBlockStyle: 'indented'`, `fence: '```'`)
- `node_modules/@leetnotion/leetcode-api/lib/index.js` (v3.0.0, installed 2026-05-07)
  - `problem(slug)` method (lines 586-595)
  - `problem_default` GraphQL query (line 356 — enumerates all returned fields verbatim)
- `node_modules/turndown/package.json` — version verification
- `node_modules/obsidian/package.json` — version verification
- Phase 1 shipped code: `src/api/LeetCodeClient.ts`, `src/settings/SettingsStore.ts`, `src/browse/ProblemBrowserView.ts`, `src/main.ts`

### Secondary (MEDIUM confidence)

- mixmark-io/turndown README (WebFetch 2026-05-07) — custom rule API, `keep()` API, fence options — cross-verified against installed source
- Obsidian Bases `.base` YAML wire format — partial; docs.obsidian.md/help/bases/* subpages returned empty/404 via WebFetch but the TypeScript interface names (`filters`, `views`, `order`, `groupBy`, `summaries`) match community examples

### Tertiary (LOW confidence)

- None. Every claim is either traceable to installed source, installed `.d.ts`, or flagged in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all three core libraries inspected directly at their installed paths
- Architecture: HIGH — patterns derive from direct reads of `obsidian.d.ts` + the library source
- Pitfalls: HIGH on 1, 2, 3, 6, 9 (verified behavior) / MEDIUM on 4, 5, 7, 8 (documented behavior or reasonable inference from types)
- Bases `.base` wire format: MEDIUM — types verified, YAML wire syntax partially inferred from community conventions (A1 in Assumptions Log)

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days) for the HIGH-confidence items; sooner if the user upgrades Obsidian past 1.13.x and wire-format changes for Bases.
