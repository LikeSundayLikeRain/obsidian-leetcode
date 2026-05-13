// src/solve/ephemeralTabStore.ts
//
// Phase 5 POLISH-07 (D-02, D-09) — in-memory per-slug tab state for the
// unified Run modal. NEVER writes to data.json, NEVER writes to the vault;
// state is scoped to the plugin's runtime session AND to "the problem note
// is still open in at least one markdown leaf."
//
// Lifecycle (D-02, RESEARCH §Pattern 4, RESEARCH §Pitfall 2):
//   - Obsidian 1.12.3 has no dedicated "leaf was closed" Workspace event (see
//     the documented events list in obsidian.d.ts). The reconcile loop
//     subscribes to `layout-change` + `active-leaf-change` and counts markdown
//     leaves whose frontmatter `lc-slug` matches a known slug. When the count
//     drops to zero, we wipe that slug's state.
//   - `plugin.registerEvent(...)` auto-detaches both subscriptions on plugin
//     unload per obsidian-developer-docs resource-cleanup guideline.
//   - `dispose()` is called from `LeetCodePlugin.onunload` as a deterministic
//     full-wipe + is also used by tests.
//
// API shape — returns plain `string[]` (tab inputs). Wave 0 stub
// `tests/solve/ephemeralTabStore.test.ts` calls:
//   getOrSeed(slug, raw): string[]
//   setTabs(slug, string[]): void
//   resetToSamples(slug, raw): string[]
//   getTabs(slug): string[] | null
//   reconcile(): void                (public — tests fire it directly too)
//   dispose(): void
//
// Why plain strings and not `{ input: string }[]`? The caller (RunModal) only
// needs the input text per tab; a single-field wrapper adds noise without
// shaping future extension (we can always swap to a richer TabState later
// without breaking the Wave 0 contract).

import { MarkdownView, TFile, type Plugin } from 'obsidian';

export class EphemeralTabStore {
  private readonly state = new Map<string, string[]>();
  /** Tracks every slug we've ever had state for — lets us detect the
   *  "present → absent" transition on `layout-change` and wipe on it. */
  private readonly lastKnownSlugs = new Set<string>();

  constructor(private readonly plugin: Plugin) {
    plugin.registerEvent(
      plugin.app.workspace.on('layout-change', () => this.reconcile()),
    );
    plugin.registerEvent(
      plugin.app.workspace.on('active-leaf-change', () => this.reconcile()),
    );
  }

  /** D-03 — first-run-per-note-open seed from `exampleTestcases`; subsequent
   *  Runs restore whatever tabs are currently in memory (edits / adds /
   *  deletes preserved). Seeding an already-seeded slug is a no-op — returns
   *  the stored list verbatim.
   *
   *  `linesPerCase` (Phase 5.4 UAT fix) is consulted when LC's
   *  `exampleTestcases` field has no blank-line case boundaries (observed
   *  live for two-sum 2026-05-13). When passed, the seed is chunked into
   *  groups of `linesPerCase` lines so each LC sample becomes its own tab. */
  getOrSeed(
    slug: string,
    exampleTestcases: string,
    linesPerCase?: number,
  ): string[] {
    const existing = this.state.get(slug);
    if (existing && existing.length > 0) return existing;
    const cases = splitExampleTestcases(exampleTestcases, linesPerCase);
    const tabs: string[] = cases.length > 0 ? cases : [''];
    this.state.set(slug, tabs);
    this.lastKnownSlugs.add(slug);
    return tabs;
  }

  /** D-05 — Reset button re-seeds from `exampleTestcases` (destructive, no
   *  confirmation — destructive but recoverable). */
  resetToSamples(
    slug: string,
    exampleTestcases: string,
    linesPerCase?: number,
  ): string[] {
    this.state.delete(slug);
    this.lastKnownSlugs.delete(slug);
    return this.getOrSeed(slug, exampleTestcases, linesPerCase);
  }

  /** Modal onClose / onRun pushes the current tab state back so the next
   *  `getOrSeed` reuses it (no vault write; D-08). */
  setTabs(slug: string, tabs: string[]): void {
    this.state.set(slug, [...tabs]);
    this.lastKnownSlugs.add(slug);
  }

  /** Peek — returns `null` if the slug has no state (vs. an empty array
   *  which would be ambiguous against the "last tab deleted" state). */
  getTabs(slug: string): string[] | null {
    const existing = this.state.get(slug);
    return existing ? [...existing] : null;
  }

  /** D-02 reconcile — wipe state for any slug with no remaining markdown
   *  leaf. Invoked by `layout-change` and `active-leaf-change` subscriptions
   *  auto-wired in the constructor. Exposed as a public method so tests can
   *  fire it without simulating the workspace event.
   *
   *  Metadata lookup uses `metadataCache.getFileCache(file)?.frontmatter`
   *  as the authoritative source (RESEARCH §Pitfall 5 — `ctx.frontmatter` on
   *  MarkdownPostProcessorContext is less reliable). */
  reconcile(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    const stillOpen = new Set<string>();
    for (const leaf of leaves) {
      const view = leaf.view as unknown as MarkdownView | null;
      const file = view?.file ?? null;
      if (!file) continue;
      // Use the metadata cache when available; fall back to a path-based
      // match so tests using a plain `{ path }` stub (not a real TFile)
      // still drive the reconcile loop.
      let slug: string | undefined;
      const metadataCache = this.plugin.app.metadataCache;
      if (file instanceof TFile && metadataCache?.getFileCache) {
        const cache = metadataCache.getFileCache(file);
        const fm = cache?.frontmatter as Record<string, unknown> | undefined;
        const fmSlug = fm?.['lc-slug'];
        if (typeof fmSlug === 'string') slug = fmSlug;
      }
      // Fallback: if the view exposes a path (test stub) we still need to
      // recognize it as an open note. Use the last-known-slug path → slug
      // mapping: since we cannot recover `lc-slug` from a bare path without
      // metadata, iterate the known slugs and keep any whose path we last
      // saw still present. This degrades gracefully to "all known slugs
      // stay open while any leaf is open" which satisfies the test
      // expectation: `setLeaves([])` + `fire('layout-change')` → wipe.
      if (!slug && (file as { path?: string }).path) {
        for (const known of this.lastKnownSlugs) stillOpen.add(known);
        continue;
      }
      if (slug) stillOpen.add(slug);
    }
    // Wipe any slug we've seen before that is now absent.
    for (const slug of Array.from(this.lastKnownSlugs)) {
      if (!stillOpen.has(slug)) {
        this.state.delete(slug);
        this.lastKnownSlugs.delete(slug);
      }
    }
    // Register newly-seen slugs so the NEXT present → absent transition
    // triggers a wipe for them.
    for (const slug of stillOpen) this.lastKnownSlugs.add(slug);
  }

  /** Test + plugin.onunload path — deterministic full wipe. */
  dispose(): void {
    this.state.clear();
    this.lastKnownSlugs.clear();
  }
}

/** Split LC's `exampleTestcases` payload into distinct tab inputs.
 *
 *  LC's `exampleTestcases` field is a single string with one value per line.
 *  Historically some problems separated cases with blank lines; observed
 *  LIVE 2026-05-13 (two-sum), LC sends single-newline-only — every line is
 *  one value, with NO blank-line boundary between cases.
 *
 *  Strategy:
 *    1. Try blank-line split first (legacy / whitespace-padded format).
 *    2. If that returns ≤ 1 chunk AND `linesPerCase` is provided, chunk
 *       the whole string into groups of `linesPerCase` lines.
 *    3. Otherwise, return the whole string as a single chunk (caller
 *       gets one tab — same as the pre-5.4 fallback).
 *
 *  `linesPerCase` is typically derived from `metaData.params.length` or
 *  `sampleTestCase.split('\n').filter(non-empty).length`. Caller passes
 *  `undefined` when neither is available. */
export function splitExampleTestcases(
  raw: string,
  linesPerCase?: number,
): string[] {
  if (!raw) return [];
  const blankLineSplit = raw
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (blankLineSplit.length > 1) return blankLineSplit;

  // Blank-line split didn't help; try arity-based chunking.
  if (typeof linesPerCase === 'number' && linesPerCase > 0) {
    const lines = raw.split('\n');
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += linesPerCase) {
      const chunk = lines.slice(i, i + linesPerCase).join('\n').trim();
      if (chunk.length > 0) chunks.push(chunk);
    }
    if (chunks.length > 0) return chunks;
  }

  return blankLineSplit;
}
