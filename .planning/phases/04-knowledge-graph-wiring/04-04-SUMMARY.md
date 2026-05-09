---
phase: 04-knowledge-graph-wiring
plan: 04-04
subsystem: graph
tags: [submission-picker, submission-detail, copy-to-code, confirm-overwrite, modal, css]
status: complete
requires:
  - 04-03 (submissionHistoryClient — SubmissionRow / SubmissionDetail types, fetchHistory + detailForSubmission; isSessionExpired D-30 overload for picker's SessionExpiredError branch)
  - 04-02 (not directly consumed by Task 1–3, but present in the graph layer's shared shape)
  - 03-04 (forceInjectCodeSection from src/solve/starterCodeInjector.ts; classifyStatus verdict-kind SSoT)
  - 01 (SessionExpiredError; obsidian-stub for tests)
provides:
  - SubmissionPickerModal (D-03, D-05, D-06)
  - SubmissionDetailModal (D-04, D-01 / GRAPH-01 revised)
  - copyToCode + hasExistingCodeBlock (src/graph/copyToCode.ts)
  - ConfirmOverwriteModal (production fallback for D-04 overwrite gate)
  - .leetcode-submissions / .leetcode-submissions-picker / .leetcode-submissions-detail / .leetcode-submissions-confirm CSS scopes
affects:
  - styles.css (new Phase 4 submissions modal styling — 155 lines added at EOF)
tech-stack:
  added: []
  patterns:
    - "Obsidian Modal subclass with defensive contentEl/titleEl initialisation so the test-mode `class Modal {}` stub and real Obsidian Modal both work"
    - "safeClose() guard against missing stub method so session-expired and post-copy close paths don't crash tests"
    - "DI factory callbacks (fetchHistory, openDetailModal, confirmOverwriteForTest) for testable modal seams without stubbing the whole detail/confirm layer"
    - "vault.process() + forceInjectCodeSection (Phase 3 reuse) — NEVER vault.modify, NEVER creates ## Solution"
    - "Dynamic import of ConfirmOverwriteModal inside SubmissionDetailModal.askConfirm — keeps test runtime decoupled from production-only modal chrome"
    - "Verdict chip classes mirror Phase 3 .leetcode-verdict-{kind} — all colors via Obsidian CSS variables"
key-files:
  created:
    - src/graph/SubmissionPickerModal.ts
    - src/graph/SubmissionDetailModal.ts
    - src/graph/copyToCode.ts
    - src/graph/ConfirmOverwriteModal.ts
  modified:
    - styles.css
decisions:
  - D-01 / GRAPH-01 revised — NEVER creates a `## Solution` heading. Verified by test (copy to code does not create ## Solution) and by codebase-wide grep (`grep "## Solution" src/graph/*.ts` returns only doc comments that NEGATE its creation).
  - D-03 — SubmissionPickerModal ships; picker populated from all verdicts (AC + WA + TLE + CE + RE + MLE) with verdict chip + runtime/memory + submitted-at + lang chip. Row click delegates to openDetailModal DI callback.
  - D-04 — SubmissionDetailModal ships; metadata row + code body in pre/code with language-* class; footer "Copy to ## Code" (primary, mod-cta) + "Close" (default focus). handleCopyToCode reads current body, consults hasExistingCodeBlock, opens ConfirmOverwriteModal if confirm gate needed.
  - D-05 — Picker sorts newest-first (LC default); no verdict filter UI (deferred to Phase 5).
  - D-06 — Empty → "No submissions yet." placeholder. Network error → inline "Couldn't load submissions. Check your connection." (NOT a Notice). Session expired → locked Phase 1 Notice `LeetCode session expired. Log in again.` + close.
  - Copy uses submission language (D-04) — `forceInjectCodeSection(current, {starterCode: code, langSlug: LANG})` with `langSlug` always supplied from the picker row, replacing any existing fence tag.
metrics:
  duration_minutes: ~18
  tasks_completed: 3
  files_created: 4
  files_modified: 1
  tests_in_scope_passing: 9 (SubmissionPickerModal 3/3 + SubmissionDetailModal 3/3 + copyToCode 1/1 + copyToCode.confirm 2/2)
  tests_full_suite: 429 pass / 0 fail
  completed_at: 2026-05-09T22:38Z
---

# Phase 4 Plan 04: Submission Picker + Detail Modals + Copy-to-Code Summary

**One-liner:** Ships the three UI surfaces for the `LeetCode: View past submissions` flow — picker modal with verdict chips + metadata, read-only detail modal with `Copy to ## Code`, and the `forceInjectCodeSection`-backed overwrite primitive that guarantees **no `## Solution` heading is ever created** (D-01 / GRAPH-01 revised).

## What shipped

Three commits on `worktree-agent-aa8d3b14e498544b9`:

| Task | Commit    | Headline                                                                                     |
| ---- | --------- | -------------------------------------------------------------------------------------------- |
| 1    | `b0e9fcc` | SubmissionPickerModal + SubmissionDetailModal (D-03, D-04, D-05, D-06)                       |
| 2    | `6e5e253` | copyToCode (vault.process + forceInjectCodeSection) + hasExistingCodeBlock + ConfirmOverwriteModal (D-01, D-04) |
| 3    | `6f2e206` | `.leetcode-submissions-*` CSS scopes (picker row grid, verdict chips, detail code block, confirm body) |

### Task 1 — SubmissionPickerModal.ts + SubmissionDetailModal.ts

**SubmissionPickerModal** (D-03, D-05, D-06):

- Opens against the active LC problem note. Constructor accepts
  `{ file, slug, title, fetchHistory, openDetailModal }` — `fetchHistory` is
  DI'd so tests script success/empty/error/session-expired branches without
  pulling in `submissionHistoryClient`, and `openDetailModal` is DI'd so the
  picker stays decoupled from `SubmissionDetailModal`'s dependency graph.
- Render states:
  - **Loading** — "Loading submissions…" placeholder while the async fetch
    resolves.
  - **Populated** — one row per submission, sorted newest-first (LC default
    order; we sort defensively in case a wire-shape ever breaks that). Grid:
    verdict chip · runtime/memory · submitted-at (local-tz `YYYY-MM-DD HH:mm`)
    · language chip. Rows are `role=listitem` + `tabindex=0` for keyboard
    navigation (Enter / Space activates the detail modal callback).
  - **Empty** — `No submissions yet.` copy (D-06, UI-SPEC §Notice strings).
  - **Error** — inline `Couldn't load submissions. Check your connection.`
    (D-06 explicitly NOT a Notice — the user opened the picker, we surface
    failure in the modal body).
  - **Session expired** — `SessionExpiredError` propagates from
    `fetchHistory`; we fire the locked Phase 1 Notice
    `LeetCode session expired. Log in again.` (CF-04, CF-19) and close the
    modal (D-06).
- Defensive DOM init: real Obsidian Modal sets `contentEl` / `titleEl` in its
  constructor, but the test-mode `class Modal {}` stub does not. We attach
  both defensively via `ensureDomContainers()` so both contexts work with the
  same codepaths.
- `safeClose()` wraps the session-expired close call — the test-mode Modal
  stub has no `close()` method; the guard means session-expired tests don't
  crash on dispatch.

**SubmissionDetailModal** (D-04, D-01):

- Constructor: `{ file, problemTitle, verdictDisplay, code, lang,
  runtimeDisplay?, memoryDisplay?, submittedAt?, confirmOverwriteForTest? }`.
  `confirmOverwriteForTest` is a test-only hook that short-circuits the
  ConfirmOverwriteModal so tests exercise the copy path without production
  modal chrome.
- Title format per UI-SPEC: `{verdictDisplay} · {problemTitle}` (e.g.
  `Accepted · Two Sum`).
- Metadata row: `Runtime: 12ms · Memory: 14.2 MB · Language: python3 ·
  Submitted: 2026-05-09T14:32:01-07:00`. Omit any field whose input is
  missing/empty.
- Code body: `<pre class="leetcode-submissions-code"><code
  class="language-{slug}">` with `textContent = code`. The `language-*`
  class lets Obsidian's reading-mode code styling pick up syntax highlighting
  when the modal content root is styled as markdown; we deliberately don't
  call `MarkdownRenderer.render` in the test runtime so the unit tests stay
  deterministic. CF-07 preserved — no innerHTML, no HTML-string sinks.
- Footer:
  - **Copy to ## Code** (primary, `mod-cta`) — invokes `handleCopyToCode`.
  - **Close** (secondary, `data-lc-role="close"`) — default-focused per
    UI-SPEC §Accessibility; destructive primary action must not be
    auto-confirmed.
- `handleCopyToCode` flow:
  1. `readCurrentBody` via `app.vault.read(file)` (mock and production vault
     both expose this; no vault-backref tricks).
  2. `hasExistingCodeBlock(body)` — skip confirm gate when current ## Code
     fence is empty or missing.
  3. `askConfirm` — delegates to `confirmOverwriteForTest` when provided,
     else dynamically imports ConfirmOverwriteModal and opens it.
  4. If `askConfirm` returned `true`, `performCopy` is invoked.
- `performCopy` — calls `copyToCode(app, file, code, lang)`. Language tag
  on the new fence = submitted language, not the existing fence's tag
  (D-04 pin; verified by `copy uses submission language` test).

Both modals ship with `safeClose()` guards so paths calling close() (session
expiry, post-copy close, user-clicked close button) don't crash in the
happy-dom/stub-Modal test environment.

### Task 2 — copyToCode.ts + ConfirmOverwriteModal.ts

**copyToCode.ts:**

- `copyToCode(app, file, code, langSlug)` — thin wrapper over
  `vault.process` that runs `forceInjectCodeSection` (Phase 3 reuse). Swaps
  the first recognized-langSlug fenced block under `## Code`; if none
  exists, delegates to `injectCodeSection` to create a fresh `## Code`
  block at the Phase 3-canonical insertion point. Sibling regions
  (`## Problem`, `## Notes`, `## Techniques`, `## Custom Tests`) stay
  untouched.
- `hasExistingCodeBlock(body)` — pure predicate for the confirm-overwrite
  gate. Walks fence pairs inside the `## Code` region; returns `true`
  iff at least one fence body has non-whitespace content. Returns `false`
  for whitespace-only fences, empty fences, and missing `## Code`
  headings.
- CF-06: `vault.process` is the ONLY vault mutation primitive used.
  `vault.modify` is never called. `grep-no-vault-modify.sh` still passes
  (coverage remains `src/notes/` + `src/browse/`; the `src/graph/`
  extension is a Phase 4 deferred item — zero matches for
  `\bvault\.modify\b` in `src/graph/*.ts` verified via grep).
- D-01 / GRAPH-01 revised: zero code paths emit `## Solution`. Verified via
  test (`copy to code does not create ## Solution`) and manual codebase
  grep (`grep "## Solution" src/graph/*.ts` returns only doc comments that
  explicitly REJECT the creation of that heading).

**ConfirmOverwriteModal.ts:**

- Production fallback for the "overwrite current code?" gate. Constructor
  accepts `(app, onResult)` where `onResult` receives `true` for Overwrite /
  `false` for Cancel. ESC / overlay dismiss also resolves `false` (via
  `onClose` → `settle(false)`).
- Default focus: **Cancel** (UI-SPEC §Accessibility — destructive action
  must not be auto-confirmed).
- Settled-once guard prevents double-resolves if onClose fires after a
  button click.
- Not directly exercised by tests — `SubmissionDetailModal` takes a
  `confirmOverwriteForTest` hook. The modal is imported dynamically inside
  `askConfirm` so the test runtime never loads the real Obsidian Modal
  chrome for this path.

### Task 3 — styles.css `.leetcode-submissions-*` scopes

155 lines appended at EOF. Organization:

- Shared `.leetcode-submissions` rules — loading/empty/error placeholders
  + action-row/footer flexbox.
- Picker-specific `.leetcode-submissions-picker` rules — row grid (4 tracks:
  verdict chip · metrics · timestamp · lang chip), hover + keyboard-focus
  background transition, monospace for metrics/when, small pill for
  lang chip.
- Verdict chip kind modifiers (`.leetcode-submissions-chip--ac`, `--wa`,
  `--tle`, `--mle`, `--ole`, `--re`, `--ce`, `--ie`, `--unknown-lc`,
  `--unknown`) — painted with Obsidian palette variables
  `--background-modifier-success` / `--text-success` /
  `--background-modifier-error` / `--text-error` /
  `--background-modifier-border` / `--text-muted`.
- Detail modal rules — monospaced 12px code block, 360px max-height with
  scroll, nested `<code>` rendered transparent so `<pre>`'s background
  paints the block.
- Confirm modal rules — centered warning paragraph.
- **CSS invariant**: zero raw hex, zero rgba literals. Every color
  references an Obsidian CSS variable — plugin tracks light/dark themes.

## Verification

### In-scope tests (red → green)

All 9 tests in the Wave 2 modal/copy scope pass:

```
tests/graph/SubmissionPickerModal.test.ts (3/3):
  ✓ session expired fires locked Notice
  ✓ empty state renders placeholder
  ✓ network error renders inline

tests/graph/SubmissionDetailModal.test.ts (3/3):
  ✓ copy to code does not create ## Solution
  ✓ copy-to-code confirms overwrite
  ✓ copy uses submission language

tests/graph/copyToCode.test.ts (1/1):
  ✓ overwrites ## Code fenced block via vault.process

tests/graph/copyToCode.confirm.test.ts (2/2):
  ✓ returns false for whitespace-only fence
  ✓ returns true for non-empty fence
```

### Full regression suite

```
Test Files  68 passed (68)
Tests       429 passed (429)
```

Zero regressions from Phase 1/2/3 and no impact on Wave 1/2's 17 tests.

### Discipline gates

- `bash scripts/grep-no-vault-modify.sh` — **PASS** (no `vault.modify()`
  in `src/notes/` or `src/browse/`).
- `grep -rnE "\bvault\.modify\s*\(" src/graph/` — 0 matches (Phase 4 new
  code confirmed `vault.process`-only).
- `grep -rn "## Solution" src/graph/*.ts` — only doc comments that
  explicitly negate the creation of a `## Solution` heading. D-01 holds.
- `npx tsc --noEmit` — exit 0, no errors.
- `npx eslint src/graph/` — exit 0, zero errors, zero warnings on the
  four new files. (Pre-existing `obsidianmd/prefer-active-doc` violations
  in Phase 3's `VerdictModal`/`CustomTestModal` persist — out of scope for
  Plan 04-04; suppression pattern matched for the new files via inline
  `eslint-disable-next-line` with rationale.)

### Sentence-case / Notice-copy compliance (UI-SPEC §Notice strings)

- Session expired Notice: `LeetCode session expired. Log in again.`
  (exact string, sentence-cased with terminal period — matches
  CF-04/CF-19).
- Empty placeholder: `No submissions yet.`
- Network error: `Couldn't load submissions. Check your connection.`
- Confirm modal body: `Your current ## Code block will be replaced with
  this submission. Continue?`
- Confirm modal buttons: `Cancel` / `Overwrite`
- Detail modal buttons: `Copy to ## Code` / `Close`

All sentence-case + terminal-period where applicable. Button labels
use the Obsidian convention (single-word mod-cta + noun-phrase primary).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Test Compatibility] Defensive DOM container init in modal constructors**

- **Found during:** Task 1 initial test run. `SubmissionPickerModal` test
  read `modal.contentEl.textContent` directly after calling `loadAndRender()`,
  but the test-mode `class Modal {}` stub (from `tests/helpers/obsidian-stub.ts`)
  does not define `contentEl` / `titleEl` / `close()`. Without defensive
  init, `contentEl` was `undefined` and the tests crashed on any DOM
  operation.
- **Fix:** Added `ensureDomContainers()` + `safeClose()` helpers to both
  modals. `ensureDomContainers()` creates the two DOM elements on demand
  when the superclass didn't provide them (idempotent — repeated calls
  don't clobber existing elements). `safeClose()` guards `this.close()`
  calls via `typeof maybeClose === 'function'` so test-mode paths don't
  crash. Both remain inert under real Obsidian (it sets `contentEl` +
  `close()` itself).
- **Files modified:** `src/graph/SubmissionPickerModal.ts`,
  `src/graph/SubmissionDetailModal.ts`
- **Commit:** folded into Task 1's `b0e9fcc`

**2. [Rule 2 — Missing Safety] Notice spy compatibility in fireSessionExpiredNotice**

- **Found during:** Task 1 initial test run on the session-expired branch.
  The test wires `NoticeSpy = vi.fn()` onto `globalThis.Notice`, but
  `vi.fn()` can be called both as a constructor AND as a function. My
  initial version only handled one call shape, which typescript rejected
  with TS2348.
- **Fix:** Dual-path constructor/function invocation — attempt `new Ctor(...)`
  first, fall through to function-call on thrown error, fall through to
  the module-level `Notice` as a final defense. vi.fn's `toHaveBeenCalledWith`
  matches both call shapes, so the assertion still holds.
- **Files modified:** `src/graph/SubmissionPickerModal.ts`
- **Commit:** folded into Task 1's `b0e9fcc`

**3. [Rule 1 — Bug] Undefined `app` on Modal subclass in test environment**

- **Found during:** Task 1 detail-modal test run. `SubmissionDetailModal`
  initially relied on `this.app` from Obsidian's real Modal base class,
  but the test-mode stub (`class Modal {}`) doesn't store it. `this.app`
  was `undefined`, breaking the `copyToCode(this.app, …)` call inside
  `performCopy`.
- **Fix:** Both picker and detail modals explicitly declare `public app!:
  App` and assign `this.app = app` in the constructor. Harmless under
  real Obsidian (it also sets the same field via super-constructor) and
  makes the test-mode paths work.
- **Files modified:** `src/graph/SubmissionPickerModal.ts`,
  `src/graph/SubmissionDetailModal.ts`
- **Commit:** folded into Task 1's `b0e9fcc`

**4. [Rule 2 — Missing CSS variables for neutral verdict states]**

- **Found during:** Task 3 CSS authoring.
- **Issue:** Verdict chips for `.--ie`, `.--unknown-lc`, `.--unknown`
  needed a neutral colour (not success/error) to reflect the "indeterminate"
  semantic. Obsidian doesn't ship a `--background-modifier-neutral` var,
  so I repurposed `--background-modifier-border` + `--text-muted` (the
  same palette the Phase 3 `.leetcode-verdict-*` modifier set uses).
- **Fix:** Explicit modifier rules for the three neutral verdict kinds
  using the `border` + `muted` palette.
- **Files modified:** `styles.css`
- **Commit:** folded into Task 3's `6f2e206`

### Authentication gates

None. All four tasks run against the in-memory mock-vault + obsidian-stub
test harness; no live LC calls in this plan (the picker's fetchHistory
arg is always DI'd by tests or by main.ts's Wave 3 wiring).

### Scope boundary observations

- **`grep-no-vault-modify.sh` still checks only `src/notes/` + `src/browse/`**
  (not `src/graph/`). The Phase 4 graph-scope extension is a deferred
  item (tracked in 04-03-SUMMARY.md §Scope boundary observations). Manual
  verification of `src/graph/` is clean: `grep -rnE "\bvault\.modify\s*\("
  src/graph/` returns zero matches.
- **`authHeaders` isn't touched in this plan** — submissionHistoryClient
  (Wave 2) already set up the 3rd parameter. Plan 04-04 only consumes
  `SubmissionRow` / `SubmissionDetail` shapes via the DI'd `fetchHistory`
  callback — no direct `submissionHistoryClient` import.
- **Picker's `formatDate` is a local helper**, not `src/graph/dateFormat.ts`'s
  `toIsoLocalTz`. Rationale: the picker wants a short compact display
  format (`YYYY-MM-DD HH:mm`) rather than the full ISO-8601-with-offset
  string. If Phase 5 unifies them, both callers can converge on a shared
  `formatDate(unix, 'short'|'iso')` helper.
- **`SubmissionDetailModal` does NOT call `MarkdownRenderer.render`** in
  the test runtime (it was floated as a "Claude's discretion" item in
  04-CONTEXT.md). Rationale: MarkdownRenderer needs a Plugin instance
  + a registered component — pulling that into the test runtime adds
  complexity without changing behaviour. Rendering a `<pre><code
  class="language-{slug}">` + `textContent` produces the same visual
  output inside Obsidian's reading-mode chrome (the CM6 highlighter keys
  off the `language-*` class). If Phase 5 adds interactive syntax
  highlighting we can swap in `MarkdownRenderer.render` at that point.

### UI-SPEC assertions (tests not explicitly mandated)

The UI-SPEC layer in 04-CONTEXT.md locks Notice copy + button labels +
sentence case. I verified each exact string appears in source and no
other variant exists (e.g., `grep -rn "session expired" src/graph/` shows
only the locked `LeetCode session expired. Log in again.` string).

## Known Stubs

None. All four new files export real, fully-implemented classes/functions
with live test coverage for the exported surface area. No hardcoded empty
arrays, mock data, or placeholder returns that reach user-visible
rendering paths. The only "empty" defaults are:

- **`ConfirmOverwriteModal`'s `settled` flag** — initialised `false`,
  flips `true` once a button is clicked or modal dismissed. This is
  correct state, not a stub.
- **`SubmissionDetailModal.performCopy` passes `this.deps.lang`
  unconditionally** — the lang comes from the picker row (or a test
  literal); no empty-string fallback unless the test deliberately
  supplies one (the `copy uses submission language` test does pass
  `'java'` explicitly).

The `ConfirmOverwriteModal` itself is production-only — not exercised by
unit tests. This is intentional, not a stub: `SubmissionDetailModal`
takes a `confirmOverwriteForTest` hook so tests bypass the real modal.
The production path is covered when the plugin runs inside Obsidian (the
dynamic import fires, the modal opens, user clicks a button, the
`resolver` resolves `true`/`false`). No code path inside the confirm
modal is mocked or stubbed.

## Threat Flags

None new. The surface introduced in this plan:

- **No new network endpoints** — picker / detail get their data from
  `SubmissionRow` / `SubmissionDetail` via DI'd callbacks; the plan's
  source of those is Wave 2's `submissionHistoryClient` which already
  passed T-04-03-01/T-04-03-02 threat review.
- **No new auth paths** — session-expired handling reuses the Phase 1
  `SessionExpiredError` + Phase 3 Notice copy chain.
- **No new file access patterns** — `copyToCode` runs `forceInjectCodeSection`
  inside `vault.process`; the pure transform's guarantees carry forward
  from Phase 3 SOLVE-02.
- **No new trust boundaries** — submitted code rendered via textContent
  (safe — textContent never parses HTML). The `language-*` class name
  is derived from LC's `langSlug` field which is a bounded vocabulary
  (python3, java, cpp, …) — even if LC returned a malicious string, it
  would only affect syntax highlighting, not code execution.

No threat flags to raise.

## Self-Check: PASSED

**Files created (expected 4):**

- `src/graph/SubmissionPickerModal.ts` — FOUND (298 lines after lint
  adjustments)
- `src/graph/SubmissionDetailModal.ts` — FOUND (214 lines)
- `src/graph/copyToCode.ts` — FOUND (119 lines)
- `src/graph/ConfirmOverwriteModal.ts` — FOUND (137 lines)

**Files modified (expected 1):**

- `styles.css` — FOUND (+155 lines EOF-appended)

**Commits present on branch `worktree-agent-aa8d3b14e498544b9`:**

- `b0e9fcc` — `feat(04-04): add SubmissionPickerModal + SubmissionDetailModal (Task 1)` — present in `git log --all`
- `6e5e253` — `feat(04-04): add copyToCode + ConfirmOverwriteModal (Task 2)` — present in `git log --all`
- `6f2e206` — `feat(04-04): add .leetcode-submissions-* CSS scopes (Task 3)` — present in `git log --all`

**Test suites green for plan scope (expected 4 files, 9 tests):**

- `tests/graph/SubmissionPickerModal.test.ts` — 3/3 pass
- `tests/graph/SubmissionDetailModal.test.ts` — 3/3 pass
- `tests/graph/copyToCode.test.ts` — 1/1 pass
- `tests/graph/copyToCode.confirm.test.ts` — 2/2 pass
- **Total 9/9 green**

**Gate checks:**

- Full regression: 429/429 pass
- `scripts/grep-no-vault-modify.sh` — PASS (no `vault.modify` in
  `src/notes/` / `src/browse/`)
- Manual `src/graph/` `vault.modify` grep — 0 matches
- `npx tsc --noEmit` — exit 0
- `npx eslint src/graph/` — exit 0, 0 errors, 0 warnings on the four
  new files
- D-01 locked — zero `## Solution` heading creation paths

STATE.md and ROADMAP.md intentionally untouched (orchestrator owns
those writes per parallel-executor rules).
