// Phase 19 Plan 01 + Plan 19-02 — Plugin-singleton widget registry (CONTEXT D-01).
//
// Phase 20 Plan 20-05: Map<`${file.path}::${fenceIndex}::${leafId}`,
// WidgetController> — one entry per mounted widget per pane. The key shape
// gained the `::${leafId}` segment so two panes on the same file co-exist in
// the registry (multi-pane CTA symmetry + no destroy clobber). The pane-blind
// `${file.path}::${fenceIndex}` shape lives on the controller's
// `persistenceKey` for state hydration. Mirrors the v1.2 ChildEditorRegistry
// shape from
// src/main/childEditorRegistry.ts:19-114, but drops:
//   - LRU eviction (Plan 19-01 has no cache pressure ceiling — the state
//     persistence map handles bound; widget unmount eagerly deletes here)
//   - sync wiring side effects on delete (Plan 19-01 has no sync; Plan 19-02
//     wires debouncedWriter teardown through controller.destroy directly)
//
// Plan 19-02 extensions:
//   - flushAll/flushFile return Promise<void> (await each controller's
//     flushNow which now returns a Promise from DebouncedWriter.forceFlush)
//   - flushAllSync — best-effort synchronous-issue path used by `beforeunload`
//     (cancel writers, fire-and-forget flushNow). RESEARCH Pitfall 19-B.
//   - applyDelay — iterates controllers and calls writer.setDelay for hot
//     reconfigure of widgetSyncDebounceMs (D-08 Settings live-apply).

/**
 * Minimal contract every WidgetController must satisfy.
 * Plan 19-02: flushNow returns a Promise that resolves once the
 * DebouncedWriter's pending write completes (forceFlush semantics).
 */
export interface WidgetControllerLike {
  flushNow(): Promise<void> | void;
  destroy(): void;
  file: { path: string };
  /** Optional — present in production controllers (set by Plan 19-02 mount
   *  factory). flushAllSync uses it for best-effort cancel; applyDelay uses
   *  it for hot debounce reconfigure. Both code paths defensively check
   *  presence so test fixtures may omit it. */
  writer?: {
    cancel(): void;
    setDelay?(ms: number): void;
  };
  /** Phase 20 Plan 20-01 (VIM-02) — production WidgetController exposes
   *  this; the plugin-side `workspace.on('layout-change')` listener calls
   *  it when `vimMode` changes. Optional in the structural contract so test
   *  fixtures (which don't drive vim toggles) can omit it. */
  reconfigureVim?: (enabled: boolean) => void;
  /** Phase 20 Plan 20-04 (THEME-04) — production WidgetController exposes
   *  this; the plugin-side `workspace.on('css-change')` listener walks the
   *  registry and calls it on every theme transition. Calls
   *  `view.requestMeasure()` — no EditorView rebuild. Optional in the
   *  structural contract so test fixtures can omit it. */
  cssRetheme?: () => void;
  /** Phase 20 Plan 20-04 (multi-pane "Take over" CTA) — production
   *  WidgetController exposes this; the plugin-side
   *  `workspace.on('active-leaf-change')` listener walks the registry and
   *  calls it with `'active'` on the focused-pane widget and `'peer'` on
   *  every other widget for the same file path. Optional in the structural
   *  contract so test fixtures can omit it. */
  setPaneState?: (state: 'active' | 'peer') => void;
  /** Live reconfigure of the per-language indent unit when the user
   *  changes `indentSizeOverride` in Settings. Production WidgetController
   *  exposes this; the SettingsTab onChange handler walks the registry
   *  and calls it on every controller. Pure-effects dispatch (no doc
   *  change), so no SelfWriteSuppression arming is needed. Optional in
   *  the structural contract so test fixtures can omit it. */
  reconfigureIndent?: (override: 'auto' | 2 | 4 | 8) => void;
}

export class WidgetRegistry {
  private readonly map = new Map<string, WidgetControllerLike>();
  /** WR-05 (review-fix) — per-path index. Used by hot paths that walk
   *  every controller for one file (e.g., `pushParentToChild`,
   *  modify-handler matchingWidget lookup). Without the index,
   *  per-keystroke parent docChange iterates ALL N entries; with N tabs
   *  and N widgets, the cost is O(N) per keystroke. The index keeps
   *  insertion-order semantics within each path bucket via Set. */
  private readonly byPath = new Map<string, Set<WidgetControllerLike>>();

  /** Retrieve a controller by `${path}::${fenceIndex}::${leafId}` key
   *  (Phase 20 Plan 20-05 added the leafId segment for per-pane disambiguation). */
  get(key: string): WidgetControllerLike | undefined {
    return this.map.get(key);
  }

  /** Store a controller under the given key. Replaces any existing entry. */
  set(key: string, ctl: WidgetControllerLike): void {
    // WR-05 — when replacing an existing entry, drop the old controller
    // from its path bucket FIRST so a path-keyed lookup never returns
    // a controller we just clobbered.
    const prev = this.map.get(key);
    if (prev) {
      const prevSet = this.byPath.get(prev.file.path);
      if (prevSet) {
        prevSet.delete(prev);
        if (prevSet.size === 0) this.byPath.delete(prev.file.path);
      }
    }
    this.map.set(key, ctl);
    let bucket = this.byPath.get(ctl.file.path);
    if (!bucket) {
      bucket = new Set();
      this.byPath.set(ctl.file.path, bucket);
    }
    bucket.add(ctl);
  }

  /** Check if a key exists. */
  has(key: string): boolean {
    return this.map.has(key);
  }

  /** Remove an entry without destroying the controller. The caller (typically
   *  `LeetCodeWidgetRenderChild.onunload`) is responsible for calling destroy
   *  on the controller before removing — this matches the v1.2
   *  ChildEditorRegistry's separation of concerns. */
  delete(key: string): void {
    const prev = this.map.get(key);
    if (prev) {
      const bucket = this.byPath.get(prev.file.path);
      if (bucket) {
        bucket.delete(prev);
        if (bucket.size === 0) this.byPath.delete(prev.file.path);
      }
    }
    this.map.delete(key);
  }

  /** WR-05 — fast path-keyed iteration. Used by `pushParentToChild` and
   *  the modify-handler to avoid O(N) walks per parent docChange. Returns
   *  an empty iterator when no widgets are mounted for the given path. */
  *valuesForPath(path: string): IterableIterator<WidgetControllerLike> {
    const bucket = this.byPath.get(path);
    if (!bucket) return;
    yield* bucket.values();
  }

  /** Iterate every registered controller and invoke `flushNow()` on each
   *  sequentially. Resolves once every flush completes. Called from
   *  Plugin.onunload, leaf-change, workspace 'quit', etc. (CONTEXT C-07). */
  async flushAll(): Promise<void> {
    for (const ctl of this.map.values()) {
      await ctl.flushNow();
    }
  }

  /** Synchronous-issue flush — used ONLY by `beforeunload` where awaiting an
   *  async Promise is best-effort (RESEARCH Pitfall 19-B). Cancels each
   *  writer's pending debounce, then fires flushNow without awaiting. The
   *  renderer process may exit before the writes resolve; this is the
   *  belt-and-suspenders backup to `workspace.on('quit')` Tasks.add. */
  flushAllSync(): void {
    for (const ctl of this.map.values()) {
      ctl.writer?.cancel();
      // Fire-and-forget — promise rejections swallowed (best-effort).
      try {
        const p = ctl.flushNow();
        if (p && typeof (p).catch === 'function') {
          (p).catch(() => undefined);
        }
      } catch {
        /* swallow — beforeunload best-effort */
      }
    }
  }

  /** Iterate every registered controller, invoke `destroy()`, then clear the
   *  map. Called from Plugin.onunload as the final teardown step. */
  destroyAll(): void {
    for (const ctl of this.map.values()) {
      ctl.destroy();
    }
    this.map.clear();
    // WR-05 — drop the path index alongside the main map.
    this.byPath.clear();
  }

  /** Flush every controller whose stored file path matches `filePath`. Used
   *  by `vault.on('rename')` to drain in-flight writes BEFORE the path
   *  change lands (Plan 19-02 hook). */
  async flushFile(filePath: string): Promise<void> {
    for (const ctl of this.map.values()) {
      if (ctl.file.path === filePath) await ctl.flushNow();
    }
  }

  /** Hot-reconfigure the debounce delay for every controller's writer.
   *  Called from SettingsTab 'Save delay' onChange so widgetSyncDebounceMs
   *  applies live without note reload (D-08). */
  applyDelay(ms: number): void {
    for (const ctl of this.map.values()) {
      ctl.writer?.setDelay?.(ms);
    }
  }

  /** Live-apply the indent override across every mounted widget. Called
   *  from SettingsTab 'Indent size' onChange so the user sees the new
   *  indent unit take effect on every open note without needing to
   *  reload. Each controller re-reads its own slug from frontmatter
   *  (Go always uses `\t` regardless of override per D-06). Pure-effects
   *  dispatch — no body change, no SelfWriteSuppression involvement. */
  applyIndentReconfigure(override: 'auto' | 2 | 4 | 8): void {
    for (const ctl of this.map.values()) {
      ctl.reconfigureIndent?.(override);
    }
  }

  /** Phase 20 Plan 20-01 — iterator over every registered controller. Used by
   *  the plugin-side `workspace.on('layout-change')` vim dispatcher (Plan
   *  20-01) and by Plan 20-04 multi-pane affordance / theme dispatcher.
   *  Yields the same WidgetControllerLike values as `flushAll` walks; the
   *  underlying `Map.values()` iterator is forward-compatible if any caller
   *  needs `Array.from(registry.values())`. */
  *values(): IterableIterator<WidgetControllerLike> {
    yield* this.map.values();
  }

  /** Current entry count. Used by tests; not part of the public hot path. */
  get size(): number {
    return this.map.size;
  }
}
