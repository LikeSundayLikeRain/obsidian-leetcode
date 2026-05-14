---
phase: 02-problems-as-notes
plan: 10
subsystem: notes / htmlToMarkdown + force-refresh command
tags: [gap-closure, gap-2c-3, gap-11, htmlToMarkdown, turndown, sup-sub, unicode, commands, force-refresh]
parent-gap: [GAP-2c (02-UAT.md), GAP-11 (phase 5 deferred brought forward)]
followup-of: 02-09
supersedes: [GAP-2c, GAP-2c-2]
type: micro-fix
requires: [02-08, 02-09]
provides: [unicode-sup-sub, force-refresh-command, NoteWriter.forceRefresh, LeetCodePlugin.refreshProblem]
affects:
  - src/notes/htmlToMarkdown.ts
  - src/notes/NoteWriter.ts
  - src/main.ts
  - tests/htmlToMarkdown.test.ts
  - tests/htmlToMarkdown-determinism.test.ts
  - tests/htmlToMarkdown-snapshots.test.ts
  - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
  - tests/note-writer-force-refresh.test.ts
tech-stack:
  added: []
  patterns: [unicode-glyph-mapping, editorCheckCallback, vault.process, processFrontMatter]
key-files:
  created:
    - .planning/phases/02-problems-as-notes/02-10-SUMMARY.md
    - tests/note-writer-force-refresh.test.ts
  modified:
    - src/notes/htmlToMarkdown.ts
    - src/notes/NoteWriter.ts
    - src/main.ts
    - tests/htmlToMarkdown.test.ts
    - tests/htmlToMarkdown-determinism.test.ts
    - tests/htmlToMarkdown-snapshots.test.ts
    - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
decisions:
  - "Unicode superscript/subscript (U+00B2, U+2070..2079, U+2080..2089) over both prior approaches: superior to `$^{X}$` math form (which did not render inside inline `<code>`/backticks because Markdown inline-code suppresses nested formatting) AND superior to the GAP-2c-2 HTML passthrough (which Obsidian stripped in both edit and reading modes). Unicode characters are plain text — no delimiters, no rendering mode — so they render identically in edit view, reading view, and inside backticks."
  - "All-or-nothing mapScript fallback: if ANY character in the sup/sub content lacks a Unicode glyph (e.g., `<sup>foo_bar</sup>`, where `_` has no superscript form), the WHOLE string falls back to plain-text `^{foo_bar}` / `_{foo_bar}`. Chosen over half-rendering (e.g., `ᶠᵒᵒ_bar`) which would be visually inconsistent and confusing."
  - "Force-refresh command uses editorCheckCallback (not callback) so it is only enabled when the active note has an `lc-slug` frontmatter key — the command is invisible on non-plugin notes, keeping the palette clean."
  - "Force-refresh surfaces network failures via Notice (unlike background-refresh which is silent per D-12) because this IS an explicit user action — D-13 failure-copy semantics apply: `Couldn't refresh {title}. Check your connection.`"
  - "forceRefresh preserves D-04 status non-downgrade (Phase 4's 'accepted' value survives), D-08 user-content preservation (`## Notes` and any user-added headings untouched), D-10 frontmatter union merge (user aliases/tags preserved), and D-22 (body via vault.process; frontmatter via processFrontMatter — no vault.modify)."
metrics:
  completed: 2026-05-08
  duration-minutes: ~40
  tasks-completed: 2
  files-changed: 8
  commits: 2
---

# Phase 2 Plan 10: GAP-2c-3 + GAP-11 — Unicode sup/sub + Refresh Current Problem Summary

Closed two gaps in one micro-plan: (1) the superscript/subscript rendering saga — rewrote `lc-sup`/`lc-sub` to emit Unicode characters, dropping the GAP-2c-2 HTML passthrough which didn't work in Obsidian, and (2) added an explicit "Refresh current problem" command that force-regenerates the `## Problem` body of the currently-open note, bypassing the 7-day cache.

## Task 1 — GAP-2c-3: Unicode sup/sub rendering

### Context — the sup/sub saga

| Attempt | Approach | Output shape | Verdict |
|---------|----------|--------------|---------|
| GAP-2c (plan 02-08) | `<sup>X</sup>` → `$^{X}$` Obsidian math | `10$^{4}$` outside code, `` `10$^{4}$` `` inside `<code>` | Works outside `<code>`; math source LEAKS inside backticks (Markdown suppresses nested formatting). |
| GAP-2c-2 (plan 02-09) | `<code>` with nested children → literal HTML passthrough | `<code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code>` verbatim | Obsidian strips nested `<sup>`/`<sub>` tags in both edit and reading modes. User sees literal HTML text, not superscript. |
| **GAP-2c-3 (this plan)** | `<sup>X</sup>` → Unicode (`²`, `ⁱ⁺¹`, etc.) via character mapping; unmappable content falls back to `^{X}` plain text | `10⁴` outside code, `` `10⁴` `` inside `<code>` | Unicode is plain text — no delimiters, no rendering mode — identical across edit view, reading view, and inside backticks. |

### Implementation

Added two module-scoped maps in `src/notes/htmlToMarkdown.ts`:

```typescript
const SUP_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  ...
  'a': 'ᵃ', 'b': 'ᵇ', ...
};
const SUB_MAP: Record<string, string> = { /* similar for subscript glyphs */ };

function mapScript(content, table, fallbackPrefix) {
  const mapped = [];
  for (const ch of content) {
    const m = table[ch.toLowerCase()] ?? table[ch];
    if (m === undefined) return `${fallbackPrefix}{${content}}`; // all-or-nothing
    mapped.push(m);
  }
  return mapped.join('');
}
```

Rules:
```typescript
service.addRule('lc-sup', { filter: 'sup', replacement: (content) => mapScript(content.trim(), SUP_MAP, '^') });
service.addRule('lc-sub', { filter: 'sub', replacement: (content) => mapScript(content.trim(), SUB_MAP, '_') });
```

### Removed: `lc-code-with-children`

The GAP-2c-2 rule is gone entirely:
- It emitted `<code>…<sup>…</sup>…</code>` as literal HTML.
- Obsidian strips the nested `<sup>` tags, leaving `<code>10<sup>4</sup></code>` → reader sees the full HTML source with angle brackets, OR the nested tag contents concatenated (depending on mode) — but NEVER a rendered superscript.
- Under GAP-2c-3, `<code>` with children now passes through turndown's default backtick conversion. The `<sup>` children are processed by the `lc-sup` rule INTO Unicode characters, then wrapped in backticks. Result: `` `O(n²)` `` renders cleanly in any mode.

### Snapshot diff

Before (GAP-2c-2, two-sum constraints):
```
-   <code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code>     ← Obsidian strips nested <sup>
-   <code>-10<sup>9</sup> &lt;= nums[i] &lt;= 10<sup>9</sup></code>
```

After (GAP-2c-3):
```
-   `2 <= nums.length <= 10⁴`         ← clean Unicode superscript inside backticks
-   `-10⁹ <= nums[i] <= 10⁹`
-   `-10⁹ <= target <= 10⁹`
```

### Tests (Task 1)

**tests/htmlToMarkdown.test.ts** — rewrote the sup/sub + `<code>` nested-tag test blocks (combined into 14 tests):
- `<sup>2</sup>` → `²`, `<sup>31</sup>` → `³¹`, `<sup>i+1</sup>` → `ⁱ⁺¹`
- Unmappable fallback: `<sup>foo_bar</sup>` → `^{foo_bar}` (underscore has no sup glyph)
- `<code>O(n<sup>2</sup>)</code>` → `` `O(n²)` ``, `<code>a<sub>i</sub></code>` → `` `aᵢ` ``
- Subscript mirror: `<sub>2</sub>` → `₂`, `<sub>n-1</sub>` → `ₙ₋₁`, `<sub>b</sub>` → `_{b}` (fallback)
- Empty sup/sub edge case → empty output
- Plain `<sup>` outside `<code>` → Unicode (no regression on the lc-sup filter)

**tests/htmlToMarkdown-determinism.test.ts** — Test 10 rewritten around Unicode + combined `<code>`/bare `<sup>` + example-block fixture (100-run byte-equality gate).

**tests/htmlToMarkdown-snapshots.test.ts** — regenerated snapshots, rewrote GAP-2c smoke check → GAP-2c-3 smoke check asserting:
- `10⁴` / `10⁹` appear in the two-sum snapshot
- No literal `<sup>` or `<code>` tags
- No math-mode `$^{...}$` or `$_{...}$` delimiters

## Task 2 — GAP-11: "Refresh current problem" command

Brought forward the Phase 5 deferred "Force refresh from LeetCode" command to Phase 2 because the background-refresh path (D-11/D-12 silent) means there's no user-accessible way to force regeneration today. If the 7-day cache has stale content (or a silent background-refresh failed), the user has no path to recover short of deleting and re-opening the note.

### Command registration (`src/main.ts`)

```typescript
this.addCommand({
  id: 'refresh-current-problem',
  name: 'Refresh current problem',
  editorCheckCallback: (checking, _editor, view) => {
    const file = view.file;
    if (!file) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    const fm: Record<string, unknown> | undefined = cache?.frontmatter;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || !slug) return false;
    if (!checking) void this.refreshProblem(slug);
    return true;
  },
});
```

Community plugin compliance:
- Command id `'refresh-current-problem'` contains no `obsidian` substring and no `leetcode` plugin-id substring.
- Name `'Refresh current problem'` contains neither "LeetCode" nor "obsidian" (satisfies `obsidianmd/commands/no-plugin-name-in-command-name`). Obsidian prepends the plugin display name at runtime.
- No default hotkey (honors `commands/no-default-hotkeys`).
- Uses `editorCheckCallback` so the command is only enabled when the active note has an `lc-slug` frontmatter key.

### NoteWriter.forceRefresh(slug)

New public method (`src/notes/NoteWriter.ts`):

1. Locate the existing note by cached id + slug (Notice `"No note for problem {slug}."` if missing — cache absent, or file deleted off-disk).
2. Fetch fresh detail. Unlike `backgroundRefresh`, errors are surfaced:
   - Session expired → `"LeetCode session expired. Log in again."` (8s)
   - Generic network failure → `"Couldn't refresh {title}. Check your connection."` (4s) — reuses the D-13 copy shape since this IS an explicit user action
   - Null detail → `"LeetCode problem not found: {slug}."` (4s)
3. Persist the fresh cache entry (fetchedAt = Date.now()).
4. Rewrite `## Problem` region via `vault.process` (D-22 compliant; `rewriteProblemSection` is pure).
5. Union-merge frontmatter via `applyFrontmatter` (D-04 non-downgrade + D-10 preservation inside the callback).

### Preservation guarantees

| Concern | Guarantee | Mechanism |
|---------|-----------|-----------|
| User's `## Notes` body | Preserved verbatim | `rewriteProblemSection` only replaces the `## Problem` region (between consecutive H2 headings) |
| Any user-added H2 section (e.g., `## Complexity`) | Preserved verbatim | Same region-based rewrite |
| User-added non-`lc-*` frontmatter keys | Preserved verbatim | `applyFrontmatter` callback only mutates plugin-owned keys |
| User aliases / tags | Union-merged | `applyFrontmatter` unions prior + plugin-current-pass sets |
| Phase 4's `lc-status: accepted` | Never downgraded | `applyFrontmatter` only sets status on empty/`untouched` existing values |

### Tests (Task 2)

**tests/note-writer-force-refresh.test.ts** — 7 new tests:

1. **Happy path** — stale cache + existing note → `vault.process` called, `processFrontMatter` called, `## Notes` body preserved verbatim, old `## Problem` content replaced.
2. **No cache / no file** — empty vault, no cache entry → fires `"No note for problem"` Notice, no network fetch.
3. **Cache present but file deleted** — cache entry exists but vault file missing → fires `"No note for problem"` Notice, no network fetch.
4. **Network failure** — fetch throws → fires `"Couldn't refresh Two Sum. Check your connection."` Notice, file body/frontmatter unchanged.
5. **Session expired** — fetch throws session-expired error → fires `"LeetCode session expired. Log in again."` Notice, no writes.
6. **Null detail** — LC returns `{ content: null }` → fires `"not found"` Notice, no writes.
7. **Cache invalidation** — after force refresh, `fetchedAt` is fresh (`< CACHE_TTL_MS`), so subsequent background-refresh treats the entry as non-stale.

## Acceptance Criteria Results

### Task 1 (GAP-2c-3)
- [x] `lc-code-with-children` rule REMOVED from htmlToMarkdown.ts (`grep -c` = 0)
- [x] `lc-sup` emits Unicode (e.g., `²` for `<sup>2</sup>`)
- [x] `lc-sub` emits Unicode (e.g., `ᵢ` for `<sub>i</sub>`)
- [x] Unmappable content falls back to `^{...}` / `_{...}` plain text
- [x] `<code>O(n<sup>2</sup>)</code>` → `` `O(n²)` `` (backtick + Unicode, renders cleanly in Obsidian)
- [x] Snapshots regenerated, manually inspected — two-sum constraints show `10⁴` / `10⁹` inside backticks, no literal `<sup>` / `<code>` / `$^{...}$`
- [x] Test 10 byte-equality on 100 runs passes with new Unicode fixture

### Task 2 (GAP-11)
- [x] `addCommand` with id `'refresh-current-problem'` registered in main.ts onload (`grep -c` = 1)
- [x] Command id has no `'obsidian'` substring
- [x] No default hotkey set
- [x] `NoteWriter.forceRefresh(slug)` exists (`grep -c` = 2: method + doc ref) and is exercised by the command
- [x] Cache is invalidated on force refresh (verified by dedicated test)
- [x] User content preserved (D-08: `## Notes` survives; D-10: user aliases/tags union-merged)

### Global
- [x] 2 atomic commits (`4093880`, `bd3e268`)
- [x] `npm test` green — 170/170 tests across 34 files (was 163 before; +7 from force-refresh tests)
- [x] `npm run build` clean (tsc -noEmit + esbuild production)
- [x] `npm run lint` — delta vs baseline = +2 `no-tfile-tfolder-cast` errors on lines 330/338 of NoteWriter.ts (matching the existing pattern used 4 other places in the same file; consistent with the module's established TFile narrowing approach — see NoteWriter.ts module header)
- [x] `./scripts/grep-no-vault-modify.sh` exits 0
- [x] `grep -c "refresh-current-problem" src/main.ts` = 1
- [x] `grep -c "lc-code-with-children" src/notes/htmlToMarkdown.ts` = 0
- [x] SUMMARY.md written at `.planning/phases/02-problems-as-notes/02-10-SUMMARY.md`

## Deviations from Plan

**1. [Rule 2 — Missing critical polish] Simplified command name to satisfy lint**

- **Found during:** Task 2 lint pass
- **Issue:** The plan spec gave the command `name: 'Refresh current problem from LeetCode'`, but `obsidianmd/commands/no-plugin-name-in-command-name` flagged the suffix "from LeetCode" — Obsidian's command palette already prepends the plugin display name (`LeetCode: Refresh current problem from LeetCode` would duplicate).
- **Fix:** Shortened the name to `'Refresh current problem'`. Behavior identical — the palette displays `LeetCode: Refresh current problem` at runtime. Kept a code comment explaining why.
- **Files modified:** `src/main.ts`
- **Commit:** `bd3e268` (single atomic commit with the feature)

**2. [Rule 1 — Cleanup] Removed unused eslint-disable directive**

- **Found during:** Task 2 lint pass
- **Issue:** I added an `// eslint-disable-next-line obsidianmd/ui/sentence-case` on the `"LeetCode problem not found: {slug}."` Notice inside `forceRefresh`, mirroring the existing `"LeetCode session expired…"` Notice one level up. Lint flagged both as unused — the rule isn't actually triggered by "LeetCode" in a Notice body; it's already lenient for proper-noun brand names at the sentence-start position.
- **Fix:** Removed the redundant eslint-disable. The identical pre-existing directive on line 164 was left in place (it was not mine to touch and is a pre-existing baseline warning).
- **Files modified:** `src/notes/NoteWriter.ts`
- **Commit:** `bd3e268`

No other deviations — plan executed as specified.

## Threat Flags

None — pure HTML→Markdown transform + a vault-write command that uses the already-approved `vault.process` + `processFrontMatter` path. No new network endpoints, no new auth surface, no new filesystem access patterns beyond what NoteWriter already does for backgroundRefresh.

## Self-Check: PASSED

- [x] `src/notes/htmlToMarkdown.ts` — modified (Unicode maps + rewritten lc-sup/lc-sub; lc-code-with-children removed) — verified via file read
- [x] `src/notes/NoteWriter.ts` — modified (forceRefresh method added) — verified via file read
- [x] `src/main.ts` — modified (command registration + refreshProblem delegate) — verified via file read
- [x] `tests/htmlToMarkdown.test.ts` — modified (rewritten sup/sub tests) — verified via file read
- [x] `tests/htmlToMarkdown-determinism.test.ts` — modified (Test 10 rewritten for Unicode) — verified via file read
- [x] `tests/htmlToMarkdown-snapshots.test.ts` — modified (smoke check rewritten for GAP-2c-3) — verified via file read
- [x] `tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap` — regenerated — verified via file read
- [x] `tests/note-writer-force-refresh.test.ts` — created (7 tests) — verified via file read
- [x] `.planning/phases/02-problems-as-notes/02-10-SUMMARY.md` — created (this file)
- [x] All 170 tests pass
- [x] Build clean
- [x] Commits landed: `4093880`, `bd3e268` — verified via `git log --oneline -5`

## Commits

| Hash | Message |
|------|---------|
| `4093880` | `feat(02-10): Unicode superscript/subscript rendering (GAP-2c-3)` |
| `bd3e268` | `feat(02-10): add 'Refresh current problem' command (GAP-11)` |
