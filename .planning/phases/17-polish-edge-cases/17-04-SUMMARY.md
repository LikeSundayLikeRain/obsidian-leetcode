---
phase: 17-polish-edge-cases
plan: 04
subsystem: nested-editor
tags: [fm-reactivity, language-compartment, metadata-cache, cm6, phase-17, d-13, d-14]
requires:
  - Phase 16 child editor language Compartment (childEditorLanguage.ts)
  - Phase 16 chevron metadataCache subscription pattern (codeActionsEditorExtension.ts:329-359)
  - Phase 13 child editor registry (childEditorRegistry.ts)
provides:
  - External `lc-language` frontmatter reactivity listener wired in onload
  - `LeetCodePlugin.handleFmChangeForLanguageReactivity(file, cache)` private method
  - `LeetCodePlugin.readActiveFenceSlug(file)` private helper (fence-opener slug derivation)
  - `.planning/phases/17-polish-edge-cases/17-UAT.md` Wave 2 manual UAT scaffold
affects:
  - src/main.ts
  - tests/main/fmReactivity.test.ts
  - .planning/phases/17-polish-edge-cases/17-UAT.md
tech_stack:
  added: []
  patterns:
    - "Pattern C — registerEvent for auto-cleanup on plugin unload"
    - "Pattern F — Compartment.reconfigure for live language swap (effect-only dispatch)"
    - "Pattern D — Mock-vault + vitest bootstrap for unit tests"
    - "Three-gate frontmatter listener (slug present → child registered → slug differs)"
    - "Prototype.call() helper extraction for unit-testable plugin methods (mirrors switchFenceLanguage.test.ts)"
key_files:
  created:
    - tests/main/fmReactivity.test.ts
    - .planning/phases/17-polish-edge-cases/17-UAT.md
    - .planning/phases/17-polish-edge-cases/17-04-SUMMARY.md
  modified:
    - src/main.ts
decisions:
  - "Effect-only dispatch carries NO `userEvent` annotation — effect dispatches without a `changes:` payload are not subject to the section-lock changeFilter per CLAUDE.md §Conventions; the convention's `'leetcode.*'` userEvent is required only for changes-bearing dispatches that target locked ranges. Test 6 codifies this with an inline guard comment so a future maintainer who adds a `changes:` payload is forced to revisit the userEvent decision."
  - "Stub `readActiveFenceSlug` directly on the test's fake plugin rather than mocking the active MarkdownView's CM6 state — production helper is exercised end-to-end via Plan 17-06's 17-UAT.md Test 12 in the dev vault. Keeps the unit test laser-focused on Gate 3 dedupe semantics without dragging the full CM6 + workspace stack into the harness (mirrors switchFenceLanguage.test.ts which mocks `dispatchChildLanguageReconfigure`'s collaborators)."
  - "No debounce on `metadataCache.on('changed')` — Gate 3 (slug equality check) is the canonical dedupe; per 17-RESEARCH.md Q4 RESOLVED, add 50ms debounce only if Plan 17-06 Test 12 reveals multiple fires per save. Starting without is the simpler default."
  - "Per D-14, the listener does NOT rewrite the fence opener tag. Frontmatter is the source of truth in passive-listener mode; users who want the fence opener flipped use the chevron. Test 5 asserts neither `vault.process` nor `processFrontMatter` is called from this code path across all four scenarios (happy / same-slug / no-slug / not-in-registry)."
metrics:
  duration_seconds: 240
  completed_date: "2026-05-23"
  tasks_completed: 3
  files_modified: 3
requirements_addressed: [LANG-01, INDENT-04, ENTER-02, ENTER-03, ENTER-04, COMMENT-01, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04]
---

# Phase 17 Plan 04: External `lc-language` fm reactivity (D-13/D-14) + Edge-Input UAT scaffold (D-07..D-10) Summary

Registered a `metadataCache.on('changed')` listener in plugin `onload` that reconfigures the child editor's language Compartment when an external write changes a note's `lc-language` frontmatter — reusing the Phase 16 chevron-switch plumbing (`languageCompartment` + `buildLanguageExtensions`) without rewriting the fence opener tag (D-14: frontmatter is the source of truth in passive-listener mode). Concurrently scaffolded the Edge-Input UAT script (PASTE-01..04, IME-01..03, SRCLIV-01) plus Wave-1 regression sanity checks for execution in Plan 17-06.

## What Shipped

- **`src/main.ts`** — Three additions:
  1. New `this.registerEvent(this.app.metadataCache.on('changed', ...))` block in `onload` at line 896 (Step 6g.5, between the file-open retrofit handler and the python3 highlighter registration). The callback delegates to `handleFmChangeForLanguageReactivity` so the listener body stays unit-testable.
  2. New private method `handleFmChangeForLanguageReactivity(file, cache)` at line 2545. Three-gate logic:
     - **Gate 1** — frontmatter must contain `lc-slug` (LC-note filter).
     - **Gate 2** — `childEditorRegistry.get(file.path)` must return an EditorView (note must be open in a MarkdownView with a registered child).
     - **Gate 3** — `cache.frontmatter['lc-language']` must differ from the slug currently applied to the parent fence opener (Pitfall 3 dedupe: when the plugin's own `processFrontMatter` writes a slug that the chevron path has already updated, this gate trips and the listener short-circuits).

     On all three passing, dispatches `{ effects: languageCompartment.reconfigure(buildLanguageExtensions(fmLang, getIndentSizeOverride())) }` on the child. NO `changes:` payload, NO `userEvent` annotation — effect-only dispatches are not subject to the section-lock changeFilter per CLAUDE.md §Conventions. Wrapped in `try/catch` matching the project's defensive convention (`childEditorSync.ts:115`, `dispatchChildLanguageReconfigure` at lines 2473-2476).
  3. New private helper `readActiveFenceSlug(file)` at line 2613. Reads the slug currently applied to the parent fence opener: parses the active MarkdownView's CM6 state via `findCodeFence` when available (freshest source of truth — chevron switch path updates the parent doc atomically before `processFrontMatter` lands), falls back to `metadataCache.getFileCache(...).frontmatter['lc-language']` for non-active windows, returns `undefined` if neither yields a slug.

- **`tests/main/fmReactivity.test.ts`** (NEW, 313 lines) — Six-test vitest spec covering the listener handler:
  1. **Test 1 — happy path**: external `lc-language: java → python` change with parent fence still on `java` → child receives `Compartment.reconfigure` dispatch with the new extensions array.
  2. **Test 2 — Pitfall 3 dedupe**: parent fence already on `python` AND fm now `python` → Gate 3 trips, no dispatch, no `buildLanguageExtensions` call.
  3. **Test 3 — Gate 1 (no lc-slug)**: cache lacks `lc-slug` → no dispatch.
  4. **Test 4 — Gate 2 (not in registry)**: registry returns `undefined` → no dispatch; `registry.get` was consulted (proves Gate 2 is reached, not short-circuited earlier).
  5. **Test 5 — D-14 exhaustive guard**: across all four scenarios above, neither `vault.process` nor `fileManager.processFrontMatter` is ever called — frontmatter SoT invariant verified.
  6. **Test 6 — D-13 dispatch shape**: dispatch spec has no `changes:` field AND no `userEvent` field; effect-only path verified. Inline comment codifies the CLAUDE.md §Conventions guard so a future maintainer adding a `changes:` payload is forced to revisit the `'leetcode.*'` userEvent decision.

  Strategy mirrors `switchFenceLanguage.test.ts`: handler is invoked via `helper.call(fakePlugin, file, cache)` against a prototype-extracted reference, with the language Compartment + extension builder mocked at module level. Fake plugin stubs `readActiveFenceSlug` directly so Gate 3 dedupe is verifiable without standing up a real CM6 view.

- **`.planning/phases/17-polish-edge-cases/17-UAT.md`** (NEW, 94 lines) — 12 manual test cases scaffolded with `result: pending`, ready for Plan 17-06 execution:
  - Tests 1-4: PASTE-01..04 — VS Code, StackOverflow HTML, LeetCode web copy, Obsidian's clipboard interceptor (D-08).
  - Tests 5-7: IME-01..03 — Pinyin (Chinese), Romaji (Japanese), Hangul (Korean) composition (D-09).
  - Test 8: SRCLIV-01 — Source ↔ Live Preview Cmd-E flip with pending edits (D-10).
  - Test 9: Phase 16 sanity regression subset (Tests 2, 4, 5, 6, 9, 13, 14, 15, 16, 17, 18, 19 from 16-UAT.md).
  - Tests 10-11: Phase 17 Wave 1 regression sanity (Reset undo — Plan 17-01; Tab mid-line — Plan 17-03).
  - Test 12: Phase 17 Wave 2 regression sanity (fm reactivity — this plan's listener).

  Frontmatter shape exactly matches 16-UAT.md (status: in-progress, phase, source array referencing all six 17-XX-SUMMARY.md files). Wave 3 sections (THEME-01, VIM-01, LIFE-01, BUNDLE-01) are NOT in this scaffold — Plans 17-05 and 17-06 will append those when their work lands.

## Tasks

| # | Name | Commit | Status |
|---|------|--------|--------|
| 1 | Add failing test for fm reactivity listener (D-13/D-14 + Pitfall 3) | `744d726` | Done (RED → committed) |
| 2 | Register fm reactivity listener in src/main.ts onload (D-13) | `42bcf7f` | Done (GREEN, build clean) |
| 3 | Scaffold the Edge-Input UAT script (D-07..D-10, ready for Plan 17-06 execution) | `0a7d151` | Done |

## Verification

- [x] `npm test -- tests/main/fmReactivity.test.ts` — 6/6 pass GREEN (post-implementation).
- [x] `npm test` (full suite) — 1665/1665 of plan-relevant tests pass; 6 skipped. The 3 failures in `tests/foundations/check-bundle-size.test.ts` are PRE-EXISTING (verified by stashing my changes and re-running on base commit `c9add21`) — they assert `HARD_LIMIT=1_300_000` but Phase 16 Plan 05 bumped the bundle ceiling to 1_600_000 per 16-UAT.md Test 20. This is a Phase-16 follow-up out of scope for Plan 17-04. See "Deferred Issues" below.
- [x] `npm run build` — `tsc -noEmit -skipLibCheck` clean, esbuild production clean.
- [x] `grep -n "metadataCache.on('changed'" src/main.ts` returns line 897 (within the new `registerEvent` block at line 896).
- [x] `grep -c "languageCompartment\.reconfigure" src/main.ts` returns 5 (existing chevron path + new fm-reactivity path + JSDoc references).
- [x] `grep -c "lc-language" src/main.ts` returns 14 (existing references + new gate-check references).
- [x] `grep -c "Effect-only dispatches" tests/main/fmReactivity.test.ts` returns 2 (the inline guard comment is present per Task 1 acceptance criteria).
- [x] Listener registered via `this.registerEvent(...)` (auto-cleanup on plugin unload — Pattern C confirmed).
- [x] No new `vault.process` or `processFrontMatter` calls added by the listener (D-14 guard — Test 5 exhaustive, source unchanged for those count grep).

## Deviations from Plan

None. All three tasks executed as specified.

## Deferred Issues

- **3 pre-existing failures in `tests/foundations/check-bundle-size.test.ts`** — assertions check `HARD_LIMIT=1_300_000` and `SOFT_WARN=1_170_000` in `scripts/check-bundle-size.mjs`, but Phase 16 Plan 05 bumped the ceiling to 1_600_000 / 1_440_000 per 16-UAT.md Test 20 (user choice "A"). The bundle script itself was updated correctly; the test file's hardcoded assertions were not. Out of scope for Plan 17-04 (verified pre-existing on base commit `c9add21` — 3 failed before any of this plan's changes). Logged for a future Phase 16 follow-up or Phase 17 bundle-audit pass (Plan 17-06 D-24 covers bundle accounting and may sweep this up).

## Decisions

1. **Effect-only dispatch with no `userEvent` annotation.** Per CLAUDE.md §Conventions, the `'leetcode.*'` userEvent is the bypass for the section-lock changeFilter — but the changeFilter inspects `tr.annotation(userEvent)` ONLY when there's a `changes:` payload. Effect-only dispatches (no `changes`) thread through unfiltered without needing the convention. Test 6 codifies this with an inline guard comment so any future maintainer who adds a `changes:` payload is forced to re-derive the convention rather than silently breaking the section lock.

2. **Stub `readActiveFenceSlug` on the fake test plugin.** Mocking the active MarkdownView's CM6 state to derive the fence opener slug at unit-test time would require standing up a fake `getActiveViewOfType` returning a fake `editor.cm` returning a fake EditorState whose `findCodeFence` returns a fake fence object whose `openerLine.text` matches a regex — five layers of indirection that test the integration of `readActiveFenceSlug` with CM6, NOT the three-gate logic of `handleFmChangeForLanguageReactivity`. Stubbing the helper directly on the fake `this` keeps the unit test laser-focused on Gate 3 dedupe semantics; production helper is exercised end-to-end via Plan 17-06 17-UAT.md Test 12 in the dev vault.

3. **No debounce on the listener.** Per 17-RESEARCH.md Q4 RESOLVED, Gate 3 (slug equality check) is the canonical dedupe — `metadataCache.on('changed')` fires once per file save and once per metadata-cache rebuild, and the same-slug case is the only meaningful redundancy. Add 50ms debounce only if Plan 17-06 Test 12 reveals multiple fires per save in the dev vault.

4. **Helper extraction pattern: prototype private method, not co-located helper module.** Earlier discussion in 17-04-PLAN.md Task 2 mentioned "extract `createFmReactivityHandler(plugin)` from a new co-located helper" as a possible alternative to a private method. We chose the private-method route to mirror the established `dispatchChildLanguageReconfigure` (Phase 16 D-12) — same prototype-extraction unit-test pattern is used in `switchFenceLanguage.test.ts`. Keeps the listener body co-located with the plugin class without adding a new file.

## Self-Check: PASSED

Files exist:
- FOUND: src/main.ts (modified)
- FOUND: tests/main/fmReactivity.test.ts (new)
- FOUND: .planning/phases/17-polish-edge-cases/17-UAT.md (new)

Commits exist:
- FOUND: 744d726 (test RED)
- FOUND: 42bcf7f (feat GREEN)
- FOUND: 0a7d151 (docs UAT scaffold)
