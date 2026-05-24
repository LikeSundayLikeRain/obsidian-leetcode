---
phase: 17-polish-edge-cases
plan: 08
subsystem: solve/reset-code
tags: [reset-code, language-priority, regression-fix, gap-closure, phase-17, phase-16-d06]
requires:
  - 17-01  # Phase 17 D-03/D-04/D-05 — Reset child-CM6 dispatch + cm-z scope isolation
provides:
  - resolveActiveLangSlug seam on ResetCodeWithConfirmDeps
  - production resolver implementing fm > fence opener > default chain
affects:
  - src/solve/resetCodeWithConfirm.ts
  - src/main.ts (resetCode wrapper)
  - tests/main/resetCommand.childDispatch.test.ts
tech-stack:
  added: []
  patterns:
    - caller-supplied seam for language resolution (mirrors getDispatchHandle pattern)
    - explicit-fm-priority resolver (does NOT reuse readActiveFenceSlug to avoid collapsing fallback distinction)
key-files:
  created: []
  modified:
    - src/solve/resetCodeWithConfirm.ts
    - src/main.ts
    - tests/main/resetCommand.childDispatch.test.ts
key-decisions:
  - Implemented as an OPTIONAL seam (resolveActiveLangSlug?:) so legacy callers in tests/main/resetCommand.test.ts stay GREEN without modification
  - Production resolver does NOT reuse this.readActiveFenceSlug because that helper's internal metadataCache fallback collapses fence-opener-fallback and fm-fallback into the same source — the canonical chain requires EXPLICIT-fm-only at Priority 1 so unset fm correctly drops to fence opener at Priority 2
  - Plan 17-01 invariants preserved verbatim — Reset still dispatches on the child with userEvent 'leetcode.reset.child' and no Transaction.addToHistory.of(false); the existing parent-side mirror in childEditorSync.ts:108-114 carries addToHistory.of(false) on the parent
requirements-completed: [LANG-01, INDENT-04, ENTER-02, ENTER-03, ENTER-04, COMMENT-01, BRACKET-01, BRACKET-02, BRACKET-03, BRACKET-04]
duration: "7 min"
completed: 2026-05-24
---

# Phase 17 Plan 08: Reset Code Language Priority Chain Restoration Summary

Restores the Phase 16 D-06 canonical language priority chain (`lc-language` frontmatter > active fence opener tag > `getDefaultLanguage`) at the Phase 17 D-03 child-CM6 dispatch site by adding an optional `resolveActiveLangSlug` seam on `ResetCodeWithConfirmDeps` and wiring the production resolver in `src/main.ts:resetCode`.

## Context

17-UAT.md Test 10 (RESET-01) reported the regression: Reset wrote a Python starter into a Java problem note where chevron AND `lc-language` frontmatter both still said `java`. Source inspection confirmed `src/solve/resetCodeWithConfirm.ts:138` unconditionally called `deps.settings.getDefaultLanguage()` (which is `python3` in the user's settings) — the Phase 16 reset-code-language-regression fix's resolver chain was not preserved through the Phase 17 D-03 refactor (Plan 17-01).

## Tasks Completed

### Task 1 — Failing regression tests (RED)

**File:** `tests/main/resetCommand.childDispatch.test.ts`

Added 4 new `it(...)` blocks to the existing `describe(...)` block:

- **Test 5** — Java fm + Python default → Java starter (validates fm priority over default; **RED** before fix)
- **Test 6** — fence opener `cpp` + Python default → C++ starter (validates fence-opener priority when fm absent; **RED** before fix)
- **Test 7** — resolver returns undefined → Python default (validates fallback path; passes coincidentally on baseline because the bug aligned with the expected fallback)
- **Test 8** — resolver omitted entirely → Python default (validates backward compat for legacy fixtures; passes coincidentally on baseline for the same reason)

Each test uses `vi.fn()` settings, captures the dispatched `next` argument via `replaceFullBody`, and asserts the langSlug-determined starter content is present in the captured payload.

**Commit:** `5927872` — `test(17-08): add failing regression tests for Reset language priority chain`

### Task 2 — Seam added to resetCodeWithConfirm (GREEN — helper side)

**File:** `src/solve/resetCodeWithConfirm.ts:88-145, 157-172`

Two changes:

1. Added optional field `resolveActiveLangSlug?: (file: TFile) => string | undefined` to `ResetCodeWithConfirmDeps` (after `getDispatchHandle?` to keep the D-03/D-06 contract co-located). Full JSDoc documents the canonical priority chain, the undefined-fallback semantics, and references to Phase 16 debug doc + 17-UAT.md Test 10.
2. Replaced the langSlug derivation at line 138 with the resolver-first/default-fallback pattern:
   ```ts
   const resolved = deps.resolveActiveLangSlug?.(deps.file);
   const langSlug =
     typeof resolved === 'string' && resolved.length > 0
       ? resolved
       : deps.settings.getDefaultLanguage();
   ```

No other lines of the helper modified. Backward compat preserved — legacy callers in `tests/main/resetCommand.test.ts` that don't supply the seam continue to follow the default-only path.

**Commit:** `c5e9874` — `fix(17-08): add resolveActiveLangSlug seam to resetCodeWithConfirm`

### Task 3 — Production wiring at resetCode caller (GREEN — caller side)

**File:** `src/main.ts:2916-3013`

Added `resolveActiveLangSlug` field on the deps object passed to `resetCodeWithConfirm`. The resolver implements the canonical chain:

1. **Priority 1** — `lc-language` frontmatter (canonical, chevron's source of truth) read directly via `this.app.metadataCache.getFileCache(targetFile)?.frontmatter`.
2. **Priority 2** — active fence opener tag from the active `MarkdownView` only (`getActiveViewOfType(MarkdownView)` + `findCodeFence(cm.state)` + opener regex `/^\s*```\s*(\S+)\s*$/`).
3. **Priority 3** — return `undefined` so the helper falls through to `settings.getDefaultLanguage()`.

Defensive `try/catch` wraps both lookups so any unexpected access error returns `undefined` (preserves the legacy-default fallback rather than crashing Reset).

**Critical decision** — does NOT call the existing `this.readActiveFenceSlug(file)` helper, because that helper's internal `metadataCache.lc-language` fallback collapses the priority distinction by treating fence-opener-fallback and fm-fallback as the same source. The canonical chain requires **EXPLICIT-fm-only** at Priority 1 so unset fm correctly drops to Priority 2 (fence opener). The new resolver duplicates the structural pattern of `readActiveFenceSlug` but with the explicit-fm-only gate.

**Commit:** `9e34878` — `fix(17-08): wire resolveActiveLangSlug at resetCode caller`

## Verification

| Check | Result |
|---|---|
| `npm test -- tests/main/resetCommand.childDispatch.test.ts` | 8/8 GREEN (Tests 1-4 from Plan 17-01 + Tests 5-8 new) |
| `npm test -- tests/main/resetCommand.test.ts` | 8/8 GREEN (legacy fixtures preserved) |
| `npm test` (full suite) | 1688 passed, 6 skipped, 0 failures |
| `npm run build` | clean (tsc -noEmit + esbuild production) |
| `npm run lint` (changed files) | No NEW errors. Pre-existing `obsidianmd/no-tfile-tfolder-cast` at `src/main.ts:2633` (existing `readActiveFenceSlug` helper) is untouched and out of scope per fix-attempt limit + scope-boundary rule. |

### Acceptance criteria audit

| Criterion | Result |
|---|---|
| 8 it() blocks in `resetCommand.childDispatch.test.ts` (4 + 4 new) | ✓ |
| Test 5 captures `next` and asserts Java marker present, Python marker absent | ✓ |
| `grep -c "resolveActiveLangSlug" tests/main/resetCommand.childDispatch.test.ts` ≥ 4 | ✓ (4 occurrences) |
| `grep -c "resolveActiveLangSlug" src/solve/resetCodeWithConfirm.ts` ≥ 3 | ✓ (3 occurrences — interface field + JSDoc reference + helper-body call) |
| `deps.resolveActiveLangSlug?.(deps.file)` exact pattern present | ✓ |
| Legacy line `const langSlug = deps.settings.getDefaultLanguage();` removed | ✓ (count = 0) |
| `deps.settings.getDefaultLanguage()` still referenced as fallback | ✓ (count = 1) |
| `grep -c "resolveActiveLangSlug" src/main.ts` ≥ 1 | ✓ (1 occurrence — the deps-object field) |
| `metadataCache.getFileCache` count incremented | ✓ (15 → 16, +1) |
| `findCodeFence` count incremented | ✓ (7 → 8, +1) |
| Resolver body contains `'lc-language'` and `findCodeFence` | ✓ |
| `leetcode.reset.child` count unchanged from Plan 17-01 baseline | ✓ (2 occurrences, unchanged) |

## Phase 17 D-03 / D-05 Invariants Preserved

The fix is purely additive at the helper's `langSlug` derivation site and at the production caller's deps object — Plan 17-01's child-CM6 dispatch + cm-z scope isolation work is preserved verbatim:

- **D-03 dispatch path:** Reset still routes through the child via `getDispatchHandle` when a child is registered; `vault.process` fallback (D-04) still runs when no child is registered.
- **D-05 cm-z scope isolation:** child dispatch still carries `userEvent: 'leetcode.reset.child'` with NO `Transaction.addToHistory.of(false)`. The existing parent-side mirror in `src/main/childEditorSync.ts:108-114` continues to apply `addToHistory.of(false)` to the parent.
- **No new userEvent introduced:** CLAUDE.md `## Conventions` block does NOT need an update for this plan.
- **`ECHO_PRONE_USER_EVENTS` unchanged:** `'leetcode.reset.child'` remains absent from the set.

## Deviations from Plan

None — plan executed exactly as written.

The orchestrator's worktree branch was created from an obsolete base (`740929f`, before the v1.1 PR merge) instead of the expected `gsd/v1.2-code-editor-experience` HEAD (`255e948`). Followed the workflow's `<worktree_branch_check>` block: asserted HEAD on per-agent branch (`worktree-agent-a58ad0827cee11191`, NOT a protected ref), then `git reset --hard 255e948` to align with the expected base. This is documented as the canonical recovery from the known `EnterWorktree` issue (#2015) and is not a deviation from the plan.

## Authentication Gates

None.

## Manual UAT Reference

17-UAT.md Test 10 (RESET-01) to be re-verified post-merge:

1. Open a Java problem note with `lc-language: java` frontmatter and `python3` set as default language.
2. Cmd-P → "Reset code" → confirm.
3. Verify the fence body is the Java starter (e.g., `class Solution { ... }`), not the Python starter (`class Solution: ...`).
4. Verify `lc-language: java` frontmatter unchanged.
5. Verify chevron still shows Java.

## Next Steps

Plan 17-09 — UAT Issue 3 closure (Test 11 RESET-02 — chevron + frontmatter sync after Reset, if not already covered by the chevron-switch fix in Phase 16 D-12).

## Self-Check: PASSED

Files verified on disk:
- `src/solve/resetCodeWithConfirm.ts` — present, contains `resolveActiveLangSlug` (3×) and the resolver-first derivation
- `src/main.ts` — present, contains `resolveActiveLangSlug` (1×) and the canonical resolver
- `tests/main/resetCommand.childDispatch.test.ts` — present, 8 it() blocks total

Commits verified in `git log --oneline`:
- `5927872` — RED tests
- `c5e9874` — helper seam (GREEN)
- `9e34878` — production wiring (GREEN)

Acceptance criteria — all PASSED (see audit table above).
Plan-level verification:
- The fix is purely additive ✓
- No new userEvent ✓
- Backward compat preserved ✓
- Phase 16 D-06 chain restored ✓
- 17-UAT.md Test 10 ready for manual re-verification ✓
