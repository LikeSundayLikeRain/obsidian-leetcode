# Phase 19: Widget Foundation + One-Way Sync — Research

**Researched:** 2026-05-29
**Domain:** Obsidian community plugin (TypeScript) — `leetcode-solve` inline code-block widget with debounced one-way `vault.process` sync, hard-gated behind `useInlineWidget=OFF` while v1.2 nested-editor remains user-facing
**Confidence:** HIGH (every locked primitive verified against installed `obsidian@1.12.3` `obsidian.d.ts` and `@codemirror/view@6.38.6` `index.d.ts` in this session)

## Summary

CONTEXT.md and the four upstream research docs (SUMMARY/STACK/FEATURES/ARCHITECTURE/PITFALLS) lock 17 carry-forward decisions (C-01..C-17) and 10 new D-decisions (D-01..D-10). My job here is **not** to re-litigate any of them — it is to (a) verify each locked primitive against the actually-installed APIs, (b) surface landmines that touch the locked design but aren't called out yet, (c) map exact code lift points, (d) recommend the property-test corpus shape, (e) validate the `fenceIndex` computation strategy, and (f) confirm event-ordering assumptions critical to the suppression map.

Headline findings:
1. **Every locked primitive is real and signature-stable.** `Vault.process` (since 1.1.0), `Debouncer.run()` (since 1.4.4), `EditorView.atomicRanges` Facet, `WidgetType.eq()`, `MarkdownPostProcessorContext.getSectionInfo` returning nullable `MarkdownSectionInformation` — all verified in `obsidian.d.ts` and `@codemirror/view/dist/index.d.ts` in this session.
2. **One assumption needs an early-Phase-19 empirical probe:** the suppression map relies on `vault.on('modify')` firing AFTER `vault.process` resolves so the map can be armed in time. STACK §3 claims this is the observed behavior on Obsidian 1.12.x; SUMMARY/PITFALLS P1 imply the same. I cannot verify this without running Obsidian. **Plan 19-02 must include a smoke probe** that armed-map → `vault.process` → modify-listener observes the armed entry; if it doesn't, the suppression must arm via `Promise.resolve().then()` instead of inline.
3. **`fenceIndex = ordinal-of-leetcode-solve-opener-up-to-getSectionInfo().lineStart` is correct AND cheap.** Counting prior openers in `ctx.getSectionInfo(el).text` (the full file text is supplied) is O(N) over the file but only runs at mount/remount. A Lezer syntax-tree walk would be a premature optimization that introduces a Live-Preview-vs-Reading-mode divergence (Lezer is only available inside CM6). **Recommend simple ordinal counting.**
4. **`'leetcode.*'` userEvent and the canonical write-path pattern (CLAUDE.md Conventions) MUST NOT be touched in Phase 19.** Both are still load-bearing for the `useNestedEditor=ON` path which remains the user default through Phase 21. They retire in Phase 22 (DELETE-08, PROTECT-03).
5. **Property tests should be hand-rolled, not fast-check.** `fast-check@4.8.0` is on npm but adds 50KB+ of dev deps for one phase's worth of property generation. Vitest's `it.each` + a tiny seeded generator (~30 LOC) covers the locked corpus (CRLF, nested triple backticks, frontmatter-like `---`, edge whitespace, empty body, single-line, mid-character end). Defer fast-check to Phase 20 if the conflict-modal tests need richer generation.
6. **Embed detection has TWO independent signals — both must be checked**, not OR'd loosely. `.markdown-embed`/`.internal-embed` ancestor walk catches the host-DOM case; `ctx.sourcePath !== file.path` catches the case where Obsidian re-renders an embedded fence in a deferred context. Either signal alone misses cases (see "Specific Findings" §3).
7. **`flushNow()` on `beforeunload` is best-effort, not guaranteed.** Synchronous `vault.process` from a `beforeunload` handler is racy — Obsidian's adapter may not flush the OS write buffer before the renderer process exits. The fallback (workspace `quit` event, since 1.4.4 — verified in `obsidian.d.ts` line 7195) fires earlier in shutdown; **plan 19-02 must register both** rather than rely on `beforeunload` alone.

**Primary recommendation:** Treat the 4-plan vertical slice (D-10) as the planner-default. Plan 19-01 must include `getSectionInfo` null-fallback, `lc-slug` gate, and the property-test scaffolding *before* any disk writes. Plan 19-02's first task is the empirical probe in finding #2 — the entire suppression map's correctness depends on it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reading-mode widget mount | Obsidian Markdown post-processor pipeline | — | `registerMarkdownCodeBlockProcessor` is the documented Reading-mode primitive; runs once Obsidian has parsed the markdown tree (verified `obsidian.d.ts:4848`) |
| Live Preview widget mount | CM6 ViewPlugin in parent EditorView | Obsidian's `editorLivePreviewField` | Live Preview is a CM6 surface; only a `Decoration.replace({ widget })` produced by a ViewPlugin renders there (verified vs Dataview's `lp-render` per STACK §1b) |
| Embedded EditorView (child) | CM6 EditorView, child of widget DOM | `MarkdownRenderChild` (Reading) / `WidgetType.destroy` (Live) | Per STACK §6/§7 — same factory, two lifecycle hosts |
| One-way write to disk | Obsidian Vault layer (`vault.process`) | — | Atomic read/modify/save; only safe write primitive for active files (PITFALLS P12 + CLAUDE.md ban on `vault.modify`) |
| Self-write echo suppression | Plugin-level singleton `Map<string, {expectedHash, expiresAt}>` | `vault.on('modify')` listener | Crosses widget instances; per-controller scope insufficient (PITFALLS P1, ARCHITECTURE §3) |
| State persistence (cursor/scroll/undo) | Plugin-level `Map<string, ChildEditorState>` | `MarkdownRenderChild.onunload`, `WidgetType.destroy` | Persistence MUST outlive any single widget instance (Live Preview re-mounts on cursor approach — PITFALLS P3) |
| Parent-cursor exclusion | Parent CM6 `EditorView.atomicRanges` Facet | ViewPlugin produces a `RangeSet` covering each fence range | Load-bearing per SUMMARY primitive 2; verified `@codemirror/view/dist/index.d.ts:1284` |
| Language pack / syntax | Embedded CM6 `languageCompartment` | `buildLanguageExtensions(slug, indent)` from `src/main/childEditorLanguage.ts` (verbatim) | Carry-over per C-12; Phase 20 owns runtime reactivity |
| Vim mode | Embedded CM6 (conditional `vim()` extension) | `app.vault.getConfig('vimMode')` read at mount | C-14; live reconfigure is Phase 20 (VIM-02) |
| Theme | Embedded CM6 + `lc-nested-editor` / `HyperMD-codeblock` container classes | `childEditorSemanticClasses.ts` ViewPlugin | C-13; community themes cascade via Lezer→CSS-class mapping |
| Rate limiting | `debouncedWriter` per file | Plugin-level `Map<filePath, lastFlushTimestamp>` | C-08; orthogonal to suppression (one bounds frequency, the other prevents echo) |

## Standard Stack

### Core (Already Installed — Verify Versions)

| Library | Installed Version | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `obsidian` | `1.12.3` `[VERIFIED: node_modules/obsidian/package.json]` | Mount API, `Vault.process`, `MarkdownRenderChild`, `debounce`/`Debouncer`, `getSectionInfo` | All Phase 19 primitives ship in this version (each verified in `obsidian.d.ts` this session — see line citations below) |
| `@codemirror/view` | `6.38.6` `[VERIFIED: node_modules/@codemirror/view/package.json]` | `WidgetType`, `Decoration.replace`, `ViewPlugin`, `EditorView.atomicRanges`, `EditorView.editable` | Verified `atomicRanges` Facet at `index.d.ts:1284`; `WidgetType.eq` at `index.d.ts:219`; `Decoration.ReplaceDecorationSpec` at `index.d.ts:151+` |
| `@codemirror/state` | `6.5.0` `[VERIFIED: node_modules/@codemirror/state/package.json]` | `Compartment`, `EditorState`, `Annotation` (for `addToHistory.of(false)` on external-edit reload — Phase 20) | Carry-over from v1.2; CLAUDE.md docs drift (`6.6.0`) is a known discrepancy per SUMMARY §"Stack Additions" |
| `@replit/codemirror-vim` | `6.3.0` `[VERIFIED: node_modules/@replit/codemirror-vim/package.json]` | `vim({ status: true })` extension when `vimMode=true` at mount | Latest npm version per STACK §1; conditional injection only at mount in Phase 19 (live reconfigure deferred to Phase 20 VIM-02) |
| `@codemirror/lang-{python,java,cpp,javascript,rust}` + `@codemirror/legacy-modes` | per package.json `[VERIFIED]` | 8-language pack via `buildLanguageExtensions(slug, indent)` | Verbatim carry-over per C-12; no version bump in Phase 19 |

**Version verification:** Done. All 4 critical packages exist at the documented installed versions. `obsidian@latest` resolves to `1.12.3`; CM6 view/state and vim are pinned correctly.

### Supporting (No Additions in Phase 19)

| Library | Status | Why |
|---------|--------|-----|
| `lodash` / `lodash.debounce` | DO NOT ADD | `debounce` from `obsidian` covers the `Debouncer` API surface needed (`run()`, `cancel()`); verified `obsidian.d.ts:2144-2161` |
| `fast-check` (property tests) | DO NOT ADD in Phase 19 | `[VERIFIED: npm registry shows v4.8.0]` exists; ~50KB dev-dep cost. Hand-rolled generators in Vitest cover the corpus (see "Property-Test Corpus" below). Reconsider in Phase 20 for conflict-modal generation. |
| HTML-to-markdown / markdown-to-HTML libs | DO NOT ADD | Wrong direction; widget owns fence body byte-exact. `turndown` already in deps for problem HTML (unrelated path). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled property generators | `fast-check` | Richer shrinking, but +50KB dev-dep; defer to Phase 20 |
| Ordinal `fenceIndex` counting | Lezer syntax-tree walk | Lezer is only available inside CM6; would require a separate path for Reading mode (where the source is already in `ctx.getSectionInfo().text`). Ordinal counting is uniform across both paths. |
| Suppression map keyed by post-write hash | Suppression armed BEFORE `vault.process`, hash compared in modify handler | The armed-before-write approach is what CONTEXT C-04 locks. **Critical:** must hash the string returned by the `vault.process` callback (the future-disk content), not the in-memory widget doc — see "Specific Findings" §1 |
| `ctx.frontmatter` from `MarkdownPostProcessorContext` | `app.metadataCache.getFileCache(file).frontmatter` | `ctx.frontmatter` is documented as `any | null | undefined` (`obsidian.d.ts:3873`) — typed loosely. `metadataCache` API is stable and consistent with the v1.2 `editorInfoField + getFileCache` pattern in `codeActionsEditorExtension.ts:248`. Use `metadataCache` for consistency. |

**Installation:** None — Phase 19 ships with current `package.json`. Plan 19-04 adds `tests/widget/` test fixtures and `src/widget/__tests__/` property tests (no new deps).

## Package Legitimacy Audit

> **Skipped.** Phase 19 installs zero new packages — every primitive comes from already-installed, verified deps (verified versions above against `node_modules/*/package.json`). Slopcheck and registry verification not required when no `npm install` runs in this phase. Re-run for Phase 20 if `fast-check` (or any other dev-dep) is added.

## Architecture Patterns

### System Architecture Diagram

```
                                    USER KEYSTROKE
                                          │
                                          ▼
              ┌───────────────────────────────────────────────────┐
              │  Embedded EditorView.updateListener.of(...)        │
              │  (inside child CM6, mounted by mountLeetCodeWidget)│
              └────────────────┬──────────────────────────────────┘
                               │ update.docChanged
                               ▼
              ┌───────────────────────────────────────────────────┐
              │  WidgetController.onUpdate(update)                 │
              │  → debouncedWriter.run()                           │
              │    (Obsidian debounce, 400ms default, resetTimer=true)│
              └────────────────┬──────────────────────────────────┘
                               │ 400ms after last keystroke
                               ▼
              ┌───────────────────────────────────────────────────┐
              │  debouncedWriter.flush()                           │
              │  1. rate-limit check (≥200ms since last flush?)    │
              │  2. compute newBody = widget.state.doc.toString()  │
              │  3. compute expectedHash = sha1(newBody)           │
              │     [or sha256 — see §1]                           │
              │  4. selfWriteSuppression.set(file.path, {          │
              │       expectedHash, expiresAt: now+2000ms })       │
              │  5. await vault.process(file, body =>              │
              │       rewriteFenceBody(body, fenceIndex, newBody)) │
              │  6. (post-flush diagnostic) re-extract body, hash, │
              │     console.warn if drift                          │
              └────────────────┬──────────────────────────────────┘
                               │ Obsidian persists; fires modify
                               ▼
              ┌───────────────────────────────────────────────────┐
              │  vault.on('modify') handler (registered once at    │
              │  Plugin.onload, gated on useInlineWidget=ON)       │
              │  ─ if entry exists in selfWriteSuppression for     │
              │    file.path AND its expectedHash matches          │
              │    sha1(extractFenceBody(diskAfterFlush, idx)):    │
              │      DROP entry, do nothing (self-echo consumed)   │
              │  ─ else if entry exists but stale (now > expiresAt)│
              │      DROP entry, treat as external (defensive)     │
              │  ─ else: external edit — Phase 20 reload path      │
              │    (out of scope this phase; just log & no-op)     │
              └────────────────────────────────────────────────────┘


    PARALLEL — Live Preview ViewPlugin                  PARALLEL — Reading-mode processor
    ─────────────────────────────────                  ───────────────────────────────────
    parent EditorView builds RangeSet of               registerMarkdownCodeBlockProcessor
    Decoration.replace({widget: LeetCodeFenceWidget})  ('leetcode-solve', (source, el, ctx) => {
    via syntaxTree iteration on visibleRanges            ctx.addChild(
    + EditorView.atomicRanges Facet provides               new LeetCodeWidgetRenderChild(
    the same RangeSet so parent cursor skips fence         el, source, ctx, plugin))
    range entirely (PITFALLS P3 mitigation #1)         })
                                                        Both paths call:
                                                        mountLeetCodeWidget(host, source, file, plugin)


    LIFECYCLE TRANSITIONS — call debouncedWriter.run() (force-flush) on:
    • MarkdownRenderChild.onunload()        (Reading-mode unmount, scroll virtualization)
    • WidgetType.destroy(dom)                (Live-Preview decoration replaced/removed)
    • workspace.on('active-leaf-change')    (file/leaf switch)
    • vault.on('rename')                     (file path changed mid-edit)
    • workspace.on('quit')                  (Cmd-Q, app shutdown — verified obsidian.d.ts:7195, since 1.4.4)
    • window.addEventListener('beforeunload') (browser-side belt-and-suspenders)
    • Plugin.onunload()                      (plugin disable / reload)


    STATE PERSISTENCE — across unmount/remount within 30s TTL:
    statePersistenceMap: Map<`${file.path}::${fenceIndex}`, ChildEditorState>
    On unmount: capture {cursor, scrollTop, historyField.value} → write entry, expiresAt = now+30000
    On mount: lookup entry, if !stale → hydrate child editor; else → fresh
```

### Recommended Project Structure

```
src/widget/                              NEW — Phase 19 budget ~600 LOC
├── codeBlockProcessor.ts          ~80   registerMarkdownCodeBlockProcessor entry; gates on lc-slug; handles getSectionInfo null
├── liveModeViewPlugin.ts          ~120  ViewPlugin scanning syntaxTree for `leetcode-solve` fences;
│                                        produces RangeSet of Decoration.replace + EditorView.atomicRanges contribution
├── LeetCodeFenceWidget.ts         ~70   WidgetType subclass: toDOM() calls mountLeetCodeWidget;
│                                        eq() identity = (filePath, fenceIndex, sourceHash); destroy() flushes + tears down
├── WidgetController.ts            ~180  Mount lifecycle, child EditorView, debouncedWriter binding,
│                                        state persistence capture/hydrate
│                                        (Reading-mode wrapper: LeetCodeWidgetRenderChild extends MarkdownRenderChild)
├── debouncedWriter.ts             ~80   Obsidian debounce(400ms,resetTimer=true) + flush() + cancel();
│                                        rate-limit gate; arms suppression map; calls vault.process
├── selfWriteSuppression.ts        ~50   Plugin-singleton Map<string, {hash, expiresAt}> + set/consume/expire helpers
├── widgetRegistry.ts              ~50   Plugin-singleton Map<filePath, Set<WidgetController>> + flushAll()
├── statePersistence.ts            ~50   Map<`${path}::${idx}`, ChildEditorState> + 30s TTL sweep on plugin load
├── fenceLocator.ts                ~60   Pure helpers: extractFenceBody, rewriteFenceBody, computeFenceIndex
│                                        (lifts findCodeFence's fence-finding logic out of the deletion-bound
│                                        codeActionsEditorExtension.ts; widened to `leetcode-solve` opener)
├── embedDetect.ts                 ~30   ancestor `.markdown-embed`/`.internal-embed` walk + sourcePath mismatch check
└── __tests__/
    ├── fenceSerialization.property.test.ts        Property tests for extract/rewrite (D-09)
    ├── selfWriteSuppression.test.ts               Hash-collision + multi-file race coverage
    ├── statePersistence.test.ts                   TTL expiry, key collision, hydrate-on-remount
    ├── embedDetect.test.ts                        Both signals individually + together
    └── fenceLocator.test.ts                       computeFenceIndex over CRLF/multi-fence/trailing-newline
```

### Pattern 1: Two-Path Mount Behind Feature Flag

**What:** Reading-mode and Live-Preview both call the shared `mountLeetCodeWidget(host, source, file, plugin)` factory; both registrations are wrapped behind `useInlineWidget=ON` at `Plugin.onload()`.
**When to use:** Always — non-negotiable per CONTEXT C-02 / D-05.
**Example:**
```typescript
// src/main.ts Plugin.onload() addition behind D-05/D-06 flag check
if (this.settings.getUseInlineWidget()) {
  // D-06: mutual exclusion assert
  if (this.settings.getUseNestedEditor()) {
    new Notice('useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)');
    this.settings.setUseNestedEditor(false);
    await this.settings.save();
  }
  // Reading-mode mount
  this.registerMarkdownCodeBlockProcessor(
    'leetcode-solve',
    leetCodeBlockProcessor(this),  // gates on lc-slug + null section info
  );
  // Live-Preview mount + parent atomicRanges contribution
  this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);
}
```
Source: STACK §1 (Reading + Live Preview Two-Path Strategy), CONTEXT D-05/D-06

### Pattern 2: Self-Write Suppression Map (Hash-Based, NOT Boolean)

**What:** Per-path content-hash entries with 2s TTL; armed inside `flush()` BEFORE `vault.process`; consumed by the `vault.on('modify')` handler.
**When to use:** Always for the widget's own writes. External `vault.process` from other code paths (`copyToCode`, `mergeAIReviewSection`, etc.) MUST NOT arm the map — they should propagate through the modify path as external edits (Phase 20 reload path).
**Example:**
```typescript
// src/widget/selfWriteSuppression.ts (sketch)
type Entry = { expectedHash: string; expiresAt: number };
const map = new Map<string, Entry>();
const TTL_MS = 2000;

export function arm(path: string, expectedHash: string): void {
  map.set(path, { expectedHash, expiresAt: Date.now() + TTL_MS });
}

export function tryConsume(path: string, observedHash: string): 'consumed' | 'stale' | 'miss' {
  const entry = map.get(path);
  if (!entry) return 'miss';
  if (Date.now() > entry.expiresAt) {
    map.delete(path);
    return 'stale';
  }
  if (entry.expectedHash === observedHash) {
    map.delete(path);
    return 'consumed';
  }
  // Hash mismatch within TTL — likely race or external edit landed first.
  // Drop entry defensively; treat as external. (Phase 20 owns reload.)
  map.delete(path);
  return 'miss';
}
```
Source: PITFALLS P1, CONTEXT C-04, ARCHITECTURE §3

### Pattern 3: `EditorView.atomicRanges` Facet on Parent CM6

**What:** Live-Preview ViewPlugin contributes a function `(view) => RangeSet` to the `EditorView.atomicRanges` Facet covering every `leetcode-solve` fence range. Parent cursor's `moveByChar` / `moveVertically` skip across these ranges.
**When to use:** Mandatory for Live Preview widget mount (without it, cursor approach unmounts the widget).
**Example:**
```typescript
// src/widget/liveModeViewPlugin.ts (sketch)
import { ViewPlugin, ViewUpdate, EditorView, DecorationSet, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

class LeetCodeLiveViewPlugin {
  decorations: DecorationSet;
  // Cache the same RangeSet for both decorations and atomicRanges
  // — they MUST be the same range set to avoid drift.
  ranges: DecorationSet;
  constructor(view: EditorView) {
    [this.decorations, this.ranges] = buildLeetCodeFenceDecos(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      [this.decorations, this.ranges] = buildLeetCodeFenceDecos(update.view);
    }
  }
}

export const leetCodeFenceViewPlugin = (plugin: LeetCodePlugin) =>
  ViewPlugin.fromClass(LeetCodeLiveViewPlugin, {
    decorations: v => v.decorations,
    provide: pl => EditorView.atomicRanges.of(view => view.plugin(pl)?.ranges ?? Decoration.none),
  });
```
Source: SUMMARY primitive 2, FEATURES TS-02, `@codemirror/view/dist/index.d.ts:1284`

### Pattern 4: State Persistence Across Unmount/Remount (30s TTL)

**What:** On `MarkdownRenderChild.onunload` / `WidgetType.destroy`, capture `{cursor, scrollTop, historyField.value}` and stash in plugin-level `Map<`${path}::${idx}`, ChildEditorState>` with `expiresAt = Date.now() + 30000`. On mount, lookup → hydrate.
**When to use:** Every widget mount/unmount; covers Live Preview cursor-approach unmount, scroll virtualization, mode toggle (Cmd-E), theme change.
**Example:**
```typescript
// src/widget/statePersistence.ts (sketch)
type ChildEditorState = { cursor: number; scrollTop: number; historyValue: unknown };
const states = new Map<string, { state: ChildEditorState; expiresAt: number }>();

export function captureState(key: string, view: EditorView): void {
  const cursor = view.state.selection.main.head;
  const scrollTop = view.scrollDOM.scrollTop;
  // CM6 history extension serializes via state.toJSON({history: historyField})
  // — defer the exact serialization to plan-time; the contract is
  // "round-trip with hydrateState yields identical undo stack."
  const historyValue = view.state.toJSON()?.history;
  states.set(key, { state: { cursor, scrollTop, historyValue }, expiresAt: Date.now() + 30_000 });
}

export function hydrateState(key: string, view: EditorView): void {
  const entry = states.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    states.delete(key);
    return;
  }
  // Clamp cursor to current doc length (the body may have shrunk).
  const head = Math.min(entry.state.cursor, view.state.doc.length);
  view.dispatch({ selection: { anchor: head } });
  view.scrollDOM.scrollTop = entry.state.scrollTop;
  // historyValue restoration: dispatch a state.update with history annotation
  // — exact API for restoring history is plan-time detail.
  states.delete(key);
}
```
Source: PITFALLS P3 + P14, CONTEXT C-09 / D-01

### Pattern 5: Flush-on-Transition (Multi-Hook Coverage)

**What:** Six independent hooks call `controller.flushNow()` (which `cancel()`s the debouncer's pending timer and synchronously fires `vault.process`).
**When to use:** Every transition where the widget might lose its in-memory buffer.
**Example:**
```typescript
// src/main.ts onload (sketch)
this.registerEvent(this.app.workspace.on('active-leaf-change', () => widgetRegistry.flushAll()));
this.registerEvent(this.app.workspace.on('quit', () => widgetRegistry.flushAll()));   // ← belt
this.registerEvent(this.app.vault.on('rename', (file, oldPath) => widgetRegistry.flushFile(oldPath))); // pre-rename flush
this.registerDomEvent(window, 'beforeunload', () => widgetRegistry.flushAll());      // ← suspenders
// Plugin.onunload() → widgetRegistry.flushAll() (called from onunload)
// MarkdownRenderChild.onunload / WidgetType.destroy → controller.flushNow() (per-instance)
```
Source: PITFALLS P4, CONTEXT C-07, `obsidian.d.ts:7195` (`workspace.on('quit')` since 1.4.4)

### Anti-Patterns to Avoid

- **Boolean self-write flag:** PITFALLS P1 — provably broken under concurrent multi-file flushes. Always per-path map with hash + TTL.
- **Hashing widget in-memory doc instead of post-callback string:** the `vault.process` callback may normalize trailing newlines; hash the string the callback returns, not the doc. See "Specific Findings" §1.
- **Caching `getSectionInfo(el)` across renders:** Obsidian doc explicitly says "Only call this function right before you need this information" (`obsidian.d.ts:3884-3885`). Re-call inside the debounced flush; render fallback if null at use time.
- **Bundling `obsidian` or `@codemirror/*`:** runtime-provided. esbuild externals must include both.
- **Dispatching into parent CM6 from widget:** ARCHITECTURE Anti-Pattern §"Don't add `cm.dispatch` callsites on the parent CM6 from the widget." All plugin writes go through `vault.process`.
- **`ctx.frontmatter` as primary lc-slug source:** typed `any | null | undefined` (`obsidian.d.ts:3873`) — loose. Use `app.metadataCache.getFileCache(file)?.frontmatter` for consistency with v1.2 callsites.
- **Deleting the `'leetcode.*'` userEvent convention or the canonical write-path Phase 17 D-05 paragraph in CLAUDE.md:** both stay through Phase 21 (CONTEXT canonical_refs §"CLAUDE.md Conventions"). Phase 22 owns DELETE-08.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounce | Custom `setTimeout` + flag | `obsidian.debounce(cb, 400, true)` returning `Debouncer<T,V>` | `Debouncer.run()` (since 1.4.4) is the documented force-fire path for unmount/blur (`obsidian.d.ts:2156-2160`). Subtle clear-after-fire bugs already solved. |
| Atomic file write | `vault.modify` + read-back | `vault.process(file, fn)` | Verified atomic since `obsidian@1.1.0` (`obsidian.d.ts:6531-6545`); CI grep `scripts/grep-no-vault-modify.sh` enforces |
| Lifecycle for Reading-mode mount | DOM mutation observer | `ctx.addChild(new MarkdownRenderChild(el))` | Obsidian's framework calls `onunload` on detach; verified `obsidian.d.ts:3970-3981` |
| Lifecycle for Live-Preview mount | Manual cleanup on parent transactions | `WidgetType.destroy(dom)` + ViewPlugin's `destroy()` | CM6 calls when decoration is replaced or editor torn down |
| Cursor exclusion from fence | Custom `EditorState.changeFilter` | `EditorView.atomicRanges` Facet | Documented; cleaner; doesn't fight programmatic selections |
| Property-test corpus generation | Random `Math.random()` per test | `it.each` + a 30-LOC seeded generator (or fast-check in Phase 20) | Deterministic seeds are reproducible in CI; vitest tooling already in repo |
| Widget identity for re-render reuse | Custom DOM diffing | `WidgetType.eq()` returning `true` for unchanged source | CM6 reuses DOM; verified `@codemirror/view/dist/index.d.ts:219` |
| Vim mode | Custom keybinding | `vim()` from `@replit/codemirror-vim` (already imported) | Carry-over per C-14; STACK §5 confirms 6.3.0 is latest |
| Hash function | Custom murmur/djb2 | Web Crypto SubtleCrypto.digest('SHA-1') OR a 30-LOC sha1 | Whatever the planner picks must be deterministic and synchronous-friendly. SHA-1 is fine for echo detection (no security implication). See "Specific Findings" §1. |
| Embed detection | DOM walk only | DOM walk OR `ctx.sourcePath !== file.path` (BOTH, OR'd) | Either signal alone misses cases — see "Specific Findings" §3 |

**Key insight:** Every primitive Phase 19 needs is already in `obsidian@1.12.3` or the existing `@codemirror/*` deps. The only "build" is glue between them. Property tests are pure-function tests over `extractFenceBody` / `rewriteFenceBody` / `computeFenceIndex` — no Obsidian dependency, no DOM, fast.

## Common Pitfalls

### Pitfall 19-A: `vault.on('modify')` event-ordering assumption [NEW — not in upstream PITFALLS.md]

**What goes wrong:** Suppression map arming pattern is `arm(path, hash); await vault.process(file, fn)`. This works ONLY if `vault.on('modify')` fires DURING or AFTER the `process` Promise resolves. If `modify` fires synchronously inside the `process` callback (before `arm` runs to completion), the listener sees an empty map and treats the self-write as external.

**Why it happens:** STACK §3 claims the modify event fires synchronously after the underlying file write completes (in current Obsidian 1.12.x). PITFALLS P18 mentions a related concern. Neither cites the actual implementation; the assertion is empirical, not contractual. A future Obsidian release could change ordering.

**How to avoid:**
- **Plan 19-02 first task: empirical probe.** Wire a test plugin/script that arms the map BEFORE `vault.process`, then logs whether the modify-listener observes the entry. If yes → CONTEXT C-04 design works. If no → arm via `Promise.resolve().then(() => arm(...))` after kicking the `process` Promise so arming runs in the microtask queue before the modify event.
- **Defensive guard:** if the entry is missing AT modify-time, but `now < (lastFlushAt[path] + 100ms)`, treat as self-write anyway (best-effort fallback). Log all such cases for triage.

**Warning signs:** suppression map appears to "miss" self-writes intermittently; modify listener fires for the widget's own writes; widget appears to clobber its own typing on slow filesystems.

### Pitfall 19-B: `beforeunload` synchronous flush is best-effort [NEW]

**What goes wrong:** Spec says `beforeunload` handlers can run synchronously, but `vault.process` is async. Awaiting the Promise inside `beforeunload` is undefined behavior in Electron — the renderer process may exit before the Promise resolves. The user's last few keystrokes can still be lost.

**Why it happens:** Synchronous file write from Electron renderer requires fileSystem-API privileges Obsidian doesn't expose to plugins. `vault.process` always goes through Obsidian's async adapter.

**How to avoid:**
- **Use `workspace.on('quit', tasks => …)` as the primary shutdown hook.** Verified `obsidian.d.ts:7195`, since 1.4.4. The `Tasks` argument lets you `tasks.add(promise)` to delay Obsidian's quit until your flush resolves. **This is the correct primitive for graceful shutdown.**
- Keep `beforeunload` as a belt-and-suspenders best-effort hook — fire `flushAll()` synchronously (no await), accept that some writes may be in flight when the renderer dies.
- Document the residual risk in CONTEXT/PITFALLS for Phase 22 README docs (POLISH-04).

### Pitfall 19-C: `historyField.value` serialization is non-trivial

**What goes wrong:** CONTEXT C-09 says state persistence captures undo history. CM6's `historyField.value` is opaque — capturing it works (`view.state.toJSON({history: historyField})`) but rehydrating it via `EditorState.fromJSON` requires the history field be reconfigured BEFORE `EditorState.create`, not after. If you build the new state's extensions normally and then dispatch a `setValue`, history is lost.

**Why it happens:** CM6's history is a StateField; StateFields are part of the configuration captured at `create` time, not patched in later.

**How to avoid:**
- **Plan 19-03 acceptance:** explicitly test "type, scroll, undo three times, force unmount/remount within 30s, verify undo stack still has the same three entries." Without the explicit test, the silent regression is "undo seems to work but loses entries."
- **Implementation pattern:** capture `state.toJSON({history})` during unmount; on remount, call `EditorState.fromJSON(json, {extensions, ...}, {history})` instead of `EditorState.create({doc, extensions})`.
- Document this in `WidgetController.ts` so the Phase 20/21/22 maintainer doesn't accidentally simplify it.

### Pitfall 19-D: `getSectionInfo` returning null in embeds is REGULAR, not exceptional

**What goes wrong:** PITFALLS P15 documents the null path as edge-case fallback. Empirically (carry-over from Obsidian community plugin patterns), `getSectionInfo` returns null **almost always inside `![[...]]` transclusions** because the embedded section's line offsets relate to the source file, not the host file — Obsidian doesn't recompute them in the embed context.

**Why it happens:** `MarkdownPostProcessorContext.sourcePath` is the **host** path during embed rendering, but the section info refers to the **embedded source** offsets. Obsidian's API can't reconcile this consistently, so it returns null.

**How to avoid:**
- **Treat null `getSectionInfo` as "you're in an embed-like context" rather than "rare error."**
- The static `<pre><code>` fallback is the right behavior — but combine it with the embed detection (`embedDetect.ts`) so the embed read-only widget renders consistently.
- For embeds where the source file IS available (`ctx.sourcePath` is the host, but `app.vault.getAbstractFileByPath(<embed-target>)` is reachable via the embed link), the widget can still render — just gate write paths off (`EditorView.editable.of(false)`).

### Pitfall 19-E: Multiple `leetcode-solve` fences in one file (multi-fence corner)

**What goes wrong:** D-01 locks `fenceIndex = ordinal index of `leetcode-solve` fence`. CONTEXT acknowledges "LC notes have exactly one `leetcode-solve` fence in practice (always index 0)" but says "multi-fence support is a free side effect." It IS free for state persistence — but `flushNow` and the suppression map need to know WHICH fence is the target, and the ordinal index can shift if a fence is inserted above the active one.

**Why it happens:** `fenceIndex` is index-based, not content-based. Inserting a `leetcode-solve` opener above index 0 shifts the active fence to index 1 — but only on the NEXT mount. The current widget controller still holds the old index in its closure. If a `vault.on('modify')` fires while the controller is mid-flush, the stale index could write to the wrong fence.

**How to avoid:**
- **Phase 19 simplification:** assert exactly one `leetcode-solve` fence per file at mount time. If `>1`, log and use the first; defer multi-fence handling explicitly to v1.4+ (already in CONTEXT deferred ideas).
- **Stray fence in non-LC note:** the lc-slug gate (D-04 intersection) renders read-only widget — no write path, so no fenceIndex confusion.
- **Recompute `fenceIndex` inside `flush()` (not at mount time)** — call `computeFenceIndex(disk-content, openerLine)` immediately before `vault.process` to detect mid-flight insertion above. If the index shifted, abort flush and surface a Notice "Fence position changed; reload to continue editing."

### Pitfall 19-F: `WidgetType.eq()` identity for stable CM6 DOM reuse

**What goes wrong:** Live-Preview ViewPlugin re-evaluates `Decoration.replace({widget})` on every `update.docChanged || update.viewportChanged`. If the new widget instance returns `eq(other) === false`, CM6 destroys the old DOM (calling `WidgetType.destroy`) and remounts. Each remount runs through `mountLeetCodeWidget` again — losing in-memory CM6 state.

**Why it happens:** `WidgetType.eq()`'s default returns `false` (`@codemirror/view/dist/index.d.ts:215-219`), so a naive subclass thrashes.

**How to avoid:**
- `eq()` returns `true` when `(filePath, fenceIndex, sourceHash)` are equal. `sourceHash` is a hash of the fence body — equal-source means the widget rendered the same code, no remount needed.
- DO NOT include the `WidgetController` instance in `eq()` — it's per-render; eq must be content-based.
- This complements (does not replace) the state persistence map: persistence map handles cases where DOM IS torn down (mode flip, file close); `eq()` prevents unnecessary teardown.

### Pitfall 19-G: Mutual-exclusion assert (D-06) timing matters

**What goes wrong:** D-06 says `useInlineWidget=ON` AND `useNestedEditor=ON` is invalid; the toggle UI must not allow both. But if a user manually edits `data.json` to set both, `Plugin.onload()` runs before settings UI renders — both code paths can register, producing two CM6s per fence.

**How to avoid:**
- Run the mutual-exclusion check at the TOP of `Plugin.onload()`, before either `registerMarkdownCodeBlockProcessor` or `registerEditorExtension` calls. Force `useNestedEditor=false` and persist the change with a Notice.
- `SettingsTab.ts` toggle handler must call the same assert — flipping `useInlineWidget=ON` immediately writes `useNestedEditor=false` and re-renders the tab.
- Consider documenting in plan 19-04 that the canonical truth-table is: `(inline, nested) ∈ {(false, true), (false, false), (true, false)}`. The fourth state is unreachable.

## Runtime State Inventory

> Phase 19 is greenfield code (new `src/widget/` directory, additive `src/main.ts` registrations). It is NOT a rename/refactor/migration phase. **This section omitted intentionally.** Phase 21 (`v1.2 Migration`) and Phase 22 (`v1.2 Path Removal + Polish`) are the rename/refactor phases for v1.3.

## Code Examples

### Reading-mode mount with lc-slug + null-section-info gates

```typescript
// src/widget/codeBlockProcessor.ts (sketch — verify against obsidian.d.ts:4848)
// Source: STACK §1a, CONTEXT C-10, PITFALLS P15+P22
import { TFile, MarkdownPostProcessorContext } from 'obsidian';

export function leetCodeBlockProcessor(plugin: LeetCodePlugin) {
  return (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return renderStaticFallback(el, source);

    // Use metadataCache (consistent with v1.2 callsites), not ctx.frontmatter
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    const lcSlug = typeof fm?.['lc-slug'] === 'string' ? fm['lc-slug'] : null;

    // Null section info → fallback (obsidian.d.ts:3884-3889 — "many circumstances")
    const info = ctx.getSectionInfo(el);
    if (!info) return renderStaticFallback(el, source);

    const isEmbed = isEmbedContext(el, ctx, file);
    if (!lcSlug || isEmbed) {
      // Stray fence in non-LC note OR embed → read-only widget (EMBED-04, C-15)
      const child = new LeetCodeWidgetRenderChild(
        el, source, ctx, plugin, file, info, /*readOnly=*/true,
      );
      ctx.addChild(child);
      return;
    }

    // LC note + non-embed → editable widget
    const child = new LeetCodeWidgetRenderChild(
      el, source, ctx, plugin, file, info, /*readOnly=*/false,
    );
    ctx.addChild(child);
  };
}
```

### Embed detection (BOTH signals)

```typescript
// src/widget/embedDetect.ts (sketch)
// Source: PITFALLS P16, EMBED-03 requirement
export function isEmbedContext(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  targetFile: TFile,
): boolean {
  // Signal 1: DOM ancestor walk
  let node: HTMLElement | null = el;
  while (node) {
    if (node.classList?.contains('markdown-embed') ||
        node.classList?.contains('internal-embed')) {
      return true;
    }
    node = node.parentElement;
  }
  // Signal 2: sourcePath mismatch — host renders embedded fence
  if (ctx.sourcePath !== targetFile.path) return true;
  return false;
}
```

### Debounced writer with rate limit + suppression arming + diagnostic

```typescript
// src/widget/debouncedWriter.ts (sketch)
// Source: SUMMARY primitive 4, CONTEXT C-04+C-06+C-08, PITFALLS P4
import { debounce, Debouncer, TFile, App } from 'obsidian';
import { arm as armSuppression } from './selfWriteSuppression';
import { sha1, extractFenceBody, rewriteFenceBody } from './fenceLocator';

export class DebouncedWriter {
  private deb: Debouncer<[], void>;
  private lastFlushAt = 0;
  private rateLimitMs = 200;

  constructor(
    private app: App,
    private file: TFile,
    private getDoc: () => string,
    private getFenceIndex: () => number,
    delayMs: number,
  ) {
    this.deb = debounce(() => this.flush(), delayMs, true);
  }

  run(): void { this.deb(); }
  cancel(): void { this.deb.cancel(); }
  forceFlush(): void { this.deb.cancel(); void this.flush(); }

  private async flush(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFlushAt < this.rateLimitMs) {
      // Re-schedule with remaining budget
      setTimeout(() => this.flush(), this.rateLimitMs - (now - this.lastFlushAt));
      return;
    }
    this.lastFlushAt = now;

    const newBody = this.getDoc();
    const fenceIndex = this.getFenceIndex();

    // CRITICAL: hash the future-disk content, computed via the SAME function
    // that vault.process will call. Any normalization in rewriteFenceBody
    // must be reflected in the hash. (See Specific Findings §1.)
    let postWriteText = '';
    await this.app.vault.process(this.file, (body) => {
      postWriteText = rewriteFenceBody(body, fenceIndex, newBody);
      return postWriteText;
    });
    const expectedHash = await sha1(extractFenceBody(postWriteText, fenceIndex) ?? '');
    armSuppression(this.file.path, expectedHash);

    // D-09 diagnostic: post-flush hash drift detection
    const observed = extractFenceBody(postWriteText, fenceIndex) ?? '';
    if (await sha1(observed) !== await sha1(newBody)) {
      console.warn(`LC widget: post-flush hash drift for ${this.file.path}`);
    }
  }
}
```

**NOTE:** the order in this sketch is "process first, then arm" — but CONTEXT C-04 says "armed inside `debouncedWriter.flush()` BEFORE `vault.process`." The right shape is `arm(path, expectedHash) → vault.process(file, fn)`. The expected hash MUST be computable before the write. **Specific Findings §1 explains how.**

### Property-test seeds (hand-rolled — no fast-check)

```typescript
// src/widget/__tests__/fenceSerialization.property.test.ts (sketch)
// Source: D-09
import { describe, it, expect } from 'vitest';
import { extractFenceBody, rewriteFenceBody } from '../fenceLocator';

const HOSTILE_BODIES = [
  '',                                           // empty
  'x',                                          // single char
  'a\nb\nc',                                    // multi-line LF
  'a\r\nb\r\nc',                                // CRLF
  '```\nnested\n```',                           // nested triple backticks
  '---\nframtmatter-like\n---',                 // frontmatter lookalike
  '\t\tindent\n    spaces',                     // mixed leading whitespace
  'trailing space   \nnext',                    // trailing whitespace
  'no-newline-at-end',                          // no trailing \n
  'ending-mid-byte\n\n\n',                      // multiple trailing \n
  '🎉unicode',                                  // multi-byte
];

const SHELLS = [
  '## Code\n\n```leetcode-solve\n{{BODY}}\n```\n',
  '# Title\n\n## Code\n\n```leetcode-solve\n{{BODY}}\n```\n\n## Notes\n',
  // multi-fence (Pitfall 19-E corner)
  '## Code\n\n```leetcode-solve\nA\n```\n\n## Other\n```leetcode-solve\n{{BODY}}\n```\n',
];

describe('fence body round-trip', () => {
  it.each(
    SHELLS.flatMap((shell, sIdx) =>
      HOSTILE_BODIES.map((body) => ({ shell, body, sIdx, fenceIndex: sIdx === 2 ? 1 : 0 }))
    )
  )('shell %#: round-trips body=$body', ({ shell, body, fenceIndex }) => {
    const file = shell.replace('{{BODY}}', body);
    const extracted = extractFenceBody(file, fenceIndex);
    expect(extracted).toBe(body);
    const rewritten = rewriteFenceBody(file, fenceIndex, body);
    expect(rewritten).toBe(file);
  });
});
```

## Specific Findings

### §1. Hash arming order — the "before vault.process" requirement is solvable

**Problem:** CONTEXT C-04 + ARCHITECTURE §3 say arm BEFORE `vault.process`. But the expected hash is `sha1(post-write-fence-body)`. We can't know the post-write body until the `vault.process` callback runs (it may apply normalization, line-ending flips, etc.).

**Resolution:** `vault.process` is **synchronous in its callback** (`obsidian.d.ts:6531-6545` — "callback function which returns the new content of the note synchronously"). The arming sequence is:

```typescript
// 1. Pre-compute the new full file via the SAME function that will run inside the callback
const currentDisk = await this.app.vault.read(this.file);
const futureFullText = rewriteFenceBody(currentDisk, fenceIndex, newBody);
const futureFenceBody = extractFenceBody(futureFullText, fenceIndex) ?? newBody;
const expectedHash = await sha1(futureFenceBody);

// 2. Arm BEFORE invoking vault.process
armSuppression(this.file.path, expectedHash);

// 3. Run vault.process — its callback returns the same string
await this.app.vault.process(this.file, (body) => {
  // body should equal currentDisk; rewriteFenceBody is idempotent on body == currentDisk
  return rewriteFenceBody(body, fenceIndex, newBody);
});
```

**Why this works:** `rewriteFenceBody` is a pure function. Computing it twice (once for arming, once inside the callback) yields the same result IF `currentDisk == body inside callback`. They will be equal in the common case. If they DIFFER (race: external write landed between `vault.read` and `vault.process`), the hash from arming won't match the one observed by the modify listener — the suppression entry simply doesn't consume, and the modify event is treated as external. **This is the correct fail-safe behavior** — we'd rather miss our own write than swallow an external one.

**Cost:** one extra `vault.read` per flush. With 400ms debounce + 200ms rate limit, that's at most 5/sec — negligible. `cachedRead` is even cheaper but PITFALLS P18 cautions against it in the modify path (we're not in the modify path here, but use the documented `vault.read` to be safe).

### §2. `fenceIndex` computation strategy — ordinal counting is correct

**CONTEXT D-01 locks ordinal index. The implementation:**
```typescript
// src/widget/fenceLocator.ts
export function computeFenceIndex(fileText: string, fenceLineStart0Based: number): number {
  const lines = fileText.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < fenceLineStart0Based; i++) {
    // Match ` ```leetcode-solve` opener — be permissive on optional leading
    // whitespace inside callouts/blockquotes (deferred edge case but cheap)
    if (/^\s*```leetcode-solve\b/.test(lines[i] ?? '')) count++;
  }
  return count;
}
```

`getSectionInfo(el).lineStart` is the 0-indexed line of the fence opener (verified `obsidian.d.ts:4017-4024`). Count prior `leetcode-solve` openers up to (but not including) that line.

**Lezer alternative rejected:** Lezer is only available inside CM6. Reading mode would need a different code path (parse via `app.metadataCache` or hand-rolled). Two paths is one path too many for an O(N) string scan that runs at mount/remount only.

### §3. Embed detection — both signals required

The DOM-ancestor signal misses cases where an embed's content gets reparented (rare but observed in Obsidian's hover-preview popover where the embed's wrapper class can be stripped). The `ctx.sourcePath !== file.path` signal misses cases where Obsidian renders an LC note's own fence in a non-LC host (the `targetFile.path` would equal `ctx.sourcePath` because the embed-target IS the LC note's own path). **OR** the two signals — if either is true, treat as embed.

### §4. `vault.on('modify')` registration must check `useInlineWidget` at fire time

If the user toggles `useInlineWidget=OFF` mid-session AFTER widgets registered, the modify listener stays registered (Obsidian doesn't auto-unregister on flag flip). Either:
- Register/unregister via plugin's `EventRef` machinery on each toggle (more code), OR
- Gate the listener body with `if (!this.settings.getUseInlineWidget()) return;` early-return (simpler).

**Recommend the gated-body pattern** — eliminates a class of "listener still firing for a deactivated subsystem" bugs.

### §5. Property-test corpus expansion in Plan 19-04

Phase 19-01 ships the SHELLS × HOSTILE_BODIES matrix above (~30 cases). Plan 19-04 expands to:
- Shells with mixed Windows/Unix line endings within the same file
- Shells with non-`leetcode-solve` fences before/after the target (test fenceIndex)
- Shells with `\`\`\`leetcode-solve` opener inside a blockquote (`> \`\`\``)
- Shells with the closer on the last line (no trailing newline)
- Bodies containing the literal string `## Code` (false-heading match in `findCodeFence` if the regex is lazy)

### §6. Lift list from `src/main/codeActionsEditorExtension.ts`

To preserve test coverage during deletion (Phase 22), Phase 19 must:
1. **Lift `findCodeFence` (lines 177-212)** into `src/widget/fenceLocator.ts`. Widen regex to match both `\`\`\`<langslug>` (legacy) AND `\`\`\`leetcode-solve` (v1.3) — but tag the result with which kind. Phase 21 migrator uses the legacy match; Phase 19 widget uses the leetcode-solve match.
2. **Keep the existing test file** `tests/main/codeActionsEditorExtension.test.ts` passing with redirected imports until Phase 22 deletes it.
3. Do NOT lift `CodeActionsWidget`, `buildDecorations`, `languageRefreshEffect`, `buildCodeActionsEditorExtension` — these are v1.2 path; they stay in `codeActionsEditorExtension.ts` until Phase 22.

### §7. `'leetcode.*'` userEvent and write-path conventions are STILL load-bearing in Phase 19

CLAUDE.md §Conventions documents two patterns that still govern the v1.2 path (active under `useInlineWidget=OFF`, the default through Phase 21):
- The section-lock bypass via `userEvent: 'leetcode.<verb>'`
- The Phase 17 D-05 canonical write-path pattern (child editor dispatch + `addToHistory.of(false)`)

**Phase 19 plans MUST NOT modify or delete either paragraph.** Any new write paths added in Phase 19 (Reset, Copy-to-Code) that touch the v1.3 widget go through `vault.process` only — but the same operations on the v1.2 path keep using the existing `'leetcode.*'` convention. Plans should explicitly state "Phase 19 leaves CLAUDE.md §Conventions unchanged" so the maintainer doesn't accidentally clean up.

### §8. Settings shape additions

```typescript
// src/settings/SettingsStore.ts additions
export interface LCData {
  // ... existing fields ...
  useInlineWidget: boolean;          // default false (D-05 hard-gate)
  widgetSyncDebounceMs: 300 | 400 | 500 | 1000 | 2000;  // default 400 (C-06)
}

// In SettingsTab.ts: new "Experimental" subsection (D-08) with:
// — Banner: "These features are under development and may change between releases."
// — Toggle: "Use inline widget editor (v1.3 alpha)" → onChange: assert mutual exclusion (D-06)
// — Slider/Dropdown: "Save delay (ms)" → 300/400/500/1000/2000
```

The Experimental section is removed in Phase 22 (POLISH-01) when the toggle becomes unconditional.

## State of the Art

| Old Approach (v1.2) | Current Approach (v1.3) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dual-CM6 nested editor + bidirectional sync | Inline `registerMarkdownCodeBlockProcessor` + ViewPlugin two-path mount + one-way `vault.process` sync | v1.3 milestone (this phase) | −2,400 LOC across milestone; eliminates fence-fragmentation / Cmd-Z-leak / locked-range-dispatch bug class |
| `sectionLockExtension.ts` `EditorState.changeFilter` with `'leetcode.*'` userEvent bypass | `EditorView.atomicRanges` Facet on parent CM6 (Phase 19) + narrower `sectionProtectionExtension.ts` (Phase 20) | Phase 19 introduces atomicRanges; Phase 20 narrows section lock; Phase 22 retires `'leetcode.*'` | Cleaner dispatch model; widget owns the fence range; v1.0 `## Problem` body protection retained via narrower replacement |
| Boolean self-write flag | Per-path content-hash map with TTL | Phase 19 | Multi-file flush correctness; eliminates PITFALLS P1 |
| `vault.modify` (banned by CI grep) | `vault.process` (atomic since 1.1.0) | Already canonical pre-v1.3; carry-over | No change |
| `\`\`\`python`/`\`\`\`java`/etc. fence opener encodes language | `\`\`\`leetcode-solve` fence opener; language in `lc-language` frontmatter | Phase 21 migration; Phase 22 cutover | Single source of truth for language |
| `MarkdownPostProcessorContext.frontmatter` (any-typed) | `app.metadataCache.getFileCache(file)?.frontmatter` (consistent with v1.2) | Phase 19 widget code | Type-safe; matches existing callsites |

**Deprecated/outdated (still in tree until later phase):**
- `src/main/childEditorSync.ts` (v1.2 bidirectional sync) — alive under `useInlineWidget=OFF`; deleted Phase 22
- `src/main/sectionLockExtension.ts` (v1.2 lock) — alive under `useInlineWidget=OFF`; replaced Phase 20 narrower; deleted Phase 22
- `src/main/nestedEditorExtension.ts` — alive under `useInlineWidget=OFF`; deleted Phase 22
- `src/main/childEditorRegistry.ts` — alive under `useInlineWidget=OFF`; replaced Phase 19 by `widgetRegistry.ts`; deleted Phase 22
- `src/main/codeActionsEditorExtension.ts` — alive under `useInlineWidget=OFF`; `findCodeFence` lifted Phase 19 to `src/widget/fenceLocator.ts`; deleted Phase 22

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vault.on('modify')` fires AFTER `vault.process` resolves (synchronous-after-flush in Obsidian 1.12.x) | Pitfall 19-A | Suppression map misses self-writes; widget reloads mid-edit; visible garbled typing. Plan 19-02 must include empirical probe BEFORE building suppression map. |
| A2 | `el.addEventListener('mousedown', e => e.stopPropagation())` reduces Live-Preview raw-source-reveal | CONTEXT D-02 | Empirically untested per CONTEXT specifics. State-persistence map carries the load if it doesn't help. Worst case: ~3 LOC of dead defensive code. |
| A3 | `historyField.value` round-trips via `state.toJSON({history})` + `EditorState.fromJSON(json, config, {history})` | Pattern 4 + Pitfall 19-C | Undo stack lost on remount; user complaint surface but not data loss. Plan 19-03 acceptance test exposes this. |
| A4 | `getSectionInfo` returns null in embed contexts (often, not exceptional) | Pitfall 19-D | If wrong (returns valid info), the embed read-only path still works — just less aggressive fallback. Low risk. |
| A5 | `MarkdownPostProcessorContext.frontmatter` is loose-typed `any|null|undefined`; `metadataCache` is preferred | Anti-Patterns | If `ctx.frontmatter` is reliable, no impact. Sticking with metadataCache for parity with v1.2 callsites is defensive. |
| A6 | Computing `rewriteFenceBody` twice (once for arming hash, once in `vault.process` callback) yields the same result in non-race cases | Specific Findings §1 | Function is pure; only failure mode is concurrent external write between `vault.read` and `vault.process`, which the suppression's miss-on-mismatch behavior handles correctly. |
| A7 | SHA-1 is acceptable for self-write echo detection (no security implication) | Don't Hand-Roll | If collision concerns surface in plan-check, swap to SHA-256. Bundle cost: a few KB; performance cost: negligible. |
| A8 | `workspace.on('quit')` `Tasks` argument supports `tasks.add(promise)` to delay Obsidian shutdown | Pitfall 19-B | If `Tasks` API has different shape, fall back to `beforeunload` only — accept residual data loss risk on Cmd-Q. Plan 19-02 must verify `Tasks` API at implementation time. |
| A9 | `useInlineWidget=OFF` default (D-05) blocks ALL widget code paths from running, so no LC note is affected by Phase 19 unless the user opts in | CONTEXT D-05 | Hard-gate is the bisection boundary; any Phase 19 bug that escapes the flag check is a P0 regression of the v1.2 baseline. Verify with a "flag OFF + open existing v1.2 LC note" smoke test in every plan. |
| A10 | `fast-check` would not measurably improve test quality enough to justify +50KB dev-dep in Phase 19 | Standard Stack | If Plan 19-04 review finds a class of bug only fast-check catches, add it — easy to justify in retrospect. |

## Open Questions

1. **Empirical probe of `vault.on('modify')` timing (A1)**
   - What we know: STACK §3 asserts modify fires after `vault.process` resolves on current Obsidian
   - What's unclear: contractual ordering; future-Obsidian-release stability
   - Recommendation: Plan 19-02 first task is the probe; if assumption fails, switch to `Promise.resolve().then()` micro-task arming (still ~3 LOC change)

2. **Empirical probe of `mousedown.stopPropagation()` effectiveness (D-02 / A2)**
   - What we know: CONTEXT specifics calls this a "bet, not contract"
   - What's unclear: whether it actually prevents Live-Preview cursor-place behavior
   - Recommendation: surface inside Plan 19-01 / 19-03 dev-vault testing; persistence map carries the load regardless

3. **CM6 history serialization round-trip (A3)**
   - What we know: `state.toJSON({history})` + `EditorState.fromJSON` is the documented pattern
   - What's unclear: whether `historyField` is exposed by `@codemirror/commands@6.10.3` for that signature
   - Recommendation: Plan 19-03 includes an explicit "type, undo three times, force unmount within 30s, remount, undo three times → original state" acceptance test. If history can't round-trip, ship state persistence WITHOUT history (cursor + scroll only) and document — undo is best-effort across remount

4. **Multi-fence corner case (Pitfall 19-E)**
   - What we know: D-01 says "free side effect"; CONTEXT acknowledges "always index 0 in practice"
   - What's unclear: whether Plan 19-01 should hard-assert single-fence or quietly support multi
   - Recommendation: Plan 19-01 supports multi-fence via fenceIndex but logs a Notice on >1 ("Multiple LC fences detected — using the first one. Multi-fence support deferred to v1.4"). Defensive without scope creep.

5. **`workspace.on('quit')` `Tasks` shape (A8)**
   - What we know: `obsidian.d.ts:7195` confirms the event exists since 1.4.4
   - What's unclear: exact `Tasks` argument shape (no Tasks export found in `obsidian.d.ts` quick search)
   - Recommendation: Plan 19-02 implementation reads the actual `Tasks` shape from runtime introspection (`console.log(tasks)`) before relying on `tasks.add(promise)`

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (esbuild build) | Build pipeline | ✓ (assumed — repo builds today) | per `package.json` engines | — |
| `obsidian@1.12.3` (typings + runtime via host) | All Phase 19 mount/sync primitives | ✓ | 1.12.3 (`node_modules/obsidian/package.json`) | — |
| `@codemirror/view@6.38.6` | Widget surface, atomicRanges, ViewPlugin, Decoration.replace | ✓ | 6.38.6 | — |
| `@codemirror/state@6.5.0` | Compartment, EditorState, RangeSetBuilder | ✓ | 6.5.0 | — |
| `@replit/codemirror-vim@6.3.0` | Conditional vim() at mount | ✓ | 6.3.0 | — |
| `vitest@4.1.5` + `happy-dom@^20.9.0` | Property tests, unit tests | ✓ | per package.json | — |
| `eslint-plugin-obsidianmd@^0.3.0` | Lint widget DOM code (POLISH-03 carry-through) | ✓ | per package.json | — |
| Browser `crypto.subtle.digest` | SHA-1 hash for suppression | ✓ in Electron renderer | — | Hand-rolled sha1 (~30 LOC) if happy-dom test env lacks it |
| `Tasks` runtime shape from `workspace.on('quit', tasks => …)` | Pitfall 19-B graceful shutdown | ⚠ shape unverified | — | `beforeunload` only (accepts residual risk) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `crypto.subtle` in `happy-dom` test env may need a sha1 polyfill — trivial.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.5` with `happy-dom@^20.9.0` test env |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/widget tests/main/codeActionsEditorExtension.test.ts` |
| Full suite command | `npm test` (runs all 196 test files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIDGET-01 | Both Reading + Live Preview register and mount on `\`\`\`leetcode-solve` | integration (vitest happy-dom) + manual UAT | `npx vitest run tests/widget/codeBlockProcessor.test.ts` | ❌ Wave 0 |
| WIDGET-02 | Parent cursor cannot enter fence range | integration (parent CM6 + atomicRanges contribution) | `npx vitest run tests/widget/atomicRanges.test.ts` | ❌ Wave 0 |
| WIDGET-03 | Mounts on fence tag (not lc-slug) — embeds + stray fences render correctly | unit (lc-slug gate logic) + manual UAT | `npx vitest run tests/widget/codeBlockProcessor.test.ts` | ❌ Wave 0 |
| WIDGET-04 | State persists across unmount/remount within 30s TTL | unit (statePersistence Map TTL) + manual UAT for actual remount | `npx vitest run tests/widget/statePersistence.test.ts` | ❌ Wave 0 |
| WIDGET-05 | Null `getSectionInfo` → static `<pre><code>` fallback | unit (mock null ctx.getSectionInfo) | `npx vitest run tests/widget/codeBlockProcessor.test.ts` | ❌ Wave 0 |
| WIDGET-06 | Missing `lc-language` → Python fallback + Notice | unit | `npx vitest run tests/widget/languageFallback.test.ts` | ❌ Wave 0 |
| WIDGET-07 | Reading mode renders read-only via `EditorView.editable.of(false)` | unit (assert state has editable=false) | `npx vitest run tests/widget/WidgetController.test.ts` | ❌ Wave 0 |
| WIDGET-08 | All 8 language packs carry over | covered by existing `tests/main/childEditorLanguage.behavioral.test.ts` (no regression) | `npx vitest run tests/main/childEditorLanguage.behavioral.test.ts` | ✅ |
| SYNC-01 | Debounced 400ms write via `vault.process` | unit (mock vault) | `npx vitest run tests/widget/debouncedWriter.test.ts` | ❌ Wave 0 |
| SYNC-02 | Flush-on-transition for all 6 hooks | unit per hook | `npx vitest run tests/widget/flushHooks.test.ts` | ❌ Wave 0 |
| SYNC-03 | Per-path content-hash suppression (NOT boolean) | unit (multi-file race) | `npx vitest run tests/widget/selfWriteSuppression.test.ts` | ❌ Wave 0 |
| SYNC-06 | Byte-exact round-trip serialization | property tests (D-09) | `npx vitest run tests/widget/fenceSerialization.property.test.ts` | ❌ Wave 0 |
| SYNC-07 | Per-file flush rate-limit ≤ 1/200ms | unit | `npx vitest run tests/widget/debouncedWriter.test.ts` | ❌ Wave 0 |
| EMBED-01 | `![[lc-note]]` renders read-only widget | manual UAT (DOM-tree-dependent) | manual | n/a — UAT |
| EMBED-02 | `![[lc-note#Code]]` section embed → read-only | manual UAT | manual | n/a — UAT |
| EMBED-03 | Embed detection via DOM ancestor OR sourcePath mismatch | unit | `npx vitest run tests/widget/embedDetect.test.ts` | ❌ Wave 0 |
| EMBED-04 | Stray fence in non-LC note → read-only widget, no Run/Submit | unit | `npx vitest run tests/widget/codeBlockProcessor.test.ts` | ❌ Wave 0 |
| VIM-01 | `vimMode=true` at mount → vim extension included | unit | `npx vitest run tests/widget/WidgetController.test.ts` | ❌ Wave 0 |
| VIM-04 | Vim keystrokes confined to embedded editor (atomicRanges enforces) | manual UAT (parent-doc keystroke smoke) | manual | n/a — UAT |
| THEME-01 | Widget inherits Obsidian theme | manual UAT (visual diff vs v1.2) | manual | n/a — UAT |
| THEME-02 | `lc-nested-editor` + `HyperMD-codeblock` classes carry over | covered by existing v1.2 theme tests (no regression) | existing | ✅ |
| THEME-03 | `childEditorSemanticClasses.ts` Lezer → CSS class carry over | covered by existing v1.2 tests (no regression) | existing | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/widget` (~5s, fast iteration)
- **Per wave merge:** `npm test` (full 196 test files, ~30s)
- **Phase gate:** Full suite green + manual UAT pass for embed + cursor-approach scenarios before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/widget/codeBlockProcessor.test.ts` — covers WIDGET-01, WIDGET-03, WIDGET-05, EMBED-04
- [ ] `tests/widget/atomicRanges.test.ts` — covers WIDGET-02
- [ ] `tests/widget/statePersistence.test.ts` — covers WIDGET-04
- [ ] `tests/widget/languageFallback.test.ts` — covers WIDGET-06
- [ ] `tests/widget/WidgetController.test.ts` — covers WIDGET-07, VIM-01
- [ ] `tests/widget/debouncedWriter.test.ts` — covers SYNC-01, SYNC-07
- [ ] `tests/widget/flushHooks.test.ts` — covers SYNC-02
- [ ] `tests/widget/selfWriteSuppression.test.ts` — covers SYNC-03
- [ ] `tests/widget/fenceSerialization.property.test.ts` — covers SYNC-06 (D-09 property tests)
- [ ] `tests/widget/embedDetect.test.ts` — covers EMBED-03
- [ ] `tests/widget/fenceLocator.test.ts` — covers `extractFenceBody`/`rewriteFenceBody`/`computeFenceIndex` unit
- [ ] `tests/helpers/widget-mock-vault.ts` — shared fixture for vault.process mocking with modify-event simulation

**No new framework install** — all of the above use the existing vitest + happy-dom + tests/helpers/obsidian-stub.ts plumbing. Test files mirror existing `tests/main/*.test.ts` style.

## Project Constraints (from CLAUDE.md)

CLAUDE.md `## Conventions` paragraphs that Phase 19 plans MUST honor:

1. **`'leetcode.*'` userEvent annotation convention (still load-bearing for v1.2 path under `useInlineWidget=OFF`).** Phase 19 plans must NOT delete or modify this paragraph. Any plugin write that targets a v1.2 fence-locked range MUST set `userEvent: 'leetcode.<verb>'` on its `cm.dispatch` spec. Phase 22 (DELETE-08, PROTECT-03) retires this — not Phase 19.
2. **Canonical plugin write-path pattern (Phase 17 D-05) — still load-bearing.** Plugin writes touching the fence body in v1.2 mode dispatch through the child editor's CM6 instance via `childEditorRegistry`; falls back to `app.vault.process(...)` only when no child is registered. Phase 19's NEW widget write path (`debouncedWriter` + `vault.process`) is independent and ADDITIVE — it does NOT replace the v1.2 path until Phase 22 DELETE-06.
3. **Vault path memory:** plugin folder is `obsidian-leetcode/`, deploy target `~/Documents/Obsidian Vault/.obsidian/plugins/obsidian-leetcode/`. Manual UAT flows reference this path.
4. **GSD Workflow Enforcement:** Phase 19 work happens via `/gsd-execute-phase` (not direct edits). All file changes go through GSD's planning artifacts.
5. **No `vault.modify` on active files** — already enforced by CI grep (`scripts/grep-no-vault-modify.sh`); Phase 19 widget code preserves this discipline.
6. **No `innerHTML` in widget DOM code** (carry-through to POLISH-03 in Phase 22). Use `createEl` / `createDiv` / `createSpan`. `eslint-plugin-obsidianmd@^0.3.0` already in repo to catch.
7. **Widget DOM cleanup via `MarkdownRenderChild` for Reading mode and `WidgetType.destroy` for Live Preview.** Both are documented Obsidian/CM6 lifecycle primitives — verified `obsidian.d.ts:3970-3981` and `@codemirror/view/dist/index.d.ts:215+`.

## Sources

### Primary (HIGH confidence)
- `node_modules/obsidian/obsidian.d.ts` (`obsidian@1.12.3`, installed in this session) — verified line citations:
  - `:2126-2161` — `debounce` and `Debouncer<T,V>` with `.run()` since 1.4.4
  - `:3837-3891` — `MarkdownPostProcessor`, `MarkdownPostProcessorContext`, `addChild`, `getSectionInfo` (returns null in many circumstances per JSDoc)
  - `:3970-3981` — `MarkdownRenderChild` constructor + lifecycle
  - `:4017-4024` — `MarkdownSectionInformation` `{text, lineStart, lineEnd}`
  - `:4848` — `Plugin.registerMarkdownCodeBlockProcessor(language, handler, sortOrder?)`
  - `:6531-6545` — `Vault.process(file, fn, options?)` atomic since 1.1.0
  - `:6593-6611` — `Vault.on('create'|'modify'|'delete'|'rename')` event signatures
  - `:7106` — `workspace.on('active-leaf-change')`
  - `:7195` — `workspace.on('quit', tasks => …)` since 1.4.4
- `node_modules/@codemirror/view/dist/index.d.ts` (`@codemirror/view@6.38.6`) — verified:
  - `:1284` — `EditorView.atomicRanges` Facet signature
  - `:215-219` — `WidgetType.eq()` default returns false
  - `:151+` — `Decoration.ReplaceDecorationSpec` `{widget, inclusive, ...}`
  - `:115+` — `Decoration.WidgetDecorationSpec` `{widget, side, block, inlineOrder}`
- `.planning/research/STACK.md` (417 LOC) — two-path mount (decisive); CM6 version pin discrepancy
- `.planning/research/FEATURES.md` (280 LOC) — `EditorView.atomicRanges` as load-bearing primitive
- `.planning/research/ARCHITECTURE.md` (340 LOC) — exact cutlist with LOC counts; `src/widget/` file layout proposal
- `.planning/research/PITFALLS.md` (1005 LOC) — P1, P3, P4, P14, P15, P17, P18, P22, P23 in detail
- `.planning/research/SUMMARY.md` — Q1–Q7 decisions, primitives 1–6
- `.planning/REQUIREMENTS.md` — full mapping of all 23 phase requirements with traceability
- `.planning/phases/19-widget-foundation-one-way-sync/19-CONTEXT.md` — locked decisions C-01..C-17 + D-01..D-10
- `src/main/childEditorFactory.ts` (482 LOC, read in this session) — repurpose target; verified `app.vault.getConfig('vimMode')` access at line 270-274
- `src/main/childEditorLanguage.ts` (148 LOC, read in this session) — verbatim carry-over; `languageCompartment` + `buildLanguageExtensions(slug, indent)`
- `src/main/codeActionsEditorExtension.ts` (395 LOC, read in this session) — `findCodeFence` lift target at lines 177-212
- `src/main.ts` (3,252 LOC, partial) — `useNestedEditor` flag pattern at line 830, `vault.process` callsites, `registerEvent` pattern
- `src/settings/SettingsStore.ts` (verified flag pattern lines 79, 260, 673-677, 839-845) — template for `useInlineWidget` field

### Secondary (MEDIUM confidence)
- `node_modules/@replit/codemirror-vim/dist/index.d.ts` — `vim(options?)` signature at line 1083; conditional injection at mount works (carry-over pattern)
- `package.json` runtime + dev deps inventory (no new deps required for Phase 19)
- npm registry — `fast-check@4.8.0` exists (skipped in favor of hand-rolled generators)
- Existing test infrastructure: `vitest.config.ts`, `tests/helpers/obsidian-stub.ts`, 196 existing test files

### Tertiary (LOW confidence)
- Pitfall 19-A timing assumption (A1) — needs Plan 19-02 empirical probe before relying
- Pitfall 19-D embed `getSectionInfo` returning null "almost always" — may be less frequent in practice
- A8 `Tasks` shape from `workspace.on('quit')` — not introspected in this session
- Pitfall 19-C history serialization round-trip — needs Plan 19-03 acceptance test

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against installed `node_modules/*/package.json`
- Architecture patterns: HIGH — every locked primitive verified against `obsidian.d.ts` or `@codemirror/view/dist/index.d.ts` line citations
- Common pitfalls: MEDIUM-HIGH — Pitfalls 19-A (timing), 19-B (`Tasks` shape), 19-C (history round-trip), 19-D (embed getSectionInfo) carry empirical risk; mitigations documented
- Code lift points: HIGH — all source files read; LOC counts and line citations match
- Property-test corpus: HIGH — corpus shape locked by D-09; SHELLS × HOSTILE_BODIES matrix covers all called-out edge cases

**Research date:** 2026-05-29
**Valid until:** 2026-06-12 (~14 days; Phase 19 should complete or revisit research)

## RESEARCH COMPLETE

**Phase:** 19 - Widget Foundation + One-Way Sync
**Confidence:** HIGH

### Key Findings
- Every locked primitive (atomicRanges, registerMarkdownCodeBlockProcessor, ViewPlugin+Decoration.replace, vault.process, debounce, MarkdownRenderChild, getSectionInfo) is verified against installed `obsidian@1.12.3` and `@codemirror/view@6.38.6` with line citations.
- Surface 6 NEW landmines on top of upstream PITFALLS.md (19-A through 19-G): vault.on('modify') ordering assumption needs an empirical probe in Plan 19-02; `beforeunload` is best-effort, prefer `workspace.on('quit')` (since 1.4.4); CM6 history serialization is non-trivial and needs an explicit acceptance test in Plan 19-03; embed null-section-info is regular not exceptional; multi-fence corner needs defensive Notice + recompute-fenceIndex-at-flush-time; `WidgetType.eq()` identity must be content-hash-based not instance-based; mutual-exclusion assert (D-06) timing must be at top of `Plugin.onload()`.
- Recommend hand-rolled property generators (vitest `it.each` + 30 LOC seeded gen) over `fast-check` for Phase 19 — corpus is small, dev-dep cost outweighs benefit. Reconsider in Phase 20.
- `fenceIndex` = ordinal-of-`leetcode-solve`-opener-up-to-`getSectionInfo().lineStart` is the correct strategy; Lezer alternative would create Reading-vs-Live-Preview path divergence for no measurable speedup at mount-only call sites.
- CLAUDE.md's `'leetcode.*'` userEvent and Phase 17 D-05 canonical write-path conventions are still load-bearing for the v1.2 path (default through Phase 21); Phase 19 plans MUST NOT delete or modify them.
- Hash arming order solvable via `vault.read` → compute future text via same `rewriteFenceBody` → arm with future hash → `vault.process` (Specific Findings §1).

### File Created
`/Users/moxu/projects/obsidian-leetcode/.planning/phases/19-widget-foundation-one-way-sync/19-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every package + version verified against installed `node_modules/*/package.json`; zero new deps required |
| Architecture | HIGH | Every locked primitive verified against `obsidian.d.ts` or CM6 `index.d.ts` with line citations |
| Pitfalls | MEDIUM-HIGH | 19-A (modify-event ordering), 19-B (Tasks shape), 19-C (history round-trip), 19-D (embed null) carry empirical risk — all documented with Plan-stage mitigations |
| Code Lift Points | HIGH | childEditorFactory.ts (482 LOC), childEditorLanguage.ts (148 LOC), codeActionsEditorExtension.ts (395 LOC) read in this session; lift list precise |
| Validation Architecture | HIGH | 12 Wave-0 test files mapped to all 23 phase requirements; existing v1.2 test infrastructure (vitest 4.1.5 + happy-dom 20.9 + 196 test files) accommodates all of them with zero new deps |

### Open Questions (for plan-stage resolution)
1. Plan 19-02 empirical probe of `vault.on('modify')` timing (A1)
2. Plan 19-01/19-03 dev-vault probe of `mousedown.stopPropagation()` effectiveness (A2/D-02)
3. Plan 19-03 acceptance test for CM6 history round-trip across remount (A3)
4. Plan 19-01 multi-fence behavior: hard-assert single OR defensive Notice + first-fence (Pitfall 19-E)
5. Plan 19-02 runtime introspection of `workspace.on('quit')` `Tasks` shape (A8)

### Ready for Planning
Research complete. Planner can now create the 4 PLAN.md files per CONTEXT D-10 (Plan 19-01 minimal mount, Plan 19-02 sync + suppression, Plan 19-03 state + P3 mitigation, Plan 19-04 embed + property-test hardening). Recommended Plan 19-02 first task: empirical probe of `vault.on('modify')` event-ordering assumption (A1) — the suppression map's correctness depends on it.
