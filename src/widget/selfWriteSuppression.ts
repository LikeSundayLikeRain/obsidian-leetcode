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
//
// Phase 20 Plan 20-09: the dual-hash arm + peekExpectedHash + peekMap
// added in Plan 20-06 retired with the typing-path vault.process retire.
// The class collapses back to its single-hash sha1-only shape.
//
// WR-01 (review-fix) — current callers of arm():
//   - DebouncedWriter.flush (the editable-widget typing-path: arms
//     before vault.process so the modify-handler echo is absorbed)
//   - chevron/`copyToCode` body-swap rewrite (Plan 20-09 Task 6)
//   - conflict-modal trigger (Plan 20-03)
// And tryConsume() is invoked from main.ts vault.on('modify') step (c)
// (BL-04 review-fix). The previous "single remaining caller of arm()"
// commentary lied because the modify-handler tryConsume was deleted
// while DebouncedWriter still armed entries — leaking the map. BL-04
// restored tryConsume; this comment now reflects the live wiring.

interface SuppressionEntry {
  expectedHash: string;
  expiresAt: number;
}

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
