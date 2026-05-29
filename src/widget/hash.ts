// Phase 19 Plan 04 — synchronous identity hash for WidgetType.eq() per
// RESEARCH Pitfall 19-F.
//
// The widget's eq() identity uses (filePath, fenceIndex, sourceHash) where
// sourceHash is a small synchronous non-cryptographic hash. The Live Preview
// ViewPlugin computes this BEFORE constructing each widget on every CM6
// rebuild — no async / SubtleCrypto; it must be sync to fit ViewPlugin
// update() semantics.
//
// IMPORTANT — TWO DIFFERENT HASHES IN THIS PHASE:
//   1. `djb2(s)` — synchronous identity hash (this file). Used by
//      LeetCodeFenceWidget.eq(). Non-cryptographic; collision rate
//      acceptable because eq() always falls back to a remount on
//      cross-instance hash mismatch (worst case: a remount of an
//      unchanged widget, which the state-persistence map handles).
//   2. `sha1(s)` — SHA-1 (in src/widget/debouncedWriter.ts). Used by the
//      self-write suppression map. SHA-1 because we need cryptographic
//      collision resistance — a hash collision between two different fence
//      bodies would let an external write be misidentified as a self-write,
//      breaking external-edit reconciliation.
//
// DO NOT conflate these. The collision properties + sync requirement
// genuinely diverge.

/**
 * Compute a stable 8-char hex hash of a string via djb2 (32-bit unsigned).
 * Identical inputs produce identical 8-char hex strings deterministically.
 *
 * Hot path — the Live Preview ViewPlugin calls this once per fence on every
 * docChanged | viewportChanged update. Tight loop, no allocations besides
 * the final string conversion.
 */
export function djb2(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
