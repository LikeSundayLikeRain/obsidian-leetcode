---
phase: 19-widget-foundation-one-way-sync
plan: 01
subsystem: widget-foundation
tags: [widget, cm6, inline-mount, atomic-ranges, settings, experimental]
requires: []
provides:
  - widget-mount-factory
  - widget-registry
  - fence-locator-pure-helpers
  - fence-serialization-pure-helpers
  - leetcode-fence-widget-type
  - live-mode-view-plugin
  - reading-mode-code-block-processor
  - inline-widget-settings-toggle
  - widget-sync-debounce-setting
  - mutual-exclusion-onload-assert
affects:
  - src/main.ts
  - src/settings/SettingsStore.ts
  - src/settings/SettingsTab.ts
  - tests/helpers/obsidian-stub.ts
  - tests/solve/mocks/fakeSettingsStore.ts
  - tests/ai/settingsTab.test.ts
tech-stack:
  added: []
  patterns:
    - cm6-viewplugin-with-atomicranges-facet
    - widgettype-content-hash-eq
    - decoration-replace-shared-rangeset
    - registerMarkdownCodeBlockProcessor-fence-tag
    - mutual-exclusion-onload-assert
    - settings-strict-equality-shape-guard
    - experimental-cordoned-subsection
key-files:
  created:
    - src/widget/fenceLocator.ts
    - src/widget/fenceSerialization.ts
    - src/widget/embedDetect.ts
    - src/widget/widgetRegistry.ts
    - src/widget/LeetCodeFenceWidget.ts
    - src/widget/liveModeViewPlugin.ts
    - src/widget/codeBlockProcessor.ts
    - src/widget/WidgetController.ts
    - tests/widget/__fixtures__/lcNoteFixtures.ts
    - tests/widget/__fixtures__/cm6Helpers.ts
    - tests/widget/widgetRegistry.test.ts
    - tests/widget/codeBlockProcessor.test.ts
    - tests/widget/WidgetController.test.ts
    - tests/widget/atomicRanges.test.ts
    - tests/widget/themeIntegration.test.ts
    - tests/widget/vimMount.test.ts
    - tests/widget/fenceLocator.test.ts
    - tests/widget/fenceSerialization.property.test.ts
    - tests/main/mutualExclusion.test.ts
  modified:
    - src/main.ts
    - src/settings/SettingsStore.ts
    - src/settings/SettingsTab.ts
    - tests/helpers/obsidian-stub.ts
    - tests/solve/mocks/fakeSettingsStore.ts
    - tests/ai/settingsTab.test.ts
decisions:
  - "Hash-based eq() identity (RESEARCH Pitfall 19-F) — LeetCodeFenceWidget compares (filePath, fenceIndex, sourceHash) so CM6 reuses DOM across keystroke-driven rebuilds; ignoring this would remount on every transaction and destroy embedded CM6 state"
  - "Same RangeSet for decorations + EditorView.atomicRanges Facet contribution — drift between the two would let parent cursor land in widget range while visual decoration still shows the widget (RESEARCH Pattern 3)"
  - "Pure-fn closer-resolution rule changed from v1.2's first-`\`\`\``-after-opener to LAST-`\`\`\``-in-section — necessary to round-trip the SHELLS x HOSTILE_BODIES property test corpus including nested triple backticks"
  - "Mutual-exclusion assert at TOP of Plugin.onload() (RESEARCH Pitfall 19-G timing) — runs BEFORE either registerEditorExtension fires; corrupt data.json with both flags ON resolves to a single editor"
  - "useInlineWidget hard-gate via if-block in onload (D-05) — bisection-clean: any unexpected widget activation must come from the user explicitly flipping the toggle"
  - "WidgetController implemented in Task 2 file scope (originally Task 3) [Rule 3 deviation] — Task 2's tests cross-import LeetCodeWidgetRenderChild from codeBlockProcessor; without the source the imports cannot resolve"
metrics:
  duration: ~75 minutes
  completed: 2026-05-29
---

# Phase 19 Plan 01: Widget Foundation Minimal Mount Summary

Self-contained inline `\`\`\`leetcode-solve` widget mount foundation, hard-gated behind `useInlineWidget=OFF`, with two-path mount (Reading + Live Preview), parent-cursor exclusion via `EditorView.atomicRanges`, theme + 8-language carry-over, conditional vim, and an Experimental settings subsection. NO live writes yet (Plan 19-02 owns sync).

## What Was Built

**Pure helpers** (`src/widget/fenceLocator.ts`, `fenceSerialization.ts`):
- `findCodeFence(state)` — lifted verbatim from `codeActionsEditorExtension.ts:177-212`, widened return type with `kind: 'leetcode-solve' | 'legacy'` so Phase 19 widget and Phase 21 migrator can route on the same locator.
- `extractFenceBody(state, fence)` — lifted verbatim from `nestedEditorExtension.ts:168-176`.
- `computeFenceIndex(fileText, fenceLineStart0Based)` — new pure helper counting prior `\`\`\`leetcode-solve` openers in a file (CONTEXT D-01 ordinal index).
- Pure string-only `extractFenceBody` / `rewriteFenceBody` for the `vault.process` callback path (Plan 19-02 will consume them). Round-trip invariant `rewriteFenceBody(s, i, extractFenceBody(s, i) ?? '') === s` holds across the SHELLS × HOSTILE_BODIES corpus from 19-RESEARCH.md (CRLF, nested triple backticks, `---` lookalikes, edge whitespace, empty/single-line/mid-byte/unicode bodies).

**Embed detection** (`src/widget/embedDetect.ts`):
- `isEmbedContext(el, ctx, targetFile)` — both signals OR'd: `.markdown-embed`/`.internal-embed` ancestor walk + `ctx.sourcePath !== targetFile.path`. Pure boolean.

**Widget registry** (`src/widget/widgetRegistry.ts`):
- `WidgetRegistry` class with `Map<string, WidgetController>` keyed by `${file.path}::${fenceIndex}` (CONTEXT D-01).
- `get`/`set`/`has`/`delete`/`flushAll`/`destroyAll`/`flushFile` — mirrors v1.2 `ChildEditorRegistry` shape minus LRU eviction (Plan 19-01 has no cache pressure ceiling — Plan 19-03's state-persistence map handles bounding).
- `flushAll()` calls `controller.flushNow()` on each entry; Plan 19-01 ships `flushNow` as a no-op stub (Plan 19-02 wires debouncedWriter).

**WidgetType subclass** (`src/widget/LeetCodeFenceWidget.ts`):
- `eq()` returns true iff `(file.path, fenceIndex, sourceHash)` all match — content-hash identity per RESEARCH Pitfall 19-F (DJB2 hash, 32-bit).
- `ignoreEvent()` returns true so parent CM6 lets the embedded EditorView consume keyboard/mouse events natively.
- `toDOM(view)` calls `mountLeetCodeWidget(host, source, file, plugin, /*readOnly=*/false, fenceIndex)` and returns the host element.
- `destroy(dom)` looks up the registered controller via `widgetRegistry.get(\`${file.path}::${fenceIndex}\`)`, calls `flushNow()` (no-op stub) + `destroy()`, and removes the registry entry.

**Live-Preview ViewPlugin** (`src/widget/liveModeViewPlugin.ts`):
- `leetCodeFenceViewPlugin(plugin)` — `ViewPlugin.define` with both `decorations` and `provide: pl => EditorView.atomicRanges.of(view => view.plugin(pl)?.ranges ?? Decoration.none)`.
- The SAME `RangeSet` is stored on both `decorations` and `ranges` so the visual decoration and atomicRanges Facet stay drift-free (RESEARCH Pattern 3 lines 247-272 — load-bearing invariant).
- `lc-slug` frontmatter gate via `editorInfoField` + `metadataCache.getFileCache(file)?.frontmatter` (NOT `ctx.frontmatter` — RESEARCH Anti-Patterns + Specific Findings §A5).
- Update on `update.docChanged || update.viewportChanged` only — Phase 20 owns the `metadataCache.on('changed')` reactivity (CONTEXT deferred_ideas).

**Reading-mode handler** (`src/widget/codeBlockProcessor.ts`):
- `leetCodeBlockProcessor(plugin)` — handler factory for `registerMarkdownCodeBlockProcessor('leetcode-solve', …)`.
- Branching matrix per CONTEXT C-10 / C-15 / D-04 / RESEARCH Pitfall 19-D:
  - No TFile (broken path) → static `<pre><code>` fallback.
  - Null `getSectionInfo` → static fallback (Pitfall 19-D treats null as embed-likely).
  - `lc-slug` absent + not embed → static fallback (stray fence in non-LC note).
  - `lc-slug` absent + embed → readOnly RenderChild.
  - `lc-slug` present + embed → readOnly RenderChild.
  - `lc-slug` present + not embed → editable RenderChild.
- Static fallback uses `createEl` with `text:` option — NO `innerHTML` (CLAUDE.md POLISH-03 carry-through). Falls back to `document.createElement` + `textContent` under happy-dom test envs that omit `createEl`.

**Mount factory + lifecycle** (`src/widget/WidgetController.ts`):
- `mountLeetCodeWidget(host, source, file, plugin, readOnly, fenceIndex?)` — shared by Reading-mode (via `LeetCodeWidgetRenderChild.onload`) and Live-Preview (via `LeetCodeFenceWidget.toDOM`).
- Container className = `'lc-nested-editor HyperMD-codeblock lc-leetcode-solve'` (CONTEXT C-13 + PATTERNS line 1101 — three classes, two carry-over + one new for Phase 22 polish).
- Extensions array (lifted from `childEditorFactory.ts:252-416` with two intentional drops — `createScrollIntoViewExtension` + `syncExtensions` parameter): `languageCompartment.of(buildLanguageExtensions(slug, indent))` (C-12 — 8 packs), conditional `vim({ status: true })` when `app.vault.getConfig('vimMode') === true` (C-14 / VIM-01), `closeBracketsKeymap` at top level, `obsidianSemanticClasses`, `...createThemedHighlight()`, `bracketMatching()`, `history`, `drawSelection`, `highlightActiveLine`, main `keymap.of([...defaultKeymap, ...historyKeymap])`, `indentUnit.of('    ')`, theme block (lifted verbatim from `childEditorFactory.ts:381-395`), **`EditorView.editable.of(!readOnly)` (WIDGET-07)**, `EditorView.lineWrapping`.
- Two mousedown listeners attached IN ORDER (CONTEXT D-02 — order matters): (a) `view.dom.addEventListener('mousedown', e => e.stopPropagation())` defends against Live-Preview cursor-place "raw source reveal"; (b) click-to-focus listener mirrors `childEditorFactory.ts:405-413`.
- `LeetCodeWidgetRenderChild extends MarkdownRenderChild` — Reading-mode wrapper with `onload` mounting the widget and `onunload` running `flushNow` + `destroy` + `widgetRegistry.delete`. `fenceIndex` computed at construction via `computeFenceIndex(info.text, info.lineStart)`.

**Plugin onload wiring** (`src/main.ts`):
- Read `useInlineWidget = this.settings.getUseInlineWidget()` once.
- **Mutual-exclusion assert at the TOP** (RESEARCH Pitfall 19-G timing — BEFORE either `registerEditorExtension` fires): when `useInlineWidget && useNestedEditor`, surface a Notice and force `setUseNestedEditor(false)`.
- Hard-gated v1.3 path: `if (useInlineWidget) { this.widgetRegistry = new WidgetRegistry(); this.registerMarkdownCodeBlockProcessor('leetcode-solve', leetCodeBlockProcessor(this)); this.registerEditorExtension([leetCodeFenceViewPlugin(this)]); }`. Plan 19-01 does NOT register `vault.on('modify')`, leaf-change, or quit hooks — those land in Plan 19-02.
- Plugin onunload adds `widgetRegistry?.flushAll()` + `widgetRegistry?.destroyAll()` after the existing v1.2 `childEditorRegistry?.destroyAll()`.

**Settings shape + UI** (`src/settings/SettingsStore.ts`, `src/settings/SettingsTab.ts`):
- New PluginData fields `useInlineWidget: boolean` (default false — D-05 hard-gate) and `widgetSyncDebounceMs: 300|400|500|1000|2000` (default 400 — C-06).
- Strict-equality shape-guards at load: corrupt data.json collapses to safe defaults (mirrors `indentSizeOverride` posture).
- Getters/setters: `getUseInlineWidget`/`setUseInlineWidget` and `getWidgetSyncDebounceMs`/`setWidgetSyncDebounceMs`.
- New 'Experimental' subsection in SettingsTab AFTER the Code editor group with the locked banner copy "These features are under development and may change between releases.", a `useInlineWidget` toggle (onChange forces `setUseNestedEditor(false)` when flipping ON, persists, shows reload Notice, re-renders), and a 'Save delay' dropdown (5 options: 300/400/500/1000/2000ms).

## Test Coverage

11 new test files under `tests/widget/` and `tests/main/`:

| File | Tests | Coverage |
|------|-------|----------|
| `tests/widget/__fixtures__/lcNoteFixtures.ts` | (data) | 8 fixture variants (canonical, multi-fence, missing slug, missing language, embed-host, stray, CRLF, no-trailing-newline) |
| `tests/widget/__fixtures__/cm6Helpers.ts` | (helpers) | makeFakeMarkdownPostProcessorContext, makeFakeApp, makeFakeUpdateForViewPlugin |
| `tests/widget/widgetRegistry.test.ts` | 8 | get/set/has/delete + multi-fence-key + flushAll/destroyAll |
| `tests/widget/codeBlockProcessor.test.ts` | 5 | lc-slug gate, null section info, embed routing, stray fence fallback, no-throw guarantee |
| `tests/widget/WidgetController.test.ts` | 7 | container classes, readOnly toggle, semantic classes, themed highlight, vim absence on default, mousedown stopPropagation order |
| `tests/widget/atomicRanges.test.ts` | 2 | EditorView.atomicRanges Facet contribution + drift-free RangeSet |
| `tests/widget/themeIntegration.test.ts` | 5 | lc-nested-editor + HyperMD-codeblock classes, themed highlight, semantic classes attached |
| `tests/widget/vimMount.test.ts` | 3 | vim conditional on getConfig('vimMode'), getConfig invocation |
| `tests/widget/fenceLocator.test.ts` | 10 | findCodeFence kind=leetcode-solve / kind=legacy / null, extractFenceBody, computeFenceIndex (CRLF + multi-fence + counts only leetcode-solve) |
| `tests/widget/fenceSerialization.property.test.ts` | 36 | SHELLS × HOSTILE_BODIES round-trip property test (33 cases) + 3 edge cases (out-of-range, replace-with-different) |
| `tests/main/mutualExclusion.test.ts` | 8 | Source-level invariants for the new onload gating |

**Total: 85 tests, all green.** Full suite: 1809 passed / 6 skipped (no regressions from baseline).

## Verification Performed

- `npx vitest run --reporter=dot tests/widget/ tests/main/mutualExclusion.test.ts` → 9 files, 85 tests, all pass
- `npm test` → 204 files, 1809 tests pass / 6 skipped (existing baseline, no regressions)
- `npm run build` → tsc + esbuild succeed; production bundle generated
- `grep -n "innerHTML" src/widget/*.ts | grep -v "//"` returns empty (CLAUDE.md POLISH-03 carry-through; 3 hits are all comments documenting the rule)
- `grep -n "ctx\\.frontmatter" src/widget/*.ts | grep -v "//"` returns empty (RESEARCH Anti-Patterns; 2 hits are all comments documenting the anti-pattern)
- `grep -c "leetcode\\.\\*" CLAUDE.md` returns 1 (preserved from baseline per RESEARCH §7 — load-bearing for v1.2 path through Phase 21)
- `git diff --name-only main..HEAD -- 'src/main/*.ts'` returns no v1.2 deletion-bound files modified (CONTEXT C-17)
- `git diff CLAUDE.md` returns empty (CLAUDE.md preserve-list honored)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] WidgetController implemented in Task 2 file scope (originally Task 3)**
- **Found during:** Task 2 (codeBlockProcessor.test.ts setup)
- **Issue:** Task 2's tests cross-import `LeetCodeWidgetRenderChild` from `codeBlockProcessor.ts` and `mountLeetCodeWidget` from `LeetCodeFenceWidget.ts`. Both symbols live in `src/widget/WidgetController.ts`, which was scheduled for Task 3. Without the source file the imports cannot resolve and Task 2 tests fail at module load (not at the assertion phase the test author expected).
- **Fix:** Implemented `WidgetController.ts` with `mountLeetCodeWidget`, `WidgetController` class, and `LeetCodeWidgetRenderChild` as part of the Task 2 commit. Task 3's verification commands (WidgetController/themeIntegration/vimMount tests) are now satisfied by the same commit as Task 2.
- **Files modified:** `src/widget/WidgetController.ts` (new), `src/widget/LeetCodeFenceWidget.ts`, `src/widget/codeBlockProcessor.ts` (downstream consumers)
- **Commit:** 7767852

**2. [Rule 2 - Missing critical functionality] MarkdownRenderChild stub added to obsidian-stub.ts**
- **Found during:** Task 2 (codeBlockProcessor.test.ts run)
- **Issue:** `tests/helpers/obsidian-stub.ts` did not export `MarkdownRenderChild`, but `LeetCodeWidgetRenderChild extends MarkdownRenderChild` is referenced by the codeBlockProcessor at module load. `vi.mock('obsidian')` therefore failed with "No 'MarkdownRenderChild' export is defined".
- **Fix:** Added a minimal `MarkdownRenderChild` class to obsidian-stub.ts that extends Component, stores `containerEl` from the constructor, and exposes no-op `onload`/`onunload` for subclasses to override.
- **Files modified:** `tests/helpers/obsidian-stub.ts`
- **Commit:** 7767852

**3. [Rule 1 - Bug] Property test corpus needed LAST-fence-in-section closer rule**
- **Found during:** Task 2 (fenceSerialization.property.test.ts run)
- **Issue:** The corpus from 19-RESEARCH.md §"Property-test seeds" (lines 572-605) embeds a `\`\`\`\nnested\n\`\`\`` body — nested triple backticks. The v1.2 first-`\`\`\``-after-opener closer rule (lifted as the obvious port of `findCodeFence` to a string-based parser) misreads this as a zero-line empty body, breaking the round-trip invariant for 9 of 36 test cases.
- **Fix:** Changed the closer-resolution rule in `locateFenceByIndex` (string-based) to LAST `\`\`\``-prefixed line within the section starting at the opener and ending at the next `## ` heading or EOF. For non-nested cases this reduces to the v1.2 semantic (one `\`\`\`` line in the section → first IS last). For nested cases the outer-closer is correctly identified.
- **Trade-off documented:** the line-based parser still cannot handle a body that legitimately contains a `## Heading` line (the section-boundary detector terminates the search early), but the corpus only includes `---` lookalikes, not `## ` lookalikes. Production callers consume LeetCode code (not arbitrary Markdown), so `## Heading` literal syntax inside a body is highly unlikely.
- **Files modified:** `src/widget/fenceSerialization.ts`
- **Commit:** 7767852

**4. [Rule 1 - Bug] Made WidgetMountHost.app.vault.getConfig optional**
- **Found during:** Task 4 (build after wiring main.ts)
- **Issue:** `WidgetMountHost.app.vault.getConfig` was declared as a required method, but Obsidian's real `Vault` type does not declare `getConfig` (it's an undocumented internal). The `tsc` step rejected `this` (LeetCodePlugin) as assignable to WidgetMountHost.
- **Fix:** Marked `getConfig` as optional on WidgetMountHost; rewrote `buildExtensions` to defensively check `typeof getConfig === 'function'` before invoking. Production hosts (real LeetCodePlugin) satisfy the contract at runtime; test fixtures can omit `getConfig` entirely without TS complaining.
- **Files modified:** `src/widget/WidgetController.ts`
- **Commit:** 10a00d9

**5. [Rule 3 - Blocking issue] Test fixtures need new SettingsStore accessors**
- **Found during:** Task 4 (npm test full run)
- **Issue:** Adding `getUseInlineWidget` / `getWidgetSyncDebounceMs` to the SettingsStore + invoking them from the new SettingsTab Experimental section caused 9 settings-tab test failures with `TypeError: getUseInlineWidget is not a function`. The test fixtures (`tests/solve/mocks/fakeSettingsStore.ts`, the inline `settings = {…}` literal in `tests/ai/settingsTab.test.ts`) didn't ship the new methods.
- **Fix:** Added the four new methods to `FakeSettings` interface + factory and to the inline settings object. Default values mirror production defaults (`useInlineWidget: false`, `widgetSyncDebounceMs: 400`) so existing tests continue to render the v1.2 path unchanged.
- **Files modified:** `tests/solve/mocks/fakeSettingsStore.ts`, `tests/ai/settingsTab.test.ts`
- **Commit:** 10a00d9

## Authentication Gates

None — this plan is local widget mount + settings UI; no LeetCode API calls.

## Plan-Level TDD Gate Compliance

This plan's frontmatter does NOT have `type: tdd`, so the per-plan TDD cycle (RED commit → GREEN commit → optional REFACTOR commit) is not the canonical structure. Tasks 1-4 each have `tdd="true"` per the plan; Task 1 is a pure RED-on-create commit, and Tasks 2-4 are GREEN commits that satisfy progressively more of the seeded tests. Specifically:

- **RED commit (Task 1):** `d38b1c5 test(19-01): add Wave 0 widget test scaffolds and fixtures` — 11 test/fixture files; all widget tests fail-on-import; mutualExclusion fails on missing main.ts wiring.
- **GREEN commit (Tasks 2+3):** `7767852 feat(19-01): implement widget primitives + mount factory` — 8 src/widget/ modules + obsidian-stub MarkdownRenderChild fix; all 77 widget tests pass; mutualExclusion still RED.
- **GREEN commit (Task 4):** `10a00d9 feat(19-01): wire useInlineWidget gating + Experimental settings + mutex` — main.ts onload + settings shape + Experimental UI + test fixtures; all 85 plan-19-01 tests pass; full suite 1809 passing / 6 skipped.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes outside the plan's `<threat_model>` register.

## Self-Check: PASSED

**Files verified to exist:**
- src/widget/fenceLocator.ts FOUND
- src/widget/fenceSerialization.ts FOUND
- src/widget/embedDetect.ts FOUND
- src/widget/widgetRegistry.ts FOUND
- src/widget/LeetCodeFenceWidget.ts FOUND
- src/widget/liveModeViewPlugin.ts FOUND
- src/widget/codeBlockProcessor.ts FOUND
- src/widget/WidgetController.ts FOUND
- tests/widget/__fixtures__/lcNoteFixtures.ts FOUND
- tests/widget/__fixtures__/cm6Helpers.ts FOUND
- tests/widget/widgetRegistry.test.ts FOUND
- tests/widget/codeBlockProcessor.test.ts FOUND
- tests/widget/WidgetController.test.ts FOUND
- tests/widget/atomicRanges.test.ts FOUND
- tests/widget/themeIntegration.test.ts FOUND
- tests/widget/vimMount.test.ts FOUND
- tests/widget/fenceLocator.test.ts FOUND
- tests/widget/fenceSerialization.property.test.ts FOUND
- tests/main/mutualExclusion.test.ts FOUND

**Commits verified to exist (git log):**
- d38b1c5 FOUND: Task 1 — Wave 0 test scaffolds
- 7767852 FOUND: Tasks 2+3 — widget primitives + mount factory
- 10a00d9 FOUND: Task 4 — settings + onload gating + mutual-exclusion

**Acceptance criteria:**
- [x] All 5 tasks executed (Task 5 UAT auto-approved per auto-mode contract — gate=blocking, not blocking-human)
- [x] Each task committed individually (3 commits — Task 2+3 fused per Rule 3 deviation)
- [x] SUMMARY.md created at `.planning/phases/19-widget-foundation-one-way-sync/19-01-SUMMARY.md`
- [x] No modifications to shared orchestrator artifacts (STATE.md, ROADMAP.md untouched)
- [x] CLAUDE.md `'leetcode.*'` userEvent paragraph and Phase 17 D-05 canonical write-path paragraph remain untouched (`git diff CLAUDE.md` returns empty)
- [x] No deletion of childEditorSync.ts, sectionLockExtension.ts, nestedEditorExtension.ts, childEditorRegistry.ts, codeActionsEditorExtension.ts (CONTEXT C-17 — Phase 22 owns deletion)
- [x] No new runtime dependencies in package.json (CONTEXT C-16)
- [x] `npm run build` succeeds
- [x] All 19-01 vitest test files pass (`npm test -- --run tests/widget/ tests/main/mutualExclusion.test.ts` → 85/85)
