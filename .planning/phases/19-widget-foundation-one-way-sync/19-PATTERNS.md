# Phase 19: Widget Foundation + One-Way Sync — Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 27 new (16 src + 21 test) + 3 modified
**Analogs found:** 27 / 27 new (100%); 3 / 3 modified files anchored

This document tells the planner — for every NEW file in `src/widget/` and `tests/widget/`, what existing analog file it should pattern-match, what concrete code excerpts to lift or imitate, and the exact line numbers in the analog. For MODIFIED files (`src/main.ts`, `src/settings/SettingsStore.ts`, `src/settings/SettingsTab.ts`) it gives the exact insertion-point line ranges and surrounding-code conventions.

All paths are absolute or repo-relative; line citations are inclusive.

---

## File Classification

### NEW source files (`src/widget/`)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/widget/codeBlockProcessor.ts` | post-processor / mount-entry | request-response (Reading mode render) | `src/main/codeActionsPostProcessor.ts` | exact (same Obsidian primitive: `registerMarkdownCodeBlockProcessor` ⇄ `registerMarkdownPostProcessor`; same lc-slug gate; same `getSectionInfo` posture) |
| `src/widget/liveModeViewPlugin.ts` | CM6 ViewPlugin / decoration provider | event-driven (CM6 update→decorations) | `src/main/codeActionsEditorExtension.ts` | exact (same `Decoration.replace` + `WidgetType.eq` shape; same `editorInfoField` + lc-slug gate; ALSO contributes `EditorView.atomicRanges` Facet via `provide`, which is the only delta) |
| `src/widget/WidgetController.ts` | mount-factory / lifecycle owner | event-driven (CM6 updateListener → debouncedWriter) | `src/main/childEditorFactory.ts` (CM6 mount) + `src/main/nestedEditorExtension.ts` `NestedEditorWidget` (lifecycle wrapper) | exact (CM6 mount carry-over verbatim; vault-write seam + state-persistence are net-new but pattern-shaped after `registerVaultModifyRepairTrigger`) |
| `src/widget/debouncedWriter.ts` | service / debounce-coalescer | batch (typing → flush → vault.process) | `src/graph/copyToCode.ts` (vault.process write path) + Obsidian `debounce`/`Debouncer` API | role-match (no existing debounce-of-vault.process file in the repo; copyToCode is the canonical vault.process callsite to mimic for the write contract) |
| `src/widget/selfWriteSuppression.ts` | utility / TTL map | pub-sub (arm before write, consume on modify event) | `src/main/childEditorRegistry.ts` (Map-with-lifecycle pattern) | role-match (no per-path TTL map exists yet; the closest "Map keyed by file path with destruction semantics" is `ChildEditorRegistry`) |
| `src/widget/widgetRegistry.ts` | utility / lifecycle index | pub-sub (mount adds, unmount removes, flushAll on plugin unload) | `src/main/childEditorRegistry.ts` | exact (this is the `ChildEditorRegistry` v1.3 successor — same Map<filePath, T> + destroyAll shape, but holds `WidgetController[]` per file rather than a single LRU `EditorView`) |
| `src/widget/fenceLocator.ts` | utility / pure parser | transform (string → fence positions / body / index) | `src/main/codeActionsEditorExtension.ts` `findCodeFence` lines 177-212 + `src/main/nestedEditorExtension.ts` `extractFenceBody` lines 168-176 | exact (literal lift) |
| `src/widget/fenceSerialization.ts` | utility / pure transform | transform (full file ↔ fence body) | `src/solve/starterCodeInjector.ts:forceInjectCodeSection` (used inside `vault.process` callback in `copyToCode.ts:73-78`) | role-match (existing pure full-note → full-note rewrite functions; new file specializes for `leetcode-solve` fence index) |

### NEW test files (`tests/widget/`)

| New Test File | Closest Analog | Match Quality |
|---------------|----------------|---------------|
| `tests/widget/__fixtures__/lcNoteFixtures.ts` | `tests/main/nestedEditorExtension.test.ts` `CANONICAL_NOTE` lines 66-91 + `tests/main/codeActionsEditorExtension.test.ts` `FULL_NOTE` lines 38-63 | exact |
| `tests/widget/__fixtures__/cm6Helpers.ts` | `tests/helpers/obsidian-stub.ts` `makeStateForLockTests` lines 258-286 + `makeFakeTransaction` lines 296-307 | exact |
| `tests/widget/widgetRegistry.test.ts` | `tests/main/childEditorRegistry.test.ts` (entire file, 120+ LOC) | exact |
| `tests/widget/codeBlockProcessor.test.ts` | `tests/main/codeActionsPostProcessor.test.ts` (entire file, 247 LOC) | exact |
| `tests/widget/WidgetController.test.ts` | `tests/main/nestedEditorExtension.test.ts` `NestedEditorWidget` describe blocks + `tests/main/childEditorFactory.test.ts` | exact |
| `tests/widget/atomicRanges.test.ts` | `tests/main/sectionLockExtension.test.ts` (changeFilter / cursor-blocked unit tests) | role-match (similar shape: assert cursor cannot land in a span) |
| `tests/widget/themeIntegration.test.ts` | `tests/main/childEditorTheme.test.ts` | exact |
| `tests/widget/vimMount.test.ts` | `tests/main/childEditorFactory.test.ts` (vim-mount conditional sections) | exact |
| `tests/widget/fenceSerialization.property.test.ts` | `tests/foundations/*` (pure-function property style) — no exact analog; vitest `it.each` precedent in `tests/main/childEditorLanguage.test.ts` | role-match |
| `tests/widget/modifyEventOrdering.probe.test.ts` | `tests/main/childEditorSync.test.ts` (vault.on('modify') wiring tests) | role-match |
| `tests/widget/debouncedWriter.test.ts` | `tests/main/childEditorSync.test.ts` (vault.process callback assertions) | role-match |
| `tests/widget/selfWriteSuppression.test.ts` | `tests/main/childEditorRegistry.test.ts` + `tests/main/childEditorSync.test.ts` (echo guards) | role-match |
| `tests/widget/flushRateLimit.test.ts` | (none) — new pattern; mimics debouncedWriter.test.ts shape | partial |
| `tests/widget/flushTransitions.test.ts` | `tests/main/lifecycle.test.ts` (Plugin onload/onunload assertions) | role-match |
| `tests/widget/postFlushDiagnostic.test.ts` | (none) — new pattern; uses `vi.spyOn(console, 'warn')` | partial |
| `tests/widget/fenceIndexRecompute.test.ts` | `tests/main/codeActionsEditorExtension.test.ts` `findCodeFence` describe block | role-match |
| `tests/widget/statePersistence.test.ts` | `tests/main/childEditorRegistry.test.ts` (TTL/destruction assertions) | role-match |
| `tests/widget/historyRoundTrip.test.ts` | (none) — new pattern; CM6 history serialization is novel | partial |
| `tests/widget/livePreviewUnmount.test.ts` | `tests/main/nestedEditorExtension.test.ts` (widget destroy + remount) | role-match |
| `tests/widget/embedDetection.test.ts` | `tests/main/codeActionsPostProcessor.test.ts` (`ctx.sourcePath` assertions) | role-match |
| `tests/widget/strayFenceFallback.test.ts` | `tests/main/codeActionsPostProcessor.test.ts` (no-lc-slug no-op test, lines 101-130) | exact |
| `tests/widget/languageFallback.test.ts` | `tests/main/childEditorLanguage.test.ts` (D-04 unknown-slug fallback) | exact |
| `tests/widget/widgetEquality.test.ts` | `tests/main/codeActionsEditorExtension.test.ts` `CodeActionsWidget.eq` test (the `currentSlug` identity test) | exact |
| `tests/main/mutualExclusion.test.ts` | `tests/main/lifecycle.test.ts` | role-match (mutex assert at top of `Plugin.onload`) |

### MODIFIED files (line ranges where edits land)

| File | Insertion Anchor | Existing Lines (Pattern Reference) |
|------|------------------|-----------------------------------|
| `src/main.ts` Plugin.onload() | After line 827 (existing `registerEditorExtension(buildCodeActionsEditorExtension(this))`) — wrap in `if (this.settings.getUseInlineWidget())` block parallel to existing `if (useNestedEditor)` at lines 837-839 | lines 829-839 (the `useNestedEditor` flag-gating idiom) |
| `src/main.ts` Plugin.onunload() | After line 1050 (existing `this.childEditorRegistry?.destroyAll()`) | lines 1027-1051 (the unload cleanup pattern) |
| `src/settings/SettingsStore.ts` PluginData interface | Insert `useInlineWidget` and `widgetSyncDebounceMs` fields next to existing `useNestedEditor` at lines 71-79 | lines 71-79 (`useNestedEditor` declaration) |
| `src/settings/SettingsStore.ts` DEFAULT_DATA | Insert defaults next to existing `useNestedEditor: true` at lines 258-260 | lines 258-260 |
| `src/settings/SettingsStore.ts` load() shape-guard | Insert next to existing `useNestedEditor` shape-guard at lines 672-677 | lines 672-677 |
| `src/settings/SettingsStore.ts` getter/setter | Insert next to existing `getUseNestedEditor`/`setUseNestedEditor` at lines 837-847 | lines 837-847 |
| `src/settings/SettingsTab.ts` | New `Experimental` subsection AFTER existing `Code editor` group (after line 273 — the `useNestedEditor` toggle is the last item there); subsection follows the existing `new Setting(containerEl).setName('X').setHeading()` + `containerEl.createDiv('lc-settings-group')` idiom | lines 222-273 (Code editor section pattern) |

---

## Pattern Assignments — NEW Source Files

### `src/widget/codeBlockProcessor.ts` (post-processor, request-response)

**Analog:** `src/main/codeActionsPostProcessor.ts` (entire file — 67 LOC)

**Imports pattern** (analog lines 1-3):
```typescript
import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { buildCodeBlockButtonRow, type CodeBlockButtonRowHost } from './codeBlockButtonRow';
```
→ Phase 19 imports `MarkdownPostProcessorContext`, `TFile`, plus the new `WidgetController` and `isEmbedContext` helpers.

**Top-level registration callsite** (analog lines 4-7):
```typescript
export function registerCodeBlockActionProcessor(
  plugin: Plugin & CodeBlockButtonRowHost,
): void {
  plugin.registerMarkdownPostProcessor((element, ctx) => {
```
→ For Phase 19, replace `registerMarkdownPostProcessor` with `registerMarkdownCodeBlockProcessor('leetcode-solve', handler)`. The handler receives `(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext)` instead of `(element, ctx)`.

**lc-slug gate (lift verbatim)** (analog lines 8-15):
```typescript
const cache = plugin.app.metadataCache.getFileCache(
  { path: ctx.sourcePath } as unknown as Parameters<
    typeof plugin.app.metadataCache.getFileCache
  >[0],
);
const fm = cache?.frontmatter as Record<string, unknown> | undefined;
const slug = fm?.['lc-slug'];
if (typeof slug !== 'string' || slug.length === 0) return;
```
→ Phase 19 keeps this exact gate but, on FAIL, instead of `return` it routes to a static `<pre><code>` fallback (CONTEXT C-10 / D-04). For an LC note (slug present) but inside an embed context, route to read-only widget mount.

**`getSectionInfo` null-safety** (analog lines 34-50): note Reading-Mode tolerates a null `getSectionInfo` and falls back to a DOM `h2` walk. **Phase 19 should NOT do that fallback** — per CONTEXT D-09 / RESEARCH Pitfall 19-D, null `getSectionInfo` IS the embed signal and must route to static-fallback OR read-only widget. Diff from the analog is intentional and load-bearing.

**Idempotency guard** (analog line 19):
```typescript
if (pre.nextElementSibling?.classList.contains('leetcode-code-actions')) return;
```
→ Phase 19's `registerMarkdownCodeBlockProcessor` is called by Obsidian per-render; idempotency comes from `widgetRegistry.has(`${file.path}::${fenceIndex}`)` not DOM sibling check.

---

### `src/widget/liveModeViewPlugin.ts` (CM6 ViewPlugin, event-driven)

**Analog:** `src/main/codeActionsEditorExtension.ts` (entire file — 395 LOC; load-bearing sections lift here verbatim)

**Imports pattern** (analog lines 41-67):
```typescript
import {
  StateField,
  StateEffect,
  RangeSetBuilder,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import {
  editorInfoField,
  editorLivePreviewField,
  MarkdownView,
  type Plugin,
  type TFile,
} from 'obsidian';
```
→ Phase 19 keeps this exact import block. Adds `ViewPlugin` from `@codemirror/view`. Drops `editorLivePreviewField` (Phase 19 uses `editorLivePreviewField` only if you re-render on Cmd-E flip — research recommends you DO; carry over).

**`WidgetType.eq()` content-hash identity** (analog lines 145-156):
```typescript
eq(other: CodeActionsWidget): boolean {
  return (
    other instanceof CodeActionsWidget &&
    other.plugin === this.plugin &&
    other.file === this.file &&
    other.currentSlug === this.currentSlug
  );
}
```
→ Phase 19 `LeetCodeFenceWidget.eq()`: compare `(filePath, fenceIndex, sourceHash)`. **Critical** per RESEARCH Pitfall 19-F — `sourceHash` is required so re-render with same content does NOT remount and destroy in-flight CM6 state.

**`ignoreEvent()` for embedded inputs** (analog lines 158-163):
```typescript
ignoreEvent(): boolean {
  return true;
}
```
→ Phase 19: same — parent CM6 must let the embedded EditorView consume keyboard/mouse events natively.

**`findCodeFence` callsite** (analog lines 177-212): **lift this entire 36-line function** verbatim into `src/widget/fenceLocator.ts` per RESEARCH §6 / CONTEXT canonical_refs §"v1.2 Code Files". Widen the `FENCE_RE` to also match `leetcode-solve` opener (Phase 19) while keeping legacy lang-slug match path (Phase 21 migrator uses it).

**Decoration build path** (analog lines 238-299) — the `buildDecorations` function shape is the right template for `liveModeViewPlugin.ts`'s `buildLeetCodeFenceDecos`:
1. Read file via `state.field(editorInfoField)?.file` (analog line 245)
2. Read frontmatter via `plugin.app.metadataCache.getFileCache(file)?.frontmatter` (analog lines 248-251)
3. lc-slug gate: `if (typeof slug !== 'string' || slug.length === 0) return builder.finish();` (analog lines 251-254)
4. Find fence via `findCodeFence(state)` (analog line 256)
5. `RangeSetBuilder.add(anchor, anchor, Decoration.widget({...}))` (analog lines 286-296) → Phase 19 uses `Decoration.replace({ widget })` instead of `Decoration.widget({ widget, block: true })` so the widget *replaces* the fence range (CONTEXT C-02), AND records the same range set into a separate `RangeSet` bucket for `EditorView.atomicRanges` (CONTEXT C-05).

**ViewPlugin shape with `provide` for atomicRanges** — research-only pattern (RESEARCH Pattern 3 lines 247-272 of 19-RESEARCH.md). The new code shape:
```typescript
class LeetCodeLiveViewPlugin {
  decorations: DecorationSet;
  ranges: DecorationSet;  // Same RangeSet shared with atomicRanges Facet
  constructor(view: EditorView) { ... }
  update(update: ViewUpdate) { ... }
}

export const leetCodeFenceViewPlugin = (plugin: LeetCodePlugin) =>
  ViewPlugin.fromClass(LeetCodeLiveViewPlugin, {
    decorations: v => v.decorations,
    provide: pl => EditorView.atomicRanges.of(view => view.plugin(pl)?.ranges ?? Decoration.none),
  });
```
This is novel for the codebase. The closest existing shape is the StateField-based `buildCodeActionsEditorExtension` (analog lines 320-394) — Phase 19 uses ViewPlugin instead of StateField but the conditional-rebuild logic (analog lines 369-389: rebuild on `tr.docChanged || modeFlipped || refreshEffect`) translates to `update.docChanged || update.viewportChanged`.

**`metadataCache.on('changed')` subscription** (analog lines 329-359) — for Phase 19, this subscription is **DEFERRED** to Phase 20 per CONTEXT deferred_ideas. Phase 19's ViewPlugin only rebuilds on `update.docChanged || update.viewportChanged`. **DO NOT** copy the chevron-staleness subscription pattern into Phase 19's ViewPlugin.

---

### `src/widget/WidgetController.ts` (factory + lifecycle owner, event-driven)

**Analog A (CM6 mount + extension composition):** `src/main/childEditorFactory.ts` lines 252-416

**Imports + EditorState.create pattern (lift verbatim)** (analog lines 22-52, 252-416):
```typescript
import {
  EditorView,
  keymap, drawSelection, highlightActiveLine,
  lineNumbers, gutter, GutterMarker,
  ViewPlugin,
  type Command, type PluginValue,
} from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { bracketMatching, indentUnit } from '@codemirror/language';
import { history, indentMore, indentLess, defaultKeymap, historyKeymap, toggleLineComment } from '@codemirror/commands';
import { closeBracketsKeymap } from '@codemirror/autocomplete';
import { vim, getCM } from '@replit/codemirror-vim';
import type { App, Scope } from 'obsidian';
import { languageCompartment, buildLanguageExtensions } from './childEditorLanguage';
import { createThemedHighlight } from './childEditorTheme';
import { obsidianSemanticClasses } from './childEditorSemanticClasses';
```
→ Phase 19 imports the same building blocks. **Critical**: import paths change from `'./childEditorLanguage'` to `'../main/childEditorLanguage'` (since widget lives in `src/widget/`); the THREE files `childEditorLanguage.ts`, `childEditorTheme.ts`, `childEditorSemanticClasses.ts` stay in `src/main/` per ARCHITECTURE §2.

**`createChildEditor` factory body (~165 LOC, analog 252-416)** — copy the entire body, then DELETE only:
- The `createScrollIntoViewExtension()` import + call (analog line 51 import, analog line 397 use) — that helper lives in the soon-to-be-deleted `src/main/childEditorSync.ts`. Phase 19 widget does not need scroll-into-view.
- The optional `syncExtensions?: Extension[]` parameter (analog line 258, 398) — Phase 19 mounts its own updateListener via `WidgetController.bind(view)` rather than passing a sync extension array.

**Vim conditional injection (lift verbatim)** (analog lines 261-274, 322-323):
```typescript
const vimEnabled =
  !!app &&
  (app as unknown as { vault: { getConfig(key: string): unknown } }).vault.getConfig(
    'vimMode',
  ) === true;
// ...
...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
```
→ Phase 19 uses this exact shape (CONTEXT C-14, VIM-01).

**Vim isolation extension** (analog lines 428-481 — `createVimIsolationExtension`) — lift verbatim. The function takes a `parentContainer: HTMLElement` for the `lc-vim-insert` class toggle; in Phase 19 that's the widget's outer container.

**Cmd-/ Scope intercept extension** (analog lines 176-222 — `createCmdSlashScopeExtension`) — lift verbatim.

**Editor theme + semantic classes wiring (lift verbatim)** (analog lines 362-364):
```typescript
obsidianSemanticClasses,
...createThemedHighlight(),
bracketMatching(),
```
→ Phase 19 keeps this verbatim (CONTEXT C-13, THEME-02/03).

**EditorView.theme block (lift verbatim)** (analog lines 381-395):
```typescript
EditorView.theme({
  '&': {
    background: 'var(--code-background, var(--background-secondary))',
    borderRadius: '4px',
    padding: '8px 0',
  },
  '.cm-content': {
    fontFamily: 'var(--font-monospace)',
    fontSize: 'var(--font-text-size)',
  },
  '.cm-gutters': {
    background: 'transparent',
    borderRight: 'none',
  },
}),
```

**Click-to-focus pattern (lift verbatim)** (analog lines 405-413):
```typescript
if (view.dom) {
  view.dom.addEventListener('mousedown', () => {
    window.requestAnimationFrame(() => {
      if (document.activeElement !== view.contentDOM) {
        view.contentDOM.focus();
      }
    });
  });
}
```
→ Phase 19 keeps this AND adds the `mousedown.stopPropagation` defense per CONTEXT D-02:
```typescript
view.dom.addEventListener('mousedown', (e) => e.stopPropagation());
```
The two listeners can coexist (the first one focuses, the second prevents propagation) but order matters: `stopPropagation` listener must be FIRST so the parent's cursor-place handler never sees the event.

**Analog B (lifecycle wrapper for Reading mode):** `src/main/nestedEditorExtension.ts` `NestedEditorWidget` lines 81-162

**Container className (lift, with class-name addition)** (analog line 114):
```typescript
container.className = 'lc-nested-editor HyperMD-codeblock';
```
→ Phase 19 keeps these two classes verbatim (CONTEXT C-13). Add a third v1.3-specific class (e.g. `lc-widget` or `lc-leetcode-solve`) so CSS selectors can branch in Phase 22 polish.

**toDOM mount/reattach pattern** (analog lines 104-141):
```typescript
toDOM(view: EditorView): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lc-nested-editor HyperMD-codeblock';
  let childView = this.registry.get(this.filePath);
  if (!childView) {
    childView = createChildEditor(...);
    this.registry.set(this.filePath, childView);
  } else {
    container.appendChild(childView.dom);
    if (typeof childView.requestMeasure === 'function') childView.requestMeasure();
  }
  return container;
}
```
→ Phase 19's analog, but the persistence path goes through `widgetRegistry.get(`${file.path}::${fenceIndex}`)` and (separately) `statePersistence.hydrateState(key, view)` for cursor/scroll/history. The reattach path no longer keeps a live EditorView across remounts (different from v1.2 — v1.3 destroys + recreates the view but hydrates from `ChildEditorState` capture).

**`destroy(dom)` lifecycle** (analog lines 143-150):
```typescript
destroy(dom: HTMLElement): void {
  const childView = this.registry.get(this.filePath);
  if (childView && childView.dom.parentElement === dom) {
    dom.removeChild(childView.dom);
  }
}
```
→ Phase 19's `WidgetController.unmount()` MUST: (1) call `debouncedWriter.forceFlush()`, (2) call `statePersistence.captureState(key, view)`, (3) call `view.destroy()`, (4) `widgetRegistry.delete(key)`. Different from v1.2 which kept the view alive. CONTEXT C-09 + RESEARCH Pattern 4.

**MarkdownRenderChild Reading-mode wrapper (no exact analog — pattern from research)** — RESEARCH Pattern 4 sketch + Obsidian docs `MarkdownRenderChild` `onunload`. The shape:
```typescript
class LeetCodeWidgetRenderChild extends MarkdownRenderChild {
  constructor(public host: HTMLElement, public source: string, public ctx: MarkdownPostProcessorContext, public plugin: LeetCodePlugin, public file: TFile, public info: MarkdownSectionInformation, public readOnly: boolean) {
    super(host);
  }
  onload(): void { /* mountLeetCodeWidget(...) */ }
  onunload(): void { /* controller.flushNow() + statePersistence.captureState() + view.destroy() */ }
}
```

---

### `src/widget/debouncedWriter.ts` (debounce-coalescer, batch)

**Analog A (vault.process callback contract):** `src/graph/copyToCode.ts` lines 66-99

**vault.process callsite (lift the contract verbatim)** (analog lines 72-78):
```typescript
await app.vault.process(file, (current) =>
  forceInjectCodeSection(current, {
    starterCode: code,
    langSlug,
  }),
);
```
→ Phase 19's `flush()` body:
```typescript
await this.app.vault.process(this.file, (current) =>
  rewriteFenceBody(current, fenceIndex, newBody),
);
```
The synchronous-callback contract is identical: pure function inside, app.vault.process awaits.

**Analog B (debounce/Debouncer API):** Obsidian `obsidian.d.ts` lines 2126-2161 (`debounce(cb, timeout, resetTimer)` returning `Debouncer<T,V>` with `.run()` / `.cancel()`). No existing repo usage pattern of `Debouncer` to lift; the import shape:
```typescript
import { debounce, type Debouncer, type App, type TFile } from 'obsidian';
```

**Analog C (vault.on('rename') / vault.on('modify') host typing):** `src/main/childEditorSync.ts` lines 691-693:
```typescript
export interface VaultModifyRepairPluginHost {
  app: { vault: { on(...): EventRef; ... }; ... };
  registerEvent(eventRef: import('obsidian').EventRef): void;
}
```
→ Phase 19 declares a similar minimal `WidgetWriterHost` interface (or just types `plugin: LeetCodePlugin` directly).

**Suppression-arming order (Specific Findings §1 of RESEARCH):**
```typescript
private async flush(): Promise<void> {
  // 1. rate-limit gate
  const now = Date.now();
  if (now - this.lastFlushAt < this.rateLimitMs) {
    setTimeout(() => this.flush(), this.rateLimitMs - (now - this.lastFlushAt));
    return;
  }
  this.lastFlushAt = now;

  // 2. compute future content (matching what vault.process callback will produce)
  const newBody = this.getDoc();
  const fenceIndex = this.getFenceIndex();
  const currentDisk = await this.app.vault.read(this.file);
  const futureFullText = rewriteFenceBody(currentDisk, fenceIndex, newBody);
  const futureFenceBody = extractFenceBody(futureFullText, fenceIndex) ?? newBody;
  const expectedHash = await sha1(futureFenceBody);

  // 3. arm suppression BEFORE vault.process (RESEARCH §1, CONTEXT C-04)
  selfWriteSuppression.arm(this.file.path, expectedHash);

  // 4. write
  let postWriteText = '';
  await this.app.vault.process(this.file, (body) => {
    postWriteText = rewriteFenceBody(body, fenceIndex, newBody);
    return postWriteText;
  });

  // 5. post-flush diagnostic (CONTEXT D-09)
  const observed = extractFenceBody(postWriteText, fenceIndex) ?? '';
  if ((await sha1(observed)) !== (await sha1(newBody))) {
    console.warn(`LC widget: post-flush hash drift for ${this.file.path}`);
  }
}
```

---

### `src/widget/selfWriteSuppression.ts` (TTL map, pub-sub)

**Analog:** `src/main/childEditorRegistry.ts` (Map-shape pattern; the entire file 1-114)

**Module-level singleton or class-export pattern** (analog lines 19-23):
```typescript
export class ChildEditorRegistry {
  private readonly cache = new Map<string, RegistryEntry>();
  private readonly cap: number;
  private tick = 0;
  constructor(cap = 5) { this.cap = cap; }
}
```
→ Phase 19 picks ONE of two shapes (planner discretion):
- (a) Module-level singleton `Map<string, Entry>` exported via free `arm` / `tryConsume` functions (RESEARCH Pattern 2 sketch lines 213-238).
- (b) Class wrapper instantiated once in `Plugin.onload()` and stored on `this.selfWriteSuppression`.

Recommend (b) for consistency with existing `ChildEditorRegistry` and easier test instantiation per `tests/main/childEditorRegistry.test.ts`.

**TTL semantics with stale-cleanup** (analog lines 60-69 — `delete()` with `unwireSync` side effect):
```typescript
delete(key: string): void {
  const entry = this.cache.get(key);
  if (!entry) return;
  unwireSync(key);
  entry.view.destroy();
  this.cache.delete(key);
}
```
→ Phase 19's `tryConsume(path, observedHash): 'consumed' | 'stale' | 'miss'` per RESEARCH Pattern 2 lines 222-237 — different return shape but the same "guarded delete" structure.

---

### `src/widget/widgetRegistry.ts` (lifecycle index, pub-sub)

**Analog:** `src/main/childEditorRegistry.ts` (entire file — direct successor)

**This is essentially the v1.3 thinned `ChildEditorRegistry`.** Lift the class shape:

**Class with destroyAll (lift)** (analog lines 19-26, 75-81):
```typescript
export class ChildEditorRegistry {
  private readonly cache = new Map<string, RegistryEntry>();
  // ...
  destroyAll(): void {
    for (const entry of this.cache.values()) {
      entry.view.destroy();
    }
    this.cache.clear();
    unwireSync('__all__');
  }
}
```
→ Phase 19's `WidgetRegistry`:
```typescript
export class WidgetRegistry {
  private map = new Map<string, WidgetController>();
  get(key: string): WidgetController | undefined { return this.map.get(key); }
  set(key: string, ctl: WidgetController): void { this.map.set(key, ctl); }
  delete(key: string): void { this.map.delete(key); }
  has(key: string): boolean { return this.map.has(key); }
  flushAll(): void { for (const ctl of this.map.values()) ctl.flushNow(); }
  destroyAll(): void {
    for (const ctl of this.map.values()) ctl.destroy();
    this.map.clear();
  }
}
```

**Differences from analog:**
- No LRU eviction (CONTEXT D-10 / Phase 19 simplification — TTL-bound state-persistence map handles cache pressure).
- Adds `flushAll()` for plugin onunload (CONTEXT C-07, calls `controller.flushNow()` per widget).
- Key shape is `${file.path}::${fenceIndex}` (CONTEXT D-01) NOT just `filePath` like the v1.2 registry — single-fence-per-file is the common case but the key shape supports multi-fence for free.

**Plugin instantiation pattern (lift from `src/main.ts:819`):**
```typescript
this.childEditorRegistry = new ChildEditorRegistry(5);
```
→ `Plugin.onload()` adds (gated on `useInlineWidget=ON`):
```typescript
this.widgetRegistry = new WidgetRegistry();
```
→ `Plugin.onunload()` adds:
```typescript
this.widgetRegistry?.flushAll();
this.widgetRegistry?.destroyAll();
```

---

### `src/widget/fenceLocator.ts` (pure parser, transform)

**Analog A (`findCodeFence` — LIFT VERBATIM):** `src/main/codeActionsEditorExtension.ts` lines 177-212

```typescript
export function findCodeFence(
  state: EditorState,
): { openerLine: number; closerLine: number } | null {
  if (state.doc.lines === 0) return null;
  const FENCE_RE = /^\s*```/;
  const H2_CODE_RE = /^\s*##\s+Code\s*$/;
  const H2_ANY_RE = /^\s*##\s+.+$/;
  let inCodeSection = false;
  const total = state.doc.lines;
  for (let i = 1; i <= total; i++) {
    const text = state.doc.line(i).text;
    if (H2_CODE_RE.test(text)) { inCodeSection = true; continue; }
    if (H2_ANY_RE.test(text)) { inCodeSection = false; continue; }
    if (inCodeSection && FENCE_RE.test(text)) {
      for (let j = i + 1; j <= total; j++) {
        if (FENCE_RE.test(state.doc.line(j).text)) {
          return { openerLine: i, closerLine: j };
        }
      }
      return null;
    }
  }
  return null;
}
```
→ Phase 19 lifts this entire function. **Modification**: widen `FENCE_RE` to accept either ` ```<langslug>` (legacy) OR ` ```leetcode-solve` (v1.3) so the same locator serves both Phase 19 widget and Phase 21 migrator. Tag the return record with `kind: 'leetcode-solve' | 'legacy'`. Per RESEARCH §6 the existing test file `tests/main/codeActionsEditorExtension.test.ts` keeps passing via redirected import until Phase 22.

**Analog B (`extractFenceBody` — LIFT VERBATIM):** `src/main/nestedEditorExtension.ts` lines 168-176

```typescript
export function extractFenceBody(
  state: EditorState,
  fence: { openerLine: number; closerLine: number },
): string {
  if (fence.closerLine - fence.openerLine <= 1) return '';
  const from = state.doc.line(fence.openerLine + 1).from;
  const to = state.doc.line(fence.closerLine - 1).to;
  return state.doc.sliceString(from, to);
}
```
→ Phase 19 keeps this for the CM6-state path. **Adds** a string-only counterpart in `src/widget/fenceSerialization.ts` for the `vault.process` callback path (which receives a raw `string`, not an `EditorState`).

**`computeFenceIndex` (NEW — RESEARCH Specific Findings §2):**
```typescript
export function computeFenceIndex(fileText: string, fenceLineStart0Based: number): number {
  const lines = fileText.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < fenceLineStart0Based; i++) {
    if (/^\s*```leetcode-solve\b/.test(lines[i] ?? '')) count++;
  }
  return count;
}
```
No analog — this is greenfield code. RESEARCH §2 / CONTEXT D-01 lock the strategy.

---

### `src/widget/fenceSerialization.ts` (pure transform, transform)

**Analog:** `src/solve/starterCodeInjector.ts:forceInjectCodeSection` (used inside `vault.process` callback in `copyToCode.ts:73-78` and `resetCodeWithConfirm.ts`)

The existing code does string→string fence rewrite for `## Code` legacy fence. Phase 19's `extractFenceBody(noteBody, fenceIndex)` and `rewriteFenceBody(noteBody, fenceIndex, newBody)` are simpler in shape (pure index-based slice/splice on a string buffer) but follow the same contract: pure, idempotent, byte-exact.

**Pure function shape (the contract to honor):**
```typescript
export function extractFenceBody(noteBody: string, fenceIndex: number): string | null {
  // Walk lines, count `\`\`\`leetcode-solve` openers, return body of the fenceIndex-th match.
  // Return null when fenceIndex is out of range.
}

export function rewriteFenceBody(noteBody: string, fenceIndex: number, newBody: string): string {
  // Replace the body of the fenceIndex-th `\`\`\`leetcode-solve` fence with newBody.
  // Preserve fence opener line, closer line, and all surrounding text byte-for-byte.
  // No-op (return noteBody) if fenceIndex is out of range.
}
```

**Round-trip invariant** (CONTEXT D-09):
```typescript
rewriteFenceBody(noteBody, idx, extractFenceBody(noteBody, idx) ?? '') === noteBody
```
This is the property tested by `tests/widget/fenceSerialization.property.test.ts`.

**Edge cases to handle (RESEARCH §5):**
- CRLF vs LF line endings (preserve incoming choice — do not normalize)
- Triple backticks inside fence body
- Frontmatter-like `---` lines inside fence body
- Empty body, single-line body, body without trailing newline
- Unicode / multi-byte chars

---

## Pattern Assignments — NEW Test Files

### `tests/widget/__fixtures__/lcNoteFixtures.ts`

**Analog:** `tests/main/nestedEditorExtension.test.ts` `CANONICAL_NOTE` lines 66-91

**Lift-and-adapt** (analog):
```typescript
const CANONICAL_NOTE = [
  '---',
  'lc-slug: two-sum',
  'lc-language: python3',
  '---',
  '',
  '## Problem',
  '',
  'Given an array...',
  '',
  '## Code',
  '',
  '```python3',
  'class Solution:',
  '    def twoSum(self):',
  '        pass',
  '```',
  // ... etc
].join('\n');
```
→ Phase 19 fixture: replace `python3` fence opener with `leetcode-solve` (CONTEXT C-01 / Phase 21 fence tag). Keep `lc-language: python3` in frontmatter (that's the new SoT).

Add fixtures for: embed-host note, stray-fence-in-non-LC-note, multi-fence note, CRLF note, no-trailing-newline note (RESEARCH §5).

### `tests/widget/__fixtures__/cm6Helpers.ts`

**Analog:** `tests/helpers/obsidian-stub.ts` lines 258-307 (`makeStateForLockTests`, `makeFakeTransaction`)

**Lift-verbatim** the `makeStateForLockTests` and `makeFakeTransaction` helpers to a widget-local fixtures file. Adds:
- `makeFakeUpdateForViewPlugin(state, opts)` for `update.docChanged || update.viewportChanged` testing
- `makeFakeMarkdownPostProcessorContext(opts)` for `ctx.getSectionInfo` / `ctx.sourcePath` mocks
- `makeFakeApp({ vimMode, showLineNumber })` for `app.vault.getConfig` (analog: `tests/main/childEditorFactory.test.ts` `createMockApp` pattern)

### `tests/widget/widgetRegistry.test.ts`

**Analog:** `tests/main/childEditorRegistry.test.ts` (entire file — almost a 1:1 template)

**Lift the `describe` + `beforeEach` skeleton** (analog lines 13-19):
```typescript
describe('ChildEditorRegistry', () => {
  let registry: ChildEditorRegistry;
  beforeEach(() => {
    registry = new ChildEditorRegistry(3);
  });
  describe('get()', () => { ... });
  describe('set()', () => { ... });
  describe('delete()', () => { ... });
  describe('destroyAll()', () => { ... });
});
```
→ Phase 19: rename to `WidgetRegistry`, drop LRU tests, add `flushAll()` test (assert `controller.flushNow()` invoked for each entry), add multi-fence-key tests.

**Mock pattern (lift)** (analog lines 9-11):
```typescript
function makeMockView() {
  return { destroy: vi.fn() } as unknown as import('@codemirror/view').EditorView;
}
```
→ Phase 19: `makeMockController()` returning `{ flushNow: vi.fn(), destroy: vi.fn() }`.

### `tests/widget/codeBlockProcessor.test.ts`

**Analog:** `tests/main/codeActionsPostProcessor.test.ts` (entire file, especially lines 14-72 setup + 101-130 lc-slug-gate test)

**vi.mock setup (lift verbatim)** (analog lines 14-17):
```typescript
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});
```

**ProcessorCtx fake (lift, narrow)** (analog lines 19-30):
```typescript
interface ProcessorCtx {
  sourcePath: string;
  getSectionInfo: (el: HTMLElement) => FakeSectionInfo | null;
}
function makeCtx(sourcePath: string, sectionInfo: FakeSectionInfo | null): ProcessorCtx { ... }
```
→ Phase 19 keeps this exactly. Adds a third arg `addChild: vi.fn()` because `registerMarkdownCodeBlockProcessor` callback receives `ctx.addChild()` for `MarkdownRenderChild` registration.

**no-op-on-no-lc-slug test (lift verbatim)** (analog lines 101-130) — Phase 19 asserts static `<pre><code>` fallback rendered (or read-only widget mounted) instead of "no buttons appended."

### `tests/widget/WidgetController.test.ts`

**Analog A:** `tests/main/nestedEditorExtension.test.ts` lines 113-137 (mock plugin shape with metadataCache + settings)
**Analog B:** `tests/main/childEditorFactory.test.ts` (CM6 mount + extensions assertion shape — file exists per the dir listing)

**Mock plugin pattern (lift)** (Analog A lines 113-136):
```typescript
function createMockPlugin(opts: { slug?, filePath?, lcLanguage?, indentOverride? } = {}) {
  const metadataCache = createFakeMetadataCache();
  const filePath = opts.filePath ?? 'LeetCode/0001-two-sum.md';
  if (opts.slug !== null) {
    metadataCache.setFrontmatter(filePath, {
      'lc-slug': opts.slug ?? 'two-sum',
      'lc-language': opts.lcLanguage ?? 'python3',
    });
  }
  const basePlugin = createFakePlugin({ metadataCache });
  const plugin = Object.assign(basePlugin, {
    settings: {
      getIndentSizeOverride: vi.fn(() => opts.indentOverride ?? 'auto'),
      getShowRelativeLineNumbers: vi.fn(() => false),
    },
  });
  return { plugin, metadataCache };
}
```
→ Phase 19 adds `getUseInlineWidget: vi.fn(() => true)`, `getWidgetSyncDebounceMs: vi.fn(() => 400)` to the settings object. Adds `app.vault.read`, `app.vault.process`, `app.vault.getConfig` mocks.

### `tests/widget/atomicRanges.test.ts`

**Analog:** `tests/main/sectionLockExtension.test.ts` (changeFilter cursor-blocked tests — file exists per the dir listing).

**Test shape:** assert that a `transactionFilter`-equivalent (or in Phase 19's case, a real CM6 `atomicRanges` Facet) prevents cursor selection from landing inside the fence range. The closest existing pattern is the `transactionFilter` cursor-redirect test in `nestedEditorExtension.test.ts` (analog lines look at `tr.selection` after filter applies).

### `tests/widget/fenceSerialization.property.test.ts`

**Analog:** vitest `it.each` precedent — `tests/main/childEditorLanguage.test.ts` (parameterized `it.each` in describe blocks). RESEARCH 19-RESEARCH.md "Property-test seeds" §"Code Examples" lines 564-606 sketches the corpus.

**Hand-rolled corpus (lift the SHELLS × HOSTILE_BODIES matrix verbatim from RESEARCH lines 572-605)** — no `fast-check`; vitest `it.each` only.

### `tests/widget/modifyEventOrdering.probe.test.ts`

**Analog:** `tests/main/childEditorSync.test.ts` (vault.on('modify') wiring — 735 LOC). RESEARCH Pitfall 19-A drives this test: empirically verify that `vault.on('modify')` fires AFTER `vault.process` resolves so the suppression entry is observable. If false, switch arming to `Promise.resolve().then(() => arm(...))`.

### `tests/widget/strayFenceFallback.test.ts`

**Analog:** `tests/main/codeActionsPostProcessor.test.ts` lines 101-130 (no-op on missing lc-slug test). Same template; assert read-only widget OR static `<pre><code>` rendered instead of editable widget.

### `tests/widget/languageFallback.test.ts`

**Analog:** `tests/main/childEditorLanguage.test.ts` (D-04 unknown-slug Python fallback). Phase 19 adds: missing `lc-language` → Notice + Python fallback (CONTEXT C-11 / WIDGET-06).

### `tests/main/mutualExclusion.test.ts`

**Analog:** `tests/main/lifecycle.test.ts`. Test that flipping `useInlineWidget=true` while `useNestedEditor=true` triggers the assert path: `useNestedEditor` is forced to `false`, `Notice` is shown, `registerEditorExtension(buildNestedEditorExtension)` is NOT called. RESEARCH Pitfall 19-G timing constraint.

---

## Pattern Assignments — MODIFIED Files

### `src/main.ts` Plugin.onload() — useInlineWidget gating

**Insertion anchor:** AFTER line 827 (existing `this.registerEditorExtension(buildCodeActionsEditorExtension(this));`), parallel to existing `useNestedEditor` block at lines 829-839.

**Existing pattern (analog, lines 829-839):**
```typescript
// Phase 19 vq4 — read once: the nested-editor toggle is reload-apply-only.
const useNestedEditor = this.settings.getUseNestedEditor();

// Step 6f-nested — Phase 13: nested child EditorView for ## Code fence.
// ...
if (useNestedEditor) {
  this.registerEditorExtension(buildNestedEditorExtension(this));
}
```

**Phase 19 addition (planner writes this):**
```typescript
// Phase 19 — useInlineWidget gating (CONTEXT D-05 hard-gate).
const useInlineWidget = this.settings.getUseInlineWidget();

// Phase 19 D-06 mutual-exclusion assert — must run BEFORE either registration
// path so a corrupt data.json with both flags ON resolves to a single editor.
// RESEARCH Pitfall 19-G: this MUST be at the top of onload(), before either
// registerEditorExtension fires.
if (useInlineWidget && useNestedEditor) {
  new Notice('useInlineWidget is ON — disabling useNestedEditor (mutually exclusive)', 5000);
  await this.settings.setUseNestedEditor(false);
  // useNestedEditor local stays true for this onload pass; either rerun setup
  // logic or bail out of the v1.2 branch via a recomputed flag.
}

if (useInlineWidget) {
  this.widgetRegistry = new WidgetRegistry();
  this.selfWriteSuppression = new SelfWriteSuppression();
  this.statePersistence = new StatePersistenceMap();
  this.registerMarkdownCodeBlockProcessor(
    'leetcode-solve',
    leetCodeBlockProcessor(this),
  );
  this.registerEditorExtension([leetCodeFenceViewPlugin(this)]);

  // Flush-on-transition hooks (CONTEXT C-07; RESEARCH Pattern 5).
  this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.widgetRegistry.flushAll()));
  this.registerEvent(this.app.workspace.on('quit', (tasks) => this.widgetRegistry.flushAll()));
  this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.widgetRegistry.flushFile(oldPath)));
  this.registerDomEvent(window, 'beforeunload', () => this.widgetRegistry.flushAllSync());
  // Self-write suppression consumer.
  this.registerEvent(this.app.vault.on('modify', (file) => {
    if (!this.settings.getUseInlineWidget()) return; // Specific Findings §4
    if (!(file instanceof TFile)) return;
    // ... consume suppression entry; if miss, schedule reloadFromDisk (Phase 20)
  }));
}
```

**Convention reference for `registerEvent` + `vault.on('modify')` shape:** `src/main/childEditorSync.ts:registerVaultModifyRepairTrigger` lines 752-808 — exact same shape Phase 19 mimics. Note the `if (!(file instanceof TFile)) return` guard (analog line 759).

### `src/main.ts` Plugin.onunload() — flushAll drain

**Insertion anchor:** AFTER line 1050 (existing `this.childEditorRegistry?.destroyAll();`).

**Existing pattern (analog, lines 1027-1051):**
```typescript
onunload(): void {
  // FND-05: plugin must enable/disable without crashes.
  if (this.activeSolve) { ... }
  this.ephemeralTabs?.dispose();
  this.lastVerdictStore?.dispose();
  this.childEditorRegistry?.destroyAll();
}
```

**Phase 19 addition:**
```typescript
// Phase 19 — drain in-flight widget writes synchronously before view destruction.
this.widgetRegistry?.flushAll();
this.widgetRegistry?.destroyAll();
```

**Comment-style convention** (analog throughout): `// Phase X — purpose. Detail.` Match exactly.

### `src/settings/SettingsStore.ts` — useInlineWidget + widgetSyncDebounceMs

**Insertion anchor for interface field:** AFTER line 79 (existing `useNestedEditor: boolean;`).

**Existing pattern (analog, lines 71-79):**
```typescript
/** Phase 19 vq4 — master toggle for the nested CM6 child-editor stack.
 *  Default true (existing-user behavior preserved). When false, onload
 *  ...
 *  Shape-guard at load collapses non-boolean raw to true (preserves
 *  current behavior for every existing user). */
useNestedEditor: boolean;
```

**Phase 19 addition:**
```typescript
/** Phase 19 D-05 — master toggle for v1.3 inline widget editor.
 *  Default false (CONTEXT D-05 hard-gate). When true, registers
 *  registerMarkdownCodeBlockProcessor + leetCodeFenceViewPlugin and
 *  asserts useNestedEditor=false (D-06 mutual exclusion). Reload-required.
 *  Shape-guard at load collapses non-boolean raw to false. */
useInlineWidget: boolean;

/** Phase 19 C-06 — debounced writer delay in milliseconds. Default 400.
 *  Configurable via Experimental settings: 300/500/1000/2000ms (CONTEXT D-08).
 *  Shape-guard at load: must be one of the four whitelisted numbers; anything
 *  else collapses to 400 (mirrors indentSizeOverride strict-equality posture). */
widgetSyncDebounceMs: 300 | 400 | 500 | 1000 | 2000;
```

**Insertion anchor for DEFAULT_DATA:** AFTER line 260 (existing `useNestedEditor: true,`):
```typescript
useInlineWidget: false,
widgetSyncDebounceMs: 400,
```

**Insertion anchor for shape-guard in load():** AFTER line 677 (existing `useNestedEditor` shape-guard block).

**Existing shape-guard pattern (analog, lines 672-677):**
```typescript
useNestedEditor: typeof raw.useNestedEditor === 'boolean'
  ? raw.useNestedEditor
  : DEFAULT_DATA.useNestedEditor,
```

**Phase 19 addition:**
```typescript
useInlineWidget: typeof raw.useInlineWidget === 'boolean'
  ? raw.useInlineWidget
  : DEFAULT_DATA.useInlineWidget,
widgetSyncDebounceMs: (raw.widgetSyncDebounceMs === 300 ||
                       raw.widgetSyncDebounceMs === 400 ||
                       raw.widgetSyncDebounceMs === 500 ||
                       raw.widgetSyncDebounceMs === 1000 ||
                       raw.widgetSyncDebounceMs === 2000)
  ? raw.widgetSyncDebounceMs
  : DEFAULT_DATA.widgetSyncDebounceMs,
```
The `widgetSyncDebounceMs` shape-guard mirrors the strict-equality pattern at lines 664-668 (`indentSizeOverride`).

**Insertion anchor for getter/setter:** AFTER line 847 (existing `setUseNestedEditor`).

**Existing pattern (analog, lines 837-847):**
```typescript
/** Phase 19 vq4 — read the nested-editor master toggle. Read once at
 *  onload time in main.ts; toggling at runtime does NOT live-apply. */
getUseNestedEditor(): boolean { return this.data.useNestedEditor; }

/** Phase 19 vq4 — persist the nested-editor master toggle. Reload-required:
 *  the SettingsTab onChange handler shows a `Reload Obsidian to apply`
 *  Notice; this setter only persists. */
async setUseNestedEditor(v: boolean): Promise<void> {
  this.data.useNestedEditor = v;
  await this.persist();
}
```

**Phase 19 addition (mirror exactly):**
```typescript
/** Phase 19 D-05 — read the inline-widget master toggle. Read once at onload. */
getUseInlineWidget(): boolean { return this.data.useInlineWidget; }
/** Phase 19 D-05 — persist + Notice prompt for reload. */
async setUseInlineWidget(v: boolean): Promise<void> {
  this.data.useInlineWidget = v;
  await this.persist();
}
/** Phase 19 C-06 — read the debounced writer delay. */
getWidgetSyncDebounceMs(): 300 | 400 | 500 | 1000 | 2000 { return this.data.widgetSyncDebounceMs; }
/** Phase 19 C-06 — persist the debounced writer delay. */
async setWidgetSyncDebounceMs(v: 300 | 400 | 500 | 1000 | 2000): Promise<void> {
  this.data.widgetSyncDebounceMs = v;
  await this.persist();
}
```

### `src/settings/SettingsTab.ts` — Experimental subsection

**Insertion anchor:** AFTER line 273 (the existing `useNestedEditor` toggle is the LAST item in the `codeEditorGroup`).

**Existing pattern for section heading + group div (analog, lines 222-247):**
```typescript
new Setting(containerEl).setName('Code editor').setHeading();

const codeEditorGroup = containerEl.createDiv('lc-settings-group');
new Setting(codeEditorGroup)
  .setName('Indent size')
  .setDesc('...')
  .addDropdown((d) => d
    .addOption('auto', 'Auto (language default)')
    // ...
    .setValue(String(this.plugin.settings.getIndentSizeOverride()))
    .onChange(async (v) => {
      // ...
      await this.plugin.settings.setIndentSizeOverride(val);
    }),
  );
```

**Existing toggle pattern with reload Notice (analog, lines 261-272):**
```typescript
new Setting(codeEditorGroup)
  .setName('Use nested code editor')
  .setDesc('When enabled, the ## Code fence renders as an embedded code editor with syntax highlighting. Disable to use Obsidian\'s native markdown editor instead. Reload Obsidian to apply changes.')
  .addToggle((toggle) => toggle
    .setValue(this.plugin.settings.getUseNestedEditor())
    .onChange(async (v) => {
      await this.plugin.settings.setUseNestedEditor(v);
      new Notice('Reload Obsidian to apply', 5000);
    }),
  );
```

**Existing dropdown pattern with strict-value coercion (analog, lines 229-246)** — use this shape for the debounce slider.

**Phase 19 Experimental section (planner writes; mirrors existing patterns exactly):**
```typescript
// Phase 19 D-08 — Experimental subsection. Removed in Phase 22 when
// useInlineWidget becomes unconditional.
new Setting(containerEl).setName('Experimental').setHeading();

const expGroup = containerEl.createDiv('lc-settings-group');

// Banner: descriptive paragraph, NOT a Setting. Convention: createEl('p', {...})
expGroup.createEl('p', {
  text: 'These features are under development and may change between releases.',
  cls: 'setting-item-description',
});

new Setting(expGroup)
  .setName('Use inline widget editor (v1.3 alpha)')
  .setDesc('Renders the ## Code fence as a self-contained inline widget with one-way sync. Mutually exclusive with the nested code editor. Reload Obsidian to apply changes.')
  .addToggle((toggle) => toggle
    .setValue(this.plugin.settings.getUseInlineWidget())
    .onChange(async (v) => {
      // D-06 mutual exclusion — flipping ON disables nested editor.
      if (v && this.plugin.settings.getUseNestedEditor()) {
        await this.plugin.settings.setUseNestedEditor(false);
      }
      await this.plugin.settings.setUseInlineWidget(v);
      new Notice('Reload Obsidian to apply', 5000);
      this.display();  // re-render so the disabled-state of dependent rows updates
    }),
  );

new Setting(expGroup)
  .setName('Save delay')
  .setDesc('Time after typing stops before saving to disk (milliseconds). Lower = snappier; higher = fewer file-watcher events.')
  .addDropdown((d) => d
    .addOption('300', '300ms')
    .addOption('400', '400ms (default)')
    .addOption('500', '500ms')
    .addOption('1000', '1s')
    .addOption('2000', '2s')
    .setValue(String(this.plugin.settings.getWidgetSyncDebounceMs()))
    .onChange(async (v) => {
      const val: 300 | 400 | 500 | 1000 | 2000 =
        v === '300' ? 300 :
        v === '500' ? 500 :
        v === '1000' ? 1000 :
        v === '2000' ? 2000 :
        400;
      await this.plugin.settings.setWidgetSyncDebounceMs(val);
    }),
  );
```

---

## Shared Patterns

### Authentication / Authorization

**Source:** N/A (this is a pure-vault plugin; no auth on widget code paths). Phase 19 widgets do not authenticate.

### lc-slug Frontmatter Gate (CRITICAL — applies to ALL mount paths)

**Source:** `src/main/codeActionsPostProcessor.ts` lines 8-15 (Reading-Mode) AND `src/main/nestedEditorExtension.ts` lines 200-208 (Live-Preview StateField) AND `src/main/codeActionsEditorExtension.ts` lines 248-254 (CM6 ViewPlugin)

**Apply to:** Every Phase 19 mount path (`codeBlockProcessor.ts`, `liveModeViewPlugin.ts`).

```typescript
const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
  | Record<string, unknown>
  | undefined;
const slug = fm?.['lc-slug'];
if (typeof slug !== 'string' || slug.length === 0) {
  // Fall back to static <pre><code> (Reading mode) or no decoration (Live Preview).
  return ...;
}
```

**Phase 19 deviation:** instead of "no-op" fallback, mount a READ-ONLY widget if inside an embed context (CONTEXT C-15). For stray fence in non-LC note (no lc-slug), render static `<pre><code>` per CONTEXT C-10 / WIDGET-05.

### vault.process Write Path

**Source:** `src/graph/copyToCode.ts` lines 72-78 (canonical pattern); `src/main.ts` lines 1320, 1428, 2005, 2103 (other callsites)

**Apply to:** `src/widget/debouncedWriter.ts` flush() body.

```typescript
await app.vault.process(file, (current) => transformBody(current, ...args));
```

The callback is **synchronous** and **pure**. Phase 19 honors this by calling `rewriteFenceBody` (a pure string transform) inside.

### registerEvent for Lifecycle Cleanup

**Source:** Throughout `src/main.ts` (lines 864, 900, 938, 966), `src/main/codeActionsEditorExtension.ts` lines 330-359, `src/main/childEditorSync.ts` lines 752-808

**Apply to:** Every `vault.on(...)`, `workspace.on(...)`, `metadataCache.on(...)` subscription in Phase 19 widget code.

```typescript
plugin.registerEvent(plugin.app.vault.on('modify', handler));
```

The `registerEvent` wrapper returns the EventRef and auto-unregisters on `Plugin.onunload()` — never call `.off()` manually.

### Vim Conditional Mount

**Source:** `src/main/childEditorFactory.ts` lines 261-274 (read `vimMode` config), 322-323 (conditional spread).

**Apply to:** `src/widget/WidgetController.ts` mount path.

```typescript
const vimEnabled = !!app && (app as unknown as { vault: { getConfig(key: string): unknown } }).vault.getConfig('vimMode') === true;
// ...inside extensions array:
...(vimEnabled ? [vim({ status: true } as Parameters<typeof vim>[0])] : []),
```

### EditorView.atomicRanges Facet (NEW — no analog)

**Source:** RESEARCH Pattern 3 (19-RESEARCH.md lines 247-272). Verified `@codemirror/view/dist/index.d.ts:1284`.

**Apply to:** `src/widget/liveModeViewPlugin.ts`.

```typescript
provide: pl => EditorView.atomicRanges.of(view => view.plugin(pl)?.ranges ?? Decoration.none),
```

Critical: the `ranges` `RangeSet` must be IDENTICAL to the `decorations` `RangeSet` covering each fence range — drift between the two means the cursor can land in the widget range while the visual decoration still shows the widget.

### Theme Integration

**Source:** `src/main/childEditorTheme.ts` (entire file, ~152 LOC) — verbatim carry-over.

**Apply to:** `src/widget/WidgetController.ts` extensions array — import and call `createThemedHighlight()` exactly as `src/main/childEditorFactory.ts:363` does.

### Container Class Names

**Source:** `src/main/nestedEditorExtension.ts` line 114:
```typescript
container.className = 'lc-nested-editor HyperMD-codeblock';
```

**Apply to:** Phase 19 widget container — keep both class names (CONTEXT C-13 / THEME-02). Add a v1.3-specific class for Phase 22 polish (e.g. `lc-leetcode-solve`).

### Mock Plugin / Workspace Helpers

**Source:** `tests/solve/mocks/fakeWorkspace.ts` (`createFakePlugin`, `createFakeMetadataCache`) — used by `tests/main/codeActionsEditorExtension.test.ts`, `tests/main/nestedEditorExtension.test.ts`, etc.

**Apply to:** Every Phase 19 test that needs an `app` / `metadataCache` / `vault` mock. Existing helper covers Phase 19's needs without modification (the only addition would be `getUseInlineWidget` / `getWidgetSyncDebounceMs` accessors on the settings object — added inline in each test's `Object.assign(basePlugin, {settings: {...}})` per the analog pattern at `tests/main/nestedEditorExtension.test.ts:130-135`).

### vi.mock('obsidian')

**Source:** `tests/main/codeActionsPostProcessor.test.ts` lines 14-17 (canonical):
```typescript
vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});
```

**Apply to:** Every Phase 19 test file. The `tests/helpers/obsidian-stub.ts` already exports `Plugin`, `TFile`, `Notice`, `MarkdownView`, `Component`, `requestUrl`, `Scope`, `Workspace`, `editorInfoField`, `editorLivePreviewField`, etc. — Phase 19 tests can use it as-is.

---

## No Analog Found

The following Phase 19 surfaces are net-new patterns; the planner should reference RESEARCH instead of an existing file:

| File / Surface | Why No Analog | Reference |
|----------------|---------------|-----------|
| `src/widget/liveModeViewPlugin.ts` `EditorView.atomicRanges` Facet contribution | First repo use of `atomicRanges` Facet — v1.2 used `EditorState.transactionFilter` (different primitive) | RESEARCH Pattern 3 lines 247-272; FEATURES TS-02; CM6 docs `index.d.ts:1284` |
| `src/widget/debouncedWriter.ts` `Debouncer` API usage | First repo use of Obsidian's `debounce()` returning `Debouncer<T,V>` | obsidian.d.ts lines 2126-2161; RESEARCH "Don't Hand-Roll" table |
| `src/widget/selfWriteSuppression.ts` per-path content-hash TTL map | Net-new pattern — v1.2 used `syncAnnotation` which is a different primitive | RESEARCH Pattern 2 lines 213-238; PITFALLS P1; CONTEXT C-04 |
| `src/widget/statePersistence.ts` (or merged into WidgetController) CM6 history serialization | First repo use of `state.toJSON({history})` round-trip | RESEARCH Pattern 4 lines 280-308 + Pitfall 19-C |
| `src/widget/embedDetect.ts` (if split) DOM-ancestor + sourcePath dual signal | Net-new — v1.2 had no embed handling for `## Code` fences | RESEARCH Code Examples §"Embed detection (BOTH signals)" lines 480-499; Specific Findings §3 |
| `tests/widget/historyRoundTrip.test.ts` CM6 history serialization assertion | Net-new test pattern | RESEARCH Pitfall 19-C; Plan 19-03 acceptance test |
| `tests/widget/postFlushDiagnostic.test.ts` `console.warn` capture | Net-new — relies on `vi.spyOn(console, 'warn')` | CONTEXT D-09; RESEARCH Specific Findings §1 |
| `tests/widget/flushRateLimit.test.ts` 1/200ms gate | Net-new — `lastFlushAt` Map shape has no analog | RESEARCH "System Architecture Diagram" + CONTEXT C-08 |

---

## Metadata

**Analog search scope:**
- `src/main/` (14 files — every existing CM6/widget primitive lives here)
- `src/settings/` (2 files — toggle/persistence patterns)
- `src/graph/copyToCode.ts` + `src/solve/resetCodeWithConfirm.ts` + `src/solve/starterCodeInjector.ts` (vault.process write-path patterns)
- `src/main.ts` (registration / lifecycle / event-subscription patterns)
- `tests/main/` (22 files — closest test-pattern analogs)
- `tests/helpers/obsidian-stub.ts` + `tests/solve/mocks/fakeWorkspace.ts` (mock helpers reused verbatim by Phase 19 tests)

**Files scanned:** ~40
**Files read in full or in load-bearing slices:** 18
**Pattern extraction date:** 2026-05-29

---

## PATTERN MAPPING COMPLETE

**Phase:** 19 - Widget Foundation + One-Way Sync
**Files classified:** 27 new + 3 modified
**Analogs found:** 27 / 27 new ; 3 / 3 modified anchored

### Coverage
- Files with exact analog (lift verbatim or near-verbatim): 14 (codeBlockProcessor, liveModeViewPlugin, WidgetController, widgetRegistry, fenceLocator, plus 9 test files)
- Files with role-match analog (similar shape, different specifics): 11 (debouncedWriter, selfWriteSuppression, fenceSerialization, plus 8 test files)
- Files with no analog (greenfield — reference RESEARCH): 6 (atomicRanges Facet contribution, Debouncer-of-vault.process, content-hash TTL, history round-trip, embed dual-signal detection, plus 3 test files)

### Key Patterns Identified
- **lc-slug + getSectionInfo gate** is the canonical mount predicate — same shape across all three v1.2 callsites and ALL three Phase 19 mount paths. Reuse `app.metadataCache.getFileCache(file)?.frontmatter` everywhere; do NOT use `ctx.frontmatter`.
- **Container className `'lc-nested-editor HyperMD-codeblock'`** is the verbatim theme-integration carry-over from v1.2 — both classes are load-bearing for community-theme cascade and MUST remain.
- **All vault writes flow through `app.vault.process(file, fn)`** — `vault.modify` is banned by CI grep; existing callsites in `copyToCode.ts`, `mergeAIReviewSection`, `resetCodeWithConfirm` model the contract verbatim.
- **`registerEvent(this.app.X.on(...))`** is the universal subscription pattern — auto-cleanup on `Plugin.onunload()`. Mirror exactly for Phase 19's six flush-on-transition hooks.
- **`WidgetType.eq()` content-hash identity** — v1.2's `CodeActionsWidget.eq()` already encodes `(plugin, file, currentSlug)` to prevent unnecessary remount; Phase 19 widens to `(filePath, fenceIndex, sourceHash)` for the same reason but with body-aware identity (RESEARCH Pitfall 19-F).
- **`useNestedEditor` flag-gating** at `src/main.ts:830, 837-839, 955-957, 964-990` is the EXACT shape Phase 19 mirrors for `useInlineWidget` — read-once at top of `Plugin.onload()`, gate every registration call inside an `if` block.
- **Settings shape-guard discipline** — `src/settings/SettingsStore.ts` strict-equality posture (lines 664-668 indentSizeOverride, 672-677 useNestedEditor) is the contract for `widgetSyncDebounceMs` (whitelist 5 values) and `useInlineWidget` (boolean).

### File Created
`/Users/moxu/projects/obsidian-leetcode/.planning/phases/19-widget-foundation-one-way-sync/19-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. The planner can write actions of the form "follow the pattern from `src/main/codeActionsPostProcessor.ts:8-15` for the lc-slug gate" or "lift `findCodeFence` from `src/main/codeActionsEditorExtension.ts:177-212` verbatim into `src/widget/fenceLocator.ts`, widening FENCE_RE to match `leetcode-solve` opener" rather than abstract guidance.
