// Plan 21-17 — modify-handler peer-sync routing decision (pure helper).
//
// Extracted from main.ts vault.on('modify') so the routing logic is unit-
// testable without spinning up a full Plugin instance + workspace + vault.
//
// Decision tree (per main.ts modify handler — Plan 21-17 step (c)):
//
//   consumeResult === 'consumed' (self-write echo confirmed):
//     - originatingRegistryKey is non-null AND ≥2 editable controllers on path:
//       → 'peer-fan-out': skip originator, apply-peer-sync to each peer.
//       → embed/readOnly controllers are filtered to 'skip-embed-or-readonly'.
//     - else (single editable controller OR null originator):
//       → 'single-pane-consumed': existing silent return.
//
//   consumeResult === 'stale' | 'miss' (NOT a self-write echo — external):
//     → 'reload-silent': existing reloadFromDisk('silent') path UNCHANGED.
//
// The helper is pure — no I/O, no side effects. main.ts invokes the
// per-controller methods (applyPeerSync / reloadFromDisk) based on the
// decision returned here.

/** Minimal structural shape of a controller usable by the routing helper.
 *  Real `WidgetController` instances satisfy this contract; mock objects in
 *  unit tests can implement it without owning a real EditorView. */
export interface PeerSyncControllerLike {
  registryKey: string;
  filePath: string;
  isEmbed: boolean;
  readOnly: boolean;
}

export interface PeerSyncRouteInput {
  filePath: string;
  /** Originator registryKey from selfWriteSuppression.peekOriginator(path).
   *  null means no entry was armed (external edit) OR the entry was armed
   *  without a registryKey (legacy 2-arg arm). */
  originatingRegistryKey: string | null;
  /** Result of selfWriteSuppression.tryConsume(path, observedHash). */
  consumeResult: 'consumed' | 'stale' | 'miss';
  /** Controllers visible to the routing decision.
   *
   *  WR-06 (Phase 21 cycle-2 review-fix) — contract: callers MAY pass any
   *  superset of controllers (the entire registry is acceptable). The
   *  helper filters by `filePath` internally; callers do NOT need to
   *  pre-filter and SHOULD NOT rely on a pre-filtered shape (the
   *  decision tree depends on the post-filter view). The current
   *  main.ts call site happens to pre-filter via `allMatching`; this is
   *  redundant but harmless. A future caller passing the entire registry
   *  directly remains correct. */
  controllers: PeerSyncControllerLike[];
}

export type PerControllerAction =
  | 'apply-peer-sync'
  | 'skip-originator'
  | 'skip-embed-or-readonly';

export type PeerSyncDecision =
  | { kind: 'reload-silent' }
  | { kind: 'single-pane-consumed' }
  | {
      kind: 'peer-fan-out';
      perController: Array<{ registryKey: string; action: PerControllerAction }>;
    };

/**
 * Pure routing decision for the modify-handler peer-sync fan-out.
 *
 * Returns:
 *   - { kind: 'reload-silent' } — external edit (consumeResult !== 'consumed').
 *     main.ts continues with the existing reloadFromDisk('silent') path on
 *     the first matching widget (preserves R8 byte-identically).
 *   - { kind: 'single-pane-consumed' } — self-write echo with no peer to
 *     fan out to (single editable controller OR null originator). main.ts
 *     returns silently (existing behavior).
 *   - { kind: 'peer-fan-out', perController } — self-write echo with ≥2
 *     editable controllers AND a known originator. main.ts iterates
 *     `perController` and invokes the per-controller method:
 *       'apply-peer-sync' → ctl.applyPeerSync(observedBody)
 *       'skip-originator' → no-op (originator's caret is already correct)
 *       'skip-embed-or-readonly' → no-op (embed/read-only widgets do not
 *           need cursor preservation in the same sense; they are excluded
 *           from peer fan-out by design — Plan 21-17 must_haves).
 */
export function routePeerSync(input: PeerSyncRouteInput): PeerSyncDecision {
  const { filePath, originatingRegistryKey, consumeResult, controllers } = input;

  // External edit — Plan 21-17 leaves the existing reload path unchanged.
  if (consumeResult !== 'consumed') {
    return { kind: 'reload-silent' };
  }

  // Filter to controllers on this file path.
  const sameFile = controllers.filter((c) => c.filePath === filePath);
  // Editable peers (excluding embed and readOnly).
  const editableSameFile = sameFile.filter((c) => !c.isEmbed && !c.readOnly);

  // Single-pane self-write echo: no peer to update; existing silent return.
  if (editableSameFile.length < 2 || originatingRegistryKey === null) {
    return { kind: 'single-pane-consumed' };
  }

  // WR-04 (Phase 21 cycle-2 review-fix) — registry race: the originator's
  // registryKey was armed in selfWriteSuppression but is NOT present among
  // the same-file controllers (file rename mid-typing, plugin reload mid-
  // flush, originator unregistered between arm() and the modify event
  // firing). Without this guard the helper falls into 'peer-fan-out' and
  // produces a perController list where NO entry has 'skip-originator';
  // every editable peer (including the phantom whose registryKey changed)
  // would receive apply-peer-sync. Treat as external — defer to the
  // existing reload-silent path so the conflict modal / hash mismatch
  // fail-safe handles the divergence.
  const originatorPresent = sameFile.some(
    (c) => c.registryKey === originatingRegistryKey,
  );
  if (!originatorPresent) {
    return { kind: 'reload-silent' };
  }

  // Peer fan-out: classify every same-file controller. Originator is skipped;
  // embed/readOnly are skipped. Other editable controllers receive
  // apply-peer-sync.
  const perController = sameFile.map((c) => {
    let action: PerControllerAction;
    if (c.registryKey === originatingRegistryKey) {
      action = 'skip-originator';
    } else if (c.isEmbed || c.readOnly) {
      action = 'skip-embed-or-readonly';
    } else {
      action = 'apply-peer-sync';
    }
    return { registryKey: c.registryKey, action };
  });

  return { kind: 'peer-fan-out', perController };
}
