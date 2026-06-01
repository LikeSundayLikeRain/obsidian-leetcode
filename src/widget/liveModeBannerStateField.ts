// src/widget/liveModeBannerStateField.ts
//
// Phase 21 Plan 21-11 Task 2 (GREEN) — Live-Preview decoration hosts.
//
// Two separate StateFields, both providing line-break-spanning
// Decoration.replace ranges that CM6 forbids when supplied via a
// ViewPlugin's `decorations` field. CM6's contract: line-break-spanning
// Decoration.replace MUST come from a StateField (transaction-time), not
// a ViewPlugin (build-time). Plan 21-11 Task 1 investigation
// (.planning/phases/21-v1-2-migration/21-11-INVESTIGATION.md)
// confirmed BOTH the v1.2 banner and the v1.3 widget construct violate
// the contract symmetrically. The v1.3 path escapes in production only
// because Obsidian's `registerMarkdownCodeBlockProcessor('leetcode-solve',
// …)` registration pre-folds the fence body before CM6 evaluates the
// line-break-span condition. To eliminate the bug class entirely, both
// paths now flow through StateFields here.
//
// SCOPE = "fix both" (per 21-11-INVESTIGATION.md scope decision):
//   - legacyBannerStateField (v1.2 scaffolding, marker block-commented
//     immediately above its export) — Phase 22 deletes this StateField,
//     its build helper, and the corresponding Extension entry.
//   - leetCodeWidgetStateField (permanent v1.3 path, NO marker) — stays
//     forever. Replaces the leetcode-solve branch the ViewPlugin used
//     to build inline.
//
// PLUGIN HOST RESOLUTION — the StateFields run host-aware logic
// (settings.getUseInlineWidget(), metadataCache.getFileCache(), etc.).
// The host is published via a `pluginHostFacet` so the StateFields can
// be defined once at module level (top-level `export const`) and still
// reach the live host at update time. The factory
// `leetCodeFenceStateFields(plugin)` returns an Extension array that
// installs the StateFields PLUS the Facet contribution that names the
// host. Without the facet contribution the StateFields gracefully
// degrade to Decoration.none — a defensible fallback for tests / partial
// initialisation paths.
//
// SECURITY / TRUST BOUNDARY notes (T-21-11-01..05 in plan threat-model):
//   - CM6 transaction → StateField: each StateField update fires only on
//     docChanged; CM6's contract permits line-break-spanning replace
//     from this host.
//   - StateField → EditorView.decorations Facet: the `provide` hook
//     publishes the field's DecorationSet. CM6 unions all contributors.
//     The two StateFields are mutually exclusive per fence.kind (legacy
//     or leetcode-solve, never both), so range overlap is impossible.
//   - StateField → EditorView.atomicRanges Facet: same `provide` hook
//     contributes to atomicRanges. The parent cursor cannot enter
//     either widget range.

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Facet,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { editorInfoField, type Plugin, type TFile } from 'obsidian';
import { findCodeFence, extractFenceBody, computeFenceIndex } from './fenceLocator';
import { LeetCodeFenceWidget } from './LeetCodeFenceWidget';
import { djb2 } from './hash';
import type { WidgetMountHost } from './WidgetController';
import { migrateLegacyFenceIfNeeded } from './fenceMigrator';
import { mountLegacyFenceBanner } from './legacyFenceBanner';

/**
 * Plugin host shape consumed by both StateFields. Identical to the
 * pre-Plan-21-11 host shape used by leetCodeFenceViewPlugin.
 */
export type StateFieldPluginHost = Plugin & WidgetMountHost & {
  settings: WidgetMountHost['settings'] & {
    getUseInlineWidget?(): boolean;
    getAutoMigrateOnOpen?(): boolean;
    getDefaultLanguage?(): string;
  };
  migrateInFlight: Set<string>;
};

/**
 * Facet that publishes the plugin host to the StateFields below. The
 * factory `leetCodeFenceStateFields(plugin)` populates this facet via
 * `pluginHostFacet.of(plugin)`. StateFields that need host access read
 * the facet on every update. When the facet is unpopulated the
 * StateFields fall through to Decoration.none.
 */
const pluginHostFacet = Facet.define<StateFieldPluginHost, StateFieldPluginHost | null>({
  combine: (values) => values[0] ?? null,
});

function readHost(state: EditorState): StateFieldPluginHost | null {
  return state.facet(pluginHostFacet);
}

/**
 * Phase 21 Plan 21-11 — Decoration.replace widget that mounts the
 * AutoMigratingBanner DOM during the migration window.
 */
class AutoMigratingBannerWidget extends WidgetType {
  constructor(
    private readonly plugin: StateFieldPluginHost,
    private readonly file: TFile,
    private readonly source: string,
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const host = document.createElement('div');
    host.classList.add('leetcode-migration-banner-host');
    mountLegacyFenceBanner(
      host,
      this.source,
      this.file,
      this.plugin as Parameters<typeof mountLegacyFenceBanner>[3],
      'auto-migrating',
    );
    return host;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof AutoMigratingBannerWidget &&
      other.file.path === this.file.path
    );
  }
}

/**
 * Phase 21 Plan 21-11 — Decoration.replace widget that mounts the
 * manual-prompt banner. Used when autoMigrateOnOpen=OFF.
 */
class ManualPromptBannerWidget extends WidgetType {
  constructor(
    private readonly plugin: StateFieldPluginHost,
    private readonly file: TFile,
    private readonly source: string,
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    const host = document.createElement('div');
    host.classList.add('leetcode-migration-banner-host');
    mountLegacyFenceBanner(
      host,
      this.source,
      this.file,
      this.plugin as Parameters<typeof mountLegacyFenceBanner>[3],
      'manual-prompt',
    );
    return host;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ManualPromptBannerWidget &&
      other.file.path === this.file.path
    );
  }
}

function isInlineWidgetEnabled(plugin: StateFieldPluginHost): boolean {
  return plugin.settings?.getUseInlineWidget?.() !== false;
}

function isAutoMigrateEnabled(plugin: StateFieldPluginHost): boolean {
  return plugin.settings?.getAutoMigrateOnOpen?.() === true;
}

/**
 * Build the legacy-banner DecorationSet. Mirrors the Plan 21-02 Task 3
 * legacy-kind branch of buildLeetCodeFenceRanges (formerly at
 * src/widget/liveModeViewPlugin.ts:160-208). Returns Decoration.none for
 * any state where the legacy banner should not mount (no host registered,
 * no file, no lc-slug, useInlineWidget=OFF, fence kind != legacy).
 *
 * autoMigrateOnOpen=ON  → AutoMigratingBannerWidget (silent, fire-and-
 *                         forget migration)
 * autoMigrateOnOpen=OFF → ManualPromptBannerWidget  (banner with
 *                         [Migrate now] button)
 */
function buildLegacyBannerDecorations(state: EditorState): DecorationSet {
  const plugin = readHost(state);
  if (!plugin) return Decoration.none;
  const file = state.field(editorInfoField, false)?.file as TFile | null | undefined;
  if (!file) return Decoration.none;
  if (!isInlineWidgetEnabled(plugin)) return Decoration.none;

  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return Decoration.none;
  }

  // Plan 21-11 — legacy banner uses the DEFAULT first-fence behavior
  // (NOT preferLeetCodeSolve) so we detect the legacy fence at all. The
  // preferLeetCodeSolve flag actively skips legacy fences and would
  // hide the very thing this StateField needs to mount on.
  const fence = findCodeFence(state, {});
  if (!fence) return Decoration.none;
  if (fence.kind !== 'legacy') return Decoration.none;

  const legacyFrom = state.doc.line(fence.openerLine).from;
  const legacyTo = state.doc.line(fence.closerLine).to;
  const legacySource = extractFenceBody(state, fence);

  const widget = isAutoMigrateEnabled(plugin)
    ? new AutoMigratingBannerWidget(plugin, file, legacySource)
    : new ManualPromptBannerWidget(plugin, file, legacySource);

  // autoMigrateOnOpen=ON also fires the migration as a side-effect
  // (matches the Plan 21-02 Task 3 fire-and-forget shape). Side-effects
  // inside StateField.create / update are unusual but acceptable here:
  // the side-effect is idempotent, gated through plugin.migrateInFlight,
  // and the StateField's pure return value (the DecorationSet) does NOT
  // depend on the side-effect result.
  if (isAutoMigrateEnabled(plugin)) {
    if (!plugin.migrateInFlight.has(file.path)) {
      plugin.migrateInFlight.add(file.path);
      void migrateLegacyFenceIfNeeded(
        plugin.app as Parameters<typeof migrateLegacyFenceIfNeeded>[0],
        file,
        {
          autoMigrateOnOpen: true,
          defaultLanguage: plugin.settings.getDefaultLanguage?.() ?? 'python3',
        },
      )
        .catch(() => {
          // Pattern S-05 silent-on-failure.
        })
        .finally(() => {
          plugin.migrateInFlight.delete(file.path);
        });
    }
  }

  return Decoration.set([
    Decoration.replace({ widget }).range(legacyFrom, legacyTo),
  ]);
}

/**
 * Build the leetcode-solve widget DecorationSet. Mirrors the v1.3 branch
 * of buildLeetCodeFenceRanges (formerly src/widget/liveModeViewPlugin.ts
 * :213-232).
 */
function buildLeetCodeWidgetDecorations(state: EditorState): DecorationSet {
  const plugin = readHost(state);
  if (!plugin) return Decoration.none;
  const file = state.field(editorInfoField, false)?.file as TFile | null | undefined;
  if (!file) return Decoration.none;

  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return Decoration.none;
  }

  const fence = findCodeFence(state, { preferLeetCodeSolve: true });
  if (!fence) return Decoration.none;
  if (fence.kind !== 'leetcode-solve') return Decoration.none;

  const from = state.doc.line(fence.openerLine).from;
  const to = state.doc.line(fence.closerLine).to;
  const source = extractFenceBody(state, fence);

  const fileText = state.doc.toString();
  const openerLine0 = fence.openerLine - 1;
  const fenceIndex = computeFenceIndex(fileText, openerLine0);
  const sourceHash = djb2(source);

  return Decoration.set([
    Decoration.replace({
      widget: new LeetCodeFenceWidget(plugin, file, fenceIndex, sourceHash, source),
    }).range(from, to),
  ]);
}

// PHASE_22_DELETE_WITH_V1_2_PATH — legacyBannerStateField is v1.2
// scaffolding for the migration banner. Phase 22 must delete this
// StateField, its build helper buildLegacyBannerDecorations, and the
// `legacyBannerStateField` entry in leetCodeFenceStateFields() below.
// The sibling leetCodeWidgetStateField is the permanent v1.3 path and
// MUST be preserved.
export const legacyBannerStateField = StateField.define<DecorationSet>({
  create: (state) => buildLegacyBannerDecorations(state),
  update: (value, tr) => {
    if (!tr.docChanged) return value;
    return buildLegacyBannerDecorations(tr.state);
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    EditorView.atomicRanges.of((view) => view.state.field(f, false) ?? Decoration.none),
  ],
});

// (No marker — permanent v1.3 path.)
export const leetCodeWidgetStateField = StateField.define<DecorationSet>({
  create: (state) => buildLeetCodeWidgetDecorations(state),
  update: (value, tr) => {
    if (!tr.docChanged) return value;
    return buildLeetCodeWidgetDecorations(tr.state);
  },
  provide: (f) => [
    EditorView.decorations.from(f),
    EditorView.atomicRanges.of((view) => view.state.field(f, false) ?? Decoration.none),
  ],
});

/**
 * Factory that returns the Extension array installing both StateFields
 * PLUS the plugin-host facet contribution. Consumers (the Live Preview
 * factory `leetCodeFenceViewPlugin`) include this in the combined
 * Extension array BEFORE the ViewPlugin so CM6's transaction-time
 * StateField evaluation runs before the ViewPlugin's update().
 *
 * Combined Extension shape (from leetCodeFenceViewPlugin):
 *   [
 *     ...leetCodeFenceStateFields(plugin),  // legacy + v1.3 StateFields + facet
 *     ViewPlugin.define(...)                // retains migration trigger + parent→child sync
 *   ]
 */
export function leetCodeFenceStateFields(
  plugin: StateFieldPluginHost,
): Extension[] {
  return [
    pluginHostFacet.of(plugin),
    legacyBannerStateField,
    leetCodeWidgetStateField,
  ];
}
