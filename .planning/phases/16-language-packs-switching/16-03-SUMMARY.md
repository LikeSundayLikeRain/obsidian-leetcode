---
phase: 16-language-packs-switching
plan: 03
subsystem: editor
tags: [codemirror, language-pack, compartment, indent, brackets, comment, highlight, typescript, nested-editor]

# Dependency graph
requires:
  - phase: 16-language-packs-switching
    provides: "16-01 — languageCompartment singleton + buildLanguageExtensions(slug, override) → Extension[4]"
  - phase: 16-language-packs-switching
    provides: "16-02 — PluginData.indentSizeOverride + SettingsStore.getIndentSizeOverride()"
  - phase: 13-nested-editor-foundation
    provides: "createChildEditor + NestedEditorWidget + buildNestedDecorations + childEditorRegistry"
  - phase: 14-bidirectional-sync
    provides: "'leetcode.lang-switch' userEvent convention; sync compatibility with effects-only transactions"
  - phase: 15-focus-undo-cursor
    provides: "indentWithTab keymap precedence; child editor extension array shape"
provides:
  - "createChildEditor(content, parent, initialSlug, indentOverride, syncExtensions?) — language-Compartment-backed factory; chevron in 16-04 reconfigures live without remount"
  - "languageCompartment now wired into every child editor at construction (no more 'always Python' debt from Phase 13)"
  - "closeBracketsKeymap registered top-level BEFORE the main keymap (Pitfall D — Backspace handler wins over defaultKeymap)"
  - "NestedEditorWidget(filePath, registry, fenceContent, initialSlug, indentOverride) — widget eq() identity remains filePath-only so language switches reconfigure in-place"
  - "buildNestedDecorations reads lc-language frontmatter + plugin.settings.getIndentSizeOverride() at decoration build time"
  - "PluginHost type widened to expose settings.getIndentSizeOverride()"
affects: [16-04, 16-05]

# Tech tracking
tech-stack:
  added: []  # No new dependencies — consumed 16-01's existing exports + closeBracketsKeymap from already-installed @codemirror/autocomplete
  patterns:
    - "Language Compartment as the FIRST extension: ensures the entire LanguageSupport + indentUnit + closeBrackets + Cmd-/ keymap payload reconfigures atomically on chevron switch (16-04)"
    - "Top-level keymap.of(closeBracketsKeymap) BEFORE main keymap: Pitfall D — closeBracketsKeymap's Backspace handler must precede defaultKeymap's so unbalanced-pair Backspace deletes pairs"
    - "Stable widget identity (D-13) preserved across language switches: eq() compares filePath only — language Compartment.reconfigure handles language change without rebuilding the widget or its child EditorView"
    - "Decoration-build-time read of lc-language + indent override: values flow through widget constructor to factory (registry-miss path); registry-hit path reuses the existing EditorView (chevron handles language sync)"

key-files:
  created: []
  modified:
    - "src/main/childEditorFactory.ts (refactored — Compartment + closeBracketsKeymap; signature widened with initialSlug + indentOverride)"
    - "src/main/nestedEditorExtension.ts (PluginHost widened with settings; widget gains 2 ctor params; buildNestedDecorations reads lc-language + indent override)"
    - "tests/main/childEditorFactory.test.ts (rewritten mocks: 'childEditorLanguage' + '@codemirror/autocomplete'; new Compartment-wiring describe block; HIGHLIGHT-01 regression guard)"
    - "tests/main/nestedEditorExtension.test.ts (createMockPlugin exposes settings.getIndentSizeOverride; widget tests pass new ctor args; new describe covering lc-language + override flow + 'python3' fallback paths)"

key-decisions:
  - "Widget gains initialSlug + indentOverride as ctor params, NOT widget identity fields: language switches go through languageCompartment.reconfigure (16-04), not widget rebuild — so a stale slug on an old widget instance never reaches a live editor (the factory only consults these fields on registry-miss / new-EditorView creation)"
  - "Read lc-language + override at decoration build time inside buildNestedDecorations (where plugin + state are both in scope), then pass through widget ctor — avoids widening the widget to hold a plugin reference"
  - "PluginHost type widened to include settings.getIndentSizeOverride() — minimal structural surface, matches existing app.metadataCache narrow-typing pattern"
  - "Defensive 'python3' fallback when lc-language is absent OR a non-string value (covers corrupt user edits + Phase 1/2 notes that pre-date lc-language frontmatter)"
  - "Three eslint-disable-next-line directives removed from childEditorFactory.ts — @codemirror/{language,commands,autocomplete} are direct deps as of 16-01, so the import/no-extraneous-dependencies suppressions were unused warnings"

patterns-established:
  - "Two-phase RED→GREEN per task: separate test commit before each implementation commit, even when both target the same module — gives a clean TDD audit trail in git log"
  - "Widget constructor accepts deferred-construction args (initialSlug, indentOverride) without making them identity-bearing: separates 'what the editor needs at first construction' from 'what determines if a new widget instance replaces an existing one'"

requirements-completed: [INDENT-04, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04, COMMENT-01, HIGHLIGHT-01]

# Metrics
duration: ~12 min
completed: 2026-05-22
---

# Phase 16 Plan 03: Wire Child Editor to Compartment Summary

**Child editor factory now consumes 16-01's languageCompartment + buildLanguageExtensions; closeBracketsKeymap registered top-level (Pitfall D); call site reads lc-language + indentOverride and forwards through the widget — no more "always Python" debt from Phase 13, Compartment ready for 16-04 chevron reconfigure.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-22T19:48Z
- **Completed:** 2026-05-22T20:02Z
- **Tasks:** 3
- **Files modified:** 4 (0 created, 4 edited)
- **Commits:** 4 task commits + 1 SUMMARY commit

## Accomplishments

- `createChildEditor` signature widened: `(content, parent, initialSlug, indentOverride, syncExtensions?)` — every child editor now constructs with the correct LanguageSupport for its fence's slug from the moment of creation
- `languageCompartment.of(buildLanguageExtensions(initialSlug, indentOverride))` is the FIRST extension in the array — chevron in 16-04 will reconfigure this Compartment in place (no remount, no widget rebuild)
- `closeBracketsKeymap` from `@codemirror/autocomplete` registered at top-level via `keymap.of(closeBracketsKeymap)`, placed BEFORE the main keymap (Pitfall D — Backspace handler precedence over `defaultKeymap`)
- `bracketMatching()` (HIGHLIGHT-01 / D-15) preserved with explicit regression test — Phase 13 wiring intact
- `NestedEditorWidget` widened with `initialSlug` + `indentOverride` ctor params; widget identity (`eq()`) remains `filePath`-only so language switches reconfigure in-place rather than rebuilding the widget
- `buildNestedDecorations` reads `lc-language` from frontmatter and `plugin.settings.getIndentSizeOverride()` at decoration build time, with defensive `'python3'` + `'auto'` fallbacks for corrupt/missing values
- Test suite: 1578 passed / 3 skipped / 0 failures (vs 1538 baseline from 16-02 — 40 net new tests across the two files)
- All 7 plan-listed requirements unblocked: BRACKET-01..04 (closeBrackets in Compartment + closeBracketsKeymap top-level), COMMENT-01 (Mod-/ binding via Compartment keymap from 16-01), HIGHLIGHT-01 (bracketMatching preserved), INDENT-04 (per-language indent via the Compartment payload)

## Task Commits

Each task was committed atomically with explicit RED→GREEN sequencing:

1. **Task 1 RED — `c87bf28`** (test): Rewrite `tests/main/childEditorFactory.test.ts` mocks for the Compartment-based shape; replace `@codemirror/lang-python` mock with `'./childEditorLanguage'` mocks; replace `indentUnit` mock with `'@codemirror/autocomplete'` mock; add Compartment-wiring describe block + HIGHLIGHT-01 regression guard. (18 tests fail — expected RED state.)

2. **Task 1 GREEN — `094d356`** (feat): Refactor `src/main/childEditorFactory.ts` to use `languageCompartment.of(buildLanguageExtensions(initialSlug, indentOverride))` as the first extension; add `keymap.of(closeBracketsKeymap)` at the top level BEFORE main keymap (Pitfall D); drop `python()` import + `indentUnit.of('    ')` literal + `indentUnit` symbol from `@codemirror/language` import; widen signature with two new params. 18/18 factory tests pass. Call-site error in nestedEditorExtension.ts is expected per plan (resolved in Task 2).

3. **Task 2 RED — `e38f233`** (test): Update `tests/main/nestedEditorExtension.test.ts` — pass new (slug, override) ctor args to every `NestedEditorWidget` instantiation; widen `createMockPlugin` to expose `settings.getIndentSizeOverride()`; add Phase 16 describe block covering lc-language read, indent-override read, missing-frontmatter fallback to `'python3'`, and non-string-frontmatter fallback to `'python3'`. (5 new tests fail — expected RED state.)

4. **Task 2 GREEN — `4f8d684`** (feat): Update `src/main/nestedEditorExtension.ts` — widen `PluginHost` to include `settings.getIndentSizeOverride()`; widen `NestedEditorWidget` ctor with `initialSlug + indentOverride`; widen `eq()` documentation (identity remains filePath-only); update `toDOM()` to forward new args to `createChildEditor`; update `buildNestedDecorations` to read `lc-language` + indent override at construction time. Also: drop 3 unused eslint-disable directives from `childEditorFactory.ts`. Full build clean; full test suite 1578 passed.

**Task 3** (update `tests/main/childEditorFactory.test.ts`): The work landed inside the Task 1 RED commit (`c87bf28`) because the same test file is the canonical TDD scaffold for both Task 1 (factory refactor) and Task 3 (test rewrite). All 6 Task 3 acceptance criteria verified post-execution:
- `vi.mock('@codemirror/lang-python'` removed (0 hits)
- `indentUnit` mock entry removed from `@codemirror/language` factory (0 hits)
- `vi.mock('../../src/main/childEditorLanguage'` present (1 hit)
- `vi.mock('@codemirror/autocomplete'` present (1 hit)
- `buildLanguageExtensions` `toHaveBeenCalledWith` assertions present (2 hits — slug+override + 'auto'-override variants)
- `bracketMatching` regression assertion present (1 hit — explicit HIGHLIGHT-01 / D-15 guard)

**SUMMARY commit:** docs(16-03) — see final commit hash below.

## Files Created/Modified

- **`src/main/childEditorFactory.ts`** — Refactored from hardcoded `python()` + `indentUnit.of('    ')` to `languageCompartment.of(buildLanguageExtensions(initialSlug, indentOverride))`. Added `keymap.of(closeBracketsKeymap)` at the top level BEFORE the main keymap. Widened signature with `initialSlug` + `indentOverride` parameters. Phase 16 attribution added to the JSDoc and file header.

- **`src/main/nestedEditorExtension.ts`** — Widened `PluginHost` type to include `settings.getIndentSizeOverride()`. `NestedEditorWidget` ctor gained `initialSlug` + `indentOverride` as deferred-construction (non-identity) fields. `toDOM()` forwards both to `createChildEditor` on the registry-miss path. `buildNestedDecorations` reads `lc-language` from frontmatter + `getIndentSizeOverride()` from settings, with defensive `'python3'` + `'auto'` fallbacks.

- **`tests/main/childEditorFactory.test.ts`** — Rewrote mocks: removed `@codemirror/lang-python` and `indentUnit` mocks; added `'./childEditorLanguage'` (mocking `languageCompartment.of` + `buildLanguageExtensions`) and `'@codemirror/autocomplete'` (mocking `closeBracketsKeymap`). Added `'language Compartment wiring (Phase 16)'` describe block: 6 new tests covering buildLanguageExtensions arg-passing, languageCompartment.of wrapping, closeBracketsKeymap top-level placement, closeBracketsKeymap-before-main-keymap ordering (Pitfall D), and Compartment-as-first-extension positioning. HIGHLIGHT-01 / D-15 regression guard kept (bracketMatching toHaveBeenCalledOnce).

- **`tests/main/nestedEditorExtension.test.ts`** — `createMockPlugin` widened: now produces `plugin.settings.getIndentSizeOverride()` and accepts optional `lcLanguage` + `indentOverride` overrides. Every existing `NestedEditorWidget` instantiation updated with new ctor args. Added `'buildNestedDecorations — Phase 16 language wiring'` describe block: 4 new tests covering lc-language read, indent override read, missing-lc-language → 'python3' fallback, non-string-lc-language → 'python3' fallback. Added `eq()` test asserting language differences do NOT break stable identity (chevron reconfigure invariant).

## Decisions Made

- **Widget gains `initialSlug` + `indentOverride` as constructor parameters, NOT identity fields.** Rationale: language switches go through `languageCompartment.reconfigure(...)` in 16-04, not a widget rebuild. Including these in `eq()` would force unnecessary widget rebuilds on every settings change or chevron click; excluding them preserves the Phase 13 stable-identity contract (D-13) while still threading the values to `createChildEditor` on the registry-miss path. A stale slug on an outdated widget instance never reaches a live editor because the chevron reconfigures the running Compartment directly.

- **Read `lc-language` + override inside `buildNestedDecorations`, not inside the widget.** Rationale: the decoration builder already has `plugin` and `state` in scope; widening the widget to hold a plugin reference would couple it to the host more tightly than necessary. Passing values through the constructor preserves the widget's role as a thin block-decoration carrier.

- **`PluginHost` type widened minimally to expose `settings.getIndentSizeOverride()` only.** Rationale: matches the existing structural-typing pattern used for `app.metadataCache.getFileCache(...)` — narrow surface, deny-by-default. Future plans wanting other settings methods will widen `PluginHost` further as needed.

- **Defensive `'python3'` fallback on both missing AND non-string `lc-language` values.** Rationale: corrupt user edits to frontmatter (e.g., a number, an object, `null`) must not throw inside the decoration builder — degrading to Python highlighting matches `buildLanguageExtensions`'s D-04 default-branch behavior for unknown slugs (no exceptions, graceful degradation).

- **Three unused `eslint-disable-next-line import/no-extraneous-dependencies` directives removed from `childEditorFactory.ts`.** Rationale: `@codemirror/{language,commands,autocomplete}` became direct deps in 16-01, so the suppressions were dead. The `@codemirror/state` directive stays (peer dep via obsidian).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] TypeScript strictness on `fm['lc-language']` access**

- **Found during:** Task 2 GREEN (post-implementation type check)
- **Issue:** After updating `buildNestedDecorations` to read `fm['lc-language']`, tsc reported `error TS18048: 'fm' is possibly 'undefined'`. The earlier `fm?.['lc-slug']` guard narrowed `slug` (the resulting string), but TS does not propagate that narrowing back to `fm` itself.
- **Fix:** Used `fm?.['lc-language']` with optional-chain instead of direct property access; added inline comment explaining the narrowing-propagation gap.
- **Files modified:** `src/main/nestedEditorExtension.ts`
- **Verification:** `npm run build` exits 0 after fix; full test suite passes.
- **Committed in:** `4f8d684` (rolled into Task 2 GREEN before commit)

**2. [Rule 3 — Lint hygiene] Unused eslint-disable directives in `childEditorFactory.ts`**

- **Found during:** Task 2 GREEN (post-implementation lint check)
- **Issue:** Three `eslint-disable-next-line import/no-extraneous-dependencies` directives became "unused" warnings after the import shape changed. `@codemirror/language`, `@codemirror/commands`, and `@codemirror/autocomplete` are all direct deps as of 16-01 (the latter was promoted from transitive→direct in 16-01), so the suppressions are dead.
- **Fix:** Removed the 3 dead directives. The `@codemirror/state` directive is kept (still a peer dep via obsidian, still triggers the rule). The `@codemirror/view` directive at the top of the file is also kept for the same reason.
- **Files modified:** `src/main/childEditorFactory.ts`
- **Verification:** `npm run lint` shows zero warnings on `src/main/childEditorFactory.ts`; full build still clean.
- **Committed in:** `4f8d684` (folded into Task 2 GREEN — small enough not to warrant a separate commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking type/lint issues that prevented clean build/lint state).
**Impact on plan:** Both fixes were structural cleanup, not scope creep. The `fm?.[...]` chain is a defensive type-safety win; removing dead eslint suppressions reduces noise. Plan execution unchanged in shape — both fixes folded inline into the Task 2 GREEN commit per the deviation rules' inline-fix guidance.

## Issues Encountered

- **Mid-execution interruption:** First execution wave hit an API error after committing Tasks 1 + 2 (4 commits visible: `c87bf28`, `094d356`, `e38f233`, `4f8d684`). On resume, verified all four commits intact, working tree clean, then completed Task 3 verification + ran lint/build/full-suite + wrote SUMMARY. No code or test changes lost; resume was a no-op for source state.

- **Pre-existing lint baseline (NOT introduced by this plan):** `npm run lint` reports 56 errors total — identical to the 16-02 SUMMARY baseline cluster (`@typescript-eslint/unbound-method` in test files, `import/no-extraneous-dependencies` flagging `@codemirror/view` and `@codemirror/state` which are correctly external in `esbuild.config.mjs`). Per the plan's `<deviation_rules>` SCOPE BOUNDARY clause, these are out of scope for 16-03. The only NEW lint message in my modified files is the pre-existing `obsidianmd/prefer-active-doc` warning at `nestedEditorExtension.ts:101` in code I did not touch (Phase 13's `destroy()` method).

## User Setup Required

None — no external service configuration required. All wiring is internal CodeMirror Compartment plumbing.

## Next Phase Readiness

**Ready for 16-04 (chevron reconfigure):**
- `languageCompartment` is in place at the FIRST extension slot of every child editor — `Compartment.reconfigure(buildLanguageExtensions(newSlug, plugin.settings.getIndentSizeOverride()))` will land cleanly on the running EditorView
- Widget identity remains `filePath`-only — chevron-driven language switches reconfigure in place; no widget remount, no DOM rebuild
- `closeBracketsKeymap` is language-agnostic at the top level — chevron reconfigure does NOT need to touch it (correct per RESEARCH §Architecture Patterns)
- `plugin.settings.getIndentSizeOverride()` is accessible via `PluginHost` for the chevron's reconfigure call

**Ready for 16-05 (UAT + behavioral verification):**
- All 7 plan-listed requirements (BRACKET-01..04, COMMENT-01, HIGHLIGHT-01, INDENT-04) unblocked at the structural level
- Behavioral verification (chevron switch → editor recolors, Cmd-/ comments, `{` auto-pairs, etc.) lands in 16-05's live-EditorState tests + UAT
- ENTER-02..04 will activate behaviorally via the Lezer LanguageSupport packs once the Compartment is in place — no additional wiring needed in this plan

**Blockers:** None.

**Concerns:** None — the language Compartment wiring is structurally complete. The pre-existing CM6 state/view duplicate documented in 16-01 SUMMARY (commands@6.10.3 resolves state@6.6.0 vs obsidian peer-pin to 6.5.0) remains a noted-but-deferred issue; the `Command` cast inside `buildLanguageExtensions` from 16-01 contains it.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The threat-model entries from the plan are all mitigated as designed:

- **T-16-03-01 (corrupt `lc-language` frontmatter):** Mitigated. `buildNestedDecorations` defensively falls back to `'python3'` for missing OR non-string `lc-language` values; `buildLanguageExtensions` (16-01) further falls back to `python()` for unknown slugs. No exception path. Two new tests (`'falls back to python3 when lc-language is absent'` + `'falls back to python3 when lc-language is a non-string value'`) explicitly cover this.
- **T-16-03-02 (Backspace handler precedence):** Mitigated. `closeBracketsKeymap` registered top-level via `keymap.of(...)` BEFORE the main keymap. Explicit ordering test (`'places closeBracketsKeymap BEFORE the main keymap in the extensions array (Pitfall D)'`) verifies this with sentinel-based extension-array index inspection.
- **T-16-03-03 (HIGHLIGHT-01 regression):** Mitigated. Explicit `bracketMatching toHaveBeenCalledOnce` regression assertion in the factory tests + JSDoc comment in the source citing D-15.

No threat flags.

## Self-Check: PASSED

**Files exist:**
- `[ -f src/main/childEditorFactory.ts ]` — FOUND (modified, 119 lines after refactor)
- `[ -f src/main/nestedEditorExtension.ts ]` — FOUND (modified, ~310 lines after widget widening)
- `[ -f tests/main/childEditorFactory.test.ts ]` — FOUND (modified, 295 lines)
- `[ -f tests/main/nestedEditorExtension.test.ts ]` — FOUND (modified, ~530 lines)

**Commits exist:**
- `c87bf28` (Task 1 RED — factory test rewrite) — FOUND in `git log --oneline f8f9f02..HEAD`
- `094d356` (Task 1 GREEN — factory refactor) — FOUND
- `e38f233` (Task 2 RED — nested editor test updates) — FOUND
- `4f8d684` (Task 2 GREEN — nested editor source + lint cleanup) — FOUND

**Verification gates:**
- `npm run build` exits 0 (tsc strict + esbuild production) — VERIFIED
- `npm test -- tests/main/childEditorFactory.test.ts` 18/18 passing — VERIFIED
- `npm test` (full suite) 1578 passed / 3 skipped / 0 failures — VERIFIED
- `grep -c "languageCompartment\|buildLanguageExtensions\|closeBracketsKeymap" src/main/childEditorFactory.ts` ≥ 3 — VERIFIED (5 / 5 / 6 hits)
- `grep -c "from '@codemirror/lang-python'" src/main/childEditorFactory.ts` = 0 — VERIFIED
- `grep -c "indentUnit" src/main/childEditorFactory.ts` — only in comments, no code usage — VERIFIED
- `grep -c "bracketMatching()" src/main/childEditorFactory.ts` = 1 (HIGHLIGHT-01 / D-15 preserved) — VERIFIED
- All 7 plan-listed `requirements` unblocked at structural level

**Plan acceptance criteria:**
- Task 1: 9/9 acceptance items met (signature widened, languageCompartment + buildLanguageExtensions + closeBracketsKeymap present, lang-python import + indentUnit removed, bracketMatching preserved, build clean)
- Task 2: 4/4 acceptance items met (createChildEditor calls have 4+ positional args, lc-language + getIndentSizeOverride reads inserted near each call, full build + lint state preserved relative to baseline)
- Task 3: 6/6 acceptance items met (mocks rewritten, Compartment-wiring + HIGHLIGHT-01 regression tests present, file passes 18/18)

---
*Phase: 16-language-packs-switching*
*Completed: 2026-05-22*
