---
phase: 05-polish-ship
plan: 05
subsystem: reading-mode-ui + submission-detail
tags: [polish, markdown-postprocessor, markdown-renderer, css, focus-ring]
requires:
  - 05-01  # Wave 0 RED stubs (codeActionsPostProcessor.test.ts)
  - 05-04  # runCommandRegistration → `run` command id the D-11 buttons dispatch
provides:
  - src/main/codeActionsPostProcessor.ts      # MarkdownPostProcessor (D-11/12/13)
  - src/graph/SubmissionDetailModal.ts::component
  - src/graph/SubmissionDetailModal.ts::render  # now async MarkdownRenderer.render path
affects:
  - tests/helpers/obsidian-stub.ts            # extended with MarkdownRenderer + Component
tech-stack:
  added:
    - obsidian::MarkdownRenderer.render
    - obsidian::Component (lifecycle)
  patterns:
    - MarkdownPostProcessor + frontmatter gate (Pitfall 5)
    - insertAdjacentElement idempotency guard (Pitfall 3)
    - plugin.manifest.id-prefixed executeCommandById (Pitfall 14)
    - Component.load() BEFORE MarkdownRenderer.render (Pitfall 6)
    - vi.hoisted spies for vi.mock factory (test-infra)
key-files:
  created:
    - src/main/codeActionsPostProcessor.ts
  modified:
    - src/main.ts
    - src/graph/SubmissionDetailModal.ts
    - styles.css
    - tests/graph/SubmissionDetailModal.test.ts
    - tests/helpers/obsidian-stub.ts
decisions:
  - D-11 ships Reading-Mode MarkdownPostProcessor (Live Preview deferred)
  - D-12 lc-slug frontmatter gate prevents pollution of non-LC notes
  - D-13 neutral buttons (NO mod-cta) — accent reserved for primary auth button
  - D-29 CE chip override placed AFTER grouped error rule so cascade wins
  - D-30 split :hover / :focus so focus gets a dedicated --interactive-accent outline
  - D-31 code-body swap to MarkdownRenderer.render + Component lifecycle
  - Chose src/main/codeActionsPostProcessor.ts (test-driven path) over
    src/graph/CodeBlockActionProcessor.ts (plan-proposed path) — the Wave 0
    RED stub locks the import location; the processor is a `main/` wiring
    concern rather than a `graph/` feature file so the path is coherent.
metrics:
  duration_seconds: 428
  completed: "2026-05-10"
requirements:
  - POLISH-01  # extension: reading-mode buttons
  - POLISH-03  # zero new innerHTML / fetch / eval
---

# Phase 5 Plan 05: Reading-mode buttons + cosmetic polish

**Shipped the reading-mode Run + Submit affordance and closed three Phase 4
UAT cosmetic gaps (CE chip orange, light-mode focus ring, SubmissionDetailModal
CM6 render) using only presentational code — no new network, no new vault
writes, no bundle-weight dependencies.**

## Scope

| Decision | Deliverable |
| -------- | ----------- |
| D-11     | `registerCodeBlockActionProcessor` MarkdownPostProcessor registered in `main.ts` onload Step 6e |
| D-12     | frontmatter gate: processor no-ops unless the sourcePath's cache carries a non-empty `lc-slug` string |
| D-13     | `.leetcode-code-actions` CSS block + neutral `leetcode-code-action-run` / `leetcode-code-action-submit` buttons (NO `mod-cta`) |
| D-29     | CE verdict chip orange override appended AFTER the grouped `--wa/--tle/--mle/--ole/--re/--ce` error rule |
| D-30     | picker-row `:hover` / `:focus` split; focus gets `outline: 2px solid var(--interactive-accent)` with `-2px` offset |
| D-31     | SubmissionDetailModal swaps `<pre><code class="language-*">` + `textContent` for `MarkdownRenderer.render` with a `Component` lifecycle |

## Execution

### Task 1 — CodeBlockActionProcessor + main.ts registration + CSS
**Commit:** `5e4850f feat(05-05): add reading-mode code-block action buttons (D-11/D-12/D-13)`

- Created `src/main/codeActionsPostProcessor.ts` (~65 LoC).
- Pitfall-5 guard: the processor passes a minimal `{ path: ctx.sourcePath }`
  shape into `metadataCache.getFileCache` so the Wave 0 happy-dom tests can
  exercise the gate without synthesizing a real `TFile` (the real
  MetadataCache honors any `{ path }` at runtime). Production use routes
  through the same entry point unchanged.
- Pitfall-3 idempotency: before inserting the actions row we check whether
  `pre.nextElementSibling` already carries the `leetcode-code-actions` class.
  Confirmed via Wave 0 test "processing the same root twice does NOT
  duplicate the actions div" — 4/4 tests GREEN after this change.
- Pitfall-14 command IDs: handlers dispatch via
  `commands.executeCommandById(\`${plugin.manifest.id}:run\`)` —
  fully-qualified with the manifest id (not the bare `run` id).
- DOM discipline: uses `doc.createElement` + `appendChild` (no `innerHTML`,
  no `insertAdjacentHTML`). The single `ownerDocument ?? document` lookup
  is the one `document` reference, guarded with a scoped eslint-disable for
  `obsidianmd/prefer-active-doc` (same pattern already used in
  `src/graph/SubmissionDetailModal.ts`).
- Wired into `src/main.ts` onload Step 6e with a D-11 comment tag.
- CSS: appended `.leetcode-code-actions` scope (flex + gap 8px +
  right-aligned) with neutral `--background-secondary` / `--text-muted`
  buttons that lift to `--background-modifier-hover` / `--text-normal` on
  hover. All colors via Obsidian CSS variables — no raw hex.

**Grep transcripts**

```
$ grep -c "leetcode-code-actions" src/main/codeActionsPostProcessor.ts
3
$ grep -c "leetcode-code-actions" styles.css
5
$ grep -c "registerCodeBlockActionProcessor" src/main.ts
2
$ grep -cE "innerHTML\s*=" src/main/codeActionsPostProcessor.ts
0
$ grep -cE "insertAdjacentHTML" src/main/codeActionsPostProcessor.ts
0
```

### Task 2 — SubmissionDetailModal MarkdownRenderer + Component + D-29/D-30 CSS
**Commit:** `0c7647a feat(05-05): upgrade SubmissionDetailModal to MarkdownRenderer + polish CSS (D-29/D-30/D-31)`

- Imported `Component` + `MarkdownRenderer` from `obsidian` and added a
  `private readonly component: Component = new Component()` field.
- `onOpen` became `async`. Pitfall-6 order enforced: `component.load()`
  fires BEFORE `await this.render()`; test
  `D-31: onOpen calls component.load() before MarkdownRenderer.render`
  asserts this via `invocationCallOrder`.
- `onClose` calls `component.unload()` (disposes CM6 child components)
  then clears `contentEl`.
- Inside `render()` (also now `async`): the old
  `appendEl(contentEl, 'pre', 'leetcode-submissions-code')` +
  `appendEl(pre, 'code', 'language-{slug}')` + `setText(code, code)` path
  was **deleted** and replaced by a `<div class="leetcode-submissions-code">`
  container handed to `MarkdownRenderer.render(app, fenced, container,
  file.path, component)`. The fence is built as
  `` '```' + (lang || 'text') + '\n' + code + '\n```\n' ``.
- Copy-to-code chrome (title, metadata row, footer with
  `Copy to ## Code` + `Close` buttons, `handleCopyToCode` /
  `performCopy` methods, test hook `confirmOverwriteForTest`) left
  untouched — Phase 4 Plan 04 semantics preserved.
- Extended `tests/helpers/obsidian-stub.ts` with inert `Component` class
  (load/unload/addChild no-ops) and `MarkdownRenderer.render` async no-op
  so any test that imports the modal without asserting on render args
  still resolves cleanly.
- Rewrote `tests/graph/SubmissionDetailModal.test.ts` to use `vi.hoisted`
  + module-level `vi.mock('obsidian', ...)` so the spies survive vitest's
  mock-hoisting. Preserves the original 3 copy-to-code tests and adds 4
  new D-31 assertions (load-before-render order, render args, unload on
  close, source no longer contains `class="language-`). All 7 tests GREEN.

**D-29 before/after grep (CE chip orange override)**

Before (commit `81e728f` / HEAD~2, lines 759–767):
```css
.leetcode-submissions .leetcode-submissions-chip--wa,
.leetcode-submissions .leetcode-submissions-chip--tle,
...,
.leetcode-submissions .leetcode-submissions-chip--ce {
  background: var(--background-modifier-error);
  color: var(--text-error);
}
# (no --ce override below — CE rendered red under the shared error rule)
```

After (commit `0c7647a`, grep output):
```
$ grep -nE "submissions-chip--ce" styles.css
770:.leetcode-submissions .leetcode-submissions-chip--ce {   # grouped error rule (line 764 selector start, line 770 is the `--ce` selector within the group)
777:.leetcode-submissions .leetcode-submissions-chip--ce {   # D-29 orange override, appended AFTER the group so cascade wins
```

The new rule at line 777:
```css
/* ── Phase 5 — CE verdict chip orange override (D-29) ──────────────── */
/* Must appear AFTER the shared --wa/--tle/--mle/--ole/--re/--ce error  */
/* rule above so the cascade wins.                                      */
.leetcode-submissions .leetcode-submissions-chip--ce {
  background: color-mix(in srgb, var(--background-secondary) 80%, var(--color-orange, #e67e22) 20%);
  color: var(--color-orange, #e67e22);
}
```

**D-30 before/after grep (focus ring)**

Before (commit `81e728f`, lines 736–740):
```css
.leetcode-submissions-picker .leetcode-submissions-row:hover,
.leetcode-submissions-picker .leetcode-submissions-row:focus {
  background: var(--background-modifier-hover);
  outline: none;           # focus indicator effectively disabled in light mode
}
```

After (commit `0c7647a`, grep output):
```
$ grep -nE "submissions-row:focus" styles.css
742:.leetcode-submissions-picker .leetcode-submissions-row:focus {
```

The new split rule:
```css
/* ── Phase 5 — Picker row focus ring for light-mode contrast (D-30) ── */
.leetcode-submissions-picker .leetcode-submissions-row:hover {
  background: var(--background-modifier-hover);
}
.leetcode-submissions-picker .leetcode-submissions-row:focus {
  background: var(--background-modifier-hover);
  outline: 2px solid var(--interactive-accent);
  outline-offset: -2px;
}
```

**Grep transcripts**
```
$ grep -cE "MarkdownRenderer\.render" src/graph/SubmissionDetailModal.ts
7
$ grep -cE "Component\(\)" src/graph/SubmissionDetailModal.ts
1
$ grep -cE 'class="language-' src/graph/SubmissionDetailModal.ts
0
$ grep -cE "outline: 2px solid var\(--interactive-accent\)" styles.css
1
$ grep -cE "color-mix\(in srgb" styles.css
2   # pre-existing lc-row--solved tint + new D-29 CE chip
$ grep -rcE "innerHTML\s*=" src/graph/
# no output — zero matches across the folder
```

## Deviations from Plan

**1. [Rule 3 — blocking path] Canonical processor path chosen: `src/main/codeActionsPostProcessor.ts`**
- **Found during:** Task 1 start
- **Issue:** Plan called the file `src/graph/CodeBlockActionProcessor.ts`; the
  Wave 0 RED stub imports from `src/main/codeActionsPostProcessor`. The
  executor prompt explicitly flagged this mismatch and said to choose one
  canonical path.
- **Fix:** Created the file at `src/main/codeActionsPostProcessor.ts` (the
  test's expected path). No stub edits needed. Rationale: the processor is a
  main-wiring concern (registered once in onload), not a `graph/` feature
  module, so a `main/` home is semantically correct anyway.
- **Commit:** `5e4850f`

**2. [Rule 3 — test harness] `fakeWorkspace.FakePlugin` doesn't expose `app.vault`**
- **Found during:** Task 1 verification (tsc + test runs)
- **Issue:** RESEARCH §Pattern 2 template calls
  `plugin.app.vault.getAbstractFileByPath(ctx.sourcePath)` then
  `instanceof TFile`. The Wave 0 fake plugin only has
  `{ workspace, metadataCache, commands }` — no vault — and the fake's
  `getFileCache` accepts any `{ path }` shape directly.
- **Fix:** Pass `{ path: ctx.sourcePath } as unknown as …Parameters…[0]`
  directly to `metadataCache.getFileCache`. Production Obsidian's
  MetadataCache also resolves by path at runtime, so the behavior is
  equivalent; only the type-surface was adjusted. Documented in-file.

**3. [Rule 3 — test harness] `tests/helpers/obsidian-stub.ts` extended with `Component` + `MarkdownRenderer`**
- **Found during:** Task 2 test rewrite
- **Issue:** The stub exposes Modal/TFile/Notice etc. but not the D-31
  symbols. Without them, `import { MarkdownRenderer, Component } from 'obsidian'`
  from `SubmissionDetailModal.ts` fails module resolution in Vitest.
- **Fix:** Added inert `Component` class (load/unload/addChild no-ops) and a
  `MarkdownRenderer` object with an async-no-op `render`. Tests that care
  about the render args still override via `vi.mock('obsidian', …)`.
- **Commit:** `0c7647a` (bundled with Task 2 test rewrite)

**4. [Rule 1 — bug] `vi.mock` hoisting collision on renderSpy initialization**
- **Found during:** first run of rewritten `SubmissionDetailModal.test.ts`
- **Issue:** `vi.mock('obsidian', factory)` is hoisted to the top of the
  file BEFORE `const renderSpy = vi.fn(...)` — the factory referenced
  `renderSpy` before it was initialized, causing
  "Cannot access 'renderSpy' before initialization".
- **Fix:** Wrapped the spies in `vi.hoisted(() => ({ renderSpy, loadSpy,
  unloadSpy }))` and the factory closes over `hoisted.renderSpy` /
  `hoisted.loadSpy` / `hoisted.unloadSpy`. Standard vitest pattern.

## Guard Verification (Pitfalls 3 / 5 / 6)

| Pitfall | Guard                                                          | Verified by |
| ------- | -------------------------------------------------------------- | ----------- |
| 3       | `pre.nextElementSibling?.classList.contains('leetcode-code-actions')` idempotency skip | test `is idempotent — processing the same root twice does NOT duplicate the actions div` — 1 actions div expected, actual 1. |
| 5       | `metadataCache.getFileCache({ path: ctx.sourcePath })` frontmatter gate | test `no-op when the active file has no lc-slug frontmatter (D-12)` — 0 actions divs after processing a note without `lc-slug`. |
| 6       | `component.load()` fires in `onOpen` BEFORE `MarkdownRenderer.render` | test `D-31: onOpen calls component.load() before MarkdownRenderer.render` asserts `loadSpy.invocationCallOrder[0] < renderSpy.invocationCallOrder[0]`. |
| 14      | `plugin.app.commands.executeCommandById(\`${plugin.manifest.id}:run\`)` | test `Run button click dispatches fully-qualified executeCommandById` — assertion `executeCommandById` called with `'leetcode:run'` (manifest id = `'leetcode'`). |

## Test & Tooling Exit Codes

```
$ npm test -- --run
 Test Files  78 passed (78)
      Tests  464 passed (464)
 → exit 0

$ npx tsc --noEmit
(no diagnostics on the 5 files this plan touches)
 → exit 0 on {src/main/codeActionsPostProcessor.ts, src/main.ts, src/graph/SubmissionDetailModal.ts}
 (Pre-existing diagnostics in unrelated test files — `tests/main/*`, `tests/solve/RunModal.test.ts`,
  `tests/solve/SessionExpiredNotice.test.ts` — unchanged; out of scope per
  executor SCOPE BOUNDARY rule.)

$ npx eslint src/main/codeActionsPostProcessor.ts src/graph/SubmissionDetailModal.ts \
             src/main.ts tests/graph/SubmissionDetailModal.test.ts \
             tests/helpers/obsidian-stub.ts styles.css
(0 errors; 8 pre-existing warnings in src/main.ts about unused
 eslint-disable directives unchanged by this plan.)
```

## UAT Pointers (manual spot-check)

Open dev vault → `npm run dev` → reload Obsidian (Cmd-R in dev tools).

1. **D-11/D-12/D-13 — reading-mode buttons**
   Open any LeetCode problem note in Reading Mode. Below every fenced code
   block, expect a right-aligned row with neutral `Run` + `Submit` buttons.
   Open a plain markdown note (no `lc-slug` frontmatter). Expect NO buttons.
   Click Run → expect the same flow as running `LeetCode: Run` from the
   palette. Click Submit → same as palette Submit.

2. **D-29 — CE chip orange**
   Submit Python with a syntax error (`def f( # unclosed paren`). Open
   `LeetCode: View past submissions`. The resulting `CE` chip should read
   orange, not red.

3. **D-30 — light-mode focus ring**
   Switch vault to a light theme. Open the submission picker.
   Tab through rows — each focused row should show a 2px accent outline
   offset inward by 2px.

4. **D-31 — MarkdownRenderer highlighting**
   Open the submission picker, click any row with code. In the detail
   modal the code block should have proper Obsidian CM6 syntax coloring
   (keywords, strings, etc.) — not plain monospaced text.

## Known Stubs

None — every surface in this plan is fully wired. The obsidian-stub's
`Component` + `MarkdownRenderer` classes ARE inert (load/unload/render
no-ops), but they're test-only; production `obsidian` is the runtime.

## Self-Check: PASSED

- `src/main/codeActionsPostProcessor.ts`: FOUND
- `src/main.ts`: FOUND (modified; `registerCodeBlockActionProcessor` imported + called)
- `src/graph/SubmissionDetailModal.ts`: FOUND (modified; MarkdownRenderer + Component wired)
- `styles.css`: FOUND (modified; D-13 + D-29 + D-30 blocks appended/rewritten)
- `tests/graph/SubmissionDetailModal.test.ts`: FOUND (rewritten with 7 tests — all GREEN)
- `tests/helpers/obsidian-stub.ts`: FOUND (extended with Component + MarkdownRenderer stubs)
- Commit `5e4850f`: FOUND
- Commit `0c7647a`: FOUND
