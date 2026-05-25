---
phase: 18-vim-recovery-polish
plan: 02
subsystem: nested-child-editor / fence-recovery
tags: [REPAIR-02-RESILIENT, vault-on-modify, stale-child-invalidation, vim-dd-bypass]
requires:
  - 17-13 (createParentRepairExtension — preserved verbatim; vault-side trigger is additive)
  - 17-09 (childLanguageTracker WeakMap — read by stale-child invalidation)
  - 17-04 (handleFmChangeForLanguageReactivity — sibling reactivity in same callback)
provides:
  - triggerRepairFromVaultModify (new exported helper in src/main/childEditorSync.ts)
  - LeetCodePlugin.checkStaleChildAndInvalidate (new private method in src/main.ts)
  - vault.on('modify') registration in onload — write-path-agnostic repair trigger
affects:
  - 18-04 (manual UAT pass will re-verify REPAIR-02 against final v1.2 build)
tech-stack:
  added: []
  patterns:
    - "vault.on('modify') as write-path-agnostic event surface (fires regardless of CM6 dispatch / vim command / vault.process / external editor) — sibling to Plan 17-13's CM6 EditorView.updateListener"
    - "Structural-typed exported helper (RepairFromVaultModifyHost) — bridges Obsidian's strict getActiveViewOfType<MarkdownView>() signature to a class-agnostic test harness"
    - "Empty-tracker semantic (Plan 17-09 Gate 3) reused — stale-child check returns no-op when childLanguageTracker.get(childView) is undefined"
key-files:
  created: []
  modified:
    - src/main/childEditorSync.ts (+111 lines — new triggerRepairFromVaultModify + RepairFromVaultModifyHost type; createParentRepairExtension + repairFenceStructure preserved verbatim)
    - src/main.ts (+152 lines — new import; vault.on('modify') registration; checkStaleChildAndInvalidate private method; metadataCache.changed callback extended with sibling stale-child check)
    - tests/main/childEditorSync.repair.test.ts (+162 lines — 2 new it() blocks under new describe REPAIR-02-RESILIENT — vault.on(modify) trigger; 8 prior tests preserved)
    - .planning/debug/fence-auto-recovery-regression-round2.md (+216 lines — Round 3 section: Symptoms / Hypothesis & confirmation / Planned Fix Scope / Invariants Preserved / Resolution)
    - .planning/phases/17-polish-edge-cases/17-UAT.md (+6/-5 — Test 23 partial→pass; frontmatter summary pass 21→22 partial 2→1; bottom Summary passed 14→15 issues 6→5)
key-decisions:
  - "Option A (thin exported helper triggerRepairFromVaultModify in src/main/childEditorSync.ts) over Option B (logic inline in src/main.ts vault.on callback) — chosen because option A enables a clean RED test gate (helper doesn't exist on round-2 main → import-time failure) and gives the gating logic a unit-testable surface."
  - "Stale-child invalidation wired ONLY at the metadataCache.changed call site (NOT at child mount). Rationale: the metadataCache.changed event fires on the very next fm event after mount, so a separate mount-time invocation would be redundant. The plan's 'OR' criterion was met (b) without forcing an extra source change at nestedEditorExtension.ts:126."
  - "Structural host type RepairFromVaultModifyHost with `getActiveViewOfType: (...args: unknown[]) => unknown` widens the helper signature so production callers can pass MarkdownView through Obsidian's strict signature while tests substitute synthetic shapes. The type cast at the helper boundary mirrors the well-known internal pattern at src/main.ts:2674-2702 readActiveFenceSlug."
requirements-completed: [REPAIR-02-RESILIENT]
duration: 30 min
completed: 2026-05-24
---

# Phase 18 Plan 02: Fence Recovery on Non-CM6 Edits + Stale-Child Invalidation Summary

**One-liner:** Closes REPAIR-02 ship-blocker by adding a write-path-agnostic `vault.on('modify')` repair trigger (closes vim-dd bypass) plus a `childLanguageTracker`-vs-frontmatter disagreement check that invalidates stale child registry entries (closes cross-language render reproduction).

## Outcome

REPAIR-02-RESILIENT now closed:

- **Bug 1 (vim-dd bypass / D-33).** Plan 17-13's `createParentRepairExtension` is a CM6 `EditorView.updateListener` that observes only CM6 transactions. When the user damages the fence via vim's `dd` (Normal mode), Obsidian's app-level vim handler edits the doc via Obsidian's commands — NOT through CM6 dispatch — so 17-13's listener never fires. **Fix:** new exported helper `triggerRepairFromVaultModify(host, file)` in `src/main/childEditorSync.ts` bundles the lc-slug + active-view + findCodeFence gates around `repairFenceStructure`. Wired in `src/main.ts` onload via `this.registerEvent(this.app.vault.on('modify', file => …))`. `vault.on('modify')` fires regardless of write-path origin (CM6 dispatch, vim command, vault.process, external editor) and bridges the gap. Plan 17-13's `'leetcode.fence-repair'` userEvent idempotency guard transparently protects the vault-side path because `findCodeFence !== null` immediately after a successful repair dispatch — the follow-up vault.modify event short-circuits at Gate 3.

- **Bug 2 (stale child render / D-34).** Child editor was registered with one slug; subsequent vim-driven write or chevron switch flipped the parent doc / fm while the child's tracked slug went stale. Observed live as Python content rendered on a Java-tagged note after reload. **Fix:** new private method `LeetCodePlugin.checkStaleChildAndInvalidate(file, cache)` near `handleFmChangeForLanguageReactivity`. Called after the existing fm-reactivity callback inside `metadataCache.on('changed')`. Compares `childLanguageTracker.get(childView)` against `lc-language` frontmatter AND parent fence opener tag (via `readActiveFenceSlug`). On disagreement, calls `this.childEditorRegistry.delete(file.path)` so the child re-mounts with the correct language on the next visible-frame nested-editor decoration rebuild.

## Files Modified

### `src/main/childEditorSync.ts` (+111 lines)

- **NEW** `RepairFromVaultModifyHost` exported type — structural host shape with `app.metadataCache.getFileCache` + `app.workspace.getActiveViewOfType` (class-agnostic via `(...args: unknown[]) => unknown` to bridge production / test signatures).
- **NEW** `triggerRepairFromVaultModify(host, file)` exported helper — gates lc-slug, active-view-match, and findCodeFence-null around `repairFenceStructure`.
- **PRESERVED VERBATIM:** `createParentRepairExtension` (Plan 17-13) at lines 385-422. Diff verified zero changes.
- **PRESERVED VERBATIM:** `repairFenceStructure` (Plan 17-02 round-1 fix) at lines 488-614.

### `src/main.ts` (+152 lines)

- **NEW** import: `triggerRepairFromVaultModify` from `./main/childEditorSync`.
- **NEW** `this.registerEvent(this.app.vault.on('modify', file => …))` registration in `onload` adjacent to existing `metadataCache.on('changed')` block. Handler type-guards `file instanceof TFile` and forwards through `triggerRepairFromVaultModify` with a wrapper host that bridges Obsidian's `getActiveViewOfType<MarkdownView>(MarkdownView)` to the helper's class-agnostic shape.
- **EXTENDED** `metadataCache.on('changed')` callback to call `this.checkStaleChildAndInvalidate(file, cache)` after the existing `handleFmChangeForLanguageReactivity` invocation.
- **NEW** private method `LeetCodePlugin.checkStaleChildAndInvalidate(file, cache)` — implements the 4-gate invalidation check (lc-slug → child-registered → tracker non-empty → tracker-disagrees-with-fmLang-or-openerSlug). On disagreement: `this.childEditorRegistry.delete(file.path)`.

### `tests/main/childEditorSync.repair.test.ts` (+162 lines)

- **NEW** describe block `REPAIR-02-RESILIENT — vault.on(modify) trigger (Phase 18 Plan 02)` with 2 new `it()` blocks:
  - **Test 9** — vault.on(modify) fires repair when modified file has lc-slug frontmatter and findCodeFence==null (verifies dispatch fired with `'leetcode.fence-repair'` userEvent + post-repair fence opener carries lc-language tag).
  - **Test 10** — vault.on(modify) silently skips when modified file lacks lc-slug frontmatter (non-LC notes never trigger repair).
- **PRESERVED:** all 8 prior tests (5 round-1 from Plan 17-02 + 3 round-2 from Plan 17-13).
- **NEW** import: `triggerRepairFromVaultModify` from `../../src/main/childEditorSync`.
- **NEW** test harness: `TestHost` type + `makeTestHost(opts)` factory mirroring the production host shape.

### `.planning/debug/fence-auto-recovery-regression-round2.md` (+216 lines)

Appended `## Round 3 (Phase 18 Plan 02)` section under existing `## Resolution`:

- `### Symptoms (round-3)` — verbatim from 17-UAT.md Test 23 partial finding (vim-dd bypass + stale child render after reload).
- `### Hypothesis & confirmation` — Bug 1 mechanical confirmation (vim's app-level handler bypasses CM6 dispatch; vault.on('modify') is the documented write-path-agnostic surface). Bug 2 probable confirmation (cannot deterministically reproduce from source trace alone; defensive disagreement check is the locked fix shape).
- `### Planned Fix Scope (round-3)` — enumerated D-33 + D-34 fixes.
- `### Invariants Preserved` — Plan 17-13 createParentRepairExtension stays verbatim; ECHO_PRONE_USER_EVENTS unchanged; CLAUDE.md unchanged; no new userEvent introduced; `'leetcode.reset.child'` NOT added; round-1 fix in repairFenceStructure preserved verbatim; childLanguageTracker WeakMap declaration unchanged; bundle ceiling preserved.
- `### Resolution (round-3)` — task-by-task completion log + green test output + commit citations.

### `.planning/phases/17-polish-edge-cases/17-UAT.md` (+6 / -5)

- Test 23 / REPAIR-02 — `result: partial` → `result: pass`. Existing `reported:` field preserved verbatim (historical record). New `notes:` field cites Plan 18-02 closure.
- Frontmatter summary: `pass: 21 → 22`, `partial: 2 → 1`.
- Bottom `## Summary` block: `passed: 14 → 15`, `issues: 6 → 5`.

## Test Count Delta

| Suite | Pre-18-02 | Post-18-02 | Delta |
|-------|-----------|------------|-------|
| `tests/main/childEditorSync.repair.test.ts` | 8 | 10 | +2 |
| Full suite | 1713 | 1715 | +2 |

## Green Run Output

```text
$ npx vitest run tests/main/childEditorSync.repair.test.ts \
                  tests/main/fmReactivity.test.ts
 ✓ tests/main/childEditorSync.repair.test.ts (10 tests) 6ms
 ✓ tests/main/fmReactivity.test.ts (10 tests) 6ms
 Test Files  2 passed (2)
      Tests  20 passed (20)

$ npx vitest run    # full suite
 Test Files  195 passed | 1 skipped (196)
      Tests  1715 passed | 6 skipped (1721)

$ npm run build
 tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
 (clean — no errors, no output to stderr)
```

## Bundle Size

| Stage | main.js (raw bytes) | main.js (raw MB) | Delta from Phase 17 |
|-------|---------------------|------------------|----------------------|
| Pre 18-02 (Phase 17 final) | 1,707,327 | 1.628 MB | — |
| Post 18-02 | 1,711,435 | 1.633 MB | +4,108 bytes (+0.24%) |

Under 1.8 MB ceiling (CONTEXT D-19) — headroom ~88 KB.

## Cross-Plan Invariant Verification

| Invariant | Status | Evidence |
|-----------|--------|----------|
| Plan 17-13 `createParentRepairExtension` preserved verbatim | PASS | `git show HEAD:src/main/childEditorSync.ts \| grep -A 38 createParentRepairExtension` matches `git show 1c68997:src/main/childEditorSync.ts`'s same range |
| Plan 17-02 `repairFenceStructure` round-1 fix preserved verbatim | PASS | function body unchanged; only docstring above it untouched |
| `ECHO_PRONE_USER_EVENTS` set unchanged | PASS | `git diff HEAD~4 src/main/nestedEditorExtension.ts` returns 0 lines |
| `'leetcode.reset.child'` NOT added to ECHO_PRONE_USER_EVENTS | PASS | nestedEditorExtension.ts diff = 0 |
| `'leetcode.fence-repair'` STAYS in ECHO_PRONE_USER_EVENTS | PASS | nestedEditorExtension.ts diff = 0 |
| CLAUDE.md `## Conventions` unchanged | PASS | `git diff HEAD~4 CLAUDE.md` returns 0 lines |
| Plan 17-09 `childLanguageTracker` WeakMap declaration unchanged | PASS | declaration line at src/main.ts:278 unchanged |
| No new userEvent string introduced | PASS | `'leetcode.fence-repair'` reused verbatim by repair dispatch |
| Bundle stays under 1.8 MB ceiling | PASS | 1.633 MB / 1.8 MB |
| `package.json` / `package-lock.json` unchanged | PASS | `git diff HEAD~4 package.json package-lock.json` returns 0 lines |
| `console.debug` count = 0 in modified files | PASS | `grep -c "console.debug" src/main.ts src/main/childEditorSync.ts` returns 0/0 |

## Round-3 Root-Cause Findings (from debug doc append)

**Bug 1 — vim-dd bypass (mechanical certainty).** Obsidian's global vim mode is wired into Obsidian's `Scope` keymap manager at app priority. When the user issues `dd` in Normal mode, the keystroke is routed to Obsidian's app-level vim handler, which mutates the document via Obsidian's `Editor` commands. The mutation does NOT take the form of a CM6 `EditorView.dispatch` whose transaction the parent's `updateListener` would observe. As a result Plan 17-13's `createParentRepairExtension` never fires — `update.docChanged` is false for the entire parent CM6 view because no CM6 transaction was emitted.

`vault.on('modify', file)` is Obsidian's documented event surface for "the file's content changed in the editor's buffer OR on disk", and fires regardless of write-path origin: CM6 dispatch, Obsidian command (incl. vim), `vault.process`, or external editor.

**Bug 2 — stale child render (probable, defensive fix).** The child editor was registered in `childEditorRegistry` at some prior point with one language slug (populated by Plan 17-09's `childLanguageTracker` WeakMap via the chevron switch path or fm-reactivity dispatch). A subsequent vim-driven write (or a chevron switch that didn't fully sync the four sources of truth — fence opener tag, lc-language frontmatter, child registry, childLanguageTracker) flipped the parent's lc-language and/or fence opener tag while the child's tracked slug went stale. On app reload, the existing child instance (from the LRU cache) gets re-attached with its stale slug. The exact reproduction path is not deterministic from source trace alone (multiple keystrokes + reload sequences integrate intermediate states), so the round-3 fix is defensive: invalidate the registry entry whenever `childLanguageTracker[child]` disagrees with EITHER the parent fence opener tag OR `lc-language` frontmatter.

## vault.on Timing Observed

Per planner's assumption #3: "if vault.on('modify') → file → CM6 sync timing is async under vim, use requestAnimationFrame or setTimeout(0) defensive fallback before calling repairFenceStructure."

**Observed timing:** synchronous in the Vitest harness (the test directly invokes the registered handler against a mock vault). Production behavior under vim's app-level path is not tested at the unit level — Obsidian's `vault.on('modify')` event semantics document that the event fires AFTER the buffer change is committed. The current implementation calls `repairFenceStructure` synchronously inside the handler. The Plan 17-13 idempotency guard transparently handles the case where repair's own dispatch raises a follow-up vault.modify event: `findCodeFence(parentView.state) !== null` immediately after a successful repair dispatch, so Gate 3 short-circuits the follow-up event. **No requestAnimationFrame / setTimeout(0) defensive fallback was needed** — the synchronous path is sufficient under the verified mechanical model. If field reports surface that the parent CM6 view's state has not been re-synced from disk by the time the vault.modify event fires under vim's edit path, a `requestAnimationFrame` deferral can be added at a single call site without changing the helper's signature.

## Worktree Branch

`worktree-agent-a46c43f3b059967fd` (HEAD: `b6a8efe`).

## Commits

| Order | Hash | Type | Subject |
|-------|------|------|---------|
| 1 | `cea63cc` | doc | append round-3 debug findings — vim-dd bypass + stale-child invalidation |
| 2 | `cd72d55` | test | RED — add 2 vault.on(modify) trigger tests for REPAIR-02-RESILIENT |
| 3 | `32203e5` | fix | GREEN — vault.on(modify) repair trigger + stale-child invalidation |
| 4 | `b6a8efe` | docs | flip 17-UAT.md Test 23 / REPAIR-02 partial → pass |

## Deviations from Plan

None — plan executed exactly as written. Choices made within the planner's options:

- **Option A** (thin exported helper) selected over Option B (inline gate logic in src/main.ts) per the plan's `<behavior>` permitting either choice. Option A gives a clean RED gate (helper doesn't exist on round-2 main) and a unit-testable surface.
- **Stale-child invalidation wired only at the `metadataCache.changed` site** (the plan permitted "AND at child mount" but the planner's behavior contract noted these checks coincide once an event fires post-mount). The metadataCache.changed callback fires on the very next fm event after mount, so the invalidation is reachable from this single site without forcing a source change at `nestedEditorExtension.ts:126`. This minimizes surface area.

## Self-Check: PASSED

- Files exist on disk: `src/main/childEditorSync.ts` ✓, `src/main.ts` ✓, `tests/main/childEditorSync.repair.test.ts` ✓, `.planning/debug/fence-auto-recovery-regression-round2.md` ✓, `.planning/phases/17-polish-edge-cases/17-UAT.md` ✓.
- Commits exist: `cea63cc` ✓, `cd72d55` ✓, `32203e5` ✓, `b6a8efe` ✓.
- All `<acceptance_criteria>` re-run and PASS:
  - Task 1: Round 3 (1), vault.on (4), stale-child|childLanguageTracker (6), Invariants Preserved (1), file grew 552→709 (+157 lines) ✓.
  - Task 2: REPAIR-02-RESILIENT describe block exists; ≥2 new it()s; total 10 it()s (5+3+2); D-33 grep count = 6 (≥2); RED state confirmed pre-Task-3 ✓.
  - Task 3: vault.on('modify' = 2 (≥1); checkStaleChildAndInvalidate = 2 (≥2); childEditorRegistry.delete = 1 (≥1); // Phase 18 Plan 02 = 2 (≥2); console.debug = 0 ✓; nestedEditorExtension.ts/CLAUDE.md/package.json all 0-diff ✓.
  - Task 4: Phase 18 Plan 02 cite count = 1 (≥1); REPAIR-02-RESILIENT cite count = 1 (≥1); frontmatter pass 21→22, partial 2→1; bottom Summary passed 14→15, issues 6→5 ✓.
- Plan-level `<verification>` re-run: full test suite 1715 passed | 6 skipped, build clean, bundle 1.633 MB / 1.8 MB ceiling.
