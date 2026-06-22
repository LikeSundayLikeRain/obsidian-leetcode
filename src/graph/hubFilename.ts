// src/graph/hubFilename.ts
//
// Pure home of `sanitizeHubFilename`, extracted (quick-260622-gkp) from
// ClusterHubWriter so the pure `mergeTechniquesSection` module can consume it
// without inheriting an obsidian dependency. This module imports NOTHING —
// keeping it zero-dependency is what preserves mergeTechniquesSection's purity
// contract.

/**
 * Make a pattern DISPLAY name safe to use as a filesystem filename segment.
 *
 * A "/" in a pattern name (e.g. the seed "Heap / Priority Queue") is a path
 * separator: passing it straight to `vault.create` silently fails because the
 * "Patterns/Heap " parent folder doesn't exist, orphaning the whole cluster.
 * This strips path separators, the Windows-reserved characters, and ASCII
 * control chars, replacing each with a single space, then collapses runs and
 * trims. The DISPLAY name is kept intact for note content; only the filename
 * segment passes through here.
 *
 * Examples:
 *   'Heap / Priority Queue' -> 'Heap Priority Queue'
 *   'A:B*C'                 -> 'A B C'
 * Idempotent.
 */
export function sanitizeHubFilename(name: string): string {
  return name
    // eslint-disable-next-line no-control-regex -- intentional: strip path separators, reserved + ASCII control chars from a filename segment
    .replace(/[/\\:*?"<>|\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
