---
phase: 08-ai-debug
plan: 04
subsystem: ui
tags: [obsidian, ai-debug, palette-command, codeblock-button, lastverdictstore, single-entrypoint]

# Dependency graph
requires:
  - phase: 08-01
    provides: LastVerdictStore class + LastVerdict shape + SubmissionOrchestrator onVerdict callback
  - phase: 08-02
    provides: AIClient.invokeStream + InvokeStreamResult discriminated tuple
  - phase: 08-03
    provides: AIStreamModal + buildDebugPrompt + withDebugBullet composition factory
provides:
  - "3rd `AI: Debug` button in fence-row (Edit Mode CM6 widget AND Reading Mode post-processor — both surfaces inherit via shared factory)"
  - "`ai-debug` palette command with editorCheckCallback frontmatter guard (mirrors Submit command shape verbatim)"
  - "LeetCodePlugin.openAIDebug(slug) — single entrypoint for the AI Debug surface; resolves problem MD + ## Code body + last verdict + opens AIStreamModal"
  - "LeetCodePlugin.aiDebugFromActive() — host method satisfying CodeBlockButtonRowHost contract; fence-row click delegate"
  - "LastVerdictStore field on LeetCodePlugin + SubmissionOrchestrator onVerdict registration so non-Accepted verdicts populate the store"
affects:
  - 08-05  # verdict-modal-footer AI Debug button reuses openAIDebug(slug) — same single entrypoint

# Tech tracking
tech-stack:
  added: []  # No new packages — pure wiring/glue plan
  patterns:
    - "Single-entrypoint discipline (T-08-04-T-host): all 3 surfaces (fence-row button, palette command, future verdict-modal button) funnel through openAIDebug(slug) so disclosure gate + prompt assembly + modal open are single-sourced."
    - "Frontmatter-guarded palette command (mirror of Submit at main.ts:425-436): editorCheckCallback returns false for non-LC notes, hiding the command from the palette in that context."
    - "Host method delegation pattern: aiDebugFromActive() resolves the active MarkdownView slug + validates it via isValidSlug, then delegates to openAIDebug(slug) — no business logic in the click handler."
    - "Orchestrator-purity boundary (T-08-04-T-orch): submissionOrchestrator.ts imports only the LastVerdict TYPE, never the LastVerdictStore class; main.ts owns the store and registers the callback at orchestrator construction."

key-files:
  created:
    - tests/main/aiDebugCommand.test.ts
  modified:
    - src/main/codeBlockButtonRow.ts
    - src/main.ts
    - src/ai/AIStreamModal.ts
    - tests/main/codeBlockButtonRow.test.ts
    - tests/main/codeActionsEditorExtension.test.ts
    - tests/main/codeActionsPostProcessor.test.ts

key-decisions:
  - "Extended AIStreamModalArgs with optional disclosureCopy field (Rule 2 deviation) so the 08-04 PLAN's key_links contract — `openAIDebug -> new AIStreamModal({ ..., disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY) })` — type-checks. The disclosure gate itself fires inside AIClient.invokeStream via the plugin-injected requireAIDisclosure factory; disclosureCopy is a forward-compat anchor that prevents future-phase regressions where a caller forgets the feature bullet."
  - "Locked the no-provider Notice copy to sentence case ('No AI provider configured. Open settings → AI.') after eslint-plugin-obsidianmd ui/sentence-case flagged the original 'Open Settings → AI.' — same posture as Phase 07's Notice strings."
  - "openAIDebug uses MarkdownView.editor.getValue() for the active body (mirrors getActiveProblemContext.currentBody — read-at-invocation per SOLVE-09) so the AI sees the user's CURRENT code, not a stale closure-captured value."
  - "LastVerdictStore is plain Map (no Plugin arg, no workspace events) — verdicts have no 'tab is open' lifecycle. Deliberate deviation from EphemeralTabStore which DOES need a reconcile loop because tab-input state IS scoped to 'the problem note is open in at least one markdown leaf' (08-PATTERNS Anti-Pattern #6)."

patterns-established:
  - "CodeBlockButtonRowHost interface extension pattern: append the new method (aiDebugFromActive) to the existing 2-method shape (runFromActive, submitFromActive). Both Edit Mode CM6 widget AND Reading Mode post-processor inherit the new button automatically because both consume the same factory — no per-surface wiring needed."
  - "Sentence-case Notice copy discipline: eslint-plugin-obsidianmd ui/sentence-case flags 'Open Settings' as title-case; the rule expects 'Open settings'. All future Notice strings should follow this pattern."

requirements-completed: [AIDBG-01]

# Metrics
duration: 13min
completed: 2026-05-16
---

# Phase 08 Plan 04: AI Debug Single-Entrypoint + Palette Command Summary

**Fence-row `AI: Debug` button (Edit + Reading Mode) and `ai-debug` palette command both funnel through LeetCodePlugin.openAIDebug(slug) — a single source of truth that assembles the prompt, opens AIStreamModal, and feeds the last failing verdict from LastVerdictStore.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-16T04:55:29Z
- **Completed:** 2026-05-16T05:08:13Z
- **Tasks:** 2
- **Files modified:** 6 (1 new test file + 5 modified)

## Accomplishments

- Extended `buildCodeBlockButtonRow` factory with the 3rd `AI: Debug` button (DOM order locked: `[prefix?][Run][Submit][AI: Debug]` — AI button always last). Both Edit Mode CM6 widget and Reading Mode post-processor inherit the new button automatically because both surfaces consume the shared factory.
- Wired `LeetCodePlugin.openAIDebug(slug)` as the SINGLE entrypoint for the AI Debug surface — resolves problem markdown via DetailCache (with fetch-on-miss fallback), reads the active note body, extracts the `## Code` fence, reads the last failing verdict from `LastVerdictStore`, assembles the prompt via `buildDebugPrompt`, and opens `AIStreamModal` with `withDebugBullet(DISCLOSURE_BASE_COPY)` threaded through.
- Added `LeetCodePlugin.aiDebugFromActive()` host method satisfying the `CodeBlockButtonRowHost` contract — extracts the active MarkdownView's `lc-slug` frontmatter and delegates to `openAIDebug(slug)`.
- Registered the `ai-debug` palette command with verbatim label `AI: Debug current code` and editorCheckCallback frontmatter guard (mirrors the Submit command's shape verbatim — clean ID, no plugin-id prefix per FOUND-03, no default hotkey per project rule).
- Instantiated `LastVerdictStore` in `onload()` (after `ephemeralTabs` and `aiClient`) and disposed it in `onunload()`.
- Registered the `onVerdict` callback on `SubmissionOrchestrator` construction so non-Accepted submit verdicts populate the store automatically. The orchestrator stays pure — only the `LastVerdict` TYPE is imported in `submissionOrchestrator.ts`, never the `LastVerdictStore` class.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend buildCodeBlockButtonRow with the 3rd AI Debug button + bump fence-row tests** — `77848c8` (feat)
2. **Task 2: Wire openAIDebug + LastVerdictStore + palette command + orchestrator callback in main.ts** — `e7fbfc3` (feat)

**Plan metadata:** _(committed in the final docs commit at the end of this summary)_

## Files Created/Modified

- `src/main/codeBlockButtonRow.ts` — Added `aiDebugFromActive` to `CodeBlockButtonRowHost` interface; appended 3rd button (`leetcode-code-action-ai-debug`, label `AI: Debug`) with verbatim Run/Submit click-handler shape (preventDefault + stopPropagation + void plugin.method()).
- `src/main.ts` — Imports for `AIStreamModal`, `buildDebugPrompt`, `DISCLOSURE_BASE_COPY` + `withDebugBullet`, `LastVerdictStore`, `htmlToMarkdown`, type `DetailCacheEntry`. Added `lastVerdictStore!: LastVerdictStore` field; instantiated in `onload()` after `aiClient`; disposed in `onunload()`. Registered `ai-debug` palette command. Wired `onVerdict` callback on `SubmissionOrchestrator` construction. Added `openAIDebug(slug)` and `aiDebugFromActive()` host methods.
- `src/ai/AIStreamModal.ts` — Extended `AIStreamModalArgs` interface with optional `disclosureCopy` field (forward-compat anchor for future phases that surface the extended copy).
- `tests/main/codeBlockButtonRow.test.ts` — Bumped `children.length` 2→3 (no-prefix) and 3→4 (chevron-prefix); added 3rd-/4th-child class assertions; added AI Debug click invocation case + preventDefault/stopPropagation case. No-prefix invariant (`children[0]` is `.leetcode-code-action-run`, not chevron) preserved as regression guard. 8 cases total (was 6).
- `tests/main/aiDebugCommand.test.ts` (NEW) — 22 cases covering source-file grep gates (palette command ID/label, no-prefix, no hotkey, single registration, lastVerdictStore field/instantiation/dispose, onVerdict wiring, openAIDebug + aiDebugFromActive method presence, disclosureCopy threading, no-provider Notice copy, getActiveViewOfType vs workspace.activeLeaf, isValidSlug delegation), T-08-04-T-orch boundary (orchestrator does not runtime-import LastVerdictStore the class), and 6 editorCheckCallback unit cases (no file → false, no fm → false, empty slug → false, valid slug → true, checking=true does NOT dispatch, uppercase slug → false).
- `tests/main/codeActionsEditorExtension.test.ts` — Bumped Edit Mode child-count assertion 3→4; extended `withHostMethods` helper with `aiDebugFromActive`; asserted new AI Debug button textContent `'AI: Debug'`.
- `tests/main/codeActionsPostProcessor.test.ts` — Bumped Reading Mode child-count assertion 2→3; extended `withHostMethods` helper with `aiDebugFromActive`; asserted DOM order `[Run][Submit][AI: Debug]`.

## Decisions Made

- **AIStreamModalArgs.disclosureCopy field added (forward-compat anchor)** — The 08-04 PLAN's `key_links` contract requires `new AIStreamModal({ ..., disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY) })`. Since `AIStreamModalArgs` previously had no such field, I extended the interface with an optional `disclosureCopy?: { willSend: readonly string[]; neverSends: readonly string[] }` so the modal call type-checks and future phases (e.g. AI Review in Phase 09 that may surface the extended copy in a confirm strip) have a typed seam ready. The disclosure gate itself fires inside `AIClient.invokeStream` via the plugin-injected `requireAIDisclosure` factory — `disclosureCopy` is informational on `AIStreamModal` today.
- **Sentence-case Notice copy** — The original `'No AI provider configured. Open Settings → AI.'` was flagged by `eslint-plugin-obsidianmd ui/sentence-case` (it expects lowercase 'settings'). Adopted `'No AI provider configured. Open settings → AI.'` for compliance — same posture as Phase 07's `'Pick an AI provider first.'` and `'AI call cancelled'` strings.
- **getActiveViewOfType in openAIDebug** — Even though the palette command's `editorCheckCallback` already validates the active view + slug, `openAIDebug` re-resolves the active `MarkdownView` because the surface can also be invoked from `aiDebugFromActive` (fence-row button) or future surfaces. Defensive: bails with the locked Notice if the active view shifted off the LC note between the gate firing and the method running.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Structure] Added `disclosureCopy?` field to `AIStreamModalArgs`**
- **Found during:** Task 2 (`new AIStreamModal({ ..., disclosureCopy: withDebugBullet(DISCLOSURE_BASE_COPY) })` would not type-check)
- **Issue:** The 08-04 PLAN's `key_links` contract requires the modal call to thread `disclosureCopy: withDebugBullet(...)` but `AIStreamModalArgs` (Plan 08-03's deliverable) had no `disclosureCopy` field. Without the extension, the call-site contract is silent — a future regression where a caller forgets the feature bullet would be undetectable.
- **Fix:** Extended `AIStreamModalArgs` with an optional `disclosureCopy?: { willSend: readonly string[]; neverSends: readonly string[] }` field. The modal does not currently render this copy itself (the disclosure modal opened by `requireAIDisclosure` reads `DISCLOSURE_BASE_COPY` directly), but the field is a contract anchor that prevents future-phase regressions.
- **Files modified:** `src/ai/AIStreamModal.ts`
- **Verification:** `npx tsc --noEmit` exits 0; `npx vitest run tests/ai/AIStreamModal.*.test.ts` all green (no regression in existing modal tests because the field is optional).
- **Committed in:** `e7fbfc3` (Task 2 commit)

**2. [Rule 1 - Bug fix] Sentence-case Notice copy**
- **Found during:** Task 2 verification (`npm run lint`)
- **Issue:** The original `'No AI provider configured. Open Settings → AI.'` was flagged by `eslint-plugin-obsidianmd ui/sentence-case` — the rule expects lowercase 'settings' (Obsidian community-plugin guideline; the plugin store auto-review enforces it).
- **Fix:** Changed to `'No AI provider configured. Open settings → AI.'`. Updated the corresponding grep gate in `tests/main/aiDebugCommand.test.ts` to match.
- **Files modified:** `src/main.ts`, `tests/main/aiDebugCommand.test.ts`
- **Verification:** `npm run lint` clean of new errors; the locked Notice copy in 08-UI-SPEC §"Open path" was a paraphrase not a verbatim quote, so no copy-contract regression.
- **Committed in:** `e7fbfc3` (Task 2 commit)

**3. [Rule 1 - Bug fix] Updated existing Edit Mode + Reading Mode tests for the new 3-button row**
- **Found during:** Task 2 full-suite verification (`npx vitest run`)
- **Issue:** `tests/main/codeActionsEditorExtension.test.ts` (line 231 — chevron+Run+Submit asserted 3 children) and `tests/main/codeActionsPostProcessor.test.ts` (line 142 — Run+Submit asserted 2 buttons) failed because the shared factory now emits 4 children (Edit Mode) and 3 buttons (Reading Mode) by default. The PLAN's acceptance_criteria explicitly says these existing tests "continue to pass — both surfaces inherit the 3rd button automatically", so the contract change requires the tests to be updated.
- **Fix:** Bumped Edit Mode 3→4 + added AI Debug button assertion; bumped Reading Mode 2→3 + added AI Debug button textContent assertion + DOM-order assertion. Extended both files' `withHostMethods` helpers to wire `aiDebugFromActive` so the host-shape contract is satisfied.
- **Files modified:** `tests/main/codeActionsEditorExtension.test.ts`, `tests/main/codeActionsPostProcessor.test.ts`
- **Verification:** `npx vitest run tests/main/` → 126/126 pass. Full suite: 1044/1044 (3 pre-existing skips).
- **Committed in:** `e7fbfc3` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 missing structure, 2 bug fixes)
**Impact on plan:** All auto-fixes were necessary to satisfy the plan's own contracts (key_links, "existing tests continue to pass", lint compliance). No scope creep.

## Issues Encountered

- `--reporter=basic` flag rejected by vitest 4.1.5 (the version installed in this repo). Switched to vitest's default reporter for the verification runs; output remained legible.
- Two pre-existing `no-useless-escape` lint errors in `src/shared/logger.ts:70` (last touched by Plan 07-08) — already documented in `.planning/phases/08-ai-debug/deferred-items.md` per the executor's scope-boundary rule. Not fixed in this plan.

## Verification

- `npx tsc --noEmit` exits 0 (no TypeScript errors).
- `npx vitest run` → 1044 passed, 3 pre-existing skips, 0 failed.
- `npx vitest run tests/main/aiDebugCommand.test.ts tests/main/codeBlockButtonRow.test.ts` → 30/30 pass.
- `npx vitest run tests/solve/submissionOrchestrator.test.ts tests/solve/lastVerdictStore.test.ts` → 13/13 pass (Plan 08-01 tests still green; the orchestrator's `onVerdict` callback is now wired by main.ts end-to-end).
- `tests/ai/lc-isolation.test.ts` → 4/4 pass (no `obsidianFetch` import in `src/api/`, `src/auth/`, `src/browse/`, `src/notes/`, `src/solve/`, `src/graph/`, `src/preview/`).
- `npm run lint` clean of new errors (2 pre-existing `src/shared/logger.ts` errors remain — logged in deferred-items.md).
- `npm run check:bundle-size` → `main.js: 986.4 KB` (well under 1.2 MB ceiling; under 1 MB even).

## Bundle Size Delta

- Phase 08 Plan 04 added: 1 palette command (~120 bytes), 1 host method `openAIDebug` (~750 bytes), 1 host method `aiDebugFromActive` (~250 bytes), 1 button + 1 method on `CodeBlockButtonRowHost` (~150 bytes), 1 import block for AIStreamModal/buildDebugPrompt/etc (~200 bytes), 1 LastVerdictStore field + dispose (~80 bytes).
- Total source delta: ~1.5 KB; bundle delta after esbuild minify + tree-shake: well under 1 KB (under the RESEARCH-baseline ~0.7 KB estimate).

## Both Fence-Row Surfaces Inherit the 3rd Button Automatically

- **Edit Mode (CM6 widget):** `src/main/codeActionsEditorExtension.ts` — `CodeActionsWidget.toDOM` calls `buildCodeBlockButtonRow(doc, plugin, { prefix: () => buildLanguageChevron(...) })`. The chevron prefix is present, so the row is `[chevron][Run][Submit][AI: Debug]` (4 children). Verified by `tests/main/codeActionsEditorExtension.test.ts:214-247`.
- **Reading Mode (post-processor):** `src/main/codeActionsPostProcessor.ts` — calls `buildCodeBlockButtonRow(doc, plugin)` with no prefix. The row is `[Run][Submit][AI: Debug]` (3 children, 3 buttons). Verified by `tests/main/codeActionsPostProcessor.test.ts:117-152`.

## User Setup Required

None — Plan 08-04 ships only the user-visible AI Debug entrypoints. The disclosure modal and provider configuration paths were already wired by Phase 07.

## Next Phase Readiness

- **Plan 08-05** can now wire the verdict-modal-footer `AI: Debug` button to call `LeetCodePlugin.openAIDebug(slug)` — the same single entrypoint. The verdict modal already has the `onCopyFailingInput` plumbing precedent at lines 27-33 of `src/solve/VerdictModal.ts`; Plan 08-05 follows the same `onOpenAIDebug` arg shape.
- The `LastVerdictStore` is now actively populated by every non-Accepted submit. Plan 08-05 (verdict-modal-footer button) can read from the same store via `openAIDebug(slug)` — no additional wiring needed.
- AIDBG-01 user-facing entrypoints SHIP. The `ai-debug` palette command + 3rd fence-row button are the discovery surfaces the user will see immediately on plugin reload.

---
*Phase: 08-ai-debug*
*Completed: 2026-05-16*

## Self-Check: PASSED

- Created `tests/main/aiDebugCommand.test.ts` — FOUND.
- Modified `src/main/codeBlockButtonRow.ts` — FOUND (3rd button added).
- Modified `src/main.ts` — FOUND (openAIDebug, aiDebugFromActive, ai-debug command, LastVerdictStore field, onVerdict callback).
- Modified `src/ai/AIStreamModal.ts` — FOUND (disclosureCopy field).
- Modified `tests/main/codeBlockButtonRow.test.ts` — FOUND (2→3, 3→4).
- Modified `tests/main/codeActionsEditorExtension.test.ts` — FOUND (3→4).
- Modified `tests/main/codeActionsPostProcessor.test.ts` — FOUND (2→3).
- Commit `77848c8` (Task 1) — FOUND in `git log`.
- Commit `e7fbfc3` (Task 2) — FOUND in `git log`.
