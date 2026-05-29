# Research Summary — v1.3 Inline Widget Architecture

**Project:** Obsidian LeetCode Plugin
**Milestone:** v1.3 Inline Widget Architecture
**Domain:** Obsidian community plugin (TypeScript) — replacing dual-CM6 nested editor with inline code-block widget + one-way sync
**Researched:** 2026-05-28
**Confidence:** HIGH

---

## Executive Summary

v1.3 replaces the v1.2 dual-CM6 nested-editor + bidirectional sync + section-lock subsystem with a self-contained inline code-block widget driven by one-way sync. The architectural thesis: instead of keeping two CM6 editors in sync across dispatch boundaries, the file becomes the single source of truth and the widget is a thin editor that writes to it. The net result is approximately −2,400 LOC (3,000 deleted, 600 added), elimination of the entire "fence fragmentation / cmd-Z leak / locked-range dispatch" bug class, and a rendering pipeline that matches established community plugin patterns (Dataview, Kanban, Excalidraw).

The decisive architectural input from research is the **two-path mount requirement**: `registerMarkdownCodeBlockProcessor` covers Reading mode only; Live Preview parity requires a separate `registerEditorExtension` ViewPlugin with `Decoration.replace({ widget })`. This is verified against Obsidian developer docs and Dataview's source. Every phase plan must budget for both paths — shipping only one will break half of all user workflows. The second critical primitive is `EditorView.atomicRanges` on the parent editor, which prevents the parent cursor from entering the widget's fence range — without it, Obsidian's Live Preview will unmount the widget whenever the cursor approaches, destroying child editor state.

The highest-risk surface in v1.3 is migration and the self-write echo loop. Migration must follow the v1.1 lazy-on-open precedent (never batch-rewrite on plugin load) with a backup sidecar per file before rewrite. The self-write echo suppression must be a per-path content-hash map with a TTL, not a boolean flag — the boolean version is provably broken under concurrent multi-file flushes. Section-lock removal has a non-obvious regression: the v1.0 validated requirement "plugin-owned regions structurally locked" covers `## Problem` body and `## Techniques` heading, which the v1.2 `sectionLockExtension.ts` protected incidentally alongside the fence opener. Removing the extension wholesale regresses that requirement; a narrower replacement is needed.

---

## Key Decisions for v1.3

The following decisions need explicit confirmation or rejection before requirements scoping begins.

1. **Fence tag name:** Use `leetcode-solve` as the `registerMarkdownCodeBlockProcessor` language tag. Language metadata moves to the `lc-language` frontmatter key — the fence opener no longer encodes language. Fence syntax becomes ` ```leetcode-solve ` (no language slug). This is a schema simplification vs. v1.2 where the fence tag was ` ```python ` etc. **Confirm?**

2. **Vim toggle handling:** PROJECT.md accepts "reload-on-vim-toggle." FEATURES research shows `Compartment.reconfigure(enabled ? vim() : [])` is sufficient for live toggle without recreating the EditorView (CM6 docs, HIGH confidence). **Recommendation: implement live `Compartment.reconfigure` as P1; fall back to reload-on-toggle as P3 only if an empirical bug forces it.** User should confirm whether to attempt live-reconfigure first.

3. **Section-lock disposition:** ARCHITECTURE.md says delete `sectionLockExtension.ts` entirely. PITFALLS.md warns this regresses the v1.0 validated requirement (locking `## Problem` body and `## Techniques` heading). **Recommendation: rename to `sectionProtectionExtension.ts`, narrow scope to protect only `## Problem` body and `## Techniques` heading (remove fence-opener/closer protection, which is now moot). The `'leetcode.*'` userEvent bypass convention can be removed from this narrower extension.** Confirm tradeoff: narrower replacement vs. full removal.

4. **Dual-flag coexistence:** During Phase 1–3 development, introduce a `useInlineWidget` plugin setting (default OFF) alongside the existing `useNestedEditor` flag. Hard cutover at Phase 4 (flip `useInlineWidget` default ON, delete v1.2 path). `ON/ON` combination is invalid and should assert + force `useNestedEditor=OFF`. **Confirm this coexistence strategy.**

5. **Migration backup-sidecar retention period:** ARCHITECTURE.md suggests 7 days; PITFALLS.md recommends 30 days. **Recommendation: 30 days.** Backup written to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/`. **Confirm retention period.**

6. **Reading-mode widget rendering:** Live CM6 with `EditorView.editable.of(false)` gives consistent syntax highlighting and a single widget code path. Static `<pre>` is simpler and stateless. **Recommendation: live CM6 read-only.** Confirm.

7. **Migration + first-edit atomicity:** Should the v1.2→v1.3 fence rewrite (migration) and the user's first character both land in the same `vault.process` callback? **Recommendation: yes — atomic, and the write was going to happen anyway.** Confirm.

---

## Architectural Primitives (Must Land in Phase 1)

These are non-negotiable foundations. Any phase plan that defers them introduces cascading bugs.

**1. Dual mount paths (Reading Mode + Live Preview)**
- Reading mode: `Plugin.registerMarkdownCodeBlockProcessor('leetcode-solve', handler)` → `ctx.addChild(new LeetCodeWidgetRenderChild(el, source, ctx, plugin))`
- Live Preview: `Plugin.registerEditorExtension([leetCodeFenceViewPlugin])` → `ViewPlugin` scanning `syntaxTree` for `leetcode-solve` fences → `Decoration.replace({ widget: new LeetCodeFenceWidget(...) })`
- Both paths call a shared `mountLeetCodeWidget(host, source, file, plugin)` factory (~300 LOC budget)
- Pitfalls addressed: P3 (Live Preview raw-source reveal), P14 (widget identity), P17 (mode lifecycle)

**2. `EditorView.atomicRanges` on parent CM6**
- Prevents parent cursor from entering the widget's fence range
- Load-bearing primitive: Dataview omits it (display widget); v1.3 requires it (edit widget)
- Without this, TS-01 (click → edit) and TS-02 (caret stays in widget) both break

**3. Per-path content-hash suppression map (NOT a boolean flag)**
- `Map<string, { expectedHash: string, expiresAt: number }>` with 2-second TTL
- Armed in `debouncedWriter.flush()` before `vault.process`; consumed in `vault.on('modify')` handler
- Boolean flag alternative is provably broken under concurrent multi-file flushes
- Pitfalls addressed: P1 (self-write echo), P2 (multi-pane coherence), P18 (cachedRead vs read)

**4. Debounced writer with flush-on-every-transition**
- Use Obsidian's built-in `debounce(cb, 400, true)` — `Debouncer<T,V>` with `.run()` and `.cancel()`
- `flushNow()` called on: `MarkdownRenderChild.onunload()`, `Plugin.onunload()`, `workspace.on('active-leaf-change')`, button clicks (Run/Submit/AI Debug before reading code), file rename, `window.addEventListener('beforeunload')`
- Do NOT add lodash — confirmed absent from all transitive deps
- Pitfalls addressed: P4 (debounce data loss on Cmd-Q)

**5. Widget state persistence across unmount/remount**
- Plugin-level `Map<string, ChildEditorState>` keyed by `${file.path}::${fenceIdentity}` with 30-second TTL
- On `MarkdownRenderChild.onunload()`: capture cursor, scroll, undo history → write to map; on remount: hydrate
- Treat Live Preview unmount as "blur," not "close"
- Pitfalls addressed: P3 (Live Preview re-render), P14 (widget identity), P17 (mode lifecycle)

**6. `lc-slug` gating + null-safe section info**
- Check `app.metadataCache.getFileCache(file)?.frontmatter?.['lc-slug']` before mounting widget
- Render static `<pre><code>` fallback for non-LC fences; never crash
- Null-check `ctx.getSectionInfo(el)` — call at use time, not at mount time; render fallback if null
- Pitfalls addressed: P15 (getSectionInfo null), P22 (non-LC note mount), P23 (language fallback)

---

## Recommended Phase Build Order

Synthesizing ARCHITECTURE's 7-phase proposal (A–G) and PITFALLS's 4-phase proposal into **4 phases**. ARCHITECTURE phases A–C map to Phase 1; D maps to Phase 2; E maps to Phase 3; F–G map to Phase 4.

---

### Phase 1: Widget Foundation + One-Way Sync

**Goal:** A working inline widget that renders in both Reading and Live Preview modes, writes edits to disk via debounced one-way sync, and never loses data. The v1.2 path runs in parallel behind `useInlineWidget=OFF` default.

**Delivers:**
- `src/widget/` directory: `codeBlockProcessor.ts`, `WidgetController.ts`, `debouncedWriter.ts`, `selfWriteSuppression.ts`, `widgetRegistry.ts`
- Dual mount paths (Reading + Live Preview) via shared `mountLeetCodeWidget` factory
- Per-path hash suppression map with 2-second TTL
- Flush-on-transition hooks (unload, blur, beforeunload, active-leaf-change)
- Widget state persistence map (cursor, scroll, undo history across remounts)
- `lc-slug` gate + `getSectionInfo` null fallback + language pack fallback (Python as default with Notice)
- Round-trip serialization hardened: byte-level fence body slice, no `.trim()`, CRLF normalization, post-flush hash verification
- `useInlineWidget=OFF` flag; v1.2 path remains fully operational
- Rate limiter: max 1 flush per 200ms per file

**Features:** TS-01 (click→focus→type), TS-02 (atomicRanges), TS-03 (Cmd-Z scoped), TS-05 (autosave), TS-06 (flush-on-blur), TS-08 (mode parity), TS-12–TS-18 (debounce, theme, brackets, carry-over)

**Pitfalls:** P1, P3, P4, P6, P12, P14, P15, P17, P18, P22, P23

**Research flag: LOW — all patterns verified against Obsidian API docs + Dataview source**

---

### Phase 2: Reconciliation, UX, Action Row, Section Protection

**Goal:** Full external-edit handling, action row inside widget, section protection rewire, multi-pane coherence, UX polish. Still behind `useInlineWidget=OFF` default.

**Delivers:**
- External-edit reconciliation: cursor-preserving `reloadFromDisk()` + conflict modal (external edit during local typing → "Keep mine / Keep external / View diff")
- Multi-pane coherence: live/mirror widget designation via `widgetRegistry`, promote-on-focus (or single-active-per-file as acceptable simplification — see Open Questions Q4)
- `src/widget/widgetActions.ts` mounting `buildCodeBlockButtonRow` + `languageChevronWidget` inside widget DOM
- Language switching via `processFrontMatter(lc-language)` → `metadataCache.on('changed')` → `Compartment.reconfigure` (no parent CM6 dispatch; `'leetcode.lang-switch'` userEvent convention dropped)
- `sectionProtectionExtension.ts` (narrowed from `sectionLockExtension.ts`): protects `## Problem` body + `## Techniques` heading only; fence opener/closer protection removed
- Embedded-note read-only detection via `ctx.sourcePath` comparison
- Action row: flex-wrap layout, CSS variable discipline, focus-save/restore on button click
- Button handlers read from `widgetInstance.childView.state.doc.toString()` — no disk round-trip
- Settings: "Save delay" slider (300/500/1000/2000ms)
- Cmd-Z / Cmd-F scope documented in README and widget chrome
- Vim: attempt live `Compartment.reconfigure` (see Key Decision #2); reload-on-toggle banner as fallback
- Window resize → `childView.requestMeasure()`

**Features:** TS-07 (external edit), TS-09 (action row), TS-10 (chevron), TS-11 (vim), DF-01 (fence tag + language metadata), DF-03 (conflict toast)

**Pitfalls:** P2, P8, P9, P10, P11, P16, P19, P20, P21, P24

**Research flag: MEDIUM — section protection narrowing and multi-pane promotion have no direct precedent; test empirically**

---

### Phase 3: v1.2 Migration

**Goal:** Every v1.2 note migrates lazily to `leetcode-solve` fence tag on first open, with backup and idempotent detection.

**Delivers:**
- `src/widget/fenceMigrator.ts`: `migrateLegacyFence(body): string` (pure) + `migrateIfNeeded(app, file)`
- Detection: first fence under `## Code` has v1.2 lang-slug tag AND `lc-slug` frontmatter present
- Atomic `vault.process` rewrite: fence opener → `leetcode-solve`; `lc-language` frontmatter verified/derived
- Backup sidecar to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/` before first migration; 30-day retention in README
- Idempotent: `leetcode-solve` opener present → skip
- Opt-out setting: "Auto-migrate v1.2 notes when opened" (default ON)
- `starterCodeInjector.ts` + `NoteTemplate.ts` updated to emit `leetcode-solve` for new notes
- `codeExtractor.ts` updated to source language from `lc-language` frontmatter (not fence tag)
- CI test fixtures for v1.0, v1.1, v1.2 sample notes
- `unmigrateToLegacyFence()` inverse kept in tree as dev-only command (not shipped)

**CRITICAL:** Never call migration from `Plugin.onload()`. Never regex-replace across full file. Gate on `lc-slug` frontmatter.

**Pitfalls:** P7 (migration data loss), P13 (plugin-store re-review)

**Research flag: LOW for mechanics (v1.1 lazy-on-AC is direct precedent); MEDIUM for hand-edited note edge cases**

---

### Phase 4: v1.2 Path Removal + Polish

**Goal:** Hard cutover — delete the 5 v1.2 files and ~800 LOC of main.ts wiring; flip `useInlineWidget` default ON; ship.

**Delivers:**
- `useInlineWidget` flipped to default ON
- Delete: `childEditorSync.ts` (809 LOC), `sectionLockExtension.ts` (527 LOC), `nestedEditorExtension.ts` (395 LOC), `childEditorRegistry.ts` (114 LOC), `codeActionsEditorExtension.ts` (395 LOC)
- Remove ~800 LOC from `src/main.ts`: sync wiring, `ECHO_PRONE_USER_EVENTS`, `useNestedEditor` fork, `nestedEditorRebuildEffect`, fence-repair hook, `switchFenceLanguage` child-CM6 path, `dispatchChildLanguageReconfigure`
- CLAUDE.md §Conventions: remove `'leetcode.*'` userEvent paragraphs and "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph — both obsolete
- Delete dead test files: `childEditorSync.test.ts`, `childEditorSync.repair.test.ts`, `sectionLockExtension.test.ts`, `nestedEditorExtension.test.ts`, `codeActionsEditorExtension.test.ts`, `childEditorRegistry.test.ts`, `resetCommand.childDispatch.test.ts`, `tabMidLine.test.ts`
- Vim: if Phase 2 live-reconfigure has issues, land banner-on-toggle + explicit reload UX here
- Bundle-size CI gate (expect net reduction from ~1.71 MB)
- eslint-plugin-obsidianmd clean run; zero `innerHTML` in v1.3 code
- README updated for v1.3 architecture, migration docs, sync interaction note
- Alpha period via BRAT before plugin-store submission

**Pitfalls:** P5 (vim toggle fallback), P13 (plugin-store review checklist), P25 (plugin update docs)

**Research flag: LOW — deletion + checklist, no new architecture**

---

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** Suppression and state persistence must exist before external-edit reconciliation — Phase 2's conflict modal depends on distinguishing self vs. external modify events.
- **Phase 2 before Phase 3:** Migration uses the same `vault.process` fence rewrite primitives as the widget; migrating on top of an unstable widget yields corrupted notes.
- **Phase 3 before Phase 4:** The v1.2 path cannot be deleted until every v1.2 note has a migration path available.
- **Coexistence through Phases 1–3:** `useInlineWidget=OFF` default keeps v1.2 as user-facing default while the new path is dogfooded. Bisection is trivial.
- **Hard cutover at Phase 4:** Maintaining both paths long-term creates ongoing maintenance tax on every PR. LOC reduction is the milestone goal.

### Research Flags

Phases needing deeper planning-phase attention:

- **Phase 2 — Multi-pane promote-on-focus:** No direct community plugin precedent. If full live/mirror complexity is too high, single-active-per-file with "Take over" button is an acceptable simplification.
- **Phase 2 — Section protection narrowing:** Auditing every `changeFilter` condition in `sectionLockExtension.ts` to safely remove fence-opener/closer protection while retaining `## Problem` body protection. Risk: removing too much (regression) or too little (interferes with non-fence writes).
- **Phase 2 — Live `Compartment.reconfigure` for vim:** Correct per CM6 docs; not explicitly documented in `@replit/codemirror-vim` README. Requires early empirical test in dev vault.

Phases with well-documented patterns (skip research phase):

- **Phase 1 — Two-path mount:** Verified against Obsidian docs + Dataview source. Explicit and tested.
- **Phase 1 — `vault.process` + debounce + suppression:** All three primitives already used in v1.2 codebase.
- **Phase 3 — Migration mechanics:** v1.1 lazy-on-AC Techniques migration is a direct precedent.
- **Phase 4 — Deletion:** Mechanical; no new architecture.

---

## Stack Additions

**No new runtime dependencies required for v1.3.**

All primitives come from packages already in `package.json`:
- `registerMarkdownCodeBlockProcessor`, `registerEditorExtension`, `MarkdownRenderChild`, `Vault.process`, `debounce`/`Debouncer` — from `obsidian@1.12.3` (built-in)
- `WidgetType`, `Decoration`, `ViewPlugin`, `EditorView`, `Compartment` — from `@codemirror/view@6.38.6` and `@codemirror/state@6.5.0` (already pinned; keep as esbuild externals)
- `vim()` — from `@replit/codemirror-vim@6.3.0` (already pinned; latest on npm as of research date)

Do NOT add `lodash`, `react`, `preact`, `svelte`, `lit`, or any HTML↔MD library for widget work.

**CLAUDE.md CM6 version discrepancy:** CLAUDE.md documents `@codemirror/state@6.6.0` and `@codemirror/view@6.42.1` but installed versions are `6.5.0` and `6.38.6` respectively. Docs drift only — not a v1.3 blocker. Any CM6 bump is a separate maintenance task; bumping CM6 minors as a v1.3 side effect risks runtime mismatch with Obsidian's host-provided CM6.

---

## Files to Delete

| File | LOC | Why deleted |
|------|-----|-------------|
| `src/main/childEditorSync.ts` | 809 | Bidirectional child↔parent sync — entire purpose eliminated by one-way sync |
| `src/main/sectionLockExtension.ts` | 527 | Fence opener/closer protection moot with widget; `## Problem`/`## Techniques` protection moves to narrower `sectionProtectionExtension.ts` |
| `src/main/nestedEditorExtension.ts` | 395 | CM6 StateField for `lc-fence-hidden` decorations + NestedEditorWidget — replaced by `codeBlockProcessor.ts` |
| `src/main/childEditorRegistry.ts` | 114 | LRU cache superseded by thin `widgetRegistry.ts` (~50 LOC) |
| `src/main/codeActionsEditorExtension.ts` | 395 | Edit-mode block widget for chevron+button in parent doc — replaced by `widgetActions.ts` inside widget DOM |

Plus `src/main.ts` cleanup (~800 LOC removed): sync wiring, `ECHO_PRONE_USER_EVENTS`, `useNestedEditor` fork, `nestedEditorRebuildEffect` dispatch, fence-repair hook (`src/main.ts:966`), `dispatchChildLanguageReconfigure`, `handleFmChangeForLanguageReactivity` (moves into widget controller), `childEditorRegistry.get` seams in `switchFenceLanguage`/`reset`/`copyToCode`.

Plus dead test files: `childEditorSync.test.ts`, `childEditorSync.repair.test.ts`, `sectionLockExtension.test.ts`, `nestedEditorExtension.test.ts`, `codeActionsEditorExtension.test.ts`, `childEditorRegistry.test.ts`, `resetCommand.childDispatch.test.ts`, `tabMidLine.test.ts`.

Plus CLAUDE.md §Conventions: remove the `'leetcode.*'` userEvent paragraph and the "Canonical plugin write-path pattern (Phase 17 D-05)" paragraph — both conventions are fully obsolete when no parent-doc CM6 dispatches remain.

**Net LOC:** ~3,000 deleted, ~600 added → net −2,400 LOC. `src/main.ts` shrinks from ~3,252 → ~2,500 LOC.

---

## Migration Strategy

Migration from v1.2 → v1.3 note format is the highest-risk surface in the milestone.

**Trigger:** Per-file, per-open. NEVER on plugin load.

**Detection:** First fence under `## Code` has a v1.2 lang-slug tag (python, python3, java, cpp, c, golang, javascript, typescript, csharp) AND `lc-slug` frontmatter present. Both checks required — prevents hijacking non-LC code blocks.

**Rewrite (one atomic `vault.process`):**
1. Write backup sidecar to `.obsidian/plugins/obsidian-leetcode/migration-backup-{timestamp}/` before first migration in a session
2. Rewrite fence opener from ` ```<langslug> ` to ` ```leetcode-solve `
3. Verify `lc-language` frontmatter is set; if absent, derive from old langslug and write via chained `processFrontMatter`
4. Do NOT touch fence body — user's solution code is untouched

**Idempotent:** `leetcode-solve` opener already present → skip, no-op.

**Opt-out:** Setting "Auto-migrate v1.2 notes when opened" defaults ON; if OFF, a "Migrate this note?" button appears on first open of a v1.2 note.

**Precedent:** v1.1 lazy-on-AC Techniques migration (PROJECT.md Key Decisions — "Never batch-rewrite on plugin load"). Same discipline applies here.

**Backup retention:** 30 days (recommended). Location and retention period documented in README.

**CI requirement:** v1.0, v1.1, v1.2 sample-vault fixtures must all pass migration in CI before any release candidate.

---

## Open Questions for the User / Roadmapper

**Q1 — Section-lock disposition (most important):**
ARCHITECTURE says delete `sectionLockExtension.ts` entirely. PITFALLS warns this regresses the v1.0 requirement "plugin-owned regions structurally locked." Recommendation: rename to `sectionProtectionExtension.ts`, narrow scope to `## Problem` body + `## Techniques` heading only.
_Options: (a) Narrower replacement as recommended / (b) Full deletion, regression acknowledged / (c) Escalate to separate research_

**Q2 — Vim toggle:**
PROJECT.md accepts reload-on-toggle. FEATURES research shows live `Compartment.reconfigure` should work. Recommendation: attempt live-reconfigure in Phase 2; reload as fallback only if it fails.
_Options: (a) Attempt live-reconfigure first / (b) Keep reload-on-toggle as originally designed_

**Q3 — Reading-mode widget rendering:**
Live CM6 read-only gives consistent syntax highlighting (one code path). Static `<pre>` is simpler.
_Options: (a) Live CM6 with `EditorView.editable.of(false)` / (b) Static `<pre><code>` / (c) Decide in Phase 1_

**Q4 — Multi-pane strategy:**
Full live/mirror with promote-on-focus is correct UX but adds complexity and has no community precedent. Single-active-per-file is simpler.
_Options: (a) Full live/mirror in Phase 2 / (b) Single-active as Phase 2, live/mirror as v1.3.x follow-up_

**Q5 — `useInlineWidget` alpha period:**
Should the widget ship default OFF for one alpha release before becoming default ON in stable?
_Options: (a) Yes, alpha with default OFF / (b) Default ON from first Phase 4 release_

**Q6 — Backup retention period:**
ARCHITECTURE suggests 7 days; PITFALLS recommends 30 days.
_Options: (a) 30 days / (b) 7 days / (c) User-configurable_

**Q7 — Migration + first-edit atomicity:**
Should the v1.2→v1.3 fence rewrite and the user's first character land in the same `vault.process` callback?
_Options: (a) Atomic single write (recommended) / (b) Two separate writes (migration first, then edit)_

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All primitives verified against `obsidian.d.ts@1.12.3`, Dataview source, and existing codebase callsites. No new deps. CM6 version discrepancy in CLAUDE.md is docs drift only. |
| Features | HIGH (table stakes) / MEDIUM (differentiators) | TS-01–TS-18 grounded in v1.2 carry-over + Obsidian API docs. DF-02 (arrow-exit) and DF-04 (verdict badge) are novel; complexity estimates rough. |
| Architecture | HIGH | Cutlist is exact (LOC verified by reading source). Data flow diagram is canonical. Dead-path audit covers every existing callsite in main.ts. 7-phase build order has explicit dependency reasoning. |
| Pitfalls | HIGH (P1–P12) / MEDIUM (P13+) | Critical pitfalls grounded in Obsidian docs, v1.2 lessons-learned, community plugin source. Single empirical uncertainty: whether `mousedown.stopPropagation()` on widget root prevents Live Preview cursor-place behavior. |

**Overall confidence: HIGH**

### Gaps to Address

- **Live Preview raw-source reveal mitigation (P3):** Whether `el.addEventListener('mousedown', e => e.stopPropagation())` prevents Obsidian's cursor-placement behavior is empirically unknown. Must test in Phase 1. State-persistence map is the fallback regardless.

- **`@replit/codemirror-vim` Compartment.reconfigure:** Library README does not explicitly document runtime toggle. Early empirical test required in Phase 2. If it fails, PROJECT.md's reload-on-toggle is the pre-accepted fallback.

- **Multi-pane promote-on-focus semantics:** No direct community plugin precedent. Single-active-per-file alternative (Q4) should be the Phase 2 default with full promote-on-focus as a stretch goal or v1.3.x follow-up.

- **`getSectionInfo` reliability in Live Preview:** The exact conditions under which it returns null in Live Preview vs. Reading mode are not fully documented. Phase 1 must include a null-path fallback from day one.

---

## Sources

| File | LOC | Confidence | Key Contributions |
|------|-----|------------|-------------------|
| `.planning/research/STACK.md` | 417 | HIGH | Two-path mount requirement (decisive); `WidgetType.eq()` / `ignoreEvent()` patterns; self-write suppression Set shape; Obsidian `debounce` API vs. lodash; CLAUDE.md CM6 version discrepancy |
| `.planning/research/FEATURES.md` | 280 | HIGH / MEDIUM | `EditorView.atomicRanges` as load-bearing primitive; vim live-reconfigure possibility; migration MIG-01 edge-case disambiguation; anti-feature catalogue (AF-01–AF-11) |
| `.planning/research/ARCHITECTURE.md` | 340 | HIGH | Exact cutlist with LOC counts; 7-phase build order with dependency reasoning; dead-path audit for all main.ts callsites; coexistence dual-flag strategy; `src/widget/` file layout |
| `.planning/research/PITFALLS.md` | 1005 | HIGH / MEDIUM | 26 pitfalls with phase mappings; 4-phase boundary proposal; content-hash suppression recommendation (not boolean); section-lock removal regression warning (P10); migration backup 30-day retention; "looks done but isn't" checklist |

### Primary Sources Underpinning Research

- Obsidian developer docs (`/obsidianmd/obsidian-developer-docs` via Context7, 2026-05-28) — `registerMarkdownCodeBlockProcessor`, `MarkdownPostProcessorContext`, `MarkdownRenderChild`, `Vault.process`, `debounce`/`Debouncer`, `EditorView.atomicRanges`, `ViewPlugin`, `Decoration.replace`, `WidgetType` — HIGH confidence
- `blacksmithgu/obsidian-dataview/src/main.ts` — confirms two-path mount (Reading + Live Preview via separate `registerEditorExtension`) — HIGH confidence (decisive architectural verification)
- `node_modules/obsidian/obsidian.d.ts` (installed `obsidian@1.12.3`) — verified all API signatures — HIGH confidence
- Existing codebase: `src/main.ts`, `src/main/childEditorSync.ts:683-790`, `src/main/nestedEditorExtension.ts`, `src/main/childEditorFactory.ts`, `src/main/codeBlockButtonRow.ts` — HIGH confidence
- CodeMirror 6 reference docs — `EditorView.atomicRanges`, `Compartment.reconfigure`, `WidgetType.ignoreEvent`, `Decoration.replace` — HIGH confidence
- npm registry (2026-05-28) — `@replit/codemirror-vim@6.3.0` confirmed latest; version pins verified — HIGH confidence

---

*Research completed: 2026-05-28*
*Synthesized from: STACK.md (417 LOC), FEATURES.md (280 LOC), ARCHITECTURE.md (340 LOC), PITFALLS.md (1005 LOC)*
*Ready for roadmap: yes*
