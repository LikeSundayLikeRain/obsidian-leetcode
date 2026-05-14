# Phase 4: Knowledge Graph Wiring - Research

**Researched:** 2026-05-09
**Domain:** Obsidian vault-write orchestration + LC submission-history REST + union-merge list-item primitive
**Confidence:** HIGH (Obsidian APIs + @leetnotion source verified locally); MEDIUM (LC submission-history live endpoint — verified against @leetnotion 3.0.0 source, not reconfirmed against live LC)

## Summary

Phase 4 wires an on-AC write pipeline that touches four surfaces of the active problem note (frontmatter, ## Techniques body, tag set, stub technique files) and ships two new LC-backed read surfaces (submission picker + detail viewer). All of the Obsidian APIs and patterns needed exist in the already-pinned versions (`obsidian@1.12.3`, `@leetnotion/leetcode-api@3.0.0`) — **no new dependencies required**. The most important factual finding: `@leetnotion/leetcode-api@3.0.0` already exposes the three submission-history methods (`submissions({limit, offset})`, `submission(id)`, plus an undocumented-but-public `restRequest('/api/submissions/{slug}')` pattern visible in the package source). This resolves D-27 directly — the plugin can hit LC's REST surface without hand-rolling GraphQL.

The union-merge primitive for `## Techniques` (D-13) has no direct ecosystem precedent in Obsidian-land — it's a bespoke, slightly-richer variant of the CaseRegion parse-items-and-merge pattern Phase 3 shipped. The bulk of the implementation risk is in: (a) correct union-merge semantics when users edit the list, (b) `processFrontMatter` array mutation (confirmed — does NOT auto-union, callback must do it — pattern already used in `NoteTemplate.applyFrontmatter`), and (c) DST-boundary ISO-8601 formatting (verified — native `Date.getTimezoneOffset()` handles DST correctly).

**Primary recommendation:** Build a new `src/graph/` folder. Within it: (1) a `SubmissionHistoryClient` that uses `throttledRequestUrl` against `GET /api/submissions/{slug}` for the list, and `GET /submissions/detail/{id}/` + HTML-scrape for the per-row code (mirroring `@leetnotion`'s own approach). (2) A pure `mergeTechniquesSection` that extends Phase 3's `CaseRegion` parse-items pattern to list-item granularity. (3) A `KnowledgeGraphWriter` service wired into `main.ts`'s `submitFromActive` lambda at the AC branch — NOT inside `SubmissionOrchestrator` (per D-08 separation-of-concerns). (4) Stub creation via `vault.create` with try/catch on "already exists" conflict + `vault.createFolder` guarded by an `getAbstractFileByPath` pre-check.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Frontmatter update on AC | Obsidian API (FileManager) | — | `fileManager.processFrontMatter()` is the sanctioned atomic-write path; same tier as Phase 2's `applyFrontmatter` |
| Topic-tag union-merge | Obsidian API (FileManager) | Plugin logic | Union logic in callback (Phase 2 D-10 pattern); Obsidian owns the write |
| `## Techniques` body write | Obsidian API (Vault) | Pure string transform | `vault.process()` is sanctioned; `mergeTechniquesSection` is pure — testable without Obsidian |
| Stub technique file creation | Obsidian API (Vault) | Plugin logic | `vault.create()` is sanctioned for new files; conflict handling in wrapper |
| Techniques folder creation | Obsidian API (Vault) | Plugin logic | `vault.createFolder()` + pre-check via `getAbstractFileByPath` |
| Submission list fetch | LC REST | `throttledRequestUrl` | Route via existing throttle pipe (CF-01); no new HTTP stack |
| Submission detail fetch | LC REST | `throttledRequestUrl` | Same — lazy per-row fetch on picker row-click |
| Submission picker UI | Obsidian API (Modal) | `createEl` | CF-07 discipline; reuse VerdictModal's class-scoped CSS convention |
| Submission detail viewer | Obsidian API (Modal + MarkdownRenderer) | `createEl` | `MarkdownRenderer.render` for the code-fence rendering (CM6 highlighting free) |
| Date formatting (ISO-8601 local-tz) | Pure TS helper | Native `Date` | No third-party library needed; `getTimezoneOffset` is DST-aware |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `obsidian` (types + runtime API) | `1.12.3` (pinned in package.json) [VERIFIED: local node_modules/obsidian/package.json] | Modal, Vault, FileManager, MarkdownRenderer, setIcon | Already present; no version change required |
| `@leetnotion/leetcode-api` | `3.0.0` (pinned in package.json) [VERIFIED: local node_modules/@leetnotion/leetcode-api/package.json] | `submissions({limit, offset})`, `submission(id)`, and internal `restRequest('/api/submissions/{slug}')` endpoint pattern | Already present; exposes all three submission-history surfaces natively [VERIFIED: grep of lib/index.d.ts lines 849/862/876, lib/index.cjs line 2125] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new libs needed | — | — | The union-merge transform is a pure string helper; the ISO-8601 formatter is a pure TS helper (≈15 lines); submission-history fetcher is a hand-rolled REST wrapper on the existing `throttledRequestUrl` pipe — matches the Phase 3 leetcodeRest.ts pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `/api/submissions/{slug}` REST | `leetcode.submissions({slug})` from `@leetnotion` | `@leetnotion` method signature accepts `slug` only in the type but its IMPLEMENTATION ignores it and paginates ALL submissions (grep of `lib/index.cjs` lines 506-555 confirms `slug` is destructured but unused in the URL). The separate internal `submissionsOfProblem(slug)` method in `LeetCodeCLI` subclass (grep `lib/index.cjs:2123-2131`) hits `GET /api/submissions/{slug}` correctly — but it's on a subclass, not the base `LeetCode` class the plugin uses. Hand-rolling the endpoint is simpler than instantiating `LeetCodeCLI` |
| `MarkdownRenderer.render` for code-block rendering in detail modal | Raw `createEl('pre')` + `setText(code)` | `MarkdownRenderer.render` gives free syntax highlighting via Obsidian's own CM6 pipeline. Raw pre is faster + no CM6 dependency but loses highlighting. Author's stated experience goal (LC-parity in look-and-feel) argues for the former |
| Native `Date` + manual offset format | `date-fns-tz` or `luxon` | Adding a date library for 15 lines of TS is overkill. CLAUDE.md discourages new deps |
| Grep-based `## Techniques` section detection | Regenerate via a Markdown AST walker (`remark`, `unified`) | Same as Phase 2 D-09 / Phase 3 CaseRegion — line-scan-for-H2 is proven; AST walker is heavier and buys nothing for this shape |

**Installation:** No new installs required. All dependencies already in `package.json`.

**Version verification (2026-05-09):**
- `obsidian@1.12.3` — installed, pinned (npm registry current: 1.12.3) [VERIFIED: `npm view obsidian version` → 1.12.3]
- `@leetnotion/leetcode-api@3.0.0` — installed, pinned (published 2026-04-03) [VERIFIED: `npm view @leetnotion/leetcode-api version` → 3.0.0]
- `turndown@7.2.4` — installed, not used by Phase 4
- `vitest@4.1.5` — installed, used by Phase 4 tests

## User Constraints

Copied from `04-CONTEXT.md`. Locked; planner honors verbatim.

### Locked Decisions (from CONTEXT.md `<decisions>`)

**Submission History & `## Code` (revised GRAPH-01):**
- **D-01:** No `## Solution` heading is created. Revises ROADMAP Phase 4 success criterion 1. Code stays in `## Code` (Phase 3); AC history on LC's servers; picker fetches on demand.
- **D-02:** On note open, refetch BOTH problem detail (7-day TTL unchanged) AND submission history (always live, no TTL). Silent-fail posture carries from Phase 2 D-12.
- **D-03:** `LeetCode: View past submissions` command added to Phase 3's command set. `editorCheckCallback` gated on `lc-slug`. Opens `SubmissionPickerModal`.
- **D-04:** `SubmissionDetailModal` — read-only. Title: `<status> · <problem title>`. Metadata row. Code fenced via `MarkdownRenderer.render`. Footer: `Copy to ## Code` (primary, confirms overwrite) + `Close`.
- **D-05:** Picker populates ALL submissions (AC + WA + TLE + CE + RE + MLE). Verdict chip. Most recent first. No filter toggle.
- **D-06:** Session-expiry → existing locked Notice + close modal. Empty array → "No submissions yet." placeholder. 4xx/5xx → inline in modal (NOT Notice).
- **D-07:** No submission-history persistence. Each picker invocation hits LC live.

**On-AC Write Pipeline:**
- **D-08:** Single entry point `KnowledgeGraphWriter.onAccepted(ctx, checkResponse)`. Called from `main.ts`'s `submitFromActive` lambda — NOT inside `SubmissionOrchestrator`.
- **D-09:** One atomic-per-concern pass. Sequence: (1) `processFrontMatter` — all 5 lc-* keys + union tags; (2) `vault.process` — `## Techniques` region; (3) `vault.create` loop — stubs. Steps 2 and 3 gated by opt-out. Step 1 always fires on AC.
- **D-10:** Frontmatter field shapes: `lc-status: accepted`, `lc-solved-date: ISO-8601 local-tz`, `lc-runtime-ms: number`, `lc-memory-mb: number`, `lc-language: string` (LC `langSlug`). `toIsoLocalTz(date)` helper. Parse `"12 ms"` via `parseInt`; `"14.2 MB"` via `parseFloat`; undefined on parse failure (write status + date regardless).
- **D-11:** Topic tags — first-AC union-merge with `lc/{topic-slug}`. Source: `problemDetails[slug].topicSlugs` (Phase 2 cache).
- **D-12:** `## Techniques` body — bulleted `[[<topicTag.name>]]` wikilinks. Display name = LC's `topicTags[].name` verbatim. Ordering = LC's natural order (no alphabetical sort). **`DetailCacheEntry` extended with `topicTags: Array<{name, slug}>` — backward-compat via shape-guard.**
- **D-13:** `## Techniques` union-merge — new primitive `src/graph/mergeTechniquesSection.ts` (pure string transform). Preserve user-added lines in their original relative position. No sentinel markers (rejected, matches Phase 2 D-08).
- **D-14:** Insertion point: after `## Notes`; final anchor order `## Problem → ## Code → ## Notes → ## Techniques → ## Custom Tests`.

**Stub Technique Notes:**
- **D-15:** Stub folder: `{problemsFolder}/Techniques/` (derived, no new setting). Folder auto-created via `vault.createFolder`.
- **D-16:** Stub shape — frontmatter-only body: `lc-technique: <slug>`, `aliases: [<name>]`, `tags: [lc/technique/<slug>]`. Empty body.
- **D-17:** Stub filename `{topicTag.name}.md`; normalize `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` to `-`.
- **D-18:** Never-overwrite. Stub exists → no-op. Stub missing → create; silent-fail on conflict. If user deletes stub → re-create (divergence from Phase 2 BaseFile pattern).
- **D-19:** Stub creation NOT atomic with on-AC write. `processFrontMatter` → `vault.process(## Techniques)` → per-stub `vault.create` loop. Per-stub failure = debug log; no Notice.

**Opt-Out (GRAPH-05):**
- **D-20:** Opt-out scope = skip `## Techniques` body + skip stub creation; keep `lc/{topic-slug}` frontmatter tags.
- **D-21:** Flag `autoBacklinksEnabled: boolean`, default `true`. New field in `PluginData` + shape-guard + getter/setter.
- **D-22:** No first-run prompt modal.

**Unknown Verdict + Edge Cases:**
- **D-23:** Unknown verdicts do NOT fire on-AC pipeline. Only `classifyStatus(terminal.status_code) === 'accepted'` (note: `kind === 'ac'` in Phase 3's statusMap).
- **D-24:** Re-accepted — all 5 writes re-fire. Frontmatter reflects most recent AC, not best-ever.
- **D-25:** Problem without topic tags — frontmatter fires; D-11/D-12/stubs skip.
- **D-26:** Opt-out toggled ON after existing writes — existing sections NOT removed. Go-forward setting.

**REST / API Mechanics:**
- **D-27:** Submission-history endpoint — P0 research (RESOLVED BELOW).
- **D-28:** All requests via `throttledRequestUrl`.
- **D-29:** Headers identical to Phase 3 REST (cookie, referer to `/problems/{slug}/description/`, x-csrftoken, x-requested-with, user-agent).

### Claude's Discretion (from CONTEXT.md)

- Exact module layout under `src/graph/` (recommend: `KnowledgeGraphWriter.ts`, `mergeTechniquesSection.ts`, `StubNoteCreator.ts`, `submissionHistoryClient.ts`, `SubmissionPickerModal.ts`, `SubmissionDetailModal.ts`, `dateFormat.ts`). Planner may split/collapse — recommend flat layout per Phase 3 convention.
- `KnowledgeGraphWriter` singleton vs per-invocation factory — **RECOMMEND singleton** (matches Phase 3 `SubmissionOrchestrator` shape, simplifies opt-out flag access).
- Per-row submission detail fetch: on-hover prefetch vs on-click only — **RECOMMEND on-click** (simpler, respects throttle).
- Picker row rendering via `createEl` with class-scoped `.leetcode-verdict-*` CSS classes — reuse existing `.leetcode-verdict-ac` etc.
- `SubmissionDetailModal` code rendering via `MarkdownRenderer.render(app, '```' + lang + '\n' + code + '\n```', el, '', plugin)` — **CONFIRMED valid API signature** (see Code Examples).
- Confirm-overwrite dialog: native `confirm()` vs Obsidian-styled modal — **RECOMMEND Obsidian-styled** (consistent chrome per CF-07).
- Date-only `lc-solved-date` format — **RECOMMEND single ISO-8601 source** (defer Dataview-friendly shortening to Phase 5 if user demand emerges).
- CSS class naming — follow `.leetcode-*` convention (Phase 1 locked).
- Stub frontmatter via `processFrontMatter` after create vs embedded in `vault.create` body string — **RECOMMEND embedded-in-body** (single I/O, stub is complete on one hop; matches atomicity invariant).

### Deferred Ideas (OUT OF SCOPE for Phase 4)

- Chevron/dropdown navigator overlay on `## Code` → Phase 5 Polish
- Stale-detect "insert fresh block if last AC > X days" → dropped entirely
- Submission-history cache in `data.json` → rejected (D-07); candidate for Phase 5 LRU
- Diff view in `SubmissionDetailModal` → Phase 5 Polish
- Filter toggle in picker (Accepted-only) → Phase 5 Polish
- First-run prompt modal → rejected (D-22)
- Settings UI control for `autoBacklinksEnabled` → Phase 5 POLISH-01
- Settings UI control for techniques folder override → rejected (D-15)
- Retroactive opt-out cleanup → Phase 5 (optional "Strip all technique sections" command)
- Removing wikilinks when LC drops a topic tag → rejected (D-26)
- Bases-file schema update for new columns → Phase 5 Polish
- Per-row submission prefetch on hover → rejected (D-28)
- Submission-history export → v2
- "Was this submission in streak N?" → v2 (SR-01..03)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 (revised per D-01) | No `## Solution` append. On-AC frontmatter writes via `fileManager.processFrontMatter`; atomic within. | Obsidian `FileManager.processFrontMatter` [VERIFIED: obsidian.d.ts:2830]; Phase 2 pattern in `NoteTemplate.applyFrontmatter` |
| GRAPH-02 | Frontmatter fields `lc-status`, `lc-solved-date`, `lc-runtime-ms`, `lc-memory-mb`, `lc-language` updated on AC. | `PLUGIN_LC_KEYS` tuple already includes these (Phase 2 D-03 lock). `lc-solved-date` ISO-8601 local-tz format via native Date. [VERIFIED: src/notes/NoteTemplate.ts:25-33] |
| GRAPH-03 | `[[Technique Name]]` wikilinks under `## Techniques`, one per LC topic tag. | Union-merge primitive via `mergeTechniquesSection` (new); source from `DetailCacheEntry.topicTags` (new optional field). Wikilink resolution via `aliases` in stub frontmatter — confirmed by Obsidian internal-link docs. [VERIFIED: obsidian.d.ts MetadataCache.getFirstLinkpathDest] |
| GRAPH-04 | Stub technique notes in `Techniques/` folder; never overwritten once created. | `vault.create()` [VERIFIED: obsidian.d.ts:6421 `@throws Error if file already exists`]; `vault.createFolder()` [VERIFIED: obsidian.d.ts:6439 `@throws Error if folder already exists`]; guard with `getAbstractFileByPath` pre-check + try/catch on create |
| GRAPH-05 | Opt-out setting skips `## Techniques` + stubs; frontmatter + lc/-tag writes unaffected. | New `autoBacklinksEnabled: boolean` field in `PluginData` + shape-guard. Field added in Phase 4; UI control in Phase 5 POLISH-01 |

## Architecture Patterns

### System Architecture Diagram

```
                                     (user invokes Submit command)
                                                 │
                                                 ▼
                     main.ts::submitFromActive ─────► SubmissionOrchestrator.submit()
                                                 │         │
                                                 │         ├─ POST /problems/{slug}/submit/
                                                 │         ├─ poll /submissions/detail/{id}/check/
                                                 │         └─ returns terminal CheckResponse (sniffed off fetcher)
                                                 │
                                                 ▼
                      classifyStatus(terminal.status_code) === 'ac' ?
                                   ┌───────────────┴───────────────┐
                                   │ YES (Accepted)                │ NO (WA/TLE/MLE/CE/RE/Unknown)
                                   ▼                               ▼
                 ┌─────────────────────────────────────┐     verdictModal.renderVerdict(...)
                 │ KnowledgeGraphWriter.onAccepted(    │     (Phase 3 handles; Phase 4 ends here)
                 │   ctx, terminal)                    │
                 └─────────────────────────────────────┘
                                   │
                                   ▼
                  ┌──── Step 1 (always fires) ────┐
                  │ fileManager.processFrontMatter │──► 5 lc-* keys + union-merge tags
                  └────────────────────────────────┘       (incl. lc/{topic-slug})
                                   │
                                   ▼
                  autoBacklinksEnabled ?
                    ┌──────────────┴──────────────┐
                    │ YES                         │ NO → end
                    ▼                             │
    ┌── Step 2 ────────────────────────────┐      │
    │ vault.process(file, (current) =>      │      │
    │   mergeTechniquesSection(current,     │      │
    │     detail.topicTags))                │      │
    └───────────────────────────────────────┘      │
                    │                              │
                    ▼                              │
    ┌── Step 3 (non-atomic loop) ───────────┐      │
    │ for each wikilink w/o resolved target:│      │
    │   vault.createFolder({tech folder})?  │      │
    │   vault.create(stub path, body)       │      │
    │   (try/catch "already exists" → no-op)│      │
    └───────────────────────────────────────┘      │
                    │                              │
                    ▼                              │
                 (done; no Notice)                 │
                                                   ▼
─── Independent surface: `LeetCode: View past submissions` command ────
  (editorCheckCallback on lc-slug)
        │
        ▼
  SubmissionHistoryClient.listForSlug(slug)  ──► GET /api/submissions/{slug}
        │                                          (or /api/submissions/?question_slug=…)
        ▼
  SubmissionPickerModal (createEl-built, row per submission, verdict chips)
        │ (row click)
        ▼
  SubmissionHistoryClient.detail(id)  ──► GET /submissions/detail/{id}/ (HTML scrape)
        │
        ▼
  SubmissionDetailModal (MarkdownRenderer.render for code block)
        │ (Copy to ## Code click + confirm)
        ▼
  confirmOverwriteModal → vault.process(file, rewriteCodeBlockWith(submittedCode, lang))
```

### Recommended Project Structure

```
src/
├── graph/                           # NEW — Phase 4 sibling to src/solve/, src/notes/
│   ├── KnowledgeGraphWriter.ts      # on-AC orchestrator; 4-step pipeline (D-08, D-09)
│   ├── mergeTechniquesSection.ts    # PURE — union-merge list-item transform (D-13)
│   ├── StubNoteCreator.ts           # per-stub vault.create loop + folder guard (D-15, D-18)
│   ├── submissionHistoryClient.ts   # REST wrapper for list + detail fetch (D-27, D-29)
│   ├── SubmissionPickerModal.ts     # picker UI (D-03, D-05)
│   ├── SubmissionDetailModal.ts     # read-only viewer + Copy-to-Code (D-04)
│   └── dateFormat.ts                # toIsoLocalTz(date: Date): string (D-10)
├── notes/
│   └── NoteTemplate.ts              # EXTEND — add TECHNIQUES_HEADING_LINE + buildTechniquesBlock
├── settings/
│   └── SettingsStore.ts             # EXTEND — add autoBacklinksEnabled + topicTags in DetailCacheEntry
├── solve/
│   └── submissionOrchestrator.ts    # UNTOUCHED (D-08)
└── main.ts                          # EXTEND — register KnowledgeGraphWriter + view-past-submissions command
tests/
├── graph/                           # NEW — Phase 4 tests
│   ├── KnowledgeGraphWriter.test.ts
│   ├── mergeTechniquesSection.test.ts
│   ├── StubNoteCreator.test.ts
│   ├── submissionHistoryClient.test.ts
│   ├── SubmissionPickerModal.test.ts
│   ├── SubmissionDetailModal.test.ts
│   └── dateFormat.test.ts
└── fixtures/lc-submissions/         # NEW — live-captured picker fixtures
    ├── list-many.json               # typical 20-item list
    ├── list-empty.json              # zero submissions (shows placeholder)
    ├── detail-ac.json               # AC detail with code + percentiles
    └── detail-wa.json               # WA detail (input_formatted + expected_output)
```

### Pattern 1: Union-merge inside `processFrontMatter` callback (critical)

**What:** `FileManager.processFrontMatter` does NOT auto-union arrays. Reassigning `fm.tags = [...]` REPLACES the whole array. Any union logic MUST live in the callback. This is already the pattern in `src/notes/NoteTemplate.ts::applyFrontmatter` (Phase 2 D-10) — Phase 4 extends the tag-union set to include `lc/{topic-slug}`.

**When to use:** Every frontmatter write where user tags / aliases must survive.

**Example:**
```typescript
// Source: src/notes/NoteTemplate.ts:205-244 (Phase 2 pattern, Phase 4 extends)
await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
  // 1. Plugin-owned lc-* keys — overwrite every pass (with D-04 non-downgrade guard)
  fm['lc-id'] = input.id;
  fm['lc-solved-date'] = toIsoLocalTz(new Date());  // Phase 4 new
  fm['lc-runtime-ms'] = runtimeMs;                   // Phase 4 new
  fm['lc-memory-mb'] = memoryMb;                     // Phase 4 new
  fm['lc-language'] = input.languageFromSubmission;  // Phase 4 overwrites with submitted lang

  // Non-downgrade on lc-status — existing 'accepted' never clobbered (Phase 2 GAP-2a)
  const existingStatus = fm['lc-status'];
  if (typeof existingStatus !== 'string' || existingStatus === '' || existingStatus === 'untouched') {
    fm['lc-status'] = 'accepted';  // Phase 4 upgrade path
  } else {
    fm['lc-status'] = 'accepted';  // Phase 4 D-24: always upgrade to accepted on AC
  }

  // 2. tags — UNION of plugin's current-pass set + existing
  const priorTags = Array.isArray(fm.tags)
    ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const pluginTags = [
    `lc/${input.difficulty.toLowerCase()}`,     // Phase 2 carried
    ...input.topicSlugs.map((s) => `lc/${s}`),  // Phase 4 NEW — includes topic slugs
  ];
  fm.tags = Array.from(new Set<string>([...priorTags, ...pluginTags]));

  // 3. aliases — union as Phase 2
});
```

### Pattern 2: `vault.process` + pure string transform (carried from Phase 2/3)

**What:** `vault.process(file, (current) => newBody)` is atomic and retry-safe. Callback MUST be pure (same input → same output) because Obsidian may retry on write conflict.

**When to use:** Any non-frontmatter body mutation. Phase 4 uses this for the `## Techniques` region rewrite.

**Example:**
```typescript
// Source: src/notes/HeadingRegion.ts + src/solve/CaseRegion.ts pattern
import { mergeTechniquesSection } from './mergeTechniquesSection';
await app.vault.process(file, (current) =>
  mergeTechniquesSection(current, detail.topicTags),
);
```

### Pattern 3: Union-merge within a plugin-owned H2 region (new primitive)

**What:** The list-item merge algorithm for `## Techniques`. Semantics:
- Plugin-derived links = `{ [[<topicTag.name>]] | topicTag in detail.topicTags }`
- Parse the region into typed items: `{ type: 'link', target: string, bullet: string } | { type: 'free', content: string }`
- Missing plugin links appended at end of the region's link-run
- User-added lines (non-link or link to non-current-topic) preserved in-place
- Invariant: plugin-derived links present exactly once each; user lines untouched

**When to use:** ONLY for the `## Techniques` region. `HeadingRegion` (whole-region replace) and `CaseRegion` (subheading-level merge) don't fit list-item granularity.

**Example:**
```typescript
// Source: NEW — src/graph/mergeTechniquesSection.ts (design)
// Pattern derived from src/solve/CaseRegion.ts parse-items/merge/render shape

type Item =
  | { type: 'link'; target: string; bullet: string }   // "- [[Two Pointers]]" → target="Two Pointers", bullet="-"
  | { type: 'free'; content: string };                 // any other line(s)

export function mergeTechniquesSection(
  body: string,
  topicTags: Array<{ name: string; slug: string }>,
): string {
  const lines = body.split('\n');
  const start = findSectionStart(lines);           // line index of "## Techniques"
  const pluginTargets = new Set(topicTags.map((t) => t.name));

  // If no topic tags AND no existing section → no-op (D-25)
  if (topicTags.length === 0 && start < 0) return body;

  // If section missing → append after "## Notes" (D-14)
  if (start < 0) {
    return appendNewTechniquesSection(body, topicTags);
  }

  const end = findSectionEnd(lines, start);  // next H2 or EOF
  const items = parseItems(lines, start + 1, end);

  // Track which plugin targets we saw as existing links; preserve them in-place.
  const seenTargets = new Set<string>();
  const mergedItems: Item[] = items.map((it) => {
    if (it.type === 'link' && pluginTargets.has(it.target)) {
      seenTargets.add(it.target);
    }
    return it;
  });

  // Append any plugin targets NOT already present (in LC's ordering per D-12).
  for (const tag of topicTags) {
    if (!seenTargets.has(tag.name)) {
      mergedItems.push({ type: 'link', target: tag.name, bullet: '-' });
    }
  }

  const rendered = renderSection(mergedItems);
  return spliceRegion(lines, start, end, rendered);
}

function parseItems(lines: string[], from: number, to: number): Item[] {
  // Recognize "- [[X]]", "* [[X]]", "+ [[X]]" as links (D-13 list-format tolerance);
  // anything else becomes 'free' items. Preserve blank lines as empty 'free' entries
  // so inter-link user text round-trips verbatim.
  const LINK_RE = /^([-*+])\s+\[\[([^\]]+)\]\]\s*$/;
  const out: Item[] = [];
  let freeBuf: string[] = [];
  const flushFree = () => {
    if (freeBuf.length > 0) out.push({ type: 'free', content: freeBuf.join('\n') });
    freeBuf = [];
  };
  for (let i = from; i < to; i++) {
    const m = LINK_RE.exec(lines[i] ?? '');
    if (m) {
      flushFree();
      out.push({ type: 'link', target: m[2]!, bullet: m[1]! });
    } else {
      freeBuf.push(lines[i] ?? '');
    }
  }
  flushFree();
  return out;
}
```

**Invariant for unit tests:**
- Idempotent: `merge(merge(body, tags), tags) === merge(body, tags)`
- User lines: any non-link line present in input is present in output (content equal)
- Plugin completeness: every tag in `topicTags` appears as `- [[name]]` in output
- Format stability: if input uses `*` bullets, output newly-added links use `-` (plugin's canonical form); existing `*` bullets are preserved as-is

### Pattern 4: `vault.create` with "already exists" handling (stub note creation)

**What:** `vault.create(path, body)` throws if the file exists [VERIFIED: obsidian.d.ts:6427 `@throws Error if file already exists`]. Same for `vault.createFolder` [VERIFIED: obsidian.d.ts:6435]. Guard with pre-check + try/catch.

**When to use:** Stub technique note creation. Per D-18, missing stub → create; conflict → no-op silently.

**Example:**
```typescript
// Source: NEW — src/graph/StubNoteCreator.ts (design)
// Pattern derived from src/notes/NoteWriter.ts:208-210 (folder guard)
// + Phase 2 BaseFile.ts `vault.create` never-overwrite discipline

async function ensureTechniquesFolder(app: App, folder: string): Promise<void> {
  if (app.vault.getAbstractFileByPath(folder)) return;
  try {
    await app.vault.createFolder(folder);
  } catch (err) {
    // Concurrent create by another flow → no-op; subsequent stub writes will succeed.
    logger.debug('graph.ensureTechniquesFolder: concurrent create', err);
  }
}

async function createStubIfMissing(
  app: App,
  path: string,
  body: string,
): Promise<void> {
  if (app.vault.getAbstractFileByPath(path)) return;  // D-18 never-overwrite
  try {
    await app.vault.create(path, body);
  } catch (err) {
    // Race: another flow created it between check and create. D-18: silent no-op.
    logger.debug('graph.createStubIfMissing: concurrent create', { path, err });
  }
}
```

### Pattern 5: `MarkdownRenderer.render` for code-block rendering in modal

**What:** Obsidian's sanctioned API for rendering Markdown (including syntax-highlighted code fences) inside a DOM element. `MarkdownRenderer.renderMarkdown` is deprecated [VERIFIED: obsidian.d.ts:4000 `@deprecated`]. Use `MarkdownRenderer.render(app, markdown, el, sourcePath, component)` [VERIFIED: obsidian.d.ts:4013].

**When to use:** Rendering submission code with syntax highlighting in `SubmissionDetailModal`.

**Example:**
```typescript
// Source: obsidian.d.ts:3987-4014 (MarkdownRenderer.render signature)
import { MarkdownRenderer, Modal, Component } from 'obsidian';

class SubmissionDetailModal extends Modal {
  private renderChild: Component | null = null;

  override async onOpen(): Promise<void> {
    const { contentEl } = this;
    const codeBlockEl = contentEl.createDiv({ cls: 'leetcode-submission-code' });
    const fenced = '```' + this.lang + '\n' + this.code + '\n```';
    this.renderChild = new Component();
    this.addChild(this.renderChild);  // lifecycle: disposed on close
    await MarkdownRenderer.render(
      this.app,
      fenced,
      codeBlockEl,
      '',                             // sourcePath — empty since no backing file
      this.renderChild,
    );
  }

  override onClose(): void {
    // Disposal handled by Modal.removeChild via addChild lifecycle.
    this.contentEl.empty();
  }
}
```

### Pattern 6: ISO-8601 local-tz date formatting (new helper)

**What:** Format a `Date` as `2026-05-09T14:32:01-07:00` using the host's local TZ (DST-aware).

**When to use:** `lc-solved-date` frontmatter write.

**Example:**
```typescript
// Source: NEW — src/graph/dateFormat.ts
// Native Date API; no new dep. getTimezoneOffset returns DST-correct offset
// (negative of actual offset) automatically for the specific instant.
export function toIsoLocalTz(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();   // flip sign: JS returns negative of actual offset
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = Math.floor(abs / 60), om = abs % 60;
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
    sign + pad(oh) + ':' + pad(om)
  );
}
```

**DST-boundary test case (required in tests/graph/dateFormat.test.ts):**
- Feb 1, 2026 (PST) → `...-08:00`
- Mar 9, 2026 @ 04:00am (PDT, 1 hour after spring-forward) → `...-07:00`
- Nov 2, 2026 @ 01:30am (ambiguous; JS resolves to the second occurrence by default) — assert output doesn't crash

### Anti-Patterns to Avoid

- **`innerHTML` in picker/detail modals** — User-submitted code in the detail modal is "technically their own" but untrusted strings. Phase 4 stays on `createEl` + `MarkdownRenderer.render` only (CF-07).
- **Caching submission history in `data.json`** — Rejected in D-07. Live-fetch discipline maintained.
- **`vault.modify()` anywhere** — Banned project-wide (CF-06). Grep gate in Phase 4: `grep -rE "vault\.modify\s*\(" src/graph/ --include='*.ts'` must be empty.
- **`## Solution` heading anywhere** — Rejected in D-01. Any PR proposing this is a requirements regression.
- **Sentinel HTML comments in note body** — Rejected in D-13 (and Phase 2 D-08). Ownership is heading-based + line-shape-based.
- **Pre-parsing topic-tag names for alphabetical sort** — Rejected in D-12. LC's natural order wins.
- **Polling submission history in the background** — Rejected in D-02/D-07. One refetch on note open; one fetch on picker invoke.
- **Overwriting stub technique notes** — Rejected in D-18 (and GRAPH-04). Never `vault.process` or `processFrontMatter` on an existing stub.
- **Registering the on-AC hook inside `SubmissionOrchestrator`** — Rejected in D-08. The orchestrator is state-free; vault writes belong in the command lambda's AC branch.
- **Default keyboard shortcut for `View past submissions` command** — Forbidden by CF-19 / FND-03.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frontmatter atomic write | Regex-based YAML block rewrite | `app.fileManager.processFrontMatter(file, fn)` | Obsidian parses + serializes YAML safely, handles edge cases (quoted keys, multi-line values, nested objects) that regex can't |
| Body atomic write with retry-on-conflict | `vault.read` + `vault.modify` | `app.vault.process(file, pureFn)` | Obsidian handles the conflict-retry loop; `modify` is banned project-wide (CF-06) |
| Folder creation on first stub | `fs.mkdir` or direct filesystem calls | `app.vault.createFolder(path)` | Obsidian owns the vault abstraction; bypassing causes sync conflicts with Obsidian Sync / iCloud / Syncthing. Electron's Node APIs are NOT allowed (`isDesktopOnly: true` applies to Electron features, not file APIs) |
| Code syntax highlighting in modal | `highlight.js` or `prism` | `MarkdownRenderer.render(app, '```lang\ncode\n```', el, '', component)` | Obsidian already ships Prism-based highlighting through the same pipeline the editor uses; zero bundle cost |
| ISO-8601 local-tz formatting | `date-fns-tz` or `luxon` | Native `Date.getTimezoneOffset()` + `toIsoLocalTz` helper | Native API is DST-aware; 15-line helper vs 300+ KB new dep |
| LC submission list fetch (paginated) | Manual cursor/offset loop | `@leetnotion/leetcode-api@3.0.0`'s `submissions({limit, offset})` method OR hand-rolled `GET /api/submissions/{slug}` via `throttledRequestUrl` | `@leetnotion`'s method loops pagination internally; the direct-REST path is Phase 3's proven pattern. Do NOT construct a second fetcher layer |
| LC submission detail fetch | JSON GET to undocumented endpoint | `GET /submissions/detail/{id}/` — returns HTML; scrape `var pageData = {...};` via regex | This is LC's actual surface; the JSON `/check/` endpoint is for polling in-flight judgments, not historical detail. `@leetnotion`'s `submission(id)` uses the HTML-scrape pattern [VERIFIED: lib/index.cjs:564-605] |
| Session-expiry detection on submission-history calls | Bespoke response checking | `isSessionExpired` from `src/api/LeetCodeClient.ts` (Phase 1) + `assertNotSessionExpired` pattern from `src/solve/leetcodeRest.ts` (Phase 3) | Three-layer defense-in-depth already tuned; reuse |
| Wikilink resolution UI | Manual `metadataCache` scanning | Trust Obsidian's native resolution — `[[Two Pointers]]` matches `Two Pointers.md` by filename OR any note with `aliases: [Two Pointers]` in frontmatter | Standard Obsidian behavior; no plugin code needed. Stub frontmatter's `aliases: [<name>]` + filename `<name>.md` makes both `[[Two Pointers]]` and `[[two-pointers]]` resolve when the alias field includes both forms |

**Key insight:** The Phase 4 surface area is deceptively small — the actual "building new thing" footprint is (1) the union-merge list-item transform (`mergeTechniquesSection`), (2) the submission-history REST client (3 endpoints), (3) two modals (picker + detail), (4) a date formatter, and (5) a handful of settings-store extensions. Everything else is extending patterns Phase 2/3 already shipped. Most of the bugs in this phase will come from edge cases in (1) — the list-item merge — not from the I/O surfaces.

## Common Pitfalls

### Pitfall 1: `processFrontMatter` replaces arrays (does not auto-union)

**What goes wrong:** Writing `fm.tags = [...pluginTags]` inside the callback erases user-added tags like `#revisit`, `#tricky`. Same for `aliases`.

**Why it happens:** YAML arrays in Obsidian are serialized from the final JS array state. There's no merge-on-write magic.

**How to avoid:** Always read existing `fm.tags`, filter to strings, union with plugin's current-pass set, deduplicate, then assign. Pattern already locked in `src/notes/NoteTemplate.ts::applyFrontmatter` (Phase 2 D-10) — Phase 4's topic-tag union must extend that same callback, not add a second pass.

**Warning signs:** Phase 4 unit test "user-tag `#revisit` survives on-AC write" must exist. If absent, this bug will ship.

### Pitfall 2: `lc-status` downgrade on Phase 2 re-open after Phase 4 already set `accepted`

**What goes wrong:** On re-opening an existing solved note, Phase 2's `applyFrontmatter` could overwrite `lc-status: accepted` with `untouched`.

**Why it happens:** Phase 2 writes lc-* keys unconditionally.

**How to avoid:** Phase 2 GAP-2a already fixed this with a non-downgrade guard (CONTEXT.md CF-16). Phase 4 MUST NOT remove or weaken this guard. The invariant: on every frontmatter write, `lc-status` can ONLY upgrade (untouched → attempted → accepted).

**Warning signs:** If `NoteTemplate.applyFrontmatter` changes the existingStatus branching logic, re-test against the Phase 2 GAP-2a test case.

### Pitfall 3: Stub creation mid-loop failure breaks `## Techniques`

**What goes wrong:** Plugin writes `## Techniques` with 5 links, then loops creating stubs; stub #3 fails (disk full, sync race); loop aborts — `## Techniques` already has 5 wikilinks pointing to 3 real + 2 unresolved stubs.

**Why it happens:** The 4-step pipeline is "atomic-per-concern" (D-09), not atomic across all 4.

**How to avoid:** This is by design. Per D-19, per-stub failures are silent (debug log); Obsidian natively renders unresolved wikilinks as styled-distinctly; next AC retries the loop. The `## Techniques` write happens BEFORE the stub loop, so it completes even if all stubs fail.

**Warning signs:** If the planner proposes wrapping the 4 steps in a single try/catch that rolls back on any failure, reject it — D-19 explicitly allows partial success.

### Pitfall 4: Submission-history live fetch lands before LC updates

**What goes wrong:** User submits from the plugin → gets AC → picker fetch fires → LC's submissions/{slug} endpoint hasn't yet indexed the submission → picker shows stale data (missing the just-submitted AC).

**Why it happens:** LC's submission indexing is eventually-consistent; it can lag 1-5 seconds after `/submit/` returns a verdict.

**How to avoid:** Don't fire the picker fetch automatically right after AC. The picker is user-invoked (via command palette). By the time the user opens it, LC has caught up. If user opens the picker within seconds of AC, D-06's "LC returned empty" placeholder is the correct surface — user can retry.

**Warning signs:** If anyone proposes automating "refresh submission history immediately after AC," flag it.

### Pitfall 5: Topic tag name contains special chars that break filenames

**What goes wrong:** LC adds a topic tag like `System Design / Distributed` or `C++`. The `/` or `*` breaks `vault.create` on Windows/macOS.

**Why it happens:** Obsidian's `TFile` paths inherit OS filename rules. `/` is a path separator everywhere; `\\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` are Windows-illegal.

**How to avoid:** Normalize in `buildTechniqueFilename`: replace `/\\:*?"<>|` with `-`. Assert the post-normalization name is non-empty (e.g., a tag of `///` would collapse to `---` which is a valid filename but ugly — log a debug warn).

**Research finding on current LC topic-tag names:** LC's typical topic tags (sample: `Two Pointers`, `Hash Table`, `Dynamic Programming`, `Binary Tree`, `Depth-First Search`, `Breadth-First Search`, `Math`, `Greedy`, `Bit Manipulation`, `Sliding Window`, `Divide and Conquer`, `Backtracking`, `Design`, `Segment Tree`, `Union Find`, `Topological Sort`, `Bitmask`) use only alphanumeric + spaces + hyphens. **The special-char normalization is defensive but unlikely to fire in practice.** [ASSUMED based on LC topic-tag observations; not re-verified against live LC in this research session — confidence MEDIUM, risk LOW since defensive normalization is cheap]

**Warning signs:** If someone proposes skipping the normalization step "because LC names are always clean," reject — the guard is 3 lines and prevents a rare but note-breaking bug.

### Pitfall 6: `vault.createFolder` throws on concurrent creates

**What goes wrong:** Two AC writes for different problems sharing a stub target race; both try to `createFolder(Techniques/)`; second throws `"Folder already exists"`.

**Why it happens:** [VERIFIED: obsidian.d.ts:6435 `@throws Error if folder already exists`].

**How to avoid:** Pre-check via `app.vault.getAbstractFileByPath(folder)` → skip if present; else try/catch on `createFolder`. See Pattern 4 example.

**Warning signs:** If `StubNoteCreator.ts` doesn't have a try/catch on `createFolder`, the second concurrent AC write throws and the user sees no Techniques update.

### Pitfall 7: `MarkdownRenderer.render` child component disposal

**What goes wrong:** Repeatedly opening `SubmissionDetailModal` leaks DOM + CM6 view instances because the rendered component isn't disposed.

**Why it happens:** `MarkdownRenderer.render` requires a `Component` parent for lifecycle. If you don't parent it via `modal.addChild(component)`, Obsidian doesn't know when to tear it down.

**How to avoid:** Create a `new Component()` inside `onOpen`, call `this.addChild(component)` (Modal extends Component → has `addChild`), pass that component as the 5th arg to `render`. Obsidian's `onClose` chain auto-removes children. See Pattern 5 example.

**Warning signs:** Memory profiling after 10 picker → detail → close cycles shows retained CM6 instances.

### Pitfall 8: LC returns `submissions_dump` pagination mid-fetch

**What goes wrong:** User has 50 submissions for a hard problem. `GET /api/submissions/?offset=0&limit=20` returns 20 + `has_next: true`. Plugin only shows 20; user confused why their old AC is missing.

**Why it happens:** LC paginates at 20 by default; the `has_next` + `last_key` fields signal more data.

**How to avoid:** Either (a) ship a "Load more" row in the picker (Phase 5 Polish candidate), or (b) for Phase 4 cap at first 20 (most recent) and document this as a known limit. **Recommendation: ship (b) in Phase 4**; add a "Load more" row if user demand emerges.

**Warning signs:** If planner scopes the picker to "fetch all pages," flag as scope creep for Phase 4.

### Pitfall 9: `autoBacklinksEnabled` shape-guard backward compatibility

**What goes wrong:** User updates from a pre-Phase-4 plugin build. Their `data.json` has no `autoBacklinksEnabled` key. `SettingsStore.load` sees `undefined` and reverts to the DEFAULT_DATA value.

**Why it happens:** Standard shape-guard behavior.

**How to avoid:** Set DEFAULT_DATA.autoBacklinksEnabled = `true`. Shape-guard: `typeof raw.autoBacklinksEnabled === 'boolean' ? raw.autoBacklinksEnabled : DEFAULT_DATA.autoBacklinksEnabled`. Old data.json → picks up default-true (D-21). Planner confirms this matches `isPremium: boolean | null` pattern — but NOT nullable here (D-21 is `boolean`, not `boolean | null`).

**Warning signs:** Shape-guard test for `old-data-json-without-auto-backlinks-enabled.json` fixture must exist.

### Pitfall 10: `DetailCacheEntry.topicTags` optional field breaks on old entries

**What goes wrong:** User's Phase 2 cache has entries WITHOUT `topicTags` (only `topicSlugs`). Phase 4's `## Techniques` writer reads `detail.topicTags` → `undefined` → crashes trying to `.map` it.

**Why it happens:** Schema extension without migration logic.

**How to avoid:** Two-step safety:
1. Shape-guard accepts old entries (`topicTags` optional).
2. Phase 4 reader treats `undefined` as "fetch fresh before writing ## Techniques." On on-AC pipeline, if `detail.topicTags` missing: either (a) fire a background detail refetch + defer the `## Techniques` write, OR (b) skip the `## Techniques` write for this AC and fire it on the next AC (after fresh detail lands). Recommend (b) — simpler; the user's next re-open of the note will trigger Phase 2 D-11 background-refresh, populating `topicTags`.

**Warning signs:** Phase 4 test against a Phase-2-era fixture cache entry must exercise this path.

## Runtime State Inventory

> Include this section for rename/refactor/migration phases only. Omit entirely for greenfield phases.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `problemDetails[slug]` in `data.json` — Phase 2-era entries lack the new `topicTags: [{name, slug}]` field | Schema extension is BACKWARD-COMPATIBLE (topicTags optional; code treats `undefined` as "cache miss → defer ## Techniques write to next AC"). No data migration needed. New field populates on next detail refetch (either 7-day TTL or explicit refresh command). |
| Stored data | `autoBacklinksEnabled` in `data.json` — not yet present in any data.json | Shape-guard returns `true` default when field absent. No migration needed; Phase 5 settings UI lets user flip it. |
| Live service config | None — Phase 4 adds no new external service registrations | N/A |
| OS-registered state | None — Phase 4 adds no OS-level registrations (no tasks, no daemons, no services) | N/A |
| Secrets/env vars | None — Phase 4 reads existing session cookies via `SettingsStore.getAuthCookies()`. No new secret keys. | N/A |
| Build artifacts / installed packages | None — no new dependencies. `main.js` rebuilds from source via existing esbuild config. | N/A |

**The canonical question — what runtime state still has the old data after a file-level edit?** Nothing that Phase 4 introduces fits rename/refactor semantics. Phase 4 is primarily additive (new code paths, new PluginData fields, new folder `Techniques/`). The only schema shift is `DetailCacheEntry.topicTags` (optional, backward-compat) and `PluginData.autoBacklinksEnabled` (new boolean field with default). Both handled by shape-guards at load time.

## Environment Availability

> Skip this section if the phase has no external dependencies (code/config-only changes).

No new external dependencies beyond Phase 1-3 baseline. LeetCode.com is the only external service; Phase 1's `requestUrl` adapter + throttle already cover it. No new CLI tools, runtimes, databases, or package managers required.

## Common Patterns (Code Examples)

Verified patterns from official sources.

### Pattern A: Reading existing cached topic tags before writing

```typescript
// Source: src/settings/SettingsStore.ts pattern
const detail = this.settings.getProblemDetail(slug);
if (!detail) {
  // No cache — defer graph write (D-25 ish); user's next open triggers Phase 2 refetch
  logger.debug('graph.onAccepted: no detail cache for slug; deferring ## Techniques write', { slug });
  return;
}
const topicTags = detail.topicTags ?? [];  // Phase 2-era entries → empty → skip Techniques write
```

### Pattern B: Submission-history fetch (REST wrapper design)

```typescript
// Source: NEW — src/graph/submissionHistoryClient.ts (design following src/solve/leetcodeRest.ts)
import { throttledRequestUrl } from '../api/throttle';
import { SessionExpiredError } from '../shared/errors';
import { authHeaders } from '../solve/leetcodeRest';  // reuse Phase 3 header builder
import type { AuthCookies } from '../settings/SettingsStore';

export interface SubmissionRow {
  id: string;             // submission_id (numeric string)
  statusDisplay: string;  // 'Accepted' | 'Wrong Answer' | ...
  statusCode?: number;    // if LC returns it; otherwise derive from statusDisplay
  lang: string;           // langSlug
  runtime: string;        // "12 ms" (string, may be "N/A")
  memory: string;         // "14.2 MB"
  timestamp: number;      // epoch seconds or ms — LC returns seconds
  url: string;
  title: string;
  titleSlug: string;
}

// CONTEXT D-27 resolution: /api/submissions/{slug} returns JSON with submissions_dump.
// This is the same URL @leetnotion's LeetCodeCLI.submissionsOfProblem uses
// [VERIFIED: node_modules/@leetnotion/leetcode-api/lib/index.cjs:2125].
export async function listSubmissionsForSlug(
  slug: string,
  cookies: AuthCookies,
): Promise<SubmissionRow[]> {
  const res = await throttledRequestUrl({
    url: `https://leetcode.com/api/submissions/${slug}`,
    method: 'GET',
    headers: authHeaders(slug, cookies),
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  if (res.status >= 400) {
    throw new Error(`listSubmissionsForSlug HTTP ${res.status}`);
  }
  const data = res.json as { submissions_dump?: Array<Record<string, unknown>> };
  return (data.submissions_dump ?? []).map((s) => mapSubmissionRow(s));
}

// For per-row code + metadata, LC serves an HTML page at /submissions/detail/{id}/
// with a `var pageData = {...};` block. @leetnotion scrapes this [VERIFIED: lib/index.cjs:577].
// Phase 4 mirrors the pattern.
export async function detailForSubmission(
  id: string,
  slug: string,
  cookies: AuthCookies,
): Promise<SubmissionDetail> {
  const res = await throttledRequestUrl({
    url: `https://leetcode.com/submissions/detail/${id}/`,
    method: 'GET',
    headers: authHeaders(slug, cookies),
    throw: false,
  });
  assertNotSessionExpired(res.status, res.text, res.json);
  const html = res.text;
  const m = /var pageData = ({[^]+?});/.exec(html);
  if (!m) throw new Error('detailForSubmission: could not locate pageData in HTML');
  // LC's pageData uses single quotes + unquoted keys — normalize to JSON.
  const jsonStr = m[1]!
    .replace(/'/g, '"')
    .replace(/(\w+)\s*:/g, '"$1":')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  return JSON.parse(jsonStr) as SubmissionDetail;
}
```

### Pattern C: Register `View past submissions` command with `editorCheckCallback`

```typescript
// Source: src/main.ts:182-194 pattern for Phase 3 commands
// + src/solve/slugGuard.ts
this.addCommand({
  id: 'view-past-submissions',  // no plugin-id, no hotkeys
  name: 'View past submissions',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
    if (!isValidSlug(fm?.['lc-slug'])) return false;
    if (!checking) { void this.viewPastSubmissionsFromActive(); }
    return true;
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component)` | `MarkdownRenderer.render(app, markdown, el, sourcePath, component)` | Obsidian 1.4+ deprecated old signature; `.render` is the current path | Phase 4 MUST use `.render` — deprecated method is still callable but triggers ESLint warnings in obsidianmd-plugin. [VERIFIED: obsidian.d.ts:4000 `@deprecated`, :4013 current signature] |
| `vault.modify(file, data)` | `vault.process(file, pureFn, options?)` | Obsidian 1.1.0 added `.process`; `.modify` still exists but Phase 4 project-wide ban applies (CF-06) | Phase 4 uses `.process` exclusively for body writes + `.create` for stub files. `.modify` grep-gated |
| GraphQL-only LC access | GraphQL + REST split | LC never had a REST-only API; both co-exist for different surfaces | Phase 4's submission-history lives on LC's REST surface (not GraphQL); confirms the decision to hand-roll via `throttledRequestUrl` rather than GraphQL |

**Deprecated / outdated:**
- `renderMarkdown` → use `render` (see above)
- `vault.modify` → banned project-wide
- `@electron/remote` → never used in this plugin
- `workspace.activeLeaf` → never used in this plugin (uses `getActiveViewOfType(MarkdownView)`)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Current LC topic-tag names use only alphanumeric + spaces + hyphens + "C++" (but never `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) | Pitfall 5 | LOW — defensive normalization (D-17) catches the special-char case anyway. If wrong, the normalization helper produces a sanitized filename (`C++` → `C++` unless we strip `+`; recommend NOT stripping `+` since it's filesystem-legal). **Planner action: verify normalization test case against real LC names during implementation.** |
| A2 | `GET /api/submissions/{slug}` is stable and returns `submissions_dump` shape in 2026 | Pattern B / D-27 | MEDIUM — this is an undocumented LC endpoint. Mitigation: the plugin already hand-rolls `/submit/`, `/interpret_solution/`, `/check/` from the same undocumented surface (Phase 3); the submissions endpoint is in the same category. **Planner action: add a Wave 0 live-capture step that fetches against real LC and stores as `tests/fixtures/lc-submissions/list-many.json` before implementation.** |
| A3 | `GET /submissions/detail/{id}/` still serves the `var pageData = {...}` HTML scrape pattern in 2026 | Pattern B | MEDIUM — same category as A2. @leetnotion's 3.0.0 source still uses this pattern and the package was last published 2026-04-03, suggesting it still works. **Planner action: capture a live detail fixture before implementation; flag if LC has switched to JSON.** |
| A4 | `vault.createFolder` throws on exists (same as `vault.create`) | Pitfall 6 | LOW — obsidian.d.ts:6435 documents `@throws Error if folder already exists`. But the guard-with-pre-check pattern works regardless of whether throws fires or not. |
| A5 | `SubmissionDetail.details.status_code` is present in historic detail responses (not just fresh /check/ polls) | SubmissionDetailModal | MEDIUM — @leetnotion's `SubmissionDetail` type [VERIFIED: lib/index.d.ts:726-749] does include `details.status_code`. Live-capture fixture will confirm. |
| A6 | LC returns at most 20 submissions per problem in a single request (pagination at 20, `has_next` flag) | Pitfall 8 | LOW — @leetnotion's pagination loop and `/api/submissions/` cap confirm. Phase 4 ships single-page (first 20); Phase 5 Polish if demand for more. |
| A7 | `isPremium: boolean | null` in PluginData uses the `null = unknown` pattern; `autoBacklinksEnabled: boolean` should NOT be nullable (default `true`) | Pitfall 9 | LOW — D-21 is explicit: `boolean`, not `boolean | null`. |
| A8 | DST handling: native `Date.getTimezoneOffset()` returns the correct offset for the specific `Date` instance (DST-aware) | Pattern 6 / dateFormat | HIGH confidence — this is documented MDN behavior and was live-tested in this research session (node `v24.13.1`, ET TZ). Not an assumption in the risky sense, but noted here so the planner includes a DST-boundary test. |
| A9 | `@leetnotion/leetcode-api` v3.0.0's `restRequest('/api/submissions/{slug}')` is the non-deprecated path for slug-filtered history. The base-class `submissions({slug})` signature accepts `slug` but its implementation ignores it (verified in lib/index.cjs source) | Pattern B | LOW — verified directly in source. If @leetnotion fixes this in a future release, Phase 4's hand-rolled REST continues to work because it bypasses the library on this path. |

**If this table is empty:** Not empty — 9 assumptions documented above. Most are LOW risk (verified in source or documented mitigations). A2/A3/A5 are MEDIUM — mitigated by live-capture step in Wave 0.

## Open Questions (RESOLVED)

> All three questions resolved during the plan-revision pass (2026-05-09). Recorded here with the resolution path taken.

1. **Should `View past submissions` auto-fire on note open (D-02) or only on command-palette invocation?**
   - What we know: CONTEXT D-02 says "refetch on open"; D-03 adds the picker command.
   - What's unclear: D-02 specifies "refetch problem detail AND submission history" — is the submission history fetch meant to just warm a cache (rejected in D-07) or to render something passively? Reading CONTEXT again — D-07 rules out caching. So D-02's "refetch submission history" is pointless unless it renders something passively OR feeds the picker's first-open UX (faster modal since fetch completed in background).
   - Recommendation: Fire the fetch on open + hold the result in-memory on the plugin instance (per-slug map, cleared on plugin unload or slug change). Picker invocation for that slug reads from the in-memory cache first, falls back to fresh fetch. This honors D-07 (no `data.json` persistence) while satisfying D-02's "always fresh on open" posture. **Flag this to the planner as a design decision.**
   - **RESOLVED:** In-memory `SubmissionHistoryStore` on the plugin instance (`Map<slug, SubmissionListEntry[]>`, cleared on plugin unload). `NoteWriter.openProblem(slug)` fires a fire-and-forget background refetch after reveal (mirrors the Phase 2 D-11 background-refresh posture + D-12 silent-offline failure). `SubmissionPickerModal` reads from the store FIRST (instant render if populated), then kicks a fresh fetch in the background to update the UI if results differ. Cache miss → picker does its own fetch (existing behavior). Fetches only the list (20 most recent); per-row detail still fetches on picker-row click. **No `data.json` persistence — honors D-07.** Plan 05 ships the store construction + NoteWriter hook + picker consumer in one task (see Plan 04-05 Task 2, added in the revision pass).

2. **When the user's Phase-2-era cache lacks `topicTags`, should the on-AC pipeline fire a blocking detail refetch or defer the `## Techniques` write to the next AC?**
   - What we know: D-11 assumes `problemDetails[slug].topicSlugs` is available. `topicTags` is new.
   - What's unclear: whether the planner should add an inline "fetch if missing" step to the writer or skip gracefully.
   - Recommendation: Skip gracefully on first AC; Phase 2's D-11 background-refresh populates `topicTags` on next note open; next AC fires the full pipeline. Simpler; no extra network hop in the AC-write critical path.
   - **RESOLVED:** Skip gracefully on first AC per the recommendation. `KnowledgeGraphWriter.onAccepted` still writes the 5 GRAPH-02 solve-time frontmatter fields (lc-status, lc-solved-date, lc-runtime-ms, lc-memory-mb, lc-language) unconditionally; `## Techniques` body write + stub creation are skipped when `detail.topicTags` is undefined/empty (D-25 + Pitfall 10 combined guard). Phase 2 D-11's on-open background-refresh populates `topicTags` for next time; next AC fires the full pipeline. No extra network hop in the critical path.

3. **Should the `Copy to ## Code` confirm dialog consider the case where the current fenced block's language differs from the submitted language?**
   - What we know: D-04 says the new fence's language tag = submitted language (not current fence tag).
   - What's unclear: the user's workflow of "I have python3 code in ## Code but I want to pull in my old Java submission" — should we warn specifically about the language change, or is a generic "Overwrite current code?" enough?
   - Recommendation: Generic confirm is enough. Language delta is visible in the preview modal; the user reading "Java" in the Submission Detail modal before clicking Copy is the implicit consent. **Planner decides UI copy; defer to UI-SPEC if one is generated for Phase 4.**
   - **RESOLVED:** Generic confirm text per UI-SPEC §Copywriting → ConfirmOverwriteModal. Body copy is language-agnostic (`Your current ## Code block will be replaced with this submission.` + `This can't be undone from the modal, but Obsidian's undo (Cmd/Ctrl+Z) works after closing.`). Language delta is visible to the user in the preceding SubmissionDetailModal's metadata row + syntax-highlighted code block; clicking Copy constitutes implicit consent for the language change. No special-case copy for lang delta.

## Project Constraints (from CLAUDE.md)

From `./CLAUDE.md`, treated with locked-decision authority:

- **Constraints (lines 12-20):** Desktop only (`isDesktopOnly: true`); leetcode.com only; TypeScript; prefer existing LC lib over hand-rolling; no telemetry; CSP-safe; no `innerHTML` with user data; offline readability for previously-fetched content; session cookie local-only.
- **Tech Stack:** Pinned — `obsidian@1.12.3`, `@leetnotion/leetcode-api@3.0.0`, `esbuild@0.25.5`, `typescript@^5.8.3`, `vitest@4.1.5`, `turndown@7.2.4`. No new deps.
- **HTTP (§HTTP Client):** `requestUrl` ONLY; no `fetch`/`axios`/`node-fetch` (CORS-blocked in Electron).
- **Offline cache (§5):** `this.loadData/saveData` for plugin state; vault-visible Markdown files for user-facing content. Do NOT write hidden files under `.obsidian/plugins/` for user-readable content.
- **Markdown rendering (§6):** `innerHTML` forbidden; `createEl` for DOM; `turndown` for HTML→MD (not used in Phase 4 directly).
- **§7 Code Editor Inside Notes:** Obsidian's editor IS CodeMirror 6. Don't build a separate editor pane. `MarkdownRenderer.render` gets code-block highlighting for free.
- **§8 Community Plugin Store:** No telemetry, no remote eval, no `innerHTML` with user data, no obfuscated code, no `new Function()`, no auto-update mechanism, no `eval()`, no hotkeys, no plugin-id-in-command-id, `isDesktopOnly: true`, Electron APIs confined to `auth/BrowserWindowLogin.ts` (Phase 4 adds no Electron imports).
- **§Stack Patterns → `app.fileManager.processFrontMatter()` atomic pattern** — the sanctioned path for frontmatter mutations.
- **§Stack Patterns → "Use `setInterval` / `clearInterval` via `this.registerInterval()` so it auto-cleans"** — Phase 4 doesn't introduce new timers, but any future submission-history auto-refresh interval MUST follow this.
- **§Stack Patterns → "Do NOT use `Vault.modify()` on active file"** — PROJECT-WIDE BAN (STATE.md Phase 4 rule). Phase 4 grep gate: `grep -rE "vault\.modify\s*\(" src/graph/ --include='*.ts'` must be empty.
- **§9 Knowledge Graph Integration** — the philosophy frame for the whole phase. Tags + backlinks + graph view = core value.

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 [VERIFIED: package.json devDependencies] |
| Config file | `vitest.config.ts` (existing, no changes needed for Phase 4) |
| Quick run command | `npx vitest run tests/graph/` (Phase 4 folder only) |
| Full suite command | `npm test` (runs `vitest run --passWithNoTests` across all tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAPH-01 | No `## Solution` ever created; only `## Code` mutates via picker's Copy-to-Code | unit | `npx vitest run tests/graph/SubmissionDetailModal.test.ts -t 'copy to code does not create ## Solution'` | Wave 0 |
| GRAPH-01 | AC does NOT touch `## Code` body | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'on AC does not modify ## Code'` | Wave 0 |
| GRAPH-02 | Frontmatter fields written on AC: lc-status, lc-solved-date, lc-runtime-ms, lc-memory-mb, lc-language | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'on AC writes frontmatter fields'` | Wave 0 |
| GRAPH-02 | `toIsoLocalTz` produces `YYYY-MM-DDTHH:MM:SS±HH:MM` with local TZ | unit | `npx vitest run tests/graph/dateFormat.test.ts -t 'ISO-8601 local-tz'` | Wave 0 |
| GRAPH-02 | `toIsoLocalTz` DST boundary correctness (PST ↔ PDT) | unit | `npx vitest run tests/graph/dateFormat.test.ts -t 'DST boundary'` | Wave 0 |
| GRAPH-02 | `lc-runtime-ms` parses "12 ms" → 12; undefined on "N/A" | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'parses runtime/memory'` | Wave 0 |
| GRAPH-02 | lc-status non-downgrade (existing 'accepted' survives future passes) | unit | `npx vitest run tests/note-frontmatter-write.test.ts -t 'lc-status does not downgrade'` | exists (Phase 2) |
| GRAPH-03 | `## Techniques` body contains `[[<tag.name>]]` for every LC topic tag | unit | `npx vitest run tests/graph/mergeTechniquesSection.test.ts -t 'writes wikilink per topic tag'` | Wave 0 |
| GRAPH-03 | `## Techniques` insertion point is after `## Notes`, before `## Custom Tests` | unit | `npx vitest run tests/graph/mergeTechniquesSection.test.ts -t 'insertion after ## Notes'` | Wave 0 |
| GRAPH-03 | `## Techniques` union-merge: user-added `- [[MyOwnTag]]` preserved across AC re-writes | unit | `npx vitest run tests/graph/mergeTechniquesSection.test.ts -t 'preserves user-added wikilinks'` | Wave 0 |
| GRAPH-03 | Idempotent: `merge(merge(body, tags), tags) === merge(body, tags)` | unit | `npx vitest run tests/graph/mergeTechniquesSection.test.ts -t 'idempotent'` | Wave 0 |
| GRAPH-03 | Topic-tag frontmatter union: `lc/two-pointers` added on AC, user's `#revisit` survives | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'topic tags union-merge'` | Wave 0 |
| GRAPH-04 | Stub created at `Techniques/<Name>.md` with frontmatter-only body | unit | `npx vitest run tests/graph/StubNoteCreator.test.ts -t 'creates stub on missing'` | Wave 0 |
| GRAPH-04 | Stub NOT overwritten when existing file present | unit | `npx vitest run tests/graph/StubNoteCreator.test.ts -t 'never overwrites existing stub'` | Wave 0 |
| GRAPH-04 | Techniques/ folder created if missing (idempotent on concurrent) | unit | `npx vitest run tests/graph/StubNoteCreator.test.ts -t 'creates folder once'` | Wave 0 |
| GRAPH-04 | Stub filename normalization (`C++` stays `C++.md`; `A/B` → `A-B.md`) | unit | `npx vitest run tests/graph/StubNoteCreator.test.ts -t 'filename normalization'` | Wave 0 |
| GRAPH-04 | Re-create stub after user deletion (divergence from Phase 2 BaseFile) | unit | `npx vitest run tests/graph/StubNoteCreator.test.ts -t 'recreates after delete'` | Wave 0 |
| GRAPH-05 | Opt-out (autoBacklinksEnabled=false): frontmatter + lc/-tag writes still fire; `## Techniques` + stubs skipped | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'opt-out skips ## Techniques and stubs'` | Wave 0 |
| GRAPH-05 | Opt-out backward-compat: old data.json without `autoBacklinksEnabled` defaults to true | unit | `npx vitest run tests/settings-store.test.ts -t 'autoBacklinksEnabled defaults true on missing'` | Wave 0 (EXTEND existing) |
| Phase 2 D-05 carry | First AC writes `lc/{topic-slug}` tags to frontmatter | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'writes topic tags on first AC'` | Wave 0 |
| D-23 invariant | Unknown verdict does NOT fire on-AC pipeline | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'unknown verdict skips pipeline'` | Wave 0 |
| D-23 invariant | Non-AC terminal (WA/TLE/MLE/CE/RE) does NOT fire pipeline | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'non-AC verdict skips pipeline'` | Wave 0 |
| D-06 | Session-expired during picker fetch → locked Notice + close picker | unit | `npx vitest run tests/graph/SubmissionPickerModal.test.ts -t 'session expired fires locked Notice'` | Wave 0 |
| D-06 | Empty submissions list → "No submissions yet." placeholder inline | unit | `npx vitest run tests/graph/SubmissionPickerModal.test.ts -t 'empty state renders placeholder'` | Wave 0 |
| D-06 | 4xx/5xx during picker fetch → inline error in modal (NOT Notice) | unit | `npx vitest run tests/graph/SubmissionPickerModal.test.ts -t 'network error renders inline'` | Wave 0 |
| D-27 | submissionHistoryClient.listForSlug maps LC's submissions_dump shape to SubmissionRow | unit | `npx vitest run tests/graph/submissionHistoryClient.test.ts -t 'list maps wire shape'` | Wave 0 |
| D-27 | submissionHistoryClient.detail scrapes pageData from HTML | unit | `npx vitest run tests/graph/submissionHistoryClient.test.ts -t 'detail scrapes pageData'` | Wave 0 |
| D-19 | Per-stub creation failure does NOT prevent ## Techniques body write | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 'stub failure does not block section write'` | Wave 0 |
| D-24 | Re-AC on same problem: frontmatter overwrites with newer runtime, even if worse | unit | `npx vitest run tests/graph/KnowledgeGraphWriter.test.ts -t 're-AC reflects latest not best'` | Wave 0 |
| Copy-to-Code | Confirm dialog fires when `## Code` is non-empty | unit | `npx vitest run tests/graph/SubmissionDetailModal.test.ts -t 'copy-to-code confirms overwrite'` | Wave 0 |
| Copy-to-Code | New fenced block uses submitted language tag, not existing tag | unit | `npx vitest run tests/graph/SubmissionDetailModal.test.ts -t 'copy uses submission language'` | Wave 0 |
| CF-06 | `vault.modify` absent from `src/graph/` | grep | `grep -rE "vault\.modify\s*\(" src/graph/ --include='*.ts'` (must be empty) | Wave 0 (ADD to scripts/grep-no-vault-modify.sh) |
| CF-07 | `innerHTML` absent from picker/detail modals | grep/lint | existing `eslint-plugin-obsidianmd` Required rules | configured |
| CF-19 | No default hotkeys on `view-past-submissions` command | grep | `grep -n "hotkeys" src/main.ts` (must not appear near addCommand with id 'view-past-submissions') | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/graph/` (Phase 4 folder; <5s)
- **Per wave merge:** `npm test && npm run lint && npm run grep:vault` (full suite + lint + grep gate)
- **Phase gate:** Full suite green + `/gsd-verify-work` invoked before phase close.

### Wave 0 Gaps

- [ ] `tests/graph/KnowledgeGraphWriter.test.ts` — covers GRAPH-02, GRAPH-03 (topic-tag frontmatter), GRAPH-05, D-23, D-24, D-19, Pitfall 2 (non-downgrade), Pitfall 10 (topicTags missing)
- [ ] `tests/graph/mergeTechniquesSection.test.ts` — pure transform unit tests (idempotence, user-preservation, list-format tolerance, insertion point)
- [ ] `tests/graph/StubNoteCreator.test.ts` — never-overwrite, concurrent-safe, filename normalization, re-create-after-delete
- [ ] `tests/graph/submissionHistoryClient.test.ts` — list/detail mappers, session-expiry, HTML pageData scrape
- [ ] `tests/graph/SubmissionPickerModal.test.ts` — empty state, error states, session-expiry, row-click flow
- [ ] `tests/graph/SubmissionDetailModal.test.ts` — MarkdownRenderer.render integration (may need happy-dom harness), Copy-to-Code confirm
- [ ] `tests/graph/dateFormat.test.ts` — ISO-8601 local-tz, DST boundary
- [ ] `tests/fixtures/lc-submissions/list-many.json` — live-captured fixture (20 rows; mix of AC/WA/TLE/CE)
- [ ] `tests/fixtures/lc-submissions/list-empty.json` — empty array
- [ ] `tests/fixtures/lc-submissions/detail-ac.json` — AC detail (code + percentiles)
- [ ] `tests/fixtures/lc-submissions/detail-wa.json` — WA detail (input + expected + actual)
- [ ] `tests/fixtures/lc-submissions/list-session-expired.html` — redirect-to-login fixture for session-expiry test
- [ ] `tests/graph/fakes/` — subfolder with FakeSubmissionHistoryClient + test helpers (mirrors `tests/solve/mocks/fakeFetcher.ts`)
- [ ] EXTEND `scripts/grep-no-vault-modify.sh` — add `src/graph/` to the grep path list
- [ ] EXTEND `tests/settings-store.test.ts` — backward-compat test for `autoBacklinksEnabled` missing from old data.json

**Framework install:** none — vitest already installed.

## Security Domain

> `security_enforcement` not explicitly set in `.planning/config.json` — treat as enabled per agent convention. Phase 4 scope is low-risk (no new auth surfaces, no new HTTP origins, no new file-system access outside the vault).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (carried from Phase 1) | Session cookies read via `SettingsStore.getAuthCookies()` — no new auth in Phase 4 |
| V3 Session Management | no (carried) | Session-expiry detection via `isSessionExpired` + `assertNotSessionExpired` (Phase 3 three-layer) reused |
| V4 Access Control | no | Plugin runs in user's own vault context; no multi-user access surface |
| V5 Input Validation | yes | `SettingsStore.isValidPluginData` + `isValidDetailCacheEntry` shape-guards extended for new fields (`autoBacklinksEnabled`, `topicTags`). Submission-history responses parsed through narrow mappers that validate required fields before use |
| V6 Cryptography | no | No new crypto in Phase 4 |
| V7 Error Handling & Logging | yes | Debug-level logging on silent-fail paths (stub creation, background submission-history fetch) uses `src/shared/logger.ts` which redacts `LEETCODE_SESSION` / `csrftoken` from any logged object |
| V8 Data Protection | yes | Session cookies never logged (Phase 1 logger.ts redaction); submission code fetched from LC is user's own code — not exfiltrated; no telemetry |
| V13 API | yes | All LC hits via `throttledRequestUrl`; no direct `fetch`; header set matches Phase 3 REST (referer, cookie, x-csrftoken) |

### Known Threat Patterns for Obsidian plugin + LC REST

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious `data.json` injecting non-boolean `autoBacklinksEnabled` | Tampering | Shape-guard rejects non-boolean; falls back to DEFAULT_DATA.autoBacklinksEnabled = true |
| Malicious `data.json` injecting non-array `topicTags` | Tampering | `isValidDetailCacheEntry` shape-guard rejects the whole entry; cache miss triggers fresh fetch |
| LC response injecting malicious HTML into submission code | Tampering / XSS | Code rendered via `MarkdownRenderer.render` inside a fenced block — Obsidian's renderer handles escaping. No `innerHTML` in the detail modal |
| Topic-tag name injecting filesystem path traversal (`../etc/passwd`) | Tampering | `buildTechniqueFilename` normalization strips `/\\:*?"<>|`; path joined via `{problemsFolder}/Techniques/{name}` where `problemsFolder` has been sanitized via `SettingsStore.sanitizeFolder` (Phase 1) |
| Session cookie leaked via debug log | Information Disclosure | `src/shared/logger.ts` redaction (Phase 1) — LEETCODE_SESSION pattern masked before log output |
| Third-party plugin reading `autoBacklinksEnabled` + `topicTags` from `data.json` | Information Disclosure | Not applicable — these are non-sensitive settings, same posture as other PluginData fields |
| Stub note creation racing with user-created file at same path | Tampering | `vault.create` throws on exists; Phase 4's try/catch treats as no-op (user's file wins) |
| Submission-history endpoint returning forged data (e.g., MITM) | Tampering | `requestUrl` over HTTPS to LC; cert validation handled by Obsidian/Electron |

## Sources

### Primary (HIGH confidence)
- `node_modules/obsidian/obsidian.d.ts` (version 1.12.3) — API surface definitions
  - `FileManager.processFrontMatter` line 2830
  - `Vault.create` line 6421 (`@throws Error if file already exists`)
  - `Vault.createFolder` line 6439 (`@throws Error if folder already exists`)
  - `Vault.process` line 6545
  - `MarkdownRenderer.render` line 4013 (current)
  - `MarkdownRenderer.renderMarkdown` line 4003 (`@deprecated`)
  - `Modal` class line 4332
  - `setIcon` export line 5517
- `node_modules/@leetnotion/leetcode-api/lib/index.d.ts` (version 3.0.0, published 2026-04-03) — API types
  - `Submission` shape line 687
  - `SubmissionDetail` shape line 726
  - `UserSubmission` shape line 674
  - `SubmissionsDump` shape line 707
  - `SubmissionStatus` enum line 673
  - `LeetCode.submissions({limit, offset})` line 862
  - `LeetCode.submission(id)` line 876 (`@deprecated` — but still works; HTML-scrape pattern)
  - `TopicTag` shape line 577
- `node_modules/@leetnotion/leetcode-api/lib/index.cjs` (implementation)
  - `submissions` pagination loop line 506
  - `submissionsApi` endpoint pattern line 525 (`GET /api/submissions/?offset=${offset}&limit=${limit}`)
  - `submission(id)` HTML-scrape line 564 (`GET /submissions/detail/${id}/`, `var pageData = {...}` regex)
  - `submissionsOfProblem(slug)` endpoint line 2123 (`GET /api/submissions/{slug}` — slug-filtered)
- `src/notes/NoteTemplate.ts` — Phase 2 D-03 frontmatter schema SSoT
- `src/notes/HeadingRegion.ts` — Phase 2 D-09 whole-region replacement pattern
- `src/solve/CaseRegion.ts` — Phase 3 D-19 parse-items + merge pattern (closest analog for Phase 4's mergeTechniquesSection)
- `src/solve/leetcodeRest.ts` — Phase 3 D-28/D-29 REST patterns with session-expiry defense-in-depth
- `src/solve/submissionOrchestrator.ts` — Phase 3 D-08/D-22 single-flight + abort patterns (not extended by Phase 4; kept clean)
- `src/main.ts` — Phase 3 command registration pattern with `editorCheckCallback` on `lc-slug`
- `src/settings/SettingsStore.ts` — Phase 2 D-14/D-15 cache + shape-guard pattern
- Phase 2 CONTEXT.md / Phase 3 CONTEXT.md — carried-forward invariants (CF-01 through CF-19)

### Secondary (MEDIUM confidence)
- Phase 4 CONTEXT.md itself — authoritative for D-01..D-29 decisions; copied verbatim into User Constraints section
- `skygragon/leetcode-cli` `lib/config.js` / `lib/plugins/leetcode.js` — referenced for REST endpoint patterns (MEDIUM because last updated 2019)
- `microsoft/vscode-leetcode` — referenced for submission-panel UX (MEDIUM because different plugin surface — no Obsidian-native patterns to carry)

### Tertiary (LOW confidence)
- **LC topic-tag naming conventions** — A1 based on observation of common tags; not re-verified against live LC in this session. Mitigation: defensive normalization in `buildTechniqueFilename` handles edge cases.
- **LC `/api/submissions/{slug}` exact response shape in 2026** — A2 based on @leetnotion 3.0.0's implementation (last updated 2026-04-03); not re-fetched live. Mitigation: Wave 0 live-capture step.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries pinned and verified in local node_modules
- Architecture: HIGH — every pattern has a Phase 1/2/3 precedent + a verified API signature
- Pitfalls: HIGH on Pitfalls 1-7, 9 (all verified in source); MEDIUM on Pitfalls 8, 10 (reasoned from specs)
- REST endpoints (D-27): MEDIUM — @leetnotion source is authoritative for pattern but LC is undocumented; live-capture in Wave 0 will lock to HIGH

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30 days; LC REST surface is stable but not guaranteed — re-verify if Phase 4 slips past this date)

---

*Phase: 4-knowledge-graph-wiring*
*Research completed: 2026-05-09*
