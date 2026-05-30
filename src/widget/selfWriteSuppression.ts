// Phase 19 Plan 02 — Per-path content-hash self-write suppression map.
//
// CONTEXT C-04 + RESEARCH Pattern 2 + Pitfall 19-A:
//   - Per-path hash entry with 2s TTL — NOT a boolean flag (boolean is
//     provably broken under concurrent multi-file flushes per PITFALLS P1).
//   - arm() is called inside DebouncedWriter.flush() BEFORE vault.process,
//     with the hash of the future fence body (post-rewriteFenceBody).
//   - tryConsume() is called from main.ts vault.on('modify') handler with
//     the hash of the observed disk fence body. Three outcomes:
//       'consumed' — self-write echo, drop silently (no widget reload)
//       'stale'    — entry expired before consume; treat as external
//       'miss'     — no entry, OR hash mismatch within TTL (race —
//                    defensive delete preserves the external-edit semantics)
//
// Defensive delete on hash mismatch is what handles the
// vault.read↔vault.process race (RESEARCH §1 fail-safe): if an external
// write landed between read and process, the observed hash differs from
// the armed hash; treating that as 'miss' (and dropping the entry) means
// we'd rather miss our own write than swallow an external one.

interface SuppressionEntry {
  expectedHash: string;
  expiresAt: number;
}

// Phase 20 Plan 20-06 — this map is now consumed by TWO observers:
//   - vault.on('modify') handler: tryConsume() — consumes entries on
//     match; the modify-handler's decision tree branches on the result.
//   - liveModeViewPlugin.update(): peekExpectedHash() — read-only peek
//     so the parent-CM6 transaction stream can detect self-write echoes
//     and skip the ViewPlugin rebuild that would otherwise destroy+remount
//     the widget's DOM (root cause of self-write-remount-cycle gap,
//     UAT Test 6 / .planning/debug/self-write-remount-cycle.md).
export class SelfWriteSuppression {
  private readonly map = new Map<string, SuppressionEntry>();
  private readonly TTL_MS = 2000;

  /** Arm a per-path entry. Subsequent tryConsume calls with the matching
   *  hash will return 'consumed' (self-write); calls past the 2s TTL return
   *  'stale'. Replaces any existing entry for this path. */
  arm(path: string, expectedHash: string): void {
    this.map.set(path, {
      expectedHash,
      expiresAt: Date.now() + this.TTL_MS,
    });
  }

  /** Attempt to consume a suppression entry. Always deletes the entry on
   *  any non-'miss' (or any hash-mismatch) outcome — the entry's purpose is
   *  one-shot self-write echo suppression. */
  tryConsume(path: string, observedHash: string): 'consumed' | 'stale' | 'miss' {
    const entry = this.map.get(path);
    if (!entry) return 'miss';
    if (Date.now() > entry.expiresAt) {
      this.map.delete(path);
      return 'stale';
    }
    if (entry.expectedHash === observedHash) {
      this.map.delete(path);
      return 'consumed';
    }
    // Hash mismatch within TTL — race: an external write landed between
    // arm() and the modify event. Drop entry defensively and treat as
    // external (RESEARCH Pattern 2 lines 232-237).
    this.map.delete(path);
    return 'miss';
  }

  /** Phase 20 Plan 20-06 — read-only peek for the CM6 ViewPlugin
   *  provenance check (`liveModeViewPlugin.ts`). Returns the armed
   *  expected hash for `path` if an entry exists and has not expired;
   *  returns `null` otherwise. Does NOT mutate the map — neither
   *  consume nor lazy-evict on stale. The ViewPlugin's `update()` runs
   *  on every parent CM6 transaction and must NOT race the
   *  vault.on('modify') consume — peek leaves the entry intact for the
   *  modify handler to consume on its own schedule. */
  peekExpectedHash(path: string): string | null {
    const entry = this.map.get(path);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null; // Stale — not consumed; tryConsume will lazy-evict.
    return entry.expectedHash;
  }

  /** Drain the map. Called by Plugin.onunload. */
  clear(): void {
    this.map.clear();
  }

  /** Remove a specific path's entry. Called by vault.on('rename') re-keying
   *  and recovery scenarios. */
  clearForPath(path: string): void {
    this.map.delete(path);
  }

  /** Test-only / debugging — current entry count. */
  get size(): number {
    return this.map.size;
  }
}
