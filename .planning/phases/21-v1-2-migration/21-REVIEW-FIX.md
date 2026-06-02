---
phase: 21
padded_phase: "21"
fixed_at: 2026-06-01T22:05:00Z
review_path: .planning/phases/21-v1-2-migration/21-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 21: Code Review Fix Report

**Fixed at:** 2026-06-01T22:05:00Z
**Source review:** .planning/phases/21-v1-2-migration/21-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 11
- Fixed: 11
- Skipped: 0
- Info findings (5): out of scope, not addressed

**Verification:**
- `npm run build` -> exit 0 (clean: tsc --noEmit clean, esbuild production clean)
- `npx vitest run --no-file-parallelism` -> 3089 passed, 7 skipped, 0 failed
  (parallel runs showed 2-5 intermittent timeouts in unrelated files — known
  pre-existing 5s-timeout-on-cold-start parallelism flakes; all four flaky
  files pass when run in any subset.)

## Fixed Issues

### CR-01: applyPeerSync silently overwrites pane B's in-flight uncommitted typing

**Files modified:** `src/widget/WidgetController.ts`
**Commit:** `ddd9332`
**Applied fix:** Added an early-return guard at the top of `applyPeerSync` —
`if (this.writer?.hasPending() === true) return;`. When this peer's
DebouncedWriter has a pending flush, the originator's body is NOT applied,
so pane B's in-memory uncommitted edits survive. Pane B's flush (when it
fires) sees disk drift and routes through the existing
selfWriteSuppression hash-mismatch fail-safe path. NOTE: marked for human
verification — this is a logic-level race fix; integration validation
requires a real Obsidian split-pane scenario.

### CR-02: firstMatch selection in modify handler is iteration-order-dependent

**Files modified:** `src/main.ts`
**Commit:** `bb299c3`
**Applied fix:** After collecting `allMatching` from the widget registry,
filter to editable controllers (`!c.readOnly && !c.isEmbed`) and pick
`editableMatching[0] ?? allMatching[0]!` as `firstMatch`. The Pitfall P2
hash gate and the external-edit conflict-modal path now read from an
editable representative whose `currentDocHash` is actually maintained
and whose `writer.hasPending()` returns the true in-flight state. The
`peerLikes` array passed to `routePeerSync` already filters correctly
inside the helper, so only the `firstMatch` consumers needed patching.

### CR-03: leetcodeRefreshAnnotation dynamic require() is dead-code defense

**Files modified:** `src/main.ts`
**Commit:** `6dea827`
**Applied fix:** Replaced the try/require shim and `let
leetcodeRefreshAnnotation: ... | undefined;` block with a static import
at the top of main.ts:
```ts
import { leetcodeRefreshAnnotation } from './widget/liveModeBannerStateField';
```
The rerender callback simplifies to two layers (rerenderReadingModePanes
+ leaf walk + cm.dispatch) without the soft-dependency `if
(leetcodeRefreshAnnotation)` wrapper. Build verified clean — esbuild
treats the import statically.

### CR-04: Post-write rerender races CM6 hydration on freshly-opened leaves

**Files modified:** `src/notes/NoteWriter.ts`,
`tests/notes/NoteWriter.starter-retrofit.test.ts`
**Commit:** `a56b9fa`
**Applied fix:** Replaced the synchronous body of
`fireRerenderAfterNoteWritten` with a two-rAF-tick deferred fire. Tick #1
aligns with browser layout; tick #2 guarantees CM6's initial transaction
has flushed and Obsidian's preview render has run. Sync fallback when
`window.requestAnimationFrame` is undefined preserves non-browser test
environments. Tests R6.1, R6.2, R6.3, R6.4, R6.5, R6.6 updated to
`await flushTwoRafTicks()` before asserting on the spy. happy-dom
provides rAF so the test environment matches production timing.
NOTE: marked for human verification — this is a timing-level fix in a
flow that depends on Obsidian's internal `view.editor.cm` hydration
sequence; integration validation requires running the new-note flow
inside a real Obsidian instance.

### WR-01: peekOriginator does not delete TTL-expired entries

**Files modified:** `src/widget/selfWriteSuppression.ts`
**Commit:** `65bc201`
**Applied fix:** Added `this.map.delete(path)` in the TTL-expired branch of
`peekOriginator` so an orphan armed entry is garbage-collected on read.
Live-entry semantics are unchanged: `peekOriginator` remains
non-mutating for non-expired entries; `tryConsume` is still the sole
mutator for live entries. Updated the docstring to document the
"expired entries are GC'd here" exception.

### WR-02: applyPeerSync swallows dispatch failure silently

**Files modified:** `src/widget/WidgetController.ts`
**Commit:** `177acd2`
**Applied fix:** Replaced bare `catch {}` after `view.dispatch(...)` with
`catch (err) { logger.debug('WidgetController.applyPeerSync: dispatch
failed', { file, registryKey, err }); return; }`. Added a `logger`
import from `../shared/logger`. The defensive 'view may be in teardown'
early-return is preserved.

### WR-03: fenceMigrator mock declares phantom export not consumed by codeBlockProcessor

**Files modified:** `tests/widget/codeBlockProcessor.phase21.test.ts`
**Commit:** `e20edc3`
**Applied fix:** Removed `repairCandidateSpy` from the `vi.hoisted` block,
removed `isFrontmatterRepairCandidate: repairCandidateSpy` from the
`vi.mock('../../src/widget/fenceMigrator')` factory, and removed the
now-dead `repairCandidateSpy.mockClear()` /
`repairCandidateSpy.mockReturnValue(false)` calls in `beforeEach`. The
production module imports only `isMigrationCandidate`,
`migrateLegacyFenceIfNeeded`, `repairFrontmatterIfNeeded` — the phantom
spy was hiding a future-refactor drift signal.

### WR-04: routePeerSync does not handle "originator not present in controllers"

**Files modified:** `src/widget/peerSyncRouting.ts`
**Commit:** `6f3f2a5`
**Applied fix:** Added an `originatorPresent` check after the
`editableSameFile.length < 2` early-return. If the
`originatingRegistryKey` is non-null but no controller in `sameFile`
has that key (registry race: originator unregistered between arming the
suppression and the modify event firing), return `{ kind:
'reload-silent' }` so the existing fail-safe handles divergence rather
than fanning out apply-peer-sync to every editable peer (including the
phantom).

### WR-05: NoteWriter reads getUseInlineWidget three times in openProblem without caching

**Files modified:** `src/notes/NoteWriter.ts`
**Commit:** `03f5f38`
**Applied fix:** Capture `useInlineWidget` ONCE at the top of `openProblem`
and thread the value to:
- `retrofitStarterCode` via a new optional `useInlineWidgetOverride`
  parameter (the override falls back to a fresh settings read for the
  OTHER three call sites — re-open / cache-cleared recovery /
  backgroundRefresh — that don't have the same race window);
- `buildNoteBody` arg (replaces inline `this.settings.getUseInlineWidget?.()`);
- the belt-and-suspenders retrofit gate (replaces the redundant local
  `const useInlineWidget` that re-read settings at line ~544).

### WR-06: peerSyncRouting accepts unfiltered controllers but caller pre-filters — contract ambiguity

**Files modified:** `src/widget/peerSyncRouting.ts`
**Commit:** `706d68f`
**Applied fix:** Documented the contract via expanded jsdoc on the
`controllers` field of `PeerSyncRouteInput`. Callers MAY pass any
superset of controllers; the helper filters by `filePath` internally
and callers SHOULD NOT rely on a pre-filtered shape. Pure documentation
— no behavior change. (Picked option A from REVIEW.md — option B would
have required updating tests at `splitPaneCursorPreservation.test.ts`
that pass curated controller arrays via the `controllers:` field name.)

### WR-07: codeBlockProcessor outermost catch swallows programmer errors

**Files modified:** `src/widget/codeBlockProcessor.ts`
**Commit:** `33882fd`
**Applied fix:** Replaced `} catch {` after the migrate/repair gate with
`} catch (err) { logger.debug('codeBlockProcessor: migrate/repair gate
threw (non-fatal, falling through)', err); }`. Added a `logger` import
from `../shared/logger`. Behavior preserved (catch still falls through
to the existing path); only new effect is an observable breadcrumb in
the debug log.

## Skipped Issues

None — all 11 in-scope findings (CR-01..04 + WR-01..07) were fixed.

The 5 Info findings (IN-01..05) are out of scope (`fix_scope:
critical_warning`) and intentionally not addressed.

## Notes for Human Verification

Two findings are flagged for human verification because they involve
timing / race fixes that cannot be validated by syntax or unit-test
checks alone:

- **CR-01** (peer-sync hasPending guard) — requires a real Obsidian
  split-pane scenario where pane A is mid-flush AND pane B has armed
  its own DebouncedWriter with pending=true. The R5 / R6 / R9 unit tests
  do not exercise overlapping debounce windows.
- **CR-04** (two-rAF defer) — requires running the new-note flow inside
  a real Obsidian instance to confirm `view.editor.cm` is non-null and
  fully hydrated when the deferred dispatch fires. happy-dom's rAF
  scheduling differs from Obsidian's Electron host; the unit test
  asserts call ordering but not the freshness of CM6 state.

---

_Fixed: 2026-06-01T22:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
