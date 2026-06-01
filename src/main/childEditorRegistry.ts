// Phase 13 — Child EditorView lifecycle registry.
// LRU cache for child EditorView instances keyed by file path.
// Decouples child lifecycle from widget DOM destruction (D-13).

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import type { EditorView } from '@codemirror/view';
import { unwireSync } from './childEditorSync';

interface RegistryEntry {
  view: EditorView;
  lastAccess: number;
}

/**
 * LRU cache managing child EditorView instances.
 * When capacity is exceeded, the least-recently-accessed entry is evicted
 * and its EditorView is destroyed.
 */
export class ChildEditorRegistry {
  private readonly cache = new Map<string, RegistryEntry>();
  private readonly cap: number;
  private tick = 0;

  constructor(cap = 5) {
    this.cap = cap;
  }

  /**
   * Retrieve a cached EditorView by key. Updates lastAccess timestamp (LRU touch).
   * Returns undefined if key is not in the cache.
   */
  get(key: string): EditorView | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    entry.lastAccess = ++this.tick;
    return entry.view;
  }

  /**
   * Store an EditorView under the given key.
   * If the key already exists, the old view is destroyed and replaced.
   * If the cache is at capacity, the least-recently-accessed entry is evicted.
   */
  set(key: string, view: EditorView): void {
    // If key already exists, destroy old view before replacing
    const existing = this.cache.get(key);
    if (existing) {
      existing.view.destroy();
    }

    this.cache.set(key, { view, lastAccess: ++this.tick });

    // Evict if over capacity (only when key was new)
    if (!existing) {
      this.evictIfNeeded();
    }
  }

  /**
   * Remove and destroy the EditorView for the given key.
   * No-op if key does not exist.
   */
  delete(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    unwireSync(key);
    entry.view.destroy();
    this.cache.delete(key);
  }

  /**
   * Destroy all cached EditorViews and clear the registry.
   * Called on plugin unload.
   */
  destroyAll(): void {
    for (const entry of this.cache.values()) {
      entry.view.destroy();
    }
    this.cache.clear();
    unwireSync('__all__');
  }

  /** Check if a key exists in the cache. */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.cache.size;
  }

  /** Evict the least-recently-accessed entry if cache exceeds capacity. */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.cap) return;

    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      const entry = this.cache.get(oldestKey)!;
      unwireSync(oldestKey);
      entry.view.destroy();
      this.cache.delete(oldestKey);
    }
  }
}
