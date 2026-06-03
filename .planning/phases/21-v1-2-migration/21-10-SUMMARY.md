---
phase: 21-v1-2-migration
plan: 10
subsystem: migration
tags: [migration, banner, reading-mode, post-processor, gap-closure, phase-21, uat-fix]
requires: [phase-21/plan-01, phase-21/plan-02]
provides: [reading-mode-legacy-banner-discovery]
affects: [src/main/readingModeLegacyBannerPostProcessor.ts, src/main.ts]
tech-stack:
  added: []
  patterns: [registerMarkdownPostProcessor, instanceof TFile narrowing, async post-processor callback, ## Code section-context detection, isMigrationCandidate predicate gate]
key-files:
  created:
    - src/main/readingModeLegacyBannerPostProcessor.ts
    - tests/main/readingModeLegacyBannerPostProcessor.test.ts
    - .planning/phases/21-v1-2-migration/21-10-SUMMARY.md
  modified:
    - src/main.ts
decisions:
  - "Use registerMarkdownPostProcessor (NOT registerMarkdownCodeBlockProcessor) — the latter is tag-bound to literal 'leetcode-solve' fences, so v1.2 ```java / ```python fences never reach it."
  - "Use instanceof TFile narrowing (matching codeBlockProcessor.ts pattern) rather than duck-typing — passes obsidianmd/no-tfile-tfolder-cast lint check."
  - "Section-context detection prefers ctx.getSectionInfo(element).text (walks lines upward to find nearest preceding ## heading); falls back to single-candidate-block heuristic when getSectionInfo returns null (embed/detached-render contexts)."
  - "Module file BEGINS with the literal token PHASE_22_DELETE_WITH_V1_2_PATH so Phase 22 cleanup can grep + mechanically delete; marker also appears on import + wiring callsite in src/main.ts."
  - "Test 17 hard-locks the header-marker presence by reading the file's first non-empty line via fs.readFileSync — silent-drop regressions become visible CI failures."
metrics:
  duration: ~25min
  completed: 2026-06-01
  tasks: "1/1 implementation task (Task 2 is checkpoint:human-verify — auto-approved per auto_advance=true config; live UAT regression is the orchestrator's responsibility)"
  files_changed: 3
  tests_added: 17
---

# Phase 21 Plan 10: Reading-mode legacy-banner post-processor (UAT gap-closure) Summary

JWT-style one-liner: Adds a non-tag-bound `registerMarkdownPostProcessor` so the v1.2 → v1.3 migration banner appears in Reading mode for `lc-slug` notes carrying ` ```java ` / ` ```python ` / etc. fences when `useInlineWidget=ON` AND `autoMigrateOnOpen=OFF` — closes UAT Gap 3 / Test 4a where `mountLegacyFenceBanner('manual-prompt')` was structurally unreachable.

## What Got Built

A new Reading-mode post-processor at `src/main/readingModeLegacyBannerPostProcessor.ts` that:

1. **Resolves the parent file** via `app.vault.getAbstractFileByPath(ctx.sourcePath)` and bails on non-TFile.
2. **Gates** on six conditions (must ALL hold to render the banner):
   - `lc-slug` frontmatter present + non-empty.
   - `useInlineWidget=ON` (master gate honored).
   - `autoMigrateOnOpen=OFF` (auto-migrate path takes precedence when ON).
   - `isMigrationCandidate(text, fm) === true` (the 5-clause strict-match predicate from Plan 21-01).
   - Rendered DOM contains a `<pre><code class="language-{slug}">` whose slug resolves (via `resolveLangSlug` + `LC_LANG_SLUGS`) to a recognized LC langSlug.
   - The matched fence is logically inside `## Code` (verified via `ctx.getSectionInfo(element)?.text` upward heading-walk; fallback: single-matched-candidate heuristic when getSectionInfo returns null).
3. **Replaces** the matched `<pre>` with a `<div class="leetcode-migration-banner-host">` and calls `mountLegacyFenceBanner(host, source, file, plugin, 'manual-prompt')` — reusing Plan 21-02's banner UX (copy + [Migrate now] + read-only `<pre><code>`) verbatim.
4. **Wraps** the entire pipeline in try/catch; any throw is logged at `logger.debug` and leaves the rendered DOM untouched. Reading mode renders Obsidian's default code block — no banner, no crash.

The module file **begins** with the literal token `PHASE_22_DELETE_WITH_V1_2_PATH` (header block-comment) so Phase 22's cleanup script can grep for it and mechanically delete the file. The same marker is repeated on the import line and the wiring callsite in `src/main.ts` for full grep coverage.

### Wiring (src/main.ts)

The new post-processor is registered inside the existing `useInlineWidget=ON` block of `Plugin.onload()`, immediately after the tag-bound `registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this))` call. This colocation is intentional: the two processors handle complementary fence shapes (v1.3 `leetcode-solve` vs. v1.2 langSlug) and never race because they target different DOM nodes.

## Why This Closes Gap 3

Per `21-HUMAN-UAT.md` lines 140-174 (root cause A) and the plan's `<objective>`:

- The existing `registerMarkdownCodeBlockProcessor('leetcode-solve', ...)` only fires for fences literally tagged ` ```leetcode-solve `.
- v1.2 notes carry ` ```java ` / ` ```python ` / etc. — Obsidian's default markdown processor renders them, the LC plugin's code-block processor never sees them, and `mountLegacyFenceBanner('manual-prompt')` (registered inside `leetCodeBlockProcessor` at `codeBlockProcessor.ts:198`) is structurally unreachable.
- The user has no in-note way to discover or trigger migration when `autoMigrateOnOpen=OFF` — they must use the command palette.
- The new non-tag-bound `registerMarkdownPostProcessor` walks the rendered DOM after Obsidian's default markdown processor finished, locates the LC-langSlug `<pre><code>`, and replaces it with the banner UX.

## Tests (17 new)

`tests/main/readingModeLegacyBannerPostProcessor.test.ts`:

| Group | # | Coverage |
|-------|---|----------|
| Gates | 1 | `lc-slug` missing → no DOM mutation |
| Gates | 2 | `useInlineWidget=OFF` → no DOM mutation |
| Gates | 3 | `autoMigrateOnOpen=ON` → no DOM mutation (auto-path takes over) |
| Gates | 4 | `isMigrationCandidate` returns false (text fence) → no DOM mutation |
| Gates | 5 | `ctx.sourcePath` resolves to non-TFile → no DOM mutation, no throw |
| Gates | 6 | Note already has ` ```leetcode-solve ` (idempotent) → no DOM mutation |
| Walker | 7 | Single ` ```java ` under `## Code` → pre replaced + banner mount called |
| Walker | 8 | ` ```python3 ` alias resolved → banner mount called |
| Walker | 9 | ` ```text ` (unrecognized slug) → no DOM mutation |
| Walker | 10 | Multiple blocks; LC slug NOT first → still locates and replaces it |
| Walker | 11 | No `pre > code` children → no DOM mutation, no throw |
| Walker | 12 | `pre.replaceWith` throws → caught, `logger.debug` called, no rethrow |
| Source | 13 | `code.textContent` extracted byte-exactly (whitespace + tabs preserved) |
| Section | 14 | `getSectionInfo` points at fence under `## Code` → render banner |
| Section | 15 | `getSectionInfo` points at fence under `## Notes` → no DOM mutation |
| Section | 16 | `getSectionInfo` null + single matched langSlug block → render banner (fallback) |
| CI lock | 17 | Module file's first non-empty line contains `PHASE_22_DELETE_WITH_V1_2_PATH` |

All 17 tests pass. Full suite remains green (2973 passed, 6 pre-existing skips).

## Verification

| Gate | Result |
|------|--------|
| `npx vitest run tests/main/readingModeLegacyBannerPostProcessor.test.ts` | 17/17 pass |
| `npm run build` (tsc + esbuild production) | exit 0 |
| `grep -c PHASE_22_DELETE_WITH_V1_2_PATH src/main/readingModeLegacyBannerPostProcessor.ts` | 2 (header + reference; ≥ 1 required) |
| `grep -c PHASE_22_DELETE_WITH_V1_2_PATH src/main.ts` | 2 (import line + wiring callsite) |
| `npx eslint` on new files | 0 errors, 0 warnings |
| Full vitest suite (2979 tests) | 2973 passed, 6 skipped (pre-existing) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Lint cleanup] Use `instanceof TFile` instead of duck-typed cast**
- **Found during:** Task 1 — `npx eslint src/main/readingModeLegacyBannerPostProcessor.ts`
- **Issue:** ESLint plugin `obsidianmd/no-tfile-tfolder-cast` flagged the duck-typed cast `as unknown as TFile` (rule: prefer `instanceof TFile`).
- **Fix:** Imported `TFile as TFileRuntime` from `'obsidian'` (matching the `codeBlockProcessor.ts` pattern at line 117) and used `if (!(fileLike instanceof TFileRuntime)) return;`. Test mock factory updated to construct `new TFile(path)` instances so the runtime narrow returns true under happy-dom.
- **Files modified:** `src/main/readingModeLegacyBannerPostProcessor.ts`, `tests/main/readingModeLegacyBannerPostProcessor.test.ts`
- **Commit:** included in `75a767a`

**2. [Rule 1 — Lint cleanup] Drop `globalThis.activeDocument` fallback**
- **Found during:** Task 1 — eslint
- **Issue:** ESLint plugin `obsidianmd/no-global-this` flagged the `globalThis as { activeDocument?: Document }` lookup.
- **Fix:** Replaced the fallback chain with a direct `target.pre.ownerDocument` read. `ownerDocument` is guaranteed correct in popout-window contexts because the `pre` element itself lives in the popout-window's document tree — Obsidian hands the post-processor the popout-window-rooted `element`. No global lookup needed.
- **Files modified:** `src/main/readingModeLegacyBannerPostProcessor.ts`
- **Commit:** included in `75a767a`

These two adjustments are CLAUDE.md-driven (`obsidianmd/no-tfile-tfolder-cast`, `obsidianmd/no-global-this`, `obsidianmd/prefer-active-doc` are project lint rules); behavior is unchanged.

## Threat Surface Scan

No new threat surface beyond the plan's `<threat_model>`. The post-processor:
- Reads frontmatter (`metadataCache`) — same trust boundary as Plan 21-02's `codeBlockProcessor.ts`.
- Reads note text (`vault.cachedRead`) — same trust boundary.
- Mutates DOM (`pre.replaceWith(host)` + `mountLegacyFenceBanner` appends children) — same trust boundary as Plan 21-02 banner mount.
- Adds NO new write paths (the [Migrate now] click handler delegates to the existing `migrateLegacyFenceIfNeeded` migrator from Plan 21-01).

## Known Stubs

None. The discovery path is fully wired; the click-through path leverages Plan 21-02's existing banner mount + Plan 21-01's existing migrator.

## Auth Gates

None.

## TDD Gate Compliance

- RED commit `2ee3848`: 17 failing tests (module not yet created — `Failed to resolve import`).
- GREEN commit `75a767a`: implementation + main.ts wiring; all 17 tests pass.
- REFACTOR: not needed (the GREEN implementation is the final shape).

## Self-Check: PASSED

- `src/main/readingModeLegacyBannerPostProcessor.ts` — FOUND
- `tests/main/readingModeLegacyBannerPostProcessor.test.ts` — FOUND
- Commit `2ee3848` (RED) — FOUND
- Commit `75a767a` (GREEN) — FOUND
- Header marker `PHASE_22_DELETE_WITH_V1_2_PATH` in module file — FOUND (count: 2)
- Marker in `src/main.ts` import + wiring — FOUND (count: 2)
- Build clean — VERIFIED
- 17/17 unit tests pass — VERIFIED
- Full suite 2973/2979 pass — VERIFIED (6 pre-existing skips unchanged)
