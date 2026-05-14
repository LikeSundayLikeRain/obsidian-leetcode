---
phase: 02-problems-as-notes
plan: 02
subsystem: notes
tags: [notes, schema, turndown, html-to-markdown, heading-ownership, frontmatter-union]
dependency_graph:
  requires:
    - src/settings/SettingsStore.ts (read-only reference for sanitizeFolder shape + DEFAULT_DATA pattern)
    - src/shared/logger.ts (read-only reference for module-scoped singleton pattern)
    - turndown@7.2.4 (runtime dependency, already installed by Plan 01)
    - obsidian@1.12.3 type surface: App, TFile, FileManager.processFrontMatter
  provides:
    - src/notes/NoteTemplate.ts — PLUGIN_LC_KEYS, LC_TAG_PREFIX, NoteTemplateInput, buildNoteFilename, buildNotePath, buildNoteBody, buildFrontmatterInput, applyFrontmatter
    - src/notes/htmlToMarkdown.ts — htmlToMarkdown(html) deterministic transform
    - src/notes/HeadingRegion.ts — PROBLEM_HEADING_LINE, rewriteProblemSection (pure, retry-safe for vault.process)
    - src/notes/types.ts — DetailCacheEntry (inline for Wave 1; Plan 04 swaps to re-export)
    - src/notes/turndown.d.ts — local type shim for turndown 7.2.4 (bundled package ships no d.ts)
  affects:
    - Plan 02-03 (NoteWriter) — consumes applyFrontmatter, rewriteProblemSection, buildNoteBody/Path/Filename, htmlToMarkdown, DetailCacheEntry
    - Plan 02-04 (SettingsStore extension) — will replace the inline DetailCacheEntry with a re-export once SettingsStore owns the shape
    - Plan 02-05 (NoteOrchestrator) — consumes the full NoteTemplate + htmlToMarkdown + HeadingRegion surface via NoteWriter
tech_stack:
  added:
    - turndown import wired from 'turndown' (runtime dep — already installed, now first used)
    - local `declare module 'turndown'` shim in src/notes/turndown.d.ts
  patterns:
    - Module-scoped singleton (cached TurndownService) mirroring src/shared/logger.ts posture
    - `as const` module-top constant arrays for schema SSoT (mirrors SettingsStore DEFAULT_DATA shape)
    - Union-merge-inside-callback for processFrontMatter (D-10; Pitfall 1 guard)
    - Pure line-scan rewriter with zero imports (safe as vault.process retry callback; Pitfall 4 guard)
key_files:
  created:
    - src/notes/NoteTemplate.ts
    - src/notes/types.ts
    - src/notes/htmlToMarkdown.ts
    - src/notes/HeadingRegion.ts
    - src/notes/turndown.d.ts
    - tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
  modified: []
decisions:
  - Used local turndown.d.ts shim instead of adding @types/turndown to devDependencies (CLAUDE.md minimal-new-dep posture)
  - DetailCacheEntry inlined in src/notes/types.ts for Wave 1; Plan 04 will replace with re-export from SettingsStore
  - applyFrontmatter guards lc-status downgrade against empty string AND 'untouched' (treat both as "safe to initialize")
metrics:
  duration: "~15 min"
  completed_date: 2026-05-08
---

# Phase 02 Plan 02: Notes Utilities (NoteTemplate, htmlToMarkdown, HeadingRegion) Summary

Three pure-utility modules anchor Phase 2's semantics with no Vault coupling: a schema single-source-of-truth for `lc-*` frontmatter keys and the `lc/` tag namespace, a deterministic turndown wrapper for LC's HTML, and a pure line-scan rewriter for the plugin-owned `## Problem` region. None of these touch Vault directly, so all 11 RED tests go GREEN under vitest without a live Obsidian runtime.

## What Landed

| Export | File | Purpose |
|--------|------|---------|
| `PLUGIN_LC_KEYS` | `src/notes/NoteTemplate.ts` | The 7 lc-* frontmatter keys (D-03 schema lock) |
| `LC_TAG_PREFIX` | `src/notes/NoteTemplate.ts` | Canonical `lc/` tag namespace prefix |
| `NoteTemplateInput` | `src/notes/NoteTemplate.ts` | Input shape for applyFrontmatter |
| `buildNoteFilename` | `src/notes/NoteTemplate.ts` | D-16 unpadded `{id}-{slug}.md` |
| `buildNotePath` | `src/notes/NoteTemplate.ts` | Joins folder + filename; strips trailing slashes |
| `buildNoteBody` | `src/notes/NoteTemplate.ts` | D-01 two-heading body: `## Problem` + `## Notes` |
| `buildFrontmatterInput` | `src/notes/NoteTemplate.ts` | Derive NoteTemplateInput from cached detail + default language |
| `applyFrontmatter` | `src/notes/NoteTemplate.ts` | Async atomic write via processFrontMatter with union-merge tags & aliases (D-10) and lc-status protection (D-04) |
| `htmlToMarkdown` | `src/notes/htmlToMarkdown.ts` | Deterministic turndown wrapper with fenced-code + img rule + escape disabled |
| `PROBLEM_HEADING_LINE` | `src/notes/HeadingRegion.ts` | Exact string `'## Problem'` the rewriter searches for |
| `rewriteProblemSection` | `src/notes/HeadingRegion.ts` | Pure (current, newMarkdown) → string splicer |
| `DetailCacheEntry` | `src/notes/types.ts` | Wave 1 inline; Plan 04 replaces with re-export |

## Commits

| Task | Commit | Scope |
|------|--------|-------|
| 1 — NoteTemplate.ts + types.ts schema SSoT | `50c47b2` | D-03/04/05/06/10/16 locked in code |
| 2 — htmlToMarkdown turndown wrapper | `310f272` | D-20/21 locked in code (+ 3 snapshot files) |
| 3 — HeadingRegion pure line-scan rewriter | `88d5133` | D-08/09 locked in code |
| type shim fix | `a24afaa` | Rule 3 auto-fix: local `declare module 'turndown'` shim |

## Tests Turned GREEN

All 11 utility-level RED tests now GREEN:

| File | Tests | Covers |
|------|-------|--------|
| `tests/note-filename.test.ts` | 3 | D-16 unpadded filename, trailing-slash strip, nested folder |
| `tests/note-frontmatter-write.test.ts` | 2 | 7 lc-* keys + aliases + tags on empty fm; D-04 lc-status protection |
| `tests/note-frontmatter-tags.test.ts` | 3 | D-05 Phase 2 tag = difficulty only; buildFrontmatterInput excludes topic tags |
| `tests/note-frontmatter-preserve-user-tags.test.ts` | 2 | D-10 user-tag union; Phase-4-added topic tags survive Phase-2 re-open |
| `tests/note-frontmatter-preserve-user-aliases.test.ts` | 2 | D-06 String(id) alias; Pitfall 9 guard; union with user aliases |
| `tests/htmlToMarkdown.test.ts` | 4 | fenced python code block, img rule, empty input, no HTML tags |
| `tests/htmlToMarkdown-determinism.test.ts` | 2 | 100-run byte-identity, singleton cache safety across inputs |
| `tests/htmlToMarkdown-snapshots.test.ts` | 3 | fixture snapshots for two-sum / median / regex |
| `tests/heading-region.test.ts` | 3 | rewrite preserves `## Notes`, `## Solution`, `## Techniques`; pure function |
| `tests/heading-region-rename.test.ts` | 1 | D-09 clarified: re-insert `## Problem` above user's renamed section |
| `tests/heading-region-reinsert.test.ts` | 2 | Missing heading → insert above `## Notes`; empty doc → insert at top |

Total: **27 tests across 11 files GREEN**.

## Invariants Verified

Recorded grep outputs (2026-05-08):

```
$ grep -rE "[\"'\`](lc-id|lc-slug|lc-title|lc-difficulty|lc-url|lc-status|lc-language)[\"'\`]" src/ --include='*.ts' | grep -v 'NoteTemplate.ts' | grep -v 'types.ts'
(empty — D-03 SSoT for lc-* keys HOLDS)

$ grep -rE "'lc/" src/ --include='*.ts' | grep -v 'NoteTemplate.ts'
(empty — D-03 SSoT for lc/ tag prefix HOLDS)

$ ./scripts/grep-no-vault-modify.sh
OK: no vault.modify() calls in src/notes/ or src/browse/

$ grep -E "codeBlockStyle:\s*'fenced'" src/notes/htmlToMarkdown.ts  # exits 0
$ grep -E "service\.escape\s*=" src/notes/htmlToMarkdown.ts         # exits 0
$ grep -E "addRule\(['\"]lc-image" src/notes/htmlToMarkdown.ts      # exits 0

$ grep -E "^import " src/notes/HeadingRegion.ts | wc -l
0  (HeadingRegion imports nothing — pure module)
```

## Deviations from Plan

### [Rule 3 - Missing dependency] Added local turndown type shim

- **Found during:** verification (`npm run build` — tsc -noEmit phase)
- **Issue:** `turndown@7.2.4` ships no bundled `.d.ts`; CLAUDE.md's recommended stack didn't flag that `@types/turndown` would be needed. tsc reported `TS7016: Could not find a declaration file for module 'turndown'`.
- **Fix:** Created `src/notes/turndown.d.ts` with a minimal `declare module 'turndown'` covering only the surface htmlToMarkdown.ts uses (constructor, `turndown()`, `addRule()`, `keep()`, `escape` field). Preserves CLAUDE.md's minimal-new-dep posture — `@types/turndown` NOT added to devDependencies.
- **Files modified:** `src/notes/turndown.d.ts` (new)
- **Commit:** `a24afaa`

### [Rule 1 - Bug] Tightened lc-status guard

- **Found during:** Task 1 implementation
- **Issue:** The RESEARCH.md Pattern 1 snippet guards only `typeof fm['lc-status'] !== 'string'` before defaulting to `'untouched'`, which would leave an explicit empty string untouched and later fail other code paths that expect a non-empty enum.
- **Fix:** `applyFrontmatter` now also treats `''` and already-`'untouched'` as safe-to-initialize. Explicit `'accepted'` / other non-empty values still win and are never downgraded (D-04 test proves this).
- **Files modified:** `src/notes/NoteTemplate.ts`
- **Commit:** `50c47b2`

## Authentication Gates

None. Plan 02-02 is pure utility code with no network, no Vault, no session handling.

## Deferred Issues (out-of-scope for Plan 02-02)

Tracked in `.planning/phases/02-problems-as-notes/deferred-items.md`:

- **9 tsc errors in tests referencing unimplemented modules.** Wave 0 RED tests for `NoteWriter` (7 files: cache-ttl, new-note-fetch-failure, note-language-uses-settings, note-path-uses-settings, note-writer-folder, offline-regenerate, re-open-silent-offline) and `BaseFile` (2 files: base-file-ship, base-file-preserve) were committed by Plan 02-01 as RED. They resolve when Plan 02-03 (NoteWriter) and Plan 02-04 (BaseFile + NoteOrchestrator) land. `npm run build` runs `tsc -noEmit` across `tests/**/*.ts` so the whole suite surfaces here. Plan 02-02 code is clean (no Plan 02-02 file has any tsc or lint error).

## Success Criteria Checklist

- [x] `src/notes/NoteTemplate.ts`, `src/notes/htmlToMarkdown.ts`, `src/notes/HeadingRegion.ts`, `src/notes/types.ts` all exist with documented exports
- [x] `NoteTemplate.ts` is the ONLY source file containing the literal `lc-*` key names or the `lc/` tag namespace
- [x] `applyFrontmatter` union-merges tags AND aliases inside the `processFrontMatter` callback
- [x] `applyFrontmatter` never downgrades `lc-status` from a non-untouched value
- [x] `htmlToMarkdown` is deterministic (100-run invariance test passes)
- [x] `htmlToMarkdown` emits fenced code blocks with language extraction from `class="language-X"`
- [x] `rewriteProblemSection` is a pure function (same input → same output; no captured state; zero imports)
- [x] All 11 Phase 2 utility tests targeting these modules are GREEN (27 total test cases)
- [x] `./scripts/grep-no-vault-modify.sh` still passes (Plan 02-02 touches no vault methods)
- [~] `npm run build` — Plan 02-02 files compile cleanly; remaining tsc errors are pre-existing Wave 0 RED tests for Plans 02-03/04/05 (documented deferred)
- [x] `npm run lint` — zero new violations in Plan 02-02 files

## Self-Check: PASSED

### Created files exist

```
$ for f in src/notes/NoteTemplate.ts src/notes/types.ts src/notes/htmlToMarkdown.ts src/notes/HeadingRegion.ts src/notes/turndown.d.ts tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap; do
    [ -f "$f" ] && echo "FOUND: $f" || echo "MISSING: $f"
  done
FOUND: src/notes/NoteTemplate.ts
FOUND: src/notes/types.ts
FOUND: src/notes/htmlToMarkdown.ts
FOUND: src/notes/HeadingRegion.ts
FOUND: src/notes/turndown.d.ts
FOUND: tests/__snapshots__/htmlToMarkdown-snapshots.test.ts.snap
```

### Commits exist

```
$ for h in 50c47b2 310f272 88d5133 a24afaa; do
    git log --oneline --all | grep -q "$h" && echo "FOUND: $h" || echo "MISSING: $h"
  done
FOUND: 50c47b2
FOUND: 310f272
FOUND: 88d5133
FOUND: a24afaa
```
