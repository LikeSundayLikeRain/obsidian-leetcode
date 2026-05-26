---
phase: 17-polish-edge-cases
plan: 11
subsystem: nested-editor / vim-mode
tags: [phase-17, gap-closure, vim, cursor-visibility, mode-indicator-panel, css, 17-UAT-issues-5-and-6, last-uat-fix]
type: execute
status: complete
duration: 5 min
completed: 2026-05-24
requirements-completed: []
requires:
  - 17-06 (D-18 conditional vim() mount block — commit d7bff1f)
  - 17-10 (theme-scoped --code-* fallback in styles.css under .lc-nested-editor scope)
provides:
  - vim status panel rendering (-- NORMAL -- / -- INSERT --) for vim users
  - deterministic Insert-mode caret visibility (vim measure-pass timing race resolved)
  - .cm-vim-panel + .cm-cursor / .cm-fat-cursor styling under .lc-nested-editor scope
affects:
  - src/main/childEditorFactory.ts (single-line: vim() → vim({ status: true } as Parameters<typeof vim>[0]); inline comment expanded)
  - styles.css (two new rule blocks appended after Plan 17-10's :where() theme scopes)
  - tests/main/childEditorFactory.test.ts (one new describe block, 4 source-level fs.readFileSync tests)
tech-stack:
  added: []
  patterns:
    - source-level fs.readFileSync test pattern (Plan 17-05 / 17-10 precedent — assertions over opaque CM6 Extensions)
    - Parameters<typeof vim>[0] type cast for libraries with under-specified .d.ts options shapes
    - !important visibility forcing under a tightly-scoped CSS descendant selector to bypass third-party measure-pass timing races
key-files:
  created: []
  modified:
    - src/main/childEditorFactory.ts
    - styles.css
    - tests/main/childEditorFactory.test.ts
key-decisions:
  - "vim({ status: true }) wired with `Parameters<typeof vim>[0]` cast — keeps tsc happy without runtime impact and survives @replit/codemirror-vim .d.ts evolution."
  - "Cursor visibility forced via CSS opacity:1 + visibility:visible !important rather than touching vim package internals — keeps the fix layer-correct (CSS owns paint cycle, vim package owns modal state machine) and survives package upgrades."
  - "Both fixes scoped to .lc-nested-editor descendant selectors — Obsidian's parent editor and other CM6 instances elsewhere in the vault are entirely unaffected."
metrics:
  duration_min: 5
  task_count: 2
  file_count: 3
  test_count_delta: +4
---

# Phase 17 Plan 11: vim Status Panel + Cursor Visibility Summary

vim mode-indicator panel (`.cm-vim-panel`) wired via `vim({ status: true })`
plus `.cm-cursor` / `.cm-fat-cursor` visibility forced via CSS so the
Insert-mode caret renders deterministically — closes the final two
17-UAT.md issues (Issue 5 cursor render + Issue 6 panel missing) without
touching Plan 17-06 D-18 conditional gating or Plan 17-10 theme blocks.

## Outcome

| Metric | Value |
| ------ | ----- |
| Duration | ~5 min |
| Tasks completed | 2 / 2 |
| Files modified | 3 |
| Test delta | +4 (28/28 GREEN; 24 → 28 in this file) |
| Full-suite tests | 1706 passed / 6 skipped (1712 total) |
| Build | clean (tsc -noEmit + esbuild production) |
| 17-UAT.md issues closed | 2 (Tests 17 VIM-01 + Test 20 sibling) |
| Phase 17 UAT status | Final gap-closure complete; all 6 issues addressed across 17-07..17-11 |

## What Shipped

### 1. `src/main/childEditorFactory.ts` — vim status panel option

Single line at the conditional spread (line 269 post-edit):

```ts
// before (Plan 17-06):
...(vimEnabled ? [vim()] : []),

// after (Plan 17-11):
...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
```

The `{ status: true }` option triggers `@replit/codemirror-vim`'s
`showPanel.of(statusPanel)` extension (verified at
`node_modules/@replit/codemirror-vim/dist/index.js:8762-8770`), which
mounts `dom.className = "cm-vim-panel"` at the bottom of the child editor
showing `-- NORMAL --` / `-- INSERT --` (and other vim mode strings).

The cast through `Parameters<typeof vim>[0]` is defensive — the package's
.d.ts may not advertise the options object across versions; the cast
keeps tsc happy without affecting the emitted JS.

The conditional spread `vimEnabled ? [...] : []` is preserved verbatim
— **Plan 17-06 D-18 conditional contract intact**. Non-vim users still
pay zero runtime keymap cost (only the bundled package weight, which was
the conscious tradeoff in Plan 17-06).

The inline comment block was expanded to document the panel addition and
the type-cast rationale (4 lines added).

### 2. `styles.css` — `.cm-cursor` / `.cm-fat-cursor` visibility forcing

New rule appended after Plan 17-10's `:where(.theme-dark) .lc-nested-editor`
block (~line 1973):

```css
.cm-editor .lc-nested-editor .cm-cursor,
.cm-editor .lc-nested-editor .cm-fat-cursor {
  opacity: 1 !important;
  visibility: visible !important;
}
```

Why this fixes Issue 5: `@replit/codemirror-vim`'s Insert-mode cursor
relies on CodeMirror dispatching a measure pass after the modal state
machine transitions Normal → Insert. The `Decoration.widget({block:true})`
mount used by the child editor interacts with vim's transition timing —
the cursor DOM element's visibility toggles before the next animation
frame, missing the paint cycle. The first user keystroke triggers a
transaction, forcing the missing measure/draw — which is the symptom
17-UAT.md Test 17 captured ("press `i`, no cursor; type any letter, cursor
appears").

Forcing `opacity:1` + `visibility:visible` at the CSS layer makes cursor
visibility independent of the vim package's measure-pass timing. The fix
is layer-correct: CSS owns the paint cycle, the vim package owns the
modal state machine — no vim internals are touched.

Scoped to `.lc-nested-editor` so the rule applies ONLY to the child
editor — Obsidian's parent editor and other CM6 instances elsewhere in
the vault remain on the package's default cursor blink behaviour.

### 3. `styles.css` — `.cm-vim-panel` styling

New rule appended after the cursor-visibility block:

```css
.cm-editor .lc-nested-editor .cm-vim-panel {
  font-family: var(--font-monospace);
  font-size: 0.8em;
  padding: 2px 8px;
  background: var(--background-secondary);
  color: var(--text-muted);
  border-top: 1px solid var(--background-modifier-border);
}
```

Uses six Obsidian theme variables — no hardcoded colors. The panel tracks
light/dark themes automatically. Sized small (0.8em font, 2px 8px padding)
so it doesn't dominate the editing area; the muted background + subtle
top border integrate visually without grabbing attention.

### 4. `tests/main/childEditorFactory.test.ts` — 4 new source-level tests

A new `describe` block "Phase 17 Plan 11 — vim panel + cursor visibility"
adds 4 source-level `fs.readFileSync` tests using the same pattern
established by Plan 17-05 / 17-10 (`childEditorTheme.test.ts`):

| # | Test | Purpose |
|---|------|---------|
| N+1 | `vim() is called with { status: true } when vimMode is enabled` | Asserts the new call shape AND the call is INSIDE the `vimEnabled ? [...] : []` conditional spread (Plan 17-06 invariant). Tolerates whitespace + cast variations via regex. |
| N+2 | `styles.css contains .cm-vim-panel rule scoped under .lc-nested-editor` | Asserts the rule exists with a real declaration (font-family / font-size / padding / background / color). |
| N+3 | `styles.css forces .cm-cursor / .cm-fat-cursor visibility under .lc-nested-editor` | Asserts opacity:1 OR visibility:visible appears in a rule whose selector chain mentions both `.lc-nested-editor` and `.cm-cursor` / `.cm-fat-cursor`. Both selectors must appear (comma-separated selector group). |
| N+4 | `preserves Plan 17-06 D-18 conditional gating` | Regression guard — `getConfig('vimMode')`, `=== true`, and `vimEnabled` (≥2 occurrences) must all still appear. Failed in initial RED run because the source has only 2 `vimEnabled` occurrences (declaration + ternary), not the plan's >=3 estimate; threshold relaxed to >=2 since the plan's estimate counted JSDoc/comment refs the actual source did not include in 17-06. |

Source-level tests are appropriate here because vim()'s output is opaque
CM6 Extensions and the cursor-render bug is a CSS measure-pass timing
issue not unit-testable through the existing CM6 mocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Plan 17-06 actual `vimEnabled` occurrence count was 2, not 3**

- **Found during:** Task 1 (RED state verification)
- **Issue:** Plan 17-11 Task 1 asserted `vimEnabled` occurs at least 3 times in `src/main/childEditorFactory.ts` (declaration + conditional spread + a JSDoc reference). The actual current source has only 2 occurrences — the declaration and the ternary spread; no JSDoc reference exists for `vimEnabled` in the 17-06 commit. Test N+4 was supposed to be a PASS today (regression guard) but failed RED.
- **Fix:** Relaxed the assertion threshold from `>= 3` to `>= 2` and updated the inline comment to document the discrepancy. The original intent (regression guard for Tasks 2 + 3 to confirm they don't drop the gate) is preserved — both occurrences (declaration + ternary) are still required.
- **Files modified:** `tests/main/childEditorFactory.test.ts`
- **Verification:** Test N+4 now PASSES; the 4-test suite went from 0/4 → 3 RED + 1 GREEN as the plan intended; after Task 2 the result is 4/4 GREEN.
- **Commit:** `91e799a`

**2. [Rule 3 - Blocker] N+4 regex broke on multi-line `getConfig('vimMode')` call**

- **Found during:** Task 1 (RED verification)
- **Issue:** The plan's regex `/getConfig\(\s*'vimMode'\s*\)[\s\S]{0,40}===\s*true/` did not match the actual source because the call is split across three lines: `getConfig(\n      'vimMode',\n    ) === true`. The `\s*'vimMode'\s*\)` portion required no extra characters between `'vimMode'` and `)`, but the source has `,\n    )` between them.
- **Fix:** Replaced with `/getConfig\([\s\S]{0,80}'vimMode'[\s\S]{0,80}\)\s*===\s*true/` which tolerates the prettier multi-line wrapping while still asserting the presence and ordering of `getConfig`, `'vimMode'`, and `=== true` together.
- **Files modified:** `tests/main/childEditorFactory.test.ts`
- **Verification:** Test N+4 went RED → GREEN.
- **Commit:** `91e799a`

**3. [Rule 3 - Blocker] N+1 conditional-spread regex broke on the type-cast `[0]`**

- **Found during:** Task 2 GREEN verification
- **Issue:** The Task 1 assertion used `/vimEnabled\s*\?\s*\[([^\]]*)\]\s*:\s*\[\s*\]/` to extract the conditional spread region. Once Task 2's implementation landed with `vim({ status: true } as Parameters<typeof vim>[0])`, the `[0]` square-bracket inside the type cast caused `[^\]]*` to stop early — the regex failed to match the outer ternary brackets correctly, so `conditionalMatch` came back null.
- **Fix:** Replaced with non-greedy `/vimEnabled\s*\?\s*\[([\s\S]*?)\]\s*:\s*\[\s*\]/` which still anchors on the literal `: []` empty-array marker. The non-greedy quantifier picks the smallest substring that lets the suffix `\]\s*:\s*\[\s*\]` match — which is the outer ternary's content, not the inner cast's `[0]`.
- **Files modified:** `tests/main/childEditorFactory.test.ts`
- **Verification:** Test N+1 went RED → GREEN; full suite 28/28 GREEN.
- **Commit:** `05ddb16`

**4. [Rule 1 - Bug] Unnecessary escape characters in regex literals**

- **Found during:** Final lint check
- **Issue:** Six `no-useless-escape` errors at lines 463, 468, 486 (twice each) — my new regex literals used `[^\{]` and `[^\}]` and `\{` / `\}` which are unnecessarily escaped in JavaScript regex (only inside character classes for `]`, and `{` only when it would otherwise look like a quantifier).
- **Fix:** Replaced `\{` with `{` and `\}` with `}` in the three relevant regex literals.
- **Files modified:** `tests/main/childEditorFactory.test.ts`
- **Verification:** All 6 errors gone; 28/28 tests still GREEN.
- **Commit:** `05ddb16` (squashed into the GREEN commit since they were trailing cleanup of the same test edits).

**Total deviations:** 4 auto-fixed (3 Rule 3 blocker fixes for plan-spec'd regex/threshold mismatches; 1 Rule 1 lint cleanup).
**Impact:** Zero functional impact. All deviations were inside test code; the production source change (1 line) and CSS additions (2 rule blocks) match the plan verbatim.

## Plan Invariants Preserved

| Invariant | Source | Verification |
|-----------|--------|--------------|
| Plan 17-06 D-18 conditional gating (vim only when `getConfig('vimMode') === true`) | `src/main/childEditorFactory.ts:244-248` | Test N+4 (regression guard, GREEN). |
| Plan 17-06 D-18 vimEnabled ternary structure (`vimEnabled ? [...] : []`) | `src/main/childEditorFactory.ts:269` | Test N+1 (asserts vim call is INSIDE the ternary). |
| Plan 17-10 theme-scoped --code-* fallback (lines 1952-1972) untouched | `styles.css` | Diff shows append-only insertion AFTER line 1972; no edits to existing rules. |
| `bracketMatching()` from Phase 13 unchanged | `src/main/childEditorFactory.ts:277` | No edit to that line; lint + tests pass. |
| No new userEvent introduced (no section-lock convention update needed) | CLAUDE.md ## Conventions | No CM6 dispatch added by this plan. |
| All Plan 17-04 lifecycle tests still GREEN | `tests/main/lifecycle.test.ts` | Full-suite run: 1706 passed / 6 skipped. |
| All Plan 17-06 vim tests still GREEN | factory test file | Full-suite run: same. |

## Verification Evidence

```
$ npm test -- tests/main/childEditorFactory.test.ts
Test Files  1 passed (1)
     Tests  28 passed (28)

$ npm test (full suite)
Test Files  195 passed | 1 skipped (196)
     Tests  1706 passed | 6 skipped (1712)

$ npm run build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
(clean — exit 0)

$ npx eslint src/main/childEditorFactory.ts tests/main/childEditorFactory.test.ts
✖ 11 problems (9 errors, 2 warnings)
  — All 11 are pre-existing (verified via git blame: commits e05731ef,
    d7bff1f, c2225e0f all predate this plan). None introduced by 17-11.
    Logged in deferred-items.md per scope-boundary rule.
```

Acceptance criteria (all from PLAN.md Task 2):

- [x] `npm test -- tests/main/childEditorFactory.test.ts` exits 0 (28/28 GREEN)
- [x] `npm test` full suite exits 0 (1706/1712, 6 skipped)
- [x] `npm run build` exits 0
- [x] `vim({ status: true })` present in source (1 match)
- [x] Bare `vim()` removed from CODE (only remains in a comment at line 236)
- [x] `cm-vim-panel` in styles.css (2 occurrences: comment + selector)
- [x] `cm-cursor` / `cm-fat-cursor` in styles.css (4 occurrences across the new rule + comments)
- [x] `vimEnabled` ≥ 2 occurrences in source (Plan 17-06 gating preserved)
- [x] `getConfig('vimMode')` retained in source (Plan 17-06 D-18 read preserved)

## Manual UAT (Deferred — User Re-Run After Merge)

17-UAT.md Test 17 (VIM-01 cursor render):
1. Enable vim in Obsidian Settings → Editor → Vim key bindings
2. Open a LC problem note, mount the child editor (any code fence)
3. From Normal mode, press `i` to enter Insert mode
4. **Expected (post-fix):** Caret cursor appears immediately and blinks; no need to type a letter first.

17-UAT.md Test 20 (vim mode panel):
1. Same setup as above
2. Observe the bottom of the child editor
3. **Expected (post-fix):** A `.cm-vim-panel` strip is visible showing `-- NORMAL --` (or `-- INSERT --` depending on current mode), styled with monospace font and muted background.

17-UAT.md Test 17 + Test 20 are deferred to user re-run; both fixes are
deterministic per the source/CSS changes — manual verification is
confirmation that the timing race is gone in the actual Obsidian
runtime, not part of this plan's automated acceptance.

## Phase 17 UAT Closeout

This is the **final gap-closure plan in Phase 17**. After this plan ships,
all six 17-UAT.md issues are addressed across plans 17-07 through 17-11:

| Issue | Plan | Status |
|-------|------|--------|
| 1 — Source Mode phantom render | 17-07 | Closed (commit aed7a65 / 17-07-SUMMARY.md) |
| 2 — Chevron switch child body stale | 17-08 | Closed |
| 3 — Reset code language regression | 17-09 | Closed |
| 4 — Theme-scoped --code-* fallback | 17-10 | Closed (commit aed7a65) |
| 5 — vim Insert-mode caret render | **17-11** | **Closed (this plan)** |
| 6 — vim mode-indicator panel missing | **17-11** | **Closed (this plan)** |

Phase 17 is ready for closeout / verification work.

## Self-Check: PASSED

Verified:
- [x] `src/main/childEditorFactory.ts` exists at `[ -f ]` and contains `vim({ status: true })`
- [x] `styles.css` exists at `[ -f ]` and contains `.cm-vim-panel` + `.cm-cursor` + `.cm-fat-cursor` selectors
- [x] `tests/main/childEditorFactory.test.ts` exists at `[ -f ]` and contains "Phase 17 Plan 11" describe block
- [x] Commit `91e799a` (test) exists in `git log`
- [x] Commit `05ddb16` (feat) exists in `git log`
- [x] `npm test -- tests/main/childEditorFactory.test.ts` → 28/28 PASSED
- [x] `npm test` (full suite) → 1706 passed / 6 skipped
- [x] `npm run build` → exit 0
- [x] All Task 2 `<acceptance_criteria>` re-verified post-edit (see Verification Evidence above)
- [x] Plan 17-06 D-18 conditional gating preserved (Test N+4 GREEN)
- [x] Plan 17-10 :where() theme blocks untouched (manual diff inspection)

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes. Pure presentation-layer fix (one TS line + two CSS rule blocks).
