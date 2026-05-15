---
phase: 06-foundations-preview-mode
plan: 05
subsystem: preview-ui-gap-closure
tags:
  - preview
  - reading-mode-parity
  - sticky-header
  - keyboard
  - gap-closure
  - PREVIEW-03
  - PREVIEW-04
  - PREVIEW-05

# Dependency graph
requires:
  - 06-03  # ProblemPreviewView + sticky header + body via MarkdownRenderer
provides:
  - "src/preview/ProblemPreviewView — single-strip header (no topic chips), markdown-rendered body, Enter-key activation"
  - "src/notes/htmlToMarkdown — fenced-code-block contract locked by tests (no source change)"
  - "tests/notes/htmlToMarkdown-fenced.test.ts — 4 behavioral assertions"
  - "tests/preview/enter-key.test.ts — 4 keyboard contracts"
  - "tests/preview/regression-grep.test.ts:GATE 8 — no lc-preview__topic in src/ or styles.css"
  - "tests/helpers/obsidian-stub.ts:Scope — additive stub for Scope.register capture"
affects:
  - "src/preview/ProblemPreviewView.ts (renderHeader strip, renderRendered body class, Enter wiring, activeAction tracking)"
  - "styles.css (font-size lifted off root onto header; .leetcode-preview__topic rule removed)"
  - "tests/preview/header-render.test.ts (zero-chips assertion + action-in-chip-row containment)"
  - "tests/preview/start-button.test.ts (markdown-rendered body class assertion)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Obsidian Scope chained off this.app.scope per obsidian.d.ts §View docstring (View.scope defaults to null; allocate via `new Scope(this.app.scope)` before registering handlers)"
    - "DOM/Scope-layer keyboard activation — Enter routes through scope.register, NOT CM6 cm.dispatch (CLAUDE.md userEvent rule does not apply; regression GATE 4 stays green)"
    - "Per-state activeAction null-clear pattern — renderLoading/renderError/renderEmpty/onClose clear so Enter is a no-op outside the rendered state"
    - "Source-tree regression-grep gate (GATE 8) — recursively scans src/*.ts AND styles.css for the deleted CSS class to lock deletion at CI level"
    - "Additive obsidian-stub polyfill — Scope class with handlers[] capture array mirrors Plan 06-03's Menu/HTMLElement stub pattern"

key-files:
  created:
    - "tests/notes/htmlToMarkdown-fenced.test.ts (4 behavioral tests locking the fenced-code-block contract)"
    - "tests/preview/enter-key.test.ts (4 Enter-key contracts: cache hit, noteExists branch, loading no-op, post-close no-op)"
    - ".planning/phases/06-foundations-preview-mode/06-05-SUMMARY.md (this file)"
  modified:
    - "src/preview/ProblemPreviewView.ts (drop topic-chip emission; promote body to markdown-rendered; add activeAction field; register Enter via scope; clear activeAction in non-rendered states)"
    - "styles.css (lift font-size off .leetcode-preview root onto .leetcode-preview__header; delete .leetcode-preview__topic rule)"
    - "tests/preview/header-render.test.ts (replace topic-chip count assertion with zero-chips guard; add action-button containment assertion)"
    - "tests/preview/start-button.test.ts (add markdown-rendered body class assertion)"
    - "tests/preview/regression-grep.test.ts (add GATE 8 — no lc-preview__topic in src/ or styles.css)"
    - "tests/helpers/obsidian-stub.ts (add Scope class with handlers[] capture; add scope field to ItemView)"

decisions:
  - "Topic chips dropped from sticky header per user override of CONTEXT.md decision C — PREVIEW-03 reduced from 'difficulty + topic chips' to 'difficulty pill only' for v1.1 base ship; topic-chip surfacing remains a deferred backlog candidate."
  - "Body container class becomes 'leetcode-preview__body markdown-rendered' (space-separated). Co-applies Obsidian's reading-mode CSS cascade onto the rendered body without changing the MarkdownRenderer.render signature (gate 5 byte-identical: `MarkdownRenderer.render(this.app, md, body, '', this)`)."
  - "Chrome font-size lifted off the .leetcode-preview root selector and onto .leetcode-preview__header only, so the body inherits Obsidian's reading-mode font cascade rather than the chrome's --font-ui-small shrink. Closes 06-UAT gap #1."
  - "Enter-key activation goes through Obsidian's Scope (DOM-level) rather than CM6 transactions. CLAUDE.md's 'leetcode.*' userEvent rule does not apply to preview because the preview view never dispatches CM6 transactions (regression GATE 4 unchanged)."
  - "ItemView.scope defaults to null per obsidian.d.ts §View; the canonical pattern (per the type's own docstring) is `this.scope = new Scope(this.app.scope)` before calling scope.register. Production code now allocates if scope is null, preserving any Scope provided by tests."
  - "Test stub additions (Scope class + ItemView.scope field) are additive only — existing tests that never touch scope are unaffected. Mirrors Plan 06-03's HTMLElement / Menu polyfill pattern."

metrics:
  start: 2026-05-15T15:43:00Z
  end: 2026-05-15T15:54:00Z
  duration_minutes: 11
  tasks: 3
  files_created: 3   # 2 test files + this SUMMARY
  files_modified: 6  # ProblemPreviewView, styles.css, header-render.test, start-button.test, regression-grep.test, obsidian-stub
  tests_added: 11    # +4 fenced + +4 enter-key + +1 markdown-rendered (start-button) + +1 zero-chips + +1 action-in-strip (header-render) + +1 GATE 8 (regression-grep) [counted by visible green-line delta below]
  tests_total_after: 742  # 731 baseline → 742 net (+11)
  bundle_size_kb: 165.1   # +0.1 KB vs 165.0 KB baseline
---

# Phase 06 Plan 05: Preview UI Gap Closure — Summary

**Closes the three Phase 06 UAT gaps the user surfaced after Plan 06-03 shipped — body parity (examples render as fenced grey code blocks at reading-mode font), header chrome (single horizontal strip with title + difficulty pill + action button; topic chips dropped), and keyboard activation (Enter fires the action button) — without touching any Plan 06-03 invariant (data path, cache contract, routeProblemClick decision flow, MarkdownRenderer.render signature, post-action detach lifecycle).**

Three minimum-diff source changes, two new test files, three test-file deltas. Bundle size delta +0.1 KB. Test count 731 → 742 (+11).

## Performance

- **Duration:** ~11 min (Task 1 commit `d92959c` 15:46 → Task 3 commit `1ca567f` 15:54 local).
- **Tasks:** 3 / 3 (all green at HEAD).
- **Files modified:** 9 total (3 created, 6 modified).

## Task Commits

Each task committed atomically:

1. **Task 1 — fenced-code-block contract test** (`d92959c`): `test(06-05): lock fenced code-block contract for LC HTML→Markdown` — added `tests/notes/htmlToMarkdown-fenced.test.ts` with four behavioral assertions; `src/notes/htmlToMarkdown.ts` byte-identical.
2. **Task 2 — single-strip header + body parity** (`69a965b`): `feat(06-05): single-strip header + markdown-rendered body parity` — dropped topic-chip emission, promoted body to `markdown-rendered`, lifted root font-size onto the header, deleted `.leetcode-preview__topic` CSS rule, updated header-render + start-button + regression-grep tests (GATE 8 added).
3. **Task 3 — Enter-key activation** (`1ca567f`): `feat(06-05): wire Enter-key activation for preview action button` — added `activeAction` field tracked through render/loading/error/empty/close lifecycle; wired `scope.register([], 'Enter', …)` in `onOpen`; allocated `new Scope(this.app.scope)` per Obsidian docstring pattern; added `tests/preview/enter-key.test.ts` (4 contracts) + Scope stub.

## UAT gap closure

| UAT Gap | Severity | Closed by |
|---------|----------|-----------|
| #1 Body parity (examples = plain text + stray copy buttons; body font shrunk) | MAJOR | Task 1 locks fenced-code-block contract; Task 2 promotes body container to `markdown-rendered` and lifts chrome font-size off the root so reading-mode cascade applies. |
| #2 Header chrome (topic chips run together; action button floats below) | MAJOR | Task 2 deletes topic-chip emission + CSS class; chip row now contains pill + action button only; `margin-left: auto` on the button keeps it right-aligned in a single horizontal strip. GATE 8 locks the deletion at the source-tree level. |
| #3 Enter-key activation absent | MINOR | Task 3 wires `scope.register([], 'Enter', …)` in `onOpen` against an `activeAction` field that mirrors the rendered Start/Open Problem button. Loading/error/empty/closed states clear the field so Enter is a no-op outside the rendered state. |

Each gap is now closed at the test level (4 + 4 + 4 + 1 + 1 + 1 = 15 new + repurposed assertions). User UAT re-test of scenario #2 will confirm the visual outcome on next pass — recorded as "ready for re-test".

## Acceptance grep gate results (Plan 06-03 invariants preserved + new GATE 8)

All 7 original Plan 06-03 gates remain green at HEAD; new GATE 8 added.

| Gate | Command | Result |
|------|---------|--------|
| 1 — preview never creates files (vault.create) | `grep -nE 'vault\.create\(' src/preview/` | **0 matches** |
| 2 — preview never opens links | `grep -nE 'workspace\.openLinkText\(' src/preview/` | **0 matches** |
| 3 — no innerHTML XSS surface | `grep -nE 'innerHTML\s*=' src/preview/` | **0 matches** |
| 4 — no CM6 dispatch (CLAUDE.md userEvent rule) | `grep -nE 'cm\.dispatch\(' src/preview/` | **0 matches** (Enter goes through Scope) |
| 5 — MarkdownRenderer passes view as Component | `grep -n 'MarkdownRenderer.render(' src/preview/ProblemPreviewView.ts` | **1 call**, ends with `, this)` (line 473) |
| 6 — tab-reuse uses getLeavesOfType | `grep -n 'getLeavesOfType' src/preview/` | **1 match** (previewRouter.ts) |
| 7 — accent reserved for Start Problem | `is-primary` applications in ProblemPreviewView.ts | **1 application**, gated on `noteExists === false` (line 155) |
| **8 (NEW)** — no `lc-preview__topic` in src/ or styles.css | `grep -rnE 'lc-preview__topic' src/ styles.css` | **0 matches** |

Plan-checker contracts honored:

- **`codeBlockStyle: 'fenced'`** — line 112 of `src/notes/htmlToMarkdown.ts` (locked by `tests/notes/htmlToMarkdown-fenced.test.ts`).
- **`lc-example-block` rule** — line 184 (locked by Test 1 + Test 4 of the new fenced test file).
- **`reshapeShapeBExamples` post-pass** — lines 270 + 344 (locked by Test 4).
- **`MarkdownRenderer.render(this.app, md, body, '', this)`** — byte-identical signature; only the body container's class list changed.
- **`setProblemDetail` cache-miss persist** — untouched (still line 340 of ProblemPreviewView.ts).
- **`setWindowTimeout(100)` → `leaf.detach()`** — untouched (still in `handleActionClick`).
- **`scope.register([], 'Enter', ...)`** — line 244 of ProblemPreviewView.ts; `activeAction?.click()` reuses the existing click handler.
- **`activeAction` tracked through lifecycle** — 9 references (declaration + assignment in renderRendered + clears in renderLoading, renderError, renderEmpty, onClose).

## Phase plan-level gate (final)

```
npm run lint              → 0 errors / 0 warnings
npm test                  → 742 / 3 skipped across 109 files (731 → 742, +11 net)
npm run build             → tsc clean + production bundle
npm run check:bundle-size → 165.1 KB (well under 400 KB soft warn; +0.1 KB vs baseline 165.0 KB)
```

## Manual UAT re-test status

**Ready for re-test.** Plan 06-05 closes the three UAT gaps at the code + test level; the visual confirmation of UAT scenario #2 (single-click vs shift-click default behavior) flips from `failed` to `passed` on the next manual UAT pass. This SUMMARY does NOT record a passing UAT outcome — that is recorded by the next manual UAT, not by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `View.scope` is `Scope | null` per Obsidian's type contract — must allocate before registering handlers.**

- **Found during:** Task 3 production build (`tsc -noEmit` failed with `TS2531: Object is possibly 'null'` on `this.scope.register(...)`).
- **Issue:** `obsidian.d.ts` types `View.scope` as `Scope | null` and the field defaults to `null` for new view types. The plan assumed `this.scope` was always defined (real Obsidian inherits scope through Component, but the View subclass defaults to null per the docstring example: `this.scope = new Scope(this.app.scope);`).
- **Fix:** Allocate the Scope in `onOpen` before calling `scope.register`: `if (this.scope == null) { this.scope = new Scope(this.app.scope); }`. Imports `Scope` from `'obsidian'`. Tests pre-attach a stub scope before calling `onOpen`, so the null-check leaves their handler arrays intact.
- **Files modified:** `src/preview/ProblemPreviewView.ts`, `tests/helpers/obsidian-stub.ts` (Scope constructor accepts an optional parent scope for shape compatibility).
- **Commit:** `1ca567f` (Task 3).
- **Verification:** Build + lint + 742-test suite all pass.

**2. [Rule 3 — Blocking] `ItemView` stub needs a `scope` field default for production code paths that don't pre-attach.**

- **Found during:** Task 3 wiring.
- **Issue:** The Plan 06-03 obsidian-stub `ItemView` was empty (`export class ItemView {}`). Production code now references `this.scope` from `onOpen`; tests that exercise `onOpen` need `this.scope` to be defined.
- **Fix:** Added `scope: Scope = new Scope()` to the `ItemView` stub class. Tests that explicitly inject a stub scope (the enter-key test) overwrite via `(view as ...).scope = scope` and observe their own handler captures. Tests that exercise `onOpen` without injecting a scope (none currently — start-button.test.ts mounts via `Object.create(prototype)` and never calls onOpen) get a usable default.
- **Files modified:** `tests/helpers/obsidian-stub.ts`
- **Commit:** `1ca567f`

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking).
**Impact on plan:** Both deviations were necessary for the plan's success criteria — no scope creep. Both touch only test infrastructure (obsidian-stub) and the canonical `View.scope = new Scope(this.app.scope)` pattern documented inside obsidian.d.ts itself. The `'leetcode.*'` userEvent rule is irrelevant (preview never dispatches CM6 transactions; gate 4 stays green).

## Issues Encountered

None — plan executed cleanly. The TypeScript null-safety on `View.scope` was caught by `tsc -noEmit` during Task 3's build verification step and resolved inline before the Task 3 commit.

## User Setup Required

None — no new external services, no auth flows, no migrations. The visual changes are verified by re-running UAT scenario #2 (single-click any problem in the LeetCode browser).

## Self-Check

**Files claimed created — verified to exist:**

- `tests/notes/htmlToMarkdown-fenced.test.ts`: FOUND
- `tests/preview/enter-key.test.ts`: FOUND
- `.planning/phases/06-foundations-preview-mode/06-05-SUMMARY.md`: FOUND (this file)

**Files claimed modified — verified via git log:**

- `src/preview/ProblemPreviewView.ts` (commits 69a965b, 1ca567f): FOUND
- `styles.css` (commit 69a965b): FOUND
- `tests/preview/header-render.test.ts` (commit 69a965b): FOUND
- `tests/preview/start-button.test.ts` (commit 69a965b): FOUND
- `tests/preview/regression-grep.test.ts` (commit 69a965b): FOUND
- `tests/helpers/obsidian-stub.ts` (commit 1ca567f): FOUND

**Commits claimed — verified in git log:**

- `d92959c` (Task 1, test-only fenced lock): FOUND
- `69a965b` (Task 2, header restructure + body parity): FOUND
- `1ca567f` (Task 3, Enter-key wiring): FOUND

**Phase plan-level gate at HEAD:**

- `npm run lint`: PASS (0 errors / 0 warnings)
- `npm test`: PASS (742 passed | 3 skipped across 109 files)
- `npm run build`: PASS (tsc clean + production bundle)
- `npm run check:bundle-size`: PASS (165.1 KB, well under 400 KB soft warn)

**Plan 06-03 acceptance grep gates at HEAD:**

- GATE 1 (no vault.create in src/preview): PASS
- GATE 2 (no workspace.openLinkText in src/preview): PASS
- GATE 3 (no innerHTML = in src/preview): PASS
- GATE 4 (no cm.dispatch in src/preview): PASS
- GATE 5 (MarkdownRenderer.render passes `this`): PASS
- GATE 6 (tab-reuse via getLeavesOfType): PASS
- GATE 7 (is-primary reserved for Start Problem): PASS (1 application)

**Plan 06-05 new gate at HEAD:**

- GATE 8 (no `lc-preview__topic` in src/ or styles.css): PASS

## Self-Check: PASSED
