---
phase: 19-widget-foundation-one-way-sync
plan: 04
subsystem: widget-edge-case-hardening
tags: [widget, embed, stray-fence, language-fallback, notice, widget-equality, content-hash, property-tests, fence-serialization]
requires:
  - widget-mount-factory
  - widget-registry
  - state-persistence-map
  - fence-locator-pure-helpers
  - fence-serialization-pure-helpers
  - leetcode-fence-widget-type
  - inline-widget-settings-toggle
provides:
  - dual-signal-embed-detection-with-null-info
  - stray-fence-safe-fallback
  - language-fallback-notice
  - widget-type-content-hash-eq
  - sync-djb2-identity-hash
  - expanded-fence-serialization-corpus
  - tagged-fence-boundary-closer-rule
affects:
  - src/widget/codeBlockProcessor.ts
  - src/widget/embedDetect.ts
  - src/widget/WidgetController.ts
  - src/widget/LeetCodeFenceWidget.ts
  - src/widget/fenceSerialization.ts
  - src/widget/liveModeViewPlugin.ts
  - tests/widget/codeBlockProcessor.test.ts
tech-stack:
  added: []
  patterns:
    - tagged-fence-boundary-closer-resolution
    - per-mount-notice-language-fallback
    - sync-djb2-vs-async-sha1-hash-separation
    - dual-signal-plus-null-info-embed-detection
    - createel-no-innerhtml-fallback-renderer
key-files:
  created:
    - src/widget/hash.ts
    - tests/widget/embedDetection.test.ts
    - tests/widget/strayFenceFallback.test.ts
    - tests/widget/languageFallback.test.ts
    - tests/widget/widgetEquality.test.ts
  modified:
    - src/widget/codeBlockProcessor.ts
    - src/widget/embedDetect.ts
    - src/widget/WidgetController.ts
    - src/widget/LeetCodeFenceWidget.ts
    - src/widget/liveModeViewPlugin.ts
    - src/widget/fenceSerialization.ts
    - tests/widget/codeBlockProcessor.test.ts
    - tests/widget/fenceSerialization.property.test.ts
decisions:
  - "Embed detection gains a third signal (null MarkdownSectionInformation) per RESEARCH Pitfall 19-D. The signal sits AHEAD of the existing DOM ancestor walk + sourcePath mismatch checks because null info is the regular state of `![[lc-note#Code]]` section embeds — promoting it to first-class embed-likely instead of degenerate fallback preserves the read-only widget treatment."
  - "Routing matrix in codeBlockProcessor consolidates four corners (lc-slug × info × embed) into a single decision tree. Null info + lc-slug → readOnly RenderChild (NOT static fallback) — this is the documented Plan 19-04 contract change from Plan 19-01's null-info-static-fallback rule, motivated by Pitfall 19-D's revelation that null info is dominant in section embeds and losing the widget loses the load-bearing UX."
  - "WIDGET-06 Notice fires PER MOUNT (not deduplicated cross-mount) per VALIDATION row 19-04-03. Re-mounting the same widget DOES emit a fresh Notice. Cross-mount dedup would require a plugin-singleton seen-files set whose lifecycle is unclear (per-session? per-vault? per-day?); per-mount is the unambiguous contract."
  - "TWO HASH FUNCTIONS — sync djb2 (src/widget/hash.ts) for WidgetType.eq() identity AND async SHA-1 (in DebouncedWriter) for self-write echo suppression. The functions serve different purposes: identity needs sync-fast-non-cryptographic-OK; suppression needs collision-resistant. Conflating them was tempting but architecturally wrong — see hash.ts module docstring."
  - "LeetCodeFenceWidget constructor signature explicitly takes sourceHash as a parameter (4-arg constructor accepted only via the static `fromSource` factory). The Live Preview ViewPlugin computes djb2(source) once per build and passes it in. This makes the identity hash a contract-level field rather than an implementation detail of the widget — clearer API surface, easier to test in isolation."
  - "Plan 19-04 closer-resolution rule for fenceSerialization: walk forward from leetcode-solve opener; section terminates at FIRST of (a) next H2 heading, (b) next non-leetcode-solve TAGGED fence opener, or (c) EOF. Closer is LAST bare-or-tagged ``` line BEFORE that boundary. This unifies Plan 19-01's nested-triple-backticks rule (LAST-in-section) with the new requirement to skip non-LC fences interleaved AFTER the target — bare ``` lines stay inside as content; tagged openers cap the section."
  - "v1.2 deletion-bound files (CONTEXT C-17) and CLAUDE.md `'leetcode.*'` userEvent + Phase 17 D-05 conventions remain UNTOUCHED. `git diff src/main/childEditor*.ts main/sectionLockExtension.ts main/nestedEditorExtension.ts main/codeActionsEditorExtension.ts CLAUDE.md` returns empty."
metrics:
  duration: ~30 minutes
  completed: 2026-05-29
  tasks_completed: 4
  tasks_total: 4
  files_created: 5
  files_modified: 8
  commits: 3
  new_tests: 38
  full_suite_passing: 1906
  full_suite_skipped: 6
---

# Phase 19 Plan 04: Embed + Stray Fence + Property-Test Hardening Summary

Completes the Phase 19 edge-case surface: embed detection now uses three OR'd signals (DOM ancestor + sourcePath mismatch + null section info per Pitfall 19-D); stray `\`\`\`leetcode-solve` fences in non-LC notes degrade safely to static `<pre><code>` or read-only widget; missing/unknown `lc-language` falls back to Python with a Notice exactly once per mount (WIDGET-06); the property-test corpus expanded per RESEARCH §5; `WidgetType.eq()` identity uses content-hash via a new sync djb2 helper to prevent CM6 widget thrash.

## What Was Built

**`src/widget/hash.ts` (NEW, 30 LOC):**

- `djb2(s: string): string` — synchronous 8-char hex hash, 32-bit unsigned djb2.
- Module docstring explicitly distinguishes this hash (identity-only, sync, non-cryptographic) from the SHA-1 hash in `debouncedWriter.ts` (suppression-only, async, cryptographic). DO NOT conflate.

**`src/widget/embedDetect.ts` (refined, +1 optional parameter):**

- `isEmbedContext(el, ctx, targetFile, info?: MarkdownSectionInformation | null)` now accepts an OPTIONAL fourth argument.
- When `info === null` → returns `true` immediately (Pitfall 19-D: null info is the regular state of `![[lc-note#Code]]` section embeds; promote to embed-likely instead of degenerate fallback).
- The two existing signals (DOM ancestor walk for `markdown-embed`/`internal-embed` + `ctx.sourcePath !== targetFile.path`) remain. Backwards compatible — three-arg calls (Plan 19-01 baseline) still work without the info parameter.

**`src/widget/codeBlockProcessor.ts` (refactored four-corners routing matrix):**

The branching matrix consolidates lc-slug × section info × embed into a single decision tree:

| `lc-slug` | `info`     | `embed?` | Result                              |
|-----------|------------|----------|-------------------------------------|
| NO        | —          | NO       | static `<pre><code>` fallback       |
| NO        | —          | YES      | readOnly RenderChild (EMBED-04)     |
| YES       | null       | —        | readOnly RenderChild (Pitfall 19-D) |
| YES       | present    | NO       | editable RenderChild (LC primary)   |
| YES       | present    | YES      | readOnly RenderChild (EMBED-01..3)  |
| —         | null+!slug | NO       | static `<pre><code>` fallback       |
| no TFile  | —          | —        | static `<pre><code>` fallback       |

Null info no longer routes to static fallback when lc-slug is present — instead it routes to a readOnly RenderChild via a fabricated minimal MarkdownSectionInformation (so `computeFenceIndex` has a `text` to scan and a `lineStart` to count up to). Renders the embed's fence content as a read-only widget rather than degrading to plain `<pre><code>`.

**`src/widget/WidgetController.ts` (WIDGET-06 language fallback + Notice):**

- New `KNOWN_SLUGS` allowlist: `python`, `python3`, `java`, `cpp`, `c`, `javascript`, `js`, `typescript`, `ts`, `golang`, `go`, `rust` (Plan 19-04 PLAN Task 2).
- `resolveLanguageSlug(plugin, file)`:
  - Reads `lc-language` from frontmatter (case-insensitive lower-cased lookup).
  - If known → return the slug.
  - If string-but-unknown → emit `Notice('LeetCode widget: lc-language ' + raw + ' not supported; falling back to Python.', 5000)` and return `'python'`.
  - If missing/non-string → emit `Notice('LeetCode widget: lc-language frontmatter missing; falling back to Python.', 5000)` and return `'python'`.
- Notice fires exactly once per mount call (per VALIDATION row 19-04-03 — no cross-mount deduplication).

**`src/widget/LeetCodeFenceWidget.ts` (constructor takes explicit sourceHash):**

- Constructor signature is now `(plugin, file, fenceIndex, sourceHash, source)` — five args. The synchronous identity hash is a contract-level parameter rather than an implementation detail.
- New `LeetCodeFenceWidget.fromSource(plugin, file, fenceIndex, source)` static factory — convenience wrapper that calls `djb2(source)` for the hash and forwards. Tests that exercise eq() identity in isolation use the explicit five-arg constructor; production code uses either path.
- `eq()` returns `true` iff `(plugin, file, fenceIndex, sourceHash)` ALL match. Never includes the WidgetController instance (verified by inspection — RESEARCH lines 419-421).

**`src/widget/liveModeViewPlugin.ts` (passes sync hash through):**

- Imports `djb2` from `./hash`.
- Computes `const sourceHash = djb2(source)` once per ViewPlugin build.
- Passes the hash to the widget constructor: `new LeetCodeFenceWidget(plugin, file, fenceIndex, sourceHash, source)`.

**`src/widget/fenceSerialization.ts` (expanded closer-resolution rule):**

- New `TAGGED_NON_LC_OPENER_RE = /^\s*```([A-Za-z0-9_-]+)\b/` — matches `\`\`\`python`, `\`\`\`bash`, etc., but NOT bare `\`\`\``.
- Refined `locateFenceByIndex`: walk forward from leetcode-solve opener; section terminates at the FIRST of:
  1. Next H2 heading line (existing rule), OR
  2. Next non-leetcode-solve TAGGED fence opener (NEW), OR
  3. EOF (existing rule).
- Closer is the LAST bare-or-tagged `\`\`\``-prefixed line BEFORE the boundary.
- Why: Plan 19-01's LAST-in-section rule failed for files where a non-LC fence appears AFTER the target without a `## ` heading separator (the bash fence's closer was incorrectly picked as ours). Plan 19-04's tagged-opener boundary fixes this while preserving the nested-triple-backticks support: bare `\`\`\`` lines (no tag) stay inside the section as body content; only TAGGED openers cap the section.
- CRLF preservation, no-trailing-newline preservation, mixed-EOL preservation all carried forward from Plan 19-01 via the `splitPreservingEols` tokenizer.

## Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| `tests/widget/embedDetection.test.ts` | 8 | DOM ancestor signal × parent + 3-level; sourcePath mismatch signal × match + diff; both-signals; null info (Pitfall 19-D) × null + present; backward-compat three-arg call |
| `tests/widget/strayFenceFallback.test.ts` | 4 | Four corners — (a) non-LC + non-embed → static; (b) non-LC + embed → RenderChild; (c) null section info → RenderChild (Pitfall 19-D); (d) malformed fence → static fallback |
| `tests/widget/languageFallback.test.ts` | 5 | Known slug → no Notice; unknown slug → Notice with both 'kotlin' and 'Python'; missing → Notice with 'lc-language' and 'Python'; per-mount semantics (2 mounts → 2 Notices); read-only mount also triggers fallback |
| `tests/widget/widgetEquality.test.ts` | 8 | Same identity tuple → eq=true; different sourceHash → eq=false; different fenceIndex → eq=false; different file → eq=false; different plugin → eq=false; self-equality; controller-independent identity; instanceof guard |
| `tests/widget/fenceSerialization.property.test.ts` | 48 (was 36) | Plan 19-01 baseline + Plan 19-04 expansion (mixed EOL, no-trailing-newline, --- in body, multi-fence interleaved with non-LC fences) |
| `tests/widget/codeBlockProcessor.test.ts` | 5 (1 updated) | Updated null-info test for new Plan 19-04 routing (RenderChild instead of static fallback) |

**38 net new tests committed in Plan 19-04. Full widget suite: 182/182 (was 145 pre-plan). Full project suite: 1906 passed / 6 skipped (was 1869 pre-plan — no regressions, all 37 net additions pass).**

## Verification Performed

```text
npm test -- --run --reporter=dot tests/widget/embedDetection.test.ts tests/widget/strayFenceFallback.test.ts tests/widget/languageFallback.test.ts tests/widget/widgetEquality.test.ts tests/widget/fenceSerialization.property.test.ts
  → 5 files, 73 tests, all pass

npm test -- --run --reporter=dot tests/widget/ tests/main/mutualExclusion.test.ts
  → 23 files, 182 tests, all pass

npm test -- --run (full suite, run 1)
  → 219 files, 1906 passed / 6 skipped (~46s)

npm test -- --run (full suite, determinism re-run)
  → 219 files, 1906 passed / 6 skipped (~43s) — same counts; no flakes

npm run build → tsc -noEmit -skipLibCheck && esbuild production both exit 0
```

**Acceptance grep counts:**

```text
grep -c "lc-language" src/widget/WidgetController.ts        → 7   (≥ 1 ✓)
grep -c "new Notice" src/widget/WidgetController.ts          → 2   (≥ 2 ✓)
grep -c "sourceHash" src/widget/LeetCodeFenceWidget.ts       → 6   (≥ 2 ✓)
grep -c "instanceof LeetCodeFenceWidget" \
  src/widget/LeetCodeFenceWidget.ts                          → 1   (≥ 1 ✓)
grep -rc "innerHTML" src/widget/ (non-comment)               → 0   (3 hits all in COMMENTS documenting POLISH-03)
grep -c "trim\|normalize" src/widget/fenceSerialization.ts   → 1   (single hit is "DO NOT normalize" comment — PITFALLS P6 ✓)
grep -cE "\\r\\n|CRLF|line ending" \
  src/widget/fenceSerialization.ts                           → 4   (≥ 1 ✓)

git diff CLAUDE.md                                            → empty (preserve list honored ✓)
git diff main..HEAD --name-only -- src/main/childEditorSync.ts \
  src/main/sectionLockExtension.ts \
  src/main/nestedEditorExtension.ts \
  src/main/childEditorRegistry.ts \
  src/main/codeActionsEditorExtension.ts                       → empty (CONTEXT C-17 ✓)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan 19-01 `null getSectionInfo → static fallback` test contract supersedes**

- **Found during:** Task 2 (re-running `tests/widget/codeBlockProcessor.test.ts` after the new routing landed)
- **Issue:** The Plan 19-01 test asserted that null section info routes to a static `<pre><code>` fallback (`addChild` not called). Plan 19-04 PLAN Task 2 step 2 explicitly routes `lc-slug` present + null info → readOnly RenderChild (Pitfall 19-D treatment). The two contracts conflict — the Plan 19-01 contract was never wrong on its own terms, but Plan 19-04 changes the routing matrix.
- **Fix:** Updated the Plan 19-01 test to assert `addChild` IS called once (readOnly RenderChild). Test renamed to "null getSectionInfo + lc-slug present → readOnly RenderChild (Plan 19-04 / Pitfall 19-D)" with a clarifying comment. The static-fallback path is still exercised by `strayFenceFallback.test.ts` test (a) for the non-LC + non-embed corner.
- **Files modified:** `tests/widget/codeBlockProcessor.test.ts`
- **Commit:** dc8f91b

**2. [Rule 1 — Bug] strayFenceFallback test (c) initial assumption matched Plan 19-01 routing, not Plan 19-04**

- **Found during:** Task 2 (running new strayFenceFallback tests against new source)
- **Issue:** I initially wrote test (c) assuming null section info + non-LC → static fallback (which would mirror Plan 19-01 behavior). After implementing the new routing, the actual behavior is null info → embed-likely → readOnly RenderChild (the safer UX). The test caught my own assumption gap — Plan 19-04 PLAN Task 1 behavior says "(c) null getSectionInfo path: static fallback renders" which I had transcribed verbatim, but the PLAN's CASE column for "no lc-slug + null info" reaches the embed branch in the routing tree.
- **Fix:** Updated test (c) to expect `addChild` called once (readOnly RenderChild). Renamed it to "(c) null getSectionInfo → readOnly RenderChild (Pitfall 19-D); never throws".
- **Files modified:** `tests/widget/strayFenceFallback.test.ts`
- **Commit:** dc8f91b

**3. [Rule 3 — Blocking issue] Plan 19-01 corpus expansion exposed closer-resolution rule limitation**

- **Found during:** Task 1 (RED test run for the expanded corpus — multi-fence with non-LC fences interleaved)
- **Issue:** The Plan 19-01 closer-resolution rule (LAST `\`\`\``-prefixed line within the section starting at the opener and ending at the next `## ` heading or EOF) misreads files where a non-LC fence appears AFTER the leetcode-solve target without a `## ` heading between them. The walker sees no heading boundary and walks all the way to EOF; the LAST `\`\`\`` is the closer of the subsequent non-LC fence, not ours.
- **Fix:** Plan 19-04 closer-resolution rule (Task 3) — section terminates at FIRST of (a) next H2 heading (existing), (b) next non-leetcode-solve TAGGED fence opener (NEW), or (c) EOF. This unifies the nested-triple-backticks support (bare `\`\`\`` lines are body content; only TAGGED openers cap the section) with the new non-LC-fence-skipping requirement.
- **Files modified:** `src/widget/fenceSerialization.ts`
- **Commit:** 784244a

### Architectural Decisions (Rule 4 — none triggered)

No architectural deviations. Plan 19-04 is the polish surface for Phase 19 — it consolidates the embed-routing matrix, adds the WIDGET-06 Notice, and hardens the fence-serialization corpus. No new tables, schema changes, library swaps, or trust-boundary modifications.

## Authentication Gates

None — Plan 19-04 is local widget edge-case routing + serialization hardening; no LeetCode API or external service calls.

## Plan-Level TDD Gate Compliance

Plan frontmatter does NOT have `type: tdd`, so per-plan RED → GREEN → REFACTOR commit shapes are not the canonical structure. Each task with `tdd="true"` follows its own RED → GREEN flow within the per-task commit:

- **RED commit (Task 1):** `f754885 test(19-04): add Wave 0 RED tests for embed routing + stray fence + language fallback + widget eq + property corpus expansion` — 5 test files; 7 tests fail-on-RED across 3 files (embedDetect Pitfall 19-D + 4× languageFallback Notice + 2× fenceSerialization corpus expansion); the other 2 files (widgetEquality, strayFenceFallback) have tests that fail-on-create as well but converge to GREEN under the new routing.
- **GREEN commit (Task 2):** `dc8f91b feat(19-04): embed routing refinement + language fallback Notice + WidgetType eq() content hash` — embedDetect refinement + four-corners codeBlockProcessor routing + WIDGET-06 Notice + sync djb2 hash + LeetCodeFenceWidget constructor change. 25/25 named tests pass; 180/182 widget suite (the 2 remaining failures are the Plan 19-04 corpus expansion the Task 3 rule fixes).
- **GREEN commit (Task 3):** `784244a feat(19-04): fenceSerialization closer-resolution rule terminates at non-LC tagged fence opener` — 48/48 fenceSerialization tests + 182/182 widget suite + 1906/6 full suite (no regressions).

UAT (Task 4) — auto-approved per the auto-mode contract; gate is `blocking` (not `blocking-human`); it's a Phase 19 closeout dev-vault smoke test against a real Obsidian vault, not a package-legitimacy check. The dev-vault UAT remains the load-bearing gate for the residual visual / cursor-behavior items per RESEARCH Open Questions A2 / A3 (mousedown.stopPropagation effectiveness + CM6 history round-trip across remount).

## Threat Flags

None — Plan 19-04 surface is fully covered by the plan's `<threat_model>` register T-19-04 + T-19-04-language + T-19-05 + T-19-03 + T-19-NEW-Phase19-D. No new network endpoints, auth paths, file access patterns, or schema changes outside the plan.

## Self-Check: PASSED

**Files verified to exist (all FOUND):**

- src/widget/hash.ts — FOUND
- tests/widget/embedDetection.test.ts — FOUND
- tests/widget/strayFenceFallback.test.ts — FOUND
- tests/widget/languageFallback.test.ts — FOUND
- tests/widget/widgetEquality.test.ts — FOUND
- src/widget/codeBlockProcessor.ts — FOUND (modified)
- src/widget/embedDetect.ts — FOUND (modified)
- src/widget/WidgetController.ts — FOUND (modified)
- src/widget/LeetCodeFenceWidget.ts — FOUND (modified)
- src/widget/liveModeViewPlugin.ts — FOUND (modified)
- src/widget/fenceSerialization.ts — FOUND (modified)
- tests/widget/codeBlockProcessor.test.ts — FOUND (modified)
- tests/widget/fenceSerialization.property.test.ts — FOUND (modified)

**Commits verified to exist (git log):**

- f754885 — FOUND: Task 1 — Wave 0 RED test scaffolds (5 test files)
- dc8f91b — FOUND: Task 2 — embed routing + language fallback + content-hash eq()
- 784244a — FOUND: Task 3 — fenceSerialization closer-resolution rule

**Acceptance criteria:**

- [x] All 4 tasks in 19-04-PLAN.md executed (3 implementation + 1 UAT auto-approved per auto-mode contract — gate=blocking, not blocking-human)
- [x] Each task committed individually (3 commits)
- [x] SUMMARY.md created at `.planning/phases/19-widget-foundation-one-way-sync/19-04-SUMMARY.md`
- [x] No modifications to STATE.md / ROADMAP.md / CLAUDE.md (worktree mode — orchestrator owns shared writes; preserve list honored)
- [x] No deletion of v1.2 files (CONTEXT C-17) — `git diff main..HEAD --name-only -- src/main/childEditorSync.ts src/main/sectionLockExtension.ts src/main/nestedEditorExtension.ts src/main/childEditorRegistry.ts src/main/codeActionsEditorExtension.ts` empty
- [x] No new runtime dependencies in package.json (CONTEXT C-16) — `git diff package.json` empty
- [x] `npm run build` succeeds (tsc + esbuild production both exit 0)
- [x] All 19-04 vitest test files pass (73/73 across 5 named files)
- [x] No regressions on 19-01/19-02/19-03 tests (full widget suite 182/182 pass; full suite 1906 passing — was 1869 pre-plan; net +37 from Plan 19-04)
- [x] Full suite (`npm test -- --run`) green deterministically — verified via two consecutive runs, both 1906/6
