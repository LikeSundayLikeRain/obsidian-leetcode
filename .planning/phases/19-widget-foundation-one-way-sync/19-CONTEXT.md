# Phase 19: Widget Foundation + One-Way Sync - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 19 delivers the foundation of the v1.3 inline widget architecture: a self-contained `leetcode-solve` code-block widget that renders in both Reading mode and Live Preview, persists state across unmount/remount, writes edits to disk via debounced one-way sync, never loses data, and runs strictly behind a hard-gated `useInlineWidget=OFF` default while v1.2's nested-editor path remains the user-facing default.

In scope: dual mount paths (`registerMarkdownCodeBlockProcessor` + ViewPlugin with `Decoration.replace`), shared `mountLeetCodeWidget` factory, content-hash self-write suppression with 2-second TTL, per-file flush rate-limit (1/200ms), debounced writer (400ms default; configurable 300/500/1000/2000ms via Experimental settings), flush-on-transition hooks (unmount, plugin-unload, leaf-change, file-rename, button-click, beforeunload), state-persistence map keyed by `${file.path}::${fenceIndex}` with 30-second TTL, `EditorView.atomicRanges` on parent CM6, `lc-slug` frontmatter gating with static `<pre><code>` fallback, language fallback to Python with Notice when `lc-language` missing/unrecognized, byte-exact round-trip serialization, embed read-only detection, stray-fence read-only handling, theme integration carry-over (lc-nested-editor + HyperMD-codeblock + childEditorSemanticClasses), 8 v1.2 language packs via languageCompartment, and conditional vim mount when `app.vault.getConfig('vimMode')` is true.

Out of scope (Phase 20–22): action row / buttons inside widget DOM (ACTION-*), language switching reactivity via `metadataCache.on('changed')` (Phase 20), live `Compartment.reconfigure` for vim toggle (Phase 20), external-edit reconciliation + conflict modal (SYNC-04/05, Phase 20), narrowed `sectionProtectionExtension.ts` (Phase 20), v1.2 fence-tag migration (Phase 21), deletion of legacy files and `useInlineWidget` cutover (Phase 22).

</domain>

<decisions>
## Implementation Decisions

### Carry-Forward (locked by PROJECT.md / SUMMARY.md / REQUIREMENTS.md — not re-litigated)

- **C-01:** Fence tag = `leetcode-solve`; language metadata moves to `lc-language` frontmatter. Fence opener no longer encodes language. (PROJECT.md Key Decisions; REQUIREMENTS Q1)
- **C-02:** Two-path mount is non-negotiable — `registerMarkdownCodeBlockProcessor('leetcode-solve', handler)` for Reading mode + `registerEditorExtension([leetCodeFenceViewPlugin])` ViewPlugin with `Decoration.replace({ widget })` for Live Preview, both calling a shared `mountLeetCodeWidget(host, source, file, plugin)` factory. (SUMMARY primitive 1; verified vs. Dataview source)
- **C-03:** Reading mode = live CM6 with `EditorView.editable.of(false)` — single render path across modes. (Q3; WIDGET-07)
- **C-04:** Self-write suppression = per-path content-hash map with 2-second TTL — NOT a boolean flag. Boolean is provably broken under concurrent multi-file flushes (PITFALLS P1). Map shape: `Map<string, { expectedHash: string, expiresAt: number }>`. Armed inside `debouncedWriter.flush()` before `vault.process`; consumed in `vault.on('modify')` handler. (SUMMARY primitive 3; SYNC-03)
- **C-05:** `EditorView.atomicRanges` on parent CM6 — load-bearing primitive that prevents the parent cursor from entering the widget's fence range. Without it, Live Preview unmounts the widget on cursor approach and destroys child editor state. (SUMMARY primitive 2; WIDGET-02)
- **C-06:** Debounced writer 400ms default, configurable 300 / 500 / 1000 / 2000ms via Experimental settings (see D-08). Use Obsidian's built-in `debounce(cb, 400, true)` (`Debouncer<T,V>` with `.run()` and `.cancel()`); do NOT add lodash. (SUMMARY primitive 4; SYNC-01)
- **C-07:** `flushNow()` is called on: `MarkdownRenderChild.onunload()`, `Plugin.onunload()`, `workspace.on('active-leaf-change')`, button clicks (Run/Submit/AI Debug — once buttons land in Phase 20), file rename, `window.addEventListener('beforeunload')`. (SYNC-02)
- **C-08:** Per-file flush rate-limit: max 1 flush per 200ms to prevent file-watcher storms (Obsidian Sync, iCloud, Git auto-commit). (SYNC-07)
- **C-09:** State persistence = plugin-level `Map<string, ChildEditorState>` keyed by `${file.path}::${fenceIndex}` with 30-second TTL. On `MarkdownRenderChild.onunload()`: capture cursor, scroll, undo history → write to map; on remount: hydrate. Live Preview unmount is treated as "blur," not "close." (WIDGET-04; SUMMARY primitive 5)
- **C-10:** `lc-slug` frontmatter is the gate before mounting an editable widget. Non-LC fences render static `<pre><code>` fallback; never crash. `ctx.getSectionInfo(el)` is called at use time (not at mount time); render fallback if null. (WIDGET-05; SUMMARY primitive 6)
- **C-11:** Language fallback = Python with a `Notice` when `lc-language` frontmatter is missing or unrecognized. (WIDGET-06)
- **C-12:** All 8 v1.2 language packs (Python, Java, C++, JavaScript, TypeScript, C, Go, Rust) carry over via the existing `languageCompartment` from `src/main/childEditorLanguage.ts`. (WIDGET-08)
- **C-13:** Theme integration carries over verbatim from v1.2: `lc-nested-editor` + `HyperMD-codeblock` container classes, plus `childEditorSemanticClasses.ts` Lezer→semantic CSS class mapping. Community themes cascade in. (THEME-01/02/03)
- **C-14:** Vim mount is conditional on `app.vault.getConfig('vimMode')` at widget mount time. Vim keystrokes are confined to the embedded editor by `atomicRanges` (no leakage to parent doc). Live `Compartment.reconfigure` for runtime toggle is Phase 20. (VIM-01, VIM-04)
- **C-15:** Embed detection = `.markdown-embed`/`.internal-embed` ancestor check OR `ctx.sourcePath` mismatch with rendered TFile path. Embeds render read-only widget. Stray `\`\`\`leetcode-solve` fence in non-LC note (no `lc-slug`) renders read-only widget — never crashes, never offers Run/Submit (which won't exist in Phase 19 regardless — see D-04). (EMBED-03/04)
- **C-16:** No new runtime dependencies. All primitives come from `obsidian@1.12.3`, `@codemirror/view@6.38.6`, `@codemirror/state@6.5.0`, `@replit/codemirror-vim@6.3.0` — already pinned. (SUMMARY §Stack Additions)
- **C-17:** Files to delete (Phase 22, not Phase 19): `childEditorSync.ts`, `sectionLockExtension.ts`, `nestedEditorExtension.ts`, `childEditorRegistry.ts`, `codeActionsEditorExtension.ts`. Phase 19 leaves all five intact and reachable behind the `useNestedEditor` flag.

### State-Persistence Map Key

- **D-01:** `fenceIdentity` is the **ordinal index of the `leetcode-solve` fence in the file** (`0, 1, 2, ...`), not a hash of opener/body. Hash-of-mutable-content rotates on every keystroke, defeats the persistence map's purpose, and produces orphan entries. Index is stable across body edits (which is the dominant unmount cause: viewport scroll, mode switch, theme change). LC notes have exactly one `leetcode-solve` fence in practice (always index 0); multi-fence support is a free side effect for embeds + stray-fence scenarios. **Why:** the key MUST be invariant under body edits — that's the entire point of the persistence map. Inserting a fence above the active one shifts indices, but only across an unmount/remount and only within the 30-second TTL window — accepted tradeoff. **How to apply:** state-map key is exactly `${file.path}::${fenceIndex}`; widget controllers compute `fenceIndex` by counting prior `\`\`\`leetcode-solve` openers up to the current fence's `getSectionInfo().lineStart` at mount time.

### Live Preview Unmount Mitigation (PITFALLS P3)

- **D-02:** Ship **both** mitigations in Phase 19: (a) `el.addEventListener('mousedown', e => e.stopPropagation())` on widget root as a cheap empirical defense against Obsidian's "reveal raw source" cursor-place behavior, and (b) the state-persistence map (already C-09) as the load-bearing fallback. Belt-and-suspenders: stopPropagation handles cursor-approach unmounts if it works empirically; persistence map handles every other unmount path (viewport scroll, mode switch, theme change, beforeunload) regardless. **Why:** stopPropagation is empirically untested in Obsidian's Live Preview cursor-placement pipeline; persistence map is needed anyway for non-cursor unmounts; cost of shipping both is ~3 LOC and one event listener.

### Initial Widget Scope (Phase 19 vs. Phase 20)

- **D-03:** Phase 19 widgets render code only — **no action row, no language chevron, no buttons**. The widget DOM contains exactly the embedded `EditorView` and its theme/atomicRanges chrome. ACTION-* requirements are explicitly Phase 20. **Why:** with `useInlineWidget=OFF` default, no end-user sees the widget in Phase 19 — the only consumers are dev-vault dogfood and tests. Adding throwaway buttons (placeholders or v1.2 reading-mode buttons reused below the widget) creates removal work and confuses bisection. **How to apply:** `WidgetController.mount(el)` appends only the EditorView; no `widgetActions.ts` import in Phase 19. Plan 19-04 (or whichever Plan handles polish) should leave a TODO comment at the action-row mount point that Phase 20 plans expand.
- **D-04:** Stray `\`\`\`leetcode-solve` fence in non-LC notes never offers Run/Submit (EMBED-04 requirement) — but in Phase 19 this is automatic because no LC note offers them either (D-03). The action-row gate (lc-slug-required) lands in Phase 20.

### useInlineWidget Gating

- **D-05:** **Hard-gate.** When `useInlineWidget=OFF`, `registerMarkdownCodeBlockProcessor('leetcode-solve', …)` and the ViewPlugin are NOT registered at all. Stray `leetcode-solve` fences fall back to Obsidian's default code-block rendering. The v1.2 nested-editor path is the only path. **Why:** soft-gate (mount but read-only) creates two CM6 instances per fence (parent's nested-editor widget + Phase 19's read-only widget) — guaranteed visual collision and double the surface for bugs. Per-note opt-in via frontmatter adds a flag to maintain through Phase 22 and cuts across the global setting. Hard-gate gives clean bisection: bug → flip flag → bisect against v1.2 baseline. **How to apply:** in `Plugin.onload()`, the `useInlineWidget` check wraps both `registerMarkdownCodeBlockProcessor` and `registerEditorExtension([leetCodeFenceViewPlugin])` calls. When OFF, neither runs. The widget code lives in `src/widget/` but is unreachable.
- **D-06:** Mutual exclusion: `useInlineWidget=ON` AND `useNestedEditor=ON` is invalid. Phase 19 plans must include an `assert` that forces `useNestedEditor=false` when `useInlineWidget=true` (with a `Notice` informing the user), and prevents the toggle UI from setting both. (See SUMMARY Q4 / Key Decision #4.)
- **D-07:** Both `useInlineWidget=OFF` and `useInlineWidget=ON` paths must remain regression-clean through Phase 21. Phase 22 deletes `useNestedEditor`, the v1.2 path, and the `useInlineWidget` flag itself (default-ON, then deletion is mechanical).
- **D-08:** Settings UI placement = **'Experimental' subsection** of the Settings tab. Visible but cordoned. Includes the `useInlineWidget` toggle and the debounce-delay slider (300/500/1000/2000ms — SYNC-01). **Why:** hidden dev flag risks dogfood drift (the user/maintainer forgets to test the new path); prominent toggle invites bug reports from users who don't know what they opted into. Experimental is the clear contract. **How to apply:** new `Settings → Experimental` section with a banner: "These features are under development and may change between releases." Section is removed in Phase 22 when `useInlineWidget` becomes unconditional.

### Round-Trip Verification

- **D-09:** SYNC-06 byte-exactness is verified via **property tests + post-flush hash diagnostic**. (a) Vitest property tests on the pure functions `extractFenceBody(noteBody, fenceIndex)` and `rewriteFenceBody(noteBody, fenceIndex, newBody)` over 100+ generated bodies covering: triple backticks inside fence, frontmatter-like `---` lines inside fence, CRLF vs LF line endings, leading/trailing tab and space whitespace, empty body, single-line body, body ending mid-character. (b) Runtime `console.warn` ("LC widget: post-flush hash drift detected for {path}") when `sha1(extractFenceBody(disk-after-flush, index))` ≠ `sha1(widget.state.doc.toString())`. **Why:** property tests catch serialization bugs in pure code; runtime diagnostic catches integration drift where `vault.process` or the modify-handler diverges from the pure transform. Fail-loud (throw + abort flush) was rejected — false positives could brick a session mid-typing; warn-only is observable in DevTools without disrupting the user. **How to apply:** ship `src/widget/__tests__/fenceSerialization.property.test.ts`; add hash-compare diagnostic at the tail of `debouncedWriter.flush()` after `vault.process` returns. Strip the diagnostic in Phase 22 cutover (or leave behind a settings flag — planner decides).

### Plan Structure (advisory — gsd-planner finalizes)

- **D-10:** **Vertical-slice plan split.** Suggested 4 plans:
  - **Plan 19-01 — Minimal mount (no sync, no state, no actions).** Two-path mount with shared `mountLeetCodeWidget` factory; renders an editable CM6 inside `\`\`\`leetcode-solve` fences in Reading + Live Preview behind `useInlineWidget=ON`. `lc-slug` gate; static `<pre><code>` fallback for non-LC fences. `EditorView.atomicRanges` on parent. Carry-over: language packs (8), theme classes, semanticClasses, conditional vim from `getConfig('vimMode')`. Property tests for `extractFenceBody`/`rewriteFenceBody` (no live writes yet). Settings: add `useInlineWidget` toggle in Experimental subsection. Acceptance: typing in the widget appears in the embedded EditorView; nothing writes to disk yet.
  - **Plan 19-02 — Debounced one-way sync + suppression.** `debouncedWriter` (Obsidian `debounce`, 400ms default; configurable via Experimental settings), per-path content-hash suppression map (2s TTL), per-file flush rate-limit (1/200ms), `vault.process` write path, `vault.on('modify')` self-write consumption. Flush-on-transition hooks: unmount, plugin-unload, leaf-change, file-rename, beforeunload. Post-flush hash drift diagnostic. Acceptance: typing → 400ms later, fence body on disk byte-matches widget doc; force-quit Obsidian within ms of typing → most-recent characters present on next open.
  - **Plan 19-03 — State persistence + P3 mitigation.** State-persistence `Map<string, ChildEditorState>` keyed by `${file.path}::${fenceIndex}` with 30s TTL. Capture cursor/scroll/undo on `onunload`, hydrate on mount. `mousedown.stopPropagation()` on widget root. Acceptance: close note → reopen within 30s → cursor + scroll + undo restored at the fence; cursor cannot enter fence range from parent (atomicRanges).
  - **Plan 19-04 — Embed + stray fence + property-test hardening.** `.markdown-embed` / `.internal-embed` ancestor + `ctx.sourcePath` mismatch detection → read-only widget for embeds. Stray-fence path (no `lc-slug` → static `<pre><code>` for inert fence body, OR static read-only widget — planner decides which fallback per fence kind). Language-fallback Notice for missing `lc-language`. Round-trip property-test corpus expansion (CRLF, nested backticks, edge whitespace). Mutual-exclusion assert (`useInlineWidget` + `useNestedEditor`). Acceptance: `![[lc-note]]` embed shows read-only widget; stray `\`\`\`leetcode-solve` in non-LC note never crashes and never escalates editor capabilities.
  - **Why vertical-slice:** Plan 19-01 alone yields a runnable widget for visual inspection; each subsequent plan ships an end-to-end working slice with its own UAT and bisection point. By-axis splitting (mount / sync / state / embed / theme as separate plans) requires 3+ plans before the widget can be exercised at all, slowing dogfood and inflating the bug-discovery half-life. **How to apply:** pass these 4 plans as a recommendation to gsd-planner; the planner has discretion to merge or split based on dep-graph + LOC budget per plan.

### Claude's Discretion

- File naming under `src/widget/`: SUMMARY suggests `codeBlockProcessor.ts`, `WidgetController.ts`, `debouncedWriter.ts`, `selfWriteSuppression.ts`, `widgetRegistry.ts`. Planner may consolidate (e.g., merge `selfWriteSuppression` into `debouncedWriter` if cleaner) or split (e.g., separate `liveModeViewPlugin.ts` from `readingModeProcessor.ts`).
- `fenceIndex` computation strategy: counting prior `\`\`\`leetcode-solve` openers up to `getSectionInfo().lineStart` is the obvious approach, but the planner may prefer a Lezer syntax-tree walk if it's measurably faster for large notes.
- Property-test seed values: planner picks a reasonable corpus size (100+ minimum); fast-check or a hand-written generator both acceptable.
- Diagnostic gating: post-flush hash diagnostic always-on vs. only when an Experimental "verbose logging" flag is set. Default to always-on for Phase 19 (it's behind `useInlineWidget=OFF` anyway).
- The exact set of test files lifted from `tests/main/` to seed Phase 19 coverage (e.g., `findCodeFence` tests if that helper migrates into the widget controller).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.3 Research (direct foundation)
- `.planning/research/SUMMARY.md` — Synthesized research summary; Q1–Q7 decisions, 4-phase build order, dual mount + atomicRanges + hash suppression primitives, migration strategy. **READ FIRST.**
- `.planning/research/STACK.md` (417 LOC) — Two-path mount requirement, `WidgetType.eq()` / `ignoreEvent()` patterns, self-write suppression Set shape, Obsidian `debounce` API, CM6 version pin discrepancy.
- `.planning/research/FEATURES.md` (280 LOC) — `EditorView.atomicRanges` as load-bearing primitive, vim live-reconfigure plan, anti-feature catalogue.
- `.planning/research/ARCHITECTURE.md` (340 LOC) — Exact cutlist with LOC counts, dead-path audit (every existing main.ts callsite), `src/widget/` file layout proposal, dual-flag coexistence strategy.
- `.planning/research/PITFALLS.md` (1005 LOC) — Especially P1 (self-write echo), P3 (Live Preview raw-source reveal), P4 (debounce data loss on Cmd-Q), P14 (widget identity), P15 (getSectionInfo null), P17 (mode lifecycle), P18 (cachedRead vs read), P22 (non-LC mount), P23 (language fallback).

### Project / Milestone State
- `.planning/PROJECT.md` — Key Decisions table includes v1.3 architecture decisions (rows for "Inline code-block widget + one-way sync", "Reload-on-vim-toggle accepted", and others). Bundle-ceiling history.
- `.planning/REQUIREMENTS.md` — Full v1.3 requirements list with traceability table. Phase 19 owns: WIDGET-01..08, SYNC-01..03, SYNC-06..07, EMBED-01..04, VIM-01, VIM-04, THEME-01..03.
- `.planning/ROADMAP.md` §"Phase 19: Widget Foundation + One-Way Sync" — Goal, success criteria, key risks/notes.
- `.planning/STATE.md` — Recent decisions affecting Phase 19 (v1.2 architecture lessons that informed v1.3 thesis).

### v1.2 Code Files (touch points / reusable)
- `src/main/childEditorFactory.ts` (482 LOC) — **Repurpose.** Drop the parent-binding seam; widget mounts the EditorView in its own container. Output type stays `EditorView`. (ARCHITECTURE §1)
- `src/main/childEditorLanguage.ts` (148 LOC) — **Keep verbatim.** `languageCompartment` + `buildLanguageExtensions(slug, indent)` 8-language registry.
- `src/main/childEditorTheme.ts` (152 LOC) — **Keep verbatim.** lc-nested-editor + HyperMD-codeblock theme integration.
- `src/main/childEditorSemanticClasses.ts` (297 LOC) — **Keep verbatim.** Lezer→semantic CSS class mapping.
- `src/main/codeActionsPostProcessor.ts` (67 LOC) — **Keep verbatim.** Reading-mode buttons (unaffected by widget rewrite). Note: Phase 19 widgets do NOT mount this; only v1.2 path under `useInlineWidget=OFF` keeps using it.
- `src/main/codeBlockButtonRow.ts` (99 LOC) — **Keep verbatim.** Phase 20 imports it for in-widget action row.
- `src/main/languageChevronWidget.ts` (304 LOC) — **Keep verbatim.** Phase 20 mounts it inside widget DOM.
- `src/notes/NoteTemplate.ts` — Heading shape (`## Problem` → `## Code` → `## Notes` → `## Techniques`) preserved; fence tag swap is Phase 21 (MIGRATE-08).

### v1.2 Files Touched During Phase 19 (light edits)
- `src/main.ts` — `Plugin.onload()` adds `useInlineWidget` flag check + new `registerMarkdownCodeBlockProcessor` + new `registerEditorExtension([leetCodeFenceViewPlugin])` calls. Existing v1.2 wiring stays intact under `useNestedEditor` branch. Mutual-exclusion assert.
- `src/settings/SettingsStore.ts` / `src/settings/SettingsTab.ts` — New `useInlineWidget` field; new Experimental subsection in settings UI; debounce-delay slider.

### v1.2 Phase Context (carry-forward patterns)
- `.planning/milestones/v1.2-phases/13-nested-editor-foundation/13-CONTEXT.md` — Widget pattern, registry lifecycle, lifecycle cleanup (foundation reference for Phase 19's simpler `widgetRegistry`).
- `.planning/milestones/v1.2-phases/14-bidirectional-sync/14-CONTEXT.md` — Sync echo prevention via syncAnnotation. **Phase 19 abandons this entirely** in favor of one-way sync + content-hash suppression. Read for context only.
- `.planning/milestones/v1.2-phases/15-focus-undo-cursor/15-CONTEXT.md` — `indentWithTab` keymap, escape-to-parent escape hatch (Phase 19 widget needs to preserve the escape semantics; vim under VIM-04 / atomicRanges enforces directionally).
- `.planning/milestones/v1.2-phases/16-language-packs-switching/16-CONTEXT.md` — `languageCompartment`, Compartment.reconfigure pattern; bundle ceiling history.
- `.planning/milestones/v1.2-phases/17-polish-edge-cases/17-CONTEXT.md` — `'leetcode.*'` userEvent convention (becoming obsolete in v1.3), canonical write-path pattern (D-05) being retired.

### CLAUDE.md Conventions (status update)
- `CLAUDE.md` §"Conventions" — `'leetcode.*'` userEvent paragraph and "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph remain in CLAUDE.md through Phase 21. Phase 19 plans MUST NOT delete or modify these. Phase 22 (DELETE-08) removes them.

### Obsidian / CodeMirror Reference (for planner research, if needed)
- `node_modules/obsidian/obsidian.d.ts` (installed `obsidian@1.12.3`) — `registerMarkdownCodeBlockProcessor`, `MarkdownPostProcessorContext`, `MarkdownRenderChild`, `Vault.process`, `debounce`/`Debouncer`, `EditorView.atomicRanges`, `ViewPlugin`, `Decoration.replace`, `WidgetType`.
- Dataview (community plugin) source — confirms two-path mount pattern (`registerMarkdownCodeBlockProcessor` + `registerEditorExtension`).
- Obsidian developer docs (Context7 `/obsidianmd/obsidian-developer-docs`) — code-block processor + ViewPlugin registration patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (verbatim or light-modify)
- `src/main/childEditorFactory.ts` — Repurpose for widget-internal CM6 mount. Drop parent-binding seam; output stays `EditorView`.
- `src/main/childEditorLanguage.ts:languageCompartment` + `buildLanguageExtensions(slug, indent)` — 8-pack registry; verbatim.
- `src/main/childEditorTheme.ts` — `lc-nested-editor` + `HyperMD-codeblock` classes; verbatim.
- `src/main/childEditorSemanticClasses.ts` — Lezer→CSS class ViewPlugin; verbatim.
- `src/main/codeActionsEditorExtension.ts:findCodeFence` — Lift into `src/widget/fenceLocator.ts` (or inline into `WidgetController`); the function is still needed for fence-body slice during widget mount. Keep test coverage from `tests/main/codeActionsEditorExtension.test.ts` for the lifted function. (Phase 22 deletes the source file; Phase 19 just imports.)
- `app.vault.getConfig('vimMode')` — Read at widget mount (VIM-01).
- `app.vault.process(file, fn)` — Atomic file rewrite primitive; widget's only write path.
- `app.vault.on('modify', handler)` — External-write listener; consults suppression map.
- Obsidian's built-in `debounce(cb, delay, resetTimer)` returning `Debouncer<T,V>` with `.run()` and `.cancel()` — no lodash.
- `Plugin.registerMarkdownCodeBlockProcessor(lang, handler)` — Reading-mode mount.
- `Plugin.registerEditorExtension(ext[])` — Live-Preview mount via ViewPlugin.

### Established Patterns
- **Compartment-based config swap** (from Phase 16): `languageCompartment.reconfigure(buildLanguageExtensions(slug, indent))`. Phase 19 reuses for language pack mount; Phase 20 extends for live language switching via `metadataCache.on('changed')`.
- **Vault-layer write discipline** (from v1.0/v1.1): all plugin writes touching the fence body go through `app.vault.process(file, fn)`. Phase 19's `debouncedWriter` is the single channel for the widget's writes.
- **`registerEvent()` for plugin lifecycle cleanup**: every event handler registered through the plugin instance gets auto-unregistered on `Plugin.onunload()`. Phase 19 widget controllers register their `vault.on('modify')` listener through the plugin.
- **`MarkdownRenderChild` lifecycle**: Reading-mode mounts use `ctx.addChild(new LeetCodeWidgetRenderChild(...))` so unmount auto-fires on host re-render. Live-Preview mounts use `WidgetType.destroy()` for the equivalent hook.
- **Decoration ordering** (from Phase 13): `RangeSetBuilder` requires sorted-order. Phase 19 ViewPlugin adds at most one `Decoration.replace` per fence — no ordering complexity.

### Integration Points
- `src/main.ts:Plugin.onload()` — Adds two new registration calls behind `useInlineWidget` flag check. Mutual-exclusion assert.
- `src/main.ts:Plugin.onunload()` — Adds `widgetRegistry.flushAll()` synchronous drain.
- `src/settings/SettingsStore.ts` — Adds `useInlineWidget: boolean` field (default `false`) and `widgetSyncDebounceMs: number` field (default `400`).
- `src/settings/SettingsTab.ts` — Adds Experimental subsection with toggle + slider.
- `src/widget/` — New directory; ~600 LOC budget. Files per SUMMARY §2 (`codeBlockProcessor.ts`, `WidgetController.ts`, `debouncedWriter.ts`, `selfWriteSuppression.ts`, `widgetRegistry.ts`); Phase 19 adds `__tests__/fenceSerialization.property.test.ts`. `widgetActions.ts` and `fenceMigrator.ts` are Phase 20 / 21.
- `tests/widget/` — New test directory mirroring `src/widget/`.
- `package.json` — No new runtime deps in Phase 19. New dev-dep candidate: `fast-check` (~50 KB) for property tests, optional — planner picks if hand-written generator is sufficient.

</code_context>

<specifics>
## Specific Ideas

- **`mousedown.stopPropagation()` is the bet, not the contract.** D-02's belt-and-suspenders is a deliberate hedge — if the empirical probe in Plan 19-01 / 19-03 dev-vault testing shows stopPropagation reliably prevents Live Preview cursor-place "raw source reveal," the persistence map's importance for that specific scenario drops. Either way, persistence map ships in 19-03 — its job covers many other unmount paths.
- **Hard-gate is non-negotiable for clean bisection.** With v1.2's nested-editor still being the user-facing default through Phase 21, every bug report needs a clean "is this v1.2 or v1.3?" answer. Soft-gate (two CM6s simultaneously) muddies that. Per-note opt-in adds a maintenance flag that gets deleted in Phase 22 anyway.
- **400ms debounce is a starting point, not a constraint.** SYNC-01 makes it user-configurable for a reason — testers may find 300ms feels snappier or 500ms reduces file-watcher noise. Don't bake 400 into anything that can't be re-tuned.
- **Property tests catch one class of bug; the runtime hash diagnostic catches another.** Don't conflate them. Pure-function tests verify `extractFenceBody`/`rewriteFenceBody` are inverses. The runtime diagnostic verifies that what the widget THINKS it wrote matches what `vault.process` actually persisted. Different failure modes.
- **Vertical-slice plan ordering matters for dogfood.** Plan 19-01 yields a visible widget that does nothing yet (no writes); Plan 19-02 makes typing land on disk; Plan 19-03 makes state survive scroll/mode-switch; Plan 19-04 hardens edge cases. Each Plan completion is a dogfood checkpoint with its own UAT.

</specifics>

<deferred>
## Deferred Ideas

- **Live `Compartment.reconfigure` for vim toggle (VIM-02)** — Phase 20. Phase 19 mounts vim conditionally at widget creation only; toggling the Obsidian vim setting requires a note reload until Phase 20.
- **Action row mounted inside widget DOM (ACTION-01..06)** — Phase 20. Phase 19 widgets render code only.
- **Language switching reactivity via `metadataCache.on('changed')` (ACTION-03)** — Phase 20.
- **External-edit reconciliation + conflict modal (SYNC-04, SYNC-05)** — Phase 20. Phase 19 ships the suppression map (which distinguishes self vs. external writes); Phase 20 adds the cursor-preserving reload + conflict UX on top.
- **Narrowed `sectionProtectionExtension.ts` replacing `sectionLockExtension.ts` (PROTECT-01, PROTECT-02)** — Phase 20.
- **Live theme re-themeing (THEME-04)** — Phase 20.
- **`'leetcode.*'` userEvent convention removal (PROTECT-03)** — Phase 22.
- **v1.2 fence-tag migration (MIGRATE-01..10)** — Phase 21.
- **Deletion of `childEditorSync.ts`, `sectionLockExtension.ts`, `nestedEditorExtension.ts`, `childEditorRegistry.ts`, `codeActionsEditorExtension.ts` (DELETE-01..07)** — Phase 22.
- **`useInlineWidget` flip to default ON, removal of `useNestedEditor` fork in `src/main.ts` (POLISH-01, DELETE-06)** — Phase 22.
- **Theme regression visual gate (THEME-05)** — Phase 22.
- **README v1.3 architecture overview, migration docs, Cmd-Z/Cmd-F scoping notes (POLISH-04)** — Phase 22.
- **Empirical probe of `mousedown.stopPropagation()` effectiveness** — surfaces inside Plan 19-01 or 19-03 dev-vault testing. If it fails, persistence map carries the load (no Phase 19 escalation needed). If it succeeds reliably, Phase 22 cleanup may simplify by removing the listener.
- **Multi-pane live/mirror semantics (MULTI-01, MULTI-02 — v1.4+)** — single-active-per-file is the v1.3 baseline; deferred.

</deferred>

---

*Phase: 19-Widget Foundation + One-Way Sync*
*Context gathered: 2026-05-29*
