---
phase: 21-v1-2-migration
reviewed: 2026-06-01T00:00:00Z
depth: deep
files_reviewed: 16
files_reviewed_list:
  - src/main.ts
  - src/notes/NoteWriter.ts
  - src/widget/codeBlockProcessor.ts
  - src/widget/debouncedWriter.ts
  - src/widget/liveModeBannerStateField.ts
  - src/widget/peerSyncRouting.ts
  - src/widget/selfWriteSuppression.ts
  - src/widget/WidgetController.ts
  - styles.css
  - tests/main/readingModeMigrationTrigger.test.ts
  - tests/notes/NoteWriter.starter-retrofit.test.ts
  - tests/widget/codeBlockProcessor.phase21.test.ts
  - tests/widget/debouncedWriter.test.ts
  - tests/widget/liveModeBannerStateField.test.ts
  - tests/widget/selfWriteSuppression.test.ts
  - tests/widget/splitPaneCursorPreservation.test.ts
findings:
  critical: 4
  warning: 7
  info: 5
  total: 16
status: issues_found
---

# Phase 21 Cycle-2 Code Review Report

**Reviewed:** 2026-06-01
**Depth:** deep
**Files Reviewed:** 16
**Status:** issues_found

## Summary

This review targets the cycle-2 gap closures landed for UAT post-finding R2 (mount-race after frontmatter repair / Plan 21-14), R4 (LP banner CSS isolation / Plan 21-15), R6 (stale widget mount on fresh problem open / Plan 21-16), and R9 (split-pane cursor preservation / Plan 21-17). The shipped surface adds three new pure helpers (`peerSyncRouting`, `liveModeBannerStateField`, `readingModeMigrationHook`), threads `originatingRegistryKey` through `SelfWriteSuppression`/`DebouncedWriter`/`WidgetController`, adds a post-write rerender hand-off in `NoteWriter`, and isolates the LP banner under a new CSS scope class. The implementation is substantial, well-tested at the unit level, and correctly closes the named UAT gaps.

Deep cross-file analysis surfaced four BLOCKER-class defects in the multi-pane peer-sync path: a peer-clobber on concurrent typing, an iteration-order-dependent `firstMatch` selection that defeats the Pitfall P2 + conflict-modal gates, a dead-code defensive `require()` shim that risks bundler-induced silent breakage, and a mount-vs-dispatch race on the new R6 post-write rerender callback. None of these regressions are exercised by the unit tests in scope; only end-to-end Obsidian-process validation would surface them.

## Structural Findings (fallow)

No structural pre-pass was supplied for this review.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: applyPeerSync silently overwrites pane B's in-flight uncommitted typing — **BLOCKER**

**File:** `src/widget/WidgetController.ts:474-553`
**Issue:** Plan 21-17's `applyPeerSync` is called by the modify handler (`src/main.ts:1442-1452`) on every editable peer when pane A flushes. It dispatches an incremental ChangeSpec computed against the disk body — but **does not check whether the peer (`this`) is itself mid-typing**. If pane B has its own `DebouncedWriter` with `pending=true` (200-500ms typical debounce window), the post-peer-sync state on pane B replaces pane B's in-memory uncommitted edits. Pane B's `getDoc()` closure (passed to its own DebouncedWriter at `WidgetController.ts:1326`) then sees the post-applyPeerSync doc, so the next flush of pane B writes pane A's typing PLUS the loss of B's edits.

Worse: `applyPeerSync` step (6) refreshes `this.currentDocHash` to match the post-peer-sync body — so B's own DebouncedWriter, when it eventually flushes, sets `currentDocHash` correctly for its NEW doc. The Pitfall P2 hash gate in main.ts:1387-1393 then absorbs B's flush echo as well — there is no recovery mechanism. The user will see B's last 100-500ms of typing vanish on every A-flush.

This regression is not caught by `splitPaneCursorPreservation.test.ts` because all P1..P6 tests construct a fresh CM6 view with no concurrent writer; the race only manifests when **both** panes have armed DebouncedWriters with overlapping debounce windows.

**Fix:**
```ts
// In WidgetController.applyPeerSync, BEFORE step 1:
applyPeerSync(newBody: string): void {
  // Plan 21-17 peer-sync MUST NOT clobber the peer's own pending typing.
  // When the peer is mid-flight, defer the sync — its own flush will
  // eventually carry both bodies' edits forward via OT-style merge, OR
  // route through the conflict modal if the in-memory bodies diverge.
  if (this.writer?.hasPending() === true) {
    // Conservative: skip the sync. The originator's flush already wrote
    // the canonical disk state; pane B's flush (when it fires) will
    // see disk drift and route through the existing fail-safe (the
    // selfWriteSuppression hash mismatch path drops the entry, which
    // promotes the next modify event to 'reload-silent' or conflict-modal).
    return;
  }
  // ... existing step 1..6 unchanged
}
```
A more principled fix would queue B's pending edits as a follow-up ChangeSpec applied AFTER the peer-sync, but the conservative skip preserves user intent.

### CR-02: `firstMatch` selection in modify handler is iteration-order-dependent and breaks Pitfall P2 + conflict-modal gates — **BLOCKER**

**File:** `src/main.ts:1374, 1387-1393, 1484-1497`
**Issue:** The Plan 21-17 amendment collects `allMatching` via `for (const ctl of this.widgetRegistry.values())` (line 1366) but then picks `firstMatch = allMatching[0]` (line 1374) for both the Pitfall P2 hash check (line 1387) and — more critically — the external-edit conflict path (line 1484, `firstMatch.writer?.hasPending()`).

Map iteration order is insertion order. With a Reading-mode read-only widget registered BEFORE the editable LP widget on the same file (e.g., split pane: Reading on left registered first, LP on right registered second), `firstMatch` is the read-only widget. The read-only widget has `writer === undefined` (set only on `!readOnly` mounts at WidgetController.ts:1314-1335), so `hasPending()` returns `false`, the code falls through to `reloadFromDisk('silent')` (line 1487) — and the conflict modal that Plan 20-03 was supposed to open NEVER fires. The user's in-flight typing in the LP pane is silently overwritten by the external-edit reload.

The Pitfall P2 check at lines 1387-1393 also reads `firstMatch.currentDocHash`. Read-only widgets initialize `currentDocHash = ''` and the refresh path at WidgetController.ts:1292-1296 is gated on `!readOnly` — the hash stays empty forever. The early-return is dead for any file whose `firstMatch` is a Reading-mode pane.

**Fix:**
```ts
// Pick an editable representative for the gate inputs, falling back to
// the first match only when no editable widget exists.
const editableMatching = allMatching.filter(c => !c.readOnly && !c.isEmbed);
const firstMatch = editableMatching[0] ?? allMatching[0]!;
```
Apply throughout the modify handler. The `peerLikes` array passed to `routePeerSync` (line 1415) already filters correctly inside the helper, so only the `firstMatch` consumers need patching.

### CR-03: `leetcodeRefreshAnnotation` dynamic `require()` in main.ts is dead-code defense that breaks under esbuild — **BLOCKER**

**File:** `src/main.ts:549-563`
**Issue:** The post-write rerender callback resolves `leetcodeRefreshAnnotation` via:
```ts
const mod = require('./widget/liveModeBannerStateField') as { ... };
leetcodeRefreshAnnotation = mod.leetcodeRefreshAnnotation;
```
inside a try/catch with the comment "Plan 21-14 not landed". But `liveModeBannerStateField.ts` IS landed in this branch and exports `leetcodeRefreshAnnotation` (verified at line 127 of that file). The dynamic require is purely defensive against a hypothetical state that does not exist.

Three problems:
1. **esbuild + CommonJS interop:** the project uses esbuild bundling; a top-level `require()` of a TypeScript file that ships ESM-shaped exports is not guaranteed to resolve identically to a static import. esbuild's output for `require('./widget/liveModeBannerStateField')` depends on whether the target file has been transformed to CJS or kept as ESM in the bundle. If the bundler inlines the require to a `__require()` shim, the `.leetcodeRefreshAnnotation` property access could yield `undefined` even though the export exists — silently disabling the entire LP rerender path.
2. **Disclaimer mismatch:** the eslint-disable comment claims "Plan 21-14 not landed" but Plan 21-14 IS the plan that introduced this code. The disclaimer is self-contradictory — the comment was copied from a draft that predated the actual landing.
3. **Static import is risk-free:** main.ts already statically imports from `liveModeBannerStateField`'s sibling modules (the `WidgetRegistry`, `leetCodeBlockProcessor`, etc.). A static import of `leetcodeRefreshAnnotation` is zero risk and zero runtime cost, and a future refactor that deletes the StateField will produce a compile error pointing at this consumer — exactly the behavior code review wants.

**Fix:**
```ts
// Replace lines 549-616 with a static import:
import { leetcodeRefreshAnnotation } from './widget/liveModeBannerStateField';

this.notes.setRerenderAfterNoteWritten((path: string) => {
  try {
    rerenderReadingModePanes(this.app, path);
  } catch (err) {
    logger.debug('main.rerenderAfterNoteWritten: rerenderReadingModePanes threw (non-fatal)', err);
  }
  try {
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      if (view.file?.path !== path) continue;
      const cm = (view.editor as unknown as { cm?: { dispatch?: (spec: unknown) => void } }).cm;
      if (!cm || typeof cm.dispatch !== 'function') continue;
      try {
        cm.dispatch({ annotations: [leetcodeRefreshAnnotation.of(true)] });
      } catch (err) {
        logger.debug('main.rerenderAfterNoteWritten: cm.dispatch threw', err);
      }
    }
  } catch (err) {
    logger.debug('main.rerenderAfterNoteWritten: leaf walk threw', err);
  }
});
```

### CR-04: NoteWriter post-write rerender races `view.editor.cm` hydration on freshly-opened leaves — **BLOCKER**

**File:** `src/notes/NoteWriter.ts:518-531`, `src/main.ts:582-602`
**Issue:** Plan 21-16's flow on the new-note path is:
1. `vault.create(filePath, body)` (line 451) — body written.
2. `applyFrontmatter(...)` (line 466) — frontmatter written.
3. `openLinkText(file.path, '', false)` (line 519) — leaf opens.
4. `fireOnNoteOpen(slug)` (line 522).
5. `fireRerenderAfterNoteWritten(file.path)` (line 530).

The rerender callback in main.ts:582-602 walks `getLeavesOfType('markdown')`, finds the matching leaf, and dispatches `leetcodeRefreshAnnotation.of(true)` against `view.editor.cm`. **But Obsidian's `openLinkText` resolves AS SOON AS the leaf is created — not when CM6 is fully hydrated.** On a brand-new leaf, `view.editor.cm` is either undefined for several frames or points at a CM6 instance that has not yet evaluated its initial StateField factory.

A dispatch against a half-hydrated CM6 either:
- Silently no-ops (the typeof cm.dispatch check at line 591 bails out — the rerender hand-off is dead on the new-note path it was added for).
- Or fires before the StateField has been seeded, and the `tr.annotation(leetcodeRefreshAnnotation)` predicate in `liveModeBannerStateField.ts:451, 471` is checked against a transaction that ALSO has `tr.docChanged === false` (no init transaction is dispatched yet). The annotation update collapses to a no-op because the StateField is at its initial state with no decorations to refresh.

The R6.1 test (`tests/notes/NoteWriter.starter-retrofit.test.ts:457-487`) passes because it asserts call ORDERING via tick counters, not call EFFECT — the dispatch landing on a hydrated view is not exercised.

The same race exists for `rerenderReadingModePanes`: a Reading-mode preview that hasn't completed its initial `previewMode.rerender(false)` cycle will silently swallow the explicit `previewMode.rerender(true)` call (Obsidian's preview render path debounces on `requestAnimationFrame`).

**Fix:** Defer the rerender to the next animation frame after the leaf has been activated:
```ts
private fireRerenderAfterNoteWritten(filePath: string): void {
  if (!this.rerenderAfterNoteWritten) return;
  // Defer until CM6 has hydrated and Obsidian's preview pipeline has
  // run its initial requestAnimationFrame cycle. Without this, the
  // dispatch lands on a half-mounted view and is silently swallowed.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      try {
        this.rerenderAfterNoteWritten?.(filePath);
      } catch (err) {
        logger.debug('notes.rerenderAfterNoteWritten: callback threw', err);
      }
    });
  });
}
```
Two rAF ticks is the canonical cross-browser pattern for "next paint" — the first tick aligns with browser layout, the second guarantees the CM6 initial transaction has flushed. Verify by adding an integration test that asserts `view.editor.cm` is non-null at callback fire time.

## Warnings

### WR-01: SelfWriteSuppression `peekOriginator` does not delete TTL-expired entries — orphans linger until next `tryConsume` — **WARNING**

**File:** `src/widget/selfWriteSuppression.ts:81-86`
**Issue:** `peekOriginator(path)` returns `null` on TTL expiry (line 84) but does NOT delete the orphan from the map — only `tryConsume` does (line 95). If `tryConsume` is never called for an armed entry — for example, when the modify event fires on a different fence in the same file (so `observedHash` mismatches and the modify handler's tryConsume drops it) OR when the writing pane gets unmounted before its echo lands (file rename, plugin teardown, fast tab close) — the entry persists until plugin onunload's `clear()`.

Combined with the modify handler's `routePeerSync` decision tree, an armed-but-unconsumed entry's STALE registryKey is exposed to a NEXT modify event when peekOriginator is called within TTL. The defensive delete at tryConsume:99-101 fires on hash mismatch, eventually clearing the orphan — but only if a subsequent matching modify event arrives.

**Fix:**
```ts
peekOriginator(path: string): string | null {
  const entry = this.map.get(path);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    this.map.delete(path);  // <-- add this
    return null;
  }
  return entry.originatingRegistryKey ?? null;
}
```

### WR-02: `applyPeerSync` swallows dispatch failure silently with no logging — **WARNING**

**File:** `src/widget/WidgetController.ts:531-543`
**Issue:** The catch at line 540 swallows EVERY dispatch error including bona-fide bugs (selection out of range, doc transformation throwing). The comment says "view may be in teardown" but the code returns silently with no debug log, no telemetry, and no observable signal that the peer pane diverged from the originator. Production debugging of split-pane sync regressions will be impossible.

**Fix:**
```ts
} catch (err) {
  // Defensive — view may be in teardown.
  logger.debug('WidgetController.applyPeerSync: dispatch failed', {
    file: this.file.path,
    registryKey: this.registryKey,
    err,
  });
  return;
}
```

### WR-03: `fenceMigrator` mock declares phantom export `isFrontmatterRepairCandidate` not consumed by codeBlockProcessor — **WARNING**

**File:** `tests/widget/codeBlockProcessor.phase21.test.ts:62-67`
**Issue:** The vi.mock at line 62-67 declares `isFrontmatterRepairCandidate` as part of the fenceMigrator surface:
```ts
vi.mock('../../src/widget/fenceMigrator', () => ({
  migrateLegacyFenceIfNeeded: migrateSpy,
  isMigrationCandidate: candidateSpy,
  repairFrontmatterIfNeeded: repairSpy,
  isFrontmatterRepairCandidate: repairCandidateSpy,
}));
```
But `codeBlockProcessor.ts` only imports `isMigrationCandidate, migrateLegacyFenceIfNeeded, repairFrontmatterIfNeeded` from fenceMigrator (lines 48-52). The mock surface introduces a phantom binding that hides production drift: if a future refactor relies on `isFrontmatterRepairCandidate` from codeBlockProcessor, the mock will silently shadow the real predicate and the test passes against a stubbed false.

**Fix:** Remove `isFrontmatterRepairCandidate: repairCandidateSpy` from the mock factory; the test does not exercise that predicate.

### WR-04: `routePeerSync` does not handle "originator not present in controllers" — every editable peer receives apply-peer-sync — **WARNING**

**File:** `src/widget/peerSyncRouting.ts:90-107`
**Issue:** When `originatingRegistryKey` is non-null AND there are ≥2 editable controllers AND the originator is NOT among them (registry race: originator was unregistered between arming the suppression and the modify event firing), the helper falls into `peer-fan-out` and produces a `perController` array where NO entry has `action: 'skip-originator'`. Every editable peer receives `apply-peer-sync` — including a "phantom" peer that may BE the typing-still-mid-flight pane whose registryKey changed (file rename mid-typing, plugin reload mid-flush).

The test at `splitPaneCursorPreservation.test.ts:404-421` (`different file paths are filtered out`) exercises a similar shape but with a different filePath, not a missing originator on the SAME path.

**Fix:**
```ts
const originatorPresent = sameFile.some(c => c.registryKey === originatingRegistryKey);
if (!originatorPresent) {
  // Originator unregistered between arming and modify — treat as external.
  return { kind: 'reload-silent' };
}
```

### WR-05: NoteWriter reads `getUseInlineWidget` three times in `openProblem` without caching — race window if user toggles mid-call — **WARNING**

**File:** `src/notes/NoteWriter.ts:300, 449, 506`
**Issue:** `openProblem` reads `this.settings.getUseInlineWidget?.() ?? false` in three places: line 300 (inside `retrofitStarterCode`), line 449 (when calling `buildNoteBody`), line 506 (gating the belt-and-suspenders retrofit). If `useInlineWidget` setting changes mid-call (settings tab open in another window, programmatic flip via API), the three reads can disagree — body is emitted as v1.3 fence shape but retrofit is then run with the OFF gate, grafting a sibling fence (the very Gap B regression Plan 21-13 was supposed to close).

In production this race is unlikely but not impossible; user invokes `openProblem` from browser, then flips the toggle in settings before the network fetch resolves.

**Fix:** Cache once at the top of `openProblem`:
```ts
async openProblem(slug: string, initialStatus?: ...) {
  const useInlineWidget = this.settings.getUseInlineWidget?.() ?? false;
  // Pass useInlineWidget through to retrofitStarterCode + buildNoteBody at every call site.
}
```

### WR-06: `peerSyncRouting` accepts unfiltered controllers but caller pre-filters — contract ambiguity — **WARNING**

**File:** `src/widget/peerSyncRouting.ts:41, 85-87`
**Issue:** The helper signature accepts ALL controllers in the registry (line 41: `controllers: PeerSyncControllerLike[]`) and filters by filePath inside the function. main.ts:1415-1420 builds `peerLikes` from the SAME `allMatching` array that was already filtered by file.path at lines 1366-1372 — so the helper re-filters a list that's already filtered. Harmless redundancy, but if a future refactor passes the full registry directly (cleaner separation of concerns), the helper continues to work — but the multi-pane decision implicitly trusts the input shape.

**Fix:** Either:
- Document that `controllers` must be the FULL registry (and remove the caller-side filter), or
- Rename to `sameFileControllers` and remove the internal filter at line 85.

### WR-07: `codeBlockProcessor.ts:225-228` outermost catch swallows programmer errors with no log breadcrumb — **WARNING**

**File:** `src/widget/codeBlockProcessor.ts:225-228`
**Issue:** The outer try at line 167 (the autoMigrate=ON path) wraps both the migrate and repair calls. The catch at line 225-228 swallows EVERYTHING including bugs (TypeError on null fm, fence parser exceptions, internal errors in the migrator). The comment "Defensive — migration / repair failures fall through to the existing path" doesn't cover programmer-error throws. Combined with the inner try/catch at line 216-222 around the rerender helper, three nested try/catches eat all signals. Production debugging of migration regressions has zero breadcrumb.

**Fix:**
```ts
} catch (err) {
  // Note: we use eslint-disable-next-line no-console only if logger is unavailable.
  // logger should already be in scope via existing imports if available.
  // At minimum log:
  // logger.debug('codeBlockProcessor: migrate/repair gate threw (non-fatal)', err);
  // Fall through to the existing path.
}
```

## Info

### IN-01: `liveModeBannerStateField.ts` mixes legacy v1.2 banner logic and permanent v1.3 widget StateFields in the same module

**File:** `src/widget/liveModeBannerStateField.ts:438-460, 462-480`
**Issue:** The `PHASE_22_DELETE_WITH_V1_2_PATH` marker at line 438 + the test at `liveModeBannerStateField.test.ts:392-461` lock in the marker convention, but the practical effect is that Phase 22's delete sweep MUST surgically remove the legacy half of THIS file rather than deleting the file outright. The dispatch helper `dispatchLeetCodeRefresh` (line 147) is shared between both paths and survives Phase 22 — so the file structure conflicts with the comment "permanent v1.3 path" at line 462.

**Fix:** Split into two files: `legacyBannerStateField.ts` (deleted in Phase 22 entirely) and `leetCodeWidgetStateField.ts` (permanent). Move `dispatchLeetCodeRefresh` to the permanent file, leave the legacy import.

### IN-02: `WidgetController.ts:1321-1322` ESLint disable for `@typescript-eslint/no-explicit-any` is duplicated

**File:** `src/widget/WidgetController.ts:1321-1322`
**Issue:** Two consecutive `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments at lines 1321 and 1323. The 1321 disable targets line 1322 (`ctl.writer = new DebouncedWriter(`) which has no `any` type. The 1323 disable targets line 1324 (`plugin.app as any`) which is the actual `any` cast. The first disable is dead annotation noise.

**Fix:** Remove the line-1321 disable comment.

### IN-03: Plan 21-15 CSS at `styles.css:2225-2234` re-declares `pre` rule already covered by AI-stream + verdict modal selectors

**File:** `styles.css:2225-2234`
**Issue:** The CSS block is correctly marked for Phase 22 deletion. All declared values use Obsidian CSS variables (good), but `.lc-legacy-banner--livepreview pre` cascades into the existing `.leetcode-ai-stream-body pre, .leetcode-verdict pre` rule at line 1434-1441 which sets `background-color: var(--code-background)` — duplicate declaration. Browsers handle this fine via cascade specificity, but the duplicate is dead weight.

**Fix:** Drop the `pre` rule from the LP banner block; verify visually that the existing cascade specificity is acceptable.

### IN-04: `splitPaneCursorPreservation.test.ts` does not call `vi.restoreAllMocks` between tests

**File:** `tests/widget/splitPaneCursorPreservation.test.ts:91-94, 429-432`
**Issue:** The P5 test at line 150 spies on `view.dispatch` with `mockImplementation`, calls `applyPeerSync('hello world')`, then asserts captured annotations. The test does not call `mockRestore()` after the assertion. With `beforeEach` only resetting `document.body.innerHTML`, a subsequent test in the same describe block that touches the same view instance (none currently, but easy to add) would see the spy still installed. Defensive testing hygiene.

**Fix:** Add `vi.restoreAllMocks()` to the `beforeEach` block, or use `afterEach`.

### IN-05: `liveModeBannerStateField.test.ts` repair-path test (R2.LP.5) couples to plugin internal Set field via `as`-cast

**File:** `tests/widget/liveModeBannerStateField.test.ts:653-655, 715-717`
**Issue:** The R2.LP.5/R2.LP.6/R2.LP.7 tests inject `repairInFlight` via `(plugin as unknown as { repairInFlight: Set<string> }).repairInFlight = new Set<string>()`. This couples the test to the plugin's INTERNAL Set field name; a refactor that renames or restructures the dedupe Set will silently pass the test (no compile error from `as unknown as`). The structural shape `StateFieldPluginHost` at `liveModeBannerStateField.ts:79-88` already declares `repairInFlight?: Set<string>` — the test should construct a plugin via `makePlugin` that provides this in the structural shape directly.

**Fix:** Extend the `makePlugin` factory to accept `repairInFlight: new Set<string>()` as a default field, and let tests read/write it as `plugin.repairInFlight` without the `as`-cast.

---

_Reviewed: 2026-06-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
