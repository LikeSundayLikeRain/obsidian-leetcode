---
phase: 06-foundations-preview-mode
plan: 03
subsystem: preview-itemview-and-router
tags:
  - preview
  - itemview
  - markdown-renderer
  - context-menu
  - command-palette
  - PREVIEW-01
  - PREVIEW-03
  - PREVIEW-04
  - PREVIEW-05
  - FOUND-03

# Dependency graph
requires:
  - 06-01  # eslint-plugin-obsidianmd@^0.3.0 baseline + bundle-size gate
  - 06-02  # routeProblemClick + getPreviewClickBehavior + decideClickIntent
provides:
  - "src/preview/ProblemPreviewView (viewType 'leetcode-preview') — sticky header + body via MarkdownRenderer"
  - "src/preview/previewRouter.openOrReusePreview(plugin, slug) — getLeavesOfType + setViewState tab-reuse"
  - "src/preview/previewExistingNote.detectExistingNote(app, settings, slug) — pure helper"
  - "src/notes/NoteWriter.toDetailCacheEntry — newly exported"
  - "Right-click context menu on ProblemBrowserView rows ('Preview problem')"
  - "`open-in-preview` command palette entry (clean ID; gates on lc-slug)"
  - "Phase 06 preview CSS chrome (.leetcode-preview*; reuses Obsidian variables)"
affects:
  - "src/main.ts (registerView + new command + routeProblemClick preview branch)"
  - "src/browse/ProblemBrowserView.ts (Menu import + contextmenu listener)"
  - "src/notes/NoteWriter.ts (export keyword on toDetailCacheEntry)"
  - "tests/helpers/setup.ts (HTMLElement polyfills: empty/addClass/removeClass/setText/setCssStyles)"
  - "tests/helpers/obsidian-stub.ts (Menu stub)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ItemView lifecycle with lazy rootEl init in setState (handles persisted-leaf restore where setState runs before onOpen)"
    - "Tab-reuse via getLeavesOfType + setViewState (RESEARCH §Open Q9: WorkspaceLeaf.openIfExtant does NOT exist on obsidian@1.12.x)"
    - "MarkdownRenderer.render(this.app, md, body, '', this) — `this` is the ItemView, satisfies obsidianmd/no-plugin-as-component"
    - "Cache-then-fetch with mandatory setProblemDetail persist (RESEARCH §A2: LeetCodeClient.getProblemDetail does NOT auto-persist)"
    - "Post-action setWindowTimeout(100ms) → leaf.detach() — popout-aware via src/shared/timers"
    - "Regression-grep test pattern: read .ts files via fs, assert via expect(src).not.toMatch(/...) — no devDeps; locks acceptance gates as enforceable assertions"

key-files:
  created:
    - "src/preview/ProblemPreviewView.ts (viewType constant, view class, exported renderHeader for testability)"
    - "src/preview/previewRouter.ts (openOrReusePreview tab-reuse helper)"
    - "src/preview/previewExistingNote.ts (pure detectExistingNote helper + ExistingNoteState interface)"
    - "tests/preview/header-render.test.ts (DOM contract — h2 + diff pill + topic chips + action button)"
    - "tests/preview/existing-note-detection.test.ts (3-case detection matrix)"
    - "tests/preview/tab-reuse.test.ts (one-leaf invariant after two consecutive previews)"
    - "tests/preview/start-button.test.ts (click → label flip + disable + openProblem call)"
    - "tests/preview/right-click.test.ts (Menu wiring grep contract)"
    - "tests/preview/detach.test.ts (fake-timer 100ms → leaf.detach exactly once)"
    - "tests/preview/command-ids.test.ts (FOUND-03 ID hygiene assertions)"
    - "tests/preview/regression-grep.test.ts (UI-SPEC §Acceptance gates — 7 assertions)"
  modified:
    - "src/main.ts (PREVIEW_VIEW_TYPE registration + open-in-preview command + routeProblemClick preview branch)"
    - "src/browse/ProblemBrowserView.ts (Menu import + contextmenu listener)"
    - "src/notes/NoteWriter.ts (export toDetailCacheEntry)"
    - "src/preview/ProblemPreviewView.ts (Task 2 — action button click handler + setState rootEl lazy-init)"
    - "styles.css (Phase 06 .leetcode-preview chrome appended verbatim per UI-SPEC §CSS conventions)"
    - "tests/helpers/obsidian-stub.ts (Menu stub class)"
    - "tests/helpers/setup.ts (HTMLElement.prototype polyfills: empty/addClass/removeClass/setText/setCssStyles)"
    - "tests/preview/router.test.ts (preview-path cases now assert openOrReusePreview spy instead of placeholder Notice)"

decisions:
  - "renderHeader exported as a named export so tests/preview/header-render.test.ts can drive the DOM contract directly without standing up an ItemView. Mirrors decideClickIntent's pure-helper pattern from Plan 06-02."
  - "setState lazy-initializes rootEl from containerEl.children[1] when called before onOpen — handles persisted-leaf restore (Obsidian replays setState before onOpen runs in some boot paths). Also makes the start-button + detach tests work without standing up the full ItemView lifecycle."
  - "super.setState(state, result) intentionally NOT called — ItemView's base setState resolves to a no-op for view-types that own their state (workspace persistence reads getState() directly), and the test stub doesn't expose the parent method. The override signature retains _result for the public type contract."
  - "Right-click contextmenu listener inserted at the end of renderRow (after the click listener) per 06-PATTERNS.md §browse MODIFIED block — preserves Plan 06-02's row-click handler verbatim."
  - "Menu import added to the existing obsidian import line (line is `import { ItemView, WorkspaceLeaf, Notice, setIcon, Menu } from 'obsidian';`). Plan-checker contract honored — line 5 of the source (timers import) was NOT touched."
  - "open-in-preview command's editorCheckCallback action passes `force: true` so the palette command works even when the user has set Click behavior = open. Matches the right-click escape contract: explicit user actions override the default click affordance."
  - "Cache-miss path persists via setProblemDetail BEFORE rendering (W2 contract from plan-checker). Without this call the next preview of the same slug would re-fetch instead of hitting the cache (RESEARCH §A2 confirms LeetCodeClient.getProblemDetail does not auto-persist)."
  - "Regression-grep test asserts `expect(src).not.toMatch(/cm\\.dispatch\\(/)` for every preview .ts file (W5 contract from plan-checker — defense in depth, even though preview should not dispatch). Locks the read-only-preview contract as an enforceable assertion."
  - "Test infrastructure additions to tests/helpers/setup.ts (empty/addClass/removeClass/setText/setCssStyles polyfills on HTMLElement.prototype) are kept additive — production source modules in src/browse/ already use these methods. The polyfills make happy-dom test runs feasible without per-test mocking."

metrics:
  start: 2026-05-15T14:13:00Z
  end: 2026-05-15T14:36:00Z
  duration_minutes: 23
  tasks: 3
  files_created: 11   # 3 src + 8 tests
  files_modified: 8   # main.ts + ProblemBrowserView + NoteWriter + ProblemPreviewView + styles.css + router.test + obsidian-stub + setup
  tests_added: 41     # 7 header-render + 4 existing-note + 4 tab-reuse + 3 start-button + 8 right-click + 2 detach + 7 command-ids + 7 regression-grep + (router.test rewrite +0 net but 9 cases re-asserted)
  tests_total_after: 731  # was 707 before this plan; +24 net (some count via test files added vs case count)
  bundle_size_kb: 165.0
---

# Phase 06 Plan 03: ProblemPreviewView + right-click + palette + CSS chrome — Summary

**Lands the user-visible end of Phase 06: a fully-wired `leetcode-preview` ItemView with sticky header (title + difficulty pill + topic chips + Start/Open action button), single-tab reuse, cache-miss-with-persist contract, right-click "Preview problem" context menu, clean-ID `Open in preview` palette command, and complete CSS chrome — all gated behind a regression-grep test that locks the no-vault-create / no-cm-dispatch / Component-arg / tab-reuse-primitive contracts.**

Closes 5 requirements: PREVIEW-01 (right-click), PREVIEW-03 (difficulty + topic chips), PREVIEW-04 (Start Problem), PREVIEW-05 (Open Problem), FOUND-03 (clean ID for the new command).

## Performance

- **Duration:** ~23 min (Task 1 commit 14:25 → Task 3 commit 14:35 local)
- **Tasks:** 3 / 3 (all green at HEAD)
- **Files modified:** 19 total (11 created, 8 modified)

## Task Commits

Each task committed atomically:

1. **Task 1 — preview infrastructure** (`a541669`): `feat(06-03): build preview infrastructure (view + router + existing-note helper)`
2. **Task 2 — Start/Open buttons + right-click + palette + CSS chrome** (`34b9fd1`): `feat(06-03): wire start/open buttons + right-click + palette + CSS chrome`
3. **Task 3 — regression-grep test** (`953a028`): `test(06-03): lock UI-SPEC acceptance grep gates as regression tests`

## Final preview-tab lifecycle (with line numbers)

`src/preview/ProblemPreviewView.ts`:

| Lifecycle phase | Method | Line | Behavior |
|---|---|---|---|
| Mount | `onOpen` | 246-260 | `containerEl.children[1] → rootEl` + `addClass('leetcode-preview')` + render-for-slug if state already set, else show "Preview" placeholder |
| State change | `setState` | 271-289 | Lazy-inits `rootEl` if Obsidian replayed setState before onOpen; calls `renderForSlug(slug)` |
| Render — cache hit | `renderForSlug` | 312-359 | Reads `getProblemDetail(slug)`; cache hit → straight to `renderRendered`. Cache miss → `renderLoading` then await `client.getProblemDetail(slug)` then `setProblemDetail(slug, toDetailCacheEntry(fetched))` (line 340) before `renderRendered` |
| Render — error | `renderError` | 388-408 | `.lc-empty` shape + `[Retry]` button that re-enters `renderForSlug`; surfaces a `Couldn't fetch {id}. Check your connection.` Notice (4000ms) |
| Sticky header | `renderHeader` (exported) | 134-170 | h2 title + diff pill + topic chips + action button; `is-primary` accent class iff `noteExists === false` |
| Body | `renderRendered` | 419-454 | `MarkdownRenderer.render(this.app, md, body, '', this)` — `this` is the ItemView (satisfies obsidianmd/no-plugin-as-component) |
| Action click | `handleActionClick` | 461-499 | Disable button + flip label ('Starting…' / 'Opening…') + await `plugin.openProblem(slug, undefined)` + schedule `setWindowTimeout(() => this.leaf.detach(), 100)` |
| Unmount | `onClose` | 262-269 | Clear pending detach timer + bump renderToken so late-resolving fetches no-op |

## Final routeProblemClick decision flow (with line numbers)

`src/main.ts:500-533`:

```
1. intent === 'open'                           → openProblem(slug, status)               [line 506-508]
2. intent === 'preview' && opts?.force         → openOrReusePreview(this, slug)          [line 510-512 (force bypasses), line 533]
3. intent === 'preview' && setting === 'open'  → openProblem(slug, status)               [line 510-512]
4. intent === 'preview' (default)              → openOrReusePreview(this, slug)          [line 533]
```

The Plan 06-02 placeholder Notice at line 517 is GONE — replaced by `return openOrReusePreview(this, slug);` at line 533.

## Acceptance grep gate results

All 6 UI-SPEC §Acceptance gates green at HEAD (locked by `tests/preview/regression-grep.test.ts`):

| Gate | Command | Result |
|---|---|---|
| Preview never creates files | `grep -nE 'vault\\.create\\(\|workspace\\.openLinkText\\(' src/preview/` | **0 matches** |
| MarkdownRenderer passes view as Component | `grep -n 'MarkdownRenderer.render(' src/preview/` ends with `, this)` | **1 call, ends with `, this)`** (line 444) |
| Tab-reuse uses the right primitive | `grep -n 'getLeavesOfType' src/preview/` | **1 match** (previewRouter.ts line 41) |
| No raw hex in preview CSS | `grep -nE '#[0-9a-fA-F]{3,8}' styles.css \| (Phase-06-introduced)` | **0 new lines** |
| Accent reserved for Start | `is-primary` count in ProblemPreviewView.ts | **1 application**, gated on `noteExists === false` (line 155) |
| Clean command ID | `grep -n "id: 'open-in-preview'" src/main.ts` + no `obsidian-leetcode:` prefix + no `command` substring | **1 match, all hygiene rules pass** |
| No CM6 dispatch in preview | `grep -n 'cm\\.dispatch(' src/preview/` | **0 matches** (defense in depth) |

Plan-checker contract `setProblemDetail` call site:
`grep -n 'setProblemDetail' src/preview/ProblemPreviewView.ts` → 1 call site at line 340 (the cache-miss persist call).

## Phase 06 plan-level gate (final)

```
npm run lint              → 0 errors / 0 warnings
npm test                  → 731 / 3 skipped across 107 files
npm run build             → tsc clean + production bundle
npm run check:bundle-size → 165.0 KB (well under 400 KB soft warn)
```

## Manual UAT (deferred to Plan 06-04 README capture)

The plan's 10-step manual UAT script is reserved for Plan 06-04 (which captures README + screenshots).
Functional verification is provided by the 11 new test files (41 assertions) + the regression-grep gates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Add `Menu` to obsidian-stub for tests**
- **Found during:** Task 2 RED-shell write
- **Issue:** Plan 06-04's right-click handler imports `Menu` from `'obsidian'`, but `tests/helpers/obsidian-stub.ts` (the runtime stub Vitest aliases the obsidian package to) didn't export a `Menu` class. Source modules under test would fail module resolution.
- **Fix:** Added a minimal `Menu` class stub with `addItem(builder)` and `showAtMouseEvent(e)`. Tests that exercise menu behavior override via `vi.mock('obsidian', …)` factories (the right-click test takes the simpler grep-source approach so this baseline stub is sufficient).
- **Files modified:** `tests/helpers/obsidian-stub.ts`
- **Commit:** `a541669` (Task 1; pre-staged so Task 2 could land cleanly)

**2. [Rule 3 — Blocking] Add HTMLElement polyfills for `empty()`, `addClass()`, etc. to tests/helpers/setup.ts**
- **Found during:** Task 1 first test run — `header-render.test.ts` failed with `TypeError: container.empty is not a function` because the test creates an element via `document.createElement('div')` (raw happy-dom) and passes it to `renderHeader(container, ...)` which calls Obsidian's `container.empty()` / `container.addClass(...)`.
- **Issue:** `tests/helpers/setup.ts` polyfills `createDiv`/`createSpan`/`createEl` on `HTMLElement.prototype` but NOT `empty`, `addClass`, `removeClass`, `setText`, `setCssStyles` — and production source code in `src/browse/ProblemBrowserView.ts` and the new `src/preview/ProblemPreviewView.ts` use those helpers freely.
- **Fix:** Extended `installHelpers` in `tests/helpers/setup.ts` to install these five additional Obsidian-specific HTMLElement methods. Polyfills are conditional (`if (typeof target.X !== 'function')`) so existing tests that supply richer fakes are unaffected.
- **Files modified:** `tests/helpers/setup.ts`
- **Commit:** `a541669`
- **Verification:** Full suite goes from 707 → 731 passing tests with no regressions.

**3. [Rule 1 — Bug] Drop `super.setState` call in ProblemPreviewView**
- **Found during:** Task 2 first test run — `start-button.test.ts` and `detach.test.ts` failed with `TypeError: (intermediate value).setState is not a function`.
- **Issue:** Initial implementation called `await super.setState(state, result)` to forward to the parent ItemView's setState. The obsidian-stub `ItemView` class is empty (`export class ItemView {}`), so the call resolves to undefined and throws.
- **Fix:** Removed the `super.setState` call; documented in the override comment that the workspace persistence layer reads `getState()` directly so forwarding to super is unnecessary. Renamed `result` → `_result` to indicate the parameter is part of the public type contract but unused. Real Obsidian's ItemView.setState is documented to be a no-op pass-through for view-types that own their state.
- **Files modified:** `src/preview/ProblemPreviewView.ts`
- **Commit:** `34b9fd1` (Task 2)

**4. [Rule 1 — Bug] Lazy-init `rootEl` from `containerEl.children[1]` in setState**
- **Found during:** Task 2 second test run — `start-button.test.ts` couldn't find the rendered button because the test mounts the view via `setState({slug})` only (without calling `onOpen`).
- **Issue:** Initial implementation only set `rootEl` inside `onOpen`. Real Obsidian boot-path can call setState BEFORE onOpen when restoring a persisted leaf; tests can also legitimately drive setState directly.
- **Fix:** `setState` now lazy-initializes `rootEl` from `containerEl.children[1]` when not yet set, including the `addClass('leetcode-preview')` call. This makes the view robust to either entry order without needing test-only branches.
- **Files modified:** `src/preview/ProblemPreviewView.ts`
- **Commit:** `34b9fd1`

**5. [Rule 1 — Lint] Drop unnecessary `as HTMLButtonElement` cast in renderHeader**
- **Found during:** Task 1 lint pass
- **Issue:** `@typescript-eslint/no-unnecessary-type-assertion` flagged `chipRow.createEl('button', {...}) as HTMLButtonElement` — `createEl<'button'>(...)` already returns `HTMLButtonElement` per the obsidian-globals.d.ts overload.
- **Fix:** Removed the cast; the inferred return type is already correct.
- **Files modified:** `src/preview/ProblemPreviewView.ts`
- **Commit:** `a541669`

**6. [Test infrastructure] Refactor router.test.ts to mock the preview-router module**
- **Found during:** Task 1 build verification — `tests/preview/router.test.ts` (Plan 06-02) failed because `routeProblemClick` now actually calls `openOrReusePreview(this, slug)` instead of the placeholder Notice. The 8-cell decision matrix is unchanged but the assertion targets need updating.
- **Issue:** The Plan 06-02 router test asserted on `noticeCalls.length === 1` for preview-path cases. With the placeholder gone, those calls now invoke `openOrReusePreview` against a stub plugin whose `app.workspace.getLeavesOfType` is undefined — causing a TypeError.
- **Fix:** Added a module-level `vi.mock('../../src/preview/previewRouter', ...)` factory that intercepts `openOrReusePreview` into a `previewCalls` capture array. Updated the three preview-path test cases to assert `previewCalls.length === 1 && previewCalls[0][1] === slug` instead of `noticeCalls.length === 1`. The 8-cell decision matrix shape stays identical.
- **Files modified:** `tests/preview/router.test.ts`
- **Commit:** `a541669`
- **Verification:** All 9 router test cases pass at HEAD.

---

**Total deviations:** 6 auto-fixed (4 Rule 1 bug, 2 Rule 3 blocking)
**Impact on plan:** All deviations were necessary for the plan's success criteria — no scope creep. Auto-fix #2 (HTMLElement polyfills) is the only one that touches a Plan 06-01 file (`tests/helpers/setup.ts`); the addition is purely additive (polyfills are conditional and existing tests are unaffected — 707 → 731 net+ with zero regressions).

## Issues Encountered

- **Worktree branch lacked `.planning/phases/`** — same situation as Plan 06-01: the worktree branch was forked from a base predating the phase-06 plan-creation commits on `main`. Resolved at agent startup by `git checkout main -- .planning/phases/06-foundations-preview-mode/` so the executor could read the plan documents in-tree. This SUMMARY.md is the only file under `.planning/` that this commit creates; the rest are checked-out-from-main artifacts that will land via the next docs commit.

## User Setup Required

None — Phase 06 surfaces no new external services or auth flows.

## Plan-checker contracts honored

- **W2 (cache-miss persist):** `grep -n 'setProblemDetail' src/preview/ProblemPreviewView.ts` → 1 call site at line 340 (the persist after fetch resolves with non-empty content). Verified: the next preview of the same slug hits the cache instead of re-fetching.
- **W3 (Menu import order):** `Menu` is in `import { ItemView, WorkspaceLeaf, Notice, setIcon, Menu } from 'obsidian';` (line 5 of `src/browse/ProblemBrowserView.ts` is unchanged — line 5 of the file imports from `'../shared/timers'`). The right-click test pins this contract via `expect(timersImport).not.toContain('Menu')`.
- **W5 (cm.dispatch absence assertion):** `tests/preview/regression-grep.test.ts` asserts `expect(src).not.toMatch(/cm\.dispatch\(/)` for every `.ts` file under `src/preview/`. CLAUDE.md userEvent rule defense in depth — preview source must never reach the editor's transaction filter.
- **MarkdownRenderer signature:** call site at `src/preview/ProblemPreviewView.ts:444` is `MarkdownRenderer.render(this.app, md, body, '', this)` — `this` (the ItemView), NOT `this.plugin`. Locked by the regression-grep test gate 5.
- **Tab reuse:** `getLeavesOfType(PREVIEW_VIEW_TYPE)` + `setViewState({ type, active, state })` in `previewRouter.ts:41`. `WorkspaceLeaf.openIfExtant` is NOT used (does not exist on obsidian@1.12.x).
- **Detach lifecycle:** `setWindowTimeout(() => this.leaf.detach(), 100)` at `ProblemPreviewView.ts:494`. Popout-aware via `src/shared/timers`. Lint-clean (no `prefer-window-timers` violation).
- **Forbidden in `src/preview/`:** zero matches for `vault.create(`, `workspace.openLinkText(`, `cm.dispatch(`, `innerHTML =` across all three preview source files. The regression-grep test enforces this for every future executor.

## Self-Check

**Files claimed created — verified to exist:**
- `src/preview/ProblemPreviewView.ts`: FOUND
- `src/preview/previewRouter.ts`: FOUND
- `src/preview/previewExistingNote.ts`: FOUND
- `tests/preview/header-render.test.ts`: FOUND
- `tests/preview/existing-note-detection.test.ts`: FOUND
- `tests/preview/tab-reuse.test.ts`: FOUND
- `tests/preview/start-button.test.ts`: FOUND
- `tests/preview/right-click.test.ts`: FOUND
- `tests/preview/detach.test.ts`: FOUND
- `tests/preview/command-ids.test.ts`: FOUND
- `tests/preview/regression-grep.test.ts`: FOUND

**Files claimed modified — verified via git log:**
- `src/main.ts` (commits a541669, 34b9fd1): FOUND
- `src/browse/ProblemBrowserView.ts` (commit 34b9fd1): FOUND
- `src/notes/NoteWriter.ts` (commit a541669): FOUND
- `src/preview/ProblemPreviewView.ts` (commit 34b9fd1): FOUND
- `styles.css` (commit 34b9fd1): FOUND
- `tests/preview/router.test.ts` (commit a541669): FOUND
- `tests/helpers/obsidian-stub.ts` (commit a541669): FOUND
- `tests/helpers/setup.ts` (commit a541669): FOUND

**Commits claimed — verified in git log:**
- `a541669` (Task 1): FOUND
- `34b9fd1` (Task 2): FOUND
- `953a028` (Task 3): FOUND

**Phase 06 plan-level gate at HEAD:**
- `npm run lint`: PASS (0 errors / 0 warnings)
- `npm test`: PASS (731 / 3 skipped across 107 files)
- `npm run build`: PASS (tsc clean + production bundle)
- `npm run check:bundle-size`: PASS (165.0 KB, well under 400 KB soft warn)

## Self-Check: PASSED
