# Stack Research — v1.3 Inline Widget Architecture

**Domain:** Obsidian community plugin (TypeScript) — replacing v1.2 dual-CM6 nested-editor with inline code-block widget + one-way sync
**Researched:** 2026-05-28
**Confidence:** HIGH (Context7 + official obsidian.d.ts + Dataview source verification)

## Executive Verdict

**No new runtime dependency is required to ship v1.3.** The widget surface is built entirely from packages already in `package.json`:

- Mount surface: `Plugin.registerMarkdownCodeBlockProcessor` (Obsidian built-in) — for **Reading mode**
- Live Preview parity: `Plugin.registerEditorExtension` + CM6 `ViewPlugin` returning `Decoration.replace({ widget })` whose `WidgetType.toDOM()` mounts a child `EditorView` — using `@codemirror/view` (already pinned)
- Atomic write: `app.vault.process(file, fn)` (Obsidian built-in, since 1.1.0) — already the canonical write path used throughout v1.0–v1.2 (`src/main.ts`, `src/graph/*`, `src/ai/*`)
- Self-write echo suppression: `app.vault.on('modify', ...)` + a short-window `Set<string>` of recently-written paths — pattern already in use in `src/main/childEditorSync.ts:683-790` (Phase 18 D-33)
- Debounce: Obsidian's built-in `debounce(cb, ms, resetTimer)` from `obsidian` (returns `Debouncer<T,V>` with `.cancel()` and `.run()` since 1.4.4)
- Vim: `@replit/codemirror-vim@6.3.0` already pinned — conditional `vim()` extension based on `app.vault.getConfig('vimMode')` is correct

**The decisive architectural finding:** `registerMarkdownCodeBlockProcessor` does NOT render in Live Preview — only in Reading mode. This is verified against Obsidian developer docs ("Use a Markdown post processor to change how Markdown is converted to HTML in Reading view. Use an editor extension specifically when you need to modify the appearance or behavior of the document within Live Preview") AND against Dataview's source code (Dataview registers BOTH a `registerMarkdownCodeBlockProcessor` for Reading mode AND a separate `registerEditorExtension` ViewPlugin (`./ui/lp-render`) for Live Preview parity). v1.3 must do the same: a TWO-PATH mount strategy. This is the single most important architectural input to the roadmap.

## Recommended Stack

### Core Technologies (NO CHANGES — already pinned)

| Technology | Installed Version | Purpose | Why Recommended |
|------------|-------------------|---------|-----------------|
| `obsidian` (npm) | `1.12.3` | Type definitions + runtime API surface | Provides `Plugin.registerMarkdownCodeBlockProcessor`, `Plugin.registerEditorExtension`, `Vault.process`, `MarkdownPostProcessorContext.addChild`, `MarkdownRenderChild`, `debounce`, `Debouncer<T,V>`. All v1.3 mount/sync primitives come from this package. Pin to `latest`; declare `minAppVersion` in `manifest.json` to current shipped target. |
| `@codemirror/view` | `6.38.6` | CM6 widget surface — `WidgetType`, `Decoration`, `ViewPlugin`, `EditorView` | Powers BOTH the Live Preview decoration widget AND the embedded child editor inside the Reading-mode mount. Must remain `external` in esbuild — Obsidian provides it at runtime. **NOTE:** CLAUDE.md claims `6.42.1` but actually installed is `6.38.6`; latest on npm is `6.43.0` (verified npm registry 2026-05-28). Stay on Obsidian's peer-provided version — do NOT pin to a higher major or to `^6.43.0` because the host's version wins at runtime and a mismatch causes "two copies of CM6" instance-identity bugs. |
| `@codemirror/state` | `6.5.0` | CM6 transaction core — `EditorState`, `Transaction`, `StateEffect`, `Annotation` | Required peer for `@codemirror/view`. **NOTE:** CLAUDE.md claims `6.6.0` but actually installed is `6.5.0`; latest on npm is `6.6.0` (verified 2026-05-28). Same external/peer rule as above. |
| `@codemirror/commands` | `6.10.3` | Vim peer dep + history/undo commands | Already in `devDependencies`. Required peer for `@replit/codemirror-vim` per the vim package's `peerDependencies` block (`@codemirror/commands: 6.x.x`). |
| `@codemirror/language` | `6.12.3` | Per-language indent/bracket/comment rules | Already in `devDependencies`. Re-used unchanged from v1.2. |
| `@codemirror/autocomplete` | `6.20.2` | Bracket close-pair, snippet expansion | Already in `dependencies`. Re-used unchanged from v1.2. |
| `@codemirror/search` | `6.7.0` (transitive) | Required peer for vim mode (`/`, `?` search) | Pulled in via `@replit/codemirror-vim` peer requirement. Already resolved. |
| `@codemirror/lint` | `6.9.6` (transitive) | Not directly used — pulled in by lang packs | No action needed. |
| `@replit/codemirror-vim` | `6.3.0` | Vim keybinding extension for child CM6 | **CONFIRMED CORRECT PIN.** Latest on npm is `6.3.0` (verified npm registry 2026-05-28); peer dep is `@codemirror/{view,state,commands,language,search}: 6.x.x` — all satisfied. Conditional injection based on `app.vault.getConfig('vimMode')` (read once at widget construction; reload-on-toggle is the documented v1.3 UX shift). No alternative package exists for CM6 vim mode. |

### Language Packs (NO CHANGES — carried over from v1.2)

| Library | Installed Version | Purpose |
|---------|-------------------|---------|
| `@codemirror/lang-cpp` | `6.0.3` | C / C++ |
| `@codemirror/lang-java` | `6.0.2` | Java / Kotlin (via Java parser) |
| `@codemirror/lang-javascript` | `6.2.5` | JavaScript / TypeScript |
| `@codemirror/lang-python` | `6.2.1` | Python (also Python3 via custom highlighter in `src/main/python3Highlighter.ts`) |
| `@codemirror/lang-rust` | `6.0.2` | Rust |
| `@codemirror/legacy-modes` | `6.5.3` | Go, Ruby, Swift, Scala, C# (via legacy CodeMirror 5 modes — only viable path for these langs) |

All eight v1.2-supported languages keep working unchanged. The widget rebuilds its `Compartment` of language extensions on language switch — same logic as `src/main/childEditorLanguage.ts`, just hosted inside the new widget instead of inside the now-deleted `nestedEditorExtension.ts`.

### Supporting Libraries (NO ADDITIONS)

| Library | Status | Why |
|---------|--------|-----|
| `lodash` / `lodash.debounce` | DO NOT ADD | Verified absent from current `node_modules` and not a transitive dep (`npm ls lodash` returns empty). Obsidian's `debounce(cb, timeout, resetTimer): Debouncer<T,V>` — exported from `obsidian` — covers the use case with `.cancel()` (for flush-on-unload abandon) and `.run()` (for flush-on-blur force-fire) since Obsidian 1.4.4. Adding lodash for one helper would be ~70 KB minified for zero gain. |
| `marked` / `remark` / `rehype` | DO NOT ADD | Direction is wrong (Markdown → HTML); v1.3 doesn't need it. Reading-mode rendering is delegated to Obsidian's built-in renderer; only the fence body is replaced by the widget. |
| `@electron/remote` | DO NOT ADD | Already excluded in v1.0 design. v1.3 widget never touches BrowserWindow. |
| `react` / `preact` / `svelte` | DO NOT ADD | The widget is a single CM6 `EditorView` plus a small action row of `createEl` buttons. A framework would multiply bundle size for zero benefit and would re-introduce reconciliation timing bugs that the v1.3 architecture is meant to eliminate. |
| `lit` / `lit-html` | DO NOT ADD | Same reasoning — DOM is small and lifecycle is owned by `MarkdownRenderChild` / CM6 `ViewPlugin.destroy()`. |
| `eventemitter3` | DO NOT ADD | Already a transitive dep of `@leetnotion/leetcode-api`; widget→plugin signaling uses CM6 `StateEffect` + plugin's `EventRef` plumbing. No need to expose. |

### Development Tools (NO CHANGES)

| Tool | Purpose | Notes |
|------|---------|-------|
| `esbuild@^0.28.0` | Bundler | Already pinned. Externals must continue to include `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` (see `esbuild.config.mjs`). v1.3 introduces no new bundle externals. |
| `typescript@5.8.3` | Type-checking | Already pinned. `obsidian.d.ts` for `1.12.3` exposes all v1.3 surface (`MarkdownPostProcessorContext`, `MarkdownRenderChild`, `MarkdownSectionInformation`, `Debouncer<T,V>`) with `@public` and `@since` markers. No `tsconfig.json` change needed. |
| `vitest@4.1.5` | Unit tests | Already pinned. v1.3 widget logic (debounce coalescing, self-write suppression window, fence-body diff/extraction) is pure functions — testable without Obsidian. The widget itself (mount/CM6 dispatch loop) cannot be unit-tested; cover with manual QA + e2e in dev vault per the v1.0–v1.2 pattern. |
| `eslint-plugin-obsidianmd@^0.3.0` | Plugin-store anti-pattern lint | Already pinned. Catches `innerHTML` misuse, deprecated `workspace.activeLeaf`, etc. Will continue to flag any v1.3 widget DOM code that strays — keep it green. |
| `pjeby/hot-reload` (vault-side) | Dev-only auto-reload | Continue using; reload-on-vim-toggle UX still applies. |

## Installation

**No `npm install` is required for v1.3.** Verify the lockfile is current:

```bash
# Sanity check (run after pulling v1.3 branch start)
npm ci

# If CLAUDE.md's stated pins (state 6.6.0, view 6.42.1) are intentionally
# being raised, do this DELIBERATELY in a separate phase — bumping CM6
# minor versions is NOT a v1.3 prerequisite and risks runtime mismatch
# with Obsidian's host-provided CM6.
```

If CLAUDE.md's documented pins (`@codemirror/state@6.6.0`, `@codemirror/view@6.42.1`) are the intended target, that is a separate maintenance bump — orthogonal to v1.3 architecture work and explicitly NOT required to ship the widget.

## Detailed Decision Rationale

### 1. Mount Surface — Two-Path Strategy (Reading + Live Preview)

#### 1a. Reading Mode — `registerMarkdownCodeBlockProcessor`

```typescript
this.registerMarkdownCodeBlockProcessor(
  'leetcode-solve',
  (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const child = new LeetCodeWidgetRenderChild(this.app, this.plugin, el, source, ctx);
    ctx.addChild(child); // lifecycle: child.unload() runs when el is detached
  }
);
```

- Verified signature (Context7 + obsidian.d.ts 1.12.3): `(language, handler, sortOrder?) => MarkdownPostProcessor`. Handler receives `source` (the raw fence body), `el` (a pre-stripped `<div>` — the `<pre><code>` wrapper is already removed for you), and `ctx` (with `sourcePath`, `getSectionInfo(el)`, `addChild(child)`).
- **Lifecycle:** Obsidian re-invokes the handler on every section re-render (file open, scroll into view, sibling block change, hot-reload). `MarkdownPostProcessorContext.addChild(child: MarkdownRenderChild)` is the canonical cleanup path: when `el` detaches, `child.unload()` fires. This is where the embedded CM6 `EditorView.destroy()` happens — without it, every scroll leaks an editor.
- `getSectionInfo(el)` returns `{ text, lineStart, lineEnd } | null` and is the way to map widget back to source-file line range for `vault.process` rewrites. Per docs: "Only call this function right before you need this information" — do NOT cache the result; call it inside the debounced flush function.
- `sortOrder` defaults to 0; lower runs first. v1.3 should keep default unless a third-party plugin actively conflicts (no known conflict for the `leetcode-solve` language tag).

#### 1b. Live Preview — `registerEditorExtension` + `ViewPlugin` + `Decoration.replace({ widget })`

`registerMarkdownCodeBlockProcessor` does NOT render in Live Preview. Confirmed two ways:
1. Official Obsidian editor-extensions doc: "Use a **Markdown post processor** if you want to change how to convert Markdown to HTML in the Reading view. Use an **editor extension** if you want to change how the document looks and feels in Live Preview."
2. Dataview source code: registers BOTH `registerPriorityCodeblockPostProcessor` (wraps `registerMarkdownCodeBlockProcessor`, sortOrder -100) AND a separate `registerEditorExtension([inlinePlugin, ...])` ViewPlugin in `./ui/lp-render` for Live Preview parity.

The Live Preview path is a CM6 `ViewPlugin` that:
- Iterates the syntax tree in `view.visibleRanges` looking for fenced code blocks whose info string is `leetcode-solve`
- Builds a `RangeSetBuilder<Decoration>` placing `Decoration.replace({ widget: new LeetCodeFenceWidget(...) })` over each fence (from opener line to closer line)
- The `WidgetType.toDOM(view: EditorView)` returns a container `<div>` and mounts a *child* `EditorView` inside it — same widget surface as the Reading-mode child editor; only the host differs
- `update(update: ViewUpdate)` rebuilds decorations only when `update.docChanged || update.viewportChanged` — same pattern as the official Decorations docs example
- `destroy()` on the ViewPlugin tears down each child editor

Both paths feed the same widget controller (factor a `mountLeetCodeWidget(host: HTMLElement, source: string, file: TFile)` function) so logic is shared and the two-path mount is a thin shell.

#### Anti-pattern to avoid:
- Trying to make `registerMarkdownCodeBlockProcessor` work in Live Preview by walking the editor DOM is fragile and will break on Obsidian updates. Use the editor-extension path.
- Omitting the Reading-mode path entirely (Live Preview only) breaks for users in pure Reading view (the published-note workflow) and breaks PDF export.

### 2. One-Way Sync Write Primitive — `app.vault.process`

Already the canonical pattern in this codebase (`src/main.ts:1320`, `src/main.ts:1428`, `src/main.ts:2005`, `src/main.ts:2103`, `src/main.ts:3094-3123`, `src/graph/copyToCode.ts`, `src/notes/NoteWriter.ts`, etc.). v1.3 keeps this discipline:

```typescript
await app.vault.process(file, (data) => {
  // 1. Locate the leetcode-solve fence range (regex on the heredoc lines)
  // 2. Replace its body with the widget's current code, preserving fence delimiters
  // 3. Return the rewritten string
  return rewriteFenceBody(data, fenceRange, newBody);
});
```

- `Vault.process(file, fn, options?): Promise<string>` is documented as **atomically read, modify, and save** (Obsidian docs, since 1.1.0). The callback is synchronous; the read-modify-write pair is serialized.
- Returns the final written text — useful for verifying the rewrite landed (e.g., assert the regex matched and the fence was found before reporting flush success).
- Compared to alternatives:
  - `vault.modify(file, data)` — non-atomic; race against concurrent reads; flagged by `scripts/grep-no-vault-modify.sh` (already a CI check). DO NOT USE.
  - `vault.adapter.write(path, data)` — bypasses metadata cache invalidation and `vault.on('modify')` semantics; used only for non-vault files. DO NOT USE for `.md` files.
  - `fileManager.processFrontMatter(file, fn)` — purpose-built for YAML frontmatter ONLY; cannot edit body. Used elsewhere in this plugin for AC verdict updates; do not extend it for fence-body writes.

### 3. Self-Write Echo Suppression

Pattern is already implemented and proven in `src/main/childEditorSync.ts:683-790` (Phase 18 Plan 02 / D-33). Re-use the same shape:

```typescript
// Plugin-level state
private pendingSelfWrites = new Set<string>();

// Around vault.process call
this.pendingSelfWrites.add(file.path);
try {
  await this.app.vault.process(file, fn);
} finally {
  // Window: 1 tick is sufficient because vault.on('modify') fires
  // synchronously after the underlying file write completes.
  // Use queueMicrotask + setTimeout(0) for belt-and-suspenders.
  queueMicrotask(() => {
    setTimeout(() => this.pendingSelfWrites.delete(file.path), 0);
  });
}

// In the modify listener
this.registerEvent(
  this.app.vault.on('modify', (file) => {
    if (!(file instanceof TFile)) return;
    if (this.pendingSelfWrites.has(file.path)) return; // self-echo: skip
    // External edit: notify widget to reconcile (re-read fence body, dispatch
    // setValue into the child EditorView with addToHistory.of(false))
    this.notifyWidgetExternalEdit(file);
  })
);
```

- `vault.on('modify')` returns an `EventRef`; wrap with `this.registerEvent(...)` for auto-detach on plugin unload — same convention used throughout `src/main.ts` (lines 864, 900, 926, 966).
- The `Set<string>` window is preferred over a timestamp comparison because it survives clock skew and double-modify-fire events.
- Do NOT use a global "suppress all modify events" boolean — concurrent edits to OTHER files would be missed.

### 4. Debounce Primitive — Obsidian's Built-in `debounce`

```typescript
import { debounce, Debouncer } from 'obsidian';

const flush = debounce(
  () => this.flushWidgetToVault(file, widget),
  400, // ms
  true  // resetTimer: every keystroke resets the 400ms countdown
);

// In CM6 update listener inside the widget
EditorView.updateListener.of(update => {
  if (update.docChanged) flush();
});

// On widget unmount / blur
flush.run();   // flush-on-blur — fire pending immediately if any (since 1.4.4)
flush.cancel(); // flush-on-unload abandon path (e.g., file rename mid-edit)
```

- `obsidian.debounce<T, V>(cb, timeout, resetTimer): Debouncer<T, V>` (verified via `node_modules/obsidian/obsidian.d.ts` at this commit). Returns a debouncer with `.cancel(): this` and `.run(): V | void`.
- `.run()` is the official "flush-on-blur" / "flush-on-unload" force-fire — exactly what v1.3 needs. Available since Obsidian 1.4.4 (well below v1.3's `minAppVersion`).
- Recommended timeout: `300–500 ms` per project spec; `400 ms` is the suggested mid-point. Make it a `LeetCodePluginSettings` field if user-tunable.
- **Why not lodash:** Obsidian's `debounce` covers 100% of the surface; adding a 70 KB dep is unjustified. Confirmed `lodash` is NOT a transitive dep of any current package (`npm ls lodash` returns empty).
- **Why not hand-rolled `setTimeout`:** Subtle bugs around `clearTimeout` ordering, cancel-after-fire, and immediate-flush edge cases are all already solved in Obsidian's helper. Use it.

### 5. Vim Mode — `@replit/codemirror-vim@6.3.0`

```typescript
import { vim } from '@replit/codemirror-vim';

const extensions: Extension[] = [
  baseExtensions,
  language.of(currentLangExtension),
  // ... other extensions
];

// Read once at widget construction; reload-on-toggle is the documented v1.3 UX.
const vimMode = (this.app.vault as any).getConfig?.('vimMode') === true;
if (vimMode) extensions.push(vim());
```

- `@replit/codemirror-vim@6.3.0` is the latest published version (npm registry verified 2026-05-28). No newer release exists.
- Peer deps satisfied: `@codemirror/{view@6.x, state@6.x, commands@6.x, language@6.x, search@6.x}` — all in current dependency tree.
- The plugin already uses `vim()` in `src/main/nestedEditorExtension.ts` (slated for deletion). The same `vim()` extension drops into the new widget unchanged — no API migration.
- `app.vault.getConfig('vimMode')` is the correct read path. It is undocumented (typed `any`) but stable since Obsidian 0.x and is what every vim-aware community plugin uses. Cast through `any` once and centralize in a helper (e.g., `src/widget/vimMode.ts`).
- **Reload-on-vim-toggle is acceptable** (per PROJECT.md "Key Decisions" row): Obsidian fires no event when the user toggles vim mode. Listening to `app.workspace.on('layout-change')` is too broad; the project already accepted reload as the UX.
- No alternative CM6 vim package exists; `@replit/codemirror-vim` is the canonical port maintained by Replit.

### 6. Lifecycle Hook — `MarkdownRenderChild`

For Reading-mode mount, the widget must subclass `MarkdownRenderChild`:

```typescript
import { MarkdownRenderChild } from 'obsidian';

class LeetCodeWidgetRenderChild extends MarkdownRenderChild {
  private editorView?: EditorView;
  private flushDebouncer?: Debouncer<[], void>;

  constructor(containerEl: HTMLElement, /* ... */) {
    super(containerEl);
  }

  onload() {
    this.editorView = new EditorView({ /* ... */, parent: this.containerEl });
    this.flushDebouncer = debounce(() => this.flush(), 400, true);
  }

  onunload() {
    this.flushDebouncer?.run();   // flush any pending on unload
    this.editorView?.destroy();
    this.editorView = undefined;
  }
}
```

- `MarkdownRenderChild extends Component` — inherits `addChild`, `removeChild`, `register`, `registerEvent`, `registerDomEvent`, `registerInterval` for managed cleanup.
- The `containerEl` passed to `super(containerEl)` is the lifecycle anchor: when Obsidian removes it from the DOM (typical when re-rendering a section after edit), `onunload()` fires. This is exactly where to flush + tear down the child CM6.
- Verified via `node_modules/obsidian/obsidian.d.ts` (line ~`MarkdownRenderChild extends Component`).

### 7. Live Preview Widget — `WidgetType` Class Pattern

```typescript
import { WidgetType, EditorView } from '@codemirror/view';

class LeetCodeFenceWidget extends WidgetType {
  constructor(private source: string, private file: TFile, private host: LeetCodePlugin) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.addClass('leetcode-widget-host');
    // Mount child EditorView, action row, etc. (same factory as Reading mode)
    mountLeetCodeWidget(container, this.source, this.file, this.host);
    return container;
  }

  eq(other: LeetCodeFenceWidget) {
    return other.source === this.source && other.file.path === this.file.path;
  }

  destroy(dom: HTMLElement) {
    // Tear down child EditorView; the widget framework calls this when the
    // decoration is removed (e.g., user edits the fence header line).
    teardownLeetCodeWidget(dom);
  }

  ignoreEvent() {
    return true; // CM6 should NOT route keystrokes to the parent doc — child owns them
  }
}
```

- `WidgetType.eq()` — return true when content is unchanged so CM6 reuses the existing DOM (avoids tearing down + remounting CM6 on every host transaction). CRITICAL for performance.
- `WidgetType.ignoreEvent()` returning `true` is what makes the child editor own keyboard input. Without it, parent-doc edit logic competes for keystrokes — exactly the v1.2 bug class we're fixing.
- `WidgetType.destroy(dom)` is the cleanup hook; mirror what Reading mode's `MarkdownRenderChild.onunload` does.
- ViewPlugin's `destroy()` runs when the editor is torn down (file close); this propagates `destroy` to all live widgets.

### 8. Section-Lock and Echo Conventions — DELETE

The v1.2 conventions called out as deletion targets in PROJECT.md:

| File / Convention | Status in v1.3 |
|-------------------|----------------|
| `src/main/childEditorSync.ts` (parent↔child mirror) | DELETE — no parent CM6 transactions in v1.3 |
| `src/main/sectionLockExtension.ts` (`EditorState.changeFilter` + `'leetcode.*'` userEvent) | DELETE — fence body lives in widget, not parent doc; no need to lock parent ranges |
| `src/main/nestedEditorExtension.ts` | DELETE — replaced by widget |
| `'leetcode.*'` userEvent annotation convention (CLAUDE.md) | DELETE — no CM6 dispatches into the parent doc |
| Fence-closer-merge guard | DELETE — widget owns its body; vault.process owns the file rewrite |
| History-bypass mirror dance (`addToHistory.of(false)`) | RETAINED only for the rare "external edit reconciliation" path where the widget receives an `app.vault.on('modify')` notification and must `setValue` itself without polluting child undo |

CLAUDE.md should be updated post-shipping to remove the `'leetcode.*'` userEvent section. The "Canonical plugin write-path pattern (Phase 17 D-05)" reference also becomes obsolete — there is no longer a child editor registry; the widget IS the only editor.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Two-path mount (`registerMarkdownCodeBlockProcessor` + CM6 `ViewPlugin`) | Reading-mode-only via post-processor | NEVER — breaks Live Preview workflow, which is Obsidian's default mode. |
| Two-path mount | Live-Preview-only via CM6 ViewPlugin | NEVER — breaks pure Reading view, PDF export, and the "Open in Reading mode" command. |
| `app.vault.process` for atomic rewrites | `app.vault.modify(file, data)` | NEVER — non-atomic, racy, blocked by repo CI grep (`scripts/grep-no-vault-modify.sh`). |
| `app.vault.process` | `app.fileManager.processFrontMatter` | Only for YAML frontmatter edits (verdict updates already use this). Not applicable to fence body. |
| Obsidian's `debounce` (built-in) | `lodash.debounce` | Only if a feature requires `maxWait` or `leading` semantics — Obsidian's helper covers v1.3 needs. |
| Obsidian's `debounce` | Hand-rolled `setTimeout` + flag | Don't — re-implements buggy edge cases that Obsidian's helper already solves. |
| `Set<string>` self-write suppression | Timestamp comparison (`mtime > lastWrite`) | Only if the modify event arrives BEFORE the `vault.process` Promise resolves (it doesn't on current Obsidian). |
| Conditional `vim()` from `getConfig('vimMode')` | A separate vim-toggle setting in the plugin | NEVER — duplicates Obsidian's setting; users will set both and get confused. |
| `MarkdownRenderChild` for Reading-mode lifecycle | DOM mutation observer | Don't — Obsidian's framework already does this correctly via `addChild` + `containerEl` detach detection. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Adding `lodash` / `lodash.debounce` | ~70 KB unused weight; Obsidian's `debounce` is sufficient | Obsidian's built-in `debounce` from `obsidian` |
| Adding `react`, `preact`, `svelte`, `lit` | Bundle bloat; reconciliation timing complexity v1.3 is meant to eliminate | `createEl()` + CM6 `EditorView` directly |
| `app.vault.modify(file, data)` | Non-atomic; CI lint blocks it | `app.vault.process(file, fn)` |
| `app.vault.adapter.write(path, data)` | Bypasses metadata cache + `vault.on('modify')` | `app.vault.process(file, fn)` for `.md` files |
| Bumping `@codemirror/{state,view,commands}` past Obsidian's host pins | Two CM6 instances at runtime → instance-identity bugs (decorations don't apply, type guards fail) | Use `external` esbuild externals; let Obsidian provide CM6 at runtime |
| `marked` / `remark` / `rehype` / any HTML→MD or MD→HTML library for the widget | Obsidian renders the surrounding note; the widget owns only the fence body | Obsidian's built-in `MarkdownRenderer` (already used in v1.1 AI Review) |
| `react-codemirror2` / `@uiw/react-codemirror` | Wraps CM6 in React — unneeded, adds React, fights Obsidian's lifecycle | Raw `@codemirror/view` `EditorView` |
| Custom MutationObserver to detect Live Preview re-renders | CM6 `ViewPlugin.update(ViewUpdate)` already provides exactly this signal | `ViewPlugin` with `update(u => u.docChanged \|\| u.viewportChanged)` |
| A global `vault.on('modify')` echo-suppression boolean | Misses concurrent external edits to other files | Per-path `Set<string>` window, cleared via `queueMicrotask` + `setTimeout(0)` |
| A separate "v1.3 vim toggle" plugin setting | Confuses users who already set Obsidian's vim mode | Read `app.vault.getConfig('vimMode')` once at widget mount |
| Listening for vim-mode toggle via `workspace.on('layout-change')` | Too broad; fires on every leaf operation | Reload-on-toggle (already accepted in PROJECT.md Key Decisions) |
| Invalidating the widget by re-rendering the whole MarkdownRenderChild on every keystroke | Destroys CM6 state, undo stack, cursor position | `WidgetType.eq()` returning `true` for unchanged source; CM6 reuses DOM |
| Bundling `@codemirror/view` (i.e., removing it from esbuild externals) | Two copies of CM6 at runtime → broken `instanceof` checks | Keep all `@codemirror/*` externals in `esbuild.config.mjs` |

## Stack Patterns by Variant

### Reading Mode (post-processor path)
- Use `Plugin.registerMarkdownCodeBlockProcessor('leetcode-solve', handler)`
- Inside handler: `ctx.addChild(new LeetCodeWidgetRenderChild(el, source, ctx, plugin))`
- `MarkdownRenderChild.onunload()` fires when section re-renders → tear down CM6
- `ctx.getSectionInfo(el)` resolves to file line range for `vault.process` rewrites
- Re-renders happen on file open, scroll into view, sibling block edit — handler must be idempotent

### Live Preview (editor-extension path)
- Use `Plugin.registerEditorExtension([leetCodeFenceViewPlugin])`
- ViewPlugin scans `view.visibleRanges` via `syntaxTree(view.state).iterate(...)` looking for fence info string `leetcode-solve`
- Build `Decoration.replace({ widget: new LeetCodeFenceWidget(source, file, plugin) })` over the fence range
- `WidgetType.eq()` returns true for unchanged source — prevents teardown thrash
- `WidgetType.ignoreEvent()` returns true — child owns keystrokes
- `WidgetType.destroy(dom)` mirrors `MarkdownRenderChild.onunload()`

### Shared Widget Factory
- Both paths call a single `mountLeetCodeWidget(host: HTMLElement, source: string, file: TFile, plugin: LeetCodePlugin)` factory
- Returns `{ editorView, flush: () => void, dispose: () => void }`
- Used by both `MarkdownRenderChild.onload/onunload` and `WidgetType.toDOM/destroy`
- ~300 LOC budget per PROJECT.md

### External-Edit Reconciliation
- Single global `vault.on('modify')` listener (registered once in `Plugin.onload`)
- Skips events whose path is in `pendingSelfWrites: Set<string>`
- For non-self events: re-read file via `vault.cachedRead(file)`, locate fence body, dispatch `editorView.dispatch({ changes: { from: 0, to: doc.length, insert: newBody }, annotations: [Transaction.addToHistory.of(false)] })` so external edits don't pollute child undo
- Widget needs to be addressable by file path: `Map<string, Set<EditorView>>` (one file can have multiple open widgets across split panes)

### Migration Path for v1.2 Notes
- Existing v1.2 notes use `## Code` heading + standard fence with `lc-language` frontmatter
- Lazy-on-open migration: when a note is opened and a `leetcode-solve` fence is NOT found but a `## Code` heading IS, run a one-shot rewrite via `vault.process` to convert to the new fence syntax — same lazy-on-AC pattern as v1.1's Techniques migration
- Do NOT batch-rewrite all notes on plugin load (PROJECT.md "Out of Scope" — explicit anti-pattern carried forward)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `obsidian@1.12.3` | `@codemirror/view@6.38.6`, `@codemirror/state@6.5.0` | Currently installed peer pins; Obsidian provides these at runtime. Do not bundle. |
| `obsidian@1.12.3` | `Debouncer.run()` (since 1.4.4) | All v1.3 use cases require ≥ 1.4.4 — well below current `minAppVersion`. |
| `obsidian@1.12.3` | `vault.process` (since 1.1.0) | Unchanged from v1.0 baseline. |
| `@replit/codemirror-vim@6.3.0` | `@codemirror/{view,state,commands,language,search}@6.x.x` | All peers satisfied by current install. |
| `@codemirror/view@6.38.6` | `@codemirror/state@6.5.0` | Current install matches; do NOT bump independently. |
| `esbuild@0.28.x` | TypeScript `5.8.3` | TS handles transpile; esbuild bundles. No coupling. |
| `vitest@4.1.5` + `happy-dom@^20.9.0` | TypeScript `5.8.3` | Existing test infra; works for widget pure-logic tests. CM6 EditorView mounting requires real DOM — defer those to manual QA. |

## Sources

- `/obsidianmd/obsidian-developer-docs` (Context7) — `registerMarkdownCodeBlockProcessor`, `MarkdownPostProcessorContext.addChild`, `MarkdownRenderChild`, `Vault.process`, `debounce`/`Debouncer`, Decorations + `WidgetType` + `ViewPlugin` patterns, "Editor extension vs. Markdown post processor" guidance — HIGH confidence (fetched 2026-05-28)
- `node_modules/obsidian/obsidian.d.ts` (currently installed `obsidian@1.12.3`) — verified signatures for `Plugin.registerMarkdownCodeBlockProcessor`, `Plugin.registerEditorExtension`, `Vault.process`, `Vault.on('modify')`, `MarkdownRenderChild`, `MarkdownPostProcessorContext`, `MarkdownSectionInformation`, `debounce`, `Debouncer<T,V>` — HIGH confidence
- `blacksmithgu/obsidian-dataview/src/main.ts` — confirms two-path mount: `registerPriorityCodeblockPostProcessor` for Reading + `registerEditorExtension([inlinePlugin, ...])` for Live Preview parity (`./ui/lp-render`) — HIGH confidence (fetched 2026-05-28). This is the decisive verification that Live Preview parity requires a separate CM6 ViewPlugin path.
- npm registry — verified versions 2026-05-28: `@codemirror/view` latest `6.43.0` (installed 6.38.6), `@codemirror/state` latest `6.6.0` (installed 6.5.0), `@replit/codemirror-vim` latest `6.3.0` (installed 6.3.0)
- Existing repo source: `src/main.ts` (vault.process callsites, `registerEvent` for `vault.on('modify')`), `src/main/childEditorSync.ts:683-790` (Phase 18 Plan 02 self-write suppression pattern), `src/main/nestedEditorExtension.ts` (existing vim integration via `vim()`), `src/main/childEditorLanguage.ts` (Compartment-based language switching) — HIGH confidence (read in this research session)
- `package.json` lockfile inspection — confirmed `lodash` is NOT a transitive dep (`npm ls lodash` empty), so adding it would be a NEW dependency
- Obsidian Decorations docs page (Context7 `/obsidianmd/obsidian-developer-docs/Plugins/Editor/Decorations.md`) — `WidgetType`, `Decoration.replace`, `ViewPlugin.fromClass`, `RangeSetBuilder<Decoration>`, `view.visibleRanges` example — HIGH confidence

## Discrepancies Flagged for Roadmap

1. **CLAUDE.md states `@codemirror/state@6.6.0` and `@codemirror/view@6.42.1`. Reality: `6.5.0` and `6.38.6` are installed.** This is a minor docs drift, not a v1.3 blocker. If a CM6 bump is desired, do it in a separate maintenance phase — NOT as part of v1.3 — and verify Obsidian's host CM6 pins still match. v1.3 must NOT bump CM6 majors/minors as a side effect.

2. **No new dependency = no new attack surface for plugin-store review.** v1.3 ships with the same dependency tree as v1.2; community-plugin re-review will not flag any new third-party network or eval surface. Compatibility-wise, the bundle ceiling (1.2 MB) has headroom; widget code is ~300 LOC of pure TS with zero new deps.

3. **The `'leetcode.*'` userEvent convention in CLAUDE.md becomes obsolete in v1.3.** Update CLAUDE.md as part of milestone-close — there will be no more plugin-originated CM6 dispatches into the parent doc, so the convention has no callsites left.

---
*Stack research for: Obsidian LeetCode plugin v1.3 inline-widget architecture*
*Researched: 2026-05-28*
