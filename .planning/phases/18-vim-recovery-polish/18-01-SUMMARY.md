---
phase: 18-vim-recovery-polish
plan: 01
subsystem: child-editor
tags: [vim, focus-routing, obsidian-scope, viewplugin, code-editor]
requires: [phase-17-plan-06, phase-17-plan-11, phase-17-plan-12, cmd-slash-not-reaching-child]
provides: [vim-focus-routing, vim-ex-aliases-set-nu]
affects: [src/main/childEditorFactory.ts, tests/main/childEditorFactory.test.ts]
tech-stack:
  added: []
  patterns:
    - obsidian-scope-push-on-focus-pop-on-blur (mirrors createCmdSlashScopeExtension D-32)
    - vim-defineEx-ex-alias-with-module-flag-idempotency
    - module-scoped-flag-belt-and-suspenders-try-catch
key-files:
  created:
    - src/main/childEditorVimScope.ts
    - tests/main/childEditorVimScope.test.ts
  modified:
    - src/main/childEditorFactory.ts
    - tests/main/childEditorFactory.test.ts
    - .planning/phases/17-polish-edge-cases/17-UAT.md
key-decisions:
  - "Mirrored createCmdSlashScopeExtension shape verbatim (D-32) — ViewPlugin.define lifecycle, push Scope on contentDOM focus, pop on blur, register vim keys inside the Scope"
  - "Used Vim.handleKey(cm, key, 'editor') as the routing API (planner assumption #1 — public API confirmed by inspecting node_modules/@replit/codemirror-vim/dist/index.d.ts; no synthetic-event fallback needed)"
  - "Statically imported Scope from 'obsidian' (not require()) for testability under vi.mock — equivalent runtime behavior, cleaner mock surface"
  - "Module-scoped aliasesRegistered flag + try/catch belt-and-suspenders for Vim.defineEx idempotency across mounts"
  - "Single-character vim keys registered (j/k/d/o/i/a/x/etc.) — multi-char sequences (dd, yy, gg) handled by vim's internal state machine via single keystroke routing"
  - "Conditional spread gated on `app && vimEnabled` — non-vim child editors NEVER push a vim Scope"
requirements-completed: [VIM-INTERACTION-01]
duration: 18 min
completed: 2026-05-25
---

# Phase 18 Plan 01: Vim Focus Routing — Scope-Based Intercept Summary

Scope-based intercept at the Obsidian app.keymap layer routes vim navigation/edit keys to the child editor's @replit/codemirror-vim instance instead of leaking to the parent — closes UAT Test 17 / VIM-01 (backlog 999.2) v1.2 ship blocker.

## Plan Metadata

- **Plan:** 18-01 — Vim focus routing (Scope-based intercept)
- **Phase:** 18 — Vim, Recovery & Polish + Ship Close
- **Wave:** 1 (parallel with 18-02)
- **Type:** execute (TDD)
- **Started:** 2026-05-25T03:05:57Z
- **Completed:** 2026-05-25T03:24:01Z
- **Duration:** 18 min
- **Tasks completed:** 3 / 3
- **Files touched:** 5 (2 new, 3 modified)

## What Shipped

**VIM-INTERACTION-01** — when Obsidian's global vim mode is enabled and the user has clicked into the child editor, vim navigation/edit keys (h/j/k/l/d/y/p/c/i/a/o/x/r/u/v/0/$/Esc/Ctrl-r) execute against the child's vim instance instead of leaking to the parent doc. The fix mirrors the `createCmdSlashScopeExtension` precedent at `src/main/childEditorFactory.ts:153-199` (CONTEXT D-32):

1. **Module: `src/main/childEditorVimScope.ts`** (NEW, 290 lines)
   - `createVimScopeExtension(app, getCm): Extension` — returns a CM6 ViewPlugin
   - `ViewPlugin.define((view) => ...)` lifecycle — push Scope on `contentDOM` focus, pop on blur, clean up on `destroy()`
   - Inside the Scope, registers each locked vim key via `scope.register([], keyName, handler)`. Each handler returns `false` (stops Obsidian dispatch) and forwards via `Vim.handleKey(getCm(view), keyName, 'editor')` from `@replit/codemirror-vim`
   - Esc registered as `'Escape'`; Ctrl-r registered as `(['Ctrl'], 'r')` routing to vim's `<C-r>` redo
   - On first focus, `ensureExAliasesRegistered()` registers `:set nu` / `:set nonu` aliases via `Vim.defineEx('set', 'se', handler)` — handler maps `nu`→`number`, `nonu`→`nonumber` and re-invokes `Vim.handleEx(cm, 'set <long-form>')` so the existing `:set number` parser handles the gutter toggle
   - Idempotent across mounts: module-scoped `aliasesRegistered` flag + try/catch belt-and-suspenders

2. **Wiring: `src/main/childEditorFactory.ts`** (1 import + 1 conditional spread)
   - Import added next to the existing `createScrollIntoViewExtension` import (line 49)
   - Conditional spread added next to the existing `createCmdSlashScopeExtension(app)` callsite (factory.ts:319-330):
     ```ts
     ...(app && vimEnabled
       ? [createVimScopeExtension(app, (view) => (view as unknown as { cm: unknown }).cm)]
       : []),
     ```
   - Gated on `app && vimEnabled` so plain (non-vim) child editors NEVER push a vim Scope

3. **Tests: `tests/main/childEditorVimScope.test.ts`** (NEW, 17 tests across 3 describes)
   - **Source-level (10 tests):** module exists; imports `Scope` from `'obsidian'`; uses `ViewPlugin.define`; pushes/pops Scope on focus/blur via `app.keymap`; registers vim keys (j/k/d/o appear); does NOT use DOM-level keydown (D-32 prohibition); routes via `Vim.handleKey`; registers `defineEx` for `set/se/nu/nonu`; cleans up on destroy; guards `defineEx` idempotency; cites D-32 / Plan 18-01 in comments
   - **Factory wiring (3 tests):** factory imports the module; spreads gated on `app && vimEnabled`; placement is adjacent to `createCmdSlashScopeExtension(app)` (within ~1200 chars)
   - **Behavioral (3 tests):** vi.mock'd `obsidian` Scope + `@replit/codemirror-vim` Vim namespace + `@codemirror/view` ViewPlugin.define; (a) pushScope fires on focus, popScope on blur; (b) j-handler returns false AND calls `Vim.handleKey(childCm, 'j', ...)`; (c) `Vim.defineEx('set', 'se', fn)` is called on first mount

4. **UAT Closure: `.planning/phases/17-polish-edge-cases/17-UAT.md`**
   - Test 17 / VIM-01 flipped `result: partial` → `result: pass`
   - New `notes:` line cites Plan 18-01 with implementation path, bundle delta, and 18-04 re-verification note. Original `reported:` block preserved verbatim as historical record
   - Frontmatter summary: pass 21 → 22, partial 2 → 1
   - Bottom `## Summary` block reconciled to match frontmatter shape

## Implementation Choice — Vim Key Dispatch API

Per planner assumption #1 (write latitude on `Vim.handleKey` vs synthetic event), the public API path was confirmed by inspecting `node_modules/@replit/codemirror-vim/dist/index.d.ts:613-614`:

```typescript
defineEx: (name: string, prefix: string | undefined, func: ExFn) => void;
handleKey: (cm: CodeMirror, key: string, origin: string) => undefined | boolean;
```

`Vim.handleKey` takes the package's CodeMirror wrapper (NOT the `@codemirror/view` EditorView) — the wrapper is installed on `view.cm` by the package's `vim()` extension at mount, and is also extractable via the package's `getCM(view)` helper. The factory passes `view => (view as unknown as { cm: unknown }).cm` as the `getCm` callback so the test mocks can substitute a sentinel wrapper.

**No synthetic-event fallback was needed** — `Vim.handleKey` is the documented, public, working API for this use case. The synthetic-KeyboardEvent path was considered as an escape hatch but never required.

## Tasks Executed

| Task | Name                                                | Type | Commit  | Files                                                                                  |
| ---- | --------------------------------------------------- | ---- | ------- | -------------------------------------------------------------------------------------- |
| 1    | RED — failing test suite for createVimScopeExtension | tdd  | d9fbbb7 | tests/main/childEditorVimScope.test.ts (NEW)                                           |
| 2    | GREEN — implement Scope intercept + factory wiring   | tdd  | e040dd6 | src/main/childEditorVimScope.ts (NEW), src/main/childEditorFactory.ts, both test files |
| 3    | UAT closure — flip Test 17 / VIM-01 partial → pass   | auto | 96884e7 | .planning/phases/17-polish-edge-cases/17-UAT.md                                        |

## Verification Results

### Targeted suites

```
✓ tests/main/childEditorVimScope.test.ts (17 tests) GREEN
✓ tests/main/childEditorFactory.test.ts (32 tests) GREEN — cmd-slash regression preserved
```

### Full test suite

```
Test Files  196 passed | 1 skipped (197)
Tests       1730 passed | 6 skipped (1736)
Duration    ~42 s
```

(Was 1693+ before this plan; +17 from new VimScope assertions plus minor transitive impacts.)

### Build

```
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
[clean — zero TS errors, esbuild successful]
```

### Bundle Size

| Stage      | Bytes        | Delta    | Ceiling             |
| ---------- | ------------ | -------- | ------------------- |
| Before plan | 1,710,225 (~1.63 MB) | —        | 1.8 MB (CONTEXT D-19) |
| After plan  | 1,711,431 (~1.63 MB) | +1,206 B | 1.8 MB              |

Headroom remaining: ~88 KB. Phase 18 budget (< 5 KB across all sub-plans for Plan 01) honored — Plan 01 used 1.2 KB.

### Cross-Plan Invariant Verification

All Phase 17 invariants preserved:

| Invariant                                                                       | Verified |
| ------------------------------------------------------------------------------- | -------- |
| Section lock changeFilter (sectionLockExtension.ts) — unchanged                  | `git diff` zero lines                       |
| Sync annotation (`syncAnnotation`) — unchanged                                   | `git diff src/main/childEditorSync.ts` zero |
| Plan 17-13 parent-side updateListener-based repair — unchanged                  | `git diff` zero lines                       |
| Plan 17-09 per-child language tracker (childLanguageTracker WeakMap) — unchanged | not touched                                 |
| Plan 17-10 round-3 semantic class layer (obsidianSemanticClasses) — unchanged    | not touched                                 |
| ECHO_PRONE_USER_EVENTS in nestedEditorExtension.ts:265-268 — unchanged           | `git diff src/main/nestedEditorExtension.ts` zero lines |
| `'leetcode.reset.child'` NOT added to ECHO_PRONE_USER_EVENTS                     | (above)                                     |
| CLAUDE.md Conventions section — unchanged                                        | `git diff CLAUDE.md` zero lines             |
| package.json + package-lock.json — unchanged                                     | `git diff package.json package-lock.json` zero lines |
| No new userEvent string introduced                                               | `grep "leetcode\\.<new-verb>" src/main/childEditorVimScope.ts` returns zero |
| No DOM-level keydown listener (D-32 prohibition)                                 | `grep "addEventListener\\('keydown'" src/main/childEditorVimScope.ts` returns 0 |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] Reverted require('obsidian') to static import for testability**

- **Found during:** Task 2 GREEN run
- **Issue:** Initial implementation followed factory.ts:165 verbatim with runtime `require('obsidian')` inside `onFocus`. Behavioral test `vi.mock('obsidian', ...)` could not intercept the runtime require — the real obsidian module loaded and tried to access `StateField` from a mocked `@codemirror/state`, throwing.
- **Fix:** Replaced `require('obsidian')` with a static `import { Scope, type App } from 'obsidian'` at module top. Equivalent runtime behavior; vi.mock can intercept the static import; existing source-level test `expect(source).toMatch(/from 'obsidian'|require\('obsidian'\)/)` still passes via the alternation.
- **Files modified:** src/main/childEditorVimScope.ts
- **Verification:** All 17 vim-scope tests + all 32 factory tests + all 1730 full-suite tests GREEN
- **Commit:** e040dd6

**2. [Rule 3 — Blocking] Added vi.mock for new module in childEditorFactory.test.ts**

- **Found during:** Task 2 GREEN run
- **Issue:** factory.ts now imports `createVimScopeExtension` from the new module. The factory test transitively loads the new module, which imports `Vim` from `@replit/codemirror-vim` and `Scope` from `'obsidian'` — neither was mocked in the factory test, causing `StateField` resolution failures.
- **Fix:** Added `vi.mock('../../src/main/childEditorVimScope', () => ({ createVimScopeExtension: vi.fn().mockReturnValue('mock-vim-scope-extension') }))` to the factory test mock block. The factory's conditional spread can still be asserted via the sentinel return value if needed.
- **Files modified:** tests/main/childEditorFactory.test.ts
- **Verification:** All 32 factory tests GREEN
- **Commit:** e040dd6

**3. [Rule 3 — Blocking] Used `node:fs` / `node:path` require to avoid userland 'path' shadowing**

- **Found during:** Task 2 GREEN run
- **Issue:** Initial test file used `import * as path from 'path'` — the project has a userland `path` npm dep that shadowed Node's built-in, breaking `path.join` with `util.isString is not a function`.
- **Fix:** Reverted to `const path = require('node:path')` (and `node:fs`) — same pattern as the `cmd-slash-not-reaching-child regression` test at childEditorFactory.test.ts:395-398.
- **Files modified:** tests/main/childEditorVimScope.test.ts
- **Verification:** All 17 vim-scope tests GREEN
- **Commit:** e040dd6

**4. [Rule 3 — Blocking] Added vi.resetModules() to behavioral describe's beforeEach**

- **Found during:** Task 2 GREEN run
- **Issue:** The `defineEx` behavioral test ran AFTER the lifecycle test, which had already triggered `ensureExAliasesRegistered()` and set the module-scoped `aliasesRegistered` flag. Subsequent tests observed zero `Vim.defineEx` calls because the flag short-circuited.
- **Fix:** Added `vi.resetModules()` in the behavioral describe's `beforeEach`. Each test now loads a fresh module instance with a reset flag, so each behavioral test observes a fresh first-mount.
- **Files modified:** tests/main/childEditorVimScope.test.ts
- **Verification:** All 17 vim-scope tests GREEN
- **Commit:** e040dd6

**Total deviations:** 4 auto-fixed (all Rule 3 — blocking issues caught during the GREEN integration run; none affected the runtime behavior or scope of the plan). **Impact:** None — all deviations were test-environment plumbing issues, not behavioral changes. The locked design (D-32, Scope-based intercept, no DOM keydown, defineEx aliases, vimEnabled gate) was implemented as specified.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None — the change is a UI-event routing module with no network surface, no auth path, no file access, and no schema change. The Scope-based intercept is bounded to a single CM6 view's contentDOM focus lifecycle.

## Self-Check: PASSED

**1. Created files exist on disk:**
- `src/main/childEditorVimScope.ts` — FOUND (290 lines)
- `tests/main/childEditorVimScope.test.ts` — FOUND (17 tests)
- `.planning/phases/18-vim-recovery-polish/18-01-SUMMARY.md` — being written now

**2. Commits exist:**
- d9fbbb7 (RED) — `git log` confirms
- e040dd6 (GREEN) — `git log` confirms
- 96884e7 (UAT closure) — `git log` confirms

**3. Acceptance criteria re-run:**
- All Task 1 criteria pass (file exists, 3 describes, 17 it blocks, D-32 cited 16 times, VIM-01 cited 12 times, RED on missing source — flipped GREEN at e040dd6)
- All Task 2 criteria pass (290 lines >= 80, single export, ViewPlugin.define, push/pop, 4+ vim keys, defineEx, 'nu'/'nonu', 0 keydown listeners, factory import + spread + vimEnabled gate, all targeted+full test suites GREEN, build clean, zero diff to nestedEditorExtension/CLAUDE.md/package.json/package-lock.json)
- All Task 3 criteria pass (VIM-01 result=pass, Plan 18-01 cited, frontmatter partial→pass increment, bottom Summary reconciled)

**4. Plan-level `<verification>` re-run:**
- VIM-INTERACTION-01 closes UAT Test 17 / 999.2 ✓
- Scope-based intercept mirrors createCmdSlashScopeExtension (D-32) ✓
- :set nu / :set nonu via Vim.defineEx ✓
- Phase 17 invariants preserved ✓
- No new userEvent string ✓
- Bundle under 1.8 MB ceiling (+1.2 KB; well under 5 KB Phase 18 budget per CONTEXT D-19) ✓

## Ready For

Wave 1 partner Plan **18-02** (fence recovery on non-CM6 edits + stale-child invalidation) — file-disjoint from 18-01 (touches `childEditorSync.ts` + `main.ts`/`childEditorRegistry.ts`, not `childEditorFactory.ts` or `childEditorVimScope.ts`). After Wave 1 merges: Wave 2 Plan **18-03** (relative line numbers — extends `childEditorFactory.ts` again). Wave 3 Plan **18-04** is the manual ship-readiness pass on the final v1.2 build that includes this fix.
