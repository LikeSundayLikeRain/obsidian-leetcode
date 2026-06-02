---
status: resolved
trigger: "R6 STILL FAILS after 2bf274e fix. New evidence: user sees native Java syntax highlighting (Obsidian's CM6 default renderer) not a static <pre><code> fallback. Zero LC-related console logs. lc-slug + lc-language BOTH present at open time. Workarounds: hover→Edit this block, or close+reopen."
created: 2026-06-02T00:00:00Z
updated: 2026-06-02T00:01:00Z
symptoms_prefilled: true
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The metadataCache.on('changed') handler in main.ts (line 1674) dispatches nestedEditorRebuildEffect when lc-slug appears in cache for the first time (v1.2 nested editor path), but does NOT dispatch leetcodeRefreshAnnotation for the v1.3 LP StateField path (leetCodeWidgetStateField). When metadataCache is not yet indexed at EditorState.create time (fresh-create race), the StateField stores Decoration.none. The two-rAF leetcodeRefreshAnnotation dispatch from NoteWriter may fire BEFORE metadataCache.changed fires, leaving metadataCache still empty at that moment. When metadataCache.changed finally fires, no subsequent trigger causes the StateField to recompute, so the widget stays at Decoration.none permanently."
  confirming_evidence:
    - "metadataCache.on('changed') handler at main.ts:1674 dispatches nestedEditorRebuildEffect only — zero leetcodeRefreshAnnotation dispatches. Identical in 5474c77 and HEAD."
    - "leetCodeWidgetStateField.create() reads metadataCache at construction time. Returns Decoration.none when frontmatter null (fresh-create race)."
    - "StateField update predicate only fires on tr.docChanged || tr.annotation(leetcodeRefreshAnnotation). No trigger fires after metadataCache.changed if two-rAF already completed."
    - "User sees native Java CM6 syntax highlighting (Decoration.none path). Zero LC logs. Workaround close+reopen works (fresh EditorState reads now-populated metadataCache)."
    - "NoteWriter.fireRerenderAfterNoteWritten fires two-rAF (~32ms after openLinkText). metadataCache.changed fires async after vault.modify. Race: metadataCache.changed may fire AFTER the two-rAF window."
  falsification_test: "If adding leetcodeRefreshAnnotation dispatch in metadataCache.on('changed') when useInlineWidget=ON + lc-slug present does NOT fix R6, hypothesis is wrong."
  fix_rationale: "metadataCache.on('changed') is the definitive signal that frontmatter is indexed. Dispatching leetcodeRefreshAnnotation there gives LP StateField a guaranteed recompute trigger after metadataCache populates — regardless of two-rAF timing. Mirrors the nestedEditorRebuildEffect dispatch for the v1.2 path."
  blind_spots: "If metadataCache.changed fires before EditorState is created, dispatch has no target — harmless (no matching leaves). Two-rAF is belt-and-suspenders."

next_action: Write failing test, then implement fix in main.ts metadataCache.on('changed') handler

## Symptoms

expected: Opening fresh problem from problem browser → LP widget mounts (same as R6 cycle-2 passing at 5474c77)
actual: First open → native Java syntax highlighting visible (Obsidian's CM6 default renderer). Zero LC console logs. lc-slug + lc-language BOTH present in frontmatter. Hover→"Edit this block" or close+reopen fixes it.
errors: No error messages — silent wrong-path execution. Native Obsidian "Edit this block" hover chrome visible.
reproduction: Plugin/app reload → first-time open of NEW problem from problem browser with useInlineWidget=ON, LP editor mode
started: Still present after 2bf274e fix

## Eliminated

- hypothesis: codeBlockProcessor migrate/repair gate is the cause (prior session)
  evidence: User confirms ZERO LC-related logs, no processFrontMatter. lc-slug + lc-language both present. The 2bf274e fix targets Reading mode path (codeBlockProcessor). The symptom (native Java highlighting) is the LP StateField path — CM6 rendering the fence body directly, not codeBlockProcessor output.
  timestamp: 2026-06-02

- hypothesis: The NoteWriter two-rAF mechanism is the difference between 5474c77 and HEAD
  evidence: NoteWriter.ts is byte-for-byte identical in 5474c77 and HEAD. liveModeViewPlugin.ts is also identical. setRerenderAfterNoteWritten callback in main.ts is identical. The mechanism is the same.
  timestamp: 2026-06-02

- hypothesis: Something in liveModeBannerStateField.ts StateField logic changed for fresh-create
  evidence: For fresh-create with lc-language present: needsRepair=false, repair block never entered. The Set guards added in 1a8a140 are irrelevant to this path. The StateField update predicate is unchanged.
  timestamp: 2026-06-02

- hypothesis: codeBlockProcessor fires in LP mode and was the LP widget mount mechanism in 5474c77
  evidence: main.ts:1157 comment explicitly states: "registerMarkdownCodeBlockProcessor — Reading mode". registerEditorExtension — Live Preview. codeBlockProcessor does NOT fire on LP initial render. LP uses StateField exclusively.
  timestamp: 2026-06-02

## Evidence

- timestamp: 2026-06-02
  checked: All changed files between 5474c77 and HEAD (liveModeBannerStateField.ts, codeBlockProcessor.ts, liveModeViewPlugin.ts, main.ts)
  found: NoteWriter.ts, liveModeViewPlugin.ts, StateField update predicate — all identical. Only changes are: (a) Set guards in liveModeBannerStateField (repair/migrate attempted), (b) codeBlockProcessor repaired=true branch now does rerenderReadingModePanes+staticFallback+return instead of bounded poll, (c) main.ts Set wiring.
  implication: None of these changes affect the LP StateField fresh-create path for a note with lc-language already present.

- timestamp: 2026-06-02
  checked: metadataCache.on('changed') handler at main.ts:1674 in both 5474c77 and HEAD
  found: Dispatches nestedEditorRebuildEffect only (for v1.2 nested editor). Identical in both commits. Does NOT dispatch leetcodeRefreshAnnotation for v1.3 LP StateField.
  implication: When metadataCache.changed fires (after processFrontMatter write from applyFrontmatter), the LP StateField gets NO recompute trigger. If two-rAF already fired and found empty metadataCache, widget is permanently stuck at Decoration.none.

- timestamp: 2026-06-02
  checked: R6 regression tests
  found: All 3 R6 tests are in tests/widget/codeBlockProcessor.r6Regression.test.ts — Reading mode only. No LP StateField test exists for fresh-create metadataCache-race scenario.
  implication: The LP fresh-create case was never regression-tested. R6 cycle-2 pass may have been Reading mode verification only.

- timestamp: 2026-06-02
  checked: makeReadingModeMigrationHandler for fresh v1.3 note
  found: For fresh v1.3 note with lc-slug + lc-language present: migrate()=false, repair()=false → trailing .then() skips rerenderPreviewLeaves. No leetcodeRefreshAnnotation dispatch from this path.
  implication: The file-open hook provides no LP recompute trigger for fresh v1.3 notes either.

- timestamp: 2026-06-02
  checked: Complete dispatch chain for LP fresh-create
  found: ONLY source of leetcodeRefreshAnnotation for LP is NoteWriter.fireRerenderAfterNoteWritten (two-rAF). If metadataCache is empty at two-rAF time, buildLeetCodeWidgetDecorations returns Decoration.none. metadataCache.changed fires later but no one dispatches leetcodeRefreshAnnotation in response.
  implication: ROOT CAUSE CONFIRMED. The metadataCache.on('changed') handler needs to dispatch leetcodeRefreshAnnotation for LP (useInlineWidget=ON) path, exactly as it dispatches nestedEditorRebuildEffect for the v1.2 path.

## Resolution

root_cause: "In main.ts metadataCache.on('changed') handler (line 1674): when lc-slug appears in metadataCache for the first time (fresh-create race), the handler dispatches nestedEditorRebuildEffect for the v1.2 nested-editor path but dispatches NO recompute trigger for the v1.3 LP StateField (leetCodeWidgetStateField). If the two-rAF leetcodeRefreshAnnotation dispatch from NoteWriter.fireRerenderAfterNoteWritten fires before metadataCache is populated, the StateField remains at Decoration.none permanently — metadataCache.changed fires later but nothing triggers another leetcodeRefreshAnnotation dispatch."

fix: "In the metadataCache.on('changed') handler in main.ts, when useInlineWidget=ON and lc-slug is present in cache, dispatch leetcodeRefreshAnnotation to all LP/source-mode leaves for the changed file path. Use dispatchLeetcodeRefreshToLivePreviewLeaves(this.app, file.path) (already imported). This gives leetCodeWidgetStateField a guaranteed recompute trigger immediately after metadataCache indexes the frontmatter — regardless of two-rAF timing."

verification:
files_changed:
  - src/main.ts (metadataCache.on('changed') handler: add leetcodeRefreshAnnotation dispatch for useInlineWidget=ON path)
  - tests/widget/liveModeBannerStateField.freshCreateLP.test.ts (new: LP fresh-create metadataCache-race regression test)
