---
phase: 21-v1-2-migration
reviewed: 2026-06-01T18:00:00Z
depth: deep
files_reviewed: 19
files_reviewed_list:
  - src/main.ts
  - src/main/readingModeLegacyBannerPostProcessor.ts
  - src/main/readingModeMigrationHook.ts
  - src/notes/NoteWriter.ts
  - src/solve/starterCodeInjector.ts
  - src/widget/codeBlockProcessor.ts
  - src/widget/fenceMigrator.ts
  - src/widget/liveModeBannerStateField.ts
  - src/widget/liveModeViewPlugin.ts
  - src/widget/multiPaneCoordinator.ts
  - src/widget/WidgetController.ts
  - tests/main/readingModeLegacyBannerPostProcessor.test.ts
  - tests/main/readingModeMigrationTrigger.test.ts
  - tests/notes/NoteWriter.starter-retrofit.test.ts
  - tests/solve/starterCodeInjector.test.ts
  - tests/widget/codeBlockProcessor.phase21.test.ts
  - tests/widget/fenceMigrator.test.ts
  - tests/widget/liveModeBannerStateField.test.ts
  - tests/widget/multiPaneCoordinator.test.ts
findings:
  critical: 2
  warning: 7
  info: 4
  total: 13
status: issues_found
---

# Phase 21: Code Review Report (Gap-Closure Plans 21-08..21-13)

**Reviewed:** 2026-06-01T18:00:00Z
**Depth:** deep
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Gap-closure plans 21-08..21-13 target six post-UAT findings (Reading-mode rerender after auto-migration, frontmatter auto-repair, Reading-mode legacy banner post-processor, Live-Preview StateField migration of `Decoration.replace`, multi-pane `reconcileFocus` null-leaf branch + `promoteThisPane` self-recover, retrofit fence dedup gate). The diff is well-tested overall (~150 new test cases across the 7 new test files), and the project conventions are honored: no `innerHTML`, vault writes via `app.vault.process` / `app.fileManager.processFrontMatter`, no plugin CM6 dispatch into locked ranges that lacks a `'leetcode.*'` userEvent.

The two **Critical** findings are correctness regressions the unit tests don't catch:

1. **CR-01** — `repairInFlight` is documented as a cross-mode dedupe Set but only the Live-Preview StateField mutates it; the Reading-mode hook fires `repair` without claiming the lock, so a Reading-pane + LP-pane combo can fire two concurrent `processFrontMatter` calls on the same file.
2. **CR-02** — `readingModeLegacyBannerPostProcessor` performs `pre.replaceWith(host)` BEFORE `mountLegacyFenceBanner`. If banner mount throws after the replace, the original `<pre>` is gone and the user sees a blank gap. Test 12 only forces `replaceWith` itself to throw, not the post-replace mount path.

The seven **Warning** findings cover: StateField side-effects firing on every `tr.docChanged` rather than first-mount; missing destroyed-view check in `pushParentToChild`; the `liveModeBannerStateField` repair side-effect violating CM6's "StateField update should be pure" contract; redundant `getUseInlineWidget` reads in `NoteWriter.retrofitStarterCode` exposing a settings-toggle race; multi-`## Code` corner-case behavior of `findFirstLeetCodeSolveFenceIndexInCodeSection` that is correct but undocumented and untested; and full-registry `O(N)` filter in `LeetCodeWidgetRenderChild.onload`.

## Critical Issues

### CR-01: `repairInFlight` cross-mode dedupe is documented but only the Live-Preview path mutates the Set

**File:** `src/main/readingModeMigrationHook.ts:160-200`, `src/main.ts:357`, `src/widget/liveModeBannerStateField.ts:297-314`
**Issue:**
The `LeetCodePlugin` instance owns two dedupe Sets — `migrateInFlight` (line 347 in `main.ts`) and `repairInFlight` (line 357). Plan 21-09's design comment at `liveModeBannerStateField.ts:282-285` documents `repairInFlight` as the dedupe gate for the frontmatter-repair path, and the Live-Preview StateField correctly adds/deletes entries (lines 299, 313).

The Reading-mode hook factory (`makeReadingModeMigrationHandler`) accepts only `migrateInFlight` (interface line 50, gate at 132 and 139). The hook invokes `deps.repair(...)` on line 173 with NO repair-side dedupe — neither claim nor release. So when a user opens a v1.3-body+missing-lc-language note in a workspace with both a Reading-mode pane and a Live-Preview pane visible, both paths can call `processFrontMatter` concurrently for the same file. The inner gate inside `repairFrontmatterIfNeeded` (clause C5: only assign when `lc-language` is empty) prevents data clobber, but the documented invariant ("dedupe Set shared between consumers") is silently violated.

The 21-VERIFICATION trail and the test suite do not exercise the cross-mode race because each test file mocks the other mode away. The next reviewer (or the Phase 22 author tearing out v1.2 scaffolding) will read the JSDoc, trust it, and miss the race.

**Fix:**
Thread `repairInFlight` into `ReadingModeMigrationHookDeps` and gate the repair call symmetrically with `migrateInFlight`:

```ts
// src/main/readingModeMigrationHook.ts
export interface ReadingModeMigrationHookDeps {
  // ...existing fields...
  /** Plan 21-09 — sibling dedupe Set for repair path. Mirrors migrateInFlight. */
  repairInFlight: Set<string>;
}

// inside the .then() that invokes repair (replacing line 173-177):
.then(async (migrated) => {
  migratedFlag = migrated === true;
  if (migratedFlag) return;
  if (deps.repairInFlight.has(file.path)) return;
  deps.repairInFlight.add(file.path);
  try {
    const repaired = await deps.repair(deps.app, file, {
      autoMigrateOnOpen: true,
      defaultLanguage,
    });
    repairedFlag = repaired === true;
  } finally {
    deps.repairInFlight.delete(file.path);
  }
})
```

Then in `src/main.ts:1576-1602`, pass `repairInFlight: this.repairInFlight` into the deps object.

### CR-02: Reading-mode legacy banner post-processor irreversibly mutates the DOM before banner mount

**File:** `src/main/readingModeLegacyBannerPostProcessor.ts:200-204`
**Issue:**
The handler executes:

```ts
const ownerDoc = target.pre.ownerDocument;
const host = ownerDoc.createElement('div');
host.classList.add('leetcode-migration-banner-host');
target.pre.replaceWith(host);                       // ← original <pre> is now detached
mountLegacyFenceBanner(host, source, file, plugin as never, 'manual-prompt');
```

The outer try/catch at line 99-108 logs at debug and returns — so when `mountLegacyFenceBanner` throws AFTER `replaceWith` has already executed, the user is left with an empty `<div class="leetcode-migration-banner-host">` in place of their rendered code block. There is no recovery: the `<pre>` is detached and not retained by the function, the silent-on-failure log gives no surface to the user, and the next paint shows a blank gap.

`mountLegacyFenceBanner` is non-trivial DOM construction (CTAs, icon glyphs, click handlers, label text); throws can come from any of `createEl`, `setIcon`, or click-handler closure capture. Test 12 in `tests/main/readingModeLegacyBannerPostProcessor.test.ts:525-549` only forces `replaceWith` itself to throw — it does NOT cover the post-replace banner-mount throw path, so the regression hides.

The CLAUDE.md "Pattern S-05 silent-on-failure" intent is "leave the rendered DOM untouched" — line 46 of `readingModeLegacyBannerPostProcessor.ts` describes the intent verbatim. The implementation's order-of-operations betrays the intent: the moment `replaceWith` runs, the DOM IS touched.

**Fix:**
Mount the banner into the detached host BEFORE attaching to the document. If banner mount throws, the original `<pre>` stays in place:

```ts
const host = ownerDoc.createElement('div');
host.classList.add('leetcode-migration-banner-host');
// Mount banner FIRST into the detached host. Throws here leave the
// rendered <pre> intact in the DOM (pre.replaceWith never ran).
mountLegacyFenceBanner(host, source, file, plugin as never, 'manual-prompt');
// Atomic swap — runs ONLY if mount succeeded.
target.pre.replaceWith(host);
```

This requires `mountLegacyFenceBanner` to be safe to call on a detached host — it should be (it appends children to whatever host it gets). Add a regression test that throws from inside `mountLegacyFenceBanner` and asserts `root.contains(pre) === true && root.querySelector('.leetcode-migration-banner-host') === null` (meaning the original pre was preserved).

## Warnings

### WR-01: Live-Preview StateField migration / repair side-effects re-fire on every docChanged transaction, not just first mount

**File:** `src/widget/liveModeBannerStateField.ts:225-247, 290-316`
**Issue:**
The two StateField `update` callbacks call `buildLegacyBannerDecorations(tr.state)` / `buildLeetCodeWidgetDecorations(tr.state)` on every transaction with `tr.docChanged === true`. Both build helpers contain a fire-and-forget side-effect (migrate / repair) gated only by the per-path `migrateInFlight` / `repairInFlight` Set.

Once the in-flight Set is cleared by `.finally`, the very next `docChanged` transaction (e.g., a single keystroke after the migration completed) re-evaluates the predicate. If metadataCache is still cold (a real possibility — `app.metadataCache` updates are async and can lag the file write by tens of ms), the predicate STILL matches and a second `processFrontMatter` invocation fires. Rapid typing during the initial mount window can produce a small burst of repair invocations.

In practice the inner gate inside `repairFrontmatterIfNeeded` (clause C5) makes each subsequent call short-circuit. But the design implies "fire ONCE per file-open," and the observable disk I/O traffic disagrees.

**Fix:**
Add a per-session "already ran for this file" Set distinct from the in-flight gate:

```ts
// In LeetCodePlugin (main.ts):
repairCompletedThisSession: Set<string> = new Set();

// In buildLeetCodeWidgetDecorations:
if (
  needsRepair &&
  !plugin.repairCompletedThisSession?.has(file.path) &&
  isInlineWidgetEnabled(plugin) &&
  isAutoMigrateEnabled(plugin)
) {
  // ... existing in-flight gate ...
  void repairFrontmatterIfNeeded(...).finally(() => {
    plugin.repairCompletedThisSession?.add(file.path);
    repairInFlight.delete(file.path);
  });
}
```

Mirror the same on the legacy migrate path. Reset both on `vault.on('rename')` and `Plugin.onunload`.

### WR-02: `liveModeViewPlugin.pushParentToChild` does not check `view.destroyed` before dispatching

**File:** `src/widget/liveModeViewPlugin.ts:107-165`
**Issue:**
The function iterates `widgetRegistry.valuesForPath(file.path)` (or full `values()` fallback) and calls `childView.dispatch(...)`. If a widget is being destroyed concurrently (e.g., the user closes the tab while typing in another pane), `childView` may be torn down between the registry read at line 140 and the dispatch at line 153.

The dispatch is wrapped in try/catch (lines 152-163) which catches the throw, but the catch swallows silently. Other code paths in this codebase (`WidgetController.ts:1492-1496`, the BL-02 alive-check in the adoption predicate) explicitly check `view.destroyed === true` before consuming an EditorView — that discipline is missing here. A destroyed-view dispatch is benign (the catch absorbs it) but the contract is asymmetric.

**Fix:**
```ts
const childView = candidate.view;
if (!childView) continue;
const destroyed = (childView as unknown as { destroyed?: boolean }).destroyed;
if (destroyed === true) continue;
// ... rest of loop body ...
```

### WR-03: `repairFrontmatterIfNeeded` invoked from a CM6 StateField violates "StateField update should be pure"

**File:** `src/widget/liveModeBannerStateField.ts:259-316`
**Issue:**
The build helper acknowledges (lines 285-287) that side-effects in `StateField.create / update` are "unusual but acceptable here." For the existing legacy-banner migrate path (lines 229-247), this was a defensible compromise. For repair, however, `processFrontMatter` writes to disk, which fires `vault.on('modify')`, which may or may not arrive at the parent CM6 as a `docChanged` transaction (frontmatter-only edits sometimes do, sometimes don't, depending on whether the YAML changed length).

If the modify event lands as `docChanged`, the StateField update fires AGAIN, re-evaluates `needsRepair`, and the inner gate of `repairFrontmatterIfNeeded` saves the day — but disk I/O during transaction processing remains a CM6 contract violation. Doubling the contract violation surface (legacy-banner migrate AND v1.3-widget repair) increases the chance of a hard-to-trace future regression.

**Fix:**
Move the repair side-effect out of the StateField:
- **Option A** (preferred): Add a `metadataCache.on('changed')` subscriber that fires `repairFrontmatterIfNeeded` when `lc-slug` is present and `lc-language` is missing. Less constrained execution context than transaction processing.
- **Option B**: Extend the `workspace.on('file-open')` Reading-mode hook (already invoked unconditionally in main.ts:1573-1603) to also handle the Live-Preview path. The hook is already wired to the same `migrate` + `repair` deps.

Either avoids the contract violation while preserving the closure of UAT Gap 2.

### WR-04: `NoteWriter.retrofitStarterCode` reads `getUseInlineWidget` at the wrapper, then again inside `retrofitStarterCodeRaw`, exposing a settings-toggle race

**File:** `src/notes/NoteWriter.ts:242-262`, `src/solve/starterCodeInjector.ts:280-301`
**Issue:**
The wrapper at NoteWriter:246 reads `getUseInlineWidget?.() ?? false` and short-circuits when ON. For the OFF path, it falls through to `retrofitStarterCodeRaw(this.app, file, detail, this.settings)`. The raw retrofit at `starterCodeInjector.ts:289-290` reads `getUseInlineWidget` AGAIN to derive `fenceKind: 'leetcode-solve' | 'legacy'`.

When the wrapper let the call through (`useInlineWidget=OFF/undefined`), the second read should always yield `'legacy'`. But because the wrapper passes the LIVE `this.settings` reference (not a frozen snapshot), if `getUseInlineWidget` is a closure that toggles between calls — settings reload mid-`openProblem`, or the user clicking "Insert starter" in a settings tab during a slow LC fetch — the second read can yield `true`. That sends `fenceKind: 'leetcode-solve'` into `injectCodeSection` even though the wrapper let the call through under the legacy gate. Result: a v1.3 short-circuit attempt on a note that has no v1.3 fence (because the wrapper would have skipped the call entirely if v1.3 were intended).

The defense-in-depth comment at NoteWriter:230-241 acknowledges the duplicate gate but does not address the race window.

**Fix:**
Resolve `useInlineWidget` once at the wrapper and pass a frozen settings shim down:

```ts
private async retrofitStarterCode(
  file: TFile,
  detail: DetailCacheEntry | null,
): Promise<void> {
  const useInlineWidget = this.settings.getUseInlineWidget?.() ?? false;
  if (useInlineWidget) {
    logger.debug('notes.retrofitStarterCode: skipped — v1.3 widget owns the fence body');
    return;
  }
  // Snapshot the settings as observed at this gate; subsequent reads
  // inside retrofitStarterCodeRaw use the frozen snapshot, eliminating
  // the live-settings race.
  const frozen = {
    getDefaultLanguage: () => this.settings.getDefaultLanguage(),
    getUseInlineWidget: () => false,
  };
  // ...existing pre-checks...
  await retrofitStarterCodeRaw(this.app, file, detail, frozen);
}
```

### WR-05: Multi-`## Code` corner-case behavior of `findFirstLeetCodeSolveFenceIndexInCodeSection` is undocumented and untested

**File:** `src/widget/fenceMigrator.ts:145-170`
**Issue:**
The helper iterates lines linearly. Comments at lines 121-141 describe the index semantics for the single-`## Code` case, but multi-`## Code` regions (mentioned in `countLeetCodeSolveFenceOpenersInCodeSection`'s JSDoc at line 187 as "degenerate but possible") are not addressed in the `findFirst...` helper's contract. Walking through the algorithm:

- File has `## Code` (no fence) → `## Notes` (with `\`\`\`leetcode-solve`) → `## Code` (with `\`\`\`leetcode-solve`):
  - `inCodeSection=true` at first `## Code`, no opener seen.
  - `inCodeSection=false` at `## Notes`; the Notes fence increments `lcOpenerCount` to 1.
  - `inCodeSection=true` at second `## Code`; first in-section opener returns 1.
  - `rewriteFenceBody(text, 1, body)` rewrites the second leetcode-solve fence overall — which IS the in-Code one. Correct.

- File has `## Code` (with `\`\`\`leetcode-solve`) → `## Notes` (with stray `\`\`\`leetcode-solve`) → `## Code` (with another `\`\`\`leetcode-solve`):
  - In-section opener at first `## Code` returns 0 immediately. Correct.

The function appears to behave correctly under all multi-`## Code` topologies, but the test suite covers only the single-section case. A future refactor could break the invariant invisibly.

**Fix:**
Add property-based test coverage for multi-`## Code` topologies, AND document the invariant explicitly:

```ts
/**
 * Multi-`## Code` semantics: returns the LC-opener index for the FIRST
 * in-section opener encountered linearly. Stray openers in interleaved
 * non-Code sections (e.g., `## Notes`) increment the LC-opener counter
 * outside the section so rewriteFenceBody targets the right fence.
 */
```

### WR-06: `LeetCodeWidgetRenderChild.onload` materializes the entire registry on every mount

**File:** `src/widget/WidgetController.ts:1471-1523`
**Issue:**
The candidate-collection step `[...registry.values()].filter(...)` materializes the full registry on every onload. With N widgets across M panes, the cost is O(N) per mount. Reading-mode rapid-flip scenarios (toggle Edit↔Reading↔Edit, multi-pane open) compound this.

The `liveModeViewPlugin.pushParentToChild` adoption already uses `valuesForPath(path)` (lines 120-131) which is a path-keyed iterator. The same iterator is available here.

This is borderline performance vs. correctness — performance is out of v1 scope. Listed as Warning rather than Critical because the registry is bounded by visible panes (typically 1-3) and the cost is negligible in practice. But the WR-09 comment block at 1467-1470 explicitly invokes "deterministic preference" and adopting the path-keyed iterator would make the intent cleaner.

**Fix:**
```ts
const registryWithIter = registry as unknown as
  | {
      values(): IterableIterator<WidgetController>;
      valuesForPath?(p: string): Iterable<WidgetController>;
    }
  | undefined;
const iter = registryWithIter?.valuesForPath
  ? [...registryWithIter.valuesForPath(this.file.path)]
  : registryWithIter ? [...registryWithIter.values()] : [];
const candidates = iter.filter(/* existing predicate */);
```

### WR-07: `extractLangSlug` invariant relies on undocumented all-lowercase `LC_LANG_SLUGS` Set

**File:** `src/main/readingModeLegacyBannerPostProcessor.ts:158, 209-217`
**Issue:**
Obsidian renders `<code class="language-Java">` (capitalized) when source markdown is `\`\`\`Java`. The regex `LANGUAGE_CLASS_RE = /^language-([A-Za-z0-9_+#-]+)$/` accepts uppercase via the character class, then `m[1].toLowerCase()` is applied. `resolveLangSlug(slug, SLUG_SENTINEL)` returns lowercase. `LC_LANG_SLUGS.has(resolved)` requires the Set to be all-lowercase — this is an implicit, undocumented invariant in `src/solve/languages.ts`.

If a future contributor adds a mixed-case entry to `LC_LANG_SLUGS` (e.g., `'CSharp'` for clarity), the post-processor silently fails to recognize legitimate user fences. The flow is correct today; the fragility is the concern.

**Fix:**
Either add a runtime invariant assertion at module load in `solve/languages.ts`, or document the invariant inline at the call site:

```ts
// LC_LANG_SLUGS is canonically lowercase (verified at module load in
// src/solve/languages.ts); resolveLangSlug returns lowercase so the
// .has() check below is case-stable.
if (!LC_LANG_SLUGS.has(resolved)) continue;
```

## Info

### IN-01: `H2_ANY_RE` regex anchors on `\S` — single non-whitespace char qualifies as "any heading"

**File:** `src/main/readingModeLegacyBannerPostProcessor.ts:67-68, 219-230`
**Issue:** The regex order in `isUnderCodeHeading` is correct (Code-specific first, generic second), and `H2_ANY_RE = /^\s*##\s+\S/` accepts a single non-whitespace char. Pathological headings like `## #` would correctly be flagged as "any heading," forcing a not-under-Code result. Edge case is benign but worth a comment for the next reader.

**Fix:** Optional — add a brief comment near `H2_ANY_RE` explaining the intent (catch any non-Code H2 as a section boundary).

### IN-02: `readingModeMigrationHook.ts` `.then().catch().finally().then(rerender)` chain comment is hard to parse

**File:** `src/main/readingModeMigrationHook.ts:160-200`
**Issue:** The chain works because Promise spec guarantees the trailing `.then` runs AFTER `.finally`. Test G1.4 verifies the observable invariant. The inline comment at lines 187-200 ("trailing .then is attached above. The else branch follows") is dense and reads as tangled on first pass.

**Fix:** Optional rewrite for clarity — call out the four-step ordering in a numbered comment:

```ts
// Auto-path migration. Order:
//   1. .then  — capture migrated boolean; chain repair if migrated=false.
//   2. .catch — record both flags as false; logDebug the rejection.
//   3. .finally — UNCONDITIONALLY clear the in-flight lock.
//   4. trailing .then — after .finally, fire rerender iff EITHER flag is true.
//      Wrapped in inner try/catch so a rerender throw does not leak.
```

### IN-03: `WidgetController.promoteThisPane` walks `getLeavesOfType` per click

**File:** `src/widget/WidgetController.ts:738-767`
**Issue:** Each overlay click re-walks all markdown leaves. The underlying `app.workspace.getLeavesOfType` is reasonably fast (Obsidian indexes leaves), but the function comment block (lines 720-737) is so detailed that the simple `.find` walk underneath looks mismatched. The post-UAT Gap A self-recover invocation of `setPaneState('active')` is correct (idempotent on already-active state).

**Fix:** None required.

### IN-04: `fenceMigrator.ts` `void sawCodeHeading;` is a discard pattern that signals dead code

**File:** `src/widget/fenceMigrator.ts:589-592`
**Issue:** The block:

```ts
// No leetcode-solve opener inside any `## Code` region — caller falls
// through silently. (sawCodeHeading retained for symmetry; result is
// false either way.)
void sawCodeHeading;
return false;
```

The `void` discard is dead code — `sawCodeHeading` is set inside the loop but never consulted. The comment "retained for symmetry" suggests intent that didn't ship. Either remove the variable entirely or use it for a debug-level diagnostic when a `## Code` heading exists but no leetcode-solve opener is found.

**Fix:**
```ts
// Remove unused tracking variable:
const lines = noteText.split(/\r?\n/);
let inCodeSection = false;
for (let i = 0; i < lines.length; i++) {
  const text = lines[i] ?? '';
  if (H2_CODE_RE.test(text)) { inCodeSection = true; continue; }
  if (H2_ANY_RE.test(text)) { inCodeSection = false; continue; }
  // ...
}
return false;
```

---

_Reviewed: 2026-06-01T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
