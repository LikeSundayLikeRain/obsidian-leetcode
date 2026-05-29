// Phase 19 Plan 01 — Plugin-singleton widget registry (CONTEXT D-01).
//
// Map<`${file.path}::${fenceIndex}`, WidgetController> — one entry per mounted
// widget. Mirrors the v1.2 ChildEditorRegistry shape from
// src/main/childEditorRegistry.ts:19-114, but drops:
//   - LRU eviction (Plan 19-01 has no cache pressure ceiling — the state
//     persistence map handles bound; widget unmount eagerly deletes here)
//   - sync wiring side effects on delete (Plan 19-01 has no sync; Plan 19-02
//     wires debouncedWriter teardown through controller.destroy directly)
//
// flushAll() is a stub-friendly shape: in Plan 19-01 every controller's
// flushNow() is a no-op (no debouncedWriter yet). Plan 19-02 makes flushNow()
// drain pending writes; the registry contract here stays the same.

/**
 * Minimal contract every WidgetController must satisfy.
 * Plan 19-01: flushNow is a no-op stub; Plan 19-02 makes it drain the
 * debouncedWriter synchronously.
 */
export interface WidgetControllerLike {
  flushNow(): void;
  destroy(): void;
  file: { path: string };
}

export class WidgetRegistry {
  private readonly map = new Map<string, WidgetControllerLike>();

  /** Retrieve a controller by `${path}::${fenceIndex}` key. */
  get(key: string): WidgetControllerLike | undefined {
    return this.map.get(key);
  }

  /** Store a controller under the given key. Replaces any existing entry. */
  set(key: string, ctl: WidgetControllerLike): void {
    this.map.set(key, ctl);
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
    this.map.delete(key);
  }

  /** Iterate every registered controller and invoke `flushNow()` on each.
   *  Called from Plugin.onunload, beforeunload, leaf-change, etc. (Plan 19-02
   *  wires these hooks; Plan 19-01 only ships the contract). */
  flushAll(): void {
    for (const ctl of this.map.values()) {
      ctl.flushNow();
    }
  }

  /** Iterate every registered controller, invoke `destroy()`, then clear the
   *  map. Called from Plugin.onunload as the final teardown step. */
  destroyAll(): void {
    for (const ctl of this.map.values()) {
      ctl.destroy();
    }
    this.map.clear();
  }

  /** Iterate every controller whose stored file path matches and flush each.
   *  Used by `vault.on('rename')` to drain in-flight writes BEFORE the path
   *  change lands (the Plan 19-02 hook). */
  flushFile(filePath: string): void {
    for (const ctl of this.map.values()) {
      if (ctl.file.path === filePath) ctl.flushNow();
    }
  }

  /** Current entry count. Used by tests; not part of the public hot path. */
  get size(): number {
    return this.map.size;
  }
}
