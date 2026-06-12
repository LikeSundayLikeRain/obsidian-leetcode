---
created: 2026-06-11T03:38:10.951Z
title: Multi-fence support per problem note
area: planning
status: deferred
deferred_to: v1.4
deferred_at: 2026-06-12
deferred_reason: "Not in v1.3 scope. Surface as a v1.4 candidate during /gsd-new-milestone."
files:
  - src/widget/selfWriteSuppression.ts:56
  - src/widget/selfWriteSuppression.ts:75
  - src/widget/applyAuthoritativeBody.ts:95-98
  - src/widget/debouncedWriter.ts:215-220
  - src/widget/debouncedWriter.ts:234
  - src/widget/fenceLocator.ts:33-99
  - src/widget/fenceLocator.ts:126-137
  - src/widget/widgetRegistry.ts:3-7
  - src/main.ts:1305-1576
  - src/main.ts:1336-1342
  - src/main.ts:1352-1358
  - src/main.ts:1419
  - src/main.ts:1454
  - src/main.ts:2575
  - src/main.ts:2906
  - src/main.ts:3385
  - src/main.ts:380
  - src/solve/codeExtractor.ts:90-145
  - src/solve/resolveStarterCode.ts:110
  - src/solve/starterCodeInjector.ts:165-273
  - src/solve/resetCodeWithConfirm.ts:177-225
  - src/main/runLanguageSwitch.ts
  - src/widget/ConflictModal.ts:73-78
---

## Problem

User wants to keep MULTIPLE solution drafts under ONE problem note — different
approaches to the same problem (e.g. "brute force in Python" vs "optimal DP in
Python"), each as its own `leetcode-solve` fenced block under the `## Notes`
H2, each with its own Run / Submit / AI buttons.

This is a UX request, not an LC-data request: LC's `codeSnippets` GraphQL
returns one entry per `langSlug`, and the plugin already handles different
langSlugs (DB problems' `mysql`/`mssql`/`oraclesql`/`pythondata`) via the
chevron switcher. Multi-block is about user-authored alternates.

User's proposed shape (from conversation 2026-06-10):
- Multiple `leetcode-solve` fences allowed per note, each under `## Notes` H2.
- Per-block run/submit buttons (already per-widget — they currently dispatch
  via the path-keyed singleton model and would need to bind to the fence the
  button lives on).
- `lc-language` frontmatter SSOT replaced by per-fence metadata. User
  suggested an info-string param (e.g. ` ```leetcode-solve python3 `) or a
  hidden/plugin-managed comment line above each fence.
- "At most 1 active block at any given point" — the active-block selector is
  whichever the user is currently editing (cursor location / last-focused
  widget). Active-block only matters for global commands (palette
  `LeetCode: Run`, AI Debug); per-block buttons are unambiguous.

User concern (CRITICAL): "we had sync nightmare in 1.2 and refactor in 1.3,
i don't want déjà vu again". Multi-fence touches the Wave-3 sync pipeline.
This is NOT a small change — verifier confirmed (HIGH confidence) that 6
load-bearing sync invariants are single-fence-only.

## Solution

### Verified scope (subagent verification 2026-06-10, HIGH confidence on items 1, 2, 6; MEDIUM on items 3, 5)

**Re-key SelfWriteSuppression by `(path, fenceIndex)` — REQUIRED.**
- `src/widget/selfWriteSuppression.ts:56` — `Map<string, SuppressionEntry>` keyed only by path.
- `src/widget/selfWriteSuppression.ts:75` — `arm()` does `this.map.set(path, entry)`, unconditionally clobbers any prior entry. There is exactly ONE slot per path; second arm overwrites the first.
- `src/widget/debouncedWriter.ts:234` — every `DebouncedWriter` arms with `this.file.path` only, no fence index.
- `src/widget/applyAuthoritativeBody.ts:95-98` — existing code explicitly bails out (does NOT arm suppression) when `fenceCountInNext !== 1`. This is the codebase's own concession that multi-fence wasn't designed for.

**Concrete race trace (Q2 in subagent verification):**
1. Fence A's writer arms `path → hash X` (line 75).
2. Fence B's writer arms before A's modify event drains → `path → hash Y` (clobbers X).
3. A's modify event fires; `tryConsume(path, X_observed)` reads entry Y, `Y !== X_observed`, hits the defensive-delete branch (line 127) → returns `'miss'`.
4. main.ts:1370 receives `'miss'`, falls through to external-edit handling. main.ts:1538 calls `firstMatch.reloadFromDisk('silent')` — clobbers fence A's just-written body in the live widget by full-doc-replace (WidgetController.ts:883-887).
5. Worse, B's modify event then fires; map is now empty → `'miss'` again. Same clobber on fence B.

### Other Wave-3 invariants requiring attention (even after re-keying)

1. **Modify-handler `firstMatch` selection** (`src/main.ts:1336-1342`) picks ONE editable widget per path. With multi-fence, must iterate all matches and resolve which fence's body changed by hashing `extractFenceBody(disk, idx)` per-controller. The Pitfall P2 hash gate at `src/main.ts:1352-1358` is per-fence today by accident (firstMatch's fence) and silently swallows external edits to other fences — UNSAFE: fence B's external edit is invisible to its conflict modal.

2. **`countLeetCodeSolveFenceOpeners === 1` guard** at `src/widget/applyAuthoritativeBody.ts:95-98` — disables arming entirely for multi-fence; must be relaxed to `>= 1` once keys are fence-scoped.

3. **Debouncer's drift detector** at `src/widget/debouncedWriter.ts:215-220` (`actualCount > expectedFenceIndex + 1`) — currently treats any fence count growth as drift. Multi-fence means inserting fence #3 above active fence #1 is legitimate; needs a stable fence-identity (e.g. position-stable hash, or a fence-id frontmatter field).

4. **`peekOriginator` + `routePeerSync`** (`src/widget/selfWriteSuppression.ts:100-108`, `src/main.ts:1363-1407`) — originator is path-scoped. Re-keying by `(path, fenceIndex)` fixes this for free if `routePeerSync` is updated.

5. **`activeConflictModal` is a plugin-singleton** (`src/main.ts:380`, `src/widget/ConflictModal.ts:73-78`) — a single modal can't represent two simultaneous conflicts on different fences in the same file. Either keyed map of modals, or modal switches between fences.

6. **`reloadFromDisk('silent')` is per-fence already** (WidgetController reads `extractFenceBody(disk, this.fenceIndex)`) — already correct for multi-fence by construction. Good news: the only fence-scoped piece that already works.

### Already N-ready by accident (do NOT need changes)

- `WidgetRegistry` keys on `${file.path}::${fenceIndex}::${leafId}` (`src/widget/widgetRegistry.ts:3-7`).
- `computeFenceIndex` in `src/widget/fenceLocator.ts:126-137` already counts leetcode-solve openers BEFORE a given line.
- `fenceSerialization.ts` is per-fence byte-exact.
- `applyAuthoritativeBody` threads `fenceIndex` through (just bails on multi-fence).
- `vault.process` is Obsidian-serialized for concurrent calls on the same file (no torn writes — but does NOT solve the modify-event echo ordering problem).

### Per-fence language SSOT (frontmatter `lc-language` replacement)

7 first-match call-sites in the plugin assume one langSlug per file:
- `src/solve/resolveStarterCode.ts:110`
- `src/solve/starterCodeInjector.ts:347`
- `src/solve/resetCodeWithConfirm.ts:212`
- `src/notes/NoteWriter.ts:706`
- `src/main.ts:2147`, `src/main.ts:3385`
- `src/browse/ProblemBrowserView.ts:972`

User-suggested designs:
- **Info-string params**: `` ```leetcode-solve python3 approach=optimal `` — parse the opener line. Pros: 1:1 binding to the fence, survives copy/paste, no orphan comments. Cons: needs a stable parser shared between Live Preview view plugin and Reading mode `registerMarkdownCodeBlockProcessor`.
- **HTML comment above fence**: `<!-- leetcode-block lang=python3 approach=optimal -->`. Pros: invisible in Live Preview/Reading, human-editable. Cons: can drift from the fence (delete the comment, lose metadata).

Info-string is cleaner. `lc-language` stays as the canonical-fence default for the existing single-fence-under-`## Code` pattern; alternate fences under `## Notes` derive language from their info-string. Migration is a no-op for existing notes.

### Active-block resolution

For per-block buttons: unambiguous — button binds to its own fence.
For global commands (palette `LeetCode: Run`, AI Debug):
- Cursor in fence → that fence is active.
- No cursor in fence → last-focused widget on this file.
- No widgets focused → fall back to canonical fence under `## Code`, or first fence in document.

### Sketch options (from earlier conversation)

- **Sibling fences under per-language H3 headings within `## Notes`** — most Obsidian-native; needs SSOT redesign + active-fence chevron/toolbar.
- **Tabbed single-fence widget** — keeps `lc-language` scalar; tabs render over one buffer, NOT multiple drafts. Doesn't solve user's actual need.
- **One note per (problem, language/approach) linked from a parent** — mirrors vscode-leetcode, sidesteps suppression/SSOT entirely. Loses "side by side" but gains zero risk to Wave 3.

### Recommended shape (per conversation)

**Option B: prototype on a v1.4 branch behind a `multiFenceEnabled` setting, gated off by default, dogfood for a release cycle.** Treats it like a controlled Wave 4. Do NOT ship in the same release as v1.3 stabilization.

If user picks "do it":
1. Re-key SelfWriteSuppression + DebouncedWriter + peekOriginator/routePeerSync atomically.
2. Generalize modify-handler from `firstMatch` to `allMatches` with per-fence hashing.
3. Generalize `activeConflictModal` to a `Map<(path,fenceIndex), modal>`.
4. Info-string parser for per-fence language metadata.
5. Generalize the 7 first-match call-sites to take a `(file, fenceIndex)` target.
6. Multi-fence integration test harness (current `tests/widget/` fixtures bake in single-fence assumptions — verifier flagged this would push confidence from MEDIUM→HIGH on items 3 and 5).
7. Migration is a no-op for existing notes (one fence under `## Code`, info-string defaults to `lang=lc-language`).

If user picks "linked notes instead": mostly a NoteWriter / template change, no sync-pipeline risk.

## Source / Status

Captured during conversation 2026-06-10 after vim Cmd+V fix shipped (PR #27).
User leaning toward option 3 (linked notes) or option B (gated v1.4 prototype) due to Wave-3 déjà vu concern. NOT committed to building this; revisit after BRAT 1.3 stabilizes.

Subagent verification artifacts: workflow `wf_0b78e321-595` (LC data + arch blast-radius + UX precedents) and a follow-up SelfWriteSuppression deep-dive (HIGH confidence on data structure clobber; MEDIUM on conflict-modal severity).
