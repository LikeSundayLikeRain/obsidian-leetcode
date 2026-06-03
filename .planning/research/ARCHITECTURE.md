# v1.3 Inline Widget Architecture — Integration Research

**Domain:** Obsidian plugin — replacing dual-CM6 nested editor with inline code-block widget
**Researched:** 2026-05-28
**Confidence:** HIGH (sourced directly from current code; no external docs needed for integration mapping)

## 1. Integration Boundary — Cutlist (Confirmed)

### KEEP (carry-over, minor adapters)

| File / Module | LOC | Why kept | Adapter needed? |
|---|---|---|---|
| `src/main/childEditorFactory.ts` | 482 | Builds the actual CM6 EditorView with theme + lang + indent + bracket + line-number config. The composition root for "what extensions go in a child". | **Repurpose.** Drop the parent-binding seam; widget mounts the EditorView in its own container. Output type stays `EditorView`. |
| `src/main/childEditorLanguage.ts` | 148 | `languageCompartment` + `buildLanguageExtensions(slug, indent)` — 8-language pack registry. | **Keep verbatim.** Compartment-based language switching is the right primitive for v1.3 too. |
| `src/main/childEditorTheme.ts` | 152 | `lc-nested-editor` + `HyperMD-codeblock` theme integration that lets community themes (e.g. One Dark) cascade. | **Keep verbatim.** Same DOM container class survives. |
| `src/main/childEditorSemanticClasses.ts` | 297 | CM6 ViewPlugin that maps Lezer node names → semantic CSS classes for theme tag-mapping (Issue 13 pass). | **Keep verbatim.** Self-contained, decoration-layer only. |
| `src/main/codeBlockButtonRow.ts` | 99 | Builds Run/Submit/AI/Reset/Retrieve button row DOM. Already shared between Reading-Mode post-processor and Edit-Mode CM6 widget. | **Keep verbatim.** Single shared DOM helper — third call site (the new widget) just imports it. |
| `src/main/languageChevronWidget.ts` | 304 | Edit-Mode language chevron DOM helper. | **Keep verbatim** — but mount point moves into the widget UI rather than below the fence. |
| `src/main/codeActionsPostProcessor.ts` | 67 | **Reading-mode** post-processor that mounts buttons below `<pre>`. | **Keep verbatim.** Reading mode is unaffected by the widget rewrite. |
| `src/main/python3Highlighter.ts` | 59 | python3→python class swap for Reading-Mode Prism highlighting. | **Keep verbatim.** Reading-mode only. |
| `src/main/fileOpenHook.ts` | 63 | Starter-code retrofit on file-open. | **Keep verbatim.** Operates at vault layer (`processFrontMatter` + `vault.process`); no CM6 coupling. |
| `src/notes/NoteTemplate.ts` | (uses CODE_HEADING_LINE) | Note shape: `## Problem` → `## Code` → `## Notes` → `## Techniques`. | **Keep verbatim** of headings, **swap fence tag** in starter injection from `python3` → `leetcode-solve` (see §6). |
| `src/solve/starterCodeInjector.ts` | (uses fence tag) | Pure body-rewriting helpers used by retrofit + reset. | **Modify** — emit `leetcode-solve` fence with metadata in info-string instead of `python3`. (See §6 migration). |
| `src/solve/codeExtractor.ts` | (parses fence) | Pulls solution code out of `## Code` for run/submit. | **Modify** — fence-tag detection broadens to `leetcode-solve` + legacy lang slugs. |
| `src/graph/copyToCode.ts` | (vault.process) | "Copy submission to ## Code" — vault-layer write. | **Keep, light-modify.** Continue using `vault.process`; the widget will pick the change up via the file-modify reload path. Drop the `childEditorRegistry?.get` lookup in main.ts callsite (D-05 canonical pattern is obsolete in v1.3). |
| `src/solve/resetCodeWithConfirm.ts` | 205 | Reset-to-starter helper. | **Modify** — drop the `getDispatchHandle` seam (Phase 17 D-03 child-CM6 dispatch). Pure `vault.process` is correct again — see §4. |

### DELETE (entire files)

| File | LOC | Why deleted |
|---|---|---|
| `src/main/childEditorSync.ts` | **809** | Bidirectional child↔parent sync. The whole point of v1.3 is that the file IS the source of truth and there is no parent-CM6 fence body to mirror. `wireSyncIfNeeded`, `detectAndPropagateExternalChange`, `syncAnnotation`, `repairFenceStructure`, `registerVaultModifyRepairTrigger` all become dead code. |
| `src/main/sectionLockExtension.ts` | **527** | The whole reason section-lock exists is to prevent edits to plugin-owned regions of the parent doc when the user can still see/touch them. v1.3's widget renders the entire `## Problem`/`## Code`/`## Techniques`/`## Notes` shape via Reading Mode (or Live Preview's normal rendering); fence body is inside the widget's own EditorView. There's nothing to lock at the parent layer. |
| `src/main/nestedEditorExtension.ts` | **395** | The CM6 StateField that produced `lc-fence-hidden` line decorations + the NestedEditorWidget that mounted the child. Replaced by the markdown code-block processor. The transactionFilter cursor-redirect, `nestedEditorRebuildEffect`, and `ECHO_PRONE_USER_EVENTS` set all go away. |
| `src/main/childEditorRegistry.ts` | 114 | LRU cache keyed by file path was needed because the widget unmount/remount during scroll/CM6 viewport changes could destroy and recreate the EditorView. With `registerMarkdownCodeBlockProcessor`, Obsidian owns the lifecycle — re-renders happen but our processor is called fresh; we can hold per-file state in a simpler `Map<filePath, WidgetController>` if at all. **Replace with thinner `WidgetRegistry`** (~30 LOC) for self-write suppression bookkeeping. |
| `src/main/codeActionsEditorExtension.ts` | **395** | Edit-Mode block widget (CodeActionsWidget at fence-closer end) that paints the chevron+button row in the parent doc. v1.3 mounts the row **inside** the widget UI; the parent has no fence to anchor to. `findCodeFence` (the SSoT for fence detection in parent CM6) is also no longer needed in the parent — but **keep the function** by inlining it into the new widget controller (it's still used to slice the fence body during widget mount and during external `vault.modify` reconciliation). |

**Net cut:** ~2,240 LOC across 5 files (`childEditorSync` 809 + `sectionLockExtension` 527 + `nestedEditorExtension` 395 + `codeActionsEditorExtension` 395 + `childEditorRegistry` 114). Plus ~700–900 LOC of `src/main.ts` that wires sync, fence-repair triggers, child-dispatch helpers, the `ECHO_PRONE_USER_EVENTS` exemption thread, the `'leetcode.*'` userEvent annotation convention, the file-open repair hook, the `nestedEditorRebuildEffect` dispatch on metadataCache changes, and the `childEditorRegistry?.get` seams in `switchFenceLanguage`/`reset`/`copyToCode`. **Total deletion target: ~3,000 LOC.** Estimated v1.3 add: ~600 LOC. Net ~ −2,400 LOC.

### CONVENTION DELETIONS

- The `'leetcode.*'` userEvent annotation convention (CLAUDE.md §Conventions, line 195) — **delete the convention entirely.** No section-lock means no bypass surface. Every `cm.dispatch` callsite carrying a `userEvent: 'leetcode.…'` becomes either a `vault.process` write (fence body changes) or a per-widget compartment.reconfigure (language switch).
- The "canonical plugin write-path pattern" (CLAUDE.md §Conventions, line 197) — **delete.** The whole purpose of D-05 was to make Reset land on the *child's* undo stack via `childSyncExtension`'s mirror. With v1.3, "the child" is the only editor for the fence body; `vault.process` writes flow disk → `vault.on('modify')` → widget reload. Reset = pure `vault.process(file, fn)`.

---

## 2. New Components — File Layout

Suggested layout under `src/widget/` (new directory) — separates v1.3 code cleanly from the legacy `src/main/` directory during the build, makes the deletion phase a single `rm -rf src/main/{childEditorSync,sectionLockExtension,nestedEditorExtension,childEditorRegistry,codeActionsEditorExtension}.ts`.

```
src/widget/                                         NEW DIRECTORY
├── codeBlockProcessor.ts          ~100 LOC   registerMarkdownCodeBlockProcessor('leetcode-solve', mount)
│                                              Entry point — gates on lc-slug, calls WidgetController
├── WidgetController.ts            ~200 LOC   Owns lifecycle of one CM6 EditorView per (file, codeBlockEl)
│                                              mount(el), unmount(), reloadFromDisk(), flush()
├── debouncedWriter.ts             ~80 LOC    Debounced vault.process queue (~300-500ms)
│                                              Last-write-wins; flush() drains immediately
├── selfWriteSuppression.ts        ~60 LOC    Window manager: setExpectingModify(filePath, ttl=750ms)
│                                              vault.on('modify') consults this before widget reload
├── widgetRegistry.ts              ~50 LOC    Thin Map<filePath, WidgetController[]>
│                                              For external-modify dispatch + flush-all-on-unload
├── fenceMigrator.ts               ~80 LOC    v1.2 ## Code python3 fence → ## Code leetcode-solve (lang) fence
│                                              Pure transform; called from on-demand path (see §6)
└── widgetActions.ts               ~60 LOC    Re-mount of buttons inside widget DOM
                                              Wraps codeBlockButtonRow + languageChevronWidget for the new host
```

**Existing files that move logically (not physically):**
- `src/main/childEditorFactory.ts` → could move to `src/widget/childEditor.ts` for clarity; not required.
- `src/main/childEditorLanguage.ts`, `src/main/childEditorTheme.ts`, `src/main/childEditorSemanticClasses.ts` stay in `src/main/` — they're shared CM6 building blocks.

**main.ts diff size estimate:**
- ~800 LOC removed (sync wiring, file-open repair hook, externalChangeListener, `childEditorRegistry` field + `destroyAll`, `switchFenceLanguage` child-CM6 path, `dispatchChildLanguageReconfigure`, the `nestedEditorRebuildEffect` dispatch, the `useNestedEditor` settings flag fork)
- ~80 LOC added (codeBlockProcessor registration, WidgetRegistry init, vault.on('modify') hookup, flush-all on unload)
- Net ~ −720 LOC in main.ts (currently 3,252 → ~2,500).

---

## 3. Data Flow — Canonical (with self-write suppression)

```
                                ┌──────────────────────────┐
                                │     User keystroke       │
                                │  (inside widget CM6)     │
                                └──────────┬───────────────┘
                                           │ updateListener
                                           ▼
        ┌─────────────────────────────────────────────────────┐
        │  WidgetController.onUpdate(update)                  │
        │   - update.docChanged → debouncedWriter.schedule()  │
        └──────────────────────────┬──────────────────────────┘
                                   │  300–500 ms debounce
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │  debouncedWriter.flush()                            │
        │   1. selfWriteSuppression.setExpecting(file, 750ms) │  ← arms suppression
        │   2. await app.vault.process(file, body =>          │
        │        rewriteFenceBody(body, widget.getDoc()))     │
        └──────────────────────────┬──────────────────────────┘
                                   │  Obsidian persists to disk
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │  Obsidian fires vault.on('modify', file)            │
        │  + metadataCache.on('changed', file)                │
        └──────────────────────────┬──────────────────────────┘
                                   │
                ┌──────────────────┴───────────────────┐
                │                                      │
                ▼                                      ▼
        Suppression armed?                       Suppression armed?
                │                                      │
        YES → CONSUME the event                NO → reloadFromDisk()
              (clear flag, do nothing)               extract fence body,
              (the CM6 doc already                   dispatch into the widget's
              matches what we just wrote)            EditorView
                                                     (cursor-preserving via
                                                     EditorSelection.cursor)


       ────────── PARALLEL: external write (CopyToCode, AI Review) ──────────

        ┌─────────────────────────────────────────────────────┐
        │  vault.process(file, …) called from copyToCode,     │
        │  AI Review merge, retrofit, contest finalizer       │
        │   - DOES NOT arm suppression                        │
        └──────────────────────────┬──────────────────────────┘
                                   │
                                   ▼
        vault.on('modify') fires → suppression NOT armed →
        reloadFromDisk() → widget picks up new body
```

**Why a window-based suppression (not transaction-id matching):**
- `vault.process` returns AFTER the file is written and `modify` has fired (Obsidian's API). So a simple "expecting=true; await write; expecting=false" works *if* `modify` is dispatched synchronously inside `process` — which testing shows it is in current Obsidian (1.12.x). A 750 ms TTL is a paranoia net for any case where `modify` is queued.
- Alternative: store the exact body string we just wrote, compare on modify event, skip if equal. More robust but adds an O(N) string compare per modify. **Recommendation: ship the time-window first; upgrade to body-hash if a regression appears.**

**Cross-pane synchronization:** Two widgets for the same file (split pane, two tabs). On any external `vault.on('modify')`:
- `widgetRegistry.getAll(filePath).filter(w => !w.isOriginatingWriter).forEach(w => w.reloadFromDisk())`
- The originating widget skips reload because suppression was armed by *its own* writer. Other panes' widgets reload.

**Flush-on-unload / flush-on-blur (from PROJECT.md):**
- Plugin `onunload()` → `widgetRegistry.flushAll()` — drains every pending debounce synchronously.
- `EditorView.domEventHandlers({ blur })` on each widget → `controller.flush()`. Catches Cmd-Tab, leaf close, mode switch.
- `editor-change`-style hook is unnecessary because the debounce already covers normal typing.

---

## 4. Action Row Integration — Adapter, not Rewrite

`src/main/codeActionsEditorExtension.ts` is **deleted entirely** (not adapted). The work it did splits into two:

1. **Reading mode:** unchanged — `src/main/codeActionsPostProcessor.ts` continues to mount buttons below `<pre>`. No coupling to the widget.

2. **Edit mode:** the button row is mounted **inside the widget DOM** by `WidgetController.mount(el)`:

   ```ts
   // src/widget/widgetActions.ts (sketch)
   export function mountActionRow(host: PluginHost, file: TFile, container: HTMLElement, currentSlug: string) {
     const row = buildCodeBlockButtonRow(container.ownerDocument, host, {
       prefix: () => buildLanguageChevron(container.ownerDocument, host, file, currentSlug),
     });
     container.appendChild(row);
     return row;
   }
   ```

   `buildCodeBlockButtonRow` and `buildLanguageChevron` are imported as-is from `src/main/`. The chevron's click handler still calls `plugin.switchLanguage(file, slug)`. **Critical change inside `switchLanguage`:** the implementation simplifies dramatically — see §5.

**`findCodeFence`:** Lift this function from the deleted `codeActionsEditorExtension.ts` into `src/widget/fenceLocator.ts` (or inline it into `WidgetController`). It's still needed by `vault.process` callbacks that rewrite the fence body. Keep test coverage from `tests/main/codeActionsEditorExtension.test.ts` for the lifted function.

**Idempotency / `WidgetType.eq()` analog:** `registerMarkdownCodeBlockProcessor` calls the mount callback per code-block render. Cache the EditorView per `(filePath, codeBlockId)` in `widgetRegistry` so re-render reuses the existing CM6 instance — same DOM-reuse benefit `WidgetType.eq()` provided.

---

## 5. AI Review / Contest / Preview / Chevron — Dead-Path Audit

After section-lock + nested-editor extension deletion, every existing dispatch path must be checked for "still works" or "now dead".

| Path | Current behavior (v1.2) | v1.3 status |
|---|---|---|
| **AI Review write** (`src/main.ts:2005`, `src/ai/mergeAIReviewSection.ts`) | `vault.process(file, body => mergeAIReviewSection(body, …))`. Plain vault layer; bypasses parent CM6 entirely. | **Unchanged.** Widget picks up the new `## AI Review` heading via the normal modify pipeline (note body changes, but the fence body inside `## Code` is untouched, so widget's reloadFromDisk would re-extract identical fence body → no-op dispatch). Optimization: short-circuit reload when extracted body === current widget doc. |
| **AI Debug stream** (`src/main.ts:1320`, `src/main.ts:1428`) | `vault.process(file, body => …)`. | **Unchanged.** Same reasoning. |
| **AI Solution write** (`src/main.ts:2102`) | `vault.process(file, body => mergeAISolutionSection(body, …))`. | **Unchanged.** |
| **Contest finalizer / scratch** (`src/contest/ContestFinalizer.ts`, `ContestScratchManager.ts`) | `vault.process` + `processFrontMatter`. | **Unchanged.** |
| **Knowledge Graph writes** (`src/graph/KnowledgeGraphWriter.ts`, `ClusterHubWriter.ts`, `PatternClusterEngine.ts`) | `vault.process` + `processFrontMatter`. | **Unchanged.** |
| **Copy to Code** (`src/graph/copyToCode.ts` + `src/main.ts:~3120`) | Tries `childEditorRegistry.get` first; if hit, dispatches into child CM6 with `userEvent: 'leetcode.copy-to-code'` so child sync mirrors back to parent. Fallback to `vault.process`. | **CHANGE.** Drop the child-dispatch branch entirely; always `vault.process`. The widget reloads via `vault.on('modify')`. The `'leetcode.*'` userEvent on this dispatch becomes orthogonal (no section-lock → nothing to bypass). |
| **Reset to starter** (`src/solve/resetCodeWithConfirm.ts` + `src/main.ts:~2790`) | Same pattern — child-dispatch first, `vault.process` fallback. | **CHANGE.** Drop the `getDispatchHandle` seam. Always `vault.process`. Cmd-Z scope: Reset will land on the **widget's** undo stack only if the modify-reload arrives back as a CM6 transaction — which it does (via cursor-preserving dispatch). The "no addToHistory.of(false)" gymnastics from D-05 disappears. |
| **switchFenceLanguage** (`src/main.ts:2507`) | Atomic `cm.dispatch` on parent that rewrites both fence opener tag and starter body, plus `processFrontMatter` for `lc-language`, plus `Compartment.reconfigure` on child. | **HEAVY CHANGE — this is the most complex migration.** v1.3 split: (a) `processFrontMatter` to write `lc-language` (unchanged, idempotent); (b) widget controller listens for fm change and calls `Compartment.reconfigure(buildLanguageExtensions(newSlug, indent))` on its EditorView; (c) **fence-tag rewrite goes away** because the new fence tag is *always* `leetcode-solve` — language is metadata, not fence tag. **THIS IS A SCHEMA SIMPLIFICATION:** the v1.2 `python3`/`java`/`cpp` fence tag is replaced by `leetcode-solve` + `lc-language` frontmatter as the single source of truth. |
| **Retrofit starter on file-open** (`src/main/fileOpenHook.ts` + `src/solve/starterCodeInjector.ts`) | Reads `lc-language` from fm, injects `python3`/`java`/`cpp` fence with starter body. | **CHANGE** — emit `leetcode-solve` fence tag; starter body unchanged. |
| **codeExtractor for Run/Submit** (`src/solve/codeExtractor.ts`) | Reads body inside the first fence under `## Code`, returns `{ code, lang }` where lang is parsed from fence tag. | **CHANGE** — fence tag is always `leetcode-solve`; lang comes from `lc-language` frontmatter. Extractor signature gains a fm-aware lookup. |
| **registerVaultModifyRepairTrigger** (Phase 18 — `childEditorSync.ts`) | vim `dd`-on-fence-closer recovery — re-inserts missing markers. | **DELETED.** No fence-marker fragility because vim runs inside the widget's own EditorView, which doesn't have markers to delete. The widget's outer `## Code` heading + `\`\`\`leetcode-solve` opener live in the parent document but are NOT inside any editable CM6 region (Live Preview renders the whole code-block as the widget; Source Mode users editing fence markers fall back to the same vault.process reload path). |
| **file-open fence repair hook** (`src/main.ts:966`) | Phase 18 timeout-based repair on file-open. | **DELETED.** Same reason. |
| **Preview view** (`src/preview/ProblemPreviewView.ts`) | Read-mode `ItemView`; never touches CM6. | **Unchanged.** |
| **Contest solve view** (`src/contest/ContestSolveView.ts`) | Custom ItemView with its own write paths. | **Unchanged** — does not use parent CM6 dispatches. |
| **Chevron metadataCache subscription** (`codeActionsEditorExtension.ts:329`) | Refreshes chevron label on `lc-language` fm change. | **MOVES** into the widget controller (its own `metadataCache.on('changed')` subscription, narrowed to its file). |
| **fmReactivity listener** (`main.ts:926`, `handleFmChangeForLanguageReactivity`) | Reconfigures child editor's languageCompartment when fm.lc-language changes externally. | **MOVES** into the widget controller. Same purpose, simpler — just call `cm.dispatch({ effects: languageCompartment.reconfigure(buildLanguageExtensions(newSlug, indent)) })` on its own view. |

**Dead paths** after v1.3 deletion: every callsite that imports `childEditorRegistry`, `childEditorSync`, `sectionLockExtension`, or `nestedEditorExtension`. Confirmed import count: 8 files — all of which become removable except `src/main.ts` (refactor), `src/notes/NoteTemplate.ts` (no actual import, just docstring), and the test files (delete corresponding suites).

---

## 6. Migration Component — Placement & Strategy

**Where it lives:** `src/widget/fenceMigrator.ts` — a pure transform `migrateLegacyFence(body: string): string` plus a side-effecting wrapper `migrateIfNeeded(app, file)`.

**When it runs:** **On widget mount per file**, **before** the EditorView is constructed — three-step gate:

1. `vault.read(file)` → check `## Code` section.
2. If the first fence under `## Code` has a tag in {`python`, `python3`, `java`, `cpp`, `c`, `golang`, `javascript`, `typescript`, `csharp`} (the v1.2 lang-slug-as-tag set), trigger migration.
3. Migration is a single `vault.process(file, body => migrateLegacyFence(body))` that:
   - Rewrites fence opener `\`\`\`<langslug>` → `\`\`\`leetcode-solve`
   - Reads `lc-language` from frontmatter; if absent, derives it from the old langslug and queues `processFrontMatter(file, fm => fm['lc-language'] = derived)` after the body write (vault.process atomic, processFrontMatter chained per `copyToCode.ts:67-87` ordering).
   - **Does NOT touch the body** between fence markers — solution code untouched.
4. After migration completes, the widget mounts normally on the migrated note.

**Why on-demand (per-file lazy), not on plugin-load batch:**
- Matches v1.1's "lazy-on-AC Techniques migration" precedent (PROJECT.md key decision).
- A user may have 1,000+ legacy notes; batch rewriting on plugin load would cause a 30+ second freeze and risk partial-write corruption if the user closes Obsidian mid-migration.
- Migration is idempotent — second mount is a no-op (fence already `leetcode-solve`).

**Backwards-readability:** During the rollout, **legacy `python3`-fence notes still render correctly** in Reading Mode and via the existing CM6 syntax-highlighter — so even a user who never opens a note in the v1.3 build keeps a working note. The widget only mounts on `leetcode-solve` fences (or on `lc-slug` notes with a legacy fence — gate widens for the migration path).

**Reverse-migration safety net:** Add `migrateLegacyFence`'s inverse (`unmigrateToLegacyFence`) but **DO NOT ship it** — keep it in tree as a dev-only command in case a critical bug forces v1.2 fallback. Document that user can paste their `## Code` body into a `python3` fence manually.

---

## 7. Build Order — Phases by Dependency

**Phase A — Widget Shell** (greenfield, no deletions)
- Add `src/widget/codeBlockProcessor.ts` registering `leetcode-solve` fence tag → mount callback.
- Add `src/widget/WidgetController.ts` with `mount(el, source)` that creates a CM6 EditorView reusing `createChildEditor` from `childEditorFactory.ts`.
- Hard-code: no buttons yet, no debounced writer yet, no migration yet. Just prove the widget renders + receives keystrokes.
- Settings flag: `useInlineWidget` (default OFF) — mount only when flag is on AND fence is `leetcode-solve`.
- Tests: `widget/codeBlockProcessor.test.ts` mount/unmount, `widget/WidgetController.test.ts` doc handling.

**Phase B — One-way Sync (Widget → Disk)**
- Add `src/widget/debouncedWriter.ts` + integrate into `WidgetController.onUpdate`.
- `vault.process` writes the new fence body back to disk.
- Add `src/widget/selfWriteSuppression.ts` — but no listener yet (no reload path).
- Add `flush()` + plugin `onunload` flush-all.
- Tests: typing → 350 ms wait → vault.process called once; rapid typing → coalesces; flush forces immediate write.

**Phase C — External-Edit Reconciliation (Disk → Widget)**
- Add `vault.on('modify')` listener in `WidgetController` (or shared in `widgetRegistry`).
- Wire suppression check.
- `reloadFromDisk()` re-extracts fence body, dispatches with cursor preservation.
- Tests: external `vault.process` from another module → widget reloads; widget's own write → no reload (suppression hit).

**Phase D — Action Row + Chevron + Language Switching**
- Add `src/widget/widgetActions.ts` mounting `buildCodeBlockButtonRow` inside widget container.
- Wire chevron click → `processFrontMatter(lc-language)` → metadataCache.changed → `Compartment.reconfigure` (move logic from `main.ts:switchFenceLanguage` simplifying dramatically — no fence-tag rewrite, no atomic dispatch).
- Tests: click chevron → fm changes → widget syntax highlighting flips; Run button → existing run path fires.

**Phase E — Migration**
- Add `src/widget/fenceMigrator.ts`.
- Wire into `WidgetController.mount` pre-step.
- Widen `codeBlockProcessor` gate to also fire on legacy fence tags when on `lc-slug` notes (so legacy notes get migrated then mount).
- Update `starterCodeInjector.ts` and `NoteTemplate.ts` to emit `leetcode-solve` for new notes.
- Update `codeExtractor.ts` to source language from frontmatter not fence tag.
- Tests: legacy note → mount triggers migration → fence rewritten → widget appears; new note → emitted with `leetcode-solve` directly.

**Phase F — v1.2 Path Removal**
- Flip `useInlineWidget` default ON.
- Hard cutover: delete `src/main/{childEditorSync,sectionLockExtension,nestedEditorExtension,childEditorRegistry,codeActionsEditorExtension}.ts`.
- Remove all imports + wiring in `src/main.ts` (the 800-LOC chunk).
- Delete `'leetcode.*'` userEvent annotations from remaining callsites.
- Delete dead test files: `childEditorSync.test.ts`, `childEditorSync.repair.test.ts`, `sectionLockExtension.test.ts`, `nestedEditorExtension.test.ts`, `codeActionsEditorExtension.test.ts`, `childEditorRegistry.test.ts`, `resetCommand.childDispatch.test.ts`, `tabMidLine.test.ts` (depended on section-lock), `fmReactivity.test.ts` (subsystem moves into widget — rewrite as widget test).
- Drop CLAUDE.md §Conventions paragraphs about `'leetcode.*'` userEvent and "canonical plugin write-path pattern".
- Tests: full regression run; user-acceptance pass.

**Phase G — Polish**
- Cross-pane sync (multi-widget per file).
- Vim mode flag toggle handling (`getConfig('vimMode')` change → reload-on-toggle).
- Flush-on-blur.
- Bundle-size pass (expected −30 KB from extension deletions).

**Dependency reasoning:**
- **A → B:** can't write back without a widget that owns a doc.
- **B → C:** suppression has no work to do without a writer.
- **C → D:** chevron's reconfigure needs fm-change reactivity, which needs reload path.
- **D → E:** migration needs the widget infrastructure to exist so it knows what to migrate to.
- **E → F:** can't delete v1.2 path until migration exists for users with v1.2 notes.
- **F → G:** polish only meaningful after the cutover.

**Phase A–E are coexistence-safe** behind `useInlineWidget` flag. **Phase F is the hard cutover.**

---

## 8. Coexistence Strategy

**Recommended: Feature-flagged dual-path through Phase A–E, hard cutover at Phase F.**

The codebase already has a precedent: `getUseNestedEditor()` setting (line 830 of main.ts) gates the v1.2 nested editor extension. v1.3 introduces a parallel `getUseInlineWidget()` setting:

```
useNestedEditor (v1.2)   useInlineWidget (v1.3)   Behavior
─────────────────────────────────────────────────────────────
       OFF                      OFF                v1.0 Reading-Mode-only (legacy fallback)
       ON                       OFF                v1.2 dual-CM6 (current default)
       OFF                      ON                 v1.3 inline widget
       ON                       ON                 INVALID — assert and force `useNestedEditor=OFF`
```

**Why dual-path through E:**
- During Phase A–E development the author is dogfooding both paths daily on different notes.
- Bisection is trivial — flip the flag if v1.3 misbehaves.
- v1.2 path stays load-bearing for the test suite until F.

**Why hard cutover at F (not soft deprecation):**
- The two paths share `childEditorFactory.ts`. As soon as v1.3's mount path diverges (e.g., adds `vault.on('modify')` listeners scoped to widget keys), maintaining v1.2 compat becomes a tax on every PR.
- LOC reduction is the milestone goal — deferring deletion forfeits the benefit.
- v1.2's bug surface (the *reason* for v1.3) keeps biting users on the old path.

**Cutover-day plan for users on v1.2:**
- Plugin update with `useInlineWidget=true` default. First open of any legacy note triggers migration (Phase E). Notice toast: "Migrating LeetCode notes to v1.3 fence format — backups preserved in `.obsidian/plugins/obsidian-leetcode/backups/<timestamp>/`."
- Backup is a one-shot pre-migration write of the file body to a sidecar; deletes after 7 days.

**If hard cutover risk feels too high:** keep the `useInlineWidget` flag (defaulting ON) for one minor version (1.3.x) before removing the flag itself in 1.4. v1.2 code is gone immediately at Phase F; only the *flag* lingers (and its OFF branch falls through to "Reading-Mode-only" — i.e., no Edit-Mode widget at all, which is a graceful degradation, not a v1.2 reactivation).

---

## Anti-Patterns Specific to v1.3 (carry-over warnings)

- **Don't add `cm.dispatch` callsites on the parent CM6 from the widget.** The whole reason the dual-CM6 sync was complex is that plugin code dispatched onto both editors. v1.3 plugin writes go through `vault.process` only; widget edits stay inside the widget's EditorView.
- **Don't reinvent `childEditorRegistry`-style LRU eviction.** The markdown-code-block-processor lifecycle is owned by Obsidian; let it call your mount/unmount. Cache the EditorView only for self-write suppression bookkeeping (Map keyed on filePath, no LRU).
- **Don't use `vault.modify`** anywhere — `vault.process` is the only safe write primitive for active files (CLAUDE.md "Do NOT use `Vault.modify()` on active file — loses cursor position"). All existing callsites already comply; preserve this discipline in new widget code.
- **Don't mount the widget in `Live Preview` only.** `registerMarkdownCodeBlockProcessor` does NOT fire in Live Preview — see STACK.md. The widget needs a parallel `registerEditorExtension` ViewPlugin (Decoration.replace + WidgetType) for Live Preview parity. Dataview's `obsidian-dataview/src/main.ts` is the canonical reference.
- **Self-write suppression is a stateful global, not a transaction id.** The processor mount callback can be re-invoked (Obsidian re-renders code blocks aggressively on layout changes). Suppression state must live in `widgetRegistry`, not in a `WidgetController` instance — otherwise a re-render that creates a new controller misses the in-flight suppression window.

---

## Open Questions for Roadmap

1. **Should `useInlineWidget` ship as opt-in for one alpha cycle before becoming default?** (Recommend yes — collect dogfood feedback before forced cutover.)
2. **Live Preview rendering parity** is confirmed by STACK.md to require a separate `registerEditorExtension` ViewPlugin (Dataview pattern). Phase A must include both mount paths.
3. **Vim toggle handling:** PROJECT.md accepts "reload-on-vim-toggle". Does the widget detect the setting change at all, or does the user have to close/reopen the note? (Settings polling vs. plugin command — minor UX decision; defer to Phase G.)
4. **Backup sidecar retention:** 7 days, 30 days, or until next migration? Disk-space bound? (Likely answered during Phase E plan.)
5. **`leetcode-solve` fence tag specificity:** does Obsidian's markdown code-block processor namespace prevent collisions with future Obsidian core tags? (Verify with Context7 / Obsidian API docs during Phase A.)
