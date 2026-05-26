// Phase 13 Plan 02 — Nested Editor Extension.
//
// CM6 StateField that produces:
//   1. CSS-hide line decorations on all fence lines (opener through closer)
//   2. A block widget containing the child EditorView (NestedEditorWidget)
//   3. A transactionFilter that redirects cursor out of the hidden zone
//      and focuses the child editor (D-06)
//
// Depends on:
//   - findCodeFence (from codeActionsEditorExtension.ts — SSoT for fence detection)
//   - ChildEditorRegistry (from childEditorRegistry.ts — Plan 01 output)
//   - createChildEditor (from childEditorFactory.ts — Plan 01 output)
//
// Lifecycle:
//   - Widget.toDOM() attaches child from registry or creates new via factory
//   - Widget.destroy() detaches child DOM but does NOT destroy the EditorView (D-13)
//   - True destruction only on LRU eviction, explicit file close, or plugin unload

// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  StateField,
  StateEffect,
  Transaction,
  RangeSetBuilder,
  EditorSelection,
  EditorState,
  type Extension,
} from '@codemirror/state';
// eslint-disable-next-line import/no-extraneous-dependencies -- transitive peer of obsidian; external in esbuild
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { editorInfoField, type Plugin } from 'obsidian';
import { findCodeFence } from './codeActionsEditorExtension';
import { ChildEditorRegistry } from './childEditorRegistry';
import { createChildEditor } from './childEditorFactory';
import { wireSyncIfNeeded, detectAndPropagateExternalChange } from './childEditorSync';

/**
 * Structural type for the plugin host required by this extension.
 * Minimal surface — only what buildNestedDecorations needs.
 *
 * Phase 16 — `settings.getIndentSizeOverride()` is read at decoration build
 * time so the child editor factory in 16-03 receives the user's current
 * indent override. The runtime LeetCodePlugin satisfies this via its
 * SettingsStore field.
 */
type PluginHost = Plugin & {
  childEditorRegistry: ChildEditorRegistry;
  app: {
    metadataCache: {
      getFileCache(file: { path: string }): { frontmatter?: Record<string, unknown> } | null;
    };
  };
  settings: {
    getIndentSizeOverride(): 'auto' | 2 | 4 | 8;
    getShowRelativeLineNumbers(): boolean;
  };
};

/**
 * NestedEditorWidget — block widget that mounts a child EditorView.
 *
 * Lifecycle contract (D-13):
 *   - eq() compares ONLY filePath (stable identity — prevents rebuild on doc edits)
 *   - toDOM() attaches child from registry or creates new via factory
 *   - destroy() detaches child DOM but keeps EditorView alive in registry
 *   - ignoreEvent() returns false (child receives all pointer/keyboard events)
 *
 * Phase 16 — Constructor accepts `initialSlug` + `indentOverride` so toDOM()
 * can pass them to `createChildEditor`. These two values are NOT part of the
 * widget's identity (eq() still compares filePath only): language switches go
 * through `languageCompartment.reconfigure(...)` in 16-04, not a widget
 * rebuild — so a stale slug carried by an old widget instance never reaches a
 * live editor. The slug/override only matters at INITIAL construction of a
 * brand-new child editor (registry miss path).
 */
export class NestedEditorWidget extends WidgetType {
  constructor(
    readonly filePath: string,
    readonly registry: ChildEditorRegistry,
    readonly fenceContent: string,
    readonly initialSlug: string,
    readonly indentOverride: 'auto' | 2 | 4 | 8,
    readonly app?: import('obsidian').App,
    readonly showRelativeLineNumbers: boolean = false,
  ) {
    super();
  }

  eq(other: NestedEditorWidget): boolean {
    // STABLE identity — only compare immutable file path (D-13)
    // Do NOT compare fenceContent (changes every edit, would cause rebuild)
    // Phase 16: do NOT compare initialSlug/indentOverride either — language
    // switches reconfigure the Compartment in-place; the widget keeps its
    // identity so the existing EditorView (with the new Compartment payload)
    // stays attached.
    return other.filePath === this.filePath;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    // Phase 17 Plan 10 round-3 (17-UAT.md Test 13 tag-mapping pass):
    // Many community themes (e.g., One Dark) override --code-keyword,
    // --code-variable, etc. via selectors scoped to `.HyperMD-codeblock`
    // (e.g., `.HyperMD-codeblock .cm-keyword { color: var(--purple); }`).
    // Adding HyperMD-codeblock to the child container lets those theme
    // overrides cascade to the child's CM6 spans, matching the visual
    // palette of Obsidian's native code-block rendering. The plugin's
    // own .lc-nested-editor rules in styles.css continue to apply.
    container.className = 'lc-nested-editor HyperMD-codeblock';

    // Get or create child EditorView from registry
    let childView = this.registry.get(this.filePath);
    if (!childView) {
      // Phase 16: pass initialSlug + indentOverride so the factory wires the
      // correct LanguageSupport at the moment of creation (no more "always
      // Python" debt from Phase 13).
      childView = createChildEditor(
        this.fenceContent,
        container,
        this.initialSlug,
        this.indentOverride,
        this.app,
        undefined,
        this.showRelativeLineNumbers,
      );
      this.registry.set(this.filePath, childView);
    } else {
      // Re-attach existing child DOM to new container
      container.appendChild(childView.dom);
      // Force geometry recalculation after reparenting (CM6 caches layout metrics)
      if (typeof childView.requestMeasure === 'function') childView.requestMeasure();
    }
    // Wire child→parent sync if not already wired (idempotent)
    wireSyncIfNeeded(view, childView, this.filePath, this.registry, this.app);
    return container;
  }

  destroy(dom: HTMLElement): void {
    // DETACH only — do NOT destroy the child EditorView (D-13)
    // The child lives in the registry until LRU eviction or plugin unload
    const childView = this.registry.get(this.filePath);
    if (childView && childView.dom.parentElement === dom) {
      dom.removeChild(childView.dom);
    }
  }

  get estimatedHeight(): number {
    // Approximate: lineCount * lineHeight. Better than -1.
    const lines = this.fenceContent.split('\n').length;
    return Math.max(lines * 20, 60); // 20px per line, minimum 60px
  }

  ignoreEvent(): boolean {
    // Let ALL events pass through to the child editor
    return false;
  }
}

/**
 * Extract the body text between fence opener and closer (exclusive of both).
 * Returns empty string if closerLine - openerLine <= 1 (empty fence).
 */
export function extractFenceBody(
  state: EditorState,
  fence: { openerLine: number; closerLine: number },
): string {
  if (fence.closerLine - fence.openerLine <= 1) return '';
  const from = state.doc.line(fence.openerLine + 1).from;
  const to = state.doc.line(fence.closerLine - 1).to;
  return state.doc.sliceString(from, to);
}

/**
 * Build the DecorationSet for the nested editor.
 *
 * Gates (all must pass):
 *   1. editorInfoField yields a file
 *   2. File's frontmatter contains non-empty `lc-slug` string
 *   3. findCodeFence(state) returns a valid fence
 *
 * When all gates pass: emit Decoration.line({ class: 'lc-fence-hidden' }) on
 * every line from openerLine to closerLine inclusive, plus a block widget
 * anchored at openerLine.to.
 */
export function buildNestedDecorations(
  state: EditorState,
  plugin: PluginHost,
  registry: ChildEditorRegistry,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  // Gate 1: file from editorInfoField
  const file = state.field(editorInfoField)?.file;
  if (!file) return builder.finish();

  // Gate 2: lc-slug frontmatter
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  const slug = fm?.['lc-slug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return builder.finish();
  }

  // Gate 3: code fence exists
  const fence = findCodeFence(state);
  if (!fence) return builder.finish();

  // Build decorations in sorted order (RangeSetBuilder requires ascending positions).
  // Opener line decoration (at openerLine.from) comes first,
  // then the block widget (at openerLine.to, side: 1),
  // then the remaining line decorations (openerLine+1 through closerLine).
  const hideLine = Decoration.line({ class: 'lc-fence-hidden' });
  const fenceContent = extractFenceBody(state, fence);

  // Phase 16: derive initialSlug from lc-language frontmatter (canonical LC
  // slug — set by the chevron; written by the plugin) with a defensive
  // fallback to 'python3'. Read indentOverride from the SettingsStore so the
  // factory wires the correct indent unit at creation time.
  // `fm` was already narrowed indirectly by the slug guard above (slug came
  // from fm and is a non-empty string), but TS does not propagate that
  // narrowing — keep the optional chain for type safety.
  const lcLang = fm?.['lc-language'];
  const initialSlug = typeof lcLang === 'string' && lcLang.length > 0 ? lcLang : 'python3';
  const indentOverride = plugin.settings.getIndentSizeOverride();
  const showRelativeLineNumbers = plugin.settings.getShowRelativeLineNumbers();

  // 1. Opener line-hide
  builder.add(state.doc.line(fence.openerLine).from, state.doc.line(fence.openerLine).from, hideLine);

  // 2. Block widget anchored at opener line end (side: 1 = renders after)
  const anchor = state.doc.line(fence.openerLine).to;
  builder.add(anchor, anchor, Decoration.widget({
    widget: new NestedEditorWidget(file.path, registry, fenceContent, initialSlug, indentOverride, plugin.app, showRelativeLineNumbers),
    block: true,
    side: 1,
  }));

  // 3. Remaining line-hide decorations (body + closer)
  for (let i = fence.openerLine + 1; i <= fence.closerLine; i++) {
    builder.add(state.doc.line(i).from, state.doc.line(i).from, hideLine);
  }

  return builder.finish();
}

// ────────────────────────────────────────────────────────────────────────
// Echo-prone userEvents — explicit skip-list for parent→child mirroring
// ────────────────────────────────────────────────────────────────────────
//
// The parent's `externalChangeListener` (below) calls
// `detectAndPropagateExternalChange` to mirror parent fence-body edits into
// the child EditorView. Some `'leetcode.*'` userEvents on the parent must NOT
// be propagated to the child:
//
//   - `'leetcode.child-sync'` — child→parent echo. Child already has the
//     content (it's the source); re-mirroring would clobber the child's
//     selection/cursor and could trip the syncAnnotation guard.
//   - `'leetcode.fence-repair'` — parent-side fence-marker repair. Re-inserts
//     missing ``` markers without changing the body content; the child has
//     no marker awareness and shouldn't observe these edits.
//
// All OTHER `'leetcode.*'` userEvents (notably `'leetcode.lang-switch'`,
// the chevron-driven language switch from Phase 16) DO carry parent-side
// body rewrites that the child must mirror. The Phase 14 broad-prefix gate
// silently dropped these (regression observed in
// `.planning/debug/chevron-switch-child-body-stale.md` — Java→Python switch
// flipped fence tag + child syntax highlight but left child body stale).
//
// Echo-loop defense for parent→child dispatches is independently provided
// by `syncAnnotation` (see `childEditorSync.ts:236` parent→child dispatch
// and `childEditorSync.ts:92` child sync echo guard) — narrowing this gate
// does NOT introduce a new echo path.
const ECHO_PRONE_USER_EVENTS = new Set([
  'leetcode.child-sync',
  'leetcode.fence-repair',
]);

/**
 * Build the complete nested editor CM6 extension.
 *
 * Returns [StateField, transactionFilter]:
 *   - StateField: produces DecorationSet (CSS-hide lines + widget)
 *   - transactionFilter: redirects cursor out of hidden zone → child focus
 */
/**
 * Phase 18: dispatched on the parent CM6 when metadataCache populates
 * frontmatter for the first time (newly-created note, first open). Forces
 * the nested-editor StateField to rebuild decorations so the child widget
 * renders even when frontmatter wasn't available at StateField.create time.
 */
export const nestedEditorRebuildEffect = StateEffect.define<null>();

export function buildNestedEditorExtension(plugin: PluginHost): Extension {
  const registry = plugin.childEditorRegistry;

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildNestedDecorations(state, plugin, registry);
    },
    update(old, tr) {
      // Phase 17 gap-closures (17-07 / 17-UAT.md Issue 1, plus the Reset full-body
      //  replace edge case found 2026-05-24): any docChanged transaction must
      //  rebuild decorations from the post-state. RangeSet.map(tr.changes) only
      //  shifts existing decoration positions; it does NOT extend lc-fence-hidden
      //  coverage when fence body bounds change (line-count delta or full-body
      //  replace). Always rebuild on docChanged — the cost is bounded by
      //  buildNestedDecorations' three gates (file/slug/fence) and a per-line
      //  RangeSetBuilder.add for the fence span. Reconfigure also triggers
      //  rebuild so re-mounted extensions pick up fresh fence boundaries.
      if (tr.docChanged || tr.reconfigured ||
          tr.effects.some((e) => e.is(nestedEditorRebuildEffect))) {
        return buildNestedDecorations(tr.state, plugin, registry);
      }
      return old.map(tr.changes);
    },
    provide(f) {
      return EditorView.decorations.from(f);
    },
  });

  // CR-03 fix: detect external fence-body changes via updateListener (side-effect-safe)
  // instead of inside StateField.update() which must be pure.
  //
  // chevron-switch-child-body-stale fix (2026-05-22): previously this gate
  // skipped ALL `'leetcode.*'` userEvents, which over-blocked the Phase 16
  // chevron-driven `'leetcode.lang-switch'` parent dispatch — child body
  // was left stale until app reload. Now we skip ONLY echo-prone events
  // (see ECHO_PRONE_USER_EVENTS); all other parent-side `'leetcode.*'`
  // dispatches with body changes flow through to detectAndPropagateExternalChange.
  // Echo-loop defense for parent→child dispatches is provided by
  // syncAnnotation (childEditorSync.ts) — independent of userEvent gating.
  const externalChangeListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    const ev = update.transactions[0]?.annotation(Transaction.userEvent);
    if (ev && ECHO_PRONE_USER_EVENTS.has(ev)) return;
    for (const tr of update.transactions) {
      if (tr.docChanged) {
        detectAndPropagateExternalChange(tr, plugin, registry);
        break;
      }
    }
  });

  const transactionFilter = EditorState.transactionFilter.of((tr) => {
    if (!tr.selection) return tr;

    // Gate: only on lc-slug notes
    const file = tr.startState.field(editorInfoField)?.file;
    if (!file) return tr;
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const slug = fm?.['lc-slug'];
    if (typeof slug !== 'string' || slug.length === 0) return tr;

    // Only snap on collapsed cursor (not text selections)
    const sel = tr.selection;
    if (!sel.ranges.every(r => r.head === r.anchor)) return tr;

    const fence = findCodeFence(tr.state);
    if (!fence) return tr;

    const fenceFrom = tr.state.doc.line(fence.openerLine).from;
    const fenceTo = tr.state.doc.line(fence.closerLine).to;
    const head = sel.main.head;

    if (head >= fenceFrom && head <= fenceTo) {
      // Cursor landed in hidden fence zone — redirect to child
      const childView = registry.get(file.path);
      if (childView) {
        // Defer focus to next microtask (avoid re-entrancy in filter)
        queueMicrotask(() => childView.focus());
      }
      // Snap cursor: if coming from above, go to just before fence;
      // if from below, go to just after fence.
      const prevHead = tr.startState.selection.main.head;
      const snapTarget = prevHead < fenceFrom
        ? Math.max(0, fenceFrom - 1)
        : Math.min(tr.state.doc.length, fenceTo + 1);
      return {
        ...tr,
        selection: EditorSelection.cursor(snapTarget),
      };
    }
    return tr;
  });

  return [field, transactionFilter, externalChangeListener];
}
