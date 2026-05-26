---
phase: 17-polish-edge-cases
plan: 12
subsystem: nested-editor / line-numbers
tags: [phase-17, gap-closure, gap-closure-round-2, line-numbers, conditional-extension, d18-mirror, LINENUM-01]
type: execute
status: complete
duration: 8 min
completed: 2026-05-24
requirements-completed: [HIGHLIGHT-01, ENTER-01, ENTER-02, ENTER-03, ENTER-04, COMMENT-01]
gap_closure: true
gap_closure_round: 2
gap_id: LINENUM-01
requires:
  - 17-06 (D-18 conditional vim() mount block — commit d7bff1f, the canonical pattern this plan mirrors)
provides:
  - Line-number gutter rendering in the child editor when Obsidian's `showLineNumber` global setting is ON at child mount
  - Read-once-at-mount semantic identical to D-18 vim — toggling requires note remount (Cmd-E flip OR close+reopen)
  - `lineNumbers` import + `lineNumbersEnabled` const + conditional spread parallel to the existing `vimEnabled ? [vim(...)] : []` shape
affects:
  - src/main/childEditorFactory.ts (1 import-line addition, 1 read-site block at lines 251-279, 1 conditional-spread block at lines 297-307)
  - tests/main/childEditorFactory.test.ts (vi.mock('@codemirror/view') extended with lineNumbers sentinel; new describe block with 4 tests at the file end)
  - .planning/phases/17-polish-edge-cases/17-UAT.md (Test 24 LINENUM-01 entry appended; frontmatter + bottom summary reconciled)
tech-stack:
  added: []
  patterns:
    - "Conditional extension loading by Obsidian global config (D-18 mirror) — second instance of the canonical 'read once at child mount, conditionally spread into extensions array' shape; first instance was Plan 17-06 vim mount"
    - "Read-once-at-mount semantic with no metadataCache or layout-change listener — locked design enforced via source comments at the gating site to prevent accidental drift toward bespoke listener-based config tracking"
key-files:
  created:
    - .planning/phases/17-polish-edge-cases/17-12-SUMMARY.md
  modified:
    - src/main/childEditorFactory.ts
    - tests/main/childEditorFactory.test.ts
    - .planning/phases/17-polish-edge-cases/17-UAT.md
key-decisions:
  - "Mirror the D-18 vim conditional verbatim (same cast shape, same `!!app && ...` guard, same conditional-spread placement) — keeps the factory legible and makes a third future conditional (e.g., a hypothetical SPELLCHECK-01) trivially identifiable as instance N of the same pattern."
  - "Read-once-at-mount over live reactivity — toggling Obsidian's setting at runtime requires note remount. Documented in source comments at the gating site so a future contributor does not add a metadataCache or layout-change listener."
  - "Comments reference `showLineNumber` four times (read site + 3 in surrounding documentation) — the plan's `grep -c showLineNumber == 1` criterion is in tension with the must_haves directive 'document this in source comments at the gating site so a future contributor doesn't add reactivity'. Resolved in favor of must_haves: 1 actual literal-string read site at line 276; the other 4 are intentional documentation. See Deviations §1."
metrics:
  duration_min: 8
  task_count: 3
  file_count: 3
  test_count_delta: +4
  bundle_raw_before: 1707327
  bundle_raw_after: 1708449
  bundle_raw_delta: 1122
  bundle_raw_delta_pct: 0.07
---

# Phase 17 Plan 12: Line-Numbers Gating (LINENUM-01) Summary

Line-numbers gutter conditionally wired into the child editor via
`app.vault.getConfig('showLineNumber')` at child mount, mirroring the
Plan 17-06 D-18 vim mount pattern verbatim — closes round-2 UAT issue
LINENUM-01 (no line-number gutter regardless of Obsidian's global
showLineNumber setting) without any new dependencies, CSS changes, or
new conventions.

## Outcome

| Metric | Value |
| ------ | ----- |
| Duration | ~8 min |
| Tasks completed | 3 / 3 |
| Files modified | 3 |
| Test delta | +4 (32/32 GREEN; 28 → 32 in this file) |
| Full-suite tests | 1713 passed / 6 skipped (1719 total) |
| Build | clean (tsc -noEmit + esbuild production) |
| Bundle delta | +1,122 bytes raw (0.07% — well below the v1.2 1.8 MB ceiling) |
| 17-UAT.md tests appended | 1 (Test 24 LINENUM-01 — pending manual verification) |
| New deps | 0 (lineNumbers from already-imported @codemirror/view) |

## What Shipped

### 1. `src/main/childEditorFactory.ts` — `lineNumbers` import + conditional spread

**Edit 1 — Import block (line 27):** added `lineNumbers` between
`highlightActiveLine` and `ViewPlugin`. The package
`@codemirror/view` was already imported and is a transitive peer of the
`obsidian` npm package — no `package.json` / `package-lock.json` change.

**Edit 2 — Read site (lines 251-279):** new `lineNumbersEnabled` const
declared immediately after the existing `vimEnabled` const (lines 244-248).
Identical cast shape to D-18:

```ts
const lineNumbersEnabled =
  !!app &&
  (app as unknown as { vault: { getConfig(key: string): unknown } }).vault.getConfig(
    'showLineNumber',
  ) === true;
```

A 21-line comment block above the const documents:
- LINENUM-01 traceability + D-18 mirror provenance
- Read-once-at-mount semantic ("toggling Obsidian's setting at runtime
  requires note remount")
- Explicit "DO NOT ADD A LISTENER" directive for future contributors
- Vim `:set nu` interaction note (works automatically when both vim mode
  and showLineNumber are on, via @replit/codemirror-vim's standard
  handler operating on the gutter when present)

**Edit 3 — Conditional spread (lines 297-307):** new conditional spread
inserted immediately after the existing vim conditional at line 269:

```ts
...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
// 1c. Line-numbers gutter (Phase 17 Plan 12 / LINENUM-01) —
//     conditionally included when Obsidian's `showLineNumber`
//     editor preference is ON at child mount. Mirrors the D-18 vim
//     conditional shape exactly. Read-once-at-mount semantic [...]
...(lineNumbersEnabled ? [lineNumbers()] : []),
```

The `.cm-gutters` CSS rule at lines 312-315 is **untouched** — existing
transparent-bg / no-right-border styling already covers the gutter when
present.

### 2. `tests/main/childEditorFactory.test.ts` — 4 new tests

**Mock factory extended:** `vi.mock('@codemirror/view', ...)` at lines
12-39 now exports `lineNumbers: vi.fn().mockReturnValue('mock-line-numbers')`
between `highlightActiveLine` and `ViewPlugin` so the conditional spread
can be asserted by sentinel value (parallel to how `drawSelection` /
`highlightActiveLine` mocks expose their return values).

**Import block:** `lineNumbers` added to the test file's
`@codemirror/view` import (line 99-104, multi-line) so test bodies can
reference the mock fn directly via `expect(lineNumbers).toHaveBeenCalled()`.

**New describe block** at the end of the file:
`describe('createChildEditor — lineNumbers conditional (Phase 17 Plan 12 / LINENUM-01)', ...)`
with 4 `it()` blocks:

| # | Test | Asserts |
|---|------|---------|
| A | includes lineNumbers when showLineNumber === true | `getConfig` called with `'showLineNumber'`; `'mock-line-numbers'` sentinel in extensions array; `lineNumbers()` factory invoked |
| B | excludes lineNumbers when showLineNumber === false | `lineNumbers()` factory NOT invoked; sentinel NOT in extensions |
| C | excludes lineNumbers when app is undefined | Backward-compat for legacy 4-arg fixtures (`!!app && ...` guard) |
| D | calls getConfig('showLineNumber') exactly once | Pins read-once-at-mount semantic |

All 4 tests went RED → GREEN as the plan intended (Tests A and D failed
on Task 1; B and C passed trivially since the sentinel never lands in
the array regardless when no read site exists).

### 3. `.planning/phases/17-polish-edge-cases/17-UAT.md` — Test 24 entry

New `### 24. LINENUM-01 — Line numbers gutter honors Obsidian's showLineNumber setting (gap-closure round 2)` entry appended.

`expected:` paragraph covers: setting ON shows gutter, setting OFF hides
gutter, vim `:set nu` interaction, read-once-at-mount semantic
(remount required for setting changes to take effect).

`result: pending`, `notes: ""`.

Frontmatter summary block reconciled: `total: 23 → 24`, `pending: 1 → 2`.
Bottom Summary block + `## Current Test` line updated to match.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Plan acceptance criterion `grep -c showLineNumber == exactly 1` conflicts with must_haves directive to document the read-once semantic in source comments**

- **Found during:** Task 2 verification
- **Issue:** Plan Task 2 acceptance criteria included `grep -c "showLineNumber" src/main/childEditorFactory.ts returns exactly 1 (the read site — single source of truth)`. However, the same plan's `must_haves` truths #2 says `Document this in source comments at the gating site so a future contributor does not add reactivity`. The 21-line comment block satisfying the must_haves contract necessarily references `showLineNumber` multiple times when explaining the setting name in surrounding documentation. The two criteria cannot both hold simultaneously: comments referencing `showLineNumber` would push the grep count above 1.
- **Fix:** Resolved in favor of must_haves (higher-priority directive per plan structure). Final state: 5 occurrences in source — 1 actual literal-string read site at line 276 (the only behavior-affecting occurrence), 4 in comments documenting the setting name and read-once-at-mount semantic. The single read site is what matters for runtime behavior; the comments enforce the design contract for future contributors.
- **Files modified:** `src/main/childEditorFactory.ts`
- **Verification:** Read site at line 276 is the sole literal-string occurrence; verified via `grep -nE "'showLineNumber'" src/main/childEditorFactory.ts → 1 match`.
- **Commit:** `9cd51dd`

**2. [Rule 3 - Blocker] Test D `vi.fn(() => true)` produced TS2493 build error**

- **Found during:** Task 2 build verification (`npm run build` → tsc error on test file line 600)
- **Issue:** Test D's mock declaration `const getConfig = vi.fn(() => true);` made TypeScript infer the parameter list as empty `[]`, so `getConfig.mock.calls.filter((c) => c[0] === ...)` errored: `Tuple type '[]' of length '0' has no element at index '0'`. Tests passed at runtime (vitest doesn't enforce strict typing on mock arg lists) but `tsc -noEmit` blocked the build.
- **Fix:** Typed both the false-returning getConfig in Test B and the true-returning getConfig in Test D as `(_key: string) => boolean` so `mock.calls[i][0]` is correctly typed `string`. Underscore-prefix on the unused parameter avoids no-unused-vars lint complaint.
- **Files modified:** `tests/main/childEditorFactory.test.ts`
- **Verification:** `npm run build` → exit 0; `npm test -- tests/main/childEditorFactory.test.ts` → 32/32 GREEN.
- **Commit:** `9cd51dd` (squashed into the GREEN commit since the fix was inside the same Task 2 edit cycle).

**3. [Rule 3 - Blocker] UAT renumbering — Plan 17-13 already used Test 23**

- **Found during:** Task 3 (UAT update)
- **Issue:** Plan 17-12 specified appending the new entry as `### 23. LINENUM-01`, assuming the prior round-1 close left the file at 22 tests. However, Plan 17-13 (committed earlier in this round-2 batch) already appended Test 23 REPAIR-02. Adding LINENUM-01 as Test 23 would duplicate the heading.
- **Fix:** Renumbered to Test 24. Frontmatter summary `total` updated to 24 (not 23 as the plan stated); `pending` updated to 2 (LINENUM-01 + REPAIR-02). Plan's intent (append a new pending entry; reconcile summary blocks) is preserved exactly — only the test number and the resulting `total` differ from the plan's stale assumption.
- **Files modified:** `.planning/phases/17-polish-edge-cases/17-UAT.md`
- **Verification:** `grep -c "^### " .planning/phases/17-polish-edge-cases/17-UAT.md → 24`; `grep -c "LINENUM-01" .planning/phases/17-polish-edge-cases/17-UAT.md → 3` (Current Test marker, heading, validates line).
- **Commit:** `6e1d2b9`

**Total deviations:** 3 auto-fixed (1 acceptance-criteria conflict resolution, 1 TS strict-mode build fix, 1 UAT-numbering reconciliation against the parallel 17-13 update).
**Impact:** Zero functional impact. Production source diff matches the plan's intent exactly (1 import line, 1 read site, 1 conditional spread, all in the locations the plan specified). Test code shape matches the plan's 4-test contract verbatim. UAT update covers the same material with a different test number.

## Plan Invariants Preserved

| Invariant | Source | Verification |
|-----------|--------|--------------|
| Plan 17-06 D-18 conditional gating (`vimEnabled` declaration + ternary spread) | `src/main/childEditorFactory.ts:244-248, 269` | The 17-11 regression test "preserves Plan 17-06 D-18 conditional gating" still GREEN; `vimEnabled` count = 2. |
| Plan 17-11 `vim({ status: true })` conditional spread shape | `src/main/childEditorFactory.ts:269` | The 17-11 regression test "vim() is called with { status: true }" still GREEN; the new `lineNumbers` spread inserted AFTER the vim spread, never instead of it. |
| `.cm-gutters` CSS rule (transparent bg, no right border) | `src/main/childEditorFactory.ts:312-315` | Untouched — `git diff` shows zero lines added/removed in the EditorView.theme block. |
| `bracketMatching()` from Phase 13 unchanged | `src/main/childEditorFactory.ts:285` (post-edit line — was 277 pre-edit) | Lines 280-285 (themed highlight + bracket matching) entirely unmodified. |
| No new userEvent string introduced | CLAUDE.md `## Conventions` | This plan adds zero CM6 dispatches. The lineNumbers extension is purely visual — it does not generate transactions. |
| Bundle ceiling 1.8 MB (per 2026-05-23 Phase 17 D-19 user-approved decision) | STATE.md decisions | Post-plan main.js: 1,708,449 B (raw). +1,122 B vs 17-11 baseline (1,707,327 B). 0.07% delta — well within ceiling. Note: the plan's "bundle delta is bounded / zero" claim is approximately true; the small +1.1 KB delta comes from the new const/comment block code in childEditorFactory.ts (not from the @codemirror/view import which is already pulled in). |
| Zero new package.json / package-lock.json changes | repo root | `git diff package.json package-lock.json` → empty. |
| All Plan 17-04 fmReactivity tests still GREEN | `tests/main/fmReactivity.test.ts` | Full-suite: 1713 passed / 6 skipped. |
| All Plan 17-06 vim conditional gating tests still GREEN | `tests/main/childEditorFactory.test.ts` (Phase 17 Plan 11 describe block) | Targeted run: 32/32 GREEN. |

## Verification Evidence

```
$ npm test -- tests/main/childEditorFactory.test.ts
Test Files  1 passed (1)
     Tests  32 passed (32)

$ npm test (full suite)
Test Files  195 passed | 1 skipped (196)
     Tests  1713 passed | 6 skipped (1719)

$ npm run build
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
EXIT: 0

$ npx eslint src/main/childEditorFactory.ts tests/main/childEditorFactory.test.ts
✖ 11 problems (9 errors, 2 warnings)
  — All 11 are pre-existing (verified 1:1 against 17-11-SUMMARY.md
    "Verification Evidence" deferred-items list — same line numbers,
    same rules, same pre-existing-since-d7bff1f provenance). Zero new
    lint issues introduced by 17-12.

$ wc -c main.js
1708449 main.js
$ # 17-11 baseline (per STATE.md decisions): 1,707,327 B
$ # 17-12 delta: +1,122 B raw (0.07% increase)

$ git diff package.json package-lock.json
(empty — zero new dependencies)

$ grep -nE "'showLineNumber'" src/main/childEditorFactory.ts
276:      'showLineNumber',
$ # Single literal-string read site (the only behavior-affecting reference).

$ grep -c "^### " .planning/phases/17-polish-edge-cases/17-UAT.md
24
$ # Was 23 — incremented by exactly 1 for the LINENUM-01 entry.
```

Acceptance criteria (from PLAN.md per task):

**Task 1 (RED):**
- [x] New describe block matches `/lineNumbers conditional|LINENUM-01/`
- [x] Block contains 4 `it()` blocks (Tests A through D)
- [x] `vi.mock('@codemirror/view')` factory exports `lineNumbers` mock returning `'mock-line-numbers'`
- [x] Running tests on the pre-Task-2 `main` exits NON-ZERO (RED state confirmed: 2/4 failing)
- [x] All EXISTING tests in the file still pass (28/28 pre-existing GREEN)
- [x] Test A asserts `mockApp.vault.getConfig` called with `'showLineNumber'`
- [x] Test C explicitly omits the `app` argument; sentinel NOT in extensions

**Task 2 (GREEN):**
- [x] `npm test -- tests/main/childEditorFactory.test.ts` exits 0 (32/32 GREEN)
- [x] `npm test` full suite exits 0 (1713 passed)
- [x] `npm run build` exits 0
- [x] `grep -c "lineNumbers" src/main/childEditorFactory.ts` returns 5 (≥ 3 ✓)
- [⚠️] `grep -c "showLineNumber" src/main/childEditorFactory.ts` returns 5 (plan said exactly 1; resolved per Deviation §1 — 1 actual read site + 4 documentation refs satisfy the must_haves comment-documentation directive)
- [x] `grep -c "lineNumbersEnabled" src/main/childEditorFactory.ts` returns 2 (≥ 2 ✓)
- [x] `grep "Phase 17 Plan 12\|LINENUM-01" src/main/childEditorFactory.ts` matches (2 occurrences)
- [x] No change to `.cm-gutters` CSS rule
- [x] `git diff package.json package-lock.json` empty (zero new deps)

**Task 3 (UAT):**
- [x] `grep -c "^### " 17-UAT.md` returns 24 (was 23 — incremented by 1)
- [x] `grep -c "LINENUM-01" 17-UAT.md` returns 3 (≥ 1 ✓)
- [x] New Test 24 entry contains literal `expected:`, `result: pending`, `notes: ""`
- [x] Frontmatter `summary:` block has `total: 24`
- [x] Bottom Summary block reconciled: total 24, passed 14, issues 6, deferred 1, skipped 2, pending 2

## Manual UAT (Deferred — User Re-Run After Merge)

`17-UAT.md` Test 24 (LINENUM-01):

1. Obsidian Settings → Editor → enable "Show line numbers"
2. Reload the dev vault (or restart Obsidian) so the plugin re-mounts
3. Open a Java problem note; click into the child editor
4. **Expected:** Line-number gutter renders on the LEFT (1, 2, 3, ...
   matching body lines); transparent background per existing
   `.cm-gutters` styling
5. Toggle the setting OFF; reload; reopen the same note
6. **Expected:** No gutter — pure code body
7. With BOTH vim mode and line numbers enabled, in the child editor:
   - Press Esc → `:` → `set nonu` → Enter → gutter disappears
   - Type `:set nu` → gutter returns
8. Toggle the Obsidian setting WHILE a child is open → no immediate
   effect; remount (Cmd-E flip OR close+reopen) needed to see the
   change. This is the documented behavior, identical to vim's contract.

Test 24 is deferred to user re-run; the implementation is deterministic
per the source change — manual verification confirms the setting flows
through to the gutter render in the actual Obsidian runtime.

## Round-2 Gap-Closure Scope

This plan + Plan 17-13 are the only round-2 plans surfaced by user
manual testing on 2026-05-23 (post 17-07..17-11 round 1):

| Round 2 ID | Plan | Status | What It Closes |
|-----------|------|--------|----------------|
| LINENUM-01 | **17-12** | **Complete (this plan)** | Child editor honors Obsidian's `showLineNumber` global setting at mount |
| REPAIR-02 | 17-13 | Complete (commit 64c1d5d earlier in this batch) | Fence auto-recovery runtime trigger + missing-closer correctness |

After this plan ships, all round-2 gaps are closed. Phase 17 is ready
for the final UAT pass on Tests 23 + 24 (both pending) followed by
phase verification.

## Self-Check: PASSED

Verified:
- [x] `src/main/childEditorFactory.ts` exists and contains `lineNumbers` import + `lineNumbersEnabled` const + `(lineNumbersEnabled ? [lineNumbers()] : [])` spread
- [x] `tests/main/childEditorFactory.test.ts` exists and contains "createChildEditor — lineNumbers conditional (Phase 17 Plan 12 / LINENUM-01)" describe block with 4 `it()` blocks
- [x] `.planning/phases/17-polish-edge-cases/17-UAT.md` exists and contains Test 24 LINENUM-01 entry
- [x] Commit `df6e5ae` (test/RED) exists in `git log`
- [x] Commit `9cd51dd` (feat/GREEN) exists in `git log`
- [x] Commit `6e1d2b9` (docs/UAT) exists in `git log`
- [x] `npm test -- tests/main/childEditorFactory.test.ts` → 32/32 PASSED
- [x] `npm test` (full suite) → 1713 passed / 6 skipped
- [x] `npm run build` → exit 0
- [x] All Task 1/2/3 `<acceptance_criteria>` re-verified post-edit (see Verification Evidence; one criterion resolved per Deviation §1)
- [x] Plan 17-06 D-18 conditional gating preserved (vim regression tests still GREEN)
- [x] Plan 17-11 `{ status: true }` vim status panel preserved (regression test still GREEN)
- [x] `.cm-gutters` CSS rule untouched
- [x] Zero new dependencies (`git diff package.json package-lock.json` empty)

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access
patterns, or schema changes. Pure presentation-layer addition (one
conditional CM6 extension wired into the existing extensions array).
