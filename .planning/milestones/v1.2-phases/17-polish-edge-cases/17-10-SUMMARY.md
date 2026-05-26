---
phase: 17-polish-edge-cases
plan: 10
subsystem: child-editor-theme
tags: [css, theme, syntax-highlight, gap-closure, uat]
requires: [17-05]
provides: [theme-scoped-code-vars]
affects: [styles.css, tests/main/childEditorTheme.test.ts]
tech-stack:
  added: []
  patterns:
    - ":where() specificity-lowering for fallback CSS variable palettes"
    - "theme-scoped --code-* fallback under .theme-light / .theme-dark roots"
key-files:
  created: []
  modified:
    - styles.css (+47, theme-scoped --code-* fallback palette appended after .cm-editor .lc-nested-editor .cm-scroller block)
    - tests/main/childEditorTheme.test.ts (+99 net, 4 new it() blocks under "Plan 17-10 — theme-scoped --code-* fallback palette" describe; uses await import + null-narrowed match for TS strict-null + lint compliance)
key-decisions:
  - ":where() at zero-specificity lets community themes that scope --code-* at higher specificity continue to win via standard cascade"
  - "GitHub-light / -dark inspired hex values used as starting palette; tests assert inequality between scopes, NOT specific hex values"
  - "Plan 17-05 HighlightStyle.define spec list preserved verbatim — only variable-resolution scope is fixed"
requirements-completed: [HIGHLIGHT-01]
duration: 8 min
completed: 2026-05-24
---

# Phase 17 Plan 10: Theme-Scoped --code-* Fallback Palette for Child Editor Summary

Theme-scoped `--code-*` CSS variable fallback palette under `:where(.theme-light)` / `:where(.theme-dark) .lc-nested-editor` so the child editor's syntax-highlighted tokens track Obsidian dark↔light theme switches without any JavaScript theme detection or runtime CSS injection.

## What Shipped

- **styles.css** (+47 lines, lines ~1927-1971): two new rule blocks defining 8 `--code-*` fallback variables each (`--code-keyword`, `--code-string`, `--code-comment`, `--code-function`, `--code-tag`, `--code-property`, `--code-operator`, `--code-value`) under `:where(.theme-light) .lc-nested-editor` (light mode) and `:where(.theme-dark) .lc-nested-editor` (dark mode). Hex values are GitHub-light / -dark inspired (`#d73a49` keyword in light, `#ff7b72` in dark, etc.).

- **tests/main/childEditorTheme.test.ts** (+99 net, 4 new `it()` blocks):
  - Test N+1: BOTH theme scopes exist with `--code-keyword` declarations.
  - Test N+2: light vs. dark `--code-keyword` VALUE differs (proves theme tracking, not hex-specific).
  - Test N+3: ≥5 of 8 consumed `--code-*` variables defined in each scope.
  - Test N+4: `'var(--code-keyword)'` consumer reference in `src/main/childEditorTheme.ts` unchanged (Plan 17-05 binding shape preserved).
  - Tests use `await import('node:fs')` + null-narrowed `match[]` access for TS strict-null + `@typescript-eslint/no-require-imports` compliance.

## Theme-scope CSS structure (`:where()` rationale)

The `:where()` pseudo-class contributes ZERO specificity, so the effective selector specificity is just `.lc-nested-editor` = `0,1,0`. This means:
- Default Obsidian behavior (which rarely defines `--code-*` for the widget DOM) → plugin's fallback palette wins.
- Community theme that scopes `--code-*` at any higher specificity (e.g., `body.theme-dark`, `.markdown-source-view .HyperMD-codeblock`) → community theme wins via normal CSS cascade.

This makes the plugin's rules a true "fallback baseline only when nothing else applies" layer — the fix is non-aggressive and conflict-free with community themes.

Why theme scoping (not JavaScript): Obsidian sets `body.theme-light` / `body.theme-dark` mutually exclusively when the user toggles theme. Descendants inherit the active class without any plugin code running on theme switch. The browser repaints token colors automatically because `var(--code-keyword)` re-resolves under the new ancestor scope. No `MutationObserver`, no runtime CSS injection, no theme-detection JS.

## Plan 17-05 invariants preserved

- `createThemedHighlight()` returns the same `[syntaxHighlighting(themedHighlightStyle), themedBracketMatchTheme]` pair (verified by Test 1: array length === 2).
- `HighlightStyle.define([...])` spec list at `src/main/childEditorTheme.ts:42-56` unchanged.
- `bracketMatching()` at `src/main/childEditorFactory.ts:277` untouched.
- HIGHLIGHT-DARK-01 (bracket-match contrast theme block — `.cm-matchingBracket` using `--background-modifier-active-hover`) unaffected — only the `--code-*` variable resolution scope is fixed; no Lezer tag mappings change.
- `bracketMatchThemeSpec` introspectable test surface preserved.

## Verification

- `npm test -- tests/main/childEditorTheme.test.ts` → 14/14 GREEN (10 prior Plan 17-05 tests + 4 new Plan 17-10 tests).
- `npm test` (full suite) → 1688 passed, 6 skipped, 0 failed. Zero regressions.
- `npm run build` → `tsc -noEmit -skipLibCheck` clean; esbuild production build clean.
- `npx eslint tests/main/childEditorTheme.test.ts styles.css` → 0 errors in scope-modified files. (Pre-existing lint errors in `tests/main/nestedEditorExtension.test.ts` are out of scope per CLAUDE.md scope boundary.)

### Acceptance criteria status

| Criterion | Result |
| --- | --- |
| `tests/main/childEditorTheme.test.ts` has ≥ 8 `it(...)` blocks | 14 ✓ |
| File contains literal `theme-light`, `theme-dark`, `--code-keyword`, `lc-nested-editor` | ✓ all present |
| Test N+2 explicitly asserts inequality between light and dark keyword colors | ✓ `expect(lightKeyword).not.toEqual(darkKeyword)` |
| `grep -c "lc-nested-editor" tests/main/childEditorTheme.test.ts ≥ 4` | 5 ✓ |
| `npm test -- tests/main/childEditorTheme.test.ts` exits 0 (8/8 GREEN minimum) | 14/14 ✓ |
| `npm test` exits 0 | ✓ |
| `npm run build` exits 0 | ✓ |
| `grep -c ":where(.theme-light)" styles.css ≥ 1` | 2 ✓ |
| `grep -c ":where(.theme-dark)" styles.css ≥ 1` | 2 ✓ |
| `grep -c "--code-keyword" styles.css ≥ 2` | 2 ✓ |
| `grep -c "--code-string" styles.css ≥ 2` | 2 ✓ |
| `grep -c "--code-comment" styles.css ≥ 2` | 2 ✓ |
| Light vs. dark `--code-keyword` differ | ✓ `#d73a49` vs. `#ff7b72` (verified by Test N+2 GREEN) |

## Manual UAT reference

`17-UAT.md` Tests 13 (THEME-01 dark) + 14 (THEME-02 light + live switch) to be re-run by the user after this plan lands. Expected post-fix behavior:
- Dark mode: keyword tokens render in coral (`#ff7b72`); strings in light blue (`#a5d6ff`); etc.
- Light mode: keyword tokens render in red (`#d73a49`); strings in deep blue (`#032f62`); etc.
- Toggling Obsidian theme (Settings → Appearance → Base color scheme) repaints tokens immediately, no plugin reload needed.
- Two vaults running different community themes that override `--code-*` at higher specificity → community theme palette wins (the plugin's `:where()` baseline lost via cascade as designed).

Test 15 (HIGHLIGHT-DARK-01 — bracket-match contrast) is unaffected; the bracket-match theme block in `src/main/childEditorTheme.ts:71-82` is not touched by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] TS2532 strict-null + lint require-imports in new test code**
- **Found during:** Task 2 verification (`npm run build` after Task 1 RED commit; `npm run lint` during full verification)
- **Issue:** Initial Task 1 commit used `require('node:fs')` + un-narrowed `match[1]` access. `tsc -noEmit -skipLibCheck` failed with `TS2532: Object is possibly 'undefined'` at the `match[1]` access; lint flagged 10 `@typescript-eslint/no-require-imports` errors in the new code.
- **Fix:** Replaced `require()` with the `await import('node:fs')` / `await import('node:path')` pattern already used by the file's existing Plan 17-05 tests. Refactored the regex helpers into `async` functions and added explicit null narrowing (`match === null ? '' : (match[1] ?? '')`) so TS strict-null mode is satisfied without `!`-asserts.
- **Files modified:** `tests/main/childEditorTheme.test.ts`
- **Verification:** `npx eslint tests/main/childEditorTheme.test.ts` → 0 errors; `npm run build` → clean; full vitest suite still 1688 GREEN.
- **Commit:** Bundled into `c6d2357` (Task 2 GREEN commit).

**Total deviations:** 1 auto-fixed (Rule 3 blocker — directly caused by my Task 1 commit, in-scope per scope boundary).

**Impact:** Negligible. The fix used the same `await import(...)` idiom already present in the file's Plan 17-05 tests, so the refactor is internally consistent. No behavior change to the assertions themselves; all four new tests still verify the same contracts.

## Authentication Gates

None — no external authentication needed for CSS-only + source-level test changes.

## Issues Encountered

None.

## Next Phase Readiness

This plan is ship-ready. The fix is purely additive at the bottom of styles.css (no existing rules modified, no JavaScript code changed, no widget DOM changed). The atomic close-out invariant is satisfied:
1. Task 1 RED commit: `87075db`
2. Task 2 GREEN commit: `c6d2357`
3. SUMMARY.md commit: (next)

Plan 17-10 is the final 17-UAT.md Issue 4 closure. Ready for the next plan in the UAT gap-closure batch (17-11 onward) or for orchestrator merge to `gsd/v1.2-code-editor-experience`.

## Self-Check

- `[ -f styles.css ]` → FOUND
- `[ -f tests/main/childEditorTheme.test.ts ]` → FOUND
- `[ -f .planning/phases/17-polish-edge-cases/17-10-SUMMARY.md ]` → FOUND (this file)
- `git log --grep "17-10" --oneline` → `87075db test(17-10): ...` and `c6d2357 feat(17-10): ...` both present.

## Self-Check: PASSED
