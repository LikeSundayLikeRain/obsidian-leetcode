---
phase: 21-v1-2-migration
plan: 03
subsystem: code-extractor + new-note-emission
tags: [migration, code-extractor, frontmatter-source-of-truth, new-note-emission, v13-emit, fence-kind-dispatch]
requires:
  - 21-01 # fenceMigrator (provides v1.3 fence opener primitives this plan threads through)
provides:
  - extractFirstFencedBlock-frontmatter-aware # codeExtractor reads lc-language SSoT for v1.3 fences (D-extract-01)
  - codeBlockForV13-emitter # ```leetcode-solve fence emitter for new-note creation (D-emit-01, MIGRATE-08)
  - injectCodeSection-fenceKind-dispatch # mirrors forceInjectCodeSection v1.3 short-circuit (D-emit-02)
  - SubmissionOrchestratorDeps-file-app-lift # optional file?: TFile + app?: App for frontmatter access
  - buildNoteBody-useInlineWidget-gate # Phase 22 cleanup boundary preserved
affects:
  - src/main.ts # 4 extractFirstFencedBlock call sites threaded with frontmatter
  - src/solve/submissionOrchestrator.ts # 1 call site + SubmissionDeps lift
  - src/graph/KnowledgeGraphWriter.ts # 1 call site (onAccepted pattern classification)
  - src/notes/NoteWriter.ts # buildNoteBody call site + NoteWriterSettings port
  - src/contest/ContestFinalizer.ts # buildNoteBody call site + ContestFinalizerSettings port
tech-stack:
  added: [] # no new dependencies
  patterns:
    - "Frontmatter-source dispatch (D-extract-01) — codeExtractor is the SSoT codepath for run/submit language derivation"
    - "Optional-arg threading — preserves backward-compat for test fixtures"
    - "Phase 22 cleanup boundary — useInlineWidget gates + legacy emitter both stay in tree"
key-files:
  created: []
  modified:
    - src/solve/codeExtractor.ts
    - src/solve/submissionOrchestrator.ts
    - src/solve/starterCodeInjector.ts
    - src/notes/NoteTemplate.ts
    - src/notes/NoteWriter.ts
    - src/contest/ContestFinalizer.ts
    - src/main.ts
    - src/graph/KnowledgeGraphWriter.ts
    - tests/solve/codeExtractor.test.ts
    - tests/solve/noteTemplate-phase3.test.ts
    - tests/solve/starterCodeInjector.test.ts
    - tests/ai/rerunAIReview.test.ts
decisions:
  - "Made `file` and `app` OPTIONAL on SubmissionOrchestratorDeps so 11 test fixtures need no updates (degrades to undefined → Branch C verbatim legacy path; correct for legacy-fence test cases)."
  - "Made `getUseInlineWidget` OPTIONAL on NoteWriterSettings + ContestFinalizerSettings so existing test fixtures that predate this field continue to compile + exercise legacy emit (the milestone default path through Phase 21)."
  - "Brittle text-window assertions in tests/ai/rerunAIReview.test.ts widened (2000→2500 and 3000→3500 chars) rather than refactored — minimal change to accommodate the threading code that shifted the windows."
metrics:
  duration: "~12 minutes"
  completed: "2026-06-01"
  tasks-completed: 3
  test-count: 18 # 7 frontmatter-source + 4 codeBlockForV13 + 3 buildNoteBody-gate + 4 injectCodeSection-fenceKind
---

# Phase 21 Plan 03: codeExtractor + new-note emission Summary

Closes the language-derivation invariant for v1.3: codeExtractor reads `lc-language` frontmatter as the source of truth when the located fence is `leetcode-solve` (D-extract-01); new notes emit ` ```leetcode-solve ` directly via `codeBlockForV13` and the `injectCodeSection` `fenceKind` short-circuit (D-emit-01..02). After this plan, a freshly-migrated note's Run/Submit dispatch uses frontmatter (not the deleted fence tag), and v1.3-created notes never roundtrip through the legacy emitter.

## What Shipped

### Task 1 — extractFirstFencedBlock signature widened (D-extract-01)

`extractFirstFencedBlock` gains an optional second argument `frontmatter?: { 'lc-language'?: string }` and dispatches three branches:

| Branch | Fence opener | `lc-language` | Returns |
|--------|--------------|---------------|---------|
| A | ` ```leetcode-solve ` | non-empty string | `{ lang: lc-language, code }` (frontmatter wins) |
| B | ` ```leetcode-solve ` | missing / empty | `{ lang: null, code }` (caller resolves via `resolveLangSlug(null, defaultLang)`) |
| C | any other tag (legacy LC, non-LC, untagged) | ignored | `{ lang: fenceTag ?? null, code }` (verbatim legacy behavior) |

Branch C preserves Run/Submit on unmigrated v1.0/v1.1/v1.2 notes through the v1.3 transition window. Phase 22 deletes Branch C when `useInlineWidget=ON` is the default.

7 new tests under the `frontmatter-source` tag cover all three branches plus the undefined-frontmatter back-compat case and the no-`## Code`-heading case.

### Task 2 — Frontmatter threaded through 6 production consumers + SubmissionDeps lift

All 6 production call sites of `extractFirstFencedBlock` now pass `app.metadataCache.getFileCache(file)?.frontmatter as { 'lc-language'?: string } | undefined`:

| # | File:line | Site | `file` source |
|---|-----------|------|---------------|
| 1 | `src/main.ts:2321` | `openAIDebug` Step 2 | `view.file` (null-checked) |
| 2 | `src/main.ts:2448` | `startAutoReview` Step 2 | `ctx.file` from reviewCtx |
| 3 | `src/main.ts:2597` | `runAIReview` Step 3 | `view.file` (null-checked) |
| 4 | `src/main.ts:3911` | `runInterpretedInput` legacy fallback | `ctx.file` from ProblemContext |
| 5 | `src/solve/submissionOrchestrator.ts:293` | legacy submit fallback | `this.deps.file` (new optional field) |
| 6 | `src/graph/KnowledgeGraphWriter.ts:222` | `onAccepted` pattern classification | `ctx.file` from KGWriter ctx |

**SubmissionDeps lift** (WARNING 3 from PLAN notes block): `SubmissionOrchestratorDeps` gained two optional fields:

```typescript
file?: TFile;
app?: App;
```

The orchestrator's legacy fallback at line 293 uses both: `this.deps.app && this.deps.file ? this.deps.app.metadataCache.getFileCache(this.deps.file)?.frontmatter ... : undefined`. Production caller `src/main.ts:3267` (inside `submitWithCode`) passes both. **Test fixtures need NO updates** — the fields are OPTIONAL and tests' legacy fences (e.g., ` ```python3 `) hit Branch C of `extractFirstFencedBlock`, which ignores frontmatter regardless. Verified: 11 test constructors across 4 test files (`tests/solve/submissionOrchestrator.test.ts`, `tests/solve/submissionOrchestrator.onVerdict.test.ts`, `tests/main/runFromWidget.test.ts`) all continue to pass.

**SSoT-bypass audit clean** per D-extract-02: `grep -rn "frontmatter\?\\.\\['lc-language'\\]" src/ | grep -v codeExtractor.ts | grep -v fenceMigrator.ts | grep -v applyFrontmatter | grep -v applySolveTimeFrontmatter | grep -v WidgetController` returns nothing — no parallel `metadataCache.frontmatter['lc-language']` shortcut introduced for run/submit dispatch.

### Task 3 — codeBlockForV13 emitter + fenceKind dispatch + transition gate (D-emit-01..02, MIGRATE-08)

**`src/notes/NoteTemplate.ts`** — added `codeBlockForV13(starterCode: string): string` returning ``` `\`\`\`leetcode-solve\n<starter.trim()>\n\`\`\`` ```. Trim semantics mirror `codeBlockFor`. Legacy `codeBlockFor` is preserved for the Phase 22 boundary.

**`buildNoteBody` transition gate** (the line Phase 22 deletes):

```typescript
const codeBlock = input.useInlineWidget
  ? codeBlockForV13(starter)
  : codeBlockFor(langSlug, starter);
```

Located at `src/notes/NoteTemplate.ts:240-242`. The gate's input is a new optional `useInlineWidget?: boolean` parameter on `buildNoteBody` (defaults to `false` so existing v1.2 callers stay byte-for-byte unchanged).

**Caller chain ripple:**

- `src/notes/NoteWriter.ts` — `buildNoteBody` call site at line ~362 reads `this.settings.getUseInlineWidget?.() ?? false`. `NoteWriterSettings` interface gained an OPTIONAL `getUseInlineWidget?(): boolean` so existing test fixtures (which predate the field) continue to compile and exercise the legacy emit path.
- `src/contest/ContestFinalizer.ts` — `buildNoteBody` call site at line ~309 reads `settings.getUseInlineWidget?.() ?? false`. `ContestFinalizerSettings` interface gained the same optional getter for the same back-compat reason.

**`src/solve/starterCodeInjector.ts`** — `injectCodeSection` gains the same `fenceKind` short-circuit that already exists on `forceInjectCodeSection` (Phase 20 Plan 20-10). When `opts.fenceKind === 'leetcode-solve'` AND the note has at least one ` ```leetcode-solve ` fence opener, delegate to `rewriteFenceBody(current, 0, opts.starterCode.trim())`. Otherwise fall through to the legacy path. SSoT discipline preserved: REUSES `rewriteFenceBody` and `countLeetCodeSolveFenceOpeners` (no duplicate scan logic). Without this gate, the legacy path's recognized-langSlug scan would miss the v1.3 opener and graft a sibling ` ```python ` langSlug fence on top of the v1.3 fence — the same data-corruption pattern Plan 20-10 fixed for the force variant.

11 new tests under the `v13-emit` tag cover: `codeBlockForV13` shape + trim semantics; `buildNoteBody` transition gate (ON / OFF / omitted); `injectCodeSection` fenceKind dispatch (leetcode-solve+v13 fence → short-circuit; leetcode-solve+no fence → fall through; legacy mode preserves verbatim; omitted = legacy path).

## Verification Results

| Verification | Result |
|--------------|--------|
| `npm test -- --run tests/solve/codeExtractor.test.ts -t "frontmatter-source"` | ✓ 7 tests pass |
| `npm test -- --run tests/solve/noteTemplate-phase3.test.ts tests/solve/starterCodeInjector.test.ts -t "v13-emit"` | ✓ 11 tests pass |
| `npm run build` | ✓ TypeScript strict-mode green |
| `npm test` (full suite) | ✓ 2896 / 2902 passing (6 skipped pre-existing) |
| SSoT-bypass audit (D-extract-02) | ✓ no parallel `metadataCache.frontmatter['lc-language']` reads for run/submit |
| `grep -c '^export function codeBlockFor(' src/notes/NoteTemplate.ts` | ✓ 1 (Phase 22 boundary preserved) |
| `grep -c "fenceKind === 'leetcode-solve'" src/solve/starterCodeInjector.ts` | ✓ 6 (3 short-circuits × 2 functions, including comments) |

## Phase 22 Cleanup Locations (the lines/files Phase 22 deletes)

When `useInlineWidget=ON` becomes the default and migrations have run on all production notes, Phase 22 mechanically:

1. **`src/notes/NoteTemplate.ts`** — delete `codeBlockFor` (legacy emitter); rename `codeBlockForV13` → `codeBlockFor`; delete the `useInlineWidget` ternary in `buildNoteBody` (lines 240–242); delete the `useInlineWidget?: boolean` field from the `buildNoteBody` input type.
2. **`src/notes/NoteWriter.ts`** — delete `getUseInlineWidget?()` from `NoteWriterSettings`; remove the optional-chain at the `buildNoteBody` call site.
3. **`src/contest/ContestFinalizer.ts`** — same cleanup as NoteWriter.
4. **`src/solve/starterCodeInjector.ts`** — keep the `fenceKind` short-circuit on both `injectCodeSection` and `forceInjectCodeSection`; delete the legacy `stripFirstRecognizedCodeBlock` codepath when `useInlineWidget` is the only value path. Per CONTEXT D-emit-02, the body-only-replace primitive becomes the only path.
5. **`src/solve/codeExtractor.ts`** — delete Branch C of `extractFirstFencedBlock` (the legacy fence-tag branch); the function reduces to "if leetcode-solve, return frontmatter['lc-language'] || null".
6. **`src/solve/submissionOrchestrator.ts`** — delete the legacy markdown-body fallback at line 252-272; keep only the widget path. The `file` and `app` deps fields can also be deleted then.

## Deviations from Plan

### Auto-fixed (Rules 1–3)

**1. [Rule 3 - Blocking] Brittle text-window assertions in tests/ai/rerunAIReview.test.ts shifted out of range**

- **Found during:** Task 2 (full test suite run after threading 4 main.ts call sites)
- **Issue:** Two assertions used fixed-width slices (`SRC_MAIN.slice(idx, idx + 2000)` and `idx + 3000`) starting at `async runAIReview(`. Adding ~6 lines of frontmatter-threading code at the call site at line 2581 pushed `mergeAIReviewSection` and `onStreamComplete` past their respective windows.
- **Fix:** Widened windows to `idx + 2500` and `idx + 3500`. Both still scope strictly inside the `runAIReview` method body and end before any neighboring method's entry point. Added a comment citing Plan 21-03 Task 2 for the rationale.
- **Files modified:** `tests/ai/rerunAIReview.test.ts` (lines 67, 75)
- **Commit:** `00a7a75`

**2. [Rule 3 - Blocking] NoteWriterSettings missing getUseInlineWidget caused 8 test fixtures to fail at runtime**

- **Found during:** Task 3 (full test suite run after threading useInlineWidget through buildNoteBody → NoteWriter → settings)
- **Issue:** Adding `getUseInlineWidget(): boolean` as a REQUIRED field on `NoteWriterSettings` made every test fixture's settings shim throw `TypeError: this.settings.getUseInlineWidget is not a function` at runtime. 8 tests across 5 files failed.
- **Fix:** Made the getter OPTIONAL on the port (`getUseInlineWidget?(): boolean`) and updated the call site to use optional chaining with a `?? false` fallback. This pattern matches what we already did for `ContestFinalizerSettings` (which also got the same optional getter). Existing test fixtures get the legacy emit path (correct: they exercise legacy v1.2 note creation). Production wiring picks up the live setting via `SettingsStore.getUseInlineWidget()`.
- **Files modified:** `src/notes/NoteWriter.ts` (lines 92–101, 366)
- **Commit:** `466f7bf` (folded into Task 3 GREEN)

### Plan-clarified deviations

**Plan said "Branch C of starterCodeInjector test asserts no v1.3 fence is touched":** Implemented as expected — `fenceKind: 'legacy'` test asserts `'```leetcode-solve\nv13 body\n```'` is preserved verbatim (the legacy path's recognized-langSlug scan correctly passes the v1.3 fence through unchanged).

**Plan said "buildNoteBody requires new useInlineWidget arg":** Yes — added as optional with default `false`. Caller-chain ripple: `NoteWriter` (1 call site) + `ContestFinalizer` (1 call site). Both settings ports gained an optional `getUseInlineWidget?()` getter. **Important:** `useInlineWidget` is OPTIONAL on `buildNoteBody` (defaults to `false`) so direct-callers in tests like `noteTemplate-phase3.test.ts` continue to exercise the legacy emit path without modification.

## Threat Flags

None — Plan 21-03's threat surface (Pitfall 8 type-safety, Pitfall 9 emit gate, T-21-ssot-bypass, T-21-bytes-emit, T-21-fenceKind-default) is fully covered by the threat model the planner already enumerated. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced.

## Self-Check: PASSED

**Files:**
- ✓ `src/solve/codeExtractor.ts` — frontmatter arg + 3-branch dispatch (commit `779db59`)
- ✓ `src/solve/submissionOrchestrator.ts` — file?+app? deps + threaded call site (commit `00a7a75`)
- ✓ `src/main.ts` — 4 call sites threaded + SubmissionOrchestrator construction (commit `00a7a75`)
- ✓ `src/graph/KnowledgeGraphWriter.ts` — call site threaded (commit `00a7a75`)
- ✓ `src/notes/NoteTemplate.ts` — codeBlockForV13 + useInlineWidget gate (commit `466f7bf`)
- ✓ `src/notes/NoteWriter.ts` — settings port + call site (commit `466f7bf`)
- ✓ `src/contest/ContestFinalizer.ts` — settings port + call site (commit `466f7bf`)
- ✓ `src/solve/starterCodeInjector.ts` — fenceKind short-circuit on injectCodeSection (commit `466f7bf`)
- ✓ `tests/solve/codeExtractor.test.ts` — frontmatter-source suite (commit `fdc88dc`)
- ✓ `tests/solve/noteTemplate-phase3.test.ts` — codeBlockForV13 + buildNoteBody gate suite (commit `27027bd`)
- ✓ `tests/solve/starterCodeInjector.test.ts` — injectCodeSection fenceKind suite (commit `27027bd`)
- ✓ `tests/ai/rerunAIReview.test.ts` — text-window widening (commit `00a7a75`)

**Commits:**
- ✓ `fdc88dc` test(21-03): add failing tests for frontmatter-source dispatch
- ✓ `779db59` feat(21-03): widen extractFirstFencedBlock with frontmatter arg + 3-branch dispatch
- ✓ `00a7a75` feat(21-03): thread frontmatter through 6 extractFirstFencedBlock consumers + lift SubmissionDeps
- ✓ `27027bd` test(21-03): add failing v13-emit tests for codeBlockForV13 + injectCodeSection fenceKind
- ✓ `466f7bf` feat(21-03): add codeBlockForV13 emitter + fenceKind on injectCodeSection + buildNoteBody useInlineWidget gate
